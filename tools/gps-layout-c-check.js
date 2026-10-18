#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - LAYOUT C (mailbox 011, mockup C), PLAYED
//
//   node tools/gps-layout-c-check.js [--shot <png>]   exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome at iPhone 15 size (393x852), the app, a subscriber (tools/lib/iap-stub.js),
// Caledonia's bundled hole 1, a stand-in GPS ~160 yds out, and the USGS EPQS / NWS stubbed IN
// THE PAGE (so the plays line has its terms). Manny has 3 holes scored (+1, 0, +1).
//   1  THE TOP ROW: Back (44x44) and Games at the left; the hole chip ("Hole 1 · Par N" /
//      yards · HCP · wind) and the round chip ("Thru 3 · G (+2) · Net X (±)") at the right.
//      The old top panel and right-hand column are gone. Nothing in the top row overlaps.
//   2  THE PANEL: at the bottom, >= 95% opaque, rounded top corners: FRONT | MIDDLE (48px) |
//      BACK, the amber plays line, Green | Hazards | Mark shot | Preview (equal widths,
//      >= 44px), the score row. The credit, Recenter and the zoom sit above its top edge.
//   3  THE MAP: the tee and the green are inside the clear area (under the top row, above
//      the panel); the yardage pills too. A tap under the top row: the target is pulled
//      into the clear map.
//   4  THE HANDLE: collapsed = the numbers + the score row only (the round chip stays);
//      the hole is re-fitted into the taller map; remembered for the round (a reload).
//   5  gpsLayoutC OFF: the old layout exactly (the top panel, the right column, no panel).
//   6  gpsRoundScore OFF: no round chip.
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
const VW = Number(process.env.LC_W) || 393, VH = Number(process.env.LC_H) || 852;
const CODE = 'LAYC';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 12);

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const CFG = (features) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:'',elevGapMs:0}"
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
// MapLibre's load event waits for the first view's tiles. LC_REAL_TILES=1 (for a screenshot a
// person looks at): the real public-domain USGS photo of the course instead - the course's
// tiles only, never the golfer's position (that is the stand-in GPS, in the page).
const REAL = process.env.LC_REAL_TILES === '1';
const TILE = REAL ? '' : "(function(){ var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; var f0 = window.fetch;"
    + " window.fetch = function (u, o) { if (/basemap\\.nationalmap\\.gov/.test(String(u && u.url || u))) { var b = atob(png), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);"
    + " return Promise.resolve(new Response(a.buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })); } return f0.apply(this, arguments); }; })();";
const BLOCK = (REAL ? [] : ['*nationalmap.gov*']).concat(['*arcgis*', '*overpass*', '*cloudfunctions.net*']);
const go = async (o) => {
    const res = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: { events: { [CODE]: o.round || round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: VW, height: VH }, webgl: true, blockUrls: BLOCK, profileDir: o.profileDir,
        preScript: CFG(o.features) + 'window.__hardpanDoors = true;' + ERR + GEO(ME) + TILE + FETCH + SEED + iapStub({ active: true }), steps: o.steps });
    if (!res.ok) throw new Error(res.reason);
    if (process.env.LC_DEBUG) console.error(JSON.stringify(res.value.filter((v) => typeof v !== 'string' || v.charAt(0) !== '{')));
    return res.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const W = (ms) => ({ sleep: ms });
