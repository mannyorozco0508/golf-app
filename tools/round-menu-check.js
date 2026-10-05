#!/usr/bin/env node
// ============================================================================
// THE ROUND MENU HANDLE, AND THE BOARD THAT IS NOW A POP-UP (2026-10-05)
//
// Two of Manny's four fixes are about what a thumb can find on the scorecard,
// and neither can be proved by reading source: one is a size and a shape, the
// other is whether a tap opens anything.
//
//   handle   "Status & everything else" read as a caption and he tapped past it.
//            It is now a filled pill saying "Round Menu" at heading size. The
//            measurement that matters is not the font: it is that the closed
//            sheet leaves the WHOLE pill on screen. --sheet-handle-h is what the
//            sheet is translated by, and a pill taller than that number hangs
//            its own bottom off the bottom of the phone.
//
//   board    the compact top five stay under Prev/Next, and tapping ANYWHERE on
//            that row - the lines or "Full board" - opens the full leaderboard
//            over the scorecard. The duplicate "LIVE LEADERBOARD" card that sat
//            directly below the compact lines is gone from the Hole View, and
//            the Full Card view keeps its own.
//
// CALLS NOTHING THE PAGE DEFINES. Cold arrival, real taps, measured rects.
//
// EXIT 0 and prints JSON; read `ok`. --shot <path> writes the open pop-up.
// ============================================================================

const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const W = 390, H = 844;
const CODE = 'MENUCHK';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i % 5 === 3 ? 3 : 4, hcpIndex: i });
const PLAYERS = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
const scores = {};
PLAYERS.forEach((p, pi) => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = 4 + (pi % 3); });
const ROUND = {
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: PLAYERS,
    gameFormat: 'match', matchScoringStyle: 'stroke', matchStake: 10, matchScoring: 'net',
    matchPressRule: '2down', courseData: CD, scores, settlementMode: 'whole-dollar',
    ownerUid: 'anon-cold'
};

const HANDLE_PROBE = `(function () {
  var pill = document.getElementById('round-sheet-pill');
  var handle = document.getElementById('round-sheet-handle');
  if (!pill || !handle) return JSON.stringify({ found: false });
  var p = pill.getBoundingClientRect(), h = handle.getBoundingClientRect();
  var cs = getComputedStyle(pill);
  return JSON.stringify({
    found: true,
    label: String(document.getElementById('round-sheet-label').innerText || ''),
    fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    weight: cs.fontWeight,
    radiusPx: Math.round(parseFloat(cs.borderTopLeftRadius)),
    hasShadow: cs.boxShadow !== 'none' && cs.boxShadow !== '',
    hasBorder: parseFloat(cs.borderTopWidth) > 0,
    // THE WHOLE PILL IS ON SCREEN with the sheet closed. This is the number that
    // breaks silently when the handle grows and the transform does not.
    pillBottom: Math.round(p.bottom), pillTop: Math.round(p.top),
    handleH: Math.round(h.height), viewportH: ${H},
    wholePillVisible: p.top >= 0 && p.bottom <= ${H}
  });
})()`;

const BOARD_PROBE = `(function () {
  var row = document.querySelector('#hole-live-mount .hl-board');
  var reading = document.getElementById('round-reading');
  var holeMount = document.getElementById('live-ticker-mount');
  var r = row ? row.getBoundingClientRect() : null;
  return JSON.stringify({
    compactRow: !!row,
    rowTag: row ? row.tagName : '',
    rowOnFirstScreen: !!(r && r.top >= 0 && r.bottom <= ${H} && r.height > 0),
    fullBoardLink: !!(row && /Full board/.test(row.innerText || '')),
    nestedButtons: row ? row.querySelectorAll('button').length : -1,
    // innerText, so this reads the RENDERED page and not the inline script that
    // builds the card: textContent matches "LIVE LEADERBOARD" in the source of a
    // page that rendered nothing at all.
    duplicateCardInReading: /LIVE LEADERBOARD/.test(String(reading ? reading.innerText : '')),
    holeMountEmpty: !!(holeMount && !/LIVE LEADERBOARD/.test(String(holeMount.innerText || ''))),
    overlayOpen: (function () {
      var o = document.getElementById('live-board-overlay');
      return !!(o && getComputedStyle(o).display !== 'none');
    })()
  });
})()`;

const OPEN_PROBE = `(function () {
  var o = document.getElementById('live-board-overlay');
  var body = document.getElementById('live-board-body');
  var open = !!(o && getComputedStyle(o).display !== 'none');
  var r = o ? o.getBoundingClientRect() : null;
  return JSON.stringify({
    open: open,
    // THE FULL FIELD, not the top five again.
    namesShown: open ? (String(body.innerText || '').match(/Alpha|Bravo|Charlie|Delta/g) || []).length : 0,
    hasClose: !!document.querySelector('#live-board-overlay .lb-overlay-close'),
    coversCard: !!(r && r.width >= ${W} - 1),
    // NO PAGE CHANGE: the scorecard is still mounted underneath.
    stillOnScorecard: /index\\.html/.test(location.href) && !!document.getElementById('hole-view-card')
  });
})()`;

(async () => {
    const shotIdx = process.argv.indexOf('--shot');
    const out = await arriveCold({
        url: fileUrl('index.html', 'game=' + CODE),
        rounds: { [CODE]: ROUND },
        viewport: { width: W, height: H }, settleMs: 3200,
        steps: [
            { expression: HANDLE_PROBE },
            { expression: BOARD_PROBE },
            // THE TAP IS ON THE LINES, not on "Full board": the chips are what a
            // thumb lands on, and they were not a control before this.
            { tap: '#hole-live-mount .hl-board .hl-chip' }, { sleep: 500 },
            { expression: OPEN_PROBE }
        ].concat(shotIdx === -1 ? [] : [{ shot: path.resolve(process.argv[shotIdx + 1]) }])
         .concat([
            { tap: '#live-board-overlay .lb-overlay-close' }, { sleep: 400 },
            { expression: OPEN_PROBE }
         ])
    });
    const vals = (out.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
    const [handle, board, opened, closed] = vals;
    const ok = !!(handle.found && handle.label.indexOf('Round Menu') !== -1
        && handle.fontPx >= 18 && handle.fontPx <= 21 && Number(handle.weight) >= 700
        && handle.radiusPx >= 12 && handle.hasShadow && handle.wholePillVisible
        && board.compactRow && board.rowOnFirstScreen && board.fullBoardLink
        && board.nestedButtons === 0 && !board.duplicateCardInReading && !board.overlayOpen
        && opened.open && opened.namesShown >= 4 && opened.hasClose && opened.stillOnScorecard
        && !closed.open);
    console.log(JSON.stringify({ ok, handle, board, opened, closed }, null, 2));
})().catch(e => { console.error(String(e && e.message || e)); process.exit(2); });
