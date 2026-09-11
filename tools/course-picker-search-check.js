#!/usr/bin/env node
// ============================================================================
// A GOLFER TYPES THE NAME OFF THE SIGN AND THE COURSE IS NOT THERE.
//
// admin.html's picker filters with item.name.toLowerCase().includes(lowerFilter)
// - a substring test on the whole typed string. Measured over all 141 directory
// entries: 59 end in one of Golf Club / Golf Course / Country Club / Golf Links
// / Golf Resort, and for those, 249 of 295 realistic confusions return nothing.
// 123 of 141 entries are findable by their distinctive words and LOST the moment
// a suffix is added.
//
// course_picker_match_test.js proves the RULE against the real directory by
// calling the matcher. It cannot prove the DROPDOWN. A page can hold a correct
// courseNameMatches and still render nothing - the filter could call it and
// throw away the result, the rows could be built from a different list, the
// dropdown could stay hidden. This check types into the real input and counts
// the rows a golfer would see.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not populateCourseDropdown, not
// selectCourse, not courseNameMatches. It focuses the search box and dispatches
// real input events, which is what a thumb does.
//
// THE GATE. Every assertion here is "the dropdown contains a row for X", and all
// of them are trivially FALSE on a page whose picker never opened - which would
// report the defect for the wrong reason. So the check first types a query that
// works today and refuses to grade unless that row appears.
//
//   node tools/course-picker-search-check.js
//
//   exit 0   the sign-name query finds the course, and today's queries still do
//   exit 1   a golfer typing the name off the sign gets nothing
//   exit 2   could not run, or the picker never opened. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// A real directory entry, and the name a golfer would read off the sign. The
// directory says Club; the query says Course.
const TARGET = 'Camas Meadows Golf Club';

// An existing round, because admin.html only shows the wizard for ?game=CODE -
// without it the page stays on the lobby and there is no picker to type into.
const CODE = 'PICKCHK';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const db = {
    events: { [CODE]: {
        eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
        activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
        players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }],
        settlementMode: 'whole-dollar'
    } },
    trips: {}, global_courses: {}, tournaments: {}
};

