// ============================================================================
// RYDER CUP PHASE 5 — TRUE FOURSOMES (ALTERNATE SHOT)
//
// The invariant this suite exists to protect, above all others:
//
//   AN ALTERNATE-SHOT RESULT NEVER COMES FROM AN INDIVIDUAL SCORE.
//
// Two partners play one ball. Writing that side's 4 into both golfers' records
// would tell every individual surface in the app - standings, Skins, Dots, birdie
// marks, stats - that each of them shot 4 on a hole neither completed alone. So
// the side's score lives in its own namespace keyed by match, side and hole, and
// several tests below assert that a full set of individual scores still leaves a
// Foursomes match reading zero holes.
//
// The handicap rule implemented is the WHS Foursomes Match Play allowance: the
// higher-handicapped side receives 50% of the difference between the two sides'
// combined Course Handicaps, rounded to the nearest whole stroke; the lower side
// plays from scratch. Scratch is the default, because the real Ryder Cup is.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js']);
const SETTLE = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const PAR = [4,4,3,5,4,4,4,5,3,4,4,4,5,4,3,4,3,5];
const HCP = [3,9,15,13,5,7,1,17,11,4,8,18,14,2,16,10,6,12];
const CD = PAR.map((par, i) => ({ hole: i+1, par, hcpIndex: HCP[i] }));

// 8 golfers. A = 101-104, B = 105-108.
const NAMES = { 101:'Manny', 102:'Matt', 103:'Lance', 104:'Zach',
                105:'Marty', 106:'Scott', 107:'Chris', 108:'Don' };
const players = h => Object.keys(NAMES).map(id => ({
    id: Number(id), name: NAMES[id],
    hcp: String((h && h[id] !== undefined) ? h[id] : 0), playingForMoney: true }));

const SESSIONS = () => RC.buildClassicSessions();

function cup(matches, opts) {
    opts = opts || {};
    return { v:1, name:'Myrtle Cup', preset:'classic',
        sides:{ A:{id:'A',name:'Team Rattle'}, B:{id:'B',name:'Team Chaos'} },
        members: { '101':'A','102':'A','103':'A','104':'A',
                   '105':'B','106':'B','107':'B','108':'B' },
        sessions: SESSIONS(), matches: matches || {} };
}

const fsMatch = (id, a, b, scoring) => ({
    id, sessionId:'d1s1', format:'foursomes', scoring: scoring || 'scratch',
    sideA:'A', sideB:'B', playersA:a.map(String), playersB:b.map(String) });

const M1 = () => fsMatch('d1s1-m1', [101,102], [105,106]);
const M2 = () => fsMatch('d1s1-m2', [103,104], [107,108]);

function round(matchMap, teamScores, hcps) {
    return { gameFormat:'stroke', players: players(hcps), courseData: CD,
        scores: {}, sideMatches: {},
        ryderCup: cup(matchMap), ryderCupRef: { host:'HOST', sessionId:'d1s1' },
        ryderFoursomes: teamScores || {} };
}

// Team scores helper: ts('d1s1-m1', {A:[4,4,...], B:[5,5,...]})
function ts(matchId, sides) {
    const out = { [matchId]: {} };
    ['A','B'].forEach(side => {
        if (!sides[side]) return;
        out[matchId][side] = {};
        sides[side].forEach((v, i) => { if (v != null) out[matchId][side]['h'+(i+1)] = v; });
    });
    return out;
}
const rep = (v, n) => Array.from({length: n || 18}, () => v);
// The round WRAPPER, not the cup object: computeRyderMatchResult reads
// data.ryderCup. Passing the cup itself returned null for every match.
const result = (d, id) => RC.computeRyderMatchResult(d, CD, d.scores, id, d);

