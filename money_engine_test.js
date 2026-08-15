const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

const engine = loadJsFile('money-engine.js');
const { parseHcp, getStrokes, calculateStrokeHeadToHead, calculateStrokePressSet, computeRoundMoneyByPlayer, simplifyDebts } = engine;

describe('money-engine.js — handicap allocation (parseHcp / getStrokes)', () => {
    test('parseHcp: scratch player (0) parses to 0', () => {
        assert.equal(parseHcp('0'), 0);
    });

    test('parseHcp: positive handicap parses as-is', () => {
        assert.equal(parseHcp('12'), 12);
        assert.equal(parseHcp('8.4'), 8.4);
    });

    test('parseHcp: plus-handicap ("+2") parses to negative', () => {
        assert.equal(parseHcp('+2'), -2);
    });

    test('parseHcp: empty/undefined input parses to 0 rather than NaN', () => {
        assert.equal(parseHcp(''), 0);
        assert.equal(parseHcp(undefined), 0);
        assert.equal(parseHcp(null), 0);
    });

    test('getStrokes: scratch player (hcp 0) never gets a stroke on any hole', () => {
        for (let hcpIndex = 1; hcpIndex <= 18; hcpIndex++) {
            assert.equal(getStrokes(hcpIndex, 0), 0, `hcpIndex ${hcpIndex} should give 0 strokes at hcp 0`);
        }
    });

    test('getStrokes: handicap of 18 gives exactly one stroke on every hole', () => {
        for (let hcpIndex = 1; hcpIndex <= 18; hcpIndex++) {
            assert.equal(getStrokes(hcpIndex, 18), 1, `hcpIndex ${hcpIndex} should give 1 stroke at hcp 18`);
        }
    });

    test('getStrokes: handicap >18 gives a second stroke on the hardest holes', () => {
        // hcp 20 -> floor(20/18)=1 base stroke everywhere, +1 more on hcpIndex 1 and 2 (20%18=2)
        assert.equal(getStrokes(1, 20), 2);
        assert.equal(getStrokes(2, 20), 2);
        assert.equal(getStrokes(3, 20), 1);
        assert.equal(getStrokes(18, 20), 1);
    });

    test('getStrokes: hole stroke-index boundary is correct (hcp 9 gives a stroke on exactly the 9 hardest holes)', () => {
        for (let hcpIndex = 1; hcpIndex <= 9; hcpIndex++) {
            assert.equal(getStrokes(hcpIndex, 9), 1, `hcpIndex ${hcpIndex} (<=9) should get a stroke`);
        }
        for (let hcpIndex = 10; hcpIndex <= 18; hcpIndex++) {
            assert.equal(getStrokes(hcpIndex, 9), 0, `hcpIndex ${hcpIndex} (>9) should NOT get a stroke`);
        }
    });

    test('getStrokes: plus-handicap (negative numeric) removes a stroke on the easiest holes only', () => {
        // hcp -2 (a "+2" player): plusVal=2, removes a stroke where hcpIndex > (18-2)=16, i.e. hcpIndex 17,18
        assert.equal(getStrokes(17, -2), -1);
        assert.equal(getStrokes(18, -2), -1);
        assert.equal(getStrokes(16, -2), 0);
        assert.equal(getStrokes(1, -2), 0);
    });
});

describe('money-engine.js — computeRoundMoneyByPlayer (format dispatch)', () => {
    test('Stroke Play format never produces a main-format money bet, by design', () => {
        const players = makePlayers(['Marty', 'Steve'], [8, 12]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 70, Steve: 80 });
        const result = computeRoundMoneyByPlayer({ players, gameFormat: 'stroke' }, cd, scores);
        assert.equal(result.valid, true);
        result.players.forEach(p => assert.equal(p.net, 0, `${p.name} should have $0 net in Stroke Play`));
    });

    test('a round with zero money-opted-in players returns invalid with a clear message', () => {
        const players = makePlayers(['Marty'], [8]).map(p => ({ ...p, playingForMoney: false }));
        const result = computeRoundMoneyByPlayer({ players, gameFormat: 'nassau' }, makeCourseData(), {});
        assert.equal(result.valid, false);
        assert.match(result.message, /No players opted in/);
    });
});

