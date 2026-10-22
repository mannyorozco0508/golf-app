// ============================================================================
// int-061 - THE MY MISS LABEL NEVER SITS ON THE RAIL OR THE DISTANCE LABELS (real Chrome, 402x874 and
// 375x667). Made-up course and golfer (the 049 / 052 B test course, "Ann Alpha", no marked shots - so
// every club shows the labelled DEFAULT SHAPE). My miss switched on in GPS tools, as a golfer does.
//   1  on the tee: the Driver oval - its label clear of the rail buttons, the distance bubbles, the
//      "20 yd" ring label, the plays-like pill and the oval itself (17-f-2: it touched "20 yd").
//   2  ~160 yds out on the middle line (the oval in the middle of the screen, no room beside it):
//      the iron's default shape (7-iron, a 6 in the made-up wind) - the label goes under (or over) the oval, clear of all of the above.
// HardPanGps.missLbl() reads the label's box on screen and everything it touches.
// ============================================================================
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


const LOG = { v: 1, golfers: { 'n:ann alpha': { hand: 'R', shots: [] } } };
const SEED2 = "localStorage.setItem('hardpan_shotlog_v1', " + JSON.stringify(JSON.stringify(LOG)) + ");";

for (const vp of [{ width: 402, height: 874 }, { width: 375, height: 667 }]) {
    test('My miss label placement at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" + SEED + SEED2;
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Chips Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome061-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const lbl = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missLbl())'));
        const clear = (L, what) => {
            assert.ok(L && L.box, what + ': the label is up ' + JSON.stringify(L));
            assert.deepEqual(L.hits, [], what + ': the label touches nothing (rail, bubbles, "20 yd", pill): ' + JSON.stringify(L));
            assert.equal(L.onOval, false, what + ': not on the oval ' + JSON.stringify(L));
            assert.ok(L.box.l >= 2 && L.box.r <= L.w - 2, what + ': on screen ' + JSON.stringify(L));
        };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            // GPS tools > My miss on (the sheet's switch).
            await ev("document.querySelector('#gps-overlay .gps-tools').click()");
            assert.ok(await until("(function(){ var t = document.querySelector('#gps-overlay .gps-tsheet'); return !!t && t.style.display !== 'none'; })()", 5000), 'Tools');
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(800);
            // 1 - the tee: Driver.
            assert.ok(await until("!!(HardPanGps.missLbl() && HardPanGps.missLbl().box)", 8000), 'the oval and its label');
            await sleep(800);
            const a = await lbl();
            assert.match(a.text, /^My miss · Driver/, a.text);
            clear(a, 'tee');
            console.log('# ' + vp.width + ' tee ' + JSON.stringify(a));
            await shot('1-tee-driver');
            // 2 - 150 yds out on the middle line: 7-iron, the oval in the middle of the screen.
            const at = G.destination(MID, 180, 163 * G.M_PER_YD);   // Ann's 7-iron is 163 (her bag)
            await ev('__moveTo(' + at[0] + ',' + at[1] + ')');
            const okIron = await until("(function(){ var l = HardPanGps.missLbl(); return !!l && /[5-9]-iron/.test(l.text); })()", 8000);
            assert.ok(okIron, 'an iron about 150 out (7-iron, or 6 in the made-up wind): ' + JSON.stringify(await lbl()) + ' plays ' + await ev("(document.querySelector('#gps-overlay .gps-ld-plays')||{}).innerText"));
            await sleep(1200);
            const b = await lbl();
            assert.match(b.text, /^My miss · [5-9]-irondefault shape$/, b.text);
            clear(b, '150 out');
            const o = JSON.parse(await ev('JSON.stringify(HardPanGps.missRect())'));
            console.log('# ' + vp.width + ' 150 ' + JSON.stringify(b) + ' oval ' + JSON.stringify(o));
            await shot('2-150-7i-default');
        } finally { await j.close(); }
    });
}
