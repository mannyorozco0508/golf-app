// ============================================================================
// flightSlices(data, scopeName) - THE ONE RESOLVER A PER-FLIGHT GAME ASKS.
// (Flights, Wave 2, Step 2, 2026-09-13.)
//
// The contract, in action-model.js beside fieldParticipants:
//   flights absent / enabled !== true / scopes[scopeName] !== 'flight'
//       -> [{ flight: null, players: fieldParticipants(data) }]
//   otherwise
//       -> [{ flight: 'A', players }, { flight: 'B', players }]  ALWAYS both
//   composed ON fieldParticipants, so participantIds and playingForMoney keep
//   their meaning and a flight narrows WITHIN them. An untagged golfer is A.
//   An empty flight is an empty slice, never a missing one.
//
// NOTHING CALLS IT YET. This step adds the resolver and its tests only; every
// existing caller still goes through fieldParticipants exactly as before, and
// flights_absent_golden_test.js is untouched. The "zero production callers"
// test at the end pins that for this step.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makePlayers } = require('./helpers/fixtures.js');
const AM = require('./action-model.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const ids = (players) => players.map(p => p.id);
const sliceIds = (slices) => slices.map(s => ({ flight: s.flight, ids: ids(s.players) }));

// Six golfers: A, B, A, B, A, (untagged). Fay has no tag at all.
const P = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'], [0, 0, 0, 0, 0, 0], 101, ['A', 'B', 'A', 'B', 'A']);
const round = (flights, extra) => Object.assign({ players: P }, flights === undefined ? {} : { flights }, extra || {});
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } };

describe('2.2 ONE NULL SLICE = TODAY', () => {
    [['flights absent', round()],
     ['flights: { enabled: false }', round({ enabled: false, scopes: { skins: 'flight' } })],
     ['enabled but the scope is "field"', round({ enabled: true, scopes: { skins: 'field' } })],
     ['enabled with no scopes object at all', round({ enabled: true })],
     ['enabled: "true" (a string, not the boolean)', round({ enabled: 'true', scopes: { skins: 'flight' } })]
    ].forEach(([title, data]) => {
        test(title + ' -> one slice, flight null, players identical to fieldParticipants', () => {
            const slices = AM.flightSlices(data, 'skins');
            assert.equal(slices.length, 1);
            assert.equal(slices[0].flight, null);
            assert.deepEqual(J(slices[0].players), J(AM.fieldParticipants(data)));
            assert.deepEqual(ids(slices[0].players), [101, 102, 103, 104, 105, 106]);
        });
    });

    test('a scope name that is not set on the round -> field', () => {
        const data = round({ enabled: true, scopes: { skins: 'flight' } });
        const slices = AM.flightSlices(data, 'birdies');
        assert.equal(slices.length, 1);
        assert.equal(slices[0].flight, null);
        assert.deepEqual(ids(slices[0].players), ids(AM.fieldParticipants(data)));
    });
});

