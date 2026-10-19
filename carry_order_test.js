// ============================================================================
// URGENT-011 - SKINS CARRY RUNS IN THE ORDER THE HOLES WERE PLAYED
//
// *** THIS FILE IS EXPECTED TO FAIL ON BRANCH gps-carry-order UNTIL MANNY TYPES
// *** "OK carry-order fix". It pins the CORRECT behaviour ahead of an engine
// *** change that has NOT been made (CLAUDE.md: never touch money engines without
// *** Manny's OK). It must not be merged into gps-next red.
// *** Plan: ~/Desktop/claude-code-reports/sims/2026-10-19/CARRY-ORDER-PLAN.md
//
// THE BUG. With carry-over on, a tied hole's skin rides to "the next hole". The
// engines walk courseData 1..18 by NUMBER, so on a round off the 10th tee the
// 18th's carry goes to nothing (pending, refunded) and the 9th's carry goes to the
// 10th - the first hole anybody played. The order played is 10..18 then 1..9.
//   - Weekly Game skins bucket: pool-engine.js computeMoneyPool -> allocateSlice
//   - stacked / main-game Skins:  settlement-engine.js computeSkinsSettlementNet,
//     legacy branch (carry rounds never take the odd-dollar branch)
//   - the Skins hole ledger:      settlement-engine.js computeSkinsHoleLedger
// computeSkinsPayoutLines (the odd-dollar ledger) already walks play order
// (2026-10-04, tee_start_test.js section 5), so on a 10th-tee carry round the
// lines and the money disagree today.
//
// ONE CARD FOR EVERY SECTION. Three golfers, scratch, par 4 everywhere, everybody
// makes 4 on every hole except:
//     Ann 3 on hole 10      Ben 3 on hole 1      Cal 3 on hole 9
//
//   OFF THE 10th (played 10,11..18,1,2..9)            OFF THE 1st (1..18)
//     10   Ann wins, nothing carried   1 unit           1   Ben  1 unit
//     11-18 eight ties carry                            2-8 seven ties carry
//     1    Ben wins 8 + 1             9 units           9   Cal  7 + 1 = 8 units
//     2-8  seven ties carry                             10  Ann  1 unit
//     9    Cal wins 7 + 1             8 units           11-18 eight ties: 8 PENDING
//     pending 0, units 18                               units 1+8+1+8 = 18
//
// D1 - TWO-TEE START (groupStartingHoles). A skins pot is FIELD-WIDE: one hole's
// skin is decided by every group's score on it, so there is ONE carry chain per
// pot and it cannot follow two tees at once. The chain follows the ROUND's tee
// (startingHole); groupStartingHoles never re-orders a pot. That makes a two-tee
// round whose round tee is the 1st settle exactly as today. (Decision flagged in
// the plan; Manny can overrule before the OK.)
// ============================================================================
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const ENGINE_FILES = ['handicap.js', 'play-order.js', 'action-model.js', 'money-engine.js',
                      'settlement-engine.js', 'pool-engine.js'];

// The engines are READ, loaded into a sandbox and called. Nothing is modified.
function loadEngines() {
    const ctx = vm.createContext({ console });
    ENGINE_FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
    const get = (name) => vm.runInContext(name, ctx);
    return {
        computeMoneyPool: get('computeMoneyPool'),
        computeMoneyPoolNetByPlayerId: get('computeMoneyPoolNetByPlayerId'),
        computeCombinedNetTotals: get('computeCombinedNetTotals'),
        computeSkinsSettlementNet: get('computeSkinsSettlementNet'),
        computeSkinsHoleLedger: get('computeSkinsHoleLedger'),
        computeSkinsPayoutLines: get('computeSkinsPayoutLines'),
    };
}
const E = loadEngines();

const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [
    { id: 1, name: 'Ann', hcp: '0', playingForMoney: true },
    { id: 2, name: 'Ben', hcp: '0', playingForMoney: true },
    { id: 3, name: 'Cal', hcp: '0', playingForMoney: true },
];
function card(overrides) {
    const s = {};
    PLAYERS.forEach(p => CD.forEach(h => { s['p' + p.id + '_h' + h.hole] = 4; }));
    Object.assign(s, overrides);
    return s;
}
const THE_CARD = card({ p1_h10: 3, p2_h1: 3, p3_h9: 3 });
const clone = (o) => JSON.parse(JSON.stringify(o));
const byName = (netById) => ({ Ann: netById['1'], Ben: netById['2'], Cal: netById['3'] });

