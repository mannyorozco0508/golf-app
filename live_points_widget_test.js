// ============================================================================
// LIVE GAME STATUS — STABLEFORD, WOLF, DOTS
//
// A golfer playing Stableford saw only "LIVE LEADERBOARD - NET TO PAR" on the
// scorecard. So did a golfer playing Wolf, and one playing Dots. Net-to-par is
// not those games. All three engines already computed the real answer -
// calcStablefordEngine, calcWolfEngine, calcDotsEngine - and nothing rendered
// it. Exactly the failure that made a real Nassau look like stroke play.
//
// A SIBLING OF buildLiveMatchStates, NOT AN EXTENSION. Match games have segments
// and presses; these have a running total per player. One presenter covering
// both would fit neither.
//
// buildLivePointsState() computes NO game rules. It reads the canonical engines'
// `totals` and ranks them. Points and dots only - a projected payout mid-round
// is not final, and final money belongs in Results.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const LB = ['money-engine.js','action-model.js','settlement-engine.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const NAMES = ['Marty','Manny','Carp','Scott'];
const SF_POINTS = { other:0, bogey:1, par:2, birdie:3, eagle:5, albatross:10 };

function players(hcps) {
    return NAMES.map((n,i) => ({ id:101+i, name:n, hcp: hcps ? String(hcps[i]) : '0' }));
}
// birdies: { hole: playerId }  bogeys: { hole: playerId }
function scores(ps, thru, { birdies = {}, bogeys = {} } = {}) {
    const sc = {};
    ps.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    Object.keys(birdies).forEach(h => { if (+h <= thru) sc['p'+birdies[h]+'_h'+h] = 3; });
    Object.keys(bogeys).forEach(h => { if (+h <= thru) sc['p'+bogeys[h]+'_h'+h] = 5; });
    return sc;
}
const state = (d) => loadJsFile('money-engine.js')
    .buildLivePointsState(d, cd18, d.scores);

