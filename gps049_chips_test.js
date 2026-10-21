// URGENT-049 part 1: MARK SHOT CLUB CHIPS (gps-mark-chips.js + gps-view.js wiring).
// A mark = where the ball is: it closes the shot before it (carry = mark -> mark) and opens the
// next with the likely club pre-selected. A shot COUNTS only with a club; Skip = position only
// (it still closes the carry before it). The green / the hole's end close the last one. The
// record (HardPanShotLog.add) holds distances and wind only - never a coordinate.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-mark-chips.js'));
const skip = ON ? false : 'Consumer tree: no GPS chips';

function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-geo.js', 'gps-shots.js', 'gps-shot-log.js', 'gps-wind-learn.js', 'gps-mark-chips.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, G: sb.HardPanGeo, C: sb.HardPanMarkChips, L: sb.HardPanShotLog, B: sb.HardPanGpsBag, store };
}
const M_PER_YD = 0.9144;
// A point d yards from p on compass bearing b (flat-earth, fine at golf distances).
function off(p, yd, b) {
    const m = yd * M_PER_YD, r = b * Math.PI / 180;
    return [p[0] + (m * Math.cos(r)) / 111320, p[1] + (m * Math.sin(r)) / (111320 * Math.cos(p[0] * Math.PI / 180))];
}
const TEE = [33.4500, -111.9500];
const WIND = { mph: 10, fromDeg: 47, tempF: 81, src: 'weatherkit', at: Date.UTC(2026, 9, 21, 15, 37), obsAt: Date.UTC(2026, 9, 21, 15, 0) };
let clock = Date.UTC(2026, 9, 21, 15, 40);
function track(env, deps) { return env.C.create(Object.assign({ dist: env.G.haversineMeters, bearing: env.G.bearingDeg, now: () => (clock += 60000) }, deps || {})); }
function info(green, extra) { return Object.assign({ hole: 3, green, wind: WIND, elevFt: 1200, course: 'Papago Golf Club', golfer: 'Manny' }, extra || {}); }
const COORD = /"(lat|lng|lon|long|latitude|longitude|p|pt|point|pos|position|green|coords?)"|33\.4\d|-?111\.9\d/i;

test('a picked club counts: mark -> 7i -> mark again = one record, carry = mark to mark', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 160, 0);
    const a = T.mark(TEE, info(green, { club: '7i' }));
    assert.equal(a.closed, null, 'the first mark closes nothing');
    assert.equal(a.open.club, '7i', 'pre-selected');
    const b = off(TEE, 152, 10);
    const r = T.mark(b, info(green, { club: 'PW', elevFt: 1190 }));
    assert.equal(r.closed.counted, true);
    assert.equal(r.closed.carry, 152);
    const all = env.L.list({ golfer: 'Manny' });
    assert.equal(all.length, 1);
    assert.equal(all[0].club, '7i');
    assert.equal(all[0].carry, 152);
    assert.equal(all[0].elevFt, -10, 'elevation change mark -> next mark');
    assert.equal(all[0].tempF, 81);
    assert.equal(all[0].hole, 3);
    assert.equal(all[0].course, 'Papago Golf Club');
    assert.equal(all[0].wxHour, '2026-10-21T15:00:00.000Z', 'the reading\'s hourly timestamp');
    assert.equal(all[0].src, 'weatherkit');
    assert.equal(r.open.club, 'PW', 'the new mark opens the next shot');
});

test('Skip = position only: never a data point, but it still closes the carry before it', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 400, 0);
    T.mark(TEE, info(green, { club: 'Dr' }));
    const m2 = off(TEE, 250, 0);
    T.mark(m2, info(green, { club: '7i' }));
    T.skip();                                   // golfer taps Skip on the second shot
    assert.equal(T.open().club, null);
    const m3 = off(m2, 140, 0);
    const r = T.mark(m3, info(green, { club: 'SW' }));
    assert.equal(r.closed.counted, false, 'the skipped shot is not counted');
    assert.equal(r.closed.carry, 140, 'but its carry was closed (the ball is here)');
    const all = env.L.list({ golfer: 'Manny' });
    assert.deepEqual(all.map((s) => [s.club, s.carry]), [['Dr', 250]], 'only the driver');
    // A shot marked with no club at all (no bag yet, nothing tapped) is the same as Skip.
    const T2 = track(sandbox());
    T2.mark(TEE, info(green, { club: null }));
    assert.equal(T2.mark(off(TEE, 200, 0), info(green)).closed.counted, false);
});

