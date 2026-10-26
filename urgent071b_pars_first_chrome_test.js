// ============================================================================
// 071b (Manny, answer 3 on URGENT-071): A ROUND WITH A GAME ON A STAND-IN CARD ASKS FOR THE PARS FIRST.
// An OpenStreetMap-only course (Shortys, osm_w1540940976) starts on a par-4 stand-in card (071).
//   1  Games & Bets with Skins, GROSS: Start asks for the pars only (no strokes, no index needed).
//   2  Games & Bets with Skins, NET, golfers 12 and 4: Start asks for the pars AND the stroke indexes; Save
//      with the real card -> the round's card has those pars and indexes.
//   3  Net but every golfer scratch (no strokes anywhere): pars only.
//   4  GPS-only (the GPS door, no game): Start Round does NOT ask - the par-4 card, as 071.
// The Cloud Functions and OpenStreetMap are stood in at fetch. Nothing reaches a database.
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
const SNAP = "JSON.stringify({ key: (document.getElementById('course-select')||{}).value, pars: !!document.getElementById('sf-pars'), title: (document.getElementById('sf-pars-t')||{}).textContent||'', nPar: document.querySelectorAll('#sf-pars [data-sf-par]').length, nSi: document.querySelectorAll('#sf-pars [data-sf-si]').length, ask: window.__sfParsAsk || [], err: (document.getElementById('sf-pars-err')||{}).textContent||'', step: (window.HardPanSimpleFlow ? HardPanSimpleFlow.state().step : null), saving: (window.HardPanSimpleFlow ? !!HardPanSimpleFlow.state().saving : null), rec: (function(){ try { var r = globalCourses[(document.getElementById('course-select')||{}).value]; return r ? { parsSet: !!r.parsSet, indexSet: !!r.indexSet, pars: (r.data||[]).map(function(h){return h.par;}).join(''), si: (r.data||[]).map(function(h){return h.hcpIndex;}).join(',') } : null; } catch(e) { return null; } })(), writes: (window.__coldWrites||[]).filter(function(w){ return /^events\\//.test(w.path); }).map(function(w){ var v=w.value||{}; return { path: w.path, card: (v.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' ') }; }), saved: sessionStorage.getItem('__071bCard'), cur: (function(){ try { return typeof currentData !== 'undefined' && currentData && (currentData.courseData||[]).length ? (currentData.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' ') : null; } catch(e) { return null; } })(), page: location.pathname.split('/').pop() })";
const VP = process.env.VIEW071B ? { width: Number(process.env.VIEW071B.split('x')[0]), height: Number(process.env.VIEW071B.split('x')[1]) } : { width: 393, height: 852 };
const SHOT = (name) => (process.env.SHOTS071B ? [{ shot: path.join(process.env.SHOTS071B, name + '-' + VP.width + 'x' + VP.height + '.png'), viewportOnly: true }] : []);
const AT_BANDON = [43.1789, -124.3935], PORTLAND = [45.52, -122.68];
// (the round page is a new page: the save's writes are kept across it)
const KEEPW = "window.addEventListener('pagehide', function(){ try { var w=(window.__coldWrites||[]).filter(function(x){ return /^events\\//.test(x.path) && x.value && x.value.courseData; }).map(function(x){ return (x.value.courseData||[]).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' '); }); if (w.length) sessionStorage.setItem('__071bCard', w[0]); } catch(e) {} });";
const open = (flow, steps, vp) => arriveCold({ url: fileUrl('admin.html', 'start=quick'), db: { events: {}, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2500, viewport: vp || VP,
    preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + FUNCS('error') + GAMES_ON + KEEPW + "try{sessionStorage.setItem('hardpan_simple_flow'," + JSON.stringify(flow) + ");}catch(e){}", steps: [
        { cdp: { method: 'Emulation.setGeolocationOverride', params: { latitude: PORTLAND[0], longitude: PORTLAND[1], accuracy: 10 } } },
        { cdp: { method: 'Browser.grantPermissions', params: { permissions: ['geolocation'] } } },
        { sleep: 2500 }, X("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 'relocate'; })()"),
        { waitFor: "!!document.getElementById('sf-q') && document.querySelectorAll('#sf [data-sf-course]').length > 0", timeout: 40000 }, { sleep: 800 },
        TYPE('Shortys'), { sleep: 2500 }, { waitFor: "!!document.querySelector('#sf [data-sf-osm]')", timeout: 15000 }, { sleep: 300 },
        TAP('#sf [data-sf-osm][data-sf-name="Shortys"]'),
        { waitFor: "/^osm_/.test(document.getElementById('course-select').value) && /GPS from OpenStreetMap/.test((document.getElementById('sf-osmnote')||{}).innerText||'')", timeout: 40000 }, { sleep: 600 }].concat(steps) });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
// Games & Bets: Next -> paste golfers -> Next -> a game (+ scoring) -> Start
const GAMES = (golfers, scoring) => [TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-pmode="paste"]'), { sleep: 300 },
    X("(function(){ var t=document.getElementById('sf-paste'); t.value=" + JSON.stringify(golfers) + "; t.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()"), TAP('[data-sf="pastedone"]'), { sleep: 600 },
    TAP('[data-sf="next"]'), { sleep: 600 }, TAP('[data-sf-game="skins"]'), { sleep: 300 }, TAP('[data-sf-scoring="' + scoring + '"]'), { sleep: 300 }, TAP('[data-sf="start"]'), { sleep: 1200 }];

