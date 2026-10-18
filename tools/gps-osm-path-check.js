#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - OPENSTREETMAP HOLE LINES ON A GOLFAPI COURSE, ON THE MAP (010, osmPath)
//
//   node tools/gps-osm-path-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome with WebGL, the app, a subscriber (tools/lib/iap-stub.js), the SHIPPED
// source settings - osm: false, live: true - and a GolfAPI course the way the app
// carries one (window.HardPanGolfApi, linked to the bundled 'caledonia'): tees 15 m
// and green centers 20 m off the bundled OpenStreetMap ones, no dogleg point (GolfAPI's
// usual). Hole 13: its OSM line bends ~60 degrees. The golfer stands on GolfAPI's tee.
//   1  osmPath ON: Preview flies the OSM bend (src centerline, the camera over the
//      corner, turning with it); the white default target sits on the corner, on the
//      OSM path; F / C / B are GolfAPI's (CENTER = the yards to GolfAPI's green center,
//      inline haversine - not OSM's green); "© OpenStreetMap" is on the map, and the
//      ⓘ credits list "OpenStreetMap contributors".
//   2  osmPath OFF: 009 exactly - Preview flies straight, the target on the straight
//      line, no OSM credit on the map; F / C / B the same numbers as 1.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'gps-view.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no GPS.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const table = require(path.join(HERE, 'gps-courses.js'));
const geo = require(path.join(HERE, 'gps-geo.js'));
const shipped = (() => { const sb = {}; sb.window = sb; require('vm').runInNewContext(fs.readFileSync(path.join(HERE, 'gps-config.js'), 'utf8'), sb); return sb.HARDPAN_GPS_CONFIG; })();

const CODE = 'OSMPTH', HOLE = '13';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const bear = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const angle = (a, b) => Math.abs(((b - a + 540) % 360) - 180);
const r6 = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
const yd = (m) => String(Math.round(m / 0.9144));

