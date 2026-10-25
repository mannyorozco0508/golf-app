// URGENT-052 B stage 2 - MY MISS IN REAL CHROME (393x852 and 375x667), built on the 049 chips test's
// made-up course. Ann has 12 marked 7-iron shots with a left/right miss. Checks: the switch is OFF
// by default and the map is exactly as before (same layers, same sources, no label, no new button);
// GPS tools > My miss turns the oval on (two layers + a text label, nothing else); the plays-like
// pill does not cover it; it is remembered (page reloaded); off again = the map as before; My bag >
// 7-iron shows the summary line, the picture and the same switch.
// URGENT-063: the oval is from My bag's carry only and never off the tee - switched on at the tee there
// is no oval; it shows once she walks to an approach ~150 out; the club screen line is the 063 My bag line.
// ORIGINAL HEADER (049):
// A made-up course (synthetic - no licensed data), hole 1 a par 4; Ann's bag typed in; a fresh
// WeatherKit-style wind reading on the phone (10 mph from 47).
//   1  on the tee: Mark shot -> the chip row in the bottom bar, "Hitting Driver? · N to the green"
//   2  at the ball: Mark shot -> the drive closes (a record, Driver); the row pre-selects the
//      likely iron; tap 7i
//   3  at the next ball: Mark shot -> the 7-iron closes (a record: 7i, carry mark -> mark)
//   4  Skip on that one, walk onto the green -> it closes, never a record
//   5  the log holds no coordinate; nothing written to the database
// Screenshots into SHOTS_049 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-mark-chips.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'MIS052', KEY = 'miss052_test', ID = '990000000000000052';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Chips Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Chips Test Golf Club', eventName: 'Test 052B my miss', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// Ann's bag, typed in (My bag), and a fresh wind reading (so nothing is fetched).
const BAG = { v: 1, golfers: { 'n:ann alpha': { shots: {}, set: { Dr: 250, '3w': 230, '5w': 215, Hy: 200, '4i': 190, '5i': 180, '6i': 171, '7i': 163, '8i': 152, '9i': 141, PW: 130, GW: 115, SW: 95, LW: 75 }, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 10, gustMph: null, toDeg: 227, fromDeg: 47, tempF: 81 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); })();";
const SHOTS = process.env.SHOTS_052B || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yd = (a, b) => G.haversineMeters(a, b) / G.M_PER_YD;
// 063: an approach - 150 yds short of the green on the hole's line (her irons reach; never the tee).
const APPROACH = G.destination(MID, 180, 150 * G.M_PER_YD);


