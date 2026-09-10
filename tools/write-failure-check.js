#!/usr/bin/env node
// ============================================================================
// A SCORE THAT THE SERVER REFUSED, AND A GOLFER WHO IS TOLD NOTHING.
//
// index.html:4962-4966 writes a score with no .catch. The only thing observing
// the promise is GolfNet.track, and pwa-boot.js:138 is
//
//     promise.then(settle, settle);
//
// - the same handler for fulfilment and rejection. So a refused write decrements
// the pending counter exactly like a successful one, and renderPill's last branch
// sets display:none, which in that design is the affirmative claim that everything
// is saved. The golfer's 5 disappears and the app says it is all saved.
//
// MEASURED, NOT ASSUMED - why a .catch here is safe. Against the real
// firebase-database-compat.js and the live golfapp-9fb21 database, driven over CDP:
//
//   denied while online          REJECTED in ~110ms
//                                "PERMISSION_DENIED: Permission denied", code
//                                PERMISSION_DENIED
//   offline at the write         PENDING - never settled in 15s
//   online, socket cut at +40ms  RESOLVED at 3478ms once the network came back
//
// A rejection therefore means the server refused, never "this golfer is in a dead
// spot on the 7th". That is what makes surfacing it correct rather than nagging,
// and it is why this check models failure as a REJECTED promise.
//
// COLD ARRIVAL. The page loads its own scripts, runs its own init, registers its
// own listener and renders on its own. NOTHING HERE CALLS A PAGE FUNCTION - not
// saveScore, not renderPill, not trackWrite. The score is entered the way a golfer
// enters one: set the input's value and dispatch the 'change' event the markup
// already listens for (index.html:7726 carries onchange="saveScore(...)"). A check
// that calls saveScore itself proves saveScore works when invoked and says nothing
// about what a golfer sees.
//
// TWO ARMS, AND THE SECOND IS NOT OPTIONAL.
//   REJECT   writes reject with the PERMISSION_DENIED shape measured above.
//            Reads still resolve, so the round renders and the failure is the only
//            thing under test.
//   RESOLVE  the positive control. Identical navigation, identical fixture, writes
//            that succeed. It proves the round renders, the score box is reachable,
//            the change event lands, and NO failure text appears on a good round.
//            Without it "no failure message" is trivially true of a blank page -
//            this repo has already reported a refusal on a clean round for exactly
//            that reason.
//
// innerText THROUGHOUT, never textContent. Every page here keeps its whole
// application in one inline <script>, so body.textContent is mostly JavaScript and
// would match failure wording in the source of a page that rendered nothing.
//
//   node tools/write-failure-check.js
//
//   exit 0   a refused score is visible to the golfer, and a good round is clean
//   exit 1   a refused score is silent, or the control round is broken
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'GD33CW';

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const PLAYERS = ['Dale Whitmore', 'Nate Brennan', 'Russ Calloway', 'Cal Devereaux']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(3 + i * 5),
                      playingForMoney: true, team: i < 2 ? 'Team 1' : 'Team 2' }));

// Holes 1-9 already carry a score so the card is a round in progress; hole 10
// onward is empty, which is where the check types. A box that already holds a
// value would let "the value is still there" pass without the write ever running.
const SCORES = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 9; h++) SCORES['p' + p.id + '_h' + h] = 4; });

const db = { events: { [CODE]: {
    eventName: 'Single Round', courseName: 'Caledonia Golf & Fish Club',
    activeCourseKey: 'sc_caledonia', gameFormat: 'stroke', courseData: CD,
    players: PLAYERS, scores: SCORES, settlementMode: 'whole-dollar'
} } };

// Injected before any page script. It does three things and none of them is a
// call into the app:
//   1. captures alert() instead of blocking a headless run on a modal
//   2. makes writes reject (REJECT arm only), with the shape measured above
//   3. waits for the page to render its own score boxes, then drives one the way
//      a golfer does - value, then the 'change' event the markup already binds
const simulateFix = process.env.WFC_SIMULATE_FIX === '1';

