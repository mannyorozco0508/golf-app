// ============================================================================
// URGENT-021 - NEVER MAKE THE GOLFER TYPE PARS FIRST, IN REAL CHROME (phone GPS mode).
//
// Manny, 8:40 AM: Papago from NEAR YOU showed "Enter its pars once" - "This is what I don't want to do."
// A picked course with no scorecard (or no GPS) is LOOKED UP BY ITSELF (gps-live find -> gpsCourse,
// stood in here - the real ones are our Cloud Functions), once per course per 30 days:
//   1  found: "Getting Papago's scorecard…", then its card's tees, and Start GPS starts the round.
//   2  not found: "Papago isn't in our course data yet." - Pick another course · Request this course ·
//      and last, small, "Enter pars yourself" (no big "Enter the pars" button); a second tap does
//      not look it up again (30 days).
//   3  setting up a new course needs sign-in: "Sign in to load Papago."
//   4  NEAR YOU: a course with no data says "Tap to load", never ✓ GPS.
// Synthetic course data only.
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
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 71, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const PAPAGO = { name: 'Papago Golf Club (Papago)', data: CD, tees: { male: [TEE('Black', 7068, 73.3, 132), TEE('Blue', 6600, 71.2, 127)] }, location: { city: 'Phoenix', state: 'AZ', latitude: 33.4560, longitude: -111.9480 } };
// The online lookup, stood in: answer = 'found' | 'none' | 'account'. Counts its calls.
const LIVE = (answer) => "(function(){ var real; window.__finds = 0; Object.defineProperty(window, 'HardPanGpsLive', { configurable: true, get: function () { return real && Object.assign({}, real, {"
    + " on: function () { return true; },"
    + " find: function (name) { window.__finds++; return Promise.resolve(" + (answer === 'none' ? "{ status: 'none', tried: [name] }" : "{ status: 'ok', clear: { id: '777000', club: 'Papago Golf Club', course: 'Papago' }, matches: [] }") + "); },"
    + " course: function (id, key) { window.__pulled = [id, key]; " + (answer === 'account' ? "return Promise.resolve({ status: 'account' });" : "return firebase.database().ref('global_courses/gapi_777000').set(" + JSON.stringify(PAPAGO) + ").then(function () { return { status: 'ready', cardKey: 'gapi_777000', course: { id: '777000', h: {} } }; });") + " } }); },"
    + " set: function (v) { real = v; } }); })();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, text: (document.getElementById('sf')||{}).innerText||'', box: (document.getElementById('sf-lookup')||{}).innerText||'', tees: Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){return b.innerText.split('\\n')[0];}), finds: window.__finds, pulled: window.__pulled || null, bigPars: !!document.querySelector('.sf-cta[data-sf=enterpars]'), papagoRow: (Array.prototype.filter.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return /Papago/.test(b.textContent); })[0]||{}).innerText||'', head: (document.getElementById('sf-course')||{}).innerText||'', look: window.__sfLook||[], lk: JSON.stringify(window.__sfLk||null) })";
const open = (answer, more) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + LIVE(answer) + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: 33.4560, longitude: -111.9480, accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "/Papago/.test((document.getElementById('sf-course')||{}).innerText||'')", timeout: 40000 }, { sleep: 300 }, X(SF)].concat(more) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));

test('found online: "Getting Papago\'s scorecard…", then its tees, and Start GPS starts the round - no typing', { timeout: 120000 }, async () => {
    const r = await open('found', [
        { waitFor: "document.querySelectorAll('#sf [data-sf-tee]').length > 0", timeout: 20000 }, { sleep: 800 }, X(SF),
        X("(function(){ var b=document.querySelector('[data-sf=\"startgps\"]'); if(b) b.click(); return 'start'; })()"),
        { waitFor: "/index\\.html/.test(location.pathname)", timeout: 40000 }, X("JSON.stringify({ at: location.pathname.split('/').pop() })")]);
    assert.equal(r.ok, true, r.reason);
    const [s0, s, end] = J(r);
    // Papago is the course you are at: picked, and looked up by itself ("Getting…" or already in).
    assert.ok(/Getting Papago Golf Club.s scorecard/.test(s0.box) || s0.key === 'gapi_777000', 'looked up by itself: ' + JSON.stringify(s0.box));
    assert.ok(!/^az_papago /.test(JSON.stringify(s.papagoRow)), 'one Papago row');
    assert.equal(s.look.length, 1, 'one lookup');
    assert.deepEqual(s.pulled, ['777000', 'az_papago'], 'one lookup, our key passed so the function can link it');
    assert.equal(s.key, 'gapi_777000', 'its new shared record is the pick');
    assert.deepEqual(s.tees, ['Black', 'Blue']);
    assert.equal(s.bigPars, false);
    assert.equal(end.at, 'index.html', 'Start GPS started the round');
});

test('not found: said plainly - Pick another course · Request this course · small "Enter pars yourself"; no second lookup within 30 days', { timeout: 120000 }, async () => {
    const r = await open('none', [{ waitFor: "/isn.t in our course data yet/.test((document.getElementById('sf-lookup')||{}).innerText||'')", timeout: 20000 }, X(SF),
        // Again, from search: the same course is not looked up again.
        X("(function(){ var b=document.querySelector('[data-sf=change]'); if (b) b.click(); var i=document.getElementById('sf-q'); i.value='papago'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"), { sleep: 1200 },
        X("(function(){ var b=document.querySelector('#sf [data-sf-course=\"az_papago\"]'); if (b) b.click(); return b ? 'tapped' : 'NO ROW'; })()"), { sleep: 1500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [, s, again] = J(r);
    assert.match(s.box, /^Papago Golf Club isn’t in our course data yet\.\nPick another course\nRequest this course\nEnter pars yourself$/);
    assert.equal(s.bigPars, false, 'no big "Enter the pars" button');
    assert.equal(s.look.length, 1, 'one lookup');
    assert.equal(again.look.length, 1, 'the same course again: not looked up again (30 days)');
    assert.match(again.box, /isn’t in our course data yet/);
});

test('setting up a new course needs sign-in: "Sign in to load Papago."', { timeout: 120000 }, async () => {
    const r = await open('account', [{ waitFor: "/Sign in to load/.test((document.getElementById('sf-lookup')||{}).innerText||'')", timeout: 20000 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [, s] = J(r);
    assert.match(s.box, /^Sign in to load Papago Golf Club\./);
    assert.match(s.box, /Sign in\nPick another course$/);
});