const READY = { waitFor: "(function(){ var e = document.querySelector('#gps-overlay .gps-pl-text'); var m = document.querySelector('#gps-overlay .gps-m'); return !!(e && /Plays/.test(e.textContent) && m && /\\d/.test(m.textContent)); })()", timeout: 25000 };
// Everything the checks look at, measured in the page.
const MEASURE = { expression: "(function(){ var ov = document.getElementById('gps-overlay');"
    + " var R = function (sel) { var e = ov.querySelector(sel); if (!e || e.offsetParent === null || getComputedStyle(e).display === 'none') return null; var b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };"
    + " var T = function (sel) { var e = ov.querySelector(sel); return e ? e.textContent : null; };"
    + " var pn = ov.querySelector('.gps-panel'), cs = pn ? getComputedStyle(pn) : null;"
    + " var map = window.HardPanGps; var mapEl = ov.querySelector('.gps-map');"
    + " return JSON.stringify({ lc: ov.classList.contains('gps-lc'),"
    + "  back: R('.gps-back'), games: R('.gps-door-games'), hole: R('.gps-lc-hole'), chip: R('.gps-lc-score'), oldTop: R('.gps-top'), oldRight: R('.gps-right'),"
    + "  panel: R('.gps-panel'), handle: R('.gps-panel-handle'), nums: R('.gps-lc-nums'), f: R('.gps-num-f'), m: R('.gps-num-mid'), b: R('.gps-num-b'), plays: R('.gps-pl-line'), acc: R('.gps-lc-acc'),"
    + "  green: R('.gps-green-view'), hz: R('.gps-hz-btn'), mark: R('.gps-mark-shot'), fly: R('.gps-fly-btn'), bottom: R('.gps-bottom'), credit: R('.gps-credit'), recenter: R('.gps-recenter'), zoom: R('.gps-zoom'),"
    + "  pillTo: R('.gps-pill-to'), pillOn: R('.gps-pill-on'), target: R('.gps-target .gps-ring-dot'), tee: (function(){ var v = (mapEl && mapEl.getAttribute('data-tee-px') || '').split(',').map(Number); return v.length === 2 ? { l: v[0], t: v[1], r: v[0] + 1, b: v[1] + 1 } : null; })(), mid: (function(){ var v = (mapEl && mapEl.getAttribute('data-green-box') || '').split(',').map(Number); return v.length === 4 ? { l: v[0], t: v[1], r: v[2], b: v[3] } : null; })(),"
    + "  l1: T('.gps-lc-l1'), l2: (ov.querySelector('.gps-lc-l2') || {}).innerText, chipText: T('.gps-lc-score'), mText: T('.gps-m'), mLbl: T('.gps-num-mid .gps-lbl'), playsText: T('.gps-pl-text'), accText: T('.gps-lc-acc'),"
    + "  bg: cs && cs.backgroundColor, radius: cs && cs.borderTopLeftRadius, mFont: (function(){ var e = ov.querySelector('.gps-num-mid .gps-big'); return e ? getComputedStyle(e).fontSize : null; })(),"
    + "  playsColor: (function(){ var e = ov.querySelector('.gps-pl-line'); return e ? getComputedStyle(e).color : null; })(),"
    + "  collapsed: !!(pn && pn.classList.contains('gps-panel-collapsed')), zoomLevel: mapEl && mapEl.getAttribute('data-zoom'),"
    + "  mapAttrs: mapEl ? [].map.call(mapEl.attributes, function (x) { return x.name + '=' + x.value; }).join(' ') : null,"
    + "  vh: innerHeight, vw: innerWidth, e: window.__e }); })()" };
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector('#gps-overlay " + sel + "'); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const WAIT_MAP = { waitFor: "(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && Number(m.dataset.zoom) > 3); })()", timeout: 45000 };
const START = [W(2500), OPEN, W(2500), WAIT_MAP, READY, W(2000)];

