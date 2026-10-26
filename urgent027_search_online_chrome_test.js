// ============================================================================
// URGENT-027 - THE COURSE SEARCH LOOKS ONLINE BY ITSELF, IN REAL CHROME (phone GPS mode).
//
// Manny, 12:25 PM: "Aguila" showed "No course in the list by that name." and nothing else.
//   1  found: fewer than 3 local matches -> after a 600 ms pause, "Searching all courses…", then
//      the online rows (city/state, ✓ GPS only where GolfAPI has greens); "Aguila GC" / "aguila"
//      are one query; typing fast is one call; the same query again (30 days) is no call; a
//      course we already list stays one row; "Not listed? Add a course" under the results.
//      A tap pulls it (gpsCourse) and its card record is the pick, with its tees.
//   2  a new course needs sign-in: "Sign in to load Aguila Golf Course."
//   3  nothing online: "No course found by that name." + "Not listed? Add a course".
//   4  offline: said plainly, no spinner forever.
//   5  local, forgiving: a typo ("papgo") and "Papago GC" still find Papago.
// gps-live stood in (the real ones are our Cloud Functions). Synthetic course data only.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const AGUILA = { name: 'Aguila Golf Course', data: CD, tees: { male: [TEE('Blue', 6850, 72.1, 124), TEE('White', 6400, 70.0, 119)] }, location: { city: 'Laveen', state: 'AZ', latitude: 33.37, longitude: -112.17 } };
const RES = {
    found: [{ id: '888001', club: 'Aguila Golf Course', course: 'Aguila Golf Course', name: 'Aguila Golf Course', city: 'Laveen', state: 'AZ', holes: 18, gps: true },
        { id: '888002', club: 'Aguila Golf Course', course: 'Executive', name: 'Aguila Golf Course (Executive)', city: 'Laveen', state: 'AZ', holes: 9, gps: false }],
    none: [],
};
// search: 'found' | 'none' | 'offline'; course: 'ready' | 'account'. Counts the calls.
const LIVE = (search, course) => "(function(){ var real; window.__searches = []; Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return real && Object.assign({}, real, {"
    + " on: function () { return true; },"
    + " find: function (name) { return Promise.resolve({ status: 'none', tried: [name] }); },"
    + " search: function (q) { window.__searches.push(q); var hits = " + JSON.stringify(RES[search] || []) + "; if (/papago/.test(q)) hits = [{ id: '777000', club: 'Papago Golf Course', course: 'Papago Golf Course', name: 'Papago Golf Course', city: 'Phoenix', state: 'AZ', holes: 18, gps: true }];"
    + "   return new Promise(function (ok) { setTimeout(function () { ok(" + (search === 'offline' ? "{ status: 'offline' }" : "{ status: 'ok', results: hits }") + "); }, 900); }); },"
    + " course: function (id, key) { window.__pulled = [id, key || null]; " + (course === 'account' ? "return Promise.resolve({ status: 'account' });" : "return firebase.database().ref('global_courses/gapi_' + id).set(" + JSON.stringify(AGUILA) + ").then(function () { return { status: 'ready', cardKey: 'gapi_' + id, course: { id: id, h: {} } }; });") + " } }); },"
    + " set: function (v) { real = v; } }); })();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, text: (document.getElementById('sf')||{}).innerText||'', web: (document.getElementById('sf-web')||{}).innerText||'',"
    + " webRows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }),"
    + " rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.getAttribute('data-sf-course') + ' ' + b.innerText.replace(/\\n/g,' | '); }),"
    + " tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){return b.innerText.split('\\n')[0];}), searches: window.__searches, pulled: window.__pulled || null,"
    + " notListed: Array.prototype.some.call(document.querySelectorAll('#sf [data-sf=fullcourse]'), function(b){ return /Not listed\\? Add a course/.test(b.innerText); }) })";
const open = (search, course, steps) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LIVE(search, course) + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.4560, longitude: -111.9480, accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 500 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));

