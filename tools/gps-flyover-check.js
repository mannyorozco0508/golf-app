#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - HOLE FLYOVER / PREVIEW, FLOWN (008, switch flyover; 009: the path)
//
//   node tools/gps-flyover-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome with WebGL (the MapLibre map), the app, a subscriber
// (tools/lib/iap-stub.js), Caledonia (bundled), the golfer on the tee. The camera is
// read from MapLibre itself (the map, caught as the page makes it) every 50 ms.
//   1  Preview on a DOGLEG (hole 13, its OpenStreetMap line bends ~60 degrees): it
//      starts on the whole hole (tee and green on screen), tilts, passes over the
//      bend, turns with it, ends flat on the green with its F / C / B pins on screen
//      (closer than the start), with "Hole 13 · Par N · N yds" over it; about 5 s
//      later it is back on the normal hole view, flat, words gone.
//   2  A touch during a flight stops it - back on the hole view at once.
//   3  THE DRAGGED TARGET: hole 13 drawn as a straight line only (no fairway) - the
//      golfer taps the target into the dogleg; Preview flies tee -> target -> green.
//   4  prefers-reduced-motion: no flight (no camera frames) - the whole hole framed at
//      once with the words, then the normal view.
//   5  The 008 switch off: no Preview button in the page.
//   6  THE DEFAULT TARGET ON THE PATH (009, switch pathTarget): on the dogleg the white
//      target starts on the corner (switch off: 260 along the line, past it); drawn
//      straight with a fairway mapped, it sits on the fairway's bend, off the straight
//      line; straight with nothing else, it is where it always was (switch on = off).
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

const CODE = 'FLYOVR';
const R = 6371008.8, rad = (d) => d * Math.PI / 180;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const HOLE = '13', H = table.caledonia.holes[HOLE].osm, BEND = H.line[1];

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
// USGS TILES, STOOD IN: a blank 1x1 tile for every basemap.nationalmap.gov request (MapLibre's
// load event waits for the first view's tiles; a blocked request never answers it). No network.
const TILE = "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { if (/basemap\\.nationalmap\\.gov/.test(String(u && u.url || u))) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:''" + (features ? ',features:' + JSON.stringify(features) : '') + "});}});})();";
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
// THE MAP, CAUGHT: maplibregl.Map wrapped as the page loads it, so the check reads the camera
// (getCenter / getBearing / getPitch / project) from MapLibre, not from the app's own words.
const CATCH = "(function(){ var v; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return v; }, set: function (x) {"
    + " if (!x || !x.Map) { v = x; return; } var M = x.Map, W = function (o) { var m = new M(o); window.__map = m; return m; }; W.prototype = M.prototype;"
    + " v = new Proxy(x, { get: function (t, k) { return k === 'Map' ? W : t[k]; } }); } }); })();";
