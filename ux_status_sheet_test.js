// ============================================================================
// DURING A ROUND THE SCREEN IS THE HOLE (UX wave, 2026-10-04)
//
// THE COMPLAINT IS A RATIO, NOT A BUG, so it was measured before anything moved.
// tools/first-screen-check.js arrives cold on a live round at 390x844 and reads
// what paints in the first viewport:
//
//   BEFORE   0 score boxes above the fold. 0% of the first screen was scores,
//            8.9% was the hole card, and 525 of the 844 pixels were the theme
//            row, the round header, two rows of nav pills, the Playing With card
//            and the group-scores card. The hole card began at y=610 and the
//            document was 2025px, so a golfer on the 7th tee scrolled to type.
//   AFTER    all 4 score boxes above the fold, the hole card 45.3% of the first
//            screen, and the document 844px - the whole round fits one screen
//            with nothing to scroll.
//
// The score INPUTS themselves are 2.8% of the viewport, and that number is
// reported rather than hidden: four boxes 56px square are a small part of any
// screen. What changed is that they are ON it.
//
// THE BLOCKS ARE MOVED, NOT REBUILT. Each keeps its id, its handlers and the
// renderer that writes to it. A copy would have been two elements with one id,
// and whichever came first would have won - so the test below asserts there is
// exactly ONE of each id in the page, not merely that the sheet has them.
//
// WHAT STAYS ON THE PAGE is the hole: heading, score boxes, Prev/Next, the hole
// picker, and the two overlays that interrupt a hole on purpose - the KP question
// and "your card is in". Neither is in the moved list and neither is touched.
//
// BASELINE, measured over the FINISHED file against main (cdf6f53) with this
// branch's index.html swapped out, all 10 tests: 1 PASS / 9 FAIL. 1 + 9 = 10.
// The one that passes is the last - it reads tools/first-screen-check.js, which
// is new in this wave and was not swapped, so it describes the measurement rather
// than the change. Every other assertion names a sheet, a handle or a mover that
// did not exist. index.html was restored by sha from a saved copy, not with git.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = read('index.html');
const run = (sb, e) => vm.runInContext(e, sb);

// The ids the sheet takes, read out of the page rather than typed here twice.
function movedIds() {
    const at = IDX.indexOf('var ROUND_SHEET_BLOCKS = [');
    assert.ok(at > 0, 'the list of what moves is gone');
    const block = IDX.slice(at, IDX.indexOf('];', at));
    return [...block.matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
}

describe('1. THE SHEET EXISTS, AND IT IS ONE SHEET', () => {

    test('a handle at the bottom, closed on arrival, and a body to fill', () => {
        assert.match(IDX, /<div id="round-sheet"/, 'there is no sheet');
        assert.match(IDX, /id="round-sheet-handle"[\s\S]{0,200}onclick="toggleRoundSheet\(\)"/,
            'the handle does not open anything');
        assert.match(IDX, /<div id="round-sheet-body">/);
        // CLOSED IS THE DEFAULT STATE: the class that opens it is added by a tap.
        assert.ok(!/<div id="round-sheet" class="open"|id="round-sheet"[^>]*class="[^"]*open/.test(IDX),
            'the sheet ships open');
        assert.match(IDX, /#round-sheet\.open \{ transform: translateY\(0\); \}/,
            'open is not a transform, so the sheet cannot slide');
    });

    test('and it names what it holds, in one list, read by the mover', () => {
        const ids = movedIds();
        ['header-controls-row', 'header-box', 'app-nav-wrap', 'round-landing-summary',
         'status-panel', 'group-filter-container', 'view-mode-toggle',
         'scorecard-footer', 'end-round-mount'].forEach(id => {
            assert.ok(ids.includes(id), id + ' is not in the moved list');
        });
        // THE HOLE DOES NOT MOVE. If any of these ever joins the list, the screen
        // a golfer scores from has gone into a drawer.
        ['hole-view-card', 'kp-entry-mount', 'full-card-container'].forEach(id => {
            assert.ok(!ids.includes(id), id + ' was moved into the sheet - that IS the hole');
        });
    });

    test('every moved block still exists exactly once in the page', () => {
        // A COPY WOULD BE TWO ELEMENTS WITH ONE ID and the renderers would write to
        // whichever came first - the defect this whole approach avoids by moving
        // nodes rather than rebuilding them.
        movedIds().concat(['live-ticker-mount', 'hole-recap-mount', 'live-skins-mount',
                           'action-center-mount', 'bet-strip-mount']).forEach(id => {
            const n = (IDX.match(new RegExp('id="' + id + '"', 'g')) || []).length;
            assert.equal(n, 1, id + ' appears ' + n + ' times in index.html');
        });
    });

    test('the five reading mounts are static children of the sheet, not of the hole card', () => {
        const body = IDX.slice(IDX.indexOf('<div id="round-sheet-body">'),
                               IDX.indexOf('</div>', IDX.indexOf('<div id="bet-strip-mount"></div>')));
        ['live-ticker-mount', 'hole-recap-mount', 'live-skins-mount',
         'action-center-mount', 'bet-strip-mount'].forEach(id => {
            assert.match(body, new RegExp('id="' + id + '"'), id + ' is not inside the sheet');
        });
        // AND THE HOLE CARD NO LONGER BUILDS THEM. Left in the html string they
        // would be rebuilt on every render and the sheet copies would go stale.
        assert.ok(!/html \+= '<div id="(live-ticker|hole-recap|live-skins|action-center|bet-strip)-mount"><\/div>';/.test(IDX),
            'the hole card still builds one of the reading mounts');
    });
});

