// ============================================================================
// 069 A - "START A NEW ROUND?" BEFORE A ROUND STARTS FROM A GAMES & BETS CARD. Real Chrome, 393x852.
//
// Manny, Oct 25: "Game Day: yes, ask 'Start a new round?' before starting from the card." The big Game
// Day card is about a fifth of the screen (polish #29), and a touch on it started a new round at once.
// Same as last week starts a new round the same way (a new code, the copier), so it asks too.
//
//   1  Game Day tapped: the sheet "Start a new round?" with Not now / Start, and NOTHING started yet
//      (no code asked for, no read, no write, the page unchanged)
//   2  Not now: the sheet goes, nothing happens and nothing is saved (no write, localStorage the same,
//      still the lobby 4 s later), and the card works again
//   3  Start: the existing flow - a new round (admin.html?game=CODE&eventType=quick)
//   4  Same as last week: the same ask (naming the round it copies); Not now does nothing; Start runs
//      the copier (copyFrom, step=players)
//   5  the phone offline, Start: the old "No signal" words, still UNDER the Game Day card
// Stub db only, "Test" golfers only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'front-door.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const CD = makeCourseData(18);
const LAST = wizardSavedRound({ code: 'TSKTST', golfers: 2, names: ['Test A', 'Test B'], ownerUid: 'anon-cold', thru: 0, courseData: CD,
    overrides: { activeCourseKey: 'comm_links', courseName: 'Talking Stick Golf Club' } });
const DB = () => ({ events: { TSKTST: LAST }, global_courses: { comm_links: { name: 'Talking Stick Golf Club', data: CD } }, trips: {}, organizers: {}, tournaments: {} });
const COUNT = "window.__starts = []; document.addEventListener('DOMContentLoaded', function () { ['issueUniqueCode', 'createRoom', 'startFromPreviousRound', 'selectHomeWidget', 'sameAsLastWeek'].forEach(function (n) { var f = window[n]; if (typeof f !== 'function') return; window[n] = function () { window.__starts.push(n); return f.apply(this, arguments); }; }); });";
const OFFLINE = "try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function () { return false; } }); } catch (e) {}"
    + " document.addEventListener('DOMContentLoaded', function () { var real = window.issueUniqueCode; if (typeof real !== 'function') return;"
    + "  window.issueUniqueCode = function () { return new Promise(function (_, no) { setTimeout(function () { var e = new Error('timed out'); e.code = 'timeout'; no(e); }, 300); }); }; });";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const LS = "JSON.stringify(Object.keys(localStorage).sort().map(function (k) { return [k, localStorage.getItem(k)]; }))";
const SCREEN = "JSON.stringify((function(){ var g = document.getElementById('gl-gameday'), s = document.getElementById('gl-same'), n = document.querySelector('.ui-note'), sh = document.getElementById('ui-sheet');"
    + " var open = !!(sh && sh.classList.contains('open') && getComputedStyle(sh).display !== 'none');"
    + " return { at: location.search, sheet: open ? sh.innerText : null, yes: open && document.getElementById('ui-sheet-yes') ? document.getElementById('ui-sheet-yes').innerText : null,"
    + " no: open && document.getElementById('ui-sheet-no') ? document.getElementById('ui-sheet-no').innerText : null,"
    + " gd: g ? g.querySelector('.d').textContent : null, gdOff: g ? g.getAttribute('aria-disabled') : null, same: s ? s.querySelector('.d').textContent : null,"
    + " note: n ? n.innerText : '', noteAfterGameDay: !!(n && g && n.previousElementSibling === g), starts: (window.__starts || []).slice(), writes: (window.__WRITES || []).length }; })())";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function lobby(pre) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; try { localStorage.setItem('lastRoomCode','TSKTST'); } catch (e) {}" + iapStub({ active: true }) + COUNT + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2000);
    return j;
}
const screen = async (j) => JSON.parse(await j.evaluate(SCREEN));
async function until(j, ms, done) {
    const t0 = Date.now(); let s = null;
    while (Date.now() - t0 < ms) { try { s = await screen(j); } catch (e) { s = null; } if (s && done(s)) return s; await sleep(200); }
    return s;
}

