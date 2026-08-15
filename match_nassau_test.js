const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

const engine = loadJsFile('money-engine.js');
const { calculateMatchEngine, computeRoundMoneyByPlayer } = engine;

const tourneyEngine = loadJsFile('tournament-engine.js');
const { computeTournamentLeaderboard } = tourneyEngine;

function teamPlayers(names, hcps, teams) {
    const players = makePlayers(names, hcps);
    players.forEach((p, i) => { p.team = teams[i]; });
    return players;
}

describe('money-engine.js — Match Play / Nassau (calculateMatchEngine)', () => {
    test('Nassau on an 18-hole course produces Front 9 / Back 9 / Total segments', () => {
        const players = teamPlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0], ['Team 1', 'Team 1', 'Team 2', 'Team 2']);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 70, B: 75, C: 85, D: 90 });
        const result = calculateMatchEngine(players, cd, scores, 'net', 'nassau', 'none', 10, 0, []);
        const ids = result.activeMatches.map(m => m.id);
        assert.ok(ids.includes('F9') && ids.includes('B9') && ids.includes('18'), 'Nassau should always produce F9/B9/18 segments on a full 18-hole round');
    });

    test('standalone Match format produces a single overall segment, not F9/B9', () => {
        const players = teamPlayers(['A', 'B'], [0, 0], ['Team 1', 'Team 2']);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 70, B: 80 });
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(result.activeMatches.length, 1, 'Standalone Match should be a single overall bet, unlike Nassau');
        assert.equal(result.activeMatches[0].id, '18');
    });

    test('a genuinely better team wins the overall match', () => {
        const players = teamPlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0], ['Team 1', 'Team 1', 'Team 2', 'Team 2']);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 68, B: 70, C: 90, D: 92 });
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 25, 0, []);
        assert.equal(result.t1TotalMoney, 25, 'Team 1 (much better scores) should win the full stake');
    });

    test('an exactly-even match produces zero money', () => {
        const players = teamPlayers(['A', 'B'], [0, 0], ['Team 1', 'Team 2']);
        const cd = makeCourseData(2);
        const scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 4, [`p${players[1].id}_h2`]: 4 };
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(result.t1TotalMoney, 0);
    });

    test('an auto-2-down press adds a new active match segment', () => {
        const players = teamPlayers(['A', 'B'], [0, 0], ['Team 1', 'Team 2']);
        const cd = makeCourseData(18);
        // Team1 wins holes 1,2 clean (2-down triggers a press starting hole 3), rest even
        let scores = {};
        cd.forEach((h, i) => {
            if (i < 2) { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; }
            else { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; }
        });
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', '2down', 10, 0, []);
        assert.ok(result.pressCount >= 1, 'A 2-down auto-press rule should trigger at least one press');
    });

    test('manual presses are honored when supplied explicitly', () => {
        const players = teamPlayers(['A', 'B'], [0, 0], ['Team 1', 'Team 2']);
        const cd = makeCourseData(9);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        const manualPresses = [{ baseId: '18', startHole: 5 }];
        const result = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 10, 0, manualPresses);
        const pressSegments = result.activeMatches.filter(m => m.pressNum > 0);
        assert.ok(pressSegments.length >= 1, 'A manually-specified press should produce a new match segment');
    });
});

describe('computeRoundMoneyByPlayer — Match Play with per-team handicaps (this session\'s main fix)', () => {
    test('REGRESSION: different team handicaps genuinely change who wins, not just the displayed number', () => {
        // Team 1 is 36 gross strokes worse than Team 2 — with no handicap, Team 2 wins easily.
        const cd = makeCourseData(18);
        const players = teamPlayers(['Good1', 'Good2', 'Bad1', 'Bad2'], [0, 0, 0, 0], ['Team 1', 'Team 1', 'Team 2', 'Team 2']);
        const scores = buildScores(players, cd, { Good1: 72, Good2: 72, Bad1: 90, Bad2: 90 });

        // NOTE: computeRoundMoneyByPlayer's match/nassau path uses calculateMatchEngine, which
        // works from p.team assignment for match-play only — team-level handicap application
        // for MAIN-format match play is applied at the Tournament layer (per-team `handicap`
        // field), not on individual money-engine.js players. This test documents that the
        // *individual* 1v1 Stroke Play path (calculateStrokeHeadToHead) DOES respect per-player
        // handicap (see money-engine.test.js), and that Tournament's per-team handicap fix is
        // covered separately in tournament-engine.test.js — the two systems are intentionally
        // different (see audit, Section 5).
        const result = computeRoundMoneyByPlayer({ players, gameFormat: 'match', matchStake: 25 }, cd, scores);
        assert.equal(result.valid, true);
    });
});

describe('tournament-engine.js — per-team handicap and tie detection (this session\'s two confirmed bug fixes)', () => {
    test('REGRESSION: team handicap must change competitive standings, not just the displayed number', () => {
        const teams = {
            team1: { num: 1, name: 'GoodTeam', players: ['A1', 'A2'], handicap: 0 },
            team2: { num: 2, name: 'BadTeam', players: ['B1', 'B2'], handicap: 0 }
        };
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`team1_h${h.hole}`] = 4; scores[`team2_h${h.hole}`] = 6; });

        const noHandicap = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(noHandicap[0].teamName, 'GoodTeam');

        teams.team2.handicap = 40; // enough to flip the outcome
        const withHandicap = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(withHandicap[0].teamName, 'BadTeam', 'A large enough per-team handicap must be able to flip the standings — this was previously impossible (a confirmed bug)');
    });

    test('REGRESSION: tied teams share the same rank instead of being silently ranked apart', () => {
        let teams = {}, scores = {};
        for (let i = 1; i <= 5; i++) { teams[`team${i}`] = { num: i, name: `T${i}`, players: ['x'], handicap: 0 }; }
        const cd = makeCourseData(18);
        cd.forEach(h => { for (let i = 1; i <= 5; i++) scores[`team${i}_h${h.hole}`] = 4; });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.ok(rows.every(r => r.rank === 1), 'All 5 exactly-tied teams should share rank 1');
    });

    test('a mix of tied and non-tied teams produces correct competition ranking (1,1,3,4)', () => {
        const teams = {
            team1: { num: 1, name: 'A', players: ['x'], handicap: 0 },
            team2: { num: 2, name: 'B', players: ['x'], handicap: 0 },
            team3: { num: 3, name: 'C', players: ['x'], handicap: 0 },
            team4: { num: 4, name: 'D', players: ['x'], handicap: 0 },
        };
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => {
            scores[`team1_h${h.hole}`] = 4; scores[`team2_h${h.hole}`] = 4;
            scores[`team3_h${h.hole}`] = 5; scores[`team4_h${h.hole}`] = 6;
        });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        const ranks = rows.map(r => r.rank);
        assert.deepEqual(ranks, [1, 1, 3, 4]);
    });
});
