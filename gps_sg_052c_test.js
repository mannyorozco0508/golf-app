// ============================================================================
// URGENT-052 C - STROKES GAINED (LITE): THE ENGINE, NOT ENOUGH DATA, THE BENCHMARK, PRACTICE THIS,
// THE FIRST-PUTT CHIP'S STORE, AND NO COORDINATES.
//
// gps-stats.js in a sandbox (no DOM). The hand-worked examples below were worked from the formulas
// in the file's header (HardPan baseline, estimated) on paper / a calculator - NOT by calling the
// file - and are pinned to 3 decimals:
//   A  par 4, 400 yds, drive to the FAIRWAY 150 out, approach to 15 ft (10-20 chip), 2 putts = 4
//      scratch:  OTT 4.070 - 3.019 - 1 = +0.051   APP 3.019 - 1.828 - 1 = +0.191   PUTT 1.828 - 2 = -0.172
//      20 hcp:   OTT +0.591   APP +0.671   PUTT -0.032
//   B  par 3, 180 yds, tee shot to 20 yds (lie unknown: mixed), chip to 8 ft (6-10), 1 putt = 3
//      scratch:  APP 3.147 - 2.563 - 1 = -0.416   ARG 2.563 - 1.520 - 1 = +0.043   PUTT 1.520 - 1 = +0.520
//   C  par 5, 520, drive LEFT (rough) 260 out, 1 penalty, score 7, 2 putts from 4.5 ft (3-6)
//      OTT 4.6?? - 3.?? - 1 - 1 (penalty on the tee shot) = -1.266; 3 strokes from 260 with no mark
//      between them: Approach and Around the green NOT COUNTED on this hole. PUTT -0.783
//   D  par 4, 380, drive RIGHT to 120 (rough), approach to 35 yds (mixed), chipped in (0 putts) = 3
//      OTT -0.131   APP -0.573   ARG +1.736   putting counts with 0 putts (0.000)
// Every hole's categories add up to E(tee) - score: a check on the engine, not on the numbers.
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
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, Array };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    return { St: sb.HardPanGpsStats, store };
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.0015, (msg || '') + ': ' + a + ' vs ' + b);

test('hand-worked A: par 4 - Off the tee, Approach, Putting vs scratch and vs a 20', { skip }, () => {
    const { St } = sandbox();
    const h = { par: 4, s: 4, putts: 2, fp: '10-20', fw: 'hit', yd: 400, marks: [150] };
    let r = St.sg.hole(h, 0);
    near(r.ott.sg, 0.051, 'OTT'); near(r.app.sg, 0.191, 'APP'); near(r.putt.sg, -0.172, 'PUTT');
    assert.strictEqual(r.arg.sg, 0); assert.strictEqual(r.arg.on, true, 'ARG counts (no shot from 50 in)');
    assert.strictEqual(r.ott.n, 1); assert.strictEqual(r.app.n, 1); assert.strictEqual(r.putt.n, 2);
    near(r.bands['150-175'].sg, 0.191, 'band 150-175');
    near(r.ott.sg + r.app.sg + r.arg.sg + r.putt.sg, St.sg.expected({ lie: 'tee', d: 400 }, 0) - 4, 'adds up');
    r = St.sg.hole(h, 20);
    near(r.ott.sg, 0.591, 'OTT 20'); near(r.app.sg, 0.671, 'APP 20'); near(r.putt.sg, -0.032, 'PUTT 20');
});

test('hand-worked B: par 3 - the tee shot is an Approach; a chip is Around the green', { skip }, () => {
    const { St } = sandbox();
    const r = St.sg.hole({ par: 3, s: 3, putts: 1, fp: '6-10', yd: 180, marks: [20] }, 0);
    near(r.app.sg, -0.416, 'APP'); near(r.arg.sg, 0.043, 'ARG'); near(r.putt.sg, 0.520, 'PUTT');
    assert.strictEqual(r.ott.n, 0); assert.strictEqual(r.drive, false);
    near(r.bands['175p'].sg, -0.416, 'band 175+');
});

test('hand-worked C: a penalty goes on the tee shot; strokes no mark separates are NOT counted', { skip }, () => {
    const { St } = sandbox();
    const r = St.sg.hole({ par: 5, s: 7, putts: 2, fp: '3-6', pen: 1, fw: 'L', yd: 520, marks: [260] }, 0);
    near(r.ott.sg, -1.266, 'OTT'); assert.strictEqual(r.ott.on, true);
    assert.strictEqual(r.app.on, false, 'Approach not counted'); assert.strictEqual(r.arg.on, false, 'ARG not counted');
    near(r.putt.sg, -0.783, 'PUTT');
});

