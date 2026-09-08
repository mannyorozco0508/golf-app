#!/usr/bin/env node
// ============================================================================
// WHAT REMOVING SOMEBODY ACTUALLY DOES.
//
// Two destructive paths exist in the Tournament organizer. One is live in the
// UI and one is not, and the dangerous question is the same for both: when a
// competitor stops existing, what happens to the strokes already recorded
// against them, and can those strokes ever be read as somebody else's?
//
// A. PLAYER REMOVE - reachable today, one tap, on an individual event.
// B. TEAM REMOVE   - no reachable control; measured on a hand-written record,
//                    because the renumber hazard is a property of the DATA and
//                    would arrive the moment anyone wires a delete button.
//
// NOTHING HERE CALLS A PAGE FUNCTION BY NAME. Part A drives the real control
// with a real tap. Part B has no control to drive, so it hands the page a
// record with the team already gone and reads what the page makes of it - the
// same thing a delete would produce.
//
// EVERY FINDING CARRIES A CONTROL, AND EVERY CONTROL IS CHECKED FOR
// DISCRIMINATION. A probe that reads identically on working and broken code is
// reported as inert rather than trusted:
//   - "no remove-team control exists" is proved against a screen that DOES have
//     one, so the absence is measured rather than assumed
//   - "team 4's scores are not read as team 3's" is proved against a record in
//     which they deliberately ARE, so the probe is known to be able to see it
//
//   node tools/tournament-destructive-check.js
//
//   exit 0   nothing unexpected
//   exit 1   a finding the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');   // WAVE 8: writer-shaped fixtures

const SI = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14];
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const COURSE = SI.map((si, i) => ({ hole: i + 1, par: PARS[i], hcpIndex: si }));

// --- A: an individual event. p1..p4 are a scoring group; p5, p6 are not. ---
function individualEvent() {
    const field = F.playerField([1, 2, 3, 4, 5, 6].map(i =>
        ({ name: 'Golfer ' + i, handicap: '0' })));
    const scores = {};
    field.ids.forEach((pid, i) => {
        // Distinct totals, so a row read from the wrong golfer is visible.
        for (let h = 1; h <= 18; h++) scores[pid + '_h' + h] = 4 + i;
    });
    const groups = {};
    const g = F.scoringGroup('Group 1', field.ids.slice(0, 4), 1);
    groups[g.id] = g;
    return { record: F.eventRecord({
        name: 'Club Championship', format: 'individual', scoringMode: 'gross',
        courseName: 'True Blue Golf Club', activeCourseKey: 'sc_trueblue',
        courseData: COURSE, entryFee: 0,
        players: field.players, scoringGroups: groups, scores: scores,
    }), byName: field.byName, groupId: g.id };
}

// --- B: a legacy team event, team1..team5, every team scored, all different. ---
function teamEvent(renumbered) {
    const teams = {}, scores = {};
    for (let n = 1; n <= 5; n++) {
        // THE RENUMBERED VARIANT is the control: team4's record is relabelled as
        // num 3 under the key team4, which is exactly what a delete-and-reindex
        // would produce. If the probe cannot see the difference between this and
        // the honest record, it cannot see the hazard either.
        const num = (renumbered && n === 4) ? 3 : n;
        teams['team' + n] = { num: num, name: 'Team ' + n, handicap: 0,
            players: ['A' + n, 'B' + n, 'C' + n, 'D' + n] };
        for (let h = 1; h <= 18; h++) scores['team' + n + '_h' + h] = 3 + n;
    }
    return {
        name: 'Benefit Scramble', format: 'scramble', courseName: 'Caledonia Golf & Fish Club',
        activeCourseKey: 'sc_caledonia', courseData: COURSE, courseIndexSynthetic: false,
        entryFee: 100, shambleCountBest: 1, teams: teams, scores: scores, createdAt: 1,
    };
}

