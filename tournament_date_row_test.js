// THE CREATE FORM'S DATE / START TIME ROW (Manny 2026-11-12): on an iPad,
// Safari sizes a type=time box to its intrinsic width, and in a 1fr grid
// track (min-content wide) the box ran past the right edge over the date.
// The fix is minmax(0, 1fr) tracks and min-width: 0 on the boxes - AND, for
// real iOS WebKit, appearance: none on the two boxes: a native-appearance
// date/time control keeps its intrinsic width whatever width: 100% says.
// Measured 2026-11-12 on an iPad Pro 11 simulator (iPadOS 26.5, Safari,
// 834 px): before, the time box ran past the form's edge over the date
// (tournaments/screens-ui3/ipad-daterow-before.png); after, both boxes sit in
// their columns (ipad-daterow-after.png). Chrome cannot show that overflow;
// this file holds the geometry plus the computed CSS the fix rests on.
//
// WHAT CHROME CAN AND CANNOT PROVE. Headless Chrome's time box is narrow, so
// the overlap itself does not reproduce here; the geometry assertions hold on
// both pages. What the build changes, and what goes red without it, is the
// computed CSS the fix rests on: the row's tracks are minmax(0, 1fr) and both
// boxes compute min-width 0 and width 100% of their cell. Read from the live
// page at four widths, the way the form is laid out for a user.
//
//  1 390x844, 768x1024, 820x1180 and 1024x768: both boxes inside their cells,
//    date.right <= time.left, time.right <= the row's right edge, both >= 40 px
//    tall, no horizontal overflow of the row's parent; and the computed fix
//    (track list is minmax(0, 1fr) minmax(0, 1fr); both boxes min-width 0px and
//    width = cell width)
//  2 money = base
//
// Baseline against main 0f11073c (the page swapped in by cp, restored by sha):
// all 2 tests: 1 PASS / 1 FAIL (test 2). With the build: 2 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const READ = { expression: `JSON.stringify((function () {
  var row = document.querySelector('.setup-when'); if (!row) return { missing: true };
  var d = document.getElementById('t-date'), t = document.getElementById('t-time');
  var R = function (e) { var r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
  var cs = getComputedStyle(row);
  var cells = Array.prototype.map.call(row.children, function (c) { return R(c); });
  return { vw: window.innerWidth, row: R(row), cells: cells, date: R(d), time: R(t), tracks: cs.gridTemplateColumns,
    minW: [getComputedStyle(d).minWidth, getComputedStyle(t).minWidth], appearance: [getComputedStyle(d).appearance || getComputedStyle(d).webkitAppearance, getComputedStyle(t).appearance || getComputedStyle(t).webkitAppearance], display: [getComputedStyle(d).display, getComputedStyle(t).display], parentScroll: row.parentElement.scrollWidth, parentClient: row.parentElement.clientWidth,
    rule: (function () { var out = null; try { Array.prototype.forEach.call(document.styleSheets, function (ss) { Array.prototype.forEach.call(ss.cssRules || [], function (r) { if (r.selectorText === '.setup-when') out = r.style.gridTemplateColumns; }); }); } catch (e) {} return out; })() };
})())` };

test('1 four widths: no overlap, inside the row, tall enough; the tracks are minmax(0, 1fr) and the boxes shrink to their cells', async () => {
    for (const vp of [[390, 844], [768, 1024], [820, 1180], [1024, 768]]) {
        const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: { tournaments: {}, events: {}, trips: {}, global_courses: {} }, auth: OWNER, viewport: { width: vp[0], height: vp[1] }, settleMs: 2500, steps: [READ] });
        assert.ok(r.ok, r.reason);
        const a = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{')[0]);
        assert.equal(a.vw, vp[0]);
        assert.ok(a.date.w > 100 && a.time.w > 100, `positive: both boxes drew at ${vp[0]}: ${JSON.stringify([a.date, a.time])}`);
        assert.ok(a.date.right <= a.time.left, `no overlap at ${vp[0]}: date.right ${a.date.right} time.left ${a.time.left}`);
        assert.ok(a.time.right <= a.row.right + 1, `time inside the row at ${vp[0]}: ${a.time.right} vs ${a.row.right}`);
        assert.ok(a.date.h >= 40 && a.time.h >= 40, `tall enough at ${vp[0]}: ${a.date.h}, ${a.time.h}`);
        assert.ok(a.parentScroll <= a.parentClient, `no horizontal overflow at ${vp[0]}: ${a.parentScroll} vs ${a.parentClient}`);
        assert.equal(a.rule, 'minmax(0px, 1fr) minmax(0px, 1fr)', `the row's track rule at ${vp[0]}: ${a.rule}`);
        assert.deepEqual(a.minW, ['0px', '0px'], `the boxes may shrink at ${vp[0]}`);
        assert.deepEqual(a.appearance, ['none', 'none'], 'iOS WebKit: appearance none hands the width back to CSS');
        assert.deepEqual(a.display, ['block', 'block']);
        assert.ok(Math.abs(a.date.w - a.cells[0].w) <= 1 && Math.abs(a.time.w - a.cells[1].w) <= 1, `each box fills its cell at ${vp[0]}: ${JSON.stringify([a.date.w, a.cells[0].w, a.time.w, a.cells[1].w])}`);
    }
});

test('2 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
