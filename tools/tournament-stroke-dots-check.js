#!/usr/bin/env node
// ============================================================================
// WHERE DO I GET A SHOT? THE CARD HAS NEVER SAID.
//
// A net event's card shows each golfer's handicap in the roster - "Ace (0) •
// Bogey (18) • Cal (9)" - and nothing at all about WHICH holes those numbers
// fall on. Wave 11 established this is MISSING rather than dead: every input is
// already in scope (hcpIndex per hole, the snapshot-resolved handicap, and
// playerStrokesOnHole itself), and no renderer was ever written.
//
// TEST 29  the dots appear and match the allocation, hand-computed
// TEST 30  the gate - dots only when net is actually being applied
// TEST 31  the handicap SNAPSHOT feeds them, one surface further out than
//          Test 21
//
// THE ALLOCATION IS HAND-COMPUTED HERE. Asserting the dots against
// playerStrokesOnHole would be asking the renderer's own source of truth
// whether the renderer is right, which is no test at all. The stroke index is
// deliberately SHUFFLED so hole number and stroke index never coincide - with
// SI 1..18 in hole order, "a dot on the nine lowest indexes" and "a dot on the
// first nine holes" are the same sentence and a wrong implementation passes.
//
//   node tools/tournament-stroke-dots-check.js
//
//   exit 0   the dots say where the strokes actually fall
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('./lib/tournament-fixtures.js');

// Par 4 everywhere; stroke index shuffled, 1..18 once each.
const SI = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14];
const COURSE = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));

// HAND-COMPUTED, from the table above and nothing else.
//   handicap 0  -> no stroke anywhere
//   handicap 18 -> exactly one stroke on every hole
//   handicap 9  -> one stroke on the holes whose INDEX is 1..9, which with the
//                  shuffle above are holes 1, 3, 5, 7, 8, 10, 12, 14 and 17.
const HAND_HCP9_HOLES = [1, 3, 5, 7, 8, 10, 12, 14, 17];
const HAND_HCP18_HOLES = [];
for (let h = 1; h <= 18; h++) HAND_HCP18_HOLES.push(h);

function netEvent(opts) {
    const o = opts || {};
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
    return {
        record: F.eventRecord({
            name: 'Net Championship', format: 'individual',
            scoringMode: o.mode || 'net',
            courseName: o.synthetic ? 'Unmapped Muni' : 'True Blue',
            activeCourseKey: 'x', courseData: COURSE,
            courseIndexSynthetic: !!o.synthetic, entryFee: 0,
            players: field.players, scoringGroups: groups, scores: scores,
        }),
        groupId: g.id, byName: field.byName, players: field.players,
    };
}

// TEST 31: two rounds, the snapshot taken at 18 and the live record corrected
// to 9 afterwards. Round one must keep drawing 18; round two must draw 9.
function snapshotEvent() {
    const field = F.playerField([{ name: 'Snap', handicap: '18' }]);
    const SNAP = field.byName.Snap;
    const scores = {};
    for (let h = 1; h <= 18; h++) scores[SNAP + '_h' + h] = 5;
    const groups = {};
    const g = F.scoringGroup('Group 1', [SNAP], 1);
    groups[g.id] = g;
    const shared = { format: 'individual', scoringMode: 'net', courseName: 'True Blue',
        activeCourseKey: 't', courseData: COURSE, scoringGroups: groups, scores: scores };

    const roundOne = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 1', createdAt: 1 }, shared)),
        field.players);                       // snapshot: 18

    const corrected = JSON.parse(JSON.stringify(field.players));
    corrected[SNAP].handicap = '9';           // the correction between rounds

    const roundTwo = F.openRound(
        F.roundRecord(Object.assign({ name: 'Round 2', createdAt: 2 }, shared)),
        corrected);                           // snapshot: 9

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
        groupId: g.id, roundOneId: roundOne.id, roundTwoId: roundTwo.id,
        snapshotOne: roundOne.handicaps[SNAP], liveNow: corrected[SNAP].handicap,
    };
}