test('the green / the hole\'s end closes the last open shot', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 150, 0);
    T.mark(TEE, info(green, { club: '8i' }));
    const onGreen = off(TEE, 146, 2);
    const c = T.close(onGreen, 1195);           // gps-view: the golfer's fix on the green
    assert.equal(c.counted, true);
    assert.equal(c.carry, 146);
    assert.equal(T.open(), null, 'nothing open after');
    assert.equal(T.close(onGreen), null, 'closing twice does nothing');
    // The hole ends with no green fix: the ball finished at the green (its center).
    T.mark(TEE, info(green, { club: '9i' }));
    const e = T.close(T.openGreen(), null);
    assert.equal(e.counted, true);
    assert.equal(e.carry, 150);
    // A mark ON the green (a putt): closes, opens nothing.
    T.mark(TEE, info(green, { club: '8i' }));
    const p = T.mark(onGreen, info(green, { noOpen: true }));
    assert.equal(p.closed.counted, true);
    assert.equal(p.open, null);
    assert.equal(env.L.list({ golfer: 'Manny' }).length, 3);
});

test('the record holds no coordinates (built record AND what the log stored)', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 160, 0);
    T.mark(TEE, info(green, { club: '7i' }));
    const r = T.mark(off(TEE, 155, 0), info(green));
    assert.ok(!COORD.test(JSON.stringify(r.closed.record)), JSON.stringify(r.closed.record));
    assert.ok(!COORD.test(env.store[env.L.KEY].replace(/Papago Golf Club/g, '')), 'nothing position-like on the phone either');
    Object.keys(r.closed.record).forEach((k) => assert.ok(['club', 'carry', 'windMph', 'windFromDeg', 'bearingDeg', 'relAngle', 'along', 'across', 'tempF', 'elevFt', 'course', 'hole', 'date', 'wxHour', 'src', 'golfer'].includes(k), 'unexpected field ' + k));
    // gps-view never hands the log a point: everything it passes goes through buildRecord.
    const v = read('gps-view.js'), sec = v.slice(v.indexOf('// ---- URGENT-049: THE CLUB CHIPS'), v.indexOf('    function syncSuggest('));
    assert.ok(sec.length > 1000 && !/HardPanShotLog\.add|\.ref\(|fetch\(|localStorage/.test(sec), 'the view writes nothing itself');
});

test('bearing = ball -> CENTER of the green, recomputed per shot (not ball -> next mark)', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 300, 30);
    T.mark(TEE, info(green, { club: '3w' }));
    const m2 = off(TEE, 220, 350);              // pulled well left of the green line
    T.mark(m2, info(green, { club: '9i' }));
    T.mark(off(m2, 100, 60), info(green));
    const [second, first] = env.L.list({ golfer: 'Manny' });
    assert.ok(Math.abs(first.bearingDeg - env.G.bearingDeg(TEE, green)) < 0.15, 'first: tee -> green center');
    assert.ok(Math.abs(second.bearingDeg - env.G.bearingDeg(m2, green)) < 0.15, 'second: its own spot -> green center');
    assert.ok(Math.abs(first.bearingDeg - 30) < 0.5 && Math.abs(second.bearingDeg - 30) > 5, 'recomputed, not reused');
});

test('wind angle convention (Manny 8:44): from 47 with bearing 47 = 0 (head); bearing 137 = 270 (from the left); along / across', { skip }, () => {
    const env = sandbox();
    [[47, 0], [137, 270], [319, 88]].forEach(([brg, want]) => {
        const T = track(env, { bearing: () => brg });
        T.mark(TEE, info(off(TEE, 200, 0), { club: '7i' }));
        const rec = T.mark(off(TEE, 160, 0), info(off(TEE, 200, 0))).closed.record;
        assert.ok(Math.abs(rec.relAngle - want) < 1e-6, brg + ' -> ' + rec.relAngle);
        assert.equal(rec.windFromDeg, 47);
        assert.equal(rec.bearingDeg, brg);
        const c = env.sb.HardPanWindLearn.components(10, want);
        assert.ok(Math.abs(rec.along - c.along) < 0.01 && Math.abs(rec.across - c.across) < 0.01);
    });
    const at88 = env.L.list({ golfer: 'Manny' })[0];
    assert.equal(at88.relAngle, 88, '88 stored exactly, not bucketed');
    assert.ok(Math.abs(at88.across - 9.99) < 0.01 && Math.abs(at88.along - 0.35) < 0.01, '88 at 10 mph = 9.99 from the right + 0.35 head');
});

