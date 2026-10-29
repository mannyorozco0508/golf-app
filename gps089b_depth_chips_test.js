// 089b: MY MISS - THE CLUB CHIPS COVER THE WHOLE GREEN DEPTH (pure + source checks). Manny, Oct 27:
// from the golfer's LIVE spot (never the tee), a chip for every iron / wedge whose carry lands between the
// front and the back, plus the nearest club short of the front / long of the back within ~5 yds of that edge;
// labelled "LW · front +5" / "SW · middle" / "GW · back −1"; the default = the club closest to the target;
// at most 4 (closest first, then the shortest + longest on the green, then the rest, then the edges).
// Par-3 tees + approaches only (as 089). Streamsong Red #8 (F 79 / C 101 / B 122): LW 84, SW 104, GW 121 -> 3.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-miss-pattern.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
const M = ON ? require('./gps-miss-pattern.js') : null;
const bag = (o) => { const b = {}; Object.keys(o).forEach((k) => { b[k] = { yd: o[k] }; }); return b; };
const labels = (r) => r.list.map((x) => M.depthText(x.club, x.spot));

test('089b: Streamsong Red #8 (F 79 / C 101 / B 122) - LW 84, SW 104, GW 121 -> 3 labelled chips, SW the default', { skip }, () => {
    const B = bag({ LW: 84, SW: 104, GW: 121, PW: 133, '9i': 145, '8i': 157, '7i': 169, Dr: 260, Hy: 110 });
    const r = M.depthChips({ bag: B, front: 79, middle: 101, back: 122, aimYd: 101, app: 'SW' });
    assert.deepStrictEqual(r.list.map((x) => x.club), ['GW', 'SW', 'LW'], 'longest on top; PW (133, 11 past) is out; the hybrid never');
    assert.deepStrictEqual(labels(r), ['GW · back −1', 'SW · middle', 'LW · front +5']);
    assert.strictEqual(r.def, 'SW', 'closest to the target (101)');
    // Aim moved to the back of the green: GW is closest.
    assert.strictEqual(M.depthChips({ bag: B, front: 79, middle: 101, back: 122, aimYd: 118, app: 'SW' }).def, 'GW');
});

test('089b: the edge chips - nearest short of the front / long of the back, only within 5 yds', { skip }, () => {
    const B = bag({ '8i': 160, '9i': 150, PW: 138, GW: 126, SW: 116, LW: 100 });
    // F 120 / C 138 / B 156: on the green 9i, PW, GW; SW 4 short (edge), 8i 4 long (edge), LW 20 short (out).
    const r = M.depthChips({ bag: B, front: 120, middle: 138, back: 156, aimYd: 138, max: 9 });
    assert.deepStrictEqual(labels(r), ['8i · back +4', '9i · back −6', 'PW · middle', 'GW · front +6', 'SW · front −4']);
    // 6 yds short of the front: no edge chip.
    const r2 = M.depthChips({ bag: bag({ PW: 138, SW: 114 }), front: 120, middle: 138, back: 156, aimYd: 138 });
    assert.deepStrictEqual(r2.list.map((x) => x.club), ['PW']);
    // Exactly 5: kept.
    assert.deepStrictEqual(M.depthChips({ bag: bag({ PW: 138, SW: 115 }), front: 120, middle: 138, back: 156 }).list.map((x) => x.club), ['PW', 'SW']);
    // Only the NEAREST short one (not every club short).
    assert.deepStrictEqual(M.depthChips({ bag: bag({ PW: 138, GW: 117, SW: 116 }), front: 120, middle: 138, back: 156 }).list.map((x) => x.club), ['PW', 'GW']);
});

test('089b: max 4 - closest to the target, then the shortest + longest on the green, then the rest, then the edges', { skip }, () => {
    const B = bag({ '8i': 160, '9i': 150, PW: 138, GW: 126, SW: 116 });
    // 5 qualify (9i, PW, GW on; SW -4, 8i +4 edges): PW (closest), GW (front-most), 9i (back-most), then the
    // edges tie at 4 yds - the short one (SW) wins.
    const r = M.depthChips({ bag: B, front: 120, middle: 138, back: 156, aimYd: 138 });
    assert.deepStrictEqual(r.list.map((x) => x.club), ['9i', 'PW', 'GW', 'SW']);
    assert.strictEqual(r.def, 'PW');
    // A deep green with 6 clubs on it: closest + both ends + the next closest.
    const D = bag({ '6i': 186, '7i': 176, '8i': 165, '9i': 153, PW: 141, GW: 129 });
    const d = M.depthChips({ bag: D, front: 125, middle: 155, back: 190, aimYd: 155 });
    assert.deepStrictEqual(d.list.map((x) => x.club), ['6i', '8i', '9i', 'GW']);
    assert.strictEqual(d.def, '9i');
    assert.ok(d.list.length <= M.TUNE.MAX_CHIPS);
});

