// ============================================================================
// ONE QUESTION, ONE ANSWER — ACROSS EVERY SURFACE
//
// Two predicates were hand-written in three or four places each, and every copy
// drifted. Both now live in action-model.js, the one module every live surface
// already loads.
//
// 1. roundHasSkinsGame(data)
//
//    A MONEY POOL SKINS BUCKET IS NOT A "SKINS GAME". getRoundGames() enumerates
//    GAMES - main format plus additionalGames / additionalGameInstances. A Money
//    Pool is a pot with prize BUCKETS, and its skins live at moneyPool.skins,
//    written by captureMoneyPool() in admin.html. So a round created through the
//    real setup flow answered "no skins" to every legacy predicate while
//    settlement was resolving hundreds of dollars of net skins on the same data.
//
//    That bug was fixed once, on one surface, and left standing on two others -
//    which is exactly what having four copies guarantees.
//
// 2. hasPlayerToPlayerSettlement(contributions)
//
//    In a pool-only round nobody owes another golfer anything: everyone paid the
//    same pot and the winners were paid by it. The engine can still net those
//    balances into transfers - it always can - but printing them invents a debt.
//    Keyed on the MOVING LINE LABELS, never the transaction count, because a pool
//    round produces transactions too.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const plain = (v) => JSON.parse(JSON.stringify(v));

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];

// EXACTLY what captureMoneyPool() in admin.html writes: Net Finish, KP, Net Skins,
// ties void. Not invented - this is the production configuration.
const MONEY_POOL = {
    enabled: true, buyIn: 40,
    kp: { amount: 100, holes: [3,7,12,16] },
    net: { amount: 70, places: [57.142857, 42.857143] },
    skins: { mode: 'remainder', scoring: 'net', carryOver: false },
};

function roundData({ thru = [5,5,5], pool = MONEY_POOL, side = false, confirmed = false } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'0', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>{
        const g = Math.floor(pi/4);
        cd.forEach(h => { if (h.hole <= thru[g]) sc['p'+p.id+'_h'+h.hole] = 4; });
    });
    sc['p103_h1'] = 3;   // Carp
    sc['p102_h2'] = 3;   // Scott
    sc['p103_h3'] = 3;   // Carp
    sc['p110_h5'] = 3;   // Rocco    (hole 4 level = tie)
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                settlementMode:'whole-dollar' };
    if (pool) d.moneyPool = pool;
    if (confirmed) { d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
                     d.kpConfirmed = { confirmed: true }; }
    if (side) d.sideMatches = { m1:{ format:'match', scoring:'net', stake:50,
        startHole:1, createdAt:1, teamAIds:['101'], teamBIds:['103'] } };
    const gm = {}; ps.forEach((p,i)=>{ gm[String(p.id)] = Math.floor(i/4)+1; });
    return { d, gm };
}

