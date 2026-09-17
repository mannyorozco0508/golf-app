#!/usr/bin/env node
// ============================================================================
// TAP A NAME ON THE LEADERBOARD, SEE THEIR CARD - the tap half, in Chrome.
//
// board_card_test.js drives everything behind the tap. mini-dom cannot tap a
// cell or lay out a table, so this check opens leaderboard.html?game=CARD1
// cold (tools/lib/cold-arrival.js: bundles blocked, a stand-in injected, the
// page runs its own init, listener and render) at 390px and measures:
//
//   - nothing is open on arrival
//   - a REAL click on a golfer's name cell (the page's delegated listener on
//     #board-content, the row found by its data-player-id) inserts exactly
//     one <tr class="board-card-row"> directly after that golfer's row
//   - the card is two stacked nines: each table's width <= the card cell's,
//     the cell does not scroll sideways, the page does not scroll sideways;
//     the front table has 11 cells per row (label + 9 + OUT), the back 12
//     (label + 9 + IN + TOT); every hole cell is at least 24px wide and the
//     numbers are not clipped; the font size is reported
//   - the card's 18 gross numbers are the fixture's scores for that golfer
//   - a second click on the same name removes the card
//   - the card survives a new snapshot: with the card open, the stand-in
//     delivers a new value (the preScript keeps the page's own value callback
//     and calls it again), the card is still there and shows the new score
//   - the same in the By Group and By Flight views, through the page's own
//     view buttons
//   - a golfer with no scores opens a card of dashes
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: (i % 5 === 0) ? 3 : (i % 7 === 0 ? 5 : 4), hcpIndex: ((i * 7) % 18) + 1 });
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
function round() {
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String([0, 4, 9, 12, 2, 6, 18, 0][i]), playingForMoney: true }));
    const scores = {};
    players.forEach((p, i) => CD.forEach(h => {
        if (i === 7) return;
        scores['p' + p.id + '_h' + h.hole] = h.par + ((i + h.hole) % 4 === 0 ? -1 : (h.hole % 7 === 0 ? 1 : 0)) + ((i === 2 && h.hole === 5) ? -1 : 0);
    }));
    return { eventName: 'Card Round', players, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        groupSizeOverrides: { 0: 4, 1: 4 }, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } },
        moneyPool: { enabled: true, buyIn: 20, net: { amount: 60, places: [100] }, kp: { amount: 0, holes: [] }, skins: { mode: 'none' } } };
}
const R = round(); R.players.forEach((p, i) => { p.flight = i < 4 ? 'A' : 'B'; });

// The stand-in keeps no handlers; this wrapper remembers the page's own value
// callback for events/CARD1 so a later step can deliver a second snapshot
// through it. Instrumentation of the stub, not of the page.
const PRESCRIPT = `
(function () {
  var db = window.firebase.database;
  window.firebase.database = function () {
    var real = db.apply(this, arguments);
    var ref = real.ref;
    real.ref = function (p) {
      var r = ref.call(this, p);
      var on = r.on;
      r.on = function (ev, cb) { if (ev === 'value' && /events\\/CARD1$/.test(String(p))) window.__valueCb = cb; return on.call(this, ev, cb); };
      return r;
    };
    return real;
  };
  window.__deliver = function (val) { if (!window.__valueCb) return 'no callback'; window.__valueCb({ val: function () { return val; }, exists: function () { return true; } }); return 'delivered'; };
})();`;