function preScript(mode) {
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.print = function () {};

      // COUNTED IN BOTH ARMS. Without this the check cannot tell "the app is
      // silent about a refusal" from "no refusal ever happened" - and those two
      // look identical from the outside, which would make the whole check
      // tautological. The probe refuses to grade an arm that attempted no write.
      window.__writes = { attempted: 0, rejected: 0, resolved: 0, paths: [] };
      window.__unhandled = [];
      window.addEventListener('unhandledrejection', function (e) {
        window.__unhandled.push(String((e && e.reason && e.reason.message) || e.reason || 'unknown'));
      });

      var origDatabase = window.firebase.database;
      window.firebase.database = function () {
        var real = origDatabase();
        return { ref: function (p) {
          var r = real.ref(p);
          ['set', 'update', 'remove'].forEach(function (m) {
            var orig = r[m];
            r[m] = function () {
              window.__writes.attempted++;
              if (window.__writes.paths.length < 12) window.__writes.paths.push(String(p) + ' .' + m + '()');
              if (${mode === 'reject'}) {
                // The shape a real RTDB refusal has, measured against the live
                // database: an Error whose message is prefixed PERMISSION_DENIED
                // and which carries .code.
                var e = new Error('PERMISSION_DENIED: Permission denied');
                e.code = 'PERMISSION_DENIED';
                // Counted here, at creation, NOT via .catch on the returned
                // promise: attaching a handler would mark it handled and suppress
                // the unhandledrejection event, which is itself evidence that
                // nothing in the page observes the failure.
                window.__writes.rejected++;
                return Promise.reject(e);
              }
              var p2 = Promise.resolve(orig ? orig.apply(r, arguments) : undefined);
              p2.then(function () { window.__writes.resolved++; });
              return p2;
            };
          });
          return r;
        } };
      };

      // ---- THE TOOL'S OWN NEGATIVE CONTROL -------------------------------
      // A check that has only ever been seen to FAIL might be a check that can
      // never pass. WFC_SIMULATE_FIX=1 injects the smallest thing that would
      // count as a fix - a visible message and a non-idle pill - WITHOUT touching
      // index.html or pwa-boot.js. If the assertions below still report FAIL with
      // this on, they are unsatisfiable and the tool is broken, not the app.
      // This is a control affordance. It is off unless the env var is set, and it
      // must never be used to make a real run pass.
      if (${mode === 'reject'} && ${simulateFix === true}) {
        window.addEventListener('unhandledrejection', function () {
          var n = document.getElementById('wfc-sim-note');
          if (!n) {
            n = document.createElement('div');
            n.id = 'wfc-sim-note';
            document.body.insertBefore(n, document.body.firstChild);
          }
          n.textContent = '\\u26A0\\uFE0F Could not save \\u2014 check your signal and re-enter that hole';
          var pill = document.getElementById('golfnet-status');
          if (pill) { pill.style.display = 'block'; pill.textContent = '\\u26A0\\uFE0F 1 change was refused'; }
        });
      }

      // Drive the input once the PAGE has rendered it. Polling rather than a fixed
      // delay, so a slow render is a longer wait and not a false "no score box".
      window.__drove = null;
      var tries = 0;
      var iv = setInterval(function () {
        if (++tries > 150) {
          clearInterval(iv);
          window.__drove = { ok: false, why: 'no enabled .score-input ever appeared' };
          return;
        }
        var boxes = Array.prototype.slice.call(
            document.querySelectorAll('input.score-input:not([disabled])'));
        // An EMPTY box, so "the value is on screen" cannot be satisfied by a value
        // that was already there before this check touched anything.
        var el = boxes.filter(function (b) { return !b.value; })[0];
        if (!el) return;
        clearInterval(iv);
        try {
          el.focus();
          el.value = '5';
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          window.__drove = { ok: true, typed: '5', at: Date.now(),
                             emptyBoxesFound: boxes.filter(function (b) { return !b.value; }).length };
        } catch (e) {
          window.__drove = { ok: false, why: 'dispatch threw: ' + (e && e.message) };
        }
      }, 100);
    })();`;
}

// Wording a fix might reasonably use. Deliberately broad: this check must not
// depend on copy that has not been written yet - it asks whether ANYTHING on
// screen tells the golfer the write failed.
const FAIL_RE = /(could ?n.?t save|could not save|not saved|failed to save|save failed|did ?n.?t save|couldn.t be saved|permission|denied|try again|re-?enter)/i;

const PROBE = `
(() => {
  const out = {};
  const clean = s => String(s || '').replace(/\\s+/g, ' ').trim();

  out.drove = window.__drove;
  out.alerts = (window.__alerts || []).slice();
  out.writes = window.__writes;
  out.unhandledRejections = (window.__unhandled || []).slice();

  // The score box the check typed into, found the same way it was found.
  const boxes = Array.prototype.slice.call(
      document.querySelectorAll('input.score-input'));
  out.scoreBoxes = boxes.length;
  out.boxesShowing5 = boxes.filter(b => b.value === '5').length;

  // THE PILL. Hidden or empty is this design's way of saying "all saved".
  const pill = document.getElementById('golfnet-status');
  out.pill = pill
      ? { present: true,
          display: (pill.style && pill.style.display) || '',
          text: clean(pill.innerText),
          hiddenOrIdle: ((pill.style && pill.style.display) === 'none')
                        || clean(pill.innerText) === '' }
      : { present: false, hiddenOrIdle: true };

  // ANY rendered text on the page that tells the golfer the write failed.
  // innerText, never textContent - the whole app is one inline <script> and
  // textContent would match this page's own source code.
  const body = clean(document.body.innerText);
  out.bodyChars = body.length;
  const re = ${FAIL_RE};
  out.bodyFailureMatch = (body.match(re) || [null])[0];

  // Which element carries it, so a real hit can be pointed at.
  let holder = null;
  const all = document.querySelectorAll('div,span,p,strong,em,small,td,th,li,h1,h2,h3,h4,label');
  for (const el of all) {
    if (el.children.length) continue;            // leaves only, so a hit is specific
    const t = clean(el.innerText);
    if (t && re.test(t)) { holder = { tag: el.tagName, id: el.id || '',
                                      cls: el.className || '', text: t.slice(0, 120) }; break; }
  }
  out.failureElement = holder;

  // THE SCORE-BOX LINE, specifically. The pill is page-wide and sits at the top
  // of <body>, so it wins the generic scan above every time - a run could pass on
  // the pill alone while the ported save-state line was never wired at all.
  const ss = document.getElementById('save-state');
  out.saveState = ss
      ? { present: true, cls: ss.className || '', text: clean(ss.innerText) }
      : { present: false, cls: '', text: '' };
  out.alertFailureMatch = (out.alerts.join(' | ').match(re) || [null])[0];

  out.surfaced = !!(out.failureElement || out.alertFailureMatch
                    || (out.pill.present && !out.pill.hiddenOrIdle));
  return JSON.stringify(out);
})()`;

async function arm(mode) {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=' + CODE),
        db,
        preScript: preScript(mode),
        expression: PROBE,
        settleMs: 9000
    });
    if (!r.ok) return { mode, ran: false, reason: r.reason };
    let v; try { v = JSON.parse(r.value); }
    catch (e) { return { mode, ran: false, reason: 'probe returned a non-JSON value: ' + String(r.value).slice(0, 200) }; }
    return { mode, ran: true, ...v };
}

(async () => {
    const reject = await arm('reject');
    const resolve = await arm('resolve');

    const failures = [];
    const notes = [];

    // ---- could the check run at all? --------------------------------------
    for (const r of [reject, resolve]) {
        if (!r.ran) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reject, resolve }, null, 2)); process.exit(2); }
        if (!r.drove || !r.drove.ok) {
            console.log(JSON.stringify({ verdict: 'COULD NOT RUN',
                why: 'the ' + r.mode + ' arm never reached an empty score box: '
                     + ((r.drove && r.drove.why) || 'no __drove record'),
                reject, resolve }, null, 2));
            process.exit(2);
        }
        // THE ANTI-TAUTOLOGY GATE. "The app said nothing about a refusal" and
        // "no refusal happened" are indistinguishable from the outside. If the
        // change event never produced a write, this check proved NOTHING and must
        // not report a verdict either way.
        if (!r.writes || r.writes.attempted < 1) {
            console.log(JSON.stringify({ verdict: 'COULD NOT RUN',
                why: 'the ' + r.mode + ' arm typed a score and NO WRITE WAS ATTEMPTED - '
                     + 'the change event did not reach saveScore, so nothing about '
                     + 'failure handling was exercised',
                reject, resolve }, null, 2));
            process.exit(2);
        }
    }
    if (reject.writes.rejected < 1) {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN',
            why: 'the reject arm attempted ' + reject.writes.attempted
                 + ' write(s) but rejected none - the failure was never induced',
            reject, resolve }, null, 2));
        process.exit(2);
    }
    if (resolve.writes.rejected > 0) {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN',
            why: 'the control arm rejected a write; it is not a clean control',
            reject, resolve }, null, 2));
        process.exit(2);
    }

    // ---- POSITIVE CONTROL: a good round must render and stay clean --------
    if (resolve.scoreBoxes === 0) failures.push('CONTROL: the round rendered no score boxes at all');
    if (resolve.boxesShowing5 < 1) failures.push('CONTROL: the typed 5 is not on screen on a round whose writes succeed');
    if (resolve.failureElement) failures.push('CONTROL: a good round shows failure text: ' + JSON.stringify(resolve.failureElement));
    if (resolve.alertFailureMatch) failures.push('CONTROL: a good round alerted a failure: ' + resolve.alertFailureMatch);
    if (resolve.bodyChars < 200) failures.push('CONTROL: the page rendered almost nothing (innerText ' + resolve.bodyChars + ' chars)');

    // ---- THE CLAIM: a refused write must reach the golfer -----------------
    if (!reject.surfaced) {
        failures.push('A REFUSED SCORE IS SILENT: no element, no alert and no pill state '
            + 'tells the golfer the write was rejected');
    }
    if (reject.pill.present && reject.pill.hiddenOrIdle) {
        failures.push('THE PILL REPORTS ALL SAVED AFTER A REFUSAL: display="'
            + reject.pill.display + '" text="' + reject.pill.text + '"');
    }
    if (!reject.pill.present) notes.push('pwa-boot.js never injected #golfnet-status; the pill half of the claim could not be judged');

    // Two surfaces were built, so two surfaces are checked. Without this the tool
    // would report PASS on the pill alone and say nothing about whether the
    // save-state line the golfer is actually looking at ever rendered.
    if (!reject.saveState.present) {
        failures.push('#save-state is not in the page at all');
    } else if (!FAIL_RE.test(reject.saveState.text)) {
        failures.push('#save-state did not report the refusal: class="'
            + reject.saveState.cls + '" text="' + reject.saveState.text + '"');
    }
    if (resolve.saveState.present && /could not save/i.test(resolve.saveState.text)) {
        failures.push('CONTROL: #save-state reports a failure on a round whose writes succeeded');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, notes, reject, resolve }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2));
    process.exit(2);
});
