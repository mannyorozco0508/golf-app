// ============================================================================
// MONEY POOL — the whole-round pot, proven
//
// The identity every test here ultimately defends:
//
//   sum(buy-ins) === sum(prizes) + sum(refunds), in CENTS, exactly.
//
// The pool engine invents no golf: skins winners come from the settlement
// engine's own skins functions, net standings from getStrokes/parseHcp, KP
// winners from data.kpWinners. These tests therefore concentrate on the money
// division - splits, ties, remainders, refunds, exclusions - and on the
// integration: Final Results, Who Pays Who, and legacy rounds untouched.
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
    ['action-model.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const E = engines();
const J = JSON.stringify;
const CD = makeCourseData(18);
const NAMES = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
               'Ryan', 'Dalen', 'Nick', 'Paul', 'Al', 'Bo', 'Cy', 'Dan'];

function makeField(n, hcps) {
    return makePlayers(NAMES.slice(0, n), hcps || NAMES.slice(0, n).map(() => 0));
}
// Distinct net totals: player i shoots par+i on every hole (hcp 0) → clean order.
function ladderScores(players) {
    const s = {};
    players.forEach((p, i) => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par + i; }));
    return s;
}
function pool(data, scores) {
    vm.runInContext(`window.__p = computeMoneyPool(${J(data)}, ${J(CD)}, ${J(scores)});`, E);
    return E.window.__p;
}
function combined(data, scores) {
    vm.runInContext(`window.__c = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(scores)});`, E);
    return E.window.__c;
}
const centsSum = r => Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0);
function assertZeroSum(r, label) {
    assert.equal(centsSum(r), 0, `${label}: pool must net to zero CENTS, got ${centsSum(r)}`);
}
// Reconciliation: buy-ins fully redistributed across prizes+refunds.
// THE INVARIANT THAT ALWAYS HOLDS: no money disappears.
//
//     prizes + refunds + unresolved === the pot
//
// Zero-sum is a CONSEQUENCE of that, and only once every dollar has been handed
// out. While KP money is unresolved the ledger deliberately sums to -unresolved:
// the buy-ins were charged and that share has not been distributed. Forcing it to
// zero is exactly the bug Wave B removed - it is what turned $100 of unentered KP
// into $8 and $9 refund lines on a receipt that called itself final.
function assertReconciled(r, label) {
    const prizes =
        (r.kp ? r.kp.lines.reduce((a, l) => a + (l.state === 'paid' ? l.cents : 0), 0) : 0) +
        (r.net ? r.net.lines.reduce((a, l) => a + l.cents, 0) : 0) +
        (r.skins ? r.skins.lines.reduce((a, l) => a + l.cents, 0) : 0);
    const unresolved = r.kpUnresolvedCents || 0;
    assert.equal(prizes + r.refund.cents + unresolved, r.totalPoolCents,
        `${label}: prizes ${prizes} + refunds ${r.refund.cents} + unresolved ${unresolved} `
        + `must equal the pot ${r.totalPoolCents}`);
    if (unresolved === 0) {
        assertZeroSum(r, label);
    } else {
        assert.equal(centsSum(r), -unresolved,
            `${label}: the ledger must be short by exactly the unresolved amount`);
    }
}

// ---------------------------------------------------------------------------
describe('VALIDATION — a bad pot never becomes money', () => {
    const P = makeField(12);
    const base = () => ({ players: P, moneyPool: { enabled: true, buyIn: 40 } });

    test('over-allocation is rejected with the overage named', () => {
        const d = base();
        d.moneyPool.kp = { amount: 200, holes: [4] };
        d.moneyPool.net = { amount: 200, places: [100] };
        d.moneyPool.skins = { mode: 'fixed', amount: 200 };
        vm.runInContext(`window.__v = validateMoneyPool(${J(d)}, ${J(CD)});`, E);
        const v = E.window.__v;
        assert.equal(v.valid, false);
        assert.ok(v.errors.some(e => /\$120 over budget/.test(e)), v.errors.join(' | '));
    });

    test('unallocated money without a remainder bucket is rejected', () => {
        const d = base();
        d.moneyPool.kp = { amount: 100, holes: [4] };
        d.moneyPool.skins = { mode: 'none' };
        vm.runInContext(`window.__v = validateMoneyPool(${J(d)}, ${J(CD)});`, E);
        assert.ok(E.window.__v.errors.some(e => /unallocated/.test(e)));
    });

    test('percents must total 100', () => {
        const d = base();
        d.moneyPool.net = { amount: 100, places: [60, 30] };
        d.moneyPool.skins = { mode: 'remainder' };
        vm.runInContext(`window.__v = validateMoneyPool(${J(d)}, ${J(CD)});`, E);
        assert.ok(E.window.__v.errors.some(e => /total 100%/.test(e)));
    });

    test('KP money with no holes, and off-course holes, are both rejected', () => {
        const d = base();
        d.moneyPool.kp = { amount: 100, holes: [] };
        d.moneyPool.skins = { mode: 'remainder' };
        vm.runInContext(`window.__v = validateMoneyPool(${J(d)}, ${J(CD)});`, E);
        assert.ok(E.window.__v.errors.some(e => /no KP holes/.test(e)));
        d.moneyPool.kp = { amount: 100, holes: [4, 99] };
        vm.runInContext(`window.__v = validateMoneyPool(${J(d)}, ${J(CD)});`, E);
        assert.ok(E.window.__v.errors.some(e => /hole 99/.test(e)));
    });

    test('an invalid pool contributes NOTHING to settlement', () => {
        const d = base();
        d.moneyPool.kp = { amount: 9999, holes: [4] };
        d.moneyPool.skins = { mode: 'remainder' };
        vm.runInContext(`window.__n = computeMoneyPoolNetByPlayerId(${J(d)}, ${J(CD)}, {});`, E);
        assert.equal(Object.keys(E.window.__n).length, 0, 'invalid config must not move a cent');
    });
});

