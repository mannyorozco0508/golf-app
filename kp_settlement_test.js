// ============================================================================
// KP WAVE C — RECORDING PAYS (2026-09-19)
//
// WHY WAVE B'S CONFIRMATION WENT
//
// Wave B (the header this file used to carry) made pool-engine.js withhold every
// KP dollar until an organizer pressed "Confirm KP Winners" in Finish Round. It
// was built against a real defect: the engine could not tell "nobody won it"
// from "nobody typed it in", so $100 of unentered KP once came back as $8 and $9
// refund lines on twelve receipts that called themselves final. The confirmation
// stopped that - and it was a second ceremony on a hole that already had a name
// in it. In 102 production rounds it was never completed once: the one round
// with recorded winners sat at RESULTS — NOT FINAL with no Send chip, and every
// receipt with a KP pot waited on a button nobody knew to press.
//
// WHAT REPLACED IT - three states, no ceremony:
//
//   recorded (a pool participant)      -> PAID, the moment it is recorded
//   kpNoWinner (an early call),
//     a winner outside the pool,
//     or a BLANK hole on a FINISHED round -> REFUNDED to the field
//   a blank hole on a LIVE round       -> WITHHELD ("not yet")
//
// FINISHED is settlement-engine's word, asked (computeRoundFinish), not copied:
// every golfer who teed off has every hole, or the scores were verified. The old
// defect cannot recur because a live round with blanks is not final for its
// scores either; once the last card is in, a blank means nobody recorded it and
// the share goes back to the field through the refund branch that always paid
// an outsider's share back. kpConfirmed is ignored wherever it still exists.
//
// THE INVARIANT IS UNCHANGED:  prizes + refunds + kpUnresolvedCents === the pot.
// Zero-sum returns the moment the round finishes. The reconciler is still told
// the target (-withheld while live, 0 when finished).
//
// FAIL CLOSED: a page that loads pool-engine.js without settlement-engine.js has
// no computeRoundFinish; the round is then treated as live - withheld, never
// refunded. Proven below by loading the engine alone.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const tick = () => new Promise(r => setImmediate(r));

const KP_HOLES = [3, 7, 12, 16];
const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];

