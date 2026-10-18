// ============================================================================
// HARDPAN INDEX (unofficial) - the math, the kept rounds, the words (008, feature 8)
//
// hp-index.js: Score Differential = (113 / Slope) x (Adjusted Gross - Course Rating - 0),
// net double bogey per hole (par + 5 before an index), the WHS fewer-than-20 table,
// nearest tenth, capped at 54.0, no rating / slope = not counted, fewer than 3 = none.
// HardPan only: skipped in a Consumer tree (no GPS files).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
const ON = fs.existsSync(path.join(ROOT, 'hp-index.js'));
const skip = ON ? false : 'Consumer tree (GPS_ENABLED=0): no HardPan Index';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// A fresh copy in a sandbox with its own localStorage and switch.
function load(opts) {
    opts = opts || {};
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const w = { localStorage, HardPanFeature: (n) => (opts.features || {})[n] !== false };
    const sb = { window: w, module: { exports: {} }, setTimeout, console };
    vm.createContext(sb);
    vm.runInContext(read('hp-index.js'), sb);
    return { H: sb.module.exports, store, w };
}
const H = ON ? load().H : null;

// 18 holes: pars 4 x 10, 3 x 4, 5 x 4 = par 72; stroke index = hole number.
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = (gross) => PARS.map((p, i) => ({ n: i + 1, par: p, si: i + 1, gross: Array.isArray(gross) ? gross[i] : p + gross }));
const rec = (code, at, gross, tee) => ({ code, at, course: 'C ' + code, name: 'Manny', pid: '1',
    tee: tee === undefined ? { name: 'Blue', slope: 113, rating: 72, par: 72 } : tee, holes: holes(gross) });

test('Score Differential: (113 / Slope) x (AGS - CR), to the nearest tenth', { skip }, () => {
    // Every hole bogey (+1): gross 90, nothing capped (par + 5 allows it). Slope 113, CR 72: 18.0.
    assert.strictEqual(H.differential(rec('A', 1, 1), null).diff, 18.0);
    // Slope 130, CR 71.3: (113/130) x (90 - 71.3) = 16.254 -> 16.3.
    const d = H.differential(rec('B', 1, 1, { slope: 130, rating: 71.3, par: 72 }), null);
    assert.strictEqual(d.ags, 90);
    assert.strictEqual(d.diff, 16.3);
});

test('net double bogey per hole: par + 2 + strokes received; par + 5 with no index', { skip }, () => {
    // No index: a 10 on a par 4 counts 9 (par + 5).
    assert.strictEqual(H.holeMax(4, 1, null), 9);
    // Course handicap 20: 2 strokes on SI 1-2, 1 on SI 3-18.
    assert.strictEqual(H.strokesOnHole(20, 1), 2);
    assert.strictEqual(H.strokesOnHole(20, 2), 2);
    assert.strictEqual(H.strokesOnHole(20, 3), 1);
    assert.strictEqual(H.holeMax(4, 1, 20), 8);
    assert.strictEqual(H.holeMax(4, 18, 20), 7);
    // CH 10: SI 1-10 one stroke, SI 11-18 none.
    assert.strictEqual(H.holeMax(4, 10, 10), 7);
    assert.strictEqual(H.holeMax(4, 11, 10), 6);
    // Plus 2: gives a stroke back on SI 17 and 18.
    assert.strictEqual(H.strokesOnHole(-2, 18), -1);
    assert.strictEqual(H.strokesOnHole(-2, 17), -1);
    assert.strictEqual(H.strokesOnHole(-2, 16), 0);
    // A round of 10s on every hole: capped hole by hole.
    const r = rec('X', 1, PARS.map(() => 10));
    assert.strictEqual(H.differential(r, null).ags, 72 + 18 * 5);
    // With an index of 0.0 (CH 0 at slope 113 / CR 72 / par 72): par + 2 everywhere.
    assert.strictEqual(H.courseHandicap(0, 113, 72, 72), 0);
    assert.strictEqual(H.differential(r, 0).ags, 72 + 18 * 2);
    // Course handicap = round(index x slope / 113 + (CR - par)).
    assert.strictEqual(H.courseHandicap(12.4, 130, 71.3, 72), 14);
});

