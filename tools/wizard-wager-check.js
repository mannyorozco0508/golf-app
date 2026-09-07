#!/usr/bin/env node
// ============================================================================
// A BET YOU SET UP IS STILL THERE WHEN YOU SAVE, AND THE REVIEW SAYS SO
//
// TWO DEFECTS THAT HID EACH OTHER, and neither is visible outside a real browser.
//
//   B. Tick Nassau in the Games step, type the stakes, pick the two golfers, then
//      tap "◀ Back" once and walk forward again. The checkbox stays ticked. The
//      stakes stay typed. The two golfer dropdowns come back EMPTY, because
//      arriving at that step rewrites their container with innerHTML and a browser
//      resets a <select> when its markup is rewritten.
//      collectSetupNassauWager() returns null without a pairing, so the round saved
//      with no bet at all and said nothing about it.
//
//   C. And the Review step could not tell you, because it never mentioned side
//      matches. A configured Nassau and a broken one reviewed identically.
//
// WHY IT NEEDS CHROME. helpers/mini-dom.js keeps a <select>'s value when innerHTML
// is rewritten - CLAUDE.md records the limit - so under the unit harness the bug is
// structurally invisible. wizard_wager_survives_test.js models the reset explicitly
// at the moment of the rewrite; here nothing is modelled. This is the browser.
//
// THIS CHECK CALLS NO PAGE FUNCTION. It clicks the controls a golfer clicks -
// the Nassau checkbox, the two dropdowns, "◀ Back", "Next ▶" - and then reads what
// is on the screen. If the page does not do it on its own, it does not happen.
//
//   node tools/wizard-wager-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which step lost the bet
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Marty Sharp', 'Manny Orozco', 'Lance Webb', 'Zach Hill'];
const ROUND = {
    eventName: 'Wager Check', courseName: 'Caledonia',
    activeCourseKey: 'caledonia-check', gameFormat: 'stroke',
    players: NAMES.map((name, i) => ({ id: 101 + i, name: name, hcp: '0' })),
    courseData: CD, scores: {}
};

// A GOLFER'S HANDS, and nothing else. Every line below is a gesture: click, type,
// choose, tap Back, tap forward. No function defined by admin.html is named here.
const DRIVE = `
(() => {
  const out = { steps: [] };
  const $ = id => document.getElementById(id);
  const seen = () => ({ p1: ($('setup-nassau-p1') || {}).value || '',
                        p2: ($('setup-nassau-p2') || {}).value || '' });
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const tap = el => { if (el) el.click(); return !!el; };

  // Walk to the Games step the way the wizard walks: Next, from wherever the page
  // put us. A format may skip a step, so follow whatever Next is on screen.
  const activeStep = () => {
    const el = document.querySelector('.wizard-step.active');
    return el ? Number(el.getAttribute('data-step')) : null;
  };
  out.landedOn = activeStep();
  for (let i = 0; i < 12 && activeStep() !== 6; i++) {
    const n = activeStep();
    const back = n && n > 6;
    const btn = $((back ? 'wizard-back-' : 'wizard-next-') + n);
    if (!btn || btn.offsetParent === null) break;
    btn.click();
    if (activeStep() === n) break;   // went nowhere; stop rather than spin
  }
  out.reachedGamesStep = activeStep();
  if (activeStep() !== 6) { out.error = 'could not reach the Games step by tapping'; return JSON.stringify(out); }

  // Tick Nassau.
  const box = $('setup-nassau-enabled');
  if (!box) { out.error = 'no Nassau control on the Games step'; return JSON.stringify(out); }
  if (!box.checked) { box.click(); }
  out.nassauTicked = !!box.checked;

  // Type the stakes the way a thumb does.
  [['setup-nassau-front', '10'], ['setup-nassau-back', '10'], ['setup-nassau-overall', '20']]
    .forEach(([id, v]) => { const el = $(id); if (el) { el.value = v; fire(el, 'input'); } });

  // Choose the two golfers.
  const pick = (id, value) => {
    const sel = $(id);
    if (!sel) return false;
    sel.value = String(value);
    fire(sel, 'change');
    return sel.value === String(value);
  };
  out.picked = pick('setup-nassau-p1', 101) && pick('setup-nassau-p2', 102);
  out.afterPicking = seen();

  // ◀ BACK, once, and forward again. The single most ordinary thing an organizer
  // does: check the course, come back.
  out.tappedBack = tap($('wizard-back-6'));
  out.stepAfterBack = activeStep();
  const fwd = $('wizard-next-' + activeStep());
  out.tappedForward = tap(fwd);
  out.stepAfterForward = activeStep();
  out.afterBackAndForward = seen();

  // THREE more round trips, because a restore that works once and then forgets is
  // still a lost bet on the third visit.
  for (let i = 0; i < 3; i++) {
    const here = activeStep();
    const b = $('wizard-back-' + here); if (b) b.click();
    const f = $('wizard-next-' + activeStep()); if (f) f.click();
  }
  out.afterFourTrips = seen();

  // THE REVIEW, reached the way it is reached: keep tapping Next.
  for (let i = 0; i < 6 && activeStep() !== 7; i++) {
    const n = activeStep();
    const btn = $('wizard-next-' + n);
    if (!btn) break;
    btn.click();
    if (activeStep() === n) break;
  }
  out.reviewStep = activeStep();
  const summary = $('wizard-review-summary');
  // innerText, never textContent: the whole application lives in an inline
  // <script> on this page and textContent would match its source.
  out.reviewText = summary ? (summary.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  out.reviewOnScreen = !!(summary && summary.getClientRects().length > 0);
  return JSON.stringify(out);
})()`;

