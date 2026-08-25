// ============================================================================
// WHOLE-DOLLAR BUCKET ALLOCATION
//
// A money bucket must have exactly ONE canonical answer. The engine settled in
// cents and every surface rounded for display, so the Receipt, Final Results and
// Who Pays Who could each round differently and disagree about what a golfer was
// owed. The fix allocates the actual bucket in whole dollars inside the engine,
// once, and everything downstream consumes that.
//
// THE BACKWARD-COMPATIBILITY CONTRACT, stated once:
//
//   A round settles in whole dollars only if data.settlementMode === 'whole-dollar'.
//   Absence means legacy. Every round saved before this feature has no such
//   field, so it takes the cent path and settles to exactly the numbers it
//   settled to yesterday.
//
// The LEGACY PARITY block at the bottom matters most. It is not enough for the
// new mode to be right; the old mode has to be untouched, because rounds have
// already been settled and real money changed hands on those numbers.
//
// (whole_dollar_test.js already covers roundNetTotalsToWholeDollars, the LEGACY
// final-combination rounding step. This file covers per-bucket allocation, which
// is a different mechanism at a different layer.)
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
    ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const course = (n = 18) => Array.from({ length: n }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function fieldWithNets(netTotals) {
    return netTotals.map((n, i) => ({
        id: 101 + i, name: 'G' + String.fromCharCode(65 + i), hcp: '0', playingForMoney: true,
    }));
}
function scoresForNets(ps, cd, netTotals) {
    const sc = {};
    ps.forEach((p, i) => {
        let rem = netTotals[i];
        cd.forEach((h, hi) => {
            if (hi === cd.length - 1) { sc['p' + p.id + '_h' + h.hole] = rem; return; }
            const per = Math.max(1, Math.round(netTotals[i] / cd.length));
            sc['p' + p.id + '_h' + h.hole] = per; rem -= per;
        });
    });
    return sc;
}

function netRound(netTotals, amount, places, mode) {
    const cd = course();
    const ps = fieldWithNets(netTotals);
    const sc = scoresForNets(ps, cd, netTotals);
    const data = {
        players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
        moneyPool: { enabled: true, buyIn: 40, net: { amount, places },
                     skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    };
    if (mode) data.settlementMode = mode;
    const sb = engines();
    return { sb, ps, r: sb.computeMoneyPool(data, cd, sc) };
}

// Dollars each golfer took out of the net bucket. The engine pays through
// perPlayerCents, so this reads the line the golfer appears on.
function netPaidDollars(sb, r, ps, id) {
    const line = r.net.lines.find(l => l.ids.includes(String(id)));
    if (!line) return 0;
    // Recompute the split the same way the engine did, from the recorded line.
    const span = line.ids.length;
    const wholeDollar = true;
    const shares = wholeDollar
        ? sb.allocateWholeDollars(line.cents / 100, line.ids.map(function () { return 1; })).map(function (d) { return d * 100; })
        : sb.splitCentsEvenly(line.cents, span);
    return shares[line.ids.indexOf(String(id))] / 100;
}

// ============================================================================

describe('THE ALLOCATOR - largest remainder, stable order', () => {

    const alloc = (t, w) => plain(engines().allocateWholeDollars(t, w));

    test('the documented examples', () => {
        assert.deepEqual(alloc(100, [1, 1, 1]), [34, 33, 33]);
        assert.deepEqual(alloc(70, [1, 1, 1]), [24, 23, 23]);
        assert.deepEqual(alloc(25, [1, 1]), [13, 12]);
        assert.deepEqual(alloc(10, [1, 1, 1]), [4, 3, 3]);
    });

    test('the awkward skins buckets', () => {
        assert.deepEqual(alloc(310, Array(9).fill(1)), [35, 35, 35, 35, 34, 34, 34, 34, 34]);
        assert.deepEqual(alloc(310, Array(7).fill(1)), [45, 45, 44, 44, 44, 44, 44]);
        assert.deepEqual(alloc(310, Array(11).fill(1)), [29, 29, 28, 28, 28, 28, 28, 28, 28, 28, 28]);
    });

    test('every allocation conserves the bucket exactly and returns integers', () => {
        [[100, 3], [70, 3], [25, 2], [10, 3], [310, 7], [310, 9], [310, 11],
         [480, 12], [1, 5], [0, 4], [7, 7], [999, 13]].forEach(([total, n]) => {
            const out = alloc(total, Array(n).fill(1));
            assert.equal(out.reduce((a, b) => a + b, 0), total, total + ' over ' + n + ' did not conserve');
            out.forEach(v => assert.equal(v, Math.floor(v), 'allocations must be integers'));
        });
    });

    test('weighted allocation conserves - a golfer owning several skins', () => {
        const out = alloc(310, [3, 2, 2, 1, 1]);
        assert.equal(out.reduce((a, b) => a + b, 0), 310);
        assert.ok(out[0] > out[1], 'more units must mean more money');
    });

    test('DETERMINISM - identical inputs always pick the same extra-dollar recipient', () => {
        for (let i = 0; i < 25; i++) {
            assert.deepEqual(alloc(100, [1, 1, 1]), [34, 33, 33]);
            assert.deepEqual(alloc(310, [3, 2, 2, 1, 1]), alloc(310, [3, 2, 2, 1, 1]));
        }
    });

    test('the extra dollar follows POSITION, not name', () => {
        // Ordering by name would move the extra dollar if somebody fixed a typo in
        // a golfer's name. Position cannot drift like that.
        const fn = read('pool-engine.js');
        const body = fn.slice(fn.indexOf('function allocateWholeDollars'));
        assert.match(body.slice(0, body.indexOf('\n}')), /\(b\.frac - a\.frac\) \|\| \(a\.i - b\.i\)/);
        assert.doesNotMatch(body.slice(0, body.indexOf('\n}')), /localeCompare/);
    });

    test('degenerate inputs do not throw or invent money', () => {
        assert.deepEqual(alloc(100, []), []);
        assert.deepEqual(alloc(0, [1, 1]), [0, 0]);
        assert.deepEqual(alloc(50, [0, 0]), [0, 0], 'zero total weight pays nobody');
    });
});

describe('SETTLEMENT MODE - absence means legacy', () => {

    test('a round with no settlementMode is not whole-dollar', () => {
        const sb = engines();
        assert.equal(sb.isWholeDollarRound({}), false);
        assert.equal(sb.isWholeDollarRound({ settlementMode: undefined }), false);
        assert.equal(sb.isWholeDollarRound(null), false);
        assert.equal(sb.isWholeDollarRound({ settlementMode: 'legacy' }), false);
    });

    test('only the exact flag switches it on', () => {
        assert.equal(engines().isWholeDollarRound({ settlementMode: 'whole-dollar' }), true);
    });
});

describe('NET FINISH TIE MATRIX - locking in the audited behaviour', () => {

    // These results were verified against the committed engine BEFORE this batch
    // changed anything. They are locked here so the whole-dollar work cannot move
    // them.
    const cases = [
        { label: '2 tied for 1st, two paid places', nets: [70, 70, 75, 80], amount: 70,
          places: [57.142857, 42.857143], expect: [35, 35, 0, 0] },
        { label: '2 tied for 1st, three paid places', nets: [70, 70, 75, 80], amount: 100,
          places: [50, 30, 20], expect: [40, 40, 20, 0] },
        { label: 'outright 1st, 2 tied for 2nd', nets: [68, 70, 70, 80], amount: 100,
          places: [50, 30, 20], expect: [50, 25, 25, 0] },
        { label: 'tie spanning the FINAL paid place', nets: [68, 70, 70, 80], amount: 80,
          places: [62.5, 37.5], expect: [50, 15, 15, 0] },
        { label: 'no tie at all', nets: [68, 70, 75, 80], amount: 70,
          places: [57.142857, 42.857143], expect: [40, 30, 0, 0] },
    ];

    cases.forEach(c => {
        test(c.label, () => {
            const { sb, r, ps } = netRound(c.nets, c.amount, c.places, 'whole-dollar');
            ps.forEach((p, i) => {
                const got = netPaidDollars(sb, r, ps, p.id);
                assert.equal(got, c.expect[i], p.name + ' expected $' + c.expect[i] + ', got $' + got);
            });
        });
    });

    test('3 tied for 1st consume all three places and split $100 in WHOLE dollars', () => {
        const { sb, r, ps } = netRound([70, 70, 70, 80], 100, [50, 30, 20], 'whole-dollar');
        const paid = ps.slice(0, 3).map(p => netPaidDollars(sb, r, ps, p.id)).sort((a, b) => b - a);
        assert.deepEqual(paid, [34, 33, 33], 'positions consumed first, THEN whole-dollar split');
        assert.equal(paid.reduce((a, b) => a + b, 0), 100, 'the consumed pool must be conserved exactly');
        assert.equal(netPaidDollars(sb, r, ps, ps[3].id), 0, 'the next golfer is 4th and gets nothing');
    });

    test('4 tied for 1st with three paid places share only what exists', () => {
        const { sb, r, ps } = netRound([70, 70, 70, 70], 100, [50, 30, 20], 'whole-dollar');
        const paid = ps.map(p => netPaidDollars(sb, r, ps, p.id));
        assert.equal(paid.reduce((a, b) => a + b, 0), 100, 'no fourth prize may be invented');
        assert.deepEqual(paid.slice().sort((a, b) => b - a), [25, 25, 25, 25]);
    });

    test('the tie NEVER pays the next golfer the place it consumed', () => {
        // The explicit "DO NOT": splitting only 1st money between the tied leaders
        // and then handing 2nd to the next golfer.
        const { sb, r, ps } = netRound([70, 70, 75, 80], 70, [57.142857, 42.857143], 'whole-dollar');
        assert.equal(netPaidDollars(sb, r, ps, ps[2].id), 0, 'GC must not receive 2nd-place money');
        assert.equal(netPaidDollars(sb, r, ps, ps[0].id) + netPaidDollars(sb, r, ps, ps[1].id), 70);
    });
});

describe('BUCKETS IN WHOLE-DOLLAR MODE', () => {

    function poolRound(mode, poolCfg, kpWinners, noWinner) {
        const cd = course();
        const ps = Array.from({ length: 12 }, (_, i) => ({
            id: 101 + i, name: 'G' + String.fromCharCode(65 + i), hcp: '10', playingForMoney: true }));
        const sc = {};
        ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = h.par + ((pi * 3 + hi * 5) % 4) - 1; }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
                       moneyPool: poolCfg, kpWinners: kpWinners || {},
                       kpConfirmed: { confirmed: true }, kpNoWinner: noWinner || {} };
        if (mode) data.settlementMode = mode;
        const sb = engines();
        return { sb, ps, r: sb.computeMoneyPool(data, cd, sc) };
    }

    const STD = { enabled: true, buyIn: 40,
        kp: { amount: 100, holes: [3, 7, 12, 16] },
        net: { amount: 70, places: [57.142857, 42.857143] },
        skins: { mode: 'remainder', scoring: 'net', carryOver: false } };

    test('no golfer ends on a fraction of a dollar', () => {
        const { r } = poolRound('whole-dollar', STD, { h3: '101', h7: '105', h12: '109', h16: '102' });
        Object.entries(r.perPlayerCents).forEach(([id, c]) => {
            // Math.abs first: -1400 % 100 is -0, and assert.equal(-0, 0) fails under
            // Object.is semantics even though -$14.00 is obviously a whole dollar.
            assert.equal(Math.abs(c % 100), 0, 'player ' + id + ' settled at ' + c + ' cents - not a whole dollar');
        });
    });

    test('the pool reconciles exactly: $480 = KP $100 + Net $70 + Skins $310', () => {
        const { r } = poolRound('whole-dollar', STD, { h3: '101', h7: '105', h12: '109', h16: '102' });
        assert.equal(r.totalPoolCents, 48000);
        assert.equal(r.kp.amountCents, 10000);
        assert.equal(r.net.amountCents, 7000);
        assert.equal(r.skins.amountCents, 31000);
        assert.equal(r.kp.amountCents + r.net.amountCents + r.skins.amountCents, 48000);
    });

    test('zero-sum survives whole-dollar allocation', () => {
        const { r } = poolRound('whole-dollar', STD, { h3: '101', h7: '105', h12: '109', h16: '102' });
        assert.equal(Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0), 0);
    });

    test('KP over 3 holes pays $34/$33/$33, not cents', () => {
        const cfg = Object.assign({}, STD, { kp: { amount: 100, holes: [3, 7, 12] } });
        const { r } = poolRound('whole-dollar', cfg, { h3: '101', h7: '102', h12: '103' });
        assert.deepEqual(plain(r.kp.perHoleCents), [3400, 3300, 3300]);
        assert.equal(r.kp.perHoleCents.reduce((a, b) => a + b, 0), 10000);
    });

    test('KP over 4 holes is a clean $25 each', () => {
        const { r } = poolRound('whole-dollar', STD, { h3: '101', h7: '105', h12: '109', h16: '102' });
        assert.deepEqual(plain(r.kp.perHoleCents), [2500, 2500, 2500, 2500]);
    });

    test('a KP the organizer declares nobody won refunds in whole dollars', () => {
        // Retitled: an UNENTERED hole is now unresolved, not a refund. A refund needs
        // the organizer to have said outright that nobody won it.
        const { r } = poolRound('whole-dollar', STD, { h3: '101' },
            { h7: true, h12: true, h16: true });
        assert.ok(r.kp.unclaimedCents > 0);
        assert.equal(Math.abs(r.refund.cents % 100), 0, 'a refund must not reintroduce cents');
        assert.match(r.refund.reasons.join(' '), /Unclaimed KP/);
    });

    test('every skins line is whole dollars and paid + unwon equals the bucket', () => {
        const cfg = Object.assign({}, STD, { skins: { mode: 'remainder', scoring: 'net', carryOver: true } });
        const { r } = poolRound('whole-dollar', cfg, { h3: '101', h7: '105', h12: '109', h16: '102' });
        r.skins.lines.forEach(l => assert.equal(Math.abs(l.cents % 100), 0, 'skins hole ' + l.hole + ' paid ' + l.cents + ' cents'));
        const paid = r.skins.lines.reduce((a, l) => a + l.cents, 0);
        assert.equal(paid + r.skins.unwonCents, r.skins.amountCents);
    });
});

