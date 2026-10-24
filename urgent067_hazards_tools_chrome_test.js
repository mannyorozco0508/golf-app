// URGENT-067 (ONLY ADD) - THE HAZARDS SHEET STAYS REACHABLE, IN REAL CHROME.
// 064 #7 took the Hazards button off the map (Manny's ask). The existing Hazards sheet (008) - the
// per-hazard reach / carry and the layups - had no other way in, so Tools gets one entry,
// "Hazards & layups", that opens that same sheet, unchanged. No button goes back on the map.
//   S  the source: the Tools tile runs the hidden menu item .gps-hazards-open, which calls the
//      existing openHazards(); still no gps-hz-btn; the entry carries data-feature="hazards".
//   1  (393x852, 375x667) Tools shows "Hazards & layups"; the map has no Hazards button.
//   2  tap it: Tools closes, the Hazards sheet opens ("Hazards · Hole 1").
//   3  the sheet lists the bunker and the water with "reach N · carry N" (N near the fixture's
//      yards) and the layup rows.
// The made-up course of urgent064_no_hazards_btn_chrome_test.js (hole 1: 400-yd par 4, fairway
// bunker right 250 / 274, water left 221 / 245). Golfers "Test 067 Ann" / "Test 067 Ben". Nothing
// is written to any database (the journey's in-page stand-in). Screenshots into SHOTS_067 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-arcs-plan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); require('./gps-wind-learn.js');
const G = window.HardPanGeo, WL = window.HardPanWindLearn, A = require('./gps-arcs-plan.js');

