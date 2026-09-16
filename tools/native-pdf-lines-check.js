#!/usr/bin/env node
// ============================================================================
// THE SHARE-SHEET PDF READS LIKE THE PAGE
//
// native-export.js builds the iOS PDF from the text of the export roots. Until
// v151 it read innerText from a DETACHED clone of each root - which the spec
// resolves to textContent - so every card came out on one line with no
// separators ("Original Bet$50Started Hole 1Carp 2&0Carp +$50") and headers
// kept their source indentation. That is what the group received from Build
// 13 on. It now assembles the text from the LIVE tree: one line per ledger
// row (a flex box's items joined two spaces apart), blocks on their own lines,
// table rows with their cells spaced, nothing that is not rendered.
//
// mini-dom has no layout and no innerText, so this is measured in Chrome on a
// cold arrival, no page function called: the receipt (settlement.html, the five
// export roots) and the trip itinerary (trip.html, the real button pressed with
// window.print stubbed - the itinerary view is display:none on screen, so the
// live read finds nothing and the clone path runs: byte-identical to before).
//
//   node tools/native-pdf-lines-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the measurement
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { linkedRounds } = require('../helpers/trip-weekly-rounds.js');

const PREV = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'native_pdf_lines_prev.fixture.json'), 'utf8'));
const R = linkedRounds();
const NAMES = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];

const RECEIPT = `(function(){ var roots=['receipt-export-head','settle-content','money-pool-section','combined-settlement-summary','receipt-scorecard'].map(id=>document.getElementById(id)).filter(el=>el&&(el.innerText||'').trim().length>0);
  var lines = RattleExport._linesFrom(roots); var pdf = RattleExport._buildPdf('Caledonia-Receipt', lines);
  var summary = document.getElementById('combined-settlement-summary'); var rt = RattleExport._renderedText ? RattleExport._renderedText(summary) : { live: null, text: '', drop: {} };
  var pages = pdf.split(/\\d+ 0 obj\\n<< \\/Length \\d+ >>\\nstream\\n/).slice(1).map(s => (s.split('endstream')[0].match(/\\) Tj/g) || []).length);
  return JSON.stringify({ lines, pdfBytes: pdf.length, pageRows: pages, live: rt.live, rawHasButton: /Print \\/ Save Receipt/.test(rt.text), dropKeys: Object.keys(rt.drop) }); })()`;
const STUB = `window.__printed = 0; window.print = function(){ window.__printed++; };`;
const TRIP_CLICK = `(function(){ var b = Array.from(document.querySelectorAll('button')).find(x => /Itinerary/.test(x.innerText)); if (!b) return 'no button'; b.click(); return 'clicked'; })()`;
const TRIP_READ = `(function(){ var v = document.getElementById('trip-itinerary-print-view'); var rt = RattleExport._renderedText ? RattleExport._renderedText(v) : { live: null }; return JSON.stringify({ printed: window.__printed, classOn: document.body.classList.contains('printing-itinerary'), display: getComputedStyle(v).display, live: rt.live, lines: RattleExport._linesFrom([v]) }); })()`;

function bail(msg) { console.log(JSON.stringify({ result: 'COULD NOT RUN', reason: msg })); process.exit(2); }
const squash = ls => ls.join('').replace(/\s+/g, '').toUpperCase();
const money = ls => ls.join('\n').match(/[+-]?\$[\d,]+(?:\.\d+)?/g) || [];
const names = ls => { const out = []; const re = new RegExp('(' + NAMES.map(n => n.replace(' ', '\\s')).join('|') + ')', 'g'); ls.forEach(l => { let m; while ((m = re.exec(l))) out.push(m[1]); }); return out; };