function stableford({ thru = 6, birdies = { 1:101, 2:101, 4:103 }, scoring = 'net', hcps = null } = {}) {
    const ps = players(hcps);
    return { players: ps, courseData: cd18, scores: scores(ps, thru, { birdies }),
             gameFormat: 'stableford', stablefordScoring: scoring, stablefordPoints: SF_POINTS };
}
function wolf({ thru = 6, calls = null, birdies = { 1:101, 3:102 } } = {}) {
    const ps = players();
    // The production shape: wolfCalls/h{N} = { call, partnerId? }
    const c = calls || { h1:{call:'partner',partnerId:'102'}, h2:{call:'lone'},
                         h3:{call:'partner',partnerId:'104'} };
    return { players: ps, courseData: cd18, scores: scores(ps, thru, { birdies }),
             gameFormat: 'wolf', wolfCalls: c, wolfPointVal: 5 };
}
function dots({ thru = 6, events = null } = {}) {
    const ps = players();
    // Production shape: dots/h{N} = { p{id}: ['birdie'] } — arrays, not counts.
    const e = events || { h1:{ p101:['birdie'] }, h3:{ p103:['sandy'] }, h4:{ p104:['snake'] } };
    return { players: ps, courseData: cd18, scores: scores(ps, thru),
             gameFormat: 'dots', dots: e };
}
function scorecard(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)}; renderLiveTicker();`, sb);
    return sb.document.getElementById('live-ticker-mount').innerHTML;
}
function leaderboard(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`currentBoardData=${JSON.stringify(d)}; activeView='individual';
        groupViewMode='flat'; activeScoring='net'; renderBoard();`, sb);
    return sb.document.getElementById('live-points-mount').innerHTML;
}
const cardOf = (html) => {
    const i = html.indexOf('<div class="lg-card"');
    return i < 0 ? '' : html.slice(i, html.lastIndexOf('</div>'));
};
const row = (st, name) => st.rows.find(r => r.name === name);

// ============================================================================

describe('STABLEFORD SHOWS POINTS, NOT NET TO PAR', () => {

    test('the widget renders with the game named', () => {
        const t = strip(scorecard(stableford()));
        assert.match(t, /LIVE GAME · STABLEFORD/);
    });

    test('it shows point totals from the canonical engine', () => {
        const d = stableford();
        const st = state(d);
        const engine = loadJsFile('money-engine.js').calcStablefordEngine(d, cd18, d.scores);
        st.rows.forEach(r => assert.equal(r.value, engine.totals[r.id],
            r.name + ' must match the engine, not a second calculation'));
    });

    test('two birdies beat one', () => {
        const st = state(stableford());
        assert.equal(row(st,'Marty').rank, 1, 'Marty birdied twice');
        assert.ok(row(st,'Marty').value > row(st,'Scott').value);
    });

    test('ranking is ordered and ties are marked', () => {
        // Everyone level: four-way tie, all rank 1.
        const st = state(stableford({ birdies: {} }));
        st.rows.forEach(r => { assert.equal(r.rank, 1); assert.equal(r.tied, true); });
    });

    test('gross and net differ when handicaps do', () => {
        const g = state(stableford({ scoring:'gross', hcps:[0,18,0,0] }));
        const n = state(stableford({ scoring:'net', hcps:[0,18,0,0] }));
        assert.notEqual(row(g,'Manny').value, row(n,'Manny').value);
    });

    test('a partial round reports how far in it is', () => {
        assert.equal(state(stableford({ thru: 4 })).thru, 4);
        assert.equal(state(stableford({ thru: 13 })).thru, 13);
    });

    test('refresh reconstructs identical state', () => {
        const d = stableford();
        assert.equal(JSON.stringify(state(d)),
                     JSON.stringify(state(JSON.parse(JSON.stringify(d)))));
    });

    test('it renders on the Leaderboard too', () => {
        assert.match(strip(leaderboard(stableford())), /LIVE GAME · STABLEFORD/);
    });
});

describe('WOLF SHOWS WOLF POINTS', () => {

    test('the widget renders', () => {
        assert.match(strip(scorecard(wolf())), /LIVE GAME · WOLF/);
    });

    test('points come from the canonical engine and the real wolfCalls shape', () => {
        const d = wolf();
        const st = state(d);
        const engine = loadJsFile('money-engine.js').calcWolfEngine(d, cd18, d.scores);
        st.rows.forEach(r => assert.equal(r.value, engine.totals[r.id]));
        assert.ok(st.rows.some(r => r.value !== 0), 'a played Wolf hole must score');
    });

    test('an unresolved hole scores nothing — no invented state', () => {
        // No calls at all: the engine cannot know the teams, so nobody scores.
        const st = state(wolf({ calls: {} }));
        assert.ok(st.rows.every(r => r.value === 0));
        assert.equal(st.started, false, 'and it says so rather than showing a fake tie');
    });

    test('a carry is surfaced when the engine reports one', () => {
        const d = wolf();
        const engine = loadJsFile('money-engine.js').calcWolfEngine(d, cd18, d.scores);
        const st = state(d);
        if (engine.carryPending > 0) assert.match(st.extra || '', /Carry/);
        else assert.equal(st.extra, null, 'no carry claimed when there is none');
    });

    test('a partial round reports thru', () => {
        assert.equal(state(wolf({ thru: 5 })).thru, 5);
    });

    test('refresh reconstructs identical state', () => {
        const d = wolf();
        assert.equal(JSON.stringify(state(d)),
                     JSON.stringify(state(JSON.parse(JSON.stringify(d)))));
    });

    test('it renders on the Leaderboard too', () => {
        assert.match(strip(leaderboard(wolf())), /LIVE GAME · WOLF/);
    });
});

describe('DOTS SHOWS DOTS', () => {

    test('the widget renders', () => {
        assert.match(strip(scorecard(dots())), /LIVE GAME · DOTS/);
    });

    test('totals come from the canonical engine using real event arrays', () => {
        const d = dots();
        const st = state(d);
        const engine = loadJsFile('money-engine.js').calcDotsEngine(d, cd18, d.scores);
        st.rows.forEach(r => assert.equal(r.value, engine.totals[r.id]));
    });

    test('a positive dot is credited', () => {
        const st = state(dots({ events: { h1:{ p101:['birdie'] } } }));
        assert.ok(row(st,'Marty').value > 0);
    });

    test('a Snake is a NEGATIVE dot and must not be lost', () => {
        const st = state(dots({ events: { h1:{ p104:['snake'] } } }));
        assert.ok(row(st,'Scott').value < 0, 'a snake costs the golfer');
    });

    test('multiple events across multiple players accumulate', () => {
        const st = state(dots({ events: {
            h1:{ p101:['birdie'] }, h2:{ p101:['sandy'] }, h3:{ p102:['birdie'] } } }));
        assert.ok(row(st,'Marty').value > row(st,'Manny').value);
    });

    test('a correction changes the total', () => {
        const before = state(dots({ events: { h1:{ p101:['birdie'] } } }));
        const after  = state(dots({ events: { h1:{ p102:['birdie'] } } }));
        assert.notEqual(row(before,'Marty').value, row(after,'Marty').value);
    });

    test('zero events reads as not started, not a four-way tie', () => {
        const st = state(dots({ events: {} }));
        assert.equal(st.started, false);
        assert.match(strip(scorecard(dots({ events: {} }))), /No scoring yet/);
    });

    test('refresh reconstructs identical state', () => {
        const d = dots();
        assert.equal(JSON.stringify(state(d)),
                     JSON.stringify(state(JSON.parse(JSON.stringify(d)))));
    });

    test('it renders on the Leaderboard too', () => {
        assert.match(strip(leaderboard(dots())), /LIVE GAME · DOTS/);
    });
});

describe('THE TWO SURFACES AGREE, AND STAY SEPARATE FROM NET TO PAR', () => {

    [['Stableford', stableford], ['Wolf', wolf], ['Dots', dots]].forEach(([name, mk]) => {
        test(name + ': Scorecard and Leaderboard render the identical card', () => {
            assert.equal(cardOf(scorecard(mk())), leaderboard(mk()));
        });
    });

    test('NET TO PAR is still shown, separately', () => {
        const t = strip(scorecard(stableford()));
        assert.match(t, /NET TO PAR/, 'stroke standings remain available');
        assert.match(t, /LIVE GAME · STABLEFORD/, 'beside the actual game');
    });

    test('the game card carries no net-to-par figures', () => {
        const card = cardOf(scorecard(stableford()));
        assert.ok(!/NET TO PAR/.test(card));
    });
});

describe('LIVE PLAY, NOT SETTLEMENT', () => {

    [['Stableford', stableford], ['Wolf', wolf], ['Dots', dots]].forEach(([name, mk]) => {
        test(name + ': no money, payout or Who Pays Who', () => {
            const card = cardOf(scorecard(mk()));
            assert.ok(!/\$/.test(card), 'no dollar figures during play');
            ['Who Pays Who','payout','buy-in','settle']
                .forEach(w => assert.ok(!new RegExp(w,'i').test(strip(card)), w));
        });
    });

    test('the presenter settles nothing', () => {
        const src = read('money-engine.js');
        const at = src.indexOf('function buildLivePointsState');
        const fn = src.slice(at);
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','calcPointSettlement(']
            .forEach(t => assert.ok(!fn.includes(t), 'presenter must not settle; found ' + t));
    });

    test('it reuses the canonical engines rather than its own maths', () => {
        const src = read('money-engine.js');
        const fn = src.slice(src.indexOf('function buildLivePointsState'));
        ['calcStablefordEngine(', 'calcWolfEngine(', 'calcDotsEngine(']
            .forEach(t => assert.ok(fn.includes(t), 'must call ' + t));
    });
});

describe('ONE PRESENTER, AND ONLY WHERE IT BELONGS', () => {

    test('buildLivePointsState is defined once, in money-engine.js', () => {
        const defs = ['money-engine.js','index.html','leaderboard.html','action-model.js']
            .filter(f => /function buildLivePointsState\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });

    test('no page recalculates these games locally', () => {
        ['index.html','leaderboard.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('function buildLivePointsHtml');
            assert.ok(at > -1, f + ' must have the formatter');
            const fn = src.slice(at, at + 2500);
            ['calcStablefordEngine(','calcWolfEngine(','calcDotsEngine(']
                .forEach(t => assert.ok(!fn.includes(t),
                    f + ' must not compute game rules; found ' + t));
        });
    });

    test('a stroke round grows no game card', () => {
        const ps = players();
        const d = { players: ps, courseData: cd18, scores: scores(ps, 6), gameFormat: 'stroke' };
        assert.equal(state(d), null);
        assert.ok(!/LIVE GAME/.test(strip(scorecard(d))));
    });

    test('a match round grows no game card either — that is the match widget', () => {
        const ps = players().map((p,i) => Object.assign({}, p, { team: i%2 ? 'Team 2':'Team 1' }));
        const d = { players: ps, courseData: cd18, scores: scores(ps, 6),
                    gameFormat: 'match', matchStake: 10, matchScoring: 'net', matchPressRule: 'none' };
        assert.equal(state(d), null);
    });

    test('the mounts exist in the real markup', () => {
        assert.match(read('leaderboard.html'), /<div id="live-points-mount"><\/div>/);
        assert.match(read('index.html'), /buildLivePointsHtml\(currentData/);
    });

    test('no fixed widths that would overflow a phone', () => {
        const src = read('index.html');
        (src.match(/\.lg-[a-z]+ \{[^}]*\}/g) || []).forEach(r =>
            assert.ok(!/width:\s*\d{3,}px/.test(r), 'fixed width would overflow: ' + r));
    });
});
