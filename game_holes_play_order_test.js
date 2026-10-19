// A GAME ADDED "FROM HOLE N" COVERS THE HOLES IN PLAY ORDER FROM N (2026-10-19 Manny OK:
// gameHoles play order).
//
// On a round off the 10th tee the order played is 10..18 then 1..9. A game added "from H3"
// there was struck after 10..18 and 1..2 were already played, so it covers 3..9 ONLY. Before
// this, action-model.js gameHoles filtered by hole NUMBER (hole >= 3) and the game wrongly
// reached back into 10..18. A round off hole 1 must cover exactly what it always did
// (3..18), and a two-tee start follows the round's own tee (startingHole).
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const AM = loadJsFile('action-model.js');          // + play-order.js, as every page loads it
const AM_REQ = require('./action-model.js');      // the node module path, same answer
const settle = loadHtmlInlineScript('settlement.html', ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);

const cd = makeCourseData(18);
const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
const nums = (holes) => holes.map((h) => h.hole).join(',');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).join(',');

function round(extra, gameCfg) {
    return Object.assign({ gameFormat: 'nassau', players: p, courseData: cd, nassauStake: 0,
        additionalGameInstances: { g1: Object.assign({ format: 'skins', enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 3 }, gameCfg || {}) } }, extra);
}
const gameOf = (AMx, data) => AMx.getRoundGames(data).find((g) => g.key === 'g1');

describe('gameHoles: a game from H3', () => {
    test('10th-tee round: covers 3..9 only - 10..18 and 1..2 were played before it', () => {
        [AM, AM_REQ].forEach((AMx) => {
            const g = gameOf(AMx, round({ startingHole: 10 }));
            assert.equal(nums(AMx.gameHoles(g, cd)), range(3, 9));
        });
    });

    test('hole-1 round: covers 3..18, exactly as before (same filter, same objects)', () => {
        [round({}), round({ startingHole: 1 })].forEach((data) => {
            const g = gameOf(AM, data);
            const got = AM.gameHoles(g, cd);
            const before = cd.filter((h) => h.hole >= 3);
            assert.equal(nums(got), range(3, 18));
            got.forEach((h, i) => assert.equal(h, before[i], 'the very same hole objects'));
        });
    });

    test('a game with no round config (old callers) is unchanged: number filter', () => {
        assert.equal(nums(AM.gameHoles({ startHole: 3 }, cd)), range(3, 18));
    });

    test('10th-tee round, game from H12: 12..18 then 1..9, in play order', () => {
        const g = gameOf(AM, round({ startingHole: 10 }, { startHole: 12 }));
        assert.equal(nums(AM.gameHoles(g, cd)), range(12, 18) + ',' + range(1, 9));
    });

    test('two-tee start follows the ROUND\'s tee', () => {
        const off10 = gameOf(AM, round({ startingHole: 10, groupStartingHoles: { 1: 10, 2: 1 } }));
        assert.equal(nums(AM.gameHoles(off10, cd)), range(3, 9));
        const off1 = gameOf(AM, round({ startingHole: 1, groupStartingHoles: { 1: 1, 2: 10 } }));
        assert.equal(nums(AM.gameHoles(off1, cd)), range(3, 18));
    });

    test('range text: H3-9 on the 10th-tee round, H3-18 on a hole-1 round', () => {
        assert.equal(AM.gameRangeText(gameOf(AM, round({ startingHole: 10 })), cd), 'H3–9');
        assert.equal(AM.gameRangeText(gameOf(AM, round({})), cd), 'H3–18');
    });

    test('Dots from H3 on a 10th-tee round drops a dot on 12; a hole-1 round keeps it', () => {
        const dots = { h2: { 101: ['greenie'] }, h5: { 101: ['birdie'] }, h12: { 102: ['sandy'] } };
        const dotsGame = (extra) => gameOf(AM, round(Object.assign({ dots }, extra), { format: 'dots', dotPointVal: 1 }));
        assert.equal(Object.keys(dotsGame({ startingHole: 10 }).config.dots).join(','), 'h5');
        assert.equal(Object.keys(dotsGame({}).config.dots).join(','), 'h5,h12');
    });
});

describe('the money: a skins game from H3 on a 10th-tee round settles over 3..9 only', () => {
    // Manny wins a skin outright on hole 12 (played BEFORE the game existed) and Marty on hole 5.
    const scores = {};
    cd.forEach((h) => p.forEach((pl, i) => {
        let v = h.par;
        if (h.hole === 12 && i === 0) v -= 1;
        if (h.hole === 5 && i === 1) v -= 1;
        scores[`p${pl.id}_h${h.hole}`] = v;
    }));
    const net = (extra) => {
        const g = AM.getRoundGames(round(extra)).find((x) => x.key === 'g1');
        return settle.computeGameNetByPlayerId(g, cd, scores);
    };

    test('10th-tee: hole 12 pays nothing, hole 5 pays Marty', () => {
        const n = net({ startingHole: 10 });
        assert.ok(n[101] <= 0, 'Manny\'s skin on 12 was before the game: ' + JSON.stringify(n));
        assert.ok(n[102] > 0, 'Marty\'s skin on 5 counts: ' + JSON.stringify(n));
        assert.ok(Math.abs(Object.values(n).reduce((s, v) => s + v, 0)) < 0.005, 'zero-sum');
    });

    test('hole-1 round: both skins count, as they always did', () => {
        const n = net({});
        assert.ok(n[101] > 0 && n[102] > 0, JSON.stringify(n));
    });
});
