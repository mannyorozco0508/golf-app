// ============================================================================
// TEAM RELATIVE MATCH-PLAY HANDICAPS — ONE BASELINE FOR THE WHOLE MATCH
//
// The singles fix (relative_handicap_test.js) was deliberately gated to 1v1:
// anything with more than one player a side fell through to each golfer's FULL
// course handicap. That is stroke-play net allocation wearing a match-play hat,
// and it put strokes on the wrong holes for every team match the app supports.
//
// THE RULE THESE TESTS PIN:
//   The lowest Playing Handicap among EVERY golfer in the match plays off zero.
//   Every other golfer - INCLUDING THE LOWEST GOLFER'S OWN PARTNER - receives the
//   arithmetic difference from that one baseline, allocated from SI 1 upward.
//   One baseline per match. Never per team, per Nassau segment, or per press.
//
// A NOTE ON WHAT THIS FILE CANNOT CLAIM. A Best Ball SUPPLIER REVERSAL - old
// model picks partner A, new model picks partner B - is mathematically
// impossible under this change, and these tests prove that rather than pretend
// otherwise. Two partners share one baseline, so the shift in their relative net
// scores is bounded at a single stroke; a strict ordering can be tied or untied,
// never reversed. What genuinely changes, and what decides money, is the team's
// best-ball VALUE and the HOLE WINNER. Both are proven below with real engine
// execution.
//
// Every test here runs REAL production code. Nothing is reimplemented.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const PAGE_DEPS = {
    'index.html': ['score-marks.js', 'money-engine.js', 'action-model.js',
                   'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'],
    'sidematches.html': ['money-engine.js', 'action-model.js', 'settlement-engine.js'],
    'stats.html': ['money-engine.js', 'action-model.js', 'settlement-engine.js'],
};
const realms = {};
function fromPage(page, expr) {
    if (!realms[page]) realms[page] = loadHtmlInlineScript(page, PAGE_DEPS[page]);
    return vm.runInContext(expr, realms[page]);
}
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// A REAL layout where stroke index 1 is HOLE 7 - deliberately not hole 1, so no
// test here can pass by confusing hole number with stroke index.
const SI = { 7:1, 3:2, 12:3, 16:4, 1:5, 9:6, 5:7, 14:8, 18:9,
             2:10, 11:11, 8:12, 15:13, 4:14, 17:15, 6:16, 13:17, 10:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: SI[i + 1] }));
const holeOfSI = (si) => Number(Object.keys(SI).find(h => SI[h] === si));

const player = (id, name, hcp, team) => ({ id, name, hcp: String(hcp), team });

// The canonical 2v2 from the specification: 5 and 12 against 8 and 17.
function twoVtwo(hcps, ids) {
    const i = ids || [101, 102, 103, 104];
    return [
        player(i[0], 'A', hcps[0], 'Team 1'), player(i[1], 'B', hcps[1], 'Team 1'),
        player(i[2], 'C', hcps[2], 'Team 2'), player(i[3], 'D', hcps[3], 'Team 2'),
    ];
}
function levelScores(players, gross) {
    const s = {};
    players.forEach(p => cd18.forEach(h => { s['p' + p.id + '_h' + h.hole] = gross || 5; }));
    return s;
}
function runMatch(E, players, opts) {
    const o = opts || {};
    return plain(E.calculateMatchEngine(
        players, o.holes || cd18, o.scores || levelScores(players),
        o.scoring || 'net', o.format || 'match', o.pressRule || 'none',
        o.stake === undefined ? 10 : o.stake, o.holeBet || 0,
        o.presses || [], o.stakeConfig));
}
// The contract expressed INDEPENDENTLY of the implementation.
const expectAlloc = (rel, si) => (rel > 0 ? Math.floor(rel / 18) + ((si <= (rel % 18)) ? 1 : 0) : 0);

