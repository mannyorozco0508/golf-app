// ============================================================================
// SKINS ODD-DOLLAR RULE - the tests, written before the engine (Wave 1, Step 2).
//
// THE RULE (flagged rounds that do NOT carry):
//   base      = floor(pot / skinsWon)
//   remainder = pot - base * skinsWon
//   The remainder goes one dollar each, in ASCENDING HOLE ORDER, to the winning
//   skins. The extra follows the SKIN: a golfer holding two remainder skins
//   collects both dollars. Payouts sum to the pot exactly. Whole dollars only.
//   Split mode splits at the BUY-IN, per golfer, never at the pot:
//     grossPerGolfer = ceil(buyIn / 2), netPerGolfer = floor(buyIn / 2)
//     grossPot = grossPerGolfer * field, netPot = netPerGolfer * field
//   so $5 x 5 golfers is $3 / $2 each -> pots $15 / $10, and every stake is
//   an integer - a golfer's net stays whole even when one half is unwon.
//   Each half is then allocated by the rule. (Step 3.0 correction: the
//   Step 2 draft halved the POT, $25 -> 13 / 12, which made stakes $2.60 /
//   $2.40 and a 40c net when one half went unwon.)
//
// THE GATE. A per-round flag written at creation by admin.html, beside
// settlementMode:  skinsRounding: 'odd-dollar'.  Absent = today's float math,
// forever (skins_golden_test.js pins that). A round that CARRIES takes today's
// path even when flagged - decided ONLY by skinsCarriesOver(), the resolver
// the engine already pays from.
//
// THE CONTRACT STEP 3 IMPLEMENTS in settlement-engine.js (nothing else may
// change to satisfy this file):
//
//   allocateSkinsOddDollar(potDollars, count) -> integer[] of length count,
//       in the order given (skins are already in hole order), summing to
//       round(potDollars). Pure.
//   skinsOddDollarApplies(data) -> data.skinsRounding === 'odd-dollar'
//       && !skinsCarriesOver(data.skinsCarryOver)
//   computeSkinsPayoutLines(data, courseData, savedScores) ->
//       { rule: 'odd-dollar' | 'legacy',
//         gross: { pot, lines: [{ hole, playerId, playerName, units, value }] },
//         net:   { pot, lines: [...] } }
//       one line per skin won, in hole order; `value` is what THAT skin pays.
//       On a legacy round value is today's float (units * pot/skins or
//       units * pot/holes); on an odd-dollar round it is the integer from
//       allocateSkinsOddDollar. gross.pot / net.pot are the half-pots and
//       gross.perGolfer / net.perGolfer the per-golfer stakes that fund them.
//   computeSkinsSettlementNet(data, ...) pays from those same lines, so the
//       per-skin ledger and the per-player net cannot drift.
//
// EVERY TEST HERE MUST FAIL AGAINST THE UNCHANGED ENGINE - the missing
// functions fail by name, the per-player rows fail on today's fractions.
// Two are "unchanged behaviour" rows by your specification (0 skins won;
// a flagged CARRY round); their nets pass today by definition, so each is
// bound to the new ledger's `rule` field to fail until Step 3 lands.
//
// INTEGER EQUALITY THROUGHOUT. No tolerance anywhere in this file.
//
// fixtures: helpers/fixtures.js unchanged. Pots are buyIn x golfers, which is
// how a real round makes them: $31 is 31 golfers at $1, $32 is 4 at $8, $30 is
// 3 at $10, $25 is 5 at $5.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'pool-engine.js'), 'utf8'), sb, { filename: 'pool-engine.js' });
    return sb;
})();
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);   // hole 4 carries hcpIndex 1
const FLAG = { skinsRounding: 'odd-dollar' };

