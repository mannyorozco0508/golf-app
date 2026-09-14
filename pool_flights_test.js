// ============================================================================
// MAIN POOL SKINS PER FLIGHT
//
// THE RULE. Flights on AND the round's skins scope 'flight': the Main Pool's
// SKINS BUCKET splits into two pots by headcount - each flight's pot is its
// share of the bucket by golfers, whole dollars, the remainder to A - and each
// pot is resolved and allocated on its own in hole order, exactly as a
// per-flight wager is. KP and Net Finish stay field-wide. Flights off, or
// scope 'field': byte-identical to today (pool_flights_golden_test.js). An
// empty flight is a pot of zero that pays nobody; the other flight takes the
// whole bucket.
//
// THE ARITHMETIC THE PASTE NAMED: 23 golfers, 12 A / 11 B, a $720 bucket.
//   720 x 12 / 23 = 375.65..   720 x 11 / 23 = 344.34..
//   B = floor(344.34) = $344;  A = 720 - 344 = $376.  A + B = 720.
// (The rule is "remainder to A", not "largest fraction": with 11 A / 12 B the
// same $720 is A $345, B $375 - the allocator's largest-fraction rule would
// have given B $376. Asserted below.)
//
// The round is built from helpers/wizard-saved-round.js; the pool engine is
// the real one (pool-engine.js), and every per-flight winner is held against
// the canonical skins resolver run on that flight's golfers alone.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const pool = (data) => { ENG.__d = J(data); return J(vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG)); };
const resolve = (players, data) => { ENG.__p = J(players); ENG.__d = J(data); return J(vm.runInContext("computeSkinsVoidForSettle(__p, __d.courseData, __d.scores, 'gross')", ENG)); };

// $720 bucket: 23 x $40 = $920, KP $0, net $200 -> skins remainder $720.
function round(opts) {
    const o = opts || {};
    const r = wizardSavedRound({ code: 'PFT', courseData: CD, thru: 18, golfers: o.golfers || 23,
        overrides: Object.assign({ additionalGames: {},
            moneyPool: { enabled: true, buyIn: 40, kp: { amount: 0, holes: [] }, net: { amount: 200, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } },
            flights: { enabled: true, scopes: { skins: o.scope || 'flight', birdies: 'field' } } }, o.overrides || {}) });
    if (o.flights === false) delete r.flights;
    if (o.tags) r.players.forEach((p, i) => { p.flight = o.tags[i]; });
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    (o.birdies || DEFAULT_BIRDIES).forEach(([name, hole]) => { if (byName[name] !== undefined) r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; });
    return r;
}
// A: Ann Alpha .. Lee Lima (12); B: Max Mike .. Wes Whiskey (11).
const DEFAULT_BIRDIES = [['Ann Alpha', 1], ['Ben Bravo', 2], ['Max Mike', 2], ['Cal Charlie', 5], ['Ned November', 7], ['Dee Delta', 9],
    ['Oli Oscar', 11], ['Eli Echo', 13], ['Pat Papa', 13], ['Quy Quebec', 16]];
const A = (r) => r.players.filter(p => p.flight === 'A'), B = (r) => r.players.filter(p => p.flight === 'B');
const sumLines = (lines) => lines.reduce((a, l) => a + l.cents, 0);

