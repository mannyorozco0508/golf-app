// ============================================================================
// URGENT-066 (5) WATCH POLISH: SCORING ON THE WATCH, SYNCED WITH THE PHONE, AND THE ROUND STATE.
//   Phone -> watch: the current hole's numbers (045) PLUS the golfer's own card - this hole's
//     score and putts, holes scored ("thru"), strokes, strokes against par, whose card it is.
//     A score typed on the PHONE shows on the watch the next time the hole is sent.
//   Watch -> phone: a score (+ putts) goes through the card's own saveScore (index.html: offline
//     queue, permissions, rules); putts go where the card's putts chips put them (gps-stats.js
//     quick stats, on this phone - never Firebase, never a money engine). The watch hears back at once.
//   Round state ("Open a round in HardPan GPS on your iPhone" while the phone was sending): the
//     watch asks the phone for its current hole (kind "sync") when it opens / wakes / reconnects
//     with nothing on screen, and the phone answers natively from its last hole.
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
const IOS = 'gps-beta/ios/';

function el() {
    const e = { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, appendChild(c) { c.parentNode = e; return c; },
        removeChild() {}, insertBefore(c) { return c; }, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '', innerHTML: '' };
    return e;
}
const HERE = { latitude: 33.4480, longitude: -79.15, accuracy: 5 };
// world({ pro, quickStats, stats }) -> { V, sent, listeners, saved, putts, sb }
function world(o) {
    o = Object.assign({ pro: true, quickStats: true, stats: true }, o);
    const sent = [], listeners = {}, saved = [], putts = [];
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
    cfg.iap = false; cfg.paywall = !o.pro;
    cfg.features.quickStats = o.quickStats;
    vm.runInContext(read('gps-geo.js'), sb);
    sb.Capacitor = { Plugins: { HardPanWatch: {
        sendHole(m) { sent.push(JSON.parse(JSON.stringify(m))); return Promise.resolve(); },
        pending() { return Promise.resolve({ items: [] }); },
        addListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return Promise.resolve({ remove() {} }); } } } };
    vm.runInContext(read('gps-view.js'), sb);
    // The phone's quick stats (gps-stats.js), stubbed: what the card's putts chips read and write.
    const qs = {};
    if (o.stats) sb.HardPanGpsStats = { quick: {
        hole(code, pid, n) { const h = qs[code + '|' + pid + '|' + n]; return { putts: h == null ? null : h }; },
        set(ctx, pid, n, patch, strokes, par) { putts.push([ctx.code, pid, n, patch.putts, strokes, par]); qs[ctx.code + '|' + pid + '|' + n] = patch.putts; return {}; } },
        refresh() {}, isOpen() { return false; } };
    const G = sb.HardPanGeo, V = sb.HardPanGps;
    sb.currentData = { players: [{ id: 1, name: 'Manny Orozco' }, { id: 2, name: 'Pat Lee' }], scores: { p1_h1: '5', p1_h2: '3', p2_h1: '7', p1_h4: '5' } };
    const pin = G.makePin([33.45, -79.15], [33.4499, -79.15], [33.4501, -79.15], null, Date.now(), 'gps');
    const pars = { 1: 4, 2: 3, 3: 4, 4: 5, 5: 4 };
    const opts = { courseKey: 'test_course', hole: 3, par: 4, eventCode: 'ABC', round: { gpsPins: { h4: pin }, courseName: 'Test Links' },
        holeMeta: (h) => ({ par: pars[h] || 4 }) };
    opts.saveScore = (pid, h, v) => { saved.push([pid, h, v]); sb.currentData.scores['p' + pid + '_h' + h] = v; };
    assert.strictEqual(V.mount(opts), true);
    V.showSide('gps');
    V.setHole(4, 5);
    return { V, sent, listeners, saved, putts, sb, last: () => sent[sent.length - 1] };
}

