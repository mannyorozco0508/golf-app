#!/usr/bin/env node
// ============================================================================
// CAN A GOLFER ACTUALLY ENTER AN ALTERNATE-SHOT SCORE?
//
// THIS CHECK ARRIVES COLD. It navigates to the scorecard a golfer opens, with a
// round that already holds a saved Cup and its session pointer, and TOUCHES
// NOTHING. The page loads its own scripts, receives its own snapshot through its
// own listener, and renders whatever it renders.
//
// Earlier versions called rcOpenClassic() and rcSave() to build the Cup, then
// applied the writes and looked at the scorecard. That proved the card works WHEN
// INVOKED and said nothing about whether a golfer can reach it - which is how a
// Cup surface that nothing on the page ever rendered survived underneath a
// passing check.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT. That a correctly saved round shows a
// usable entry card, unaided. That the round is saved correctly in the first
// place - the Cup, the pointer, the match format - is proved by the node suites,
// which drive the real setup UI and capture what it writes. Two claims, two
// places, and neither pretends to be the other.
//
//   node tools/foursomes-entry-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON lists which guarantee broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
    { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

// Hole 5 is left unscored, so the card must follow the golfer to the hole on
// screen rather than assume hole 1.
const scores = {};
PLAYERS.forEach(p => CD.forEach(h => {
    if (h.hole === 5) return;
    scores['p' + p.id + '_h' + h.hole] = 4;
}));

// A round exactly as the setup UI leaves one: the Cup, and the session pointer.
const CUP = {
    v: 1, name: 'Device Check Cup',
    sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
    members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
    sessions: { d1s1: { id: 'd1s1', day: 1, order: 1, format: 'foursomes', label: 'Day 1 Foursomes' } },
    matches: {
        'd1s1-m1': {
            id: 'd1s1-m1', sessionId: 'd1s1', format: 'foursomes', scoring: 'scratch',
            sideA: 'A', sideB: 'B', playersA: ['101', '102'], playersB: ['103', '104']
        }
    }
};
const ROUNDS = {
    FSCHECK: {
        eventName: 'Foursomes Check', gameFormat: 'stroke',
        players: PLAYERS, courseData: CD, scores: scores,
        ryderCup: CUP, ryderCupRef: { host: 'FSCHECK', sessionId: 'd1s1' }
    }
};

const PROBE = `
(() => {
  const out = {};
  const host = document.getElementById('hole-view-card');
  const card = host ? host.querySelector('.fs-card') : null;

  out.holeOnScreen = (typeof currentViewedHole !== 'undefined') ? currentViewedHole : null;
  out.cardPresent = !!card;
  if (!card) {
    out.verdict = 'FAIL';
    out.problems = ['no alternate-shot card rendered - a golfer cannot enter a score'];
    return JSON.stringify(out, null, 2);
  }

  const r = card.getBoundingClientRect();
  out.cardBox = { w: Math.round(r.width), h: Math.round(r.height),
                  rects: card.getClientRects().length };
  out.sideBoxes = card.querySelectorAll('.fs-in').length;

  const rows = host.querySelectorAll('.hv-player-row');
  out.playerRows = rows.length;

  const kids = Array.from(host.querySelectorAll('*'));
  const nav = host.querySelector('.hole-view-nav-row');
  out.order = {
    lastPlayerRow: rows.length ? kids.indexOf(rows[rows.length - 1]) : -1,
    card: kids.indexOf(card),
    nav: nav ? kids.indexOf(nav) : -1
  };

  const first = card.querySelector('.fs-in');
  out.writesToHole = (first.getAttribute('onchange') || '').replace(/.*','[AB]',(\\d+).*/, '$1');

  const problems = [];
  if (out.cardBox.w <= 0 || out.cardBox.h <= 0 || out.cardBox.rects === 0)
      problems.push('the card is present but has no geometry');
  if (out.sideBoxes !== 2) problems.push('expected 2 side boxes, got ' + out.sideBoxes);
  if (out.playerRows !== 4)
      problems.push('individual entry was removed: ' + out.playerRows + ' player rows');
  if (!(out.order.lastPlayerRow < out.order.card))
      problems.push('the card is above the per-golfer boxes');
  if (!(out.order.card < out.order.nav)) problems.push('the card is below Prev/Next');
  if (String(out.writesToHole) !== String(out.holeOnScreen))
      problems.push('the box writes to hole ' + out.writesToHole
                    + ' while hole ' + out.holeOnScreen + ' is on screen');

  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

function bail(msg) {
    console.error('foursomes-entry-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=FSCHECK'),
        rounds: ROUNDS, expression: PROBE, settleMs: 3500
    });
    if (!r.ok) bail(r.reason);
    console.log(r.value);
    let v;
    try { v = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
    process.exit(v.verdict === 'PASS' ? 0 : 1);
})();
