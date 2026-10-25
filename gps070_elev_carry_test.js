// ============================================================================
// 070 PART 4 - THE LEARNED-CARRY DOUBLE COUNT (gps-shot-log / gps-wind-learn / gps-shot-bag /
// gps-mark-chips / gps-view wiring).
//
// Before 070 a shot marked at a 1,200 ft course was a 1,200 ft carry, and it replaced the
// sea-level number in My bag; plays-like then took the altitude out a second time. Now each
// logged shot keeps the COURSE's height (cft, a course number - never a position) and My bag's
// learned carry is brought to the golfer's baseline: carry / altFactor(cft, baselineFt), with
// the wind taken out first. Old shots (no cft) are used as marked.
// NEGATIVE CONTROL: the "1,200 ft -> sea level" tests fail on bb3a20a1 (no cft is kept, no
// altFactor): they give 155, not 152.3.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-shot-log.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-geo.js', 'gps-shots.js', 'gps-shot-log.js', 'gps-wind-learn.js', 'gps-shot-bag.js', 'gps-mark-chips.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, G: sb.HardPanGeo, L: sb.HardPanShotLog, WL: sb.HardPanWindLearn, SB: sb.HardPanShotBag, B: sb.HardPanGpsBag, C: sb.HardPanMarkChips, store };
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` got ${a}, want ${b} +/- ${tol}`);
const GOLFER = 'Ann Alpha';
let t0 = Date.UTC(2026, 9, 25, 15, 0);
function addShots(L, n, o) {
    for (let i = 0; i < n; i++) assert.ok(L.add(Object.assign({ golfer: GOLFER, club: '7i', carry: 155, windMph: null, course: 'Test Elevation Golf Club', hole: 1 + i, date: (t0 += 60000) }, o || {})));
}

test('altFactor: 1 + 0.015 x (course - baseline) / 1000; 1,200 ft vs sea level = 1.018', { skip }, () => {
    const { G } = sandbox();
    assert.equal(typeof G.altFactor, 'function');
    near(G.altFactor(1200, 0), 1.018, 1e-12);
    assert.equal(G.altFactor(1200, 1200), 1);
    near(G.altFactor(0, 1200), 0.982, 1e-12);
    assert.equal(G.altFactor(null, 0), 1, 'no height: as marked');
    assert.equal(G.altFactor(1200, null), 1);
});

test('DOUBLE COUNT (negative control on bb3a20a1): 155 marked at 1,200 ft -> 152.3 at a sea-level baseline', { skip }, () => {
    const { L, SB, B } = sandbox();
    B.setBaseline(GOLFER, { mode: 'sea' });
    addShots(L, 3, { cft: 1200, cftSrc: 'usgs' });
    const f = SB.fits(GOLFER)['7i'];
    assert.equal((155 / 1.018).toFixed(1), '152.3', 'the worked example');
    assert.equal(f.stillAir.toFixed(1), '152.3', 'learned still-air carry at the baseline');
    assert.equal(SB.mergeBag(B.bag(GOLFER), GOLFER)['7i'].yd, 152, 'My bag (whole yards)');
});

test('a Custom 1,200 ft baseline: no change (155 stays 155)', { skip }, () => {
    const { L, SB, B } = sandbox();
    B.setBaseline(GOLFER, { mode: 'course', name: 'Custom', ft: 1200 });
    addShots(L, 3, { cft: 1200, cftSrc: 'tile' });
    assert.equal(SB.fits(GOLFER)['7i'].stillAir, 155);
    assert.equal(SB.mergeBag(B.bag(GOLFER), GOLFER)['7i'].yd, 155);
});

test('old shots with no course height are unchanged (sea-level baseline); Shot history says so', { skip }, () => {
    const { L, SB, B } = sandbox();
    B.setBaseline(GOLFER, { mode: 'sea' });
    addShots(L, 3);   // no cft: logged before 070
    assert.equal(SB.fits(GOLFER)['7i'].stillAir, 155);
    assert.equal(SB.mergeBag(B.bag(GOLFER), GOLFER)['7i'].yd, 155);
    // mixed: 3 old (155, used as marked) + 2 at 1,200 ft (155 -> 152.26): median of 5 = 155
    addShots(L, 2, { cft: 1200, cftSrc: 'course' });
    assert.equal(SB.fits(GOLFER)['7i'].stillAir, 155);
    const src = read('gps-shot-bag.js');
    assert.match(src, /gps-shist-noft/, 'the Shot history note line');
    assert.match(src, /with no course height saved \(older, or no height for that course\): used as marked, at that course\./);
});

