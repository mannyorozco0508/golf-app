// URGENT-047 A - RANGE MODE, IN REAL CHROME (393x852 and 375x667, the GPS map, a stand-in GPS).
// A made-up course (synthetic - no licensed data); the GPS screen's golfer is Ann.
//   1  Tools > Range: the Range sheet (the tile next to My bag)
//   2  Driver: Mark at the mat, walk 240 yds, Mark; again 251; type 236
//   3  7-iron: Mark / walk 150 / Mark; 155; type 148
//   4  GOOD / MISHIT (7:55 AM): the chip after each shot (Good by default); a typed Driver 180 ->
//      Mishit on the chip; a 7-iron 120 flipped by a TAP on its row, a Sand wedge 60 by a SWIPE;
//      mishits greyed in the list
//   4b the session lines: "Driver · 3 good / 1 mishit · 240 (median of good)" (with the 180 it
//      would be 238), "7-iron · 3 good / 1 mishit · 150 ...", "Sand wedge · 0 good / 1 mishit ·
//      no good shots yet"; longest of good only
//   5  Update my bag -> Open My bag: Driver 240, 7-iron 150 ("entered"); no Sand wedge written
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
            // 4. GOOD / MISHIT
            const chip = () => ev("(function(){ var q = " + R + ".querySelector('.gps-range-q'); if (!q) return ''; return Array.from(q.querySelectorAll('button')).map(function(b){ return b.textContent + '=' + b.getAttribute('aria-pressed'); }).join(','); })()");
            assert.equal(await chip(), 'Good=true,Mishit=false', 'the chip after a typed shot, Good by default');
            const shotRows = () => ev("JSON.stringify(Array.from(" + R + ".querySelectorAll('[data-range-shot]')).map(function(r){ return { i: +r.getAttribute('data-range-shot'), t: r.querySelector('.n').textContent + ' ' + r.querySelector('.y').textContent + ' ' + r.querySelector('.k').textContent, mis: r.classList.contains('mis'), op: getComputedStyle(r).color }; }))").then(JSON.parse);
            const misFlags = () => ev("JSON.stringify(HardPanRange.current('Ann Alpha').shots.map(function(s){ return s.mis === true; }))").then(JSON.parse);
            await typedShot('Dr', 180);
            assert.equal(await chip(), 'Good=true,Mishit=false');
            await shot('3a-chip-after-shot');
            assert.equal(await tapR('[data-range-q="mis"]'), true, 'one tap: Mishit');
            assert.equal(await chip(), 'Good=false,Mishit=true');
            assert.deepEqual(await misFlags(), [false, false, false, false, false, false, true]);
            // the chip after a GPS (Mark) shot as well
            lands.push(await gpsShot('7i', 20, 120));
            assert.equal(await chip(), 'Good=true,Mishit=false', 'the chip after a Mark shot, Good by default');
            // a TAP on the shot row flips it (the newest is first in the list)
            let list = await shotRows();
            assert.equal(list.length, 8);
            assert.match(list[0].t, /^7-iron 120 yds Good$/);
            assert.match(list[1].t, /^Driver 180 yds · typed Mishit$/);
            assert.equal(list[1].mis, true); assert.equal(list[0].mis, false);
            assert.notEqual(list[1].op, list[0].op, 'the mishit is greyed');
            assert.equal(await tapR('[data-range-shot="7"]'), true);
            assert.equal((await shotRows())[0].mis, true, 'tap: 7-iron 120 -> Mishit');
            assert.equal(await chip(), 'Good=false,Mishit=true', 'the chip follows');
            // a SWIPE flips too: Sand wedge 60 typed, swiped to Mishit; swiped twice more = back and forth
            await typedShot('SW', 60);
            const swipe = (i, dx) => ev("(function(){ var r = " + R + ".querySelector('[data-range-shot=\"" + i + "\"]'); var b = r.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;"
                + " var T = function (cx) { return new Touch({ identifier: 1, target: r, clientX: cx, clientY: y }); };"
                + " r.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [T(x)], changedTouches: [T(x)] }));"
                + " r.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [T(x + " + dx + " / 2)], changedTouches: [T(x + " + dx + " / 2)] }));"
                + " r.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [T(x + " + dx + ")] })); return 1; })()");
            await swipe(8, -80);
            assert.equal((await misFlags())[8], true, 'swipe left: Sand wedge 60 -> Mishit');
            await swipe(8, 80);
            assert.equal((await misFlags())[8], false, 'swipe right: back to Good');
            await swipe(8, 12);
            assert.equal((await misFlags())[8], false, 'a nudge is not a swipe');
            await swipe(8, -80);
            assert.deepEqual(await misFlags(), [false, false, false, false, false, false, true, true, true]);
            // 4b. the session lines
            const rows = JSON.parse(await ev("JSON.stringify(Array.from(" + R + ".querySelectorAll('[data-range-row]')).map(function(r){ return r.innerText.replace(/\\s*\\n\\s*/g, ' | '); }))"));
            assert.deepEqual(rows, ['Driver · 3 good / 1 mishit · 240 (median of good) | longest good 251',
                '7-iron · 3 good / 1 mishit · 150 (median of good) | longest good 155',
                'Sand wedge · 0 good / 1 mishit · no good shots yet']);
            assert.match(await ev(rangeText), /THIS SESSION · 9 shots/);
            list = await shotRows();
            assert.deepEqual(list.filter((x) => x.mis).map((x) => x.t), ['Sand wedge 60 yds · typed Mishit', '7-iron 120 yds Mishit', 'Driver 180 yds · typed Mishit']);
            const fit = JSON.parse(await ev("(function(){ var r = " + R + ".getBoundingClientRect(); return JSON.stringify({ top: r.top, bottom: r.bottom, right: r.right, h: innerHeight, w: innerWidth, sw: document.documentElement.scrollWidth }); })()"));
            assert.ok(fit.top >= 0 && fit.bottom <= fit.h + 1 && fit.right <= fit.w + 1, 'the sheet is on screen ' + JSON.stringify(fit));
            assert.ok(fit.sw <= fit.w, 'no sideways scroll');
            await ev("(function(){ var r = " + R + ".querySelector('[data-range-row]'); r.scrollIntoView({ block: 'start' }); return 1; })()");
            await shot('3-range-session');
            await ev("(function(){ var r = " + R + ".querySelector('.gps-range-shot.mis'); r.scrollIntoView({ block: 'center' }); return 1; })()");
            await shot('3b-mishit-greyed');
            // 5. Update my bag, then My bag
            await tapR('.gps-range-bag');
            assert.ok(await until(rangeText + ".indexOf('My bag updated') > -1", 4000), 'updated');
            await shot('4-range-bag-updated');
            await tapR('.gps-range-openbag');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bag'); return !!b && b.style.display !== 'none' && b.getAttribute('data-bag-view') === 'list'; })()", 6000), 'My bag open (list)');
            assert.equal(await ev("HardPanRange.isOpen()"), false, 'Range closed');
            const bag = JSON.parse(await ev("(function(){ var o = {}; ['Dr','7i'].forEach(function(c){ var r = document.querySelector('#gps-overlay [data-bag-row=\"' + c + '\"]'); o[c] = { v: r.querySelector('[data-bag-edit]').value, src: r.querySelector('[data-bag-src]').getAttribute('data-bag-src') }; }); return JSON.stringify(o); })()"));
            assert.deepEqual(bag, { Dr: { v: '240', src: 'entered' }, '7i': { v: '150', src: 'entered' } });
            assert.deepEqual(JSON.parse(await ev("localStorage.getItem('hardpan_bag_v1')")).golfers['n:ann alpha'].set, { Dr: 240, '7i': 150 }, 'the median of GOOD shots; no Sand wedge (0 good)');
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

