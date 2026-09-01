// ============================================================================
// THE FIREBASE SDK, SERVED FROM THIS ORIGIN
//
// All 11 data-bearing pages load the SDK from gstatic.com. Nothing is vendored,
// so on a genuinely cold offline launch - installed at home, opened for the first
// time at a remote course - the page paints from the precached shell and then
// throws before any of its own code runs:
//
//     ReferenceError: firebase is not defined
//
// Measured on tournament.html, tournament-scorecard.html, index.html and
// admin.html. It is a whole-PWA limitation, and the Capacitor bundle carries the
// same remote dependency.
//
// BATCH 7A ONLY MAKES THE SDK AVAILABLE. The two files are added at the repo
// root, precached, and shipped to the native bundle - but the 11 pages still
// point at gstatic. Batch 7B flips them over. This file pins that transitional
// state deliberately, so a green run cannot be mistaken for a finished job:
//
//     LOCAL SDK PRESENT        YES
//     PWA PRECACHE             YES
//     NATIVE SYNC              YES
//     PAGES USING LOCAL SDK    NO     <- asserted, not aspirational
//     COLD-OFFLINE FIX         NO
//
// WHY REPO ROOT AND NOT vendor/: sync-mobile-web.js copies into a flat DEST with
// no mkdir for subdirectories, and its bundle verifier skips any script path
// containing '/'. A vendor/ path would break the copy AND silently exempt these
// two files from the very check that matters most.
//
// WHY THE HASHES ARE PINNED: these are third-party bytes nobody in this project
// reads. A size and a SHA-256 are the only practical evidence that what shipped
// is what was downloaded, and they are what will catch a truncated upload.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(REPO_ROOT, f));
const bytesOf = (f) => fs.statSync(path.join(REPO_ROOT, f)).size;
const sha256 = (f) =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex');

// Externally downloaded and verified from the official Firebase CDN. These are
// the exact bytes of the version the app already runs - this batch changes where
// the SDK is served from, never which SDK it is.
const FIREBASE_VERSION = '9.22.2';
const SDK = [
    { file: 'firebase-app-compat.js',
      bytes: 28949,
      sha256: 'c6ad3c008576e76c9f8c625cc7dee1763d7ecd38e1c921ffe0587a38d06d264d',
      cdn: `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js` },
    { file: 'firebase-database-compat.js',
      bytes: 165658,
      sha256: '1fdd331f8fd0448f9d7ce97573cb828a83aad7a7bb2c4da0e75fdb9563eef129',
      cdn: `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database-compat.js` },
];
// app defines the global that database attaches to, so app must load first.
const APP_SDK = SDK[0].file;
const DATABASE_SDK = SDK[1].file;

// The 11 pages that use Firebase. instructions.html deliberately absent - it is
// the one production page with no Firebase reference at all.
const FIREBASE_PAGES = ['index.html','admin.html','leaderboard.html','settlement.html',
                        'shared.html','sidematches.html','skins.html','stats.html',
                        'tournament.html','tournament-scorecard.html','trip.html'];
const NO_FIREBASE_PAGES = ['instructions.html'];

function shellFiles() {
    const m = read('sw.js').match(/const SHELL_FILES = \[([\s\S]*?)\];/);
    assert.ok(m, 'SHELL_FILES must exist in sw.js');
    return [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'\.\/([^']+)'/g)].map(x => x[1]);
}
function filesToSync() {
    // Derived from the three product shell declarations now - see sync-mobile-web.js.
    const src = read('sync-mobile-web.js');
    const parts = ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL']
        .map(name => src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];')));
    parts.forEach((p, i) => assert.ok(p,
        ['SHARED_SHELL', 'CONSUMER_SHELL', 'TOURNAMENT_SHELL'][i] + ' must exist'));
    const m = [null, parts.map(p => p[1]).join(',')];
    // Comments stripped first: an earlier count read a path out of a comment and
    // reported one entry too many.
    return [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map(x => x[1]);
}
const cacheVersion = () => read('sw.js').match(/const CACHE_VERSION = '([^']+)'/)[1];
const scriptSrcs = (page) =>
    [...read(page).matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);

// ============================================================================

