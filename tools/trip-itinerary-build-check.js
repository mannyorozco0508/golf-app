#!/usr/bin/env node
// ============================================================================
// THE BUILD BUTTON AND THE PASTED ITINERARY, IN CHROME AT 390x844.
//
// Manny pasted a seven-round Myrtle list, the review read all seven, he tapped
// "Build Trip & All Rounds" and got "Set up at least one day above, or use
// Skip planning below." The itinerary was gone.
//
// This opens trip.html COLD (tools/lib/cold-arrival.js) at iPhone width and
// drives it the way a thumb does: taps Start a New Trip, types the trip name,
// opens the paste card, types the seven lines, taps Read it, taps Use these 7
// rounds, then taps Build. Every step is a real CDP tap or keystroke; the only
// expressions read the DOM or tag an element for a tap, and NOTHING the page
// defines is called - which is the whole point, because what broke was the
// wiring between two things the page does on its own.
//
//   - after Use these 7 rounds: the round planner is visible and holds SEVEN
//     rounds, and the day planner holds seven days
//   - the Build button has a line near it naming the itinerary that is ready
//   - tapping Build does NOT refuse, and specifically never says "at least one
//     day" while an itinerary is loaded
//   - the courses came through: Caledonia and Thistle are selected, Friday is
//     blank, and that blank is deliberate
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

// Seven rounds across Manny's Myrtle week, 12-16 October: two 36-hole days, a
// 27-hole combo with its nines, and a Friday nobody has decided yet. The exact
// text of his paste was not in the report, so this is a list of the same shape:
// seven lines, five dates, all courses already saved, nothing to look up.
const LINES = [
    'Mon 10/12 - Caledonia Golf & Fish Club, Pawleys Island, 8:24 AM',
    'Mon 10/12 - True Blue Golf Club, 1:40 PM',
    'Tue 10/13 - Pine Lakes Country Club, 9:10 AM',
    'Wed 10/14 - Man O\' War Golf Club, 8:00 AM',
    'Wed 10/14 - Prestwick Country Club, 2:00 PM',
    'Thu 10/15 - Thistle Golf Club (NC - 27 Hole) (mackay/cameron), 8:40 AM',
    'Fri 10/16 - Myrtlewood or Pine Lakes (not chosen)'
].join('\n');

const db = { trips: {}, events: {}, global_courses: {}, tournaments: {} };

// Tag an element for a tap by the words on it. querySelectorAll and innerText
// are the DOM's; this calls nothing the page defines.
const tagByText = (tag, re, id) => ({ expression:
    `(function(){var b=Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find(function(x){return ${re}.test(x.innerText||x.textContent||'');});if(!b)return 'no ${id}';b.id=${JSON.stringify(id)};return 'tagged ${id}';})()` });

