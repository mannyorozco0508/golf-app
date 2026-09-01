// ============================================================================
// UNRESOLVED-KP RECONCILIATION
//
// THE BUG
//
// roundNetTotalsToWholeDollars() forced the ledger to sum to ZERO. That was
// correct when every dollar was always distributed - it only ever nudged a stray
// cent. Wave B changed the world: while KP money is unresolved the ledger sums
// to -kpUnresolvedCents, because that money is deliberately withheld.
//
// The loop did not know. It saw $100 "missing", handed it out a dollar at a time
// across the field, and labelled the result "Rounding to whole dollars". On the
// real 12-player round that put $14 and $15 onto seven golfers whose exact
// balances were ALREADY whole dollars - Marty read -$26 when he had genuinely
// lost $40 and won nothing.
//
// That is the KP refund bug resurfacing one layer up: pool-engine.js had stopped
// refunding the money, and this loop was quietly redistributing it anyway.
//
// THE RULE: rounding can never move a balance by more than a dollar. Anything
// larger was never rounding.
//
//     targetTotal = -kpUnresolvedCents   (0 on a settled round)
//
// This file is money-correctness only. Presentation is a separate pass.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// TODAY'S REAL ROUND: 12 golfers, $40 each, KP $100 / Net $70 / Skins $310.
const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const HCP = [9,7,2,9,0,8,3,6,9,13,12,12];
const GROSS = {
  Marty :[5,5,4,4,4,3,5,3,5, 4,4,3,5,5,4,4,7,6],
  Scott :[4,4,5,5,7,4,4,3,5, 5,3,6,4,5,4,4,4,7],
  Carp  :[3,5,3,4,5,3,5,2,5, 4,4,3,4,4,5,3,6,4],
  Randy :[5,9,4,4,4,6,6,2,6, 6,4,6,4,5,4,3,7,7],
  Manny :[4,5,4,4,4,3,5,3,4, 5,3,4,3,4,5,3,5,4],
  'Matt B':[5,7,5,4,6,3,5,2,5, 5,4,4,6,5,6,3,6,5],
  Lance :[4,5,4,4,4,3,5,3,4, 5,3,5,4,4,5,2,6,5],
  Kopp  :[5,6,5,5,5,3,5,3,5, 4,4,4,5,6,4,3,4,6],
  Marcus:[4,6,5,5,4,3,5,4,5, 4,3,4,5,4,5,3,4,5],
  Rocco :[5,8,5,5,4,3,6,3,8, 5,6,5,5,5,6,7,10,null],
  'Matt H':[6,10,4,6,5,4,5,4,5, 4,5,4,5,5,5,3,5,9],
  Jeremy:[7,5,4,4,6,3,5,5,5, 4,4,6,6,5,6,3,7,7],
};
const KP_HOLES = [3,7,12,16];