// ============================================================================
describe('THE BASELINE IS THE WHOLE MATCH, NOT THE TEAM', () => {

    test('1v1 10 vs 20 gives 0 and 10 (the committed singles contract)', () => {
        const E = engineRealm();
        const ps = [player(1, 'A', 10, 'Team 1'), player(2, 'B', 20, 'Team 2')];
        const calc = runMatch(E, ps);
        assert.equal(calc.matchBaseline, 10);
        assert.deepEqual(calc.relHcpById, { '1': 0, '2': 10 });
    });

    test('the existing 7 vs 12 case still resolves to 0 and 5', () => {
        const E = engineRealm();
        const ps = [player(1, 'A', 7, 'Team 1'), player(2, 'B', 12, 'Team 2')];
        assert.deepEqual(runMatch(E, ps).relHcpById, { '1': 0, '2': 5 });
    });

    test('2v2 5,12 vs 8,17 gives 0,7 vs 3,12', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]));
        assert.equal(calc.matchBaseline, 5, 'one baseline, taken across all four golfers');
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
    });

    test('THE LOWEST GOLFER\u2019S OWN PARTNER RECEIVES STROKES', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]));
        assert.equal(calc.relHcpById['102'], 7,
            'the 12 is the 5\u2019s partner and must still receive 7 - this is the whole point');
        assert.notEqual(calc.relHcpById['102'], 0, 'the partner does NOT play off zero');
        assert.notEqual(calc.relHcpById['102'], 12, 'nor off a full course handicap');
    });

    test('the second specification example 5,7 vs 11,18 gives 0,2,6,13', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 7, 11, 18]));
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 2, '103': 6, '104': 13 });
    });

    test('the lowest golfer may sit on Team 1', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 20, 9, 14]));
        assert.equal(calc.matchBaseline, 5);
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 15, '103': 4, '104': 9 });
    });

    test('the lowest golfer may sit on Team 2', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([14, 20, 5, 9]));
        assert.equal(calc.matchBaseline, 5, 'a Team 2 golfer sets the baseline just as readily');
        assert.deepEqual(calc.relHcpById, { '101': 9, '102': 15, '103': 0, '104': 4 });
    });

    test('NO SEPARATE BASELINE PER TEAM', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]));
        // Per-team baselines would give Team 2 a baseline of 8: 8->0 and 17->9.
        assert.notEqual(calc.relHcpById['103'], 0, 'Team 2\u2019s low golfer is NOT its own zero');
        assert.equal(calc.relHcpById['103'], 3);
        assert.notEqual(calc.relHcpById['104'], 9);
        assert.equal(calc.relHcpById['104'], 12);
    });

    test('player ORDER within a team does not change the result', () => {
        const E = engineRealm();
        const a = runMatch(E, twoVtwo([5, 12, 8, 17]));
        const b = runMatch(E, twoVtwo([12, 5, 17, 8], [102, 101, 104, 103]));
        assert.equal(a.matchBaseline, b.matchBaseline);
        assert.deepEqual(a.relHcpById, b.relHcpById);
    });

    test('TEAM order does not change the result', () => {
        const E = engineRealm();
        const a = runMatch(E, twoVtwo([5, 12, 8, 17]));
        const swapped = [
            player(103, 'C', 8, 'Team 1'), player(104, 'D', 17, 'Team 1'),
            player(101, 'A', 5, 'Team 2'), player(102, 'B', 12, 'Team 2'),
        ];
        const b = runMatch(E, swapped);
        assert.equal(a.matchBaseline, b.matchBaseline, 'the minimum is order-independent');
        assert.deepEqual(a.relHcpById, b.relHcpById);
    });

    test('tied lowest golfers BOTH play off zero', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([6, 14, 6, 19]));
        assert.equal(calc.relHcpById['101'], 0);
        assert.equal(calc.relHcpById['103'], 0, 'a tie for lowest is not broken by team');
    });

    test('all equal handicaps means zero for everyone', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([11, 11, 11, 11]));
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 0, '103': 0, '104': 0 });
        Object.values(calc.holeLog).forEach(h => {
            assert.equal(h.holeWinner, 'Halved', 'level scores off level strokes halve every hole');
        });
    });
});

// ============================================================================
describe('PLUS HANDICAPS ARE PLAIN ARITHMETIC', () => {

    test('+2, 3, 7, 10 gives 0, 5, 9, 12', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo(['+2', 3, 7, 10]));
        assert.equal(E.parseHcp('+2'), -2, 'parseHcp stores a plus handicap as a negative');
        assert.equal(calc.matchBaseline, -2);
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 5, '103': 9, '104': 12 });
    });

    test('the plus golfer takes NO SI 17/18 giveback in a match', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo(['+2', 3, 7, 10]));
        assert.equal(calc.relHcpById['101'], 0);
        // Stroke play gives a plus player a stroke BACK at the highest indexes.
        assert.equal(E.getStrokes(18, -2), -1, 'stroke play keeps its giveback, untouched');
        assert.equal(E.allocateMatchStrokes(0, 18), 0, 'the match does not');
    });

    test('a plus golfer who is NOT lowest still receives strokes', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo(['+4', '+1', 2, 6]));
        assert.equal(calc.matchBaseline, -4);
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 3, '103': 6, '104': 10 });
    });
});

