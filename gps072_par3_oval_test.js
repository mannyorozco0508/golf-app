// 072: MY MISS ON PAR-3 TEE SHOTS (irons / wedges 4i-LW). Same oval math, same switch (off by
// default); woods, hybrids and driver on a par 3 stay off; par 4/5 unchanged (gps063 / gps052b).
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
    ['gps-shot-log.js', 'gps-miss-pattern.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, M: sb.HardPanMissPattern, store };
}
const BAG = { '7i': 178, '8i': 165, '9i': 152, PW: 140, GW: 125, SW: 105, LW: 85, '6i': 192, '5i': 205, '4i': 218, Dr: 285, '3w': 255, '5w': 235, Hy: 225 };
const P3 = { par: 3 };

test('072: par 3 + 7-iron off the tee -> the oval (same shape as an approach)', { skip }, () => {
    const { M } = sandbox();
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 176, fromTee: true }, P3), { ok: true, why: null });
    const f = M.oval('7i', 178, 'R');
    assert.ok(f && Math.abs(f.b - 8.0) < 0.05 && Math.abs(f.a - 11.6) < 0.05 && f.tilt === -25, 'same oval math');
});

test('072: par 3 + 4i, PW, LW (and every iron / wedge 4i-LW) off the tee -> the oval', { skip }, () => {
    const { M } = sandbox();
    ['4i', 'PW', 'LW'].forEach((c) => assert.deepEqual(M.shows({ club: c, carry: BAG[c], greenYd: BAG[c], fromTee: true }, P3), { ok: true, why: null }, c));
    ['4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'].forEach((c) => assert.equal(M.shows({ club: c, carry: BAG[c], greenYd: BAG[c], fromTee: true }, P3).ok, true, c));
});

test('072: par 3 + 3-wood, hybrid, 5-wood, driver off the tee -> no oval', { skip }, () => {
    const { M } = sandbox();
    ['3w', 'Hy', '5w', 'Dr', '4h', '3i'].forEach((c) => assert.deepEqual(M.shows({ club: c, carry: BAG[c] || 215, greenYd: BAG[c] || 215, fromTee: true }, P3), { ok: false, why: 'club' }, c));
    ['3w', 'Hy', 'Dr'].forEach((c) => assert.equal(M.oval(c, 230, 'R'), null, c));
});

test('072: par 3 keeps the other checks (range, layup, no carry)', { skip }, () => {
    const { M } = sandbox();
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 230, fromTee: true }, P3), { ok: false, why: 'range' });
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 178, fromTee: true, layup: true }, P3), { ok: false, why: 'layup' });
    assert.deepEqual(M.shows({ club: '7i', carry: null, greenYd: 178, fromTee: true }, P3), { ok: false, why: 'carry' });
});

test('072: par 4 / 5 / unknown par off the tee -> no oval, exactly as before', { skip }, () => {
    const { M } = sandbox();
    [{ par: 4 }, { par: 5 }, { par: null }, {}, undefined].forEach((ctx) =>
        assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 178, fromTee: true }, ctx), { ok: false, why: 'tee' }, JSON.stringify(ctx)));
    // Approaches on any hole: unchanged with or without the par.
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 175 }, { par: 4 }), { ok: true, why: null });
    assert.deepEqual(M.shows({ club: '7i', carry: 178, greenYd: 175 }, P3), { ok: true, why: null });
});

test('072: the switch is still OFF by default; off = the view draws nothing (par 3 included)', { skip }, () => {
    const { M } = sandbox();
    assert.equal(M.isOn('Sam'), false, 'off by default');
    const v = read('gps-view.js'), sync = v.slice(v.indexOf('    function missSync(r, o) {'), v.indexOf('    // The plays-like pill (layout D'));
    assert.ok(/if \(!M\.isOn\(bagGolfer\(\)\) \|\| !S\.map \|\| !S\.styleReady\) \{ missClear\(\); return; \}/.test(sync), 'off -> cleared before any plan');
    assert.ok(sync.indexOf('M.isOn(bagGolfer())') < sync.indexOf('missPlan(r, o)'), 'the switch is checked before the plan');
    assert.ok(/function missShown\(\) \{ return !!\(S && bagSwitch\(\) && !tournament\(\) && !readOnlyHere\(\)\); \}/.test(v), 'tournament / read-only still hide it');
});

test('072: the view passes the hole\'s par (par 3) into shows()', { skip }, () => {
    const v = read('gps-view.js'), plan = v.slice(v.indexOf('    function missPlan(r, o) {'), v.indexOf('    var MISS_SRC'));
    assert.ok(/M\.shows\(\{ club: club, carry: carry, greenYd: greenYd, fromTee: fromTee, layup: layup \}\);/.test(plan), 'the old call, unchanged (par 4/5)');
    assert.ok(/if \(!ok\.ok && ok\.why === 'tee' && isPar3\(\)\) ok = M\.shows\(\{ club: club, carry: carry, greenYd: greenYd, fromTee: fromTee, layup: layup \}, \{ par: 3 \}\);/.test(plan), 'par 3: the tee shot gets the same checks');
    assert.ok(/function isPar3\(\) \{/.test(v));
});

test('072: the (i) words say par-3 tee shots, still never from the tee on a par 4 or 5', { skip }, () => {
    const { M } = sandbox();
    const t = M.infoText();
    ['par-3 tee shot', 'never from the tee on a par 4 or 5', 'driver, woods or hybrids'].forEach((w) => assert.ok(t.includes(w), w + ' in: ' + t));
});
