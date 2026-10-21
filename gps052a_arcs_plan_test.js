// URGENT-052 A - DISTANCE ARCS + TEE PLANNER: THE MATH (gps-arcs-plan.js) AND THE WIRING RULES (gps-view.js).
// Pure node: the arcs' landing distances against HardPanWindLearn.windTerm for known coefficients at known
// angles (0, 47, 88, 90, 180, 270), the "generic" label against the 049 (i) rule (live, through
// HardPanShotBag.infoText on a real shot log), the club picks, the arc geometry, the planner's yards-in and
// the hazard window, and source rules: off by default / per golfer, tournament + spectator gating, the map
// untouched while off, nothing stored but the toggle, nothing sent.
// What this file CANNOT prove: the map itself (layers, labels, taps) - urgent052a_arcs_chrome_test.js does
// that in real Chrome, through the Tools sheet a golfer uses.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-arcs-plan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
// A stand-in localStorage for the shot log (gps-shot-log.js) - the arcs module itself never touches storage.
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
require('./gps-geo.js'); require('./gps-shots.js'); require('./gps-shot-log.js'); require('./gps-wind-learn.js'); require('./gps-shot-bag.js');
const G = window.HardPanGeo, WL = window.HardPanWindLearn, SB = window.HardPanShotBag, SL = window.HardPanShotLog;
const A = require('./gps-arcs-plan.js');
const YD = 0.9144;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);
const OWN = { qualified: true, n: 14, head: -1.4, tail: 0.9, left: -0.6, right: -0.3 };

test('lands = carry - windTerm(carry, mph, rel, coeffs, hand).yards, for known coefficients at 0 / 47 / 88 / 90 / 180 / 270', () => {
    // Hand-worked (049 convention: 0 head, 90 from the right, 180 tail, 270 from the left):
    //   effect = head*headMph + tail*tailMph + left*fromLeft + right*fromRight; lands = carry + effect.
    const want = (rel, mph) => {
        const a = rel * Math.PI / 180, al = mph * Math.cos(a), ac = mph * Math.sin(a);
        return 160 + OWN.head * Math.max(al, 0) + OWN.tail * Math.max(-al, 0) + OWN.right * Math.max(ac, 0) + OWN.left * Math.max(-ac, 0);
    };
    for (const rel of [0, 47, 88, 90, 180, 270]) {
        const L = A.lands(160, { mph: 10, rel }, OWN, 'R');
        const t = WL.windTerm(160, 10, rel, OWN, 'R');
        assert.equal(L.yd, 160 - t.yards, 'exactly windTerm at ' + rel);
        near(L.yd, want(rel, 10), 1e-9, 'hand-worked at ' + rel);
        assert.equal(L.generic, false); assert.equal(L.model, 'learned');
    }
    // 88 deg at 10 mph = 9.99 from the right + 0.35 head (049): -1.4 x 0.349 - 0.3 x 9.998 = -3.487
    near(A.lands(160, { mph: 10, rel: 88 }, OWN, 'R').yd, 160 - 3.4875, 0.001, '88 deg');
    near(A.lands(160, { mph: 10, rel: 0 }, OWN, 'R').yd, 146, 1e-9, 'straight into it: 14 shorter');
    near(A.lands(160, { mph: 10, rel: 180 }, OWN, 'R').yd, 169, 1e-9, 'straight downwind: 9 longer');
});

