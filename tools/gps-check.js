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
const WAIT_MAP = { waitFor: `(function () { var m = document.querySelector('#gps-overlay .gps-map'); return !!(m && m.dataset.zoom != null); })()`, timeout: 25000 };
const mapTap = (x, y) => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } } },
                          { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } } },
                          { sleep: 400 }];

async function arm(name, key, ownerUid, mode, me, acc, steps, extra) {
    const code = 'GPS' + name.toUpperCase().slice(0, 5);
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
        ...mapTap(200, 300), { tap: '.gps-save' }, { sleep: 500 }, { expression: READ },
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
        if (gps.from !== 'Measuring from tee' || gps.m !== TEE_CENTER || gps.dot) fails.push('denied: not measuring from the tee: ' + JSON.stringify([gps.from, gps.m, TEE_CENTER, gps.dot]));
        if (bets.gpsShown || bets.scoreInputs !== before.scoreInputs || bets.scoreInputs < 4 || bets.cardHole !== before.cardHole) fails.push('denied: Bets is not the card it was');
        if (d.dump.writes.length) fails.push('denied: wrote ' + d.dump.writes.map((w) => w.path).join(', '));
    }

    // ---- precache, then offline from the phone's cache ---------------------------
    const p1 = await arm('pre', 'caledonia', null, 'ok', ME, 4.6, [
        { sleep: 9000 }, { expression: COUNT_USGS }, { sleep: 800 }, { expression: READ },
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
    esriSrv.close();
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
        if (g.from !== 'Measuring from tee') fails.push('off-hole: no "Measuring from tee" label: ' + JSON.stringify(g.from));
        if (g.dot) fails.push('off-hole: the blue dot is still shown');
        if (g.m !== TEE_CENTER) fails.push(`off-hole: center ${g.m}, expected tee -> center ${TEE_CENTER}`);
        if (!/^Tee → here: \d+$/.test(g.toHere || '')) fails.push('off-hole: target readout ' + g.toHere);
        if (!g.teePin || !g.centerPin || !(g.teePin.y > g.centerPin.y) || Math.abs(g.teePin.x - g.centerPin.x) > 3) fails.push('off-hole: tee not straight below the green: ' + JSON.stringify([g.teePin, g.centerPin]));
        if (g.acc !== 'You are off this hole') fails.push('off-hole: accuracy line ' + g.acc);
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

    // ---- privacy, every arm ------------------------------------------------------
    [[a, ME], [i, ME], [b, pl], [c, ME], [d, ME], [p1, ME], [p2, ME], [e, pl], [vf, TME], [fh, FAR], [ft, ME]].forEach(([r, me]) => {
        const l = leaks(r, me);
        if (l.length) fails.push(r.name + ': the golfer\'s position left the page: ' + l.slice(0, 3).join(' | '));
    });
    // Every arm but `esri` (which has a stand-in key) runs with NO key, and must ask Esri for nothing.
    const esri = [a, i, b, c, d, p1, p2, vf, fh, ft].reduce((n, r) => n + r.requests.filter((q) => /arcgis\.com/i.test(urlOf(q))).length, 0);
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
        fails,
    };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