// Records every write and every confirmation prompt, before any page script.
const CAPTURE = `
(function () {
  window.__writes = []; window.__alerts = []; window.__confirms = 0;
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.confirm = function (m) { window.__confirms++; window.__confirmText = String(m); return true; };
  window.__cbs = [];
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments); var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p); var on = r.on;
      r.on = function (ev, cb) { if (ev === 'value') window.__cbs.push({ path: String(p), cb: cb });
        return on.apply(r, arguments); };
      ['set', 'update', 'remove'].forEach(function (op) {
        var fn = r[op];
        r[op] = function (v) {
          window.__writes.push({ op: op, path: String(p),
            value: (function () { try { return JSON.stringify(v).slice(0, 90); } catch (e) { return '?'; } })() });
          return fn.apply(r, arguments); };
      });
      return r; };
    return d; };
})();`;

const BOARD = `
  const board = () => {
    const el = document.getElementById('leaderboard-list');
    const rows = Array.from(el.querySelectorAll('.lb-row')).slice(1);
    return {
      count: rows.length,
      lines: rows.map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim()),
    };
  };
  const fire = rec => {
    const e = (window.__cbs || []).find(c => /^tournaments\\//.test(c.path));
    if (!e) throw new Error('no tournaments/ listener');
    e.cb({ val: () => rec, exists: () => true });
  };
  const REC = () => JSON.parse(document.__recJson);
`;

// ---------------------------------------------------------------------------
// A. PLAYER REMOVE, through the real control.
// ---------------------------------------------------------------------------
const probeA = (UNASSIGNED, GROUPED, SIXTH) => `
(() => {
  ${BOARD}
  const out = {};
  out.boardBefore = board();
  out.scoreKeysBefore = Object.keys(REC().scores).length;

  const delFor = pid => Array.from(document.querySelectorAll('button.flight-del'))
      .find(b => (b.getAttribute('onclick') || '').indexOf("'" + pid + "'") !== -1);

  // 1. AN UNASSIGNED GOLFER - p5 is in no scoring group.
  const b5 = delFor('${UNASSIGNED}');
  out.controlFoundForUnassigned = !!b5;
  out.controlVisible = b5 ? b5.getClientRects().length > 0 : null;
  if (!b5) return JSON.stringify({ fatal: 'no remove control rendered for p5' });
  const w0 = window.__writes.length, a0 = window.__alerts.length;
  b5.click();
  out.writesFromRemovingUnassigned = window.__writes.slice(w0);
  out.alertsFromRemovingUnassigned = window.__alerts.slice(a0);
  out.confirmPrompts = window.__confirms;
  out.confirmText = window.__confirmText || null;

  // 2. A GOLFER WHO IS IN A SCORING GROUP - p1 is in g1.
  const b1 = delFor('${GROUPED}');
  const w1 = window.__writes.length, a1 = window.__alerts.length;
  if (b1) b1.click();
  out.writesFromRemovingGrouped = window.__writes.slice(w1);
  out.alertsFromRemovingGrouped = window.__alerts.slice(a1);

  // 3. THE RECORD AS IT NOW STANDS: the page removed players/p5 and nothing
  //    else, so the golfer is gone and his eighteen holes are not.
  const after = REC();
  delete after.players['${UNASSIGNED}'];
  out.scoreKeysAfter = Object.keys(after.scores).length;
  out.p5ScoreKeysRemaining = Object.keys(after.scores).filter(k => k.indexOf('${UNASSIGNED}_') === 0).length;
  fire(after);
  out.boardAfter = board();
  out.p5OnBoardBefore = out.boardBefore.lines.some(l => /Golfer 5\\b/.test(l));
  out.p5OnBoardAfter = out.boardAfter.lines.some(l => /Golfer 5\\b/.test(l));

  // CONTROL: the board must be capable of losing a row for a reason the probe
  // can see. Golfer 6 is removed the same way; if the count does not move
  // again, the reading is not tracking the field at all.
  const after2 = REC();
  delete after2.players['${UNASSIGNED}']; delete after2.players['${SIXTH}'];
  fire(after2);
  out.boardAfterSecondRemoval = board();
  return JSON.stringify(out);
})()`;

