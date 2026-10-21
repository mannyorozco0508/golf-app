// URGENT-049 part 1 - THE CLUB CHIPS AFTER MARK SHOT, IN REAL CHROME (393x852 and 375x667).
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

const CODE = 'CHP049', KEY = 'chips049_test', ID = '990000000000000049';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Chips Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Chips Test Golf Club', eventName: 'Test 049 chips', groupSizeOverrides: { 0: 2 } } });
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
const SHOTS = process.env.SHOTS_049 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yd = (a, b) => G.haversineMeters(a, b) / G.M_PER_YD;

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('club chips after Mark shot at ' + vp.width + 'x' + vp.height, { timeout: 180000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}" + SEED;
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Chips Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const bar = () => ev("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); if (!b || b.style.display === 'none') return null; var r = b.getBoundingClientRect(), on = b.querySelector('.gps-bagask-row button.on'), onr = on ? on.getBoundingClientRect() : null; return JSON.stringify({ head: b.querySelector('.gps-bagask-head').textContent, sub: b.querySelector('.gps-bagask-sub').textContent, on: on ? on.getAttribute('data-bag-club') : null, onVisible: onr ? onr.left >= r.left - 1 && onr.right <= r.right + 1 : null, top: r.top, bottom: r.bottom, h: innerHeight, sw: document.documentElement.scrollWidth, w: innerWidth, n: b.querySelectorAll('[data-bag-club]').length }); })()").then((s) => (s ? JSON.parse(s) : null));
        const logList = () => ev("JSON.stringify(window.HardPanShotLog ? HardPanShotLog.list({ golfer: 'Ann Alpha' }) : null)").then(JSON.parse);
        const mark = () => ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
        const moveTo = async (p) => { await ev('__moveTo(' + p[0] + ',' + p[1] + ')'); await sleep(1500); };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-mark-shot'); return !!b && b.offsetParent !== null; })()", 10000), 'Mark shot');
            await sleep(1500);
            // 1 - the tee: the row, Driver pre-selected (383 yds is past every club).
            await mark();
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !!b && b.style.display !== 'none' && b.querySelectorAll('[data-bag-club]').length > 0; })()", 8000), 'the chip row');
            let b1 = await bar();
            assert.match(b1.head, /^Hitting Driver\? · \d+ to the green$/);
            assert.equal(b1.on, 'Dr');
            assert.match(b1.sub, /Picked from My bag \(Driver 250/);
            assert.equal(b1.n, 14);
            assert.ok(b1.bottom <= b1.h && b1.top > b1.h * 0.45, 'in the bottom area, on screen');
            assert.ok(b1.sw <= b1.w, 'no sideways scroll');
            assert.equal(b1.onVisible, true, 'the picked chip is scrolled into view');
            await shot('1-tee-chips');
            assert.equal((await logList()).length, 0, 'nothing counted yet');
            // 2 - the ball: the drive closes; the next row pre-selects for what is left.
            await moveTo(BALL1);
            await mark();
            assert.ok(await until("window.HardPanShotLog && HardPanShotLog.list({ golfer: 'Ann Alpha' }).length === 1", 8000), 'the drive counted');
            let l = await logList();
            assert.equal(l[0].club, 'Dr');
            assert.ok(Math.abs(l[0].carry - yd(TEE, BALL1)) <= 1, 'carry = tee mark -> this mark (' + l[0].carry + ')');
            assert.equal(l[0].windMph, 10); assert.equal(l[0].windFromDeg, 47); assert.equal(l[0].tempF, 81); assert.equal(l[0].src, 'weatherkit');
            assert.ok(Math.abs(l[0].bearingDeg - G.bearingDeg(TEE, MID)) < 0.2, 'bearing to the green center');
            assert.ok(/^\d{4}-\d\d-\d\dT\d\d:00:00\.000Z$/.test(l[0].wxHour), 'hourly timestamp');
            assert.equal(l[0].hole, 1); assert.equal(l[0].course, 'Chips Test Golf Club');
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !!b && b.style.display !== 'none' && /to the green/.test(b.textContent); })()", 6000));
            const b2 = await bar();
            assert.ok(b2.on && b2.on !== 'Dr', 'an iron / wood for the approach: ' + b2.on);
            await shot('2-approach-chips');
            await ev("document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]').click()");
            assert.equal(await bar(), null, 'one tap: the row goes');
            await shot('3-picked-7i');
            // 3 - the next ball: the 7-iron closes.
            await moveTo(BALL2);
            await mark();
            assert.ok(await until("HardPanShotLog.list({ golfer: 'Ann Alpha' }).length === 2", 8000), 'the 7-iron counted');
            l = await logList();
            assert.equal(l[0].club, '7i');
            assert.ok(Math.abs(l[0].carry - yd(BALL1, BALL2)) <= 1, '7i carry = mark -> mark');
            assert.ok(Math.abs(l[0].bearingDeg - G.bearingDeg(BALL1, MID)) < 0.2, 'bearing recomputed from this ball');
            await shot('4-next-mark');
            // 4 - Skip, walk onto the green: closed, never counted.
            assert.ok(await until("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !!b && b.style.display !== 'none'; })()", 6000));
            await ev("document.querySelector('#gps-overlay .gps-bagask-skip').click()");
            await moveTo(MID);
            await sleep(1500);
            assert.equal((await logList()).length, 2, 'Skip is never a data point');
            assert.equal(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-bagask'); return !b || b.style.display === 'none'; })()"), true);
            // 5 - no coordinate anywhere: the log on the phone, the database writes.
            const stored = await ev("localStorage.getItem('hardpan_shotlog_v1') || ''");
            const writes = await ev("JSON.stringify(window.__WRITES || [])");
            for (const c of [TEE, MID, BALL1, BALL2].flat()) {
                assert.ok(stored.indexOf(String(c).slice(0, 7)) === -1, 'no coordinate in the log: ' + c);
                assert.ok(writes.indexOf(String(c).slice(0, 7)) === -1, 'no coordinate written: ' + c);
            }
            assert.doesNotMatch(stored, /"(lat|lng|latitude|longitude|p|pt|coords)"/);
            assert.doesNotMatch(writes, /shotlog|bagask|"carry"/, 'nothing about shots goes to the database');
            // Swipe-to-delete hook: removing a shot by id.
            assert.equal(await ev("HardPanMarkChips.remove(HardPanShotLog.list({ golfer: 'Ann Alpha' })[0].id)"), true);
            assert.equal((await logList()).length, 1);
        } finally { await j.close(); }
    });
}
