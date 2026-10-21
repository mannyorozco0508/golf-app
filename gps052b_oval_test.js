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

test('the fit recovers a known synthetic tilt, size and centre (and holds about 2 of 3)', { skip }, () => {
    const { M } = sandbox();
    // Truth: side sd 9, long sd 5, axis tilted -30 deg (right comes back short), mean side +4, carry 152.
    const th = -30 * Math.PI / 180, A = 9, B = 5, shots = [];
    normals(4000, 7).forEach(([u, v]) => { const a = u * A, b = v * B; shots.push(shot(4 + a * Math.cos(th) - b * Math.sin(th), 152 + a * Math.sin(th) + b * Math.cos(th))); });
    const f = M.fit(shots, { club: '7i', hand: 'R' });
    assert.equal(f.own, true);
    assert.equal(f.label, null);
    near(f.tilt, -30, 2, 'tilt');
    near(f.a, M.K * A, M.K * A * 0.06, 'major semi-axis');
    near(f.b, M.K * B, M.K * B * 0.06, 'minor semi-axis');
    near(f.cx, 4, 0.5, 'mean side');
    near(f.carry, 152, 0.4, 'average carry');
    const inside = shots.filter((s) => M.inside(f, s.offline, s.carry)).length / shots.length;
    near(inside, 2 / 3, 0.03, 'about 2 of 3 inside');
    // And the mirror image (a left-to-right tilt) comes back as +30.
    const mir = shots.map((s) => shot(-s.offline, s.carry));
    near(M.fit(mir, { hand: 'R' }).tilt, 30, 2, 'mirrored data');
});

test('the wind is taken out first: a crosswind push and a headwind are not counted as his miss', { skip }, () => {
    const { M } = sandbox();
    // Straight 150-yd shots in still air; hit in 10 mph from the RIGHT (90 deg) they drift left by
    // 150 x 0.005 x 10 = 7.5 yds; hit into 10 mph of headwind they come up 1% x 150 x 10 = 15 short.
    const cross = M.point(shot(-7.5, 150, { windMph: 10, relAngle: 90, across: 10, along: 0 }));
    near(cross.x, 0, 0.01, 'the push from the right is added back');
    near(cross.carry, 150, 0.01, 'a pure crosswind changes no carry (generic)');
    const fromLeft = M.point(shot(7.5, 150, { windMph: 10, relAngle: 270, across: -10, along: 0 }));
    near(fromLeft.x, 0, 0.01, 'and from the left');
    const head = M.point(shot(0, 135, { windMph: 10, relAngle: 0, across: 0, along: 10 }));
    near(head.carry, 135 + 0.01 * 135 * 10, 0.01, 'headwind backed out (049 windTerm, generic)');
    assert.equal(M.point(shot(3, 150, { windMph: null, relAngle: null })).x, 3, 'no wind reading: as marked');
});

test('below 10 marked shots: the DEFAULT SHAPE, labelled, tilted right-short / left-long for a right-hander', { skip }, () => {
    const { M } = sandbox();
    const shots = [shot(5, 150), shot(-3, 154), shot(8, 147)];
    const f = M.fit(shots, { club: '7i', hand: 'R' });
    assert.equal(f.own, false);
    assert.equal(f.label, 'default shape');
    assert.equal(f.n, 3);
    assert.equal(f.tilt, -M.DEFAULT_TILT);
    near(f.carry, 150.33, 0.01, 'centred on the average carry');
    assert.equal(f.cx, 0, 'on the aim line');
    near(f.a, M.K * 0.045 * f.carry, 1e-9); near(f.b, M.K * 0.03 * f.carry, 1e-9);
    const ring = M.outline(f, 360);
    const right = ring.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ring.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(right[1] < f.carry - 2, 'right side pulled back (short): ' + right[1]);
    assert.ok(left[1] > f.carry + 2, 'left side pushed long: ' + left[1]);
    assert.equal(M.summary(f, '7-iron'), '7-iron: default shape · 3 of 10 marked shots');
    // No shots at all: My bag's carry centres it.
    const g = M.fit([], { club: '7i', hand: 'R', carry: 160 });
    assert.equal(g.carry, 160); assert.equal(g.label, 'default shape');
    assert.equal(M.fit([], { club: '7i' }), null, 'no carry at all: nothing to draw');
});

test('the left-hander\'s default shape is the mirror: left misses shorter, right misses longer', { skip }, () => {
    const { M } = sandbox();
    const R = M.fit([], { carry: 150, hand: 'R' }), Lf = M.fit([], { carry: 150, hand: 'L' });
    assert.equal(Lf.tilt, M.DEFAULT_TILT);
    const rr = M.outline(R, 360), ll = M.outline(Lf, 360);
    // The same ring with the side flipped: every right-hander point, mirrored, is on the lefty's outline.
    const onRing = (f, x, y) => { const t = f.tilt * Math.PI / 180, dx = x - f.cx, dy = y - f.carry, u = dx * Math.cos(t) + dy * Math.sin(t), w = -dx * Math.sin(t) + dy * Math.cos(t); return u * u / (f.a * f.a) + w * w / (f.b * f.b); };
    rr.forEach((p) => near(onRing(Lf, -p[0], p[1]), 1, 1e-9, 'mirrored point'));
    const right = ll.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ll.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(left[1] < 148 && right[1] > 152, 'lefty: left short, right long');
});

test('leaves out shots closed by finishing the hole, and old records with no miss', { skip }, () => {
    const { M } = sandbox();
    const ok = Array.from({ length: 10 }, (_, i) => shot(i % 2 ? 6 : -2, 150 + (i % 3)));
    const junk = [shot(40, 120, { endKind: 'hole-close', offline: null }), shot(40, 120, { endKind: 'hole-close', offline: 40 }),
        { club: '7i', carry: 120, windMph: 0, relAngle: 0 }];
    const f = M.fit(ok.concat(junk), { hand: 'R' });
    assert.equal(f.n, 10);
    assert.equal(f.own, true);
    near(f.carry, M.fit(ok, { hand: 'R' }).carry, 1e-9, 'hole-close carries do not move the centre');
});

test('the summary line: "7-iron: 70% right, 9 yds avg · right misses 6 yds short"', { skip }, () => {
    const { M } = sandbox();
    // 7 right (avg 11, all 6 short of the average carry), 3 left (avg 4.33, 14 long).
    const shots = [11, 11, 11, 11, 11, 11, 11].map((x) => shot(x, 144)).concat([-4, -4, -5].map((x) => shot(x, 164)));
    const f = M.fit(shots, { hand: 'R' });
    assert.equal(f.carry, 150);
    assert.equal(M.summary(f, '7-iron'), '7-iron: 70% right, 9 yds avg · right misses 6 yds short');
    assert.equal(M.summary(f, '7-iron', 'm'), '7-iron: 70% right, 8 m avg · right misses 5 m short');
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
    const f = M.fit(Array.from({ length: 12 }, (_, i) => shot((i % 5) - 2, 148 + (i % 4))), { club: '7i', hand: 'R' });
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