const PROBE = `
(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) }; };
  const mount = document.getElementById('board-content');
  const cards = Array.from(document.querySelectorAll('tr.board-card-row'));
  const out = { innerWidth, scrollWidth: document.documentElement.scrollWidth, cards: cards.map(c => c.getAttribute('data-card-for')), rows: document.querySelectorAll('tr[data-player-id]').length };
  if (cards.length) {
    const c = cards[0];
    const prev = c.previousElementSibling;
    const cell = c.querySelector('td');
    out.prevRowId = prev && prev.getAttribute('data-player-id');
    out.cell = r(cell); out.cellScroll = cell.scrollWidth; out.cellClient = cell.clientWidth;
    out.tables = Array.from(c.querySelectorAll('table')).map(t => {
      const first = t.querySelector('tr');
      const holeCells = Array.from(first.querySelectorAll('th')).slice(1, 10).map(x => Math.round(x.getBoundingClientRect().width));
      const golfer = Array.from(t.querySelectorAll('tr')).find(x => x.querySelector('td.rt-name'));
      const nums = golfer ? Array.from(golfer.querySelectorAll('td')).slice(1).map(x => x.innerText.trim()) : [];
      // Numbers must never clip. The label cell (the golfer's name) is ellipsised
      // by CSS on purpose - the full name is on the row above - and is reported
      // separately rather than counted as a squeeze.
      const clipped = golfer ? Array.from(golfer.querySelectorAll('td')).slice(1).some(x => x.scrollWidth > x.clientWidth + 1) : null;
      const nameCell = golfer && golfer.querySelector('td.rt-name');
      const nameEllipsised = nameCell ? nameCell.scrollWidth > nameCell.clientWidth + 1 : null;
      return { width: Math.round(t.getBoundingClientRect().width), cellsPerRow: first.querySelectorAll('th').length, holeCellWidths: holeCells, minHoleCell: Math.min(...holeCells), labelCell: nameCell ? Math.round(nameCell.getBoundingClientRect().width) : null, nameEllipsised, font: getComputedStyle(golfer || first).fontSize, nums, clipped, netRows: t.querySelectorAll('tr.rt-net').length };
    });
    out.cardHeight = r(c).height;
  }
  return JSON.stringify(out);
})()`;
const clickName = id => `(() => { const tr = document.querySelector('tr[data-player-id="${id}"]'); const td = tr && tr.querySelector('td.player-name'); if (!td) return 'no cell'; td.click(); return 'clicked'; })()`;
const clickView = label => `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => new RegExp(${JSON.stringify(label)}).test(x.innerText || '')); if (!b) return 'no button ' + ${JSON.stringify(label)}; b.click(); return 'clicked ' + b.innerText.trim(); })()`;
const NEXT = JSON.parse(JSON.stringify(R)); NEXT.scores.p103_h18 = 2;

