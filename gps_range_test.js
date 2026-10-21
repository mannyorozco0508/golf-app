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
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } };
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
        { club: 'Dr', name: 'Driver', n: 3, good: 3, mis: 0, avg: 240, longest: 251 },     // median of 236, 240, 251
        { club: '7i', name: '7-iron', n: 3, good: 3, mis: 0, avg: 150, longest: 155 }]);   // median of 148, 150, 155
    assert.equal(R.summarize([{ c: 'PW', yd: 100 }, { c: 'PW', yd: 101 }])[0].avg, 101, 'median of two = 100.5, rounds up');
    // junk left out: unknown club, no yards, out of range
    assert.deepEqual(plain(R.summarize([{ c: 'XX', yd: 150 }, { c: '9i', yd: 'x' }, { c: '9i', yd: 0 }, { c: '9i', yd: 900 }, { c: '9i', yd: 130 }])),
        [{ club: '9i', name: '9-iron', n: 1, good: 1, mis: 0, avg: 130, longest: 130 }]);
});

test('GOOD / MISHIT: the median and the longest are of good shots only; the line per club', { skip }, () => {
    const { R } = sandbox();
    // Driver: 5 good (236, 238, 241, 245, 250) + 2 mishits (180 chunk, 290 - a mishit that ran out further still)
    const shots = [{ c: 'Dr', yd: 236 }, { c: 'Dr', yd: 180, mis: true }, { c: 'Dr', yd: 241 }, { c: 'Dr', yd: 250 }, { c: 'Dr', yd: 290, mis: true },
        { c: 'Dr', yd: 238 }, { c: 'Dr', yd: 245 }, { c: '7i', yd: 120, mis: true }, { c: '7i', yd: 95, mis: true }];
    const sum = plain(R.summarize(shots));
    assert.deepEqual(sum, [
        { club: 'Dr', name: 'Driver', n: 7, good: 5, mis: 2, avg: 241, longest: 250 },   // 290 was a mishit: not the longest
        { club: '7i', name: '7-iron', n: 2, good: 0, mis: 2, avg: null, longest: null }]);
    assert.equal(R.clubLine(sum[0]), 'Driver · 5 good / 2 mishits · 241 (median of good)');
    assert.equal(R.clubLine(sum[1]), '7-iron · 0 good / 2 mishits · no good shots yet');
    assert.equal(R.clubLine(plain(R.summarize([{ c: 'PW', yd: 100 }, { c: 'PW', yd: 60, mis: true }]))[0]), 'Pitching wedge · 1 good / 1 mishit · 100 (median of good)');
    assert.equal(R.clubLine(sum[0], (y) => Math.round(y * 0.9144)), 'Driver · 5 good / 2 mishits · 220 (median of good)', 'meters');
    // Only mis === true is a mishit: OLD records (no flag) and junk flags count as good.
    assert.deepEqual(plain(R.summarize([{ c: '9i', yd: 130 }, { c: '9i', yd: 140, mis: false }, { c: '9i', yd: 150, mis: 'yes' }]))[0],
        { club: '9i', name: '9-iron', n: 3, good: 3, mis: 0, avg: 140, longest: 150 });
});

test('GOOD / MISHIT: mishits never reach "Update my bag"; a club with 0 good shots is not written', { skip }, () => {
    const { R, B, store } = sandbox();
    B.setup('Manny', { '7i': 152 });
    const sum = R.summarize([{ c: 'Dr', yd: 240 }, { c: 'Dr', yd: 300, mis: true }, { c: 'Dr', yd: 150, mis: true }, { c: 'Dr', yd: 250 },
        { c: '7i', yd: 110, mis: true }]);
    assert.deepEqual(plain(R.bagUpdate(sum)), { Dr: 245 }, 'median of the two good drives; no 7-iron');
    assert.deepEqual(plain(R.applyToBag(B, 'Manny', sum)), { Dr: 245 });
    const rec = JSON.parse(store[B.KEY]).golfers['n:manny'];
    assert.deepEqual(rec.set, { Dr: 245 });
    assert.deepEqual(rec.base, { '7i': 152 }, 'the 7-iron (all mishits) left as it was');
    assert.deepEqual(plain(R.bagUpdate(R.summarize([{ c: 'SW', yd: 60, mis: true }]))), {}, 'nothing to write');
});