test('no wind reading / manual dial / NWS: src and wxHour say so', { skip }, () => {
    const env = sandbox();
    assert.equal(env.C.srcOf({ src: 'obs', mph: 3 }), 'nws');
    assert.equal(env.C.srcOf({ src: 'hourly', mph: 3 }), 'nws');
    assert.equal(env.C.srcOf({ manual: true, mph: 3 }), 'manual');
    assert.equal(env.C.srcOf({ none: true }), null);
    const T = track(env);
    T.mark(TEE, info(off(TEE, 200, 0), { club: '6i', wind: { none: true, tempF: 70 } }));
    const rec = T.mark(off(TEE, 170, 0), info(off(TEE, 200, 0))).closed.record;
    assert.strictEqual(rec.windMph, null, 'int-049: no reading = null, not calm'); assert.equal(rec.wxHour, null); assert.equal(rec.src, null); assert.equal(rec.tempF, 70);
});

test('the likely club: My bag carries vs the yards to the green (shortest that gets there, else the longest)', { skip }, () => {
    const env = sandbox();
    ['7i', '7i', '7i'].forEach(() => env.B.add('Manny', '7i', 163));
    ['8i', '8i', '8i'].forEach(() => env.B.add('Manny', '8i', 152));
    ['Dr', 'Dr', 'Dr'].forEach(() => env.B.add('Manny', 'Dr', 250));
    assert.equal(env.C.likelyClub(env.B, 'Manny', 149), '8i');
    assert.equal(env.C.likelyClub(env.B, 'Manny', 160), '7i');
    assert.equal(env.C.likelyClub(env.B, 'Manny', 420), 'Dr');
    assert.equal(env.C.likelyClub(env.B, 'Manny', 5), null, 'too close: no guess');
});

test('swipe-to-delete hook: remove(id) deletes that one shot from the log', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 160, 0);
    T.mark(TEE, info(green, { club: '7i' }));
    const r = T.mark(off(TEE, 150, 0), info(green, { club: '8i' }));
    T.mark(off(TEE, 158, 0), info(green));
    assert.equal(env.L.list({ golfer: 'Manny' }).length, 2);
    assert.equal(env.C.remove(r.closed.id), true);
    assert.deepEqual(env.L.list({ golfer: 'Manny' }).map((s) => s.club), ['8i']);
    assert.equal(typeof env.C.swipeDelete, 'function');
});

test('gps-view wiring: every mark asks; tournament / spectator never; the green and the hole\'s end close; looking ahead does not', { skip }, () => {
    const v = read('gps-view.js');
    const mark = v.slice(v.indexOf('function markShotHere('), v.indexOf('function measureLabel('));
    assert.equal((mark.match(/chipsMark\(fix\.pt\)/g) || []).length, 2, 'tap 1 and every tap after');
    assert.ok(/function chipsOn\(\) \{ return !!\(S && bagSwitch\(\) && !tournament\(\) && !readOnlyHere\(\)\); \}/.test(v));
    assert.ok(/if \(!S \|\| !pt \|\| !chipsOn\(\)\) return;/.test(v));
    assert.ok(/if \(fix && o && o\.from === 'me' && nums && nums\.onGreen\) \{ chipsEnd\(fix\.pt, r\); return; \}/.test(v), 'the golfer on the green closes it');
    assert.ok(/if \(myScore\(op\.hole\) != null\) chipsEnd\(null, r\);/.test(v), 'a score closes it');
    assert.ok(/if \(S\.chips && \(S\.aaMoving \|\| myScore\(S\.hole\) != null\)\) \{ try \{ chipsEnd\(null, resolved\(\)\); \} catch \(e\) \{\} \}\s*S\.hole = hole;/.test(v), 'auto-advance / a scored hole closes before the hole changes');
    assert.ok(/markTick\(r\);\s*try \{ chipsTick\(r, o, nums\); \} catch \(e\) \{\}/.test(v), 'KP / Long Drive Mark button untouched, chips tick after it');
    assert.ok(/'<div class="gps-bagask gps-float" data-feature="clubs"[^']*gps-bagask-sub/.test(v), 'the bottom bar, not a map bubble');
    assert.ok(!/Mishit|data-gm=/.test(v.slice(v.indexOf('// ---- URGENT-049: THE CLUB CHIPS'), v.indexOf('    function syncSuggest('))), 'no Good / Mishit chip');
});
