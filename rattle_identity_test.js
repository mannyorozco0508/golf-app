// ============================================================================
// RATTLE GOLF — RELEASE IDENTITY
//
// The consumer web brand is HardPan (lobby, PWA manifest, share titles,
// instructions, legal pages). The iOS bundle identifier is com.rattlegolf.app
// and is permanent. The native display name in the repo is HardPan. Do not
// archive a new iOS binary while 1.0.3 is in review. Tournaments on the web
// are HardPan Tournaments. tournaments.rattlegolf.com stays the hostname.
//
// This file pins the identity surfaces that a golfer or the App Store actually
// sees, and pins the boundary that keeps Tournament from being dragged along
// with them. It deliberately does NOT scan for the bare word "golfapp" across
// the repo, because three separate categories of that string are legitimate and
// must survive:
//
//   1. FIREBASE PROJECT — golfapp-9fb21 is the real project id, database URL and
//      storage bucket. Renaming it would point the app at a database that does
//      not exist.
//   2. PERSISTED KEYS — golfapp-theme, golfapp_me_*, golfAppRoster are already on
//      golfers' devices. Renaming them silently discards a saved preference or
//      roster on the next launch.
//   3. CACHE PREFIX — the combined deployment's service worker key stays
//      golfapp- prefixed so an installed PWA's old caches are still recognised
//      and evicted on activate.
//
// A naive grep would flag all three and tempt someone into "cleaning them up".
// That is why every assertion below names the specific surface it checks.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { decodeEscapes } = require('./helpers/decode-escapes.js');

// DECODES BEFORE MATCHING, and the negative assertions below are why. A \uXXXX
// escape inside a <script> is legitimate JavaScript that resolves at runtime, so
// "this forbidden glyph is absent" was trivially true of a glyph written as an
// escape - which is exactly how a retired icon survived in trip.html. Do not
// revert this to a plain read: it would make every `assert.ok(!/glyph/...)` in
// this file blind again. See CLAUDE.md, "must DECODE first".
const read = f => decodeEscapes(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const exists = f => fs.existsSync(path.join(__dirname, f));

const CAP = read('capacitor.config.ts');
const MANIFEST = JSON.parse(read('manifest.json'));
const BUILD = read('build-shell.js');
const ADMIN = read('admin.html');
const INSTRUCTIONS = read('instructions.html');

const BRAND = 'HardPan';
const NATIVE_NAME = 'HardPan';
const BUNDLE_ID = 'com.rattlegolf.app';

// ---------------------------------------------------------------------------
describe('RATTLE GOLF — THE NATIVE SHELL IDENTITY IS LOCKED', () => {

    test('Capacitor appName is HardPan, and the 1.0.3 binary is not resubmitted from here', () => {
        assert.match(CAP, /appName: 'HardPan'/,
            'the repo display name is HardPan');
        assert.match(CAP, /after 1\.0\.3 clears/);
        assert.ok(!/appName: 'Rattle Golf'/.test(CAP),
            'the repo display name is no longer Rattle Golf');
        const plist = read('ios/App/App/Info.plist');
        assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>HardPan<\/string>/);
        assert.match(plist, /after 1\.0\.3 clears/);
        assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">HardPan<\/string>/);
    });

    test('Capacitor appId is the permanent production bundle identifier', () => {
        assert.match(CAP, /appId: 'com\.rattlegolf\.app'/,
            `the bundle identifier is ${BUNDLE_ID} and cannot change after the first App Store Connect record`);
    });

    test('the retired GolfApp native identity cannot silently return', () => {
        assert.ok(!/com\.golfapp\.app/.test(CAP),
            'com.golfapp.app was retired at the rename');
        assert.ok(!/appName: 'GolfApp'/.test(CAP),
            "appName 'GolfApp' was retired at the rename");
    });

    test('this is the CAPACITOR appId, not the Firebase web appId', () => {
        // These two keys share a name and are entirely different things. A previous
        // batch produced a false positive by matching on the bare word, so this
        // asserts the shape that actually identifies a bundle: reverse DNS.
        const bundleId = /appId: '([^']+)'/.exec(CAP)[1];
        assert.match(bundleId, /^[a-z]+(\.[a-z]+){2,}$/,
            'a bundle identifier is reverse-DNS; a Firebase web appId is not');
        assert.ok(!bundleId.includes(':'),
            'a Firebase web appId contains colons and must never appear here');
    });
});

