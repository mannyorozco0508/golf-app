// ============================================================================
// 074 - OPENSTREETMAP COURSE DATA SAVED FOR EVERYONE (gpsCourse's OSM mode) - IN REAL CHROME (phone GPS mode)
//
// Manny (Oct 25, "B: server save"): "gpsCourse fetches OSM (with the mirrors + retry) and saves the
// holes/greens with admin rights to a server-only node, OSM credit included; phones read it, can't write it."
// The app, for an OpenStreetMap-only course (Shortys, osm_w1540940976):
//   1  first load: gps_courses/<key> is empty -> gpsCourse (the key only) saves and answers; GPS from
//      OpenStreetMap; the phone asks OpenStreetMap 0 times; the ODbL credit is kept with it; no phone write;
//   2  the second golfer: the saved copy (gps_courses/<key>) - 0 gpsCourse calls, 0 OpenStreetMap calls;
//   3  a copy over 90 days old: used at once, and ONE background gpsCourse { refresh: true };
//   4  the server slow (25 s): the course is picked at 20 s with "holes on the way" and the phone does NOT
//      ask OpenStreetMap itself meanwhile; then the holes land - still 0 phone asks;
//   5  the server busy (every server failed): "Map data server busy, try again." + the retry link; 0 phone asks;
//   6  the server still fetching when the phone stops waiting (osmCallMs): busy line, 0 phone asks;
//   7  gpsCourse not there (404 - not deployed yet): the phone's own 071 lookup (it works either way);
//   8  a truly empty course (server 'none'): "Tap the middle of the green" (071);
//   9  the GPS map shows the OpenStreetMap credit on a mapped hole of an OSM-only course.
// The Cloud Functions and OpenStreetMap are stood in at fetch; the database is the cold-arrival stand-in.
// Negative control: dfcf6f48 (071) - 1-6 and 9 fail there.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const KEY = 'osm_w1540940976', PT = [43.1789, -124.394];
function elements() {
    const el = [];
    for (let n = 1; n <= 3; n++) {
        const la = PT[0] + n * 0.0015, lo = PT[1], g = la + 0.0008, d = 0.00012;
        el.push({ type: 'way', id: 900 + n, tags: { golf: 'hole', ref: String(n), par: '3' }, geometry: [{ lat: la, lon: lo }, { lat: la + 0.0008, lon: lo }] });
        el.push({ type: 'way', id: 950 + n, tags: { golf: 'green' }, geometry: [{ lat: g - d, lon: lo - d }, { lat: g - d, lon: lo + d }, { lat: g + d, lon: lo + d }, { lat: g + d, lon: lo - d }, { lat: g - d, lon: lo - d }] });
    }
    return el;
}
const ATTR = { text: '© OpenStreetMap contributors, ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' };
const REC = (at) => ({ v: 1, src: 'osm', key: KEY, osm: 'way/1540940976', name: 'Shortys', course: { type: 'way', id: 1540940976, tags: { leisure: 'golf_course', name: 'Shortys' }, center: { lat: PT[0], lon: PT[1] } },
    osm3s: { timestamp_osm_base: '2026-10-25T00:00:00Z' }, osmBase: '2026-10-25T00:00:00Z', fetched: new Date(at).toISOString(), fetchedAt: at, attribution: ATTR, n: 3, elements: elements() });
// gpsSearch: no online answer (the phone's case in 071). gpsCourse for an osm_ key: window.__osmMode
// 'save' (after __osmDelay ms: ready + the record) | 'busy' | 'none' | 'never' | '404'.
const FUNCS = "(function(){ window.__fn = []; window.__over = 0; var of = window.fetch; var REC = " + JSON.stringify(REC(Date.now())) + ";"
    + " window.fetch = function (u, init) { var s = String(u);"
    + "  if (/interpreter/.test(s)) { window.__over++; var q = decodeURIComponent(String(init && init.body || '').replace(/^data=/, '')); var j;"
    + "   if (/leisure/.test(q)) j = { elements: [REC.course] }; else j = { osm3s: REC.osm3s, elements: REC.elements };"
    + "   return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(j); } }); }"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]);"
    + "  if (m[1] === 'gpsCourse' && /^osm_/.test(data.courseId)) { var mode = window.__osmMode || 'save';"
    + "   if (mode === '404') return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.reject(new Error('html')); } });"
    + "   if (mode === 'never') return new Promise(function (ok, no) { if (init.signal) init.signal.addEventListener('abort', function () { var e = new Error('aborted'); e.name = 'AbortError'; no(e); }); });"
    + "   var res = mode === 'save' ? { status: 'ready', osm: REC, src: 'overpass' } : { status: mode };"
    + "   return new Promise(function (ok) { setTimeout(function () { ok({ ok: true, status: 200, json: function () { return Promise.resolve({ result: res }); } }); }, window.__osmDelay || 300); }); }"
    + "  var res2 = m[1] === 'gpsSearch' ? { status: 'error', results: [] } : { status: 'nogps' };"
    + "  return new Promise(function (ok) { setTimeout(function () { ok({ ok: true, status: 200, json: function () { return Promise.resolve({ result: res2 }); } }); }, 300); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true}, window.__cfgExtra || {});}});})();";
