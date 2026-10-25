// ============================================================================
// 069 C - THE OFFLINE GAME DAY START, IN REAL CHROME (393x852, the app's doors, a stand-in database).
// Every case of the 10 preview pictures (~/Desktop/claude-code-reports/069/offline-preview/):
//
//   01  Game Day > "Start a new round?" > Start with no signal: "📴 No signal right now / Start an offline
//       round?"; Not now: the old "No signal ... nothing was saved" words under Game Day, nothing written
//   02  Start offline: Round Setup on a local L- code, shown as "Offline round" with its line
//   03  Save, then 4 holes scored: nothing written to the database; "Offline round · 4 holes saved"
//   08  the app killed (a fresh page): Games & Bets "Resume offline round · Papago · thru 4"; Resume opens it
//   05  Share / Invite before the sync: "Invite golfers - 🔒 ... no round code yet"
//   06  another golfer opens a code that is not there yet: the refusal + "isn't here yet" line
//   04  signal back: ONE create-only transaction, the round + 4 holes under a real code; the page moves to
//       it: "✅ Signal back - your round is synced. Round code XXXXXX · 4 holes sent"; nothing under L-
//   07  two phones, the same group: "Two rounds for this group?" Keep mine / Open theirs; never merged
//   09  a code clash: "the first one drawn was already taken, drawing another", then synced elsewhere
// Stub database only, "Test" golfers only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'offline-round.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const NAMES = ['Test Ann', 'Test Bob', 'Test Cal', 'Test Dee'];
const DB = () => ({ events: {}, global_courses: { comm_links: { name: 'Papago Golf Club', data: CD } }, trips: {}, organizers: {}, tournaments: {} });
// NO SIGNAL while localStorage __test_off is '1': navigator.onLine false, and the code check times out.
const OFF = "(function(){ var off = function(){ try { return localStorage.getItem('__test_off') === '1'; } catch (e) { return false; } };"
    + " try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function () { return !off(); } }); } catch (e) {}"
    + " document.addEventListener('DOMContentLoaded', function () { var real = window.issueUniqueCode; if (typeof real !== 'function') return;"
    + "  window.issueUniqueCode = function () { if (!off()) return real.apply(this, arguments); return new Promise(function (_, no) { setTimeout(function () { var e = new Error('timed out'); e.code = 'timeout'; no(e); }, 300); }); }; });"
    + " ['hardpan:offline-syncing','hardpan:offline-clash','hardpan:offline-synced','hardpan:offline-sync-stopped'].forEach(function (n) { window.addEventListener(n, function (ev) { try { var a = JSON.parse(sessionStorage.getItem('__off_ev') || '[]'); a.push({ n: n, d: ev.detail }); sessionStorage.setItem('__off_ev', JSON.stringify(a)); } catch (e) {} }); });"
    + " })();";
