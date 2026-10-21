// ============================================================================
// URGENT-045 #1 - AUTO-ADVANCE HOLES: THE DECISION (gps-geo autoAdvanceDecision, pure).
//
// A position + the state -> switch or not. Switch ONE hole forward in play order when the golfer
// is within ~30 yds of the next tee, off the current green, for ~10 s. Never backwards, never
// while the score sheet is open, never two holes at once, a manual change wins for 2 min, Undo
// holds it 2 min. Shotgun / 10th-tee starts follow the play order (play-order.js). A next hole
// with no tee point: no auto-advance onto it. Plus the privacy guard: nothing about the position
// is stored or sent.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
global.window = global;
const geo = ON ? (require('./gps-geo.js'), window.HardPanGeo) : null;
const PO = require('./play-order.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const YD = 0.9144;
const at = (p, brg, yd) => geo.destination(p, brg, yd * YD);
// A little course: green 1, then tee 2 60 yds east of it; tee 3 far away.
const G1 = [33.46, -111.96], T2 = at(G1, 90, 60), T3 = at(G1, 180, 900), T11 = at(G1, 0, 2000), T1 = at(G1, 270, 3000);
const TEES = { 1: T1, 2: T2, 3: T3, 11: T11 };
const ONE = Array.from({ length: 18 }, (_, i) => i + 1);
const T0 = 1e12;
// The golfer standing at `me` on `hole`, armed (walked the hole), the dwell already 10 s old.
const base = (o) => Object.assign({ on: true, visible: true, hole: 1, order: ONE, me: T2, acc: 5, tees: TEES, green: G1, onGreen: false,
    sheetOpen: false, busy: false, now: T0, manualAt: null, holdUntil: null, armed: true, dwell: { hole: 2, since: T0 - 10001 } }, o || {});
const D = (o) => geo.autoAdvanceDecision(base(o));

test('near the next tee, after leaving the green, for ~10 s: switch to hole 2 (and only then)', () => {
    let d = D();
    assert.deepEqual([d.go, d.to, d.reason], [true, 2, 'go']);
    d = D({ me: at(T2, 0, 28) });
    assert.equal(d.go, true, '28 yds from the tee is "within ~30 yds"');
    d = D({ me: at(T2, 0, 33) });
    assert.deepEqual([d.go, d.reason], [false, 'not-there'], '33 yds: not yet');
    // The first fix on the tee starts the ~10 s wait; it switches only once the wait is up.
    d = D({ dwell: null });
    assert.deepEqual([d.go, d.reason, d.dwell && d.dwell.hole, d.dwell && d.dwell.since], [false, 'arming', 2, T0]);
    d = D({ dwell: d.dwell, now: T0 + 4000 });
    assert.deepEqual([d.go, d.reason], [false, 'waiting']);
    d = D({ dwell: d.dwell, now: T0 + 10000 });
    assert.deepEqual([d.go, d.to], [true, 2]);
    assert.equal(D({ acc: 45 }).go, false, 'a weak fix (+-45 m) never switches');
    assert.equal(D({ me: null }).go, false, 'no fix, no switch');
});

test('still on the green: no switch (even with the next tee close by)', () => {
    assert.deepEqual([D({ onGreen: true }).go, D({ onGreen: true }).reason], [false, 'not-there']);
    // The next tee 15 yds from the green's center: standing on the green is never "on the tee".
    const g = at(T2, 270, 15);
    assert.equal(D({ green: g, me: at(T2, 270, 12) }).go, false, 'on the green, 3 yds from its center');
    assert.equal(D({ green: g, me: at(T2, 90, 12) }).go, true, 'past the tee, off the green');
    // Standing on the green ARMS the hole (the golfer is playing it) - but does not switch.
    let d = D({ armed: false, onGreen: true });
    assert.deepEqual([d.go, d.armed], [false, true]);
    // A green known only by its center (a tapped pin), 15 yds from the next tee: within 20 m of
    // that center is the green too - it arms the hole, and the tee beyond it then switches.
    d = D({ green: g, me: at(T2, 270, 13), armed: false, dwell: null });
    assert.deepEqual([d.go, d.armed], [false, true]);
});

test('never backwards, never more than one hole at a time', () => {
    // On hole 5, standing on hole 2's (or 4's) tee: nothing - only hole 6 is ever a candidate.
    let d = D({ hole: 5 });
    assert.deepEqual([d.go, d.reason], [false, 'no-tee'], 'hole 6 has no tee here; 2 and 4 are never looked at');
    d = D({ hole: 5, tees: { 4: T2, 2: T2 } });
    assert.equal(d.go, false, 'on an earlier hole\'s tee: no switch back');
    // On hole 1, standing on hole 3's tee: never 1 -> 3.
    d = D({ me: T3, dwell: { hole: 3, since: T0 - 20000 } });
    assert.equal(d.go, false, 'never skips a hole');
    // A dwell left over for another hole is not this one's: the wait starts again.
    d = D({ dwell: { hole: 3, since: T0 - 20000 } });
    assert.deepEqual([d.go, d.reason, d.dwell.hole], [false, 'arming', 2]);
    // Just arrived on hole 2 by auto-advance, on its tee, with hole 3's tee right beside it:
    // the new hole starts UNARMED - no 2 -> 3 off the same spot.
    d = D({ hole: 2, me: T2, tees: { 3: at(T2, 0, 10) }, green: at(T2, 0, 400), armed: false, dwell: null });
    assert.deepEqual([d.go, d.reason, d.armed], [false, 'not-armed', false]);
    // Once the golfer has walked away from that tee (down hole 2), it is armed.
    d = D({ hole: 2, me: at(T2, 0, 200), tees: { 3: at(T2, 0, 10) }, green: at(T2, 0, 400), armed: false, dwell: null });
    assert.equal(d.armed, true);
});

test('the score sheet open (or anything else over the map): no switch', () => {
    assert.deepEqual([D({ sheetOpen: true }).go, D({ sheetOpen: true }).reason], [false, 'sheet']);
    assert.deepEqual([D({ busy: true }).go, D({ busy: true }).reason], [false, 'busy']);
    assert.equal(D({ visible: false }).go, false, 'the app in the background: nothing');
    assert.equal(D({ on: false }).reason, 'off', 'Tools > Auto-advance holes off');
});

test('a manual hole change wins for 2 minutes; Undo holds it 2 minutes', () => {
    assert.deepEqual([D({ manualAt: T0 - 30000 }).go, D({ manualAt: T0 - 30000 }).reason], [false, 'manual']);
    assert.equal(D({ manualAt: T0 - 119000 }).go, false, '1:59 after');
    assert.equal(D({ manualAt: T0 - 120000 }).go, true, '2:00 after');
    assert.deepEqual([D({ holdUntil: T0 + 1 }).go, D({ holdUntil: T0 + 1 }).reason], [false, 'undo']);
    assert.equal(D({ holdUntil: T0 }).go, true, 'the hold is over');
    assert.equal(geo.AA_HOLD_MS, 120000);
});

test('shotgun / 10th-tee starts (play-order.js): 10 -> 11 and 18 -> 1; the last hole played: nothing', () => {
    const course = ONE.map((h) => ({ hole: h, par: 4 }));
    const ten = PO.playOrder(course, PO.teeStartHole({ startingHole: 10 }, course)).map((h) => h.hole);
    assert.deepEqual(ten.slice(0, 3), [10, 11, 12]);
    // Started on 10: from 10 to 11's tee.
    let d = D({ hole: 10, order: ten, me: T11, tees: { 11: T11 }, dwell: { hole: 11, since: T0 - 10001 } });
    assert.deepEqual([d.go, d.to], [true, 11]);
    // Started on 10: 18 -> 1 (forward in play order, not backwards).
    d = D({ hole: 18, order: ten, me: T1, tees: { 1: T1 }, dwell: { hole: 1, since: T0 - 10001 } });
    assert.deepEqual([d.go, d.to], [true, 1]);
    // Started on 10: 9 is the last hole - never a jump to 10.
    d = D({ hole: 9, order: ten, me: T1, tees: { 10: T1 }, dwell: { hole: 10, since: T0 - 10001 } });
    assert.deepEqual([d.go, d.reason], [false, 'last']);
    // A shotgun start on 5 (groupStartingHoles): 18 -> 1, 4 is last.
    // group 2 of a shotgun goes off 5 (groupStartingHoles)
    const five = PO.playOrder(course, PO.groupStartHole({ startingHole: 1, groupStartingHoles: { 1: 1, 2: 5 } }, course, 2)).map((h) => h.hole);
    assert.deepEqual(five.slice(0, 2), [5, 6]);
    assert.deepEqual([D({ hole: 18, order: five, me: T1, tees: { 1: T1 }, dwell: { hole: 1, since: T0 - 10001 } }).to, D({ hole: 4, order: five }).reason], [1, 'last']);
});

test('the last hole (start on 1: 18) - nothing after it, no wrap to 1', () => {
    const d = D({ hole: 18, me: T1, tees: { 1: T1 }, dwell: { hole: 1, since: T0 - 10001 } });
    assert.deepEqual([d.go, d.to, d.reason], [false, null, 'last']);
    assert.equal(D({ hole: 9, order: ONE.slice(0, 9) }).reason, 'last', 'a nine-hole round: none after 9');
});

test('a next hole with NO tee point: no auto-advance onto it', () => {
    const d = D({ tees: {} });
    assert.deepEqual([d.go, d.to, d.reason], [false, 2, 'no-tee']);
    assert.equal(D({ tees: null, teeOf: (n) => (n === 2 ? { lat: T2[0], lng: T2[1] } : null) }).go, true, 'teeOf(n) and {lat,lng} points work too');
});

test('gps-view feeds the decision from the map\'s own fix: no new watcher; manual changes are timed; the sheet for the finished hole', () => {
    const v = read('gps-view.js');
    const a = v.indexOf('    function aaTick() {'), b = v.indexOf('\n    function ', a + 30);
    const tick = v.slice(a, b);
    assert.ok(/G\.autoAdvanceDecision\(\{/.test(tick) && /me: fix \? fix\.pt : null/.test(tick), 'the tick asks gps-geo, with the existing fix');
    assert.ok(!/watchPosition|getCurrentPosition|setInterval/.test(tick), 'no new GPS watcher or timer loop');
    assert.equal((v.match(/watchPosition\(/g) || []).length, 2, 'still the one watch (Capacitor / web paths), as before');
    assert.ok(/if \(!S\.aaMoving\) S\.aaManualAt = Date\.now\(\);/.test(v), 'a hole change not made by auto-advance is manual');
    assert.ok(/function aaSheetFor\(h\)/.test(v) && /Number\(w\.scores\['p' \+ w\.id \+ '_h' \+ h\]\) > 0\) return;/.test(v) && /if \(!ss\.go\(h\)\) \{ ss\.close\(\); return; \}/.test(v), 'the finished hole\'s sheet, only when it has no score');
});

test('PRIVACY GUARD: the position is compared, never stored or sent', () => {
    const v = read('gps-view.js');
    const a = v.indexOf('// ---- AUTO-ADVANCE HOLES (008'), b = v.indexOf('// ---- FREE PAN, KEPT ON THE COURSE');
    const block = v.slice(a, b);
    assert.ok(block.length > 2000 && /function aaTick\(\)/.test(block), 'the auto-advance block is there');
    assert.ok(!/\.ref\(|\.set\(|\.update\(|fetch\(|XMLHttpRequest|sendBeacon|postMessage|sessionStorage|indexedDB/.test(block), 'no database write, network call or other storage');
    block.split('\n').filter((l) => /setItem\(/.test(l)).forEach((l) => assert.ok(/setItem\(AA_KEY, '0'\)/.test(l) || /removeItem/.test(l), 'the only write is the On / Off choice: ' + l));
    const g = read('gps-geo.js');
    const ga = g.indexOf('    function autoAdvanceDecision(o) {'), gb = g.indexOf('\n    // A NUMBER THAT FITS', ga);
    const fn = g.slice(ga, gb);
    assert.ok(/return \{ go: true, to: next/.test(fn), 'the decision is there');
    assert.ok(!/localStorage|\.ref\(|fetch\(|XMLHttpRequest|window\./.test(fn), 'the decision is pure');
    // And what it returns carries no coordinates: only go / to / reason / armed / dwell {hole, since}.
    const d = D({ dwell: null });
    assert.deepEqual(Object.keys(d).sort(), ['armed', 'dwell', 'go', 'reason', 'to']);
    assert.deepEqual(Object.keys(d.dwell).sort(), ['hole', 'since']);
});
