#!/usr/bin/env node
// ============================================================================
// A BUTTON THAT LOOKS IDENTICAL WHILE IT IS WORKING.
//
// Issuing a code used to be free - six characters from Math.random - so the
// Game Day tile navigated instantly. It now asks the database whether the code
// it drew is already in use first, because three byte-identical generators were
// handing out codes nobody had checked. That check is a round trip.
//
// On a good connection nobody notices. On course wifi the tile sits there
// looking dead, so the organizer taps it again - and the second tap issues a
// SECOND code and navigates to that one. The first code is abandoned. Harmless
// in itself, but it is a control working invisibly, which is the same class of
// problem as the pill that reported everything saved.
//
// THE STUB HOLDS .once() UNRESOLVED FOR THE WHOLE RUN, and that is the design.
// A fast stub lets the first tap navigate before the second arrives, and then
// the check proves nothing - it would pass on a completely unprotected tile.
// Holding it open also means the page never navigates, so the probe can count
// what was issued without the document being torn down underneath it.
//
// WHAT IS COUNTED IS EXISTENCE READS, not codes. issueUniqueCode reads
// <root>/<code> exactly once per candidate it draws, so on a free database one
// read is one code. That is the closest observable to "a code was issued"
// without calling into the page.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not createRoom, not selectHomeWidget, not
// createTripBlank. The controls are found by their rendered text and clicked,
// twice, the way a thumb does it.
//
// TWO SURFACES, because the last wave gave both of them a round trip:
//   admin.html   the Game Day tile -> createRoom()
//   trip.html    "Skip planning - just create an empty trip" -> createTripBlank()
// trip.html's main "Build Trip" button is NOT checked here: it already sets
// "Building..." and disables itself, and it restores both in its .catch, so it
// was protected before any of this and still is.
//
//   node tools/tile-double-tap-check.js
//
//   exit 0   two taps issue one code, and the control says it is working
//   exit 1   two taps issue two codes, or the control looks idle while busy
//   exit 2   could not run, or the FIRST tap issued nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// The home screen: no ?game=, so admin.html shows the entry tiles.
// trip.html needs no query either - the create form is on arrival.
const SURFACES = [
    {
        name: 'Game Day tile',
        page: 'admin.html',
        query: '',
        // The tile's own rendered text. Matched loosely enough to survive a
        // label edit, tightly enough not to catch another control.
        control: /game\s*day/i,
        root: 'events'
    },
    {
        name: 'Skip planning (empty trip)',
        page: 'trip.html',
        query: '',
        control: /skip planning|create an empty trip/i,
        root: 'trips',
        // createTripBlank refuses without a name - "Give your trip a name first"
        // - so the first tap issued nothing and the gate correctly refused to
        // grade. Filling the field the way an organizer does is the precondition,
        // not a workaround: the check is about tapping twice, not about the
        // name guard, which is already correct.
        prepare: "var n = document.getElementById('trip-name-input'); "
               + "if (n) { n.value = 'Bandon 2026'; "
               + "n.dispatchEvent(new Event('input', { bubbles: true })); }" 
    }
];

const db = { events: {}, trips: {}, global_courses: {} };

