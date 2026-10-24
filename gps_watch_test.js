// ============================================================================
// THE APPLE WATCH, PHONE SIDE (feature 10 - plan + scaffold, docs/WATCH-APP-PLAN.md)
//   gps-view.js sends the CURRENT hole's front / center / back to
//   window.Capacitor.Plugins.HardPanWatch.sendHole(...) when the plugin exists AND the
//   'watch' switch (gps-config.js features.watch) is on - both true from 022 (the HardPanWatch
//   target + plugin in the app, the switch on); the web has no plugin, so nothing happens there. A stubbed plugin proves the payload,
//   that only numbers (never a coordinate) go to the watch, that an unentitled phone sends no
//   numbers (007), and that a score from the watch goes through the host's own saveScore.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no gps-view.js' }, f);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function el() {
    const e = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, appendChild(c) { c.parentNode = e; return c; },
        removeChild() {}, insertBefore(c) { return c; }, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '' };
    return e;
}
// The phone is ~243 yds short of the green's center on hole 4 (0.002 deg of latitude).
const HERE = { latitude: 33.4480, longitude: -79.15, accuracy: 5 };
// world({ watch, plugin, pro, tournament }) -> { V, sent, listeners, saved }
function world(o) {
    o = Object.assign({ watch: true, plugin: true, pro: true }, o);
    const sent = [], listeners = {}, saved = [];
    let pendingAsked = 0;
    const nav = { userAgent: 'iPhone', geolocation: { watchPosition(ok) { ok({ coords: HERE, timestamp: Date.now() }); return 7; }, clearWatch() {} } };
    const document = { createElement: el, body: el(), documentElement: el(), head: el(), addEventListener() {}, removeEventListener() {},
        getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, visibilityState: 'visible' };
    const store = {};
    const sb = { document, navigator: nav, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, Array, console,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
    sb.window = sb; sb.addEventListener = () => {}; sb.removeEventListener = () => {};
    vm.createContext(sb);
    vm.runInContext(read('gps-config.js'), sb);
    const cfg = sb.HARDPAN_GPS_CONFIG;
    cfg.iap = false; cfg.paywall = !o.pro;           // the one check (hasGpsPro), without a store
    if (o.watch !== undefined) cfg.features.watch = o.watch;
    vm.runInContext(read('gps-geo.js'), sb);
    if (o.plugin) sb.Capacitor = { Plugins: { HardPanWatch: {
        sendHole(m) { sent.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(); },
        pending() { pendingAsked++; return Promise.resolve({ items: o.pending || [] }); },
        addListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return Promise.resolve({ remove() {} }); } } } };
    vm.runInContext(read('gps-view.js'), sb);
    const G = sb.HardPanGeo, V = sb.HardPanGps;
    sb.currentData = { players: [{ id: 1, name: 'Manny' }, { id: 2, name: 'Pat' }], scores: { p1_h4: '5' }, tournamentMode: !!o.tournament };
    const pin = G.makePin([33.45, -79.15], [33.4499, -79.15], [33.4501, -79.15], null, Date.now(), 'gps');
    const opts = { courseKey: 'test_course', hole: 3, par: 4, eventCode: 'ABC', round: { gpsPins: { h4: pin } } };
    if (o.saveScore !== false) opts.saveScore = (pid, h, v) => saved.push([pid, h, v]);
    assert.strictEqual(V.mount(opts), true);
    V.showSide('gps');
    V.setHole(4, 5);
    return { V, sent, listeners, saved, sb, round: opts.round, pendingAsked: () => pendingAsked };
}

