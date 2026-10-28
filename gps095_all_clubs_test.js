// 095 (Manny, Oct 28) - THE PAR 3 CLUB SWITCHER STEPS THROUGH EVERY CLUB IN MY BAG, shortest to longest (not only the
// clubs landing on the green). The default stays the club closest to the target; the end arrows dim only at the bag's
// shortest and longest club. The text: on the green as today ("SW · middle +10"); off the green "9i · 12 past the back"
// / "LW · 18 short of the front". A dragged target re-picks the default. Approaches (par 4 / 5): unchanged.
'use strict';
const fs = require('fs'), path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
global.window = global;
const M = require('./gps-miss-pattern.js');
const V = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
const fnBody = (name) => { const i = V.indexOf('function ' + name + '('); assert.ok(i > 0, name + ' exists'); const j = V.indexOf('\n    function ', i + 10); return V.slice(i, j > 0 ? j : i + 4000); };
const ORDER = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
const MB = { LW: 84, SW: 107, GW: 121, PW: 133, '9i': 145, '8i': 168, '7i': 180, '6i': 192, '5i': 208, Hy: 220, '3w': 235, Dr: 260 };
const bag = {}; Object.keys(MB).forEach((k) => { bag[k] = { yd: MB[k] }; });
// Streamsong Red #8 at 114 to the middle: F 92 / C 114 / B 135 (the green's 43 yds of depth), still air.
const Q = { bag, front: 92, middle: 114, back: 135, aimYd: 114, rawYd: 114, playsYd: 114, app: 'GW', order: ORDER };
const short = (c) => (c === 'Dr' ? 'Dr' : c.replace(/w$/, 'W'));

