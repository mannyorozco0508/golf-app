// ============================================================================
// 2.0 POLISH #6 / #7 / #9 - HOME'S HISTORY, ITS ROUND CARDS, AND JOIN WITH A BARE CODE, IN REAL CHROME
// (phone size 393x852, the HardPan app's Home: simpleFlow).
//
//   #7  Home showed one unfinished round twice ("LAST WEEK · Dobson · 1 · Again" AND "IN PROGRESS ·
//       Dobson · Thru 2") and called today's round "LAST WEEK"; "· 2 ·" meant 2 golfers. Now: each
//       round once, no "Again" for an unfinished round, the day ("Today", "Yesterday", "Tue Oct 13"),
//       and "2 golfers".
//   #6  Home › History opened the Games screen. Now: this phone's past rounds, newest first - course,
//       day, golfers, the result once finished. A tap: Results (finished) or Resume (not).
//   #9  Join with a bare code opened a watcher view that still scored (on the organizer's phone Save
//       wrote hole 5). Now Home asks "Which group are you in?" (each group with its golfers, plus
//       "Just watching"), and ?spectate=1 is READ-ONLY: no Enter score, and THE PAGE WRITES NOTHING.
// Stub db only (journey harness: every write is recorded in window.__WRITES). Synthetic rounds only.
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