// A skins round. Everyone shoots 5 on every hole; `wins` maps hole -> roster
// index of the golfer who shoots 4 there (an outright gross AND net skin when
// handicaps are 0). Handicaps make net-only skins where a test wants them.
function skinsRound({ n, buyIn, mode = 'gross', carry = false, wins = {}, hcps, flag = true }) {
    const names = Array.from({ length: n }, (_, i) => 'G' + String(i + 1).padStart(2, '0'));
    const players = makePlayers(names, hcps || names.map(() => 0));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = 5; }));
    Object.entries(wins).forEach(([hole, idx]) => { scores[`p${players[idx].id}_h${hole}`] = 4; });
    const data = Object.assign({ players, gameFormat: 'skins', skinsBuyIn: buyIn, skinsPotFormat: mode,
        skinsCarryOver: carry, courseData: CD, scores, settlementMode: 'whole-dollar' }, flag ? FLAG : {});
    return { data, players, scores };
}
const values = (half) => J(half.lines.map(l => l.value));
const holes = (half) => J(half.lines.map(l => l.hole));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const needLines = () => assert.equal(typeof ENG.computeSkinsPayoutLines, 'function',
    'Step 3 must add computeSkinsPayoutLines() to settlement-engine.js');
const needAlloc = () => assert.equal(typeof ENG.allocateSkinsOddDollar, 'function',
    'Step 3 must add allocateSkinsOddDollar() to settlement-engine.js');
const assertIntegers = (arr, what) => arr.forEach(v => assert.ok(Number.isInteger(v), what + ' must be whole dollars, got ' + v));

// ---------------------------------------------------------------------------
describe('THE ALLOCATOR - pure, in hole order, sums to the pot', () => {

    [[31, 3, [11, 10, 10]], [32, 3, [11, 11, 10]], [32, 5, [7, 7, 6, 6, 6]], [30, 3, [10, 10, 10]],
     [13, 2, [7, 6]], [12, 3, [4, 4, 4]], [15, 4, [4, 4, 4, 3]], [15, 5, [3, 3, 3, 3, 3]]].forEach(([pot, n, want]) => {
        test(`$${pot} over ${n} skins -> ${want.join(', ')}`, () => {
            needAlloc();
            const got = J(ENG.allocateSkinsOddDollar(pot, n));
            assert.deepEqual(got, want);
            assert.equal(sum(got), pot, 'must sum to the pot exactly');
        });
    });

    test('the remainder lands on the FIRST entries, never the last (hole order is the caller\'s order)', () => {
        needAlloc();
        const got = J(ENG.allocateSkinsOddDollar(31, 3));
        assert.equal(got[0], 11); assert.equal(got[2], 10);
    });

    test('zero skins allocates nothing and invents nothing', () => {
        needAlloc();
        assert.deepEqual(J(ENG.allocateSkinsOddDollar(31, 0)), []);
    });
});

// ---------------------------------------------------------------------------
describe('THE GATE', () => {

    test('flag present + no carry -> applies', () => {
        assert.equal(typeof ENG.skinsOddDollarApplies, 'function', 'Step 3 must add skinsOddDollarApplies()');
        assert.equal(ENG.skinsOddDollarApplies(skinsRound({ n: 3, buyIn: 10 }).data), true);
    });

    test('flag absent -> does not apply (today\'s math, forever)', () => {
        assert.equal(typeof ENG.skinsOddDollarApplies, 'function');
        assert.equal(ENG.skinsOddDollarApplies(skinsRound({ n: 3, buyIn: 10, flag: false }).data), false);
    });

    test('flag present + CARRY -> does not apply, decided by skinsCarriesOver() alone', () => {
        assert.equal(typeof ENG.skinsOddDollarApplies, 'function');
        const carry = skinsRound({ n: 3, buyIn: 10, carry: true }).data;
        assert.equal(ENG.skinsCarriesOver(carry.skinsCarryOver), true, 'the resolver says carry');
        assert.equal(ENG.skinsOddDollarApplies(carry), false);
        // Only the resolver's answer matters: a truthy-but-not-true value is NO carry
        // to the engine, so the rule applies to it.
        const loose = Object.assign({}, carry, { skinsCarryOver: 'yes' });
        assert.equal(ENG.skinsCarriesOver(loose.skinsCarryOver), false);
        assert.equal(ENG.skinsOddDollarApplies(loose), true);
    });

    test('any other flag value is not the rule', () => {
        assert.equal(typeof ENG.skinsOddDollarApplies, 'function');
        const d = Object.assign(skinsRound({ n: 3, buyIn: 10 }).data, { skinsRounding: 'legacy' });
        assert.equal(ENG.skinsOddDollarApplies(d), false);
    });
});

