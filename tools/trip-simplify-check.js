#!/usr/bin/env node
// ============================================================================
// MANNY'S REAL 24-GOLFER PASTE, ON THE TRIP PAGE, IN CHROME AT 390x844.
//
// What he actually saw: "Group 4" / "Group 5" / "Group 6" parsed as golfers so a
// 24-man list reviewed as "30 golfers"; after Yes the Player 1-4 placeholders
// were still on screen; the confirm said "28 placeholders replaced, 147 golfers
// added"; the rounds list opened on Day 2 PM with no date or course on any row;
// and the same "Player N is not a name" paragraph was repeated until the page
// was unreadable.
//
// This opens trip.html COLD (tools/lib/cold-arrival.js) on a real trip - one
// round PLAYED (scores and a $40 side match) and two with four placeholders
// each, dates and tee times on all three - as the organizer, and pastes HIS
// FORMAT: "Group 1" headers, names like "Zack Carrano 6" and "Derrick J
// Doncaster 15", 24 golfers in 6 groups. Every step is a real CDP tap or
// keystroke; the only expressions read the DOM or scroll, and nothing the page
// defines is called.
//
//   BEFORE  the rounds are in date order, each row reading "Mon 10/12 · 8:24 AM
//           · Caledonia Golf & Fish Club", Open on the row and Edit tucked
//           inside; the golfers show as GROUPS; and the placeholder notice is
//           ONE quiet line, not a wall of warnings
//   REVIEW  "24 golfers in 6 groups" with the six groups listed, no "Group" golfer
//           among them, and the played round named as untouched
//   AFTER   the names are ON SCREEN (the bug: the write landed and nothing
//           re-read it), the write covers only the two unplayed rounds, the
//           seats keep their ids, and the confirm counted PEOPLE
//
// Two full-page screenshots are written to ~/Desktop.
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const os = require('os');
const path = require('path');

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const DESK = path.join(os.homedir(), 'Desktop');
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Marty', hcp: '4' }, { id: 102, name: 'Dee', hcp: '9' },
              { id: 103, name: 'Reese', hcp: '0' }, { id: 104, name: 'Jimmy', hcp: '12' }];
const scores = {};
FOUR.forEach((p) => cd18.forEach((h) => { scores['p' + p.id + '_h' + h.hole] = 4; }));
scores.p101_h1 = 3;
const holders = (n) => Array.from({ length: n }, (_, i) => ({
    id: 101 + i, name: 'Player ' + (i + 1), hcp: '', team: 'Team 1', squad: 'red', playingForMoney: true }));
const openRound = (name) => ({ eventName: name, roundDay: name, players: holders(4),
    courseData: cd18, scores: {}, gameFormat: 'stroke', activeCourseKey: 'trueblue',
    courseName: 'True Blue Golf Club', groupSizeOverrides: {} });

const db = {
    trips: { MYRTLE: {
        name: 'Myrtle Beach 2026', createdAt: 1, organizerToken: TOKEN,
        rounds: {
            // Deliberately written OUT of order, with the latest first, because
            // that is what the unsorted list was showing him.
            RD3: { label: 'Day 2 PM', addedAt: 30, date: '2026-10-13', time: '13:40' },
            RD1: { label: 'Day 1 AM', addedAt: 10, date: '2026-10-12', time: '08:24' },
            RD2: { label: 'Day 2 AM', addedAt: 20, date: '2026-10-13', time: '07:50' }
        } } },
    events: {
        RD1: { eventName: 'Day 1 AM', roundDay: 'Day 1 AM', players: FOUR, courseData: cd18,
               scores: scores, gameFormat: 'stroke', activeCourseKey: 'caledonia',
               courseName: 'Caledonia Golf & Fish Club',
               sideMatches: { m1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                                    startHole: 1, stake: 40, pressRule: 'none', createdAt: 1 } } },
        RD2: openRound('Day 2 AM'),
        RD3: openRound('Day 2 PM')
    },
    global_courses: {}, tournaments: {}
};