test('089b: one chip, no chips, a tie, no front / back', { skip }, () => {
    // Shallow green F 150 / C 156 / B 162: only 8i (158) lands on it; 7i 13 long, 9i 6 short.
    const r = M.depthChips({ bag: bag({ '7i': 171, '8i': 158, '9i': 144 }), front: 150, middle: 156, back: 162, aimYd: 156, app: '8i' });
    assert.deepStrictEqual(labels(r), ['8i · middle']);
    assert.strictEqual(r.def, '8i');
    // Nothing near the green: an empty list (the caller keeps 089's pair).
    assert.deepStrictEqual(M.depthChips({ bag: bag({ '7i': 190, '9i': 130 }), front: 150, middle: 156, back: 162 }), { list: [], def: null });
    // No front / back (a hole with the middle only): null -> 089's pair.
    assert.strictEqual(M.depthChips({ bag: bag({ '8i': 158 }), front: null, middle: 156, back: null }), null);
    assert.strictEqual(M.depthChips({ bag: bag({ '8i': 158 }), front: 160, middle: 156, back: 150 }), null);
    // A tie for closest: the app's pick wins.
    assert.strictEqual(M.depthChips({ bag: bag({ '8i': 160, '9i': 150 }), front: 145, middle: 155, back: 165, aimYd: 155, app: '9i' }).def, '9i');
    assert.strictEqual(M.depthChips({ bag: bag({ '8i': 160, '9i': 150 }), front: 145, middle: 155, back: 165, aimYd: 155, app: '8i' }).def, '8i');
    // Woods / hybrids / driver never.
    assert.deepStrictEqual(M.depthChips({ bag: bag({ Hy: 156, '3w': 158, Dr: 160 }), front: 150, middle: 156, back: 162 }), { list: [], def: null });
});

test('089b: plays-like - each carry lands where it plays today (as the oval: carry x yards / plays-like)', { skip }, () => {
    // 101 to the middle playing 110 (into the wind): SW 104 lands 95.5, GW 121 lands 111.1, PW 133 lands 122.1.
    const B = bag({ LW: 84, SW: 104, GW: 121, PW: 133 });
    const r = M.depthChips({ bag: B, front: 79, middle: 101, back: 122, aimYd: 101, rawYd: 101, playsYd: 110 });
    assert.deepStrictEqual(r.list.map((x) => x.club), ['PW', 'GW', 'SW', 'LW']);
    const pw = r.list.find((x) => x.club === 'PW');
    assert.ok(Math.abs(pw.along - 133 * 101 / 110) < 1e-9);
    assert.strictEqual(M.depthText('PW', pw.spot), 'PW · back', 'PW lands 122.1 = the back');
    assert.strictEqual(r.def, 'SW', 'SW (95.5) is 5.5 from the middle, GW (111.1) 10.1');
});

test('089b: labels - nearest of front / middle / back; middle quiet within 3; metres', { skip }, () => {
    assert.deepStrictEqual(M.landSpot(84, 79, 101, 122), { zone: 'front', off: 5 });
    assert.deepStrictEqual(M.landSpot(104, 79, 101, 122), { zone: 'middle', off: 3 });
    assert.deepStrictEqual(M.landSpot(121, 79, 101, 122), { zone: 'back', off: -1 });
    assert.deepStrictEqual(M.landSpot(75, 79, 101, 122), { zone: 'front', off: -4 });
    assert.deepStrictEqual(M.landSpot(125, 79, 101, 122), { zone: 'back', off: 3 });
    assert.strictEqual(M.depthText('SW', { zone: 'middle', off: 3 }), 'SW · middle');
    assert.strictEqual(M.depthText('SW', { zone: 'middle', off: -3.4 }), 'SW · middle');
    assert.strictEqual(M.depthText('SW', { zone: 'middle', off: 6.2 }), 'SW · middle +6');
    assert.strictEqual(M.depthText('LW', { zone: 'front', off: 0.2 }), 'LW · front');
    assert.strictEqual(M.depthText('LW', { zone: 'front', off: -4 }), 'LW · front −4');
    assert.strictEqual(M.depthText('GW', { zone: 'back', off: 11 }, 'm'), 'GW · back +10');
});