// ---- the Weekly Game: $36 x 3 = $108, no KP, no net prize -> a $108 skins bucket.
// Whole-dollar round. 18 units in every case below, so a unit is exactly $6.
function weeklyRound(tee, extra) {
    const d = {
        players: clone(PLAYERS), courseData: CD, scores: THE_CARD,
        settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar', gameFormat: 'stroke',
        moneyPool: { enabled: true, buyIn: 36, skins: { mode: 'remainder', scoring: 'gross', carryOver: true } },
    };
    if (tee !== undefined) d.startingHole = tee;
    return Object.assign(d, extra || {});
}
const weeklyNet = (d) => byName(E.computeMoneyPoolNetByPlayerId(d, d.courseData, d.scores));
// (cloned through JSON: the sandbox's arrays are another realm's, and deepStrictEqual checks prototypes)
const weeklyLines = (d) => clone(E.computeMoneyPool(d, d.courseData, d.scores).skins.lines
    .map(l => ({ hole: l.hole, who: l.winnerName, units: l.units, dollars: l.cents / 100 })));

// ---- stacked Skins: $18 a golfer, gross, carry -> $54 pot over 18 holes = $3 a unit.
function stackedRound(tee, gameExtra) {
    const d = {
        players: clone(PLAYERS), courseData: CD, scores: THE_CARD, gameFormat: 'stroke',
        additionalGames: { skins: Object.assign({ enabled: true, startHole: 1, skinsBuyIn: 18, skinsCarryOver: true,
                                                  skinsScoring: 'gross', skinsPotFormat: 'gross' }, gameExtra || {}) },
    };
    if (tee !== undefined) d.startingHole = tee;
    return d;
}
// The EXACT (pre whole-dollar) nets, for a pot whose unit is not a whole dollar:
// computeCombinedNetTotals' netByName is rounded to the dollar, its `exact` is not.
function stackedExact(d) {
    const nb = E.computeCombinedNetTotals(d, d.courseData, d.scores).exact;
    return { Ann: nb.ann.net, Ben: nb.ben.net, Cal: nb.cal.net };
}
function stackedNet(d) {
    const nb = E.computeCombinedNetTotals(d, d.courseData, d.scores).netByName;
    return { Ann: nb.ann.net, Ben: nb.ben.net, Cal: nb.cal.net };
}
const near = (got, want, msg) => Object.keys(want).forEach(k =>
    assert.ok(Math.abs(got[k] - want[k]) < 1e-9, (msg || '') + ' ' + k + ': got ' + got[k] + ', want ' + want[k]));

// ---------------------------------------------------------------------------
describe('1. CONTROL - a round off the 1st tee settles exactly as today', () => {
    // Off the 1st: Ben 1u ($6), Cal 8u ($48), Ann 1u ($6), 8 units pending = $48
    // refunded $16 each. Ann -36+6+16 = -14, Ben -36+6+16 = -14, Cal -36+48+16 = +28.
    const WANT = { Ann: -14, Ben: -14, Cal: 28 };

    test('Weekly Game, startingHole 1: Ann -14, Ben -14, Cal +28', () => {
        assert.deepEqual(weeklyNet(weeklyRound(1)), WANT);
    });
    test('Weekly Game, no startingHole at all (every round before 2026-10-04): identical', () => {
        assert.deepEqual(weeklyNet(weeklyRound(undefined)), WANT);
        assert.equal(JSON.stringify(E.computeMoneyPool(weeklyRound(undefined), CD, THE_CARD)),
                     JSON.stringify(E.computeMoneyPool(weeklyRound(1), CD, THE_CARD)));
    });
    test('Weekly Game lines off the 1st: h1 Ben 1u $6, h9 Cal 8u $48, h10 Ann 1u $6', () => {
        assert.deepEqual(weeklyLines(weeklyRound(1)), [
            { hole: 1, who: 'Ben', units: 1, dollars: 6 },
            { hole: 9, who: 'Cal', units: 8, dollars: 48 },
            { hole: 10, who: 'Ann', units: 1, dollars: 6 },
        ]);
    });
    // Stacked off the 1st: $3 a unit. Ben 1u $3, Cal 8u $24, Ann 1u $3, 8 pending
    // ($24) shared $8 each. Ann 3+8-18 = -7, Ben -7, Cal 24+8-18 = +14.
    test('stacked Skins, startingHole 1: Ann -7, Ben -7, Cal +14', () => {
        near(stackedNet(stackedRound(1)), { Ann: -7, Ben: -7, Cal: 14 });
        near(stackedNet(stackedRound(undefined)), { Ann: -7, Ben: -7, Cal: 14 });
    });
});

