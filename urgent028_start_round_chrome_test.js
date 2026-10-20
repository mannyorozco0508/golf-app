// ============================================================================
// URGENT-028 - START ROUND STARTS AT THE PICKED COURSE, IN REAL CHROME (phone GPS mode, iPhone 15 size).
//
// Manny, 1:03 PM: a Papago round open -> back to the setup -> searched and picked Aguila (online) ->
// Start Round -> the GPS showed Papago hole 1 again. The cause: a tapped online course only became
// the pick once its pull and card record were in; until then Round Setup still held the course
// picked before it (the closest: Papago) and Start Round was live - a tap in that window started
// Papago. A failed pull (no signal) left it the same.
//   1  Start Papago, then switch to Aguila (online, a slow pull): while it loads the selected card is
//      Aguila and the button reads "Loading Aguila…" (off - a tap starts nothing); then Start Round
//      makes a NEW round at Aguila, and the GPS opens on Aguila hole 1 with "Aguila · Hole 1" in the
//      header for 2 s (then "Hole 1").
//   2  A round in progress at Papago WITH scores: "End your Papago round (thru 3) and start at
//      Aguila?" [Start new] [Resume Papago]. Resume opens Papago; Start new makes a new round and the
//      Papago round keeps its scores (History). With NO scores: replaced without a word.
//   3  An online course tapped with no signal: the loading state, never another course; it loads
//      when the signal is back.
// gps-live stood in (the real ones are our Cloud Functions). Stub db only (the journey harness keeps
// writes across page hops). Synthetic course data only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

// Two cards that cannot be mistaken: Papago's 1st is a par 5, Aguila's a par 3.
const PAP = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: i === 0 ? 5 : 4, hcpIndex: i + 1 }));
const AGU = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: i === 0 ? 3 : 4, hcpIndex: 18 - i }));
const TEE = (cd, name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: cd.reduce((a, h) => a + h.par, 0), totalYards: y, holes: cd.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const AGUILA_ID = '012141520630378568727', AGUILA_KEY = 'gapi_' + AGUILA_ID;
const AGUILA = { name: 'Aguila Golf Club (Championship)', data: AGU, tees: { male: [TEE(AGU, 'Blue', 6850, 72.1, 124), TEE(AGU, 'White', 6400, 70.0, 119)] },
    location: { city: 'Laveen', state: 'AZ', latitude: 33.3700, longitude: -112.1700 } };
const PAPAGO = { name: 'Papago Golf Club', data: PAP, tees: { male: [TEE(PAP, 'Back', 7068, 73.3, 132), TEE(PAP, 'Middle', 6500, 70.9, 125)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } };
const HERE = { latitude: 33.4560, longitude: -111.9480, accuracy: 10 };

// gps-live on Round Setup: search finds Aguila online; course(id) pulls it after window.__pullMs
// (the phone's real pull takes seconds) - offline (navigator.onLine false) it is never called.
const LIVE = "if (/admin\\.html$/.test(location.pathname)) (function(){ var real; window.__pulls = []; Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return real && Object.assign({}, real, {"
    + " on: function () { return true; }, find: function (n) { return Promise.resolve({ status: 'none', tried: [n] }); },"
    + " search: function (q) { return new Promise(function (ok) { setTimeout(function () { ok({ status: 'ok', results: /aguila/.test(q) ? [{ id: '" + AGUILA_ID + "', club: 'Aguila Golf Club', course: 'Championship', name: 'Aguila Golf Club (Championship)', city: 'Laveen', state: 'AZ', holes: 18, gps: true }] : [] }); }, 300); }); },"
    + " course: function (id) { window.__pulls.push(id); return new Promise(function (ok) { setTimeout(ok, window.__pullMs || 0); }).then(function () { return firebase.database().ref('global_courses/gapi_' + id).set(" + JSON.stringify(AGUILA) + "); }).then(function () { return { status: 'ready', cardKey: 'gapi_' + id }; }); } }); },"
    + " set: function (v) { real = v; } }); })();"
    + "if (/admin\\.html$/.test(location.pathname)) (function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();"
    + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { if (!document.querySelector('script[src=\"gps-live.js\"]')) { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); } });";
