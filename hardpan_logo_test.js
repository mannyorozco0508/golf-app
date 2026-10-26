// ============================================================================
// HARDPAN LOCKUP AND TAB ICON
//
// The consumer lobby and the legal-page headers show hardpan-icon.svg (the
// ball) beside the HTML word HARDPAN. hardpan-lockup.svg remains for any
// leftover reference: the outlined word is open, not ultra-condensed, and
// it carries no stroke — a non-scaling stroke filled the counters on a phone.
// The tab icon is hardpan-icon.svg, with favicon-32.png and the manifest
// PNGs (icon-192, icon-512) generated from the same ball.
//
// THE NATIVE ICONS. icon-1024.png, the iOS AppIcon, and every Android launcher
// PNG are the same HardPan ball, flattened to an opaque near-black square.
// They are pinned below. Do not archive until 1.0.3 is approved and released;
// this only prepares the files. The repo display name is HardPan. Tournament
// web icons are the Rattle Golf banner, not these native files and not the
// HardPan ball.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readPng } = require('./helpers/png.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');

const CONSUMER_PAGES = [
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'game.html', 'trip.html',
    'instructions.html', 'shared.html', 'privacy.html', 'terms.html', 'support.html',
];
const TOURNAMENT_PAGES = ['tournament.html', 'tournament-scorecard.html'];

const NATIVE_ICONS = {
    // THE MERGED APP'S ICON (mailbox 004, Manny 2026-10-17): com.rattlegolf.app takes the GPS
    // app's HP ball + green location pin, the whole slot set (gps-beta's AppIcon.appiconset).
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png':
        '23cd2d1d823c8e6c6f544ea374c467eb4e7e9d1361e4365419773ae93e673947',
    // 077 (Manny, 2026-10-26 "(a) full art, to match iOS"): the Android launcher files are re-pinned to
    // the new logo (tools/android-icons.js from assets/brand/hardpan-2026/HardPan-AppIcon-1024-square.png).
    // The iOS file above and icon-1024.png stay the HP ball until the iOS session moves them.
    'android/app/src/main/res/mipmap-hdpi/ic_launcher.png':
        '2403b1eac5159f503b6741a797335f2218d9707f8617958c82d6bf22f976ad88',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png':
        '6702a989e328c1627a98c3913ff0f36c5d46e7c118481d4a58094b6b96c4c3cb',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png':
        '5b37fa599d45e7a8b57f59ac9abae56c8bbf094b3e3f7b7d697b04b3ea51a374',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher.png':
        'fcbedcc8b2b8b13ca947666d0659ff9e6d43c50accb58728140ba57c6104eab2',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png':
        '30408548a8f2c9d7befe529b04250a9bc1fa4a7482f5296a4c7670b5dd0ddc5b',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png':
        '8e6dfd9fadb1b649cb4ff4dc7c335dc4066d2e06489b4a00f94950c03fff5aa7',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png':
        'e2a2381d56ec94ae342a912f210baa25370004a33b45e62511e21893f7c6b05c',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png':
        '6bb86fa3e285968c27ef836c3f249f9d737105c6a53b9e4836e428551adaca20',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png':
        'c8d793e0dc9d0d15a57addef547c214d4ba2e683b01994871b9911be693ea8f7',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png':
        '5a659e4594f4f27f3ac71e51e96a9d7501f6950ef071134750ecb18841e24508',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png':
        'f252b9ee4bfe63da67f706de5aaea482b75d7721a48f8fce1a3b75dc2814bde5',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png':
        '7136c8d07b3e7d723e7129f34625979f41c839d3ed6c279b06bc7d1cdcc12e0e',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png':
        '28be5bf8ef7b51fe4d08c8cf40892fc7c608e144e6d93885742799dcf36f4b4b',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png':
        '33398e9912523c8830241bce6f33ff80178c72a4d8d27b3d0c9a970db2c69376',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png':
        '8a48f0b436b0d1963fafc4e3786da8a13da8218006eafc85e1b038ce7c3143f4',
};
const STROKE_R_MASTER = '01d01bff01c5e497337b6ea0d1f2c68258673728cf9f94476583e3876602a112';

function px(img, x, y) {
    const o = (y * img.width + x) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
}

