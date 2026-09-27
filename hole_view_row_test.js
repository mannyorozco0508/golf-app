// ============================================================================
// THE HOLE VIEW ROW IS A LIST ROW, NOT A BAND (Wave 17)
//
// THE PROBLEM, MEASURED on Manny's phone and then in cold Chrome at 390x844:
// each golfer's row was 100px tall, of which the score box is 48. The other 52
// came from two things that did not need to be there -
//
//   the FULL CARD's column initials, cloned into Hole View with the rest of the
//   score cell: a 21.7x17 div reading "AA" sitting 19px above the box, on a row
//   that already carries the golfer's NAME on the left. The same fact twice, and
//   17px of every row to say it.
//
//   10px of row padding top and bottom, on a row whose tallest element is a 48px
//   box.
//
// The name block is 32px (name 15.2px, HCP 10.88px under it) and sits centred, so
// a 100px row left 34px of empty above it and 34px below - the "large empty band".
//
// AFTER: 73px. The initials do not travel, and the padding is 6px.
//     4 golfers  400px of rows -> 292px   (108px back)
//     5 golfers  500px         -> 365px   (135px back)
//     6 golfers  600px         -> 438px   (162px back)
//
// WHAT DID NOT CHANGE, deliberately:
//   THE BOX IS 48x48 and right-aligned. It is the control a thumb hits all round,
//   and the boxes forming ONE straight column down the card is what lets a thumb
//   run the list without re-aiming. Closing the 294px gap between the name and the
//   box would unalign them; the gap stops reading as a void once the row is 73px
//   rather than 100px, which is the actual fix.
//   THE HANDICAP STAYS A BLOCK under the name. Measured: putting it inline takes
//   the name block 32px -> 18px and the ROW DOES NOT MOVE, because the row is set
//   by the cell (60px), not by the name. dot_context_test.js deliberately pins it
//   as a block with its own size and weight, and spending that guard on a change
//   worth 0px is a bad trade.
//   THE STROKE DOTS STAY UNDER THE BOX. That is the floor on this row - the cell
//   cannot go below 48 + 12 - and index.html's own comment plus eight assertions
//   across five suites fix them there so Hole View, the Full Card and the printed
//   PDF all draw a dot the same way.
//
// WHY CHROME. Every number here is layout, and mini-dom has none: it returns a
// hard-coded zero rect, and the per-golfer rows are built from Array.from(
// row.children) on the Full Card's table, which under mini-dom is an empty list
// because innerHTML parses no children there. This suite arrives cold through
// tools/lib/cold-arrival.js and touches nothing.
//
// ---------------------------------------------------------------------------
// WAVE 19: THIS SUITE'S OWN FIXTURE WAS THE REASON A REAL DEFECT PASSED IT.
//
// It scored holes 1-5 and therefore landed on hole 6, WHICH HAS NO SCORES. With no
// scores there is no net mark, no to-par line and no shape box, so every cell came
// out 60px and every row 73px - and the suite pinned 73px as though it were
// universal when it is only true of an UNSCORED hole. A GUARD WHOSE FIXTURE CANNOT
// PRODUCE THE VARIATION CANNOT SEE IT.
//
// What it could not see: on a SCORED hole the cell's children are OPTIONAL and
// differ per golfer - the circled net mark is ~17px that only a golfer who strokes
// on that hole and has a score gets - so cells come out 75px or 93px, and with the
// row at align-items: center the NAME centred against a taller cell and dropped 9px
// relative to its own box. Measured on Manny's phone at 390px and then here:
//     Manny  cell 75  row  88  name +27.5  box +6
//     Kopp   cell 93  row 106  name +36.5  box +6     <- his net mark, 18px
// The boxes were never wrong: +6 in every row, left 318 in every row, which is what
// this suite already asserted and why it stayed green. What moved was the name.
// And it PRE-DATED Wave 17 by the identical 18px (v243: cells 94/112, name +41 vs
// +50) - Wave 17 removed 19px of constant height per row, so the same anomaly went
// from 15.7% of a 115px row to 20.5% of an 88px row. More visible, not created.
//
// THE FIX: align-items: flex-start on the row, so the name pins to the top exactly
// as the box does and the pair is level whatever the cell carries below it. The row
// heights stay UNEQUAL on purpose - reserving the net mark's 17px on every row would
// give back most of Wave 17's 108px, and the alignment was the complaint.
//
// SO THERE ARE TWO CASES HERE NOW, and both are stated rather than one number
// pretending to be universal: the UNSCORED hole (73px rows, uniform cells) and the
// SCORED MIXED hole (unequal rows, and a name-to-box offset that must be identical
// in every row). The second one carries a positive assertion that the cells really
// do differ - without it, a page that made every cell uniform again would satisfy
// the offset test vacuously.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot'];