const X = (e) => ({ expression: e });
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const TAP_OSM = (name) => X("(function(){ var b=document.querySelector('#sf [data-sf-osm][data-sf-name=\"" + name + "\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()");
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, note: (document.getElementById('sf-osmnote')||{}).innerText||'',"
    + " retry: !!document.querySelector('[data-sf=osmretry]'), pickBox: (document.getElementById('sf-osmpick')||{}).innerText||'',"
    + " gps: (function(){ var k=document.getElementById('course-select').value; try { var g=HardPanCourse.gps(k, null, null); return g && g.holes ? Object.keys(g.holes).length : 0; } catch(e) { return -1; } })(),"
    + " osmFn: (window.__fn||[]).filter(function(c){ return c[0]==='gpsCourse' && /^osm_/.test(c[1].courseId); }).map(function(c){ return c[1]; }), over: window.__over,"
    + " kept: (function(){ try { return JSON.parse(localStorage.getItem('hardpan_osm_v1_" + KEY + "')||'null'); } catch(e) { return null; } })(),"
    + " writes: (window.__coldWrites||[]).map(function(w){ return w.op + ' ' + w.path; }) })";
const AT_BANDON = [43.1789, -124.3935];
const PAUSE = { sleep: 1800 };
const SETTLED = { waitFor: "document.querySelectorAll('#sf [data-sf-osm]').length > 0 && !/Searching all courses/.test(document.getElementById('sf').innerText)", timeout: 15000 };
const PICKED = { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && !!document.getElementById('sf-osmnote')", timeout: 40000 };
const open = (steps, opts) => {
    const o = opts || {};
    const db = { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} };
    if (o.saved) db.gps_courses = { [KEY]: o.saved };
    return arriveCold({ url: fileUrl('admin.html', 'start=quick'), db, settleMs: 2500, webgl: !!o.webgl, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + (o.pre || '') + iapStub({ active: true }) + FUNCS + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}"
            + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
            { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: AT_BANDON[0], longitude: AT_BANDON[1], accuracy: 10 } } },
            { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
            { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
            { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 },
            TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }].concat(steps) });
};
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const noPhoneWrite = (s) => assert.deepEqual(s.writes.filter((w) => /gps_courses|course_gps|gps_osm|global_courses\/osm_/.test(w)), [], 'the phone writes no course data: ' + JSON.stringify(s.writes));
const DAY = 86400000;

test('first load: gpsCourse (the key only) saves and answers; GPS from OpenStreetMap; 0 phone OpenStreetMap asks; credit kept; no phone write', { timeout: 150000 }, async () => {
    const r = await open([TAP_OSM('Shortys'), PICKED, { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.key, KEY);
    assert.match(s.note, /GPS from OpenStreetMap \(3 of 18 holes mapped\)/);
    assert.equal(s.gps, 3);
    assert.equal(s.over, 0, 'the phone did not ask OpenStreetMap');
    assert.deepEqual(s.osmFn, [{ courseId: KEY }], 'one gpsCourse call, the key only (no position)');
    assert.deepEqual(s.kept && s.kept.attribution, ATTR, 'the ODbL credit is kept with the copy');
    assert.equal(s.kept.from, 'shared');
    noPhoneWrite(s);
});

test('the second golfer: the saved copy - 0 gpsCourse calls, 0 OpenStreetMap calls', { timeout: 150000 }, async () => {
    const r = await open([TAP_OSM('Shortys'), PICKED, { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 1500 }, X(SF)], { saved: REC(Date.now() - 10 * DAY) });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.gps, 3); assert.equal(s.over, 0); assert.deepEqual(s.osmFn, [], '0 gpsCourse calls');
    noPhoneWrite(s);
});

test('a copy over 90 days old: used at once, and ONE background gpsCourse { refresh: true }', { timeout: 150000 }, async () => {
    const r = await open([TAP_OSM('Shortys'), PICKED, { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 2500 }, X(SF)], { saved: REC(Date.now() - 91 * DAY) });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.gps, 3); assert.equal(s.over, 0);
    assert.deepEqual(s.osmFn, [{ courseId: KEY, refresh: true }], 'one background refresh');
});