// A KILLED APP ASKS NOTHING: the scorecard's "keep this page open" beforeunload guard is a browser
// dialog that would hold Chrome's navigation; the phone's app has no such dialog.
const NO_UNLOAD = "(function(){ var ae = EventTarget.prototype.addEventListener; EventTarget.prototype.addEventListener = function (t) { if (t === 'beforeunload') return; return ae.apply(this, arguments); };"
    + " try { Object.defineProperty(window, 'onbeforeunload', { configurable: true, get: function () { return null; }, set: function () {} }); } catch (e) {} })();";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(pre) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true;" + iapStub({ active: true }) + OFF + NO_UNLOAD + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('home.html', ''), 1200);
    await j.evaluate("localStorage.setItem('__test_off', '1')");
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2000);
    return j;
}
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(250); } return false; }
const sheet = (j) => j.evaluate("(function(){ var s = document.getElementById('ui-sheet'); return s && s.classList.contains('open') ? s.innerText.replace(/\\n+/g, '\\n') : null; })()");
const banner = (j) => j.evaluate("(function(){ var b = document.getElementById('hp-off-banner'); return b && b.style.display !== 'none' ? b.innerText.replace(/\\n+/g, '\\n') : null; })()");
const liveLocalWrites = (j) => j.evaluate("JSON.stringify((window.__WRITES || []).map(function (w) { return w.path; }).concat(window.__TX || []).filter(function (p) { return /(^|\\/)L-/.test(p); }))");
async function gameDayOffline(j) {
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    assert.ok(await j.tap('#ui-sheet-yes'), '"Start a new round?" - Start');
    assert.ok(await until(j, "!!(document.getElementById('ui-sheet') && document.getElementById('ui-sheet').classList.contains('open') && /No signal right now/.test(document.getElementById('ui-sheet').innerText))", 15000), 'the offline ask');
}
// 01 > 02 > 03: start offline, set up (course + 4 golfers), save, score `holes` holes.
async function offlineRound(j, holes) {
    await gameDayOffline(j);
    assert.ok(await j.tap('#ui-sheet-yes'), 'Start offline');
    assert.ok(await until(j, "/game=L-/.test(location.search) && typeof selectCourse === 'function'"));
    await sleep(1500);
    await j.evaluate("selectCourse('comm_links', 'Papago Golf Club')");
    await sleep(600);
    await j.evaluate("(function(){ var ta = document.getElementById('paste-players-textarea'); ta.value = " + JSON.stringify(NAMES.map((n, i) => n + ' ' + i * 4).join('\n')) + "; commitPastedPlayers(); })()");
    await sleep(400);
    await j.evaluate("saveSettings()");
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && /game=L-/.test(location.search) && typeof saveScore === 'function' && !!(currentData && currentData.players)"), 'Save goes to the scorecard');
    await sleep(1200);
    const L = await j.evaluate("new URLSearchParams(location.search).get('game')");
    for (let h = 1; h <= holes; h++) await j.evaluate("(function(){ currentData.players.forEach(function (p, i) { saveScore(p.id, " + h + ", 4 + ((i + " + h + ") % 3)); }); })()");
    await sleep(3000);
    return L;
}

test('01 Game Day, no signal: "Start an offline round?"; Not now gives the old words under Game Day, nothing written', { timeout: 90000 }, async () => {
    const j = await open();
    await gameDayOffline(j);
    assert.equal(await sheet(j), '📴 No signal right now\nStart an offline round?\nSet it up, score it and use the GPS on this phone. It gets its round code, and other golfers can join, when you have signal.\nNot now\nStart offline');
    assert.ok(await j.tap('#ui-sheet-no'));
    await sleep(600);
    const s = JSON.parse(await j.evaluate("JSON.stringify({ at: location.search, note: (document.querySelector('.ui-note') || {}).innerText || '', after: !!(document.querySelector('.ui-note') && document.querySelector('.ui-note').previousElementSibling === document.getElementById('gl-gameday')), writes: (window.__WRITES || []).length })"));
    assert.equal(s.at, '?start=lobby');
    assert.equal(s.note, '📴 No signal — try again when you have a connection.\nThe new round was not started; nothing was saved.');
    assert.equal(s.after, true, 'under the Game Day card, as before');
    assert.equal(s.writes, 0);
});

