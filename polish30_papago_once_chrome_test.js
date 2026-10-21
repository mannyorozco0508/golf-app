// ============================================================================
// POLISH #30 (029, URGENT-036) - PAPAGO IS LISTED ONCE, IN REAL CHROME.
//
// Game Day > Course showed "Papago Golf Club" AND "Papago Golf Club (Papago) · Phoenix, AZ".
// The first is the app's built-in directory row (course-data.js az_papago - no record of its own in
// global_courses); the second is the shared record the GPS uses (global_courses/gapi_012141520636857668694,
// set up from GolfAPI, its GPS in gps_courses/012141520636857668694). The course resolver (front-door.js
// HardPanCourse) already folds the directory row into the shared one for the GPS door; Round Setup's own
// dropdown listed both raw. Now it asks the same resolver: one row, the GPS one.
//   1  Game Day > Course, typing "Papago": one Papago row; tapping it picks gapi_...694.
//   2  Game Day > Course, the untyped list (NEAR YOU groups + shared courses): one Papago row.
//   3  The GPS door's search and NEAR YOU: one Papago row, gapi_...694.
// Synthetic course data shaped like the live records (names, keys, location) - no database writes.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const KEY = 'gapi_012141520636857668694';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const PAPAGO = { name: 'Papago Golf Club (Papago)', data: CD, tees: { male: [TEE('Black', 7419, 75.0, 130), TEE('White', 6475, 70.9, 125)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 }, source: { provider: 'golfapi', id: '012141520636857668694' } };
const DB = () => ({ events: {}, global_courses: { [KEY]: PAPAGO }, trips: {}, organizers: {}, tournaments: {} });
const HERE = { latitude: 33.4560, longitude: -111.9480, accuracy: 10 };
const geo = "try{ navigator.geolocation.getCurrentPosition = function (ok) { setTimeout(function(){ ok({ coords: " + JSON.stringify(HERE) + " }); }, 50); }; }catch(e){}";
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(j, expr, ms) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await j.evaluate('!!(' + expr + ')')) return true; } catch (e) {} await sleep(250); } return false; }
// The Game Day dropdown's Papago rows (text only: the row carries no key), after typing q.
const GD_ROWS = (q) => "(function(){ var i=document.getElementById('course-search-input'); i.value=" + JSON.stringify(q) + "; i.dispatchEvent(new Event('focus')); i.dispatchEvent(new Event('input',{bubbles:true}));"
    + " return JSON.stringify(Array.prototype.filter.call(document.querySelectorAll('#course-dropdown .custom-select-option'), function(r){ return /Papago/.test(r.textContent) && !/Search online/.test(r.textContent); }).map(function(r){ return r.textContent; })); })()";

async function gameDay() {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 }, preScript: 'window.__hardpanDoors = true;' + geo });
    journeys.push(j);
    await j.goto(fileUrl('admin.html', 'game=PPG030&eventType=quick'), 3500);
    assert.ok(await until(j, "typeof globalCourses !== 'undefined' && !!globalCourses['" + KEY + "'] && !!document.getElementById('course-search-input')", 20000), 'Round Setup has the shared Papago record');
    return j;
}

test('#30 Game Day > Course, typing "Papago": ONE Papago row, and it is the GPS record', { timeout: 120000 }, async () => {
    const j = await gameDay();
    const rows = JSON.parse(await j.evaluate(GD_ROWS('Papago')));
    assert.equal(rows.length, 1, 'one Papago row: ' + JSON.stringify(rows));
    assert.match(rows[0], /^Papago Golf Club \(Papago\)/, 'the shared record (✓ GPS) is the one shown');
    await j.evaluate("(function(){ var r=Array.prototype.filter.call(document.querySelectorAll('#course-dropdown .custom-select-option'), function(r){ return /Papago/.test(r.textContent) && !/Search online/.test(r.textContent); })[0]; r.click(); return 1; })()");
    assert.ok(await until(j, "document.getElementById('course-select').value === '" + KEY + "'", 10000), 'the pick is ' + KEY);
    // The directory entry itself stays: a saved round on az_papago still has its name.
    assert.equal(await j.evaluate("getCourseNameById('az_papago', globalCourses)"), 'Papago Golf Club');
    // Other courses are untouched: an unrelated search still lists its own rows.
    const ts = JSON.parse(await j.evaluate("(function(){ var i=document.getElementById('course-search-input'); i.value='Talking'; i.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#course-dropdown .custom-select-option'), function(r){ return r.textContent; }).filter(function(t){ return /Talking/.test(t) && !/Search online/.test(t); })); })()"));
    assert.equal(ts.length, 2, 'O\'odham and Piipaash still listed: ' + JSON.stringify(ts));
});

test('#30 Game Day > Course, the untyped list: ONE Papago row', { timeout: 120000 }, async () => {
    const j = await gameDay();
    const rows = JSON.parse(await j.evaluate(GD_ROWS('')));
    assert.equal(rows.length, 1, 'one Papago row: ' + JSON.stringify(rows));
});

test('#30 GPS door: search "papago" and NEAR YOU each show Papago ONCE, the GPS record', { timeout: 150000 }, async () => {
    const j = await openJourney({ db: DB(), viewport: { width: 393, height: 852 }, preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + geo });
    journeys.push(j);
    try { await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] }); await j.cdp('Emulation.setGeolocationOverride', HERE); } catch (e) {}
    await j.goto(fileUrl('home.html', ''), 2500);
    await j.evaluate("document.querySelector('[data-hp-act=\"sgpsdoor\"]').click()");
    assert.ok(await until(j, "/admin\\.html/.test(location.pathname) && !!document.getElementById('sf') && document.querySelectorAll('#sf [data-sf-course]').length > 0", 30000), 'Course & Tees, NEAR YOU drawn');
    const ROWS = "JSON.stringify(Array.prototype.filter.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return /Papago/.test(b.textContent); }).map(function(b){ return b.getAttribute('data-sf-course'); }))";
    // NEAR YOU: Papago is either the picked course (the card on top) or one row - never two rows.
    const picked = await j.evaluate("document.getElementById('course-select').value");
    const near = JSON.parse(await j.evaluate(ROWS));
    assert.ok(near.length <= 1 && near.every((k) => k === KEY), 'NEAR YOU: ' + JSON.stringify(near) + ' picked ' + picked);
    assert.ok(near.length === 1 || picked === KEY, 'Papago is found near you (a row, or the picked course): ' + JSON.stringify({ near, picked }));
    await j.evaluate("(function(){ var b=document.querySelector('[data-sf=change]'); if (b) b.click(); var i=document.getElementById('sf-q'); i.value='papago'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
    assert.ok(await until(j, "/RESULTS/.test((document.getElementById('sf')||{}).innerText||'')", 10000), 'search results');
    await sleep(800);
    const hits = JSON.parse(await j.evaluate(ROWS));
    assert.deepEqual(hits, [KEY], 'search: one Papago row, the GPS record');
});