// ============================================================================
// URGENT-047 (added 7:20 AM) - RANGE FROM HOME, WITH NO ROUND (home.html, a stand-in GPS).
//   7  Home's bottom row: Join with a code · Trip · History · My stats · Range - on screen, no
//      sideways scroll, no link broken over two lines
//   8  Home › Range: the same Range sheet; the golfer is the phone's own (393: who this phone was on its
//      newest round - Ann Alpha, whose My bag already holds a 9-iron; 375: no name yet - "Your name"
//      asked ONCE, and with NO GPS at all the typed carries still work)
//   9  Mark the ball / Mark where it landed (HardPanMark.readFix) and typed carries; Update my bag
//      writes My bag's own set map into the same bag record (hardpan_bag_v1)
//  10  THE GUARD: no round created, no events/<code>, no database write at all; no coordinate stored;
//      Done stops the location watch
// ============================================================================
const SNAP = { at: Date.now() - 2 * 86400000, data: { courseName: 'Range Test Golf Club', players: [{ id: 101, name: 'Ann Alpha' }, { id: 102, name: 'Ben Bravo' }] }, meta: { group: null } };
const BAG0 = { v: 1, golfers: { 'n:ann alpha': { shots: {}, set: { '9i': 140 } } } };
const NOGEO = "(function(){ window.__liveCount = function(){ return 0; }; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok, no) { setTimeout(function(){ no({ code: 1, message: 'denied' }); }, 50); return 7; }, getCurrentPosition: function (ok, no) { no({ code: 1, message: 'denied' }); }, clearWatch: function () {} } }); } catch (e) {} })();";
for (const c of [{ vp: { width: 393, height: 852 }, who: 'Ann Alpha', seeded: true, gps: true }, { vp: { width: 375, height: 667 }, who: 'Cal', seeded: false, gps: false }]) {
    const vp = c.vp;
    test('Home › Range with no round at ' + vp.width + 'x' + vp.height + (c.gps ? '' : ' (no GPS, a new name)'), { timeout: 240000 }, async () => {
        const GEO2 = c.gps ? GEO.replace("window.__moveTo", "window.__liveCount = function () { return Object.keys(live).length; }; window.__moveTo") : NOGEO;
        const SEED = !c.seeded ? '' : "try{if(!sessionStorage.getItem('rhseed')){sessionStorage.setItem('rhseed','1');localStorage.setItem('golfapp_snap_v1_RHOME1'," + JSON.stringify(JSON.stringify(SNAP)) + ");localStorage.setItem('golfapp_me_RHOME1','101');localStorage.setItem('hardpan_bag_v1'," + JSON.stringify(JSON.stringify(BAG0)) + ");}}catch(e){}";
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO2 + SEED;
        const j = await openJourney({ db: { events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) {} await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'home-chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const R = "document.querySelector('#hp-range .gps-range-sheet')";
        const rangeText = "(function(){ var b = document.getElementById('hp-range'), s = " + R + "; return b && b.style.display !== 'none' && s && s.style.display !== 'none' ? s.innerText : ''; })()";
        const tapR = (sel) => ev("(function(){ var b = " + R + ".querySelector(" + JSON.stringify(sel) + "); if (!b) return false; b.click(); return true; })()");
        const shotsNow = () => ev("(function(){ var c = HardPanRange.current(" + JSON.stringify(c.who) + "); return c ? c.shots.length : 0; })()");
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
            assert.ok(await until("(function(){ var c = HardPanRange.current(" + JSON.stringify(c.who) + "); return !!c && c.shots.length === " + (n0 + 1) + "; })()", 7000), 'the shot saved: ' + await ev(rangeText));
            return land;
        };
        const typedShot = async (club, yds) => {
            const n0 = await shotsNow();
            await tapR('[data-range-club="' + club + '"]');
            await ev("(function(){ var i = " + R + ".querySelector('.gps-range-typed'); i.value = '" + yds + "'; return 1; })()");
            await tapR('.gps-range-add');
            assert.ok(await until("(function(){ var c = HardPanRange.current(" + JSON.stringify(c.who) + "); return !!c && c.shots.length === " + (n0 + 1) + "; })()", 4000), 'typed shot saved');
        };
        try {
            await j.goto(fileUrl('home.html'), 2500);
            assert.ok(await until("(function(){ var v = document.getElementById('v-simple'); return !!v && getComputedStyle(v).display !== 'none'; })()", 15000), 'Home');
            await sleep(800);
            const keys0 = JSON.parse(await ev("JSON.stringify(Object.keys(localStorage).sort())"));
            // 7. the row
            const row = JSON.parse(await ev("(function(){ var r = document.querySelector('#v-simple .hs-slim'), rr = r.getBoundingClientRect(); var bs = Array.from(r.querySelectorAll('button')).filter(function(b){ return b.offsetParent !== null; }).map(function(b){ var x = b.getBoundingClientRect(); return { t: b.textContent, l: x.left, r: x.right, top: Math.round(x.top), h: x.height, lh: parseFloat(getComputedStyle(b).lineHeight) || 20 }; }); var dots = Array.from(r.querySelectorAll('.hs-dot')).filter(function(d){ return d.offsetParent !== null; }).map(function(d){ var x = d.getBoundingClientRect(); return { top: Math.round(x.top), on: !d.classList.contains('hs-dot-off') && getComputedStyle(d).color !== 'rgba(0, 0, 0, 0)' }; }); return JSON.stringify({ bs: bs, dots: dots, text: r.textContent.replace(/\\s+/g, ' ').trim(), w: innerWidth, sw: document.documentElement.scrollWidth, rl: rr.left, rr: rr.right }); })()"));
            assert.deepEqual(row.bs.map((b) => b.t), ['Join with a code', 'Trip', 'History', 'My stats', 'Range'], 'the row: ' + row.text);
            assert.equal(row.text, 'Join with a code · Trip · History · My stats · Range');
            assert.ok(row.sw <= row.w, 'no sideways scroll ' + JSON.stringify(row));
            row.bs.forEach((b) => { assert.ok(b.l >= 0 && b.r <= row.w + 0.5, b.t + ' on screen'); assert.ok(b.h <= 48, b.t + ' is one line (' + b.h + ')'); });
            const lines = Array.from(new Set(row.bs.map((b) => b.top)));
            assert.ok(lines.length <= 2, 'at most two lines: ' + JSON.stringify(row.bs));
            // wraps nicely: a dot shows only BETWEEN two links on the same line (none dangling at a break)
            assert.equal(row.dots.length, 4);
            row.dots.forEach((d, i) => { const same = row.bs[i].top === row.bs[i + 1].top; assert.equal(d.on, same, 'dot ' + i + ' ' + JSON.stringify(row)); });
            if (lines.length === 2) assert.ok(row.bs.filter((b) => b.top === lines[1]).length >= 2, 'not one link alone on the second line: ' + JSON.stringify(row.bs));
            await ev("document.querySelector('[data-hp-act=\"srange\"]').scrollIntoView({ block: 'center' })");
            await shot('0-home-row');
            // 8. Home › Range
            assert.ok(await j.tap('[data-hp-act="srange"]'), 'the Range link');
            if (!c.seeded) {
                assert.ok(await until("(function(){ var a = document.querySelector('#hp-range .hp-range-ask'); return !!a && a.offsetParent !== null; })()", 10000), '"Your name" asked');
                assert.match(await ev("document.querySelector('#hp-range .hp-range-ask').innerText"), /Your name/);
                await shot('1-your-name');
                await ev("(function(){ var i = document.querySelector('#hp-range .hp-range-name'); i.value = '  Cal  '; return 1; })()");
                await ev("document.querySelector('#hp-range .hp-range-ask .ok').click()");
            }
            assert.ok(await until("!!window.HardPanRange && HardPanRange.isOpen() && !!window.HardPanGpsBag && !!window.HardPanMark", 12000), 'the Range sheet, with My bag\'s store and the Mark reading loaded');
            assert.match(await ev(rangeText), new RegExp('Range · ' + c.who.split(' ')[0]));
            assert.match(await ev(rangeText), /No shots yet/);
            assert.equal(await ev("!!document.getElementById('gps-overlay')"), false, 'no GPS screen on Home');
            if (c.gps) assert.ok(await until("window.__liveCount() === 1", 4000), 'the location watched while Range is open');
            const fit0 = JSON.parse(await ev("(function(){ var r = " + R + ".getBoundingClientRect(); return JSON.stringify({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: innerHeight, w: innerWidth, sw: document.documentElement.scrollWidth }); })()"));
            assert.ok(fit0.top >= 0 && fit0.bottom <= fit0.h + 1 && fit0.left >= 0 && fit0.right <= fit0.w + 1, 'the sheet fills the screen ' + JSON.stringify(fit0));
            await shot('2-range-open');
            // 9. shots
            const lands = [];
            if (c.gps) {
                lands.push(await gpsShot('Dr', 5, 240));
                assert.equal(await ev("HardPanMark.context() && HardPanMark.context().rangeHome === true"), true, 'Mark went through HardPanMark (Home context)');
                await tapR('[data-range-club="7i"]');
                await ev('__moveTo(' + MAT[0] + ',' + MAT[1] + ')'); await sleep(1100);
                await tapR('.gps-range-mark');
                assert.ok(await until("HardPanRange.state().marking && !HardPanRange.state().busy", 7000));
                await shot('3-range-marking');
                const l2 = G.destination(MAT, 0, 150 * YDM); lands.push(l2);
                await ev('__moveTo(' + l2[0] + ',' + l2[1] + ')'); await sleep(1100);
                await tapR('.gps-range-mark');
                assert.ok(await until("HardPanRange.current('Ann Alpha').shots.length === 2", 7000));
            } else {
                // No GPS at all: Mark says so; typing still works.
                await tapR('[data-range-club="Dr"]');
                await tapR('.gps-range-mark');
                assert.ok(await until(rangeText + ".indexOf('No GPS position yet') > -1", 9000), 'no GPS: ' + await ev(rangeText));
                await shot('3-range-no-gps');
                await typedShot('Dr', 240);
                await typedShot('7i', 150);
            }
            await typedShot('Dr', 250);
            await typedShot('7i', 160);
            // a topped Driver, marked Mishit on the chip: left out of the median and the bag
            await typedShot('Dr', 90);
            await ev("(function(){ " + R + ".querySelector('[data-range-q=\"mis\"]').click(); return 1; })()");
            const rows = JSON.parse(await ev("JSON.stringify(Array.from(" + R + ".querySelectorAll('[data-range-row]')).map(function(r){ return r.querySelector('.t').textContent; }))"));
            assert.deepEqual(rows, ['Driver · 2 good / 1 mishit · 245 (median of good)', '7-iron · 2 good / 0 mishits · 155 (median of good)']);
            assert.equal(await ev(R + ".querySelectorAll('.gps-range-shot.mis').length"), 1, 'the mishit greyed in the list');
            await ev(R + ".scrollTop = 99999");
            await shot('4-range-session');
            await tapR('.gps-range-bag');
            assert.ok(await until(rangeText + ".indexOf('My bag updated') > -1", 4000), 'updated');
            assert.equal(await ev("!!" + R + ".querySelector('.gps-range-openbag')"), false, 'no "Open My bag" on Home (My bag is on the GPS screen)');
            await shot('5-range-bag-updated');
            const key = 'n:' + c.who.toLowerCase();
            const bag = JSON.parse(await ev("localStorage.getItem('hardpan_bag_v1')"));
            assert.deepEqual(bag.golfers[key].set, Object.assign(c.seeded ? { '9i': 140 } : {}, { Dr: 245, '7i': 155 }), 'My bag\'s own set map, the same record');
            const shown = JSON.parse(await ev("(function(){ var B = HardPanGpsBag, b = B.bag(" + JSON.stringify(c.who) + "); return JSON.stringify({ Dr: [b.Dr.yd, B.source(b.Dr)], i7: [b['7i'].yd, B.source(b['7i'])] }); })()"));
            assert.deepEqual(shown, { Dr: [245, 'entered'], i7: [155, 'entered'] }, 'My bag shows them as entered');
            // Done: Home again, the watch stopped
            await tapR('.gps-range-x');
            assert.ok(await until("document.getElementById('hp-range').style.display === 'none'", 3000), 'Done closes Range');
            if (c.gps) assert.equal(await ev('window.__liveCount()'), 0, 'the location watch stopped');
            assert.equal(await ev("HardPanMark.context()"), null, 'HardPanMark let go');
            // Asked ONCE: open again - straight to the sheet.
            await j.tap('[data-hp-act="srange"]');
            assert.ok(await until("HardPanRange.isOpen()", 8000), 'Range again');
            assert.equal(await ev("document.querySelectorAll('#hp-range .hp-range-ask').length"), 0, 'no second "Your name"');
            assert.match(await ev(rangeText), new RegExp('Range · ' + c.who.split(' ')[0]));
            await tapR('.gps-range-x');
            // 10. THE GUARD
            const writes = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])'));
            assert.deepEqual(writes, [], 'no database write at all');
            assert.deepEqual(JSON.parse(await ev("JSON.stringify(Object.keys((window.__DB || {}).events || {}))")), [], 'no events/<code>');
            const keys1 = JSON.parse(await ev("JSON.stringify(Object.keys(localStorage).sort())"));
            const added = keys1.filter((k) => keys0.indexOf(k) === -1);
            assert.ok(!added.some((k) => /^(golfapp_snap_v1_|golfapp_me_|hardpan_gps_golfer_|lastRoomCode|hardpan_last_round)/.test(k)), 'no round on this phone: ' + added.join(', '));
            const ls = await ev("(function(){ var o = {}; Object.keys(localStorage).forEach(function(k){ o[k] = localStorage.getItem(k); }); return JSON.stringify(o); })()");
            for (const x of [MAT].concat(lands).flat()) assert.ok(ls.indexOf(x.toFixed(3)) === -1, 'no coordinate ' + x + ' stored');
            assert.doesNotMatch(await ev("localStorage.getItem('hardpan_range_v1') + localStorage.getItem('hardpan_bag_v1')"), /"(lat|lng|latitude|longitude|pt|coords|pos|start)"/);
        } finally { await j.close(); }
    });
}