// HOLE 13 AS A STRAIGHT LINE: the bundled record's line cut to tee -> green (and, unless kept, no fairway).
const STRAIGHT = (keepFairway) => "(function(){ var v; Object.defineProperty(window, 'HardPanGpsCourses', { configurable: true, get: function () { return v; }, set: function (x) {"
    + " try { var o = x.caledonia.holes['" + HOLE + "'].osm; o.line = [o.line[0], o.line[o.line.length - 1]];" + (keepFairway ? '' : ' delete o.fairway;') + " } catch (e) {} v = x; } }); })();";
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + CATCH + (o.pre || '') + APP + TILE + ERR + GEO(H.tee) + SEED + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const ST = { expression: "JSON.stringify((function () { var m = document.querySelector('#gps-overlay .gps-map'), d = m ? m.dataset : {}, b = document.querySelector('#gps-overlay .gps-fly-btn'), c = document.querySelector('#gps-overlay .gps-fly-cap');"
    + " return { ready: d.ready || null, zoom: d.zoom || null, bearing: d.bearing || null, fly: d.fly || null, at: d.flyAt || null, frames: Number(d.flyFrames || 0), pitch: d.flyPitch == null ? null : Number(d.flyPitch),"
    + " btn: b ? getComputedStyle(b).display !== 'none' : null, cap: c ? (c.style.display === 'none' ? '' : c.textContent) : null, e: window.__e }; })())" };
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const TOUCH = { expression: "(function(){ var m = document.querySelector('#gps-overlay .gps-map'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 400 })); return 'touch'; })()" };
const WAIT_MAP = { waitFor: "(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && Number(m.dataset.zoom) > 3); })()", timeout: 45000 };
const W = (ms) => ({ sleep: ms });
const START = [W(2500), OPEN, WAIT_MAP, W(1500)];
const ptOf = (s) => s ? s.split(',').map(Number) : null;
// The camera every 50 ms from Preview on (MapLibre's own numbers), and the app's marks.
const FLY_SAMPLED = { expression: "(function(){ window.__cam = []; var m = window.__map; window.__camT = setInterval(function () { if (!m) return; var c = m.getCenter();"
    + " window.__cam.push([c.lat, c.lng, m.getBearing(), m.getPitch(), m.getZoom()]); }, 50); var b = document.querySelector('#gps-overlay .gps-fly-btn'); if (!b) return 'none'; b.click(); return 'ok'; })()" };
const CAM = { expression: "JSON.stringify((function () { clearInterval(window.__camT); var d = document.querySelector('#gps-overlay .gps-map').dataset;"
    + " return { cam: window.__cam || [], src: d.flySrc || null, path: d.flyPath || null, startFit: d.flyStartFit || null, endFit: d.flyEndFit || null, z0: Number(d.flyZ0), z1: Number(d.flyZ1) }; })())" };
// A tap on the map at a lat / lng (MapLibre's own events, at the pixel MapLibre puts it).
const TAP_AT = (p) => ({ expression: "(function(){ var m = window.__map; if (!m) return 'no map'; var q = m.project([" + p[1] + ", " + p[0] + "]), c = document.querySelector('#gps-overlay .maplibregl-canvas'), r = c.getBoundingClientRect();"
    + " ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + q.x, clientY: r.top + q.y, button: 0 })); }); return 'tapped'; })()" });
// Where the white target circle is, as a lat / lng (its middle, unprojected by MapLibre).
const TARGET = { expression: "JSON.stringify((function(){ var m = window.__map, t = document.querySelector('#gps-overlay .gps-target'); if (!m || !t) return { target: null };"
    + " var b = t.getBoundingClientRect(), c = document.querySelector('#gps-overlay .maplibregl-canvas').getBoundingClientRect(); var p = m.unproject([b.left + b.width / 2 - c.left, b.top + b.height / 2 - c.top]); return { target: [p.lat, p.lng] }; })())" };
