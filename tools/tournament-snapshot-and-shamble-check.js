#!/usr/bin/env node
// ============================================================================
// TWO BRANCHES NOTHING HAD EVER EXECUTED.
//
// TEST 21  THE HANDICAP SNAPSHOT. roundView() overlays round.handicaps over the
//          live player record, and until wave 8 no fixture set handicaps and no
//          reachable code path wrote it - so the overlay had never once been
//          taken. Every multi-round result this project reported was measured on
//          the FALLBACK arm, which every test mistook for the whole function.
//
//          The rule it implements is the one that matters for money: a round is
//          scored with the numbers the field had when it opened. Correcting a
//          golfer's handicap before round two must not silently restate round
//          one's result, which has already been posted on a wall.
//
// TEST 22  shambleCountBest. createRound and saveTournament both write it;
//          every fixture omitted it, and computeTeamHoleScore reads `|| 1`. So a
//          Best-2 shamble scored as Best 1 would have looked completely normal
//          and no fixture could have caught it.
//
// ARITHMETIC IS DONE HERE, BY HAND. Asking the engine what it thinks and then
// checking it agrees with itself proves nothing.
//
//   node tools/tournament-snapshot-and-shamble-check.js
//
//   exit 0   both branches behave as hand-computed
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');

// Par 4 everywhere, stroke index 1..18 once each: a real card, and one where
// getStrokes is trivial to do in your head.
const COURSE = [];
for (let i = 1; i <= 18; i++) COURSE.push({ hole: i, par: 4, hcpIndex: i });
const PAR = 72;

// ---------------------------------------------------------------------------
// TEST 21 fixture
//
//   Snap  opens round one on 18. Handicap later corrected to 9.
//         Shoots 90 in both rounds.
//           round one, snapshot 18 -> net 72 -> E
//           round two, snapshot  9 -> net 81 -> +9
//   Late  joins AFTER round one opened, so round one's snapshot has no entry
//         for them. Live handicap 18, shoots 90.
//           round one, NO snapshot entry -> falls back to live 18 -> E
//         That fallback is the arm every previous test was really exercising,
//         so it has to keep working.
// ---------------------------------------------------------------------------
const HAND_ROUND_ONE = { Snap: 'E', Late: 'E' };
const HAND_ROUND_TWO = { Snap: '+9' };
// With round one's snapshot deleted, Snap falls back to the corrected 9 and the
// round one board moves from E to +9. That is the control proving the probe can
// see the overlay at all.
const HAND_ROUND_ONE_WITHOUT_SNAPSHOT = { Snap: '+9' };

function snapshotEvent(opts) {
    const o = opts || {};
    const field = F.playerField([
        { name: 'Snap', handicap: '18' },
        { name: 'Late', handicap: '18' },
    ]);
    const SNAP = field.byName.Snap, LATE = field.byName.Late;

    // Round one opens while only Snap is in the field, on 18.
    const atOpenTime = {};
    atOpenTime[SNAP] = field.players[SNAP];

    const scoresOne = {}, scoresTwo = {};
    for (let h = 1; h <= 18; h++) {
        scoresOne[SNAP + '_h' + h] = 5; scoresOne[LATE + '_h' + h] = 5;
        scoresTwo[SNAP + '_h' + h] = 5;
    }
    const groups = {};
    const g = F.scoringGroup('Group 1', [SNAP, LATE], 1);
    groups[g.id] = g;

    const shared = { format: 'individual', scoringMode: 'net', courseName: 'True Blue',
        activeCourseKey: 't', courseData: COURSE, scoringGroups: groups };

    let roundOne = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 1', createdAt: 1, scores: scoresOne }, shared)),
        atOpenTime);
    if (o.withoutSnapshot) { roundOne = Object.assign({}, roundOne); delete roundOne.handicaps; }

    // THE CORRECTION. The live record now says 9; round one's snapshot must not
    // move, and round two - opened afterwards - must take the new number.
    const corrected = JSON.parse(JSON.stringify(field.players));
    corrected[SNAP].handicap = '9';

    const roundTwo = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 2', createdAt: 2, scores: scoresTwo }, shared)),
        corrected);

    const rounds = {};
    rounds[roundOne.id] = roundOne;
    rounds[roundTwo.id] = roundTwo;

    return {
        record: F.eventRecord({
            name: 'Club Championship', format: 'individual', scoringMode: 'net',
            courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
            entryFee: 0, players: corrected, scoringGroups: {},
            eventModel: 'round-v1', rounds: rounds,
        }),
        roundOneId: roundOne.id, roundTwoId: roundTwo.id,
        snapshotOne: roundOne.handicaps || null,
        liveHandicap: corrected[SNAP].handicap,
    };
}

// ---------------------------------------------------------------------------
// TEST 22 fixture. One team of four, every hole 3/4/5/6.
//   Best 1 -> 3 a hole  -> 54 over 18, par 72 -> -18
//   Best 2 -> 3 + 4 = 7 -> 126 over 18       -> +54
// ---------------------------------------------------------------------------
const HAND_BEST_1 = '-18';
const HAND_BEST_2 = '+54';

