#!/usr/bin/env node
// ============================================================================
// THE TRIP PAGE HAS FOUR WRITES THAT SAY NOTHING WHEN THEY FAIL.
//
// Measured on a deliberate read-only pass: refuse every write with
// PERMISSION_DENIED, press the controls with a thumb, and the organizer sees
// THREE unhandled rejections in a console they will never open and NOTHING on
// screen. Not an alert, not a colour, not a reverted row.
//
//   toggleRoundCounted   the practice-round / rained-out switch. Refused, the
//                        row still reads "Counts toward trip". THIS ONE MOVES
//                        MONEY: the organizer believes a round is excluded, it
//                        is not, and it stays in the trip total, the
//                        leaderboard, the awards and the points race. They
//                        settle the week from a number that includes a round
//                        they took out.
//   removeRound          drops a round from the trip. Confirm dialog appears,
//                        you say yes, the round is STILL IN THE LIST. Reads
//                        exactly like a slow render, so you press it again.
//   linkRound (update)   relabels a round already in the trip.
//   linkRound (read)     the events/<code> existence check. Refused, the whole
//                        chain dies before the "Couldn't find a round with that
//                        game code" branch can run, so you get nothing at all.
//
// WHY A REFUSAL AND NOT AN OFFLINE DROP. Firebase buffers a write while
// disconnected and settles the promise only on server acknowledgement, so
// offline the promise never settles and no handler of any kind can fire. Only
// a SERVER REFUSAL rejects. That is the case this check builds, and it is the
// only one a .catch can do anything about.
//
// THREE ARMS, AND THE THIRD IS THE ONE THAT MATTERS.
//
//   A  writes refused   -> each control must SAY SO
//   B  reads refused    -> linkRound must say so rather than dying quietly
//   C  everything works -> each control must say NOTHING
//
// Without C this check is satisfied by a page that alerts on every tap, which
// is a different defect wearing the same green tick.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not toggleRoundCounted, not removeRound,
// not linkRound, not loadTrip. The controls are found by their rendered text
// or their own onclick attribute and clicked, the way a thumb does it.
//
// WHAT THIS CANNOT PROVE, SAID PLAINLY. The cold-arrival stub is a static
// fixture: a write resolves but does not mutate the fixture, and the trips/
// listener does not re-fire afterwards. So arm C CANNOT show the row flipping
// to "Excluded from trip totals" - that redraw is the listener's job and the
// listener is already proven by the page rendering at all. What arm C does
// prove is the thing the fix could actually break: that a SUCCESSFUL write
// stays silent. Teaching the stub to mutate and re-fire would be teaching the
// harness to answer the question, and it would change the shared harness five
// other checks depend on.
//
//   node tools/trip-silent-write-check.js
//
//   exit 0   every refused write is reported, and no successful write is
//   exit 1   at least one write fails silently, or a good write cries wolf
//   exit 2   could not run, or a control was never actually pressed.
//            NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// A trip with two linked rounds, so there is something to toggle, something to
// remove and something to relabel. Scores present so the round is real.
const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const players = [
    { id: 101, name: 'Marty', hcp: '6', playingForMoney: true },
    { id: 102, name: 'Dave', hcp: '10', playingForMoney: true }
];
function scores() {
    const s = {};
    players.forEach((p, i) => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = PARS[h - 1] + i; });
    return s;
}
const round = (name) => ({
    eventName: name, roundDay: name, eventCategory: 'weekend', categoryIcon: '⛳',
    activeCourseKey: 'c', courseName: 'Course', gameFormat: 'stroke',
    courseData: course, players: players, scores: scores()
});

const db = {
    trips: {
        WAVE1: {
            name: 'Silent Writes', createdAt: 1, rounds: {
                RA: { label: 'Day 1', addedAt: 1 },
                RB: { label: 'Day 2', addedAt: 2 }
            }
        }
    },
    events: { RA: round('Day 1'), RB: round('Day 2') },
    global_courses: {}
};

