const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

const sm = loadHtmlInlineScript('sidematches.html');
const { calculateMatchEngine, computeGroupBoundaries, pairTwoGroups } = sm;

describe('sidematches.html — 1v1 and 2v2 matches', () => {
    test('a straightforward 1v1 match produces a correct winner', () => {
        // Both players from ONE makePlayers call, not two separate calls — calling it twice
        // with single-element arrays would give both players id 101 (each call restarts IDs),
        // silently colliding their score keys. This exact mistake was caught by this test
        // failing during development; the fix belongs here, not in production.
        const [p1, p2] = makePlayers(['Marty', 'Steve'], [0, 0]);
        p1.team = 'Team 1'; p2.team = 'Team 2';
        const cd = makeCourseData(18);
        // Explicit per-hole scores (not an evenly-distributed total) since match play is decided
        // hole-by-hole — Marty wins every single hole outright, so the outcome is unambiguous.
        let scores = {};
        cd.forEach(h => { scores[`p${p1.id}_h${h.hole}`] = 3; scores[`p${p2.id}_h${h.hole}`] = 5; });
        const result = calculateMatchEngine([p1, p2], cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(result.t1TotalMoney, 20, 'Marty (wins every hole outright) should win the full 1v1 stake');
    });

    test('a 2v2 match pairs teammates via best-ball-style comparison', () => {
        const players = makePlayers(['A1', 'A2', 'B1', 'B2'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1';
        players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A1: 70, A2: 95, B1: 78, B2: 82 });
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 25, 0, []);
        assert.equal(result.t1TotalMoney, 25, 'Team 1 (best individual score of 70 beats Team 2\'s best of 78) should win');
    });
});

describe('sidematches.html — one player in multiple simultaneous matches (Marty\'s actual described betting pattern)', () => {
    test('a player can be Team 1 in three separate matches at once with zero interference between them', () => {
        const allPlayers = makePlayers(
            ['Marty', 'Steve', 'Dave', 'Andy'], [8, 12, 4, 6]
        );
        const cd = makeCourseData(18);
        const scores = buildScores(allPlayers, cd, { Marty: 76, Steve: 88, Dave: 80, Andy: 82 });

        const matchupDefs = [
            { a: 'Marty', b: 'Steve', stake: 10 },
            { a: 'Marty', b: 'Dave', stake: 20 },
            { a: 'Marty', b: 'Andy', stake: 15 },
        ];

        let marty_net = 0;
        matchupDefs.forEach(def => {
            const pA = { ...allPlayers.find(p => p.name === def.a), team: 'Team 1' };
            const pB = { ...allPlayers.find(p => p.name === def.b), team: 'Team 2' };
            const result = calculateMatchEngine([pA, pB], cd, scores, 'net', 'match', 'none', def.stake, 0, []);
            assert.ok(!Number.isNaN(result.t1TotalMoney), `Match Marty vs ${def.b} should compute cleanly`);
            marty_net += result.t1TotalMoney;
        });

        assert.equal(marty_net, 10 + 20 + 15, 'Marty wins all three of his simultaneous matches independently — no cross-match interference');
    });
});

describe('sidematches.html — cross-group support (group boundaries and pairing)', () => {
    test('computeGroupBoundaries splits a 28-player field into 7 groups of 4', () => {
        const boundaries = computeGroupBoundaries(28, {});
        assert.equal(boundaries.length, 7);
        boundaries.forEach(b => assert.equal(b.size, 4));
    });

    test('computeGroupBoundaries honors custom group-size overrides', () => {
        const boundaries = computeGroupBoundaries(11, { 0: 3 });
        assert.equal(boundaries[0].size, 3);
    });

    test('pairTwoGroups matches players 2v2 across two different groups, splitting into equal-sized teams', () => {
        const groupA = makePlayers(['A1', 'A2', 'A3', 'A4'], [0, 0, 0, 0]);
        const groupB = makePlayers(['B1', 'B2', 'B3', 'B4'], [0, 0, 0, 0]);
        const result = pairTwoGroups(groupA, groupB);
        assert.equal(result.matchups.length, 2, 'Two 4-player groups should produce two 2v2 matchups');
        result.matchups.forEach(m => assert.equal(m.teamA.length, m.teamB.length, 'Every matchup must have equal team sizes on both sides'));
    });

    test('pairTwoGroups with mismatched group sizes reports leftover players rather than silently dropping them', () => {
        const groupA = makePlayers(['A1', 'A2', 'A3', 'A4'], [0, 0, 0, 0]);
        const groupB = makePlayers(['B1', 'B2'], [0, 0]);
        const result = pairTwoGroups(groupA, groupB);
        const matchedCount = result.matchups.reduce((s, m) => s + m.teamA.length + m.teamB.length, 0);
        const totalInput = groupA.length + groupB.length;
        assert.equal(matchedCount + result.leftover.length, totalInput, 'Every player must be either matched or explicitly reported as leftover — nobody silently vanishes');
    });
});
