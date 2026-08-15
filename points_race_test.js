const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, buildScores } = require('./helpers/fixtures.js');

const trip = loadHtmlInlineScript('trip.html', ['money-engine.js', 'course-data.js']);
const { computeTripPointsRace } = trip;

function round(label, players, totalsByName, holesPlayed, courseData) {
    const cd = courseData || makeCourseData(18);
    return { code: label, label, data: { players, courseData: cd, scores: buildScores(players, cd, totalsByName, holesPlayed) } };
}

describe('trip.html — computeTripPointsRace', () => {
    test('a completed round awards points, field-size relative (fieldSize - position + 1)', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }, { id: 3, name: 'C', hcp: '0' }];
        const results = [round('Day1', players, { A: 70, B: 75, C: 80 })];
        const standings = computeTripPointsRace(results);
        const byName = Object.fromEntries(standings.map(s => [s.name, s]));
        assert.equal(byName.A.points, 3);
        assert.equal(byName.B.points, 2);
        assert.equal(byName.C.points, 1);
    });

    test('REGRESSION (the actual originally-verified scenario): with 2+ finishers present, partial-round players are excluded while finishers rank normally against each other', () => {
        // Mirrors this session's original bug-hunt scenario: Marty & Dave finish all 18, Steve
        // stops at 9, Manny stops at 3. Only Marty/Dave should be ranked; Steve/Manny excluded.
        const players = [
            { id: 1, name: 'Marty', hcp: '0' }, { id: 2, name: 'Steve', hcp: '0' },
            { id: 3, name: 'Dave', hcp: '0' }, { id: 4, name: 'Manny', hcp: '0' }
        ];
        const cd = makeCourseData(18);
        const scores = {
            ...buildScores([players[0]], cd, { Marty: 72 }, 18),
            ...buildScores([players[1]], cd, { Steve: 40 }, 9),
            ...buildScores([players[2]], cd, { Dave: 78 }, 18),
            ...buildScores([players[3]], cd, { Manny: 14 }, 3),
        };
        const results = [{ code: 'Day1', label: 'Day1', data: { players, courseData: cd, scores } }];
        const standings = computeTripPointsRace(results);
        const names = standings.map(s => s.name).sort();
        assert.deepEqual(names, ['Dave', 'Marty'], 'Only the two finishers should be ranked; the two partial players must be excluded');
        assert.equal(standings.find(s => s.name === 'Marty').rank, 1);
    });

    // QUARANTINED — not a bug in this test's setup. This surfaced a genuine, previously
    // undecided edge case while writing this suite: the actual verified/documented rule from
    // this session's fix is "points post once a PLAYER has finished," not "once the WHOLE FIELD
    // has finished." Production currently ranks a single finisher alone (a "field of one") and
    // awards them 1 point, which is a legitimate reading of the per-player rule as documented,
    // but was never explicitly decided for this specific case (only tested with 2+ finishers
    // present). I'm not silently changing production, and not silently rewriting this
    // expectation to match it — flagging for an explicit product decision instead.
    test.todo('OPEN QUESTION: should a single finisher in an otherwise-incomplete round be ranked/awarded points against a "field of one", or should points only post once every player who started has finished (or been explicitly marked DNF)? Current production behavior: the lone finisher IS ranked and awarded 1 point. Needs a product decision, not a code change, before this test can assert either way.', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }];
        const cd = makeCourseData(18);
        const scoresA = buildScores([players[0]], cd, { A: 12 }, 3);
        const scoresB = buildScores([players[1]], cd, { B: 72 }, 18);
        const mixed = [{ code: 'Day1', label: 'Day1', data: { players, courseData: cd, scores: { ...scoresA, ...scoresB } } }];
        const standings = computeTripPointsRace(mixed);
        // Documenting current behavior, not asserting it's correct:
        assert.equal(standings.length, 1, 'CURRENT (undecided) behavior: the lone finisher is ranked alone');
        assert.equal(standings[0].name, 'B');
        assert.equal(standings[0].points, 1);
    });

    test('a player with zero holes played in a round contributes nothing that round', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }, { id: 3, name: 'C', hcp: '0' }];
        const cd = makeCourseData(18);
        const scoresAB = buildScores([players[0], players[1]], cd, { A: 70, B: 75 }, 18);
        const results = [{ code: 'Day1', label: 'Day1', data: { players, courseData: cd, scores: scoresAB } }]; // C never scores
        const standings = computeTripPointsRace(results);
        const names = standings.map(s => s.name);
        assert.ok(!names.includes('C'), 'A player who never scored should not appear in that round\'s standings at all');
    });

    test('points accumulate correctly across multiple rounds', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }];
        const results = [
            round('Day1', players, { A: 70, B: 80 }),
            round('Day2', players, { A: 80, B: 70 }), // roles reverse
        ];
        const standings = computeTripPointsRace(results);
        const byName = Object.fromEntries(standings.map(s => [s.name, s]));
        assert.equal(byName.A.points, 3, '2 (day1 win) + 1 (day2 loss) = 3');
        assert.equal(byName.B.points, 3, '1 (day1 loss) + 2 (day2 win) = 3');
        assert.equal(byName.A.roundsPlayed, 2);
    });

    test('a tie for 1st splits the combined points for those positions evenly', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }, { id: 3, name: 'C', hcp: '0' }];
        const results = [round('Day1', players, { A: 70, B: 70, C: 80 })]; // A and B tie for 1st
        const standings = computeTripPointsRace(results);
        const byName = Object.fromEntries(standings.map(s => [s.name, s]));
        assert.equal(byName.A.points, 2.5, '(3+2)/2 = 2.5 for the tied 1st/2nd positions');
        assert.equal(byName.B.points, 2.5);
        assert.equal(byName.C.points, 1);
        assert.equal(byName.A.rank, byName.B.rank, 'A and B should share the same overall rank');
    });

    test('field size scales correctly — an 8-player round awards up to 8 points, not a fixed constant', () => {
        const players = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, hcp: '0' }));
        const totals = {}; players.forEach((p, i) => totals[p.name] = 70 + i);
        const results = [round('Day1', players, totals)];
        const standings = computeTripPointsRace(results);
        const winner = standings.find(s => s.rank === 1);
        assert.equal(winner.points, 8, 'The winner of an 8-player field should get 8 points, not a fixed value like 4');
    });

    test('overall standings ranking uses competition-style ranks (1,1,3) for total points ties', () => {
        const players = [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '0' }, { id: 3, name: 'C', hcp: '0' }];
        const results = [
            round('Day1', players, { A: 70, B: 70, C: 90 }), // A,B tie 1st (2.5 each), C last (1)
        ];
        const standings = computeTripPointsRace(results);
        const ranks = standings.map(s => s.rank).sort();
        assert.deepEqual(ranks, [1, 1, 3]);
    });
});
