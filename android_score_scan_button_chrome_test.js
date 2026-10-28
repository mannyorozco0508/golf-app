// ============================================================================
// ANDROID: THE SCORE SCAN BUTTON SHOWS WHEN THE DOCUMENT CAMERA PLUGIN IS IN THE APP (doc-scan job, Oct 27)
//   The score scan ("Scan scorecard", gps-scan-grid.js) is an extra in Tools > Customize. It is offered only
//   when gps-scan-client.js nativeCameraHere() finds the plugin "HardPanDocScan" - iOS always had it; Android
//   has it now (HardPanDocScanPlugin.java, ML Kit). On the emulator the Tools button is not on that round's
//   layout, so this is the proof that the button reaches a golfer on Android, the way a golfer gets there:
//     1  Android WITH the plugin: Customize lists "scan" (OFF; 🔒 Host · 3 free); Try a free scan turns it on ->
//        the 📷 Scan button is ON the round screen (a real box, inside the screen); Scan -> the scan sheet's
//        Scan the card reaches the plugin's scan() - the document camera (stood in: answers "cancelled").
//     2  Android WITHOUT the plugin (a build before this job): no "scan" row at all - the gate, not the list.
//   Real Chrome, the real index.html round (copied setup: urgent066_customize_chrome_test.js), Firebase stood in
//   (tools/lib/journey.js). Capacitor says "android" and reports the plugins named; nothing else is faked.
//   WHAT THIS CANNOT PROVE: the real camera and the live scan. The emulator pass did the camera (course scan);
//   the live scan is Play internal testing on a real phone (Manny, Oct 27).
//   COUNTS (final file, on android-2.0-addons 4555d3e9): 2 tests, 2 pass.
//   Control (code): gps-scan-grid.js pluginHere forced false -> see the CONTROL line at the end of this header.
// ============================================================================
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const table = require('./gps-courses.js');

const SHOTS = process.env.U066_SHOTS || '';
const CODE = 'TCUST1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const ME = dest(dest(T1, B1, L1 - 160 * 0.9144), B1 + 90, 12);

const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:'',elevGapMs:0});}});})();";
const GEO = "(function(){ var cur={lat:" + ME[0] + ",lng:" + ME[1] + "}; try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){var f=function(){ok({coords:{latitude:cur.lat,longitude:cur.lng,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); setInterval(f,1000); return 1;},getCurrentPosition:function(){},clearWatch:function(){}}}); } catch(e){} })();";
const NET = "(function(){ var real = window.fetch; function json(o){ return new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}); }"
    + " window.fetch = function(u){ var s = String(u && u.url || u); if (/epqs/.test(s)) return Promise.resolve(json({value:20})); if (/api\\.weather\\.gov/.test(s)) return Promise.resolve(new Response('{}',{status:404})); return real.apply(this, arguments); }; })();";
const SEED = (hintSeen) => "(function(){ try { if (sessionStorage.getItem('__s')) return; sessionStorage.setItem('__s','1'); localStorage.setItem('hardpan_round_side','gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "','1');"
    + " localStorage.setItem('hardpan_gps_whoasked_" + CODE + "','1'); localStorage.setItem('hardpan_gps_golfer_" + CODE + "','101'); localStorage.setItem('hardpan_gps_autoadvance','0');"
    + (hintSeen ? " localStorage.setItem('hardpan_customize_hint_v1','1');" : '') + " } catch(e){} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 4, names: ['Test Manny', 'Test Joe', 'Test Rick', 'Test Dave'], hcps: [9, 12, 15, 6], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    r.scores = {};
    const cd = r.courseData.slice().sort((a, b) => a.hole - b.hole);
    const D = { 101: [1, 0, -1], 102: [0, -1, 0], 103: [1, 1, 0], 104: [0, 0, 1] };
    r.players.forEach((p) => (D[p.id] || []).forEach((d, i) => { r.scores['p' + p.id + '_h' + cd[i].hole] = cd[i].par + d; }));
    return r;
}
const BLOCK = ['*arcgis*', '*overpass*', '*cloudfunctions.net*', '*esri*', '*nationalmap.gov*'];
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });

// Capacitor as the Android shell has it: platform "android", isPluginAvailable for the plugins really in the
// app, App for the Back key. HardPanDocScan, when present, records scan() and answers "cancelled".
const ANDROID = (plugins) => "(function(){ var have = " + JSON.stringify(plugins) + "; window.__docscan = 0;"
    + " var P = { App: { addListener: function () { return Promise.resolve({ remove: function () {} }); }, minimizeApp: function () {}, getLaunchUrl: function () { return Promise.resolve(undefined); } } };"
    + " if (have.indexOf('HardPanDocScan') !== -1) P.HardPanDocScan = { available: function () { return Promise.resolve({ available: true }); }, scan: function () { window.__docscan++; return Promise.resolve({ cancelled: true }); } };"
    + " window.Capacitor = { getPlatform: function () { return 'android'; }, isNativePlatform: function () { return true; }, isPluginAvailable: function (n) { return have.indexOf(n) !== -1; },"
    + "   registerPlugin: function (n) { return P[n] || { available: function () { return Promise.reject(new Error('\"' + n + '\" plugin is not implemented on android')); } }; }, Plugins: P }; })();";
// The scan server switch ON, as the dev build sets it: without it the score scan says "isn't switched on yet" and
// never opens the camera (gps-scan-client.js serverOffHere) - on iOS too. Chained onto CFG's setter, not replacing it.
const SERVER_ON = "(function(){ var d=Object.getOwnPropertyDescriptor(window,'HARDPAN_GPS_CONFIG'); var c; Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},"
    + "set:function(v){ if (d && d.set) { d.set(v); v = d.get(); } c = Object.assign({}, v, { features: Object.assign({}, v && v.features, { scanServer: true }) }); }}); })();";
