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
      var calls = { watch: 0, clear: 0, active: {}, opts: null };
      window.__geo = calls;
      var nextId = 1;
      var fake = {
        watchPosition: function (ok, err, opts) {
          var id = nextId++; calls.watch++; calls.active[id] = true; calls.opts = opts || null;
          setTimeout(function () {
            if (!calls.active[id]) return;
            if (${JSON.stringify(mode)} === 'denied') err({ code: 1, message: 'User denied Geolocation' });
            else ok({ coords: { latitude: ${lat}, longitude: ${lng}, accuracy: ${acc} }, timestamp: Date.now() });
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
           set: vis('.gps-set-green'), fix: vis('.gps-fix-green'), undo: vis('.gps-undo-green'),
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
                    back: box(q('.gps-pin-back')), front: box(q('.gps-pin-front')), mid: box(q('.gps-pin-mid')), tee: box(q('.gps-pin-tee')), dot: box(q('.gps-dot')) },
           teePx: ds.teePx ? ds.teePx.split(',').map(Number) : null,
           arcs: ds.arcs == null ? null : ds.arcs, arcStep: ds.arcStep == null ? null : Number(ds.arcStep),
           arcLabels: o ? [].slice.call(o.querySelectorAll('.gps-arc-lbl')).filter(function (e) { return e.style.display !== 'none' && e.style.visibility !== 'hidden'; }).map(function (e) { return { text: e.innerText.trim(), box: box(e) }; }) : [],
           midLbl: t('.gps-lbl-mid'), editPin: vis('.gps-edit-pin'), pinSave: vis('.gps-pin-save'), pinClear: vis('.gps-pin-clear'),
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
           usgsCached: window.__usgsN == null ? null : window.__usgsN };
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
    // No check reaches the real weather service: the wind arm brings a stand-in.
    extra = Object.assign({}, extra || {});
    extra.blockUrls = (extra.blockUrls || []).concat(['*api.weather.gov*']);
    const res = await arriveCold(Object.assign({
        url: fileUrl('index.html', 'game=' + code + '&group=1'),
        rounds: { [code]: round(key, ownerUid) },
        viewport: { width: 390, height: 844 },
        preScript: sensor(mode, me[0], me[1], acc),
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
    r.dump.writes.forEach((w) => hay.push('write ' + w.path + ' ' + JSON.stringify(w.value)));
    r.requests.forEach((q) => hay.push('request ' + urlOf(q)));
    Object.keys(r.dump.storage).forEach((k) => hay.push('storage ' + k + ' ' + r.dump.storage[k]));
    return hay.filter((h) => needles.some((n) => h.indexOf(n) !== -1));
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
        const bad = ['target', 'ringLbl', 'back', 'front', 'mid', 'tee', 'dot', 'from', 'attrib'].filter((k) => hitBox(p.box, g.boxes[k]));
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
        const bad = ['target', 'ringLbl', 'back', 'front', 'mid', 'dot', 'tee', 'attrib'].filter((k) => hitBox(l.box, g.boxes[k]));
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
    // Wave 1: and above the score button / wind row.
    [['score button', g.scoreBox], ['wind box', g.windBox]].forEach(([n, b]) => { if (b && teeY + 8 > b.t - 4 && g.teePx[0] + m.l > b.l - 8 && g.teePx[0] + m.l < b.r + 8) f.push(`${tag}: the tee (y ${teeY}) is under the ${n} (top ${b.t})`); });
    if (g.teePx[0] < 8 || g.teePx[0] > m.r - m.l - 8) f.push(`${tag}: the tee is off the side of the map (x ${g.teePx[0]})`);
    const gb = greenPage(g);
    if (!gb || gb.t < m.t + 4 || (g.boxes.back && g.boxes.back.t < m.t)) f.push(`${tag}: the back of the green is cut off: ` + JSON.stringify([gb, g.boxes.back, m.t]));
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
const TAP_SHORT_OF_GREEN = `(function () { var f = document.querySelector('#gps-overlay .gps-pin-front').getBoundingClientRect();
  var c = document.querySelector('#gps-overlay .maplibregl-canvas'), x = f.left + f.width / 2, y = f.bottom + 22;
  ['mousedown', 'mouseup', 'click'].forEach(function (t) { c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); });
  return 'tapped'; })()`;
const touch = (type, pts) => ({ cdp: { method: 'Input.dispatchTouchEvent', params: { type, touchPoints: pts } } });
const bail = (out, r) => { if (!r.ok) { console.log(JSON.stringify({ arm: r.name, reason: r.reason }, null, 1)); process.exit(2); } };

(async () => {
    const fails = [];
    const out = {};
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-check-profile-'));

    // ---- osm -----------------------------------------------------------------
    const a = await arm('osm', 'caledonia', null, 'ok', ME, 4.6, [
        { expression: READ },                                                   // 0 arrival: Bets
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },        // 1 GPS
        { drag: '.gps-target', dx: 70, dy: -40 }, { sleep: 400 }, { expression: READ },   // 2 target dragged
        { drag: '.gps-map', at: { fx: 0.15, fy: 0.85 }, dx: -50, dy: -30 }, { sleep: 500 }, { expression: READ }, // 3 map panned
        { tap: '.gps-recenter' }, { sleep: 500 }, { expression: READ },         // R recenter
        ...mapTap(120, 260), { expression: READ },                              // 4 tap: jump
        { tap: '.gps-units' }, { sleep: 200 }, { expression: READ },            // 5 meters
        { tap: '.gps-units' }, { sleep: 200 },
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
        if (gps.maxZoom !== 18) fails.push('osm: max zoom ' + gps.maxZoom + ' with USGS only (expected 18)');
        fails.push(...teeInView('osm', gps), ...pillFails('osm', gps, true));
        if (gps.zoomBtn !== '1x') fails.push('osm: zoom button reads ' + gps.zoomBtn);
        fails.push(...arcFails('osm', gps, ME_CENTER_YD));
        if (gps.score !== 'Hole 1 · Enter Score') fails.push('osm: score button reads ' + gps.score);
        if (!arrive.toggle || !/📍 GPS/.test(arrive.toggle) || !/💰 Bets/.test(arrive.toggle) || !arrive.toggleOnScreen) fails.push('osm: the toggle is not on screen: ' + arrive.toggle);
        if (arrive.side !== 'bets' || arrive.gpsShown) fails.push('osm: a fresh phone did not land on Bets');
        if (arrive.watchCalls !== 0) fails.push('osm: a location watch ran before GPS was shown');
        if (!gps.gpsShown || !gps.map || gps.side !== 'gps') fails.push('osm: GPS side did not show with a map');
        if (JSON.stringify(gps.labels) !== '["FRONT","CENTER","BACK"]') fails.push('osm: labels ' + JSON.stringify(gps.labels));
        if (gps.f !== EXPECT.front || gps.m !== EXPECT.center || gps.b !== EXPECT.back) fails.push(`osm: F/C/B ${gps.f}/${gps.m}/${gps.b}, expected ${EXPECT.front}/${EXPECT.center}/${EXPECT.back}`);
        if (gps.acc !== '±6 yds') fails.push('osm: accuracy ' + gps.acc);
        if (!gps.highAccuracy || gps.watches !== 1) fails.push('osm: watch on GPS: ' + gps.watches + ' high=' + gps.highAccuracy);
        if (gps.toHere !== 'You → here: ' + EXPECT.half || gps.hereCenter !== 'Here → center: ' + EXPECT.half) fails.push('osm: target did not start halfway: ' + gps.toHere + ' / ' + gps.hereCenter);
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
        if (meters.units !== 'Meters' || meters.m !== EXPECT.centerM) fails.push(`osm: meters ${meters.m} (${meters.units})`);
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
        { tap: '.gps-set-green' }, { sleep: 200 }, { expression: READ },
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
        { tap: '.gps-fix-green' }, { sleep: 200 }, ...mapTap(80, 160),
        { tap: '.gps-save' }, { sleep: 500 }, { expression: READ },
        { tap: '.gps-undo-green' }, { sleep: 500 }, { expression: READ },
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
        { tap: '.gps-fix-green' }, { sleep: 300 }, { expression: READ },
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
    const http = require('http');
    const TILEPNG = fs.readFileSync(path.join(__dirname, '..', 'icon-192.png'));
    const esriSrv = await new Promise((res) => {
        const sv = http.createServer((q, r) => {
            if (/MapServer\?f=json/.test(q.url)) { r.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return r.end(JSON.stringify({ copyrightText: 'Source: stand-in Esri' })); }
            if (/\/tile\//.test(q.url)) { r.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=86400' }); return r.end(TILEPNG); }
            r.writeHead(404); r.end();
        });
        sv.listen(0, '127.0.0.1', () => res(sv));
    });
    const EO = 'http://127.0.0.1:' + esriSrv.address().port;
    const ESRI_CFG = `Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return { esriKey: 'CHECK',
        esriTileUrl: '${EO}/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={key}',
        esriMetaUrl: '${EO}/arcgis/rest/services/World_Imagery/MapServer?f=json&token={key}' }; }, set: function () {} });`;
    const e = await arm('esri', 'pinelakes', null, 'ok', pl, 5, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 800 }, { expression: READ },
        { tap: '.gps-set-green' }, { sleep: 3000 }, { expression: READ },
        ...mapTap(90, 200), { tap: '.gps-save' }, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', pl[0], pl[1], 5) + ESRI_CFG });
    // The Esri credit makes the attribution bar two lines: the tee must stay clear of it.
    const et = await arm('esrtee', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + ESRI_CFG });
    esriSrv.close();
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
        if (measuring.maxZoom !== 20) fails.push('esri: max zoom with Esri is ' + measuring.maxZoom + ' (expected 20)');
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
        if (!/^Tee → here: \d+$/.test(g.toHere || '')) fails.push('off-hole: target readout ' + g.toHere);
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
        { expression: PULL(`document.querySelector('#gps-overlay .gps-panel')`) },   // 6 a pull on GPS
        touch('touchStart', [{ x: 300, y: 300 }]), touch('touchMove', [{ x: 300, y: 360 }]), touch('touchMove', [{ x: 300, y: 430 }]),
        touch('touchMove', [{ x: 300, y: 500 }]), touch('touchEnd', []), { sleep: 700 }, { expression: READ },  // 7 a finger drag pans the map
        { tap: '.gps-units' }, { sleep: 300 }, { expression: READ },               // 8 meters
        { tap: '.gps-units' }, { sleep: 200 },
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
    const nwsSeen = [];
    const nwsSrv = await new Promise((res) => {
        const sv = require('http').createServer((q, r) => {
            nwsSeen.push(q.url);
            const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/geo+json' };
            if (q.method === 'OPTIONS') { r.writeHead(204, h); r.end(); return; }
            if (/^\/points\/-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(q.url)) { r.writeHead(200, h); r.end(JSON.stringify({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/XXX/1,2/forecast/hourly' } })); return; }
            if (q.url === '/gridpoints/XXX/1,2/forecast/hourly') { r.writeHead(200, h); r.end(JSON.stringify({ properties: { periods: [{ windSpeed: '5 to 12 mph', windDirection: 'NW' }] } })); return; }
            r.writeHead(404, h); r.end();
        });
        sv.listen(0, '127.0.0.1', () => res(sv));
    });
    const NO = 'http://127.0.0.1:' + nwsSrv.address().port;
    const NWS_CFG = `Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return { nwsBase: '${NO}' }; }, set: function () {} });`;
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
        { tap: '.gps-edit-pin' }, { sleep: 400 }, { expression: READ },                   // 1 editing
        { drag: '.gps-flag', dx: 0, dy: -14 }, { sleep: 400 }, { expression: READ },      // 2 dragged toward the back
        { drag: '.gps-flag', dx: 170, dy: 0 }, { sleep: 400 }, { expression: READ },      // 3 dragged off the green: stays on it
        { tap: '.gps-pin-save' }, { sleep: 500 }, { expression: READ },                   // 4 saved
        { deliver: { path: 'events/GPSEDITP', value: Object.assign(round('caledonia'), { pinLocs: { h1: OTHER } }) } }, { sleep: 600 }, { expression: READ }, // 5 another phone, later
        // NO SIGNAL: moved and saved again - it must go into the phone's durable
        // queue (and, unsent, it is what this phone shows: the app's rule for
        // every unsent write).
        { expression: '(window.__coldSetOffline(true), "offline")' },
        { tap: '.gps-edit-pin' }, { sleep: 300 }, { drag: '.gps-flag', dx: 0, dy: 10 }, { sleep: 300 },
        { tap: '.gps-pin-save' }, { sleep: 500 }, { expression: READ },                   // 6 saved offline
        { tap: '.gps-edit-pin' }, { sleep: 300 }, { tap: '.gps-pin-clear' }, { sleep: 500 }, { expression: READ }, // 7 pin to center
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
        if (r2.midLbl !== 'PIN' || r2.m === r1.m || !/^Here → pin: \d+$/.test(r2.hereCenter)) fails.push('edit pin: numbers did not follow the flag live: ' + JSON.stringify([r1.m, r2.m, r2.midLbl, r2.hereCenter]));
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
        const sb = g0.scoreBox, mp = g0.boxes.map;
        if (sb && mp && Math.abs((sb.l + sb.r) / 2 - (mp.l + mp.r) / 2) > 2) fails.push('score: the button is not centered');
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
        { expression: `(function(){var k='hardpan_wind_v1_caledonia',w=JSON.parse(localStorage.getItem(k));w.at=Date.now()-16*60000;localStorage.setItem(k,JSON.stringify(w));return 'aged';})()` },
        { tap: '.gps-units' }, { sleep: 200 }, { tap: '.gps-units' }, { sleep: 1500 }, { expression: READ }, // 2 16 min old: asked again
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, profileDir: windProfile });
    out.wind = wd; bail(out, wd);
    const nwsAfterFirst = nwsSeen.slice(nws0);
    const wo = await arm('windoff', 'caledonia', null, 'ok', ME, 4.6, [
        { tap: '.gps-side-gps' }, WAIT_MAP, { sleep: 3000 }, { expression: READ },
    ], { preScript: sensor('ok', ME[0], ME[1], 4.6) + NWS_CFG, blockUrls: ['*127.0.0.1:' + nwsSrv.address().port + '*'] });
    out.windOff = wo; bail(out, wo);
    {
        const [w0, w1, w2] = wd.reads;
        if (!/^↑\s*12 mph$/.test(w0.wind || '')) fails.push('wind: box reads ' + JSON.stringify(w0.wind));
        if (w0.windRot !== windRotFor(w0.bearing)) fails.push(`wind: arrow turned ${w0.windRot}, expected ${windRotFor(w0.bearing)} (to the SE, on a map turned ${w0.bearing})`);
        const wb = w0.windBox, at = w0.boxes.attrib, mp = w0.boxes.map;
        if (!wb || !at || wb.b > at.t || wb.r < mp.r - 20 || wb.l < (mp.l + mp.r) / 2) fails.push('wind: not at the bottom-right above the attribution: ' + JSON.stringify([wb, at]));
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
            { tap: '.gps-edit-pin' }, { sleep: 300 }, { drag: '.gps-flag', dx: 0, dy: -10 }, { sleep: 400 }, { expression: READ },
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
    nwsSrv.close();

    // ---- privacy, every arm ------------------------------------------------------
    [[a, ME], [i, ME], [b, pl], [c, ME], [d, ME], [p1, ME], [p2, ME], [e, pl], [vf, TME], [fh, FAR], [ft, ME], [po, ME], [et, ME], [ep, ME], [sc, ME], [wd, ME], [wo, ME]].forEach(([r, me]) => {
        const l = leaks(r, me);
        if (l.length) fails.push(r.name + ': the golfer\'s position left the page: ' + l.slice(0, 3).join(' | '));
    });
    // Every arm but `esri` (which has a stand-in key) runs with NO key, and must ask Esri for nothing.
    const esri = [a, i, b, c, d, p1, p2, vf, fh, ft, po].reduce((n, r) => n + r.requests.filter((q) => /arcgis\.com/i.test(urlOf(q))).length, 0);
    // No key in gps-config.js, so Esri must not have been asked for anything.
    if (esri !== 0) fails.push('esri: ' + esri + ' requests with no key configured');

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
        esriRequests: esri,
        esriPinning: out.esriSummary,
        polish: out.polishSummary,
        courses: out.courses,
        fails,
    };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
