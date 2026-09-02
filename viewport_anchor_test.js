// ============================================================================
// FULL CARD LIVE LEADERBOARD + PREV/NEXT VIEWPORT ANCHOR
//
// PART A. The live leaderboard already existed in Hole View. It was not rebuilt for
// the Full Card; the same presenter now writes into a second mount. The rule this
// file protects is therefore not "the Full Card has a board" but "there is still
// exactly ONE board" - one builder, one standings source, two places it appears.
// Two implementations that disagree about who is leading would be worse than no
// second board at all.
//
// PART B. goToAdjacentHole() used to end in scrollToHoleCard(), anchoring the CARD.
// Holes are not the same height - a par 3 carries a KP banner, some holes have dots,
// matches, presses, longer names - so anchoring the card moved the BUTTONS, and a
// golfer tapping Next repeatedly had to chase the button up and down the screen.
//
// withNavAnchor() measures the nav row before the render, measures it again after
// layout, and scrolls by the difference. No fixed offsets, no assumptions about
// header or banner height, no timers. That is also why there are no KP-specific or
// leaderboard-specific cases below: content that changes height is precisely what
// the measurement already accounts for.
//
// THE HARNESS HAS NO LAYOUT. mini-dom returns no real geometry, so these tests
// install the smallest deterministic stub that lets the REAL production helper run:
// a scripted sequence of getBoundingClientRect().top values and a recorded scrollBy.
// This proves the arithmetic and the call sequence. It does NOT prove pixels on a
// phone, and nothing here should be read as claiming that.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const DEPS = ['handicap.js', 'score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
const CD = makeCourseData(18);