// ============================================================================
describe('MULTI-STROKE DIFFERENTIALS GENERALISE', () => {

    const cases = [
        { rel: 20, label: 'one stroke everywhere plus a second on SI 1-2',
          expect: si => 1 + (si <= 2 ? 1 : 0) },
        { rel: 36, label: 'two strokes on every hole',
          expect: () => 2 },
        { rel: 40, label: 'two everywhere plus a third on SI 1-4',
          expect: si => 2 + (si <= 4 ? 1 : 0) },
    ];

    cases.forEach(c => {
        test(`relative ${c.rel}: ${c.label}`, () => {
            const E = engineRealm();
            for (let si = 1; si <= 18; si++) {
                assert.equal(E.allocateMatchStrokes(c.rel, si), c.expect(si),
                    `SI ${si} under a relative handicap of ${c.rel}`);
            }
        });
    });

    test('a >18 differential reaches the engine intact', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([4, 24, 10, 44]));
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 20, '103': 6, '104': 40 });
        // Not capped at 18, and not silently truncated to a single stroke.
        assert.equal(E.allocateMatchStrokes(40, 1), 3);
        assert.equal(E.allocateMatchStrokes(40, 18), 2);
    });

    test('ALLOCATION FOLLOWS STROKE INDEX, NOT HOLE NUMBER', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 5, 5]);
        const calc = runMatch(E, ps);
        assert.equal(calc.relHcpById['102'], 7);
        // SI 1 is hole 7 in this layout. The 7 strokes must land on SI 1-7.
        const stroked = cd18.filter(h => expectAlloc(7, h.hcpIndex) > 0).map(h => h.hole).sort((a, b) => a - b);
        const bySI = cd18.filter(h => h.hcpIndex <= 7).map(h => h.hole).sort((a, b) => a - b);
        assert.deepEqual(stroked, bySI);
        assert.ok(stroked.includes(7), 'hole 7 is SI 1 and MUST be stroked');
        assert.ok(!stroked.includes(10), 'hole 10 is SI 18 and must NOT be');
    });

    test('if hole 7 is SI 1, the FIRST stroke occurs on hole 7', () => {
        assert.equal(holeOfSI(1), 7);
        const E = engineRealm();
        const ps = [player(1, 'A', 5, 'Team 1'), player(2, 'B', 6, 'Team 2')];
        const calc = runMatch(E, ps);
        assert.equal(calc.relHcpById['2'], 1, 'a single stroke');
        const won = Object.keys(calc.holeLog)
            .filter(k => calc.holeLog[k].holeWinner && calc.holeLog[k].holeWinner !== 'Halved')
            .map(Number);
        assert.deepEqual(won, [7], 'off level gross, the one stroke decides hole 7 and nothing else');
    });
});

// ============================================================================
describe('ADVERSARIAL — REAL SCORES, REAL DECISIONS CHANGE', () => {

    // 5 / 12 vs 8 / 17. On SI 1 (hole 7) the old model gave the 5 a stroke it
    // does not get under a relative baseline, and that stroke was halving a hole
    // Team 2 should have won.
    const H = [5, 12, 8, 17];
    const GROSS = { 101: 3, 102: 4, 103: 3, 104: 3 };

    function scoresWith(players, holeNum) {
        const s = levelScores(players, 5);
        players.forEach(p => { s['p' + p.id + '_h' + holeNum] = GROSS[p.id]; });
        return s;
    }

    test('BEFORE/AFTER on SI 1: adjusted scores and the hole winner both move', () => {
        const E = engineRealm();
        const ps = twoVtwo(H);
        const hole = holeOfSI(1);
        const calc = runMatch(E, ps, { scores: scoresWith(ps, hole) });

        // What the OLD model would have produced, from the untouched production
        // stroke-play allocator - not a hand-copied constant.
        const oldNet = ps.map(p => GROSS[p.id] - E.getStrokes(1, E.parseHcp(p.hcp)));
        const newNet = ps.map(p => GROSS[p.id] - E.allocateMatchStrokes(calc.relHcpById[String(p.id)], 1));
        assert.deepEqual(oldNet, [2, 3, 2, 2], 'old: each golfer\u2019s full course handicap');
        assert.deepEqual(newNet, [3, 3, 2, 2], 'new: one baseline across the match');

        const oldT1 = Math.min(oldNet[0], oldNet[1]), oldT2 = Math.min(oldNet[2], oldNet[3]);
        const newT1 = Math.min(newNet[0], newNet[1]), newT2 = Math.min(newNet[2], newNet[3]);
        assert.equal(oldT1, oldT2, 'the old model halved this hole');
        assert.ok(newT2 < newT1, 'the corrected model gives it to Team 2');

        assert.equal(calc.holeLog[hole].holeWinner, calc.t2Name,
            'and the REAL engine agrees with the corrected model, not the old one');
    });

    test('the team BEST BALL VALUE changes under the corrected strokes', () => {
        const E = engineRealm();
        const ps = twoVtwo(H);
        const hole = holeOfSI(1);
        const calc = runMatch(E, ps, { scores: scoresWith(ps, hole) });
        const oldBestT1 = Math.min(GROSS[101] - E.getStrokes(1, 5), GROSS[102] - E.getStrokes(1, 12));
        const newBestT1 = Math.min(
            GROSS[101] - E.allocateMatchStrokes(calc.relHcpById['101'], 1),
            GROSS[102] - E.allocateMatchStrokes(calc.relHcpById['102'], 1));
        assert.equal(oldBestT1, 2);
        assert.equal(newBestT1, 3, 'Team 1\u2019s best ball is a stroke worse, correctly');
    });

    test('WHICH partner supplies the best ball can change (tie becomes unique)', () => {
        const E = engineRealm();
        const ps = twoVtwo(H);
        const hole = holeOfSI(1);
        const scores = levelScores(ps, 5);
        ps.forEach(p => { scores['p' + p.id + '_h' + hole] = 3; });   // all level at 3
        const calc = runMatch(E, ps, { scores });

        const oldA = 3 - E.getStrokes(1, 5), oldB = 3 - E.getStrokes(1, 12);
        const newA = 3 - E.allocateMatchStrokes(calc.relHcpById['101'], 1);
        const newB = 3 - E.allocateMatchStrokes(calc.relHcpById['102'], 1);
        assert.equal(oldA, oldB, 'old model: both partners tie to supply the ball');
        assert.ok(newB < newA, 'corrected model: the 12 alone supplies it');
    });

    // The honest boundary of this change, pinned so nobody later writes a test
    // that claims something the arithmetic cannot deliver.
    test('a strict best-ball SUPPLIER REVERSAL is impossible - and that is correct', () => {
        const E = engineRealm();
        let reversal = false;
        for (let a = 0; a <= 30 && !reversal; a++) {
            for (let b = 0; b <= 30 && !reversal; b++) {
                for (let base = 1; base <= Math.min(a, b); base++) {
                    for (let si = 1; si <= 18; si++) {
                        const dA = E.getStrokes(si, a) - E.allocateMatchStrokes(a - base, si);
                        const dB = E.getStrokes(si, b) - E.allocateMatchStrokes(b - base, si);
                        if (Math.abs(dA - dB) >= 2) { reversal = true; break; }
                    }
                }
            }
        }
        assert.equal(reversal, false,
            'partners sharing one baseline shift by at most one stroke relative to each other');
    });
});

