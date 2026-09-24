// ============================================================================
// GOLDEN: TWO WHOLE-DOLLAR SKINS ROUNDS, EXACTLY AS THEY SETTLE TODAY.
//
// WHY THIS FILE EXISTS. Settlement is recomputed from raw scores every time a
// round is opened - no final money is ever stored. So any change to
// computeSkinsSettlementNet rewrites the receipt of every skins round already
// played, unless the change is gated by a per-round flag the old rounds do not
// carry. The skins odd-dollar wave (2026-09-13) adds such a flag. This file is
// the proof that a round WITHOUT it still settles to the same numbers,
// captured BEFORE the engine changed and frozen as literals.
//
// Every number below was produced by the engine at commit 034a4d0 and is
// asserted verbatim: the standalone skins nets (floats), the combined ledger's
// exact nets, the rounded netByName, every contributions line including the
// "Rounding to whole dollars" repair lines, and the Who Pays Who transactions.
// If any of them moves on a flagless round, the wave has restated history.
//
// Two rounds, same roster, same scores, same $30 split pot:
//   NO CARRY  - the path the odd-dollar rule will replace when the flag is set.
//               Frozen with the flag ABSENT so the legacy branch is pinned.
//   CARRY     - EXCLUDED from the odd-dollar rule this wave even when flagged.
//               Frozen with the flag absent so the excluded path is pinned too.
//
// The fixture is built from helpers/fixtures.js unchanged (makePlayers' six
// keys, ids from 101). The engine is loaded in production order:
// handicap, money-engine, action-model, settlement-engine, pool-engine.
//
// THE FIXTURE'S KEYS ARE PINNED. A new per-round flag added to these rounds
// by a helper or a default would make this file test the new branch while
// still claiming to test the old one. Object.keys is asserted so that cannot
// happen silently.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js']);
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'pool-engine.js'), 'utf8'), sb, { filename: 'pool-engine.js' });
    return sb;
})();
// Cross-realm objects are not reference-equal to local ones; compare by value.
const J = (v) => JSON.parse(JSON.stringify(v));

const CD = makeCourseData(18);
const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'], [0, 4, 9, 13, 18, 22]);
const SCORES = (() => {
    const s = {};
    PLAYERS.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = 5; }));
    // Outright gross winners on 2, 5, 9 and 14; the net skins fall out of the
    // handicaps (Fay, 22, takes four net holes; Cal takes 14 both ways).
    s['p101_h2'] = 4; s['p102_h5'] = 4; s['p101_h9'] = 4; s['p103_h14'] = 3;
    return s;
})();
// Six golfers at $5: a $30 pot, split $15 gross / $15 net. Four gross skins at
// $3.75 and five net skins at $3 - the fractional values the rounding repair
// absorbs today, and exactly what the odd-dollar rule will replace.
const ROUND_KEYS = ['players', 'gameFormat', 'skinsBuyIn', 'skinsPotFormat', 'courseData', 'scores', 'settlementMode', 'skinsCarryOver'];
function round(carry) {
    return { players: PLAYERS, gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'split',
             courseData: CD, scores: SCORES, settlementMode: 'whole-dollar', skinsCarryOver: carry };
}

