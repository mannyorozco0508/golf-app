// ============================================================================
// ANDROID BACK OVER 080's "SCAN THE SCORECARD" SHEET, IN REAL CHROME (android-2.0, the add-on port of tfnew-5)
//   080: Add a course / the pars sheet get "📷 Scan the scorecard"; the scan opens its own sheet (#hcs-sheet,
//   gps-course-scan.js) - "Reading the card…", then the check grid with Use / Scan again / Type them instead.
//   A tap outside it does nothing, so before this port's fix the only Back probe that could fire was the page's
//   own - the sheet stayed up while the page underneath went back.
//   Now (front-door.js SHEETS_2 'course-scan'): Back on the grid = "Type them instead" - the sheet closes,
//   nothing is filled, the page stays. Back while the card is still being read does nothing (no button yet),
//   so a scan already counted is not thrown away; the grid still arrives.
//   Reached the way a user does: Round Setup's Add a course grid, tap the scan button, then the hardware key -
//   fired through the App plugin's backButton listener that front-door.js arms in the Android shell.
//   Capacitor says "android"; nothing else native is faked. The scan server, Cloud Functions and
//   OpenStreetMap are stood in at fetch (setup copied from course_scan_088_chrome_test.js).
//   WHAT THIS CANNOT PROVE: a real WebView's key routing, or the real camera. That is the emulator pass.
//   COUNTS (final file, on android-2.0-addons 6c4847a5 + the fix): 2 tests, 2 pass.
//   Control, restored by sha from a saved copy: front-door.js without the 'course-scan' row -> 1 pass / 1 fail.
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
// gpsSearch "bandon" - the LIVE answer, Oct 25 2026 10:52 AM (read through the existing function).
const R = (id, course, gps, holes, club) => ({ id, club: club || 'Bandon Dunes Golf Resort', course, name: (club || 'Bandon Dunes Golf Resort') + ' (' + course + ')', city: 'Bandon', state: 'OR', holes: holes || 18, gps, cached: false });
const BANDON = [R('01214152103626290926', 'Bandon Crossings', true, 18, 'Bandon Crossings Golf Course'), R('012141521036241695493', 'Bandon Dunes', true), R('0121658411581759626', 'Bandon Preserve', true),
    R('012141521036311111134', 'Bandon Trails', true), R('012141521036345307035', 'Old McDonald', true), R('012141521036276501913', 'Pacific Dunes', true),
    R('0121591635972407933', 'Sheep Ranch', false), R('011141521036379837276', 'Bandon Face Rock', true, 9, 'Bandon Face Rock Golf Course')];
