#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - THE ROUND SCREEN'S GPS SIDE, CHECKED THE WAY A GOLFER USES IT
// (gps-v1, 2026-10-06)
//
// Arrives cold at the scorecard (390 x 844) of a HardPan tree, with a round on a
// real course, and TOUCHES NOTHING the page defines. It taps "📍 GPS" and
// "💰 Bets", drags the target and the map, taps Prev/Next on both sides, and
// reads innerText and rects.
//
// What it replaces is the DEVICE, not the page: navigator.geolocation is a
// stand-in sensor that reports a fixed spot and records every watch and clear,
// and document.visibilityState can be flipped the way iOS flips it when the
// app goes to the background. The Firebase stand-in is the shared cold-arrival
// one, which records every write.
//
// ARMS
//   osm        Caledonia, hole 1 (mapped in OSM). The toggle; F / C / B equal
//              to literals measured on this build; the target starts halfway
//              and reads "You → here" / "Here → center"; dragging it moves it
//              and NOT the map; dragging elsewhere pans the map and NOT the
//              target; a tap jumps it; meters; one hole on both sides (Next on
//              GPS moves the card, Next on the card moves GPS); the target and
//              the card's scroll survive a switch; background stops the watch
//              at once and foreground restarts it; the side is remembered
//              across a reload.
//   idle       Bets keeps the watch for 60 s, then stops it.
//   unmapped   Pine Lakes (nothing shipped): Weak GPS, "Tap the center of the
//              green", Save -> one write to events/<code>/gpsPins/h1 holding
//              the TAPPED point.
//   organizer  Caledonia as the round owner: Fix moves the center, Undo
//              restores the OSM green.
//   denied     permission denied: the GPS side says how to turn it on; the
//              Bets side is the card, unchanged.
//   precache   the round opens with signal and Caledonia's USGS tiles are
//              stored; a second visit with basemap.nationalmap.gov BLOCKED
//              draws the satellite view from the phone's cache.
//
// PRIVACY, every arm: the golfer's coordinates (4 decimals, ~11 m) appear in NO
// recorded write, NO request URL and NO localStorage value.
//
//   node tools/gps-check.js   exit code 0 = passed, 1 = a guarantee broke, 2 = could not run
// ============================================================================
'use strict';
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

if (!fs.existsSync(path.join(__dirname, '..', 'gps-view.js'))) {
    console.error('Consumer tree (GPS_ENABLED=0): there is no GPS side to check.');
    process.exit(2);
}
const table = require('../gps-courses.js');

const sb = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'course-data.js'), 'utf8') + ';this.p=coursePresets;this.l=nineHoleLoops;', sb);

const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '2' }, { id: 102, name: 'Bob Brown', hcp: '6' },
    { id: 103, name: 'Cal Clark', hcp: '9' }, { id: 104, name: 'Dee Dunn', hcp: '14' }];

function round(key, ownerUid) {
    if (key === 'thistle_stewart_mackay') {
        // The round setup builds for the Stewart / MacKay pairing: Stewart is 1-9.
        const loops = sb.l.thistle_27;
        const cd = loops.stewart.data.map((h, i) => ({ hole: i + 1, par: h.par, hcpIndex: i + 1 }))
            .concat(loops.mackay.data.map((h, i) => ({ hole: i + 10, par: h.par, hcpIndex: i + 10 })));
        return { eventName: 'GPS check', activeCourseKey: 'thistle_27', courseName: 'Thistle Golf Club (Stewart / MacKay)', gameFormat: 'stroke',
                 courseData: cd, players: PLAYERS, scores: {}, ownerUid: ownerUid || undefined };
    }
    const preset = sb.p[key];
    const r = { eventName: 'GPS check', activeCourseKey: key, courseName: preset.name, gameFormat: 'stroke',
                courseData: JSON.parse(JSON.stringify(preset.data)), players: PLAYERS, scores: {} };
    if (ownerUid) r.ownerUid = ownerUid;
    return r;
}

// The golfer: 55% of the way from Caledonia hole 1's tee to its green's center.
const H1 = table.caledonia.holes['1'].osm;
const ME = [H1.tee[0] + 0.55 * (H1.mid[0] - H1.tee[0]), H1.tee[1] + 0.55 * (H1.mid[1] - H1.tee[1])];
// THE EXPECTED YARDAGES ARE LITERALS, not gps-geo's answer for the same spot:
// computing them with the module under test made an earlier version of this
// check agree with ANY change to it (measured - a control swapping front and
// back went green). 137 / 153 / 168 were read off the build on 2026-10-06 and
// agree with gps_geo_test.js's hand-built greens; center is re-derived below
// with an inline haversine that shares no code with gps-geo.js. The target
// starts halfway, so both of its legs are half of center: 152.6 / 2 = 76.3,
// shown as 76 (an earlier draft of this line guessed 77 and the check caught it).
// RE-MEASURED 2026-10-07 after the hole's tee became the BACK tee (the test spot is
// 55% along tee -> green, so it moved with the tee): 135 / 151 / 166, meters 138,
// halves 75 / 75. The center is re-derived inline below, as before.
const EXPECT = { front: '135', center: '151', back: '166', centerM: '138', half: '75' };
function inlineHaversineM(a, b) {
    const R = 6371008.8, r = (d) => d * Math.PI / 180;
    const s = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}
// Compass bearing a -> b, degrees (the wind check: a manual wind is kept by compass).
function inlineBearing(a, b) {
    const r = (d) => d * Math.PI / 180, y = Math.sin(r(b[1] - a[1])) * Math.cos(r(b[0]));
    const x = Math.cos(r(a[0])) * Math.sin(r(b[0])) - Math.sin(r(a[0])) * Math.cos(r(b[0])) * Math.cos(r(b[1] - a[1]));
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
// FROM THE TEE (off the hole, or no GPS): center is tee -> green center, derived
// inline from the data; it is not read off the build.
const TEE_CENTER = String(Math.round(inlineHaversineM(H1.tee, H1.mid) / 0.9144));
const TEE_CENTER_YD = inlineHaversineM(H1.tee, H1.mid) / 0.9144;
const ME_CENTER_YD = inlineHaversineM(ME, H1.mid) / 0.9144;
// WAVE 1 ARCS, inline: carry arcs every 25 yds from 50 up to 40 yds short of the
// pin; 100 / 150 / 200-to-the-pin marks when at least 40 yds short of it.
function expectArcs(totalYd, step) {
    const out = [], st = step || 25;
    const marks = [100, 150, 200].filter((y) => y <= totalYd - 40);
    // no carry arc within half a step of a to-the-pin mark
    for (let y = st * Math.ceil(40 / st); y <= totalYd - 40; y += st) if (!marks.some((m) => Math.abs(y - (totalYd - m)) < st / 2)) out.push('c' + y);
    marks.forEach((y) => out.push('p' + y));
    return out.join(' ');
}
if (String(Math.round(inlineHaversineM(ME, H1.mid) / 0.9144)) !== EXPECT.center) {
    console.error('the fixture moved: hole 1 center is no longer ' + EXPECT.center + ' yds from the test spot'); process.exit(2);
}

function sensor(mode, lat, lng, acc) {
    return `(function () {
      // A PHONE THAT LAST LEFT ON THE CARD (gps-flow): every arm starts on the
      // scorecard and taps 📍 GPS, as it always has. The flow arms set
      // window.__freshPhone first: a phone that has never chosen, which lands on GPS.
      try { if (!window.__freshPhone && !localStorage.getItem('hardpan_round_side')) localStorage.setItem('hardpan_round_side', 'bets'); } catch (e) {}
      // Page errors, recorded: an arm that fails reads WHY (Wave 2 redesign).
      window.__errs = [];
      window.addEventListener('error', function (e) { window.__errs.push(String(e && e.message) + ' @' + (e && e.lineno)); });
      var calls = { watch: 0, clear: 0, active: {}, opts: null };
      window.__geo = calls;
      var nextId = 1, oks = {}, cur = { lat: ${lat}, lng: ${lng}, acc: ${acc} };
      var report = function (id) { if (calls.active[id]) oks[id]({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: cur.acc }, timestamp: Date.now() }); };
      // Wave 2: the golfer walks - every live watch hears the new spot.
      window.__moveTo = function (la, ln, acc) { cur.lat = la; cur.lng = ln; if (acc != null) cur.acc = acc; Object.keys(calls.active).forEach(report); return 'moved'; };
      var fake = {
        watchPosition: function (ok, err, opts) {
          var id = nextId++; calls.watch++; calls.active[id] = true; calls.opts = opts || null; oks[id] = ok;
          setTimeout(function () {
            if (!calls.active[id]) return;
            if (${JSON.stringify(mode)} === 'denied') err({ code: 1, message: 'User denied Geolocation' });
            else report(id);
          }, 50);
          return id;
        },
        clearWatch: function (id) { calls.clear++; delete calls.active[id]; },
        getCurrentPosition: function () {}
      };
      try { Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true }); } catch (e) {}
      var vis = 'visible';
      try { Object.defineProperty(document, 'visibilityState', { get: function () { return vis; }, configurable: true }); } catch (e) {}
      window.__setVis = function (v) { vis = v; document.dispatchEvent(new Event('visibilitychange')); return v; };
    })();`;
}

const READ = `JSON.stringify((function () {
  var o = document.getElementById('gps-overlay');
  var tg = document.getElementById('gps-side-toggle');
  var t = function (s) { var e = o && o.querySelector(s); return e ? (e.innerText || '').trim() : null; };
  // BUILD 3: the accuracy / source line and the target readout are not on the map
  // any more (the numbers ride the lines; the line is in the credits) - read their text.
  var tx = function (s) { var e = o && o.querySelector(s); return e ? (e.textContent || '').trim() : null; };
  var vis = function (s) { var e = o && o.querySelector(s); return !!(e && e.offsetParent !== null); };
  var rect = function (s) { var e = o && o.querySelector(s); if (!e) return null; var r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  var attr = o && o.querySelector('.maplibregl-ctrl-attrib');
  var box = function (e) { if (!e || e.offsetParent === null) return null; var r = e.getBoundingClientRect(); if (!r.width) return null; return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  var q = function (s) { return o && o.querySelector(s); };
  // A Tools item is ON OFFER when it is not hidden - whether or not the menu is open.
  var avail = function (s) { var e = q(s); return !!(e && e.style.display !== 'none' && (!o.classList.contains('gps-basic-mode'))); };
  var mapEl = o && o.querySelector('.gps-map');
  var ds = mapEl ? mapEl.dataset : {};
  var big = o ? [].slice.call(o.querySelectorAll('.gps-big')).map(function (e) { var r = e.getBoundingClientRect(); return { text: e.innerText.trim(), over: e.scrollWidth > e.clientWidth + 1, l: Math.round(r.left), r: Math.round(r.right) }; }) : [];
  // CREDITS (item 7): one line at the bottom-left; the full lines behind ⓘ.
  var cr = o && o.querySelector('.gps-credit');
  var ar = cr ? cr.getBoundingClientRect() : null;
  var gpsBtn = tg && tg.querySelector('.gps-side-gps');
  var card = document.querySelector('.hv-hole-num');
  return { mounted: !!o, gpsShown: !!(o && getComputedStyle(o).display !== 'none'),
           toggle: tg ? (tg.innerText || '').replace(/\\s+/g, ' ').trim() : null,
           toggleOnScreen: !!(tg && tg.getBoundingClientRect().bottom <= innerHeight && tg.getBoundingClientRect().height > 0),
           side: gpsBtn ? (gpsBtn.getAttribute('aria-pressed') === 'true' ? 'gps' : 'bets') : null,
           title: t('.gps-title'), f: t('.gps-f'), m: t('.gps-m'), b: t('.gps-b'), labels: o ? [].slice.call(o.querySelectorAll('.gps-lbl')).map(function (e) { return e.innerText.trim(); }) : [],
           acc: tx('.gps-acc'), msg: vis('.gps-msg') ? t('.gps-msg') : '', verify: vis('.gps-verify') ? t('.gps-verify') : '',
           banner: vis('.gps-banner') ? t('.gps-banner') : '', tilesNote: vis('.gps-tiles-note'),
           toHere: q('.gps-target-row') && q('.gps-target-row').style.display !== 'none' && !o.classList.contains('gps-basic-mode') ? tx('.gps-to-here') : '',
           hereCenter: q('.gps-target-row') && q('.gps-target-row').style.display !== 'none' && !o.classList.contains('gps-basic-mode') ? tx('.gps-here-center') : '',
           units: t('.gps-units'), src: tx('.gps-src'), subShown: vis('.gps-sub'), targetRowShown: vis('.gps-target-row'),
           popInfo: vis('.gps-pop-info') ? tx('.gps-pop-info') : null,
           windManual: !!(q('.gps-wind') && q('.gps-wind').classList.contains('gps-wind-manual')), windSheet: vis('.gps-wind-sheet'),
           windDial: q('.gps-dial') ? q('.gps-dial').getAttribute('data-rel') : null, windLive: vis('.gps-ws-live'),
           windMph: vis('.gps-wind') ? tx('.gps-wind-mph') : null, windTag: vis('.gps-wind') ? tx('.gps-wind-tag') : null,
           windRead: vis('.gps-wind-sheet') ? tx('.gps-ws-read') : null, windState: vis('.gps-wind-sheet') ? tx('.gps-ws-state') : null,
           windSlider: q('.gps-ws-slider') ? q('.gps-ws-slider').value : null, windSheetBox: box(q('.gps-wind-sheet')),
           windGreenBox: box(q('.gps-dial-green')), windDialBox: box(q('.gps-dial')),
           pillStyle: (function () { var p = q('.gps-pill-to'); if (!p) return null; var c = getComputedStyle(p); return { bg: c.backgroundColor, color: c.color, size: parseFloat(c.fontSize), weight: c.fontWeight, shadow: c.textShadow !== 'none' }; })(),
           ringStyle: (function () { var r = q('.gps-ring'); if (!r) return null; var c = getComputedStyle(r), b = getComputedStyle(r, '::before'); return { color: c.borderTopColor, width: parseFloat(c.borderTopWidth), cross: b.content !== 'none' && b.content !== 'normal' }; })(),
           set: avail('.gps-set-green'), fix: avail('.gps-fix-green'), undo: avail('.gps-undo-green'),
           target: rect('.gps-target'), centerPin: rect('.gps-pin-mid'), dot: rect('.gps-dot'), teePin: rect('.gps-pin-tee'),
           from: vis('.gps-from') ? t('.gps-from') : '', recenter: vis('.gps-recenter'),
           bearing: ds.bearing == null ? null : Number(ds.bearing), zoom: ds.zoom == null ? null : Number(ds.zoom),
           maxZoom: ds.maxZoom == null ? null : Number(ds.maxZoom), esri: ds.esri || null, esriLoads: Number(ds.esriLoads || 0),
           big: big, vw: innerWidth,
           attribution: attr ? (attr.innerText || '').trim() : null,
           attributionOnScreen: !!(ar && ar.width > 0 && ar.height > 0 && ar.bottom <= innerHeight && ar.top >= 0),
           creditLine: cr && cr.offsetParent !== null ? (cr.innerText || '').replace(/\\s+/g, ' ').trim() : null,
           creditPop: vis('.gps-credit-pop') ? (q('.gps-credit-pop').innerText || '').replace(/\\s+/g, ' ').trim() : null,
           creditBg: cr ? getComputedStyle(cr).backgroundColor : null,
           google: ds.google || null, googleLoads: Number(ds.googleLoads || 0), googleSrcMax: ds.googleSrcMax ? Number(ds.googleSrcMax) : null, usgsVis: ds.usgsVis || null,
           googleLogo: (function () { var l = q('.gps-google-logo'); if (!l || l.offsetParent === null) return null; var b = l.getBoundingClientRect(); return { h: Math.round(b.height), alt: l.alt, svg: l.src.indexOf('data:image/svg+xml;base64,') === 0, l: Math.round(b.left), t: Math.round(b.top), b: Math.round(b.bottom) }; })(),
           tilesLoaded: Number(ds.tilesLoaded || 0),
           // BUILD 5: the magnifier carries its step in data-zoom ("1x" hole view, "2x").
           zoomBtn: vis('.gps-zoom') ? q('.gps-zoom').getAttribute('data-zoom') : null,
           pills: o ? [].slice.call(o.querySelectorAll('.gps-pill')).map(function (e) { return { k: e.classList.contains('gps-pill-to') ? 'to' : 'on', text: (e.innerText || '').trim(), at: e.getAttribute('data-at'), size: parseFloat(getComputedStyle(e).fontSize), box: e.style.visibility === 'hidden' ? null : box(e) }; }) : [],
           ringPx: q('.gps-target') ? Number(q('.gps-target').dataset.ringPx) : null,
           // textContent: since build 6 the label may step aside (visibility hidden) for a number.
           ringLbl: q('.gps-ring-lbl') ? (q('.gps-ring-lbl').textContent || '').trim() : null,
           ringIn: box(q('.gps-ring-in')), ringDot: box(q('.gps-ring-dot')), ringLine: (function () { var l = q('.gps-ring-line'), t = q('.gps-target'); return l && l.offsetParent !== null ? { w: parseFloat(l.style.width), deg: t ? Number(t.getAttribute('data-line-deg')) : null } : null; })(),
           sideNote: (function () { var n = document.querySelector('#gps-side-toggle .gps-side-note'); return n && n.style.display !== 'none' ? n.textContent : null; })(),
           boxes: { target: box(q('.gps-target')), ringLbl: box(q('.gps-ring-lbl')), from: box(q('.gps-from')), attrib: box(cr), map: box(mapEl),
                    top: box(q('.gps-top')), sub: box(q('.gps-sub')), right: box(q('.gps-right')), recenterB: box(q('.gps-recenter')), toPill: box(q('.gps-target-row')), bottom: box(q('.gps-bottom')),
                    back: box(q('.gps-pin-back')), front: box(q('.gps-pin-front')), mid: box(q('.gps-pin-mid')), tee: box(q('.gps-pin-tee')), dot: box(q('.gps-dot')) },
           teePx: ds.teePx ? ds.teePx.split(',').map(Number) : null,
           arcs: ds.arcs == null ? null : ds.arcs, arcStep: ds.arcStep == null ? null : Number(ds.arcStep),
           arcLabels: o ? [].slice.call(o.querySelectorAll('.gps-arc-lbl')).filter(function (e) { return e.style.display !== 'none' && e.style.visibility !== 'hidden'; }).map(function (e) { return { text: e.innerText.trim(), box: box(e) }; }) : [],
           midLbl: t('.gps-lbl-mid'), editPinEl: !!q('.gps-edit-pin') || !!q('.gps-flag') || !!q('.gps-pin-save'),
           gpsSet: vis('.gps-gps-set') ? { text: t('.gps-gps-set'), disabled: q('.gps-gps-set').disabled } : null, tapFallback: vis('.gps-tap-fallback'),
           addEdges: vis('.gps-addedges'), saveGreen: vis('.gps-save'),
           score: vis('.gps-score') ? t('.gps-score') : null, scoreBox: box(q('.gps-score')),
           bannerBox: box(q('.gps-banner')), zoomBox: box(q('.gps-zoom')), recenterBox: box(q('.gps-recenter')),
           wind: vis('.gps-wind') ? t('.gps-wind') : null, windBox: box(q('.gps-wind')), windRot: q('.gps-wind') ? q('.gps-wind').getAttribute('data-rot') : null,
           active: document.activeElement ? { cls: document.activeElement.className, hole: document.activeElement.getAttribute('data-hole') } : null,
           greenBox: ds.greenBox ? ds.greenBox.split(',').map(Number) : null,
           map: !!(o && o.querySelector('.maplibregl-canvas')),
           watches: window.__geo ? Object.keys(window.__geo.active).length : -1,
           watchCalls: window.__geo ? window.__geo.watch : -1,
           highAccuracy: !!(window.__geo && window.__geo.opts && window.__geo.opts.enableHighAccuracy),
           cardHole: card ? card.innerText.trim() : null,
           scrollY: Math.round(window.scrollY),
           scoreInputs: document.querySelectorAll('.score-input').length,
           usgsCached: window.__usgsN == null ? null : window.__usgsN,
           errs: (window.__errs || []).slice(0, 5), coursesLoaded: !!window.HardPanGpsCourses, ready: ds.ready || null,
           // Wave 2
           esriWhy: ds.esriWhy || '', esriFailAt: ds.esriFailAt ? Number(ds.esriFailAt) : null, esriSrcMax: ds.esriSrcMax ? Number(ds.esriSrcMax) : null,
           attribHtml: attr ? attr.innerHTML : null, tilesNoteShown: vis('.gps-tiles-note'),
           plays: q('.gps-plays') && q('.gps-plays').style.visibility !== 'hidden' && vis('.gps-plays') ? t('.gps-plays') : null,
           playsTerms: q('.gps-plays') ? q('.gps-plays').getAttribute('data-terms') : null,
           basicMode: !!(o && o.classList.contains('gps-basic-mode')), mapWrapShown: vis('.gps-map-wrap'),
           sheet: vis('.gps-sheet') ? (q('.gps-sheet').innerText || '').replace(/\\s+/g, ' ').trim() : null,
           sheetBuyDisabled: q('.gps-sheet-buy') ? q('.gps-sheet-buy').disabled : null,
           basicScore: vis('.gps-score-basic') ? t('.gps-score-basic') : null, getPro: vis('.gps-get-pro'),
           targetRow: vis('.gps-target-row'),
           holeMeta: t('.gps-meta'), holeNum: t('.gps-hole-num'), picker: vis('.gps-picker') ? o.querySelectorAll('.gps-picker-grid button').length : 0, tools: vis('.gps-tools-menu'),
           mapCenter: ds.center ? ds.center.split(',').map(Number) : null, bounds: ds.bounds ? ds.bounds.split(',').map(Number) : null, minZoom: ds.minZoom == null ? null : Number(ds.minZoom),
           scoreboxBox: box(q('.gps-scorebox')), cardBtn: vis('.gps-side-bets'), back: vis('.gps-back'),
           view: ds.view || null, greenBtn: vis('.gps-green-view') ? t('.gps-green-view') : null, greenDims: vis('.gps-green-dims') ? t('.gps-green-dims') : null,
           greenLbls: o ? [].slice.call(o.querySelectorAll('.gps-green-lbl')).filter(function (e) { return e.style.display !== 'none' && e.offsetParent !== null; }).map(function (e) { return { k: e.className.replace(/.*gps-green-lbl-/, ''), text: e.innerText.trim(), box: box(e) }; }) : [],
           hasPro: window.HardPanGps && window.HardPanGps.hasGpsPro ? window.HardPanGps.hasGpsPro() : null,
           tier: (function () { try { return localStorage.getItem('hardpan_gps_tier'); } catch (e) { return 'err'; } })() };
})())`;
const DUMP = `JSON.stringify({ writes: window.__coldWrites || [], storage: (function () { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; })() })`;
const COUNT_USGS = `(window.__usgsN = null, (typeof caches === 'undefined' ? (window.__usgsN = -1) : caches.open('hardpan-usgs-v1').then(function (c) { return c.keys(); }).then(function (k) { window.__usgsN = k.length; }, function () { window.__usgsN = -2; })), 'counting')`;

// THE MAP HAS LOADED: MapLibre reports its camera on the map element once its
// style is up and the hole is framed. Waited for, not slept on.
// Loaded, framed and drawn (gps-view sets data-ready at the end of its load
// handler). data-zoom alone came too early under load: tile data sets it first.
// ... and FRAMED: the course data in and the map off its world view (a loaded
// machine read the world view, tee at x -255, before the course data arrived -
// the page re-frames then, as it should; the check had read too soon).
const WAIT_MAP = { waitFor: `(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && m.dataset.zoom != null && window.HardPanGpsCourses && Number(m.dataset.zoom) > 3); })()`, timeout: 45000 };
const mapTap = (x, y) => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } } },
                          { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } } },
                          { sleep: 400 }];

