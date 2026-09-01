// ============================================================================
// WHOLE-FIELD SKINS — OFFICIAL HOLES, LIVE
//
// THE PROBLEM THIS SOLVES
//
// The skins resolvers answer "who won each hole" from whoever has posted so
// far. For a finished round that is correct, and it is the only context they
// were ever called from. Looked at mid-round it is not: a hole with eight of
// twelve cards in produces a winner drawn from those eight, and that winner can
// change when the last group finishes. A golfer shown a skin that is later
// taken away trusts the app less than one shown nothing at all.
//
// computeSkinsHoleLedger adds the missing concept - an OFFICIAL hole - without
// touching the money math. The whole file below exists to hold two lines
// honest:
//
//   official    every participant in THIS game has posted THIS hole
//   valueKnown  and we also know what the hole is worth
//
// Those differ under carry, and conflating them overstates payouts.
//
// THE ANCHOR TEST is 'the live ledger agrees with settlement once the round is
// complete'. Two code paths deciding who won a skin is exactly the duplication
// this project forbids; that test is what proves it has not happened.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    ['handicap.js', 'money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// Arrays and objects built inside the VM context do not share the host realm's
// prototypes, so assert.deepEqual fails on identity even when the contents
// match. Comparing a plain copy keeps the assertion about the VALUE, which is
// the only thing under test here.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- generic fixture: 12 golfers, 3 groups of 4 ---------------------------

const NAMES = ['Avery', 'Blake', 'Casey', 'Devon', 'Ellis', 'Finley', 'Gray', 'Harper',
    'Indigo', 'Jordan', 'Kendall', 'Logan'];

function players(n = 12, hcps) {
    return NAMES.slice(0, n).map((name, i) => ({
        id: 101 + i,
        name,
        hcp: String(hcps ? hcps[i] : 10),
        playingForMoney: true,
    }));
}

const groupOf = (id) => Math.floor((Number(id) - 101) / 4) + 1;

function course(holes = 18) {
    return Array.from({ length: holes }, (_, i) => ({
        hole: i + 1,
        par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9],
        hcpIndex: i + 1,
    }));
}

// Scores builder. `spec` maps "pId_hN" -> gross. Anything unspecified is filled
// with `fill`, or omitted entirely when fill is null (used to simulate a group
// that has not reached a hole yet).
function scores(ps, cd, spec = {}, fill = 5, throughByGroup = null) {
    const out = {};
    ps.forEach(p => {
        cd.forEach(h => {
            const key = `p${p.id}_h${h.hole}`;
            if (spec[key] !== undefined) { out[key] = spec[key]; return; }
            if (throughByGroup) {
                const thru = throughByGroup[groupOf(p.id)];
                if (thru !== undefined && h.hole > thru) return;   // not played yet
            }
            if (fill !== null) out[key] = fill;
        });
    });
    return out;
}

function round(extra = {}) {
    return Object.assign({
        players: players(),
        gameFormat: 'stroke',
        skinsPotFormat: 'net',
        skinsCarryOver: false,
        skinsBuyIn: 0,
    }, extra);
}

const ledger = (sb, data, cd, sc) =>
    sb.computeSkinsHoleLedger(data, cd, sc, { groupOf });

// ============================================================================