// A long name on the FIRST row of the six-golfer case, because a name that wraps is
// the one thing that could put the row back over 73px without anybody noticing.
function round(n, longFirst) {
    const names = NAMES.slice(0, n);
    if (longFirst) names[0] = 'Christopher Fitzgerald';
    const P = makePlayers(names, names.map((_, i) => i * 4), 101);
    const scores = {};
    P.forEach(p => { for (let h = 1; h <= 5; h++) scores['p' + p.id + '_h' + h] = 4; });
    const d = { eventName: 'Row', courseName: 'Test', players: P, gameFormat: 'stroke', courseData: CD,
        scores, settlementMode: 'whole-dollar', skinsBuyIn: 5, skinsCarryOver: false };
    if (n > 4) d.groupSizeOverrides = { 0: n };
    return d;
}

const PROBE = `(function () {
  var rows = [].slice.call(document.querySelectorAll('.hv-player-row'));
  var card = document.getElementById('hole-view-card');
  if (!rows.length) return JSON.stringify({ error: 'no hole view rows rendered' });
  var items = rows.map(function (row) {
    var r = row.getBoundingClientRect();
    var box = row.querySelector('.score-input');
    var name = row.querySelector('.hv-player-name');
    var hcp = row.querySelector('.hv-hcp');
    var cell = row.querySelector('.hv-player-cell');
    var br = box ? box.getBoundingClientRect() : null;
    return {
      h: Math.round(r.height * 10) / 10,
      pad: getComputedStyle(row).padding,
      boxW: br ? Math.round(br.width) : null, boxH: br ? Math.round(br.height) : null,
      boxX: br ? Math.round(br.left * 10) / 10 : null, boxRight: br ? Math.round(br.right * 10) / 10 : null,
      nameH: name ? Math.round(name.getBoundingClientRect().height) : null,
      nameX: name ? Math.round(name.getBoundingClientRect().left * 10) / 10 : null,
      nameText: name ? (name.innerText || '').replace(/\\s+/g, ' ').trim() : null,
      nameClipped: name ? (name.scrollWidth > name.clientWidth + 1) : null,
      hcpDisplay: hcp ? getComputedStyle(hcp).display : null,
      cellH: cell ? Math.round(cell.getBoundingClientRect().height) : null,
      // every element the cell actually renders, so a label creeping back in is caught
      cellTexts: cell ? [].slice.call(cell.querySelectorAll('*'))
        .filter(function (e) { return e.getBoundingClientRect().height > 0; })
        .map(function (e) { return ((e.innerText || '').replace(/\\s+/g, ' ').trim()) || '.' + (e.className || e.tagName); }) : []
    };
  });
  return JSON.stringify({
    rows: items, rowCount: items.length,
    totalRowHeight: Math.round(items.reduce(function (s, i) { return s + i.h; }, 0)),
    cardH: Math.round(card.getBoundingClientRect().height),
    docH: document.documentElement.scrollHeight,
    navBtnH: (function () { var b = document.querySelector('.hole-view-nav-btn');
      return b ? Math.round(b.getBoundingClientRect().height) : null; })(),
    vw: window.innerWidth
  });
})()`;

// row height x golfers -> the whole card's rows. Pinned as numbers: this wave is a
// height claim, and a height claim that is not a number is a decoration.
const EXPECT = { 4: { rows: 4, total: 292 }, 5: { rows: 5, total: 365 }, 6: { rows: 6, total: 438 } };
const ROW_H = 73;

const S = {};
before(async () => {
    for (const n of [4, 5, 6]) {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=ROW17'), settleMs: 3200,
            db: { events: { ROW17: round(n, false) }, global_courses: {}, trips: {}, tournaments: {} },
            viewport: { width: 390, height: 844 }, steps: [{ expression: PROBE }] });
        S[n] = r.ok ? JSON.parse(r.value[0]) : { error: r.reason };
    }
    const r = await arriveCold({ url: fileUrl('index.html', 'game=ROW17'), settleMs: 3200,
        db: { events: { ROW17: round(6, true) }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, steps: [{ expression: PROBE }] });
    S.long = r.ok ? JSON.parse(r.value[0]) : { error: r.reason };
});