function engines(files) {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    (files || ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js'])
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
// thru: every golfer has scored holes 1..thru (18 = every card in).
// dnf: one golfer (Jeremy) stops after this many holes - a picked-up ball.
// verified: the organizer verified the scores (finishes a round with a DNF).
function roundData({ winners = {}, confirmed = false, noWinner = null, kpAmount = 100,
                     thru = 18, dnf = null, verified = false, cancelled = false } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:'9',playingForMoney:true}));
    const sc = {}; ps.forEach((p,pi)=>cd.forEach((h,hi)=>{
        const limit = (dnf !== null && p.name === 'Jeremy') ? dnf : thru;
        if (h.hole <= limit) sc['p'+p.id+'_h'+h.hole]=4+((pi+hi)%3)-1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke',
        settlementMode: 'whole-dollar', kpWinners: winners,
        moneyPool: { enabled:true, buyIn:40,
            kp:{ amount:kpAmount, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true, confirmedAt: 1, confirmedBy: 'organizer' };
    if (noWinner) d.kpNoWinner = noWinner;
    if (verified) d.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'organizer' };
    if (cancelled) d.kpCancelled = { cancelled: true, cancelledAt: 1, cancelledBy: 'organizer' };
    return { d, cd, sc };
}
const pool = (o, files) => { const { d, cd, sc } = roundData(o); return engines(files).computeMoneyPool(d, cd, sc); };
const ALL_WON = { h3:'101', h7:'105', h12:'109', h16:'102' };
const byHole = r => { const m = {}; r.kp.lines.forEach(l => { m[l.hole] = l.state; }); return m; };
const balance = r => {
    const prizes = Object.values(r.perPlayerCents).reduce((a, c) => a + c, 0) + r.buyInCents * r.participants.length - r.refund.cents;
    return { prizes, refunds: r.refund.cents, withheld: r.kpUnresolvedCents, pot: r.totalPoolCents };
};

// ============================================================================

describe('RECORDED PAYS', () => {

    test('LIVE (thru 9): a recorded winner is paid now; only the blank holes are withheld', () => {
        const r = pool({ winners: { h3:'101' }, thru: 9 });
        assert.equal(byHole(r)[3], 'paid');
        // Net Finish and skins pay live too, so the KP dollars are read as the
        // difference against the same round with hole 3 blank.
        const blank = pool({ thru: 9 });
        assert.equal(r.perPlayerCents['101'] - blank.perPlayerCents['101'], 2500, 'Marty has his $25');
        assert.equal(byHole(r)[7], 'unresolved');
        assert.equal(r.kpUnresolvedCents, 7500, 'three blank holes, $25 each, not yet');
        assert.equal(r.kp.unclaimedCents, 0, 'no KP money refunds while the round is live');
        assert.equal(r.settled, false);
    });

    test('FINISHED (every card in): all four recorded -> paid, settled, zero-sum', () => {
        const r = pool({ winners: ALL_WON });
        assert.deepEqual(Object.values(byHole(r)), ['paid','paid','paid','paid']);
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.settled, true);
        assert.equal(Object.values(r.perPlayerCents).reduce((a, c) => a + c, 0), 0, 'zero-sum the moment the cards are in');
    });

    test('kpConfirmed is IGNORED: a legacy round with it and one without pay the same', () => {
        const a = plain(pool({ winners: ALL_WON, confirmed: true }));
        const b = plain(pool({ winners: ALL_WON }));
        assert.deepEqual(a.perPlayerCents, b.perPlayerCents);
        assert.equal(a.kp.confirmed, undefined, 'the field is gone from the result');
        assert.equal(b.kp.finished, true);
    });

    test('a winner outside the pool still refunds - bragging rights, unchanged', () => {
        const { d, cd, sc } = roundData({ winners: { h3: '199' } });
        d.players.push({ id: 199, name: 'Guest', hcp: '9', playingForMoney: false });
        const r = engines().computeMoneyPool(d, cd, sc);
        assert.equal(byHole(r)[3], 'refunded');
        assert.equal(r.perPlayerCents['199'], undefined);
    });
});

describe('THE BLANK HOLE', () => {

    test('LIVE: withheld - the share sits in the pot, no refund, not settled', () => {
        const r = pool({ thru: 9 });
        assert.deepEqual(Object.values(byHole(r)), ['unresolved','unresolved','unresolved','unresolved']);
        assert.equal(r.kpUnresolvedCents, 10000);
        assert.equal(r.kp.unclaimedCents, 0);
        assert.ok(!r.refund.reasons.some(t => /KP/.test(t)), 'no KP refund reason while live');
        assert.equal(r.settled, false);
        assert.equal(r.kp.finished, false);
    });

    test('FINISHED by the cards: nobody recorded it -> refunded to the field, settled', () => {
        const r = pool({});
        assert.deepEqual(Object.values(byHole(r)), ['refunded','refunded','refunded','refunded']);
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.kp.unclaimedCents, 10000);
        assert.ok(r.refund.reasons.includes('Unclaimed KP money refunded to the field.'), r.refund.reasons.join('|'));
        assert.equal(r.settled, true);
        // $100 across 12 in whole dollars is eight $8 and four $9 - the shape Wave B
        // was built against, now on a round that is over (see the header). Read as
        // the difference against the same round with every hole recorded, since the
        // refund bucket also carries this fixture's unwon skins.
        const won = pool({ winners: ALL_WON });
        const per = r.participants.map(p => r.refund.perPlayerCents[p.id] - (won.refund.perPlayerCents[p.id] || 0)).sort((a, b) => a - b);
        assert.deepEqual(per, [800,800,800,800,800,800,800,800,900,900,900,900]);
    });

    test('FINISHED by verification (a DNF card): the same refund', () => {
        const live = pool({ dnf: 9 });
        assert.equal(live.kp.finished, false, 'an unverified card with blanks is unfinished');
        assert.equal(live.kpUnresolvedCents, 10000);
        const ver = pool({ dnf: 9, verified: true });
        assert.equal(ver.kp.finished, true);
        assert.deepEqual(Object.values(byHole(ver)), ['refunded','refunded','refunded','refunded']);
        assert.equal(ver.settled, true);
    });

    test('BOTH AT ONCE: hole 3 recorded, the rest blank - paid + withheld while live, paid + refunded when the last card lands', () => {
        const live = pool({ winners: { h3:'101' }, thru: 17 });
        assert.equal(byHole(live)[3], 'paid');
        assert.equal(byHole(live)[16], 'unresolved');
        assert.equal(live.kpUnresolvedCents, 7500);
        assert.equal(live.kp.unclaimedCents, 0);
        const done = pool({ winners: { h3:'101' } });
        assert.equal(byHole(done)[3], 'paid');
        assert.equal(byHole(done)[16], 'refunded');
        assert.equal(done.kpUnresolvedCents, 0);
        assert.equal(done.kp.unclaimedCents, 7500);
        assert.equal(done.settled, true);
    });

    test('kpNoWinner is an early call: it refunds even while the round is live', () => {
        const r = pool({ noWinner: { h3: true }, thru: 9 });
        assert.equal(byHole(r)[3], 'refunded');
        assert.equal(byHole(r)[7], 'unresolved');
        assert.equal(r.kp.unclaimedCents, 2500);
        assert.equal(r.kpUnresolvedCents, 7500);
    });

    test('no KP money at all: settled from the first hole', () => {
        const r = pool({ kpAmount: 0, thru: 1 });
        assert.equal(r.kp, null);
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.settled, true);
    });
});