// Each live skins surface, rendered through its own production path.
function surfaces(opts) {
    const { d, gm } = roundData(opts);
    const J = o => JSON.stringify(o);
    const out = {};

    const a = loadHtmlInlineScript('index.html', ['score-marks.js','money-engine.js','action-model.js',
        'settlement-engine.js','pool-engine.js','bet-strip.js','hole-events.js']);
    vm.runInContext(`currentMode='A'; currentData=${J(d)}; window.__scPlayerGroupMap=${J(gm)};
        renderLiveTicker(); renderLiveSkins();`, a);
    out.widget = a.document.getElementById('live-ticker-mount').innerHTML;
    out.strip  = a.document.getElementById('live-skins-mount').innerHTML;

    const b = loadHtmlInlineScript('leaderboard.html', ['money-engine.js','action-model.js','settlement-engine.js']);
    vm.runInContext(`currentBoardData=${J(d)}; activeView='individual'; groupViewMode='flat';
        activeScoring='net'; renderBoard();`, b);
    out.leaderboard = b.document.getElementById('live-skins-mount').innerHTML;

    const c = loadHtmlInlineScript('settlement.html', ['score-marks.js','money-engine.js','action-model.js',
        'settlement-engine.js','pool-engine.js']);
    vm.runInContext(`currentMode='A'; currentData=${J(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, c);
    out.results = c.document.getElementById('combined-settlement-summary').innerHTML;
    return out;
}

// ============================================================================

describe('THE SHARED SKINS PREDICATE', () => {

    const m = () => loadJsFile('action-model.js');

    test('the production Money Pool shape is recognised', () => {
        assert.equal(m().roundHasSkinsGame({ moneyPool: MONEY_POOL }), true,
            'this is the shape the setup wizard actually writes');
    });

    test('a pool with NO skins bucket is not a skins round', () => {
        const noSkins = JSON.parse(JSON.stringify(MONEY_POOL));
        noSkins.skins = { mode: 'none' };
        assert.equal(m().roundHasSkinsGame({ moneyPool: noSkins }), false);
    });

    test('a disabled pool does not count', () => {
        const off = JSON.parse(JSON.stringify(MONEY_POOL));
        off.enabled = false;
        assert.equal(m().roundHasSkinsGame({ moneyPool: off }), false);
    });

    test('every legacy shape still works', () => {
        const f = m().roundHasSkinsGame;
        assert.equal(f({ additionalGames: { skins: true } }), true);
        assert.equal(f({ gameFormat: 'skins' }), true);
        assert.equal(f({ skinsBuyIn: 5 }), true);
        assert.equal(f({ additionalGameInstances: { k:{ format:'skins', enabled:true } } }), true);
    });

    test('a round with no skins at all is false', () => {
        assert.equal(m().roundHasSkinsGame({ gameFormat: 'stroke' }), false);
        assert.equal(m().roundHasSkinsGame(null), false);
    });

    test('THERE IS EXACTLY ONE COPY — no page hand-rolls it', () => {
        const files = fs.readdirSync(REPO_ROOT).filter(f => /\.(html|js)$/.test(f)
            && !f.includes('_original_fallback') && !/test/.test(f));
        const defs = files.filter(f => /function roundHasSkinsGame/.test(read(f)));
        assert.deepEqual(defs, ['action-model.js']);
        // And no survivor of the old inline predicate.
        files.forEach(f => assert.ok(!/const skinsOn = \(data\.additionalGames/.test(read(f)),
            `${f} still carries a hand-rolled skins check`));
    });
});

describe('EVERY LIVE SKINS SURFACE AGREES', () => {

    const S = () => surfaces({ thru: [5,5,5] });

    test('all four recognise the production Money Pool round', () => {
        const s = S();
        assert.match(strip(s.widget), /SKINS WON/, 'scorecard widget');
        assert.ok(s.strip.length > 0, 'scorecard live-skins strip');
        assert.ok(s.leaderboard.length > 0, 'leaderboard Live Skins');
        assert.match(strip(s.results), /SKINS WON/, 'Results live summary');
    });

    test('they name the same winners on the same holes', () => {
        const s = S();
        [['widget', s.widget], ['strip', s.strip], ['leaderboard', s.leaderboard], ['results', s.results]]
            .forEach(([label, html]) => {
                const t = strip(html);
                assert.match(t, /Carp/, `${label}: Carp won holes 1 and 3`);
                assert.match(t, /Scott/, `${label}: Scott won hole 2`);
                assert.match(t, /Rocco/, `${label}: Rocco won hole 5`);
            });
    });

    test('they agree on the official-through hole', () => {
        const s = surfaces({ thru: [5,5,4] });   // group 3 is a hole behind
        [['strip', s.strip], ['leaderboard', s.leaderboard], ['results', s.results], ['widget', s.widget]]
            .forEach(([label, html]) => {
                const t = strip(html);
                const m = /(?:through|thru|Thru) Hole (\d+)/i.exec(t) || /Official thru (\d+)/i.exec(t);
                if (m) assert.equal(m[1], '4', `${label} disagrees about the official hole`);
            });
    });

    test('an incomplete hole is not awarded on ANY surface', () => {
        // Scoped to the SKINS portion. Rocco legitimately appears in the standings on
        // the widget and in Results - he is playing well - and asserting his total
        // absence was testing the wrong thing. What must not happen is his being
        // credited a skin for a hole two groups out of three have finished.
        const s = surfaces({ thru: [5,5,4] });
        const skinsPart = html => {
            const t = strip(html);
            const i = t.search(/SKINS WON|Skins/i);
            return i === -1 ? '' : t.slice(i);
        };
        [['widget', s.widget], ['strip', s.strip], ['leaderboard', s.leaderboard], ['results', s.results]]
            .forEach(([label, html]) => {
                assert.ok(!/Rocco/.test(skinsPart(html)),
                    `${label}: hole 5 is not official while group 3 is behind`);
            });
    });

    test('no live dollar values anywhere', () => {
        const s = S();
        ['widget','strip','leaderboard'].forEach(k =>
            assert.ok(!/\$/.test(s[k]), `${k} must not price a live skin`));
        const res = strip(s.results);
        assert.ok(!/\$/.test(s.results), 'live Results must not price one either');
        assert.match(res, /LIVE RESULTS/);
    });

    test('no second skins resolver was introduced', () => {
        const files = fs.readdirSync(REPO_ROOT).filter(f => /\.(html|js)$/.test(f)
            && !f.includes('_original_fallback') && !/test/.test(f));
        const defs = files.filter(f => /function computeSkinsHoleLedger/.test(read(f)));
        assert.deepEqual(defs, ['settlement-engine.js']);
    });
});

describe('THE SHARED RELEVANCE PREDICATE', () => {

    const m = () => loadJsFile('action-model.js');

    test('pool only means nobody owes anybody', () => {
        assert.equal(m().hasPlayerToPlayerSettlement(
            { a: { lines: [{ label: 'Money Pool', amount: 88 }] } }), false);
    });

    test('a side match creates a real debt', () => {
        assert.equal(m().hasPlayerToPlayerSettlement(
            { a: { lines: [{ label: 'Money Pool', amount: 88 },
                           { label: 'Side Match · Marty vs Carp', amount: 50 }] } }), true);
    });

    test('side match only', () => {
        assert.equal(m().hasPlayerToPlayerSettlement(
            { a: { lines: [{ label: 'Side Match · Marty vs Carp', amount: 50 }] } }), true);
    });

    test('note and rounding lines are ignored', () => {
        assert.equal(m().hasPlayerToPlayerSettlement({ a: { lines: [
            { label: 'Money Pool', amount: 88 },
            { label: 'Net Skins · 2 skins', amount: 89, note: true },
            { label: 'Rounding to whole dollars', amount: 1, rounding: true },
        ] } }), false, 'only MOVING lines describe where money came from');
    });

    test('it does NOT key on transaction count', () => {
        const src = read('action-model.js');
        const at = src.indexOf('function hasPlayerToPlayerSettlement');
        const fn = src.slice(at);
        assert.ok(!/transactions/.test(fn),
            'a pool round produces transactions too; counting them would suppress a real match');
    });

    test('EXACTLY ONE COPY, consumed by both surfaces', () => {
        const files = fs.readdirSync(REPO_ROOT).filter(f => /\.(html|js)$/.test(f)
            && !f.includes('_original_fallback') && !/test/.test(f));
        const defs = files.filter(f => /function hasPlayerToPlayerSettlement/.test(read(f)));
        assert.deepEqual(defs, ['action-model.js']);
        assert.match(read('settlement.html'), /hasPlayerToPlayerSettlement\(contributions\)/);
        assert.match(read('trip.html'), /hasPlayerToPlayerSettlement\(tripContributions\)/);
    });
});

describe('TRIP MODE HONOURS THE SAME RULE', () => {

    function trip({ side = false, pool = true, confirmed = true, rounds = 1 } = {}) {
        const sb = loadHtmlInlineScript('trip.html', ['money-engine.js','action-model.js',
            'settlement-engine.js','pool-engine.js','score-marks.js']);
        const linked = [];
        for (let i = 0; i < rounds; i++) {
            const { d } = roundData({ thru:[18,18,18], pool: pool ? MONEY_POOL : null,
                                     side, confirmed });
            linked.push({ label: 'Round ' + (i+1), countsTowardTrip: true, data: d });
        }
        vm.runInContext(`cachedRoundResults=${JSON.stringify(linked)};
            cachedCountedResults = cachedRoundResults; renderTripMoneySettlement();`, sb);
        return {
            sb, run: c => vm.runInContext(c, sb),
            text: () => strip(sb.document.getElementById('trip-money-settlement').innerHTML),
        };
    }

    test('CASE 1 — pool only hides Who Pays Who', () => {
        const t = trip({ side:false }).text();
        assert.ok(!/Who Pays Who/.test(t),
            'a week of shared pots creates no debts between people');
        assert.match(t, /Net Across the Trip/, 'the money is still shown');
    });

    test('CASE 1 — the engine still produces transactions', () => {
        // Proves this is presentation, not a change to the accounting.
        const b = trip({ side:false });
        assert.ok(b.run('cachedMoneyTransactions.length') > 0);
    });

    test('CASE 2 — pool plus a side match shows Who Pays Who', () => {
        assert.match(trip({ side:true, pool:true }).text(), /Who Pays Who/);
    });

    test('CASE 3 — side match only shows Who Pays Who', () => {
        assert.match(trip({ side:true, pool:false }).text(), /Who Pays Who/);
    });

    test('a side match on ONE day of the trip is enough', () => {
        // Contributions are merged across rounds before the question is asked.
        const src = read('trip.html');
        assert.match(src, /tripContributions\[k\]\.lines\.concat/);
    });

    test('THE SETTLED GATE IS UNTOUCHED', () => {
        const t = trip({ side:false, confirmed:false }).text();
        assert.match(t, /Not Settled Yet/, 'unresolved rounds must still be flagged');
    });

    test('and trip totals still reconcile', () => {
        const b = trip({ side:true, pool:true });
        const tx = plain(b.run('cachedMoneyTransactions'));
        tx.forEach(t => assert.equal(t.amount, Math.round(t.amount), 'no cents'));
    });
});

describe('NO MATH MOVED', () => {

    test('the predicates compute no money', () => {
        const src = read('action-model.js');
        const at = src.indexOf('function roundHasSkinsGame');
        const block = src.slice(at);
        ['allocateWholeDollars(','simplifyDebts(','computeMoneyPool(','getStrokes(']
            .forEach(t => assert.ok(!block.includes(t), `a predicate must not settle; found ${t}`));
    });

    test('settlement still produces the same transactions for a pool round', () => {
        const { d } = roundData({ thru:[18,18,18], confirmed:true });
        const sb = loadHtmlInlineScript('settlement.html', ['score-marks.js','money-engine.js',
            'action-model.js','settlement-engine.js','pool-engine.js']);
        vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)};`, sb);
        const c = vm.runInContext('computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)', sb);
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from]||0) - t.amount;
            moved[t.to] = (moved[t.to]||0) + t.amount;
        });
        Object.values(plain(c.netByName)).forEach(v =>
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: the ledger is untouched`));
    });
});