// Shared preamble: capture alerts, auto-confirm, and record what was ATTEMPTED
// so "no alert" can never be graded against a control that did nothing.
// EACH ALERT IS TAGGED WITH THE PRESS THAT CAUSED IT.
//
// The first version of this check collected alerts into one flat list and asked
// "does ANY alert mention this control's subject". Three of its four assertions
// were satisfied by the WRONG message: removeRound's sentence contains both
// "round" and "totals", so it answered for linkRound and for the toggle's
// both-facts rule as well as its own. Two negative controls - a stripped-down
// toggle message, and the linkRound restructure reverted - both passed against a
// broken page. Only tagging makes each assertion answerable by one control.
const CAPTURE = `
 window.__alerts = [];
 window.__attempts = [];
 window.__pressed = [];
 window.alert = function (m) {
   window.__alerts.push({
     after: window.__pressed.length ? window.__pressed[window.__pressed.length - 1] : '(nothing pressed yet)',
     msg: String(m)
   });
 };
 window.confirm = function () { return true; };
`;

// Wraps the database. `mode` decides what is refused.
function wrapDb(mode) {
    return `
 (function () {
   var od = window.firebase.database;
   window.firebase.database = function () {
     var real = od();
     return { ref: function (p) {
       var r = real.ref(p);
       var path = String(p);
       ${mode === 'refuseWrites' ? `
       ['set', 'update', 'remove'].forEach(function (m) {
         r[m] = function () {
           window.__attempts.push(m + ' ' + path);
           return Promise.reject(new Error('PERMISSION_DENIED: Permission denied'));
         };
       });` : ''}
       ${mode === 'refuseEventReads' ? `
       if (/^events\\//.test(path)) {
         r.once = function () {
           window.__attempts.push('read ' + path);
           return Promise.reject(new Error('PERMISSION_DENIED: Permission denied'));
         };
       }` : ''}
       ${mode === 'allow' ? `
       ['set', 'update', 'remove'].forEach(function (m) {
         var orig = r[m];
         r[m] = function () { window.__attempts.push(m + ' ' + path); return orig.apply(r, arguments); };
       });` : ''}
       return r;
     } };
   };
 })();`;
}

// THE THUMB. Each control found by its own rendered text or onclick attribute,
// pressed with a gap so one alert cannot be mistaken for another's.
const PRESS = `
 function press(sel, tag) {
   var el = document.querySelector(sel);
   if (el) { window.__pressed.push(tag); el.click(); }
 }
 setTimeout(function () { press('#rounds-list [onclick^="toggleRoundCounted"]', 'toggleRoundCounted'); }, 3200);
 setTimeout(function () { press('#rounds-list [onclick^="removeRound"]', 'removeRound'); }, 4000);
 setTimeout(function () {
   var c = document.getElementById('link-round-code');
   var l = document.getElementById('link-round-label');
   if (c && l) { c.value = 'RA'; l.value = 'Day One, relabelled'; }
   var b = Array.prototype.slice.call(document.querySelectorAll('button'))
     .filter(function (e) { return /Add This Round/i.test(e.innerText || ''); })[0];
   if (b) { window.__pressed.push('linkRound'); b.click(); }
 }, 4800);
`;

const PROBE = `
(() => JSON.stringify({
  pressed: window.__pressed || [],
  attempts: window.__attempts || [],
  alerts: window.__alerts || [],
  // Did the row visibly change? Under a static fixture it must not - see the
  // header. Recorded so a future reader can see it was looked at.
  rowsText: (document.getElementById('rounds-list').innerText || '').trim().split('\\n').slice(0, 6)
}))()`;