const angle = (a, b) => Math.abs(((b - a + 540) % 360) - 180);
const bear = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });
    // What a flight's samples say: passes near `bend`, turned with the dogleg, tilted.
    const flown = (tag, cam, bend, leg1, leg2) => {
        const fly = cam.cam;
        const near = Math.min.apply(null, fly.map((c) => hav([c[0], c[1]], bend)));
        const pitch = Math.max.apply(null, fly.map((c) => c[3]));
        const bs = fly.filter((c) => c[3] > 20).map((c) => c[2]);
        const b1 = Math.min.apply(null, bs.map((b) => angle(b, leg1))), b2 = Math.min.apply(null, bs.map((b) => angle(b, leg2)));
        report[tag] = { samples: fly.length, nearBendM: Math.round(near), maxPitch: Math.round(pitch), closestToLeg1: Math.round(b1), closestToLeg2: Math.round(b2), src: cam.src, startFit: cam.startFit, endFit: cam.endFit, z0: cam.z0, z1: cam.z1 };
        f(fly.length > 40, tag + ': too few camera samples: ' + fly.length);
        f(near < 35, tag + ': the camera did not pass over the bend (' + Math.round(near) + ' m away at closest)');
        f(pitch > 20, tag + ': never tilted: ' + pitch);
        f(b1 < 15 && b2 < 15, tag + ': the bearing did not follow the dogleg (first leg ' + Math.round(leg1) + ', second ' + Math.round(leg2) + '; closest ' + Math.round(b1) + ' / ' + Math.round(b2) + ')');
        f(cam.startFit === '1', tag + ': the first frame did not show the tee and the green: ' + cam.startFit);
        f(cam.endFit === '1' && cam.z1 > cam.z0 + 0.5, tag + ': did not end framing the green with F / C / B (closer than the start): ' + JSON.stringify([cam.endFit, cam.z0, cam.z1]));
    };
    const leg1 = bear(H.line[0], BEND), leg2 = bear(BEND, H.line[H.line.length - 1]);

    // 1 + 2: the flight on the dogleg, then a flight stopped by a touch.
    let s = await go({ steps: START.concat([ST, FLY_SAMPLED, W(900), ST, W(3100), ST, W(1900), CAM, ST,
        TAP('#gps-overlay .gps-fly-btn'), W(1200), ST, TOUCH, W(400), ST]) });
    const [hole, a, late, cam1, done, again, stopped] = s;
    report.fly = [hole, a, late, done, again, stopped].map((x) => ({ fly: x.fly, zoom: x.zoom, bearing: x.bearing, pitch: x.pitch, frames: x.frames, cap: x.cap }));
    f(hole.ready && hole.btn === true && !hole.fly, '0: the hole view with a Preview button: ' + JSON.stringify(hole));
    f(a.fly === 'flying' && a.frames > 2, '1: Preview did not fly: ' + JSON.stringify(a));
    f(new RegExp('^Hole ' + HOLE + ' · Par \\d · \\d+ yds$').test(a.cap || ''), '1: the hole, par and yards over the flight: ' + a.cap);
    f(late.fly === 'flying', '1: over before 4 s (about 5 asked): ' + late.fly);
    f(cam1.src === 'centerline', '1: the drawn dogleg line was not the path: ' + cam1.src);
    flown('1', cam1, BEND, leg1, leg2);
    f(cam1.z0 <= Number(hole.zoom) + 0.25, '1: did not start zoomed out on the whole hole: ' + cam1.z0 + ' vs the hole view ' + hole.zoom);
    f(done.fly === 'done' && done.zoom === hole.zoom && done.bearing === hole.bearing && done.pitch === 0 && done.cap === '' && done.btn === true,
        '1: did not end back on the normal hole view (flat, words gone) by ~5.9 s: ' + JSON.stringify([hole.zoom, hole.bearing], null) + ' -> ' + JSON.stringify(done));
    f(again.fly === 'flying' && stopped.fly === 'cancelled' && stopped.zoom === hole.zoom && stopped.bearing === hole.bearing && stopped.pitch === 0 && stopped.cap === '',
        '2: a touch did not stop the flight and restore the hole view: ' + JSON.stringify([again.fly, stopped]));
    errs(s.filter((x) => x.e), 'fly');

    // 3: the dragged target bends a straight-drawn hole.
    s = await go({ pre: STRAIGHT(false), steps: START.concat([TAP_AT(BEND), W(700), TARGET, FLY_SAMPLED, W(5900), CAM, ST]) });
    const [tgt, cam3, done3] = s;
    report.target = { tapped: BEND, target: tgt.target };
    f(tgt.target && hav(tgt.target, BEND) < 6, '3: the tap did not move the target to the dogleg: ' + JSON.stringify(tgt));
    f(cam3.src === 'target', '3: the dragged target was not the path: ' + cam3.src);
    const mid3 = cam3.path ? cam3.path.split(';')[1].split(',').map(Number) : null;
    f(mid3 && tgt.target && hav(mid3, tgt.target) < 3, '3: the path does not bend at the target: ' + cam3.path);
    if (tgt.target) flown('3', cam3, tgt.target, bear(H.line[0], tgt.target), bear(tgt.target, H.line[H.line.length - 1]));
    f(done3.fly === 'done' && done3.pitch === 0, '3: did not end on the hole view: ' + JSON.stringify(done3));
    errs(s.filter((x) => x.e), 'target');

    // 4: prefers-reduced-motion.
    s = await go({ steps: [{ cdp: { method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } } }].concat(START, [ST,
        { expression: "String(matchMedia('(prefers-reduced-motion: reduce)').matches)" }, TAP('#gps-overlay .gps-fly-btn'), W(600), ST, W(2600), ST]) });
    report.reduced = s.map((x) => ({ fly: x.fly, zoom: x.zoom, frames: x.frames, pitch: x.pitch, cap: x.cap }));
    const [h3, still, back] = s;
    f(still.fly === 'still' && still.frames === 0 && still.zoom === h3.zoom && /^Hole 13 · Par/.test(still.cap || ''), '4: reduced motion: not one still framing of the whole hole with the words: ' + JSON.stringify(still));
    f(back.fly === 'done' && back.zoom === h3.zoom && back.cap === '' && back.frames === 0, '4: reduced motion: did not end on the hole view: ' + JSON.stringify(back));
    errs(s, 'reduced');

    // 5: the switch off.
    s = await go({ features: { flyover: false }, steps: START.concat([ST]) });
    report.off = s.map((x) => [x.ready, x.btn, x.cap]);
    f(s[0].ready && s[0].btn === null && s[0].cap === null, '5: switch off, but Preview is in the page: ' + JSON.stringify(report.off));
    errs(s, 'off');

    // 6: the default target on the path.
    const tgtRun = async (o) => { const r = await go(Object.assign({ steps: START.concat([W(800), TARGET]) }, o)); errs(r, 'target6'); return r[0].target; };
    const offLine = (p, line) => geo.alongLine(p, line).d;
    const straightLine = [H.tee, H.line[H.line.length - 1]], drawn = [H.tee].concat(H.line.slice(1));
    const on = await tgtRun({}), off = await tgtRun({ features: { pathTarget: false } });
    const sOn = await tgtRun({ pre: STRAIGHT(false) }), sOff = await tgtRun({ pre: STRAIGHT(false), features: { pathTarget: false } });
    const fwOn = await tgtRun({ pre: STRAIGHT(true) });
    const fwPath = geo.holePath({ tee: H.tee, mid: H.mid || H.end, line: straightLine, fairway: H.fairway });
    report.defaultTarget = { bend: BEND, on, off, straightOn: sOn, straightOff: sOff, fairwayOn: fwOn, fairwayPath: fwPath && fwPath.src,
        onToBendM: on && Math.round(hav(on, BEND)), offToBendM: off && Math.round(hav(off, BEND)), straightMovedM: sOn && sOff && +hav(sOn, sOff).toFixed(2),
        fairwayOffStraightM: fwOn && Math.round(offLine(fwOn, straightLine)), fairwayOffPathM: fwOn && fwPath && Math.round(offLine(fwOn, fwPath.pts)) };
    f(on && hav(on, BEND) < 10 && offLine(on, drawn) < 10, '6: on the dogleg the default target is not on the corner: ' + JSON.stringify(report.defaultTarget));
    f(off && hav(off, BEND) > 25 && offLine(off, drawn) < 5, '6: switch off: not the old 260-along-the-line target: ' + JSON.stringify(report.defaultTarget));
    f(sOn && sOff && hav(sOn, sOff) < 1 && offLine(sOn, straightLine) < 3, '6: a straight hole with no path: the target moved: ' + JSON.stringify(report.defaultTarget));
    f(fwPath && fwPath.src === 'fairway' && fwOn && offLine(fwOn, fwPath.pts) < 15 && offLine(fwOn, straightLine) > 15, '6: drawn straight with a fairway: not on the fairway path: ' + JSON.stringify(report.defaultTarget));

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
