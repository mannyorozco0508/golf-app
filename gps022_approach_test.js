// 022 PART 3 - THE APPROACH VIEW, THE GEOMETRY (gps-geo approachAxis / approachCarries / approachLine).
//   1  the axis is the golfer's line to the green, not the tee's;
//   2  carry / clear: hazards near the line, ahead, not past the green; far edge; nearest first;
//   3  off the line (35 m+), behind, or past the green: left out;
//   4  front / back from a golfer off the tee line are measured on HIS line (greenNumbers).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('./gps-geo.js');
const G = window.HardPanGeo;
const YD = 0.9144;
const tee = [33.4600, -111.9600];
const mid = G.destination(tee, 0, 366);
const me = G.destination(mid, 210, 160);   // 175 yds out, well right of the tee line

test('the approach axis is the golfer\'s line, not the tee\'s', () => {
    const ax = G.approachAxis(me, mid), teeAx = G.bearingDeg(tee, mid);
    assert.ok(Math.abs(ax - G.bearingDeg(me, mid)) < 0.01);
    assert.ok(Math.abs(((ax - teeAx + 540) % 360) - 180) > 20, 'different from the tee line');
    assert.equal(G.approachAxis(null, mid), null);
});

test('carry bunker / clear water near the line: far edge, nearest first, "carry bunker N · clear water N"', () => {
    const line = G.bearingDeg(me, mid);
    const hz = [
        { type: 'fb', side: 'L', pt: G.destination(me, line - 3, 120) }, { type: 'fb', side: 'L', pt: G.destination(me, line - 3, 130) },
        { type: 'w', side: 'R', pt: G.destination(me, line + 4, 140) },
        { type: 'gb', side: 'R', pt: G.destination(me, line + 70, 100) },     // well off the line
        { type: 'w', side: 'C', pt: G.destination(me, line + 180, 30) },     // behind
        { type: 'gb', side: 'C', pt: G.destination(me, line, 200) }          // past the green (160 m)
    ];
    const rows = G.approachCarries(me, mid, hz);
    assert.deepEqual(rows.map((r) => [r.verb, r.what, Math.round(r.meters / YD)]), [['carry', 'bunker', 142], ['clear', 'water', 153]]);
    assert.equal(G.approachLine(rows, YD), 'carry bunker 142 · clear water 153');
    assert.equal(G.approachLine(rows, 1), 'carry bunker 130 · clear water 140');
});

test('front / back are on the golfer\'s line (an outline green, from off the tee line)', () => {
    const ring = G.ellipseRing(G.destination(mid, 180, 14), G.destination(mid, 0, 14), mid);
    const n = G.greenNumbers(me, ring, mid);
    assert.ok(n.frontM < n.middleM && n.backM > n.middleM);
    // both edges sit on the line from the golfer through the middle (within a metre of it)
    const off = (p) => { const b = G.bearingDeg(me, p) - G.bearingDeg(me, mid); return Math.abs(Math.sin(b * Math.PI / 180) * G.haversineMeters(me, p)); };
    assert.ok(off(n.front) < 1 && off(n.back) < 1, JSON.stringify([off(n.front), off(n.back)]));
});
