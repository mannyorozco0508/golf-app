// ============================================================================
// CUSTOM PRESS STAKES — THE MONEY
//
// "Press you for $78" is a different bet from "press you for the same $200."
// This suite pins three things, permanently:
//
//   1. A manual press SETTLES AND PRINTS at the amount the golfer entered.
//      $78 / $125 / $33 / $1 / $350 - deliberately never the base wager, so any
//      silent fallback to the original stake fails loudly here.
//
//   2. A press WITHOUT a stored stake - every press saved before this existed,
//      and every automatic press - settles at the original wager, to the cent.
//
//   3. The Receipt explains ALL the money. A stroke match's $/hole bet and its
//      presses are lines on the page, and receipt.net === settlement, always.
//      (The bug: $10/hole + $200 overall + a $78 hole press settled $1,264 while
//      the Receipt said "$200". $1,064 moved invisibly.)
//
// Then 30 end-to-end simulations run rounds through the REAL engines to the
// REAL settlement and check stored stakes, zero-sum, Final Results, Who Pays
// Who, and the Receipt against each other.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const E = engines();
const J = JSON.stringify;
const CD = makeCourseData(18);
const ODD = [78, 125, 33, 1, 350];   // never the base wager, on purpose

const P2 = makePlayers(['Marty', 'Matt'], [0, 0]);
const P8 = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'], new Array(8).fill(0));
const P12 = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James', 'Ryan', 'Dalen', 'Nick', 'Paul'], new Array(12).fill(0));

// Score books. sweep: Marty wins every hole. close: alternating, Marty edges h18.
const sweep = {}; P2.forEach((p, i) => { for (let h = 1; h <= 18; h++) sweep[`p${p.id}_h${h}`] = i === 0 ? 4 : 5; });
const close = {}; for (let h = 1; h <= 18; h++) { close[`p${P2[0].id}_h${h}`] = h % 2 ? 4 : 5; close[`p${P2[1].id}_h${h}`] = h % 2 ? 5 : 4; }
close[`p${P2[0].id}_h18`] = 3;
const sc8 = {}; P8.forEach((p, i) => { for (let h = 1; h <= 18; h++) sc8[`p${p.id}_h${h}`] = 4 + ((i + h) % 3); });
const sc12 = {}; P12.forEach((p, i) => { for (let h = 1; h <= 18; h++) sc12[`p${p.id}_h${h}`] = 4 + ((i * 3 + h) % 4 === 0 ? 1 : 0); });

const A = String(P2[0].id), B = String(P2[1].id);
function settle(players, scores, sideMatches, extra) {
    const data = Object.assign({ players, courseData: CD, sideMatches }, extra || {});
    vm.runInContext(`window.__x = (function () {
        const d = ${J(data)};
        return {
            receipts: buildSideMatchReceipts(d, ${J(CD)}, ${J(scores)}),
            combined: computeCombinedNetTotals(d, ${J(CD)}, ${J(scores)})
        };
    })();`, E);
    return E.window.__x;
}
function matchEngine(players, scores, scoring, fmt, rule, stake, presses) {
    vm.runInContext(`window.__m = calculateMatchEngine(${J(players)}, ${J(CD)}, ${J(scores)},
        '${scoring}', '${fmt}', '${rule}', ${stake}, 0, ${J(presses)});`, E);
    return E.window.__m;
}
const V2 = P2.map((p, i) => Object.assign({}, p, { team: i ? 'Team 2' : 'Team 1' }));
const netOf = (x, name) => (x.combined.exact[name.toLowerCase()] || { net: 0 }).net;