// ---------------------------------------------------------------------------
// THE FROZEN NUMBERS. Captured 2026-09-13 at 034a4d0. Do not "fix" a golden to
// match a new engine; a golden that moves is the finding.
// ---------------------------------------------------------------------------
const GOLD = {
    noCarry: {
        skinsNet: { 101: 2.5, 102: -1.25, 103: 1.75, 104: -5, 105: -5, 106: 7 },
        netByName: { ann: { name: 'Ann', net: 2 }, ben: { name: 'Ben', net: -1 }, cal: { name: 'Cal', net: 2 },
                     dee: { name: 'Dee', net: -5 }, eli: { name: 'Eli', net: -5 }, fay: { name: 'Fay', net: 7 } },
        exact: { ann: { name: 'Ann', net: 2.5 }, ben: { name: 'Ben', net: -1.25 }, cal: { name: 'Cal', net: 1.75 },
                 dee: { name: 'Dee', net: -5 }, eli: { name: 'Eli', net: -5 }, fay: { name: 'Fay', net: 7 } },
        contributions: {
            ann: { name: 'Ann', lines: [{ label: 'Skins', amount: 2.5 }, { label: 'Rounding to whole dollars', amount: -0.5, rounding: true }], net: 2 },
            ben: { name: 'Ben', lines: [{ label: 'Skins', amount: -1.25 }, { label: 'Rounding to whole dollars', amount: 0.25, rounding: true }], net: -1 },
            cal: { name: 'Cal', lines: [{ label: 'Skins', amount: 1.75 }, { label: 'Rounding to whole dollars', amount: 0.25, rounding: true }], net: 2 },
            dee: { name: 'Dee', lines: [{ label: 'Skins', amount: -5 }], net: -5 },
            eli: { name: 'Eli', lines: [{ label: 'Skins', amount: -5 }], net: -5 },
            fay: { name: 'Fay', lines: [{ label: 'Skins', amount: 7 }], net: 7 }
        },
        transactions: [{ from: 'Dee', to: 'Fay', amount: 5 }, { from: 'Eli', to: 'Fay', amount: 2 }, { from: 'Eli', to: 'Ann', amount: 2 },
                       { from: 'Eli', to: 'Cal', amount: 1 }, { from: 'Ben', to: 'Cal', amount: 1 }],
        grossSkins: [[2, 'Ann', 1], [5, 'Ben', 1], [9, 'Ann', 1], [14, 'Cal', 1]],
        netSkins: [[4, 'Fay', 1], [6, 'Fay', 1], [13, 'Fay', 1], [14, 'Cal', 1], [15, 'Fay', 1]]
    },
    carry: {
        skinsNet: { 101: 0.9722222222222223, 102: -1.5277777777777781, 103: 0.9722222222222223,
                    104: -4.027777777777778, 105: -4.027777777777778, 106: 7.638888888888889 },
        netByName: { ann: { name: 'Ann', net: 1 }, ben: { name: 'Ben', net: -2 }, cal: { name: 'Cal', net: 1 },
                     dee: { name: 'Dee', net: -4 }, eli: { name: 'Eli', net: -4 }, fay: { name: 'Fay', net: 8 } },
        exact: { ann: { name: 'Ann', net: 0.9722222222222223 }, ben: { name: 'Ben', net: -1.5277777777777781 },
                 cal: { name: 'Cal', net: 0.9722222222222223 }, dee: { name: 'Dee', net: -4.027777777777778 },
                 eli: { name: 'Eli', net: -4.027777777777778 }, fay: { name: 'Fay', net: 7.638888888888889 } },
        contributions: {
            ann: { name: 'Ann', lines: [{ label: 'Skins', amount: 0.9722222222222223 }, { label: 'Rounding to whole dollars', amount: 0.02777777777777768, rounding: true }], net: 1 },
            ben: { name: 'Ben', lines: [{ label: 'Skins', amount: -1.5277777777777781 }, { label: 'Rounding to whole dollars', amount: -0.4722222222222219, rounding: true }], net: -2 },
            cal: { name: 'Cal', lines: [{ label: 'Skins', amount: 0.9722222222222223 }, { label: 'Rounding to whole dollars', amount: 0.02777777777777768, rounding: true }], net: 1 },
            dee: { name: 'Dee', lines: [{ label: 'Skins', amount: -4.027777777777778 }, { label: 'Rounding to whole dollars', amount: 0.02777777777777768, rounding: true }], net: -4 },
            eli: { name: 'Eli', lines: [{ label: 'Skins', amount: -4.027777777777778 }, { label: 'Rounding to whole dollars', amount: 0.02777777777777768, rounding: true }], net: -4 },
            fay: { name: 'Fay', lines: [{ label: 'Skins', amount: 7.638888888888889 }, { label: 'Rounding to whole dollars', amount: 0.3611111111111107, rounding: true }], net: 8 }
        },
        transactions: [{ from: 'Dee', to: 'Fay', amount: 4 }, { from: 'Eli', to: 'Fay', amount: 4 },
                       { from: 'Ben', to: 'Ann', amount: 1 }, { from: 'Ben', to: 'Cal', amount: 1 }],
        // units stack: Ann's hole 9 is worth the four halved holes before it
        grossSkins: [[2, 'Ann', 2], [5, 'Ben', 3], [9, 'Ann', 4], [14, 'Cal', 5]], grossPending: 4,
        netSkins: [[4, 'Fay', 4], [6, 'Fay', 2], [13, 'Fay', 7], [14, 'Cal', 1], [15, 'Fay', 1]], netPending: 3
    }
};

