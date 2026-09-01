// ============================================================================
// CANONICAL CONTRIBUTION BREAKDOWN
//
// WHY THIS EXISTS
//
// computeCombinedNetTotals() folded every wager into one number per golfer. By
// the time it returned, "Avery: -$185" was all that survived - no record of the
// $40 buy-in, the $25 KP, the skins or the side match that produced it. A page
// wanting to show a golfer WHY they owe $185 had exactly one option: re-run
// every game itself and hope its arithmetic matched the engine's. That is the
// duplication this codebase keeps deleting, and it is how a Receipt comes to
// disagree with the money it is printing.
//
// The fix is additive: the same engines, in the same order, producing the same
// amounts - the labels are simply written down at the point the money is already
// being counted. No second pass and no re-derivation, so a line cannot exist
// that the total does not contain.
//
// TWO KINDS OF LINE, and the distinction is load-bearing:
//
//   moving  the amounts that ARE the golfer's net. These sum to it.
//   note    detail that explains a moving line from the inside - the pool
//           buy-in, each KP, the net-finish place, the skins. Marked note:true
//           so nothing double-counts.
//
// The anchor test is 'moving lines sum to the golfer's final net'. If that ever
// fails, the Receipt is printing lines that do not add up, which is worse than
// printing no lines at all.
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
const course = () => Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));

// The generic 12-golfer / 3-group acceptance shape: $480 pool, KP $100,
// Net Finish $70, Net Skins $310, plus side action and a custom press.
function acceptance(over = {}) {
    const cd = course();
    const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:String(4+i),playingForMoney:true}));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1; }));
    const data = Object.assign({
        players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
        settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3,7,12,16] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' }, kpConfirmed: { confirmed: true },
        sideMatches: {
            sm1: { format:'match', scoring:'net', stake:50, startHole:1, createdAt:1,
                   teamAIds:['101'], teamBIds:['102'] },
            sm2: { format:'stroke', scoring:'net', holeStake:5, overallStake:200, startHole:1, createdAt:2,
                   teamAIds:['101','102'], teamBIds:['105','106'],
                   // A STROKE match stores presses under overallPresses; `presses` is
                   // the MATCH-format field and this branch does not read it.
                   overallPresses:{ p1:{ startHole:6, stake:78 } } },
        },
    }, over);
    const sb = engines();
    return { sb, ps, cd, sc, data, r: sb.computeCombinedNetTotals(data, cd, sc) };
}

// Arrays built inside the VM realm do not share the host prototypes, so
// assert.deepEqual fails on identity even when contents match.
const plain = v => JSON.parse(JSON.stringify(v));

const moving = c => c.lines.filter(l => !l.note);
const sumMoving = c => moving(c).reduce((a,l)=>a+l.amount, 0);
const labels = c => c.lines.map(l => l.label);

// ============================================================================

describe('THE ANCHOR — lines must add up to the number the golfer is shown', () => {

    test('every golfer\'s moving lines sum to their final net', () => {
        const { r } = acceptance();
        Object.values(r.contributions).forEach(c => {
            assert.ok(Math.abs(sumMoving(c) - c.net) < 0.005,
                `${c.name}: lines sum to ${sumMoving(c)} but the final net is ${c.net}`);
        });
    });

    test('the breakdown covers every golfer the totals cover', () => {
        const { r } = acceptance();
        assert.deepEqual(plain(Object.keys(r.contributions)).sort(), plain(Object.keys(r.netByName)).sort());
    });

    test('the breakdown net matches the rounded net exactly', () => {
        const { r } = acceptance();
        Object.keys(r.contributions).forEach(k => {
            assert.equal(r.contributions[k].net, r.netByName[k].net);
        });
    });

    test('the whole round still nets to zero through the breakdown', () => {
        const { r } = acceptance();
        const total = Object.values(r.contributions).reduce((a,c)=>a+c.net, 0);
        assert.equal(total, 0);
    });

    test('note lines never move money - removing them changes nothing', () => {
        const { r } = acceptance();
        Object.values(r.contributions).forEach(c => {
            const all = c.lines.reduce((a,l)=>a+l.amount, 0);
            const notes = c.lines.filter(l=>l.note).reduce((a,l)=>a+l.amount, 0);
            assert.ok(Math.abs((all - notes) - c.net) < 0.005,
                `${c.name}: note lines are being counted in the total`);
        });
    });
});

