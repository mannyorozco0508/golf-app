#!/usr/bin/env node
// ============================================================================
// HOW MANY COMPETITORS ARE THERE? ONE QUESTION, ANSWERED BY COUNTING TEAMS.
//
// An individual event stores its field in players/ and nothing in teams/, so
// every place that counts teams to mean competitors reads zero:
//
// TEST 16  THE FLIGHT GUARD. "A FLIGHT IN USE IS NOT DELETED" counts teams, so
//          on an individual event a flight holding three golfers reports "0
//          teams", its delete button is enabled, and pressing it removes the
//          flight and leaves three golfers pointing at nothing. The guard does
//          the exact thing its own comment says it exists to prevent. This is
//          first because it destroys data.
// TEST 17  THE POOL. entryFee x team count, so a $300 entry fee on a
//          three-golfer field is a $0 pool, every payout is $0.00, and the
//          organizer is told "No entry fee set for this tournament".
//
// EVERY ASSERTION HAS A CONTROL, AND THE CONTROLS ARE THE POINT:
//   - a TEAM fixture must behave identically before and after, or the fix has
//     broken the model that already worked
//   - an EMPTY flight must stay deletable in both models. A "fix" that simply
//     disables every delete button would pass Test 16 and be worthless
//   - the payout mismatch banner is MUTE today, because it is gated on
//     pool > 0. Proving it can fire is what shows the pool became real rather
//     than merely non-zero somewhere
//
//   node tools/tournament-pool-and-flight-check.js
//
//   exit 0   the competitor count means competitors
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');   // WAVE 8: writer-shaped fixtures

const COURSE = [];
for (let i = 1; i <= 18; i++) COURSE.push({ hole: i, par: 4, hcpIndex: i });

// MIRRORS createFlight: { id, name, createdAt }, with a minted id.
const USED_FLIGHT = { id: F.newFlightId(), name: 'Championship', createdAt: 1 };
const EMPTY_FLIGHT = { id: F.newFlightId(), name: 'Empty Flight', createdAt: 2 };
const FLIGHTS = {};
FLIGHTS[USED_FLIGHT.id] = USED_FLIGHT;
FLIGHTS[EMPTY_FLIGHT.id] = EMPTY_FLIGHT;   // Control B

function individualField() {
    const field = F.playerField([1, 2, 3].map(i =>
        ({ name: 'Golfer ' + i, handicap: '0', flightId: USED_FLIGHT.id })));
    const scores = {};
    field.ids.forEach((pid, i) => {
        for (let h = 1; h <= 18; h++) scores[pid + '_h' + h] = 4 + i;
    });
    const groups = {};
    const g = F.scoringGroup('Group 1', field.ids, 1);
    groups[g.id] = g;
    return F.eventRecord({
        name: 'Club Championship', format: 'individual', scoringMode: 'gross',
        courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
        entryFee: 300, players: field.players, scoringGroups: groups,
        flights: FLIGHTS, scores: scores,
    });
}

function teamField() {
    const teams = {}, scores = {};
    for (let n = 1; n <= 3; n++) {
        teams['team' + n] = { num: n, name: 'Team ' + n, handicap: 0,
            players: ['A' + n, 'B' + n], flightId: USED_FLIGHT.id };
        for (let h = 1; h <= 18; h++) scores['team' + n + '_h' + h] = 3 + n;
    }
    return F.eventRecord({
        name: 'Benefit Scramble', format: 'scramble', courseName: 'Caledonia',
        activeCourseKey: 'c', courseData: COURSE, entryFee: 300,
        teams: teams, flights: FLIGHTS, scores: scores,
    });
}

const CAPTURE = `
(function () {
  window.__writes = []; window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () { window.__printed = true; };
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments); var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p);
      ['set', 'update', 'remove'].forEach(function (op) { var fn = r[op];
        r[op] = function (v) { window.__writes.push(op + ' ' + p); return fn.apply(r, arguments); }; });
      return r; };
    return d; };
})();`;