[4, 5, 6].forEach(n => {
    describe('THE ROW at 390 — ' + n + ' golfers', () => {
        test('ran', () => assert.ok(S[n] && !S[n].error, S[n] && S[n].error));
        test('every row is ' + ROW_H + 'px, and the rows total ' + EXPECT[n].total + 'px', () => {
            const v = S[n];
            assert.equal(v.rowCount, EXPECT[n].rows);
            v.rows.forEach((x, i) => assert.equal(x.h, ROW_H, 'row ' + (i + 1) + ' is ' + x.h + 'px'));
            assert.equal(v.totalRowHeight, EXPECT[n].total);
            assert.match(v.rows[0].pad, /6px 0px/, 'the row padding is not 6px: ' + v.rows[0].pad);
        });
        test('THE BOX IS STILL 48x48 — the control a thumb hits all round', () => {
            S[n].rows.forEach(x => {
                assert.equal(x.boxW, 48, 'the box narrowed to ' + x.boxW);
                assert.equal(x.boxH, 48, 'the box shrank to ' + x.boxH);
                assert.ok(x.boxH >= 44, 'and it must clear 44px');
            });
        });
        test('the boxes form ONE column: same left edge, same right edge, every row', () => {
            const xs = [...new Set(S[n].rows.map(x => x.boxX))];
            const rs = [...new Set(S[n].rows.map(x => x.boxRight))];
            assert.equal(xs.length, 1, 'the boxes do not share a left edge: ' + JSON.stringify(xs));
            assert.equal(rs.length, 1, 'or a right edge: ' + JSON.stringify(rs));
            // right-aligned, i.e. nearer the card's right edge than the name is to the left
            assert.ok(xs[0] > S[n].rows[0].nameX + 100, 'the box is no longer right-aligned');
        });
        test('THE FULL CARD\'S COLUMN INITIALS DO NOT TRAVEL into the row', () => {
            // The row carries the name on the left; the initials above the box were the
            // same fact twice and 17px of every row. Asserted on the RENDERED cell, so a
            // label re-added by any route is caught, not just the one this wave removed.
            const v = S[n];
            v.rows.forEach((x, i) => {
                const initials = x.nameText ? x.nameText.slice(0, 2).toUpperCase() : null;
                const dup = x.cellTexts.filter(t => initials && t.toUpperCase() === initials + initials.charAt(0));
                assert.deepEqual(dup, [], 'row ' + (i + 1) + ' cell renders ' + JSON.stringify(x.cellTexts));
                assert.ok(x.cellH <= 61, 'the cell is ' + x.cellH + 'px - something is stacked above the box again');
            });
        });
        test('no name is clipped, and the handicap is still its own block under it', () => {
            S[n].rows.forEach(x => {
                assert.equal(x.nameClipped, false, 'clipped: ' + x.nameText);
                assert.equal(x.hcpDisplay, 'block', 'the handicap stopped being a block');
            });
        });
        test('Prev/Next is untouched at 44px or more', () => {
            assert.ok(S[n].navBtnH >= 44, 'the nav button is ' + S[n].navBtnH + 'px');
        });
    });
});

describe('A NAME THAT WRAPS DOES NOT PUT THE ROW BACK', () => {
    test('ran', () => assert.ok(S.long && !S.long.error, S.long && S.long.error));
    test('six golfers, one 22-character name: every row still ' + ROW_H + 'px and nothing clipped', () => {
        assert.equal(S.long.rowCount, 6);
        S.long.rows.forEach((x, i) => {
            assert.equal(x.h, ROW_H, 'row ' + (i + 1) + ' is ' + x.h + 'px with "' + x.nameText + '"');
            assert.equal(x.nameClipped, false);
            assert.equal(x.boxH, 48);
        });
    });
});

// ---------------------------------------------------------------------------
// THE SCORED, MIXED HOLE. This is the case the old fixture could not reach.
//
// Four golfers, handicaps 0 / 9 / 18 / 4, holes 1-6 scored and hole 6 deliberately
// mixed - 3, 4, 5, 6 on a par 4 - then Prev to hole 6 so the hole IN VIEW is scored:
//     Manny (hcp 0)   to-par only               NEITHER a net mark nor a shape box
//     Kopp  (hcp 9)   net-mark-line + NET MARK  the 17px nobody reserves room for
//     Dalen (hcp 18)  a shape box
//     Vic   (hcp 4)   two shape boxes
const MIXED_H = 6;
function mixedRound() {
    const names = ['Manny Orozco', 'Kopp Kelly', 'Dalen Drake', 'Vic Vance'];
    const P = makePlayers(names, [0, 9, 18, 4], 101);
    const scores = {};
    P.forEach((p, i) => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = 4 + (i % 3); });
    scores['p101_h6'] = 3; scores['p102_h6'] = 4; scores['p103_h6'] = 5; scores['p104_h6'] = 6;
    return { eventName: 'Mixed', courseName: 'Test', players: P, gameFormat: 'stroke', courseData: CD,
        scores, settlementMode: 'whole-dollar', skinsBuyIn: 5, skinsCarryOver: false };
}

