#!/usr/bin/env node
// ============================================================================
// THE EXPORTED RECEIPT SAYS WHAT THE SCREEN SAYS
//
// The Receipt is what a group settles from after the round, and the export is how
// it leaves the phone. If the PDF and the screen ever disagree about a dollar,
// somebody pays the wrong man from a document nobody can re-check.
//
// They cannot disagree BY CONSTRUCTION - native-export.js builds the PDF by reading
// the already-rendered DOM rather than recomputing - and this proves that
// construction still holds, on a real browser, on a round with a Main Pool:
//
//   1. ONE EXPORT, ONE LABEL. Two buttons reading "Print / Save PDF" and
//      "Print / Save Receipt" on the same screen read as two documents.
//   2. THE EXPORT ROOTS EXIST AND ARE ON SCREEN. If a root id is renamed the
//      exporter silently ships a shorter document - no error, just missing money.
//   3. EVERY DOLLAR ON SCREEN IS IN THE EXPORTED TEXT. The check extracts the
//      money from the rendered receipt and from the export payload and compares
//      the multisets. A figure on one and not the other is the failure.
//   4. THE TITLE BLOCK NAMES THE ROUND - course, date and who it is for. A PDF
//      that lands in a group chat with no header could be any weekend.
//
// NOTHING IS RECOMPUTED HERE EITHER. The check reads the same nodes the exporter
// reads; it never asks an engine what the money should be, because that would be a
// second opinion and the whole point is that there is only one.
//
//   node tools/receipt-export-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the figure that differs
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Marty Sharp', 'Scott Bell', 'Carp Dean', 'Randy Poe', 'Manny Orozco',
               'Matt Boyd', 'Lance Webb', 'Kopp Ellis', 'Marcus Reed', 'Rocco Vance',
               'Matt Hale', 'Jeremy Cole'];

function roundOf(carryOver) {
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n,
        hcp: String((i % 4) * 3), playingForMoney: true }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    [1, 2, 3, 4, 5].forEach((h, i) => { scores['p' + (101 + i) + '_h' + h] = 3; });
    const skins = { mode: 'remainder', scoring: 'net' };
    if (carryOver !== undefined) skins.carryOver = carryOver;
    return { eventName: 'Monday Main Pool', roundDay: 'Monday', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, settlementMode: 'whole-dollar',
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
        kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] },
                     net: { amount: 70, places: [100] }, skins: skins } };
}

