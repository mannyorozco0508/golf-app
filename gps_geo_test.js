// ============================================================================
// HARDPAN GPS - THE NUMBERS A GOLFER READS (gps-v1, 2026-10-06)
//
// gps-geo.js decides every yardage on the GPS screen. These tests hold it to
// known coordinate pairs, to hand-built greens whose front/back are known by
// construction, and to the six real courses' OpenStreetMap data.
//
// WHAT THIS FILE CANNOT PROVE: that the screen shows these numbers, that the
// watch stops, or that nothing leaves the phone. tools/gps-check.js proves
// those in headless Chrome, through the scorecard a golfer opens.
//
// BASELINE, all 20 tests: on the pre-build tree (offline-durable-queue 7a6c3f5)
// gps-geo.js does not exist and the file cannot load - nothing ran, so that
// state proves nothing per assertion. On the finished gps-v1 build: 20 pass /
// 0 fail. Controls, each run against the finished file and restored by sha:
// front taken from the far crossing instead of the near one -> 'straight on',
// 'diagonal' and 'L-shaped' go red; undo dropping prev -> 'makePin / undoPin'
// and 'undo of an organizer fix on an OSM hole' go red.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// HardPan trees only: a Consumer tree (GPS_ENABLED=0) has no gps-geo.js, and
// every test below SKIPS with that reason rather than failing to load.
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);
// A point `m` metres north / east of `p` on the same sphere gps-geo uses.
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];

test('haversine: published pair - Nashville BNA to Los Angeles LAX', () => {
    // Rosetta Code's haversine reference: 2887.2599506 km on R = 6372.8 km.
    // Rescaled to gps-geo's IUGG mean radius (6371.0088 km).
    const km = geo.haversineMeters([36.12, -86.67], [33.94, -118.40]) / 1000;
    close(km, 2887.2599506 * 6371.0088 / 6372.8, 0.001, 'BNA-LAX km');
});

test('haversine: one degree of latitude and of equatorial longitude', () => {
    const oneDeg = Math.PI * geo.EARTH_RADIUS_M / 180;          // 111,194.93 m
    close(geo.haversineMeters([0, 0], [1, 0]), oneDeg, 0.01);
    close(geo.haversineMeters([0, 0], [0, 1]), oneDeg, 0.01);
    close(geo.haversineYards([0, 0], [1, 0]), oneDeg / 0.9144, 0.01, 'yards');
    close(oneDeg / 0.9144, 121604.42, 0.01, 'sanity: 1 degree is ~121,605 yards');
});

test('haversine: golf scale - 150 yards up a fairway at Pawleys Island latitude', () => {
    const tee = [33.4943, -79.1197];
    const ball = north(tee, 150 * 0.9144);
    close(geo.haversineYards(tee, ball), 150, 0.01);
    // East-west at 33.5 N, where a degree of longitude is ~17% shorter.
    close(geo.haversineYards(tee, east(tee, 300 * 0.9144)), 300, 0.02);
    // Symmetric, and zero on itself.
    assert.strictEqual(geo.haversineMeters(tee, ball), geo.haversineMeters(ball, tee));
    assert.strictEqual(geo.haversineMeters(tee, tee), 0);
});

