// ============================================================================
// ANDROID: THE PAPER SCORECARD CAMERA IS IN THE APP, WITH THE iOS CONTRACT (Saturday doc-scan job, Oct 27)
//   Both scans - the score scan (gps-scan-grid.js) and 080 Scan the scorecard (gps-course-scan.js) - show
//   only when gps-scan-client.js nativeCameraHere() finds the plugin "HardPanDocScan". iOS has it
//   (HardPanDocScanPlugin.swift, VisionKit); Android now has its twin on Google ML Kit Document Scanner.
//   The JS was written against the Swift plugin and is NOT changed, so the Java one must answer the same:
//   the same name, the same two methods, the same result keys and reject codes, the same JPEG size rule.
//   Also: it is registered in MainActivity, the ML Kit dependency is in the app, and the app's own manifest
//   asks for NO camera permission (the scanner's screen belongs to Play services).
//   WHAT THIS CANNOT PROVE: that the scanner opens and returns a photo on a phone. That is the emulator pass.
//   COUNTS (final file, on android-2.0-addons 06a3c89b + the plugin): 6 tests, 6 pass.
//   Baseline with the plugin file removed (copied aside, restored by sha 6e99e5306c50): 0 pass / 6 fail - every
//   test first requires the Java file. (The manifest test's own checks pass on 06a3c89b too: the no-camera rule
//   is a guard for later, not something this job changed.)
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JAVA = 'android/app/src/main/java/com/rattlegolf/app/HardPanDocScanPlugin.java';
const SWIFT = 'gps-beta/ios/App/PhoneBridge/HardPanDocScanPlugin.swift';
const has = (f) => fs.existsSync(path.join(__dirname, f));
const javaSrc = () => { assert.ok(has(JAVA), JAVA + ' is in the app'); return read(JAVA); };
// reject codes: the second argument of call.reject("...", "code")
const codes = (src) => [...new Set([...src.matchAll(/reject\("[^"]*", "([a-z_]+)"\)/g)].map((m) => m[1]))].sort();

test('the same plugin name the JS looks for, with available() and scan()', () => {
    const j = javaSrc();
    assert.match(j, /@CapacitorPlugin\(name = "HardPanDocScan"\)/);
    assert.match(read('gps-scan-client.js'), /isPluginAvailable\('HardPanDocScan'\)/, 'the JS gate it must satisfy');
    assert.match(j, /@PluginMethod\s+public void available\(PluginCall call\)/);
    assert.match(j, /@PluginMethod\s+public void scan\(PluginCall call\)/);
    assert.match(read(SWIFT), /CAPPluginMethod\(name: "available"[\s\S]*CAPPluginMethod\(name: "scan"/, 'the Swift twin has the same two');
});

test('the same answers: image / width / height / bytes, cancelled, available; the same reject codes as iOS', () => {
    const j = javaSrc(), sw = read(SWIFT);
    for (const k of ['image', 'width', 'height', 'bytes', 'cancelled', 'available']) {
        assert.match(j, new RegExp('r\\.put\\("' + k + '"'), 'Java resolves ' + k);
        assert.match(sw, new RegExp('"' + k + '":'), 'Swift resolves ' + k);
    }
    const jc = codes(j);
    assert.deepEqual(jc, ['busy', 'failed', 'unavailable']);
    assert.deepEqual(codes(sw.replace(/call\.reject\(([^,]+), /g, 'reject("x", ')), jc, 'the same codes as the Swift plugin');
    // gps-scan-client.js falls back to a file pick on exactly this code
    assert.match(read('gps-scan-client.js'), /e\.code === 'unavailable'\) return pickFile\(\)/);
});

test('the same JPEG rule as iOS: long edge 1800 (never up), quality 0.8, base64 without line breaks', () => {
    const j = javaSrc(), sw = read(SWIFT);
    assert.match(sw, /static let longEdge: CGFloat = 1800/); assert.match(sw, /static let quality: CGFloat = 0\.8/);
    assert.match(j, /static final int LONG_EDGE = 1800;/);
    assert.match(j, /static final int QUALITY = 80;/);
    assert.match(j, /Math\.min\(1f, \(float\) LONG_EDGE \/ Math\.max\(w, h\)\)/, 'never scaled up');
    assert.match(j, /compress\(Bitmap\.CompressFormat\.JPEG, QUALITY, bos\)/);
    assert.match(j, /Base64\.NO_WRAP/);
});

test('ML Kit Document Scanner, one page, no gallery import; the cache file is not kept', () => {
    const j = javaSrc();
    assert.match(read('android/app/build.gradle'), /implementation "com\.google\.android\.gms:play-services-mlkit-document-scanner:16\.0\.0"/);
    assert.match(j, /setGalleryImportAllowed\(false\)/);
    assert.match(j, /setPageLimit\(1\)/);
    assert.match(j, /RESULT_FORMAT_JPEG/);
    assert.match(j, /new java\.io\.File\(uri\.getPath\(\)\)\.delete\(\)/);
});

test('registered in MainActivity before the bridge starts', () => {
    javaSrc();
    const m = read('android/app/src/main/java/com/rattlegolf/app/MainActivity.java');
    const reg = m.indexOf('registerPlugin(HardPanDocScanPlugin.class);'), sup = m.indexOf('super.onCreate(savedInstanceState);');
    assert.ok(reg > 0, 'registered'); assert.ok(sup > 0); assert.ok(reg < sup, 'before super.onCreate');
});

test('the app\'s manifest asks for no camera permission (the scanner screen is Play services\')', () => {
    javaSrc();
    const man = read('android/app/src/main/AndroidManifest.xml');
    assert.match(man, /android\.permission\.ACCESS_FINE_LOCATION/, 'positive control: the permissions block is there');
    assert.ok(!/android\.permission\.CAMERA/.test(man), 'no CAMERA permission');
    assert.ok(!/READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/.test(man), 'no photo-library permission');
});
