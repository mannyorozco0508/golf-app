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
        // URGENT-066 #4 (2026-10-24): the microphone left this sentence on purpose - voice scoring in
        // the HardPan GPS app uses it - and the policy says so in its own section (test below).
        const claimsNoCamera = /No contacts, photos or camera access/i.test(policy);
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

// ============================================================================
// THE NEW TRUTH (URGENT-066 feature 2, scorecard-scan-ai, Manny approved Oct 24).
// The HardPan GPS app (gps-beta, GPS_ENABLED=1) may open the camera - for ONE
// thing: the paper scorecard scan. Everything above still holds for Consumer 1.0
// (no camera markup on any page, no Tesseract, no OCR at runtime). What this adds:
//   - the camera is reachable from the scan files only, and they are GPS-only;
//   - the GPS app asks with an honest NSCameraUsageDescription, the Consumer app
//     asks for nothing;
//   - the one native camera is the VisionKit document scanner plugin;
//   - while privacy.html still says "no camera", NOTHING mounts the scan: when the
//     Scan button lands (customize-screen's registry), this fails until the policy
//     says what the scan does. Same order of operations as POLICY_MATCHES_MARKUP.
// ============================================================================
describe('HardPan GPS app: the camera opens only for the scorecard scan', () => {
    const SCAN_FILES = ['gps-scan-client.js', 'gps-scan-grid.js', 'scorecard-validate.js'];
    const CAMERA_CODE = [
        /capture\s*=\s*["']?(environment|user)/i,
        /setAttribute\(\s*['"]capture['"]/,
        /getUserMedia/,
        /HardPanDocScan/,
        /accept\s*=\s*["']image\/\*/i,
        /['"]accept['"]\s*,\s*['"]image\/\*/,
    ];
    const allShell = () => {
        const src = read('sync-mobile-web.js');
        const grab = (name) => {
            const at = src.indexOf('const ' + name + ' = [');
            const body = src.slice(at, src.indexOf('];', at));
            return (body.match(/'([^']+)'/g) || []).map(x => x.replace(/'/g, ''));
        };
        return [...new Set(grab('SHARED_SHELL').concat(grab('CONSUMER_SHELL'), grab('GPS_SHELL')))]
            .filter(f => /\.(js|html)$/.test(f) && fs.existsSync(path.join(REPO_ROOT, f)));
    };
    const haveScan = fs.existsSync(path.join(REPO_ROOT, 'gps-scan-client.js'));

    test('only the scan client opens a camera or photo picker; every other shell file opens none', { skip: !haveScan && 'Consumer tree' }, () => {
        const offenders = [];
        allShell().forEach(f => {
            if (f === 'gps-scan-client.js') return;
            const code = read(f).split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');
            CAMERA_CODE.forEach(rx => { if (rx.test(code)) offenders.push(f + ' ' + rx); });
        });
        assert.deepEqual(offenders, [], 'camera / photo code outside the scorecard scan');
        const client = read('gps-scan-client.js');
        assert.match(client, /HardPanDocScan/, 'the scan client is the one camera entry: the VisionKit plugin');
        assert.match(client, /setAttribute\('capture', 'environment'\)/, 'and the web fallback file input');
    });

    test('the scan files are GPS only: inside the GPS block, so Consumer 1.0 ships none of them', { skip: !haveScan && 'Consumer tree' }, () => {
        const sync = read('sync-mobile-web.js');
        const at = sync.indexOf('const CONSUMER_SHELL = [');
        const consumer = sync.slice(at, sync.indexOf('];', at));
        const g0 = consumer.indexOf('// GPS:BEGIN'), g1 = consumer.indexOf('// GPS:END');
        SCAN_FILES.forEach(f => {
            const i = consumer.indexOf("'" + f + "'");
            assert.ok(i > g0 && i < g1 && g0 > -1, f + ' must sit inside the CONSUMER_SHELL GPS block');
        });
        const html = read('index.html');
        SCAN_FILES.forEach(f => {
            const i = html.indexOf('<script src="' + f + '"></script>');
            assert.ok(i > -1, 'index.html loads ' + f);
            assert.ok(html.lastIndexOf('<!-- GPS:BEGIN -->', i) > html.lastIndexOf('<!-- GPS:END -->', i), f + ' loads inside a GPS block');
        });
    });

    test('permission strings: the GPS app asks for the camera, honestly; the Consumer app asks for nothing', () => {
        const consumer = read('ios/App/App/Info.plist');
        assert.ok(!/NSCameraUsageDescription|NSPhotoLibraryUsageDescription/.test(consumer), 'the Consumer app takes no camera or photo library');
        if (!haveScan) return;
        const gps = read('gps-beta/ios/App/App/Info.plist');
        const m = /<key>NSCameraUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(gps);
        assert.ok(m, 'gps-beta Info.plist must carry NSCameraUsageDescription or iOS kills the app on the first scan');
        assert.match(m[1], /only when you tap Scan scorecard/i, 'the reason names the one use');
        assert.match(m[1], /scorecard/i);
        assert.ok(!/NSPhotoLibraryUsageDescription/.test(gps), 'no read access to Photos (the web picker is PHPicker, which needs none)');
    });

    test('the one native camera is the VisionKit document scanner, registered like the Live Activity plugin', { skip: !haveScan && 'Consumer tree' }, () => {
        const sw = read('gps-beta/ios/App/PhoneBridge/HardPanDocScanPlugin.swift');
        assert.match(sw, /VNDocumentCameraViewController/);
        assert.match(sw, /jsName = "HardPanDocScan"/);
        assert.ok(!/URLSession|URLRequest|PHPhotoLibrary|UIImageWriteToSavedPhotosAlbum|FileManager/.test(sw), 'the plugin sends nothing and stores nothing');
        assert.match(read('gps-beta/ios/App/PhoneBridge/HardPanBridgeViewController.swift'), /registerPluginInstance\(HardPanDocScanPlugin\(\)\)/);
        const pbx = read('gps-beta/ios/App/App.xcodeproj/project.pbxproj');
        assert.match(pbx, /HardPanDocScanPlugin\.swift in Sources/, 'compiled into the App target');
        // No new package: the iOS plugin allowlist is untouched.
        const cap = JSON.parse(read('gps-beta/capacitor.config.json'));
        assert.ok(!cap.ios.includePlugins.some(p => /camera|scan|document/i.test(p)), 'no camera npm plugin linked');
    });

    test('POLICY_MATCHES_MARKUP (GPS): while privacy.html says "no camera", nothing mounts the scan', { skip: !haveScan && 'Consumer tree' }, () => {
        const policy = read('privacy.html');
        // phone3: 066 #4 reworded the line to "No contacts, photos or camera access" (the microphone got its own section) - still "no camera".
        if (!/No contacts, photos,? (?:or )?camera/i.test(policy)) return;   // the policy now describes the scan
        const callers = allShell().filter(f => !SCAN_FILES.includes(f))
            .filter(f => /HardPanScan\.(open|scan)\s*\(/.test(read(f).split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n')));
        assert.deepEqual(callers, [],
            'privacy.html still says the app takes no camera access, but these files mount the scorecard scan: ' + callers.join(', ')
            + '. Update privacy.html (camera used only to scan a scorecard; photo + names/course/par sent to Google Gemini, not stored) first.');
    });
});

// URGENT-066 #4: THE MICROPHONE - the new truth, held the same way. The policy names the microphone
// only for voice scoring; the Consumer app asks for no microphone at all (its Info.plist and its pages);
// the HardPan GPS app's Info.plist carries both permission strings, and the voice files ship in GPS only.
describe('the microphone: voice scoring in HardPan GPS only, and the policy says so', () => {
    test('the policy explains the microphone and speech use - on the phone where possible, nothing kept', () => {
        const policy = read('privacy.html');
        assert.match(policy, /<h2>Microphone and voice scoring<\/h2>/);
        assert.match(policy, /microphone is on only while you hold or tap the voice button/);
        assert.match(policy, /on your iPhone whenever your iPhone supports that/);
        assert.match(policy, /does not record or keep your voice/);
        assert.match(policy, /does not send audio or what you said to us or anyone else/);
        assert.doesNotMatch(policy, /No contacts, photos, camera or microphone access/, 'the retired claim');
    });
    test('the Consumer app asks for no microphone; the GPS app asks with both strings', () => {
        const consumer = read('ios/App/App/Info.plist');
        assert.match(consumer, /<key>CFBundleIdentifier<\/key>/, 'positive: the Consumer plist');
        assert.doesNotMatch(consumer, /NSMicrophoneUsageDescription|NSSpeechRecognitionUsageDescription/);
        const gpsPlist = path.join(REPO_ROOT, 'gps-beta/ios/App/App/Info.plist');
        if (fs.existsSync(gpsPlist)) {
            const g = fs.readFileSync(gpsPlist, 'utf8');
            assert.match(g, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]{40,}<\/string>/);
            assert.match(g, /<key>NSSpeechRecognitionUsageDescription<\/key>\s*<string>[^<]{40,}<\/string>/);
        }
        const sync = read('sync-mobile-web.js');
        const gpsShell = /const GPS_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        ['gps-voice.js', 'gps-voice-parse.js'].forEach(f => { if (fs.existsSync(path.join(REPO_ROOT, f))) assert.ok(gpsShell.includes("'" + f + "'"), f + ' ships in GPS only'); });
        shellPages().forEach(page => assert.doesNotMatch(read(page).replace(/<!-- GPS:BEGIN -->[\s\S]*?<!-- GPS:END -->/g, ''), /getUserMedia|webkitSpeechRecognition|gps-voice/, page + ' opens a microphone outside GPS'));
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