async function roundScreen(plugins) {
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true,
        blockUrls: BLOCK, preScript: ANDROID(plugins) + CFG + SERVER_ON + 'window.__hardpanDoors = true;' + GEO + NET + SEED(true) + iapStub({ active: true }) });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + CODE), 2500);
    await ready(j);
    return j;
}
async function ready(j) {
    await j.evaluate("(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()");
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
        const ok = await j.evaluate("(function(){ var m = document.querySelector('#gps-overlay .gps-map'); var n=document.querySelector('#gps-overlay .gps-m'); return !!(m && m.dataset.ready === '1' && n && /\\d/.test(n.textContent)); })()");
        if (ok) break;
        await sleep(300);
    }
    await sleep(2500);
}
const RECT = (sel) => "(function(){ var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; var b=e.getBoundingClientRect(); return b.width&&b.height ? {l:b.left,t:b.top,r:b.right,b:b.bottom} : null; })()";
const ROWS = "JSON.stringify([].map.call(document.querySelectorAll('.hpf-panel .hpf-list .hpf-row'), function(r){ return [r.getAttribute('data-hpf-row'), !!r.querySelector('.hpf-sw.on')]; }))";
// The 2.0 round's way in (no Tools button on its map): ☰ Menu -> ⚙️ Round settings -> More -> 🛠 GPS tools (its
// simple-look row, gps-round.js li('gps')) -> the Tools
// sheet -> Customize your screen. Every step a real tap on something on screen.
async function openCustomize(j) {
    assert.ok(await j.tap('#gps-overlay .gps-door-games'), '☰ Menu'); await sleep(900);
    assert.ok(await j.tap('[data-hs-tile="settings"]'), '⚙️ Round settings'); await sleep(1200);
    assert.ok(await j.tap('#round-sheet [data-rs="more"]'), 'More (the rest of Round settings)'); await sleep(700);
    assert.ok(await j.tap('#round-sheet [data-rs="gps"]'), '🛠 GPS tools (Round settings, "This phone")'); await sleep(1200);
    assert.ok(await j.evaluate(RECT('#gps-overlay [data-ts-cust]')), 'Tools shows Customize your screen');
    assert.ok(await j.tap('#gps-overlay [data-ts-cust]'), 'Customize your screen'); await sleep(700);
    return JSON.parse(await j.evaluate(ROWS));
}

test('ANDROID with the document camera plugin: Customize lists Scan scorecard; on -> the 📷 Scan button is on the round screen and opens the camera', { timeout: 240000 }, async () => {
    const j = await roundScreen(['App', 'HardPanDocScan']);
    assert.equal(await j.evaluate("Capacitor.getPlatform()"), 'android');
    const rows = await openCustomize(j);
    assert.ok(rows.some((r) => r[0] === 'ticker'), 'positive control: the panel lists the extras ' + JSON.stringify(rows));
    assert.deepEqual(rows.find((r) => r[0] === 'scan'), ['scan', false], 'Scan scorecard is offered, OFF until the golfer turns it on: ' + JSON.stringify(rows));
    // A Host extra with free scans left: its row shows the lock, and the explainer offers the free scans.
    assert.ok(await j.tap('[data-hpf-lock="scan"]'), '🔒 Host · 3 free'); await sleep(600);
    assert.ok(await j.tap('[data-hpf-try]', /Try a free scan/), 'Try a free scan'); await sleep(800);
    const after1 = JSON.parse(await j.evaluate(ROWS));
    if (after1.length) {   // back in the panel: the extra is on; Done closes it
        assert.deepEqual(after1.find((r) => r[0] === 'scan'), ['scan', true], JSON.stringify(after1));
        assert.ok(await j.tap('.hpf-done')); await sleep(1200);
    } else await sleep(800);
    const btn = await j.evaluate(RECT('#gps-overlay [data-hpf="scan"] [data-hs-mount="scan"]'));
    assert.ok(btn, 'the 📷 Scan button is drawn on the round screen');
    assert.ok(btn.l >= 0 && btn.r <= 393 && btn.t >= 0 && btn.b <= 852, 'inside the screen ' + JSON.stringify(btn));
    assert.match(await j.evaluate("document.querySelector('[data-hs-mount=\"scan\"]').innerText"), /Scan/);
    assert.ok(await j.tap('[data-hs-mount="scan"]'), 'tap Scan');
    await sleep(800);
    assert.ok(await j.tap('#hp-scan [data-hs=shoot]'), 'the scan sheet\'s Scan the card');
    const t0 = Date.now(); while (Date.now() - t0 < 8000 && !(await j.evaluate('window.__docscan'))) await sleep(200);
    assert.ok(await j.evaluate('window.__docscan') >= 1, 'the tap reached the document camera plugin (HardPanDocScan.scan)');
});

test('ANDROID without the plugin (before this job): no Scan scorecard row - the button cannot be turned on', { timeout: 240000 }, async () => {
    const j = await roundScreen(['App']);
    const rows = await openCustomize(j);
    assert.ok(rows.some((r) => r[0] === 'ticker'), 'positive control: the panel lists the extras ' + JSON.stringify(rows));
    assert.equal(rows.find((r) => r[0] === 'scan'), undefined, JSON.stringify(rows));
    assert.equal(await j.evaluate("document.querySelectorAll('[data-hs-mount=\"scan\"]').length"), 0);
});