const TRAILS = BANDON[3];
const TRAILS_REC = { name: TRAILS.name, data: CD, tees: { male: [{ name: 'Green', rating: 71, slope: 127, parTotal: 72, totalYards: 6300, holes: CD.map((h) => ({ par: h.par, yardage: 350 })) }] }, location: { city: 'Bandon', state: 'OR', latitude: 43.1782, longitude: -124.3856 } };
// gpsSearch answers by MODE: 'live' (the saved answer), 'limit' (the server's 20-a-day), 'error'.
const FUNCS = (mode) => "(function(){ window.__fn = []; var of = window.fetch; var MODE = " + JSON.stringify(mode) + ", SAVED = { bandon: " + JSON.stringify(BANDON) + ", 'pacific dunes': " + JSON.stringify([BANDON[5]]) + ", 'old mcdonald': " + JSON.stringify([BANDON[4]]) + ", 'bandon trails': [], 'Bandon Trails': [] }, TREC = " + JSON.stringify(TRAILS_REC) + ";"
    + " window.__over = 0; window.fetch = function (u, init) { var s = String(u);"
    // OPENSTREETMAP (Overpass), stood in: Shortys' outline, then 3 holes whose lines end in their greens.
    + "  if (/interpreter/.test(s)) { window.__over++; var q = decodeURIComponent(String(init && init.body || '').replace(/^data=/, '')); var j;"
    + "   if (window.__fail504 > 0) { window.__fail504--; return Promise.resolve({ ok: false, status: 504, json: function () { return Promise.reject(new Error('html')); } }); }"
    + "   if (window.__overBusy) j = { elements: [], remark: 'runtime error: Query timed out in query at line 1 after 26 seconds.' };"
    + "   else if (window.__overNone) j = { elements: [] };"
    + "   else if (/leisure/.test(q)) j = { elements: [{ type: 'way', id: 1540940976, tags: { leisure: 'golf_course', name: 'Shortys' }, center: { lat: 43.1789, lon: -124.394 } }] };"
    + "   else { var el = []; for (var n = 1; n <= 3; n++) { var la = 43.1789 + n * 0.0015, lo = -124.394; el.push({ type: 'way', id: 900 + n, tags: { golf: 'hole', ref: String(n), par: '3' }, geometry: [{ lat: la, lon: lo }, { lat: la + 0.0008, lon: lo }] });"
    + "     var g = la + 0.0008, d = 0.00012; el.push({ type: 'way', id: 950 + n, tags: { golf: 'green' }, geometry: [{ lat: g - d, lon: lo - d }, { lat: g - d, lon: lo + d }, { lat: g + d, lon: lo + d }, { lat: g + d, lon: lo - d }, { lat: g - d, lon: lo - d }] }); }"
    + "     j = { osm3s: { timestamp_osm_base: '2026-10-25T00:00:00Z' }, elements: el }; }"
    + "   return new Promise(function (ok) { setTimeout(function () { ok({ ok: true, status: 200, json: function () { return Promise.resolve(j); } }); }, window.__overDelay || 0); }); }"
    + "  var m = /cloudfunctions\\.net\\/(gps\\w+)$/.exec(s); if (!m) return of.apply(this, arguments);"
    + "  var data = JSON.parse(init.body).data; window.__fn.push([m[1], data]); var res;"
    + "  if (m[1] === 'gpsSearch') res = Promise.resolve(MODE === 'live' ? { status: 'ok', results: SAVED[data.name] || [] } : MODE === 'findonly' ? (data.name === 'bandon tr' ? { status: 'error', results: [] } : { status: 'ok', results: SAVED[data.name] || [] }) : { status: MODE, results: [] });"
    + "  else if (m[1] === 'gpsCourse' && data.courseId === '" + TRAILS.id + "') res = firebase.database().ref('global_courses/gapi_" + TRAILS.id + "').set(TREC).then(function () { return { status: 'ready', cardKey: 'gapi_" + TRAILS.id + "', course: { id: '" + TRAILS.id + "', h: { '1': { g: { c: [43.18, -124.386] }, t: { b: [43.178, -124.3856] } } } } }; });"
    + "  else res = Promise.resolve({ status: 'nogps' });"
    + "  return res.then(function (r) { return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve({ result: r }); } }); }, 300); }); }); };"
    + " setInterval(function () { try { var a = firebase.auth().currentUser; if (a && !a.getIdToken) a.getIdToken = function () { return Promise.resolve('stand-in'); }; } catch (e) {} }, 100);"
    + "})();"
    + "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true});}});})();";
const X = (e) => ({ expression: e });
const GAMES_ON = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,features:Object.assign({},v&&v.features,{simpleGames:true})});}});})();";
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const TAP = (sel) => X("(function(){ var b=document.querySelector(" + JSON.stringify(sel) + "); if(b) b.click(); return b ? 'tapped' : 'NONE ' + " + JSON.stringify(sel) + "; })()");
const AT_BANDON = [43.1789, -124.3935], PORTLAND = [45.52, -122.68];
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
// Games & Bets: Next -> paste golfers -> Next -> a game (+ scoring) -> Start
const GAMES = (golfers, scoring) => [TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-pmode="paste"]'), { sleep: 300 },
    X("(function(){ var t=document.getElementById('sf-paste'); t.value=" + JSON.stringify(golfers) + "; t.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"), TAP('[data-sf="pastedone"]'), { sleep: 600 },
    TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-game="skins"]'), { sleep: 300 }, TAP('[data-sf-scoring="' + scoring + '"]'), { sleep: 300 }, TAP('[data-sf="start"]'), { sleep: 1200 }];
const V = require('./course-card-validate.js');