// ============================================================================
describe('BEST BALL MATCH PLAY IS FED THE CORRECTED SCORES', () => {

    test('bestball uses the all-player baseline', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]), { format: 'bestball' });
        assert.equal(calc.usesRelativeHandicap, true);
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
    });

    test('best ball selection itself is untouched - still the team minimum', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const hole = holeOfSI(1);
        const scores = levelScores(ps, 5);
        scores['p101_h' + hole] = 6; scores['p102_h' + hole] = 3;
        scores['p103_h' + hole] = 6; scores['p104_h' + hole] = 6;
        const calc = runMatch(E, ps, { format: 'bestball', scores });
        // Team 1's 3 (less 0 strokes for the 12 at SI 1? rel 7 -> 1 stroke) = net 2.
        assert.equal(calc.relHcpById['102'], 7);
        assert.equal(calc.holeLog[hole].holeWinner, calc.t1Name,
            'the low ball still carries the team; only the strokes feeding it changed');
    });
});

// ============================================================================
describe('NASSAU — ONE BASELINE FOR FRONT, BACK AND OVERALL', () => {

    function nassau(E, hcps, scores) {
        return runMatch(E, twoVtwo(hcps), { format: 'nassau', scores, stake: 10 });
    }

    test('team Nassau produces F9, B9 and 18 from the same relative table', () => {
        const E = engineRealm();
        const calc = nassau(E, [5, 12, 8, 17]);
        const ids = calc.activeMatches.map(m => m.id);
        assert.ok(ids.includes('F9') && ids.includes('B9') && ids.includes('18'));
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 },
            'ONE table - not one per segment');
    });

    test('FRONT does not recompute a baseline of its own', () => {
        const E = engineRealm();
        const front = runMatch(E, twoVtwo([5, 12, 8, 17]),
            { format: 'nassau', holes: cd18.filter(h => h.hole <= 9) });
        assert.equal(front.matchBaseline, 5,
            'the baseline comes from the golfers, never from the holes in play');
        assert.deepEqual(front.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
    });

    test('BACK does not recompute a baseline of its own', () => {
        const E = engineRealm();
        const back = runMatch(E, twoVtwo([5, 12, 8, 17]),
            { format: 'nassau', holes: cd18.filter(h => h.hole > 9) });
        assert.equal(back.matchBaseline, 5);
        assert.deepEqual(back.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
    });

    test('OVERALL agrees with the segments it contains', () => {
        const E = engineRealm();
        const calc = nassau(E, [5, 12, 8, 17]);
        const overall = calc.activeMatches.find(m => m.id === '18');
        const f9 = calc.activeMatches.find(m => m.id === 'F9');
        const b9 = calc.activeMatches.find(m => m.id === 'B9');
        assert.ok(overall && f9 && b9);
        assert.equal(overall.status, f9.status + b9.status,
            'one allocation across all 18 - the segments cannot disagree with the total');
    });
});

