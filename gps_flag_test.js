// ============================================================================
// GPS_ENABLED=0 BUILDS CONSUMER: NO GPS, NO LOCATION PERMISSION (gps-v1)
//
// One codebase, two products (tools/gps-flag.js, docs/gps-builds.md):
//   HardPan  GPS + Bets   GPS_ENABLED=1
//   Consumer Bets only    GPS_ENABLED=0 / unset (the default)
//
// This file BUILDS both, for real, with the two scripts that produce an app -
// build-shell.js (web) and sync-mobile-web.js (iOS/Android) - into temporary
// directories, and reads what came out:
//
//   Consumer: no GPS file, no GPS code token in any shipped file, no toggle,
//   no GPS screen, NO location permission in Info.plist, and an index.html
//   byte-identical to main's (82d98b4).
//   HardPan (web only): the GPS files and the toggle, in dist/hardpan.
//   The native app is CONSUMER ONLY (decision 2026-10-07): sync-mobile-web.js
//   refuses GPS_ENABLED=1 and writes nothing, and no code can add the iOS
//   location permission - only remove it.
//
// It runs in BOTH trees. In a Consumer tree (the suite run with the flag off:
// tools/gps-flag-tree.js) the source has no GPS blocks left, so the Consumer
// build is the same and the HardPan arm is skipped - there is nothing to build
// it from.
//
// WHY A TOKEN SCAN AND NOT /gps/i: the pre-GPS Consumer already says "GPS" once,
// in an admin.html comment about course sorting that was turned off, and its
// oauth file names hardpangolf.com. Both were measured in the 7a6c3f5 build and
// neither is GPS code. The tokens below appear ZERO times in that build.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const flag = require('./tools/gps-flag.js');

const ROOT = __dirname;
const ON_TREE = fs.existsSync(path.join(ROOT, 'gps-view.js'));
const GPS_TOKENS = /gps-view|gps-geo|gps-config|gps-courses|HardPanGps\b|HardPanGeo\b|leaflet|maplibre|arcgis|nationalmap|watchPosition|getCurrentPosition|geolocation|NSLocation|📍 GPS|gps-side/;
// sha256 of index.html at main 82d98b4 (the card guards) - the tree gps-v1 was
// rebased onto on 2026-10-07 (second time). Before: d697ea55 (04f5fd1), 8ea54ad0 (7a6c3f5).
// After the next rebase, re-pin it to that main's index.html.
const PRE_GPS_INDEX_SHA = '92a6316444896908566bf3622ee1f3578c59d8c514c354a9b87112fa3ba9d2f2';
const GPS_SHELL = (() => {
    const m = /const GPS_SHELL = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(ROOT, 'sync-mobile-web.js'), 'utf8'));
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
})();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), 'gpsflag-' + name + '-'));

function buildWeb(enabled) {
    const out = tmp('web');
    const env = Object.assign({}, process.env, { BUILD_SHELL_DIST: out });
    if (enabled === undefined) delete env.GPS_ENABLED; else env.GPS_ENABLED = enabled;
    execFileSync(process.execPath, [path.join(ROOT, 'build-shell.js'), 'consumer'], { env, stdio: 'pipe' });
    return path.join(out, enabled === '1' ? 'hardpan' : 'consumer');
}
// The plist handed to the sync is a copy WITH a stray key, so the Consumer arm
// proves the sync takes it out - not merely that it never put it in.
function strayPlist() {
    return fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8')
        .replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>x</string>\n</dict>\n</plist>\n');
}
function buildNative(enabled) {
    const out = tmp('native');
    const plist = path.join(out, 'Info.plist');
    fs.writeFileSync(plist, strayPlist());
    const env = Object.assign({}, process.env, { MOBILE_SYNC_DEST: path.join(out, 'app'), MOBILE_SYNC_PLIST: plist });
    if (enabled === undefined) delete env.GPS_ENABLED; else env.GPS_ENABLED = enabled;
    let status = 0, stderr = '';
    try { execFileSync(process.execPath, [path.join(ROOT, 'sync-mobile-web.js')], { env, stdio: 'pipe' }); }
    catch (e) { status = e.status; stderr = String(e.stderr || ''); }
    return { app: path.join(out, 'app'), plist: fs.readFileSync(plist, 'utf8'), status, stderr };
}
function noGps(dir, what) {
    const files = walk(dir);
    assert.ok(files.length > 50, what + ': positive - the build shipped ' + files.length + ' files');
    assert.ok(files.some((f) => path.basename(f) === 'index.html'), what + ': positive - index.html shipped');
    GPS_SHELL.forEach((f) => assert.ok(!fs.existsSync(path.join(dir, f)), what + ' ships ' + f));
    const hits = files.filter((f) => /\.(html|js|css|json)$/.test(f) && GPS_TOKENS.test(fs.readFileSync(f, 'utf8')));
    assert.deepStrictEqual(hits.map((f) => path.relative(dir, f)), [], what + ': GPS code in a Consumer file');
    assert.strictEqual(sha(path.join(dir, 'index.html')), PRE_GPS_INDEX_SHA, what + ': Consumer index.html is not the pre-GPS one');
}

test('the flag is OFF unless it says on', () => {
    assert.strictEqual(flag.isEnabled({}), false);
    assert.strictEqual(flag.isEnabled({ GPS_ENABLED: '' }), false);
    assert.strictEqual(flag.isEnabled({ GPS_ENABLED: '0' }), false);
    assert.strictEqual(flag.isEnabled({ GPS_ENABLED: 'false' }), false);
    assert.strictEqual(flag.isEnabled({ GPS_ENABLED: '1' }), true);
    assert.strictEqual(flag.isEnabled({ GPS_ENABLED: 'on' }), true);
});