test('the generic model before a club qualifies: today\'s plays-like wind term, and the same clamp', () => {
    const unq = { qualified: false, n: 5, head: -9, tail: 9, left: -9, right: -9 };   // its (unused) numbers must be ignored
    for (const rel of [0, 47, 88, 180, 270]) {
        const L = A.lands(262, { mph: 12, rel }, unq, 'R');
        assert.equal(L.yd, 262 - WL.windTerm(262, 12, rel, null, 'R').yards, 'generic at ' + rel);
        assert.equal(L.generic, true);
    }
    // 12 mph from 50 deg (into + from the right): head part 7.71 mph x 1% x 262 = 20.2 shorter
    near(A.lands(262, { mph: 12, rel: 50 }, null, 'R').yd, 262 - 262 * 0.01 * 12 * Math.cos(50 * Math.PI / 180), 1e-9);
    // generic crosswind: no distance change
    assert.equal(A.lands(150, { mph: 15, rel: 90 }, null, 'R').yd, 150);
    // no wind reading / calm: the carry itself
    assert.equal(A.lands(150, null, OWN, 'R').yd, 150);
    assert.equal(A.lands(150, { mph: 0.5, rel: 0 }, OWN, 'R').yd, 150);
    // the clamp (playsLike's 0.5x .. 1.6x)
    assert.equal(A.lands(100, { mph: 80, rel: 0 }, null, 'R').yd, 50);
});

test('the "generic" label = the 049 (i) rule, live on a real shot log (8 windy shots qualify a club)', () => {
    Object.keys(store).forEach((k) => delete store[k]);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // 7-iron: 9 shots in wind over 5 mph (qualifies); 6-iron: 7 windy + 3 calm (does not); 8-iron: none.
    for (let i = 0; i < 9; i++) SL.add({ golfer: 'Test 052A Ann', club: '7i', carry: 160 + (rnd() - 0.5) * 6, windMph: 8 + rnd() * 6, relAngle: Math.round(rnd() * 3599) / 10, date: Date.UTC(2026, 9, 20) - i * 1e6 });
    for (let i = 0; i < 7; i++) SL.add({ golfer: 'Test 052A Ann', club: '6i', carry: 172 + (rnd() - 0.5) * 6, windMph: 9, relAngle: i * 40, date: Date.UTC(2026, 9, 19) - i * 1e6 });
    for (let i = 0; i < 3; i++) SL.add({ golfer: 'Test 052A Ann', club: '6i', carry: 172, windMph: 2, relAngle: 0, date: Date.UTC(2026, 9, 18) - i * 1e6 });
    const fits = SB.fits('Test 052A Ann');
    assert.ok(fits['7i'] && fits['7i'].qualified === true, '7-iron qualified');
    assert.ok(fits['6i'] && fits['6i'].qualified === false && fits['6i'].n === 10, '6-iron: 10 shots, only 7 windy - not qualified');
    for (const c of ['7i', '6i', '8i']) {
        const info = SB.infoText('Test 052A Ann', c, null, 'R');
        assert.equal(A.isGeneric(fits[c] || null), !info.learned, c + ': arc label agrees with the (i)');
    }
    assert.equal(A.isGeneric(fits['7i']), false); assert.equal(A.isGeneric(fits['6i']), true); assert.equal(A.isGeneric(null), true);
    // and the arcs carry it
    const tee = [33.46, -111.96], mid = G.destination(tee, 0, 155 * YD);   // 155: the 7-iron, 6 and 8 either side
    const arcs = A.arcs({ bag: { '6i': { yd: 172 }, '7i': { yd: 160 }, '8i': { yd: 150 } }, fits, hand: 'R', wind: { mph: 10, fromDeg: 30 }, from: { pt: tee, kind: 'me' }, mid });
    assert.deepEqual(arcs.map((a) => a.club + (a.generic ? ':g' : '')), ['6i:g', '7i', '8i:g']);
    const a7 = arcs.find((a) => a.club === '7i');
    assert.equal(a7.yd, 160 - WL.windTerm(160, 10, 30, fits['7i'], 'R').yards, 'the 7-iron arc uses ITS fit');
});