describe('money-engine.js — calculateStrokeHeadToHead (1v1, Stroke Play scoring)', () => {
    test('equal handicaps, clear gross winner, complete round', () => {
        const players = makePlayers(['Marty', 'Steve'], [10, 10]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 70, Steve: 80 });
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        assert.equal(calc.roundComplete, true);
        assert.equal(calc.t1TotalMoney, 20, 'Marty (lower gross, equal hcp) should win the full stake');
    });

    test('different handicaps can flip who wins on net even with equal gross', () => {
        const players = makePlayers(['Marty', 'Steve'], [5, 20]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 85, Steve: 85 }); // tied gross
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 25);
        assert.equal(calc.t1TotalMoney, -25, 'Steve (higher hcp, same gross) should win on net');
    });

    test('gross-mode scoring ignores handicap entirely', () => {
        const players = makePlayers(['Marty', 'Steve'], [5, 20]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 85, Steve: 85 });
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'gross', 25);
        assert.equal(calc.t1TotalMoney, 0, 'Equal gross totals should tie regardless of handicap in gross mode');
    });

    test('a tie (equal net totals) produces zero money either direction', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 72, Steve: 72 });
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        assert.equal(calc.roundComplete, true);
        assert.equal(calc.t1TotalMoney, 0);
    });

    test('an incomplete round (not all holes scored) is never treated as final, and awards no money', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 40, Steve: 45 }, 9); // only 9 of 18 holes
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        assert.equal(calc.roundComplete, false, 'A 9-of-18 round must not be reported as complete');
        assert.equal(calc.t1TotalMoney, 0, 'No money should be awarded on an incomplete round, regardless of the partial lead');
        assert.equal(calc.holesCompleted, 9);
    });

    test('plus-handicap player is handled correctly in net scoring', () => {
        const players = makePlayers(['Pro', 'Steve'], ['+2', 15]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Pro: 68, Steve: 88 });
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        assert.equal(calc.roundComplete, true);
        // Pro plays to net ~70, Steve plays to net ~73 - Pro should still win comfortably
        assert.equal(calc.t1TotalMoney, 20);
    });

    test('exactly 2 players is required — anything else returns null rather than guessing', () => {
        const cd = makeCourseData(18);
        assert.equal(calculateStrokeHeadToHead(makePlayers(['A']), cd, {}, 'net', 20), null);
        assert.equal(calculateStrokeHeadToHead(makePlayers(['A', 'B', 'C']), cd, {}, 'net', 20), null);
    });

    test('money is always exactly zero-sum between the two players', () => {
        const players = makePlayers(['Marty', 'Steve'], [8, 22]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 77, Steve: 91 });
        const calc = calculateStrokeHeadToHead(players, cd, scores, 'net', 33);
        const result = computeRoundMoneyByPlayer({ players, gameFormat: 'match', matchScoringStyle: 'stroke', matchScoring: 'net', matchStake: 33 }, cd, scores);
        const sum = result.players.reduce((s, p) => s + p.net, 0);
        assert.equal(sum, 0, 'Total money across both players must sum to exactly zero');
    });
});

describe('money-engine.js — simplifyDebts (settlement minimization)', () => {
    test('a simple two-person imbalance produces one transaction', () => {
        const txns = simplifyDebts({ Marty: 20, Steve: -20 });
        assert.equal(txns.length, 1);
        assert.equal(txns[0].from, 'Steve');
        assert.equal(txns[0].to, 'Marty');
        assert.equal(txns[0].amount, 20);
    });

    test('everyone already even produces zero transactions', () => {
        const txns = simplifyDebts({ Marty: 0, Steve: 0, Dave: 0 });
        assert.equal(txns.length, 0);
    });

    test('total money moved always equals the total amount owed, for a multi-person imbalance', () => {
        const net = { Marty: 30, Steve: -10, Dave: -10, Manny: -10 };
        const txns = simplifyDebts(net);
        const totalMoved = txns.reduce((s, t) => s + t.amount, 0);
        assert.equal(totalMoved, 30);
    });
});