test('the fewer-than-20 table, at every band', { skip }, () => {
    // Differentials 1, 2, 3 ... n (most recent first does not matter for lowest).
    const idx = (n) => H.indexFrom(Array.from({ length: n }, (_, i) => 10 + i)).index;
    assert.strictEqual(H.indexFrom([10, 11]), null, 'fewer than 3: none');
    assert.strictEqual(idx(3), 8.0);            // lowest 1 (10) - 2.0
    assert.strictEqual(idx(4), 9.0);            // lowest 1 - 1.0
    assert.strictEqual(idx(5), 10.0);           // lowest 1
    assert.strictEqual(idx(6), 9.5);            // avg(10, 11) - 1.0
    assert.strictEqual(idx(7), 10.5);           // avg lowest 2
    assert.strictEqual(idx(8), 10.5);
    assert.strictEqual(idx(9), 11.0);           // avg lowest 3
    assert.strictEqual(idx(11), 11.0);
    assert.strictEqual(idx(12), 11.5);          // avg lowest 4
    assert.strictEqual(idx(14), 11.5);
    assert.strictEqual(idx(15), 12.0);          // avg lowest 5
    assert.strictEqual(idx(16), 12.0);
    assert.strictEqual(idx(17), 12.5);          // avg lowest 6
    assert.strictEqual(idx(18), 12.5);
    assert.strictEqual(idx(19), 13.0);          // avg lowest 7
    assert.strictEqual(idx(20), 13.5);          // best 8 of 20
    assert.deepStrictEqual(Array.from([3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20].map((n) => H.table(n).use)), [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8]);
    // Only the most recent 20: an older 0.0 (21st) is not read.
    const d = Array.from({ length: 20 }, () => 15).concat([0]);
    assert.strictEqual(H.indexFrom(d).index, 15.0);
    assert.strictEqual(H.indexFrom(d).rounds, 20);
});

test('rounding to the nearest tenth, and the 54.0 cap', { skip }, () => {
    assert.strictEqual(H.r1(12.35), 12.4);
    assert.strictEqual(H.r1(12.34), 12.3);
    assert.strictEqual(H.r1(-1.25), -1.3);
    assert.strictEqual(H.r1(-0.04), 0);
    assert.strictEqual(H.indexFrom([12.3, 12.4, 20, 20, 20, 20, 20]).index, 12.4);   // avg 12.35 -> 12.4
    assert.strictEqual(H.indexFrom([60, 61, 62, 63, 64]).index, 54.0);
    assert.strictEqual(H.fmt(12.4), '12.4');
    assert.strictEqual(H.fmt(-1.2), '+1.2');
    assert.strictEqual(H.fmt(10), '10.0');
});

test('no rating / slope = that round is not counted, and says so', { skip }, () => {
    const rs = [rec('A', 1, 1), rec('B', 2, 1), rec('N', 3, 0, { name: 'White', slope: null, rating: null, par: 72 }), rec('C', 4, 1)];
    const r = H.compute(rs);
    assert.strictEqual(r.counted, 3);
    assert.strictEqual(JSON.stringify(r.skipped.map((s) => [s.code, s.reason])), JSON.stringify([['N', 'no course rating / slope for that tee']]));
    assert.strictEqual(r.index, 16.0);    // three 18.0s: lowest 1 - 2.0
    assert.strictEqual(H.skipReason(rec('S', 1, 1, { slope: 113, rating: null })), 'no course rating / slope for that tee');
});

test('fewer than 3 rounds: no index, and the words for it', { skip }, () => {
    const r = H.compute([rec('A', 1, 1), rec('B', 2, 1)]);
    assert.strictEqual(r.index, null);
    assert.strictEqual(r.need, 1);
    assert.strictEqual(H.WORDS.need, 'Play 3 rounds to get a HardPan Index');
    assert.strictEqual(H.compute([]).index, null);
});

test('each round is adjusted with the index in effect when it was played', { skip }, () => {
    // Three steady rounds (diff 18.0 each) give 16.0; the 4th has a 12 on the par-4 1st (SI 1).
    // CH from 16.0 at slope 113 / CR 72 / par 72 = 16: SI 1 gets 1 stroke -> max 7 (not par + 5 = 9).
    const g = PARS.map((p) => p + 1); g[0] = 12;
    const r = H.compute([rec('A', 1, 1), rec('B', 2, 1), rec('C', 3, 1), rec('D', 4, g)]);
    const d = r.differentials.filter((x) => x.code === 'D')[0];
    assert.strictEqual(d.ch, 16);
    assert.strictEqual(d.ags, 90 - 5 + 7);
    assert.strictEqual(d.diff, 20.0);
    assert.strictEqual(r.index, 17.0);    // 4 rounds: lowest 1 (18.0) - 1.0
});

test('5 seeded rounds -> an index, "based on 5 rounds"', { skip }, () => {
    const r = H.compute([1, 2, 3, 4, 5].map((i) => rec('R' + i, i, i % 2 ? 1 : 0)));
    // diffs 18, 0, 18, 0, 18 -> lowest 1 = 0.0
    assert.strictEqual(r.index, 0);
    assert.strictEqual(r.rounds, 5);
    assert.strictEqual(H.WORDS.based(5), 'based on 5 rounds');
});