test('found online: one call after the pause, "Searching all courses…", rows with city/state + ✓ GPS; cached; a tap loads it with its tees', { timeout: 150000 }, async () => {
    const r = await open('found', 'ready', [
        // typed fast: one online call, after the pause
        TYPE('agu'), { sleep: 150 }, TYPE('agui'), { sleep: 150 }, TYPE('Aguila GC'),
        { waitFor: "/Searching all courses/.test((document.getElementById('sf-web')||{}).innerText||'')", timeout: 5000 }, X(SF),
        { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length > 0", timeout: 8000 }, X(SF),
        // another course, then the first again (cached on this phone: no call)
        TYPE('encanto'), { sleep: 2200 }, TYPE('aguila'), { sleep: 1500 }, X(SF),
        X("(function(){ var b=document.querySelector('#sf [data-sf-web=\"888001\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"),
        { waitFor: "document.getElementById('course-select').value === 'gapi_888001' && document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [busy, s, again, picked] = J(r);
    assert.match(busy.web, /Searching all courses…/);
    assert.deepEqual(s.searches, ['aguila'], 'typed fast: one online call, "GC" dropped');
    // 076 (Manny, long names): the course big, the club + town small; the same name once, the town small.
    assert.deepEqual(s.webRows, ['Aguila Golf Course | Laveen, AZ | ✓ GPS', 'Executive | Aguila Golf Course · Laveen, AZ'], 'city/state, ✓ GPS only with greens');
    assert.equal(s.notListed, true, '"Not listed? Add a course" under the results');
    assert.doesNotMatch(s.text, /No course in the list by that name/);
    assert.deepEqual(again.searches, ['aguila', 'encanto'], 'the same query again: from this phone, no second call');
    assert.equal(again.webRows.length, 2);
    assert.deepEqual(picked.pulled, ['888001', null], 'pulled once');
    assert.equal(picked.key, 'gapi_888001', 'its card record is the pick');
    assert.deepEqual(picked.tees, ['Blue', 'White']);
});

test('a course we already list stays one row; a typo or "GC" still finds it locally', { timeout: 120000 }, async () => {
    const r = await open('found', 'ready', [TYPE('papgo'), { sleep: 2500 }, X(SF), TYPE('Papago GC'), { sleep: 2500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [typo, gc] = J(r);
    for (const s of [typo, gc]) {
        assert.ok(s.rows.some((t) => /Papago/.test(t)), 'Papago found locally: ' + JSON.stringify(s.rows));
        assert.equal(s.webRows.filter((t) => /Papago/.test(t)).length, 0, 'no second, online Papago row: ' + JSON.stringify(s.webRows));
    }
});

test('a new course needs sign-in: "Sign in to load Aguila Golf Course."', { timeout: 120000 }, async () => {
    const r = await open('found', 'account', [TYPE('aguila'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length > 0", timeout: 8000 },
        X("(function(){ document.querySelector('#sf [data-sf-web]').click(); return 1; })()"), { waitFor: "/Sign in to load/.test((document.getElementById('sf-web')||{}).innerText||'')", timeout: 8000 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.web, /^Sign in to load Aguila Golf Course\.[\s\S]*Sign in\nPick another course$/);
});

test('nothing online: "No course found by that name." and "Not listed? Add a course"', { timeout: 120000 }, async () => {
    const r = await open('none', 'ready', [TYPE('zzqxgolf'), { sleep: 2500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.deepEqual(s.searches, ['zzqxgolf']);
    assert.match(s.text, /RESULTS FOR 'zzqxgolf'\nNo course found by that name\.\nNot listed\? Add a course/);
});

test('offline: said plainly, no spinner forever', { timeout: 120000 }, async () => {
    const r = await open('offline', 'ready', [TYPE('aguila'), { sleep: 2500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.web, /No signal — searching all courses needs a connection\./);
    assert.doesNotMatch(s.text, /Searching all courses/);
});
