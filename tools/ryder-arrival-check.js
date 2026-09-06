#!/usr/bin/env node
// ============================================================================
// WHAT AN ORGANIZER SENT TO SET UP A CUP ACTUALLY LANDS ON
//
// Game Day creates the round and redirects to sidematches.html?setup=ryder.
// This arrives at that URL COLD - the page loads its own scripts, runs its own
// init, registers its own listener, and renders whatever it renders. Nothing is
// invoked from outside. Only the data source is replaced.
//
// That distinction is the whole point. The previous probe for this screen called
// renderRyderCupSetup() itself, so it measured a Cup that only existed because
// the probe had drawn it. Underneath, nothing on the page ever rendered the Cup:
// every renderRyderCupSetup() call sat inside an rc* handler fired by buttons
// that only exist inside the markup renderRyderCupSetup produces.
//
//   node tools/ryder-arrival-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON lists which guarantee broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
    { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];
const ROUNDS = { ARRIVE: { eventName: 'Arrival Check', players: PLAYERS, courseData: CD, scores: {} } };

const PROBE = `
(() => {
  const out = {};
  const cupMount = document.getElementById('ryder-cup-setup');
  const card = document.getElementById('sidematches-card');
  const y = el => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;

  // 1. The Cup must render WITHOUT anyone invoking it.
  out.cupRendered = !!(cupMount && cupMount.querySelector('.rcs-card'));
  out.cupTopPx = y(cupMount);
  out.cupHeightPx = cupMount ? Math.round(cupMount.getBoundingClientRect().height) : 0;

  // 2. It must not be inside, or below, the side-betting card.
  out.cupInsideSideCard = !!(card && cupMount && card.contains(cupMount));
  out.sideCardTopPx = y(card);
  out.cupAboveSideCard = (out.cupTopPx !== null && out.sideCardTopPx !== null)
      && out.cupTopPx < out.sideCardTopPx;

  // 3. Side action is REMOVED from this arrival - not collapsed - and the old
  //    banner is gone. A collapsed block still puts side betting on the screen.
  out.sideCardVisible = !!(card && card.getClientRects().length > 0
      && card.getBoundingClientRect().height > 0);
  out.oldBannerPresent = !!document.getElementById('ryder-handoff-banner');
  out.collapseMachineryPresent = !!document.getElementById('sm-block');

  // 4. The handoff sentence lives in the Cup card now.
  out.handoffCopyInCard = !!(cupMount && /Round created/.test(cupMount.innerHTML));

  // 5. The Cup is genuinely on screen, not merely present.
  out.cupVisible = !!(cupMount && cupMount.getClientRects().length > 0 && out.cupHeightPx > 0);
  out.cupAboveTheFold = out.cupTopPx !== null && out.cupTopPx < window.innerHeight;

  const problems = [];
  if (!out.cupRendered) problems.push('the Cup did not render - nothing on the page invokes it');
  if (!out.cupVisible) problems.push('the Cup rendered but has no geometry');
  if (out.cupInsideSideCard) problems.push('the Cup is nested inside the side-betting card');
  // Only meaningful while the card is on screen. Hidden, its rect is all zeros,
  // and "above it" compares against nothing - the guarantee on this arrival is
  // that the card is not there at all, which is asserted separately.
  if (out.sideCardVisible && !out.cupAboveSideCard)
      problems.push('the Cup renders below the side-betting card');
  if (out.sideCardVisible) problems.push('side betting is on the Cup arrival screen');
  if (out.collapseMachineryPresent) problems.push('the v61 collapse block is still here');
  if (out.oldBannerPresent) problems.push('the old handoff banner is still in the markup');
  if (!out.handoffCopyInCard) problems.push('the handoff sentence was not folded into the card');
  if (!out.cupAboveTheFold) problems.push('the Cup is not on the first screen');

  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

// An ORDINARY visit must be untouched.
const PROBE_PLAIN = `
(() => {
  const out = {};
  const cupMount = document.getElementById('ryder-cup-setup');
  out.sideCardVisible = !!(document.getElementById('sidematches-card')
      && document.getElementById('sidematches-card').getClientRects().length > 0);
  out.cupRendered = !!(cupMount && cupMount.querySelector('.rcs-card'));
  out.handoffCopyInCard = !!(cupMount && /Round created/.test(cupMount.innerHTML));
  const y = el => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  out.cupAboveSideCard = y(cupMount) !== null
      && y(document.getElementById('sidematches-card')) !== null
      && y(cupMount) < y(document.getElementById('sidematches-card'));
  const problems = [];
  if (!out.sideCardVisible) problems.push('an ordinary visit now hides the side action');
  if (!out.cupRendered) problems.push('the Cup surface stopped rendering on an ordinary visit');
  if (!out.cupAboveSideCard) problems.push('the Cup renders below the side-betting card');
  if (out.handoffCopyInCard) problems.push('an ordinary visit claims the round was just created');
  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

function bail(msg) {
    console.error('ryder-arrival-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const arrival = await arriveCold({
        url: fileUrl('sidematches.html', 'game=ARRIVE&setup=ryder'),
        rounds: ROUNDS, expression: PROBE
    });
    if (!arrival.ok) bail(arrival.reason);
    console.log('--- arriving at ?setup=ryder ---');
    console.log(arrival.value);

    const plain = await arriveCold({
        url: fileUrl('sidematches.html', 'game=ARRIVE'),
        rounds: ROUNDS, expression: PROBE_PLAIN
    });
    if (!plain.ok) bail(plain.reason);
    console.log('--- an ordinary visit to Matches ---');
    console.log(plain.value);

    let a, p;
    try { a = JSON.parse(arrival.value); p = JSON.parse(plain.value); }
    catch (e) { bail('unreadable probe output'); }
    process.exit((a.verdict === 'PASS' && p.verdict === 'PASS') ? 0 : 1);
})();