describe('2. THE MOVER RUNS, AND IT RUNS BEFORE THE PAGE IS SEEN', () => {

    test('buildRoundSheet is called before main-content is revealed', () => {
        const at = IDX.indexOf('buildRoundSheet();');
        const reveal = IDX.indexOf('document.getElementById("main-content").style.display = "block";');
        assert.ok(at > 0, 'nothing calls the mover');
        assert.ok(reveal > 0, 'the reveal moved');
        assert.ok(at < reveal, 'the page is revealed before the sheet is built, so the old layout flashes');
    });

    test('THE LIST IS INSIDE THE FUNCTION, which is not a style choice', () => {
        // It was a top-level `var` first. A `var` hoists as undefined while the
        // function declaration hoists whole, so the arrival code - hundreds of
        // lines earlier - called buildRoundSheet() and died on undefined.forEach,
        // and the page never revealed itself at all. Measured in Chrome.
        const fn = IDX.slice(IDX.indexOf('function buildRoundSheet()'),
                             IDX.indexOf('function toggleRoundSheet('));
        assert.ok(fn.length > 300, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /var ROUND_SHEET_BLOCKS = \[/, 'the list is not inside the mover');
        assert.ok(!/^\s*var ROUND_SHEET_BLOCKS/m.test(IDX.slice(0, IDX.indexOf('function buildRoundSheet()'))),
            'the list is declared at the top level again, where it hoists as undefined');
    });

    test('it moves the nodes it finds and is quiet about the ones it does not', () => {
        const fn = IDX.slice(IDX.indexOf('function buildRoundSheet()'),
                             IDX.indexOf('function toggleRoundSheet('));
        assert.match(fn, /body\.appendChild\(el\)/, 'it does not move anything');
        assert.ok(!/innerHTML/.test(fn), 'it rebuilds markup instead of moving nodes');
        assert.match(fn, /if \(!el \|\| el\.parentNode === body\) return;/,
            'a missing block or a second call must be a no-op');
    });
});

describe('3. IN A REAL PAGE', () => {

    test('the mover puts every block it finds into the sheet, and the hole card stays out', async () => {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=UXSHEET', localStorage: true });
        // mini-dom does not mount static markup, so the elements this test is about
        // are mounted the way every other index.html test mounts what it reads.
        const ids = movedIds().concat(['round-sheet-body', 'hole-view-card']);
        run(sb, ids.map(id => "document.__mount(document.getElementById('" + id + "'));").join(''));
        const moved = run(sb, 'buildRoundSheet()');
        assert.ok(moved >= 5, 'the mover moved ' + moved + ' blocks');
        const inSheet = run(sb, "Array.prototype.slice.call(document.getElementById('round-sheet-body').children).map(function (c) { return c.id; }).join(',')");
        assert.match(String(inSheet), /header-box/, 'the header did not move: ' + inSheet);
        assert.match(String(inSheet), /app-nav-wrap/);
        assert.ok(!/hole-view-card/.test(String(inSheet)), 'the hole card went into the sheet');
        // A SECOND CALL MOVES NOTHING, so a re-render cannot duplicate anything.
        assert.equal(run(sb, 'buildRoundSheet()'), 0, 'calling it twice moved blocks again');
    });

    test('the handle opens and closes it, and says which way it goes', () => {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=UXSHEET', localStorage: true });
        run(sb, "document.__mount(document.getElementById('round-sheet'));"
              + "document.__mount(document.getElementById('round-sheet-handle'));"
              + "document.__mount(document.getElementById('round-sheet-caret'));");
        const cls = () => String(run(sb, "document.getElementById('round-sheet').className || ''"));
        const caret = () => String(run(sb, "document.getElementById('round-sheet-caret').textContent"));
        assert.ok(!/open/.test(cls()), 'it starts open');
        run(sb, 'toggleRoundSheet()');
        assert.match(cls(), /open/, 'the handle did not open it');
        assert.equal(caret(), '▼', 'the caret still points up while the sheet is open');
        run(sb, 'toggleRoundSheet()');
        assert.ok(!/open/.test(cls()), 'it did not close again');
        assert.equal(caret(), '▲');
        // AND A FORCED CLOSE IS WHAT THE SCRIM CALLS.
        run(sb, 'toggleRoundSheet(true)'); run(sb, 'toggleRoundSheet(false)');
        assert.ok(!/open/.test(cls()));
        assert.match(IDX, /id="round-sheet-scrim" onclick="toggleRoundSheet\(false\)"/);
    });

    test('the measurement tool exists and reads the rendered page, not the source', () => {
        const tool = read('tools/first-screen-check.js');
        assert.match(tool, /arriveCold/, 'it does not arrive cold');
        assert.match(tool, /getClientRects\(\)\.length/, 'it counts elements that do not paint');
        assert.ok(!/textContent/.test(tool), 'a cold check reads innerText, never textContent');
        assert.match(tool, /scoresPct/);
        assert.match(tool, /tap: '#round-sheet-handle'/, 'it never presses the handle, so it cannot prove it opens');
    });
});
