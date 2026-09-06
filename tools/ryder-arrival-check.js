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

// WHAT THE SCHEDULE SAYS, BUILT THE WAY AN ORGANIZER BUILDS IT.
//
// Every step here is a real click on a real rendered button - the Classic preset,
// the side chips, Set Lineup. No page function is called by name, so the buttons
// having handlers at all is part of what is proven.
//
// Two things are asserted, both reported from a real device:
//
//   THE SESSION BADGE. It carries capacity ("seats 1 match") or created lineups
//   ("1 lineup set"), and those used to render as "1 matches" and "1 set". On a
//   four-golfer Cup every pairs session seats one match, so the whole schedule
//   read "1 matches" and setting ONE lineup looked like it had written pairings
//   into all five. It never had. The strings must stay unmistakable.
//
//   THE FOURSOMES SCORING DEFAULT. Scratch, because a Ryder Cup is played
//   without strokes. This is asserted on the value the select actually carries
//   after the page rendered it - not on the markup, and not on what the seeder
//   writes - because the question raised was what a golfer READS on arrival. An
//   open dropdown showing a tick beside Handicap is how it was misread once
//   already; a silent drift to Handicap would change what a group plays off.
const PROBE_SCHEDULE = `
(() => {
  const out = {};
  const mount = document.getElementById('ryder-cup-setup');
  if (!mount) return JSON.stringify({ problems: ['no Cup mount on the page'], verdict: 'FAIL' });

  const click = el => { if (el) el.click(); return !!el; };
  const byOnclick = re => Array.from(mount.querySelectorAll('button'))
      .filter(b => re.test(b.getAttribute('onclick') || ''));

  // 1. Build it. Classic preset, then each golfer onto a side, alternating.
  out.classicClicked = click(byOnclick(/rcOpenClassic\\(/)[0]);
  const sides = ['A', 'B', 'A', 'B'];
  out.chipsClicked = [101, 102, 103, 104].map((id, i) =>
      click(byOnclick(new RegExp('rcToggle\\\\(' + id + ",'" + sides[i] + "'"))[0])).filter(Boolean).length;

  const badges = () => Array.from(mount.querySelectorAll('.rcs-cap'))
      .map(el => (el.textContent || '').trim());
  out.beforeSeeding = badges();

  // 2. The scoring control, as rendered. Foursomes sessions carry one.
  const scoringSelects = Array.from(mount.querySelectorAll('select'))
      .filter(s => /rcSetSessionScoring/.test(s.getAttribute('onchange') || ''));
  out.scoringSelectCount = scoringSelects.length;
  out.scoringSelected = scoringSelects.map(s => s.value);
  out.scoringOptionText = scoringSelects.length
      ? Array.from(scoringSelects[0].options).map(o => o.value + (o.selected ? '*' : '')) : [];

  // 3. Set ONE lineup, by clicking that session's own button.
  const seedButtons = byOnclick(/rcSeedSession\\(/);
  out.seedButtonCount = seedButtons.length;
  out.seededFirst = click(seedButtons[0]);
  out.afterSeeding = badges();

  // 4. A SECOND TAP, on a different session. One tap from an empty schedule can
  //    never see the second clobbering the first - with nothing else set, there
  //    is nothing to lose. A Cup is built session by session across three days,
  //    so this is the state an organizer is actually in.
  out.seededSecond = click(byOnclick(/rcSeedSession\\(/)[1]);
  out.afterSecond = badges();

  const problems = [];
  if (!out.classicClicked) problems.push('no Classic preset button to press');
  if (out.chipsClicked !== 4) problems.push('only ' + out.chipsClicked + ' of 4 side chips responded');
  if (out.beforeSeeding.length < 5) problems.push('the Classic schedule did not render five sessions');
  out.beforeSeeding.forEach(t => {
    if (!/^seats /.test(t)) problems.push('an unseeded session reads "' + t + '" instead of what it seats');
    if (/\\bset\\b/.test(t)) problems.push('a capacity badge reads "' + t + '", claiming a lineup exists');
    if (/\\b1 matches\\b/.test(t)) problems.push('the ungrammatical "1 matches" badge is back');
  });
  if (!out.beforeSeeding.some(t => t === 'seats 1 match'))
      problems.push('no session read "seats 1 match" - got ' + JSON.stringify(out.beforeSeeding));

  if (!out.scoringSelectCount) problems.push('no Foursomes scoring control rendered');
  out.scoringSelected.forEach(v => { if (v !== 'scratch')
      problems.push('Foursomes scoring arrived on "' + v + '" - a Cup is played scratch by default'); });

  if (!out.seededFirst) problems.push('no Set Lineup button to press');
  if (out.afterSeeding[0] !== '1 lineup set')
      problems.push('the seeded session reads "' + out.afterSeeding[0] + '"');
  // THE ONE THAT MATTERS: one tap must not appear to change the other sessions.
  if (JSON.stringify(out.afterSeeding.slice(1)) !== JSON.stringify(out.beforeSeeding.slice(1)))
      problems.push('setting one lineup changed how the untouched sessions read');

  if (!out.seededSecond) problems.push('no second Set Lineup button to press');
  if (out.afterSecond[0] !== '1 lineup set')
      problems.push('the SECOND lineup wiped the first - it now reads "' + out.afterSecond[0] + '"');
  if (out.afterSecond[1] !== '1 lineup set')
      problems.push('the second lineup did not take - it reads "' + out.afterSecond[1] + '"');
  if (JSON.stringify(out.afterSecond.slice(2)) !== JSON.stringify(out.beforeSeeding.slice(2)))
      problems.push('two lineups disturbed the sessions nobody touched');

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

    const sched = await arriveCold({
        url: fileUrl('sidematches.html', 'game=ARRIVE&setup=ryder'),
        rounds: ROUNDS, expression: PROBE_SCHEDULE
    });
    if (!sched.ok) bail(sched.reason);
    console.log('--- the Classic schedule, built by clicking ---');
    console.log(sched.value);

    let a, p, s;
    try { a = JSON.parse(arrival.value); p = JSON.parse(plain.value); s = JSON.parse(sched.value); }
    catch (e) { bail('unreadable probe output'); }
    process.exit((a.verdict === 'PASS' && p.verdict === 'PASS' && s.verdict === 'PASS') ? 0 : 1);
})();
