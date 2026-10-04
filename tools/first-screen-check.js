#!/usr/bin/env node
// ============================================================================
// WHAT IS ON THE FIRST SCREEN OF A LIVE ROUND, AS A PERCENTAGE (2026-10-04)
//
// Manny's complaint is not a bug, it is a ratio: on the phone, during a round,
// most of what is on screen is not the hole he is standing on. So this measures
// the ratio rather than arguing about it.
//
// HOW. A cold arrival (tools/lib/cold-arrival.js) on index.html at 390x844 with
// a real round - nothing is called, the page lands where it lands - then every
// element that paints in the first viewport is measured, and the ones that are
// THE HOLE (the score boxes, the hole heading, Prev/Next) are separated from the
// ones that are not.
//
//   scoresPct   the score inputs' own area / the viewport
//   holePct     the whole hole card / the viewport
//   otherTop    every other block that paints above the fold, by name and height
//
// AN ELEMENT IS COUNTED ONLY WHERE IT ACTUALLY PAINTS: the intersection of its
// rect with 0..844 is clipped, getClientRects().length must be non-zero, and
// anything display:none, zero-height or scrolled off is not there. Reading the
// rect alone would count a card that sits below the fold.
//
// EXIT 0 and prints JSON. --shot <path> writes a full-page PNG beside it.
// ============================================================================

const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const W = 390, H = 844;
const CODE = 'UXROUND';
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'];
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i % 5 === 3 ? 3 : 4, hcpIndex: i });
const PLAYERS = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
// Six holes in: the page lands on the 7th, which is the state a round is mostly in.
const scores = {};
PLAYERS.forEach((p, pi) => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = 4 + (pi % 3); });

const ROUND = {
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: PLAYERS,
    gameFormat: 'match', matchScoringStyle: 'stroke', matchStake: 10, matchScoring: 'net',
    matchPressRule: '2down', courseData: CD, scores, settlementMode: 'whole-dollar',
    skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: true,
    moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [3, 8, 13, 18] }, net: { amount: 60 },
                 skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    ownerUid: 'anon-cold'
};

const PROBE = `(function () {
  var VH = ${H}, VW = ${W};
  var seen = [], total = 0;
  function paints(el) {
    if (!el || typeof el.getClientRects !== 'function') return null;
    if (!el.getClientRects().length) return null;
    var r = el.getBoundingClientRect();
    var top = Math.max(0, r.top), bottom = Math.min(VH, r.bottom);
    if (bottom <= top || r.width <= 0) return null;
    return { top: Math.round(top), bottom: Math.round(bottom),
             h: Math.round(bottom - top), w: Math.round(Math.min(VW, r.width)) };
  }
  function area(el) { var p = paints(el); return p ? p.h * p.w : 0; }
  // THE SCORE BOXES: the inputs a golfer types into, wherever they are.
  var inputs = Array.prototype.slice.call(document.querySelectorAll('#hole-view-card input, #scorecard-table input'));
  var scoreArea = 0, scoreCount = 0;
  inputs.forEach(function (el) { var a = area(el); if (a > 0) { scoreArea += a; scoreCount++; } });
  // THE HOLE CARD as a block: heading, boxes, Prev/Next.
  var holeArea = area(document.getElementById('hole-view-card'));
  // EVERYTHING ELSE THAT PAINTS ABOVE THE FOLD, top-level blocks only, so one
  // card is one row rather than forty nested divs.
  var main = document.getElementById('main-content') || document.body;
  var blocks = Array.prototype.slice.call(main.children).concat(
    Array.prototype.slice.call(document.body.children).filter(function (c) { return c !== main; }));
  var others = [];
  blocks.forEach(function (el) {
    if (!el || el.id === 'hole-view-card') return;
    if (el.contains && el.contains(document.getElementById('hole-view-card'))) {
      // A wrapper of the hole card: walk one level in rather than counting it whole.
      Array.prototype.slice.call(el.children).forEach(function (c) {
        if (c.id === 'hole-view-card') return;
        var p = paints(c);
        if (p && p.h > 4) others.push({ name: (c.id || c.className || c.tagName).toString().slice(0, 42), top: p.top, h: p.h });
      });
      return;
    }
    var p = paints(el);
    if (p && p.h > 4) others.push({ name: (el.id || el.className || el.tagName).toString().slice(0, 42), top: p.top, h: p.h });
  });
  return JSON.stringify({
    landedOn: (function () { var hd = document.querySelector('#hole-view-card .hole-view-header');
      return hd ? (hd.innerText || '').trim().split('\\n')[0] : null; })(),
    scoreBoxes: scoreCount,
    scoresPct: Math.round((scoreArea / (VW * VH)) * 1000) / 10,
    holePct: Math.round((holeArea / (VW * VH)) * 1000) / 10,
    docH: document.documentElement.scrollHeight,
    aboveFoldOther: others.sort(function (a, b) { return a.top - b.top; })
  });
})()`;

// WHAT THE SHEET HOLDS, read after a real tap on its handle. innerText, so a
// block that is in the DOM but not rendered does not count as "moved into the
// sheet" - which is the only claim worth making.
const SHEET = `(function () {
  var sheet = document.getElementById('round-sheet');
  var body = document.getElementById('round-sheet-body');
  if (!sheet || !body) return JSON.stringify({ missing: true });
  var ids = Array.prototype.slice.call(body.children).map(function (c) { return c.id || c.className; });
  var r = sheet.getBoundingClientRect();
  return JSON.stringify({
    open: sheet.classList.contains('open'),
    top: Math.round(r.top),
    blocks: ids,
    text: (body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  });
})()`;

(async () => {
    const shotAt = process.argv.indexOf('--shot');
    const openIt = process.argv.indexOf('--open') > -1;
    const steps = [{ expression: PROBE }];
    if (openIt) {
        steps.push({ expression: SHEET });                      // closed
        steps.push({ tap: '#round-sheet-handle' }, { sleep: 500 });
        steps.push({ expression: SHEET });                      // open
    }
    if (shotAt > -1 && process.argv[shotAt + 1]) steps.push({ shot: process.argv[shotAt + 1] });
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=' + CODE),
        db: { events: { [CODE]: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: W, height: H }, settleMs: 3500, steps
    });
    if (!r.ok) { console.error('BAILED: ' + r.reason); process.exit(2); }
    const out = JSON.parse(String(r.value[0]));
    console.log(JSON.stringify(out, null, 2));
    if (!out.scoreBoxes) { console.error('no score boxes painted - nothing was measured'); process.exit(2); }
    console.log('scores ' + out.scoresPct + '% of the first screen · the hole card ' + out.holePct
        + '% · ' + out.aboveFoldOther.length + ' other block(s) above the fold');
    if (openIt) {
        const closed = JSON.parse(String(r.value[1]));
        const open = JSON.parse(String(r.value[4]));
        console.log(JSON.stringify({ closed: { open: closed.open, top: closed.top },
                                     opened: { open: open.open, top: open.top },
                                     blocks: open.blocks, text: open.text }, null, 2));
        if (closed.open) { console.error('the sheet ships OPEN'); process.exit(1); }
        if (!open.open) { console.error('the handle did not open the sheet'); process.exit(1); }
        if (open.top >= closed.top) { console.error('the sheet did not rise: ' + closed.top + ' -> ' + open.top); process.exit(1); }
        console.log('the handle opens it: ' + closed.top + ' -> ' + open.top + ', ' + open.blocks.length + ' blocks inside');
    }
})();
