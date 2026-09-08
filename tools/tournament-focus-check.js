#!/usr/bin/env node
// ============================================================================
// A SCORE POSTED BY ANOTHER GROUP MUST NOT DESTROY THE HOLE YOU ARE TYPING.
//
// tournament-scorecard.html holds ONE listener, on tournaments/<CODE>. Every
// write in the whole product lands under that path - every group's every hole -
// so every phone's value callback re-runs on all of them, and renderGroup()
// answers by rewriting #holes-list wholesale. The input under the golfer's
// thumb is not updated; it is REPLACED.
//
// A digit typed and not yet blurred has not been saved: onchange fires on blur,
// so the stroke exists only in that node's .value. Replace the node and the
// stroke is gone, silently, and on a phone the keyboard closes with it. At 25
// groups this is not an edge case - it is the normal condition of the round.
//
// WHAT THIS CHECK DOES, AND WHAT IT REFUSES TO DO
//
// It never calls a page function by name. It captures the callback the page
// itself registered on tournaments/<CODE> and invokes THAT, with a record in
// which another group's score has genuinely changed - which is exactly what
// Firebase does on a write. The data source is the only thing driven.
//
// Typing is stood in for by setting .value on the focused input WITHOUT
// dispatching change. That is faithful to the state a half-typed hole is in:
// the value is present in the node and nothing has been written. What the
// assertions turn on - node identity, activeElement, and the surviving value -
// is unaffected by how the value got there, because a re-render discards the
// node either way.
//
// TEST 1  the defect. Focus an input in this group, type a digit, let one
//         OTHER group's score change arrive. Three assertions: same DOM node,
//         still the activeElement, digit still in .value.
//
// TEST 2  the negative control, and the reason Test 1 cannot be satisfied by
//         simply not re-rendering. Focus nothing; change a score belonging to
//         somebody ELSE IN THIS GROUP; assert the new number reaches the
//         screen. A fix that freezes the card fails this.
//
// TEST 2i the control on the control. The same mutation with the listener
//         NEVER fired: the screen must still show the OLD number. If it showed
//         the new one, Test 2 would be passing on something other than the
//         re-render and would be inert - it would go green with rendering
//         switched off entirely.
//
// TEST 3  the rate. Drives N genuine other-group changes and counts how many
//         replaced the focused node, so the per-minute figure is measured
//         replacement-per-write multiplied by a stated arrival rate, not an
//         assumption that every write costs one replacement.
//
//   node tools/tournament-focus-check.js
//
//   exit 0   the card survives another group's write  (NOT today's behaviour)
//   exit 1   FAIL - the JSON names which of the three assertions broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
//
// TODAY THIS EXITS 1. That is the correct result: the defect is real and this
// check is the thing that will go green when it is fixed.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');   // WAVE 8: writer-shaped fixtures

// ---------------------------------------------------------------------------
// The field: 100 golfers, 25 groups of 4, 18 holes, single-round individual.
// ---------------------------------------------------------------------------
const PLAYERS_TOTAL = 100;
const GROUP_SIZE = 4;
const HOLES = 18;

// A real stroke index, 1..18 once each, so nothing is refused for the wrong
// reason if this fixture is ever pointed at a Net event.
const SI = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14];
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];

function bigEvent() {
    const courseData = [];
    for (let i = 0; i < HOLES; i++) {
        courseData.push({ hole: i + 1, par: PARS[i], hcpIndex: SI[i] });
    }
    // REAL MINTED IDS. p1..p100 were never a shape the app could produce, and a
    // score key is built from an id - so until wave 8 no test had run a genuine
    // seventeen-character id through one.
    const field = F.playerField(Array.from({ length: PLAYERS_TOTAL },
        (_, i) => ({ name: 'Golfer ' + (i + 1), handicap: String((i + 1) % 24) })));
    const pids = field.ids;
    const scoringGroups = {}, scores = {};
    const groupCount = Math.ceil(PLAYERS_TOTAL / GROUP_SIZE);
    for (let g = 1; g <= groupCount; g++) {
        const grp = F.scoringGroup('Group ' + g, pids.slice((g - 1) * GROUP_SIZE, g * GROUP_SIZE), g);
        scoringGroups[grp.id] = grp;
    }
    pids.forEach((pid, i) => {
        for (let h = 1; h <= HOLES; h++) scores[pid + '_h' + h] = 4 + ((i + h) % 3);
    });
    return F.eventRecord({
        name: 'Club Championship', format: 'individual', scoringMode: 'gross',
        courseName: 'True Blue Golf Club', activeCourseKey: 'sc_trueblue',
        courseData: courseData, entryFee: 40,
        players: field.players, scoringGroups: scoringGroups, scores: scores,
    });
}

const EVENT = bigEvent();
// The third group is the card under test; the seventeenth is somebody else's.
// Both are looked up by NAME, because the ids are minted now.
const GROUP_IDS = Object.keys(EVENT.scoringGroups)
    .sort((a, b) => EVENT.scoringGroups[a].createdAt - EVENT.scoringGroups[b].createdAt);
const MY_GROUP = GROUP_IDS[2];
const MINE = EVENT.scoringGroups[MY_GROUP].playerIds;
const OTHER = EVENT.scoringGroups[GROUP_IDS[16]].playerIds;
const GROUP_COUNT = Object.keys(EVENT.scoringGroups).length;

