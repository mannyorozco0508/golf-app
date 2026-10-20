// ============================================================================
// URGENT-026 - THE TEE TARGET AND THE PREVIEW FOLLOW THE FAIRWAY (Manny 2026-10-20: Papago hole 1,
// par 5, "the line is STRAIGHT tee -> green, so the 305 target lands in the desert").
//
// Why: Papago was not in the OpenStreetMap bundle, and GolfAPI gives a tee and a green per hole
// only (no fairway / dogleg points), so the path fell back to the straight line and 023c put the
// driver on it. Now: Papago is bundled (OSM way 51990955: 18 hole lines, a fairway per hole), its
// GolfAPI round borrows the hole LINE and the FAIRWAY rings (gps-geo.osmPathLines / osmPathFairway),
// and gps-geo.teeShot puts the target on the path - min(driver, the corner / the fairway's end), in
// the fairway. A hole with NO path data keeps the straight line and the pre-023c default target.
// A line a golfer saves ("Save this line", gps-geo.savedLine) is used only where nothing else is.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const table = ON ? require('./gps-courses.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const YD = 0.9144;
const KEY = 'gapi_012141520636857668694';
const PARS = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 4, 5, 4, 3];
const H = (n) => table[KEY].holes[String(n)].osm;
const inFw = (pt, rings) => (rings || []).some((r) => geo.pointInRing(pt, r));

// A GolfAPI course like Papago's (a tee and a green per hole, nothing else): the tee 8 m off the
// OSM line's start, green F / C / B around its end - the round's key IS the bundle key.
function gaPapago() {
    const holes = {};
    for (let n = 1; n <= 18; n++) {
        const line = H(n).line, end = line[line.length - 1], b = geo.bearingDeg(line[0], end);
        holes[n] = { g: { f: dest(end, b, -12), c: end, b: dest(end, b, 12) }, t: { b: dest(line[0], 300, 8) } };
    }
    return { id: '012141520636857668694', club: 'Papago Golf Club', course: 'Papago', lat: H(1).tee[0], lng: H(1).tee[1], holes: 18, h: holes };
}
const ga = () => { const c = gaPapago(); return { c, d: { built: true, courses: { [c.id]: c }, links: {} }, rec: geo.golfapiRecord([c]) }; };

test('the cause: Papago is now in the OpenStreetMap bundle - 18 hole lines, fairways, our card\'s name', () => {
    assert.ok(table[KEY], 'bundled under the round\'s own key');
    assert.strictEqual(Object.keys(table[KEY].holes).length, 18);
    assert.strictEqual(table._names[KEY], 'Papago Golf Club (Papago)');
    assert.ok(H(1).line.length >= 3, 'hole 1 bends');
    assert.ok(Object.keys(table[KEY].holes).filter((n) => (H(n).fairway || []).length).length >= 17, 'a fairway on (nearly) every hole');
    Object.keys(table[KEY].holes).forEach((n) => assert.strictEqual(H(n).par, undefined, 'OSM par never shipped'));
});

test('the GolfAPI round borrows hole 1\'s LINE and FAIRWAY (same key, within 40 m)', () => {
    const { d, rec } = ga();
    const op = geo.osmPathLines(table, d, rec, KEY, 'Papago Golf Club (Papago)', null);
    assert.ok(op && op.lines['1'] && op.lines['1'].length >= 3, JSON.stringify(op && op.rejected));
    assert.ok(op.fairways['1'] && op.fairways['1'].length >= 1);
    // a straight hole (2-point line) still lends its fairway
    const straight = Object.keys(table[KEY].holes).find((n) => H(n).line.length === 2 && (H(n).fairway || []).length);
    assert.ok(straight && op.fairways[straight] && !op.lines[straight], 'hole ' + straight);
    // too far from GolfAPI's tee: no fairway
    assert.strictEqual(geo.osmPathFairway({ tee: dest(H(1).tee, 0, 200), mid: H(1).mid }, table[KEY].holes['1']), null);
});