// ---------------------------------------------------------------------------
// THE REQUIRED ROWS, each asserted per skin (the ledger) AND per golfer (the
// settlement net), with the pot identity as an integer equality.
// ---------------------------------------------------------------------------
describe('REQUIRED ROWS - flagged, non-carry, gross pot', () => {

    // 31 golfers at $1. G01 wins hole 1, G02 wins hole 7, G03 wins hole 12.
    test('$31, 3 skins -> 11, 10, 10', () => {
        const { data, players } = skinsRound({ n: 31, buyIn: 1, wins: { 1: 0, 7: 1, 12: 2 } });
        // Per golfer first: against today's engine this fails on the fraction
        // (31/3 = 10.333 a skin), which is the number the rule exists to remove.
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 10, 'G01: $11 skin - $1 stake');
        assert.equal(net[players[1].id], 9);
        assert.equal(net[players[2].id], 9);
        assert.equal(sum(Object.values(net)), 0);
        assertIntegers(Object.values(net), 'every net');
        // Then per skin.
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.equal(L.rule, 'odd-dollar');
        assert.deepEqual(holes(L.gross), [1, 7, 12]);
        assert.deepEqual(values(L.gross), [11, 10, 10]);
        assert.equal(sum(values(L.gross)), 31);
    });

    // 4 golfers at $8. G01 wins holes 2 and 9, G02 wins hole 5.
    test('$32, 3 skins -> 11, 11, 10', () => {
        const { data, players } = skinsRound({ n: 4, buyIn: 8, wins: { 2: 0, 5: 1, 9: 0 } });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 21 - 8, 'G01 holds holes 2 ($11) and 9 ($10)');
        assert.equal(net[players[1].id], 11 - 8);
        assert.equal(sum(Object.values(net)), 0);
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.deepEqual(holes(L.gross), [2, 5, 9]);
        assert.deepEqual(values(L.gross), [11, 11, 10]);
        assert.equal(sum(values(L.gross)), 32);
    });

    // 4 golfers at $8. G01 wins 1, 2, 3; G02 wins 4, 5. The two extra dollars
    // sit on holes 1 and 2 - both G01's. (The HIGHEST-hole wrong rule would
    // give them to G02 on 4 and 5: 18 / 14 instead of 20 / 12.)
    test('$32, 5 skins -> 7, 7, 6, 6, 6', () => {
        const { data, players } = skinsRound({ n: 4, buyIn: 8, wins: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 20 - 8);
        assert.equal(net[players[1].id], 12 - 8);
        assert.equal(sum(Object.values(net)), 0);
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.deepEqual(holes(L.gross), [1, 2, 3, 4, 5]);
        assert.deepEqual(values(L.gross), [7, 7, 6, 6, 6]);
        assert.equal(sum(values(L.gross)), 32);
    });

    // 3 golfers at $10; the remainder is 0 and nothing is invented.
    test('$30, 3 skins -> 10, 10, 10', () => {
        const { data, players } = skinsRound({ n: 3, buyIn: 10, wins: { 3: 0, 8: 1, 16: 2 } });
        // Unchanged numbers by construction (30/3 is whole today too); this row
        // is bound to the ledger's rule field so it cannot pass before Step 3.
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.deepEqual([net[players[0].id], net[players[1].id], net[players[2].id]], [0, 0, 0]);
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.deepEqual(values(L.gross), [10, 10, 10]);
        assert.equal(sum(values(L.gross)), 30);
        assert.equal(L.rule, 'odd-dollar', 'still the rule, even when it changes nothing');
    });

    // 4 golfers at $8. G01 wins 1 and 2 (the two remainder skins); G02 wins 3,
    // 4, 5 (three skins, MORE than G01). The extra follows the SKIN: G01 gets
    // both dollars. (The most-skins wrong rule would hand them to G02: 12 / 20
    // instead of 14 / 18.)
    test('one golfer holding TWO remainder skins collects both dollars - per skin, not per total', () => {
        const { data, players } = skinsRound({ n: 4, buyIn: 8, wins: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 14 - 8);
        assert.equal(net[players[1].id], 18 - 8);
        assert.equal(sum(Object.values(net)), 0);
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        const g01 = String(players[0].id);
        const mine = J(L.gross.lines.filter(l => String(l.playerId) === g01).map(l => [l.hole, l.value]));
        assert.deepEqual(mine, [[1, 7], [2, 7]], 'G01\'s two skins each carry a remainder dollar');
        const theirs = J(L.gross.lines.filter(l => String(l.playerId) !== g01).map(l => [l.hole, l.value]));
        assert.deepEqual(theirs, [[3, 6], [4, 6], [5, 6]], 'G02\'s three skins are base only');
        assert.equal(sum(values(L.gross)), 32);
    });
});

