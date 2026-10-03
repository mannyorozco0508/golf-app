#!/usr/bin/env node
// ============================================================================
// A PASTED COURSE NOBODY HAS SAVED, IN CHROME AT 390x844.
//
// Manny's review read "2026-10-14 14:06 - Myrtlewood PineHills - will look up
// online" and "2 online lookups". After Use these 7 rounds, Day 2 PM's course
// was BLANK - "Search / Select Course" - with no message. Nothing had looked
// anything up.
//
// This opens trip.html COLD (tools/lib/cold-arrival.js) with the PROXY REPLACED
// by a preScript that wraps window.fetch, answers /api/course-search and
// /api/course/<id> with canned provider payloads and COUNTS every call. That is
// the data source replaced, not the page: the page calls whatever `fetch` is.
// Every step is a real CDP tap or keystroke, and nothing the page defines is
// invoked.
//
// FOUR ARRIVALS, each with his exact line in it:
//
//   A. "Myrtlewood PineHills" when the saved course IS in the directory as
//      "Myrtlewood - Pine Hills" - one space apart. It must match for free:
//      ZERO api calls, and the round carries pinehills.
//   B. the same line with that course removed from the directory, so it really
//      is unsaved: the search runs, the facility answers with THREE courses,
//      PineHills is picked on the words, the card is fetched, the SAME
//      global_courses/<key> record admin.html writes is written (merge, 18
//      holes, source.siFrom), and the round is filled. 2 calls, not more.
//   C. the provider answers 429 (the day's 35 are gone): the round shows
//      "Needs a course: Myrtlewood PineHills", says why, and offers one tap to
//      search. Never a silent blank.
//   D. a genuinely ambiguous name ("Myrtlewood"): no guess, a pick list, and a
//      tap on PineHills imports that one.
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const LINES = [
    'Mon 10/12 - Caledonia Golf & Fish Club, Pawleys Island, 8:24 AM',
    'Mon 10/12 - True Blue Golf Club, 1:40 PM',
    'Tue 10/13 - Pine Lakes Country Club, 9:10 AM',
    'Wed 10/14 - Man O\' War Golf Club, 8:00 AM',
    'Wed 10/14 - Myrtlewood PineHills, Myrtle Beach, 2:06 PM',
    'Thu 10/15 - Thistle Golf Club (NC - 27 Hole) (mackay/cameron), 8:40 AM',
    'Fri 10/16 - Myrtlewood or Pine Lakes (not chosen)'
].join('\n');