const hits = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
const inside = (a, top, bot) => !!(a && a.t >= top && a.b <= bot);

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });
    const r0 = round(), want = expectChip(r0);

    // 1-3: the layout, measured.
    const steps = START.concat([MEASURE]);
    if (SHOT) steps.push({ shot: SHOT, viewportOnly: true });
    // A tap just under the hole chip: the target comes back into the clear map.
    const TX = Math.round(VW * 0.43), TY = 34;   // between Games and the hole chip, in the top row
    // MapLibre's own events on its canvas, at that pixel (as gps-flyover-check's TAP_AT).
    steps.push({ expression: "(function(){ var c = document.querySelector('#gps-overlay .maplibregl-canvas'); if (!c) return 'no canvas'; var r = c.getBoundingClientRect();"
        + " ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: " + TX + ", clientY: " + TY + ", button: 0 })); }); return 'tapped'; })()" }, W(800), MEASURE);
    let s = await go({ steps, features: process.env.LC_FEAT ? JSON.parse(process.env.LC_FEAT) : undefined });
    const a = s[0], tapped = s[1];
    report.tap = { at: [TX, TY], target: tapped && tapped.target };
    report.layout = { l1: a.l1, l2: a.l2, chip: a.chipText, mid: a.mText, plays: a.playsText, acc: a.accText, bg: a.bg, radius: a.radius, mFont: a.mFont, panel: a.panel, top: { back: a.back, games: a.games, hole: a.hole, chip: a.chip } };
    f(a.lc, '1: layout C is not on (gps-lc)');
    f(!a.oldTop && !a.oldRight, '1: the old top panel / right column still shows');
    f(a.back && a.back.w >= 44 && a.back.h >= 44, '1: Back is not 44x44: ' + JSON.stringify(a.back));
    f(a.games && a.games.l > a.back.r - 1 && a.games.h >= 44, '1: Games is not right of Back: ' + JSON.stringify(a.games));
    f(/^Hole 1 · Par \d/.test(a.l1 || ''), '1: hole chip line 1: ' + a.l1);
    f(/\d+y · HCP \d+/.test(a.l2 || '') && /mph|Calm/.test(a.l2 || ''), '1: hole chip line 2 (yards · HCP · wind): ' + JSON.stringify(a.l2));
    f(a.chipText === want, '1: the round chip says ' + JSON.stringify(a.chipText) + ', expected ' + JSON.stringify(want));
    f(a.chip && a.hole && a.chip.t >= a.hole.b, '1: the round chip is not under the hole chip');
    [['back', 'games'], ['games', 'hole'], ['games', 'chip'], ['back', 'hole']].forEach(([x, y]) => f(!hits(a[x], a[y]), '1: ' + x + ' overlaps ' + y));
    f(a.hole && a.hole.r <= a.vw - 4 && a.chip && a.chip.r <= a.vw - 4, '1: a chip runs off the right edge');
    // 2: the panel.
    f(a.panel && a.panel.b === a.vh && a.panel.l <= 0 && a.panel.r >= a.vw, '2: the panel is not along the bottom: ' + JSON.stringify(a.panel));
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(a.bg || ''); f(!alpha || +alpha[1] >= 0.95, '2: the panel is not >= 95% opaque: ' + a.bg);
    f(parseFloat(a.radius) >= 20, '2: the panel corners: ' + a.radius);
    f(a.f && a.m && a.b && a.f.r <= a.m.l + 1 && a.m.r <= a.b.l + 1, '2: FRONT | MIDDLE | BACK not in a row');
    f(a.mLbl === 'MIDDLE' && parseFloat(a.mFont) >= 44, '2: MIDDLE: ' + a.mLbl + ' ' + a.mFont);
    f(a.plays && a.plays.t >= a.nums.b && /^Plays \d+/.test(a.playsText || ''), '2: the plays line: ' + JSON.stringify(a.playsText));
    f(/251, 191, 36/.test(a.playsColor || ''), '2: the plays line is not amber: ' + a.playsColor);
    f(/^±\d+ yds$/.test(a.accText || ''), '2: the accuracy line: ' + a.accText);
    const acts = [a.green, a.hz, a.mark, a.fly].filter(Boolean);
    f(acts.length === 4 && acts.every((x) => x.h >= 44 && Math.abs(x.w - acts[0].w) <= 1 && Math.abs(x.t - acts[0].t) <= 1), '2: Green | Hazards | Mark shot | Preview: ' + JSON.stringify(acts));
    f(a.bottom && acts[0] && a.bottom.t >= acts[0].b, '2: the score row is not under the buttons');
    f(a.credit && a.credit.b <= a.panel.t && a.credit.b >= a.panel.t - 12, '2: the credit is not just above the panel: ' + JSON.stringify([a.credit, a.panel && a.panel.t]));
    f(a.recenter && a.recenter.b <= a.credit.t && a.zoom && a.zoom.b <= a.credit.t && a.zoom.r >= a.vw - 12, '2: Recenter / zoom not above the panel: ' + JSON.stringify([a.recenter, a.zoom]));
    // 3: the hole in the clear map.
    const clearTop = Math.max(a.back.b, a.games.b, a.hole.b, a.chip ? a.chip.b : 0), clearBot = a.panel.t;
    report.clear = { top: clearTop, bottom: clearBot, tee: a.tee, mid: a.mid, pills: [a.pillTo, a.pillOn], target: a.target };
    f(inside(a.tee, clearTop, clearBot) && inside(a.mid, clearTop, clearBot), '3: the tee / green is not in the clear map: ' + JSON.stringify([a.tee, a.mid, clearTop, clearBot]));
    [a.pillTo, a.pillOn].filter(Boolean).forEach((p) => f(inside(p, clearTop, clearBot), '3: a yardage pill sits under the top row / panel: ' + JSON.stringify(p)));
    f(tapped && tapped.target && tapped.target.t >= clearTop && tapped.target.b <= clearBot, '3: the tapped target is not in the clear map: ' + JSON.stringify(tapped && tapped.target) + ' clear ' + clearTop);
    errs(s, 'layout');

    if (process.env.LC_ONLY1) { console.log(JSON.stringify({ report, fails, a }, null, 1)); process.exit(fails.length ? 1 : 0); }
    // 4: collapse, re-fit, remembered.
    s = await go({ steps: START.concat([MEASURE, TAP('.gps-panel-handle'), W(800), MEASURE, { expression: 'location.reload()' }, W(1000)], START, [MEASURE, TAP('.gps-panel-handle'), W(800), MEASURE]) });
    const [c0, c1, c2, c3] = s;
    report.collapse = { open: c0.panel, closed: c1.panel, zoom: [c0.zoomLevel, c1.zoomLevel], reload: c2.collapsed, again: c3.collapsed };
    f(c1.collapsed && !c1.plays && !c1.green && !c1.mark && c1.m && c1.bottom && c1.chip, '4: collapsed should show the numbers + the score row (+ the round chip) only');
    f(c1.panel && c0.panel && c1.panel.t > c0.panel.t + 40, '4: the panel did not get shorter');
    f(c1.credit && c1.credit.b <= c1.panel.t, '4: the credit is not above the collapsed panel');
    f(c1.tee && c1.tee.b > c0.tee.b, '4: the hole was not re-fitted into the taller map: ' + JSON.stringify([c0.tee, c1.tee]));
    f(c2.collapsed === true, '4: collapsed was not remembered for the round');
    f(c3.collapsed === false && c3.plays, '4: the handle did not expand it again');
    errs(s, 'collapse');

    // 5: switch off - the old layout.
    s = await go({ features: { gpsLayoutC: false }, steps: START.concat([MEASURE]) });
    report.off = { lc: s[0].lc, oldTop: !!s[0].oldTop, panel: s[0].panel, chip: s[0].chip, mLbl: s[0].mLbl };
    f(!s[0].lc && s[0].oldTop && s[0].oldRight && !s[0].panel && !s[0].chip && s[0].mLbl === 'CENTER', '5: gpsLayoutC off is not the old layout: ' + JSON.stringify(report.off));
    errs(s, 'off');

    // 6: the round chip's own switch.
    s = await go({ features: { gpsRoundScore: false }, steps: START.concat([MEASURE]) });
    f(s[0].lc && !s[0].chip && s[0].chipText === null, '6: gpsRoundScore off still shows the round chip');
    errs(s, 'chipOff');

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