async function arm(name, key, ownerUid, mode, me, acc, steps, extra) {
    const code = 'GPS' + name.toUpperCase().slice(0, 5);
    // Progress on stderr (stdout is the JSON result), so a hang names its arm.
    process.stderr.write('arm ' + name + ' ' + new Date().toISOString().slice(11, 19) + '\n');
    // No check reaches a real outside service: not the weather service, not the
    // elevation service, not Esri. The arms that need one bring a stand-in.
    extra = Object.assign({}, extra || {});
    extra.blockUrls = (extra.blockUrls || []).concat(['*api.weather.gov*', '*epqs.nationalmap.gov*', '*arcgis.com*', '*arcgisonline.com*', '*googleapis.com*']);
    const query = extra.query || '';
    delete extra.query;
    const res = await arriveCold(Object.assign({
        url: fileUrl('index.html', 'game=' + code + '&group=1' + query),
        rounds: { [code]: round(key, ownerUid) },
        viewport: { width: 390, height: 844 },
        // WAVE 2: by default Esri has a key and REFUSES it (403) - what localhost
        // and any host the key does not list get. Every default arm is therefore
        // also a fallback check: USGS within 4 tiles, never a blank map.
        preScript: sensor(mode, me[0], me[1], acc) + CFG({ esri: 'DENY' }),
        settleMs: 3000, steps: steps.concat([{ expression: DUMP }]),
        // MapLibre draws with WebGL; the harness's software renderer provides it.
        webgl: true,
    }, extra || {}));
    if (!res.ok) return { name, ok: false, reason: res.reason };
    const vals = res.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    const dump = vals.pop();
    return { name, ok: true, reads: vals, dump, requests: res.requests || [], raw: res.value, code };
}

function leaks(r, me) {
    const needles = [me[0].toFixed(4), me[1].toFixed(4)];
    const hay = [];
    // Wave 2: an elevation request or cache entry names ONE point. On a hole that
    // runs east-west a course point shares the golfer's latitude to 4 decimals
    // (measured: 33.4501, 50 % along Caledonia #1) - the point decides, not one
    // coordinate. Within 3 m of the golfer it IS a leak; the plays arm also checks
    // every elevation point against the course's own list.
    const elevAt = (h) => { const m = /epqs\?x=(-?[\d.]+)&y=(-?[\d.]+)/.exec(h) || /hardpan_elev_v1_(-?[\d.]+),(-?[\d.]+)/.exec(h); if (!m) return null; return /epqs/.test(h) ? [+m[2], +m[1]] : [+m[1], +m[2]]; };
    const elevNotMe = (h) => { const p = elevAt(h); return !!p && inlineHaversineM(p, me) >= 3; };
    r.dump.writes.forEach((w) => hay.push('write ' + w.path + ' ' + JSON.stringify(w.value)));
    r.requests.forEach((q) => hay.push('request ' + urlOf(q)));
    Object.keys(r.dump.storage).forEach((k) => hay.push('storage ' + k + ' ' + r.dump.storage[k]));
    return hay.filter((h) => needles.some((n) => h.indexOf(n) !== -1) && !elevNotMe(h));
}
// The harness records each request as its URL string.
const urlOf = (q) => String((q && q.url) || q || '');
const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => (a && b) ? Math.round(Math.hypot(a.x - b.x, a.y - b.y)) : -1;
// ---- the polish of 2026-10-07: pills, ring, zoom, no pull, the tee in view ----
const hitBox = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
const greenPage = (g) => (g.greenBox && g.boxes.map) ? { l: g.greenBox[0] + g.boxes.map.l, t: g.greenBox[1] + g.boxes.map.t, r: g.greenBox[2] + g.boxes.map.l, b: g.greenBox[3] + g.boxes.map.t } : null;
const mid = (b) => b ? { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 } : null;
const lastNum = (t) => { const m = /(\d+|—)$/.exec(t || ''); return m ? m[1] : null; };
function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
    return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
}
// Pills: the right numbers, ON their lines, covering nothing that matters.
function pillFails(tag, g, required) {
    // BUILD 7: each number sits ON ITS OWN LINE - "to target" on the you / tee ->
    // circle line, "what's left" on the circle -> green-center line - at 44 px, or
    // shrunk to 38 / 32 px before it slides along the line; never off its line,
    // never over the ring, F / C / B or a panel.
    const f = [];
    const from = mid(g.boxes.dot || g.boxes.tee), tc = mid(g.boxes.target), ctr = mid(g.boxes.mid), R = (g.ringPx || 0) / 2;
    const want = { to: lastNum(g.toHere), on: lastNum(g.hereCenter) };
    const ends = { to: [from, tc], on: [tc, ctr] };
    g.pills.forEach((p) => {
        if (!p.box) { if (required && !(p.k === 'on' && want.on === '0')) f.push(`${tag}: the ${p.k === 'to' ? 'to-target' : 'what\'s-left'} number is not shown`); return; }
        if (p.text !== want[p.k]) f.push(`${tag}: ${p.k} number says "${p.text}", the readout says "${want[p.k]}"`);
        if (!(p.size >= 32)) f.push(`${tag}: the ${p.k} number is ${p.size}px (32 at the least)`);
        if (!/^line/.test(p.at || '')) f.push(`${tag}: the ${p.k} number is placed "${p.at}", not on its line`);
        const [a, b] = ends[p.k];
        if (a && b) { const d = segDist(mid(p.box), a, b); if (d > 4) f.push(`${tag}: the ${p.k} number is ${Math.round(d)}px off its line`); }
        if (tc && p.at === 'line') {
            const nx = Math.max(p.box.l, Math.min(tc.x, p.box.r)), ny = Math.max(p.box.t, Math.min(tc.y, p.box.b));
            if (Math.hypot(nx - tc.x, ny - tc.y) < R - 1) f.push(`${tag}: the ${p.k} number covers the circle`);
        }
        const bad = p.at === 'line' ? ['ringLbl', 'back', 'front', 'mid', 'tee', 'dot', 'from', 'attrib', 'top', 'right', 'recenterB', 'bottom'].filter((k) => hitBox(p.box, g.boxes[k])) : [];
        if (g.boxes.top && p.box.t < g.boxes.top.b) bad.push('the status bar / top panel area');
        if (g.boxes.bottom && p.box.b > g.boxes.bottom.t) bad.push('the bottom row area');
        if (bad.length) f.push(`${tag}: the ${p.k} number covers ${bad.join(', ')}: ` + JSON.stringify(p.box));
    });
    if (hitBox(g.pills[0] && g.pills[0].box, g.pills[1] && g.pills[1].box)) f.push(tag + ': the two numbers overlap');
    return f;
}
// BUILD 5 TARGET: two rings ~4 px apart (outer = 20 yds), one line straight across
// (the same 20 yds), square to the shot - in the hole view the shot runs up the
// screen, so the line is level - and "20 yd" at one end of it, off the rings.
function targetFails(tag, g, level) {
    const f = [], tc = mid(g.boxes.target), R = (g.ringPx || 0) / 2;
    if (!tc || !g.ringPx) return [tag + ': no target'];
    if (g.ringPx >= 20) {
        if (!g.ringIn) f.push(tag + ': no inner ring');
        else { const ri = (g.ringIn.r - g.ringIn.l) / 2, gap = R - ri; if (gap < 3 || gap > 8) f.push(`${tag}: rings ${gap.toFixed(1)} px apart (want about 4-6)`); }
    }
    if (!g.ringLine || Math.abs(g.ringLine.w - g.ringPx) > 1) f.push(tag + ': the width line is not the circle\'s width: ' + JSON.stringify([g.ringLine, g.ringPx]));
    // BUILD 7: the center dot, at the exact center, about F / C / B size.
    { const d = g.ringDot, dm = mid(d); if (!d || !dm || Math.hypot(dm.x - tc.x, dm.y - tc.y) > 1.5 || (d.r - d.l) < 12 || (d.r - d.l) > 18) f.push(tag + ': no center dot at the target\'s center: ' + JSON.stringify(d)); }
    if (level && g.ringLine && Math.abs(g.ringLine.deg) > 12) f.push(`${tag}: the width line is not square to the shot (${g.ringLine.deg} deg)`);
    const lb = g.boxes.ringLbl;
    if (!lb || !/^(20 yd|18 m)$/.test(g.ringLbl || '')) f.push(tag + ': no "20 yd" label: ' + JSON.stringify([g.ringLbl, lb]));
    else { const nx = Math.max(lb.l, Math.min(tc.x, lb.r)), ny = Math.max(lb.t, Math.min(tc.y, lb.b)); if (Math.hypot(nx - tc.x, ny - tc.y) < R) f.push(tag + ': the "20 yd" label sits on the ring'); }
    return f;
}
// Wave 1 arcs: the right set, a label for (nearly) every one, each label at the
// LEFT end of its arc - left of the line of play - and covering nothing.
// SPACING: 25 / 50 / 100 yds, the first that is at least 26 px on screen -
// worked out here from the zoom and the latitude (a borderline 26 px may go either way).
function arcStepRule(lat, zoom) {
    const ppy = ringPxAt(lat, zoom) / RING_YD;
    return { step: [25, 50, 100].find((st) => st * ppy >= 26) || 100, edge: [25, 50, 100].some((st) => Math.abs(st * ppy - 26) < 1) };
}
function arcFails(tag, g) {
    // BUILD 3 (clean as Golfshot): no yardage arcs and no arc labels, at any zoom.
    const f = [];
    if (g.arcs) f.push(`${tag}: yardage arcs are back: "${g.arcs}"`);
    if (g.arcLabels.length) f.push(`${tag}: ${g.arcLabels.length} arc labels shown`);
    // ... nor the accuracy / source bar, nor the bottom "Tee -> target" pill.
    if (g.subShown) f.push(`${tag}: the accuracy / source bar is on the map`);
    if (g.targetRowShown) f.push(`${tag}: the target readout pill is on the map`);
    // The numbers: big, bold, white, outlined, no box. The circle: thin, white, no crosshair.
    const ps = g.pillStyle, rs = g.ringStyle;
    if (ps && (!/rgba\(0, 0, 0, 0\)|transparent/.test(ps.bg) || ps.color !== 'rgb(255, 255, 255)' || ps.size < 22 || Number(ps.weight) < 800 || !ps.shadow)) f.push(`${tag}: the line numbers are not big bold white on no box: ` + JSON.stringify(ps));
    if (rs && (rs.color !== 'rgb(255, 255, 255)' || rs.width > 2 || rs.cross)) f.push(`${tag}: the target is not a thin white circle: ` + JSON.stringify(rs));
    return f;
}
// The tee AND the back of the green fully on screen, the tee clear of the attribution bar.
function teeInView(tag, g) {
    const f = [], m = g.boxes.map, at = g.boxes.attrib;
    if (!m || !at || !g.teePx) return [tag + ': cannot read the frame: ' + JSON.stringify([m, at, g.teePx])];
    const teeY = m.t + g.teePx[1];
    if (teeY + 8 > at.t - 8) f.push(`${tag}: the tee (y ${teeY}) is not clear above the attribution bar (top ${at.t})`);
    // Redesign: above the Recenter row and the bottom row, which float over the map.
    [['Recenter', g.boxes.recenterB], ['bottom row', g.boxes.bottom], ['score button', g.scoreBox]].forEach(([n, b]) => { if (b && teeY + 8 > b.t - 4) f.push(`${tag}: the tee (y ${teeY}) is under the ${n} (top ${b.t})`); });
    if (g.teePx[0] < 8 || g.teePx[0] > m.r - m.l - 8) f.push(`${tag}: the tee is off the side of the map (x ${g.teePx[0]})`);
    const gb = greenPage(g);
    // ... and the back of the green below the top panel and the line under it.
    const under = Math.max(m.t, g.boxes.top ? g.boxes.top.b : 0, g.boxes.sub ? g.boxes.sub.b : 0);
    if (!gb || gb.t < under + 2 || (g.boxes.back && g.boxes.back.t < under)) f.push(`${tag}: the back of the green is cut off (under the top panel at ${under}): ` + JSON.stringify([gb, g.boxes.back]));
    return f;
}
// THE RING IS 20 YARDS ACROSS ON THE GROUND, inline: 512px tiles, metres per px.
const RING_YD = 20;
const ringPxAt = (lat, zoom) => 2 * Math.round(RING_YD / 2 * 0.9144 / (40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * 2 ** zoom)) * 1e3) / 1e3;
const PULL = (where) => `(function () { var t = ${where}; var e = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); t.dispatchEvent(e);
  var m = document.querySelector('#gps-overlay .gps-map');
  return JSON.stringify({ pull: e.defaultPrevented, lock: document.documentElement.classList.contains('gps-lock'),
    ob: getComputedStyle(document.documentElement).overscrollBehaviorY, bodyOb: getComputedStyle(document.body).overscrollBehaviorY,
    mapTA: m ? getComputedStyle(m).touchAction : null, scrollY: Math.round(scrollY) }); })()`;
// A tap 22px below the front pin: on the map, through MapLibre's own events.
const TAP_SHORT_OF_GREEN = `(function () { var fp = document.querySelector('#gps-overlay .gps-pin-front'); if (!fp) return 'no front pin'; var f = fp.getBoundingClientRect();
  var c = document.querySelector('#gps-overlay .maplibregl-canvas'), x = f.left + f.width / 2, y = f.bottom + 22;
  ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); });
  return 'tapped'; })()`;
const touch = (type, pts) => ({ cdp: { method: 'Input.dispatchTouchEvent', params: { type, touchPoints: pts } } });
// An arm that could not run stops the check. What already failed is printed with
// it, and makes the exit 1 (a guarantee broke) rather than 2 (could not run): a
// broken build often breaks an arm's steps too (Wave 2: hasGpsPro() wrongly false
// -> no map -> later arms have nothing to tap), and the earlier failure is the news.
let FAILS_SO_FAR = [];
const bail = (out, r) => { if (!r.ok) { console.log(JSON.stringify({ arm: r.name, reason: r.reason, failsSoFar: FAILS_SO_FAR }, null, 1)); process.exit(FAILS_SO_FAR.length ? 1 : 2); } };

