// URGENT-052 B stage 1: THE LEFT / RIGHT MISS on every marked shot (gps-mark-chips.js,
// gps-shot-log.js, gps-view.js). `offline` = signed yards off the aim line where the ball
// finished (+ = right of the line, as the golfer looks toward the aim; handedness kept apart),
// `aimKind` = target-ring | green-center, `endKind` = marked | green | hole-close.
// Worked out at the next mark from in-memory positions only; never a coordinate stored.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-mark-chips.js'));
const skip = ON ? false : 'Consumer tree: no GPS chips';

function sandbox(seed) {
    const store = Object.assign({}, seed || {});
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-geo.js', 'gps-shots.js', 'gps-shot-log.js', 'gps-wind-learn.js', 'gps-mark-chips.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, G: sb.HardPanGeo, C: sb.HardPanMarkChips, L: sb.HardPanShotLog, store };
}
const M_PER_YD = 0.9144;
function off(p, yd, b) {
    const m = yd * M_PER_YD, r = b * Math.PI / 180;
    return [p[0] + (m * Math.cos(r)) / 111320, p[1] + (m * Math.sin(r)) / (111320 * Math.cos(p[0] * Math.PI / 180))];
}
const TEE = [33.4500, -111.9500];
const WIND = { mph: 8, fromDeg: 200, tempF: 75, src: 'weatherkit', at: Date.UTC(2026, 9, 21, 15, 37) };
let clock = Date.UTC(2026, 9, 21, 15, 40);
function track(env) { return env.C.create({ dist: env.G.haversineMeters, bearing: env.G.bearingDeg, now: () => (clock += 60000) }); }
function info(green, extra) { return Object.assign({ hole: 7, green, wind: WIND, elevFt: 1200, course: 'Test 052B Course', golfer: 'Test 052B Golfer' }, extra || {}); }
// Position-like KEYS, or numbers that look like this test's latitude / longitude.
const COORD_KEY = /"(lat|lng|lon|long|latitude|longitude|p|pt|point|pos|position|green|aim|ring|from|coords?)"\s*:/i;
const COORD_NUM = /33\.4\d|-?111\.9\d/;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', want ' + b);

test('known geometry: 10 yds right of a north line = +10, 10 yds left = -10', { skip }, () => {
    const env = sandbox(), { C, G } = env;
    const aim = off(TEE, 160, 0), along = off(TEE, 150, 0);
    near(C.offlineYd(TEE, aim, off(along, 10, 90), G.haversineMeters, G.bearingDeg), 10, 0.2, 'right');
    near(C.offlineYd(TEE, aim, off(along, 10, 270), G.haversineMeters, G.bearingDeg), -10, 0.2, 'left');
    near(C.offlineYd(TEE, aim, along, G.haversineMeters, G.bearingDeg), 0, 0.1, 'dead straight');
});

test('known geometry on a turned line (aim on 235 deg): the sign follows the golfer looking at the aim', { skip }, () => {
    const env = sandbox(), { C, G } = env;
    const aim = off(TEE, 180, 235), along = off(TEE, 165, 235);
    // Right of a line on 235 is toward 325 (235 + 90); left is toward 145.
    near(C.offlineYd(TEE, aim, off(along, 12, 325), G.haversineMeters, G.bearingDeg), 12, 0.25, 'right');
    near(C.offlineYd(TEE, aim, off(along, 7, 145), G.haversineMeters, G.bearingDeg), -7, 0.25, 'left');
    // Across north (359 -> 1 deg): no wrap-around error.
    const a2 = off(TEE, 150, 359);
    near(C.offlineYd(TEE, a2, off(TEE, 150, 3), G.haversineMeters, G.bearingDeg), 150 * Math.sin(4 * Math.PI / 180), 0.2, 'wrap');
    // No line: aim on the ball / missing.
    assert.equal(C.offlineYd(TEE, TEE, along, G.haversineMeters, G.bearingDeg), null);
    assert.equal(C.offlineYd(TEE, null, along, G.haversineMeters, G.bearingDeg), null);
});

test('a marked 7-iron 8 yds right of the green-center line stores offline +8, aimKind green-center, endKind marked', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 160, 20);
    T.mark(TEE, info(green, { club: '7i' }));
    const ball = off(off(TEE, 152, 20), 8, 110);
    const r = T.mark(ball, info(green, { club: 'PW' }));
    assert.equal(r.closed.counted, true);
    const s = env.L.list({ golfer: 'Test 052B Golfer' })[0];
    near(s.offline, 8, 0.2, 'offline');
    assert.equal(s.aimKind, 'green-center');
    assert.equal(s.endKind, 'marked');
    assert.equal(s.carry, Math.round(env.G.haversineMeters(TEE, ball) / M_PER_YD));
    assert.ok(env.L.hasMiss(s));
});