describe('OFFICIAL HOLE RULE — a hole is official only when every participant has posted', () => {

    test('all three groups complete H1 → H1 is official', () => {
        const sb = engines();
        const ps = players(), cd = course(2);
        const sc = scores(ps, cd, { p101_h1: 3 }, 5);
        const L = ledger(sb, round({ players: ps }), cd, sc).net;
        const h1 = L.holes[0];
        assert.equal(h1.official, true);
        assert.equal(h1.postedCount, 12);
        assert.equal(h1.requiredCount, 12);
        assert.equal(h1.state, 'skin');
        assert.equal(h1.winner.name, 'Avery');
    });

    test('one group short on H2 → H2 is WAITING, and names the group', () => {
        const sb = engines();
        const ps = players(), cd = course(2);
        // Groups 1 and 2 through 2; group 3 only through 1.
        const sc = scores(ps, cd, { p101_h2: 3 }, 5, { 1: 2, 2: 2, 3: 1 });
        const L = ledger(sb, round({ players: ps }), cd, sc).net;
        const h2 = L.holes[1];
        assert.equal(h2.official, false);
        assert.equal(h2.state, 'waiting');
        assert.equal(h2.winner, null, 'A waiting hole must never name a winner.');
        assert.equal(h2.postedCount, 8);
        assert.deepEqual(plain(h2.missingGroups), [3]);
        assert.equal(h2.missing.length, 4);
    });

    test('a waiting hole resolves the instant the last card arrives', () => {
        const sb = engines();
        const ps = players(), cd = course(2);
        const partial = scores(ps, cd, { p101_h2: 3 }, 5, { 1: 2, 2: 2, 3: 1 });
        assert.equal(ledger(sb, round({ players: ps }), cd, partial).net.holes[1].state, 'waiting');

        // Group 3 posts H2.
        const complete = Object.assign({}, partial);
        [109, 110, 111, 112].forEach(id => { complete[`p${id}_h2`] = 5; });
        const after = ledger(sb, round({ players: ps }), cd, complete).net.holes[1];
        assert.equal(after.official, true);
        assert.equal(after.state, 'skin');
        assert.equal(after.winner.name, 'Avery');
    });

    test('officialThru is the contiguous run from hole 1, so a gap stops it', () => {
        const sb = engines();
        const ps = players(), cd = course(18);
        // Everyone through 16, except one golfer missing hole 9 only.
        const sc = scores(ps, cd, {}, 5, { 1: 16, 2: 16, 3: 16 });
        delete sc.p110_h9;
        const L = ledger(sb, round({ players: ps }), cd, sc).net;
        assert.equal(L.officialThru, 8, '"Official thru 16" would be a lie while hole 9 is missing a card.');
        assert.equal(L.holes[8].state, 'waiting');
        assert.equal(L.holes[9].official, true, 'Hole 10 is still individually complete.');
    });

    test('a participant-scoped game is not delayed by golfers who are not in it', () => {
        const sb = engines();
        const ps = players(), cd = course(2);
        // Only group 1 is in this skins game. Groups 2 and 3 have posted nothing.
        const sc = scores(ps, cd, { p101_h1: 3, p101_h2: 3 }, 5, { 1: 2, 2: 0, 3: 0 });
        const data = round({ players: ps, participantIds: ['101', '102', '103', '104'] });
        const L = ledger(sb, data, cd, sc).net;
        assert.equal(L.participants.length, 4);
        assert.equal(L.officialThru, 2, 'Outsiders must not hold up a game they are not in.');
        assert.equal(L.holes[0].requiredCount, 4);
    });
});

describe('NET SKINS — decided on actual per-hole net, via the canonical handicap engine', () => {

    test('a handicap stroke turns a gross loss into a net tie', () => {
        const sb = engines();
        // Two golfers only, to isolate the arithmetic.
        const ps = [
            { id: 101, name: 'Avery', hcp: '18', playingForMoney: true },   // a stroke on every hole
            { id: 102, name: 'Blake', hcp: '0', playingForMoney: true },
        ];
        const cd = [{ hole: 7, par: 4, hcpIndex: 9 }];
        const sc = { p101_h7: 5, p102_h7: 4 };
        const L = ledger(sb, round({ players: ps }), cd, sc).net;
        const h = L.holes[0];
        assert.equal(sb.getStrokes(9, 18), 1, 'An 18 handicap gets a stroke on index 9.');
        assert.equal(h.state, 'tie', 'Gross 5 with a stroke is net 4 — level with a gross 4.');
        assert.equal(h.low, 4);
        assert.equal(h.tiedPlayers.length, 2);
        // The ledger carries the net values, so the UI can say WHY it tied.
        const avery = h.scores.find(s => s.id === 101);
        assert.equal(avery.gross, 5);
        assert.equal(avery.net, 4);
    });

    test('the same hole on GROSS gives an outright winner', () => {
        const sb = engines();
        const ps = [
            { id: 101, name: 'Avery', hcp: '18', playingForMoney: true },
            { id: 102, name: 'Blake', hcp: '0', playingForMoney: true },
        ];
        const cd = [{ hole: 7, par: 4, hcpIndex: 9 }];
        const sc = { p101_h7: 5, p102_h7: 4 };
        const L = ledger(sb, round({ players: ps, skinsPotFormat: 'gross' }), cd, sc);
        assert.equal(L.net, null, 'A gross-only game has no net ledger.');
        assert.equal(L.gross.holes[0].state, 'skin');
        assert.equal(L.gross.holes[0].winner.name, 'Blake');
    });

    test('a stroke can hand the skin to the higher gross score', () => {
        const sb = engines();
        const ps = [
            { id: 101, name: 'Avery', hcp: '18', playingForMoney: true },
            { id: 102, name: 'Blake', hcp: '0', playingForMoney: true },
        ];
        const cd = [{ hole: 3, par: 4, hcpIndex: 2 }];
        const sc = { p101_h3: 5, p102_h3: 5 };
        const L = ledger(sb, round({ players: ps }), cd, sc).net;
        assert.equal(L.holes[0].winner.name, 'Avery', 'Net 4 beats net 5.');
        assert.equal(L.holes[0].low, 4);
    });
});

