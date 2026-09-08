#!/usr/bin/env node
// ============================================================================
// THREE LABEL BUGS, ONE CLASS: THE WORD ON SCREEN IS NOT DERIVED FROM THE
// THING IT DESCRIBES.
//
// TEST 13  An Individual Stroke Play event is announced as "Scramble".
//          formatLabel() handles shamble and bestball and returns 'Scramble'
//          for everything else. There are TWO copies of it, one per page, and
//          a third function in the same file - formatLabelFor() - gets it
//          right and is used only by the rounds list.
// TEST 14  The printed results sheet never states Net or Gross, so a net
//          result and a gross result are indistinguishable documents.
// TEST 15  The leaderboard column over golfer names reads "Team".
//
// EVERY ASSERTION HAS A CONTROL THAT MUST READ DIFFERENTLY, and the controls
// are run against the current code first: a control that already agrees with
// the fix cannot tell you the fix happened.
//
// ONE HARNESS NOTE, because it would otherwise look like a bug: the printed
// sheet lives in a display:none element, and innerText on an element that is
// not rendered returns textContent. That is safe HERE only because
// #tournament-print-view holds no <script> - the usual textContent trap does
// not apply to it. Everything else in this file reads rendered innerText.
//
//   node tools/tournament-label-check.js
//
//   exit 0   every label is derived from what it describes
//   exit 1   a label the JSON names is not
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');   // WAVE 8: writer-shaped fixtures

const REAL_COURSE = [];
for (let i = 1; i <= 18; i++) REAL_COURSE.push({ hole: i, par: 4, hcpIndex: i });

function individual(mode, synthetic) {
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
        name: 'Club Championship', format: 'individual', scoringMode: mode,
        courseName: synthetic ? 'Unmapped Muni' : 'True Blue', activeCourseKey: 'x',
        courseData: REAL_COURSE, courseIndexSynthetic: !!synthetic, entryFee: 0,
        players: field.players, scoringGroups: groups, scores: scores,
    });
}

function scramble() {
    const teams = {}, scores = {};
    for (let n = 1; n <= 3; n++) {
        teams['team' + n] = { num: n, name: 'Team ' + n, handicap: 0, players: ['A' + n, 'B' + n] };
        for (let h = 1; h <= 18; h++) scores['team' + n + '_h' + h] = 3 + n;
    }
    return { name: 'Benefit Scramble', format: 'scramble', courseName: 'Caledonia',
        activeCourseKey: 'c', courseData: REAL_COURSE, courseIndexSynthetic: false,
        entryFee: 0, shambleCountBest: 1, teams: teams, scores: scores, createdAt: 1 };
}

// A two-round individual event, for the round view and the event view.
function multiRound() {
    const base = individual('gross', false);
    const groups = base.scoringGroups;
    const shared = { format: 'individual', scoringMode: 'gross', courseName: 'True Blue',
        activeCourseKey: 't', courseData: REAL_COURSE, scoringGroups: groups,
        scores: base.scores };
    // OPEN ROUNDS CARRY THE SNAPSHOT setRoundStatus writes with the status.
    const r1 = F.openRound(F.roundRecord(Object.assign({ name: 'Round 1', createdAt: 1 }, shared)),
        base.players);
    const r2 = F.openRound(F.roundRecord(Object.assign({ name: 'Round 2', createdAt: 2 }, shared)),
        base.players);
    const rounds = {}; rounds[r1.id] = r1; rounds[r2.id] = r2;
    return Object.assign({}, base, { eventModel: 'round-v1', scoringGroups: {},
        scores: {}, rounds: rounds });
}

const CAPTURE = `
(function () { window.alert = function () {}; window.print = function () { window.__printed = true; }; })();`;