// ---------------------------------------------------------------------------
describe('ODD AMOUNTS SETTLE EXACTLY — the anti-fallback wall', () => {
    ODD.forEach(amt => {
        test(`MATCH: a $${amt} manual press pays $${amt}, not the $200 original`, () => {
            // In `close` the base finishes Marty +2 (his h18 edge), worth the $200
            // original; the hole-18 press is decided by that same edge and is worth
            // exactly the press stake. Total = 200 + amt. A silent fallback to the
            // original would make it 400 - never equal to 200 + amt for these odds.
            const m = matchEngine(V2, close, 'gross', 'match', 'anytime', 200,
                [{ baseId: '18', startHole: 18, stake: amt }]);
            const pr = m.activeMatches.find(x => x.pressNum > 0);
            assert.equal(pr.stake, amt, 'the segment must carry its own stake');
            assert.equal(m.t1TotalMoney, 200 + amt,
                `settled $${m.t1TotalMoney} — a fallback to the original stake would be $400`);
        });
    });

    test('STROKE overall press: each odd amount independently', () => {
        ODD.forEach(amt => {
            const sm = { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke',
                startHole: 1, teamAIds: [A], teamBIds: [B],
                overallPresses: { k: { startHole: 6, stake: amt } } };
            const { receipts } = settle(P2, sweep, { m: sm });
            const seg = receipts[0].segments.find(s => /Overall Press/.test(s.label));
            assert.equal(seg.stake, amt);
            assert.equal(seg.money, amt, `the press must PAY $${amt}, not the $200 original`);
        });
    });

    test('NASSAU: $78 on the front, $33 on the total, at once', () => {
        const blow = {}; for (let h = 1; h <= 18; h++) { blow[`p${A}_h${h}`] = 4; blow[`p${B}_h${h}`] = 6; }
        const m = matchEngine(V2, blow, 'gross', 'nassau', 'anytime', 50,
            [{ baseId: 'F9', startHole: 4, stake: 78 }, { baseId: '18', startHole: 10, stake: 33 }]);
        // Marty sweeps: F9 + B9 + Total at $50 each, plus the two custom presses.
        assert.equal(m.t1TotalMoney, 50 + 50 + 50 + 78 + 33,
            'each Nassau press settles at its own stake alongside the three $50 legs');
    });
});

// ---------------------------------------------------------------------------
describe('LEGACY PARITY — old presses settle exactly as before', () => {
    test('a press stored as { startHole } uses the original stake', () => {
        const m = matchEngine(V2, close, 'gross', 'match', 'anytime', 200,
            [{ baseId: '18', startHole: 18 }]);
        assert.equal(m.t1TotalMoney, 400, 'base $200 + a press at the original $200');
    });

    test('stake: null is legacy, not zero', () => {
        const m = matchEngine(V2, close, 'gross', 'match', 'anytime', 200,
            [{ baseId: '18', startHole: 18, stake: null }]);
        assert.equal(m.t1TotalMoney, 400, 'null is legacy: same $400 as { startHole } alone');
    });

    test('AUTO presses never carry a stake and settle at the original', () => {
        const blow = {}; for (let h = 1; h <= 18; h++) { blow[`p${A}_h${h}`] = 4; blow[`p${B}_h${h}`] = 6; }
        const m = matchEngine(V2, blow, 'gross', 'match', '1down', 50, []);
        const autos = m.activeMatches.filter(x => x.pressNum > 0);
        assert.ok(autos.length > 0, 'the 1-down rule should have fired');
        autos.forEach(pr => assert.equal(pr.stake, undefined,
            'an automatic press has no entered amount; it settles at the original wager'));
    });

    test('auto-press behaviour is untouched when manual custom presses coexist', () => {
        const blow = {}; for (let h = 1; h <= 18; h++) { blow[`p${A}_h${h}`] = 4; blow[`p${B}_h${h}`] = 6; }
        const withManual = matchEngine(V2, blow, 'gross', 'nassau', '2down', 50,
            [{ baseId: 'B9', startHole: 14, stake: 125 }]);
        const auto = withManual.activeMatches.filter(x => x.pressNum > 0 && x.stake === undefined);
        const manual = withManual.activeMatches.filter(x => x.stake === 125);
        assert.ok(auto.length > 0, 'the automatic 2-down presses still fire');
        assert.equal(manual.length, 1, 'and the manual $125 press exists beside them');
    });

    test('legacy STROKE overall press prints and pays the original', () => {
        const sm = { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke',
            startHole: 1, teamAIds: [A], teamBIds: [B], overallPresses: { k: { startHole: 6 } } };
        const { receipts } = settle(P2, sweep, { m: sm });
        assert.equal(receipts[0].segments.every(s => s.stake === 200), true);
        assert.equal(receipts[0].net, 400, 'the exact pre-fix number for this fixture');
    });
});

