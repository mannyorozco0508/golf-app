// 089c - THE DISTANCE BUBBLES KEEP CLEAR OF MY MISS'S CHIPS WITH A HELD FIX (10-60 s) AND "FROM TEE", IN REAL CHROME
// (375x667 SE, 402x874 17, 440x956 Pro Max). Build B b1f5d092 on the SE Simulator: with the fix 10-60 s old, 089b keeps
// the chips (missLastFix) while the map goes back to the hole view, and the "158y" bubble touched the 7i chip.
// A made-up course (synthetic - no licensed data), par 3s, still air. On each hole: a live fix at the tee, then the
// phone stops answering - the held fix at 30 s, then over 60 s ("from tee"). Each time: 0 overlaps between the
// distance bubbles and the chips, the "from tee" tag, the labels, the Card | Enter score | Mark row and Recenter.
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
const CODE = 'HLD89C', KEY = 'held089c_test', ID = '990000000000000289';
const TEE = [27.9200, -81.9100];
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const Y = G.M_PER_YD;
// hole n: tee, green F / C / B along bearing 0 (yards from the tee). Hole 1 is shaped like the Simulator's 158 yd par 3.
const GREENS = { 1: [147, 158, 168], 2: [79, 101, 122], 3: [118, 140, 160], 4: [122, 135, 148] };
const HOLES = [1, 2, 3, 4];
const h = {};
for (let n = 1; n <= 18; n++) {
    const t = G.destination(TEE, 90, 600 * (n - 1)); const g = GREENS[n] || [330, 340, 350];
    h[n] = { g: { f: P(G.destination(t, 0, g[0] * Y)), c: P(G.destination(t, 0, g[1] * Y)), b: P(G.destination(t, 0, g[2] * Y)) }, t: { b: P(t) } };
}
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Preview Held (synthetic)', course: '', city: 'Bowling Green', state: 'FL', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i < 4 ? { par: 3 } : {}));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: 'Preview Held (synthetic)', eventName: 'Test 089c held fix', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__gpsStop = false; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { if (window.__gpsStop) return; ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MB = { LW: 84, SW: 104, GW: 121, PW: 133, '9i': 145, '8i': 157, '7i': 169, '6i': 181, '5i': 193, Hy: 205, '3w': 230, Dr: 260 };
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_089C || '';
// Every visible distance bubble against the chips, the "from tee" tag, the labels, the bottom row and Recenter.
// Any overlap at all (> 0 px) counts - the Simulator's "touch" was an edge.
const OVERLAPS = "JSON.stringify((function(){ var vis = function (e) { if (!e || e.offsetParent === null) return false; var s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };"
    + " var nm = function (e) { return String(e.className).split(' ')[0] + ':' + e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 24); };"
    + " var bs = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on'), vis);"
    + " var os = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip, #gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-miss-lbl span, #gps-overlay .gps-green-lbl, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-carry-lbl, #gps-overlay .gps-arc-lbl, #gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-recenter'), vis);"
    + " var out = []; bs.forEach(function (p) { var a = p.getBoundingClientRect(); os.forEach(function (e) { var q = e.getBoundingClientRect(); if (Math.min(a.right, q.right) - Math.max(a.left, q.left) > 0 && Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top) > 0) out.push(nm(p) + ' x ' + nm(e)); }); });"
    + " return { hits: out, bubbles: bs.map(function (p) { var a = p.getBoundingClientRect(); return nm(p) + '@' + Math.round(a.left) + ',' + Math.round(a.top) + '-' + Math.round(a.right) + ',' + Math.round(a.bottom) + ' ' + p.getAttribute('data-at'); }),"
    + " chips: Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip'), vis).map(function (e) { var a = e.getBoundingClientRect(); return nm(e) + '@' + Math.round(a.left) + ',' + Math.round(a.top) + '-' + Math.round(a.right) + ',' + Math.round(a.bottom); }) }; })())";

for (const vp of [{ width: 375, height: 667 }, { width: 402, height: 874 }, { width: 440, height: 956 }]) {
    test('089c distance bubbles clear of the My miss chips (held fix 30 s, from tee) at ' + vp.width + 'x' + vp.height, { timeout: 400000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded089c')) { sessionStorage.setItem('seeded089c', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Preview Held (synthetic)', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Bowling Green', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome089c-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
        const overlaps = async () => JSON.parse(await ev(OVERLAPS));
        const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
        const fails = [];
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            assert.equal(await ev("HardPanMissPattern.isOn('Test Golfer')"), true, 'My miss on (seeded)');
            await ev(tips); await sleep(800);
            for (const n of HOLES) {
                // A live fix at the tee: the depth chips from the golfer's spot (the baseline: no overlaps).
                await ev('window.__gpsStop = false');
                await ev('HardPanGps.goHole(' + n + ')'); await ev('__moveTo(' + h[n].t.b[0] + ',' + h[n].t.b[1] + ')'); await sleep(3000);
                await ev(tips); await sleep(600);
                assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips && n.chips.depth && n.chips.from === 'me' && !n.chips.held); })()", 8000), 'hole ' + n + ' live chips: ' + JSON.stringify(await now()));
                let ov = await overlaps();
                if (ov.hits.length) fails.push('hole ' + n + ' live: ' + JSON.stringify(ov));
                // THE HELD FIX: the phone stops answering; past the app's 10 s rule, My miss holds the last fix. Age 30 s.
                await ev('window.__gpsStop = true'); await sleep(12500);
                assert.equal(await ev('HardPanGps.appOrigin()'), 'tee', 'the 10 s rule unchanged');
                const age = await ev('HardPanGps.missFixAge(0)');
                await ev('HardPanGps.missFixAge(' + (30000 - age) + ')'); await sleep(1500);
                let m = await now();
                assert.ok(m.chips && m.chips.depth && m.chips.from === 'me' && m.chips.held === true, 'hole ' + n + ' 30 s: held ' + JSON.stringify(m.chips));
                ov = await overlaps();
                assert.ok(ov.bubbles.length > 0, 'hole ' + n + ' held: a distance bubble shows ' + JSON.stringify(ov));
                if (ov.hits.length) fails.push('hole ' + n + ' held 30 s: ' + JSON.stringify(ov));
                await shot(n + '-held30');
                // "FROM TEE": past 60 s, the chips measured from the mapped tee with the "from tee" tag.
                await ev('HardPanGps.missFixAge(31000)'); await sleep(1500);
                m = await now();
                assert.ok(m.chips && m.chips.depth && m.chips.from === 'tee' && !m.chips.held, 'hole ' + n + ' from tee ' + JSON.stringify(m.chips));
                assert.equal(await ev("(document.querySelector('#gps-overlay .gps-miss-chips-from') || {}).textContent || ''"), 'from tee');
                ov = await overlaps();
                assert.ok(ov.bubbles.length > 0, 'hole ' + n + ' from tee: a distance bubble shows ' + JSON.stringify(ov));
                if (ov.hits.length) fails.push('hole ' + n + ' from tee: ' + JSON.stringify(ov));
                await shot(n + '-fromtee');
            }
            assert.deepEqual(fails, [], '0 overlaps between the bubbles and the chips / labels / row / Recenter');
        } finally { await j.close(); }
    });
}
