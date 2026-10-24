// ============================================================================
// 067 SEARCH ORDER - IN REAL CHROME (phone GPS mode). Shares the 064 stand-ins below.
// Manny, 2:32 PM (URGENT-067): "Arizona country club" put The Arizona Country Club (Phoenix) LAST and the
// Arizona Biltmore rows had no distance - "we still need to see the closest courses first ... We should
// only add." Now: the name as typed first, then starts-with, then the rest closest first; a distance on
// every row whose place is known (online rows and point-less directory rows: the course the app ships
// under that name). NEAR YOU is unchanged with the box empty.
// (the 064 header follows)
// 064 SEARCH - IN REAL CHROME (phone GPS mode).
//
// Manny, typed in Claude Code: "Goldendale: fix A (show OSM-only courses as 'Not set up yet · Add this
// course'); apply to Starfire too."
//   1  Goldendale: search shows "Goldendale Golf Club · Not set up yet · Add this course" (city under the
//      name, no ✓ GPS, no "Tap to load"); a tap opens Round Setup's Add a course with the name filled
//      in (and the city shown); nothing written to the database.
//   2  any OpenStreetMap-only course (one from another state's list, picked from the app's own list).
//   3  a course we have (Papago) still shows ✓ GPS exactly once - no "Not set up yet" twin.
//   4  Starfire from NEAR YOU: GolfAPI's two courses at one club (King 18 + Mulligan, Scottsdale) and our
//      row's city guess (Paradise Valley): "Starfire Golf Club has 2 courses. Which one?" - King 18
//      first, then Mulligan 9 - never "isn't in our course data"; nothing kept as a 30-day miss (an old
//      mark from before is not trusted either); King 18 tapped: pulled with NO ourKey (no gps_links
//      write), its card is the pick, its tees listed.
// The Cloud Functions are stood in by a fetch stand-in (gpsSearch answers the SAVED Starfire answer;
// gpsCourse's server write is done by the stand-in, path recorded). No network, no GolfAPI call.
// Synthetic course cards only.
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
const KING_ID = '0121160834025376', MULL_ID = '0111744455094783703';
const KING_REC = { name: 'Starfire Golf Club (King 18)', data: CD, tees: { male: [TEE('Blue', 6400, 70.5, 124), TEE('White', 6000, 68.9, 118)] }, location: { city: 'Scottsdale', state: 'AZ', latitude: 33.5893, longitude: -111.9116 } };
// gps_search/starfire_golf_club, saved Oct 23 (064-6d, read-only copy).
const SAVED = {
    'Starfire Golf Club': [
        { id: KING_ID, club: 'Starfire Golf Club', course: 'King 18', name: 'Starfire Golf Club (King 18)', city: 'Scottsdale', state: 'AZ', holes: 18, gps: true, cached: false },
        { id: MULL_ID, club: 'Starfire Golf Club', course: 'Mulligan', name: 'Starfire Golf Club (Mulligan)', city: 'Scottsdale', state: 'AZ', holes: 9, gps: true, cached: false }],
    arizona: [
        { id: '670000000000000001', club: 'Arizona Golf Resort', course: 'Championship', name: 'Arizona Golf Resort (Championship)', city: 'Mesa', state: 'AZ', holes: 18, gps: true },
        { id: '670000000000000002', club: 'Arizona Grand Golf Course', course: 'Arizona Grand', name: 'Arizona Grand Golf Course (Arizona Grand)', city: 'Phoenix', state: 'AZ', holes: 18, gps: true },
        { id: '670000000000000003', club: 'Arizona National Golf Club', course: 'Arizona National', name: 'Arizona National Golf Club (Arizona National)', city: 'Tucson', state: 'AZ', holes: 18, gps: true },
        { id: '670000000000000004', club: 'Arizona Traditions Golf Club', course: '18-hole course', name: 'Arizona Traditions Golf Club (18-hole course)', city: 'Surprise', state: 'AZ', holes: 18, gps: true },
        { id: '670000000000000005', club: 'The Arizona Country Club', course: 'The Arizona Country Club', name: 'The Arizona Country Club (The Arizona Country Club)', city: 'Phoenix', state: 'AZ', holes: 18, gps: true }],
};
// THE CLOUD FUNCTIONS, STOOD IN AT fetch (gps-live's own find / course run for real): counts each call.
const FUNCS = "(function(){ window.__fn = []; var of = window.fetch; var SAVED = " + JSON.stringify(SAVED) + ", KING = " + JSON.stringify(KING_REC) + ";"
    + " window.fetch = function (u, init) { var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(String(u)); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') res = Promise.resolve({ status: 'ok', results: SAVED[data.name] || [] });"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + KING_ID + "') res = firebase.database().ref('global_courses/gapi_" + KING_ID + "').set(KING).then(function () { return { status: 'ready', cardKey: 'gapi_" + KING_ID + "', course: { id: '" + KING_ID + "', h: { '1': { green: [[33.5900, -111.9100]], tee: [33.5880, -111.9120] } } } }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, text: (document.getElementById('sf')||{}).innerText||'', box: (document.getElementById('sf-lookup')||{}).innerText||'',"
    + " osm: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-osm]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }),"
    + " rows: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return b.getAttribute('data-sf-course') + ' ' + b.innerText.replace(/\\n/g,' | '); }),"
    + " web: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }),"
    + " picks: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-lkpick]'), function(b){ return b.getAttribute('data-sf-lkpick') + ' ' + b.innerText.replace(/\\n/g,' | '); }),"
    + " tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){return b.innerText.split('\\n')[0];}),"
    + " sfShown: (function(){ var s=document.getElementById('sf'); return !!s && getComputedStyle(s).display !== 'none' && s.style.visibility !== 'hidden'; })(),"
    + " form: (function(){ var f=document.getElementById('new-course-form'); return f ? getComputedStyle(f).display : null; })(), step1: (function(){ var s=document.getElementById('wizard-step-1'); return !!s && s.offsetParent !== null; })(),"
    + " name: (document.getElementById('new-course-name-input')||{}).value, where: (document.getElementById('sf-new-course-where')||{}).textContent || '', back: (document.getElementById('sf-return')||{}).textContent || '',"
    + " fn: window.__fn, look: window.__sfLook || [], mark: localStorage.getItem('hardpan_autolook_az_starfire'), writes: (window.__coldWrites||[]).map(function(w){ return w.op + ' ' + w.path; }),"
    + " start: (function(){ var b=document.querySelector('[data-sf=startgps]'); return b ? { text: b.innerText, disabled: b.disabled } : null; })() })";