describe('CARRY / NO CARRY — the saved configuration is respected, not overridden', () => {

    test('NO CARRY: a tie voids the hole and nothing rolls forward', () => {
        const sb = engines();
        const ps = players(4), cd = course(3);
        const sc = scores(ps, cd, { p101_h2: 3 }, 5);   // H1 tie, H2 Avery, H3 tie
        const L = ledger(sb, round({ players: ps, skinsCarryOver: false }), cd, sc).net;
        assert.equal(L.carryOver, false);
        assert.equal(L.holes[0].state, 'tie');
        assert.equal(L.holes[0].unitsWon, 0, 'A voided hole is worth nothing.');
        assert.equal(L.holes[1].unitsWon, 1, 'The next hole is still worth exactly one — nothing carried in.');
        assert.equal(L.pendingUnits, 0);
    });

    test('CARRY: a tie rolls its unit into the next decided hole', () => {
        const sb = engines();
        const ps = players(4), cd = course(3);
        const sc = scores(ps, cd, { p101_h2: 3 }, 5);
        const L = ledger(sb, round({ players: ps, skinsCarryOver: true }), cd, sc).net;
        assert.equal(L.carryOver, true);
        assert.equal(L.holes[0].state, 'tie');
        assert.equal(L.holes[1].unitsWon, 2, 'H1 carried into H2.');
    });

    test('CARRY: a hole after a WAITING hole knows its winner but not its value', () => {
        const sb = engines();
        const ps = players(), cd = course(3);
        // H2 incomplete; H3 complete with an outright winner.
        const sc = scores(ps, cd, { p101_h3: 3 }, 5);
        [109, 110, 111, 112].forEach(id => { delete sc[`p${id}_h2`]; });
        const L = ledger(sb, round({ players: ps, skinsCarryOver: true }), cd, sc).net;
        assert.equal(L.holes[1].state, 'waiting');
        const h3 = L.holes[2];
        assert.equal(h3.official, true, 'H3 itself is complete.');
        assert.equal(h3.state, 'skin');
        assert.equal(h3.winner.name, 'Avery');
        assert.equal(h3.valueKnown, false, 'Its value depends on H2, which has not resolved.');
        assert.equal(h3.unitsWon, null, 'Guessing the units here would overstate the payout.');
    });

    test('NO CARRY: a hole after a waiting hole is fully known, because nothing rolls', () => {
        const sb = engines();
        const ps = players(), cd = course(3);
        const sc = scores(ps, cd, { p101_h3: 3 }, 5);
        [109, 110, 111, 112].forEach(id => { delete sc[`p${id}_h2`]; });
        const L = ledger(sb, round({ players: ps, skinsCarryOver: false }), cd, sc).net;
        assert.equal(L.holes[1].state, 'waiting');
        assert.equal(L.holes[2].valueKnown, true);
        assert.equal(L.holes[2].unitsWon, 1);
    });
});

