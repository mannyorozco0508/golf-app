#!/usr/bin/env node
// ============================================================================
// ONLINE COURSE SEARCH ON tournament.html, IN CHROME: the row has a rect, a
// tap spends one request, the card is on the panel, the chooser moves it, the
// record carries it, and nothing touches global_courses.
//
// tournament_course_search_test.js drives the rules in mini-dom. This check
// opens tournament.html COLD (tools/lib/cold-arrival.js) on the setup screen
// as a signed-in organizer, with the proxy REPLACED: a preScript wraps
// window.fetch so /api/course-search and /api/course/<id> answer canned
// provider payloads and every call is counted. That is the data source
// replaced, not the page - the page calls whatever `fetch` is. Every step is
// a real CDP tap or keystroke (the { tap } step reads the rect at tap time);
// nothing the page defines is invoked.
//
//   - types "talking" -> the online row is the LAST row and has a rect; the
//     keystrokes made 0 requests
//   - taps the row -> exactly 1 request, for q=talking; the result row shows
//     "Scottsdale, AZ · 3 tee sets"; nothing is selected
//   - taps the result -> the detail request; the confirm panel has a rect,
//     holds a card table of 18 holes, three tee chips (Blue active), the
//     source sentence, the button "Use Talking Stick Piipaash — Scottsdale, AZ"
//   - taps White -> the table's hole-1 SI changes 7 -> 13; taps Blue back
//   - taps the button -> #course-key = gca_a1b2c3d4, the box shows the name,
//     the panel is gone
//   - fills a team and taps Save -> the creating set() carries the card
//     (18 holes, hole 1 SI 7), importedCourses/gca_a1b2c3d4 with siFrom
//     male/Blue, courseIndexSynthetic false; NO global_courses write
//   - second arrival: a directory course with no card (Mint Valley) is tapped
//     -> not selected, "No card for Mint Valley Golf Course yet.", the fetch
//     row offers the NAME
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const holes = (order) => order.map((si, i) => ({ par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5][i], yardage: 380, handicap: si }));
const SI_BLUE = [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const SI_WHITE = [13, 7, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const STICK = { id: 'a1b2c3d4', club_name: 'Talking Stick Golf Club', course_name: 'Talking Stick Piipaash',
    location: { city: 'Scottsdale', state: 'AZ', address: '9998 E Indian Bend Rd, Scottsdale, AZ 85256' }, tees: { male: 2, female: 1 } };
const STICK_DETAIL = Object.assign({}, STICK, { tees: {
    male: [{ tee_name: 'White', course_rating: 70.1, slope_rating: 125, total_yards: 6300, par_total: 72, holes: holes(SI_WHITE) },
           { tee_name: 'Blue', course_rating: 72.4, slope_rating: 131, total_yards: 6800, par_total: 72, holes: holes(SI_BLUE) }],
    female: [{ tee_name: 'Red', course_rating: 69.0, slope_rating: 118, total_yards: 5400, par_total: 72, holes: holes(SI_BLUE) }] } });
const db = { tournaments: {}, registrations: {}, events: {}, trips: {}, global_courses: {} };

// The proxy, replaced, and every db write recorded.
const PRE = `
(function () {
  window.__api = []; window.__writes = []; window.__alerts = [];
  // A native alert() blocks every CDP input after it; recorded instead, and
  // any alert the page raises is a failure the probe reports.
  window.alert = function (m) { window.__alerts.push(String(m)); };
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    var u = String(url);
    if (/^\\/api\\//.test(u)) {
      window.__api.push(u);
      var body = /course-search/.test(u) ? { status: 'ok', courses: [${JSON.stringify(STICK)}] } : { status: 'ok', course: ${JSON.stringify(STICK_DETAIL)} };
      // Answered on a LATER TASK, as a network answer always is. Resolving
      // synchronously ran the outcome render inside the tap's own event
      // dispatch (microtasks run between listeners), so the page's document
      // click handler saw a detached target and closed the dropdown - a race
      // no real fetch can produce.
      return new Promise(function (res) { setTimeout(function () { res({ ok: true, json: function () { return Promise.resolve(body); } }); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  var database = window.firebase.database;
  window.firebase.database = function () {
    var real = database.apply(this, arguments); var ref = real.ref;
    real.ref = function (p) {
      var r = ref.call(this, p); var set = r.set, update = r.update;
      // The creating set() is recorded and then HELD: on success the page
      // navigates to the new event and the record of the write would go with
      // it. A promise that never settles keeps the setup screen on screen.
      r.set = function (v) { window.__writes.push({ op: 'set', path: String(p), value: JSON.parse(JSON.stringify(v)) }); if (/^tournaments\\/[A-Z0-9]+$/.test(String(p))) return new Promise(function () {}); return set.call(this, v); };
      r.update = function (v) { window.__writes.push({ op: 'update', path: String(p), value: JSON.parse(JSON.stringify(v)) }); return update.call(this, v); };
      return r;
    };
    return real;
  };
})();`;

const PROBE = `(function () {
  var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
  var dd = document.getElementById('course-dropdown'); var rows = dd ? Array.from(dd.children) : [];
  var online = document.getElementById('course-online-search-row');
  var panel = document.getElementById('course-import-confirm');
  var table = document.getElementById('course-import-card');
  var chips = panel ? Array.from(panel.querySelectorAll('.tee-chip')).map(function (c) { return { text: c.innerText.trim(), active: c.classList.contains('active') }; }) : [];
  var btn = document.getElementById('course-import-confirm-btn');
  return JSON.stringify({
    rows: rows.map(function (r) { return r.innerText.replace(/\\s+/g, ' ').trim().slice(0, 70); }),
    onlineRect: R(online), onlineIsLast: !!(online && rows[rows.length - 1] === online), ddDisplay: dd ? getComputedStyle(dd).display : null,
    api: window.__api.slice(), courseKey: (document.getElementById('course-key') || {}).value, box: (document.getElementById('course-search-input') || {}).value,
    panelRect: R(panel), panelText: panel ? panel.innerText.replace(/\\s+/g, ' ').trim().slice(0, 900) : null,
    tableCells: table ? table.querySelectorAll('td').length : 0, hole1SI: table ? (function () { var tds = table.querySelectorAll('tr:nth-child(3) td'); return tds[1] ? tds[1].innerText : null; })() : null,
    chips: chips, btn: btn ? { text: btn.innerText.trim(), disabled: btn.disabled, rect: R(btn) } : null,
    writes: window.__writes.slice(), alerts: window.__alerts.slice()
  });
})()`;

const tapDropdownRow = (re) => ({ expression: `(function(){ var r = Array.from(document.getElementById('course-dropdown').children).find(function (x) { return ${re}.test(x.innerText); }); if (!r) return 'no row'; r.id = r.id || 'tmp-tap-row'; return r.id; })()` });
const FILL_TEAM = { expression: `(function(){ document.getElementById('t-name').value = 'Imported Event'; var card = document.querySelector('#teams-list .team-card'); if (!card) return 'no team card'; var tn = card.querySelector('.team-name-input'); if (tn) tn.value = 'Eagles'; var ins = card.querySelectorAll('.team-name-inputs input'); if (ins[0]) ins[0].value = 'Ann Alpha'; if (ins[1]) ins[1].value = 'Bo Bravo'; var h = card.querySelector('.team-handicap-input'); if (h) h.value = '0'; return 'filled ' + ins.length; })()` };

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const J = (r, i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };

    const t = await arriveCold({ url: fileUrl('tournament.html', ''), db, auth: OWNER, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 5000, steps: [
        { tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'talking' } } }, { sleep: 200 }, { expression: PROBE },   // 0-3 typed
        { tap: '#course-online-search-row' }, { sleep: 400 }, { expression: PROBE },                                                                  // 4-6 searched
        tapDropdownRow('/Talking Stick Piipaash/'), { tap: '#tmp-tap-row' }, { sleep: 400 }, { expression: PROBE },                                    // 7-10 detail + panel
        { tap: '.tee-chip', nth: 1 }, { sleep: 200 }, { expression: PROBE },                                                                            // 11-13 White
        { tap: '.tee-chip', nth: 0 }, { sleep: 200 }, { expression: PROBE },                                                                            // 14-16 Blue
        { tap: '#course-import-confirm-btn' }, { sleep: 200 }, { expression: PROBE },                                                                   // 17-19 confirmed
        FILL_TEAM, { expression: `(function(){ var b = Array.from(document.querySelectorAll('button')).find(function (x) { return /Save Tournament/.test(x.innerText); }); if (!b) return 'no save'; b.id = b.id || 'tmp-save-btn'; return b.id; })()` },
        { tap: '#tmp-save-btn' }, { sleep: 1200 }, { expression: PROBE }                                                                                // 20-24 saved
    ] });
    if (!t.ok) bail(t.reason);
    const missed = t.value.filter(v => typeof v === 'string' && /^no (element|row|save|team)/.test(v));
    if (missed.length) bail('a step found nothing', missed);
    const typed = J(t, 3), searched = J(t, 6), detail = J(t, 10), white = J(t, 13), blue = J(t, 16), confirmed = J(t, 19), saved = J(t, 24);
    if (!typed || !searched || !detail || !confirmed || !saved) bail('a probe did not parse', t.value.map(v => String(v).slice(0, 60)));

    if (!typed.onlineRect || typed.onlineRect.h === 0) failures.push('typed: the online row has no rect');
    if (!typed.onlineIsLast) failures.push('typed: the online row is not the last row: ' + JSON.stringify(typed.rows));
    if (typed.api.length !== 0) failures.push('typed: keystrokes made a request: ' + JSON.stringify(typed.api));
    if (searched.api.length !== 1 || searched.api[0] !== '/api/course-search?q=talking') failures.push('searched: requests ' + JSON.stringify(searched.api));
    if (!searched.rows.some(r => /Talking Stick Piipaash Scottsdale, AZ · 3 tee sets/.test(r))) failures.push('searched: the result row is not on screen: ' + JSON.stringify(searched.rows));
    if (searched.courseKey) failures.push('searched: something auto-selected: ' + searched.courseKey);
    if (detail.api.length !== 2 || detail.api[1] !== '/api/course/a1b2c3d4') failures.push('detail: requests ' + JSON.stringify(detail.api));
    if (!detail.panelRect || detail.panelRect.h === 0) failures.push('detail: the confirm panel has no rect');
    if (detail.tableCells !== 40) failures.push('detail: the card table has ' + detail.tableCells + ' td cells, wanted 40 (18 holes x Par + SI, plus the 4 row labels)');
    if (detail.hole1SI !== '7') failures.push('detail: hole 1 SI is ' + detail.hole1SI + ', wanted 7 (Blue)');
    if (JSON.stringify(detail.chips) !== JSON.stringify([{ text: 'Blue 72.4/131', active: true }, { text: 'White 70.1/125', active: false }, { text: 'Red 69/118', active: false }])) failures.push('detail: chips ' + JSON.stringify(detail.chips));
    if (!/came from this course's Blue tees\. This is the card the event will score on\. It can't be edited on this page/.test(detail.panelText || '')) failures.push('detail: the source sentence: ' + detail.panelText);
    if (!detail.btn || detail.btn.text !== 'Use Talking Stick Piipaash — Scottsdale, AZ' || detail.btn.disabled || detail.btn.rect.h === 0) failures.push('detail: the button: ' + JSON.stringify(detail.btn));
    if (detail.courseKey) failures.push('detail: selected before the button: ' + detail.courseKey);
    if (!white || white.hole1SI !== '13' || !white.chips[1].active) failures.push('white: hole 1 SI ' + (white && white.hole1SI) + ', chips ' + JSON.stringify(white && white.chips));
    if (!blue || blue.hole1SI !== '7' || !blue.chips[0].active) failures.push('blue: hole 1 SI ' + (blue && blue.hole1SI));
    if (confirmed.courseKey !== 'gca_a1b2c3d4') failures.push('confirmed: course-key ' + confirmed.courseKey);
    if (confirmed.box !== 'Talking Stick Piipaash') failures.push('confirmed: the box shows ' + JSON.stringify(confirmed.box));
    if (confirmed.panelRect) failures.push('confirmed: the panel is still there');
    if (confirmed.ddDisplay !== 'none') failures.push('confirmed: the dropdown is still open');
    const set = saved.writes.find(w => w.op === 'set' && /^tournaments\/[A-Z0-9]+$/.test(w.path));
    if (!set) failures.push('saved: no creating set: ' + JSON.stringify(saved.writes.map(w => w.path)));
    else {
        const v = set.value;
        if (v.activeCourseKey !== 'gca_a1b2c3d4' || v.courseName !== 'Talking Stick Piipaash') failures.push('saved: course fields ' + JSON.stringify([v.activeCourseKey, v.courseName]));
        if (!v.courseData || v.courseData.length !== 18 || v.courseData[0].hcpIndex !== 7) failures.push('saved: courseData is not the Blue card');
        if (v.courseIndexSynthetic !== false) failures.push('saved: courseIndexSynthetic ' + v.courseIndexSynthetic);
        const imp = v.importedCourses && v.importedCourses.gca_a1b2c3d4;
        if (!imp || imp.source.siFrom !== 'male/Blue' || imp.data.length !== 18) failures.push('saved: importedCourses ' + JSON.stringify(v.importedCourses));
    }
    if (saved.alerts.length) failures.push('the page raised an alert: ' + JSON.stringify(saved.alerts));
    if (saved.writes.some(w => /global_courses/.test(w.path))) failures.push('saved: A global_courses WRITE FROM tournament.html: ' + JSON.stringify(saved.writes.filter(w => /global_courses/.test(w.path))));

    // ---- A DIRECTORY COURSE WITH NO CARD ------------------------------------------
    const c = await arriveCold({ url: fileUrl('tournament.html', ''), db, auth: OWNER, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 5000, steps: [
        // Mint Valley (swwa_mintvalley) is a directory course with no preset card.
        { tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'mint valley' } } }, { sleep: 200 },
        tapDropdownRow('/^Mint Valley Golf Course$/'), { tap: '#tmp-tap-row' }, { sleep: 300 }, { expression: PROBE }
    ] });
    if (!c.ok) bail(c.reason);
    const cMissed = c.value.filter(v => typeof v === 'string' && /^no (element|row)/.test(v));
    if (cMissed.length) bail('a step found nothing (no-card arm)', cMissed);
    const cam = J(c, 6);
    if (!cam) bail('no-card probe did not parse', c.value);
    if (cam.courseKey) failures.push('no-card: a course with no card was selected: ' + cam.courseKey);
    if (!cam.rows.some(r => /No card for Mint Valley Golf Course yet\./.test(r))) failures.push('no-card: no "No card" note: ' + JSON.stringify(cam.rows));
    if (!cam.onlineRect || cam.onlineRect.h === 0 || !cam.rows.some(r => /Get the card for "Mint Valley Golf Course" online/.test(r))) failures.push('no-card: the fetch row is not offered by name: ' + JSON.stringify(cam.rows));
    if (cam.api.length !== 0) failures.push('no-card: a request was spent without a tap: ' + JSON.stringify(cam.api));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, measured: {
        typed: { onlineRect: typed.onlineRect, rows: typed.rows.length }, searched: { api: searched.api, rows: searched.rows },
        detail: { panelRect: detail.panelRect, chips: detail.chips, hole1SI: detail.hole1SI, btn: detail.btn && detail.btn.text }, white: white && white.hole1SI,
        confirmed: { courseKey: confirmed.courseKey, box: confirmed.box }, saved: set && { path: set.path, activeCourseKey: set.value.activeCourseKey, imported: Object.keys(set.value.importedCourses || {}) },
        noCard: { rows: cam.rows, courseKey: cam.courseKey }
    } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2)); process.exit(2); });
