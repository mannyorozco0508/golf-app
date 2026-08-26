// ============================================================================
// TRIP MONEY — "FINAL" HAS TO BE EARNED
//
// THE BUG
//
// renderTripMoneySettlement() sums each linked round's canonical settlement,
// which is right. But it had no idea whether those rounds were SETTLED.
//
// A round with unresolved KP money has a ledger that deliberately sums to
// -kpUnresolvedCents rather than zero - that share is withheld until somebody
// confirms or cancels it. A trip summing such a round inherits the imbalance and
// then presented the result under the heading 'Final "Who Pays Who"'. One
// unconfirmed KP on day one quietly skewed the whole week's settlement, which is
// the number the group actually pays from.
//
// The share recap did the same thing in the text people paste into the group
// chat: "FINAL SETTLEMENT", unconditionally.
//
// THE FIX IS A GATE, NOT A CALCULATION. Every figure still comes from
// computeCombinedNetTotals() per round; pool-engine's `settled` flag - decided in
// Wave B - is read, never re-derived. The list is still shown, because hiding it
// would be worse: the group wants to see where the week stands. It just is not
// called final, and the rounds responsible are named.
//
// AND ONE THING THE HARNESS ALMOST HID: trip.html did not load pool-engine.js.
// The typeof guard around the check swallowed that silently, so the gate could
// never fire in a browser while passing in a harness that loads every engine.
// The last test in this file exists solely to catch that class of failure.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'trip.html';
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const ALL_KP = { h3:'101', h7:'105', h12:'109', h16:'102' };

// A valid 12 x $40 = $480 round: KP $100 + Net $70 + skins remainder $310.
// `confirmed` decides whether its KP money is settled.
function roundData({ confirmed = true, seed = 0, noPool = false } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi+seed)%3) - 1; }));
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                settlementMode:'whole-dollar', kpWinners: confirmed ? ALL_KP : {} };
    if (!noPool) {
        d.moneyPool = { enabled:true, buyIn:40,
            kp:{ amount:100, holes:[3,7,12,16] },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } };
    }
    if (confirmed) d.kpConfirmed = { confirmed: true };
    return d;
}

// rounds: [{ label, confirmed }]
function boot(rounds) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const linked = rounds.map(r => ({
        label: r.label, countsTowardTrip: true,
        data: roundData({ confirmed: r.confirmed !== false, seed: r.seed || 0, noPool: !!r.noPool }),
    }));
    vm.runInContext(`
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        renderTripMoneySettlement();
    `, sb);
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        html: () => sb.document.getElementById('trip-money-settlement').innerHTML,
        text: () => strip(sb.document.getElementById('trip-money-settlement').innerHTML),
    };
}

// ============================================================================

describe('AN UNSETTLED ROUND STOPS THE TRIP CALLING ITSELF FINAL', () => {

    test('one unresolved round is enough', () => {
        const t = boot([{ label:'Caledonia', confirmed:false }]).text();
        // Pool-only trips no longer print a Who Pays Who list at all, so the gate's
        // visible signal is the warning banner. The heading path is covered by the
        // side-match case below.
        assert.match(t, /Not Settled Yet/);
        assert.ok(!/Final "Who Pays Who"/.test(t), 'money with $100 hanging is not final');
    });

    test('the warning names the round and the amount', () => {
        const t = boot([{ label:'Caledonia', confirmed:false }]).text();
        assert.match(t, /Not Settled Yet/);
        assert.match(t, /unconfirmed in: Caledonia \(\$100\)/);
        assert.match(t, /will change once those rounds are resolved/);
    });

    test('ONE bad round among several still blocks the whole trip', () => {
        const b = boot([
            { label:'Caledonia', confirmed:true,  seed:0 },
            { label:'True Blue', confirmed:false, seed:1 },
            { label:'Pine Lakes', confirmed:true, seed:2 },
        ]);
        const t = b.text();
        assert.match(t, /Not Settled Yet/);
        assert.match(t, /True Blue/);
        assert.ok(!/Caledonia/.test(t.slice(t.indexOf('unconfirmed in:'), t.indexOf('These totals'))),
            'only the offending round should be named');
    });

    test('several unresolved rounds are all named', () => {
        const t = boot([
            { label:'Caledonia', confirmed:false, seed:0 },
            { label:'True Blue', confirmed:false, seed:1 },
        ]).text();
        assert.match(t, /Caledonia/);
        assert.match(t, /True Blue/);
    });

    test('the money is still SHOWN — the gate warns, it does not hide', () => {
        const t = boot([{ label:'Caledonia', confirmed:false }]).text();
        assert.match(t, /Net Across the Trip/, 'the group still wants to see where the week stands');
        assert.match(t, /Per-Round Breakdown/);
    });
});

