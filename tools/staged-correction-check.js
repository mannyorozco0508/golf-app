#!/usr/bin/env node
// ============================================================================
// A CORRECTION THE ORGANIZER CAN STILL TAKE BACK.
//
// frCorrectScore writes through saveScore the instant a digit changes, so the
// impact panel has always described a change that ALREADY HAPPENED. There is
// nothing to accept, because nothing is pending, and nothing to discard, because
// the round already moved. undoAuditEntry can put one value back and logs the
// undo as a further entry - a trail of second thoughts rather than a decision.
//
// This proves the review STAGES: corrections are held in the page, the impact
// panel diffs ALL of them together against the round as it stands, and nothing
// reaches Firebase until the organizer commits.
//
// EVERY WRITE THE PAGE ISSUES IS RECORDED. The firebase stand-in is wrapped
// before any page script runs, so set/update/remove are counted whoever calls
// them. "Zero writes" is measured, not assumed.
//
// HAND-COMPUTED MONEY. The skins fixture is built so the arithmetic can be done
// on paper, and the assertions carry the paper figures - never a second opinion
// from the engine under test:
//
//   Pool: 4 golfers x $10 = $40, skins takes the whole pot, NO CARRY, and the
//   round is settlementMode 'whole-dollar' - so pool-engine uses
//   allocateWholeDollars over the units, NOT the fractional telescoping branch.
//   The first version of this arithmetic used the wrong branch: it computed
//   floor(4000*1/3) = 1333c and asserted $13 where the app pays $14. The paper
//   figure was wrong and the app was right, which is what asserting the paper
//   figure is for.
//
//   Baseline: P101 wins holes 1 and 2, P102 wins hole 7, every other hole tied.
//     weights [1,1,1] over $40 -> 14, 13, 13   (spare dollars to the earliest holes)
//       H1 $14   H2 $13   H7 $13
//     P101 -10 + 14 + 13 = +$17     P102 -10 + 13 = +$3
//     P103 -$10                     P104 -$10           sum 0
//   Correct P101 hole 7 to 3, and hole 7 ties - no skin. Two units remain:
//     weights [1,1] over $40 -> 20, 20
//       H1 $20   H2 $20
//     P101 -10 + 20 + 20 = +$30     P102 -10 + 0 = -$10
//     P103 -$10                     P104 -$10           sum 0
//
//   HOLE 1 IS RE-PRICED FROM $14 TO $20 BY A CORRECTION SIX HOLES LATER. That is
//   the blast radius the recon measured, and it is why the panel must diff the
//   whole round rather than the hole that changed.
//
//   node tools/staged-correction-check.js
//
//   exit 0   corrections stage, commit once, and discard completely
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const TOKEN = 'orgtok1';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Marty Sharp', 'Manny Orozco', 'Lance Webb', 'Zach Hill'];

// Writer-shaped: playingForMoney, a team, a real handicap string, an organizer
// token on the round - the shape index.html itself writes.
function baseRound(opts) {
    const o = opts || {};
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '0',
        playingForMoney: true, team: i < 2 ? 'Team 1' : 'Team 2' }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    // The three skins of the hand computation above.
    scores['p101_h1'] = 3;
    scores['p101_h2'] = 3;
    scores['p102_h7'] = 3;
    const r = {
        eventName: 'Correction Review', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, settlementMode: 'whole-dollar',
        organizerToken: TOKEN,
        moneyPool: { enabled: true, buyIn: 10,
                     skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    };
    if (o.press) {
        // A side match with one press. The press is a STORED AGREEMENT - this
        // fixture never asks whether it should have fired, only what it pays.
        // teamAIds / teamBIds, NOT teamA / teamB. buildSideMatchReceipts filters the
        // field on those two keys and returns early when either side is empty - the
        // first version of this fixture used the wrong names and produced no receipt
        // at all, which reads exactly like "presses are not in the snapshot".
        // format 'stroke' is the branch that carries overallPresses and labels its
        // segments "Overall Press N".
        r.sideMatches = { sm1: {
            id: 'sm1', name: 'Marty v Lance', scoring: 'net', format: 'stroke',
            teamAIds: [101], teamBIds: [103], startHole: 1,
            overallStake: 20, overallMode: 'stroke', stake: 20,
            overallPresses: { pr1: { startHole: 10, stake: 20 } },
        } };
    }
    return r;
}

