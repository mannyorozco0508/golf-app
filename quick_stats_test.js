// ============================================================================
// QUICK STATS ON THE SCORECARD + MY STATS (008, HardPanFeature('quickStats'); GPS Map)
//
// gps-stats.js in a sandbox: GIR from the score (score - putts <= par - 2); the
// fairway only on par 4s and 5s; one record per round per golfer, on the phone
// (hardpan_qstats_v1_<code>_p<id>); My stats over the last 5 / last 20 rounds -
// putts, FIR and GIR from rounds with stats only, the scoring average and the par
// 3 / 4 / 5 averages from the golfer's own scores. And: the card's controls sit in
// GPS blocks behind the switch and the one GPS Map check; nothing is written to
// Firebase; no money engine reads it; the live (phase 1) rules refuse
// events/<code>/stats to a golfer who is not the owner - why it stays on the phone.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
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
    return { St: sb.HardPanGpsStats, store };
}
const PARS = [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4];   // 4 par 3s, 10 par 4s, 4 par 5s
const HOLES = PARS.map((p, i) => ({ n: String(i + 1), par: p }));
const PLAYERS = [{ id: 101, name: 'Ann' }, { id: 102, name: 'Ben' }];
const ctxOf = (code, scores) => ({ code, course: 'Prestwick Country Club', round: { players: PLAYERS, scores: scores || {} }, holes: HOLES });
// A full card for player 101: par + d on every hole.
const card = (d, pid) => { const s = {}; PARS.forEach((p, i) => { s['p' + (pid || 101) + '_h' + (i + 1)] = p + d; }); return s; };

test('GIR: on the green in par - 2 or fewer (score - putts); none without a score or putts', { skip }, () => {
    const { St } = sandbox();
    const Q = St.quick, c = { code: 'GIR1', course: 'X' };
    assert.strictEqual(Q.set(c, 101, 1, { putts: 2 }, 4, 4).gir, true, 'par 4: a 4 with 2 putts is on in 2');
    assert.strictEqual(Q.set(c, 101, 2, { putts: 2 }, 5, 4).gir, false, 'par 4: a 5 with 2 putts is on in 3');
    assert.strictEqual(Q.set(c, 101, 5, { putts: 2 }, 3, 3).gir, true, 'par 3: on in 1');
    assert.strictEqual(Q.set(c, 101, 5, { putts: 1 }, 3, 3).gir, false, 'par 3: on in 2 is not regulation');
    assert.strictEqual(Q.set(c, 101, 6, { putts: 3 }, 6, 5).gir, true, 'par 5: on in 3');
    assert.strictEqual(Q.set(c, 101, 7, { putts: 2 }, 0, 4).gir, null, 'no score yet: nothing to say');
    assert.strictEqual(Q.set(c, 101, 8, { fw: 'hit' }, 4, 4).gir, null, 'no putts: nothing to say');
    // 4+ is kept as 4; a second tap (null) clears it.
    assert.strictEqual(Q.set(c, 101, 9, { putts: 7 }, 9, 5).putts, 4);
    assert.strictEqual(Q.set(c, 101, 9, { putts: null }, 9, 5).putts, null);
    // Stored in the round's own shape: { putts, fw, gir } per hole, one record per golfer.
    const rec = Q.load('GIR1', 101);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rec.holes['1'])), { putts: 2, gir: true });
    assert.strictEqual(rec.holes['9'], undefined, 'a hole with nothing left is dropped');
    assert.strictEqual(Q.load('GIR1', 102), null, 'the other golfer has no record');
});

test('GIR follows the score: a corrected score works it out again (sync)', { skip }, () => {
    const { St } = sandbox();
    const Q = St.quick;
    Q.set({ code: 'FIX1' }, 101, 1, { putts: 2 }, 4, 4);
    assert.strictEqual(Q.load('FIX1', 101).holes['1'].gir, true);
    Q.sync(ctxOf('FIX1', { p101_h1: 6 }), '101');
    assert.strictEqual(Q.load('FIX1', 101).holes['1'].gir, false, 'a 6 with 2 putts is on in 4');
    assert.strictEqual(Q.hole('FIX1', 101, 1, 6, 4).gir, false);
    assert.strictEqual(Q.load('FIX1', 101).me, true, 'the golfer this phone is is marked');
});

