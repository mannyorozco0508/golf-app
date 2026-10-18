#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - LAYOUT D "HardPan" (mailbox 012, mockup D), PLAYED
//
//   node tools/gps-layout-d-check.js [--shot <png>]   exit 0 = passed, 1 = broke, 2 = could not run
//
// As tools/gps-layout-c-check.js: cold Chrome at iPhone 15 size (393x852; LD_W / LD_H for
// others), the app, a subscriber, Caledonia's bundled hole 1, a stand-in GPS ~160 yds out,
// USGS EPQS / NWS stubbed IN THE PAGE, Manny 3 holes scored. ESRI LIVE (a stand-in key and
// tiles, in the page) and Manny's bag set up.
//   1  THE TOP BAR, one dark card: ‹ | HOLE 1 ▾ | MIDDLE (big, lime) | B / F | Par / HCP.
//      Under it Games (left) and the round chip (right). The old top panel / C's panel gone.
//   2  THE RAIL: Wind, Green, Hazards, Preview, Zoom - 52px squares at the right.
//   3  THE PILL: the raw yards in a dark circle, "Plays like Ny · club" (the bag's club).
//      THE BOTTOM: a wide Mark shot; under it Card | Hole 1 / Enter score | + Game | Tools.
//      The credit ("Powered by Esri") just above the bottom, left.
//   4  NOTHING OVERLAPS; the tee, the green and the distance bubbles are in the clear map;
//      a tap under the top bar puts the target back into the clear map.
//   5  Tools > Screen layout: Bottom panel -> layout C at once (no reload); remembered on the
//      phone (a reload); HardPan -> D again. No bag set up: no club on the pill.
//   6  Tournament mode: no pill.
//   7  gpsLayoutD OFF: layout C (011) exactly, and no Screen layout setting.
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

const argShot = process.argv.indexOf('--shot');
const SHOT = argShot > 0 ? path.resolve(process.argv[argShot + 1]) : null;
// --shots <dir>: the phase-2 screenshots, D-<phone>-<default|largest>.png, into that folder.
const argShots = process.argv.indexOf('--shots');
const SHOTS = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : null;
// THREE PHONES x TWO TEXT SIZES (as 011's layout-C check): "largest" = every font size (and
// px line height) on the GPS screen x1.35, the way a system text zoom does it (iOS xxxLarge
// 23pt over the 17pt default); the map's own labels are left alone.
const PHONES = [{ name: 'se', w: 375, h: 667 }, { name: '15', w: 393, h: 852 }, { name: 'promax', w: 430, h: 932 }];
const TEXTS = [{ name: 'default', k: 1 }, { name: 'largest', k: 1.35 }];
const VW = Number(process.env.LD_W) || 393, VH = Number(process.env.LD_H) || 852;
const CODE = 'LAYD';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 12);

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
// esri: Esri imagery LIVE - a key and a tile URL the page's own fetch stand-in answers (ESRI_TILES below),
// as gps-check.js's CFG({ esri: 'OK-3X' }) arm; nothing leaves the page.
const CFG = (features, esri) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:" + (esri ? "'CHECK',esriTileUrl:'https://esri.test/esri/" + esri + "/tile/{z}/{y}/{x}?token={key}'" : "''") + ",elevGapMs:0}"
    + (features ? ',{features:Object.assign({},v.features,' + JSON.stringify(features) + ')}' : '') + ");}});})();";