function preScript(controlRe, root, prepare) {
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.print = function () {};

      window.__reads = { total: 0, byRoot: {} };
      // HELD OPEN, DELIBERATELY. Every existence read returns a promise that
      // never settles, so the first tap cannot navigate away before the second
      // arrives - and the page stays alive for the probe to read.
      var origDatabase = window.firebase.database;
      window.firebase.database = function () {
        var real = origDatabase();
        return { ref: function (p) {
          var r = real.ref(p);
          var path = String(p);
          var origOnce = r.once;
          r.once = function () {
            var seg = path.split('/')[0];
            // Only code-existence reads are held. A page also reads its own
            // data on arrival, and holding THAT open would stop it rendering
            // the control this check has to press.
            if (path.indexOf('/') > 0 && (seg === 'events' || seg === 'trips')) {
              window.__reads.total++;
              window.__reads.byRoot[seg] = (window.__reads.byRoot[seg] || 0) + 1;
              return new Promise(function () {});
            }
            return origOnce.apply(r, arguments);
          };
          return r;
        } };
      };

      window.__trace = [];
      window.__state = null;
      var tries = 0;
      var iv = setInterval(function () {
        if (++tries > 150) { clearInterval(iv); window.__trace.push('TIMEOUT: control never appeared'); return; }
        var all = Array.prototype.slice.call(document.querySelectorAll('button, a, span, div'));
        var el = all.filter(function (b) {
          return ${controlRe}.test(b.innerText || '') && (b.onclick || b.getAttribute('onclick'));
        })[0];
        if (!el) return;
        clearInterval(iv);

        // Whatever this control requires before it will act at all.
        try { ${prepare || ''} } catch (e) { window.__trace.push('prepare threw: ' + e.message); }

        // FIRST TAP.
        el.click();
        window.__trace.push('tap 1');

        // Read what the control looks like WHILE the first tap is in flight.
        // The read happens on the next turn so a synchronous render can land.
        setTimeout(function () {
          var cs = window.getComputedStyle(el);
          window.__state = {
            text: (el.innerText || '').trim(),
            disabledProp: !!el.disabled,
            disabledAttr: el.hasAttribute('disabled'),
            ariaDisabled: el.getAttribute('aria-disabled'),
            pointerEvents: cs.pointerEvents,
            opacity: cs.opacity,
            className: el.className || ''
          };
          window.__trace.push('read control state');
          // SECOND TAP, after the state read, still with the read held open.
          el.click();
          window.__trace.push('tap 2');
        }, 250);
      }, 60);
    })();`;
}

const PROBE = `
(() => {
  const out = {};
  out.trace = window.__trace || [];
  out.reads = window.__reads;
  out.state = window.__state;
  out.alerts = (window.__alerts || []).slice();
  out.url = document.URL;
  return JSON.stringify(out);
})()`;

async function run(s) {
    const r = await arriveCold({
        url: fileUrl(s.page, s.query), db,
        preScript: preScript(s.control, s.root, s.prepare),
        expression: PROBE, settleMs: 11000
    });
    if (!r.ok) return { ...s, ran: false, reason: r.reason };
    try { return { ...s, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ...s, ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 160) }; }
}

// "Working" can be said several ways. Any of them counts; none of them is
// prescribed, because which one is right is a design decision and this check's
// job is only to insist the control does not look idle.
function looksBusy(st) {
    if (!st) return false;
    return !!(st.disabledProp || st.disabledAttr || st.ariaDisabled === 'true'
        || st.pointerEvents === 'none' || Number(st.opacity) < 0.9
        || /⏳|starting|working|please wait|\.\.\.|…/i.test(st.text));
}

(async () => {
    const results = [];
    for (const s of SURFACES) results.push(await run(s));

    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, results }, null, 2));
        process.exit(2);
    };
    for (const r of results) {
        if (!r.ran) bail(`${r.name} did not run: ${r.reason}`);
        // THE GATE. "Only one code was issued" is trivially true of a control
        // that was never wired to anything. Unless the FIRST tap issued one,
        // this check has measured nothing.
        if (!r.reads || r.reads.total < 1) {
            bail(`${r.name}: the control was pressed and NO code was issued - the first tap `
               + `did nothing, so "only one code" proves nothing. trace=${JSON.stringify(r.trace)}`);
        }
        if (!r.trace.includes('tap 2')) {
            bail(`${r.name}: the second tap never happened, so nothing about double-tapping `
               + `was tested. trace=${JSON.stringify(r.trace)}`);
        }
    }

    const failures = [];
    for (const r of results) {
        const n = r.reads.byRoot[r.root] || 0;
        if (n > 1) {
            failures.push(`${r.name}: TWO TAPS ISSUED ${n} CODES. The second tap ran because the `
                + `control was still live while the first was in flight; the first code is `
                + `abandoned and its round is never created.`);
        }
        if (!looksBusy(r.state)) {
            failures.push(`${r.name}: the control looks IDLE while working - text="${r.state.text}" `
                + `disabled=${r.state.disabledProp}/${r.state.disabledAttr} `
                + `pointerEvents=${r.state.pointerEvents} opacity=${r.state.opacity}. `
                + `A control that is indistinguishable from an untapped one is what makes `
                + `somebody tap it twice.`);
        }
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, results }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2));
    process.exit(2);
});