describe('REQUIRED ROWS - split mode and the empty round', () => {

    // 5 golfers at $5, split: $3 gross + $2 net EACH -> pots $15 / $10.
    // Gross skins: G01 h1, G02 h2 -> 8, 7. Net adds G05 (hcp 1, a stroke on
    // hole 4 - hcpIndex 1) with a net-only skin on hole 4 -> 4, 3, 3.
    test('$5 x 5 split -> $3/$2 each -> pots 15 (8, 7) and 10 (4, 3, 3)', () => {
        const { data, players } = skinsRound({ n: 5, buyIn: 5, mode: 'split', wins: { 1: 0, 2: 1 }, hcps: [0, 0, 0, 0, 1] });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 8 + 4 - 5);
        assert.equal(net[players[1].id], 7 + 3 - 5);
        assert.equal(net[players[4].id], 3 - 5);
        assert.equal(net[players[2].id], -5); assert.equal(net[players[3].id], -5);
        assert.equal(sum(Object.values(net)), 0);
        assertIntegers(Object.values(net), 'every net');
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.equal(L.gross.perGolfer, 3); assert.equal(L.net.perGolfer, 2);
        assert.equal(L.gross.pot, 15); assert.equal(L.net.pot, 10);
        assert.equal(L.gross.pot + L.net.pot, 25);
        assert.deepEqual(holes(L.gross), [1, 2]);       assert.deepEqual(values(L.gross), [8, 7]);
        assert.deepEqual(holes(L.net), [1, 2, 4]);      assert.deepEqual(values(L.net), [4, 3, 3]);
        assert.equal(sum(values(L.gross)), 15); assert.equal(sum(values(L.net)), 10);
    });

    // ONE HALF UNWON. Same $3/$2 split. G01 shoots 4 on hole 4; G05 (hcp 1)
    // gets a stroke there, so G01 wins the GROSS skin outright and the NET
    // hole is halved. Every other hole ties. Gross pays G01 the whole $15;
    // the net half is unwon and follows the existing refund path: nobody is
    // charged the $2. Nets are whole: G01 15 - 3 = 12, everyone else -3.
    test('one half wins no skins: the other half pays whole, the unwon half is not charged, nets whole', () => {
        const { data, players } = skinsRound({ n: 5, buyIn: 5, mode: 'split', wins: { 4: 0 }, hcps: [0, 0, 0, 0, 1] });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.equal(net[players[0].id], 15 - 3);
        [1, 2, 3, 4].forEach(i => assert.equal(net[players[i].id], -3, players[i].name + ' pays the gross stake only'));
        assert.equal(sum(Object.values(net)), 0);
        assertIntegers(Object.values(net), 'every net');
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.deepEqual(holes(L.gross), [4]); assert.deepEqual(values(L.gross), [15]);
        assert.deepEqual(J(L.net.lines), []);
        assert.equal(L.net.pot, 10, 'the unwon half is still stated');
    });

    test('an EVEN buy-in splits as today ($10 -> $5/$5; 3 golfers -> 15 / 15) and each half follows the rule', () => {
        const { data } = skinsRound({ n: 3, buyIn: 10, mode: 'split', wins: { 1: 0, 2: 1, 3: 2, 4: 0 } });
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.equal(L.gross.perGolfer, 5); assert.equal(L.net.perGolfer, 5);
        assert.equal(L.gross.pot, 15); assert.equal(L.net.pot, 15);
        assert.deepEqual(values(L.gross), [4, 4, 4, 3]);
        assert.deepEqual(values(L.net), [4, 4, 4, 3]);
    });

    // Every hole ties: nothing is won, nothing is paid, nobody is charged - the
    // existing refund path (settlement-engine.js P0 note). The NETS are unchanged
    // behaviour and pass today by definition; the row is bound to the new
    // ledger so it cannot pass before Step 3.
    test('0 skins won all round -> unchanged: every net 0, no lines, nothing paid', () => {
        const { data } = skinsRound({ n: 4, buyIn: 8, wins: {} });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
        assert.deepEqual(Object.values(net), [0, 0, 0, 0]);
        needLines();
        const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
        assert.equal(L.rule, 'odd-dollar');
        assert.deepEqual(J(L.gross.lines), []);
        assert.equal(L.gross.pot, 32, 'the pot is stated even when nobody won it');
    });
});

