// URGENT-052 A - DISTANCE ARCS + TEE PLANNER, IN REAL CHROME (393x852, 375x667, 430x932; the GPS map,
// a stand-in GPS, a stand-in wind reading: 12 mph from the north = straight into hole 1).
// A made-up course (synthetic - no licensed data): hole 1 a straight 400-yd par 4 north with a fairway
// bunker right (250 / 274) and water left (221 / 245); hole 2 has no hazard points. Golfers "Test 052A Ann"
// (this phone's) and "Test 052A Ben". Ann's Driver has 9 noise-free windy shots (qualified - her own
// numbers); her 3-wood has 4 calm ones (generic).
//   0  ARRIVE, touch nothing: Tools shows "Distance arcs" OFF; the map's layers, sources, markers and
//      attributes are exactly e89f45f5's (measured there with the same fixture, pinned below); the arcs
//      script is not loaded
//   1  Tools > Distance arcs ON: saved for Ann only; two layers added; from the tee: Dr (her own wind
//      numbers, no "generic") and 3W ("generic"), at the yards worked out HERE in node from windTerm
//   2  walk to 150 out: the arcs come from the ball - 7i / 8i / 9i
//   3  reload: still on for Ann; this phone as Ben: off (per golfer)
//   4  tap the TEE (a real mouse tap on the map): the Tee plan - "Driver -> N in · 3-wood -> N in · ..." and
//      each club's hazards in play, exactly as gps-arcs-plan.js works them out in node; Tools > Tee plan with
//      the arcs OFF opens it too; hole 2: "No hazard data for this hole."
//   5  Tournament mode (Tools): no arcs, no layers, no Distance arcs row, no Tee plan tile, a tee tap is a
//      plain tap; off again: back
//   6  a spectator: the same
//   7  THE GUARD: no request and no database write carries a position; the only thing stored is the toggle
// Screenshots into SHOTS_052A when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-arcs-plan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); require('./gps-wind-learn.js');
const G = window.HardPanGeo, WL = window.HardPanWindLearn, A = require('./gps-arcs-plan.js');

const CODE = 'ARC052', KEY = 'arcgps_test', ID = '990000000000000052', YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400 * YDM), BALL = G.destination(TEE, 0, 250 * YDM);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const off = (yd, side) => P(G.destination(G.destination(TEE, 0, yd * YDM), side === 'R' ? 90 : 270, 20));
const Z1 = [['fb', 'R'].concat(off(250, 'R')), ['fb', 'R'].concat(off(274, 'R')), ['w', 'L'].concat(off(221, 'L')), ['w', 'L'].concat(off(245, 'L'))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) }, z: Z1 } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Arc Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 052A Ann', 'Test 052A Ben'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Arc Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
// MEASURED ON e89f45f5 (the installed base), this fixture, golfer on the tee, nothing touched (2026-10-21,
// probe-map.js in the job's tmp): identical at 393x852; a pixel diff of the two screens = 0 differing pixels.
const BASE_LAYERS = ['bg', 'usgs', 'esri', 'acc-fill', 'line-case', 'line-to', 'line-on'];
const BASE_SOURCES = ['acc', 'arcs', 'esri', 'hole', 'lines', 'usgs'];

// Ann's Driver: 9 noise-free windy shots with known numbers (still air 262) -> qualified; 3-wood: 4 calm 231s.
const K = { head: -1.2, tail: 0.8, left: -0.5, right: -0.4 };
const DR = [0, 40, 88, 135, 180, 225, 270, 300, 330].map((rel, i) => { const mph = 7 + (i % 4) * 3, c = WL.components(mph, rel);
    return { golfer: 'Test 052A Ann', club: 'Dr', carry: Math.round((262 + K.head * c.head + K.tail * c.tail + K.left * c.fromLeft + K.right * c.fromRight) * 10) / 10, windMph: mph, relAngle: rel, date: Date.UTC(2026, 9, 20) - i * 1e6, course: 'Arc Test', hole: 1 }; });
