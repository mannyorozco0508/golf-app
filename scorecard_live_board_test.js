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
    if (skins === 'instances') {
        // THE SHAPE A REAL ROUND ACTUALLY SAVES. The setup wizard and the Action tab
        // both write additionalGameInstances; the widget's hand-rolled detection only
        // knew additionalGames, so on a live round it never rendered at all.
        d.additionalGameInstances = { k1: { format:'skins', buyIn:5, enabled:true, carryOver:false } };
    } else if (skins === 'format') {
        d.gameFormat = 'skins'; d.skinsBuyIn = 5;
    } else if (skins) {
        d.skinsBuyIn = 5; d.additionalGames = { skins: true };
    }
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

    test('the standings widget stays away before anybody tees off', () => {
        // The skins widget may still render its own honest empty state; what must not
        // appear is a leaderboard with nobody in it.
        const b = scorecard();
        b.run('currentData.scores = {}; renderLiveTicker();');
        assert.ok(!/LIVE LEADERBOARD/.test(strip(b.ticker())), 'no standings to show yet');
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
        // The element also carries a backdrop-close handler now, so the match is on
        // the opening tag rather than an exact string.
        assert.match(src, /<div class="modal-overlay" id="live-board-overlay"/);
        assert.match(src, /closeLiveBoard\(\);" *>|closeLiveBoard\(\);/,
            'tapping the dimmed backdrop should close it');
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
        // The ledger call and the winner-grouping now live in shared helpers, so the
        // widget and the modal read one answer instead of each asking the question.
        const shared = src.slice(src.indexOf('function liveSkinsLedger'),
                                 src.indexOf('function renderSkinsWonHtml'));
        assert.match(shared, /computeSkinsHoleLedger\(data, courseData, savedScores/);
        assert.match(shared, /r\.official/);
        assert.match(shared, /r\.state === 'tie'/);
        ['getStrokes(','parseHcp(','Math.min(','officialThru =']
            .forEach(t => assert.ok(!shared.includes(t), `must not resolve skins; found ${t}`));

        const at = src.indexOf('function renderSkinsWonHtml');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /liveSkinsLedger\(\)/, 'the modal consumes the shared helper');
        assert.match(fn, /skinsWinners\(L\)/);
    });
});