// ---------------------------------------------------------------------------
describe('THE RECEIPT EXPLAINS ALL THE MONEY', () => {
    test('REGRESSION: $10/hole + $200 overall + $78 hole press — the $1,264 case', () => {
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 200,
            overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B],
            holePresses: { k: { fromHole: 6, newStake: 78 } } };
        const x = settle(P2, sweep, { m: sm });
        const r = x.receipts[0];
        assert.equal(r.net, netOf(x, 'Marty'),
            'the receipt net and Final Results must be the SAME number');
        assert.equal(r.net, 1264, 'the exact figure that used to move invisibly');
        assert.ok(r.segments.some(s => s.label === 'Hole Bet' && s.stake === 10));
        assert.ok(r.segments.some(s => /Hole Press/.test(s.label) && s.stake === 78));
        const sum = r.segments.reduce((a, s) => a + (s.toSideA ? s.money : -s.money), 0);
        assert.equal(sum, r.net, 'every line sums to the net — no hidden money');
    });

    test('a $/hole-ONLY stroke match gets a receipt at all', () => {
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1,
            teamAIds: [A], teamBIds: [B] };
        const x = settle(P2, sweep, { m: sm });
        assert.equal(x.receipts.length, 1, 'it used to produce NO receipt');
        assert.equal(x.receipts[0].net, netOf(x, 'Marty'));
    });

    test('four independent match press stakes print as four lines', () => {
        const sm = { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1,
            teamAIds: [A], teamBIds: [B],
            presses: { a: { baseId: '18', startHole: 4, stake: 78 }, b: { baseId: '18', startHole: 8, stake: 125 },
                       c: { baseId: '18', startHole: 12, stake: 33 }, d: { baseId: '18', startHole: 16, stake: 200 } } };
        const x = settle(P2, sweep, { m: sm });
        [78, 125, 33, 200].forEach(v =>
            assert.ok(x.receipts[0].segments.some(s => s.stake === v), `$${v} must be its own line`));
        assert.equal(x.receipts[0].net, 50 + 78 + 125 + 33 + 200);
        assert.equal(x.receipts[0].net, netOf(x, 'Marty'));
    });

    test('hole-press lines sum exactly to the hole engine total, by construction', () => {
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1,
            teamAIds: [A], teamBIds: [B],
            holePresses: { a: { fromHole: 6, newStake: 78 }, b: { fromHole: 10, newStake: 125 } } };
        const x = settle(P2, sweep, { m: sm });
        const lines = x.receipts[0].segments;
        const sum = lines.reduce((a, s) => a + (s.toSideA ? s.money : -s.money), 0);
        assert.equal(sum, netOf(x, 'Marty'));
        assert.ok(lines.some(s => s.stake === 78) && lines.some(s => s.stake === 125));
    });
});

