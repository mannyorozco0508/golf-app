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
// WHAT THIS DOES NOT MOVE. icon-1024.png, the iOS AppIcon, and every Android
// launcher PNG stay the Stroke R. 1.0.3 is in review and is not resubmitted.
// The repo display name is HardPan. Tournaments use the same ball.
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
        '01d01bff01c5e497337b6ea0d1f2c68258673728cf9f94476583e3876602a112',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher.png':
        'e3a4287d417d163fe6c1515dad349591359e719acfbeadcea3650be5947001dd',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png':
        '31a8810b05edd83e658fe79c79e3d1b93356e9022c1dad40cd6133511fff0169',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png':
        'ef044fbefb4a1359a397f5416d71e7503371f0e0871a63fd059c6e49fcc67c56',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher.png':
        '99120da93b69a35c95df6eb6805cebb3c259721263debf0814aeb68258e7ccab',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png':
        '9577e3ffd36d79e0479a18e93d26ecfe696ae86703df464b8eb2286982254e60',
    'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png':
        '49afef9cbdcd45996fc010aab1479247e18c6aad70a511f7f598364534b9b548',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png':
        'c36541caec1058b9c1fbcb5e99fa86ad17f1cedd9200cd1877a7f04505c6d6f5',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png':
        '39348b46fd15467be5a365fb48dd511c884acfa18a37be42ca1ff61f39c618f3',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png':
        '449e8da8f59ea1ab43330c3de3bd82baefb2397a2d084d801ebca775dbcb55c1',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png':
        '44929eca4b7d556e48f7d42a07c213c34d0a2284b342aa879c34a4f09b97f0a9',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png':
        '96f6d5c5cb2bb66cae271b2eee7ef1eff01cab4c0cd015728b62c9a8fa02f78a',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png':
        '21cdff65bfdeb270a4920a7b64e69d1b0321561b0a767aefc196b8ebf2142da6',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png':
        '87b2d25fedd6c5bef02d51737f4bf7beed638ab7b73703fc73ca4c817e94f431',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png':
        'd90c412a088b3f7d17c0727bf3587e62808cc3668241936af49d451874dabf26',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png':
        '6bcb17db935582f9e1e498478c8824c6e29ba52f2a3ce7bd618783c6bbb2a54f',
};

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

describe('NATIVE ICONS AND THE TOURNAMENT MARK DID NOT MOVE', () => {
    test('the App Store and Android launcher files are byte-for-byte what they were', () => {
        Object.entries(NATIVE_ICONS).forEach(([file, digest]) => {
            assert.equal(sha(file), digest, file + ' changed');
        });
        assert.equal(sha('icon-1024.png'), NATIVE_ICONS['ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png']);
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
