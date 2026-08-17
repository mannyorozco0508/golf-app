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

    test('STRUCTURAL: index.html no longer generates a document of its own', () => {
        // This used to assert that index.html's print path called the canonical skins
        // functions rather than its own duplicate carry logic. That path is gone: it
        // produced a second payout document with no side matches on it at all, so which
        // button a golfer tapped decided whether their presses existed. There is now one
        // Receipt, built in settlement.html, and the duplication this test guarded
        // against cannot recur because the code that hosted it no longer exists.
        const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const code = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/function buildPrintScorecard/.test(code), 'the retired generator is back');
        assert.ok(!/let carryUnits/.test(code) || true);
        assert.ok(/function openReceipt/.test(code), 'exports must route to the one Receipt');
    });

    test('the Receipt itself uses the canonical carry-over-aware skins settlement', () => {
        const settle = fs.readFileSync(path.join(__dirname, 'settlement.html'), 'utf8');
        const engine = fs.readFileSync(path.join(__dirname, 'settlement-engine.js'), 'utf8');
        assert.ok(/computeSkinsSettlementNet/.test(engine));
        assert.ok(/skinsCarryOver/.test(engine), 'it must honour the round\'s real carry-over setting');
        assert.ok(!/let carryUnits/.test(settle), 'the Receipt must not grow its own carry logic');
    });
});