test('089b: gps-view wiring - live spot only, the default, the pill, the tap, 089 kept', { skip }, () => {
    const v = read('gps-view.js');
    assert.match(v, /if \(!mine && \(chips\.length \|\| always\) && typeof M\.depthChips === 'function'\)/, 'depth chips from the golfer\'s spot (live, held, or the tee)');
    assert.match(v, /missLastFix = \{ pt: fix\.pt\.slice\(\), at: fix\.at \}/, 'the last fix kept (memory only)');
    assert.match(v, /function dropStaleFix\(\) \{ if \(fix && \(!fix\.at \|\| Date\.now\(\) - fix\.at > FIX_STALE_MS\)\) \{ fix = null;/, 'the 10 s rule unchanged');
    assert.match(v, /var FIX_STALE_MS = 10000/);
    assert.match(v, /if \(o && o\.from === 'tee' && r && r\.mid && missLastFix\)/, 'the held fix only in missSync (My miss)');
    assert.match(v, /ft\.textContent = 'from tee'/, 'chips from the tee say so');
    assert.match(v, /M\.depthNote\(nm, f\.carry - plan\.aimYd, plan\.spot/, 'the depth note');
    assert.match(v, /G\.holeNumbers\(o\.pt, r\)/, 'front / back from the same numbers as F / C / B');
    assert.match(v, /var app = club, sel = def;/, 'the default = the depth chip closest to the target');
    assert.match(v, /c\.depth && c\.sel === c\.def/, 'the pill / Mark shot follow the shown chip');
    // 095b (Manny: "Keep my tapped club"): on the par 3 switcher a step onto the default is kept; elsewhere it clears.
    assert.match(v, /club === \(c\.def \|\| c\.app\) && !missSwitchOn\(\) \? null/, 'tapping the default clears the pick (not on the par 3 switcher)');
    assert.match(v, /M\.depthText\(clubShort\(x\.club\), x\.spot, u\)/, 'the depth label on the chip');
    assert.match(v, /M\.chipText\(clubShort\(x\.club\), x\.delta, u\)/, '089\'s "+8 long" kept for the fallback pair');
    assert.match(v, /M\.chipPair\(bag, club\)/, '089\'s pair kept');
    // Still memory only: no write, no storage of the chips / pick.
    const plan = v.slice(v.indexOf('function missPlan('), v.indexOf('function missChipsSync('));
    assert.doesNotMatch(plan, /localStorage|\.set\(|\.update\(|\.push\(\)|fetch\(/);
    assert.strictEqual(M.TUNE.EDGE_YD, 5); assert.strictEqual(M.TUNE.MAX_CHIPS, 4);
});

test('089b: the held fix - under 60 s yes (59 s), 60 s / 61 s no; memory only', { skip }, () => {
    const last = { pt: [27.9, -81.9], at: 1000000 };
    assert.deepStrictEqual(M.heldFix(last, 1000000 + 59000), [27.9, -81.9], '59 s: held');
    assert.strictEqual(M.heldFix(last, 1000000 + 60000), null, '60 s: not under 60');
    assert.strictEqual(M.heldFix(last, 1000000 + 61000), null, '61 s: gone');
    assert.deepStrictEqual(M.heldFix(last, 1000000), [27.9, -81.9]);
    assert.strictEqual(M.heldFix(null, 5), null);
    assert.strictEqual(M.heldFix({ pt: [1, 2] }, 5), null, 'no time: no fix');
    assert.strictEqual(M.heldFix(last, 999000), null, 'from the future: no');
    assert.strictEqual(M.TUNE.HOLD_FIX_MS, 60000);
});

test('089b: the note - one line, the target first, then where on the green', { skip }, () => {
    assert.strictEqual(M.depthNote('Lob wedge', -17, { zone: 'front', off: 5 }), 'Lob wedge: 17 yds short of the target · 5 yds onto the front');
    assert.strictEqual(M.depthNote('Sand wedge', 3, { zone: 'middle', off: 3 }), 'Sand wedge: 3 yds past the target · the middle');
    assert.strictEqual(M.depthNote('Sand wedge', 1.5, { zone: 'middle', off: 1.5 }), 'Sand wedge: on target · the middle');
    assert.strictEqual(M.depthNote('Gap wedge', 20, { zone: 'back', off: -1 }), 'Gap wedge: 20 yds past the target · 1 yd inside the back');
    assert.strictEqual(M.depthNote('Gap wedge', 25, { zone: 'back', off: 3 }), 'Gap wedge: 25 yds past the target · 3 yds past the back');
    assert.strictEqual(M.depthNote('Pitching wedge', -24, { zone: 'front', off: -4 }), 'Pitching wedge: 24 yds short of the target · 4 yds short of the front');
    assert.strictEqual(M.depthNote('9-iron', 7, { zone: 'middle', off: 7 }), '9-iron: 7 yds past the target · 7 yds past the middle');
    assert.strictEqual(M.depthNote('9-iron', -6, { zone: 'middle', off: -6 }), '9-iron: 6 yds short of the target · 6 yds short of the middle');
    assert.strictEqual(M.depthNote('LW', -10, { zone: 'front', off: 0.3 }), 'LW: 10 yds short of the target · on the front edge');
    assert.strictEqual(M.depthNote('LW', -11, { zone: 'front', off: 5.5 }, 'm'), 'LW: 10 m short of the target · 5 m onto the front');
    // The chip labels stay short.
    assert.strictEqual(M.depthText('LW', { zone: 'front', off: 5 }), 'LW · front +5');
});
