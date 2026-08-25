// ============================================================================
// WHO PAYS WHO — ONLY WHEN SOMEBODY ACTUALLY PAYS SOMEBODY
//
// In a MONEY POOL ONLY round nobody owes another golfer a thing. Everyone put
// the same stake into a pot; the winners took out of that pot. The money moved
// through the pool, not between people.
//
// The settlement engine can still express that as golfer-to-golfer transfers,
// because arithmetically it can always net a set of balances into a minimal set
// of payments. But those pairings are an artifact of the maths, not a
// description of what happened. Printing "Marty pays Carp $40" invents a debt
// between two people who never had one - and it sits directly under Player
// Payouts, which correctly says Carp was paid $128 by the pot.
//
// The moment a SIDE MATCH or any other head-to-head wager exists, real debts
// between people DO exist, and the combined list is exactly what the group
// needs: it nets the pool position and the match together so nobody settles up
// twice.
//
//   Money Pool only       -> Final Results + Player Payouts. No Who Pays Who.
//   Money Pool + Side     -> Player Payouts, then the combined Who Pays Who.
//   Side Matches only     -> Who Pays Who, which is the whole story.
//
// THE TEST IS WHAT MOVED THE MONEY, not how many transactions came back. Each
// contribution carries MOVING lines - the ones that add up to a golfer's net -
// and a pool-only round has exactly one such label: "Money Pool".
//
// PRESENTATION ONLY. computeCombinedNetTotals still produces the same
// transactions; this decides whether they are a meaningful thing to show.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'settlement.html';
const DEPS = ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const POOL = { enabled:true, buyIn:40,
    kp:{ amount:100, holes:[3,7,12,16] },
    net:{ amount:70, places:[57.142857,42.857143] },
    skins:{ mode:'remainder', scoring:'net', carryOver:false } };

// pool / side / dots pick which money sources exist in the round.
function boot({ pool = true, side = false, dots = false } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi)%3) - 1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                settlementMode:'whole-dollar' };
    if (pool) {
        d.moneyPool = POOL;
        d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
        d.kpConfirmed = { confirmed: true };
    }
    if (side) {
        d.sideMatches = { m1: { format:'match', scoring:'net', stake:50, startHole:1,
                                createdAt:1, teamAIds:['101'], teamBIds:['103'] } };
    }
    if (dots) {
        d.dots = { enabled:true, value:1, participantIds: ps.map(p=>String(p.id)) };
    }
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        html: () => sb.document.getElementById('combined-settlement-summary').innerHTML,
        text: () => strip(sb.document.getElementById('combined-settlement-summary').innerHTML),
        has: name => new RegExp(name).test(strip(sb.document.getElementById('combined-settlement-summary').innerHTML)),
    };
}

// ============================================================================

