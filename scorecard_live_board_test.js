// ============================================================================
// SCORECARD AS LIVE COMMAND CENTRE
//
// Golfers are already on the scorecard entering scores. Making them navigate to
// another tab to see who is leading is the friction this removes: a one-line
// ticker above score entry, and one tap for the whole field.
//
// ONE RANKING FOR THE WHOLE APP. computeNetToParStandings() was lifted out of
// leaderboard.html's renderBoard(), where it was computed and rendered in a
// single pass and nothing else could reach it. Both surfaces now call the same
// function, because a golfer must never open the Leaderboard tab and this ticker
// on the same round and see two different orders. Extracting rather than copying
// is the whole point - a third copy is exactly how they would drift.
//
// RELATIVE TO PAR, NOT A RUNNING TOTAL. "Net 19" means nothing at a glance after
// five holes; "-2" means everything. parPlayed counts only holes actually posted.
//
// WINNERS ONLY IN SKINS. A tied hole produced no skin, so it does not belong in
// a list of skins won. A golfer with none is not news. And a hole every group has
// not finished is not a result yet - the canonical ledger decides that, never the
// presenter.
//
// NO MONEY ANYWHERE HERE. The scorecard answers who is leading and who has won
// skins. Results answers what anything is worth.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const IDX_DEPS = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
                  'pool-engine.js','bet-strip.js','hole-events.js'];
const LB_DEPS = ['money-engine.js','action-model.js','settlement-engine.js'];

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];

// Level handicaps by default so a tie on gross is a tie on net - the state the
// skins ledger must recognise. `hcps` overrides that where a test needs it.
function fixture({ thru = [5,5,4], hcps = null, tweak = null, skins = true } = {}) {
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp: String(hcps ? hcps[i] : 0) }));
    const sc = {};
    ps.forEach((p,pi)=>{
        const g = Math.floor(pi/4);
        cd.forEach(h => { if (h.hole <= thru[g]) sc['p'+p.id+'_h'+h.hole] = 4; });
    });
    sc['p103_h1'] = 3;                       // Carp takes hole 1
    sc['p102_h2'] = 3;                       // Scott takes hole 2
    sc['p103_h3'] = 3; sc['p101_h3'] = 3;    // hole 3 ties on net
    if (tweak) tweak(sc);
    const gm = {}; ps.forEach((p,i)=>{ gm[String(p.id)] = Math.floor(i/4)+1; });
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke', skinsCarryOver:false };
    if (skins) { d.skinsBuyIn = 5; d.additionalGames = { skins: true }; }
    return { d, gm };
}