// ---------------------------------------------------------------------------
describe('THE MARTY ACCEPTANCE — 12 × $40, KP $100×2, Net $100 top-3, skins remainder', () => {
    const P = makeField(12);
    const SC = ladderScores(P);
    const d = () => ({
        players: P,
        kpWinners: { h4: String(P[0].id), h14: String(P[2].id) }, kpConfirmed: { confirmed: true },   // Marty, John
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [4, 14] },
            net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } }
    });

    test('the whole $480 is explainable, bucket by bucket', () => {
        const r = pool(d(), SC);
        assert.equal(r.valid, true, r.errors.join(' | '));
        assert.equal(r.totalPoolCents, 48000, '12 × $40');
        assert.equal(r.kp.amountCents, 10000);
        assert.equal(r.kp.perHoleCents.join(','), '5000,5000', '$50 per KP');
        assert.equal(r.kp.lines.find(l => l.hole === 4).winnerName, 'Marty');
        assert.equal(r.kp.lines.find(l => l.hole === 14).winnerName, 'John');
        assert.equal(r.net.amountCents, 10000);
        // Ladder: Marty 1st, Manny 2nd, John 3rd.
        assert.equal(r.net.lines.map(l => l.place + ':' + l.names[0] + ':' + l.cents).join('|'),
            '1:Marty:5000|2:Manny:3000|3:John:2000');
        // Skins remainder $280; ladder scores → Marty wins every hole → 18 units.
        assert.equal(r.skins.amountCents, 28000, '$480 − $100 − $100');
        assert.equal(r.skins.totalUnits, 18);
        assert.equal(r.skins.lines.every(l => l.winnerName === 'Marty'), true);
        assertReconciled(r, 'acceptance');
    });

    test('per-player ledger: buy-in debit plus every prize', () => {
        const r = pool(d(), SC);
        const marty = r.perPlayerCents[String(P[0].id)];
        // Marty: −$40 + KP $50 + Net $50 + all $280 skins = +$340.
        assert.equal(marty, -4000 + 5000 + 5000 + 28000);
        // A mid-field golfer with nothing: exactly −$40.
        assert.equal(r.perPlayerCents[String(P[7].id)], -4000);
    });

    test('Final Results and Who Pays Who carry the pool', () => {
        const c = combined(d(), SC);
        assert.equal(c.exact.marty.net, 340);
        const total = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        assert.ok(Math.abs(total) < 0.01, 'the whole round nets $0');
        const owed = Object.values(c.exact).filter(p => p.net > 0).reduce((a, p) => a + p.net, 0);
        const paid = c.transactions.reduce((a, t) => a + t.amount, 0);
        assert.ok(Math.abs(Math.round(owed) - paid) <= 1, 'Who Pays Who reconstructs (whole-dollar rule)');
    });

    test('THE SAME ARCHITECTURE, 1 KP — config change only, no code change', () => {
        const cfg = d();
        cfg.moneyPool.kp = { amount: 100, holes: [14] };
        cfg.kpWinners = { h14: String(P[2].id) };
        const r = pool(cfg, SC);
        assert.equal(r.kp.perHoleCents.join(','), '10000', 'one KP takes the whole $100');
        assert.equal(r.kp.lines[0].winnerName, 'John');
        assert.equal(r.skins.amountCents, 28000, 'remainder unchanged');
        assertReconciled(r, '1-KP variant');
    });
});

// ---------------------------------------------------------------------------
describe('KP — splits, ties rule, unclaimed money', () => {
    const P = makeField(12);
    const SC = ladderScores(P);
    const mk = (holes, winners) => ({ players: P, kpWinners: winners || {},
        // These fixtures describe finished rounds, so their KPs are confirmed.
        kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes },
            skins: { mode: 'remainder', scoring: 'net' } } });

    test('1 / 2 / 4 KPs split $100 equally', () => {
        assert.equal(pool(mk([4]), SC).kp.perHoleCents.join(','), '10000');
        assert.equal(pool(mk([4, 14]), SC).kp.perHoleCents.join(','), '5000,5000');
        assert.equal(pool(mk([4, 8, 12, 14]), SC).kp.perHoleCents.join(','), '2500,2500,2500,2500');
    });

    test('3 KPs split $100 to the cent, no cent lost', () => {
        const r = pool(mk([4, 8, 14]), SC);
        assert.equal(r.kp.perHoleCents.join(','), '3334,3333,3333');
        assertReconciled(r, '3-KP cents');
    });

    test('THE KP TIE RULE IS: one recorded winner per hole', () => {
        // kpWinners stores exactly one id per hole - the shape the app has always
        // used. A tie on the sticks is resolved by whoever the group records; the
        // engine never invents a hidden split. Stated here as the explicit rule.
        const r = pool(mk([4], { h4: String(P[5].id) }), SC);
        assert.equal(r.kp.lines[0].winnerName, 'Greg');
        assert.equal(r.kp.lines[0].cents, 10000);
    });

    test('an unclaimed KP refunds the field equally — no vanished money', () => {
        // A refund now requires the organizer to have SAID nobody won it. A blank
        // hole is unresolved, not free money - which is the whole point of Wave B.
        const dUn = mk([4, 14], { h4: String(P[0].id) });
        dUn.kpConfirmed = { confirmed: true };
        dUn.kpNoWinner = { h14: true };
        const r = pool(dUn, SC);
        assert.equal(r.kp.unclaimedCents, 5000);
        assert.equal(r.refund.cents, 5000);
        const shares = Object.values(r.refund.perPlayerCents);
        assert.equal(shares.reduce((a, b) => a + b, 0), 5000);
        assert.ok(shares.every(v => v === 416 || v === 417), '$50 across 12 golfers, cent-exact');
        assertReconciled(r, 'unclaimed KP');
    });

    test('a NON-PARTICIPANT KP winner cannot take pool money', () => {
        const d = mk([4], { h4: String(P[11].id) });
        d.kpConfirmed = { confirmed: true };
        d.moneyPool.participantIds = P.slice(0, 8).map(p => String(p.id));   // Paul excluded
        const r = pool(d, SC);
        assert.equal(r.kp.lines[0].winnerId, null, 'his shot counts; the pool money refunds');
        assert.equal(r.refund.cents >= 10000, true);
        assertReconciled(r, 'outsider KP');
    });
});

