// ============================================================================
// HI-LO, THE 2v2 SIDE BET (mailbox 016, 2026-10-19)
//
// Manny's spec: 2v2, own ball. Each hole is two points - LOW BALL (the side whose
// best score is lower) and HIGH BALL (the side whose worse score is lower). A tie
// on a point is a wash: no point, no carry. $ per point; the side behind pays
// (point difference x stake), split per golfer the way every 2v2 bet splits.
//
// WHAT THIS FILE HOLDS
//   1. the engine (hilo-engine.js, pure): wash ties, net vs gross, a mid-round
//      start, a hole a golfer does not finish, and 18 holes checked BY HAND
//   2. settlement: computeCombinedNetTotals and buildSideMatchReceipts carry it,
//      zero-sum, split per golfer, receipt == ledger
//   3. NOTHING ELSE MOVED: the same round with and without a Hi-Lo on it settles
//      every other wager byte-identically, and with hilo-engine.js absent the
//      Hi-Lo adds nothing and breaks nothing
//   4. the Bets line, in Manny's words, from bet-strip.js's row
//   5. the New Action form offers it, 2v2 only, with no presses
//
// THE "HOLE A GOLFER DOES NOT FINISH" RULE, found rather than invented: every 2v2
// bet in this app plays a hole once EACH SIDE has a ball, with whoever posted
// (match-engine.js best ball: t1Valid/t2Valid; calculateOverallBetEngine's side
// best ball; the round-format calculateHiLoEngine). Section 1 holds Hi-Lo's LOW
// ball to match-engine.js's own hole winner on the same card, hole by hole, so
// the two cannot disagree about a missing golfer.
//
// THE SCORECARD BELOW IS THE HAND CHECK. Every hole's low and high result is
// written next to the scores; the totals are counted from those comments, not
// from the engine.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// vm objects come from another realm; compare their plain JSON.
const J = (x) => JSON.parse(JSON.stringify(x));

const ENGINE_FILES = ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
    'pool-engine.js', 'settlement-engine.js'];
function load(extra, opts) {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, isFinite,
        parseInt, parseFloat, Date, Set, Map, RegExp, Error };
    vm.createContext(sb);
    const files = ENGINE_FILES.concat((opts && opts.noHilo) ? [] : ['hilo-engine.js'], extra || []);
    files.forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

const PAR4 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const BOB = { id: 101, name: 'Bob Smith', hcp: '0' };
const MANNY = { id: 102, name: 'Manny Orozco', hcp: '0' };
const CARP = { id: 103, name: 'Carp Jones', hcp: '0' };
const SCOTT = { id: 104, name: 'Scott Lee', hcp: '0' };

// [Bob, Manny | Carp, Scott] per hole, and what the hole decides, by hand.
const CARD18 = [
    [4, 5, 4, 6],   //  1  low 4-4 wash        high 5<6 A
    [3, 5, 4, 4],   //  2  low 3<4 A           high 5>4 B
    [4, 4, 4, 4],   //  3  wash                wash
    [5, 6, 4, 7],   //  4  low 5>4 B           high 6<7 A
    [4, 6, 5, 5],   //  5  low 4<5 A           high 6>5 B
    [3, 4, 4, 5],   //  6  low A               high A
    [5, 5, 4, 6],   //  7  low B               high 5<6 A
    [4, 7, 4, 7],   //  8  wash                wash
    [6, 6, 5, 5],   //  9  low B               high B
    [4, 5, 5, 5],   // 10  low A               high 5-5 wash
    [3, 6, 4, 5],   // 11  low A               high B
    [4, 4, 3, 6],   // 12  low B               high 4<6 A
    [5, 5, 5, 5],   // 13  wash                wash
    [4, 5, 4, 5],   // 14  wash                wash
    [4, 6, 4, 6],   // 15  wash                wash
    [2, 5, 4, 5],   // 16  low A               high wash
    [5, 7, 4, 8],   // 17  low B               high 7<8 A
    [4, 4, 4, 4],   // 18  wash                wash
];
// Counted from the comments above:
//   LOW   A: 2 5 6 10 11 16 = 6     B: 4 7 9 12 17 = 5
//   HIGH  A: 1 4 6 7 12 17 = 6      B: 2 5 9 11 = 4
//   points A 12, B 9, A +3. At $5 a point side B pays $15: $7.50 a golfer.
const HAND = { lowA: 6, lowB: 5, highA: 6, highB: 4, pointsA: 12, pointsB: 9 };

