const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const tourney = loadHtmlInlineScript('tournament.html', ['course-data.js', 'tournament-engine.js']);
const { parseTeamsPasteText, chunkPlayersIntoTeams, suggestTeamHandicap, computeShotgunAssignments } = tourney;

const engine = loadJsFile('tournament-engine.js');
const { computeTournamentLeaderboard } = engine;

describe('tournament.html — paste-to-teams parsing', () => {
    test('parses "Name, Handicap" and bare "Name" lines the same way as the Round paste feature', () => {
        const { validPlayers, flaggedLines } = parseTeamsPasteText("John Smith, 8\nMike Jones\nRobert Garcia, +2");
        assert.equal(validPlayers.length, 3);
        assert.equal(flaggedLines.length, 0);
        assert.equal(validPlayers[0].hcp, '8');
        assert.equal(validPlayers[1].hcp, '');
        assert.equal(validPlayers[2].hcp, '+2');
    });

    test('a line with an empty name (blank before the comma) is flagged, not silently dropped', () => {
        const { validPlayers, flaggedLines } = parseTeamsPasteText("John Smith, 8\n, 12\nMike Jones");
        assert.equal(validPlayers.length, 2);
        assert.equal(flaggedLines.length, 1);
        assert.equal(flaggedLines[0].lineNumber, 2);
    });

    test('blank lines are skipped silently', () => {
        const { validPlayers } = parseTeamsPasteText("John Smith, 8\n\n\nMike Jones");
        assert.equal(validPlayers.length, 2);
    });
});

describe('tournament.html — chunkPlayersIntoTeams', () => {
    test('an exactly-divisible field produces uniform team sizes', () => {
        const players = Array.from({ length: 100 }, (_, i) => ({ name: `P${i}`, hcp: '' }));
        const teams = chunkPlayersIntoTeams(players, 4);
        assert.equal(teams.length, 25, '100 players at team size 4 should produce exactly 25 teams');
        assert.ok(teams.every(t => t.length === 4), 'every team should have exactly 4 players');
    });

    test('REGRESSION: a non-divisible field (99 players, team size 4) keeps everyone — 24 full teams + 1 team of 3', () => {
        const players = Array.from({ length: 99 }, (_, i) => ({ name: `P${i}`, hcp: '' }));
        const teams = chunkPlayersIntoTeams(players, 4);
        const fullTeams = teams.filter(t => t.length === 4);
        const partialTeams = teams.filter(t => t.length !== 4);
        assert.equal(fullTeams.length, 24);
        assert.equal(partialTeams.length, 1);
        assert.equal(partialTeams[0].length, 3);
        const totalAcrossTeams = teams.reduce((s, t) => s + t.length, 0);
        assert.equal(totalAcrossTeams, 99, 'nobody should be lost in a non-divisible split');
    });

    test('scale check: 4, 12, 48, 72, 100, 144 players all produce correct, complete team sets at size 4', () => {
        [4, 12, 48, 72, 100, 144].forEach(n => {
            const players = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, hcp: '' }));
            const teams = chunkPlayersIntoTeams(players, 4);
            const total = teams.reduce((s, t) => s + t.length, 0);
            assert.equal(total, n, `${n} players should all be accounted for across teams`);
        });
    });
});

describe('tournament.html — suggestTeamHandicap (a starting suggestion, not new scoring math)', () => {
    test('averages whatever handicaps were actually provided for that team', () => {
        const team = [{ name: 'A', hcp: '8' }, { name: 'B', hcp: '12' }, { name: 'C', hcp: '10' }, { name: 'D', hcp: '' }];
        assert.equal(suggestTeamHandicap(team), 10, '(8+12+10)/3 = 10, the blank is excluded from the average, not treated as 0');
    });

    test('a team with no handicaps provided at all defaults to 0, same as a manually-created team', () => {
        const team = [{ name: 'A', hcp: '' }, { name: 'B', hcp: '' }];
        assert.equal(suggestTeamHandicap(team), 0);
    });
});

