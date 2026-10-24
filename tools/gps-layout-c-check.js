#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - LAYOUT C (mailbox 011, mockup C), PLAYED
//
//   node tools/gps-layout-c-check.js [--shots <dir>]    exit 0 = passed, 1 = broke, 2 = could not run
//     LC_SIZES=se,15,promax   which phones (default all three)
//     LC_ONLY=layout|edges|more   one part only (default all)
//
// Cold Chrome, the app, a subscriber (tools/lib/iap-stub.js), Caledonia's bundled hole 1, a
// stand-in GPS ~160 yds out, the USGS EPQS / NWS stubbed IN THE PAGE (the plays line has its
// terms) and a blank USGS tile (MapLibre's load event waits for tiles). Nothing leaves the page.
// Manny has 3 holes scored (+1, 0, +1) and a bag on the phone.
//
// THREE PHONES x TWO TEXT SIZES: iPhone SE 375x667, iPhone 15 393x852, 15 Pro Max 430x932,
// each at the default text and at the LARGEST TEXT. The app has no Dynamic Type of its own
// (fixed px fonts, -webkit-text-size-adjust:100%), so "largest" is simulated the way a
// system text zoom does it: every font size (and px line height) on the GPS screen and its
// sheets x1.35 - iOS's largest standard size (xxxLarge 23pt over the 17pt default). Map labels
// (inside the map) are left alone: the pills size themselves.
//   L1 THE TOP ROW: Back 44x44, Games, the hole chip, the round chip - all on screen, none
//      overlapping another, no text cut off. The old top panel / right column are gone.
//   L2 THE PANEL: along the bottom, >= 95% opaque, 20px+ corners; its rows in order and inside
//      it (handle, FRONT | MIDDLE | BACK, plays, accuracy, the 4 buttons, the score row), no
//      two overlapping; MIDDLE 44px+; no number or button label cut off; the 4 buttons equal,
//      44px+ tall; the plays line amber, inside the panel; the score row Score | Enter score |
//      Tools (no + Game - the Games pill does it), not cut off.
//   L3 THE MAP: the credit just above the panel; Recenter / zoom above the credit; the tee
//      and the green, the yardage pills and the target inside the clear map; a tap in the top
//      row's gap: the target is pulled into the clear map; at least 120px of clear map.
//   L4 SHEETS: How plays-like works, the wind, Tools, the hole picker, My bag (and its
//      "Saved on this phone"), Tools > My stats (the round sheet), Home's My stats page (its
//      "Saved on this phone"), "Which club?" after Mark shot - each on top: hit-tested at its
//      middle and both bottom corners; inside the screen.
//   E1 NO FRONT / BACK (a green centre only): MIDDLE alone, centred - no blank columns.
//   E2 NO GREEN: "No green mapped ... Set the green" shown whole, clear of the top row, the
//      panel and Recenter / zoom; Set the green > Set by tapping: "Tap the CENTER of the green"
//      the same, with the panel's Cancel showing.
//   E3 LOCATION DENIED: the message whole and clear of the top row / panel; the score button
//      opens the card's box for the hole (with the 012 score sheet on: the sheet, over the map); a score typed there: back on GPS the round chip
//      says Thru 4.
//   E4 THE CREDITS WITH ESRI LIVE (Esri's terms) AND AN OSM LINE (010, ODbL): Esri stood in (a
//      key, its tiles from a stand-in host) on a GolfAPI hole shaped by an OSM line - the line
//      above the panel reads "Powered by Esri · © OpenStreetMap · ⓘ", on screen, clear of
//      Recenter / zoom. (Every other arm has no Esri: "USGS · ⓘ", as the old layout says.)
//   M1 THE HANDLE: collapsed = the numbers + the score row (+ the round chip); the hole re-fits
//      into the taller map; remembered for the round; expands again.
//   M2 gpsLayoutC OFF: the old layout exactly (+ Game in its score row).   M3 gpsRoundScore OFF: no round chip.
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

const argShots = process.argv.indexOf('--shots');
const SHOTS = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ALL_PHONES = [{ name: 'se', w: 375, h: 667 }, { name: '15', w: 393, h: 852 }, { name: 'promax', w: 430, h: 932 }];
const PHONES = ALL_PHONES.filter((p) => !process.env.LC_SIZES || process.env.LC_SIZES.split(',').indexOf(p.name) !== -1);
const TEXTS = [{ name: 'default', k: 1 }, { name: 'largest', k: 1.35 }];
const ONLY = process.env.LC_ONLY || '';
const CODE = 'LAYC';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 12);
const r6 = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const CFG = (features, more) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:'',elevGapMs:0}"
    + (features ? ',{features:Object.assign({},v.features,' + JSON.stringify(features) + ')}' : '') + (more ? ',' + JSON.stringify(more) : '') + ");}});})();";
