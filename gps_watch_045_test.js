// ============================================================================
// URGENT-045 (5): APPLE WATCH YARDAGES - the native guards (gps_watch_test.js covers the phone's JS).
//   - No independent GPS on the watch in v1 (battery): the watch target never touches CoreLocation.
//   - No location leaves the phone: the phone-side plugin forwards ONLY the whitelisted number keys,
//     and the message format has no latitude / longitude / point key at all.
//   - The watch shows hole, par and front / center(middle) / back from the phone's message.
//   - The Live Activity (HardPanLiveActivity) is still built and embedded next to the watch app.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const IOS = path.join(__dirname, 'gps-beta/ios');
const read = (f) => fs.readFileSync(path.join(IOS, f), 'utf8');
const swift = (dir) => fs.readdirSync(path.join(IOS, dir)).filter((f) => f.endsWith('.swift')).map((f) => [dir + '/' + f, read(dir + '/' + f)]);
const WATCH = swift('Watch/HardPanWatch').concat(swift('Watch/Shared'));
const COORD = /CLLocation|CoreLocation|latitude|longitude|\blat\b|\blng\b|\blon\b|coordinate/i;

test('045: the watch has no GPS of its own - no CoreLocation, no location API, no coordinate anywhere in the watch code', () => {
    assert.ok(WATCH.length >= 5, 'the watch sources: ' + WATCH.map((w) => w[0]).join(', '));
    for (const [f, s] of WATCH) {
        const code = s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');   // comments may say "no coordinate"
        assert.ok(!COORD.test(code), f + ' must not use location');
    }
    const pbx = read('App/App.xcodeproj/project.pbxproj');
    const watchCfg = pbx.split('PRODUCT_BUNDLE_IDENTIFIER = com.rattlegolf.gpsbeta.watchkitapp;');
    assert.ok(watchCfg.length === 3, 'Debug + Release of the watch target');
    assert.ok(!/NSLocation\w*UsageDescription/.test(pbx.slice(pbx.indexOf('Build configuration list for PBXNativeTarget "HardPanWatch"') - 4000)), 'no location permission asked on the watch');
});

test('045: phone -> watch carries numbers only - the plugin copies a fixed list of keys, the protocol has no location key', () => {
    const plugin = read('App/PhoneBridge/HardPanWatchPlugin.swift');
    const m = /for k in \[([^\]]+)\]/.exec(plugin);
    assert.ok(m, 'the plugin copies a fixed list of number keys');
    assert.deepStrictEqual(m[1].split(',').map((x) => x.trim()).sort(),
        ['WatchKey.back', 'WatchKey.center', 'WatchKey.front', 'WatchKey.par', 'WatchKey.plays', 'WatchKey.score']);
    assert.ok(/call\.getInt\(k\)/.test(plugin), 'as integers (a coordinate is never an Int key here)');
    assert.ok(!/getDouble|getArray|getObject/.test(plugin), 'no other value is read from JS');
    const proto = read('Watch/Shared/WatchProtocol.swift');
    const keys = (/enum WatchKey \{([\s\S]*?)\n\}/.exec(proto) || [])[1] || '';
    assert.ok(keys && !COORD.test(keys.replace(/\/\/.*$/gm, '')), 'no location key in the message format');
    const sess = read('App/PhoneBridge/PhoneWatchSession.swift');
    assert.ok(/s\.isPaired, s\.isWatchAppInstalled/.test(sess), 'sent only to the golfer\'s own paired watch with the app');
    assert.ok(!/URLSession|http/i.test(sess.replace(/\/\/.*$/gm, '')), 'WatchConnectivity only, no network');
});

test('045: the watch screen shows the hole, its par and F / M (middle) / B from the phone', () => {
    const v = read('Watch/HardPanWatch/ContentView.swift');
    assert.ok(/Text\("Hole \\\(hole\)"\)/.test(v), 'hole number');
    assert.ok(/Text\("Par \\\(par\)"\)/.test(v), 'par');
    for (const [l, k] of [['F', 'front'], ['M', 'center'], ['B', 'back']]) assert.ok(new RegExp('number\\("' + l + '", [^\\n]*s\\.' + k).test(v), l + ' = ' + k);
    const mgr = read('Watch/HardPanWatch/WatchSessionManager.swift');
    assert.ok(/didReceiveApplicationContext/.test(mgr) && /didReceiveMessage/.test(mgr), 'updates from the phone (latest context + live message)');
});

test('045: the Live Activity is untouched - still its own target, still embedded in the iPhone app beside the watch app', () => {
    const pbx = read('App/App.xcodeproj/project.pbxproj');
    assert.ok(/name = HardPanLiveActivity;/.test(pbx));
    assert.ok(/HardPanLiveActivity\.appex in Embed Foundation Extensions/.test(pbx), 'embedded');
    const app = /\/\* App \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?productType/.exec(pbx)[0];
    assert.ok(/Embed Foundation Extensions/.test(app) && /Embed Watch Content/.test(app), 'the App target embeds both');
});

test('045: a hole sent before the watch can take it is re-sent by the phone once it can (activation, app installed, reachable)', () => {
    const s = read('App/PhoneBridge/PhoneWatchSession.swift');
    assert.ok(/func sendHole\(_ d: \[String: Any\]\) \{\s*lock\.lock\(\); lastHole = d; lock\.unlock\(\)/.test(s), 'the last hole is kept');
    for (const cb of ['activationDidCompleteWith activationState: WCSessionActivationState, error: Error\\?\\) \\{ resendLast\\(\\) \\}',
        'func sessionWatchStateDidChange\\(_ session: WCSession\\) \\{ resendLast\\(\\) \\}',
        'func sessionReachabilityDidChange\\(_ session: WCSession\\) \\{ resendLast\\(\\) \\}']) assert.ok(new RegExp(cb).test(s), cb);
});
