// THE COURSE PICKER, the way an organizer reaches it (Advisor 2026-11-11 12:42,
// Manny's phone test on the preview: typed "Pap", tapped Papago Golf Club,
// nothing selected, Save said "Please select a golf course" in a dialog).
// Cold arrival at 390x844 (tools/lib/cold-arrival.js), signed in as an
// organizer, no card for the course anywhere (global_courses empty, no preset),
// the online search NOT configured (its proxy answers not_configured, as a
// preview host does). Real taps and keystrokes; no page function is called.
//
//  1 type "pap", tap Papago Golf Club: SELECTED (the box and course-key), the
//    note under the box says the card is a placeholder and offers the fetch;
//    no dialog opened
//  2 ...then a team and Save: the creating write carries the course by name,
//    courseIndexSynthetic true and eighteen par 4s indexed 1..18; the page
//    moves to the event
//  3 Save with no course picked: "Pick a golf course first." under the box, no
//    write, no dialog (cold-arrival fails the arrival on any native dialog)
//  4 money = base: payouts.js, tournament-engine.js, handicap.js are main
//    97698412 byte for byte
//
// Baseline against phase2 edfc5e80 (before this fix): all 4 tests: 1 PASS / 3 FAIL.
// The 1 is test 4. With the fix: all 4 tests: 4 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const empty = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: {} });
// The proxy, replaced: the preview's answer. The page calls whatever fetch is.
const PRE = `(function () { const real = window.fetch; window.fetch = function (u, o) {
    if (/\\/api\\/course-search/.test(String(u))) return Promise.resolve(new Response(JSON.stringify({ status: 'unavailable', reason: 'not_configured' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return real.apply(this, arguments); }; })();`;
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { box: ($('#course-search-input') || {}).value || '', key: ($('#course-key') || {}).value || '', note: shown($('#course-note')) ? t('#course-note') : '', noteBtn: !!$('#course-note-online'),
    dropdown: shown($('#course-dropdown')), setup: shown($('#setup-screen')), manage: shown($('#manage-screen')), title: t('#ap-m-title'),
    writes: (window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const PICK = [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 }, { tap: '#course-dropdown .custom-select-option' }, { sleep: 400 }];
const go = async (steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: PRE, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 type "pap", tap Papago Golf Club: selected on a placeholder card, the note says so and offers the fetch; no dialog', async () => {
    const [a] = await go(PICK.concat([READ]));
    assert.equal(a.setup, true, 'positive: the create form');
    assert.equal(a.key, 'az_papago', 'selected');
    assert.equal(a.box, 'Papago Golf Club');
    assert.equal(a.dropdown, false, 'the list closed');
    assert.match(a.note, /^No scorecard for Papago Golf Club yet\. Pars are set to 4 and the stroke index to 1–18 until a card is loaded, so the event scores gross\. 🌐 Get the card for "Papago Golf Club" online$/);
    assert.equal(a.noteBtn, true);
    assert.deepEqual(a.writes, [], 'nothing written by a pick');
});

test('2 ...then a team and Save: the record carries the course by name, the synthetic flag and eighteen par 4s; the page moves on', async () => {
    const FILL = { expression: `(function () { document.getElementById('t-name').value = 'Hope Foundation Scramble';
        var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); if (!p) return 'no team input'; p.value = 'Al Lopez'; return 'filled'; })()` };
    // The stand-in database lives in the document: the writes are stored at
    // pagehide and replayed into the next document's stand-in, so the page can
    // move to the event it just created (as tournament_phase2_test.js does).
    const CARRY = `(function () { try {
        var saved = JSON.parse(sessionStorage.getItem('__cpw') || '[]');
        saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
        window.__coldWrites = [];
        window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__cpw', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
    } catch (e) {} })();`;
    const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__cpw') || '[]'), search: location.search }); } catch (e) { return 'no storage'; } })()` };
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: PRE + CARRY,
        steps: PICK.concat([FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, CARRIED]) });
    assert.ok(r.ok, r.reason);
    assert.ok(r.value.includes('filled'));
    const c = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    assert.match(c.search, /^\?tourney=[A-Z2-9]{6}&app=1$/, 'moved to the new event: ' + c.search);
    const create = c.carried.find((w) => w.op === 'update' && w.path === '' && Object.keys(w.value).some((k) => /^tournaments\/[A-Z2-9]{6}$/.test(k)));
    assert.ok(create, 'the creating write: ' + JSON.stringify(c.carried.map((w) => w.path)));
    const rec = create.value[Object.keys(create.value).find((k) => /^tournaments\//.test(k))];
    assert.equal(rec.courseName, 'Papago Golf Club');
    assert.equal(rec.activeCourseKey, 'az_papago');
    assert.equal(rec.courseIndexSynthetic, true);
    assert.equal(rec.courseData.length, 18);
    assert.ok(rec.courseData.every((h, i) => h.hole === i + 1 && h.par === 4 && h.hcpIndex === i + 1), 'eighteen par 4s, SI 1..18');
});

test('3 Save with no course: "Pick a golf course first." under the box; no write, no dialog', async () => {
    const FILL = { expression: `(function () { document.getElementById('t-name').value = 'No Course Yet'; var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); p.value = 'Al Lopez'; return 'filled'; })()` };
    const [a] = await go([FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 400 }, READ]);
    assert.equal(a.setup, true, 'still on the form');
    assert.equal(a.note, 'Pick a golf course first.');
    assert.equal(a.key, '');
    assert.deepEqual(a.writes, []);
});

test('4 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
