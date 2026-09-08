#!/usr/bin/env node
// ============================================================================
// WHAT ALREADY WORKS BEHIND THE UNREACHABLE CONTROLS.
//
// Two whole features are complete and unreachable - Individual Net, and
// multi-round events - and one destructive path is guarded in the UI but not in
// the data. This measures what a record in each of those states actually does,
// so the cost of wiring a control is known before anyone wires it.
//
// EVERY FIXTURE IS HAND-WRITTEN. Nothing here adds or wires a control, and
// nothing here calls a page function by name; where a control exists it is
// driven with a real tap, and where one does not the record is handed to the
// page in the state a control would have produced.
//
// EXPECTATIONS ARE COMPUTED BY HAND, in plain arithmetic, and compared with what
// the page rendered. Asking the engine what the answer should be and then
// checking the engine agrees with itself would prove nothing.
//
//   node tools/tournament-reachability-recon.js
//
//   exit 0   everything matched the hand-computed expectation
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
// WAVE 8: fixtures now match what the writers actually produce - real minted
// ids, shambleCountBest on every round, and an OPEN round carrying the handicap
// snapshot setRoundStatus writes in the same update as the status.
const F = require('./lib/tournament-fixtures.js');

// A course with a REAL stroke index: par 4 everywhere so par arithmetic is
// trivial by hand, SI 1..18 once each so getStrokes is trivial too.
const REAL_COURSE = [];
for (let i = 1; i <= 18; i++) REAL_COURSE.push({ hole: i, par: 4, hcpIndex: i });
const PAR_TOTAL = 72;

// --- fixtures ---------------------------------------------------------------

function flightEvent() {
    const teams = {}, scores = {};
    for (let n = 1; n <= 4; n++) {
        teams['team' + n] = { num: n, name: 'Team ' + n, handicap: 0,
            players: ['A' + n, 'B' + n], flightId: n <= 3 ? 'f1' : undefined };
        for (let h = 1; h <= 18; h++) scores['team' + n + '_h' + h] = 3 + n;
    }
    delete teams.team4.flightId;
    return { name: 'Flighted Scramble', format: 'scramble', courseName: 'Caledonia',
        activeCourseKey: 'c', courseData: REAL_COURSE, courseIndexSynthetic: false,
        entryFee: 0, shambleCountBest: 1, teams: teams, scores: scores,
        flights: { f1: { id: 'f1', name: 'Championship', createdAt: 1 } }, createdAt: 1 };
}

// p1,p2 are in the group. p3,p4 are in the FIELD and in no group at all.
function grouplessEvent() {
    const field = F.playerField([1, 2, 3, 4].map(i => ({ name: 'Golfer ' + i, handicap: '0' })));
    const ids = field.ids;
    const scores = {};
    ids.forEach((pid, i) => { for (let h = 1; h <= 18; h++) scores[pid + '_h' + h] = 4 + i; });
    const groups = {};
    const g = F.scoringGroup('Group 1', [ids[0], ids[1]], 1);
    groups[g.id] = g;
    // ids returned alongside, NOT stored on the record - a fixture must not
    // carry a field the app would never write.
    return { record: F.eventRecord({
        name: 'Groupless', format: 'individual', scoringMode: 'gross',
        courseName: 'True Blue', activeCourseKey: 't', courseData: REAL_COURSE,
        entryFee: 0, players: field.players, scoringGroups: groups, scores: scores,
    }), ids: ids, byName: field.byName };
}

// NET, hand-computable:
//   Ace   hcp 0   90 gross, 0 strokes  -> net 90, toPar +18
//   Bogey hcp 18  90 gross, 18 strokes -> net 72, toPar   E
//   Cal   hcp 9   90 gross,  9 strokes -> net 81, toPar  +9
function netEvent(mode, synthetic) {
    const field = F.playerField([
        { name: 'Ace', handicap: '0' },
        { name: 'Bogey', handicap: '18' },
        { name: 'Cal', handicap: '9' },
    ]);
    const scores = {};
    field.ids.forEach(pid => { for (let h = 1; h <= 18; h++) scores[pid + '_h' + h] = 5; });
    const groups = {};
    const g = F.scoringGroup('Group 1', field.ids, 1);
    groups[g.id] = g;
    return F.eventRecord({
        name: 'Net Championship', format: 'individual', scoringMode: mode,
        courseName: synthetic ? 'Unmapped Muni' : 'True Blue', activeCourseKey: 'x',
        courseData: REAL_COURSE, courseIndexSynthetic: !!synthetic, entryFee: 300,
        players: field.players, scoringGroups: groups, scores: scores,
    });
}

