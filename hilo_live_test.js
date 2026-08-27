// ============================================================================
// LIVE HI-LO + ENGINE PARITY
//
// Hi-Lo is a complete money game - real settlement, receipts, zero-sum - and
// during play the golfer saw only "NET TO PAR". That is not the game. Hi-Lo is
// decided by two contests on every hole, the low ball and the high ball, and
// net-to-par describes neither.
//
// A THIRD PRESENTER, DELIBERATELY. buildLiveMatchStates covers segments and
// presses. buildLivePointsState covers a running total per player. Hi-Lo is
// neither: two team contests accumulating half-points. Forcing "2 UP" language
// onto it would describe a game nobody is playing.
//
// THE RULE, UNCHANGED: low ball 0.5, high ball 0.5, tie 0, and settlement is
// (t1Points - t2Points) x holeBetStake. This batch changed no money.
//
// PARITY: calculateHiLoEngine exists in settlement-engine.js AND index.html and
// was NOT covered by parity_test.js - the same latent-drift hole that let a $10
// Nassau with a $25 press show $30 live while the Receipt paid $45. Closed here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const LB = ['money-engine.js','action-model.js','settlement-engine.js'];

// Every engine in one context, in production load order.
function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
function teams(hcps) {
    return [
        { id:101, name:'Marty', hcp: hcps ? String(hcps[0]) : '0', team:'Team 1' },
        { id:102, name:'Manny', hcp: hcps ? String(hcps[1]) : '0', team:'Team 1' },
        { id:103, name:'Carp',  hcp: hcps ? String(hcps[2]) : '0', team:'Team 2' },
        { id:104, name:'Scott', hcp: hcps ? String(hcps[3]) : '0', team:'Team 2' },
    ];
}
// mut lets a case shape individual holes; everything else is a par-4 halve.
function round({ thru = 6, mut = null, hcps = null, stake = 5 } = {}) {
    const ps = teams(hcps);
    const sc = {};
    ps.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    if (mut) mut(sc);
    return { players: ps, courseData: cd18, scores: sc,
             gameFormat: 'hilo', holeBetStake: stake, settlementMode: 'whole-dollar' };
}
const SWEEP = s => { s['p101_h1'] = 3; s['p104_h1'] = 6; };            // A wins low AND high
const SPLIT = s => { s['p101_h2'] = 3; s['p102_h2'] = 7;               // A low
                     s['p103_h2'] = 4; s['p104_h2'] = 5; };            // B high
const state = (d) => engines().buildLiveHiLoState(d, cd18, d.scores);