describe('THE SPLIT: 23 golfers, 12 A / 11 B, a $720 bucket', () => {
    const r = round(); const p = pool(r);
    test('the bucket is $720 and it splits A $376, B $344', () => {
        assert.equal(p.skins.amountCents, 72000);
        assert.ok(p.skins.flights, 'the bucket carries a per-flight view');
        assert.deepEqual(p.skins.flights.map(f => [f.flight, f.golfers, f.amountCents]), [['A', 12, 37600], ['B', 11, 34400]]);
        assert.equal(37600 + 34400, 72000);
    });
    test('the arithmetic: floor(720 x 11 / 23) = 344 to B, the rest to A', () => {
        assert.equal(Math.floor(720 * 11 / 23), 344); assert.equal(720 - 344, 376);
    });
    test('each flight\'s winners are exactly what that flight\'s golfers won against each other - holes 2 and 13 pay in BOTH flights', () => {
        const wantA = resolve(A(r), r).skins.map(s => [s.hole, String(s.player.id)]);
        const wantB = resolve(B(r), r).skins.map(s => [s.hole, String(s.player.id)]);
        assert.deepEqual(p.skins.flights[0].lines.map(l => [l.hole, l.winnerId]), wantA);
        assert.deepEqual(p.skins.flights[1].lines.map(l => [l.hole, l.winnerId]), wantB);
        assert.deepEqual(wantA.map(x => x[0]), [1, 2, 5, 9, 13]);
        assert.deepEqual(wantB.map(x => x[0]), [2, 7, 11, 13, 16]);
    });
    test('each pot is allocated on its own in hole order, whole dollars, and pays out exactly: A $376 over 5 skins, B $344 over 5', () => {
        const a = p.skins.flights[0], b = p.skins.flights[1];
        assert.equal(sumLines(a.lines) + a.unwonCents, 37600); assert.equal(sumLines(b.lines) + b.unwonCents, 34400);
        assert.deepEqual(a.lines.map(l => l.cents), [7600, 7500, 7500, 7500, 7500]);
        assert.deepEqual(b.lines.map(l => l.cents), [6900, 6900, 6900, 6900, 6800]);
        a.lines.concat(b.lines).forEach(l => assert.equal(l.cents % 100, 0));
    });
    test('the flat view is both flights\' lines with their flight, in A-then-B order; totals sum to the bucket; nothing refunded', () => {
        assert.equal(p.skins.lines.length, 10);
        assert.deepEqual(p.skins.lines.map(l => l.flight), ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B']);
        assert.equal(sumLines(p.skins.lines) + p.skins.unwonCents, 72000);
        assert.equal(p.refund.cents, 0);
    });
    test('KP and Net Finish are untouched by the split: net $200 paid field-wide, no per-flight view on them', () => {
        assert.equal(p.net.amountCents, 20000); assert.ok(!p.net.flights); assert.equal(p.kp, null);
        // The field's best net golfer takes the net prize whichever flight they are in.
        assert.equal(p.net.lines.length, 1);
    });
    test('the invariant, per flight and overall: buy-ins == prizes + refunds, to the cent', () => {
        const total = Object.values(p.perPlayerCents).reduce((a, c) => a + c, 0);
        assert.equal(total, 0, 'zero-sum: ' + total);
        assert.equal(sumLines(p.skins.flights[0].lines) + p.skins.flights[0].unwonCents + sumLines(p.skins.flights[1].lines) + p.skins.flights[1].unwonCents, p.skins.amountCents);
    });
});

describe('THE REMAINDER GOES TO A, not to the larger fraction', () => {
    test('11 A / 12 B on the same $720: A $345, B $375', () => {
        const tags = Array.from({ length: 23 }, (_, i) => (i < 11 ? 'A' : 'B'));
        const p = pool(round({ tags }));
        assert.deepEqual(p.skins.flights.map(f => [f.flight, f.golfers, f.amountCents]), [['A', 11, 34500], ['B', 12, 37500]]);
    });
    test('an even split has no remainder: 11 A / 11 B on a $640 bucket is $320 each', () => {
        // 22 golfers x $40 = $880, net $240 -> bucket $640.
        const p = pool(round({ golfers: 22, tags: Array.from({ length: 22 }, (_, i) => (i < 11 ? 'A' : 'B')), overrides: { moneyPool: { enabled: true, buyIn: 40, kp: { amount: 0, holes: [] }, net: { amount: 240, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } } }));
        assert.equal(p.skins.amountCents, 64000);
        assert.deepEqual(p.skins.flights.map(f => [f.golfers, f.amountCents]), [[11, 32000], [11, 32000]]);
    });
});

describe('EDGES', () => {
    test('an EMPTY flight: B has nobody, pot $0, pays nobody; A takes the whole $720 and its own ties across the field are now skins', () => {
        const p = pool(round({ tags: Array.from({ length: 23 }, () => 'A') }));
        assert.deepEqual(p.skins.flights.map(f => [f.flight, f.golfers, f.amountCents, f.lines.length]), [['A', 23, 72000, 6], ['B', 0, 0, 0]]);
        assert.equal(sumLines(p.skins.lines) + p.skins.unwonCents, 72000);
        assert.equal(p.skins.flights[1].unwonCents, 0, 'nothing to refund from an empty pot');
    });
    test('a flight of ONE: B is Wes alone - every hole he posts is his skin, his pot is floor(720/23) = $31', () => {
        const tags = Array.from({ length: 23 }, (_, i) => (i < 22 ? 'A' : 'B'));
        const p = pool(round({ tags }));
        const b = p.skins.flights[1];
        assert.equal(b.golfers, 1); assert.equal(b.amountCents, 3100); assert.equal(p.skins.flights[0].amountCents, 68900);
        assert.equal(b.lines.length, 18, 'a lone golfer wins every hole he posts');
        assert.equal(sumLines(b.lines) + b.unwonCents, 3100);
        assert.ok(b.lines.every(l => l.winnerName === 'Wes Whiskey'));
    });
    test('scope FIELD on a flighted round: one pot, no per-flight view, the field-wide ties pay nobody (the golden\'s lines)', () => {
        const p = pool(round({ scope: 'field' }));
        assert.ok(!p.skins.flights, 'no flights key');
        assert.ok(p.skins.lines.every(l => l.flight === undefined));
        assert.deepEqual(p.skins.lines.map(l => l.hole), [1, 5, 7, 9, 11, 16]);
    });
    test('flights OFF: identical to scope field, no flights key', () => {
        const a = pool(round({ scope: 'field' })), b = pool(round({ flights: false }));
        assert.deepEqual(a.skins, b.skins);
    });
    test('an unwon carry inside one flight refunds from that flight\'s pot only, and the totals still hold', () => {
        // Carry on. A's last skin is hole 13, so A's holes 14-18 tie and carry into
        // the end unwon; B gets a birdie on 18 (Wes) so B's chain resolves.
        const r = round({ birdies: DEFAULT_BIRDIES.concat([['Wes Whiskey', 18]]), overrides: { moneyPool: { enabled: true, buyIn: 40, kp: { amount: 0, holes: [] }, net: { amount: 200, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: true } } } });
        const p = pool(r);
        const a = p.skins.flights[0], b = p.skins.flights[1];
        assert.equal(a.pendingUnits > 0, true, 'A carries into the end');
        assert.ok(a.unwonCents > 0, 'A refunds its unwon carry');
        assert.equal(b.pendingUnits, 0); assert.equal(b.unwonCents, 0, 'B refunds nothing');
        assert.equal(sumLines(a.lines) + a.unwonCents, a.amountCents); assert.equal(sumLines(b.lines) + b.unwonCents, b.amountCents);
        assert.equal(p.skins.unwonCents, a.unwonCents + b.unwonCents);
        assert.equal(p.refund.cents, p.skins.unwonCents);
        assert.equal(Object.values(p.perPlayerCents).reduce((x, c) => x + c, 0), 0);
    });
    test('a legacy cents round (no settlementMode) splits in cents, remainder cent to A, and still balances', () => {
        const r = round(); delete r.settlementMode; delete r.skinsRounding;
        r.moneyPool.buyIn = 40.15;   // 23 x 40.15 = 923.45; net 200 -> bucket 723.45
        const p = pool(r);
        assert.equal(p.skins.amountCents, 72345);
        assert.deepEqual(p.skins.flights.map(f => f.amountCents), [72345 - Math.floor(72345 * 11 / 23), Math.floor(72345 * 11 / 23)]);
        assert.equal(p.skins.flights[0].amountCents + p.skins.flights[1].amountCents, 72345);
        assert.equal(Object.values(p.perPlayerCents).reduce((x, c) => x + c, 0), 0);
    });
});

describe('THE SEAM (source)', () => {
    test('pool-engine splits only the skins bucket, only under the resolver\'s scope, remainder to A; KP and net never see a flight', () => {
        const src = read('pool-engine.js');
        const skins = src.slice(src.indexOf('// ---- SKINS ----'), src.indexOf('// ---- REFUNDS ----'));
        assert.match(skins, /flightScopeApplies\(data, 'skins'\)/);
        assert.match(skins, /potB = /); assert.match(skins, /amountCents - potB/, 'A is the bucket minus B\'s floor');
        const kp = src.slice(src.indexOf('// ---- KP ----'), src.indexOf('// ---- SKINS ----'));
        assert.ok(!/flight/i.test(kp), 'KP and net know nothing of flights');
    });
});