// TWO ROUNDS. Ace plays both badly-then-well, Bogey plays both level, Cal plays
// round one level and MISSES round two entirely.
//   Ace    r1 90 (+18)  r2 72 (E)   -> +18 over 2 of 2
//   Bogey  r1 72 (E)    r2 72 (E)   ->   E over 2 of 2
//   Cal    r1 72 (E)    r2 absent   ->   E over 1 of 2
// Cal ties Bogey on score and must rank BEHIND Ace, who is 18 worse, because
// completeness outranks score.
function multiRoundEvent() {
    const field = F.playerField([
        { name: 'Ace', handicap: '0' },
        { name: 'Bogey', handicap: '0' },
        { name: 'Cal', handicap: '0' },
    ]);
    const A = field.byName.Ace, B = field.byName.Bogey, C = field.byName.Cal;
    const groups = {};
    const g = F.scoringGroup('Group 1', [A, B, C], 1);
    groups[g.id] = g;

    const r1 = {}, r2 = {};
    for (let h = 1; h <= 18; h++) {
        r1[A + '_h' + h] = 5; r1[B + '_h' + h] = 4; r1[C + '_h' + h] = 4;
        r2[A + '_h' + h] = 4; r2[B + '_h' + h] = 4;   // Cal absent from round two
    }
    const base = { format: 'individual', scoringMode: 'gross', courseName: 'True Blue',
        activeCourseKey: 't', courseData: REAL_COURSE, scoringGroups: groups };
    // OPEN, WITH THE SNAPSHOT. A round cannot be open without one.
    const round1 = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 1', createdAt: 1, scores: r1 }, base)),
        field.players);
    const round2 = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 2', createdAt: 2, scores: r2 }, base)),
        field.players);
    const rounds = {};
    rounds[round1.id] = round1;
    rounds[round2.id] = round2;

    return F.eventRecord({
        name: 'Club Championship', format: 'individual', scoringMode: 'gross',
        courseName: 'True Blue', activeCourseKey: 't', courseData: REAL_COURSE,
        entryFee: 0, players: field.players, scoringGroups: {},
        eventModel: 'round-v1', rounds: rounds,
    });
}

// A multi-round TEAM event, for the round-scoped-link question.
function multiRoundTeamEvent() {
    const teams = {}, scores = {};
    for (let n = 1; n <= 2; n++) {
        teams['team' + n] = { num: n, name: 'Team ' + n, handicap: 0, players: ['A' + n, 'B' + n] };
        for (let h = 1; h <= 18; h++) scores['team' + n + '_h' + h] = 4;
    }
    const round = F.openRound(F.roundRecord({
        name: 'Round 1', createdAt: 1, format: 'scramble', scoringMode: 'gross',
        courseName: 'Caledonia', activeCourseKey: 'c', courseData: REAL_COURSE,
        scores: scores,
    }), {});   // a team round has no player field to snapshot
    const rounds = {}; rounds[round.id] = round;
    return F.eventRecord({
        name: 'Two Day Scramble', format: 'scramble', courseName: 'Caledonia',
        activeCourseKey: 'c', courseData: REAL_COURSE, entryFee: 0,
        teams: teams, eventModel: 'round-v1', rounds: rounds,
    });
}

const CAPTURE = `
(function () {
  window.__writes = []; window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () { window.__printed = true; };
  window.__cbs = [];
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments); var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p); var on = r.on;
      r.on = function (ev, cb) { if (ev === 'value') window.__cbs.push({ path: String(p), cb: cb });
        return on.apply(r, arguments); };
      ['set', 'update', 'remove'].forEach(function (op) { var fn = r[op];
        r[op] = function (v) { window.__writes.push(op + ' ' + p); return fn.apply(r, arguments); }; });
      return r; };
    return d; };
})();`;

const HELP = `
  const board = () => Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
      .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
  const fire = rec => { const e = (window.__cbs || []).find(c => /^tournaments\\//.test(c.path));
      if (!e) throw new Error('no listener'); e.cb({ val: () => rec, exists: () => true }); };
  const REC = () => JSON.parse(document.__recJson);
  const txt = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const vis = id => { const e = document.getElementById(id);
      return e ? e.getClientRects().length > 0 : null; };
`;

