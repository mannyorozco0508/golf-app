// ============================================================================
// PRODUCT SHELL DECLARATIONS — CLASSIFICATION, NOT SURGERY
//
// sync-mobile-web.js now declares SHARED_SHELL, CONSUMER_SHELL and
// TOURNAMENT_SHELL: which of the two future products owns each shipped file.
// FILES_TO_SYNC is their union, so nothing about the current build, the service
// worker, the routes or the URLs changed. This suite exists to keep it that way,
// and to keep the classification honest.
//
// ---------------------------------------------------------------------------
// WHY DECLARE OWNERSHIP BEFORE SPLITTING ANYTHING
// ---------------------------------------------------------------------------
//
// Because the alternative is deciding it during the split, when a wrong answer is
// a deployment incident rather than a failing test. The architecture audit found
// that the two products already barely share code - the tournament pages load
// neither money-engine.js nor settlement-engine.js - and the shared core has since
// been made explicit as grouping.js, handicap.js and payouts.js. What was missing
// was a written statement of which side everything else falls on.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE MUST NOT BECOME
// ---------------------------------------------------------------------------
//
// A place where a file quietly changes sides. Every membership assertion below
// names the file, so moving one is a visible edit here and not a diff nobody
// reads. The two most consequential are asserted individually: the money engines
// are Consumer, and tournament-scorecard.html is Tournament.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function listIn(src, name) {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(src);
    assert.ok(m, name + ' must be declared');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const sync = read('sync-mobile-web.js');
const SHARED = listIn(sync, 'SHARED_SHELL');
const CONSUMER = listIn(sync, 'CONSUMER_SHELL');
const TOURNAMENT = listIn(sync, 'TOURNAMENT_SHELL');
const UNION = SHARED.concat(CONSUMER).concat(TOURNAMENT);

const SW = read('sw.js');
const SHELL_FILES = listIn(SW, 'SHELL_FILES').map(f => f.replace(/^\.\//, ''));

// ===========================================================================
// 1. THE THREE SETS ARE WELL FORMED
// ===========================================================================

describe('DECLARATIONS — three sets, no overlap, nothing orphaned', () => {

    test('all three are declared and non-trivial', () => {
        assert.ok(SHARED.length >= 10, 'SHARED_SHELL got ' + SHARED.length);
        assert.ok(CONSUMER.length >= 14, 'CONSUMER_SHELL got ' + CONSUMER.length);
        assert.ok(TOURNAMENT.length >= 3, 'TOURNAMENT_SHELL got ' + TOURNAMENT.length);
    });

    test('a file belongs to exactly one product', () => {
        const seen = {};
        UNION.forEach(f => { seen[f] = (seen[f] || 0) + 1; });
        const dupes = Object.keys(seen).filter(f => seen[f] > 1);
        assert.deepEqual(dupes, [],
            'these files are declared in more than one shell: ' + dupes.join(', '));
    });

    test('every declared file exists on disk', () => {
        UNION.forEach(f => assert.ok(fs.existsSync(path.join(REPO_ROOT, f)),
            f + ' is declared but does not exist'));
    });

    test('FILES_TO_SYNC is the union, derived rather than maintained separately', () => {
        // The one assertion that keeps the declarations from drifting into fiction.
        assert.match(sync,
            /const FILES_TO_SYNC = SHARED_SHELL\.concat\(CONSUMER_SHELL\)\.concat\(TOURNAMENT_SHELL\);/,
            'FILES_TO_SYNC must be built from the declarations, not written out again');
    });
});

// ===========================================================================
// 2. THE CLASSIFICATION ITSELF
// ===========================================================================

describe('OWNERSHIP — named, so a file cannot quietly change sides', () => {

    test('SHARED holds the golf rules both products must agree on', () => {
        ['grouping.js', 'handicap.js', 'payouts.js', 'course-data.js', 'score-marks.js']
            .forEach(f => assert.ok(SHARED.includes(f), f + ' must be SHARED'));
    });

    test('SHARED holds the runtime neither product can boot without', () => {
        ['firebase-app-compat.js', 'firebase-database-compat.js', 'pwa-boot.js',
         'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png']
            .forEach(f => assert.ok(SHARED.includes(f), f + ' must be SHARED'));
    });

    test('the money engines are CONSUMER, not shared', () => {
        // The load-bearing call. Wagering between golfers is Consumer's domain, and
        // the tournament pages have never loaded any of these - they pay places from
        // an entry fee. Declaring them shared would invite a future Tournament
        // feature to depend on Consumer settlement.
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js',
         'action-model.js', 'bet-strip.js', 'hole-events.js'].forEach(f => {
            assert.ok(CONSUMER.includes(f), f + ' must be CONSUMER');
            assert.ok(!SHARED.includes(f), f + ' must NOT be declared shared');
            assert.ok(!TOURNAMENT.includes(f), f + ' must NOT be declared Tournament');
        });
    });

    test('every golfer-facing page is CONSUMER', () => {
        ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
         'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
         'instructions.html', 'shared.html'].forEach(f => {
            assert.ok(CONSUMER.includes(f), f + ' must be CONSUMER');
            assert.ok(!TOURNAMENT.includes(f), f + ' must not be declared Tournament-only');
        });
    });

    test('TOURNAMENT keeps the organizer product AND its player scoring surface', () => {
        // tournament-scorecard.html is the install-free link a competitor opens. It
        // is small and golfer-facing, which is exactly why it is worth pinning here:
        // it belongs to the product that created the event, not to Consumer.
        ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => {
                assert.ok(TOURNAMENT.includes(f), f + ' must be TOURNAMENT');
                assert.ok(!CONSUMER.includes(f), f + ' must not be declared Consumer-only');
            });
    });

    test('the shared core is genuinely reachable from both products', () => {
        // Shared is a claim about need, not about tidiness. Each shared golf rule
        // must actually be loaded by at least one page on each side.
        const consumerPages = CONSUMER.filter(f => f.endsWith('.html'));
        const tournamentPages = TOURNAMENT.filter(f => f.endsWith('.html'));
        const loadedBy = (pages, module) =>
            pages.some(p => new RegExp('<script src="' + module.replace('.', '\\.') + '">').test(read(p)));

        assert.ok(loadedBy(consumerPages, 'payouts.js'), 'a Consumer page must load payouts.js');
        assert.ok(loadedBy(tournamentPages, 'payouts.js'), 'a Tournament page must load payouts.js');
        assert.ok(loadedBy(consumerPages, 'course-data.js'), 'a Consumer page must load course-data.js');
        assert.ok(loadedBy(tournamentPages, 'course-data.js'), 'a Tournament page must load course-data.js');
    });
});

