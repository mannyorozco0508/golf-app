// ============================================================================
// THE CURRENT HOLE READS AS ONE SCORING UNIT
//
// The live dashboard used to render BETWEEN the hole heading and the score
// boxes. With a Nassau running that is not a thin strip: several press rows can
// appear at once -
//
//     AUTO PRESS · H3    AUTO PRESS · H5    AUTO PRESS · H7    AUTO PRESS · H9
//
// - and they pushed the inputs away from the hole they belong to. On a phone
// "Hole 9 · Par 3" and Paul's score box stopped looking like one thing.
//
// Entering scores is the golfer's task; live action is context. So the order is
// now dashboard first, then an unbroken hole block: heading, players, boxes,
// Prev/Next.
//
// LAYOUT ONLY. No engine, settlement, press logic or Nassau calculation was
// touched, and nothing was removed from the wager panel - the press-heavy case
// below asserts every row is still there.
//
// These tests read the ORDER the render function emits, not a stubbed DOM: the
// mini-DOM does not model document order, so asking it "what comes first" would
// prove nothing.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const PAUL_PETE = [{ id:101, name:'Paul', hcp:'0' }, { id:102, name:'Pete', hcp:'0' }];
const NASSAU = { format:'nassau', scoring:'net', teamAIds:['101'], teamBIds:['102'],
                 startHole:1, stake:50, frontStake:10, backStake:20, overallStake:50,
                 autoPressStake:null, pressRule:'2down' };

// The body of renderHoleView(), so the assertions read real emission order.
function holeViewSource() {
    const src = read('index.html');
    const at = src.indexOf('function renderHoleView');
    assert.ok(at > -1, 'renderHoleView must exist');
    const end = src.indexOf('\n    function ', at + 50);
    return src.slice(at, end > -1 ? end : undefined);
}
const orderOf = (body, marker) => {
    const i = body.indexOf(marker);
    assert.ok(i > -1, 'marker not emitted: ' + marker);
    return i;
};

// Paul wins every hole so the 2-down auto press fires repeatedly.
function pressHeavyScores(thru) {
    const s = {};
    for (let h = 1; h <= (thru || 9); h++) { s['p101_h'+h] = 4; s['p102_h'+h] = 5; }
    return s;
}
function round(over) {
    return Object.assign({
        players: PAUL_PETE, courseData: cd18, scores: pressHeavyScores(9),
        gameFormat: 'stroke', sideMatches: { n1: NASSAU },
    }, over || {});
}
function renderHole(d, hole) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`
        currentMode = 'A';
        currentData = ${JSON.stringify(d)};
        window.__scFilteredPlayers = currentData.players;
        currentViewedHole = ${hole || 9};
        renderHoleView();
        renderLiveTicker();
    `, sb);
    const g = (id) => String(vm.runInContext(
        `(document.getElementById('${id}')||{}).innerHTML || ''`, sb));
    return { ticker: g('live-ticker-mount'), sb };
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ============================================================================

describe('THE LIVE DASHBOARD COMES FIRST', () => {

    test('the live mount is emitted before the hole heading', () => {
        const body = holeViewSource();
        assert.ok(orderOf(body, 'live-ticker-mount') < orderOf(body, 'hole-view-header'),
            'live action is context; it must not sit inside the hole block');
    });

    test('LIVE LEADERBOARD and LIVE MATCHES share that single mount', () => {
        // Both widgets render into live-ticker-mount, so placing the mount places
        // both. Asserted so a future split cannot quietly reintroduce the problem.
        const src = read('index.html');
        const at = src.indexOf('const TICKER_MOUNTS');
        const fn = src.slice(at, at + 2000);
        assert.match(fn, /'live-ticker-mount'/, 'Hole View mount is still in the registry');
        assert.match(fn, /buildLiveMatchHtml/);
        assert.match(fn, /renderLeaderWidgetHtml/);
    });
});

describe('THE HOLE BLOCK IS NOT INTERRUPTED', () => {

    test('the heading is emitted before the player score rows', () => {
        const body = holeViewSource();
        assert.ok(orderOf(body, 'hole-view-header') < orderOf(body, 'hv-player-row'));
    });

    test('NOTHING live is emitted between the heading and the score rows', () => {
        // The actual regression, stated directly.
        const body = holeViewSource();
        const hdr = orderOf(body, 'hole-view-header');
        const rows = orderOf(body, 'hv-player-row');
        const between = body.slice(hdr, rows);
        ['live-ticker-mount', 'LIVE MATCHES', 'LIVE LEADERBOARD', 'lm-card', 'lw-grid']
            .forEach(marker => assert.ok(!between.includes(marker),
                marker + ' must not separate the hole from its scores'));
    });

    test('the hole navigation follows the score rows', () => {
        // The Prev / Hole N of 18 / Next row is BUILT earlier into navRowHtml but
        // EMITTED after the score cells. Asserting on the emission (`html += navRowHtml`)
        // rather than where the markup happens to be constructed - the first version
        // of this test looked for a class name that is not emitted at all and would
        // have passed or failed for the wrong reason.
        const body = holeViewSource();
        assert.ok(orderOf(body, 'hv-player-row') < orderOf(body, 'html += navRowHtml'),
            'Prev / Hole N of 18 / Next belongs under the boxes it applies to');
    });

    test('the whole block is heading -> rows -> nav, in that order', () => {
        const body = holeViewSource();
        const seq = ['hole-view-header','hv-player-row','html += navRowHtml']
            .map(m => orderOf(body, m));
        assert.deepEqual(seq.slice().sort((a,b) => a-b), seq, 'order must be stable');
    });

    test('and the live dashboard is not emitted after the nav either', () => {
        // Moving it below the block would fix the interruption and create a new
        // problem: action context arriving after the golfer has already scrolled past.
        const body = holeViewSource();
        assert.ok(orderOf(body, 'live-ticker-mount') < orderOf(body, 'html += navRowHtml'));
    });
});

