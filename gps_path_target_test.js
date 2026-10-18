// ============================================================================
// HARDPAN GPS - THE DEFAULT TARGET ON THE HOLE'S PATH (009, switch pathTarget)
//
// gps-geo.pathTarget: with a bent path (gps-geo.holePath - the hole's drawn line,
// else the fairway's middle, else the bunkers either side; never the dragged
// target) the white target starts AT THE DOGLEG when its corner is in the landing
// zone, else the default shot along the path. A straight hole, no path, a par 3:
// exactly gps-geo.defaultTarget, as before. tools/gps-flyover-check.js shows it
// on the map (arm 6).
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
const YD = 0.9144, TEE = [33.6, -79.0];
const ring = (c, m) => [north(c, m), east(c, m), north(c, -m), east(c, -m)];
const offPath = (pt, pts) => geo.alongLine(pt, pts).d;
const withPath = (o, extra) => Object.assign({}, o, { path: geo.holePath(Object.assign({ tee: o.tee, mid: o.mid, line: o.line, fairway: o.fairway, hazards: o.hazards }, extra || {})) });

test('a dogleg with its corner in the landing zone: the target sits on the corner', () => {
    const corner = north(TEE, 240 * YD), green = east(corner, 150 * YD);
    const o = { par: 4, tee: TEE, mid: green, line: [TEE, corner, green], from: 'tee' };
    const t = geo.pathTarget(withPath(o));
    assert.ok(geo.haversineMeters(t, corner) < 0.5, 'at the corner: ' + geo.haversineMeters(t, corner));
    // The old rule walked 260 along the line: 20 yds past the corner, on the second leg.
    assert.ok(geo.haversineMeters(geo.defaultTarget(o), corner) > 15);
    // Corner too short (120 yds) or too long (300): 260 along the path, on it.
    [120, 300].forEach((yd) => {
        const c2 = north(TEE, yd * YD), g2 = east(c2, 200 * YD), o2 = { par: 5, tee: TEE, mid: g2, line: [TEE, c2, g2], from: 'tee' };
        const t2 = geo.pathTarget(withPath(o2));
        assert.ok(offPath(t2, [TEE, c2, g2]) < 0.5, yd + ': on the path');
        assert.ok(Math.abs(geo.lengthAlong([TEE, c2, g2], TEE) - geo.lengthAlong([TEE, c2, g2], t2) - 260 * YD) < 1, yd + ': 260 along it');
    });
});

test('no drawn bend (GolfAPI, a 2-point line): the fairway middle, else the bunkers either side, bend the default target onto the path', () => {
    const green = east(north(TEE, 260 * YD), 140 * YD), fwMid = east(north(TEE, 245 * YD), 45);
    const o = { par: 4, tee: TEE, mid: green, line: [TEE, green], fairway: [ring(fwMid, 30)], from: 'tee' };
    const p = geo.holePath({ tee: TEE, mid: green, line: o.line, fairway: o.fairway });
    assert.equal(p.src, 'fairway');
    const t = geo.pathTarget(Object.assign({}, o, { path: p }));
    assert.ok(geo.haversineMeters(t, p.pts[1]) < 1, 'at the fairway bend');
    assert.ok(offPath(t, [TEE, green]) > 20, 'not on the straight line: ' + offPath(t, [TEE, green]));
    // GolfAPI: no fairway, a left and a right fairway bunker.
    const hz = [{ type: 'fb', side: 'L', pt: east(north(TEE, 240 * YD), 15) }, { type: 'fb', side: 'R', pt: east(north(TEE, 245 * YD), 75) }];
    const o2 = { par: 4, tee: TEE, mid: green, line: [TEE, green], hazards: hz, from: 'tee' };
    const p2 = geo.holePath(o2);
    assert.equal(p2.src, 'hazards');
    const t2 = geo.pathTarget(Object.assign({}, o2, { path: p2 }));
    assert.ok(geo.haversineMeters(t2, geo.midpoint(hz[0].pt, hz[1].pt)) < 1, 'between the bunkers');
});

test('a straight hole, no path, a par 3, the golfer on the hole: unchanged from defaultTarget where there is no bend', () => {
    const green = north(TEE, 400 * YD);
    const cases = [
        { par: 4, tee: TEE, mid: green, line: [TEE, green], from: 'tee' },
        { par: 4, tee: TEE, mid: green, from: 'tee' },
        { par: 5, tee: TEE, mid: north(TEE, 520 * YD), line: [TEE, north(TEE, 260 * YD), north(TEE, 520 * YD)], from: 'tee' },   // a straight drawn line
        { par: 4, tee: TEE, mid: green, line: [TEE, green], fairway: [ring(north(TEE, 240 * YD), 25)], from: 'tee' },   // fairway on the line
        { par: 3, tee: TEE, mid: north(TEE, 170 * YD), line: [TEE, east(north(TEE, 90 * YD), 40), north(TEE, 170 * YD)], from: 'tee' },
        { par: 4, tee: TEE, mid: green, line: [TEE, green], from: 'me', pt: north(TEE, 60) }
    ];
    cases.forEach((o, i) => assert.deepStrictEqual(geo.pathTarget(withPath(o)), geo.defaultTarget(o), 'case ' + i));
    assert.deepStrictEqual(geo.pathTarget(Object.assign({ path: null }, cases[0])), geo.defaultTarget(cases[0]), 'no path at all');
    // The golfer on a dogleg: along the path from them (the corner rule is for the tee).
    const corner = north(TEE, 240 * YD), g = east(corner, 250 * YD), me = north(TEE, 60 * YD);
    const t = geo.pathTarget(withPath({ par: 4, tee: TEE, mid: g, line: [TEE, corner, g], from: 'me', pt: me }));
    assert.ok(offPath(t, [TEE, corner, g]) < 0.5, 'on the path');
    assert.ok(Math.abs(geo.lengthAlong([TEE, corner, g], me) - geo.lengthAlong([TEE, corner, g], t) - 260 * YD) < 1, '260 along it from the golfer');
});

test('gps-view: the default target asks pathTarget behind its own switch (features.pathTarget, shipped on); off = defaultTarget', () => {
    const v = read('gps-view.js');
    const pt = v.slice(v.indexOf('function placeTarget('), v.indexOf('function drawTargetLines('));
    assert.ok(/HardPanFeature\('pathTarget'\) !== false/.test(v));
    assert.ok(/pathTargetOn\(\) && r\.tee && G\.pathTarget\s*\? G\.pathTarget\(/.test(pt) && /: G\.defaultTarget\(opts\)/.test(pt));
    assert.ok(/G\.holePath\(\{ tee: r\.tee, mid: center, line: opts\.line, fairway: opts\.fairway, hazards: rec && rec\.hazards \}\)/.test(pt), 'never the dragged target');
    const sb = {}; sb.window = sb; require('vm').createContext(sb); require('vm').runInContext(read('gps-config.js'), sb);
    assert.strictEqual(sb.HARDPAN_GPS_CONFIG.features.pathTarget, true);
});
