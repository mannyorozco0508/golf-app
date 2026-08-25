// ============================================================================
// KP WAVE C — CANCELLING THE GAME
//
// THREE DISTINCT STATES, and the whole wave exists to keep them apart:
//
//   UNRESOLVED  nobody has said yet          -> withheld, settlement blocked
//   NO WINNER   the organizer said nobody won -> a legitimate refund
//   CANCELLED   the organizer removed the game -> neither of those
//
// A cancelled KP game is not a refund. Nobody gets that money back as a share;
// the pot is simply divided differently. On a remainder-skins round the freed
// allocation becomes skins money through the calculation that was always there:
//
//     skins = totalPool - (result.kp ? result.kp.amountCents : 0) - net
//
// Cancellation works by NOT CREATING the KP bucket. There is no transfer, no
// second allocation rule and no page arithmetic - $310 becomes $410 because the
// remainder is larger, which is what "remainder" means.
//
// ON A FIXED-SKINS ROUND IT IS REFUSED. There is no rule for where the money
// should go, and the engine's own validator says so: "$100 of the pot is
// unallocated". Inventing a destination would be a second allocation algorithm.
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

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const KP_HOLES = [3, 7, 12, 16];
const CANCELLED = { cancelled: true, cancelledAt: 1, cancelledBy: 'organizer' };

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// TODAY'S REAL SHAPE: 12 x $40 = $480, KP $100, Net $70, skins remainder $310.
// `sevenSkins` produces seven unique winners so the $410 split can be asserted.
function roundData({ cancelled = false, winners = { h3:'101', h7:'105' }, confirmed = true,
                     fixedSkins = false, sevenSkins = false, leaders = null } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp: sevenSkins ? '0' : '9', playingForMoney:true }));
    const sc = {};
    if (sevenSkins) {
        ps.forEach(p => cd.forEach(h => { sc['p'+p.id+'_h'+h.hole] = 4; }));
        [[0,1],[1,2],[0,3],[9,5],[4,13],[8,14],[6,16]]
            .forEach(([pi,hi]) => { sc['p'+(101+pi)+'_h'+(hi+1)] = 3; });
    } else {
        ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = h.par + ((pi*3+hi*5)%4) - 1; }));
    }
    const d = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke',
        settlementMode: 'whole-dollar', kpWinners: winners,
        moneyPool: { enabled:true, buyIn:40,
            kp:{ amount:100, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins: fixedSkins ? { mode:'fixed', amount:310, scoring:'net', carryOver:false }
                              : { mode:'remainder', scoring:'net', carryOver:false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true };
    if (cancelled) d.kpCancelled = CANCELLED;
    if (leaders) d.kpLeaders = leaders;
    return { d, cd, sc };
}
const pool = o => { const { d, cd, sc } = roundData(o); return engines().computeMoneyPool(d, cd, sc); };

// ============================================================================

describe("TODAY'S $480 ROUND, CANCELLED", () => {

    test('before: KP $100 · Net $70 · Skins $310', () => {
        const r = pool({ cancelled: false });
        assert.equal(r.totalPoolCents, 48000);
        assert.equal(r.kp.amountCents, 10000);
        assert.equal(r.net.amountCents, 7000);
        assert.equal(r.skins.amountCents, 31000);
    });

    test('after: KP gone · Net $70 · Skins $410 · still $480', () => {
        const r = pool({ cancelled: true });
        assert.ok(!r.kp, 'a cancelled game creates no bucket at all');
        assert.equal(r.net.amountCents, 7000);
        assert.equal(r.skins.amountCents, 41000, 'the remainder simply got bigger');
        assert.equal(r.net.amountCents + r.skins.amountCents, r.totalPoolCents);
    });

    test('the freed money is NOT a refund', () => {
        const after = pool({ cancelled: true });
        assert.ok(!/Unclaimed KP/.test(after.refund.reasons.join(' ')),
            'no KP refund reason may appear on a cancelled round');
        // Nobody gets a per-head share of the freed money - it became skins money.
        const shares = Object.values(plain(after.refund.perPlayerCents || {}));
        assert.ok(!shares.some(c => c === 800 || c === 900),
            'the $8/$9 per-head refund shape must not reappear');
    });

    test('KP paid, unresolved and refunded are all ZERO', () => {
        const r = pool({ cancelled: true });
        assert.equal(r.kpUnresolvedCents, 0, 'cancellation IS a resolution');
        assert.equal(r.settled, true, 'and settlement must not wait for a confirm');
        assert.ok(!r.kp, 'no KP lines exist to pay');
    });

    test('no golfer receives KP money, even one who held a leader', () => {
        const { d, cd, sc } = roundData({ cancelled: true, winners: { h3:'101', h7:'105' } });
        const c = engines().computeCombinedNetTotals(d, cd, sc);
        Object.values(plain(c.contributions)).forEach(x => {
            assert.ok(!x.lines.some(l => /^KP H/.test(l.label)),
                `${x.name} still shows a KP line after cancellation`);
        });
    });

    test('the round is zero-sum and whole-dollar after cancelling', () => {
        const r = pool({ cancelled: true });
        assert.equal(Object.values(plain(r.perPlayerCents)).reduce((a,b)=>a+b,0), 0);
        Object.values(plain(r.perPlayerCents)).forEach(c =>
            assert.equal(Math.abs(c % 100), 0, 'no cents'));
    });
});

describe('SEVEN SKINS ON $410 — THE CANONICAL ALLOCATOR', () => {

    test('the bucket grows and every dollar lands', () => {
        const r = pool({ cancelled: true, sevenSkins: true });
        assert.equal(r.skins.amountCents, 41000);
        assert.equal(r.skins.lines.length, 7);
        const paid = r.skins.lines.reduce((a,l)=>a+l.cents,0);
        assert.equal(paid + r.skins.unwonCents, 41000, 'paid + unwon must equal the bucket');
    });

    test('the split is exactly what the allocator produces — not hand-written', () => {
        const sb = engines();
        const expected = plain(sb.allocateWholeDollars(410, Array(7).fill(1)));
        const r = pool({ cancelled: true, sevenSkins: true });
        const actual = r.skins.lines.map(l => l.cents / 100);
        assert.deepEqual(plain(actual), expected);
        assert.equal(expected.reduce((a,b)=>a+b,0), 410);
    });

    test('cancelling genuinely changes what each skin is worth', () => {
        const before = pool({ cancelled: false, sevenSkins: true, confirmed: true,
                              winners: { h3:'101', h7:'105', h12:'109', h16:'102' } });
        const after = pool({ cancelled: true, sevenSkins: true });
        const b = before.skins.lines.map(l => l.cents).sort();
        const a = after.skins.lines.map(l => l.cents).sort();
        assert.notDeepEqual(plain(a), plain(b), 'a bigger pot must pay bigger skins');
    });

    test('the ledger and Who Pays Who still reconstruct exactly', () => {
        const { d, cd, sc } = roundData({ cancelled: true, sevenSkins: true });
        const c = engines().computeCombinedNetTotals(d, cd, sc);
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
            assert.equal(t.amount, Math.round(t.amount), 'a transaction carried cents');
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: Who Pays Who must reconstruct`));
        assert.equal(Object.values(plain(c.netByName)).reduce((a,v)=>a+v.net,0), 0);
    });
});

describe('FIXED SKINS CANNOT ABSORB IT', () => {

    test('the engine itself reports the money as unallocated', () => {
        const r = pool({ cancelled: true, fixedSkins: true });
        assert.equal(r.valid, false);
        assert.match(r.errors.join(' '), /unallocated/,
            'this is exactly why the UI must refuse the action');
    });

    test('the UI refuses on a fixed-skins round, and says why', () => {
        const src = read('index.html');
        const at = src.indexOf('function frCancelKps');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /skinsMode !== 'remainder'/);
        assert.match(fn, /fixed skins amount/);
        assert.ok(!/skins\.amount\s*=/.test(fn), 'it must not quietly grow the fixed bucket');
        assert.ok(!/refund/i.test(fn), 'and must not quietly refund it');
    });
});

describe('HISTORY IS PRESERVED, MONEY IS NOT', () => {

    test('kpLeaders and kpWinners survive cancellation', () => {
        const leaders = { h3: { playerId:'101', playerName:'Marty', group:1, distanceInches:69, updatedAt:1 } };
        const { d, cd, sc } = roundData({ cancelled: true, leaders });
        engines().computeMoneyPool(d, cd, sc);
        assert.deepEqual(plain(d.kpLeaders), plain(leaders), 'what happened on the course is not erased');
        assert.ok(Object.keys(d.kpWinners).length > 0);
    });

    test('but settlement ignores every one of them', () => {
        const r = pool({ cancelled: true, winners: { h3:'101', h7:'105', h12:'109', h16:'102' } });
        assert.ok(!r.kp, 'the cancelled state wins over any recorded winner');
    });

    test('the original allocation is reported so the Receipt can explain it', () => {
        const r = pool({ cancelled: true });
        assert.equal(r.kpCancelled.cancelled, true);
        assert.equal(r.kpCancelled.originalCents, 10000);
    });

    test('a legacy round with no kpCancelled is untouched', () => {
        const r = pool({ cancelled: false });
        assert.ok(!r.kpCancelled);
        assert.ok(r.kp, 'its KP game still exists');
    });
});

describe('NO SECOND ALLOCATION RULE', () => {

    test('the engine creates no bucket rather than transferring money', () => {
        const src = read('pool-engine.js');
        const at = src.indexOf('const kpCancel = data.kpCancelled;');
        const block = src.slice(at, at + 1600);
        assert.match(block, /if \(kpIsCancelled\) \{/);
        assert.ok(!/skins[^\n]*\+=/.test(block), 'no manual transfer into skins');
        assert.ok(!/refundCents \+=/.test(block), 'and no refund path');
    });

    test('the remainder formula is unchanged', () => {
        const src = read('pool-engine.js');
        assert.match(src, /totalPoolCents\s*\n?\s*-\s*\(result\.kp \? result\.kp\.amountCents : 0\)/,
            'the freed money flows through the calculation that was always there');
    });

    test('the pages add no KP arithmetic', () => {
        ['index.html','settlement.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('frCancelKps');
            if (at === -1) return;
            const block = src.slice(at, at + 3000);
            ['allocateWholeDollars(','splitCentsEvenly(','simplifyDebts(']
                .forEach(t => assert.ok(!block.includes(t), `${f} must not settle money; found ${t}`));
        });
    });
});

describe('FINISH ROUND — PERMISSION AND UX', () => {

    const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
                  'score-marks.js','bet-strip.js','hole-events.js'];

    function boot({ organizer = true, cancelled = false, fixedSkins = false, online = true,
                    bare = false } = {}) {
        const sb = loadHtmlInlineScript('index.html', DEPS);
        const { d } = roundData({ cancelled, fixedSkins, winners: { h3:'101', h7:'105' } });
        d.organizerToken = 'tok';
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
            hasGroupLock = ${!organizer && !bare}; lockedGroup = ${(!organizer && !bare) ? 1 : 'null'};
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

    test('the organizer sees a SECONDARY cancel action', () => {
        const h = boot().kp();
        assert.match(h, /Cancel KPs for this round/);
        assert.match(h, /fr-secondary-btn[^>]*onclick="frCancelKps\(\)"/,
            'cancellation must not look like a peer of the everyday action');
    });

    test('a GROUP link is offered no cancel action and cannot call it', async () => {
        const b = boot({ organizer: false });
        assert.ok(!/Cancel KPs/.test(b.kp()));
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.writes().length, 0, 'authority is checked in the function, not just the UI');
    });

    test('a BARE/spectator link cannot cancel either', async () => {
        const b = boot({ organizer: false, bare: true });
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.writes().length, 0);
    });

    test('cancelling writes ONE field and nothing else', async () => {
        const b = boot();
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.writes().length, 1, 'one write means no half-cancelled state is possible');
        assert.match(b.writes()[0].path, /kpCancelled$/);
        assert.equal(b.writes()[0].value.cancelled, true);
        assert.equal(b.writes()[0].value.cancelledBy, 'organizer');
    });

    test('OFFLINE cancellation cannot succeed', async () => {
        const b = boot({ online: false });
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.writes().length, 0, 'money must not move on a write that never landed');
        assert.ok(b.alerts().some(a => /NOT CANCELLED/.test(a)));
        assert.equal(b.run('currentData.kpCancelled === undefined'), true, 'no local fake state');
    });

    test('a FIXED-SKINS round is refused with an explanation and no write', async () => {
        const b = boot({ fixedSkins: true });
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.writes().length, 0);
        assert.ok(b.alerts().some(a => /fixed skins amount/.test(a)));
    });

    test('cancelling does NOT delete the round history', async () => {
        // Sabotaging the local handler to drop kpLeaders left the suite green: the
        // history test above checks the ENGINE, which never touches that field. This
        // checks the write path, which is where a well-meaning cleanup would happen.
        const b = boot();
        b.run(`currentData.kpLeaders = { h3: { playerId:'101', playerName:'Marty', group:1,
                                               distanceInches:69, updatedAt:1 } };`);
        b.run('frCancelKps();');
        await tick();
        assert.equal(b.run('!!currentData.kpLeaders'), true, 'what happened on the course must survive');
        assert.equal(b.run("currentData.kpLeaders['h3'].playerName"), 'Marty');
        assert.equal(b.run('!!currentData.kpWinners'), true);
    });

    test('after cancelling, the block states the decision and drops the pending furniture', () => {
        const t = strip(boot({ cancelled: true }).kp());
        assert.match(t, /KPs cancelled for this round/);
        assert.match(t, /\$100 moved into the skins pool/);
        ['still needs confirming','Confirm KP Winners','nobody won it','pending']
            .forEach(s => assert.ok(!t.includes(s), `"${s}" must not survive cancellation`));
    });

    test('FINAL MONEY IS NO LONGER BLOCKED BY KP', () => {
        const b = boot({ cancelled: true });
        assert.equal(b.title(), 'Final Money');
        assert.ok(!/KP winners not confirmed/.test(strip(b.gate())));
    });

    test('an uncancelled round is still blocked - the gate did not simply go away', () => {
        assert.match(boot({ cancelled: false }).title(), /Not Final/);
    });
});

describe('RECEIPT', () => {

    const SDEPS = ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

    function receipt(opts) {
        const sb = loadHtmlInlineScript('settlement.html', SDEPS);
        const { d } = roundData(opts);
        vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
        return strip(sb.document.getElementById('money-pool-section').innerHTML);
    }

    test('it says cancelled, names the original amount, and says where it went', () => {
        const t = receipt({ cancelled: true });
        assert.match(t, /KP — Cancelled/);
        assert.match(t, /original allocation \$100/);
        assert.match(t, /moved to skins/);
    });

    test('it does NOT print old KP winners as paid', () => {
        const t = receipt({ cancelled: true, winners: { h3:'101', h7:'105' } });
        assert.ok(!/Hole 3: Marty/.test(t), 'a retained leader is history, not a payout');
    });

    test('it never calls a cancellation a refund', () => {
        const t = receipt({ cancelled: true });
        const kpPart = t.slice(t.indexOf('KP — Cancelled'), t.indexOf('KP — Cancelled') + 160);
        assert.ok(!/refund/i.test(kpPart), 'the pot was re-divided, not given back');
    });

    test('the skins pot shown is the larger one', () => {
        assert.match(receipt({ cancelled: true }), /Skins Pot — \$410/);
    });

    test('an uncancelled round still shows its KP section', () => {
        const t = receipt({ cancelled: false });
        assert.match(t, /KP — \$100/);
        assert.ok(!/Cancelled/.test(t));
    });
});
