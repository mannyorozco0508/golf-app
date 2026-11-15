// HIDE FROM HOME (DE-B; Manny 2026-11-15 4:06 AM "B then C", relayed as
// ADVISOR-20261115-0407-OK-hide-then-archive; the picked sheet
// mockups-delete/DE-delete-hide-ABC.html, column B). Reached the way the
// organizer reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844 at
// tournament.html, seed this phone's list with a step that reloads, then REAL
// taps on the page's own buttons. The checks read innerText, localStorage and
// the recorded writes. No page function is called.
//
//  1 the app, two events on this phone: both rows show, each has a ••• (More)
//  2 tap ••• then "Hide from Home" on one, signed in: it leaves the list,
//    "Hidden events (1)" appears, the one-line note names it with Undo, this
//    phone's entry holds hidden:true, and the account write
//    organizers/<uid>/tournaments/<code> {hidden:true} is recorded (update)
//  3 both sources say hidden; tap Hidden events, then Show: the row is back,
//    this phone's flag is gone, the account write {hidden:null} is recorded
//  4 the owner opens a hidden event (?tourney=CODE, signed in, the record fires):
//    the pointer write carries no hidden key (update keeps the account flag) and
//    this phone's entry keeps hidden:true (rememberMyEvent carries it across)
//  5 the website, signed out: no list, nothing written (unchanged)
//  6 the default state: two events, nothing hidden, no menu open, no Hidden list
//  7 EITHER source hides: the account flag alone hides a row this phone has
//    plain; this phone's flag alone hides a row the account has plain
//
// WHAT LIVE DOES TODAY. organizers/<uid>/tournaments is a rules CANDIDATE
// (tools/my-events-rules-candidate.js), not published. Until it is, the account
// half of Hide is refused and caught, and only THIS DEVICE's list hides; the
// candidate's emulator test (tournament_my_events_rules_emulator_test.js) proves
// the flag lands once it is published. The stand-in here accepts every write,
// so what is proved is that the page MAKES the write, not that live takes it.
//
// Baseline against the merged main dddb9565 (before the build), the FINAL file:
// all 7 tests: 2 PASS / 5 FAIL. The 2 are test 5 (the signed-out website never
// had a list) and test 6 (no menu, no Hidden list, two plain rows - true before
// too). With the build: all 7 tests: 7 PASS / 0 FAIL.
// Negative controls (each restored by sha from a saved copy):
//   rememberMyEvent drops the carry-over            -> test 4 red (6/7)
//   hideMyEvent writes only localStorage             -> test 2 red (6/7)
//   showMyEvent clears only localStorage             -> test 3 red (6/7)
//   showMyEvent clears only the account              -> test 3 red (6/7)
//   myEventsList takes the first source's flag only  -> test 7 red (6/7)
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const PAPAGO = { az_papago: { name: 'Papago Golf Club', data: PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 })) } };
const base = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: PAPAGO });
const withAccount = (ptrs) => Object.assign(base(), { organizers: { 'u-org': { tournaments: ptrs } } });
const PHONE = [{ code: 'SCR', name: 'Saturday Scramble', at: 150 }, { code: 'LOCAL1', name: 'Only on this phone', at: 50 }];
const seed = (list) => ({ expression: `(function () { localStorage.setItem('hp_my_tournaments', ${JSON.stringify(JSON.stringify(list))}); location.reload(); return 'reloaded'; })()` });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var all = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var local = []; try { local = JSON.parse(localStorage.getItem('hp_my_tournaments') || '[]'); } catch (e) {}
  return { panel: shown($('#app-my-events')),
    rows: all('#app-my-events .my-event').map(function (b) { return b.dataset.code; }),
    more: all('#app-my-events .me-more').filter(shown).map(function (b) { return { code: b.dataset.code, label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded') }; }),
    menu: all('#app-my-events .me-menu').filter(shown).map(function (m) { return (m.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    hiddenToggle: t('#hidden-events-toggle'), hiddenRows: all('#app-my-events .me-hidden').filter(shown).map(function (d) { return d.dataset.code; }),
    line: t('#my-events-line'), note: t('#app-my-events .my-events-note'), manage: shown($('#manage-screen')),
    local: local,
    writes: (window.__coldWrites || []).filter(function (w) { return /organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const go = async (db, query, auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, auth, settleMs: 3000, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const localOf = (a, code) => a.local.find((e) => e.code === code);
const ptrWrites = (a, code) => a.writes.filter((w) => w.path === 'organizers/u-org/tournaments/' + code);

test('1 the app, two events on this phone: both rows, each with a ••• (More)', async () => {
    const [a] = await go(base(), 'app=1', 'anonymous', [seed(PHONE), { sleep: 3000 }, READ]);
    assert.equal(a.panel, true);
    assert.deepEqual(a.rows, ['SCR', 'LOCAL1'], 'positive: both rows');
    assert.deepEqual(a.more.map((m) => m.code), ['SCR', 'LOCAL1'], 'a ••• per row');
    assert.ok(a.more.every((m) => m.label === 'More' && m.expanded === 'false'));
    assert.equal(a.note, 'Events this phone created or opened as the organizer.', 'the note keeps its sentence');
});

test('2 tap ••• then Hide from Home: the row leaves, Hidden events (1), both sources flagged', async () => {
    const db = withAccount({ SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago' } });
    const [before, a] = await go(db, 'app=1', OWNER, [seed(PHONE), { sleep: 3000 }, READ,
        { tap: '.me-more[data-code="SCR"]' }, { sleep: 300 }, { tap: '.me-menu .me-hide' }, { sleep: 500 }, READ]);
    assert.deepEqual(before.rows, ['SCR', 'LOCAL1'], 'positive: both rows before the tap');
    assert.deepEqual(a.rows, ['LOCAL1'], 'SCR left the list');
    assert.equal(a.hiddenToggle, 'HIDDEN EVENTS (1) ▸');
    assert.equal(a.line, 'Saturday Scramble is hidden. Undo');
    assert.equal(localOf(a, 'SCR').hidden, true, 'this phone: hidden:true');
    assert.equal(localOf(a, 'LOCAL1').hidden, undefined, 'the other entry untouched');
    const w = ptrWrites(a, 'SCR');
    assert.equal(w.length, 1, JSON.stringify(a.writes));
    assert.equal(w[0].op, 'update', 'update, not set: at/name/course stay');
    assert.deepEqual(w[0].value, { hidden: true });
    assert.deepEqual(a.menu, [], 'the menu closed');
    assert.equal(a.note, 'Events you run, on any device you sign in on, and events this phone opened.', 'the note keeps its sentence');
});

test('3 both sources hidden; Hidden events, then Show: back in the list, both flags cleared', async () => {
    const db = withAccount({ SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago', hidden: true } });
    const phone = [Object.assign({}, PHONE[0], { hidden: true }), PHONE[1]];
    const [before, a] = await go(db, 'app=1', OWNER, [seed(phone), { sleep: 3000 }, READ,
        { tap: '#hidden-events-toggle' }, { sleep: 300 }, { tap: '.me-show[data-code="SCR"]' }, { sleep: 500 }, READ]);
    assert.deepEqual(before.rows, ['LOCAL1'], 'positive: SCR hidden on arrival');
    assert.equal(before.hiddenToggle, 'HIDDEN EVENTS (1) ▸');
    assert.deepEqual(a.rows, ['SCR', 'LOCAL1'], 'SCR is back, newest first');
    assert.equal(a.hiddenToggle, null, 'no Hidden events list left');
    assert.equal(localOf(a, 'SCR').hidden, undefined, 'this phone: the flag is gone');
    const w = ptrWrites(a, 'SCR');
    assert.equal(w.length, 1, JSON.stringify(a.writes));
    assert.equal(w[0].op, 'update');
    assert.deepEqual(w[0].value, { hidden: null }, 'the account flag removed');
    assert.equal(a.line, null, 'no note after a Show');
});

test('4 the owner opens a hidden event: the pointer write keeps the account flag, this phone keeps hidden', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    db.organizers = { 'u-org': { tournaments: { SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago', hidden: true } } } };
    const phone = [Object.assign({}, PHONE[0], { hidden: true }), PHONE[1]];
    const [a] = await go(db, 'tourney=SCR&app=1', OWNER, [seed(phone), { sleep: 3500 }, READ]);
    assert.equal(a.manage, true, 'positive: the event opened');
    const w = ptrWrites(a, 'SCR');
    assert.equal(w.length, 1, JSON.stringify(a.writes));
    assert.equal(w[0].op, 'update', 'update: the account flag is not overwritten');
    assert.equal(w[0].value.name, 'Saturday Scramble', 'positive: the pointer was written');
    assert.ok(!('hidden' in w[0].value), 'the pointer write carries no hidden key');
    const l = localOf(a, 'SCR');
    assert.ok(l && l.at > 150, 'positive: this phone\'s entry was rebuilt (at moved)');
    assert.equal(l.hidden, true, 'and kept hidden:true');
});

test('5 the website, signed out: no list, nothing written', async () => {
    const phone = [Object.assign({}, PHONE[0], { hidden: true }), PHONE[1]];
    const [a] = await go(base(), '', 'signed-out', [seed(phone), { sleep: 3000 }, READ]);
    assert.equal(a.panel, false);
    assert.deepEqual(a.writes, []);
});

test('6 the default state: nothing hidden, no menu open, no Hidden events list', async () => {
    const db = withAccount({ SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago' } });
    const [a] = await go(db, 'app=1', OWNER, [seed(PHONE), { sleep: 3000 }, READ]);
    assert.deepEqual(a.rows, ['SCR', 'LOCAL1'], 'positive: both rows');
    assert.deepEqual(a.menu, [], 'no menu open');
    assert.equal(a.hiddenToggle, null, 'no Hidden events list');
    assert.deepEqual(a.hiddenRows, []);
    assert.equal(a.line, null);
    assert.ok(a.local.every((e) => e.hidden === undefined), 'nothing flagged');
});

test('7 either source hides: the account flag alone, and this phone\'s flag alone', async () => {
    const acct = withAccount({ SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago', hidden: true } });
    const [a] = await go(acct, 'app=1', OWNER, [seed(PHONE), { sleep: 3000 }, READ]);
    assert.equal(localOf(a, 'SCR').hidden, undefined, 'positive: this phone has SCR plain');
    assert.deepEqual(a.rows, ['LOCAL1'], 'the account flag hides it');
    assert.deepEqual(a.hiddenRows, [], 'collapsed until tapped');
    assert.equal(a.hiddenToggle, 'HIDDEN EVENTS (1) ▸');
    const plain = withAccount({ SCR: { at: 150, name: 'Saturday Scramble', course: 'Papago' } });
    const phone = [Object.assign({}, PHONE[0], { hidden: true }), PHONE[1]];
    const [b] = await go(plain, 'app=1', OWNER, [seed(phone), { sleep: 3000 }, READ]);
    assert.deepEqual(b.rows, ['LOCAL1'], 'this phone\'s flag hides it');
    assert.equal(b.hiddenToggle, 'HIDDEN EVENTS (1) ▸');
});
