#!/usr/bin/env node
// ============================================================================
// A TEAM SCORE GOES INTO THE ROUND IT WAS PLAYED IN, AND ONLY WHEN THAT ROUND
// IS OPEN.
//
// THREE DEFECTS, ONE CAUSE, ALL FIXED - and this check is what holds them.
//
// The TEAM save path in tournament-scorecard.html did not use the machinery the
// INDIVIDUAL path already used, on either side.
//
//   THE LOCK.  roundLocked is honoured by saveIndividualScore. Neither team
//   writer had the guard, and renderAll mentioned roundLocked ZERO times.
//   Measured: a SETUP round accepted a team score and wrote it, with 18 of 18
//   boxes (36 of 36 on best ball) live, while the card said "Enter your team's
//   score below to get started". So did a CLOSED round.
//
//   THE WRITE PATH.  scorePath() already resolved round identity correctly and
//   only saveIndividualScore called it. Measured: Day 1 and Day 2 of the same
//   event BOTH wrote `tournaments/<code>/scores/team1_h1`, the second day
//   overwriting the first as it was played.
//
//   THE READ PATH, WHICH IS THE ONE THAT NEARLY GOT MISSED. renderAll read
//   `currentData.scores` - the event root. Fixing only the write would have
//   blanked every box the instant a score saved: measured, 18 team scores at
//   rounds/r1/scores rendered 0 of 18 filled boxes. Requirement 7 is that arm and
//   it refused a temp copy carrying the write half alone. renderGroup and
//   renderLeaderboard had both been moved to round scope already; renderAll was
//   the site left reading the root on both sides, which is precisely why the team
//   path looked correct - root in, root out.
//
// TWO TEAM WRITERS, NOT ONE. renderAll branches on format: scramble gets one box
// per hole and saveHoleScore, every other team format gets one box per PLAYER and
// savePlayerHoleScore. An earlier version of this check ran scramble only and
// would have signed off a fix that repaired half the defect.
//
// A SINGLE-ROUND TEAM EVENT IS UNAFFECTED AND MUST STAY THAT WAY. scorePath()
// returns the root when there is no round id, which is exactly where a
// single-round board reads. That is requirement 6 and it is the one that
// matters most: the working case must survive the fix.
//
// ON STRANDING EXISTING DATA - AND THIS PARAGRAPH USED TO SAY THE OPPOSITE.
//
// It claimed root-written team scores on a multi-round event were "already
// unreachable - no board reads them", and concluded the change could not strand
// anything visible. HALF OF THAT WAS MEASURED AND HALF WAS ASSUMED. Measured
// afterwards, the assumed half was wrong:
//
//   organizer's board, scores at root   POS "-"  THRU "-"  TO PAR "—"   invisible
//   the TEAM'S OWN CARD, scores at root 18 of 18 boxes filled           VISIBLE
//
// renderAll reads `currentData.scores`, the event root, so the team sees its own
// root-written scores on the card it entered them on. Only the organizer cannot.
// So there IS visible data on the wrong side of this change, and the fix has to
// move the read with the write or it takes those scores off the golfer's screen.
// Requirement 7 is that arm, and it refused a temp copy carrying the write half
// alone.
//
// WHETHER SUCH AN EVENT EXISTS IN THE WILD IS NOT KNOWABLE FROM HERE. The rules
// put .read on tournaments/$tourneyCode and not on the parent, so
// GET /tournaments.json?shallow=true answers "Permission denied" and no client
// can enumerate. Any claim about what is out there is a guess; what is provable
// is that both shapes survive - a single-round event still writes and reads the
// root untouched, and a multi-round event's card follows its scores to the round.
//
//   node tools/tournament-round-scoring-check.js
//
//   exit 0   setup and closed refuse, open accepts, each day keeps its own
//            scores, and a single-round event still works
//   exit 1   any of those is false
//   exit 2   could not run, or a card rendered nothing to type into.
//            NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const teams = {
    team1: { num: 1, name: 'Team One', players: ['A', 'B'], handicap: '0' },
    team2: { num: 2, name: 'Team Two', players: ['C', 'D'], handicap: '0' }
};

