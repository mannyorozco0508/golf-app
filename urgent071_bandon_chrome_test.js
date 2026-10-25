// ============================================================================
// URGENT-071 BANDON - IN REAL CHROME (phone GPS mode).
//
// Manny (Oct 25, 10:49 AM): "This is a terrible bug. Every course should be searchable." Searching
// "Bandon" showed only the OpenStreetMap rows ("Not set up yet · Add this course"); a tap ended in the
// Games & Bets setup (Course & Round, "New Course Name · Type the pars and indexes once") with no GPS.
//   1  THE REQUIRED ONE: an OpenStreetMap-only search row never ends in the Games & Bets wizard with no
//      GPS - with no online answer (the phone's case), a tap on "Shortys" stays in the GPS flow, its own
//      key (osm_w1540940976) is the pick with a card in hand, Start Round is live, and its OpenStreetMap
//      holes are on the phone (GPS from OpenStreetMap). Nothing written to the database.
//   2  ...and with no map data at all: still GPS ("Tap the middle of the green"), never the wizard.
//   3  "Bandon Trails" (OSM row) with the online search failed: GolfAPI has it - found by name + town,
//      pulled the normal way (gpsCourse, its id), its card is the pick.
//   4  THE MERGE / DEDUPE: the live "bandon" answer (8 GolfAPI rows, saved Oct 25) - every GolfAPI row
//      shows; the OSM twins of GolfAPI courses with GPS (Bandon Dunes Golf Resort, Bandon Trails, Bandon
//      Preserve) are not drawn twice; Shortys / Practice Center (OSM only) and Bandon Sheep Ranch (GolfAPI
//      has no GPS for it) still show; closest first is kept.
//   5  the online line sits OVER the OSM rows when the search failed ('limit'), with Try again (it asks
//      again); "Old Macdonald" also asks GolfAPI's spelling "old mcdonald" and finds Old McDonald.
//   6  Games & Bets keeps the 064 path: an OSM-only row there opens Round Setup's Add a course (the pars).
// The Cloud Functions and OpenStreetMap are stood in at fetch. No network, no GolfAPI call.
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
const TYPE = (v) => X("(function(){ var i=document.getElementById('sf-q'); if(!i){ var b=document.querySelector('[data-sf=change]'); if(b) b.click(); i=document.getElementById('sf-q'); } i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
const TAP_OSM = (name) => X("(function(){ var b=document.querySelector('#sf [data-sf-osm][data-sf-name=\"" + name + "\"]'); if(b) b.click(); return b ? 'tapped' : 'NO ROW'; })()");
const SF = "JSON.stringify({ key: document.getElementById('course-select').value, text: (document.getElementById('sf')||{}).innerText||'',"
    + " list: Array.prototype.map.call(document.querySelectorAll('#sf .sf-row'), function(b){ return (b.getAttribute('data-sf-osm') != null ? 'OSM ' : b.getAttribute('data-sf-web') ? 'WEB ' : 'LOCAL ') + b.innerText.replace(/\\n/g,' | '); }),"
    + " webLine: (document.getElementById('sf-web')||{}).innerText||'', lineFirst: (function(){ var w=document.getElementById('sf-web'), o=document.querySelector('#sf [data-sf-osm]'); return !!(w && o && (w.compareDocumentPosition(o) & 4)); })(),"
    + " note: (document.getElementById('sf-osmnote')||{}).innerText||'', pickBox: (document.getElementById('sf-osmpick')||{}).innerText||'',"
    + " sfShown: (function(){ var s=document.getElementById('sf'); return !!s && getComputedStyle(s).display !== 'none' && s.style.visibility !== 'hidden'; })(),"
    + " form: (function(){ var f=document.getElementById('new-course-form'); return f ? getComputedStyle(f).display : null; })(), step1: (function(){ var s=document.getElementById('wizard-step-1'); return !!s && s.offsetParent !== null; })(),"
    + " name: (document.getElementById('new-course-name-input')||{}).value, back: (document.getElementById('sf-return')||{}).textContent || '',"
    + " card: (function(){ var k=document.getElementById('course-select').value; try { return !!(k && courseCardInHand(k)); } catch(e) { return null; } })(),"
    + " gps: (function(){ var k=document.getElementById('course-select').value; try { var g=HardPanCourse.gps(k, null, null); return g && g.holes ? Object.keys(g.holes).length : 0; } catch(e) { return -1; } })(),"
    + " fn: window.__fn, over: window.__over, dbg: (function(){ var k=document.getElementById('course-select').value; return { m: !!window.HardPanGpsMatch, ls: (localStorage.getItem('hardpan_osm_v1_'+k)||'').slice(0,200), tried: localStorage.getItem('hardpan_osm_v1_tried_'+k) }; })(), web: window.__sfWeb || [], writes: (window.__coldWrites||[]).map(function(w){ return w.op + ' ' + w.path; }),"
    + " start: (function(){ var b=document.querySelector('[data-sf=startgps]'); return b ? { text: b.innerText, disabled: b.disabled } : null; })() })";
const open = (at, mode, steps, pre, flow) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS(mode) + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow'," + JSON.stringify(flow || 'gps') + ");}catch(e){}"
        + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); });", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && !!window.HardPanGpsLive && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const PORTLAND = [45.52, -122.68];
