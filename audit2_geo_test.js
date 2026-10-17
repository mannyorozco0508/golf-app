// ============================================================================
// COURSE MATCHING AND THE GPS NUMBERS, AFTER THE INDEPENDENT AUDIT (mailbox 002, 2026-10-16)
//   C1  a name alone made a bundle alias: "Pine Lakes Golf Club" (Jacksonville) got Myrtle greens.
//   C2  the GolfAPI name match needed no place, and a bare club name took one of its courses.
//   C6  "(Front 9)" / "(Back 9)" broke the match for a 9-hole round.
//   C9  the same nine twice (front and back) had no GPS.
//   C5 / plays-like clamp / Mark shot / stale fix live in gps-view (tools/audit-sim.js, audit2 part).
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no gps-geo.js' }, f);
const G = ON ? require('./gps-geo.js') : null;
const T = ON ? require('./gps-courses.js') : null;

function course(id, club, name, lat, lng, holes) {
    const h = {};
    for (let i = 1; i <= (holes || 18); i++) {
        const c = [lat + i * 0.001, lng], f = [c[0] - 0.0001, c[1]], b = [c[0] + 0.0001, c[1]];
        h[i] = { g: { f, c, b }, t: { b: [c[0] - 0.003, c[1]] } };
    }
    return { id, club, course: name, lat, lng, holes: holes || 18, h };
}
const JAX = [30.33, -81.66], MYRTLE_PL = [33.71, -78.88], MA = [41.91, -70.58], TALKING = [33.546, -111.864];

test('C2: no place, no name match; a far place, no match; at the course, a match', () => {
    const data = { courses: { PH: course('PH', 'Myrtlewood', 'PineHills', 33.75, -78.85) }, links: {} };
    assert.equal(G.golfapiMatch(data, 'gca_1', 'The Pinehills', null, 18), null, 'no place');
    assert.equal(G.golfapiMatch(data, 'gca_1', 'The Pinehills', MA, 18), null, 'Plymouth, MA is not Myrtle Beach');
    assert.ok(G.golfapiMatch(data, 'gca_1', 'Myrtlewood PineHills', [33.75, -78.85], 18), 'at the course: yes');
});
test('C2: a bare club name never becomes one of its courses', () => {
    const data = { courses: { P: course('P', 'Talking Stick Golf Club', 'South - Piipaash', TALKING[0], TALKING[1]) }, links: {} };
    assert.equal(G.golfapiMatch(data, 'gca_2', 'Talking Stick Golf Club', TALKING, 18), null, 'the club alone, even with only one course known');
    assert.ok(G.golfapiMatch(data, 'gca_2', 'Talking Stick Golf Club (Piipaash)', TALKING, 18), 'the course named: yes');
});
test('C1: the bundle by name only at its place; the known trip aliases still work', () => {
    assert.equal(G.bundleKeyFor(T, 'gca_pl', 'Pine Lakes Country Club', JAX), null, 'Jacksonville');
    assert.equal(G.bundleKeyFor(T, 'gca_pl', 'Pine Lakes Country Club'), null, 'no place');
    assert.equal(G.bundleKeyFor(T, 'thistle_cameron_stewart', 'Thistle Golf Club (Cameron / Stewart)'), 'thistle_27_cameron_stewart', 'the Myrtle trip key');
    void MYRTLE_PL;
});
test('C6: "(Front 9)" / "(Back 9)" do not break the match', () => {
    const data = { courses: { PW: course('PW', 'Prestwick Golf Course', 'Prestwick', 33.6431, -78.9615) }, links: {} };
    assert.ok(G.golfapiMatch(data, 'gca_3', 'Prestwick Country Club (Front 9)', [33.644, -78.962], 9), 'front 9');
    assert.ok(G.golfapiMatch(data, 'gca_3', 'Prestwick Country Club (Back 9)', [33.644, -78.962], 9), 'back 9');
    assert.equal(G.stripNineSuffix('X (Front 9)'), 'X');
});
test('C9: the same nine twice is a round with GPS', () => {
    const data = { courses: { MC: course('MC', 'Thistle Golf Club', 'MacKay + Cameron', 33.904, -78.545) }, links: {} };
    const m = G.golfapiMatch(data, 'thistle_27_mackay_mackay', 'Thistle Golf Club (MacKay / MacKay)', [33.904, -78.545], 18, T);
    assert.ok(m, 'MacKay twice has GPS');
    assert.equal(Object.keys(m.record.holes).length, 18);
    assert.deepEqual(m.record.holes['10'].osm.mid, m.record.holes['1'].osm.mid, 'hole 10 is MacKay 1 again');
});

test('C5: a hole with only its centre shows the centre (no front / back), not "No green mapped"', () => {
    const r = G.resolveHole({ osm: { mid: [33.5, -79.1], tee: [33.497, -79.1] } }, null);
    assert.deepEqual(r.mid, [33.5, -79.1]);
    assert.equal(r.front, null); assert.equal(r.back, null);
    const n = G.holeNumbers([33.497, -79.1], r);
    assert.ok(n.middleM > 300 && n.frontM == null && n.backM == null);
});
test('plays-like is clamped to 0.5x-1.6x of the real distance', () => {
    const hard = G.playsLike({ yards: 150, windMph: 400, windFromDeg: 0, shotBearingDeg: 180 });   // a silly tailwind
    const into = G.playsLike({ yards: 150, windMph: 400, windFromDeg: 0, shotBearingDeg: 0 });    // a silly headwind
    assert.ok(hard.exact >= 75 && into.exact <= 240, JSON.stringify([hard.exact, into.exact]));
});
test('C3 / C4 / C8 in the GPS screen: a fix older than 10 s is dropped (and on return from the lock screen); the accuracy line shows in Pro when weak or finding; Mark shot starts over on a new hole', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.match(v, /var FIX_STALE_MS = 10000/);
    assert.match(v, /function dropStaleFix\(\) \{ if \(fix && \(!fix\.at \|\| Date\.now\(\) - fix\.at > FIX_STALE_MS\)\)/);
    assert.match(v, /function gpsGoodEnough\(\) \{ dropStaleFix\(\);/, 'set-green by GPS refuses a stale fix');
    assert.match(v, /Back from the lock screen[^\n]*\n\s*if \(dropStaleFix\(\)\) render\(\);/);
    assert.match(v, /subEl\.classList\.toggle\('gps-sub-show', !!\(acc && acc\.weak && fix && !fromTee\)\)/);
    assert.match(v, /S\.measureFrom = null; S\.measureShot = null;/);
});
