// ============================================================================
// KP WAVE B — UNRESOLVED MONEY, CONFIRMATION, AND THE FINAL-STATE GATE
//
// THE BUG THIS REMOVES
//
// pool-engine.js could not tell "nobody won it" from "nobody typed it in". Both
// incremented `unclaimed`, which flowed into refundCents - so a $100 KP bucket
// nobody had entered came back as $8 and $9 lines on twelve golfers' receipts,
// and the round presented itself as settled. Real money, quietly reassigned, on
// a screen that looked final.
//
// FOUR STATES NOW, NOT TWO:
//
//   not confirmed              -> UNRESOLVED. Withheld. Settlement blocked.
//   confirmed + winner         -> paid.
//   confirmed + kpNoWinner     -> a legitimate refund: the organizer SAID nobody
//                                 won it. A blank hole never means this.
//   winner outside the pool    -> refund. Bragging rights. Unchanged.
//
// THE INVARIANT THAT REPLACED ZERO-SUM
//
//   prizes + refunds + kpUnresolvedCents === totalPoolCents
//
// Zero-sum is a consequence of that, and only once every dollar is distributed.
// While KP is unresolved the ledger is deliberately short by exactly that amount:
// the buy-ins were charged and that share has not been handed out. Forcing it to
// zero is the bug. No money disappears either way.
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

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
function roundData({ winners = {}, confirmed = false, noWinner = null, kpAmount = 100 } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:'9',playingForMoney:true}));
    const sc = {}; ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole]=4+((pi+hi)%3)-1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke',
        settlementMode: 'whole-dollar', kpWinners: winners,
        moneyPool: { enabled:true, buyIn:40,
            kp:{ amount:kpAmount, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true, confirmedAt: 1, confirmedBy: 'organizer' };
    if (noWinner) d.kpNoWinner = noWinner;
    return { d, cd, sc };
}
const pool = o => { const { d, cd, sc } = roundData(o); return engines().computeMoneyPool(d, cd, sc); };
const ALL_WON = { h3:'101', h7:'105', h12:'109', h16:'102' };

// ============================================================================

describe('UNRESOLVED KP IS NOT A REFUND', () => {

    test('$100 with nothing entered stays unresolved', () => {
        const r = pool();
        assert.equal(r.kpUnresolvedCents, 10000);
        assert.equal(r.settled, false);
    });

    test('THE $8/$9 REFUND IS GONE', () => {
        const r = pool();
        assert.equal(r.kp.unclaimedCents, 0, 'nothing is "unclaimed" until somebody decides');
        assert.ok(!/Unclaimed KP/.test(r.refund.reasons.join(' ')));
        const shares = Object.values(plain(r.refund.perPlayerCents));
        assert.ok(!shares.some(c => c === 800 || c === 900),
            'the $8 and $9 lines from the real round must not appear');
    });

    test('the money is withheld, not vanished', () => {
        const r = pool();
        const paid = r.kp.lines.filter(l => l.state === 'paid').reduce((a,l)=>a+l.cents,0)
                   + r.net.lines.reduce((a,l)=>a+l.cents,0)
                   + r.skins.lines.reduce((a,l)=>a+l.cents,0);
        assert.equal(paid + r.refund.cents + r.kpUnresolvedCents, r.totalPoolCents,
            'prizes + refunds + unresolved must equal the pot');
    });

    test('the ledger is short by exactly the unresolved amount', () => {
        const r = pool();
        assert.equal(Object.values(plain(r.perPlayerCents)).reduce((a,b)=>a+b,0), -10000,
            'deliberately not zero - that $100 has not been handed out');
    });

    test('PARTIAL entry is still unresolved — in full', () => {
        // Without confirmation NOTHING is resolved, even the holes somebody entered.
        // Recording a leader on the course is not the organizer signing off the money.
        const r = pool({ winners: { h3:'101', h7:'105' } });
        assert.equal(r.kpUnresolvedCents, 10000, 'the whole bucket waits on confirmation');
        assert.equal(r.settled, false);
    });

    test('partial entry under a CONFIRMED round leaves only the blanks hanging', () => {
        const r = pool({ winners: { h3:'101', h7:'105' }, confirmed: true });
        assert.equal(r.kpUnresolvedCents, 5000, 'holes 12 and 16 are still undecided');
        assert.equal(r.settled, false);
    });

    test('winners without confirmation are still unresolved', () => {
        const r = pool({ winners: ALL_WON, confirmed: false });
        assert.equal(r.kpUnresolvedCents, 10000,
            'recorded is not the same as confirmed');
        assert.equal(r.settled, false);
    });

    test('a round with NO KP money is settled immediately', () => {
        const r = pool({ kpAmount: 0 });
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.settled, true, 'no KP allocation means nothing to confirm');
    });
});

