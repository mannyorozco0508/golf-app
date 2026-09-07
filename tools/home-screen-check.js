#!/usr/bin/env node
// ============================================================================
// WHAT THE HOME SCREEN ACTUALLY LOOKS LIKE
//
// ARRIVES COLD at admin.html with a resume pointer already in localStorage, the
// way a returning golfer's phone does. The page loads its own scripts, runs its
// own init and renders whatever it renders. Nothing is invoked from outside.
//
// THIS EXISTS BECAUSE MINI-DOM CANNOT SEE THE BUG. The resume control rendered as
// "ResumeJLRL4H" with no space, while the markup was already correct:
//
//     <a class="resume-link">▶️ Resume <span id="resume-room-badge"></span></a>
//
// .resume-link is display:inline-flex, so the label and the badge are flex items
// and flex layout DROPS the anonymous whitespace between them. There is no layout
// in mini-dom - getBoundingClientRect returns zeros - so no unit test can tell
// "Resume ABC" from "ResumeABC". The gap is measured here, in Chrome, using a
// Range around the label's own text node.
//
// It also measures what the wave before it changed: the mark must lead the
// screen, the wordmark must not out-measure it, and nothing may ask for a typed
// code. Those are rendered sizes, not declared ones.
//
//   node tools/home-screen-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON lists which guarantee broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// A returning phone: it already holds a pointer, so Resume is on screen.
const SEED = `try { localStorage.setItem('lastRoomCode', 'JLRL4H'); } catch (e) {}`;

const PROBE = `
(() => {
  const out = {};
  const box = document.getElementById('resume-container');
  const link = document.querySelector('.resume-link');
  const badge = document.getElementById('resume-room-badge');
  out.resumeShown = !!(box && box.getClientRects().length > 0);
  out.badgeText = badge ? (badge.textContent || '').trim() : null;

  // THE GAP, MEASURED. A Range around the label's own text node gives its real
  // right edge; the badge's left edge is measured the same way. This is the
  // assertion mini-dom cannot make.
  if (link && badge) {
    const label = Array.from(link.childNodes)
        .find(n => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
    if (label) {
      const r = document.createRange();
      r.selectNodeContents(label);
      const labelRect = r.getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();
      out.labelText = (label.textContent || '').trim();
      out.gapPx = Math.round((badgeRect.left - labelRect.right) * 10) / 10;
    }
    out.renderedText = (link.textContent || '').replace(/\\s+/g, ' ').trim();
    out.linkHeightPx = Math.round(link.getBoundingClientRect().height);
  }

  // The mark leads. Rendered, not declared.
  const mark = document.querySelector('.lobby-mark');
  const sym = document.querySelector('.lobby-mark img');
  const word = document.querySelector('.lobby-title');
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : 0;
  const w = el => el ? Math.round(el.getBoundingClientRect().width) : 0;
  out.markPx = w(mark);
  out.symbolPx = w(sym);
  out.wordmarkPx = h(word);
  out.wordmarkText = word ? (word.textContent || '').trim() : null;

  // Nothing on THIS screen asks for a typed code. Scoped to the lobby: the setup
  // wizard lives in the same document behind display:none and has plenty of legal
  // inputs (course search, new course name, KP holes). Counting those said the home
  // screen was asking for a code when it was not - the probe was wrong, not the page.
  const lobby = document.getElementById('lobby-screen');
  out.textInputs = lobby
      ? Array.from(lobby.querySelectorAll('input[type="text"]'))
          .map(i => i.id || i.placeholder || '(unnamed)')
      : ['(no lobby screen at all)'];
  out.tiles = Array.from(document.querySelectorAll('.home-widget'))
      .map(b => (b.querySelector('.hw-name') || {}).textContent || '?');

  const problems = [];
  if (!out.resumeShown) problems.push('a phone holding a resume pointer is offered nothing');
  if (out.badgeText !== 'JLRL4H') problems.push('the resume control does not name the round: '
      + JSON.stringify(out.badgeText));
  if (!(out.gapPx > 1)) problems.push('the resume label and the round code run together - '
      + 'gap is ' + out.gapPx + 'px, rendering as ' + JSON.stringify(out.renderedText));
  if (!/Resume JLRL4H/.test(out.renderedText || ''))
      problems.push('the resume control reads ' + JSON.stringify(out.renderedText));
  if (out.linkHeightPx < 40) problems.push('the resume control is '
      + out.linkHeightPx + 'px tall, below a usable touch target');

  if (!(out.markPx > out.wordmarkPx)) problems.push('the wordmark (' + out.wordmarkPx
      + 'px) is not led by the mark (' + out.markPx + 'px)');
  if (!(out.symbolPx > 0 && out.symbolPx < out.markPx))
      problems.push('the symbol does not sit inside its disc');
  if (!out.wordmarkText) problems.push('the wordmark is gone - a symbol alone names nothing');

  if (out.textInputs.length > 0)
      problems.push('the home screen asks for something to be typed: '
          + JSON.stringify(out.textInputs));
  if (out.tiles.length !== 2)
      problems.push('expected two tiles, found ' + JSON.stringify(out.tiles));

  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

function bail(msg) {
    console.error('home-screen-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const res = await arriveCold({
        url: fileUrl('admin.html'), rounds: {}, preScript: SEED, expression: PROBE
    });
    if (!res.ok) bail(res.reason);
    console.log(res.value);
    let v;
    try { v = JSON.parse(res.value); } catch (e) { bail('unreadable probe output'); }
    process.exit(v.verdict === 'PASS' ? 0 : 1);
})();