// ---- ONE STAND-IN FOR THE OUTSIDE SERVICES (Wave 2) --------------------------
// On 127.0.0.1, with CORS like the real ones:
//   /esri/<TOKEN>/tile/z/y/x   Esri World Imagery. TOKEN OK* answers a tile; DENY*
//                              answers 403 (a host the key does not list); a token
//                              switched by /ctl/break/<TOKEN> answers 403 from then on
//                              (the free tier used up mid-round, the key expired).
//   /epqs?x=&y=                USGS EPQS: heights for known course points, else
//                              the service's "no data" (-1000000).
//   /points/.., /gridpoints/.., /stations/..  the National Weather Service: the
//                              point, its stations, the latest observation, the
//                              hourly forecast (build 7). /__nws/<mode> switches it.
const SEEN = { esri: {}, epqs: [], nws: [], gSession: [], gTiles: {}, gVp: [], overpass: [] };
const NWS = { mode: 'ok' };
// BUILD 5 stand-in Overpass: "the golf courses near here" answers one course named
// "Camas Meadows Golf Club" (and one that is not ours); its holes and greens are Caledonia's saved extract
// (the geometry the logic is checked on - the name is only what the lookup picks by).
const OSM_CAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gps-osm', 'caledonia.json'), 'utf8'));
const BROKEN = new Set();
const ELEV = {};                     // "lat,lng" (5 dp) -> feet
const TILEPNG = fs.readFileSync(path.join(__dirname, '..', 'icon-192.png'));
let SRV = null, SO = '';
function startStandIn() {
    return new Promise((res) => {
        SRV = require('http').createServer((q, r) => {
            const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
            if (q.method === 'OPTIONS') { r.writeHead(204, h); return r.end(); }
            let m = /^\/esri\/([A-Za-z0-9-]+)\/tile\/(\d+)\/(\d+)\/(\d+)/.exec(q.url);
            if (m) {
                (SEEN.esri[m[1]] = SEEN.esri[m[1]] || []).push(+m[2]);
                if (/^DENY/.test(m[1]) || BROKEN.has(m[1])) { r.writeHead(403, Object.assign({ 'Content-Type': 'application/json' }, h)); return r.end('{"error":{"code":403,"message":"Invalid token"}}'); }
                r.writeHead(200, Object.assign({ 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }, h)); return r.end(TILEPNG);
            }
            if (/^\/overpass/.test(q.url) && q.method === 'POST') {
                let body = ''; q.on('data', (c) => { body += c; }); q.on('end', () => {
                    const query = decodeURIComponent(body.replace(/^data=/, '').replace(/\+/g, ' '));
                    SEEN.overpass.push(query);
                    r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, h));
                    if (/leisure"="golf_course/.test(query)) return r.end(JSON.stringify({ elements: [
                        { type: 'way', id: 4242, tags: { leisure: 'golf_course', name: 'Fircrest Golf Club' }, center: { lat: 47.23, lon: -122.51 } },
                        { type: 'way', id: 4343, tags: { leisure: 'golf_course', name: 'Camas Meadows Golf Club' }, center: { lat: 47.2, lon: -122.57 } }] }));
                    if (/way\(4343\)/.test(query)) return r.end(JSON.stringify({ osm3s: { timestamp_osm_base: '2026-10-09T00:00:00Z' }, elements: OSM_CAL.elements }));
                    return r.end(JSON.stringify({ elements: [] }));
                });
                return;
            }
            if ((m = /^\/ctl\/break\/([A-Za-z0-9-]+)/.exec(q.url))) { BROKEN.add(m[1]); r.writeHead(200, h); return r.end('broken'); }
            // GOOGLE MAP TILES API stand-in: a session, 2D tiles, the viewport's copyright.
            if (/^\/v1\/createSession\?key=/.test(q.url)) {
                let body = ''; q.on('data', (c) => { body += c; }); q.on('end', () => {
                    SEEN.gSession.push({ url: q.url, body });
                    r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, h));
                    r.end(JSON.stringify({ session: 'SESSION-STANDIN', expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400), tileWidth: 256, tileHeight: 256, imageFormat: 'jpeg' }));
                });
                return;
            }
            if ((m = /^\/v1\/2dtiles\/(\d+)\/(\d+)\/(\d+)\?session=([^&]+)&key=([^&]+)/.exec(q.url))) {
                (SEEN.gTiles[m[5]] = SEEN.gTiles[m[5]] || []).push(+m[1]);
                r.writeHead(200, Object.assign({ 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }, h)); return r.end(TILEPNG);
            }
            if (/^\/tile\/v1\/viewport\?/.test(q.url)) {
                SEEN.gVp.push(q.url);
                r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, h));
                return r.end(JSON.stringify({ copyright: 'Imagery ©2026 Stand-in Google', maxZoomRects: [] }));
            }
            if (/^\/epqs\?/.test(q.url)) {
                SEEN.epqs.push(q.url);
                const u = new URL(q.url, 'http://x');
                const k = (+u.searchParams.get('y')).toFixed(5) + ',' + (+u.searchParams.get('x')).toFixed(5);
                r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, h));
                return r.end(JSON.stringify({ location: { x: +u.searchParams.get('x'), y: +u.searchParams.get('y') }, value: k in ELEV ? ELEV[k] : -1000000 }));
            }
            // The page can switch the stand-in mid-arm: /__nws/ok | stale | down | outside.
            if (/^\/__mark\/\w+$/.test(q.url)) { SEEN.nws.push(q.url); r.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, h)); return r.end('ok'); }
            const ctl = /^\/__nws\/(ok|stale|down|outside)$/.exec(q.url);
            if (ctl) { NWS.mode = ctl[1]; r.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, h)); return r.end(NWS.mode); }
            SEEN.nws.push(q.url);
            const hj = Object.assign({ 'Content-Type': 'application/geo+json' }, h);
            if (NWS.mode === 'down') { r.writeHead(503, h); return r.end(); }
            if (/^\/points\/-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(q.url)) {
                // Outside the US NWS answers 404 for the point.
                if (NWS.mode === 'outside') { r.writeHead(404, hj); return r.end(JSON.stringify({ title: 'Data Unavailable For Requested Point' })); }
                r.writeHead(200, hj); return r.end(JSON.stringify({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/XXX/1,2/forecast/hourly', observationStations: 'https://api.weather.gov/gridpoints/XXX/1,2/stations' } }));
            }
            if (q.url === '/gridpoints/XXX/1,2/stations') { r.writeHead(200, hj); return r.end(JSON.stringify({ features: [{ id: 'https://api.weather.gov/stations/KXXX', properties: { stationIdentifier: 'KXXX' } }, { id: 'https://api.weather.gov/stations/KYYY' }] })); }
            // The LATEST OBSERVATION: from the NW, 19.3 km/h (12 mph) gusting 32.2 (20).
            // 'stale': three hours old, so the hourly forecast is the backup.
            if (q.url === '/stations/KXXX/observations/latest') {
                r.writeHead(200, hj);
                return r.end(JSON.stringify({ properties: { timestamp: new Date(Date.now() - (NWS.mode === 'stale' ? 180 : 20) * 60000).toISOString(),
                    windDirection: { unitCode: 'wmoUnit:degree_(angle)', value: 315 }, windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 19.3 },
                    windGust: { unitCode: 'wmoUnit:km_h-1', value: 32.2 }, temperature: { unitCode: 'wmoUnit:degC', value: 16.1111 } } }));
            }
            if (q.url === '/gridpoints/XXX/1,2/forecast/hourly') { r.writeHead(200, hj); return r.end(JSON.stringify({ properties: { periods: [{ windSpeed: '5 to 12 mph', windDirection: 'NW', temperature: 61, temperatureUnit: 'F' }] } })); }
            r.writeHead(404, h); r.end();
        });
        SRV.listen(0, '127.0.0.1', () => { SO = 'http://127.0.0.1:' + SRV.address().port; res(); });
    });
}
// The page's HARDPAN_GPS_CONFIG, replaced (gps-config.js's own assignment is
// ignored): esri = a token (or null for no key), nws / epqs = use the stand-in.
function CFG(o) {
    const c = {};
    if (o.esri) { c.esriKey = 'CHECK'; c.esriTileUrl = SO + '/esri/' + o.esri + '/tile/{z}/{y}/{x}?token={key}'; }
    if (o.nws) c.nwsBase = SO;
    if (o.epqs) c.epqsUrl = SO + '/epqs?x={lng}&y={lat}&wkid=4326&units=Feet&includeDate=false';
    if (o.paywall != null) c.paywall = o.paywall;
    if (o.overpass) c.overpassUrl = SO + '/overpass';
    if (o.google) { c.googleKey = o.google; c.googleBase = SO; c.imagery = 'esri'; c.imageryPro = 'google'; }
    return `Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return ${JSON.stringify(c)}; }, set: function () {} });`;
}
const ESRI_CREDIT = 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> | Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
const ESRI_CREDIT_TEXT = 'Powered by Esri | Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
// Esri refused or failed: USGS is the picture - its credit, z18, and tiles drawn.
function usgsFallbackFails(tag, g, why) {
    const f = [];
    if (g.esri !== 'failed' || (why && g.esriWhy !== why)) f.push(`${tag}: Esri did not hand over to USGS: ` + JSON.stringify([g.esri, g.esriWhy]));
    if (why === 'errors' && g.esriFailAt !== 4) f.push(`${tag}: fell back after ${g.esriFailAt} Esri errors in a row (expected 4)`);
    if (/Powered by Esri/.test(g.attribution || '') || !/USDA, USGS The National Map: Orthoimagery/.test(g.attribution || '')) f.push(`${tag}: attribution after the fallback: ` + g.attribution);
    if (g.maxZoom !== 18) f.push(`${tag}: max zoom ${g.maxZoom} after the fallback (USGS: 18)`);
    if (!(g.tilesLoaded > 0) || g.tilesNoteShown) f.push(`${tag}: a blank map after the fallback: ` + JSON.stringify([g.tilesLoaded, g.tilesNoteShown]));
    return f;
}

