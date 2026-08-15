const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

const engine = loadJsFile('money-engine.js');
const { parseHcp, getStrokes, calculateStrokeHeadToHead, computeRoundMoneyByPlayer, simplifyDebts } = engine;

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

module.exports = { engine };
