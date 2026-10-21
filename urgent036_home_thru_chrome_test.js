// ============================================================================
// URGENT-036 #36 (POLISH 029 #36) - HOME'S "THRU N" COUNTS THE SCORES STILL WAITING IN THE OFFLINE
// QUEUE, IN REAL CHROME (393x852, the HardPan app's Home: simpleFlow).
//
// The report: offline, Home said "Thru 4"; right after reconnecting it said "Thru 2" until the queue
// had sent. THE CAUSE: Home first paints from this phone's copy plus the queue (Thru 4), then the
// server's answer (holes 1-2 only, the queue not sent yet) was painted over it as-is (Thru 2).
// Now the server's copy has the queued scores laid on top (OfflineQueue.peek / applyQueued, read
// only) before Thru N is worked out - and Home never touches the queue.
//   1  server thru 2, queue holds holes 3 and 4: "Thru 4" after the server has answered, and the
//      queue is exactly as it was (Home wrote nothing, sent nothing, removed nothing).
//   2  nothing queued: "Thru 2" (the server's own count, unchanged).
//   3  scores queued for ANOTHER round never count here.
// Stub db only (journey harness). Synthetic rounds only ("Test 036 ...").
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.U036_SHOTS || path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '036', 'offline');
const CD = makeCourseData(18);
function rnd(code, names, thru, course) {
    const r = wizardSavedRound({ code, golfers: names.length, names, ownerUid: 'anon-cold', thru, flights: false, courseData: CD,
        overrides: { activeCourseKey: 'comm_links', courseName: course, eventName: 'Test 036 Thru', groupSizeOverrides: { 0: names.length } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke';
    return r;
}
// On the server: thru 2 (holes 3 and 4 were scored offline and are still in the queue).
const PRG = rnd('T36THR', ['Test 036 A'], 2, 'Dobson Ranch Golf Course');
const DB = () => ({ events: { T36THR: PRG }, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, organizers: {}, tournaments: {} });
const op = (code, h, v, i) => ({ id: 'op36-' + code + '-' + h, path: 'events/' + code + '/scores/p101_h' + h, type: 'set', value: v, coalesceKey: 'events/' + code + '/scores/p101_h' + h, ts: Date.now() - 60000 + i, v: 'v36-' + h, tries: 0 });
const Q_MINE = [op('T36THR', 3, 4, 1), op('T36THR', 4, 5, 2)];
const Q_OTHER = [op('T36OTH', 3, 4, 1), op('T36OTH', 4, 5, 2), op('T36OTH', 5, 4, 3)];

// This phone: the round's stored copy (as the server had it), the Resume pointer, and the queue.
const SEED = (queue) => "try{if(!sessionStorage.getItem('t36seed')){sessionStorage.setItem('t36seed','1');var now=Date.now();"
    + "localStorage.setItem('golfapp_snap_v1_T36THR', JSON.stringify({ at: now - 60000, data: " + JSON.stringify(PRG) + ", meta: { group: null } }));"
    + "localStorage.setItem('hardpan_round_seen_v1', JSON.stringify({ T36THR: now - 30*60000 }));"
    + "localStorage.setItem('golfapp_me_T36THR','101');"
    + "localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'T36THR', at: now - 60000, course: 'Dobson Ranch Golf Course' }));"
    + "localStorage.setItem('golfapp_wq_v1', " + JSON.stringify(JSON.stringify(queue)) + ");"
    + "localStorage.setItem('lastRoomCode','T36THR');}}catch(e){}";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function home(queue) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + SEED(queue)
            // Count the server's answers to Home's read of the round, so the check runs AFTER it.
            + "window.__t36reads = 0; (function(){ var w = setInterval(function(){ var f = window.firebase; if (!f || !f.database) return; clearInterval(w); var d0 = f.database; f.database = function(){ var db = d0.apply(this, arguments); if (db && !db.__t36) { db.__t36 = 1; var r0 = db.ref.bind(db); db.ref = function(p){ var r = r0(p); if (String(p) === 'events/T36THR' && r && r.once) { var o0 = r.once.bind(r); r.once = function(){ return o0.apply(null, arguments).then(function(s){ setTimeout(function(){ window.__t36reads++; }, 0); return s; }); }; } return r; }; } return db; }; }, 5); })();" });
    journeys.push(j);
    await j.goto(fileUrl('home.html'), 2500);
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
const PROG = "(document.getElementById('hs-progress')||{}).innerText || ''";
const WRITES = "JSON.stringify((window.__WRITES || []).map(function (w) { return w.path; }))";

test('server thru 2 + holes 3, 4 waiting in the queue: Home says Thru 4 after the server answers - never Thru 2', { timeout: 90000 }, async () => {
    const j = await home(Q_MINE);
    assert.ok(await until(j, "window.__t36reads > 0", 15000), 'the server answered Home\'s read of the round');
    await sleep(800);
    const p = await ev(j, PROG);
    assert.match(p, /IN PROGRESS[\s\S]*Dobson Ranch Golf Course · Thru 4[\s\S]*Resume/, 'Thru 4: ' + p);
    assert.doesNotMatch(p, /Thru 2/);
    // Display only: the queue is exactly as seeded, nothing written or sent.
    assert.deepEqual(JSON.parse(await ev(j, "localStorage.getItem('golfapp_wq_v1')")), Q_MINE, 'the queue untouched');
    assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'Home wrote nothing');
    try { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, 'home-thru4-after-reconnect-chrome.png')); } catch (e) {}
});

test('nothing waiting: Home says the server\'s own Thru 2', { timeout: 90000 }, async () => {
    const j = await home([]);
    assert.ok(await until(j, "window.__t36reads > 0", 15000));
    await sleep(800);
    assert.match(await ev(j, PROG), /Dobson Ranch Golf Course · Thru 2/);
});

test('scores waiting for ANOTHER round never count on this one', { timeout: 90000 }, async () => {
    const j = await home(Q_OTHER);
    assert.ok(await until(j, "window.__t36reads > 0", 15000));
    await sleep(800);
    assert.match(await ev(j, PROG), /Dobson Ranch Golf Course · Thru 2/);
    assert.deepEqual(JSON.parse(await ev(j, "localStorage.getItem('golfapp_wq_v1')")), Q_OTHER);
});
