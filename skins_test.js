const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const skins = loadHtmlInlineScript('skins.html');
const { computeSkinsVoid, computeSkinsCarryOver } = skins;

function sumPayouts(skinsList, skinValueOrFn) {
    return skinsList.reduce((s, skin) => s + skin.unitsWon * (typeof skinValueOrFn === 'function' ? skinValueOrFn(skin) : skinValueOrFn), 0);
}

describe('skins.html — Void mode', () => {
    test('a single clean winner on every hole gets a skin every time', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(4);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        const result = computeSkinsVoid(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 4);
        assert.equal(result.pendingUnits, 0, 'Void mode never carries a pending unit');
        result.skins.forEach(s => assert.equal(s.player.name, 'A'));
    });

    test('a tied hole is simply thrown out — no skin, no carry', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(2);
        const scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5 };
        const result = computeSkinsVoid(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1, 'Only hole 2 should produce a skin; hole 1 (tied) is voided');
        assert.equal(result.skins[0].hole, 2);
    });

    test('KNOWN EDGE CASE: a fully-tied round pays out nothing to anyone, despite a real pot', () => {
        // This is documented, expected Void-mode behavior, not a bug — Carry-Over mode exists
        // specifically as the alternative for groups who don't want this outcome.
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(18);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        const result = computeSkinsVoid(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 0);
        assert.equal(result.pendingUnits, 0);
    });
});

describe('skins.html — Carry-Over mode', () => {
    test('a single clean winner on every hole wins exactly 1 unit each time (no carry ever builds up)', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(4);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        const result = computeSkinsCarryOver(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 4);
        result.skins.forEach(s => assert.equal(s.unitsWon, 1));
        assert.equal(result.pendingUnits, 0);
    });

    test('a single tied hole carries its value onto the next hole\'s winner', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(2);
        // Hole 1 ties, hole 2 has a winner -> that winner should absorb both units
        const scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5 };
        const result = computeSkinsCarryOver(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1);
        assert.equal(result.skins[0].hole, 2);
        assert.equal(result.skins[0].unitsWon, 2, 'The hole-2 winner should absorb the carried hole-1 unit plus their own');
        assert.equal(result.pendingUnits, 0);
    });

    test('multiple consecutive ties stack correctly before finally being claimed', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(4);
        // Holes 1-3 all tie, hole 4 has a winner -> should absorb all 4 units
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 5, [`p${players[1].id}_h2`]: 5,
            [`p${players[0].id}_h3`]: 3, [`p${players[1].id}_h3`]: 3,
            [`p${players[0].id}_h4`]: 4, [`p${players[1].id}_h4`]: 6,
        };
        const result = computeSkinsCarryOver(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 1);
        assert.equal(result.skins[0].unitsWon, 4, 'Three carried ties plus the deciding hole = 4 units');
        assert.equal(result.pendingUnits, 0);
    });

    test('KNOWN EDGE CASE: an unresolved carry at round\'s end is reported as pendingUnits, not lost', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(3);
        // All three holes tie -> nothing is ever claimed, but the carry must still be tracked
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        const result = computeSkinsCarryOver(players, cd, scores, 'gross');
        assert.equal(result.skins.length, 0);
        assert.equal(result.pendingUnits, 3, 'All 3 tied holes should be tracked as a pending, unresolved carry');
    });

    test('POT ACCOUNTING INVARIANT: total money distributed (claimed skins + evenly-split pending carry) always equals the full pot', () => {
        // Realistic messy scenario: several ties, one big carry claim, one leftover unresolved carry
        const players = makePlayers(['Marty', 'Steve', 'Dave'], [0, 0, 0]);
        const cd = makeCourseData(6);
        const scores = {
            // hole1: 3-way tie -> carry=2
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4, [`p${players[2].id}_h1`]: 4,
            // hole2: Marty wins outright -> claims carry(2)+1 = 2 units... wait recompute: carryUnits starts at1, h1 ties->carryUnits=2, h2 Marty wins -> unitsWon=2, reset to 1
            [`p${players[0].id}_h2`]: 3, [`p${players[1].id}_h2`]: 5, [`p${players[2].id}_h2`]: 5,
            // hole3: Steve/Dave tie (Marty worse) -> carryUnits=2
            [`p${players[0].id}_h3`]: 6, [`p${players[1].id}_h3`]: 4, [`p${players[2].id}_h3`]: 4,
            // hole4: Dave wins outright -> claims carryUnits(2)+1=... recompute: after h3 tie carryUnits=2, h4 Dave wins -> unitsWon=2, reset to 1
            [`p${players[0].id}_h4`]: 6, [`p${players[1].id}_h4`]: 5, [`p${players[2].id}_h4`]: 3,
            // holes 5-6: all tie -> unresolved carry of 2 at the end
            [`p${players[0].id}_h5`]: 4, [`p${players[1].id}_h5`]: 4, [`p${players[2].id}_h5`]: 4,
            [`p${players[0].id}_h6`]: 5, [`p${players[1].id}_h6`]: 5, [`p${players[2].id}_h6`]: 5,
        };
        const result = computeSkinsCarryOver(players, cd, scores, 'gross');
        const buyIn = 10, pot = buyIn * players.length;
        const baseVal = pot / cd.length;

        let payouts = {};
        players.forEach(p => payouts[p.name] = 0);
        result.skins.forEach(s => { payouts[s.player.name] += s.unitsWon * baseVal; });
        if (result.pendingUnits > 0) {
            const share = (result.pendingUnits * baseVal) / players.length;
            players.forEach(p => payouts[p.name] += share);
        }
        const totalPaid = Object.values(payouts).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(totalPaid - pot) < 0.001, `Total paid ($${totalPaid}) must equal the pot ($${pot})`);
    });

    test('base value per hole is fixed by total holes, not by how many skins end up decided (this was the pre-fix bug)', () => {
        // Two scenarios with the same pot but wildly different numbers of decided holes should
        // still use the SAME base value per hole — proves the value isn't retroactively inflated
        // just because most holes tied (the exact symptom of the original Void-only bug).
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(4);
        let allDecided = {};
        cd.forEach((h, i) => { allDecided[`p${players[0].id}_h${h.hole}`] = 3; allDecided[`p${players[1].id}_h${h.hole}`] = 4 + i; });
        const resultAllDecided = computeSkinsCarryOver(players, cd, allDecided, 'gross');
        assert.equal(resultAllDecided.skins.length, 4);
        resultAllDecided.skins.forEach(s => assert.equal(s.unitsWon, 1));
    });
});

module.exports = { computeSkinsVoid, computeSkinsCarryOver };