// ===========================================================================
describe('NO INDIVIDUAL SCORE EVER DECIDES ALTERNATE SHOT', () => {

    test('a full set of individual scores leaves the match at zero holes', () => {
        const d = round({ 'd1s1-m1': M1() }, {});
        players().forEach(p => CD.forEach(h => { d.scores[`p${p.id}_h${h.hole}`] = 3; }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.thru, 0, 'individual scores must be invisible to alternate shot');
        assert.equal(r.status, 0);
        assert.equal(r.decided, false);
    });

    test('the team namespace contains no player id anywhere', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: rep(4), B: rep(5) }));
        const raw = JSON.stringify(d.ryderFoursomes);
        Object.keys(NAMES).forEach(id => assert.ok(raw.indexOf('p' + id) === -1,
            'a player key leaked into the team namespace: ' + raw.slice(0, 120)));
    });

    test('writing a team score does not write an individual score', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: rep(4), B: rep(5) }));
        assert.equal(Object.keys(d.scores).length, 0,
            'the individual namespace must stay empty during Foursomes');
        const r = result(d, 'd1s1-m1');
        assert.equal(r.thru, 18, 'yet the match is fully played');
    });

    test('the write path is a narrow per-match, per-side, per-hole child', () => {
        assert.equal(RC.ryderTeamScorePath('d1s1-m1', 'A', 7), 'ryderFoursomes/d1s1-m1/A/h7');
    });
});

// ===========================================================================
describe('SCRATCH MATCH PLAY', () => {

    test('lower gross wins the hole', () => {
        const d = round({ 'd1s1-m1': M1() },
            ts('d1s1-m1', { A: [4], B: [5] }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.status, 1);
        assert.equal(r.thru, 1);
    });

    test('all square after 18', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: rep(4), B: rep(4) }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.status, 0);
        assert.equal(r.decided, true);
        assert.equal(r.pointsA, 0.5);
        assert.equal(r.pointsB, 0.5);
    });

    test('1 up after 18', () => {
        const a = rep(4); const b = rep(4); b[17] = 5;
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: a, B: b }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.status, 1);
        assert.equal(r.decided, true);
        assert.equal(r.pointsA, 1);
        assert.equal(r.pointsB, 0);
    });

    test('an early closeout ends the match and reports it', () => {
        // A wins the first eight; 8 up with 10 to play closes at hole 14 (6 & 4).
        const a = rep(4); const b = rep(5);
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: a, B: b }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.closed, true);
        assert.ok(/&/.test(r.result), r.result);
        assert.equal(r.pointsA, 1);
    });

    test('a 3 & 2 reads as a closeout at hole 16', () => {
        const a = rep(4), b = rep(4);
        [1,5,9].forEach(h => { b[h-1] = 5; });   // A wins 3 holes, halves the rest
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: a.slice(0,16), B: b.slice(0,16) }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.status, 3);
        assert.equal(r.closed, true);
        assert.equal(r.result, '3 & 2');
    });
});

// ===========================================================================
describe('PARTIAL HOLES AND OUT-OF-ORDER ENTRY', () => {

    test('one side alone decides nothing', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: [3] }));
        const r = result(d, 'd1s1-m1');
        assert.equal(r.thru, 0, 'a half comparison is not a hole');
        assert.equal(r.status, 0);
    });

    test('the hole resolves when the other side posts', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: [3], B: [4] }));
        assert.equal(result(d, 'd1s1-m1').status, 1);
    });

    test('entry order does not matter — hole 3 before hole 2', () => {
        const fwd = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h1:4, h2:4, h3:3 }, B: { h1:5, h2:4, h3:4 } } });
        const rev = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h3:3, h1:4, h2:4 }, B: { h3:4, h2:4, h1:5 } } });
        const a = result(fwd, 'd1s1-m1'), b = result(rev, 'd1s1-m1');
        assert.equal(a.status, b.status);
        assert.equal(a.thru, b.thru);
        assert.equal(a.status, 2);
    });

    test('a gap in the middle counts only completed holes', () => {
        const d = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h1:4, h3:4 }, B: { h1:5, h3:5 } } });
        const r = result(d, 'd1s1-m1');
        assert.equal(r.thru, 2);
        assert.equal(r.status, 2);
    });

    test('a correction recomputes the match', () => {
        const d = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h1:5 }, B: { h1:4 } } });
        assert.equal(result(d, 'd1s1-m1').status, -1);
        d.ryderFoursomes['d1s1-m1'].A.h1 = 3;      // 5 was wrong, it was a 3
        assert.equal(result(d, 'd1s1-m1').status, 1);
    });
});

