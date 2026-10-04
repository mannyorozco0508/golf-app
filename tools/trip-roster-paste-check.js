#!/usr/bin/env node
// ============================================================================
// RENAMING A TRIP AND PASTING ITS ROSTER, IN CHROME AT 390x844.
//
// Two organizer controls that write to rounds other people's money is in, so
// neither may be proved only by reading the source. This opens trip.html COLD
// (tools/lib/cold-arrival.js) on a real trip - one round PLAYED (scores and a
// $40 side match) and two with twelve "Player N" placeholders - as the
// organizer, with the token on the URL. Every step is a real CDP tap or
// keystroke; the only expressions read the DOM or tag an element for a tap, and
// nothing the page defines is called.
//
//   - the trip header reads the name it was given, and "Rename trip" is there
//   - typing a new name and tapping Save writes trips/<code>/name AND NOTHING
//     ELSE - no set() on the trip node, which would take the rounds with it
//   - the Golfers section's paste card takes Manny's own shape ("B Jimmy 11
//     (captain)"), the review names every golfer with the handicap read, prices
//     the change in rounds, and NAMES the played round as untouched
//   - tapping Use these N golfers asks first, and on yes writes players for the
//     two open rounds only: the played round's path never appears
//   - the pasted golfers took the placeholder seats IN ORDER, keeping their ids
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Marty', hcp: '4' }, { id: 102, name: 'Dee', hcp: '9' },
              { id: 103, name: 'Reese', hcp: '0' }, { id: 104, name: 'Jimmy', hcp: '12' }];