function preScript(query) {
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.__trace = [];
      var step = 0, tries = 0;
      var iv = setInterval(function () {
        if (++tries > 220) { window.__trace.push('TIMEOUT at ' + step); clearInterval(iv); return; }
        try {
          var input = document.getElementById('course-search-input');
          var visible = function (el) {
            return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
          };
          if (step === 0) {
            // THE PICKER IS ON STEP 1, NOT STEP 2. An earlier version of this
            // driver was copied from the publish check and pressed
            // wizard-next-1, which navigates PAST the course picker. Arriving
            // with ?game=CODE lands on step 7, the organizer's Review, so the
            // way back to the picker is the Back buttons - which is also how a
            // golfer reaches it when correcting a course mid-setup.
            if (visible(input)) { window.__trace.push('picker visible'); step = 1; return; }
            for (var b = 7; b >= 2; b--) {
              var back = document.getElementById('wizard-back-' + b);
              if (visible(back) && !back.disabled) {
                back.click(); window.__trace.push('clicked wizard-back-' + b); return;
              }
            }
            return;
          }
          if (step === 1) {
            input.focus();
            input.dispatchEvent(new Event('focus', { bubbles: true }));
            input.value = ${JSON.stringify(query)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            window.__trace.push('typed ' + JSON.stringify(input.value));
            step = 2; clearInterval(iv);
            return;
          }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;
}

const PROBE = `
(() => {
  const dd = document.getElementById('course-dropdown');
  // innerText, not textContent: the option rows are real elements, and
  // textContent on a container would also pick up anything hidden. A dropdown
  // that never opened has plenty of textContent and no innerText.
  const rows = dd ? Array.prototype.slice.call(dd.querySelectorAll('.custom-select-option')) : [];
  return JSON.stringify({
    trace: window.__trace || [],
    dropdownExists: !!dd,
    dropdownVisible: !!(dd && (dd.offsetParent !== null || dd.getClientRects().length > 0)),
    rowCount: rows.length,
    rowText: rows.map(r => (r.innerText || r.textContent || '').trim()),
    addRowPresent: rows.some(r => /Add "/.test(r.innerText || r.textContent || '')),
    emptyMessage: dd ? ((dd.innerText || '').indexOf('No courses found') > -1) : false
  });
})()`;

async function typeInPicker(query) {
    const r = await arriveCold({
        // CPS_PAGE lets a control point this at a temp copy carrying the union
        // matcher, proving these assertions are satisfiable. Unset in normal use.
        url: fileUrl(process.env.CPS_PAGE || 'admin.html', 'game=' + CODE),
        db, preScript: preScript(query), expression: PROBE, settleMs: 15000
    });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, query, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

// A row "for" a course is one whose text is the course name. The add-as-new row
// says 'Add "..." as a new course' and must never be counted as finding it.
const findsTarget = (res) => (res.rowText || []).some((t) => t === TARGET);

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const failures = [];
    const observed = {};

    // ---- THE GATE: a query that works today must produce the row ----
    const works = await typeInPicker('Camas Meadows');
    if (!works.ran) bail('the picker arm did not run: ' + works.reason);
    observed.worksToday = { rowCount: works.rowCount, rows: works.rowText.slice(0, 6),
                            visible: works.dropdownVisible, trace: works.trace };
    if (!findsTarget(works)) {
        bail('typing "Camas Meadows" - which works today - produced no row for '
           + JSON.stringify(TARGET) + '. The picker did not open or did not render, so every '
           + 'assertion below would report the defect for the wrong reason.',
            { rows: works.rowText.slice(0, 10), trace: works.trace });
    }

    // ---- R1: the name off the sign ----
    const sign = await typeInPicker('Camas Meadows Golf Course');
    if (!sign.ran) bail('the sign-name arm did not run: ' + sign.reason);
    observed.signName = { rowCount: sign.rowCount, rows: sign.rowText.slice(0, 6),
                          addRow: sign.addRowPresent, empty: sign.emptyMessage };
    if (!findsTarget(sign)) {
        failures.push('typing "Camas Meadows Golf Course" does not offer '
            + JSON.stringify(TARGET) + '. The dropdown showed ' + JSON.stringify(sign.rowText)
            + (sign.addRowPresent ? ' plus an "Add as a new course" row, which is worse than '
               + 'nothing: the golfer creates a duplicate of a course the app already has, '
               + 'under a key no client can ever delete.' : '.'));
    }

    // ---- R2: the mid-token fragment that works today must keep working ----
    const frag = await typeInPicker('adows');
    if (!frag.ran) bail('the fragment arm did not run: ' + frag.reason);
    observed.midToken = { rowCount: frag.rowCount, rows: frag.rowText.slice(0, 6) };
    if (!findsTarget(frag)) {
        failures.push('typing "adows" no longer offers ' + JSON.stringify(TARGET)
            + '. This works today, and a token-prefix matcher on its own breaks it - which is '
            + 'why the rule has to be a union rather than a replacement. Rows: '
            + JSON.stringify(frag.rowText.slice(0, 8)));
    }

    // ---- R3: a common word must not blow the list up ----
    // Measured today: "Pine" matches exactly 3 of the 141 directory entries.
    const pine = await typeInPicker('Pine');
    if (!pine.ran) bail('the noise arm did not run: ' + pine.reason);
    const pineCourses = (pine.rowText || []).filter((t) => !/^Add "/.test(t));
    observed.noise = { rowCount: pine.rowCount, courseRows: pineCourses };
    if (pineCourses.length > 3) {
        failures.push('typing "Pine" now offers ' + pineCourses.length + ' courses where today '
            + 'it offers 3: ' + JSON.stringify(pineCourses) + '. The matcher got noisier.');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, observed }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
