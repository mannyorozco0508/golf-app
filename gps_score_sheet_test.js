// ============================================================================
// THE SCORE SHEET (012, HardPanFeature('scoreSheet'); the GPS screen's Enter score)
//
// gps-stats.js in a sandbox: the score grid centred on par (par 3 / 4 / 5) with More up to
// 15; GREEN IN REG - Hit worked out from score - putts <= par - 2 (auto), the golfer's own
// answer (hit / short / long / L / R) winning, and Hit-when-auto clearing to auto; the
// quick-stats record extended compatibly (an 008 record reads the same; the new fields -
// tee short, gd, bunker, penalties, note - sit beside the old ones); My stats' miss counts.
// And the wiring: index.html's hook sits in a GPS block, writes only through saveScore, and
// the switch off is the card's box; the switch is in gps-config.js; the Tools toggle is per
// phone and off by default.
// Headless, as a golfer reaches it: tools/gps-score-sheet-check.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-stats.js'));
const skip = ON ? false : 'Consumer tree: no GPS stats';

function sandbox(ls) {
    const store = ls || {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    sb.HardPanGpsStats.__sb = sb;
    return { St: sb.HardPanGpsStats, store };
}
const J = (x) => JSON.parse(JSON.stringify(x));

test('the score grid: seven scores with par third (par 3 / 4 / 5), More = the rest up to 15', { skip }, () => {
    const { St } = sandbox();
    assert.deepStrictEqual(J(St.sheet.grid(3)), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepStrictEqual(J(St.sheet.grid(4)), [2, 3, 4, 5, 6, 7, 8]);
    assert.deepStrictEqual(J(St.sheet.grid(5)), [3, 4, 5, 6, 7, 8, 9]);
    [3, 4, 5].forEach((p) => assert.strictEqual(St.sheet.grid(p)[2], p, 'par is the third cell, par ' + p));
    assert.deepStrictEqual(J(St.sheet.more(4)), [1, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepStrictEqual(J(St.sheet.more(5)), [1, 2, 10, 11, 12, 13, 14, 15]);
});

test('GREEN IN REG: auto Hit from score - putts <= par - 2; the golfer\'s answer wins; Hit when auto = back to auto', { skip }, () => {
    const { St } = sandbox();
    const Q = St.quick, ctx = { code: 'GIR1', course: 'X' };
    // Par 4, 4 with 2 putts: on in 2 -> auto Hit.
    let c = Q.set(ctx, 101, 1, { putts: 2 }, 4, 4);
    assert.strictEqual(c.gir, true); assert.strictEqual(c.girAuto, true); assert.strictEqual(c.gd, null);
    assert.deepStrictEqual(J(St.sheet.gir(c)), { v: 'hit', auto: true });
    // 5 with 2 putts: on in 3 - no auto; nothing shown until the golfer says where.
    c = Q.set(ctx, 101, 2, { putts: 2 }, 5, 4);
    assert.strictEqual(c.girAuto, false); assert.deepStrictEqual(J(St.sheet.gir(c)), { v: null, auto: false });
    // The golfer overrides: missed short although auto said Hit (a chip-in, a putt from the fringe).
    c = Q.hole('GIR1', 101, 1, 4, 4);
    let patch = St.sheet.girTap(c, 'short');
    assert.deepStrictEqual(J(patch), { gd: 'short' });
    c = Q.set(ctx, 101, 1, patch, 4, 4);
    assert.strictEqual(c.gir, false); assert.strictEqual(c.gd, 'short'); assert.deepStrictEqual(J(St.sheet.gir(c)), { v: 'short', auto: false });
    // ... and the stored record says so - and keeps saying so after the card syncs (qSync).
    Q.sync({ code: 'GIR1', round: { players: [{ id: 101 }], scores: { p101_h1: 4, p101_h2: 5 } }, holes: [{ n: '1', par: 4 }, { n: '2', par: 4 }] }, 101);
    assert.strictEqual(Q.load('GIR1', 101).holes['1'].gir, false);
    // Tapping Hit with auto Hit underneath: back to auto (nothing stored for gd).
    patch = St.sheet.girTap(c, 'hit');
    assert.deepStrictEqual(J(patch), { gd: null });
    c = Q.set(ctx, 101, 1, patch, 4, 4);
    assert.deepStrictEqual(J(St.sheet.gir(c)), { v: 'hit', auto: true });
    assert.ok(!('gd' in Q.load('GIR1', 101).holes['1']));
    // Hit against auto (no auto Hit): stored as the golfer's own answer.
    c = Q.hole('GIR1', 101, 2, 5, 4);
    assert.deepStrictEqual(J(St.sheet.girTap(c, 'hit')), { gd: 'hit' });
    c = Q.set(ctx, 101, 2, { gd: 'hit' }, 5, 4);
    assert.strictEqual(c.gir, true);
    // Tapping what is shown clears it.
    assert.deepStrictEqual(J(St.sheet.girTap(c, 'hit')), { gd: null });
    // The score changes: auto follows it.
    c = Q.set(ctx, 101, 3, { putts: 1 }, 3, 4);
    assert.strictEqual(c.girAuto, true);
    c = Q.set(ctx, 101, 3, {}, 5, 4);
    assert.strictEqual(c.girAuto, false);
});

test('the store: an 008 record reads the same; the new fields sit beside it; junk refused', { skip }, () => {
    const old = { v: 1, code: 'OLD1', pid: '101', course: 'X', at: 5, me: true, holes: { 1: { putts: 2, fw: 'L', gir: true }, 3: { putts: 2, gir: true } }, snap: { 1: { s: 4, par: 4 }, 3: { s: 3, par: 3 } } };
    const { St, store } = sandbox({ hardpan_qstats_v1_OLD1_p101: JSON.stringify(old) });
    const Q = St.quick;
    const c = Q.hole('OLD1', 101, 1, 4, 4);
    assert.deepStrictEqual([c.putts, c.fw, c.gir, c.gd, c.bunker, c.pen, c.note], [2, 'L', true, null, null, null, '']);
    // The new fields on top, the old ones untouched.
    Q.set({ code: 'OLD1' }, 101, 1, { fw: 'S', bunker: 7, pen: 1, note: '  pulled it  ' }, 4, 4);
    const h = JSON.parse(store.hardpan_qstats_v1_OLD1_p101).holes['1'];
    assert.deepStrictEqual(h, { putts: 2, fw: 'S', gir: true, bunker: 3, pen: 1, note: 'pulled it' });
    // No tee shot on a par 3; no unknown green value; clearing removes the key.
    Q.set({ code: 'OLD1' }, 101, 3, { fw: 'S', gd: 'sideways' }, 3, 3);
    assert.deepStrictEqual(JSON.parse(store.hardpan_qstats_v1_OLD1_p101).holes['3'], { putts: 2, gir: true });
    Q.set({ code: 'OLD1' }, 101, 1, { bunker: null, pen: null, note: '' }, 4, 4);
    assert.deepStrictEqual(JSON.parse(store.hardpan_qstats_v1_OLD1_p101).holes['1'], { putts: 2, fw: 'S', gir: true });
    // Same key, same version: an older build still reads this record.
    assert.strictEqual(JSON.parse(store.hardpan_qstats_v1_OLD1_p101).v, 1);
});

test('My stats: tee misses (L / R / short) and green misses (short / long / L / R) counted; FIR / GIR use them', { skip }, () => {
    const { St } = sandbox();
    const r = { code: 'M1', at: 1, holes: {
        1: { putts: 2, fw: 'L', gd: 'short' }, 2: { putts: 2, fw: 'S', gd: 'long' }, 3: { putts: 1, fw: 'hit' }, 4: { putts: 2, fw: 'R', gd: 'L' },
        5: { putts: 2, gd: 'R' }, 6: { fw: 'L', gd: 'short' }, 7: { putts: 2, gd: 'hit' } },
        snap: { 1: { s: 5, par: 4 }, 2: { s: 5, par: 4 }, 3: { s: 3, par: 4 }, 4: { s: 5, par: 4 }, 5: { s: 4, par: 3 }, 6: { s: 6, par: 5 }, 7: { s: 4, par: 4 } } };
    const a = St.aggregate([r], 5);
    assert.deepStrictEqual(J(a.teeMiss), { L: 2, R: 1, S: 1 });
    assert.deepStrictEqual(J(a.greenMiss), { short: 2, long: 1, L: 1, R: 1 });
    assert.strictEqual(a.firOf, 5); assert.strictEqual(a.fir, 1);
    // GIR: 3 auto (3 - 1 = 2 <= 2) hit; 7 set hit; 1, 2, 4, 5, 6 set misses (6 without putts still counts).
    assert.strictEqual(a.girOf, 7); assert.strictEqual(a.gir, 2);
    // An 008 round (no gd anywhere) adds up exactly as before.
    const b = St.aggregate([{ code: 'M2', at: 2, holes: { 1: { putts: 2, fw: 'hit' } }, snap: { 1: { s: 4, par: 4 } } }], 5);
    assert.deepStrictEqual([b.fir, b.firOf, b.gir, b.girOf, b.puttsPerRound], [1, 1, 1, 1, 36]);
    assert.deepStrictEqual(J(b.teeMiss), { L: 0, R: 0, S: 0 });
});

test('Track stats for others: per phone, off by default', { skip }, () => {
    const { St, store } = sandbox();
    assert.strictEqual(St.sheet.othersOn(), false);
    St.sheet.setOthers(true);
    assert.strictEqual(store.hardpan_stats_others, '1'); assert.strictEqual(St.sheet.othersOn(), true);
    St.sheet.setOthers(false);
    assert.ok(!('hardpan_stats_others' in store));
    // The API any Tools surface uses: absent until the switch means something (no switch / no GPS Map).
    assert.strictEqual(St.trackOthers, undefined); assert.strictEqual(St.trackOthersShown(), false);
    const G = St.__sb;
    G.HardPanFeature = (n) => n !== 'scoreSheet'; G.HardPanGps = { hasGpsPro: () => true };
    assert.strictEqual(St.trackOthers, undefined, 'scoreSheet off: no switch');
    G.HardPanFeature = () => true;
    assert.strictEqual(typeof St.trackOthers, 'function');
    assert.strictEqual(St.setTrackOthers(true), true); assert.strictEqual(St.trackOthers(), true); assert.strictEqual(store.hardpan_stats_others, '1');
    assert.strictEqual(St.setTrackOthers(false), false); assert.strictEqual(St.trackOthers(), false);
});

test('the wiring: a GPS block in index.html, saveScore the only writer, the switch off = the card\'s box', { skip }, () => {
    const html = read('index.html');
    const at = html.indexOf('function gpsOpenScore(');
    assert.ok(at > 0);
    const fn = html.slice(at, html.indexOf('\n    }\n', at));
    assert.ok(/if \(gpsSheetOn\(\) && gpsOpenSheet\(hole, playerId\)\) return;/.test(fn), 'the hook is the first thing Enter score does');
    assert.ok(/showSide\('bets'/.test(fn) && /box\.focus\(\)/.test(fn), 'the old path (the card\'s box) is still there for the switch off');
    const sheet = html.slice(html.indexOf('function gpsOpenSheet('), at);
    assert.ok(/saveScore\(p \? p\.id : pid, n, String\(v\)\)/.test(sheet), 'scores go through saveScore');
    assert.ok(!/db\.ref|durableWrite|\.set\(/.test(sheet), 'no other write in the sheet\'s hook');
    assert.ok(/gpsStepHole\(1\)/.test(sheet), 'Next is the card\'s own next hole (play order, KP)');
    // Inside a GPS block (the Consumer index.html is pinned by gps_flag_test).
    const begin = html.lastIndexOf('// GPS:BEGIN', html.indexOf('function gpsSheetOn('));
    const end = html.indexOf('// GPS:END', begin);
    assert.ok(begin > 0 && end > at, 'gpsSheetOn .. gpsOpenScore sit inside one GPS block');
    assert.ok(/HardPanFeature\('scoreSheet'\)/.test(html.slice(begin, end)));
    // gps-stats.js writes nothing to Firebase.
    assert.ok(!/firebase|db\.ref|\.ref\(/.test(read('gps-stats.js')));
});

test('the switch: features.scoreSheet in gps-config.js, on', { skip }, () => {
    const sb = { window: {} }; sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-config.js'), sb);
    assert.strictEqual(sb.HARDPAN_GPS_CONFIG.features.scoreSheet, true);
    assert.strictEqual(sb.HardPanFeature('scoreSheet'), true);
});
