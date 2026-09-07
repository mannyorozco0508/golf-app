#!/usr/bin/env node
// ============================================================================
// IS THE SETUP PAGE STILL SHAPED THE WAY IT SHOULD BE?
//
// THE LINK HALF OF THIS CHECK HAS MOVED. It used to arrive cold on admin.html,
// read the share card's sentence, then open the very link that sentence described
// and count the editable score inputs - failing if the two disagreed. That card is
// gone: sharing happens after Save now, on the Round Ready screen, where the round
// is real. tools/round-share-check.js does the same measurement there, against all
// thirteen links the app hands out.
//
// WHAT STAYS is what only a browser can see about this page's shape: that the
// control which WIPES A ROUND is quieter than the primary one, and that the page
// has a way back. Both are geometry, and mini-dom returns an all-zero rect.
//
//   node tools/round-setup-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which roster size disagreed
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + (i + 1), hcp: '0' }));
const roundOf = n => ({ eventName: 'Setup Check', gameFormat: 'stroke',
    players: roster(n), courseData: CD, scores: {} });

// The shape of the page, measured. innerText and real rects, never textContent -
// this page keeps its whole application in an inline <script>.
const SHAPE = `
(() => {
  const out = {};
  const px = el => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  const area = el => { if (!el) return 0; const r = el.getBoundingClientRect();
                       return Math.round(r.width * r.height); };
  const endBtn = Array.from(document.querySelectorAll('button'))
      .filter(b => /endAndClearRound\\(/.test(b.getAttribute('onclick') || ''))[0];
  const saveBtn = document.getElementById('main-save-btn');
  out.endFontPx = px(endBtn);
  out.saveFontPx = px(saveBtn);
  out.endAreaPx = area(endBtn);
  out.saveAreaPx = area(saveBtn);
  out.endHeightPx = endBtn ? Math.round(endBtn.getBoundingClientRect().height) : 0;
  out.endPresent = !!endBtn;
  const back = document.querySelector('.back-btn');
  out.backPresent = !!back;
  out.backHeightPx = back ? Math.round(back.getBoundingClientRect().height) : 0;

  // AND NOTHING THAT SHARES A ROUND MAY BE BACK ON THIS SCREEN. A link offered
  // before the round exists is the defect this page was cleaned of; if one
  // reappears here, two surfaces start describing the same thing again.
  out.strays = ['qrcode', 'share-link-note', 'group-links-box', 'group-links-list']
      .filter(id => !!document.getElementById(id));
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('round-setup-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];

    const db = { events: { SETUP: roundOf(4) } };
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=SETUP'),
        db: db, expression: SHAPE, settleMs: 3500 });
    if (!r.ok) bail('admin.html: ' + r.reason);
    const s = JSON.parse(r.value);
    const report = { shape: s };

    // A RUN THAT MEASURED NO GEOMETRY PROVES NOTHING. An all-zero rect is exactly
    // what a page that never rendered returns.
    if (!s.endPresent) bail('the End control is not on the page at all - nothing was measured');
    if (!s.saveFontPx) bail('the Save button reported no font size - the page did not render');
    if (!s.saveAreaPx) bail('the Save button reported no area - the page did not render');

    if (!(s.endFontPx < s.saveFontPx))
        problems.push('End (' + s.endFontPx + 'px) is not quieter than Save ('
            + s.saveFontPx + 'px)');
    if (!(s.endAreaPx < s.saveAreaPx))
        problems.push('End occupies ' + s.endAreaPx + 'px2 against Save\'s '
            + s.saveAreaPx + 'px2 - the destructive control is still the bigger one');
    if (s.endHeightPx < 40)
        problems.push('the End control is ' + s.endHeightPx + 'px tall, below a usable '
            + 'touch target - quiet is not the same as unhittable');
    if (!s.backPresent) problems.push('the page has no way back');
    if (s.backHeightPx < 40)
        problems.push('the back control is ' + s.backHeightPx + 'px tall');
    if (s.strays.length)
        problems.push('a share surface is back on the setup screen: ' + s.strays.join(', ')
            + ' - sharing belongs after Save, see tools/round-share-check.js');

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
