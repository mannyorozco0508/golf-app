// ============================================================================
// 064-6a - RESET RANGE DATA IN MY BAG (gps-range.js resetPlan / resetRange, gps-shots.js bag(g, { unset }))
//
// Manny (Oct 22): "we should be able to reset the stats from the range in club yardages".
// Per club, and all at once. ONLY Range data goes: the club's shots in this golfer's Range
// sessions and the My bag number Range's "Update my bag" wrote. A number typed in My bag, the
// on-course marked shots (My bag's own, gps-shots.js, and the 049 shot log), Strokes Gained and
// the setup carries stay byte for byte. The number then falls back to what My bag shows without
// Range: the number before Range wrote it, else the learned / setup number, else none.
// urgent064_range_reset_chrome_test.js runs the My bag screen (rows, the confirm, Cancel) in Chrome.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-range.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, setTimeout };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-shots.js'), sb);
    vm.runInContext(read('gps-range.js'), sb);
    return { R: sb.HardPanRange, B: sb.HardPanGpsBag, store };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const ME = 'Manny Orozco', KEYG = 'n:manny orozco';
// Other things on the phone that a range reset must never touch (opaque on purpose: compared byte for byte).
const OTHER = {
    hardpan_shotlog_v1: JSON.stringify({ v: 1, golfers: { [KEYG]: { shots: [{ id: 'a1', club: '7i', carry: 151, windMph: 0, date: 1 }, { id: 'a2', club: 'Dr', carry: 248, windMph: 4, date: 2 }], hand: 'R' } } }),
    hardpan_sg_v1_TST064: JSON.stringify({ v: 1, golfers: { [KEYG]: { 1: [{ k: 'tee', d: 420 }, { k: 'fw', d: 150 }] } } }),
    hardpan_shots_v1_TST064: JSON.stringify({ v: 1, code: 'TST064', holes: { 1: [{ how: 'mark', yd: 248 }] } }),
    hardpan_stats_v1_TST064: JSON.stringify({ v: 1, p: { 1: { fw: 1 } } })
};
// Manny's phone: a typed Driver 230 and a typed PW 120, a learned 7-iron (3 marked shots on the
// course), a setup 9-iron 130; then a Range session: Driver 240 / 251 / 236 / 180 (mishit),
// 7-iron 150 / 155 / 148, "Update my bag" -> Driver 240, 7-iron 150. Ann's Range is on the same phone.
function seeded() {
    const s = sandbox(), { R, B, store } = s;
    Object.keys(OTHER).forEach((k) => { store[k] = OTHER[k]; });
    B.add(ME, '7i', 160); B.add(ME, '7i', 162); B.add(ME, '7i', 161);
    B.setup(ME, { '9i': 130 });
    B.set(ME, 'Dr', 230); B.set(ME, 'PW', 120);
    const t0 = Date.now() - 60000;
    [['Dr', 240], ['Dr', 251], ['Dr', 236], ['Dr', 180], ['7i', 150], ['7i', 155], ['7i', 148]].forEach((x, i) => R.addShot(ME, x[0], x[1], 'typed', t0 + i));
    R.setMishit(ME, 3, true);
    R.addShot('Ann Alpha', 'Dr', 210, 'typed', t0); R.applyToBag(B, 'Ann Alpha', R.summarize(R.current('Ann Alpha').shots));
    const done = R.applyToBag(B, ME, R.summarize(R.current(ME).shots));
    assert.deepEqual(plain(done), { Dr: 240, '7i': 150 });
    return s;
}
const bagRec = (s) => JSON.parse(s.store[s.B.KEY]).golfers[KEYG];
const rangeRec = (s, k) => (JSON.parse(s.store[s.R.KEY]).golfers || {})[k || KEYG];

test('what Range wrote is remembered with the number before it (yards only); My bag\'s own record keeps its shape', { skip }, () => {
    const s = seeded();
    assert.deepEqual(plain(rangeRec(s).wrote), { Dr: { yd: 240, prev: 230 }, '7i': { yd: 150, prev: null } });
    assert.deepEqual(Object.keys(bagRec(s)).sort(), ['set', 'setupAt', 'base', 'shots'].sort());
    // a second "Update my bag" keeps the number from BEFORE Range (not Range's own 240)
    s.R.addShot(ME, 'Dr', 260, 'typed');
    s.R.applyToBag(s.B, ME, s.R.summarize(s.R.current(ME).shots));
    assert.equal(rangeRec(s).wrote.Dr.prev, 230);
    const rows = plain(s.R.rangeData(s.B, ME));
    assert.deepEqual(rows.map((r) => [r.club, r.n, r.good, r.mis, r.inBag]), [['Dr', 5, 4, 1, true], ['7i', 3, 3, 0, true]]);
    assert.equal(s.R.rangeLine(rows[1]), 'Range · 3 good / 0 mishits · 150 (median of good)');
});