// ---------------------------------------------------------------------------
describe('NET FINISH — presets, ties, refund on empty', () => {
    const P = makeField(12);
    const SC = ladderScores(P);
    const mk = places => ({ players: P,
        moneyPool: { enabled: true, buyIn: 40,
            net: { amount: 100, places },
            skins: { mode: 'remainder', scoring: 'net' } } });

    test('top 1 / 2 / 3 / 4 presets pay the ladder in order', () => {
        assert.equal(pool(mk([100]), SC).net.lines.map(l => l.cents).join(','), '10000');
        assert.equal(pool(mk([60, 40]), SC).net.lines.map(l => l.cents).join(','), '6000,4000');
        assert.equal(pool(mk([50, 30, 20]), SC).net.lines.map(l => l.cents).join(','), '5000,3000,2000');
        assert.equal(pool(mk([40, 30, 20, 10]), SC).net.lines.map(l => l.cents).join(','), '4000,3000,2000,1000');
    });

    test('THE NET TIE RULE: tied golfers split the tied places\' combined money', () => {
        const tied = ladderScores(P);
        // Make Manny match Marty exactly → tied for 1st under 50/30/20:
        CD.forEach(h => { tied[`p${P[1].id}_h${h.hole}`] = tied[`p${P[0].id}_h${h.hole}`]; });
        const r = pool(mk([50, 30, 20]), tied);
        const first = r.net.lines.find(l => l.place === 1);
        assert.equal(first.split, true);
        assert.equal(first.pctShare, 80, '1st+2nd percents pool');
        assert.equal(first.ids.length, 2);
        assert.equal(first.cents, 8000);
        // John, alone in 3rd, keeps his 20%.
        assert.equal(r.net.lines.find(l => l.place === 3).cents, 2000);
        assertReconciled(r, 'net tie');
    });

    test('an odd split leaves no cent behind', () => {
        const tied = ladderScores(P);
        CD.forEach(h => {
            tied[`p${P[1].id}_h${h.hole}`] = tied[`p${P[0].id}_h${h.hole}`];
            tied[`p${P[2].id}_h${h.hole}`] = tied[`p${P[0].id}_h${h.hole}`];
        });   // three-way tie for 1st, 50/30/20 → $100 split three ways
        const r = pool(mk([50, 30, 20]), tied);
        const first = r.net.lines.find(l => l.place === 1);
        assert.equal(first.cents, 10000);
        assertReconciled(r, 'three-way tie cents');
    });

    test('no scores at all → the net bucket refunds, stated why', () => {
        const r = pool(mk([50, 30, 20]), {});
        assert.equal(r.net.lines.length, 0);
        assert.ok(r.refund.reasons.some(t => /no scores/.test(t)));
        assertReconciled(r, 'empty net');
    });
});

// ---------------------------------------------------------------------------
describe('SKINS BUCKET — fixed pot through the canonical engine', () => {
    const P = makeField(12);

    test('units come from the settlement skins engine; the pot divides by them', () => {
        // Marty wins h1 outright; h2-h3 tie and carry; John wins h4 with the carry.
        const s = {};
        P.forEach(p => { for (let h = 1; h <= 4; h++) s[`p${p.id}_h${h}`] = 5; });
        s[`p${P[0].id}_h1`] = 3;
        s[`p${P[2].id}_h4`] = 3;
        const d = { players: P, moneyPool: { enabled: true, buyIn: 40,
            skins: { mode: 'remainder', scoring: 'gross', carryOver: true } } };
        const r = pool(d, s);
        assert.equal(r.skins.amountCents, 48000, 'all $480 to skins (config F shape)');
        const marty = r.skins.lines.find(l => l.winnerName === 'Marty');
        const john = r.skins.lines.find(l => l.winnerName === 'John');
        assert.equal(marty.units, 1);
        assert.equal(john.units, 3, 'the two carried holes ride on h4 — the engine\'s own carry rule');
        assert.equal(marty.cents, 12000, '1/4 of the pot');
        assert.equal(john.cents, 36000, '3/4 of the pot');
        assertReconciled(r, 'skins carry');
    });

    test('carryOver=false voids ties — engine rule, pot follows', () => {
        const s = {};
        P.forEach(p => { for (let h = 1; h <= 4; h++) s[`p${p.id}_h${h}`] = 5; });
        s[`p${P[0].id}_h1`] = 3;
        s[`p${P[2].id}_h4`] = 3;
        const d = { players: P, moneyPool: { enabled: true, buyIn: 40,
            skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } };
        const r = pool(d, s);
        assert.equal(r.skins.totalUnits, 2, 'two outright wins, ties void');
        assert.equal(r.skins.lines.find(l => l.winnerName === 'John').cents, 24000);
        assertReconciled(r, 'skins void');
    });

    test('an UNWON pot refunds instead of vanishing — the old bug\'s shadow', () => {
        const s = {};
        P.forEach(p => { for (let h = 1; h <= 6; h++) s[`p${p.id}_h${h}`] = 5; });   // all ties
        const d = { players: P, moneyPool: { enabled: true, buyIn: 40,
            skins: { mode: 'remainder', scoring: 'gross', carryOver: true } } };
        const r = pool(d, s);
        assert.equal(r.skins.lines.length, 0);
        assert.equal(r.refund.cents, 48000, 'every dollar comes home');
        assert.ok(r.refund.reasons.some(t => /no skins were won/.test(t)));
        assertZeroSum(r, 'unwon pot');
    });

    test('NET skins uses net scores — a stroke flips the hole', () => {
        const two = makeField(2, [0, 1]);   // Manny gets one stroke, on the hardest hole
        const hardest = CD.slice().sort((a, b) => a.hcpIndex - b.hcpIndex)[0];
        const s = {};
        two.forEach(p => { s[`p${p.id}_h${hardest.hole}`] = 4; });   // gross tie
        const d = { players: two, moneyPool: { enabled: true, buyIn: 10,
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } } };
        const r = pool(d, s);
        assert.equal(r.skins.lines.length, 1);
        assert.equal(r.skins.lines[0].winnerName, 'Manny', 'net 3 beats net 4');
        assertReconciled(r, 'net skins');
    });
});