// ===========================================================================
describe('WHS FOURSOMES HANDICAP ALLOWANCE', () => {

    const H = { 101:2, 102:6, 105:8, 106:12 };   // A combined 8, B combined 20

    test('equal combined handicaps means nobody strokes', () => {
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:4, 102:4, 105:4, 106:4 });
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.A, 0); assert.equal(a.B, 0);
    });

    test('the HIGHER side receives 50% of the difference', () => {
        const d = round({ 'd1s1-m1': M1() }, {}, H);
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.combinedA, 8);
        assert.equal(a.combinedB, 20);
        assert.equal(a.A, 0, 'the lower side plays scratch');
        assert.equal(a.B, 6, '50% of 12');
    });

    test('the direction reverses when side A is higher', () => {
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:10, 102:10, 105:2, 106:2 });
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.A, 8, '50% of (20 - 4)');
        assert.equal(a.B, 0);
    });

    test('an odd difference rounds to the nearest whole stroke', () => {
        // Combined 4 vs 13 -> difference 9 -> 4.5 -> 5 under WHS rounding.
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:2, 102:2, 105:6, 106:7 });
        assert.equal(RC.foursomesAllowance(d.players, M1(), 'handicap').B, 5);
    });

    test('a PLUS handicap golfer lowers their side correctly', () => {
        // +2 is stored as -2. A combined = -2 + 6 = 4; B combined = 10.
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:'+2', 102:6, 105:5, 106:5 });
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.combinedA, 4);
        assert.equal(a.combinedB, 10);
        assert.equal(a.B, 3);
        assert.equal(a.A, 0);
    });

    test('a plus-handicap SIDE can be the lower side', () => {
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:'+3', 102:'+1', 105:4, 106:4 });
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.combinedA, -4);
        assert.equal(a.B, 6, '50% of (8 - -4)');
    });

    test('more than 18 strokes wraps through the existing allocation machinery', () => {
        const d = round({ 'd1s1-m1': M1() }, {}, { 101:0, 102:0, 105:20, 106:24 });
        const a = RC.foursomesAllowance(d.players, M1(), 'handicap');
        assert.equal(a.B, 22);
        // SI 1 gets two strokes at 22; SI 18 gets one.
        assert.equal(RC.foursomesNetOnHole(5, 22, 1), 3);
        assert.equal(RC.foursomesNetOnHole(5, 22, 18), 4);
    });

    test('a stroke turns a loss into a halve', () => {
        // B strokes on SI 1, which is hole 7 in this course.
        const d = round({ 'd1s1-m1': fsMatch('d1s1-m1',[101,102],[105,106],'handicap') },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:5 } } }, { 101:0,102:0,105:1,106:1 });
        const r = result(d, 'd1s1-m1');
        assert.equal(r.allowance.B, 1);
        assert.equal(r.status, 0, 'the stroke halves the hole');
    });

    test('a stroke turns a halve into a win', () => {
        const d = round({ 'd1s1-m1': fsMatch('d1s1-m1',[101,102],[105,106],'handicap') },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:4 } } }, { 101:0,102:0,105:1,106:1 });
        assert.equal(result(d, 'd1s1-m1').status, -1);
    });

    test('SCRATCH mode ignores handicaps entirely', () => {
        const d = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:5 } } }, { 101:0,102:0,105:20,106:20 });
        const r = result(d, 'd1s1-m1');
        assert.equal(r.allowance.B, 0);
        assert.equal(r.status, 1, 'gross alone decides in scratch');
    });

    test('the stored GROSS is never mutated by handicap scoring', () => {
        const d = round({ 'd1s1-m1': fsMatch('d1s1-m1',[101,102],[105,106],'handicap') },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:5 } } }, { 101:0,102:0,105:8,106:8 });
        result(d, 'd1s1-m1');
        assert.equal(d.ryderFoursomes['d1s1-m1'].B.h7, 5, 'net must be derived, never stored');
    });

    test('an UNSTARTED match can switch scoring mode and recompute', () => {
        const scr = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:5 } } }, { 101:0,102:0,105:8,106:8 });
        assert.equal(result(scr, 'd1s1-m1').status, 1);
        scr.ryderCup.matches['d1s1-m1'].scoring = 'handicap';
        assert.equal(result(scr, 'd1s1-m1').status, 0, 'now the stroke applies');
    });

    test('once LOCKED the scoring mode is frozen with the pairing', () => {
        const d = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h7:4 }, B: { h7:5 } } }, { 101:0,102:0,105:8,106:8 });
        RC.lockRyderMatch(d.ryderCup.matches['d1s1-m1'], 500);
        assert.equal(d.ryderCup.matches['d1s1-m1'].lockedScoring, 'scratch');
        d.ryderCup.matches['d1s1-m1'].scoring = 'handicap';   // edited afterwards
        assert.equal(result(d, 'd1s1-m1').status, 1,
            'a locked match keeps the mode agreed at the first tee');
    });
});

