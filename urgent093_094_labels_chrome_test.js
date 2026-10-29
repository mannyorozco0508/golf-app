// 093 + 094 (one install) - SPEC ITEM 4: NO LABEL UNDER ANY BUTTON, THE CLUB SWITCHER PILL OR ANOTHER LABEL, on
// Streamsong Red #6 / #8 (par 3; 094's test geometry from the bundled OSM extract), in the normal view AND the Green
// view, dragging the target to the front, back, left and right, at 375x667, 402x874 and 440x956. From the tee (the
// golfer at home), so the "from tee" tag shows above the pill. Every visible carry label ("5i 208"), F / C / B label
// and "20 yd" label is checked against: the rail buttons, the switcher pill and its "from tee" tag, Recenter, the
// Plays-like pill, the zoom button, the top bar and the Card | Enter score | Mark row - and against each other.
// The arcs / bearing / deep x wide checks stay in urgent094_green_view_chrome_test. Screenshots into SHOTS_0934.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-arcs-plan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js');
const G = window.HardPanGeo, Y = G.M_PER_YD;
const CODE = 'LBL934', KEY = 'labels0934_test', ID = '990000000000000934';
const P = (p) => [Number(p[0].toFixed(7)), Number(p[1].toFixed(7))];

// Streamsong Red #6 / #8 from the bundled OSM extract: the hole line's first point (tee) and the green polygon's centre.
const OSM = JSON.parse(fs.readFileSync(path.join(__dirname, 'gps-osm', 'streamsong_red_blue.json'), 'utf8')).elements;
const GREENS = OSM.filter((e) => e.tags && e.tags.golf === 'green' && e.geometry);
const REAL = {};
[[6, 846920423, [156, 186, 215]], [8, 846930767, [79, 101, 122]]].forEach(([n, id, fcb]) => {
    const w = OSM.find((e) => e.id === id), g = w.geometry, tee = [g[0].lat, g[0].lon], end = [g[g.length - 1].lat, g[g.length - 1].lon];
    const ring = GREENS.map((x) => x.geometry.map((p) => [p.lat, p.lon])).find((r) => G.pointInRing(end, r));
    const cen = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
    const brg = G.bearingDeg(tee, cen);
    REAL[n] = { tee: P(tee), brg, f: P(G.destination(tee, brg, fcb[0] * Y)), c: P(G.destination(tee, brg, fcb[1] * Y)), b: P(G.destination(tee, brg, fcb[2] * Y)) };
});
const T0 = [27.676, -81.95];
const h = {};
for (let n = 1; n <= 18; n++) {
    if (REAL[n]) { h[n] = { g: { f: REAL[n].f, c: REAL[n].c, b: REAL[n].b }, t: { b: REAL[n].tee } }; continue; }
    const t = G.destination(T0, 180, 600 * n); h[n] = { g: { c: P(G.destination(t, 0, 350 * Y)) }, t: { b: P(t) } };
}
const NAME = 'Streamsong Resort (094 test geometry)';
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: NAME, course: 'Red', city: 'Streamsong', state: 'FL', lat: REAL[6].tee[0], lng: REAL[6].tee[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, (i === 5 || i === 7) ? { par: 3 } : {}));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Test Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: NAME, eventName: 'Test 093+094 labels', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
// AT HOME: a fix ~25 km from the course (the numbers come from the tee, as in Manny's screenshots). Stand-in only.
const HOME = [27.9, -81.95];
const GEO = "(function(){ var cur = { lat: " + HOME[0] + ", lng: " + HOME[1] + " }, live = {}, n = 1;"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
const MB = { LW: 84, SW: 107, GW: 121, PW: 133, '9i': 145, '8i': 168, '7i': 180, '6i': 192, '5i': 208, Hy: 220, '3w': 235, Dr: 260 };
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now + 3600e3, src: 'weatherkit', obsAt: now, mph: 9, gustMph: 15, toDeg: 45, fromDeg: 225, tempF: 75 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true }));"
    + " localStorage.setItem('hardpan_gps_arcs_v1', JSON.stringify({ 'n:test golfer': 1 })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_0934 || '';
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