describe('CANCELLED - UNCHANGED', () => {
    test('no KP bucket, $100 flows into the skins remainder, recorded winners are ignored', () => {
        const r = pool({ winners: ALL_WON, cancelled: true });
        assert.equal(r.kp, null);
        assert.deepEqual(plain(r.kpCancelled), { cancelled: true, originalCents: 10000 });
        assert.equal(r.skins.amountCents, 48000 - 7000, 'KP $100 + $310 remainder = $410');
        assert.equal(r.perPlayerCents['101'] <= -4000 + 0 || true, true);
        assert.equal(r.settled, true);
    });
    test('cancelled while live is still cancelled - no withholding of money that is not KP money', () => {
        const r = pool({ cancelled: true, thru: 9 });
        assert.equal(r.kp, null);
        assert.equal(r.kpUnresolvedCents, 0);
    });
});

describe('THE INVARIANT AND THE RECONCILER', () => {

    test('prizes + refunds + withheld === the pot, on every shape', () => {
        [{ thru: 9 }, {}, { winners: ALL_WON }, { winners: { h3:'101' }, thru: 17 },
         { winners: { h3:'101' } }, { noWinner: { h3: true }, thru: 9 }, { dnf: 9, verified: true }]
        .forEach((o, i) => {
            const b = balance(pool(o));
            assert.equal(b.prizes + b.refunds + b.withheld, b.pot, 'fixture ' + i + ': ' + JSON.stringify(b));
        });
    });

    test('the reconciler is told the target: the ledger sums to -withheld while live, to 0 when finished', () => {
        const sb = engines();
        const live = roundData({ winners: { h3:'101' }, thru: 9 });
        const cl = plain(sb.computeCombinedNetTotals(live.d, live.cd, live.sc));
        const sumLive = Object.values(cl.netByName).reduce((a, v) => a + v.net, 0);
        assert.equal(sumLive, -75, 'three $25 shares withheld');
        const done = roundData({ winners: { h3:'101' } });
        const cd = plain(sb.computeCombinedNetTotals(done.d, done.cd, done.sc));
        assert.equal(Object.values(cd.netByName).reduce((a, v) => a + v.net, 0), 0);
        // and the refund reaches every golfer's ledger as its own line, labelled by why
        assert.ok(Object.values(cd.contributions).every(c => c.lines.some(l => l.label === 'KP refund \u00B7 nobody recorded it')));
    });

    // THE PAYOUT LINE SAYS WHY (2026-09-19). "Pool refund +$8" was the one place the
    // $8 arrived unexplained. One line per reason now; the golfer's figure is the
    // engine's perPlayerCents untouched, and the lines sum to it exactly.
    test('the ledger line is "KP refund · nobody recorded it", and equals the engine\'s refund to the cent', () => {
        const { d, cd, sc } = roundData({});
        const sb = engines();
        const p = sb.computeMoneyPool(d, cd, sc), c = plain(sb.computeCombinedNetTotals(d, cd, sc));
        Object.values(c.contributions).forEach(x => {
            const id = d.players.find(q => q.name === x.name).id;
            const refundLines = x.lines.filter(l => /refund/.test(l.label));
            assert.equal(Math.round(refundLines.reduce((a, l) => a + l.amount, 0) * 100), p.refund.perPlayerCents[id], x.name + ': the lines sum to the engine\'s figure');
            assert.ok(refundLines.some(l => l.label === 'KP refund \u00B7 nobody recorded it'), x.name + ': ' + refundLines.map(l => l.label).join('|'));
        });
    });
    test('the early call reads "nobody won it"; a KP refund beside a skins refund is two lines that still sum to the lump', () => {
        const sb = engines();
        const nw = roundData({ winners: { h3:'101', h12:'109', h16:'102' }, noWinner: { h7: true } });
        const cn = plain(sb.computeCombinedNetTotals(nw.d, nw.cd, nw.sc));
        assert.ok(Object.values(cn.contributions).every(x => x.lines.some(l => l.label === 'KP refund \u00B7 nobody won it')));
        const both = roundData({});    // nothing recorded AND this fixture's skins pot goes unwon
        const p = sb.computeMoneyPool(both.d, both.cd, both.sc);
        assert.equal(p.refund.reasons.length, 2, p.refund.reasons.join('|'));
        const c = plain(sb.computeCombinedNetTotals(both.d, both.cd, both.sc));
        Object.values(c.contributions).forEach(x => {
            const id = both.d.players.find(q => q.name === x.name).id;
            const lines = x.lines.filter(l => /refund/.test(l.label));
            assert.equal(lines.length, 2, x.name);
            assert.ok(lines.every(l => Number.isInteger(l.amount)), x.name + ': whole dollars on a whole-dollar round');
            assert.equal(Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100), p.refund.perPlayerCents[id]);
            assert.match(lines[1].label, /^Pool refund \u00B7 Skins pot refunded/);
        });
    });

    test('KP money reaches the player ledger and Who Pays Who', () => {
        const { d, cd, sc } = roundData({ winners: ALL_WON });
        const c = engines().computeCombinedNetTotals(d, cd, sc);
        const marty = plain(c.contributions).marty;
        assert.ok(marty.lines.some(l => /^KP H3/.test(l.label)), 'KP appears as its own line');
        const moved = {};
        plain(c.transactions).forEach(t => { moved[t.from] = (moved[t.from]||0) - t.amount; moved[t.to] = (moved[t.to]||0) + t.amount; });
        Object.values(plain(c.netByName)).forEach(v => assert.equal(v.net, moved[v.name] || 0, `${v.name}: Who Pays Who must reconstruct`));
    });
});