// Wraps whatever firebase object the page is handed. cold-arrival installs its
// stand-in FIRST, so this wraps what is already there rather than installing a
// setter and leaving the page with nothing - which renders an empty page and
// reads exactly like "everything is locked".
const PRE = `
(function () {
  window.__writes = [];
  function wrap(v) {
    return {
      initializeApp: function () { return {}; }, apps: [],
      database: function () {
        var d = v.database();
        return { ref: function (p) {
          var r = d.ref(p);
          return {
            key: r.key,
            on: function (ev, cb) { return r.on(ev, cb); },
            off: function () { return r.off(); },
            once: function () { return r.once(); },
            set: function (val) { window.__writes.push({ op: 'set', path: String(p), val: val }); return r.set(val); },
            update: function (val) { window.__writes.push({ op: 'update', path: String(p), val: val }); return r.update(val); },
            remove: function () { window.__writes.push({ op: 'remove', path: String(p) }); return r.remove(); },
            push: function () { var q = r.push(); window.__writes.push({ op: 'push', path: String(p) }); return q; }
          };
        } };
      }
    };
  }
  var real = window.firebase ? wrap(window.firebase) : undefined;
  Object.defineProperty(window, 'firebase', {
    configurable: true,
    get: function () { return real; },
    set: function (v) { real = wrap(v); }
  });
  window.print = function () {};
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
})();`;

// Drives the page's OWN controls: the nav button, the review row, the hole
// input's onchange, the commit and discard buttons. No page function is called
// by name from here - a probe that invokes what it measures proves only that the
// function works when invoked.
const PROBE = `
(() => {
  const out = { steps: [] };
  const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\\s+/g,' ').trim() : null; };
  const byHandler = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  const step = s => out.steps.push(s);

  // 1. THE SCORECARD STILL WRITES. The control for "zero writes" later: if this
  //    reads the same as the review, the probe cannot see a write at all.
  const sc = Array.from(document.querySelectorAll('input.score-input'))[0];
  if (sc) { sc.value = '7'; sc.dispatchEvent(new Event('change', { bubbles: true })); }
  out.scorecardWrites = window.__writes.slice();
  window.__writes.length = 0;
  step('scorecard input driven: ' + out.scorecardWrites.length + ' write(s)');

  // 2. WALK TO THE LAST HOLE THE WAY A GROUP DOES. The Finish control only
  //    exists on the final hole of the hole view - index.html:2152 - so a probe
  //    that lands mid-card finds no button and would report the review missing.
  //    Pressing the page's own Next is how a fourball gets there.
  for (let i = 0; i < 25 && !document.querySelector('.finish-round-nav-btn'); i++) {
    const next = byHandler('button', /goToAdjacentHole\\(1\\)/);
    if (!next) break;
    next.click();
  }
  out.walkedToLastHole = !!document.querySelector('.finish-round-nav-btn');

  // Open the review the way a finger does.
  const navBtn = byHandler('button', /openFinishRoundModal/);
  out.foundNavButton = !!navBtn;
  if (navBtn) navBtn.click();
  out.reviewVisible = (() => { const e = document.getElementById('fr-state-review');
      return !!e && e.style.display !== 'none'; })();

  const openPlayer = id => {
    const row = byHandler('div', new RegExp('frOpenPlayer\\\\(' + id + '\\\\b'));
    if (row) row.click();
    return !!row;
  };
  const holeInput = n => Array.from(document.querySelectorAll('#fr-detail-holes input'))[n - 1];
  const type = (n, v) => { const i = holeInput(n); if (!i) return false;
      i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); return true; };

  // 3. TWO CORRECTIONS, TWO DIFFERENT PLAYERS.
  out.openedA = openPlayer(101);
  out.typedA = type(7, 3);                       // Marty ties hole 7 -> no skin
  out.impactAfterFirst = txt('fr-detail-impact');
  const back = byHandler('button', /frBackToReview/);
  if (back) back.click();
  out.openedB = openPlayer(102);
  out.typedB = type(4, 3);                       // Manny wins hole 4
  out.impactAfterSecond = txt('fr-detail-impact');
  out.detailInputsB = Array.from(document.querySelectorAll('#fr-detail-holes input')).map(i => i.value).join(',');

  // 4. WHAT REACHED THE DATABASE WHILE STAGING.
  out.writesWhileStaging = window.__writes.slice();

  // 5. THE TWO CONTROLS.
  const commit = byHandler('button', /frCommitCorrections/);
  const discard = byHandler('button', /frDiscardCorrections/);
  out.hasCommit = !!commit;
  out.hasDiscard = !!discard;

  if (MODE === 'commit' && commit) {
    window.__writes.length = 0;
    commit.click();
    out.writesOnCommit = window.__writes.slice();
    out.impactAfterCommit = txt('fr-detail-impact');
  }
  if (MODE === 'discard' && discard) {
    window.__writes.length = 0;
    discard.click();
    out.writesOnDiscard = window.__writes.slice();
    out.impactAfterDiscard = txt('fr-detail-impact');
    out.inputsAfterDiscard = Array.from(document.querySelectorAll('#fr-detail-holes input')).map(i => i.value).join(',');
  }
  out.alerts = window.__alerts.slice(0, 3);
  return JSON.stringify(out);
})()`;

