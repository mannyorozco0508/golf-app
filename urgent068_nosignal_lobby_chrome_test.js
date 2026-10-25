// ============================================================================
// URGENT-068 #1 - GAMES & BETS NEVER SAYS "NO SIGNAL" WHILE LOOKING, AND "CONNECTING…" FIRST ON A WEAK BAR.
// Real Chrome, 393x852, the app's doors.
//
// Manny, 1 bar, 3:14 AM: "No signal — try again when you have a connection. The new round was not
// started; nothing was saved." under the Game Day card. A touch on Game Day starts a round at once (its
// code is checked against the server). On a weak bar the page's FIRST database connection took longer
// than the code check's 8 s, .info/connected still read false (it does before the first connection), and
// the lobby called that "No signal" - the false no-signal the GPS door lost in 0222fef, still here.
//
//   1  looking (a dead bar, a round to resume, 12 s): no note, no round started, no code asked for
//   2  a slow first connection (it answers at 12 s), Game Day tapped: "⏳ Connecting…", never "No
//      signal", and the round starts by itself (admin.html?game=CODE)
//   3  Same as last week on the same slow connection: "⏳ Connecting…", then the copier (step=players)
//   4  the phone OFFLINE, Game Day tapped: the "No signal" words (the right message), under Game Day,
//      with no "Connecting…" wait first
//   5  a good connection: Game Day starts at once, as before
// Stub db only.
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
// A SLOW FIRST CONNECTION on admin.html: every read answers only SLOW ms after the page started, and
// .info/connected says false until then (as the real SDK does before its first connection).
const slow = (ms) => "(function(){ if (!/admin\\.html$/.test(location.pathname)) return; var T0 = Date.now(), SLOW = " + ms + ", up = function () { return Date.now() - T0 >= SLOW; }, left = function () { return Math.max(0, SLOW - (Date.now() - T0)); };"
    + " var realDb = firebase.database;"
    + " firebase.database = function () { var d = realDb.apply(this, arguments); return { ref: function (p) { var r = d.ref(p);"
    + "  if (String(p) === '.info/connected') return { on: function (ev, cb) { setTimeout(function () { cb({ val: function () { return up(); } }); }, 0); if (!up()) setTimeout(function () { cb({ val: function () { return true; } }); }, left()); return cb; }, off: function () {}, once: function () { return Promise.resolve({ val: function () { return up(); } }); } };"
    + "  var o = Object.create(r); o.once = function () { var a = arguments; if (up()) return r.once.apply(r, a); return new Promise(function (res, rej) { setTimeout(function () { r.once.apply(r, a).then(res, rej); }, left()); }); }; return o; } }; };"
    + "})();";
// Counts every round start (the code issuer and the copier's read) - looking must make none.
const COUNT = "window.__starts = []; document.addEventListener('DOMContentLoaded', function () { ['issueUniqueCode', 'createRoom', 'startFromPreviousRound'].forEach(function (n) { var f = window[n]; if (typeof f !== 'function') return; window[n] = function () { window.__starts.push(n); return f.apply(this, arguments); }; }); });";
const OFFLINE = "try { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: function () { return false; } }); } catch (e) {}"
    + " document.addEventListener('DOMContentLoaded', function () { var real = window.issueUniqueCode; if (typeof real !== 'function') return;"
    + "  window.issueUniqueCode = function () { return new Promise(function (_, no) { setTimeout(function () { var e = new Error('timed out'); e.code = 'timeout'; no(e); }, 300); }); }; });";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const SCREEN = "JSON.stringify((function(){ var g = document.getElementById('gl-gameday'), s = document.getElementById('gl-same'), n = document.querySelector('.ui-note');"
    + " return { at: location.search, gd: g ? g.querySelector('.d').textContent : null, same: s ? s.querySelector('.d').textContent : null, note: n ? n.innerText : '',"
    + " noteAfterGameDay: !!(n && g && n.previousElementSibling === g), starts: (window.__starts || []).slice() }; })())";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function lobby(pre) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 },
        preScript: "window.__hardpanDoors = true; try { localStorage.setItem('lastRoomCode','TSKTST'); } catch (e) {}" + iapStub({ active: true }) + COUNT + (pre || '') });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'start=lobby'), 2000);
    return j;
}
async function watch(j, ms, done) {
    const seen = [], t0 = Date.now(); let last = null, s = null;
    while (Date.now() - t0 < ms) {
        try { s = JSON.parse(await j.evaluate(SCREEN)); } catch (e) { s = null; }
        if (s) { const k = JSON.stringify(s); if (k !== last) { seen.push(Object.assign({ t: Math.round((Date.now() - t0) / 100) / 10 }, s)); last = k; } if (done && done(s)) break; }
        await sleep(200);
    }
    return { seen, s };
}