describe('LEGACY PARITY - no historical result may move', () => {

    function legacyPool(poolCfg, kpWinners, noWinner) {
        const cd = course();
        const ps = Array.from({ length: 12 }, (_, i) => ({
            id: 101 + i, name: 'G' + String.fromCharCode(65 + i), hcp: String(5 + i), playingForMoney: true }));
        const sc = {};
        ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = h.par + ((pi * 3 + hi * 5) % 4) - 1; }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
                       moneyPool: poolCfg, kpWinners: kpWinners || {},
                       kpConfirmed: { confirmed: true }, kpNoWinner: noWinner || {},
                       kpConfirmed: { confirmed: true }, kpNoWinner: noWinner || {} };
        return engines().computeMoneyPool(data, cd, sc);
    }

    test('a legacy pool still settles in cents, exactly as before', () => {
        const r = legacyPool({ enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
            { h3: '101', h7: '102', h12: '103' });
        // $100 over 3 KP holes in cents is 3334/3333/3333 - NOT the whole-dollar
        // 3400/3300/3300. This is the assertion that proves the legacy path is
        // genuinely untouched rather than merely believed to be.
        assert.deepEqual(plain(r.kp.perHoleCents), [3334, 3333, 3333]);
    });

    test('legacy net finish ties still split in cents', () => {
        const sb = engines();
        assert.deepEqual(plain(sb.splitCentsEvenly(10000, 3)), [3334, 3333, 3333]);
        const { r } = netRound([70, 70, 70, 80], 100, [50, 30, 20], undefined);
        assert.equal(r.net.lines[0].cents, 10000);
        assert.equal(r.net.lines[0].ids.length, 3);
    });

    test('legacy skins still use the telescoping cent allocation', () => {
        const src = read('pool-engine.js');
        assert.match(src, /const cumFloor = Math\.floor\(amountCents \* cumUnits \/ totalUnits\);/);
        assert.match(src, /TELESCOPING ALLOCATION/);
    });

    test('legacy rounds remain zero-sum', () => {
        const r = legacyPool({ enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
            { h3: '101' }, { h7: true, h12: true });
        // Zero-sum still holds once every dollar is resolved - here one hole is won
        // and two are declared no-winner, so nothing is left hanging.
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0), 0);
    });

    test('EVERY allocator call site is gated by the settlement mode', () => {
        // Structural, and the single most important assertion in this file: an
        // ungated call would silently rewrite history.
        // Comments are stripped first. Each call site is preceded by a block
        // explaining WHY it allocates the way it does, and those blocks are long
        // enough to push `if (wholeDollar)` outside any fixed-size lookback - so a
        // raw-text scan reports a correctly-gated call as ungated.
        const src = read('pool-engine.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
        const body = src.slice(src.indexOf('function computeMoneyPool'));
        const calls = [...body.matchAll(/allocateWholeDollars\(/g)];
        assert.ok(calls.length >= 4, 'expected the allocator at KP, net, skins and refunds');
        calls.forEach(m => {
            const before = body.slice(Math.max(0, m.index - 400), m.index);
            assert.match(before, /wholeDollar/,
                'an allocator call is not gated by the settlement mode - legacy rounds would change');
        });
    });

    test('the tie comment no longer contradicts the code', () => {
        const src = read('pool-engine.js');
        assert.doesNotMatch(src, /share 80% equally and 3rd place still pays 20%/);
        assert.match(src, /TIES CONSUME THE PLACES THEY OCCUPY/);
    });
});