test('"Don\'t adjust" (no baseline): every shot as marked, exactly as before', { skip }, () => {
    const { L, SB, B } = sandbox();
    // 070 integration: a golfer who never chose is on Sea level now (part 3) - "Don't adjust" is picked here.
    B.setBaseline(GOLFER, { mode: 'none' });
    addShots(L, 3, { cft: 1200, cftSrc: 'usgs' });
    assert.equal(B.baseline(GOLFER).mode, 'none');
    assert.equal(SB.fits(GOLFER)['7i'].stillAir, 155);
});

test('070 integration: a golfer who NEVER chose is on Sea level (part 3), so their 1,200 ft shots learn at sea level', { skip }, () => {
    const { L, SB, B } = sandbox();
    addShots(L, 3, { cft: 1200, cftSrc: 'usgs' });
    assert.equal(B.baseline(GOLFER).mode, 'sea');
    assert.equal(SB.fits(GOLFER)['7i'].stillAir.toFixed(1), '152.3');
});

test('a new baseline re-learns at once (the cache knows the baseline)', { skip }, () => {
    const { L, SB, B } = sandbox();
    B.setBaseline(GOLFER, { mode: 'none' });
    addShots(L, 3, { cft: 1200, cftSrc: 'usgs' });
    assert.equal(SB.fits(GOLFER)['7i'].stillAir, 155);
    B.setBaseline(GOLFER, { mode: 'sea' });
    assert.equal(SB.fits(GOLFER)['7i'].stillAir.toFixed(1), '152.3');
});

test('wind first, then altitude: (carry + wind term at the course) / 1.018', { skip }, () => {
    const { L, SB, WL, B } = sandbox();
    B.setBaseline(GOLFER, { mode: 'sea' });
    // 10 mph straight into the golfer, generic model (too few windy shots to learn).
    L.add({ golfer: GOLFER, club: '7i', carry: 150, windMph: 10, relAngle: 0, cft: 1200, cftSrc: 'usgs', date: (t0 += 60000) });
    const wt = WL.windTerm(150, 10, 0, null, 'R').yards;
    assert.ok(wt > 0, 'a headwind cost carry');
    // (The generic wind is a percentage of the carry, so for it both orders give the same number;
    // the order matters for learned yd/mph numbers - next test.)
    const want = (150 + wt) / 1.018;
    near(SB.fits(GOLFER)['7i'].stillAir, want, 1e-9, 'wind out at the course carry, then to the baseline');
    // Shot history's per-shot "still air" is still the wind-only number at that course (unchanged).
    near(SB.stillAirOf(L.list({ golfer: GOLFER })[0], GOLFER), 150 + wt, 1e-9);
    near(SB.atBaseline(150 + wt, L.list({ golfer: GOLFER })[0], GOLFER), want, 1e-9);
});

