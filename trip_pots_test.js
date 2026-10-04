// ============================================================================
// THE TRIP POT AND THE DAILY POT (2026-10-04) - STRICT: this is trip money.
//
// Two optional pots, both OFF until an organizer switches them on:
//
//   THE TRIP POT is the points race played for money. Every golfer in the trip
//   pays one buy-in, the pot is the buy-in times the field, and it is paid out
//   to the finishing order. It is the only money in this app that belongs to the
//   TRIP rather than to a round.
//
//   THE DAILY POT is not new money: it is the round's own Weekly Game
//   (data.moneyPool) set once on the trip and copied into every round that has
//   NOT been played. Same engine, same validator, same ledger.
//
// WHAT COSTS MONEY IF IT IS WRONG, and is therefore guarded here:
//
//   1. THE POT MUST BALANCE TO ZERO. Buy-ins in, prizes out, to the cent - or
//      the pot is not applied at all and says why. A half-applied pot is money
//      appearing from nowhere, and there is no third destination for a dollar.
//   2. A ROUND THAT HAS BEEN PLAYED IS NEVER REWRITTEN. The daily pot writes
//      only rounds with no scores: a played round's Weekly Game is part of a
//      settled money position.
//   3. WITH BOTH OFF, THE TRIP SETTLES EXACTLY AS IT DID. Asserted against a
//      golden captured from the page BEFORE this feature existed - the money
//      card, the points race, the leaderboard and the prize calculator, byte for
//      byte (helpers/trip-money-no-pots.golden.json).
//   4. THE PLACE AND TIE RULE IS payouts.js, injected, never reimplemented: a
//      tie straddling the last paid place is the case a second copy gets wrong.
//   5. THE ENGINES ARE UNTOUCHED, by sha.
//
// AND THE POINTS SCALE CHANGED, deliberately: 1st is worth the WHOLE TRIP's
// field size (24 in a 24-man trip), not the number who posted that day. A thin
// Thursday used to be worth less than a full Monday for the same finish, which
// is not a race. Nothing about money depended on the old scale - no money was
// ever attached to these points before this wave - and the re-capture of
// trip_identity_prev.fixture.json proves it: money, board and awards came back
// byte-identical, only the points moved.
//
// BASELINE, AND WHAT IT IS WORTH. Against 023f027 the module this file tests did
// not exist: the require throws at load and node reports the FILE as one failing
// test, which is red and proves nothing per assertion. Measured the useful way -
// this wave's trip-pots.js present, trip.html at HEAD - over the FINISHED file:
// all 20 tests: 18 PASS / 2 FAIL.
//
//   AND THE 18 ARE NOT EVIDENCE OF ANYTHING ABOUT THE OLD BUILD. They exercise a
//   file the old build did not have; they are a standing guard, not a red. TWO
//   are genuine and both are page wiring - the points scale with its gross
//   switch, and the pot reaching the money card. The byte-identical control
//   passes on both builds BY DESIGN: it is HEAD's own output, and a control that
//   went red against the build it was captured from would be measuring nothing.
//
//   THE CONTROLS, run against the finished wave (restored by sha from saved
//   copies, never with git restore):
//     1. let an unbalanced pot through    -> "OVER OR UNDER THE POT IS REFUSED" fired
//     2. write the daily pot into played rounds -> "ONLY the rounds with no scores" fired
//     3. delete the zero-sum backstop     -> "A PAID PLACE NOT IN THE FIELD" fired
//     4. force a pot on with none configured -> the byte-identical control fired
//     5. put the points back on the day's field -> the identity goldens fired
//   A SIXTH WAS INERT and is reported as such: forcing the apply branch while the
//   pot is OFF changes nothing, because a refused pot carries no entries - the
//   list is the guard, and there was nothing to catch.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const T = require('./trip-pots.js');
const R = require('./trip-roster.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha12 = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 12);
const TRIP = read('trip.html');

// payouts.js and pool-engine.js are browser files with no module.exports: the
// real ones, in a realm, so every rule below is the app's own and not a copy.
const ctx = { console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
              parseInt, parseFloat, Date, isFinite, Set };
vm.createContext(ctx);
['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'settlement-engine.js', 'pool-engine.js', 'payouts.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const allocate = ctx.allocatePlacePayouts;

const cfgOf = (o) => T.tripPotConfig({ tripPot: o });
const field = (n) => Array.from({ length: n }, (_, i) => ({ key: 'g' + i, name: 'Golfer ' + (i + 1) }));
const standingsFor = (f) => f.map((p, i) => ({ key: p.key, name: p.name, rank: i + 1, points: f.length - i }));
const sumNet = (entries) => entries.reduce((a, e) => a + e.netCents, 0);

// ===========================================================================
describe('1. THE TRIP POT BALANCES TO ZERO, OR IT IS NOT APPLIED', () => {

    test('24 golfers at $50, paid 600/360/240: every cent in has a cent out', () => {
        const cfg = cfgOf({ on: true, buyIn: 50, places: [600, 360, 240] });
        const f = field(24);
        const led = T.tripPotLedger(cfg, f, standingsFor(f), allocate);
        assert.equal(led.applied, true, led.reason);
        assert.equal(led.potCents, 120000);
        assert.equal(led.paidCents, 120000);
        assert.equal(sumNet(led.entries), 0, 'the pot does not balance to zero');
        assert.equal(led.entries.length, 24, 'everybody in the trip pays');
        const byName = {};
        led.entries.forEach((e) => { byName[e.name] = e.netCents; });
        assert.equal(byName['Golfer 1'], 55000, 'the winner is up his prize less his buy-in');
        assert.equal(byName['Golfer 2'], 31000);
        assert.equal(byName['Golfer 3'], 19000);
        assert.equal(byName['Golfer 4'], -5000, 'everyone else is down the buy-in');
    });

    test('OVER OR UNDER THE POT IS REFUSED, and says which', () => {
        const over = T.tripPotLedger(cfgOf({ on: true, buyIn: 50, places: [700, 360, 240] }),
            field(24), standingsFor(field(24)), allocate);
        assert.equal(over.applied, false);
        assert.match(over.reason, /more than the pot/);
        assert.deepEqual(over.entries, [], 'a refused pot must move no money at all');
        const under = T.tripPotLedger(cfgOf({ on: true, buyIn: 50, places: [600, 360] }),
            field(24), standingsFor(field(24)), allocate);
        assert.equal(under.applied, false);
        assert.match(under.reason, /less than the pot/);
        assert.deepEqual(under.entries, []);
    });

    test('off, no buy-in, or fewer than two golfers: nothing happens', () => {
        const f = field(24), s = standingsFor(f);
        assert.equal(T.tripPotLedger(cfgOf({ on: false, buyIn: 50, places: [1200] }), f, s, allocate).applied, false);
        assert.equal(T.tripPotLedger(cfgOf({ on: true, buyIn: 0, places: [] }), f, s, allocate).applied, false);
        assert.equal(T.tripPotLedger(cfgOf({ on: true, buyIn: 50, places: [50] }), field(1), standingsFor(field(1)), allocate).applied, false);
    });

    test('A PAID PLACE THAT IS NOT IN THE FIELD STOPS THE WHOLE POT', () => {
        // THE BACKSTOP, exercised rather than assumed: the man in first place is
        // not one of the payers. Paying him would put $200 into the trip that
        // nobody put in, so nothing is applied at all and the reason says so.
        const f = field(4);
        const ghostFirst = [{ key: 'ghost', name: 'Nobody', rank: 1, points: 99 }]
            .concat(f.map((p, i) => ({ key: p.key, name: p.name, rank: i + 2, points: 4 - i })));
        const led = T.tripPotLedger(cfgOf({ on: true, buyIn: 50, places: [200] }), f, ghostFirst, allocate);
        assert.equal(led.applied, false, 'a prize left the pot for somebody who never paid in');
        assert.deepEqual(led.entries, []);
        assert.match(led.reason, /does not balance/);
    });

    test('A PRIZE FOR SOMEBODY NOT IN THE FIELD CANNOT GO OUT', () => {
        // The zero-sum check is the backstop, and this is the case it exists for:
        // a standing that is not in the paying field would otherwise take money
        // nobody put in.
        const f = field(4);
        const ghost = standingsFor(f).concat([{ key: 'ghost', name: 'Nobody', rank: 5, points: 0 }]);
        const led = T.tripPotLedger(cfgOf({ on: true, buyIn: 50, places: [200] }), f, ghost, allocate);
        assert.equal(led.applied, true, 'the ghost takes nothing, so the pot still balances');
        assert.equal(sumNet(led.entries), 0);
        assert.ok(!led.entries.some((e) => e.name === 'Nobody'), 'somebody who did not pay is in the ledger');
    });

    test('A TIE SPLITS THE PLACES IT OCCUPIES, through payouts.js, still summing to zero', () => {
        const f = field(10);
        const tied = f.map((p, i) => ({ key: p.key, name: p.name, rank: i === 1 ? 2 : (i === 2 ? 2 : i + 1), points: 10 - i }));
        const cfg = cfgOf({ on: true, buyIn: 20, places: [100, 60, 40] });
        const led = T.tripPotLedger(cfg, f, tied, allocate);
        assert.equal(led.applied, true, led.reason);
        assert.equal(sumNet(led.entries), 0);
        const byName = {};
        led.entries.forEach((e) => { byName[e.name] = e.prizeCents; });
        assert.equal(byName['Golfer 2'], 5000, 'second and third money split between the tied pair');
        assert.equal(byName['Golfer 3'], 5000);
        assert.equal(byName['Golfer 1'], 10000);
    });

    test('the balance line is countable before anything is saved', () => {
        const cfg = cfgOf({ on: true, buyIn: 50, places: [600, 360, 240] });
        assert.deepEqual(T.tripPotBalance(cfg, 24),
            { potCents: 120000, paidCents: 120000, differenceCents: 0, balanced: true });
        assert.equal(T.tripPotBalance(cfg, 20).balanced, false, 'the pot moves with the field');
        assert.deepEqual(T.tripPotDefaultPlaces(cfgOf({ on: true, buyIn: 50 }), 24, 3), [400, 400, 400]);
        // The odd dollar goes to the earlier place rather than disappearing.
        assert.deepEqual(T.tripPotDefaultPlaces(cfgOf({ on: true, buyIn: 10 }), 7, 2), [35, 35]);
        assert.deepEqual(T.tripPotDefaultPlaces(cfgOf({ on: true, buyIn: 5 }), 5, 2), [13, 12]);
    });
});

// ===========================================================================
describe('2. POINTS ON THE TRIP FIELD, NOT THE DAY', () => {

    test('a 24-man trip pays 24 for a win, whoever showed up that day', () => {
        const full = Array.from({ length: 24 }, (_, i) => ({ key: 'g' + i, name: 'G' + i, score: 70 + i }));
        const award = T.tripPointsAward(full, 24);
        assert.equal(award[0].points, 24);
        assert.equal(award[1].points, 23);
        assert.equal(award[23].points, 1);
        // A thin Thursday: twenty post. The winner is still worth 24.
        const thin = full.slice(0, 20);
        const thinAward = T.tripPointsAward(thin, 24);
        assert.equal(thinAward[0].points, 24, 'a thin day paid less for the same finish before this');
        assert.equal(thinAward[19].points, 5);
    });

    test('ties split the places they occupy', () => {
        const ranked = [{ key: 'a', name: 'A', score: 70 }, { key: 'b', name: 'B', score: 72 },
                        { key: 'c', name: 'C', score: 72 }, { key: 'd', name: 'D', score: 75 }];
        assert.deepEqual(T.tripPointsAward(ranked, 24).map((p) => p.points), [24, 22.5, 22.5, 21]);
    });

    test('and a field smaller than the list cannot award negative points', () => {
        const ranked = Array.from({ length: 5 }, (_, i) => ({ key: 'g' + i, name: 'G' + i, score: 70 + i }));
        const award = T.tripPointsAward(ranked, 2);
        assert.deepEqual(award.map((p) => p.points), [5, 4, 3, 2, 1], 'the field is at least the list');
        assert.ok(award.every((p) => p.points > 0));
    });

    test('the page ranks by net or gross, and only counts a finished round', () => {
        const fn = TRIP.slice(TRIP.indexOf('function computeTripPointsRace'), TRIP.indexOf('function renderPointsRace'));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /tripPointsAward\(/, 'the page reimplements the points scale');
        assert.match(fn, /holesPlayed === totalHoles/, 'an unfinished round must not be ranked');
        assert.match(fn, /scoring === 'gross'/, 'there is no gross switch');
    });
});

// ===========================================================================
describe('3. THE DAILY POT IS THE ROUND\'S OWN WEEKLY GAME', () => {

    const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: (i === 3 || i === 13) ? 3 : 4, hcpIndex: i + 1 }));
    const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 101 + i, name: 'P' + i, hcp: '0', playingForMoney: true }));
    const rounds = () => [
        { code: 'AAA', label: 'Day 1', data: { players: players(4), courseData: cd18, scores: { p101_h1: 4 } } },
        { code: 'BBB', label: 'Day 2', data: { players: players(4), courseData: cd18, scores: {} } },
        { code: 'CCC', label: 'Day 3', data: { players: players(6), courseData: cd18, scores: {} } }
    ];
    const cfg = T.dailyPotConfig({ dailyPot: { on: true, buyIn: 20, kpPct: 25, netPct: 50 } });

    test('it writes ONLY the rounds with no scores, and names the ones it left', () => {
        const built = T.dailyPotUpdates(R.tripRosterPlan(rounds()), cfg, ctx.moneyPoolParticipants);
        assert.deepEqual(Object.keys(built.updates), ['events/BBB/moneyPool', 'events/CCC/moneyPool']);
        assert.deepEqual(built.changed, ['Day 2', 'Day 3']);
        assert.deepEqual(built.skipped, ['Day 1'], 'the played round must be named, not silently skipped');
    });

    test('what it writes is a POOL THE ENGINE ACCEPTS, at either headcount', () => {
        const built = T.dailyPotUpdates(R.tripRosterPlan(rounds()), cfg, ctx.moneyPoolParticipants);
        const four = { players: players(4), courseData: cd18, moneyPool: built.updates['events/BBB/moneyPool'] };
        const six = { players: players(6), courseData: cd18, moneyPool: built.updates['events/CCC/moneyPool'] };
        // THE REAL VALIDATOR, not a restatement of it. THIS IS THE CASE THAT FORCED
        // SHARES INSTEAD OF DOLLARS: a fixed "KP $40, Net $60" is $100 of buckets in
        // a four-man $80 pot, and the engine refuses the whole pool as over budget.
        // ERRORS COME FROM THE ENGINE'S REALM, so deepStrictEqual against a local
        // [] fails on identity alone - the cross-realm trap this repo has paid for
        // before. Counted, and printed when it is not empty.
        const fourErr = ctx.validateMoneyPool(four, cd18).errors;
        const sixErr = ctx.validateMoneyPool(six, cd18).errors;
        assert.equal(fourErr.length, 0, 'four-man round: ' + JSON.stringify(Array.from(fourErr)));
        assert.equal(sixErr.length, 0, 'six-man round: ' + JSON.stringify(Array.from(sixErr)));
        assert.equal(four.moneyPool.kp.amount + four.moneyPool.net.amount <= 80, true,
            'the buckets must fit the four-man pot');
        // AND THE REAL ENGINE OBEYS ITS OWN INVARIANT on what it writes:
        // prizes + refunds + KP still in the pot === the pot, which is the same
        // statement as the ledger summing to -kpUnresolvedCents.
        const pool = ctx.computeMoneyPool(six, cd18, {});
        const total = Object.values(pool.perPlayerCents).reduce((a, v) => a + v, 0);
        assert.equal(total + (pool.kpUnresolvedCents || 0), 0, 'the round pot does not balance');
    });

    test('skins takes the remainder, which is what makes one setting fit every round', () => {
        const pool = T.dailyPotForRound(cfg, cd18, 24);
        assert.equal(pool.skins.mode, 'remainder');
        assert.equal(pool.buyIn, 20);
        assert.equal(pool.kp.amount, 120, 'a quarter of a $480 pot');
        assert.deepEqual(T.dailyPotAmounts(cfg, 24), { pot: 480, kp: 120, net: 240, skins: 120 });
        assert.deepEqual(T.dailyPotAmounts(cfg, 4), { pot: 80, kp: 20, net: 40, skins: 20 });
        assert.deepEqual(pool.kp.holes, [4, 14], 'KP holes are that course\'s par 3s');
        assert.deepEqual(pool.net.places, [50, 30, 20]);
        assert.equal(pool.enabled, true);
    });

    test('NO CARD, NO GUESS: a round with no course is named and not written', () => {
        const noCard = [{ code: 'DDD', label: 'Friday', data: { players: players(4), courseData: [], scores: {} } }];
        const built = T.dailyPotUpdates(R.tripRosterPlan(noCard), cfg, ctx.moneyPoolParticipants);
        assert.deepEqual(built.updates, {});
        assert.deepEqual(built.noCard, ['Friday']);
        // Without KP money there is nothing course-specific left, so it writes.
        const noKp = T.dailyPotConfig({ dailyPot: { on: true, buyIn: 20, netPct: 50 } });
        assert.ok(T.dailyPotForRound(noKp, [], 4), 'a pot with no KP does not need a card');
    });

    test('off writes nothing at all', () => {
        assert.deepEqual(T.dailyPotUpdates(R.tripRosterPlan(rounds()), T.dailyPotConfig({}), ctx.moneyPoolParticipants).updates, {});
    });
});

