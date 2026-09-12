// ============================================================================
// DEPLOYMENT BUILD — two outputs, one flat source tree
//
// build-shell.js produces dist/consumer and dist/tournament from the three
// product shell declarations in sync-mobile-web.js. This suite is what stops the
// split from being a hopeful copy operation.
//
// ---------------------------------------------------------------------------
// WHAT IT ACTUALLY CHECKS
// ---------------------------------------------------------------------------
//
// It runs the real build, twice, and inspects what landed on disk. Not the
// declarations, not the script's intentions - the bytes in the output. The four
// things worth being paranoid about:
//
//   1. MEMBERSHIP. A Tournament page in the Consumer output is a product leak; a
//      shared engine missing from either is a page that silently computes zero,
//      because every call site in this app guards its engines with
//      `typeof fn === 'function'`.
//
//   2. SELF-CONTAINMENT. Each output must resolve its own local references. A
//      404 on a <script src> does not throw - it just removes behaviour.
//
//   3. PWA IDENTITY. Two root-scope service workers cannot share an origin, and
//      two installable apps need two cache keys or they evict each other.
//
//   4. DETERMINISM. Two runs, same bytes. A build that drifts is a build whose
//      output nobody can review.
//
// ---------------------------------------------------------------------------
// WHAT IT DELIBERATELY DOES NOT CHECK
// ---------------------------------------------------------------------------
//
// Anything about how the app behaves. The golf, the money and the settlement are
// covered by the source suite against the source tree, and duplicating that here
// against copies of the same bytes would be theatre. This file is about the
// boundary.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');

const DIST = path.join(REPO_ROOT, 'dist');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function declared(name) {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];')
        .exec(read('sync-mobile-web.js'));
    assert.ok(m, name + ' must be declared');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const SHARED = declared('SHARED_SHELL');
const CONSUMER = declared('CONSUMER_SHELL');
const TOURNAMENT = declared('TOURNAMENT_SHELL');

// Generated per output rather than copied, so they are never "missing from
// source" and never identical between the two.
const GENERATED = ['sw.js', 'manifest.json'];

function runBuild() {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'build-shell.js')],
        { cwd: REPO_ROOT, stdio: 'pipe' });
}

const listing = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const outDir = (p) => path.join(DIST, p);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fingerprint(dir) {
    return listing(dir).map(f => f + ':' + sha(path.join(dir, f))).join('\n');
}

before(() => { runBuild(); });

// ===========================================================================
// 1. MEMBERSHIP
// ===========================================================================

