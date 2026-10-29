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
const CODE = 'MSA101', KEY = 'missalways101_test', ID = '990000000000000101';
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
    const t = G.destination(T0, 180, 600 * n);
    // 101: #4 stands in for Papago 4 (par 3, 234 to the middle: F 220 / C 234 / B 248); #2 a par 4 (F 380 / C 395 / B 410).
    if (n === 4) { h[n] = { g: { f: P(G.destination(t, 0, 220 * Y)), c: P(G.destination(t, 0, 234 * Y)), b: P(G.destination(t, 0, 248 * Y)) }, t: { b: P(t) } }; continue; }
    if (n === 2) { h[n] = { g: { f: P(G.destination(t, 0, 380 * Y)), c: P(G.destination(t, 0, 395 * Y)), b: P(G.destination(t, 0, 410 * Y)) }, t: { b: P(t) } }; continue; }
    h[n] = { g: { c: P(G.destination(t, 0, 350 * Y)) }, t: { b: P(t) } };
}
const NAME = 'Streamsong Resort (101 test geometry)';
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: NAME, course: 'Red', city: 'Streamsong', state: 'FL', lat: REAL[6].tee[0], lng: REAL[6].tee[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, (i === 3 || i === 5 || i === 7) ? { par: 3 } : i === 1 ? { par: 4 } : {}));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Test Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: NAME, eventName: 'Test 101 miss always', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
// The golfer 114 yds short of the green's middle on #8's line (a live fix, moved with __moveTo). Stand-in only.
const R8 = REAL[8], AT = P(G.destination(R8.c, R8.brg + 180, 114 * Y));
const GEO = "(function(){ var cur = { lat: " + AT[0] + ", lng: " + AT[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
const MB = { LW: 84, SW: 107, GW: 121, PW: 133, '9i': 145, '8i': 168, '7i': 180, '6i': 192, '5i': 208, Hy: 234, '3w': 245, Dr: 265 };   // 101: no 4i number - the generic carry
const MP = require('./gps-miss-pattern.js');
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = (mph) => "(function(){ var now = Date.now(), w = JSON.stringify({ at: now + 3600e3, src: 'weatherkit', obsAt: now, mph: " + mph + ", gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true }));"
    + " localStorage.setItem('hardpan_gps_arcs_v1', JSON.stringify({ 'n:test golfer': 1, 'Test Golfer': 1 })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_101 || '';
const OVERLAPS = "JSON.stringify((function(){ var vis = function (e) { if (!e || e.offsetParent === null) return false; var s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };"
    + " var nm = function (e) { return String(e.className).split(' ')[0] + ':' + e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 24); };"
    + " var all = function (q) { return Array.prototype.filter.call(document.querySelectorAll(q), vis); };"
    + " var hit = function (a, q) { return Math.min(a.right, q.right) - Math.max(a.left, q.left) > 0 && Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top) > 0; };"
    + " var bs = all('#gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on');"
    + " var os = all('#gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chip, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-miss-lbl span, #gps-overlay .gps-green-lbl, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-carry-lbl, #gps-overlay .gps-arc-lbl, #gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-recenter');"
    + " var out = []; bs.forEach(function (p) { var a = p.getBoundingClientRect(); os.forEach(function (e) { if (hit(a, e.getBoundingClientRect())) out.push(nm(p) + ' x ' + nm(e)); }); });"
    + " var mine = all('#gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-miss-card');"
    + " var fixed = all('#gps-overlay .gps-recenter, #gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-right > *, #gps-overlay .gps-top, #gps-overlay .gps-ld-plays, #gps-overlay .gps-zoom');"
    + " mine.forEach(function (m) { var a = m.getBoundingClientRect(); fixed.forEach(function (e) { if (e.contains(m) || m.contains(e)) return; if (hit(a, e.getBoundingClientRect())) out.push(nm(m) + ' x ' + nm(e)); }); });"
    + " mine.forEach(function (m, i) { mine.forEach(function (k, j) { if (j > i && hit(m.getBoundingClientRect(), k.getBoundingClientRect())) out.push(nm(m) + ' x ' + nm(k)); }); });"
    + " var vw = document.documentElement.clientWidth; mine.forEach(function (m) { var a = m.getBoundingClientRect(); if (a.left < 0 || a.right > vw) out.push(nm(m) + ' off screen'); });"
    + " return { hits: out, bubbles: bs.length }; })())";


const BAGN = require('./gps-shots.js') && (global.HardPanGpsBag || require('./gps-shots.js')).BAG.length;   // 14 (101) / 15 with the 3i (101b)
const HOLE_TEE = (n) => h[n].t.b, HOLE_C = (n) => h[n].g.c;
for (const [vp, mph] of [[{ width: 375, height: 667 }, 0], [{ width: 430, height: 932 }, 20]]) {
test('101 My miss always shows - Papago 4 (234), Streamsong Red 6 + 8, a par 4 approach, nothing reaches - ' + vp.width + 'x' + vp.height + ' wind ' + mph + ' mph', { timeout: 500000 }, async () => {
    const pid = (round().players[0] || {}).id;
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + MAPS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
        + "if (!sessionStorage.getItem('seeded101')) { sessionStorage.setItem('seeded101', '1'); " + SEED(mph) + " }";
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: NAME, data: CD, location: { latitude: REAL[6].tee[0], longitude: REAL[6].tee[1], city: 'Streamsong', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome101-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
    const sw = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missSwitch())'));
    const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
    const chipTexts = async () => JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-miss-chip'), function (b) { return b.textContent; }))"));
    const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
    const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
    const checkOv = async (tag) => { const ov = JSON.parse(await ev(OVERLAPS)); if (ov.hits.length) fails.push(tag + ': ' + JSON.stringify(ov.hits)); };
    const closest = (n) => n.chips.list.slice().sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
    const go = async (hole, pt) => { await ev('HardPanGps.goHole(' + hole + ')'); await ev('__moveTo(' + pt[0] + ',' + pt[1] + ')'); await sleep(3000); await ev(tips); await sleep(600); };
    const par3 = async (tag, hole, pt) => {
        await go(hole, pt);
        const on = await until("(function(){ var s = HardPanGps.missSwitch(); return !!(s && s.on); })()", 10000);
        const s = await sw(), n = await now();
        check(on, tag + ': the switcher shows - why ' + n.why + ' ' + JSON.stringify(s));
        if (!on) return null;
        check(!!n.oval && n.oval.club === s.sel, tag + ': the oval on the shown club ' + s.sel + ' / ' + JSON.stringify(n.oval && n.oval.club));
        check(n.why === null, tag + ': no hide reason, got ' + n.why);
        check(s.list.length === BAGN, tag + ': every club in My bag (' + BAGN + '), generic 4i / 5w filled: ' + s.list.join(','));
        check(s.sel === closest(n).club, tag + ': default = closest ' + closest(n).club + ', got ' + s.sel);
        await checkOv(tag); await shot(tag);
        return { s, n };
    };
    try {
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
        await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
        assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
        assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
        await ev(tips); await sleep(800);
        // Papago 4 stand-in: par 3, 234 to the middle, from the tee.
        const p4 = await par3('papago4', 4, HOLE_TEE(4));
        if (p4 && mph === 0) {
            check(p4.s.sel === 'Hy', 'Papago 4 calm: the hybrid (234) is the default, got ' + p4.s.sel + ' "' + p4.s.text + '"');
            check(/^Hy · /.test(p4.s.text), 'Papago 4 text: ' + p4.s.text);
            const g4 = p4.n.chips.list.find((x) => x.club === '4i');
            check(!!g4 && g4.carry > 0 && g4.carry !== 208, 'the 4i (no number) uses the generic carry: ' + JSON.stringify(g4));
        }
        if (p4 && mph > 0) check(!!p4.s.sel, 'Papago 4 into 20 mph: a club still shows: ' + p4.s.sel + ' "' + p4.s.text + '"');
        // Streamsong Red 6 from the tee; 8 from 114 (095's spot) - the 20 mph run is the case the range rule hid.
        await par3('ss6', 6, REAL[6].tee);
        await par3('ss8', 8, AT);
        // A par 4 approach (#2), 150 to the middle: the chip stack + oval.
        const A150 = P(G.destination(HOLE_C(2), 180, 150 * Y));
        await go(2, A150);
        check(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval); })()", 10000), 'par 4 approach at 150: the oval shows ' + JSON.stringify(await now()));
        let ct = await chipTexts(); check(ct.length >= 1, 'par 4 approach: the club chips show ' + JSON.stringify(ct));
        check((await sw()).on === false, 'par 4: the chip stack, not the par-3 pill (095 kept)');
        await checkOv('par4-150'); await shot('par4-150');
        // Nothing reaches (#2, 330 to the middle): the longest club + "X short of the front".
        const A330 = P(G.destination(HOLE_C(2), 180, 330 * Y));
        await go(2, A330);
        check(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.oval.club === 'Dr'); })()", 10000), 'nothing reaches: Dr is the default ' + JSON.stringify((await now()).oval));
        ct = await chipTexts();
        check(ct.some((t) => /^Dr · \d+ short of the front$/.test(t.trim())), 'nothing reaches: "Dr · X short of the front" in ' + JSON.stringify(ct));
        await checkOv('par4-330'); await shot('par4-330');
        // Kept: My miss off hides it all.
        await ev("(function(){ var M = window.HardPanMissPattern; M.setOn('Test Golfer', false); M.setOn('n:test golfer', false); return 1; })()");
        await go(4, HOLE_TEE(4));
        check(!(await now()).oval && !(await sw()).on, 'My miss off: nothing drawn');
        assert.deepEqual(fails, [], fails.join('\n'));
    } finally { await j.close(); }
});
}
