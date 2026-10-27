// URGENT-085b - THE MY MISS LABEL ALWAYS HAS A CLEAR SPOT WHEN THE MAP HAS ONE (pure, node).
// q03 on e690614f (and 2ed231e6, now and then): at 402x874, 125 out, a pitching-wedge oval had the green's "B"
// label / green line right above it and the plays-like pill right below; every spot within 54 px was covered,
// so the label went on "B". The case below is that oval's box (worked back from the failing run's spot list)
// with the labels above and the pill below as obstacles: a spot that touches nothing must exist (farther out,
// or against an edge of the clear map), and every spot stays on the clear map's left / right edges when clamped.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('./gps-view.js');

const box = { l: 139, t: 348, r: 263, b: 447 }, sw = 164, sh = 19;
const B = { l: 4, t: 150, r: 332.9, b: 651 };
const OBS = [
    { l: 0, t: 255, r: 402, b: 346 },     // the green's F / C / B labels and "Green N deep" line, above the oval
    { l: 0, t: 449, r: 402, b: 522 },     // the plays-like pill, below it
    { l: 333, t: 150, r: 402, b: 651 }    // the right-hand rail
];
const hits = (c, o) => c.l < o.r + 2 && c.r > o.l - 2 && c.t < o.b + 2 && c.b > o.t - 2;
const clean = (c) => c.l >= B.l && c.r <= B.r && c.t >= B.t && c.b <= B.b && !OBS.some((o) => hits(c, o)) && !hits(c, { l: box.l - 2, t: box.t - 2, r: box.r + 2, b: box.b + 2 });

test('085b: the q03 wedge case has a spot that touches nothing (labels, pill, rail, the oval, off the map)', () => {
    assert.equal(typeof V.missLblSpots, 'function', 'missLblSpots is exposed for checks');
    const spots = V.missLblSpots(box, sw, sh, B);
    const ok = spots.filter(clean);
    assert.ok(ok.length > 0, 'a clear spot: ' + JSON.stringify(spots.map((c) => c.how + '@' + Math.round(c.l) + ',' + Math.round(c.t))));
    // The nearer spots (8 / 30 / 54 px, as before) come first: an earlier clear spot always wins (unchanged order).
    assert.equal(spots[0].how, 'right');
    assert.ok(spots.every((c) => c.r - c.l === sw && c.b - c.t === sh));
});

test('085b: a small oval with room beside it still gets its nearest spot first (no change for the usual case)', () => {
    const small = { l: 150, t: 300, r: 190, b: 330 };
    const spots = V.missLblSpots(small, 120, 19, { l: 4, t: 150, r: 398, b: 800 });
    assert.deepEqual([spots[0].how, Math.round(spots[0].l)], ['right', 198]);
});
