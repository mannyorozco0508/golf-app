// ============================================================================
// THISTLE'S NINES, ANY PAIRING (gps-oct15, 2026-10-15). GolfAPI keeps the 27-hole club
// as two 18-hole pairings ("Cameron + Stewart", "MacKay + Cameron"); gps-geo splits them
// into three nines so every pairing - either order - and one nine alone has greens.
// A stand-in file proves the splitting anywhere; the real app file (golfapi/, the app
// build only, gitignored) is checked when it is on this machine.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
global.window = global;
// HardPan only: the Consumer tree (GPS off) has no gps-geo.js - nothing to check there.
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
if (ON) { require('./gps-geo.js'); require('./gps-courses.js'); }
const skip = ON ? false : 'GPS is off in this tree';
const G = window.HardPanGeo, T = window.HardPanGpsCourses;
const AT = [33.904046, -78.545205];
const NINES = ['Cameron', 'Stewart', 'MacKay'];
const PAIRS = [];
NINES.forEach((a) => NINES.forEach((b) => { if (a !== b) PAIRS.push([a, b]); }));
const match = (D, name, n) => G.golfapiMatch(D, G.courseGpsKey('thistle_27', name, true), name, AT, n, T);

// Stand-in: each hole's green centre encodes its nine and hole (lat 1 = Cameron, 2 = Stewart, 3 = MacKay).
const NUM = { Cameron: 1, Stewart: 2, MacKay: 3 };
function nineHoles(label, offset, into) { for (let i = 1; i <= 9; i++) into[i + offset] = { g: { c: [NUM[label], i], f: [NUM[label], i - 0.001], b: [NUM[label], i + 0.001] }, t: { b: [NUM[label] + 0.01, i] } }; return into; }
const STAND_IN = { v: 1, links: { thistle_27_cameron_stewart: 'CS', thistle_27_mackay_cameron: 'MC' }, courses: {
    MC: { id: 'MC', club: 'Thistle Golf Club', course: 'MacKay + Cameron', holes: 18, lat: AT[0], lng: AT[1], h: nineHoles('Cameron', 9, nineHoles('MacKay', 0, {})) },
    CS: { id: 'CS', club: 'Thistle Golf Club', course: 'Cameron + Stewart', holes: 18, lat: AT[0], lng: AT[1], h: nineHoles('Stewart', 9, nineHoles('Cameron', 0, {})) } } };

test('every pairing, either order: 18 holes, the front nine first, each hole its own nine\'s green', { skip }, () => {
    for (const [a, b] of PAIRS) {
        const m = match(STAND_IN, 'Thistle Golf Club (' + a + ' / ' + b + ')', 18);
        assert.ok(m, a + ' / ' + b + ': no match');
        const h = m.record.holes;
        assert.equal(Object.keys(h).length, 18, a + ' / ' + b);
        for (let i = 1; i <= 9; i++) {
            assert.deepEqual(h[i].osm.mid, [NUM[a], i], a + ' / ' + b + ' hole ' + i);
            assert.deepEqual(h[i + 9].osm.mid, [NUM[b], i], a + ' / ' + b + ' hole ' + (i + 9));
        }
    }
});
test('one nine ("Thistle Golf Club (MacKay Only)", as Round Setup names it): those 9 holes, never an 18-hole pairing', { skip }, () => {
    for (const n of NINES) {
        const m = match(STAND_IN, 'Thistle Golf Club (' + n + ' Only)', 9);
        assert.ok(m, n);
        assert.deepEqual(Object.keys(m.record.holes).sort((x, y) => x - y), ['1', '2', '3', '4', '5', '6', '7', '8', '9'], n);
        assert.deepEqual(m.record.holes[1].osm.mid, [NUM[n], 1], n);
    }
});
test('the two linked pairings still use their link', { skip }, () => {
    assert.match(match(STAND_IN, 'Thistle Golf Club (Cameron / Stewart)', 18).how, /^linked/);
    assert.match(match(STAND_IN, 'Thistle Golf Club (MacKay / Cameron)', 18).how, /^linked/);
});
test('THE REAL APP FILE (when on this machine): all 6 pairings have a green with front and back on every hole', { skip }, (t) => {
    const f = path.join(__dirname, 'golfapi', 'gps-golfapi.js');
    if (!fs.existsSync(f)) { t.skip('golfapi/gps-golfapi.js is not on this machine (the app build only)'); return; }
    require(f);
    const D = window.HardPanGolfApi;
    for (const [a, b] of PAIRS) {
        const m = match(D, 'Thistle Golf Club (' + a + ' / ' + b + ')', 18);
        assert.ok(m, a + ' / ' + b + ': no GolfAPI match');
        for (let i = 1; i <= 18; i++) {
            const o = m.record.holes[i] && m.record.holes[i].osm;
            assert.ok(o && o.mid && o.green, a + ' / ' + b + ' hole ' + i + ': no green');
            const r = { mid: o.mid, green: G.decompactRing ? G.decompactRing(o.green) : o.green };
            assert.ok(r.green && r.green.length >= 3, a + ' / ' + b + ' hole ' + i + ': no front / back');
        }
    }
});