// ---------------------------------------------------------------------------
describe('CONFIGS A–H — the week-to-week shapes, no code changes', () => {
    const runCfg = (label, n, buyIn, mpExtra, winners) => {
        const P = makeField(n);
        const d = { players: P, kpWinners: winners || {},
            moneyPool: Object.assign({ enabled: true, buyIn }, mpExtra) };
        const r = pool(d, ladderScores(P));
        assert.equal(r.valid, true, label + ': ' + (r.errors || []).join(' | '));
        assertReconciled(r, label);
        return r;
    };
    const id = (P, i) => String(P[i].id);

    test('A · 12×$40, KP $100/2, Net $100, skins remainder $280', () => {
        const P = makeField(12);
        const r = runCfg('A', 12, 40, {
            kp: { amount: 100, holes: [4, 14] },
            net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net' } },
            { h4: id(P, 0), h14: id(P, 2) });
        assert.equal(r.skins.amountCents, 28000);
    });
    test('B · 1 KP, top-2 net, skins remainder', () => {
        const P = makeField(12);
        runCfg('B', 12, 40, {
            kp: { amount: 100, holes: [14] },
            net: { amount: 100, places: [60, 40] },
            skins: { mode: 'remainder', scoring: 'net' } }, { h14: id(P, 1) });
    });
    test('C · 4 KPs, top-3 net $150, skins remainder', () => {
        const P = makeField(12);
        const r = runCfg('C', 12, 40, {
            kp: { amount: 100, holes: [4, 8, 12, 14] },
            net: { amount: 150, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net' } },
            { h4: id(P, 0), h8: id(P, 1), h12: id(P, 2), h14: id(P, 3) });
        assert.equal(r.skins.amountCents, 48000 - 10000 - 15000);
    });
    test('D · 8×$50, no KP, top-2 net, skins remainder', () => {
        const r = runCfg('D', 8, 50, {
            net: { amount: 100, places: [60, 40] },
            skins: { mode: 'remainder', scoring: 'net' } });
        assert.equal(r.totalPoolCents, 40000);
        assert.equal(r.skins.amountCents, 30000);
    });
    test('E · 16×$25, KP $80, no net, skins remainder', () => {
        const P = makeField(16);
        const r = runCfg('E', 16, 25, {
            kp: { amount: 80, holes: [4, 14] },
            skins: { mode: 'remainder', scoring: 'net' } }, { h4: id(P, 4), h14: id(P, 5) });
        assert.equal(r.totalPoolCents, 40000);
        assert.equal(r.skins.amountCents, 32000);
    });
    test('F · ALL money to skins', () => {
        const r = runCfg('F', 12, 40, { skins: { mode: 'remainder', scoring: 'gross' } });
        assert.equal(r.skins.amountCents, 48000);
        assert.equal(r.kp, null); assert.equal(r.net, null);
    });
    test('G · ALL money to net finishers', () => {
        const r = runCfg('G', 12, 40, {
            net: { amount: 480, places: [50, 30, 20] }, skins: { mode: 'none' } });
        assert.equal(r.net.amountCents, 48000);
        assert.equal(r.skins, null);
    });
    test('H · KP + net only, no skins — must fully allocate', () => {
        const P = makeField(12);
        const r = runCfg('H', 12, 40, {
            kp: { amount: 180, holes: [4, 14] },
            net: { amount: 300, places: [50, 30, 20] },
            skins: { mode: 'none' } }, { h4: id(P, 0), h14: id(P, 1) });
        assert.equal(r.kp.amountCents + r.net.amountCents, 48000);
    });
});

// ---------------------------------------------------------------------------
describe('PARTICIPANTS, LOCK, LEGACY', () => {
    const P = makeField(12);
    const SC = ladderScores(P);

    test('an excluded golfer pays nothing, wins nothing, still scores', () => {
        const d = { players: P,
            moneyPool: { enabled: true, buyIn: 40,
                participantIds: P.slice(1).map(p => String(p.id)),   // Marty out
                net: { amount: 100, places: [100] },
                skins: { mode: 'remainder', scoring: 'net' } } };
        const r = pool(d, SC);
        assert.equal(r.totalPoolCents, 44000, '11 × $40');
        assert.equal(r.perPlayerCents[String(P[0].id)], undefined, 'no debit, no ledger row');
        // Marty has the best card, but Manny — the best PARTICIPANT — takes 1st.
        assert.equal(r.net.lines[0].names[0], 'Manny');
        assert.equal(r.skins.lines.every(l => l.winnerName !== 'Marty'), true,
            'his low scores cannot win pool skins either');
        assertReconciled(r, 'excluded');
    });

    test('remainder recomputes when the field or buy-in changes', () => {
        const mk = (n, buyIn) => ({ players: makeField(n),
            moneyPool: { enabled: true, buyIn,
                kp: { amount: 100, holes: [4] },
                skins: { mode: 'remainder', scoring: 'net' } } });
        assert.equal(pool(mk(12, 40), {}).skins.amountCents, 38000);
        assert.equal(pool(mk(10, 40), {}).skins.amountCents, 30000);
        assert.equal(pool(mk(12, 50), {}).skins.amountCents, 50000, 'derived, never stale');
    });

    test('rules lock the moment anyone has scored', () => {
        vm.runInContext(`window.__l1 = moneyPoolRulesLocked({ scores: {} });
                         window.__l2 = moneyPoolRulesLocked({ scores: { p101_h1: 4 } });`, E);
        assert.equal(E.window.__l1, false);
        assert.equal(E.window.__l2, true);
    });

    test('LEGACY: a round with no moneyPool settles byte-identically', () => {
        const d = { players: P.slice(0, 4), gameFormat: 'stroke',
            additionalGameInstances: { s1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross' } } };
        const sc = ladderScores(P.slice(0, 4));
        vm.runInContext(`window.__n = computeMoneyPoolNetByPlayerId(${J(d)}, ${J(CD)}, ${J(sc)});`, E);
        assert.equal(Object.keys(E.window.__n).length, 0, 'no pool, no contribution');
        const c = combined(d, sc);
        const total = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        assert.ok(Math.abs(total) < 0.01, 'existing skins wager still settles cleanly');
    });

    test('the pool coexists with Group Action — separate money, one ledger', () => {
        const d = { players: P, gameFormat: 'stroke',
            kpWinners: { h4: String(P[0].id) }, kpConfirmed: { confirmed: true },
            moneyPool: { enabled: true, buyIn: 40,
                kp: { amount: 100, holes: [4] },
                skins: { mode: 'remainder', scoring: 'net' } },
            sideMatches: { m1: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime',
                startHole: 1, scope: 'group', ownerGroup: 1,
                teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)],
                presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } } };
        const c = combined(d, SC);
        const total = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        assert.ok(Math.abs(total) < 0.01, 'pool + group action + $78 press, one zero-sum ledger');
    });
});

// ---------------------------------------------------------------------------
describe('20 POOL SIMULATIONS', () => {
    let n = 0;
    const sim = (label, fn) => test(`SIM ${++n} — ${label}`, fn);
    const quick = (nPlayers, buyIn, mp, winners, scoreFn, hcps) => {
        const label = 'sim';
        const P = makeField(nPlayers, hcps);
        const scores = scoreFn ? scoreFn(P) : ladderScores(P);
        const d = { players: P, kpWinners: winners || {},
            kpConfirmed: { confirmed: true },      // a completed simulation
            moneyPool: Object.assign({ enabled: true, buyIn }, mp) };
        const r = pool(d, scores);
        assert.equal(r.valid, true, label + ': ' + (r.errors || []).join('|'));
        assertReconciled(r, label);
        // Same rule as assertReconciled: the combined ledger balances to zero only
        // once every dollar is distributed. A simulation whose KP holes are blank
        // leaves that money deliberately unresolved, and the ledger is short by
        // exactly that much - which is the honest state, not a leak.
        const c = combined(d, scores);
        const t = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        const unresolved = (r.kpUnresolvedCents || 0) / 100;
        assert.ok(Math.abs(t + unresolved) < 0.01,
            label + ': combined ledger must be short by exactly the unresolved KP ($'
            + unresolved + '), got $' + t);
        return { r, c, P };
    };
    const id = (P, i) => String(P[i].id);

    sim('the $480 Monday itself', () => {
        const P = makeField(12);
        quick(12, 40, { kp: { amount: 100, holes: [4, 14] }, net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net' } }, { h4: id(P, 0), h14: id(P, 2) });
    });
    sim('odd buy-in $37.50, cents stay exact', () => {
        const { r } = quick(8, 37.5, { skins: { mode: 'remainder', scoring: 'net' } });
        assert.equal(r.totalPoolCents, 30000);
    });
    sim('odd KP pot $77 across 3 holes', () => {
        const P = makeField(12);
        quick(12, 40, { kp: { amount: 77, holes: [4, 8, 14] }, skins: { mode: 'remainder', scoring: 'net' } },
            { h4: id(P, 0), h8: id(P, 1), h14: id(P, 2) });
    });
    sim('winner-take-all net, 6 players', () => quick(6, 20, {
        net: { amount: 120, places: [100] }, skins: { mode: 'none' } }));
    sim('top-4 net 40/30/20/10', () => quick(12, 40, {
        net: { amount: 480, places: [40, 30, 20, 10] }, skins: { mode: 'none' } }));
    sim('two-way net tie splits 1st+2nd', () => {
        const scoreFn = P => { const s = ladderScores(P);
            CD.forEach(h => { s[`p${P[1].id}_h${h.hole}`] = s[`p${P[0].id}_h${h.hole}`]; }); return s; };
        const { r } = quick(12, 40, { net: { amount: 100, places: [60, 40] },
            skins: { mode: 'remainder', scoring: 'net' } }, {}, scoreFn);
        assert.equal(r.net.lines[0].cents, 10000);
    });
    sim('gross skins, mixed handicaps', () => quick(12, 40,
        { skins: { mode: 'remainder', scoring: 'gross' } }, {}, null,
        [0, 2, 4, 6, 8, 10, 12, 3, 5, 7, 9, 11]));
    sim('net skins, mixed handicaps', () => quick(12, 40,
        { skins: { mode: 'remainder', scoring: 'net' } }, {}, null,
        [0, 2, 4, 6, 8, 10, 12, 3, 5, 7, 9, 11]));
    sim('no-carry void ties', () => quick(12, 40,
        { skins: { mode: 'remainder', scoring: 'gross', carryOver: false } }));
    sim('fixed skins beside remainder-less config', () => quick(12, 40, {
        kp: { amount: 100, holes: [4] }, net: { amount: 100, places: [100] },
        skins: { mode: 'fixed', amount: 280 } }, { h4: 'x' }));
    sim('16 players, $25', () => quick(16, 25, { kp: { amount: 80, holes: [4, 14] },
        skins: { mode: 'remainder', scoring: 'net' } }));
    sim('smallest pool: 2 golfers', () => quick(2, 40, { skins: { mode: 'remainder', scoring: 'net' } }));
    sim('a blank KP hole is UNRESOLVED, not a refund', () => {
        // This used to assert the opposite - that an unentered KP hole refunded to
        // the field. That is precisely the behaviour that turned $100 of KP nobody
        // had typed in into $8 and $9 lines on a receipt calling itself final.
        const { r } = quick(12, 40, { kp: { amount: 100, holes: [4, 14] },
            skins: { mode: 'remainder', scoring: 'net' } }, { h4: String(makeField(12)[0].id) });
        assert.equal(r.kpUnresolvedCents, 5000, 'hole 14 is unresolved, not given away');
        assert.equal(r.settled, false);
        assert.ok(!/Unclaimed KP/.test(r.refund.reasons.join(' ')));
    });
    sim('mid-round: only 6 holes scored, still zero-sum', () => quick(12, 40,
        { net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder', scoring: 'net' } }, {},
        P => { const s = {}; P.forEach((p, i) => CD.slice(0, 6).forEach(h => {
            s[`p${p.id}_h${h.hole}`] = h.par + i; })); return s; }));
    sim('SCORE CORRECTION moves the prize, not the pot', () => {
        const P = makeField(12);
        const before = quick(12, 40, { net: { amount: 480, places: [100] }, skins: { mode: 'none' } });
        const flipped = pShots => { const s = ladderScores(pShots);
            CD.forEach(h => { s[`p${pShots[0].id}_h${h.hole}`] = h.par + 20; }); return s; };
        const after = quick(12, 40, { net: { amount: 480, places: [100] }, skins: { mode: 'none' } }, {}, flipped);
        assert.equal(before.r.net.lines[0].names[0], 'Marty');
        assert.equal(after.r.net.lines[0].names[0], 'Manny', 'the corrected card crowns a new winner');
    });
    sim('exclusion shrinks the pot and the field', () => {
        const P = makeField(12);
        const d = { players: P, moneyPool: { enabled: true, buyIn: 40,
            participantIds: P.slice(0, 10).map(p => String(p.id)),
            skins: { mode: 'remainder', scoring: 'net' } } };
        const r = pool(d, ladderScores(P));
        assert.equal(r.totalPoolCents, 40000);
        assertReconciled(r, 'exclusion sim');
    });
    sim('3 groups + group action + pool in one combined ledger', () => {
        const P = makeField(12);
        const d = { players: P, gameFormat: 'stroke',
            kpWinners: { h4: id(P, 0) }, kpConfirmed: { confirmed: true },
            moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [4] },
                net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder', scoring: 'net' } },
            additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5,
                participantIds: P.slice(0, 4).map(p => String(p.id)) } },
            dots: { h5: { ['p' + id(P, 0)]: ['birdie'], ['p' + id(P, 8)]: ['sandy'] } },
            sideMatches: { x: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'none',
                startHole: 1, scope: 'cross', teamAIds: [id(P, 0)], teamBIds: [id(P, 4)] } } };
        const sc = ladderScores(P);
        const c = combined(d, sc);
        const t = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        assert.ok(Math.abs(t) < 0.01, 'pool + dots + cross match, one $0 ledger');
        const r = pool(d, sc);
        assertReconciled(r, '3-group sim');
    });
    sim('everything-to-net with a 4-way tie for last paid place', () => {
        const scoreFn = P => { const s = ladderScores(P);
            [3, 4, 5].forEach(i => CD.forEach(h => { s[`p${P[i].id}_h${h.hole}`] = s[`p${P[2].id}_h${h.hole}`]; }));
            return s; };
        const { r } = quick(12, 40, { net: { amount: 480, places: [50, 30, 20] },
            skins: { mode: 'none' } }, {}, scoreFn);
        const third = r.net.lines.find(l => l.place === 3);
        assert.equal(third.ids.length, 4, 'four tied for 3rd');
        assert.equal(third.cents, 9600, 'they split ONLY 3rd\'s 20%');
    });
    sim('remainder $0 is legal when fixed buckets consume the pot', () => {
        const P = makeField(12);
        const { r } = quick(12, 40, { kp: { amount: 180, holes: [4, 14] },
            net: { amount: 300, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net' } }, { h4: id(P, 0), h14: id(P, 1) });
        assert.equal(r.skins.amountCents, 0);
    });
    sim('the heavy one: 16 golfers, every bucket, ties, odd cents', () => {
        const P = makeField(16, NAMES.slice(0, 16).map((_, i) => i % 5));
        const scoreFn = () => { const s = ladderScores(P);
            CD.forEach(h => { s[`p${P[6].id}_h${h.hole}`] = s[`p${P[5].id}_h${h.hole}`]; }); return s; };
        quick(16, 35, { kp: { amount: 77, holes: [4, 8, 14] },
            net: { amount: 133, places: [40, 30, 20, 10] },
            skins: { mode: 'remainder', scoring: 'net' } },
            { h4: id(P, 0), h8: id(P, 9) }, scoreFn,
            NAMES.slice(0, 16).map((_, i) => i % 5));
    });
});

// ---------------------------------------------------------------------------
describe('RENDERED SURFACES — the pool a golfer actually sees', () => {
    const { loadHtmlInlineScript } = require('./helpers/load-script.js');
    const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
    const P = makeField(12);
    const SC = ladderScores(P);
    const ROUND = () => ({ players: P, courseData: CD, gameFormat: 'stroke', scores: SC,
        kpWinners: { h4: String(P[0].id) }, kpConfirmed: { confirmed: true },
        // Hole 14 refunds because the organizer SAID nobody won it. A blank hole is
        // unresolved instead - silence is not a decision.
        kpNoWinner: { h14: true },
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [4, 14] },
            net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } } });

    function bootIndex(group, hole) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const gm = {}; P.forEach((pl, i) => { gm[pl.id] = Math.floor(i / 4) + 1; });
        vm.runInContext(`
            window.__writes = []; window.__alerts = [];
            alert = m => window.__alerts.push(String(m));
            db.ref = function (pth) { return { set: function (v) { window.__writes.push({ path: pth, value: v }); return Promise.resolve(); },
                on: function () {}, push: function () { return { key: 'k' }; }, remove: function () { return Promise.resolve(); },
                update: function (v) { window.__writes.push({ path: pth, value: v, atomic: true }); return Promise.resolve(); } }; };
            currentMode = 'ABCD';
            currentData = ${J(ROUND())};
            window.__scPlayerGroupMap = ${J(gm)}; window.__scFilteredPlayers = currentData.players;
            hasGroupLock = ${group !== null}; lockedGroup = ${group === null ? 'null' : group};
            selectedGroup = ${group === null ? "'all'" : group};
            currentViewedHole = ${hole}; actionCenterOpen = true;
            renderActionCenter();
        `, sb);
        return sb;
    }

    test('SCORECARD banner: pot, KP progress, net leader, skins count', () => {
        const html = bootIndex(1, 7).document.getElementById('action-center-mount').innerHTML;
        assert.match(html, /Main Pool \u00B7 \$480/);
        assert.match(html, /KP 1\/2 claimed/);
        assert.match(html, /Marty leads net/);
        assert.match(html, /skins won/);
    });

    test('KP ENTRY appears on a KP hole, writes the canonical shape, confirms after', async () => {
        // The UI is now a live-leader block rather than a bare dropdown, and the write
        // is ONE atomic update on the round rather than a leaf .set(). That is a
        // stronger contract, not a looser one: the leader, the settlement winner and
        // the cleared confirmation land together or not at all, so kpLeaders and
        // kpWinners can never disagree while the UI claims a result is final.
        const sb = bootIndex(2, 14);
        const html = sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(html, /Hole 14 KP/);
        assert.match(html, /Set KP Leader/);

        vm.runInContext(`savePoolKp(14, '${String(P[4].id)}');`, sb);
        await new Promise(r => setImmediate(r));

        assert.equal(sb.window.__writes.length, 1, 'exactly one write, and it must be atomic');
        const w = sb.window.__writes[0];
        assert.equal(w.atomic, true, 'a leaf .set() would let the three paths diverge');
        assert.match(w.path, /events\/ABCD$/);
        assert.equal(w.value['kpWinners/h14'], String(P[4].id), 'settlement source still written');
        assert.equal(w.value['kpLeaders/h14'].playerId, String(P[4].id), 'live leader written');
        assert.equal(w.value['kpLeaders/h14'].distanceInches, null, 'distance stays optional');
        assert.equal(w.value['kpConfirmed'], null, 'any leader change unconfirms the round');
        assert.ok(sb.window.__alerts.some(a => /KP RECORDED/.test(a)));
    });

    test('KP entry is absent on a non-KP hole; spectators get read-only', () => {
        assert.ok(!/Hole 7 KP/.test(bootIndex(1, 7).document.getElementById('action-center-mount').innerHTML));
        const spec = bootIndex(null, 14).document.getElementById('action-center-mount').innerHTML;
        assert.match(spec, /Hole 14 KP/, 'a spectator still SEES the marker');
        assert.ok(!/Set KP Leader|New Leader|kp-select/.test(spec),
            'but is offered no way to claim it');
    });

    test('RECEIPT section itemizes every bucket and the refund', () => {
        const sb = loadHtmlInlineScript('settlement.html', PAGE);
        vm.runInContext(`
            db.ref = function () { return { on: function () {}, set: function () { return Promise.resolve(); } }; };
            currentMode = 'ABCD'; currentData = ${J(ROUND())};
            document.__declare && document.__declare('money-pool-section', 'div');
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);
        `, sb);
        const html = sb.document.getElementById('money-pool-section').innerHTML;
        assert.match(html, /Main Pool \u2014 \$480/);
        // The per-head buy-in arithmetic was removed: the pot total is useful, what
        // each golfer paid in is not something the Receipt needs to state.
        assert.ok(!/\(12 \u00D7 \$40\)/.test(html), 'the buy-in must not be shown');
        assert.match(html, /Hole 4: Marty/);
        // "unclaimed" implied a decision nobody made. A confirmed round with an
        // explicit no-winner reads "no winner"; an unresolved one reads "pending".
        assert.match(html, /Hole 14: no winner/);
        assert.match(html, /1st: Marty[\s\S]*\$50/);
        assert.match(html, /Skins Pot \u2014 \$280/);
        assert.match(html, /Refunded to the field/);
    });

    test('a NO-POOL round renders no banner and no receipt section', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        vm.runInContext(`
            db.ref = function () { return { on: function () {}, set: function () { return Promise.resolve(); }, push: function () { return { key: 'k' }; } }; };
            currentMode = 'ABCD';
            currentData = ${J({ players: P.slice(0, 4), courseData: CD, gameFormat: 'stroke', scores: {}, sideMatches: {} })};
            window.__scPlayerGroupMap = {}; window.__scFilteredPlayers = currentData.players;
            hasGroupLock = false; lockedGroup = null; selectedGroup = 'all';
            currentViewedHole = 1; actionCenterOpen = true;
            renderActionCenter();
        `, sb);
        const html = sb.document.getElementById('action-center-mount').innerHTML || '';
        assert.ok(!/Main Pool/.test(html), 'legacy rounds see nothing new');
    });
});

