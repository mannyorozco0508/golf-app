// 023c - THE TEE SHOT AT THE GOLFER'S DRIVER, IN THE FAIRWAY (gps-geo teeTarget). Pure geometry.
//   straight par 4: the target 300 yds out on the line, in the fairway;
//   dogleg left: the drive would pass the corner - it stops at the corner, the line bends there;
//   par 5 with water across the line at 285: it lays up 10 yds short (275) - "lay up 275 · water at 285";
//   par 3: the green, no tee shot;
//   no bag: the handicap default carry (the caller's number) is used as given.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('./gps-geo.js');
const G = window.HardPanGeo;
const YD = G.M_PER_YD;
const tee = [33.4607, -111.9608];
const at = (from, brg, yd) => G.destination(from, brg, yd * YD);
const yds = (a, b) => G.haversineMeters(a, b) / YD;
// A rectangle fairway along bearing brg from `from`, 40 yds wide, from y0 to y1 yds.
const fw = (from, brg, y0, y1, w) => { const a = at(from, brg, y0), b = at(from, brg, y1), h = (w || 40) / 2;
    return [at(a, brg - 90, h), at(b, brg - 90, h), at(b, brg + 90, h), at(a, brg + 90, h), at(a, brg - 90, h)]; };

test('straight par 4 (430): the target is 300 yds out on the line, in the fairway', () => {
    const mid = at(tee, 0, 430);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, mid], fairway: [fw(tee, 0, 180, 400)], driverM: 300 * YD });
    assert.equal(t.stop, null);
    assert.ok(Math.abs(yds(tee, t.pt) - 300) < 2, yds(tee, t.pt));
    assert.ok(Math.abs(yds(t.pt, mid) - 130) < 2);
    assert.equal(G.teeTargetNote(t), '');
});

test('dogleg left (corner at 250, then 170 to the green): the drive stops at the corner; the line bends', () => {
    const corner = at(tee, 0, 250), mid = at(corner, 300, 170);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, corner, mid], fairway: [fw(tee, 0, 180, 270, 50)], driverM: 300 * YD });
    assert.equal(t.stop, 'corner');
    assert.ok(Math.abs(yds(tee, t.pt) - 250) < 3, yds(tee, t.pt));
    assert.equal(G.teeTargetNote(t), 'lay up 250 · the corner');
});

test('par 5 with water across the line at 285: lay up 10 short - "lay up 275 · water at 285"', () => {
    const mid = at(tee, 10, 560);
    const water = at(tee, 10, 285);
    const t = G.teeTarget({ par: 5, tee, mid, line: [tee, mid], hazards: [{ type: 'w', side: 'C', pt: water }], driverM: 300 * YD });
    assert.equal(t.stop, 'hazard');
    assert.ok(Math.abs(yds(tee, t.pt) - 275) < 2, yds(tee, t.pt));
    assert.equal(G.teeTargetNote(t), 'lay up 275 · water at 285');
});

test('a bunker 60 yds off the line does not stop the drive', () => {
    const mid = at(tee, 0, 450);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, mid], hazards: [{ type: 'fb', side: 'R', pt: at(at(tee, 0, 280), 90, 60) }], driverM: 300 * YD });
    assert.equal(t.stop, null);
});

test('the fairway ends at 270 (rough to the green): it stops at the fairway\'s end', () => {
    const mid = at(tee, 0, 460);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, mid], fairway: [fw(tee, 0, 150, 270)], driverM: 300 * YD });
    assert.equal(t.stop, 'fairway');
    assert.ok(yds(tee, t.pt) >= 265 && yds(tee, t.pt) <= 271, yds(tee, t.pt));
});

test('par 3: the green, no tee shot', () => {
    const mid = at(tee, 0, 170);
    const t = G.teeTarget({ par: 3, tee, mid, driverM: 300 * YD });
    assert.equal(t.par3, true);
    assert.deepEqual(t.pt, mid);
});

test('a short par 4 (330): never closer than 60 to the green', () => {
    const mid = at(tee, 0, 330);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, mid], driverM: 300 * YD });
    assert.equal(t.stop, 'green');
    assert.ok(Math.abs(yds(t.pt, mid) - 60) < 2);
});

test('no bag: the handicap default carry the caller passes is used (e.g. 235)', () => {
    const mid = at(tee, 0, 420);
    const t = G.teeTarget({ par: 4, tee, mid, line: [tee, mid], driverM: 235 * YD });
    assert.ok(Math.abs(yds(tee, t.pt) - 235) < 2);
    // and with no number at all: the old 260 default
    const t2 = G.teeTarget({ par: 4, tee, mid, line: [tee, mid] });
    assert.ok(Math.abs(yds(tee, t2.pt) - 260) < 2);
});