describe('money-engine.js — calculateStrokePressSet (Stroke Play presses)', () => {
    test('no presses: combined result equals the original wager exactly', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 70, Steve: 80 });
        const pressSet = calculateStrokePressSet(players, cd, scores, 'net', 50, []);
        assert.equal(pressSet.pressResults.length, 0);
        assert.equal(pressSet.combinedT1Money, pressSet.original.t1TotalMoney);
        assert.equal(pressSet.combinedT1Money, 50);
    });

    test('one press: original and press are both included in the combined total', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        // Marty wins holes 1-18 by 1 stroke each (original winner), and also wins the
        // press segment (holes 6-18) since he's ahead on every hole in that range too.
        let scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par - (h.hole <= 6 ? 1 : 0) - (h.hole > 6 ? 1 : 0);
            scores[`p${players[1].id}_h${h.hole}`] = h.par;
        });
        const pressSet = calculateStrokePressSet(players, cd, scores, 'gross', 50, [{ startHole: 7, stake: 50 }]);
        assert.equal(pressSet.pressResults.length, 1);
        assert.equal(pressSet.pressResults[0].startHole, 7);
        assert.equal(pressSet.pressResults[0].pressNum, 1);
        assert.equal(pressSet.original.t1TotalMoney, 50, 'Marty wins the original 1-18 bet');
        assert.equal(pressSet.pressResults[0].t1TotalMoney, 50, 'Marty also wins the hole 7-18 press');
        assert.equal(pressSet.combinedT1Money, 100, 'Original ($50) + press ($50) = $100 combined');
    });

    test('multiple presses with different amounts are summed independently, not averaged or replaced', () => {
        const players = makePlayers(['Marty', 'John'], [0, 0]);
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par - 1; // Marty always 1-under, wins every segment
            scores[`p${players[1].id}_h${h.hole}`] = h.par;
        });
        const pressSet = calculateStrokePressSet(players, cd, scores, 'gross', 50, [
            { startHole: 6, stake: 50 },
            { startHole: 10, stake: 100 },
            { startHole: 14, stake: 200 },
        ]);
        assert.equal(pressSet.pressResults.length, 3);
        assert.equal(pressSet.pressResults[0].stake, 50);
        assert.equal(pressSet.pressResults[1].stake, 100);
        assert.equal(pressSet.pressResults[2].stake, 200);
        // Marty wins everything: original $50 + P1 $50 + P2 $100 + P3 $200 = $400
        assert.equal(pressSet.combinedT1Money, 400);
    });

    test('a press uses net scoring like its parent, and only counts handicap strokes falling inside its own hole range', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 18]); // Steve gets a stroke on every hole (hcp 18)
        const cd = makeCourseData(18); // hcpOrder cycles 1-18, so every hole gets exactly one stroke-index holder at hcp 18
        let scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par; // Marty always plays to par, gross and net
            scores[`p${players[1].id}_h${h.hole}`] = h.par; // Steve also always plays to par gross, but nets one better per hole
        });
        // Press starting hole 10: Steve's handicap strokes on holes 10-18 (9 strokes) should net him
        // 9 shots better than Marty over that range, winning the press on net despite an even gross tie.
        const pressSet = calculateStrokePressSet(players, cd, scores, 'net', 20, [{ startHole: 10, stake: 20 }]);
        assert.equal(pressSet.original.t1TotalMoney, -20, 'Steve nets ahead across the full 18 (18 strokes of handicap help)');
        assert.equal(pressSet.pressResults[0].t1TotalMoney, -20, 'Steve also nets ahead across holes 10-18 (9 strokes of handicap help there)');
    });

    test('a tie inside a press pays nobody, same push rule as the parent wager — not invented separately', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par - (h.hole <= 8 ? 1 : 0); // Marty wins the original, but...
            scores[`p${players[1].id}_h${h.hole}`] = h.par - (h.hole <= 8 ? 0 : 0);
        });
        // From hole 9 onward both play dead even par - the press over that range should tie.
        for (let h = 9; h <= 18; h++) {
            scores[`p${players[0].id}_h${h}`] = cd[h - 1].par;
            scores[`p${players[1].id}_h${h}`] = cd[h - 1].par;
        }
        const pressSet = calculateStrokePressSet(players, cd, scores, 'gross', 50, [{ startHole: 9, stake: 50 }]);
        assert.equal(pressSet.pressResults[0].t1TotalMoney, 0, 'A tied press pays nobody, mirroring the parent wager tie rule');
        assert.equal(pressSet.pressResults[0].winner, null);
    });

    test('every individual press is independently zero-sum, and so is the combined total', () => {
        const players = makePlayers(['Marty', 'John'], [5, 12]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 82, John: 90 });
        const pressSet = calculateStrokePressSet(players, cd, scores, 'net', 50, [
            { startHole: 5, stake: 25 },
            { startHole: 11, stake: 75 },
        ]);
        assert.equal(pressSet.original.t1TotalMoney + (-pressSet.original.t1TotalMoney), 0);
        pressSet.pressResults.forEach(pr => {
            assert.equal(pr.t1TotalMoney + (-pr.t1TotalMoney), 0, `Press ${pr.pressNum} must be individually zero-sum`);
        });
        assert.equal(pressSet.combinedT1Money + (-pressSet.combinedT1Money), 0, 'Combined total (original + all presses) must also be exactly zero-sum');
    });

    test('SCORE CORRECTION: changing a score before a press start hole never affects that press, only the original and any press that includes it', () => {
        const players = makePlayers(['Marty', 'John'], [0, 0]);
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = h.par; scores[`p${players[1].id}_h${h.hole}`] = h.par; });

        const presses = [{ startHole: 6, stake: 50 }, { startHole: 10, stake: 100 }];
        const before = calculateStrokePressSet(players, cd, scores, 'gross', 50, presses);

        // Correct hole 4 (before P1's start hole 6) — only the original wager can change, neither press should move at all.
        scores[`p${players[0].id}_h4`] = 2; // birdie-ish improvement pre-press
        const afterH4 = calculateStrokePressSet(players, cd, scores, 'gross', 50, presses);
        assert.notEqual(afterH4.original.p1Total, before.original.p1Total, 'Original bet should reflect the correction on hole 4');
        assert.equal(afterH4.pressResults[0].p1Total, before.pressResults[0].p1Total, 'Press 1 (starts hole 6) must be unaffected by a hole 4 correction');
        assert.equal(afterH4.pressResults[1].p1Total, before.pressResults[1].p1Total, 'Press 2 (starts hole 10) must be unaffected by a hole 4 correction');

        // Correct hole 8 (inside P1's range, before P2's start hole 10) — original and P1 both recompute, P2 does not.
        scores[`p${players[0].id}_h8`] = 2;
        const afterH8 = calculateStrokePressSet(players, cd, scores, 'gross', 50, presses);
        assert.notEqual(afterH8.pressResults[0].p1Total, afterH4.pressResults[0].p1Total, 'Press 1 (holes 6-18) must reflect a hole 8 correction');
        assert.equal(afterH8.pressResults[1].p1Total, afterH4.pressResults[1].p1Total, 'Press 2 (starts hole 10) must be unaffected by a hole 8 correction');

        // Correct hole 12 (inside both P1 and P2's range) — everything downstream of hole 6 recomputes.
        scores[`p${players[0].id}_h12`] = 2;
        const afterH12 = calculateStrokePressSet(players, cd, scores, 'gross', 50, presses);
        assert.notEqual(afterH12.pressResults[0].p1Total, afterH8.pressResults[0].p1Total, 'Press 1 must reflect a hole 12 correction');
        assert.notEqual(afterH12.pressResults[1].p1Total, afterH8.pressResults[1].p1Total, 'Press 2 must also reflect a hole 12 correction');
    });

    test('presses are sorted and numbered by start hole regardless of the order they were created in', () => {
        const players = makePlayers(['Marty', 'Steve'], [0, 0]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { Marty: 70, Steve: 80 });
        // Deliberately passed out of order (hole 14 press created before hole 6 press is a realistic
        // scenario — Firebase push-key ordering is insertion order, not hole order).
        const pressSet = calculateStrokePressSet(players, cd, scores, 'gross', 50, [
            { startHole: 14, stake: 200 },
            { startHole: 6, stake: 50 },
            { startHole: 10, stake: 100 },
        ]);
        assert.deepEqual(pressSet.pressResults.map(p => p.startHole), [6, 10, 14]);
        assert.deepEqual(pressSet.pressResults.map(p => p.pressNum), [1, 2, 3]);
    });

    test('MARTY ACCEPTANCE SCENARIO: original + 3 presses at different amounts, mixed leaders, settle independently at hole 18', () => {
        const players = makePlayers(['Marty', 'John'], [0, 0]);
        const cd = makeCourseData(18);
        let scores = {};

        // Original (H1-18): Marty ahead overall (7 fewer gross strokes across the round).
        // P1 (H6-18, $50): Marty ahead by 2 (his strong 6-9 stretch outweighs John's 10-13 comeback).
        // P2 (H10-18, $100): John ahead by 6 (his 10-13 comeback isn't offset by Marty's earlier holes,
        //                     since those fall outside this narrower range).
        // P3 (H14-18, $200): tied — both play the closing stretch identically.
        // Diffs (Marty - John) per segment, hand-verified to sum to exactly these targets:
        //   Holes 1-5:   -5 total (Marty ahead)  — affects Original only
        //   Holes 6-9:   -8 total (Marty ahead)  — affects Original + P1
        //   Holes 10-13: +6 total (John ahead)   — affects Original + P1 + P2
        //   Holes 14-18:  0 total (tied)         — affects everything, contributes nothing
        const martyScores = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 2, 8: 4, 9: 3, 10: 6, 11: 5, 12: 7, 13: 4, 14: 4, 15: 4, 16: 3, 17: 5, 18: 4 };
        const johnScores = { 1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 5, 7: 4, 8: 6, 9: 5, 10: 4, 11: 3, 12: 5, 13: 4, 14: 4, 15: 4, 16: 3, 17: 5, 18: 4 };
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = martyScores[h.hole];
            scores[`p${players[1].id}_h${h.hole}`] = johnScores[h.hole];
        });

        const pressSet = calculateStrokePressSet(players, cd, scores, 'gross', 50, [
            { startHole: 6, stake: 50 },   // P1
            { startHole: 10, stake: 100 }, // P2
            { startHole: 14, stake: 200 }, // P3
        ]);

        assert.equal(pressSet.original.roundComplete, true);
        assert.ok(pressSet.original.t1TotalMoney > 0, 'Original: Marty ahead overall');
        assert.ok(pressSet.pressResults[0].t1TotalMoney > 0, 'P1 (H6-18): Marty ahead — his strong 6-9 stretch is inside this range');
        assert.ok(pressSet.pressResults[1].t1TotalMoney < 0, 'P2 (H10-18): John ahead — Marty\'s strong 6-9 stretch is outside this narrower range');
        assert.equal(pressSet.pressResults[2].t1TotalMoney, 0, 'P3 (H14-18): dead even, both play the closing stretch identically');

        const combined = pressSet.original.t1TotalMoney + pressSet.pressResults[0].t1TotalMoney + pressSet.pressResults[1].t1TotalMoney + pressSet.pressResults[2].t1TotalMoney;
        assert.equal(pressSet.combinedT1Money, combined, 'Combined total is exactly the sum of the four independent wagers, nothing more or less');
    });

    test('exactly 2 players required, same as the parent function — returns null rather than guessing', () => {
        const cd = makeCourseData(18);
        assert.equal(calculateStrokePressSet(makePlayers(['A']), cd, {}, 'net', 20, []), null);
        assert.equal(calculateStrokePressSet(makePlayers(['A', 'B', 'C']), cd, {}, 'net', 20, []), null);
    });
});


module.exports = { engine };