// ===========================================================================
describe('LOCK AND MULTI-GROUP ISOLATION', () => {

    test('the first TEAM score locks the pairing', () => {
        const empty = round({ 'd1s1-m1': M1() }, {});
        assert.equal(RC.ryderMatchLockState(empty, CD, {},
            empty.ryderCup.matches['d1s1-m1']).locked, false);
        const started = round({ 'd1s1-m1': M1() }, { 'd1s1-m1': { A: { h1: 4 } } });
        assert.equal(RC.ryderMatchLockState(started, CD, {},
            started.ryderCup.matches['d1s1-m1']).locked, true,
            'one side posting is enough — the match has begun');
    });

    test('a started Foursomes pairing rejects a roster change', () => {
        const d = round({ 'd1s1-m1': M1() }, { 'd1s1-m1': { A: { h1: 4 } } });
        const out = RC.applyRyderPairingChange(d, CD, d.scores, 'd1s1-m1',
            { playersA:['101','103'], playersB:['105','106'] });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'match-locked');
    });

    test('corrections stay legal after the lock', () => {
        const d = round({ 'd1s1-m1': M1() }, { 'd1s1-m1': { A: { h1:5 }, B: { h1:4 } } });
        RC.lockRyderMatch(d.ryderCup.matches['d1s1-m1'], 500);
        d.ryderFoursomes['d1s1-m1'].A.h1 = 3;
        assert.equal(result(d, 'd1s1-m1').status, 1, 'a corrected score still moves the match');
    });

    test('group 1 scoring cannot move group 2 match', () => {
        const both = round({ 'd1s1-m1': M1(), 'd1s1-m2': M2() },
            Object.assign(ts('d1s1-m1', { A: rep(4), B: rep(5) }), {}));
        assert.equal(result(both, 'd1s1-m1').pointsA, 1);
        const m2 = result(both, 'd1s1-m2');
        assert.equal(m2.thru, 0, 'match 2 has no scores of its own');
        assert.equal(m2.decided, false);
        assert.equal(RC.ryderMatchLockState(both, CD, {},
            both.ryderCup.matches['d1s1-m2']).locked, false);
    });

    test('two matches score independently in the same round', () => {
        const d = round({ 'd1s1-m1': M1(), 'd1s1-m2': M2() },
            Object.assign(ts('d1s1-m1', { A: rep(4), B: rep(5) }),
                          ts('d1s1-m2', { A: rep(5), B: rep(4) })));
        assert.equal(result(d, 'd1s1-m1').pointsA, 1);
        assert.equal(result(d, 'd1s1-m2').pointsB, 1);
    });
});

