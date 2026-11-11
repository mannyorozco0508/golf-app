// THE COURSE PICKER, the way an organizer reaches it (Advisor 2026-11-11 12:42,
// Manny's phone test on the preview: typed "Pap", tapped Papago Golf Club,
// nothing selected, Save said "Please select a golf course" in a dialog; then
// Manny: "tapping a course with no card must fetch its real card online
// automatically - one step, like the HardPan app - the par-4 placeholder only
// if that fetch fails").
// Cold arrival at 390x844 (tools/lib/cold-arrival.js), signed in as an
// organizer, no card for the course anywhere (global_courses empty, no preset).
// The proxy is REPLACED per test (a preScript wraps window.fetch - the page
// calls whatever fetch is): the provider's answer, or not_configured as a
// preview host without the config answers. Real taps and keystrokes; no page
// function is called.
//
//  1 type "pap", tap Papago Golf Club: ONE search by name and ONE detail fetch,
//    no tap; the real card is selected (the import key, the provider's name,
//    Blue tees), the note says so and offers Change tees; no dialog
//  2 ...then a team and Save: the record carries the imported course by name,
//    courseIndexSynthetic false, the Blue stroke index, importedCourses
//  3 the proxy not configured (a preview host): the pick is still selected, on
//    the placeholder card; the note names the reason and offers the lookup
//    again; Save works and the record says courseIndexSynthetic true
//  4 the provider knows nothing by that name: placeholder, "Nothing online
//    matched", one search and no detail fetch
//  4b the shared course list first: a record by that name under another key is
//    used, and the provider is not asked
//  4c the match and the query variants against the live proxy's own answers
//    for Papago, Grayhawk Talon, Dobson Ranch and Nanea
//  5 Save with no course picked: "Pick a golf course first." under the box, no
//    write, no dialog (cold-arrival fails the arrival on any native dialog)
//  6 money = base: payouts.js, tournament-engine.js, handicap.js are main
//    97698412 byte for byte
//
// Baseline against phase2 edfc5e80 (before the fix): all 8 tests: 1 PASS / 7 FAIL.
// The 1 is test 6. With the fix: all 8 tests: 8 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const empty = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: {} });
// THE PROVIDER'S PAPAGO (the live proxy's own shape, 2026-11-11), plus a decoy
// that shares the word "club" and nothing else.
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = (order) => order.map((si, i) => ({ par: PARS[i], yardage: 380, handicap: si }));
const SI_BLUE = [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const SI_WHITE = [13, 7, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4];
const PAPAGO = { id: 'hpag0kx6', club_name: 'Papago Golf Course', course_name: 'Papago Golf Course',
    location: { address: '5595 E Karsten Way, Phoenix, AZ 85008, USA', city: 'Phoenix', state: 'AZ' }, tees: { male: 2, female: 1 } };
const DECOY = { id: 'zz999', club_name: 'Pinnacle Peak Country Club', course_name: 'Pinnacle Peak Country Club', location: { city: 'Scottsdale', state: 'AZ' }, tees: { male: 1 } };
const PAPAGO_DETAIL = Object.assign({}, PAPAGO, { tees: {
    male: [{ tee_name: 'White', course_rating: 70.1, slope_rating: 125, total_yards: 6300, par_total: 72, holes: holes(SI_WHITE) },
           { tee_name: 'Blue', course_rating: 72.4, slope_rating: 131, total_yards: 6800, par_total: 72, holes: holes(SI_BLUE) }],
    female: [{ tee_name: 'Red', course_rating: 69.0, slope_rating: 118, total_yards: 5400, par_total: 72, holes: holes(SI_BLUE) }] } });
// The provider's search is LITERAL (measured live 2026-11-11: "Papago Golf Club"
// finds nothing, "papago" finds Papago Golf Course). The stub answers the list
// only to a query whose words all occur in a listed course's name.
const proxy = (search, detail) => `(function () { window.__api = []; const real = window.fetch; const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const literal = (q, list) => (list || []).filter((c) => { const hay = ((c.club_name || '') + ' ' + (c.course_name || '')).toLowerCase(); return q.toLowerCase().split(/\\s+/).every((w) => hay.indexOf(w) !== -1); });
    window.fetch = function (u, o) { const s = String(u);
        if (/\\/api\\/course-search/.test(s)) { window.__api.push(s); const q = decodeURIComponent(s.split('q=')[1] || ''); const ans = ${JSON.stringify(search)}; return J(ans.status === 'ok' ? { status: 'ok', courses: literal(q, ans.courses) } : ans); }
        if (/\\/api\\/course\\//.test(s)) { window.__api.push(s); return J(${JSON.stringify(detail)}); }
        return real.apply(this, arguments); }; })();`;
const PROVIDER = proxy({ status: 'ok', courses: [DECOY, PAPAGO] }, { status: 'ok', course: PAPAGO_DETAIL });
const NOT_CONFIGURED = proxy({ status: 'unavailable', reason: 'not_configured' }, { status: 'unavailable', reason: 'not_configured' });
const NOTHING = proxy({ status: 'ok', courses: [] }, { status: 'unavailable', reason: 'bad_course_id' });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { box: ($('#course-search-input') || {}).value || '', key: ($('#course-key') || {}).value || '', note: shown($('#course-note')) ? t('#course-note') : '',
    noteBtn: (function () { var b = $('#course-note button'); return b ? b.id : null; })(), panel: shown($('#course-import-confirm')), api: window.__api || [],
    dropdown: shown($('#course-dropdown')), setup: shown($('#setup-screen')),
    writes: (window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const PICK = [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 }, { tap: '#course-dropdown .custom-select-option' }, { sleep: 700 }];
const FILL = { expression: `(function () { document.getElementById('t-name').value = 'Hope Foundation Scramble';
    var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); if (!p) return 'no team input'; p.value = 'Al Lopez'; return 'filled'; })()` };
// The stand-in database lives in the document: the writes are stored at pagehide
// and replayed into the next document's stand-in, so the page can move to the
// event it just created (as tournament_phase2_test.js does).
const CARRY = `(function () { try {
    var saved = JSON.parse(sessionStorage.getItem('__cpw') || '[]');
    saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
    window.__coldWrites = [];
    window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__cpw', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
} catch (e) {} })();`;
const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__cpw') || '[]'), search: location.search }); } catch (e) { return 'no storage'; } })()` };
const go = async (pre, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: pre, steps });
    assert.ok(r.ok, r.reason);
    return { objs: r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v)), raw: r.value };
};
const createdRecord = (c) => {
    const create = c.carried.find((w) => w.op === 'update' && w.path === '' && Object.keys(w.value).some((k) => /^tournaments\/[A-Z2-9]{6}$/.test(k)));
    assert.ok(create, 'the creating write: ' + JSON.stringify(c.carried.map((w) => w.path)));
    return create.value[Object.keys(create.value).find((k) => /^tournaments\//.test(k))];
};

test('1 type "pap", tap Papago Golf Club: one search, one detail fetch, no tap; the real card is selected and the note says so', async () => {
    const { objs: [a] } = await go(PROVIDER, PICK.concat([READ]));
    assert.equal(a.setup, true, 'positive: the create form');
    assert.deepEqual(a.api, ['/api/course-search?q=Papago%20Golf%20Club', '/api/course-search?q=papago', '/api/course/hpag0kx6'], 'the name as typed (nothing), its distinctive word (Papago Golf Course, not the decoy), then the card');
    assert.equal(a.key, 'gca_hpag0kx6', 'the imported course is selected');
    assert.equal(a.box, 'Papago Golf Course', 'named as the provider names it');
    assert.equal(a.dropdown, false, 'the list closed');
    assert.equal(a.note, 'Scorecard loaded online: Papago Golf Course, Blue tees, par 72. Change tees');
    assert.equal(a.noteBtn, 'course-note-tees');
    assert.equal(a.panel, false, 'no tee panel until asked');
    assert.deepEqual(a.writes, [], 'nothing written by a pick');
});

test('2 ...then a team and Save: the record carries the imported course, its Blue stroke index, and no synthetic flag', async () => {
    const { raw } = await go(PROVIDER + CARRY, PICK.concat([FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, CARRIED]));
    assert.ok(raw.includes('filled'));
    const c = JSON.parse(raw.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    assert.match(c.search, /^\?tourney=[A-Z2-9]{6}&app=1$/, 'moved to the new event: ' + c.search);
    const rec = createdRecord(c);
    assert.equal(rec.courseName, 'Papago Golf Course');
    assert.equal(rec.activeCourseKey, 'gca_hpag0kx6');
    assert.equal(rec.courseIndexSynthetic, false);
    assert.deepEqual(rec.courseData.map((h) => h.hcpIndex), SI_BLUE, 'the Blue tees\' stroke index');
    assert.deepEqual(rec.courseData.map((h) => h.par), PARS);
    assert.equal(rec.importedCourses.gca_hpag0kx6.source.siFrom, 'male/Blue');
});

test('3 the proxy not configured (a preview host): selected on the placeholder, the note names the reason and offers the lookup again; Save works, flagged synthetic', async () => {
    const { objs: [a], raw } = await go(NOT_CONFIGURED + CARRY, PICK.concat([READ, FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, CARRIED]));
    assert.equal(a.key, 'az_papago', 'selected on the directory key');
    assert.equal(a.box, 'Papago Golf Club');
    assert.equal(a.note, 'Couldn\'t look up Papago Golf Club online: Online search isn\'t set up yet. Pars are set to 4 and the stroke index to 1–18 until a card is loaded, so the event scores gross. 🌐 Try the online lookup again');
    assert.equal(a.noteBtn, 'course-note-online');
    assert.deepEqual(a.api, ['/api/course-search?q=Papago%20Golf%20Club'], 'the first answer says not configured: no more tries, no detail fetch');
    const c = JSON.parse(raw.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    const rec = createdRecord(c);
    assert.equal(rec.courseName, 'Papago Golf Club');
    assert.equal(rec.activeCourseKey, 'az_papago');
    assert.equal(rec.courseIndexSynthetic, true);
    assert.ok(rec.courseData.length === 18 && rec.courseData.every((h, i) => h.par === 4 && h.hcpIndex === i + 1), 'eighteen par 4s, SI 1..18');
});

test('4 the provider knows nothing by that name: placeholder, "Nothing online matched", one search and no detail fetch', async () => {
    const { objs: [a] } = await go(NOTHING, PICK.concat([READ]));
    assert.equal(a.key, 'az_papago');
    assert.match(a.note, /^Nothing online matched Papago Golf Club\. Pars are set to 4/);
    assert.deepEqual(a.api, ['/api/course-search?q=Papago%20Golf%20Club', '/api/course-search?q=papago'], 'both queries tried, no detail fetch');
});

test('4b the shared course list first: a record named Papago Golf Course under another key is used, no provider call', async () => {
    const SHARED = { gca_oldimport: { name: 'Papago Golf Course', data: PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: SI_WHITE[i] })) } };
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: Object.assign(empty(), { global_courses: SHARED }), auth: OWNER, settleMs: 3000, preScript: PROVIDER, steps: PICK.concat([READ]) });
    assert.ok(r.ok, r.reason);
    const a = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{')[0]);
    assert.equal(a.key, 'gca_oldimport', 'the shared record, by name');
    assert.equal(a.box, 'Papago Golf Course');
    assert.equal(a.note, 'Scorecard: Papago Golf Course, from the shared course list.');
    assert.deepEqual(a.api, [], 'the provider was not asked');
});

