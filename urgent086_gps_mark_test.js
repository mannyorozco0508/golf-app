// ============================================================================
// 086 (Manny, Oct 26) - THE GPS MARK: "✓ GPS" ONLY WHEN EVERY HOLE HAS A GREEN.
// A course with greens on some holes says "GPS · N of 18 holes" (or "of 9"); its other holes say
// "Tap the middle of the green" on the map. Pure parts here (gps-geo greensOf, golfapiRecord.of);
// the screens in urgent086_gps_partial_chrome_test.js.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('./gps-geo.js');

const AT = [33.2442, -111.6180];
const hole = (i, green) => ({ t: { b: [AT[0] + i * 0.0004, AT[1] + i * 0.0003] }, g: green === false ? {} : { c: [AT[0] + 0.002 + i * 0.0004, AT[1] + i * 0.0003], f: [AT[0] + 0.0019 + i * 0.0004, AT[1] + i * 0.0003], b: [AT[0] + 0.0021 + i * 0.0004, AT[1] + i * 0.0003] } });
const course = (n, greenUpTo, extra) => { const h = [null]; for (let i = 1; i <= n; i++) h[i] = hole(i, i <= greenUpTo); return Object.assign({ id: '1', club: 'Fixture', course: 'C', lat: AT[0], lng: AT[1], holes: n, h }, extra || {}); };

test('greensOf: every hole with a green = n of 18; some = n < of; none = 0', () => {
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(18, 18)]), 18, AT), { n: 18, of: 18 });
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(18, 9)]), 18, AT), { n: 9, of: 18 });
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(18, 0)]), 18, AT), { n: 0, of: 18 });
});

test('greensOf: data in the wrong place (no green within 2 km of the course) counts 0 - the holeOneNear rule', () => {
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(18, 18)]), 18, [AT[0] + 0.5, AT[1]]), { n: 0, of: 18 });
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(18, 18)]), 18, null), { n: 18, of: 18 }, 'no point known: counted');
});

test('greensOf: a 9-hole course and a missing hole 1 (greens on 2-18 is still partial, not none)', () => {
    assert.deepEqual(G.greensOf(G.golfapiRecord([course(9, 9)]), 9, AT), { n: 9, of: 9 });
    const r = G.golfapiRecord([course(18, 18)]); delete r.holes['1'];
    assert.deepEqual(G.greensOf(r, 18, AT), { n: 17, of: 18 });
});

test('golfapiRecord.of: the course\'s hole count (18, 9, a 27-hole pairing of two nines = 18)', () => {
    assert.equal(G.golfapiRecord([course(18, 18)]).of, 18);
    assert.equal(G.golfapiRecord([course(9, 9)]).of, 9);
    assert.equal(G.golfapiRecord([course(9, 9), course(9, 9)]).of, 18);
});

test('the screens use the one mark: NEAR YOU / results rows, the PLAYING card, the course head, online rows', () => {
    const sf = fs.readFileSync(path.join(__dirname, 'simple-flow.js'), 'utf8');
    assert.match(sf, /function gpsTag\(key, name, pt, ready\)/);
    assert.match(sf, /m\.n >= m\.of \? '\\u2713 GPS' : 'GPS \\u00b7 ' \+ m\.n \+ ' of ' \+ m\.of \+ ' holes'/);
    assert.equal((sf.match(/rowTag\(c\)/g) || []).length >= 4, true, 'both row shapes');
    assert.equal((sf.match(/webTag\(m\)/g) || []).length >= 5, true, 'online rows + the "which course" rows');
    assert.match(sf, /tag: gpsTag\(key, c \? c\.name : name/, 'the PLAYING card');
    assert.match(sf, /\(o\.n >= o\.of \? '✓ ' : ''\) \+ 'GPS from OpenStreetMap \('/, 'the OSM note: ✓ only when every hole is mapped');
    const fd = fs.readFileSync(path.join(__dirname, 'front-door.js'), 'utf8');
    assert.match(fd, /mark: courseGpsMark/);
});