test('which clubs: from the tee the woods / hybrid that do not fly the hole; from the ball the club and its neighbours', () => {
    const bag = { Dr: { yd: 262 }, '3w': { yd: 231 }, Hy: { yd: 205 }, '4i': { yd: 195 }, '6i': { yd: 172 }, '7i': { yd: 160 }, '8i': { yd: 150 }, '9i': { yd: 138 }, PW: { yd: 125 } };
    assert.deepEqual(A.pickTee(bag, 400, 4), ['Dr', '3w', 'Hy']);
    assert.deepEqual(A.pickTee(bag, 240, 4), ['3w', 'Hy', '4i'], 'a short par 4: the driver would fly it');
    assert.deepEqual(A.pickTee(bag, 155, 3), ['6i', '7i', '8i'], 'a par 3: the clubs around its length (7-iron gets there)');
    assert.deepEqual(A.pickBall(bag, 150), ['7i', '8i', '9i'], '150: the 8-iron gets there; 7 and 9 either side');
    assert.deepEqual(A.pickBall(bag, 300), ['Dr', '3w'], 'past every club: the longest');
    assert.deepEqual(A.pickBall({}, 150), []);
});

test('arc geometry: every point the landing distance from the tee / ball, centred on the line', () => {
    const tee = [33.46, -111.96], mid = G.destination(tee, 20, 400 * YD);
    const arcs = A.arcs({ bag: { Dr: { yd: 262 }, '3w': { yd: 231 } }, fits: {}, hand: 'R', wind: { mph: 12, fromDeg: 70 }, from: { pt: tee, kind: 'tee' }, mid, holeYd: 400, par: 4 });
    assert.equal(arcs.length, 2);
    arcs.forEach((a) => {
        a.pts.forEach((p) => near(G.haversineMeters(tee, p), a.yd * YD, 0.3, 'radius'));
        near(G.bearingDeg(tee, a.pts[8]), 20, 0.01, 'middle point on the line');
        near((G.bearingDeg(tee, a.pts[0]) + G.bearingDeg(tee, a.pts[16])) / 2, 20, 0.01, 'symmetric');
        assert.ok(a.stillPts && a.stillPts.length === 17, 'the still-air arc too (the wind moves it 3+)');
        assert.deepEqual(a.end, a.pts[16]);
    });
    // rel = wind FROM 70 vs the tee -> green center line (about 20): about 50
    const rel = WL.relAngle(70, G.bearingDeg(tee, mid));
    near(rel, 50, 0.01);
    assert.equal(arcs[0].yd, 262 - WL.windTerm(262, 12, rel, null, 'R').yards);
    const calm = A.arcs({ bag: { Dr: { yd: 262 } }, fits: {}, hand: 'R', wind: null, from: { pt: tee, kind: 'tee' }, mid, holeYd: 400, par: 4 });
    assert.equal(calm[0].yd, 262); assert.equal(calm[0].stillPts, null, 'no wind: one arc');
});

// A straight 400-yd par 4 north; a fairway bunker right (front 250 / back 274), water left (221 / 245),
// a greenside bunker (one point, 390). Synthetic points - no licensed data.
const TEE = [33.46, -111.96], MID = G.destination(TEE, 0, 400 * YD);
const at = (yd, side) => G.destination(G.destination(TEE, 0, yd * YD), side === 'R' ? 90 : 270, 20);
const HZ = [{ type: 'fb', side: 'R', pt: at(250, 'R') }, { type: 'fb', side: 'R', pt: at(274, 'R') }, { type: 'w', side: 'L', pt: at(221, 'L') }, { type: 'w', side: 'L', pt: at(245, 'L') },
    { type: 'gb', side: 'L', pt: at(390, 'L') }];
const BAG = { Dr: { yd: 262 }, '3w': { yd: 231 }, Hy: { yd: 205 }, '7i': { yd: 160 } };