// ---------------------------------------------------------------------------
// THE STEP 1 FIXTURE, FLAGGED. Same roster, same scores, same $5 split buy-in
// as skins_golden_test.js; the only difference is the flag. $5 is odd, so
// under the corrected split (3.0) each golfer funds $3 gross / $2 net: pots
// $18 / $12, not the pot-level $15 / $15 the legacy golden halves to. Gross
// $18 over holes 2/5/9/14 -> 5/5/4/4; net $12 over five skins -> 3/3/2/2/2.
// Ann 5+4-5 = 4, Ben 5-5 = 0, Cal 4+2-5 = 1, Fay 3+3+2+2-5 = 5, Dee/Eli -5.
// ---------------------------------------------------------------------------
describe('THE GOLDEN ROSTER, FLAGGED', () => {
    const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'], [0, 4, 9, 13, 18, 22]);
    const SCORES = (() => {
        const s = {};
        PLAYERS.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = 5; }));
        s['p101_h2'] = 4; s['p102_h5'] = 4; s['p101_h9'] = 4; s['p103_h14'] = 3;
        return s;
    })();
    const round = (carry) => Object.assign({ players: PLAYERS, gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'split',
        courseData: CD, scores: SCORES, settlementMode: 'whole-dollar', skinsCarryOver: carry }, FLAG);

    test('NO CARRY: $3/$2 each -> gross 5/5/4/4 on holes 2/5/9/14, net 3/3/2/2/2', () => {
        needLines();
        const L = ENG.computeSkinsPayoutLines(round(false), CD, SCORES);
        assert.equal(L.rule, 'odd-dollar');
        assert.equal(L.gross.perGolfer, 3); assert.equal(L.net.perGolfer, 2);
        assert.equal(L.gross.pot, 18); assert.equal(L.net.pot, 12);
        assert.deepEqual(holes(L.gross), [2, 5, 9, 14]);
        assert.deepEqual(values(L.gross), [5, 5, 4, 4]);
        assert.deepEqual(holes(L.net), [4, 6, 13, 14, 15]);
        assert.deepEqual(values(L.net), [3, 3, 2, 2, 2]);
        assert.equal(sum(values(L.gross)) + sum(values(L.net)), 30);
    });

    test('NO CARRY: Ann 4, Ben 0, Cal 1, Fay 5 (today: 2, -1, 2, 7) - every net whole, summing to zero', () => {
        const net = J(ENG.computeSkinsSettlementNet(round(false), CD, SCORES));
        assert.deepEqual(net, { 101: 4, 102: 0, 103: 1, 104: -5, 105: -5, 106: 5 });
        assert.equal(sum(Object.values(net)), 0);
    });

    test('NO CARRY: the combined ledger shows the same whole dollars with NO rounding-repair line', () => {
        const c = ENG.computeCombinedNetTotals(round(false), CD, SCORES);
        // BEN IS ABSENT, NOT WRONG. His skins net is exactly $0 (won $5, paid
        // $5), and computeCombinedNetTotals' addAmount() has always skipped a
        // zero amount (settlement-engine.js `if (!player || !amount) return;`),
        // so a golfer at exactly zero has no ledger entry. Legacy fractions
        // made an exact zero rare; whole-dollar skins make it ordinary.
        // Pre-existing behaviour, pinned here so the consequence is visible;
        // reported in Step 3, not changed in it.
        assert.equal(J(ENG.computeSkinsSettlementNet(round(false), CD, SCORES))[102], 0, 'Ben nets exactly zero');
        assert.deepEqual(J(c.netByName), { ann: { name: 'Ann', net: 4 }, cal: { name: 'Cal', net: 1 },
            dee: { name: 'Dee', net: -5 }, eli: { name: 'Eli', net: -5 }, fay: { name: 'Fay', net: 5 } });
        const repairs = Object.values(J(c.contributions)).reduce((n, x) => n + x.lines.filter(l => l.rounding).length, 0);
        assert.equal(repairs, 0, 'nothing left for roundNetTotalsToWholeDollars to repair');
        assert.deepEqual(J(c.exact), J(c.netByName), 'exact and rounded agree to the dollar');
    });

    // The excluded path: flagged, but the round carries. The Step 1 carry
    // golden's numbers, byte for byte. The nets pass today by definition (the
    // flag does not exist yet); the ledger's rule field binds it to Step 3.
    test('CARRY: the flag is ignored - the Step 1 carry golden numbers, unchanged', () => {
        const data = round(true);
        assert.equal(ENG.skinsCarriesOver(data.skinsCarryOver), true);
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(data, CD, SCORES)),
            { 101: 0.9722222222222223, 102: -1.5277777777777781, 103: 0.9722222222222223,
              104: -4.027777777777778, 105: -4.027777777777778, 106: 7.638888888888889 });
        assert.deepEqual(J(ENG.computeCombinedNetTotals(data, CD, SCORES).netByName),
            { ann: { name: 'Ann', net: 1 }, ben: { name: 'Ben', net: -2 }, cal: { name: 'Cal', net: 1 },
              dee: { name: 'Dee', net: -4 }, eli: { name: 'Eli', net: -4 }, fay: { name: 'Fay', net: 8 } });
        needLines();
        assert.equal(ENG.computeSkinsPayoutLines(data, CD, SCORES).rule, 'legacy', 'a carry round is legacy even when flagged');
    });
});