const PROBE = `(function(){
  var rp = document.getElementById('round-planner-section');
  var courses = Array.from(document.querySelectorAll('input[id^="round-course-"][type="hidden"]')).map(function(e){return e.value;});
  var names = Array.from(document.querySelectorAll('input[id^="round-course-input-"]')).map(function(e){return e.value;});
  var note = document.getElementById('itin-ready-note');
  var btn = document.getElementById('build-trip-btn');
  return JSON.stringify({
    plannerShown: rp ? getComputedStyle(rp).display : 'missing',
    days: document.querySelectorAll('#day-planner .settle-card').length,
    rounds: courses.length,
    courses: courses,
    names: names,
    daysInput: (document.getElementById('trip-days-input')||{}).value,
    readyNote: note ? (note.innerText||'').trim() : null,
    buildText: btn ? (btn.innerText||'').trim() : 'missing',
    note: Array.from(document.querySelectorAll('.ui-note')).map(function(n){return (n.innerText||'').trim();}),
    reviewText: (document.getElementById('itin-review')||{innerText:''}).innerText.trim(),
    url: location.href,
    nines: Array.from(document.querySelectorAll('select[id^="round-frontnine-"], select[id^="round-backnine-"]')).map(function(e){return e.id + '=' + e.value;})
  });
})()`;

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };

    const r = await arriveCold({
        url: fileUrl('trip.html', ''), db, viewport: { width: 390, height: 844 }, settleMs: 3000,
        steps: [
            tagByText('button', '/Start a New Trip/', 'tmp-start'),              // 0
            { tap: '#tmp-start' },                                               // 1
            { tap: '#trip-name-input' },                                         // 2
            { cdp: { method: 'Input.insertText', params: { text: 'Myrtle Beach 2026' } } },  // 3
            // THE ITINERARY CARD SHIPS OPEN since 2026-10-04 (a new trip is name,
            // rounds, golfers, Build) - so tapping its summary CLOSED it, and every
            // tap after that landed on whatever had moved under it. Opened only if
            // it is shut.
            { expression: `(function(){var d=document.getElementById('itin-paste-card'); if(!d) return 'no card'; if(!d.open) d.open = true; return 'itinerary open';})()` },
            { tap: '#itin-paste-box' },                                          // 5
            { cdp: { method: 'Input.insertText', params: { text: LINES } } },    // 6
            { sleep: 150 },
            tagByText('#itin-paste-card button', '/Read it/', 'tmp-read'),       // 8
            { tap: '#tmp-read' },                                                // 9
            { sleep: 250 },
            { expression: PROBE },                                               // 11 - reviewed, card still open
            tagByText('#itin-review button', '/Use these/', 'tmp-use'),          // 12
            { tap: '#tmp-use' },                                                 // 13
            { sleep: 400 },
            { expression: PROBE },                                               // 15 - after apply
            { tap: '#build-trip-btn' },                                          // 16
            { sleep: 1200 },
            { expression: PROBE }                                                // 18 - after Build
        ]
    });

    if (!r.ok) bail(r.reason, r);
    const steps = r.value || [];
    ['tmp-start', 'tmp-read', 'tmp-use'].forEach((id, i) => {
        const at = [0, 8, 12][i];
        if (!/^tagged/.test(String(steps[at]))) bail('could not find the control: ' + steps[at], steps);
    });
    const J = i => { try { return JSON.parse(steps[i]); } catch (e) { return null; } };
    const reviewed = J(11), applied = J(15), built = J(18);
    if (!reviewed || !applied || !built) bail('probe did not parse', steps);

    // ---- THE REVIEW READ ALL SEVEN ----------------------------------------
    // Read while the paste card is still open: innerText is the RENDERED text,
    // and applyItinerary collapses that card, so asking afterwards reads ''.
    if (!/7 rounds/.test(reviewed.reviewText)) failures.push('the review did not say 7 rounds: ' + JSON.stringify(reviewed.reviewText.slice(0, 200)));

    // ---- AND THE PLANNER KEPT THEM ----------------------------------------
    if (applied.rounds !== 7) failures.push('after Use these 7 rounds the planner holds ' + applied.rounds + ' rounds, not 7');
    // FIVE DAYS, SEVEN ROUNDS: 10/12 and 10/14 are 36-hole days, so one day per
    // line would tell a five-day trip it was seven days long.
    if (applied.days !== 5) failures.push('the day planner holds ' + applied.days + ' days, not 5');
    if (applied.daysInput !== '5') failures.push('the How Many Days box reads ' + JSON.stringify(applied.daysInput) + ', not 5');
    if (applied.plannerShown === 'none') failures.push('the round planner is display:none after applying the itinerary');
    const picked = (applied.courses || []).filter(Boolean).length;
    if (picked !== 6) failures.push('courses selected: ' + picked + ' of 7 (Friday is the deliberate blank) - ' + JSON.stringify(applied.courses));
    if (applied.courses[6] !== '') failures.push('Friday came through with a course: ' + JSON.stringify(applied.courses[6]));
    if (!/no online lookups needed/.test(reviewed.reviewText)) failures.push('the review did not say the lookups were free: ' + JSON.stringify(reviewed.reviewText.slice(0, 240)));
    const nines = (applied.nines || []).join(',');
    if (!/round-frontnine-5=mackay/.test(nines) || !/round-backnine-5=cameron/.test(nines)) failures.push("Thistle's nines did not arrive: " + JSON.stringify(applied.nines));
    if (!/Caledonia/.test((applied.names || []).join('|'))) failures.push('Caledonia is not in the planner: ' + JSON.stringify(applied.names));
    if (!/Thistle/.test((applied.names || []).join('|'))) failures.push('Thistle is not in the planner: ' + JSON.stringify(applied.names));

    // ---- THE LINE NEAR THE BUILD BUTTON ------------------------------------
    if (!applied.readyNote) failures.push('no line near the Build button naming the itinerary that is ready');
    else if (!/7 rounds? from your itinerary/i.test(applied.readyNote)) failures.push('the ready line reads ' + JSON.stringify(applied.readyNote));

    // ---- AND BUILD DOES NOT REFUSE ----------------------------------------
    const notes = (built.note || []).join(' | ');
    if (/at least one day/i.test(notes)) failures.push('Build refused with the day message while 7 rounds were loaded: ' + JSON.stringify(notes));
    if (/Set up at least|nothing to build|Give your trip a name|not loaded yet/.test(notes)) failures.push('Build refused: ' + JSON.stringify(notes));
    // IT BUILT: the planner sends the browser to the trip it just wrote, with the
    // organizer token on the URL. Nothing else on this page does that, so the
    // round count on screen afterwards belongs to the NEW page, not the planner.
    if (!/[?&]trip=/.test(built.url || '') || !/[&]organizer=/.test(built.url || '')) failures.push('Build did not reach a trip: ' + JSON.stringify(built.url));

    if (r.dialogs && r.dialogs.length) failures.push('the page raised a native dialog: ' + JSON.stringify(r.dialogs));

    const out = { verdict: failures.length ? 'FAIL' : 'PASS', failures,
        afterApply: applied, afterBuild: { url: built.url, notes: built.note } };
    console.log(JSON.stringify(out, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