const AT_BANDON = [43.1789, -124.3935];   // by Shortys (the 5 closest OSM rows include it)
const PAUSE = { sleep: 1800 };   // (071: the online search starts ~0.7 s after typing stops)
const SETTLED = { waitFor: "document.querySelectorAll('#sf [data-sf-osm]').length > 0 && !/Searching all courses/.test(document.getElementById('sf').innerText)", timeout: 15000 };
const writesOf = (s) => s.writes.filter((w) => !/^set global_courses\/gapi_\d+$/.test(w));   // (the stand-in server's own write)
const notWizard = (s, what) => {
    assert.equal(s.sfShown, true, what + ': the GPS screen stays (not the Games & Bets setup)');
    assert.notEqual(s.form, 'block', what + ': Round Setup\'s Add a course is NOT open');
    assert.equal(s.step1, false, what + ': not on Course & Round');
    assert.doesNotMatch(s.back, /back to New round/, what + ': no "Course picked - back to New round"');
};

test('REQUIRED: an OpenStreetMap-only row (Shortys) with no online answer opens GPS - its own key, card in hand, Start Round live, OSM holes on the phone - never the Games & Bets wizard', { timeout: 150000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X(SF), TAP_OSM('Shortys'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) || (document.getElementById('sf-return')||{}).textContent", timeout: 20000 }, { sleep: 1200 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [before, s] = J(r);
    assert.ok(before.list.some((t) => /^OSM Shortys \|/.test(t)), 'the OSM row: ' + JSON.stringify(before.list));
    notWizard(s, 'Shortys');
    assert.equal(s.key, 'osm_w1540940976', 'its own OpenStreetMap key is the pick');
    assert.equal(s.card, true, 'a card in hand (par 4 until the pars are typed)');
    assert.ok(s.start && s.start.disabled === false && /Start Round/.test(s.start.text), 'Start Round is live: ' + JSON.stringify(s.start));
    assert.equal(s.gps, 3, 'its OpenStreetMap holes are on the phone (the map opens on them): ' + JSON.stringify({ note: s.note, over: s.over, dbg: s.dbg }));
    assert.match(s.note, /GPS from OpenStreetMap \(3 of 18 holes mapped\)/);
    assert.match(s.note, /Type the pars and indexes/, 'the pars path is kept as a link');
    assert.ok(s.over >= 2, 'OpenStreetMap asked (from the course\'s point)');
    assert.deepEqual(writesOf(s).slice(before.writes.length), [], 'no database write');
});

test('no map data at all: still GPS - "Tap the middle of the green" - never the wizard', { timeout: 150000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X('window.__overNone = true; 1'), TAP_OSM('Shortys'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) || (document.getElementById('sf-return')||{}).textContent", timeout: 20000 }, { sleep: 1200 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    notWizard(s, 'Shortys, no data');
    assert.equal(s.key, 'osm_w1540940976');
    assert.equal(s.card, true);
    assert.equal(s.start && s.start.disabled, false, 'Start Round is live');
    assert.match(s.note, /Tap the middle of the green/);
});

