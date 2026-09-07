// ============================================================================
// A NASSAU SETTLES AT THE STAKES IT WAS SET UP WITH
//
// A wager typed as "$10 front, $10 back, $20 overall" saved perfectly:
//     frontStake:10  backStake:10  overallStake:20  stake:20
// and then settled every segment at $20. Worse, every auto-press off a segment
// inherited the collapsed stake and the presses cascade - so on a lopsided round a
// $40 Nassau paid $200. The delta is a MULTIPLE, not a fixed overcharge, and it
// scales with how aggressively the presses ran.
//
// THE ENGINE ALWAYS KNEW HOW. calculateMatchEngine takes a tenth argument,
// stakeConfig = { F9, B9, '18', autoPress }, and prices each segment from it;
// money-engine ships the builder, nassauStakeConfig(), and its own comment calls
// the side-match shape "the supported path today". Three call sites simply never
// passed it. This is a dead wire in the money path, not bad arithmetic - no
// formula changes anywhere.
//
// TWO THINGS THIS SUITE GUARDS, AND THE SECOND IS THE ONE THAT MATTERS MOST.
//
//   MONEY THAT MUST NOT MOVE. A legacy single-stake wager and a uniform
//   $20/$20/$20 wager must settle byte-identically after the change. Old rounds
//   re-settle on every load, so a fix that quietly moved them would rewrite
//   history that was already paid in cash.
//
//   THE STRIP AND THE RECEIPT MUST AGREE. They agree today because both are
//   wrong. A fix that corrected the receipt and left the live view collapsed
//   would be worse than the bug: a golfer would watch one number all afternoon
//   and be handed a different one at the bar. The side-match wager reaches the
//   live view through sideMatchRoundConfig(), which flattened it to a single
//   `stake` and dropped the per-segment fields - so that flattening has to stop
//   being lossy, or the two surfaces diverge.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const M = loadJsFile('money-engine.js', ['handicap.js']);
const SE = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
const BS = loadJsFile('bet-strip.js', ['handicap.js', 'money-engine.js', 'action-model.js']);

const nassauStakeConfig = vm.runInContext('nassauStakeConfig', M);
const calculateMatchEngine = vm.runInContext('calculateMatchEngine', M);
const sideMatchRoundConfig = vm.runInContext('sideMatchRoundConfig', BS);
const buildSideActionRows = vm.runInContext('buildSideActionRows', BS);

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Marty Sharp', hcp: '0', playingForMoney: true },
           { id: 102, name: 'Manny Orozco', hcp: '0', playingForMoney: true }];
// Marty wins every front-nine hole, the back is halved. That makes the front-nine
// press cascade fire, which is where the multiple comes from.
const SCORES = (() => {
    const s = {};
    CD.forEach(h => { s['p101_h' + h.hole] = 4; s['p102_h' + h.hole] = h.hole <= 9 ? 5 : 4; });
    return s;
})();
// Shaped exactly as buildNassauWagerPayload writes it, including the collapsed
// `stake` field it always sets alongside the three segment stakes. Leaving `stake`
// off made a uniform wager settle to zero and looked like the fix had broken it;
// no wager the app creates is ever missing it.
const wager = extra => {
    const w = Object.assign({
        format: 'nassau', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'],
        startHole: 1, pressRule: '2down'
    }, extra);
    if (w.stake === undefined) w.stake = w.overallStake;
    return w;
};
const roundWith = sm => ({ players: P, courseData: CD, scores: SCORES,
    settlementMode: 'whole-dollar', sideMatches: { K1: sm } });

// Every segment stake the ENGINE prices, in order. The thing that was collapsing.
const segmentStakes = stakeConfig => (calculateMatchEngine(
        P.map((p, i) => Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })),
        CD, SCORES, 'gross', 'nassau', '2down', 20, 0, [], stakeConfig
    ).activeMatches || []).map(m => m.label + '=' + m.stake);

describe('THE BUILDER READS BOTH SHAPES', () => {

    test('a SIDE MATCH wager yields its three stakes', () => {
        assert.deepEqual(
            Object.assign({}, nassauStakeConfig(wager({ frontStake: 10, backStake: 10, overallStake: 20 }))),
            { F9: 10, B9: 10, '18': 20, autoPress: undefined });
    });

    test('a LEGACY ROUND-FORMAT Nassau yields the same', () => {
        assert.deepEqual(
            Object.assign({}, nassauStakeConfig({ gameFormat: 'nassau', nassauFrontStake: 10,
                nassauBackStake: 10, nassauOverallStake: 20 })),
            { F9: 10, B9: 10, '18': 20, autoPress: undefined });
    });

    test('a custom auto-press amount rides along', () => {
        assert.equal(nassauStakeConfig(wager({ frontStake: 10, backStake: 10,
            overallStake: 20, autoPressStake: 5 })).autoPress, 5);
    });

    test('a wager with nothing per-segment yields undefined, so legacy is untouched', () => {
        assert.equal(nassauStakeConfig(wager({ stake: 20 })), undefined);
    });
});