test('the fairway is asked on par 4s and 5s only', { skip }, () => {
    const { St } = sandbox();
    const Q = St.quick;
    assert.strictEqual(Q.fwAsked(3), false); assert.strictEqual(Q.fwAsked(4), true); assert.strictEqual(Q.fwAsked(5), true);
    assert.strictEqual(Q.set({ code: 'FW1' }, 101, 5, { fw: 'hit' }, 3, 3).fw, null, 'par 3: no fairway');
    assert.strictEqual(Q.load('FW1', 101).holes['5'], undefined, 'no fairway stored on a par 3');
    assert.strictEqual(Q.set({ code: 'FW1' }, 101, 1, { fw: 'L' }, 4, 4).fw, 'L');
    assert.strictEqual(Q.set({ code: 'FW1' }, 101, 6, { fw: 'hit' }, 5, 5).fw, 'hit');
    assert.strictEqual(Q.set({ code: 'FW1' }, 101, 6, { fw: 'nope' }, 5, 5).fw, null, 'only left / hit / right');
    // And My stats never counts a par-3 "fairway" (an old record that has one).
    const a = St.aggregate([{ code: 'X', at: 1, holes: { 5: { fw: 'hit', putts: 2 }, 1: { fw: 'L', putts: 2 } }, snap: { 1: { s: 4, par: 4 }, 5: { s: 3, par: 3 } } }], 5);
    assert.strictEqual(a.firOf, 1); assert.strictEqual(a.fir, 0); assert.strictEqual(a.firPct, 0);
});

test('My stats: last 5 / last 20, putts / FIR / GIR from rounds with stats, scoring and par 3/4/5 averages from the golfer\'s scores', { skip }, () => {
    const { St } = sandbox();
    // 25 rounds, newest last. Round i scores par + d on every hole: d = 1 for the newest 5,
    // 2 for the 15 before them, 3 for the oldest 5. Stats (2 putts everywhere; fairway hit on
    // every par 4 / 5) only on the newest 5 and on rounds 10..14 (in the 20 but not the 5).
    const rounds = [];
    for (let i = 0; i < 25; i++) {
        const d = i >= 20 ? 1 : (i >= 5 ? 2 : 3);
        const snap = {}, holes = {};
        PARS.forEach((p, k) => { snap[k + 1] = { s: p + d, par: p }; });
        const stats = i >= 20 || (i >= 10 && i < 15);
        if (stats) PARS.forEach((p, k) => { holes[k + 1] = Object.assign({ putts: 2 }, p >= 4 ? { fw: i >= 20 ? 'hit' : 'R' } : {}); });
        rounds.push({ code: 'R' + i, at: 1000 + i, holes, snap });
    }
    // One round with no score at all never counts.
    rounds.push({ code: 'EMPTY', at: 99999, holes: { 1: { putts: 1 } }, snap: { 1: { s: 0, par: 4 } } });
    const a5 = St.aggregate(rounds, 5), a20 = St.aggregate(rounds, 20);
    assert.strictEqual(a5.rounds, 5); assert.strictEqual(a5.statRounds, 5);
    assert.strictEqual(a5.scoringAvg, 72 + 18, 'par 72 + 1 a hole');
    assert.strictEqual(a5.par3, 4); assert.strictEqual(a5.par4, 5); assert.strictEqual(a5.par5, 6);
    assert.strictEqual(a5.puttsPerRound, 36); assert.strictEqual(a5.puttsPerHole, 2);
    assert.strictEqual(a5.firPct, 1, 'all 14 fairways hit, 5 rounds');
    // par + 1 with 2 putts: on in par - 1 -> never GIR.
    assert.strictEqual(a5.girPct, 0);
    assert.strictEqual(a20.rounds, 20); assert.strictEqual(a20.statRounds, 10, 'only rounds with stats count toward putts / FIR / GIR');
    assert.strictEqual(a20.scoringAvg, 72 + (5 * 18 + 15 * 36) / 20, 'every complete round counts toward scoring');
    assert.strictEqual(a20.par4, (5 * 5 + 15 * 6) / 20);
    assert.strictEqual(a20.firPct, 0.5, '70 hit of 140');
    assert.strictEqual(a20.firOf, 140);
    assert.strictEqual(a20.puttsPerRound, 36);
});

test('My stats: scoring average from complete 18-hole rounds; par averages from every scored hole', { skip }, () => {
    const { St } = sandbox();
    const part = { code: 'P', at: 2, holes: {}, snap: {} };
    PARS.forEach((p, k) => { part.snap[k + 1] = { s: k < 9 ? p : 0, par: p }; });   // 9 holes played, par each
    const full = { code: 'F', at: 1, holes: {}, snap: {} };
    PARS.forEach((p, k) => { full.snap[k + 1] = { s: p + 1, par: p }; });
    const a = St.aggregate([part, full], 5);
    assert.strictEqual(a.rounds, 2); assert.strictEqual(a.full, 1);
    assert.strictEqual(a.scoringAvg, 90, 'the 9-hole round is not an 18-hole score');
    assert.strictEqual(a.statRounds, 0); assert.strictEqual(a.puttsPerRound, null); assert.strictEqual(a.firPct, null); assert.strictEqual(a.girPct, null);
    // Par 3s: holes 5, 8 (par, in the 9) + 4 par 3s at 4 = (3+3+16)/6.
    assert.strictEqual(a.par3, (3 + 3 + 4 * 4) / 6);
});