const skinRows = (r) => J(r.skins.map(s => [s.hole, s.player.name, s.unitsWon]));

describe('THE FIXTURE IS THE ONE THAT WAS FROZEN', () => {

    test('the roster comes from makePlayers unchanged: six keys, ids 101-106, hcp strings', () => {
        assert.deepEqual(PLAYERS.map(p => p.id), [101, 102, 103, 104, 105, 106]);
        PLAYERS.forEach(p => assert.deepEqual(Object.keys(p).sort(),
            ['hcp', 'id', 'name', 'playingForMoney', 'squad', 'team'], 'makePlayers changed shape'));
        assert.deepEqual(PLAYERS.map(p => p.hcp), ['0', '4', '9', '13', '18', '22']);
    });

    test('both rounds carry EXACTLY the keys frozen here - no per-round flag, no default sneaked in', () => {
        assert.deepEqual(Object.keys(round(false)), ROUND_KEYS);
        assert.deepEqual(Object.keys(round(true)), ROUND_KEYS);
        assert.equal(round(false).settlementMode, 'whole-dollar');
    });

    test('the engine resolves the two rounds as no-carry and carry through skinsCarriesOver()', () => {
        assert.equal(ENG.skinsCarriesOver(round(false).skinsCarryOver), false);
        assert.equal(ENG.skinsCarriesOver(round(true).skinsCarryOver), true);
        assert.equal(ENG.resolveSkinsMode(round(false)), 'split');
    });

    test('the skins themselves: which holes, who, how many units', () => {
        assert.deepEqual(skinRows(ENG.computeSkinsVoidForSettle(PLAYERS, CD, SCORES, 'gross')), GOLD.noCarry.grossSkins);
        assert.deepEqual(skinRows(ENG.computeSkinsVoidForSettle(PLAYERS, CD, SCORES, 'net')), GOLD.noCarry.netSkins);
        const g = ENG.computeSkinsCarryOverForSettle(PLAYERS, CD, SCORES, 'gross');
        const n = ENG.computeSkinsCarryOverForSettle(PLAYERS, CD, SCORES, 'net');
        assert.deepEqual(skinRows(g), GOLD.carry.grossSkins); assert.equal(g.pendingUnits, GOLD.carry.grossPending);
        assert.deepEqual(skinRows(n), GOLD.carry.netSkins); assert.equal(n.pendingUnits, GOLD.carry.netPending);
    });
});

[['NO CARRY, flag absent - the branch the odd-dollar rule replaces', false, GOLD.noCarry],
 ['CARRY, flag absent - the branch the odd-dollar rule EXCLUDES', true, GOLD.carry]].forEach(([title, carry, gold]) => {
    describe('GOLDEN: ' + title, () => {
        const data = round(carry);

        test('computeSkinsSettlementNet: the standalone nets, to the float', () => {
            assert.deepEqual(J(ENG.computeSkinsSettlementNet(data, CD, SCORES)), gold.skinsNet);
        });

        test('computeCombinedNetTotals: exact nets', () => {
            assert.deepEqual(J(ENG.computeCombinedNetTotals(data, CD, SCORES).exact), gold.exact);
        });

        test('computeCombinedNetTotals: the rounded netByName a golfer is shown', () => {
            const out = ENG.computeCombinedNetTotals(data, CD, SCORES).netByName;
            assert.deepEqual(J(out), gold.netByName);
            assert.equal(Object.values(J(out)).reduce((a, r) => a + r.net, 0), 0, 'rounded balances must net to zero');
        });

        test('computeCombinedNetTotals: every contributions line, including the rounding repair lines', () => {
            assert.deepEqual(J(ENG.computeCombinedNetTotals(data, CD, SCORES).contributions), gold.contributions);
        });

        test('Who Pays Who transactions', () => {
            assert.deepEqual(J(ENG.computeCombinedNetTotals(data, CD, SCORES).transactions), gold.transactions);
        });

        test('the golden is not trivially satisfied: money moved and the fractions are real', () => {
            // A round that paid nobody would satisfy an all-zero golden; this one
            // pays Fay and charges Dee, and (today) rounds three or six golfers.
            assert.ok(gold.netByName.fay.net > 0 && gold.netByName.dee.net < 0);
            const roundingLines = Object.values(gold.contributions).reduce((n, c) => n + c.lines.filter(l => l.rounding).length, 0);
            assert.ok(roundingLines >= 3, 'the frozen round carries rounding lines - the thing the new rule removes');
        });
    });
});