describe('THE DASHBOARD WIDGETS', () => {

    test('both widgets render as bordered cards', () => {
        const html = scorecard().ticker();
        assert.match(html, /class="lw-grid"/);
        assert.equal((html.match(/class="lw-card"/g) || []).length, 2,
            'a standings card and a skins card');
        assert.match(strip(html), /LIVE LEADERBOARD/);
        assert.match(strip(html), /SKINS WON/);
    });

    test('THE OLD LOOSE TICKER IS GONE — leader info lives in one place', () => {
        const html = scorecard().ticker();
        assert.ok(!/class="live-ticker"/.test(html), 'the floating text row must not return');
        assert.ok(!/lt-scroll|lt-item/.test(html));
        const src = read('index.html');
        assert.ok(!/\.lt-scroll|\.lt-item/.test(src), 'and its styles should be gone too');
    });

    test('the standings widget still shows the top 5 with correct positions', () => {
        const t = strip(scorecard().ticker());
        assert.match(t, /1 Carp -2/);
        assert.match(t, /T2 Marty -1/);
        assert.match(t, /T4/);
        const shown = NAMES.filter(n => t.includes(n));
        assert.equal(shown.length, 5);
    });

    test('the skins widget names winners, counts and holes', () => {
        const t = strip(scorecard().ticker());
        assert.match(t, /Carp 1 skin Hole 1/);
        assert.match(t, /Scott 1 skin Hole 2/);
    });

    test('it states the official-through hole and explains the omission', () => {
        const t = strip(scorecard().ticker());
        assert.match(t, /Thru Hole 4/);
        assert.match(t, /Tied holes are not shown/,
            'a golfer should not wonder why a hole is missing');
    });

    test('an honest empty state before any skin is official', () => {
        const t = strip(scorecard({ thru:[1,0,0] }).ticker());
        assert.match(t, /No official skins yet/);
        assert.ok(!/No Skin/.test(t));
    });

    test('NO MONEY of any kind in either widget', () => {
        const html = scorecard().ticker();
        assert.ok(!/\$/.test(html));
        ['buy-in','Money Pool','payout','pot','Who Pays Who','Player Payouts']
            .forEach(w => assert.ok(!new RegExp(w, 'i').test(strip(html)), `${w} is not live golf information`));
    });

    test('the widgets sit above score entry', () => {
        // The mount moved to the START of the hole view: it is now the first thing
        // assigned rather than appended, because rendering it between the hole
        // heading and the score boxes pushed the inputs away from their hole. The
        // contract - dashboard above score entry - is unchanged and still asserted.
        const src = read('index.html');
        const mount = src.search(/html \+?= '<div id="live-ticker-mount"><\/div>'/);
        const boxes = src.indexOf('hv-score-box');
        assert.notEqual(mount, -1, 'the mount must be emitted');
        assert.ok(mount < boxes || boxes === -1, 'and it must come before the score boxes');
    });

    test('one layout rule, not a per-device pile', () => {
        const src = read('index.html');
        assert.match(src, /\.lw-grid \{ grid-template-columns: 1fr; \}|\.lw-grid \{ display: grid; grid-template-columns: 1fr;/,
            'stacked by default on a phone');
        assert.match(src, /\.lw-grid \{ grid-template-columns: 1fr 1fr; \}/,
            'side by side only at the existing wide breakpoint');
    });
});

describe('THE MODAL READS LIKE A FINISHED SCREEN', () => {

    test('NO LITERAL UNICODE ESCAPES in the header', () => {
        // \uXXXX only resolves inside a JS string; in raw HTML markup it prints
        // literally, which is exactly what device QA saw.
        const src = read('index.html');
        const head = src.slice(src.indexOf('<div class="lb-overlay-head"'),
                               src.indexOf('id="live-board-body"'));
        assert.ok(!/\\u[0-9A-Fa-f]{4}/.test(head),
            'escaped sequences must not reach the markup: ' + head.slice(0, 120));
    });

    test('the title is plain and readable', () => {
        const src = read('index.html');
        assert.match(src, /<h2 class="lb-overlay-title">Full Leaderboard<\/h2>/);
    });

    test('the close control is an obvious, labelled 44px target', () => {
        const src = read('index.html');
        assert.match(src, /aria-label="Close leaderboard"/);
        assert.match(src, /&times;/, 'a rendered glyph, not an escape');
        const rule = /\.lb-overlay-close \{([^}]*)\}/.exec(src)[1];
        assert.match(rule, /min-width:\s*44px/);
        assert.match(rule, /min-height:\s*44px/);
        assert.match(rule, /border:/, 'it should look like a control');
    });

    test('tapping the backdrop closes it', () => {
        assert.match(read('index.html'), /id="live-board-overlay"[^>]*onclick="[^"]*closeLiveBoard\(\)/);
    });

    test('the footer confirms the whole field is present', () => {
        assert.match(strip(scorecard().board()), /Showing 12 of 12 players/);
    });

    test('the header stays put while the body scrolls', () => {
        const src = read('index.html');
        const head = /\.lb-overlay-head \{([^}]*)\}/.exec(src)[1];
        assert.match(head, /position:\s*sticky/);
        const body = /\.lb-overlay-body \{([^}]*)\}/.exec(src)[1];
        assert.match(body, /overflow-y:\s*auto/);
    });
});