function scoresOf(card, ids) {
    const sc = {};
    card.forEach((row, i) => row.forEach((v, j) => {
        if (v !== null && v !== undefined) sc['p' + ids[j] + '_h' + (i + 1)] = v;
    }));
    return sc;
}
const IDS = [101, 102, 103, 104];

function hiloRound({ card = CARD18, stake = 5, scoring = 'gross', startHole = 1, players, extraSide } = {}) {
    const sm = { hl1: { format: 'hilo', scoring, stake, pressRule: 'none',
        teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole, createdAt: 2 } };
    if (extraSide) Object.assign(sm, extraSide);
    return {
        gameFormat: 'stroke', holeBetStake: 0, settlementMode: 'whole-dollar',
        players: players || [BOB, MANNY, CARP, SCOTT],
        courseData: PAR4, scores: scoresOf(card, IDS), sideMatches: sm
    };
}

// ---------------------------------------------------------------------------
describe('1. THE ENGINE (hilo-engine.js, pure)', () => {
    const E = load();

    test('18 holes, hand-checked: Low 6-5, High 6-4, Bob + Manny +3', () => {
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], PAR4, scoresOf(CARD18, IDS),
            { scoring: 'gross', stake: 5 });
        Object.keys(HAND).forEach(k => assert.equal(r[k], HAND[k], k));
        assert.equal(r.diff, 3);
        assert.equal(r.toSideA, 15);
        assert.equal(r.played, 18);
        assert.equal(r.complete, true);
        // hole by hole, against the comments
        const want = { 1: [null, 'A'], 2: ['A', 'B'], 3: [null, null], 4: ['B', 'A'], 5: ['A', 'B'],
            6: ['A', 'A'], 7: ['B', 'A'], 8: [null, null], 9: ['B', 'B'], 10: ['A', null],
            11: ['A', 'B'], 12: ['B', 'A'], 13: [null, null], 14: [null, null], 15: [null, null],
            16: ['A', null], 17: ['B', 'A'], 18: [null, null] };
        Object.keys(want).forEach(h => assert.deepEqual(
            [r.holeLog[h].low, r.holeLog[h].high], want[h], 'hole ' + h));
        assert.equal(E.hiloLine(r, 'Bob + Manny', 'Carp + Scott'),
            'Hi-Lo: Bob + Manny +3 (Low 6-5, High 6-4)');
    });

    test('wash ties: a tied point is nobody\'s and nothing carries', () => {
        // Hole 1 ties both points; hole 2 is then an ordinary A/A hole and is worth
        // exactly 2 - not 4.
        const card = [[4, 5, 4, 5], [3, 4, 4, 5]];
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], PAR4.slice(0, 2),
            scoresOf(card, IDS), { scoring: 'gross', stake: 10 });
        assert.deepEqual([r.lowA, r.lowB, r.highA, r.highB], [1, 0, 1, 0]);
        assert.equal(r.toSideA, 20);
        assert.deepEqual(J(r.holeLog[1]), { low: null, high: null });
        // every hole a wash: nobody pays anything
        const all = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], PAR4.slice(0, 3),
            scoresOf([[4, 5, 4, 5], [3, 3, 3, 3], [6, 4, 4, 6]], IDS), { scoring: 'gross', stake: 10 });
        assert.equal(all.pointsA + all.pointsB, 0);
        assert.equal(all.toSideA, 0);
        assert.equal(E.hiloLine(all, 'Bob + Manny', 'Carp + Scott'), 'Hi-Lo: All square (Low 0-0, High 0-0)');
    });

    test('net vs gross: the round\'s handicap strokes per hole decide it', () => {
        // Scott plays off 18 - one stroke on every hole. Carp, Bob, Manny scratch.
        //   hole 1: Bob 4 Manny 5 | Carp 4 Scott 6   gross: low wash, high A (5<6)
        //                                            net:   Scott 5 -> low wash, high wash
        //   hole 2: Bob 4 Manny 4 | Carp 4 Scott 5   gross: low wash, high A (4<5)
        //                                            net:   Scott 4 -> wash, wash
        const scott18 = Object.assign({}, SCOTT, { hcp: '18' });
        const sc = scoresOf([[4, 5, 4, 6], [4, 4, 4, 5]], IDS);
        const gross = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, scott18], PAR4.slice(0, 2), sc, { scoring: 'gross', stake: 5 });
        const net = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, scott18], PAR4.slice(0, 2), sc, { scoring: 'net', stake: 5 });
        assert.equal(gross.diff, 2);
        assert.equal(gross.toSideA, 10);
        assert.equal(net.diff, 0);
        assert.equal(net.toSideA, 0);
        // a 9 gets a stroke on SI 1-9 only: hole 10 (SI 10) is gross for him
        const nine = Object.assign({}, SCOTT, { hcp: '9' });
        const h10 = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, nine], [PAR4[9]],
            { p101_h10: 4, p102_h10: 5, p103_h10: 4, p104_h10: 6 }, { scoring: 'net', stake: 5 });
        assert.deepEqual(J(h10.holeLog[10]), { low: null, high: 'A' });
        // the stroke is the card's own getStrokes, not a second allocation
        assert.equal(E.getStrokes(10, E.parseHcp('9')), 0);
        assert.equal(E.getStrokes(9, E.parseHcp('9')), 1);
    });

    test('a hole a golfer does not finish: the side plays whoever posted (the 2v2 rule)', () => {
        // hole 1: Manny has no score. Side A's one ball (Bob 4) is its low AND its
        //         high: low 4<5 A, high 4<6 A.
        // hole 2: Side B has no score at all - the hole is not played, nobody scores.
        // hole 3: everybody: Bob 4 Manny 5 | Carp 4 Scott 4 -> low wash, high B
        const card = [[4, null, 5, 6], [4, 5, null, null], [4, 5, 4, 4]];
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], PAR4.slice(0, 3),
            scoresOf(card, IDS), { scoring: 'gross', stake: 5 });
        assert.deepEqual(J(r.holeLog[1]), { low: 'A', high: 'A' });
        assert.equal(r.holeLog[2], undefined);
        assert.deepEqual(J(r.holeLog[3]), { low: null, high: 'B' });
        assert.equal(r.played, 2);
        assert.equal(r.complete, false, 'a hole one side never played leaves the range open');
        assert.equal(r.diff, 1);
    });

    test('the LOW ball is match-engine.js best ball, hole for hole, missing golfers and all', () => {
        // The same rule, measured: every hole match-engine decides, Hi-Lo's low
        // point goes the same way; every hole it halves, the low point is a wash;
        // every hole it skips, Hi-Lo skips.
        const card = CARD18.map((row, i) => i === 3 ? [row[0], null, row[2], row[3]]
            : (i === 7 ? [null, null, row[2], row[3]] : (i === 12 ? [row[0], row[1], null, row[3]] : row)));
        const sc = scoresOf(card, IDS);
        const tagged = [BOB, MANNY].map(p => Object.assign({}, p, { team: 'Team 1' }))
            .concat([CARP, SCOTT].map(p => Object.assign({}, p, { team: 'Team 2' })));
        const m = E.calculateMatchEngine(tagged, PAR4, sc, 'gross', 'match', 'none', 0, 0, []);
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], PAR4, sc, { scoring: 'gross', stake: 1 });
        let compared = 0;
        PAR4.forEach(h => {
            const mw = m.holeLog[h.hole] ? m.holeLog[h.hole].holeWinner : undefined;
            const hl = r.holeLog[h.hole];
            if (mw === undefined) { assert.equal(hl, undefined, 'hole ' + h.hole); return; }
            compared++;
            const want = mw === 'Halved' ? null : (mw === m.t1Name ? 'A' : 'B');
            assert.equal(hl.low, want, 'hole ' + h.hole);
        });
        assert.equal(compared, 17, 'hole 8 (side A blank) is skipped by both');
    });

    test('a mid-round start: only the holes from "Starts on" count', () => {
        // From the hand card, holes 10-18 only:
        //   LOW  A: 10 11 16 = 3   B: 12 17 = 2
        //   HIGH A: 12 17 = 2      B: 11 = 1        A 5, B 3, +2
        const holes = E.sideMatchHoles({ startHole: 10 }, PAR4);
        assert.equal(holes.length, 9);
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, SCOTT], holes, scoresOf(CARD18, IDS), { scoring: 'gross', stake: 5 });
        assert.deepEqual([r.lowA, r.lowB, r.highA, r.highB], [3, 2, 2, 1]);
        assert.equal(r.toSideA, 10);
        assert.equal(r.holeLog[2], undefined, 'a hole before the start decides nothing');
    });

    test('the shape it must be saved in: two against two', () => {
        assert.equal(E.hiloShapeOk(['1', '2'], ['3', '4']), true);
        assert.equal(E.hiloShapeOk(['1'], ['3']), false);
        assert.equal(E.hiloShapeOk(['1', '2'], ['3']), false);
    });
});