test('"Bandon Trails" (OSM row) with the online search failed: GolfAPI has it - found by name + town, pulled (its id), its card is the pick', { timeout: 150000 }, async () => {
    const r = await open(PORTLAND, 'findonly', [TYPE('Bandon Tr'), { sleep: 3500 }, X(SF), TAP_OSM('Bandon Trails'),
        { waitFor: "document.getElementById('course-select').value === 'gapi_" + TRAILS.id + "' || (document.getElementById('sf-return')||{}).textContent", timeout: 20000 }, { sleep: 1500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [before, s] = J(r);
    assert.ok(before.list.some((t) => /^OSM Bandon Trails \|/.test(t)), 'the OSM row shows: ' + JSON.stringify(before.list));
    notWizard(s, 'Bandon Trails');
    assert.deepEqual(s.fn.filter((c) => c[0] === 'gpsCourse').map((c) => c[1]), [{ courseId: TRAILS.id }], 'pulled once, GolfAPI\'s Bandon Trails');
    assert.equal(s.key, 'gapi_' + TRAILS.id, 'its card is the pick');
    assert.equal(s.start && s.start.disabled, false);
});

test('the merge / dedupe with the live "bandon" answer: every GolfAPI row shows, OSM twins of GolfAPI-with-GPS courses not drawn twice, OSM-only ones kept, closest first', { timeout: 150000 }, async () => {
    const r = await open(PORTLAND, 'live', [TYPE('Bandon'), { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 8", timeout: 15000 }, { sleep: 600 }, X(SF),
        TYPE('Pacific Dunes'), PAUSE, { waitFor: "/Pacific Dunes/.test(Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){return b.innerText;}).join(' '))", timeout: 15000 }, { sleep: 400 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s, pd] = J(r);
    const web = s.list.filter((t) => /^WEB /.test(t)).map((t) => t.split(' | ')[0].slice(4));
    BANDON.forEach((m) => assert.ok(web.indexOf(m.name) !== -1, m.name + ' shows: ' + JSON.stringify(web)));
    const osm = s.list.filter((t) => /^OSM /.test(t)).map((t) => t.split(' | ')[0].slice(4));
    ['Bandon Dunes Golf Resort', 'Bandon Trails', 'Bandon Preserve'].forEach((n) => assert.equal(osm.indexOf(n), -1, n + ' not twice: ' + JSON.stringify(osm)));
    ['Shortys', 'Bandon Sheep Ranch'].forEach((n) => assert.ok(osm.indexOf(n) !== -1, n + ' kept: ' + JSON.stringify(osm)));
    // closest first inside a name group (067): the distances never go down among the "Bandon…" rows that have one
    // closest first inside each group (067), and (071) the GolfAPI rows above the OSM rows of the same town
    const dist = (kind) => s.list.filter((t) => new RegExp('^' + kind + ' Bandon').test(t)).map((t) => { const m = / \| ([\d.,]+) mi/.exec(t); return m ? Number(m[1].replace(/,/g, '')) : null; }).filter((d) => d != null);
    ['WEB', 'OSM'].forEach((k) => { const ds = dist(k); assert.deepEqual(ds, ds.slice().sort((a, b) => a - b), k + ' closest first: ' + JSON.stringify(ds)); });
    const bandon = s.list.filter((t) => /^(WEB|OSM) Bandon/.test(t));
    assert.ok(bandon.findIndex((t) => /^OSM/.test(t)) > bandon.map((t) => /^WEB Bandon Dunes Golf Resort/.test(t)).lastIndexOf(true), 'OSM rows after the GolfAPI ones: ' + JSON.stringify(bandon));
    assert.ok(/^WEB/.test(s.list[0]), 'a GolfAPI row first: ' + s.list[0]);
    assert.ok(pd.list.some((t) => /^WEB Bandon Dunes Golf Resort \(Pacific Dunes\) \|.*✓ GPS/.test(t)), 'Pacific Dunes: ' + JSON.stringify(pd.list));
});

test('the online line sits over the OSM rows when the search failed (limit), Try again asks again; "Old Macdonald" also asks "old mcdonald"', { timeout: 150000 }, async () => {
    const r = await open(PORTLAND, 'limit', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X(SF),
        X("(function(){ var b=document.querySelector('#sf-web [data-sf=webretry]'); if(b) b.click(); return 1; })()"), { sleep: 2500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s, again] = J(r);
    assert.match(s.webLine, /Couldn’t search online right now/);
    assert.match(s.webLine, /Try again/);
    assert.equal(s.lineFirst, true, 'the line is ABOVE the "Not set up yet" rows');
    assert.equal(again.fn.filter((c) => c[0] === 'gpsSearch' && c[1].name === 'bandon').length, 2, 'Try again searched again');
    const r2 = await open(PORTLAND, 'live', [TYPE('Old Macdonald'), PAUSE, { waitFor: "/Old McDonald/.test(Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-web]'), function(b){return b.innerText;}).join(' '))", timeout: 15000 }, { sleep: 400 }, X(SF)]);
    assert.equal(r2.ok, true, r2.reason);
    const [om] = J(r2);
    assert.deepEqual(om.fn.map((c) => c[1].name), ['old macdonald', 'old mcdonald'], 'Mac / Mc both asked');
    assert.ok(om.list.some((t) => /^WEB Bandon Dunes Golf Resort \(Old McDonald\) \|.*✓ GPS/.test(t)), JSON.stringify(om.list));
});

test('Games & Bets keeps the 064 path: an OSM-only row opens Round Setup\'s Add a course (the pars)', { timeout: 150000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, TAP_OSM('Shortys'), { sleep: 1500 }, X(SF)], '', 'new');
    assert.equal(r.ok, true, r.reason);
    const [s] = J(r);
    assert.equal(s.form, 'block', 'Add a course is open');
    assert.equal(s.name, 'Shortys');
});

test('OpenStreetMap slow (a minute or more on its public servers): picked after 20 s with "on the way", Start Round live; the holes land later and the note says so', { timeout: 200000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X('window.__overDelay = 15000; 1'), TAP_OSM('Shortys'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value)", timeout: 40000 }, { sleep: 500 }, X(SF),
        { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 60000 }, { sleep: 300 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [early, late] = J(r);
    notWizard(early, 'Shortys, slow OSM');
    assert.match(early.note, /on the way from OpenStreetMap/);
    assert.equal(early.start && early.start.disabled, false, 'Start Round is live while the holes come');
    assert.match(late.note, /GPS from OpenStreetMap \(3 of 18 holes mapped\)/);
    assert.equal(late.gps, 3);
});

// ---- THE PHONE'S CASE (found on the Simulator, bb3a20a1): Round Setup loads gps-live.js only when a course gets
// picked. Not at a course -> nothing picked -> no gps-live -> the search never asked, the OSM rows were all.
// These open the page WITHOUT the tests' usual gps-live injection, as the app does.
const openPhone = (at, mode, steps, pre) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: { width: 393, height: 852 },
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS(mode) + (pre || '') + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: at[0], longitude: at[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 }].concat(steps) });
const LIVE_STATE = X("JSON.stringify({ live: !!window.HardPanGpsLive, picked: document.getElementById('course-select').value })");
const PAPAGO = [33.4560, -111.9480], AWAY_AZ = [33.4300, -112.5800];   // AWAY_AZ: no course within 0.5 mi - nothing picked

test('REQUIRED (the phone\'s case): not at a course, gps-live not loaded by the page - typing "Bandon" loads it, asks once, and the first rows are GolfAPI ✓ GPS (not "Not set up yet")', { timeout: 150000 }, async () => {
    const r = await openPhone(AWAY_AZ, 'live', [LIVE_STATE, TYPE('Bandon'), { sleep: 4000 }, { waitFor: "document.querySelectorAll('#sf [data-sf-web]').length >= 8", timeout: 15000 }, { sleep: 600 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [st, s] = J(r);
    assert.equal(st.live, false, 'the page had not loaded gps-live (the phone\'s case)');
    assert.equal(st.picked, '', 'nothing picked');
    assert.deepEqual(s.fn.filter((c) => c[0] === 'gpsSearch').map((c) => c[1].name), ['bandon'], 'asked once');
    const first = s.list.slice(0, 5);
    assert.ok(first.every((t) => /^WEB .*✓ GPS/.test(t)), 'the first 5 rows are GolfAPI ✓ GPS: ' + JSON.stringify(s.list));
    const iOsm = s.list.findIndex((t) => /^OSM /.test(t)), lastGps = s.list.map((t) => /^WEB .*✓ GPS/.test(t)).lastIndexOf(true);
    assert.ok(iOsm === -1 || iOsm > s.list.findIndex((t) => /Pacific Dunes/.test(t)), 'OSM rows after the resort\'s GolfAPI rows: ' + JSON.stringify(s.list) + ' ' + lastGps);
});

test('typing fires at most one call per finished word (a hesitation mid-word is not a search); "bandon dunes" then comes from this phone\'s "bandon" answer - 0 calls', { timeout: 150000 }, async () => {
    const T1 = (v) => X("(function(){ var i=document.getElementById('sf-q'); i.focus(); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
    const r = await openPhone(AWAY_AZ, 'live', [T1('B'), { sleep: 160 }, T1('Ba'), { sleep: 160 }, T1('Ban'), { sleep: 160 }, T1('Band'), { sleep: 560 }, T1('Bando'), { sleep: 160 }, T1('Bandon'),
        { sleep: 3500 }, X(SF), T1('Bandon '), { sleep: 160 }, T1('Bandon D'), { sleep: 160 }, T1('Bandon Du'), { sleep: 160 }, T1('Bandon Dun'), { sleep: 160 }, T1('Bandon Dune'), { sleep: 160 }, T1('Bandon Dunes'), { sleep: 3000 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    assert.deepEqual(a.fn.filter((c) => c[0] === 'gpsSearch').map((c) => c[1].name), ['bandon'], 'one call for "Bandon" (none for "band")');
    assert.deepEqual(b.fn.filter((c) => c[0] === 'gpsSearch').map((c) => c[1].name), ['bandon'], '"Bandon Dunes": 0 more calls');
    assert.ok(b.list.filter((t) => /^WEB Bandon Dunes Golf Resort/.test(t)).length >= 5, 'the resort\'s courses shown from the saved answer: ' + JSON.stringify(b.list));
    assert.match(b.text, /Search more courses/, '"Search more courses" offered');
});

test('a saved match (Papago, a course the app has) shows with 0 gpsSearch calls; "Search more courses" calls once', { timeout: 150000 }, async () => {
    const r = await openPhone(AWAY_AZ, 'live', [TYPE('Papago'), { sleep: 3500 }, X(SF),
        X("(function(){ var b=document.getElementById('sf-more'); if(b) b.click(); return b ? 'more' : 'NO BUTTON'; })()"), { sleep: 2500 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [s, more] = J(r);
    assert.ok(s.list.some((t) => /^LOCAL Papago/.test(t)), 'Papago shown: ' + JSON.stringify(s.list));
    assert.equal(s.fn.filter((c) => c[0] === 'gpsSearch').length, 0, '0 gpsSearch calls');
    assert.match(s.text, /Search more courses/);
    assert.deepEqual(more.fn.filter((c) => c[0] === 'gpsSearch').map((c) => c[1].name), ['papago'], '"Search more courses": one call');
});

test('OpenStreetMap failing (HTTP 504 from every server: 071 asked 2; 074 asks 3 mirrors + 1 retry): "Map data server busy, try again." + "Couldn\'t reach OpenStreetMap", GPS still opens, and "Try OpenStreetMap again" gets the holes', { timeout: 200000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X('window.__fail504 = 4; 1'), TAP_OSM('Shortys'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && !!document.getElementById('sf-osmnote')", timeout: 40000 }, { sleep: 500 }, X(SF),
        X("(function(){ var b=document.querySelector('[data-sf=osmretry]'); if(b) b.click(); return b ? 'retry' : 'NO RETRY'; })()"),
        { waitFor: "/GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 60000 }, { sleep: 300 }, X(SF)]);
    assert.equal(r.ok, true, r.reason);
    const [a, b] = J(r);
    notWizard(a, 'Shortys, OSM 504');
    assert.match(a.note, /Map data server busy, try again\./, '074: the busy line');
    assert.match(a.note, /Couldn’t reach OpenStreetMap/);
    assert.match(a.note, /Try OpenStreetMap again/);
    assert.equal(a.start && a.start.disabled, false, 'Start Round is live (tap the green until then)');
    assert.match(b.note, /GPS from OpenStreetMap \(3 of 18 holes mapped\)/);
    assert.equal(b.gps, 3);
});

test('an overloaded OpenStreetMap server (200, no elements, a runtime-error remark) is "Couldn\'t reach", not "no data"; a clean empty answer is "Tap the middle of the green", kept 1 day (not asked on every open)', { timeout: 200000 }, async () => {
    const r = await open(AT_BANDON, 'error', [TYPE('Bandon'), PAUSE, SETTLED, { sleep: 400 }, X('window.__overBusy = true; 1'), TAP_OSM('Shortys'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && !!document.getElementById('sf-osmnote')", timeout: 40000 }, { sleep: 500 }, X(SF),
        X("window.__overBusy = false; window.__overNone = true; (function(){ var b=document.querySelector('[data-sf=osmretry]'); if(b) b.click(); return 1; })()"),
        { waitFor: "/No GPS map data/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 40000 }, { sleep: 300 }, X(SF),
        X("JSON.stringify((function(){ var t = JSON.parse(localStorage.getItem('hardpan_osm_v1_tried_osm_w1540940976') || 'null'); return t ? { none: t.none, daysLeft: Math.round((7 * 24 * 3600 * 1000 - (Date.now() - t.at)) / 3600000) / 24 } : null; })())")]);
    assert.equal(r.ok, true, r.reason);
    const [busy, empty, mark] = J(r);
    assert.match(busy.note, /Couldn’t reach OpenStreetMap/, 'overloaded = unreachable');
    assert.match(empty.note, /No GPS map data for Shortys yet — on the map, “Tap the middle of the green”/, 'really empty = tap the green');
    assert.doesNotMatch(empty.note, /Couldn’t reach/);
    assert.equal(mark.none, true);
    assert.ok(mark.daysLeft > 0.9 && mark.daysLeft <= 1.01, 'not asked again for 1 day: ' + JSON.stringify(mark));
});