test('My stats reads the golfer this phone is: the scorecard\'s "me", else "This is me" / the GPS name tag; the GPS sheet\'s rounds too', { skip }, () => {
    const { St, store } = sandbox();
    const Q = St.quick;
    // Round A: the card marked 101 as me; 102 has stats too (a scorekeeper's other golfer).
    Q.set({ code: 'A' }, 102, 1, { putts: 1 }, 3, 4);
    Q.sync(ctxOf('A', Object.assign(card(1), card(0, 102))), '101');
    Q.set({ code: 'A' }, 101, 1, { putts: 2, fw: 'hit' }, 5, 4);
    // Round B: no "me" from the card; golfapp_me_B says 102.
    Q.set({ code: 'B' }, 102, 2, { putts: 3 }, 5, 4);
    Q.set({ code: 'B' }, 101, 2, { putts: 1 }, 5, 4);
    store.golfapp_me_B = '102';
    // Round C: only the GPS screen's own sheet (hardpan_stats_v1_), its golfer 101.
    store.hardpan_stats_v1_C = JSON.stringify({ v: 1, code: 'C', course: 'X', at: 5, player: '101', holes: { 1: { putts: 2, fw: 'R' } }, snap: { 1: { strokes: 4, par: 4 } } });
    // Round D: stats for 101, but nobody said who this phone is - not counted.
    Q.set({ code: 'D' }, 101, 1, { putts: 2 }, 4, 4);
    const mine = St.myRounds();
    const by = {}; mine.forEach((r) => { by[r.code] = r; });
    assert.deepStrictEqual(Object.keys(by).sort(), ['A', 'B', 'C']);
    assert.strictEqual(by.A.holes['1'].putts, 2, 'round A is 101\'s');
    assert.strictEqual(by.B.holes['2'].putts, 3, 'round B is 102\'s (golfapp_me_B)');
    assert.strictEqual(by.C.holes['1'].fw, 'R'); assert.strictEqual(by.C.snap['1'].s, 4);
    assert.strictEqual(Object.keys(by.A.snap).length, 18, 'the card copied 101\'s scores');
});