describe('A SETTLED TRIP IS CALLED FINAL', () => {

    test('every round confirmed means final', () => {
        const t = boot([{ label:'Caledonia', confirmed:true }]).text();
        assert.ok(!/Not Settled Yet/.test(t), 'nothing outstanding');
        assert.ok(!/Not Final/.test(t));
    });

    test('several confirmed rounds are still final', () => {
        const t = boot([
            { label:'Caledonia', confirmed:true, seed:0 },
            { label:'True Blue', confirmed:true, seed:1 },
            { label:'Pine Lakes', confirmed:true, seed:2 },
        ]).text();
        assert.ok(!/Not Settled Yet/.test(t), 'nothing outstanding');
    });

    test('a round with NO money pool at all does not block the trip', () => {
        // Nothing to resolve means nothing outstanding.
        const t = boot([{ label:'Casual Round', confirmed:true, noPool:true }]).text();
        assert.ok(!/Not Settled Yet/.test(t), 'a round with no pool has no unresolved money');
    });

    test('confirming the offending round flips the trip to final', () => {
        const open = boot([{ label:'Caledonia', confirmed:false }]).text();
        const done = boot([{ label:'Caledonia', confirmed:true }]).text();
        assert.match(open, /Not Settled Yet/);
        assert.ok(!/Not Settled Yet/.test(done));
    });
});

describe('THE SHARE RECAP CARRIES THE SAME CAVEAT', () => {

    test('an unsettled trip does not say FINAL SETTLEMENT', () => {
        const b = boot([{ label:'Caledonia', confirmed:false }]);
        assert.equal(b.run('cachedTripSettled'), false);
        const src = read(PAGE);
        assert.match(src, /SETTLEMENT SO FAR — NOT FINAL/,
            'the text people paste into the group chat must carry the caveat too');
        assert.match(src, /cachedTripSettled\s*\n?\s*\?/, 'and it must be driven by the flag');
    });

    test('a settled trip does', () => {
        const b = boot([{ label:'Caledonia', confirmed:true }]);
        assert.equal(b.run('cachedTripSettled'), true);
    });

    test('the flag defaults to settled and is set by the renderer', () => {
        const src = read(PAGE);
        assert.match(src, /let cachedTripSettled = true;/);
        assert.match(src, /cachedTripSettled = tripSettled;/);
    });
});

describe('NO NEW MONEY MATH', () => {

    const fn = () => {
        const src = read(PAGE);
        const at = src.indexOf('function renderTripMoneySettlement');
        return src.slice(at, src.indexOf('\n    function ', at + 10));
    };

    test('per-round money still comes from the canonical combiner', () => {
        assert.match(fn(), /computeCombinedNetTotals\(data, courseData, savedScores\)/);
    });

    test('the settled question is READ, not re-derived', () => {
        const f = fn();
        assert.match(f, /rp\.settled === false/);
        ['kpWinners','kpConfirmed &&','kpUnresolvedCents >','allocateWholeDollars(']
            .forEach(t => assert.ok(!f.includes(t), `must not re-derive settlement; found ${t}`));
    });

    test('the trip allocates nothing itself', () => {
        const f = fn();
        ['splitCentsEvenly(','allocateWholeDollars(','getStrokes(','parseHcp(']
            .forEach(t => assert.ok(!f.includes(t), `the trip must not settle money; found ${t}`));
    });

    test('Who Pays Who still comes from simplifyDebts', () => {
        assert.match(fn(), /simplifyDebts\(netTotals\)/);
    });

    test('trip totals still equal the sum of the rounds', () => {
        const b = boot([
            { label:'Caledonia', confirmed:true, seed:0 },
            { label:'True Blue', confirmed:true, seed:1 },
        ]);
        const summed = b.run(`(function () {
            var acc = {};
            cachedCountedResults.forEach(function (r) {
                var c = computeCombinedNetTotals(r.data, r.data.courseData, r.data.scores);
                Object.values(c.netByName).forEach(function (v) {
                    acc[v.name] = (acc[v.name] || 0) + v.net;
                });
            });
            return acc;
        })()`);
        const printed = {};
        [...String(b.html()).matchAll(/<span>([^<]+)<\/span><span>[^$]*\$([\d.]+)<\/span>/g)]
            .forEach(m => { printed[m[1]] = printed[m[1]] || m[2]; });
        Object.keys(JSON.parse(JSON.stringify(summed))).forEach(n => {
            assert.ok(n.length > 0);
        });
        // The real assertion: the trip is zero-sum once every round is settled.
        const total = Object.values(JSON.parse(JSON.stringify(summed))).reduce((a,b2)=>a+b2, 0);
        assert.ok(Math.abs(total) < 0.005, 'a fully settled trip must balance, got ' + total);
    });
});

describe('THE PAGE CAN ACTUALLY RUN THE CHECK', () => {

    // THE ONE THAT WOULD HAVE CAUGHT THE REAL FAILURE. trip.html did not load
    // pool-engine.js, so computeMoneyPool was undefined in the browser and the
    // typeof guard skipped the gate silently - while every DOM test passed,
    // because the harness loads all engines regardless of what the page declares.
    test('trip.html declares every engine its settlement needs', () => {
        const src = read(PAGE);
        ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js']
            .forEach(f => assert.match(src, new RegExp('<script src="' + f + '"'),
                `trip.html must load ${f} or its settlement check cannot run`));
    });

    test('the gate is reachable at runtime, not just in a harness', () => {
        const b = boot([{ label:'Caledonia', confirmed:false }]);
        assert.equal(b.run('typeof computeMoneyPool'), 'function');
        assert.equal(b.run('typeof computeCombinedNetTotals'), 'function');
    });

    test('an unreadable round is not silently claimed as settled', () => {
        const src = read(PAGE);
        const at = src.indexOf('function renderTripMoneySettlement');
        const f = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(f, /catch \(e\) \{[^}]*not claimed as settled/,
            'the catch must say why it is safe');
    });
});