// ---------------------------------------------------------------------------
// Captures the page's own listener. Installed before any page script runs.
// Calls nothing.
// ---------------------------------------------------------------------------
const CAPTURE = `
(function () {
  window.__cbs = [];
  window.__writes = [];
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments);
    var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p);
      var on = r.on;
      r.on = function (ev, cb) {
        if (ev === 'value') window.__cbs.push({ path: String(p), cb: cb });
        return on.apply(r, arguments);
      };
      // Recorded so a test can prove the PAGE'S OWN write path ran, rather than
      // assuming a dispatched change event reached it.
      ['set', 'remove'].forEach(function (op) {
        var fn = r[op];
        r[op] = function (v) {
          window.__writes.push({ op: op, path: String(p), value: v });
          return fn.apply(r, arguments);
        };
      });
      return r;
    };
    return d;
  };
})();`;

// Shared page-side helpers. `document.__event` is the record, seeded below;
// every mutation is applied to it and handed back through the page's own
// callback, which is what a Firebase write does.
const HELPERS = `
  const REC = () => JSON.parse(document.__eventJson);
  const listener = () => (window.__cbs || []).find(c => /^tournaments\\//.test(c.path));
  // Fires the page's own callback with a record in which one score differs.
  // Returns the record so a caller can chain further changes.
  const fireWith = (rec) => {
    const entry = listener();
    if (!entry) throw new Error('the page registered no tournaments/ listener');
    entry.cb({ val: () => rec, exists: () => true });
    return rec;
  };
  const inputFor = (pid, hole) => {
    // The card renders one input per golfer per hole, in group order, holes in
    // order. Located by position rather than by an id the page does not set.
    const ids = ${JSON.stringify(MINE)};
    const idx = (hole - 1) * ids.length + ids.indexOf(pid);
    return document.querySelectorAll('#holes-list input')[idx];
  };
`;

// ---------------------------------------------------------------------------
// TEST 1 + TEST 3, one page load. Test 3 needs the same focused node Test 1
// establishes, so splitting them would mean setting it up twice.
// ---------------------------------------------------------------------------
const REFIRES_FOR_RATE = 60;