const GEO = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
// A Papago round already in progress on this phone (thru: holes scored; 0 = none).
function papagoRound(code, thru) {
    const r = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru, flights: false, names: ['Manny'], courseData: PAP,
        overrides: { activeCourseKey: 'az_papago', courseName: 'Papago Golf Club', groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    r.additionalGameInstances = {}; r.additionalGames = {}; r.gameFormat = 'stroke';
    if (!thru) r.scores = {};
    return r;
}
const SEED = (code) => !code ? '' : "try{if(!sessionStorage.getItem('u28seed')){sessionStorage.setItem('u28seed','1');localStorage.setItem('golfapp_me_" + code + "','101');"
    + "localStorage.setItem('hardpan_last_round', JSON.stringify({ code: '" + code + "', at: Date.now(), course: 'Papago Golf Club', group: '1' }));localStorage.setItem('lastRoomCode','" + code + "');"
    + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}}catch(e){}";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function open(events, seedCode) {
    const j = await openJourney({ db: { events: events || {}, global_courses: { az_papago: PAPAGO }, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LIVE + GEO + SEED(seedCode) });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) {} await sleep(150); } return false; }
async function click(j, sel) { assert.ok(await ev(j, '(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'), 'no ' + sel); }
const KEY = "document.getElementById('course-select').value";
const BTN = "JSON.stringify((function(){ var b=document.querySelector('[data-sf=startgps]'); var c=document.getElementById('sf-course'); return { text: b ? b.innerText : null, off: b ? b.disabled : null, card: c ? c.innerText : null, key: document.getElementById('course-select').value, at: location.pathname.split('/').pop(), code: new URLSearchParams(location.search).get('game') }; })())";
const ROUND = "JSON.stringify({ code: currentMode, course: currentData && currentData.courseName, key: currentData && currentData.activeCourseKey, hole1: currentData && currentData.courseData && currentData.courseData[0], at: location.pathname.split('/').pop() })";
// The GPS door from Home: Course & Tees for a new round.
async function gpsDoor(j) {
    await j.goto(fileUrl('home.html', ''), 2500);
    await click(j, '[data-hp-act="sgpsdoor"]');
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && /game=/.test(location.search) && !!document.getElementById('sf-q') && !!window.HardPanGpsLive", 30000), 'Course & Tees');
}
// Papago picked (the closest - or one tap in NEAR YOU), its tees in.
async function papagoPicked(j) {
    if (!(await until(j, KEY + " === 'az_papago'", 6000))) await click(j, '#sf [data-sf-course="az_papago"]');
    assert.ok(await until(j, KEY + " === 'az_papago' && !!document.querySelector('#sf [data-sf-tee]')", 15000), 'Papago picked, its tees');
}
async function searchAguila(j) {
    await ev(j, "(function(){ var i=document.getElementById('sf-q'); i.focus(); i.value='aguila'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
    assert.ok(await until(j, "!!document.querySelector('#sf [data-sf-web]')", 10000), 'Aguila found online');
}
// Aguila again on this phone: listed by now (its record is in), one row - local or online.
async function pickAguilaAgain(j) {
    await ev(j, "(function(){ var i=document.getElementById('sf-q'); i.focus(); i.value='aguila'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
    assert.ok(await until(j, "!!document.querySelector('#sf [data-sf-web], #sf [data-sf-course=\"" + AGUILA_KEY + "\"]')", 10000), 'Aguila found');
    await click(j, '#sf [data-sf-web], #sf [data-sf-course="' + AGUILA_KEY + '"]');
}
async function aguilaIn(j) {
    assert.ok(await until(j, KEY + " === '" + AGUILA_KEY + "' && document.querySelectorAll('#sf [data-sf-tee]').length === 2 && /^Start Round$/.test(document.querySelector('[data-sf=startgps]').innerText)", 20000), 'Aguila in, its tees, Start Round');
}

test('Papago, then Aguila (online, slow): "Loading Aguila…" (off) while it loads; Start Round -> a new round at Aguila; the GPS on Aguila hole 1, "Aguila · Hole 1" for 2 s', { timeout: 180000 }, async () => {
    const j = await open({});
    // Start Papago (the GPS door, the closest course).
    await gpsDoor(j);
    await papagoPicked(j);
    await click(j, '[data-sf="startgps"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && (typeof currentData !== 'undefined' && !!currentData && !!currentData.players)", 30000), 'the Papago round');
    const pap = JSON.parse(await ev(j, ROUND));
    assert.equal(pap.key, 'az_papago');
    await sleep(1200);
    // Back to the setup (the GPS "‹" with no scores: Change course).
    await ev(j, 'HardPanRound.changeCourse()');
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && /game=/.test(location.search) && !!document.getElementById('sf-q') && !!window.HardPanGpsLive", 30000), 'Course & Tees for a new round');
    await papagoPicked(j);
    // Aguila from the search; its pull takes 4 s.
    await ev(j, 'window.__pullMs = 4000');
    await searchAguila(j);
    await click(j, '#sf [data-sf-web]');
    await sleep(400);
    const busy = JSON.parse(await ev(j, BTN));
    assert.equal(busy.text, 'Loading Aguila…', 'the button names the course it waits for');
    assert.equal(busy.off, true, 'and is off');
    assert.match(busy.card, /^Aguila Golf Club\n/, 'the selected card is Aguila, not Papago: ' + busy.card);
    // A tap now (Manny's) starts nothing - never Papago.
    await ev(j, "(function(){ var b=document.querySelector('[data-sf=startgps]'); b.disabled=false; b.click(); return 1; })()");
    await sleep(1500);
    const still = JSON.parse(await ev(j, BTN));
    assert.equal(still.at, 'admin.html', 'nothing started while Aguila loads');
    assert.equal(still.text, 'Loading Aguila…');
    assert.equal(Object.keys((await j.harvest()).events || {}).length, 1, 'no round written');
    await aguilaIn(j);
    const fresh = JSON.parse(await ev(j, BTN));
    assert.match(fresh.card, /^Aguila Golf Club/);
    await click(j, '[data-sf="startgps"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && (typeof currentData !== 'undefined' && !!currentData && !!currentData.players) && !!window.HardPanGps && HardPanGps.isMounted()", 30000), 'the new round');
    const agu = JSON.parse(await ev(j, ROUND));
    assert.notEqual(agu.code, pap.code, 'a NEW round');
    assert.deepEqual([agu.key, agu.course, agu.hole1.par], [AGUILA_KEY, 'Aguila Golf Club (Championship)', 3], 'at Aguila, its card');
    // The GPS: Aguila hole 1, its name in the header for 2 s on this first open, then "Hole 1".
    await ev(j, "HardPanGps.showSide('gps')");
    assert.ok(await until(j, "HardPanGps.side() === 'gps'", 8000), 'the map is up');
    const head = JSON.parse(await ev(j, "JSON.stringify({ key: HardPanGps.courseKey(), hole: HardPanGps.hole(), lbl: (document.querySelector('#gps-overlay .gps-ld-holelbl') || document.querySelector('#gps-overlay .gps-lc-l1') || {}).textContent, par: (document.querySelector('#gps-overlay .gps-ld-par1') || {}).textContent })"));
    assert.deepEqual([head.key, head.hole], [AGUILA_KEY, 1], 'the GPS is on Aguila hole 1');
    assert.match(head.lbl, /^Aguila · Hole 1/, 'the course name for 2 s: ' + head.lbl);
    await sleep(2600);
    assert.match(await ev(j, "(document.querySelector('#gps-overlay .gps-ld-holelbl') || document.querySelector('#gps-overlay .gps-lc-l1') || {}).textContent"), /^Hole 1/, 'then "Hole 1" again');
    // Only on the first open: the map again, no name.
    await ev(j, "HardPanGps.showSide('bets')"); await sleep(300); await ev(j, "HardPanGps.showSide('gps')"); await sleep(300);
    assert.match(await ev(j, "(document.querySelector('#gps-overlay .gps-ld-holelbl') || document.querySelector('#gps-overlay .gps-lc-l1') || {}).textContent"), /^Hole 1/);
});

test('a Papago round WITH scores: "End your Papago round (thru 3) and start at Aguila?" - Resume opens Papago; Start new is a new round, Papago keeps its scores', { timeout: 180000 }, async () => {
    const j = await open({ PAPSC1: papagoRound('PAPSC1', 3) }, 'PAPSC1');
    await gpsDoor(j);
    await papagoPicked(j);
    await searchAguila(j);
    await click(j, '#sf [data-sf-web]');
    await aguilaIn(j);
    await click(j, '[data-sf="startgps"]');
    assert.ok(await until(j, "!!document.getElementById('sf-ask')", 10000), 'it asks');
    const ask = await ev(j, "document.getElementById('sf-ask').innerText");
    assert.match(ask, /^End your Papago round \(thru 3\) and start at Aguila\?/);
    assert.deepEqual(JSON.parse(await ev(j, "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sf-ask button'), function (b) { return b.innerText; }))")), ['Start new', 'Resume Papago']);
    assert.match(await ev(j, 'location.pathname'), /admin\.html$/, 'nothing moved before the answer');
    // Resume Papago: the Papago round, as it was.
    await click(j, '#sf-ask [data-sf="askresume"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && /game=PAPSC1/.test(location.search)", 20000), 'Resume opens Papago');
    // Again - Start new this time.
    await gpsDoor(j);
    await papagoPicked(j);
    await pickAguilaAgain(j);
    await aguilaIn(j);
    await click(j, '[data-sf="startgps"]');
    assert.ok(await until(j, "!!document.getElementById('sf-ask')", 10000), 'it asks again');
    await click(j, '#sf-ask [data-sf="asknew"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && !/game=PAPSC1/.test(location.search) && (typeof currentData !== 'undefined' && !!currentData && !!currentData.players)", 30000), 'a new round');
    const agu = JSON.parse(await ev(j, ROUND));
    assert.deepEqual([agu.key, agu.hole1.par], [AGUILA_KEY, 3]);
    await sleep(800);
    const db = await j.harvest();
    assert.ok(db.events.PAPSC1, 'the Papago round is still there (History)');
    assert.equal(Object.keys(db.events.PAPSC1.scores || {}).length, 3, 'with its scores');
    assert.equal(JSON.parse(await ev(j, "localStorage.getItem('hardpan_last_round')")).code, agu.code, 'Resume on Home is the new round');
});

test('a Papago round with NO scores: replaced without a word', { timeout: 150000 }, async () => {
    const j = await open({ PAPNO1: papagoRound('PAPNO1', 0) }, 'PAPNO1');
    await gpsDoor(j);
    await papagoPicked(j);
    await searchAguila(j);
    await click(j, '#sf [data-sf-web]');
    await aguilaIn(j);
    await click(j, '[data-sf="startgps"]');
    assert.ok(await until(j, "/index\\.html/.test(location.pathname) && (typeof currentData !== 'undefined' && !!currentData && !!currentData.players)", 30000), 'straight to the new round');
    const agu = JSON.parse(await ev(j, ROUND));
    assert.notEqual(agu.code, 'PAPNO1');
    assert.equal(agu.key, AGUILA_KEY);
    assert.ok((await j.harvest()).events.PAPNO1, 'nothing deleted');
});

test('no signal: an online course tapped stays the pick - "Loading Aguila…" (off), never Papago; it loads when the signal is back', { timeout: 150000 }, async () => {
    const j = await open({});
    await gpsDoor(j);
    await papagoPicked(j);
    await searchAguila(j);
    await ev(j, "(function(){ window.__on = false; Object.defineProperty(navigator, 'onLine', { configurable: true, get: function () { return window.__on !== false; } }); window.dispatchEvent(new Event('offline')); return 1; })()");
    await click(j, '#sf [data-sf-web]');
    await sleep(600);
    const off = JSON.parse(await ev(j, BTN));
    assert.deepEqual([off.text, off.off], ['Loading Aguila…', true], 'the loading state');
    assert.match(off.card, /^Aguila Golf Club\n[\s\S]*No signal/, 'the selected card is Aguila, waiting for a signal: ' + off.card);
    assert.equal(await ev(j, 'window.__pulls.length'), 0, 'not pulled with no signal');
    await ev(j, "(function(){ var b=document.querySelector('[data-sf=startgps]'); b.disabled=false; b.click(); return 1; })()");
    await sleep(1500);
    const still = JSON.parse(await ev(j, BTN));
    assert.equal(still.at, 'admin.html', 'no fallback: nothing started');
    assert.equal(Object.keys((await j.harvest()).events || {}).length, 0, 'no round written');
    // The signal is back: Aguila loads by itself.
    await ev(j, "(function(){ window.__on = true; window.dispatchEvent(new Event('online')); return 1; })()");
    await aguilaIn(j);
    assert.equal(await ev(j, 'window.__pulls.length'), 1);
});