// ---------------------------------------------------------------------------
describe('2. SETTLEMENT carries it (settlement-engine.js, the existing path)', () => {
    const E = load();

    test('computeCombinedNetTotals: $15 to Bob + Manny, $7.50 a golfer, zero-sum, one labelled line', () => {
        const d = hiloRound();
        const c = E.computeCombinedNetTotals(d, PAR4, d.scores);
        const ex = {}; Object.values(c.exact).forEach(v => { ex[v.name] = v.net; });
        assert.deepEqual(ex, { 'Bob Smith': 7.5, 'Manny Orozco': 7.5, 'Carp Jones': -7.5, 'Scott Lee': -7.5 });
        const sumExact = Object.values(ex).reduce((a, b) => a + b, 0);
        const sumWhole = Object.values(c.netByName).reduce((a, v) => a + v.net, 0);
        assert.equal(sumExact, 0);
        assert.equal(sumWhole, 0, 'whole-dollar rounding keeps it zero-sum');
        const lines = c.contributions['bob smith'].lines.filter(l => !l.note && !l.rounding);
        assert.equal(lines.length, 1);
        assert.equal(lines[0].label, 'Side Match \u00B7 Bob Smith/Manny Orozco vs Carp Jones/Scott Lee \u00B7 Hi-Lo');
        // settlement.html's Pay out drops a side-match line whose notes explain it by
        // matching 'Side Match · ' + the notes' group - so the label must start that way.
        const groups = c.contributions['bob smith'].lines.filter(l => l.note && l.group).map(l => l.group);
        assert.ok(groups.length === 2 && lines[0].label.indexOf('Side Match \u00B7 ' + groups[0]) === 0);
        // the segment detail notes explain it: Low Ball $5 x1, High Ball $5 x2
        const notes = c.contributions['bob smith'].lines.filter(l => l.note).map(l => [l.label, l.amount]);
        assert.deepEqual(J(notes), [['Low Ball · $5 · H1', 2.5], ['High Ball · $5 · H1', 5]]);
        // Who Pays Who moves $15 in all: side B pays side A
        const moved = c.transactions.reduce((a, t) => a + t.amount, 0);
        assert.equal(moved, 15);
    });

    test('the receipt: Hi-Lo, two bets, segments sum to the ledger', () => {
        const d = hiloRound();
        const rc = E.buildSideMatchReceipts(d, PAR4, d.scores).find(r => r.matchId === 'hl1');
        assert.equal(rc.format, 'Hi-Lo');
        assert.equal(rc.scoring, 'Gross');
        assert.equal(rc.isTeam, true);
        assert.deepEqual(J(rc.segments.map(s => [s.label, s.result, s.winner, s.money, s.toSideA])), [
            ['Low Ball', 'Bob / Manny 6-5', 'Bob / Manny', 5, true],
            ['High Ball', 'Bob / Manny 6-4', 'Bob / Manny', 10, true]
        ]);
        assert.equal(rc.net, 15);
        assert.equal(rc.perPlayerA, 7.5);
        assert.equal(rc.perPlayerB, -7.5);
    });

    test('mid-round no money is DECIDED on the receipt; the ledger is the running figure', () => {
        const card = CARD18.map((row, i) => i < 9 ? row : [null, null, null, null]);
        const d = hiloRound({ card });
        const rc = E.buildSideMatchReceipts(d, PAR4, d.scores).find(r => r.matchId === 'hl1');
        assert.ok(rc.segments.every(s => s.winner === null), 'no winner until every hole is in');
    });

    test('a later start settles only its holes ($10, from the 10th)', () => {
        const d = hiloRound({ startHole: 10 });
        const c = E.computeCombinedNetTotals(d, PAR4, d.scores);
        const ex = {}; Object.values(c.exact).forEach(v => { ex[v.name] = v.net; });
        assert.deepEqual(ex, { 'Bob Smith': 5, 'Manny Orozco': 5, 'Carp Jones': -5, 'Scott Lee': -5 });
        const rc = E.buildSideMatchReceipts(d, PAR4, d.scores).find(r => r.matchId === 'hl1');
        assert.equal(rc.segments[0].startHole, 10);
    });

    test('net: the same card at net with Scott off 18 is a different bet', () => {
        const players = [BOB, MANNY, CARP, Object.assign({}, SCOTT, { hcp: '18' })];
        const g = hiloRound({ players, scoring: 'gross' });
        const n = hiloRound({ players, scoring: 'net' });
        const gx = E.computeCombinedNetTotals(g, PAR4, g.scores).exact;
        const nx = E.computeCombinedNetTotals(n, PAR4, n.scores).exact;
        assert.equal(gx['bob smith'].net, 7.5);
        assert.notEqual(nx['bob smith'].net, gx['bob smith'].net);
        const r = E.calculateHiLoSideMatch([BOB, MANNY], [CARP, players[3]], PAR4, n.scores, { scoring: 'net', stake: 5 });
        assert.equal(nx['bob smith'].net, r.toSideA / 2);
        assert.equal(nx['bob smith'].net + nx['manny orozco'].net + nx['carp jones'].net + nx['scott lee'].net, 0);
    });
});

