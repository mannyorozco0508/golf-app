// ============================================================================
// ONE ROUND, ONE CARRY RULE, EVERY SURFACE.
//
// A round with no stored skinsCarryOver is answered TWO WAYS today, and both
// answers reach a golfer's eyes with money attached to them.
//
//   CARRY, and computed that way:
//     skins.html:655        currentData.skinsCarryOver !== false
//     bet-strip.js:464      cfg.skinsCarryOver !== false      (the LIVE strip
//     bet-strip.js:564      cfg.skinsCarryOver !== false       on the scorecard)
//     settlement.html:1598  data.skinsCarryOver !== false      (the header)
//
//   NO CARRY:
//     settlement-engine.js  skinsCarriesOver(data.skinsCarryOver)
//     pool-engine.js        skinsCarriesOver(skCfg.carryOver)
//
// MEASURED, THREE GOLFERS, $10 BUY-IN, TWO HOLES WON OUTRIGHT AND THIRTEEN
// TIED:
//     skins.html      pot $30.00, "Carrying: 13 gross holes tied"
//                     Ben $12.22   Ann $10.56   Cal $7.22
//     the Receipt     Ann +$5      Ben +$5      Cal -$10
//
// The Skins page tells Cal he has $7.22 coming. The Receipt says he owes $10.
// A $17.22 swing on one golfer, on one round, and each page is internally
// correct - they are answering different questions about the same silence.
//
// AND settlement.html CONTRADICTS ITSELF: its header prints "(Carry Over)" from
// its own !== false while the ledger below it was computed no-carry by the
// engine. The label and the numbers on ONE page disagree.
//
// THIS IS NOT A HABIT IN THE CODEBASE, WHICH IS WHY THE FIX IS NARROW. Swept:
// 59 uses of `!== false` in production. playingForMoney has 35 of them and ZERO
// competing `=== true`; enabled and countsTowardTrip are likewise single-answer.
// skinsCarryOver is the ONLY field with two resolutions. skinsCarriesOver() was
// added with the opposite polarity and only the two money engines were wired to
// it - an incomplete migration, not a convention problem. So the fix is to
// finish the migration, not to change the convention.
//
// WHAT THIS FILE PROVES, AND WHAT IT CANNOT.
// It proves the ROUTING - that no surface decides the rule for itself - and it
// proves the ENGINE-LEVEL answers agree. It CANNOT prove the rendered pages
// show the same money, because a page can route correctly and still print a
// stale label. tools/skins-carry-agreement-check.js does that half in a
// browser, and neither half is optional.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const AM = loadJsFile('action-model.js', ['handicap.js', 'money-engine.js']);
const SE = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
const BS = loadJsFile('bet-strip.js', ['handicap.js', 'money-engine.js', 'action-model.js']);

// THE FIXTURE FROM THE MEASUREMENT. Three golfers, $10 each, holes 2 and 5 won
// outright, the other sixteen tied - so a carried pot has something to ride on
// and a voided one has something to void. Any fixture where the two rules pay
// the same makes every assertion below vacuous, which is asserted at the end.
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [
    { id: 101, name: 'Ann', hcp: '0', playingForMoney: true },
    { id: 102, name: 'Ben', hcp: '0', playingForMoney: true },
    { id: 103, name: 'Cal', hcp: '0', playingForMoney: true }
];
function scores() {
    const s = {};
    PLAYERS.forEach((p) => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = 4; });
    s['p101_h2'] = 3;
    s['p102_h5'] = 3;
    return s;
}
function round(carry) {
    const d = {
        eventName: 'Legacy', roundDay: 'Legacy', courseName: 'C', activeCourseKey: 'c',
        gameFormat: 'skins', skinsBuyIn: 10, skinsPotFormat: 'gross', skinsScoring: 'gross',
        courseData: CD, players: PLAYERS, scores: scores()
    };
    if (carry !== undefined) d.skinsCarryOver = carry;   // undefined = THE FIELDLESS ROUND
    return d;
}

// Every production file that resolves this field for itself. Each must ask the
// canonical resolver instead.
const SURFACES = [
    { file: 'skins.html', what: 'the Skins page' },
    { file: 'bet-strip.js', what: 'the live bet strip on the scorecard' },
    { file: 'settlement.html', what: "the Settle page's header and Receipt" }
];

