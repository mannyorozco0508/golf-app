// URGENT-064 #7 - NO "HAZARDS" BUTTON ON THE GPS MAP (Manny, Oct 24 8:56 AM), IN REAL CHROME.
// The button is gone from the right-side stack (layout D's rail, layout C's panel row); the stack
// closes the gap. The hazard DATA stays and everything that uses it keeps working:
//   S  the source: no gps-hz-btn anywhere in gps-view.js; the hazard data path (holeHazards,
//      drawHazards, apprHazards, the tee plan's hz) is still there.
//   0  ARRIVE (393x852, 375x667, 430x932): no Hazards button in the page; the rail is Wind,
//      Green, Preview, Zoom (the visible ones), each 8px under the one above - no gap where
//      Hazards was. The map's own hazard chips (B / W yards) still show on hole 1.
//   1  Tools > Distance arcs ON: the arcs at the yards worked out HERE from gps-arcs-plan.js.
//   2  tap the TEE: the Tee plan lists each club's hazards in play ("... in play · reach N ·
//      carry N"), exactly as gps-arcs-plan.js works them out in node.
//   3  Tools has no Hazards entry (default: none - Manny to say if he wants one).
// A made-up course (synthetic - no licensed data), as urgent052a_arcs_chrome_test.js: hole 1 a
// straight 400-yd par 4 north, a fairway bunker right (250 / 274) and water left (221 / 245).
// Golfers "Test 064 Ann" / "Test 064 Ben". Nothing is written to any database (the journey's
// in-page stand-in). Screenshots into SHOTS_064_7 when set.
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