describe('tournament.html — computeShotgunAssignments (round-robin, fills every hole before doubling any)', () => {
    test('18 teams on 18 holes: 1-to-1, no letter suffixes needed at all', () => {
        const assignments = computeShotgunAssignments(Array.from({ length: 18 }, (_, i) => i + 1), 18);
        assert.equal(assignments.length, 18);
        assignments.forEach((a, i) => assert.equal(a.label, String(i + 1)));
    });

    test('19 teams on 18 holes: every hole used once before any hole gets a second team', () => {
        const assignments = computeShotgunAssignments(Array.from({ length: 19 }, (_, i) => i + 1), 18);
        const holesUsed = new Set(assignments.map(a => parseInt(a.label, 10)));
        assert.equal(holesUsed.size, 18, 'all 18 holes should be in use before any hole doubles up');
        const lettered = assignments.filter(a => /[A-Z]/.test(a.label));
        assert.equal(lettered.length, 2, 'exactly the 2 teams sharing the one doubled-up hole should get letters');
    });

    test('25 teams on 18 holes: 7 holes get 2 teams, 11 holes get exactly 1', () => {
        const assignments = computeShotgunAssignments(Array.from({ length: 25 }, (_, i) => i + 1), 18);
        assert.equal(assignments.length, 25);
        let perHole = {};
        assignments.forEach(a => { const h = parseInt(a.label, 10); perHole[h] = (perHole[h] || 0) + 1; });
        const holesWithTwo = Object.values(perHole).filter(c => c === 2).length;
        const holesWithOne = Object.values(perHole).filter(c => c === 1).length;
        assert.equal(holesWithTwo, 7);
        assert.equal(holesWithOne, 11);
        assert.equal(Object.keys(perHole).length, 18, 'every hole should be used');
    });

    test('36 teams on 18 holes: every hole gets exactly 2 teams, clean A/B split', () => {
        const assignments = computeShotgunAssignments(Array.from({ length: 36 }, (_, i) => i + 1), 18);
        let perHole = {};
        assignments.forEach(a => { const h = parseInt(a.label, 10); perHole[h] = (perHole[h] || 0) + 1; });
        assert.ok(Object.values(perHole).every(c => c === 2), 'every hole should have exactly 2 teams');
        assert.equal(Object.keys(perHole).length, 18);
    });

    test('every assignment has a valid hole number (1 to totalHoles), for every tested scale', () => {
        [18, 19, 25, 36].forEach(n => {
            const assignments = computeShotgunAssignments(Array.from({ length: n }, (_, i) => i + 1), 18);
            assignments.forEach(a => {
                const holeNum = parseInt(a.label, 10);
                assert.ok(holeNum >= 1 && holeNum <= 18, `hole number in "${a.label}" should be between 1 and 18`);
            });
        });
    });

    test('deterministic — same input always produces the same output', () => {
        const teamNums = Array.from({ length: 25 }, (_, i) => i + 1);
        const first = computeShotgunAssignments(teamNums, 18);
        const second = computeShotgunAssignments(teamNums, 18);
        assert.equal(JSON.stringify(first), JSON.stringify(second));
    });
});

describe('tournament-engine.js — shotgun-safe progress calculation (reconfirmed, not assumed)', () => {
    test('REGRESSION: progress is "holes completed", not "highest hole number entered"', () => {
        const cd = makeCourseData(18);
        const teams = {
            teamA: { num: 1, name: 'Shotgun Start (hole 8)', players: ['x'], handicap: 0 },
            teamB: { num: 2, name: 'Normal Start (hole 1)', players: ['x'], handicap: 0 }
        };
        let scores = {};
        [8, 9, 10, 11, 12].forEach(h => { scores[`team1_h${h}`] = 4; }); // Team A started at hole 8
        [1, 2, 3, 4, 5].forEach(h => { scores[`team2_h${h}`] = 4; });   // Team B started at hole 1

        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        const teamA = rows.find(r => r.num === 1);
        const teamB = rows.find(r => r.num === 2);
        assert.equal(teamA.thru, 5, 'Team A completed 5 holes (8-12) — thru should be 5, not 12');
        assert.equal(teamB.thru, 5, 'Team B completed 5 holes (1-5) — thru should be 5');
        assert.equal(teamA.thru, teamB.thru, 'two teams with equal actual progress should show equal thru, regardless of which physical holes they played');
    });

    test('a team that wraps around (plays 17, 18, then 1, 2, 3) still totals and progresses correctly', () => {
        const cd = makeCourseData(18);
        const teams = { team1: { num: 1, name: 'Wraparound', players: ['x'], handicap: 0 } };
        let scores = {};
        [17, 18, 1, 2, 3].forEach(h => { scores[`team1_h${h}`] = 4; });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(rows[0].thru, 5);
        assert.equal(rows[0].strokes, 20);
    });
});

describe('BACKWARD COMPATIBILITY — a tournament created before shotgun starts existed', () => {
    test('a tournament with no startType or startingHole fields at all still computes a correct leaderboard', () => {
        const cd = makeCourseData(18);
        // Deliberately no startType, no startingHole anywhere — simulates real pre-existing data
        const teams = {
            team1: { num: 1, name: 'Old Team A', players: ['x', 'y'], handicap: 0 },
            team2: { num: 2, name: 'Old Team B', players: ['x', 'y'], handicap: 5 }
        };
        let scores = {};
        cd.forEach(h => { scores[`team1_h${h.hole}`] = 4; scores[`team2_h${h.hole}`] = 5; });
        const rows = computeTournamentLeaderboard({ format: 'scramble', courseData: cd, teams, scores });
        assert.equal(rows.length, 2);
        assert.ok(rows.every(r => r.thru === 18), 'old-shape tournaments should still compute a complete, correct leaderboard');
    });
});