describe('MEMBERSHIP — each output holds its own product and the shared core', () => {

    test('both outputs were produced', () => {
        assert.ok(fs.existsSync(outDir('consumer')), 'dist/consumer should exist');
        assert.ok(fs.existsSync(outDir('tournament')), 'dist/tournament should exist');
    });

    test('Consumer contains exactly SHARED + CONSUMER', () => {
        assert.deepEqual(listing(outDir('consumer')), SHARED.concat(CONSUMER).sort());
    });

    test('Tournament contains exactly SHARED + TOURNAMENT', () => {
        assert.deepEqual(listing(outDir('tournament')), SHARED.concat(TOURNAMENT).sort());
    });

    // THE NATIVE PROJECTS ARE NOT WEB OUTPUT. ios/ and android/ hold Xcode and
    // Gradle projects; dist/ is built by copying flat root filenames out of the
    // three declarations, so the only way a native tree could reach an output is
    // a declaration naming a path into it. Pinned here on the declarations AND
    // on the produced directories, so neither a list edit nor a build-script
    // edit can do it quietly.
    //
    // WHAT THIS DOES NOT SAY, measured 2026-09-11 rather than assumed: the LIVE
    // Cloudflare Pages site serves the repository root with no build step -
    // /ios/App/App/Info.plist answers 200 there today - so android/ will be
    // served the same way once it is on main. This test is about dist/, the
    // product-split output nothing deploys yet. Keeping secrets out of the
    // native trees is .gitignore's job, not this file's.
    test('no shell declaration names a path, so ios/ and android/ cannot enter dist/', () => {
        const all = SHARED.concat(CONSUMER).concat(TOURNAMENT);
        assert.ok(all.length >= 30, 'the declarations parsed to ' + all.length + ' entries');
        const pathy = all.filter(f => /[\/\\]/.test(f));
        assert.deepEqual(pathy, [], 'a declaration names a path: ' + pathy.join(', '));
        ['consumer', 'tournament'].forEach(pr => {
            const entries = listing(outDir(pr));
            assert.ok(entries.length >= 20, 'dist/' + pr + ' holds ' + entries.length + ' entries');
            ['ios', 'android', 'ios.zip', 'android.zip'].forEach(t =>
                assert.ok(!entries.includes(t), 'dist/' + pr + ' contains ' + t));
            entries.forEach(f => assert.ok(fs.statSync(path.join(outDir(pr), f)).isFile(),
                'dist/' + pr + '/' + f + ' is not a plain file'));
        });
    });

    test('no Tournament-only file leaked into Consumer', () => {
        const consumer = listing(outDir('consumer'));
        TOURNAMENT.forEach(f => assert.ok(!consumer.includes(f),
            f + ' is Tournament-only and must not ship to Consumer'));
    });

    test('no Consumer-only file leaked into Tournament', () => {
        const tournament = listing(outDir('tournament'));
        CONSUMER.forEach(f => assert.ok(!tournament.includes(f),
            f + ' is Consumer-only and must not ship to Tournament'));
    });

    test('every shared asset is in BOTH outputs', () => {
        const c = listing(outDir('consumer'));
        const t = listing(outDir('tournament'));
        SHARED.forEach(f => {
            assert.ok(c.includes(f), f + ' is shared but missing from Consumer');
            assert.ok(t.includes(f), f + ' is shared but missing from Tournament');
        });
    });

    test('the shared core specifically — no product may lose a golf rule', () => {
        // Named individually rather than left to the loop above, because these are
        // the files whose absence would change money rather than break a page.
        ['grouping.js', 'handicap.js', 'payouts.js', 'course-data.js',
         'score-marks.js', 'product-links.js'].forEach(f => {
            assert.ok(listing(outDir('consumer')).includes(f), 'Consumer lost ' + f);
            assert.ok(listing(outDir('tournament')).includes(f), 'Tournament lost ' + f);
        });
    });

    test('nothing undeclared appears in either output', () => {
        const declaredAll = new Set(SHARED.concat(CONSUMER).concat(TOURNAMENT));
        ['consumer', 'tournament'].forEach(p =>
            listing(outDir(p)).forEach(f => assert.ok(declaredAll.has(f),
                f + ' is in dist/' + p + ' but is declared in no shell')));
    });

    test('copied files are byte-identical to source', () => {
        // The build copies; it does not transform. Anything else would make the
        // output something other than the reviewed source.
        ['consumer', 'tournament'].forEach(p =>
            listing(outDir(p)).filter(f => !GENERATED.includes(f)).forEach(f =>
                assert.equal(sha(path.join(outDir(p), f)), sha(path.join(REPO_ROOT, f)),
                    f + ' was altered on the way into dist/' + p)));
    });
});

// ===========================================================================
// 2. SELF-CONTAINMENT AND ROUTES
// ===========================================================================

describe('SELF-CONTAINED — every local reference resolves inside its own output', () => {

    ['consumer', 'tournament'].forEach(product => {
        test(`${product}: every page's scripts and stylesheets are present`, () => {
            const dir = outDir(product);
            const present = new Set(listing(dir));
            listing(dir).filter(f => f.endsWith('.html')).forEach(page => {
                const html = fs.readFileSync(path.join(dir, page), 'utf8');
                const refs = [];
                for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) refs.push(m[1]);
                for (const m of html.matchAll(/<link[^>]*\shref="([^"]+)"/g)) refs.push(m[1]);
                refs.map(r => r.replace(/^\.\//, ''))
                    .filter(r => !r.startsWith('http') && !r.includes(':') && !r.includes('/'))
                    .forEach(r => assert.ok(present.has(r),
                        product + ': ' + page + ' references ' + r + ', which is not in the output'));
            });
        });
    });

    test('Consumer keeps every Consumer route', () => {
        const c = listing(outDir('consumer'));
        ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
         'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
         'shared.html', 'instructions.html'].forEach(r =>
            assert.ok(c.includes(r), 'Consumer lost the ' + r + ' route'));
    });

    test('Tournament keeps the organizer page AND the player scoring link', () => {
        // tournament-scorecard.html?tourney=X&team=N is what a competitor opens
        // from a text message. It is Tournament-owned and must not need the
        // Consumer app installed - or indeed anything installed.
        const t = listing(outDir('tournament'));
        assert.ok(t.includes('tournament.html'), 'Tournament lost the organizer page');
        assert.ok(t.includes('tournament-scorecard.html'), 'Tournament lost the scoring link');
        assert.ok(t.includes('tournament-engine.js'), 'Tournament lost its engine');
    });

    test('the scoring link still reads tourney and team from the query string', () => {
        // The route is only useful if the page still derives its identity from the
        // URL, which is also what makes one cached shell serve every team.
        const src = fs.readFileSync(path.join(outDir('tournament'), 'tournament-scorecard.html'), 'utf8');
        assert.match(src, /urlParams\.get\('tourney'\)/);
        assert.match(src, /urlParams\.get\('team'\)/);
    });
});