// 12 marked 7-iron shots (052 stage 1 fields): mostly right and short.
const LOG = { v: 1, golfers: { 'n:ann alpha': { hand: 'R', shots: Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, club: '7i', carry: [144, 146, 143, 145, 147, 158, 160, 144, 146, 145, 159, 143][i], windMph: 0, relAngle: 0, along: 0, across: 0, tempF: 75, elevFt: null, course: 'Chips Test Golf Club', hole: 1 + (i % 9), date: Date.now() - (i + 1) * 3600000, wxHour: null, windFromDeg: 0, bearingDeg: 0, src: 'manual', offline: [9, 12, 8, 10, 11, -5, -4, 13, 7, 9, -6, 10][i], aimKind: 'green-center', endKind: 'marked' })) } } };
const SEED2 = "localStorage.setItem('hardpan_shotlog_v1', " + JSON.stringify(JSON.stringify(LOG)) + ");";

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('My miss at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true; window.__hardpanNoHint = true;'   /* phone3: 066 #1's one-time Customize hint (2 buttons, gone after 12 s) would skew the before / after button count */ + '' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" + SEED
            + "if (!sessionStorage.getItem('seeded052')) { sessionStorage.setItem('seeded052', '1'); " + SEED2 + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Chips Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const layers = () => ev('JSON.stringify(HardPanGps.mapLayers())').then(JSON.parse);
        const mapButtons = () => ev("Array.prototype.filter.call(document.querySelectorAll('#gps-overlay button'), function (b) { return b.offsetParent !== null && !b.closest('.gps-tsheet,.gps-bag,.gps-shist,.gps-tools-menu,.gps-bagask,.gps-elevnote'); }).length");   // 070: the one-time elevation note's OK (12 s, once per golfer) is not a map button
        const label = () => ev("(function(){ var e = document.querySelector('#gps-overlay .gps-miss-lbl'); return e ? e.textContent : null; })()");
        const sw = () => ev("(function(){ var b = document.querySelector('#gps-overlay [data-ts-sw=mymiss]'); return b ? b.getAttribute('aria-checked') : null; })()");
        const open = async () => {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded with the shot scripts');
            await sleep(2000);
        };
        const tools = async () => { await ev("document.querySelector('#gps-overlay .gps-tools').click()"); assert.ok(await until("(function(){ var t = document.querySelector('#gps-overlay .gps-tsheet'); return !!t && t.style.display !== 'none'; })()", 5000), 'Tools sheet'); };
        const closeTools = async () => { await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(600); };
        try {
            await open();
            // 1 - OFF by default: the map exactly as before.
            assert.equal(await ev("HardPanMissPattern.isOn('Ann Alpha')"), false, 'off by default');
            const base = await layers(), baseBtns = await mapButtons();
            assert.ok(base && base.layers.length > 3, 'the map style is there');
            assert.ok(!base.layers.some((l) => /mymiss/.test(l)) && !base.sources.includes('mymiss'), 'no My miss layer or source');
            assert.equal(await label(), null, 'no label');
            await shot('1-off');
            // Mark shot on the tee, 7-iron: the club in hand.
            await ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]')", 8000), 'chips');
            await ev("document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]').click()");
            await sleep(800);
            assert.deepEqual(await layers(), base, 'still exactly as before (off)');
            // 063: the map at the approach spot with My miss OFF (its own rail / buttons) - then back to the tee.
            await ev('__moveTo(' + APPROACH[0] + ',' + APPROACH[1] + ')');
            await sleep(2500);
            const baseApp = await layers(), baseAppBtns = await mapButtons();
            assert.ok(!baseApp.layers.some((l) => /mymiss/.test(l)), 'off at the approach: no My miss layer');
            await ev('__moveTo(' + TEE[0] + ',' + TEE[1] + ')');
            await sleep(2500);
            // 2 - GPS tools > My miss: off -> on.
            await tools();
            assert.equal(await sw(), 'false', 'the switch shows off');
            await shot('2-tools-off');
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            assert.equal(await sw(), 'true');
            await shot('3-tools-on');
            await closeTools();
            // 063: never off the tee (even with a 7-iron picked at Mark shot) - walk to an approach, ~150 out.
            await sleep(1000);
            assert.deepEqual(await layers(), base, '063: on, but the tee shot - no oval');
            assert.equal(await ev("HardPanGps.missNow().why"), 'tee');
            await ev('__moveTo(' + APPROACH[0] + ',' + APPROACH[1] + ')');
            assert.ok(await until("(function(){ var l = HardPanGps.mapLayers(); return !!l && l.layers.indexOf('mymiss-fill') !== -1; })()", 8000), 'the oval layer');
            const onL = await layers();
            assert.deepEqual(onL.layers.filter((l) => !/^mymiss-/.test(l)), baseApp.layers, 'only the two My miss layers added');
            assert.deepEqual(onL.layers.filter((l) => /^mymiss-/.test(l)), ['mymiss-fill', 'mymiss-line']);
            assert.deepEqual(onL.sources.filter((s) => s !== 'mymiss').sort(), baseApp.sources.slice().sort());
            assert.match(await label(), /^My miss · [5-9]-iron$/, '063: labelled with the club only (no "default shape")');
            assert.equal(await mapButtons(), baseAppBtns, 'no new button on the map');
            // 3 - the plays-like pill never covers the oval.
            const geo = JSON.parse(await ev("JSON.stringify({ o: HardPanGps.missRect(), p: (function(){ var p = document.querySelector('#gps-overlay .gps-ld-plays'), w = document.querySelector('#gps-overlay .gps-map-wrap'); if (!p || p.offsetParent === null) return null; var a = p.getBoundingClientRect(), b = w.getBoundingClientRect(); return { l: a.left - b.left, t: a.top - b.top, r: a.right - b.left, b: a.bottom - b.top }; })(), h: innerHeight })"));
            assert.ok(geo.o, 'the oval is on the map');
            if (geo.p) assert.ok(geo.o.r < geo.p.l || geo.o.l > geo.p.r || geo.o.b < geo.p.t || geo.o.t > geo.p.b, 'pill clear of the oval: ' + JSON.stringify(geo));
            console.log('# ' + vp.width + 'x' + vp.height + ' oval ' + JSON.stringify(geo.o) + ' pill ' + JSON.stringify(geo.p));
            await shot('4-map-on');
            // 4 - remembered (the app opened again), per golfer.
            await open();
            assert.equal(await ev("HardPanMissPattern.isOn('Ann Alpha') && !HardPanMissPattern.isOn('Ben Bravo')"), true, 'remembered, per golfer');
            await ev('__moveTo(' + APPROACH[0] + ',' + APPROACH[1] + ')');
            assert.ok(await until("(function(){ var l = HardPanGps.mapLayers(); return !!l && l.layers.indexOf('mymiss-fill') !== -1; })()", 8000), 'still on after a reload');
            // 5 - off again: the map exactly as before.
            await tools();
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await closeTools();
            await sleep(800);
            const offL = await layers();
            assert.deepEqual(offL.layers, baseApp.layers, 'layers as before');
            assert.deepEqual(offL.sources.slice().sort(), baseApp.sources.slice().sort(), 'sources as before');
            assert.equal(await label(), null);
            // 6 - My bag > 7-iron: the summary, the picture, the same switch.
            await ev("document.querySelector('#gps-overlay .gps-tools-menu .gps-my-bag').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay [data-bag-hist=\"7i\"]')", 6000), 'My bag 7-iron');
            await ev("document.querySelector('#gps-overlay [data-bag-hist=\"7i\"]').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-shist .gps-miss-line')", 6000), 'the club screen');
            const line = await ev("document.querySelector('#gps-overlay .gps-shist .gps-miss-line').textContent");
            assert.equal(line, '7-iron · 163 · miss right ≈ 4 short, miss left ≈ 4 long', '063: the My bag line from her 163');
            assert.equal(await ev("!!document.querySelector('#gps-overlay .gps-shist .gps-miss-pic svg path')"), true, 'the oval picture');
            // URGENT-067 (only add): her marked shots are still there - the 052 B line and the dots.
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-shist [data-miss-stats]').textContent"), '7-iron: 75% right, 9 yds avg · right misses 4 yds short · from 12 marked shots');
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-shist .gps-miss-pic svg circle').length"), 12, 'her 12 shots as dots');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-shist [data-shist-miss]').getAttribute('aria-checked')"), 'false');
            await shot('5-mybag-7i');
            await ev("document.querySelector('#gps-overlay .gps-shist [data-shist-miss]').click()");
            assert.equal(await ev("HardPanMissPattern.isOn('Ann Alpha')"), true, 'the club screen switch is the same switch');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-shist [data-shist-miss]').getAttribute('aria-checked')"), 'true');
            // Nothing about it goes to the database.
            const writes = await ev("JSON.stringify(window.__WRITES || [])");
            assert.doesNotMatch(writes, /mymiss|offline|shotlog/);
        } finally { await j.close(); }
    });
}