const GEO = (p) => "(function(){ var cur={lat:" + p[0] + ",lng:" + p[1] + "}; try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){var f=function(){ok({coords:{latitude:cur.lat,longitude:cur.lng,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); setInterval(f,1000); return 1;},getCurrentPosition:function(){},clearWatch:function(){}}}); } catch(e){} })();";
// EPQS: the ground rises toward the green; NWS: 6 mph, 80 F. In the page; nothing leaves it.
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
const SEED = "(function(){ try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s','1'); localStorage.setItem('hardpan_round_side','gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "','1');"
    + " localStorage.setItem('hardpan_gps_whoasked_" + CODE + "','1'); localStorage.setItem('hardpan_gps_golfer_" + CODE + "','101'); localStorage.setItem('hardpan_gps_autoadvance','0'); } catch(e){} })();";
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
function expectChip(r) {
    const cd = r.courseData.slice().sort((a, b) => a.hole - b.hole).slice(0, DELTAS.length);
    const p = r.players.filter((x) => String(x.id) === '101')[0], hcp = parseFloat(p.hcp);
    const st = (si) => Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
    const gross = cd.reduce((s, h, i) => s + h.par + DELTAS[i], 0), par = cd.reduce((s, h) => s + h.par, 0);
    const net = cd.reduce((s, h, i) => s + h.par + DELTAS[i] - st(h.hcpIndex), 0);
    const tp = (n) => n === 0 ? 'E' : (n > 0 ? '+' + n : '−' + Math.abs(n));
    return 'Thru ' + cd.length + ' · ' + gross + ' (' + tp(gross - par) + ') · Net ' + net + ' (' + tp(net - par) + ')';
}
// USGS TILES, STOOD IN (as gps-flyover-check): a blank 1x1 tile for every basemap request -
// MapLibre's load event waits for the first view's tiles. LD_REAL_TILES=1 (the screenshot arm only - a
// person looks at): the real public-domain USGS photo of the course instead - the course's
// tiles only, never the golfer's position (that is the stand-in GPS, in the page).
const REAL = process.env.LD_REAL_TILES === '1';
const TILE = "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { if (/basemap\\.nationalmap\\.gov/.test(String(u && u.url || u))) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*overpass*', '*cloudfunctions.net*'];
const BLOCK_REAL = ['*arcgis*', '*overpass*', '*cloudfunctions.net*'];
// Esri's tiles, stood in: a blank 1x1 PNG for every esri.test request.
const ESRI_TILES = "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { var su = String(u && u.url || u); if (/esri\\.test\\/esri\\/DENY/.test(su)) return Promise.resolve(new Response('{\"error\":{\"code\":403}}', { status: 403, headers: { 'Content-Type': 'application/json' } }));"
    + " if (/esri\\.test/.test(su)) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
// MY BAG, set up (Manny's carries) - the pill names the club. Without it: no club.
const BAG = "(function(){ try { if (sessionStorage.getItem('__b')) return; sessionStorage.setItem('__b','1'); localStorage.setItem('hardpan_bag_v1', JSON.stringify({ v: 1, golfers: { 'n:manny orozco': { shots: {}, setupAt: 1,"
    + " set: { Dr: 250, '3w': 230, '5w': 215, Hy: 200, '4i': 190, '5i': 180, '6i': 170, '7i': 160, '8i': 150, '9i': 140, PW: 125, GW: 110, SW: 95, LW: 80 } } } })); } catch(e){} })();";
const LAYOUT_C = "(function(){ try { localStorage.setItem('hardpan_gps_layout','c'); } catch(e){} })();";
const go = async (o) => {
    const res = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: o.round || round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: o.vw || VW, height: o.vh || VH }, webgl: true, blockUrls: o.real ? BLOCK_REAL : BLOCK, profileDir: o.profileDir,
        preScript: CFG(o.features, o.esri) + 'window.__hardpanDoors = true;' + ERR + GEO(ME) + (o.real ? '' : TILE) + (o.esri ? ESRI_TILES : '') + FETCH + SEED + (o.seed || '') + iapStub({ active: true }), steps: o.steps });
    if (!res.ok) throw new Error(res.reason);
    if (process.env.LD_DEBUG) console.error(JSON.stringify(res.value.filter((v) => typeof v !== 'string' || v.charAt(0) !== '{')));
    return res.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const W = (ms) => ({ sleep: ms });
