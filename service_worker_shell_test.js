// ============================================================================
// TOURNAMENT MODE BELONGS IN THE PRECACHED SHELL
//
// sw.js is network-first with unconditional runtime caching, so any page fetched
// successfully once is available offline afterwards. That is why this gap was
// narrow rather than total: Tournament Mode worked offline IF the golfer had
// opened it while connected at least once.
//
// It did not work on a FIRST offline launch. Install the app at home, drive to a
// remote course, open Tournament Mode for the first time there, and the service
// worker had nothing stored - the golfer got the "No connection" page. For a
// buddies trip that is exactly when it matters.
//
// WHAT THIS BATCH DOES NOT FIX - READ BEFORE TRUSTING A GREEN RUN.
//
// Precaching these three files means Tournament Mode's own HTML and JS no longer
// depend on a prior visit. It does NOT mean Tournament Mode works on a true cold
// offline launch, because every data-bearing page loads the Firebase SDK from
// https://www.gstatic.com/firebasejs/ and nothing is vendored locally. With that
// script unavailable, the inline page script throws:
//
//     ReferenceError: firebase is not defined
//
// measured on tournament.html, tournament-scorecard.html, index.html and
// admin.html - so this is a whole-PWA limitation, not a Tournament one. The
// native/Capacitor bundle carries the same remote dependency.
//
// That is logged as its own future batch (VENDOR FIREBASE SDK LOCALLY) and is
// asserted below as a KNOWN limitation, so nobody reads these passing tests as
// "offline Tournament works".
//
// THE UNDERLYING DEFECT was two hand-maintained lists of the same shell:
//
//     sync-mobile-web.js FILES_TO_SYNC : 26 entries, INCLUDED the tournament files
//     sw.js SHELL_FILES                : 22 entries, EXCLUDED them
//
// The mobile bundle shipped Tournament Mode while the PWA precache did not. So
// the last describe here asserts the two lists agree, and fails on the next
// divergence rather than letting it reach a course.
//
// The exceptions are declared explicitly below rather than filtered silently: a
// list of things a test deliberately ignores is exactly where the next gap hides.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The three files Tournament Mode needs, and who needs them.
const TOURNAMENT_PAGES = ['tournament.html', 'tournament-scorecard.html'];
const TOURNAMENT_ENGINE = 'tournament-engine.js';
const TOURNAMENT_FILES = TOURNAMENT_PAGES.concat([TOURNAMENT_ENGINE]);