// ---------------------------------------------------------------------------
// GOLDEN 3: THE ROUNDING-REPAIR TIE-BREAK, flag absent (Step 3.2c).
//
// Step 1's two rounds never reached roundNetTotalsToWholeDollars' tie-break:
// one had a unique largest drift, the other needed no repair. This round is
// built to TIE on it. Four golfers at $8, gross only, three skins to three
// DIFFERENT golfers: each is +2.667 exact, rounds to +3, and 3+3+3-8 = +1, so
// the repair has to take one dollar back from a three-way tie on drift. The
// tie is broken by NAME (settlement-engine.js: `a.name.localeCompare(b.name)`)
// - Ann, first alphabetically, is the one who ends on $2.
//
// The odd-dollar rule breaks the same tie by HOLE ORDER instead (Cal, on the
// highest hole, gets the short skin) and leaves nothing for the repair to do.
// skins_odd_dollar_test.js holds the flagged side; this holds the legacy side
// so the difference is measured, not assumed.
// ---------------------------------------------------------------------------
describe('GOLDEN: the rounding-repair TIE-BREAK, flag absent', () => {
    const P4 = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0]);
    const S4 = (() => {
        const s = {};
        P4.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = 5; }));
        s['p101_h3'] = 4; s['p102_h7'] = 4; s['p103_h11'] = 4;
        return s;
    })();
    const TIE_KEYS = ['players', 'gameFormat', 'skinsBuyIn', 'skinsPotFormat', 'skinsCarryOver', 'courseData', 'scores', 'settlementMode'];
    const tie = () => ({ players: P4, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false,
                         courseData: CD, scores: S4, settlementMode: 'whole-dollar' });
    const TIE_GOLD = {
        skinsNet: { 101: 2.666666666666666, 102: 2.666666666666666, 103: 2.666666666666666, 104: -8 },
        netByName: { ann: { name: 'Ann', net: 2 }, ben: { name: 'Ben', net: 3 }, cal: { name: 'Cal', net: 3 }, dee: { name: 'Dee', net: -8 } },
        contributions: {
            ann: { name: 'Ann', lines: [{ label: 'Skins', amount: 2.666666666666666 }, { label: 'Rounding to whole dollars', amount: -0.6666666666666661, rounding: true }], net: 2 },
            ben: { name: 'Ben', lines: [{ label: 'Skins', amount: 2.666666666666666 }, { label: 'Rounding to whole dollars', amount: 0.3333333333333339, rounding: true }], net: 3 },
            cal: { name: 'Cal', lines: [{ label: 'Skins', amount: 2.666666666666666 }, { label: 'Rounding to whole dollars', amount: 0.3333333333333339, rounding: true }], net: 3 },
            dee: { name: 'Dee', lines: [{ label: 'Skins', amount: -8 }], net: -8 }
        },
        transactions: [{ from: 'Dee', to: 'Ben', amount: 3 }, { from: 'Dee', to: 'Cal', amount: 3 }, { from: 'Dee', to: 'Ann', amount: 2 }]
    };

    test('the fixture carries exactly the frozen keys - no flag', () => {
        assert.deepEqual(Object.keys(tie()), TIE_KEYS);
    });

    test('three equal fractions, and the repair takes the dollar from Ann by NAME', () => {
        const c = ENG.computeCombinedNetTotals(tie(), CD, S4);
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(tie(), CD, S4)), TIE_GOLD.skinsNet);
        assert.deepEqual(J(c.netByName), TIE_GOLD.netByName);
        assert.deepEqual(J(c.contributions), TIE_GOLD.contributions);
        assert.deepEqual(J(c.transactions), TIE_GOLD.transactions);
    });

    test('the repair genuinely ran: rounded sum before repair was +1, after is 0', () => {
        const c = ENG.computeCombinedNetTotals(tie(), CD, S4);
        const naive = Object.values(J(c.exact)).reduce((a, r) => a + Math.round(r.net), 0);
        assert.equal(naive, 1, 'Math.round on each exact net over-pays by a dollar - that is what the repair exists for');
        assert.equal(Object.values(J(c.netByName)).reduce((a, r) => a + r.net, 0), 0);
        assert.equal(J(c.contributions).ann.lines.filter(l => l.rounding).length, 1, 'Ann carries the give-back line');
    });
});