test('the tee planner: yards in, and the hazards each club brings into play by distance window', () => {
    const p = A.plan({ bag: BAG, fits: {}, hand: 'R', wind: null, tee: TEE, mid: MID, path: null, hazards: HZ, par: 4 });
    near(p.holeYd, 400, 0.01);
    assert.equal(p.hazardData, true);
    assert.deepEqual(p.rows.map((r) => r.club), ['Dr', '3w', 'Hy']);
    assert.deepEqual(p.rows.map((r) => Math.round(r.inYd)), [138, 169, 195]);
    assert.equal(p.summary, 'Driver → 138 in · 3-wood → 169 in · Hybrid → 195 in');
    const hz = (c) => p.rows.find((r) => r.club === c).hazards.map((z) => z.name + ' ' + Math.round(z.reachYd) + '-' + (z.carryYd == null ? '' : Math.round(z.carryYd)));
    // reach / carry are straight-line from the tee to points 20 m off the line: 250 -> 250.9, 274 -> 274.8
    assert.deepEqual(hz('Dr'), ['Fairway bunker right 251-275'], 'Dr 262 lands in [241, 275]');
    assert.deepEqual(hz('3w'), ['Water left 222-246'], '3W 231 lands in [212, 246]');
    assert.deepEqual(hz('Hy'), [], 'Hy 205 is short of both windows: clear');
    // the window edges: 10 short of the near edge counts, past the far edge does not
    const fb = G.hazardRows(TEE, HZ, MID).find((z) => z.type === 'fb');
    const reach = fb.reachM / YD, far = fb.carryM / YD;
    assert.equal(A.inPlay(reach - 10, fb), true); assert.equal(A.inPlay(reach - 10.5, fb), false);
    assert.equal(A.inPlay(far, fb), true); assert.equal(A.inPlay(far + 0.5, fb), false);
    // one point: 10 either side
    const gb = G.hazardRows(TEE, HZ, MID).find((z) => z.type === 'gb');
    assert.equal(gb.carryM, null);
    assert.equal(A.inPlay(gb.reachM / YD + 9.9, gb), true); assert.equal(A.inPlay(gb.reachM / YD - 10.1, gb), false);
    // behind: never
    assert.equal(A.inPlay(100, { reachM: 50, carryM: 60, behind: true }), false);
});

test('the planner in the wind: lands moves, so do yards-in and the window (12 mph straight in)', () => {
    const p = A.plan({ bag: BAG, fits: {}, hand: 'R', wind: { mph: 12, fromDeg: 0 }, tee: TEE, mid: MID, path: null, hazards: HZ, par: 4 });
    const dr = p.rows[0];
    near(dr.lands, 262 - 262 * 0.12, 1e-9, 'generic: 12% of 262 shorter');
    near(dr.inYd, 400 - dr.lands, 0.01);
    assert.deepEqual(dr.hazards.map((z) => z.type), ['w'], 'Dr lands 230.6: now the water, not the bunker');
    assert.deepEqual(p.wind, { mph: 12, rel: 0 });
});

test('a dogleg: yards in are walked along the hole\'s path; no hazard data says so; a driver past the green', () => {
    const corner = G.destination(TEE, 0, 250 * YD), mid = G.destination(corner, 90, 150 * YD);
    const p = A.plan({ bag: BAG, fits: {}, hand: 'R', wind: null, tee: TEE, mid, path: [TEE, corner, mid], hazards: [], par: 4 });
    near(p.holeYd, 400, 0.05);
    assert.equal(p.hazardData, false);
    assert.ok(p.rows.every((r) => r.hazards.length === 0));
    const dr = p.rows.find((r) => r.club === 'Dr');
    near(dr.inYd, 138, 0.5, 'walked: 262 along the path leaves 138, not the straight-line 175');
    const short = A.plan({ bag: { '3w': { yd: 231 }, Hy: { yd: 205 } }, fits: {}, hand: 'R', wind: null, tee: TEE, mid: G.destination(TEE, 0, 225 * YD), hazards: [], par: 4 });
    assert.equal(short.rows[0].club, '3w'); assert.equal(short.rows[0].green, true);
    assert.match(short.summary, /^3-wood → on the green/);
});

