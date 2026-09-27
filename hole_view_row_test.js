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
    test('the row padding is 6px in the stylesheet', () => {
        const css = SRC.slice(SRC.indexOf('.hv-player-row {'), SRC.indexOf('}', SRC.indexOf('.hv-player-row {')));
        assert.match(css, /padding: 6px 0/);
    });
});