const scores = {};
FOUR.forEach(p => cd18.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
scores.p101_h1 = 3;
const holders = (n) => Array.from({ length: n }, (_, i) => ({
    id: 101 + i, name: 'Player ' + (i + 1), hcp: '', team: 'Team 1', squad: 'red', playingForMoney: true }));
const openRound = (name) => ({ eventName: name, roundDay: name, players: holders(12),
    courseData: cd18, scores: {}, gameFormat: 'stroke', activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' });

const db = {
    trips: { MYRTLE: {
        name: 'Myrtle Beach 2006', createdAt: 1, organizerToken: TOKEN,
        rounds: {
            RD1: { label: 'Day 1 AM', addedAt: 10, date: '2026-10-12' },
            RD2: { label: 'Day 1 PM', addedAt: 20, date: '2026-10-12' },
            RD3: { label: 'Day 2', addedAt: 30, date: '2026-10-13' }
        } } },
    events: {
        RD1: { eventName: 'Day 1 AM', roundDay: 'Day 1 AM', players: FOUR, courseData: cd18,
               scores: scores, gameFormat: 'stroke', activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club',
               sideMatches: { m1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                                    startHole: 1, stake: 40, pressRule: 'none', createdAt: 1 } } },
        RD2: openRound('Day 1 PM'),
        RD3: openRound('Day 2')
    },
    global_courses: {}, tournaments: {}
};

const PASTE = ['B Jimmy 11 (captain)', 'A Paul 3.5', 'Marty 9', 'Lance 14.3',
               '', 'Reese 6', 'Mike 12', 'Dave 18', 'Tom 2'].join('\n');

// SCROLLED EXPLICITLY BEFORE EACH TAP IN THE GOLFERS SECTION. The harness's tap
// step calls el.scrollIntoView({block:'center'}) and reads the rect, and on this
// page that call MOVES NOTHING - measured: scrollY stays put and the element
// keeps a rect 1,110px below the fold, so the tap lands on whatever is at those
// coordinates instead. window.scrollTo does work, so the check does that first.
// It is a harness limitation, not a page one: a thumb scrolls the page itself,
// and nothing in the app depends on scrollIntoView here.
const scrollTo = (sel) => ({ expression:
    `(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'no ' + ${JSON.stringify(sel)};`
    + ` window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 260);`
    + ` return 'scrolled to ' + Math.round(e.getBoundingClientRect().top);})()` });

const tagByText = (tag, re, id) => ({ expression:
    `(function(){var b=Array.from(document.querySelectorAll(${JSON.stringify(tag)})).find(function(x){return ${re}.test(x.innerText||x.textContent||'');});if(!b)return 'no ${id}';b.id=${JSON.stringify(id)};return 'tagged ${id}';})()` });

const PROBE = `(function(){
  var copy = document.getElementById('copy-from-round-select');
  return JSON.stringify({
    title: (document.getElementById('manage-trip-name')||{innerText:''}).innerText.trim(),
    renameOffered: !!document.querySelector('[data-role="trip-rename-open"]'),
    review: (document.getElementById('trip-roster-paste-review')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim(),
    copyOptions: copy ? Array.from(copy.options).map(function(o){return o.text;}) : null,
    addRoundOpen: (function(){var d=document.getElementById('add-round-card'); return d ? !!d.open : null;})(),
    // A MULTI-PATH update() IS RECORDED AT THE ROOT: path '' with the map as the
    // value. Flattened here so an assertion can name the path it cares about.
    writes: (window.__coldWrites||[]).reduce(function (acc, w) {
      var isRoot = !w.path && w.value && typeof w.value === 'object' && !Array.isArray(w.value);
      if (!isRoot) { acc.push({ op: w.op, path: w.path, value: w.value }); return acc; }
      Object.keys(w.value).forEach(function (k) { acc.push({ op: 'update', path: k, value: w.value[k] }); });
      return acc;
    }, []).map(function (w) { return { op: w.op, path: w.path,
        names: Array.isArray(w.value) ? w.value.slice(0,9).map(function(p){return p.id + ':' + p.name + '/' + (p.hcp||'');}) : w.value };}),
    sheetOpen: (function(){var s=document.getElementById('ui-sheet'); return s ? (s.className||'') + '|' + (s.innerHTML||'').slice(0,40) : null;})(),
    notes: Array.from(document.querySelectorAll('.ui-note')).map(function(n){return (n.innerText||'').trim();}),
    boxValue: (document.getElementById('trip-roster-paste-box')||{value:''}).value.slice(0,60),
    cardOpen: (function(){var d=document.getElementById('trip-roster-paste-card'); return d ? !!d.open : null;})(),
    reviewHtml: ((document.getElementById('trip-roster-paste-review')||{innerHTML:''}).innerHTML||'').slice(0,160),
    fns: ['parsePlayerPasteText','tripRosterPasteUpdates','tripRosterPlanNow','stripTrailingNote']
      .map(function(n){ try { return n + ':' + typeof eval(n); } catch (e) { return n + ':absent'; } }),
    errs: window.__errs || []
  });
})()`;

(async () => {
    const failures = [];
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };

    const r = await arriveCold({
        url: fileUrl('trip.html', 'trip=MYRTLE&organizer=' + TOKEN),
        db, viewport: { width: 390, height: 844 }, settleMs: 4000,
        preScript: `window.__errs = [];
          window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
          window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + String((e.reason && e.reason.message) || e.reason)); });`,
        steps: [
            { expression: PROBE },                                               // 0 arrival
            // ---- RENAME ----
            { tap: '[data-role="trip-rename-open"]' },                           // 1
            { tap: '#trip-rename-input' },                                       // 2
            // EMPTIED THROUGH THE DOM, not with a select-all chord: Cmd+A over CDP
            // does not reach a file:// page's input reliably, and the box is
            // deliberately pre-filled with the current name.
            { expression: `(function(){var e=document.getElementById('trip-rename-input'); if(!e) return 'no box'; e.value=''; return 'cleared';})()` },
            { expression: 'document.activeElement && document.activeElement.id' },
            { cdp: { method: 'Input.insertText', params: { text: 'Myrtle Beach 2026' } } },  // 5
            { tap: '[data-role="trip-rename-save"]' },                           // 6
            { sleep: 600 },
            { expression: PROBE },                                               // 8 after rename
            // ---- THE ROSTER PASTE ----
            // THE GOLFERS SECTION SHIPS OPEN, so there is nothing to tap: an
            // earlier draft tapped its summary and CLOSED it, and every tap after
            // that landed on the section underneath while the probes still read
            // plausible rects out of the collapsed card. Asserted, not assumed.
            { expression: `(function(){var s=Array.from(document.querySelectorAll('summary')).find(function(x){return /Golfers/.test(x.innerText||'');}); if(!s) return 'no golfers section'; if(!s.parentElement.open) s.parentElement.open = true; return 'golfers open';})()` },
            { sleep: 400 },
            // THE PASTE CARD IS BEHIND ITS OWN BUTTON since 2026-10-04 - the Golfers
            // section offers "Paste golfers" and "Add / remove" rather than four
            // controls at once - so this opens it the way a thumb does.
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
            { expression: PROBE },                                               // reviewed
            scrollTo('[data-role="trip-roster-paste-save"]'),
            { tap: '[data-role="trip-roster-paste-save"]' },
            { sleep: 600 },
            // THE SHEET'S OWN BUTTON, BY ID (ui-dialogs.js #ui-sheet-yes). Matching
            // on the word "Use" tagged the review's own "Use these 8 golfers"
            // button instead - it comes first in document order - so the check
            // tapped Save twice and nothing was ever confirmed.
            { tap: '#ui-sheet-yes' },
            { sleep: 900 },
            { expression: PROBE }                                                // applied
        ]
    });
    if (!r.ok) bail(r.reason, r);
    const J = (i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };
    // The probes are found by their shape rather than by a hand-counted index: a
    // step added above would otherwise silently re-point every assertion.
    const probes = r.value.map((v, i) => ({ v, i })).filter((x) => /^\{"title"/.test(String(x.v))).map((x) => x.i);
    if (probes.length !== 4) bail('expected four probes, got ' + probes.length, r.value.map((v, i) => i + ':' + String(v).slice(0, 50)));
    const arrival = J(probes[0]), renamed = J(probes[1]), reviewed = J(probes[2]), applied = J(probes[3]);
    if (!arrival || !renamed || !reviewed || !applied) bail('a probe did not parse', r.value);

    // ---- THE TRIP, AS IT ARRIVES -------------------------------------------
    if (!/Myrtle Beach 2006/.test(arrival.title)) failures.push('arrival: the header does not name the trip: ' + JSON.stringify(arrival.title));
    if (!arrival.renameOffered) failures.push('arrival: the organizer is not offered a rename');
    if (arrival.addRoundOpen !== false) failures.push('arrival: the add-a-round section is not collapsed: ' + arrival.addRoundOpen);
    const opts = arrival.copyOptions || [];
    if (!/Mon 10\/12 AM . Caledonia/.test(opts[1] || '')) failures.push('arrival: Start From is not date-ordered with the course: ' + JSON.stringify(opts));

    // ---- RENAME ------------------------------------------------------------
    if (!/Myrtle Beach 2026/.test(renamed.title)) failures.push('rename: the header still reads ' + JSON.stringify(renamed.title));
    const nameWrites = (renamed.writes || []).filter(w => /^trips\/MYRTLE/.test(w.path));
    if (nameWrites.length !== 1) failures.push('rename: ' + nameWrites.length + ' trip writes, not 1: ' + JSON.stringify(nameWrites));
    else {
        if (nameWrites[0].path !== 'trips/MYRTLE/name') failures.push('rename: wrote ' + nameWrites[0].path);
        if (nameWrites[0].names !== 'Myrtle Beach 2026') failures.push('rename: wrote ' + JSON.stringify(nameWrites[0].names));
    }

    // ---- THE REVIEW --------------------------------------------------------
    if (!/Jimmy 11/.test(reviewed.review)) failures.push('review: the handicap was not read off "B Jimmy 11 (captain)": ' + JSON.stringify(reviewed.review.slice(0, 300)));
    if (!/8 golfers pasted, 8 with a handicap/.test(reviewed.review)) failures.push('review: it does not count what it read: ' + JSON.stringify(reviewed.review.slice(0, 300)));
    if (!/Will update 2 of 3 rounds/.test(reviewed.review)) failures.push('review: it does not price the change: ' + JSON.stringify(reviewed.review.slice(0, 400)));
    if (!/Untouched \(already has scores\): Day 1 AM/.test(reviewed.review)) failures.push('review: the played round is not named as untouched: ' + JSON.stringify(reviewed.review.slice(0, 400)));
    if (!/captain/.test(reviewed.review)) failures.push('review: the ignored note is not reported');
    if ((reviewed.writes || []).some(w => /^events\//.test(w.path))) failures.push('review: a round was written before the review was accepted: ' + JSON.stringify(reviewed.writes));

    // ---- THE WRITE ---------------------------------------------------------
    const rosterWrites = (applied.writes || []).filter(w => /^events\//.test(w.path));
    if (!rosterWrites.length) failures.push('apply: nothing was written - the confirm may not have been answered: ' + JSON.stringify(applied.notes));
    rosterWrites.forEach(w => {
        if (/RD1/.test(w.path)) failures.push('apply: THE PLAYED ROUND WAS WRITTEN: ' + w.path);
        if (!/^events\/(RD2|RD3)\/players$/.test(w.path)) failures.push('apply: unexpected write ' + w.path);
    });
    const one = rosterWrites.filter(w => w.path === 'events/RD2/players')[0];
    if (!one) failures.push('apply: the open round was not written');
    else {
        // Eight pasted into twelve placeholders: eight seats take their names and
        // KEEP THEIR IDS, and the ninth is still a placeholder - which is what the
        // review warned about rather than quietly dropping.
        const want = ['101:Jimmy/11', '102:Paul/3.5', '103:Marty/9', '104:Lance/14.3',
                      '105:Reese/6', '106:Mike/12', '107:Dave/18', '108:Tom/2', '109:Player 9/'];
        if (JSON.stringify(one.names) !== JSON.stringify(want)) {
            failures.push('apply: the placeholder seats did not take the pasted golfers in order, keeping their ids: '
                + JSON.stringify(one.names));
        }
    }
    if (r.dialogs && r.dialogs.length) failures.push('a native dialog opened: ' + JSON.stringify(r.dialogs));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        steps: r.value.map((v, i) => i + ':' + String(v).slice(0, 60)),
        arrival: { title: arrival.title, copyOptions: arrival.copyOptions, addRoundOpen: arrival.addRoundOpen },
        rename: nameWrites, review: reviewed.review.slice(0, 400),
        diag: { boxValue: applied.boxValue, cardOpen: applied.cardOpen, sheet: applied.sheetOpen,
                errs: applied.errs, notes: applied.notes, allWrites: applied.writes },
        roster: rosterWrites.map(w => ({ path: w.path, first: (w.names || []).slice(0, 4) })) }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