describe('CONFIRMATION SETTLES IT', () => {

    test('confirmed winners are paid and nothing is left hanging', () => {
        const r = pool({ winners: ALL_WON, confirmed: true });
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.settled, true);
        assert.equal(r.kp.lines.filter(l => l.state === 'paid').length, 4);
        assert.equal(Object.values(plain(r.perPlayerCents)).reduce((a,b)=>a+b,0), 0,
            'zero-sum returns once every dollar is distributed');
    });

    test('an explicit no-winner is a legitimate refund', () => {
        const r = pool({ winners: { h3:'101', h7:'105', h16:'102' },
                         confirmed: true, noWinner: { h12: true } });
        assert.equal(r.kpUnresolvedCents, 0);
        assert.equal(r.kp.unclaimedCents, 2500);
        assert.match(r.refund.reasons.join(' '), /Unclaimed KP/);
        assert.equal(Object.values(plain(r.perPlayerCents)).reduce((a,b)=>a+b,0), 0);
    });

    test('A BLANK HOLE IS NEVER A REFUND, even on a confirmed round', () => {
        // Silence is not a decision. This is the defensive half of refusing to
        // confirm while a hole is blank.
        const r = pool({ winners: { h3:'101', h7:'105', h16:'102' }, confirmed: true });
        assert.equal(r.kpUnresolvedCents, 2500, 'hole 12 stays unresolved');
        assert.equal(r.kp.unclaimedCents, 0);
        assert.equal(r.settled, false);
    });

    test('a winner outside the pool still refunds — unchanged', () => {
        const { d, cd, sc } = roundData({ winners: ALL_WON, confirmed: true });
        d.moneyPool.participantIds = d.players.slice(0, 8).map(p => String(p.id));
        const r = engines().computeMoneyPool(d, cd, sc);
        const outside = r.kp.lines.find(l => l.hole === 12);   // player 109 excluded
        assert.equal(outside.state, 'refunded', 'his shot counts; the pool money refunds');
        assert.equal(r.kpUnresolvedCents, 0);
    });

    test('whole-dollar conservation holds after confirmation', () => {
        const r = pool({ winners: ALL_WON, confirmed: true });
        assert.equal(r.kp.amountCents + r.net.amountCents + r.skins.amountCents, 48000);
        Object.values(plain(r.perPlayerCents)).forEach(c =>
            assert.equal(Math.abs(c % 100), 0, 'no cents in whole-dollar mode'));
    });

    test('KP money reaches the player ledger and Who Pays Who', () => {
        const { d, cd, sc } = roundData({ winners: ALL_WON, confirmed: true });
        const sb = engines();
        const c = sb.computeCombinedNetTotals(d, cd, sc);
        const marty = plain(c.contributions).marty;
        assert.ok(marty.lines.some(l => /^KP H3/.test(l.label)), 'KP appears as its own line');
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: Who Pays Who must reconstruct`));
    });

    test('LEGACY: a round with kpWinners but no kpConfirmed is unresolved', () => {
        const r = pool({ winners: ALL_WON, confirmed: false });
        assert.equal(r.settled, false,
            'no silent migration - the organizer resolves it through the workflow');
    });
});

describe('THE ENGINE OWNS THIS, NOT THE PAGES', () => {

    test('kpUnresolvedCents and settled are canonical', () => {
        const src = read('pool-engine.js');
        assert.match(src, /result\.kpUnresolvedCents = kpUnresolvedCents;/);
        assert.match(src, /result\.settled = kpUnresolvedCents === 0;/);
    });

    test('each KP line carries its own state', () => {
        const r = pool({ winners: { h3:'101' }, confirmed: true, noWinner: { h7: true } });
        const byHole = {}; r.kp.lines.forEach(l => { byHole[l.hole] = l.state; });
        assert.equal(byHole[3], 'paid');
        assert.equal(byHole[7], 'refunded');
        assert.equal(byHole[12], 'unresolved');
    });

    test('no KP payout arithmetic was added to the pages', () => {
        ['index.html','settlement.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('KP REVIEW & CONFIRMATION');
            if (at === -1) return;
            const block = src.slice(at, at + 6000);
            ['allocateWholeDollars(','splitCentsEvenly(','simplifyDebts(']
                .forEach(t => assert.ok(!block.includes(t), `${f} must not settle KP money; found ${t}`));
        });
    });
});

describe('FINISH ROUND — REVIEW, CONFIRM, GATE', () => {

    const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
                  'score-marks.js','bet-strip.js','hole-events.js'];

    function boot({ organizer = true, winners = {}, confirmed = false, noWinner = null,
                    leaders = null, online = true } = {}) {
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const { d } = roundData({ winners, confirmed, noWinner });
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
            sb,
            run: c => vm.runInContext(c, sb),
            kp: () => sb.document.getElementById('fr-kp-block').innerHTML,
            gate: () => sb.document.getElementById('fr-settle-gate').innerHTML,
            title: () => sb.document.getElementById('fr-money-title').textContent,
            writes: () => sb.window.__writes,
            alerts: () => sb.window.__alerts,
        };
    }

    test('the KP block lists every configured hole', () => {
        const t = strip(boot({ winners: { h3:'101' } }).kp());
        KP_HOLES.forEach(h => assert.ok(t.includes('Hole ' + h), `hole ${h} missing`));
        assert.match(t, /KP Results · \$100/);
    });

    test('it names the leader, the distance when measured, and the gap when not', () => {
        // Distance is shown beside a CONFIRMED winner. On an unconfirmed round the
        // leader is named and flagged "Not confirmed" - the measurement is detail
        // that belongs with a settled result, not with a pending one.
        const pending = strip(boot({ winners: { h3:'101' },
            leaders: { h3: { playerId:'101', playerName:'Marty', group:1, distanceInches:69, updatedAt:1 } } }).kp());
        assert.match(pending, /Marty/);
        assert.match(pending, /Not confirmed/);
        assert.match(pending, /No leader recorded/, 'undecided holes must be visible');

        const done = strip(boot({ winners: ALL_WON, confirmed: true,
            leaders: { h3: { playerId:'101', playerName:'Marty', group:1, distanceInches:69, updatedAt:1 } } }).kp());
        assert.match(done, /5' 9"/, 'a measured winner shows the distance');
    });

    test('unresolved KP is called out with the amount', () => {
        assert.match(strip(boot().kp()), /\$100 still needs confirming/);
    });

    test('ONLY THE ORGANIZER CAN CONFIRM', () => {
        const grp = boot({ organizer: false, winners: ALL_WON });
        assert.ok(!/Confirm KP Winners/.test(grp.kp()), 'a group link is offered no confirm button');
        assert.match(strip(grp.kp()), /Only the organizer link can confirm/);

        const org = boot({ organizer: true, winners: ALL_WON });
        assert.match(org.kp(), /Confirm KP Winners/);
    });

    test('a group link calling confirm directly is refused', async () => {
        const b = boot({ organizer: false, winners: ALL_WON });
        b.run('frConfirmKp();');
        await tick();
        assert.equal(b.writes().length, 0, 'authority is checked in the function, not just the UI');
    });

    test('CONFIRM IS REFUSED WHILE A HOLE IS BLANK, and names it', async () => {
        const b = boot({ winners: { h3:'101', h7:'105' } });
        b.run('frConfirmKp();');
        await tick();
        assert.equal(b.writes().length, 0);
        const msg = b.alerts().join(' ');
        assert.match(msg, /NOT CONFIRMED/);
        assert.match(msg, /hole 12/);
        assert.match(msg, /hole 16/);
    });

    test('confirm persists and settles once every hole is decided', async () => {
        const b = boot({ winners: ALL_WON });
        b.run('frConfirmKp();');
        await tick();
        assert.equal(b.writes().length, 1);
        assert.match(b.writes()[0].path, /kpConfirmed$/);
        assert.equal(b.writes()[0].value.confirmed, true);
        assert.equal(b.writes()[0].value.confirmedBy, 'organizer');
        assert.equal(b.run('frKpNeedsAttention()'), false);
    });

    test('OFFLINE confirmation cannot succeed', async () => {
        const b = boot({ winners: ALL_WON, online: false });
        b.run('frConfirmKp();');
        await tick();
        assert.equal(b.writes().length, 0, 'a buffered write that never lands must not read as confirmed');
        assert.ok(b.alerts().some(a => /KP NOT CONFIRMED/.test(a)));
        assert.equal(b.run('frKpNeedsAttention()'), true);
    });

    test('declaring no winner is explicit and clears the confirmation', async () => {
        const b = boot({ winners: { h3:'101', h7:'105', h16:'102' } });
        b.run('frKpDeclareNoWinner(12);');
        await tick();
        const w = b.writes()[0];
        assert.equal(w.value['kpNoWinner/h12'], true);
        assert.equal(w.value['kpConfirmed'], null, 'still needs the final confirm');
        // Deciding the last hole does NOT settle the round - the organizer still has
        // to press Confirm. Declaring and confirming are deliberately two actions.
        assert.equal(b.run('frKpNeedsAttention()'), true, 'still awaiting confirmation');
    });

    test('MONEY IS NOT LABELLED FINAL WHILE KP IS UNRESOLVED', () => {
        // Unconfirmed means the WHOLE bucket is hanging, not just the blank holes -
        // one recorded leader does not release the other three shares.
        const b = boot({ winners: { h3:'101' } });
        assert.match(b.title(), /Not Final/);
        assert.match(strip(b.gate()), /KP winners not confirmed/);
        assert.match(strip(b.gate()), /\$100 still allocated to KP/);
    });

    test('the gate reports scores and KP independently', () => {
        const t = strip(boot({ winners: { h3:'101' } }).gate());
        assert.match(t, /Scores (not )?verified/, 'score state is shown separately');
        assert.match(t, /KP winners not confirmed/);
    });

    test('the gate offers a way back to the KP block', () => {
        assert.match(boot().gate(), /Review KP Results/);
    });

    test('once confirmed, the money reads FINAL and the gate clears', () => {
        const b = boot({ winners: ALL_WON, confirmed: true });
        assert.equal(b.title(), 'Final Money');
        assert.equal(b.gate(), '');
    });

    test('STALE CONFIRMATION: changing a leader unsettles it again', async () => {
        const b = boot({ winners: ALL_WON, confirmed: true });
        assert.equal(b.title(), 'Final Money');
        // A later group beats the marker. saveKpLeader clears kpConfirmed atomically.
        b.run("hasGroupLock = true; lockedGroup = 1; organizerTokenParam = null;");
        b.run("saveKpLeader(3, '102', '', '');");
        await tick();
        b.run("currentData.kpConfirmed = null;");     // what the listener will do
        b.run('renderFinishRoundMoney();');
        assert.match(b.title(), /Not Final/, 'a stale FINAL after a leader change is the worst outcome');
        assert.match(strip(b.gate()), /KP winners not confirmed/);
    });
});

describe('RECEIPT', () => {

    const SDEPS = ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

    function receipt(opts) {
        const sb = loadHtmlInlineScript('settlement.html', SDEPS);
        const { d } = roundData(opts);
        if (opts && opts.leaders) d.kpLeaders = opts.leaders;
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
        return strip(sb.document.getElementById('money-pool-section').innerHTML);
    }

    test('unresolved KP shows as pending, NEVER as a refund', () => {
        const t = receipt({ winners: { h3:'101' } });
        assert.match(t, /KP results not confirmed/);
        assert.match(t, /pending/);
        // An undecided hole reads "no winner recorded" (a statement of fact) and its
        // share is pending - not "no winner ... refunded", which is a decision.
        assert.match(t, /Hole 7: no winner recorded/);
        assert.ok(!/Hole 7: no winner \$25 refunded/.test(t), 'and it is not refunded');
    });

    test('confirmed KP lists each hole with its winner', () => {
        const t = receipt({ winners: ALL_WON, confirmed: true });
        assert.match(t, /Hole 3: Marty/);
        assert.match(t, /Hole 16: Scott/);
        assert.ok(!/pending/.test(t));
    });

    test('distance appears only when it was measured', () => {
        const t = receipt({ winners: ALL_WON, confirmed: true,
            leaders: { h3: { playerId:'101', playerName:'Marty', group:1, distanceInches:69, updatedAt:1 } } });
        assert.match(t, /Hole 3: Marty — 5' 9"/);
        assert.match(t, /Hole 7: Manny/, 'an unmeasured winner still reads cleanly');
    });

    test('an explicit no-winner reads as such', () => {
        const t = receipt({ winners: { h3:'101', h7:'105', h16:'102' },
                            confirmed: true, noWinner: { h12: true } });
        assert.match(t, /Hole 12: no winner/);
        assert.match(t, /refunded/);
    });
});