// ---------------------------------------------------------------------------
describe('SCALE — 7 groups, 28 golfers, different money (Manny\'s pre-commit question)', () => {
    // Nothing in the pool knows about groups, and nothing hardcodes a field
    // size: the pot is buyIn × participants, splits are cent-exact at any n,
    // and winners come from engines that already serve any field. These tests
    // pin that claim at Marty's real ceiling instead of asserting it.
    // Handicaps zero on purpose: gross par+(i%7) then IS the net, giving exactly
    // four golfers on every net rung - a guaranteed 4-way tie inside the paid
    // places. (Mixed handicaps at scale are covered by the heavy-16 sim.)
    const P28 = makePlayers(
        Array.from({ length: 28 }, (_, i) => 'G' + (Math.floor(i / 4) + 1) + 'P' + (i % 4 + 1)),
        Array.from({ length: 28 }, () => 0));
    const gmap = {}; P28.forEach((p, i) => { gmap[p.id] = Math.floor(i / 4) + 1; });
    const SC28 = (() => { const s = {}; P28.forEach((p, i) =>
        CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par + (i % 7); })); return s; })();
    const ROUND28 = () => JSON.parse(JSON.stringify({
        players: P28, courseData: CD, gameFormat: 'stroke', scores: SC28,
        kpWinners: { h4: String(P28[9].id), h8: String(P28[17].id) }, kpConfirmed: { confirmed: true },   // groups 3 and 5 claimed
        moneyPool: { enabled: true, buyIn: 20,
            kp: { amount: 90, holes: [4, 8, 14] },
            net: { amount: 150, places: [40, 30, 20, 10] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } } }));

    test('28 × $20 = $560 reconciles to the cent, ties and carries included', () => {
        const d = ROUND28();
        const r = pool(d, SC28);
        assert.equal(r.valid, true, r.errors.join('|'));
        assert.equal(r.totalPoolCents, 56000);
        assert.equal(r.kp.perHoleCents.join(','), '3000,3000,3000');
        assert.equal(r.skins.amountCents, 56000 - 9000 - 15000);
        // The 7-shot score cycle ties four golfers on every net rung, so the top
        // FOUR paid places are one 4-way tie: those golfers split the entire net
        // bucket (40+30+20+10 = 100%) and nobody below them is paid.
        const first = r.net.lines[0];
        assert.equal(first.place, 1);
        assert.equal(first.split, true);
        assert.equal(first.ids.length, 4, 'a full four-way tie for 1st');
        assert.equal(first.pctShare, 100, 'they absorb every paid place');
        assert.equal(first.cents, 15000, 'the whole $150 net bucket, split four ways');
        assert.equal(r.net.lines.length, 1, 'no money left for 5th');
        assertReconciled(r, '28-player');
        const c = combined(d, SC28);
        const t = Object.values(c.exact).reduce((a, p) => a + p.net, 0);
        const unresolved28 = (r.kpUnresolvedCents || 0) / 100;
        assert.ok(Math.abs(t + unresolved28) < 0.01,
            'combined ledger at 28 must be short by exactly the unresolved KP');
        const owed = Object.values(c.exact).filter(p => p.net > 0).reduce((a, p) => a + p.net, 0);
        const paid = c.transactions.reduce((a, t2) => a + t2.amount, 0);
        assert.ok(Math.abs(Math.round(owed) - paid) <= 1, 'Who Pays Who reconstructs at 28');
    });

    test('a DIFFERENT week: $35 buy-in, 1 KP, winner-take-all — config only', () => {
        const d = ROUND28();
        d.moneyPool = { enabled: true, buyIn: 35, kp: { amount: 100, holes: [14] },
            net: { amount: 200, places: [100] }, skins: { mode: 'remainder', scoring: 'gross' } };
        d.kpWinners = { h14: String(P28[25].id) };   // group 7 claims it
        const r = pool(d, SC28);
        assert.equal(r.totalPoolCents, 98000, '28 × $35');
        assert.equal(r.kp.lines[0].winnerName, 'G7P2');
        assertReconciled(r, 'different-week');
    });

    test('the banner renders on a GROUP 6 link; the KP picker on GROUP 7\'s hole', () => {
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
        const sb = loadHtmlInlineScript('index.html', PAGE);
        vm.runInContext(`
            window.__writes = []; window.__alerts = [];
            alert = m => window.__alerts.push(String(m));
            db.ref = function (pth) { return { set: function (v) { window.__writes.push({ path: pth, value: v }); return Promise.resolve(); },
                on: function () {}, push: function () { return { key: 'k' }; },
                remove: function () { return Promise.resolve(); },
                // Records the atomic multi-path write the KP leader path now uses.
                update: function (v) { window.__writes.push({ path: pth, value: v, atomic: true }); return Promise.resolve(); } }; };
            currentMode = 'ABCD';
            currentData = ${J(ROUND28())};
            window.__scPlayerGroupMap = ${J(gmap)};
            window.__scFilteredPlayers = currentData.players.filter(p => String(${J(gmap)}[p.id]) === '6');
            hasGroupLock = true; lockedGroup = 6; selectedGroup = 6;
            currentViewedHole = 14; actionCenterOpen = true;
            renderActionCenter();
        `, sb);
        const html = sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(html, /Main Pool \u00B7 \$560/, 'the pot is one truth for all seven groups');
        assert.match(html, /KP 2\/3 claimed/);
        assert.match(html, /Hole 14 KP/, 'the unclaimed hole shows its marker to every group');
        assert.match(html, /Set KP Leader/, 'and offers the picker to the group standing on it');

        // CONTRACT REVERSED, DELIBERATELY. This used to assert that "group 6 records
        // group 7's winner - any scorekeeper may". That was wrong: it let a group move
        // KP money on a shot nobody in that group saw. A group may now name only its
        // own golfers, matching the rule score-writing has always followed.
        const g7 = P28[26];                      // index 26 -> group 7
        vm.runInContext(`savePoolKp(14, '${String(g7.id)}');`, sb);
        return new Promise(res => setImmediate(() => {
            assert.equal(sb.window.__writes.length, 0,
                'a group 6 link must not be able to claim a group 7 golfer');
            assert.ok(sb.window.__alerts.some(a => /own group/.test(a)),
                'and the refusal must say why');

            const g6 = P28[21];                  // index 21 -> group 6
            vm.runInContext(`savePoolKp(14, '${String(g6.id)}');`, sb);
            setImmediate(() => {
                assert.equal(sb.window.__writes.length, 1, 'but it may name its own');
                assert.equal(sb.window.__writes[0].value['kpWinners/h14'], String(g6.id));
                res();
            });
        }));
    });
});