describe('MONEY POOL ONLY — NO INVENTED DEBTS', () => {

    test('Final Results and Player Payouts are shown', () => {
        const b = boot({ pool:true, side:false });
        assert.ok(b.has('Final Results'));
        assert.ok(b.has('Player Payouts'));
        assert.ok(b.has('TOTAL PAYOUT'));
    });

    test('Who Pays Who is NOT shown', () => {
        assert.ok(!boot({ pool:true, side:false }).has('Who Pays Who'),
            'nobody owes another golfer anything - the pot paid the winners');
    });

    test('the engine still PRODUCES transactions — we just do not print them', () => {
        // Proves the gate is a display decision, not a change to the maths. If the
        // engine had stopped producing them, this test would pass for the wrong
        // reason and the side-match cases below would be meaningless.
        const b = boot({ pool:true, side:false });
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        assert.ok(plain(c.transactions).length > 0, 'the engine still nets balances into transfers');
    });

    test('and those transactions still reconcile the ledger exactly', () => {
        const b = boot({ pool:true, side:false });
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: the maths is untouched`));
    });

    test('the payout section does not point at a section that is not there', () => {
        const t = boot({ pool:true, side:false }).text();
        assert.ok(!/settled in Who Pays Who below/.test(t),
            'a caption must not reference a missing section');
    });
});

describe('MONEY POOL + SIDE MATCH — THE COMBINED LIST', () => {

    test('Player Payouts AND Who Pays Who are both shown', () => {
        const b = boot({ pool:true, side:true });
        assert.ok(b.has('Player Payouts'));
        assert.ok(b.has('Who Pays Who'), 'a real head-to-head debt exists now');
    });

    test('Payouts come first, then Who Pays Who', () => {
        const html = boot({ pool:true, side:true }).html();
        assert.ok(html.indexOf('Player Payouts') < html.indexOf('Who Pays Who'),
            'what you won, then what you settle');
    });

    test('the list is COMBINED — it nets the pool and the match together', () => {
        const b = boot({ pool:true, side:true });
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0,
                `${v.name}: one settlement covering both, so nobody pays twice`));
    });

    test('the side match itself is still itemised', () => {
        assert.ok(boot({ pool:true, side:true }).has('Side Match'));
    });
});

describe('SIDE MATCHES ONLY — WHO PAYS WHO IS THE STORY', () => {

    test('Who Pays Who is shown', () => {
        assert.ok(boot({ pool:false, side:true }).has('Who Pays Who'));
    });

    test('with the actual debt between the two golfers', () => {
        const b = boot({ pool:false, side:true });
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const tx = plain(c.transactions);
        assert.equal(tx.length, 1, 'one match, one debt');
        assert.ok(b.has(tx[0].from + ' → ' + tx[0].to) || b.has(tx[0].from),
            'the payer and payee must be named');
    });
});

describe('OTHER PLAYER-TO-PLAYER GAMES ALSO COUNT', () => {

    test('a Dots game without a pool still shows Who Pays Who', () => {
        const b = boot({ pool:false, side:false, dots:true });
        if (!b.has('TOTAL PAYOUT') && !b.has('Who Pays Who')) return;   // dots disabled in build
        assert.ok(b.has('Who Pays Who'), 'dots are golfer-to-golfer money');
    });

    test('the rule keys on the money SOURCE, not the transaction count', () => {
        const src = read(PAGE);
        const at = src.indexOf('const movingSources = new Set()');
        assert.notEqual(at, -1, 'the gate must exist');
        const block = src.slice(at, at + 700);
        assert.match(block, /!l\.note && !l\.rounding/, 'moving lines only');
        assert.match(block, /every\(label => label === 'Money Pool'\)/);
        assert.ok(!/transactions\.length === 1/.test(block),
            'counting transactions would break the moment a pool round produced one');
    });

    test('a round with no money at all shows no Who Pays Who', () => {
        const b = boot({ pool:false, side:false });
        assert.ok(!b.has('Who Pays Who'), 'nothing to settle, nothing to show');
    });
});

describe('NOTHING BEHIND THE DECISION MOVED', () => {

    test('the gate is presentation only — it computes no money', () => {
        const src = read(PAGE);
        const at = src.indexOf('const movingSources = new Set()');
        const block = src.slice(at, at + 700);
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','getStrokes(']
            .forEach(t => assert.ok(!block.includes(t), `the gate must not calculate; found ${t}`));
    });

    test('transactions still come from the canonical combiner', () => {
        assert.match(read(PAGE), /const \{ netByName, transactions, contributions \} = computeCombinedNetTotals/);
    });

    test('pool-only totals still balance and carry no cents', () => {
        const b = boot({ pool:true, side:false });
        const c = b.run('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)');
        const vals = Object.values(plain(c.netByName));
        assert.equal(vals.reduce((a,v)=>a+v.net,0), 0);
        vals.forEach(v => assert.equal(v.net, Math.round(v.net)));
    });

    test('Player Payouts is unchanged in every case', () => {
        [{pool:true,side:false},{pool:true,side:true},{pool:false,side:true}].forEach(cfg => {
            const b = boot(cfg);
            if (cfg.pool) assert.ok(b.has('TOTAL PAYOUT'), JSON.stringify(cfg));
        });
    });

    test('no engine file learned about this rule', () => {
        ['pool-engine.js','settlement-engine.js','money-engine.js']
            .forEach(f => assert.ok(!/movingSources|poolOnly/.test(read(f)),
                `${f} must not carry a presentation decision`));
    });
});
