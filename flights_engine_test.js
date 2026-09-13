// ============================================================================
// FLIGHTS IN THE ENGINE: skins and birdies run PER SLICE and merge.
// (Flights, Wave 2, Step 3, 2026-09-13.)
//
// The mechanism (settlement-engine.js): the same function, once per slice
// from flightSlices(data, scopeName), on a config narrowed to the slice
// (its players = the slice's players, flights removed), then mergeSliceNets,
// which refuses to write a key twice. Off, one null slice falls through to the
// code that has always run - flights_absent_golden_test.js pins that.
//
// THE STRONGEST TEST IS THE FIRST: flights ON with every golfer in A must be
// indistinguishable from no flights at all, on every surface, to the literal.
// One flight holding the whole field IS the whole field.
//
// Per-flight detail is a SEPARATE function - computeSkinsPayoutLinesByFlight -
// so computeSkinsPayoutLines keeps today's exact shape (the golden compares
// the whole object). ByFlight always returns one entry per slice (one, flight
// null, when off), so a surface loops it and never special-cases the off
// round. computeSkinsHoleLedger gains `flights` the same way; its top-level
// gross/net are null when flighted because a winner in A and a tie in B on
// the same hole are two rows, not one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const CD = makeCourseData(18);
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'flights_absent_golden.fixture.json'), 'utf8'));

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f =>
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f }));
    return sb;
})();

// ---------------------------------------------------------------------------
// THE STEP 1 GOLDEN ROUND, with flights on and everyone in A.
// ---------------------------------------------------------------------------
const G_PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [2, 9, 15, 4, 20, 7, 11, 0], 101,
    ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A']);