// The same drive, except the two golfers are never chosen. A ticked-but-unfinished
// Nassau must be reported as NOT saving rather than shown as a bet.
const DRIVE_INCOMPLETE = DRIVE
    .replace("out.picked = pick('setup-nassau-p1', 101) && pick('setup-nassau-p2', 102);",
             "out.picked = false;   // deliberately left unpicked");

function bail(msg) {
    console.error('wizard-wager-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const report = {};

    const r = await arriveCold({ url: fileUrl('admin.html', 'game=WAGER'),
        db: { events: { WAGER: ROUND } }, expression: DRIVE, settleMs: 4000 });
    if (!r.ok) bail('admin.html: ' + r.reason);
    let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
    report.configured = g;
    if (g.error) bail(g.error);

    // A RUN THAT NEVER SET THE BET UP PROVES NOTHING EITHER WAY.
    if (!g.nassauTicked) bail('the Nassau checkbox never went on - nothing was measured');
    if (!g.picked || !g.afterPicking.p1 || !g.afterPicking.p2) {
        bail('the two golfers were never chosen (' + JSON.stringify(g.afterPicking)
            + ') - the Back test below would pass on an empty bet');
    }
    if (!g.tappedBack || g.stepAfterBack === 6) {
        bail('"◀ Back" did not leave the Games step - the trip was not made');
    }
    if (g.stepAfterForward !== 6) {
        bail('walking forward did not return to the Games step (landed on '
            + g.stepAfterForward + ') - the return trip was not made');
    }

    // B.
    if (g.afterBackAndForward.p1 !== g.afterPicking.p1
        || g.afterBackAndForward.p2 !== g.afterPicking.p2) {
        problems.push('ONE TAP OF BACK EMPTIED THE BET: picked '
            + JSON.stringify(g.afterPicking) + ', came back to '
            + JSON.stringify(g.afterBackAndForward)
            + ' - the round would save with no wager at all');
    }
    if (g.afterFourTrips.p1 !== g.afterPicking.p1
        || g.afterFourTrips.p2 !== g.afterPicking.p2) {
        problems.push('the bet survived one trip but not four: '
            + JSON.stringify(g.afterFourTrips));
    }

    // C.
    if (g.reviewStep !== 7) problems.push('the Review step was never reached by tapping Next');
    if (!g.reviewOnScreen) problems.push('the review summary is not on screen');
    const said = g.reviewText || '';
    if (!/nassau/i.test(said)) {
        problems.push('THE REVIEW NEVER MENTIONS THE BET. It reads: ' + JSON.stringify(said));
    } else {
        if (!/\$10/.test(said) || !/\$20/.test(said)) {
            problems.push('the review names Nassau but not the stakes that will be '
                + 'written: ' + JSON.stringify(said));
        }
        if (!/Marty/.test(said) || !/Manny/.test(said)) {
            problems.push('the review does not say who the bet is between: '
                + JSON.stringify(said));
        }
    }

    // C, the other half: a bet that will NOT be saved must not review as one.
    const r2 = await arriveCold({ url: fileUrl('admin.html', 'game=WAGER'),
        db: { events: { WAGER: ROUND } }, expression: DRIVE_INCOMPLETE, settleMs: 4000 });
    if (!r2.ok) bail('admin.html (incomplete run): ' + r2.reason);
    let g2; try { g2 = JSON.parse(r2.value); } catch (e) { bail('unreadable probe output (incomplete)'); }
    report.incomplete = g2;
    if (!g2.nassauTicked) bail('the incomplete run never ticked Nassau - nothing was measured');
    if (g2.afterPicking.p1 && g2.afterPicking.p2) {
        bail('the incomplete run ended up with a complete pairing ('
            + JSON.stringify(g2.afterPicking) + ') - it measured the wrong thing');
    }
    const said2 = g2.reviewText || '';
    if (!/not|won’t|won't|pick/i.test(said2)) {
        problems.push('A NASSAU THAT WILL NOT BE SAVED reviews as though it were fine: '
            + JSON.stringify(said2));
    }
    if (/Nassau \$10/.test(said2)) {
        problems.push('the review quotes stakes for a bet that will not be written: '
            + JSON.stringify(said2));
    }

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