// ============================================================================
describe('RYDER-STYLE TEAM MATCHES', () => {

    test('ryder uses the all-player baseline for THAT match', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]), { format: 'ryder' });
        assert.equal(calc.usesRelativeHandicap, true);
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
    });

    test('THE BASELINE IS PER MATCH, not per event', () => {
        const E = engineRealm();
        // A scratch golfer plays in a DIFFERENT match at the same event.
        const matchOne = runMatch(E, twoVtwo([5, 12, 8, 17]), { format: 'ryder' });
        const matchTwo = runMatch(E, twoVtwo([0, 9, 4, 13], [201, 202, 203, 204]), { format: 'ryder' });
        assert.equal(matchOne.matchBaseline, 5,
            'match one is NOT dragged down to the event\u2019s scratch player');
        assert.equal(matchTwo.matchBaseline, 0);
    });
});

// ============================================================================
describe('PRESSES INHERIT, THEY DO NOT RECOMPUTE', () => {

    test('a manual press inherits the parent allocation', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const presses = [{ segment: '18', baseId: '18', fromHole: 10 }];
        const calc = runMatch(E, ps, { presses, pressRule: 'manual' });
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 },
            'the press did not go looking for a new lowest golfer');
        assert.equal(calc.matchBaseline, 5);
    });

    test('an auto 2-down press inherits the parent allocation', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = levelScores(ps, 5);
        // Give Team 2 a genuine lead so the 2-down rule actually fires.
        [1, 2, 3, 4, 5, 6].forEach(h => { scores['p103_h' + h] = 3; });
        const calc = runMatch(E, ps, { scores, pressRule: '2down' });
        assert.ok(calc.pressCount > 0, 'the auto press must actually have triggered');
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 7, '103': 3, '104': 12 });
        assert.equal(calc.matchBaseline, 5);
    });

    test('a press does NOT renumber stroke indexes from the press hole', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 5, 5]);
        const presses = [{ segment: '18', baseId: '18', fromHole: 12 }];
        const withPress = runMatch(E, ps, { presses, pressRule: 'manual' });
        const without = runMatch(E, ps);
        assert.deepEqual(withPress.relHcpById, without.relHcpById);
        // The strokes still sit on SI 1-7, wherever those holes fall on the card.
        const stroked = cd18.filter(h => E.allocateMatchStrokes(withPress.relHcpById['102'], h.hcpIndex) > 0)
            .map(h => h.hole).sort((a, b) => a - b);
        assert.deepEqual(stroked, cd18.filter(h => h.hcpIndex <= 7).map(h => h.hole).sort((a, b) => a - b));
        assert.ok(stroked.includes(7), 'SI 1 is still hole 7 after a press from hole 12');
    });
});

// ============================================================================
describe('SIMULTANEOUS MATCHES STAY INDEPENDENT', () => {

    test('the same golfer carries a different relative handicap per match', () => {
        const E = engineRealm();
        const A = player(1, 'A', 10, 'Team 1');
        const vsB = runMatch(E, [A, player(2, 'B', 20, 'Team 2')]);
        const vsC = runMatch(E, [Object.assign({}, A), player(3, 'C', 5, 'Team 2')]);
        assert.equal(vsB.relHcpById['1'], 0, 'against a 20, A is the baseline');
        assert.equal(vsC.relHcpById['1'], 5, 'against a 5, A receives 5');
    });

    test('running a match MUTATES NO STORED HANDICAP', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const before = ps.map(p => p.hcp);
        runMatch(E, ps);
        runMatch(E, ps, { format: 'nassau' });
        assert.deepEqual(ps.map(p => p.hcp), before, 'no global match handicap is written back');
        assert.deepEqual(before, ['5', '12', '8', '17']);
    });

    test('two team matches sharing a player do not share handicap state', () => {
        const E = engineRealm();
        const shared = player(101, 'A', 12, 'Team 1');
        const one = runMatch(E, [shared, player(102, 'B', 14, 'Team 1'),
                                 player(103, 'C', 4, 'Team 2'), player(104, 'D', 18, 'Team 2')]);
        const two = runMatch(E, [Object.assign({}, shared), player(202, 'E', 13, 'Team 1'),
                                 player(203, 'F', 12, 'Team 2'), player(204, 'G', 15, 'Team 2')]);
        assert.equal(one.relHcpById['101'], 8, 'baseline 4 in the first match');
        assert.equal(two.relHcpById['101'], 0, 'baseline 12 in the second');
    });
});