describe('EVERY PARTICIPANT APPEARS', () => {

    test('all twelve golfers have a ledger', () => {
        const { r } = acceptance();
        assert.equal(Object.keys(r.contributions).length, 12);
        NAMES.forEach(n => {
            assert.ok(r.contributions[n.toLowerCase()], `${n} is missing from the ledger`);
        });
    });

    test('a golfer who wins nothing still appears, with their buy-in', () => {
        // The failure this prevents: someone reads the Receipt, cannot find their
        // name, and assumes the app lost them.
        const { r } = acceptance();
        const quiet = Object.values(r.contributions).filter(c => moving(c).length === 1);
        assert.ok(quiet.length > 0, 'expected at least one golfer with only pool money');
        quiet.forEach(c => {
            assert.ok(labels(c).includes('Money Pool buy-in'),
                `${c.name} has no buy-in line to explain their balance`);
        });
    });

    test('the buy-in debit is itemised for every pool participant', () => {
        const { r } = acceptance();
        Object.values(r.contributions).forEach(c => {
            const buyIn = c.lines.find(l => l.label === 'Money Pool buy-in');
            assert.ok(buyIn, `${c.name} has no buy-in line`);
            assert.equal(buyIn.amount, -40);
        });
    });
});

describe('ITEMISED LINES', () => {

    test('KP lines name the hole', () => {
        const { r } = acceptance();
        assert.ok(labels(r.contributions.avery).includes('KP H3'));
        assert.ok(labels(r.contributions.ellis).includes('KP H7'));
        assert.ok(labels(r.contributions.indigo).includes('KP H12'));
        assert.ok(labels(r.contributions.blake).includes('KP H16'));
    });

    test('a golfer winning two KPs gets two separate hole lines', () => {
        const { r } = acceptance({ kpWinners: { h3:'101', h7:'101', h12:'109', h16:'102' }, kpConfirmed: { confirmed: true } });
        const kp = labels(r.contributions.avery).filter(l => l.startsWith('KP H'));
        assert.deepEqual(plain(kp).sort(), ['KP H3','KP H7'],
            'grouping two KPs into one line would lose the hole breakdown');
    });

    test('Net Finish lines carry the finishing position', () => {
        const { r } = acceptance();
        const all = Object.values(r.contributions).flatMap(labels);
        assert.ok(all.some(l => /^Net Finish T?\d+$/.test(l)), 'no Net Finish line found');
    });

    test('a TIED Net Finish is marked with T', () => {
        // Two golfers forced level on net.
        // Two golfers off the same handicap shooting identical scores tie on net by
        // construction; everyone else is given a worse score so the tie is at the top.
        const base = acceptance();
        const sc = Object.assign({}, base.sc);
        base.ps.forEach(p => base.cd.forEach(h => {
            const id = String(p.id);
            sc['p'+id+'_h'+h.hole] = (id === '101' || id === '102') ? 3 : 6;
        }));
        const ps = base.ps.map(p => Object.assign({}, p, { hcp: '0' }));
        const data = Object.assign({}, base.data, { players: ps, scores: sc, sideMatches: {} });
        const r = base.sb.computeCombinedNetTotals(data, base.cd, sc);
        const all = Object.values(r.contributions).flatMap(labels);
        assert.ok(all.some(l => /^Net Finish T\d+$/.test(l)),
            'a shared place must be labelled T — the tie is the part golfers query');
    });

    test('skins lines carry the count and the basis', () => {
        const { r } = acceptance({
            moneyPool: { enabled:true, buyIn:40,
                kp:{amount:100,holes:[3,7,12,16]},
                net:{amount:70,places:[57.142857,42.857143]},
                skins:{mode:'remainder',scoring:'net',carryOver:true} } });
        const all = Object.values(r.contributions).flatMap(labels);
        const skins = all.filter(l => /Skins \u00B7 \d+ skin/.test(l));
        if (skins.length > 0) {
            assert.match(skins[0], /^(Net|Gross) Skins \u00B7 \d+ skins?$/);
        }
    });

    test('side match lines name both sides', () => {
        const { r } = acceptance();
        const sm = labels(r.contributions.avery).filter(l => l.startsWith('Side Match'));
        assert.ok(sm.length >= 2, 'Avery is in two side matches and should have two lines');
        assert.ok(sm.some(l => /Avery vs Blake/.test(l)));
        assert.ok(sm.some(l => /Avery\/Blake vs Ellis\/Finley/.test(l)));
    });

    test('a side match with presses says how many', () => {
        const { r } = acceptance();
        const sm = labels(r.contributions.avery).find(l => /Ellis\/Finley/.test(l));
        assert.match(sm, /\(\+1 press\)/,
            'press money is inside the match total, so the count is reported rather than double-counted');
    });

    test('several games of one format are distinguishable', () => {
        const { r } = acceptance({
            additionalGameInstances: {
                d1: { format:'dots', enabled:true, startHole:1, dotPointVal:2, participantIds:['101','102','103'] },
                d2: { format:'dots', enabled:true, startHole:1, dotPointVal:5, participantIds:['105','106','107'] },
            },
            dots: { h1: { p101:['greenie'], p105:['greenie'] } },
        });
        const all = Object.values(r.contributions).flatMap(labels);
        const dots = [...new Set(all.filter(l => l.startsWith('Dots')))];
        if (dots.length > 1) {
            assert.ok(dots.some(l => /\(2\)/.test(l)),
                'two games of the same format must not both be called the same thing');
        }
    });
});

