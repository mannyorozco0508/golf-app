#!/usr/bin/env node
// ============================================================================
// THE ONLINE SEARCH MUST BE A TAP, AND A REFUSAL MUST NEVER OFFER A DUPLICATE.
//
// course_import_test.js calls the builders. It proves the RULES - that four
// identically named courses get four keys, that no message says "no courses
// found", that the record is the shape we agreed. It cannot prove any of what
// this file measures, because none of it is a function call:
//
//   that typing does not fire the search. admin.html calls
//   populateCourseDropdown on EVERY keystroke. Seventeen letters of "Legacy Golf
//   Club" wired to /api/ would be seventeen of the thirty-five daily requests
//   for one word. The row must be the only trigger.
//
//   that nothing auto-selects. One result that is the wrong Legacy is exactly
//   the failure being designed against, and a picker that helpfully selects it
//   is how a golfer confirms without reading.
//
//   that the Add-as-a-new-course row appears in exactly one state. It creates
//   nothing by itself - addCustomCourse only opens the grid - but it is the
//   path to a permanent key, and offering it before we have established the
//   course is absent is how a duplicate gets made. It belongs after a REAL zero
//   result, and demoted on a refusal.
//
//   that a refusal between search and detail writes NOTHING. The golfer has
//   picked a real course; we have its name and city and not its card. Half a
//   record in global_courses cannot be deleted by any client.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not populateCourseDropdown, not
// importedCourseKey. The search box is typed into with real input events and the
// rows are read off the rendered dropdown, which is how a golfer meets all of it.
//
//   node tools/course-import-check.js
//
//   exit 0   typing costs nothing, nothing auto-selects, the add row appears in
//            one state only, and a mid-import refusal writes nothing
//   exit 1   any of those is false
//   exit 2   could not run, or the import UI is not built yet. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'IMPCHK';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const db = {
    events: { [CODE]: {
        eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
        activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
        players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }],
        settlementMode: 'whole-dollar'
    } },
    global_courses: { caledonia: { name: 'Caledonia Golf & Fish Club', data: CD } },
    trips: {}, tournaments: {}
};

// The provider's real answer for a one-result search, and for a genuine zero.
const ONE_RESULT = { status: 'ok', courses: [
    { id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
      location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix',
                  state: 'AZ', country: 'United States' },
      tees: { female: 3, male: 5 } } ] };
const ZERO_RESULT = { status: 'ok', courses: [] };

// A real detail body, shaped as the provider returns one: tees grouped by
// gender, each an ARRAY of objects carrying their own rating, slope and holes.
const SI = [10, 6, 16, 12, 14, 2, 18, 8, 4, 9, 11, 3, 15, 1, 13, 17, 5, 7];
const PAR = [4, 4, 4, 3, 4, 5, 3, 5, 4, 4, 3, 4, 4, 5, 3, 4, 3, 5];
const FULL_DETAIL = {
    id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
    location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix',
                state: 'AZ', country: 'United States' },
    tees: { male: [{ tee_name: 'Copper', course_rating: 72.1, slope_rating: 128,
                     total_yards: 6768, par_total: 71,
                     holes: PAR.map((p, i) => ({ par: p, yardage: 400, handicap: SI[i] })) }],
            female: [{ tee_name: 'Purple', course_rating: 70.5, slope_rating: 118,
                       total_yards: 5402, par_total: 71,
                       holes: PAR.map((p, i) => ({ par: p, yardage: 320, handicap: SI[i] })) }] }
};