// ---------------------------------------------------------------------------
// THE LEDGER AND THE NET ARE ONE THING. Whatever the per-skin lines say a
// golfer won must be exactly what the settlement pays them, before stakes.
// ---------------------------------------------------------------------------
describe('LEDGER == SETTLEMENT', () => {
    test('per-golfer line totals minus the stake equal computeSkinsSettlementNet, on every required row', () => {
        needLines();
        [{ n: 31, buyIn: 1, wins: { 1: 0, 7: 1, 12: 2 } }, { n: 4, buyIn: 8, wins: { 2: 0, 5: 1, 9: 0 } },
         { n: 4, buyIn: 8, wins: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } }, { n: 5, buyIn: 5, mode: 'split', wins: { 1: 0, 2: 1 }, hcps: [0, 0, 0, 0, 1] }]
        .forEach(spec => {
            const { data, players } = skinsRound(spec);
            const L = ENG.computeSkinsPayoutLines(data, CD, data.scores);
            const net = J(ENG.computeSkinsSettlementNet(data, CD, data.scores));
            const won = {};
            players.forEach(p => { won[p.id] = 0; });
            [].concat(J(L.gross.lines), J(L.net.lines)).forEach(l => { won[l.playerId] += l.value; });
            players.forEach(p => assert.equal(net[p.id], won[p.id] - spec.buyIn, `${p.name}: net must be lines - stake`));
            assert.equal(sum(Object.values(won)), spec.buyIn * spec.n, 'lines sum to the whole pot');
        });
    });
});