test('066 phone -> watch: the golfer\'s own card rides with the hole (score, putts, thru, strokes, to par, name)', () => {
    const w = world();
    const m = w.last();
    assert.strictEqual(m.hole, 4);
    assert.strictEqual(m.score, 5, 'this hole\'s score from the card');
    assert.strictEqual(m.thru, 3, 'holes 1, 2 and 4 scored for golfer 1 (golfer 2\'s 7 is not mine)');
    assert.strictEqual(m.total, 13);
    assert.strictEqual(m.toPar, 1, '5-4 + 3-3 + 5-5');
    assert.strictEqual(m.stats, true, 'putts may be entered (GPS Map + quick stats)');
    assert.strictEqual(m.putts, null, 'no putts yet');
    assert.ok(/^Manny/.test(m.name) && m.name.length <= 24, m.name);
    assert.ok(!/lat|lng|lon|pt|acc|33\.4|79\.1/i.test(JSON.stringify(m)), 'still numbers only: ' + JSON.stringify(m));
});

test('066 phone -> watch: a score typed on the PHONE shows on the watch', () => {
    const w = world();
    const before = w.sent.length;
    w.sb.currentData.scores.p1_h4 = '6';        // the card's own save, landed in the round
    w.V.roundUpdated({ gpsPins: {}, courseName: 'Test Links' }, {});
    assert.ok(w.sent.length > before, 'a new message for the new score');
    assert.strictEqual(w.last().score, 6);
    assert.strictEqual(w.last().total, 14);
    assert.strictEqual(w.last().toPar, 2);
});

test('066 watch -> phone: score AND putts - the score through the card\'s saveScore, putts into the quick stats, the watch hears back at once', () => {
    const w = world();
    const before = w.sent.length;
    assert.strictEqual(w.listeners.watchScore[0]({ kind: 'score', hole: 4, strokes: 4, putts: 2, round: 'ABC', id: 'w1', at: 1 }), undefined);
    assert.deepStrictEqual(w.saved, [[1, 4, '4']], 'the card\'s own write, for this phone\'s golfer');
    assert.deepStrictEqual(w.putts, [['ABC', 1, 4, 2, 4, 5]], 'putts where the putts chips put them: round, golfer, hole, putts, strokes, par');
    assert.ok(w.sent.length > before, 'an answer goes back without waiting for a GPS fix');
    assert.strictEqual(w.last().score, 4);
    assert.strictEqual(w.last().putts, 2, 'the watch\'s "sending" clears on this echo');
});

test('066 watch -> phone: putts for another hole, and nonsense putts', () => {
    const w = world();
    w.V.watchScore({ hole: 5, strokes: 3, putts: 1, round: 'ABC' });
    assert.deepStrictEqual(w.saved[0], [1, 5, '3']);
    assert.deepStrictEqual(w.putts[0], ['ABC', 1, 5, 1, 3, 4], 'hole 5\'s own par');
    for (const bad of [-1, 2.5, 9, 'x']) w.V.watchScore({ hole: 5, strokes: 3, putts: bad, round: 'ABC' });
    assert.strictEqual(w.putts.length, 1, 'more putts than strokes, negative or fractional: the score only');
    assert.strictEqual(w.saved.length, 5, 'the score itself is still the golfer\'s');
    w.V.watchScore({ hole: 5, strokes: 3, round: 'ABC' });
    assert.strictEqual(w.putts.length, 1, 'no putts sent = the phone\'s putts untouched');
});

test('066: no GPS Map, or quick stats off: the watch offers no putts and the phone stores none', () => {
    for (const o of [{ pro: false }, { quickStats: false }, { stats: false }]) {
        const w = world(o);
        assert.strictEqual(w.last().stats, false, JSON.stringify(o));
        assert.strictEqual(w.last().putts, null);
        w.V.watchScore({ hole: 4, strokes: 4, putts: 2, round: 'ABC' });
        assert.deepStrictEqual(w.saved, [[1, 4, '4']], 'the score still goes: ' + JSON.stringify(o));
        assert.deepStrictEqual(w.putts, [], 'no putts: ' + JSON.stringify(o));
    }
});