async function arm(mode) {
    const r = await arriveCold({
        url: fileUrl('trip.html', 'trip=WAVE1'), db,
        preScript: CAPTURE + wrapDb(mode) + PRESS,
        expression: PROBE, settleMs: 9000
    });
    if (!r.ok) return { mode, ran: false, reason: r.reason };
    try { return { mode, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { mode, ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

// A message counts as "said so" only if it names the control's own subject.
// A generic "something went wrong" on every control would pass a looser test
// and tell the organizer nothing about which round is now wrong.
const SAYS = {
    toggleRoundCounted: /count|includ|total/i,
    removeRound: /remove|still (in|linked)|not removed/i,
    linkRound: /round|label|link/i
};

(async () => {
    const results = {};
    for (const m of ['refuseWrites', 'refuseEventReads', 'allow']) results[m] = await arm(m);

    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, results }, null, 2));
        process.exit(2);
    };
    for (const m of Object.keys(results)) {
        const r = results[m];
        if (!r.ran) bail(`${m} did not run: ${r.reason}`);
        // THE GATE. "No alert" is trivially true of a control nobody pressed.
        if (r.pressed.length < 3) {
            bail(`${m}: only pressed ${JSON.stringify(r.pressed)} - a control this check `
               + `is about was never reached, so its silence proves nothing.`);
        }
        if (r.attempts.length === 0) {
            bail(`${m}: no database operation was attempted at all, so nothing was `
               + `refused and nothing was allowed. pressed=${JSON.stringify(r.pressed)}`);
        }
    }

    const failures = [];

    // The message THIS control produced, and no other. `after` is the last press
    // recorded when the alert fired, so an alert can only ever answer for the
    // control that caused it.
    const msgFrom = (arm, tag) => (arm.alerts.find((a) => a.after === tag) || {}).msg || '';

    // ---- A: refused writes must each be reported, BY THE CONTROL PRESSED ----
    const A = results.refuseWrites;
    ['toggleRoundCounted', 'removeRound', 'linkRound'].forEach((tag) => {
        const msg = msgFrom(A, tag);
        if (!msg) {
            failures.push(`A refuseWrites: ${tag} was pressed, its write was REFUSED, and the `
                + `organizer was told NOTHING. alerts=${JSON.stringify(A.alerts)}`);
        } else if (!SAYS[tag].test(msg)) {
            failures.push(`A refuseWrites: ${tag} said something that does not name what failed - `
                + `a generic "something went wrong" leaves the organizer not knowing which round `
                + `is now wrong. got="${msg}"`);
        }
    });
    // The toggle is the one that moves money, so its own sentence has to carry
    // both facts. Asked of the toggle's message specifically: the removeRound
    // sentence also contains "still" and "totals", and answering with it is
    // exactly how this assertion was inert the first time it was written.
    const toggleMsg = msgFrom(A, 'toggleRoundCounted');
    if (toggleMsg && !(/still/i.test(toggleMsg) && /total/i.test(toggleMsg))) {
        failures.push(`A refuseWrites: the toggle's OWN message does not state BOTH facts - that `
            + `the round is STILL counting and that the TOTALS above include it. One alone does `
            + `not tell them the number they are about to settle from is wrong. got="${toggleMsg}"`);
    }

    // ---- B: a refused read must be reported, not swallowed ----
    const B = results.refuseEventReads;
    const linkMsg = msgFrom(B, 'linkRound');
    if (!linkMsg) {
        failures.push(`B refuseEventReads: the events/<code> lookup was REFUSED and linkRound said `
            + `nothing - the chain died before its own "couldn't find that game code" branch. `
            + `alerts=${JSON.stringify(B.alerts)}`);
    } else if (!SAYS.linkRound.test(linkMsg)) {
        failures.push(`B refuseEventReads: linkRound spoke but did not name the round. got="${linkMsg}"`);
    }

    // ---- C: nothing works must stay quiet ----
    const C = results.allow;
    const noisy = C.alerts.filter((a) => !/give this round a short label|enter the game code/i.test(a.msg));
    if (noisy.length) {
        failures.push(`C allow: every write SUCCEEDED and the page still complained. A control that `
            + `cries wolf on a good write is the same defect from the other side. `
            + `alerts=${JSON.stringify(noisy)}`);
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, results }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