// ===========================================================================
describe('4. WITH BOTH OFF, THE TRIP SETTLES EXACTLY AS IT DID', () => {

    const GOLDEN = JSON.parse(read('helpers/trip-money-no-pots.golden.json'));

    test('the golden was captured with content, not from an empty page', () => {
        assert.ok(GOLDEN.money.length > 1000, 'the money card golden is too small to mean anything');
        assert.match(GOLDEN.money, /Net Across the Trip/);
        assert.match(GOLDEN.points, /Points/);
    });

    test('money, points, leaderboard and prizes are byte-identical', async () => {
        const sb = arriveNoPots();
        await new Promise((r) => setTimeout(r, 60));   // the same settle the capture used
        ['money', 'points', 'leaderboard', 'prizes'].forEach((pane) => {
            assert.equal(grab(sb, pane), GOLDEN[pane], pane + ' moved with both pots off');
        });
    });

    test('AND WITH THE POT ON, IT REACHES THE MONEY CARD', async () => {
        // THE TEST THAT WOULD HAVE CAUGHT THE DEFECT. Every rule above can pass
        // with a pot that never applies: the standings were keyed by golfer and
        // Object.values() threw the key away, so no prize could ever be matched to
        // a payer and the backstop refused the pot every single time. Nothing short
        // of rendering the page with a pot switched on says otherwise.
        const sb = arriveNoPots({ on: true, buyIn: 10, places: [40] });
        await new Promise((r) => setTimeout(r, 60));
        const pot = JSON.parse(vm.runInContext('JSON.stringify({ applied: cachedTripPot.applied, reason: cachedTripPot.reason,'
            + ' nets: cachedTripPot.entries.map(function (e) { return e.name + " " + (e.netCents / 100); }) })', sb));
        assert.equal(pot.applied, true, pot.reason);
        // Four golfers at $10 is a $40 pot; A and B tie for first and split it, so
        // each is up $20 less his own $10, and the other two are down their buy-in.
        assert.deepEqual(pot.nets.sort(), ['A 10', 'B 10', 'C -10', 'D -10'].sort());
        const money = grab(sb, 'money');
        assert.notEqual(money, GOLDEN.money, 'the pot changed nothing on the card');
        assert.match(money, /\+\$30/, 'the trip total does not carry the pot');
        assert.match(vm.runInContext('tripTotalScopeSentence()', sb), /and the Trip Pot\./,
            'the sentence under the money does not say the pot is in it');
    });

    test('the engines are the ones that were signed off', () => {
        assert.equal(sha12('money-engine.js'), '12bfa41c2c8e');
        assert.equal(sha12('settlement-engine.js'), '6ddd4c8676cd');
        assert.equal(sha12('pool-engine.js'), '372e76d7d5c4');
        assert.equal(sha12('action-model.js'), '399ba26f0025');
        assert.equal(sha12('handicap.js'), '2d3b2f7fd916');
        assert.equal(sha12('payouts.js'), 'c35e34f571e5');
    });
});

