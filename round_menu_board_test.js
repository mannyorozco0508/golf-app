// ============================================================================
// THE ROUND MENU, AND THE BOARD THAT BECAME A POP-UP (2026-10-05)
//
// Two of Manny's four fixes, both about what a thumb finds on the scorecard.
//
//   1. THE HANDLE. "Status & everything else" in small green text read as a
//      caption, and he tapped past it. It is now "Round Menu" at heading size
//      inside a filled pill with a border and a shadow - a control, not a label.
//      The assertion that matters is NOT the font size: it is that the closed
//      sheet leaves the WHOLE pill on screen. #round-sheet is translated by
//      --sheet-handle-h, so a pill taller than that number hangs its own bottom
//      off the bottom of the phone and nothing in the suite would notice.
//
//   2. THE BOARD. The compact top five stay under Prev/Next - they are the
//      quick reference - and tapping ANYWHERE on that row now opens the full
//      leaderboard over the scorecard. The "LIVE LEADERBOARD" card that sat
//      directly below the compact lines is gone from Hole View, because it was
//      the same five names a second time, six pixels lower. The FULL CARD view
//      keeps its card: it has no compact lines of its own.
//
// WHY A COLD ARRIVAL. Both claims are geometry and taps. mini-dom has no layout
// (getBoundingClientRect is all zeroes) and no event dispatch, so it can prove
// the markup and prove nothing about whether a golfer can see or reach any of
// it. The source pins below are the half mini-dom CAN hold - that there is one
// handler, not two, and that the two numbers that must agree do.
//
// BASELINE, measured over the FINISHED file against setup-3-steps (4ebe98b,
// index.html swapped out and restored by sha), all 10 tests: 4 PASS / 6 FAIL.
// 4 + 6 = 10. The four that pass, and why each one is in the file anyway:
//   - "ran": the arrival itself, which is not an assertion about the wave.
//   - "the compact row is on the first screen": the row predates this wave. It
//     is here because it is what the pop-up must not cost.
//   - "the handle height and the sheet transform are the SAME number": true at
//     52/52/64 before, and it is the invariant a taller pill breaks silently.
//   - "the cold check is wired to the lines": VACUOUS at baseline, and said so
//     plainly - tools/round-menu-check.js is part of this wave, so swapping
//     index.html out does not swap it out. It proves nothing about HEAD.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const CD = makeCourseData(18);
const P = makePlayers(['Marty Marshall', 'Manny Orozco', 'Reese Richards', 'Vic Vance'], [2, 9, 15, 4], 101);
const scores = {};
P.forEach((p, i) => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = 4 + (i % 3); });
const ROUND = {
    eventName: 'Round menu', courseName: 'Dobson Ranch', players: P, courseData: CD, scores,
    gameFormat: 'stroke', settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 },
    ownerUid: 'anon-cold'
};

const HANDLE = `(function () {
  var pill = document.getElementById('round-sheet-pill');
  if (!pill) return JSON.stringify({ found: false });
  var r = pill.getBoundingClientRect(), cs = getComputedStyle(pill);
  return JSON.stringify({
    found: true,
    label: String(document.getElementById('round-sheet-label').innerText || ''),
    fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    weight: Number(cs.fontWeight),
    radiusPx: Math.round(parseFloat(cs.borderTopLeftRadius)),
    hasShadow: cs.boxShadow !== 'none' && cs.boxShadow !== '',
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    wholePillVisible: r.top >= 0 && r.bottom <= window.innerHeight
  });
})()`;