test('Games & Bets, Skins GROSS on a stand-in card: Start asks for the PARS only (no strokes - no index)', { timeout: 200000 }, async () => {
    const r = await open('new', GAMES('Glenn 12\nMarty 4', 'gross').concat([X(SNAP)]).concat(SHOT('pars-only')));
    assert.equal(r.ok, true, r.reason);
    const s = J(r).pop();
    assert.equal(s.key, 'osm_w1540940976');
    assert.equal(s.pars, true, 'asked: ' + JSON.stringify(s));
    assert.match(s.title, /^Pars for Shortys$/);
    assert.equal(s.nPar, 18); assert.equal(s.nSi, 0, 'no index boxes');
    assert.deepEqual(s.writes, [], 'not started - nothing written');
});

test('Games & Bets, Skins NET (12 vs 4): asks for the PARS AND STROKE INDEXES; Save puts them on the round\'s card', { timeout: 200000 }, async () => {
    const PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4], SI = [7, 1, 17, 5, 11, 3, 15, 9, 13, 8, 18, 2, 10, 6, 16, 4, 12, 14];
    const FILL = (bad) => X("(function(){ var P=" + JSON.stringify(PARS) + ", S=" + JSON.stringify(SI) + "; Array.prototype.forEach.call(document.querySelectorAll('#sf-pars [data-sf-par]'), function(i, n){ i.value = P[n]; i.dispatchEvent(new Event('input',{bubbles:true})); }); Array.prototype.forEach.call(document.querySelectorAll('#sf-pars [data-sf-si]'), function(i, n){ i.value = " + (bad ? "(n === 1 ? 7 : S[n])" : "S[n]") + "; i.dispatchEvent(new Event('input',{bubbles:true})); }); return 1; })()");
    const r = await open('new', GAMES('Glenn 12\nMarty 4', 'net').concat([X(SNAP)]).concat(SHOT('pars-and-index')).concat([
        FILL(true), TAP('[data-sf="parssave"]'), { sleep: 500 }, X(SNAP), FILL(false), TAP('[data-sf="parssave"]'),
        { waitFor: "(window.__coldWrites||[]).some(function(w){ return /^events\\//.test(w.path) && w.value && (w.value.courseData||[]).length; })", timeout: 30000 }, { sleep: 500 }, X(SNAP)]));
    assert.equal(r.ok, true, r.reason);
    const [ask, dup, done] = J(r);
    assert.equal(ask.pars, true);
    assert.match(ask.title, /^Pars and stroke indexes for Shortys$/);
    assert.equal(ask.nPar, 18); assert.equal(ask.nSi, 18);
    assert.match(dup.err, /stroke index from 1 to 18, each used once/, 'an index used twice is refused');
    assert.equal(done.rec.parsSet, true); assert.equal(done.rec.indexSet, true);
    assert.equal(done.rec.pars, PARS.join(''));
    const card = done.writes.filter((w) => w.card)[0];
    assert.ok(card, 'the round was saved: ' + JSON.stringify(done.writes));
    assert.equal(card.card, PARS.map((p, i) => p + '/' + SI[i]).join(' '), 'the round\'s card = the typed pars + indexes');
});

test('NET but every golfer scratch (no strokes anywhere): pars only', { timeout: 200000 }, async () => {
    const r = await open('new', GAMES('Glenn 0\nMarty 0', 'net').concat([X(SNAP)]));
    assert.equal(r.ok, true, r.reason);
    const s = J(r).pop();
    assert.equal(s.pars, true); assert.equal(s.nSi, 0, 'scratch golfers: no index needed');
});

test('GPS-only (the GPS door, no game): Start Round does NOT ask - the par-4 stand-in card, as 071', { timeout: 200000 }, async () => {
    const r = await open('gps', [X(SNAP), TAP('[data-sf="startgps"]'),
        { waitFor: "/index\\.html/.test(location.pathname) || !!document.getElementById('sf-pars')", timeout: 30000 }, { sleep: 1500 }, X(SNAP)]);
    assert.equal(r.ok, true, r.reason);
    const [before, s] = J(r);
    assert.equal(before.key, 'osm_w1540940976');
    assert.equal(s.pars, false, 'no ask'); assert.deepEqual(s.ask, []);
    assert.equal(s.page, 'index.html', 'the round started (the map page)');
    assert.equal(String(s.saved).split(' ').map((x) => x.split('/')[0]).join(''), '4'.repeat(18), 'the round was saved with the par-4 card: ' + s.saved);
});