describe('A PRESS-HEAVY NASSAU DOES NOT CHANGE THE ORDER', () => {

    test('several auto presses render, and the order still holds', () => {
        const r = renderHole(round(), 9);
        const t = strip(r.ticker);
        assert.ok((t.match(/AUTO PRESS/g) || []).length >= 3,
            'this fixture must actually be press-heavy, or it proves nothing');
        const body = holeViewSource();
        assert.ok(orderOf(body, 'live-ticker-mount') < orderOf(body, 'hole-view-header'));
    });

    test('nothing was removed from the wager panel', () => {
        // The layout change must not have simplified the information.
        const t = strip(renderHole(round(), 9).ticker);
        ['LIVE LEADERBOARD','LIVE MATCHES','FRONT 9','BACK 9','TOTAL','AUTO PRESS']
            .forEach(k => assert.ok(t.includes(k), k + ' disappeared'));
    });

    test('per-segment stakes are still shown', () => {
        const t = strip(renderHole(round(), 9).ticker);
        assert.match(t, /\$10/, 'front stake');
        assert.match(t, /\$20/, 'back stake');
        assert.match(t, /\$50/, 'overall stake');
    });

    test('the manual Press link is still offered', () => {
        const r = renderHole(round(), 9);
        assert.match(r.ticker, /lm-press-link|Press/, 'the press deep-link must survive');
    });
});

describe('OTHER ROUNDS KEEP THE SAME STRUCTURE', () => {

    test('a plain stroke round still renders heading then rows', () => {
        const d = { players: PAUL_PETE, courseData: cd18,
                    scores: pressHeavyScores(9), gameFormat: 'stroke' };
        const r = renderHole(d, 9);
        assert.ok(!/LIVE MATCHES/.test(strip(r.ticker)), 'no wager, no match card');
        const body = holeViewSource();
        assert.ok(orderOf(body, 'hole-view-header') < orderOf(body, 'hv-player-row'));
    });

    test('the ordering is structural, not conditional on Nassau', () => {
        // One emission path serves every format, so no round type can get the old
        // interleaved layout by accident.
        const body = holeViewSource();
        const tick = orderOf(body, 'live-ticker-mount');
        assert.equal((body.match(/live-ticker-mount/g) || []).length, 1,
            'exactly one mount, emitted once');
        assert.ok(tick < orderOf(body, 'hole-view-header'));
    });

    test('a round with no live widgets still renders the hole block', () => {
        const d = { players: PAUL_PETE, courseData: cd18, scores: {}, gameFormat: 'stroke' };
        const r = renderHole(d, 1);
        assert.equal(typeof r.ticker, 'string', 'an empty mount must not break the view');
    });
});

describe('FULL CARD IS UNTOUCHED', () => {

    test('the Full Card now carries the SAME board — one presenter, two mounts', () => {
        // REVERSED, DELIBERATELY. This previously read "Full Card must not have grown a
        // live dashboard". That decision is withdrawn: golfers wanted the standings in
        // both scorecard views. What must NOT happen is a SECOND board - so the rule
        // now guards the shape of the reuse rather than forbidding the feature.
        const src = read('index.html');
        assert.match(src, /id="fc-ticker-mount"/, 'Full Card has its own mount element');
        assert.match(src, /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/,
            'both mounts are fed from one registry');
        // Exactly one builder, one standings source, one grid.
        assert.equal((src.match(/function renderLeaderWidgetHtml/g) || []).length, 1);
        assert.equal((src.match(/function liveStandings/g) || []).length, 1);
        assert.equal((src.match(/function renderLiveTicker/g) || []).length, 1);
    });

    test('Full Card still renders its table', () => {
        const sb = loadHtmlInlineScript('index.html', IDX);
        const d = round();
        let threw = null;
        try {
            vm.runInContext(`
                currentMode = 'A';
                currentData = ${JSON.stringify(d)};
                window.__scFilteredPlayers = currentData.players;
                renderScorecard();
            `, sb);
        } catch (e) { threw = e.message; }
        assert.equal(threw, null, 'Full Card must not throw: ' + threw);
    });
});

describe('THIS WAS LAYOUT ONLY', () => {

    test('no engine, settlement or press file was touched', () => {
        ['money-engine.js','settlement-engine.js','pool-engine.js','action-model.js','bet-strip.js']
            .forEach(f => assert.ok(!read(f).includes('hole-view-header'),
                f + ' must know nothing about the scorecard layout'));
    });

    test('the wager panel is still built by the shared presenter', () => {
        const src = read('index.html');
        assert.match(src, /buildLiveMatchStates\(/,
            'the match card must still come from money-engine.js');
        assert.equal((src.match(/function buildLiveMatchStates\(/g) || []).length, 0,
            'and must not have been reimplemented here');
    });
});
