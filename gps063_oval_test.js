// URGENT-063: MY MISS FROM HIS AVERAGE CARRIES (gps-miss-pattern.js) - the shape, the lefty
// mirror, when it shows (approach only, irons / wedges, green in range), the My bag line, the
// (i) words, the one tuning spot, the switch OFF by default, and no coordinates kept.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-miss-pattern.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', want ' + b + ' +/- ' + tol);

function sandbox(store) {
    store = store || {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, RegExp, Error, parseFloat, parseInt, console };
    sb.window = sb;
    vm.createContext(sb);
    ['gps-shot-log.js', 'gps-miss-pattern.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, M: sb.HardPanMissPattern, store };
}
// Manny's bag (URGENT-063).
const BAG = { '7i': 178, '8i': 165, '9i': 152, PW: 140, '6i': 192, '5i': 205, '4i': 218, Dr: 285, '3w': 255, Hy: 235 };

test('shape: a 178 7-iron is +/-8 deep, +/-11.6 wide, tilted 25 deg with the right side short', { skip }, () => {
    const { M } = sandbox();
    const f = M.oval('7i', 178, 'R');
    near(f.b, 8.0, 0.05, 'depth (half)');
    near(f.a, 11.6, 0.05, 'width (half)');
    assert.equal(f.tilt, -25, 'right-hander: the width axis goes right -> short');
    assert.equal(f.carry, 178, 'centred on the average carry');
    assert.equal(f.cx, 0, 'on the line to the target');
    // The outline: the right tip short of 178, the left tip long; 8 deep along the line at the centre.
    const ring = M.outline(f, 720);
    const right = ring.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ring.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(right[1] < 178 - 1, 'right side SHORT: ' + right[1]);
    assert.ok(left[1] > 178 + 1, 'left side LONG: ' + left[1]);
    const tipR = [f.a * Math.cos(-25 * Math.PI / 180), 178 + f.a * Math.sin(-25 * Math.PI / 180)];
    assert.ok(M.inside(f, tipR[0] * 0.999, 178 + (tipR[1] - 178) * 0.999) && !M.inside(f, tipR[0] * 1.01, 178 + (tipR[1] - 178) * 1.01), 'the right tip is on the outline');
    // Size scales with carry.
    const p = M.oval('PW', 140, 'R');
    near(p.b, 0.045 * 140, 1e-9); near(p.a, 0.065 * 140, 1e-9);
    assert.equal(p.tilt, -25);
});

test('the lefty mirror: left side short, right side long, same size', { skip }, () => {
    const { M } = sandbox();
    const R = M.oval('7i', 178, 'R'), L = M.oval('7i', 178, 'L');
    assert.equal(L.tilt, 25);
    assert.equal(L.a, R.a); assert.equal(L.b, R.b);
    const rr = M.outline(R, 360), ll = M.outline(L, 360);
    const onRing = (f, x, y) => { const t = f.tilt * Math.PI / 180, dx = x - f.cx, dy = y - f.carry, u = dx * Math.cos(t) + dy * Math.sin(t), w = -dx * Math.sin(t) + dy * Math.cos(t); return u * u / (f.a * f.a) + w * w / (f.b * f.b); };
    rr.forEach((q) => near(onRing(L, -q[0], q[1]), 1, 1e-9, 'every right-hander point, side flipped, is on the lefty outline'));
    const right = ll.reduce((a, p) => (p[0] > a[0] ? p : a)), left = ll.reduce((a, p) => (p[0] < a[0] ? p : a));
    assert.ok(left[1] < 177 && right[1] > 179, 'lefty: left short, right long');
});

test('no oval off the tee, for Driver / 3W / Hybrid, or on a layup with the green out of range', { skip }, () => {
    const { M } = sandbox();
    // The tee shot, even with a 7-iron at a green in range (a par 3).
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 178, fromTee: true }), { ok: false, why: 'tee' });
    // Woods, hybrid, driver - never.
    ['Dr', '3w', '5w', 'Hy'].forEach((c) => assert.deepEqual(M.shows({ club: c, carry: BAG[c] || 215, greenYd: BAG[c] || 215 }), { ok: false, why: 'club' }, c));
    ['Dr', '3w', '5w', 'Hy'].forEach((c) => assert.equal(M.oval(c, 250, 'R'), null, c));
    // A layup: a 7-iron with the green 300 out (out of range), or the target off the green.
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 300 }), { ok: false, why: 'range' });
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 120 }), { ok: false, why: 'range' }, 'way short of the carry');
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 178, layup: true }), { ok: false, why: 'layup' });
    // No carry in My bag: nothing.
    assert.deepEqual(M.shows({ club: '7i', carry: null, greenYd: 178 }), { ok: false, why: 'carry' });
});