// Parsed from source rather than executed: sw.js is a service worker and cannot
// be require()d, and FILES_TO_SYNC is a module-level const in a CLI script.
function shellFiles() {
    const src = read('sw.js');
    const m = src.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
    assert.ok(m, 'SHELL_FILES must exist in sw.js');
    return [...m[1].matchAll(/'\.\/([^']+)'/g)].map(x => x[1]);
}
function filesToSync() {
    const src = read('sync-mobile-web.js');
    const m = src.match(/const FILES_TO_SYNC = \[([\s\S]*?)\];/);
    assert.ok(m, 'FILES_TO_SYNC must exist in sync-mobile-web.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
function cacheVersion() {
    const m = read('sw.js').match(/const CACHE_VERSION = '([^']+)'/);
    assert.ok(m, 'CACHE_VERSION must exist');
    return m[1];
}
// LOCAL scripts a page loads. Cross-origin ones - Firebase's CDN, the QR library -
// are deliberately excluded: they are not in the repo, cannot be precached from
// this origin, and the browser handles them with its own HTTP cache. A first
// version of this helper counted them and demanded the shell hold a
// cdnjs.cloudflare.com URL, which is not a thing a shell can do.
//
// This does mean a genuinely first-time offline launch still has no Firebase SDK.
// That is a real limitation of the current architecture, not something precaching
// three files fixes, and it is out of scope here - noted so it is not mistaken for
// coverage this test provides.
function scriptsOf(page) {
    return [...read(page).matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
        .map(m => m[1])
        .filter(src => !/^https?:\/\//.test(src))
        .map(src => src.replace(/^\.?\//, ''));
}

// ---------------------------------------------------------------------------
// CROSS-LIST EXCEPTIONS — declared, not silently filtered.
//
// These files legitimately belong to one environment only. Anything NOT listed
// here must appear in both lists.
// ---------------------------------------------------------------------------
const PWA_ONLY = [
    // The service worker cannot meaningfully precache itself; the browser fetches
    // it directly and by its own update lifecycle, not through the cache.
    'sw.js',
];
const SYNC_ONLY = [
    // Copied into www/app/ so the wrapped app ships them, but the service worker
    // registers sw.js separately and the icons/manifest are referenced by the
    // manifest itself rather than needing shell precache parity.
];
const BOTH_BY_DESIGN = [
    // Shell assets that genuinely belong in both.
    'manifest.json', 'icon-192.png', 'icon-512.png',
];

// ============================================================================

describe('THE TOURNAMENT SHELL IS PRECACHED', () => {

    TOURNAMENT_FILES.forEach(f => {
        test(`${f} is in the precache`, () => {
            // Precached means: available without a prior visit to Tournament Mode.
            // It does not mean the page is functional offline - see the Firebase
            // limitation asserted at the end of this file.
            assert.ok(shellFiles().includes(f),
                f + ' must be precached, not left to a lucky prior visit');
        });
    });

    test('both tournament pages have their LOCAL scripts covered', () => {
        // A cached page whose local script is missing renders a broken shell, which
        // is worse than the offline notice: it looks like the app is working.
        // Cross-origin scripts are a separate, unsolved problem - see below.
        const shell = shellFiles();
        TOURNAMENT_PAGES.forEach(page => {
            assert.ok(shell.includes(page), page + ' must be precached');
            scriptsOf(page).forEach(js => {
                assert.ok(shell.includes(js),
                    page + ' loads ' + js + ', which is not in the precache');
            });
        });
    });

    test('tournament-engine.js is genuinely required by both pages', () => {
        // Guards against precaching something no page loads.
        TOURNAMENT_PAGES.forEach(page => {
            assert.ok(scriptsOf(page).includes(TOURNAMENT_ENGINE),
                page + ' must actually load ' + TOURNAMENT_ENGINE);
        });
    });

    test('every precached page has every script it loads', () => {
        // The same rule the bundle verifier applies, asserted for the shell too.
        const shell = shellFiles();
        shell.filter(f => f.endsWith('.html')).forEach(page => {
            scriptsOf(page).forEach(js => {
                assert.ok(shell.includes(js),
                    page + ' loads ' + js + ', missing from the shell');
            });
        });
    });
});

describe('THE CACHE VERSION MOVED', () => {

    test('it is not still v5', () => {
        // install only runs for a NEW version, and activate deletes non-matching
        // caches. Without a bump, every installed device keeps its 22-entry cache
        // and never fetches the tournament files.
        assert.notEqual(cacheVersion(), 'golfapp-v5-pwa-activation',
            'adding precache entries without bumping strands existing installs');
    });

    test('and it still looks like a golfapp cache key', () => {
        assert.match(cacheVersion(), /^golfapp-v\d+/,
            'the activate handler deletes every key that is not this one');
    });
});

describe('THE TWO SHELL LISTS AGREE', () => {

    test('every synced page and engine is also precached', () => {
        // The actual defect: FILES_TO_SYNC shipped Tournament Mode while
        // SHELL_FILES did not. Two hand-maintained lists of the same shell.
        const shell = shellFiles();
        const missing = filesToSync()
            .filter(f => /\.(html|js)$/.test(f))
            .filter(f => !PWA_ONLY.includes(f) && !SYNC_ONLY.includes(f))
            .filter(f => !shell.includes(f));
        assert.deepEqual(missing, [],
            'shipped to mobile but not precached: ' + missing.join(', '));
    });

    test('every precached page and engine is also synced to mobile', () => {
        const sync = filesToSync();
        const missing = shellFiles()
            .filter(f => /\.(html|js)$/.test(f))
            .filter(f => !PWA_ONLY.includes(f) && !SYNC_ONLY.includes(f))
            .filter(f => !sync.includes(f));
        assert.deepEqual(missing, [],
            'precached but not shipped to mobile: ' + missing.join(', '));
    });

    test('the exceptions are exactly what we intend them to be', () => {
        // Written down so a future reader sees WHY each list differs, rather than
        // discovering an unexplained filter.
        assert.deepEqual(PWA_ONLY, ['sw.js'],
            'sw.js is fetched by the browser lifecycle, not from its own cache');
        assert.deepEqual(SYNC_ONLY, []);
        BOTH_BY_DESIGN.forEach(f => {
            assert.ok(shellFiles().includes(f), f + ' should be precached');
            assert.ok(filesToSync().includes(f), f + ' should be synced');
        });
    });

    test('sw.js does not try to precache itself', () => {
        assert.ok(!shellFiles().includes('sw.js'));
    });

    test('no deleted file has crept back into either list', () => {
        // The five removed in the dead-file batch. A stale entry would make
        // cache.add() fail at install and log a warning nobody reads.
        const gone = ['index_original_fallback.html', 'admin_original_fallback.html',
                      'sidematches_original_fallback.html', 'mo-master-key.html',
                      '\u2060manage-beta.html', 'manage-beta.html'];
        const shell = shellFiles(), sync = filesToSync();
        gone.forEach(f => {
            assert.ok(!shell.includes(f), f + ' is deleted but still precached');
            assert.ok(!sync.includes(f), f + ' is deleted but still synced');
        });
    });

    test('every listed file actually exists on disk', () => {
        // cache.add() on a missing file rejects and is only console.warn'd, so a
        // typo would degrade offline support silently.
        [...new Set(shellFiles().concat(filesToSync()))].forEach(f => {
            assert.ok(fs.existsSync(path.join(REPO_ROOT, f)),
                f + ' is listed but does not exist');
        });
    });
});

describe('KNOWN LIMITATION: FIREBASE IS STILL REMOTE', () => {

    // These tests assert a gap that this batch deliberately does NOT close. They
    // exist so a future reader cannot mistake the precache work above for offline
    // functionality, and so the day someone vendors the SDK, these fail and force
    // the claim to be re-examined rather than quietly drifting.

    const DATA_PAGES = ['index.html','admin.html','leaderboard.html','sidematches.html',
                        'settlement.html','stats.html','skins.html','trip.html',
                        'tournament.html','tournament-scorecard.html','shared.html'];

    test('no data-bearing page loads Firebase from the CDN any more', () => {
        // INVERTED IN BATCH 7B. Previously asserted every page loaded the SDK
        // cross-origin - the condition that made a cold offline launch throw.
        DATA_PAGES.forEach(p => {
            assert.ok(!read(p).includes('gstatic.com/firebasejs'),
                p + ' still loads the Firebase SDK cross-origin');
        });
    });

    test('the Firebase SDK IS now vendored locally and precached', () => {
        // RETARGETED IN BATCH 7A. This previously asserted that nothing was vendored,
        // written deliberately so that vendoring the SDK would fail it and force the
        // offline claims to be re-examined. That is exactly what happened.
        //
        // What changed: both compat builds now live at the repo root and are in the
        // service-worker shell, so a cold offline launch has the SDK available.
        // What did NOT change: the 11 pages still load from gstatic, so the
        // cold-offline problem is not yet solved - asserted below and in 7A's own
        // transitional block.
        ['firebase-app-compat.js','firebase-database-compat.js'].forEach(f => {
            assert.ok(fs.existsSync(path.join(REPO_ROOT, f)),
                f + ' must exist at the repo root');
            assert.ok(shellFiles().includes(f),
                f + ' must be precached, or a cold offline launch still has no SDK');
        });
    });

    test('the SDK now loads from this origin on every page', () => {
        // INVERTED IN BATCH 7B. The ReferenceError this once described is gone: the
        // SDK is precached and served locally, so it is present before page script
        // runs even on a first-ever offline launch.
        ['index.html','admin.html'].forEach(p => {
            assert.match(read(p), /firebase\.initializeApp/,
                p + ' initializes Firebase at page scope');
            assert.match(read(p), /src="\.\/firebase-app-compat\.js"/, p);
            assert.match(read(p), /src="\.\/firebase-database-compat\.js"/, p);
        });
    });

    test('Firebase init is unguarded, so a missing SDK throws rather than degrading', () => {
        // Not a bug to fix here - just the reason a cold offline launch shows a
        // broken shell instead of a useful offline state.
        const src = read('tournament.html');
        assert.match(src, /firebase\.initializeApp\(firebaseConfig\)/);
        assert.ok(!/typeof firebase\s*[!=]==?\s*['\"]undefined/.test(src),
            'no typeof guard today; if one is added, update these expectations');
    });

    test('the native bundle now ships the SDK locally too', () => {
        // RETARGETED IN BATCH 7A. Previously asserted the wrapped app fetched the SDK
        // over the network. sync-mobile-web.js now copies both compat builds into
        // www/app/, so the Capacitor build carries them on disk.
        ['firebase-app-compat.js','firebase-database-compat.js'].forEach(f => {
            assert.ok(filesToSync().includes(f),
                f + ' must ship to www/app/ or the native app still fetches gstatic');
        });
    });

    test('THE REMAINING LIMITATION: SDK availability is not data availability', () => {
        // What 7B did and did not achieve, kept permanent so the distinction is not
        // collapsed into a generic "works offline" claim.
        //
        // DONE:     the Firebase JS SDK loads with no network, on every page, PWA
        //           and native alike. The ReferenceError is gone.
        // NOT DONE: a round that has never been opened online has no cached RTDB
        //           data. It will initialize and find nothing. That is a graceful
        //           empty state rather than a crash - an improvement, not a fix.
        DATA_PAGES.forEach(p => {
            assert.match(read(p), /src="\.\/firebase-app-compat\.js"/, p + ' loads the SDK locally');
            assert.match(read(p), /firebase\.database\(\)/,
                p + ' still depends on RTDB, whose offline cache is a separate concern');
        });
    });
});

describe('NOTHING ELSE IN THE SERVICE WORKER MOVED', () => {

    test('it is still network-first with runtime caching', () => {
        const src = read('sw.js');
        assert.match(src, /fetch\(request\)/, 'network-first');
        assert.match(src, /cache\.put\(request, responseClone\)/, 'runtime caching');
        assert.match(src, /catch\(\(\) => fromCacheOrOffline\(\)\)/, 'cache is the fallback');
    });

    test('the offline page and navigation fallback are unchanged', () => {
        const src = read('sw.js');
        assert.match(src, /ignoreSearch: true/, 'group links share one cached shell');
        assert.match(src, /No connection/, 'the offline notice remains');
        assert.match(src, /status: 503/);
    });

    test('activate still purges older caches', () => {
        assert.match(read('sw.js'), /keys\.filter\(\(key\) => key !== CACHE_VERSION\)/);
    });

    test('no tournament business logic was touched', () => {
        const eng = read('tournament-engine.js');
        assert.ok(!eng.includes('SHELL_FILES') && !eng.includes('CACHE_VERSION'),
            'the engine must know nothing about caching');
    });
});