// ---------------------------------------------------------------------------
describe('RATTLE GOLF — THE INSTALLED PWA IDENTITY', () => {

    test('the manifest name and short_name are HardPan', () => {
        assert.equal(MANIFEST.name, BRAND);
        assert.equal(MANIFEST.short_name, BRAND);
        assert.equal(MANIFEST.name, NATIVE_NAME,
            'the web install name and the repo display name are both HardPan');
    });

    test('short_name fits the home screen without truncation', () => {
        // iOS truncates around 12 characters. HardPan is 7.
        assert.ok(MANIFEST.short_name.length <= 12,
            `short_name is ${MANIFEST.short_name.length} chars; iOS truncates past ~12`);
    });

    test('the manifest carries the locked brand colors', () => {
        assert.equal(MANIFEST.theme_color, '#0E2B1F', 'forest green');
        assert.equal(MANIFEST.background_color, '#F6F4EC', 'cream');
    });

    test('the built Consumer shell declares the same identity as the manifest', () => {
        assert.match(BUILD, /appName: 'HardPan'/);
        assert.match(BUILD, /shortName: 'HardPan'/);
        assert.match(BUILD, /themeColor: '#0E2B1F'/);
        assert.match(BUILD, /backgroundColor: '#F6F4EC'/);
    });

    test('background colour is per-product, so Consumer branding cannot move Tournament', () => {
        const consumer = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        const tournament = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.match(consumer, /backgroundColor: '#F6F4EC'/, 'Consumer uses the locked cream');
        assert.match(tournament, /backgroundColor: '#f4f6f8'/, 'Tournament keeps its existing background');
        assert.ok(!/background_color: '#/.test(BUILD),
            'the generated manifest must read backgroundColor from the product, not a shared literal');
    });
});

// ---------------------------------------------------------------------------
describe('RATTLE GOLF — THE GOLFER-FACING SURFACES', () => {

    test('the lobby shows HardPan', () => {
        assert.match(ADMIN, /<span class="lobby-word">HARDPAN<\/span>/);
    });

    test('a shared invite says HardPan and no longer says Beta', () => {
        assert.match(ADMIN, /navigator\.share\(\{ title: `HardPan`/);
        assert.ok(!/GolfApp Beta/.test(ADMIN),
            'Beta was removed from the golfer-facing production identity');
    });

    test('the instructions page is titled for the brand', () => {
        assert.match(INSTRUCTIONS, /<title>How HardPan Works<\/title>/);
        assert.match(INSTRUCTIONS, /How HardPan Works<\/h1>/);
    });

    test('no retired GolfApp branding is left on a Consumer-facing surface', () => {
        // Scoped deliberately: visible text and titles only. Firebase config,
        // persisted storage keys and the cache prefix are checked separately
        // below and must NOT be caught here.
        const visible = [
            ['admin.html', ADMIN],
            ['instructions.html', INSTRUCTIONS],
        ];
        visible.forEach(([name, src]) => {
            assert.ok(!/<title>[^<]*GolfApp/.test(src), `${name} title still says GolfApp`);
            assert.ok(!/lobby-title">GolfApp/.test(src), `${name} lobby still says GolfApp`);
            assert.ok(!/<h1>[^<]*GolfApp/.test(src), `${name} heading still says GolfApp`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('TOURNAMENT IS A SEPARATE PRODUCT AND WAS NOT RENAMED', () => {

    test('the Tournament shell keeps its own independent identity', () => {
        const tournament = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.ok(!/Rattle/.test(tournament),
            'Tournament shell identity is HardPan Tournaments, not Rattle');
        assert.match(tournament, /appName: 'HardPan Tournaments'/,
            'Tournament web product is HardPan Tournaments');
        assert.ok(!/appName: 'HardPan',/.test(tournament),
            'Tournament must not reuse the consumer name literal');
    });

    test('the two products still declare two independent name literals', () => {
        const consumer = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        const tournament = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.notEqual(/appName: '([^']+)'/.exec(consumer)[1],
            /appName: '([^']+)'/.exec(tournament)[1],
            'the two products must not share one mutable identity');
    });

    test('the Tournament pages carry no Rattle Golf branding', () => {
        // The landing wordmark is HardPan + Tournaments. The hostname and the
        // LLC stay. "Rattle Golf" as a product name must not return on these
        // files. The scorecard and the engine carry no Rattle.
        ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => assert.ok(!/Rattle Golf/.test(read(f)), `${f} must not carry the old consumer product name`));
        assert.match(read('tournament-manifest.json'), /HardPan Tournaments/);
        assert.match(read('tournament.html'), /aria-label="HardPan Tournaments"/);
        ['tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => assert.ok(!/Rattle/.test(read(f)), `${f} must not carry Consumer branding`));
        const t = read('tournament.html');
        const outside = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<div class="tourney-wordmark"[\s\S]*?<\/div>/, '').replace(/\.wm-rattle/g, '');
        assert.ok(!/Rattle/.test(outside), 'tournament.html says Rattle somewhere other than the landing wordmark');
        assert.match(t, /<img class="wm-mark" src="logo-mark\.png"/,
            'the parent brand is the mark file, not a text stand-in');
        assert.match(t, /<span class="wm-rattle">HardPan<\/span>/,
            'HardPan sits with the mark');
        assert.match(t, /<span class="wm-product">Tournaments<\/span>/,
            'Tournaments is the product word');
        assert.ok(!/wm-slash/.test(t), 'the slash wordmark is gone');
        const rattleRule = /\.tourney-wordmark \.wm-rattle\s*\{[^}]*\}/.exec(t);
        assert.ok(rattleRule, 'no .wm-rattle rule');
        assert.ok(!/text-transform:\s*uppercase/.test(rattleRule[0]),
            'the quiet label must not be the old uppercase RATTLE');
    });

    test('the two cache identities remain distinct', () => {
        const consumer = /cacheName: '(consumer-[^']+)'/.exec(BUILD)[1];
        const tournament = /cacheName: '(tournament-[^']+)'/.exec(BUILD)[1];
        assert.notEqual(consumer, tournament);
    });
});