const BOARD = `(function () {
  var row = document.querySelector('#hole-live-mount .hl-board');
  var reading = document.getElementById('round-reading');
  var overlay = document.getElementById('live-board-overlay');
  var r = row ? row.getBoundingClientRect() : null;
  var body = document.getElementById('live-board-body');
  return JSON.stringify({
    rowTag: row ? row.tagName : '',
    rowVisible: !!(r && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight),
    chips: row ? row.querySelectorAll('.hl-chip').length : -1,
    fullBoardText: row ? /Full board/.test(row.innerText || '') : false,
    nestedButtons: row ? row.querySelectorAll('button').length : -1,
    // innerText, never textContent: this page keeps its whole application in an
    // inline script, and textContent matches "LIVE LEADERBOARD" in the SOURCE of
    // a page that rendered nothing at all.
    duplicateCard: /LIVE LEADERBOARD/.test(String(reading ? reading.innerText : '')),
    overlayOpen: !!(overlay && getComputedStyle(overlay).display !== 'none'),
    namesInOverlay: (String(body && body.innerText || '').match(/Marshall|Orozco|Richards|Vance/g) || []).length,
    hasClose: !!document.querySelector('#live-board-overlay .lb-overlay-close'),
    onScorecard: /index\\.html/.test(location.href) && !!document.getElementById('hole-view-card')
  });
})()`;

const S = {};
before(async () => {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=MENUB'),
        db: { events: { MENUB: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [
            { expression: HANDLE }, { expression: BOARD },
            // THE LINES, not the link: the chips are what a thumb lands on and
            // they were not a control at all before this wave.
            { tap: '#hole-live-mount .hl-board .hl-chip' }, { sleep: 500 },
            { expression: BOARD },
            { tap: '#live-board-overlay .lb-overlay-close' }, { sleep: 400 },
            { expression: BOARD }
        ]
    });
    S.ok = r.ok; S.reason = r.reason;
    if (r.ok) {
        const j = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
        S.handle = j[0]; S.before = j[1]; S.opened = j[2]; S.closed = j[3];
    }
});

