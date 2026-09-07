#!/usr/bin/env node
// ============================================================================
// DOES THE SETUP PAGE TELL THE TRUTH ABOUT ITS OWN LINK?
//
// This is the check the wave exists for, and it is deliberately not a check that
// the sentence matches a group count. A group count is a PROXY. The claim the
// card makes is about what the link PERMITS, so this measures that directly:
//
//   1. arrive cold on admin.html with a roster of N and read the sentence
//   2. arrive cold on index.html?game=CODE - the very link the card is describing,
//      no &group= - and COUNT THE EDITABLE SCORE INPUTS
//   3. fail if they disagree
//
// So if index.html's gate ever moves off players.length > 4, this goes red and the
// copy has to catch up. The old sentence claimed "read-only" unconditionally and
// was false on every foursome - which is most of this group's golf - and nearly
// got the card deleted as the wrong link. Deleting it would have left a four-ball
// with no way to share a round at all.
//
// It also measures the two things mini-dom cannot see about the page's shape: that
// the destructive control is quieter than the primary one, and that the page has a
// way back.
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

// What the setup page SAYS. Read as rendered text, never textContent - the page
// keeps its whole application in an inline <script>, and textContent would match
// this very copy in the source and report it rendered when nothing had.
const SAYS = `
(() => {
  const el = document.getElementById('share-link-note');
  const out = { note: el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null };
  out.noteOnScreen = !!(el && el.getClientRects().length > 0);
  out.qrPresent = !!document.querySelector('#qrcode img, #qrcode canvas');
  out.groupBoxShown = (() => {
    const b = document.getElementById('group-links-box');
    return !!(b && b.getClientRects().length > 0);
  })();

  // Shape: the destructive control must be quieter than the primary one.
  const px = el2 => el2 ? parseFloat(getComputedStyle(el2).fontSize) : 0;
  const area = el2 => { if (!el2) return 0; const r = el2.getBoundingClientRect();
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
  return JSON.stringify(out);
})()`;

// What the link the card describes ACTUALLY PERMITS.
const PERMITS = `
(() => {
  const inputs = Array.from(document.querySelectorAll('input.score-input, input[type="number"], input[inputmode="numeric"]'));
  return JSON.stringify({
    scoreInputs: inputs.length,
    editable: inputs.filter(i => !i.disabled && !i.readOnly).length
  });
})()`;

function bail(msg) {
    console.error('round-setup-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const SIZES = [2, 4, 5, 8];

(async () => {
    const problems = [];
    const report = { sizes: {} };

    for (const n of SIZES) {
        const db = { events: { SETUP: roundOf(n) } };
        const said = await arriveCold({ url: fileUrl('admin.html', 'game=SETUP'),
            db: db, expression: SAYS, settleMs: 3500 });
        if (!said.ok) bail('admin.html at ' + n + ': ' + said.reason);
        const permits = await arriveCold({ url: fileUrl('index.html', 'game=SETUP'),
            db: db, expression: PERMITS, settleMs: 3500 });
        if (!permits.ok) bail('index.html at ' + n + ': ' + permits.reason);

        const s = JSON.parse(said.value), p = JSON.parse(permits.value);
        report.sizes[n] = { says: s.note, editable: p.editable, of: p.scoreInputs,
                            groupBoxShown: s.groupBoxShown };

        if (!s.note) { problems.push(n + ' golfers: the card says nothing at all'); continue; }
        if (!s.noteOnScreen) problems.push(n + ' golfers: the sentence is not on screen');
        if (p.scoreInputs === 0) {
            problems.push(n + ' golfers: the scorecard rendered no score inputs, so '
                + 'nothing was measured - this proves nothing either way');
            continue;
        }

        // THE ASSERTION THIS TOOL EXISTS FOR.
        const writable = p.editable > 0;
        const claimsWritable = /scorekeeper/i.test(s.note);
        const claimsReadOnly = /read-only/i.test(s.note);
        if (writable && !claimsWritable) {
            problems.push(n + ' golfers: the link is WRITABLE (' + p.editable + '/'
                + p.scoreInputs + ' inputs editable) but the card says '
                + JSON.stringify(s.note));
        }
        if (!writable && !claimsReadOnly) {
            problems.push(n + ' golfers: the link is READ-ONLY (0/' + p.scoreInputs
                + ' editable) but the card says ' + JSON.stringify(s.note));
        }
        if (writable && claimsReadOnly) {
            problems.push(n + ' golfers: the card calls a writable link read-only');
        }
        // A read-only link must send them somewhere useful.
        if (!writable && !s.groupBoxShown) {
            problems.push(n + ' golfers: the link is read-only and the group links '
                + 'box is not on screen - the organizer is told to use a link that '
                + 'does not exist');
        }
        // And the only link a small round has must still be there.
        if (writable && !s.qrPresent) {
            problems.push(n + ' golfers: the QR is gone, and this is the only link '
                + 'a round this size has');
        }

        if (n === SIZES[0]) {
            report.shape = { endFontPx: s.endFontPx, saveFontPx: s.saveFontPx,
                endAreaPx: s.endAreaPx, saveAreaPx: s.saveAreaPx,
                endHeightPx: s.endHeightPx, backHeightPx: s.backHeightPx };
            if (!s.endPresent) problems.push('the End control is gone entirely');
            if (!(s.endFontPx < s.saveFontPx))
                problems.push('End (' + s.endFontPx + 'px) is not quieter than Save ('
                    + s.saveFontPx + 'px)');
            if (!(s.endAreaPx < s.saveAreaPx))
                problems.push('End occupies ' + s.endAreaPx + 'px2 against Save\'s '
                    + s.saveAreaPx + 'px2 - the destructive control is still the bigger one');
            if (s.endHeightPx < 40)
                problems.push('the End control is ' + s.endHeightPx + 'px tall, below a '
                    + 'usable touch target - quiet is not the same as unhittable');
            if (!s.backPresent) problems.push('the page has no way back');
            if (s.backHeightPx < 40)
                problems.push('the back control is ' + s.backHeightPx + 'px tall');
        }
    }

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
