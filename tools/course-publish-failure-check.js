#!/usr/bin/env node
// ============================================================================
// A COURSE PUBLISH THE SERVER REFUSED, AND AN ORGANIZER WHO IS TOLD NOTHING.
//
// admin.html:5030 publishes the edited card to the shared course database:
//
//     if (preview.isEditing) {
//         db.ref(`global_courses/${courseKey}`).set({ name, data });
//     }
//
// A BARE .set(). No .catch, nothing observing the promise. Since 2026-09-09 the
// deployed Tier-B rules refuse a malformed card, so that write can now be
// refused for real - and when it is, the round saves normally, the organizer is
// handed Round Ready, and NOTHING says the shared list did not update. The next
// group to pick that course silently gets the old card.
//
// THE ROUND MUST NEVER BE BLOCKED BY THIS. finalCourseData comes from
// preview.data locally, so a refused publish costs the shared database an update
// and costs this round nothing. That is why the check asserts Round Ready is
// ON SCREEN in the failing arm: a "fix" that blocked the round would be worse
// than the silence it replaced.
//
// THE STUB IS PATH-SELECTIVE, and that is what makes this check mean anything:
//     writes to global_courses/*  ->  reject (PERMISSION_DENIED shape)
//     writes to events/*          ->  resolve
// A stub that rejected everything would fail the round save, Round Ready would
// never appear, and the check would be measuring the wrong failure.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not saveSettings, not previewCourseData,
// not renderRoundReady. The wizard is driven the way an organizer drives it:
// tick the custom-course box, type into the 18 par and 18 handicap cells, press
// Next through the steps, press Save & Start Round. Real events on real
// elements.
//
// THE ANTI-TAUTOLOGY GATE IS SHARPER HERE THAN FOR SCORES. The publish is gated
// on preview.isEditing - the custom-course checkbox. If the check fails to tick
// it, NO publish is attempted, nothing is refused, and "no failure shown" is
// trivially true. A green run would prove nothing. So the probe counts writes at
// the stub boundary and REFUSES TO GRADE unless the publish was actually
// attempted and actually refused, and the round actually saved.
//
//   node tools/course-publish-failure-check.js
//
//   exit 0   a refused publish is visible, and a good round stays clean
//   exit 1   a refused publish is silent, or the control round is broken
//   exit 2   could not run, or the failure was never induced. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'PUBCHK';

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// An existing round, so the wizard opens on a course the organizer already
// picked and the check does not have to drive the custom course dropdown.
// activeCourseKey is what admin.html publishes under.
const db = { events: { [CODE]: {
    eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
    activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
    players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }],
    settlementMode: 'whole-dollar'
} }, global_courses: { caledonia: { name: 'Caledonia Golf & Fish Club', data: CD } } };

// A VALID card. validateCourseGrid() refuses par outside 3-6 and any hcpIndex
// that is not a clean permutation of 1-18, and it refuses BEFORE Firebase is
// ever asked - so an invalid card here would never reach the rule under test.
const PARS = [4, 5, 3, 4, 4, 3, 4, 5, 3, 5, 3, 4, 4, 4, 4, 4, 3, 4];
const HCPS = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];