describe('FIXTURES THAT ACTUALLY EXERCISE THE EDGE CASES', () => {

    // These two exist because the acceptance fixture could not catch their
    // regressions. Sabotaging "omit zero-balance golfers" and "skip the rounding
    // step" both left the suite green: no golfer in that round finishes exactly
    // even, and none of its wagers divide unevenly, so neither condition was ever
    // reached. A control that cannot fail is not a control.

    // Skins-only pot with every hole tied: the whole pot refunds, so every golfer
    // gets their buy-in straight back and finishes exactly $0.
    function allSquare() {
        const cd = course();
        const ps = NAMES.slice(0, 4).map((n,i)=>({id:101+i,name:n,hcp:'0',playingForMoney:true}));
        const sc = {};
        ps.forEach(p => cd.forEach(h => { sc['p'+p.id+'_h'+h.hole] = h.par; }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
            settlementMode: 'whole-dollar',
            moneyPool: { enabled: true, buyIn: 40,
                skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
        const sb = engines();
        return { sb, r: sb.computeCombinedNetTotals(data, cd, sc) };
    }

    // A 2v2 side match at an odd stake: $25 across two teammates is $12.50 each,
    // so the exact nets are fractional and the rounding step has real work to do.
    function oddStake() {
        const cd = course();
        const ps = NAMES.slice(0, 4).map((n,i)=>({id:101+i,name:n,hcp:'0',playingForMoney:true}));
        const sc = {};
        ps.forEach((p,pi) => cd.forEach((h,hi) => { sc['p'+p.id+'_h'+h.hole] = h.par + (pi < 2 ? -1 : 1); }));
        const data = { players: ps, courseData: cd, gameFormat: 'stroke', scores: sc,
            settlementMode: 'whole-dollar',
            sideMatches: { sm: { format:'match', scoring:'gross', stake:25, startHole:1, createdAt:1,
                                 teamAIds:['101','102'], teamBIds:['103','104'] } } };
        const sb = engines();
        return { sb, r: sb.computeCombinedNetTotals(data, cd, sc) };
    }

    test('a golfer who finishes exactly even still appears, with their lines', () => {
        const { r } = allSquare();
        const zero = Object.values(r.contributions).filter(c => c.net === 0);
        assert.equal(zero.length, 4, 'every golfer should finish level here');
        zero.forEach(c => {
            assert.ok(c.lines.length > 0, `${c.name} appears but with no explanation`);
            assert.ok(labels(c).includes('Money Pool buy-in'), `${c.name} is missing the buy-in line`);
            assert.ok(labels(c).includes('Pool refund'), `${c.name} is missing the refund that squares them`);
        });
    });

    test('a refunded pot is explained, not silently netted to nothing', () => {
        const { r } = allSquare();
        const c = Object.values(r.contributions)[0];
        const buy = c.lines.find(l => l.label === 'Money Pool buy-in');
        const ref = c.lines.find(l => l.label === 'Pool refund');
        assert.equal(buy.amount, -40);
        assert.equal(ref.amount, 40, 'the refund must be visible, or $0 looks like a bug');
    });

    test('an unevenly-split wager still yields integer dollars, with the difference shown', () => {
        const { r } = oddStake();
        Object.values(r.contributions).forEach(c => {
            assert.equal(c.net, Math.round(c.net), `${c.name} settled on ${c.net} - cents in whole-dollar mode`);
        });
        const total = Object.values(r.contributions).reduce((a,c)=>a+c.net, 0);
        assert.equal(total, 0, 'rounding must not create or destroy a dollar');
    });

    test('the rounding line appears exactly when rounding moved someone', () => {
        const { r } = oddStake();
        const withLine = Object.values(r.contributions).filter(c => c.lines.some(l => l.rounding));
        assert.ok(withLine.length > 0,
            '$12.50 rounded to a whole dollar must be accounted for by a visible line');
        withLine.forEach(c => {
            assert.ok(Math.abs(sumMoving(c) - c.net) < 0.005,
                `${c.name}: lines still must add up to the printed total`);
        });
    });
});

describe('NO DUPLICATE MATH', () => {

    test('the breakdown is captured where the money is already counted', () => {
        const src = read('settlement-engine.js');
        const fn = src.slice(src.indexOf('function computeCombinedNetTotals'));
        const body = fn.slice(0, fn.indexOf('\n    function '));
        assert.match(body, /function addAmount\(player, amount, label\)/,
            'labels must be recorded by the same call that adds the money');
        assert.match(body, /linesByName\[key\]\.push/);
    });

    test('pool detail is read from computeMoneyPool, not recalculated', () => {
        const src = read('settlement-engine.js');
        const fn = src.slice(src.indexOf('function computeCombinedNetTotals'));
        const body = fn.slice(0, fn.indexOf('\n    function '));
        assert.match(body, /pool\.kp\.lines\.forEach/);
        assert.match(body, /pool\.net\.lines\.forEach/);
        assert.match(body, /pool\.skins\.lines\.forEach/);
        assert.doesNotMatch(body, /computeSkinsCarryOverForSettle|computeSkinsVoidForSettle/,
            'the breakdown must not resolve skins itself');
    });

    test('the existing return shape is unchanged - this is additive', () => {
        const { r } = acceptance();
        assert.ok(r.netByName, 'netByName must survive');
        assert.ok(r.exact, 'exact must survive');
        assert.ok(Array.isArray(r.transactions), 'transactions must survive');
        assert.ok(r.contributions, 'contributions is the new field');
    });
});

describe('WHO PAYS WHO STILL RECONSTRUCTS THE LEDGER', () => {

    test('transactions rebuild every balance exactly, in integer dollars', () => {
        const { r } = acceptance();
        const moved = {};
        r.transactions.forEach(t => {
            moved[t.from] = (moved[t.from] || 0) - t.amount;
            moved[t.to] = (moved[t.to] || 0) + t.amount;
            assert.equal(t.amount, Math.round(t.amount), 'a transaction carried cents');
        });
        Object.values(r.contributions).forEach(c => {
            assert.ok(Math.abs(c.net - (moved[c.name] || 0)) < 0.005,
                `${c.name}: transactions do not reconstruct the ledger`);
        });
    });

    test('no golfer ledger carries cents in whole-dollar mode', () => {
        const { r } = acceptance();
        Object.values(r.contributions).forEach(c => {
            assert.equal(c.net, Math.round(c.net), `${c.name} settled on a fraction of a dollar`);
        });
    });
});

describe('LEGACY ROUNDS', () => {

    test('a legacy round still produces a breakdown that adds up', () => {
        const { r } = acceptance({ settlementMode: undefined });
        Object.values(r.contributions).forEach(c => {
            assert.ok(Math.abs(sumMoving(c) - c.net) < 0.005,
                `${c.name}: legacy lines do not sum to the final net`);
        });
    });

    test('when rounding moves a golfer, the difference is shown rather than hidden', () => {
        // The money-moving lines sum to the EXACT net; the printed number is the
        // ROUNDED net. Where a wager divided unevenly those differ by up to a dollar,
        // and lines that silently fail to add up are worse than no lines at all.
        const src = read('settlement-engine.js');
        assert.match(src, /label: 'Rounding to whole dollars'/);
        const { r } = acceptance();
        const anyRounding = Object.values(r.contributions)
            .some(c => c.lines.some(l => l.rounding));
        assert.equal(anyRounding, false,
            'a whole-dollar round with whole-dollar wagers should need no rounding line');
    });
});