test('02 03 08 05 06 04: offline start, 4 holes, killed + Resume, Invite locked, a code not there yet, then signal back and synced', { timeout: 240000 }, async () => {
    const j = await open();
    await gameDayOffline(j);
    assert.ok(await j.tap('#ui-sheet-yes'));
    assert.ok(await until(j, "/game=L-/.test(location.search) && !!document.getElementById('hp-off-setup-note')"));
    // 02
    const setup = JSON.parse(await j.evaluate("JSON.stringify({ code: document.getElementById('display-room-code').textContent, label: document.getElementById('display-room-code').previousElementSibling.textContent, note: document.getElementById('hp-off-setup-note').textContent, game: new URLSearchParams(location.search).get('game') })"));
    assert.match(setup.game, /^L-[A-Z2-9]{10}$/);
    assert.deepEqual([setup.code, setup.label, setup.note], ['Offline round', 'Game code', '📴 Saved on this phone. Your round code comes when you have signal, then you can share it.']);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 1500);
    // (a fresh round: the whole path again, then 4 holes)
    const L = await offlineRound(j, 4);
    // 03
    assert.equal(await banner(j), '📴 Offline round · 4 holes saved on this phone · nothing lost if the app closes');
    assert.equal(await liveLocalWrites(j), '[]', 'nothing under the local code reached the database');
    assert.equal(await j.evaluate("Object.keys(window.__DB.events || {}).length"), 0, 'no round on the server yet');
    // 05
    await j.evaluate("HardPanDoors.openShare()");
    await sleep(400);
    assert.equal(await sheet(j), 'Invite golfers\n🔒 This is an offline round, so it has no round code yet.\nOther golfers can join once you have signal and the round is synced. Until then, you keep score for the group on this phone.\nOK\nRemind me');
    await j.tap('#ui-sheet-no');
    // 08: killed - a fresh page; Games & Bets offers it, with no signal.
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2500);
    assert.ok(await until(j, "getComputedStyle(document.getElementById('gl-resume')).display !== 'none' && /offline/.test(document.getElementById('gl-resume').innerText)"));
    const res = JSON.parse(await j.evaluate("JSON.stringify({ r: document.getElementById('gl-resume').innerText, n: (document.getElementById('hp-off-resume-note') || {}).textContent })"));
    assert.equal(res.r, '▶︎ Resume offline round · Papago · thru 4');
    assert.equal(res.n, '📴 The app was closed with no signal. The round and its 4 holes were kept on this phone; it syncs when signal returns.');
    // 06: another golfer's code that is not on the server (signal on for the check).
    await j.evaluate("localStorage.removeItem('__test_off')");
    await j.tap('#gl-code'); await sleep(300);
    await j.evaluate("(function(){ document.getElementById('join-code-input').value = 'K7QX2M'; })()");
    await j.tap('#open-round-card .join-code-btn');
    assert.ok(await until(j, "!!document.getElementById('hp-off-notyet')", 10000));
    assert.equal(await j.evaluate("document.getElementById('hp-off-notyet').textContent"), '⏳ Round K7QX2M isn’t here yet. If it was started offline, it appears once that phone has signal. Try again in a minute.');
    assert.match(await j.evaluate("document.getElementById('join-code-refusal').textContent"), /No round with the code K7QX2M/);
    await j.evaluate("localStorage.setItem('__test_off', '1')");
    // Resume opens the round, still offline, 4 holes.
    await j.tap('#gl-resume');
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && !!document.getElementById('hp-off-banner')"));
    assert.equal(await j.evaluate("new URLSearchParams(location.search).get('game')"), L);
    // 04: signal back.
    await j.evaluate("sessionStorage.removeItem('__off_ev'); localStorage.removeItem('__test_off'); window.dispatchEvent(new Event('online'))");
    assert.ok(await until(j, "!/game=L-/.test(location.search) && !!document.getElementById('hp-off-banner') && /synced/.test(document.getElementById('hp-off-banner').innerText)", 40000), 'moved to the real code, synced');
    const to = await j.evaluate("new URLSearchParams(location.search).get('game')");
    assert.match(to, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(await banner(j), '✅ Signal back - your round is synced.\nRound code ' + to + ' · 4 holes sent\nShare code\nOK');
    const db = await j.harvest();
    const r = db.events[to];
    assert.equal(r.players.length, 4);
    assert.equal(Object.keys(r.scores).length, 16, 'the round and its 4 holes, in one record');
    assert.equal(r.offlineStart.from, L);
    assert.ok(r.ownerUid, 'created by its organizer');
    assert.equal(Object.keys(db.events).length, 1);
    assert.equal(await liveLocalWrites(j), '[]', 'never written under the local code');
    assert.deepEqual(JSON.parse(await j.evaluate("JSON.stringify(window.__TX || [])")).filter((p) => /^events\//.test(p)).length <= 1, true);
    const ev = JSON.parse(await j.evaluate("sessionStorage.getItem('__off_ev') || '[]'")).map((e) => e.n);
    assert.ok(ev.includes('hardpan:offline-syncing') || ev.length === 0, JSON.stringify(ev));
    assert.equal(await j.evaluate("localStorage.getItem('lastRoomCode')"), to, 'Resume follows the round');
    // OK closes it.
    await j.tap('[data-hp-off-ok]'); await sleep(200);
    assert.equal(await banner(j), null);
});

test('07 two phones, the same group: "Two rounds for this group?" - Keep mine / Open theirs, never merged', { timeout: 200000 }, async () => {
    const j = await open();
    const L = await offlineRound(j, 2);
    // The other phone synced first: its round is on the server under the group's code.
    const theirs = JSON.parse(await j.evaluate("(function(){ var op = JSON.parse(localStorage.getItem('golfapp_wq_v1')).filter(function (o) { return o.coalesceKey === 'round-setup:' + new URLSearchParams(location.search).get('game'); })[0];"
        + " var k = HardPanOfflineRound.groupKey(op.value, op.ts), c = HardPanOfflineRound.keyCode(k);"
        + " var sc = {}; sc['p' + op.value.players[0].id + '_h1'] = 5;"
        + " window.__DB.events = window.__DB.events || {}; window.__DB.events[c] = { players: op.value.players, courseName: op.value.courseName, ownerUid: 'uid-bob', scores: sc, offlineStart: { from: 'L-THEIRPHONE', key: k, by: 'Test Bob', at: op.ts } };"
        + " window.__journeyPersist(); return JSON.stringify({ code: c, scores: window.__DB.events[c].scores }); })()"));
    await j.evaluate("localStorage.removeItem('__test_off'); window.dispatchEvent(new Event('online'))");
    assert.ok(await until(j, "!/game=L-/.test(location.search) && !!(document.getElementById('ui-sheet') && document.getElementById('ui-sheet').classList.contains('open'))", 40000));
    const mine = await j.evaluate("new URLSearchParams(location.search).get('game')");
    assert.notEqual(mine, theirs.code, 'two rounds');
    assert.equal(await sheet(j), 'Two rounds for this group?\nTest Bob’s phone also started a round today with Test Ann, Test Cal and Test Dee: ' + theirs.code + '.\nYours synced as ' + mine + '. Scores are never merged by themselves.\nKeep mine\nOpen ' + theirs.code);
    const db = await j.harvest();
    assert.deepEqual(db.events[theirs.code].scores, theirs.scores, 'their round is untouched');
    assert.equal(Object.keys(db.events[mine].scores).length, 8, 'mine has my 2 holes only');
    assert.equal(db.events[mine].offlineStart.from, L);
    await j.tap('#ui-sheet-yes');
    assert.ok(await until(j, "new URLSearchParams(location.search).get('game') === " + JSON.stringify(theirs.code)), 'Open theirs');
});

test('09 a code clash: "drawing another", then synced under a free code; the other round untouched', { timeout: 200000 }, async () => {
    const j = await open();
    await offlineRound(j, 1);
    const clash = JSON.parse(await j.evaluate("(function(){ var op = JSON.parse(localStorage.getItem('golfapp_wq_v1')).filter(function (o) { return /^round-setup:L-/.test(o.coalesceKey); })[0];"
        + " var c = HardPanOfflineRound.keyCode(HardPanOfflineRound.groupKey(op.value, op.ts)); window.__DB.events = window.__DB.events || {};"
        + " window.__DB.events[c] = { players: [{ id: 1, name: 'Someone Else' }], ownerUid: 'uid-x', courseName: 'Elsewhere' }; window.__journeyPersist();"
        + " window.addEventListener('hardpan:offline-clash', function () { window.__TX_HANG = true; }); return JSON.stringify({ code: c }); })()"));
    await j.evaluate("localStorage.removeItem('__test_off'); window.dispatchEvent(new Event('online'))");
    assert.ok(await until(j, "/drawing another/.test((document.getElementById('hp-off-banner') || {}).innerText || '')", 20000));
    assert.equal(await banner(j), '⏳ Getting your round code… the first one drawn was already taken, drawing another. Your scores are safe on this phone.');
    // The draw that was out lands; the next try (every 20 s) finds it is mine and moves there.
    await j.evaluate("window.__TX_HANG = false; window.dispatchEvent(new Event('online'))");
    assert.ok(await until(j, "!/game=L-/.test(location.search) && /synced/.test((document.getElementById('hp-off-banner') || {}).innerText || '')", 60000));
    const to = await j.evaluate("new URLSearchParams(location.search).get('game')");
    assert.notEqual(to, clash.code);
    const db = await j.harvest();
    assert.deepEqual(db.events[clash.code], { players: [{ id: 1, name: 'Someone Else' }], ownerUid: 'uid-x', courseName: 'Elsewhere' }, 'the other round untouched');
    assert.equal(Object.keys(db.events[to].scores).length, 4);
});