// HIS FORMAT, including the two things that broke it: "Group N" header lines with
// no blank line between the groups, and a bare tee time under a header.
const PASTE = [
    'Group 1', '8:24 AM', 'Zack Carrano 6', 'Derrick J Doncaster 15', 'Mike Treacy 11', 'Pat Morrissey 8',
    'Group 2', 'Tom Kelly 4', 'Sean Burke 20', 'Jim Walsh 12', 'Ray Fox 9',
    'Group 3', 'Al Grant 7', 'Ed Noone 16', 'Dan Quill 13', 'Joe Hart 5',
    'Group 4', 'Hugh Dolan 18', 'Liam Moran 2', 'Cian Reddy 14', 'Eoin Barry 10',
    'Group 5', 'Noel Hickey 6', 'Fran Deasy 22', 'Barry Tobin 3', 'Ger Lynch 17',
    'Group 6', 'Shay Nolan 1', 'Colm Egan 19', 'Rory Breen 8', 'Dara Mulcahy 24'
].join('\n');

// EVERY WRITE THE PAGE HAS MADE SO FAR, flattened: a root update() is a
// multi-path write whose keys are paths.
const WROTE = `(function(){ var flat = (window.__coldWrites||[]).reduce(function (acc, w) {
    var isRoot = !w.path && w.value && typeof w.value === 'object' && !Array.isArray(w.value);
    if (!isRoot) { acc.push({ path: w.path, value: w.value }); return acc; }
    Object.keys(w.value).forEach(function (k) { acc.push({ path: k, value: w.value[k] }); });
    return acc; }, []);
  return JSON.stringify({ wrote: flat.map(function(w){return w.path;}).slice(0, 12),
    events: flat.filter(function(w){ return /^events\\/[^\\/]+$/.test(String(w.path)); })
      .map(function(w){ return { path: w.path, players: (w.value.players||[]).length,
          first: (w.value.players||[]).slice(0,2).map(function(p){return p.id+':'+p.name+'/'+(p.hcp||'');}),
          groups: w.value.groupSizeOverrides, course: w.value.courseName }; }) });})()`;

// THE WRITES THAT SURVIVED THE NAVIGATION, flattened: a root update() is a
// multi-path write whose keys are paths.
const MIRROR = `(function(){ var kept = [];
  try { kept = JSON.parse(localStorage.getItem('__mirror') || '[]'); } catch (e) { kept = []; }
  var flat = kept.reduce(function (acc, w) {
    var isRoot = !w.path && w.value && typeof w.value === 'object' && !Array.isArray(w.value);
    if (!isRoot) { acc.push({ path: w.path, value: w.value }); return acc; }
    Object.keys(w.value).forEach(function (k) { acc.push({ path: k, value: w.value[k] }); });
    return acc; }, []);
  return JSON.stringify({ wrote: flat.map(function(w){return w.path;}).slice(0, 12),
    url: location.href,
    notes: Array.from(document.querySelectorAll('.ui-note')).map(function(x){return (x.innerText||'').trim();}),
    events: flat.filter(function(w){ return /^events\\/[^\\/]+$/.test(String(w.path)); })
      .map(function(w){ return { path: w.path, players: (w.value.players||[]).length,
          first: (w.value.players||[]).slice(0,2).map(function(p){return p.id+':'+p.name+'/'+(p.hcp||'');}),
          groups: w.value.groupSizeOverrides, course: w.value.courseName }; }) });})()`;

const scrollTo = (sel) => ({ expression:
    `(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'no ' + ${JSON.stringify(sel)};`
    + ` window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 220);`
    + ` return 'scrolled';})()` });

