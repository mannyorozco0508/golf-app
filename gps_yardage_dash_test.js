// ============================================================================
// FRONT / CENTER (MIDDLE) / BACK: A MISSING NUMBER IS "—", NEVER 0, "ON" OR BLANK (012 review)
//
// One source for every layout (old, C, D): gps-view.js render() fills .gps-f / .gps-m / .gps-b
// from gps-geo.holeNumbers through gps-geo.shownDistance. With no green (no numbers), no target
// or no position, each reads "—". "ON" is FRONT only while the golfer stands ON the green
// (holeNumbers' onGreen), and 0 only for a golfer standing on the point measured to - both real
// readings, not missing data. (The 012 first-look screenshot showed CENTER 0 / F ON because its
// stand-in golfer stood on the green's centre; the check now stands ~150 yds out.)
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

test('shownDistance: no distance -> "—"', { skip }, () => {
    const G = require('./gps-geo.js');
    [null, undefined, NaN, -5, 'x'].forEach((m) => assert.strictEqual(G.shownDistance(m, 'yd'), '\u2014', String(m)));
    assert.strictEqual(G.shownDistance(137.16, 'yd'), '150');
});

test('holeNumbers with no position / no green: nothing to show, and not on the green', { skip }, () => {
    const G = require('./gps-geo.js');
    const r = { tee: { lat: 33.456185, lng: -79.149095 }, mid: { lat: 33.456015, lng: -79.152924 } };
    const none = G.holeNumbers(null, r);
    assert.ok(!none || (!none.onGreen && none.frontM == null && none.backM == null), JSON.stringify(none));
});

test('render(): every FRONT / CENTER / BACK line falls back to "—"; "ON" only for onGreen', { skip }, () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    const f = src.match(/txt\('\.gps-f', ([^\n]+)\);/), m = src.match(/txt\('\.gps-m', ([^\n]+)\);/), b = src.match(/txt\('\.gps-b', ([^\n]+)\);/);
    assert.ok(f && m && b, 'the three lines are there');
    [f, m, b].forEach((x) => assert.ok(/: '\u2014'\s*$|: '\\u2014'\s*$/.test(x[1]) && /d\(/.test(x[1]), 'falls back to "—" and formats through shownDistance: ' + x[1]));
    assert.ok(/nums\.onGreen \? 'ON'/.test(f[1]), 'ON only when standing on the green');
    assert.ok(!/'ON'/.test(m[1] + b[1]), 'never ON for CENTER / BACK');
    assert.ok(/var d = function \(m\) \{ return G\.shownDistance\(m, u\); \};/.test(src), 'd() is shownDistance');
});
