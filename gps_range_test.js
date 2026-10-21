// ============================================================================
// HARDPAN GPS - RANGE MODE (URGENT-047 part A)
//
// gps-range.js HardPanRange with gps-shots.js HardPanGpsBag in a sandbox (the phone's
// storage only): the average and the longest per club, the shape "Update my bag" writes
// (My bag's own set map - what a number typed in My bag writes), sessions, and THE GUARD:
// no latitude / longitude / position is ever stored, nothing is sent.
// urgent047_range_chrome_test.js runs the whole screen in Chrome with a stand-in GPS.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-range.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array, setTimeout };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-shots.js'), sb);
    vm.runInContext(read('gps-range.js'), sb);
    return { R: sb.HardPanRange, B: sb.HardPanGpsBag, G: sb.HardPanGeo, store };
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('the session: average (the median, rounded) and longest carry per club, in bag order', { skip }, () => {
    const { R } = sandbox();
    assert.deepEqual(plain(R.summarize([])), []);
    const shots = [{ c: '7i', yd: 150 }, { c: 'Dr', yd: 240 }, { c: '7i', yd: 155 }, { c: 'Dr', yd: 251 }, { c: '7i', yd: 148 }, { c: 'Dr', yd: 236 }];
    assert.deepEqual(plain(R.summarize(shots)), [
        { club: 'Dr', name: 'Driver', n: 3, avg: 240, longest: 251 },     // median of 236, 240, 251
        { club: '7i', name: '7-iron', n: 3, avg: 150, longest: 155 }]);   // median of 148, 150, 155
    assert.equal(R.summarize([{ c: 'PW', yd: 100 }, { c: 'PW', yd: 101 }])[0].avg, 101, 'median of two = 100.5, rounds up');
    // junk left out: unknown club, no yards, out of range
    assert.deepEqual(plain(R.summarize([{ c: 'XX', yd: 150 }, { c: '9i', yd: 'x' }, { c: '9i', yd: 0 }, { c: '9i', yd: 900 }, { c: '9i', yd: 130 }])),
        [{ club: '9i', name: '9-iron', n: 1, avg: 130, longest: 130 }]);
});

test('Update my bag: { club: average } into My bag\'s set map - the shape a typed number writes', { skip }, () => {
    const { R, B, store } = sandbox();
    const sum = R.summarize([{ c: '7i', yd: 150 }, { c: '7i', yd: 155 }, { c: '7i', yd: 148 }, { c: 'Dr', yd: 240 }, { c: 'Dr', yd: 251 }, { c: 'Dr', yd: 236 }]);
    assert.deepEqual(plain(R.bagUpdate(sum)), { Dr: 240, '7i': 150 });
    // Manny's bag already has a learned 7-iron and a setup Driver: the range averages win (a typed number wins).
    B.add('Manny Orozco', '7i', 160); B.add('Manny Orozco', '7i', 162); B.add('Manny Orozco', '7i', 161);
    B.setup('Manny Orozco', { Dr: 230, '9i': 130 });
    const done = R.applyToBag(B, 'Manny Orozco', sum);
    assert.deepEqual(plain(done), { Dr: 240, '7i': 150 });
    const bag = plain(B.bag('Manny Orozco'));
    assert.equal(bag.Dr.yd, 240); assert.equal(bag.Dr.set, true);
    assert.equal(bag['7i'].yd, 150); assert.equal(bag['7i'].set, true);
    assert.equal(bag['9i'].yd, 130, 'clubs not hit at the range are left alone');
    assert.equal(B.source(bag.Dr), 'entered');
    // The record is exactly My bag's own: golfers['n:manny orozco'].set = { Dr: 240, 7i: 150 }; shots and base untouched.
    const rec = JSON.parse(store[B.KEY]).golfers['n:manny orozco'];
    assert.deepEqual(rec.set, { Dr: 240, '7i': 150 });
    assert.deepEqual(rec.shots, { '7i': [160, 162, 161] });
    assert.deepEqual(rec.base, { Dr: 230, '9i': 130 });
    // The account-sync shape (switched off today) carries them as it carries a typed number.
    assert.deepEqual(plain(B.syncShape('Manny Orozco')).set, { Dr: 240, '7i': 150 });
    // Another golfer's bag is not touched.
    assert.deepEqual(plain(B.bag('Ann Alpha')), {});
});

