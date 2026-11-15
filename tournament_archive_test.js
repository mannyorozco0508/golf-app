// ARCHIVE AFTER THE EVENT (DE-C; Manny 2026-11-15 4:06 AM "B then C", relayed
// as ADVISOR-20261115-0407-OK-hide-then-archive; the picked sheet
// mockups-delete/DE-delete-hide-ABC.html, column C). Reached the way the
// organizer and the golfer reach it: arrive cold (tools/lib/cold-arrival.js) at
// 390x844, seed this phone's list with a step that reloads, then REAL taps on the
// page's own buttons; a second record snapshot is DELIVERED where the page would
// receive one (the stand-in re-fires nothing on a write). The checks read
// innerText, localStorage and the recorded writes. No page function is called.
//
//  1 Setup, "Event day and after": a NEW event (autoArchive true on the record)
//    arrives with the switch on; an event made before this build (no key) with
//    it off; Archive now shown, Restore not, the amber refunds line present
//  2 Archive now: writes tournaments/<code>/archivedAt (a number), the pointer
//    flag {archivedAt} by update, this phone's entry; after the next snapshot the
//    card reads Archived, Restore replaces Archive now, the console title carries
//    Final, and the owner's Registration section is still there (the Desk is not
//    gated); Restore writes null to all three
//  3 Home: an archived event leaves My events and sits under "Past events (1)"
//    with its date, Final, a Recap link (?tourney=CODE&recap=1) and Restore;
//    Restore writes null to the record and both pointer sources, the row is back
//  4 the automatic archive: the OWNER opens Home, autoArchive true, the event's
//    date one day past: archivedAt written once, the row moves to Past events.
//    NOT on the day of; NOT with autoArchive absent; NOT for a golfer who has the
//    event on this phone; NOT when no date is known
//  5 the public board of an archived event shows Final beside the title; an
//    event that is not archived reads exactly as before
//  6 the signup page of an archived event says signups are closed and shows no
//    form; an event that is not archived shows the form
//  7 create: a new event's record carries autoArchive true
//
// WHAT LIVE DOES TODAY. tournaments/<code>/archivedAt and autoArchive are owner
// writes the live rules allow (tournaments/$code has no $other rule). The pointer
// flag organizers/<uid>/tournaments/<code>/archivedAt is the My-events rules
// CANDIDATE (tools/my-events-rules-candidate.js), refused live until published;
// Home also reads the record's archivedAt, so an archive made on one device
// still shows as Past on another once the record is read.
//
// Baseline against the merged main dddb9565 (before the build), the FINAL file:
// all 7 tests: 0 PASS / 7 FAIL. With the build: all 7 tests: 7 PASS / 0 FAIL.
// Negative controls (each restored by sha from a saved copy):
//   the date check fires on the day of (< 0 for < 1)     -> test 4 red (6/7)
//   writeArchived writes the record only, no flags         -> test 2 red (6/7)
//   the signup gate drops archivedAt                       -> test 6 red (6/7)
//   markFinal not called on the snapshot                   -> test 5 red (6/7)
//   the create payload drops autoArchive                   -> test 7 red (6/7)
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const PAPAGO = { az_papago: { name: 'Papago Golf Club', data: PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 })) } };
const base = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: PAPAGO });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const PHONE = [{ code: 'SCR', name: 'Saturday Scramble', at: 150 }, { code: 'LOCAL1', name: 'Only on this phone', at: 50 }];
const seed = (list) => ({ expression: `(function () { localStorage.setItem('hp_my_tournaments', ${JSON.stringify(JSON.stringify(list))}); location.reload(); return 'reloaded'; })()` });
// An owned scramble with the given extra keys on the record, the account pointer alongside.
const owned = (extra, ptr) => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    Object.assign(db.tournaments.SCR, extra || {});
    db.organizers = { 'u-org': { tournaments: { SCR: Object.assign({ at: 150, name: 'Saturday Scramble', course: 'Papago' }, ptr || {}) } } };
    Object.assign(db, { global_courses: PAPAGO });
    return db;
};
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var all = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var local = []; try { local = JSON.parse(localStorage.getItem('hp_my_tournaments') || '[]'); } catch (e) {}
  var sw = $('#auto-archive-switch');
  return { manage: shown($('#manage-screen')), setupScreen: shown($('#setup-screen')),
    card: shown($('#event-after-block')), cardText: t('#event-after-block'), switchOn: sw ? sw.checked : null,
    archiveBtn: shown($('#archive-now-btn')), restoreBtn: shown($('#archive-restore-btn')), state: t('#event-after-state'),
    regSection: shown($('#registration-section')),
    title: t('#manage-t-name'), lbTitle: t('#lb-t-name'), finals: all('.ev-final').filter(shown).length,
    rows: all('#app-my-events .my-event').map(function (b) { return b.dataset.code; }),
    pastToggle: t('#past-events-toggle'), past: all('#app-my-events .me-past').filter(shown).map(function (d) { return { code: d.dataset.code, text: (d.innerText || '').replace(/\\s+/g, ' ').trim(), recap: (d.querySelector('.me-recap') || {}).getAttribute ? d.querySelector('.me-recap').getAttribute('href') : null, restore: shown(d.querySelector('.me-restore')) }; }),
    hiddenToggle: t('#hidden-events-toggle'),
    regForm: shown($('#reg-form')), regClosed: shown($('#reg-closed')) ? t('#reg-closed') : null,
    local: local,
    writes: (window.__coldWrites || []).filter(function (w) { return /organizers\\/|archivedAt|autoArchive/.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const go = async (db, query, auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, auth, settleMs: 3000, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const localOf = (a, code) => a.local.find((e) => e.code === code);
const recordWrites = (a) => a.writes.filter((w) => w.path === 'tournaments/SCR/archivedAt');
const ptrWrites = (a) => a.writes.filter((w) => w.path === 'organizers/u-org/tournaments/SCR');

test('1 Setup card: a new event arrives with the switch on, an older event with it off; Archive now, the refunds line', async () => {
    const [n] = await go(owned({ autoArchive: true }), 'tourney=SCR&app=1', OWNER);
    assert.equal(n.manage, true, 'positive: the event opened');
    assert.equal(n.card, true, 'the card is on Setup');
    assert.equal(n.switchOn, true, 'a new event: on');
    assert.ok(/Event day and after/.test(n.cardText), n.cardText);
    assert.ok(/Archive the day after the last round/.test(n.cardText));
    assert.ok(/Moves to Past events, closes signups, keeps the board as Final\./.test(n.cardText));
    assert.ok(/Refunds still work from the Desk on an archived event\./.test(n.cardText));
    assert.equal(n.archiveBtn, true); assert.equal(n.restoreBtn, false);
    assert.equal(n.finals, 0, 'no Final on a live event');
    assert.deepEqual(n.writes.filter((w) => /archivedAt|autoArchive/.test(w.path)), [], 'arriving writes nothing of its own');
    const [o] = await go(owned({}), 'tourney=SCR&app=1', OWNER);
    assert.equal(o.card, true);
    assert.equal(o.switchOn, false, 'an event made before this build: off');
});

test('2 Archive now: the record, the pointer and this phone; the card, Final and the Desk after the snapshot; Restore', async () => {
    const db = owned({ autoArchive: true });
    const archivedRecord = Object.assign({}, db.tournaments.SCR, { archivedAt: 1700000000000 });
    const [before, a, after, r] = await go(db, 'tourney=SCR&app=1', OWNER, [READ,
        { tap: '#archive-now-btn' }, { sleep: 400 }, READ,
        { deliver: { path: 'tournaments/SCR', value: archivedRecord } }, { sleep: 400 }, READ,
        { tap: '#archive-restore-btn' }, { sleep: 400 }, READ]);
    assert.equal(before.archiveBtn, true, 'positive: Archive now is there');
    const rec = recordWrites(a);
    assert.equal(rec.length, 1, JSON.stringify(a.writes));
    assert.equal(rec[0].op, 'set'); assert.ok(Number.isFinite(rec[0].value) && rec[0].value > 1.7e12, 'archivedAt = now');
    const p = ptrWrites(a).filter((w) => 'archivedAt' in (w.value || {}));
    assert.equal(p.length, 1, JSON.stringify(ptrWrites(a)));
    assert.equal(p[0].op, 'update'); assert.equal(p[0].value.archivedAt, rec[0].value);
    assert.equal(localOf(a, 'SCR').archivedAt, rec[0].value, 'this phone\'s entry');
    assert.equal(after.restoreBtn, true, 'after the snapshot: Restore');
    assert.equal(after.archiveBtn, false);
    assert.match(after.state, /^Archived Nov 14, 2023\./);
    assert.ok(/Final$/.test(after.title), 'the console title: ' + after.title);
    assert.equal(after.regSection, true, 'the owner\'s Registration section stays: the Desk is not gated');
    const rr = recordWrites(r);
    assert.equal(rr.length, 2); assert.equal(rr[1].value, null, 'Restore: the record');
    const rp = ptrWrites(r).filter((w) => 'archivedAt' in (w.value || {}));
    assert.equal(rp.length, 2); assert.equal(rp[1].value.archivedAt, null, 'Restore: the pointer');
    assert.equal(localOf(r, 'SCR').archivedAt, undefined, 'Restore: this phone');
});

test('3 Home: Past events (1) with the date, Final, Recap and Restore; Restore brings it back', async () => {
    const db = owned({ eventDate: '2026-10-18', archivedAt: 1700000000000 }, { archivedAt: 1700000000000 });
    const [a, b] = await go(db, 'app=1', OWNER, [seed(PHONE), { sleep: 3500 }, READ,
        { tap: '.me-restore[data-code="SCR"]' }, { sleep: 500 }, READ]);
    assert.deepEqual(a.rows, ['LOCAL1'], 'SCR is not in My events');
    assert.equal(a.pastToggle, 'PAST EVENTS (1) ▾');
    assert.equal(a.past.length, 1);
    assert.equal(a.past[0].code, 'SCR');
    assert.match(a.past[0].text, /Saturday Scramble SCR · Oct 18 · Final Recap Restore/);
    assert.equal(a.past[0].recap, 'tournament.html?tourney=SCR&recap=1&app=1');
    assert.equal(a.past[0].restore, true);
    assert.equal(a.hiddenToggle, null, 'not under Hidden events');
    assert.deepEqual(b.rows, ['SCR', 'LOCAL1'], 'Restore: back in the list');
    assert.equal(b.pastToggle, null);
    const rr = recordWrites(b); assert.equal(rr.length, 1); assert.equal(rr[0].value, null, 'the record cleared');
    const rp = ptrWrites(b); assert.equal(rp.length, 1); assert.deepEqual(rp[0].value, { archivedAt: null }, 'the pointer cleared');
    assert.equal(localOf(b, 'SCR').archivedAt, undefined, 'this phone cleared');
});

test('4 the automatic archive: the owner on Home, autoArchive on, the date one day past; and the four cases it must not fire', async () => {
    const steps = [seed(PHONE), { sleep: 3500 }, READ];
    const [y] = await go(owned({ autoArchive: true, eventDate: daysAgo(1) }), 'app=1', OWNER, steps);
    const rec = recordWrites(y);
    assert.equal(rec.length, 1, 'one write: ' + JSON.stringify(y.writes));
    assert.equal(rec[0].op, 'set'); assert.ok(rec[0].value > 1.7e12);
    assert.equal(ptrWrites(y).filter((w) => w.value && w.value.archivedAt === rec[0].value).length, 1, 'the pointer flag');
    assert.equal(localOf(y, 'SCR').archivedAt, rec[0].value, 'this phone\'s flag');
    assert.deepEqual(y.rows, ['LOCAL1'], 'moved off My events');
    assert.equal(y.pastToggle, 'PAST EVENTS (1) ▾');
    const [today] = await go(owned({ autoArchive: true, eventDate: daysAgo(0) }), 'app=1', OWNER, steps);
    assert.deepEqual(recordWrites(today), [], 'not on the day of');
    assert.deepEqual(today.rows, ['SCR', 'LOCAL1']);
    const [off] = await go(owned({ eventDate: daysAgo(1) }), 'app=1', OWNER, steps);
    assert.deepEqual(recordWrites(off), [], 'not with the switch absent (an older event)');
    const golfer = owned({ autoArchive: true, eventDate: daysAgo(1) }); delete golfer.organizers;
    const [g] = await go(golfer, 'app=1', 'anonymous', steps);
    assert.deepEqual(g.rows, ['SCR', 'LOCAL1'], 'positive: the golfer\'s phone lists it');
    assert.deepEqual(g.writes, [], 'a golfer archives nothing');
    const [nodate] = await go(owned({ autoArchive: true }), 'app=1', OWNER, steps);
    assert.deepEqual(recordWrites(nodate), [], 'no date known: never');
});

test('5 the public board of an archived event shows Final beside the title; a live one reads as before', async () => {
    const [a] = await go(owned({ archivedAt: 1700000000000 }), 'tourney=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(a.manage, true, 'positive: the board opened');
    assert.equal(a.lbTitle, '🏆 Saturday Scramble Final', 'the board title');
    assert.ok(a.finals >= 1, 'a Final mark is on screen');
    const [b] = await go(owned({}), 'tourney=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(b.lbTitle, '🏆 Saturday Scramble', 'unchanged when not archived');
    assert.equal(b.finals, 0);
});

test('6 the signup page of an archived event: signups are closed, no form; a live one shows the form', async () => {
    const [a] = await go(owned({ archivedAt: 1700000000000 }), 'register=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(a.regForm, false, 'no form');
    assert.equal(a.regClosed, 'Signups for this event are closed. The event is over; its results are on the board.');
    const [b] = await go(owned({}), 'register=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(b.regForm, true, 'positive: the live event takes signups');
    assert.equal(b.regClosed, null);
});

test('7 create: a new event\'s record carries autoArchive true', async () => {
    // As tournament_my_events_test.js test 4: writes are kept across the page's
    // own move to the new event, and read back from sessionStorage.
    const CARRY = `(function () { try {
        var saved = JSON.parse(sessionStorage.getItem('__dea') || '[]');
        saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
        window.__coldWrites = [];
        window.addEventListener('pagehide', function () { try { sessionStorage.setItem('__dea', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {} });
    } catch (e) {} })();`;
    const FILL = { expression: `(function () { document.getElementById('t-name').value = 'Hope Foundation Scramble'; var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); p.value = 'Al Lopez'; return 'filled'; })()` };
    const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__dea') || '[]') }); } catch (e) { return 'no storage'; } })()` };
    const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: base(), auth: OWNER, settleMs: 3000, preScript: CARRY,
        steps: [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 }, { tap: '#course-dropdown .custom-select-option' }, { sleep: 600 },
            FILL, { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, CARRIED] });
    assert.ok(r.ok, r.reason);
    const c = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    // The create is one root multi-path update: its keys are paths.
    let rec = null;
    c.carried.forEach((w) => {
        if (w.path === '' && w.value && typeof w.value === 'object') Object.keys(w.value).forEach((k) => { if (/^tournaments\/[A-Z2-9]{6}$/.test(k)) rec = w.value[k]; });
        else if (/^tournaments\/[A-Z2-9]{6}$/.test(w.path) && w.value && w.value.name) rec = w.value;
    });
    assert.ok(rec && rec.name === 'Hope Foundation Scramble', 'the record: ' + JSON.stringify(c.carried.map((w) => w.path)));
    assert.equal(rec.autoArchive, true);
    assert.equal(rec.archivedAt, undefined, 'not archived at birth');
});
