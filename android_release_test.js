// ============================================================================
// THE ANDROID RELEASE INPUTS ARE WHAT THE REPO SAYS THEY ARE
//
// Version, icon, launch theme, orientation and signing for android/. Each one
// is bound to the thing it must agree with - the iOS version literal, the
// manifest.json colours, the iOS orientation list, the .gitignore - rather
// than pinned to a number typed twice.
//
// THE ICON IS MEASURED, NOT LISTED. An adaptive icon is a 108dp layer of which
// launchers guarantee only the centre 66dp circle; icon-1024.png's mark reaches
// 489px from the centre of a canvas whose safe radius is 313px, so the raw art
// as a foreground loses the R's outer arm and the flag tip on a Pixel. The
// foreground is generated at 0.61x by tools/android-icons.js, and the test
// below DECODES the xxxhdpi layer and checks every mark pixel is inside the
// circle. A file-exists-and-is-432px check would pass the clipped one.
//
// SIGNING IS PROVEN ABSENT. No keystore exists in this repo and none may be
// created by it. The build reads keystore.properties only if the file exists,
// so a clone with no key still builds debug; the test checks the guard, the
// ignore rules, and that no key material is tracked.
//
// WHAT IS NOT PROVEN HERE: that Gradle builds. That is `./gradlew assembleDebug`,
// run by hand and recorded in the wave report; a test that shells out to Gradle
// would make npm test need a JDK.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');
const { readPng, pngSize, canvasColour } = require('./helpers/png.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(REPO_ROOT, f));
const RES = 'android/app/src/main/res/';
const GRADLE = read('android/app/build.gradle');
const MANIFEST = read('android/app/src/main/AndroidManifest.xml');
const PLIST = read('ios/App/App/Info.plist');
const PBX = read('ios/App/App.xcodeproj/project.pbxproj');
const WEB_MANIFEST = JSON.parse(read('manifest.json'));

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// ---------------------------------------------------------------------------
describe('VERSION', () => {

    test('versionName is the iOS MARKETING_VERSION - two literals, held equal', () => {
        // Versions are hardcoded per platform; nothing in the repo reads
        // package.json's. So the Android literal is bound to the iOS one, and a
        // bump on one side goes red until the other follows.
        const ios = [...PBX.matchAll(/MARKETING_VERSION = ([0-9.]+);/g)].map(m => m[1]);
        assert.ok(ios.length >= 1, 'the Xcode project declares no MARKETING_VERSION');
        assert.equal(new Set(ios).size, 1, 'the Xcode project carries two different marketing versions');
        const m = /versionName "([^"]+)"/.exec(GRADLE);
        assert.ok(m, 'build.gradle declares no versionName');
        assert.equal(m[1], ios[0], 'Android versionName ' + m[1] + ' != iOS MARKETING_VERSION ' + ios[0]);
        assert.equal(m[1], '1.0.0');
    });

    test('versionCode is its own sequence and starts at 1', () => {
        assert.match(GRADLE, /versionCode 1\b/, 'versionCode is not 1; the iOS build number is not this sequence');
    });
});