const PROBE_1_AND_3 = `
(() => {
  ${HELPERS}
  const out = { };
  const all = document.querySelectorAll('#holes-list input');
  out.inputsOnCard = all.length;
  if (all.length === 0) return JSON.stringify({ fatal: 'the card rendered no score inputs' });

  const MY_PID = ${JSON.stringify(MINE[1])};
  const MY_HOLE = 7;
  const node = inputFor(MY_PID, MY_HOLE);
  if (!node) return JSON.stringify({ fatal: 'could not locate this golfer\\'s hole input' });

  out.storedBefore = node.value;
  node.focus();
  // TYPED, NOT COMMITTED. No change event is dispatched, which is exactly the
  // state a half-entered hole is in before the golfer moves on.
  const TYPED = String((parseInt(node.value, 10) || 4) + 1);
  node.value = TYPED;
  out.typed = TYPED;
  out.focusedBefore = document.activeElement === node;
  if (!out.focusedBefore) return JSON.stringify({ fatal: 'could not focus a score input' });

  // ONE score change, belonging to a DIFFERENT group.
  const rec = REC();
  const otherKey = ${JSON.stringify(OTHER[0])} + '_h5';
  rec.scores[otherKey] = (rec.scores[otherKey] || 4) + 1;
  out.changedKey = otherKey;
  out.changedBelongsToThisGroup = ${JSON.stringify(MINE)}.some(p => otherKey.indexOf(p + '_') === 0);
  fireWith(rec);

  const after = inputFor(MY_PID, MY_HOLE);
  out.sameNode = after === node;
  out.stillFocused = document.activeElement === after;
  out.valueAfter = after ? after.value : null;
  out.digitSurvived = out.valueAfter === TYPED;

  // TEST 3. Keep going with genuine, distinct other-group changes and count how
  // many of them replace the node the golfer is holding.
  let current = document.activeElement === after ? after : after;
  current.focus();
  let replaced = 0;
  for (let i = 0; i < ${REFIRES_FOR_RATE}; i++) {
    const before = inputFor(MY_PID, MY_HOLE);
    const r = REC();
    const k = ${JSON.stringify(OTHER)}[i % ${OTHER.length}] + '_h' + ((i % 18) + 1);
    r.scores[k] = (r.scores[k] || 4) + 1 + (i % 3);
    fireWith(r);
    if (inputFor(MY_PID, MY_HOLE) !== before) replaced++;
  }
  out.refiresDriven = ${REFIRES_FOR_RATE};
  out.refiresThatReplacedTheNode = replaced;
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 1c - the control on Test 1. Three assertions that can NEVER pass are
// three assertions no fix can satisfy, and they would fail identically on a
// repaired page. So: set the same node up the same way and DO NOT fire the
// listener. All three must pass. If any of them still fails here, Test 1 is
// asserting something other than the re-render and must be rewritten.
// ---------------------------------------------------------------------------
const PROBE_1_CAPABILITY = `
(() => {
  ${HELPERS}
  const out = {};
  const MY_PID = ${JSON.stringify(MINE[1])};
  const MY_HOLE = 7;
  const node = inputFor(MY_PID, MY_HOLE);
  if (!node) return JSON.stringify({ fatal: 'could not locate this golfer\\'s hole input' });
  node.focus();
  const TYPED = String((parseInt(node.value, 10) || 4) + 1);
  node.value = TYPED;
  out.typed = TYPED;
  out.focusedBefore = document.activeElement === node;

  // Another group's score changes. The page is NEVER told.
  const rec = REC();
  const otherKey = ${JSON.stringify(OTHER[0])} + '_h5';
  rec.scores[otherKey] = (rec.scores[otherKey] || 4) + 1;
  out.listenerFired = false;

  const after = inputFor(MY_PID, MY_HOLE);
  out.sameNode = after === node;
  out.stillFocused = document.activeElement === after;
  out.digitSurvived = (after ? after.value : null) === TYPED;
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 4 - SELF ECHO. The group scoring alone, with nobody else on the course.
//
// The scorer commits hole 5 the way a golfer does - a real change event on the
// real input, so the page's OWN write path runs - then moves to hole 6 and
// starts typing. Firebase echoes that write back to the writer, so the listener
// fires with a record differing only at hole 5. If hole 6 cannot survive the
// echo of the group's own previous hole, the field size is irrelevant: one
// group alone cannot enter two holes in a row.
// ---------------------------------------------------------------------------
const PROBE_4 = `
(() => {
  ${HELPERS}
  const out = {};
  const MY_PID = ${JSON.stringify(MINE[1])};
  const H_COMMIT = 5, H_TYPING = 6;

  const commitNode = inputFor(MY_PID, H_COMMIT);
  if (!commitNode) return JSON.stringify({ fatal: 'could not locate the hole-5 input' });

  // COMMIT hole 5 the way a golfer does: change the value, then blur/commit.
  const committed = String((parseInt(commitNode.value, 10) || 4) + 1);
  out.hole5Before = commitNode.value;
  out.hole5Committed = committed;
  commitNode.focus();
  commitNode.value = committed;
  commitNode.dispatchEvent(new Event('change', { bubbles: true }));

  // CONTROL A: the page's own write path ran, and wrote where it should.
  const expectPath = 'tournaments/FOCUS1/scores/' + MY_PID + '_h' + H_COMMIT;
  const w = (window.__writes || []).filter(x => x.path === expectPath);
  out.pageWrotePath = w.length ? w[w.length - 1].path : null;
  out.pageWroteValue = w.length ? w[w.length - 1].value : null;
  out.pageOwnWriteRan = w.length > 0;
  if (!out.pageOwnWriteRan) {
    return JSON.stringify({ fatal: 'the change event did not reach the page write path' });
  }

  // Now the golfer moves to hole 6 and types, without blurring.
  const node = inputFor(MY_PID, H_TYPING);
  if (!node) return JSON.stringify({ fatal: 'could not locate the hole-6 input' });
  out.hole6StoredBefore = node.value;
  node.focus();
  const TYPED = String((parseInt(node.value, 10) || 4) + 1);
  node.value = TYPED;
  out.typed = TYPED;
  out.focusedBefore = document.activeElement === node;
  if (!out.focusedBefore) return JSON.stringify({ fatal: 'could not focus the hole-6 input' });

  // CONTROL B, part 1: stamp every input now on the card, so how much the echo
  // rebuilt is reportable - it is a measurement, no longer the vacuity test.
  const stampedBefore = document.querySelectorAll('#holes-list input');
  stampedBefore.forEach(el => { el.__probeStamp = 1; });
  out.inputsStamped = stampedBefore.length;

  // CONTROL C - DID THE PAGE ACTUALLY PROCESS THE SNAPSHOT?
  //
  // "0 inputs replaced" was the reaction signal while the page rebuilt on every
  // write. Once it stops rebuilding, 0 is the GOAL, and a control that reads it
  // as "nothing happened" would condemn the fix it exists to verify. So the
  // reaction is measured on its own terms instead: one OTHER input in this group
  // is knocked out of sync with the record by hand, and the echo has to put it
  // back. That is true of a rebuild and of an in-place write, and false of a page
  // that ignored the snapshot - which is the question being asked.
  const staleNode = inputFor(MY_PID, 11);
  out.staleStored = staleNode.value;
  const WRONG = String((parseInt(staleNode.value, 10) || 4) + 3);
  staleNode.value = WRONG;
  out.staleSetTo = WRONG;

  // THE ECHO: the record exactly as it now stands after the page's own write.
  // Nothing else differs - no other group, no other golfer.
  const rec = REC();
  rec.scores[MY_PID + '_h' + H_COMMIT] = parseInt(committed, 10);
  out.echoDiffersOnlyAt = MY_PID + '_h' + H_COMMIT;
  let threw = null;
  try { fireWith(rec); } catch (e) { threw = String(e && e.message || e); }
  out.echoDelivered = threw === null;
  out.echoThrew = threw;

  // CONTROL B, part 2: how many inputs the page replaced in response.
  const after = document.querySelectorAll('#holes-list input');
  out.inputsReplacedByEcho = Array.from(after).filter(el => !el.__probeStamp).length;
  out.inputsAfter = after.length;

  const staleAfter = inputFor(MY_PID, 11);
  out.staleValueAfterEcho = staleAfter ? staleAfter.value : null;
  out.echoCorrectedAStaleInput = out.staleValueAfterEcho === out.staleStored;

  const node2 = inputFor(MY_PID, H_TYPING);
  out.sameNode = node2 === node;
  out.stillFocused = document.activeElement === node2;
  out.valueAfter = node2 ? node2.value : null;
  out.digitSurvived = out.valueAfter === TYPED;
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 9 - A SHAPE CHANGE STILL REBUILDS THE CARD.
//
// Skipping the rebuild for score updates creates a second branch, and a branch
// nothing exercises is a branch that does not work. If a golfer joins the group
// and the card keeps showing the old four, the in-place path has quietly become
// a freeze - the exact failure Test 2 exists to catch, one level up.
//
// A golfer is added to this group and to the field, which is an R3 change, and
// the card has to grow a fifth column of inputs and name them.
// ---------------------------------------------------------------------------
const PROBE_9 = `
(() => {
  ${HELPERS}
  const out = {};
  const list = document.getElementById('holes-list');
  out.inputsBefore = list.querySelectorAll('input').length;
  out.rosterBefore = (document.getElementById('team-roster').innerText || '').trim();

  // A score-only change first, to prove the in-place path is the one in use.
  const warm = REC();
  warm.scores[${JSON.stringify(OTHER[0])} + '_h5'] = 9;
  const firstInput = list.querySelectorAll('input')[0];
  fireWith(warm);
  out.scoreChangeReusedTheNodes = list.querySelectorAll('input')[0] === firstInput;

  // Now a genuine shape change: a fifth golfer joins this group.
  const rec = REC();
  rec.players.pNEW = { id: 'pNEW', name: 'Late Entry', handicap: '9', addedAt: 999 };
  rec.scoringGroups[${JSON.stringify(MY_GROUP)}].playerIds =
      rec.scoringGroups[${JSON.stringify(MY_GROUP)}].playerIds.concat(['pNEW']);
  for (let h = 1; h <= 18; h++) rec.scores['pNEW_h' + h] = 3;
  fireWith(rec);

  out.inputsAfter = list.querySelectorAll('input').length;
  out.rosterAfter = (document.getElementById('team-roster').innerText || '').trim();
  out.rosterNamesTheNewGolfer = /Late Entry/.test(out.rosterAfter);
  out.cardGrew = out.inputsAfter === out.inputsBefore + 18;
  out.newGolfersScoresShown = Array.from(list.querySelectorAll('input'))
      .filter(el => /'pNEW'/.test(el.getAttribute('onchange') || '')).length;
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 5 - SCROLL POSITION. Step 2's target, not Step 1's. A golfer standing on
// hole 12 has scrolled there; a rebuild that drops them back to hole 1 costs
// them the same thing a lost keystroke does, more quietly.
//
// WHICH ELEMENT ACTUALLY SCROLLS IS MEASURED, NOT ASSUMED. #holes-list is a
// plain block in the page flow with no overflow of its own, so its scrollTop is
// permanently 0 and an assertion on it would be true forever, on any page, fixed
// or broken. The probe finds the element that genuinely moved and asserts on
// that, and refuses to report anything if nothing moved at all.
//
// THREE PARTS, because "unchanged" is the easiest assertion in the world to
// satisfy accidentally:
//   5    scroll, fire another group's change, assert unchanged
//   5a   scroll, DO NOT fire, assert unchanged      - the baseline is stable
//   5b   scroll, then deliberately move it, assert the probe SEES the move
//        - without this, 5 and 5a could both be reading a number that never
//          changes and the pair would look like a passing test forever
// ---------------------------------------------------------------------------
const PROBE_5 = `
(() => {
  ${HELPERS}
  const out = {};
  const list = document.getElementById('holes-list');
  const doc = document.scrollingElement || document.documentElement;

  // Scroll to hole 12 the way a golfer does - by putting it on screen.
  const rows = list.querySelectorAll('.hole-row');
  out.holeRows = rows.length;
  const target = rows[11];
  if (!target) return JSON.stringify({ fatal: 'no hole-12 row to scroll to' });
  target.scrollIntoView({ block: 'center' });

  const read = () => ({ list: list.scrollTop, doc: doc.scrollTop, win: window.scrollY });
  const before = read();
  out.before = before;
  // WHICH one moved. If none did, this probe measured nothing.
  const movers = Object.keys(before).filter(k => before[k] > 0);
  out.scrolledElements = movers;
  if (movers.length === 0) {
    return JSON.stringify({ fatal: 'scrolling to hole 12 moved nothing - nothing was measured' });
  }

  // PART 5b FIRST, while the page is untouched: prove the reading can detect a
  // move. If it cannot, everything below is decoration.
  doc.scrollTop = before.doc + 200;
  window.scrollTo(0, before.doc + 200);
  const moved = read();
  out.probeDetectsAMove = movers.some(k => moved[k] !== before[k]);
  // Put it back and re-establish the baseline.
  target.scrollIntoView({ block: 'center' });
  const base = read();
  out.baseline = base;

  // PART 5: another group's score changes.
  const rec = REC();
  const key = ${JSON.stringify(OTHER[0])} + '_h5';
  rec.scores[key] = (rec.scores[key] || 4) + 1;
  out.changedKey = key;
  fireWith(rec);
  const after = read();
  out.after = after;
  out.unchangedAfterRefire = movers.every(k => after[k] === base[k]);
  out.deltas = {};
  movers.forEach(k => { out.deltas[k] = after[k] - base[k]; });
  return JSON.stringify(out);
})()`;

// PART 5a - the same measurement with the listener NEVER fired. The baseline has
// to hold on its own, or "unchanged" after a re-fire says nothing.
const PROBE_5_NOFIRE = `
(() => {
  ${HELPERS}
  const out = {};
  const list = document.getElementById('holes-list');
  const doc = document.scrollingElement || document.documentElement;
  const rows = list.querySelectorAll('.hole-row');
  const target = rows[11];
  if (!target) return JSON.stringify({ fatal: 'no hole-12 row to scroll to' });
  target.scrollIntoView({ block: 'center' });
  const read = () => ({ list: list.scrollTop, doc: doc.scrollTop, win: window.scrollY });
  const before = read();
  const movers = Object.keys(before).filter(k => before[k] > 0);
  out.scrolledElements = movers;
  if (movers.length === 0) {
    return JSON.stringify({ fatal: 'scrolling to hole 12 moved nothing - nothing was measured' });
  }
  // The record changes. The page is NEVER told.
  const rec = REC();
  const key = ${JSON.stringify(OTHER[0])} + '_h5';
  rec.scores[key] = (rec.scores[key] || 4) + 1;
  out.listenerFired = false;
  const after = read();
  out.before = before; out.after = after;
  out.unchangedWithoutARefire = movers.every(k => after[k] === before[k]);
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 8 - THE NODE IS NEVER DETACHED.
//
// Step 1 kept the golfer's digit by putting the SAME node back after the
// rebuild. That is a round trip out of the document: innerHTML destroys the
// subtree, replaceChild re-attaches the survivor, and the page then calls
// .focus() on it with no user gesture anywhere in the stack. Step 2's claim is
// stronger - the node is never disturbed at all.
//
// THREE READINGS, because no single one separates the three states:
//
//   state              isConnected   parentChanged   focus() calls
//   pre-Step-1         FALSE         false           0
//   Step 1             true          TRUE            >= 1
//   Step 2 (target)    true          false           0
//
// parentChanged ALONE would report false for the worst case: after innerHTML
// the detached subtree keeps its internal links, so the dead node still points
// at its dead parent. isConnected is what tells those apart.
//
// focus() is counted by wrapping it on the node itself before the update. The
// wrapper travels with the node, so it records the call whether the node was
// moved or not.
// ---------------------------------------------------------------------------
const PROBE_8 = `
(() => {
  ${HELPERS}
  const out = {};
  const MY_PID = ${JSON.stringify(MINE[1])};
  const MY_HOLE = 7;
  const node = inputFor(MY_PID, MY_HOLE);
  if (!node) return JSON.stringify({ fatal: 'could not locate the hole input' });

  node.focus();
  node.value = String((parseInt(node.value, 10) || 4) + 1);
  out.focusedBefore = document.activeElement === node;
  if (!out.focusedBefore) return JSON.stringify({ fatal: 'could not focus a score input' });

  const parentBefore = node.parentNode;
  out.connectedBefore = node.isConnected;
  let focusCalls = 0;
  const realFocus = node.focus;
  node.focus = function () { focusCalls++; return realFocus.apply(this, arguments); };

  // ONE score change, belonging to a DIFFERENT group - the Test 1 scenario.
  const rec = REC();
  const k = ${JSON.stringify(OTHER[0])} + '_h5';
  rec.scores[k] = (rec.scores[k] || 4) + 1;
  fireWith(rec);

  out.focusCallsDuringUpdate = focusCalls;
  out.parentChanged = node.parentNode !== parentBefore;
  out.connectedAfter = node.isConnected;
  out.stillInTheList = inputFor(MY_PID, MY_HOLE) === node;
  out.neverDetached = out.connectedAfter === true && out.parentChanged === false;
  out.focusNeverCalled = focusCalls === 0;

  // The Test 4 scenario, on the same page load: commit a hole through the
  // page's own write path, then take the echo while typing the next one.
  const commitNode = inputFor(MY_PID, 5);
  const committed = String((parseInt(commitNode.value, 10) || 4) + 1);
  commitNode.focus();
  commitNode.value = committed;
  commitNode.dispatchEvent(new Event('change', { bubbles: true }));
  out.echoWriteRan = (window.__writes || [])
      .some(x => x.path === 'tournaments/FOCUS1/scores/' + MY_PID + '_h5');

  const n2 = inputFor(MY_PID, 6);
  n2.focus();
  n2.value = String((parseInt(n2.value, 10) || 4) + 1);
  const p2 = n2.parentNode;
  let focusCalls2 = 0;
  const realFocus2 = n2.focus;
  n2.focus = function () { focusCalls2++; return realFocus2.apply(this, arguments); };
  const rec2 = REC();
  rec2.scores[MY_PID + '_h5'] = parseInt(committed, 10);
  fireWith(rec2);
  out.echo_focusCalls = focusCalls2;
  out.echo_parentChanged = n2.parentNode !== p2;
  out.echo_connectedAfter = n2.isConnected;
  out.echo_neverDetached = n2.isConnected === true && (n2.parentNode === p2);
  out.echo_focusNeverCalled = focusCalls2 === 0;
  return JSON.stringify(out);
})()`;

// THE CONTROL ON TEST 8. The probe has to be able to SEE a detach, or "never
// detached" is a sentence about nothing. The page's helper is a top-level
// function and therefore a property of the global object, so it is replaced
// here from OUTSIDE with the detach-and-refocus behaviour Step 1 had. No file
// is edited. Test 8's readings must flip.
const STEP1_STANDIN = `
document.addEventListener('DOMContentLoaded', function () {
  window.setHolesListPreservingFocus = function (html) {
    var list = document.getElementById('holes-list');
    var active = document.activeElement;
    var keyOf = function (el) { return el.getAttribute('onchange') || ''; };
    var keep = (active && active.tagName === 'INPUT' && list.contains(active)) ? active : null;
    var keepKey = keep ? keyOf(keep) : null;
    list.innerHTML = html;
    if (!keep || !keepKey) return;
    var fresh = Array.prototype.slice.call(list.querySelectorAll('input'))
        .filter(function (el) { return keyOf(el) === keepKey; })[0];
    if (!fresh || !fresh.parentNode) return;
    fresh.parentNode.replaceChild(keep, fresh);
    keep.focus();
  };
});`;

// ---------------------------------------------------------------------------
// TEST 2 - the new number must reach the screen.
// ---------------------------------------------------------------------------
const PROBE_2 = `
(() => {
  ${HELPERS}
  const out = {};
  // Focus nothing. The golfer is looking at the card, not typing into it.
  const TARGET_PID = ${JSON.stringify(MINE[2])};
  const TARGET_HOLE = 12;
  const node = inputFor(TARGET_PID, TARGET_HOLE);
  if (!node) return JSON.stringify({ fatal: 'could not locate the target input' });
  out.onScreenBefore = node.value;
  out.activeIsBody = document.activeElement === document.body;

  const rec = REC();
  const key = TARGET_PID + '_h' + TARGET_HOLE;
  const next = String((parseInt(rec.scores[key], 10) || 4) + 2);
  rec.scores[key] = parseInt(next, 10);
  out.changedKey = key;
  out.changedBelongsToThisGroup = ${JSON.stringify(MINE)}.indexOf(TARGET_PID) !== -1;
  out.expected = next;
  fireWith(rec);

  const after = inputFor(TARGET_PID, TARGET_HOLE);
  out.onScreenAfter = after ? after.value : null;
  out.newValueReachedTheScreen = out.onScreenAfter === next;
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// TEST 2i - the same mutation, listener NEVER fired. The screen must still
// show the OLD number. If it shows the new one, Test 2 is inert.
// ---------------------------------------------------------------------------
const PROBE_2_INERT = `
(() => {
  ${HELPERS}
  const out = {};
  const TARGET_PID = ${JSON.stringify(MINE[2])};
  const TARGET_HOLE = 12;
  const node = inputFor(TARGET_PID, TARGET_HOLE);
  if (!node) return JSON.stringify({ fatal: 'could not locate the target input' });
  out.onScreenBefore = node.value;

  // The record changes. The page is NEVER told. Nothing is fired.
  const rec = REC();
  const key = TARGET_PID + '_h' + TARGET_HOLE;
  const next = String((parseInt(rec.scores[key], 10) || 4) + 2);
  rec.scores[key] = parseInt(next, 10);
  out.expected = next;
  out.listenerFired = false;

  const after = inputFor(TARGET_PID, TARGET_HOLE);
  out.onScreenAfter = after ? after.value : null;
  // Test 2 is LIVE only if withholding the re-fire withholds the new number.
  out.newValueReachedTheScreen = out.onScreenAfter === next;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-focus-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// EXPORTED so the SAME scenarios can be driven on another engine. A second
// engine check that re-typed the probes would be measuring two different things
// and reporting them as one.
module.exports = {
    EVENT: EVENT, MY_GROUP: MY_GROUP, MINE: MINE, OTHER: OTHER,
    CAPTURE: CAPTURE, PROBE_1_AND_3: PROBE_1_AND_3, PROBE_4: PROBE_4,
    PROBE_8: PROBE_8, STEP1_STANDIN: STEP1_STANDIN, PROBE_9: PROBE_9,
};

if (require.main !== module) return;

(async () => {
    const db = { tournaments: { FOCUS1: EVENT }, trips: {} };
    const seed = 'document.__eventJson = ' + JSON.stringify(JSON.stringify(EVENT)) + ';';
    const url = fileUrl('tournament-scorecard.html', 'tourney=FOCUS1&group=' + MY_GROUP);

    const runWithPre = async (expression, extraPre) => {
        const r = await arriveCold({ url: url, db: db, expression: expression,
            preScript: CAPTURE + '\n' + seed + '\n' + extraPre, settleMs: 6000,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        if (g.fatal) bail(g.fatal);
        return g;
    };

    const run = async (expression) => {
        const r = await arriveCold({ url: url, db: db, expression: expression,
            preScript: CAPTURE + '\n' + seed, settleMs: 6000,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        if (g.fatal) bail(g.fatal);
        return g;
    };

    const one = await run(PROBE_1_AND_3);
    const oneCap = await run(PROBE_1_CAPABILITY);
    const four = await run(PROBE_4);
    const two = await run(PROBE_2);
    const inert = await run(PROBE_2_INERT);
    const eight = await run(PROBE_8);
    const eightCtl = await runWithPre(PROBE_8, STEP1_STANDIN);
    const nine = await run(PROBE_9);
    const five = await run(PROBE_5);
    const fiveNoFire = await run(PROBE_5_NOFIRE);

    // A run that rendered no card measured nothing.
    if (!one.inputsOnCard) bail('the group card rendered no inputs - nothing was measured');
    if (one.changedBelongsToThisGroup) {
        bail('the score Test 1 changed belongs to THIS group - it must belong to another');
    }
    if (!two.changedBelongsToThisGroup) {
        bail('the score Test 2 changed does not belong to this group - the control is wrong');
    }

    const problems = [];

    // TEST 1 - three assertions, reported individually.
    const t1 = {
        sameDomNode: !!one.sameNode,
        stillTheActiveElement: !!one.stillFocused,
        typedDigitSurvived: !!one.digitSurvived,
    };
    Object.keys(t1).forEach(k => {
        if (!t1[k]) problems.push('TEST 1 ' + k + ': FAILED');
    });

    // TEST 1c - the three assertions must be CAPABLE of passing, or they are not
    // a target a fix can reach.
    const t1cap = {
        sameDomNode: !!oneCap.sameNode,
        stillTheActiveElement: !!oneCap.stillFocused,
        typedDigitSurvived: !!oneCap.digitSurvived,
    };
    Object.keys(t1cap).forEach(k => {
        if (!t1cap[k]) {
            problems.push('TEST 1 IS UNSATISFIABLE - ' + k + ' fails even with the '
                + 'listener never fired, so it is not asserting the re-render. Rewrite it.');
        }
    });

    // TEST 4 - the self echo. Reported FIRST when it fails, because a group
    // scoring alone is a smaller and worse claim than 360 a minute.
    const t4 = {
        sameDomNode: !!four.sameNode,
        stillTheActiveElement: !!four.stillFocused,
        typedDigitSurvived: !!four.digitSurvived,
    };
    if (!four.pageOwnWriteRan) {
        bail('TEST 4 could not commit hole 5 through the page - nothing was measured');
    }
    if (!four.echoDelivered) {
        bail('TEST 4 echo threw inside the page callback: ' + four.echoThrew);
    }
    const t4pass = t4.sameDomNode && t4.stillTheActiveElement && t4.typedDigitSurvived;
    // A PASS THAT MEANS NOTHING HAPPENED IS NOT A PASS. The reaction is measured
    // by whether the echo corrected an input deliberately knocked out of sync -
    // true of a rebuild AND of an in-place write, false of a page that ignored
    // the snapshot. Counting replaced nodes cannot serve here: zero replacements
    // is what a correct page now does.
    if (!four.echoCorrectedAStaleInput) {
        problems.push('TEST 4 PASSED VACUOUSLY - the echo did not correct an input '
            + 'held out of sync (' + four.staleSetTo + ' should have gone back to '
            + four.staleStored + '), so the page did not process the snapshot at '
            + 'all and the three assertions above observed nothing.');
    }
    Object.keys(t4).forEach(k => {
        if (!t4[k]) problems.push('TEST 4 ' + k + ': FAILED');
    });

    // TEST 2 - must pass today and after any fix.
    const t2pass = !!two.newValueReachedTheScreen;
    if (!t2pass) {
        problems.push('TEST 2 newValueReachedTheScreen: FAILED - a score entered by '
            + 'somebody else in this group did not reach the card');
    }

    // TEST 2i - the control on the control.
    const t2live = !inert.newValueReachedTheScreen;
    if (!t2live) {
        problems.push('TEST 2 IS INERT - the new number appeared on screen with the '
            + 'listener never fired, so Test 2 would pass with rendering disabled. '
            + 'Rewrite it.');
    }

    // TEST 5 - scroll position. STEP 2 OWNS THIS. It is expected to be red while
    // only Step 1 is done, and it is counted anyway: a tool that went green with
    // a known defect standing would be the thing that lets the defect ship.
    if (!five.probeDetectsAMove) {
        bail('TEST 5 CANNOT DETECT A SCROLL AT ALL - the reading never changes even '
            + 'when the page is deliberately scrolled, so "unchanged" would be true '
            + 'forever. Rewrite it.');
    }
    if (!fiveNoFire.unchangedWithoutARefire) {
        bail('TEST 5 has no stable baseline - the scroll moved with the listener '
            + 'never fired, so nothing can be attributed to a re-render');
    }
    const t5pass = !!five.unchangedAfterRefire;
    if (!t5pass) {
        problems.push('TEST 5 scrollPositionHeld: FAILED - STEP 2 OWNS THIS, '
            + 'expected red until the rebuild is replaced by an in-place update');
    }

    // TEST 8 - the node is never disturbed. STEP 2 OWNS THIS.
    if (!eightCtl.parentChanged) {
        bail('TEST 8 IS INERT - its control, which deliberately detaches and '
            + 'refocuses the node, reported parentChanged FALSE. The probe cannot '
            + 'see a detach, so "never detached" means nothing. Fix it.');
    }
    const t8 = {
        neverDetached: !!eight.neverDetached,
        focusNeverCalled: !!eight.focusNeverCalled,
        echo_neverDetached: !!eight.echo_neverDetached,
        echo_focusNeverCalled: !!eight.echo_focusNeverCalled,
    };
    Object.keys(t8).forEach(k => {
        if (!t8[k]) problems.push('TEST 8 ' + k + ': FAILED');
    });

    // TEST 9 - the rebuild branch still works.
    if (!nine.scoreChangeReusedTheNodes) {
        problems.push('TEST 9 setup did not exercise the in-place path - a score-only '
            + 'change still replaced the nodes, so the shape-change assertion below '
            + 'proves nothing about a second branch');
    }
    if (!nine.cardGrew || !nine.rosterNamesTheNewGolfer || nine.newGolfersScoresShown !== 18) {
        problems.push('TEST 9 shapeChangeRebuilds: FAILED - a golfer joined the group '
            + 'and the card did not follow (inputs ' + nine.inputsBefore + ' -> '
            + nine.inputsAfter + ', roster names them: ' + nine.rosterNamesTheNewGolfer + ')');
    }

    // TEST 3 - measured replacement per write, times a stated arrival rate.
    const ratio = one.refiresDriven
        ? one.refiresThatReplacedTheNode / one.refiresDriven : null;
    const otherGroups = GROUP_COUNT - 1;
    const writesPerMinutePerGroup = 60 / 4;                // 1 score / 4 s, stated
    const writesPerMinute = otherGroups * writesPerMinutePerGroup;
    const replacementsPerMinute = ratio === null ? null : Math.round(writesPerMinute * ratio);

    const report = {
        surface: 'tournament-scorecard.html ?tourney=FOCUS1&group=' + MY_GROUP,
        field: { golfers: PLAYERS_TOTAL, groups: GROUP_COUNT, holes: HOLES,
                 inputsOnThisCard: one.inputsOnCard },
        test1: {
            mustFailToday: true,
            storedBefore: one.storedBefore, typed: one.typed,
            otherGroupScoreChanged: one.changedKey,
            assertions: t1,
            valueAfterRefire: one.valueAfter,
            verdict: (t1.sameDomNode && t1.stillTheActiveElement && t1.typedDigitSurvived)
                ? 'PASS' : 'FAIL',
        },
        test4_self_echo: {
            scenario: 'this group alone: commit hole 5 through the page, type hole 6, '
                + 'receive the echo of that same write',
            hole5: { before: four.hole5Before, committed: four.hole5Committed },
            pageOwnWritePath: four.pageWrotePath,
            pageOwnWriteValue: four.pageWroteValue,
            echoDiffersOnlyAt: four.echoDiffersOnlyAt,
            echoDelivered: !!four.echoDelivered,
            inputsReplacedByEcho: four.inputsReplacedByEcho + ' of ' + four.inputsStamped,
            control_echoCorrectedAStaleInput: {
                heldOutOfSyncAt: four.staleSetTo, storedValue: four.staleStored,
                afterEcho: four.staleValueAfterEcho,
                verdict: four.echoCorrectedAStaleInput
                    ? 'THE PAGE PROCESSED THE SNAPSHOT' : 'NO REACTION - pass is vacuous',
            },
            hole6: { storedBefore: four.hole6StoredBefore, typed: four.typed,
                     valueAfterEcho: four.valueAfter },
            assertions: t4,
            verdict: t4pass ? 'PASS' : 'FAIL',
        },
        test1_capability_control: {
            question: 'with the listener never fired, can all three assertions pass?',
            assertions: t1cap,
            verdict: (t1cap.sameDomNode && t1cap.stillTheActiveElement && t1cap.typedDigitSurvived)
                ? 'TEST 1 IS SATISFIABLE - a fix can reach it'
                : 'TEST 1 IS UNSATISFIABLE - rewrite it',
        },
        test2: {
            mustPassAlways: true,
            sameGroupScoreChanged: two.changedKey,
            onScreenBefore: two.onScreenBefore, expected: two.expected,
            onScreenAfter: two.onScreenAfter,
            verdict: t2pass ? 'PASS' : 'FAIL',
        },
        test2_inertness_control: {
            question: 'with the listener never fired, does the new number still appear?',
            onScreenBefore: inert.onScreenBefore, expected: inert.expected,
            onScreenAfter: inert.onScreenAfter,
            newValueAppearedWithoutARefire: !!inert.newValueReachedTheScreen,
            verdict: t2live ? 'TEST 2 IS LIVE' : 'TEST 2 IS INERT',
        },
        test8_never_detached: {
            ownedBy: 'STEP 2',
            test1Scenario: { connectedAfter: eight.connectedAfter,
                parentChanged: eight.parentChanged,
                focusCallsDuringUpdate: eight.focusCallsDuringUpdate,
                stillInTheList: eight.stillInTheList },
            test4Scenario: { pageOwnWriteRan: eight.echoWriteRan,
                connectedAfter: eight.echo_connectedAfter,
                parentChanged: eight.echo_parentChanged,
                focusCalls: eight.echo_focusCalls },
            control_probeSeesADetach: {
                standIn: 'the pre-Step-2 detach-and-refocus path, installed from '
                    + 'outside the page - no file edited',
                parentChanged: eightCtl.parentChanged,
                focusCallsDuringUpdate: eightCtl.focusCallsDuringUpdate,
                connectedAfter: eightCtl.connectedAfter,
                verdict: eightCtl.parentChanged ? 'PROBE CAN SEE A DETACH' : 'PROBE IS INERT',
            },
            assertions: t8,
            verdict: (t8.neverDetached && t8.focusNeverCalled
                && t8.echo_neverDetached && t8.echo_focusNeverCalled) ? 'PASS' : 'FAIL',
        },
        test9_shape_change_still_rebuilds: {
            control_scoreChangeUsedTheInPlacePath: !!nine.scoreChangeReusedTheNodes,
            inputs: nine.inputsBefore + ' -> ' + nine.inputsAfter,
            newGolfersInputs: nine.newGolfersScoresShown,
            rosterNamesTheNewGolfer: !!nine.rosterNamesTheNewGolfer,
            verdict: (nine.cardGrew && nine.rosterNamesTheNewGolfer
                && nine.newGolfersScoresShown === 18) ? 'PASS' : 'FAIL',
        },
        test5_scroll_position: {
            ownedBy: 'STEP 2 - not Step 1. Expected red until the wholesale rebuild goes.',
            scrolledTo: 'hole 12',
            elementThatActuallyScrolls: five.scrolledElements,
            baseline: five.baseline, after: five.after, deltas: five.deltas,
            control_probeDetectsADeliberateMove: !!five.probeDetectsAMove,
            control_baselineHoldsWithNoRefire: !!fiveNoFire.unchangedWithoutARefire,
            verdict: t5pass ? 'PASS' : 'FAIL',
        },
        test3: {
            refiresDriven: one.refiresDriven,
            refiresThatReplacedTheFocusedNode: one.refiresThatReplacedTheNode,
            replacementsPerWrite: ratio,
            statedArrivalRate: '1 score / 4 s per group, ' + otherGroups + ' other groups',
            otherGroupWritesPerMinute: writesPerMinute,
            focusedInputReplacementsPerMinute: replacementsPerMinute,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