// Everything the checks look at, measured in the page.
const MEASURE = { expression: "(function(){ var ov = document.getElementById('gps-overlay');"
    + " var R = function (sel) { var e = typeof sel === 'string' ? ov.querySelector(sel) : sel; if (!e || e.offsetParent === null || getComputedStyle(e).display === 'none') return null; var b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };"
    + " var T = function (sel) { var e = ov.querySelector(sel); return e ? e.textContent : null; };"
    + " var mapEl = ov.querySelector('.gps-map'); var rail = ov.querySelector('.gps-ld-rail');"
    + " return JSON.stringify({ ld: ov.classList.contains('gps-ld'), lc: ov.classList.contains('gps-lc'), layout: window.HardPanGps && HardPanGps.layout(),"
    + "  top: R('.gps-ld-top'), back: R('.gps-back'), hole: R('.gps-hole-btn'), mid: R('.gps-num-mid'), fb: R('.gps-ld-fb'), par: R('.gps-ld-par'), games: R('.gps-door-games'), chip: R('.gps-lc-score'),"
    + "  rail: rail ? [].map.call(rail.children, function (c) { var r = R(c); return r && Object.assign(r, { cls: c.className.split(' ')[0], txt: c.textContent }); }).filter(Boolean) : [],"
    + "  pill: R('.gps-ld-plays'), raw: T('.gps-ld-raw'), plText: T('.gps-ld-pltext'), mark: R('.gps-mark-shot'), markText: T('.gps-mark-shot'), bottom: R('.gps-bottom'), card: R('.gps-side-bets'), score: R('.gps-scorebox'), tools: R('.gps-tools'), add: R('.gps-door-add'),"
    + "  holeLbl: T('.gps-ld-holelbl'), scoreText: T('.gps-score'), cardCap: T('.gps-side-bets .gps-cap'), credit: R('.gps-credit'), creditText: (ov.querySelector('.gps-credit') || {}).innerText,"
    + "  oldTop: R('.gps-top'), oldRight: R('.gps-right'), panel: R('.gps-panel'), plLine: R('.gps-pl-line'), recenter: R('.gps-recenter'),"
    + "  pillTo: R('.gps-pill-to'), pillOn: R('.gps-pill-on'), pillToText: (ov.querySelector('.gps-pill-to') || {}).textContent, pillToU: (ov.querySelector('.gps-pill-to') || {}).getAttribute && ov.querySelector('.gps-pill-to').getAttribute('data-u'),"
    + "  target: R('.gps-target .gps-ring-dot'), tee: (function(){ var v = (mapEl && mapEl.getAttribute('data-tee-px') || '').split(',').map(Number); return v.length === 2 ? { l: v[0], t: v[1], r: v[0] + 1, b: v[1] + 1 } : null; })(), green: (function(){ var v = (mapEl && mapEl.getAttribute('data-green-box') || '').split(',').map(Number); return v.length === 4 ? { l: v[0], t: v[1], r: v[2], b: v[3] } : null; })(),"
    + "  holeText: (ov.querySelector('.gps-hole-btn') || {}).innerText, mLbl: T('.gps-num-mid .gps-lbl'), mText: T('.gps-m'), parText: (ov.querySelector('.gps-ld-par') || {}).innerText, chipText: T('.gps-lc-score'),"
    + "  mFont: (function(){ var e = ov.querySelector('.gps-num-mid .gps-big'); return e ? getComputedStyle(e).fontSize : null; })(), mColor: (function(){ var e = ov.querySelector('.gps-num-mid .gps-big'); return e ? getComputedStyle(e).color : null; })(),"
    + "  topBg: (function(){ var e = ov.querySelector('.gps-ld-top'); return e ? getComputedStyle(e).backgroundColor : null; })(), scoreBg: (function(){ var e = ov.querySelector('.gps-scorebox'); return e ? getComputedStyle(e).backgroundColor : null; })(),"
    + "  pillBg: (function(){ var e = ov.querySelector('.gps-ld-plays'); return e ? getComputedStyle(e).backgroundColor : null; })(),"
    + "  map: mapEl ? { zoom: mapEl.getAttribute('data-zoom'), center: mapEl.getAttribute('data-center'), bearing: mapEl.getAttribute('data-bearing'), w: mapEl.clientWidth, h: mapEl.clientHeight, ready: mapEl.getAttribute('data-ready'), bounds: mapEl.getAttribute('data-bounds'), tiles: mapEl.getAttribute('data-tiles-loaded'), side: document.body.className } : null, creditOnTop: (function(){ var c = ov.querySelector('.gps-credit-txt'); if (!c || c.offsetParent === null) return null; var b = c.getBoundingClientRect(); var h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!(h && ov.querySelector('.gps-credit').contains(h)); })(),"
    + "  esriLayer: mapEl && mapEl.getAttribute('data-esri'), sheet: (function(){ var w = document.getElementById('hp-score-sheet'); if (!w) return null; for (var x = w; x && x !== document.body; x = x.parentElement) { var c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; } var b = w.getBoundingClientRect(); return b.height > 0; })(), side: window.HardPanGps && HardPanGps.side(), pick: R('.gps-layout-pick'), pickText: T('.gps-layout-pick'), plinfo: R('.gps-plinfo'), esriPx: !!(window.HardPanGps), vh: innerHeight, vw: innerWidth, e: window.__e }); })()" };
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector('#gps-overlay " + sel + "'); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const WAIT_MAP = { waitFor: "(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && Number(m.dataset.zoom) > 3); })()", timeout: 45000 };
const READY = { waitFor: "(function(){ var p = document.querySelector('#gps-overlay .gps-ld-pltext'), q = document.querySelector('#gps-overlay .gps-pl-text'); var m = document.querySelector('#gps-overlay .gps-m'); return !!(((p && /\\d/.test(p.textContent)) || (q && /Plays/.test(q.textContent))) && m && /\\d/.test(m.textContent)); })()", timeout: 25000 };
const START = [W(2500), OPEN, W(2500), WAIT_MAP, READY, W(2000)];
// THE LARGEST TEXT (as gps-layout-c-check.js's SCALE): every font size x k, once per element.
const SCALE = (k) => ({ expression: "(function(){ var k = " + k + "; if (k === 1) return 'k1'; var todo = [];"
    + " [document.getElementById('gps-overlay')].forEach(function (root) { if (!root) return;"
    + "  [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (e) { if (e.closest('.gps-map-wrap') || e.hasAttribute('data-fs0') || e.tagName === 'STYLE' || e.closest('svg')) return;"
    + "   var cs = getComputedStyle(e), p = e.parentElement; todo.push([e, parseFloat(cs.fontSize), cs.lineHeight, !!(p && p.hasAttribute('data-fs0') && parseFloat(getComputedStyle(p).fontSize) === parseFloat(cs.fontSize))]); }); });"
    + " todo.forEach(function (t) { var e = t[0]; e.setAttribute('data-fs0', t[1]); if (t[3]) return;"
    + "  e.style.setProperty('font-size', (t[1] * k).toFixed(2) + 'px', 'important'); if (/px$/.test(t[2])) e.style.setProperty('line-height', (parseFloat(t[2]) * k).toFixed(2) + 'px', 'important'); });"
    + " window.dispatchEvent(new Event('resize')); return 'scaled ' + todo.length; })()" });
