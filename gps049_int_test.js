// URGENT-049 INTEGRATION (int-049): the three 049 parts together - the chips (part 1), the wind
// math (part 2) and the shot log / My bag (part 3) - with the four integration fixes:
//   a  ONE SOURCE: a counted shot is in the shot log only; My bag's count for a club is the log's
//      (one marked 7-iron shot = "1 shot" for the 7-iron, never 2), and gps-view no longer also
//      adds it to the old bag's shot list.
//   b  NO READING IS NOT CALM: a mark with no wind reading stores windMph null (src null, no angle);
//      it counts for still-air carry, never as a wind point or a calm one; Shot history says
//      "no wind reading".
//   c  ONE DELETE PATH: Shot history's Delete removes from the log once; the chips' second swipe
//      handler is gone; Reset for a club clears its marked shots.
//   d  KEPT: the chip row timing out leaves the pre-picked club counted; a hole finished without a
//      fix on the green closes the shot at the green's center.
// The real screen: urgent049_int_chrome_test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-mark-chips.js')) && fs.existsSync(path.join(__dirname, 'gps-shot-bag.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-geo.js', 'gps-shots.js', 'gps-shot-log.js', 'gps-wind-learn.js', 'gps-mark-chips.js', 'gps-shot-bag.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, G: sb.HardPanGeo, C: sb.HardPanMarkChips, L: sb.HardPanShotLog, B: sb.HardPanGpsBag, SB: sb.HardPanShotBag, WL: sb.HardPanWindLearn, store };
}
const M_PER_YD = 0.9144;
function off(p, yd, b) {
    const m = yd * M_PER_YD, r = b * Math.PI / 180;
    return [p[0] + (m * Math.cos(r)) / 111320, p[1] + (m * Math.sin(r)) / (111320 * Math.cos(p[0] * Math.PI / 180))];
}
const TEE = [33.4500, -111.9500];
const WIND = { mph: 10, fromDeg: 47, tempF: 81, src: 'weatherkit', at: Date.UTC(2026, 9, 21, 15, 37), obsAt: Date.UTC(2026, 9, 21, 15, 0) };
let clock = Date.UTC(2026, 9, 21, 15, 40);
function track(env) { return env.C.create({ dist: env.G.haversineMeters, bearing: env.G.bearingDeg, now: () => (clock += 60000) }); }
function info(green, extra) { return Object.assign({ hole: 3, green, wind: WIND, elevFt: 1200, course: 'Papago Golf Club', golfer: 'Manny' }, extra || {}); }
const plain = (x) => JSON.parse(JSON.stringify(x));
const view = () => read('gps-view.js');

// ---- a: one source ------------------------------------------------------------------------
test('a: one marked 7-iron shot -> My bag shows exactly 1 shot for the 7-iron (the log only, not the old bag too)', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 170, 0);
    T.mark(TEE, info(green, { club: '7i' }));
    const r = T.mark(off(TEE, 158, 0), info(green, { noOpen: true }));
    assert.equal(r.closed.counted, true);
    assert.equal(env.L.list({ golfer: 'Manny', club: '7i' }).length, 1, 'one record in the log');
    // gps-view's chipsClosed no longer calls HardPanGpsBag.add: the old bag has no 7-iron shot.
    const old = JSON.parse(env.store.hardpan_bag_v1 || '{"golfers":{}}');
    assert.ok(!(old.golfers['n:manny'] && old.golfers['n:manny'].shots && old.golfers['n:manny'].shots['7i']), 'nothing in the old bag');
    const m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.equal(m['7i'].n, 1, 'exactly 1 shot');
    assert.equal(m['7i'].yd, Math.round(env.SB.clubFit('Manny', '7i').stillAir), 'its still-air carry (no other number for the 7-iron)');
    assert.ok(m['7i'].yd > 158, '158 into a 10 mph wind from 47 (a part headwind) = longer in still air');
    assert.equal(env.B.source(m['7i']), 'learned');
});

test('a: the count is the log\'s even with a set-up / typed number; it never adds the old bag\'s shot list on top', { skip }, () => {
    const env = sandbox();
    env.B.setup('Manny', { '7i': 150, '8i': 140 });
    env.B.add('Manny', '8i', 141);                       // an older "which club?" shot (before 049)
    env.L.add({ golfer: 'Manny', club: '7i', carry: 158, windMph: 4, relAngle: 0 });
    let m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.deepEqual(plain(m['7i']), { yd: 150, n: 1, set: false, base: true }, 'one logged shot: the set-up number stays, 1 shot');
    assert.equal(m['8i'].n, 1, 'a club with no logged shots keeps the old bag as it was');
    env.L.add({ golfer: 'Manny', club: '8i', carry: 139, windMph: 3, relAngle: 0 });
    m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.equal(m['8i'].n, 1, 'the log\'s 1 - not the old 1 + the log\'s 1');
    env.B.set('Manny', '7i', 155);
    m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.deepEqual(plain(m['7i']), { yd: 155, n: 1, set: true }, 'typed wins, the count is the log\'s');
});

