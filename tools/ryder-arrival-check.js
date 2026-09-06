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
  const block = document.getElementById('sm-block');
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

  // 3. Side action collapses on this arrival, and the old banner is gone.
  out.sideBlockOpen = block ? block.open : null;
  out.oldBannerPresent = !!document.getElementById('ryder-handoff-banner');
  out.storedBlockState = sessionStorage.getItem('sm-block-open:ARRIVE');

  // 4. The handoff sentence lives in the Cup card now.
  out.handoffCopyInCard = !!(cupMount && /Round created/.test(cupMount.innerHTML));

  // 5. The Cup is genuinely on screen, not merely present.
  out.cupVisible = !!(cupMount && cupMount.getClientRects().length > 0 && out.cupHeightPx > 0);
  out.cupAboveTheFold = out.cupTopPx !== null && out.cupTopPx < window.innerHeight;

  const problems = [];
  if (!out.cupRendered) problems.push('the Cup did not render - nothing on the page invokes it');
  if (!out.cupVisible) problems.push('the Cup rendered but has no geometry');
  if (out.cupInsideSideCard) problems.push('the Cup is nested inside the side-betting card');
  if (!out.cupAboveSideCard) problems.push('the Cup renders below the side-betting card');
  if (out.sideBlockOpen !== false) problems.push('side action did not collapse on arrival');
  if (out.oldBannerPresent) problems.push('the old handoff banner is still in the markup');
  if (!out.handoffCopyInCard) problems.push('the handoff sentence was not folded into the card');
  if (!out.cupAboveTheFold) problems.push('the Cup is not on the first screen');
  if (out.storedBlockState !== 'false')
      problems.push('the collapsed state was not remembered (got ' + out.storedBlockState + ')');

  out.problems = problems;
  out.verdict = problems.length ? 'FAIL' : 'PASS';
  return JSON.stringify(out, null, 2);
})()`;

// An ORDINARY visit must be untouched.
const PROBE_PLAIN = `
(() => {
  const out = {};
  const block = document.getElementById('sm-block');
  const cupMount = document.getElementById('ryder-cup-setup');
  out.sideBlockOpen = block ? block.open : null;
  out.cupRendered = !!(cupMount && cupMount.querySelector('.rcs-card'));
  out.storedBlockState = sessionStorage.getItem('sm-block-open:ARRIVE');
  out.handoffCopyInCard = !!(cupMount && /Round created/.test(cupMount.innerHTML));
  const problems = [];
  if (out.sideBlockOpen !== true) problems.push('an ordinary visit now hides the side action');
  if (!out.cupRendered) problems.push('the Cup surface stopped rendering on an ordinary visit');
  if (out.storedBlockState !== null) problems.push('an ordinary visit wrote view state');
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