describe('MONEY THAT MUST NOT MOVE', () => {

    // These two are the guard against the fix rewriting rounds already paid in cash.
    test('a LEGACY single-stake wager settles exactly as it does today', () => {
        const today = segmentStakes(undefined);
        const after = segmentStakes(nassauStakeConfig(wager({ stake: 20 })));
        assert.deepEqual(Array.from(after), Array.from(today));
        assert.ok(today.length > 3, 'the fixture produced no presses, so this proves little');
    });

    test('a UNIFORM $20/$20/$20 wager settles exactly as it does today', () => {
        const today = segmentStakes(undefined);
        const after = segmentStakes(nassauStakeConfig(
            wager({ frontStake: 20, backStake: 20, overallStake: 20 })));
        assert.deepEqual(Array.from(after), Array.from(today));
    });

    test('and a SPLIT wager is the only one that changes', () => {
        const today = segmentStakes(undefined);
        const after = segmentStakes(nassauStakeConfig(
            wager({ frontStake: 10, backStake: 10, overallStake: 20 })));
        assert.notDeepEqual(Array.from(after), Array.from(today),
            'the split-stake wager settles the same as before, so nothing was fixed');
        assert.ok(after.some(s => /Front 9=10/.test(s)), 'the front nine is not priced at $10: '
            + JSON.stringify(after));
        assert.ok(after.some(s => /Total=20/.test(s)), 'the overall lost its $20');
        // The press cascade is the multiplier. Front-nine presses must be $10 too.
        assert.ok(after.filter(s => /Press/.test(s) && /=10$/.test(s)).length > 0,
            'presses off the front nine are still priced at the overall stake: '
            + JSON.stringify(after));
    });
});

describe('THE RECEIPT PRICES EACH SEGMENT', () => {

    const receiptStakes = sm => {
        const r = SE.computeCombinedNetTotals(roundWith(sm), CD, SCORES);
        const lines = [];
        Object.keys(r.contributions).forEach(k =>
            (r.contributions[k].lines || []).forEach(l => { if (!l.rounding) lines.push(l.label); }));
        return lines;
    };
    const receiptNet = sm => {
        const r = SE.computeCombinedNetTotals(roundWith(sm), CD, SCORES);
        const v = Object.values(r.netByName).filter(x => x.name === 'Marty Sharp')[0];
        return v ? v.net : 0;
    };

    test('a split-stake Nassau no longer settles at the overall stake', () => {
        const split = receiptNet(wager({ frontStake: 10, backStake: 10, overallStake: 20 }));
        const uniform = receiptNet(wager({ frontStake: 20, backStake: 20, overallStake: 20 }));
        assert.ok(split < uniform,
            'a $10/$10/$20 wager pays the same as $20/$20/$20 - the stakes are still collapsed '
            + '(split=' + split + ', uniform=' + uniform + ')');
    });

    test('a legacy single-stake receipt is unchanged', () => {
        assert.equal(receiptNet(wager({ stake: 20 })),
                     receiptNet(wager({ frontStake: 20, backStake: 20, overallStake: 20 })),
            'legacy and uniform must settle identically');
    });

    test('and the receipt still itemises the wager', () => {
        assert.ok(receiptStakes(wager({ frontStake: 10, backStake: 10, overallStake: 20 }))
            .some(l => /Side Match/.test(l)), 'the Nassau vanished from the receipt');
    });
});

describe('THE PRINTED SEGMENTS, WHICH ARE A SECOND PATH', () => {

    // buildSideMatchReceipts is what puts "Front 9 · $10" on the page, and it calls
    // the engine at its OWN call site - separate from the one that produces the net
    // totals. Removing stakeConfig from it alone changed no net and no test noticed,
    // while the receipt on screen went back to charging $20 a segment.
    const buildSideMatchReceipts = vm.runInContext('buildSideMatchReceipts', SE);
    const segmentsOf = sm => {
        const rs = buildSideMatchReceipts(roundWith(sm), CD, SCORES) || [];
        const out = [];
        rs.forEach(r => (r.segments || []).forEach(seg => out.push(seg.label + '=' + seg.stake)));
        return out;
    };

    test('the printed Front 9 line carries the front-nine stake', () => {
        const segs = segmentsOf(wager({ frontStake: 10, backStake: 10, overallStake: 20 }));
        assert.ok(segs.length, 'the receipt printed no segments at all');
        assert.ok(segs.some(x => x === 'Front 9=10'),
            'the printed receipt still charges the overall stake on the front nine: '
            + JSON.stringify(segs));
    });

    test('and the two press streams print at their own prices', () => {
        const segs = segmentsOf(wager({ frontStake: 10, backStake: 10, overallStake: 20 }));
        const presses = segs.filter(x => /^Press/.test(x));
        assert.ok(presses.some(x => /=10$/.test(x)) && presses.some(x => /=20$/.test(x)),
            'every printed press is priced the same, so the cascade still multiplies: '
            + JSON.stringify(presses));
    });

    test('a legacy wager prints exactly as it always did', () => {
        assert.deepEqual(Array.from(segmentsOf(wager({ stake: 20 }))),
                         Array.from(segmentsOf(wager({ frontStake: 20, backStake: 20, overallStake: 20 }))));
    });
});

