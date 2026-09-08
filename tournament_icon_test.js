// ============================================================================
// THE TOURNAMENT PRODUCT HAS ITS OWN MARK
//
// Until wave 19 it did not. icon-192.png and icon-512.png sat in SHARED_SHELL
// and build-shell.js hard-coded one icon list for both manifests, so installing
// the organizer PWA put a second copy of the Consumer icon on the home screen.
// Nothing was broken; identity had simply been classified as runtime plumbing.
//
// WHY THIS IS ITS OWN FILE. rattle_identity_test.js pins CONSUMER identity - its
// MASTER const is icon-1024.png and its whole header is about the Rattle Golf
// brand and the boundary that keeps Tournament from being dragged along with it.
// Bolting a second product's master into that file would put the boundary and
// the thing on the far side of it in the same place. The assertions here follow
// that file's APP ICON ASSET SEAM shape deliberately, including its minimal PNG
// reader, so the two guards can be compared line for line.
//
// NOTHING HERE IS WEAKER THAN THE CONSUMER GUARD. Same size equality, same alpha
// refusal, same full-bleed corner rule, same not-precached rule - plus two the
// Consumer guard has no reason to make: that the manifest declares "any" rather
// than "any maskable", and that the two products do not ship each other's mark.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const exists = f => fs.existsSync(path.join(__dirname, f));
const BUILD = read('build-shell.js');
const SYNC = read('sync-mobile-web.js');

// The master is the App Store Connect / Xcode asset and is deliberately NOT
// shipped: 695KB precached onto every device for a shell whose whole purpose is
// working on a course with no signal. Exactly the rule icon-1024.png follows.
const MASTER = 'tournament-icon-1024.png';
const SHIPPED = [
    { file: 'tournament-icon-512.png', size: 512 },
    { file: 'tournament-icon-192.png', size: 192 },
    { file: 'tournament-icon-180.png', size: 180 },
];