// Reads, per hole and per golfer, how many dots the card drew. The dot element
// is looked up as a SIBLING of the golfer's own input, so a dot cannot be
// credited to the wrong player by position.
const PROBE = `
(() => {
  const out = { byName: {}, dotElements: 0 };
  const all = document.querySelectorAll('#holes-list .stroke-dots');
  out.dotElements = all.length;
  const rows = Array.from(document.querySelectorAll('#holes-list [id^="hole-row-"]'));
  out.holeRows = rows.length;
  rows.forEach(row => {
    const hole = Number(String(row.id).replace('hole-row-', ''));
    Array.from(row.querySelectorAll('label')).forEach(lab => {
      const input = lab.querySelector('input');
      const dots = lab.querySelector('.stroke-dots');
      if (!input) return;
      const m = /saveIndividualScore\\('([^']+)'/.exec(input.getAttribute('onchange') || '');
      if (!m) return;
      const name = (lab.textContent || '').trim().split(/\\s+/)[0];
      const key = m[1];
      const bucket = out.byName[key] || (out.byName[key] = { label: name, holes: {} });
      bucket.holes[hole] = dots ? (dots.textContent || '').trim() : null;
    });
  });
  out.rosterText = (document.getElementById('team-roster').innerText || '')
      .replace(/\\s+/g, ' ').trim();
  out.eventSub = (document.getElementById('event-sub').innerText || '')
      .replace(/\\s+/g, ' ').trim();
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-stroke-dots-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// Which holes did this golfer get at least one dot on, and were any doubled?
function dotHoles(bucket) {
    const holes = [], counts = {};
    Object.keys(bucket.holes).forEach(h => {
        const text = bucket.holes[h] || '';
        const n = (text.match(/•/g) || []).length;
        counts[h] = n;
        if (n > 0) holes.push(Number(h));
    });
    return { holes: holes.sort((a, b) => a - b), counts: counts };
}
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

module.exports = { netEvent: netEvent, snapshotEvent: snapshotEvent, PROBE: PROBE };

if (require.main !== module) return;

(async () => {
    const net = netEvent({});
    const gross = netEvent({ mode: 'gross' });
    const synth = netEvent({ synthetic: true });
    const snap = snapshotEvent();

    const db = {
        tournaments: { NET: net.record, GROSS: gross.record, SYNTH: synth.record,
                       SNAP: snap.record },
        trips: {},
    };
    const run = async (query) => {
        const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', query),
            db, expression: PROBE, preScript: 'window.alert=function(){};',
            settleMs: 4200, blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const onNet = await run('tourney=NET&group=' + net.groupId);
    const onGross = await run('tourney=GROSS&group=' + gross.groupId);
    const onSynth = await run('tourney=SYNTH&group=' + synth.groupId);
    const r1 = await run('tourney=SNAP&group=' + snap.groupId + '&round=' + snap.roundOneId);
    const r2 = await run('tourney=SNAP&group=' + snap.groupId + '&round=' + snap.roundTwoId);

    if (onNet.holeRows !== 18) bail('the net card did not render 18 holes - nothing measured');
    if (snap.snapshotOne !== '18' || snap.liveNow !== '9') {
        bail('the snapshot fixture is not the shape it claims: snapshot '
            + snap.snapshotOne + ', live ' + snap.liveNow);
    }

    const problems = [];
    const at = (probe, name) => {
        const key = Object.keys(probe.byName).find(k => probe.byName[k].label === name);
        return key ? dotHoles(probe.byName[key]) : null;
    };

    const ace = at(onNet, 'Ace'), bogey = at(onNet, 'Bogey'), cal = at(onNet, 'Cal');
    if (!ace || !bogey || !cal) bail('a golfer was not found on the net card');

    const t29 = {
        dotsExist: onNet.dotElements > 0,
        hcp0_getsNone: sameList(ace.holes, []),
        hcp18_getsOneOnEveryHole: sameList(bogey.holes, HAND_HCP18_HOLES)
            && Object.keys(bogey.counts).every(h => bogey.counts[h] === 1),
        hcp9_getsOneOnTheNineLowestIndexes: sameList(cal.holes, HAND_HCP9_HOLES),
        hcp9_getsNoneOnTheOtherNine: Object.keys(cal.counts)
            .filter(h => HAND_HCP9_HOLES.indexOf(Number(h)) === -1)
            .every(h => cal.counts[h] === 0),
    };
    Object.keys(t29).forEach(k => { if (!t29[k]) problems.push('TEST 29 ' + k + ': FAILED'); });

    const t30 = {
        grossEvent_noDots: onGross.dotElements === 0
            || Object.keys(onGross.byName).every(k => dotHoles(onGross.byName[k]).holes.length === 0),
        syntheticIndex_noDots: onSynth.dotElements === 0
            || Object.keys(onSynth.byName).every(k => dotHoles(onSynth.byName[k]).holes.length === 0),
        control_netRealIndexDoesDraw: bogey.holes.length === 18,
        control_syntheticCardSaysGross: /\bGross\b/.test(onSynth.eventSub || ''),
    };
    Object.keys(t30).forEach(k => { if (!t30[k]) problems.push('TEST 30 ' + k + ': FAILED'); });

    const s1 = at(r1, 'Snap'), s2 = at(r2, 'Snap');
    const t31 = {
        roundOneDrawsTheSnapshot18: !!s1 && sameList(s1.holes, HAND_HCP18_HOLES),
        roundTwoDrawsTheCorrected9: !!s2 && sameList(s2.holes, HAND_HCP9_HOLES),
        control_theTwoRoundsDiffer: !!s1 && !!s2 && !sameList(s1.holes, s2.holes),
    };
    Object.keys(t31).forEach(k => { if (!t31[k]) problems.push('TEST 31 ' + k + ': FAILED'); });

    const report = {
        handComputed: {
            strokeIndexByHole: SI,
            hcp0: 'no stroke on any hole',
            hcp18: 'one stroke on all eighteen',
            hcp9: 'one stroke on holes ' + HAND_HCP9_HOLES.join(', ')
                + ' - the nine whose stroke index is 1..9',
        },
        TEST_29_dots_match_the_allocation: {
            dotElementsOnTheCard: onNet.dotElements,
            roster: onNet.rosterText,
            Ace_hcp0: ace, Bogey_hcp18: { holes: bogey.holes.length + ' holes',
                                          everyHoleExactlyOne: Object.keys(bogey.counts)
                                              .every(h => bogey.counts[h] === 1) },
            Cal_hcp9: cal.holes,
            assertions: t29,
        },
        TEST_30_the_gate: {
            grossEvent: { dotElements: onGross.dotElements, sub: onGross.eventSub },
            syntheticIndex: { dotElements: onSynth.dotElements, sub: onSynth.eventSub },
            control_netRealIndex: { dotElements: onNet.dotElements },
            assertions: t30,
        },
        TEST_31_the_snapshot_feeds_the_dots: {
            snapshotTakenAt: snap.snapshotOne, liveHandicapNow: snap.liveNow,
            roundOneDotHoles: s1 ? s1.holes.length + ' holes' : null,
            roundTwoDotHoles: s2 ? s2.holes : null,
            assertions: t31,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