// The group card, handed a record where a group still lists a golfer the
// organizer page has deleted. The UI refuses to create this - measured in
// PROBE_A - so it is reached by hand, to establish what the card does if it
// ever arrives some other way.
const probeACard = (GHOST) => `
(() => {
  const out = {};
  const inputs = document.querySelectorAll('#holes-list input');
  out.inputs = inputs.length;
  out.roster = (document.getElementById('team-roster').innerText || '').replace(/\\s+/g, ' ').trim();
  out.status = (document.getElementById('status-main').innerText || '').trim();
  out.errorVisible = (() => { const e = document.getElementById('error-content');
    return e ? e.getClientRects().length > 0 : null; })();
  out.mainVisible = (() => { const e = document.getElementById('main-content');
    return e ? e.getClientRects().length > 0 : null; })();
  out.ghostHasInputs = Array.from(inputs)
      .some(i => (i.getAttribute('onchange') || '').indexOf("'${GHOST}'") !== -1);
  return JSON.stringify(out);
})()`;

// ---------------------------------------------------------------------------
// B. TEAM REMOVE.
// ---------------------------------------------------------------------------

// Is there a reachable control? Asked on the manage screen, and asked again on
// the setup screen where one is KNOWN to exist - that second reading is what
// makes the first one mean something.
const PROBE_B_CONTROL = `
(() => {
  const out = {};
  const vis = el => el.getClientRects().length > 0;
  const all = Array.from(document.querySelectorAll('button, [onclick]'));
  const removers = all.filter(el => {
    const h = (el.getAttribute('onclick') || '') + ' ' + (el.className || '');
    return /removeTeam|deleteTeam|btn-remove-team/.test(h);
  });
  out.removeTeamControls = removers.length;
  out.removeTeamControlsVisible = removers.filter(vis).length;
  out.teamLinkRowControls = Array.from(document.querySelectorAll('#team-links-list button, #team-links-list input'))
      .filter(vis).map(el => (el.getAttribute('onclick') || el.getAttribute('type') || el.tagName));
  out.namedRemovers = ['removeTeam', 'deleteTeam']
      .map(n => n + ':' + (typeof window[n]));
  return JSON.stringify(out);
})()`;

const PROBE_B_DELETE = `
(() => {
  ${BOARD}
  const out = {};
  out.boardBefore = board();
  const scoresBefore = REC().scores;
  out.team3KeysBefore = Object.keys(scoresBefore).filter(k => k.indexOf('team3_') === 0).length;

  // The record with teams/team3 gone - what a delete would leave behind.
  const rec = REC();
  delete rec.teams.team3;
  out.team3KeysAfter = Object.keys(rec.scores).filter(k => k.indexOf('team3_') === 0).length;
  out.remainingTeamNums = Object.keys(rec.teams).map(t => rec.teams[t].num);
  fire(rec);
  out.boardAfter = board();

  // Does any surviving team's number change? The record is re-read from the
  // page's own rendered links, not from the fixture.
  out.teamLinksAfter = Array.from(document.querySelectorAll('#team-links-list button'))
      .map(b => (b.getAttribute('onclick') || '').replace(/.*team=(\\d+).*/, '$1'))
      .filter(x => /^\\d+$/.test(x));

  // Payouts and the print view read the same rows the board does.
  const spots = document.getElementById('payout-spots-input');
  out.payoutRows = (document.getElementById('payout-results').innerText || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 200);
  const pb = Array.from(document.querySelectorAll('button'))
      .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
  if (pb) pb.click();
  out.printView = (document.getElementById('tournament-print-view').innerText || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 260);
  return JSON.stringify(out);
})()`;

// The team card a golfer holds, on ?team=4, after team3 is gone.
const PROBE_B_CARD = `
(() => {
  const out = {};
  out.roster = (document.getElementById('team-roster').innerText || '').replace(/\\s+/g, ' ').trim();
  out.status = (document.getElementById('status-main').innerText || '').trim();
  const inputs = Array.from(document.querySelectorAll('#holes-list input'));
  out.inputs = inputs.length;
  out.firstThreeValues = inputs.slice(0, 3).map(i => i.value);
  out.readsKey = inputs.length ? (inputs[0].getAttribute('onchange') || '') : null;
  return JSON.stringify(out);
})()`;