(async () => {
    const failures = [];
    const bail = why => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why }, null, 2)); process.exit(2); };
    const r = await arriveCold({
        url: fileUrl('leaderboard.html', 'game=CARD1'), db: { events: { CARD1: R } }, viewport: { width: 390, height: 844 },
        preScript: PRESCRIPT, settleMs: 3500,
        steps: [
            { expression: PROBE },                                   // 0 arrival
            { expression: clickName(103) }, { expression: PROBE },   // 1,2 open Cal
            { expression: clickName(103) }, { expression: PROBE },   // 3,4 close Cal
            { expression: clickName(103) },                          // 5 open again
            { expression: `window.__deliver(${JSON.stringify(NEXT)})` }, { sleep: 300 }, { expression: PROBE },   // 6,7,8 snapshot lands
            { expression: clickName(103) },                          // 9 close
            { expression: clickView('By Group|Group') }, { sleep: 200 }, { expression: clickName(104) }, { expression: PROBE },   // 10-13 group view
            { expression: clickName(104) },
            { expression: clickView('Flight') }, { sleep: 200 }, { expression: clickName(106) }, { expression: PROBE },          // 15-18 flight view
            { expression: clickName(106) },
            { expression: clickView('All') }, { sleep: 200 }, { expression: clickName(108) }, { expression: PROBE }             // 20-23 no scores
        ]
    });
    if (!r.ok) bail(r.reason);
    const v = r.value;
    const J = i => { try { return JSON.parse(v[i]); } catch (e) { return null; } };
    const arrival = J(0), opened = J(2), closed = J(4), after = J(8), group = J(13), flight = J(18), nobody = J(23);
    if (!arrival || !opened) bail('probe did not parse: ' + JSON.stringify(v.slice(0, 3)));

    if (arrival.cards.length !== 0) failures.push('arrival: a card is open before any tap: ' + JSON.stringify(arrival.cards));
    if (arrival.rows !== 8) failures.push('arrival: ' + arrival.rows + ' rows carry data-player-id, wanted 8');
    if (v[1] !== 'clicked') failures.push('open: ' + v[1]);
    if (JSON.stringify(opened.cards) !== '["103"]') failures.push('open: cards after the tap are ' + JSON.stringify(opened.cards));
    else {
        if (opened.prevRowId !== '103') failures.push('open: the card does not directly follow row 103 (follows ' + opened.prevRowId + ')');
        if (opened.tables.length !== 2) failures.push('open: ' + opened.tables.length + ' tables, wanted two nines');
        else {
            const [f, b] = opened.tables;
            if (f.cellsPerRow !== 11) failures.push('front nine: ' + f.cellsPerRow + ' cells per row, wanted 11 (label + 9 + OUT)');
            if (b.cellsPerRow !== 12) failures.push('back nine: ' + b.cellsPerRow + ' cells per row, wanted 12 (label + 9 + IN + TOT)');
            [f, b].forEach((t, i) => {
                if (t.width > opened.cell.width + 1) failures.push(`${i ? 'back' : 'front'} nine: table ${t.width}px wider than its cell ${opened.cell.width}px`);
                if (t.minHoleCell < 24) failures.push(`${i ? 'back' : 'front'} nine: a hole cell is ${t.minHoleCell}px wide - a squeeze, not a card`);
                if (t.clipped) failures.push(`${i ? 'back' : 'front'} nine: a number is clipped in its cell`);
                if (t.netRows !== 1) failures.push(`${i ? 'back' : 'front'} nine: ${t.netRows} net rows, wanted 1 (net matters on this round)`);
            });
            const want = CD.map(h => String(R.scores['p103_h' + h.hole]));
            const got = f.nums.slice(0, 9).concat(b.nums.slice(0, 9));
            if (JSON.stringify(got) !== JSON.stringify(want)) failures.push('open: the card\'s 18 numbers are not Cal\'s scores: ' + JSON.stringify(got) + ' vs ' + JSON.stringify(want));
        }
        if (opened.cellScroll > opened.cellClient + 1) failures.push('open: the card cell scrolls sideways (' + opened.cellScroll + ' > ' + opened.cellClient + ')');
        if (opened.scrollWidth > opened.innerWidth) failures.push('open: the page scrolls sideways (' + opened.scrollWidth + ' > ' + opened.innerWidth + ')');
    }
    if (!closed || closed.cards.length !== 0) failures.push('close: the second tap did not remove the card: ' + JSON.stringify(closed && closed.cards));
    if (v[6] !== 'delivered') failures.push('snapshot: ' + v[6]);
    if (!after || JSON.stringify(after.cards) !== '["103"]') failures.push('snapshot: the card did not survive the next snapshot: ' + JSON.stringify(after && after.cards));
    else if (!after.tables[1] || after.tables[1].nums[8] !== '2') failures.push('snapshot: the card does not show the score that just landed (18th = ' + (after.tables[1] && after.tables[1].nums[8]) + ')');
    if (!group || JSON.stringify(group.cards) !== '["104"]' || group.prevRowId !== '104') failures.push('By Group: ' + v[10] + ' -> cards ' + JSON.stringify(group && group.cards) + ' after row ' + (group && group.prevRowId));
    if (!flight || JSON.stringify(flight.cards) !== '["106"]' || flight.prevRowId !== '106') failures.push('By Flight: ' + v[15] + ' -> cards ' + JSON.stringify(flight && flight.cards) + ' after row ' + (flight && flight.prevRowId));
    if (!nobody || JSON.stringify(nobody.cards) !== '["108"]') failures.push('no scores: ' + JSON.stringify(nobody && nobody.cards));
    else if (!nobody.tables.every(t => t.nums.every(n => n === '–'))) failures.push('no scores: the card is not all dashes: ' + JSON.stringify(nobody.tables.map(t => t.nums)));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, measured: {
        viewport: 390, cardCell: opened.cell, cardHeight: opened.cardHeight,
        front: opened.tables && opened.tables[0], back: opened.tables && opened.tables[1],
        pageScroll: [opened.scrollWidth, opened.innerWidth], cellScroll: [opened.cellScroll, opened.cellClient],
        views: { group: v[10], flight: v[15], all: v[20] }
    } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2)); process.exit(2); });