// ---------------------------------------------------------------------------
describe('3. NOTHING ELSE MOVED', () => {
    // A round with every other kind of side bet on it, and a skins main game.
    const others = {
        m1: { format: 'match', scoring: 'net', stake: 20, pressRule: '2down', teamAIds: ['101'], teamBIds: ['103'], startHole: 1, createdAt: 1 },
        n1: { format: 'nassau', scoring: 'gross', stake: 10, frontStake: 5, backStake: 5, overallStake: 10, pressRule: '2down',
              teamAIds: ['101', '102'], teamBIds: ['103', '104'], startHole: 1, createdAt: 3 },
        s1: { format: 'stroke', scoring: 'net', holeStake: 2, overallStake: 10, tieRule: 'void', overallMode: 'stroke', segment: 'full',
              teamAIds: ['102'], teamBIds: ['104'], startHole: 4, createdAt: 4 }
    };
    const hcps = [BOB, Object.assign({}, MANNY, { hcp: '7' }), Object.assign({}, CARP, { hcp: '3' }), Object.assign({}, SCOTT, { hcp: '12' })];
    function base(withHilo) {
        const d = hiloRound({ players: hcps, extraSide: others, scoring: 'net' });
        d.gameFormat = 'skins'; d.skinsBuyIn = 10; d.holeBetStake = 0;
        if (!withHilo) delete d.sideMatches.hl1;
        return d;
    }
    const strip = (c) => {
        const out = {};
        Object.keys(c.contributions).forEach(k => {
            out[k] = c.contributions[k].lines.filter(l => !/Hi-Lo|Low Ball|High Ball|Rounding/.test(l.label));
        });
        return out;
    };

    test('every other wager settles byte-identically with a Hi-Lo beside it', () => {
        const E = load();
        const without = base(false), withHl = base(true);
        const a = E.computeCombinedNetTotals(without, PAR4, without.scores);
        const b = E.computeCombinedNetTotals(withHl, PAR4, withHl.scores);
        assert.deepEqual(J(strip(b)), J(strip(a)));
        const hl = E.calculateHiLoSideMatch([hcps[0], hcps[1]], [hcps[2], hcps[3]], PAR4, withHl.scores, { scoring: 'net', stake: 5 });
        assert.ok(hl.toSideA !== 0, 'the Hi-Lo on this round moves money, so the comparison means something');
        Object.keys(a.exact).forEach(k => {
            const share = (k === 'bob smith' || k === 'manny orozco') ? hl.toSideA / 2 : -hl.toSideA / 2;
            assert.ok(Math.abs(b.exact[k].net - a.exact[k].net - share) < 1e-9, k);
        });
        const ra = E.buildSideMatchReceipts(without, PAR4, without.scores);
        const rb = E.buildSideMatchReceipts(withHl, PAR4, withHl.scores).filter(r => r.matchId !== 'hl1');
        assert.deepEqual(J(rb), J(ra));
    });

    test('without hilo-engine.js the other money is exactly what it was, and Hi-Lo adds nothing', () => {
        const E0 = load([], { noHilo: true });
        const E = load();
        const d = base(true), plain = base(false);
        const a = E0.computeCombinedNetTotals(d, PAR4, d.scores);
        const b = E.computeCombinedNetTotals(plain, PAR4, plain.scores);
        assert.deepEqual(J(a.exact), J(b.exact));
        assert.equal(E0.buildSideMatchReceipts(d, PAR4, d.scores).some(r => r.matchId === 'hl1'), false);
    });

    test('a Hi-Lo record never reaches calculateMatchEngine (no match-play money for it)', () => {
        const E = load();
        let calls = 0;
        const orig = E.calculateMatchEngine;
        E.calculateMatchEngine = function () { calls++; return orig.apply(this, arguments); };
        const d = hiloRound();
        E.computeCombinedNetTotals(d, PAR4, d.scores);
        E.buildSideMatchReceipts(d, PAR4, d.scores);
        assert.equal(calls, 0);
    });

    test('settlement-engine.js: the Hi-Lo edit is two additive branches and no golf maths', () => {
        const src = read('settlement-engine.js');
        const branches = src.match(/if \(sm\.format === 'hilo'\) \{/g) || [];
        assert.equal(branches.length, 2);
        assert.ok(/typeof hiloReceipt === 'function'/.test(src));
        assert.ok(/typeof hiloForSideMatch === 'function'/.test(src));
        // no stroke or point arithmetic for Hi-Lo lives in the protected file
        const hlBlocks = src.split("if (sm.format === 'hilo') {").slice(1).map(s => s.slice(0, s.indexOf('return;')));
        assert.equal(hlBlocks.length, 2);
        hlBlocks.forEach(b => assert.ok(!/getStrokes|lowA|highA|points/.test(b), b));
    });
});

// ---------------------------------------------------------------------------
describe('4. THE BETS LINE (bet-strip.js row; the scorecard, Bets and Matches read it)', () => {
    const E = load(['side-match-lines.js', 'bet-strip.js']);
    // Manny's example, built hole by hole:  L5-3, H4-3, +3
    //   h1 A/A  h2 A/A  h3 A/A  h4 A/B  h5 A/B  h6 B/B  h7 B/A  h8 B/wash
    const EIGHT = [[3, 4, 4, 5], [3, 4, 4, 5], [3, 4, 4, 5], [3, 6, 4, 5], [3, 6, 4, 5],
        [4, 5, 3, 4], [4, 4, 3, 5], [4, 5, 3, 5]];
    const card = EIGHT.concat(Array.from({ length: 10 }, () => [null, null, null, null]));
    const players = [{ id: 101, name: 'Bob', hcp: '0' }, { id: 102, name: 'Manny', hcp: '0' },
        { id: 103, name: 'Carp', hcp: '0' }, { id: 104, name: 'Scott', hcp: '0' }];

    test('"Hi-Lo: Bob + Manny +3 (Low 5-3, High 4-3)"', () => {
        const d = hiloRound({ card, players });
        const rows = E.buildSideActionRows(d, PAR4, d.scores, players, '102');
        assert.equal(rows.length, 1);
        const r = rows[0];
        assert.equal(r.status, 'Hi-Lo: Bob + Manny +3 (Low 5-3, High 4-3)');
        assert.equal(r.sentence, r.status);
        assert.equal(r.format, 'Hi-Lo');
        assert.equal(r.tone, 'up', 'Manny is on the side that leads');
        assert.equal(r.netMoney, 0, 'no dollars mid-round');
        assert.equal(r.netText, '');
        assert.equal(r.stakeText, '$5/pt');
        assert.equal(r.thruShort, 'Thru 8');
        assert.equal(r.canPress, false);
        assert.equal(E.buildSideActionRows(d, PAR4, d.scores, players, '104')[0].tone, 'down');
    });

    test('finished: the row turns FINAL and carries the decided money, per golfer', () => {
        const d = hiloRound();
        const rows = E.buildSideActionRows(d, PAR4, d.scores, d.players, '102');
        assert.equal(rows[0].tone, 'final');
        assert.equal(rows[0].netMoney, 15);
        assert.equal(rows[0].netText, "You're up $7.50 · $15 team");
    });

    test('the hole recap never calls a Hi-Lo match play', () => {
        assert.equal(E.sideMatchRoundConfig({ format: 'hilo', teamAIds: ['101', '102'], teamBIds: ['103', '104'] },
            [BOB, MANNY, CARP, SCOTT]), null);
        // and the formats it does map are untouched
        const cfg = E.sideMatchRoundConfig({ format: 'match', stake: 5, teamAIds: ['101'], teamBIds: ['103'] }, [BOB, CARP]);
        assert.equal(cfg.gameFormat, 'match');
    });
});

// ---------------------------------------------------------------------------
describe('5. NEW ACTION offers it, 2v2, $ a point, no presses (sidematches.html)', () => {
    const html = read('sidematches.html');

    test('the option, the script and the note', () => {
        assert.ok(/<option value="hilo">Hi-Lo \(2v2/.test(html));
        assert.ok(/<script src="hilo-engine.js"><\/script>/.test(html));
        assert.ok(/id="sm-hilo-note"/.test(html));
    });

    test('save refuses anything but four golfers, and a $0 amount; presses are off', () => {
        const at = html.indexOf("if (format === 'hilo') {\n            if (!(typeof hiloShapeOk");
        assert.ok(at > 0);
        const block = html.slice(at, html.indexOf('THE STROKE REFUSAL', at));
        assert.ok(/tap four golfers/.test(block));
        assert.ok(/\$ per point above 0/.test(block));
        assert.ok(/terms\.pressRule = 'none'/.test(block));
        // the refusal sits BEFORE the payload is built and written
        assert.ok(at < html.indexOf('const payload = sideMatchPayloadFromTerms(terms'));
    });

    test('every page that settles a round loads hilo-engine.js after aloha-bet.js', () => {
        ['index.html', 'sidematches.html', 'skins.html', 'settlement.html', 'stats.html', 'trip.html',
            'leaderboard.html', 'game.html', 'season.html', 'admin.html'].forEach(f => {
            const s = read(f);
            const a = s.indexOf('<script src="aloha-bet.js"></script>');
            const h = s.indexOf('<script src="hilo-engine.js"></script>');
            assert.ok(a > 0 && h > a, f);
        });
        assert.ok(/'\.\/hilo-engine\.js'/.test(read('sw.js')));
        assert.ok(/'hilo-engine\.js'/.test(read('sync-mobile-web.js')));
    });

    test('the challenge path still refuses it (challenges are 1v1)', () => {
        const C = load(['challenges.js']);
        assert.equal(C.challengeTermsRefuse({ format: 'hilo', stake: 5, startHole: 1 }), 'Pick Match Play, Nassau or Stroke Play.');
    });
});

// NET OFF THE LOWEST HANDICAP IN THE MATCH (Manny, Oct 19) - like 2v2 Match Play / Nassau.
// Bob 2, Manny 12 | Carp 8, Scott 20 on a stroke-index-1 hole: baseline 2, so Bob gets 0,
// Manny 1 (10 rel), Carp 1 (6 rel), Scott 1 (18 rel). Gross 4/6 | 5/6 -> net 4/5 | 4/5:
// both points are a wash. With full course strokes (Bob 1, Scott 2) it would have been
// low A, high B - so this hole tells the two rules apart.
describe('Hi-Lo net strokes come off the lowest handicap in the match', () => {
    test('one baseline for all four; the low golfer plays off zero; washes as hand-checked', () => {
        const sb = load();
        const A = [{ id: 1, name: 'Bob', hcp: '2' }, { id: 2, name: 'Manny', hcp: '12' }];
        const B = [{ id: 3, name: 'Carp', hcp: '8' }, { id: 4, name: 'Scott', hcp: '20' }];
        const holes = [{ hole: 1, par: 4, hcpIndex: 1 }];
        const scores = { p1_h1: 4, p2_h1: 6, p3_h1: 5, p4_h1: 6 };
        const r = J(sb.calculateHiLoSideMatch(A, B, holes, scores, { scoring: 'net', stake: 5 }));
        assert.equal(r.baseline, 2);
        assert.deepEqual([r.lowA, r.lowB, r.highA, r.highB], [0, 0, 0, 0]);
        assert.equal(r.toSideA, 0);
        const g = J(sb.calculateHiLoSideMatch(A, B, holes, scores, { scoring: 'gross', stake: 5 }));
        assert.deepEqual([g.lowA, g.lowB, g.highA, g.highB], [1, 0, 0, 0], 'gross: Bob 4 beats Carp 5; high 6-6 wash');
    });
});