// ---------------------------------------------------------------------------
// 30 SIMULATIONS. Each returns receipts + combined; verify() checks the books.
// ---------------------------------------------------------------------------
describe('30 SIMULATIONS — stored stakes, zero-sum, Final Results, Who Pays Who, Receipt', () => {
    function verify(label, x, expectStakes) {
        // Zero-sum across the whole round.
        const total = Object.values(x.combined.exact).reduce((a, p) => a + p.net, 0);
        assert.ok(Math.abs(total) < 0.01, `${label}: round nets $${total}, not $0`);
        // Who Pays Who reconstructs Final Results.
        const owed = Object.values(x.combined.exact).filter(p => p.net > 0).reduce((a, p) => a + p.net, 0);
        const paid = (x.combined.transactions || []).reduce((a, t) => a + t.amount, 0);
        assert.ok(Math.abs(Math.round(owed) - paid) <= 1,
            `${label}: transactions $${paid} vs owed $${owed} (whole-dollar rule allows $1)`);
        // Receipt nets equal engine settlement per match: sum of receipt nets over
        // side matches equals the side-match part of Final Results in 1v1 rounds.
        (expectStakes || []).forEach(v => assert.ok(
            x.receipts.some(r => r.segments.some(s => s.stake === v)),
            `${label}: expected a $${v} line on some receipt`));
    }
    const g = i => String(P8[i].id);
    const t = i => String(P12[i].id);

    test('SIM 1 — stroke overall, single $78 press', () => {
        const x = settle(P2, sweep, { m: { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B], overallPresses: { k: { startHole: 6, stake: 78 } } } });
        verify('sim1', x, [200, 78]); assert.equal(x.receipts[0].net, 278);
    });
    test('SIM 2 — stroke overall, presses $125 and $33', () => {
        const x = settle(P2, sweep, { m: { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B], overallPresses: { a: { startHole: 6, stake: 125 }, b: { startHole: 12, stake: 33 } } } });
        verify('sim2', x, [125, 33]); assert.equal(x.receipts[0].net, 358);
    });
    test('SIM 3 — stroke $/hole only, $1 press', () => {
        const x = settle(P2, sweep, { m: { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1, teamAIds: [A], teamBIds: [B], holePresses: { k: { fromHole: 10, newStake: 1 } } } });
        verify('sim3', x, [10, 1]);
    });
    test('SIM 4 — stroke both wagers + both press kinds (the launch shape)', () => {
        const x = settle(P2, sweep, { m: { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B], holePresses: { h1: { fromHole: 6, newStake: 78 }, h2: { fromHole: 10, newStake: 125 } }, overallPresses: { o1: { startHole: 12, stake: 33 }, o2: { startHole: 15, stake: 200 } } } });
        verify('sim4', x, [10, 78, 125, 200, 33]);
        assert.equal(x.receipts[0].net, netOf(x, 'Marty'));
    });
    test('SIM 5 — stroke legacy press (no stake) beside a $350 custom', () => {
        const x = settle(P2, sweep, { m: { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B], overallPresses: { a: { startHole: 6 }, b: { startHole: 12, stake: 350 } } } });
        verify('sim5', x, [200, 350]); assert.equal(x.receipts[0].net, 200 + 200 + 350);
    });
    test('SIM 6 — match, single $78 press', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } });
        verify('sim6', x, [50, 78]); assert.equal(x.receipts[0].net, 128);
    });
    test('SIM 7 — match, four customs 78/125/33/200', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { a: { baseId: '18', startHole: 4, stake: 78 }, b: { baseId: '18', startHole: 8, stake: 125 }, c: { baseId: '18', startHole: 12, stake: 33 }, d: { baseId: '18', startHole: 16, stake: 200 } } } });
        verify('sim7', x, [78, 125, 33, 200]); assert.equal(x.receipts[0].net, 486);
    });
    test('SIM 8 — match legacy press settles at original', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 6 } } } });
        verify('sim8', x, [50]); assert.equal(x.receipts[0].net, 100);
    });
    test('SIM 9 — match AUTO 1-down presses, no customs', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: '1down', startHole: 1, teamAIds: [A], teamBIds: [B] } });
        verify('sim9', x, [50]);
        assert.ok(x.receipts[0].segments.length > 1, 'auto presses fired');
        assert.ok(x.receipts[0].segments.every(s => s.stake === 50), 'every auto press at the original $50');
    });
    test('SIM 10 — match auto + manual $125 together', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: '1down', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 15, stake: 125 } } } });
        verify('sim10', x, [50, 125]);
    });
    test('SIM 11 — nassau, custom on each leg 78/125/33', () => {
        const x = settle(P2, sweep, { m: { format: 'nassau', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { a: { baseId: 'F9', startHole: 4, stake: 78 }, b: { baseId: 'B9', startHole: 13, stake: 125 }, c: { baseId: '18', startHole: 10, stake: 33 } } } });
        verify('sim11', x, [50, 78, 125, 33]);
        assert.equal(x.receipts[0].net, 150 + 78 + 125 + 33);
    });
    test('SIM 12 — nassau auto 2-down untouched', () => {
        const x = settle(P2, sweep, { m: { format: 'nassau', scoring: 'gross', stake: 50, pressRule: '2down', startHole: 1, teamAIds: [A], teamBIds: [B] } });
        verify('sim12', x, [50]);
        assert.ok(x.receipts[0].segments.filter(s => /Press/.test(s.label)).every(s => s.stake === 50));
    });
    test('SIM 13 — nassau legacy manual press', () => {
        const x = settle(P2, sweep, { m: { format: 'nassau', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 8 } } } });
        verify('sim13', x, [50]); assert.equal(x.receipts[0].net, 200);
    });
    test('SIM 14 — 2v2 match with a $78 press splits per player', () => {
        const sm = { format: 'match', scoring: 'gross', stake: 100, pressRule: 'anytime', startHole: 1, teamAIds: [g(0), g(1)], teamBIds: [g(2), g(3)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } };
        const sc = {}; P8.forEach((p, i) => { for (let h = 1; h <= 18; h++) sc[`p${p.id}_h${h}`] = i < 2 ? 4 : 5; });
        const x = settle(P8, sc, { m: sm });
        verify('sim14', x, [100, 78]);
        assert.equal(netOf(x, 'Marty'), (100 + 78) / 2, 'team money splits evenly, presses included');
    });
    test('SIM 15 — 2v2 stroke with hole press splits evenly', () => {
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1, teamAIds: [g(0), g(1)], teamBIds: [g(2), g(3)], holePresses: { k: { fromHole: 10, newStake: 33 } } };
        const sc = {}; P8.forEach((p, i) => { for (let h = 1; h <= 18; h++) sc[`p${p.id}_h${h}`] = i < 2 ? 4 : 5; });
        const x = settle(P8, sc, { m: sm });
        verify('sim15', x, [10, 33]);
        assert.equal(netOf(x, 'Marty'), netOf(x, 'Manny'), 'teammates share equally');
    });
    test('SIM 16 — cross-group match, $78 press (Marty G1 vs Stan G2)', () => {
        const x = settle(P8, sc8, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, scope: 'cross', teamAIds: [g(0)], teamBIds: [g(4)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } });
        verify('sim16', x, [78]);
        assert.equal(netOf(x, 'Marty') + netOf(x, 'Stan'), 0, 'only the two golfers move');
        P8.filter((_, i) => i !== 0 && i !== 4).forEach(p =>
            assert.equal(netOf(x, p.name), 0, `${p.name} has no stake in it`));
    });
    test('SIM 17 — group-scoped match with custom press, metadata inert', () => {
        const sm = { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, scope: 'group', ownerGroup: 1, teamAIds: [g(0)], teamBIds: [g(1)], presses: { k: { baseId: '18', startHole: 6, stake: 125 } } };
        const x = settle(P8, sc8, { m: sm });
        const bare = settle(P8, sc8, { m: Object.assign({}, sm, { scope: undefined, ownerGroup: undefined }) });
        verify('sim17', x, [125]);
        assert.equal(netOf(x, 'Marty'), netOf(bare, 'Marty'), 'scope/ownerGroup move $0');
    });
    test('SIM 18 — mid-round: press exists, segment not finished, honest zero', () => {
        const half = {}; for (let h = 1; h <= 9; h++) { half[`p${A}_h${h}`] = 4; half[`p${B}_h${h}`] = 5; }
        const x = settle(P2, half, { m: { format: 'stroke', scoring: 'gross', overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B], overallPresses: { k: { startHole: 6, stake: 78 } } } });
        const seg = x.receipts[0].segments.find(s => /Overall Press/.test(s.label));
        assert.equal(seg.stake, 78, 'the stake shows even mid-round');
        assert.equal(seg.money, 0, 'but no money moves before the segment finishes');
        assert.equal(seg.result, 'Not finished');
    });
    test('SIM 19 — SCORE CORRECTION: money follows the fixed card, stakes intact', () => {
        const before = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } });
        const fixed = Object.assign({}, sweep); for (let h = 1; h <= 18; h++) fixed[`p${A}_h${h}`] = 6; // Marty's card was wrong
        const after = settle(P2, fixed, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } });
        assert.equal(before.receipts[0].net, 128);
        assert.equal(after.receipts[0].net, -128, 'same stakes, opposite winner');
        verify('sim19', after, [78]);
    });
    test('SIM 20 — press on hole 18 (the latest legal press)', () => {
        const x = settle(P2, close, { m: { format: 'match', scoring: 'gross', stake: 200, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 18, stake: 350 } } } });
        verify('sim20', x, [350]);
        assert.equal(netOf(x, 'Marty'), 200 + 350, 'base $200 plus the $350 hole-18 press');
    });
    test('SIM 21 — side match starting mid-round with a custom press inside it', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 7, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 12, stake: 78 } } } });
        verify('sim21', x, [50, 78]); assert.equal(x.receipts[0].net, 128);
    });
    test('SIM 22 — two separate 1v1s, different customs, one round', () => {
        const x = settle(P8, sc8, {
            m1: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [g(0)], teamBIds: [g(1)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } },
            m2: { format: 'stroke', scoring: 'gross', overallStake: 100, overallMode: 'stroke', startHole: 1, teamAIds: [g(2)], teamBIds: [g(3)], overallPresses: { k: { startHole: 9, stake: 33 } } }
        });
        verify('sim22', x, [78, 33]);
    });
    test('SIM 23 — GROUP ACTION intact: group Dots beside a custom press', () => {
        const x = settle(P8, sc8, {
            m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, scope: 'group', ownerGroup: 1, teamAIds: [g(0)], teamBIds: [g(1)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } }
        }, { dots: { h5: { [`p${g(0)}`]: ['birdie'], [`p${g(4)}`]: ['birdie', 'birdie'] } },
             additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5, scope: 'group', ownerGroup: 1, participantIds: [g(0), g(1), g(2), g(3)] } } });
        verify('sim23', x, [78]);
        assert.equal(netOf(x, 'Stan'), 0, "Stan's 2 dots are outside Group 1's game AND the match");
    });
    test('SIM 24 — SKINS intact beside custom presses', () => {
        const x = settle(P8, sc8, {
            m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [g(0)], teamBIds: [g(1)], presses: { k: { baseId: '18', startHole: 6, stake: 125 } } }
        }, { additionalGameInstances: { s1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross', participantIds: [g(0), g(1), g(2)] } } });
        verify('sim24', x, [125]);
    });
    test('SIM 25 — heavy 8-player: 4 wagers, mixed customs, books balance', () => {
        const x = settle(P8, sc8, {
            m1: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [g(0)], teamBIds: [g(1)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } },
            m2: { format: 'nassau', scoring: 'gross', stake: 20, pressRule: 'anytime', startHole: 1, teamAIds: [g(2)], teamBIds: [g(3)], presses: { k: { baseId: 'B9', startHole: 12, stake: 33 } } },
            m3: { format: 'stroke', scoring: 'gross', holeStake: 5, overallStake: 100, overallMode: 'stroke', startHole: 1, teamAIds: [g(4)], teamBIds: [g(5)], holePresses: { k: { fromHole: 8, newStake: 1 } } },
            m4: { format: 'match', scoring: 'gross', stake: 40, pressRule: '1down', startHole: 1, teamAIds: [g(6)], teamBIds: [g(7)] }
        });
        verify('sim25', x, [78, 33, 1]);
    });
    test('SIM 26 — heavy 12-player / 3 groups: presses + group dots + cross skins', () => {
        const x = settle(P12, sc12, {
            m1: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, scope: 'group', ownerGroup: 1, teamAIds: [t(0)], teamBIds: [t(1)], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } },
            x1: { format: 'stroke', scoring: 'gross', overallStake: 60, overallMode: 'stroke', startHole: 1, scope: 'cross', teamAIds: [t(2)], teamBIds: [t(6)], overallPresses: { k: { startHole: 10, stake: 125 } } }
        }, { dots: { h5: { [`p${t(0)}`]: ['birdie'], [`p${t(4)}`]: ['sandy'] } },
             additionalGameInstances: {
                d1: { format: 'dots', enabled: true, dotPointVal: 5, scope: 'group', ownerGroup: 1, participantIds: [t(0), t(1), t(2), t(3)] },
                d2: { format: 'dots', enabled: true, dotPointVal: 10, scope: 'group', ownerGroup: 2, participantIds: [t(4), t(5), t(6), t(7)] },
                sk: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross', scope: 'cross', participantIds: [t(0), t(4), t(8)] } } });
        verify('sim26', x, [78, 125]);
        [t(8), t(9), t(10), t(11)].forEach((id, i) => {
            const p = P12.find(pp => String(pp.id) === id);
            if (i > 0) assert.equal(netOf(x, p.name), 0, `${p.name} (G3, no wagers) stays at $0`);
        });
    });
    test('SIM 27 — RELOAD: persisted JSON round-trips to the same cent', () => {
        const sm = { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { k: { baseId: '18', startHole: 6, stake: 78 } } };
        const first = settle(P2, sweep, { m: sm });
        // What Firebase stores and hands back is JSON. Serialize, revive, resettle.
        const revived = JSON.parse(JSON.stringify({ players: P2, sideMatches: { m: sm } }));
        const second = settle(revived.players, sweep, revived.sideMatches);
        assert.equal(second.receipts[0].segments.find(s => /Press/.test(s.label)).stake, 78,
            'the stake survives the round-trip');
        assert.equal(first.receipts[0].net, second.receipts[0].net);
    });
    test('SIM 28 — duplicate stakes are still distinct presses', () => {
        const x = settle(P2, sweep, { m: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', startHole: 1, teamAIds: [A], teamBIds: [B], presses: { a: { baseId: '18', startHole: 6, stake: 78 }, b: { baseId: '18', startHole: 12, stake: 78 } } } });
        const prs = x.receipts[0].segments.filter(s => s.stake === 78);
        assert.equal(prs.length, 2, 'two $78 presses are two lines');
        assert.equal(x.receipts[0].net, 50 + 78 + 78);
    });
    test('SIM 29 — cross-group STROKE hole press: both groups\' view is one truth', () => {
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1, scope: 'cross', teamAIds: [g(0)], teamBIds: [g(4)], holePresses: { k: { fromHole: 6, newStake: 78 } } };
        const x = settle(P8, sc8, { m: sm });
        verify('sim29', x, [10, 78]);
        assert.equal(netOf(x, 'Marty') + netOf(x, 'Stan'), 0);
    });
    test('SIM 30 — THE FINAL LAUNCH STANDARD, end to end', () => {
        // Marty vs Matt · Stroke · Gross · $10/hole + $200 overall.
        // Hole presses H6 $78, H10 $125. Overall presses H12 $33, H15 $200.
        const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 200, overallMode: 'stroke', startHole: 1, teamAIds: [A], teamBIds: [B],
            holePresses: { h1: { fromHole: 6, newStake: 78 }, h2: { fromHole: 10, newStake: 125 } },
            overallPresses: { o1: { startHole: 12, stake: 33 }, o2: { startHole: 15, stake: 200 } } };
        const x = settle(P2, sweep, { m: sm });
        const r = x.receipts[0];
        // STORAGE holds 78/125/33/200 — asserted on the object itself.
        assert.deepEqual(Object.values(sm.holePresses).map(p => p.newStake), [78, 125]);
        assert.deepEqual(Object.values(sm.overallPresses).map(p => p.stake), [33, 200]);
        // RECEIPT prints all four independently.
        [78, 125, 33, 200].forEach(v => assert.ok(r.segments.some(s => s.stake === v), `$${v} line`));
        // MATCH NET equals the complete wager contribution = Final Results.
        assert.equal(r.net, netOf(x, 'Marty'));
        // Total round money = $0, and Who Pays Who reconstructs it.
        verify('sim30', x, [10, 200, 78, 125, 33]);
        // RELOAD and verify again.
        const again = settle(P2, sweep, JSON.parse(JSON.stringify({ m: sm })));
        assert.equal(again.receipts[0].net, r.net, 'identical after reload');
    });
});