// --- 1C: a flight deleted underneath assigned teams ------------------------
const PROBE_FLIGHT = `
(() => {
  ${HELP}
  const out = {};
  const filterButtons = () => Array.from(document.querySelectorAll('#lb-flight-filter button'))
      .map(b => (b.innerText || '').trim());
  out.filterBefore = filterButtons();
  out.boardBefore = board();
  out.flightsListBefore = txt('flights-list');

  // THE LIVE CONTROL FIRST: does the UI let you delete a flight in use?
  const del = Array.from(document.querySelectorAll('#flights-list button.flight-del'))[0];
  out.deleteControlPresent = !!del;
  out.deleteControlDisabled = del ? del.hasAttribute('disabled') : null;
  const w0 = window.__writes.length, a0 = window.__alerts.length;
  if (del) del.click();
  out.writesFromTappingDelete = window.__writes.slice(w0);
  out.alertsFromTappingDelete = window.__alerts.slice(a0);

  // Now the record a delete WOULD have produced, handed to the page directly.
  const rec = REC();
  delete rec.flights.f1;
  out.teamsStillPointingAtTheDeadFlight = Object.keys(rec.teams)
      .filter(t => rec.teams[t].flightId === 'f1').length;
  fire(rec);
  out.filterAfter = filterButtons();
  out.boardAfter = board();
  out.flightsListAfter = txt('flights-list');
  out.assignListAfter = txt('flight-assign-list');
  return JSON.stringify(out);
})()`;

// --- 1C: a golfer in the field but in no scoring group ----------------------
const probeGroupless = (dropId) => `
(() => {
  ${HELP}
  const out = {};
  out.board = board();
  out.groupedGolfers = ['Golfer 1', 'Golfer 2'];
  out.grouplessGolfers = ['Golfer 3', 'Golfer 4'];
  out.grouplessOnBoard = out.grouplessGolfers
      .filter(n => out.board.some(l => l.indexOf(n) !== -1));
  // CONTROL: the same board must be able to LOSE somebody, or "they still
  // count" is a reading that cannot move.
  const rec = REC();
  delete rec.players['${dropId}'];
  fire(rec);
  out.boardAfterRemovingOneFromTheField = board();
  return JSON.stringify(out);
})()`;

// --- 2: individual net ------------------------------------------------------
const PROBE_NET = `
(() => {
  ${HELP}
  const out = {};
  out.board = board();
  out.subHeader = txt('manage-t-sub');
  const pb = Array.from(document.querySelectorAll('button'))
      .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
  if (pb) pb.click();
  out.printView = txt('tournament-print-view');
  out.payoutSub = txt('payout-pool-sub');
  out.payouts = txt('payout-results');
  return JSON.stringify(out);
})()`;