// ============================================================================
describe('WHAT MUST NOT MOVE', () => {

    test('ordinary Stroke Play net scoring is unchanged', () => {
        const E = engineRealm();
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1, 'a 12 still strokes at SI 12 in stroke play');
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(1, 20), 2, 'and still doubles up at the low indexes');
    });

    test('the plus-handicap course giveback survives for stroke play', () => {
        const E = engineRealm();
        assert.equal(E.getStrokes(18, -2), -1);
        assert.equal(E.getStrokes(17, -2), -1);
        assert.equal(E.getStrokes(16, -2), 0);
    });

    test('parseHcp still normalises a plus handicap to a negative', () => {
        const E = engineRealm();
        assert.equal(E.parseHcp('+2'), -2);
        assert.equal(E.parseHcp('12'), 12);
        assert.equal(E.parseHcp(''), 0);
    });

    test('GROSS match play takes no strokes at all', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]), { scoring: 'gross' });
        assert.equal(calc.usesRelativeHandicap, false, 'gross means gross');
        Object.values(calc.holeLog).forEach(h => assert.equal(h.holeWinner, 'Halved'));
    });

    test('SCRAMBLE is deliberately excluded - a single-ball format is not this', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]), { format: 'scramble' });
        assert.equal(calc.usesRelativeHandicap, false,
            'scramble keeps its existing behaviour exactly; there is no individual ball to stroke');
        assert.deepEqual(calc.relHcpById, {});
    });

    test('a team game that is not match play is not touched by format alone', () => {
        const E = engineRealm();
        // hilo/dots/wolf/stableford never enter calculateMatchEngine at all.
        assert.equal(E.buildLiveMatchState({ gameFormat: 'hilo', players: [] }, cd18, {}), null);
        assert.equal(E.buildLiveMatchState({ gameFormat: 'stableford', players: [] }, cd18, {}), null);
    });
});

// ============================================================================
describe('EVERY PRODUCTION COPY AGREES', () => {

    const COPIES = [
        ['money-engine.js', E => E],
        ['index.html', () => null],
        ['sidematches.html', () => null],
        ['stats.html', () => null],
    ];

    function relFromPage(page, players) {
        const expr = `JSON.stringify(calculateMatchEngine(${JSON.stringify(players)},`
            + `${JSON.stringify(cd18)}, ${JSON.stringify(levelScores(players))},`
            + `'net','match','none',10,0,[]))`;
        return JSON.parse(fromPage(page, expr));
    }

    test('all four copies agree on the canonical 2v2', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const expected = { '101': 0, '102': 7, '103': 3, '104': 12 };
        assert.deepEqual(runMatch(E, ps).relHcpById, expected, 'money-engine.js');
        ['index.html', 'sidematches.html', 'stats.html'].forEach(page => {
            assert.deepEqual(relFromPage(page, ps).relHcpById, expected, page);
            assert.equal(relFromPage(page, ps).matchBaseline, 5, page);
        });
    });

    test('all four copies agree on a PLUS-handicap team match', () => {
        const E = engineRealm();
        const ps = twoVtwo(['+2', 3, 7, 10]);
        const expected = { '101': 0, '102': 5, '103': 9, '104': 12 };
        assert.deepEqual(runMatch(E, ps).relHcpById, expected, 'money-engine.js');
        ['index.html', 'sidematches.html', 'stats.html'].forEach(page => {
            assert.deepEqual(relFromPage(page, ps).relHcpById, expected, page);
        });
    });

    test('all four copies agree on hole winners for a decided card', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = levelScores(ps, 5);
        const hole = holeOfSI(1);
        ps.forEach(p => { scores['p' + p.id + '_h' + hole] = ({ 101: 3, 102: 4, 103: 3, 104: 3 })[p.id]; });
        const mine = plain(E.calculateMatchEngine(ps, cd18, scores, 'net', 'match', 'none', 10, 0, []));
        ['index.html', 'sidematches.html', 'stats.html'].forEach(page => {
            const expr = `JSON.stringify(calculateMatchEngine(${JSON.stringify(ps)},`
                + `${JSON.stringify(cd18)}, ${JSON.stringify(scores)},'net','match','none',10,0,[]))`;
            const theirs = JSON.parse(fromPage(page, expr));
            assert.deepEqual(theirs.holeLog[hole].holeWinner, mine.holeLog[hole].holeWinner, page);
            assert.equal(theirs.t1TotalMoney, mine.t1TotalMoney, page + ' money must match too');
        });
    });

    test('no production copy still carries the old singles-only gate', () => {
        ['money-engine.js', 'index.html', 'sidematches.html', 'stats.html'].forEach(f => {
            const src = read(f);
            assert.ok(!/const isSingles = scoringType === 'net' && t1Players\.length === 1/.test(src),
                f + ' still gates the relative allocation to 1v1');
            assert.ok(/matchHandicapBaseline/.test(src), f + ' is missing the all-player baseline');
        });
    });
});