test('hand-worked D: holed from off the green (0 putts) needs no first putt', { skip }, () => {
    const { St } = sandbox();
    const r = St.sg.hole({ par: 4, s: 3, putts: 0, fw: 'R', yd: 380, marks: [120, 35] }, 0);
    near(r.ott.sg, -0.131, 'OTT'); near(r.app.sg, -0.573, 'APP'); near(r.arg.sg, 1.736, 'ARG');
    assert.strictEqual(r.putt.on, true); assert.strictEqual(r.putt.sg, 0);
});

test('marks: one on the tee is dropped, a double tap is one, a last mark on the fringe is dropped', { skip }, () => {
    const { St } = sandbox();
    const base = { par: 4, s: 4, putts: 2, fp: '10-20', fw: 'hit', yd: 400 };
    const want = St.sg.hole(Object.assign({ marks: [150] }, base), 0);
    [[395, 150], [150, 151], [150, 12]].forEach((m) => {
        const r = St.sg.hole(Object.assign({ marks: m }, base), 0);
        near(r.ott.sg, want.ott.sg, 'OTT ' + m); near(r.app.sg, want.app.sg, 'APP ' + m);
    });
});

test('what each category needs: no putts, no first putt, no marks, no hole length', { skip }, () => {
    const { St } = sandbox();
    let r = St.sg.hole({ par: 4, s: 4, fw: 'hit', yd: 400, marks: [150] }, 0);   // no putts
    assert.strictEqual(r.putt.on, false); assert.strictEqual(r.app.on, false); assert.strictEqual(r.ott.on, true, 'the drive still counts');
    r = St.sg.hole({ par: 4, s: 4, putts: 2, fw: 'hit', yd: 400, marks: [150] }, 0);   // no first putt
    assert.strictEqual(r.putt.on, false); assert.strictEqual(r.app.on, false); assert.strictEqual(r.ott.on, true);
    r = St.sg.hole({ par: 4, s: 4, putts: 2, fp: '10-20', yd: 400, marks: [] }, 0);   // no marks
    assert.strictEqual(r.putt.on, true); assert.strictEqual(r.ott.on, false); assert.strictEqual(r.app.on, false); assert.strictEqual(r.arg.on, false);
    r = St.sg.hole({ par: 4, s: 4, putts: 2, fp: '10-20', fw: 'hit', marks: [150] }, 0);   // no hole length
    assert.strictEqual(r.ott.on, false); assert.strictEqual(r.app.on, true);
    r = St.sg.hole({ par: 4, s: 0, putts: 2, fp: '10-20', yd: 400, marks: [150] }, 0);   // no score
    ['ott', 'app', 'arg', 'putt'].forEach((c) => assert.strictEqual(r[c].on, false, c));
});

// A round of my own, seeded the way the phone keeps it: qstats (scores, putts, fp, fw) + the SG record (marks, yards).
const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];
function seedRound(store, code, at, opt) {
    opt = opt || {};
    const holes = {}, snap = {}, yd = {}, marks = {};
    PARS.forEach((p, i) => {
        const n = i + 1;
        if (opt.holes && n > opt.holes) { snap[n] = { s: 0, par: p }; return; }
        snap[n] = { s: p, par: p };
        const h = { putts: 2 };
        if (p >= 4) h.fw = 'hit';
        if (!opt.noFp && !(opt.fpHoles && n > opt.fpHoles)) h.fp = '10-20';
        holes[n] = h;
        yd[n] = p === 3 ? 170 : p === 4 ? 400 : 520;
        if (!opt.noMarks && !(opt.markHoles && n > opt.markHoles)) marks[n] = p === 3 ? [] : p === 4 ? [150] : [250, 90];
    });
    store['hardpan_qstats_v1_' + code + '_p101'] = JSON.stringify({ v: 1, code, pid: '101', course: 'Papago', at, me: true, holes, snap });
    store['hardpan_sg_v1_' + code] = JSON.stringify({ v: 1, code, yd, marks: { 101: marks } });
}