// DAY 1 AND DAY 2 ARE DELIBERATELY FAR APART. Day 1 is birdies, Day 2 is
// bogeys - eighteen shots between them per team. If the board ever reads the
// wrong day, or merges them, the number on screen is unmistakably wrong rather
// than plausibly close. A fixture where both days score the same would make
// every assertion below true of a board reading either one.
//
// THE SCORE KEYS ARE FORMAT-SHAPED AND THE FIXTURE MUST MATCH. A scramble round
// stores `team1_h1`; a best-ball round stores `team1_p0_h1` and takes the MIN of
// the players. Feeding scramble-shaped keys to a best-ball event produced a board
// of em-dashes and this check reported it as "a single-round board shows dashes
// where it showed scores before" - an app defect that was entirely my fixture.
// Both teams have two players, so min(par+off, par+off+1) = par+off and the
// best-ball totals come out identical to the scramble ones by construction.
function dayScores(offset, fmt) {
    const s = {};
    for (let h = 1; h <= 18; h++) {
        if (fmt === 'scramble') {
            s['team1_h' + h] = PARS[h - 1] + offset;
            s['team2_h' + h] = PARS[h - 1] + offset + 1;
        } else {
            s['team1_p0_h' + h] = PARS[h - 1] + offset;
            s['team1_p1_h' + h] = PARS[h - 1] + offset + 1;
            s['team2_p0_h' + h] = PARS[h - 1] + offset + 1;
            s['team2_p1_h' + h] = PARS[h - 1] + offset + 2;
        }
    }
    return s;
}
const DAY1 = dayScores(-1, 'scramble');   // Team One 18 under
const DAY2 = dayScores(+1, 'scramble');   // Team One 18 over

// SHAPED LIKE createRound's PAYLOAD (tournament.html:1341), NOT LIKE MY IDEA OF A
// ROUND. An earlier fixture left `format` off the rounds. roundView() returns
// `format: round.format` with NO fallback to the event, so renderAll read
// undefined, fell through its `|| 'scramble'`, and a best-ball round rendered 18
// team boxes instead of 36 per-player ones. I was about to report that as the fix
// breaking format resolution. createRound writes
// `format: base.format || currentData.format || 'individual'` onto every round,
// so a real round always carries one and the fixture must too.
function rnd(id, name, status, order, fmt, scores) {
    return {
        id: id, name: name, status: status, order: order,
        createdAt: 1,
        format: fmt || 'scramble',
        scoringMode: 'gross',
        shambleCountBest: 1,
        courseName: 'Course', activeCourseKey: 'c', courseData: course,
        courseIndexSynthetic: false,
        scoringGroups: {},
        scores: scores || {}
    };
}

function multiRound(opts) {
    opts = opts || {};
    return {
        name: 'Two Day', format: opts.fmt || 'scramble', courseName: 'Course',
        activeCourseKey: 'c', courseData: course, entryFee: '0',
        teams: teams, createdAt: 1, courseIndexSynthetic: false,
        eventModel: 'round-v1',            // ROUND_MODEL, tournament-engine.js:512
        scores: opts.rootScores || {},
        rounds: {
            r1: rnd('r1', 'Day 1', opts.s1 || 'open', 1, opts.fmt, opts.d1),
            r2: rnd('r2', 'Day 2', opts.s2 || 'open', 2, opts.fmt, opts.d2)
        }
    };
}
const singleRound = (scores, fmt) => ({
    name: 'One Day', format: fmt || 'scramble', courseName: 'Course', activeCourseKey: 'c',
    courseData: course, entryFee: '0', teams: teams, createdAt: 1,
    courseIndexSynthetic: false, scores: scores || {}
});