// TEXT CUT OFF: wider than its box (an ellipsis), or off the screen.
const CLIPS = { expression: "(function(){ var ov = document.getElementById('gps-overlay'), out = [];"
    + " ['.gps-back', '.gps-hole-btn', '.gps-num-mid .gps-lbl', '.gps-m', '.gps-ld-top .gps-num-mid', '.gps-num-b', '.gps-num-f', '.gps-ld-par1', '.gps-ld-hcp', '.gps-door-games', '.gps-lc-score', '.gps-ld-raw', '.gps-ld-pl small', '.gps-ld-pltext', '.gps-mark-shot', '.gps-ld-holelbl', '.gps-who', '.gps-score', '.gps-side-bets .gps-cap', '.gps-tools .gps-cap', '.gps-door-add .gps-cap', '.gps-credit',"
    + "  '.gps-ld-rail .gps-wind-mph', '.gps-ld-rail .gps-green-view', '.gps-ld-rail .gps-hz-btn', '.gps-ld-rail .gps-fly-btn'].forEach(function (sel) { var e = ov.querySelector(sel); if (!e) return;"
    + "  for (var x = e; x && x !== document.body; x = x.parentElement) { var c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return; }"
    + "  var b = e.getBoundingClientRect(); if (!b.width) return;"
    + "  if (e.scrollWidth > e.clientWidth + 1) out.push(sel + (getComputedStyle(e).overflowX !== 'visible' ? ' cut ' : ' spills out ') + e.scrollWidth + '>' + e.clientWidth + ' ' + JSON.stringify(e.textContent));"
    + "  if (b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1) out.push(sel + ' off screen ' + JSON.stringify([Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)])); });"
    + " return JSON.stringify({ clips: out }); })()" };
// A SHEET OR MENU ON TOP: what a finger touches at its middle is inside it.
const ONTOP = (sel) => ({ expression: "(function(){ var e = document.querySelector('#gps-overlay " + sel + "'); if (!e || e.offsetParent === null) return JSON.stringify({ ontop: null, sel: " + JSON.stringify(sel) + " });"
    + " var b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = Math.min(b.top + b.height / 2, innerHeight - 4), h = document.elementFromPoint(x, y);"
    + " return JSON.stringify({ ontop: !!(h && e.contains(h)), sel: " + JSON.stringify(sel) + ", hit: h && h.className }); })()" });
const SWITCH = [TAP('.gps-tools'), W(300), TAP('.gps-layout-pick'), W(1500)];

// THE CREDIT, SEEN: on screen, nothing over its words, above the bottom controls (D: Mark shot; C: the panel).
const creditOk = (a) => !!(a.credit && a.creditOnTop === true && a.credit.l >= 0 && a.credit.t >= 0 && a.credit.r <= a.vw && a.credit.b <= a.vh
    && a.credit.b <= (a.mark && a.ld ? a.mark.t : (a.panel ? a.panel.t : a.vh)));
const hits = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
const inside = (a, c) => !!(a && a.t >= c.top && a.b <= c.bottom && a.l >= 0 && a.r <= c.right);
// The clear map in D: under the top bar and the Games / chip row, above the pill / credit /
// Mark shot, left of the rail.
const clearOf = (a) => ({ top: Math.max(a.top ? a.top.b : 0, a.games ? a.games.b : 0, a.chip ? a.chip.b : 0),
    bottom: Math.min(a.pill ? a.pill.t : 1e9, a.credit ? a.credit.t : 1e9, a.mark ? a.mark.t : 1e9, a.bottom ? a.bottom.t : 1e9),
    right: Math.min(a.vw, ...a.rail.map((x) => x.l)) });