// ---- the made-up card and the fake scan server ----------------------------------------------------------
const sum = (a) => a.reduce((s, x) => s + x, 0);
const PAR = [4, 5, 3, 4, 4, 3, 4, 4, 5, 4, 4, 3, 5, 4, 3, 4, 4, 5];
const MEN = [7, 1, 15, 11, 3, 17, 9, 5, 13, 8, 2, 16, 4, 6, 18, 12, 14, 10];
const LADIES = [5, 1, 17, 9, 3, 15, 11, 7, 13, 6, 2, 18, 4, 8, 16, 12, 14, 10];
const YDS = { Blue: [402, 538, 176, 365, 421, 158, 389, 430, 512, 395, 441, 187, 545, 378, 166, 410, 388, 520] };
YDS.White = YDS.Blue.map((y) => y - 22); YDS.Red = YDS.Blue.map((y) => y - 80);
const tee = (name) => ({ name, yards: YDS[name].slice(), written: { out: sum(YDS[name].slice(0, 9)), in: sum(YDS[name].slice(9)), total: sum(YDS[name]) } });
const CARD = { course_name: null, holes: 18, par: PAR.slice(), par_written: { out: sum(PAR.slice(0, 9)), in: sum(PAR.slice(9)), total: sum(PAR) },
    hcp_men: MEN.slice(), hcp_ladies: LADIES.slice(), tees: [tee('Blue'), tee('White'), tee('Red')], unsure: [], notes: '' };
// what a Flash read with misreads looks like: par 8 on hole 7, HCP 11 on holes 4 and 13 (4 missing), the
// printed par OUT not printed (null) - so total par 76 and OUT 40 show as checks to make.
const AMBER = JSON.parse(JSON.stringify(CARD)); AMBER.par[6] = 8; AMBER.hcp_men[12] = 11; AMBER.par_written = { out: null, in: sum(PAR.slice(9)), total: null };
const ok = (c, left) => ({ http: 200, body: { status: 'ok', mode: 'course', model: 'gemini-3.8-flash', retried: false, paid: false, courseScansLeft: left,
    result: V.parseCourseOutput(JSON.stringify(c)).value, validation: V.validateCourse(V.parseCourseOutput(JSON.stringify(c)), { holes: 18 }) } });
const KEEP = "window.addEventListener('pagehide', function(){ try { var W2=(window.__coldWrites||[]); var w=W2.filter(function(x){ return /^events\\//.test(x.path) && x.value && x.value.courseData; }).map(function(x){ return (x.value.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' '); }); if (w.length) sessionStorage.setItem('__088Card', w[0]); sessionStorage.setItem('__088Shared', JSON.stringify(W2.filter(function(x){ return /global_courses/.test(x.path); }).map(function(x){ return x.path; }))); } catch(e) {} });";
const VP088 = process.env.VIEW088 ? { width: Number(process.env.VIEW088.split('x')[0]), height: Number(process.env.VIEW088.split('x')[1]) } : { width: 393, height: 852 };
const SHOT88 = (name) => (process.env.COURSESCAN_SHOTS ? [{ shot: path.join(process.env.COURSESCAN_SHOTS, VP088.width + 'x' + VP088.height + '-' + name + '.png'), viewportOnly: true }] : []);
const open = (flow, answers, steps, pre) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: VP088,
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + SCAN(answers) + FUNCS('error') + GAMES_ON + KEEP + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow'," + JSON.stringify(flow) + ");}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: PORTLAND[0], longitude: PORTLAND[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 },
        TYPE('Shortys'), { sleep: 2500 }, { waitFor: "!!document.querySelector('#sf [data-sf-osm]')", timeout: 15000 }, { sleep: 300 },
        TAP('#sf [data-sf-osm][data-sf-name="Shortys"]'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && /GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 40000 }, { sleep: 600 }].concat(steps) });