const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '029', 'fixed');
const CD = makeCourseData(18);
const DAY = 86400000;
function rnd(code, names, thru, course, groups) {
    const r = wizardSavedRound({ code, golfers: names.length, names, ownerUid: 'anon-cold', thru, flights: false, courseData: CD,
        overrides: { activeCourseKey: 'comm_links', courseName: course, groupSizeOverrides: groups || { 0: names.length } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke';
    if (!thru) r.scores = {};
    return r;
}
// Finished at Papago 3 days ago (Test A 72, Test B 73); in progress at Dobson today, thru 2;
// an 8-golfer, 2-group round nobody has scored (the join).
const FIN = rnd('FIN001', ['Test A', 'Test B'], 18, 'Papago Golf Club');
FIN.scores.p102_h1 = FIN.scores.p102_h1 + 1;
const PRG = rnd('PRG001', ['Test A'], 2, 'Dobson Ranch Golf Course');
const GRP = rnd('GRP001', ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'], 0, 'Test Links', { 0: 4, 1: 4 });
const DB = () => ({ events: { FIN001: FIN, PRG001: PRG, GRP001: GRP }, global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, organizers: {}, tournaments: {} });

// This phone: both rounds opened here (their stored copies + first-seen days); last = `last`.
const SEED = (last) => "try{if(!sessionStorage.getItem('phseed')){sessionStorage.setItem('phseed','1');var now=Date.now();"
    + "localStorage.setItem('golfapp_snap_v1_FIN001', JSON.stringify({ at: now - 3*" + DAY + ", data: " + JSON.stringify(FIN) + ", meta: { group: null } }));"
    + "localStorage.setItem('golfapp_snap_v1_PRG001', JSON.stringify({ at: now - 60000, data: " + JSON.stringify(PRG) + ", meta: { group: null } }));"
    + "localStorage.setItem('hardpan_round_seen_v1', JSON.stringify({ FIN001: now - 3*" + DAY + ", PRG001: now - 30*60000 }));"
    + "localStorage.setItem('golfapp_me_PRG001','101');"
    + (last === 'PRG001' ? "localStorage.setItem('hardpan_last_round', JSON.stringify({ code: 'PRG001', at: now - 60000, course: 'Dobson Ranch Golf Course' }));" : '')
    + "localStorage.setItem('lastRoomCode','" + last + "');}}catch(e){}";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(last) {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + SEED(last) });
    journeys.push(j);
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
const SIMPLE = "JSON.stringify({ same: (function(){ var b=document.getElementById('hs-same'); return b && getComputedStyle(b).display!=='none' ? b.innerText.replace(/\\s+/g,' ').trim() : ''; })(), prog: (document.getElementById('hs-progress')||{}).innerText || '', all: document.getElementById('v-simple').innerText })";
const HIST = "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hp-history-list [data-hp-hist]'), function (b) { return { code: b.getAttribute('data-hp-hist'), text: b.innerText.replace(/\\s+/g,' ').trim() }; }))";
const WRITES = "JSON.stringify((window.__WRITES || []).map(function (w) { return w.path; }))";

test('#7: an unfinished round shows ONCE (In progress, Resume) - no "Again", no "LAST WEEK"', { timeout: 90000 }, async () => {
    const j = await open('PRG001');
    await j.goto(fileUrl('home.html'), 2500);
    assert.ok(await until(j, "/Thru 2/.test((document.getElementById('hs-progress')||{}).innerText||'')"), 'the IN PROGRESS card');
    await sleep(800);
    const s = JSON.parse(await ev(j, SIMPLE));
    assert.equal(s.same, '', 'no "Again" card for the round being played: ' + s.same);
    assert.equal((s.all.match(/Dobson Ranch/g) || []).length, 1, 'Dobson once: ' + s.all);
    assert.doesNotMatch(s.all, /LAST WEEK/i);
    assert.match(s.prog, /IN PROGRESS[\s\S]*Dobson Ranch Golf Course · Thru 2[\s\S]*Resume/);
    await j.shot(path.join(SHOTS, '07-after-inprogress.png'));
    assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'Home wrote nothing');
});

test('#7: a finished round is labelled by its day and says "2 golfers"', { timeout: 90000 }, async () => {
    const j = await open('FIN001');
    await j.goto(fileUrl('home.html'), 2500);
    assert.ok(await until(j, "/Again/.test((document.getElementById('hs-same')||{}).innerText||'')"), 'the Again card');
    const s = JSON.parse(await ev(j, SIMPLE));
    const want = await ev(j, "window.HardPanDoors.dayLabel(Date.now() - 3*" + DAY + ").toUpperCase()");
    assert.match(want, /^(SUN|MON|TUE|WED|THU|FRI|SAT) [A-Z]{3} \d{1,2}$/);
    assert.ok(s.same.indexOf(want) === 0, 'labelled ' + want + ': ' + s.same);
    assert.match(s.same, /Papago Golf Club · 2 golfers/);
    assert.doesNotMatch(s.same, /LAST WEEK| · 2 · /);
    assert.equal(await ev(j, "window.HardPanDoors.dayLabel(Date.now())"), 'Today');
    assert.equal(await ev(j, "window.HardPanDoors.dayLabel(Date.now() - " + DAY + ")"), 'Yesterday');
    assert.equal(await ev(j, "window.HardPanDoors.dayLabel(new Date(2026, 9, 13, 9).getTime(), new Date(2026, 9, 20, 14).getTime())"), 'Tue Oct 13');
    await j.shot(path.join(SHOTS, '07-after.png'));
});

test('#6: History is this phone\'s past rounds, newest first; a tap opens Results or Resume', { timeout: 120000 }, async () => {
    const j = await open('FIN001');
    await j.goto(fileUrl('home.html'), 2500);
    assert.ok(await j.tap('[data-hp-act="shistory"]'), 'History link');
    assert.ok(await until(j, "document.getElementById('v-history').classList.contains('on') && document.querySelectorAll('#hp-history-list [data-hp-hist]').length === 2"), 'the list');
    await sleep(600);
    const rows = JSON.parse(await ev(j, HIST));
    assert.deepEqual(rows.map((r) => r.code), ['PRG001', 'FIN001'], 'newest first');
    assert.match(rows[0].text, /Dobson Ranch Golf Course Today · 1 golfer Test A Thru 2 Resume ›/);
    assert.match(rows[1].text, /Papago Golf Club (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \w{3} \d+ · 2 golfers Test A, Test B Final · Low: Test A 72 Results ›/);
    assert.ok(!(await ev(j, "document.getElementById('v-games').classList.contains('on')")), 'not the Games screen');
    await j.shot(path.join(SHOTS, '06-after.png'));
    assert.deepEqual(JSON.parse(await ev(j, WRITES)), [], 'History wrote nothing');
    // A finished round: its Results.
    await ev(j, "document.querySelector('[data-hp-hist=\"FIN001\"]').click()");
    assert.ok(await until(j, "/settlement\\.html$/.test(location.pathname) && /game=FIN001/.test(location.search)", 10000), 'Results');
    // An unfinished one: Resume (the scorecard on that round).
    await j.goto(fileUrl('home.html'), 2500);
    await j.tap('[data-hp-act="shistory"]');
    assert.ok(await until(j, "!!document.querySelector('[data-hp-hist=\"PRG001\"]')"));
    await ev(j, "document.querySelector('[data-hp-hist=\"PRG001\"]').click()");
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && /game=PRG001/.test(location.search) && !/spectate/.test(location.search)", 10000), 'Resume');
});

test('#9: a bare code asks "Which group are you in?" - the groups with their golfers, and Just watching', { timeout: 120000 }, async () => {
    const j = await open('FIN001');
    await j.goto(fileUrl('home.html'), 2500);
    await j.tap('[data-hp-act="sjoinopen"]');
    await j.setValue('#hs-code', 'grp001');
    await j.tap('[data-hp-act="sjoin"]');
    assert.ok(await until(j, "(function(){var e=document.getElementById('hp-join-ask'); return !!e && e.style.display==='flex';})()"), 'the question');
    const t = await j.text('#hp-join-ask');
    assert.match(t, /Which group are you in\?/);
    assert.match(t, /Group 1 Ann Alpha, Ben Bravo, Cal Charlie, Dee Delta/);
    assert.match(t, /Group 2 Eli Echo, Fay Foxtrot, Gus Golf, Hal Hotel/);
    assert.match(t, /Just watching/);
    assert.match(await ev(j, 'location.pathname'), /home\.html$/, 'still on Home');
    await j.shot(path.join(SHOTS, '09-after.png'));
    await j.tap('#hp-join-ask [data-hp-ja="2"]');
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && /game=GRP001&group=2$/.test(location.search)", 10000), 'Group 2\'s card: ' + await ev(j, 'location.search'));
    await j.goto(fileUrl('home.html'), 2500);
    await j.tap('[data-hp-act="sjoinopen"]');
    await j.setValue('#hs-code', 'GRP001');
    await j.tap('[data-hp-act="sjoin"]');
    assert.ok(await until(j, "(function(){var e=document.getElementById('hp-join-ask'); return !!e && e.style.display==='flex';})()"));
    await j.tap('#hp-join-ask [data-hp-ja="watch"]');
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && /game=GRP001&spectate=1$/.test(location.search)", 10000), 'Just watching');
});

test('#9: a spectate page is READ-ONLY and WRITES NOTHING - even on the round organizer\'s own phone', { timeout: 120000 }, async () => {
    const j = await open('FIN001');
    // anon-cold (this phone's user) OWNS PRG001 - the case from the report: before, the owner's
    // phone kept scoring on ?spectate=1 and Save wrote the score.
    await j.goto(fileUrl('index.html', 'game=PRG001&spectate=1'), 3500);
    assert.ok(await until(j, "typeof currentData !== 'undefined' && !!currentData && !!currentData.players", 15000), 'the round loaded');
    await sleep(2500);
    const st = JSON.parse(await ev(j, `JSON.stringify({
        spect: hpSpectating(), badge: (document.getElementById('hp-spec-badge') || {}).textContent || '',
        owner: typeof canReachSetup === 'function' ? canReachSetup() : null,
        canWrite: canWritePlayer(101),
        inputs: Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { var r = i.getBoundingClientRect(); return !i.disabled && r.width > 0 && r.height > 0; }).length,
        enterScore: Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && /Enter score/.test(b.textContent || ''); }).length })`));
    assert.equal(st.owner, true, 'this phone is the organizer (the worst case)');
    assert.equal(st.spect, true, 'spectating');
    assert.match(st.badge, /Spectating/);
    assert.equal(st.canWrite, false);
    assert.equal(st.inputs, 0, 'no score boxes');
    assert.equal(st.enterScore, 0, 'no Enter score anywhere');
    // Try every way in: the score sheet, a direct save, the bar's Enter score.
    await ev(j, "try { gpsOpenScore(3, 101); } catch (e) {} try { saveScore(101, 3, 6); } catch (e) {} try { var b = document.querySelector('[data-hp-bar=\"score\"]'); if (b) b.click(); } catch (e) {} 1");
    await sleep(1200);
    await j.shot(path.join(SHOTS, '09-after-spectate.png'));
    const w = JSON.parse(await ev(j, WRITES));
    assert.deepEqual(w, [], 'the spectate page wrote: ' + w.join(', '));
    const q = await ev(j, "localStorage.getItem('golfapp_wq_v1') || '[]'");
    assert.deepEqual(JSON.parse(q), [], 'nothing queued to write later');
    const after = await j.harvest();
    assert.equal(after.events.PRG001.scores.p101_h3, undefined, 'no hole-3 score in the database');
});