function round(names, hcps) {
    const P = makePlayers(names || ['Marty', 'Manny', 'John', 'Steve'], hcps || ['8', '4', '15', '0']);
    P.forEach(p => { p.playingForMoney = true; p.group = 1; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { gameFormat: 'stroke', players: P, courseData: CD, scores: S };
}

// ---------------------------------------------------------------------------
describe('PART A — ONE BOARD, TWO MOUNTS', () => {
    test('the Hole View mount still exists and is still first', () => {
        assert.match(IDX, /let html = '<div id="live-ticker-mount"><\/div>'/);
    });

    test('the Full Card now has its own mount element', () => {
        assert.match(IDX, /id="fc-ticker-mount"/);
        const at = IDX.indexOf('id="full-card-container"');
        const fc = IDX.slice(at, at + 800);
        assert.match(fc, /id="fc-ticker-mount"/, 'it belongs to the Full Card container');
    });

    test('the two mounts share one registry, and one presenter feeds both', () => {
        assert.match(IDX, /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/);
        assert.match(IDX, /TICKER_MOUNTS\.forEach\(id => \{[\s\S]{0,140}el\.innerHTML = html;/,
            'the same built markup is written to every mount');
    });

    test('NEGATIVE CONTROL — there is exactly one of each moving part', () => {
        assert.equal((IDX.match(/function renderLeaderWidgetHtml/g) || []).length, 1, 'one builder');
        assert.equal((IDX.match(/function liveStandings/g) || []).length, 1, 'one standings source');
        assert.equal((IDX.match(/function renderLiveTicker/g) || []).length, 1, 'one presenter');
    });

    test('standings still come from the canonical whole-app function', () => {
        const fn = IDX.slice(IDX.indexOf('function liveStandings'), IDX.indexOf('function liveStandings') + 1800);
        assert.match(fn, /computeNetToParStandings/, 'the canonical source, not a local sort');
    });

    test('no Full Card-specific ranking was introduced', () => {
        const at = IDX.indexOf('function renderScorecard');
        const fn = IDX.slice(at, at + 6000);
        assert.ok(!/computeNetToParStandings|\.sort\(\(a, b\) => a\.toPar/.test(fn),
            'the Full Card must not compute standings of its own');
    });

    test('group scoping is unchanged — the scorecard board stays group-scoped', () => {
        const fn = IDX.slice(IDX.indexOf('function liveStandings'), IDX.indexOf('function liveStandings') + 1800);
        assert.match(fn, /window\.__scFilteredPlayers/,
            'a Group 1 link must not show Group 2 golfers in either scorecard view');
    });

    test('the dedicated Leaderboard page remains whole-field', () => {
        const lb = fs.readFileSync(path.join(REPO_ROOT, 'leaderboard.html'), 'utf8');
        assert.ok(!/__scFilteredPlayers/.test(lb),
            'the standalone Leaderboard is the whole-field view and must stay that way');
    });

    test('both mounts receive identical markup for one round state', () => {
        const sb = loadHtmlInlineScript('index.html', DEPS);
        vm.runInContext(`
            currentMode = 'A';
            currentData = ${JSON.stringify(round())};
            currentViewedHole = 1;
            window.__scFilteredPlayers = currentData.players;
            document.__mount(document.getElementById('live-ticker-mount'));
            document.__mount(document.getElementById('fc-ticker-mount'));
            renderLiveTicker();
            window.__hv = document.getElementById('live-ticker-mount').innerHTML;
            window.__fc = document.getElementById('fc-ticker-mount').innerHTML;
        `, sb);
        assert.equal(sb.window.__fc, sb.window.__hv,
            'Hole View and Full Card must show byte-identical standings');
    });

    test('ties and net semantics are the presenter\'s, not the mount\'s', () => {
        const fn = IDX.slice(IDX.indexOf('function renderLeaderWidgetHtml'),
            IDX.indexOf('function renderLeaderWidgetHtml') + 2000);
        assert.match(fn, /liveStandings\(\)/, 'rows come from the shared standings');
        // Whatever the tie label is, it is produced once, here - not per mount.
        assert.equal((IDX.match(/function renderLeaderWidgetHtml/g) || []).length, 1);
    });

    test('the Full Card mount cannot widen the score rows', () => {
        // It sits above the table, outside it - not inside a row or a cell.
        const at = IDX.indexOf('id="full-card-container"');
        const before = IDX.slice(at, IDX.indexOf('<table class="card-table">', at));
        assert.match(before, /id="fc-ticker-mount"/,
            'the mount must be a sibling above the table, never inside a score row');
    });
});

// ---------------------------------------------------------------------------
// The smallest stub that lets the real helper execute: scripted rect tops, a
// recorded scrollBy, and a synchronous animation frame.
function anchorHarness(tops) {
    const sb = loadHtmlInlineScript('index.html', DEPS);
    vm.runInContext(`
        currentMode = 'A';
        currentData = ${JSON.stringify(round())};
        currentViewedHole = 5;
        window.__scFilteredPlayers = currentData.players;
        window.__tops = ${JSON.stringify(tops)};
        window.__scrollBys = [];
        window.__rafCalls = 0;
        window.scrollBy = function (x, y) { window.__scrollBys.push(y); };
        window.requestAnimationFrame = function (fn) { window.__rafCalls++; fn(); };
        document.querySelector = function () {
            if (!window.__tops.length) return null;
            const top = window.__tops.shift();
            return { getBoundingClientRect: function () { return { top: top }; } };
        };
        window.__renders = 0;
        renderHoleView = function () { window.__renders++; };
    `, sb);
    return sb;
}
const run = (sb, code) => vm.runInContext(code, sb);
// Arrays built inside the vm realm have that realm's Array prototype, so
// deepStrictEqual rejects them on identity even when the values match. Copied out.
const bys = (sb) => Array.from(sb.window.__scrollBys);

describe('PART B — THE NAV ROW STAYS WHERE THE THUMB LEFT IT', () => {
    test('Next: the row drifting DOWN is compensated downward by the delta', () => {
        // Before 500, after 620 -> the row fell 120px, so scroll down 120 to restore it.
        const sb = anchorHarness([500, 620]);
        run(sb, `goToAdjacentHole(1);`);
        assert.deepEqual(bys(sb), [120]);
        assert.equal(sb.window.__renders, 1, 'exactly one render');
    });

    test('Prev: the row drifting UP is compensated upward', () => {
        const sb = anchorHarness([500, 380]);
        run(sb, `goToAdjacentHole(-1);`);
        assert.deepEqual(bys(sb), [-120]);
    });

    test('NEGATIVE CONTROL — the delta is measured, never a fixed target', () => {
        // Different geometry must produce a different correction, or a constant is hiding.
        const a = anchorHarness([500, 620]); run(a, `goToAdjacentHole(1);`);
        const b = anchorHarness([500, 545]); run(b, `goToAdjacentHole(1);`);
        assert.notDeepEqual(bys(a), bys(b));
        assert.deepEqual(bys(b), [45]);
    });

    test('no movement means no scroll at all', () => {
        const sb = anchorHarness([500, 500]);
        run(sb, `goToAdjacentHole(1);`);
        assert.deepEqual(bys(sb), [], 'a zero delta must not jiggle the page');
    });

    test('one navigation causes exactly one compensation', () => {
        const sb = anchorHarness([500, 620, 620, 700, 700, 640]);
        run(sb, `goToAdjacentHole(1); goToAdjacentHole(1); goToAdjacentHole(-1);`);
        assert.equal(bys(sb).length, 3);
        assert.equal(sb.window.__rafCalls, 3, 'one frame per navigation, no stacked timers');
    });

    test('the measurement happens after layout, not after a guessed delay', () => {
        const fn = IDX.slice(IDX.indexOf('function withNavAnchor'),
            IDX.indexOf('function withNavAnchor') + 2600);
        assert.match(fn, /requestAnimationFrame/, 'a frame, tied to layout');
        assert.ok(!/setTimeout/.test(fn), 'no arbitrary timeout may stand in for layout');
    });

    test('no fixed pixel target anywhere in the helper', () => {
        const fn = IDX.slice(IDX.indexOf('function withNavAnchor'),
            IDX.indexOf('function withNavAnchor') + 2600);
        assert.ok(!/scrollTo\(/.test(fn), 'absolute positioning is what this replaced');
        assert.match(fn, /getBoundingClientRect\(\)\.top - before/, 'the correction is a measured delta');
    });

    test('variable content height needs no special cases', () => {
        const fn = IDX.slice(IDX.indexOf('function withNavAnchor'),
            IDX.indexOf('function withNavAnchor') + 2600);
        assert.ok(!/kp-live|cell-dots|lw-grid|hole-view-header/.test(fn),
            'a height-aware helper must not name the things that change height');
        // A par-3-with-KP to par-4 transition is just a large delta.
        const big = anchorHarness([300, 780]);
        run(big, `goToAdjacentHole(1);`);
        assert.deepEqual(bys(big), [480]);
    });
});

describe('PART B — BOUNDARIES AND FAIL-OPEN', () => {
    test('hole 18 Next does nothing — no render, no scroll, no wrap', () => {
        const sb = anchorHarness([500, 620]);
        run(sb, `currentViewedHole = 18; goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 18, 'clamped, never wrapped to 1');
        assert.deepEqual(bys(sb), []);
        assert.equal(sb.window.__renders, 0);
    });

    test('hole 1 Prev does nothing', () => {
        const sb = anchorHarness([500, 620]);
        run(sb, `currentViewedHole = 1; goToAdjacentHole(-1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 1);
        assert.deepEqual(bys(sb), []);
    });

    test('a missing nav row fails open — navigation still happens', () => {
        const sb = anchorHarness([]);   // querySelector returns null both times
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6, 'the hole still changed');
        assert.equal(sb.window.__renders, 1);
        assert.deepEqual(bys(sb), []);
    });

    test('a nav row that vanishes DURING the render fails open', () => {
        // The row is measurable before the render and gone afterwards - the render
        // replaced the DOM. The early return cannot help here, so this is the case
        // that actually exercises the post-render guard.
        const sb = anchorHarness([500]);   // present first, null second
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6, 'the hole still changed');
        assert.equal(sb.window.__renders, 1);
        assert.deepEqual(bys(sb), [], 'nothing to measure against, so nothing is scrolled');
    });

    test('a missing scroll API fails open', () => {
        const sb = anchorHarness([500, 620]);
        run(sb, `window.scrollBy = undefined; goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6, 'anchoring is a comfort, never a precondition');
        assert.equal(sb.window.__renders, 1);
    });

    test('no requestAnimationFrame still measures, synchronously', () => {
        const sb = anchorHarness([500, 620]);
        run(sb, `window.requestAnimationFrame = undefined; goToAdjacentHole(1);`);
        assert.deepEqual(bys(sb), [120]);
    });
});

describe('PART B — ONLY NAVIGATION ANCHORS', () => {
    const anchored = IDX.match(/withNavAnchor\(/g) || [];

    test('the helper is called from exactly one place: hole navigation', () => {
        assert.equal(anchored.length, 2, 'one definition, one call site');
        const fn = IDX.slice(IDX.indexOf('function goToAdjacentHole'),
            IDX.indexOf('function goToAdjacentHole') + 700);
        assert.match(fn, /withNavAnchor\(renderHoleView\)/);
    });

    test('score entry, dots, KP and presses do NOT anchor', () => {
        ['function saveScore', 'function toggleDot', 'function saveDots', 'function pressMatchBet']
            .forEach(name => {
                const at = IDX.indexOf(name);
                if (at === -1) return;
                assert.ok(!IDX.slice(at, at + 1500).includes('withNavAnchor'),
                    `${name} must not fight the golfer's scroll position`);
            });
    });

    test('switching between Hole View and Full Card does not anchor', () => {
        const at = IDX.indexOf('function setViewMode');
        assert.ok(at > -1);
        assert.ok(!IDX.slice(at, at + 800).includes('withNavAnchor'),
            'a view switch is not hole navigation');
    });

    test('expanding the leaderboard does not anchor', () => {
        ['function openLiveBoard', 'function closeLiveBoard'].forEach(name => {
            const at = IDX.indexOf(name);
            if (at === -1) return;
            assert.ok(!IDX.slice(at, at + 600).includes('withNavAnchor'));
        });
    });

    test('there is no persistent observer or scroll listener', () => {
        const fn = IDX.slice(IDX.indexOf('function withNavAnchor'),
            IDX.indexOf('function withNavAnchor') + 2600);
        assert.ok(!/MutationObserver|addEventListener\('scroll'/.test(fn),
            'one compensation per navigation - never a scroll trap');
    });
});