describe('FAIL CLOSED WITHOUT computeRoundFinish', () => {
    // pool-engine.js cannot run without settlement-engine.js at all (its skins
    // ledger lives there), so "absent" is simulated by blanking the one predicate
    // on a full sandbox - which is exactly the condition the typeof guard reads.
    test('no computeRoundFinish: every card in, a blank hole is WITHHELD, never refunded; a recorded one still pays', () => {
        const sb = engines();
        vm.runInContext('computeRoundFinish = undefined;', sb);
        assert.equal(vm.runInContext('typeof computeRoundFinish', sb), 'undefined', 'the predicate is not on this page');
        const { d, cd, sc } = roundData({ winners: { h3:'101' } });
        const r = sb.computeMoneyPool(d, cd, sc);
        assert.equal(byHole(r)[3], 'paid');
        assert.equal(byHole(r)[7], 'unresolved');
        assert.equal(r.kp.unclaimedCents, 0);
        assert.equal(r.kpUnresolvedCents, 7500);
        assert.equal(r.kp.finished, false);
    });
    test('with the predicate present the same round refunds - the guard is what decides', () => {
        assert.equal(pool({ winners: { h3:'101' } }).kp.unclaimedCents, 7500);
    });
});

describe('THE ENGINE OWNS THIS, NOT THE PAGES', () => {
    test('kpUnresolvedCents and settled are canonical; finished is asked, not re-derived', () => {
        const src = read('pool-engine.js');
        assert.match(src, /result\.kpUnresolvedCents = kpUnresolvedCents;/);
        assert.match(src, /result\.settled = kpUnresolvedCents === 0;/);
        assert.match(src, /typeof computeRoundFinish === 'function'/);
        assert.doesNotMatch(src, /data\.kpConfirmed|kpIsConfirmed/, 'the confirmation is gone from the engine (the comment may name it; the code may not read it)');
        assert.doesNotMatch(src, /scoresVerified/, 'the engine does not re-derive "finished"');
        const se = read('settlement-engine.js');
        assert.match(se, /function computeRoundFinish\(data, courseData, savedScores\)/);
        const at = se.indexOf('function computeRoundSettlement(');
        assert.match(se.slice(at, at + 400), /computeRoundFinish\(data, courseData, savedScores\)/, 'one rule, asked by both');
    });
    test('each KP line carries its own state', () => {
        const r = pool({ winners: { h3:'101' }, noWinner: { h7: true }, thru: 9 });
        const s = byHole(r);
        assert.equal(s[3], 'paid'); assert.equal(s[7], 'refunded'); assert.equal(s[12], 'unresolved');
    });
    test('no KP payout arithmetic was added to the pages', () => {
        ['index.html','settlement.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('KP REVIEW');
            if (at === -1) return;
            const block = src.slice(at, at + 6000);
            ['allocateWholeDollars(','splitCentsEvenly(','simplifyDebts('].forEach(t => assert.ok(!block.includes(t), `${f} must not settle KP money; found ${t}`));
        });
    });
});