const CODE = 'HZB064', KEY = 'hzbgps_test', ID = '990000000000000064', YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400 * YDM);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const off = (yd, side) => P(G.destination(G.destination(TEE, 0, yd * YDM), side === 'R' ? 90 : 270, 20));
const Z1 = [['fb', 'R'].concat(off(250, 'R')), ['fb', 'R'].concat(off(274, 'R')), ['w', 'L'].concat(off(221, 'L')), ['w', 'L'].concat(off(245, 'L'))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) }, z: Z1 } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Hazard Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 064 Ann', 'Test 064 Ben'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Hazard Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const BAG = { Dr: { yd: 262 }, '3w': { yd: 231 }, '5w': { yd: 0 }, Hy: { yd: 205 }, '7i': { yd: 160 }, '8i': { yd: 150 }, '9i': { yd: 138 } };
const SETUP = "(function(){ var d = HardPanGpsBag.defaultCarries(10); Object.keys(d).forEach(function(k){ d[k] = 0; }); d.Dr = 262; d['3w'] = 231; d.Hy = 205; d['7i'] = 160; d['8i'] = 150; d['9i'] = 138; d.PW = 0; HardPanGpsBag.setup('Test 064 Ann', d); return 1; })()";
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
const GEO = (at) => "(function(){ var cur = { lat: " + at[0] + ", lng: " + at[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const WIND = "try{localStorage.setItem('hardpan_wind_v1_" + KEY + "', JSON.stringify({ at: Date.now() + 3600e3, src: 'weatherkit', obsAt: Date.now(), mph: 12, fromDeg: 0, toDeg: 180, tempF: 70 }));}catch(e){}";
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
const SHOTS = process.env.SHOTS_064_7 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => Math.round(x);

test('S: the source - no Hazards button, the hazard data path kept', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.ok(!/gps-hz-btn/.test(v), 'no Hazards button (markup, wiring, layout slot or style)');
    assert.ok(!/>Hazards<\/button>/.test(v), 'no button labelled Hazards');
    assert.match(v, /function holeHazards\(\) \{/, 'the hole\'s hazard points');
    assert.match(v, /var inp = A \? arcsInputs\(\) : null, hz = holeHazards\(\);/, 'the tee plan reads them');
    assert.match(v, /function drawHazards\(\) \{/, 'the map\'s hazard chips');
    assert.match(v, /function apprHazards\(r\) \{/, 'the approach carries');
    assert.match(v, /function fillLayups\(/, 'the layup code (unchanged)');
    const right = v.slice(v.indexOf("+ '<div class=\"gps-right\""), v.indexOf("+ '<div class=\"gps-clubs gps-float\""));
    assert.ok(/gps-wind/.test(right) && /gps-green-view/.test(right) && /gps-mark-shot/.test(right) && /gps-fly-btn/.test(right), 'the rest of the stack: unchanged');
});

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    test('No Hazards button; tee plan + arcs unaffected at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO(TEE) + WIND + MAPS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "', '" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const DB = { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Hazard Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
        const j = await openJourney({ db: DB, viewport: vp, webgl: true, preScript: pre, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const TS = "document.querySelector('#gps-overlay .gps-tsheet')", PLAN = "document.querySelector('#gps-overlay .gps-tplan')";
        const openTools = async () => { await ev("document.querySelector('#gps-overlay .gps-tools').click()"); assert.ok(await until("(function(){ var t = " + TS + "; return !!t && t.style.display !== 'none'; })()", 5000), 'Tools'); };
        const closeTools = async () => { await ev("(function(){ var t = " + TS + "; if (t && t.style.display !== 'none') document.querySelector('#gps-overlay .gps-tools').click(); return 1; })()"); await sleep(300); };
        const planText = () => ev("(function(){ var s = " + PLAN + "; return s && s.style.display !== 'none' ? s.innerText.replace(/[ \\t]+/g, ' ') : ''; })()");
        const carry = () => ev("document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')");
        const tapTee = async (yd) => {
            const p = G.destination(TEE, 270, (yd || 0) * YDM);
            // 091 (Manny's OK): a hole opens on the 2x view (the tee shot's target), so the tee is off screen - the
            // magnifier's full-hole step first (2x -> 4x -> full hole), as a golfer would, then the tap on the tee.
            await ev("(function(){ for (var i = 0; i < 3 && HardPanGps.zoomNow && HardPanGps.zoomNow() && HardPanGps.zoomNow().x !== 1; i++) document.querySelector('#gps-overlay .gps-zoom').click(); return 1; })()"); await sleep(400);
            const pt = JSON.parse(await ev("(function(){ var m = window.__maps[window.__maps.length - 1], q = m.project([" + p[1] + "," + p[0] + "]), r = m.getContainer().getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) }); })()"));
            for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
            await sleep(600);
        };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(2500);
            await ev(SETUP);
            // 0. NO BUTTON; THE STACK CLOSES THE GAP; THE MAP'S HAZARD CHIPS STAY
            assert.equal(await ev("HardPanGps.layout()"), 'd', 'layout D (the default)');
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-hz-btn').length"), 0, 'no Hazards button in the page');
            const btnText = JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay button, #gps-overlay [role=button]')).filter(function(b){ return b.offsetParent !== null; }).map(function(b){ return (b.innerText || '').trim(); }))"));
            assert.ok(btnText.length > 5 && !btnText.some((t) => /^Hazards\b/i.test(t)), 'no visible control says Hazards: ' + JSON.stringify(btnText));
            const rail = JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay .gps-ld-rail > *')).filter(function(e){ return e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }).map(function(e){ var b = e.getBoundingClientRect(); return { cls: e.className.split(' ')[0], t: Math.round(b.top), b: Math.round(b.bottom), r: Math.round(b.right) }; }))"));
            const order = ['gps-wind', 'gps-green-view', 'gps-fly-btn', 'gps-zoom'];
            assert.ok(rail.length >= 2 && rail.every((x) => order.indexOf(x.cls) >= 0), 'the rail: Wind, Green, Preview, Zoom only: ' + JSON.stringify(rail));
            assert.deepEqual(rail.map((x) => x.cls), order.filter((c) => rail.some((x) => x.cls === c)), 'in that order');
            for (let i = 1; i < rail.length; i++) assert.ok(rail[i].t - rail[i - 1].b >= 6 && rail[i].t - rail[i - 1].b <= 10, 'no gap in the stack: ' + JSON.stringify([rail[i - 1], rail[i]]));
            assert.ok(await until("document.querySelectorAll('#gps-overlay .gps-hz').length > 0", 6000), 'the map\'s hazard chips (B / W yards) still show');
            const chips = JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay .gps-hz')).map(function(e){ return e.textContent; }).sort())"));
            assert.ok(chips.some((t) => /^B \d+/.test(t)) && chips.some((t) => /^W \d+/.test(t)), 'bunker and water chips: ' + JSON.stringify(chips));
            await shot('1-map-no-hazards-button');
            // 1. ARCS: Tools > Distance arcs ON, at the yards worked out here
            await openTools();
            const hzEntry = JSON.parse(await ev("JSON.stringify(Array.from(" + TS + ".querySelectorAll('*')).filter(function(e){ return !e.children.length && /hazard/i.test(e.textContent || ''); }).map(function(e){ return e.textContent.trim(); }))"));
            assert.deepEqual(hzEntry, [], '3: Tools has no Hazards entry');
            await ev(TS + ".querySelector('[data-ts-sw=\"arcs\"]').click()");
            await closeTools();
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 8000), 'the arcs');
            const rel = WL.relAngle(0, G.bearingDeg(TEE, MID));
            const dr = A.lands(262, { mph: 12, rel }, null, 'R'), w3 = A.lands(231, { mph: 12, rel }, null, 'R'), hy = A.lands(205, { mph: 12, rel }, null, 'R');
            assert.equal(await carry(), 'Dr:' + fmt(dr.yd) + ':g 3w:' + fmt(w3.yd) + ':g Hy:' + fmt(hy.yd) + ':g', 'the arcs: unaffected');
            await shot('2-arcs-on');
            // 2. THE TEE PLAN STILL LISTS THE HAZARDS IN PLAY
            await tapTee(8);
            assert.ok(await until("(function(){ var s = " + PLAN + "; return !!s && s.style.display !== 'none' && /in play|Clear/.test(s.innerText); })()", 8000), 'the tee plan');
            const p = A.plan({ bag: BAG, fits: {}, hand: 'R', wind: { mph: 12, fromDeg: 0 }, tee: TEE, mid: MID, path: null, hazards: Z1.map((z) => ({ type: z[0], side: z[1], pt: [z[2], z[3]] })), par: 4 });
            const txt = await planText();
            assert.match(txt, /^Tee plan · Hole 1\n/, txt);
            assert.ok(p.rows.some((x) => x.hazards.length), 'the fixture puts at least one hazard in play');
            p.rows.forEach((x) => x.hazards.forEach((z) => assert.ok(txt.indexOf(z.name + ' in play · reach ' + fmt(z.reachYd) + ' · carry ' + fmt(z.carryYd)) > 0, z.name + '\n' + txt)));
            await shot('3-tee-plan-hazards-in-play');
            await ev(PLAN + ".querySelector('.gps-tplan-done').click()");
            assert.deepEqual(j.consoleErrors.filter((e) => /hz|hazard|tplan|arcs|carry/i.test(e.text)), []);
        } finally { await j.close(); }
    });
}