// The press fixture asks one extra question of the panel.
const PRESS_PROBE = `
(() => {
  const out = {};
  const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\\s+/g,' ').trim() : null; };
  const byHandler = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  for (let i = 0; i < 25 && !document.querySelector('.finish-round-nav-btn'); i++) {
    const n = byHandler('button', /goToAdjacentHole\\(1\\)/);
    if (!n) break;
    n.click();
  }
  const nav = byHandler('button', /openFinishRoundModal/);
  if (nav) nav.click();
  const row = byHandler('div', /frOpenPlayer\\(101\\b/);
  if (row) row.click();
  const i = Array.from(document.querySelectorAll('#fr-detail-holes input'))[11];  // hole 12
  if (i) { i.value = '2'; i.dispatchEvent(new Event('change', { bubbles: true })); }
  out.impact = txt('fr-detail-impact');
  out.writes = window.__writes.length;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('staged-correction-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// The WebKit runner builds the SAME fixtures and reads the SAME probes.
function buildDb() {
    return { events: { SKINS: baseRound({}), PRESSED: baseRound({ press: true }),
                       NOPRESS: baseRound({}) } };
}
module.exports = { buildDb, baseRound, PRE, PROBE, PRESS_PROBE, TOKEN };

if (require.main !== module) return;

(async () => {
    const problems = [];
    const url = code => fileUrl('index.html', 'game=' + code + '&organizer=' + TOKEN);

    const run = async (code, db, mode, probe) => {
        const r = await arriveCold({ url: url(code), db: db,
            expression: 'const MODE = ' + JSON.stringify(mode) + ';\n' + (probe || PROBE),
            preScript: PRE, settleMs: 5200 });
        if (!r.ok) bail(code + '/' + mode + ': ' + r.reason);
        try { return JSON.parse(r.value); } catch (e) { bail(code + '/' + mode + ': unreadable probe output'); }
    };

    const DB = buildDb();

    const stage = await run('SKINS', DB, 'stage');
    const commit = await run('SKINS', DB, 'commit');
    const discard = await run('SKINS', DB, 'discard');
    const pressed = await run('PRESSED', DB, 'stage', PRESS_PROBE);
    const nopress = await run('NOPRESS', DB, 'stage', PRESS_PROBE);

    // NOTHING WAS MEASURED if the review never opened.
    if (!stage.foundNavButton) bail('the Finish Round control is not on the page');
    if (!stage.openedA || !stage.typedA) bail('the review would not open a player, or has no hole inputs');

    const impact = String(stage.impactAfterSecond || '');
    const A = {
        // CONTROL - the probe can see a write. The ordinary scorecard is untouched
        // by this wave and must still write immediately.
        control_theOrdinaryScorecardStillWritesImmediately:
            stage.scorecardWrites.length > 0
            && stage.scorecardWrites.some(w => /\/scores\//.test(w.path)),

        // TEST 1 - STAGING WRITES NOTHING
        stagingIssuedZeroWrites: stage.writesWhileStaging.length === 0,
        bothCorrectionsWereAccepted: stage.typedA === true && stage.typedB === true,
        // ...and the panel reflects BOTH together, not just the last one.
        impactNamesBothCorrections: /Hole 7/.test(impact) && /Hole 4/.test(impact),
        impactNamesBothGolfers: /Marty Sharp/.test(impact) && /Manny Orozco/.test(impact),

        // TEST 4 - THE BLAST RADIUS, HAND-COMPUTED, and asserted against the panel
        // as it stood after the FIRST correction alone. Staging BOTH corrections
        // gives hole 4 the skin hole 7 lost, so totalUnits returns to 3 and hole 1
        // is correctly unchanged - the earlier version of this assertion read the
        // two-correction panel and would have condemned a correct diff.
        //   before  allocateWholeDollars(40, [1,1,1]) -> 14  -> +$14
        //   after   allocateWholeDollars(40, [1,1])   -> 20  -> +$20
        impactShowsTheRepricedEarlierHole:
            /Hole 1 skin value: \+\$14 → \+\$20/.test(String(stage.impactAfterFirst || '')),
        // AND THE MONEY, on paper. P101 -10 +14 +13 = +$17 becomes -10 +20 +20 = +$30;
        // P102 -10 +13 = +$3 becomes -10 = -$10. Asserted as the panel prints them.
        impactMoneyMatchesTheHandFigures:
            /Marty Sharp: \+\$17 → \+\$30/.test(String(stage.impactAfterFirst || ''))
            && /Manny Orozco: \+\$3 → -\$10/.test(String(stage.impactAfterFirst || '')),
        impactShowsTheChangedHoleLosingItsSkin: /Hole 7 skin: Manny Orozco → no skin/.test(impact),

        // TEST 2 - COMMIT
        theCommitControlExists: stage.hasCommit === true,
        commitWritesBothScores: !!commit.writesOnCommit
            && commit.writesOnCommit.filter(w => w.op === 'set' && /\/scores\/p10[12]_h[47]$/.test(w.path)).length === 2,
        commitWritesTheAuditTrail: !!commit.writesOnCommit
            && commit.writesOnCommit.filter(w => /auditLog/.test(w.path)).length >= 2,
        commitWritesEachScoreExactlyOnce: !!commit.writesOnCommit
            && new Set(commit.writesOnCommit.filter(w => /\/scores\//.test(w.path)).map(w => w.path)).size
               === commit.writesOnCommit.filter(w => /\/scores\//.test(w.path)).length,

        // TEST 3 - DISCARD
        theDiscardControlExists: stage.hasDiscard === true,
        discardIssuedZeroWrites: !!discard.writesOnDiscard && discard.writesOnDiscard.length === 0,
        discardClearedThePanel: !discard.impactAfterDiscard
            || !/Hole 7/.test(String(discard.impactAfterDiscard)),
        // ...and the card reads as it originally did. The panel being empty is not
        // enough: an input still showing the discarded digit would be a round that
        // looks corrected and is not.
        discardRestoredTheCard:
            discard.inputsAfterDiscard === '4,4,4,4,4,4,3,4,4,4,4,4,4,4,4,4,4,4',
        // CONTROL - discard is not a no-op that never staged anything.
        control_theDiscardedDiffWasNotEmpty: /Hole 7/.test(String(discard.impactAfterSecond || '')),

        // TEST 5 - PRESSES IN THE SNAPSHOT
        pressRoundNamesThePress: /press/i.test(String(pressed.impact || '')),
        pressRoundStagedNothing: pressed.writes === 0,
        // CONTROL - a round with no presses produces no press lines.
        control_aRoundWithNoPressesHasNoPressLine: !/press/i.test(String(nopress.impact || '')),
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    const report = {
        handComputed: {
            allocator: "whole-dollar (settlementMode 'whole-dollar'), NOT the fractional branch",
            baselineSkins: { h1: 14, h2: 13, h7: 13, units: [1, 1, 1], pot: 40 },
            afterHole7Corrected: { h1: 20, h2: 20, units: [1, 1], pot: 40 },
            baselineNet: { 'Marty Sharp': 17, 'Manny Orozco': 3, 'Lance Webb': -10, 'Zach Hill': -10 },
            afterNet: { 'Marty Sharp': 30, 'Manny Orozco': -10, 'Lance Webb': -10, 'Zach Hill': -10 },
        },
        stage: { scorecardWrites: stage.scorecardWrites, writesWhileStaging: stage.writesWhileStaging,
                 hasCommit: stage.hasCommit, hasDiscard: stage.hasDiscard,
                 impactAfterFirst: String(stage.impactAfterFirst || '').slice(0, 400),
                 impactAfterSecond: impact.slice(0, 600), alerts: stage.alerts },
        commit: { writesOnCommit: commit.writesOnCommit, impactAfterCommit: String(commit.impactAfterCommit || '').slice(0, 200) },
        discard: { writesOnDiscard: discard.writesOnDiscard,
                   impactBefore: String(discard.impactAfterSecond || '').slice(0, 200),
                   impactAfter: String(discard.impactAfterDiscard || '').slice(0, 200),
                   inputsAfterDiscard: discard.inputsAfterDiscard },
        press: { withPress: String(pressed.impact || '').slice(0, 400), writes: pressed.writes,
                 withoutPress: String(nopress.impact || '').slice(0, 300) },
        assertions: A,
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