const S = "JSON.stringify({ sheet: !!document.getElementById('sf-pars'), btn: !!document.querySelector('#sf-pars [data-hcs=scan]'), left: (document.querySelector('.hcs-left')||{}).textContent||'',"
    + " grid: !!document.getElementById('hcs-grid'), state: window.HardPanCourseScan ? HardPanCourseScan.state() : null, amberN: document.querySelectorAll('#hcs-sheet input[data-hcs-amber=hard]').length,"
    + " amberCells: Array.prototype.map.call(document.querySelectorAll('#hcs-sheet input[data-hcs-amber=hard]'), function(i){ return i.getAttribute('data-hcs-cell'); }),"
    + " useOff: !!(document.getElementById('hcs-use')||{}).disabled, useText: (document.getElementById('hcs-use')||{}).textContent||'', list: (document.getElementById('hcs-amber')||{}).innerText||'', err: (document.getElementById('hcs-err')||{}).textContent||'',"
    + " again: !!document.querySelector('#hcs-sheet [data-hcs=again]'), typeBtn: !!document.querySelector('#hcs-sheet [data-hcs=type]'),"
    + " typedPar: Array.prototype.map.call(document.querySelectorAll('#sf-pars [data-sf-par]'), function(i){ return i.value; }).join(','), typedSi: Array.prototype.map.call(document.querySelectorAll('#sf-pars [data-sf-si]'), function(i){ return i.value; }).join(','),"
    + " scanned: !!document.getElementById('sf-pars-scanned'), sent: window.__scanSent || [], cams: window.__cams || 0, kept: localStorage.getItem('hardpan_course_card_scan_v1'),"
    + " card: (function(){ var w=(window.__coldWrites||[]).filter(function(x){ return /^events\\//.test(x.path) && x.value && x.value.courseData; }).map(function(x){ return (x.value.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' '); }); return w[0] || sessionStorage.getItem('__088Card'); })(),"
    + " shared: (function(){ var a=(window.__coldWrites||[]).filter(function(x){ return /global_courses/.test(x.path); }).map(function(x){ return x.path; }); var b=JSON.parse(sessionStorage.getItem('__088Shared')||'[]'); return JSON.stringify(b.concat(a)); })(), page: location.pathname.split('/').pop(),"
    + " sharedNow: (window.__coldWrites||[]).filter(function(w){ return /global_courses/.test(w.path); }).map(function(w){ return w.path; }) })";
const CELL = (k, v) => X("(function(){ var i=document.querySelector('#hcs-sheet [data-hcs-cell=\"" + k + "\"]'); if(!i) return 'NONE " + k + "'; i.focus(); i.value=" + JSON.stringify(String(v)) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 'set " + k + "'; })()");

// The scan server answer, held back DELAY ms so Back can land while "Reading the card…" is up.
const SCAN_SLOW = (answers, delay) => "(function(){ window.__hpScanCaptureStub = function () { window.__cams = (window.__cams||0) + 1; return { image: 'QUJD', width: 10, height: 10 }; };"
    + " window.__scanSent = []; var A = " + JSON.stringify(answers) + "; var of = window.fetch;"
    + " window.fetch = function (u, init) { if (/\\/api\\/scorecard-scan$/.test(String(u))) { window.__scanSent.push(JSON.parse(init.body)); var a = A.shift() || { http: 500, body: {} };"
    + "   return new Promise(function (ok) { setTimeout(function () { ok({ ok: a.http === 200, status: a.http, text: function () { return Promise.resolve(JSON.stringify(a.body)); } }); }, " + Number(delay) + "); }); } return of.apply(this, arguments); }; })();";
const SCAN = (answers) => SCAN_SLOW(answers, 3500);
function platform(p) {
    return 'window.__BACK = []; window.__MIN = 0; window.Capacitor = { getPlatform: function () { return ' + JSON.stringify(p) + '; }, isNativePlatform: function () { return true; }, '
        + 'Plugins: { App: { addListener: function (n, fn) { if (n === "backButton") window.__BACK.push(fn); return Promise.resolve({ remove: function () {} }); }, '
        + 'minimizeApp: function () { window.__MIN++; }, getLaunchUrl: function () { return Promise.resolve(undefined); } } } };';
}
// The scan server switch, ON as the dev build (GPS_DEV_PRO=1) sets it: on a native platform a build without it
// says "Course card scan isn't switched on yet" at once (gps-scan-client.js serverOffHere) - same on iOS.
// Chained onto the config setters already armed above (liveTest, simpleGames), not replacing them.
const SERVER_ON = "(function(){ var d=Object.getOwnPropertyDescriptor(window,'HARDPAN_GPS_CONFIG'); var c; Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},"
    + "set:function(v){ if (d && d.set) { d.set(v); v = d.get(); } c = Object.assign({}, v, { features: Object.assign({}, v && v.features, { scanServer: true }) }); }}); })();";
