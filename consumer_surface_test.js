// ============================================================================
// CONSUMER SURFACE — no camera, no photo library, no OCR
//
// The scorecard scanner is out of Consumer 1.0. It ran Tesseract.js on-device to
// pre-fill the par/handicap grid from a photo, and it was removed for two
// independent reasons:
//
//   1. Accuracy was not good enough to put in front of golfers.
//   2. It was the app's ONLY camera/photo entry point. Its existence made
//      privacy.html's "No contacts, photos, camera or microphone access" false,
//      and it would have required NSCameraUsageDescription and
//      NSPhotoLibraryUsageDescription in the iOS build - a crash on launch of
//      that picker if either were missing.
//
// THE POLICY TEST IS THE POINT. Removing a button is easy; the thing that rots is
// the agreement between what the shipped app does and what the shipped policy
// claims. POLICY_MATCHES_MARKUP below reads the actual claim out of privacy.html
// and holds every Consumer page to it, so the two cannot drift apart again -
// whichever side someone changes first.
//
// The page list is DERIVED from sync-mobile-web.js rather than hard-coded, so a
// page added to the Consumer shell tomorrow is covered by these tests without
// anyone remembering to add it here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Pull the shell declarations straight from the build so this list cannot go stale.
function shellPages() {
    const src = read('sync-mobile-web.js');
    const grab = (name) => {
        const at = src.indexOf('const ' + name + ' = [');
        assert.notEqual(at, -1, name + ' must exist in sync-mobile-web.js');
        const body = src.slice(at, src.indexOf('];', at));
        return (body.match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, ''));
    };
    return grab('SHARED_SHELL').concat(grab('CONSUMER_SHELL'))
        .filter(f => f.endsWith('.html'));
}

// Standalone web pages that ship alongside the app and describe it to users.
const SUPPORTING_PAGES = ['privacy.html', 'terms.html', 'support.html'];

const CAMERA_MARKUP = [
    /capture\s*=\s*["']?(environment|user)/i,   // opens the camera directly
    /accept\s*=\s*["']image\/\*/i,              // opens the photo library
    /getUserMedia/,                             // live camera stream
];

const OCR_RUNTIME = [
    /tesseract/i,
    /cdn\.jsdelivr\.net[^"']*tesseract/i,
];

describe('Consumer 1.0 opens no camera and no photo library', () => {

    test('no shell page carries camera or photo-picker markup', () => {
        shellPages().forEach(page => {
            const src = read(page);
            CAMERA_MARKUP.forEach(rx => {
                assert.ok(!rx.test(src),
                    `${page} contains camera/photo markup matching ${rx}. Consumer 1.0 must not open the camera or photo library.`);
            });
        });
    });

    test('no scorecard-scanner entry point survives anywhere in the shell', () => {
        // Named handles rather than a general word search: "scan" legitimately
        // appears in unrelated copy ("scan on the tee", "scans as one row").
        const HANDLES = [
            'scorecard-photo-input',
            'handleScorecardPhoto',
            'setOcrStatus',
            'parseScorecardText',
            'applyParsedScorecard',
            'ocr-status',
        ];
        shellPages().forEach(page => {
            const src = read(page);
            HANDLES.forEach(h => {
                assert.ok(!src.includes(h),
                    `${page} still references ${h} - the scanner has a surviving entry point.`);
            });
        });
    });

    test('nothing in the Consumer shell loads OCR at runtime', () => {
        // The scanner injected a <script> from a CDN on first use. Beyond the
        // offline failure that caused, a runtime third-party fetch is exactly what
        // the privacy policy says does not happen.
        shellPages().forEach(page => {
            const src = read(page);
            OCR_RUNTIME.forEach(rx => {
                // The removal note names Tesseract to explain itself; allow prose in
                // comments, forbid anything that could execute or be fetched.
                const codeish = src.split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');
                assert.ok(!rx.test(codeish),
                    `${page} still has a runtime OCR reference matching ${rx}.`);
            });
        });
    });

    test('the supporting pages do not promise a scanner that no longer exists', () => {
        SUPPORTING_PAGES.forEach(page => {
            const src = read(page);
            assert.ok(!/scan a scorecard with your camera/i.test(src),
                `${page} still tells golfers they can scan a scorecard with the camera.`);
        });
    });
});

describe('the privacy policy matches the shipped Consumer app', () => {

    // THE GUARD THAT MATTERS. Read the claim from the policy itself, then hold the
    // product to it. If the scanner ever returns, this fails until somebody
    // deliberately rewrites the policy to match - which is the correct order of
    // operations, and the one that was missed the first time.
    test('POLICY_MATCHES_MARKUP: no camera claim while no camera markup exists', () => {
        const policy = read('privacy.html');
        const claimsNoCamera = /No contacts, photos, camera or microphone access/i.test(policy);
        assert.ok(claimsNoCamera,
            'privacy.html should state plainly that the app takes no camera/photo access.');

        const offenders = [];
        shellPages().forEach(page => {
            const src = read(page);
            if (CAMERA_MARKUP.some(rx => rx.test(src))) offenders.push(page);
        });
        assert.deepEqual(offenders, [],
            'privacy.html claims no camera or photo access, but these pages open one: '
            + offenders.join(', ') + '. Fix the app or fix the policy - they must agree.');
    });
});

// The native Consumer bundle excludes tournament.html by design, while
// tournamentUrl() returns a relative path whenever both products share an origin.
// Inside Capacitor that combination is a link to a file that is not there.
describe('Consumer native build offers no route into Tournament', () => {

    test('the native check is exposed for pages to use', () => {
        const boot = read('pwa-boot.js');
        assert.match(boot, /isNative: isNativeShell,/,
            'pwa-boot already knows whether it is inside Capacitor; pages need the same answer.');
    });

    test('the trip page withholds the Tournament section natively', () => {
        const src = read('trip.html');
        assert.match(src, /window\.GolfNet\.isNative\(\)/,
            'trip.html must gate its Tournament section on the native check.');
        const at = src.indexOf('isNative()');
        const link = src.indexOf('tournament.html?tourney=');
        assert.ok(at > -1 && link > -1 && at < link,
            'the gate must come before the links are rendered');
    });

    test('the legacy admin route out is gated too', () => {
        const body = read('admin.html');
        const a = body.indexOf('function openTournamentsApp()');
        assert.notEqual(a, -1);
        const fn = body.slice(a, a + 500);
        assert.match(fn, /isNative\(\)\) return;/,
            'openTournamentsApp must refuse to navigate inside the native bundle.');
    });
});

describe('App Review wording', () => {

    test('the manifest describes a game tracker, not a betting tracker', () => {
        const manifest = JSON.parse(read('manifest.json'));
        assert.ok(!/betting/i.test(manifest.description),
            'manifest.json describes the app to the store and the home screen; "betting" is the '
            + 'highest-signal gambling word in the product and reads as a real-money service.');
        assert.match(manifest.description, /game tracker/i);
    });

    test('ordinary golf vocabulary is left alone', () => {
        // Guards against over-correction in the other direction: skins, Nassau,
        // presses and buy-ins are what these games are called, and scrubbing them
        // would make the app worse without making it safer.
        const src = read('admin.html');
        ['Skins', 'Nassau', 'buy-in'].forEach(word => {
            assert.ok(src.includes(word),
                `admin.html no longer mentions "${word}" - normal golf terminology should not be scrubbed.`);
        });
    });
});