// mode: what /api/ answers. typed: what goes in the box. tap: whether the
// online row is pressed at all.
function preScript(opts) {
    const o = opts || {};
    return `
    (function () {
      window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.__apiCalls = [];
      window.__writes = [];

      // EVERY /api/ REQUEST IS RECORDED. This is the whole instrument for
      // "typing must not fire the search": the count is the assertion.
      var realFetch = window.fetch;
      window.fetch = function (url) {
        var u = String(url);
        if (u.indexOf('/api/') > -1) {
          window.__apiCalls.push(u);
          var body = u.indexOf('/api/course/') > -1
            ? ${JSON.stringify(o.detail || { status: 'ok', course: {} })}
            : ${JSON.stringify(o.search || ONE_RESULT)};
          return Promise.resolve(new Response(JSON.stringify(body),
            { status: body.status === 'ok' ? 200 : 503,
              headers: { 'content-type': 'application/json' } }));
        }
        return realFetch.apply(window, arguments);
      };

      // Any write to global_courses is recorded, so "a refusal writes nothing"
      // is measured rather than assumed.
      var origDb = window.firebase.database;
      window.firebase.database = function () {
        var real = origDb();
        return { ref: function (p) {
          var r = real.ref(p);
          ['set', 'update', 'remove'].forEach(function (m) {
            var o2 = r[m];
            r[m] = function (v) {
              if (String(p).indexOf('global_courses/') === 0) {
                window.__writes.push({ path: String(p), method: m,
                                       keys: v ? Object.keys(v).sort() : [] });
              }
              return o2 ? o2.apply(r, arguments) : Promise.resolve();
            };
          });
          return r;
        } };
      };

      window.__trace = [];
      var step = 0, tries = 0;
      var iv = setInterval(function () {
        if (++tries > 260) { window.__trace.push('TIMEOUT at ' + step); clearInterval(iv); return; }
        try {
          var input = document.getElementById('course-search-input');
          var vis = function (el) { return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0)); };
          if (step === 0) {
            if (vis(input)) { window.__trace.push('picker visible'); step = 1; return; }
            for (var b = 7; b >= 2; b--) {
              var back = document.getElementById('wizard-back-' + b);
              if (vis(back) && !back.disabled) { back.click(); return; }
            }
            return;
          }
          if (step === 1) {
            // TYPED ONE CHARACTER AT A TIME, the way a thumb does. A single
            // assignment plus one event would not exercise the per-keystroke
            // handler, which is the thing being measured.
            var text = ${JSON.stringify(o.typed || 'Legacy Golf Resort')};
            input.focus();
            input.dispatchEvent(new Event('focus', { bubbles: true }));
            for (var i = 1; i <= text.length; i++) {
              input.value = text.slice(0, i);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            window.__trace.push('typed ' + text.length + ' characters');
            window.__callsAfterTyping = window.__apiCalls.length;
            step = 2; return;
          }
          if (step === 2) {
            // THE BASELINE, CAPTURED BEFORE ANYTHING IS TAPPED.
            // The wizard arrives on a round that already has a course - this one
            // opens on Caledonia - so the grid is ALREADY full and the hidden
            // select ALREADY set. An earlier version of this check asserted they
            // were zero after tapping and failed against correct code, because
            // it was measuring the round's own starting state as if the online
            // search had caused it. What matters is whether tapping CHANGED
            // them.
            window.__baseHidden = (document.getElementById('course-select') || {}).value || '';
            window.__baseGrid = (function () {
              var n = 0;
              for (var i = 1; i <= 18; i++) {
                var el = document.getElementById('c-par-' + i);
                if (el && String(el.value).trim() !== '') n++;
              }
              return n;
            })();
            window.__basePars = (function () {
              var out = [];
              for (var i = 1; i <= 18; i++) {
                var el = document.getElementById('c-par-' + i);
                out.push(el ? String(el.value) : '');
              }
              return out.join(',');
            })();
            window.__rowsBeforeTap = Array.prototype.slice
              .call(document.querySelectorAll('#course-dropdown .custom-select-option'))
              .map(function (r) { return (r.innerText || r.textContent || '').trim(); });
            if (!${o.tap ? 'true' : 'false'}) { step = 9; clearInterval(iv); return; }
            var online = Array.prototype.slice
              .call(document.querySelectorAll('#course-dropdown .custom-select-option'))
              .filter(function (r) { return /search online/i.test(r.innerText || r.textContent || ''); })[0];
            if (!online) { window.__trace.push('NO ONLINE ROW'); step = 9; clearInterval(iv); return; }
            online.click();
            window.__trace.push('tapped the online row');
            step = 3; return;
          }
          if (step === 3) {
            // TAPPING A RESULT ROW IS A SEPARATE ACT FROM TAPPING "SEARCH
            // ONLINE", and the distinction is the whole of assertion 6. An
            // earlier version of this driver stopped after the search, so
            // "nothing auto-selects" was measured on a dropdown nobody had
            // selected from - true, and proving nothing.
            if (!${o.tapResult ? 'true' : 'false'}) { step = 9; clearInterval(iv); return; }
            var results = Array.prototype.slice
              .call(document.querySelectorAll('#course-dropdown .course-online-result'));
            if (!results.length) { window.__trace.push('NO RESULT ROWS'); step = 9; clearInterval(iv); return; }
            window.__resultRowCount = results.length;
            results[0].click();
            window.__trace.push('tapped result row 1 of ' + results.length);
            step = 4; return;
          }
          if (step === 4) { step = 9; clearInterval(iv); return; }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;
}

const PROBE = `
(() => {
  const rows = Array.prototype.slice.call(
      document.querySelectorAll('#course-dropdown .custom-select-option'))
    .map(r => (r.innerText || r.textContent || '').trim());
  const gridFilled = (function () {
    let n = 0;
    for (let i = 1; i <= 18; i++) {
      const p = document.getElementById('c-par-' + i);
      if (p && String(p.value).trim() !== '') n++;
    }
    return n;
  })();
  return JSON.stringify({
    trace: window.__trace || [],
    apiCalls: window.__apiCalls || [],
    callsAfterTyping: window.__callsAfterTyping,
    rowsBeforeTap: window.__rowsBeforeTap || [],
    rowsNow: rows,
    addRowPresent: rows.some(r => /Add "/.test(r)),
    writes: window.__writes || [],
    resultRowCount: window.__resultRowCount,
    baseHidden: window.__baseHidden,
    baseGrid: window.__baseGrid,
    basePars: window.__basePars,
    parsNow: (function () {
      const out = [];
      for (let i = 1; i <= 18; i++) {
        const el = document.getElementById('c-par-' + i);
        out.push(el ? String(el.value) : '');
      }
      return out.join(',');
    })(),
    confirmPanel: (function () {
      const p = document.getElementById('course-import-confirm');
      return p ? (p.innerText || '').replace(/\\s+/g, ' ').trim() : null;
    })(),
    courseBoxValue: (document.getElementById('course-search-input') || {}).value || '',
    hiddenSelectValue: (document.getElementById('course-select') || {}).value || '',
    gridFilled: gridFilled,
    dropdownText: (function () {
      const d = document.getElementById('course-dropdown');
      return d ? (d.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 400) : '';
    })()
  });
})()`;

async function run(opts) {
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=' + CODE), db,
        preScript: preScript(opts), expression: PROBE, settleMs: 20000 });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const failures = [];
    const observed = {};

    // ---- 3. TYPING MUST NOT FIRE THE SEARCH ----
    const typed = await run({ typed: 'Legacy Golf Resort', tap: false });
    if (!typed.ran) bail('the typing arm did not run: ' + typed.reason);
    observed.typing = { chars: 'Legacy Golf Resort'.length,
                        apiCallsAfterTyping: typed.callsAfterTyping,
                        rows: typed.rowsBeforeTap.slice(0, 6), trace: typed.trace };

    if (!/typed 18 characters/.test((typed.trace || []).join(' '))) {
        bail('the driver never typed into the box, so "typing costs nothing" would be '
           + 'trivially true', { trace: typed.trace });
    }
    if ((typed.callsAfterTyping || 0) !== 0) {
        failures.push('typing 18 characters made ' + typed.callsAfterTyping + ' request(s) to '
            + '/api/. The daily budget is 35 and shared by everyone; one golfer typing a course '
            + 'name would take half of it. The online search must fire only on a tap.');
    }

    // THE GATE: the online row must actually exist, or every assertion below is
    // about a feature that is not built and the check should say so rather than
    // report a pass.
    const hasOnlineRow = (typed.rowsBeforeTap || []).some((r) => /search online/i.test(r));
    if (!hasOnlineRow) {
        bail('no "Search online" row is rendered after typing 18 characters, so the import UI '
           + 'is not built yet. Nothing below can be measured.',
            { rows: typed.rowsBeforeTap.slice(0, 8), dropdown: typed.dropdownText });
    }

    // ---- 6. NOTHING AUTO-SELECTS, EVEN ON ONE RESULT ----
    const one = await run({ typed: 'Legacy Golf Resort', tap: true, search: ONE_RESULT });
    if (!one.ran) bail('the single-result arm did not run: ' + one.reason);
    observed.singleResult = { rows: one.rowsNow.slice(0, 6), hidden: one.hiddenSelectValue,
                              box: one.courseBoxValue, grid: one.gridFilled, writes: one.writes };
    if (one.hiddenSelectValue !== one.baseHidden) {
        failures.push('merely SEARCHING changed the selected course, from '
            + JSON.stringify(one.baseHidden) + ' to ' + JSON.stringify(one.hiddenSelectValue)
            + '. One result that is the wrong Legacy is exactly the failure this is designed '
            + 'against, and a picker that selects it is how a golfer confirms without reading.');
    }
    if (one.parsNow !== one.basePars) {
        failures.push('merely SEARCHING rewrote the grid. Pars went from '
            + JSON.stringify(one.basePars) + ' to ' + JSON.stringify(one.parsNow)
            + ' with nothing confirmed.');
    }
    if (one.writes.length > 0) {
        failures.push('tapping the online row WROTE to global_courses before any confirmation: '
            + JSON.stringify(one.writes) + '. No client can delete that.');
    }

    // ---- 6b. TAPPING A RESULT FILLS THE GRID BUT WRITES NOTHING ----
    const picked = await run({ typed: 'Legacy Golf Resort', tap: true, tapResult: true,
        search: ONE_RESULT, detail: { status: 'ok', course: FULL_DETAIL } });
    if (!picked.ran) bail('the result-tap arm did not run: ' + picked.reason);
    observed.resultTapped = { rows: picked.resultRowCount, grid: picked.gridFilled,
                              writes: picked.writes, panel: (picked.confirmPanel || '').slice(0, 220),
                              hidden: picked.hiddenSelectValue, trace: picked.trace };
    if (!/tapped result row/.test((picked.trace || []).join(' '))) {
        bail('the driver never tapped a result row, so the confirm stage is unmeasured',
            { trace: picked.trace });
    }
    if (picked.writes.length > 0) {
        failures.push('tapping a RESULT row wrote to global_courses before the golfer confirmed '
            + 'anything: ' + JSON.stringify(picked.writes) + '. No client can delete that.');
    }
    // NOT A COUNT - THE CONTENTS. The grid starts full, from the round's own
    // course, so "18 cells are filled" is true before the import and proves
    // nothing. What must be true is that the cells now hold the IMPORTED card.
    const EXPECT_PARS = PAR.join(',');
    if (picked.parsNow !== EXPECT_PARS) {
        failures.push('after picking a course the grid does not hold the imported card. '
            + 'Expected pars ' + EXPECT_PARS + ', got ' + picked.parsNow
            + '. The 36 numbers must be on screen, in the existing grid, BEFORE anything is '
            + 'written - that grid is what validateCourseGrid reads.');
    }
    if (picked.parsNow === picked.basePars) {
        failures.push('the grid is unchanged from the round\'s original course, so the import '
            + 'never populated it');
    }
    if (!picked.confirmPanel) {
        failures.push('no confirmation panel appeared after picking a course');
    } else {
        if (!/Phoenix/.test(picked.confirmPanel)) {
            failures.push('the confirmation panel does not name the CITY. Four courses are '
                + 'called "Legacy Golf Club"; the name alone cannot separate them.');
        }
        if (!/Use .*Phoenix/.test(picked.confirmPanel)) {
            failures.push('the affirmative control does not name the course and the city: '
                + JSON.stringify(picked.confirmPanel.slice(0, 160)));
        }
        if (!/stroke index|came from/i.test(picked.confirmPanel)) {
            failures.push('the panel does not say where the 36 numbers came from. This page '
                + 'records that stamping plausible numbers into a grid is how fiction got '
                + 'saved as fact.');
        }
    }

    // ---- 5. THE ADD ROW APPEARS PLAINLY ONLY ON A REAL ZERO ----
    const zero = await run({ typed: 'Quintaro Golf', tap: true, search: ZERO_RESULT });
    if (!zero.ran) bail('the zero-result arm did not run: ' + zero.reason);
    observed.zeroResult = { rows: zero.rowsNow.slice(0, 6), addRow: zero.addRowPresent };
    if (!zero.addRowPresent) {
        failures.push('a REAL zero result did not offer the Add-as-a-new-course row. This is '
            + 'the one state where it is honest - we asked, and the course is not there - and '
            + 'without it a golfer at an unlisted course cannot proceed.');
    }

    for (const reason of ['daily_limit', 'network', 'upstream_error']) {
        const un = await run({ typed: 'Quintaro Golf', tap: true,
                               search: { status: 'unavailable', reason } });
        if (!un.ran) bail('the ' + reason + ' arm did not run: ' + un.reason);
        observed['unavailable_' + reason] = { rows: un.rowsNow.slice(0, 6),
                                              addRow: un.addRowPresent, text: un.dropdownText };
        // The add row STAYS - removing it strands a golfer at an unmapped course
        // with no signal - but it must say the check did not happen, so it is
        // never presented as "we looked and it is not there".
        if (un.addRowPresent && !/couldn.t check|could not check|without checking/i.test(un.dropdownText)) {
            failures.push('on ' + reason + ' the Add row is offered without saying the online '
                + 'check did not happen. Text was: ' + JSON.stringify(un.dropdownText.slice(0, 160)));
        }
        if (/no courses? found/i.test(un.dropdownText)) {
            failures.push('on ' + reason + ' the dropdown says "no courses found". It means we '
                + 'COULD NOT ASK. That sentence is how the picker told a golfer a course did '
                + 'not exist when it did.');
        }
        if (un.writes.length) {
            failures.push('an unavailable search wrote to global_courses: '
                + JSON.stringify(un.writes));
        }
    }

    // ---- 8. daily_limit BETWEEN SEARCH AND DETAIL WRITES NOTHING ----
    const midway = await run({ typed: 'Legacy Golf Resort', tap: true, tapResult: true,
        search: ONE_RESULT, detail: { status: 'unavailable', reason: 'daily_limit' } });
    if (!midway.ran) bail('the mid-import arm did not run: ' + midway.reason);
    observed.limitMidImport = { writes: midway.writes, grid: midway.gridFilled,
                                box: midway.courseBoxValue, text: midway.dropdownText };
    if (midway.writes.length > 0) {
        failures.push('the daily limit landing between search and detail still wrote to '
            + 'global_courses: ' + JSON.stringify(midway.writes) + '. A half-record cannot be '
            + 'deleted by any client, and the rules would refuse it anyway - which means this '
            + 'is a refused write the golfer is not told about.');
    }
    if (midway.gridFilled !== 0) {
        failures.push('the grid came back with ' + midway.gridFilled + ' cells filled after a '
            + 'refused detail fetch. It must be BLANK - admin.html records that stamping '
            + 'plausible numbers into a grid is how fiction got saved as fact.');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, observed }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