// ===========================================================================
// 3. NOTHING ABOUT THE CURRENT DEPLOYMENT MOVED
//
// The declarations are metadata. If any of these fail, B7 stopped being
// classification and became surgery.
// ===========================================================================

describe('CURRENT DEPLOYMENT — unchanged, and provably so', () => {

    test('the combined bundle still ships every file the app needs', () => {
        // Every precached shell file is still shipped to the native bundle. sw.js
        // does not precache itself, and the package/CLI files were never shipped.
        SHELL_FILES.filter(f => f !== 'sw.js').forEach(f =>
            assert.ok(UNION.includes(f),
                f + ' is precached but no longer declared in any shell'));
    });

    test('every declared file is still precached, or is deliberately not', () => {
        // A service worker does not precache itself - the browser fetches it, and
        // caching it would pin the worker that is meant to replace itself. sw.js is
        // declared SHARED because it still SHIPS to the native bundle.
        const NOT_PRECACHED = ['sw.js'];
        UNION.filter(f => !SHELL_FILES.includes(f)).forEach(f =>
            assert.ok(NOT_PRECACHED.includes(f),
                f + ' is declared but not precached - if that is deliberate, list it here'));
    });

    test('there is still ONE service worker and ONE manifest', () => {
        // B8 creates two. B7 must not.
        assert.equal(SHARED.filter(f => f === 'sw.js').length, 1);
        assert.equal(SHARED.filter(f => f === 'manifest.json').length, 1);
        // B8 gives each deployment its own worker and manifest, but they are
        // GENERATED into dist/ by build-shell.js - there is still exactly one of
        // each in the source tree, which is the thing that stays reviewable.
        ['sw-consumer.js', 'sw-tournament.js', 'manifest-consumer.json',
         'manifest-tournament.json'].forEach(f =>
            assert.ok(!fs.existsSync(path.join(REPO_ROOT, f)),
                f + ' exists in source - the per-product files are generated, not committed'));
    });

    test('dist/ is GENERATED output, never source', () => {
        // REVERSED IN B8. This used to assert that dist/ did not exist at all,
        // because a declaration batch had no business producing deployment
        // artifacts. B8 produces exactly two, from these same declarations - so the
        // useful statement is now that they are generated and ignored rather than
        // checked in, and that nothing in the source tree depends on them existing.
        const ignore = fs.readFileSync(path.join(REPO_ROOT, 'gitignore'), 'utf8');
        assert.match(ignore, /^dist\/$/m, 'dist/ must be ignored - it is build output');
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'build-shell.js')),
            'the outputs must be reproducible from a build script in the repo');
        // The source tree still stands on its own: every declared file exists at the
        // root, which is what makes a rebuild from scratch possible.
        [...SHARED, ...CONSUMER, ...TOURNAMENT].forEach(f =>
            assert.ok(fs.existsSync(path.join(REPO_ROOT, f)),
                f + ' is declared but no longer in the flat source tree'));
    });

    test('the service worker still serves one scope, network-first, ignoring queries', () => {
        // The three behaviours every parameterised link depends on. A declaration
        // batch has no business touching any of them.
        assert.match(SW, /scope/i);
        assert.match(SW, /Network-first: always prefer the latest deployed version/);
        assert.match(SW, /ignoreSearch: true/);
    });

    test('pwa-boot.js still registers exactly one worker at the current scope', () => {
        assert.match(read('pwa-boot.js'), /navigator\.serviceWorker\.register\('sw\.js', \{ scope: '\.\/' \}\)/);
    });

    test('every current route still exists', () => {
        // Nothing may disappear from under a link somebody has already shared.
        ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
         'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
         'shared.html', 'instructions.html',
         'tournament.html', 'tournament-scorecard.html'].forEach(page =>
            assert.ok(fs.existsSync(path.join(REPO_ROOT, page)), page + ' has disappeared'));
    });

    test('B8 can build two outputs from these declarations without inventing ownership', () => {
        // The point of the whole batch, stated as a check: each side is a complete,
        // self-contained set once shared is added to it.
        const consumerBuild = SHARED.concat(CONSUMER);
        const tournamentBuild = SHARED.concat(TOURNAMENT);

        // Every page in a build has every local script it loads, inside that build.
        [[consumerBuild, 'consumer'], [tournamentBuild, 'tournament']].forEach(([build, label]) => {
            build.filter(f => f.endsWith('.html')).forEach(page => {
                [...read(page).matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
                    .map(m => m[1].replace(/^\.\//, ''))
                    .filter(src => src.endsWith('.js') && !src.includes('/') && !src.includes(':'))
                    .forEach(script => assert.ok(build.includes(script),
                        label + ' build: ' + page + ' loads ' + script + ', which it would not have'));
            });
        });
    });
});
