// MY EVENTS FOLLOWS THE ACCOUNT (P2-6; Advisor 2026-11-11 16:19: an organizer
// on a second device could not find his own event). Reached the way the
// organizer reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844 at
// tournament.html, signed in or not, touch nothing; the checks read innerText
// and the recorded writes. No page function is called.
//
//  1 the WEBSITE, signed in, the account has two events in organizers/<uid>/
//    tournaments: My events lists both, newest first, above the create form
//  2 the website, signed out: no My events (nothing to list by account)
//  3 the owner opens an event: one write organizers/<uid>/tournaments/<code>
//    {at, name, course}; a golfer (anonymous) opening it writes nothing
//  4 create: the creating round trip also writes the account pointer
//  5 the app, with an event on this phone and another on the account: one list,
//    both, no duplicate
//  6 money = base
//
// Baseline against main 3119e847 (before the build): all 6 tests: 2 PASS / 4 FAIL.
// The 2 are test 2 (the website showed no list to anyone before) and test 6.
// With the build: all 6 tests: 6 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const PAPAGO = { az_papago: { name: 'Papago Golf Club', data: PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 })) } };
const ACCOUNT = { HOPE25: { at: 200, name: 'Hope Foundation Scramble', course: 'Papago' }, SCR: { at: 100, name: 'Saturday Scramble', course: 'Papago' } };
const base = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: PAPAGO });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { panel: shown($('#app-my-events')), rows: Array.prototype.map.call(document.querySelectorAll('#app-my-events .my-event'), function (b) { return b.dataset.code; }),
    note: t('#app-my-events .my-events-note'), form: shown($('#t-name')), manage: shown($('#manage-screen')),
    writes: (window.__coldWrites || []).filter(function (w) { return /organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const go = async (db, query, auth, steps, pre) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, auth, settleMs: 3500, steps: steps || [READ], preScript: pre });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 the website, signed in: My events lists the account\'s events, newest first, above the create form', async () => {
    const db = Object.assign(base(), { organizers: { 'u-org': { tournaments: ACCOUNT } } });
    const [a] = await go(db, '', OWNER);
    assert.equal(a.form, true, 'positive: the create form is there too');
    assert.equal(a.panel, true, 'My events on the website');
    assert.deepEqual(a.rows, ['HOPE25', 'SCR'], 'newest first');
    assert.equal(a.note, 'Events you run, on any device you sign in on.');
    assert.deepEqual(a.writes, [], 'reading writes nothing');
});

test('2 the website, signed out: no My events', async () => {
    const db = Object.assign(base(), { organizers: { 'u-org': { tournaments: ACCOUNT } } });
    const [a] = await go(db, '', 'signed-out');
    assert.equal(a.form, true);
    assert.equal(a.panel, false);
});

test('3 the owner opens an event: one account pointer written; a golfer writes nothing', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    const [a] = await go(db, 'tourney=SCR', OWNER);
    assert.equal(a.manage, true, 'positive: the event opened');
    assert.equal(a.writes.length, 1, JSON.stringify(a.writes));
    assert.equal(a.writes[0].op, 'update');
    assert.equal(a.writes[0].path, 'organizers/u-org/tournaments/SCR');
    assert.equal(a.writes[0].value.name, 'Saturday Scramble');
    assert.equal(a.writes[0].value.course, 'Papago');
    assert.ok(Number.isFinite(a.writes[0].value.at));
    const golfer = F.scrambleDb({ ownerUid: 'u-org' });
    const [g] = await go(golfer, 'tourney=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(g.manage, true);
    assert.deepEqual(g.writes, [], 'a golfer writes no pointer');
});

test('4 create: the creating round trip also writes the account pointer', async () => {
    // The stand-in database lives in the document: every write is stored at
    // pagehide and replayed into the next document's stand-in, so the page can
    // move to the event it just created (as tournament_phase2_test.js does).
    const CARRY = `(function () { try {
        var saved = JSON.parse(sessionStorage.getItem('__mew') || '[]');
        saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
        window.__coldWrites = [];
        window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__mew', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
    } catch (e) {} })();`;
    const FILL = { expression: `(function () { document.getElementById('t-name').value = 'Hope Foundation Scramble'; var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); p.value = 'Al Lopez'; return 'filled'; })()` };
    const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__mew') || '[]') }); } catch (e) { return 'no storage'; } })()` };
    const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: base(), auth: OWNER, settleMs: 3000, preScript: CARRY,
        steps: [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 }, { tap: '#course-dropdown .custom-select-option' }, { sleep: 600 },
            FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, CARRIED] });
    assert.ok(r.ok, r.reason);
    const c = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    const ptr = c.carried.find((w) => /^organizers\/u-org\/tournaments\/[A-Z2-9]{6}$/.test(w.path));
    assert.ok(ptr, 'the account pointer: ' + JSON.stringify(c.carried.map((w) => w.path)));
    assert.equal(ptr.value.name, 'Hope Foundation Scramble');
    assert.equal(ptr.value.course, 'Papago Golf Club');
});

test('5 the app: this phone\'s event and the account\'s events make one list, no duplicate', async () => {
    const db = Object.assign(base(), { organizers: { 'u-org': { tournaments: ACCOUNT } } });
    const SEED = { expression: `(function () { localStorage.setItem('hp_my_tournaments', JSON.stringify([{ code: 'SCR', name: 'Saturday Scramble', at: 150 }, { code: 'LOCAL1', name: 'Only on this phone', at: 50 }])); location.reload(); return 'reloaded'; })()` };
    const [a] = await go(db, 'app=1', OWNER, [SEED, { sleep: 3000 }, READ]);
    assert.equal(a.panel, true);
    assert.deepEqual(a.rows, ['HOPE25', 'SCR', 'LOCAL1'], 'account + phone, once each, newest first');
    assert.equal(a.note, 'Events you run, on any device you sign in on, and events this phone opened.');
});

test('6 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