const ORGANIZER = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const header = () => {
    const row = document.querySelector('#leaderboard-list .lb-row');
    if (!row) return null;
    const span = row.querySelector('.lb-team');
    return span ? (span.textContent || '').trim() : null;
  };
  const out = {};
  out.manageHeader = t('manage-t-sub');
  out.leaderboardHeader = t('lb-t-sub');
  out.columnHeader_default = header();

  // The multi-round views, reached by tapping the filter the page renders.
  const btns = Array.from(document.querySelectorAll('#lb-round-filter button'));
  out.roundFilter = btns.map(b => (b.innerText || '').trim());
  btns.forEach(b => {
    const label = (b.innerText || '').trim();
    b.click();
    out['columnHeader_' + label.replace(/\\s+/g, '')] = header();
  });

  const pb = Array.from(document.querySelectorAll('button'))
      .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
  if (pb) pb.click();
  // display:none, so innerText falls back to textContent - safe here, no script
  // lives inside this element.
  out.printSheet = t('tournament-print-view');
  // THE SUBTITLE, not the whole sheet. The scoring mode is a claim made in one
  // element; searching the entire document for the word "net" also matches the
  // sentence that says net could NOT be allocated, which is the opposite claim.
  const sub = document.querySelector('#tournament-print-view p');
  out.printSubtitle = sub ? (sub.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  const th = document.querySelectorAll('#tournament-print-view th');
  out.printColumnHeader = th.length > 1 ? (th[1].textContent || '').trim() : null;
  return JSON.stringify(out);
})()`;

const CARD = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const out = {};
  out.eventSub = t('event-sub');
  const tab = document.getElementById('tab-btn-leaderboard');
  if (tab) tab.click();
  const row = document.querySelector('#leaderboard-list .lb-row');
  const span = row ? row.querySelector('.lb-team') : null;
  out.columnHeader = span ? (span.textContent || '').trim() : null;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-label-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const IND = 'Individual Stroke Play';
const NO_INDEX = /no real stroke index/i;

// EXPORTED so the SAME fixtures and probes run on a second engine. Retyping
// them there would be measuring two different things and reporting them as one.
module.exports = {
    individual: individual, scramble: scramble, multiRound: multiRound,
    ORGANIZER: ORGANIZER, CARD: CARD, CAPTURE: CAPTURE,
};

if (require.main !== module) return;

(async () => {
    const A = individual('net', false);
    const B = individual('net', true);
    const C = individual('gross', false);
    const S = scramble();
    const M = multiRound();
    const db = { tournaments: { A, B, C, S, M }, trips: {} };

    const run = async (page, query, expression) => {
        const r = await arriveCold({ url: fileUrl(page, query), db, expression,
            preScript: CAPTURE, settleMs: 4500, blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const orgA = await run('tournament.html', 'tourney=A', ORGANIZER);
    const orgB = await run('tournament.html', 'tourney=B', ORGANIZER);
    const orgC = await run('tournament.html', 'tourney=C', ORGANIZER);
    const orgS = await run('tournament.html', 'tourney=S', ORGANIZER);
    const orgM = await run('tournament.html', 'tourney=M', ORGANIZER);
    const gidC = Object.keys(C.scoringGroups)[0];
    const cardC = await run('tournament-scorecard.html', 'tourney=C&group=' + gidC, CARD);
    const cardS = await run('tournament-scorecard.html', 'tourney=S&team=1', CARD);

    // --- CONTROLS FIRST -----------------------------------------------------
    // The scramble fixture is the discriminator for both the format label and
    // the column header. If it does not read differently from the individual
    // one, neither assertion below can tell you anything.
    if (!/Scramble/.test(orgS.manageHeader || '')) {
        bail('THE FORMAT-LABEL CONTROL IS INERT - the scramble fixture does not read '
            + '"Scramble" on the manage header, so a wrong reading on the individual '
            + 'fixture cannot be attributed to the label rule.');
    }
    if (cardS.columnHeader !== 'Team') {
        bail('THE COLUMN-HEADER CONTROL IS INERT - a team event does not read "Team", '
            + 'so "Golfer" on an individual event proves nothing.');
    }
    // The event view is stated to be correct already, and is therefore the control
    // for the two views that are not.
    if (orgM.columnHeader_Event !== 'Golfer') {
        bail('THE EVENT VIEW IS NOT THE CONTROL IT WAS ASSUMED TO BE - it reads "'
            + orgM.columnHeader_Event + '", not "Golfer". Rewrite Test 15 before trusting it.');
    }

    const problems = [];
    const say = (where, got, want) => problems.push(
        where + ': reads "' + got + '", should be "' + want + '"');

    // --- TEST 13 ------------------------------------------------------------
    const t13 = {
        manageHeader: (orgC.manageHeader || '').indexOf(IND) !== -1,
        leaderboardHeader: (orgC.leaderboardHeader || '').indexOf(IND) !== -1,
        scorecardSubtitle: (cardC.eventSub || '').indexOf(IND) !== -1,
        printedSheet: (orgC.printSubtitle || '').indexOf(IND) !== -1,
    };
    Object.keys(t13).forEach(k => { if (!t13[k]) say('TEST 13 ' + k, '…Scramble…', IND); });
    const t13control = {
        manageHeader: /Scramble/.test(orgS.manageHeader || ''),
        leaderboardHeader: /Scramble/.test(orgS.leaderboardHeader || ''),
        scorecardSubtitle: /Scramble/.test(cardS.eventSub || ''),
        printedSheet: /Scramble/.test(orgS.printSubtitle || ''),
    };
    Object.keys(t13control).forEach(k => {
        if (!t13control[k]) problems.push('TEST 13 CONTROL ' + k + ': a scramble event '
            + 'must still read "Scramble"');
    });

    // --- TEST 14 ------------------------------------------------------------
    // THE MODE IS A SEGMENT OF THE SUBTITLE, NOT A SUBSTRING OF THE PAGE.
    //
    // This assertion was rewritten after it failed on a CORRECT sheet: the
    // refusal reads "Gross - this course has no real stroke index, so net
    // strokes can't be allocated", and a substring search for "net" matched the
    // word inside the explanation. That is the opposite of claiming net. The
    // claim is which mode the sheet PRESENTS, so the mode segment is read on its
    // own - and it still discriminates, because fixture A's segment is "Net" and
    // fixture C's is "Gross".
    const modeOf = subtitle => {
        const parts = String(subtitle || '').split('\u2022').map(x => x.trim());
        return parts.length >= 3 ? parts[2] : null;
    };
    const modeA = modeOf(orgA.printSubtitle);
    const modeB = modeOf(orgB.printSubtitle);
    const modeC = modeOf(orgC.printSubtitle);
    const t14 = {
        A_netRealIndex_modeIsNet: modeA === 'Net',
        B_netSynthetic_modeIsGross: /^Gross\b/.test(modeB || ''),
        B_netSynthetic_explainsWhy: NO_INDEX.test(modeB || ''),
        B_netSynthetic_doesNotPresentNet: modeB !== 'Net' && !/^Net\b/.test(modeB || ''),
        C_gross_modeIsGross: modeC === 'Gross',
        control_theThreeModesDiffer: new Set([modeA, modeB, modeC]).size >= 2
            && modeA !== modeB,
    };
    Object.keys(t14).forEach(k => { if (!t14[k]) problems.push('TEST 14 ' + k + ': FAILED'); });
    const t14distinct = new Set([orgA.printSheet, orgB.printSheet, orgC.printSheet]).size;
    if (t14distinct < 3) {
        problems.push('TEST 14 CONTROL: the three printed sheets are not distinct ('
            + t14distinct + ' of 3), so the wording is not tracking the scoring');
    }

    // --- TEST 15 ------------------------------------------------------------
    const t15 = {
        organizer_singleRound: orgC.columnHeader_default === 'Golfer',
        organizer_roundView: orgM.columnHeader_Round1 === 'Golfer',
        organizer_eventView: orgM.columnHeader_Event === 'Golfer',
        golfersCard: cardC.columnHeader === 'Golfer',
        teamEvent_organizer: orgS.columnHeader_default === 'Team',
        teamEvent_card: cardS.columnHeader === 'Team',
        printedSheet_individual: orgC.printColumnHeader === 'Golfer',
        printedSheet_team: orgS.printColumnHeader === 'Team',
    };
    Object.keys(t15).forEach(k => {
        if (!t15[k]) say('TEST 15 ' + k, k.indexOf('team') === 0 ? 'Golfer' : 'Team',
            k.indexOf('team') === 0 ? 'Team' : 'Golfer');
    });

    const report = {
        TEST_13_format_label: {
            individualEvent: {
                manageHeader: orgC.manageHeader, leaderboardHeader: orgC.leaderboardHeader,
                scorecardSubtitle: cardC.eventSub,
                printedSheet: (orgC.printSheet || '').slice(0, 110),
            },
            assertions: t13,
            control_scrambleStillReadsScramble: t13control,
            control_scrambleValues: {
                manageHeader: orgS.manageHeader, scorecardSubtitle: cardS.eventSub,
            },
        },
        TEST_14_printed_sheet_states_net_or_gross: {
            A_netRealIndex_subtitle: orgA.printSubtitle,
            B_netSynthetic_subtitle: orgB.printSubtitle,
            C_gross_subtitle: orgC.printSubtitle,
            modeSegments: { A: modeA, B: modeB, C: modeC },
            assertions: t14,
            control_threeSheetsAreDistinct: t14distinct + ' of 3',
        },
        TEST_15_column_header: {
            organizer_singleRound: orgC.columnHeader_default,
            organizer_roundView: orgM.columnHeader_Round1,
            organizer_eventView_theControl: orgM.columnHeader_Event,
            golfersCard: cardC.columnHeader,
            teamEvent_organizer: orgS.columnHeader_default,
            teamEvent_card: cardS.columnHeader,
            printedSheet_individual: orgC.printColumnHeader,
            printedSheet_team: orgS.printColumnHeader,
            assertions: t15,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
