// ============================================================================
// FINAL ACCEPTANCE — 20 deterministic simulations
//
// THE QUESTION THIS FILE ANSWERS
//
//   Could the group throw away the paper scorecards and reconstruct every score
//   and every dollar from the app alone?
//
// Each simulation below is a complete round run through the real engines. Every
// one is checked against the same invariant set, because a money app fails
// quietly: a dropped press or a double-counted note does not throw, it just
// makes one golfer $78 poorer than they should be and nobody notices until the
// car park.
//
// THE INVARIANTS, stated once:
//
//   conservation   the Money Pool's buckets account for every buy-in dollar
//   zero-sum       every golfer's net, summed, is exactly 0
//   ledger parity  each golfer's MOVING lines sum to their FINAL NET
//   note safety    NOTE lines explain, never add - counting them would break parity
//   settlement     Who Pays Who reconstructs every balance exactly
//   integers       whole-dollar mode produces no cents anywhere
//
// A simulation is only meaningful if it actually exercises what it claims, so
// several assert their own shape first - that a tie really tied, that a press
// really paid - rather than passing vacuously on a round where nothing happened.
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
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

const NAMES = ['Avery','Blake','Casey','Devon','Ellis','Finley','Gray','Harper','Indigo','Jordan','Kendall','Logan'];
const course = (n = 18) => Array.from({length:n},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const groupOf = id => Math.floor((Number(id)-101)/4)+1;

// The generic acceptance shape: 12 golfers, 3 groups of 4, $480 pool.
function round(opts = {}) {
    const {
        // `mode: null` means LEGACY. Passing `mode: undefined` would silently take the
        // default below - a destructuring default fires on undefined - and the "legacy"
        // simulation would quietly have run in whole-dollar mode, passing for the wrong
        // reason. null is explicit and cannot be confused with "not specified".
        hcps = null, scoreFn = null, thru = null, mode = 'whole-dollar',
        pool = {}, kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' },
        sideMatches = {}, games = null, dots = null, n = 12, kpNoWinner = null,
    } = opts;

    const cd = course();
    const ps = NAMES.slice(0, n).map((name,i)=>({
        id: 101+i, name, hcp: String(hcps ? hcps[i] : 0), playingForMoney: true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{
        if (thru && h.hole > (thru[groupOf(p.id)] || 0)) return;
        sc['p'+p.id+'_h'+h.hole] = scoreFn ? scoreFn(pi,hi,h) : h.par + ((pi*3+hi*5)%4) - 1;
    }));

    const data = {
        players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
        moneyPool: Object.assign({ enabled:true, buyIn:40,
            kp: { amount:100, holes:[3,7,12,16] },
            net: { amount:70, places:[57.142857,42.857143] },
            skins: { mode:'remainder', scoring:'net', carryOver:false } }, pool),
        kpWinners, sideMatches,
        // A finished round has had its KPs confirmed. Under the unresolved-KP model
        // an unconfirmed KP bucket is deliberately withheld, so a fixture that means
        // "this round is complete" has to say so - otherwise it is asserting the very
        // state Wave B exists to block.
        kpConfirmed: { confirmed: true },
    };
    if (kpNoWinner) data.kpNoWinner = kpNoWinner;
    // Absent, not undefined: a legacy round must have NO settlementMode key at all,
    // which is exactly the shape every round saved before Wave 2A has.
    if (mode) data.settlementMode = mode;
    if (games) data.additionalGameInstances = games;
    if (dots) data.dots = dots;

    const sb = engines();
    return {
        sb, ps, cd, sc, data,
        pool: sb.computeMoneyPool(data, cd, sc),
        combined: sb.computeCombinedNetTotals(data, cd, sc),
    };
}

// Every invariant, applied to one simulation.
function assertSound(label, r, { wholeDollar = true } = {}) {
    const { pool, combined } = r;

    if (pool && pool.valid) {
        const buckets = (pool.kp ? pool.kp.amountCents : 0)
                      + (pool.net ? pool.net.amountCents : 0)
                      + (pool.skins ? pool.skins.amountCents : 0);
        assert.equal(buckets, pool.totalPoolCents, `${label}: pool buckets do not account for the buy-ins`);
        assert.equal(Object.values(pool.perPlayerCents).reduce((a,b)=>a+b,0), 0,
            `${label}: pool is not zero-sum`);
    }

    const nets = Object.values(combined.netByName);
    assert.equal(nets.reduce((a,v)=>a+v.net,0), 0, `${label}: round is not zero-sum`);

    Object.values(combined.contributions).forEach(c => {
        const moving = c.lines.filter(l => !l.note).reduce((a,l)=>a+l.amount,0);
        assert.ok(Math.abs(moving - c.net) < 0.005,
            `${label}: ${c.name}'s lines sum to ${moving} but FINAL NET is ${c.net}`);
        const all = c.lines.reduce((a,l)=>a+l.amount,0);
        const notes = c.lines.filter(l=>l.note).reduce((a,l)=>a+l.amount,0);
        assert.ok(Math.abs((all - notes) - c.net) < 0.005, `${label}: ${c.name}'s NOTE lines are double-counting`);
        if (wholeDollar) assert.equal(c.net, Math.round(c.net), `${label}: ${c.name} settled on cents`);
    });

    const moved = {};
    combined.transactions.forEach(t => {
        moved[t.from] = (moved[t.from]||0) - t.amount;
        moved[t.to] = (moved[t.to]||0) + t.amount;
        if (wholeDollar) assert.equal(t.amount, Math.round(t.amount), `${label}: a transaction carried cents`);
    });
    Object.values(combined.contributions).forEach(c => {
        assert.ok(Math.abs(c.net - (moved[c.name]||0)) < 0.005,
            `${label}: Who Pays Who does not reconstruct ${c.name}`);
    });

    assert.equal(Object.keys(combined.contributions).length, Object.keys(combined.netByName).length,
        `${label}: a golfer is missing from the ledger`);
}

const SM_SAME  = { format:'match', scoring:'net', stake:50, startHole:1, createdAt:1,
                   teamAIds:['101'], teamBIds:['102'],
                   presses:{ a:{ startHole:6, stake:78 }, b:{ startHole:10, stake:125 } } };
const SM_CROSS = { format:'stroke', scoring:'net', holeStake:5, overallStake:200, startHole:1, createdAt:2,
                   teamAIds:['101','102'], teamBIds:['105','106'],
                   overallPresses:{ p:{ startHole:6, stake:78 } },
                   holePresses:{ q:{ fromHole:10, newStake:125 } } };
const GAMES = { d1:{ format:'dots', enabled:true, startHole:1, dotPointVal:2,
                     scope:'group', ownerGroup:1, participantIds:['101','102','103','104'] } };
const DOTS  = { h1:{ p101:['greenie'], p103:['sandy'] }, h4:{ p102:['greenie'] } };

// ============================================================================

describe('20 DETERMINISTIC SIMULATIONS', () => {

    test('1. standard 12-player $480 round', () => {
        const r = round();
        assert.equal(r.pool.totalPoolCents, 48000);
        assert.equal(r.pool.kp.amountCents, 10000);
        assert.equal(r.pool.net.amountCents, 7000);
        assert.equal(r.pool.skins.amountCents, 31000);
        assertSound('sim1', r);
    });

    test('2. every skins hole has a unique winner', () => {
        // Golfer i wins hole i, cycling - so every hole resolves outright.
        const r = round({ scoreFn: (pi,hi,h) => (pi === hi % 12) ? h.par - 1 : h.par });
        assert.equal(r.pool.skins.lines.length, 18, 'every hole should have produced a skin');
        assertSound('sim2', r);
    });

    test('3. several no-carry skin ties', () => {
        const r = round({ scoreFn: (pi,hi,h) => (hi % 3 === 0) ? h.par : (pi === 0 ? h.par-1 : h.par) });
        assert.ok(r.pool.skins.lines.length > 0 && r.pool.skins.lines.length < 18,
            'this round must contain both wins and ties');
        assertSound('sim3', r);
    });

    test('4. every skins hole tied — the whole pot refunds', () => {
        const r = round({ scoreFn: (pi,hi,h) => h.par });
        assert.equal(r.pool.skins.lines.length, 0);
        assert.equal(r.pool.skins.unwonCents, 31000, 'an unwon pot must refund, never vanish');
        assertSound('sim4', r);
    });

    test('5. one golfer dominates the skins', () => {
        const r = round({ scoreFn: (pi,hi,h) => pi === 0 ? h.par - 2 : h.par });
        assert.equal(r.pool.skins.lines.length, 18);
        assert.ok(r.pool.skins.lines.every(l => String(l.winnerId) === '101'));
        assertSound('sim5', r);
    });

    test('6. many different skins winners', () => {
        const r = round({ scoreFn: (pi,hi,h) => (pi === (hi * 5) % 12) ? h.par - 1 : h.par });
        const winners = new Set(r.pool.skins.lines.map(l => String(l.winnerId)));
        assert.ok(winners.size >= 6, `expected a spread of winners, got ${winners.size}`);
        assertSound('sim6', r);
    });

    test('7. groups at 15 / 14 / 13 holes', () => {
        const r = round({ thru: { 1:15, 2:14, 3:13 } });
        const led = r.sb.computeSkinsHoleLedger(
            Object.assign({}, r.data, { participantIds: r.pool.participants.map(p=>String(p.id)),
                                        skinsPotFormat:'net', skinsCarryOver:false }),
            r.cd, r.sc, { groupOf });
        assert.equal(led.net.officialThru, 13, 'only holes every participant has posted may be official');
        assert.equal(led.net.holes[13].state, 'waiting');
        assertSound('sim7', r);
    });

    test('8. a late group score resolves a waiting hole', () => {
        const before = round({ thru: { 1:15, 2:14, 3:13 } });
        const cfg = d => Object.assign({}, d, { participantIds: before.pool.participants.map(p=>String(p.id)),
                                                skinsPotFormat:'net', skinsCarryOver:false });
        assert.equal(before.sb.computeSkinsHoleLedger(cfg(before.data), before.cd, before.sc, {groupOf}).net.officialThru, 13);

        const sc = Object.assign({}, before.sc);
        [109,110,111,112].forEach(id => { sc['p'+id+'_h14'] = 4; });
        const after = before.sb.computeSkinsHoleLedger(cfg(before.data), before.cd, sc, {groupOf});
        assert.equal(after.net.officialThru, 14, 'the hole must resolve the moment the last card lands');
    });

    test('9. a handicap stroke changes a NET skin winner', () => {
        const gross = round({ hcps: NAMES.map(() => 0), scoreFn: (pi,hi,h) => h.par + (pi === 0 ? 1 : 0) });
        const net   = round({ hcps: NAMES.map((_,i) => i === 0 ? 18 : 0), scoreFn: (pi,hi,h) => h.par + (pi === 0 ? 1 : 0) });
        assert.notDeepEqual(
            gross.pool.skins.lines.map(l=>String(l.winnerId)),
            net.pool.skins.lines.map(l=>String(l.winnerId)),
            'a stroke a hole must change who wins a net skin');
        assertSound('sim9', net);
    });

    test('10. score correction: winner becomes a tie', () => {
        const base = round({ scoreFn: (pi,hi,h) => (pi === 0 && hi === 0) ? h.par-1 : h.par });
        assert.equal(base.pool.skins.lines.filter(l=>l.hole===1).length, 1);
        const sc = Object.assign({}, base.sc, { p102_h1: base.cd[0].par - 1 });
        const after = base.sb.computeMoneyPool(base.data, base.cd, sc);
        assert.equal(after.skins.lines.filter(l=>l.hole===1).length, 0, 'the skin must disappear with the tie');
    });

    test('11. score correction: tie becomes a winner', () => {
        const base = round({ scoreFn: (pi,hi,h) => h.par });
        assert.equal(base.pool.skins.lines.length, 0);
        const sc = Object.assign({}, base.sc, { p103_h1: base.cd[0].par - 1 });
        const after = base.sb.computeMoneyPool(base.data, base.cd, sc);
        assert.equal(after.skins.lines.filter(l=>l.hole===1 && String(l.winnerId)==='103').length, 1);
    });

    test('12. score correction: winner A becomes winner B', () => {
        const base = round({ scoreFn: (pi,hi,h) => (pi === 0 && hi === 0) ? h.par-1 : h.par });
        const sc = Object.assign({}, base.sc, { p101_h1: base.cd[0].par, p102_h1: base.cd[0].par - 1 });
        const after = base.sb.computeMoneyPool(base.data, base.cd, sc);
        const h1 = after.skins.lines.filter(l => l.hole === 1);
        assert.equal(h1.length, 1, 'exactly one skin on the hole, not two');
        assert.equal(String(h1[0].winnerId), '102');
    });

    test('13. outright Net Finish 1st and 2nd', () => {
        const r = round({ scoreFn: (pi,hi,h) => h.par + pi });
        assert.equal(r.pool.net.lines.length, 2);
        assert.equal(r.pool.net.lines[0].ids.length, 1);
        assert.equal(r.pool.net.lines[0].cents, 4000);
        assert.equal(r.pool.net.lines[1].cents, 3000);
        assertSound('sim13', r);
    });

    test('14. two tied for 1st on $40/$30 — the tie takes both places', () => {
        const r = round({ scoreFn: (pi,hi,h) => h.par + (pi < 2 ? 0 : pi) });
        const l = r.pool.net.lines;
        assert.equal(l.length, 1, 'the tie consumed both paid places');
        assert.equal(l[0].ids.length, 2);
        assert.equal(l[0].cents, 7000, '$40 + $30 shared');
        const each = r.sb.allocateWholeDollars(70, [1,1]);
        assert.deepEqual(JSON.parse(JSON.stringify(each)), [35,35]);
        assertSound('sim14', r);
    });

    test('15. three-way tie with an indivisible whole-dollar payout', () => {
        const r = round({
            pool: { net: { amount:100, places:[50,30,20] } },
            scoreFn: (pi,hi,h) => h.par + (pi < 3 ? 0 : pi),
        });
        const l = r.pool.net.lines;
        assert.equal(l[0].ids.length, 3);
        assert.equal(l[0].cents, 10000, 'positions 1-3 consumed');
        const each = JSON.parse(JSON.stringify(r.sb.allocateWholeDollars(100, [1,1,1])));
        assert.deepEqual(each, [34,33,33]);
        assert.equal(each.reduce((a,b)=>a+b,0), 100);
        assertSound('sim15', r);
    });

    test('16. multiple KPs with an uneven split', () => {
        const r = round({ pool: { kp: { amount:100, holes:[3,7,12] } },
                          kpWinners: { h3:'101', h7:'105', h12:'109' }, kpConfirmed: { confirmed: true } });
        assert.deepEqual(JSON.parse(JSON.stringify(r.pool.kp.perHoleCents)), [3400,3300,3300]);
        assert.equal(r.pool.kp.perHoleCents.reduce((a,b)=>a+b,0), 10000);
        assertSound('sim16', r);
    });

    test('17. a KP the organizer declares nobody won refunds to the field', () => {
        // Retitled: an UNENTERED hole is unresolved now. A refund requires the
        // organizer to have said outright that nobody won it.
        const r = round({ kpWinners: { h3:'101' }, kpConfirmed: { confirmed: true },
                          kpNoWinner: { h7:true, h12:true, h16:true } });
        assert.ok(r.pool.kp.unclaimedCents > 0);
        assert.equal(r.pool.kpUnresolvedCents, 0, 'every hole was decided');
        assert.match(r.pool.refund.reasons.join(' '), /Unclaimed KP/);
        assertSound('sim17', r);
    });

    test('18. Group Dots alongside the Money Pool', () => {
        const r = round({ games: GAMES, dots: DOTS });
        const dotsLines = Object.values(r.combined.contributions)
            .flatMap(c => c.lines.filter(l => /Dots/.test(l.label)));
        assert.ok(dotsLines.length > 0, 'the dots game must reach the ledger');
        // Group 1 only: nobody outside it may have a dots line.
        Object.values(r.combined.contributions).forEach(c => {
            const p = r.ps.find(x => x.name === c.name);
            if (groupOf(p.id) !== 1) {
                assert.ok(!c.lines.some(l => /Dots/.test(l.label)),
                    `${c.name} is not in Group 1 and must have no dots money`);
            }
        });
        assertSound('sim18', r);
    });

    test('19. same-group and cross-group Side Matches with custom presses', () => {
        const r = round({ sideMatches: { sm1: SM_SAME, sm2: SM_CROSS } });
        const avery = r.combined.contributions.avery;
        const segs = avery.lines.filter(l => /Press|Hole Bet|Overall|Overall Match/.test(l.label));
        assert.ok(segs.length >= 2, 'press segments must appear in the ledger');
        assert.ok(avery.lines.some(l => /\$78/.test(l.label)), 'the $78 press must be visible');
        assert.ok(avery.lines.some(l => /\$125/.test(l.label)), 'the $125 press must be visible');
        assertSound('sim19', r);
    });

    test('20. full heavy completed round — everything at once', () => {
        const r = round({
            hcps: [8,12,5,18,10,14,6,20,9,16,11,7],
            sideMatches: { sm1: SM_SAME, sm2: SM_CROSS },
            games: GAMES, dots: DOTS,
        });
        assert.equal(r.pool.totalPoolCents, 48000);
        assertSound('sim20', r);
        // And a golfer finishing exactly level still has a ledger.
        const zero = Object.values(r.combined.contributions).filter(c => c.net === 0);
        zero.forEach(c => assert.ok(c.lines.length > 0, `${c.name} finished level with no explanation`));
    });
});

describe('WHOLE-DOLLAR EDGE MATRIX', () => {

    const alloc = (t,n) => JSON.parse(JSON.stringify(engines().allocateWholeDollars(t, Array(n).fill(1))));

    test('the pinned cases', () => {
        assert.deepEqual(alloc(100,3), [34,33,33]);
        assert.deepEqual(alloc(70,3),  [24,23,23]);
        assert.deepEqual(alloc(25,2),  [13,12]);
        assert.deepEqual(alloc(10,3),  [4,3,3]);
    });

    test('the $310 skins buckets conserve exactly', () => {
        [7,9,11].forEach(n => {
            const out = alloc(310,n);
            assert.equal(out.reduce((a,b)=>a+b,0), 310, `$310 over ${n} did not conserve`);
            out.forEach(v => assert.equal(v, Math.floor(v)));
        });
        assert.deepEqual(alloc(310,9), [35,35,35,35,34,34,34,34,34]);
    });

    test('repeated runs are identical — the extra dollar never moves', () => {
        for (let i = 0; i < 20; i++) {
            assert.deepEqual(alloc(100,3), [34,33,33]);
            assert.deepEqual(alloc(310,7), alloc(310,7));
        }
    });
});

describe('LEGACY NON-REGRESSION', () => {

    test('a round with no settlementMode still settles in cents', () => {
        const r = round({ mode: null, pool: { kp: { amount:100, holes:[3,7,12] } },
                          kpWinners: { h3:'101', h7:'105', h12:'109' }, kpConfirmed: { confirmed: true } });
        assert.deepEqual(JSON.parse(JSON.stringify(r.pool.kp.perHoleCents)), [3334,3333,3333],
            'the legacy cent split must be untouched');
        assertSound('legacy', r, { wholeDollar: false });
    });

    test('legacy rounds are never auto-converted', () => {
        const sb = engines();
        assert.equal(sb.isWholeDollarRound({}), false);
        assert.equal(sb.isWholeDollarRound({ settlementMode: undefined }), false);
    });
});

describe('FINAL SCORECARD — net must actually be printed', () => {

    // This block exists because a sabotage that removed the net rows entirely left
    // every suite green. The requirement was implemented and then untested, which
    // is the same as untested: a later edit could have deleted it silently.
    const { loadHtmlInlineScript } = require('./helpers/load-script.js');
    const SDEPS = ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

    function card({ hcps = [8,12,5,18,10,14,6,20,9,16,11,7], netGame = true } = {}) {
        const sb = loadHtmlInlineScript('settlement.html', SDEPS);
        const cd = course();
        const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:String(hcps[i]),playingForMoney:true}));
        const sc = {};
        ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1; }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
            settlementMode: 'whole-dollar',
            moneyPool: netGame
                ? { enabled:true, buyIn:40, kp:{amount:100,holes:[3,7,12,16]},
                    net:{amount:70,places:[57.142857,42.857143]},
                    skins:{mode:'remainder',scoring:'net',carryOver:false} }
                : undefined,
            kpWinners: {}, kpConfirmed: { confirmed: true } };
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(data)};`, sb);
        return vm.runInContext('buildReceiptScorecard()', sb);
    }

    test('every golfer and all 18 holes appear', () => {
        const h = card();
        NAMES.forEach(n => assert.match(h, new RegExp('>' + n + '<'), `${n} missing from the scorecard`));
        for (let i = 1; i <= 18; i++) assert.match(h, new RegExp('>' + i + '<'), `hole ${i} missing`);
    });

    test('HOLE, PAR and stroke-index rows are all present', () => {
        const h = card();
        assert.match(h, />HOLE</);
        assert.match(h, />PAR</);
        assert.match(h, />HCP</, 'without the stroke index a golfer cannot check a net score');
    });

    test('NET rows are printed when net decides the money — one per golfer', () => {
        const h = card();
        const netRows = (h.match(/rt-net/g) || []).length;
        assert.equal(netRows, 12, `expected a net row per golfer, found ${netRows}`);
        assert.match(h, /net<\/td>/, 'the net row must be labelled');
    });

    test('OUT / IN / TOT columns carry gross and net totals', () => {
        const h = card();
        assert.match(h, />OUT</);
        assert.match(h, />IN</);
        assert.match(h, />TOT</);
        // A net row must carry its own OUT/IN/TOT cells, or front/back/total net is missing.
        const firstNet = h.slice(h.indexOf('rt-net'));
        const cells = (firstNet.slice(0, firstNet.indexOf('</tr>')).match(/rt-sec/g) || []).length;
        assert.ok(cells >= 3, `net row should carry OUT, IN and TOT totals; found ${cells}`);
    });

    test('a gross-only round prints no net rows', () => {
        const h = card({ netGame: false });
        assert.equal((h.match(/rt-net/g) || []).length, 0,
            'doubling the card height on a round nobody played net is not free');
    });
});
