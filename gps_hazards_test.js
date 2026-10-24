// ============================================================================
// HARDPAN GPS - THE HAZARDS + LAYUP SHEET (008, switch hazards)
//
// gps-geo.js turns the GolfAPI hazard points the app already carries (front and
// back edge of each, with kind and side) into REACH / CARRY from the golfer, and
// the layups ("lay up to 100 = 164 from you"). Known points, known answers.
// tools/gps-hazards-check.js opens the sheet in headless Chrome.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

const ME = [33.6, -79.0];
// Built in the tests: a Consumer tree has no gps-geo.js to build them with.
const greenOf = () => north(ME, 250);
const hazards = () => [
    { type: 'fb', side: 'R', pt: east(north(ME, 150), 20) },    // a fairway bunker, front edge
    { type: 'fb', side: 'R', pt: east(north(ME, 170), 20) },    // ... and its back edge
    { type: 'w', side: 'L', pt: east(north(ME, 200), -15) },    // water, one point
    { type: 'fb', side: 'L', pt: east(north(ME, -30), -10) },   // a bunker behind the golfer
    { type: 'fb', side: 'L', pt: east(north(ME, -45), -10) },
    { type: 'gb', side: 'C', pt: north(ME, 262) },              // short of the green... and past it
];

test('hazard points: same kind + side within 60 m = one hazard (front + back); a different kind never joins', () => {
    const g = geo.hazardGroups(hazards());
    assert.deepEqual(g.map((x) => [x.type, x.side, x.pts.length]), [['fb', 'R', 2], ['w', 'L', 1], ['fb', 'L', 2], ['gb', 'C', 1]]);
    // Two bunkers of the same side 100 m apart are two hazards.
    assert.equal(geo.hazardGroups([{ type: 'fb', side: 'R', pt: north(ME, 100) }, { type: 'fb', side: 'R', pt: north(ME, 200) }]).length, 2);
    // A pair is two points: a third close by starts a new hazard.
    assert.equal(geo.hazardGroups([0, 10, 20].map((m) => ({ type: 'gb', side: 'L', pt: north(ME, 100 + m) }))).length, 2);
    assert.deepEqual(geo.hazardGroups(null), []);
});

test('reach = the near edge, carry = the far edge, from the golfer; one point: reach only; behind: no numbers; nearest first', () => {
    const HZ = hazards(), GREEN = greenOf();
    const rows = geo.hazardRows(ME, HZ, GREEN);
    assert.deepEqual(rows.map((r) => r.name), ['Fairway bunker right', 'Water left', 'Greenside bunker center', 'Fairway bunker left']);
    close(rows[0].reachM, Math.hypot(150, 20), 0.5, 'bunker reach');
    close(rows[0].carryM, Math.hypot(170, 20), 0.5, 'bunker carry');
    close(rows[1].reachM, Math.hypot(200, 15), 0.5, 'water reach');
    assert.equal(rows[1].carryM, null, 'one point: no carry');
    assert.equal(rows[3].behind, true);
    assert.equal(rows[3].reachM, null);
    // In yards, as the sheet shows them: 151.3 m = 165 yds, 171.2 m = 187 yds.
    assert.equal(geo.shownDistance(rows[0].reachM, 'yd'), '165');
    assert.equal(geo.shownDistance(rows[0].carryM, 'yd'), '187');
    // The golfer walks 50 m on: every number drops by about that much; the bunker is now 100 / 120.
    const on = geo.hazardRows(north(ME, 50), HZ, GREEN);
    close(on[0].reachM, Math.hypot(100, 20), 0.5);
    close(on[0].carryM, Math.hypot(120, 20), 0.5);
    // Past the bunker's front edge only: still ahead (its back edge is), reach is the nearer edge.
    const mid = geo.hazardRows(north(ME, 160), HZ, GREEN).filter((r) => r.name === 'Fairway bunker right')[0];
    assert.equal(mid.behind, false);
    assert.deepEqual(geo.hazardRows(null, HZ, GREEN), [], 'nowhere to measure from');
    assert.deepEqual(geo.hazardRows(ME, [], GREEN), [], 'no hazard data');
});

test('layups: 50 / 75 / 100 / 125 / 150, only those shorter than the green; "lay up to 100 = 164 from you"', () => {
    const yd = 0.9144;
    const l = geo.layupTargets(264 * yd, yd);
    assert.deepEqual(l.map((x) => x.leave), [50, 75, 100, 125, 150]);
    assert.deepEqual(l.map((x) => geo.shownDistance(x.fromM, 'yd')), ['214', '189', '164', '139', '114']);
    assert.deepEqual(geo.layupTargets(120 * yd, yd).map((x) => x.leave), [50, 75, 100]);
    assert.deepEqual(geo.layupTargets(100 * yd, yd).map((x) => x.leave), [50, 75], 'exactly 100 out: no lay up to 100');
    assert.deepEqual(geo.layupTargets(40 * yd, yd), []);
    assert.deepEqual(geo.layupTargets(null), []);
    // Meters: the same marks in meters.
    assert.deepEqual(geo.layupTargets(130, 1).map((x) => [x.leave, Math.round(x.fromM)]), [[50, 80], [75, 55], [100, 30], [125, 5]]);
});

test('gps-view: behind its switch (button and sheet removed when off), the app\'s own points only, says so with none', () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('hazards'\)/.test(v));
    // URGENT-064 #7: no Hazards button on the map any more; the sheet's markup stays (behind the same switch).
    assert.ok(!/gps-hz-btn/.test(v) && /class="gps-hzs gps-float gps-scroll-ok" data-feature="hazards"/.test(v));
    assert.ok(/if \(!hzSwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="hazards"\]'\)/.test(v));
    assert.ok(/'No hazard data for this hole\.'/.test(v));
    assert.ok(/G\.hazardRows\(o\.pt, hz, r && r\.mid\)/.test(v) && /hr\.osm\.hazards/.test(v), 'the hole record\'s hazard points');
    const fn = v.slice(v.indexOf('function fillHazards'), v.indexOf('function drawHoleAsk'));
    assert.ok(fn.length > 200 && !/fetch\(|\.ref\(|setItem\(/.test(fn), 'nothing fetched or stored');
});