describe('NO SURFACE DECIDES THE CARRY RULE FOR ITSELF', () => {

    test('the canonical resolver exists and says only an explicit true carries', () => {
        assert.equal(typeof AM.skinsCarriesOver, 'function');
        assert.equal(AM.skinsCarriesOver(undefined), false,
            'the answer every surface must route to');
        assert.equal(AM.skinsCarriesOver(true), true);
    });

    SURFACES.forEach((s) => {
        test(`${s.file} routes through skinsCarriesOver`, () => {
            const src = read(s.file);
            assert.match(src, /skinsCarriesOver\s*\(/,
                `${s.what} never asks the canonical resolver - it decides the rule itself, `
                + 'which is how one round came to be answered two ways');
        });

        test(`${s.file} has no !== false of its own on the carry field`, () => {
            const src = read(s.file);
            const offenders = (src.match(/^.*(?:skinsCarryOver|carryOver)\s*!==\s*false.*$/gm) || [])
                .map((l) => l.trim())
                .filter((l) => !l.startsWith('//') && !l.startsWith('*'));
            assert.deepEqual(offenders, [],
                `${s.what} resolves the carry field itself. A second resolution is exactly `
                + 'what put $7.22 on one page and -$10 on another for the same golfer.\n  '
                + offenders.join('\n  '));
        });
    });

    test('the engines still route through it too, so the fix is not one-sided', () => {
        assert.match(read('settlement-engine.js'), /skinsCarriesOver\(data\.skinsCarryOver\)/);
        assert.match(read('pool-engine.js'), /skinsCarriesOver\(skCfg\.carryOver\)/);
    });
});

describe('A FIELDLESS ROUND GETS ONE ANSWER, AND IT IS NO CARRY', () => {

    // The rule each computing layer arrives at, from the same fieldless round.
    function ruleFromEngine(d) {
        const led = SE.buildSkinsLedgerForRound
            ? SE.buildSkinsLedgerForRound(d, d.courseData, d.scores)
            : null;
        return led ? led.carryOver : AM.skinsCarriesOver(d.skinsCarryOver);
    }
    // skinsState() is the skins entry point, NOT buildBetStrip - that one is about
    // presses and answers a skins round with "The skins format doesn't use
    // presses." An earlier draft of this test asked buildBetStrip and read its
    // silence as a disagreement, which would have reported a defect that was mine.
    function ruleFromBetStrip(d) {
        const st = BS.skinsState(d, d.courseData, d.scores, d.players);
        assert.ok(st && typeof st.carryOver === 'boolean',
            'bet-strip skinsState no longer exposes carryOver - this test can no longer read '
            + 'the rule it is about, and is guarding nothing');
        return st.carryOver;
    }

    test('the engine answers NO CARRY', () => {
        assert.equal(ruleFromEngine(round(undefined)), false);
    });

    test('the bet strip answers NO CARRY', () => {
        assert.equal(ruleFromBetStrip(round(undefined)), false,
            'the live strip on the scorecard still carries a fieldless round while the '
            + 'Receipt does not');
    });

    test('every layer agrees with skinsCarriesOver', () => {
        const d = round(undefined);
        const canonical = AM.skinsCarriesOver(d.skinsCarryOver);
        assert.equal(ruleFromEngine(d), canonical);
        assert.equal(ruleFromBetStrip(d), canonical);
    });
});

describe('AN EXPLICIT CARRY-OVER ROUND STILL CARRIES EVERYWHERE', () => {

    // THIS IS THE ONE THAT STOPS THE FIX BECOMING "CARRY OVER NO LONGER WORKS".
    test('the engine carries when the round says so', () => {
        const d = round(true);
        const led = SE.buildSkinsLedgerForRound
            ? SE.buildSkinsLedgerForRound(d, d.courseData, d.scores) : null;
        assert.equal(led ? led.carryOver : AM.skinsCarriesOver(d.skinsCarryOver), true);
    });

    test('the bet strip carries when the round says so', () => {
        const d = round(true);
        const st = BS.skinsState(d, d.courseData, d.scores, d.players);
        assert.ok(st, 'the strip produced no skins state for a skins round');
        assert.equal(st.carryOver, true,
            'a group that CHOSE carry over must still get it - a default change must not '
            + 'turn into the feature being gone');
    });

    test('an explicit FALSE is honoured too, and is not the same as silence by accident', () => {
        assert.equal(AM.skinsCarriesOver(false), false);
        assert.equal(AM.skinsCarriesOver(undefined), false);
        // Same answer, different reasons. skinsCarryRuleRecorded is what tells them
        // apart, and a receipt needs that distinction to say which rule it applied.
        assert.equal(AM.skinsCarryRuleRecorded(false), true);
        assert.equal(AM.skinsCarryRuleRecorded(undefined), false);
    });
});

describe('THE FIXTURE IS NOT VACUOUS', () => {

    test('carry and no carry pay DIFFERENT money on this fixture', () => {
        // Without this, every assertion above is true of a broken engine that
        // ignores the flag entirely.
        const sum = (d) => {
            const r = SE.computeCombinedNetTotals(d, d.courseData, d.scores);
            return Object.values(r.netByName || {})
                .map((v) => v.name + ':' + Math.round(v.net * 100) / 100).sort().join(' ');
        };
        const carried = sum(round(true));
        const voided = sum(round(false));
        assert.notEqual(carried, voided,
            'the two rules produced identical money, so nothing above is being tested.\n'
            + '  carry:    ' + carried + '\n  no carry: ' + voided);
    });

    test('and the difference is real money, not a rounding wobble', () => {
        const nets = (d) => {
            const r = SE.computeCombinedNetTotals(d, d.courseData, d.scores);
            return Object.fromEntries(Object.values(r.netByName || {}).map((v) => [v.name, v.net]));
        };
        const a = nets(round(true));
        const b = nets(round(false));
        const worst = Math.max(...Object.keys(a).map((n) => Math.abs((a[n] || 0) - (b[n] || 0))));
        assert.ok(worst >= 5,
            `the biggest per-golfer difference between the two rules is $${worst} - too small `
            + 'for this fixture to demonstrate the defect it was chosen for');
    });
});
