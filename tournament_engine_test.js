const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const engine = loadJsFile('tournament-engine.js');
const { computeTeamHoleScore, computeTeamTotals, computeTournamentLeaderboard } = engine;

describe('tournament-engine.js — computeTeamHoleScore (per-format team scoring)', () => {
    test('bestball takes the single lowest score', () => {
        assert.equal(computeTeamHoleScore('bestball', [5, 4, 6], 1), 4);
    });

    test('shamble best-1 takes the single lowest score', () => {
        assert.equal(computeTeamHoleScore('shamble', [5, 4, 6], 1), 4);
    });

    test('shamble best-2 sums the two lowest scores', () => {
        assert.equal(computeTeamHoleScore('shamble', [6, 3, 4, 8], 2), 7, '3+4=7, the two lowest');
    });

    test('shamble with more count requested than players available uses whatever is there, not fewer', () => {
        assert.equal(computeTeamHoleScore('shamble', [4, 5], 4), 9, 'Math.min(4,2)=2 scores used, both of them');
    });

    test('an empty score list returns null rather than 0 or NaN', () => {
        assert.equal(computeTeamHoleScore('bestball', [], 1), null);
    });

    test('missing shambleCountBest falls back to best-1', () => {
        assert.equal(computeTeamHoleScore('shamble', [5, 3, 7], undefined), 3);
    });
});

describe('tournament-engine.js — computeTeamTotals', () => {
    test('scramble sums the single shared team score per hole', () => {
        const team = { num: 1, players: ['A', 'B'] };
        const cd = makeCourseData(4);
        let scores = {};
        cd.forEach(h => { scores[`team1_h${h.hole}`] = 4; });
        const totals = computeTeamTotals({ format: 'scramble', courseData: cd, scores }, team);
        assert.equal(totals.strokes, 16);
        assert.equal(totals.thru, 4);
    });

    test('best ball uses one partner\'s score even if the other partner never posts a score at all', () => {
        const team = { num: 1, players: ['A', 'B'] };
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`team1_p0_h${h.hole}`] = 5; }); // partner B (index 1) never scores
        const totals = computeTeamTotals({ format: 'bestball', courseData: cd, scores }, team);
        assert.equal(totals.thru, 18, 'A missing partner should not block the team from counting holes it does have a score for');
        assert.equal(totals.strokes, 90);
    });

    test('a team with zero scores anywhere shows thru 0, not a crash', () => {
        const team = { num: 1, players: ['A', 'B'] };
        const totals = computeTeamTotals({ format: 'bestball', courseData: makeCourseData(18), scores: {} }, team);
        assert.equal(totals.thru, 0);
        assert.equal(totals.strokes, 0);
    });
});

describe('tournament-engine.js — computeTournamentLeaderboard (full integration)', () => {
    test('teams with scores always rank above teams that have not started, regardless of team number order', () => {
        const teams = {
            team1: { num: 1, name: 'Started', players: ['A'], handicap: 0 },
            team2: { num: 2, name: 'NotStarted', players: ['B'], handicap: 0 }
        };
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`team1_h${h.hole}`] = 4; });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(rows[0].teamName, 'Started');
        assert.equal(rows[1].hasScores, false);
        assert.equal(rows[1].rank, null, 'A team that has not started should not receive a numeric rank at all');
    });

    test('large field (28 teams, Men\'s Club Day scale) computes without error and produces 28 ranked rows', () => {
        let teams = {}, scores = {};
        for (let i = 1; i <= 28; i++) {
            teams[`team${i}`] = { num: i, name: `Team ${i}`, players: [`P${i}a`, `P${i}b`], handicap: 0 };
        }
        const cd = makeCourseData(18);
        for (let i = 1; i <= 28; i++) {
            cd.forEach(h => { scores[`team${i}_h${h.hole}`] = 3 + (i % 6); });
        }
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(rows.length, 28);
        rows.forEach(r => assert.ok(!Number.isNaN(r.toPar), `${r.teamName} should have a valid numeric toPar`));
    });

    test('a 9-hole tournament computes correctly (course-length agnostic)', () => {
        const teams = { team1: { num: 1, name: 'A', players: ['x'], handicap: 0 } };
        const cd = makeCourseData(9);
        let scores = {};
        cd.forEach(h => { scores[`team1_h${h.hole}`] = 4; });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(rows[0].thru, 9);
    });
});