test('per-club reset clears ONLY that club\'s Range data; the number falls back to the one before Range', { skip }, () => {
    const s = seeded(), { R, B, store } = s;
    const before = plain(store), annBefore = plain(rangeRec(s, 'n:ann alpha'));
    // the plan is read-only (what the confirm shows)
    const plan = plain(R.resetPlan(B, ME, 'Dr'));
    assert.deepEqual(plan, [{ club: 'Dr', name: 'Driver', shots: 4, bagNow: 240, bagChanges: true, setAfter: 230 }]);
    assert.deepEqual(plain(store), before, 'resetPlan wrote nothing');
    const done = plain(R.resetRange(B, ME, 'Dr'));
    assert.deepEqual(done, plan);
    // Range: no Driver shot left, the 7-iron ones all there; the session's bag map lost Driver only
    const rr = rangeRec(s);
    assert.deepEqual(rr.sessions[0].shots.map((x) => x.c + x.yd), ['7i150', '7i155', '7i148']);
    assert.deepEqual(rr.wrote, { '7i': { yd: 150, prev: null } });
    // My bag: Driver back to the typed 230; 7-iron still Range's 150; PW typed, 9-iron setup, the 7-iron marked shots untouched
    const b = bagRec(s);
    assert.deepEqual(b.set, { Dr: 230, PW: 120, '7i': 150 });
    assert.deepEqual(b.shots, { '7i': [160, 162, 161] });
    assert.deepEqual(b.base, { '9i': 130 });
    assert.equal(B.bag(ME).Dr.yd, 230); assert.equal(B.source(B.bag(ME).Dr), 'entered');
    // the shot log, Strokes Gained, the round's shots and stats: byte for byte
    Object.keys(OTHER).forEach((k) => assert.equal(store[k], OTHER[k], k + ' untouched'));
    // another golfer's Range and bag: untouched
    assert.deepEqual(plain(rangeRec(s, 'n:ann alpha')), annBefore);
    assert.equal(B.bag('Ann Alpha').Dr.yd, 210);
    // a second reset of the same club: nothing left to do, nothing written
    const again = plain(store);
    assert.deepEqual(plain(R.resetRange(B, ME, 'Dr')), []);
    assert.deepEqual(plain(store), again);
    // a club that is not a club: nothing
    assert.deepEqual(plain(R.resetRange(B, ME, 'XX')), []);
});

test('reset all: every Range session of this golfer goes; each number falls back (before-Range typed / learned / setup / none)', { skip }, () => {
    const s = seeded(), { R, B, store } = s;
    R.addShot(ME, '9i', 128, 'typed');
    R.addShot(ME, 'SW', 80, 'typed');
    R.applyToBag(B, ME, R.summarize(R.current(ME).shots));   // writes 9i 128 over the setup 130, SW 80 over nothing
    const want = plain(B.bag(ME, { unset: ['7i', '9i', 'SW'] }));
    const plan = plain(R.resetPlan(B, ME));
    assert.deepEqual(plan.map((p) => [p.club, p.bagNow, p.setAfter, p.bagChanges]), [['Dr', 240, 230, true], ['7i', 150, null, true], ['9i', 128, null, true], ['SW', 80, null, true]]);
    R.resetRange(B, ME);
    assert.equal(rangeRec(s), undefined, 'no Range record left for Manny');
    assert.ok(rangeRec(s, 'n:ann alpha'), 'Ann\'s Range is kept');
    const bag = plain(B.bag(ME));
    assert.deepEqual(bag.Dr, { yd: 230, n: 0, set: true }, 'Driver: the typed number from before Range');
    assert.deepEqual(bag['7i'], want['7i']); assert.deepEqual(bag['7i'], { yd: 161, n: 3, set: false }, '7-iron: learned from the marked shots');
    assert.deepEqual(bag['9i'], { yd: 130, n: 0, set: false, base: true }, '9-iron: the setup carry');
    assert.equal(bag.SW, undefined, 'Sand wedge: no number (Range was its only one)');
    assert.deepEqual(bag.PW, { yd: 120, n: 0, set: true }, 'PW typed: untouched');
    Object.keys(OTHER).forEach((k) => assert.equal(store[k], OTHER[k], k + ' untouched'));
    assert.deepEqual(plain(R.rangeData(B, ME)), []);
    assert.deepEqual(plain(R.resetRange(B, ME)), [], 'nothing left: nothing to do');
});