// ===========================================================================
describe('SESSION AND CUP AGGREGATION', () => {

    test('foursomes points feed the same layer with no special weighting', () => {
        const d = round({ 'd1s1-m1': M1(), 'd1s1-m2': M2() },
            Object.assign(ts('d1s1-m1', { A: rep(4), B: rep(5) }),
                          ts('d1s1-m2', { A: rep(4), B: rep(4) })));
        const t = RC.computeRyderCupTotals(d,
            { d1s1: { courseData: CD, scores: {}, roundData: d } });
        const s = t.sessions.find(x => x.id === 'd1s1');
        assert.equal(s.official.A, 1.5, 'one win plus one halve');
        assert.equal(s.official.B, 0.5);
        assert.equal(t.sides.A.official, 1.5);
    });

    test('a live foursomes match projects but does not bank', () => {
        const d = round({ 'd1s1-m1': M1() },
            { 'd1s1-m1': { A: { h1:4, h2:4 }, B: { h1:5, h2:5 } } });
        const t = RC.computeRyderCupTotals(d,
            { d1s1: { courseData: CD, scores: {}, roundData: d } });
        assert.equal(t.sides.A.official, 0);
        assert.equal(t.sides.A.projected, 1);
    });
});

// ===========================================================================
describe('PERSISTENCE AND MONEY ISOLATION', () => {

    function moneyShape(d) {
        const r = SETTLE.computeCombinedNetTotals(d, CD, d.scores);
        return JSON.parse(JSON.stringify({
            netByName: r.netByName, exact: r.exact, contributions: r.contributions,
            transactions: r.transactions,
            receipts: SETTLE.buildSideMatchReceipts(d, CD, d.scores) }));
    }

    test('everything survives a reload', () => {
        const d = round({ 'd1s1-m1': M1(), 'd1s1-m2': M2() },
            Object.assign(ts('d1s1-m1', { A: rep(4), B: rep(5) }),
                          ts('d1s1-m2', { A: [4,4,4], B: [5,4,4] })));
        RC.lockRyderMatch(d.ryderCup.matches['d1s1-m1'], 777);
        const before = { a: result(d,'d1s1-m1'), b: result(d,'d1s1-m2') };
        const re = JSON.parse(JSON.stringify(d));
        assert.equal(re.ryderFoursomes['d1s1-m1'].A.h1, 4);
        assert.equal(re.ryderCup.matches['d1s1-m1'].lockedAt, 777);
        assert.equal(result(re,'d1s1-m1').result, before.a.result);
        assert.equal(result(re,'d1s1-m2').thru, before.b.thru);
        assert.equal(result(re,'d1s1-m2').status, before.b.status);
    });

    test('foursomes team scores move no money', () => {
        const A = { gameFormat:'stroke', players: players(), courseData: CD,
            scores: {}, sideMatches: {} };
        players().forEach(p => CD.forEach(h => { A.scores[`p${p.id}_h${h.hole}`] = 4; }));
        A.sideMatches = { w: { format:'match', scoring:'net', stake:20, pressRule:'2down',
            teamAIds:['101'], teamBIds:['105'], presses:{} } };
        const B = JSON.parse(JSON.stringify(A));
        B.ryderCup = cup({ 'd1s1-m1': M1() });
        B.ryderCupRef = { host:'HOST', sessionId:'d1s1' };
        B.ryderFoursomes = ts('d1s1-m1', { A: rep(4), B: rep(5) })['d1s1-m1']
            ? ts('d1s1-m1', { A: rep(4), B: rep(5) }) : {};
        assert.deepEqual(moneyShape(B), moneyShape(A));
    });

    test('no ledger line mentions foursomes', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: rep(4), B: rep(5) }));
        d.sideMatches = { w: { format:'match', scoring:'net', stake:20, pressRule:'none',
            teamAIds:['101'], teamBIds:['105'], presses:{} } };
        players().forEach(p => CD.forEach(h => { d.scores[`p${p.id}_h${h.hole}`] = 4; }));
        Object.values(SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions)
            .forEach(c => c.lines.forEach(l => assert.ok(
                !/foursome|alternate|cup|ryder/i.test(l.label), l.label)));
    });

    test('the team namespace holds no money field', () => {
        const d = round({ 'd1s1-m1': M1() }, ts('d1s1-m1', { A: rep(4), B: rep(5) }));
        const raw = JSON.stringify(d.ryderFoursomes);
        ['stake','payout','money','wager'].forEach(f =>
            assert.ok(raw.indexOf(f) === -1, f));
    });
});