for (const vp of [{ width: 375, height: 667 }, { width: 402, height: 874 }, { width: 440, height: 956 }]) {
test('093+094 no label under a button, the pill or another label - Streamsong Red #6 / #8, normal + Green view, target dragged, ' + vp.width + 'x' + vp.height, { timeout: 600000 }, async () => {
    const pid = (round().players[0] || {}).id;
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + MAPS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
        + "if (!sessionStorage.getItem('seeded0934')) { sessionStorage.setItem('seeded0934', '1'); " + SEED + " }";
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: NAME, data: CD, location: { latitude: REAL[6].tee[0], longitude: REAL[6].tee[1], city: 'Streamsong', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, vp.width + 'x' + vp.height + '-' + n + '.png')); } };
    const MAP = 'window.__maps[window.__maps.length - 1]';
    // Everything the checks read, from the map itself (works on any build - no new hooks).
    const state = async () => JSON.parse(await ev("(function(){ var m = " + MAP + ", mel = document.querySelector('#gps-overlay .gps-map');"
        + " var src = function (id) { try { var s = m.getSource(id); return s ? s.serialize().data : null; } catch (e) { return null; } };"
        + " var arcs = src('carry052'), miss = src('mymiss'), dims = document.querySelector('#gps-overlay .gps-green-dims');"
        + " var ring = miss && miss.features ? (miss.features.filter(function (f) { return f.properties && f.properties.k === 'miss'; })[0] || null) : null;"
        + " return JSON.stringify({ view: mel.getAttribute('data-view'), bearing: m.getBearing(), dims: dims && dims.style.display !== 'none' ? dims.textContent : null,"
        + "  arcs: arcs && arcs.features ? arcs.features.filter(function (f) { return f.properties.k !== 'still'; }).map(function (f) { return { c: f.properties.c, pts: f.geometry.coordinates }; }) : [],"
        + "  ring: ring ? ring.geometry.coordinates[0] : null, target: HardPanGps.target(), miss: HardPanGps.missNow() }); })()"));
    // A REAL mouse drag of the target ring to pt ([lat, lng]).
    const drag = async (pt) => {
        const xy = JSON.parse(await ev("(function(){ var m = " + MAP + ", t = HardPanGps.target(), r = m.getContainer().getBoundingClientRect(), a = m.project([t[1], t[0]]), b = m.project([" + pt[1] + "," + pt[0] + "]);"
            + " return JSON.stringify({ x0: r.left + a.x, y0: r.top + a.y, x1: r.left + b.x, y1: r.top + b.y }); })()"));
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(xy.x0), y: Math.round(xy.y0) });
        await j.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(xy.x0), y: Math.round(xy.y0), button: 'left', clickCount: 1 });
        for (let i = 1; i <= 10; i++) await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(xy.x0 + (xy.x1 - xy.x0) * i / 10), y: Math.round(xy.y0 + (xy.y1 - xy.y0) * i / 10), button: 'left', buttons: 1 });
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(xy.x1), y: Math.round(xy.y1), button: 'left', clickCount: 1 });
        await sleep(1500);
    };
    // Visible labels under a rail button, and carry labels on a F / C / B / "20 yd" label (the chips are 093's).
    const collisions = async () => JSON.parse(await ev("JSON.stringify((function(){ var vis = function (e) { if (!e || e.offsetParent === null) return false; var s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0; };"
        + " var all = function (q) { return Array.prototype.filter.call(document.querySelectorAll(q), vis); };"
        + " var ov = function (a, b) { var p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1; };"
        + " var nm = function (e) { return (e.textContent || '').replace(/\\s+/g, ' ').trim() + ' [' + e.className + ']'; };"
        + " var btns = all('#gps-overlay .gps-right > *, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chip, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-leftrow .gps-recenter, #gps-overlay .gps-ld-plays, #gps-overlay .gps-zoom, #gps-overlay .gps-ld-top, #gps-overlay .gps-ld-bottom .gps-bottom > *'), carry = all('#gps-overlay .gps-carry-lbl'), lbl = all('#gps-overlay .gps-green-lbl, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on'), out = [];"
        + " carry.concat(lbl).forEach(function (l) { btns.forEach(function (b) { if (ov(l, b)) out.push(nm(l) + ' under ' + nm(b)); }); });"
        + " carry.forEach(function (c) { lbl.forEach(function (l) { if (ov(c, l)) out.push(nm(c) + ' on ' + nm(l)); }); });"
        + " for (var c1 = 0; c1 < carry.length; c1++) for (var c2 = c1 + 1; c2 < carry.length; c2++) if (ov(carry[c1], carry[c2])) out.push(nm(carry[c1]) + ' on ' + nm(carry[c2]));"
        + " for (var i = 0; i < lbl.length; i++) for (var k = i + 1; k < lbl.length; k++) if (ov(lbl[i], lbl[k])) out.push(nm(lbl[i]) + ' on ' + nm(lbl[k]));"
        + " return out; })())"));
    const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
    const greenBtn = () => ev("(function(){ var b = document.querySelector('#gps-overlay .gps-green-view'); if (!b) return false; b.click(); return true; })()");
    const fails = [];
    const check = (ok, msg) => { if (!ok) fails.push(msg); };
    try {
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
        await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
        assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
        assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
        await ev(tips); await sleep(800);
        for (const n of [6, 8]) {
            const R = REAL[n], tag = 'hole' + n;
            await ev('HardPanGps.goHole(' + n + ')'); await sleep(3000); await ev(tips); await sleep(500);
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')", 10000), tag + ': the arcs are on');
            assert.equal(await ev('HardPanGps.appOrigin()'), 'tee', tag + ': from the tee (at home)');
            // ---- THE NORMAL VIEW: drag front / back / left / right - the arcs stay put.
            let s0 = await state();
            await shot('0934-' + tag + '-normal');
            const spots = { front: G.destination(R.c, R.brg + 180, 14 * Y), back: G.destination(R.c, R.brg, 14 * Y), left: G.destination(R.c, R.brg - 90, 10 * Y), right: G.destination(R.c, R.brg + 90, 10 * Y) };
            // 093: the switcher shows, "from tee" above it; nothing collides at the start.
            const sw0 = JSON.parse(await ev('JSON.stringify(HardPanGps.missSwitch())'));
            check(sw0.on && sw0.fromTee && !sw0.lblOnMap, tag + ' switcher on, from tee: ' + JSON.stringify(sw0));
            let col0 = await collisions(); check(!col0.length, tag + ' normal view: labels collide: ' + col0.join(' | '));
            for (const k of ['front', 'back', 'left', 'right']) {
                await drag(spots[k]); const s = await state();
                check(JSON.stringify(s.arcs) === JSON.stringify(s0.arcs), tag + ' normal view, target ' + k + ': the arcs moved');
                const col = await collisions();
                check(!col.length, tag + ' normal view ' + k + ': labels collide: ' + col.join(' | '));
                await shot('0934-' + tag + '-normal-' + k);
            }
            // ---- THE GREEN VIEW.
            await ev('HardPanGps.goHole(' + (n === 6 ? 7 : 9) + ')'); await sleep(1500); await ev('HardPanGps.goHole(' + n + ')'); await sleep(2500);   // the target back to its default
            assert.equal(await greenBtn(), true, tag + ': the Green button');
            assert.ok(await until("document.querySelector('#gps-overlay .gps-map').getAttribute('data-view') === 'green'", 6000), tag + ': the Green view');
            await sleep(1500);
            s0 = await state();
            await shot('0934-' + tag + '-green-0-default');
            check(angDiff(s0.bearing, R.brg) <= 1.5, tag + ' green view opens turned tee -> green centre (' + R.brg.toFixed(1) + '), got ' + s0.bearing.toFixed(1));
            check(/^Green \d+ yds deep · \d+ yds wide$/.test(s0.dims || ''), tag + ' dims shown: ' + s0.dims);
            check(s0.arcs.length >= 2, tag + ' arcs drawn: ' + s0.arcs.length);
            col0 = await collisions(); check(!col0.length, tag + ' green view default: labels collide: ' + col0.join(' | '));
            // Each arc centred on the tee, across the tee -> green-centre line (its middle point straight down that line).
            s0.arcs.forEach((a) => { const mid = a.pts[Math.floor(a.pts.length / 2)]; check(angDiff(G.bearingDeg(R.tee, [mid[1], mid[0]]), R.brg) <= 0.6, tag + ' arc ' + a.c + ' across the tee -> green line'); });
            for (const k of ['front', 'back', 'left', 'right']) {
                await drag(spots[k]);
                const s = await state();
                await shot('0934-' + tag + '-green-' + k);
                const t = s.target, tYd = t ? G.haversineMeters(R.tee, t) / Y : null;
                check(t && G.haversineMeters(t, R.c) > 5 * Y, tag + ' ' + k + ': the target moved (' + JSON.stringify(t) + ')');
                check(s.view === 'green', tag + ' ' + k + ': still the Green view');
                check(angDiff(s.bearing, s0.bearing) <= 0.5, tag + ' ' + k + ': bearing ' + s0.bearing.toFixed(1) + ' -> ' + s.bearing.toFixed(1));
                check(s.dims === s0.dims, tag + ' ' + k + ': dims "' + s0.dims + '" -> "' + s.dims + '"');
                check(JSON.stringify(s.arcs) === JSON.stringify(s0.arcs), tag + ' ' + k + ': the arcs moved');
                // The oval: the selected club's carry along tee -> target.
                const ov = s.miss && s.miss.oval;
                if (ov && s.ring && t) {
                    const cx = s.ring.reduce((a, p) => a + p[1], 0) / s.ring.length, cy = s.ring.reduce((a, p) => a + p[0], 0) / s.ring.length, c = [cx, cy];
                    const d = G.haversineMeters(R.tee, c) / Y, rel = (G.bearingDeg(R.tee, c) - G.bearingDeg(R.tee, t)) * Math.PI / 180;
                    const along = d * Math.cos(rel), side = d * Math.sin(rel);
                    check(Math.abs(along - ov.along) <= 1.5, tag + ' ' + k + ': oval centre ' + along.toFixed(1) + ' along tee -> target, club ' + ov.club + ' carry ' + ov.along.toFixed(1));
                    check(Math.abs(side) <= 6, tag + ' ' + k + ': oval centre ' + side.toFixed(1) + ' yds off the tee -> target line');
                    const arc = s.arcs.find((a) => a.c === ov.club);
                    if (arc) { const ar = G.haversineMeters(R.tee, [arc.pts[0][1], arc.pts[0][0]]) / Y; fs.appendFileSync(path.join(require('os').tmpdir(), 'u094-oval-vs-arc.log'), tag + ' ' + k + ' ' + ov.club + ' oval ' + ov.along.toFixed(1) + ' arc ' + ar.toFixed(1) + ' target ' + tYd.toFixed(1) + '\n'); }
                } else check(false, tag + ' ' + k + ': no My miss oval (' + JSON.stringify(s.miss && s.miss.why) + ')');
                const col = await collisions();
                check(!col.length, tag + ' ' + k + ': labels collide: ' + col.join(' | ') + (col.length ? ' ' + (await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on, #gps-overlay .gps-green-lbl'), function (e) { var b = e.getBoundingClientRect(); return e.textContent + '@' + (e.getAttribute('data-at') || '') + ':' + [b.left, b.top, b.right, b.bottom].map(Math.round).join(','); }))")) : ''));
            }
            // Out to the hole and back in: the same bearing every time it opens.
            await greenBtn(); await sleep(1200); await greenBtn(); await sleep(1500);
            const s2 = await state();
            check(s2.view === 'green' && angDiff(s2.bearing, s0.bearing) <= 0.5, tag + ' reopened: bearing ' + s0.bearing.toFixed(1) + ' -> ' + s2.bearing.toFixed(1));
            check(s2.dims === s0.dims, tag + ' reopened: dims ' + s2.dims);
            await greenBtn(); await sleep(800);
        }
        assert.deepEqual(fails, [], fails.join('\n'));
    } finally { await j.close(); }
});
}