test('not enough data: each category needs 18 holes; the total leaves it out and says which', { skip }, () => {
    const store = {};
    seedRound(store, 'NED1', 1000, { fpHoles: 17 });          // first putt on 17 holes only
    const { St } = sandbox(store);
    let o = St.sg.summary(St.sg.rounds(), 0);
    assert.strictEqual(o.cats.putt.holes, 17); assert.strictEqual(o.cats.putt.enough, false, 'putting: 17 holes = not enough');
    assert.strictEqual(o.cats.ott.enough, true, 'off the tee: 14 drives + 4 par 3s = 18 holes');
    assert.strictEqual(o.cats.app.enough, false, 'approach needs the first putt too (17)');
    assert.ok(o.missing.indexOf('putt') !== -1 && o.missing.indexOf('app') !== -1);
    assert.ok(o.totalOf.indexOf('putt') === -1, 'the total leaves putting out');
    const sum = o.totalOf.reduce((a, c) => a + o.cats[c].perRound, 0);
    near(o.total, sum, 'total = the categories with enough');
    // 18 first putts: putting and approach have enough.
    const s2 = {}; seedRound(s2, 'NED2', 1000, {});
    const o2 = sandbox(s2).St.sg.summary(sandbox(s2).St.sg.rounds(), 0);
    ['ott', 'app', 'arg', 'putt'].forEach((c) => assert.strictEqual(o2.cats[c].enough, true, c + ' with 18 holes'));
    assert.strictEqual(o2.missing.length, 0);
});

test('not enough data, per category: drives, approach marks, around the green, no marks at all', { skip }, () => {
    // Drives marked on 13 of 14 par 4/5s: 13 + 4 par 3s = 17 -> not enough.
    let s = {}; seedRound(s, 'ND1', 1, { markHoles: 17 });   // hole 18 (par 4) has no mark
    let St = sandbox(s).St, o = St.sg.summary(St.sg.rounds(), 0);
    assert.strictEqual(o.cats.ott.holes, 17); assert.strictEqual(o.cats.ott.enough, false);
    assert.strictEqual(o.cats.app.enough, false); assert.strictEqual(o.cats.arg.enough, false);
    assert.strictEqual(o.cats.putt.enough, true, 'putting needs no marks');
    // No marks at all: par 3s alone never make Off the tee count.
    s = {}; seedRound(s, 'ND2', 1, { noMarks: true });
    St = sandbox(s).St; o = St.sg.summary(St.sg.rounds(), 0);
    assert.strictEqual(o.cats.ott.holes, 0, 'no drive marked: the par 3s do not count');
    assert.strictEqual(o.cats.ott.enough, false);
    // Two rounds of 9 holes each = 18: enough.
    s = {}; seedRound(s, 'ND3', 1, { holes: 9 }); seedRound(s, 'ND4', 2, { holes: 9 });
    St = sandbox(s).St; o = St.sg.summary(St.sg.rounds(), 0);
    assert.strictEqual(o.cats.putt.holes, 18); assert.strictEqual(o.cats.putt.enough, true);
});

test('benchmark picker: scratch / 10 / 20, kept on this phone, default 10; the same round reads better against a 20', { skip }, () => {
    const store = {}; seedRound(store, 'BEN1', 1, {});
    const { St } = sandbox(store);
    assert.strictEqual(St.sg.bench(), 10, 'default 10 hcp');
    assert.strictEqual(St.sg.setBench(0), 0); assert.strictEqual(St.sg.bench(), 0); assert.strictEqual(store.hardpan_sg_bench, '0');
    assert.strictEqual(St.sg.setBench(20), 20); assert.strictEqual(St.sg.bench(), 20);
    assert.strictEqual(St.sg.setBench(7), 0, 'anything else = scratch');
    const t0 = St.sg.summary(St.sg.rounds(), 0).total, t10 = St.sg.summary(St.sg.rounds(), 10).total, t20 = St.sg.summary(St.sg.rounds(), 20).total;
    assert.ok(t0 < t10 && t10 < t20, 'scratch < 10 < 20: ' + [t0, t10, t20]);
    // Par on every hole: about even with scratch (the baseline card is ~71.6), ~10 shots ahead of a 10.
    assert.ok(Math.abs(t0) < 1.5, 'even par vs scratch ' + t0);
    assert.ok(t10 > 8 && t10 < 12, 'even par vs a 10 ' + t10);
    assert.ok(t20 > 18 && t20 < 22, 'even par vs a 20 ' + t20);
});

test('the window: Last round / 10 / 20 (kept on this phone, default 10)', { skip }, () => {
    const { St, store } = sandbox();
    assert.strictEqual(St.sg.last(), 10);
    store.hardpan_sg_last = '1'; assert.strictEqual(St.sg.last(), 1);
    store.hardpan_sg_last = '20'; assert.strictEqual(St.sg.last(), 20);
    store.hardpan_sg_last = '5'; assert.strictEqual(St.sg.last(), 10);
});