function listIn(name) {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(SYNC);
    assert.ok(m, name + ' must be declared in sync-mobile-web.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

function pngSize(file) {
    const buf = fs.readFileSync(path.join(__dirname, file));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is not a PNG`);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------------------
describe('THE TOURNAMENT APP ICON ASSET SEAM', () => {

    test('the master is committed and is exactly 1024x1024', () => {
        // App Store Connect requires exactly this. Three earlier candidates came
        // back 1254x1254 and would have been rejected at upload.
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
            `${MASTER} has PNG colour type ${colourType}; App Store icons must have no alpha`);
    });

    test('the master is full-bleed — no baked rounded corners, no white margin', () => {
        // iOS applies its own corner mask. Artwork that arrives pre-rounded on white
        // shows white fringes outside that mask. The four corners must be the cream
        // field, not white and not transparent.
        const px = corners(path.join(__dirname, MASTER));
        assert.ok(px.length === 4, 'all four corners must be readable');
        px.forEach(([name, [r, g, b]]) => {
            const isWhite = r > 250 && g > 250 && b > 250;
            assert.ok(!isWhite, `${name} corner is white (${r},${g},${b}) — artwork must bleed to the edge`);
            assert.ok(r > 200 && g > 200 && b > 180, `${name} corner should be the cream field, got (${r},${g},${b})`);
        });
    });

    SHIPPED.forEach(({ file, size }) => {
        test(`${file} exists, is exactly ${size}x${size}, and is a downscale`, () => {
            assert.ok(exists(file), `${file} is missing`);
            const s = pngSize(file);
            assert.equal(s.w, size, `${file} width`);
            assert.equal(s.h, size, `${file} height`);
            assert.ok(size < pngSize(MASTER).w, `${file} must be smaller than the master — never upscale`);
        });

        test(`${file} is opaque too`, () => {
            // The manifest and the apple-touch-icon both render over whatever the
            // OS puts behind them; a transparent icon picks up that background
            // instead of the cream field.
            const buf = fs.readFileSync(path.join(__dirname, file));
            assert.ok(buf[25] !== 6 && buf[25] !== 4, `${file} colour type ${buf[25]}`);
        });
    });

    test('the 695KB master is NOT precached and NOT in any shell list', () => {
        assert.ok(!read('sw.js').includes(MASTER),
            'the master would add 695KB to every offline install');
        ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL'].forEach(name =>
            assert.ok(!listIn(name).includes(MASTER),
                MASTER + ' must not be declared in ' + name));
        assert.ok(!BUILD.includes(MASTER),
            'the master must not be named in the build, which would put it in an output');
    });

    test('the three shipped sizes are declared TOURNAMENT, not shared and not Consumer', () => {
        // The load-bearing assertion of the whole wave. Declared shared, the
        // organizer product inherits the other mark again and nothing fails.
        const shared = listIn('SHARED_SHELL');
        const consumer = listIn('CONSUMER_SHELL');
        const tournament = listIn('TOURNAMENT_SHELL');
        SHIPPED.forEach(({ file }) => {
            assert.ok(tournament.includes(file), file + ' must be TOURNAMENT');
            assert.ok(!shared.includes(file), file + ' must NOT be shared');
            assert.ok(!consumer.includes(file), file + ' must NOT be Consumer');
        });
    });

    test('the Consumer mark is no longer shared, so Tournament cannot inherit it', () => {
        // Consumer still ships both files - they moved from SHARED_SHELL to
        // CONSUMER_SHELL, and SHARED.concat(CONSUMER) is unchanged as a set.
        const shared = listIn('SHARED_SHELL');
        const consumer = listIn('CONSUMER_SHELL');
        ['icon-192.png', 'icon-512.png'].forEach(f => {
            assert.ok(!shared.includes(f), f + ' is identity, not shared runtime');
            assert.ok(consumer.includes(f), f + ' must still ship to Consumer');
        });
    });

    test('the Tournament manifest declares "any", NOT "any maskable"', () => {
        // MEASURED REASON, not taste. Android keeps only the inner 80% circle of a
        // maskable icon. On the 1024 master the safe circle at the glyph mid-line
        // is 485px wide and TOURNAMENTS spans 801px: 38.8% of the letter pixels
        // fall outside it and a home screen reads "URNAMEN".
        const block = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.match(block, /src: 'tournament-icon-192\.png', sizes: '192x192'[^}]*purpose: 'any' \}/);
        assert.match(block, /src: 'tournament-icon-512\.png', sizes: '512x512'[^}]*purpose: 'any' \}/);
        const icons = /icons: \[([\s\S]*?)\],/.exec(block);
        assert.ok(icons, 'the tournament product must declare its own icon list');
        assert.ok(!/maskable/.test(icons[1]),
            'a maskable crop cuts TOURNAMENTS down to URNAMEN');
    });

    test('Consumer keeps "any maskable" — its mark survives the crop', () => {
        // Defence against the fix being applied to the wrong product. The brush R
        // spans 74.7% of its canvas and is centred, so a circular crop takes
        // background only.
        const block = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        assert.match(block, /src: 'icon-192\.png', sizes: '192x192'[^}]*purpose: 'any maskable'/);
        assert.match(block, /src: 'icon-512\.png', sizes: '512x512'[^}]*purpose: 'any maskable'/);
    });

    test('neither product names the other product’s icon files', () => {
        const consumerBlock = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        const tournamentBlock = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.ok(!/tournament-icon-/.test(consumerBlock),
            'the Consumer manifest must not name a Tournament icon');
        assert.ok(!/'icon-(192|512)\.png'/.test(tournamentBlock),
            'the Tournament manifest must not name the Consumer icon');
    });

    test('both tournament pages declare the apple-touch-icon, and no Consumer page does', () => {
        // Without the tag iOS uses a SCREENSHOT of the page as the home-screen
        // icon. Adding it to Consumer as well is a separate decision, deliberately
        // not taken here - pinned so it is not taken by accident either.
        ['tournament.html', 'tournament-scorecard.html'].forEach(p => {
            assert.match(read(p),
                /<link rel="apple-touch-icon" href="tournament-icon-180\.png">/,
                p + ' must declare the home-screen icon');
        });
        ['index.html', 'admin.html', 'leaderboard.html', 'settlement.html',
         'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
         'instructions.html', 'shared.html'].forEach(p => {
            assert.ok(!/apple-touch-icon/i.test(read(p)),
                p + ' gained an apple-touch-icon; that is a Consumer decision, not this wave');
        });
    });

    test('both tournament pages link a manifest, and it is not the Consumer one', () => {
        // Without a manifest link there is nothing for an install prompt to read,
        // so the icon has nowhere to appear. WHICH manifest is the whole question:
        // manifest.json at the live combined root is the Consumer identity.
        ['tournament.html', 'tournament-scorecard.html'].forEach(p => {
            const html = read(p);
            assert.equal((html.match(/rel="manifest"/g) || []).length, 1,
                p + ' must link a manifest exactly once');
            const head = html.slice(0, html.indexOf('</head>'));
            assert.match(head, /rel="manifest"/, p + ' must link it in <head>');
            assert.match(html, /<link rel="manifest" href="tournament-manifest\.json">/,
                p + ' must link the TOURNAMENT manifest');
            assert.ok(!/<link rel="manifest" href="manifest\.json">/.test(html),
                p + ' must not link the Consumer manifest');
        });
    });

    test('the manifest it links resolves to the Tournament identity, by content', () => {
        // Read as JSON, not matched as a string. The name, the start_url and the
        // icons are what an install prompt actually shows.
        const m = JSON.parse(read('tournament-manifest.json'));
        assert.equal(m.name, 'GolfApp Tournaments');
        assert.equal(m.start_url, './tournament.html');
        assert.ok(m.icons.length >= 2);
        m.icons.forEach(i => {
            assert.ok(exists(i.src), i.src + ' is declared but not in the repo');
            assert.match(i.src, /^tournament-icon-/, 'got ' + i.src);
            assert.equal(i.purpose, 'any', 'a maskable crop reads URNAMEN');
        });
    });

    test('exactly the four Consumer pages still link a manifest, and no others', () => {
        // The control that catches this wave spilling sideways: not one gained,
        // not one lost. leaderboard, settlement, stats, trip, instructions and
        // shared have never had one and that is not this wave to change.
        const WITH = ['index.html', 'admin.html', 'sidematches.html', 'skins.html'];
        const WITHOUT = ['leaderboard.html', 'settlement.html', 'stats.html',
                         'trip.html', 'instructions.html', 'shared.html'];
        WITH.forEach(p => {
            assert.equal((read(p).match(/rel="manifest"/g) || []).length, 1,
                p + ' must still link the Consumer manifest exactly once');
            assert.match(read(p), /<link rel="manifest" href="manifest\.json">/,
                p + ' must still link manifest.json, unchanged');
        });
        WITHOUT.forEach(p => assert.ok(!/rel="manifest"/.test(read(p)),
            p + ' gained a manifest link; that is a Consumer decision, not this wave'));
    });

    test('the 180 actually ships, or the tag points at nothing', () => {
        assert.ok(listIn('TOURNAMENT_SHELL').includes('tournament-icon-180.png'),
            'the apple-touch-icon target must be in the Tournament shell');
    });

    test('the Tournament cache key moved for this wave', () => {
        // The icons and the manifest are both precached. Without a bump an
        // installed device keeps serving the old mark and a page whose head has
        // no manifest link in it at all.
        const block = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.match(block, /cacheName: 'tournament-v36-its-own-manifest'/);
    });

    // Minimal PNG corner reader — same approach as rattle_identity_test.js, kept
    // local so neither file can quietly change the other's meaning.
    function corners(file) {
        const zlib = require('zlib');
        const buf = fs.readFileSync(file);
        const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
        const bitDepth = buf[24], colourType = buf[25];
        if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) return [];
        const channels = colourType === 2 ? 3 : 4;
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
});