function shambleEvent(countBest) {
    const scores = {};
    for (let h = 1; h <= 18; h++) {
        [3, 4, 5, 6].forEach((v, i) => { scores['team1_p' + i + '_h' + h] = v; });
    }
    return F.eventRecord({
        name: 'Shamble Day', format: 'shamble', courseName: 'Caledonia',
        activeCourseKey: 'c', courseData: COURSE, entryFee: 0,
        shambleCountBest: countBest,
        teams: { team1: { num: 1, name: 'Team 1', handicap: 0,
                          players: ['Ann', 'Bob', 'Cid', 'Dee'] } },
        scores: scores,
    });
}

const CAPTURE = '(function () { window.alert = function () {}; window.print = function () {}; })();';

// Reads a round's board by pressing the page's own round filter.
const boardProbe = (roundName) => `
(() => {
  const rows = () => Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
      .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
  const out = { eventBoard: rows() };
  const btn = Array.from(document.querySelectorAll('#lb-round-filter button'))
      .find(b => (b.innerText || '').trim() === ${JSON.stringify(roundName)});
  out.filterFound = !!btn;
  if (btn) btn.click();
  out.roundBoard = rows();
  return JSON.stringify(out);
})()`;

const PLAIN_BOARD = `
JSON.stringify({ board: Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
    .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim()) })`;

function bail(msg) {
    console.error('tournament-snapshot-and-shamble-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const at = (board, name, toPar) =>
    board.some(l => l.indexOf(name) !== -1 && l.trim().split(/\s+/).pop() === toPar);

(async () => {
    const withSnap = snapshotEvent({});
    const without = snapshotEvent({ withoutSnapshot: true });
    const best1 = shambleEvent(1);
    const best2 = shambleEvent(2);

    const db = {
        tournaments: { SNAP: withSnap.record, NOSNAP: without.record,
                       B1: best1, B2: best2 },
        trips: {},
    };
    const run = async (code, expression) => {
        const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code),
            db, expression, preScript: CAPTURE, settleMs: 4200,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    // The fixture itself has to be the shape being claimed, or nothing follows.
    if (!withSnap.snapshotOne) bail('the fixture did not carry a handicap snapshot');
    if (without.snapshotOne) bail('the control fixture still carries a snapshot');
    if (withSnap.liveHandicap !== '9') bail('the live handicap was not corrected');

    const r1 = await run('SNAP', boardProbe('Round 1'));
    const r2 = await run('SNAP', boardProbe('Round 2'));
    const r1NoSnap = await run('NOSNAP', boardProbe('Round 1'));
    const b1 = await run('B1', PLAIN_BOARD);
    const b2 = await run('B2', PLAIN_BOARD);

    if (!r1.filterFound || !r2.filterFound) {
        bail('the round filter did not render - no round board was measured');
    }

    const problems = [];

    // --- TEST 21 -----------------------------------------------------------
    const t21 = {
        roundOne_usesTheSnapshot18_notTheLive9: at(r1.roundBoard, 'Snap', HAND_ROUND_ONE.Snap),
        roundTwo_usesTheCorrected9: at(r2.roundBoard, 'Snap', HAND_ROUND_TWO.Snap),
        control_aGolferWithNoSnapshotEntryFallsBackToLive:
            at(r1.roundBoard, 'Late', HAND_ROUND_ONE.Late),
        control_removingTheSnapshotChangesTheBoard:
            at(r1NoSnap.roundBoard, 'Snap', HAND_ROUND_ONE_WITHOUT_SNAPSHOT.Snap),
        control_theTwoRoundOneBoardsDiffer:
            JSON.stringify(r1.roundBoard) !== JSON.stringify(r1NoSnap.roundBoard),
    };
    Object.keys(t21).forEach(k => { if (!t21[k]) problems.push('TEST 21 ' + k + ': FAILED'); });

    // --- TEST 22 -----------------------------------------------------------
    const t22 = {
        best2_sumsTheBestTwo: at(b2.board, 'Team 1', HAND_BEST_2),
        control_best1_takesTheLowestOnly: at(b1.board, 'Team 1', HAND_BEST_1),
        control_theTwoBoardsDiffer: JSON.stringify(b1.board) !== JSON.stringify(b2.board),
    };
    Object.keys(t22).forEach(k => { if (!t22[k]) problems.push('TEST 22 ' + k + ': FAILED'); });

    const report = {
        TEST_21_handicap_snapshot: {
            handComputed: 'Snap shoots 90 twice. Round one opened on 18 -> net 72 -> E. '
                + 'Handicap then corrected to 9. Round two opened after -> net 81 -> +9. '
                + 'Late has no round-one snapshot entry and falls back to live 18 -> E.',
            snapshotTakenAtOpen: withSnap.snapshotOne,
            liveHandicapNow: withSnap.liveHandicap,
            roundOneBoard: r1.roundBoard,
            roundTwoBoard: r2.roundBoard,
            control_roundOneWithTheSnapshotDeleted: r1NoSnap.roundBoard,
            assertions: t21,
        },
        TEST_22_shambleCountBest: {
            handComputed: 'every hole 3/4/5/6 on a par 72. Best 1 -> 54 -> -18. '
                + 'Best 2 -> 3+4 per hole -> 126 -> +54.',
            best2Board: b2.board, best1Board_control: b1.board,
            assertions: t22,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