(async () => {
    const problems = [];
    const a = await arriveCold({ url: fileUrl('settlement.html', 'game=RA'), db: { events: { RA: R[0].data } }, expression: RECEIPT, settleMs: 4000 });
    if (!a.ok) bail('settlement: ' + a.reason);
    const r = JSON.parse(a.value);
    if (r.lines.length === 0) bail('the receipt rendered no lines - nothing was measured');
    // The old read gives 26 lines on this round (one card per line); the live read gives 146.
    if (r.lines.length < 100) problems.push('receipt: only ' + r.lines.length + ' lines - the cards are run together again (the fixture, the old read, has ' + PREV.receipt.length + ')');

    // THE SAME CHARACTERS, IN THE SAME ORDER: whitespace removed, case folded (the
    // screen's text-transform uppercases headers), the two streams are identical.
    if (squash(r.lines) !== squash(PREV.receipt)) {
        let i = 0; const A = squash(PREV.receipt), B = squash(r.lines); while (A[i] === B[i]) i++;
        problems.push('receipt: the character stream differs from the fixture at ' + i + ': before …' + A.slice(i - 20, i + 40) + ' | after …' + B.slice(i - 20, i + 40));
    }
    if (JSON.stringify(names(r.lines)) !== JSON.stringify(names(PREV.receipt))) problems.push('receipt: the name sequence moved');
    // Money: the fixture's glue corrupts its own tokens ("$701st"), so the money
    // sequence is held as the literal list read off the page.
    const m = money(r.lines);
    let at = 0; const A = squash(PREV.receipt);
    m.forEach(tok => { const j = A.indexOf(tok, at); if (j < 0) problems.push('receipt: amount ' + tok + ' is not in the old text after position ' + at); else at = j + tok.length; });
    if (m.length !== 85 || m[0] !== '$50' || m[m.length - 1] !== '$10') problems.push('receipt: money tokens ' + m.length + ' [' + m.slice(0, 3) + ' … ' + m.slice(-2) + ']');
    ['Marty  $310', 'T2 · Jeremy  $3', 'Marty  +$285 NET', 'TOTAL PAYOUT  +$375', 'Randy → Marty  $37', 'Original Bet  $50', 'Birdie  Eagle or better  net rows show the score after handicap strokes']
        .forEach(l => { if (!r.lines.includes(l)) problems.push('receipt: one-line row missing: ' + JSON.stringify(l)); });
    if (!/^HOLE  1  2  3/.test(r.lines.find(l => /^HOLE/.test(l)) || '')) problems.push('receipt: the scorecard row is not spaced');
    if (r.lines.some(l => /^\s+\S/.test(l))) problems.push('receipt: leading whitespace survives on ' + r.lines.filter(l => /^\s+\S/.test(l)).length + ' lines');
    if (!r.live) problems.push('receipt: the live read did not happen (clone fallback ran)');
    if (!r.rawHasButton) problems.push('receipt: the button text was not in the rendered text at all - the exclusion was not exercised');
    if (r.lines.some(l => /Print \/ Save/.test(l))) problems.push('receipt: a button row leaked into the PDF');
    if (!r.dropKeys.some(k => /Print \/ Save Receipt/.test(k))) problems.push('receipt: the button text is not in the drop set: ' + JSON.stringify(r.dropKeys));
    if (r.pageRows.some(n => n > 54)) problems.push('receipt: a page holds more than 54 rows: ' + JSON.stringify(r.pageRows));
    // rows = title + blank + every line, plus one row per wrap of a line over 92 chars
    const long = r.lines.filter(l => l.length > 92).length, rows = r.pageRows.reduce((s, n) => s + n, 0);
    if (rows < r.lines.length + 2 || rows > r.lines.length + 2 + long * 3) problems.push('receipt: rows on pages ' + JSON.stringify(r.pageRows) + ' vs lines ' + r.lines.length + ' (+2, +wraps of ' + long + ' long lines)');

    const db = { trips: { TRIP1: { name: 'Myrtle Beach 2026', createdAt: 1, rounds: { RA: { label: 'Day 1', addedAt: 1 }, RB: { label: 'Day 2', addedAt: 2 } } } }, events: { RA: R[0].data, RB: R[1].data } };
    const t = await arriveCold({ url: fileUrl('trip.html', 'trip=TRIP1'), db, preScript: STUB, steps: [{ expression: TRIP_CLICK }, { sleep: 800 }, { expression: TRIP_READ }], settleMs: 4000 });
    if (!t.ok) bail('trip: ' + t.reason);
    const tr = JSON.parse(t.value[2]);
    if (t.value[0] !== 'clicked' || tr.printed !== 1) bail('trip: the itinerary button did not print (' + t.value[0] + ', printed ' + tr.printed + ')');
    if (tr.display !== 'none' || tr.live !== false) problems.push('trip: the itinerary view is ' + tr.display + ' on screen and live=' + tr.live + ' - the fallback expectation changed');
    if (JSON.stringify(tr.lines) !== JSON.stringify(PREV.trip)) problems.push('trip: lines differ from the fixture (the clone fallback should be byte-identical)');

    console.log(JSON.stringify({ result: problems.length ? 'FAIL' : 'PASS', problems, receipt: { lines: r.lines.length, pdfBytes: r.pdfBytes, pageRows: r.pageRows, before: { lines: PREV.receipt.length, pdfBytes: PREV.receiptPdfBytes } }, trip: { lines: tr.lines.length, display: tr.display, live: tr.live } }, null, 1));
    process.exit(problems.length ? 1 : 0);
})().catch(e => bail(String(e && e.stack || e)));