test('right- and left-handers: the same ball position stores the same signed offline (golfer\'s view); hand kept apart', { skip }, () => {
    for (const hand of ['R', 'L']) {
        const env = sandbox(), T = track(env), green = off(TEE, 170, 0);
        env.L.setHand('Test 052B Golfer', hand);
        T.mark(TEE, info(green, { club: '6i' }));
        T.mark(off(off(TEE, 165, 0), 9, 270), info(green));      // 9 yds LEFT
        const s = env.L.list({ golfer: 'Test 052B Golfer' })[0];
        near(s.offline, -9, 0.2, hand + ' offline');
        assert.equal(env.L.hand('Test 052B Golfer'), hand);
        assert.ok(!('hand' in s), 'handedness is not baked into the shot');
    }
});

test('the moved target ring is the aim line (moved while at the ball): offline vs the ring, aimKind target-ring', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 200, 0);
    const ring = off(TEE, 150, 330);                               // laid up left of the green line
    T.mark(TEE, info(green, { club: '7i', ring: { pt: ring, from: off(TEE, 3, 90) } }));
    assert.equal(T.open().aimKind, 'target-ring');
    const ball = off(off(TEE, 148, 330), 6, 60);                   // 6 yds right of the RING line
    T.mark(ball, info(green));
    const s = env.L.list({ golfer: 'Test 052B Golfer' })[0];
    near(s.offline, 6, 0.25, 'vs the ring');
    assert.equal(s.aimKind, 'target-ring');
});

test('ring moved AFTER the mark while still at the ball counts; a ring left over from the shot before does not', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 200, 0);
    // Left over: moved from 150 yds back (the golfer's previous spot).
    T.mark(TEE, info(green, { club: '8i', ring: { pt: off(TEE, 120, 40), from: off(TEE, 150, 180) } }));
    assert.equal(T.open().aimKind, 'green-center', 'a stale ring is not this shot\'s aim');
    // Now he drags the ring while standing at the ball.
    T.aim({ pt: off(TEE, 150, 10), from: off(TEE, 2, 0) }, off(TEE, 2, 0));
    assert.equal(T.open().aimKind, 'target-ring');
    // Walked 100 yds on, puts the ring back / moves it for the next shot: ignored for this one.
    T.aim(null, off(TEE, 100, 0));
    assert.equal(T.open().aimKind, 'target-ring', 'walked on - no change');
    T.aim({ pt: off(TEE, 190, 0), from: off(TEE, 100, 0) }, off(TEE, 100, 0));
    T.mark(off(TEE, 150, 10), info(green));
    const s = env.L.list({ golfer: 'Test 052B Golfer' })[0];
    assert.equal(s.aimKind, 'target-ring');
    near(s.offline, 0, 0.2, 'straight at the ring he aimed at');
    // Recenter while at the ball: back to the green center.
    const env2 = sandbox(), T2 = track(env2);
    T2.mark(TEE, info(green, { club: '9i', ring: { pt: off(TEE, 100, 20), from: TEE } }));
    T2.aim(null, TEE);
    assert.equal(T2.open().aimKind, 'green-center');
});

test('endKind: green (his fix on the green) keeps offline; hole-close is stored but flagged with offline null', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 150, 0);
    T.mark(TEE, info(green, { club: '8i' }));
    const g = T.close(off(off(TEE, 148, 0), 5, 90), null, 'green');
    assert.equal(g.record.endKind, 'green');
    near(g.record.offline, 5, 0.2);
    T.mark(TEE, info(green, { club: '9i' }));
    const h = T.close(green, null, 'hole-close');
    assert.equal(h.counted, true, 'the carry still counts (049)');
    assert.equal(h.record.endKind, 'hole-close');
    assert.equal(h.record.offline, null);
    const [last, first] = env.L.list({ golfer: 'Test 052B Golfer' });
    assert.equal(last.endKind, 'hole-close');
    assert.equal(last.offline, null);
    assert.equal(env.L.hasMiss(last), false, 'stage 2 leaves it out');
    assert.equal(env.L.hasMiss(first), true);
    // A caller with no end kind (old code): a mark.
    T.mark(TEE, info(green, { club: 'PW' }));
    assert.equal(T.close(off(TEE, 120, 0), null).record.endKind, 'marked');
});

