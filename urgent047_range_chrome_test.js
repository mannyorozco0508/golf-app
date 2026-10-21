// URGENT-047 A - RANGE MODE, IN REAL CHROME (393x852 and 375x667, the GPS map, a stand-in GPS).
// A made-up course (synthetic - no licensed data); the GPS screen's golfer is Ann.
//   1  Tools > Range: the Range sheet (the tile next to My bag)
//   2  Driver: Mark at the mat, walk 240 yds, Mark; again 251; type 236
//   3  7-iron: Mark / walk 150 / Mark; 155; type 148
//   4  the session: Driver avg 242, longest 251; 7-iron avg 151, longest 155
//   5  Update my bag -> Open My bag: Driver 242, 7-iron 151 ("entered")
//   6  THE GUARD: the phone's storage and every database write - no coordinate, no lat / lng
// Screenshots into SHOTS_047 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-range.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'RNG047', KEY = 'rnggps_test', ID = '990000000000000047';
const YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400);
const MAT = G.destination(TEE, 270, 300);   // the range, off to the side
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Range Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Range Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + MAT[0] + ", lng: " + MAT[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SHOTS = process.env.SHOTS_047 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Range at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Range Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const R = "document.querySelector('#gps-overlay .gps-range-sheet')";
        const rangeText = "(function(){ var s = " + R + "; return s && s.style.display !== 'none' ? s.innerText : ''; })()";
        const tapR = (sel) => ev("(function(){ var b = " + R + ".querySelector(" + JSON.stringify(sel) + "); if (!b) return false; b.click(); return true; })()");
        const shotsNow = () => ev("(function(){ var c = HardPanRange.current('Ann Alpha'); return c ? c.shots.length : 0; })()");
        const gpsShot = async (club, bearing, yds) => {
            const n0 = await shotsNow();
            assert.equal(await tapR('[data-range-club="' + club + '"]'), true, club + ' chip');
            await ev('__moveTo(' + MAT[0] + ',' + MAT[1] + ')'); await sleep(1100);
            await tapR('.gps-range-mark');
            assert.ok(await until("HardPanRange.state().marking && !HardPanRange.state().busy", 7000), 'first Mark taken: ' + await ev(rangeText));
            assert.match(await ev(rangeText), /Mark where it landed/);
            const land = G.destination(MAT, bearing, yds * YDM);
            await ev('__moveTo(' + land[0] + ',' + land[1] + ')'); await sleep(1100);
            await tapR('.gps-range-mark');
            assert.ok(await until("(function(){ var c = HardPanRange.current('Ann Alpha'); return !!c && c.shots.length === " + (n0 + 1) + "; })()", 7000), 'the shot saved: ' + await ev(rangeText));
            return land;
        };
        const typedShot = async (club, yds) => {
            const n0 = await shotsNow();
            await tapR('[data-range-club="' + club + '"]');
            await ev("(function(){ var i = " + R + ".querySelector('.gps-range-typed'); i.value = '" + yds + "'; return 1; })()");
            await tapR('.gps-range-add');
            assert.ok(await until("(function(){ var c = HardPanRange.current('Ann Alpha'); return !!c && c.shots.length === " + (n0 + 1) + "; })()", 4000), 'typed shot saved');
        };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(1500);
            const writes0 = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).length;
            // 1. Tools > Range
            await ev("document.querySelector('#gps-overlay .gps-tools').click()");
            assert.ok(await until("(function(){ var t = document.querySelector('#gps-overlay .gps-tsheet'); var b = t && t.querySelector('[data-ts-tile=\".gps-range\"]'); return !!b && t.style.display !== 'none' && b.style.display !== 'none'; })()", 6000), 'the Range tile in Tools');
            const tiles = JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#gps-overlay .gps-tsheet [data-ts-tile]')).filter(function(b){return b.style.display !== 'none';}).map(function(b){return b.innerText.replace(/\\s+/g,' ').trim();}))"));
            assert.ok(tiles.some((t) => /My bag/.test(t)) && tiles.some((t) => /Range/.test(t)), 'My bag and Range tiles: ' + tiles.join(' | '));
            await ev("document.querySelector('#gps-overlay .gps-tsheet [data-ts-tile=\".gps-range\"]').scrollIntoView({ block: 'center' })");
            await shot('0-tools-range-tile');
            await ev("document.querySelector('#gps-overlay .gps-tsheet [data-ts-tile=\".gps-range\"]').click()");
            assert.ok(await until("!!window.HardPanRange && HardPanRange.isOpen()", 8000), 'the Range sheet');
            assert.match(await ev(rangeText), /Range · Ann/);
            assert.match(await ev(rangeText), /No shots yet/);
            await shot('1-range-open');
            // Mark with no club: asks for one.
            await tapR('.gps-range-mark');
            assert.match(await ev(rangeText), /Pick a club first/);
            // 2. Driver
            const lands = [];
            lands.push(await gpsShot('Dr', 5, 240));
            // the screen between the two Marks
            await tapR('[data-range-club="Dr"]');
            await ev('__moveTo(' + MAT[0] + ',' + MAT[1] + ')'); await sleep(1100);
            await tapR('.gps-range-mark');
            assert.ok(await until("HardPanRange.state().marking && !HardPanRange.state().busy", 7000));
            await shot('2-range-marking');
            const l2 = G.destination(MAT, 355, 251 * YDM); lands.push(l2);
            await ev('__moveTo(' + l2[0] + ',' + l2[1] + ')'); await sleep(1100);
            await tapR('.gps-range-mark');
            assert.ok(await until("HardPanRange.current('Ann Alpha').shots.length === 2", 7000));
            await typedShot('Dr', 236);
            // 3. 7-iron
            lands.push(await gpsShot('7i', 0, 150));
            lands.push(await gpsShot('7i', 10, 155));
            await typedShot('7i', 148);
            // 4. the session
            const rows = JSON.parse(await ev("JSON.stringify(Array.from(" + R + ".querySelectorAll('[data-range-row]')).map(function(r){ return Array.from(r.children).map(function(c){ return c.textContent; }); }))"));
            assert.deepEqual(rows, [['Driver', '3', '242', '251'], ['7-iron', '3', '151', '155']]);
            assert.match(await ev(rangeText), /THIS SESSION · 6 shots/);
            const fit = JSON.parse(await ev("(function(){ var r = " + R + ".getBoundingClientRect(); return JSON.stringify({ top: r.top, bottom: r.bottom, right: r.right, h: innerHeight, w: innerWidth, sw: document.documentElement.scrollWidth }); })()"));
            assert.ok(fit.top >= 0 && fit.bottom <= fit.h + 1 && fit.right <= fit.w + 1, 'the sheet is on screen ' + JSON.stringify(fit));
            assert.ok(fit.sw <= fit.w, 'no sideways scroll');
            await ev(R + ".scrollTop = 99999");
            await shot('3-range-session');
            // 5. Update my bag, then My bag
            await tapR('.gps-range-bag');
            assert.ok(await until(rangeText + ".indexOf('My bag updated') > -1", 4000), 'updated');
            await shot('4-range-bag-updated');
            await tapR('.gps-range-openbag');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bag'); return !!b && b.style.display !== 'none' && b.getAttribute('data-bag-view') === 'list'; })()", 6000), 'My bag open (list)');
            assert.equal(await ev("HardPanRange.isOpen()"), false, 'Range closed');
            const bag = JSON.parse(await ev("(function(){ var o = {}; ['Dr','7i'].forEach(function(c){ var r = document.querySelector('#gps-overlay [data-bag-row=\"' + c + '\"]'); o[c] = { v: r.querySelector('[data-bag-edit]').value, src: r.querySelector('[data-bag-src]').getAttribute('data-bag-src') }; }); return JSON.stringify(o); })()"));
            assert.deepEqual(bag, { Dr: { v: '242', src: 'entered' }, '7i': { v: '151', src: 'entered' } });
            await ev("(function(){ var r = document.querySelector('#gps-overlay [data-bag-row=\"Dr\"]'); if (r) r.scrollIntoView({ block: 'center' }); return 1; })()");
            await shot('5-my-bag-after-update');
            // 6. THE GUARD
            const ls = await ev("(function(){ var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^hardpan_(range|bag)_v1$/.test(k)) o[k] = localStorage.getItem(k); } return JSON.stringify(o); })()");
            assert.ok(/hardpan_range_v1/.test(ls) && /hardpan_bag_v1/.test(ls), 'positive: both written');
            const writes = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).slice(writes0);
            const dbNow = await ev("JSON.stringify(window.__DB || {})");
            const all = ls + JSON.stringify(writes) + dbNow;
            for (const c of [MAT].concat(lands).flat()) assert.ok(all.indexOf(c.toFixed(3)) === -1, 'no coordinate ' + c + ' stored or written');
            assert.doesNotMatch(ls + JSON.stringify(writes), /\\?"(lat|lng|latitude|longitude|pt|coords|pos|start)\\?"/);
            assert.doesNotMatch(JSON.stringify(writes), /range|hardpan_bag/i, 'no database write from Range');
        } finally { await j.close(); }
    });
}