describe('1. THE HANDLE READS AS A BUTTON', () => {

    test('ran', () => assert.ok(S.ok, S.reason));

    test('it says Round Menu, at heading size, in a pill', () => {
        assert.ok(S.handle.found, 'there is no pill');
        assert.match(S.handle.label, /Round Menu/, 'the handle still says ' + S.handle.label);
        assert.ok(!/everything else/i.test(S.handle.label), 'the old caption is still there');
        // Manny asked for 18-20px bold. Measured, not declared.
        assert.ok(S.handle.fontPx >= 18 && S.handle.fontPx <= 21,
            'the label is ' + S.handle.fontPx + 'px');
        assert.ok(S.handle.weight >= 700, 'weight is ' + S.handle.weight);
        assert.ok(S.handle.radiusPx >= 12, 'radius is ' + S.handle.radiusPx + 'px - not a pill');
        assert.ok(S.handle.hasShadow, 'no shadow, so it sits flat on the card');
    });

    test('and the WHOLE pill is on screen with the sheet closed', () => {
        // THE TRAP. #round-sheet is translateY(100% - var(--sheet-handle-h, N)),
        // so N is how much of the sheet stays visible. Grow the handle past N and
        // the bottom of the button is below the bottom of the phone - every
        // source assertion above still passes.
        assert.ok(S.handle.wholePillVisible,
            'the pill runs from ' + S.handle.top + ' to ' + S.handle.bottom + ', past the screen');
    });

    test('the handle height and the sheet transform are the SAME number', () => {
        const minH = (IDX.match(/#round-sheet-handle \{[\s\S]*?min-height: (\d+)px/) || [])[1];
        const peek = (IDX.match(/--sheet-handle-h, (\d+)px/) || [])[1];
        const pad = (IDX.match(/body\.has-round-sheet #main-content \{ padding-bottom: (\d+)px/) || [])[1];
        assert.ok(minH && peek, 'one of the two numbers is gone');
        assert.equal(minH, peek, 'the handle is ' + minH + 'px and the sheet shows ' + peek + 'px of it');
        assert.ok(Number(pad) >= Number(minH),
            'the page leaves ' + pad + 'px under its last block for a ' + minH + 'px handle');
    });

    test('the glyph is a real character in the markup, not an escape', () => {
        // \\uXXXX resolves inside a JS string and prints LITERALLY in raw markup.
        // This label is raw markup, so it is written as an entity or the glyph.
        const line = (IDX.match(/<span id="round-sheet-label">[^<]*<\/span>/) || [''])[0];
        assert.ok(!/\\u[0-9a-fA-F]{4}/.test(line), 'the label holds a literal escape: ' + line);
        assert.match(decodeEscapes(line), /(☰|&#9776;)\s*Round Menu/, line);
    });
});

describe('2. THE COMPACT ROW IS THE WAY TO THE FULL BOARD', () => {

    test('the top five are still on the first screen, under Prev/Next', () => {
        assert.ok(S.before.rowVisible, 'the compact row is not on the first screen');
        assert.ok(S.before.chips >= 4, 'only ' + S.before.chips + ' names');
        assert.ok(S.before.fullBoardText, 'the Full board link is gone');
    });

    test('tapping the LINES opens the full board over the scorecard', () => {
        assert.equal(S.before.overlayOpen, false, 'the pop-up was already open before the tap');
        assert.ok(S.opened.overlayOpen, 'tapping the names opened nothing');
        assert.ok(S.opened.namesInOverlay >= 4,
            'the pop-up shows ' + S.opened.namesInOverlay + ' of 4 golfers');
        assert.ok(S.opened.hasClose, 'there is no way to close it');
        // NO PAGE CHANGE: that is the whole reason this is an overlay.
        assert.ok(S.opened.onScorecard, 'the tap navigated away from the scorecard');
        assert.equal(S.closed.overlayOpen, false, 'the close button does not close it');
    });

    test('the row is ONE control, not a button inside a button', () => {
        assert.equal(S.before.rowTag, 'BUTTON', 'the row is a ' + S.before.rowTag);
        assert.equal(S.before.nestedButtons, 0,
            'the row holds ' + S.before.nestedButtons + ' nested buttons - invalid markup, two handlers');
        const fn = IDX.slice(IDX.indexOf('function renderHoleLive()'),
                             IDX.indexOf('\n    function ', IDX.indexOf('function renderHoleLive()') + 10));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /class="hl-row hl-board" onclick="openLiveBoard\(\)"/);
        assert.equal((fn.match(/openLiveBoard\(\)/g) || []).length, 1, 'more than one handler on the row');
    });

    test('and the duplicate card is gone from the page, not from the app', () => {
        assert.equal(S.before.duplicateCard, false,
            'the LIVE LEADERBOARD card is still under the compact lines');
        // THE FULL CARD VIEW KEEPS ITS OWN. It has no compact lines, so its board
        // is not a duplicate of anything - deleting the widget would have taken it
        // from a view that still needs it.
        const fn = IDX.slice(IDX.indexOf('function renderLiveTicker()'),
                             IDX.indexOf('\n    function ', IDX.indexOf('function renderLiveTicker()') + 10));
        assert.ok(fn.length > 600, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /'fc-ticker-mount': grid\(\[board\]\.concat\(rest\)\)/,
            'the Full Card lost its leaderboard too');
        assert.match(fn, /'live-ticker-mount': grid\(rest\)/,
            'Hole View is being given the board card again');
        // ONE PRESENTER STILL. The board html is built once; what differs is which
        // mount is handed it.
        assert.equal((fn.match(/renderLeaderWidgetHtml\(\)/g) || []).length, 1,
            'the board is built twice now');
    });

    test('the cold check that proves this is wired to the lines', () => {
        const tool = fs.readFileSync(path.join(__dirname, 'tools/round-menu-check.js'), 'utf8');
        assert.match(tool, /tap: '#hole-live-mount \.hl-board \.hl-chip'/,
            'it never taps the names, so it cannot prove they are a control');
        assert.match(tool, /lb-overlay-close/, 'it never closes the pop-up');
    });
});