function round({ winners = {}, confirmed = false, noWinner = null, cancelled = false } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:String(HCP[i]), playingForMoney:true }));
    const sc = {};
    NAMES.forEach((n,i)=>GROSS[n].forEach((v,hi)=>{ if (v != null) sc['p'+(101+i)+'_h'+(hi+1)] = v; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
        settlementMode:'whole-dollar', kpWinners: winners,
        moneyPool:{ enabled:true, buyIn:40,
            kp:{ amount:100, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true };
    if (noWinner) d.kpNoWinner = noWinner;
    if (cancelled) d.kpCancelled = { cancelled: true, cancelledAt: 1, cancelledBy: 'organizer' };
    const sb = engines();
    return { sb, d, cd, sc,
        pool: sb.computeMoneyPool(d, cd, sc),
        combined: sb.computeCombinedNetTotals(d, cd, sc) };
}
const ledgerSum = c => Object.values(plain(c.netByName)).reduce((a,v)=>a+v.net, 0);
// Flattened INSIDE the VM realm first. Mapping across the boundary produced host
// objects whose fields read back as undefined, which JSON.stringify then choked on.
const roundingLines = c => {
    const out = [];
    Object.values(plain(c.contributions)).forEach(x => {
        (x.lines || []).forEach(l => {
            if (l && l.rounding) out.push({ name: x.name, amount: Number(l.amount) });
        });
    });
    return out;
};

// ============================================================================

describe("TODAY'S ROUND — UNRESOLVED KP", () => {

    test('the ledger sums to MINUS the unresolved amount, not to zero', () => {
        const r = round();
        assert.equal(r.pool.kpUnresolvedCents, 10000);
        assert.equal(ledgerSum(r.combined), -100,
            'the $100 is withheld, so the ledger is deliberately $100 short');
    });

    test('NO golfer receives an invented $14/$15 "rounding" adjustment', () => {
        const big = roundingLines(round().combined).filter(l => Math.abs(l.amount) > 1);
        assert.equal(big.length, 0,
            'rounding can never move a balance by more than a dollar: '
            + big.map(l => l.name + ' ' + l.amount).join(', '));
    });

    test('a golfer who won nothing sits at their TRUE net position', () => {
        const r = round();
        // Marty paid in and won nothing. His position is the buy-in, not an
        // improved figure funded by money nobody has been awarded.
        assert.equal(plain(r.combined.netByName).marty.net, -40);
        assert.equal(plain(r.combined.exact).marty.net, -40);
    });

    test('every golfer with a whole-dollar exact balance is left exactly alone', () => {
        const c = round().combined;
        Object.keys(plain(c.exact)).forEach(k => {
            const e = plain(c.exact)[k].net;
            if (Math.abs(e - Math.round(e)) > 0.0001) return;   // genuinely fractional
            assert.equal(plain(c.netByName)[k].net, e,
                `${plain(c.exact)[k].name}: an already-whole balance must not be adjusted`);
        });
    });

    test("Manny's payout and his net position stay different numbers", () => {
        // The distinction the presentation pass will make visible: $44 came out of
        // the pot, and his resulting position is +$4.
        const r = round();
        const manny = plain(r.combined.contributions).manny;
        // The payout is the money that came OUT OF THE POT - the note lines, minus
        // the buy-in, which is money going the other way.
        const payout = (manny.lines || [])
            .filter(l => l.note && !/buy-in/i.test(l.label) && Number(l.amount) > 0)
            .reduce((a,l)=>a+Number(l.amount), 0);
        assert.ok(payout > 0, 'Manny won money from the pot');
        assert.ok(payout > plain(r.combined.netByName).manny.net,
            'payout and net position are different concepts and must not converge');
    });

    test('the unresolved money is still accounted for, not lost', () => {
        const r = round();
        const paid = r.pool.kp.lines.filter(l => l.state === 'paid').reduce((a,l)=>a+l.cents,0)
                   + r.pool.net.lines.reduce((a,l)=>a+l.cents,0)
                   + r.pool.skins.lines.reduce((a,l)=>a+l.cents,0);
        assert.equal(paid + r.pool.refund.cents + r.pool.kpUnresolvedCents, r.pool.totalPoolCents);
    });
});

describe('CONFIRMED KP RETURNS TO ZERO-SUM', () => {

    const CONFIRMED = { winners:{ h3:'101', h7:'105', h12:'109', h16:'102' }, confirmed:true };

    test('nothing is unresolved and the ledger balances', () => {
        const r = round(CONFIRMED);
        assert.equal(r.pool.kpUnresolvedCents, 0);
        assert.equal(ledgerSum(r.combined), 0);
    });

    test('no oversized rounding lines appear here either', () => {
        const big = roundingLines(round(CONFIRMED).combined).filter(l => Math.abs(l.amount) > 1);
        assert.equal(big.length, 0, big.map(l => l.name + ' ' + l.amount).join(', '));
    });

    test('Who Pays Who reconstructs every balance exactly', () => {
        const c = round(CONFIRMED).combined;
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to]   = (moved[t.to]||0) + t.amount;
            assert.equal(t.amount, Math.round(t.amount), 'a transaction carried cents');
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: transactions must reconcile`));
    });

    test('an explicit no-winner still refunds and still balances', () => {
        const r = round({ winners:{ h3:'101', h7:'105', h16:'102' },
                          confirmed:true, noWinner:{ h12:true } });
        assert.equal(r.pool.kpUnresolvedCents, 0);
        assert.ok(r.pool.kp.unclaimedCents > 0, 'Wave B refund behaviour is untouched');
        assert.equal(ledgerSum(r.combined), 0);
    });
});

describe('CANCELLED KP — WAVE C UNTOUCHED', () => {

    test('cancellation resolves the KP question and restores zero-sum', () => {
        const r = round({ cancelled: true });
        assert.equal(r.pool.kpUnresolvedCents, 0);
        assert.equal(ledgerSum(r.combined), 0);
    });

    test('the freed money still becomes skins, not a rounding adjustment', () => {
        const r = round({ cancelled: true });
        assert.ok(!r.pool.kp, 'no KP bucket exists');
        assert.equal(r.pool.skins.amountCents, 41000, '$310 + $100 through the remainder');
        assert.equal(roundingLines(r.combined).filter(l => Math.abs(l.amount) > 1).length, 0);
    });
});

describe('GENUINE SUB-DOLLAR ROUNDING STILL WORKS', () => {

    // A 2v2 side match at an odd stake splits to $12.50 a side, so real rounding
    // has something to do. This is the behaviour that must NOT be lost.
    function oddStake() {
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.slice(0,4).map((n,i)=>({ id:101+i, name:n, hcp:'0', playingForMoney:true }));
        const sc = {};
        ps.forEach((p,pi)=>cd.forEach(h=>{ sc['p'+p.id+'_h'+h.hole] = h.par + (pi < 2 ? -1 : 1); }));
        const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
            settlementMode:'whole-dollar',
            sideMatches:{ sm:{ format:'match', scoring:'gross', stake:25, startHole:1,
                               createdAt:1, teamAIds:['101','102'], teamBIds:['103','104'] } } };
        const sb = engines();
        return sb.computeCombinedNetTotals(d, cd, sc);
    }

    test('a $12.50 share is still rounded to whole dollars', () => {
        const c = oddStake();
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, Math.round(v.net), `${v.name} settled on cents`));
        assert.equal(ledgerSum(c), 0, 'and the round still balances');
    });

    test('the rounding line it produces is at most a dollar', () => {
        roundingLines(oddStake()).forEach(l =>
            assert.ok(Math.abs(l.amount) <= 1, `${l.name} got a ${l.amount} "rounding" line`));
    });

    test('SOMETHING is still adjusted — the mechanism was not simply disabled', () => {
        const lines = roundingLines(oddStake());
        assert.ok(lines.length > 0,
            'an unevenly-split wager must still produce a visible rounding adjustment');
    });
});

describe('THE FIX IS IN THE CANONICAL LAYER', () => {

    test('the reconciler takes an explicit target', () => {
        const src = read('settlement-engine.js');
        assert.match(src, /function roundNetTotalsToWholeDollars\(netByName, targetTotal\)/);
        assert.match(src, /const target = Math\.round\(Number\(targetTotal\) \|\| 0\);/,
            'a fractional target could never be reached and would spin forever');
    });

    test('the combiner passes the unresolved amount', () => {
        const src = read('settlement-engine.js');
        assert.match(src, /roundNetTotalsToWholeDollars\(netByName, -unresolvedDollars\)/);
        assert.match(src, /poolNow\.kpUnresolvedCents/,
            'the target comes from the canonical pool result, not a page');
    });

    test('the loop is bounded so it can never hang settlement', () => {
        const src = read('settlement-engine.js');
        const at = src.indexOf('function roundNetTotalsToWholeDollars');
        const fn = src.slice(at, src.indexOf('\n    }', at));
        assert.match(fn, /guard-- > 0/, 'a frozen Receipt is worse than a stray dollar');
    });

    test('no presenter was patched to hide this', () => {
        ['settlement.html','index.html'].forEach(f => {
            const src = read(f);
            assert.ok(!/kpUnresolvedCents\s*\/\s*100\s*\)?\s*[-+]/.test(src),
                `${f} must not adjust balances by the unresolved amount itself`);
        });
    });

    test('pool-engine unresolved accounting is unchanged', () => {
        const src = read('pool-engine.js');
        assert.match(src, /result\.kpUnresolvedCents = kpUnresolvedCents;/);
        assert.match(src, /result\.settled = kpUnresolvedCents === 0;/);
    });
});

describe('PLAYER PAYOUTS ARE UNAFFECTED', () => {

    test('payout lines are identical whether or not KP is resolved', () => {
        const open = round();
        const done = round({ winners:{ h3:'101', h7:'105', h12:'109', h16:'102' }, confirmed:true });
        // Skins and Net Finish are decided by scores, not by the KP question, so the
        // non-KP payout lines must not move.
        const nonKp = c => Object.values(plain(c.contributions)).map(x => ({
            name: x.name,
            lines: x.lines.filter(l => l.note && !/^KP H/.test(l.label) && !/buy-in/i.test(l.label))
                          .map(l => l.label + ':' + l.amount).sort(),
        })).sort((a,b)=>a.name.localeCompare(b.name));
        assert.deepEqual(nonKp(open.combined), nonKp(done.combined));
    });
});