// THE GOLFAPI COURSE: from the bundled Caledonia holes, GolfAPI's own points beside them
// (tee 15 m to the side, green center 20 m long).
const O = (n) => table.caledonia.holes[String(n)].osm;
const holes = {};
for (let n = 1; n <= 18; n++) {
    const o = O(n), end = o.line[o.line.length - 1], b = bear(o.line[0], end);
    const c = r6(dest(end, b, 20));   // 20 m beyond OSM's line end: CENTER tells the two apart
    holes[n] = { g: { f: r6(dest(c, b, -12)), c, b: r6(dest(c, b, 12)) }, t: { b: r6(dest(o.line[0], b + 90, 15)) } };
}
const GA = { built: true, courses: { CHK1: { id: 'CHK1', club: 'Caledonia Golf & Fish Club', course: 'Caledonia', lat: O(1).tee[0], lng: O(1).tee[1], holes: 18, h: holes } }, links: { caledonia: 'CHK1' } };
const TEE = holes[HOLE].t.b, GC = holes[HOLE].g.c, BEND = O(HOLE).line[1];
const OSM_LINE = [TEE].concat(O(HOLE).line.slice(1, -1), [GC]), STRAIGHT = [TEE, GC];

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
const TILE = "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { if (/basemap\\.nationalmap\\.gov/.test(String(u && u.url || u))) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
// The SHIPPED osm / live settings kept; only no Esri key, and the GolfAPI file named (it is set below).
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{golfapi:true,golfapiFile:'gps-golfapi-check.js',esriKey:''"
    + (features ? ',features:Object.assign({},v.features,' + JSON.stringify(features) + ')' : '') + "});}});})();"
    + 'window.HardPanGolfApi = ' + JSON.stringify(GA) + ';';
const GEO = (p) => "(function(){ var live = {}, n = 1;"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: " + p[0] + ", longitude: " + p[1] + ", accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SEED = "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '" + HOLE + "'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_autoadvance', '0'); } catch (e) {} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const CATCH = "(function(){ var v; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return v; }, set: function (x) {"
    + " if (!x || !x.Map) { v = x; return; } var M = x.Map, W = function (o) { var m = new M(o); window.__map = m; return m; }; W.prototype = M.prototype;"
    + " v = new Proxy(x, { get: function (t, k) { return k === 'Map' ? W : t[k]; } }); } }); })();";
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*', '*openstreetmap*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + CATCH + APP + TILE + ERR + GEO(TEE) + SEED + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const WAIT_MAP = { waitFor: "(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && Number(m.dataset.zoom) > 3); })()", timeout: 45000 };
const W = (ms) => ({ sleep: ms });
const START = [W(2500), OPEN, WAIT_MAP, W(1800)];
// The screen: the numbers, the source line, the credit on the map, the target.
const ST = { expression: "JSON.stringify((function () { var q = function (s) { return document.querySelector('#gps-overlay ' + s); }, t = function (s) { var e = q(s); return e ? e.textContent.trim() : null; };"
    + " var m = window.__map, tg = q('.gps-target'), target = null; if (m && tg) { var b = tg.getBoundingClientRect(), c = q('.maplibregl-canvas').getBoundingClientRect(); var p = m.unproject([b.left + b.width / 2 - c.left, b.top + b.height / 2 - c.top]); target = [p.lat, p.lng]; }"
    + " var oc = q('.gps-credit-osm'), r = oc && oc.getBoundingClientRect();"
    + " return { f: t('.gps-f'), m: t('.gps-m'), b: t('.gps-b'), osmPath: (q('.gps-map') || { dataset: {} }).dataset.osmPath || null,"
    + " osmCredit: oc ? { shown: getComputedStyle(oc).display !== 'none' && r.width > 0 && r.bottom <= innerHeight && r.top >= 0, text: oc.textContent.trim() } : null,"
    + " credit: t('.gps-credit'), target: target, e: window.__e }; })())" };
const POP = { expression: "JSON.stringify((function(){ var i = document.querySelector('#gps-overlay .gps-credit-i'); if (i) i.click(); var p = document.querySelector('#gps-overlay .gps-credit-pop'); var s = p ? p.textContent : null; if (i) i.click(); return { pop: s }; })())" };
const FLY = { expression: "(function(){ window.__cam = []; var m = window.__map; window.__camT = setInterval(function () { if (!m) return; var c = m.getCenter();"
    + " window.__cam.push([c.lat, c.lng, m.getBearing(), m.getPitch(), m.getZoom()]); }, 50); var b = document.querySelector('#gps-overlay .gps-fly-btn'); if (!b) return 'none'; b.click(); return 'ok'; })()" };
const CAM = { expression: "JSON.stringify((function () { clearInterval(window.__camT); var d = document.querySelector('#gps-overlay .gps-map').dataset;"
    + " return { cam: window.__cam || [], src: d.flySrc || null, path: d.flyPath || null }; })())" };
const STEPS = START.concat([ST, POP, FLY, W(5900), CAM]);

(async () => {
    const fails = [], report = { shipped: { osm: shipped.osm, live: shipped.live, osmPath: shipped.features && shipped.features.osmPath } };
    const f = (c, m) => { if (!c) fails.push(m); };
    f(shipped.osm === false && shipped.live === true && shipped.features.osmPath === true, '0: the shipped config is not osm: false, live: true, osmPath on: ' + JSON.stringify(report.shipped));
    // CENTER, inline: the yards from the golfer (GolfAPI's tee) to GolfAPI's green center.
    const wantM = yd(hav(TEE, GC)), osmM = yd(hav(TEE, O(HOLE).mid));
    report.center = { golfapi: wantM, osmGreen: osmM };
    f(wantM !== osmM, '0: the stand-in cannot tell GolfAPI\'s green from OSM\'s (' + wantM + ')');
    const nearMin = (cam, p) => Math.min.apply(null, cam.map((c) => hav([c[0], c[1]], p)));

    // 1: osmPath ON (the shipped switches).
    let s = await go({ steps: STEPS });
    const [on, pop, camOn] = s;
    const leg1 = bear(TEE, BEND), leg2 = bear(BEND, GC), tilted = camOn.cam.filter((c) => c[3] > 20).map((c) => c[2]);
    report.on = { nums: [on.f, on.m, on.b], osmPath: on.osmPath, osmCredit: on.osmCredit, credit: on.credit, src: camOn.src, samples: camOn.cam.length,
        nearBendM: camOn.cam.length ? Math.round(nearMin(camOn.cam, BEND)) : null, targetToBendM: on.target && Math.round(hav(on.target, BEND)), targetOffOsmM: on.target && +geo.alongLine(on.target, OSM_LINE).d.toFixed(1),
        popHasOsm: /OpenStreetMap contributors/.test(pop.pop || '') };
    f(on.m === wantM, '1: CENTER is not GolfAPI\'s ' + wantM + ' (OSM\'s would be ' + osmM + '): ' + on.m);
    f(on.osmPath === '1', '1: the map does not say an OSM line shapes the hole: ' + on.osmPath);
    f(on.osmCredit && on.osmCredit.shown && /© OpenStreetMap/.test(on.osmCredit.text), '1: the ODbL credit is not on the map: ' + JSON.stringify(on.osmCredit));
    f(report.on.popHasOsm, '1: ⓘ does not list OpenStreetMap contributors: ' + pop.pop);
    f(camOn.src === 'centerline', '1: Preview did not fly the OSM line: ' + camOn.src);
    f(camOn.cam.length > 40 && nearMin(camOn.cam, BEND) < 35, '1: the camera did not pass over the OSM bend: ' + report.on.nearBendM);
    f(tilted.length && Math.min.apply(null, tilted.map((b) => angle(b, leg1))) < 15 && Math.min.apply(null, tilted.map((b) => angle(b, leg2))) < 15, '1: the flight did not turn with the OSM dogleg');
    f(on.target && hav(on.target, BEND) < 10 && geo.alongLine(on.target, OSM_LINE).d < 10, '1: the default target is not on the OSM corner: ' + JSON.stringify(report.on));
    s.forEach((x) => { if (x.e && x.e.length) fails.push('on: page errors ' + x.e.join(' | ')); });

    // 2: osmPath OFF - 009.
    s = await go({ features: { osmPath: false }, steps: STEPS });
    const [off, , camOff] = s;
    report.off = { nums: [off.f, off.m, off.b], osmPath: off.osmPath, osmCredit: off.osmCredit, src: camOff.src, nearBendM: camOff.cam.length ? Math.round(nearMin(camOff.cam, BEND)) : null,
        targetOffStraightM: off.target && +geo.alongLine(off.target, STRAIGHT).d.toFixed(1) };
    f(JSON.stringify([off.f, off.m, off.b]) === JSON.stringify([on.f, on.m, on.b]), '2: F / C / B changed with the switch: ' + JSON.stringify([report.on.nums, report.off.nums]));
    f(off.osmPath === '0' && off.osmCredit && !off.osmCredit.shown, '2: switch off, but the OSM line / credit is in use: ' + JSON.stringify(report.off));
    f(camOff.src === 'straight', '2: switch off: Preview is not 009\'s straight GolfAPI flight: ' + camOff.src);
    f(off.target && geo.alongLine(off.target, STRAIGHT).d < 3, '2: switch off: the default target left the straight line: ' + JSON.stringify(report.off));
    s.forEach((x) => { if (x.e && x.e.length) fails.push('off: page errors ' + x.e.join(' | ')); });

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
