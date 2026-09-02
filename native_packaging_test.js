// ============================================================================
// NATIVE PACKAGING — what this file can and cannot prove
//
// AUTOMATED VERIFIED: everything below. These are static properties of the repo -
// which files enter the native bundle, where the wrapper points, that the name and
// bundle id live in one place, that no engine was forked for native.
//
// DEVICE/XCODE VERIFICATION REQUIRED, and NOT claimed here: that the app compiles,
// signs, launches, renders correctly inside WKWebView, handles the iOS keyboard,
// respects safe areas, or passes review. Node cannot prove any of that, and a test
// that pretended to would be worse than no test.
//
// THE ONE REAL DEFECT THIS BATCH FOUND: sync-mobile-web.js built the native bundle
// from the union of all three shells, so tournament.html, tournament-scorecard.html
// and tournament-engine.js were being packaged into the golfer's iOS app. Every
// other part of the repo has enforced the two-product boundary for several batches;
// this one script still merged them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SYNC = read('sync-mobile-web.js');
const CAP = read('capacitor.config.ts');

const declared = name => {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(SYNC);
    assert.ok(m, name + ' must be declared');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const SHARED = declared('SHARED_SHELL');
const CONSUMER = declared('CONSUMER_SHELL');
const TOURNAMENT = declared('TOURNAMENT_SHELL');

// ---------------------------------------------------------------------------
describe('THE NATIVE TARGET IS CONSUMER, AND ONLY CONSUMER', () => {
    test('the bundle is SHARED + CONSUMER, derived not restated', () => {
        assert.match(SYNC, /const FILES_TO_SYNC = SHARED_SHELL\.concat\(CONSUMER_SHELL\);/);
    });

    test('NEGATIVE CONTROL — no Tournament page may enter the native bundle', () => {
        assert.ok(!/FILES_TO_SYNC = .*TOURNAMENT_SHELL/.test(SYNC),
            'the golfer app must not ship the organizer console');
        TOURNAMENT.forEach(f => {
            assert.ok(!SHARED.includes(f) && !CONSUMER.includes(f),
                f + ' is Tournament-owned and must stay out of the Consumer bundle');
        });
    });

    test('the Consumer pages a golfer actually needs are all present', () => {
        ['admin.html', 'index.html', 'trip.html', 'settlement.html', 'stats.html',
         'leaderboard.html', 'skins.html', 'sidematches.html', 'instructions.html']
            .forEach(f => assert.ok(CONSUMER.includes(f), f + ' must ship natively'));
    });

    test('the shared golf core is intact — nothing forked for native', () => {
        ['grouping.js', 'handicap.js', 'payouts.js', 'course-data.js',
         'score-marks.js', 'text-safe.js', 'product-links.js']
            .forEach(f => assert.ok(SHARED.includes(f), f + ' must remain shared'));
        // No native-only duplicate of an engine.
        const files = fs.readdirSync(REPO_ROOT);
        files.forEach(f => {
            assert.ok(!/-native\.js$|native-.*engine/.test(f),
                f + ' looks like a forked native engine');
        });
    });

    test('Tournament keeps its own future bundle from the same lists', () => {
        assert.match(SYNC, /SHARED_SHELL\.concat\(TOURNAMENT_SHELL\)/,
            'the rule for the second product must be stated, not invented later');
    });
});

// ---------------------------------------------------------------------------
describe('THE WRAPPER POINTS AT THE BUNDLE, NOT A SERVER', () => {
    test('webDir is the local bundle', () => {
        assert.match(CAP, /webDir: 'www'/);
    });

    test('NEGATIVE CONTROL — no server URL, no localhost, no preview origin', () => {
        assert.ok(!/server\s*:/.test(CAP),
            'a hosted server URL would make a Cloudflare outage brick the installed binary');
        assert.ok(!/localhost|127\.0\.0\.1|ngrok|\.pages\.dev|preview/i.test(CAP),
            'a development origin must never reach a shipped build');
    });

    test('the app id and display name live in exactly one place', () => {
        assert.match(CAP, /appId: '[^']+'/);
        assert.match(CAP, /appName: '[^']+'/);
        // One file owns NATIVE identity. Note that admin.html and index.html also
        // contain an `appId:` - that is the FIREBASE web app id, an entirely
        // different key, and matching on the bare word made this fail for the wrong
        // reason. What must not leak is a reverse-DNS bundle identifier.
        const others = ['admin.html', 'index.html', 'build-shell.js']
            .filter(f => /appId:\s*'com\./.test(read(f)));
        assert.deepEqual(others, [], 'the native bundle id must not leak into web files');
    });

    test('the native id is the LOCKED production bundle identifier', () => {
        // A bundle id cannot be changed once a record exists in App Store Connect,
        // so com.rattlegolf.app is permanent from the first TestFlight upload on.
        assert.match(CAP, /appId: 'com\.rattlegolf\.app'/,
            'the production bundle identifier is com.rattlegolf.app and is permanent');
    });

    test('the retired placeholder bundle id cannot silently return', () => {
        assert.ok(!/com\.golfapp\.app/.test(CAP),
            'com.golfapp.app was retired at the Rattle Golf rename and must never come back');
    });
});

// ---------------------------------------------------------------------------
describe('THE SERVICE WORKER DOES NOT RUN INSIDE THE NATIVE SHELL', () => {
    const boot = read('pwa-boot.js');

    test('registration is skipped on a native platform', () => {
        assert.match(boot, /if \(isNativeShell\(\)\) return 'skipped-native';/);
    });

    test('native detection covers both the plugin and the capacitor: scheme', () => {
        assert.match(boot, /window\.Capacitor\.isNativePlatform/);
        assert.match(boot, /location\.protocol === 'capacitor:'/);
    });

    test('NEGATIVE CONTROL — two caches with two version numbers is the failure mode', () => {
        // The bundle IS the cache in a native build. A worker on top of it is a second,
        // independently-versioned copy that can serve a shell older than the binary,
        // with no way for the golfer to refresh it away.
        const fn = boot.slice(boot.indexOf('function registerServiceWorker'),
            boot.indexOf('// ---- Pending-write tracking'));
        assert.match(fn, /isNativeShell\(\)/, 'the guard must be the first thing it does');
    });
});

// ---------------------------------------------------------------------------
describe('THE OFFLINE STORY STAYS HONEST IN NATIVE', () => {
    const boot = read('pwa-boot.js');

    test('a failed write is never shown as saved', () => {
        assert.match(boot, /Offline \\u2014 keep this page open/);
        // Comments stripped: the file explains at length that it never says "Saved"
        // or "Synced", and matching that prose is not the same as matching output.
        const code = boot.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/textContent = .*(Saved|Synced)/.test(code),
            'RTDB fires local events before the server sees anything');
    });

    test('the pending counter is a counter, not a flag', () => {
        assert.match(boot, /pending = Math\.max\(0, pending - 1\)/);
    });
});

// ---------------------------------------------------------------------------
describe('CROSS-PRODUCT NAVIGATION STAYS OUTBOUND', () => {
    test('Tournament is reached through the configured seam, never bundled', () => {
        assert.match(read('trip.html'), /tournamentUrl\(/);
        assert.match(read('product-links.js'), /GOLF_PRODUCT_ORIGINS/);
    });

    test('NEGATIVE CONTROL — no production origin is hardcoded anywhere', () => {
        ['admin.html', 'trip.html', 'index.html', 'product-links.js'].forEach(f => {
            const code = read(f).split('\n').filter(l => !l.trim().startsWith('//')
                && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
            assert.ok(!/https:\/\/[a-z0-9-]+\.pages\.dev/i.test(code),
                f + ' hardcodes a deployment origin');
        });
    });

    test('the origins config ships empty, meaning same-origin', () => {
        assert.match(read('product-links.js'), /consumer: ''/);
    });
});

// ---------------------------------------------------------------------------
describe('WEB AND NATIVE VERSIONS ARE DIFFERENT CONCEPTS', () => {
    test('the web cache version is not a native app version', () => {
        assert.match(read('sw.js'), /const CACHE_VERSION = 'golfapp-v\d+-[a-z-]+';/);
        assert.ok(!/CACHE_VERSION/.test(CAP),
            'coupling them would force a store submission for a web cache bump');
    });

    test('no native version literal has been scattered into web files', () => {
        ['index.html', 'admin.html', 'build-shell.js'].forEach(f => {
            assert.ok(!/CFBundleShortVersionString|MARKETING_VERSION/.test(read(f)),
                f + ' must not carry native versioning');
        });
    });
});