describe('THE LEGACY ROUND-FORMAT NASSAU HAS A LIVE VIEW TOO', () => {

    // A round whose FORMAT is Nassau reaches the strip through a different call than
    // a side-match wager does. money-engine already settled that shape from its
    // per-segment stakes; the strip did not, so the two disagreed all afternoon on a
    // round nobody could see was mispriced.
    const buildBetStrip = vm.runInContext('buildBetStrip', BS);
    const legacyRound = extra => Object.assign({
        gameFormat: 'nassau', nassauScoring: 'gross', nassauPressRule: '2down',
        nassauStake: 20, players: P.map((p, i) => Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })),
        courseData: CD, scores: SCORES
    }, extra);

    test('the strip prices its segments from the round’s own stakes', () => {
        const strip = buildBetStrip(legacyRound({ nassauFrontStake: 10, nassauBackStake: 10,
            nassauOverallStake: 20 }), CD, SCORES, null);
        assert.ok(strip && strip.chips && strip.chips.length, 'the strip produced no chips');
        const stakes = strip.chips.map(c => c.stake);
        assert.ok(stakes.some(v => v === 10),
            'the live view prices every segment at the overall stake: ' + JSON.stringify(stakes));
    });

    test('and a legacy round with one stake is unchanged', () => {
        const a = buildBetStrip(legacyRound({}), CD, SCORES, null).chips.map(c => c.stake);
        const b = buildBetStrip(legacyRound({ nassauFrontStake: 20, nassauBackStake: 20,
            nassauOverallStake: 20 }), CD, SCORES, null).chips.map(c => c.stake);
        assert.deepEqual(Array.from(a), Array.from(b));
    });
});

describe('THE LIVE STRIP AND THE RECEIPT AGREE — the property that matters', () => {

    // The side-match wager reaches the live view through this flattening. If it
    // drops the per-segment stakes, the strip prices everything at the overall
    // while the receipt prices each segment, and a golfer watches one number all
    // afternoon and is handed another at the bar.
    test('the flattening is not lossy', () => {
        const sm = wager({ frontStake: 10, backStake: 10, overallStake: 20, stake: 20 });
        const cfg = sideMatchRoundConfig(sm, P.map((p, i) =>
            Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })));
        assert.ok(cfg, 'the side match produced no live config at all');
        assert.deepEqual(
            Object.assign({}, nassauStakeConfig(cfg)),
            Object.assign({}, nassauStakeConfig(sm)),
            'the live view is handed a wager whose per-segment stakes have been dropped');
    });

    test('a custom auto-press survives the flattening too', () => {
        const sm = wager({ frontStake: 10, backStake: 10, overallStake: 20, autoPressStake: 5, stake: 20 });
        const cfg = sideMatchRoundConfig(sm, P.map((p, i) =>
            Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })));
        assert.equal(nassauStakeConfig(cfg).autoPress, 5);
    });

    // THE DISAGREEMENT ITSELF. Not "the receipt is right" - that the two surfaces
    // report the same prices as each other.
    test('THE STRIP AND THE RECEIPT QUOTE THE SAME STAKES', () => {
        const sm = wager({ frontStake: 10, backStake: 10, overallStake: 20, stake: 20 });
        const rows = buildSideActionRows(roundWith(sm), CD, SCORES, P, 101) || [];
        const stripStakes = [];
        rows.forEach(r => (r.presses || []).concat(r.chips || []).forEach(c => {
            if (c && typeof c.stake === 'number') stripStakes.push(c.stake);
        }));
        const cfg = sideMatchRoundConfig(sm, P.map((p, i) =>
            Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })));
        const stripPrices = segmentStakes(nassauStakeConfig(cfg));
        const receiptPrices = segmentStakes(nassauStakeConfig(sm));
        assert.deepEqual(Array.from(stripPrices), Array.from(receiptPrices),
            'the live strip and the receipt price this wager differently:\n'
            + '  strip:   ' + JSON.stringify(stripPrices) + '\n'
            + '  receipt: ' + JSON.stringify(receiptPrices));
    });

    test('they agree on a legacy wager as well', () => {
        const sm = wager({ stake: 20 });
        const cfg = sideMatchRoundConfig(sm, P.map((p, i) =>
            Object.assign({}, p, { team: i === 0 ? 'Team 1' : 'Team 2' })));
        assert.deepEqual(Array.from(segmentStakes(nassauStakeConfig(cfg))),
                         Array.from(segmentStakes(nassauStakeConfig(sm))));
    });
});