// ===========================================================================
describe('BACKWARD COMPATIBILITY', () => {

    test('a Four-Ball match never reads the foursomes namespace', () => {
        const fb = { id:'fb1', sessionId:'d1s2', format:'fourball', scoring:'net',
            sideA:'A', sideB:'B', playersA:['101','102'], playersB:['105','106'] };
        const d = round({ fb1: fb }, ts('fb1', { A: rep(2), B: rep(9) }));
        d.ryderCupRef.sessionId = 'd1s2';
        players().forEach(p => CD.forEach(h => { d.scores[`p${p.id}_h${h.hole}`] = 4; }));
        const r = RC.computeRyderMatchResult(d, CD, d.scores, 'fb1', d);
        assert.equal(r.format, 'fourball');
        assert.equal(r.status, 0, 'a planted team score must not decide a Four-Ball match');
    });

    test('a Singles match never reads the foursomes namespace', () => {
        const sg = { id:'sg1', sessionId:'d3s1', format:'singles', scoring:'net',
            sideA:'A', sideB:'B', playersA:['101'], playersB:['105'] };
        const d = round({ sg1: sg }, ts('sg1', { A: rep(2), B: rep(9) }));
        players().forEach(p => CD.forEach(h => { d.scores[`p${p.id}_h${h.hole}`] = 4; }));
        const r = RC.computeRyderMatchResult(d, CD, d.scores, 'sg1', d);
        assert.equal(r.status, 0);
    });

    test('legacy gameFormat ryder is unchanged', () => {
        const d = { gameFormat:'ryder', matchStake:50, matchScoring:'net',
            players: players(), courseData: CD, scores: {}, sideMatches: {} };
        d.players.forEach((p,i) => { p.team = i < 4 ? 'Team 1' : 'Team 2'; });
        CD.forEach(h => d.players.forEach((p,i) => {
            d.scores[`p${p.id}_h${h.hole}`] = i < 4 ? 4 : 5; }));
        assert.equal(RC.hasRyderCup(d), false);
        const c = SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions;
        assert.ok(Object.values(c).some(x => x.lines.some(l => /ryder/i.test(l.label))));
        // The RECEIPT path too. A negative control removed 'ryder' from the receipt
        // format array and escaped, because the ledger line comes from elsewhere.
        const main = SETTLE.buildSideMatchReceipts(d, CD, d.scores)
            .find(x => x.matchId === '__main');
        assert.ok(main, 'legacy ryder lost its Receipt block');
    });
});

// ===========================================================================
describe('END-TO-END FOURSOMES SESSION', () => {

    test('two simultaneous matches, a closeout, an 18-hole finish, a correction '
        + 'and an out-of-order hole', () => {
        // Match 1: A closes it out early. Match 2: goes to 18 and finishes 1 up to B.
        const a1 = rep(4), b1 = rep(5);                 // A sweeps -> early closeout
        const a2 = rep(4), b2 = rep(4); b2[17] = 3;     // B wins the last -> B 1 up

        const d = round({ 'd1s1-m1': M1(), 'd1s1-m2': M2() },
            Object.assign(ts('d1s1-m1', { A: a1, B: b1 }), ts('d1s1-m2', { A: a2, B: b2 })));

        // An out-of-order entry and a correction on match 2.
        d.ryderFoursomes['d1s1-m2'].A.h13 = 9;          // wrong, entered late
        assert.equal(result(d, 'd1s1-m2').status, -2, 'the bad hole costs A');
        d.ryderFoursomes['d1s1-m2'].A.h13 = 4;          // corrected
        const m2 = result(d, 'd1s1-m2');
        assert.equal(m2.status, -1);
        assert.equal(m2.thru, 18);
        assert.equal(m2.decided, true);

        const m1 = result(d, 'd1s1-m1');
        assert.equal(m1.closed, true);
        assert.equal(m1.pointsA, 1);

        // Reload midway through and confirm nothing moved.
        const re = JSON.parse(JSON.stringify(d));
        assert.equal(result(re, 'd1s1-m1').result, m1.result);
        assert.equal(result(re, 'd1s1-m2').status, m2.status);

        // Session and Cup points.
        const t = RC.computeRyderCupTotals(re,
            { d1s1: { courseData: CD, scores: {}, roundData: re } });
        assert.equal(t.sides.A.official, 1);
        assert.equal(t.sides.B.official, 1);

        // Individual scores untouched throughout.
        assert.equal(Object.keys(re.scores).length, 0);
    });
});

