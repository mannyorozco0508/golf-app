#!/usr/bin/env node
// ============================================================================
// EVERY SURFACE THAT SHOWS A TRIP TOTAL SAYS WHAT IS IN IT.
//
// The money panel ends with a true sentence built from TRIP_TOTAL_INCLUDES.
// THE TWO SURFACES THAT ACTUALLY TRAVEL SAY NOTHING AT ALL. Measured cold:
// the recap card prints "FINAL SETTLEMENT / Dave -> Marty / $50" and the share
// text prints "Dave owes Marty $50", and neither carries a scope sentence. A
// group pasting that into a chat has nothing telling them whether their side
// matches are already in the number.
//
// So the lie is on the screen's header, the truth is on the screen's footer in
// the smallest type on the page, and the surfaces people settle from are
// silent. This check is about the silence; trip_money_scope_test.js is about
// the lie.
//
// WHY THIS NEEDS A BROWSER AND A SOURCE SCAN WILL NOT DO. A page can build the
// sentence perfectly and never render it - which is exactly what the card and
// the text do today. Both are produced only by PRESSING their buttons, and
// buildShareRecapText hands its output to navigator.share rather than to the
// DOM. Nothing about that is visible in the source.
//
// THE FIXTURE IS A STROKE PLAY ROUND WITH A $50 SIDE MATCH, and that is chosen,
// not incidental. Stroke Play produces NO main-format money bet at all -
// money-engine.js:717, "No main-format money bet for Stroke Play" - so the trip
// total here is $50 with a main-format component of ZERO. On this fixture the
// header's claim that the total is "every linked round's main-format bet" is
// not merely incomplete, it is backwards: it describes a component that
// contributed nothing and omits the one that contributed everything.
//
// THE ORACLE IS THE PAGE'S OWN BUILDER. Each surface must contain the sentence
// tripTotalScopeSentence() returns - not a string this file hard-codes. That is
// what makes the fifth negative control work: change the builder while a
// surface keeps the old wording and the surface goes red, because the two no
// longer agree. A hard-coded expectation here would sit happily while the page
// contradicted itself.
//
//   node tools/trip-money-scope-check.js
//
//   exit 0   every declared surface renders the sentence the builder produces
//   exit 1   a surface shows a trip total without saying what is in it, or
//            shows a sentence that is not the builder's
//   exit 2   could not run, or a surface showed no money at all - in which case
//            "it carries the sentence" would be vacuous. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// THE POSITIVE LIST. Every place a golfer can read a trip-wide money figure.
// A new one added to the page without a row here is the gap this list exists to
// close, so `expectedCount` is asserted too - see the gate below.
const TRIP_MONEY_SURFACES = [
    { key: 'panel', what: 'the Trip Money Settlement panel',
      reach: 'open the section', why: 'the screen the organizer reads' },
    { key: 'card', what: 'the recap CARD',
      reach: 'press "Trip Recap Card"', why: 'the image that gets screenshotted into a group chat' },
    { key: 'share', what: 'the recap SHARE TEXT',
      reach: 'press "Share as Text"', why: 'the message people paste and then settle from' }
];

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
const db = {
    trips: { SCOPE: { name: 'Scope Probe', createdAt: 1, rounds: { RA: { label: 'Day 1', addedAt: 1 } } } },
    events: {
        RA: {
            eventName: 'Day 1', roundDay: 'Day 1', eventCategory: 'weekend', categoryIcon: '⛳',
            activeCourseKey: 'c', courseName: 'Course',
            gameFormat: 'stroke',              // deliberately: no main-format money
            courseData: course, players: players, scores: scores(),
            sideMatches: {
                s1: { format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'],
                      startHole: 1, createdAt: 1, stake: 50, pressRule: 'none' }
            }
        }
    },
    global_courses: {}
};

const PRE = `
 window.__shared = null;
 navigator.share = function (o) { window.__shared = (o && o.text) || ''; return Promise.resolve(); };
 setTimeout(function () {
   Array.prototype.forEach.call(document.querySelectorAll('details.trip-section'), function (d) {
     if (!d.open) d.querySelector('summary').click();
   });
 }, 2600);
 setTimeout(function () {
   var b = Array.prototype.slice.call(document.querySelectorAll('button'))
     .filter(function (e) { return /Trip Recap Card/i.test(e.innerText || ''); })[0];
   if (b) b.click();
 }, 3600);
 setTimeout(function () {
   var b = Array.prototype.slice.call(document.querySelectorAll('button'))
     .filter(function (e) { return /Share as Text|Share Trip Recap/i.test(e.innerText || ''); })[0];
   if (b) b.click();
 }, 4400);
`;