test('GOOD / MISHIT: flipping a shot (stored as mis: true, Good = no flag); old sessions still read', { skip }, () => {
    const { R, store } = sandbox();
    const t0 = Date.now();
    R.addShot('Manny', 'Dr', 240, 'gps', t0);
    R.addShot('Manny', 'Dr', 180, 'typed', t0 + 1000);
    R.addShot('Manny', 'Dr', 250, 'typed', t0 + 2000);
    const shots = () => plain(R.current('Manny').shots);
    assert.ok(shots().every((x) => !('mis' in x)), 'Good by default: no flag');
    assert.equal(R.flip('Manny', 1).mis, true);
    assert.deepEqual(shots()[1], { c: 'Dr', yd: 180, by: 'typed', at: t0 + 1000, mis: true });
    assert.equal(R.summarize(R.current('Manny').shots)[0].avg, 245, 'the 180 left out');
    R.flip('Manny', 1);
    assert.ok(!('mis' in shots()[1]), 'flipped back to Good: the flag removed');
    assert.equal(R.summarize(R.current('Manny').shots)[0].avg, 240);
    R.setMishit('Manny', 2, true); R.setMishit('Manny', 2, true);
    assert.equal(shots()[2].mis, true, 'setMishit is not a toggle');
    assert.equal(R.flip('Manny', 9), null, 'no such shot');
    assert.equal(R.flip('Ann', 0), null, 'another golfer');
    // A closed session can't be flipped.
    R.newSession('Manny');
    assert.equal(R.setMishit('Manny', 0, true), null);
    // OLD records (saved before Good / Mishit): no mis field anywhere - all good, read as before.
    const old = { v: 1, golfers: { 'n:cal': { sessions: [{ id: '1', at: t0, shots: [{ c: '7i', yd: 150, by: 'gps', at: t0 }, { c: '7i', yd: 155, by: 'typed', at: t0 + 1 }, { c: '7i', yd: 148, by: 'gps', at: t0 + 2 }] }] } } };
    store[R.KEY] = JSON.stringify(old);
    const cur = R.current('Cal', t0 + 10);
    assert.equal(cur.shots.length, 3);
    assert.deepEqual(plain(R.summarize(cur.shots)), [{ club: '7i', name: '7-iron', n: 3, good: 3, mis: 0, avg: 150, longest: 155 }]);
    assert.equal(R.clubLine(R.summarize(cur.shots)[0]), '7-iron · 3 good / 0 mishits · 150 (median of good)');
    // and a flip on an old record adds just the flag
    R.flip('Cal', 0);
    assert.deepEqual(plain(R.current('Cal', t0 + 10).shots[0]), { c: '7i', yd: 150, by: 'gps', at: t0, mis: true });
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
    R.flip('Manny', 1);   // a Mishit adds only mis: true
    R.sessions('Manny').forEach((s) => s.shots.forEach((x, i) => assert.deepEqual(Object.keys(x).sort(), i === 1 ? ['at', 'by', 'c', 'mis', 'yd'] : ['at', 'by', 'c', 'yd'])));
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

test('Range from Home (no round): the phone\'s own golfer - newest round here, else the name typed once, else the account\'s', { skip }, () => {
    const { R, store } = sandbox();
    const g = (acct) => R.homeGolfer(acct);
    // nothing yet: '' (Home asks "Your name"); "Me" is not a name
    assert.equal(g('Me'), '');
    assert.equal(g('Manny'), 'Manny', 'the account\'s first name');
    store.hardpan_my_name = '  Cal  ';
    assert.equal(g('Manny'), 'Cal', 'the name typed once wins over the account');
    store['golfapp_snap_v1_OLD001'] = JSON.stringify({ at: 1000, data: { players: [{ id: 101, name: 'Old Name' }] } });
    store['golfapp_me_OLD001'] = '101';
    store['golfapp_snap_v1_NEW001'] = JSON.stringify({ at: 2000, data: { players: [{ id: 101, name: 'Ann' }, { id: 102, name: 'Ann Alpha' }] } });
    store['hardpan_gps_golfer_NEW001'] = '102';
    store['golfapp_snap_v1_NOME01'] = JSON.stringify({ at: 9000, data: { players: [{ id: 101, name: 'Not Me' }] } });
    assert.equal(g('Manny'), 'Ann Alpha', 'who this phone was on its newest round (the GPS name tag) - My bag\'s key');
    // the source: no database, no round written
    const src = read('gps-range.js').replace(/\/\/.*$/gm, '');
    const home = src.slice(src.indexOf('function homeGolfer'), src.indexOf('var api ='));
    assert.ok(!/events\/|lastRoomCode|hardpan_last_round|golfapp_snap_v1_[^(]*setItem|\.set\(\s*['"]/.test(home), 'Home Range writes no round');
    assert.ok(/setItem\(NAME_KEY, n\)/.test(home) && (home.match(/setItem\(/g) || []).length === 1, 'the only thing Home Range stores itself is the typed name');
});