// The stand-in GPS: a fix every second (window.__moveTo walks the golfer), or "denied".
const GEO = (p, denied) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok, err) { var id = n++;"
    + (denied ? " setTimeout(function () { err({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' }); }, 50); return id; },"
        : " var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },")
    + " getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// ... and ESRI LIVE, stood in (as gps-check's CFG({ esri: 'OK' })): a key, and its tiles from a
// stand-in host answered with the same blank tile - so the map shows Esri, and Esri's credit.
const ESRI = { esriKey: 'CHECK', esriTileUrl: 'https://esri.check.invalid/esri/OK/tile/{z}/{y}/{x}?token={key}' };
const TILE = "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { if (/basemap\\.nationalmap\\.gov|esri\\.check\\.invalid/.test(String(u && u.url || u))) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
// EPQS: the ground rises toward the green; NWS: 6 mph across, 80 F.
const FETCH = "(function(){ var real = window.fetch; var T1 = " + JSON.stringify(T1) + ", B1 = " + B1 + ";"
    + " function rad(d) { return d * Math.PI / 180; }"
    + " function hav(a, b) { var s = Math.pow(Math.sin(rad(b[0] - a[0]) / 2), 2) + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.pow(Math.sin(rad(b[1] - a[1]) / 2), 2); return 2 * 6371008.8 * Math.asin(Math.sqrt(s)); }"
    + " function brg(a, b) { var y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }"
    + " function json(o) { return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }); }"
    + " window.fetch = function (u) { var url = String(u && u.url || u);"
    + "  if (/epqs/.test(url)) { var q = new URL(url).searchParams, p = [+q.get('y'), +q.get('x')]; return Promise.resolve(json({ value: Math.round(20 + 0.02 * hav(T1, p) * Math.cos(rad(brg(T1, p) - B1))) })); }"
    + "  if (/api\\.weather\\.gov/.test(url)) {"
    + "   if (/\\/points\\//.test(url)) return Promise.resolve(json({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/XX/1,2/forecast/hourly', observationStations: 'https://api.weather.gov/gridpoints/XX/1,2/stations' } }));"
    + "   if (/\\/stations$/.test(url)) return Promise.resolve(json({ features: [{ id: 'https://api.weather.gov/stations/KXXX' }] }));"
    + "   if (/observations\\/latest/.test(url)) return Promise.resolve(json({ properties: { timestamp: new Date().toISOString(), windSpeed: { unitCode: 'wmoUnit:mi_h-1', value: 6 }, windDirection: { value: " + Math.round((B1 + 90) % 360) + " }, temperature: { unitCode: 'wmoUnit:degF', value: 80 } } }));"
    + "   return Promise.resolve(new Response('{}', { status: 404 })); }"
    + "  return real.apply(this, arguments); }; })();";
const BAG = { '4i': 195, '5i': 185, '6i': 174, '7i': 163, '8i': 152, '9i': 141, PW: 130 };
const SEED = (hole) => "(function(){ try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s','1'); localStorage.setItem('hardpan_round_side','gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "','" + (hole || 1) + "');"
    + " localStorage.setItem('hardpan_gps_whoasked_" + CODE + "','1'); localStorage.setItem('hardpan_gps_golfer_" + CODE + "','101'); localStorage.setItem('hardpan_gps_autoadvance','0');"
    // 012: layout D is the default now - this check plays C (Tools > Screen layout: Bottom panel).
    + " localStorage.setItem('hardpan_gps_layout','c');"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify({ v: 1, golfers: { 'n:manny orozco': { shots: {}, set: BAG, setupAt: 1 } } })) + "); } catch(e){} })();";
// HOLE 1 CUT DOWN, as the bundle is set: 'center' = a green centre and no outline (no F / B);
// 'none' = no green at all (the tee only).
const HOLE1 = (kind) => "(function(){ var v; Object.defineProperty(window, 'HardPanGpsCourses', { configurable: true, get: function () { return v; }, set: function (x) {"
    + " try { var o = x.caledonia.holes['1'].osm; delete o.green; delete o.front; delete o.back;" + (kind === 'none' ? ' delete o.mid; delete o.line;' : '') + " } catch (e) {} v = x; } }); })();";
