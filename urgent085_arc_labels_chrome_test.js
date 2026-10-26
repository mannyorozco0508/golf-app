// URGENT-085 (3) - THE CLUB ARC LABELS NEVER OVERLAP, IN REAL CHROME (375x667 and 430x932; the GPS map, WebGL).
// Manny's hole 1 at The Arizona CC (Oct 26): "Dr 285 generic", "3W ... ge" and the "342y" distance bubble on top of
// each other. A dense bag (Dr, 3W, 5W, hybrid, 4i-9i, wedges), every club "generic" (no marked shots - the taller
// two-line labels, as on his phone), Distance arcs on, the golfer off the hole (arcs from the tee, as at his house).
// A made-up course (synthetic - no licensed data): straight holes north, 300 to 520 yds. On every hole and size:
//   - no shown carry label touches another shown carry label, a distance bubble ("342y"), the "20 yd" ring label
//     or a F / C / B label (measured from the screen boxes, nothing taken from the app's own bookkeeping);
//   - the longest club's label (the first arc) is always shown;
//   - every arc line is still drawn (data-carry-arcs keeps every club).
// Golfer "Test 085 Ann". Nothing is written anywhere real (journey's in-memory database).
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
const G = window.HardPanGeo;

const CODE = 'ARC085', KEY = 'arc085_test', ID = '990000000000000085', YDM = 0.9144;
const LEN = [342, 300, 320, 360, 380, 400, 420, 450, 520, 342, 330, 310, 370, 390, 410, 440, 480, 342];
const BASE = [33.4600, -111.9600];
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = {};
for (let n = 1; n <= 18; n++) {
    const t = G.destination(BASE, 90, 450 * (n - 1)), mid = G.destination(t, 0, LEN[n - 1] * YDM);
    h[n] = { g: { f: P(G.destination(mid, 180, 12)), c: P(mid), b: P(G.destination(mid, 0, 12)) }, t: { b: P(t) } };
}
const OFF = G.destination(BASE, 180, 3000);   // the golfer: off every hole (as Manny at his house) - arcs from the tee
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Arc Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: BASE[0], lng: BASE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, { par: LEN[i] > 470 ? 5 : 4 }));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 085 Ann'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Arc Test Golf Club' } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const SETUP = "(function(){ var d = HardPanGpsBag.defaultCarries(10); Object.keys(d).forEach(function(k){ d[k] = 0; });"
    + " var b = { Dr: 285, '3w': 255, '5w': 238, Hy: 222, '4i': 206, '5i': 194, '6i': 182, '7i': 170, '8i': 158, '9i': 146, PW: 134, GW: 118, SW: 100, LW: 80 };"
    + " Object.keys(b).forEach(function(k){ d[k] = b[k]; }); HardPanGpsBag.setup('Test 085 Ann', d); return 1; })()";
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
const GEO = (at) => "(function(){ var cur = { lat: " + at[0] + ", lng: " + at[1] + " }; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; setTimeout(f, 50); setInterval(f, 1000); return 1; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function () {} } }); } catch (e) {} })();";
// 5 mph wind (Manny's screen): generic plays-like for every club.
const WIND = "try{localStorage.setItem('hardpan_wind_v1_" + KEY + "', JSON.stringify({ at: Date.now() + 3600e3, src: 'weatherkit', obsAt: Date.now(), mph: 5, fromDeg: 270, toDeg: 90, tempF: 75 }));}catch(e){}";
const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '085', 'chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every shown carry label's screen box, and what it touches (other shown labels, bubbles, ring label, F/C/B labels).
const OVERLAPS = "JSON.stringify((function(){ var vis=function(e){ var cs=getComputedStyle(e); if (e.offsetParent===null || cs.display==='none' || cs.visibility==='hidden' || Number(cs.opacity)===0) return false; var b=e.getBoundingClientRect(); return b.width>0 && b.height>0; };"
    + " var B=function(e){ return e.getBoundingClientRect(); }, ov=function(a,b){ return Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5; };"
    + " var lbls=Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-carry-lbl'), vis), others=Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-green-lbl'), vis);"
    + " var out=[]; lbls.forEach(function(e,i){ lbls.forEach(function(o,k){ if (k>i && ov(B(e),B(o))) out.push(e.innerText.replace(/\\s+/g,' ')+' x '+o.innerText.replace(/\\s+/g,' ')); }); others.forEach(function(o){ if (ov(B(e),B(o))) out.push(e.innerText.replace(/\\s+/g,' ')+' x '+String(o.className)+' '+o.textContent); }); });"
    + " return { hits: out, shown: lbls.map(function(e){ return e.innerText.replace(/\\s+/g,' ').trim(); }), all: document.querySelectorAll('#gps-overlay .gps-carry-lbl').length, arcs: document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs') || '',"
    + "  pills: others.filter(function(o){ return /gps-pill/.test(o.className); }).map(function(o){ return o.textContent; }) }; })())";

for (const vp of [{ width: 375, height: 667 }, { width: 430, height: 932 }]) {
    test('arc labels never overlap each other or the distance bubble at ' + vp.width + 'x' + vp.height + ' (dense bag, 18 holes)', { timeout: 400000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO(OFF) + WIND + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "', '" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');"
            + "localStorage.setItem('hardpan_gps_arcs_v1', JSON.stringify({ 'n:test 085 ann': 1 }));}catch(e){}";
        const DB = { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Arc Test Golf Club', data: CD, location: { latitude: BASE[0], longitude: BASE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} };
        const j = await openJourney({ db: DB, viewport: vp, webgl: true, preScript: pre, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) { } await sleep(250); } return false; };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev(SETUP);
            const bad = [], seen = [];
            for (let n = 1; n <= 18; n++) {
                await ev('HardPanGps.setHole(' + n + ', ' + CD[n - 1].par + ')');
                await until("(document.querySelector('#gps-overlay .gps-map').getAttribute('data-carry-arcs')||'').length > 0", 8000);
                await sleep(1800);
                const o = JSON.parse(await ev(OVERLAPS));
                seen.push(n + ': ' + o.shown.join(' / ') + ' (' + o.all + ' labels; arcs ' + o.arcs + '; bubbles ' + o.pills.join(',') + ')');
                if (o.hits.length) bad.push('hole ' + n + ' (' + LEN[n - 1] + ' yd): ' + o.hits.join(' ; '));
                if (process.env.DBG085) console.log(n, JSON.stringify(o), await ev('JSON.stringify(HardPanGps.carryLbls ? HardPanGps.carryLbls() : null)'));
                assert.ok(o.all >= 1 && o.arcs.split(' ').length === o.all, 'every arc keeps its label element and its line: ' + JSON.stringify(o));
                assert.ok(o.shown.length >= 1 && o.shown[0] === (await ev("(function(){ var e=document.querySelector('#gps-overlay .gps-carry-lbl'); return e.innerText.replace(/\\s+/g,' ').trim(); })()")), 'the first (longest) club\'s label is shown: ' + JSON.stringify(o));
                if (n === 1) { fs.mkdirSync(SHOTS, { recursive: true }); await j.shot(path.join(SHOTS, 'arcs-' + vp.width + 'x' + vp.height + '-hole1.png')); }
            }
            console.log(seen.join('\n'));
            assert.deepEqual(bad, [], 'labels touching:\n' + bad.join('\n'));
        } finally { await j.close(); }
    });
}
