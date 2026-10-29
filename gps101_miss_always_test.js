// 101 (Manny's standing rule, Oct 29): THE MY MISS OVAL + CLUB SWITCHER SHOW ON EVERY PAR 3 AND EVERY APPROACH - never
// hidden for "range". Default = the club closest to the plays-like (a club with no data: the generic carry); nothing
// reaches: the longest club with "X short of the front". Cause it fixes: Papago 4 (par 3, 234) - the app's pick at 234
// is a hybrid / wood, shows() said 'club' (irons/wedges only, 063 a94f70e8) and missPlan returned before 095's switcher.
'use strict';
const fs = require('fs'), path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
global.window = global;
const M = require('./gps-miss-pattern.js');
const S = require('./gps-shots.js');
const B = window.HardPanGpsBag || S;
const V = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
const ORDER = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
const mk = (o) => { const b = {}; Object.keys(o).forEach((k) => { b[k] = { yd: o[k] }; }); return b; };
// Manny-like bag: hybrid ~234 (no 3-iron key in My bag; the hybrid is that slot).
const MB = { LW: 84, SW: 107, GW: 121, PW: 133, '9i': 145, '8i': 168, '7i': 180, '6i': 192, '5i': 208, '4i': 218, Hy: 234, '3w': 245, Dr: 265 };