// ============================================================================
describe('LIVE STATE, SETTLEMENT AND THE RECEIPT SEE ONE MATCH', () => {

    function roundData(hcps) {
        return {
            gameFormat: 'match', matchScoring: 'net', matchPressRule: 'none', matchStake: 20,
            players: twoVtwo(hcps),
        };
    }

    test('the live presenter and the engine agree on the corrected match', () => {
        const E = engineRealm();
        const d = roundData([5, 12, 8, 17]);
        const scores = levelScores(d.players, 5);
        const hole = holeOfSI(1);
        d.players.forEach(p => { scores['p' + p.id + '_h' + hole] = ({ 101: 3, 102: 4, 103: 3, 104: 3 })[p.id]; });

        const live = plain(E.buildLiveMatchState(d, cd18, scores));
        const calc = plain(E.calculateMatchEngine(d.players, cd18, scores, 'net', 'match', 'none', 20, 0, []));
        assert.ok(live, 'the widget must render for a team match');
        assert.equal(live.segments[0].status, calc.activeMatches[0].status,
            'the scorecard widget and the money engine cannot disagree');
    });

    test('settlement money follows the corrected hole winners', () => {
        const E = engineRealm();
        const d = roundData([5, 12, 8, 17]);
        const scores = levelScores(d.players, 5);
        // Team 2 wins SI 1-3 outright under the corrected allocation.
        [1, 2, 3].forEach(si => {
            const h = holeOfSI(si);
            d.players.forEach(p => { scores['p' + p.id + '_h' + h] = ({ 101: 3, 102: 4, 103: 3, 104: 3 })[p.id]; });
        });
        const res = E.computeRoundMoneyByPlayer(Object.assign({}, d, { courseData: cd18 }), cd18, scores);
        assert.equal(res.valid, true);
        const total = res.players.reduce((s, p) => s + p.net, 0);
        assert.ok(Math.abs(total) < 1e-9, 'settlement stays zero-sum');
        const byId = {};
        res.players.forEach(p => { byId[p.id] = p.net; });
        assert.ok(byId[103] > 0 && byId[104] > 0, 'Team 2 is paid');
        assert.ok(byId[101] < 0 && byId[102] < 0, 'Team 1 pays');
    });

    test('stats/history runs the same engine and reaches the same money', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = levelScores(ps, 5);
        const hole = holeOfSI(1);
        ps.forEach(p => { scores['p' + p.id + '_h' + hole] = ({ 101: 3, 102: 4, 103: 3, 104: 3 })[p.id]; });
        const mine = plain(E.calculateMatchEngine(ps, cd18, scores, 'net', 'match', 'none', 20, 0, []));
        const expr = `JSON.stringify(calculateMatchEngine(${JSON.stringify(ps)},`
            + `${JSON.stringify(cd18)}, ${JSON.stringify(scores)},'net','match','none',20,0,[]))`;
        assert.equal(JSON.parse(fromPage('stats.html', expr)).t1TotalMoney, mine.t1TotalMoney);
    });
});

// ============================================================================
describe('THE SCORECARD PRINTS WHAT THE ENGINE USED', () => {

    const src = read('index.html');

    test('the dots come from the match table, not the course handicap', () => {
        const fn = src.slice(src.indexOf('function renderScorecard'));
        assert.match(fn, /const dotStrokes = dotStrokesFor\(p, h\.hcpIndex, strokes\);/,
            'renderScorecard must resolve dots through dotStrokesFor');
        assert.match(fn, /const handicapDots = dotStrokes > 0 \? "\u2022"\.repeat\(dotStrokes\)/,
            'the printed dots must be the MATCH strokes');
        assert.ok(!/const handicapDots = strokes > 0 \? "\u2022"\.repeat\(strokes\)/.test(fn),
            'the old full-course-handicap dot line must be gone');
    });

    test('the dot table is taken off matchCalc, never re-derived', () => {
        const fn = src.slice(src.indexOf('function renderScorecard'));
        assert.match(fn, /matchCalc\.usesRelativeHandicap && matchCalc\.relHcpById/);
        assert.match(fn, /return allocateMatchStrokes\(rel, hcpIndex\);/);
    });

    test('NET, TO-PAR and the shapes still use the course allocation', () => {
        const fn = src.slice(src.indexOf('function renderScorecard'));
        assert.match(fn, /const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(fn, /let net = gross - strokes;/,
            'net must NOT switch to match strokes, or the card would contradict the net leaderboard');
    });

    test('the dot counts equal the engine strokes for the canonical 2v2', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const calc = runMatch(E, ps);
        const dots = {};
        ps.forEach(p => {
            dots[p.id] = cd18.filter(h => E.allocateMatchStrokes(calc.relHcpById[String(p.id)], h.hcpIndex) > 0).length;
        });
        assert.deepEqual(dots, { 101: 0, 102: 7, 103: 3, 104: 12 },
            '0 dots / SI 1-7 / SI 1-3 / SI 1-12 exactly as specified');
    });

    test('a golfer outside the match keeps ordinary course dots', () => {
        const E = engineRealm();
        const calc = runMatch(E, twoVtwo([5, 12, 8, 17]));
        assert.equal(calc.relHcpById['999'], undefined,
            'an unknown id falls through to the course allocation in dotStrokesFor');
    });

    test('a Stroke Play round still prints full course-handicap dots', () => {
        const E = engineRealm();
        // No match calc at all -> dotStrokesFor returns the course strokes untouched.
        assert.equal(E.buildLiveMatchState({ gameFormat: 'stroke', players: twoVtwo([5, 12, 8, 17]) }, cd18, {}), null);
        assert.equal(E.getStrokes(12, 12), 1, 'and a 12 still shows a dot at SI 12');
    });
});