test('a number typed over Range\'s stays: reset clears the Range shots only', { skip }, () => {
    const s = seeded(), { R, B } = s;
    B.set(ME, '7i', 152);   // typed in My bag after Update my bag
    const rows = plain(R.rangeData(B, ME));
    assert.equal(rows.find((r) => r.club === '7i').inBag, false);
    assert.deepEqual(plain(R.resetPlan(B, ME, '7i')), [{ club: '7i', name: '7-iron', shots: 3, bagNow: 152, bagChanges: false, setAfter: 152 }]);
    R.resetRange(B, ME, '7i');
    assert.equal(B.bag(ME)['7i'].yd, 152); assert.equal(B.bag(ME)['7i'].set, true);
    assert.deepEqual(rangeRec(s).sessions[0].shots.map((x) => x.c), ['Dr', 'Dr', 'Dr', 'Dr']);
    // and reset all leaves it too
    R.resetRange(B, ME);
    assert.equal(B.bag(ME)['7i'].yd, 152);
    assert.equal(B.bag(ME).PW.yd, 120);
});

test('a phone that used Range before this build (no "wrote" yet): the session\'s bag map stands in, no number before it', { skip }, () => {
    const { R, B, store } = sandbox();
    B.add(ME, '7i', 160); B.add(ME, '7i', 162); B.add(ME, '7i', 161);
    B.set(ME, 'Dr', 240); B.set(ME, '7i', 150); B.set(ME, 'PW', 118);
    const t0 = Date.now() - 3600e3;
    store[R.KEY] = JSON.stringify({ v: 1, golfers: { [KEYG]: { sessions: [{ id: String(t0), at: t0, shots: [{ c: 'Dr', yd: 240, by: 'gps', at: t0 }, { c: '7i', yd: 150, by: 'typed', at: t0 + 1 }, { c: 'PW', yd: 110, by: 'typed', at: t0 + 2 }], bag: { Dr: 240, '7i': 150, PW: 110 }, bagAt: t0 + 5 }] } } });
    // PW 118 was typed after Range's 110: not Range's any more
    assert.deepEqual(plain(R.resetPlan(B, ME)).map((p) => [p.club, p.bagChanges, p.setAfter]), [['Dr', true, null], ['7i', true, null], ['PW', false, 118]]);
    R.resetRange(B, ME, '7i');
    assert.deepEqual(plain(B.bag(ME)['7i']), { yd: 161, n: 3, set: false }, 'learned again');
    const ss = JSON.parse(store[R.KEY]).golfers[KEYG].sessions[0];
    assert.deepEqual(ss.bag, { Dr: 240, PW: 110 }, 'the session\'s bag map lost the 7-iron only');
    assert.deepEqual(ss.shots.map((x) => x.c), ['Dr', 'PW']);
    assert.equal(B.bag(ME).Dr.yd, 240, 'Driver not reset yet');
    R.resetRange(B, ME);
    assert.equal(B.bag(ME).Dr, undefined);
    assert.equal(B.bag(ME).PW.yd, 118);
    assert.equal(store[R.KEY], JSON.stringify({ v: 1, golfers: {} }));
});

test('bag(golfer, { unset }) is read-only and only drops the typed number of those clubs', { skip }, () => {
    const s = seeded(), { B, store } = s;
    const before = plain(store);
    const b = plain(B.bag(ME, { unset: ['Dr', '7i'] }));
    assert.equal(b.Dr, undefined); assert.deepEqual(b['7i'], { yd: 161, n: 3, set: false }); assert.equal(b.PW.yd, 120);
    assert.deepEqual(plain(B.bag(ME)), plain(B.bag(ME, {})));
    assert.deepEqual(plain(store), before);
});

test('wiring: My bag loads gps-range.js, rows + "Reset all range data" ask first; Cancel / outside tap changes nothing', { skip }, () => {
    const v = read('gps-view.js');
    assert.match(v, /loadScript\('gps-range\.js'[^]*?fillBag\(\)/, 'openBag loads Range before the list');
    assert.match(v, /data-bag-range-reset/);
    assert.match(v, /class="gps-bag-rangeall" style="display:none">Reset all range data</);
    // every reset path goes through the ask: resetRange is only called from the confirm's own button
    const calls = v.split('resetRange(').length - 1;
    assert.equal(calls, 1, 'one call site');
    assert.match(v, /if \(e\.target === go\) \{[^}]*RGn\.resetRange\(Bn, bagGolfer\(\), club \|\| null\)/);
    assert.match(v, /if \(e\.target === no \|\| e\.target === c\) \{ e\.preventDefault\(\); bagConfirmClose\(\); \}/);
    assert.match(v, /'Numbers you typed, your marked shots on the course and Strokes Gained stay\.'/);
    // the range reset never touches the shot log or Strokes Gained
    const r = read('gps-range.js');
    const body = r.slice(r.indexOf('// ---- RESET RANGE DATA'), r.indexOf('// ---- THE SHEET'));
    assert.doesNotMatch(body, /HardPanShotLog|shotlog|hardpan_sg|hardpan_shots|resetAll|\.reset\(/);
});