const PROBE_NET_CARD = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const out = {};
  out.eventSub = t('event-sub');
  out.roster = t('team-roster');
  out.statusSub = t('status-sub');
  out.holesText = (document.getElementById('holes-list').innerText || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 120);
  // Does the card show WHERE the strokes fall - a stroke index, a dot, anything?
  out.mentionsStrokeIndex = /SI|SI\\b|index|stroke index/i.test(
      document.getElementById('holes-list').innerText || '');
  out.perHoleStrokeMarks = document.querySelectorAll('#holes-list .dot, #holes-list .stroke-dot').length;
  return JSON.stringify(out);
})()`;

// --- 3: multi-round ---------------------------------------------------------
const PROBE_MULTI = `
(() => {
  ${HELP}
  const out = {};
  out.roundFilter = Array.from(document.querySelectorAll('#lb-round-filter button'))
      .map(b => (b.innerText || '').trim());
  out.eventBoard = board();
  out.combinedNote = txt('lb-combined-note');

  // Each round's own board, by tapping its filter button.
  const btns = Array.from(document.querySelectorAll('#lb-round-filter button'));
  out.rounds = {};
  btns.forEach(b => {
    const label = (b.innerText || '').trim();
    if (label === 'Event') return;
    b.click();
    out.rounds[label] = board();
  });
  const ev = btns.find(b => (b.innerText || '').trim() === 'Event');
  if (ev) { ev.click(); out.eventBoardAfterReturning = board(); }

  // WHAT LINKS THE ORGANIZER CAN ACTUALLY HAND OUT for a round.
  out.teamLinks = Array.from(document.querySelectorAll('#team-links-list button'))
      .map(b => (b.getAttribute('onclick') || '').match(/tournament-scorecard[^']*/) || [])
      .map(m => m[0] || null).filter(Boolean);
  out.groupLinksBeforeEditingARound = Array.from(
      document.querySelectorAll('#scoring-groups-list a')).map(a => a.getAttribute('href'));
  out.groupsPanelBeforeEditing = txt('scoring-groups-list');

  // Tap Edit on the first round - that is what reveals a round's own draw.
  const edit = Array.from(document.querySelectorAll('#rounds-list button'))
      .find(b => /editRound/.test(b.getAttribute('onclick') || ''));
  out.editControlFound = !!edit;
  if (edit) edit.click();
  out.groupLinksAfterEditingARound = Array.from(
      document.querySelectorAll('#scoring-groups-list a')).map(a => a.getAttribute('href'));
  out.teamLinksAfterEditingARound = Array.from(document.querySelectorAll('#team-links-list button'))
      .map(b => (b.getAttribute('onclick') || '').match(/tournament-scorecard[^']*/) || [])
      .map(m => m[0] || null).filter(Boolean);
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-reachability-recon: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const FL = flightEvent();
    const GLF = grouplessEvent();
    const GL = GLF.record;
    const NET = netEvent('net', false);
    const GROSS = netEvent('gross', false);
    const SYNTH = netEvent('net', true);
    const MR = multiRoundEvent();
    const MRT = multiRoundTeamEvent();

    const db = { tournaments: { FL, GL, NET, GROSS, SYNTH, MR, MRT }, trips: {} };
    const seedFor = rec => 'document.__recJson = ' + JSON.stringify(JSON.stringify(rec)) + ';';
    const run = async (page, query, expression, rec) => {
        const r = await arriveCold({ url: fileUrl(page, query), db, expression,
            preScript: CAPTURE + '\n' + seedFor(rec), settleMs: 4500,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        if (g.fatal) bail(g.fatal);
        return g;
    };

    const fl = await run('tournament.html', 'tourney=FL', PROBE_FLIGHT, FL);
    const gl = await run('tournament.html', 'tourney=GL', probeGroupless(GLF.ids[3]), GL);
    const net = await run('tournament.html', 'tourney=NET', PROBE_NET, NET);
    const gross = await run('tournament.html', 'tourney=GROSS', PROBE_NET, GROSS);
    const synth = await run('tournament.html', 'tourney=SYNTH', PROBE_NET, SYNTH);
    const netCard = await run('tournament-scorecard.html', 'tourney=NET&group=g1', PROBE_NET_CARD, NET);
    const synthCard = await run('tournament-scorecard.html', 'tourney=SYNTH&group=g1', PROBE_NET_CARD, SYNTH);
    const mr = await run('tournament.html', 'tourney=MR', PROBE_MULTI, MR);
    const mrt = await run('tournament.html', 'tourney=MRT', PROBE_MULTI, MRT);

    const problems = [];
    const has = (lines, name, toPar) =>
        lines.some(l => l.indexOf(name) !== -1 && l.indexOf(toPar) !== -1);

    // --- controls, checked for discrimination FIRST ---
    if (JSON.stringify(net.board) === JSON.stringify(gross.board)) {
        bail('THE NET CONTROL DOES NOT DISCRIMINATE - the net board and the gross board '
            + 'are identical, so nothing here can tell whether net is being applied.');
    }
    if (gl.boardAfterRemovingOneFromTheField.length !== gl.board.length - 1) {
        bail('THE GROUPLESS READING IS INERT - removing a golfer from the field did not '
            + 'change the row count, so "they still count" is a reading that cannot move.');
    }
    if (fl.filterBefore.length < 2) {
        bail('THE FLIGHT READING IS INERT - no flight filter rendered before the deletion, '
            + 'so its absence afterwards means nothing.');
    }

    // --- 2: hand-computed net expectation ---
    // 90 gross each. Ace 0 strokes -> 90 -> +18. Bogey 18 strokes -> 72 -> E.
    // Cal 9 strokes (SI 1-9) -> 81 -> +9.
    if (!has(net.board, 'Bogey', 'E')) problems.push('NET: Bogey should be level (90 - 18 = 72 = par)');
    if (!has(net.board, 'Cal', '+9')) problems.push('NET: Cal should be +9 (90 - 9 = 81)');
    if (!has(net.board, 'Ace', '+18')) problems.push('NET: Ace should be +18 (no strokes)');
    // Gross control: all three identical at +18.
    if (!(has(gross.board, 'Ace', '+18') && has(gross.board, 'Bogey', '+18')
          && has(gross.board, 'Cal', '+18'))) {
        problems.push('GROSS control: all three shot 90 and should all be +18');
    }
    // Synthetic course: net must be REFUSED and scored gross.
    if (JSON.stringify(synth.board) !== JSON.stringify(gross.board)) {
        problems.push('SYNTHETIC: a net event on a fabricated stroke index should score '
            + 'gross, but its board differs from the gross board');
    }

    // --- 3: hand-computed multi-round expectation ---
    // Ace +18 over 2/2, Bogey E over 2/2, Cal E over 1/2.
    // Completeness outranks score, so Cal is third despite tying Bogey.
    const evb = mr.eventBoard;
    const posOf = name => evb.findIndex(l => l.indexOf(name) !== -1);
    if (!(posOf('Bogey') === 0 && posOf('Ace') === 1 && posOf('Cal') === 2)) {
        problems.push('MULTI: expected Bogey, Ace, Cal in that order - completeness before '
            + 'score - got ' + JSON.stringify(evb));
    }
    if (!has(evb, 'Cal', 'E')) problems.push('MULTI: Cal played one level round and should read E');
    if (!evb.some(l => l.indexOf('Cal') !== -1 && /incomplete/i.test(l))) {
        problems.push('MULTI: Cal is missing a round and the board should say so');
    }

    const report = {
        C_flight_deleted_under_assigned_teams: {
            theUIRefusesIt: {
                deleteControlPresent: fl.deleteControlPresent,
                controlDisabled: fl.deleteControlDisabled,
                writes: fl.writesFromTappingDelete,
                alerts: fl.alertsFromTappingDelete,
            },
            ifTheRecordEndsUpThatWayAnyway: {
                teamsLeftPointingAtTheDeadFlight: fl.teamsStillPointingAtTheDeadFlight,
                flightFilterBefore: fl.filterBefore, flightFilterAfter: fl.filterAfter,
                boardBefore: fl.boardBefore, boardAfter: fl.boardAfter,
                flightsListAfter: fl.flightsListAfter,
                assignListAfter: fl.assignListAfter,
            },
        },
        C_golfer_in_the_field_but_in_no_group: {
            board: gl.board,
            grouplessGolfersOnTheBoard: gl.grouplessOnBoard,
            control_boardCanLoseARow: gl.boardAfterRemovingOneFromTheField.length
                + ' rows after removing one from the field, was ' + gl.board.length,
        },
        D_status_fields_that_exist_today: {
            rounds: "status: 'setup' | 'open' | 'closed'  - the ONLY one, and it is a "
                + 'property of a ROUND, never of a competitor',
            player: 'id, name, handicap, addedAt, flightId (optional) - no status',
            team: 'num, name, players, handicap, flightId (optional), startingHole (optional) - no status',
            scoringGroup: 'id, name, playerIds, createdAt, startingHole (optional) - no status',
            flight: 'id, name, createdAt - no status',
            withdrawnOrActiveOrDNF: 'no such field anywhere in the repo',
        },
        NET: {
            handComputed: 'all three shot 90. Ace hcp 0 -> +18. Bogey hcp 18 -> E. Cal hcp 9 -> +9.',
            board: net.board, subHeader: net.subHeader,
            printView: (net.printView || '').slice(0, 200),
            payoutSub: net.payoutSub, payouts: (net.payouts || '').slice(0, 160),
            control_sameRecordScoredGross: gross.board,
            syntheticCourse: {
                board: synth.board,
                matchesGross: JSON.stringify(synth.board) === JSON.stringify(gross.board),
                subHeader: synth.subHeader,
            },
            theGolfersCard: {
                onARealCourse: netCard,
                onASyntheticCourse: synthCard,
            },
        },
        MULTI_ROUND: {
            handComputed: 'Ace +18 over 2/2, Bogey E over 2/2, Cal E over 1 of 2. '
                + 'Completeness outranks score, so Cal is third despite tying Bogey.',
            roundFilter: mr.roundFilter,
            eventBoard: mr.eventBoard,
            perRoundBoards: mr.rounds,
            eventBoardAfterReturning: mr.eventBoardAfterReturning,
            links_individualEvent: {
                teamLinks: mr.teamLinks,
                groupLinksBeforeEditingARound: mr.groupLinksBeforeEditingARound,
                groupsPanelBeforeEditing: mr.groupsPanelBeforeEditing,
                groupLinksAfterEditingARound: mr.groupLinksAfterEditingARound,
            },
            links_teamEvent: {
                teamLinks: mrt.teamLinks,
                teamLinksAfterEditingARound: mrt.teamLinksAfterEditingARound,
                groupLinksAfterEditingARound: mrt.groupLinksAfterEditingARound,
            },
        },
        problems: problems,
        verdict: problems.length ? 'DIVERGENCES' : 'MATCHED THE HAND-COMPUTED EXPECTATION',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