// A GOLFAPI COURSE (as gps-osm-path-check): Caledonia's holes, GolfAPI's points beside OSM's.
const GA = (() => {
    const O = (n) => table.caledonia.holes[String(n)].osm, holes = {};
    for (let n = 1; n <= 18; n++) {
        const o = O(n), end = o.line[o.line.length - 1], b = brg(o.line[0], end), c = r6(dest(end, b, 20));
        holes[n] = { g: { f: r6(dest(c, b, -12)), c, b: r6(dest(c, b, 12)) }, t: { b: r6(dest(o.line[0], b + 90, 15)) } };
    }
    return { built: true, courses: { CHK1: { id: 'CHK1', club: 'Caledonia Golf & Fish Club', course: 'Caledonia', lat: O(1).tee[0], lng: O(1).tee[1], holes: 18, h: holes } }, links: { caledonia: 'CHK1' } };
})();
const DELTAS = [1, 0, 1];   // Manny's holes 1-3 against par
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    const cd = r.courseData.slice().sort((a, b) => a.hole - b.hole);
    r.scores = {};
    DELTAS.forEach((dl, i) => { r.scores['p101_h' + cd[i].hole] = cd[i].par + dl; });
    return r;
}
// Expected, inline (the scorecard's rule: one stroke per full 18, the rest on the lowest hole indexes).
function expectChip(r, deltas) {
    const cd = r.courseData.slice().sort((a, b) => a.hole - b.hole).slice(0, deltas.length);
    const p = r.players.filter((x) => String(x.id) === '101')[0], hcp = parseFloat(p.hcp);
    const st = (si) => Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
    const gross = cd.reduce((s, h, i) => s + h.par + deltas[i], 0), par = cd.reduce((s, h) => s + h.par, 0);
    const net = cd.reduce((s, h, i) => s + h.par + deltas[i] - st(h.hcpIndex), 0);
    const tp = (n) => n === 0 ? 'E' : (n > 0 ? '+' + n : '−' + Math.abs(n));
    return 'Thru ' + cd.length + ' · ' + gross + ' (' + tp(gross - par) + ') · Net ' + net + ' (' + tp(net - par) + ')';
}
// THE MAP, CAUGHT (as gps-flyover-check): the check reads MapLibre's own camera.
const CATCH = "(function(){ var v; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return v; }, set: function (x) {"
    + " if (!x || !x.Map) { v = x; return; } var M = x.Map, W = function (o) { var m = new M(o); window.__map = m; return m; }; W.prototype = M.prototype;"
    + " v = new Proxy(x, { get: function (t, k) { return k === 'Map' ? W : t[k]; } }); } }); })();";
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*overpass*', '*cloudfunctions.net*', '*openstreetmap*'];
const go = async (o) => {
    const res = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: o.phone.w, height: o.phone.h }, webgl: true, blockUrls: BLOCK,
        preScript: CFG(o.features, o.cfg) + CATCH + (o.pre || '') + 'window.__hardpanDoors = true;' + ERR + GEO(o.at || ME, o.denied) + TILE + FETCH + SEED(o.hole) + iapStub({ active: true }), steps: o.steps });
    if (!res.ok) throw new Error(res.reason);
    if (process.env.LC_DEBUG) console.error(JSON.stringify(res.value.filter((v) => typeof v !== 'string' || v.charAt(0) !== '{')));
    return res.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const W = (ms) => ({ sleep: ms });
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const WAIT_MAP = { waitFor: "(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && Number(m.dataset.zoom) > 3); })()", timeout: 45000 };
const READY = { waitFor: "(function(){ var e = document.querySelector('#gps-overlay .gps-pl-text'); var m = document.querySelector('#gps-overlay .gps-m'); return !!(e && /Plays/.test(e.textContent) && m && /\\d/.test(m.textContent)); })()", timeout: 25000 };
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none " + sel + "'; b.click(); return 'ok'; })()" });
// THE LARGEST TEXT: every font size (and px line height) on the GPS screen and its sheets x k,
// once per element (new elements - a sheet's rows - on the next call). The map's labels aside.
const SCALE = (k) => ({ expression: "(function(){ var k = " + k + "; if (k === 1) return 'k1'; var todo = [];"
    // Read every size first, then write: a child read after its parent grew would grow twice.
    + " [document.getElementById('gps-overlay'), document.getElementById('hp-my-stats')].forEach(function (root) { if (!root) return;"
    + "  [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (e) { if (e.closest('.gps-map-wrap') || e.hasAttribute('data-fs0') || e.tagName === 'STYLE' || e.closest('svg')) return;"
    + "   var cs = getComputedStyle(e), p = e.parentElement; todo.push([e, parseFloat(cs.fontSize), cs.lineHeight, !!(p && p.hasAttribute('data-fs0') && parseFloat(getComputedStyle(p).fontSize) === parseFloat(cs.fontSize))]); }); });"
    // An element added since (a sheet's rows) that only inherits from a grown parent has grown already.
    + " todo.forEach(function (t) { var e = t[0]; e.setAttribute('data-fs0', t[1]); if (t[3]) return;"
    + "  e.style.setProperty('font-size', (t[1] * k).toFixed(2) + 'px', 'important'); if (/px$/.test(t[2])) e.style.setProperty('line-height', (parseFloat(t[2]) * k).toFixed(2) + 'px', 'important'); });"
    + " window.dispatchEvent(new Event('resize')); return 'scaled ' + todo.length; })()" });
const shot = (name) => (SHOTS ? [{ shot: path.join(SHOTS, name + '.png'), viewportOnly: true }] : []);

