const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const fs = require('fs');
const path = require('path');

const ix = loadHtmlInlineScript('index.html');
const { computeSkinsCarryOverLive, computeSkinsVoidLive } = ix;

describe('PRINT/PDF SKINS BUG FIX — the exact reproduction scenario from the audit', () => {
    test('REGRESSION: hole 1 ties, hole 2 ties, hole 3 won outright — Carry-Over correctly absorbs both carried holes', () => {
        // This is the exact scenario used to confirm the original bug: the stale print-only
        // copy showed the winner with just 1 skin on hole 3 and no mention of holes 1-2 at all.
        // The fix removed that copy entirely — print now calls this same function directly, so
        // this test is simultaneously verifying both the live ticker AND the print output,
        // since they're no longer two different code paths.
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        const cd = makeCourseData(3);
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 5, [`p${players[1].id}_h2`]: 5,
            [`p${players[0].id}_h3`]: 3, [`p${players[1].id}_h3`]: 5,
        };
        const result = computeSkinsCarryOverLive(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1);
        assert.equal(result.skins[0].hole, 3);
        assert.equal(result.skins[0].unitsWon, 3, 'Manny should absorb both carried ties (holes 1, 2) plus his own win — 3 units total, not 1');
        assert.equal(result.skins[0].player.name, 'Manny');
    });

    test('Void mode parity: the same scenario correctly shows ties as simply voided, not carried', () => {
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        const cd = makeCourseData(3);
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 5, [`p${players[1].id}_h2`]: 5,
            [`p${players[0].id}_h3`]: 3, [`p${players[1].id}_h3`]: 5,
        };
        const result = computeSkinsVoidLive(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1);
        assert.equal(result.skins[0].unitsWon, 1, 'Void mode should never accumulate units — holes 1-2 are simply thrown out');
    });

    test('STRUCTURAL: the print path in index.html actually calls the canonical carry-over-aware functions, not a reintroduced duplicate', () => {
        const filePath = path.join(__dirname, '..', 'index.html');
        const source = fs.readFileSync(filePath, 'utf8');
        const printSkinsStart = source.indexOf("} else if (format === 'skins') {");
        const printSkinsEnd = source.indexOf("if (currentData.birdieGameEnabled", printSkinsStart);
        const printSkinsBlock = source.slice(printSkinsStart, printSkinsEnd);

        assert.ok(printSkinsBlock.includes('computeSkinsCarryOverLive') && printSkinsBlock.includes('computeSkinsVoidLive'),
            'the print path must call the same canonical functions as the live ticker');
        assert.ok(printSkinsBlock.includes('currentData.skinsCarryOver'),
            'the print path must actually check the round\'s real carry-over setting, not assume one mode');
        // The specific pattern of the old bug: iterating courseData and manually computing
        // Math.min(...holeScores.map(...)) inline, with no concept of carryUnits at all.
        assert.ok(!printSkinsBlock.includes('let carryUnits'),
            'the print path should not have its own separate carry-tracking logic — it should delegate entirely to the shared functions');
    });
});

describe('MATCH PLAY EARLY-LEAD FINDING — UI confusion vs actual settlement bug (Part 5 investigation)', () => {
    const engine = loadJsFile('money-engine.js');
    const { calculateMatchEngine, computeRoundMoneyByPlayer } = engine;

    test('reproduces the exact scenario: 3-up thru 6, 12 holes remaining', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2';
        let scores = {};
        [1, 2, 3].forEach(h => { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; });
        [4, 5, 6].forEach(h => { scores[`p${players[0].id}_h${h}`] = 4; scores[`p${players[1].id}_h${h}`] = 4; });

        const data = { players, gameFormat: 'match', matchStake: 20, courseData: cd, scores };
        const result = computeRoundMoneyByPlayer(data, cd, scores);

        // This IS the actual, confirmed behavior: computeRoundMoneyByPlayer returns a live
        // "if this were the final result right now" snapshot, not a completion-gated value —
        // it shows the full $20 as though decided, at thru 6 with 12 holes left. This is a
        // documented, real characteristic of the engine (verified here, not assumed), and it
        // is UI PRESENTATION's job to make clear this is a live snapshot, not a final result —
        // this test exists to make sure that characteristic doesn't silently change later.
        assert.equal(result.players.find(p => p.name === 'A').net, 20);
        assert.equal(result.players.find(p => p.name === 'B').net, -20);

        // Confirm the match is NOT mathematically closed at this point — 12 holes still to play
        // means a 3-up lead is very much reversible, unlike a genuinely closed match (e.g. "5&4").
        const matchCalc = calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 20, 0, []);
        const finalSeg = matchCalc.activeMatches.find(m => m.id === '18');
        assert.equal(finalSeg.closed, false, 'the match segment itself correctly reports NOT closed — the engine knows this is still live, the raw money number just does not communicate that on its own');
    });
});

