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
      // Page errors, recorded: an arm that fails reads WHY (Wave 2 redesign).
      window.__errs = [];
      window.addEventListener('error', function (e) { window.__errs.push(String(e && e.message) + ' @' + (e && e.lineno)); });
      var calls = { watch: 0, clear: 0, active: {}, opts: null };
      window.__geo = calls;
      var nextId = 1, oks = {}, cur = { lat: ${lat}, lng: ${lng}, acc: ${acc} };
      var report = function (id) { if (calls.active[id]) oks[id]({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: cur.acc }, timestamp: Date.now() }); };
      // Wave 2: the golfer walks - every live watch hears the new spot.
      window.__moveTo = function (la, ln) { cur.lat = la; cur.lng = ln; Object.keys(calls.active).forEach(report); return 'moved'; };
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
  var ar = attr ? attr.getBoundingClientRect() : null;
  var gpsBtn = tg && tg.querySelector('.gps-side-gps');
  var card = document.querySelector('.hv-hole-num');
  return { mounted: !!o, gpsShown: !!(o && getComputedStyle(o).display !== 'none'),
           toggle: tg ? (tg.innerText || '').replace(/\\s+/g, ' ').trim() : null,
           toggleOnScreen: !!(tg && tg.getBoundingClientRect().bottom <= innerHeight && tg.getBoundingClientRect().height > 0),
           side: gpsBtn ? (gpsBtn.getAttribute('aria-pressed') === 'true' ? 'gps' : 'bets') : null,
           title: t('.gps-title'), f: t('.gps-f'), m: t('.gps-m'), b: t('.gps-b'), labels: o ? [].slice.call(o.querySelectorAll('.gps-lbl')).map(function (e) { return e.innerText.trim(); }) : [],
           acc: t('.gps-acc'), msg: vis('.gps-msg') ? t('.gps-msg') : '', verify: vis('.gps-verify') ? t('.gps-verify') : '',
           banner: vis('.gps-banner') ? t('.gps-banner') : '', tilesNote: vis('.gps-tiles-note'),
           toHere: vis('.gps-target-row') ? t('.gps-to-here') : '', hereCenter: vis('.gps-target-row') ? t('.gps-here-center') : '',
           units: t('.gps-units'), src: t('.gps-src'),
           set: avail('.gps-set-green'), fix: avail('.gps-fix-green'), undo: avail('.gps-undo-green'),
           target: rect('.gps-target'), centerPin: rect('.gps-pin-mid'), dot: rect('.gps-dot'), teePin: rect('.gps-pin-tee'),
           from: vis('.gps-from') ? t('.gps-from') : '', recenter: vis('.gps-recenter'),
           bearing: ds.bearing == null ? null : Number(ds.bearing), zoom: ds.zoom == null ? null : Number(ds.zoom),
           maxZoom: ds.maxZoom == null ? null : Number(ds.maxZoom), esri: ds.esri || null, esriLoads: Number(ds.esriLoads || 0),
           big: big, vw: innerWidth,
           attribution: attr ? (attr.innerText || '').trim() : null,
           attributionOnScreen: !!(ar && ar.width > 0 && ar.height > 0 && ar.bottom <= innerHeight && ar.top >= 0),
           tilesLoaded: Number(ds.tilesLoaded || 0),
           zoomBtn: vis('.gps-zoom') ? t('.gps-zoom') : null,
           pills: o ? [].slice.call(o.querySelectorAll('.gps-pill')).map(function (e) { return { k: e.classList.contains('gps-pill-to') ? 'to' : 'on', text: (e.innerText || '').trim(), box: e.style.visibility === 'hidden' ? null : box(e) }; }) : [],
           ringPx: q('.gps-target') ? Number(q('.gps-target').dataset.ringPx) : null,
           ringLbl: q('.gps-ring-lbl') ? (q('.gps-ring-lbl').innerText || '').trim() : null,
           boxes: { target: box(q('.gps-target')), ringLbl: box(q('.gps-ring-lbl')), from: box(q('.gps-from')), attrib: box(attr), map: box(mapEl),
                    top: box(q('.gps-top')), sub: box(q('.gps-sub')), right: box(q('.gps-right')), recenterB: box(q('.gps-recenter')), toPill: box(q('.gps-target-row')), bottom: box(q('.gps-bottom')),
                    back: box(q('.gps-pin-back')), front: box(q('.gps-pin-front')), mid: box(q('.gps-pin-mid')), tee: box(q('.gps-pin-tee')), dot: box(q('.gps-dot')) },
           teePx: ds.teePx ? ds.teePx.split(',').map(Number) : null,
           arcs: ds.arcs == null ? null : ds.arcs, arcStep: ds.arcStep == null ? null : Number(ds.arcStep),
           arcLabels: o ? [].slice.call(o.querySelectorAll('.gps-arc-lbl')).filter(function (e) { return e.style.display !== 'none' && e.style.visibility !== 'hidden'; }).map(function (e) { return { text: e.innerText.trim(), box: box(e) }; }) : [],
           midLbl: t('.gps-lbl-mid'), editPin: avail('.gps-edit-pin'), pinSave: vis('.gps-pin-save'), pinClear: vis('.gps-pin-clear'),
           flag: box(q('.gps-flag')), flagEdit: !!(q('.gps-flag') && q('.gps-flag').classList.contains('gps-flag-edit')),
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
           targetRow: vis('.gps-target-row'), editPinShown: avail('.gps-edit-pin'),
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
const WAIT_MAP = { waitFor: `(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.ready === '1' && m.dataset.zoom != null); })()`, timeout: 30000 };
const mapTap = (x, y) => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } } },
                          { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } } },
                          { sleep: 400 }];