// --- TEST 16 ---------------------------------------------------------------
const PROBE_FLIGHT = ((USED, EMPTY) => `
(() => {
  const out = {};
  const rowFor = fid => Array.from(document.querySelectorAll('#flights-list .flight-row'))
      .find(r => { const b = r.querySelector('button.flight-del');
                   return b && (b.getAttribute('onclick') || '').indexOf("'" + fid + "'") !== -1; });

  const inspect = fid => {
    const row = rowFor(fid);
    if (!row) return { missing: true };
    const btn = row.querySelector('button.flight-del');
    const before = window.__writes.length, alerts = window.__alerts.length;
    const state = {
      text: (row.innerText || '').replace(/\\s+/g, ' ').trim(),
      disabled: btn.hasAttribute('disabled'),
    };
    btn.click();
    state.writes = window.__writes.slice(before);
    state.alerts = window.__alerts.slice(alerts);
    state.survived = state.writes.length === 0;
    return state;
  };

  // The USED flight first - a delete here would be the data loss.
  out.usedFlight = inspect('${USED}');
  // CONTROL B: the empty one must still go.
  out.emptyFlight = inspect('${EMPTY}');
  return JSON.stringify(out);
})()`)(USED_FLIGHT.id, EMPTY_FLIGHT.id);

// --- TEST 17 ---------------------------------------------------------------
const PROBE_POOL = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const out = {};
  out.manageHeaderPool = t('manage-t-pool');

  const tab = document.getElementById('tab-btn-leaderboard');
  if (tab) tab.click();
  out.payoutSubLine = t('payout-pool-sub');
  const spots = Array.from(document.querySelectorAll('#payout-spot-amounts input'));
  out.spotCount = spots.length;
  out.spotValues = spots.map(s => s.value);
  out.spotTotal = spots.reduce((sum, s) => sum + (parseFloat(s.value) || 0), 0);
  out.payoutResults = t('payout-results');

  // THE BANNER. It is gated on pool > 0, so on a zero pool it cannot appear at
  // all. Push one spot out of line and see whether the page objects.
  out.bannerBeforeEditing = /add up to/.test(t('payout-results') || '');
  if (spots.length) {
    spots[0].value = String((parseFloat(spots[0].value) || 0) + 55);
    spots[0].dispatchEvent(new Event('input', { bubbles: true }));
  }
  out.payoutResultsAfterEditing = t('payout-results');
  out.bannerFired = /add up to/.test(out.payoutResultsAfterEditing || '');

  const pb = Array.from(document.querySelectorAll('button'))
      .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
  if (pb) pb.click();
  const psub = document.querySelector('#tournament-print-view p');
  out.printSubtitle = psub ? (psub.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-pool-and-flight-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// EXPORTED so the SAME fixtures and probes run on a second engine.
module.exports = { individualField: individualField, teamField: teamField,
    CAPTURE: CAPTURE, PROBE_FLIGHT: PROBE_FLIGHT, PROBE_POOL: PROBE_POOL };

if (require.main !== module) return;

(async () => {
    const IND = individualField();
    const TEAM = teamField();
    const db = { tournaments: { IND, TEAM }, trips: {} };

    const run = async (code, expression) => {
        const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code),
            db, expression, preScript: CAPTURE, settleMs: 4200,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const flIND = await run('IND', PROBE_FLIGHT);
    const flTEAM = await run('TEAM', PROBE_FLIGHT);
    const poolIND = await run('IND', PROBE_POOL);
    const poolTEAM = await run('TEAM', PROBE_POOL);

    // --- CONTROLS, CHECKED BEFORE ANY FINDING IS BELIEVED -------------------
    if (flIND.usedFlight.missing || flTEAM.usedFlight.missing) {
        bail('the flights list did not render - nothing was measured');
    }
    // CONTROL A proves the probe can read a disabled button and a refused click.
    if (!flTEAM.usedFlight.disabled || !flTEAM.usedFlight.survived) {
        bail('CONTROL A FAILED - on a TEAM event the used flight is not protected, so '
            + 'the probe cannot demonstrate protection anywhere. Team reading: '
            + JSON.stringify(flTEAM.usedFlight));
    }
    // Pool control: the team model must already work, or $900 proves nothing.
    if (!/900/.test(poolTEAM.manageHeaderPool || '')) {
        bail('CONTROL FAILED - the TEAM pool is not $900 on a 300 x 3 field, so the '
            + 'individual reading cannot be compared to a working one: '
            + JSON.stringify(poolTEAM.manageHeaderPool));
    }

    const problems = [];
    // PLURALS. \bteam\b does not match "teams" - the word boundary needs the s
    // to be optional, or every one of these reads false on correct copy. Caught
    // by running the controls against the CURRENT code first: the team fixture,
    // which genuinely says "3 teams", reported that it did not.
    const noun = (text, want, avoid) =>
        new RegExp('\\b' + want + 's?\\b', 'i').test(text || '')
        && !new RegExp('\\b' + avoid + 's?\\b', 'i').test(text || '');

    // --- TEST 16 ------------------------------------------------------------
    const t16 = {
        usedFlight_countsTheThreeGolfers: /\b3\b/.test(flIND.usedFlight.text || ''),
        usedFlight_namesGolfersNotTeams: noun(flIND.usedFlight.text, 'golfer', 'team'),
        usedFlight_deleteDisabled: flIND.usedFlight.disabled === true,
        usedFlight_clickWroteNothing: flIND.usedFlight.survived === true,
        controlA_teamUsedFlightStillProtected: flTEAM.usedFlight.disabled === true
            && flTEAM.usedFlight.survived === true,
        controlB_emptyFlightStillDeletable_individual:
            flIND.emptyFlight.disabled === false && flIND.emptyFlight.survived === false,
        controlB_emptyFlightStillDeletable_team:
            flTEAM.emptyFlight.disabled === false && flTEAM.emptyFlight.survived === false,
    };
    Object.keys(t16).forEach(k => { if (!t16[k]) problems.push('TEST 16 ' + k + ': FAILED'); });

    // --- TEST 17 ------------------------------------------------------------
    const t17 = {
        manageHeader_showsNineHundred: /900/.test(poolIND.manageHeaderPool || ''),
        subLine_showsNineHundred: /900/.test(poolIND.payoutSubLine || ''),
        subLine_namesGolfersNotTeams: noun(poolIND.payoutSubLine, 'golfer', 'team'),
        spotDefaults_sumToNineHundred: Math.abs((poolIND.spotTotal || 0) - 900) < 0.05,
        printedSheet_showsPool: /Pool: \$900/.test(poolIND.printSubtitle || ''),
        mismatchBanner_canFire: poolIND.bannerFired === true,
        mismatchBanner_wasQuietBeforeEditing: poolIND.bannerBeforeEditing === false,
        control_teamPoolUnchangedAtNineHundred: /900/.test(poolTEAM.manageHeaderPool || '')
            && Math.abs((poolTEAM.spotTotal || 0) - 900) < 0.05,
        control_teamSubLineStillSaysTeams: noun(poolTEAM.payoutSubLine, 'team', 'golfer'),
        // THE BANNER MECHANISM WORKS - proved on the model whose pool is already
        // real. That is what makes its silence on an individual event
        // attributable to the pool being zero rather than to a broken banner.
        control_teamBannerFires: poolTEAM.bannerFired === true,
    };
    Object.keys(t17).forEach(k => { if (!t17[k]) problems.push('TEST 17 ' + k + ': FAILED'); });

    const report = {
        TEST_16_flight_guard: {
            individual_usedFlight: flIND.usedFlight,
            individual_emptyFlight_controlB: flIND.emptyFlight,
            team_usedFlight_controlA: flTEAM.usedFlight,
            team_emptyFlight_controlB: flTEAM.emptyFlight,
            assertions: t16,
        },
        TEST_17_pool: {
            individual: {
                manageHeader: poolIND.manageHeaderPool,
                subLine: poolIND.payoutSubLine,
                spotValues: poolIND.spotValues, spotTotal: poolIND.spotTotal,
                payouts: (poolIND.payoutResults || '').slice(0, 140),
                printSubtitle: poolIND.printSubtitle,
                bannerQuietBeforeEditing: poolIND.bannerBeforeEditing,
                bannerAfterEditingASpot: (poolIND.payoutResultsAfterEditing || '').slice(0, 120),
                bannerFired: poolIND.bannerFired,
            },
            team_control: {
                manageHeader: poolTEAM.manageHeaderPool,
                subLine: poolTEAM.payoutSubLine,
                spotTotal: poolTEAM.spotTotal,
                bannerFired: poolTEAM.bannerFired,
            },
            assertions: t17,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