test('haversine: agrees with the WGS84 ellipsoid within 0.5% on a golf hole', () => {
    // Independent check: Vincenty on WGS84 (the GPS datum), written here so the
    // test does not share any arithmetic with the code under test.
    function vincenty(a, b) {
        const A = 6378137, F = 1 / 298.257223563, B = A * (1 - F);
        const r = (d) => d * Math.PI / 180;
        const L = r(b[1] - a[1]);
        const U1 = Math.atan((1 - F) * Math.tan(r(a[0]))), U2 = Math.atan((1 - F) * Math.tan(r(b[0])));
        const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
        let lam = L, prev, sS, cS, sig, cA2, c2m;
        do {
            const sl = Math.sin(lam), cl = Math.cos(lam);
            sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
            cS = sU1 * sU2 + cU1 * cU2 * cl;
            sig = Math.atan2(sS, cS);
            const sA = cU1 * cU2 * sl / sS;
            cA2 = 1 - sA * sA;
            c2m = cS - 2 * sU1 * sU2 / cA2;
            const C = F / 16 * cA2 * (4 + F * (4 - 3 * cA2));
            prev = lam;
            lam = L + (1 - C) * F * sA * (sig + C * sS * (c2m + C * cS * (-1 + 2 * c2m * c2m)));
        } while (Math.abs(lam - prev) > 1e-12);
        const u2 = cA2 * (A * A - B * B) / (B * B);
        const AA = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
        const BB = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
        const dS = BB * sS * (c2m + BB / 4 * (cS * (-1 + 2 * c2m * c2m) - BB / 6 * c2m * (-3 + 4 * sS * sS) * (-3 + 4 * c2m * c2m)));
        return B * AA * (sig - dS);
    }
    const pairs = [
        [[33.4943, -79.1197], [33.4975, -79.1171]],   // ~420 yds diagonal, Pawleys Island
        [[45.8167, -122.6417], [45.8139, -122.6380]], // ~430 yds, Ridgefield WA
        [[33.7000, -78.8900], [33.7013, -78.8900]],   // ~158 yds due north
    ];
    pairs.forEach(([a, b]) => {
        const h = geo.haversineMeters(a, b), v = vincenty(a, b);
        assert.ok(Math.abs(h - v) / v < 0.005, `haversine ${h.toFixed(2)} m vs WGS84 ${v.toFixed(2)} m`);
    });
});

test('distanceIn: whole yards by default, meters on request', () => {
    assert.strictEqual(geo.distanceIn(137.16, 'yd'), 150);
    assert.strictEqual(geo.distanceIn(137.16, 'm'), 137);
    assert.strictEqual(geo.distanceIn(null, 'yd'), null);
    assert.strictEqual(geo.distanceIn(NaN, 'yd'), null);
});

test('accuracyLabel: honest, rounded UP, and "Weak GPS" past 15 yards', () => {
    assert.deepStrictEqual(geo.accuracyLabel(4.6, 'yd'), { text: '±6 yds', weak: false });   // 5.03 yds -> 6, never 5
    assert.deepStrictEqual(geo.accuracyLabel(13.7, 'yd'), { text: '±15 yds', weak: false }); // 14.98 yds
    assert.deepStrictEqual(geo.accuracyLabel(13.8, 'yd'), { text: 'Weak GPS ±16 yds', weak: true }); // 15.09 yds
    assert.deepStrictEqual(geo.accuracyLabel(30, 'm'), { text: 'Weak GPS ±30 m', weak: true });
    assert.strictEqual(geo.accuracyLabel(undefined, 'yd').weak, true);
});

// A square green 30 m on a side, centred on C, edges north/south/east/west.
const C = [33.5, -79.1];
const SQUARE = !ON ? [] : [north(east(C, -15), -15), north(east(C, 15), -15), north(east(C, 15), 15), north(east(C, -15), 15)];

test('front / middle / back: straight on, known by construction', () => {
    const me = north(C, -150);                               // 150 m due south of the centre
    const g = geo.greenNumbers(me, SQUARE);
    close(g.middleM, 150, 0.05, 'middle');
    close(g.frontM, 135, 0.05, 'front = near edge');
    close(g.backM, 165, 0.05, 'back = far edge');
    assert.strictEqual(g.onGreen, false);
    close(geo.haversineMeters(g.middle, C), 0, 0.05, 'centroid is the centre');
});

test('front / back move with the golfer: from the side the same green is a different depth', () => {
    const fromSouth = geo.greenNumbers(north(C, -150), SQUARE);
    // From the south-west corner line the ray crosses the square on its diagonal:
    // depth 30 * sqrt(2) = 42.43 m instead of 30.
    const sw = north(east(C, -106.066), -106.066);           // 150 m away, on the diagonal
    const g = geo.greenNumbers(sw, SQUARE);
    close(g.middleM, 150, 0.1);
    close(g.backM - g.frontM, 30 * Math.SQRT2, 0.1, 'diagonal depth');
    close(fromSouth.backM - fromSouth.frontM, 30, 0.05, 'straight depth');
});

test('front / back: standing on the green has no front, and says so', () => {
    const g = geo.greenNumbers(north(C, -5), SQUARE);
    assert.strictEqual(g.onGreen, true);
    assert.strictEqual(g.front, null);
    assert.strictEqual(g.frontM, null);
    close(g.backM, 20, 0.05, 'back from 5 m short of centre');
});

