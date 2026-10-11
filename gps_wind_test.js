// ============================================================================
// THE WIND - KNOWN CASES (2026-10-11, Manny at Legacy: "about 90 degrees off").
// Compass bearings (0 = north, clockwise), wind FROM (as weather services report),
// the arrow on a map turned by its bearing, headwind / crosswind for the shot,
// plays-like. And the bug: the arrow was turned by the LAST HOLE's camera after a
// hole with no tee jumped the map north-up.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// HardPan only: a Consumer tree has no gps-geo.js / gps-view.js - every test here skips.
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js')) && fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const skip = ON ? false : 'Consumer tree: no GPS files';
const G = ON ? require('./gps-geo.js') : null;
const tee = [33.45, -111.90];
const N = [33.4536, -111.90], E = [33.45, -111.8957];   // greens due north / due east of the tee (~400 m)

test('hole bearings: lat, lng in that order - due north is 0, due east is 90', { skip }, () => {
    assert.equal(Math.round(G.bearingDeg(tee, N)), 0);
    assert.equal(Math.round(G.bearingDeg(tee, E)), 90);
    assert.equal(Math.round(G.bearingDeg(N, tee)), 180);
});

test('a weather "W" wind comes FROM the west (270) and blows TO the east (90)', { skip }, () => {
    const w = G.parseNwsWind({ windSpeed: '25 mph', windDirection: 'W' });
    assert.deepEqual([w.fromDeg, w.toDeg, w.mph], [270, 90, 25]);
    const o = G.parseNwsObservation({ windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 40.2 }, windDirection: { value: 90 } });
    assert.deepEqual([o.fromDeg, o.toDeg, o.mph], [90, 270, 25], 'observation degrees are FROM too');
});

test('worked examples: headwind, tailwind, crosswind direction', { skip }, () => {
    // Hole due NORTH, wind FROM the north, 20 mph: straight in your face.
    assert.deepEqual(G.windRelative(0, 0, 20), { head: 20, cross: 0, kind: 'headwind' });
    // Hole due NORTH, wind FROM the south: straight behind you.
    assert.deepEqual(G.windRelative(180, 0, 20), { head: -20, cross: 0, kind: 'tailwind' });
    // Hole due NORTH, wind FROM the EAST: east is on your RIGHT, so it blows RIGHT TO LEFT.
    assert.deepEqual(G.windRelative(90, 0, 20), { head: 0, cross: -20, kind: 'right-to-left' });
    // Hole due NORTH, wind FROM the WEST: blows LEFT TO RIGHT.
    assert.deepEqual(G.windRelative(270, 0, 20), { head: 0, cross: 20, kind: 'left-to-right' });
    // Hole due EAST, wind FROM the NORTH: north is on your LEFT -> LEFT TO RIGHT.
    assert.deepEqual(G.windRelative(0, 90, 20), { head: 0, cross: 20, kind: 'left-to-right' });
    // Hole due EAST, wind FROM the WEST, 25 mph: a tailwind.
    assert.deepEqual(G.windRelative(270, 90, 25).kind, 'tailwind');
});

test('plays-like: into the wind plays LONGER, downwind SHORTER, a pure crosswind no different', { skip }, () => {
    assert.equal(G.playsLike({ yards: 150, windMph: 20, windFromDeg: 0, shotBearingDeg: 0 }).yards, 180, '150 into a 20 mph headwind: +1% per mph');
    assert.equal(G.playsLike({ yards: 150, windMph: 20, windFromDeg: 180, shotBearingDeg: 0 }).yards, 135, 'downwind: -0.5% per mph');
    assert.equal(G.playsLike({ yards: 150, windMph: 20, windFromDeg: 90, shotBearingDeg: 0 }).yards, 150, 'a pure crosswind changes no distance');
    assert.equal(G.playsLike({ yards: 150, windMph: 25, windFromDeg: 270, shotBearingDeg: 90 }).yards, 131, 'Legacy-like: hole east, 25 mph from the west');
});

test('the arrow on screen: hole-up map (bearing = the hole) and a north-up map', { skip }, () => {
    // Hole-up, hole due NORTH (map bearing 0), wind FROM north (blows TO 180): arrow points DOWN at you.
    assert.equal(G.windArrowRot(180, 0), 180);
    // Hole-up, hole due EAST (map bearing 90), wind FROM the WEST (TO 90): arrow points UP the hole (tailwind).
    assert.equal(G.windArrowRot(90, 90), 0);
    // Hole-up, hole due EAST, wind FROM the NORTH (TO 180): arrow points RIGHT (left-to-right).
    assert.equal(G.windArrowRot(180, 90), 90);
    // THE BUG: map really NORTH-UP (bearing 0) but the arrow was turned by the last hole's
    // camera (90): wind FROM north showed as 90 (right) instead of 180 (down) - 90 degrees off.
    assert.notEqual(G.windArrowRot(180, 90), G.windArrowRot(180, 0));
    assert.equal(G.windArrowRot(180, 0) - G.windArrowRot(180, 90), 90);
});

test('the GPS screen turns the arrow by the map\'s REAL bearing, never a remembered hole camera; north-up is labelled', { skip }, () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    const sync = v.slice(v.indexOf('function syncWind()'), v.indexOf('function syncWind()') + 4000);
    assert.ok(/var bearing = S\.map && typeof S\.map\.getBearing === 'function' \? S\.map\.getBearing\(\) : \(S\.camera \? S\.camera\.bearing : 0\);\s*\n\s*var rot = G\.windArrowRot\(w\.toDeg, bearing\);/.test(sync), 'the map is the truth');
    assert.ok(/gps-wind-northup/.test(sync) && /map north up/.test(sync), 'north-up said on the box and to VoiceOver');
    assert.ok(/function holeBearing\(\)[\s\S]{0,300}S\.map\.getBearing\(\) : \(S\.camera \? S\.camera\.bearing : 0\)/.test(v), 'the wind dial too');
    // The no-tee frame really is north-up - which is why the remembered camera was wrong.
    assert.ok(/S\.map\.jumpTo\(\{ center: ll\(fix\.pt\), zoom: 17, bearing: 0 \}\);/.test(v));
});