test('Game Day tapped: "Start a new round?" with Not now / Start, and nothing started yet', { timeout: 90000 }, async () => {
    const j = await lobby('');
    const w0 = (await screen(j)).writes;
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    const s = await screen(j);
    assert.match(s.sheet || '', /^Start a new round\?/, 'the ask: ' + JSON.stringify(s));
    assert.deepEqual([s.no, s.yes], ['Not now', 'Start']);
    assert.deepEqual(s.starts, [], 'no round started, no code asked for');
    assert.equal(s.writes, w0, 'nothing written');
    assert.equal(s.at, '?start=lobby');
});

test('Not now: nothing happens and nothing is saved; the card works again', { timeout: 90000 }, async () => {
    const j = await lobby('');
    const ls0 = await j.evaluate(LS), w0 = (await screen(j)).writes;
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    assert.ok(await j.tap('#ui-sheet-no'));
    await sleep(4000);
    const s = await screen(j);
    assert.equal(s.sheet, null, 'the sheet is gone');
    assert.deepEqual(s.starts, [], 'nothing started');
    assert.equal(s.writes, w0, 'nothing written');
    assert.equal(await j.evaluate(LS), ls0, 'nothing saved on the phone');
    assert.equal(s.at, '?start=lobby', 'still Games & Bets');
    assert.equal(s.note, '', 'no note');
    assert.equal(s.gd, 'One round today · group, games and money', 'the card is as it was');
    assert.equal(s.gdOff, null, 'the card is not disabled');
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    assert.match((await screen(j)).sheet || '', /^Start a new round\?/, 'a second touch asks again');
});

test('Start: the existing flow - a new Game Day round', { timeout: 90000 }, async () => {
    const j = await lobby('');
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    assert.ok(await j.tap('#ui-sheet-yes'));
    const s = await until(j, 15000, (x) => /game=/.test(x.at));
    assert.match(s.at, /game=[A-Z0-9]{6}&eventType=quick/, JSON.stringify(s));
});

test('Same as last week: the same ask; Not now does nothing; Start runs the copier', { timeout: 120000 }, async () => {
    const j = await lobby('');
    for (let i = 0; i < 20 && !(await j.evaluate("getComputedStyle(document.getElementById('gl-same')).display !== 'none'")); i++) await sleep(250);
    const ls0 = await j.evaluate(LS), w0 = (await screen(j)).writes;
    assert.ok(await j.tap('#gl-same'));
    await sleep(300);
    let s = await screen(j);
    assert.equal(String(s.sheet).replace(/\n+/g, '\n'), 'Start a new round?\nA new round, copied from round TSKTST.\nNot now\nStart', JSON.stringify(s));
    assert.ok(await j.tap('#ui-sheet-no'));
    await sleep(3000);
    s = await screen(j);
    assert.deepEqual([s.sheet, s.starts, s.writes, s.at], [null, [], w0, '?start=lobby']);
    assert.equal(await j.evaluate(LS), ls0);
    assert.ok(await j.tap('#gl-same'));
    await sleep(300);
    assert.ok(await j.tap('#ui-sheet-yes'));
    s = await until(j, 20000, (x) => /step=players/.test(x.at));
    assert.match(s.at, /game=[A-Z0-9]{6}&eventType=quick&copyFrom=TSKTST&step=players/, JSON.stringify(s));
});

test('the phone offline, Start: the old "No signal" words, under the Game Day card', { timeout: 90000 }, async () => {
    const j = await lobby(OFFLINE);
    assert.ok(await j.tap('#gl-gameday'));
    await sleep(300);
    assert.ok(await j.tap('#ui-sheet-yes'));
    const s = await until(j, 15000, (x) => !!x.note);
    assert.equal(s.note, '📴 No signal — try again when you have a connection.\nThe new round was not started; nothing was saved.');
    assert.equal(s.noteAfterGameDay, true, 'said under the card that was tapped, not where the sheet was');
    assert.equal(s.at, '?start=lobby');
});