const G_SCORES = (() => {
    const s = {};
    G_PLAYERS.forEach(p => CD.slice(0, 17).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { s[`p${G_PLAYERS[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 2); birdie(0, 9); birdie(1, 5); birdie(2, 14); birdie(6, 11); birdie(3, 13); birdie(7, 13);
    return s;
})();
const goldenRound = (flights) => ({ players: G_PLAYERS, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false,
    birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross', courseData: CD, scores: G_SCORES,
    settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar', flights });
const ON_BOTH = { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } };

describe('3.3 PARITY: flights ON with EVERY golfer in A === the Step 1 golden, to the literal', () => {
    const data = goldenRound(ON_BOTH);
    const E = FIX.engine;

    test('the resolver really is on: two slices, B empty', () => {
        const slices = ENG.flightSlices(data, 'skins');
        assert.equal(slices.length, 2);
        assert.equal(slices[0].players.length, 8);
        assert.equal(slices[1].players.length, 0);
    });
    test('computeSkinsPayoutLines: byte-identical to the golden', () => {
        assert.deepEqual(J(ENG.computeSkinsPayoutLines(data, CD, G_SCORES)), E.lines);
    });
    test('computeSkinsSettlementNet: identical', () => {
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(data, CD, G_SCORES)), E.skinsNet);
    });
    test('calculateBirdieGameTotalsForSettle: identical', () => {
        assert.deepEqual(J(ENG.calculateBirdieGameTotalsForSettle(data, CD, G_SCORES)), E.birdies);
    });
    test('computeSkinsHoleLedger: flight A\'s rows are the golden rows; B has no participants; top-level is null when flighted', () => {
        const HL = ENG.computeSkinsHoleLedger(data, CD, G_SCORES);
        assert.equal(HL.gross, null); assert.equal(HL.net, null);
        assert.equal(HL.flights.length, 2);
        const rows = (h) => J(h.holes.map(r => [r.hole, r.state, r.official, r.winner ? r.winner.name : null, r.unitsWon]));
        assert.deepEqual({ gross: rows(HL.flights[0].gross), grossThru: HL.flights[0].gross.officialThru,
                           net: rows(HL.flights[0].net), netThru: HL.flights[0].net.officialThru }, E.ledger);
        assert.equal(HL.flights[0].flight, 'A'); assert.equal(HL.flights[1].flight, 'B');
        assert.equal(HL.flights[1].participants.length, 0);
    });
    test('computeCombinedNetTotals: netByName, contributions, transactions identical', () => {
        const c = ENG.computeCombinedNetTotals(data, CD, G_SCORES);
        assert.deepEqual(J(c.netByName), E.netByName);
        assert.deepEqual(J(c.contributions), E.contributions);
        assert.deepEqual(J(c.transactions), E.transactions);
    });
    test('ByFlight: A carries the whole golden ledger with flight "A" on every line; B is an empty pot', () => {
        const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, G_SCORES);
        assert.equal(by.flights.length, 2);
        assert.equal(by.flights[0].golfers, 8); assert.equal(by.flights[1].golfers, 0);
        assert.deepEqual(J(by.flights[0].gross.lines.map(l => [l.flight, l.hole, l.value])), E.lines.gross.lines.map(l => ['A', l.hole, l.value]));
        assert.equal(by.flights[1].gross.pot, 0); assert.deepEqual(J(by.flights[1].gross.lines), []);
    });
});

// ---------------------------------------------------------------------------
// A SPLIT ROUND. Eight golfers, hcp 0, gross skins at $8 (pot $32 PER FLIGHT),
// birdies at $2. A = Ann Ben Cal Dee, B = Eli Fay Gus Hal. Everyone par;
// birdies are outright skins within a flight.
//   A: Ann h1, Ann h2, Ben h3             -> 3 skins, 32/3 = 11, 11, 10 (extra on h1, h2)
//   B: Eli h2, Fay h5, Gus h7, Hal h9, Eli h11 -> 5 skins, 32/5 = 7, 7, 6, 6, 6 (extra on h2, h5)
//   h13: Cal AND Dee birdie (A ties), Gus birdies alone (B skin) -> 6 B skins: 32/6 = 6,6,5,5,5,5
// ---------------------------------------------------------------------------
const S_PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101,
    ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
const S_SCORES = (() => {
    const s = {};
    S_PLAYERS.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { s[`p${S_PLAYERS[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 1); birdie(0, 2); birdie(1, 3);                                   // A
    birdie(4, 2); birdie(5, 5); birdie(6, 7); birdie(7, 9); birdie(4, 11);       // B
    birdie(2, 13); birdie(3, 13); birdie(6, 13);                                // A tie, B skin
    return s;
})();
const splitRound = (flights, extra) => Object.assign({ players: S_PLAYERS, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross',
    skinsCarryOver: false, birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross', courseData: CD, scores: S_SCORES,
    settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar', flights }, extra || {});
const A = [101, 102, 103, 104], B = [105, 106, 107, 108];
const pick = (o, keys) => keys.reduce((r, k) => { r[k] = o[k]; return r; }, {});

describe('3.1 SKINS PER SLICE', () => {
    const data = splitRound(ON_BOTH);

    test('two pots of $32 (buyIn x the FLIGHT), two hole-order allocations, the extra dollar on DIFFERENT holes in A and B', () => {
        const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, S_SCORES);
        assert.deepEqual(J(by.flights.map(f => [f.flight, f.golfers, f.gross.pot])), [['A', 4, 32], ['B', 4, 32]]);
        assert.deepEqual(J(by.flights[0].gross.lines.map(l => [l.flight, l.hole, l.playerName, l.value])),
            [['A', 1, 'Ann', 11], ['A', 2, 'Ann', 11], ['A', 3, 'Ben', 10]]);
        assert.deepEqual(J(by.flights[1].gross.lines.map(l => [l.flight, l.hole, l.playerName, l.value])),
            [['B', 2, 'Eli', 6], ['B', 5, 'Fay', 6], ['B', 7, 'Gus', 5], ['B', 9, 'Hal', 5], ['B', 11, 'Eli', 5], ['B', 13, 'Gus', 5]]);
        // hole 2 carries the extra dollar in BOTH (11 in A's 3-way, 6 in B's 6-way); hole 1 only in A; hole 5 only in B
        assert.equal(by.flights[0].gross.lines.find(l => l.hole === 1).value, 11);
        assert.equal(by.flights[1].gross.lines.find(l => l.hole === 5).value, 6);
        assert.equal(by.flights[1].gross.lines.find(l => l.hole === 7).value, 5);
        assert.equal(by.rule, 'odd-dollar');
    });

    test('the flat ledger merges: pot 64, nine lines in hole order (hole 2 twice - one per flight), today\'s item shape', () => {
        const L = ENG.computeSkinsPayoutLines(data, CD, S_SCORES);
        assert.equal(L.gross.pot, 64);
        assert.equal(L.gross.perGolfer, 8);
        assert.deepEqual(J(L.gross.lines.map(l => l.hole)), [1, 2, 2, 3, 5, 7, 9, 11, 13]);
        assert.deepEqual(Object.keys(J(L.gross.lines[0])).sort(), ['hole', 'playerId', 'playerName', 'units', 'value']);
        assert.equal(J(L.gross.lines).reduce((t, l) => t + l.value, 0), 64);
    });

    test('computeSkinsSettlementNet: A settles among A, B among B; each flight nets to zero; the field nets to zero', () => {
        const net = J(ENG.computeSkinsSettlementNet(data, CD, S_SCORES));
        assert.deepEqual(pick(net, A), { 101: 22 - 8, 102: 10 - 8, 103: -8, 104: -8 });
        assert.deepEqual(pick(net, B), { 105: 11 - 8, 106: 6 - 8, 107: 10 - 8, 108: 5 - 8 });
        assert.equal(sum(pick(net, A)), 0); assert.equal(sum(pick(net, B)), 0); assert.equal(sum(net), 0);
        assert.equal(Object.keys(net).length, 8, 'every golfer exactly once');
    });

    test('computeGameNetByPlayerId (the round\'s main skins game) is the same merged answer, no key written twice', () => {
        const game = ENG.getRoundGames(data).find(g => g.role === 'main');
        const via = J(ENG.computeGameNetByPlayerId(game, CD, S_SCORES));
        assert.deepEqual(via, J(ENG.computeSkinsSettlementNet(data, CD, S_SCORES)));
        assert.equal(Object.keys(via).length, 8);
    });

    test('the hole ledger: hole 13 is a TIE in A and a SKIN (Gus) in B; top-level gross is null when flighted', () => {
        const HL = ENG.computeSkinsHoleLedger(data, CD, S_SCORES);
        assert.equal(HL.gross, null);
        assert.equal(HL.flights.length, 2);
        const row = (f, h) => { const r = HL.flights[f].gross.holes.find(x => x.hole === h); return [r.state, r.winner ? r.winner.name : null]; };
        assert.deepEqual(row(0, 13), ['tie', null]);
        assert.deepEqual(row(1, 13), ['skin', 'Gus']);
        assert.deepEqual(row(0, 1), ['skin', 'Ann']);
        assert.deepEqual(row(1, 1), ['tie', null], 'hole 1 is a tie in B - four pars');
        assert.deepEqual(J(HL.flights.map(f => f.participants.map(p => p.id))), [A, B]);
    });

    test('OFF: the hole ledger\'s `flights` is one null entry equal to the top level, so a loop needs no special case', () => {
        const HL = ENG.computeSkinsHoleLedger(splitRound(undefined), CD, S_SCORES);
        assert.equal(HL.flights.length, 1);
        assert.equal(HL.flights[0].flight, null);
        assert.deepEqual(J(HL.flights[0].gross.holes), J(HL.gross.holes));
        const by = ENG.computeSkinsPayoutLinesByFlight(splitRound(undefined), CD, S_SCORES);
        assert.equal(by.flights.length, 1); assert.equal(by.flights[0].flight, null); assert.equal(by.flights[0].golfers, 8);
        assert.ok(by.flights[0].gross.lines.every(l => l.flight === null));
    });

    test('mergeSliceNets refuses an overlapping key rather than trusting the slices', () => {
        assert.throws(() => ENG.mergeSliceNets([{ 101: 1 }, { 101: 2 }]), /overlap on player 101/);
        assert.deepEqual(J(ENG.mergeSliceNets([{ 101: 1 }, { 102: 2 }])), { 101: 1, 102: 2 });
    });
});

describe('3.2 BIRDIES PER SLICE', () => {
    test('a birdie in A is paid by A only: n is the flight\'s size', () => {
        const b = J(ENG.calculateBirdieGameTotalsForSettle(splitRound(ON_BOTH), CD, S_SCORES));
        // A: Ann 2, Ben 1, Cal 1, Dee 1 (5 units, n = 4) -> Ann 2*(8-5)=6, others 2*(4-5)=-2
        assert.deepEqual(pick(b, A), { 101: 6, 102: -2, 103: -2, 104: -2 });
        // B: Eli 2, Fay 1, Gus 2, Hal 1 (6 units, n = 4) -> Eli 4, Fay -4, Gus 4, Hal -4
        assert.deepEqual(pick(b, B), { 105: 4, 106: -4, 107: 4, 108: -4 });
        assert.equal(sum(pick(b, A)), 0); assert.equal(sum(pick(b, B)), 0); assert.equal(sum(b), 0);
    });

    test('the same round with birdies scoped to the FIELD pays across all eight (n = 8)', () => {
        const b = J(ENG.calculateBirdieGameTotalsForSettle(splitRound({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }), CD, S_SCORES));
        // 11 units over 8 golfers: Ann 2*(16-11)=10, Eli 10, Gus 10, Ben/Cal/Dee/Fay/Hal 2*(8-11)=-6
        assert.deepEqual(b, { 101: 10, 102: -6, 103: -6, 104: -6, 105: 10, 106: -6, 107: 10, 108: -6 });
        assert.equal(sum(b), 0);
    });
});

describe('3.3 THE REQUIRED ROWS', () => {
    test('zero-sum per flight AND across the field, on BOTH scopes, through computeCombinedNetTotals', () => {
        const c = ENG.computeCombinedNetTotals(splitRound(ON_BOTH), CD, S_SCORES);
        const net = {}; Object.values(J(c.netByName)).forEach(r => { net[r.name] = r.net; });
        const byName = (names) => names.reduce((t, n) => t + (net[n] || 0), 0);
        assert.equal(byName(['Ann', 'Ben', 'Cal', 'Dee']), 0);
        assert.equal(byName(['Eli', 'Fay', 'Gus', 'Hal']), 0);
        assert.equal(sum(net), 0);
        assert.deepEqual(net, { Ann: 20, Ben: 0, Cal: -10, Dee: -10, Eli: 7, Fay: -6, Gus: 6, Hal: -7 });
    });

    test('skins "flight" with birdies "field" on ONE round: two scoped answers at once', () => {
        const data = splitRound({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        const skins = J(ENG.computeSkinsSettlementNet(data, CD, S_SCORES));
        assert.equal(sum(pick(skins, A)), 0, 'skins zero-sum within A');
        assert.equal(sum(pick(skins, B)), 0, 'skins zero-sum within B');
        const b = J(ENG.calculateBirdieGameTotalsForSettle(data, CD, S_SCORES));
        assert.notEqual(sum(pick(b, A)), 0, 'birdies are NOT zero-sum within A - they run across the field');
        assert.equal(sum(b), 0);
        assert.equal(ENG.flightSlices(data, 'skins').length, 2);
        assert.equal(ENG.flightSlices(data, 'birdies').length, 1);
    });

    test('a flight of ONE: her pot is $8, every posted hole is her skin, she wins her own stake back; birdies n = 1 pay 0', () => {
        const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'B', 'B', 'B']);
        const scores = {};
        players.forEach(p => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        scores['p101_h1'] = CD[0].par - 1;
        const data = splitRound(ON_BOTH, { players, scores });
        const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, scores);
        assert.equal(by.flights[0].golfers, 1);
        assert.equal(by.flights[0].gross.pot, 8);
        assert.equal(by.flights[0].gross.lines.length, 18, 'alone in her flight, every hole is an outright win');
        assert.equal(by.flights[0].gross.lines.reduce((t, l) => t + l.value, 0), 8);
        const net = J(ENG.computeSkinsSettlementNet(data, CD, scores));
        assert.equal(net[101], 0);
        assert.deepEqual(J(ENG.calculateBirdieGameTotalsForSettle(data, CD, scores))[101], 0);
        // B is three golfers who all made par: no skin, nobody charged
        assert.deepEqual(pick(net, [102, 103, 104]), { 102: 0, 103: 0, 104: 0 });
    });

    test('a flight of ZERO: B empty pays nobody, n = 0, no throw, and A is unaffected', () => {
        const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'A', 'A', 'A']);
        const data = splitRound(ON_BOTH, { players });
        const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, S_SCORES);
        assert.deepEqual(J(by.flights.map(f => [f.flight, f.golfers, f.gross.pot, f.gross.lines.length])), [['A', 4, 32, 3], ['B', 0, 0, 0]], 'A: Ann h1, Ann h2, Ben h3; hole 13 ties');
        const net = J(ENG.computeSkinsSettlementNet(data, CD, S_SCORES));
        assert.deepEqual(Object.keys(net).map(Number), A);
        assert.equal(sum(net), 0);
        const b = J(ENG.calculateBirdieGameTotalsForSettle(data, CD, S_SCORES));
        assert.deepEqual(Object.keys(b).map(Number), A);
        const HL = ENG.computeSkinsHoleLedger(data, CD, S_SCORES);
        assert.equal(HL.flights[1].participants.length, 0);
    });

    test('a stacked skins INSTANCE with participantIds AND flight scope: four named golfers become two two-man pots', () => {
        const data = splitRound(ON_BOTH, { gameFormat: 'stroke', skinsBuyIn: undefined,
            additionalGameInstances: { inst1: { format: 'skins', enabled: true, skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false,
                startHole: 1, participantIds: ['101', '102', '105', '106'] } } });
        const inst = ENG.getRoundGames(data).find(g => g.key === 'inst1');
        assert.equal(inst.config.flights.enabled, true, 'the round-level flights reach the instance config');
        const by = ENG.computeSkinsPayoutLinesByFlight(inst.config, CD, S_SCORES);
        assert.deepEqual(J(by.flights.map(f => [f.flight, f.golfers, f.gross.pot])), [['A', 2, 16], ['B', 2, 16]]);
        // A (Ann, Ben): Ann h1, Ann h2, Ben h3 -> 16/3 = 6, 5, 5. B (Eli, Fay): Eli h2, Fay h5, Eli h11 -> 6, 5, 5
        assert.deepEqual(J(by.flights[0].gross.lines.map(l => [l.playerName, l.hole, l.value])), [['Ann', 1, 6], ['Ann', 2, 5], ['Ben', 3, 5]]);
        assert.deepEqual(J(by.flights[1].gross.lines.map(l => [l.playerName, l.hole, l.value])), [['Eli', 2, 6], ['Fay', 5, 5], ['Eli', 11, 5]]);
        const net = J(ENG.computeGameNetByPlayerId(inst, CD, S_SCORES));
        assert.deepEqual(net, { 101: 11 - 8, 102: 5 - 8, 105: 11 - 8, 106: 5 - 8 });
        [103, 104, 107, 108].forEach(id => assert.equal(net[id], undefined, id + ' is outside participantIds'));
    });

    test('a flighted round that CARRIES (legacy math) is per flight too', () => {
        const data = splitRound(ON_BOTH, { skinsCarryOver: true, skinsRounding: undefined });
        const net = J(ENG.computeSkinsSettlementNet(data, CD, S_SCORES));
        assert.equal(Object.keys(net).length, 8);
        assert.ok(Math.abs(sum(pick(net, A))) < 1e-9); assert.ok(Math.abs(sum(pick(net, B))) < 1e-9);
        const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, S_SCORES);
        assert.equal(by.rule, 'legacy');
        assert.equal(by.flights[0].gross.pot, 32);
    });
});

// ---------------------------------------------------------------------------
// 4.0 THE LEDGER AND THE SETTLEMENT ARE ONE THING, PER FLIGHT. Wave 1 bound
// them for the flightless round (skins_odd_dollar_test.js "LEDGER ==
// SETTLEMENT"). This is the per-flight equivalent: for every slice, the
// ByFlight lines minus that slice's stake must equal what
// computeSkinsSettlementNet pays each golfer in it.
// ---------------------------------------------------------------------------
describe('4.0 LEDGER == SETTLEMENT, PER FLIGHT', () => {
    const ROUNDS = [
        ['the split round', () => splitRound(ON_BOTH)],
        ['a flight of one', () => {
            const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'B', 'B', 'B']);
            const scores = {}; players.forEach(p => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
            scores['p101_h1'] = CD[0].par - 1; scores['p102_h4'] = CD[3].par - 1;
            return splitRound(ON_BOTH, { players, scores });
        }],
        ['a flight of zero', () => splitRound(ON_BOTH, { players: makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'A', 'A', 'A']) })],
        ['the instance round', () => {
            const data = splitRound(ON_BOTH, { gameFormat: 'stroke', skinsBuyIn: undefined,
                additionalGameInstances: { inst1: { format: 'skins', enabled: true, skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false,
                    startHole: 1, participantIds: ['101', '102', '105', '106'] } } });
            return ENG.getRoundGames(data).find(g => g.key === 'inst1').config;
        }]
    ];
    ROUNDS.forEach(([title, build]) => {
        test(title + ': for every slice, ByFlight lines - the slice\'s stake === computeSkinsSettlementNet, golfer by golfer', () => {
            const data = build();
            const scores = data.scores;
            const by = ENG.computeSkinsPayoutLinesByFlight(data, CD, scores);
            const net = J(ENG.computeSkinsSettlementNet(data, CD, scores));
            const slices = ENG.flightSlices(data, 'skins');
            assert.equal(by.flights.length, slices.length);
            let golfersChecked = 0;
            by.flights.forEach((f, i) => {
                const won = {};
                slices[i].players.forEach(p => { won[p.id] = 0; });
                [].concat(J(f.gross.lines), J(f.net.lines)).forEach(l => {
                    assert.equal(l.flight, f.flight, 'a line carries its own flight');
                    won[l.playerId] += l.value;
                });
                const stake = (f.gross.lines.length ? f.gross.perGolfer : 0) + (f.net.lines.length ? f.net.perGolfer : 0);
                slices[i].players.forEach(p => {
                    assert.equal(net[p.id], won[p.id] - stake, `${p.name} (${f.flight}): net must be the flight's lines minus the flight's stake`);
                    golfersChecked++;
                });
                assert.equal(Object.values(won).reduce((a, b) => a + b, 0), f.gross.pot * (f.gross.lines.length ? 1 : 0) + f.net.pot * (f.net.lines.length ? 1 : 0),
                    f.flight + ': the lines sum to the pots that were won');
            });
            assert.equal(golfersChecked, Object.keys(net).length, 'every settled golfer was checked against a slice');
        });
    });

    test('THE FLAT VIEW CAN HOLD THE SAME HOLE TWICE under flights - read ByFlight when keying by hole', () => {
        // computeSkinsPayoutLines merges the flights' lines in hole order. Hole 2
        // is won in A (Ann) and in B (Eli), so it appears twice. A consumer that
        // builds a map by hole would keep one and lose a real skin. The flat view
        // is for per-golfer sums; per-hole work reads computeSkinsPayoutLinesByFlight.
        const L = ENG.computeSkinsPayoutLines(splitRound(ON_BOTH), CD, S_SCORES);
        const holes = J(L.gross.lines.map(l => l.hole));
        assert.equal(holes.filter(h => h === 2).length, 2);
        assert.deepEqual(J(L.gross.lines.filter(l => l.hole === 2).map(l => [l.playerName, l.value])), [['Ann', 11], ['Eli', 6]]);
        const by = ENG.computeSkinsPayoutLinesByFlight(splitRound(ON_BOTH), CD, S_SCORES);
        by.flights.forEach(f => {
            const hs = J(f.gross.lines.map(l => l.hole));
            assert.equal(new Set(hs).size, hs.length, f.flight + ': within one flight a hole appears at most once');
        });
    });
});
