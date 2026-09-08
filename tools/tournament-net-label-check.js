#!/usr/bin/env node
// ============================================================================
// THE WORD ON THE CARD MUST MATCH THE ARITHMETIC UNDER IT.
//
// An individual event can be set to Net on a course the app has never mapped.
// resolveTournamentCourseData() fabricates a 1..18 stroke index so the round can
// still be played, courseIndexSynthetic records that it did, and the engine
// REFUSES to allocate net on it - hasUsableStrokeIndex() is the gate and it
// works. The board is scored gross, correctly.
//
// The label is not asked the same question. It reads scoringMode alone, so the
// golfer's card says "Net" and "net is worked out for you" over a gross result.
// That is the worst kind of defect this repo keeps finding: nothing is broken on
// screen, the numbers are right, and the sentence describing them is false.
//
// TEST 11  the golfer's card. Net on a REAL index must say Net and BE net;
//          net on a synthetic index must be gross AND must not claim otherwise.
// TEST 12  the organizer's surfaces - the manage header and the printed sheet.
//
// Board expectations are computed BY HAND below and compared with what the page
// rendered. Asking the engine what it should say and then agreeing with it would
// prove nothing.
//
//   node tools/tournament-net-label-check.js
//
//   exit 0   every label matches the arithmetic beneath it
//   exit 1   a label the JSON names disagrees with its own board
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');   // WAVE 8: writer-shaped fixtures

// Par 4 every hole so par arithmetic is trivial; SI 1..18 once each so
// getStrokes is trivial too.
const REAL_COURSE = [];
for (let i = 1; i <= 18; i++) REAL_COURSE.push({ hole: i, par: 4, hcpIndex: i });

// Three golfers, all round 90 on a par 72.
//   Ace   hcp 0    0 strokes -> net 90 -> +18
//   Bogey hcp 18  18 strokes -> net 72 ->   E
//   Cal   hcp 9    9 strokes -> net 81 ->  +9
// Scored gross, all three are +18 and tied.
const HAND_COMPUTED_NET = { Ace: '+18', Bogey: 'E', Cal: '+9' };
const HAND_COMPUTED_GROSS = { Ace: '+18', Bogey: '+18', Cal: '+18' };

function netEvent(synthetic) {
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
        name: 'Net Championship', format: 'individual', scoringMode: 'net',
        courseName: synthetic ? 'Unmapped Muni' : 'True Blue', activeCourseKey: 'x',
        courseData: REAL_COURSE, courseIndexSynthetic: !!synthetic, entryFee: 0,
        players: field.players, scoringGroups: groups, scores: scores,
    });
}

const CAPTURE = `
(function () {
  window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () { window.__printed = true; };
})();`;

