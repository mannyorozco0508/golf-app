// URGENT-052 B stage 2: MY MISS - the miss oval per club (gps-miss-pattern.js), on My bag's club
// screen (gps-shot-bag.js) and as an off-by-default map layer (gps-view.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-miss-pattern.js'));
const skip = ON ? false : 'Consumer tree: no GPS';

function sandbox(store) {
    store = store || {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-shot-log.js', 'gps-wind-learn.js', 'gps-miss-pattern.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, M: sb.HardPanMissPattern, L: sb.HardPanShotLog, store };
}
// Seeded normal pairs.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }
function normals(n, seed) { const r = rng(seed), out = []; for (let i = 0; i < n; i++) { const u = r(), v = r(); const m = Math.sqrt(-2 * Math.log(u)); out.push([m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)]); } return out; }
const shot = (x, carry, extra) => Object.assign({ club: '7i', carry, windMph: 0, relAngle: 0, offline: x, aimKind: 'green-center', endKind: 'marked' }, extra || {});
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', want ' + b + ' +/- ' + tol);

// URGENT-063 (2026-10-22): the fitted oval ("learn after 10 shots"), the wind-out points, the
// "default shape" label and the "70% right" summary are gone - the oval comes only from My bag's
// average carry (gps063_oval_test.js pins the new shape). These 052 B tests were replaced:
//   - "the fit recovers a known synthetic tilt..."        -> removed (no fit)
//   - "the wind is taken out first..."                     -> removed (marked shots are not used)
//   - "below 10 marked shots: the DEFAULT SHAPE..."        -> the 063 shape, right short / left long
//   - "the left-hander's default shape is the mirror"      -> the 063 lefty mirror
//   - "leaves out shots closed by finishing the hole"      -> removed (marked shots are not used)
//   - "the summary line: 70% right..."                     -> the 063 My bag line
test('063: no marked-shot fit is left - the oval is My bag\'s carry only, right short / left long', { skip }, () => {
    const { M } = sandbox();
    ['fit', 'axes', 'defaultShape', 'summary', 'MIN_SHOTS', 'K'].forEach((k) => assert.equal(M[k], undefined, k + ' is gone'));
    const f = M.oval('7i', 150, 'R');
    assert.equal(f.tilt, -M.TUNE.TILT_DEG);
    assert.equal(f.cx, 0, 'on the aim line');
    const ring = M.outline(f, 360);
    const right = ring.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ring.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(right[1] < f.carry - 1, 'right side short: ' + right[1]);
    assert.ok(left[1] > f.carry + 1, 'left side long: ' + left[1]);
    assert.equal(M.oval('7i', null, 'R'), null, 'no carry: nothing to draw');
    // The left/right field on marked shots is still written (gps-mark-chips.js) - harmless, kept.
    assert.ok(/offline: ek === 'hole-close' \? null : offlineYd\(/.test(read('gps-mark-chips.js')));
});

test('063: the left-hander is the mirror (left short, right long)', { skip }, () => {
    const { M } = sandbox();
    const R = M.oval('7i', 150, 'R'), Lf = M.oval('7i', 150, 'L');
    assert.equal(Lf.tilt, M.TUNE.TILT_DEG);
    const ll = M.outline(Lf, 360);
    const onRing = (f, x, y) => { const t = f.tilt * Math.PI / 180, dx = x - f.cx, dy = y - f.carry, u = dx * Math.cos(t) + dy * Math.sin(t), w = -dx * Math.sin(t) + dy * Math.cos(t); return u * u / (f.a * f.a) + w * w / (f.b * f.b); };
    M.outline(R, 360).forEach((p) => near(onRing(Lf, -p[0], p[1]), 1, 1e-9, 'mirrored point'));
    const right = ll.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ll.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(left[1] < 149 && right[1] > 151, 'lefty: left short, right long');
});

test('063: the My bag line replaces the 052 B summary', { skip }, () => {
    const { M } = sandbox();
    assert.equal(M.bagLine('7-iron', 178, 'R', 'yd', '7i'), '7-iron \u00b7 178 \u00b7 miss right \u2248 5 short, miss left \u2248 5 long');
});

// URGENT-067 ("only add"): his marked shots still show - as dots on the club screen and the 052 B line -
// with the wind taken out first and hole-closed shots left out. They never shape the oval.
test('kept: the wind is taken out first; hole-closed shots and old records are left out', { skip }, () => {
    const { M } = sandbox();
    const cross = M.point(shot(-7.5, 150, { windMph: 10, relAngle: 90, across: 10, along: 0 }));
    near(cross.x, 0, 0.01, 'the push from the right is added back');
    near(cross.carry, 150, 0.01);
    const head = M.point(shot(0, 135, { windMph: 10, relAngle: 0, across: 0, along: 10 }));
    near(head.carry, 135 + 0.01 * 135 * 10, 0.01, 'headwind backed out');
    assert.equal(M.point(shot(40, 120, { endKind: 'hole-close' })), null);
    assert.equal(M.point({ club: '7i', carry: 120, windMph: 0, relAngle: 0 }), null);
    const st = M.shotStats([shot(5, 150), shot(40, 120, { endKind: 'hole-close' })]);
    assert.equal(st.n, 1);
});
test('kept: the line "7-iron: 70% right, 9 yds avg · right misses 6 yds short"', { skip }, () => {
    const { M } = sandbox();
    const shots = [11, 11, 11, 11, 11, 11, 11].map((x) => shot(x, 144)).concat([-4, -4, -5].map((x) => shot(x, 164)));
    const st = M.shotStats(shots);
    assert.equal(st.carry, 150);
    assert.equal(st.pts.length, 10);
    assert.equal(M.statsLine(st, '7-iron'), '7-iron: 70% right, 9 yds avg · right misses 6 yds short');
    assert.equal(M.statsLine(st, '7-iron', 'm'), '7-iron: 70% right, 8 m avg · right misses 5 m short');
    // ...and the oval does not move with them.
    assert.deepEqual(M.oval('7i', 178, 'R'), M.oval('7i', 178, 'R'));
    const v = read('gps-view.js'), plan = v.slice(v.indexOf('    function missPlan(r, o) {'), v.indexOf('    var MISS_SRC'));
    assert.ok(!/shotStats|point\(/.test(plan), 'the map oval never reads his shots');
});

test('My miss switch: OFF by default, remembered per golfer, on this phone only', { skip }, () => {
    const store = {};
    let { M } = sandbox(store);
    assert.equal(M.isOn('Ann Alpha'), false, 'off by default');
    assert.equal(M.isOn(''), false);
    M.setOn('Ann Alpha', true);
    assert.equal(M.isOn('Ann Alpha'), true);
    assert.equal(M.isOn('ann  alpha'), true, 'same golfer key as My bag / the shot log');
    assert.equal(M.isOn('Ben Bravo'), false, 'per golfer');
    ({ M } = sandbox(store));            // the app opened again
    assert.equal(M.isOn('Ann Alpha'), true, 'remembered');
    M.setOn('Ann Alpha', false);
    assert.equal(M.isOn('Ann Alpha'), false);
    assert.deepEqual(Object.keys(store), [M.KEY], 'one key, nothing else');
    assert.equal(store[M.KEY], '{}');
});

test('no coordinates: the module keeps none; the switch store and the fit are distances / labels only', { skip }, () => {
    const store = {}, { M } = sandbox(store);
    M.setOn('Ann Alpha', true);
    const f = M.oval('7i', 150, 'R');
    const txt = JSON.stringify(f) + JSON.stringify(store);
    assert.doesNotMatch(txt, /"(lat|lng|lon|latitude|longitude|p|pt|point|pos|position|coords?|aim|ring)"\s*:/i);
    const src = read('gps-miss-pattern.js');
    assert.ok(!/\bfetch\(|XMLHttpRequest|firebase|\.ref\(|sendBeacon/.test(src), 'nothing leaves the phone');
    // The view: the oval's positions live in memory (S.missRing) and are never written.
    const v = read('gps-view.js'), sec = v.slice(v.indexOf('// ---- URGENT-049: THE CLUB CHIPS'), v.indexOf('    function syncSuggest('));
    assert.ok(!/localStorage|\.ref\(|fetch\(|cacheWrite|HardPanShotLog\.add/.test(sec), 'the view stores nothing here');
});

test('map exactly as today when off: no source / layer / label unless the golfer\'s switch is on; no new map button', { skip }, () => {
    const v = read('gps-view.js');
    const a = v.indexOf('    function missSync(r, o) {'), b = v.indexOf('    function missRect() {');
    const fn = v.slice(a, b);
    // Every path that is not "on" clears and returns before anything is added.
    const add = fn.indexOf('addSource(');
    assert.ok(add > 0);
    assert.ok(fn.indexOf("if (!M.isOn(bagGolfer()) || !S.map || !S.styleReady) { missClear(); return; }") > 0 && fn.indexOf("if (!M.isOn(bagGolfer())") < add, 'the switch is checked before any add');
    assert.ok(fn.indexOf("if (!missShown() || S.mode !== 'measure' || S.side !== 'gps') { missClear(); return; }") > 0);
    assert.equal((v.match(/addSource\(MISS_SRC/g) || []).length, 1, 'one place adds it');
    assert.equal((v.match(/addLayer\(\{ id: 'mymiss-(fill|line)'/g) || []).length, 2, 'two layers, added in one place');
    // The style the map is built with has no My miss in it.
    const style = v.slice(v.indexOf("{ id: 'line-case'") - 4000, v.indexOf("{ id: 'line-case'") + 2000);
    assert.ok(!/mymiss/.test(style));
    // The toggles live in GPS tools (the old menu + the sheet) and My bag's club screen - not on the map.
    assert.ok(/class="gps-menu-item gps-mymiss-toggle" data-feature="clubs" style="display:none">My miss: Off</.test(v));
    assert.ok(/data-ts-row="mymiss"/.test(v) && /data-ts-sw="mymiss"/.test(v));
    assert.ok(/data-shist-miss/.test(read('gps-shot-bag.js')));
    assert.ok(!/gps-float[^'"]*mymiss|mymiss[^'"]*gps-float/.test(v), 'no floating map control');
    // The label is text, never a button: taps go through to the map.
    assert.ok(/e\.className = 'gps-miss-lbl'; e\.style\.pointerEvents = 'none'/.test(v));
    // Loaded with the shot scripts, and in every shell list.
    assert.ok(/loadScript\('gps-miss-pattern\.js'/.test(v));
    ['sw.js', 'sync-mobile-web.js', 'gps_wiring_test.js'].forEach((f) => assert.ok(read(f).includes('gps-miss-pattern.js'), f));
});