// ---------------------------------------------------------------------------
describe('2. OFF THE 10th TEE - the carry follows the order played  [RED UNTIL THE FIX]', () => {
    // Ann 1u $6, Ben 9u $54, Cal 8u $48, nothing pending, nothing refunded.
    // Ann -36+6 = -30, Ben -36+54 = +18, Cal -36+48 = +12. Sum 0.
    test('Weekly Game, startingHole 10: Ann -30, Ben +18, Cal +12', () => {
        assert.deepEqual(weeklyNet(weeklyRound(10)), { Ann: -30, Ben: 18, Cal: 12 });
    });
    test('Weekly Game lines stay listed by hole number: h1 Ben 9u $54, h9 Cal 8u $48, h10 Ann 1u $6', () => {
        const r = E.computeMoneyPool(weeklyRound(10), CD, THE_CARD);
        assert.deepEqual(weeklyLines(weeklyRound(10)), [
            { hole: 1, who: 'Ben', units: 9, dollars: 54 },
            { hole: 9, who: 'Cal', units: 8, dollars: 48 },
            { hole: 10, who: 'Ann', units: 1, dollars: 6 },
        ]);
        assert.equal(r.skins.pendingUnits, 0, 'the 9th is the LAST hole played - nothing is left pending');
    });
    // Stacked: Ann 1u $3, Ben 9u $27, Cal 8u $24. Ann -15, Ben +9, Cal +6.
    test('stacked Skins, startingHole 10: Ann -15, Ben +9, Cal +6', () => {
        near(stackedNet(stackedRound(10)), { Ann: -15, Ben: 9, Cal: 6 });
    });
    test('main-game Skins (computeSkinsSettlementNet on the round itself), startingHole 10: same money', () => {
        const d = { players: clone(PLAYERS), courseData: CD, scores: THE_CARD, startingHole: 10,
                    gameFormat: 'skins', skinsBuyIn: 18, skinsCarryOver: true, skinsPotFormat: 'gross' };
        near(byName(E.computeSkinsSettlementNet(d, CD, THE_CARD)), { Ann: -15, Ben: 9, Cal: 6 });
    });
    test('the Skins hole ledger agrees with the money: hole 1 is worth 9 units, the 10th 1', () => {
        const d = { players: clone(PLAYERS), startingHole: 10, skinsCarryOver: true, skinsPotFormat: 'gross' };
        const L = E.computeSkinsHoleLedger(d, CD, THE_CARD).gross;
        const u = {}; L.holes.filter(r => r.state === 'skin').forEach(r => { u[r.hole] = r.unitsWon; });
        assert.deepEqual(u, { 1: 9, 9: 8, 10: 1 });
        assert.equal(L.pendingUnits, 0);
        assert.deepEqual(clone(L.holes.map(r => r.hole)), CD.map(h => h.hole), 'rows stay listed 1..18');
    });
    test('the per-skin lines (already play order) and the money now tell the same story', () => {
        // computeSkinsPayoutLines walks play order today; the money must pay those units.
        const d = Object.assign(stackedRound(10).additionalGames.skins,
                                { players: clone(PLAYERS), startingHole: 10 });
        const lines = E.computeSkinsPayoutLines(d, CD, THE_CARD).gross.lines;
        const u = {}; lines.forEach(l => { u[l.playerName] = (u[l.playerName] || 0) + l.units; });
        assert.deepEqual(u, { Ann: 1, Ben: 9, Cal: 8 }, 'lines (green today)');
        const net = stackedNet(stackedRound(10));
        near(net, { Ann: u.Ann * 3 - 18, Ben: u.Ben * 3 - 18, Cal: u.Cal * 3 - 18 }, 'money pays the lines\' units');
    });
});

// ---------------------------------------------------------------------------
describe('3. TWO-TEE START (D1: one chain per pot, the ROUND\'s tee)  [RED UNTIL THE FIX where noted]', () => {
    test('round tee 1, group 2 off the 10th: the pot settles exactly as a 1st-tee round (unchanged today)', () => {
        const d = weeklyRound(1, { groupStartingHoles: { '1': 1, '2': 10 } });
        assert.deepEqual(weeklyNet(d), { Ann: -14, Ben: -14, Cal: 28 });
        near(stackedNet(Object.assign(stackedRound(1), { groupStartingHoles: { '1': 1, '2': 10 } })),
             { Ann: -7, Ben: -7, Cal: 14 });
    });
    test('round tee 10, group 2 off the 1st: the pot carries 10..18, 1..9  [RED]', () => {
        const d = weeklyRound(10, { groupStartingHoles: { '1': 10, '2': 1 } });
        assert.deepEqual(weeklyNet(d), { Ann: -30, Ben: 18, Cal: 12 });
        near(stackedNet(Object.assign(stackedRound(10), { groupStartingHoles: { '1': 10, '2': 1 } })),
             { Ann: -15, Ben: 9, Cal: 6 });
    });
});

