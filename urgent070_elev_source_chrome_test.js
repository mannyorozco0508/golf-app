// 070 PART 1 IN REAL CHROME - THE COURSE'S HEIGHT FROM EVERY SOURCE, THE WRONG-COURSE GUARD, AND THE
// PRIVACY FETCH-SPY. A made-up links course outside the US (no USGS there), a made-up golfer. window.fetch
// is wrapped before the app loads: every request is recorded; the terrain tile answers with a PNG made in
// the page (terrarium 129/109/128 = 365.5 m = 1,199 ft); everything else gets a 404 (no network at all).
//   A  the terrain tile: courseElev() = { src: 'tile', ft ~1,199 }, plays-like 151 -> 148 vs sea level;
//      a stale record from ANOTHER course (Papago's origin, 5,000 ft) is discarded, never used.
//   B  the tile fails, the phone reports an altitude while ON the course: { src: 'phone' }; the golfer walks
//      ~2 km off the course: the phone's altitude is no longer used -> { ft: null } and no plays-like.
//   PRIVACY: no request carries the golfer's position (to 3 decimals) or the phone's altitude; the only
//   elevation request is the course point's tile number.
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

const CODE = 'ELS070', KEY = 'elev070_links', ID = '990000000000000070';
const TEE = [56.3433, -2.8025], MID = G.destination(TEE, 0, 350);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 300 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Firth Links Golf Club', course: '', city: 'St Andrews', state: '', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Firth Links Golf Club', eventName: 'Elevation sources', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
// The stand-in GPS, with the phone's altitude (meters) when window.__altM is set.
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " var co = function () { return { latitude: cur.lat, longitude: cur.lng, accuracy: 3, altitude: typeof window.__altM === 'number' ? window.__altM : null, altitudeAccuracy: typeof window.__altM === 'number' ? 8 : null }; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: co(), timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: co(), timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// THE FETCH SPY: every URL kept in sessionStorage (it survives a reload); the terrain tile made here.
const SPY = "(function(){ var real = window.fetch; window.__urls = function () { try { return JSON.parse(sessionStorage.getItem('spy070') || '[]'); } catch (e) { return []; } };"
    + " var keep = function (u) { var a = window.__urls(); a.push(u); try { sessionStorage.setItem('spy070', JSON.stringify(a)); } catch (e) {} };"
    + " var png = function () { var c = document.createElement('canvas'); c.width = 256; c.height = 256; var x = c.getContext('2d'); x.fillStyle = 'rgb(129,109,128)'; x.fillRect(0, 0, 256, 256); return new Promise(function (ok) { c.toBlob(ok, 'image/png'); }); };"
    + " window.fetch = function (input, init) { var u = typeof input === 'string' ? input : (input && input.url) || String(input); keep(u);"
    + "   if (/elevation-tiles-prod\\/terrarium\\//.test(u)) { if (sessionStorage.getItem('tile070') === 'fail') return Promise.resolve(new Response('', { status: 503 })); return png().then(function (b) { return new Response(b, { status: 200, headers: { 'Content-Type': 'image/png' } }); }); }"
    + "   if (/^(https?:)?\\/\\//.test(u)) return Promise.resolve(new Response('{}', { status: 404 })); return real.apply(this, arguments); }; })();";
// Ann's bag: typed, from SEA LEVEL (chosen), calm, 70 F.
const BAG = { v: 1, golfers: { 'n:ann alpha': { shots: {}, set: { Dr: 250, '3w': 230, '5w': 215, Hy: 200, '4i': 190, '5i': 180, '6i': 171, '7i': 163, '8i': 152, '9i': 141, PW: 130, GW: 115, SW: 95, LW: 75 }, setupDone: true, alt: { mode: 'sea' } } } };
// A STALE record from ANOTHER course under this key: Papago's origin, 5,000 ft. Must never be used.
const STALE = { v: 1, o: [33.456, -111.948], z: 12, x: 1, y: 1, ft: 5000, at: 1 };
const SEED = (tile) => "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_ctile_v1_" + KEY + "', " + JSON.stringify(JSON.stringify(STALE)) + ");"
    + " sessionStorage.setItem('tile070', '" + tile + "');"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AT151 = G.destination(MID, 180, 151 * G.M_PER_YD);
const OFF = G.destination(TEE, 270, 2000);   // ~2 km west of the course