// ===========================================================================
// 3. PWA IDENTITY
// ===========================================================================

describe('PWA — two independent installable apps', () => {

    const swOf = (p) => fs.readFileSync(path.join(outDir(p), 'sw.js'), 'utf8');
    const manifestOf = (p) => JSON.parse(fs.readFileSync(path.join(outDir(p), 'manifest.json'), 'utf8'));

    test('the committed Tournament manifest is EXACTLY what the build generates', () => {
        // THE ONE COMMITTED PER-PRODUCT FILE, and the reason it is safe.
        //
        // tournament.html and tournament-scorecard.html link tournament-manifest.json
        // rather than manifest.json, because the live deployment is still the
        // combined repo root where manifest.json is the Consumer identity - a
        // tournament page linking that name would offer the wrong app to install.
        //
        // A hand-maintained second manifest is exactly the duplication this repo
        // refuses everywhere else, so it is not hand-maintained: it must be byte
        // for byte what manifestFor('tournament') produces. Change the product's
        // name, colours or icons in build-shell.js and this fails until the
        // committed copy is regenerated from the build output.
        const committed = fs.readFileSync(path.join(REPO_ROOT, 'tournament-manifest.json'), 'utf8');
        const generated = fs.readFileSync(path.join(outDir('tournament'), 'manifest.json'), 'utf8');
        assert.equal(committed, generated,
            'tournament-manifest.json has drifted from build-shell.js - copy dist/tournament/manifest.json over it');
    });

    test('the committed Tournament manifest is NOT the Consumer one', () => {
        // The failure this whole wave exists to prevent, asserted by content.
        const t = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tournament-manifest.json'), 'utf8'));
        const c = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.json'), 'utf8'));
        assert.notEqual(t.name, c.name, 'the two products must not share an install name');
        assert.notEqual(t.start_url, c.start_url);
        const icons = t.icons.map(i => i.src);
        assert.ok(icons.every(s => /^tournament-icon-/.test(s)), 'got ' + icons.join(', '));
        assert.ok(t.icons.every(i => i.purpose === 'any'),
            'a maskable crop cuts TOURNAMENTS down to URNAMEN');
    });

    test('each output has its own generated worker and manifest', () => {
        ['consumer', 'tournament'].forEach(p => GENERATED.forEach(f =>
            assert.ok(fs.existsSync(path.join(outDir(p), f)), 'dist/' + p + ' is missing ' + f)));
    });

    test('the two cache names are distinct and cannot collide', () => {
        const c = /const CACHE_VERSION = '([^']+)'/.exec(swOf('consumer'))[1];
        const t = /const CACHE_VERSION = '([^']+)'/.exec(swOf('tournament'))[1];
        assert.notEqual(c, t, 'both workers would evict each other');
        // The two versions are ALLOWED to diverge, and here they do: waves 19 and
        // 20 gave Tournament its own icon and its own manifest, so only Tournament
        // bumped. Consumer's artwork and manifest are byte-identical and its worker
        // must NOT move - a bump would re-download the Consumer shell for a change
        // that is not in it.
        assert.match(c, /^consumer-v\d+-/);
        assert.match(t, /^tournament-v\d+-/);
        assert.match(c, /^consumer-v45-no-native-print$/);
        assert.match(t, /^tournament-v36-its-own-manifest$/);
    });

    test('each worker precaches ONLY files present in its own output', () => {
        ['consumer', 'tournament'].forEach(p => {
            const present = new Set(listing(outDir(p)));
            const list = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(swOf(p))[1];
            const entries = [...list.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
            assert.ok(entries.length > 5, p + ' worker precaches only ' + entries.length + ' files');
            entries.forEach(f => assert.ok(present.has(f),
                p + ' worker precaches ' + f + ', which is not in that output'));
        });
    });

    test('no worker precaches the other product', () => {
        const cList = swOf('consumer');
        TOURNAMENT.forEach(f => assert.ok(!cList.includes("'./" + f + "'"),
            'Consumer worker precaches Tournament file ' + f));
        const tList = swOf('tournament');
        CONSUMER.forEach(f => assert.ok(!tList.includes("'./" + f + "'"),
            'Tournament worker precaches Consumer file ' + f));
    });

    test('no worker precaches itself', () => {
        ['consumer', 'tournament'].forEach(p =>
            assert.ok(!swOf(p).includes("'./sw.js'"), p + ' worker precaches itself'));
    });

    test('the caching strategy is unchanged in both', () => {
        // network-first, ignoreSearch on navigations, file-by-file precache. A
        // deployment split has no business altering any of them.
        ['consumer', 'tournament'].forEach(p => {
            const sw = swOf(p);
            assert.match(sw, /Network-first/);
            assert.match(sw, /ignoreSearch: true/);
            assert.match(sw, /cache\.add\(file\)\.catch/);
            assert.match(sw, /keys\.filter\(\(key\) => key !== CACHE_VERSION\)/);
        });
    });

    // THE FOUR REGEXES ABOVE ARE TEXT STANDING IN FOR STRUCTURE, and text let
    // the two handlers drift: the root sw.js stopped intercepting /api on
    // 2026-09-12 and build-shell.js's template copy did not, and every regex
    // above stayed green. So this runs each GENERATED worker's own fetch
    // handler through the same driver sw_api_bypass_test.js runs the real one
    // through, and measures what it does with an /api GET - not what its
    // source says.
    describe('BOTH GENERATED WORKERS LEAVE /api ALONE - measured, not matched', () => {
        const { loadServiceWorker, ORIGIN } = require('./helpers/sw-harness.js');
        const API = ORIGIN + '/api/course-search?q=legacy';

        ['consumer', 'tournament'].forEach(p => {
            test(`${p}: online, an /api GET is not intercepted and nothing is written to the cache`, async () => {
                const sw = loadServiceWorker(path.join(outDir(p), 'sw.js'), { online: true });
                const r = await sw.request({ url: API });
                assert.equal(r.handled, false,
                    `${p} worker called respondWith for an /api GET - the browser's own fetch must handle it`);
                assert.ok(!sw.puts.some(u => /\/api\//.test(u)),
                    `${p} worker wrote an /api response into ${sw.cacheName}: ` + JSON.stringify(sw.puts));
            });

            test(`${p}: offline, an /api GET gets neither a stored body nor the HTML shell`, async () => {
                const stale = { status: 503, body: '{"status":"unavailable","reason":"daily_limit"}' };
                const sw = loadServiceWorker(path.join(outDir(p), 'sw.js'), { online: false, seed: [[API, stale]] });
                const r = await sw.request({ url: API });
                // The message is built only on failure: JSON.stringify(undefined)
                // has no .slice, and an eager message threw on the PASSING path.
                if (r.handled) {
                    assert.fail(`${p} worker answered an offline /api GET with `
                        + (r.rejected ? 'a rejection' : ('status ' + (r.response && r.response.status) + ' '
                            + String(JSON.stringify(r.response && r.response.body)).slice(0, 60))));
                }
            });

            test(`${p}: POSITIVE CONTROL - a shell GET is still intercepted and cached by the same worker`, async () => {
                // Without this, a worker that intercepts NOTHING passes both
                // tests above. The exemption must be for /api, not for everything.
                const sw = loadServiceWorker(path.join(outDir(p), 'sw.js'), { online: true });
                const page = p === 'consumer' ? 'index.html?game=ABCD' : 'tournament.html?tourney=ABCD';
                const r = await sw.request({ url: page, mode: 'navigate', destination: 'document' });
                assert.equal(r.handled, true, `${p} worker did not intercept its own shell page`);
                assert.ok(sw.puts.includes(ORIGIN + '/' + page), `${p} worker did not cache its own shell page`);
                // And the pathname rule: "/api" in a QUERY is still the shell.
                const sw2 = loadServiceWorker(path.join(outDir(p), 'sw.js'), { online: true });
                const tricky = ORIGIN + '/' + page.split('?')[0] + '?next=/api/x';
                const r2 = await sw2.request({ url: tricky, mode: 'navigate', destination: 'document' });
                assert.equal(r2.handled, true, `${p} worker exempted a shell URL because its query mentions /api`);
            });
        });
    });

    test('each manifest is valid, installable and distinct', () => {
        const c = manifestOf('consumer');
        const t = manifestOf('tournament');
        [c, t].forEach(m => {
            assert.ok(m.name && m.short_name, 'a manifest needs a name');
            assert.equal(m.scope, './', 'each app owns its own origin root');
            assert.equal(m.display, 'standalone');
            assert.equal(m.icons.length, 2);
        });
        assert.notEqual(c.name, t.name, 'the two apps must be distinguishable when installed');
        assert.equal(c.start_url, './admin.html');
        assert.equal(t.start_url, './tournament.html');
    });

    test('each start_url is a page that output actually contains', () => {
        ['consumer', 'tournament'].forEach(p => {
            const start = manifestOf(p).start_url.replace(/^\.\//, '');
            assert.ok(listing(outDir(p)).includes(start),
                'dist/' + p + ' start_url points at ' + start + ', which is not there');
        });
    });

    test('pwa-boot.js registers the worker at its own root in both', () => {
        // Same source file in both outputs, resolving to a different worker because
        // it is a different origin. Neither output may point at the other.
        ['consumer', 'tournament'].forEach(p => {
            const boot = fs.readFileSync(path.join(outDir(p), 'pwa-boot.js'), 'utf8');
            assert.match(boot, /navigator\.serviceWorker\.register\('sw\.js', \{ scope: '\.\/' \}\)/);
        });
    });
});

// ===========================================================================
// 4. CROSS-PRODUCT BOUNDARY
// ===========================================================================

describe('CROSS-PRODUCT LINKS — the relationship survives two origins', () => {

    test('product-links.js ships to both and defaults to same-origin', () => {
        ['consumer', 'tournament'].forEach(p =>
            assert.ok(listing(outDir(p)).includes('product-links.js'),
                'dist/' + p + ' is missing the boundary seam'));

        const src = read('product-links.js');
        assert.match(src, /consumer: ''/, 'no origin may be hard-coded before it is known');
        assert.match(src, /tournament: ''/);
    });

    test('with no origins configured, every link is exactly what it was', () => {
        const sandbox = {};
        require('vm').createContext(sandbox);
        require('vm').runInContext(read('product-links.js'), sandbox);
        assert.equal(sandbox.tournamentUrl('tournament.html'), 'tournament.html');
        assert.equal(sandbox.consumerUrl('trip.html?trip=ABC'), 'trip.html?trip=ABC');
    });

    test('with origins configured, links cross to the other deployment', () => {
        const sandbox = {};
        require('vm').createContext(sandbox);
        require('vm').runInContext(read('product-links.js'), sandbox);
        require('vm').runInContext(
            "GOLF_PRODUCT_ORIGINS.tournament = 'https://t.example'; " +
            "GOLF_PRODUCT_ORIGINS.consumer = 'https://c.example/';", sandbox);
        assert.equal(sandbox.tournamentUrl('tournament.html?trip=X'),
            'https://t.example/tournament.html?trip=X');
        assert.equal(sandbox.consumerUrl('trip.html?trip=X'),
            'https://c.example/trip.html?trip=X', 'a trailing slash must not double up');
    });

    test('no cross-product page still hard-codes a bare relative link', () => {
        // The three sites the audit found. If one reverts to a bare href, it works
        // today and breaks silently the moment the origins differ - which is the
        // failure this seam exists to prevent.
        const admin = read('admin.html');
        assert.match(admin, /tournamentUrl\('tournament\.html'\)/);
        assert.ok(!/window\.location\.href = 'tournament\.html'/.test(admin));

        const trip = read('trip.html');
        assert.match(trip, /tournamentUrl\(`tournament\.html\?trip=/);
        assert.match(trip, /tournamentUrl\(`tournament\.html\?tourney=/);

        const tourn = read('tournament.html');
        assert.match(tourn, /consumerUrl\(`trip\.html\?trip=/);
    });

    test('the trip and tournament data relationship is untouched', () => {
        // B8 separates deployments, not products. Both Firebase pointers stay.
        assert.match(read('tournament.html'), /trips\/\$\{[a-zA-Z]+\}\/tournaments\//);
        assert.match(read('trip.html'), /tripData\.tournaments/);
    });
});

// ===========================================================================
// 5. FIREBASE AND DETERMINISM
// ===========================================================================

describe('FIREBASE — one project, unchanged', () => {

    test('both outputs point at the same Firebase project', () => {
        const ids = ['consumer', 'tournament'].map(p => {
            const page = p === 'consumer' ? 'index.html' : 'tournament.html';
            const html = fs.readFileSync(path.join(outDir(p), page), 'utf8');
            return /projectId:\s*"([^"]+)"/.exec(html)[1];
        });
        assert.equal(ids[0], ids[1], 'the two deployments must share one Firebase project');
    });

    test('the vendored SDK is identical in both, and is the same one as source', () => {
        ['firebase-app-compat.js', 'firebase-database-compat.js'].forEach(f => {
            const src = sha(path.join(REPO_ROOT, f));
            assert.equal(sha(path.join(outDir('consumer'), f)), src);
            assert.equal(sha(path.join(outDir('tournament'), f)), src);
        });
        // The auth SDK is Tournament-only: byte-identical to source in that
        // output, and ABSENT from Consumer, which has no page that loads it.
        const auth = 'firebase-auth-compat.js';
        assert.equal(sha(path.join(outDir('tournament'), auth)), sha(path.join(REPO_ROOT, auth)));
        assert.ok(!fs.existsSync(path.join(outDir('consumer'), auth)),
            'firebase-auth-compat.js leaked into dist/consumer - no Consumer page loads it');
    });

    test('the security rules were not touched by a deployment batch', () => {
        const rules = JSON.parse(read('database.rules.json')).rules;
        assert.equal(rules.events.$eventCode['.read'], true);
        // An exact string, not a looser match: the rule that stops an anonymous
        // whole-tournament delete must survive a deployment batch byte for byte.
        assert.equal(rules.tournaments.$tourneyCode['.write'], '!data.exists() || newData.exists()');
        assert.equal(rules.app_settings['.write'], false);
    });
});

describe('DETERMINISM — same source in, same bytes out', () => {

    test('rebuilding produces byte-identical outputs', () => {
        const before = ['consumer', 'tournament'].map(p => fingerprint(outDir(p)));
        runBuild();
        const after = ['consumer', 'tournament'].map(p => fingerprint(outDir(p)));
        assert.deepEqual(after, before, 'the build is not deterministic');
    });

    test('the build wipes rather than merges', () => {
        // A file left from an earlier run is indistinguishable from one that belongs
        // there, and it hides exactly the failure the membership tests exist to catch.
        const stray = path.join(outDir('consumer'), 'STRAY-FROM-A-PREVIOUS-RUN.txt');
        fs.writeFileSync(stray, 'x');
        runBuild();
        assert.ok(!fs.existsSync(stray), 'dist/consumer kept a file from a previous build');
    });

    test('build-shell.js reads membership from the declarations, not its own list', () => {
        // The whole point of B7 was that ownership is decided once, in one place.
        // A build script with its own copy of the lists would quietly become the
        // real answer.
        const src = read('build-shell.js');
        ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL'].forEach(n =>
            assert.ok(src.includes("declaredList('" + n + "')"),
                'build-shell.js must read ' + n + ' from sync-mobile-web.js'));
        assert.ok(!/const SHARED_SHELL = \[/.test(src),
            'build-shell.js must not restate the declarations');
    });
});