test('learned wind numbers are unchanged by the altitude; still air comes out at the baseline', { skip }, () => {
    const K = { head: -1.2, tail: 0.7, left: -0.5, right: -0.3 };
    const fitWith = (cft) => {
        const { L, SB, WL, B } = sandbox();
        B.setBaseline(GOLFER, { mode: 'sea' });
        let s = 7;
        const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 40; i++) {
            const rel = r() * 360, mph = 6 + r() * 14, c = WL.components(mph, rel);
            const carry = 150 * 1.018 + K.head * c.head + K.tail * c.tail + K.left * c.fromLeft + K.right * c.fromRight;
            L.add(Object.assign({ golfer: GOLFER, club: '7i', carry, windMph: mph, relAngle: rel, date: (t0 += 60000) }, cft ? { cft, cftSrc: 'usgs' } : {}));
        }
        const f = SB.fits(GOLFER)['7i'];
        if (cft) {
            // the wrong order (altitude first, then the learned wind) gives another number
            const shots = L.list({ golfer: GOLFER }), med = (a) => { a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
            const right = med(shots.map((q) => (q.carry + WL.windTerm(q.carry, q.windMph, q.relAngle, f, 'R').yards) / 1.018));
            const wrong = med(shots.map((q) => q.carry / 1.018 + WL.windTerm(q.carry, q.windMph, q.relAngle, f, 'R').yards));
            near(f.stillAir, right, 1e-9, 'wind first, then altitude');
            assert.ok(Math.abs(f.stillAir - wrong) > 0.01, 'not altitude first (' + f.stillAir + ' vs ' + wrong + ')');
        }
        return f;
    };
    const a = fitWith(1200), b = fitWith(null);
    assert.ok(a.qualified && b.qualified);
    ['head', 'tail', 'left', 'right'].forEach((k) => near(a[k], b[k], 1e-9, k + ' unchanged'));
    near(a.stillAir, b.stillAir / 1.018, 1e-9, 'the same still air, brought to sea level');
    near(a.stillAir, 150, 1.5, 'the true sea-level carry');
});

test('the stored shot keeps the course height only - never a coordinate, never coords.altitude; phone estimate not kept', { skip }, () => {
    const { L, C, G } = sandbox();
    const tee = [33.45, -111.95], green = [33.4514, -111.95], ball = [33.4513, -111.9501];
    const T = C.create({ dist: G.haversineMeters, bearing: G.bearingDeg, now: () => (t0 += 60000) });
    const inf = { hole: 2, green, wind: { mph: 0, fromDeg: 0 }, elevFt: 1200, course: 'Test Elevation Golf Club', golfer: GOLFER, club: '7i',
        courseFt: 1200, courseFtSrc: 'usgs', coords: { latitude: 33.45, longitude: -111.95, altitude: 1187 }, lat: 33.45, lng: -111.95, altitude: 1187 };
    T.mark(tee, inf);
    const res = T.mark(ball, Object.assign({}, inf, { noOpen: true }));
    assert.ok(res.closed && res.closed.counted);
    const s = L.list({ golfer: GOLFER })[0];
    assert.equal(s.cft, 1200); assert.equal(s.cftSrc, 'usgs');
    const json = JSON.stringify(s);
    assert.doesNotMatch(json, /"(lat|lng|lon|latitude|longitude|altitude|coords|p|pt|point|pos|position|green)"/i);
    assert.doesNotMatch(json, /33\.45|111\.95|1187/);
    // clean() itself: a 'phone' (or unknown) source is dropped; coords never pass.
    const ph = L.clean({ club: '7i', carry: 150, cft: 1180, cftSrc: 'phone', coords: { altitude: 1180 }, altitude: 1180 });
    assert.equal(ph.cft, undefined); assert.equal(ph.cftSrc, undefined); assert.equal(ph.altitude, undefined); assert.equal(ph.coords, undefined);
    assert.equal(L.clean({ club: '7i', carry: 150, cft: 1180 }).cft, undefined, 'no source = not kept');
    assert.equal(L.clean({ club: '7i', carry: 150, cft: 1180.4, cftSrc: 'tile' }).cft, 1180);
});

test('gps-view: the logged height is courseElevNow() (course sources only), never coords.altitude; nothing new is sent', { skip }, () => {
    const v = read('gps-view.js');
    const body = (name) => { const i = v.indexOf('function ' + name + '('); assert.ok(i > 0, name); return v.slice(i, v.indexOf('\n    }\n', i)); };
    assert.match(v, /var LOG_FT_SRCS = \['course', 'usgs', 'tile'\];/);
    // courseElevNow (Part 1) may fall back to the phone's own estimate ('phone'); that one is never logged.
    assert.doesNotMatch(body('courseFtForLog'), /coords|altitude|fetch|firebase|phone/i);
    assert.match(body('courseFtForLog'), /courseElevNow\(\)/);
    assert.match(body('chipsMark'), /courseFtForLog\(\)/);
    // the log stays on the phone: its sync hook is still a no-op
    assert.match(read('gps-shot-log.js'), /function syncSaveSoon\(\) \{ \/\* phone only \(see above\) \*\/ \}/);
});