test('practice this: names the biggest per-round loss (an approach band when it has 3+ shots)', { skip }, () => {
    const mk = (cats, bands) => ({ cats, bands: bands || {}, totalOf: Object.keys(cats).filter((c) => cats[c].enough), missing: [] });
    const c = (pr, n) => ({ enough: true, perRound: pr, n: n || 10, holes: 18 });
    let p = St0().sg.practice(mk({ ott: c(-0.6), app: c(-2.6), arg: c(-0.2), putt: c(1.4) }, { '150-175': { n: 8, perRound: -2.1 }, '100-125': { n: 6, perRound: -0.2 }, u100: { n: 2, perRound: -3 } }));
    assert.strictEqual(p.cat, 'app'); assert.strictEqual(p.band, '150-175', 'a 2-shot band is not named'); assert.strictEqual(p.label, 'Approach from 150–175');
    near(p.perRound, -2.1);
    p = St0().sg.practice(mk({ ott: c(-0.6), app: c(-0.3), arg: c(-1.2), putt: c(-0.9) }, { '150-175': { n: 8, perRound: -0.3 } }));
    assert.strictEqual(p.cat, 'arg', 'around the green is the biggest loss');
    p = St0().sg.practice(mk({ ott: c(-3.0), app: c(-0.3), arg: c(-1.2), putt: c(-0.9) }));
    assert.strictEqual(p.cat, 'ott');
    // A category without enough data is never named, however big.
    const cats = { ott: c(-0.4), app: c(-0.3), arg: c(-0.2), putt: { enough: false, perRound: -5, n: 3, holes: 3 } };
    p = St0().sg.practice(mk(cats));
    assert.strictEqual(p.cat, 'ott');
    p = St0().sg.practice(mk({ ott: c(0.4), app: c(0.3), arg: c(0.2), putt: c(0.1) }));
    assert.strictEqual(p.none, true, 'nothing loses shots');
    assert.strictEqual(St0().sg.practice(mk({ putt: { enough: false, perRound: -1, n: 1, holes: 1 } })), null, 'nothing has enough data');
});
function St0() { return sandbox().St; }

test('first putt: stored beside putts in the quick-stats record (the same way), optional, cleared by a second tap', { skip }, () => {
    const { St, store } = sandbox();
    const Q = St.quick, ctx = { code: 'FP1', course: 'X' };
    let c = Q.set(ctx, 101, 1, { putts: 2 }, 4, 4);
    assert.strictEqual(c.fp, null, 'no first putt: fine');
    c = Q.set(ctx, 101, 1, { fp: '6-10' }, 4, 4);
    assert.strictEqual(c.fp, '6-10'); assert.strictEqual(c.putts, 2, 'putts unchanged');
    const rec = JSON.parse(store.hardpan_qstats_v1_FP1_p101);
    assert.deepStrictEqual(rec.holes['1'], { putts: 2, gir: true, fp: '6-10' }, 'beside putts, in the same hole record');
    assert.deepStrictEqual(rec.snap['1'], { s: 4, par: 4 }, 'the score copy is the same');
    c = Q.set(ctx, 101, 1, { fp: 'banana' }, 4, 4); assert.strictEqual(c.fp, null, 'not a chip = cleared');
    c = Q.set(ctx, 101, 1, { fp: '40p' }, 4, 4); c = Q.set(ctx, 101, 1, { fp: null }, 4, 4); assert.strictEqual(c.fp, null);
    // Every chip id the sheet offers is one the store keeps.
    St.sg.fpChips.forEach((x) => assert.strictEqual(Q.set(ctx, 101, 2, { fp: x[0] }, 4, 4).fp, x[0], x[0]));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(St.sg.fpChips.map((x) => x[1]))), ['<3', '3–6', '6–10', '10–20', '20–40', '40+']);
});

test('first putt never touches the score or the putts My stats / the card read', { skip }, () => {
    const a = sandbox(), b = sandbox(), ctx = { code: 'FP2', course: 'X' };
    [a, b].forEach((x) => { x.St.quick.set(ctx, 101, 1, { putts: 2, fw: 'hit' }, 4, 4); x.St.quick.set(ctx, 101, 2, { putts: 1 }, 3, 3); });
    b.St.quick.set(ctx, 101, 1, { fp: '3-6' }, 4, 4); b.St.quick.set(ctx, 101, 2, { fp: '40p' }, 3, 3);
    const agg = (x) => JSON.parse(JSON.stringify(x.St.aggregate(x.St.myRounds(), 20)));
    assert.deepStrictEqual(agg(b), agg(a), 'My stats numbers identical with and without first putts');
    const sum = (x) => JSON.parse(JSON.stringify(x.St.quick.hole('FP2', 101, 1, 4, 4)));
    const sa = sum(a), sb = sum(b); delete sb.fp; delete sa.fp;
    assert.deepStrictEqual(sb, sa, 'the hole cell is the same apart from fp');
});