test('kept on the phone: a finished 18 for this phone\'s golfer only; the switch off keeps nothing', { skip }, () => {
    const cd = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
    const scores = {}; PARS.forEach((p, i) => { scores['p1_h' + (i + 1)] = p + 1; scores['p2_h' + (i + 1)] = p; });
    const data = { courseName: 'Caledonia', courseData: cd, scores, teeRating: { teeKey: 'blue', teeName: 'Men · Blue', slope: 128, courseRating: 70.9, par: 72, allowance: 100 },
        players: [{ id: 1, name: 'Manny' }, { id: 2, name: 'Bob', tee: { teeName: 'White', slope: 120, courseRating: 69, par: 72 } }] };
    const a = load();
    assert.strictEqual(a.H.noteRound('ABC', data, null), false, 'no "who am I": nothing kept');
    assert.strictEqual(a.H.noteRound('ABC', data, '1'), true);
    assert.strictEqual(a.H.noteRound('ABC', data, '1'), false, 'unchanged: no second write');
    const kept = a.H.rounds();
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(JSON.stringify(kept[0].tee), JSON.stringify({ name: 'Men · Blue', slope: 128, rating: 70.9, par: 72 }));
    assert.strictEqual(kept[0].holes.length, 18);
    assert.strictEqual(kept[0].name, 'Manny');
    // The golfer's own tee when it is rated.
    const b = load();
    b.store['hardpan_gps_golfer_XYZ'] = '2';
    assert.strictEqual(b.H.noteRound('XYZ', data, null), true, 'the GPS name tag is "who am I" too');
    assert.strictEqual(b.H.rounds()[0].tee.slope, 120);
    // Not finished: a hole blank.
    const c = load(); const d2 = JSON.parse(JSON.stringify(data)); delete d2.scores.p1_h18;
    assert.strictEqual(c.H.noteRound('ABC', d2, '1'), false);
    // Not 18 holes.
    const d3 = JSON.parse(JSON.stringify(data)); d3.courseData = d3.courseData.slice(0, 9);
    assert.strictEqual(c.H.noteRound('ABC', d3, '1'), false);
    // The switch off: nothing at all.
    const off = load({ features: { hpIndex: false } });
    assert.strictEqual(off.H.noteRound('ABC', data, '1'), false);
    assert.strictEqual(Object.keys(off.store).length, 0);
});

test('the words: labelled "HardPan Index (unofficial)", and NEVER USGA or GHIN in anything this feature shows', { skip }, () => {
    const W = H.WORDS;
    const shown = [W.label, W.need, W.how, W.howText, W.based(1), W.based(5), W.sofar(2), W.skipped({ course: 'X', reason: 'no course rating / slope for that tee' }), W.chip('12.4'), W.chip('12.4', '14')];
    assert.strictEqual(W.label, 'HardPan Index (unofficial)');
    assert.ok(W.chip('12.4').indexOf('HardPan Index (unofficial): 12.4') > 0);
    shown.forEach((s) => assert.ok(!/USGA|GHIN/i.test(s), 'banned word in: ' + s));
    // And not anywhere in the file - no string it could ever show carries them. (The one
    // exception is the setup select's existing option VALUE 'ghin-index', read to know which
    // number the box takes; a value is never shown.)
    assert.ok(!/USGA|GHIN/i.test(read('hp-index.js').replace(/'ghin-index'/g, '')), 'hp-index.js names USGA / GHIN');
    // The lines this feature added to the shared pages, too.
    ['admin.html', 'index.html'].forEach((f) => read(f).split('\n').filter((l) => /hp-index|HardPanIndex|HardPan Index/.test(l))
        .forEach((l) => assert.ok(!/USGA|GHIN/i.test(l), f + ': ' + l.trim())));
});

test('HardPan only: in a GPS block on both pages, registered like every GPS file', { skip }, () => {
    const flag = require('./tools/gps-flag.js');
    ['admin.html', 'index.html'].forEach((f) => {
        const h = read(f);
        assert.ok(h.indexOf('<script src="hp-index.js"></script>') > 0, f + ' loads it');
        const out = flag.applyFlag(h, false);
        assert.ok(!/hp-index|HardPanIndex/.test(out), f + ': outside a GPS block');
    });
    const sync = read('sync-mobile-web.js');
    const list = (name) => [...(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(sync)[1]).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(list('GPS_SHELL').includes('hp-index.js'));
    assert.ok(list('CONSUMER_SHELL').includes('hp-index.js'));
    const sw = read('sw.js'), at = sw.indexOf("'./hp-index.js'");
    assert.ok(at > 0 && sw.lastIndexOf('// GPS:BEGIN', at) > sw.lastIndexOf('// GPS:END', at), 'precached inside the GPS block');
    // It only fills the box: no money file, no handicap.js, no Firebase write.
    const src = read('hp-index.js');
    assert.ok(!/firebase|\.ref\(|\.set\(|\.update\(/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'no database write');
    assert.ok(!/parseHcp|getStrokes|allocateMatchStrokes|playerHandicapFields/.test(src), 'does not reach into handicap.js');
});