const CODE = 'HZT067', KEY = 'hzbgps_test', ID = '990000000000000064', YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400 * YDM);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const off = (yd, side) => P(G.destination(G.destination(TEE, 0, yd * YDM), side === 'R' ? 90 : 270, 20));
const Z1 = [['fb', 'R'].concat(off(250, 'R')), ['fb', 'R'].concat(off(274, 'R')), ['w', 'L'].concat(off(221, 'L')), ['w', 'L'].concat(off(245, 'L'))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) }, z: Z1 } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Hazard Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 067 Ann', 'Test 067 Ben'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Hazard Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const BAG = { Dr: { yd: 262 }, '3w': { yd: 231 }, '5w': { yd: 0 }, Hy: { yd: 205 }, '7i': { yd: 160 }, '8i': { yd: 150 }, '9i': { yd: 138 } };
const SETUP = "(function(){ var d = HardPanGpsBag.defaultCarries(10); Object.keys(d).forEach(function(k){ d[k] = 0; }); d.Dr = 262; d['3w'] = 231; d.Hy = 205; d['7i'] = 160; d['8i'] = 150; d['9i'] = 138; d.PW = 0; HardPanGpsBag.setup('Test 067 Ann', d); return 1; })()";
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
const GEO = (at) => "(function(){ var cur = { lat: " + at[0] + ", lng: " + at[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const WIND = "try{localStorage.setItem('hardpan_wind_v1_" + KEY + "', JSON.stringify({ at: Date.now() + 3600e3, src: 'weatherkit', obsAt: Date.now(), mph: 12, fromDeg: 0, toDeg: 180, tempF: 70 }));}catch(e){}";
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
const SHOTS = process.env.SHOTS_067 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => Math.round(x);

test('S: the source - Tools entry opens the existing Hazards sheet; no map button', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.ok(!/gps-hz-btn/.test(v), 'still no Hazards button on the map');
    assert.match(v, /\['\.gps-hazards-open', '[^']+', 'Hazards & layups'\]/, 'the Tools tile');
    assert.match(v, /<button type="button" class="gps-menu-item gps-hazards-open" data-feature="hazards" style="display:none">Hazards &amp; layups<\/button>/, 'the menu item (hazards switch removes it)');
    assert.match(v, /on\(el, '\.gps-hazards-open', function \(\) \{ if \(S\) openHazards\(\); \}\);/, 'it calls the existing openHazards');
    assert.match(v, /show\('\.gps-hazards-open', S\.pro && S\.mode === 'measure' && !S\.replay && courseHasAnyData\(\)\);/, 'shown when the old button was');
});

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Tools > Hazards & layups opens the Hazards sheet at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO(TEE) + WIND + MAPS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "', '" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const DB = { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Hazard Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
        const j = await openJourney({ db: DB, viewport: vp, webgl: true, preScript: pre, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const TS = "document.querySelector('#gps-overlay .gps-tsheet')", HZ = "document.querySelector('#gps-overlay .gps-hzs')";
        const TILE = TS + ".querySelector('[data-ts-tile=\".gps-hazards-open\"]')";
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(2500);
            await ev(SETUP);
            // 1. the map: no Hazards button; Tools: the entry
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-hz-btn').length"), 0, 'no Hazards button on the map');
            assert.equal(await ev("(function(){ var h = " + HZ + "; return !!h && h.style.display === 'none'; })()"), true, 'the sheet starts closed');
            await ev("document.querySelector('#gps-overlay .gps-tools').click()");
            assert.ok(await until("(function(){ var t = " + TS + "; return !!t && t.style.display !== 'none'; })()", 5000), 'Tools');
            const tile = JSON.parse(await ev("(function(){ var b = " + TILE + "; if (!b) return 'null'; var r = b.getBoundingClientRect(); return JSON.stringify({ text: b.innerText.replace(/\\s+/g, ' ').trim(), shown: b.style.display !== 'none' && r.height > 0, h: Math.round(r.height) }); })()"));
            assert.ok(tile && tile.shown, 'the entry shows in Tools: ' + JSON.stringify(tile));
            assert.match(tile.text, /Hazards & layups$/, 'its label');
            assert.ok(tile.h >= 44, 'a full-size tap target');
            await ev(TILE + ".scrollIntoView({ block: 'center' })");
            await shot('1-tools-hazards-layups');
            // 2. it opens the existing sheet
            await ev(TILE + '.click()');
            assert.ok(await until("(function(){ var h = " + HZ + "; return !!h && h.style.display !== 'none' && h.querySelectorAll('.gps-hzs-row').length > 0; })()", 8000), 'the Hazards sheet opens');
            assert.equal(await ev("(function(){ var t = " + TS + "; return t.style.display; })()"), 'none', 'Tools closed behind it');
            assert.equal(await ev(HZ + ".querySelector('.gps-hzs-title').textContent"), 'Hazards \u00b7 Hole 1');
            // 3. reach / carry per hazard, and the layups
            const rows = JSON.parse(await ev("JSON.stringify(Array.from(" + HZ + ".querySelectorAll('.gps-hzs-list .gps-hzs-row')).map(function(e){ return { cls: e.className, name: e.querySelector('.gps-hzs-name').textContent, nums: e.querySelector('.gps-hzs-nums').textContent }; }))"));
            const rc = (x) => { const m = /^reach (\d+) \u00b7 carry (\d+)$/.exec(x.nums); return m ? [Number(m[1]), Number(m[2])] : null; };
            const bunker = rows.find((x) => /gps-hzs-bunker/.test(x.cls) && rc(x)), water = rows.find((x) => /gps-hzs-water/.test(x.cls) && rc(x));
            assert.ok(bunker && water, 'a bunker and a water row with reach / carry: ' + JSON.stringify(rows));
            const near = (a, b) => Math.abs(a - b) <= 8;
            assert.ok(near(rc(bunker)[0], 250) && near(rc(bunker)[1], 274), 'bunker 250 / 274: ' + JSON.stringify(bunker));
            assert.ok(near(rc(water)[0], 221) && near(rc(water)[1], 245), 'water 221 / 245: ' + JSON.stringify(water));
            const lays = JSON.parse(await ev("JSON.stringify(Array.from(" + HZ + ".querySelectorAll('.gps-hzs-lay .gps-hzs-layup')).map(function(e){ return e.innerText.replace(/\\s+/g, ' ').trim(); }))"));
            assert.ok(lays.length > 0, 'layup rows: ' + JSON.stringify(lays) + ' / ' + await ev(HZ + '.innerText'));
            assert.notEqual(await ev("getComputedStyle(" + HZ + ".querySelector('.gps-hzs-layh')).display"), 'none', 'the layups heading');
            await shot('2-hazards-sheet');
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-hz-btn').length"), 0, 'still no map button');
            assert.deepEqual(j.consoleErrors.filter((e) => /hz|hazard/i.test(e.text)), []);
        } finally { await j.close(); }
    });
}
