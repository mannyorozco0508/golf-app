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

    test('each output has its own generated worker and manifest', () => {
        ['consumer', 'tournament'].forEach(p => GENERATED.forEach(f =>
            assert.ok(fs.existsSync(path.join(outDir(p), f)), 'dist/' + p + ' is missing ' + f)));
    });

    test('the two cache names are distinct and cannot collide', () => {
        const c = /const CACHE_VERSION = '([^']+)'/.exec(swOf('consumer'))[1];
        const t = /const CACHE_VERSION = '([^']+)'/.exec(swOf('tournament'))[1];
        assert.notEqual(c, t, 'both workers would evict each other');
        // The two versions are ALLOWED to diverge, and here they do: only Consumer
        // assets changed in the Rattle Golf identity batch, so only Consumer bumped.
        assert.match(c, /^consumer-v\d+-/);
        assert.match(t, /^tournament-v\d+-/);
        assert.match(c, /^consumer-v39-skins-setup$/);
        assert.match(t, /^tournament-v32-consumer-ready$/);
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
    });

    test('the security rules were not touched by a deployment batch', () => {
        const rules = JSON.parse(read('database.rules.json')).rules;
        assert.equal(rules.events.$eventCode['.read'], true);
        assert.equal(rules.tournaments.$tourneyCode['.write'], true);
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