test('the server slow (25 s): picked at 20 s with "holes on the way", the phone does NOT ask OpenStreetMap meanwhile; then the holes land', { timeout: 180000 }, async () => {
    const r = await open([X('window.__osmDelay = 25000; 1'), TAP_OSM('Shortys'), PICKED, { sleep: 300 }, X(SF),
        { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [mid, end] = J(r);
    assert.match(mid.note, /on the way from OpenStreetMap/, 'holes on the way');
    assert.equal(mid.over, 0, 'no phone ask while the server fetches');
    assert.equal(end.gps, 3); assert.equal(end.over, 0);
    assert.equal(end.osmFn.length, 1, 'one gpsCourse call');
});

test('the server busy: "Map data server busy, try again." + the retry link; 0 phone OpenStreetMap asks', { timeout: 150000 }, async () => {
    const r = await open([X("window.__osmMode = 'busy'; 1"), TAP_OSM('Shortys'), PICKED, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.note, /Map data server busy, try again\./);
    assert.match(s.note, /Couldn’t reach OpenStreetMap/, '071 sentence kept');
    assert.equal(s.retry, true, 'Try OpenStreetMap again');
    assert.equal(s.over, 0);
});

test('the server still fetching when the phone stops waiting: busy line, 0 phone asks', { timeout: 150000 }, async () => {
    const r = await open([X("window.__osmMode = 'never'; 1"), TAP_OSM('Shortys'), PICKED,
        { waitFor: "/Map data server busy/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 300 }, X(SF)], { pre: 'window.__cfgExtra = { osmCallMs: 4000 };' });
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.note, /Map data server busy, try again\./); assert.equal(s.over, 0);
});

test('gpsCourse not there (404, not deployed yet): the phone\'s own 071 lookup - it works either way', { timeout: 150000 }, async () => {
    const r = await open([X("window.__osmMode = '404'; 1"), TAP_OSM('Shortys'), PICKED, { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.gps, 3); assert.ok(s.over >= 2, 'the phone asked OpenStreetMap itself');
    assert.equal(s.kept.from, undefined, 'its own lookup');
});

test('a truly empty course (server none): "Tap the middle of the green" (071)', { timeout: 150000 }, async () => {
    const r = await open([X("window.__osmMode = 'none'; 1"), TAP_OSM('Shortys'), PICKED, { sleep: 500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.match(s.note, /No GPS map data for Shortys yet — on the map, “Tap the middle of the green”/);
    assert.doesNotMatch(s.note, /busy/); assert.equal(s.over, 0);
});

test('the GPS map shows the OpenStreetMap credit on hole 1 of an OSM-only course', { timeout: 180000 }, async () => {
    const r = await open([TAP_OSM('Shortys'), PICKED, { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 30000 }, { sleep: 500 },
        X("(function(){ var b=document.querySelector('[data-sf=startgps]'); if(b) b.click(); return b ? 'start' : 'NO START'; })()"),
        { waitFor: "!!document.querySelector('#gps-overlay .gps-credit-osm') && !!document.querySelector('#gps-overlay .gps-map')", timeout: 60000 }, { sleep: 8000 },
        X("JSON.stringify((function(){ var c=document.querySelector('#gps-overlay .gps-credit-osm'); return { shown: !!c && getComputedStyle(c).display !== 'none', text: c ? c.innerText : '', credit: (document.querySelector('#gps-overlay .gps-credit')||{}).innerText||'' }; })())")], { webgl: true });
    assert.equal(r.ok, true, r.reason);
    const c = J(r).pop();
    assert.equal(c.shown, true, 'credit shown: ' + JSON.stringify(c));
    assert.match(c.text, /OpenStreetMap/);
});