describe('2.2 TWO SLICES WHEN ENABLED AND SCOPED', () => {
    test('enabled + scope "flight" -> A then B, disjoint, union === fieldParticipants in both directions', () => {
        const data = round(ON);
        const slices = AM.flightSlices(data, 'skins');
        assert.equal(slices.length, 2);
        assert.deepEqual(slices.map(s => s.flight), ['A', 'B']);
        const a = ids(slices[0].players), b = ids(slices[1].players);
        assert.ok(a.every(id => !b.includes(id)), 'disjoint');
        const union = a.concat(b).sort((x, y) => x - y);
        const field = ids(AM.fieldParticipants(data)).sort((x, y) => x - y);
        assert.deepEqual(union, field, 'every field golfer is in exactly one slice');
        assert.deepEqual(field, union, 'and no slice golfer is outside the field');
        assert.equal(a.length + b.length, AM.fieldParticipants(data).length);
    });

    test('an untagged golfer lands in A', () => {
        const slices = AM.flightSlices(round(ON), 'skins');
        assert.ok(ids(slices[0].players).includes(106), 'Fay (no tag) is in A');
        assert.ok(!ids(slices[1].players).includes(106));
        assert.deepEqual(sliceIds(slices), [{ flight: 'A', ids: [101, 103, 105, 106] }, { flight: 'B', ids: [102, 104] }]);
        assert.equal(AM.playerFlight({}), 'A');
        assert.equal(AM.playerFlight({ flight: 'B' }), 'B');
        assert.equal(AM.playerFlight({ flight: 'C' }), 'A', 'anything that is not B is A');
    });

    test('participantIds intersection: four named golfers, two per flight -> two slices of two; the others in NEITHER', () => {
        const data = round(ON, { participantIds: ['101', '102', '103', '104'] });
        const slices = AM.flightSlices(data, 'skins');
        assert.deepEqual(sliceIds(slices), [{ flight: 'A', ids: [101, 103] }, { flight: 'B', ids: [102, 104] }]);
        [105, 106].forEach(id => slices.forEach(s => assert.ok(!ids(s.players).includes(id), id + ' is outside participantIds and must be in no slice')));
    });

    test('playingForMoney: false keeps its meaning inside a flight', () => {
        const players = J(P); players[2].playingForMoney = false;   // Cal, flight A
        const slices = AM.flightSlices({ players, flights: ON }, 'skins');
        assert.deepEqual(sliceIds(slices), [{ flight: 'A', ids: [101, 105, 106] }, { flight: 'B', ids: [102, 104] }]);
    });

    test('a flight with ONE golfer is a one-golfer slice', () => {
        const players = makePlayers(['Ann', 'Ben', 'Cal'], [0, 0, 0], 101, ['A', 'A', 'B']);
        const slices = AM.flightSlices({ players, flights: ON }, 'skins');
        assert.deepEqual(sliceIds(slices), [{ flight: 'A', ids: [101, 102] }, { flight: 'B', ids: [103] }]);
    });

    test('a flight with ZERO golfers is an EMPTY slice - still two slices, B second, not an error', () => {
        const players = makePlayers(['Ann', 'Ben', 'Cal'], [0, 0, 0], 101, ['A', 'A', 'A']);
        const slices = AM.flightSlices({ players, flights: ON }, 'skins');
        assert.equal(slices.length, 2);
        assert.deepEqual(sliceIds(slices), [{ flight: 'A', ids: [101, 102, 103] }, { flight: 'B', ids: [] }]);
        // and the other way round: everyone tagged B leaves A empty, A still first
        const allB = makePlayers(['Ann', 'Ben'], [0, 0], 101, ['B', 'B']);
        assert.deepEqual(sliceIds(AM.flightSlices({ players: allB, flights: ON }, 'skins')), [{ flight: 'A', ids: [] }, { flight: 'B', ids: [101, 102] }]);
    });

    test('the two scopes are independent: skins "flight" and birdies "field" on one round answer differently', () => {
        const data = round({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        const skins = AM.flightSlices(data, 'skins');
        const birdies = AM.flightSlices(data, 'birdies');
        assert.equal(skins.length, 2);
        assert.equal(birdies.length, 1);
        assert.equal(birdies[0].flight, null);
        assert.deepEqual(ids(birdies[0].players), [101, 102, 103, 104, 105, 106]);
        assert.deepEqual(skins.map(s => s.flight), ['A', 'B']);
    });

    test('the slices are new arrays over the same player objects - a caller may not mutate the roster through them', () => {
        const data = round(ON);
        const slices = AM.flightSlices(data, 'skins');
        assert.notEqual(slices[0].players, data.players);
        assert.equal(slices[0].players[0], data.players[0], 'same golfer object, so ids and hcps are the roster\'s');
    });
});

describe('2.4 NOTHING MOVED', () => {
    const SRC = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    const PRODUCTION = fs.readdirSync(__dirname)
        .filter(f => /\.(js|html)$/.test(f) && !/(_test|\.test)\.js$/.test(f) && !/^(firebase-|build-shell|sync-mobile-web)/.test(f));

    // WHO MAY CALL IT. Step 2 pinned zero callers; Step 3 added the engine
    // (settlement-engine.js reaches it through one seam, skinsSlicesOf). Each
    // later step adds its surfaces here deliberately - a caller that is not
    // on this list is a surface scoping itself without a decision.
    // Step 5 added the live surfaces: bet-strip.js (its per-flight walk) and
    // skins.html (each flight's golfers for its ledger section).
    const ALLOWED_CALLERS = ['settlement-engine.js', 'bet-strip.js', 'skins.html'];
    test('flightSlices is called only from the files this wave has reached: ' + ALLOWED_CALLERS.join(', '), () => {
        const callers = PRODUCTION.filter(f => {
            const code = SRC(f).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
            const n = (code.match(/flightSlices\s*\(/g) || []).length;
            // action-model.js holds the definition (one match); anything beyond that is a call
            return f === 'action-model.js' ? n > 1 : n > 0;
        });
        assert.deepEqual(callers.sort(), ALLOWED_CALLERS.slice().sort(), 'flightSlices callers: ' + callers.join(', '));
        // and the engine calls it through ONE seam
        const eng = SRC('settlement-engine.js').replace(/\/\/[^\n]*/g, '');
        assert.equal((eng.match(/flightSlices\s*\(/g) || []).length, 1, 'settlement-engine.js reaches flightSlices in exactly one place (skinsSlicesOf)');
    });

    test('fieldParticipants is byte-identical to the version every caller runs today', () => {
        const fn = /function fieldParticipants\(data\) \{[\s\S]*?\n\}/.exec(SRC('action-model.js'))[0];
        assert.equal(fn,
`function fieldParticipants(data) {
    const eligible = (data.players || []).filter(p => p.playingForMoney !== false);
    const ids = data && data.participantIds;
    if (!Array.isArray(ids) || ids.length === 0) return eligible;
    const wanted = ids.map(String);
    return eligible.filter(p => wanted.includes(String(p.id)));
}`);
    });

    test('flightSlices is defined once, in action-model.js, and composes ON fieldParticipants', () => {
        const code = SRC('action-model.js');
        assert.equal((code.match(/function flightSlices\s*\(/g) || []).length, 1);
        const body = /function flightSlices\(data, scopeName\) \{[\s\S]*?\n\}/.exec(code)[0];
        assert.match(body, /const field = fieldParticipants\(data\);/, 'the field is fieldParticipants, taken first');
        assert.ok(!/data\.players/.test(body), 'never reads the roster directly - the filter is applied AFTER fieldParticipants');
    });
});
