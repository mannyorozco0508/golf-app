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

  // The header is the ball icon plus the HTML word. The word used to live
  // inside hardpan-lockup.svg, condensed and stroked, so a phone read bars.
  // This measures the rendered word: real text, open tracking, on the bar.
  const lock = document.querySelector('.lobby-lockup');
  const img = lock ? lock.querySelector('img') : null;
  const word = lock ? lock.querySelector('.lobby-word') : null;
  const lr = lock ? lock.getBoundingClientRect() : null;
  let green = false, bone = false;
  if (img && img.naturalWidth > 0) {
      try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const data = g.getImageData(0, 0, c.width, c.height).data;
          for (let i = 0; i < data.length; i += 16) {
              const R = data[i], G = data[i + 1], B = data[i + 2];
              if (R > 30 && R < 70 && G > 100 && G < 150 && B > 50 && B < 100) green = true;
              if (R > 220 && G > 210 && B > 200) bone = true;
          }
      } catch (e) { out.lockupDrawError = String(e); }
  }
  const letters = [];
  if (word && word.firstChild && word.firstChild.nodeType === 3) {
      const node = word.firstChild;
      const text = node.textContent || '';
      for (let i = 0; i < text.length; i++) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const b = range.getBoundingClientRect();
          letters.push({ ch: text[i], w: Math.round(b.width * 10) / 10, left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 });
      }
  }
  const wcs = word ? getComputedStyle(word) : null;
  const wr = word ? word.getBoundingClientRect() : null;
  const ir = img ? img.getBoundingClientRect() : null;
  out.lockup = {
      w: lr ? Math.round(lr.width) : 0,
      h: lr ? Math.round(lr.height) : 0,
      alt: img ? img.alt : null,
      src: img ? img.getAttribute('src') : null,
      natural: img ? img.naturalWidth : 0,
      bg: lock ? getComputedStyle(lock).backgroundColor : null,
      green: green, bone: bone
  };
  out.word = word ? {
      text: (word.innerText || '').trim(),
      w: wr ? Math.round(wr.width) : 0,
      h: wr ? Math.round(wr.height) : 0,
      fs: wcs ? parseFloat(wcs.fontSize) : 0,
      ls: wcs ? wcs.letterSpacing : null,
      fw: wcs ? wcs.fontWeight : null,
      color: wcs ? wcs.color : null,
      letters: letters,
      sameRow: !!(ir && wr && Math.abs((ir.top + ir.height / 2) - (wr.top + wr.height / 2)) < 20 && wr.left >= ir.right - 8),
      inside: !!(lr && wr && wr.left >= lr.left - 1 && wr.right <= lr.right + 1)
  } : null;
  const card = document.getElementById('email-link-card');
  const title = document.getElementById('email-link-title');
  out.email = {
      shown: !!(card && card.getClientRects().length > 0),
      title: title ? (title.innerText || '').trim() : null
  };

  // EXACTLY ONE THING IS ASKED FOR, and it is the game code. Scoped to the lobby:
  // the setup wizard lives in the same document behind display:none and has plenty
  // of legal inputs (course search, new course name, KP holes). Counting those said
  // the home screen was asking for a code when it was not - the probe was wrong, not
  // the page.
  //
  // v68 removed the code field entirely and this asserted zero. v77 brought it back
  // in a smaller shape, so the assertion is now about the SHAPE: one field, on one
  // row with its button, both a real touch target, and not the full-width pair that
  // competed with the two tiles.
  const lobby = document.getElementById('lobby-screen');
  out.textInputs = lobby
      ? Array.from(lobby.querySelectorAll('input[type="text"]'))
          .map(i => i.id || i.placeholder || '(unnamed)')
      : ['(no lobby screen at all)'];
  const codeInput = document.getElementById('join-code-input');
  const codeRow = document.getElementById('join-code-row');
  const codeBtn = codeRow ? codeRow.querySelector('button') : null;
  const r = el => el ? el.getBoundingClientRect() : null;
  const ri = r(codeInput), rb = r(codeBtn);
  out.code = {
      onScreen: !!(codeRow && codeRow.getClientRects().length > 0),
      inputH: ri ? Math.round(ri.height) : 0,
      btnH: rb ? Math.round(rb.height) : 0,
      sameRow: !!(ri && rb && Math.abs(ri.top - rb.top) < 12),
      inputW: ri ? Math.round(ri.width) : 0,
      pageW: Math.round(document.documentElement.clientWidth),
      noteOnScreen: !!(document.getElementById('join-code-note')
          && document.getElementById('join-code-note').getClientRects().length > 0)
  };
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

  if (!(out.lockup && out.lockup.w >= 240 && out.lockup.h >= 56))
      problems.push('the header is not a wide bar on screen: ' + JSON.stringify(out.lockup));
  if (!out.lockup || out.lockup.alt !== '' || out.lockup.src !== 'hardpan-icon.svg')
      problems.push('the header img is not the ball icon: ' + JSON.stringify(out.lockup));
  if (!(out.lockup && out.lockup.natural > 0))
      problems.push('the ball icon did not decode');
  if (!(out.lockup && out.lockup.green && out.lockup.bone))
      problems.push('the ball icon pixels are not green and bone: ' + JSON.stringify(out.lockup));
  if (!out.lockup || out.lockup.bg !== 'rgb(11, 15, 12)')
      problems.push('the header field is not near-black #0B0F0C: ' + (out.lockup && out.lockup.bg));
  if (!out.word || out.word.text !== 'HARDPAN')
      problems.push('the header word is not the HTML text HARDPAN: ' + JSON.stringify(out.word));
  if (!(out.word && out.word.w >= 110 && out.word.h >= 18))
      problems.push('the word is too small to read: ' + JSON.stringify(out.word));
  const lsPx = out.word && out.word.ls != null ? parseFloat(out.word.ls) : NaN;
  if (!(out.word && lsPx > 0))
      problems.push('the word tracking is not open: ' + (out.word && out.word.ls));
  if (!(out.word && Number(out.word.fw) >= 700))
      problems.push('the word is not bold: ' + (out.word && out.word.fw));
  if (!out.word || out.word.color !== 'rgb(242, 237, 228)')
      problems.push('the word is not bone on the bar: ' + (out.word && out.word.color));
  if (!out.word || !out.word.sameRow || !out.word.inside)
      problems.push('the word is not beside the ball, inside the bar: ' + JSON.stringify(out.word));
  const widths = (out.word && out.word.letters || []).map(l => l.w);
  const avg = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
  if (widths.length !== 7 || widths.some(w => w < 8) || !(out.word && avg >= out.word.fs * 0.5))
      problems.push('the letters are still condensed bars: ' + JSON.stringify(out.word && out.word.letters));
  for (let i = 1; i < (out.word && out.word.letters || []).length; i++) {
      const prev = out.word.letters[i - 1], cur = out.word.letters[i];
      if (cur.left < prev.right - 0.6)
          problems.push('letters overlap: ' + prev.ch + ' ends ' + prev.right + ', ' + cur.ch + ' starts ' + cur.left);
  }
  if (!out.email || !out.email.shown || out.email.title !== 'Keep this organizer')
      problems.push('the email-link card is not on the home screen: ' + JSON.stringify(out.email));

  // RE-PINNED 2026-09-20. The lobby asks for TWO typed things, deliberately: the
  // game code (Open) and the code of a previous round to start from - the copy
  // field came back on purpose (admin.html #copy-code-row, "the one place the
  // prefill admin.html?game=NEW&copyFrom=OLD is emitted from"). This check kept
  // the older rule, "the game code and nothing else", and had been red since the
  // field returned. Exactly these two, in this order, and no third.
  // RE-PINNED 2026-09-23. The email-link paste field is a third text input,
  // ahead of the two round-code fields. The sign-in email is type=email and
  // is checked separately above.
  if (out.textInputs.length !== 3 || out.textInputs[0] !== 'email-link-paste'
      || out.textInputs[1] !== 'join-code-input' || out.textInputs[2] !== 'copy-code-input')
      problems.push('the lobby asks for ' + out.textInputs.length + ' typed things: '
          + JSON.stringify(out.textInputs) + ' - it should ask for the pasted sign-in '
          + 'link, the game code, and the code of a round to start from');
  if (!out.code.onScreen) problems.push('the game-code row is not on screen');
  if (out.code.inputH < 44) problems.push('the code field is ' + out.code.inputH
      + 'px tall, below a usable touch target');
  if (out.code.btnH < 44) problems.push('the code button is ' + out.code.btnH + 'px tall');
  if (!out.code.sameRow) problems.push('the code field and its button are stacked, '
      + 'not on one row - that is the full-width pair v68 removed');
  if (out.code.inputW >= out.code.pageW - 40)
      problems.push('the code field is full width again (' + out.code.inputW + 'px of '
          + out.code.pageW + ')');
  // THE OTHER DIRECTION, which the first draft of this could not see. A flex basis
  // of auto sized the field to its CONTENT, and an empty field has none: it rendered
  // 22px wide. "Not full width" was satisfied by a box nobody could type in.
  if (out.code.inputW < 120)
      problems.push('the code field is ' + out.code.inputW + 'px wide - too narrow to '
          + 'type a game code into');
  if (!out.code.noteOnScreen)
      problems.push('nothing on screen says what a typed code actually gives you');
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