// TWO TEAM WRITERS, NOT ONE, AND THEY ARE REACHED BY DIFFERENT FORMATS.
// renderAll branches at tournament-scorecard.html:605:
//
//   format === 'scramble'   one box per hole  -> saveHoleScore        (:348)
//   anything else           one box per PLAYER -> savePlayerHoleScore (:353)
//
// BOTH hard-code `tournaments/<code>/scores/`, and NEITHER checks roundLocked.
// An earlier version of this check ran scramble only, which measured exactly one
// of the two and would have signed off a fix that repaired half the defect. Every
// write arm below therefore runs both formats.
//
// Types into the first hole box the way a scorekeeper does, and records every
// write the page issues.
const TYPE_AND_WATCH = `
 window.__writes = [];
 (function () {
   var od = window.firebase.database;
   window.firebase.database = function () {
     var real = od();
     return { ref: function (p) {
       var r = real.ref(p);
       ['set', 'remove'].forEach(function (m) {
         var o = r[m];
         r[m] = function () { window.__writes.push(m + ' ' + p); return o.apply(r, arguments); };
       });
       return r;
     } };
   };
 })();
 setTimeout(function () {
   var i = document.querySelector('#holes-list input');
   window.__foundInput = !!i;
   if (i) { i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); }
 }, 3500);`;

// Reads the card back: how many of the hole boxes are carrying a score.
const READ_PROBE = `
(() => {
  const i = Array.prototype.slice.call(document.querySelectorAll('#holes-list input'));
  return JSON.stringify({
    inputs: i.length,
    withValue: i.filter(x => x.value !== '').length,
    firstThree: i.slice(0, 3).map(x => x.value)
  });
})()`;

const WRITE_PROBE = `
(() => JSON.stringify({
  foundInput: !!window.__foundInput,
  inputs: document.querySelectorAll('#holes-list input').length,
  editable: Array.prototype.slice.call(document.querySelectorAll('#holes-list input'))
    .filter(i => !i.disabled && !i.readOnly).length,
  scoreWrites: (window.__writes || []).filter(w => /scores/.test(w)),
  statusSub: (document.getElementById('status-sub') || {}).textContent || ''
}))()`;

// Reads one round's board off the organizer screen.
function boardProbe(roundLabel) {
    return `
(() => {
  const lines = (document.body.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
  const i = lines.indexOf('POS');
  // STOP AT THE BOARD. Everything below it is prose, and the payout
  // calculator's "No entry fee set for this tournament — set spot amounts"
  // contains an em-dash. An earlier version of this probe returned those lines
  // and the dash test matched THEM, reporting a board full of scores as empty.
  const end = lines.findIndex((l, k) => k > i && /^[🏆💰]|Prize Payout|Paid Spots/.test(l));
  const rows = i >= 0 ? lines.slice(i, end > i ? end : i + 14) : lines.slice(0, 16);
  return JSON.stringify({ found: i >= 0, rows: rows });
})()`;
}
function pickRound(label) {
    return `setTimeout(function(){var b=Array.prototype.slice.call(document.querySelectorAll('[onclick^="showTab"]'))
      .filter(function(e){return /Leaderboard/i.test(e.innerText||'');})[0]; if(b)b.click();},2600);
     setTimeout(function(){var f=Array.prototype.slice.call(document.querySelectorAll('button,[onclick]'))
      .filter(function(e){return (e.innerText||'').trim()===${JSON.stringify(label)};})[0]; if(f)f.click();},4200);`;
}