const MIXED_PROBE = `(function () {
  var rows = [].slice.call(document.querySelectorAll('.hv-player-row'));
  var hdr = document.querySelector('.hole-view-header');
  if (!rows.length) return JSON.stringify({ error: 'no rows' });
  function R(e) { var r = e.getBoundingClientRect();
    return { top: Math.round(r.top * 10) / 10, left: Math.round(r.left * 10) / 10,
             h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10 }; }
  return JSON.stringify({
    hole: hdr ? (hdr.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    rowAlign: getComputedStyle(rows[0]).alignItems,
    rows: rows.map(function (row) {
      var name = row.querySelector('.hv-player-name');
      var cell = row.querySelector('.hv-player-cell');
      var box = row.querySelector('.score-input');
      var rt = R(row).top;
      return {
        who: name ? (name.innerText || '').split('\\n')[0].trim() : null,
        rowH: R(row).h, cellH: cell ? R(cell).h : null,
        nameTop: name ? Math.round((R(name).top - rt) * 10) / 10 : null,
        boxTop: box ? Math.round((R(box).top - rt) * 10) / 10 : null,
        boxLeft: box ? R(box).left : null, boxW: box ? R(box).w : null, boxH: box ? R(box).h : null,
        hasNetMark: !!row.querySelector('.net-mark'),
        shapeBoxes: row.querySelectorAll('[class*="shape-box"]').length,
        dotsTop: (function () { var d = row.querySelector('.stroke-dots');
          return d ? Math.round((R(d).top - rt) * 10) / 10 : null; })()
      };
    })
  });
})()`;

const M = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=MIX19'), settleMs: 3200,
        db: { events: { MIX19: mixedRound() }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 },
        // Prev, so the hole IN VIEW is hole 6 - the scored one. The landing hole is 7.
        steps: [{ tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 500 }, { expression: MIXED_PROBE }] });
    M.v = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
});

