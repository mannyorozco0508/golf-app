// 094 URGENT - THE GREEN VIEW'S LINE, BEARING, DEPTH x WIDTH AND THE CLUB ARCS DO NOT DEPEND ON THE TARGET (pure).
// Manny, Oct 28 (Streamsong Red #6, par 3, from the tee): dragging the target turned the Green view, swapped the
// green's "deep · wide" and turned the arcs into slanted lines. The line now starts at the golfer (on the hole) or
// the TEE - never the target ring (gps-geo approachFrom); the green's size is measured along that line (gps-geo
// greenSize); the arcs lie across the fixed line (gps-arcs-plan arcAim). The geometry: Streamsong Red #6 / #8
// from the bundled OpenStreetMap extract (tee + green centre), F / C / B at the yards Manny's phone showed.
// FAILS on e194de29 (no approachFrom / greenSize / arcAim there).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
global.window = global; require('./gps-geo.js'); require('./gps-wind-learn.js');
const G = window.HardPanGeo, A = require('./gps-arcs-plan.js'), Y = G.M_PER_YD;

const OSM = JSON.parse(fs.readFileSync(path.join(__dirname, 'gps-osm', 'streamsong_red_blue.json'), 'utf8')).elements;
const GREENS = OSM.filter((e) => e.tags && e.tags.golf === 'green' && e.geometry);
const hole = (id, fcb) => {
    const w = OSM.find((e) => e.id === id), g = w.geometry, tee = [g[0].lat, g[0].lon], end = [g[g.length - 1].lat, g[g.length - 1].lon];
    const ring = GREENS.map((x) => x.geometry.map((p) => [p.lat, p.lon])).find((r) => G.pointInRing(end, r));
    const cen = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
    const brg = G.bearingDeg(tee, cen);
    return { tee, brg, g: { f: G.destination(tee, brg, fcb[0] * Y), c: G.destination(tee, brg, fcb[1] * Y), b: G.destination(tee, brg, fcb[2] * Y) } };
};
const H = { 6: hole(846920423, [156, 186, 215]), 8: hole(846930767, [79, 101, 122]) };
const rec = G.golfapiRecord([{ id: 't094', club: 'Streamsong Resort', course: 'Red', h: { 6: { g: H[6].g, t: { b: H[6].tee } }, 8: { g: H[8].g, t: { b: H[8].tee } } } }]);
const R = { 6: G.resolveHole(rec.holes['6'], null), 8: G.resolveHole(rec.holes['8'], null) };
// The target dragged all over the green and beyond it: front, back, left, right, the corners, on the centre.
const targets = (n) => { const c = R[n].mid, b = H[n].brg, out = [c];
    [[0, 15], [180, 15], [-90, 12], [90, 12], [45, 20], [135, 20], [-135, 20], [-45, 20], [0, 40], [90, 30]].forEach(([d, yd]) => out.push(G.destination(c, b + d, yd * Y)));
    return out; };
const ang = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const BAG = { LW: { yd: 84 }, SW: { yd: 104 }, GW: { yd: 121 }, PW: { yd: 133 }, '9i': { yd: 145 }, '8i': { yd: 168 }, '7i': { yd: 180 }, '6i': { yd: 192 }, '5i': { yd: 208 }, Dr: { yd: 260 } };
const WIND = { mph: 9, fromDeg: 225 };