// ---------------------------------------------------------------------------
// 3.2 (a) ONE ROUND, ONE RULE. getRoundGames() builds every stacked game's
// config by Object.assign({}, data, defaults, instanceCfg), so a flagged
// round's skins INSTANCES carry the flag too. That is the intended behaviour
// - the flag describes how THIS ROUND settles skins, not one wager - and it
// is asserted here so it is a decision, not an inheritance nobody noticed.
// The instance is participant-scoped, which is the shape sidematches.html
// writes, so the rule is also shown to respect fieldParticipants().
// ---------------------------------------------------------------------------
describe('3.2a STACKED SKINS INSTANCES FOLLOW THE ROUND\'S RULE', () => {
    // Main format stroke (no money); one stacked skins instance among the
    // first four of five golfers at $8 = $32 gross, three skins: 11, 11, 10.
    const build = (flag) => {
        const { data, players } = skinsRound({ n: 5, buyIn: 0, wins: { 2: 0, 5: 1, 9: 0 }, flag });
        data.gameFormat = 'stroke';
        delete data.skinsBuyIn; delete data.skinsPotFormat; delete data.skinsCarryOver;
        data.additionalGameInstances = { inst1: { format: 'skins', enabled: true, skinsBuyIn: 8, skinsPotFormat: 'gross',
            skinsCarryOver: false, startHole: 1, participantIds: players.slice(0, 4).map(p => String(p.id)) } };
        return { data, players };
    };

    test('the instance config carries the flag and the gate says it applies', () => {
        const { data } = build(true);
        const games = ENG.getRoundGames(data);
        const inst = games.find(g => g.key === 'inst1');
        assert.ok(inst, 'the instance is a round game');
        assert.equal(inst.config.skinsRounding, 'odd-dollar');
        assert.equal(ENG.skinsOddDollarApplies(inst.config), true);
    });

    test('the instance settles by the rule: 11, 11, 10 across its four participants only', () => {
        const { data, players } = build(true);
        const inst = ENG.getRoundGames(data).find(g => g.key === 'inst1');
        const L = ENG.computeSkinsPayoutLines(inst.config, CD, data.scores);
        assert.equal(L.rule, 'odd-dollar');
        assert.deepEqual(values(L.gross), [11, 11, 10]);
        const net = J(ENG.computeGameNetByPlayerId(inst, CD, data.scores));
        assert.deepEqual(net, { [players[0].id]: 13, [players[1].id]: 3, [players[2].id]: -8, [players[3].id]: -8 });
        assert.equal(net[players[4].id], undefined, 'the fifth golfer is not in this wager');
        assert.equal(sum(Object.values(net)), 0);
    });

    test('the same instance on an UNFLAGGED round is legacy (fractions), so the rule is the round\'s, not the catalog\'s', () => {
        const { data, players } = build(false);
        const inst = ENG.getRoundGames(data).find(g => g.key === 'inst1');
        assert.equal(inst.config.skinsRounding, undefined);
        assert.equal(ENG.computeSkinsPayoutLines(inst.config, CD, data.scores).rule, 'legacy');
        const net = J(ENG.computeGameNetByPlayerId(inst, CD, data.scores));
        assert.equal(net[players[0].id], 13.333333333333332);
    });
});