test('a: gps-view - a closed counted shot goes to the shot log only (no HardPanGpsBag.add anywhere)', { skip }, () => {
    const v = view();
    const fn = v.slice(v.indexOf('function chipsClosed('), v.indexOf('function chipsEnd('));
    assert.ok(fn.length > 50);
    assert.ok(!/\.add\(/.test(fn), 'chipsClosed does not add to the old bag');
    assert.ok(!/\bB\.add\(|HardPanGpsBag\.add\(/.test(v), 'no other caller adds a marked shot to the old bag');
});

// ---- b: no reading is not calm -------------------------------------------------------------
test('b: no wind reading at the mark -> windMph null, src null, no angle; still counts', { skip }, () => {
    for (const w of [null, { none: true, tempF: 70 }]) {
        const env = sandbox(), T = track(env), green = off(TEE, 200, 0);
        T.mark(TEE, info(green, { club: '6i', wind: w }));
        const r = T.mark(off(TEE, 170, 0), info(green, { noOpen: true }));
        assert.equal(r.closed.counted, true, 'it counts');
        const s = env.L.list({ golfer: 'Manny' })[0];
        assert.strictEqual(s.windMph, null, 'not 0');
        assert.strictEqual(s.src, null);
        assert.strictEqual(s.relAngle, null); assert.strictEqual(s.along, null); assert.strictEqual(s.across, null);
        assert.strictEqual(s.windFromDeg, null); assert.strictEqual(s.wxHour, null);
        assert.ok(s.bearingDeg >= 0, 'the line to the green is still known');
        if (w) assert.equal(s.tempF, 70, 'the temperature still kept');
    }
});

test('b: a no-reading shot feeds still-air carry only - never a wind point, never calm; Shot history says so', { skip }, () => {
    const env = sandbox(), { L, SB, WL } = env;
    // 8 windy 7-iron shots (qualified) + 1 calm + 1 with no reading.
    for (let i = 0; i < 8; i++) L.add({ golfer: 'Manny', club: '7i', carry: 150 - 1.5 * 10, windMph: 10, relAngle: 0, date: i + 1 });
    L.add({ golfer: 'Manny', club: '7i', carry: 151, windMph: 0, relAngle: 0, date: 20 });
    L.add({ golfer: 'Manny', club: '7i', carry: 149, windMph: null, date: 30 });
    L.add({ golfer: 'Manny', club: '7i', carry: 150, date: 31 });           // no wind field at all
    const shots = L.list({ golfer: 'Manny', club: '7i' });
    const f = WL.fit(shots);
    assert.equal(f.n, 11, 'every counted shot is a shot');
    assert.equal(f.noWind, 2, 'two with no reading');
    assert.equal(f.windyN, 8, 'not windy shots');
    assert.equal(f.skipped, 0);
    assert.ok(Math.abs(f.stillAir - 150) <= 1, 'still air uses them: ' + f.stillAir);
    // the fit is the same as without them (they are not wind data points)
    const g = WL.fit(shots.filter((s) => s.windMph !== null));
    assert.equal(f.head, g.head);
    // filters: not calm, no direction
    assert.equal(L.strengthOf(null), null);
    assert.deepEqual(L.list({ golfer: 'Manny', club: '7i', strength: 'calm' }).map((s) => s.carry), [151], 'calm = the real calm shot only');
    assert.equal(L.list({ golfer: 'Manny', club: '7i', dir: 'head' }).length, 8);
    // the words
    assert.equal(SB.windWords(null, null), 'no wind reading');
    assert.equal(SB.windWords(0, 0), 'calm');
    assert.equal(SB.stillAirOf(shots[0], 'Manny'), 150, 'its still-air number is its carry');
    // and the source of Shot history uses those words for each row
    const bag = read('gps-shot-bag.js');
    assert.ok(/windWords\(s\.windMph, s\.relAngle\)/.test(bag));
});

test('b: windmath - fit() puts a carry with no wind into noWind (n and still air), not skipped', { skip }, () => {
    const { WL } = sandbox();
    const f = WL.fit([{ carry: 150 }, null, { carry: -3, windMph: 4, relAngle: 0 }, { carry: 160, windMph: null }]);
    assert.equal(f.skipped, 2); assert.equal(f.noWind, 2); assert.equal(f.n, 2); assert.equal(f.windyN, 0);
    assert.equal(f.stillAir, 155);
});

// ---- c: one delete path, Reset ------------------------------------------------------------
test('c: one delete path - the chips\' second swipe handler is gone; Shot history removes through HardPanShotLog.remove once', { skip }, () => {
    const env = sandbox();
    assert.equal(env.C.swipeDelete, undefined, 'no second swipe path');
    assert.ok(!/data-shot-id/.test(read('gps-mark-chips.js').replace(/\/\/.*$/gm, '')), 'no data-shot-id rows handled');
    const bag = read('gps-shot-bag.js');
    const click = bag.slice(bag.indexOf('function histClick('), bag.indexOf('function histFill('));
    assert.equal((click.match(/\.remove\(/g) || []).length, 1, 'one remove call in the history');
    const touch = bag.slice(bag.indexOf("sh.addEventListener('touchstart'"), bag.indexOf('H = { ctx: ctx'));
    assert.ok(!/remove\(/.test(touch), 'a swipe only shows Delete; it never removes by itself');
    // remove once: the log shrinks by one, a second remove of the same id is a no-op
    const a = env.L.add({ golfer: 'Manny', club: '7i', carry: 150, windMph: 5, relAngle: 0 });
    env.L.add({ golfer: 'Manny', club: '7i', carry: 152, windMph: 5, relAngle: 0 });
    assert.equal(env.C.remove(a, 'Manny'), true);
    assert.equal(env.C.remove(a, 'Manny'), false);
    assert.equal(env.L.list({ golfer: 'Manny', club: '7i' }).length, 1);
});

test('c: Reset on a club with marked shots clears them and My bag goes back to the number it had', { skip }, () => {
    const env = sandbox(), T = track(env), green = off(TEE, 170, 0);
    env.B.setup('Manny', { '7i': 150 });
    for (const yd of [158, 160, 162]) { T.mark(TEE, info(green, { club: '7i' })); T.mark(off(TEE, yd, 0), info(green, { noOpen: true })); }
    let m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.equal(m['7i'].n, 3); assert.equal(m['7i'].log, true);
    // gps-view's Reset: the log has shots for the club -> HardPanShotLog.reset(club, golfer)
    assert.ok(/if \(SLr && SLr\.list\(\{ golfer: bagGolfer\(\), club: rc \}\)\.length\) SLr\.reset\(rc, bagGolfer\(\)\);/.test(view()));
    env.L.reset('7i', 'Manny');
    m = env.SB.mergeBag(env.B.bag('Manny'), 'Manny');
    assert.deepEqual(plain(m['7i']), { yd: 150, n: 0, set: false, base: true }, 'back to the set-up 150, no shots left anywhere');
});

// ---- d: kept ------------------------------------------------------------------------------
test('d: the chip row timing out only hides it - the pre-picked club still counts', { skip }, () => {
    const v = view();
    assert.ok(/S\.bagTimer = setTimeout\(function \(\) \{ if \(S\) bagHide\(\); \}, BAG_ASK_MS\);/.test(v), 'the timeout hides, nothing else');
    const hide = v.slice(v.indexOf('function bagHide('), v.indexOf('function bagSkip('));
    assert.ok(!/skip\(|discard\(/.test(hide), 'hiding never skips');
    const env = sandbox(), T = track(env), green = off(TEE, 170, 0);
    T.mark(TEE, info(green, { club: '8i' }));         // pre-picked, row never touched
    const r = T.mark(off(TEE, 141, 0), info(green, { noOpen: true }));
    assert.equal(r.closed.counted, true); assert.equal(r.closed.club, '8i');
});

test('d: a hole finished with no fix on the green closes the open shot at the green center', { skip }, () => {
    const v = view();
    assert.ok(/var end = pt \|\| T\.openGreen\(\);/.test(v), 'no fix: the green center');
    assert.ok(/if \(myScore\(op\.hole\) != null\) chipsEnd\(null, r\);/.test(v), 'a score closes it');
    const env = sandbox(), T = track(env), green = off(TEE, 165, 0);
    T.mark(TEE, info(green, { club: '7i' }));
    const c = T.close(T.openGreen(), null);
    assert.equal(c.counted, true);
    assert.equal(c.carry, 165, 'carry = the mark -> the green center');
    assert.equal(env.L.list({ golfer: 'Manny' })[0].carry, 165);
});