// ---------------------------------------------------------------------------
describe('COMPATIBILITY IDENTIFIERS SURVIVED THE RENAME', () => {

    test('the Firebase project is untouched', () => {
        ['admin.html', 'index.html', 'leaderboard.html', 'shared.html'].forEach(f => {
            const src = read(f);
            assert.match(src, /projectId: "golfapp-9fb21"/,
                `${f}: the Firebase project id is real infrastructure, not branding`);
            assert.match(src, /databaseURL: "https:\/\/golfapp-9fb21-default-rtdb\.firebaseio\.com"/,
                `${f}: the database URL must not be renamed`);
        });
    });

    test('persisted device keys are untouched, so nobody loses a saved setting', () => {
        assert.match(read('admin.html'), /localStorage\.(get|set)Item\('golfapp-theme'/,
            'golfapp-theme is already on golfers devices');
        assert.match(read('admin.html'), /localStorage\.setItem\('golfAppRoster'/,
            'golfAppRoster holds a real saved roster');
        assert.match(read('index.html'), /`golfapp_me_\$\{currentMode\}`/,
            'golfapp_me_* identifies the golfer on this device');
    });

    test('the combined-deployment cache prefix is retained deliberately', () => {
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v\d+-[a-z-]+';/,
            'the prefix is an internal cache identity, not a brand surface');
    });

    test('the cache version moved for this batch', () => {
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v206-hardpan-word';/,
            'visible identity files changed, so an installed PWA must drop its old shell');
    });
});