test('no coordinates: not in the record, not in storage, not even the ring', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 160, 0);
    T.mark(TEE, info(green, { club: '7i', ring: { pt: off(TEE, 150, 350), from: TEE } }));
    const r = T.mark(off(TEE, 155, 4), info(green));
    T.close(off(TEE, 160, 1), null, 'green');
    const recTxt = JSON.stringify(r.closed.record), stored = env.store[env.L.KEY];
    assert.ok(!COORD_KEY.test(recTxt) && !COORD_NUM.test(recTxt), recTxt);
    assert.ok(!COORD_KEY.test(stored) && !COORD_NUM.test(stored), stored);
    const ok = ['club', 'carry', 'windMph', 'windFromDeg', 'bearingDeg', 'relAngle', 'along', 'across', 'tempF', 'elevFt', 'course', 'hole', 'date', 'wxHour', 'src', 'golfer', 'offline', 'aimKind', 'endKind'];
    Object.keys(r.closed.record).forEach((k) => assert.ok(ok.includes(k), 'unexpected field ' + k));
    JSON.parse(stored).golfers[Object.keys(JSON.parse(stored).golfers)[0]].shots.forEach((s) =>
        Object.keys(s).forEach((k) => assert.ok(ok.concat(['id']).includes(k) && k !== 'golfer', 'stored field ' + k)));
    // clean() drops anything position-like handed to it, and a junk aimKind / huge offline.
    const c = env.L.clean({ club: '7i', carry: 150, windMph: 0, relAngle: 0, offline: 999, aimKind: 'lat', endKind: 'marked', aim: [33.45, -111.95], pt: [1, 2] });
    assert.equal(c.offline, null);
    assert.equal(c.aimKind, 'green-center');
    assert.ok(!('aim' in c) && !('pt' in c));
});

test('Skip still never counts - even with a ring and a clean miss', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 300, 0);
    T.mark(TEE, info(green, { club: 'Dr', ring: { pt: off(TEE, 250, 0), from: TEE } }));
    T.skip();
    const r = T.mark(off(TEE, 245, 5), info(green, { club: '9i' }));
    assert.equal(r.closed.counted, false);
    assert.equal(r.closed.record, null);
    T.skip();
    assert.equal(T.close(off(TEE, 290, 0), null, 'green').counted, false);
    assert.equal(env.L.list({ golfer: 'Test 052B Golfer' }).length, 0);
});

test('old records (before 052, no offline / aimKind / endKind) load, list, fit and sit next to new ones', { skip }, () => {
    const old = { v: 1, golfers: { 'n:test 052b golfer': { hand: 'R', shots: [
        { id: 'a1', club: '7i', carry: 152, windMph: 6, relAngle: 0, along: 6, across: 0, tempF: 70, elevFt: null, course: 'Old', hole: 3, date: 1760000000000, wxHour: null, windFromDeg: 10, bearingDeg: 10, src: 'nws' },
        { id: 'a2', club: '7i', carry: 149, windMph: null, relAngle: null, along: null, across: null, tempF: null, elevFt: null, course: 'Old', hole: 4, date: 1760000100000, wxHour: null, windFromDeg: null, bearingDeg: 50, src: null }
    ] } } };
    const env = sandbox({ hardpan_shotlog_v1: JSON.stringify(old) }), T = track(env), green = off(TEE, 160, 0);
    let all = env.L.list({ golfer: 'Test 052B Golfer' });
    assert.equal(all.length, 2);
    all.forEach((s) => { assert.ok(!('offline' in s)); assert.equal(env.L.hasMiss(s), false); });
    T.mark(TEE, info(green, { club: '7i' }));
    T.mark(off(TEE, 150, 3), info(green));
    all = env.L.list({ golfer: 'Test 052B Golfer', club: '7i' });
    assert.equal(all.length, 3);
    assert.equal(all.filter((s) => env.L.hasMiss(s)).length, 1);
    const f = env.sb.HardPanWindLearn.fit(all, { carry: 150 });
    assert.equal(f.n, 3, 'the wind fit reads old and new alike');
    // clean() of an old-shape record keeps it old-shaped (no invented miss).
    const c = env.L.clean(old.golfers['n:test 052b golfer'].shots[0]);
    assert.ok(!('offline' in c) && !('endKind' in c) && !('aimKind' in c));
});

test('gps-view wiring: ring + where he stood (memory only), green / hole-close end kinds, aim synced at the ball', { skip }, () => {
    const v = read('gps-view.js');
    const sec = v.slice(v.indexOf('// ---- URGENT-049: THE CLUB CHIPS'), v.indexOf('    function syncSuggest('));
    assert.ok(/ring: chipsRing\(\)/.test(sec), 'the mark hands the tracker the ring');
    assert.ok(/T\.close\(end, [^;]*pt \? 'green' : 'hole-close'\)/.test(sec), 'green fix vs hole end');
    assert.ok(/T\.close\(T\.openGreen\(\), null, 'hole-close'\)/.test(sec), 'a hole left behind closes as hole-close');
    assert.ok(/T\.aim\(chipsRing\(\), fix \? fix\.pt : null\)/.test(sec), 'the tick keeps the aim current while at the ball');
    assert.ok(!/HardPanShotLog\.add|\.ref\(|fetch\(|localStorage/.test(sec), 'the view writes nothing itself');
    assert.equal((v.match(/S\.targetMovedFrom = fix \? fix\.pt\.slice\(\) : null/g) || []).length, 2, 'drag + tap record where he stood');
    assert.ok(!/targetMovedFrom[^\n]*(localStorage|cacheWrite|\.set\(|\.update\()/.test(v), 'never stored');
});
