#!/usr/bin/env node
// ============================================================================
// THE TRIP CODE IS A MASTER KEY.
//
// trip.html has no organizer concept at all - the word appears once, in a
// comment. Measured cold, everyone holding a six-character trip code gets:
//
//   removeRound(...)          one X per round, drops it from the trip
//   toggleRoundCounted(...)   what counts toward the MONEY total
//   linkRound()               add any round to the trip
//   createRoundForTrip()      create rounds inside it
//
// and each round row hands out index.html?game=CODE with no group parameter,
// which measures as isOrganizerView() === true with "Delete round for
// everyone" visible.
//
// THE APP ALREADY HAS AN ANSWER TO THIS, AND IT IS NOT isOrganizerView().
//
// index.html carries TWO separate ideas that are deliberately not the same:
//
//   isOrganizerView()        === !hasGroupLock. Means only "this URL has no
//                            ?group=". Shapes the VIEW - whose scorecard, which
//                            links panel.
//   hasOrganizerAuthority()  ?organizer=<token> matched against the round's own
//                            stored organizerToken. Its own comment calls this
//                            "the ONLY new write authority in the app".
//
// And that comment rejects the first as authority in words that apply to trips
// unchanged: "the bare link is the one shared with the whole group ... treating
// it as organizer authority would hand every golfer the ability to edit all
// twelve cards". A trip code is shared even more widely than a round link - the
// recap card prints it on the shareable image.
//
// So this check requires the SECOND mechanism, mirrored: a bearer token stored
// at trips/<code>/organizerToken and carried as ?organizer=<token>. One answer
// in the app, expressed twice, rather than two answers.
//
// WHAT DOES NOT TRANSFER: ?group=. A trip has no foursomes, and it needs no
// attenuated link - under the token model the plain trip code IS the follow
// link, which is why the recap card may go on printing it.
//
// THE LEGACY RULE RUNS THE OPPOSITE WAY FROM ROUNDS, AND THAT IS THE TRAP.
// On a round the token only ADDS power, so "no stored token -> no authority"
// leaves legacy rounds exactly as they were. On a trip the token REMOVES power
// from everyone else, so the same rule would lock every trip that already
// exists out of its own controls. Absent token must therefore mean EVERYONE
// still has authority - today's behaviour, preserved - and only trips carrying
// a token are gated. Arm D is that case and it is not optional.
//
// HONEST LIMIT, in the same words index.html uses about itself: database.rules
// .json grants trips/$tripCode ".write": true, so a client can simply delete
// the token node and re-open the trip. This is a guardrail against ACCIDENTS at
// the same strength as the existing ?group= links, NOT a security boundary.
// Making it one is the rules wave, not this one.
//
//   node tools/trip-organizer-check.js
//
//   exit 0   a plain trip link cannot destroy anything, the organizer link can,
//            and a trip with no token behaves exactly as it does today
//   exit 1   a plain link still holds the master key, or the organizer link
//            lost controls it should have, or a legacy trip got locked out
//   exit 2   could not run, or a surface rendered nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const players = [
    { id: 101, name: 'Marty', hcp: '6', playingForMoney: true },
    { id: 102, name: 'Dave', hcp: '12', playingForMoney: true }
];
function scores() {
    const s = {};
    players.forEach((p, i) => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = PARS[h - 1] + i; });
    return s;
}
const round = (label) => ({
    eventName: label, roundDay: label, eventCategory: 'weekend', categoryIcon: '⛳',
    activeCourseKey: 'c', courseName: 'Course', gameFormat: 'stroke',
    courseData: course, players: players, scores: scores()
});

function dbFor(withToken) {
    const trip = {
        name: 'Myrtle 2026', createdAt: 1,
        rounds: { RA: { label: 'Day 1', addedAt: 1 }, RB: { label: 'Day 2', addedAt: 2 } }
    };
    if (withToken) trip.organizerToken = TOKEN;
    return { trips: { ORG: trip }, events: { RA: round('Day 1'), RB: round('Day 2') }, global_courses: {} };
}

// THE FIVE CONTROLS THAT CHANGE SOMEBODY ELSE'S TRIP. Found by the handler name
// in their own onclick attribute, so a label edit cannot make this check blind.
const DESTRUCTIVE = ['removeRound', 'toggleRoundCounted', 'linkRound', 'createRoundForTrip'];