async function open(tile, altM) {
    const pid = (round().players[0] || {}).id;
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + SPY + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
        + (altM != null ? 'window.__altM = ' + altM + ';' : '')
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
        + "if (!sessionStorage.getItem('seeded070')) { sessionStorage.setItem('seeded070', '1'); " + SEED(tile) + " }";
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Firth Links Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'St Andrews', state: '' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
    await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
    assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 30000), 'the map opens');
    await ev('__moveTo(' + AT151[0] + ',' + AT151[1] + ')');
    return { j, ev, until };
}
function privacy(urls, golferPts, altFt) {
    const deg3 = (x) => x.toFixed(3);
    golferPts.forEach((p) => urls.forEach((u) => {
        assert.ok(!(u.indexOf(deg3(p[0])) !== -1 && u.indexOf(deg3(p[1])) !== -1), 'no request carries the golfer\'s position: ' + u);
    }));
    urls.forEach((u) => { assert.ok(!/altitude|[?&]alt=/i.test(u), 'no altitude in a request: ' + u); if (altFt != null) assert.ok(u.indexOf(String(Math.round(altFt))) === -1 || /terrarium\/\d+\/\d+\/\d+\.png$/.test(u), 'the phone\'s altitude never sent: ' + u); });
    const elev = urls.filter((u) => /terrarium|epqs|elevation/i.test(u));
    const t = G.terrainTile(MID);
    elev.forEach((u) => assert.strictEqual(u, t.url, 'the only elevation request is the COURSE point\'s tile: ' + u));
    return elev;
}

test('070 A: outside the US the course\'s height comes from the terrain tile; a stale other-course record is discarded; privacy', { timeout: 300000 }, async () => {
    const { j, ev, until } = await open('ok', null);
    try {
        assert.ok(await until("(function(){ var c = HardPanGps.courseElev(); return c && c.src === 'tile'; })()", 20000), 'the tile height arrives');
        const ce = JSON.parse(await ev('JSON.stringify(HardPanGps.courseElev())'));
        assert.equal(ce.src, 'tile');
        assert.ok(Math.abs(ce.ft - 1199) <= 1, 'terrarium 365.5 m = 1,199 ft: ' + ce.ft);
        const rec = JSON.parse(await ev("localStorage.getItem('hardpan_ctile_v1_" + KEY + "')"));
        assert.ok(rec.ft !== 5000 && G.haversineMeters(rec.o, MID) < 50, 'the stale Papago record is gone; the new one keeps THIS course\'s point');
        assert.ok(await until('!!HardPanGps.playsLine()', 10000), 'plays-like shows (altitude only)');
        const pl = JSON.parse(await ev('JSON.stringify(HardPanGps.playsLine())'));
        assert.equal(pl.yards, Math.round(151 / G.altFactor(1199, 0)), '151 at ~1,199 ft vs sea level: ' + JSON.stringify(pl));
        assert.equal(pl.yards, 148);
        const urls = JSON.parse(await ev('JSON.stringify(__urls())'));
        const elev = privacy(urls, [AT151], null);
        assert.equal(elev.length, 1, 'ONE tile request for the course: ' + JSON.stringify(elev));
    } finally { await j.close(); }
});

test('070 B: the tile fails -> the phone\'s own altitude, only while ON the course; off it: not available; privacy', { timeout: 300000 }, async () => {
    const { j, ev, until } = await open('fail', 360);
    try {
        assert.ok(await until("(function(){ var c = HardPanGps.courseElev(); return c && c.src === 'phone'; })()", 20000), 'the phone fallback');
        const ce = JSON.parse(await ev('JSON.stringify(HardPanGps.courseElev())'));
        assert.ok(Math.abs(ce.ft - 360 * 3.28084) < 1, 'the phone\'s 360 m = 1,181 ft: ' + ce.ft);
        assert.ok(await until('!!HardPanGps.playsLine()', 10000));
        assert.equal(JSON.parse(await ev('JSON.stringify(HardPanGps.playsLine())')).yards, Math.round(151 / G.altFactor(360 * 3.28084, 0)));
        const ls = await ev('JSON.stringify(Object.keys(localStorage).map(function (k) { return k + "=" + localStorage.getItem(k); }))');
        assert.ok(ls.indexOf('1181') === -1 && ls.indexOf('"altitude"') === -1, 'the phone\'s altitude is never stored');
        // Walk ~2 km off the course: the phone's altitude is no longer the course's height.
        await ev('__moveTo(' + OFF[0] + ',' + OFF[1] + ')');
        assert.ok(await until("(function(){ var c = HardPanGps.courseElev(); return c && c.src === null && c.ft === null; })()", 10000), 'off the course: not available');
        const urls = JSON.parse(await ev('JSON.stringify(__urls())'));
        const elev = privacy(urls, [AT151, OFF], 360 * 3.28084);
        assert.ok(elev.length >= 1 && elev.every((u) => u === G.terrainTile(MID).url), 'only the course\'s tile was asked for (and failed)');
    } finally { await j.close(); }
});
