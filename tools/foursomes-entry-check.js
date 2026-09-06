#!/usr/bin/env node
// ============================================================================
// CAN A GOLFER ACTUALLY ENTER AN ALTERNATE-SHOT SCORE?
//
// Phase 5 built the whole Foursomes team-entry feature and never wired it into a
// render path. It was unreachable for the life of the feature while 590 lines of
// tests passed, because the wiring tests asserted that a STRING appeared in
// index.html - and that string lived inside the dead function's own markup.
//
// ryder_foursomes_entry_test.js now renders Hole View and proves the card
// appears. Two guarantees are beyond it, and they are why this tool exists:
//
//   1. THE CARD SITS BETWEEN THE PER-GOLFER BOXES AND PREV/NEXT.
//      mini-dom stores innerHTML as a string, so the Full Card <tr> has no child
//      nodes and renderHoleView emits no hv-player-row at all there. The node
//      suite can only place the card between the hole heading and the nav row.
//
//   2. INDIVIDUAL ENTRY SURVIVES.
//      This wave ADDS the card rather than replacing the per-golfer boxes. With
//      no player rows in the harness, a control that deleted them was invisible -
//      it passed the whole suite. Only a real browser can see that they are still
//      there.
//
//   node tools/foursomes-entry-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which guarantee broke
//   exit 2   could not run (Chrome missing, page threw). NOTHING WAS PROVEN.
//
// An exit of 2 is not a pass. Chrome is CHROME_PATH if set, else the macOS default.
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9371);
const REPO_ROOT = path.join(__dirname, '..');
const PAGE = 'file://' + path.join(REPO_ROOT, 'index.html') + '?game=FSCHECK';
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'foursomes-'));

const SCRIPT = `
(() => {
  const out = {};
  const CD = [];
  for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
  const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
    { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];
  const scores = {};
  PLAYERS.forEach(p => CD.forEach(h => {
    if (h.hole === 5) return;                 // land on hole 5, not hole 1
    scores['p' + p.id + '_h' + h.hole] = 4;
  }));

  currentMode = 'FSCHECK';
  currentData = {
    gameFormat: 'stroke', players: PLAYERS, courseData: CD, scores: scores,
    ryderCupRef: { host: 'FSCHECK', sessionId: 's9' },
    ryderCup: {
      v: 1, name: 'Device Check Cup',
      sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
      members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
      sessions: { s9: { id: 's9', day: 1, order: 1, format: 'foursomes', label: 'Day 1' } },
      matches: { m1: { id: 'm1', sessionId: 's9', format: 'foursomes', scoring: 'scratch',
        sideA: 'A', sideB: 'B', playersA: ['101','102'], playersB: ['103','104'] } }
    }
  };
  renderScorecard();
  setViewMode('hole');

  const card = document.querySelector('#hole-view-card .fs-card');
  out.cardPresent = !!card;
  if (!card) { out.verdict = 'FAIL'; out.why = 'no alternate-shot card rendered';
               return JSON.stringify(out, null, 2); }

  // 1. It has to be VISIBLE, not merely present - the D1 lesson.
  const r = card.getBoundingClientRect();
  out.cardBox = { w: Math.round(r.width), h: Math.round(r.height),
                  rects: card.getClientRects().length };

  // 2. One box per SIDE.
  const boxes = card.querySelectorAll('.fs-in');
  out.sideBoxes = boxes.length;

  // 3. GUARANTEE THE NODE SUITE CANNOT CHECK: individual entry survives.
  const rows = document.querySelectorAll('#hole-view-card .hv-player-row');
  out.playerRows = rows.length;

  // 4. GUARANTEE THE NODE SUITE CANNOT CHECK: the card sits between the
  //    per-golfer boxes and Prev/Next.
  const host = document.getElementById('hole-view-card');
  const kids = Array.from(host.querySelectorAll('*'));
  const idxOf = el => kids.indexOf(el);
  const lastRow = rows.length ? idxOf(rows[rows.length - 1]) : -1;
  const nav = host.querySelector('.hole-view-nav-row');
  out.order = { lastPlayerRow: lastRow, card: idxOf(card), nav: nav ? idxOf(nav) : -1 };

  // 5. The box is bound to the hole on screen.
  out.holeOnScreen = currentViewedHole;
  out.writesToHole = (boxes[0].getAttribute('onchange') || '')
      .replace(/.*','[AB]',(\\d+).*/, '$1');

  const problems = [];
  if (out.cardBox.w <= 0 || out.cardBox.h <= 0 || out.cardBox.rects === 0)
      problems.push('the card is present but has no geometry');
  if (out.sideBoxes !== 2) problems.push('expected 2 side boxes, got ' + out.sideBoxes);
  if (out.playerRows !== PLAYERS.length)
      problems.push('individual entry was removed: ' + out.playerRows + ' player rows');
  if (!(lastRow < out.order.card))
      problems.push('the card is above the per-golfer boxes');
  if (!(out.order.card < out.order.nav))
      problems.push('the card is below Prev/Next');
  if (String(out.writesToHole) !== String(out.holeOnScreen))
      problems.push('the box writes to hole ' + out.writesToHole
                    + ' while hole ' + out.holeOnScreen + ' is on screen');

  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

function rpc(ws, id, method, params) {
    return new Promise(res => {
        const h = ev => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', h); res(m); } };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function bail(msg) {
    console.error('foursomes-entry-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    if (!fs.existsSync(CHROME)) bail('Chrome not found at ' + CHROME + ' (set CHROME_PATH)');
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
        '--window-size=390,844', '--allow-file-access-from-files', PAGE], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
            targets = list.filter(t => t.type === 'page'
                && (t.url.startsWith('file://') || t.url.startsWith('http')));
            if (targets.length) break;
        } catch (e) { /* not up yet */ }
    }
    if (!targets || !targets.length) { chrome.kill(); bail('Chrome exposed no page target'); }

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    await new Promise(r => setTimeout(r, 2500));

    const m = await rpc(ws, 1, 'Runtime.evaluate', { expression: SCRIPT, returnByValue: true });
    let code = 0;
    if (m.result && m.result.exceptionDetails) {
        const ex = m.result.exceptionDetails.exception;
        console.error('page threw: ' + JSON.stringify(ex && ex.description));
        code = 2;
    } else {
        const raw = m.result.result.value;
        console.log(raw);
        try { code = JSON.parse(raw).verdict === 'PASS' ? 0 : 1; } catch (e) { code = 2; }
    }
    ws.close(); chrome.kill();
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
    process.exit(code);
})();