// The golfer's card. innerText, scoped - never textContent, which on these pages
// is mostly the inline application source.
const PROBE_CARD = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const out = {};
  out.eventSub = t('event-sub');
  out.statusSub = t('status-sub');
  out.roster = t('team-roster');

  // THE LABEL, read as a word rather than as a substring of anything. "Net" must
  // not be matched inside "Net Championship", which is the event's NAME and would
  // make every reading positive on both fixtures.
  const sub = out.eventSub || '';
  const segments = sub.split('•').map(s => s.trim());
  out.segments = segments;
  out.claimsNet = segments.some(s => /^net$/i.test(s));
  out.claimsGross = segments.some(s => /^gross$/i.test(s));

  // Does anything on the card say net was not available here?
  const cardText = (document.getElementById('main-content').innerText || '');
  out.saysNetUnavailable =
      /(no real stroke index|can'?t be allocated|cannot be allocated|not available|scoring gross instead|scored gross)/i
      .test(cardText);

  // The card's own leaderboard tab, which is what the golfer compares against.
  const tab = document.getElementById('tab-btn-leaderboard');
  if (tab) tab.click();
  out.board = Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
      .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
  return JSON.stringify(out);
})()`;

// The organizer's surfaces.
const PROBE_ORGANIZER = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  const out = {};
  out.manageHeader = t('manage-t-sub');
  out.board = Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
      .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
  const pb = Array.from(document.querySelectorAll('button'))
      .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
  if (pb) pb.click();
  out.printSheet = t('tournament-print-view');
  // THE SUBTITLE'S MODE SEGMENT, not a substring of the whole sheet. When this
  // check was written the sheet stated no scoring mode at all, so any "net" on
  // it was a claim. It states one now, and the refusal wording legitimately
  // contains the word - "so net strokes can't be allocated" is the OPPOSITE of
  // claiming net. Searching the document would fail a correct sheet.
  const psub = document.querySelector('#tournament-print-view p');
  out.printSubtitle = psub ? (psub.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  out.printMode = (() => {
    const parts = String(out.printSubtitle || '').split('\\u2022').map(x => x.trim());
    return parts.length >= 3 ? parts[2] : null;
  })();

  const word = s => (s || '').split('•').map(x => x.trim()).some(x => /^net$/i.test(x));
  out.headerClaimsNet = word(out.manageHeader);
  out.printClaimsNet = /^Net\\b/i.test(out.printMode || '');
  out.printSaysGrossOrNetAtAll = /^(net|gross)\\b/i.test(out.printMode || '');
  out.saysNetUnavailable =
      /(no real stroke index|can'?t be allocated|cannot be allocated|not available|scoring gross instead|scored gross)/i
      .test(document.body.innerText || '');
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-net-label-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const boardMatches = (lines, expected) => Object.keys(expected).every(name =>
    lines.some(l => l.indexOf(name) !== -1
        && l.trim().split(/\s+/).pop() === expected[name]));

(async () => {
    const A = netEvent(false);   // net + real index
    const B = netEvent(true);    // net + synthetic index
    const db = { tournaments: { NETA: A, NETB: B }, trips: {} };

    const run = async (page, query, expression) => {
        const r = await arriveCold({ url: fileUrl(page, query), db, expression,
            preScript: CAPTURE, settleMs: 4500, blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const gidA = Object.keys(A.scoringGroups)[0];
    const gidB = Object.keys(B.scoringGroups)[0];
    const cardA = await run('tournament-scorecard.html', 'tourney=NETA&group=' + gidA, PROBE_CARD);
    const cardB = await run('tournament-scorecard.html', 'tourney=NETB&group=' + gidB, PROBE_CARD);
    const orgA = await run('tournament.html', 'tourney=NETA', PROBE_ORGANIZER);
    const orgB = await run('tournament.html', 'tourney=NETB', PROBE_ORGANIZER);

    // --- THE CONTROL, CHECKED BEFORE ANYTHING IS BELIEVED ---------------------
    // A probe that reads the same label on both fixtures is measuring the event
    // name, not the label, and everything below it would be decoration.
    if (!cardA.claimsNet) {
        bail('THE LABEL PROBE IS INERT OR FIXTURE A IS BROKEN - the card on a REAL '
            + 'stroke index does not read Net, so a negative reading on the synthetic '
            + 'fixture cannot be attributed to anything.');
    }
    if (!boardMatches(cardA.board, HAND_COMPUTED_NET)) {
        bail('FIXTURE A IS NOT SCORING NET - hand-computed ' + JSON.stringify(HAND_COMPUTED_NET)
            + ', card board reads ' + JSON.stringify(cardA.board)
            + '. Nothing about labels can be concluded from it.');
    }
    if (JSON.stringify(cardA.board) === JSON.stringify(cardB.board)) {
        bail('THE TWO FIXTURES DO NOT DIFFER - the real-index board and the synthetic '
            + 'board are identical, so there is no refusal to label.');
    }

    const problems = [];

    // --- TEST 11 -------------------------------------------------------------
    if (!boardMatches(cardA.board, HAND_COMPUTED_NET)) {
        problems.push('TEST 11 A: the board is not the hand-computed net result');
    }
    if (!cardA.claimsNet) problems.push('TEST 11 A: a genuine net event must say Net');

    if (!boardMatches(cardB.board, HAND_COMPUTED_GROSS)) {
        problems.push('TEST 11 B: a synthetic-index event must be scored GROSS, and its '
            + 'board is not the hand-computed gross result: ' + JSON.stringify(cardB.board));
    }
    if (cardB.claimsNet) {
        problems.push('TEST 11 B: THE CARD CLAIMS NET OVER A GROSS BOARD. eventSub = "'
            + cardB.eventSub + '"');
    }
    if (!cardB.saysNetUnavailable) {
        problems.push('TEST 11 B: the card never says net was unavailable for this course');
    }

    // --- TEST 12 -------------------------------------------------------------
    if (orgB.headerClaimsNet) {
        problems.push('TEST 12: the manage header claims Net over a gross board: "'
            + orgB.manageHeader + '"');
    }
    if (orgB.printClaimsNet) {
        problems.push('TEST 12: the printed sheet claims Net over a gross board');
    }

    const report = {
        handComputed: {
            allThreeShot: '90 gross on a par 72',
            net: HAND_COMPUTED_NET, gross: HAND_COMPUTED_GROSS,
        },
        TEST_11_the_golfers_card: {
            fixtureA_realStrokeIndex: {
                eventSub: cardA.eventSub, statusSub: cardA.statusSub,
                claimsNet: cardA.claimsNet, claimsGross: cardA.claimsGross,
                board: cardA.board,
                boardIsTheHandComputedNet: boardMatches(cardA.board, HAND_COMPUTED_NET),
                verdict: (cardA.claimsNet && boardMatches(cardA.board, HAND_COMPUTED_NET))
                    ? 'PASS' : 'FAIL',
            },
            fixtureB_syntheticStrokeIndex: {
                eventSub: cardB.eventSub, statusSub: cardB.statusSub,
                claimsNet: cardB.claimsNet, claimsGross: cardB.claimsGross,
                board: cardB.board,
                boardIsTheHandComputedGross: boardMatches(cardB.board, HAND_COMPUTED_GROSS),
                saysNetUnavailable: cardB.saysNetUnavailable,
                verdict: (!cardB.claimsNet && cardB.saysNetUnavailable
                    && boardMatches(cardB.board, HAND_COMPUTED_GROSS)) ? 'PASS' : 'FAIL',
            },
            control_theProbeReadsTheRealLabel: {
                fixtureA: cardA.claimsNet ? 'reads NET' : 'reads nothing',
                fixtureB: cardB.claimsNet ? 'reads NET' : 'reads nothing',
                boardsDiffer: JSON.stringify(cardA.board) !== JSON.stringify(cardB.board),
            },
        },
        TEST_12_the_organizers_surfaces: {
            fixtureA_realStrokeIndex: {
                manageHeader: orgA.manageHeader, board: orgA.board,
                printSubtitle: orgA.printSubtitle, printMode: orgA.printMode,
            },
            fixtureB_syntheticStrokeIndex: {
                manageHeader: orgB.manageHeader, headerClaimsNet: orgB.headerClaimsNet,
                board: orgB.board,
                printSubtitle: orgB.printSubtitle,
                printMode: orgB.printMode,
                printClaimsNet: orgB.printClaimsNet,
                printSaysGrossOrNetAtAll: orgB.printSaysGrossOrNetAtAll,
                saysNetUnavailable: orgB.saysNetUnavailable,
            },
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