// ============================================================================
// A REAL CARD WHERE THE MONEY CHANGES HANDS THE OTHER WAY.
//
// Found by search over random 18-hole cards for 5/12 vs 8/17: under the OLD
// own-handicap model Team 2 collected the $20; under the corrected all-player
// baseline Team 1 does. Not a contrived hole - a whole round that settles to the
// opposite golfer. This is the case the negative controls are measured against.
// ============================================================================
const REVERSAL_GROSS = {
    101: [4, 6, 5, 4, 6, 6, 4, 6, 4, 6, 5, 6, 5, 5, 5, 5, 4, 4],
    102: [6, 6, 4, 6, 4, 4, 6, 6, 4, 4, 4, 6, 5, 4, 4, 6, 5, 5],
    103: [4, 5, 5, 6, 4, 5, 4, 5, 4, 5, 6, 4, 5, 6, 6, 5, 6, 4],
    104: [5, 4, 5, 5, 6, 6, 4, 5, 4, 6, 4, 4, 5, 6, 5, 4, 5, 4],
};
function reversalScores(players) {
    const s = {};
    players.forEach(p => cd18.forEach(h => { s['p' + p.id + '_h' + h.hole] = REVERSAL_GROSS[p.id][h.hole - 1]; }));
    return s;
}

describe('ADVERSARIAL — A WHOLE ROUND SETTLES THE OTHER WAY', () => {

    test('the corrected model pays TEAM 1; the old model paid Team 2', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = reversalScores(ps);

        const corrected = plain(E.calculateMatchEngine(ps, cd18, scores, 'net', 'match', 'none', 20, 0, []));
        assert.equal(corrected.t1TotalMoney, 20, 'Team 1 wins the match under one baseline');

        // The OLD model, rebuilt here from the untouched stroke-play allocator.
        let status = 0;
        cd18.forEach(h => {
            const net = {};
            ps.forEach(p => { net[p.id] = scores['p' + p.id + '_h' + h.hole] - E.getStrokes(h.hcpIndex, E.parseHcp(p.hcp)); });
            const t1 = Math.min(net[101], net[102]), t2 = Math.min(net[103], net[104]);
            status += (t1 < t2) ? 1 : (t2 < t1 ? -1 : 0);
        });
        assert.ok(status < 0, 'the old own-handicap model gave this same card to Team 2');
    });

    test('SETTLEMENT agrees with the engine on this card, to the dollar', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = reversalScores(ps);
        const d = { gameFormat: 'match', matchScoring: 'net', matchPressRule: 'none',
                    matchStake: 20, players: ps, courseData: cd18 };
        const res = E.computeRoundMoneyByPlayer(d, cd18, scores);
        assert.equal(res.valid, true);
        const byId = {};
        res.players.forEach(p => { byId[p.id] = p.net; });
        assert.equal(byId[101], 10, 'Team 1 splits +$20');
        assert.equal(byId[102], 10);
        assert.equal(byId[103], -10, 'Team 2 splits -$20');
        assert.equal(byId[104], -10);
        assert.ok(Math.abs(res.players.reduce((s, p) => s + p.net, 0)) < 1e-9, 'zero-sum');
    });

    test('THE RECEIPT AND THE LIVE WIDGET SEE THE SAME RESULT', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = reversalScores(ps);
        const d = { gameFormat: 'match', matchScoring: 'net', matchPressRule: 'none',
                    matchStake: 20, players: ps };
        const live = plain(E.buildLiveMatchState(d, cd18, scores));
        const calc = plain(E.calculateMatchEngine(ps, cd18, scores, 'net', 'match', 'none', 20, 0, []));
        assert.ok(live);
        assert.equal(live.segments[0].status, calc.activeMatches[0].status);
        assert.ok(calc.activeMatches[0].status > 0, 'Team 1 up, on both surfaces');
    });

    test('every production copy settles this card identically', () => {
        const E = engineRealm();
        const ps = twoVtwo([5, 12, 8, 17]);
        const scores = reversalScores(ps);
        const mine = plain(E.calculateMatchEngine(ps, cd18, scores, 'net', 'match', 'none', 20, 0, []));
        ['index.html', 'sidematches.html', 'stats.html'].forEach(page => {
            const expr = `JSON.stringify(calculateMatchEngine(${JSON.stringify(ps)},`
                + `${JSON.stringify(cd18)}, ${JSON.stringify(scores)},'net','match','none',20,0,[]))`;
            assert.equal(JSON.parse(fromPage(page, expr)).t1TotalMoney, mine.t1TotalMoney, page);
        });
    });
});