function preScript(mode) {
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.print = function () {};

      window.__w = { courseAttempt: 0, courseReject: 0, eventAttempt: 0, eventResolve: 0, paths: [] };
      window.__unhandled = [];
      window.addEventListener('unhandledrejection', function (e) {
        window.__unhandled.push(String((e && e.reason && e.reason.message) || e.reason || '?'));
      });

      var origDatabase = window.firebase.database;
      window.firebase.database = function () {
        var real = origDatabase();
        return { ref: function (p) {
          var r = real.ref(p);
          var path = String(p);
          var isCourse = path.indexOf('global_courses/') === 0;
          ['set', 'update', 'remove'].forEach(function (m) {
            var orig = r[m];
            r[m] = function () {
              if (window.__w.paths.length < 20) window.__w.paths.push(path + ' .' + m + '()');
              if (isCourse) {
                window.__w.courseAttempt++;
                if (${mode === 'reject'}) {
                  window.__w.courseReject++;
                  var e = new Error('PERMISSION_DENIED: Permission denied');
                  e.code = 'PERMISSION_DENIED';
                  return Promise.reject(e);
                }
                return Promise.resolve();
              }
              // events/* and everything else RESOLVE, so the round saves and
              // Round Ready actually appears. Otherwise this check would be
              // measuring a failed round save, not a failed publish.
              window.__w.eventAttempt++;
              var p2 = Promise.resolve(orig ? orig.apply(r, arguments) : undefined);
              p2.then(function () { window.__w.eventResolve++; });
              return p2;
            };
          });
          return r;
        } };
      };

      // ---- drive the wizard the way an organizer does ----------------------
      // Every action below is a real event on a real element. If any step
      // cannot be reached the trace records where it stopped, so "the app has
      // no message" and "the check never got there" stay distinguishable.
      window.__trace = [];
      var step = 0;
      var tries = 0;
      var iv = setInterval(function () {
        if (++tries > 300) { window.__trace.push('TIMEOUT at phase ' + step); clearInterval(iv); return; }
        try {
          if (step === 0) {
            var box = document.getElementById('enable-custom-course');
            if (!box || box.offsetParent === null && box.getClientRects().length === 0) {
              // still on an earlier step; press Next until step 2 is showing
              var n1 = document.getElementById('wizard-next-1');
              if (n1 && !n1.disabled) { n1.click(); window.__trace.push('clicked wizard-next-1'); }
              return;
            }
            if (!box.checked) {
              box.checked = true;
              box.dispatchEvent(new Event('change', { bubbles: true }));
              window.__trace.push('ticked enable-custom-course');
            }
            step = 1; return;
          }
          if (step === 1) {
            var filled = 0;
            for (var i = 1; i <= 18; i++) {
              var pe = document.getElementById('c-par-' + i);
              var he = document.getElementById('c-hcp-' + i);
              if (!pe || !he) return;
              pe.value = String(${JSON.stringify(PARS)}[i - 1]);
              pe.dispatchEvent(new Event('input', { bubbles: true }));
              he.value = String(${JSON.stringify(HCPS)}[i - 1]);
              he.dispatchEvent(new Event('input', { bubbles: true }));
              filled++;
            }
            window.__trace.push('filled ' + filled + ' par/hcp pairs');
            step = 2; return;
          }
          if (step >= 2 && step <= 7) {
            var btn = document.getElementById('wizard-next-' + step);
            if (btn && btn.offsetParent !== null && !btn.disabled) {
              btn.click();
              window.__trace.push('clicked wizard-next-' + step);
            }
            step++; return;
          }
          if (step === 8) {
            var save = document.getElementById('main-save-btn');
            if (save && !save.disabled) {
              save.click();
              window.__trace.push('clicked main-save-btn');
              step = 9;
              clearInterval(iv);   // terminal: nothing left to drive
            }
            return;
          }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;
}

// The two facts the Round Ready note must carry, asserted SEPARATELY so a note
// that only reassures, or only warns, fails.
// Phrases ONLY the note can produce. "round is ready" was in this alternation
// and had to go: the screen's own title is "Round Ready", so a near-miss in
// future copy could satisfy the reassurance assertion without any note at all.
const ROUND_IS_FINE = /(not affected|card you entered)/i;
const LIST_NOT_UPDATED = /(shared course list|did not update|won.?t get your version)/i;

const PROBE = `
(() => {
  const out = {};
  const clean = s => String(s || '').replace(/\\s+/g, ' ').trim();
  out.trace = window.__trace || [];
  out.alerts = (window.__alerts || []).slice();
  out.writes = window.__w;
  out.unhandled = (window.__unhandled || []).slice();

  const rr = document.getElementById('round-ready-screen');
  out.roundReadyShown = !!(rr && rr.style.display === 'block');
  out.roundReadyText = rr ? clean(rr.innerText) : '';

  const pill = document.getElementById('golfnet-status');
  out.pill = pill
    ? { present: true, display: (pill.style && pill.style.display) || '',
        text: clean(pill.innerText),
        hiddenOrIdle: ((pill.style && pill.style.display) === 'none') || clean(pill.innerText) === '' }
    : { present: false, hiddenOrIdle: true };

  // Scoped to the Round Ready card, not the body: "not anywhere on this screen"
  // is the claim, and body-wide text would drag in the wizard behind it.
  out.saysRoundIsFine = ${ROUND_IS_FINE}.test(out.roundReadyText);
  out.saysListNotUpdated = ${LIST_NOT_UPDATED}.test(out.roundReadyText);
  return JSON.stringify(out);
})()`;

async function arm(mode) {
    const r = await arriveCold({
        url: fileUrl('admin.html', 'game=' + CODE),
        db,
        preScript: preScript(mode),
        expression: PROBE,
        settleMs: 22000
    });
    if (!r.ok) return { mode, ran: false, reason: r.reason };
    try { return { mode, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { mode, ran: false, reason: 'probe returned non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const reject = await arm('reject');
    const resolve = await arm('resolve');
    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, reject, resolve }, null, 2));
        process.exit(2);
    };

    for (const r of [reject, resolve]) {
        if (!r.ran) bail(`the ${r.mode} arm did not run: ${r.reason}`);
        // THE GATE. The publish only fires when the custom-course box is ticked.
        // Without these, a check that never reached the wizard would report a
        // clean PASS and prove nothing at all.
        if (!r.writes || r.writes.courseAttempt < 1) {
            bail(`the ${r.mode} arm attempted NO global_courses write - the publish `
               + `never fired, so nothing about publish failure was exercised. trace: `
               + JSON.stringify(r.trace));
        }
        if (r.writes.eventAttempt < 1) {
            bail(`the ${r.mode} arm never wrote the round itself, so Round Ready `
               + `cannot be reached for the right reason. trace: ` + JSON.stringify(r.trace));
        }
        if (!r.roundReadyShown) {
            bail(`the ${r.mode} arm never reached Round Ready. trace: ` + JSON.stringify(r.trace));
        }
    }
    if (reject.writes.courseReject < 1) bail('the reject arm refused no publish - the failure was never induced');
    if (resolve.writes.courseReject > 0) bail('the control arm refused a publish; it is not a clean control');

    const failures = [];

    // CONTROL: a good round must be clean, or "no warning" is trivially true.
    if (resolve.saysListNotUpdated) failures.push('CONTROL: a successful publish still warns the shared list did not update');
    if (resolve.roundReadyText.length < 40) failures.push('CONTROL: Round Ready rendered almost nothing');
    if (resolve.pill.present && !resolve.pill.hiddenOrIdle) {
        failures.push('CONTROL: the pill is showing a failure on a round where nothing failed: "' + resolve.pill.text + '"');
    }

    // THE CLAIM. Both facts, separately - a note that only reassures is as wrong
    // as one that only warns.
    if (!reject.saysListNotUpdated) {
        failures.push('SILENT: Round Ready never says the shared course list did not update. text="'
            + reject.roundReadyText.slice(0, 200) + '"');
    }
    if (!reject.saysRoundIsFine) {
        failures.push('Round Ready warns without reassuring: it must say the round itself is unaffected, '
            + 'or the organizer reads it as the round having failed');
    }
    if (reject.pill.present && reject.pill.hiddenOrIdle) {
        failures.push('THE PILL REPORTS ALL SAVED AFTER A REFUSED PUBLISH: display="'
            + reject.pill.display + '" text="' + reject.pill.text + '"');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, reject, resolve }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2));
    process.exit(2);
});