describe('THE SKINS WIDGET RENDERS ON A REAL ROUND', () => {

    // THE FAILURE DEVICE QA FOUND. Every storage shape must draw the widget - the
    // one that was broken is the one a round actually uses.
    [['legacy additionalGames', true],
     ['gameFormat === skins', 'format'],
     ['additionalGameInstances (setup wizard / Action tab)', 'instances']]
        .forEach(([label, shape]) => {
            test(`skins configured as ${label} renders the widget`, () => {
                const t = strip(scorecard({ skins: shape }).ticker());
                assert.match(t, /SKINS WON/, 'a configured skins game must show its widget');
            });
        });

    test('it survives every early hole being tied', () => {
        // Hiding the widget because the opening holes tied is how a golfer concludes
        // the feature is broken.
        const b = scorecard({
            skins: 'instances',
            thru: [3,3,3],
            tweak: sc => { NAMES.forEach((n,i) => { sc['p'+(101+i)+'_h1'] = 4; sc['p'+(101+i)+'_h2'] = 4; }); },
        });
        const t = strip(b.ticker());
        assert.match(t, /SKINS WON/);
        assert.match(t, /No official skins yet/);
        assert.ok(!/No Skin/.test(t), 'a tie is omitted, not narrated');
    });

    test('a later official winner appears alongside the earlier ties', () => {
        const t = strip(scorecard({ skins:'instances' }).ticker());
        assert.match(t, /SKINS WON/);
        assert.match(t, /Carp 1 skin Hole 1/);
        assert.ok(!/Hole 3/.test(t), 'hole 3 tied and stays out');
    });

    test('a round with NO skins game shows no widget', () => {
        assert.ok(!/SKINS WON/.test(strip(scorecard({ skins:false }).ticker())));
    });

    test('detection asks the canonical normalizer, not the raw shapes', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveSkinsLedger');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        // The predicate moved to action-model.js so every live surface asks one
        // question; the page now delegates rather than hand-rolling shape checks.
        assert.match(fn, /roundHasSkinsGame\(data\)/, 'the page must delegate');
        const am = read('action-model.js');
        assert.match(am, /function roundHasSkinsGame/);
        assert.match(am, /getRoundGames\(data\)\.some\(g => g\.format === 'skins'/,
            'the shared predicate still normalizes both game maps');
    });

    test('THE MOUNT EXISTS IN THE MARKUP', () => {
        // Structural, not DOM-based. helpers/load-script.js hands back a live element
        // for ANY id, so a missing node is invisible to every other test here - which
        // is exactly how the Finish Round modal shipped broken. Checked as text.
        const src = read('index.html');
        const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
        const written = [...src.matchAll(/getElementById\('(live-[a-z-]+)'\)/g)].map(m => m[1]);
        assert.ok(written.includes('live-ticker-mount'));
        [...new Set(written)].forEach(id => {
            const inserted = new RegExp("id=\\\"" + id + "\\\"").test(src);
            assert.ok(ids.has(id) || inserted, `${id} is written to but never created`);
        });
    });

    test('both widgets share one mount and one grid', () => {
        const html = scorecard({ skins:'instances' }).ticker();
        assert.match(html, /class="lw-grid"/);
        assert.equal((html.match(/class="lw-card"/g) || []).length, 2);
    });

    test('stacked by default, side by side only at the wide breakpoint', () => {
        const src = read('index.html');
        assert.match(src, /\.lw-grid \{ display: grid; grid-template-columns: 1fr;/,
            'a phone stacks them; neither may be hidden');
        assert.match(src, /\.lw-grid \{ grid-template-columns: 1fr 1fr; \}/);
    });
});

describe('THE PRODUCTION SHAPE — MONEY POOL WITH NET SKINS', () => {

    // THE ROUND FROM DEVICE QA, in the shape captureMoneyPool() in admin.html
    // actually writes. Not invented: buyIn, kp{amount,holes}, net{amount,places},
    // skins{mode,scoring,carryOver} is the literal object that function returns.
    //
    // A Money Pool is NOT a game. getRoundGames() enumerates games - the main format
    // plus additionalGames / additionalGameInstances - and a pot with prize buckets
    // appears in none of them. So every detector the widget had was false while
    // settlement was simultaneously resolving $310 of net skins and naming winners.
    // Two parts of the app disagreed about whether the round had skins at all.
    const MONEY_POOL = {
        enabled: true, buyIn: 40,
        kp: { amount: 100, holes: [3,7,12,16] },
        net: { amount: 70, places: [57.142857, 42.857143] },
        skins: { mode: 'remainder', scoring: 'net', carryOver: false },
    };

    function poolRound({ thru = [5,5,5], pool = MONEY_POOL, tweak = null } = {}) {
        const sb = loadHtmlInlineScript('index.html', IDX_DEPS);
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'0', playingForMoney:true }));
        const sc = {};
        ps.forEach((p,pi)=>{
            const g = Math.floor(pi/4);
            cd.forEach(h => { if (h.hole <= thru[g]) sc['p'+p.id+'_h'+h.hole] = 4; });
        });
        sc['p103_h1'] = 3;   // Carp
        sc['p102_h2'] = 3;   // Scott
        sc['p103_h3'] = 3;   // Carp again
        sc['p110_h5'] = 3;   // Rocco   (hole 4 left level = a tie)
        if (tweak) tweak(sc);
        const gm = {}; ps.forEach((p,i)=>{ gm[String(p.id)] = Math.floor(i/4)+1; });
        const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                    settlementMode:'whole-dollar' };
        if (pool) d.moneyPool = pool;
        vm.runInContext(`
            currentMode = 'ABCD';
            currentData = ${JSON.stringify(d)};
            window.__scPlayerGroupMap = ${JSON.stringify(gm)};
            renderLiveTicker(); renderLiveBoard();
        `, sb);
        return {
            sb, run: c => vm.runInContext(c, sb),
            ticker: () => sb.document.getElementById('live-ticker-mount').innerHTML,
        };
    }

    test('A. the scorecard detects skins on the real Money Pool shape', () => {
        const b = poolRound();
        assert.notEqual(b.run('liveSkinsLedger()'), null,
            'this returned null on the deployed round, suppressing the widget');
    });

    test('B/C. the widget is present and visible', () => {
        const html = poolRound().ticker();
        assert.match(strip(html), /SKINS WON/);
        assert.ok(!/display:\s*none/.test(html.slice(html.indexOf('SKINS WON') - 200,
                                                      html.indexOf('SKINS WON'))));
    });

    test('D. the ledger receives NET scoring, from the pool config', () => {
        const b = poolRound();
        assert.equal(b.run(`!!computeSkinsHoleLedger(currentData, currentData.courseData,
            currentData.scores, { groupOf: liveSkinsGroupOf }).net`), true,
            'moneyPool.skins.scoring is "net"');
    });

    test('E. through hole 5: Carp 1+3, Scott 2, Rocco 5', () => {
        const t = strip(poolRound().ticker());
        assert.match(t, /Carp 2 skins Holes 1, 3/);
        assert.match(t, /Scott 1 skin Hole 2/);
        assert.match(t, /Rocco 1 skin Hole 5/);
    });

    test('F. the hole 4 tie is absent', () => {
        const t = strip(poolRound().ticker());
        const skins = t.slice(t.indexOf('SKINS WON'));
        assert.ok(!/Hole 4/.test(skins));
        assert.ok(!/No Skin/.test(skins));
    });

    test('G/H/I. no dollars, no payout, no buy-in', () => {
        const html = poolRound().ticker();
        assert.ok(!/\$/.test(html), 'the pot is $310 and none of it belongs here');
        ['payout','pot','buy-in','buyIn'].forEach(w =>
            assert.ok(!new RegExp(w, 'i').test(strip(html)), `${w} must not appear`));
    });

    test('the official-through line reflects the slowest group', () => {
        assert.match(strip(poolRound({ thru:[5,5,4] }).ticker()), /Official through Hole 4/);
        assert.match(strip(poolRound({ thru:[5,5,5] }).ticker()), /Official through Hole 5/);
    });

    test('a Money Pool with NO skins bucket shows no widget', () => {
        // The distinction that keeps this from being a blanket "any pool = skins".
        const noSkins = JSON.parse(JSON.stringify(MONEY_POOL));
        noSkins.skins = { mode: 'none' };
        noSkins.net = { amount: 380, places: [57.142857, 42.857143] };
        assert.ok(!/SKINS WON/.test(strip(poolRound({ pool: noSkins }).ticker())));
    });

    test('THE RENDERER IS REACHED THROUGH THE PRODUCTION PATH', () => {
        // Not a direct helper call: renderLiveTicker() is what the scorecard runs, and
        // the assertion is on what it wrote into the real mount.
        const b = poolRound();
        b.run("document.getElementById('live-ticker-mount').innerHTML = '';");
        b.run('renderLiveTicker();');
        assert.match(strip(b.ticker()), /SKINS WON/,
            'the production render path must reach the widget');
    });

    test('THE MOUNT IS IN THE MARKUP, not fabricated by the harness', () => {
        // helpers/load-script.js returns a live element for ANY id, so a DOM check
        // alone proves nothing. Read as text.
        const src = read('index.html');
        // Matches either emission form: the mount is now the first assignment in
        // renderHoleView rather than an append. What matters is that the scorecard
        // itself inserts it, not which operator does so.
        assert.match(src, /html \+?= '<div id="live-ticker-mount"><\/div>'/,
            'the mount must be inserted by the scorecard itself');
    });

    test('detection reads the pool bucket, not a fourth hand-rolled shape', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveSkinsLedger');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /roundHasSkinsGame\(data\)/, 'the page delegates');
        const am = read('action-model.js');
        assert.match(am, /mp\.enabled && mp\.skins && mp\.skins\.mode && mp\.skins\.mode !== 'none'/,
            'the shared predicate reads the Money Pool bucket');
    });

    test('and settlement still agrees about the same round', () => {
        // The contradiction that started this: both surfaces must now say skins.
        const b = poolRound();
        const r = b.run('computeMoneyPool(currentData, currentData.courseData, currentData.scores)');
        assert.equal(r.valid, true);
        assert.ok(r.skins.amountCents > 0, 'settlement funds a skins bucket');
        assert.match(strip(b.ticker()), /SKINS WON/, 'and the scorecard shows one');
    });
});