const CAPTURE = `
 window.__alerts = [];
 window.alert = function (m) { window.__alerts.push(String(m)); };
 window.confirm = function () { return true; };
 window.__writes = [];
 (function () {
   var od = window.firebase.database;
   window.firebase.database = function () {
     var real = od();
     return { ref: function (p) {
       var r = real.ref(p);
       ['set', 'update', 'remove'].forEach(function (m) {
         var orig = r[m];
         r[m] = function () { window.__writes.push(m + ' ' + p); return orig.apply(r, arguments); };
       });
       return r;
     } };
   };
 })();
 setTimeout(function () {
   Array.prototype.forEach.call(document.querySelectorAll('details.trip-section'), function (d) {
     if (!d.open) d.querySelector('summary').click();
   });
 }, 2600);
`;

// ARM E ONLY. Every other arm reaches the page by thumb; this one DELIBERATELY
// invokes the handler, because the claim under test is precisely "calling it
// directly achieves nothing". Removing a button in devtools must not be a
// bypass, which is the belt-and-braces filterGroup() and endAndClearRound()
// already use in index.html.
const FORCE = `
 setTimeout(function () {
   window.__forced = [];
   ['removeRound', 'toggleRoundCounted'].forEach(function (fn) {
     try {
       if (typeof window[fn] === 'function') {
         window.__forced.push(fn);
         if (fn === 'removeRound') window[fn]('RA'); else window[fn]('RA', true);
       }
     } catch (e) { window.__forced.push(fn + ' threw: ' + e.message); }
   });
 }, 4200);
`;

const PROBE = `
(() => {
  const vis = (el) => el && el.offsetParent !== null;
  const all = Array.prototype.slice.call(document.querySelectorAll('[onclick]'));
  const found = {};
  ${JSON.stringify(DESTRUCTIVE)}.forEach((fn) => {
    found[fn] = all.filter((e) => (e.getAttribute('onclick') || '').indexOf(fn) === 0 ||
                                  (e.getAttribute('onclick') || '').indexOf(fn + '(') >= 0)
                   .filter(vis).length;
  });
  const t = (id) => { const e = document.getElementById(id); return e ? (e.innerText || '').trim() : ''; };
  return JSON.stringify({
    controls: found,
    writes: window.__writes || [],
    forced: window.__forced || null,
    alerts: window.__alerts || [],
    // Proof the page actually loaded, so "no controls" cannot be a blank screen.
    leaderboardLen: t('trip-leaderboard').length,
    moneyLen: t('trip-money-settlement').length,
    roundsLen: t('rounds-list').length,
    // THE ORGANIZER LINK THE PAGE ACTUALLY OFFERS, SCOPED TO ITS OWN ELEMENT.
    //
    // This read /organizer=/ against document.body.innerHTML and was INERT: every
    // page in this repo keeps its whole application in one inline <script>, and
    // body.innerHTML contains that source - including the very string that builds
    // this link, "'&organizer=' + encodeURIComponent(token)". So it matched the
    // page's own code and passed with the row deleted. Caught by the negative
    // control, which is the only reason it is not still there.
    organizerLinkVisible: (() => {
      const el = document.getElementById('trip-organizer-link');
      return !!(el && el.offsetParent !== null && (el.innerText || '').trim().length > 0);
    })(),
    organizerLinkText: (() => {
      const el = document.getElementById('trip-organizer-link');
      return el ? (el.innerText || '').trim().slice(0, 120) : '(no element)';
    })(),
    organizerCopyControls: document.querySelectorAll(
      '#trip-organizer-link [onclick*="copyTripOrganizerLink"]').length
  });
})()`;