test('the card: controls in GPS blocks, behind the switch and the one GPS Map check; nothing written to Firebase', { skip }, () => {
    const idx = read('index.html');
    // The row hook: a GPS block in renderHoleView's golfer loop, after the row is built.
    const hv = idx.indexOf('function renderHoleView()');
    const body = idx.slice(hv, idx.indexOf('\n    function ', hv + 30));
    const hook = body.indexOf('qsHtml(hvPlayer.id');
    assert.ok(hook > 0, 'renderHoleView adds the quick stats line');
    assert.ok(body.lastIndexOf('// GPS:BEGIN', hook) > body.lastIndexOf('// GPS:END', hook), 'the hook is inside a GPS block');
    assert.match(body.slice(body.lastIndexOf('// GPS:BEGIN', hook), hook), /qsOn\(\) && canWritePlayer\(hvPlayer\.id\)/);
    assert.match(body, /\/\/ GPS:BEGIN\n\s*qsAfterRender\(\);/);
    // qsOn: the switch, and GPS Map (hasGpsPro - never the paywall).
    const fn = idx.slice(idx.indexOf('function qsOn()'), idx.indexOf('function qsCtx()'));
    assert.match(fn, /HardPanFeature\('quickStats'\)/);
    assert.match(fn, /HardPanGps\.hasGpsPro\(\)/);
    assert.ok(!/requireGps|openPaywall/.test(fn), 'the card never asks with a paywall');
    // The whole quick stats glue sits in one GPS block, and writes nothing to the database.
    const at = idx.indexOf('// ---- QUICK STATS ON THE SCORECARD');
    const glue = idx.slice(at, idx.indexOf('// GPS:END', at));
    assert.ok(glue.length > 1000 && /function qsHtml/.test(glue) && /qs-menu-mystats/.test(glue));
    assert.ok(idx.lastIndexOf('// GPS:BEGIN', at) > idx.lastIndexOf('// GPS:END', at), 'the glue is inside a GPS block');
    assert.ok(!/db\.ref|durableWrite|\.update\(|firebase/.test(glue), 'quick stats write nothing to Firebase');
    const src = read('gps-stats.js');
    assert.ok(/hardpan_qstats_v1_/.test(src));
    assert.ok(!/firebase|\.ref\(|fetch\(|XMLHttpRequest/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'gps-stats.js never leaves the phone');
    // The script tag sits in the head's GPS block.
    const tag = idx.indexOf('<script src="gps-stats.js"></script>');
    assert.ok(tag > 0 && idx.lastIndexOf('<!-- GPS:BEGIN -->', tag) > idx.lastIndexOf('<!-- GPS:END -->', tag));
    // Home: the entry, asked quietly.
    const home = read('home.html');
    assert.match(home, /<script src="gps-stats\.js"><\/script>/);
    assert.match(home, /placeHome\(document\.getElementById\(id\)\)/);
    const ph = src.slice(src.indexOf('function placeHome('), src.indexOf('W.HardPanGpsStats = {'));
    assert.match(ph, /HardPanFeature\('quickStats'\)/); assert.match(ph, /requireGps\(\{ quiet: true \}/);
});

test('stats never feed money: no money engine reads them', { skip }, () => {
    ['money-engine.js', 'settlement-engine.js', 'payouts.js', 'pool-engine.js', 'match-engine.js', 'vegas-engine.js', 'bbb-engine.js', 'league-engine.js', 'tournament-engine.js', 'handicap.js'].forEach((f) => {
        if (!fs.existsSync(path.join(__dirname, f))) return;
        const s = read(f);
        assert.ok(!/qstats|HardPanGpsStats|hardpan_stats_v1_|\.stats\b/.test(s), f + ' reads stats');
    });
});

// THE LIVE RULES (phase 1; ~/golf-app-gps-sec/rules, read-only - not in this branch): a signed-in
// golfer who is not the owner may NOT write events/<code>/stats/p101_h1. That is why the stats
// stay on the phone. Phase 2 needs a "stats" child beside scores / dots (the open play list).
const PHASE1 = path.join(os.homedir(), 'golf-app-gps-sec', 'rules', 'database.rules.phase1.json');
let targaryen = null; try { targaryen = require('targaryen'); } catch (e) { targaryen = null; }
test('phase 1 rules: a non-owner golfer cannot write events/<code>/stats (so stats stay on the phone)', { skip: skip || (!fs.existsSync(PHASE1) || !targaryen ? 'phase 1 rules file / targaryen not here' : false) }, () => {
    const rules = JSON.parse(fs.readFileSync(PHASE1, 'utf8'));
    const data = { events: { ABC123: { ownerUid: 'owner', courseName: 'X', players: { 0: { id: 101, name: 'A' } }, scores: { p101_h1: 4 } } } };
    const as = (u) => targaryen.database(rules, data).as(u);
    const v = { putts: 2, fw: 'hit', gir: true };
    assert.strictEqual(as({ uid: 'golfer', provider: 'anonymous' }).write('/events/ABC123/stats/p101_h1', v).allowed, false, 'a golfer writes stats');
    assert.strictEqual(as({ uid: 'golfer', provider: 'anonymous' }).write('/events/ABC123/scores/p101_h2', 5).allowed, true, 'control: the same golfer writes a score');
    // The phase 2 rule this needs, proven here: "stats" beside the play children.
    const p2 = JSON.parse(JSON.stringify(rules));
    p2.rules.events.$eventCode.stats = { '.write': "auth != null && root.child('events/' + $eventCode).exists()",
        $statKey: { '.validate': '$statKey.matches(/^p[0-9]+_h[0-9]+$/) && newData.hasChildren()',
            putts: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 4' },
            fw: { '.validate': "newData.isString() && (newData.val() === 'hit' || newData.val() === 'L' || newData.val() === 'R')" },
            gir: { '.validate': 'newData.isBoolean()' }, $other: { '.validate': false } } };
    const as2 = (u) => targaryen.database(p2, data).as(u);
    assert.strictEqual(as2({ uid: 'golfer', provider: 'anonymous' }).write('/events/ABC123/stats/p101_h1', v).allowed, true);
    assert.strictEqual(as2({ uid: 'golfer', provider: 'anonymous' }).write('/events/ABC123/stats/p101_h1', { putts: 9 }).allowed, false);
    assert.strictEqual(as2(null).write('/events/ABC123/stats/p101_h1', v).allowed, false);
});

test('010: My stats says "Saved on this phone" - one small grey line at the top, before Last 5 / Last 20', { skip }, () => {
    const { createDocument } = require('./helpers/mini-dom.js');
    const store = {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, document: createDocument() };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    sb.HardPanGpsStats.openMy();
    const page = sb.document.getElementById('hp-my-stats');
    const body = page.querySelector('.ms-body');
    const line = body.querySelectorAll('.ms-saved');
    assert.equal(line.length, 1, 'exactly one');
    assert.equal(line[0].textContent, 'Saved on this phone');
    assert.equal(body.children[0], line[0], 'the first line of the page body');
    assert.match(read('gps-stats.js'), /#hp-my-stats \.ms-saved\{font-size:12px;color:#6b7280;margin:4px 2px 0;\}/, 'small and grey, like the notes');
});
