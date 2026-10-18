#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - HOLE FLYOVER / PREVIEW, FLOWN (008, switch flyover)
//
//   node tools/gps-flyover-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome with WebGL (the MapLibre map), the app, a subscriber
// (tools/lib/iap-stub.js), Caledonia hole 1 (bundled), the golfer on the tee.
//   1  Preview: the camera leaves the hole view, tilts, and moves down the hole toward
//      the green (two samples, the second nearer the green) with "Hole 1 · Par N ·
//      N yds" over it; ~4 s later it is back on the normal hole view, flat, words gone.
//   2  A touch during a flight stops it - back on the hole view at once.
//   3  prefers-reduced-motion: no flight (no camera frames) - the whole hole framed at
//      once with the words, then the normal view.
//   4  The 008 switch off: no Preview button in the page.
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

const CODE = 'FLYOVR';
const R = 6371008.8, rad = (d) => d * Math.PI / 180;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const H1 = table.caledonia.holes['1'].osm;

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
const SEED = "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_autoadvance', '0'); } catch (e) {} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features) + APP + TILE + ERR + GEO(H1.tee) + SEED + iapStub({ active: true }), steps: o.steps });
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

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });

    // 1 + 2: the flight, then a flight stopped by a touch.
    let s = await go({ steps: START.concat([ST, TAP('#gps-overlay .gps-fly-btn'), W(900), ST, W(1500), ST, W(3000), ST,
        TAP('#gps-overlay .gps-fly-btn'), W(1200), ST, TOUCH, W(400), ST]) });
    report.fly = s.map((x) => ({ fly: x.fly, zoom: x.zoom, bearing: x.bearing, pitch: x.pitch, frames: x.frames, at: x.at, cap: x.cap }));
    const [hole, a, b, done, again, stopped] = s;
    f(hole.ready && hole.btn === true && !hole.fly, '0: the hole view with a Preview button: ' + JSON.stringify(hole));
    f(a.fly === 'flying' && a.frames > 2 && a.pitch > 20, '1: Preview did not fly a tilted camera: ' + JSON.stringify(a));
    f(/^Hole 1 · Par \d · \d+ yds$/.test(a.cap || ''), '1: the hole, par and yards over the flight: ' + a.cap);
    const pa = ptOf(a.at), pb = ptOf(b.at);
    f(pa && pb && hav(pb, H1.mid) < hav(pa, H1.mid) - 20 && hav(pa, H1.tee) > 1, '1: the camera did not move from the tee toward the green: ' + JSON.stringify([a.at, b.at]));
    f(done.fly === 'done' && done.zoom === hole.zoom && done.bearing === hole.bearing && done.pitch === 0 && done.cap === '' && done.btn === true,
        '1: did not end back on the normal hole view (flat, words gone): ' + JSON.stringify([hole.zoom, hole.bearing], null) + ' -> ' + JSON.stringify(done));
    f(done.frames > a.frames + 20, '1: too few camera frames for an animation: ' + done.frames);
    f(again.fly === 'flying' && stopped.fly === 'cancelled' && stopped.zoom === hole.zoom && stopped.bearing === hole.bearing && stopped.pitch === 0 && stopped.cap === '',
        '2: a touch did not stop the flight and restore the hole view: ' + JSON.stringify([again.fly, stopped]));
    errs(s, 'fly');

    // 3: prefers-reduced-motion.
    s = await go({ steps: [{ cdp: { method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } } }].concat(START, [ST,
        { expression: "String(matchMedia('(prefers-reduced-motion: reduce)').matches)" }, TAP('#gps-overlay .gps-fly-btn'), W(600), ST, W(2600), ST]) });
    report.reduced = s.map((x) => ({ fly: x.fly, zoom: x.zoom, frames: x.frames, pitch: x.pitch, cap: x.cap }));
    const [h3, still, back] = s;
    f(still.fly === 'still' && still.frames === 0 && still.zoom === h3.zoom && /^Hole 1 · Par/.test(still.cap || ''), '3: reduced motion: not one still framing of the whole hole with the words: ' + JSON.stringify(still));
    f(back.fly === 'done' && back.zoom === h3.zoom && back.cap === '' && back.frames === 0, '3: reduced motion: did not end on the hole view: ' + JSON.stringify(back));
    errs(s, 'reduced');

    // 4: the switch off.
    s = await go({ features: { flyover: false }, steps: START.concat([ST]) });
    report.off = s.map((x) => [x.ready, x.btn, x.cap]);
    f(s[0].ready && s[0].btn === null && s[0].cap === null, '4: switch off, but Preview is in the page: ' + JSON.stringify(report.off));
    errs(s, 'off');

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
