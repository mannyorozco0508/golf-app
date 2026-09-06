// ============================================================================
// RATTLE GOLF — RELEASE IDENTITY
//
// The Consumer product is named Rattle Golf and its iOS bundle identifier is
// com.rattlegolf.app. Both are permanent: a bundle id cannot be changed once a
// record exists in App Store Connect, and the name is now the filed brand.
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

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const exists = f => fs.existsSync(path.join(__dirname, f));

const CAP = read('capacitor.config.ts');
const MANIFEST = JSON.parse(read('manifest.json'));
const BUILD = read('build-shell.js');
const ADMIN = read('admin.html');
const INSTRUCTIONS = read('instructions.html');

const BRAND = 'Rattle Golf';
const BUNDLE_ID = 'com.rattlegolf.app';

// ---------------------------------------------------------------------------
describe('RATTLE GOLF — THE NATIVE SHELL IDENTITY IS LOCKED', () => {

    test('Capacitor appName is Rattle Golf', () => {
        assert.match(CAP, /appName: 'Rattle Golf'/,
            'the installed app must present itself as Rattle Golf');
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

    test('the manifest name and short_name are Rattle Golf', () => {
        assert.equal(MANIFEST.name, BRAND);
        assert.equal(MANIFEST.short_name, BRAND);
    });

    test('short_name fits the home screen without truncation', () => {
        // iOS truncates around 12 characters. 'Rattle Golf' is 11, so no
        // abbreviation is needed and none should be invented.
        assert.ok(MANIFEST.short_name.length <= 12,
            `short_name is ${MANIFEST.short_name.length} chars; iOS truncates past ~12`);
    });

    test('the manifest carries the locked brand colors', () => {
        assert.equal(MANIFEST.theme_color, '#0E2B1F', 'forest green');
        assert.equal(MANIFEST.background_color, '#F6F4EC', 'cream');
    });

    test('the built Consumer shell declares the same identity as the manifest', () => {
        assert.match(BUILD, /appName: 'Rattle Golf'/);
        assert.match(BUILD, /shortName: 'Rattle Golf'/);
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

    test('the lobby shows Rattle Golf', () => {
        assert.match(ADMIN, /<div class="lobby-title">Rattle Golf<\/div>/);
    });

    test('a shared invite says Rattle Golf and no longer says Beta', () => {
        assert.match(ADMIN, /navigator\.share\(\{ title: `Rattle Golf`/);
        assert.ok(!/GolfApp Beta/.test(ADMIN),
            'Beta was removed from the golfer-facing production identity');
    });

    test('the instructions page is titled for the brand', () => {
        assert.match(INSTRUCTIONS, /<title>How Rattle Golf Works<\/title>/);
        assert.match(INSTRUCTIONS, /How Rattle Golf Works<\/h1>/);
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
            'Tournament must never be renamed Rattle Golf — it is a separate product');
        assert.match(tournament, /appName: 'GolfApp Tournaments'/,
            'Tournament keeps its working name until it is deliberately named');
    });

    test('the two products still declare two independent name literals', () => {
        const consumer = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        const tournament = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.notEqual(/appName: '([^']+)'/.exec(consumer)[1],
            /appName: '([^']+)'/.exec(tournament)[1],
            'the two products must not share one mutable identity');
    });

    test('the Tournament pages carry no Rattle Golf branding', () => {
        ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => assert.ok(!/Rattle/.test(read(f)), `${f} must not carry Consumer branding`));
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
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v62-setup-nav';/,
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

    test('the shipped icons are downscales of the master, not independent art', () => {
        const master = pngSize(MASTER);
        ICONS.forEach(({ file, size }) => {
            const s = pngSize(file);
            assert.ok(size < master.w, `${file} must be smaller than the master — never upscale`);
            assert.equal(s.w, s.h, `${file} must be square like the master`);
        });
    });

    test('the 700KB master is NOT precached and NOT in the native bundle', () => {
        assert.ok(!read('sw.js').includes(MASTER),
            'the master would add 700KB to every offline install');
        assert.ok(!read('sync-mobile-web.js').includes(MASTER),
            'the master is an Xcode asset, not a web shell file');
        assert.ok(!BUILD.includes(MASTER),
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

    // The lobby header is: theme toggle / brand mark / "Rattle Golf" / prompt.
    // Everything here is scoped to that header. ⛳ is still perfectly legitimate
    // elsewhere on the page — the Club Round widget uses it — so a blanket ban on
    // the emoji would be wrong and would fail for the wrong reason.
    const header = ADMIN.slice(ADMIN.indexOf('id="lobby-screen"'), ADMIN.indexOf('class="home-widgets"'));

    test('the header shows the Stroke R mark, not a generic emoji', () => {
        assert.match(header, /<img src="logo-mark\.png"/,
            'the homepage brand mark must be the approved artwork');
        assert.ok(!/class="lobby-logo[^"]*"[^>]*>\u26f3</.test(header),
            'the generic golf-hole emoji must not return as the brand mark');
    });

    test('the five-tap admin gesture still lives on the mark', () => {
        // The hidden admin panel is opened by tapping this element five times. A
        // visual change that dropped the handler would silently remove the only way
        // into the course-database tools.
        assert.match(header, /class="lobby-logo lobby-mark" onclick="handleSecretTap\(\)"/,
            'handleSecretTap must survive any restyling of the brand mark');
    });

    test('the mark is the symbol only — the wordmark is not doubled', () => {
        assert.match(header, /<div class="lobby-title">Rattle Golf<\/div>/);
        // Case-insensitive on purpose: a stacked wordmark would very likely be set
        // in caps, and a case-sensitive count let exactly that slip through a
        // negative control.
        const marks = header.match(/rattle\s+golf/gi) || [];
        assert.equal(marks.length, 2,
            'exactly two: the img alt text and the heading. A third means a wordmark was stacked above the title.');
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

    test('the mark reads in both themes', () => {
        // The forest-green R is nearly invisible on the dark card. The cream disc is
        // what makes it legible, so it is declared for BOTH themes, not just one.
        assert.match(ADMIN, /--brand-cream: #F6F4EC;/);
        const light = ADMIN.slice(ADMIN.indexOf(':root'), ADMIN.indexOf('html.dark-mode'));
        const dark = ADMIN.slice(ADMIN.indexOf('html.dark-mode'));
        assert.match(light, /--brand-cream: #F6F4EC;/, 'light theme');
        assert.match(dark, /--brand-cream: #F6F4EC;/, 'dark theme');
        assert.match(ADMIN, /\.lobby-mark \{[^}]*background: var\(--brand-cream\)/,
            'the disc must use the brand variable, not a hardcoded colour');
    });

    test('the mark is proportional to the header, not oversized', () => {
        const [, size] = /\.lobby-mark \{ width: (\d+)px/.exec(ADMIN);
        assert.ok(Number(size) <= 96,
            `the disc is ${size}px; it should sit in roughly the footprint the 3.5rem emoji had`);
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
        assert.equal(w, 256, 'sized for retina at the 56px display size');
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

    test('the mark is Consumer-only — Tournament has no use for it', () => {
        const sync = read('sync-mobile-web.js');
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        const tournament = /const TOURNAMENT_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        assert.ok(!shared.includes('logo-mark.png'), 'not shared');
        assert.ok(!tournament.includes('logo-mark.png'), 'not Tournament');
    });

    test('the cache moved — the header changed and installed devices must see it', () => {
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v62-setup-nav';/);
        assert.match(BUILD, /cacheName: 'consumer-v45-no-native-print'/);
        assert.match(BUILD, /cacheName: 'tournament-v32-consumer-ready'/,
            'Tournament assets did not change, so its cache must not move');
    });
});