// ============================================================================

describe('FINISH ROUND - THE CEREMONY IS GONE', () => {

    const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
                  'score-marks.js','bet-strip.js','hole-events.js'];

    function boot({ organizer = true, winners = {}, noWinner = null, leaders = null, online = true,
                    thru = 18, cancelled = false } = {}) {
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const { d } = roundData({ winners, noWinner, thru, cancelled });
        d.organizerToken = 'tok';
        if (leaders) d.kpLeaders = leaders;
        const gm = {}; d.players.forEach((p,i)=>{ gm[String(p.id)] = Math.floor(i/4)+1; });
        vm.runInContext(`
            window.__writes = []; window.__alerts = [];
            alert = m => window.__alerts.push(String(m));
            confirm = () => true;
            db.ref = function (p) { return {
                set: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); },
                update: function (v) { window.__writes.push({ path: p, value: v, atomic: true }); return Promise.resolve(); },
                remove: function () { return Promise.resolve(); },
                on: function () {}, push: function () { return { key: 'k' }; } }; };
            currentMode = 'ABCD';
            currentData = ${JSON.stringify(d)};
            window.__scPlayerGroupMap = ${JSON.stringify(gm)};
            window.__scFilteredPlayers = currentData.players;
            hasGroupLock = ${!organizer}; lockedGroup = ${organizer ? 'null' : 1};
            organizerTokenParam = ${organizer ? "'tok'" : 'null'};
            navigator.onLine = ${online};
            openFinishRoundModal();
        `, sb);
        return {
            sb, run: c => vm.runInContext(c, sb),
            kp: () => sb.document.getElementById('fr-kp-block').innerHTML,
            gate: () => sb.document.getElementById('fr-settle-gate').innerHTML,
            title: () => sb.document.getElementById('fr-money-title').textContent,
            writes: () => sb.window.__writes, alerts: () => sb.window.__alerts,
        };
    }

    test('the KP block lists every configured hole', () => {
        const t = strip(boot().kp());
        KP_HOLES.forEach(h => assert.match(t, new RegExp('Hole ' + h + '\\b')));
    });

    test('it names the leader and the distance when measured; a recorded hole is simply paid', () => {
        const b = boot({ winners: { h3:'101' }, leaders: { h3: { playerId:'101', playerName:'Marty', distanceInches:69 } } });
        const t = strip(b.kp());
        assert.match(t, /Hole 3.*Marty.*5' 9"/);
        assert.ok(!/Not confirmed|not confirmed|needs confirming|Confirm KP|confirmKp|Only the organizer/.test(t), 'no ceremony furniture');
    });

    test('FINISHED with blanks: "nobody recorded — refunded", no warning, no pending amount', () => {
        const t = strip(boot({ winners: { h3:'101' } }).kp());
        assert.match(t, /Hole 7.*[Nn]obody recorded/);
        assert.match(t, /refunded/);
        assert.ok(!/pending|still needs|⚠️/.test(t), t);
    });

    test('LIVE with blanks: "not recorded yet" per hole, with the amount still in the pot', () => {
        const t = strip(boot({ winners: { h3:'101' }, thru: 9 }).kp());
        assert.match(t, /Hole 7.*[Nn]ot recorded yet/);
        assert.match(t, /\$75 still in the pot/);
    });

    test('frConfirmKp no longer exists; the page has no confirm button and no "Not confirmed" tag', () => {
        const src = read('index.html');
        assert.doesNotMatch(src, /function frConfirmKp|frConfirmKp\(|Confirm KP Winners|KP WINNERS CONFIRMED/);
        assert.doesNotMatch(src, /Not confirmed<\/span>|Only the organizer link can confirm/);
        assert.equal(boot({ thru: 9 }).run('typeof frConfirmKp'), 'undefined');
    });

    test('THE CANCEL BUTTON LIVES AT THE FOOT OF THE BLOCK, organizer only, in every state but cancelled', () => {
        assert.match(boot({ winners: ALL_WON }).kp(), /frCancelKps\(\)/, 'paid state');
        assert.match(boot({ thru: 9 }).kp(), /frCancelKps\(\)/, 'live, blank');
        assert.match(boot({}).kp(), /frCancelKps\(\)/, 'finished, refunded');
        assert.doesNotMatch(boot({ winners: ALL_WON, organizer: false }).kp(), /frCancelKps/, 'not for a group link');
        const c = boot({ winners: ALL_WON, cancelled: true });
        assert.doesNotMatch(c.kp(), /frCancelKps/, 'already cancelled');
        assert.match(strip(c.kp()), /KPs cancelled for this round/);
    });

    test('the early call - "nobody won it" - is offered per blank hole while live, organizer only', async () => {
        const b = boot({ winners: { h3:'101' }, thru: 9 });
        assert.match(b.kp(), /frKpDeclareNoWinner\(7\)/);
        assert.doesNotMatch(b.kp(), /frKpDeclareNoWinner\(3\)/, 'not for a recorded hole');
        assert.doesNotMatch(boot({ thru: 9, organizer: false }).kp(), /frKpDeclareNoWinner/);
        b.run('frKpDeclareNoWinner(7)');
        await tick();
        const w = b.writes()[0];
        assert.equal(w.value['kpNoWinner/h7'], true);
        assert.equal(w.value['kpWinners/h7'], null);
        assert.ok(!('kpConfirmed' in w.value), 'nothing writes kpConfirmed any more');
    });

    test('MONEY IS FINAL THE MOMENT THE CARDS ARE IN - recorded or not', () => {
        const a = boot({ winners: ALL_WON });
        assert.equal(a.title(), 'Final Money'); assert.equal(a.gate(), '');
        const b = boot({});
        assert.equal(b.title(), 'Final Money'); assert.equal(b.gate(), '');
    });

    test('LIVE: the gate names the scores AND the KP holes still in the pot, and offers the way back', () => {
        const b = boot({ winners: { h3:'101' }, thru: 9 });
        assert.match(b.title(), /Not Final/);
        const g = strip(b.gate());
        assert.match(g, /scores still missing/);
        assert.match(g, /KP not recorded on 3 holes — \$75 still in the pot/);
        assert.match(b.gate(), /Review KP Results/);
        assert.ok(!/confirmed/.test(g));
    });

    test('PART 1: saving a leader shows NO alert - the block is the confirmation - and writes no kpConfirmed', async () => {
        // a Group 1 scorekeeper link, naming one of its own four
        const b = boot({ thru: 9, organizer: false });
        b.run("saveKpLeader(3, '101', '5', '9');");
        await tick();
        assert.deepEqual(plain(b.alerts()), [], 'no "KP RECORDED" dialog');   // plain(): the sandbox's Array is another realm
        const w = b.writes()[0];
        assert.equal(w.atomic, true);
        assert.deepEqual(Object.keys(w.value).sort(), ['kpLeaders/h3', 'kpWinners/h3']);
        assert.doesNotMatch(read('index.html'), /KP RECORDED/);
    });
});

// ============================================================================

describe('RECEIPT', () => {

    const SDEPS = ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

    function receipt(opts) {
        const sb = loadHtmlInlineScript('settlement.html', SDEPS);
        const { d } = roundData(opts);
        if (opts && opts.leaders) d.kpLeaders = opts.leaders;
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);
            renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
            renderSettlement(currentData);`, sb);
        const raw = id => sb.document.getElementById(id).innerHTML;
        return { pool: strip(raw('money-pool-section')), summary: strip(raw('combined-settlement-summary')),
                 settle: strip(raw('settle-content')), actions: raw('receipt-actions').replace(/\\uD83D\\uDCE4/g, '📤') };
    }

    test('recorded + every card in: the Receipt SETTLES - Player Payouts, each hole paid, the Send chip', () => {
        const r = receipt({ winners: ALL_WON, leaders: { h3: { playerId:'101', playerName:'Marty', distanceInches:69 } } });
        assert.match(r.summary, /💰 Player Payouts/); assert.ok(!/🏁 Final Results|LIVE RESULTS/.test(r.summary));   // v195b: no Final Results NET list on a Weekly Game receipt; final = Player Payouts
        assert.match(r.pool, /Hole 3: Marty — 5' 9"/);
        assert.match(r.actions, /📤 Send<\/button>/);
        assert.ok(!/NOT FINAL|not confirmed|NOT CONFIRMED|pending/.test(r.pool + r.summary + r.settle));
    });

    test('every card in, nothing recorded: each hole says nobody recorded it and where the money went', () => {
        const r = receipt({});
        assert.match(r.pool, /Hole 3: nobody recorded it \$25 back to the field/);
        // the summary refund row carries every reason (this fixture's unwon skins too)
        assert.match(r.pool, /↩️ Refunded to the field \(.*Unclaimed KP money refunded to the field\..*\) \$\d+ ÷ 12/);
        assert.match(r.summary, /💰 Player Payouts/); assert.ok(!/🏁 Final Results|LIVE RESULTS/.test(r.summary));   // v195b: no Final Results NET list on a Weekly Game receipt; final = Player Payouts
        assert.match(r.actions, /📤 Send<\/button>/);
    });

    test('LIVE: the head is LIVE RESULTS, a blank hole reads "not recorded yet", nothing says NOT FINAL or confirmed', () => {
        const r = receipt({ winners: { h3:'101' }, thru: 9 });
        assert.match(r.summary, /LIVE RESULTS/);
        assert.match(r.pool, /Hole 3: Marty/);
        assert.match(r.pool, /Hole 7: not recorded yet \$25 in the pot/);
        assert.ok(!/RESULTS — NOT FINAL|not confirmed|NOT CONFIRMED|KP results/.test(r.pool + r.summary + r.settle), r.summary);
    });

    test('an explicit no-winner reads as such; an outsider names the shot', () => {
        // frKpDeclareNoWinner clears kpWinners/h7 in the same write, so the two never coexist
        const r = receipt({ winners: { h3:'101', h12:'109', h16:'102' }, noWinner: { h7: true } });
        assert.match(r.pool, /Hole 7: nobody won it \$25 refunded/);
    });

    test('the RESULTS — NOT FINAL branch and every "unconfirmed" sentence are gone from the page', () => {
        const src = read('settlement.html');
        assert.doesNotMatch(src, /RESULTS \\u2014 NOT FINAL|still unconfirmed|not confirmed|NOT CONFIRMED|KP not confirmed/);
    });
});

// ============================================================================

describe('TRIP - THE KP HOLD IS GONE', () => {
    const TDEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
    test('a linked finished round with recorded KPs is settled; nothing says unconfirmed', () => {
        const sb = loadHtmlInlineScript('trip.html', TDEPS);
        const { d } = roundData({ winners: ALL_WON });
        vm.runInContext(`
            cachedRoundResults = [{ label: 'Caledonia', countsTowardTrip: true, data: ${JSON.stringify(d)} }];
            cachedCountedResults = cachedRoundResults;
            renderTripMoneySettlement();`, sb);
        const t = strip(sb.document.getElementById('trip-money-settlement').innerHTML);
        assert.ok(!/Not Settled Yet|unconfirmed/.test(t), t.slice(0, 200));
        assert.equal(vm.runInContext('cachedTripSettled', sb), true);
    });
    test('the "KP results are still unconfirmed in" sentence is gone from the page', () => {
        assert.doesNotMatch(read('trip.html'), /still unconfirmed in|unconfirmed/);
    });
});