describe('A SCORED, MIXED HOLE — the case the old fixture could not reach', () => {
    test('ran, on the scored hole', () => {
        assert.ok(M.v && !M.v.error, M.v && M.v.error);
        assert.match(M.v.hole, new RegExp('Hole ' + MIXED_H + '\\b'), 'not on the scored hole: ' + M.v.hole);
    });

    test('THE FIXTURE REALLY IS MIXED — without this the offset test below is vacuous', () => {
        // The positive assertion. A page that made every cell uniform again would
        // satisfy "every offset is equal" trivially, and this suite would be green on a
        // page that had quietly undone the thing it exists to measure.
        const v = M.v;
        const withMark = v.rows.filter(r => r.hasNetMark).map(r => r.who);
        const withShape = v.rows.filter(r => r.shapeBoxes > 0).map(r => r.who);
        const withNeither = v.rows.filter(r => !r.hasNetMark && r.shapeBoxes === 0).map(r => r.who);
        assert.equal(withMark.length, 1, 'expected exactly one net mark, got ' + JSON.stringify(withMark));
        assert.ok(withShape.length >= 1, 'no golfer has a shape box: ' + JSON.stringify(v.rows));
        assert.ok(withNeither.length >= 1, 'no golfer has neither: ' + JSON.stringify(v.rows));
        // and the cells therefore differ, which is the whole point of this fixture
        const cells = [...new Set(v.rows.map(r => r.cellH))];
        assert.ok(cells.length >= 2, 'every cell is the same height, so nothing is being tested: ' + JSON.stringify(cells));
    });

    test('EVERY ROW HAS THE SAME NAME-TO-BOX OFFSET — the actual defect', () => {
        // This is what was wrong and what no assertion covered: the box was always at
        // +6, the NAME floated to the centre of a row whose height depended on whether
        // that golfer happened to have a net mark. Asserted as the RELATIONSHIP, per
        // row, not as two independent numbers.
        const v = M.v;
        const offsets = v.rows.map(r => Math.round((r.nameTop - r.boxTop) * 10) / 10);
        const distinct = [...new Set(offsets)];
        assert.equal(distinct.length, 1,
            'the name sits at a different height relative to its own box in different rows: '
            + JSON.stringify(v.rows.map(r => r.who + ' ' + (r.nameTop - r.boxTop))));
        assert.equal(distinct[0], 0,
            'the name and its box are not top-aligned: offset ' + distinct[0]);
        assert.equal(v.rowAlign, 'flex-start',
            'the row is ' + v.rowAlign + ' - which is what let the name drift');
    });

    test('the boxes still share one column, and are still 48x48', () => {
        const v = M.v;
        assert.equal([...new Set(v.rows.map(r => r.boxLeft))].length, 1,
            'the boxes lost their column: ' + JSON.stringify(v.rows.map(r => r.boxLeft)));
        assert.equal([...new Set(v.rows.map(r => r.boxTop))].length, 1,
            'the boxes sit at different heights in their rows: ' + JSON.stringify(v.rows.map(r => r.boxTop)));
        v.rows.forEach(r => { assert.equal(r.boxW, 48); assert.equal(r.boxH, 48); });
    });

    test('the rows are ALLOWED to differ in height, and do — that is the deliberate trade', () => {
        // Equalising them means reserving the net mark's ~17px on every row, which gives
        // back most of the 108px Wave 17 saved. Manny's call: leave them unequal and fix
        // the alignment. Recorded as an assertion so nobody "fixes" it by padding rows.
        const v = M.v;
        const heights = [...new Set(v.rows.map(r => r.rowH))];
        assert.ok(heights.length >= 2,
            'every row is the same height now - if that was deliberate it gave back Wave 17\'s saving: '
            + JSON.stringify(heights));
        const tall = v.rows.find(r => r.hasNetMark);
        const short = v.rows.find(r => !r.hasNetMark && r.shapeBoxes === 0);
        assert.ok(tall.rowH > short.rowH, 'the net-mark row is not the taller one');
    });

    test('the stroke dots follow their own box, not the row — so no dot floats between rows', () => {
        // The reported "small dot in the gap between two rows" was this: stroke-dots sits
        // at the BOTTOM of the cell, so on the 18px-taller row it rendered 33px lower than
        // its neighbours and read as belonging to neither. It is measured against its OWN
        // row's box, which is the only frame in which it means anything.
        const v = M.v;
        v.rows.forEach(r => {
            assert.ok(r.dotsTop === null || r.dotsTop > r.boxTop,
                r.who + ': the dots are not below their own box (' + r.dotsTop + ' vs ' + r.boxTop + ')');
            assert.ok(r.dotsTop === null || r.dotsTop < r.rowH,
                r.who + ': the dots fall outside their own row (' + r.dotsTop + ' of ' + r.rowH + ')');
        });
    });
});

describe('THE SOURCE SAYS WHY, AND DOES IT IN THE BUILDER', () => {
    const SRC = read('index.html');
    test('the initials are stripped in the row builder, not hidden with CSS', () => {
        // display:none would leave the element in the row, in the print stylesheet and in
        // anything that reads text - and it would put this wave's saving at the mercy of
        // one selector. The builder removes it from the html it emits.
        assert.ok(!/\.hv-player-cell[^{]*\{[^}]*display:\s*none/.test(SRC),
            'the label is hidden by CSS instead of removed');
        assert.match(SRC, /function holeViewCellHtml/, 'the builder has no named stripper');
        const fn = SRC.slice(SRC.indexOf('function holeViewCellHtml'), SRC.indexOf('\n    }', SRC.indexOf('function holeViewCellHtml')));
        assert.match(fn, /fc-cell-initials/, 'it does not name what it strips');
    });
    test('the Full Card still emits the initials, with the class the stripper names', () => {
        assert.match(SRC, /class="fc-cell-initials"/, 'the Full Card lost its column initials');
    });
    test('the row padding is 6px in the stylesheet, and it aligns to the TOP', () => {
        const css = SRC.slice(SRC.indexOf('.hv-player-row {'), SRC.indexOf('}', SRC.indexOf('.hv-player-row {')));
        assert.match(css, /padding: 6px 0/);
        // align-items: center is what let the name drift on a row made taller by one
        // golfer's net mark. flex-start pins it to the top exactly as the box is.
        assert.match(css, /align-items: flex-start/);
        assert.ok(!/align-items: center/.test(css), 'the row is centred again');
    });
});
