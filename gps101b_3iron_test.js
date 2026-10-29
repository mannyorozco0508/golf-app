// 101b (Manny, Oct 29): "add a 3-iron slot to My bag (between 4i and hybrids, generic carry until I mark shots)".
// '3i' sits between Hy and 4i in every club list; the first-time table gives it a generic carry; a bag saved before
// it (no 3i) keeps working - the 3i shows his Hy/4i midpoint, marked typical, until he types a number or marks shots.
'use strict';
const fs = require('fs'), path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
global.window = global;
const store = {}; global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
window.localStorage = global.localStorage;
const S = require('./gps-shots.js'), B = window.HardPanGpsBag || S;
const M = require('./gps-miss-pattern.js');
const lists = { 'gps-shots.js': B.BAG };
const ORDER = ['Dr', '3w', '5w', 'Hy', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
const seed = (g) => { store.hardpan_bag_v1 = JSON.stringify({ v: 1, golfers: g }); };

test('101b: 3i in My bag between Hy and 4i, named 3-iron / 3i; 14 -> 15 clubs, none removed', () => {
    assert.deepStrictEqual(B.BAG, ORDER);
    assert.strictEqual(B.NAMES['3i'], '3-iron');
    ['gps-arcs-plan.js', 'gps-bushnell.js', 'gps-shot-bag.js', 'gps-shot-log.js', 'gps-range.js'].forEach((f) => {
        const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
        assert.ok(src.includes("'Hy', '3i', '4i'") || src.includes("'3i': '3-iron'"), f + ' has the 3i');
    });
});
test('101b: the generic carry sits between the hybrid and the 4-iron at every handicap', () => {
    [0, 10, 15, 20, 30, null].forEach((h) => { const d = B.defaultCarries(h); assert.ok(d.Hy > d['3i'] && d['3i'] > d['4i'], h + ': ' + d.Hy + '/' + d['3i'] + '/' + d['4i']); });
});
test('101b: an old saved bag (no 3i) keeps working - 3i = his Hy/4i midpoint, typical, until he marks shots', () => {
    seed({ 'n:manny': { shots: {}, set: { Hy: 234, '4i': 218, '7i': 180 } } });
    const b = B.bag('Manny');
    assert.deepStrictEqual(b['3i'], { yd: 226, n: 0, set: false, base: true, gen: true });
    assert.strictEqual(b.Hy.yd, 234); assert.strictEqual(b['4i'].yd, 218);
    assert.strictEqual(B.suggestClub(b, 224).club, '3i'); assert.strictEqual(B.suggestClub(b, 230).club, 'Hy');
    // His own numbers win: typed, or LEARN_MIN marked shots.
    seed({ 'n:manny': { shots: { '3i': [221, 223, 225] }, set: { Hy: 234, '4i': 218 } } });
    assert.strictEqual(B.bag('Manny')['3i'].yd, 223); assert.ok(!B.bag('Manny')['3i'].gen);
    seed({ 'n:manny': { shots: {}, set: { Hy: 234, '4i': 218, '3i': 229 } } });
    assert.strictEqual(B.bag('Manny')['3i'].yd, 229);
    // No neighbours: left out (101's My miss uses the generic table).
    seed({ 'n:manny': { shots: {}, set: { '7i': 180 } } });
    assert.strictEqual(B.bag('Manny')['3i'], undefined);
});
test('101b: the switcher order and My miss (101 any-club path) include the 3i', () => {
    seed({ 'n:manny': { shots: {}, set: { Hy: 234, '4i': 218, '7i': 180, PW: 133 } } });
    const bag = M.fillBag(B.bag('Manny'), B.defaultCarries(15), B.BAG);
    assert.strictEqual(M.nearestClub(bag, 226, B.BAG).club, '3i');
    const ac = M.allClubs({ bag, front: 212, middle: 226, back: 240, aimYd: 226, rawYd: 226, playsYd: 226, order: B.BAG });
    assert.strictEqual(ac.def, '3i');
    const up = ac.list.slice().sort((a, b) => a.carry - b.carry).map((x) => x.club);
    assert.ok(up.indexOf('4i') < up.indexOf('3i') && up.indexOf('3i') < up.indexOf('Hy'), up.join(','));
    assert.strictEqual(M.oval('3i', 226, 'R', null, true).club, '3i');
});
test('101b: setup offers the 3i; My bag labels a typical 3i', () => {
    const r = B.setup('New', B.defaultCarries(15)); assert.ok(r !== false);
    assert.strictEqual(B.bag('New')['3i'].yd, B.defaultCarries(15)['3i']);
    const V = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.ok(V.includes("v.gen ? 'typical \\u00b7 until you mark shots'"));
});
test('101b (Manny: YES): an approach where the 3i lands on the green shows a 3i depth chip (089b rules kept: up to 4, closest to the target)', () => {
    assert.ok(M.CLUBS.includes('3i') && M.isClub('3i'), 'the iron list is 3i-LW');
    assert.deepStrictEqual(M.CLUBS, ['3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW']);
    const bag = {}; Object.entries({ Hy: 240, '3i': 226, '4i': 214, '5i': 204, '7i': 180, PW: 133 }).forEach(([k, v]) => { bag[k] = { yd: v }; });
    const dc = M.depthChips({ bag, front: 218, middle: 226, back: 236, aimYd: 226, rawYd: 226, playsYd: 226, app: '3i' });
    const cl = dc.list.map((x) => x.club);
    assert.ok(cl.includes('3i'), '3i chip: ' + cl.join(','));
    assert.strictEqual(dc.def, '3i', 'closest to the target');
    assert.ok(!cl.includes('Hy'), 'hybrids still not in the 089b iron chips');
    assert.ok(dc.list.length <= 4);
    const x = dc.list.find((y) => y.club === '3i');
    assert.strictEqual(M.depthText('3i', x.spot, 'yd'), '3i · middle');
    // The approach shows() now takes the 3i in range like any iron.
    assert.strictEqual(M.shows({ club: '3i', carry: 226, greenYd: 226 }).ok, true);
});