const PRESS = X('(function(){ window.__BACK.forEach(function (f) { f({ canGoBack: true }); }); return "back x" + window.__BACK.length; })()');
const A = "JSON.stringify({ back: (window.__BACK||[]).length, min: window.__MIN, page: location.pathname.split('/').pop(), sheet: !!document.getElementById('hcs-sheet'),"
    + " busy: !!document.getElementById('hcs-busy'), txt: (document.getElementById('hcs-sheet')||{}).innerText||'', grid: !!document.getElementById('hcs-grid'), sent: (window.__scanSent||[]).length,"
    + " form: !!document.getElementById('c-par-1') && document.getElementById('c-par-1').offsetParent !== null,"
    + " par: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(function(h){ var e=document.getElementById('c-par-'+h); return e ? e.value : 'x'; }).join(',') })";
const TO_ADD_A_COURSE = [TAP('[data-sf="osmpars"]'), { sleep: 900 },
    X("(function(){ var i=document.getElementById('new-course-name-input'); i.value='Mesa Verde Links'; return i.value; })()"),
    TAP('#new-course-form .wizard-btn-next'), { sleep: 900 },
    X("(function(){ var b=document.getElementById('hcs-scan-addcourse'); if (b) b.scrollIntoView({ block: 'center' }); return 1; })()"), { sleep: 300 }];

test('ANDROID 080: Back while the card is read does nothing; Back on the check grid = "Type them instead" - sheet closes, nothing filled, Add a course stays', { timeout: 240000 }, async () => {
    const r = await open('gps', [ok(AMBER, 1)], TO_ADD_A_COURSE.concat([X(A),
        { tap: '#hcs-scan-addcourse' }, { waitFor: "!!document.getElementById('hcs-busy')", timeout: 15000 }, X(A),
        PRESS, { sleep: 600 }, X(A),
        { waitFor: "!!document.getElementById('hcs-grid')", timeout: 15000 }, { sleep: 300 }, X(A),
        PRESS, { sleep: 800 }, X(A)]), platform('android') + SERVER_ON);
    assert.equal(r.ok, true, r.reason);
    const [before, busy, busyBack, grid, gone] = J(r); if (process.env.DEBUG080) console.log(JSON.stringify(r.value));
    assert.ok(before.back >= 1, 'front-door.js armed the hardware Back listener: ' + JSON.stringify(before));
    assert.equal(before.form, true, 'on Round Setup\'s Add a course grid (positive control)');
    assert.equal(busy.busy, true, '"Reading the card…" is up'); assert.equal(busy.sent, 1);
    assert.equal(busyBack.sheet, true, 'Back while reading: the sheet stays'); assert.equal(busyBack.min, 0);
    assert.equal(grid.grid, true, 'the scan still arrives after that Back');
    assert.equal(gone.sheet, false, 'one Back on the grid closes the scan sheet: ' + JSON.stringify(gone));
    assert.equal(gone.page, 'admin.html'); assert.equal(gone.form, true, 'Add a course is still on screen');
    assert.equal(gone.par, ',,,,,,,,,,,,,,,,,', 'nothing filled - Back is never "Use"');
    assert.equal(gone.min, 0, 'the app was not minimised'); assert.equal(gone.sent, 1, 'no second scan');
});

test('Android only: off Android (no hardware Back key) the sheet works as 080 shipped it (Type them instead closes it)', { timeout: 240000 }, async () => {
    const r = await open('gps', [ok(AMBER, 1)], TO_ADD_A_COURSE.concat([
        { tap: '#hcs-scan-addcourse' }, { waitFor: "!!document.getElementById('hcs-grid')", timeout: 15000 }, { sleep: 300 }, X(A),
        { tap: '#hcs-sheet [data-hcs=type]' }, { sleep: 500 }, X(A)]), platform('ios') + SERVER_ON);
    assert.equal(r.ok, true, r.reason);
    const [grid, closed] = J(r);
    // (pwa-boot.js arms a backButton listener on admin.html on any native platform; iOS never fires it.)
    assert.equal(grid.grid, true, 'the grid is up on iOS too (positive control)');
    assert.equal(closed.sheet, false); assert.equal(closed.form, true); assert.equal(closed.par, ',,,,,,,,,,,,,,,,,');
});