describe('NET IS SAID OUT LOUD', () => {

    test('the widget header names the basis', () => {
        assert.match(strip(scorecard().ticker()), /LIVE LEADERBOARD — NET TO PAR/,
            'a golfer must not have to wonder whether -2 is gross or net');
    });

    test('the modal column says NET TO PAR', () => {
        assert.match(strip(scorecard().board()), /NET TO PAR/);
        const html = scorecard().board();
        assert.ok(!/>TO PAR</.test(html), 'the ambiguous header must be gone');
    });

    test('the ranking maths is untouched', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveStandings');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /computeNetToParStandings/);
        assert.match(fn, /basis: 'net'/);
    });

    test('the Score cell still stacks gross over net', () => {
        assert.match(scorecard().board(), /<span class="lb-gross">\d+<\/span><span class="lb-net">Net \d+<\/span>/);
    });
});

describe('NOTHING ELSE MOVED', () => {

    test('the pool-only Who Pays Who rule is untouched', () => {
        // Relevance is now a shared predicate too, consumed by settlement AND trip.
        assert.match(read('settlement.html'),
            /if \(transactions\.length > 0 && hasPlayerToPlayerSettlement\(contributions\)\)/);
        assert.match(read('action-model.js'), /function hasPlayerToPlayerSettlement/);
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