test('front / back: an L-shaped (concave) green still gives nearest and farthest edge', () => {
    // L: 40 x 40 with the north-east 20 x 20 quarter missing. From due south,
    // the ray through the centroid enters at the south edge and leaves at the
    // farthest crossing, whatever happens in between.
    const sw0 = north(east(C, -20), -20);
    const P = (dx, dy) => north(east(sw0, dx), dy);
    const L = [P(0, 0), P(40, 0), P(40, 20), P(20, 20), P(20, 40), P(0, 40)];
    const mid = geo.polygonCentroid(L);
    const me = north(mid, -120);
    const g = geo.greenNumbers(me, L);
    assert.ok(g.frontM < g.middleM && g.middleM < g.backM, 'front < middle < back');
    // Area-weighted centroid: (1600 * 20 - 400 * 30) / 1200 = 16.667 m from the
    // south and west edges. Due south of it, the ray enters at the south edge,
    // so front = 120 - 16.667.
    close(g.frontM, 120 - 50 / 3, 0.05, 'front');
});

test('makePin / undoPin: a fix keeps the value it replaced, one level deep', () => {
    const a = geo.makePin(C, null, null, null, 1000, 'tap');
    assert.deepStrictEqual(a.mid, { lat: 33.5, lng: -79.1 });
    assert.strictEqual(a.prev, undefined);
    assert.strictEqual(geo.undoPin(a, 2000), null, 'nothing to undo on a first pin');
    const b = geo.makePin(north(C, 30), north(C, 20), north(C, 40), a, 3000, 'organizer');
    assert.deepStrictEqual(b.prev.mid, a.mid);
    assert.strictEqual(b.prev.prev, undefined, 'the record cannot grow without bound');
    const c = geo.makePin(north(C, 60), null, null, b, 4000, 'organizer');
    assert.strictEqual(c.prev.prev, undefined);
    assert.deepStrictEqual(c.prev.front, b.front, 'front/back come back with the undo');
    const u = geo.undoPin(c, 5000);
    assert.deepStrictEqual(u.mid, b.mid);
    assert.deepStrictEqual(u.back, b.back);
    assert.strictEqual(u.at, 5000, 'stamped now, so it beats the bad fix everywhere it was copied');
    assert.strictEqual(u.by, 'undo');
});

test('resolveHole: pin beats OSM, newest pin wins, and edges follow the polygon only when the pin is on it', () => {
    const osm = { osm: { tee: north(C, -350), green: SQUARE, mid: C } };
    const onGreen = geo.makePin(north(C, 5), null, null, null, 10, 'tap');
    const offGreen = geo.makePin(north(C, 200), null, null, null, 20, 'organizer');
    let r = geo.resolveHole(osm, []);
    assert.strictEqual(r.source, 'osm');
    assert.strictEqual(r.useGreenForEdges, true);
    r = geo.resolveHole(osm, [onGreen, offGreen]);
    assert.strictEqual(r.pin, offGreen, 'newest wins');
    assert.strictEqual(r.useGreenForEdges, false, 'moved to another green: polygon edges would lie');
    r = geo.resolveHole(osm, [offGreen, onGreen].map((p, i) => Object.assign({}, p, { at: i ? 99 : 1 })));
    assert.strictEqual(r.useGreenForEdges, true);
    const nums = geo.holeNumbers(north(C, -150), r);
    close(nums.middleM, 155, 0.05, 'middle is the pin, not the centroid');
    assert.ok(nums.frontM > 130 && nums.backM > nums.middleM, 'front/back still from the polygon');
    // No OSM, tapped front/back: static points.
    const tapped = geo.makePin(C, north(C, -12), north(C, 14), null, 5, 'tap');
    const t = geo.holeNumbers(north(C, -100), geo.resolveHole(null, [tapped]));
    close(t.frontM, 88, 0.05); close(t.middleM, 100, 0.05); close(t.backM, 114, 0.05);
    // Nothing at all.
    assert.strictEqual(geo.resolveHole(null, []).source, 'none');
    assert.strictEqual(geo.holeNumbers(C, geo.resolveHole(null, [])), null);
});