// ===========================================================================
describe('PAGE WIRING AND MOBILE', () => {

    const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const SM = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');

    test('team entry writes a narrow child path, never the whole object', () => {
        const fn = IDX.slice(IDX.indexOf('function saveFoursomesScore'));
        assert.ok(/ryderTeamScorePath\(matchId, side, hole\)/.test(fn.slice(0, 900)));
        assert.ok(!/ryderFoursomes'\)\.set\(/.test(fn.slice(0, 900)),
            'two groups must not be able to overwrite each other');
    });

    test('team entry never writes an individual score key', () => {
        const fn = IDX.slice(IDX.indexOf('function saveFoursomesScore'),
                             IDX.indexOf('function maybeLockFoursomesMatch'));
        // WIDENED. A negative control wrote to '/scores/p101_h'+hole and escaped,
        // because the earlier pattern required a space before the concatenation.
        // Now anything resembling an individual score path fails.
        assert.ok(!/scores\//.test(fn), 'the writer must not touch events/*/scores');
        assert.ok(!/p\d+_h|'p' ?\+|p\$\{/.test(fn),
            'the Foursomes writer must not build an individual score key');
    });

    test('the entry function is wired to its call site', () => {
        // A negative control renamed saveFoursomesScore to ...RENAMED and escaped,
        // because indexOf('function saveFoursomesScore') still prefix-matched.
        // Pinning the onchange handler closes that.
        assert.ok(/onchange="saveFoursomesScore\(/.test(IDX),
            'the team score box must call saveFoursomesScore');
        assert.ok(/function saveFoursomesScore\(matchId, side, hole, val\) \{/.test(IDX));
    });

    test('the first team score locks the match on the HOST', () => {
        const fn = IDX.slice(IDX.indexOf('function maybeLockFoursomesMatch'));
        assert.ok(/ctx\.res\.host \|\| currentMode/.test(fn.slice(0, 700)),
            'the snapshot belongs on the authoritative host');
    });

    test('team entry appears only for a foursomes session', () => {
        const fn = IDX.slice(IDX.indexOf('function ryderFoursomesContext'));
        assert.ok(/sess\.format !== 'foursomes'\) return null;/.test(fn.slice(0, 900)));
    });

    test('setup warns that individual side games are unavailable', () => {
        assert.ok(/Individual side games are unavailable/i.test(SM));
    });

    test('scratch is offered first and is the default', () => {
        const sel = SM.slice(SM.indexOf('rcSetSessionScoring'));
        assert.ok(sel.indexOf('value="scratch"') < sel.indexOf('value="handicap"'));
    });

    test('the entry card cannot overflow at 360px', () => {
        assert.ok(/\.fs-card, \.fs-card \* \{[^}]*min-width: 0/.test(IDX));
        assert.ok(/\.fs-card, \.fs-card \* \{[^}]*overflow-wrap: anywhere/.test(IDX));
        const block = IDX.slice(IDX.indexOf('.fs-card {'), IDX.indexOf('.fs-vs'));
        assert.ok(!/width:\s*\d{3,}px/.test(block));
    });

    test('the score box is a large touch target', () => {
        assert.ok(/\.fs-in \{[^}]*min-height: 48px/.test(IDX));
    });
});