describe('NASSAU PRESS UX — multiple overlapping/cascading presses remain individually understandable (Scenario C)', () => {
    const engine = loadJsFile('money-engine.js');
    const { calculateMatchEngine } = engine;

    test('REGRESSION: a press that itself triggers a further press produces two distinct, independently correct entries', () => {
        const cd = makeCourseData(9);
        const a = { id: 101, name: 'Manny', hcp: '0', team: 'Team 1' };
        const b = { id: 102, name: 'John', hcp: '0', team: 'Team 2' };
        let scores = {};
        [1, 2, 3, 4].forEach(h => { scores[`p101_h${h}`] = 3; scores[`p102_h${h}`] = 5; });
        [5, 6, 7, 8, 9].forEach(h => { scores[`p101_h${h}`] = 4; scores[`p102_h${h}`] = 4; });

        const calc = calculateMatchEngine([a, b], cd, scores, 'net', 'match', '2down', 10, 0, []);
        assert.equal(calc.pressCount, 2, 'a press going 2-down itself should trigger a second press');

        const press1 = calc.activeMatches.find(m => m.pressNum === 1);
        const press2 = calc.activeMatches.find(m => m.pressNum === 2);
        assert.equal(press1.label, 'Press 1 (Hole 3)');
        assert.equal(press2.label, 'Press 2 (Hole 5)');
        assert.equal(press1.closed, true, 'Press 1 should be mathematically decided by hole 9');
        assert.equal(press2.closed, false, 'Press 2 should still be genuinely live, distinct from Press 1\'s state');
    });

    test('every press shares the same flat stake as the original match — no per-press override exists in the engine', () => {
        const cd = makeCourseData(9);
        const a = { id: 101, name: 'A', hcp: '0', team: 'Team 1' };
        const b = { id: 102, name: 'B', hcp: '0', team: 'Team 2' };
        let scores = {};
        [1, 2].forEach(h => { scores[`p101_h${h}`] = 3; scores[`p102_h${h}`] = 5; });
        [3, 4, 5, 6, 7, 8, 9].forEach(h => { scores[`p101_h${h}`] = 4; scores[`p102_h${h}`] = 4; });
        const calc = calculateMatchEngine([a, b], cd, scores, 'net', 'match', '2down', 15, 0, []);
        assert.equal(calc.t1TotalMoney, 15, 'the original 2-hole win plus one still-tied press should net to exactly one stake');
    });
});

describe('WOLF UX — rotation, and the precise Lone vs Blind asymmetry found this batch', () => {
    const engine = loadJsFile('money-engine.js');
    const { calcWolfEngine } = engine;

    test('REGRESSION: wolf rotation cycles correctly through all 4 players by simple array order', () => {
        const cd = makeCourseData(8);
        const players = [
            { id: 101, name: 'Manny', hcp: '0' }, { id: 102, name: 'John', hcp: '0' },
            { id: 103, name: 'Mike', hcp: '0' }, { id: 104, name: 'Steve', hcp: '0' }
        ];
        let scores = {}, wolfCalls = {};
        for (let h = 1; h <= 8; h++) {
            players.forEach(p => scores[`p${p.id}_h${h}`] = 4);
            wolfCalls[`h${h}`] = { call: 'lone', partnerId: null };
        }
        const calc = calcWolfEngine({ players, wolfCalls, wolfLoneMult: 2 }, cd, scores);
        const expected = ['Manny', 'John', 'Mike', 'Steve', 'Manny', 'John', 'Mike', 'Steve'];
        const actual = [1, 2, 3, 4, 5, 6, 7, 8].map(h => calc.holeLog[h].wolfName);
        assert.deepEqual(actual, expected);
    });

    test('DOCUMENTED FINDING: losing a Blind Wolf call costs the same 3-point split as losing a Lone call — the 4x blind multiplier only applies to the wolf\'s upside, not the downside', () => {
        const cd = makeCourseData(1);
        const players = [
            { id: 101, name: 'Wolf', hcp: '0' }, { id: 102, name: 'B', hcp: '0' },
            { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }
        ];
        const scores = { p101_h1: 6, p102_h1: 3, p103_h1: 4, p104_h1: 5 };
        const wolfCalls = { h1: { call: 'blind', partnerId: null } };
        const calc = calcWolfEngine({ players, wolfCalls, wolfBlindMult: 4 }, cd, scores);
        const totalAwarded = players.slice(1).reduce((s, p) => s + (calc.totals[p.id] || 0), 0);
        assert.equal(totalAwarded, 3, 'losing a Blind call awards the opponents 3 total points, not 4 — matching a Lone loss exactly, not the Blind multiplier');
    });

    test('a hole with no call recorded yet is correctly reported as unresolved, not silently scored', () => {
        const cd = makeCourseData(1);
        const players = [
            { id: 101, name: 'A', hcp: '0' }, { id: 102, name: 'B', hcp: '0' },
            { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }
        ];
        const scores = { p101_h1: 4, p102_h1: 4, p103_h1: 4, p104_h1: 4 };
        const calc = calcWolfEngine({ players, wolfCalls: {} }, cd, scores);
        assert.equal(calc.holeLog[1].resolved, false);
        assert.equal(calc.holeLog[1].call, null);
    });
});