describe('THE LOCKUP SVG', () => {
    const svg = read('hardpan-lockup.svg');

    test('it is the ball, the firm ground, and an outlined HARDPAN', () => {
        assert.match(svg, /#2E7A4B/);
        assert.match(svg, /#F2EDE4/);
        assert.match(svg, /#F7F4EE/);
        assert.match(svg, /<circle /);
        assert.match(svg, /id="wordmark"/);
        assert.ok(!/#C43C2C/.test(svg), 'the pin-flag red is back');
        assert.ok(!/Arial Narrow/i.test(svg), 'the wordmark still depends on Arial Narrow');
        assert.ok(!/<text[\s>]/.test(svg), 'the wordmark must be outlined, not a font fallback');
        const wm = /id="wordmark" transform="translate\(([0-9.]+)/.exec(svg);
        assert.ok(wm && Number(wm[1]) > 200, 'HARDPAN is not beside the ball');
    });

    test('the outlined word is open and has no stroke filling the counters', () => {
        // The phone bug was this file: scale x was 45% of scale y (ultra
        // condensed) and stroke-width 11 with vector-effect non-scaling-stroke
        // stayed 11 CSS pixels when the svg was shrunk, so the counters filled.
        const word = svg.slice(svg.indexOf('id="wordmark"'));
        assert.ok(word.length > 200, 'the wordmark region was sliced away');
        assert.ok(!/stroke/.test(word), 'a stroke on the outlines fills the counters');
        assert.ok(!/vector-effect/.test(word));
        const scales = [...word.matchAll(/scale\(([0-9.]+),(-?[0-9.]+)\)/g)];
        assert.equal(scales.length, 7, 'HARDPAN is seven outlined letters');
        scales.forEach(m => {
            const x = Number(m[1]);
            const y = Math.abs(Number(m[2]));
            assert.ok(x / y >= 0.72, 'horizontal scale is still condensed: ' + x + '/' + y);
        });
        const xs = [...word.matchAll(/translate\(([0-9.]+),0\)/g)].map(m => Number(m[1]));
        assert.equal(xs.length, 7);
        for (let i = 1; i < xs.length; i++) {
            assert.ok(xs[i] - xs[i - 1] >= 140, 'letters are still packed: ' + xs.join(','));
        }
        const vb = /viewBox="0 0 ([0-9.]+)/.exec(svg);
        assert.ok(vb && Number(vb[1]) >= 1400, 'the canvas is still the condensed width');
    });

    test('the icon svg is the ball only, on near-black', () => {
        const icon = read('hardpan-icon.svg');
        assert.match(icon, /#0B0F0C/);
        assert.match(icon, /#2E7A4B/);
        assert.match(icon, /<circle /);
        assert.ok(!/#C43C2C/.test(icon), 'the pin-flag red is back');
        assert.ok(!/HARDPAN/.test(icon), 'the icon must not carry the wordmark');
    });

    test('assets/brand holds the same svg bytes the pages load', () => {
        ['hardpan-lockup.svg', 'hardpan-icon.svg'].forEach(f => {
            assert.equal(sha('assets/brand/' + f), sha(f), f + ' drifted from assets/brand');
        });
    });
});

describe('THE WEB ICONS', () => {
    test('the manifest still points at the two PNG sizes, and those pixels are the new mark', () => {
        const manifest = JSON.parse(read('manifest.json'));
        assert.deepEqual(manifest.icons.map(i => i.src), ['icon-192.png', 'icon-512.png']);
        ['icon-192.png', 'icon-512.png', 'favicon-32.png'].forEach(f => {
            const img = readPng(path.join(__dirname, f));
            assert.equal(img.width, img.height);
            const corner = px(img, 0, 0);
            assert.deepEqual(corner, [0x0B, 0x0F, 0x0C], f + ' corner is ' + corner.join(','));
            let green = 0, bone = 0;
            for (let i = 0; i < img.data.length; i += 4) {
                const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
                if (r > 30 && r < 70 && g > 100 && g < 150 && b > 50 && b < 100) green++;
                if (r > 220 && g > 210 && b > 200) bone++;
            }
            assert.ok(green > 0, f + ' has no green');
            assert.ok(bone > 0, f + ' has no bone');
        });
    });

    test('consumer pages link the svg favicon and the png fallback; tournament pages do not', () => {
        CONSUMER_PAGES.forEach(p => {
            const src = read(p);
            assert.match(src, /<link rel="icon" href="hardpan-icon\.svg" type="image\/svg\+xml">/);
            assert.match(src, /<link rel="icon" href="favicon-32\.png"/);
            assert.match(src, /<link rel="apple-touch-icon" href="icon-192\.png">/);
        });
        TOURNAMENT_PAGES.forEach(p => {
            const src = read(p);
            assert.ok(!/hardpan-icon\.svg|favicon-32\.png|hardpan-lockup\.svg/.test(src),
                p + ' picked up the consumer mark');
            assert.match(src, /tournament-icon-180\.png/);
        });
    });

    test('the new files are precached for Consumer and not handed to Tournament', () => {
        const sw = read('sw.js');
        const sync = read('sync-mobile-web.js');
        const consumer = /const CONSUMER_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        const tournament = /const TOURNAMENT_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        ['hardpan-lockup.svg', 'hardpan-icon.svg', 'favicon-32.png'].forEach(f => {
            assert.ok(sw.includes("'./" + f + "'"), f + ' is not precached');
            assert.ok(consumer.includes("'" + f + "'"), f + ' is not in the consumer shell');
            assert.ok(!tournament.includes("'" + f + "'"), f + ' leaked into Tournament');
        });
    });
});

describe('NATIVE ICONS ARE THE HARDPAN BALL', () => {
    test('the App Store and Android launcher files are the pinned HardPan ball', () => {
        Object.entries(NATIVE_ICONS).forEach(([file, digest]) => {
            assert.equal(sha(file), digest, file + ' changed');
            assert.notEqual(digest, STROKE_R_MASTER, file + ' is still the Stroke R master');
        });
        const master = sha('icon-1024.png');
        assert.equal(master, NATIVE_ICONS['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png']);
        assert.notEqual(master, STROKE_R_MASTER, 'icon-1024.png is still the Stroke R');
        const img = readPng(path.join(__dirname, 'icon-1024.png'));
        assert.deepEqual(px(img, 0, 0), [0x0B, 0x0F, 0x0C]);
        let green = 0, bone = 0;
        for (let i = 0; i < img.data.length; i += 4) {
            const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
            if (r > 30 && r < 80 && g > 90 && g < 170 && b > 40 && b < 120) green++;
            if (r > 220 && g > 210 && b > 190) bone++;
        }
        assert.ok(green > 0, 'the master has no forest-green ground');
        assert.ok(bone > 0, 'the master has no bone');
    });

    test('tournament icons are the Rattle Golf banner, not the HardPan ball', () => {
        // Restored 2026-09-23 from the banner that says RATTLE GOLF / TOURNAMENTS.
        // They stay separate files from the native HardPan ball.
        assert.notEqual(sha('tournament-icon-1024.png'), sha('icon-1024.png'),
            'the tournament master is a copy of the native master');
        const img = readPng(path.join(__dirname, 'tournament-icon-1024.png'));
        const corner = px(img, 0, 0);
        assert.ok(corner[0] > 200 && corner[1] > 200 && corner[2] > 180,
            'tournament icon corner should be the cream banner field, got ' + corner);
        assert.notDeepEqual(corner, [0x0B, 0x0F, 0x0C]);
        let green = 0;
        for (let i = 0; i < img.data.length; i += 4) {
            const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
            if (r < 40 && g > 70 && g < 140 && b < 80) green++;
        }
        assert.ok(green > 1000, 'the Rattle Golf banner has no green R');
    });

    test('the native display name in the repo is HardPan', () => {
        assert.match(read('capacitor.config.ts'), /appName: 'HardPan'/);
        assert.match(read('ios/App/App/Info.plist'), /<string>HardPan<\/string>/);
        assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">HardPan<\/string>/);
        assert.match(read('capacitor.config.ts'), /appId: 'com\.rattlegolf\.app'/);
        // The Xcode build setting overrides Info.plist when both are set.
        const names = [...read('ios/App/App.xcodeproj/project.pbxproj')
            .matchAll(/INFOPLIST_KEY_CFBundleDisplayName = "([^"]+)";/g)].map(m => m[1]);
        assert.deepEqual(names, ['HardPan', 'HardPan']);
    });

    test('the launch splash is the ball on the existing cream field', () => {
        const files = [
            'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
            'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
            'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
        ];
        const SPLASH_SHA = '70944081a8a6bc200faf20a52de649f3159fe9c84b04a79ad3c9a325eab5da12';
        const STROKE_R_SPLASH = '5719f2b14f7327b1d55e49410908a65b0e56eae99de2276befe27730b07b60e1';
        files.forEach(f => {
            assert.equal(sha(f), SPLASH_SHA, f + ' is not the cream HardPan splash');
            assert.notEqual(sha(f), STROKE_R_SPLASH, f + ' is still the Stroke R');
        });
        const img = readPng(path.join(__dirname, files[0]));
        assert.equal(img.width, 2732);
        assert.deepEqual(px(img, 0, 0), [0xFB, 0xF5, 0xEB]);
        const mid = px(img, 1366, 1366);
        assert.deepEqual(mid, [247, 244, 238], 'the centre is not the ball');
        let green = 0;
        for (let i = 0; i < img.data.length; i += 4) {
            const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
            if (r > 30 && r < 80 && g > 90 && g < 170 && b > 40 && b < 120) green++;
        }
        assert.ok(green > 0, 'the splash has no forest-green ground');
    });

    test('tournaments say Rattle Golf beside the ball mark', () => {
        const t = read('tournament.html');
        assert.match(t, /<img class="wm-mark" src="logo-mark\.png"/);
        assert.match(t, /<span class="wm-rattle">Rattle Golf<\/span>/);
        assert.match(t, /<span class="wm-product">Tournaments<\/span>/);
        assert.ok(!/HardPan/.test(t), 'the tournament page must not say HardPan');
    });

    test('the lobby still has the email-link card', () => {
        const admin = read('admin.html');
        assert.match(admin, /id="email-link-card"/);
        assert.match(admin, /id="email-link-title">Keep this organizer</);
        assert.match(admin, /<script src="email-link-auth\.js"><\/script>/);
    });
});
