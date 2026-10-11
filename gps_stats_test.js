// ============================================================================
// HARDPAN GPS - MY STATS (gps-features): putts, fairway, GIR; the round; the season
//
// gps-stats.js in a sandbox: GIR from the score (score - putts <= par - 2) with an
// override; no fairway on a par 3; the round's summary from the holes with a
// score; the season from every round on the phone; and nothing ever written
// anywhere but this phone's storage.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-stats.js'));
const skip = ON ? false : 'Consumer tree: no GPS stats';

function sandbox(ls) {
    const store = ls || {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    return { St: sb.HardPanGpsStats, store };
}
const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];
const ctx = (code, scores, hole) => ({ code, course: 'Prestwick Country Club', hole: hole || 1, par: PARS[(hole || 1) - 1],
    round: { scores }, holes: PARS.map((p, i) => ({ n: String(i + 1), par: p })), players: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }] });

test('GIR from the score: on the green in par - 2 or fewer; nothing to say without a score or putts', { skip }, () => {
    const { St } = sandbox();
    assert.equal(St.girAuto(4, 2, 4), true, 'par 4, 4 with 2 putts: on in 2');
    assert.equal(St.girAuto(5, 2, 4), false, 'on in 3');
    assert.equal(St.girAuto(3, 1, 3), false, 'par 3, on in 2: not regulation');
    assert.equal(St.girAuto(3, 2, 3), true);
    assert.equal(St.girAuto(5, 3, 5), true, 'par 5 on in 2');
    assert.equal(St.girAuto(0, 2, 4), null); assert.equal(St.girAuto(4, null, 4), null);
});

test('a hole: putts, fairway (n/a on a par 3), and a GIR override that beats the score', { skip }, () => {
    const { St } = sandbox({ golfapp_me_ZNBLP8: '1' });
    const c = ctx('ZNBLP8', { p1_h1: 5, p1_h5: 3 });
    St.setHole(c, '1', { putts: 3, fw: 'L' });
    let v = St.holeView(St.load('ZNBLP8'), '1', 5, 4);
    assert.deepEqual([v.putts, v.fw, v.girAuto, v.gir], [3, 'L', true, true], 'on in 2, three-putt');
    St.setHole(c, '1', { gir: false });                // the "putts" were from off the green
    v = St.holeView(St.load('ZNBLP8'), '1', 5, 4);
    assert.deepEqual([v.gir, v.girOverride], [false, false]);
    St.setHole(c, '5', { fw: 'hit' });
    assert.equal(St.holeView(St.load('ZNBLP8'), '5', 3, 3).fw, 'na', 'no fairway on a par 3');
    assert.equal(St.load('ZNBLP8').player, '1', 'the golfer this phone is ("This is me")');
});

test('the round: holes with a score; fairways on par 4s / 5s; putts per hole; GIR %', { skip }, () => {
    const { St } = sandbox({ golfapp_me_R1: '1' });
    const scores = { p1_h1: 4, p1_h2: 5, p1_h3: 4, p1_h5: 3, p2_h1: 9 };
    const c = ctx('R1', scores);
    St.setHole(c, '1', { putts: 2, fw: 'hit' });   // GIR
    St.setHole(c, '2', { putts: 2, fw: 'R' });     // not GIR
    St.setHole(c, '3', { putts: 1, fw: 'L' });     // GIR
    St.setHole(c, '5', { putts: 2 });              // par 3 in 3: not GIR
    const s = St.summary(St.load('R1'));
    assert.deepEqual([s.holes, s.strokes, s.par, s.toPar], [4, 16, 15, 1]);
    assert.deepEqual([s.putts, s.puttHoles], [7, 4]);
    assert.deepEqual([s.fwHit, s.fwChances, s.fwL, s.fwR], [1, 3, 1, 1]);
    assert.deepEqual([s.gir, s.girHoles], [2, 4]);
    assert.equal(Math.round(s.girPct * 100), 50);
});

test('the season: every round on this phone; putts per round only from full 18s', { skip }, () => {
    const { St } = sandbox({ golfapp_me_A: '1', golfapp_me_B: '1' });
    const full = {}; PARS.forEach((p, i) => { full['p1_h' + (i + 1)] = p; });
    const a = ctx('A', full);
    PARS.forEach((p, i) => St.setHole(a, String(i + 1), { putts: 2, fw: p >= 4 ? 'hit' : undefined }));
    const b = ctx('B', { p1_h1: 6 });
    St.setHole(b, '1', { putts: 3, fw: 'R' });
    const ss = St.season();
    assert.equal(ss.rounds, 2);
    assert.equal(ss.puttsPerRound, 36, 'only round A is a full 18');
    assert.equal(Math.round(ss.puttsPerHole * 100) / 100, Math.round(39 / 19 * 100) / 100);
    assert.equal(Math.round(ss.fwPct * 100), Math.round(14 / 15 * 100));
});

test('on this phone only: no Firebase anywhere in it; the Tools item opens it; the snapshot follows saved scores', { skip }, () => {
    const src = read('gps-stats.js').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/firebase|\.ref\(|fetch\(|XMLHttpRequest/.test(src), 'no database, no network');
    const v = read('gps-view.js');
    assert.ok(/class="gps-menu-item gps-my-stats">My stats</.test(v));
    assert.ok(/on\(el, '\.gps-my-stats'[\s\S]{0,400}HardPanGpsStats\.open\(statsCtx\(\)\)/.test(v));
    assert.ok(/function roundUpdated\(round\)[\s\S]{0,400}St\.refresh\(statsCtx\(\)\)/.test(v));
});