test('shows for a 7-iron approach (green in range = carry +/- the margin)', { skip }, () => {
    const { M } = sandbox();
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 175 }), { ok: true, why: null });
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 178 + 17.7 }), { ok: true, why: null }, 'edge: +10%');
    assert.equal(M.shows({ club: '7i', carry: 178, greenYd: 178 + 18.2 }).ok, false, 'past the margin');
    assert.equal(M.margin(60), 12, 'a short wedge: never less than 12');
    ['4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'].forEach((c) => assert.equal(M.shows({ club: c, carry: 150, greenYd: 150 }).ok, true, c));
    // The view gates on exactly this (missPlan -> shows), the club from Mark shot or the green's suggestion.
    const v = read('gps-view.js'), plan = v.slice(v.indexOf('    function missPlan(r, o) {'), v.indexOf('    var MISS_SRC'));
    assert.ok(/M\.shows\(\{ club: club, carry: carry, greenYd: greenYd, fromTee: fromTee, layup: layup \}\)/.test(plan));
    assert.ok(/if \(mine && op\.club\) club = op\.club;/.test(plan), 'the club picked at Mark shot');
    assert.ok(/B\.suggestClub\((bag|bagMy), greenYd\)/.test(plan), 'else the club My bag suggests for the green');
    assert.ok(/var bag = bagNow\(B\)/.test(plan) && /carry = v && v\.yd > 0 \? v\.yd : null/.test(plan), 'the carry is My bag\'s number');
});