test('looking at Games & Bets on a dead bar: no note, no round started, no code asked for', { timeout: 90000 }, async () => {
    const j = await lobby(slow(600000));
    const { seen, s } = await watch(j, 12000);
    assert.ok(seen.every((x) => x.note === ''), 'no note while looking: ' + JSON.stringify(seen));
    assert.deepEqual(s.starts, [], 'nothing started a round');
    assert.equal(s.at, '?start=lobby');
    assert.equal(s.gd, 'One round today · group, games and money');
});

test('Game Day on a slow first connection: "⏳ Connecting…", never "No signal", and the round starts by itself', { timeout: 90000 }, async () => {
    const j = await lobby(slow(12000));
    assert.ok(await j.tap('#gl-gameday'));
    const { seen, s } = await watch(j, 40000, (x) => /game=/.test(x.at));
    assert.ok(seen.some((x) => x.gd === '⏳ Connecting…'), 'Connecting… first: ' + JSON.stringify(seen));
    assert.ok(seen.every((x) => !/No signal/.test(x.note)), 'never "No signal": ' + JSON.stringify(seen));
    assert.match(s.at, /game=[A-Z0-9]{6}&eventType=quick/, 'the round started: ' + JSON.stringify(seen));
});

test('Same as last week on a slow first connection: "⏳ Connecting…", then the copier lands on Players', { timeout: 90000 }, async () => {
    const j = await lobby(slow(12000));
    for (let i = 0; i < 20 && !(await j.evaluate("getComputedStyle(document.getElementById('gl-same')).display !== 'none'")); i++) await sleep(250);
    assert.ok(await j.tap('#gl-same'));
    const { seen, s } = await watch(j, 40000, (x) => /step=players/.test(x.at));
    assert.ok(seen.some((x) => x.same === '⏳ Connecting…'), JSON.stringify(seen));
    assert.ok(seen.every((x) => !/No signal/.test(x.note)), JSON.stringify(seen));
    assert.match(s.at, /copyFrom=TSKTST&step=players/);
});

test('the phone offline, Game Day tapped: the "No signal" words under Game Day, with no Connecting… wait', { timeout: 90000 }, async () => {
    const j = await lobby(OFFLINE);
    assert.ok(await j.tap('#gl-gameday'));
    const { seen, s } = await watch(j, 15000, (x) => !!x.note);
    assert.ok(seen.every((x) => x.gd !== '⏳ Connecting…'), JSON.stringify(seen));
    assert.equal(s.note, '📴 No signal — try again when you have a connection.\nThe new round was not started; nothing was saved.');
    assert.equal(s.noteAfterGameDay, true, 'said under the card that was tapped');
    assert.equal(s.at, '?start=lobby');
    assert.equal(s.gd, 'One round today · group, games and money', 'the card is given back');
});

test('a good connection: Game Day starts at once, as before', { timeout: 60000 }, async () => {
    const j = await lobby('');
    const t0 = Date.now();
    assert.ok(await j.tap('#gl-gameday'));
    const { s } = await watch(j, 15000, (x) => /game=/.test(x.at));
    assert.match(s.at, /game=[A-Z0-9]{6}&eventType=quick/);
    assert.ok(Date.now() - t0 < 6000, 'no wait added: ' + (Date.now() - t0) + ' ms');
});