const holes = (si) => si.map((h, i) => ({ par: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5][i], yardage: 380, handicap: h }));
const SI = [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const fam = (id, course) => ({ id: id, club_name: 'Myrtlewood Golf Club', course_name: course,
    location: { city: 'Myrtle Beach', state: 'SC' }, tees: { male: 2, female: 1 } });
const FAMILY = [fam('mw_pine', 'PineHills'), fam('mw_palm', 'Palmetto'), fam('mw_hum', 'Hummingbird')];
const DETAIL = Object.assign({}, fam('mw_pine', 'PineHills'), { tees: {
    male: [{ tee_name: 'Blue', course_rating: 71.2, slope_rating: 128, total_yards: 6600, par_total: 72, holes: holes(SI) }],
    female: [{ tee_name: 'Red', course_rating: 69.0, slope_rating: 118, total_yards: 5200, par_total: 72, holes: holes(SI) }] } });

// mode: 'ok' | 'limit'; `drop` removes a course id from the bundled directory so
// a saved course can be made genuinely unsaved without touching course-data.js.
const pre = (mode, drop) => `
(function () {
  window.__api = []; window.__errs = [];
  window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + String((e.reason && e.reason.message) || e.reason)); });
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    var u = String(url);
    if (u.indexOf('/api/') !== -1) {
      window.__api.push(u);
      var body;
      var mode = ${JSON.stringify(mode)};
      // 'limit-once': the FIRST search is refused, so the round ends up needing a
      // course, and the search a golfer then fires by hand is answered. That is
      // the real sequence - the quota comes back, or the network does.
      if (mode === 'limit' || (mode === 'limit-once' && !window.__firstDone && /course-search/.test(u))) {
        window.__firstDone = true;
        body = { status: 'unavailable', reason: 'daily_limit' };
      }
      else if (/course-search/.test(u)) body = { status: 'ok', courses: ${JSON.stringify(FAMILY)} };
      else body = { status: 'ok', course: ${JSON.stringify(DETAIL)} };
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
    }
    return realFetch.apply(window, arguments);
  };
  // THE DIRECTORY, THINNED. course-data.js has already run by the time an
  // itinerary is pasted, so a course can be taken out of it here to make the
  // "nothing saved matches this" case real.
  var drop = ${JSON.stringify(drop || '')};
  if (drop) {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        // courseDirectory is a top-level const in course-data.js, so it lives in
        // the global LEXICAL scope and is not a property of window. A bare
        // reference resolves; window.courseDirectory is undefined.
        courseDirectory.forEach(function (g) {
          g.items = (g.items || []).filter(function (it) { return it.id !== drop; });
        });
        window.__dropped = drop;
      } catch (e) { window.__dropped = 'FAILED: ' + e.message; }
    });
  }
})();`;

const PROBE = `(function(){
  var courses = Array.from(document.querySelectorAll('input[id^="round-course-"][type="hidden"]')).map(function(e){return e.value;});
  var names = Array.from(document.querySelectorAll('input[id^="round-course-input-"]')).map(function(e){return e.value;});
  var needs = Array.from(document.querySelectorAll('#round-planner [data-role^="needs-course-search-"]')).map(function(b){
    var box = b.parentNode; return (box.innerText||'').replace(/\\s+/g,' ').trim();
  });
  return JSON.stringify({
    rounds: courses.length, courses: courses, names: names, needs: needs,
    api: window.__api || [], dropped: window.__dropped || null, errs: window.__errs || [],
    // THE WRITE IS THE IMPORT: global_courses/<key>, the same node and the same
    // key shape admin.html uses. cold-arrival records every db write.
    courseWrites: (window.__coldWrites || []).filter(function(w){return String(w.path).indexOf('global_courses/') === 0;})
      .map(function(w){return { op: w.op, path: w.path, name: (w.value||{}).name, holes: ((w.value||{}).data||[]).length, si: (((w.value||{}).source)||{}).siFrom };}),
    picks: Array.from(document.querySelectorAll('#round-planner .course-picker-option')).map(function(o){return (o.innerText||'').trim();})
  });
})()`;

const tagByText = (tag, re, id) => ({ expression:
    `(function(){var b=Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find(function(x){return ${re}.test(x.innerText||x.textContent||'');});if(!b)return 'no ${id}';b.id=${JSON.stringify(id)};return 'tagged ${id}';})()` });

const PASTE = [
    tagByText('button', '/Start a New Trip/', 'tmp-start'),
    { tap: '#tmp-start' },
    { tap: '#trip-name-input' },
    { cdp: { method: 'Input.insertText', params: { text: 'Myrtle Beach 2026' } } },
    { tap: '#itin-paste-card summary' },
    { tap: '#itin-paste-box' },
    { cdp: { method: 'Input.insertText', params: { text: LINES } } },
    { sleep: 150 },
    tagByText('#itin-paste-card button', '/Read it/', 'tmp-read'),
    { tap: '#tmp-read' },
    { sleep: 250 },
    { expression: `(function(){var r=document.getElementById('itin-review');return (r.innerText||'').replace(/\\s+/g,' ').trim();})()` },
    tagByText('#itin-review button', '/Use these/', 'tmp-use'),
    { tap: '#tmp-use' },
    { sleep: 1500 }
];

const run = (mode, drop, extra) => arriveCold({
    url: fileUrl('trip.html', ''),
    db: { trips: {}, events: {}, global_courses: {}, tournaments: {} },
    viewport: { width: 390, height: 844 }, settleMs: 3000, preScript: pre(mode, drop),
    steps: PASTE.concat(extra || []).concat([{ expression: PROBE }])
});

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const last = (r) => { try { return JSON.parse(r.value[r.value.length - 1]); } catch (e) { return null; } };
    const reviewOf = (r) => String(r.value[11] || '');

    // ---- A. THE SAVED COURSE, ONE SPACE APART ------------------------------
    const a = await run('ok', '');
    if (!a.ok) bail(a.reason, a);
    const A = last(a);
    if (!A) bail('probe A did not parse', a.value);
    if (A.rounds !== 7) failures.push('A: ' + A.rounds + ' rounds, not 7');
    if (A.courses[4] !== 'pinehills') failures.push('A: "Myrtlewood PineHills" did not match the saved course: ' + JSON.stringify(A.courses));
    if (A.api.length !== 0) failures.push('A: a saved course spent ' + A.api.length + ' api calls: ' + JSON.stringify(A.api));
    if (!/no online lookups needed/.test(reviewOf(a))) failures.push('A: the review still promised lookups: ' + JSON.stringify(reviewOf(a).slice(0, 200)));
    if (A.needs.length) failures.push('A: a round says it needs a course when one was saved: ' + JSON.stringify(A.needs));

    // ---- B. GENUINELY UNSAVED: IT LOOKS IT UP AND FILLS THE ROUND ----------
    const b = await run('ok', 'pinehills');
    if (!b.ok) bail(b.reason, b);
    const B = last(b);
    if (!B) bail('probe B did not parse', b.value);
    if (!/2 online lookups/.test(reviewOf(b))) failures.push('B: the review did not price the lookup: ' + JSON.stringify(reviewOf(b).slice(0, 200)));
    if (B.courses[4] !== 'gca_mw_pine') failures.push('B: the round was not filled from the lookup: ' + JSON.stringify(B.courses));
    if (!/PineHills/.test(String(B.names[4]))) failures.push('B: the box does not name the imported course: ' + JSON.stringify(B.names[4]));
    if (B.api.length !== 2) failures.push('B: spent ' + B.api.length + ' api calls, not 2: ' + JSON.stringify(B.api));
    if (!/course-search\?q=Myrtlewood/.test(B.api[0] || '')) failures.push('B: the search did not ask for the pasted name: ' + JSON.stringify(B.api[0]));
    if (!/\/api\/course\/mw_pine/.test(B.api[1] || '')) failures.push('B: the detail call was for the wrong course: ' + JSON.stringify(B.api[1]));
    if (B.needs.length) failures.push('B: still asking for a course after a successful import: ' + JSON.stringify(B.needs));
    const w = (B.courseWrites || [])[0];
    if (!w) failures.push('B: nothing was written to the shared course list: ' + JSON.stringify(B.courseWrites));
    else {
        if (w.path !== 'global_courses/gca_mw_pine') failures.push('B: the import landed on ' + w.path);
        if (w.op !== 'update') failures.push('B: the import used ' + w.op + ', not the merge admin.html uses');
        if (w.holes !== 18) failures.push('B: the record carries ' + w.holes + ' holes');
        if (w.si !== 'male/Blue') failures.push('B: source.siFrom is ' + JSON.stringify(w.si));
        if (!/PineHills/.test(String(w.name))) failures.push('B: the record name is ' + JSON.stringify(w.name));
    }
    if (B.dropped !== 'pinehills') failures.push('B: the harness could not unsave the course (' + JSON.stringify(B.dropped) + ') - this arm proved nothing');

    // ---- C. THE DAY'S 35 ARE GONE -----------------------------------------
    const c = await run('limit', 'pinehills');
    if (!c.ok) bail(c.reason, c);
    const C = last(c);
    if (!C) bail('probe C did not parse', c.value);
    if (C.courses[4] !== '') failures.push('C: a course was filled in from a refused lookup: ' + JSON.stringify(C.courses));
    const needC = (C.needs || []).join(' | ');
    if (!/Needs a course: Myrtlewood PineHills/.test(needC)) failures.push('C: no "Needs a course" line: ' + JSON.stringify(needC));
    if (!/Tap to search/.test(needC)) failures.push('C: no tap-to-search offer: ' + JSON.stringify(needC));
    if (!/resting for today|limit/i.test(needC)) failures.push('C: the line does not say why: ' + JSON.stringify(needC));
    if (String(C.names[4]) !== 'Myrtlewood PineHills') failures.push('C: the search box is not pre-filled with the pasted name: ' + JSON.stringify(C.names[4]));
    if (C.rounds !== 7) failures.push('C: ' + C.rounds + ' rounds, not 7 - a failed lookup must not cost a round');
    if ((C.courseWrites || []).length) failures.push('C: a refused lookup still wrote a course record: ' + JSON.stringify(C.courseWrites));

    // ---- D. AMBIGUOUS: A PICK LIST, THEN A TAP -----------------------------
    const d = await run('limit-once', 'pinehills', [
        // The first lookup was refused, so this round is sitting on "Needs a
        // course" with its box pre-filled. Retyping the box to the bare facility
        // name and tapping its own search is the ambiguous case.
        { expression: `(function(){var e=document.getElementById('round-course-input-4'); if(!e) return 'no box'; e.value='Myrtlewood'; return 'retyped';})()` },
        tagByText('#round-planner button', '/Tap to search/', 'tmp-again'),
        { tap: '#tmp-again' },
        { sleep: 1800 },
        { expression: PROBE },
        tagByText('#round-planner .course-picker-option', '/PineHills/', 'tmp-pick'),
        { tap: '#tmp-pick' },
        { sleep: 1800 }
    ]);
    if (!d.ok) bail(d.reason, d);
    const D = last(d);
    const atPick = (() => { try { return JSON.parse(d.value[19]); } catch (e) { return null; } })();
    if (!D || !atPick) bail('probe D did not parse', d.value);
    const ambig = (atPick.needs || []).join(' | ');
    if (!/More than one course matched/.test(ambig)) failures.push('D: an ambiguous name was not asked about: ' + JSON.stringify(ambig));
    if (!(atPick.picks || []).some(p => /PineHills/.test(p))) failures.push('D: no pick list: ' + JSON.stringify(atPick.picks));
    if (!(atPick.picks || []).some(p => /Palmetto/.test(p))) failures.push('D: the pick list is missing the other courses: ' + JSON.stringify(atPick.picks));
    if (D.courses[4] !== 'gca_mw_pine') failures.push('D: tapping PineHills did not fill the round: ' + JSON.stringify(D.courses));

    [['A', a], ['B', b], ['C', c], ['D', d]].forEach(([n, r]) => {
        if (r.dialogs && r.dialogs.length) failures.push(n + ': native dialog ' + JSON.stringify(r.dialogs));
    });

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        A: { courses: A.courses, api: A.api }, B: { courses: B.courses, api: B.api, name: B.names[4] },
        C: { needs: C.needs, box: C.names[4] },
        D: { picks: atPick.picks, courses: D.courses, api: D.api, errs: D.errs, needsAtPick: atPick.needs } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