test('applyFlag: OFF removes whole blocks, restores ELSE lines, refuses a broken marker', () => {
    const src = 'a\n// GPS:BEGIN\nb\n// GPS:END\nc\n  // GPS:BEGIN\n  x = 1;\n  // GPS:ELSE\n  // x = 0;\n  // GPS:END\nd';
    assert.strictEqual(flag.applyFlag(src, true), src, 'ON is the source, untouched');
    assert.strictEqual(flag.applyFlag(src, false), 'a\nc\n  x = 0;\nd');
    assert.strictEqual(flag.applyFlag('<p>\n<!-- GPS:BEGIN -->\n<x>\n<!-- GPS:END -->\n</p>', false), '<p>\n</p>');
    assert.throws(() => flag.applyFlag('// GPS:BEGIN\nx', false), /never closed/);
    assert.throws(() => flag.applyFlag('x\n// GPS:END', false), /without BEGIN/);
    assert.throws(() => flag.applyFlag('// GPS:BEGIN\n// GPS:BEGIN\n// GPS:END', false), /nested/);
    assert.throws(() => flag.applyFlag('// GPS:BEGIN\na\n// GPS:ELSE\nnot a comment\n// GPS:END', false), /must be a \/\/ comment/);
});

test('Info.plist: the COMMITTED one is Consumer - no location permission', () => {
    const plist = fs.readFileSync(path.join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
    assert.ok(/<key>CFBundleIdentifier<\/key>/.test(plist), 'positive: this is the app plist');
    assert.ok(!/NSLocation/.test(plist), 'the committed Info.plist asks for location - was it committed after a HardPan sync?');
    assert.throws(() => flag.plistFor(plist, true), /Consumer only/, 'nothing may ADD the permission');
    const stray = plist.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>x</string>\n</dict>\n</plist>\n');
    assert.ok(/NSLocationWhenInUse/.test(stray), 'positive: the stray key is in the test copy');
    assert.strictEqual(flag.plistFor(stray, false), plist, 'a stray key is taken back out, byte for byte');
    // No source file in the repo can write the key: the string appears only
    // where it is REMOVED or REFUSED, never next to a <string> value to insert.
    const offenders = require('child_process').execFileSync('git', ['grep', '-l', 'NSLocationWhenInUseUsageDescription', '--', '*.js', '*.html', '*.ts'], { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).filter((f) => !/_test\.js$/.test(f));
    assert.ok(offenders.includes('tools/gps-flag.js'), 'positive: the scan reaches the one file that names the key');
    offenders.forEach((f) => assert.ok(!/<string>[^<]*location/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' carries a location permission sentence'));
});

test('Consumer source: index.html with its GPS blocks removed IS the pre-GPS index.html', () => {
    const off = flag.applyFlag(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), false);
    assert.ok(off.length > 100000, 'positive: the scorecard');
    assert.strictEqual(crypto.createHash('sha256').update(off).digest('hex'), PRE_GPS_INDEX_SHA);
});

test('CONSUMER WEB BUILD (build-shell.js, flag unset): no GPS files, no GPS code, the pre-GPS scorecard', () => {
    const dir = buildWeb(undefined);
    noGps(dir, 'dist/consumer');
    assert.ok(/const CACHE_VERSION = 'consumer-v152-unplayedzero';/.test(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')),
        'the Consumer cache key did not move: nothing a Consumer device holds changed');
});

test('CONSUMER NATIVE BUILD (sync-mobile-web.js, flag unset): no GPS, and a stray location permission REMOVED', () => {
    const b = buildNative(undefined);
    assert.strictEqual(b.status, 0, b.stderr);
    noGps(b.app, 'www/app');
    assert.ok(/<key>CFBundleIdentifier<\/key>/.test(b.plist), 'positive: the plist was written');
    assert.ok(!/NSLocation/.test(b.plist), 'a Consumer sync left a location permission in Info.plist');
});

test('HARDPAN WEB BUILD (GPS_ENABLED=1): the GPS files and the toggle, in dist/hardpan', { skip: ON_TREE ? false : 'Consumer tree: there is no GPS source to build HardPan from' }, () => {
    const web = buildWeb('1');
    GPS_SHELL.forEach((f) => assert.ok(fs.existsSync(path.join(web, f)), 'dist/hardpan is missing ' + f));
    assert.ok(/<script src="gps-view\.js"><\/script>/.test(fs.readFileSync(path.join(web, 'index.html'), 'utf8')));
    assert.ok(/📍 GPS/.test(fs.readFileSync(path.join(web, 'gps-view.js'), 'utf8')), 'the toggle');
    assert.ok(/const CACHE_VERSION = 'consumer-v157-gps-wave2';/.test(fs.readFileSync(path.join(web, 'sw.js'), 'utf8')), 'its own cache key');
});

test('THERE IS NO HARDPAN APP BUILD: sync-mobile-web.js refuses GPS_ENABLED=1 and writes nothing', () => {
    const b = buildNative('1');
    assert.strictEqual(b.status, 1, 'the native sync must refuse the GPS flag');
    assert.ok(/refused: the iOS\/Android app is Consumer only/.test(b.stderr), b.stderr);
    assert.ok(!fs.existsSync(b.app), 'it wrote a bundle anyway');
    assert.strictEqual(b.plist, strayPlist(), 'it touched Info.plist anyway');
});