describe('THE VENDORED SDK FILES ARE EXACTLY WHAT WAS DOWNLOADED', () => {

    SDK.forEach(sdk => {
        test(`${sdk.file} exists at the repo root`, () => {
            assert.ok(exists(sdk.file),
                sdk.file + ' is missing. Upload it to the repository ROOT via GitHub\u2019s ' +
                '"Upload files" - do not paste it into the web editor.');
        });

        test(`${sdk.file} is exactly ${sdk.bytes} bytes`, () => {
            assert.equal(bytesOf(sdk.file), sdk.bytes,
                'size mismatch - a truncated or re-saved upload');
        });

        test(`${sdk.file} matches its SHA-256`, () => {
            // The only real evidence that the shipped bytes are the downloaded bytes.
            assert.equal(sha256(sdk.file), sdk.sha256);
        });
    });

    test(`the app SDK reports version ${FIREBASE_VERSION}`, () => {
        // Read from inside the file, not from a filename or a URL.
        const src = read(APP_SDK);
        assert.ok(src.includes(FIREBASE_VERSION),
            APP_SDK + ' does not contain the string "' + FIREBASE_VERSION + '"');
        assert.match(src, /SDK_VERSION\s*=\s*["']9\.22\.2["']|"9\.22\.2"/,
            'the app compat build must identify itself as ' + FIREBASE_VERSION);
    });

    test('the database SDK is the compat build, not modular', () => {
        const src = read(DATABASE_SDK);
        assert.ok(src.length > 100000, 'implausibly small for the database compat build');
        assert.ok(/firebase/i.test(src));
    });

    test('neither file was reformatted or regenerated', () => {
        // Both ship minified. A prettified copy would still "work" but would no
        // longer be the audited artifact, and the hash above would already fail -
        // this states the intent for whoever reads the failure.
        SDK.forEach(s => {
            const lines = read(s.file).split('\n').length;
            assert.ok(lines < 100,
                s.file + ' has ' + lines + ' lines; the official build is minified. ' +
                'Do not reformat vendored third-party code.');
        });
    });
});

describe('THE SDK IS PRECACHED AND SHIPPED', () => {

    SDK.forEach(sdk => {
        test(`${sdk.file} is in the service-worker shell`, () => {
            assert.ok(shellFiles().includes(sdk.file),
                sdk.file + ' must be precached or a cold offline launch still has no SDK');
        });

        test(`${sdk.file} is in the mobile bundle`, () => {
            assert.ok(filesToSync().includes(sdk.file),
                sdk.file + ' must ship to www/app/ or the native app still fetches gstatic');
        });
    });

    test('the app SDK is listed before the database SDK in both lists', () => {
        // Load order is set by each page's <script> tags, not by these arrays - but
        // listing them in dependency order keeps the intent visible to the next editor.
        [['SHELL_FILES', shellFiles()], ['FILES_TO_SYNC', filesToSync()]].forEach(([name, list]) => {
            const a = list.indexOf(APP_SDK), d = list.indexOf(DATABASE_SDK);
            assert.ok(a > -1 && d > -1, name + ' must contain both');
            assert.ok(a < d, name + ': the app SDK must be listed before the database SDK');
        });
    });

    test('they are at the repo root, not in a subdirectory', () => {
        // vendor/ would break the flat copy loop and be skipped by the bundle verifier.
        SDK.forEach(s => {
            assert.ok(!s.file.includes('/'), s.file + ' must be a flat repo-root filename');
            assert.ok(shellFiles().includes(s.file));
            assert.ok(filesToSync().includes(s.file));
        });
    });

    test('the cache version moved off v6', () => {
        // install only runs for a new version; without a bump, installed devices
        // keep their v6 cache and never fetch the SDK.
        assert.notEqual(cacheVersion(), 'golfapp-v6-tournament-shell');
        assert.match(cacheVersion(), /^golfapp-v[7-9]|^golfapp-v\d\d/);
    });

    test('the two shell lists still agree', () => {
        const shell = shellFiles(), sync = filesToSync();
        const PWA_ONLY = ['sw.js'];
        shell.filter(f => /\.(html|js)$/.test(f)).forEach(f => {
            if (PWA_ONLY.includes(f)) return;
            assert.ok(sync.includes(f), f + ' is precached but not shipped to mobile');
        });
        sync.filter(f => /\.(html|js)$/.test(f)).forEach(f => {
            if (PWA_ONLY.includes(f)) return;
            assert.ok(shell.includes(f), f + ' ships to mobile but is not precached');
        });
    });
});

describe('EVERY PAGE NOW LOADS THE LOCAL SDK', () => {

    // INVERTED IN BATCH 7B. These previously asserted the opposite - that all 11
    // pages still pointed at gstatic - written that way so finishing the migration
    // would fail them and force a deliberate review. That is what happened.

    FIREBASE_PAGES.forEach(page => {
        test(`${page} loads both SDKs locally`, () => {
            const srcs = scriptSrcs(page);
            SDK.forEach(s => assert.ok(srcs.includes('./' + s.file),
                page + ' must load ./' + s.file + ' from this origin'));
        });
    });

    test('no page still points at gstatic', () => {
        // A half-migrated app is worse than either end state: some pages offline-
        // capable, others not, with no obvious signal which is which.
        FIREBASE_PAGES.forEach(page => {
            const srcs = scriptSrcs(page);
            SDK.forEach(s => assert.ok(!srcs.includes(s.cdn),
                page + ' still references ' + s.cdn));
        });
    });

    test('no production page references gstatic Firebase at all', () => {
        FIREBASE_PAGES.concat(NO_FIREBASE_PAGES).forEach(page => {
            assert.ok(!read(page).includes('gstatic.com/firebasejs'),
                page + ' still carries a remote Firebase SDK URL');
        });
    });

    test('SDK AVAILABILITY IS NOT DATA AVAILABILITY', () => {
        // The boundary of what this migration proves, kept permanent on purpose.
        //
        // The Firebase JS SDK now loads with no network. That is NOT the same as a
        // round's data being available: RTDB still needs to have cached that round
        // at some point. A round never opened online will load the SDK, initialize,
        // and find nothing. It fails gracefully instead of throwing - a real
        // improvement, and not "the app works offline".
        FIREBASE_PAGES.forEach(page => {
            assert.match(read(page), /firebase\.database\(\)/,
                page + ' still talks to RTDB, whose offline state is its own concern');
        });
    });

    test('every Firebase page loads app before database', () => {
        // The ordering that actually matters: database-compat attaches to the global
        // that app-compat defines. Asserted now so 7B cannot reverse it unnoticed.
        FIREBASE_PAGES.forEach(page => {
            const srcs = scriptSrcs(page).filter(s => /firebase-(app|database)-compat/.test(s));
            assert.equal(srcs.length, 2, page + ' should load exactly two Firebase scripts');
            assert.match(srcs[0], /firebase-app-compat/, page + ': app SDK must come first');
            assert.match(srcs[1], /firebase-database-compat/, page + ': database SDK second');
        });
    });

    test('instructions.html still needs no Firebase at all', () => {
        NO_FIREBASE_PAGES.forEach(p => {
            assert.ok(!read(p).includes('firebase'),
                p + ' gained a Firebase dependency; it had none');
        });
    });

    test('the version is pinned by the vendored file hashes, not by a URL', () => {
        // With the CDN URLs gone there is no version string in the pages. The pin is
        // now the SHA-256 of each vendored file, asserted at the top of this suite,
        // plus the version string inside the app build.
        FIREBASE_PAGES.forEach(page => {
            assert.equal(scriptSrcs(page).filter(s => s.includes('firebasejs')).length, 0,
                page + ' should have no versioned CDN URL left');
        });
        assert.ok(read(APP_SDK).includes(FIREBASE_VERSION),
            'the vendored app build must still identify as ' + FIREBASE_VERSION);
    });
});

describe('BATCH 7A CHANGED NO PAGE', () => {

    test('all 11 Firebase pages still carry exactly two Firebase scripts', () => {
        FIREBASE_PAGES.forEach(page => {
            const n = scriptSrcs(page).filter(s => /firebase/.test(s)).length;
            assert.equal(n, 2, page + ' has ' + n + ' Firebase scripts, expected 2');
        });
    });

    test('instructions.html gained nothing', () => {
        // The one production page with no Firebase dependency. It must not have
        // acquired one during the migration.
        NO_FIREBASE_PAGES.forEach(page => {
            SDK.forEach(s => assert.ok(!read(page).includes(s.file),
                page + ' must remain Firebase-free'));
            assert.ok(!read(page).includes('firebase'), page + ' must remain Firebase-free');
        });
    });

    test('Firebase initialization is untouched', () => {
        FIREBASE_PAGES.forEach(page => {
            assert.match(read(page), /firebase\.initializeApp\(/, page);
            assert.match(read(page), /firebase\.database\(\)/, page);
        });
    });

    test('this batch adds no authentication and no rules change', () => {
        // Vendoring the SDK does not hide the Firebase config, add auth, or change
        // RTDB authorization. Stated so the two projects stay separate.
        const rules = read('database.rules.json');
        assert.ok(!rules.includes('auth'), 'no authentication was introduced');
        assert.match(read('admin.html'), /function makeOrganizerToken/,
            'organizerToken is untouched');
    });
});