test('Papago hole 1, a 305 driver: ON the path (not the straight line), at the corner, IN the fairway', () => {
    const { d, rec } = ga();
    const op = geo.osmPathLines(table, d, rec, KEY, '', null), hole = rec.holes['1'].osm;
    const ts = geo.teeShot({ par: 5, tee: hole.tee, mid: hole.mid, line: op.lines['1'], fairway: op.fairways['1'], driverM: 305 * YD });
    assert.strictEqual(ts.data, true);
    assert.strictEqual(ts.path.src, 'centerline');
    assert.ok(ts.drive && ts.drive.alongM <= 305 * YD + 1, 'never past the driver');
    assert.ok(inFw(ts.pt, op.fairways['1']), 'inside the fairway');
    const off = geo.alongLine(ts.pt, ts.path.pts).d, offStraight = geo.alongLine(ts.pt, [hole.tee, hole.mid]).d;
    assert.ok(off < 25, 'on the path: ' + off.toFixed(1) + ' m off it');
    assert.ok(offStraight > 25, 'not on the straight tee-green line: ' + offStraight.toFixed(1) + ' m off it');
    // the old way (023c on the straight line) put it OUTSIDE the fairway - the desert
    const old = geo.teeTarget({ par: 5, tee: hole.tee, mid: hole.mid, line: [hole.tee, hole.mid], driverM: 305 * YD });
    assert.strictEqual(inFw(old.pt, op.fairways['1']), false, 'the bug, reproduced');
});

test('every Papago par 4 / 5 with a fairway: the default tee target is inside it (230, 270, 305 drivers)', () => {
    const { d, rec } = ga();
    const op = geo.osmPathLines(table, d, rec, KEY, '', null);
    [230, 270, 305].forEach((yd) => {
        for (let n = 1; n <= 18; n++) {
            if (PARS[n - 1] === 3 || !op.fairways[n]) continue;
            const h = rec.holes[n].osm;
            const ts = geo.teeShot({ par: PARS[n - 1], tee: h.tee, mid: h.mid, line: op.lines[n] || null, fairway: op.fairways[n], driverM: yd * YD });
            assert.ok(inFw(ts.pt, op.fairways[n]), `hole ${n} at ${yd}: ${JSON.stringify(ts.pt)} (${ts.path && ts.path.src}, ${ts.drive && ts.drive.stop})`);
        }
    });
});

test('NO path data: the straight line and the pre-023c default (DEFAULT_SHOT_YD) - never the driver', () => {
    const tee = [33.4, -111.9], mid = dest(tee, 0, 500 * YD);
    const ts = geo.teeShot({ par: 5, tee, mid, driverM: 305 * YD });
    assert.strictEqual(ts.data, false);
    assert.strictEqual(ts.path.src, 'straight');
    assert.strictEqual(ts.drive, null);
    assert.ok(Math.abs(geo.haversineMeters(tee, ts.pt) / YD - geo.DEFAULT_SHOT_YD) < 2, 'at ' + (geo.haversineMeters(tee, ts.pt) / YD).toFixed(1));
    assert.ok(geo.alongLine(ts.pt, [tee, mid]).d < 1, 'on the straight line');
    // a straight 2-point line is not path data either
    assert.strictEqual(geo.teeShot({ par: 4, tee, mid, line: [tee, mid], driverM: 305 * YD }).data, false);
    // par 3: the green
    assert.deepStrictEqual(geo.teeShot({ par: 3, tee, mid, driverM: 305 * YD }).pt, mid);
    // with a fairway it IS path data, and the driver counts again
    const fw = [[dest(tee, 0, 200 * YD), dest(dest(tee, 0, 200 * YD), 90, 20), dest(dest(tee, 0, 320 * YD), 90, 20), dest(tee, 0, 320 * YD), dest(dest(tee, 0, 320 * YD), 270, 20), dest(dest(tee, 0, 200 * YD), 270, 20)]];
    const wf = geo.teeShot({ par: 5, tee, mid, fairway: fw, driverM: 290 * YD });
    assert.strictEqual(wf.data, true);
    assert.ok(Math.abs(geo.haversineMeters(tee, wf.pt) / YD - 290) < 3);
});