const PROBE = `(function(){
  var rows = Array.from(document.querySelectorAll('#rounds-list .round-card'));
  var roster = document.getElementById('trip-roster');
  var flat = (window.__coldWrites||[]).reduce(function (acc, w) {
    var isRoot = !w.path && w.value && typeof w.value === 'object' && !Array.isArray(w.value);
    if (!isRoot) { acc.push({ op: w.op, path: w.path, value: w.value }); return acc; }
    Object.keys(w.value).forEach(function (k) { acc.push({ op: 'update', path: k, value: w.value[k] }); });
    return acc;
  }, []);
  return JSON.stringify({
    title: (document.getElementById('manage-trip-name')||{innerText:''}).innerText.trim(),
    rows: rows.map(function(c){ var l=c.querySelector('.rc-label'); return (l?l.innerText:'').trim(); }),
    rowOpens: rows.map(function(c){ return !!c.querySelector('a[href^="index.html?game="]'); }),
    rowEditTucked: rows.map(function(c){ var d=c.querySelector('details'); return d ? !d.open : null; }),
    roster: roster ? (roster.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400) : '',
    rosterGroups: roster ? (roster.innerText||'').match(/Group \\d+/g) : null,
    review: (document.getElementById('trip-roster-paste-review')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim(),
    money: (document.getElementById('trip-money-settlement')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim().slice(0,500),
    awards: (document.getElementById('trip-awards')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim().slice(0,400),
    writes: flat.map(function(w){ return { op: w.op, path: w.path,
        names: Array.isArray(w.value) ? w.value.map(function(p){return p.id + ':' + p.name + '/' + (p.hcp||'');}) : w.value };}),
    notes: Array.from(document.querySelectorAll('.ui-note')).map(function(n){return (n.innerText||'').trim();}),
    banner: (document.getElementById('trip-placeholder-warning')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim(),
    pageWarnings: (document.body.innerText.match(/Rename placeholder players|is not a name/g)||[]).length
  });
})()`;

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };

    const r = await arriveCold({
        url: fileUrl('trip.html', 'trip=MYRTLE&organizer=' + TOKEN),
        db, viewport: { width: 390, height: 844 }, settleMs: 5000,
        steps: [
            // THE MONEY AND AWARDS CARDS SHIP COLLAPSED, and innerText of a closed
            // <details> is '' - so they are opened here to be read and
            // photographed. Opening a details is a DOM write, not a page call.
            { expression: `(function(){var n=0; Array.from(document.querySelectorAll('#manage-screen details.trip-section')).forEach(function(d){ if(!d.open){ d.open=true; n++; } }); return 'opened ' + n;})()` },
            { sleep: 400 },
            { expression: PROBE },                                            // arrival
            { shot: path.join(DESK, 'TRIP-BEFORE.png') },
            { expression: `(function(){var s=Array.from(document.querySelectorAll('summary')).find(function(x){return /Golfers/.test(x.innerText||'');}); if(!s) return 'no golfers section'; if(!s.parentElement.open) s.parentElement.open = true; return 'golfers open';})()` },
            { sleep: 300 },
            scrollTo('[data-role="trip-roster-paste-open"]'),
            { tap: '[data-role="trip-roster-paste-open"]' },
            { sleep: 400 },
            scrollTo('#trip-roster-paste-box'),
            { tap: '#trip-roster-paste-box' },
            { cdp: { method: 'Input.insertText', params: { text: PASTE } } },
            { sleep: 200 },
            scrollTo('[data-role="trip-roster-paste-review"]'),
            { tap: '[data-role="trip-roster-paste-review"]' },
            { sleep: 600 },
            { expression: PROBE },                                            // reviewed
            scrollTo('[data-role="trip-roster-paste-save"]'),
            { tap: '[data-role="trip-roster-paste-save"]' },
            { sleep: 600 },
            { tap: '#ui-sheet-yes' },
            { sleep: 1500 },
            { expression: PROBE },                                            // applied
            { shot: path.join(DESK, 'TRIP-AFTER.png') }
        ]
    });
    if (!r.ok) bail(r.reason, r);
    const J = (i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };
    const probes = r.value.map((v, i) => ({ v, i })).filter((x) => /^\{"title"/.test(String(x.v))).map((x) => x.i);
    if (probes.length !== 3) bail('expected three probes, got ' + probes.length, r.value.map((v, i) => i + ':' + String(v).slice(0, 60)));
    const before = J(probes[0]), reviewed = J(probes[1]), after = J(probes[2]);
    if (!before || !reviewed || !after) bail('a probe did not parse', r.value);
    const shots = r.value.filter((v) => /^shot /.test(String(v)));
    if (shots.length !== 2) failures.push('screenshots: ' + JSON.stringify(r.value.filter((v) => /shot|screenshot/.test(String(v)))));

    // ---- (d) THE ROUNDS LIST -----------------------------------------------
    if (before.rows.length !== 3) failures.push('rounds: ' + before.rows.length + ' rows, not 3');
    const want = ['Mon 10/12 \u00B7 8:24 AM \u00B7 Caledonia Golf & Fish Club',
                  'Tue 10/13 \u00B7 7:50 AM \u00B7 True Blue Golf Club',
                  'Tue 10/13 \u00B7 1:40 PM \u00B7 True Blue Golf Club'];
    if (JSON.stringify(before.rows) !== JSON.stringify(want)) {
        failures.push('rounds: not in date order with time and course: ' + JSON.stringify(before.rows));
    }
    if (!before.rowOpens.every(Boolean)) failures.push('rounds: a row has no Open link: ' + JSON.stringify(before.rowOpens));
    if (!before.rowEditTucked.every((t) => t === true)) failures.push('rounds: Edit is not tucked: ' + JSON.stringify(before.rowEditTucked));

    // ---- THE GOLFERS, IN GROUPS -------------------------------------------
    if (!/Group 1/.test(String(before.roster))) failures.push('golfers: not shown in groups: ' + JSON.stringify(before.roster.slice(0, 200)));

    // ---- (e) ONE QUIET LINE ------------------------------------------------
    const loud = (String(before.money).match(/is not a name/g) || []).length
        + (String(before.awards).match(/is not a name/g) || []).length;
    if (loud > 0) failures.push('placeholders: ' + loud + ' "is not a name" paragraphs still on the page');
    if (!/waiting for real names/.test(String(before.money))) failures.push('money: no quiet waiting line: ' + JSON.stringify(String(before.money).slice(0, 200)));
    if (!/Add real names before the first round/.test(String(before.money))) failures.push('money: the quiet line does not say what to do: ' + JSON.stringify(String(before.money).slice(0, 200)));
    if (before.pageWarnings !== 0) failures.push('placeholders: ' + before.pageWarnings + ' loud placeholder warnings still on the page');
    if (!/Add real names before the first round/.test(String(before.banner))) failures.push('the one line is missing from the top of the page: ' + JSON.stringify(before.banner));

    // ---- (a) and (c) THE REVIEW -------------------------------------------
    if (!/24 golfers in 6 groups/.test(reviewed.review)) failures.push('review: not "24 golfers in 6 groups": ' + JSON.stringify(reviewed.review.slice(0, 200)));
    if (/\bGroup \d+ \d/.test(reviewed.review) || /Group \u00B7/.test(reviewed.review)) failures.push('review: a header was parsed as a golfer: ' + JSON.stringify(reviewed.review.slice(0, 300)));
    if (!/Zack Carrano 6/.test(reviewed.review)) failures.push('review: the first golfer is missing his handicap: ' + JSON.stringify(reviewed.review.slice(0, 300)));
    if (!/Derrick J Doncaster 15/.test(reviewed.review)) failures.push('review: a three-part name did not survive: ' + JSON.stringify(reviewed.review.slice(0, 300)));
    if (!/each gets these 24 golfers/.test(reviewed.review)) failures.push('review: the counts are not per person: ' + JSON.stringify(reviewed.review.slice(0, 400)));
    if (/147|28 placeholder/.test(reviewed.review)) failures.push('review: per-round sums are back: ' + JSON.stringify(reviewed.review.slice(0, 400)));
    if (!/Untouched \(already has scores\): Day 1 AM/.test(reviewed.review)) failures.push('review: the played round is not named: ' + JSON.stringify(reviewed.review.slice(0, 400)));

    // ---- (b) THE WRITE LANDS, AND THE SCREEN SHOWS IT ---------------------
    const rosterWrites = (after.writes || []).filter((w) => /^events\//.test(w.path));
    const players = rosterWrites.filter((w) => /\/players$/.test(w.path));
    if (players.length !== 2) failures.push('apply: ' + players.length + ' player writes, not 2: ' + JSON.stringify(rosterWrites.map((w) => w.path)));
    players.forEach((w) => {
        if (/RD1/.test(w.path)) failures.push('apply: THE PLAYED ROUND WAS WRITTEN: ' + w.path);
        if ((w.names || []).length !== 24) failures.push('apply: ' + (w.names || []).length + ' golfers written to ' + w.path);
        if ((w.names || [])[0] !== '101:Zack Carrano/6') failures.push('apply: the first seat is ' + JSON.stringify((w.names || [])[0]) + ' - the id must stay with the seat');
        if ((w.names || []).some((n) => /:Group/.test(n))) failures.push('apply: a group header was written as a golfer: ' + JSON.stringify((w.names || []).filter((n) => /:Group/.test(n))));
    });
    const sizes = rosterWrites.filter((w) => /groupSizeOverrides$/.test(w.path));
    if (!sizes.length) failures.push('apply: the six groups were not written');
    else if (JSON.stringify(sizes[0].names) !== JSON.stringify({ 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 })) {
        failures.push('apply: group sizes ' + JSON.stringify(sizes[0].names));
    }
    // THE SCREEN, which is what he actually complained about.
    if (/Player 1\b/.test(String(after.roster))) failures.push('apply: Player 1 is STILL on screen after the write: ' + JSON.stringify(String(after.roster).slice(0, 200)));
    if (!/Zack Carrano/.test(String(after.roster))) failures.push('apply: the pasted names are not on screen: ' + JSON.stringify(String(after.roster).slice(0, 200)));
    const groupsShown = (after.rosterGroups || []).length;
    if (groupsShown !== 6) failures.push('apply: ' + groupsShown + ' groups shown, not 6');
    if (r.dialogs && r.dialogs.length) failures.push('a native dialog opened: ' + JSON.stringify(r.dialogs));

    // ---- THE NEW-TRIP SCREEN IS FOUR THINGS ------------------------------
    //
    // Name, the rounds, the golfers, Build. The day planner is one line behind
    // "Set the days up by hand instead", and the golfers go in from the SAME
    // paste - so a trip arrives with real names and real groups rather than
    // twelve Player Ns to fix later.
    const n = await arriveCold({
        url: fileUrl('trip.html', ''),
        db: { trips: {}, events: {}, global_courses: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3000,
        // BUILD NAVIGATES, AND A NEW PAGE HAS A NEW window.__coldWrites. The
        // writes are mirrored into window.name, which survives a same-tab
        // navigation, so the check can read what Build wrote after it has gone.
        // BUILD WRITES AND THEN NAVIGATES, in the same task: measured, ten probes
        // issued back-to-back after the tap all ran on the NEW document, where
        // window.__coldWrites is a fresh empty array. window.name does not survive
        // it either - a file:// page is its own opaque origin and Chrome clears
        // the name - but localStorage does, measured. So every write is mirrored
        // there AS IT HAPPENS, by wrapping the array's push the moment the stub
        // assigns it. No polling, so nothing can fall in a gap.
        preScript: `(function () {
            // THE STUB MAY HAVE ASSIGNED IT ALREADY - this runs after it - so the
            // existing array is adopted rather than replaced with null, which is
            // how the first draft of this broke every write with "Cannot read
            // properties of null (reading 'push')".
            var inner = window.__coldWrites || null;
            function wrap(v) {
                if (!v || v.__mirrored) return v;
                var push = v.push.bind(v);
                v.push = function (w) {
                    var r = push(w);
                    try { localStorage.setItem('__mirror', JSON.stringify(v)); } catch (e) { /* no storage */ }
                    return r;
                };
                v.__mirrored = true;
                return v;
            }
            wrap(inner);
            Object.defineProperty(window, '__coldWrites', {
                configurable: true,
                get: function () { return inner; },
                set: function (v) { inner = wrap(v); }
            });
        })();`,
        steps: [
            { expression: `(function(){var b=Array.from(document.querySelectorAll('button')).find(function(x){return /Start a New Trip/.test(x.innerText||'');}); if(!b) return 'no start'; b.id='tmp-start'; return 'ok';})()` },
            { tap: '#tmp-start' },
            { tap: '#trip-name-input' },
            { cdp: { method: 'Input.insertText', params: { text: 'Myrtle Beach 2026' } } },
            { expression: `(function(){
                var card = document.getElementById('golfer-paste-card');
                var day = document.getElementById('day-planner-card');
                var itin = document.getElementById('itin-paste-card');
                return JSON.stringify({ golfersOpen: !!card.open, dayTucked: !day.open, itinOpen: !!itin.open,
                  order: Array.from(document.querySelectorAll('#create-trip-form > *')).map(function(e){return e.id || e.tagName;}) });
              })()` },                                                      // the screen
            { shot: path.join(DESK, 'NEW-TRIP-SCREEN.png') },
            scrollTo('#itin-paste-box'),
            { tap: '#itin-paste-box' },
            { cdp: { method: 'Input.insertText', params: { text: 'Mon 10/12 - Caledonia Golf & Fish Club, 8:24 AM\nTue 10/13 - True Blue Golf Club, 7:50 AM' } } },
            scrollTo('#itin-paste-card button'),
            { tap: '#itin-paste-card button' },
            { sleep: 400 },
            { expression: `(function(){var b=Array.from(document.querySelectorAll('#itin-review button')).find(function(x){return /Use these/.test(x.innerText||'');}); if(!b) return 'no use'; b.id='tmp-use'; return 'ok';})()` },
            scrollTo('#tmp-use'),
            { tap: '#tmp-use' },
            { sleep: 800 },
            scrollTo('#setup-golfers-box'),
            { tap: '#setup-golfers-box' },
            { cdp: { method: 'Input.insertText', params: { text: PASTE } } },
            scrollTo('[data-role="setup-golfers-review"]'),
            { tap: '[data-role="setup-golfers-review"]' },
            { sleep: 500 },
            { expression: `(function(){return JSON.stringify({ review: (document.getElementById('setup-golfers-review')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim(),
                note: (document.getElementById('setup-golfers-note')||{innerText:''}).innerText.trim() });})()` },
            scrollTo('#build-trip-btn'),
            { tap: '#build-trip-btn' },
            // READ BEFORE THE NAVIGATION COMMITS. Build writes and then sends the
            // browser to the trip it just made, and the new document has a new
            // window.__coldWrites - so the writes are read here, in the ~100ms
            // between the update() resolving and the location assignment landing,
            // and the URL is read after.
            // SAMPLED WHILE IT BUILDS. The writes land about a second after the tap
            // (a course read and six code issues first), and the navigation to the
            // new trip follows one microtask later - window.name does NOT survive
            // it, because a file:// page is its own opaque origin and Chrome
            // clears the name. So the check samples until it sees them.
            { sleep: 1500 },
            { expression: MIRROR },
            { expression: `(function(){ return JSON.stringify({ url: location.href }); })()` }
        ]
    });
    if (!n.ok) bail('new-trip arrival: ' + n.reason, n);
    // FOUND BY SHAPE, NOT BY A COUNTED INDEX: a step added above would otherwise
    // silently re-point every assertion at a "scrolled".
    const pick = (re) => { const hit = n.value.filter((v) => re.test(String(v))); try { return JSON.parse(hit[hit.length - 1]); } catch (e) { return null; } };
    const screen = pick(/^\{"golfersOpen"/);
    const setupReview = pick(/^\{"review"/);
    const built = pick(/^\{"wrote"/);
    const landed = pick(/^\{"url"/);
    if (!screen || !setupReview || !built) bail('new-trip probes did not parse', n.value.map((v, i) => i + ':' + String(v).slice(0, 60)));
    if (!screen.golfersOpen) failures.push('new trip: the golfers block is not on the screen');
    if (!screen.itinOpen) failures.push('new trip: the itinerary block is not on the screen');
    if (!screen.dayTucked) failures.push('new trip: the day planner is still on the screen');
    if (!/24 golfers in 6 groups/.test(String(setupReview.review))) failures.push('new trip: the golfer review is wrong: ' + JSON.stringify(String(setupReview.review).slice(0, 200)));
    if (!/24 golfers in 6 groups go into every round/.test(String(setupReview.note))) failures.push('new trip: the note above Build is wrong: ' + JSON.stringify(setupReview.note));
    if (!landed || !/[?&]trip=/.test(String(landed.url))) failures.push('new trip: Build did not reach a trip: ' + JSON.stringify(landed && landed.url));
    if ((built.events || []).length !== 2) failures.push('new trip: ' + (built.events || []).length + ' rounds written, not 2');
    (built.events || []).forEach((e) => {
        if (e.players !== 24) failures.push('new trip: ' + e.players + ' golfers in ' + e.path);
        if ((e.first || [])[0] !== '101:Zack Carrano/6') failures.push('new trip: the first seat is ' + JSON.stringify((e.first || [])[0]));
        if (JSON.stringify(e.groups) !== JSON.stringify({ 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 })) failures.push('new trip: groups ' + JSON.stringify(e.groups) + ' in ' + e.path);
    });
    if (!/Caledonia/.test(String((built.events || [])[0] || {}).concat(JSON.stringify(built.events)))) failures.push('new trip: the itinerary course did not land: ' + JSON.stringify(built.events));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        newTrip: { screen: screen, note: setupReview.note, events: built.events, wrote: built.wrote,
                   url: built.url, notes: built.notes },
        shots: shots.concat(n.value.filter((v) => /^shot /.test(String(v)))),
        before: { rows: before.rows, roster: String(before.roster).slice(0, 200), money: String(before.money).slice(0, 200) },
        review: reviewed.review.slice(0, 500),
        after: { roster: String(after.roster).slice(0, 220), writes: rosterWrites.map((w) => w.path) } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
