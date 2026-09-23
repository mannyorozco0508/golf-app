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
// web icons are already that product's own files of the web ball; they do not
// share these native files.
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
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png':
        '3330ab520f7d0da6fb37e8774fe736c51d6d681bb7b409b9d0808b5e6fc02dc1',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher.png':
        '300cf9f2ff551ccd3aa45dc64d933ca9a53a0830d312cd2906cbb1f6ec801ddd',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png':
        'eb537777c7e0f814c5b7c68849ba09d4217bcaac2b8404841b7f522f5e3c9068',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png':
        'dc916f6379dd67b06fdd216a6114797c04163162c498b855b6d054320279f53d',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher.png':
        'dd76337ed182bacea3ce948c4d12eb2ee2f657157f768893e7080d9626a37eff',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png':
        'f74f99db0c06fb321ee21e6821ca23d1b4bc2cca166ccbc0c9938f9fac7e2da9',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png':
        '12f5f94eddf00b47ab3732375700678eadd856fa2314bfc95a322890befb2fef',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png':
        '2f35d487a3b9539179a07f6909e4552d35aa6373016fe528937b004283e75509',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png':
        'e118285edff6d8c1289b371165e191d58c80d1d3e122770af2589e7fee0a539c',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png':
        'bb7a2922f9dccd6a91d53172eaf04f807623a50338b07d78486b1cacf0718c61',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png':
        '4cd5250a36c874e973615a460082ede1277e30f444d28cbe3fce44ef829e8064',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png':
        '0d578336ab24b78ee7e50947c53caf95dd71849a80e8a51c74a24c4d2c2f4c41',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png':
        '9c500c7ce7e733a24c7494d8346888d211b3ed37ca81f1fa978d79346f331092',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png':
        'e9887d8e3959e8b8b0dda6d0136127bc9f60df16124dd4659b29a76847fad3e2',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png':
        '6c31b2a9457bf7736b00376df9bd0114975214f7f55da075147786d3e0f62d9e',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png':
        '84b76758a5fb254f95e57a0b232b708ea62eafc20351ba51f17213245927b573',
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
        assert.equal(master, NATIVE_ICONS['ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png']);
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

    test('tournament icons are already the web ball and do not share the native master', () => {
        // Separate files, already the HardPan ball (the web rendering), not the
        // Stroke R. They are not copies of icon-1024.png, so this prep does not
        // rewrite them.
        assert.notEqual(sha('tournament-icon-1024.png'), sha('icon-1024.png'),
            'the tournament master is a copy of the native master');
        const web = readPng(path.join(__dirname, 'icon-512.png'));
        const tour = readPng(path.join(__dirname, 'tournament-icon-512.png'));
        assert.equal(tour.width, web.width);
        assert.deepEqual(px(tour, 0, 0), px(web, 0, 0));
        assert.deepEqual(px(tour, 256, 200), px(web, 256, 200));
        const img = readPng(path.join(__dirname, 'tournament-icon-1024.png'));
        assert.deepEqual(px(img, 0, 0), [0x0B, 0x0F, 0x0C]);
    });

    test('the native display name in the repo is HardPan', () => {
        assert.match(read('capacitor.config.ts'), /appName: 'HardPan'/);
        assert.match(read('ios/App/App/Info.plist'), /<string>HardPan<\/string>/);
        assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">HardPan<\/string>/);
        assert.match(read('capacitor.config.ts'), /appId: 'com\.rattlegolf\.app'/);
    });

    test('tournaments say HardPan beside the ball mark', () => {
        const t = read('tournament.html');
        assert.match(t, /<img class="wm-mark" src="logo-mark\.png"/);
        assert.match(t, /<span class="wm-rattle">HardPan<\/span>/);
        assert.match(t, /<span class="wm-product">Tournaments<\/span>/);
    });

    test('the lobby still has the email-link card', () => {
        const admin = read('admin.html');
        assert.match(admin, /id="email-link-card"/);
        assert.match(admin, /id="email-link-title">Keep this organizer</);
        assert.match(admin, /<script src="email-link-auth\.js"><\/script>/);
    });
});