const open = (at, steps, pre) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const PAPAGO = [33.4560, -111.9480];
// A course of ours with GPS (as in urgent060): the app's GolfAPI file holds Talking Stick South.
const GAPI_ID = '990000000000000001';
const GAPI = { v: 1, built: 'test', links: {}, courses: { [GAPI_ID]: { id: GAPI_ID, club: 'Talking Stick Golf Club', course: 'South - Piipaash', city: 'Scottsdale', state: 'AZ', lat: 33.539874, lng: -111.870432, holes: 18,
    h: { 1: { g: { f: [33.5445, -111.8690], c: [33.5444, -111.8691], b: [33.5443, -111.8692] }, t: { b: [33.5467, -111.8663], f: [33.5460, -111.8678] } } } } } };
const AT_TS = [33.5399, -111.8704];
const nearStarfire = [33.5990, -111.9078];   // ~0.7 mi north of Starfire's point: listed, not "You're here"
const writesOf = (s) => s.writes.filter((w) => !/^set global_courses\/gapi_\d+$/.test(w));   // (the stand-in server's own write)


test('"Arizona country club": The Arizona Country Club FIRST, then the rest closest first; a distance on every row we can place', { timeout: 150000 }, async () => {
    const ALL = "JSON.stringify({ all: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course], #sf [data-sf-web], #sf [data-sf-osm]'), function(b){ return b.innerText.replace(/\\n/g,' | '); }), text: (document.getElementById('sf')||{}).innerText||'', fn: window.__fn })";
    const r = await open(PAPAGO, [X(ALL), TYPE('Arizona country club'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 5", timeout: 15000 }, { sleep: 600 }, X(ALL),
        TYPE(''), { sleep: 1200 }, X(ALL)]);
    assert.equal(r.ok, true, r.reason);
    const [before, s, empty] = J(r);
    const mi = (t) => { const m = / \| ([\d.]+) mi/.exec(t); return m ? Number(m[1]) : null; };
    assert.match(s.all[0], /^The Arizona Country Club \(The Arizona Country Club\) \| [\d.]+ mi · Phoenix, AZ · ✓ GPS$/, 'the name as typed is FIRST: ' + JSON.stringify(s.all));
    const bilt = s.all.filter((t) => /^Arizona Biltmore/.test(t));
    assert.equal(bilt.length, 2, JSON.stringify(s.all));
    bilt.forEach((t) => assert.ok(mi(t) != null && /Tap to load/.test(t), 'Biltmore has its distance (and still "Tap to load"): ' + t));
    // every row has a distance except a course the app has no place for (Arizona National, Tucson: none in our lists)
    s.all.forEach((t) => { if (!/Arizona National/.test(t)) assert.ok(mi(t) != null, 'a distance: ' + t); });
    const rest = s.all.slice(1).map(mi).filter((d) => d != null);
    assert.deepEqual(rest, rest.slice().sort((a, b) => a - b), 'then the closest first: ' + JSON.stringify(s.all));
    assert.ok(/Arizona National/.test(s.all[s.all.length - 1]) || s.all.slice(-3).some((t) => /Arizona National/.test(t)), 'no known place: after the ones with a distance');
    assert.equal(s.all.filter((t) => /Arizona Country Club/.test(t)).length, 1, 'no "Not set up yet" twin of it');
    assert.deepEqual(s.fn.map((c) => c[0] + ':' + c[1].name), ['gpsSearch:arizona'], 'one online search, the name only');
    // the box empty again: NEAR YOU is back on top, as before
    assert.match(empty.text, /NEAR YOU/);
    assert.doesNotMatch(empty.text, /RESULTS/);
    assert.match(before.text, /NEAR YOU/);
});