const W3 = [0, 1, 2, 3].map((i) => ({ golfer: 'Test 052A Ann', club: '3w', carry: 231, windMph: 0, relAngle: 0, date: Date.UTC(2026, 9, 19) - i * 1e6, course: 'Arc Test', hole: 1 }));
// What the page must show, worked out here (the same rounding the shot log applies: carry to 0.1).
const DR_FIT = WL.fit(DR, { hand: 'R' });
const BAG = { Dr: { yd: 262 }, '3w': { yd: 231 }, '5w': { yd: 0 }, Hy: { yd: 205 }, '7i': { yd: 160 }, '8i': { yd: 150 }, '9i': { yd: 138 } };
const SETUP = "(function(){ var d = HardPanGpsBag.defaultCarries(10); Object.keys(d).forEach(function(k){ d[k] = 0; }); d.Dr = 262; d['3w'] = 231; d.Hy = 205; d['7i'] = 160; d['8i'] = 150; d['9i'] = 138; d.PW = 0; HardPanGpsBag.setup('Test 052A Ann', d); return 1; })()";

const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
const GEO = (at) => "(function(){ var cur = { lat: " + at[0] + ", lng: " + at[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const WIND = "try{localStorage.setItem('hardpan_wind_v1_" + KEY + "', JSON.stringify({ at: Date.now() + 3600e3, src: 'weatherkit', obsAt: Date.now(), mph: 12, fromDeg: 0, toDeg: 180, tempF: 70 }));}catch(e){}";
// The map instance, for reading its style and projecting the tee (read only; the page never knows).
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
// Every request the page makes (fetch / XHR / beacon), URL and body.
const NET = "(function(){ window.__REQ = []; var push = function (u, b) { try { window.__REQ.push(String(u) + ' ' + (b == null ? '' : String(b)).slice(0, 4000)); } catch (e) {} };"
    + " var f = window.fetch; if (f) window.fetch = function (u, o) { push(u && u.url || u, o && o.body); return f.apply(this, arguments); };"
    + " var op = XMLHttpRequest.prototype.open, sd = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return op.apply(this, arguments); }; XMLHttpRequest.prototype.send = function (b) { push(this.__u, b); return sd.apply(this, arguments); };"
    + " if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, b) { push(u, b); return sb(u, b); }; } })();";
const SHOTS = process.env.SHOTS_052A || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => Math.round(x);

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    test('Distance arcs + Tee plan at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id), ben = String(r0.players[1].id);
        const pre = (me, at) => 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO(at) + WIND + MAPS + NET + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "', sessionStorage.getItem('__me052') || '" + me + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const DB = { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Arc Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
        let j = await openJourney({ db: DB, viewport: vp, webgl: true, preScript: pre(ann, TEE), blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const style = async () => JSON.parse(await ev("(function(){ var m = window.__maps[window.__maps.length - 1], st = m.getStyle(); return JSON.stringify({ layers: st.layers.map(function(l){ return l.id; }), sources: Object.keys(st.sources).sort() }); })()"));
        const labels = async () => JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay .gps-carry-lbl')).map(function(e){ return e.innerText.replace(/\\s+/g, ' ').trim(); }).sort())"));
        const carry = () => ev("document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')");
        const from = () => ev("document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-from')");
        const TS = "document.querySelector('#gps-overlay .gps-tsheet')", PLAN = "document.querySelector('#gps-overlay .gps-tplan')";
        const openTools = async () => { await ev("document.querySelector('#gps-overlay .gps-tools').click()"); assert.ok(await until("(function(){ var t = " + TS + "; return !!t && t.style.display !== 'none'; })()", 5000), 'Tools'); };
        const closeTools = async () => { await ev("(function(){ var t = " + TS + "; if (t && t.style.display !== 'none') document.querySelector('#gps-overlay .gps-tools').click(); return 1; })()"); await sleep(300); };
        const arcsRow = () => ev("(function(){ var r = " + TS + ".querySelector('[data-ts-row=\"arcs\"]'); var b = r && r.querySelector('[data-ts-sw=\"arcs\"]'); return r ? (r.style.display === 'none' ? 'hidden' : b.getAttribute('aria-checked')) : 'none'; })()");
        const tile = () => ev("(function(){ var b = " + TS + ".querySelector('[data-ts-tile=\".gps-tee-plan\"]'); return b ? b.style.display !== 'none' : null; })()");
        const planText = () => ev("(function(){ var s = " + PLAN + "; return s && s.style.display !== 'none' ? s.innerText.replace(/[ \\t]+/g, ' ') : ''; })()");
        // A real mouse tap on the map, `yd` west of the tee.
        const tapTee = async (yd) => {
            const p = G.destination(TEE, 270, (yd || 0) * YDM);
            // 091 (Manny's OK): a hole opens on the 2x view (the tee shot's target), so the tee is off screen - the
            // magnifier's full-hole step first (2x -> 4x -> full hole), as a golfer would, then the tap on the tee.
            await ev("(function(){ for (var i = 0; i < 3 && HardPanGps.zoomNow && HardPanGps.zoomNow() && HardPanGps.zoomNow().x !== 1; i++) document.querySelector('#gps-overlay .gps-zoom').click(); return 1; })()"); await sleep(400);
            const pt = JSON.parse(await ev("(function(){ var m = window.__maps[window.__maps.length - 1], q = m.project([" + p[1] + "," + p[0] + "]), r = m.getContainer().getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) }); })()"));
            for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
            await sleep(600);
        };
        const arrive = async () => {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(2500);
        };
        try {
            await arrive();
            // 0. ARRIVE, TOUCH NOTHING
            let st = await style();
            assert.deepEqual(st.layers, BASE_LAYERS, 'off: e89f45f5\'s layers'); assert.deepEqual(st.sources, BASE_SOURCES, 'off: e89f45f5\'s sources');
            assert.equal(await carry(), null); assert.deepEqual(await labels(), []);
            assert.equal(await ev('typeof window.HardPanArcsPlan'), 'undefined', 'off: the arcs script is not even loaded');
            await shot('1-toggle-off-map');
            await openTools();
            assert.equal(await arcsRow(), 'false', 'Distance arcs: off by default');
            assert.equal(await tile(), true, 'Tee plan in Tools');
            await ev(TS + ".querySelector('[data-ts-row=\"arcs\"]').scrollIntoView({ block: 'center' })");
            await shot('2-gps-tools-toggle-off');
            // Ann's bag and log (seeded, as the 049 checks do)
            await ev(SETUP);
            await ev('(function(){ var a = ' + JSON.stringify(DR.concat(W3)) + '; a.forEach(function (s) { HardPanShotLog.add(s); }); return HardPanShotLog.list({ golfer: "Test 052A Ann" }).length; })()');
            // 1. ON
            await ev(TS + ".querySelector('[data-ts-sw=\"arcs\"]').click()");
            assert.equal(await arcsRow(), 'true');
            assert.equal(await ev("localStorage.getItem('hardpan_gps_arcs_v1')"), JSON.stringify({ 'n:test 052a ann': 1 }), 'saved for Ann only, on this phone');
            await shot('3-gps-tools-toggle-on');
            await closeTools();
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 8000), 'the arcs');
            st = await style();
            assert.deepEqual(st.layers, BASE_LAYERS.concat(['carry052-still', 'carry052']));
            assert.equal(await from(), 'tee');
            const rel = WL.relAngle(0, G.bearingDeg(TEE, MID));
            const dr = A.lands(262, { mph: 12, rel }, DR_FIT, 'R'), w3 = A.lands(231, { mph: 12, rel }, null, 'R'), hy = A.lands(205, { mph: 12, rel }, null, 'R');
            assert.ok(DR_FIT.qualified && !dr.generic && w3.generic, 'the fixture: Driver her own, 3-wood generic');
            assert.equal(await carry(), 'Dr:' + fmt(dr.yd) + ' 3w:' + fmt(w3.yd) + ':g Hy:' + fmt(hy.yd) + ':g');
            assert.deepEqual(await labels(), ['3W ' + fmt(w3.yd) + ' generic', 'Dr ' + fmt(dr.yd), 'Hy ' + fmt(hy.yd) + ' generic']);
            assert.notEqual(fmt(dr.yd), fmt(A.lands(262, { mph: 12, rel }, null, 'R').yd), 'her own Driver numbers differ from generic - the check can tell them apart');
            await shot('4-arcs-from-tee');
            // 2. FROM THE BALL
            await ev('window.__moveTo(' + BALL[0] + ',' + BALL[1] + ')');
            assert.ok(await until("document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-from') === 'me'", 6000), 'from the ball');
            const ib = (c, y) => fmt(A.lands(y, { mph: 12, rel: WL.relAngle(0, G.bearingDeg(BALL, MID)) }, null, 'R').yd);
            assert.equal(await carry(), '7i:' + ib('7i', 160) + ':g 8i:' + ib('8i', 150) + ':g 9i:' + ib('9i', 138) + ':g');
            await shot('5-arcs-from-ball');
            // 3. REMEMBERED, PER GOLFER
            await ev('window.__moveTo(' + TEE[0] + ',' + TEE[1] + ')');
            await arrive();
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 8000), 'still on for Ann after a reload');
            // this phone as Ben (the same phone, the same storage): off
            await ev("sessionStorage.setItem('__me052', '" + ben + "')");
            await arrive();
            assert.equal(await carry(), null, 'Ben: off');
            assert.deepEqual((await style()).layers, BASE_LAYERS);
            await openTools();
            assert.equal(await arcsRow(), 'false', 'Ben\'s switch: off');
            await closeTools();
            assert.equal(await ev("localStorage.getItem('hardpan_gps_arcs_v1')"), JSON.stringify({ 'n:test 052a ann': 1 }), 'Ann\'s stays');
            await ev("sessionStorage.setItem('__me052', '" + ann + "')");
            await arrive();
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 8000), 'Ann again: on');
            // 4. THE TEE PLAN: a real tap on the tee (8 yds west of it - the golfer's dot sits on it)
            await tapTee(8);
            assert.ok(await until("(function(){ var s = " + PLAN + "; return !!s && s.style.display !== 'none' && /in play|Clear/.test(s.innerText); })()", 8000), 'the tee plan');
            const p = A.plan({ bag: BAG, fits: { Dr: DR_FIT }, hand: 'R', wind: { mph: 12, fromDeg: 0 }, tee: TEE, mid: MID, path: null, hazards: Z1.map((z) => ({ type: z[0], side: z[1], pt: [z[2], z[3]] })), par: 4 });
            let txt = await planText();
            assert.match(txt, /^Tee plan · Hole 1\nPar 4 · 400 to the middle · 12 mph into you \(\d+°\)\nDone\n/, txt);
            const sum = p.rows.map((x) => x.name + ' \u2192 ' + fmt(x.inYd) + ' in').join(' · ');
            assert.ok(txt.indexOf(sum) > 0, 'summary: ' + sum + '\n' + txt);
            p.rows.forEach((x) => {
                // the name, its "generic" tag exactly when the club is generic (049 (i) rule), the yards in
                assert.ok(new RegExp('\\n' + x.name + (x.generic ? '\\s*generic' : '') + '\\n' + fmt(x.inYd) + ' in\\n').test(txt), x.name + '\n' + txt);
                if (!x.hazards.length) assert.ok(txt.indexOf('Clear of the hole\u2019s hazards') > 0);
                x.hazards.forEach((z) => assert.ok(txt.indexOf(z.name + ' in play · reach ' + fmt(z.reachYd) + ' · carry ' + fmt(z.carryYd)) > 0, z.name + '\n' + txt));
            });
            assert.ok(p.rows.some((x) => x.hazards.length), 'the fixture puts at least one hazard in play');
            assert.match(txt, /From your|from 9 marked shots/);
            await shot('6-tee-plan-sheet');
            await ev(PLAN + ".querySelector('.gps-tplan-done').click()");
            // Tools > Tee plan, the arcs OFF
            await openTools();
            await ev(TS + ".querySelector('[data-ts-sw=\"arcs\"]').click()");
            assert.equal(await arcsRow(), 'false');
            await closeTools();
            assert.ok(await until("!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 5000));
            assert.deepEqual((await style()).layers, BASE_LAYERS, 'off again: the layers go');
            assert.deepEqual(await labels(), []);
            await openTools();
            await ev(TS + ".querySelector('[data-ts-tile=\".gps-tee-plan\"]').click()");
            assert.ok(await until("(function(){ var s = " + PLAN + "; return !!s && s.style.display !== 'none' && s.innerText.indexOf('" + sum.replace(/'/g, "\\'") + "') > 0; })()", 6000), 'Tools > Tee plan, arcs off');
            await ev(PLAN + ".querySelector('.gps-tplan-done').click()");
            await ev('HardPanGps.setHole(2, 4)'); await sleep(1500);
            await openTools();
            await ev(TS + ".querySelector('[data-ts-tile=\".gps-tee-plan\"]').click()");
            assert.ok(await until("(function(){ var s = " + PLAN + "; return !!s && s.style.display !== 'none' && /No hazard data for this hole\\./.test(s.innerText); })()", 6000), 'hole 2: no hazard data, said plainly');
            await shot('7-tee-plan-no-hazards');
            await ev(PLAN + ".querySelector('.gps-tplan-done').click()");
            await ev('HardPanGps.setHole(1, 4)'); await sleep(1500);
            // 5. TOURNAMENT MODE
            await openTools();
            await ev(TS + ".querySelector('[data-ts-sw=\"arcs\"]').click()");   // on again
            await ev(TS + ".querySelector('[data-ts-sw=\"tourney\"]').click()");
            assert.equal(await arcsRow(), 'hidden', 'tournament: no Distance arcs row');
            assert.equal(await tile(), false, 'tournament: no Tee plan tile');
            await closeTools();
            await sleep(800);
            assert.equal(await carry(), null); assert.deepEqual((await style()).layers, BASE_LAYERS); assert.deepEqual(await labels(), []);
            await tapTee(8);
            assert.equal(await planText(), '', 'tournament: a tee tap opens nothing');
            await openTools();
            await ev(TS + ".querySelector('[data-ts-sw=\"tourney\"]').click()");
            assert.equal(await arcsRow(), 'true', 'tournament off: back, still on');
            await closeTools();
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 6000), 'arcs back');
            // 6. A SPECTATOR (the doors' answer replaced; the page does the rest on its next fix)
            await tapTee(8);
            assert.notEqual(await planText(), '');
            await ev("(function(){ window.HardPanDoors = window.HardPanDoors || {}; window.HardPanDoors.spectating = function () { return true; }; window.__moveTo(" + TEE[0] + "," + TEE[1] + "); return 1; })()");
            assert.ok(await until("!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 6000), 'spectator: no arcs');
            assert.equal(await planText(), '', 'spectator: the plan closed');
            assert.deepEqual((await style()).layers, BASE_LAYERS);
            await openTools();
            assert.equal(await arcsRow(), 'hidden'); assert.equal(await tile(), false);
            await closeTools();
            // 7. THE GUARD
            const req = JSON.parse(await ev('JSON.stringify(window.__REQ || [])'));
            const writes = JSON.stringify(JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')));
            // The golfer's own spot (the ball, 150 out - not a course point). The tee / green are COURSE points the
            // app already asks USGS heights for (e89f45f5 does the same; "never your position"), so they are not
            // the golfer's location even while the golfer stands on the tee.
            assert.ok(req.length > 0 && req.some((r) => /nationalmap/.test(r)), 'positive: the capture sees the page\'s requests');
            const pos = [BALL[0].toFixed(4), BALL[1].toFixed(4)];
            req.forEach((r) => { pos.forEach((x) => assert.ok(r.indexOf(x) === -1, 'the golfer\'s position in a request: ' + r.slice(0, 200))); assert.ok(!/arcs|carry052|tplan|hazard/i.test(r), r.slice(0, 200)); });
            [TEE, BALL, MID].forEach((q) => [q[0].toFixed(4), q[1].toFixed(4)].forEach((x) => assert.ok(writes.indexOf(x) === -1, 'a position in a database write')));
            assert.ok(!/arcs|carry052|tplan/.test(writes), 'nothing of the arcs or the plan in the database');
            const keys = JSON.parse(await ev("JSON.stringify(Object.keys(localStorage).filter(function(k){ return /arcs|plan|carry/.test(k); }))"));
            assert.deepEqual(keys, ['hardpan_gps_arcs_v1'], 'the toggle is all that is stored');
            assert.deepEqual(j.consoleErrors.filter((e) => /arcs|tplan|carry|HardPanArcsPlan/.test(e.text)), []);
        } finally { await j.close(); }
    });
}