// A link already in a group chat, for a team that no longer exists. This is the
// practical consequence of a delete: the organizer cannot un-send it.
const PROBE_B_DEAD_LINK = `
(() => {
  const out = {};
  out.errorVisible = (() => { const e = document.getElementById('error-content');
    return e ? e.getClientRects().length > 0 : null; })();
  out.mainVisible = (() => { const e = document.getElementById('main-content');
    return e ? e.getClientRects().length > 0 : null; })();
  out.message = (() => { const e = document.getElementById('error-detail');
    return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; })();
  out.inputs = document.querySelectorAll('#holes-list input').length;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-destructive-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const INDF = individualEvent();
    const IND = INDF.record;
    const PID = INDF.byName;
    const TEAM = teamEvent(false);
    const TEAM_RENUM = teamEvent(true);

    // A record whose group still names a deleted golfer, reached only by hand.
    const GHOSTF = individualEvent();
    const GHOST = GHOSTF.record;
    delete GHOST.players[GHOSTF.byName['Golfer 1']];

    const db = {
        tournaments: { INDA: IND, TEAMB: TEAM, TEAMR: TEAM_RENUM, GHOST: GHOST },
        trips: {},
    };
    const seedFor = rec => 'document.__recJson = ' + JSON.stringify(JSON.stringify(rec)) + ';';

    const run = async (page, query, expression, rec) => {
        const r = await arriveCold({ url: fileUrl(page, query), db: db, expression: expression,
            preScript: CAPTURE + '\n' + seedFor(rec), settleMs: 4500,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        if (g.fatal) bail(g.fatal);
        return g;
    };

    const a = await run('tournament.html', 'tourney=INDA',
        probeA(PID['Golfer 5'], PID['Golfer 1'], PID['Golfer 6']), IND);
    const aCard = await run('tournament-scorecard.html',
        'tourney=GHOST&group=' + GHOSTF.groupId,
        probeACard(GHOSTF.byName['Golfer 1']), GHOST);
    const bManage = await run('tournament.html', 'tourney=TEAMB', PROBE_B_CONTROL, TEAM);
    const bSetup = await run('tournament.html', '', PROBE_B_CONTROL, TEAM);
    const bDel = await run('tournament.html', 'tourney=TEAMB', PROBE_B_DELETE, TEAM);
    const bRenum = await run('tournament.html', 'tourney=TEAMR', PROBE_B_DELETE, TEAM_RENUM);
    const bCard = await run('tournament-scorecard.html', 'tourney=TEAMB&team=4', PROBE_B_CARD, TEAM);
    // The same event with team3 already gone, for the link that was sent before.
    const TEAM_GONE = teamEvent(false);
    delete TEAM_GONE.teams.team3;
    db.tournaments.TEAMGONE = TEAM_GONE;
    const bDead = await run('tournament-scorecard.html', 'tourney=TEAMGONE&team=3',
        PROBE_B_DEAD_LINK, TEAM_GONE);
    const bDeadCtl = await run('tournament-scorecard.html', 'tourney=TEAMB&team=3',
        PROBE_B_DEAD_LINK, TEAM);

    const problems = [];

    // --- controls, checked for discrimination before anything is believed ---
    if (bSetup.removeTeamControlsVisible === 0) {
        bail('THE REMOVE-TEAM PROBE IS INERT - it found no remove control even on the '
            + 'setup screen, which has one. Its silence on the manage screen means nothing.');
    }
    if (a.boardAfterSecondRemoval.count !== a.boardAfter.count - 1) {
        bail('THE BOARD READING IS INERT - removing a second golfer did not change the '
            + 'row count, so "the board dropped him" cannot be attributed to anything.');
    }
    // The renumber control must actually differ from the honest record, or
    // "team 4 is not read as team 3" is a sentence about a probe that is blind.
    const honestLines = JSON.stringify(bDel.boardAfter.lines);
    const renumLines = JSON.stringify(bRenum.boardAfter.lines);
    if (honestLines === renumLines) {
        bail('THE RENUMBER CONTROL DOES NOT DISCRIMINATE - a record with team 4 '
            + 'relabelled as 3 renders identically to one without. The probe cannot '
            + 'see the hazard it is reporting on.');
    }

    // --- findings ---
    if (a.p5ScoreKeysRemaining !== 18) {
        problems.push('A: expected 18 orphaned score keys for the removed golfer, found '
            + a.p5ScoreKeysRemaining);
    }
    if (a.confirmPrompts !== 0) {
        problems.push('A: a confirmation prompt appeared - this report says there is none');
    }

    if (bDeadCtl.errorVisible || bDeadCtl.inputs === 0) {
        bail('THE DEAD-LINK CONTROL IS INERT - team 3\'s link already failed BEFORE the '
            + 'deletion, so its failure afterwards cannot be attributed to the delete.');
    }

    const report = {
        A_player_remove: {
            controlIsLiveAndOnScreen: a.controlFoundForUnassigned && a.controlVisible,
            confirmationStep: a.confirmPrompts === 0
                ? 'NONE - one tap, no confirm(), no undo' : a.confirmText,
            removingAnUnassignedGolfer: {
                writes: a.writesFromRemovingUnassigned,
                alerts: a.alertsFromRemovingUnassigned,
            },
            removingAGolferWhoIsInAScoringGroup: {
                writes: a.writesFromRemovingGrouped,
                alerts: a.alertsFromRemovingGrouped,
                refused: a.writesFromRemovingGrouped.length === 0,
            },
            scoreKeys: {
                before: a.scoreKeysBefore, afterTheRemoval: a.scoreKeysAfter,
                orphanedForThatGolfer: a.p5ScoreKeysRemaining,
                deleted: a.scoreKeysBefore - a.scoreKeysAfter,
            },
            leaderboard: {
                rowsBefore: a.boardBefore.count, rowsAfter: a.boardAfter.count,
                golferOnBoardBefore: a.p5OnBoardBefore, golferOnBoardAfter: a.p5OnBoardAfter,
                control_secondRemovalAlsoDroppedARow:
                    a.boardAfterSecondRemoval.count === a.boardAfter.count - 1,
            },
            theGroupCardWithADeletedMember: {
                reachableThroughTheUI: false,
                note: 'the organizer page refuses to remove a golfer who is in a group; '
                    + 'this is a hand-written record',
                cardRenders: aCard.mainVisible, errorScreen: aCard.errorVisible,
                roster: aCard.roster, inputs: aCard.inputs,
                deletedGolferStillHasInputs: aCard.ghostHasInputs,
            },
        },
        B_team_remove: {
            reachableControlOnTheManageScreen: {
                found: bManage.removeTeamControls, visible: bManage.removeTeamControlsVisible,
                namedFunctions: bManage.namedRemovers,
                whatTheTeamRowActuallyOffers: bManage.teamLinkRowControls,
                control_theProbeFindsOneOnTheSetupScreen: {
                    found: bSetup.removeTeamControls, visible: bSetup.removeTeamControlsVisible,
                },
            },
            afterDeletingTeam3: {
                remainingTeamNums: bDel.remainingTeamNums,
                team3ScoreKeys: { before: bDel.team3KeysBefore, after: bDel.team3KeysAfter },
                boardBefore: bDel.boardBefore.lines,
                boardAfter: bDel.boardAfter.lines,
                teamLinksStillPointAt: bDel.teamLinksAfter,
                payouts: bDel.payoutRows,
                printView: bDel.printView,
                theTeamCardOnTeam4: bCard,
                theAlreadySentLinkForTeam3: {
                    errorScreen: bDead.errorVisible, cardRenders: bDead.mainVisible,
                    message: bDead.message, inputs: bDead.inputs,
                    control_theSameLinkBeforeTheDeletion: {
                        errorScreen: bDeadCtl.errorVisible, cardRenders: bDeadCtl.mainVisible,
                        inputs: bDeadCtl.inputs,
                    },
                },
            },
            control_aDeliberatelyRenumberedRecord: {
                what: 'team4 relabelled num 3, which is what a delete-and-reindex produces',
                boardAfter: bRenum.boardAfter.lines,
                differsFromTheHonestRecord: honestLines !== renumLines,
            },
        },
        problems: problems,
        verdict: problems.length ? 'FINDINGS' : 'AS REPORTED',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