test('gps-arcs-plan.js is pure: no DOM, storage, network, account, money or position', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-arcs-plan.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
    assert.ok(/function plan\(/.test(src) && /windTerm\(/.test(src), 'positive: the module is what this test thinks it is');
    for (const bad of [/localStorage/, /sessionStorage/, /fetch\(/, /XMLHttpRequest/, /firebase/i, /navigator/, /document\./, /geolocation/, /\.ref\(/, /sendBeacon/, /WebSocket/]) assert.ok(!bad.test(src), String(bad));
});

test('gps-view.js wiring: off by default, per golfer, tournament / spectator gated, map untouched while off, nothing sent', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    const at0 = v.indexOf('// ---- DISTANCE ARCS + TEE PLAN (URGENT-052 A');
    const sec = v.slice(at0, v.indexOf('\n    // HAZARD CARRIES (GolfAPI courses)', at0));
    assert.ok(at0 > 0 && /function drawCarryArcs\(/.test(sec) && /function fillTeePlan\(/.test(sec), 'positive: the section');
    assert.match(sec, /function arcsPref\(\) \{ return arcsRec\(\)\[arcsGolferKey\(\)\] === 1; \}/, 'on only when this golfer turned it on');
    assert.match(sec, /var ARCS_KEY = 'hardpan_gps_arcs_v1'/);
    assert.match(sec, /function planAllowed\(\) \{ return !!\(S && S\.pro && !tournament\(\) && !readOnlyHere\(\) && bagSwitch\(\)\); \}/, 'tournament mode and a spectator: neither');
    assert.match(sec, /function arcsLive\(\) \{ return !!\(planAllowed\(\) && arcsPref\(\) && /);
    assert.match(sec, /if \(!list\.length\) \{\s*\['carry052-still', 'carry052'\]\.forEach\(function \(id\) \{ if \(map\.getLayer\(id\)\) map\.removeLayer\(id\); \}\);\s*if \(map\.getSource\('carry052'\)\) map\.removeSource\('carry052'\);/, 'off: no source, no layer');
    // the script is loaded only while the arcs are live, or the plan is opened
    assert.match(sec, /if \(live && !A && !S\.arcsLoad\)/);
    // storage: the toggle only - one localStorage key; no database, no network in the section
    assert.deepEqual((sec.match(/localStorage\.(setItem|removeItem)\(([A-Z_]+)/g) || []).map((x) => x.replace(/.*\(/, '')).filter((x, i, a) => a.indexOf(x) === i), ['ARCS_KEY']);
    for (const bad of [/\.ref\(/, /fetch\(/, /XMLHttpRequest/, /S\.db/, /sendBeacon/]) assert.ok(!bad.test(sec), String(bad));
    // the tee plan closes in tournament mode / for a spectator; the tee tap and the Tools switch are gated
    assert.match(v, /if \(tplanOpen\(\)\) \{ if \(S\.mode !== 'measure' \|\| !planAllowed\(\)\) closeTeePlan\(\); else fillTeePlan\(\); \}/);
    assert.match(v, /if \(planAllowed\(\) && rt && rt\.tee && rt\.mid && G\.haversineMeters\(pt, rt\.tee\) <= TEE_TAP_YD \* G\.M_PER_YD\) \{ openTeePlan\(\); return; \}/);
    assert.match(v, /sw\('arcs', arcsPref\(\), planAllowed\(\)\);/);
    assert.match(v, /else if \(w === 'arcs'\) \{ if \(planAllowed\(\)\) toggleArcs\(\); tsSync\(\); \}/);
    // no new buttons on the map itself: the only new controls are in the Tools menu / sheet and the plan sheet
    const markupAt = v.indexOf("'<div class=\"gps-tplan ");
    assert.ok(markupAt > 0, 'positive: the plan sheet markup');
    const right = v.slice(v.indexOf("+ '<div class=\"gps-right\""), v.indexOf("+ '<div class=\"gps-clubs gps-float\""));
    assert.ok(right.length > 100 && /gps-hz-btn/.test(right) && !/arcs|tplan|tee-plan/.test(right), 'the map\'s right-hand buttons: unchanged');
});