async function arm(name, query, withToken, force) {
    const r = await arriveCold({
        url: fileUrl('trip.html', query), db: dbFor(withToken),
        preScript: CAPTURE + (force ? FORCE : ''),
        expression: PROBE, settleMs: force ? 8000 : 6000
    });
    if (!r.ok) return { name, ran: false, reason: r.reason };
    try { return { name, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { name, ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const results = [];
    results.push(await arm('A plain link, trip HAS a token', 'trip=ORG', true, false));
    results.push(await arm('B organizer link', 'trip=ORG&organizer=' + TOKEN, true, false));
    results.push(await arm('C wrong token', 'trip=ORG&organizer=deadbeefdeadbeef', true, false));
    results.push(await arm('D legacy trip, NO token stored', 'trip=ORG', false, false));
    results.push(await arm('E plain link, handler invoked directly', 'trip=ORG', true, true));

    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, results }, null, 2));
        process.exit(2);
    };
    for (const r of results) {
        if (!r.ran) bail(`${r.name} did not run: ${r.reason}`);
        // THE GATE. "No destructive controls" is trivially true of a page that
        // rendered nothing at all.
        if (r.roundsLen < 10 || r.leaderboardLen < 10) {
            bail(`${r.name}: the page did not render its rounds list and leaderboard `
               + `(rounds=${r.roundsLen} chars, leaderboard=${r.leaderboardLen}), so the `
               + `absence of any control proves nothing.`);
        }
    }

    const A = results[0], B = results[1], C = results[2], D = results[3], E = results[4];
    const failures = [];
    const total = (r) => DESTRUCTIVE.reduce((n, k) => n + (r.controls[k] || 0), 0);

    // ---- A: a plain trip link must not be able to change anybody's trip ----
    DESTRUCTIVE.forEach((fn) => {
        if (A.controls[fn] > 0) {
            failures.push(`A: a plain trip link still offers ${fn} (${A.controls[fn]} visible). `
                + `The trip code is printed on the recap card people screenshot, so this is `
                + `handed to everyone who sees the image.`);
        }
    });
    // POSITIVE CONTROL. A follower must still get the trip - the money, the board,
    // the rounds. A page that refuses everything would pass the block above.
    if (A.moneyLen < 10) {
        failures.push(`A: the money settlement did not render for a plain link. Withholding the `
            + `controls must not withhold the trip - watching is the whole point of the link.`);
    }

    // ---- B: the organizer link must keep every control ----
    DESTRUCTIVE.forEach((fn) => {
        if (!(B.controls[fn] > 0)) {
            failures.push(`B: the organizer link has LOST ${fn}. The gate must let the organizer `
                + `through, or the trip cannot be managed at all.`);
        }
    });

    // ---- C: a wrong token is not a token ----
    if (total(C) > 0) {
        failures.push(`C: a WRONG organizer token was accepted - ${JSON.stringify(C.controls)}. `
            + `String comparison against the stored value is the whole mechanism.`);
    }

    // ---- D: a trip with no stored token behaves exactly as it does today ----
    if (total(D) !== total(B)) {
        failures.push(`D: a LEGACY trip carrying no organizerToken lost controls `
            + `(${JSON.stringify(D.controls)} against the organizer's ${JSON.stringify(B.controls)}). `
            + `On a round the token only adds power, so absent means "no override"; on a trip it `
            + `removes power, so absent must mean "everyone still has it" or every trip that `
            + `already exists is locked out of itself.`);
    }

    // ---- E: removing the button in devtools must achieve nothing ----
    if (!E.forced || E.forced.length === 0) {
        failures.push(`E: neither handler could be invoked, so nothing about a devtools bypass `
            + `was tested. forced=${JSON.stringify(E.forced)}`);
    } else {
        const tripWrites = (E.writes || []).filter((w) => /trips\//.test(w));
        if (tripWrites.length > 0) {
            failures.push(`E: calling the handler directly from a plain link WROTE to the trip: `
                + `${JSON.stringify(tripWrites)}. A gate that only hides the button is not a gate.`);
        }
    }

    // ---- The organizer link has to be reachable, or the token is unusable ----
    if (!B.organizerLinkVisible || B.organizerCopyControls < 1) {
        failures.push(`B: the organizer link is not on the page, so a token exists that nobody can `
            + `obtain. visible=${B.organizerLinkVisible} copyControls=${B.organizerCopyControls} `
            + `text="${B.organizerLinkText}". index.html renders one only when the record carries a `
            + `token; the trip needs the same.`);
    }
    // AND IT MUST NOT BE HANDED TO A FOLLOWER. Showing the row on a plain link
    // would publish the very thing it protects.
    if (A.organizerLinkVisible) {
        failures.push(`A: a plain trip link is SHOWING the organizer link ("${A.organizerLinkText}"). `
            + `That hands over the token to everyone the trip code reaches.`);
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        summary: results.map((r) => ({ arm: r.name, controls: r.controls,
            money: r.moneyLen, forced: r.forced, tripWrites: (r.writes || []).filter((w) => /trips\//.test(w)) }))
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