// ---------------------------------------------------------------------------
// 3.2 (b) PARITY WITH THE MONEY POOL'S SKINS BUCKET. pool-engine.js (not
// touched) already allocates a whole-dollar round's skins bucket in whole
// dollars with the extra dollars on the earliest holes (allocateWholeDollars,
// largest remainder, ties by position). For equal skins that is the same rule
// as this wave's. On identical golfers, scores and pot the two paths must
// produce the same per-skin dollars, hole for hole.
// ---------------------------------------------------------------------------
describe('3.2b THE POOL BUCKET AND THE STANDALONE PATH AGREE', () => {
    const CASES = [
        { n: 31, buyIn: 1, wins: { 1: 0, 7: 1, 12: 2 } },
        { n: 4, buyIn: 8, wins: { 2: 0, 5: 1, 9: 0 } },
        { n: 4, buyIn: 8, wins: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } },
        { n: 4, buyIn: 8, wins: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } },
        { n: 3, buyIn: 10, wins: { 3: 0, 8: 1, 16: 2 } }
    ];
    CASES.forEach(spec => {
        test(`$${spec.buyIn * spec.n} over ${Object.keys(spec.wins).length} skins: same dollars on the same holes`, () => {
            const { data } = skinsRound(spec);
            const standalone = ENG.computeSkinsPayoutLines(data, CD, data.scores);
            // The pool round: no skins wager of its own; the whole pool is the
            // skins bucket ('remainder' with no KP and no net finish).
            const poolRound = Object.assign({}, data, { gameFormat: 'stroke', skinsRounding: undefined,
                moneyPool: { enabled: true, buyIn: spec.buyIn, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } });
            delete poolRound.skinsRounding;
            const pool = ENG.computeMoneyPool(poolRound, CD, data.scores);
            assert.ok(pool && pool.valid, 'the pool validates: ' + JSON.stringify(pool && pool.errors));
            assert.equal(pool.skins.amountCents, spec.buyIn * spec.n * 100);
            const poolLines = J(pool.skins.lines.map(l => [l.hole, l.cents / 100]));
            const ourLines = J(standalone.gross.lines.map(l => [l.hole, l.value]));
            assert.deepEqual(ourLines, poolLines);
            assert.equal(sum(ourLines.map(x => x[1])), spec.buyIn * spec.n);
        });
    });
});

// ---------------------------------------------------------------------------
// 3.2 (c), the flagged side. skins_golden_test.js freezes the same round
// unflagged: three equal +2.667 nets round to 3/3/3/-8 = +1, and
// roundNetTotalsToWholeDollars takes the dollar back from ANN, by name. Under
// the rule the short skin is CAL's, by hole order, and the repair has nothing
// to do. Two different golfers end on $2 - measured here, not assumed.
// ---------------------------------------------------------------------------
describe('3.2c THE TIE-BREAK ROUND, FLAGGED: hole order, not name order, and no repair', () => {
    const P4 = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0]);
    const S4 = (() => {
        const s = {};
        P4.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = 5; }));
        s['p101_h3'] = 4; s['p102_h7'] = 4; s['p103_h11'] = 4;
        return s;
    })();
    const tie = () => Object.assign({ players: P4, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false,
                                      courseData: CD, scores: S4, settlementMode: 'whole-dollar' }, FLAG);

    test('Ann 3 (hole 3), Ben 3 (hole 7), Cal 2 (hole 11): the short skin is the highest hole\'s', () => {
        const L = ENG.computeSkinsPayoutLines(tie(), CD, S4);
        assert.deepEqual(J(L.gross.lines.map(l => [l.hole, l.playerName, l.value])), [[3, 'Ann', 11], [7, 'Ben', 11], [11, 'Cal', 10]]);
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(tie(), CD, S4)), { 101: 3, 102: 3, 103: 2, 104: -8 });
    });

    test('the combined ledger carries no rounding line; exact equals rounded; Who Pays Who follows', () => {
        const c = ENG.computeCombinedNetTotals(tie(), CD, S4);
        assert.deepEqual(J(c.netByName), { ann: { name: 'Ann', net: 3 }, ben: { name: 'Ben', net: 3 }, cal: { name: 'Cal', net: 2 }, dee: { name: 'Dee', net: -8 } });
        assert.deepEqual(J(c.exact), J(c.netByName));
        const repairs = Object.values(J(c.contributions)).reduce((n, x) => n + x.lines.filter(l => l.rounding).length, 0);
        assert.equal(repairs, 0);
        assert.deepEqual(J(c.transactions), [{ from: 'Dee', to: 'Ann', amount: 3 }, { from: 'Dee', to: 'Ben', amount: 3 }, { from: 'Dee', to: 'Cal', amount: 2 }]);
    });
});