test('4c the match and the queries, against the LIVE proxy\'s own answers of 2026-11-11 (Papago, Grayhawk Talon, Dobson Ranch, Nanea)', () => {
    // The two page functions, lifted from the source and run in Node: the
    // answers below are what tournaments.rattlegolf.com/api/course-search
    // returned on 2026-11-11 13:40 for these queries.
    const src = fs.readFileSync(path.join(__dirname, 'tournament.html'), 'utf8');
    const lift = (name) => { const at = src.indexOf('function ' + name + '('); return src.slice(at, src.indexOf('\n    function ', at + 30)); };
    const vm = require('vm');
    const box = { COURSE_STOP_WORDS: { golf: 1, club: 1, course: 1, country: 1, the: 1, gc: 1, cc: 1, links: 1, resort: 1, at: 1, of: 1, and: 1, '&': 1 } };
    vm.createContext(box);
    vm.runInContext([lift('courseNameTokens'), lift('bestCourseMatch'), lift('courseLookupQueries')].join('\n'), box);   // joined with newlines: each slice ends in a comment line
    const LIVE = {
        'Papago Golf Club': [], 'papago': [{ id: 'hpag0kx6', club_name: 'Papago Golf Course', course_name: 'Papago Golf Course' }],
        'Grayhawk Talon': [], 'grayhawk talon': [], 'grayhawk': [{ id: 'n5tvwqhy', club_name: 'Grayhawk', course_name: 'Talon' }, { id: 'cye6tb1v', club_name: 'Grayhawk', course_name: 'Raptor' }],
        'Dobson Ranch': [{ id: 'zgkynkan', club_name: 'Dobson Ranch Golf Course', course_name: 'Dobson Ranch Golf Course' }],
        'Nanea': [{ id: 'w6jm8tne', club_name: 'Nanea Golf Club', course_name: 'Nanea Golf Club' }, { id: 'fkxshrq6', club_name: 'Club Campestre De Cananea', course_name: 'Club Campestre De Cananea' }],
    };
    const resolve = (name) => {
        for (const q of box.courseLookupQueries(name)) { const m = box.bestCourseMatch(name, LIVE[q] || []); if (m) return { q, id: m.id }; }
        return null;
    };
    assert.deepEqual(resolve('Papago Golf Club'), { q: 'papago', id: 'hpag0kx6' });
    assert.deepEqual(resolve('Grayhawk Talon'), { q: 'grayhawk', id: 'n5tvwqhy' }, 'Talon, not Raptor');
    assert.deepEqual(resolve('Dobson Ranch'), { q: 'Dobson Ranch', id: 'zgkynkan' });
    assert.deepEqual(resolve('Nanea'), { q: 'Nanea', id: 'w6jm8tne' }, 'Nanea, not Cananea');
});

test('5 Save with no course: "Pick a golf course first." under the box; no write, no dialog', async () => {
    const FILL2 = { expression: `(function () { document.getElementById('t-name').value = 'No Course Yet'; var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); p.value = 'Al Lopez'; return 'filled'; })()` };
    const { objs: [a] } = await go(NOT_CONFIGURED, [FILL2, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 400 }, READ]);
    assert.equal(a.setup, true, 'still on the form');
    assert.equal(a.note, 'Pick a golf course first.');
    assert.equal(a.key, '');
    assert.deepEqual(a.writes, []);
});

test('6 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