test('095: allClubs - every club in My bag (woods / hybrid / driver too), shortest first after the switcher sort', () => {
    const r = M.allClubs(Q);
    const up = r.list.slice().sort((a, b) => a.carry - b.carry).map((x) => x.club);
    assert.deepStrictEqual(up, ['LW', 'SW', 'GW', 'PW', '9i', '8i', '7i', '6i', '5i', 'Hy', '3w', 'Dr']);
    assert.strictEqual(r.list.length, Object.keys(MB).length, 'every club with a carry');
    // The 089b chips for the same spot were only the clubs on / at the green.
    const dc = M.depthChips(Q); assert.ok(dc.list.length < r.list.length, 'more than the green clubs: ' + dc.list.length);
});
test('095: the default stays the club closest to the target (a tie: the app pick), and re-picks when the target moves', () => {
    assert.strictEqual(M.allClubs(Q).def, 'GW', 'SW -7 / GW +7 tie -> the app pick');
    assert.strictEqual(M.allClubs(Object.assign({}, Q, { aimYd: 100 })).def, 'SW', 'target dragged to the front');
    assert.strictEqual(M.allClubs(Object.assign({}, Q, { aimYd: 132 })).def, 'PW', 'target dragged to the back');
    assert.strictEqual(M.allClubs(Object.assign({}, Q, { aimYd: 88 })).def, 'LW', 'target near the front edge: LW (off the green) is closest');
    assert.strictEqual(M.allClubs(Object.assign({}, Q, { front: null })), null, 'no front / back: null (the caller keeps 089)');
});
test('095: the text - on the green zone + yds vs the TARGET (Manny: "zone + yards vs target"), off the green "12 past the back" / "18 short of the front"', () => {
    const r = M.allClubs(Q), t = {};
    r.list.forEach((x) => { t[x.club] = M.switchText(short(x.club), x.spot, 'yd', x.delta); });
    assert.strictEqual(t.SW, 'SW · middle −7');
    assert.strictEqual(t.GW, 'GW · middle +7');
    assert.strictEqual(t.PW, 'PW · back +19', 'on the green: zone + yds vs the target (133 vs 114)');
    assert.strictEqual(t.LW, 'LW · 8 short of the front');
    assert.strictEqual(t['9i'], '9i · 10 past the back');
    assert.strictEqual(t.Dr, 'Dr · 125 past the back');
    assert.strictEqual(t['3w'], '3W · 100 past the back');
    assert.strictEqual(M.switchText('LW', { zone: 'front', off: -18 }, 'yd'), 'LW · 18 short of the front');
    assert.strictEqual(M.switchText('9i', { zone: 'back', off: 12 }, 'yd'), '9i · 12 past the back');
    assert.strictEqual(M.switchText('SW', { zone: 'middle', off: 4 }, 'yd', 10), 'SW · middle +10', 'on the green: zone + yds vs the target');
    assert.strictEqual(M.switchText('GW', { zone: 'back', off: -1 }, 'yd', 20), 'GW · back +20');
    assert.strictEqual(M.switchText('LW', { zone: 'front', off: 5 }, 'yd', -17), 'LW · front −17');
    assert.strictEqual(M.switchText('SW', { zone: 'middle', off: 4 }, 'yd', 2.6), 'SW · middle', 'the middle: no number within 3');
    assert.strictEqual(M.switchText('9i', { zone: 'back', off: 12 }, 'yd', 40), '9i · 12 past the back', 'off the green keeps the edge form');
    // A dragged target: the on-green numbers follow it, the off-green texts keep the edge form.
    const d = M.allClubs(Object.assign({}, Q, { aimYd: 100 })), t2 = {};
    d.list.forEach((x) => { t2[x.club] = M.switchText(short(x.club), x.spot, 'yd', x.delta); });
    assert.strictEqual(t2.SW, 'SW · middle +7'); assert.strictEqual(t2.GW, 'GW · middle +21'); assert.strictEqual(t2.PW, 'PW · back +33');
    assert.strictEqual(t2.LW, t.LW); assert.strictEqual(t2['9i'], t['9i']); assert.strictEqual(t2.Dr, t.Dr);
    assert.strictEqual(M.switchText('SW', { zone: 'front', off: 4 }, 'yd'), M.depthText('SW', { zone: 'front', off: 4 }, 'yd'));
    assert.strictEqual(M.switchText('GW', { zone: 'back', off: 0.2 }, 'yd'), 'GW · back', 'no delta: depthText');
    assert.strictEqual(M.switchText('LW', { zone: 'front', off: -20 }, 'm'), 'LW · 18 short of the front', 'metres');
});
test('095: the oval may be any club on the switcher (any = true); irons / wedges only otherwise', () => {
    assert.strictEqual(M.oval('Hy', 220, 'R', 220), null, 'unchanged without any');
    const o = M.oval('Hy', 220, 'R', 220, true); assert.ok(o && o.club === 'Hy' && o.carry === 220);
    assert.ok(M.oval('7i', 180, 'R', 180).a > 0, 'irons as before');
});
test('095: wired on the par 3 switcher only; arrows dim only at the ends of the full list; re-pick on a drag (par 3)', () => {
    const plan = fnBody('missPlan');
    assert.match(plan, /hn && isPar3\(\) && typeof M\.allClubs === 'function' \? M\.allClubs\(/, 'par 3 only');
    assert.match(plan, /order: B\.BAG/, 'My bag order: every club');
    assert.match(plan, /if \(dc && dc\.list\.length\) \{ chips = dc\.list; def = dc\.def; depth = true; \}/, 'approaches keep the 089b chips');
    assert.match(fnBody('missSync'), /M\.oval\(plan\.club, plan\.carry, plan\.hand, plan\.along, !!plan\.any\)/);
    assert.match(fnBody('missSwitchSync'), /if \(c\.all && x\.spot && typeof M\.switchText === 'function'\) t = M\.switchText\(clubShort\(x\.club\), x\.spot, u, x\.delta\)/);
    assert.match(fnBody('missSwitchSync'), /lessOff = i <= 0, moreOff = i >= list\.length - 1/);
    assert.match(fnBody('missPickClub'), /isPar3\(\) && p\.tgt !== undefined && p\.tgt !== missTgtKey\(\)/);
    assert.match(fnBody('missChipTap'), /tgt: missTgtKey\(\)/);
});