// Everything the checks look at, measured in the page. clip = the text is cut off (wider or
// taller than its box).
const MEASURE = { expression: "(function(){ var ov = document.getElementById('gps-overlay');"
    + " var vis = function (e) { if (!e) return false; for (var x = e; x && x !== document.body; x = x.parentElement) { var c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; } var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };"
    + " var R = function (sel) { var e = document.querySelector(sel); if (!vis(e)) return null; var b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height),"
    + "  clip: e.scrollWidth > e.clientWidth + 1 || (getComputedStyle(e).overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2) ? [e.scrollWidth, e.clientWidth, e.scrollHeight, e.clientHeight] : null }; };"
    + " var T = function (sel) { var e = document.querySelector(sel); return e ? e.textContent : null; };"
    + " var O = '#gps-overlay '; var pn = ov.querySelector('.gps-panel'), cs = pn ? getComputedStyle(pn) : null; var mapEl = ov.querySelector('.gps-map');"
    + " var pt = function (a) { var v = (mapEl && mapEl.getAttribute(a) || '').split(',').map(Number); return v.length === 2 ? { l: v[0], t: v[1], r: v[0] + 1, b: v[1] + 1 } : (v.length === 4 ? { l: v[0], t: v[1], r: v[2], b: v[3] } : null); };"
    + " var out = { lc: ov.classList.contains('gps-lc'), side: window.HardPanGps && HardPanGps.side(),"
    + "  back: R(O + '.gps-back'), games: R(O + '.gps-door-games'), hole: R(O + '.gps-lc-hole'), l1: R(O + '.gps-lc-l1'), meta: R(O + '.gps-lc-meta'), wind: R(O + '.gps-wind'), chip: R(O + '.gps-lc-score'), oldTop: R(O + '.gps-top'), oldRight: R(O + '.gps-right'),"
    + "  panel: R(O + '.gps-panel'), handle: R(O + '.gps-panel-handle'), nums: R(O + '.gps-lc-nums'), f: R(O + '.gps-num-f'), m: R(O + '.gps-num-mid'), b: R(O + '.gps-num-b'), fBig: R(O + '.gps-f'), mBig: R(O + '.gps-m'), bBig: R(O + '.gps-b'),"
    + "  playsRow: R(O + '.gps-lc-plays'), plays: R(O + '.gps-pl-line'), acc: R(O + '.gps-lc-acc'), acts: R(O + '.gps-lc-acts'),"
    + "  green: R(O + '.gps-green-view'), hz: R(O + '.gps-hz-btn'), mark: R(O + '.gps-mark-shot'), fly: R(O + '.gps-fly-btn'), bottom: R(O + '.gps-bottom'), scorebox: R(O + '.gps-scorebox'), addBtn: R(O + '.gps-door-add'), tools: R(O + '.gps-tools'), cardBtn: R(O + '.gps-side-bets'), scoreCol: R(O + '.gps-score-col'), actions: R(O + '.gps-actions'), cancel: R(O + '.gps-cancel'),"
    + "  credit: R(O + '.gps-credit'), creditOsm: R(O + '.gps-credit-osm'), recenter: R(O + '.gps-recenter'), zoom: R(O + '.gps-zoom'), banner: R(O + '.gps-banner'), bagask: R(O + '.gps-bagask'), msg: R(O + '.gps-msg'),"
    + "  under: (function(){ var u = ov.querySelector('.gps-under'); if (!u) return null; var b = u.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), scrolls: u.scrollHeight > u.clientHeight + 1, canScroll: /auto|scroll/.test(getComputedStyle(u).overflowY) }; })(),"
    + ""
    + "  pillTo: R(O + '.gps-pill-to'), pillOn: R(O + '.gps-pill-on'), target: R(O + '.gps-target .gps-ring-dot'), tee: pt('data-tee-px'), greenBox: pt('data-green-box'),"
    + "  l1Text: T(O + '.gps-lc-l1'), l2Text: (ov.querySelector('.gps-lc-l2') || {}).innerText, chipText: T(O + '.gps-lc-score'), mText: T(O + '.gps-m'), mLbl: T(O + '.gps-num-mid .gps-lbl'), playsText: T(O + '.gps-pl-text'), accText: T(O + '.gps-lc-acc'),"
    + "  bannerText: T(O + '.gps-banner'), msgText: T(O + '.gps-msg'), creditText: (ov.querySelector('.gps-credit') || {}).innerText,"
    + "  bg: cs && cs.backgroundColor, radius: cs && cs.borderTopLeftRadius, mFont: (function(){ var e = ov.querySelector('.gps-num-mid .gps-big'); return e ? getComputedStyle(e).fontSize : null; })(),"
    + "  playsColor: (function(){ var e = ov.querySelector('.gps-pl-line'); return e ? getComputedStyle(e).color : null; })(),"
    + "  esri: mapEl && mapEl.getAttribute('data-esri'),"
    + "  mapInfo: mapEl && ['data-center', 'data-zoom', 'data-bearing'].map(function (x) { return mapEl.getAttribute(x); }).join(' ') + (window.__map ? ' pad ' + JSON.stringify(__map.getPadding()) + ' canvas ' + __map.getCanvas().clientWidth + 'x' + __map.getCanvas().clientHeight : ''),"
    + "  collapsed: !!(pn && pn.classList.contains('gps-panel-collapsed')), vh: innerHeight, vw: innerWidth, e: window.__e };"
    + " out.actLbl = ['.gps-green-view', '.gps-hz-btn', '.gps-mark-shot', '.gps-fly-btn'].map(function (s) { var r = R(O + s); return r && { s: s, clip: r.clip, text: document.querySelector(O + s).innerText }; }).filter(Boolean);"
    + " return JSON.stringify(out); })()" };
// A SHEET: its box, and what a finger touches at its middle and near its bottom corners (and,
// with a line inside it, that line - scrolled into view first - and what touches it).
const SHEET = (name, sel, lineSel) => ({ expression: "(function(){ var e = document.querySelector(" + JSON.stringify(sel) + "); var out = { name: " + JSON.stringify(name) + ", vh: innerHeight, vw: innerWidth };"
    + " var vis = function (x) { if (!x) return false; for (var y = x; y && y !== document.body; y = y.parentElement) { var c = getComputedStyle(y); if (c.display === 'none' || c.visibility === 'hidden') return false; } var b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; };"
    + " if (!vis(e)) { out.shown = false; return JSON.stringify(out); } out.shown = true; var b = e.getBoundingClientRect(); out.rect = { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };"
    + " var on = function (x, y) { var h = document.elementFromPoint(x, y); return !!(h && (h === e || e.contains(h))); };"
    + " var bot = Math.min(b.bottom, innerHeight) - 8; out.hits = [on((b.left + b.right) / 2, (Math.max(b.top, 0) + bot) / 2), on(b.left + 10, bot), on(Math.min(b.right, innerWidth) - 10, bot)];"
    + (lineSel ? " var l = e.querySelector(" + JSON.stringify(lineSel) + "); if (l) { try { l.scrollIntoView({ block: 'nearest' }); } catch (x) {} var lb = l.getBoundingClientRect(); out.line = { text: l.textContent, shown: vis(l), t: Math.round(lb.top), b: Math.round(lb.bottom), hit: (function () { var h = document.elementFromPoint((lb.left + lb.right) / 2, (lb.top + lb.bottom) / 2); return !!(h && (h === l || l.contains(h))); })() }; } else out.line = null;" : '')
    + " return JSON.stringify(out); })()" });