test('the switch is on (022), and with no plugin (the web): nothing is sent, nothing is listened for', () => {
    assert.match(read('gps-config.js'), /features: \{[^}]*\bwatch: true\b[^}]*\}/);
    const shipped = world({ watch: undefined, plugin: false });
    assert.strictEqual(shipped.sent.length, 0);
    assert.strictEqual(shipped.V.watchSent(), null);
});
test('the plugin present but the switch false: nothing is sent', () => {
    const w = world({ watch: false, plugin: true });
    assert.strictEqual(w.sent.length, 0);
    assert.deepStrictEqual(Object.keys(w.listeners), [], 'no watch listener is hooked');
});
test('the switch on but no plugin (every build today): nothing happens, nothing breaks', () => {
    const w = world({ watch: true, plugin: false });
    assert.strictEqual(w.sent.length, 0);
    assert.strictEqual(w.V.hole(), 4);
});
test('switch on + plugin: the current hole\'s F / C / B, in the golfer\'s units', () => {
    const w = world();
    const last = w.sent[w.sent.length - 1];
    // 022: plays (the phone's own plays-like to the center) rides along - a number, or null when the phone has none.
    assert.ok(last.plays === null || (Number.isInteger(last.plays) && last.plays > 0), 'plays: ' + last.plays);
    const { plays, ...rest } = last;
    // 066 (watch scoring): + the golfer's own card - this hole's putts (null: none; stats false: no quick
    // stats here), holes scored, strokes, to par (null: a scored hole's par unknown), whose card.
    assert.deepStrictEqual(rest, { hole: 4, par: 5, front: 231, center: 243, back: 255, units: 'yd', onGreen: false, entitled: true, tournament: false, score: 5, round: 'ABC',
        putts: null, stats: false, thru: 1, total: 5, toPar: null, name: 'Manny' });
    assert.deepStrictEqual(Object.keys(last).sort(), ['back', 'center', 'entitled', 'front', 'hole', 'name', 'onGreen', 'par', 'plays', 'putts', 'round', 'score', 'stats', 'thru', 'toPar', 'total', 'tournament', 'units']);
    // NO LOCATION DATA LEAVES THE PHONE: numbers only - no lat / lng, no point, no accuracy.
    assert.ok(!/lat|lng|lon|pt|acc|33\.4|79\.1/i.test(JSON.stringify(last)), JSON.stringify(last));
    assert.deepStrictEqual(w.V.watchSent(), last);
});
test('only on a change: the same numbers again send nothing; a new hole sends once', () => {
    const w = world();
    const n = w.sent.length;
    w.V.setHole(4, 5);
    w.V.roundUpdated(w.round, {});
    assert.strictEqual(w.sent.length, n, 'unchanged numbers are not resent');
    w.V.setHole(5, 4);
    assert.strictEqual(w.sent.length, n + 1);
    assert.strictEqual(w.sent[n].hole, 5);
    assert.strictEqual(w.sent[n].front, null, 'hole 5 has no green here: no number, never a guess');
});
test('meters when the golfer reads meters', () => {
    const w = world();
    w.sb.localStorage.setItem('hardpan_gps_units', 'm');
    w.V.setHole(5, 4); w.V.setHole(4, 5);
    const last = w.sent[w.sent.length - 1];
    assert.strictEqual(last.units, 'm');
    assert.ok(last.center >= 220 && last.center <= 224, String(last.center));
});
test('GPS Map (007): an unentitled phone sends entitled: false and no numbers', () => {
    const w = world({ pro: false });
    for (const m of w.sent) { assert.strictEqual(m.entitled, false); assert.strictEqual(m.front, null); assert.strictEqual(m.center, null); assert.strictEqual(m.back, null); }
});
test('tournament mode rides along (distance only is still allowed)', () => {
    const w = world({ tournament: true });
    const last = w.sent[w.sent.length - 1];
    assert.strictEqual(last.tournament, true);
    assert.strictEqual(last.center, 243);
});
test('the watch talks back: a hole change and the golfer\'s own score, through the host\'s saveScore', () => {
    const w = world();
    assert.deepStrictEqual(Object.keys(w.listeners).sort(), ['watchHole', 'watchScore']);
    w.listeners.watchHole[0]({ hole: 6 });
    assert.strictEqual(w.V.hole(), 6);
    w.listeners.watchHole[0]({ hole: 99 });
    assert.strictEqual(w.V.hole(), 6, 'no such hole: ignored');
    w.listeners.watchScore[0]({ hole: 4, strokes: 4 });
    assert.deepStrictEqual(w.saved, [[1, 4, '4']], 'the phone\'s own golfer, the app\'s own write');
    for (const bad of [{ hole: 4, strokes: 0 }, { hole: 4, strokes: 2.5 }, { hole: 0, strokes: 4 }, { hole: 4, strokes: 30 }, null]) w.listeners.watchScore[0](bad);
    assert.strictEqual(w.saved.length, 1, 'nonsense from the watch writes nothing');
    w.listeners.watchScore[0]({ hole: 4, strokes: 6, round: 'OTHER' });
    assert.strictEqual(w.saved.length, 1, 'a score queued for another round is never written here');
    w.listeners.watchScore[0]({ hole: 5, strokes: 3, round: 'ABC' });
    assert.deepStrictEqual(w.saved[1], [1, 5, '3']);
});
test('scores kept while the phone app was not running are written once the screen is up', async () => {
    const w = world({ pending: [{ kind: 'score', hole: 2, strokes: 6, round: 'ABC', id: 'a' }, { kind: 'score', hole: 3, strokes: 4, round: 'OLD', id: 'b' }] });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(w.pendingAsked(), 1, 'asked once');
    assert.deepStrictEqual(w.saved, [[1, 2, '6']], 'this round\'s score written; another round\'s dropped');
});
test('no saveScore handed over (index.html today): a watch score writes nothing', () => {
    const w = world({ saveScore: false });
    assert.strictEqual(w.V.watchScore({ hole: 4, strokes: 4 }), false);
});
test('a spectator\'s phone never writes a score from the watch', () => {
    const w = world();
    w.sb.HardPanDoors = { spectating: () => true };
    assert.strictEqual(w.V.watchScore({ hole: 4, strokes: 4 }), false);
    assert.strictEqual(w.saved.length, 0);
});
test('022: the watch app is in the Xcode project - its own watchOS target, embedded in the iPhone app, the bridge and the session in the App target', () => {
    const pbx = read('gps-beta/ios/App/App.xcodeproj/project.pbxproj');
    assert.ok(/name = HardPanWatch;/.test(pbx) && /SDKROOT = watchos;/.test(pbx), 'a watchOS target');
    assert.ok(/PRODUCT_BUNDLE_IDENTIFIER = com\.rattlegolf\.gpsbeta\.watchkitapp;/.test(pbx), 'its bundle id');
    assert.ok(/INFOPLIST_KEY_WKCompanionAppBundleIdentifier = com\.rattlegolf\.gpsbeta;/.test(pbx), 'a companion of the GPS app');
    assert.ok(/Embed Watch Content/.test(pbx) && /dstPath = "\$\(CONTENTS_FOLDER_PATH\)\/Watch";/.test(pbx), 'embedded in the iPhone app');
    for (const f of ['HardPanWatchPlugin.swift in Sources', 'PhoneWatchSession.swift in Sources', 'HardPanBridgeViewController.swift in Sources', 'WatchSessionManager.swift in Sources']) assert.ok(pbx.indexOf(f) !== -1, f);
    assert.strictEqual((pbx.match(/WatchProtocol\.swift in Sources \*\/ = /g) || []).length, 2, 'WatchProtocol.swift in BOTH targets');
    assert.ok(/rootViewController = HardPanBridgeViewController\(\)/.test(read('gps-beta/ios/App/App/SceneDelegate.swift')), 'the bridge that registers the plugin');
    assert.ok(/PhoneWatchSession\.shared\.activate\(\)/.test(read('gps-beta/ios/App/App/AppDelegate.swift')), 'WatchConnectivity at launch');
});
test('022: the card hands its own saveScore to the GPS screen (the round trip ends in index.html saveScore)', () => {
    const ix = read('index.html');
    const m = /g\.mount\(\{[\s\S]*?\}\);/.exec(ix);
    assert.ok(m && /saveScore: \(pid, hole, val\) => saveScore\(pid, hole, val\)/.test(m[0]), 'mount gets saveScore');
});
test('022 round trip: hole -> watch (numbers + plays), watch score -> the card\'s save, the next numbers carry the saved score', () => {
    const w = world();
    const first = w.sent[w.sent.length - 1];
    assert.strictEqual(first.hole, 4); assert.strictEqual(first.score, 5);
    // The watch saves a 4 on hole 4 (sendMessage / transferUserInfo -> plugin -> 'watchScore').
    w.listeners.watchScore[0]({ kind: 'score', hole: 4, strokes: 4, round: 'ABC', id: 'w1', at: 1 });
    assert.deepStrictEqual(w.saved, [[1, 4, '4']]);
    // The card writes it; the round comes back with it; the watch is told (its "sending" clears).
    w.sb.currentData.scores.p1_h4 = '4';
    w.V.roundUpdated({ gpsPins: {} }, {});
    w.V.setHole(5, 4); w.V.setHole(4, 5);
    const back = w.sent[w.sent.length - 1];
    assert.strictEqual(back.hole, 4);
    assert.strictEqual(back.score, 4, 'the watch gets the saved score back');
});