test('undo of an organizer fix on an OSM hole returns to the OSM green, edges and all', () => {
    const osm = { osm: { tee: north(C, -350), green: SQUARE, mid: C } };
    const before = geo.resolveHole(osm, []);
    const fix = geo.makePin(north(C, 200), null, null, { mid: before.mid, at: 0 }, 50, 'organizer');
    const undone = geo.undoPin(fix, 60);
    const r = geo.resolveHole(osm, [fix, undone]);
    assert.strictEqual(r.useGreenForEdges, true);
    close(geo.haversineMeters(r.mid, C), 0, 0.05);
});

test('courseGpsKey: preset key, Thistle pairings, typed names, nothing', () => {
    assert.strictEqual(geo.courseGpsKey('caledonia', 'Caledonia Golf & Fish Club', false), 'caledonia');
    assert.strictEqual(geo.courseGpsKey('thistle_27', 'Thistle Golf Club (Cameron / Stewart)', true), 'thistle_27_cameron_stewart');
    assert.strictEqual(geo.courseGpsKey('thistle_27', 'Thistle Golf Club (MacKay Only)', true), 'thistle_27_mackay');
    assert.strictEqual(geo.courseGpsKey('', "Joe's Muni & Range"), 'name_joe_s_muni_and_range');
    assert.strictEqual(geo.courseGpsKey(null, ''), null);
    assert.ok(/^[a-z0-9_]+$/.test(geo.courseGpsKey('x', 'A.B$C#D[E]F/G', true)), 'Firebase-safe');
});

// ---- REAL COURSES ----------------------------------------------------------
const table = ON ? require('./gps-courses.js') : null;
const importer = ON ? require('./tools/gps-import-osm.js') : null;

test('gps-courses.js is exactly what the import builds from gps-osm/ (no hand edits, no drift)', () => {
    const { records } = importer.build(path.join(__dirname, 'gps-osm'));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(records)), JSON.parse(JSON.stringify(table)));
});