// ---- the harness for section 4, which must match the capture exactly --------
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const teamed = (list) => list.map((p) => Object.assign({}, p, {
    team: ['a', 'b'].indexOf(p.name.trim().toLowerCase()) !== -1 ? 'Team 1' : 'Team 2', playingForMoney: true }));
const roundOf = (pl, name, shift) => {
    const scores = {};
    pl.forEach((p, i) => CD.forEach((h) => {
        scores['p' + p.id + '_h' + h.hole] = (p.team === 'Team 1' ? 4 : 5) + ((i + (shift || 0)) % 2); }));
    return { eventName: name, gameFormat: 'match', matchStake: 20, players: pl,
             courseData: CD, scores, settlementMode: 'whole-dollar' };
};
const FOUR = teamed([{ id: 101, name: 'A', hcp: '0' }, { id: 102, name: 'B', hcp: '0' },
                     { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }]);
const ROUNDS = { DAY1: roundOf(FOUR, 'Caledonia', 0), DAY2: roundOf(FOUR, 'True Blue', 1) };
const PANES = { money: 'trip-money-settlement', points: 'trip-points-race',
                leaderboard: 'trip-leaderboard', prizes: 'prize-payout-results' };
function grab(sb, pane) {
    return vm.runInContext('document.getElementById(' + JSON.stringify(PANES[pane]) + ').innerHTML', sb);
}
function arriveNoPots(tripPot) {
    const sb = loadHtmlInlineScript('trip.html',
        ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
         'pool-engine.js', 'payouts.js', 'course-data.js', 'grouping.js', 'trip-roster.js', 'trip-pots.js'],
        { search: '?trip=MYR1', localStorage: true });
    vm.runInContext('alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; uiToast = function () {}; confirm = function () { return true; };', sb);
    const tripRounds = {};
    Object.keys(ROUNDS).forEach((c) => { tripRounds[c] = { label: ROUNDS[c].eventName, addedAt: 1 }; });
    vm.runInContext('__ROUNDS = ' + JSON.stringify(ROUNDS) + ';'
        + 'db.ref = function (p) { var parts = String(p).split("/").filter(Boolean);'
        + '  return { on: function () {}, set: function () { return Promise.resolve(); },'
        + '    update: function () { return Promise.resolve(); }, remove: function () { return Promise.resolve(); },'
        + '    push: function () { return { key: "K1" }; },'
        + '    once: function () { var v = (parts[0] === "events") ? (__ROUNDS[parts[1]] || null) : null;'
        + '      return Promise.resolve({ val: function () { return v; }, exists: function () { return v != null; } }); } }; };', sb);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /^trips\//.test(h.path))
        .forEach((h) => h.cb({ val: () => Object.assign({ name: 'Myrtle Beach', createdAt: 1, rounds: tripRounds },
            tripPot ? { tripPot: tripPot } : {}) }));
    return sb;
}