async function card(db, query, pre, probe) {
    // RC_PAGE lets a negative control point every arm at a TEMP COPY of the page
    // with the diagnosed fix applied, without editing the real file. Unset in
    // normal use.
    const r = await arriveCold({ url: fileUrl(process.env.RC_PAGE || 'tournament-scorecard.html', query), db, preScript: pre,
        expression: probe, settleMs: 7000 });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; } catch (e) { return { ran: false, reason: String(r.value).slice(0, 200) }; }
}
async function board(db, query, label) {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, preScript: pickRound(label),
        expression: boardProbe(label), settleMs: 8000 });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; } catch (e) { return { ran: false, reason: String(r.value).slice(0, 200) }; }
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const failures = [];
    const observed = {};

    const FORMATS = [['scramble', 'saveHoleScore'], ['bestball', 'savePlayerHoleScore']];

    // ---- 1 & 2: SETUP and CLOSED must refuse a team score ----
    for (const [fmt, writer] of FORMATS) {
      for (const [status, key] of [['setup', 'setupRound'], ['closed', 'closedRound']]) {
        const db = { tournaments: { T: multiRound({ s1: status, fmt }) }, events: {}, trips: {}, global_courses: {} };
        const res = await card(db, 'tourney=T&team=1&round=r1', TYPE_AND_WATCH, WRITE_PROBE);
        if (!res.ran) bail(`the ${status}/${fmt} round card did not run: ` + res.reason);
        observed[key + '_' + fmt] = { editable: res.editable, of: res.inputs, writes: res.scoreWrites, sub: res.statusSub };
        // THE GATE: a card with nothing to type into refuses everything trivially.
        if (!res.foundInput) {
            bail(`the ${status}/${fmt} round rendered no score input at all, so "it refused the `
               + 'write" would be true of a blank page', { res });
        }
        // THE VISUAL HALF, AND IT IS NOT COSMETIC. A guard that silently drops
        // the write leaves a golfer typing eighteen scores into eighteen live
        // boxes that keep the numbers on screen and save none of them - which is
        // worse than accepting them, because nothing tells them. renderGroup
        // already disables the inputs and prints a reason into #status-sub at
        // :564/:568/:579. renderAll mentions roundLocked zero times.
        if (res.editable > 0) {
            failures.push(`a ${status.toUpperCase()} ${fmt} round left ${res.editable} of `
                + `${res.inputs} score boxes enabled, and the card says `
                + `"${res.statusSub}". The individual path disables them and says why.`);
        }
        if (res.scoreWrites.length > 0) {
            failures.push(`a ${status.toUpperCase()} round ACCEPTED a team score on a ${fmt} event `
                + `and wrote ${JSON.stringify(res.scoreWrites)} via ${writer}. The individual path `
                + 'guards this with `if (roundLocked) return;` and the organizer screen says '
                + 'nobody can enter scores yet.');
        }
      }
    }

    // ---- 3: an OPEN round must still accept one ----
    for (const [fmt, writer] of FORMATS) {
        const db = { tournaments: { T: multiRound({ s1: 'open', fmt }) }, events: {}, trips: {}, global_courses: {} };
        const res = await card(db, 'tourney=T&team=1&round=r1', TYPE_AND_WATCH, WRITE_PROBE);
        if (!res.ran) bail(`the open/${fmt} round card did not run: ` + res.reason);
        observed['openRound_' + fmt] = { editable: res.editable, of: res.inputs, writes: res.scoreWrites };
        if (res.scoreWrites.length === 0) {
            failures.push(`an OPEN ${fmt} round refused a team score (${writer}). This is the arm `
                + 'that stops the fix becoming "team scoring no longer works".');
        }
    }

    // ---- 4: the two days must write DIFFERENT keys, under the round ----
    for (const [fmt] of FORMATS) {
        const db = { tournaments: { T: multiRound({ fmt }) }, events: {}, trips: {}, global_courses: {} };
        const d1 = await card(db, 'tourney=T&team=1&round=r1', TYPE_AND_WATCH, WRITE_PROBE);
        const d2 = await card(db, 'tourney=T&team=1&round=r2', TYPE_AND_WATCH, WRITE_PROBE);
        if (!d1.ran || !d2.ran) bail(`the two-day ${fmt} write comparison did not run`);
        observed['dayOneWrites_' + fmt] = d1.scoreWrites;
        observed['dayTwoWrites_' + fmt] = d2.scoreWrites;
        const same = JSON.stringify(d1.scoreWrites) === JSON.stringify(d2.scoreWrites);
        if (same) {
            failures.push(`Day 1 and Day 2 of a ${fmt} event wrote the SAME key - `
                + `${JSON.stringify(d1.scoreWrites)}. The second day overwrites the first in `
                + 'storage as it is played.');
        }
        [['Day 1', d1], ['Day 2', d2]].forEach(([label, res]) => {
            const underRound = res.scoreWrites.every((w) => /\/rounds\/r[12]\/scores\//.test(w));
            if (res.scoreWrites.length && !underRound) {
                failures.push(`${label} of a ${fmt} event wrote outside its round: `
                    + `${JSON.stringify(res.scoreWrites)}. `
                    + 'scorePath() already resolves this correctly for the individual path.');
            }
        });
    }

    // ---- 5: each day's board shows that day's scores ----
    {
        const db = { tournaments: { T: multiRound({ d1: DAY1, d2: DAY2 }) }, events: {}, trips: {}, global_courses: {} };
        for (const [label, expect, key] of [['Day 1', '-18', 'dayOneBoard'], ['Day 2', '+18', 'dayTwoBoard']]) {
            const b = await board(db, 'tourney=T', label);
            if (!b.ran) bail(`the ${label} board did not run: ` + b.reason);
            observed[key] = b.rows;
            if (!b.found) {
                failures.push(`the ${label} board rendered no POS column at all.`);
            } else if (b.rows.includes('—') || !b.rows.join(' ').includes(expect)) {
                failures.push(`the ${label} board does not show that day's scores. Expected a `
                    + `${expect} somewhere; got ${JSON.stringify(b.rows.slice(0, 10))}.`);
            }
        }
    }

    // ---- 5b: THE PREMISE, MEASURED RATHER THAN ASSUMED ----
    // Requirement 5 above seeds the scores where the fix will PUT them, and
    // shows the board reads them. That proves the destination is reachable; it
    // says nothing about today. This arm seeds them where saveHoleScore
    // ACTUALLY writes them - the event root - which is the state every existing
    // two-day team event is in, and reads the board a head pro would read.
    //
    // It is also what proves the dash test on line 237 can fire at all. If an
    // empty board rendered something other than a bare em-dash cell, that
    // assertion would be inert and requirement 6 would be guarding nothing.
    {
        const db = { tournaments: { T: multiRound({ rootScores: DAY1 }) }, events: {}, trips: {}, global_courses: {} };
        const b = await board(db, 'tourney=T', 'Day 1');
        if (!b.ran) bail('the root-scores board did not run: ' + b.reason);
        observed.todayRootScoresBoard = b.rows;
        observed.dashAssertionCanFire = b.rows.includes('\u2014');
        if (b.found && b.rows.join(' ').includes('-18')) {
            failures.push('PREMISE WRONG, AND THIS CHECK IS DESCRIBING A DEFECT THAT IS NOT '
                + `THERE: a multi-round board read team scores from the event ROOT - ${JSON.stringify(b.rows)}. `
                + 'If the board already reaches root-written scores, moving the write is a '
                + 'migration with data on both sides, not a repair. Re-read before changing '
                + 'anything.');
        }
    }

    // ---- 7: THE CARD MUST READ BACK WHAT IT WROTE ----
    //
    // THIS ARM EXISTS BECAUSE THE FIX WITHOUT IT IS WORSE THAN THE DEFECT.
    // A first pass at this check measured only where the write LANDED. Applied to
    // a temp copy carrying `scorePath()` in both team writers, it went green -
    // and the page it certified would have blanked every box on screen the moment
    // a score saved, because renderAll reads `currentData.scores`, the EVENT ROOT,
    // and the write now goes to the round.
    //
    // The team path is round-blind on BOTH sides today, which is why it works:
    // root in, root out. renderGroup:485 shadows currentData with roundScope and
    // saveIndividualScore:378 uses `scope`, so the individual path is round-aware
    // on both sides. renderAll is the one that was left behind, and the fix has to
    // move both halves or neither.
    //
    // tournament-scorecard.html:283 records this exact failure happening once
    // already, on the leaderboard tab: "Reading the event root showed this golfer
    // a full field with every score blank - including the fifty-four they had just
    // entered on the card one tab away."
    //
    // WHAT THE HARNESS CANNOT DO, STATED PLAINLY. cold-arrival's stub answers
    // set() with Promise.resolve() and does not persist or re-fire the listener,
    // so a true type-it-then-see-it round trip is not available here and teaching
    // the stub to fake one would assert the mock rather than the page. So the two
    // halves are measured separately - the write arms above prove where a score
    // GOES, this arm proves where the card LOOKS - and the pairing assertion at
    // the end requires them to name the same place.
    {
        const seed = dayScores(-1, 'scramble');
        const atRound = multiRound({ d1: seed });
        const atRoot = multiRound({ rootScores: seed });
        const rRound = await card({ tournaments: { T: atRound }, events: {}, trips: {}, global_courses: {} },
            'tourney=T&team=1&round=r1', '', READ_PROBE);
        const rRoot = await card({ tournaments: { T: atRoot }, events: {}, trips: {}, global_courses: {} },
            'tourney=T&team=1&round=r1', '', READ_PROBE);
        if (!rRound.ran || !rRoot.ran) bail('the read-back arm did not run');
        observed.cardReadsRoundScores = rRound;
        observed.cardReadsRootScores = rRoot;

        // THE GATE. If neither placement renders anything the card is broken for
        // some third reason and "it reads the wrong one" means nothing.
        if (rRound.withValue === 0 && rRoot.withValue === 0) {
            bail('a multi-round team card showed no scores wherever they were stored, so this '
               + 'arm cannot tell a wrong read path from a card that renders nothing',
                { rRound, rRoot });
        }

        const writesToRound = (observed.dayOneWrites_scramble || [])
            .every((w) => /\/rounds\/r[12]\/scores\//.test(w));
        if (rRound.withValue === 0) {
            failures.push('the card does not read the round it is scoring: 18 team scores stored '
                + `at rounds/r1/scores rendered ${rRound.withValue} of ${rRound.inputs} filled `
                + `boxes, while the same scores at the event root rendered ${rRoot.withValue}. `
                + 'renderAll reads currentData.scores; renderGroup:485 shadows it with roundScope '
                + 'and renderAll does not. MOVING THE WRITE WITHOUT MOVING THIS BLANKS THE CARD '
                + 'ON SAVE.');
        }
        // The pairing. Where it writes and where it looks must be one place.
        if (writesToRound && rRound.withValue === 0) {
            failures.push('THE WRITE AND THE READ DISAGREE: the team writer saves to '
                + `${JSON.stringify(observed.dayOneWrites_scramble)} and the card reads the event `
                + 'root. A golfer would watch their score vanish as it saved.');
        }
    }

    // ---- 6: A SINGLE-ROUND TEAM EVENT MUST BE UNTOUCHED ----
    for (const [fmt] of FORMATS) {
        const db = { tournaments: { S: singleRound(dayScores(-1, fmt), fmt) }, events: {}, trips: {}, global_courses: {} };
        const res = await card(db, 'tourney=S&team=1', TYPE_AND_WATCH, WRITE_PROBE);
        if (!res.ran) bail(`the single-round ${fmt} card did not run: ` + res.reason);
        observed['singleRoundWrites_' + fmt] = res.scoreWrites;
        const toRoot = res.scoreWrites.every((w) => /tournaments\/S\/scores\//.test(w));
        if (!res.scoreWrites.length || !toRoot) {
            failures.push(`a SINGLE-round ${fmt} team event no longer writes to the event root: `
                + `${JSON.stringify(res.scoreWrites)}. This case works today and must survive - `
                + 'scorePath() returns the root when there is no round id.');
        }
        const b = await board(db, 'tourney=S', 'Leaderboard');
        observed['singleRoundBoard_' + fmt] = b.ran ? b.rows : ['(did not run)'];
        if (b.ran && b.found && b.rows.includes('—')) {
            failures.push(`a SINGLE-round ${fmt} team board shows dashes where it showed scores before.`);
        }
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, observed }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