(async () => {
    const fails = FAILS_SO_FAR;
    const out = {};
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-check-profile-'));
    await startStandIn();

    // ---- osm -----------------------------------------------------------------
    const a = await arm('osm', 'caledonia', null, 'ok', ME, 4.6, [
        { expression: READ },                                                   // 0 arrival: Bets
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },        // 1 GPS
        { drag: '.gps-target', dx: 70, dy: -40 }, { sleep: 400 }, { expression: READ },   // 2 target dragged
        { drag: '.gps-map', at: { fx: 0.15, fy: 0.6 }, dx: -50, dy: -30 }, { sleep: 500 }, { expression: READ }, // 3 map panned
        { tap: '.gps-recenter' }, { sleep: 500 }, { expression: READ },         // R recenter
        ...mapTap(120, 260), { expression: READ },                              // 4 tap: jump
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 }, { expression: READ },            // 5 meters
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 },
        { tap: '.gps-next' }, { sleep: 800 }, { expression: READ },             // 6 GPS Next -> hole 2
        { tap: '.gps-side-bets' }, { sleep: 500 }, { expression: READ },        // 7 Bets on hole 2
        { tap: '.hole-view-nav-row .hole-view-nav-btn', nth: 1 }, { sleep: 800 }, { expression: READ }, // 8 card Next -> 3
        { expression: 'window.scrollTo(0, 120)' }, { sleep: 300 }, { expression: READ },   // 9 card scrolled
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },         // 10 GPS on hole 3
        ...mapTap(140, 280), { expression: READ },                              // 11 target moved on hole 3
        { tap: '.gps-side-bets' }, { sleep: 400 }, { expression: READ },        // 12 back on Bets: scroll kept
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },         // 13 GPS again: target kept
        { expression: 'window.__setVis("hidden")' }, { sleep: 200 }, { expression: READ },  // 14 background
        { expression: 'window.__setVis("visible")' }, { sleep: 400 }, { expression: READ }, // 15 foreground on GPS
        { expression: 'location.reload()' }, { sleep: 4000 }, { expression: READ },         // 16 reload: GPS remembered
    ]);
    out.osm = a; bail(out, a);
    {
        const R = a.reads;
        const [arrive, gps, dragged, panned, recentered, jumped, meters, gpsNext, betsH2, cardNext, scrolled, gpsH3, movedH3, betsBack, gpsBack, hidden, shown, reloaded] = R;
        if (R.length !== 18) fails.push('osm: ' + R.length + ' reads, expected 18 - a step did not run: ' + JSON.stringify(a.raw.filter((v) => /no element/.test(String(v)))));
        // TEE AT THE BOTTOM, GREEN AT THE TOP: the map turned to the hole's own
        // bearing (Caledonia #1 plays 102 degrees), the green's center straight
        // above the golfer, who stands on the tee -> green line.
        if (gps.bearing !== 102) fails.push('osm: the map is not turned to the hole: bearing ' + gps.bearing);
        if (!gps.centerPin || !gps.dot || !(gps.centerPin.y < gps.dot.y) || Math.abs(gps.centerPin.x - gps.dot.x) > 3) fails.push('osm: green not straight above the golfer: ' + JSON.stringify([gps.centerPin, gps.dot]));
        if (!gps.recenter) fails.push('osm: no Recenter button');
        if (dist(recentered.centerPin, gps.centerPin) > 3) fails.push('osm: Recenter did not restore the hole view: ' + JSON.stringify([gps.centerPin, panned.centerPin, recentered.centerPin]));
        // Esri refused (403, as on localhost): USGS within 4 tiles, never blank.
        fails.push(...usgsFallbackFails('osm (Esri refused)', gps, 'errors'));
        fails.push(...teeInView('osm', gps), ...pillFails('osm', gps, true));
        if (gps.zoomBtn !== '1x') fails.push('osm: zoom button reads ' + gps.zoomBtn);
        fails.push(...arcFails('osm', gps));
        if (!/±6 yds/.test(gps.popInfo || '') && gps.popInfo !== null) fails.push('osm: the credits popup info line: ' + gps.popInfo);
        if (gps.score !== 'Hole 1 · Enter Score') fails.push('osm: score button reads ' + gps.score);
        // Redesign: on the card, ONE "📍 GPS" button; on the map, the Card button back.
        if (!arrive.toggle || !/📍 GPS/.test(arrive.toggle) || !arrive.toggleOnScreen) fails.push('osm: the GPS button is not on the card: ' + arrive.toggle);
        if (!gps.cardBtn || gps.toggleOnScreen) fails.push('osm: on the map, the Card button / no GPS pill: ' + JSON.stringify([gps.cardBtn, gps.toggleOnScreen]));
        if (arrive.side !== 'bets' || arrive.gpsShown) fails.push('osm: a fresh phone did not land on Bets');
        if (arrive.watchCalls !== 0) fails.push('osm: a location watch ran before GPS was shown');
        if (!gps.gpsShown || !gps.map || gps.side !== 'gps') fails.push('osm: GPS side did not show with a map');
        // A Pro user never sees the upgrade sheet or the link to it.
        R.forEach((g, k) => { if (g.sheet || g.getPro) fails.push(`osm read ${k}: the upgrade sheet / link shown to a Pro user: ` + JSON.stringify([g.sheet, g.getPro])); });
        // Wave 2: no override and no paywall -> HardPan GPS (Pro), the full screen.
        if (gps.hasPro !== true || gps.basicMode || gps.tier !== null) fails.push('osm: a phone with no override is not Pro: ' + JSON.stringify([gps.hasPro, gps.basicMode, gps.tier]));
        if (JSON.stringify(gps.labels) !== '["CENTER","F","B"]') fails.push('osm: labels ' + JSON.stringify(gps.labels));
        if (gps.f !== EXPECT.front || gps.m !== EXPECT.center || gps.b !== EXPECT.back) fails.push(`osm: F/C/B ${gps.f}/${gps.m}/${gps.b}, expected ${EXPECT.front}/${EXPECT.center}/${EXPECT.back}`);
        if (gps.acc !== '±6 yds') fails.push('osm: accuracy ' + gps.acc);
        if (!gps.highAccuracy || gps.watches !== 1) fails.push('osm: watch on GPS: ' + gps.watches + ' high=' + gps.highAccuracy);
        // BUILD 6: the golfer is 151 yds out - inside 280 - so the target starts ON
        // the green's center (it used to start halfway).
        if (gps.toHere !== 'You → target: ' + EXPECT.center || gps.hereCenter !== 'Target → center: 0') fails.push('osm: the target did not start on the green center (within 280): ' + gps.toHere + ' / ' + gps.hereCenter);
        if (!/USDA, USGS The National Map: Orthoimagery/.test(gps.attribution || '') || !/OpenStreetMap contributors/.test(gps.attribution || '') || !gps.attributionOnScreen) fails.push('osm: attribution ' + gps.attribution);
        // Drag the target: it moves, the map does not.
        if (dist(dragged.target, gps.target) < 60) fails.push('osm: the target did not follow the drag: ' + JSON.stringify([gps.target, dragged.target]));
        if (dist(dragged.centerPin, gps.centerPin) > 2) fails.push('osm: dragging the target panned the map by ' + dist(dragged.centerPin, gps.centerPin) + 'px');
        if (dragged.toHere === gps.toHere && dragged.hereCenter === gps.hereCenter) fails.push('osm: numbers did not update on drag');
        // Drag the map: it pans, and the target stays on its spot of ground.
        if (dist(panned.centerPin, dragged.centerPin) < 40) fails.push('osm: dragging the map did not pan it');
        if (Math.abs(dist(panned.target, dragged.target) - dist(panned.centerPin, dragged.centerPin)) > 3) fails.push('osm: the target moved relative to the ground when the map panned');
        if (panned.toHere !== dragged.toHere || panned.hereCenter !== dragged.hereCenter) fails.push('osm: panning changed the target numbers');
        // Tap: the target jumps there.
        if (dist(jumped.target, { x: 120, y: 260 }) > 3) fails.push('osm: a tap did not move the target to the tap: ' + JSON.stringify(jumped.target));
        if (meters.units !== 'Units: Meters' || meters.m !== EXPECT.centerM) fails.push(`osm: meters ${meters.m} (${meters.units})`);
        // One hole, both sides.
        if (gpsNext.title !== 'Hole 2 · Par 5') fails.push('osm: GPS Next -> ' + gpsNext.title);
        if (betsH2.cardHole !== 'Hole 2' || betsH2.gpsShown) fails.push('osm: GPS Next did not move the card: ' + betsH2.cardHole);
        if (betsH2.watches !== 1) fails.push('osm: the watch stopped at once on Bets (should run 60 s)');
        if (cardNext.cardHole !== 'Hole 3') fails.push('osm: card Next -> ' + cardNext.cardHole);
        if (gpsH3.title !== 'Hole 3 · Par 3' || !gpsH3.gpsShown) fails.push('osm: card Next did not move GPS: ' + gpsH3.title);
        // Kept across switches: the card's scroll, the target.
        if (scrolled.scrollY < 50) fails.push('osm: could not scroll the card for the scroll test (' + scrolled.scrollY + ')');
        else if (betsBack.scrollY !== scrolled.scrollY) fails.push(`osm: the card's scroll was lost: ${scrolled.scrollY} -> ${betsBack.scrollY}`);
        if (dist(movedH3.target, { x: 140, y: 280 }) > 3) fails.push('osm: hole 3 target tap missed: ' + JSON.stringify(movedH3.target));
        if (dist(gpsBack.target, movedH3.target) > 2 || gpsBack.toHere !== movedH3.toHere) fails.push('osm: the target was lost switching sides: ' + JSON.stringify([movedH3.target, gpsBack.target]));
        // Battery: background stops at once; foreground on GPS restarts.
        if (hidden.watches !== 0) fails.push('osm: background did not stop the watch (' + hidden.watches + ')');
        if (shown.watches !== 1) fails.push('osm: foreground on GPS did not restart the watch');
        // Remembered side.
        if (!reloaded || reloaded.side !== 'gps' || !reloaded.gpsShown) fails.push('osm: the last side (GPS) was not remembered across a reload');
        if (!/^gps(\|.*)?$/.test(a.dump.storage.hardpan_round_side || '')) fails.push('osm: side not stored');
        if (a.dump.writes.length) fails.push('osm: just looking wrote ' + a.dump.writes.map((w) => w.path).join(', '));
    }

    // ---- idle: 60 s on Bets, then stop ---------------------------------------
    const i = await arm('idle', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { tap: '.gps-side-bets' }, { sleep: 1000 }, { expression: READ },
        { sleep: 62000 }, { expression: READ },
        // Background and back while on Bets: location must stay off.
        { expression: 'window.__setVis("hidden")' }, { sleep: 200 }, { expression: 'window.__setVis("visible")' }, { sleep: 400 }, { expression: READ },
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
    ]);
    out.idle = i; bail(out, i);
    {
        const [at1, at61, betsFore, back] = i.reads;
        if (at1.watches !== 1) fails.push('idle: the watch stopped before 60 s');
        if (at61.watches !== 0) fails.push('idle: the watch still ran ~63 s after switching to Bets');
        if (betsFore.watches !== 0) fails.push('idle: coming back to the foreground on Bets restarted location');
        if (back.watches !== 1) fails.push('idle: showing GPS did not restart the watch');
    }

    // ---- unmapped -------------------------------------------------------------
    // The golfer stands AT Pine Lakes (about 400 m from the middle of its mapped
    // back nine, where the unmapped front nine is): since build 5 the map frames the
    // golfer only when they are at the course - 4 km away it shows the course, and a
    // tapped green there is too far to measure from. The tapped green is still well
    // away from the golfer, so the privacy scan cannot mistake one for the other.
    const pl = [33.7290, -78.8500];
    const b = await arm('unmap', 'pinelakes', null, 'ok', pl, 20, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-set-green' }, { sleep: 200 }, { tap: '.gps-tap-fallback' }, { sleep: 200 }, { expression: READ },
        ...mapTap(90, 200), { expression: READ },
        { tap: '.gps-save' }, { sleep: 500 }, { expression: READ },
        { tap: '.gps-side-bets' }, { sleep: 200 }, { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
    ]);
    out.unmapped = b; bail(out, b);
    {
        const [opened, setting, confirm, saved, again] = b.reads;
        if (opened.acc !== 'Weak GPS ±22 yds') fails.push('unmapped: accuracy ' + opened.acc);
        if (opened.banner !== 'No green mapped for this hole yet' || !opened.set) fails.push('unmapped: no "tap the green" offer');
        if (opened.m !== '—') fails.push('unmapped: a center with no green: ' + opened.m);
        if (setting.banner !== 'Tap the CENTER of the green') fails.push('unmapped: banner ' + setting.banner);
        // Wave 1: a banner never covers the buttons, the score button or the wind.
        [['opened', opened], ['setting', setting], ['confirm', confirm]].forEach(([n, g]) => {
            ['zoomBox', 'recenterBox', 'scoreBox', 'windBox'].forEach((k) => { if (hitBox(g.bannerBox, g[k])) fails.push(`unmapped (${n}): the banner covers the ${k.replace('Box', '')}: ` + JSON.stringify([g.bannerBox, g[k]])); });
            if (g.bannerBox && g.bannerBox.r > g.vw) fails.push(`unmapped (${n}): the banner runs off the screen`);
        });
        if (confirm.banner !== 'Save this green for hole 1?') fails.push('unmapped: confirm banner ' + confirm.banner);
        if (!/^\d+$/.test(saved.m) || saved.banner) fails.push('unmapped: after save, center ' + saved.m);
        if (again.m !== saved.m) fails.push('unmapped: the green did not survive a switch');
        const pinWrites = b.dump.writes.filter((w) => w.path === `events/${b.code}/gpsPins/h1`);
        const other = b.dump.writes.filter((w) => w.path !== `events/${b.code}/gpsPins/h1` && w.path !== 'course_gps/pinelakes/pins/h1');
        if (pinWrites.length !== 1) fails.push('unmapped: ' + pinWrites.length + ' round pin writes');
        if (other.length) fails.push('unmapped: unexpected writes ' + other.map((w) => w.path).join(', '));
        const pin = pinWrites[0] && pinWrites[0].value;
        if (!pin || !pin.mid || pin.by !== 'tap') fails.push('unmapped: pin ' + JSON.stringify(pin));
        else if (!(inlineHaversineM([pin.mid.lat, pin.mid.lng], pl) / 0.9144 > 30)) fails.push('unmapped: the tap landed on the dot - the privacy scan would prove nothing');
        if (!Object.keys(b.dump.storage).includes('golfapp_wq_v1')) fails.push('unmapped: the pin did not go through the offline queue');
    }

    // ---- organizer -------------------------------------------------------------
    const c = await arm('organ', 'caledonia', 'org-1', 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 200 }, { tap: '.gps-tap-fallback' }, { sleep: 200 }, ...mapTap(80, 160),
        { tap: '.gps-save' }, { sleep: 500 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-undo-green' }, { sleep: 500 }, { expression: READ },
    ], { auth: { uid: 'org-1', isAnonymous: false, email: 'o@example.com' } });
    out.organizer = c; bail(out, c);
    {
        const [opened, fixed, undone] = c.reads;
        if (!opened.fix || opened.undo) fails.push('organizer: Fix/Undo on an untouched OSM hole: ' + JSON.stringify([opened.fix, opened.undo]));
        if (fixed.m === opened.m || !fixed.undo || fixed.src !== 'Green set by a golfer') fails.push('organizer: fix ' + JSON.stringify([fixed.m, fixed.undo, fixed.src]));
        if (undone.m !== opened.m || undone.f !== opened.f || undone.b !== opened.b || undone.src !== 'Green restored by undo') fails.push('organizer: undo ' + JSON.stringify([undone.f, undone.m, undone.b, undone.src]));
    }

    // ---- verify: Thistle Stewart / MacKay, Stewart's rebuilt greens ----------------
    const tm = table.thistle_27_stewart.holes['1'].osm;
    const TME = [tm.tee[0] + 0.5 * (tm.mid[0] - tm.tee[0]), tm.tee[1] + 0.5 * (tm.mid[1] - tm.tee[1])];
    const vf = await arm('verif', 'thistle_stewart_mackay', 'org-1', 'ok', TME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 300 }, { tap: '.gps-tap-fallback' }, { sleep: 300 }, { expression: READ },
        // On the green, well away from the golfer (halfway down the hole): the
        // privacy check below looks for the golfer's spot in every write, so a
        // tap that lands on it would read as a leak.
        ...mapTap(200, 130), { tap: '.gps-save' }, { sleep: 500 }, { expression: READ },
    ], { auth: { uid: 'org-1', isAnonymous: false, email: 'o@example.com' } });
    out.verify = vf; bail(out, vf);
    {
        const [opened, fixing, fixed] = vf.reads;
        if (!/^⚠ Verify green: Stewart greens were rebuilt Jun-Sep 2026/.test(opened.verify)) fails.push('verify: no Stewart note on Stewart #1: ' + JSON.stringify(opened.verify));
        if (!/Fix the green/.test(opened.verify)) fails.push('verify: the organizer is not told how to fix it');
        if (opened.src !== 'Green from OpenStreetMap' || !/^\d+$/.test(opened.m)) fails.push('verify: Stewart #1 green not shipped: ' + opened.src + ' ' + opened.m);
        if (fixing.verify) fails.push('verify: the note stayed up while the green was being set');
        if (fixed.verify || fixed.src !== 'Green set by a golfer') fails.push('verify: the note survived a fix: ' + JSON.stringify([fixed.verify, fixed.src]));
        const w = vf.dump.writes.filter((x) => /course_gps\/thistle_27_stewart_mackay\/pins\/h1$/.test(x.path));
        if (w.length !== 1 || w[0].value.ev !== vf.code) fails.push('verify: the course copy does not name its round (ev): ' + JSON.stringify(w.map((x) => x.value)));
    }

    // ---- denied ------------------------------------------------------------------
    const d = await arm('deny', 'caledonia', null, 'denied', ME, 5, [
        { expression: READ },
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-side-bets' }, { sleep: 400 }, { expression: READ },
    ]);
    out.denied = d; bail(out, d);
    {
        const [before, gps, bets] = d.reads;
        if (!/Location is off for HardPan/.test(gps.msg) || !/Settings/.test(gps.msg) || !/Bets and your scorecard are not affected/.test(gps.msg)) fails.push('denied: message ' + gps.msg);
        // NO GPS: everything is measured from the TEE, and says so; no dot.
        // Wave 1: measured from the tee, and NOT labelled so on the map.
        if (gps.from || gps.m !== TEE_CENTER || gps.dot) fails.push('denied: not measuring from the tee (or labelled on the map): ' + JSON.stringify([gps.from, gps.m, TEE_CENTER, gps.dot]));
        if (bets.gpsShown || bets.scoreInputs !== before.scoreInputs || bets.scoreInputs < 4 || bets.cardHole !== before.cardHole) fails.push('denied: Bets is not the card it was');
        if (d.dump.writes.length) fails.push('denied: wrote ' + d.dump.writes.map((w) => w.path).join(', '));
    }

    // ---- precache, then offline from the phone's cache ---------------------------
    const p1 = await arm('pre', 'caledonia', null, 'ok', ME, 4.6, [
        // Waited for, not slept on: the pre-cache starts 4 s after the round opens
        // and fetches 24 real USGS tiles. A fixed 9 s ran out on a loaded machine
        // (measured 2026-10-08: 3 of 6 runs at load 12-35 stored 0 by then).
        { waitFor: `!!localStorage.getItem('hardpan_usgs_done_v1_caledonia')`, timeout: 40000 },
        { sleep: 300 }, { expression: COUNT_USGS }, { sleep: 800 }, { expression: READ },
    ], { profileDir: profile });
    out.precache = p1; bail(out, p1);
    const p2 = await arm('pre', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
    ], { profileDir: profile, blockUrls: ['*basemap.nationalmap.gov*'] });
    out.offline = p2; bail(out, p2);
    {
        const n = p1.reads[0].usgsCached;
        if (n !== 24) fails.push('precache: ' + n + ' USGS tiles stored for Caledonia, expected 24 (z13-16)');
        if (!p1.dump.storage['hardpan_usgs_done_v1_caledonia']) fails.push('precache: not marked done');
        const off = p2.reads[0];
        if (!(off.tilesLoaded > 0)) fails.push('offline: no satellite tiles drawn from the cache (' + off.tilesLoaded + ')');
        fails.push(...arcFails('offline', off));
        if (off.tilesNote) fails.push('offline: the no-signal note showed with tiles cached');
        const onlineReq = p1.requests.filter((q) => /basemap\.nationalmap\.gov/.test(urlOf(q))).length;
        if (onlineReq < 24) fails.push('precache: only ' + onlineReq + ' USGS requests seen while storing 24 tiles');
        out.precacheSummary = {
            stored: n,
            usgsRequestsOnline: p1.requests.filter((q) => /basemap\.nationalmap\.gov/.test(urlOf(q))).length,
            tilesDrawnWithUsgsBlocked: off.tilesLoaded,
        };
    }

    // ---- esri on: setting a green switches to USGS --------------------------------
    // Esri is played by a stand-in on another origin (127.0.0.1), serving a tile
    // image with CORS, as Esri does - MapLibre fetches tiles with fetch(), which a
    // file:// URL cannot answer. Measuring: Esri drawing, its credit on the map,
    // zoom to 20. Setting a green: Esri OFF the map, its credit gone, USGS asked
    // for, zoom capped at 18 (USGS's 16, upscaled). After Save: Esri back.
    const ESRI_CFG = CFG({ esri: 'OK' });
    const e = await arm('esri', 'pinelakes', null, 'ok', pl, 5, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-set-green' }, { sleep: 300 }, { tap: '.gps-tap-fallback' }, { sleep: 3000 }, { expression: READ },
        ...mapTap(90, 200), { tap: '.gps-save' }, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', pl[0], pl[1], 5) + ESRI_CFG });
    // The Esri credit makes the attribution bar two lines: the tee must stay clear of it.
    const et = await arm('esrtee', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + ESRI_CFG });
    out.esriTee = et; bail(out, et);
    {
        const g = et.reads[0];
        if (!/Powered by Esri/.test(g.attribution || '')) fails.push('esri-tee: no Esri credit: ' + g.attribution);
        if (!(g.boxes.attrib && g.boxes.attrib.b - g.boxes.attrib.t > 20)) fails.push('esri-tee: the credit did not wrap - this arm proves nothing: ' + JSON.stringify(g.boxes.attrib));
        fails.push(...teeInView('esri-tee', g));
    }
    out.esri = e; bail(out, e);
    {
        const [measuring, pinning, saved] = e.reads;
        const usgsReq = e.requests.filter((q) => /basemap\.nationalmap\.gov/.test(urlOf(q))).length;
        if (measuring.esri !== 'visible' || !(measuring.esriLoads > 0) || !/Powered by Esri/.test(measuring.attribution || '')) fails.push('esri: the stand-in Esri did not draw while measuring: ' + JSON.stringify([measuring.esri, measuring.esriLoads, measuring.attribution]));
        if (measuring.maxZoom !== 21) fails.push('esri: max zoom with Esri is ' + measuring.maxZoom + ' (expected 21: z19 tiles enlarged)');
        if (measuring.creditLine !== 'Powered by Esri · ⓘ' || pinning.creditLine !== 'USGS · ⓘ') fails.push('esri: the credit line - ' + JSON.stringify([measuring.creditLine, pinning.creditLine]));
        if (!(measuring.attribHtml || '').includes(ESRI_CREDIT) || !(measuring.attribution || '').includes(ESRI_CREDIT_TEXT)) fails.push('esri: the credit is not Esri\'s exact line: ' + JSON.stringify(measuring.attribHtml));
        if (measuring.esriSrcMax !== 19) fails.push('esri: the Esri source asks for tiles to z' + measuring.esriSrcMax + ' (must stop at 19)');
        if (pinning.esri !== 'none' || /Powered by Esri/.test(pinning.attribution || '')) fails.push('esri: Esri still on the map while setting a green: ' + JSON.stringify([pinning.esri, pinning.attribution]));
        if (pinning.maxZoom !== 18) fails.push('esri: max zoom while setting a green is ' + pinning.maxZoom + ' (expected 18, USGS)');
        if (usgsReq === 0) fails.push('esri: USGS was never asked for while setting a green');
        if (saved.esri !== 'visible' || !/Powered by Esri/.test(saved.attribution || '')) fails.push('esri: Esri did not come back after Save: ' + JSON.stringify([saved.esri, saved.attribution]));
        out.esriSummary = { measuring: [measuring.esri, measuring.esriLoads, measuring.maxZoom], pinning: [pinning.esri, pinning.maxZoom], saved: [saved.esri, saved.maxZoom], usgsRequests: usgsReq };
    }

    // ---- off the hole: more than 1,000 yds from the green -> measure from the TEE ----
    const FAR = [H1.mid[0] - 0.03, H1.mid[1]];          // ~3.6 km south of the green
    // 7 s: the map's first load (WebGL, software-rendered here) can outlast 4 s on
    // a loaded machine, and the markers are only drawn once it has loaded -
    // measured: 4 s passed once and read no markers the next run.
    const fh = await arm('offh', 'caledonia', null, 'ok', FAR, 5, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
    ]);
    out.offHole = fh; bail(out, fh);
    {
        const g = fh.reads[0];
        if (g.dot) fails.push('off-hole: the blue dot is still shown');
        if (g.m !== TEE_CENTER) fails.push(`off-hole: center ${g.m}, expected tee -> center ${TEE_CENTER}`);
        if (!/^Tee → target: \d+$/.test(g.toHere || '')) fails.push('off-hole: target readout ' + g.toHere);
        if (!g.teePin || !g.centerPin || !(g.teePin.y > g.centerPin.y) || Math.abs(g.teePin.x - g.centerPin.x) > 3) fails.push('off-hole: tee not straight below the green: ' + JSON.stringify([g.teePin, g.centerPin]));
        if (g.acc !== 'You are off this hole') fails.push('off-hole: accuracy line ' + g.acc);
        // Wave 1 (Manny, 2026-10-08): NO "Measuring from tee" on the map.
        if (g.from || g.boxes.from || /Measuring from tee/.test(JSON.stringify(g))) fails.push('off-hole: "Measuring from tee" is still on the map');
        // Arcs from the TEE (inline expectation, not gps-geo's answer).
        fails.push(...arcFails('off-hole', g));
        fails.push(...teeInView('off-hole', g), ...pillFails('off-hole', g, true));
    }

    // ---- the numbers fit: 320 px (the narrowest iPhone), real and 4-digit values ----
    const FORCE4 = `(['.gps-f', '.gps-m', '.gps-b'].forEach(function (k) { document.querySelector('#gps-overlay ' + k).textContent = '9999'; }), 'forced')`;
    const ft = await arm('fit', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { expression: FORCE4 }, { sleep: 100 }, { expression: READ },
    ], { viewport: { width: 320, height: 568 } });
    out.fit = ft; bail(out, ft);
    ft.reads.forEach((g, k) => {
        const what = k === 0 ? 'real numbers' : 'four digits';
        if (g.big.length !== 3) fails.push('fit: ' + g.big.length + ' numbers on screen');
        g.big.forEach((b) => { if (b.over || b.l < 0 || b.r > g.vw) fails.push(`fit (${what}, 320px): "${b.text}" overflows: ` + JSON.stringify(b)); });
    });

    // ---- polish: zoom 1x/2x/3x, the ring to scale, pills, no pull-down --------------
    const po = await arm('polish', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },   // 0 1x
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 1 2x (the magnifier)
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 2 back to the hole view
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 3 2x
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 4 back to the hole view
        { tap: '.gps-recenter' }, { sleep: 500 }, { expression: READ },            // 5 Recenter -> 1x
        { expression: TAP_SHORT_OF_GREEN }, { sleep: 500 }, { expression: READ },  // 5b target just short of the green
        { expression: PULL(`document.querySelector('#gps-overlay .gps-top')`) },   // 6 a pull on GPS
        touch('touchStart', [{ x: 300, y: 300 }]), touch('touchMove', [{ x: 300, y: 360 }]), touch('touchMove', [{ x: 300, y: 430 }]),
        touch('touchMove', [{ x: 300, y: 500 }]), touch('touchEnd', []), { sleep: 700 }, { expression: READ },  // 7 a finger drag pans the map
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 300 }, { expression: READ },               // 8 meters
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 },
        { tap: '.gps-side-bets' }, { sleep: 400 }, { expression: PULL('document.body') },  // 9 Bets scrolls as before
    ]);
    out.polish = po; bail(out, po);
    {
        const [z1, z2, z3, z1b, z2b, rc, short, pull, dragged, meters, bets] = po.reads;
        // Just short of the green, the white line's midpoint is ON the green: its
        // pill has to move off it (or hide). The yellow pill still shows.
        if (!short.boxes.target || !short.boxes.front || short.boxes.target.t > short.boxes.front.b + 40) fails.push('polish: the target did not land just short of the green: ' + JSON.stringify([short.boxes.target, short.boxes.front]));
        fails.push(...pillFails('polish short of the green', short, false));
        if (!(short.pills.find((p) => p.k === 'to') || {}).box) fails.push('polish short of the green: the yellow-line pill is not shown');
        const near = (a, b, d) => Math.abs(a - b) <= d;
        const cap = z1.maxZoom;
        [[z1, '1x', z1.zoom], [z2, '2x', Math.min(z1.zoom + 1, cap)], [z3, '1x', z1.zoom], [z1b, '2x', Math.min(z1.zoom + 1, cap)], [z2b, '1x', z1.zoom], [rc, '1x', z1.zoom]].forEach(([g, lbl, z], k) => {
            if (g.zoomBtn !== lbl) fails.push(`polish ${k}: zoom button "${g.zoomBtn}", expected ${lbl}`);
            if (!near(g.zoom, z, 0.02)) fails.push(`polish ${k}: zoom ${g.zoom}, expected ${z.toFixed(2)}`);
            if (g.bearing !== 102) fails.push(`polish ${k}: the hole's turn was lost: bearing ${g.bearing}`);
            const want = ringPxAt(H1.mid[0], g.zoom);
            if (!near(g.ringPx, Math.max(6, Math.round(want)), 2)) fails.push(`polish ${k}: ring ${g.ringPx}px across, 20 yds is ${want.toFixed(1)}px at zoom ${g.zoom}`);
            // BUILD 5: double ring + width line, "20 yd" in the hole view too.
            fails.push(...targetFails('polish ' + k, g, true));
            fails.push(...arcFails('polish ' + k, g));
            fails.push(...pillFails('polish ' + k, g, lbl === '1x'));
            if (g.toHere !== z1.toHere) fails.push(`polish ${k}: zooming moved the target: ${g.toHere}`);
        });
        if (dist(z2.target, z1b.target) > 2) fails.push('polish: the magnifier did not zoom around the target the same way twice: ' + JSON.stringify([z2.target, z1b.target]));
        if (dist(z3.centerPin, z1.centerPin) > 3 || dist(z2b.centerPin, z1.centerPin) > 3) fails.push('polish: the second tap did not go back to the hole view');
        if (!(z2.ringPx > z1.ringPx * 1.8)) fails.push(`polish: the ring did not grow with the zoom: ${z1.ringPx} -> ${z2.ringPx}`);
        if (dist(rc.centerPin, z1.centerPin) > 3) fails.push('polish: Recenter did not go back to the 1x hole view');
        if (!pull.pull || !pull.lock || pull.ob !== 'none' || pull.bodyOb !== 'none' || pull.mapTA !== 'none') fails.push('polish: GPS does not stop the page pulling: ' + JSON.stringify(pull));
        if (!(dragged.centerPin && rc.centerPin && dragged.centerPin.y - rc.centerPin.y > 100)) fails.push('polish: a finger drag did not pan the map: ' + JSON.stringify([rc.centerPin, dragged.centerPin]));
        if (dragged.scrollY !== 0) fails.push('polish: the page scrolled under a map drag: ' + dragged.scrollY);
        if (meters.ringLbl !== '18 m') fails.push('polish: ring label in meters "' + meters.ringLbl + '"');
        if (bets.pull || bets.lock) fails.push('polish: Bets is still locked after leaving GPS: ' + JSON.stringify(bets));
        out.polishSummary = { zooms: [z1, z2, z3, z1b, z2b, rc].map((g) => [g.zoomBtn, g.zoom, g.ringPx]), pills: z1.pills.map((p) => p.text), pull, bets };
    }

    // ==== WAVE 1 (2026-10-08) =======================================================
    // A stand-in National Weather Service on 127.0.0.1: /points answers with an
    // hourly forecast URL on api.weather.gov (as NWS does), the view swaps the
    // host for the stand-in, and the forecast says "5 to 12 mph" from the NW.
    const nwsSeen = SEEN.nws;
    const NWS_CFG = CFG({ nws: true });
    const WIND_TO = 135;    // from the NW -> blowing to the SE
    const windRotFor = (bearing) => String(((WIND_TO - bearing) % 360 + 360) % 360);

    // EDIT PIN WAS REMOVED (Manny, 2026-10-08). Its arm went with it. The green's
    // point farthest from the tee is still used below (plays like, the GPS green).
    const far = H1.green.reduce((b, p) => (inlineHaversineM(H1.tee, p) > inlineHaversineM(H1.tee, b) ? p : b), H1.green[0]);
    const yd = (a, b) => String(Math.round(inlineHaversineM(a, b) / 0.9144));

    // ---- FIX THE GREEN BY GPS (2026-10-08): stand there, Set - on the sharp Esri photo ----
    // The organizer on Caledonia #1. GPS first ±10 yds (Set is off), then ±3 yds
    // standing on the green: Set center, Add front & back, Set front, Set back, Save.
    const nearT = H1.green.reduce((b, q) => (inlineHaversineM(H1.tee, q) < inlineHaversineM(H1.tee, b) ? q : b), H1.green[0]);
    const GMID = lerpPt(H1.mid, far, 0.2), GFRONT = lerpPt(H1.mid, nearT, 0.8), GBACK = lerpPt(H1.mid, far, 0.8);
    const gg = await arm('gpsgr', 'caledonia', 'org-1', 'ok', ME, 9, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 1500 }, { expression: READ },                                       // 0
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 400 }, { expression: READ },          // 1 GPS ±10: Set is off
        { tap: '.gps-gps-set' }, { sleep: 300 }, { expression: READ },                                                    // 2 a tap on it does nothing
        { expression: `window.__moveTo(${ME[0]}, ${ME[1]}, 3)` }, { sleep: 500 }, { tap: '.gps-gps-set' }, { sleep: 300 }, { expression: READ }, // 2b ±3 but 151 yds out: still off
        { expression: `window.__moveTo(${GMID[0]}, ${GMID[1]}, 3)` }, { sleep: 500 }, { expression: READ },             // 3 on the green, ±3
        { tap: '.gps-gps-set' }, { sleep: 400 }, { expression: READ },                                                    // 4 center set
        { tap: '.gps-addedges' }, { sleep: 300 },
        { expression: `window.__moveTo(${GFRONT[0]}, ${GFRONT[1]}, 3)` }, { sleep: 400 }, { tap: '.gps-gps-set' }, { sleep: 300 },
        { expression: `window.__moveTo(${GBACK[0]}, ${GBACK[1]}, 3)` }, { sleep: 400 }, { tap: '.gps-gps-set' }, { sleep: 300 }, { expression: READ }, // 5 confirm all
        { tap: '.gps-save' }, { sleep: 1500 }, { expression: READ },                                                      // 6 saved
    ], { auth: { uid: 'org-1', isAnonymous: false, email: 'o@example.com' }, preScript: sensor('ok', ME[0], ME[1], 9) + CFG({ esri: 'OK-GPSGREEN' }) });
    out.gpsGreen = gg; bail(out, gg);
    {
        const [q0, q1, q2, q2b, q3, q4, q5, q6] = gg.reads;
        if (!q2b.gpsSet || q2b.gpsSet.disabled !== true || q2b.banner !== 'Walk to the green - ' + EXPECT.center + ' yds away' || q2b.addEdges) fails.push('gps green: ±3 yds but down the fairway - ' + JSON.stringify([q2b.gpsSet, q2b.banner]));
        if (!q0.fix || q0.set) fails.push('gps green: Fix the green not offered to the organizer: ' + JSON.stringify([q0.fix, q0.set]));
        if (!q1.gpsSet || q1.gpsSet.text !== 'Set center' || q1.gpsSet.disabled !== true || !/^GPS ±10 yds - needs ±5 or better$/.test(q1.banner) || !q1.tapFallback) fails.push('gps green: at ±10 yds - ' + JSON.stringify([q1.gpsSet, q1.banner, q1.tapFallback]));
        if (q2.banner !== q1.banner || q2.addEdges) fails.push('gps green: a tap on a disabled Set did something');
        if (!q3.gpsSet || q3.gpsSet.disabled || q3.banner !== 'Stand on the middle of the green') fails.push('gps green: at ±3 yds on the green - ' + JSON.stringify([q3.gpsSet, q3.banner]));
        if (q4.banner !== 'Save this green for hole 1?' || !q4.addEdges || !q4.saveGreen) fails.push('gps green: after Set center - ' + JSON.stringify([q4.banner, q4.addEdges, q4.saveGreen]));
        if (q5.banner !== 'Save this green for hole 1?' || !q5.saveGreen || q5.addEdges) fails.push('gps green: after front and back - ' + JSON.stringify([q5.banner, q5.saveGreen]));
        // THE SHARP PHOTO THE WHOLE TIME: nothing is taken from it.
        [q1, q3, q4, q5, q6].forEach((g, k) => { if (g.esri !== 'visible' || g.maxZoom !== 21 || !/Powered by Esri/.test(g.attribution || '')) fails.push(`gps green read ${k}: not on Esri: ` + JSON.stringify([g.esri, g.maxZoom])); });
        const w = gg.dump.writes.filter((x) => x.path === `events/${gg.code}/gpsPins/h1`);
        const pin = w[0] && w[0].value;
        const close = (a, p) => !!(a && p) && inlineHaversineM([a.lat, a.lng], p) < 0.5;
        if (w.length !== 1 || !close(pin.mid, GMID) || !close(pin.front, GFRONT) || !close(pin.back, GBACK) || pin.by !== 'organizer') fails.push('gps green: the saved green is not where the golfer stood: ' + JSON.stringify(pin));
        if (q6.src !== 'Green set by a golfer' || q6.banner) fails.push('gps green: after save - ' + JSON.stringify([q6.src, q6.banner]));
        out.gpsGreenSummary = { banners: [q1.banner, q3.banner, q4.banner], saved: pin };
    }

    // ---- the score button: the card's own score entry for this hole ---------------
    const sc = await arm('score', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },          // 0
        { tap: '.gps-score' }, { sleep: 500 }, { expression: READ },                      // 1 -> the card, box focused
        { cdp: { method: 'Input.insertText', params: { text: '4' } } }, { sleep: 200 },
        { expression: '(document.activeElement && document.activeElement.blur(), "blurred")' }, { sleep: 800 },
    ]);
    out.score = sc; bail(out, sc);
    {
        const [g0, g1] = sc.reads;
        if (g0.score !== 'Hole 1 · Enter Score' || !g0.scoreBox) fails.push('score: button ' + JSON.stringify([g0.score, g0.scoreBox]));
        const sb = g0.scoreboxBox, mp = g0.boxes.map;
        if (!sb || !mp || Math.abs((sb.l + sb.r) / 2 - (mp.l + mp.r) / 2) > 2) fails.push('score: the Enter Score box is not centered: ' + JSON.stringify([sb, mp]));
        if (sb && g0.boxes.attrib && sb.b > g0.boxes.attrib.t) fails.push('score: the button sits on the attribution');
        if (g1.side !== 'bets' || g1.gpsShown) fails.push('score: did not open the card: ' + g1.side);
        if (!g1.active || !/score-input/.test(g1.active.cls) || g1.active.hole !== '1') fails.push('score: hole 1\'s score box is not focused: ' + JSON.stringify(g1.active));
        const sw = sc.dump.writes.filter((x) => /^events\/GPSSCORE\/scores\//.test(x.path));
        if (!sw.length || sw[0].value !== 4) fails.push('score: typing 4 did not save through the card: ' + JSON.stringify(sc.dump.writes));
        if (sc.dump.writes.some((x) => !/^events\/GPSSCORE\/(scores|auditLog|scoresVerified)\b/.test(x.path))) fails.push('score: unexpected writes: ' + JSON.stringify(sc.dump.writes.map((x) => x.path)));
    }

    // ---- wind (build 7: LIVE, ALWAYS ON; THE DIAL; MANUAL FOR THIS HOLE ONLY) ----
    // The stand-in NWS answers the point, its stations, the latest observation
    // (from the NW, 12 mph gusting 20) and the hourly forecast. The page drops a
    // marker into the request log (/__mark/<n>) so each step's requests can be
    // counted.
    const windProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-wind-profile-'));
    const nws0 = nwsSeen.length;
    const WKEY = 'hardpan_wind_v1_caledonia';
    const AGE = (min) => ({ expression: `(function(){var w=JSON.parse(localStorage.getItem('${WKEY}'));if(!w)return 'no wind reading';w.at=Date.now()-${min}*60000;localStorage.setItem('${WKEY}',JSON.stringify(w));return 'aged ${min}';})()` });
    const MARK = (n) => ({ expression: `fetch('${SO}/__mark/${n}').then(function(){return 'mark ${n}'})` });
    const NWSMODE = (m) => ({ expression: `fetch('${SO}/__nws/${m}').then(function(){return 'nws ${m}'})` });
    const RERENDER = [{ tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 }, { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 1500 }];
    const DRAG = (deg) => ({ expression: `(function(){var d=document.querySelector('#gps-overlay .gps-dial'),r=d.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,a=${deg}*Math.PI/180;var p=function(t,x,y){d.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,pointerId:7,bubbles:true,isPrimary:true}))};p('pointerdown',cx,cy-70);for(var i=1;i<=8;i++){var f=a*i/8;p('pointermove',cx+70*Math.sin(f),cy-70*Math.cos(f));}p('pointerup',cx+70*Math.sin(a),cy-70*Math.cos(a));return 'dragged ${deg}'})()` });
    const SLIDE = (v) => ({ expression: `(function(){var s=document.querySelector('#gps-overlay .gps-ws-slider');s.value='${v}';s.dispatchEvent(new Event('input',{bubbles:true}));return 'slid ${v}'})()` });
    const WAIT_MPH = { waitFor: `/mph/.test((document.querySelector('.gps-wind-mph') || {}).textContent || '')`, timeout: 15000 };
    const RELOAD = [{ expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, { sleep: 1500 }];
    NWS.mode = 'ok';
    const wd = await arm('wind', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, WAIT_MPH, { expression: READ },                                     // 0 live: the observation
        ...RELOAD, { expression: READ }, MARK('a'),                                                             // 1 reload: from the phone
        AGE(11), ...RERENDER, { expression: READ }, MARK('b'),                                                  // 2 11 min old: asked again
        { tap: '.gps-wind' }, { sleep: 600 }, { expression: READ },                                             // 3 the dial, on the live wind
        DRAG(180), { sleep: 150 }, { tap: '.gps-ws-plus' }, { sleep: 100 }, { tap: '.gps-ws-plus' }, { sleep: 100 }, { tap: '.gps-ws-plus' }, { sleep: 300 }, { expression: READ }, // 4 into the face, 15
        SLIDE(22), { sleep: 300 }, { expression: READ },                                                        // 5 the slider: 22
        { tap: '.gps-ws-done' }, { sleep: 500 }, { expression: READ },                                          // 6 Done
        ...RELOAD, { expression: READ },                                                                         // 7 still manual on this hole
        AGE(2), MARK('c'), { tap: '.gps-next' }, { sleep: 1800 }, { expression: READ }, MARK('d'),              // 8 hole 2: live again, asked right away
        { tap: '.gps-prev' }, { sleep: 1500 }, { expression: READ },                                            // 9 back on hole 1: the manual wind is gone
        { tap: '.gps-wind' }, { sleep: 500 }, DRAG(90), { sleep: 300 }, { tap: '.gps-ws-live' }, { sleep: 500 }, { expression: READ }, // 10 "Use live wind"
        { tap: '.gps-ws-done' }, { sleep: 300 },
        { expression: `(function(){localStorage.setItem('hardpan_wind_manual_v2',JSON.stringify({day:'2026-1-1',course:'caledonia',hole:1,mph:20,toDeg:0}));return 'yesterday';})()` },
        ...RELOAD, { expression: READ },                                                                         // 11 set on another day: gone
        NWSMODE('down'), AGE(50), ...RERENDER, { expression: READ },                                            // 12 offline 50 min: the last reading, with its age
        AGE(61), ...RERENDER, { expression: READ },                                                             // 13 over an hour: "Wind -"
        { tap: '.gps-wind' }, { sleep: 500 }, { expression: READ }, { tap: '.gps-ws-done' }, NWSMODE('ok'),    // 14 still settable by hand
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, profileDir: windProfile });
    NWS.mode = 'ok';
    out.wind = wd; bail(out, wd);
    const nwsWind = nwsSeen.slice(nws0);
    const wo = await arm('windoff', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, blockUrls: ['*' + SO.replace('http://', '') + '/points*', '*' + SO.replace('http://', '') + '/gridpoints*', '*' + SO.replace('http://', '') + '/stations*'] });
    out.windOff = wo; bail(out, wo);
    // The forecast as the BACKUP: the station's observation is three hours old.
    NWS.mode = 'stale';
    const nwsF0 = nwsSeen.length;
    const wf = await arm('windfc', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, WAIT_MPH, { sleep: 500 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG });
    const nwsFc = nwsSeen.slice(nwsF0);
    // Outside the US: NWS has no point - no wind box at all.
    NWS.mode = 'outside';
    const nwsO0 = nwsSeen.length;
    const wu = await arm('windusa', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3500 }, { expression: READ }, ...RERENDER, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG });
    const nwsOut = nwsSeen.slice(nwsO0);
    NWS.mode = 'ok';
    out.windFc = wf; bail(out, wf); out.windUsa = wu; bail(out, wu);
    {
        const r = wd.reads;
        const [w0, w1, w2, d3, d4, d5, d6, d7, h8, h9, l10, y11, o12, o13, o14] = r;
        const hb = (n) => inlineBearing(table.caledonia.holes[n].osm.tee, table.caledonia.holes[n].osm.mid);
        const COMP = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const compass = (d) => COMP[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
        const between = (a, b) => { const i = nwsWind.indexOf('/__mark/' + a), j = b ? nwsWind.indexOf('/__mark/' + b) : nwsWind.length; return nwsWind.slice(i + 1, j).filter((u) => !/^\/__/.test(u)); };
        const first = nwsWind.slice(0, nwsWind.indexOf('/__mark/a')).filter((u) => !/^\/__/.test(u));
        const want = `/points/${Math.round(H1.mid[0] * 1e3) / 1e3},${Math.round(H1.mid[1] * 1e3) / 1e3}`;
        const OBS = '/stations/KXXX/observations/latest';
        // LIVE: the measured wind and gusts, the age, the arrow.
        if (w0.windMph !== '12 g 20 mph') fails.push('wind: box reads ' + JSON.stringify(w0.windMph) + ' (expected the observation: 12 g 20 mph)');
        if (w0.windTag !== 'updated just now') fails.push('wind: the age reads ' + JSON.stringify(w0.windTag));
        if (w0.windRot !== windRotFor(w0.bearing)) fails.push(`wind: arrow turned ${w0.windRot}, expected ${windRotFor(w0.bearing)} (to the SE, on a map turned ${w0.bearing})`);
        const wb = w0.windBox, mp = w0.boxes.map;
        if (!wb || !w0.boxes.top || wb.r < mp.r - 20 || wb.l < (mp.l + mp.r) / 2 || wb.t < w0.boxes.top.b || wb.t > w0.boxes.top.b + 30) fails.push('wind: not at the top of the right-hand stack: ' + JSON.stringify([wb, w0.boxes.top]));
        if (hitBox(wb, w0.scoreBox)) fails.push('wind: covers the score button');
        if (JSON.stringify(first) !== JSON.stringify([want, '/gridpoints/XXX/1,2/stations', OBS])) fails.push(`wind: first look asked ${JSON.stringify(first)}, expected the COURSE point ${want}, its stations, the latest observation (and nothing on the reload)`);
        if (w1.windMph !== w0.windMph) fails.push('wind: not shown from the phone after a reload: ' + w1.windMph);
        if (JSON.stringify(between('a', 'b')) !== JSON.stringify([OBS]) || w2.windTag !== 'updated just now') fails.push('wind: 11 minutes old was not asked again (once, the observation only): ' + JSON.stringify([between('a', 'b'), w2.windTag]));
        if (nwsWind.some((u) => u.indexOf(ME[0].toFixed(3)) !== -1 && u.indexOf(ME[1].toFixed(3)) !== -1 && want.indexOf(ME[0].toFixed(3)) === -1)) fails.push('wind: the golfer\'s position went to the weather service');
        // THE DIAL: a sheet from the bottom, on the live wind, never over the target or the numbers.
        const rel0 = String(Math.round((((135 - w2.bearing) % 360 + 360) % 360) / 5) * 5 % 360);
        if (!d3.windSheet || d3.windDial !== rel0 || d3.windLive || d3.windRead !== 'From NW · 12 mph · gusts 20' || d3.windState !== 'Live · updated just now') fails.push('wind: the dial did not open on the live wind: ' + JSON.stringify([d3.windSheet, d3.windDial, rel0, d3.windLive, d3.windRead, d3.windState]));
        const sh = d3.windSheetBox;
        if (!sh || sh.l > 0 || sh.r < 390 || sh.b < 840 || sh.t < 300) fails.push('wind: the dial is not a sheet from the bottom: ' + JSON.stringify(sh));
        if (sh && d3.target && d3.target.b > sh.t) fails.push('wind: the sheet covers the target: ' + JSON.stringify([d3.target, sh]));
        (d3.pills || []).forEach((p) => { if (sh && p.box && p.box.b > sh.t) fails.push('wind: the sheet covers a number: ' + JSON.stringify([p, sh])); });
        const g = d3.windGreenBox, dl = d3.windDialBox;
        if (!g || !dl || Math.abs((g.l + g.r) / 2 - (dl.l + dl.r) / 2) > 2 || g.t > dl.t + 4) fails.push('wind: no green flag at the top of the dial: ' + JSON.stringify([g, dl]));
        // DRAGGED into the face, 15 mph: manual, the box turned with it, the words a weather app uses.
        const intoFace = 'From ' + compass(hb('1')) + ' · ';
        if (!d4.windManual || d4.windDial !== '180' || d4.windMph !== '15 mph' || d4.windTag !== 'manual' || Math.abs(Number(d4.windRot) - 180) > 2 || d4.windRead !== intoFace + '15 mph' || d4.windState !== 'Manual · this hole only' || !d4.windLive || d4.windSlider !== '15') fails.push('wind: drag into the face, 15 mph - ' + JSON.stringify([d4.windManual, d4.windDial, d4.windMph, d4.windTag, d4.windRot, d4.windRead, intoFace, d4.windState, d4.windLive, d4.windSlider]));
        if (d5.windMph !== '22 mph' || d5.windSlider !== '22' || d5.windRead !== intoFace + '22 mph') fails.push('wind: the slider - ' + JSON.stringify([d5.windMph, d5.windSlider, d5.windRead]));
        if (d6.windSheet || !d6.windManual || d6.windMph !== '22 mph') fails.push('wind: Done - ' + JSON.stringify([d6.windSheet, d6.windManual, d6.windMph]));
        if (w0.plays && d6.plays === w0.plays) fails.push('wind: plays ~ did not follow the manual wind: ' + d6.plays);
        if (!d7.windManual || d7.windMph !== '22 mph') fails.push('wind: the manual wind did not survive a reload on its hole: ' + JSON.stringify([d7.windManual, d7.windMph]));
        // THE NEXT HOLE: back on live wind, and asked right away.
        if (!/^Hole 2\b/.test(h8.title || '') || h8.windManual || h8.windMph !== '12 g 20 mph') fails.push('wind: hole 2 is not back on live wind: ' + JSON.stringify([h8.title, h8.windManual, h8.windMph]));
        if (JSON.stringify(between('c', 'd')) !== JSON.stringify([OBS])) fails.push('wind: a new hole did not ask right away: ' + JSON.stringify(between('c', 'd')));
        if (!/^Hole 1\b/.test(h9.title || '') || h9.windManual) fails.push('wind: back on hole 1 the manual wind came back: ' + JSON.stringify([h9.title, h9.windManual]));
        if (!l10.windSheet || l10.windManual || l10.windLive || !/^Live · /.test(l10.windState || '') || l10.windMph !== '12 g 20 mph') fails.push('wind: "Use live wind" did not go back: ' + JSON.stringify([l10.windSheet, l10.windManual, l10.windState, l10.windMph]));
        if (y11.windManual || y11.windMph !== '12 g 20 mph') fails.push('wind: a manual wind from another day is still used: ' + JSON.stringify([y11.windManual, y11.windMph]));
        // OFFLINE: the last reading with its age up to an hour, then "Wind -" (still settable).
        if (o12.windMph !== '12 g 20 mph' || o12.windTag !== 'updated 50 min ago') fails.push('wind: offline at 50 minutes - ' + JSON.stringify([o12.windMph, o12.windTag]));
        if (o13.windMph !== 'Wind –' || o13.windTag) fails.push('wind: offline past an hour - ' + JSON.stringify([o13.windMph, o13.windTag]));
        if (!o14.windSheet) fails.push('wind: with no reading the dial does not open');
        if (wo.reads[0].windMph !== 'Wind –' || wo.reads[0].windManual) fails.push('wind: with no weather service the box reads ' + JSON.stringify(wo.reads[0].windMph));
        // THE BACKUP: the hourly forecast when the observation is too old.
        const f0 = wf.reads[0];
        if (f0.windMph !== '12 mph' || f0.windRot !== windRotFor(f0.bearing) || !nwsFc.includes(OBS) || !nwsFc.includes('/gridpoints/XXX/1,2/forecast/hourly')) fails.push('wind: the forecast backup - ' + JSON.stringify([f0.windMph, f0.windRot, nwsFc]));
        // OUTSIDE THE US: no box, and nothing asked after the point.
        if (wu.reads.some((x) => x.windMph != null || x.wind != null) || nwsOut.filter((u) => !/^\/__/.test(u)).some((u) => !u.startsWith('/points/'))) fails.push('wind: outside the US - ' + JSON.stringify([wu.reads.map((x) => x.windMph), nwsOut]));
    }
    try { fs.rmSync(windProfile, { recursive: true, force: true }); } catch (e) {}

    // ---- the test courses: Myrtle (Caledonia, True Blue, Pine Lakes) + Scottsdale ----
    // The live rounds NA4EZB / KHPSL4 / 3MKUCF are NOT opened: they are real trip
    // rounds, and Save pin / Enter Score would write into them. These arms open
    // the same COURSES in stand-in rounds. The golfer is 3 km off the hole, so
    // everything is measured from the tee (inline expectation from the bundle).
    const TEST_COURSES = [
        { name: 'na4ez', key: 'caledonia', label: 'Caledonia (NA4EZB)', hole: 1 },
        { name: 'khpsl', key: 'trueblue', label: 'True Blue (KHPSL4)', hole: 1 },
        { name: '3mkuc', key: 'pinelakes', label: 'Pine Lakes (3MKUCF)', hole: 10 },
        { name: 'tpcsd', key: 'az_tpc_stadium', label: 'TPC Scottsdale Stadium', hole: 1 },
    ];
    out.courses = [];
    for (const tc of TEST_COURSES) {
        const hr = table[tc.key].holes[String(tc.hole)].osm;
        const away = [hr.mid[0] - 0.03, hr.mid[1]];
        const nexts = []; for (let k = 1; k < tc.hole; k++) nexts.push({ tap: '.gps-next' }, { sleep: 500 });
        const cr = await arm(tc.name, tc.key, null, 'ok', away, 5, [
            { tap: '.gps-side-gps' }, WAIT_MAP, ...nexts, { sleep: 1500 },
            { waitFor: `!!(document.querySelector('.gps-wind') && document.querySelector('.gps-wind').style.display !== 'none')`, timeout: 15000 }, { expression: READ },
        ], { preScript: sensor('ok', away[0], away[1], 5) + NWS_CFG });
        bail(out, cr);
        const [g] = cr.reads, tag = tc.label + ' #' + tc.hole;
        const total = inlineHaversineM(hr.tee, hr.mid) / 0.9144;
        const res = { course: tag, title: g.title, fcb: [g.f, g.m, g.b], arcs: g.arcs, arcLabels: g.arcLabels.length, score: g.score, wind: g.wind };
        out.courses.push(res);
        if (g.title !== `Hole ${tc.hole} · Par ${sb.p[tc.key].data[tc.hole - 1].par}`) fails.push(`${tag}: title ${g.title}`);
        if (g.m !== String(Math.round(total))) fails.push(`${tag}: center ${g.m}, tee -> center is ${Math.round(total)}`);
        fails.push(...arcFails(tag, g), ...teeInView(tag, g), ...pillFails(tag, g, true));
        if (g.score !== `Hole ${tc.hole} · Enter Score`) fails.push(`${tag}: score button ${g.score}`);
        if (g.windMph !== '12 g 20 mph' || g.windRot !== windRotFor(g.bearing)) fails.push(`${tag}: wind ${g.windMph} turned ${g.windRot} (expected 12 g 20 mph, ${windRotFor(g.bearing)})`);
        if (g.midLbl !== 'CENTER' || g.editPinEl) fails.push(`${tag}: Edit Pin is still on the screen: ` + JSON.stringify([g.midLbl, g.editPinEl]));
        if (cr.dump.writes.length) fails.push(`${tag}: just looking wrote ` + cr.dump.writes.map((x) => x.path).join(', '));
    }

    // ==== WAVE 2 (2026-10-08) =======================================================
    const zOf = (tok) => (SEEN.esri[tok] || []);

    // ---- Esri live on a short par 3: 3x reaches its full step; z19 tiles at most ----
    // Caledonia #3 (par 3). Then Edit Pin: the picture goes to USGS while a pin is
    // placed (shared data is never derived from Esri imagery).
    const ex = await arm('esrix', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { tap: '.gps-next' }, { sleep: 500 }, { tap: '.gps-next' }, { sleep: 1500 }, { expression: READ },   // 0 hole 3, 1x
        { tap: '.gps-zoom' }, { sleep: 2500 }, { expression: READ },                                                         // 1 the magnifier: 2x
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-3X' }) });
    out.esri3x = ex; bail(out, ex);
    {
        const [z1, z3] = ex.reads;   // z3: the closest the magnifier goes (2x since build 5)
        if (z1.title !== 'Hole 3 · Par 3') fails.push('esri 3x: not on the par 3: ' + z1.title);
        if (z1.esri !== 'visible' || z1.maxZoom !== 21) fails.push('esri 3x: Esri not live: ' + JSON.stringify([z1.esri, z1.maxZoom]));
        if (!(z1.attribHtml || '').includes(ESRI_CREDIT)) fails.push('esri 3x: credit ' + JSON.stringify(z1.attribHtml));
        const want3 = Math.min(z1.zoom + 1, z1.maxZoom);
        if (Math.abs(z3.zoom - want3) > 0.02 || z3.zoomBtn !== '2x') fails.push(`esri zoom: the magnifier reached zoom ${z3.zoom}, its full step is ${want3.toFixed(2)} (max ${z3.maxZoom})`);
        const zs = zOf('OK-3X'), top = Math.max(...zs);
        if (top !== 19 && z3.zoom >= 18) fails.push(`esri 3x: at map zoom ${z3.zoom} the closest Esri tiles asked for were z${top} (expected exactly 19 - never past it)`);
        if (z3.esriSrcMax !== 19) fails.push('esri 3x: source max ' + z3.esriSrcMax);
        out.esri3xSummary = { zooms: [z1.zoom, z3.zoom], maxZoom: z1.maxZoom, highestTileZ: top, tileRequests: zs.length };
    }

    // ---- Esri breaks MID-ROUND (tiles loaded first): USGS takes over ---------------
    const eb = await arm('esrib', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 2500 }, { expression: READ },                                          // 0 Esri drawing
        { expression: `(window.__t0 = Number(document.querySelector('#gps-overlay .gps-map').dataset.tilesLoaded || 0), fetch('${SO}/ctl/break/OK-BREAK').then(function () { return 'broke'; }))` }, { sleep: 300 },
        { tap: '.gps-zoom' }, { sleep: 800 }, { tap: '.gps-zoom' },
        // USGS tiles come from the network after the hand-over: waited for, not slept on.
        { waitFor: `(function () { var m = document.querySelector('#gps-overlay .gps-map'); return m && m.dataset.esri === 'failed' && Number(m.dataset.tilesLoaded) > window.__t0; })()`, timeout: 15000 },
        { sleep: 300 }, { expression: READ },                                                                                // 1 new tiles refused
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-BREAK' }) });
    out.esriBreak = eb; bail(out, eb);
    {
        const [b0, b1] = eb.reads;
        if (b0.esri !== 'visible' || !(b0.esriLoads > 0)) fails.push('esri break: Esri was not drawing first - this arm proves nothing: ' + JSON.stringify([b0.esri, b0.esriLoads]));
        fails.push(...usgsFallbackFails('esri break (after ' + b0.esriLoads + ' Esri tiles loaded)', b1, 'errors'));
        if (b1.tilesLoaded <= b0.tilesLoaded) fails.push('esri break: no USGS tiles drawn after the fallback');
    }

    // ---- Esri, then NO SIGNAL: USGS at once; signal back: Esri once more -------------
    const NET = (offline) => ({ cdp: { method: 'Network.emulateNetworkConditions', params: { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } } });
    const eo = await arm('esrio', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 2500 }, { expression: READ },     // 0 Esri drawing
        NET(true), { sleep: 800 }, { expression: READ },                               // 1 offline
        NET(false), { sleep: 2500 }, { expression: READ },                             // 2 online again
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-OFF' }) });
    out.esriOffline = eo; bail(out, eo);
    {
        const [o0, o1, o2] = eo.reads;
        if (o0.esri !== 'visible') fails.push('esri offline: Esri was not drawing first: ' + o0.esri);
        if (o1.esri !== 'failed' || o1.esriWhy !== 'offline' || o1.maxZoom !== 18 || /Powered by Esri/.test(o1.attribution || '')) fails.push('esri offline: no signal did not hand over to USGS: ' + JSON.stringify([o1.esri, o1.esriWhy, o1.maxZoom, o1.attribution]));
        if (!(o1.tilesLoaded > 0) || o1.tilesNoteShown) fails.push('esri offline: blank map');
        if (o2.esri !== 'visible' || o2.maxZoom !== 21) fails.push('esri offline: Esri was not tried again when the signal came back: ' + JSON.stringify([o2.esri, o2.maxZoom]));
    }

    // ---- GOOGLE SATELLITE (optional): the rules, then the budget ----------------------
    const G_READY = { waitFor: `(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.google === 'visible' && Number(m.dataset.googleLoads) > 0); })()`, timeout: 20000 };
    const gProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-google-profile-'));
    const gs0 = SEEN.gSession.length;
    const go = await arm('googl', 'caledonia', 'org-1', 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, G_READY, { sleep: 2000 }, { expression: READ },                              // 0 Google the picture
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 600 }, { expression: READ },          // 1 fixing by GPS: not Google
        { tap: '.gps-tap-fallback' }, { sleep: 600 }, { expression: READ },                                               // 2 tap fallback: not Google
        { tap: '.gps-cancel' }, { sleep: 1200 }, { expression: READ },                                                    // 3 back: Google again
        { expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, G_READY, { sleep: 800 }, { expression: READ },   // 4 reload: same session
    ], { auth: { uid: 'org-1', isAnonymous: false, email: 'o@example.com' }, preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ google: 'CHECK-G' }), profileDir: gProfile });
    out.google = go; bail(out, go);
    {
        const [g0, g1, g2, g3, g4] = go.reads;
        if (g0.google !== 'visible' || g0.esri !== 'off' || g0.usgsVis !== 'none') fails.push('google: not the only picture - ' + JSON.stringify([g0.google, g0.esri, g0.usgsVis]));
        if (!g0.googleLogo || g0.googleLogo.h < 16 || g0.googleLogo.h > 19 || g0.googleLogo.alt !== 'Google Maps' || !g0.googleLogo.svg) fails.push('google: the logo - ' + JSON.stringify(g0.googleLogo));
        if (!/Imagery ©2026 Stand-in Google/.test(g0.creditLine || '')) fails.push('google: the copyright line is not on the map: ' + JSON.stringify(g0.creditLine));
        if (g0.googleLogo && g0.boxes.bottom && g0.googleLogo.t - g0.boxes.bottom.b < 10) fails.push('google: less than 10px clear above the logo');
        if (g0.maxZoom !== 21 || g0.googleSrcMax !== 19) fails.push('google: zoom ' + JSON.stringify([g0.maxZoom, g0.googleSrcMax]));
        [[g1, 'fixing by GPS'], [g2, 'tap fallback']].forEach(([g, n]) => { if (g.google !== 'none' || g.usgsVis !== 'visible' || g.googleLogo) fails.push(`google: still the picture while ${n}: ` + JSON.stringify([g.google, g.usgsVis])); });
        if (g3.google !== 'visible' || g3.usgsVis !== 'none') fails.push('google: did not come back after Cancel: ' + JSON.stringify([g3.google, g3.usgsVis]));
        const sess = SEEN.gSession.slice(gs0);
        if (sess.length !== 1 || !/"mapType":"satellite"/.test(sess[0].body)) fails.push('google: sessions ' + JSON.stringify(sess));
        if (g4.google !== 'visible') fails.push('google: after a reload ' + g4.google);
        const zs = SEEN.gTiles['CHECK-G'] || [];
        if (!zs.length || Math.max(...zs) > 19) fails.push('google: tiles asked to z' + Math.max(...zs));
        if (SEEN.gVp.some((u) => u.indexOf(ME[0].toFixed(4)) !== -1 && u.indexOf(ME[1].toFixed(4)) !== -1)) fails.push('google: the viewport request names the golfer');
        out.googleSummary = { sessions: sess.length, tiles: zs.length, viewportCalls: SEEN.gVp.length, credit: g0.creditLine };
    }
    try { fs.rmSync(gProfile, { recursive: true, force: true }); } catch (e) {}
    // The budget, Google: holes 1-18, 1x then 3x, the same as Esri's.
    const gBudget = [{ tap: '.gps-side-gps' }, WAIT_MAP, G_READY];
    for (let h = 1; h <= 18; h++) {
        gBudget.push({ sleep: 1500 }, { tap: '.gps-zoom' }, { sleep: 400 }, { tap: '.gps-zoom' }, { sleep: 1500 }, { expression: READ }, { tap: '.gps-zoom' }, { sleep: 300 });
        if (h < 18) gBudget.push({ tap: '.gps-next' }, { sleep: 400 });
    }
    const gb = await arm('gbudg', 'caledonia', null, 'ok', ME, 4.6, gBudget, { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ google: 'CHECK-GB' }) });
    out.gBudget = gb; bail(out, gb);
    {
        if (gb.reads.length !== 18 || gb.reads.some((g) => g.google !== 'visible')) fails.push('google budget: Google not the picture on all 18');
        out.googleBudget = { tileRequests: (SEEN.gTiles['CHECK-GB'] || []).length, dataLoads: gb.reads[gb.reads.length - 1].googleLoads, viewportCalls: SEEN.gVp.length };
    }

    // ---- THE TILE BUDGET: holes 1-18, 1x then 3x on each ------------------------------
    const budgetSteps = [{ tap: '.gps-side-gps' }, WAIT_MAP];
    for (let h = 1; h <= 18; h++) {
        budgetSteps.push({ sleep: 1500 }, { tap: '.gps-zoom' }, { sleep: 400 }, { tap: '.gps-zoom' }, { sleep: 1500 }, { expression: READ }, { tap: '.gps-zoom' }, { sleep: 300 });
        if (h < 18) budgetSteps.push({ tap: '.gps-next' }, { sleep: 400 });
    }
    const bu = await arm('budgt', 'caledonia', null, 'ok', ME, 4.6, budgetSteps, { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-BUDGET' }) });
    out.budget = bu; bail(out, bu);
    {
        const last = bu.reads[bu.reads.length - 1];
        if (bu.reads.length !== 18 || last.title !== 'Hole 18 · Par ' + sb.p.caledonia.data[17].par) fails.push('budget: did not walk 18 holes: ' + bu.reads.length + ' ' + last.title);
        if (bu.reads.some((g) => g.esri !== 'visible')) fails.push('budget: Esri was not the picture on every hole');
        out.budgetSummary = { esriTileRequests: zOf('OK-BUDGET').length, dataEsriLoads: last.esriLoads, perHole: bu.reads.map((g) => g.esriLoads) };
    }

    // ---- PLAYS LIKE: EPQS stand-in heights, NWS wind 12 mph from the NW, 61 F ----------
    const r5k = (p) => (Math.round(p[0] * 1e5) / 1e5).toFixed(5) + ',' + (Math.round(p[1] * 1e5) / 1e5).toFixed(5);
    const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const HOLE1_PTS = [[H1.tee, 100], [lerpP(H1.tee, H1.mid, 0.25), 104], [lerpP(H1.tee, H1.mid, 0.5), 108], [lerpP(H1.tee, H1.mid, 0.75), 112], [H1.mid, 130]];
    HOLE1_PTS.forEach(([p, ft]) => { ELEV[r5k(p)] = ft; });
    const H2 = table.caledonia.holes['2'].osm;
    const COURSE_KEYS = new Set(HOLE1_PTS.map(([p]) => r5k(p)).concat([0, 0.25, 0.5, 0.75, 1].map((t) => r5k(t === 0 ? H2.tee : t === 1 ? H2.mid : lerpP(H2.tee, H2.mid, t)))));
    // Inline, sharing no code with gps-geo: the golfer's height on the tee -> green
    // line, the great-circle bearing, the handoff's formula.
    const elevOnLine = (t) => { const T = [0, 0.25, 0.5, 0.75, 1], E = [100, 104, 108, 112, 130]; for (let i = 1; i < 5; i++) if (t <= T[i]) return E[i - 1] + (E[i] - E[i - 1]) * (t - T[i - 1]) / 0.25; return 130; };
    const brg = (a, b) => { const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r); return (Math.atan2(y, x) / r + 360) % 360; };
    const expectPlays = (golfer, t, aim, elevTo) => {
        const D = inlineHaversineM(golfer, aim) / 0.9144;
        const E = (elevTo - elevOnLine(t)) / 3;
        const head = 12 * Math.cos((315 - brg(golfer, aim)) * Math.PI / 180);
        const W = head > 0 ? D * 0.01 * head : D * 0.005 * head;
        const T = D * 0.001 * (70 - 61);
        return { yd: Math.round(D + E + W + T), m: Math.round((D + E + W + T) * 0.9144) };
    };
    const P40 = lerpP(H1.tee, H1.mid, 0.4);
    const H1_TOTAL_YD = inlineHaversineM(H1.tee, H1.mid) / 0.9144;
    const NEAR = lerpP(H1.mid, H1.tee, 20 / H1_TOTAL_YD);                  // 20 yds short of the center
    const ONGREEN = lerpP(H1.mid, far, 0.3);                                // on the green, not its center
    const plaProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-plays-profile-'));
    const epqs0 = SEEN.epqs.length;
    const PLAYS_SHOWN = { waitFor: `(function () { var e = document.querySelector('#gps-overlay .gps-plays'); return !!(e && e.style.visibility !== 'hidden' && /elev/.test(e.getAttribute('data-terms') || '')); })()`, timeout: 20000 };
    const pa = await arm('plays', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, PLAYS_SHOWN, { sleep: 500 }, { expression: READ },          // 0 at 55 %
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 300 }, { expression: READ }, { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 },   // 1 meters
        { expression: `window.__moveTo(${P40[0]}, ${P40[1]})` }, { sleep: 500 }, { expression: READ },       // 2 walked back to 40 %
        { expression: `window.__moveTo(${NEAR[0]}, ${NEAR[1]})` }, { sleep: 500 }, { expression: READ },     // 3 20 yds out: hidden
        { expression: `window.__moveTo(${ONGREEN[0]}, ${ONGREEN[1]})` }, { sleep: 500 }, { expression: READ }, // 4 on the green: hidden
        { expression: `window.__moveTo(${ME[0]}, ${ME[1]})` }, { sleep: 500 }, { expression: READ },         // 5 back at 55 %
        { tap: '.gps-next' }, { sleep: 3500 }, { expression: READ },                                         // 6 hole 2
        { tap: '.gps-prev' }, { sleep: 1500 }, { expression: READ },                                         // 7 hole 1 again
        { expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, { sleep: 2500 }, { expression: READ },          // 8 reloaded
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'DENY-PLAYS', nws: true, epqs: true }), profileDir: plaProfile });
    out.plays = pa; bail(out, pa);
    {
        const R = pa.reads;
        const [p0, pm, p40, pnear, pgreen, pback, ph2, ph1, preload] = R;
        const at55 = expectPlays(ME, 0.55, H1.mid, 130);
        const num = (t) => { const m = /^plays ~(\d+)$/.exec(t || ''); return m ? +m[1] : null; };
        const near = (got, want, tag) => { if (got == null || Math.abs(got - want) > 1) fails.push(`plays: ${tag} reads ${JSON.stringify(got)}, expected ${want} (inline)`); };
        near(num(p0.plays), at55.yd, 'at 55% of hole 1');
        if (p0.playsTerms !== 'elev wind temp') fails.push('plays: terms used ' + JSON.stringify(p0.playsTerms) + ' (expected elev wind temp)');
        if (num(p0.plays) === +p0.m) fails.push('plays: says the same as CENTER - the adjustment is not applied');
        near(num(pm.plays), at55.m, 'in meters');
        near(num(p40.plays), expectPlays(P40, 0.4, H1.mid, 130).yd, 'after walking back to 40%');
        if (pnear.plays !== null) fails.push('plays: shown 20 yds from the green: ' + pnear.plays);
        if (pgreen.plays !== null) fails.push('plays: shown on the green: ' + pgreen.plays);
        near(num(pback.plays), at55.yd, 'back at 55%');
        if (!/^Hole 2/.test(ph2.title)) fails.push('plays: Next did not reach hole 2');
        if (ph1.plays !== pback.plays) fails.push('plays: hole 1 again reads ' + ph1.plays + ', was ' + pback.plays);
        // After a reload: the same, from the phone's cached heights.
        if (preload.midLbl !== 'CENTER' || num(preload.plays) !== num(p0.plays)) fails.push('plays: after a reload reads ' + JSON.stringify([preload.midLbl, preload.plays]) + ', expected ' + p0.plays);
        const asked = SEEN.epqs.slice(epqs0);
        const keys = asked.map((u) => { const q = new URL(u, 'http://x').searchParams; return (+q.get('y')).toFixed(5) + ',' + (+q.get('x')).toFixed(5); });
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (dupes.length) fails.push('plays: EPQS asked again for a point it already answered (no cache?): ' + dupes.slice(0, 3).join(' | '));
        const allowed = new Set(COURSE_KEYS);
        const strange = keys.filter((k) => !allowed.has(k));
        if (strange.length) fails.push('plays: EPQS asked for a point that is not a course point (the golfer?): ' + strange.slice(0, 3).join(' | '));
        [ME, P40, NEAR, ONGREEN].forEach((g) => { if (asked.some((u) => { const q = new URL(u, 'http://x').searchParams; return inlineHaversineM(g, [+q.get('y'), +q.get('x')]) < 3; })) fails.push('plays: an EPQS request was at the golfer\'s spot ' + g.map((v) => v.toFixed(4)).join(',')); });
        if (keys.length < 6) fails.push('plays: only ' + keys.length + ' EPQS requests - this arm proves nothing about caching');
        out.playsSummary = { expected55: at55, shown: R.map((g) => g.plays), terms: p0.playsTerms, epqsRequests: keys.length, epqsUnique: new Set(keys).size };
    }
    // A SECOND VISIT asks for nothing: a fresh page on the same phone, hole 1.
    const epqs1 = SEEN.epqs.length;
    const pa2 = await arm('plays', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, PLAYS_SHOWN, { sleep: 1500 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'DENY-PLAYS', nws: true, epqs: true }), profileDir: plaProfile });
    out.plays2 = pa2; bail(out, pa2);
    {
        // THE CACHE: nothing answered on the first visit is asked for again. (A
        // point the first visit had not reached yet - possible on a loaded machine -
        // may be asked once; the first run on 2026-10-08 measured 0 in all.)
        const k = (u) => { const q = new URL(u, 'http://x').searchParams; return (+q.get('y')).toFixed(5) + ',' + (+q.get('x')).toFixed(5); };
        const first = new Set(SEEN.epqs.slice(epqs0, epqs1).map(k));
        const second = SEEN.epqs.slice(epqs1).map(k);
        const reasked = second.filter((x) => first.has(x));
        if (reasked.length) fails.push('plays: the second visit asked EPQS again for ' + reasked.length + ' point(s) already answered: ' + reasked.slice(0, 3).join(' | '));
        out.playsSummary.secondVisitEpqs = second.length;
        out.playsSummary.secondVisitReasked = reasked.length;
    }
    try { fs.rmSync(plaProfile, { recursive: true, force: true }); } catch (e) {}

    // ---- GREEN VIEW: the green alone, same turn, F / C / B / PIN, depth x width -------
    // Depth and width inline: the outline turned to the line of play (tee -> center).
    const gAxis = brg(H1.tee, H1.mid);
    const gAl = [], gAc = [];
    H1.green.forEach((p) => { const d = inlineHaversineM(H1.mid, p), t = d ? (brg(H1.mid, p) - gAxis) * Math.PI / 180 : 0; gAl.push(d * Math.cos(t)); gAc.push(d * Math.sin(t)); });
    const G_DEPTH = Math.round((Math.max(...gAl) - Math.min(...gAl)) / 0.9144), G_WIDTH = Math.round((Math.max(...gAc) - Math.min(...gAc)) / 0.9144);
    const G_DEPTH_M = Math.round(Math.max(...gAl) - Math.min(...gAl)), G_WIDTH_M = Math.round(Math.max(...gAc) - Math.min(...gAc));
    const gv = await arm('green', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },                          // 0 hole
        { tap: '.gps-green-view' }, { sleep: 900 }, { expression: READ },                               // 1 green
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 300 }, { expression: READ }, { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 }, // 2 meters
        { tap: '.gps-green-view' }, { sleep: 900 }, { expression: READ },                               // 3 back to the hole
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-GREEN' }) });
    out.green = gv; bail(out, gv);
    {
        const [h0, g1, gm, h5] = gv.reads;
        const lbl = (g, k) => (g.greenLbls.find((x) => x.k === k) || {}).text || null;
        const dimsIn = (txt, d, w, unit) => { const m = new RegExp('^Green (\\d+) ' + unit + ' deep · (\\d+) ' + unit + ' wide$').exec(txt || ''); return !!m && Math.abs(+m[1] - d) <= 1 && Math.abs(+m[2] - w) <= 1; };
        if (h0.greenBtn !== '⛳ Green' || h0.view !== 'hole' || h0.greenDims) fails.push('green: hole view - ' + JSON.stringify([h0.greenBtn, h0.view, h0.greenDims]));
        if (g1.view !== 'green' || g1.greenBtn !== '⛳ Hole' || g1.zoomBtn !== null) fails.push('green: not in the green view: ' + JSON.stringify([g1.view, g1.greenBtn, g1.zoomBtn]));
        if (g1.bearing !== h0.bearing) fails.push(`green: the turn changed: ${h0.bearing} -> ${g1.bearing}`);
        if (!(g1.zoom > h0.zoom + 1)) fails.push(`green: did not zoom in to the green: ${h0.zoom} -> ${g1.zoom}`);
        const gb = greenPage(g1), mp = g1.boxes.map;
        if (!gb || !mp || gb.t < mp.t || gb.b > mp.b || gb.l < mp.l || gb.r > mp.r) fails.push('green: the green is not all on screen: ' + JSON.stringify([gb, mp]));
        // It fills the view - unless the imagery's closest zoom stops it (USGS: z18).
        else if (g1.zoom < g1.maxZoom - 0.01 && (gb.b - gb.t) < 0.3 * (mp.b - mp.t) && (gb.r - gb.l) < 0.4 * (mp.r - mp.l)) fails.push('green: the green does not fill the view: ' + JSON.stringify(gb));
        if (g1.esri !== 'visible' || g1.maxZoom !== 21) fails.push('green: this arm needs Esri on (z21) to prove the fill: ' + JSON.stringify([g1.esri, g1.maxZoom]));
        if (lbl(g1, 'f') !== 'F ' + g1.f || lbl(g1, 'c') !== 'C ' + g1.m || lbl(g1, 'b') !== 'B ' + g1.b || lbl(g1, 'p')) fails.push('green: labels ' + JSON.stringify(g1.greenLbls.map((x) => x.text)) + ' vs F/C/B ' + [g1.f, g1.m, g1.b].join('/'));
        if (g1.f !== EXPECT.front || g1.m !== EXPECT.center || g1.b !== EXPECT.back) fails.push('green: the numbers changed in the green view: ' + [g1.f, g1.m, g1.b].join('/'));
        // BUILD 3: "20 yd" beside the ring in the Green view only; in meters "18 m".
        { const tc = mid(g1.boxes.target); if (g1.ringLbl !== '20 yd' || !g1.boxes.ringLbl || !tc || g1.boxes.ringLbl.l < tc.x + g1.ringPx / 2) fails.push('green: the "20 yd" label is not beside the ring: ' + JSON.stringify([g1.ringLbl, g1.boxes.ringLbl])); }
        if (gm.boxes.ringLbl && gm.ringLbl !== '18 m') fails.push('green (meters): ring label ' + gm.ringLbl);
        fails.push(...targetFails('green hole view', h0, true), ...targetFails('green view', g1, false));
        fails.push(...arcFails('green view', g1));
        g1.greenLbls.forEach((x) => { const near = { f: g1.boxes.front, c: g1.boxes.mid, b: g1.boxes.back }[x.k]; if (near && x.box && Math.abs((x.box.t + x.box.b) / 2 - (near.t + near.b) / 2) > 30) fails.push('green: label ' + x.text + ' is not beside its point'); });
        if (!dimsIn(g1.greenDims, G_DEPTH, G_WIDTH, 'yds')) fails.push(`green: "${g1.greenDims}", inline ${G_DEPTH} deep x ${G_WIDTH} wide`);
        if (!dimsIn(gm.greenDims, G_DEPTH_M, G_WIDTH_M, 'm')) fails.push(`green (meters): "${gm.greenDims}", inline ${G_DEPTH_M} x ${G_WIDTH_M} m`);
        if (h5.view !== 'hole' || h5.bearing !== h0.bearing || Math.abs(h5.zoom - h0.zoom) > 0.02 || h5.zoomBtn !== '1x' || h5.greenBtn !== '⛳ Green' || h5.greenLbls.length || h5.greenDims) fails.push('green: "Hole" did not return to the hole view: ' + JSON.stringify([h5.view, h5.bearing, h5.zoom, h0.zoom, h5.zoomBtn, h5.greenBtn, h5.greenLbls.length]));
        out.greenSummary = { zoom: [h0.zoom, g1.zoom], dims: g1.greenDims, inline: [G_DEPTH, G_WIDTH], labels: g1.greenLbls.map((x) => x.text) };
    }

    // ---- REDESIGN STEP 1: the hole picker, Enter Score ›, Back, FREE PAN on the course ----
    const WHEEL = (dy) => ({ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 195, y: 420, deltaX: 0, deltaY: dy } } });
    const ly = await arm('layout', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },                                      // 0 hole 1
        // FREE PAN: far up the course (six long drags), then far zoomed out (wheel).
        // (from the right-hand edge of the map, clear of the target and the lines)
        ...[0, 1, 2, 3, 4, 5].map(() => ({ drag: '.gps-map', at: { fx: 0.82, fy: 0.42 }, dx: 0, dy: 300 })), { sleep: 600 }, { expression: READ }, // 1 panned
        WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 700 }, { expression: READ }, // 2 zoomed out
        { tap: '.gps-recenter' }, { sleep: 600 }, { expression: READ },                                                   // 3 Recenter
        { tap: '.gps-hole-btn' }, { sleep: 400 }, { expression: READ },                                                   // 4 picker open
        { tap: '.gps-picker-grid button[data-hole="5"]' }, { sleep: 900 }, { expression: READ },                          // 5 hole 5
        { drag: '.gps-map', at: { fx: 0.5, fy: 0.4 }, dx: 120, dy: 80 }, { sleep: 400 },
        { tap: '.gps-score-next' }, { sleep: 900 }, { expression: READ },                                                 // 6 › hole 6, own view
        { tap: '.gps-credit-i' }, { sleep: 300 }, { expression: READ },                                                   // 7 credits open
        ...mapTap(200, 300), { expression: READ },                                                                        // 8 a tap closes them
        { tap: '.gps-back' }, { sleep: 500 }, { expression: READ },                                                       // 9 Back -> the card
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-LAYOUT' }) });
    out.layout = ly; bail(out, ly);
    {
        const [l0, l1, l2, l3, l4, l5, l6, lc, lc2, l7] = ly.reads;
        // CREDITS: one line, no white block, below (or beside) the Card / Enter Score row.
        if (l0.creditLine !== 'Powered by Esri · ⓘ') fails.push('layout: the credit line reads ' + JSON.stringify(l0.creditLine));
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(l0.creditBg || '')) fails.push('layout: the credit line has a background: ' + l0.creditBg);
        const cb = l0.boxes.attrib, bb = l0.boxes.bottom;
        if (!cb || !bb || (cb.t < bb.b - 1 && cb.l < bb.r && cb.r > bb.l) || cb.b > l0.boxes.map.b || cb.b - cb.t > 26) fails.push('layout: the credit line is not one line under the Card / Enter Score row: ' + JSON.stringify([cb, bb]));
        if (!lc.creditPop || !lc.creditPop.includes(ESRI_CREDIT_TEXT.replace('Powered by Esri | ', '')) || !/Powered by Esri/.test(lc.creditPop) || !/OpenStreetMap contributors/.test(lc.creditPop)) fails.push('layout: ⓘ does not show every credit line: ' + JSON.stringify(lc.creditPop));
        if (lc2.creditPop) fails.push('layout: a tap did not close the credits');
        const inB = (g) => !!(g.mapCenter && g.bounds && g.mapCenter[0] >= g.bounds[0] - 1e-4 && g.mapCenter[0] <= g.bounds[2] + 1e-4 && g.mapCenter[1] >= g.bounds[1] - 1e-4 && g.mapCenter[1] <= g.bounds[3] + 1e-4);
        if (!l0.bounds || !inB(l0)) fails.push('layout: no course limit on the map: ' + JSON.stringify([l0.bounds, l0.mapCenter]));
        // The limit is the course (every tee and green) plus 400 m - from the bundle, inline.
        const allPts = []; Object.values(table.caledonia.holes).forEach((h) => { const o = h.osm; if (!o) return; if (o.tee) allPts.push(o.tee); if (o.end) allPts.push(o.end); (o.green || []).forEach((q) => allPts.push(q)); });
        const nMax = Math.max(...allPts.map((q) => q[0])), dLat = 400 / 6371008.8 * 180 / Math.PI;
        if (l0.bounds && Math.abs(l0.bounds[3] - (nMax + dLat)) > 2e-4) fails.push(`layout: the north limit ${l0.bounds[3]} is not the course + 400 m (${(nMax + dLat).toFixed(4)})`);
        if (!l1.mapCenter || !l0.mapCenter || Math.hypot(l1.mapCenter[0] - l0.mapCenter[0], l1.mapCenter[1] - l0.mapCenter[1]) < 0.002) fails.push('layout: the map did not pan away from the hole: ' + JSON.stringify([l0.mapCenter, l1.mapCenter]));
        if (!inB(l1)) fails.push('layout: panned off the course: ' + JSON.stringify([l1.mapCenter, l1.bounds]));
        if (l1.f !== l0.f || l1.m !== l0.m || l1.b !== l0.b || l1.toHere !== l0.toHere || l1.title !== l0.title) fails.push('layout: panning away changed the hole\'s numbers: ' + JSON.stringify([[l0.f, l0.m, l0.b, l0.toHere], [l1.f, l1.m, l1.b, l1.toHere]]));
        if (!(l2.zoom < l0.zoom - 1) || l2.zoom < 13 - 0.01 || l2.minZoom !== 13 || !inB(l2)) fails.push(`layout: zooming out - ${l0.zoom} -> ${l2.zoom} (floor ${l2.minZoom}), in bounds ${inB(l2)}`);
        if (dist(l3.centerPin, l0.centerPin) > 3 || Math.abs(l3.zoom - l0.zoom) > 0.02 || l3.bearing !== l0.bearing) fails.push('layout: Recenter did not snap back to the hole: ' + JSON.stringify([l0.centerPin, l3.centerPin, l0.zoom, l3.zoom]));
        if (l3.boxes.recenterB && l3.boxes.bottom && !(l3.boxes.recenterB.b <= l3.boxes.bottom.t && l3.boxes.recenterB.l < 60)) fails.push('layout: Recenter is not on the left above the Card button');
        if (l4.picker !== 18) fails.push('layout: the hole picker shows ' + l4.picker + ' holes');
        if (l5.title !== 'Hole 5 · Par ' + sb.p.caledonia.data[4].par || l5.picker) fails.push('layout: picking 5 -> ' + l5.title);
        if (l5.holeMeta !== `Par ${sb.p.caledonia.data[4].par} · ~${Math.round(inlineHaversineM(table.caledonia.holes['5'].osm.tee, table.caledonia.holes['5'].osm.mid) / 0.9144)}y · HCP ${sb.p.caledonia.data[4].hcpIndex}`) fails.push('layout: hole 5 line "' + l5.holeMeta + '"');
        if (l6.title !== 'Hole 6 · Par ' + sb.p.caledonia.data[5].par || l6.view !== 'hole' || l6.zoomBtn !== '1x') fails.push('layout: Enter Score › -> ' + JSON.stringify([l6.title, l6.view, l6.zoomBtn]));
        fails.push(...teeInView('layout hole 6 (after a pan on 5)', l6));
        if (l7.side !== 'bets' || l7.gpsShown || l7.cardHole !== 'Hole 6') fails.push('layout: Back did not go to the card on hole 6: ' + JSON.stringify([l7.side, l7.cardHole]));
        out.layoutSummary = { bounds: l0.bounds, centers: [l0.mapCenter, l1.mapCenter, l2.mapCenter], zoom: [l0.zoom, l2.zoom, l3.zoom], meta: [l0.holeMeta, l5.holeMeta] };
    }

    // ---- THE FLOW (gps-flow, 2026-10-09): a round opens on GPS; Enter Score saves
    // through the card and comes back to GPS on the next hole ----------------------
    const FRESH = 'window.__freshPhone = true;';
    const typeScore = (d) => [{ cdp: { method: 'Input.insertText', params: { text: d } } }, { sleep: 350 }];
    const fl = await arm('flow', 'caledonia', null, 'ok', ME, 4.6, [
        WAIT_MAP, { sleep: 1200 }, { expression: READ },                                                // 0 landed: GPS, hole 1
        { tap: '.gps-score' }, { sleep: 600 }, { expression: READ },                                    // 1 the card, hole 1's first box
        ...typeScore('4'), ...typeScore('5'), ...typeScore('3'), ...typeScore('6'), { sleep: 1500 }, { expression: READ }, // 2 all four saved -> GPS hole 2
        // The writes are recorded per page: read them before the reload below.
        { expression: `'FLOWW' + JSON.stringify(window.__coldWrites || [])` },
        { expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, { sleep: 1200 }, { expression: READ },             // 3 reopened: GPS again
        { tap: '.gps-side-bets' }, { sleep: 500 }, { expression: 'location.reload()' }, { sleep: 5000 }, { expression: READ }, // 4 left on the Card: the Card
        { expression: `'SIDEV' + localStorage.getItem('hardpan_round_side')` },
        // BUILD 5: a Card choice made in ANOTHER round does not stop this one landing on GPS.
        { expression: `(localStorage.setItem('hardpan_round_side', 'bets|OTHER1'), location.reload(), 'other')` }, { sleep: 4000 }, WAIT_MAP, { sleep: 1200 }, { expression: READ }, // 5 GPS
    ], { preScript: FRESH + sensor('ok', ME[0], ME[1], 4.6) });
    out.flow = fl; bail(out, fl);
    const fu = await arm('flowu', 'pinelakes', null, 'ok', pl, 5, [{ sleep: 6000 }, { expression: READ }], { preScript: FRESH + sensor('ok', pl[0], pl[1], 5) });
    out.flowUnmapped = fu; bail(out, fu);
    const fd = await arm('flowd', 'caledonia', null, 'denied', ME, 5, [{ sleep: 7000 }, { expression: READ }], { preScript: FRESH + sensor('denied', ME[0], ME[1], 5) });
    out.flowDenied = fd; bail(out, fd);
    {
        const [f0, f1, f2, f3, f4, f5] = fl.reads;
        const sv = fl.raw.find((v) => typeof v === 'string' && v.startsWith('SIDEV'));
        if (sv !== 'SIDEVbets|' + fl.code) fails.push('flow: the Card choice was not remembered for this round only: ' + sv);
        if (!f5 || f5.side !== 'gps' || !f5.gpsShown) fails.push('flow: a Card choice from another round kept this round on the Card: ' + JSON.stringify(f5 && [f5.side, f5.gpsShown]));
        if (f0.side !== 'gps' || !f0.gpsShown || f0.title !== 'Hole 1 · Par ' + sb.p.caledonia.data[0].par) fails.push('flow: a fresh phone did not land on GPS hole 1: ' + JSON.stringify([f0.side, f0.gpsShown, f0.title]));
        if (f1.side !== 'bets' || !f1.active || !/score-input/.test(f1.active.cls) || f1.active.hole !== '1') fails.push('flow: Enter Score did not open hole 1\'s box: ' + JSON.stringify([f1.side, f1.active]));
        const fw = fl.raw.find((v) => typeof v === 'string' && v.startsWith('FLOWW'));
        const flWrites = fw ? JSON.parse(fw.slice(5)) : [];
        const sw = flWrites.filter((x) => new RegExp('^events/' + fl.code + '/scores/').test(x.path));
        const vals = sw.map((x) => x.value).sort().join(',');
        if (sw.length < 4 || vals !== '3,4,5,6') fails.push('flow: the four scores were not saved through the card: ' + JSON.stringify(sw.map((x) => [x.path, x.value])));
        if (flWrites.concat(fl.dump.writes).some((x) => !new RegExp('^events/' + fl.code + '/(scores|auditLog|scoresVerified)\\b').test(x.path))) fails.push('flow: unexpected writes ' + JSON.stringify(flWrites.map((x) => x.path)));
        if (f2.side !== 'gps' || !f2.gpsShown || !/^Hole 2/.test(f2.title || '') || f2.cardHole !== 'Hole 2') fails.push('flow: after the last score, not back on GPS at hole 2: ' + JSON.stringify([f2.side, f2.title, f2.cardHole]));
        if (f3.side !== 'gps' || !f3.gpsShown) fails.push('flow: reopening the round did not land on GPS: ' + JSON.stringify([f3.side, f3.gpsShown]));
        if (f4.side !== 'bets' || f4.gpsShown) fails.push('flow: left on the Card, the reopened round did not stay on the Card: ' + JSON.stringify([f4.side, f4.gpsShown]));
        if (fu.reads[0].side !== 'bets' || fu.reads[0].gpsShown) fails.push('flow: a hole with no GPS data landed on GPS: ' + JSON.stringify([fu.reads[0].side, fu.reads[0].title]));
        if (fd.reads[0].side !== 'bets' || fd.reads[0].gpsShown) fails.push('flow: location denied landed on GPS: ' + JSON.stringify([fd.reads[0].side]));
        if (/^bets/.test(fd.dump.storage.hardpan_round_side || '')) fails.push('flow: denied location was remembered as a choice of the Card');
        out.flowSummary = { landed: [f0.side, f0.title], afterScores: [f2.side, f2.title], scores: vals, reopened: f3.side, leftOnCard: f4.side, unmapped: fu.reads[0].side, denied: fd.reads[0].side };
    }

    // ---- BUILD 5: ANY COURSE (a course with nothing bundled: Camas Meadows - Wildwood is bundled since 2026-10-10) ----------------------
    // The golfer is at HOME (Camas, WA - 150 km away). With the course's directory
    // location and Overpass blocked: the round stays on the Card, and 📍 GPS shows
    // the COURSE, not the golfer's street. With no location at all: a note on the
    // Card side, no map. With the stand-in Overpass: the lookup finds the holes and
    // the round lands on GPS. Overpass is asked for the COURSE point, never the golfer's.
    // The course point is a stand-in (Chambers Bay's coordinates); Chambers Bay itself is bundled since build 5.
    const HOME = [45.5946, -122.404], CB = { latitude: 47.2003276, longitude: -122.5707511, city: 'Tacoma', state: 'WA' };
    const cbDb = (name, loc) => ({ events: { ['GPS' + name.toUpperCase().slice(0, 5)]: round('swwa_camasmeadows') }, global_courses: loc ? { swwa_camasmeadows: { name: 'Camas Meadows Golf Club', location: loc } } : {} });
    const ov0 = SEEN.overpass.length;
    const nd = await arm('nodat', 'swwa_camasmeadows', null, 'ok', HOME, 5, [{ sleep: 7000 }, { expression: READ }, { tap: '.gps-side-gps' }, { sleep: 4000 }, { expression: READ }],
        { preScript: FRESH + sensor('ok', HOME[0], HOME[1], 5) + CFG({ esri: 'DENY' }), db: cbDb('nodat', CB), blockUrls: ['*overpass*', '*maps.mail.ru*'] });
    out.noData = nd; bail(out, nd);
    const nl = await arm('noloc', 'swwa_camasmeadows', null, 'ok', HOME, 5, [{ sleep: 6000 }, { expression: READ }, { tap: '.gps-side-gps' }, { sleep: 2500 }, { expression: READ }],
        { preScript: FRESH + sensor('ok', HOME[0], HOME[1], 5) + CFG({ esri: 'DENY' }), db: cbDb('noloc', null), blockUrls: ['*overpass*', '*maps.mail.ru*'] });
    out.noLocation = nl; bail(out, nl);
    const lk = await arm('lookp', 'swwa_camasmeadows', null, 'ok', HOME, 5, [{ sleep: 12000 }, { expression: READ },
        { expression: `JSON.stringify({ lk: (function(){ var v = JSON.parse(localStorage.getItem('hardpan_osm_v1_swwa_camasmeadows') || 'null'); return v ? { n: Object.keys(v.holes).length, osm: v.osm, name: v.name } : null; })() })` },
        // ONCE, THEN OFFLINE (2026-10-10): open it again - nothing more is asked of
        // Overpass - and again with the network cut off: the kept copy draws it.
        { expression: 'location.reload()' }, { sleep: 9000 }, { expression: READ },
        { cdp: { method: 'Network.enable', params: {} } },
        { cdp: { method: 'Network.emulateNetworkConditions', params: { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } } },
        { expression: 'location.reload()' }, { sleep: 9000 }, { expression: READ }],
        { preScript: FRESH + sensor('ok', HOME[0], HOME[1], 5) + CFG({ esri: 'DENY', overpass: true }), db: cbDb('lookp', CB) });
    out.lookup = lk; bail(out, lk);
    {
        const [n0, n1] = nd.reads, [l0, l1] = nl.reads, [k0, k2, k3] = lk.reads.filter((r) => r && r.side !== undefined);
        if (!k2 || k2.side !== 'gps' || !/^\d+$/.test(k2.m || '')) fails.push('lookup: opened again, the kept copy did not draw it: ' + JSON.stringify(k2 && [k2.side, k2.m]));
        if (!k3 || k3.side !== 'gps' || !/^\d+$/.test(k3.m || '') || k3.m !== k0.m) fails.push('lookup: OFFLINE, the kept copy did not draw it: ' + JSON.stringify(k3 && [k3.side, k3.m, k0.m]));
        if (n0.side !== 'bets' || n0.gpsShown) fails.push('any course: no data, yet it landed on GPS: ' + JSON.stringify([n0.side, n0.gpsShown]));
        const cen = n1.mapCenter;   // [lng, lat]
        if (!n1.gpsShown || !cen) fails.push('any course: 📍 GPS did not open the map: ' + JSON.stringify([n1.gpsShown, cen]));
        else {
            const dCourse = inlineHaversineM([cen[1], cen[0]], [CB.latitude, CB.longitude]), dHome = inlineHaversineM([cen[1], cen[0]], HOME);
            if (dCourse > 3000 || dHome < 50000) fails.push(`any course: the map is ${Math.round(dCourse)} m from the course and ${Math.round(dHome)} m from the golfer's home - it must show the course`);
        }
        if (l0.side !== 'bets' || l0.gpsShown) fails.push('no location: landed on GPS');
        if (l1.gpsShown || !/No GPS map for this course yet/.test(l1.sideNote || '')) fails.push('no location: 📍 GPS should leave a note on the Card, not open a map: ' + JSON.stringify([l1.gpsShown, l1.sideNote]));
        const lkInfo = JSON.parse(lk.raw.find((v) => typeof v === 'string' && v.startsWith('{"lk"')) || '{}').lk;
        if (!lkInfo || lkInfo.n < 9 || lkInfo.osm !== 'way/4343') fails.push('lookup: the stand-in course was not looked up and kept: ' + JSON.stringify(lkInfo));
        if (k0.side !== 'gps' || !k0.gpsShown || !/^\d+$/.test(k0.m || '')) fails.push('lookup: with greens found, the round did not land on GPS with numbers: ' + JSON.stringify([k0.side, k0.gpsShown, k0.m]));
        const asked = SEEN.overpass.slice(ov0);
        if (asked.length !== 2) fails.push('lookup: expected 2 Overpass queries in all (the courses near, then ours - ONCE, not again on reopening), got ' + asked.length);
        if (asked.some((qq) => qq.indexOf(HOME[0].toFixed(2)) !== -1 && qq.indexOf(String(HOME[1]).slice(0, 7)) !== -1)) fails.push('lookup: the golfer\'s position went to Overpass');
        if (!asked.length || !/golf_course"\]\(47\.17/.test(asked[0])) fails.push('lookup: the first query was not a box around the COURSE: ' + asked[0]);
        out.anyCourseSummary = { noData: [n0.side, n1.mapCenter], noLocation: [l1.gpsShown, l1.sideNote], lookup: [k0.side, k0.m, lkInfo], overpass: asked.length };
    }

    // ---- FREE (no HardPan GPS): numbers only, the upgrade sheet, nothing fetched -------
    const freeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-free-profile-'));
    const ALL_ON = CFG({ esri: 'OK-FREE', nws: true, epqs: true });
    const SVC = new RegExp('maplibre-gl|nationalmap\\.gov|arcgis|' + SO.replace(/[.:/]/g, (c) => '\\' + c));
    const fr = await arm('free', 'caledonia', null, 'ok', ME, 4.6, [
        { expression: READ },                                                                  // 0 arrival: Bets
        { tap: '.gps-side-gps' }, { sleep: 1500 }, { expression: READ },                       // 1 the sheet
        { tap: '.gps-sheet-close' }, { sleep: 300 }, { expression: READ },                      // 2 basic numbers
        { tap: '.gps-get-pro' }, { sleep: 300 }, { expression: READ },                          // 3 sheet again
        { tap: '.gps-sheet-close' }, { sleep: 200 },
        { tap: '.gps-side-bets' }, { sleep: 400 }, { expression: READ },                       // 4 Bets
        { tap: '.gps-side-gps' }, { sleep: 600 }, { expression: READ },                        // 5 GPS again: no sheet
        { sleep: 6000 },                                                                       //   past the pre-cache's 4 s
        { tap: '.gps-score' }, { sleep: 500 }, { expression: READ },                           // 6 Enter Score
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + ALL_ON, query: '&gpstier=free', profileDir: freeProfile });
    out.free = fr; bail(out, fr);
    const cl = await arm('clear', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 2500 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + ALL_ON, query: '&gpstier=clear', profileDir: freeProfile });
    out.clear = cl; bail(out, cl);
    {
        const [f0, f1, f2, f3, f4, f5, f6] = fr.reads;
        if (f1.hasPro !== false || f1.tier !== 'free') fails.push('free: ?gpstier=free did not make this phone free: ' + JSON.stringify([f1.hasPro, f1.tier]));
        if (!f0.toggle || !/📍 GPS/.test(f0.toggle)) fails.push('free: the GPS button is not there');
        // NO PRICE until Manny sets one: "HardPan GPS — coming soon", the list, Not now.
        const sheetWant = ['HardPan GPS — coming soon', 'Satellite hole map', 'Drag-the-target yardages', 'Wind', 'Plays-like yardage', 'Not now'];
        if (/Edit Pin/.test(f1.sheet || '')) fails.push('free: the sheet still offers Edit Pin');
        if (!f1.sheet || sheetWant.some((w) => f1.sheet.indexOf(w) === -1) || /Season Pass/i.test(f1.sheet)) fails.push('free: the upgrade sheet: ' + JSON.stringify(f1.sheet));
        if (/\$|\/year|trial|Coming soon$/.test((f1.sheet || '').replace('HardPan GPS — coming soon', ''))) fails.push('free: the sheet shows a price or a buy button: ' + JSON.stringify(f1.sheet));
        if (f2.sheet) fails.push('free: "Not now" did not close the sheet');
        if (!f2.basicMode || f2.mapWrapShown || f2.map) fails.push('free: a map on the free screen: ' + JSON.stringify([f2.basicMode, f2.mapWrapShown, f2.map]));
        if (f2.f !== EXPECT.front || f2.m !== EXPECT.center || f2.b !== EXPECT.back) fails.push(`free: F/C/B ${f2.f}/${f2.m}/${f2.b}, expected ${EXPECT.front}/${EXPECT.center}/${EXPECT.back}`);
        if (f2.acc !== '±6 yds' || f2.title !== 'Hole 1 · Par ' + sb.p.caledonia.data[0].par) fails.push('free: title / accuracy ' + JSON.stringify([f2.title, f2.acc]));
        if (f2.score !== 'Hole 1 · Enter Score' || !f2.getPro) fails.push('free: Enter Score / Get HardPan GPS: ' + JSON.stringify([f2.score, f2.getPro]));
        if (f2.targetRow || f2.fix || f2.set || f2.wind || f2.plays) fails.push('free: a Pro feature is showing: ' + JSON.stringify({ target: f2.targetRow, fix: f2.fix, set: f2.set, wind: f2.wind, plays: f2.plays }));
        if (!f3.sheet) fails.push('free: "Get HardPan GPS" did not open the sheet');
        if (f4.gpsShown || f4.scoreInputs !== a.reads[0].scoreInputs || f4.scoreInputs < 4) fails.push('free: Bets is not the same card: ' + JSON.stringify([f4.scoreInputs, a.reads[0].scoreInputs]));
        if (f5.sheet) fails.push('free: the sheet opened again in the same session');
        if (f6.side !== 'bets' || !f6.active || !/score-input/.test(f6.active.cls) || f6.active.hole !== '1') fails.push('free: Enter Score did not open hole 1\'s score: ' + JSON.stringify([f6.side, f6.active]));
        const outside = fr.requests.filter((u) => SVC.test(urlOf(u)));
        if (outside.length) fails.push('free: ' + outside.length + ' map / imagery / elevation / weather requests: ' + outside.slice(0, 3).map(urlOf).join(' | '));
        if (fr.dump.storage['hardpan_usgs_done_v1_caledonia']) fails.push('free: the USGS imagery was pre-cached');
        // ?gpstier=clear: Pro again, the map back - and the same services DO get asked (the control).
        const c0 = cl.reads[0];
        if (c0.hasPro !== true || c0.tier !== null || !c0.map || c0.basicMode) fails.push('clear: ?gpstier=clear did not restore Pro: ' + JSON.stringify([c0.hasPro, c0.tier, c0.map, c0.basicMode]));
        const ctl = cl.requests.filter((u) => SVC.test(urlOf(u)));
        if (!ctl.some((u) => /maplibre-gl/.test(u)) || !ctl.some((u) => /\/esri\//.test(u))) fails.push('clear: the control asked for no map / Esri - the free arm proves nothing');
        out.freeSummary = { freeServiceRequests: outside.length, proControlRequests: ctl.length, sheet: f1.sheet };
    }
    try { fs.rmSync(freeProfile, { recursive: true, force: true }); } catch (e) {}
    SRV.close();

    // ---- privacy, every arm ------------------------------------------------------
    [[a, ME], [i, ME], [b, pl], [c, ME], [d, ME], [p1, ME], [p2, ME], [e, pl], [vf, TME], [fh, FAR], [ft, ME], [po, ME], [et, ME], [sc, ME], [wd, ME], [wo, ME], [wf, ME], [wu, ME], [gg, ME],
     [ex, ME], [eb, ME], [eo, ME], [bu, ME], [pa, ME], [pa2, ME], [fr, ME], [cl, ME], [gv, ME], [ly, ME], [go, ME], [gb, ME], [fl, ME], [fu, pl], [fd, ME]].forEach(([r, me]) => {
        const l = leaks(r, me);
        if (l.length) fails.push(r.name + ': the golfer\'s position left the page: ' + l.slice(0, 3).join(' | '));
    });
    // EDIT PIN IS GONE: no arm writes today's pin (events/<code>/pinLocs) any more.
    [a, i, b, c, d, p1, p2, e, vf, fh, ft, po, et, sc, wd, wo, wf, wu, gg, ex, eb, eo, bu, pa, pa2, fr, cl, gv, ly].forEach((r) => {
        if (r.dump.writes.some((x) => /pinLocs/.test(x.path))) fails.push(r.name + ': wrote a pinLocs record');
    });
    // Wave 2: every arm's Esri is the stand-in (refusing, by default). The real
    // Esri hosts are never asked - a check must not spend the free tier.
    const esri = [a, i, b, c, d, p1, p2, e, vf, fh, ft, po, et, sc, wd, wo, wf, wu, gg, ex, eb, eo, bu, pa, pa2, fr, cl, gv, ly, go, gb].reduce((n, r) => n + r.requests.filter((q) => /arcgis(online)?\.com/i.test(urlOf(q))).length, 0);
    if (esri !== 0) fails.push('esri: ' + esri + ' requests reached a real Esri host');

    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    const summary = {
        expected: EXPECT,
        osm: a.reads.map((r) => ({ side: r.side, title: r.title, card: r.cardHole, f: r.f, m: r.m, b: r.b, toHere: r.toHere, hereCenter: r.hereCenter, target: r.target, pin: r.centerPin, watches: r.watches, scrollY: r.scrollY })),
        idleWatches: i.reads.map((r) => r.watches),
        unmapped: b.reads.map((r) => ({ m: r.m, acc: r.acc, banner: r.banner })),
        organizer: c.reads.map((r) => ({ f: r.f, m: r.m, b: r.b, src: r.src })),
        denied: d.reads[1] && d.reads[1].msg,
        verify: vf.reads.map((r) => ({ verify: r.verify, src: r.src, m: r.m })),
        precache: out.precacheSummary,
        attribution: a.reads[1] && a.reads[1].attribution,
        osmFirstGps: a.reads[1] && { zoom: a.reads[1].zoom, bearing: a.reads[1].bearing, bounds: a.reads[1].bounds, minZoom: a.reads[1].minZoom, errs: a.reads[1].errs, courses: a.reads[1].coursesLoaded, ready: a.reads[1].ready },
        esriRequests: esri,
        esriPinning: out.esriSummary,
        polish: out.polishSummary,
        courses: out.courses,
        green: out.greenSummary, layout: out.layoutSummary, flow: out.flowSummary, anyCourse: out.anyCourseSummary, google: out.googleSummary, googleBudget: out.googleBudget,
        esri3x: out.esri3xSummary, esriTileBudget: out.budgetSummary, plays: out.playsSummary, free: out.freeSummary,
        esriRefusedRequests: Object.keys(SEEN.esri).filter((k) => /^DENY/.test(k)).reduce((n, k) => n + SEEN.esri[k].length, 0),
        fails,
    };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(JSON.stringify({ failsSoFar: FAILS_SO_FAR }, null, 1)); process.exit(FAILS_SO_FAR.length ? 1 : 2); });