test('066: a spectator and another round still write nothing - score or putts', () => {
    const w = world();
    w.V.watchScore({ hole: 4, strokes: 4, putts: 2, round: 'OTHER' });
    w.sb.HardPanDoors = { spectating: () => true };
    w.V.watchScore({ hole: 4, strokes: 4, putts: 2, round: 'ABC' });
    assert.deepStrictEqual(w.saved, []);
    assert.deepStrictEqual(w.putts, []);
});

test('066 the protocol: putts and the card in both directions, as numbers; "sync" asks for the hole again', () => {
    const p = read(IOS + 'Watch/Shared/WatchProtocol.swift');
    for (const k of ['putts', 'stats', 'thru', 'total', 'toPar', 'name']) assert.ok(new RegExp('\\b' + k + ' = "' + k + '"').test(p), 'key ' + k);
    assert.ok(/static let sync = "sync"/.test(p), 'kind sync');
    assert.ok(/var putts: Int\?/.test(p) && /if let putts \{ d\[WatchKey\.putts\] = putts \}/.test(p), 'putts optional, absent = not entered');
    assert.ok(/WatchScore\(hole: Int, strokes: Int, putts: Int\? = nil, round: String\)|init\(hole: Int, strokes: Int, putts: Int\? = nil, round: String\)/.test(p), 'a watch score may carry putts');
    assert.ok(/\(0\.\.\.min\(n, 9\)\)\.contains\(p\)/.test(p), 'never more putts than strokes');
});

test('066 round state: the phone answers "sync" natively from its last hole; the watch asks when it has nothing on screen', () => {
    const sess = read(IOS + 'App/PhoneBridge/PhoneWatchSession.swift');
    assert.ok(/== WatchKind\.sync \{ resendLast\(\); return \}/.test(sess), 'the phone re-sends its last hole, JS not involved');
    const mgr = read(IOS + 'Watch/HardPanWatch/WatchSessionManager.swift');
    assert.ok(/func askForHole\(\)/.test(mgr) && /wc\.isReachable/.test(mgr) && /WatchKind\.sync/.test(mgr), 'the watch asks (sendMessage only, when reachable)');
    assert.ok(/activationDidCompleteWith[\s\S]*?self\.askForHole\(\)/.test(mgr), 'on activation');
    assert.ok(/sessionReachabilityDidChange[\s\S]*?if r && self\.state == nil \{ self\.askForHole\(\) \}/.test(mgr), 'on reconnect with nothing shown');
    assert.ok(/\.onAppear \{ session\.askForHole\(\) \}/.test(read(IOS + 'Watch/HardPanWatch/ContentView.swift')), 'when "Open a round" is on screen');
    assert.ok(/WatchKind\.clear \{ state = nil; pendingHole = nil; unsent = \[:\]; unsentPutts = \[:\]/.test(mgr), 'no round: nothing left "sending"');
});

test('066 the watch screens: putts on the score screen (only where the phone keeps them), the card line under Score', () => {
    const se = read(IOS + 'Watch/HardPanWatch/ScoreEntryView.swift');
    assert.ok(/if puttsOn \{/.test(se) && /Text\("Putts"\)/.test(se), 'a putts row');
    assert.ok(/session\.saveScore\(hole: hole, strokes: strokes, putts: puttsOn \? putts : nil\)/.test(se), 'Save sends putts only when on');
    assert.ok(/min\(4, strokes\)/.test(se), '0 - 4+, never more than the strokes');
    const cv = read(IOS + 'Watch/HardPanWatch/ContentView.swift');
    assert.ok(/savedPutts: mine \? s\?\.putts : nil, puttsOn: s\?\.stats \?\? false/.test(cv), 'the phone\'s putts and gate');
    assert.ok(/"Thru \\\(thru\)"/.test(cv), 'Thru N');
    const mgr = read(IOS + 'Watch/HardPanWatch/WatchSessionManager.swift');
    assert.ok(/let p = \(state\?\.stats \?\? false\) \? putts : nil/.test(mgr), 'the watch never sends putts the phone would not keep');
});