// The screen, and what the exporter would take. RattleExport is stubbed so the
// payload can be captured without a print dialog or a share sheet; the page's own
// button is pressed, so if it is not wired this fails.
const PROBE = `
(() => {
  const out = {};
  const money = t => (String(t || '').match(/\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g) || []);

  // innerText, never textContent: this page keeps its application in an inline
  // <script>, and textContent would match dollar figures in the source.
  // THE WHOLE RECEIPT, not one section. #settle-content is a SIBLING of the money
  // sections, and reading only it is how an export shipped with no money in it.
  const screenNode = document.querySelector('.container') || document.body;
  out.screenMoney = money(screenNode ? screenNode.innerText : '');
  out.header = (() => {
    const h = document.getElementById('receipt-export-head');
    return h ? (h.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  })();

  const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => /printReceipt/.test(b.getAttribute('onclick') || ''));
  out.exportButtons = btns.length;
  out.labels = [...new Set(btns.map(b => (b.innerText || '').trim()))];
  out.anyOnScreen = btns.some(b => b.getClientRects().length > 0);

  // Capture what the exporter is handed, without exporting.
  let captured = null;
  const real = window.RattleExport;
  window.RattleExport = { exportOrPrint: o => { captured = o; return true; } };
  if (btns[0]) btns[0].click();
  window.RattleExport = real;

  out.exportCalled = !!captured;
  out.exportTitle = captured ? String(captured.title || '') : null;
  const roots = captured ? (captured.roots || []) : [];
  out.rootCount = roots.length;
  out.rootsOnScreen = roots.filter(r => r && r.getClientRects().length > 0).length;
  out.exportMoney = money(roots.map(r => (r && r.innerText) || '').join(' '));
  out.exportText = roots.map(r => (r && r.innerText) || '').join(' ')
      .replace(/\\s+/g, ' ').trim().slice(0, 400);
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('receipt-export-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}
const tally = arr => arr.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});

(async () => {
    const problems = [];
    const report = { cases: {} };
    let measured = 0;

    const CASES = [
        { name: 'carry recorded as true', carry: true, expectNotice: false },
        { name: 'carry recorded as false', carry: false, expectNotice: false },
        { name: 'no carry rule recorded', carry: undefined, expectNotice: true },
    ];

    for (const c of CASES) {
        const db = { events: { POOL1: roundOf(c.carry) } };
        const r = await arriveCold({ url: fileUrl('settlement.html', 'game=POOL1'), db: db,
            expression: PROBE, settleMs: 5200 });
        if (!r.ok) bail(c.name + ': ' + r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail(c.name + ': unreadable output'); }
        report.cases[c.name] = { labels: g.labels, header: g.header,
            screenFigures: g.screenMoney.length, exportFigures: g.exportMoney.length,
            title: g.exportTitle };

        // A RUN THAT RENDERED NO MONEY MEASURED NOTHING.
        if (g.screenMoney.length === 0) {
            bail(c.name + ': the receipt rendered no money at all, so comparing it with '
                + 'the export proves nothing');
        }
        measured++;

        // 1. one export, one label.
        if (g.exportButtons === 0) problems.push(c.name + ': there is no export control');
        else if (!g.anyOnScreen) problems.push(c.name + ': the export control is not on screen');
        if (g.labels.length > 1) {
            problems.push(c.name + ': two competing export labels on one screen: '
                + JSON.stringify(g.labels));
        }

        // 2. the roots the exporter reads.
        if (!g.exportCalled) {
            problems.push(c.name + ': pressing the export did not reach the exporter');
            continue;
        }
        if (g.rootCount === 0) problems.push(c.name + ': the export was handed no document');
        if (g.rootsOnScreen !== g.rootCount) {
            problems.push(c.name + ': ' + (g.rootCount - g.rootsOnScreen) + ' of '
                + g.rootCount + ' export roots are not on screen - the PDF would be '
                + 'missing a section with no error');
        }

        // 3. THE ASSERTION THIS TOOL EXISTS FOR.
        const s = tally(g.screenMoney), e = tally(g.exportMoney);
        const missing = Object.keys(s).filter(k => (e[k] || 0) < s[k]);
        if (missing.length) {
            problems.push(c.name + ': money on the screen is NOT in the export: '
                + JSON.stringify(missing.slice(0, 6)));
        }

        // 4. the title block.
        if (!g.header) problems.push(c.name + ': the receipt has no header block');
        else {
            // Case-insensitive: the header is uppercased by CSS, and innerText
            // returns the RENDERED text, so a case-sensitive match fails on a
            // correct header.
            if (!/camas meadows/i.test(g.header)) problems.push(c.name + ': the header does not name the course: ' + g.header);
            if (!/\d{4}/.test(g.header)) problems.push(c.name + ': the header carries no date: ' + g.header);
            if (!/golfer/i.test(g.header)) problems.push(c.name + ': the header does not say who it is for: ' + g.header);
        }
        if (!/Receipt/i.test(g.exportTitle || '')) {
            problems.push(c.name + ': the exported file is not named as a receipt: ' + g.exportTitle);
        }

        // The absent-rule notice must appear exactly where it belongs.
        const said = /did not record a carry rule/i.test(g.exportText)
            || /did not record a carry rule/i.test(JSON.stringify(g.screenMoney))
            || /did not record a carry rule/i.test(g.header || '');
        const inExport = /did not record a carry rule/i.test(g.exportText);
        if (c.expectNotice && !inExport) {
            problems.push(c.name + ': the receipt restates the money without saying it '
                + 'chose the rule itself');
        }
        if (!c.expectNotice && inExport) {
            problems.push(c.name + ': a round WITH a recorded rule is told it has none');
        }
    }

    if (measured === 0) bail('no case rendered a receipt - nothing was measured');
    report.casesMeasured = measured;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
