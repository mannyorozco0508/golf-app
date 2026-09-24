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
// PART B. THE LANDING (re-pinned 2026-09-14, twice). Hole navigation has had
// three scroll rules: scrollToHoleCard() (the card's top - holes differ in
// height, so the buttons moved), withNavAnchor() (keep the Prev/Next row where
// the thumb was - the button stayed still and the SCORE BOXES landed anywhere),
// and now landOnHole(): after Next, Prev and the 1-18 jump the page scrolls so
// the HOLE HEADING sits HOLE_LANDING_OFFSET px from the top with the boxes under
// it - an explicit scrollTo, identical whatever the golfer count, the banners,
// or where the page was. NOTHING IS FOCUSED (v129: v128 anchored the first box
// and focused the first empty one; on the course the heading was above the
// fold and the keyboard covered the page on every Next). The first box is the
// anchor only when a hole has no heading.
//
// THE HARNESS HAS NO LAYOUT. mini-dom returns no real geometry and parses no
// innerHTML, so these tests install the smallest stub that lets the REAL helpers
// run: a card whose querySelectorAll hands back scripted score boxes (rect top,
// value, disabled), a recorded scrollTo and pageYOffset. This proves the
// arithmetic, the focus choice and the call order. Pixels on a phone are proven
// in hole_view_landing_test.js (Chrome), not here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const DEPS = ['handicap.js', 'score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
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
        // Wave B: read through scopedPlayers(), the helper over __scFilteredPlayers (card_scope_closed_test.js).
        assert.match(fn, /scopedPlayers\(\)/,
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
// The smallest stub that lets the real helpers execute: a scripted heading and
// scripted score boxes on the card, a recorded scrollTo, a chosen pageYOffset,
// a counted render, and an optionally focused box (to exercise
// commitPendingScore). Any focus() or select() on a stub box is LOGGED, so a
// focus creeping back into the landing shows up as a log entry.
function landingHarness(opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('index.html', DEPS);
    vm.runInContext(`
        currentMode = 'A';
        currentData = ${JSON.stringify(round())};
        currentViewedHole = ${o.hole === undefined ? 5 : o.hole};
        currentViewMode = 'hole';
        window.__scFilteredPlayers = currentData.players;
        window.__log = [];
        window.pageYOffset = ${o.pageYOffset === undefined ? 300 : o.pageYOffset};
        ${o.noScrollTo ? 'window.scrollTo = undefined;' : "window.scrollTo = function (x, y) { window.__log.push('scrollTo:' + y); };"}
        window.__heading = ${o.headingTop === null ? 'null' : `{ getBoundingClientRect: function () { return { top: ${o.headingTop === undefined ? 400 : o.headingTop} }; } }`};
        window.__boxes = (${JSON.stringify(o.boxes || [{ top: 500, value: '' }, { top: 560, value: '' }, { top: 620, value: '' }, { top: 680, value: '' }])}).map(function (b, i) {
            return { classList: { contains: function (c) { return c === 'score-input'; } },
                     getAttribute: function (k) { return k === 'data-player-id' ? String(101 + i) : String(currentViewedHole); },
                     getBoundingClientRect: function () { return { top: b.top }; },
                     value: b.value, disabled: !!b.disabled,
                     focus: function () { window.__log.push('FOCUS:' + (101 + i)); },
                     select: function () { window.__log.push('SELECT:' + (101 + i)); } };
        });
        var card = document.getElementById('hole-view-card');
        card.querySelectorAll = function (sel) { return sel === '.score-input' ? window.__boxes.slice() : []; };
        card.querySelector = function (sel) { if (sel === '.hole-view-header') return window.__heading; if (sel === '.score-input') return window.__boxes[0] || null; return null; };
        window.__renders = 0;
        renderHoleView = function () { window.__renders++; window.__log.push('render'); };
        ${o.focusedBox ? "Object.defineProperty(document, 'activeElement', { configurable: true, get: function () { return window.__pending; } }); window.__pending = { classList: { contains: function (c) { return c === 'score-input'; } }, getAttribute: function (k) { return k === 'data-player-id' ? '104' : '5'; }, blur: function () { window.__log.push('blur:104'); window.__pending = document.body; } };" : ''}
    `, sb);
    return sb;
}
const run = (sb, code) => vm.runInContext(code, sb);
// Arrays built inside the vm realm have that realm's Array prototype, so
// deepStrictEqual rejects them on identity even when the values match. Copied out.
const log = (sb) => Array.from(sb.window.__log);
const OFFSET = Number((IDX.match(/const HOLE_LANDING_OFFSET = (\d+);/) || [])[1]);

describe('PART B — THE LANDING: the heading at the offset, nothing focused', () => {
    test('the offset is a named constant', () => assert.ok(OFFSET > 0 && OFFSET < 60, 'HOLE_LANDING_OFFSET ' + OFFSET));

    test('Next: render, then ONE explicit scrollTo to (heading top + pageYOffset - offset), and NOTHING else', () => {
        const sb = landingHarness({ headingTop: 400, pageYOffset: 300 });
        run(sb, `goToAdjacentHole(1);`);
        assert.deepEqual(log(sb), ['render', 'scrollTo:' + (400 + 300 - OFFSET)]);
        assert.equal(sb.window.__renders, 1, 'exactly one render');
    });

    test('Prev: the same landing', () => {
        const sb = landingHarness({ headingTop: 400, pageYOffset: 300 });
        run(sb, `goToAdjacentHole(-1);`);
        assert.deepEqual(log(sb), ['render', 'scrollTo:' + (400 + 300 - OFFSET)]);
    });

    test('the anchor is the HEADING, not the first box: moving the boxes alone changes nothing', () => {
        const a = landingHarness({ headingTop: 400, boxes: [{ top: 500, value: '' }] }); run(a, `goToAdjacentHole(1);`);
        const b = landingHarness({ headingTop: 400, boxes: [{ top: 900, value: '' }] }); run(b, `goToAdjacentHole(1);`);
        assert.deepEqual(log(a), log(b));
    });

    test('the target is ABSOLUTE: the same heading on the page lands at the same scrollTo from any starting offset', () => {
        const a = landingHarness({ headingTop: 500, pageYOffset: 300 }); run(a, `goToAdjacentHole(1);`);
        const b = landingHarness({ headingTop: 100, pageYOffset: 700 }); run(b, `goToAdjacentHole(1);`);
        assert.equal(log(a)[1], log(b)[1]);
        assert.equal(log(a)[1], 'scrollTo:' + (800 - OFFSET));
    });

    test('NEGATIVE CONTROL — a heading lower on the page lands lower (no constant hiding)', () => {
        const a = landingHarness({ headingTop: 500, pageYOffset: 0 }); run(a, `goToAdjacentHole(1);`);
        const b = landingHarness({ headingTop: 900, pageYOffset: 0 }); run(b, `goToAdjacentHole(1);`);
        assert.notEqual(log(a)[1], log(b)[1]);
    });

    test('never scrolls to a negative position', () => {
        const sb = landingHarness({ headingTop: 5, pageYOffset: 0 });
        run(sb, `goToAdjacentHole(1);`);
        assert.equal(log(sb)[1], 'scrollTo:0');
    });

    test('NO FOCUS, whatever the boxes hold: empty, part-filled, complete, disabled', () => {
        [[{ top: 500, value: '' }], [{ top: 500, value: '4' }, { top: 560, value: '' }], [{ top: 500, value: '4' }, { top: 560, value: '5' }], [{ top: 500, value: '', disabled: true }]].forEach(boxes => {
            const sb = landingHarness({ boxes });
            run(sb, `goToAdjacentHole(1);`);
            assert.ok(!log(sb).some(x => /FOCUS|SELECT/.test(x)), JSON.stringify(boxes) + ' -> ' + log(sb).join(', '));
        });
    });

    test('FIX 1: a score still focused is committed (blur) BEFORE the render, inside the same handler - and not re-focused', () => {
        const sb = landingHarness({ focusedBox: true });
        run(sb, `goToAdjacentHole(1);`);
        assert.deepEqual(log(sb), ['blur:104', 'render', 'scrollTo:' + (400 + 300 - OFFSET)]);
    });

    test('the 1-18 jump lands exactly like Next, and closes the picker', () => {
        const a = landingHarness({}); run(a, `holePickerOpen = true; jumpToHole(9); window.__o = holePickerOpen; window.__h = currentViewedHole;`);
        const b = landingHarness({}); run(b, `goToAdjacentHole(1);`);
        assert.equal(a.window.__h, 9); assert.equal(a.window.__o, false);
        assert.deepEqual(log(a), log(b));
    });
});

describe('PART B — BOUNDARIES AND FAIL-OPEN', () => {
    test('hole 18 Next does nothing — no render, no scroll, no wrap', () => {
        const sb = landingHarness({ hole: 18 });
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 18, 'clamped, never wrapped to 1');
        assert.deepEqual(log(sb), []);
        assert.equal(sb.window.__renders, 0);
    });

    test('hole 1 Prev does nothing', () => {
        const sb = landingHarness({ hole: 1 });
        run(sb, `goToAdjacentHole(-1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 1);
        assert.deepEqual(log(sb), []);
    });

    test('no heading (a hole with no data): the first box is the anchor', () => {
        const sb = landingHarness({ headingTop: null, boxes: [{ top: 500, value: '' }], pageYOffset: 300 });
        run(sb, `goToAdjacentHole(1);`);
        assert.deepEqual(log(sb), ['render', 'scrollTo:' + (500 + 300 - OFFSET)]);
    });

    test('no heading and no boxes fails open — navigation still happens, nothing is scrolled', () => {
        const sb = landingHarness({ headingTop: null, boxes: [] });
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6, 'the hole still changed');
        assert.deepEqual(log(sb), ['render']);
    });

    test('a missing scroll API fails open', () => {
        const sb = landingHarness({ noScrollTo: true });
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6, 'landing is a comfort, never a precondition');
        assert.deepEqual(log(sb), ['render']);
    });
});

describe('PART B — ONLY NAVIGATION LANDS', () => {
    test('landOnHole is called from exactly two places: Prev/Next and the jump', () => {
        assert.equal((IDX.match(/\n\s+landOnHole\(\);/g) || []).length, 2);
        ['function goToAdjacentHole', 'function jumpToHole'].forEach(name => {
            const at = IDX.indexOf(name);
            assert.match(IDX.slice(at, at + 900), /renderHoleView\(\);\s*landOnHole\(\);/, name);
        });
    });

    test('renderHoleView never focuses and never lands, and neither does the landing itself', () => {
        const at = IDX.indexOf('function renderHoleView(');
        const fn = IDX.slice(at, IDX.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 5000, 'the renderer was found: ' + fn.length);
        assert.ok(!/landOnHole|\.focus\(|pendingScoreFocus/.test(fn));
        const l = IDX.slice(IDX.indexOf('function landOnHole'), IDX.indexOf('\n    function ', IDX.indexOf('function landOnHole') + 30)).replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/\.focus\(|\.select\(|pendingScoreFocus/.test(l), 'no focus in the landing (v129)');
        assert.match(l, /querySelector\('\.hole-view-header'\)/, 'the heading is the anchor');
    });

    test('score entry, dots, KP and presses do NOT land', () => {
        ['function saveScore', 'function toggleDot', 'function saveDots', 'function pressMatchBet']
            .forEach(name => {
                const at = IDX.indexOf(name);
                if (at === -1) return;
                assert.ok(!IDX.slice(at, at + 1500).includes('landOnHole'),
                    `${name} must not fight the golfer's scroll position`);
            });
    });

    test('switching between Hole View and Full Card does not land', () => {
        const at = IDX.indexOf('function setViewMode');
        assert.ok(at > -1);
        const fn = IDX.slice(at, IDX.indexOf('\n    function ', at + 30)).replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!fn.includes('landOnHole'), 'a view switch is not hole navigation');
    });

    test('expanding the leaderboard does not land', () => {
        ['function openLiveBoard', 'function closeLiveBoard'].forEach(name => {
            const at = IDX.indexOf(name);
            if (at === -1) return;
            assert.ok(!IDX.slice(at, at + 600).includes('landOnHole'));
        });
    });

    test('there is no persistent observer, scroll listener, frame or timer in the landing', () => {
        const at = IDX.indexOf('function landOnHole');
        const fn = IDX.slice(at, IDX.indexOf('\n    function ', at + 30));
        assert.ok(!/MutationObserver|addEventListener\('scroll'|requestAnimationFrame|setTimeout|scrollBy|smooth/.test(fn),
            'one explicit scroll per navigation - never a scroll trap, never a late nudge');
    });
});