test('sessions: shots kept with their club; undo; New session; a new day starts a new one', { skip }, () => {
    const { R } = sandbox();
    const t0 = Date.UTC(2026, 9, 21, 15, 0, 0);
    assert.equal(R.current('Manny', t0), null);
    assert.equal(R.addShot('Manny', 'Dr', 240, 'gps', t0).c, 'Dr');
    R.addShot('Manny', '7i', 150, 'typed', t0 + 60000);
    assert.equal(R.current('Manny', t0 + 120000).shots.length, 2);
    assert.deepEqual(plain(R.current('Manny', t0 + 120000).shots.map((s) => [s.c, s.yd, s.by])), [['Dr', 240, 'gps'], ['7i', 150, 'typed']]);
    assert.equal(R.addShot('Manny', 'ZZ', 150, 'gps', t0), null, 'no such club');
    assert.equal(R.addShot('Manny', '7i', 0, 'gps', t0), null, 'no yards');
    assert.equal(R.addShot('Manny', '7i', 450, 'gps', t0), null, 'over 449');
    R.undo('Manny');
    assert.equal(R.sessions('Manny')[0].shots.length, 1);
    R.newSession('Manny');
    assert.equal(R.current('Manny', t0 + 180000), null, 'closed');
    R.addShot('Manny', 'PW', 110, 'gps', t0 + 200000);
    assert.equal(R.sessions('Manny').length, 2);
    R.addShot('Manny', 'PW', 112, 'gps', t0 + 200000 + R.SESSION_GAP_MS + 1);
    assert.equal(R.sessions('Manny').length, 3, 'hours later: a new session');
    assert.equal(R.sessions('Ann').length, 0, 'per golfer');
});

test('carry from two GPS readings: whole yards; the readings are not kept', { skip }, () => {
    const { R, G } = sandbox();
    const a = [33.46, -111.96], b = G.destination(a, 30, 152 * 0.9144);
    assert.equal(R.carryYds(a, b), 152);
    assert.equal(R.carryYds(null, b), null);
});

test('GUARD: no latitude / longitude / position is ever stored, and nothing is sent', { skip }, () => {
    const { R, B, G, store } = sandbox();
    const a = [33.462817, -111.958331], pts = [a];
    // A whole session the way the screen does it: two readings -> yards -> the shot.
    [['Dr', 241], ['Dr', 250], ['Dr', 238], ['7i', 151], ['7i', 149], ['7i', 156]].forEach(([c, yd], i) => {
        const land = G.destination(a, 10 * i, yd * 0.9144); pts.push(land);
        R.addShot('Manny', c, R.carryYds(a, land), 'gps');
    });
    R.addShot('Manny', '9i', 130, 'typed');
    R.applyToBag(B, 'Manny', R.summarize(R.current('Manny').shots));
    const all = JSON.stringify(store);
    assert.ok(/"c":"Dr"/.test(store[R.KEY]) && /"Dr":24\d/.test(store[B.KEY]), 'positive: the session and the bag were written');
    pts.flat().forEach((x) => {
        assert.ok(!all.includes(String(x.toFixed(3))), 'a coordinate in storage: ' + x.toFixed(3));
        assert.ok(!all.includes(String(Math.trunc(x * 100) / 100)), 'a coordinate in storage: ' + x);
    });
    const walk = (v, where, bad) => { if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (/^(lat|lng|lon|latitude|longitude|pt|p|coords|pos|position|point|start|land|from|to)$/i.test(k)) bad.push(where + '.' + k); walk(v[k], where + '.' + k, bad); }); return bad; };
    assert.deepEqual(walk(JSON.parse(store[R.KEY]), 'range', []), []);
    R.sessions('Manny').forEach((s) => s.shots.forEach((x) => assert.deepEqual(Object.keys(x).sort(), ['at', 'by', 'c', 'yd'])));
    // The source: no network, no database, and the reading is dropped after the yards are worked out.
    const src = read('gps-range.js').replace(/\/\/.*$/gm, '');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|firebase|\.ref\s*\(|WebSocket/.test(src), 'nothing is sent');
    assert.ok(/st\.start = null; pos = null;/.test(src), 'both readings dropped after the carry');
    assert.ok(!/setItem\([^)]*start/.test(src) && !/start[^;]*lsSet/.test(src), 'the first reading never reaches storage');
});

test('wiring: GPS tools > Range (menu item + Tools tile), loaded on first use, in the shell lists', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(v.includes("'<button type=\"button\" class=\"gps-menu-item gps-range\" data-feature=\"clubs\">Range</button>'"), 'the menu item, under the clubs switch');
    assert.ok(v.includes("['.gps-range', '🎯', 'Range']"), 'the Tools sheet tile');
    assert.ok(/loadScript\('gps-range\.js'/.test(v), 'loaded on first use');
    assert.ok(/HardPanRange\.open\(\{ el: S\.el, golfer: bagGolfer\(\)/.test(v), 'the same golfer as My bag');
    assert.ok(!/gps-range/.test(read('home.html')), 'Home is unchanged');
    assert.ok(!/gps-range/.test(read('index.html')), 'not loaded at boot');
    assert.ok(read('sw.js').includes("'./gps-range.js'"), 'cached for offline');
    const sm = read('sync-mobile-web.js');
    assert.equal((sm.match(/'gps-range\.js'/g) || []).length, 2, 'in CONSUMER_SHELL (GPS block) and GPS_SHELL');
});
