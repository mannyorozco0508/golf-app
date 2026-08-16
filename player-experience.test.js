const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

const settlement = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const { computeCombinedNetTotals } = settlement;

describe('settlement.html — computeCombinedNetTotals (the new "Final Results" / "Who Pays Who" combiner)', () => {
    test('a round with only a main game (no side matches/games) matches that game\'s own totals exactly', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2';
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        const data = { players, gameFormat: 'match', matchStake: 20, courseData: cd, scores };
        const result = computeCombinedNetTotals(data, cd, scores);
        const byName = Object.fromEntries(Object.values(result.netByName).map(v => [v.name, v.net]));
        assert.equal(byName.A, 20);
        assert.equal(byName.B, -20);
    });

    test('REGRESSION (the exact original acceptance scenario): Nassau + 2 side matches combine to the correct per-player total', () => {
        const cd = makeCourseData(18);
        const manny = { id: 101, name: 'Manny', hcp: '-2', team: 'Team 1', playingForMoney: true };
        const john = { id: 102, name: 'John', hcp: '5', team: 'Team 2', playingForMoney: true };
        const mike = { id: 103, name: 'Mike', hcp: '9', team: 'Team 1', playingForMoney: true };
        const steve = { id: 104, name: 'Steve', hcp: '14', team: 'Team 2', playingForMoney: true };
        const players = [manny, john, mike, steve];
        let scores = {};
        cd.forEach(h => { scores[`p101_h${h.hole}`] = 4; scores[`p102_h${h.hole}`] = 5; scores[`p103_h${h.hole}`] = 4; scores[`p104_h${h.hole}`] = 5; });

        const sideMatches = {
            sm1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], stake: 20, pressRule: 'none' },
            sm2: { format: 'match', scoring: 'net', teamAIds: ['103', '104'], teamBIds: ['101', '102'], stake: 10, pressRule: 'none' }
        };
        const data = { players, gameFormat: 'nassau', nassauStake: 10, nassauPressRule: 'none', nassauScoring: 'net', courseData: cd, scores, sideMatches };

        const result = computeCombinedNetTotals(data, cd, scores);
        const byName = Object.fromEntries(Object.values(result.netByName).map(v => [v.name, v.net]));

        // Verified by hand against three independently-tested engine calls: main Nassau
        // (+15/+15/-15/-15), side match 1 Manny vs John (+20/-20), side match 2 Mike+Steve vs
        // Manny+John with real handicaps applied (+10 split to Mike+Steve, -10 split to Manny+John).
        assert.equal(byName.Manny, 30);
        assert.equal(byName.Mike, 20);
        assert.equal(byName.John, -40);
        assert.equal(byName.Steve, -10);
    });

    test('INVARIANT: combined totals always sum to exactly zero', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B', 'C', 'D'], [8, 12, 4, 18]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1'; players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const scores = buildScores(players, cd, { A: 74, B: 88, C: 80, D: 95 });
        const sideMatches = {
            sm1: { format: 'match', scoring: 'net', teamAIds: [String(players[0].id)], teamBIds: [String(players[2].id)], stake: 15, pressRule: 'none' }
        };
        const data = { players, gameFormat: 'nassau', nassauStake: 10, nassauPressRule: 'none', nassauScoring: 'net', courseData: cd, scores, sideMatches };
        const result = computeCombinedNetTotals(data, cd, scores);
        const sum = Object.values(result.netByName).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(sum) < 0.01, `Combined totals should sum to zero, got ${sum}`);
    });

    test('the "Who Pays Who" transactions always sum to exactly the total amount owed', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        const scores = buildScores(players, cd, { A: 70, B: 80, C: 90 });
        const data = { players, gameFormat: 'stroke', courseData: cd, scores };
        // Stroke Play has no main-format money, so simulate a side match to give it something to combine
        data.sideMatches = { sm1: { format: 'match', scoring: 'gross', teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)], stake: 25, pressRule: 'none' } };
        const result = computeCombinedNetTotals(data, cd, scores);
        const txTotal = result.transactions.reduce((s, t) => s + t.amount, 0);
        const owedTotal = Object.values(result.netByName).filter(v => v.net < 0).reduce((s, v) => s + Math.abs(v.net), 0);
        assert.ok(Math.abs(txTotal - owedTotal) < 0.01, `Transactions (${txTotal}) should exactly cover what's owed (${owedTotal})`);
    });

    test('a round with zero active money sources produces no totals at all (not a false $0 for everyone)', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B'], [0, 0]);
        const data = { players, gameFormat: 'stroke', courseData: cd, scores: {} };
        const result = computeCombinedNetTotals(data, cd, {});
        assert.equal(Object.keys(result.netByName).length, 0);
        assert.equal(result.transactions.length, 0);
    });
});

describe('index.html — live Skins status box (the biggest coverage gap found this batch)', () => {
    const ix = loadHtmlInlineScript('index.html');
    const { computeSkinsCarryOverLive, computeSkinsVoidLive } = ix;

    test('carry-over mode correctly shows accumulated units for the live box, matching skins.html\'s tested engine', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(3);
        // Hole 1 ties, hole 2 A wins outright (absorbs the carry)
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5,
        };
        const result = computeSkinsCarryOverLive(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1);
        assert.equal(result.skins[0].unitsWon, 2, 'the hole-2 winner should absorb the carried hole-1 unit plus their own');
    });

    test('void mode matches skins.html\'s tested engine exactly (ties simply produce no skin)', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(2);
        const scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5 };
        const result = computeSkinsVoidLive(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1, 'only hole 2 should produce a skin; hole 1 (tied) is simply void');
    });
});

describe('index.html — score correction recalculation (Part 10, reconfirmed against the real live-box functions)', () => {
    const ix = loadHtmlInlineScript('index.html');
    const { computeSkinsCarryOverLive } = ix;

    test('correcting an earlier hole correctly changes the carry-over chain', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(4);
        let scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5 };
        const before = computeSkinsCarryOverLive(players, cd, scores, 'gross');
        assert.equal(before.skins[0].unitsWon, 2);

        // Correct hole 1 — it wasn't actually a tie, B won it outright
        scores[`p${players[0].id}_h1`] = 5; scores[`p${players[1].id}_h1`] = 3;
        const after = computeSkinsCarryOverLive(players, cd, scores, 'gross');
        assert.equal(after.skins.length, 2, 'hole 1 and hole 2 should now be two separate 1-unit skins, not one 2-unit skin');
        assert.ok(after.skins.every(s => s.unitsWon === 1));
    });
});