test('101 cause: at 234 the app pick is the hybrid, and 063 shows() rejects it (why club) - the old hide', () => {
    const sg = B.suggestClub(mk(MB), 234);
    assert.strictEqual(sg.club, 'Hy');
    assert.strictEqual(M.shows({ club: 'Hy', carry: 234, greenYd: 234, fromTee: true }, { par: 3 }).why, 'club');
    assert.strictEqual(M.shows({ club: '4i', carry: 205, greenYd: 234, fromTee: true }, { par: 3 }).why, 'range', 'a 4i at 205 trips range');
    assert.ok(M.always('club') && M.always('range') && M.always('carry'));
    assert.ok(!M.always('tee'), 'a par 4/5 tee shot still hides'); assert.ok(M.always('layup'), 'a target off the green no longer hides it');
});
test('101 Papago 4 at 234 (plays 234): the default is the hybrid (closest), the switcher lists every club', () => {
    const nc = M.nearestClub(mk(MB), 234, ORDER, 'Hy');
    assert.deepStrictEqual(nc, { club: 'Hy', carry: 234, reaches: true });
    const ac = M.allClubs({ bag: mk(MB), front: 220, middle: 234, back: 248, aimYd: 234, rawYd: 234, playsYd: 234, app: 'Hy', order: ORDER });
    assert.strictEqual(ac.def, 'Hy'); assert.strictEqual(ac.list.length, 13);
    const x = ac.list.find((y) => y.club === 'Hy');
    assert.strictEqual(M.switchText('Hy', x.spot, 'yd', x.delta), 'Hy · middle');
});
test('101 Streamsong Red 8 at 20 mph: plays 140 from 114 - the old range hide, now the closest club shows', () => {
    // GW 121 was the app pick at calm; with 20 mph in the face the plays-like is ~140 and the iron pick (PW 133?) ...
    const sg = B.suggestClub(mk(MB), 140); // 9i 145
    const r = M.shows({ club: sg.club, carry: 145, greenYd: 160 }, null);  // a pick that misses by more than the margin
    assert.strictEqual(r.why, 'range');
    const nc = M.nearestClub(mk(MB), 160, ORDER, sg.club);
    assert.strictEqual(nc.club, '8i', '168 is closest to 160');
});
test('101 Streamsong Red 6 (186 to the middle) and a par 4 approach at 150: closest club', () => {
    assert.strictEqual(M.nearestClub(mk(MB), 184, ORDER).club, '7i');
    assert.strictEqual(M.nearestClub(mk(MB), 186, ORDER).club, '6i', 'a tie (180 / 192): the longer club');
    assert.strictEqual(M.nearestClub(mk(MB), 150, ORDER).club, '9i');
});
test('101 nothing reaches: the longest club, "X short of the front"', () => {
    const nc = M.nearestClub(mk(MB), 300, ORDER, 'Dr');
    assert.deepStrictEqual(nc, { club: 'Dr', carry: 265, reaches: false });
    const ac = M.allClubs({ bag: mk(MB), front: 285, middle: 300, back: 315, aimYd: 300, rawYd: 300, playsYd: 300, app: 'Dr', order: ORDER });
    assert.strictEqual(ac.def, 'Dr');
    const d = ac.list.find((y) => y.club === 'Dr');
    assert.strictEqual(M.switchText('Dr', d.spot, 'yd', d.delta), 'Dr · 20 short of the front');
    const w = M.aroundDef(ac).map((y) => y.club);
    assert.deepStrictEqual(w, ['Dr', '3w'], 'the approach stack: the default and its neighbours');
});
test('101 a club with no data uses the generic carry (My bag first-time table); his own numbers win', () => {
    const gen = B.defaultCarries(15);
    const mine = mk({ '7i': 180, PW: 133 });
    const f = M.fillBag(mine, gen, ORDER);
    assert.strictEqual(f['7i'].yd, 180); assert.ok(!f['7i'].gen);
    assert.strictEqual(f['4i'].gen, true); assert.ok(f['4i'].yd > 180, 'fitted above his 7i: ' + f['4i'].yd);
    assert.strictEqual(f.GW.gen, true); assert.ok(f.GW.yd < 133, 'fitted under his PW');
    assert.strictEqual(Object.keys(f).length, 14);
    // The order always holds (a raw generic 4i of 169 must never sit under his 7i of 180).
    const ys = ORDER.map((c) => f[c].yd); ys.forEach((y, k) => { if (k) assert.ok(ys[k - 1] > y, ORDER[k - 1] + ' ' + ys[k - 1] + ' > ' + ORDER[k] + ' ' + y); });
    // Between two of his clubs: the table's spacing. 095's bag: 4i between 5i 208 and Hy 220.
    const f2 = M.fillBag(mk({ '5i': 208, Hy: 220 }), gen, ORDER);
    assert.ok(f2['4i'].yd > 208 && f2['4i'].yd < 220, '4i ' + f2['4i'].yd);
    // No numbers at all: the table as is.
    assert.strictEqual(M.fillBag({}, gen, ORDER)['4i'].yd, gen['4i']);
    assert.strictEqual(M.nearestClub(M.fillBag({}, gen, ORDER), gen.Hy, ORDER).club, 'Hy', 'the generic hybrid is picked at its own number');
    assert.strictEqual(mine['4i'], undefined, 'the input bag is not changed');
});
test('101 wiring: missPlan shows anyway for club / range / carry, before the old return; the generic fill; the approach fallback', () => {
    const i = V.indexOf('function missPlan('), j = V.indexOf('function missPickClub(', i), body = V.slice(i, j);
    const a = body.indexOf('M.always(ok.why)'), r = body.indexOf('if (!ok.ok) return null');
    assert.ok(a > 0 && r > a, 'the always-on check runs before the old return');
    assert.match(body, /B\.defaultCarries\(bagHcp\(\)\)/);
    assert.match(body, /M\.fillBag\(bagMy, gen, B\.BAG\)/);
    assert.match(body, /B\.suggestClub\(bagMy, greenYd\)/, 'the app pick still from his own numbers');
    assert.match(body, /\(chips\.length \|\| always\)/);
    assert.match(body, /M\.aroundDef\(ap\)/);
    assert.match(body, /if \(!ok\.ok && !mine && typeof M\.always === 'function'/, 'Mark-open keeps its hides');
    assert.match(body, /any: allC \|\| always/);
    // Kept: tournament / read-only / My miss off hide before missPlan.
    assert.match(V, /function missShown\(\) \{ return !!\(S && bagSwitch\(\) && !tournament\(\) && !readOnlyHere\(\)\); \}/);
});