async function arm(name, key, ownerUid, mode, me, acc, steps, extra) {
    const code = 'GPS' + name.toUpperCase().slice(0, 5);
    // No check reaches a real outside service: not the weather service, not the
    // elevation service, not Esri. The arms that need one bring a stand-in.
    extra = Object.assign({}, extra || {});
    extra.blockUrls = (extra.blockUrls || []).concat(['*api.weather.gov*', '*epqs.nationalmap.gov*', '*arcgis.com*', '*arcgisonline.com*']);
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
    const f = [];
    const from = mid(g.boxes.dot || g.boxes.tee), tgt = mid(g.boxes.target), ctr = mid(g.boxes.mid);
    const want = { to: lastNum(g.toHere), on: lastNum(g.hereCenter) };
    const ends = { to: [from, tgt], on: [tgt, ctr] };
    g.pills.forEach((p) => {
        if (!p.box) { if (required) f.push(`${tag}: the ${p.k === 'to' ? 'yellow' : 'white'}-line pill is not shown`); return; }
        if (p.text !== want[p.k]) f.push(`${tag}: ${p.k} pill says "${p.text}", the readout says "${want[p.k]}"`);
        const [a, b] = ends[p.k];
        const reach = Math.hypot(p.box.r - p.box.l, p.box.b - p.box.t) / 2 + 8;
        if (a && b && segDist(mid(p.box), a, b) > reach) f.push(`${tag}: the ${p.k} pill is off its line by ${Math.round(segDist(mid(p.box), a, b))}px`);
        const bad = ['target', 'ringLbl', 'back', 'front', 'mid', 'tee', 'dot', 'from', 'attrib', 'top', 'sub', 'right', 'recenterB', 'toPill', 'bottom'].filter((k) => hitBox(p.box, g.boxes[k]));
        if (hitBox(p.box, greenPage(g))) bad.push('green');
        if (bad.length) f.push(`${tag}: the ${p.k} pill covers ${bad.join(', ')}: ` + JSON.stringify(p.box));
    });
    if (hitBox(g.pills[0] && g.pills[0].box, g.pills[1] && g.pills[1].box)) f.push(tag + ': the two pills overlap');
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
function arcFails(tag, g, totalYd, lat) {
    const f = [];
    const rule = arcStepRule(lat == null ? H1.mid[0] : lat, g.zoom);
    if (g.arcStep !== rule.step && !rule.edge) f.push(`${tag}: arcs every ${g.arcStep} yds at zoom ${g.zoom}, expected every ${rule.step}`);
    const want = expectArcs(totalYd, g.arcStep);
    if (g.arcs !== want) f.push(`${tag}: arcs "${g.arcs}", expected "${want}"`);
    const n = want ? want.split(' ').length : 0;
    if (g.arcLabels.length < Math.min(n, Math.ceil(n * 0.6))) f.push(`${tag}: only ${g.arcLabels.length} of ${n} arc labels shown`);
    const lineX = mid(g.boxes.mid) && mid(g.boxes.dot || g.boxes.tee);
    g.arcLabels.forEach((l) => {
        if (!/^\d+y( to pin)?$/.test(l.text)) f.push(`${tag}: arc label "${l.text}"`);
        const c = mid(g.boxes.mid);
        if (c && l.box && l.box.r > c.x + 2) f.push(`${tag}: arc label "${l.text}" is not at the left end (right edge ${l.box.r}, line x ${Math.round(c.x)})`);
        const bad = ['target', 'ringLbl', 'back', 'front', 'mid', 'dot', 'tee', 'attrib', 'top', 'sub', 'right', 'recenterB', 'toPill', 'bottom'].filter((k) => hitBox(l.box, g.boxes[k]));
        g.pills.forEach((p) => { if (hitBox(l.box, p.box)) bad.push('a pill'); });
        if (bad.length) f.push(`${tag}: arc label "${l.text}" covers ${bad.join(', ')}`);
    });
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
//   /points/.., /gridpoints/.. the National Weather Service (as before).
const SEEN = { esri: {}, epqs: [], nws: [] };
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
            if ((m = /^\/ctl\/break\/([A-Za-z0-9-]+)/.exec(q.url))) { BROKEN.add(m[1]); r.writeHead(200, h); return r.end('broken'); }
            if (/^\/epqs\?/.test(q.url)) {
                SEEN.epqs.push(q.url);
                const u = new URL(q.url, 'http://x');
                const k = (+u.searchParams.get('y')).toFixed(5) + ',' + (+u.searchParams.get('x')).toFixed(5);
                r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, h));
                return r.end(JSON.stringify({ location: { x: +u.searchParams.get('x'), y: +u.searchParams.get('y') }, value: k in ELEV ? ELEV[k] : -1000000 }));
            }
            SEEN.nws.push(q.url);
            const hj = Object.assign({ 'Content-Type': 'application/geo+json' }, h);
            if (/^\/points\/-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(q.url)) { r.writeHead(200, hj); return r.end(JSON.stringify({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/XXX/1,2/forecast/hourly' } })); }
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
        fails.push(...arcFails('osm', gps, ME_CENTER_YD));
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
        if (gps.toHere !== 'You → target: ' + EXPECT.half || gps.hereCenter !== 'Target → center: ' + EXPECT.half) fails.push('osm: target did not start halfway: ' + gps.toHere + ' / ' + gps.hereCenter);
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
        if (a.dump.storage.hardpan_round_side !== 'gps') fails.push('osm: side not stored');
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
    // The golfer's spot is an arbitrary point in Myrtle Beach; Pine Lakes ships no
    // OSM greens, so only one thing about it matters - the tapped green is far
    // from it, so the privacy scan cannot mistake one for the other.
    const pl = [33.7111, -78.8869];
    const b = await arm('unmap', 'pinelakes', null, 'ok', pl, 20, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-set-green' }, { sleep: 200 }, { expression: READ },
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
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 200 }, ...mapTap(80, 160),
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
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-fix-green' }, { sleep: 300 }, { expression: READ },
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
        if (off.arcs !== expectArcs(ME_CENTER_YD, off.arcStep) || !off.arcStep) fails.push('offline: arcs with no signal "' + off.arcs + '"');
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
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-set-green' }, { sleep: 3000 }, { expression: READ },
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
        fails.push(...arcFails('off-hole', g, TEE_CENTER_YD));
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
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 1 2x
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 2 3x
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 3 1x
        { tap: '.gps-zoom' }, { sleep: 500 }, { expression: READ },                // 4 2x
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
        [[z1, '1x', z1.zoom], [z2, '2x', Math.min(z1.zoom + 1, cap)], [z3, '3x', Math.min(z1.zoom + Math.log2(3), cap)], [z1b, '1x', z1.zoom], [z2b, '2x', Math.min(z1.zoom + 1, cap)], [rc, '1x', z1.zoom]].forEach(([g, lbl, z], k) => {
            if (g.zoomBtn !== lbl) fails.push(`polish ${k}: zoom button "${g.zoomBtn}", expected ${lbl}`);
            if (!near(g.zoom, z, 0.02)) fails.push(`polish ${k}: zoom ${g.zoom}, expected ${z.toFixed(2)}`);
            if (g.bearing !== 102) fails.push(`polish ${k}: the hole's turn was lost: bearing ${g.bearing}`);
            const want = ringPxAt(H1.mid[0], g.zoom);
            if (!near(g.ringPx, Math.max(6, Math.round(want)), 2)) fails.push(`polish ${k}: ring ${g.ringPx}px across, 20 yds is ${want.toFixed(1)}px at zoom ${g.zoom}`);
            if (g.ringLbl !== '20 yd') fails.push(`polish ${k}: ring label "${g.ringLbl}"`);
            const tc = mid(g.boxes.target);
            if (!g.boxes.ringLbl || !tc || g.boxes.ringLbl.l < tc.x + g.ringPx / 2) fails.push(`polish ${k}: the ring label is not beside the ring`);
            fails.push(...pillFails('polish ' + k, g, lbl === '1x'));
            if (g.toHere !== z1.toHere) fails.push(`polish ${k}: zooming moved the target: ${g.toHere}`);
        });
        if (dist(z2.target, z3.target) > 2) fails.push('polish: 2x -> 3x did not zoom around the target: ' + JSON.stringify([z2.target, z3.target]));
        [z1, z2, z3].forEach((g, k) => { const rule = arcStepRule(H1.mid[0], g.zoom); if (g.arcStep !== rule.step && !rule.edge) fails.push(`polish ${k}: arcs every ${g.arcStep} yds at zoom ${g.zoom}, expected ${rule.step}`); });
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

    // ---- Edit Pin: today's hole location, for the whole group --------------------
    // Another phone's pin, deliberately NOT computed by gps-geo: 35% of the way
    // from the green's point farthest from the tee back toward its center.
    const far = H1.green.reduce((b, p) => (inlineHaversineM(H1.tee, p) > inlineHaversineM(H1.tee, b) ? p : b), H1.green[0]);
    // Saved a minute AFTER this phone's own save, so it is the newer pin.
    const OTHER = { lat: +(far[0] + 0.35 * (H1.mid[0] - far[0])).toFixed(6), lng: +(far[1] + 0.35 * (H1.mid[1] - far[1])).toFixed(6), at: Date.now() + 60000 };
    const yd = (a, b) => String(Math.round(inlineHaversineM(a, b) / 0.9144));
    const ep = await arm('editp', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },          // 0
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 400 }, { expression: READ },                   // 1 editing
        { drag: '.gps-flag', dx: 0, dy: -14 }, { sleep: 400 }, { expression: READ },      // 2 dragged toward the back
        { drag: '.gps-flag', dx: 170, dy: 0 }, { sleep: 400 }, { expression: READ },      // 3 dragged off the green: stays on it
        { tap: '.gps-pin-save' }, { sleep: 500 }, { expression: READ },                   // 4 saved
        { deliver: { path: 'events/GPSEDITP', value: Object.assign(round('caledonia'), { pinLocs: { h1: OTHER } }) } }, { sleep: 600 }, { expression: READ }, // 5 another phone, later
        // NO SIGNAL: moved and saved again - it must go into the phone's durable
        // queue (and, unsent, it is what this phone shows: the app's rule for
        // every unsent write).
        { expression: '(window.__coldSetOffline(true), "offline")' },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 300 }, { drag: '.gps-flag', dx: 0, dy: 10 }, { sleep: 300 },
        { tap: '.gps-pin-save' }, { sleep: 500 }, { expression: READ },                   // 6 saved offline
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 300 }, { tap: '.gps-pin-clear' }, { sleep: 500 }, { expression: READ }, // 7 pin to center
    ]);
    out.editPin = ep; bail(out, ep);
    {
        const [r0, r1, r2, r3, r4, r5, r6, r7] = ep.reads;
        if (r0.midLbl !== 'CENTER' || !r0.editPin || r0.flag) fails.push('edit pin: before - ' + JSON.stringify([r0.midLbl, r0.editPin, r0.flag]));
        if (r1.banner !== "Drag the flag to today's pin" || !r1.flagEdit || !r1.pinSave) fails.push('edit pin: not editing - ' + JSON.stringify([r1.banner, r1.flagEdit, r1.pinSave]));
        if (r1.flag && r1.centerPin && dist(mid(r1.flag), r1.centerPin) > 3) fails.push('edit pin: the flag did not start on the center');
        if (r1.fix) fails.push('edit pin: "Fix the green" offered while editing the pin');
        ['zoomBox', 'recenterBox', 'windBox'].forEach((k) => { if (hitBox(r1.bannerBox, r1[k])) fails.push(`edit pin: the banner covers the ${k.replace('Box', '')}`); });
        if (hitBox(r1.bannerBox, greenPage(r1)) || hitBox(r1.bannerBox, r1.flag)) fails.push('edit pin: the banner covers the green or the flag');
        if (!(r2.flag && r1.flag && mid(r2.flag).y < mid(r1.flag).y - 6)) fails.push('edit pin: the flag did not follow the drag: ' + JSON.stringify([r1.flag, r2.flag]));
        if (r2.midLbl !== 'PIN' || r2.m === r1.m || !/^Target → pin: \d+$/.test(r2.hereCenter)) fails.push('edit pin: numbers did not follow the flag live: ' + JSON.stringify([r1.m, r2.m, r2.midLbl, r2.hereCenter]));
        if (r2.arcs === r1.arcs && r2.m !== r1.m && expectArcs(+r2.m, r2.arcStep) !== expectArcs(+r1.m, r1.arcStep)) fails.push('edit pin: arcs did not follow the flag');
        const gb = greenPage(r3), fc = mid(r3.flag);
        if (!gb || !fc || fc.x < gb.l - 2 || fc.x > gb.r + 2 || fc.y < gb.t - 2 || fc.y > gb.b + 2) fails.push('edit pin: the flag left the green: ' + JSON.stringify([fc, gb]));
        const sets = ep.dump.writes.filter((x) => x.path === 'events/GPSEDITP/pinLocs/h1' && x.op === 'set');
        const w = sets[0], wOff = sets[1];
        if (!w || !isFinite(w.value.lat) || !isFinite(w.value.lng) || !isFinite(w.value.at)) fails.push('edit pin: Save wrote nothing to events/<code>/pinLocs/h1: ' + JSON.stringify(ep.dump.writes.map((x) => x.path)));
        else {
            if (r4.m !== yd(ME, [w.value.lat, w.value.lng])) fails.push(`edit pin: after save PIN ${r4.m}, golfer -> saved pin is ${yd(ME, [w.value.lat, w.value.lng])}`);
            if (Object.keys(w.value).sort().join() !== 'at,lat,lng') fails.push('edit pin: the pin record carries more than lat/lng/at: ' + JSON.stringify(w.value));
        }
        if (r4.flagEdit || r4.pinSave || r4.midLbl !== 'PIN' || !r4.flag) fails.push('edit pin: after save - ' + JSON.stringify([r4.flagEdit, r4.pinSave, r4.midLbl, !!r4.flag]));
        if (!wOff || !wOff.offline) fails.push('edit pin: no offline save - this arm proves nothing about no signal: ' + JSON.stringify(sets));
        else if (r6.m !== yd(ME, [wOff.value.lat, wOff.value.lng])) fails.push(`edit pin: saved with no signal, PIN ${r6.m}, expected ${yd(ME, [wOff.value.lat, wOff.value.lng])}`);
        if (!/pinLocs/.test(ep.dump.storage.golfapp_wq_v1 || '')) fails.push('edit pin: a pin saved with no signal is not in the offline queue');
        if (r5.m !== yd(ME, [OTHER.lat, OTHER.lng])) fails.push(`edit pin: another phone's pin not shown: PIN ${r5.m}, expected ${yd(ME, [OTHER.lat, OTHER.lng])}`);
        if (!ep.dump.writes.some((x) => x.path === 'events/GPSEDITP/pinLocs/h1' && x.op === 'remove')) fails.push('edit pin: "Pin to center" did not remove the pin');
        if (r7.midLbl !== 'CENTER' || r7.m !== EXPECT.center || r7.flag) fails.push('edit pin: after "Pin to center" - ' + JSON.stringify([r7.midLbl, r7.m, !!r7.flag]));
        if (ep.dump.writes.some((x) => /course_gps|gpsPins/.test(x.path))) fails.push('edit pin: moving the pin touched the GREEN data');
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

    // ---- wind -------------------------------------------------------------------
    const windProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-wind-profile-'));
    const nws0 = nwsSeen.length;
    const wd = await arm('wind', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { waitFor: `!!(document.querySelector('.gps-wind') && document.querySelector('.gps-wind').style.display !== 'none')`, timeout: 15000 }, { expression: READ }, // 0
        { expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, { sleep: 1500 }, { expression: READ },  // 1 reload: from the phone
        { expression: `(function(){var k='hardpan_wind_v1_caledonia',w=JSON.parse(localStorage.getItem(k));if(!w)return 'no wind reading';w.at=Date.now()-16*60000;localStorage.setItem(k,JSON.stringify(w));return 'aged';})()` },
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 200 }, { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-units' }, { sleep: 1500 }, { expression: READ }, // 2 16 min old: asked again
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, profileDir: windProfile });
    out.wind = wd; bail(out, wd);
    const nwsAfterFirst = nwsSeen.slice(nws0);
    const wo = await arm('windoff', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, blockUrls: ['*' + SO.replace('http://', '') + '/points*', '*' + SO.replace('http://', '') + '/gridpoints*'] });
    out.windOff = wo; bail(out, wo);
    {
        const [w0, w1, w2] = wd.reads;
        if (!/^↑\s*12 mph$/.test(w0.wind || '')) fails.push('wind: box reads ' + JSON.stringify(w0.wind));
        if (w0.windRot !== windRotFor(w0.bearing)) fails.push(`wind: arrow turned ${w0.windRot}, expected ${windRotFor(w0.bearing)} (to the SE, on a map turned ${w0.bearing})`);
        const wb = w0.windBox, at = w0.boxes.attrib, mp = w0.boxes.map;
        // Redesign: top of the right-hand stack, under the top panel.
        if (!wb || !at || !w0.boxes.top || wb.r < mp.r - 20 || wb.l < (mp.l + mp.r) / 2 || wb.t < w0.boxes.top.b || wb.t > w0.boxes.top.b + 30) fails.push('wind: not at the top of the right-hand stack: ' + JSON.stringify([wb, w0.boxes.top]));
        if (hitBox(wb, w0.scoreBox)) fails.push('wind: covers the score button');
        const pts = nwsAfterFirst.filter((u) => u.startsWith('/points/'));
        const hourly = nwsAfterFirst.filter((u) => u.startsWith('/gridpoints/'));
        const want = `/points/${Math.round(H1.mid[0] * 1e3) / 1e3},${Math.round(H1.mid[1] * 1e3) / 1e3}`;
        if (pts.length !== 1 || pts[0] !== want) fails.push(`wind: NWS asked ${JSON.stringify(pts)}, expected once for the COURSE point ${want}`);
        if (hourly.length !== 2) fails.push(`wind: hourly forecast asked ${hourly.length} times (expected 2: first look, then 16 minutes later; NOT on the reload)`);
        if (w1.wind !== w0.wind) fails.push('wind: not shown from the phone after a reload: ' + w1.wind);
        if (w2.wind !== w0.wind) fails.push('wind: lost when refreshed: ' + w2.wind);
        if (nwsAfterFirst.some((u) => u.indexOf(ME[0].toFixed(3)) !== -1 && u.indexOf(ME[1].toFixed(3)) !== -1 && want.indexOf(ME[0].toFixed(3)) === -1)) fails.push('wind: the golfer\'s position went to the weather service');
        if (wo.reads[0].wind !== null) fails.push('wind: shown with no weather service reachable: ' + wo.reads[0].wind);
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
            { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 300 }, { drag: '.gps-flag', dx: 0, dy: -10 }, { sleep: 400 }, { expression: READ },
            { tap: '.gps-pin-cancel' }, { sleep: 300 },
        ], { preScript: sensor('ok', away[0], away[1], 5) + NWS_CFG });
        bail(out, cr);
        const [g, e] = cr.reads, tag = tc.label + ' #' + tc.hole;
        const total = inlineHaversineM(hr.tee, hr.mid) / 0.9144;
        const res = { course: tag, title: g.title, fcb: [g.f, g.m, g.b], arcs: g.arcs, arcLabels: g.arcLabels.length, score: g.score, wind: g.wind, pinLive: [g.m, e.m, e.midLbl] };
        out.courses.push(res);
        if (g.title !== `Hole ${tc.hole} · Par ${sb.p[tc.key].data[tc.hole - 1].par}`) fails.push(`${tag}: title ${g.title}`);
        if (g.m !== String(Math.round(total))) fails.push(`${tag}: center ${g.m}, tee -> center is ${Math.round(total)}`);
        fails.push(...arcFails(tag, g, total, hr.mid[0]), ...teeInView(tag, g), ...pillFails(tag, g, true));
        if (g.score !== `Hole ${tc.hole} · Enter Score`) fails.push(`${tag}: score button ${g.score}`);
        if (!/12 mph/.test(g.wind || '') || g.windRot !== windRotFor(g.bearing)) fails.push(`${tag}: wind ${g.wind} turned ${g.windRot} (expected ${windRotFor(g.bearing)})`);
        if (e.midLbl !== 'PIN' || e.m === g.m || !e.flagEdit) fails.push(`${tag}: Edit Pin did not move PIN live: ` + JSON.stringify([g.m, e.m, e.midLbl]));
        if (cr.dump.writes.length) fails.push(`${tag}: Cancel still wrote ` + cr.dump.writes.map((x) => x.path).join(', '));
    }

    // ==== WAVE 2 (2026-10-08) =======================================================
    const zOf = (tok) => (SEEN.esri[tok] || []);

    // ---- Esri live on a short par 3: 3x reaches its full step; z19 tiles at most ----
    // Caledonia #3 (par 3). Then Edit Pin: the picture goes to USGS while a pin is
    // placed (shared data is never derived from Esri imagery).
    const ex = await arm('esrix', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { tap: '.gps-next' }, { sleep: 500 }, { tap: '.gps-next' }, { sleep: 1500 }, { expression: READ },   // 0 hole 3, 1x
        { tap: '.gps-zoom' }, { sleep: 800 }, { expression: READ },                                                          // 1 2x
        { tap: '.gps-zoom' }, { sleep: 2500 }, { expression: READ },                                                         // 2 3x
        { tap: '.gps-zoom' }, { sleep: 500 }, { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 800 }, { expression: READ },                 // 3 Edit Pin
        { tap: '.gps-pin-cancel' }, { sleep: 800 }, { expression: READ },                                                    // 4 back
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-3X' }) });
    out.esri3x = ex; bail(out, ex);
    {
        const [z1, z2, z3, pin, back] = ex.reads;
        if (z1.title !== 'Hole 3 · Par 3') fails.push('esri 3x: not on the par 3: ' + z1.title);
        if (z1.esri !== 'visible' || z1.maxZoom !== 21) fails.push('esri 3x: Esri not live: ' + JSON.stringify([z1.esri, z1.maxZoom]));
        if (!(z1.attribHtml || '').includes(ESRI_CREDIT)) fails.push('esri 3x: credit ' + JSON.stringify(z1.attribHtml));
        const want3 = z1.zoom + Math.log2(3);
        if (Math.abs(z3.zoom - want3) > 0.02 || z3.zoomBtn !== '3x') fails.push(`esri 3x: 3x reached zoom ${z3.zoom}, its full step is ${want3.toFixed(2)} (max ${z3.maxZoom})`);
        const zs = zOf('OK-3X'), top = Math.max(...zs);
        if (top !== 19 && z3.zoom >= 18) fails.push(`esri 3x: at map zoom ${z3.zoom} the closest Esri tiles asked for were z${top} (expected exactly 19 - never past it)`);
        if (z3.esriSrcMax !== 19) fails.push('esri 3x: source max ' + z3.esriSrcMax);
        if (pin.esri !== 'none' || pin.maxZoom !== 18 || /Powered by Esri/.test(pin.attribution || '')) fails.push('esri 3x: Edit Pin is not on USGS: ' + JSON.stringify([pin.esri, pin.maxZoom, pin.attribution]));
        if (back.esri !== 'visible' || back.maxZoom !== 21) fails.push('esri 3x: Esri did not come back after Edit Pin: ' + JSON.stringify([back.esri, back.maxZoom]));
        out.esri3xSummary = { zooms: [z1.zoom, z2.zoom, z3.zoom], maxZoom: z1.maxZoom, highestTileZ: top, tileRequests: zs.length };
    }

    // ---- Esri breaks MID-ROUND (tiles loaded first): USGS takes over ---------------
    const eb = await arm('esrib', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 2500 }, { expression: READ },                                          // 0 Esri drawing
        { expression: `fetch('${SO}/ctl/break/OK-BREAK').then(function () { return 'broke'; })` }, { sleep: 300 },
        { tap: '.gps-zoom' }, { sleep: 800 }, { tap: '.gps-zoom' }, { sleep: 2500 }, { expression: READ },                   // 1 new tiles refused
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
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 300 }, { drag: '.gps-flag', dx: 0, dy: -14 }, { sleep: 400 }, { expression: READ }, // 6 pin dragged: live
        { tap: '.gps-pin-save' }, { sleep: 2500 }, { expression: READ },                                     // 7 saved
        // The writes are recorded per page: read the pin's before the reload below.
        { expression: `'PINW' + JSON.stringify((window.__coldWrites || []).filter(function (x) { return /pinLocs\\/h1$/.test(x.path) && x.op === 'set'; }))` },
        { tap: '.gps-next' }, { sleep: 3500 }, { expression: READ },                                         // 8 hole 2
        { tap: '.gps-prev' }, { sleep: 1500 }, { expression: READ },                                         // 9 hole 1 again
        { expression: 'location.reload()' }, { sleep: 4000 }, WAIT_MAP, { sleep: 2500 }, { expression: READ },          // 10 reloaded
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'DENY-PLAYS', nws: true, epqs: true }), profileDir: plaProfile });
    out.plays = pa; bail(out, pa);
    {
        const R = pa.reads;
        const [p0, pm, p40, pnear, pgreen, pback, pdrag, psaved, ph2, ph1, preload] = R;
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
        if (pdrag.midLbl !== 'PIN' || num(pdrag.plays) === num(pback.plays)) fails.push('plays: did not follow Edit Pin live: ' + JSON.stringify([pback.plays, pdrag.plays, pdrag.midLbl]));
        const pinRaw = pa.raw.find((v) => typeof v === 'string' && v.startsWith('PINW'));
        const pinW = pinRaw ? JSON.parse(pinRaw.slice(4))[0] : null;
        if (pinW) near(num(psaved.plays), expectPlays(ME, 0.55, [pinW.value.lat, pinW.value.lng], 130).yd, 'to the saved pin (no height there: the green center\'s)');
        else fails.push('plays: the pin was not saved');
        if (!/^Hole 2/.test(ph2.title)) fails.push('plays: Next did not reach hole 2');
        if (ph1.plays !== psaved.plays) fails.push('plays: hole 1 again reads ' + ph1.plays + ', was ' + psaved.plays);
        // The stand-in database is re-made from the fixture on a reload (the pin is
        // gone there): after it, plays like is to the center again - from the
        // phone's cached heights.
        if (preload.midLbl !== 'CENTER' || num(preload.plays) !== num(p0.plays)) fails.push('plays: after a reload reads ' + JSON.stringify([preload.midLbl, preload.plays]) + ', expected ' + p0.plays);
        const asked = SEEN.epqs.slice(epqs0);
        const keys = asked.map((u) => { const q = new URL(u, 'http://x').searchParams; return (+q.get('y')).toFixed(5) + ',' + (+q.get('x')).toFixed(5); });
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (dupes.length) fails.push('plays: EPQS asked again for a point it already answered (no cache?): ' + dupes.slice(0, 3).join(' | '));
        const allowed = new Set(COURSE_KEYS); if (pinW) allowed.add(r5k([pinW.value.lat, pinW.value.lng]));
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
        { tap: '.gps-tools' }, { sleep: 250 }, { tap: '.gps-edit-pin' }, { sleep: 400 }, { drag: '.gps-flag', dx: 0, dy: -24 }, { sleep: 500 }, { expression: READ }, // 3 pin dragged
        { tap: '.gps-pin-save' }, { sleep: 700 }, { expression: READ },                                 // 4 saved
        { tap: '.gps-green-view' }, { sleep: 900 }, { expression: READ },                               // 5 back to the hole
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + CFG({ esri: 'OK-GREEN' }) });
    out.green = gv; bail(out, gv);
    {
        const [h0, g1, gm, g3, g4, h5] = gv.reads;
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
        if (g3.maxZoom !== 18 || g3.esri !== 'none') fails.push('green: Edit Pin in the green view is not on USGS: ' + JSON.stringify([g3.esri, g3.maxZoom]));
        if (lbl(g1, 'f') !== 'F ' + g1.f || lbl(g1, 'c') !== 'C ' + g1.m || lbl(g1, 'b') !== 'B ' + g1.b || lbl(g1, 'p')) fails.push('green: labels ' + JSON.stringify(g1.greenLbls.map((x) => x.text)) + ' vs F/C/B ' + [g1.f, g1.m, g1.b].join('/'));
        if (g1.f !== EXPECT.front || g1.m !== EXPECT.center || g1.b !== EXPECT.back) fails.push('green: the numbers changed in the green view: ' + [g1.f, g1.m, g1.b].join('/'));
        g1.greenLbls.forEach((x) => { const near = { f: g1.boxes.front, c: g1.boxes.mid, b: g1.boxes.back }[x.k]; if (near && x.box && Math.abs((x.box.t + x.box.b) / 2 - (near.t + near.b) / 2) > 30) fails.push('green: label ' + x.text + ' is not beside its point'); });
        if (!dimsIn(g1.greenDims, G_DEPTH, G_WIDTH, 'yds')) fails.push(`green: "${g1.greenDims}", inline ${G_DEPTH} deep x ${G_WIDTH} wide`);
        if (!dimsIn(gm.greenDims, G_DEPTH_M, G_WIDTH_M, 'm')) fails.push(`green (meters): "${gm.greenDims}", inline ${G_DEPTH_M} x ${G_WIDTH_M} m`);
        if (!g3.flagEdit || g3.view !== 'green' || g3.midLbl !== 'PIN' || lbl(g3, 'p') !== 'PIN ' + g3.m) fails.push('green: Edit Pin in the green view - ' + JSON.stringify([g3.flagEdit, g3.view, g3.midLbl, lbl(g3, 'p'), g3.m]));
        const w = gv.dump.writes.filter((x) => /pinLocs\/h1$/.test(x.path) && x.op === 'set')[0];
        if (!w) fails.push('green: Save pin in the green view wrote nothing');
        if (lbl(g4, 'p') !== 'PIN ' + g4.m || lbl(g4, 'c') !== 'C ' + EXPECT.center) fails.push('green: after save - ' + JSON.stringify(g4.greenLbls.map((x) => x.text)));
        if (h5.view !== 'hole' || h5.bearing !== h0.bearing || Math.abs(h5.zoom - h0.zoom) > 0.02 || h5.zoomBtn !== '1x' || h5.greenBtn !== '⛳ Green' || h5.greenLbls.length || h5.greenDims) fails.push('green: "Hole" did not return to the hole view: ' + JSON.stringify([h5.view, h5.bearing, h5.zoom, h0.zoom, h5.zoomBtn, h5.greenBtn, h5.greenLbls.length]));
        out.greenSummary = { zoom: [h0.zoom, g1.zoom], dims: g1.greenDims, inline: [G_DEPTH, G_WIDTH], labels: g1.greenLbls.map((x) => x.text), afterPin: g4.greenLbls.map((x) => x.text) };
    }

    // ---- REDESIGN STEP 1: the hole picker, Enter Score ›, Back, FREE PAN on the course ----
    const WHEEL = (dy) => ({ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: 195, y: 420, deltaX: 0, deltaY: dy } } });
    const ly = await arm('layout', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },                                      // 0 hole 1
        // FREE PAN: far up the course (six long drags), then far zoomed out (wheel).
        ...[0, 1, 2, 3, 4, 5].map(() => ({ drag: '.gps-map', at: { fx: 0.5, fy: 0.3 }, dx: 0, dy: 320 })), { sleep: 600 }, { expression: READ }, // 1 panned
        WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 300 }, WHEEL(800), { sleep: 700 }, { expression: READ }, // 2 zoomed out
        { tap: '.gps-recenter' }, { sleep: 600 }, { expression: READ },                                                   // 3 Recenter
        { tap: '.gps-hole-btn' }, { sleep: 400 }, { expression: READ },                                                   // 4 picker open
        { tap: '.gps-picker-grid button[data-hole="5"]' }, { sleep: 900 }, { expression: READ },                          // 5 hole 5
        { drag: '.gps-map', at: { fx: 0.5, fy: 0.4 }, dx: 120, dy: 80 }, { sleep: 400 },
        { tap: '.gps-score-next' }, { sleep: 900 }, { expression: READ },                                                 // 6 › hole 6, own view
        { tap: '.gps-back' }, { sleep: 500 }, { expression: READ },                                                       // 7 Back -> the card
    ]);
    out.layout = ly; bail(out, ly);
    {
        const [l0, l1, l2, l3, l4, l5, l6, l7] = ly.reads;
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
        const sheetWant = ['HardPan GPS — coming soon', 'Satellite hole map', 'Yardage arcs', "Edit Pin (today's pin)", 'Wind', 'Plays-like yardage', 'Not now'];
        if (!f1.sheet || sheetWant.some((w) => f1.sheet.indexOf(w) === -1) || /Season Pass/i.test(f1.sheet)) fails.push('free: the upgrade sheet: ' + JSON.stringify(f1.sheet));
        if (/\$|\/year|trial|Coming soon$/.test(f1.sheet.replace('HardPan GPS — coming soon', ''))) fails.push('free: the sheet shows a price or a buy button: ' + JSON.stringify(f1.sheet));
        if (f2.sheet) fails.push('free: "Not now" did not close the sheet');
        if (!f2.basicMode || f2.mapWrapShown || f2.map) fails.push('free: a map on the free screen: ' + JSON.stringify([f2.basicMode, f2.mapWrapShown, f2.map]));
        if (f2.f !== EXPECT.front || f2.m !== EXPECT.center || f2.b !== EXPECT.back) fails.push(`free: F/C/B ${f2.f}/${f2.m}/${f2.b}, expected ${EXPECT.front}/${EXPECT.center}/${EXPECT.back}`);
        if (f2.acc !== '±6 yds' || f2.title !== 'Hole 1 · Par ' + sb.p.caledonia.data[0].par) fails.push('free: title / accuracy ' + JSON.stringify([f2.title, f2.acc]));
        if (f2.score !== 'Hole 1 · Enter Score' || !f2.getPro) fails.push('free: Enter Score / Get HardPan GPS: ' + JSON.stringify([f2.score, f2.getPro]));
        if (f2.targetRow || f2.editPinShown || f2.fix || f2.set || f2.wind || f2.plays) fails.push('free: a Pro feature is showing: ' + JSON.stringify({ target: f2.targetRow, editPin: f2.editPinShown, fix: f2.fix, set: f2.set, wind: f2.wind, plays: f2.plays }));
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
    [[a, ME], [i, ME], [b, pl], [c, ME], [d, ME], [p1, ME], [p2, ME], [e, pl], [vf, TME], [fh, FAR], [ft, ME], [po, ME], [et, ME], [ep, ME], [sc, ME], [wd, ME], [wo, ME],
     [ex, ME], [eb, ME], [eo, ME], [bu, ME], [pa, ME], [pa2, ME], [fr, ME], [cl, ME], [gv, ME], [ly, ME]].forEach(([r, me]) => {
        const l = leaks(r, me);
        if (l.length) fails.push(r.name + ': the golfer\'s position left the page: ' + l.slice(0, 3).join(' | '));
    });
    // Wave 2: every arm's Esri is the stand-in (refusing, by default). The real
    // Esri hosts are never asked - a check must not spend the free tier.
    const esri = [a, i, b, c, d, p1, p2, e, vf, fh, ft, po, et, ep, sc, wd, wo, ex, eb, eo, bu, pa, pa2, fr, cl, gv, ly].reduce((n, r) => n + r.requests.filter((q) => /arcgis(online)?\.com/i.test(urlOf(q))).length, 0);
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
        green: out.greenSummary, layout: out.layoutSummary,
        esri3x: out.esri3xSummary, esriTileBudget: out.budgetSummary, plays: out.playsSummary, free: out.freeSummary,
        esriRefusedRequests: Object.keys(SEEN.esri).filter((k) => /^DENY/.test(k)).reduce((n, k) => n + SEEN.esri[k].length, 0),
        fails,
    };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(JSON.stringify({ failsSoFar: FAILS_SO_FAR }, null, 1)); process.exit(FAILS_SO_FAR.length ? 1 : 2); });