// ---------------------------------------------------------------------------
describe('4. EDGES THE FIX MUST NOT MOVE', () => {
    // GUARD (green today, must stay green): the Weekly Game's odd dollar goes to the
    // earliest hole NUMBER. Off the 10th: holes 10..17 tie, Ann wins 18 (9u); 1..8
    // tie, Ben wins 9 (9u). $5 x 3 = $15 over 18 units = $7.50 each skin: the extra
    // dollar goes to hole 9 (Ben) by number, not to hole 18 (played first).
    // Ann -5+7 = +2, Ben -5+8 = +3, Cal -5.
    test('odd dollar still lands on the lowest hole NUMBER off the 10th (guard)', () => {
        const s = card({ p1_h18: 3, p2_h9: 3 });
        const d = Object.assign(weeklyRound(10), { scores: s });
        d.moneyPool = Object.assign({}, d.moneyPool, { buyIn: 5 });
        assert.deepEqual(byName(E.computeMoneyPoolNetByPlayerId(d, CD, s)), { Ann: 2, Ben: 3, Cal: -5 });
    });
    test('no-carry skins are order-free: off the 10th equals off the 1st (guard)', () => {
        const a = weeklyRound(10), b = weeklyRound(1);
        a.moneyPool.skins.carryOver = false; b.moneyPool.skins.carryOver = false;
        assert.deepEqual(weeklyNet(a), weeklyNet(b));
    });
    // A stacked game bought on hole 5 of a 10th-tee round covers the holes still to
    // PLAY from 5: 5..9 only (2026-10-19 Manny OK: gameHoles play order - 10..18 and
    // 1..4 were played before it existed; this test used to pin 5..18 played 10..18
    // then 5..9). 5 holes, $54 / 5 a unit: 5..8 tie, Cal wins 9 with the carry = 5u,
    // the whole pot. Ann's skin on 10 was before the game. Ann -18, Ben -18, Cal +36.
    test('a skins game added from hole 5 on a 10th-tee round covers 5..9 only', () => {
        near(stackedExact(stackedRound(10, { startHole: 5 })), { Ann: -18, Ben: -18, Cal: 36 });
        near(stackedNet(stackedRound(10, { startHole: 5 })), { Ann: -18, Ben: -18, Cal: 36 });
    });
});

// ---------------------------------------------------------------------------
describe('5. THE SIM ROUND - seed 64654480 (J9AGDH, 14 golfers, off the 10th, flights, carry)  [RED]', () => {
    // The round as the app saved it (carry_order_64654480.fixture.json). The expected
    // nets are the INDEPENDENT arithmetic of tools/sim/lib/recompute.js (copied from
    // gps-sims-gen; it loads no engine), pinned here as numbers. The same lib run in
    // NUMBER order reproduces today's engine to the dollar for all 14 golfers - the
    // only difference is the carry order. Marty: $100 today, $127 as played.
    const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'carry_order_64654480.fixture.json'), 'utf8'));
    const PLAYED = { Crone: 16, Marty: 127, Paul: -19, Matt: -10, Carl: -28, 'Matt Q': -17, Rico: -28,
                     Skeens: -25, Lee: -25, Tim: -24, Jim: 5, Glenn: -40, Bob: 4, Hank: 64 };
    const TODAY = { Crone: 18, Marty: 100, Paul: -17, Matt: -8, Carl: -26, 'Matt Q': -4, Rico: -26,
                    Skeens: -23, Lee: -23, Tim: -22, Jim: -4, Glenn: -37, Bob: 6, Hank: 66 };
    const named = (byId) => { const o = {}; FX.players.forEach(p => { o[p.name] = byId[String(p.id)]; }); return o; };
    const RC = require('./tools/sim/lib/recompute.js');

    test('the pinned numbers are the independent arithmetic (sanity: both orders, both zero-sum)', () => {
        assert.deepEqual(named(RC.weekly(FX, FX.scores).perPlayer), PLAYED);
        assert.deepEqual(named(RC.weekly(Object.assign({}, FX, { startingHole: 1 }), FX.scores).perPlayer), TODAY);
        assert.equal(Object.values(PLAYED).reduce((a, b) => a + b, 0), 0);
    });
    test('the same scores off the 1st tee settle exactly as the engine does today (control)', () => {
        const d = Object.assign({}, FX, { startingHole: 1 });
        assert.deepEqual(named(E.computeMoneyPoolNetByPlayerId(d, d.courseData, d.scores)), TODAY);
    });
    test('off the 10th the Weekly Game pays as played: Marty +127, Hank +64 ... Glenn -40  [RED]', () => {
        assert.deepEqual(named(E.computeMoneyPoolNetByPlayerId(FX, FX.courseData, FX.scores)), PLAYED);
    });
});