test('what ships per course, and what is marked "verify on course" (decisions 2026-10-07)', () => {
    const n = (k) => Object.keys((geo.osmCourse(table, k) || { holes: {} }).holes).length;
    const v = (k) => Object.keys((geo.osmCourse(table, k) || {}).verify || {}).sort((a, b) => a - b).join(',');
    assert.strictEqual(n('caledonia'), 18); assert.strictEqual(v('caledonia'), '');
    assert.strictEqual(n('trueblue'), 18, 'True Blue #10 ships: its green matched cleanly');
    assert.strictEqual(v('trueblue'), '10', '#10 is marked verify (OSM says par 4; the card says 5)');
    assert.ok(/our card says 5/.test(table.trueblue.verify['10']));
    // Pine Lakes: OSM's nine are the 2026 card's BACK nine - holes 10-18, all marked.
    assert.deepStrictEqual(Object.keys(table.pinelakes.holes).map(Number).sort((a, b) => a - b), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
    assert.strictEqual(v('pinelakes'), '10,11,12,13,14,15,16,17,18');
    assert.ok(/numbers this hole 1; on the 2026 card it is hole 10/.test(table.pinelakes.verify['10']));
    assert.strictEqual(n('pinehills'), 18); assert.strictEqual(v('pinehills'), '');
    assert.strictEqual(n('swwa_trimountain'), 18); assert.strictEqual(v('swwa_trimountain'), '');
    // Stewart greens rebuilt Jun-Sep 2026: the Stewart nine is marked, wherever it is played.
    assert.strictEqual(v('thistle_27_stewart'), '1,2,3,4,5,6,7,8,9');
    assert.strictEqual(v('thistle_27_cameron'), ''); assert.strictEqual(v('thistle_27_mackay'), '');
    assert.strictEqual(v('thistle_27_cameron_stewart'), '10,11,12,13,14,15,16,17,18', 'Stewart as the back nine: 10-18');
    assert.strictEqual(v('thistle_27_stewart_mackay'), '1,2,3,4,5,6,7,8,9', 'Stewart as the front nine: 1-9');
    assert.strictEqual(v('thistle_27_mackay_cameron'), '', 'no Stewart, no note');
    ['cameron', 'stewart', 'mackay'].forEach((a) => assert.strictEqual(n('thistle_27_' + a), 9, a));
    assert.strictEqual(n('thistle_27_cameron_stewart'), 18);
    assert.strictEqual(n('thistle_27_mackay_cameron'), 18);
});

test('Thistle pairing: back nine holes 1-9 become 10-18, from the right nine', () => {
    const pair = geo.osmCourse(table, 'thistle_27_stewart_mackay');
    assert.deepStrictEqual(pair.holes['10'], table.thistle_27_mackay.holes['1']);
    assert.deepStrictEqual(pair.holes['9'], table.thistle_27_stewart.holes['9']);
});

test('Thistle hole names parse, including the odd ones', () => {
    const cam = importer.thistleNumber('cameron'), st = importer.thistleNumber('stewart');
    assert.strictEqual(cam({ name: 'Cameron -   Hole 9 - 498 yards par 5' }), 9);
    assert.strictEqual(st({ name: 'Stewart - 7- 422 yards par 4' }), 7);
    assert.strictEqual(st({ name: 'Stewart -   Hole 4- 502 yards par 5' }), 4);
    assert.strictEqual(cam({ name: 'Stewart - Hole 1 - 344 yards par 4' }), null, 'another nine');
});

test('every shipped hole is plausible: its length fits its par, and the hole end is on its green', () => {
    const vm = require('vm');
    const sb = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'course-data.js'), 'utf8') + ';this.p=coursePresets;this.l=nineHoleLoops;', sb);
    const cards = {
        caledonia: sb.p.caledonia.data.map((h) => h.par), trueblue: sb.p.trueblue.data.map((h) => h.par),
        pinehills: sb.p.pinehills.data.map((h) => h.par), swwa_trimountain: sb.p.swwa_trimountain.data.map((h) => h.par),
        thistle_27_cameron: sb.l.thistle_27.cameron.data.map((h) => h.par), thistle_27_stewart: sb.l.thistle_27.stewart.data.map((h) => h.par),
        thistle_27_mackay: sb.l.thistle_27.mackay.data.map((h) => h.par),
        // Pine Lakes' card matches the official 2026 card (par 70) exactly - checked
        // in the next test - so its back-nine pars are the yardstick for 10-18.
        pinelakes: sb.p.pinelakes.data.map((h) => h.par),
    };
    let checked = 0;
    Object.keys(cards).forEach((k) => {
        const holes = table[k].holes;
        Object.keys(holes).forEach((n) => {
            const o = holes[n].osm;
            const par = cards[k][Number(n) - 1];
            // Along the drawn line, because a dogleg is shorter as the crow flies:
            // True Blue #4 (par 5) is 560 yds on its line and 359 straight.
            const yds = o.lineM / 0.9144;
            const [lo, hi] = par === 3 ? [70, 260] : par === 4 ? [230, 500] : [400, 640];
            assert.ok(yds >= lo && yds <= hi, `${k} #${n} par ${par}: ${yds.toFixed(0)} yds along the hole line`);
            assert.ok(geo.haversineMeters(o.tee, o.end) <= o.lineM + 1, `${k} #${n}: straight never exceeds the line`);
            assert.ok(geo.pointInRing(o.end, o.green), `${k} #${n}: hole line ends on its green`);
            assert.ok(o.green.length >= 3 && o.green.length <= 48, `${k} #${n}: compact polygon`);
            checked++;
        });
    });
    assert.strictEqual(checked, 18 + 18 + 18 + 18 + 27 + 9);
});

test('our Pine Lakes card IS the official 2026 card (par 70) - and True Blue #10 is par 5', () => {
    const vm = require('vm');
    const sb = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'course-data.js'), 'utf8') + ';this.p=coursePresets;', sb);
    // Official 2026 Pine Lakes card, as given by Manny on 2026-10-07.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sb.p.pinelakes.data.map((h) => h.par))), [4, 3, 4, 4, 5, 4, 4, 3, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4]);
    assert.strictEqual(sb.p.trueblue.data[9].par, 5);
});

test('par never ships from OSM: no hole record carries a par', () => {
    assert.ok(!/"par"/.test(JSON.stringify(table)), 'an OSM par is in gps-courses.js');
});

test('licence boundary: gps-courses.js carries the ODbL notice and holds only OSM-derived fields', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-courses.js'), 'utf8');
    assert.ok(/Open Database License \(ODbL\)/.test(src));
    assert.ok(/© OpenStreetMap contributors/.test(src));
    Object.keys(table).forEach((k) => {
        const holes = (table[k] && table[k].holes) || {};
        Object.keys(holes).forEach((n) => assert.deepStrictEqual(Object.keys(holes[n]), ['osm'], `${k} #${n} has only osm`));
    });
});