// ---------------------------------------------------------------------------
describe('LAUNCHER ICON', () => {

    test('every density has ic_launcher, ic_launcher_round and ic_launcher_foreground at the right size', () => {
        Object.entries(DENSITIES).forEach(([d, k]) => {
            const dir = RES + 'mipmap-' + d + '/';
            [['ic_launcher.png', 48], ['ic_launcher_round.png', 48], ['ic_launcher_foreground.png', 108]].forEach(([f, dp]) => {
                assert.ok(exists(dir + f), dir + f + ' is missing');
                const s = pngSize(path.join(REPO_ROOT, dir + f));
                assert.deepEqual([s.width, s.height], [dp * k, dp * k], dir + f + ' is ' + s.width + 'x' + s.height);
            });
        });
    });

    test('the adaptive icon points at the generated layers and the cream background', () => {
        const xml = read(RES + 'mipmap-anydpi-v26/ic_launcher.xml');
        assert.match(xml, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"/);
        assert.match(xml, /<background android:drawable="@color\/ic_launcher_background"/);
        const round = read(RES + 'mipmap-anydpi-v26/ic_launcher_round.xml');
        assert.match(round, /@mipmap\/ic_launcher_foreground/);
        // The icon's OWN canvas colour - the mode of icon-1024.png's border pixels,
        // the one definition helpers/png.js and the generator share - not the
        // manifest's #F6F4EC: foreground and background must be the same cream or
        // the scaled mark sits in a faintly lighter square. The cream is textured
        // (it varies by a level or two), which is why it is derived, not typed.
        const c = canvasColour(readPng(path.join(REPO_ROOT, 'icon-1024.png')));
        const manifest = WEB_MANIFEST.background_color.slice(1).match(/../g).map(h => parseInt(h, 16));
        c.rgb.forEach((v, i) => assert.ok(Math.abs(v - manifest[i]) <= 8,
            'icon canvas ' + c.hex + ' is not the app cream ' + WEB_MANIFEST.background_color));
        assert.match(read(RES + 'values/ic_launcher_background.xml'),
            new RegExp('<color name="ic_launcher_background">' + c.hex + '</color>'),
            'ic_launcher_background is not the icon canvas colour ' + c.hex + ' - regenerate with tools/android-icons.js');
    });

    // THE MEASUREMENT. Decoded, not trusted.
    test('the xxxhdpi foreground keeps every mark pixel inside the 66/108 safe circle', () => {
        const fg = readPng(path.join(REPO_ROOT, RES + 'mipmap-xxxhdpi/ic_launcher_foreground.png'));
        assert.equal(fg.width, 432);
        const bg = canvasColour(fg).rgb;
        const safeR = (66 / 108) * fg.width / 2;                       // 132px
        const cx = fg.width / 2, cy = fg.height / 2;
        let mark = 0, outside = 0, far = 0;
        for (let y = 0; y < fg.height; y++) for (let x = 0; x < fg.width; x++) {
            const o = (y * fg.width + x) * 4;
            const d = Math.max(Math.abs(fg.data[o] - bg[0]), Math.abs(fg.data[o + 1] - bg[1]), Math.abs(fg.data[o + 2] - bg[2]));
            if (d <= 40) continue;
            mark++;
            const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (r > far) far = r;
            if (r > safeR) outside++;
        }
        // POSITIVE FIRST: a blank cream layer has zero pixels outside the circle.
        assert.ok(mark > fg.width * fg.height * 0.03,
            'the foreground carries almost no mark (' + mark + ' px) - is it blank?');
        assert.equal(outside, 0, outside + ' mark pixel(s) lie outside the safe circle; farthest '
            + far.toFixed(1) + 'px vs ' + safeR.toFixed(1) + '. A circle-mask launcher clips them.');
    });

    test('the round legacy icon is transparent outside its circle, opaque inside; the square one is fully opaque', () => {
        const r = readPng(path.join(REPO_ROOT, RES + 'mipmap-xxxhdpi/ic_launcher_round.png'));
        const corner = r.data[3], centre = r.data[((r.height / 2) * r.width + r.width / 2) * 4 + 3];
        assert.equal(corner, 0, 'round icon corner is not transparent');
        assert.equal(centre, 255, 'round icon centre is not opaque');
        const sq = readPng(path.join(REPO_ROOT, RES + 'mipmap-xxxhdpi/ic_launcher.png'));
        for (let i = 3; i < sq.data.length; i += 4 * 97) assert.equal(sq.data[i], 255, 'square legacy icon has transparency');
    });

    test('the Play Store icon is 512x512 and NOT inside the app resources', () => {
        const p = 'android/app/src/main/ic_launcher-playstore.png';
        assert.ok(exists(p), p + ' missing');
        assert.deepEqual(pngSize(path.join(REPO_ROOT, p)), { width: 512, height: 512 });
        assert.ok(!exists(RES + 'ic_launcher-playstore.png'));
        const inRes = execFileSync('find', [path.join(REPO_ROOT, RES), '-name', '*playstore*'], { encoding: 'utf8' }).trim();
        assert.equal(inRes, '', 'a Play Store icon is packaged in res/: ' + inRes);
    });

    test('the Capacitor placeholder art is gone and nothing references it', () => {
        const strays = execFileSync('find', [path.join(REPO_ROOT, RES), '-name', 'splash.png'], { encoding: 'utf8' }).trim();
        assert.equal(strays, '', 'Capacitor\'s own splash logo is still packaged:\n' + strays);
        // XML comments stripped: styles.xml explains, in a comment, what used to be
        // referenced here, and a comment is not a reference.
        const noComments = t => t.replace(/<!--[\s\S]*?-->/g, '');
        ['values/styles.xml', 'drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_background.xml'].forEach(f => {
            if (!exists(RES + f)) return;
            assert.ok(!/@drawable\/splash\b/.test(noComments(read(RES + f))), RES + f + ' still references @drawable/splash');
        });
        assert.match(noComments(read(RES + 'values/styles.xml')), /windowSplashScreenBackground/,
            'the launch theme lost its splash items - the positive half of this check');
        assert.ok(!exists(RES + 'drawable-v24/ic_launcher_foreground.xml'), 'the placeholder vector foreground is still there');
        assert.ok(!exists(RES + 'drawable/ic_launcher_background.xml'), 'the placeholder vector background is still there');
    });
});

// ---------------------------------------------------------------------------
describe('LAUNCH THEME AND ORIENTATION', () => {

    test('the theme colours are the manifest.json colours, by reading manifest.json', () => {
        const colours = read(RES + 'values/colors.xml');
        assert.match(colours, new RegExp('<color name="rattle_navy">' + WEB_MANIFEST.theme_color + '</color>'),
            'rattle_navy != manifest theme_color ' + WEB_MANIFEST.theme_color);
        assert.match(colours, new RegExp('<color name="rattle_cream">' + WEB_MANIFEST.background_color + '</color>'),
            'rattle_cream != manifest background_color ' + WEB_MANIFEST.background_color);
    });

    test('the window and the Android 12 splash are cream, the splash shows the app icon, and hands over to the app theme', () => {
        const styles = read(RES + 'values/styles.xml');
        const noBar = /<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/.exec(styles)[0];
        assert.match(noBar, /<item name="android:windowBackground">@color\/rattle_cream<\/item>/);
        const launch = /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/.exec(styles)[0];
        assert.match(launch, /<item name="windowSplashScreenBackground">@color\/rattle_cream<\/item>/);
        assert.match(launch, /<item name="windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher_foreground<\/item>/);
        assert.match(launch, /<item name="postSplashScreenTheme">@style\/AppTheme\.NoActionBar<\/item>/);
        assert.ok(!/@drawable\/splash/.test(launch), 'the launch theme still paints the Capacitor logo');
        assert.match(launch, /parent="Theme\.SplashScreen"/, 'the launch theme must stay on Theme.SplashScreen for the API 24-30 backport');
    });

    test('the status bar colour is the brand navy', () => {
        const styles = read(RES + 'values/styles.xml');
        assert.match(styles, /<item name="colorPrimaryDark">@color\/rattle_navy<\/item>/);
    });

    test('orientation MATCHES iOS, read from Info.plist: iOS allows landscape, so Android is not locked', () => {
        const block = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(PLIST);
        assert.ok(block, 'Info.plist declares no iPhone orientations');
        const iosLandscape = /Landscape/.test(block[1]);
        const activity = /<activity[\s\S]*?MainActivity[\s\S]*?>/.exec(MANIFEST)[0];
        if (iosLandscape) {
            assert.ok(!/android:screenOrientation="(portrait|sensorPortrait|userPortrait)"/.test(activity),
                'iOS rotates to landscape (Info.plist) but Android is locked to portrait');
            assert.match(activity, /android:configChanges="[^"]*\borientation\b/, 'rotation would recreate the Activity and drop the WebView');
        } else {
            assert.match(activity, /android:screenOrientation="portrait"/, 'iOS is portrait-only; Android must be too');
        }
    });
});

// ---------------------------------------------------------------------------
describe('SIGNING - prepared, never generated', () => {

    test('release signing is read from keystore.properties ONLY if that file exists', () => {
        assert.match(GRADLE, /rootProject\.file\(["']keystore\.properties["']\)/, 'build.gradle does not look for keystore.properties');
        assert.match(GRADLE, /keystorePropertiesFile\.exists\(\)/, 'no exists() guard - a clone without a key cannot build');
        assert.match(GRADLE, /signingConfigs\s*\{[\s\S]*?release\s*\{/, 'no release signingConfig');
        // Applied to the release build type conditionally, so `assembleDebug`
        // and an unsigned `bundleRelease` both work without the file.
        assert.match(GRADLE, /if \(keystorePropertiesFile\.exists\(\)\)\s*\{?\s*signingConfig signingConfigs\.release/,
            'signingConfig is applied unconditionally');
    });

    test('no password, alias, or key path is written into the repo', () => {
        // A literal is `storePassword "..."`; the property read is
        // `storePassword keystoreProperties['storePassword']`, which is not.
        assert.ok(!/(storePassword|keyPassword)\s+["']/.test(GRADLE), 'a literal password is in build.gradle');
        assert.match(GRADLE, /storePassword keystoreProperties\['storePassword'\]/, 'the password is not read from the properties file');
        assert.ok(!/storeFile file\(["']/.test(GRADLE), 'a literal keystore path is in build.gradle');
        const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n');
        const bad = tracked.filter(f => /\.(jks|keystore|p12|pem)$|keystore\.properties$|local\.properties$/.test(f));
        assert.deepEqual(bad, [], 'key material or machine paths are tracked: ' + bad.join(', '));
    });

    test('the ignore rules refuse the key files, proven with git check-ignore', () => {
        ['android/keystore.properties', 'android/app/upload.jks', 'android/local.properties', 'rattle-upload.keystore']
            .forEach(f => {
                const out = execFileSync('git', ['check-ignore', '-v', f], { cwd: REPO_ROOT, encoding: 'utf8' });
                assert.match(out, /gitignore/, f + ' is not ignored');
            });
    });
});