function scorecard(opts) {
    const sb = loadHtmlInlineScript('index.html', IDX_DEPS);
    const { d, gm } = fixture(opts);
    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(d)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        renderLiveTicker(); renderLiveBoard();
    `, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        ticker: () => sb.document.getElementById('live-ticker-mount').innerHTML,
        board:  () => sb.document.getElementById('live-board-body').innerHTML,
    };
}

function leaderboardOrder(opts) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB_DEPS);
    const { d } = fixture(opts);
    vm.runInContext(`
        currentBoardData = ${JSON.stringify(d)};
        activeView='individual'; groupViewMode='flat'; activeScoring='net';
        renderBoard();
    `, sb);
    const html = sb.document.getElementById('board-content').innerHTML;
    return [...html.matchAll(/class="player-name">([^<]+)<span/g)].map(m => m[1]);
}

// ============================================================================

describe('THE SHARED RANKING HELPER', () => {

    const m = () => loadJsFile('money-engine.js');

    test('it returns to-par, not a running total', () => {
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = [{ id:1, name:'A', hcp:'0' }];
        const sc = {}; [4,4,4,3,4].forEach((v,i)=>{ sc['p1_h'+(i+1)] = v; });
        const r = m().computeNetToParStandings(ps, cd, sc)[0];
        assert.equal(r.gross, 19);
        assert.equal(r.toPar, -1, 'five holes of par is 20, so 19 is one under');
        assert.equal(r.thru, 5);
    });

    test('a golfer who has not teed off is not level par', () => {
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const r = m().computeNetToParStandings(
            [{ id:1, name:'A', hcp:'0' }, { id:2, name:'B', hcp:'0' }],
            cd, { 'p1_h1': 3 });
        assert.equal(r[0].name, 'A', 'a golfer with a score outranks one without');
        assert.equal(r[1].started, false);
        assert.equal(r[1].positionLabel, '\u2014', 'no position, not 2nd');
    });

    test('ties share a position and consume the slots beneath', () => {
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = ['A','B','C'].map((n,i)=>({ id:i+1, name:n, hcp:'0' }));
        const sc = { p1_h1:3, p2_h1:3, p3_h1:4 };
        const r = m().computeNetToParStandings(ps, cd, sc);
        assert.equal(r[0].positionLabel, 'T1');
        assert.equal(r[1].positionLabel, 'T1');
        assert.equal(r[2].positionLabel, '3', 'never 1st, 2nd, 3rd when two are tied');
    });

    test('formatToPar reads like a scoreboard', () => {
        const f = m().formatToPar;
        assert.equal(f(0), 'E');
        assert.equal(f(-2), '-2');
        assert.equal(f(3), '+3');
    });

    test('handicaps are allocated by the canonical pair', () => {
        const src = read('money-engine.js');
        const at = src.indexOf('function computeNetToParStandings');
        const fn = src.slice(at, src.indexOf('\nfunction formatToPar', at));
        assert.match(fn, /getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\)/);
    });
});

describe('LIVE TICKER ON THE SCORECARD', () => {

    test('it renders above score entry', () => {
        const src = read('index.html');
        const mount = src.indexOf('live-ticker-mount');
        const boxes = src.indexOf('hv-score-box');
        assert.notEqual(mount, -1);
        assert.ok(mount < boxes || boxes === -1, 'the ticker must not push score entry down');
    });

    test('it shows the top 5, no more', () => {
        const t = strip(scorecard().ticker());
        const shown = NAMES.filter(n => t.includes(n));
        assert.equal(shown.length, 5, 'twelve golfers, five slots');
    });

    test('values are relative to par, not cumulative totals', () => {
        const t = strip(scorecard().ticker());
        assert.match(t, /(-\d+|\+\d+|E)/);
        assert.ok(!/Net \d\d/.test(t), '"Net 19" tells a golfer nothing on the tee');
    });

    test('tie positions are honest', () => {
        // Carp leads outright in the base fixture, so the top slot is "1", not "T1" -
        // asserting T1 there would have been asserting a bug. The tie is on -1 behind
        // him, and the golfer after a two-way tie must be 4th, never 3rd.
        const t = strip(scorecard().ticker());
        assert.match(t, /1 Carp/);
        assert.ok(!/T1 Carp/.test(t), 'an outright leader must not be marked tied');
        assert.match(t, /T2 \w+ -1/, 'the pair behind him share second');
        assert.match(t, /T4/, 'and the next pair take fourth, not third');
    });

    test('it offers a way to the full field', () => {
        assert.match(scorecard().ticker(), /onclick="openLiveBoard\(\)"/);
        assert.match(strip(scorecard().ticker()), /Full Leaderboard/);
    });

    test('NO MONEY in the ticker', () => {
        assert.ok(!/\$/.test(scorecard().ticker()));
    });

    test('it stays empty before anybody tees off', () => {
        const b = scorecard();
        b.run('currentData.scores = {}; renderLiveTicker();');
        assert.equal(b.ticker(), '', 'nothing to say yet');
    });

    test('it is always NET, whatever the Leaderboard toggle says', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveStandings');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /basis: 'net'/);
        assert.ok(!/activeScoring/.test(fn), 'the other tab\u2019s toggle must not reach in here');
    });
});

describe('THE FULL-FIELD OVERLAY', () => {

    test('it uses the page\u2019s existing modal pattern', () => {
        const src = read('index.html');
        assert.match(src, /<div class="modal-overlay" id="live-board-overlay">/);
    });

    test('open and close are plain display toggles — no navigation', () => {
        const b = scorecard();
        b.run('openLiveBoard();');
        assert.equal(b.run("document.getElementById('live-board-overlay').style.display"), 'flex');
        b.run('closeLiveBoard();');
        assert.equal(b.run("document.getElementById('live-board-overlay').style.display"), 'none');
    });

    test('score-entry state survives opening it', () => {
        // The scorecard stays mounted underneath; nothing is torn down or reloaded.
        const src = read('index.html');
        const at = src.indexOf('function openLiveBoard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        ['location.href','window.open','.reload(','renderHoleView()']
            .forEach(t => assert.ok(!fn.includes(t), `opening the board must not disturb the scorecard; found ${t}`));
    });

    test('it lists the ENTIRE field', () => {
        const t = strip(scorecard().board());
        NAMES.forEach(n => assert.ok(t.includes(n), `${n} missing from the full board`));
    });

    test('gross and net are both shown, stacked', () => {
        const html = scorecard().board();
        assert.match(html, /<span class="lb-gross">\d+<\/span><span class="lb-net">Net \d+<\/span>/);
    });

    test('to-par and thru are shown', () => {
        const t = strip(scorecard().board());
        assert.match(t, /TO PAR/);
        assert.match(t, /THRU/);
        assert.match(t, /(-\d+|\+\d+|E) 5/, 'a to-par value beside a thru count');
    });

    test('NO MONEY ACCOUNTING anywhere in the overlay', () => {
        const t = strip(scorecard().board());
        assert.ok(!/\$/.test(scorecard().board()));
        ['Player Payouts','Who Pays Who','Final Ledger','Money Pool','buy-in','TOTAL PAYOUT']
            .forEach(s => assert.ok(!new RegExp(s, 'i').test(t), `${s} belongs in Results, not here`));
    });
});

describe('PARITY WITH THE LEADERBOARD TAB', () => {

    test('the same round produces the same NET order on both surfaces', () => {
        const board = strip(scorecard().board());
        const lbOrder = leaderboardOrder();
        // Read the scorecard order back out of its own markup.
        const scOrder = [...scorecard().board().matchAll(/class="lb-c-name">([^<]+)<span/g)].map(m => m[1]);
        assert.deepEqual(scOrder, lbOrder,
            'two surfaces showing one round must not disagree about who is leading');
        assert.ok(board.length > 0);
    });

    test('and the same gross and net values', () => {
        const sc = scorecard().board();
        const scRows = [...sc.matchAll(/lb-c-name">([^<]+)<span[^>]*>[^<]*<\/span><\/span><span class="lb-c-score"><span class="lb-gross">(\d+)<\/span><span class="lb-net">Net (\d+)</g)]
            .map(m => ({ name:m[1], gross:+m[2], net:+m[3] }));
        assert.ok(scRows.length > 0, 'the overlay must render score cells');

        const m = loadJsFile('money-engine.js');
        const { d } = fixture();
        const canon = m.computeNetToParStandings(d.players, d.courseData, d.scores, { basis:'net' });
        scRows.forEach(r => {
            const c = canon.find(x => x.name === r.name);
            assert.equal(r.gross, c.gross, `${r.name} gross`);
            assert.equal(r.net, c.net, `${r.name} net`);
        });
    });

    test('leaderboard.html now consumes the shared helper too', () => {
        const src = read('leaderboard.html');
        assert.match(src, /computeNetToParStandings\(players, courseData, savedScores/);
    });

    test('neither surface reimplements the ranking', () => {
        ['index.html','leaderboard.html'].forEach(f => {
            const src = read(f);
            assert.ok(!/toParNet\s*=\s*net\s*-\s*parPlayed/.test(src),
                `${f} must not recompute to-par itself`);
        });
    });
});

describe('SKINS WON — WINNERS ONLY', () => {

    test('official winners are listed with their holes', () => {
        const t = strip(scorecard().board());
        assert.match(t, /Carp 1 skin · Hole 1/);
        assert.match(t, /Scott 1 skin · Hole 2/);
    });

    test('a TIED hole is simply absent', () => {
        const t = strip(scorecard().board());
        assert.ok(!/No Skin/.test(t), 'this is a winners list, not an audit trail');
        assert.ok(!/Hole 3/.test(t), 'hole 3 tied on net and produced nothing');
    });

    test('golfers with no skins are absent', () => {
        const t = strip(scorecard().board());
        const skinsPart = t.slice(t.indexOf('SKINS WON'));
        assert.ok(!/Jeremy/.test(skinsPart));
        assert.ok(!/Rocco/.test(skinsPart));
    });

    test('a hole every group has not finished cannot produce a winner', () => {
        // Groups 1 and 2 are thru 5; group 3 is thru 4. Hole 5 is not official.
        const t = strip(scorecard({ thru:[5,5,4], tweak: sc => { sc['p101_h5'] = 2; } }).board());
        assert.match(t, /Official through Hole 4/);
        assert.ok(!/Hole 5/.test(t.slice(t.indexOf('SKINS WON'))),
            'two groups out of three is not a result');
    });

    test('it resolves the moment the last group posts', () => {
        const after = strip(scorecard({
            thru:[5,5,5],
            tweak: sc => { sc['p101_h5'] = 2; },
        }).board());
        assert.match(after, /Official through Hole 5/);
        assert.match(after, /Marty/);
    });

    test('plural grammar is correct', () => {
        const t = strip(scorecard({ tweak: sc => { sc['p103_h4'] = 3; } }).board());
        assert.match(t, /Carp 2 skins · Holes 1, 4/);
        assert.match(t, /Scott 1 skin · Hole 2/);
    });

    test('winners sort by count, deterministically', () => {
        const t = strip(scorecard({ tweak: sc => { sc['p103_h4'] = 3; } }).board());
        assert.ok(t.indexOf('Carp 2 skins') < t.indexOf('Scott 1 skin'), 'most skins first');
    });

    test('an honest empty state before anything is official', () => {
        const t = strip(scorecard({ thru:[1,0,0] }).board());
        assert.match(t, /No official skins yet/);
        assert.ok(!/No Skin/.test(t));
    });

    test('a round with no skins game shows no skins section', () => {
        const t = strip(scorecard({ skins:false }).board());
        assert.ok(!/SKINS WON/.test(t));
    });

    test('NO DOLLAR VALUES, ever', () => {
        const html = scorecard({ tweak: sc => { sc['p103_h4'] = 3; } }).board();
        assert.ok(!/\$/.test(html));
        assert.ok(!/pot|payout|value|worth/i.test(strip(html)));
    });

    test('it reads the canonical ledger and resolves nothing', () => {
        const src = read('index.html');
        const at = src.indexOf('function renderSkinsWonHtml');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /computeSkinsHoleLedger\(data, courseData, savedScores/);
        ['getStrokes(','parseHcp(','Math.min(','officialThru =']
            .forEach(t => assert.ok(!fn.includes(t), `the presenter must not resolve skins; found ${t}`));
        assert.match(fn, /r\.official/);
        assert.match(fn, /r\.state === 'tie'/);
    });
});

describe('NOTHING ELSE MOVED', () => {

    test('the pool-only Who Pays Who rule is untouched', () => {
        const src = read('settlement.html');
        assert.match(src, /const poolOnly = movingSources\.size > 0/);
        assert.match(src, /if \(transactions\.length > 0 && !poolOnly\)/);
    });

    test('the LIVE overlay never renders Who Pays Who', () => {
        // index.html does contain the phrase - inside the Finish Round modal, which is
        // an end-of-round settlement surface and a different thing entirely. What must
        // stay clean is the live board.
        const t = strip(scorecard().board());
        assert.ok(!/Who Pays Who/.test(t));
        const src = read('index.html');
        const at = src.indexOf('function renderLiveBoard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.ok(!/Who Pays Who|Player Payouts|Money Pool/.test(fn));
    });

    test('no engine gained presentation code', () => {
        ['pool-engine.js','settlement-engine.js','action-model.js']
            .forEach(f => assert.ok(!/live-ticker|lb-overlay|sw-row/.test(read(f)),
                `${f} must not carry scorecard markup`));
    });

    test('money-engine gained only the standings helper', () => {
        const src = read('money-engine.js');
        assert.match(src, /function computeNetToParStandings/);
        assert.match(src, /function formatToPar/);
        assert.ok(!/innerHTML|document\./.test(src), 'the engine must not touch the DOM');
    });
});