// ---- OFFLINE IMAGERY TILES ---------------------------------------------------
test('tileXY: known tiles, including the one holding Caledonia hole 1\'s green', () => {
    // Fetched from USGS at 16/26299/18359 and looked at on 2026-10-06: the
    // fairway, the pond and the green complex are in it.
    const mid = table.caledonia.holes['1'].osm.mid;
    assert.deepStrictEqual(geo.tileXY(mid[0], mid[1], 16), [18359, 26299]);
    assert.deepStrictEqual(geo.tileXY(33.4943, -79.1197, 16), [18364, 26290]);
    // The four corners of the world at z1, and the antimeridian/equator split.
    assert.deepStrictEqual(geo.tileXY(80, -179, 1), [0, 0]);
    assert.deepStrictEqual(geo.tileXY(-80, 179, 1), [1, 1]);
    assert.deepStrictEqual(geo.tileXY(0.0001, 0.0001, 1), [1, 0]);
});

test('courseBounds: the course\'s own points, padded - and nothing without course data', () => {
    const rec = geo.osmCourse(table, 'caledonia');
    const b = geo.courseBounds(rec, [], 150);
    let s = 90, n = -90;
    Object.values(rec.holes).forEach((h) => [h.osm.tee, h.osm.end].concat(h.osm.green).forEach((p) => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); }));
    close(geo.haversineMeters([b.south, b.west], [s, b.west]), 150, 0.5, 'south pad');
    close(geo.haversineMeters([n, b.east], [b.north, b.east]), 150, 0.5, 'north pad');
    assert.strictEqual(geo.courseBounds(null, [], 150), null, 'an unmapped course with no pins has no area');
    const pinOnly = geo.courseBounds(null, [{ lat: 33.7, lng: -78.9 }], 100);
    assert.ok(pinOnly && pinOnly.south < 33.7 && pinOnly.north > 33.7, 'a golfer-set green gives an area');
});

test('tilesFor: a course is a few dozen tiles at z13-16, and a runaway area is REFUSED, not truncated', () => {
    const counts = {};
    ['caledonia', 'trueblue', 'pinehills', 'swwa_trimountain', 'thistle_27_cameron_stewart'].forEach((k) => {
        const t = geo.tilesFor(geo.courseBounds(geo.osmCourse(table, k), [], 150), 13, 16, 400);
        counts[k] = t.length;
        assert.ok(t.length >= 4 && t.length <= 60, k + ': ' + t.length + ' tiles');
        assert.ok(t.every((x) => x.z >= 13 && x.z <= 16));
    });
    // Measured 2026-10-06: 24 / 32 / 30 / 15 / 36 tiles, ~25 KB each - under 1 MB a course.
    assert.deepStrictEqual(counts, { caledonia: 24, trueblue: 32, pinehills: 30, swwa_trimountain: 15, thistle_27_cameron_stewart: 36 });
    const huge = { south: 30, west: -90, north: 40, east: -70 };
    assert.strictEqual(geo.tilesFor(huge, 13, 16, 400), null);
    // Every hole's tee and green middle is inside its course's pre-cache, at every zoom.
    ['caledonia', 'trueblue', 'pinehills', 'swwa_trimountain'].forEach((k) => {
        const rec = geo.osmCourse(table, k);
        const t = geo.tilesFor(geo.courseBounds(rec, [], 150), 13, 16, 400);
        const has = (p, z) => { const xy = geo.tileXY(p[0], p[1], z); return t.some((q) => q.z === z && q.x === xy[0] && q.y === xy[1]); };
        Object.keys(rec.holes).forEach((n) => [13, 14, 15, 16].forEach((z) => {
            assert.ok(has(rec.holes[n].osm.tee, z) && has(rec.holes[n].osm.mid, z), k + ' #' + n + ' z' + z + ' not pre-cached');
        }));
    });
});

test('midpoint: halfway between two points, null without both', () => {
    assert.deepStrictEqual(geo.midpoint([33, -79], [34, -78]), [33.5, -78.5]);
    assert.deepStrictEqual(geo.midpoint({ lat: 1, lng: 2 }, [3, 4]), [2, 3]);
    assert.strictEqual(geo.midpoint(null, [1, 1]), null);
});