describe('SCORE CORRECTIONS — every derived result moves with the score', () => {

    const setup = () => {
        const sb = engines();
        const ps = players(4), cd = course(3);
        return { sb, ps, cd };
    };

    test('winner → tie', () => {
        const { sb, ps, cd } = setup();
        const before = ledger(sb, round({ players: ps }), cd, scores(ps, cd, { p101_h1: 3 }, 5)).net;
        assert.equal(before.holes[0].state, 'skin');
        assert.equal(before.countsByPlayerId['101'], 1);

        const after = ledger(sb, round({ players: ps }), cd, scores(ps, cd, { p101_h1: 3, p102_h1: 3 }, 5)).net;
        assert.equal(after.holes[0].state, 'tie');
        assert.equal(after.holes[0].winner, null, 'The old winner must not linger.');
        assert.equal(after.countsByPlayerId['101'], 0, 'The skin count must drop with it.');
    });

    test('tie → winner', () => {
        const { sb, ps, cd } = setup();
        const before = ledger(sb, round({ players: ps }), cd, scores(ps, cd, {}, 5)).net;
        assert.equal(before.holes[0].state, 'tie');

        const after = ledger(sb, round({ players: ps }), cd, scores(ps, cd, { p103_h1: 3 }, 5)).net;
        assert.equal(after.holes[0].state, 'skin');
        assert.equal(after.holes[0].winner.name, 'Casey');
        assert.equal(after.countsByPlayerId['103'], 1);
    });

    test('winner A → winner B, with no duplicate skin left behind', () => {
        const { sb, ps, cd } = setup();
        const a = ledger(sb, round({ players: ps }), cd, scores(ps, cd, { p101_h1: 3 }, 5)).net;
        assert.equal(a.countsByPlayerId['101'], 1);
        assert.equal(a.countsByPlayerId['102'], 0);

        const b = ledger(sb, round({ players: ps }), cd, scores(ps, cd, { p101_h1: 5, p102_h1: 3 }, 5)).net;
        assert.equal(b.holes[0].winner.name, 'Blake');
        assert.equal(b.countsByPlayerId['101'], 0, 'Avery must not keep a skin he no longer owns.');
        assert.equal(b.countsByPlayerId['102'], 1);
        const total = Object.values(b.countsByPlayerId).reduce((x, y) => x + y, 0);
        assert.equal(total, 1, 'Exactly one skin exists on this hole, not two.');
    });
});

describe('ASYNCHRONOUS GROUPS — different paces do not block the field', () => {

    test('groups thru 14 / 14 / 13 → H1-H13 official, H14 waiting on group 3', () => {
        const sb = engines();
        const ps = players(), cd = course(18);
        const sc = scores(ps, cd, { p101_h13: 3 }, 5, { 1: 14, 2: 14, 3: 13 });
        const L = ledger(sb, round({ players: ps }), cd, sc).net;

        assert.equal(L.officialThru, 13);
        for (let i = 0; i < 13; i++) assert.equal(L.holes[i].official, true, `H${i + 1} should be official.`);
        const h14 = L.holes[13];
        assert.equal(h14.state, 'waiting');
        assert.deepEqual(plain(h14.missingGroups), [3]);
        assert.equal(L.firstWaiting.hole, 14);
        assert.equal(L.latest.hole, 13, 'The most recent decided hole is 13.');
        assert.equal(L.latest.winner.name, 'Avery');
    });

    test('when group 3 posts H14, it resolves without anything else changing', () => {
        const sb = engines();
        const ps = players(), cd = course(18);
        const partial = scores(ps, cd, { p101_h13: 3, p105_h14: 3 }, 5, { 1: 14, 2: 14, 3: 13 });
        const beforeThru = ledger(sb, round({ players: ps }), cd, partial).net.officialThru;
        assert.equal(beforeThru, 13);

        const complete = Object.assign({}, partial);
        [109, 110, 111, 112].forEach(id => { complete[`p${id}_h14`] = 5; });
        const L = ledger(sb, round({ players: ps }), cd, complete).net;
        assert.equal(L.officialThru, 14);
        assert.equal(L.holes[13].state, 'skin');
        assert.equal(L.holes[13].winner.name, 'Ellis');
        assert.equal(L.holes[12].winner.name, 'Avery', 'Earlier holes must be untouched.');
    });
});