test('updates when My bag changes: the oval and the line follow the carry, nothing cached', { skip }, () => {
    const { M } = sandbox();
    const a = M.oval('7i', 178, 'R'), b = M.oval('7i', 190, 'R');
    assert.ok(b.a > a.a && b.b > a.b);
    assert.notEqual(M.bagLine('7-iron', 178, 'R', 'yd', '7i'), M.bagLine('7-iron', 190, 'R', 'yd', '7i'));
    // The view reads My bag every render (no cache key), and the club screen reads it NOW.
    const v = read('gps-view.js'), sync = v.slice(v.indexOf('    function missSync(r, o) {'), v.indexOf('    // The plays-like pill (layout D'));
    assert.ok(/var plan = missPlan\(r, o\)/.test(sync) && !/missKey ===|S\.missKey &&/.test(sync), 'worked out each render');
    assert.ok(/carryNow: function \(\) \{ var Bn = bagApi\(\), vn = Bn && S \? bagNow\(Bn\)\[hc\] : null;/.test(v), 'the club screen reads My bag now');
    assert.ok(/typeof c\.carryNow === 'function' \? c\.carryNow\(\) : c\.carry/.test(read('gps-shot-bag.js')));
    assert.ok(/MPl\.bagLine\(B\.NAMES\[c\], v\.yd,/.test(v), 'the My bag list line from My bag\'s number');
});

test('the My bag line text, per iron (Manny\'s bag)', { skip }, () => {
    const { M } = sandbox();
    const names = { '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron', '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge' };
    const want = { '4i': '4-iron · 218 · miss right ≈ 6 short, miss left ≈ 6 long', '5i': '5-iron · 205 · miss right ≈ 6 short, miss left ≈ 6 long',
        '6i': '6-iron · 192 · miss right ≈ 5 short, miss left ≈ 5 long', '7i': '7-iron · 178 · miss right ≈ 5 short, miss left ≈ 5 long',
        '8i': '8-iron · 165 · miss right ≈ 5 short, miss left ≈ 5 long', '9i': '9-iron · 152 · miss right ≈ 4 short, miss left ≈ 4 long',
        PW: 'Pitching wedge · 140 · miss right ≈ 4 short, miss left ≈ 4 long' };
    Object.keys(want).forEach((c) => assert.equal(M.bagLine(names[c], BAG[c], 'R', 'yd', c), want[c], c));
    // Computed from the same formula: the tips of the map's oval.
    const f = M.oval('7i', 178, 'R'), t = M.tips(f), ring = M.outline(f, 3600);
    const right = ring.reduce((a, p) => (p[0] * Math.cos(25 * Math.PI / 180) - (p[1] - 178) * Math.sin(25 * Math.PI / 180) > a[0] * Math.cos(25 * Math.PI / 180) - (a[1] - 178) * Math.sin(25 * Math.PI / 180) ? p : a));
    near(t.right, right[1] - 178, 0.01, 'the line is the oval\'s right tip');
    assert.equal(M.bagLine('7-iron', 178, 'L', 'yd', '7i'), '7-iron · 178 · miss left ≈ 5 short, miss right ≈ 5 long', 'lefty');
    assert.equal(M.bagLine('7-iron', 178, 'R', 'm', '7i'), '7-iron · 163 · miss right ≈ 4 short, miss left ≈ 4 long', 'meters');
    assert.equal(M.bagLine('Driver', 285, 'R', 'yd', 'Dr'), '', 'no line for Driver');
    // The view writes it on every iron / wedge row of My bag.
    assert.ok(/ml\.className = 'gps-bag-miss'; ml\.setAttribute\('data-bag-miss', c\)/.test(read('gps-view.js')));
});

test('the (i): the formula in plain words, from the one tuning block', { skip }, () => {
    const { M } = sandbox();
    const t = M.infoText();
    ['average carry', '4.5% of the carry long and short', '6.5% of the carry left and right', 'tilted 25°', 'right side sits short', 'left side sits long',
        'left-handed', 'A 178 7-iron: ±8 deep, ±11.6 wide', 'never from the tee', 'every club in My bag'].forEach((w) => assert.ok(t.includes(w), w + ' in: ' + t));
    // ONE place: the numbers live only in TUNE; changing it changes the shape, the line and the words.
    const src = read('gps-miss-pattern.js');
    assert.equal((src.match(/0\.045/g) || []).length, 1, '4.5% written once');
    assert.equal((src.match(/0\.065/g) || []).length, 1, '6.5% written once');
    assert.equal((src.match(/TILT_DEG: 25/g) || []).length, 1, '25 written once');
    M.TUNE.WIDTH_PCT = 0.08; M.TUNE.TILT_DEG = 30;
    near(M.oval('7i', 178, 'R').a, 14.24, 1e-9); assert.equal(M.oval('7i', 178, 'R').tilt, -30);
    assert.ok(M.infoText().includes('8% of the carry left and right') && M.infoText().includes('tilted 30°'));
    // The view shows it in the plays-like (i) sheet, and the club screen shows it too.
    const v = read('gps-view.js');
    assert.ok(/class="gps-plinfo-miss"/.test(v) && /MPi\.infoText\(\)/.test(v));
    assert.ok(/note\.textContent = MP\.infoText\(\)/.test(read('gps-shot-bag.js')));
    assert.ok(!/default shape/.test(v + read('gps-shot-bag.js') + src.replace(/^\s*\/\/.*$/mg, '')), 'no "default shape" label anywhere');
});

test('the My miss toggle defaults OFF (GPS tools > MAP), per golfer', { skip }, () => {
    const store = {}, { M } = sandbox(store);
    assert.equal(M.isOn('Manny Orozco'), false);
    assert.deepEqual(Object.keys(store), [], 'nothing written by reading');
    const v = read('gps-view.js');
    assert.ok(/data-ts-row="mymiss"/.test(v) && /data-ts-sec="maplayers"/.test(v));
    assert.ok(/class="gps-menu-item gps-mymiss-toggle" data-feature="clubs" style="display:none">My miss: Off</.test(v));
});

test('no coordinates are stored: the oval, the line and the store are distances only', { skip }, () => {
    const store = {}, { M } = sandbox(store);
    M.setOn('Manny Orozco', true);
    const f = M.oval('7i', 178, 'R');
    const txt = JSON.stringify(f) + JSON.stringify(store) + M.bagLine('7-iron', 178, 'R', 'yd', '7i');
    assert.doesNotMatch(txt, /"(lat|lng|lon|latitude|longitude|p|pt|point|pos|position|coords?|aim|ring)"\s*:/i);
    assert.deepEqual(Object.keys(store), [M.KEY]);
    const src = read('gps-miss-pattern.js');
    assert.ok(!/\bfetch\(|XMLHttpRequest|firebase|\.ref\(|sendBeacon/.test(src), 'nothing leaves the phone');
    const v = read('gps-view.js'), sec = v.slice(v.indexOf('    // ---- URGENT-052 B / URGENT-063: "MY MISS"'), v.indexOf('    function syncSuggest('));
    assert.ok(sec.length > 1000);
    assert.ok(!/localStorage|\.ref\(|fetch\(|cacheWrite|HardPanShotLog\.add|setItem/.test(sec), 'the view stores nothing here');
    // What the checks read (missNow) is distances only - the screen ring stays in memory.
    assert.ok(/S\.missOval = \{ club: f\.club, carry: f\.avg, along: f\.carry, a: f\.a, b: f\.b, tilt: f\.tilt, hand: f\.hand \}/.test(v));
});

test('the centre: where that carry lands today (plays-like), size from the carry; TUNE.PLAYS_CENTER off = the plain carry', { skip }, () => {
    const { M } = sandbox();
    // A 180 5-iron, 163 to the green playing 172 (into the wind): the centre at 180 x 163 / 172 = 170.6.
    near(M.centreAt(180, 163, 172), 170.58, 0.01);
    const f = M.oval('5i', 180, 'R', M.centreAt(180, 163, 172));
    near(f.carry, 170.58, 0.01, 'centre'); assert.equal(f.avg, 180);
    near(f.a, 0.065 * 180, 1e-9, 'width from the carry'); near(f.b, 0.045 * 180, 1e-9, 'depth from the carry');
    assert.equal(M.centreAt(178, 175, null), 178, 'no plays-like: the carry');
    near(M.centreAt(178, 100, 200), 178 * 0.85, 1e-9, 'never more than 15%');
    M.TUNE.PLAYS_CENTER = false;
    assert.equal(M.centreAt(180, 163, 172), 180, 'switched off: the plain carry');
});