// ---------------------------------------------------------------------------
describe('APP ICON ASSET SEAM', () => {

    // The approved Classic Stroke R master lives at icon-1024.png and is the
    // source of record: icon-512 and icon-192 are Lanczos downscales of it, never
    // upscales, and never redrawn. The master itself is deliberately NOT shipped —
    // it is 700KB of Xcode/App Store Connect asset that would otherwise be
    // precached onto every device for a shell that already needs to work on a
    // remote course with no signal.

    const MASTER = 'icon-1024.png';
    const ICONS = [
        { file: 'icon-192.png', size: 192 },
        { file: 'icon-512.png', size: 512 },
    ];

    function pngSize(file) {
        const buf = fs.readFileSync(path.join(__dirname, file));
        assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is not a PNG`);
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }

    ICONS.forEach(({ file, size }) => {
        test(`${file} exists and is exactly ${size}x${size}`, () => {
            assert.ok(exists(file), `${file} is missing`);
            const { w, h } = pngSize(file);
            assert.equal(w, size, `${file} width`);
            assert.equal(h, size, `${file} height`);
        });
    });

    test('every icon the manifest declares is actually shipped', () => {
        MANIFEST.icons.forEach(icon => {
            assert.ok(exists(icon.src), `manifest declares ${icon.src} but it is not in the repo`);
            const { w } = pngSize(icon.src);
            assert.equal(`${w}x${w}`, icon.sizes, `${icon.src} declared ${icon.sizes} but is ${w}x${w}`);
        });
    });

    test('the icons are in the precached shell and in the native bundle list', () => {
        const sw = read('sw.js');
        const sync = read('sync-mobile-web.js');
        ICONS.forEach(({ file }) => {
            assert.ok(sw.includes(`'./${file}'`), `${file} must be precached`);
            assert.ok(sync.includes(`'${file}'`), `${file} must ship in the native bundle`);
        });
    });


    test('the 1024 master is committed and is exactly 1024x1024', () => {
        assert.ok(exists(MASTER), 'the approved master must be in the repo');
        const { w, h } = pngSize(MASTER);
        assert.equal(w, 1024);
        assert.equal(h, 1024);
    });

    test('the master is opaque — iOS app icons may not carry an alpha channel', () => {
        // PNG colour type 6 is RGBA, 4 is grey+alpha. Apple rejects icons with alpha.
        const buf = fs.readFileSync(path.join(__dirname, MASTER));
        const colourType = buf[25];
        assert.ok(colourType !== 6 && colourType !== 4,
            `icon-1024.png has PNG colour type ${colourType}; App Store icons must have no alpha`);
    });

    test('the master is full-bleed — no baked rounded corners, no white margin', () => {
        // iOS applies its own corner mask. Artwork that arrives pre-rounded on white
        // shows white fringes outside that mask. The four corners must therefore be
        // the cream field, not white and not transparent. A previous submission
        // failed exactly this check.
        const { PNG } = tryPng();
        if (!PNG) return; // decoding is optional; the dimension checks above always run
        const px = PNG.corners(path.join(__dirname, MASTER));
        px.forEach(([name, [r, g, b]]) => {
            const isWhite = r > 250 && g > 250 && b > 250;
            assert.ok(!isWhite, `${name} corner is white (${r},${g},${b}) — artwork must bleed to the edge`);
            assert.ok(r > 200 && g > 200 && b > 180, `${name} corner should be the cream field, got (${r},${g},${b})`);
        });
    });

    test('the web icons are the ball mark; the App Store master stays the Stroke R', () => {
        // icon-192 and icon-512 are the consumer PWA icons. They are no longer
        // downscales of icon-1024.png. That master, and the copy in the iOS
        // asset catalog, stay the Stroke R while 1.0.3 is in review.
        const crypto = require('crypto');
        const sha = f => crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
        const MASTER_SHA = '01d01bff01c5e497337b6ea0d1f2c68258673728cf9f94476583e3876602a112';
        assert.equal(sha(MASTER), MASTER_SHA, 'icon-1024.png moved');
        assert.equal(sha('ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png'), MASTER_SHA,
            'the iOS AppIcon moved');
        assert.notEqual(sha('icon-512.png'), MASTER_SHA, 'the web icon is still the App Store master');
        const master = pngSize(MASTER);
        ICONS.forEach(({ file, size }) => {
            const s = pngSize(file);
            assert.ok(size < master.w, `${file} must be smaller than the master`);
            assert.equal(s.w, s.h, `${file} must be square`);
        });
    });

    test('the 700KB master is NOT precached and NOT in the native bundle', () => {
        // MEMBERSHIP, NOT SUBSTRING. This read `includes('icon-1024.png')` against
        // the raw text of sync-mobile-web.js, and wave 19 broke it without adding
        // the file to anything: 'tournament-icon-1024.png' CONTAINS 'icon-1024.png',
        // so the second product's master - named in a comment saying it is
        // deliberately absent - was reported as a declared shell file. The lists are
        // now parsed the way build-shell.js parses them, and the two greps that
        // remain are anchored to the quoted form so neither can collide either.
        assert.ok(!read('sw.js').includes("'./" + MASTER + "'"),
            'the master would add 700KB to every offline install');
        const sync = read('sync-mobile-web.js');
        ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL'].forEach(name => {
            const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(sync);
            assert.ok(m, name + ' must be declared in sync-mobile-web.js');
            const files = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
            assert.ok(!files.includes(MASTER),
                'the master is an Xcode asset, not a web shell file (' + name + ')');
        });
        assert.ok(!BUILD.includes("'" + MASTER + "'"),
            'the master must not be declared in the built manifest');
    });

    // Minimal PNG corner reader — avoids adding an image dependency to a repo whose
    // whole point is having none.
    function tryPng() {
        return {
            PNG: {
                corners(file) {
                    const zlib = require('zlib');
                    const buf = fs.readFileSync(file);
                    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
                    const bitDepth = buf[24], colourType = buf[25];
                    if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) return [];
                    const channels = colourType === 2 ? 3 : 4;
                    // concatenate IDAT chunks
                    let off = 8; const parts = [];
                    while (off < buf.length) {
                        const len = buf.readUInt32BE(off);
                        const type = buf.toString('ascii', off + 4, off + 8);
                        if (type === 'IDAT') parts.push(buf.subarray(off + 8, off + 8 + len));
                        off += 12 + len;
                    }
                    const raw = zlib.inflateSync(Buffer.concat(parts));
                    const stride = w * channels + 1;
                    const line = new Uint8Array(w * channels);
                    const prev = new Uint8Array(w * channels);
                    const out = [];
                    const want = new Set([0, h - 1]);
                    for (let y = 0; y < h; y++) {
                        const filter = raw[y * stride];
                        const row = raw.subarray(y * stride + 1, y * stride + 1 + w * channels);
                        for (let i = 0; i < row.length; i++) {
                            const a = i >= channels ? line[i - channels] : 0;
                            const b = prev[i];
                            const c = i >= channels ? prev[i - channels] : 0;
                            let v = row[i];
                            if (filter === 1) v += a;
                            else if (filter === 2) v += b;
                            else if (filter === 3) v += (a + b) >> 1;
                            else if (filter === 4) {
                                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                            }
                            line[i] = v & 0xff;
                        }
                        if (want.has(y)) {
                            const L = [line[0], line[1], line[2]];
                            const o = (w - 1) * channels;
                            const R = [line[o], line[o + 1], line[o + 2]];
                            out.push([y === 0 ? 'top-left' : 'bottom-left', L]);
                            out.push([y === 0 ? 'top-right' : 'bottom-right', R]);
                        }
                        prev.set(line);
                    }
                    return out;
                }
            }
        };
    }

    test('the built Consumer output declares both icon sizes', () => {
        assert.match(BUILD, /src: 'icon-192\.png', sizes: '192x192'/);
        assert.match(BUILD, /src: 'icon-512\.png', sizes: '512x512'/);
    });
});

// ---------------------------------------------------------------------------
describe('SERVICE WORKER SUPPRESSION SURVIVES THE RENAME', () => {

    // native_packaging_test.js already asserts this guard, but with a raw source
    // match that a `//` comment defeats — a negative control proved the guard could
    // be commented out with every test still green. This strips comments first, so
    // the assertion is about code that actually runs.
    function codeOnly(src) {
        return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    }

    test('the native guard is live code, not a commented-out line', () => {
        const boot = codeOnly(read('pwa-boot.js'));
        assert.match(boot, /if \(isNativeShell\(\)\)\s*return 'skipped-native';/,
            'the service worker must not register inside the Capacitor shell');
    });

    test('the native bundle ships no service worker registration path by accident', () => {
        const boot = codeOnly(read('pwa-boot.js'));
        assert.ok(/isNativeShell/.test(boot), 'native detection must remain live code');
    });
});

// ---------------------------------------------------------------------------
describe('THE HOMEPAGE BRAND MARK', () => {

    // The lobby header is: theme toggle / ball icon + HTML word HARDPAN / prompt.
    // The word is text. The icon is the ball only. A second heading under the
    // bar would say the name twice. ⛳ is still legitimate elsewhere on the
    // page, so a blanket ban on the emoji would be wrong.
    const header = ADMIN.slice(ADMIN.indexOf('id="lobby-screen"'), ADMIN.indexOf('class="home-widgets"'));

    test('the header shows the ball icon and the HTML word, not the Stroke R', () => {
        assert.match(header, /<img src="hardpan-icon\.svg" alt="" width="72" height="72">/,
            'the homepage brand mark must be the ball icon');
        assert.match(header, /<span class="lobby-word">HARDPAN<\/span>/,
            'the word must be HTML, so a phone can read it');
        assert.ok(!/hardpan-lockup\.svg/.test(header),
            'the outlined lockup is illegible at phone width');
        assert.ok(!/logo-mark\.png/.test(header),
            'the Stroke R must not sit in the lobby header');
        assert.ok(!/class="lobby-logo[^"]*"[^>]*>\u26f3</.test(header),
            'the generic golf-hole emoji must not return as the brand mark');
    });

    test('the five-tap admin gesture still lives on the lockup', () => {
        // The hidden admin panel is opened by tapping this element five times. A
        // visual change that dropped the handler would silently remove the only way
        // into the course-database tools.
        assert.match(header, /class="lobby-lockup" onclick="handleSecretTap\(\)"/,
            'handleSecretTap must survive any restyling of the brand mark');
    });

    test('the wordmark is not doubled in HTML', () => {
        assert.ok(!/<div class="lobby-title">HardPan<\/div>/.test(header),
            'a second heading under the bar says the name twice');
        const marks = header.match(/hardpan/gi) || [];
        assert.equal(marks.length, 2,
            'exactly two: the icon filename and the HTML word. A third means the name was stacked again.');
    });

    test('the two Consumer mode icons are the approved pair', () => {
        assert.match(ADMIN, /<div class="hw-icon">\u{1F690}<\/div>/u, 'Road Trip is the van');
        assert.match(ADMIN, /<div class="hw-icon">\u{1F3CC}/u, 'Game Day is the golfer');
        assert.ok(!/<div class="hw-icon">\u26f3<\/div>/u.test(ADMIN),
            'the Club Round tile and its flag left with the product separation');
        assert.ok(!/\u{1F9F3}/u.test(ADMIN), 'luggage was retired in favour of the van');
    });

    test('the Round Ready screen keeps its own separate logo', () => {
        assert.match(ADMIN, /<div class="lobby-logo">\u2705<\/div>/u,
            'that is a different screen and must not inherit the brand mark');
    });

    test('the lockup sits on the near-black field in both themes', () => {
        // The wordmark is bone. On the light card that colour disappears, so the
        // chip carries #0B0F0C itself and dark mode does not repaint it.
        assert.match(ADMIN, /\.lobby-lockup \{[^}]*background:\s*#0B0F0C/);
        const dark = ADMIN.slice(ADMIN.indexOf('html.dark-mode'), ADMIN.indexOf('.lobby-lockup'));
        assert.ok(!/\.lobby-lockup/.test(dark),
            'dark mode must not repaint the lockup off the near-black field');
    });

    test('the lockup is one wide bar', () => {
        const [, w] = /\.lobby-lockup \{[^}]*width:\s*(\d+)px/.exec(ADMIN);
        assert.ok(Number(w) >= 280, 'the lockup is ' + w + 'px wide');
    });
});

// ---------------------------------------------------------------------------
describe('THE BRAND MARK ASSET', () => {

    test('logo-mark.png is committed and square', () => {
        assert.ok(exists('logo-mark.png'));
        const buf = fs.readFileSync(path.join(__dirname, 'logo-mark.png'));
        assert.equal(buf.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
        const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
        assert.equal(w, h);
        // The receipt prints it at 64 CSS px. 2x of that is 128. The lobby
        // header is hardpan-icon.svg plus the HTML word, not this file.
        assert.ok(w >= 128, `logo-mark.png is ${w}px, below 2x of the 64px print size`);
    });

    test('the mark is transparent — it sits on the disc, it does not carry a field', () => {
        // Colour type 6 is RGBA. Unlike the app icon (which must be opaque), this one
        // must have alpha or it would paint its own cream rectangle over the disc.
        const buf = fs.readFileSync(path.join(__dirname, 'logo-mark.png'));
        assert.equal(buf[25], 6, 'logo-mark.png needs an alpha channel');
    });

    test('the mark ships to Consumer and to the native bundle', () => {
        assert.ok(read('sw.js').includes("'./logo-mark.png'"), 'must be precached');
        assert.ok(read('sync-mobile-web.js').includes("'logo-mark.png'"), 'must ship natively');
    });

    test('the mark file stays Consumer-owned — Tournament may show it as parent brand, not take it', () => {
        // Tournament.html references logo-mark.png in the landing hero as the
        // PARENT brand. Ownership of the file stays with Consumer: SHARED is
        // for infrastructure, and identity assets are the one thing two
        // products must not share in the shell lists. Combined deploy still
        // serves the file from the repo root; the Tournament dist does not
        // copy it.
        const sync = read('sync-mobile-web.js');
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        const tournament = /const TOURNAMENT_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        assert.ok(!shared.includes('logo-mark.png'), 'not shared');
        assert.ok(!tournament.includes('logo-mark.png'), 'not Tournament');
        assert.match(read('tournament.html'), /src="logo-mark\.png"/,
            'the landing hero uses the parent brand mark');
    });

    test('the cache moved — the header changed and installed devices must see it', () => {
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v206-hardpan-word';/);
        assert.match(BUILD, /cacheName: 'consumer-v49-hardpan-word'/);
        assert.match(BUILD, /cacheName: 'tournament-v53-hardpan-word'/,
            'Tournament cache moved with the readable header');
    });
});