function scorecard(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)}; renderLiveTicker();`, sb);
    return sb.document.getElementById('live-ticker-mount').innerHTML;
}
function leaderboard(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`currentBoardData=${JSON.stringify(d)}; activeView='individual';
        groupViewMode='flat'; activeScoring='net'; renderBoard();`, sb);
    return sb.document.getElementById('live-hilo-mount').innerHTML;
}
const cardOf = (html) => {
    const i = html.indexOf('<div class="lg-card"');
    return i < 0 ? '' : html.slice(i, html.lastIndexOf('</div>'));
};

// ============================================================================

describe('THE ENGINE IS CANONICAL, AND BOTH COPIES AGREE', () => {

    // settlement-engine.js settles Hi-Lo; index.html renders it. They were never
    // compared. Every case below asserts the FULL output, not just the dollars.
    const CASES = {
        'sweep':        { mut: SWEEP },
        'split':        { mut: SPLIT },
        'low tie':      { mut: s => { s['p101_h3']=3; s['p103_h3']=3; s['p104_h3']=6; } },
        'high tie':     { mut: s => { s['p101_h4']=3; s['p102_h4']=6; s['p104_h4']=6; } },
        'both tied':    { mut: null },
        'gross spread': { mut: s => { s['p101_h5']=2; s['p104_h5']=8; } },
        'net strokes':  { mut: s => { s['p101_h6']=4; s['p103_h6']=5; }, hcps:[0,0,18,18] },
        'plus handicap':{ mut: s => { s['p101_h1']=3; }, hcps:['+2',0,5,10] },
        'partial 9':    { mut: SWEEP, thru: 9 },
        'full 18':      { mut: s => { SWEEP(s); s['p103_h10']=3; }, thru: 18 },
    };
    const sig = (o) => JSON.stringify({ t1: o.t1Name, t2: o.t2Name,
        p1: o.t1Points, p2: o.t2Points, log: o.holeLog });

    Object.keys(CASES).forEach(name => {
        test(name + ': settlement-engine and index.html agree exactly', () => {
            const d = round(CASES[name]);
            const E = engines();
            const ix = loadHtmlInlineScript('index.html', IDX);
            const a = E.calculateHiLoEngine(d.players, cd18, d.scores);
            const b = JSON.parse(JSON.stringify(
                vm.runInContext('calculateHiLoEngine', ix)(d.players, cd18, d.scores)));
            assert.equal(sig(a), sig(b), name + ': the two copies must not drift');
        });
    });

    test('both copies still exist — this guard is not vacuous', () => {
        ['settlement-engine.js','index.html'].forEach(f =>
            assert.match(read(f), /function calculateHiLoEngine\(/, f));
    });
});

describe('THE HALF-POINT RULE, UNCHANGED', () => {

    test('a sweep is worth a full point', () => {
        const st = state(round({ mut: SWEEP }));
        assert.equal(st.t1Points, 1);
        assert.equal(st.t2Points, 0);
    });

    test('a split gives each side a half', () => {
        const st = state(round({ mut: SPLIT }));
        assert.equal(st.t1Points, 0.5, 'Team 1 took the low ball');
        assert.equal(st.t2Points, 0.5, 'Team 2 took the high ball');
    });

    test('a tied ball scores nothing for either side', () => {
        const st = state(round({ mut: null }));
        assert.equal(st.t1Points, 0);
        assert.equal(st.t2Points, 0);
    });

    test('a low tie still allows the high to be won', () => {
        const st = state(round({ mut: s => { s['p101_h3']=3; s['p103_h3']=3; s['p104_h3']=6; } }));
        assert.equal(st.low.tied, 6, 'every hole halved on the low ball');
        assert.equal(st.high.t1, 1, 'but Team 1 won a high');
        assert.equal(st.t1Points, 0.5);
    });
});

describe('CUMULATIVE LOW AND HIGH', () => {

    test('a sweep counts once in each column', () => {
        const st = state(round({ mut: SWEEP }));
        assert.equal(st.low.t1, 1);
        assert.equal(st.high.t1, 1);
        assert.equal(st.low.t2, 0);
        assert.equal(st.high.t2, 0);
    });

    test('a split counts one for each side, in DIFFERENT columns', () => {
        const st = state(round({ mut: SPLIT }));
        assert.equal(st.low.t1, 1, 'Team 1 low');
        assert.equal(st.high.t2, 1, 'Team 2 high');
        assert.equal(st.low.t2, 0);
        assert.equal(st.high.t1, 0);
    });

    test('sweep plus split tallies correctly together', () => {
        const st = state(round({ mut: s => { SWEEP(s); SPLIT(s); } }));
        assert.equal(st.low.t1, 2);
        assert.equal(st.high.t1, 1);
        assert.equal(st.high.t2, 1);
        assert.equal(st.t1Points, 1.5);
        assert.equal(st.t2Points, 0.5);
    });

    test('halved balls are counted as halved, not as wins', () => {
        const st = state(round({ mut: SWEEP, thru: 6 }));
        assert.equal(st.low.tied, 5, 'five halved holes');
        assert.equal(st.low.t1 + st.low.t2 + st.low.tied, 6, 'every played hole classified');
    });

    test('unplayed holes are NOT counted as halves', () => {
        const st = state(round({ mut: SWEEP, thru: 6 }));
        assert.equal(st.low.t1 + st.low.t2 + st.low.tied, 6,
            'six holes played, not eighteen');
    });

    test('the differential and lead text follow the points', () => {
        const a = state(round({ mut: SWEEP }));
        assert.equal(a.differential, 1);
        assert.match(a.leadText, /Marty\/Manny by 1/);
        const b = state(round({ mut: null }));
        assert.equal(b.differential, 0);
        assert.equal(b.leadText, 'All even', 'Hi-Lo has no AS/UP language');
    });
});

describe('GROSS, NET AND STROKES', () => {

    test('handicap strokes change the result', () => {
        // Asserted on an EXACT expected outcome, not on two states differing.
        // The first version only checked they were different, which stayed true
        // when strokes were removed entirely - the sabotage sailed through.
        //
        // 18 handicap = a shot on every hole. Team 2 gross 5 becomes net 4 and
        // ties Team 1's 4, so the low ball is halved instead of won.
        // Measured, not assumed. Gross: every hole is a 4-4 halve except H6, where
        // Team 1's high ball (4) beats Team 2's (5) - so Team 1 takes ONE high.
        const mut = s => { s['p101_h6']=4; s['p103_h6']=5; };
        const gross = state(round({ mut }));
        assert.equal(gross.low.tied, 6, 'gross: every low ball halved');
        assert.equal(gross.high.t1, 1, 'gross: Team 1 takes the one high');
        assert.equal(gross.t1Points, 0.5);

        // An 18 handicap is a shot on EVERY hole, so Team 2's net 3s beat Team 1's
        // gross 4s and they sweep the low ball outright. If strokes were dropped
        // this collapses back to the gross result.
        const net = state(round({ mut, hcps: [0,0,18,18] }));
        assert.equal(net.low.t2, 6, 'net: Team 2 wins every low ball on strokes');
        assert.equal(net.high.t2, 5, 'and five of the highs');
        assert.equal(net.t2Points, 5.5, 'strokes decide the game');
        assert.equal(net.t1Points, 0);
    });

    test('a plus handicap is handled', () => {
        const st = state(round({ mut: s => { s['p101_h1']=3; }, hcps: ['+2',0,5,10] }));
        assert.equal(typeof st.t1Points, 'number');
        assert.ok(!isNaN(st.t1Points));
    });
});

describe('NOT STARTED, PARTIAL, COMPLETE', () => {

    test('no holes played reads as not started, not a 0-0 tie', () => {
        const st = state(round({ thru: 0 }));
        assert.equal(st.started, false);
        assert.equal(st.thru, 0);
        assert.match(strip(scorecard(round({ thru: 0 }))), /No scoring yet/);
    });

    test('a partial round reports how far in it is', () => {
        assert.equal(state(round({ mut: SWEEP, thru: 9 })).thru, 9);
        assert.equal(state(round({ mut: SWEEP, thru: 13 })).thru, 13);
    });

    test('a completed round shows the final game state', () => {
        const st = state(round({ mut: s => { SWEEP(s); SPLIT(s); }, thru: 18 }));
        assert.equal(st.thru, 18);
        assert.equal(st.started, true);
        assert.equal(st.t1Points, 1.5);
    });

    test('no NaN, undefined or Infinity anywhere', () => {
        [round({ thru:0 }), round({ mut: SWEEP }), round({ mut: SWEEP, thru: 18 })].forEach(d => {
            const t = strip(scorecard(d));
            ['NaN','undefined','Infinity'].forEach(bad =>
                assert.ok(!t.includes(bad), bad + ' must never render'));
        });
    });

    test('refresh reconstructs identical state', () => {
        const d = round({ mut: s => { SWEEP(s); SPLIT(s); } });
        assert.equal(JSON.stringify(state(d)),
                     JSON.stringify(state(JSON.parse(JSON.stringify(d)))));
    });
});

describe('BOTH SURFACES, ONE STATE', () => {

    const D = () => round({ mut: s => { SWEEP(s); SPLIT(s); } });

    test('the Scorecard renders the Hi-Lo card', () => {
        const t = strip(scorecard(D()));
        assert.match(t, /LIVE GAME · HI-LO/);
        assert.match(t, /LOW/);
        assert.match(t, /HIGH/);
    });

    test('the Leaderboard renders it too', () => {
        assert.match(strip(leaderboard(D())), /LIVE GAME · HI-LO/);
    });

    test('the rendered cards are identical', () => {
        assert.equal(cardOf(scorecard(D())), leaderboard(D()));
    });

    test('NET TO PAR remains, separately', () => {
        const html = scorecard(D());
        assert.match(strip(html.replace(cardOf(html), '')), /NET TO PAR/);
        assert.ok(!/NET TO PAR/.test(cardOf(html)), 'and not inside the Hi-Lo card');
    });

    test('one presenter, defined once', () => {
        const defs = ['money-engine.js','index.html','leaderboard.html','settlement-engine.js']
            .filter(f => /function buildLiveHiLoState\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });

    test('neither page recalculates Low/High itself', () => {
        ['index.html','leaderboard.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('function buildLiveHiLoHtml');
            assert.ok(at > -1, f + ' must have the formatter');
            const fn = src.slice(at, at + 2500);
            assert.ok(!fn.includes('calculateHiLoEngine('),
                f + ' must not compute Hi-Lo; it formats the shared state');
        });
    });
});

describe('LIVE PLAY, NOT SETTLEMENT', () => {

    test('no money appears on the card', () => {
        const card = cardOf(scorecard(round({ mut: SWEEP })));
        assert.ok(!/\$/.test(card), 'no dollar figures during play');
        ['Who Pays Who','payout','buy-in','owes','settle']
            .forEach(w => assert.ok(!new RegExp(w,'i').test(strip(card)), w));
    });

    test('the presenter returns no money fields', () => {
        const st = state(round({ mut: SWEEP }));
        Object.keys(st).forEach(k =>
            assert.ok(!/money|stake|payout|owe|debt/i.test(k), 'unexpected money key: ' + k));
    });

    test('the presenter settles nothing', () => {
        const src = read('money-engine.js');
        const fn = src.slice(src.indexOf('function buildLiveHiLoState'));
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','holeBetStake']
            .forEach(t => assert.ok(!fn.includes(t), 'presenter must not settle; found ' + t));
    });

    test('settlement itself is unchanged and still zero-sum', () => {
        const E = engines();
        const d = round({ mut: s => { SWEEP(s); SPLIT(s); }, thru: 18, stake: 5 });
        const c = E.computeCombinedNetTotals(d, cd18, d.scores);
        const vals = Object.values(c.netByName);
        assert.equal(vals.reduce((a,v) => a + v.net, 0), 0, 'zero-sum');
        assert.ok(vals.some(v => v.net !== 0), 'and money actually moved');
    });
});

describe('DENSITY — HI-LO IS A PRIMARY FORMAT', () => {

    test('a Hi-Lo round shows the Hi-Lo card and no other game card', () => {
        const E = engines();
        const d = round({ mut: SWEEP });
        assert.ok(E.buildLiveHiLoState(d, cd18, d.scores), 'hi-lo card present');
        assert.equal(E.buildLivePointsState(d, cd18, d.scores), null, 'points card absent');
        assert.equal(E.buildLiveMatchStates(d, cd18, d.scores, null).length, 0, 'match card absent');
    });

    test('and other formats show no Hi-Lo card', () => {
        const E = engines();
        const ps = teams();
        const sc = {};
        ps.forEach(p => cd18.forEach(h => { if (h.hole <= 6) sc['p'+p.id+'_h'+h.hole] = 4; }));
        ['stroke','stableford','wolf','dots','match','bestball'].forEach(f =>
            assert.equal(E.buildLiveHiLoState(
                { players: ps, courseData: cd18, scores: sc, gameFormat: f }, cd18, sc), null, f));
    });

    test('no fixed widths that would force horizontal scroll', () => {
        const src = read('index.html');
        (src.match(/\.hl-[a-z-]+ \{[^}]*\}/g) || []).forEach(r =>
            assert.ok(!/width:\s*\d{3,}px/.test(r), 'fixed width would overflow: ' + r));
    });

    test('team names can shrink rather than overflow', () => {
        assert.match(read('index.html'),
            /\.hl-line span:first-child \{[^}]*text-overflow: ellipsis/);
    });
});