for (const n of [6, 8]) {
    test('094 Streamsong Red #' + n + ': the line of play and the Green view bearing start at the tee, whatever the target', () => {
        const r = R[n];
        assert.ok(r && r.tee && r.mid, 'resolved');
        const want = G.bearingDeg(r.tee, r.mid);
        for (const t of targets(n)) {
            assert.deepEqual(G.approachFrom(null, r.tee, t), r.tee, 'from the tee, not the target');
            assert.ok(ang(G.approachAxis(G.approachFrom(null, r.tee, t), r.mid), want) < 1e-9, 'bearing tee -> green centre');
        }
        // On the hole (a live / held fix): the golfer's own line (022's approach view, unchanged), still not the target.
        const me = G.destination(r.tee, H[n].brg, 60 * Y);
        for (const t of targets(n)) assert.deepEqual(G.approachFrom(me, r.tee, t), me);
        // A hole with no tee at all: the target, as before (nothing else to measure from).
        assert.deepEqual(G.approachFrom(null, null, targets(n)[3]), targets(n)[3]);
        assert.equal(G.approachFrom(null, null, null), null);
    });

    test('094 Streamsong Red #' + n + ': "Green NN deep · NN wide" is measured once along tee -> green centre', () => {
        const r = R[n], base = G.greenSize(r, G.approachAxis(r.tee, r.mid));
        assert.ok(base.depthM > 0 && base.widthM > 0, 'deep and wide');
        const yd = (m) => Math.round(m / Y);
        for (const t of targets(n)) {
            const g = G.greenSize(r, G.approachAxis(G.approachFrom(null, r.tee, t), r.mid));
            assert.equal(yd(g.depthM), yd(base.depthM)); assert.equal(yd(g.widthM), yd(base.widthM));
            assert.deepEqual(g.center, base.center);
        }
        // THE BUG (e194de29's rule, the target -> green line): the same green read 59 x 33 or 33 x 59.
        const side = G.destination(r.mid, H[n].brg + 90, 12 * Y), old = G.greenSize(r, G.approachAxis(side, r.mid));
        assert.notEqual(yd(old.depthM), yd(base.depthM), 'the old line changed it (documents the bug)');
        // Unchanged math: the depth is the front -> back the GolfAPI ellipse spans along the line.
        assert.ok(Math.abs(yd(base.depthM) - (n === 6 ? 59 : 43)) <= 1, 'depth ' + yd(base.depthM));
        assert.equal(G.greenSize(null, 0), null); assert.equal(G.greenSize(r, null), null);
    });

    test('094 Streamsong Red #' + n + ': the club arcs from the tee lie across tee -> green centre and never move with the target', () => {
        const r = R[n], from = { pt: r.tee, kind: 'tee' };
        const draw = (t, opts) => A.arcs({ bag: BAG, fits: {}, hand: 'R', wind: WIND, from, mid: r.mid, par: 3, holeYd: G.haversineMeters(r.tee, r.mid) / Y,
            aim: A.arcAim(Object.assign({ par: 3, green: false, nearTee: true, target: t, moved: true, mid: r.mid }, opts || {})) });
        const base = draw(r.mid);
        assert.ok(base.length >= 2, 'arcs');
        base.forEach((a) => assert.ok(ang(G.bearingDeg(r.tee, a.pts[Math.floor(a.pts.length / 2)]), H[n].brg) < 0.05, a.club + ' centred on the line'));
        for (const t of targets(n)) {
            assert.deepEqual(draw(t), base, 'hole view');
            assert.deepEqual(draw(t, { green: true }), base, 'Green view');
            assert.deepEqual(draw(t, { moved: false }), base, 'untouched');
        }
        // THE BUG (e194de29's aim = the target): a target 12 yds right turned every arc.
        const side = G.destination(r.mid, H[n].brg + 90, 12 * Y);
        const old = A.arcs({ bag: BAG, fits: {}, hand: 'R', wind: WIND, from, mid: r.mid, par: 3, aim: side });
        assert.notDeepEqual(old.map((a) => a.pts), base.map((a) => a.pts), 'the old aim moved them (documents the bug)');
    });
}

test('094 arcAim: par 3 / Green view / from the golfer -> the green centre; a par 4 / 5 tee shot -> the hole\'s default line, never the dragged ring', () => {
    const mid = [1, 1], tgt = [2, 2], def = [3, 3];
    assert.deepEqual(A.arcAim({ par: 3, nearTee: true, target: tgt, mid }), mid);
    assert.deepEqual(A.arcAim({ par: '3', nearTee: true, target: tgt, targetDefault: def, moved: true, mid }), mid);
    assert.deepEqual(A.arcAim({ par: 4, green: true, nearTee: true, target: tgt, mid }), mid, 'Green view, any par');
    assert.deepEqual(A.arcAim({ par: 5, nearTee: false, target: tgt, mid }), mid, 'from the golfer (as before)');
    // Par 4 / 5 from the tee, hole view: the untouched default target (052 A, as before) ...
    assert.deepEqual(A.arcAim({ par: 4, nearTee: true, target: def, targetDefault: def, moved: false, mid }), def);
    // ... dragged: still the default line, not the ring.
    assert.deepEqual(A.arcAim({ par: 4, nearTee: true, target: tgt, targetDefault: def, moved: true, mid }), def);
    assert.deepEqual(A.arcAim({ par: 5, nearTee: true, target: tgt, moved: true, mid }), mid, 'no default known: the centre');
    assert.deepEqual(A.arcAim({ par: 4, nearTee: true, target: null, mid }), mid);
    assert.equal(A.arcAim(null), null); assert.equal(A.arcAim({ par: 3 }), null);
});