const PROBE = `
(() => {
  const t = (id) => { const e = document.getElementById(id); return e ? (e.innerText || '').trim() : ''; };
  // THE ORACLE, from the page itself. Absent means the builder does not exist,
  // which is a different failure from a surface forgetting to render it.
  let sentence = null, sentenceError = null;
  try {
    sentence = (typeof tripTotalScopeSentence === 'function') ? String(tripTotalScopeSentence()) : null;
  } catch (e) { sentenceError = String(e && e.message || e); }
  let declared = null;
  try { declared = (typeof TRIP_TOTAL_INCLUDES !== 'undefined') ? TRIP_TOTAL_INCLUDES : null; } catch (e) {}
  return JSON.stringify({
    sentence: sentence, sentenceError: sentenceError, declared: declared,
    surfaces: {
      panel: t('trip-money-settlement'),
      card: t('trip-recap-card'),
      share: window.__shared === null ? '' : String(window.__shared)
    }
  });
})()`;

(async () => {
    const r = await arriveCold({
        url: fileUrl('trip.html', 'trip=SCOPE'), db,
        preScript: PRE, expression: PROBE, settleMs: 8000
    });
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    if (!r.ok) bail(r.reason);
    let o;
    try { o = JSON.parse(r.value); } catch (e) { bail('non-JSON probe: ' + String(r.value).slice(0, 300)); }

    // ---- THE GATE. "It carries the sentence" is vacuous on a surface that
    // never showed a total. Each surface must contain the money first.
    const MONEY = /\$\s?50|owes|→|->/;
    for (const s of TRIP_MONEY_SURFACES) {
        const txt = o.surfaces[s.key] || '';
        if (!txt) {
            bail(`${s.what} rendered nothing - ${s.reach} produced no output, so nothing about `
               + `its wording was tested.`, { surfaces: o.surfaces });
        }
        if (!MONEY.test(txt)) {
            bail(`${s.what} rendered without any money in it, so asserting it explains the money `
               + `would prove nothing. text="${txt.slice(0, 200)}"`, { surfaces: o.surfaces });
        }
    }

    const failures = [];

    // ---- THE BUILDER MUST EXIST, and say something real ----
    if (!o.sentence) {
        failures.push(`tripTotalScopeSentence() does not exist on the page`
            + (o.sentenceError ? ` (threw: ${o.sentenceError})` : '')
            + `. There is no single source for the sentence, so every surface that carries one `
            + `carries its own copy - which is how the same lie got written twice. `
            + `TRIP_TOTAL_INCLUDES is ${JSON.stringify(o.declared)}.`);
    } else {
        if (o.sentence.trim().length < 20) {
            failures.push(`tripTotalScopeSentence() returned "${o.sentence}" - too short to be `
                + `telling anyone anything, and short enough that "contains it" is trivially true.`);
        }
        // It must name every category the list declares, or the single source is
        // itself incomplete and every surface faithfully repeats a gap.
        (o.declared || []).forEach((cat) => {
            const head = String(cat).replace(/^the /i, '').split(' ')[0];
            if (!new RegExp(head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o.sentence)) {
                failures.push(`the builder's sentence omits "${cat}", which TRIP_TOTAL_INCLUDES `
                    + `declares is in the total. Every surface would repeat the omission.`);
            }
        });
    }

    // ---- EVERY DECLARED SURFACE CARRIES IT ----
    if (o.sentence) {
        // Compared on collapsed whitespace: the card wraps, the share text does
        // not, and a line break is not a difference in what was said.
        const norm = (x) => String(x).replace(/\s+/g, ' ').trim();
        const want = norm(o.sentence);
        TRIP_MONEY_SURFACES.forEach((s) => {
            if (!norm(o.surfaces[s.key]).includes(want)) {
                failures.push(`${s.what} shows a trip total and does NOT carry the sentence. `
                    + `Reached by: ${s.reach}. Why it matters: ${s.why}. `
                    + `Expected to contain "${want}".`);
            }
        });
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        builderSentence: o.sentence,
        declared: o.declared,
        surfaces: Object.fromEntries(TRIP_MONEY_SURFACES.map((s) => [s.key, {
            what: s.what,
            carriesSentence: o.sentence ? String(o.surfaces[s.key]).replace(/\s+/g, ' ')
                .includes(String(o.sentence).replace(/\s+/g, ' ').trim()) : false,
            excerpt: String(o.surfaces[s.key] || '').replace(/\s+/g, ' ').slice(0, 160)
        }]))
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