describe('THE ANCHOR — one definition of who won a skin', () => {

    test('on a completed round the live ledger and settlement name the same winners', () => {
        // If this ever fails, two code paths are deciding who won a skin and one
        // of them is wrong. That is the duplication this batch exists to avoid.
        const sb = engines();
        const ps = players(12, [8, 12, 5, 18, 10, 14, 6, 20, 9, 16, 11, 7]);
        const cd = course(18);
        const spec = {};
        ps.forEach((p, pi) => cd.forEach((h, hi) => {
            spec[`p${p.id}_h${h.hole}`] = h.par + ((pi * 3 + hi * 5) % 4) - 1;
        }));
        const sc = scores(ps, cd, spec, 5);

        [true, false].forEach(carry => {
            const data = round({ players: ps, skinsCarryOver: carry, skinsBuyIn: 20 });
            const L = ledger(sb, data, cd, sc).net;
            const canonical = carry
                ? sb.computeSkinsCarryOverForSettle(ps, cd, sc, 'net')
                : sb.computeSkinsVoidForSettle(ps, cd, sc, 'net');

            const mine = L.holes.filter(r => r.state === 'skin')
                .map(r => `${r.hole}:${r.winner.id}:${r.unitsWon}`);
            const theirs = canonical.skins.map(s => `${s.hole}:${s.player.id}:${s.unitsWon}`);
            assert.deepEqual(plain(mine), plain(theirs), `carryOver=${carry}: live ledger and settlement disagree.`);
            assert.equal(L.pendingUnits, canonical.pendingUnits, `carryOver=${carry}: pending units disagree.`);
            assert.equal(L.officialThru, 18);
        });
    });

    test('the ledger reuses the settlement primitives rather than reimplementing them', () => {
        // Both slices are BOUNDED to their own function. Slicing to end-of-file made
        // this assertion fail the moment any later function in settlement-engine.js
        // legitimately used getStrokes - the skins ledger was untouched, it just was
        // no longer the last thing in the file. The rule being protected is about
        // buildSkinsLedgerFor's own body, so that is what gets read.
        const src = read('settlement-engine.js');
        const bounded = (name) => {
            const start = src.indexOf('function ' + name);
            assert.notEqual(start, -1, name + ' was renamed or removed');
            const end = src.indexOf('\n    function ', start + 10);
            return src.slice(start, end === -1 ? src.length : end);
        };
        const fn = bounded('buildSkinsLedgerFor');
        assert.match(fn, /getSkinsHoleScoresForSettle\(participants, savedScores, h\)/,
            'Hole scores (and therefore net strokes) must come from the canonical helper.');
        assert.doesNotMatch(fn, /getStrokes\(/, 'The ledger must not do its own handicap allocation.');
        assert.doesNotMatch(fn, /parseHcp\(/, 'The ledger must not parse handicaps itself.');

        const wrapper = bounded('computeSkinsHoleLedger');
        assert.match(wrapper, /fieldParticipants\(data\)/, 'Field must come from the canonical participant resolver.');
        assert.match(wrapper, /resolveSkinsMode\(data\)/, 'Mode must come from the canonical resolver.');
        assert.match(wrapper, /data\.skinsCarryOver !== false/, 'Carry must be read the same way settlement reads it.');
    });

    test('the existing settlement resolvers were not modified', () => {
        const src = read('settlement-engine.js');
        // The subset behaviour of the originals is deliberate and unchanged; the
        // ledger is what adds the official-hole concept on top.
        assert.match(src, /function computeSkinsCarryOverForSettle\(players, courseData, savedScores, scoreKey\) \{/);
        assert.match(src, /function computeSkinsVoidForSettle\(players, courseData, savedScores, scoreKey\) \{/);
        const carryFn = src.slice(src.indexOf('function computeSkinsCarryOverForSettle'), src.indexOf('function computeSkinsVoidForSettle'));
        assert.match(carryFn, /if \(holeScores\.length === 0\) return;/);
        assert.doesNotMatch(carryFn, /official/, 'The original resolver must stay exactly as it was.');
    });
});