const hits = (a, b) => !!(a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5);
const inside = (a, top, bot) => !!(a && a.t >= top - 1 && a.b <= bot + 1);
const onScreen = (a, vw, vh) => !!(a && a.l >= 0 && a.t >= 0 && a.r <= vw && a.b <= vh);
const clearTopOf = (a) => Math.max(...[a.back, a.games, a.hole, a.chip].filter(Boolean).map((x) => x.b));

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });
    const r0 = round(), want = expectChip(r0, DELTAS);
    const START = (k) => [W(2500), OPEN, W(2500), WAIT_MAP, READY, W(1200), SCALE(k), W(1800), SCALE(k), W(600)];

    // ---- L1-L4 on every phone, both text sizes --------------------------------------
    if (!ONLY || ONLY === 'layout') for (const phone of PHONES) for (const text of TEXTS) {
        const tag = phone.name + '-' + text.name, k = text.k;
        const TX = Math.round(phone.w * 0.44), TY = 30;   // in the top row's gap (between Games and the hole chip)
        const steps = START(k).concat([MEASURE], shot(tag), [
            // A tap in the top row's gap: the target comes back into the clear map.
            { expression: "(function(){ var c = document.querySelector('#gps-overlay .maplibregl-canvas'); if (!c) return 'no canvas';"
                + " ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: " + TX + ", clientY: " + TY + ", button: 0 })); }); return 'tapped'; })()" }, W(800), MEASURE].concat([
            TAP('#gps-overlay .gps-pl-info'), W(400), SCALE(k), W(300), SHEET('plays info', '#gps-overlay .gps-plinfo'), TAP('#gps-overlay .gps-plinfo-done'), W(300),
            TAP('#gps-overlay .gps-wind'), W(500), SCALE(k), W(300), SHEET('wind', '#gps-overlay .gps-wind-sheet'), TAP('#gps-overlay .gps-ws-done'), W(300),
            TAP('#gps-overlay .gps-tools'), W(300), SCALE(k), W(300), SHEET('tools', '#gps-overlay .gps-tsheet:not([style*="none"]), #gps-overlay .gps-tools-menu:not([style*="none"])'),
            TAP('#gps-overlay .gps-my-bag'), W(900), SCALE(k), W(300), SHEET('my bag', '#gps-overlay .gps-bag', '.gps-bag-saved'), TAP('#gps-overlay .gps-bag-done'), W(300),
            TAP('#gps-overlay .gps-tools'), W(300), TAP('#gps-overlay .gps-my-stats'), W(1500), SCALE(k), W(300), SHEET('round stats', '#gps-overlay .gps-stats-sheet'), { expression: 'window.HardPanGpsStats && HardPanGpsStats.close()' }, W(300),
            // My stats (Home's page, 010's "Saved on this phone" line) - the same opener Home uses.
            { expression: "window.HardPanGpsStats ? (HardPanGpsStats.openMy(), 'opened') : 'no stats'" }, W(600), SCALE(k), W(300), SHEET('my stats', '#hp-my-stats', '.ms-saved'), TAP('#hp-my-stats .ms-back'), W(500),
            TAP('#gps-overlay .gps-lc-l1'), W(400), SCALE(k), W(300), SHEET('hole picker', '#gps-overlay .gps-picker-card'), TAP('#gps-overlay .gps-picker'), W(400),
            // "Which club?": Mark shot, walk 110 m on, Mark shot.
            TAP('#gps-overlay .gps-mark-shot'), W(1200), { expression: 'window.__moveTo(' + dest(ME, B1, 110) + ')' }, W(1600), TAP('#gps-overlay .gps-mark-shot'), W(1500), SCALE(k), W(400),
            SHEET('which club', '#gps-overlay .gps-bagask'), MEASURE])).concat(shot(tag + '-whichclub'));
        const s = await go({ phone, steps });
        const [a, t, ...rest] = s, wc = rest.pop(), sheets = rest;
        // With "Which club?" up: the panel (score row) and the credit are not under it, nor a banner.
        [wc.credit, wc.banner, wc.panel].filter(Boolean).forEach((x) => f(!hits(x, wc.bagask), tag + ' L4: "Which club?" covers ' + JSON.stringify(x)));
        const vw = a.vw, vh = a.vh;
        report[tag] = { map: [a.mapInfo, t && t.mapInfo], l1: a.l1Text, l2: a.l2Text, chip: a.chipText, plays: a.playsText, acc: a.accText, acts: a.actLbl.map((x) => x.text), panel: a.panel, clearMap: a.panel && (a.panel.t - clearTopOf(a)), sheets: sheets.map((x) => x.name + (x.shown ? '' : ' (not shown)')) };
        const F = (c, m) => f(c, tag + ' ' + m);
        // L1
        F(a.lc && !a.oldTop && !a.oldRight, 'L1: layout C is not on, or the old panel / right column shows');
        F(a.back && a.back.w >= 44 && a.back.h >= 44, 'L1: Back is not 44x44: ' + JSON.stringify(a.back));
        const top = { back: a.back, games: a.games, hole: a.hole, chip: a.chip };
        Object.keys(top).forEach((x) => F(onScreen(top[x], vw, vh), 'L1: ' + x + ' is off the screen: ' + JSON.stringify(top[x])));
        [['back', 'games'], ['games', 'hole'], ['games', 'chip'], ['back', 'hole'], ['back', 'chip'], ['hole', 'chip']].forEach(([x, y]) => F(!hits(top[x], top[y]), 'L1: ' + x + ' overlaps ' + y + ': ' + JSON.stringify([top[x], top[y]])));
        F(a.chip && a.hole && a.chip.t >= a.hole.b, 'L1: the round chip is not under the hole chip');
        F(/^Hole 1 · Par \d/.test(a.l1Text || '') && /\d+y · HCP \d+/.test(a.l2Text || '') && /mph|Calm/.test(a.l2Text || ''), 'L1: the hole chip: ' + JSON.stringify([a.l1Text, a.l2Text]));
        F(a.chipText === want, 'L1: the round chip says ' + JSON.stringify(a.chipText) + ', expected ' + JSON.stringify(want));
        ['l1', 'meta', 'wind', 'chip', 'games'].forEach((x) => F(a[x] && !a[x].clip, 'L1: ' + x + ' text is cut off: ' + JSON.stringify(a[x])));
        // L2
        F(a.panel && a.panel.b === vh && a.panel.l <= 0 && a.panel.r >= vw, 'L2: the panel is not along the bottom: ' + JSON.stringify(a.panel));
        const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(a.bg || ''); F(!alpha || +alpha[1] >= 0.95, 'L2: the panel is not >= 95% opaque: ' + a.bg);
        F(parseFloat(a.radius) >= 20, 'L2: the panel corners: ' + a.radius);
        const rows = [['handle', a.handle], ['nums', a.nums], ['plays', a.playsRow], ['acts', a.acts], ['score row', a.bottom]];
        rows.forEach(([n, r]) => F(r && r.t >= a.panel.t - 1 && r.b <= a.panel.b + 1, 'L2: ' + n + ' is not inside the panel: ' + JSON.stringify(r)));
        for (let i = 1; i < rows.length; i++) F(rows[i][1] && rows[i - 1][1] && rows[i][1].t >= rows[i - 1][1].b - 1, 'L2: ' + rows[i][0] + ' overlaps ' + rows[i - 1][0]);
        F(a.f && a.m && a.b && a.f.r <= a.m.l + 1 && a.m.r <= a.b.l + 1, 'L2: FRONT | MIDDLE | BACK not in a row');
        // No + Game in layout C (the Games pill does it): Score | Enter score | Tools, the box taking the width.
        F(!a.addBtn && a.cardBtn && a.scorebox && a.tools && a.scorebox.l - a.cardBtn.r <= 10 && a.tools.l - a.scorebox.r <= 10, 'L2: the score row is not Score | Enter score | Tools: ' + JSON.stringify([a.cardBtn, a.scorebox, a.addBtn, a.tools]));
        ['scorebox', 'scoreCol'].forEach((x) => F(a[x] && !a[x].clip, 'L2: the score row is cut off (' + x + '): ' + JSON.stringify(a[x])));
        ['fBig', 'mBig', 'bBig'].forEach((x) => F(a[x] && !a[x].clip, 'L2: ' + x + ' cut off: ' + JSON.stringify(a[x])));
        F(a.mLbl === 'MIDDLE' && parseFloat(a.mFont) >= 44, 'L2: MIDDLE: ' + a.mLbl + ' ' + a.mFont);
        F(a.plays && a.plays.l >= 0 && a.plays.r <= vw && !a.plays.clip && /^Plays (like )?\d+/.test(a.playsText || ''), 'L2: the plays line (009 "Plays 168: ...", or 012e playsSimple "Plays like 168y"): ' + JSON.stringify([a.playsText, a.plays]));
        F(/251, 191, 36/.test(a.playsColor || ''), 'L2: the plays line is not amber: ' + a.playsColor);
        F(/^±\d+ yds$/.test(a.accText || '') && a.acc && a.plays && a.acc.t >= a.plays.b - 1, 'L2: the accuracy line: ' + a.accText);
        const acts = [a.green, a.mark, a.fly].filter(Boolean);
        F(!a.hz && acts.length === 3 && acts.every((x) => x.h >= 44 && Math.abs(x.w - acts[0].w) <= 1 && Math.abs(x.t - acts[0].t) <= 1), 'L2: Green | Mark shot | Preview (no Hazards): ' + JSON.stringify(acts));
        a.actLbl.forEach((x) => F(!x.clip, 'L2: "' + x.text + '" is cut off: ' + JSON.stringify(x.clip)));
        // L3
        F(a.credit && a.credit.b <= a.panel.t && a.credit.b >= a.panel.t - 12, 'L3: the credit is not just above the panel: ' + JSON.stringify([a.credit, a.panel && a.panel.t]));
        F(a.recenter && a.credit && a.recenter.b <= a.credit.t + 1 && a.zoom && a.zoom.b <= a.credit.t + 1 && a.zoom.r >= vw - 12 && !hits(a.zoom, a.credit), 'L3: Recenter / zoom not above the credit: ' + JSON.stringify([a.recenter, a.zoom, a.credit]));
        const ct = clearTopOf(a), cb = a.panel.t;
        F(cb - ct >= 120, 'L3: only ' + (cb - ct) + 'px of map is clear');
        F(inside(a.tee, ct, cb) && inside(a.greenBox, ct, cb), 'L3: the tee / green is not in the clear map: ' + JSON.stringify([a.tee, a.greenBox, ct, cb]));
        [a.pillTo, a.pillOn, a.target].filter(Boolean).forEach((p) => F(inside(p, ct, cb), 'L3: a yardage pill / the target sits under the top row / panel: ' + JSON.stringify(p)));
        F(t && t.target && t.target.t >= ct && t.target.b <= cb, 'L3: the tapped target is not in the clear map: ' + JSON.stringify(t && t.target) + ' clear ' + ct + '-' + cb);
        // L4
        ['plays info', 'wind', 'tools', 'my bag', 'round stats', 'my stats', 'hole picker', 'which club'].forEach((n) => {
            const sh = sheets.filter((x) => x.name === n)[0];
            F(sh && sh.shown, 'L4: the ' + n + ' sheet did not open');
            if (!sh || !sh.shown) return;
            F(sh.hits.every(Boolean), 'L4: the ' + n + ' sheet is not on top (hit test middle / bottom-left / bottom-right: ' + JSON.stringify(sh.hits) + ')');
            F(sh.rect.t >= 0 && sh.rect.l >= 0 && sh.rect.r <= sh.vw, 'L4: the ' + n + ' sheet runs off the screen: ' + JSON.stringify(sh.rect));
            if (sh.line !== undefined) F(sh.line && sh.line.shown && sh.line.hit && /^Saved on this phone/.test(sh.line.text) && sh.line.t >= 0 && sh.line.b <= sh.vh, 'L4: "Saved on this phone" in ' + n + ': ' + JSON.stringify(sh.line));
        });
        errs(s, tag);
    }

    // ---- E1-E4: the edge cases, on the smallest phone at the largest text and on the 15 ---
    const EDGE = [['se', 1.35], ['15', 1]].map(([n, k]) => [ALL_PHONES.filter((p) => p.name === n)[0], k]);
    if (!ONLY || ONLY === 'edges') for (const [phone, k] of EDGE) {
        const tag = phone.name + '-' + (k === 1 ? 'default' : 'largest');
        // E1: a green centre, no outline.
        let s = await go({ phone, pre: HOLE1('center'), steps: [W(2500), OPEN, W(2500), WAIT_MAP, { waitFor: "/\\d/.test((document.querySelector('#gps-overlay .gps-m') || {}).textContent || '')", timeout: 20000 }, W(1200), SCALE(k), W(1500), MEASURE].concat(shot(tag + '-nofrontback')) });
        let a = s[0];
        report[tag + ' E1'] = { f: a.f, m: a.m, b: a.b, mid: a.mText };
        f(!a.f && !a.b && a.m && /^\d+$/.test(a.mText) && Math.abs((a.m.l + a.m.r) / 2 - a.vw / 2) <= 12, tag + ' E1: no front / back - MIDDLE alone, centred: ' + JSON.stringify([a.f, a.m, a.b, a.mText]));
        errs(s, tag + ' E1');
        // E2: no green: the offer, then the tap-to-set banner.
        s = await go({ phone, pre: HOLE1('none'), steps: [W(2500), OPEN, W(2500), WAIT_MAP, { waitFor: "/No green mapped/.test((document.querySelector('#gps-overlay .gps-banner') || {}).textContent || '')", timeout: 25000 }, W(1000), SCALE(k), W(1500), MEASURE].concat(shot(tag + '-nogreen'),
            [TAP('#gps-overlay .gps-tools'), W(300), TAP('#gps-overlay .gps-set-green'), W(600), TAP('#gps-overlay .gps-tap-fallback'), W(900), SCALE(k), W(600), MEASURE], shot(tag + '-nogreen-tap')) });
        const [n0, n1] = s;
        report[tag + ' E2'] = { banner: [n0.bannerText, n1 && n1.bannerText], rect: [n0.banner, n1 && n1.banner] };
        [[n0, /^No green mapped for this hole yet - Tools › Set the green$/, 'the offer'], [n1, /^Tap the CENTER of the green$/, 'the tap banner']].forEach(([x, rx, what]) => {
            if (!x) { f(false, tag + ' E2: ' + what + ': nothing measured'); return; }
            f(rx.test(x.bannerText || '') && x.banner && !x.banner.clip && onScreen(x.banner, x.vw, x.vh), tag + ' E2: ' + what + ' is not shown whole: ' + JSON.stringify([x.bannerText, x.banner]));
            f(x.banner && x.panel && x.banner.b <= x.panel.t && x.banner.t >= clearTopOf(x), tag + ' E2: ' + what + ' sits under the top row / panel: ' + JSON.stringify([x.banner, x.panel]));
            [x.recenter, x.zoom, x.credit].filter(Boolean).forEach((o) => f(!hits(x.banner, o), tag + ' E2: ' + what + ' overlaps ' + JSON.stringify(o)));
        });
        f(n1 && n1.cancel && n1.panel && n1.cancel.t >= n1.panel.t, tag + ' E2: the panel does not show Cancel while setting');
        errs(s, tag + ' E2');
        // E3: location denied; then the score button (on hole 4), and a score typed on the card.
        s = await go({ phone, denied: true, steps: [W(2500), OPEN, W(3000), { waitFor: "/Location is off/.test((document.querySelector('#gps-overlay .gps-msg') || {}).textContent || '')", timeout: 20000 }, W(800), SCALE(k), W(1200), MEASURE].concat(shot(tag + '-denied'),
            [TAP('#gps-overlay .gps-score-next'), W(900), TAP('#gps-overlay .gps-score-next'), W(900), TAP('#gps-overlay .gps-score-next'), W(900), TAP('#gps-overlay .gps-score'), W(1200),
                // 012: with the score sheet on (HardPanFeature('scoreSheet')), the score button opens the sheet over
                // the map instead of the card's box - the score is then saved from the sheet (the same saveScore).
                { expression: "JSON.stringify({ side: HardPanGps.side(), focus: (function(){ var a = document.activeElement; return a && a.classList.contains('score-input') ? { hole: a.getAttribute('data-hole'), player: a.getAttribute('data-player-id') } : null; })(),"
                    + " sheet: (function(){ var w = document.getElementById('hp-score-sheet'); if (!w || w.style.display === 'none') return null; var on = w.querySelector('.hp-ss-chip.on'); return { title: (w.querySelector('.hp-ss-title') || {}).textContent, player: on ? on.getAttribute('data-ss-golfer') : null }; })(),"
                    + " sheetOn: typeof HardPanFeature === 'function' && HardPanFeature('scoreSheet') !== false && !!(window.HardPanGpsStats && HardPanGpsStats.sheet) })" },
                { expression: "(function(){ var w = document.getElementById('hp-score-sheet'); if (w && w.style.display !== 'none') { var b = w.querySelector('[data-ss-score=\\'5\\']'); if (!b) return 'no 5'; b.click(); w.querySelector('[data-ss-save]').click(); return 'saved from the sheet'; }"
                    + " var a = document.activeElement; if (!a || !a.classList.contains('score-input')) return 'no box'; a.value = '5'; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); a.blur(); return 'typed'; })()" }, W(1200),
                OPEN, W(1500), MEASURE]) });
        const [d0, d1, d2] = s;
        report[tag + ' E3'] = { msg: d0.msg, card: d1, chip: d2 && d2.chipText };
        f(/Location is off for HardPan/.test(d0.msgText || '') && d0.msg && !d0.msg.clip && onScreen(d0.msg, d0.vw, d0.vh), tag + ' E3: the denied message is not shown whole: ' + JSON.stringify(d0.msg));
        // The message, in the clear map: whole, or (big text, small phone) in a box that scrolls there.
        const u = d0.under, mBox = u && d0.msg ? { l: d0.msg.l, r: d0.msg.r, t: Math.max(d0.msg.t, u.t), b: Math.min(d0.msg.b, u.b) } : null;
        f(u && mBox && d0.panel && u.b <= d0.panel.t && mBox.t >= clearTopOf(d0) && (!u.scrolls || u.canScroll) && !hits(mBox, d0.recenter) && !hits(mBox, d0.zoom), tag + ' E3: the message sits under the top row / panel / buttons: ' + JSON.stringify([d0.msg, u, d0.panel && d0.panel.t]));
        report[tag + ' E3'].scrolls = !!(u && u.scrolls);
        if (d1 && d1.sheetOn) f(d1.side === 'gps' && d1.sheet && /^Hole 4 /.test(d1.sheet.title || '') && d1.sheet.player === '101', tag + ' E3: the score button did not open the score sheet for hole 4 over the map: ' + JSON.stringify(d1));
        else f(d1 && d1.side === 'bets' && d1.focus && d1.focus.hole === '4' && d1.focus.player === '101', tag + ' E3: the score button did not open the card\'s box for hole 4: ' + JSON.stringify(d1));
        const want4 = expectChip(r0, DELTAS.concat([5 - r0.courseData.slice().sort((x, y) => x.hole - y.hole)[3].par]));
        f(d2 && d2.chipText === want4, tag + ' E3: after a score on hole 4 the chip says ' + JSON.stringify(d2 && d2.chipText) + ', expected ' + JSON.stringify(want4));
        errs(s, tag + ' E3');
        // E4: the OSM credit (010): a GolfAPI hole shaped by an OSM line.
        s = await go({ phone, hole: 13, at: GA.courses.CHK1.h[13].t.b, cfg: Object.assign({ osm: false, live: true, golfapi: true, golfapiFile: 'gps-golfapi-check.js' }, ESRI), pre: 'window.HardPanGolfApi = ' + JSON.stringify(GA) + ';',
            steps: [W(2500), OPEN, W(2500), WAIT_MAP, { waitFor: "(function(){ var e = document.querySelector('#gps-overlay .gps-credit-osm'); return !!(e && e.style.display !== 'none'); })()", timeout: 25000 }, W(1000), SCALE(k), W(1500), MEASURE].concat(shot(tag + '-osmcredit')) });
        a = s[0];
        report[tag + ' E4'] = { credit: a.creditText, esri: a.esri, rect: a.creditOsm };
        f(a.esri === 'visible' && /^Powered by Esri/.test(a.creditText || '') && a.credit && onScreen(a.credit, a.vw, a.vh) && a.credit.b <= a.panel.t, tag + ' E4: Esri live, but the credit line above the panel is not "Powered by Esri ...": ' + JSON.stringify([a.esri, a.creditText, a.credit]));
        f(a.creditOsm && /© OpenStreetMap/.test(a.creditText || '') && onScreen(a.creditOsm, a.vw, a.vh) && a.panel && a.creditOsm.b <= a.panel.t && !hits(a.creditOsm, a.recenter) && !hits(a.creditOsm, a.zoom), tag + ' E4: "© OpenStreetMap" is not on the credit line above the panel: ' + JSON.stringify([a.creditText, a.creditOsm, a.panel && a.panel.t]));
        errs(s, tag + ' E4');
    }

    // ---- M1-M3 on the 15 at the default text ----------------------------------------------
    if (!ONLY || ONLY === 'more') {
        const phone = ALL_PHONES[1], ST = START(1);
        let s = await go({ phone, steps: ST.concat([MEASURE, TAP('#gps-overlay .gps-panel-handle'), W(900), MEASURE], shot('15-default-collapsed'), [{ expression: 'location.reload()' }, W(1000)], ST, [MEASURE, TAP('#gps-overlay .gps-panel-handle'), W(900), MEASURE]) });
        const [c0, c1, c2, c3] = s;
        report.collapse = { open: c0.panel, closed: c1.panel, tee: [c0.tee, c1.tee], reload: c2.collapsed, again: c3.collapsed };
        f(c1.collapsed && !c1.plays && !c1.green && !c1.mark && c1.m && c1.bottom && c1.chip, 'M1: collapsed should show the numbers + the score row (+ the round chip) only');
        f(c1.panel && c0.panel && c1.panel.t > c0.panel.t + 40, 'M1: the panel did not get shorter');
        f(c1.credit && c1.credit.b <= c1.panel.t, 'M1: the credit is not above the collapsed panel');
        f(c1.tee && c0.tee && c1.tee.b > c0.tee.b, 'M1: the hole was not re-fitted into the taller map: ' + JSON.stringify([c0.tee, c1.tee]));
        f(c2.collapsed === true, 'M1: collapsed was not remembered for the round');
        f(c3.collapsed === false && c3.plays, 'M1: the handle did not expand it again');
        errs(s, 'M1');
        s = await go({ phone, features: { gpsLayoutC: false }, steps: ST.concat([MEASURE]) });
        report.off = { lc: s[0].lc, oldTop: !!s[0].oldTop, panel: s[0].panel, chip: s[0].chip, mLbl: s[0].mLbl, addGame: !!s[0].addBtn };
        f(!s[0].lc && s[0].oldTop && s[0].oldRight && !s[0].panel && !s[0].chip && s[0].mLbl === 'CENTER' && s[0].addBtn, 'M2: gpsLayoutC off is not the old layout: ' + JSON.stringify(report.off));
        errs(s, 'M2');
        s = await go({ phone, features: { gpsRoundScore: false }, steps: ST.concat([MEASURE]) });
        f(s[0].lc && !s[0].chip && s[0].chipText === null, 'M3: gpsRoundScore off still shows the round chip');
        errs(s, 'M3');
    }

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