test('a SAVED line: 3-6 points, ends at this hole\'s tee (150 m) and green (40 m); cleared = none', () => {
    const tee = [33.4, -111.9], corner = dest(tee, 0, 250 * YD), mid = dest(corner, 60, 200 * YD);
    const rec = { pts: [tee, corner, mid], at: 1, ev: 'X' };
    assert.deepStrictEqual(geo.savedLine(rec, tee, mid), [tee, corner, mid]);
    // RTDB hands arrays back as objects sometimes
    assert.deepStrictEqual(geo.savedLine({ pts: { 0: { 0: tee[0], 1: tee[1] }, 1: corner, 2: mid } }, tee, mid), [tee, corner, mid]);
    assert.deepStrictEqual(geo.savedLine(rec, dest(tee, 0, 60), mid)[0], dest(tee, 0, 60), 'a forward tee: the line starts from it');
    assert.strictEqual(geo.savedLine(rec, dest(tee, 180, 300), mid), null, 'another hole\'s tee');
    assert.strictEqual(geo.savedLine(rec, tee, dest(mid, 0, 60)), null, 'a moved green');
    assert.strictEqual(geo.savedLine({ cleared: true, at: 1 }, tee, mid), null);
    assert.strictEqual(geo.savedLine({ pts: [tee, mid] }, tee, mid), null, 'two points');
    assert.strictEqual(geo.savedLine({ pts: [tee, corner, corner, corner, corner, corner, mid] }, tee, mid), null, 'seven');
    // the saved line shapes the target and the path (a dogleg)
    const ts = geo.teeShot({ par: 5, tee, mid, line: geo.savedLine(rec, tee, mid), driverM: 305 * YD });
    assert.strictEqual(ts.data, true);
    assert.strictEqual(ts.drive.stop, 'corner');
    assert.ok(geo.haversineMeters(ts.pt, corner) < 3);
});

test('the Preview flies the SAME path the target sits on', () => {
    const { d, rec } = ga();
    const op = geo.osmPathLines(table, d, rec, KEY, '', null), h = rec.holes['1'].osm;
    const ts = geo.teeShot({ par: 5, tee: h.tee, mid: h.mid, line: op.lines['1'], fairway: op.fairways['1'], driverM: 305 * YD });
    const fp = geo.holePath({ tee: h.tee, mid: h.mid, line: op.lines['1'], fairway: op.fairways['1'] });
    assert.deepStrictEqual(fp.pts, ts.path.pts);
    const plan = geo.flyoverPlan({ path: fp.pts, green: [], pins: [h.mid], fairway: op.fairways['1'], par: 5 });
    const mid = geo.flyoverCamera(plan, 0.45).center;
    assert.ok(geo.alongLine(mid, fp.pts).d < 5, 'mid-flight on the path');
});

test('the view: one shape for the target and the flyover; the caption hidden in flight; Save this line ships dark', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.match(v, /var sh = holeShape\(S\.hole, r, center\);/);
    assert.match(v, /G\.teeShot\(\{ par: S\.par, tee: r\.tee, mid: center, line: sh\.line, fairway: sh\.fairway/);
    assert.match(v, /function flyPath\(r, dragged\) \{\s*var sh = holeShape\(S\.hole, r, r\.mid\);/);
    assert.match(v, /flyMark\('flying'\);\s*\/\/ URGENT-026[^\n]*\n\s*if \(cap\) cap\.style\.display = 'none';/);
    assert.match(v, /if \(!out\.data && G\.savedLine\)/, 'a saved line only where there is no path data');
    assert.match(v, /f\.lineSave === true/);
    assert.match(fs.readFileSync(path.join(__dirname, 'gps-config.js'), 'utf8'), /lineSave: false/);
});