// The D layout, every rule the spec gives. tag: which arm. o.esri: "Powered by Esri" asserted.
function checkD(a, f, tag, o) {
    o = o || {};
    f(a.ld && !a.lc && a.layout === 'd', tag + ' 1: layout D is not on');
    f(!a.oldTop && !a.oldRight && !a.panel && !a.plLine, tag + ' 1: the old top panel / right column / C panel / plays line still shows');
    // 1 THE TOP BAR
    f(a.top && a.top.t >= 0 && a.top.l >= 4 && a.top.r <= a.vw - 4, tag + ' 1: the top bar: ' + JSON.stringify(a.top));
    f(/rgba?\(1[01], 1[05], 1[02]/.test(a.topBg || ''), tag + ' 1: the top bar is not dark: ' + a.topBg);
    [['back', a.back], ['hole', a.hole], ['mid', a.mid], ['fb', a.fb], ['par', a.par]].forEach(([n, x]) => f(x && hits(x, a.top), tag + ' 1: ' + n + ' is not in the top bar'));
    f(a.back && a.hole && a.mid && a.fb && a.par && a.back.r <= a.hole.l + 1 && a.hole.r <= a.mid.l + 1 && a.mid.r <= a.fb.l + 1 && a.fb.r <= a.par.l + 1, tag + ' 1: ‹ | HOLE | MIDDLE | B / F | Par / HCP not in that order');
    f(/HOLE\s*1\s*▾/.test(a.holeText || ''), tag + ' 1: HOLE 1 ▾: ' + JSON.stringify(a.holeText));
    f(a.mLbl === 'MIDDLE' && /^\d+$/.test(a.mText || '') && parseFloat(a.mFont) >= 40 && /200, 240, 122/.test(a.mColor || ''), tag + ' 1: MIDDLE big lime: ' + [a.mLbl, a.mText, a.mFont, a.mColor]);
    f(/^Par \d\s*\n?\s*HCP \d+$/.test((a.parText || '').trim()), tag + ' 1: Par / HCP: ' + JSON.stringify(a.parText));
    f(a.games && a.chip && a.games.t >= a.top.b && a.chip.t >= a.top.b && a.games.r < a.chip.l && a.chip.r <= a.vw - 4, tag + ' 1: Games left / round chip right, under the bar: ' + JSON.stringify([a.games, a.chip]));
    if (o.want) f(a.chipText === o.want, tag + ' 1: the round chip says ' + JSON.stringify(a.chipText) + ', expected ' + JSON.stringify(o.want));
    // 2 THE RAIL
    const want = ['gps-wind', 'gps-green-view', 'gps-hz-btn', 'gps-fly-btn', 'gps-zoom'];
    f(JSON.stringify(a.rail.map((x) => x.cls)) === JSON.stringify(want), tag + ' 2: the rail is not Wind, Green, Hazards, Preview, Zoom: ' + JSON.stringify(a.rail.map((x) => x.cls)));
    a.rail.forEach((x) => f(x.w >= 52 && x.w <= 96 && x.h >= 52 && x.r <= a.vw - 4 && x.r >= a.vw - 12, tag + ' 2: a rail square: ' + JSON.stringify(x)));
    f(a.rail.length && a.rail[0].t >= Math.max(a.games ? a.games.b : 0, a.chip ? a.chip.b : 0), tag + ' 2: the rail starts under the Games / chip row');
    // 3 THE PILL, THE BOTTOM, THE CREDIT
    f(a.pill && /^\d+$/.test(a.raw || '') && /^\d+y( · \w+)?$/.test(a.plText || ''), tag + ' 3: the pill: ' + JSON.stringify([a.raw, a.plText]));
    if (o.club) f(/ · (Dr|[35]W|Hy|\di|PW|GW|SW|LW)$/.test(a.plText || ''), tag + ' 3: the pill names no club from the bag: ' + a.plText);
    if (o.noClub) f(!/·/.test(a.plText || ''), tag + ' 3: a club with no bag set up: ' + a.plText);
    f(/243, 240, 226/.test(a.pillBg || ''), tag + ' 3: the pill is not cream: ' + a.pillBg);
    f(a.pill && a.mark && a.pill.b <= a.mark.t && (a.pill.r >= a.vw - 12 || a.rail.filter((x) => x.b + 6 > a.pill.t && x.t < a.pill.b).every((x) => a.pill.r <= x.l - 4)), tag + ' 3: the pill is not at the right (or just left of the rail on a short phone) above Mark shot: ' + JSON.stringify([a.pill, a.mark]));
    f(a.mark && a.mark.w >= a.vw - 24 && a.mark.h >= 44 && /Mark shot/.test(a.markText || ''), tag + ' 3: Mark shot is not wide: ' + JSON.stringify([a.mark, a.markText]));
    f(a.bottom && a.bottom.t >= a.mark.b && a.bottom.b <= a.vh, tag + ' 3: the Card row is not under Mark shot');
    f(a.card && a.score && a.tools && a.card.r <= a.score.l + 1 && a.score.r <= (a.add ? a.add.l : a.tools.l) + 1 && (!a.add || a.add.r <= a.tools.l + 1), tag + ' 3: Card | score | + Game | Tools not in order');
    f(a.cardCap === 'Card' && a.holeLbl === 'Hole 1' && /Enter score|\d/.test(a.scoreText || '') && /200, 240, 122/.test(a.scoreBg || ''), tag + ' 3: Card / "Hole 1 / Enter score" lime: ' + JSON.stringify([a.cardCap, a.holeLbl, a.scoreText, a.scoreBg]));
    f(!a.add, tag + ' 3: "+ Game" is still in the bottom bar (Games, top left, does the same): ' + JSON.stringify(a.add));
    f(a.score && a.score.w >= a.vw * 0.4, tag + ' 3: the Enter score button is not the big one: ' + JSON.stringify(a.score));
    f(a.credit && a.credit.l <= 16 && a.credit.b <= a.mark.t && a.credit.b >= a.mark.t - 16, tag + ' 3: the credit is not bottom-left just above Mark shot: ' + JSON.stringify([a.credit, a.mark]));
    if (o.esri) f(/Powered by Esri/.test(a.creditText || ''), tag + ' 3: Esri live, but the credit says ' + JSON.stringify(a.creditText));
    f(creditOk(a), tag + ' 3: the credit is not visible (in the viewport, on top, above Mark shot): ' + JSON.stringify([a.credit, a.creditOnTop, a.mark]));
    // 4 NOTHING OVERLAPS; the hole in the clear map.
    const ctl = [['top', a.top], ['games', a.games], ['chip', a.chip], ['pill', a.pill], ['credit', a.credit], ['mark', a.mark], ['bottom', a.bottom], ['recenter', a.recenter]].concat(a.rail.map((x) => [x.cls, x])).filter((x) => x[1]);
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) f(!hits(ctl[i][1], ctl[j][1]), tag + ' 4: ' + ctl[i][0] + ' overlaps ' + ctl[j][0] + ' ' + JSON.stringify([ctl[i][1], ctl[j][1]]));
    const c = clearOf(a);
    f(inside(a.tee, c) && inside(a.green, c), tag + ' 4: the tee / green is not in the clear map: ' + JSON.stringify([a.tee, a.green, c]));
    [a.pillTo, a.pillOn].filter(Boolean).forEach((p) => { f(inside(p, c), tag + ' 4: a distance bubble is outside the clear map: ' + JSON.stringify([p, c])); ctl.forEach((x) => f(!hits(p, x[1]), tag + ' 4: a distance bubble overlaps ' + x[0])); });
    f(a.pillTo && a.pillToU === 'y' && /^\d+$/.test(a.pillToText || ''), tag + ' 4: the you -> target bubble: ' + JSON.stringify([a.pillTo, a.pillToText, a.pillToU]));
    return c;
}

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });
    const want = expectChip(round());

    // LD_ARMS=esri,tap,switch,tourney,off (default: all); LD_SHOT_ONLY=1: just the screenshot arm.
    let s;
    const ARMS = process.env.LD_SHOT_ONLY ? [] : (process.env.LD_ARMS || 'esri,usgs,tap,switch,tourney,off,sheet,sizes').split(',');
    const TX = Math.round(VW * 0.4);
    const tapAt = (y) => ({ expression: "(function(){ var c = document.querySelector('#gps-overlay .maplibregl-canvas'); if (!c) return 'no canvas';"
        + " ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: " + TX + ", clientY: " + y + ", button: 0 })); }); return 'tapped'; })()" });
    let topB = 80;
    // P2: THREE PHONES x TWO TEXT SIZES - every D rule, nothing cut off, sheets on top; screenshots.
    if (ARMS.includes('sizes')) for (const ph of PHONES) for (const tx of TEXTS) {
        const tag = ph.name + '-' + tx.name;
        const shotStep = SHOTS ? [{ shot: path.join(SHOTS, 'D-' + ph.w + 'x' + ph.h + '-' + tx.name + '.png'), viewportOnly: true }] : [];
        s = await go({ esri: 'OK-3X', seed: BAG, vw: ph.w, vh: ph.h, steps: START.concat([SCALE(tx.k), W(1500), MEASURE, CLIPS], shotStep,
            [TAP('.gps-ld-plays'), W(400), ONTOP('.gps-plinfo'), TAP('.gps-plinfo-done'), W(200), TAP('.gps-tools'), W(300), ONTOP('.gps-tools-menu'), TAP('.gps-tools'), W(200),
             TAP('.gps-hz-btn'), W(500), ONTOP('.gps-hzs'), TAP('.gps-hzs-done'), W(200), TAP('.gps-hole-btn'), W(300), ONTOP('.gps-picker-card')]) });
        const [m, cl, ...tops] = s;
        checkD(m, f, tag, { esri: true, club: true, want });
        (cl.clips || []).forEach((x) => f(false, tag + ' P2: text cut off / off screen: ' + x));
        tops.forEach((t) => f(t.ontop === true, tag + ' P2: ' + t.sel + ' is not on top: ' + JSON.stringify(t)));
        const c = clearOf(m);
        f(c.bottom - c.top >= 160, tag + ' P2: under 160px of clear map: ' + JSON.stringify(c));
        report[tag] = { clear: c, pill: [m.raw, m.plText], chip: m.chipText, credit: m.creditText, clips: cl.clips, ontop: tops.map((t) => t.sel + ':' + t.ontop) };
        errs(s, tag);
        // The same phone and text in LAYOUT C (Tools > Screen layout: Bottom panel), Esri live: its credit too.
        const cShot = SHOTS ? [{ shot: path.join(SHOTS, 'C-' + ph.w + 'x' + ph.h + '-' + tx.name + '.png'), viewportOnly: true }] : [];
        s = await go({ esri: 'OK-3X', seed: BAG + LAYOUT_C, vw: ph.w, vh: ph.h, steps: START.concat([SCALE(tx.k), W(1500), MEASURE], cShot) });
        const mc = s[0];
        f(mc.layout === 'c', tag + ' C: not layout C');
        f(/Powered by Esri/.test(mc.creditText || ''), tag + ' C: Esri live, but the credit says ' + JSON.stringify(mc.creditText));
        f(creditOk(mc), tag + ' C: the credit is not visible above the panel: ' + JSON.stringify([mc.credit, mc.creditOnTop, mc.panel]));
        report[tag].c = { credit: mc.creditText };
        errs(s, tag + '-C');
    }
    // ESRI FAILS -> USGS: the credit says USGS, never Esri (its tiles refused, 403).
    if (ARMS.includes('usgs')) {
        s = await go({ esri: 'DENY-1', seed: BAG, steps: START.concat([W(2500), MEASURE]) });
        report.usgs = { credit: s[0].creditText, esri: s[0].esriLayer };
        f(/USGS/.test(s[0].creditText || '') && !/Esri/.test(s[0].creditText || ''), 'usgs: Esri refused, but the credit says ' + JSON.stringify(s[0].creditText));
        f(creditOk(s[0]), 'usgs: the credit is not visible');
        errs(s, 'usgs');
    }
    // THE SCORE SHEET (gps-012s, in the combined tree) opens OVER LAYOUT D: behind it, D's top bar -
    // not the old one. A tree without the sheet: noted, nothing asserted.
    if (ARMS.includes('sheet')) {
        s = await go({ seed: BAG, steps: START.concat([TAP('.gps-score'), W(1200), MEASURE]) });
        const sh = s[0];
        report.sheet = sh.sheet == null ? 'no score sheet in this tree' : { open: sh.sheet, side: sh.side, ld: sh.ld, top: !!sh.top, oldTop: !!sh.oldTop };
        if (sh.sheet != null) f(sh.sheet === true && sh.side === 'gps' && sh.ld && sh.top && !sh.oldTop, 'sheet: the score sheet is not over layout D: ' + JSON.stringify(report.sheet));
        errs(s, 'sheet');
    }
    if (ARMS.includes('esri')) {
    // 1-4: ESRI LIVE, the bag set up.
    s = await go({ esri: 'OK-3X', seed: BAG, steps: START.concat([MEASURE]) });
    const a = s[0];
    const c0 = checkD(a, f, 'esri', { esri: true, club: true, want });
    report.d = { top: a.top, hole: a.holeText, mid: [a.mLbl, a.mText, a.mFont], par: a.parText, chip: a.chipText, rail: a.rail.map((x) => x.cls + ' ' + x.w + 'x' + x.h), pill: [a.raw, a.plText], mark: a.markText, score: [a.holeLbl, a.scoreText], credit: a.creditText, clear: c0, tee: a.tee, green: a.green, bubbles: [a.pillTo, a.pillOn], map: a.map };
    if (a.top) topB = a.top.b;
    errs(s, 'esri');
    }
    if (ARMS.includes('tap')) {
    // The tap under the top bar (the bar's own y + its height): the target comes back into the clear map.
    s = await go({ seed: BAG, steps: START.concat([MEASURE, tapAt(Math.round(topB + 6)), W(900), MEASURE, TAP('.gps-ld-plays'), W(400), MEASURE]) });
    const [t0, t1, t2] = s;
    const ct = clearOf(t1);
    report.tap = { y: topB + 6, target: t1.target, clear: ct };
    f(t1.target && t1.target.t >= ct.top && t1.target.b <= ct.bottom, '4: the tapped target is not in the clear map: ' + JSON.stringify([t1.target, ct]));
    f(t2.plinfo, '3: tapping the pill does not open the ⓘ sheet');
    errs(s, 'tap');
    }
    if (ARMS.includes('switch')) {

    // 5: Tools > Screen layout, live: D -> C (no reload), remembered (a reload), C -> D. No bag: no club.
    s = await go({ steps: START.concat([MEASURE, TAP('.gps-tools'), W(300), MEASURE], SWITCH, [MEASURE, { expression: 'location.reload()' }, W(1000)], START, [MEASURE, TAP('.gps-tools'), W(300), MEASURE], SWITCH, [MEASURE]) });
    const [d0, dMenu, cLive, cReload, cMenu, dBack] = s;
    report.switch = { menu: dMenu.pickText, live: cLive.layout, reload: cReload.layout, menuC: cMenu.pickText, back: dBack.layout };
    checkD(d0, f, 'nobag', { noClub: true });
    f(dMenu.pick && dMenu.pickText === 'Screen layout: HardPan', '5: Tools has no "Screen layout: HardPan": ' + JSON.stringify(dMenu.pickText));
    f(cLive.layout === 'c' && cLive.lc && !cLive.ld && cLive.panel && !cLive.top && !cLive.pill, '5: Bottom panel did not switch to layout C at once: ' + JSON.stringify({ layout: cLive.layout, panel: cLive.panel, top: cLive.top }));
    f(cLive.tee && cLive.panel && cLive.tee.b <= cLive.panel.t, '5: after the switch the hole is not re-fitted above C\'s panel: ' + JSON.stringify([cLive.tee, cLive.panel]));
    f(cReload.layout === 'c' && cReload.panel, '5: Bottom panel was not remembered on the phone');
    f(cMenu.pickText === 'Screen layout: Bottom panel', '5: in C the setting says ' + JSON.stringify(cMenu.pickText));
    f(dBack.layout === 'd', '5: HardPan did not switch back to D');
    if (dBack.layout === 'd') checkD(dBack, f, 'back');
    errs(s, 'switch');
    }
    if (ARMS.includes('tourney')) {

    // 6: tournament mode - no pill.
    s = await go({ seed: BAG, steps: START.concat([TAP('.gps-tools'), W(300), TAP('.gps-tourney-toggle'), W(1500), MEASURE]) });
    f(s[0].ld && !s[0].pill, '6: the plays pill shows in tournament mode');
    errs(s, 'tourney');
    }
    if (ARMS.includes('off')) {

    // 7: gpsLayoutD off - layout C, no setting.
    s = await go({ features: { gpsLayoutD: false }, steps: START.concat([MEASURE, TAP('.gps-tools'), W(300), MEASURE]) });
    report.off = { layout: s[0].layout, panel: !!s[0].panel, pick: s[1].pick };
    f(s[0].layout === 'c' && s[0].lc && !s[0].ld && s[0].panel && !s[0].top && !s[1].pick, '7: gpsLayoutD off is not 011 (C, no setting): ' + JSON.stringify(report.off));
    errs(s, 'off');
    }

    // THE SCREENSHOT (a person looks at it): the real USGS photo of the course when LD_REAL_TILES=1.
    if (SHOT) {
        s = await go({ seed: BAG, real: REAL, esri: REAL ? null : 'OK-3X', steps: START.concat([W(REAL ? 4000 : 0), MEASURE, { shot: SHOT, viewportOnly: true }]) });
        checkD(s[0], f, 'shot', { club: true, esri: !REAL });
        report.shot = SHOT;
    }

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