test('NO COORDINATES: a mark keeps yards only; a position is refused; nothing with lat / lng / p is stored', { skip }, () => {
    const { St, store } = sandbox();
    assert.strictEqual(St.sg.mark('NC1', 101, 4, [33.45, -79.15]), false, 'a [lat, lng] is refused');
    assert.strictEqual(St.sg.mark('NC1', 101, 4, { lat: 33.45, lng: -79.15 }), false, 'an object is refused');
    assert.strictEqual(St.sg.mark('NC1', 101, 4, 152.4, { holeYd: 401.2 }), true);
    assert.strictEqual(St.sg.mark('NC1', 101, 4, 30, { onGreen: true }), false, 'on the green: not kept');
    assert.strictEqual(St.sg.mark('NC1', 101, 4, 41, { holeYd: [33.4, -79.1] }), true);
    const rec = JSON.parse(store.hardpan_sg_v1_NC1);
    assert.deepStrictEqual(rec, { v: 1, code: 'NC1', yd: { 4: 401 }, marks: { 101: { 4: [152, 41] } } });
    const all = JSON.stringify(store);
    assert.ok(!/lat|lng|"p"|coords|\[\s*-?\d+\.\d{3,}/.test(all), 'no coordinate-looking value anywhere: ' + all);
    // A practice / removed round keeps nothing.
    store.hardpan_nostats_NC2 = 'practice';
    assert.strictEqual(St.sg.mark('NC2', 101, 1, 150), false); assert.ok(!('hardpan_sg_v1_NC2' in store));
    // Remove from my stats / Start fresh take it too.
    St.removeRound('NC1'); assert.ok(!('hardpan_sg_v1_NC1' in store), 'Remove takes the SG record');
    St.sg.mark('NC3', 101, 1, 150); St.clearAll(); assert.ok(!('hardpan_sg_v1_NC3' in store), 'Start fresh takes it');
});

test('NO COORDINATES (source): gps-view passes only yards; the SG code reads no position', { skip }, () => {
    const v = read('gps-view.js'), at = v.indexOf('function sgMarkHere');
    assert.ok(at > 0, 'gps-view has the mark hook');
    const fn = v.slice(at, v.indexOf('\n    function ', at + 20));
    assert.ok(/St\.sg\.mark\(S\.eventCode, w\.id, S\.hole, Math\.round\(toYd\)/.test(fn), 'it passes yards');
    assert.ok(!/fix\.pt|\.pt\b|lat|lng/.test(fn.replace(/r\.tee, r\.mid/, '')), 'no position passed: ' + fn);
    assert.ok(/sgMarkHere\(toYd, /.test(v), 'chipsMark calls it');
    const s = read('gps-stats.js'), a = s.indexOf('URGENT-052 C - STROKES GAINED'), b = s.indexOf('function setTrackOthers');
    const blk = s.slice(a, b);
    assert.ok(blk.length > 5000 && /function sgHole/.test(blk), 'positive: the SG block is there');
    assert.ok(!/firebase|\.ref\(|fetch\(|XMLHttpRequest|geolocation/.test(blk), 'nothing leaves the phone');
});

test('the after-round card is only for the phone\'s own golfer with stats on, and Done goes on to Finish', { skip }, () => {
    const s = read('gps-stats.js'), at = s.indexOf('function ssSave()');
    const fn = s.slice(at, s.indexOf('\n    function ', at + 20));
    assert.ok(/sgRoundCard\(c\.code, go\)/.test(fn), 'the card, then Finish');
    assert.ok(/if \(!shown\) go\(\)/.test(fn), 'no card: Finish straight away');
    assert.ok(/allIn && c\.stats && own != null && !practiceOn\(c\.code\)/.test(fn), 'only with stats, own golfer, not practice');
    // No data at all: no card.
    const { St, store } = sandbox();
    store['hardpan_qstats_v1_RC1_p101'] = JSON.stringify({ v: 1, code: 'RC1', pid: '101', at: 1, me: true, holes: {}, snap: { 1: { s: 4, par: 4 } } });
    assert.strictEqual(St.sg.roundCard('RC1', () => {}), false);
});
