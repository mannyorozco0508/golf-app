// URGENT-045 #2 - KP BY GPS, IN REAL CHROME (393x852 and 375x667, the GPS map, a stand-in GPS).
// A made-up course (synthetic - no licensed data): hole 1 a par 3, a Weekly Game with $20 KP on it.
//   1  on the tee of the KP hole: "⛳ Mark my KP" in the bottom row beside Mark shot - nothing else new
//   2  at the ball (3 m short of the cup): tap -> "⛳ Cup is here"; at the cup: tap -> the sheet,
//      "9 ft 10 in from the pin", KP: Ann; the round's kpLeaders / kpWinners as typed
//   3  every write of the whole flow: no latitude, no longitude
//   4  a non-KP hole: no button
// Screenshots into SHOTS_045 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'KPG045', KEY = 'kpgps_test', ID = '990000000000000045';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 150);
const BALL = G.destination(MID, 180, 3);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'KP Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 3 } : (x.par === 3 ? { par: 4 } : {})));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'KP Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.moneyPool = { enabled: true, buyIn: 20, kp: { amount: 20, holes: [1] }, net: null, skins: { mode: 'remainder', scoring: 'net', carryOver: true } };
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SHOTS = process.env.SHOTS_045 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('KP by GPS at ' + vp.width + 'x' + vp.height, { timeout: 180000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'KP Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1500); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-markd') && document.querySelector('#gps-overlay .gps-markd').style.display !== 'none'", 10000), 'the Mark button on the KP hole');
            const s1 = JSON.parse(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-markd-btn'), ms = document.querySelector('#gps-overlay .gps-mark-shot'), rb = b.getBoundingClientRect(), rm = ms ? ms.getBoundingClientRect() : null; return JSON.stringify({ text: b.textContent, row: rm ? Math.abs(rb.top - rm.top) < 4 : null, inBottom: !!b.closest('.gps-ld-bottom'), w: innerWidth, sw: document.documentElement.scrollWidth, btnTop: rb.top, btnBottom: rb.bottom, h: innerHeight }); })()"));
            assert.equal(s1.text, '⛳ Mark my KP');
            assert.equal(s1.inBottom, true, 'in the bottom row (layout D)');
            if (s1.row !== null) assert.equal(s1.row, true, 'beside Mark shot, one row');
            assert.ok(s1.btnBottom <= s1.h, 'on screen');
            assert.ok(s1.sw <= s1.w, 'no sideways scroll');
            await shot('1-kp-hole-button');
            // At the ball.
            await ev('__moveTo(' + BALL[0] + ',' + BALL[1] + ')');
            await sleep(1500);
            await ev("document.querySelector('#gps-overlay .gps-markd-btn').click()");
            assert.ok(await until("document.querySelector('#gps-overlay .gps-markd-btn').textContent === '⛳ Cup is here'", 8000), 'asks for the cup');
            await shot('2-cup-is-here');
            await ev('__moveTo(' + MID[0] + ',' + MID[1] + ')');
            await sleep(1500);
            await ev("document.querySelector('#gps-overlay .gps-markd-btn').click()");
            assert.ok(await until("(function(){ var s = document.querySelector('#gps-overlay .gps-markd-sheet'); return !!s && s.style.display !== 'none' && /from the pin/.test(s.textContent); })()", 8000), 'the result sheet');
            const txt = await ev("document.querySelector('#gps-overlay .gps-markd-sheet').innerText");
            assert.match(txt, /Ann Alpha: 9 ft 10 in from the pin \(3 yds\)/);
            assert.match(txt, /KP: Ann Alpha · 9 ft 10 in/);
            assert.match(txt, /Distances only - no position leaves this phone\./);
            const sheetFits = await ev("(function(){ var r = document.querySelector('#gps-overlay .gps-markd-sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })()");
            assert.equal(sheetFits, true, 'the sheet is on screen');
            await shot('3-kp-result');
            const db = JSON.parse(await ev("JSON.stringify({ ev: window.__DB.events['" + CODE + "'], writes: window.__WRITES || [] })"));
            assert.equal(db.ev.kpWinners.h1, String(pid));
            assert.equal(db.ev.kpLeaders.h1.distanceInches, 118);
            assert.equal(db.ev.kpGroupAnswers.h1.g1.answer, String(pid));
            const m = db.ev.kpGps.h1.marks[String(pid)];
            assert.equal(m.inches, 118); assert.equal(m.yd, 3);
            // THE GUARD, in the page: nothing written holds a coordinate.
            const all = JSON.stringify(db.writes) + JSON.stringify(db.ev.kpGps) + JSON.stringify(db.ev.kpLeaders) + JSON.stringify(db.ev.kpGpsLog || {});
            for (const c of [TEE, MID, BALL].flat()) assert.ok(all.indexOf(String(c).slice(0, 6)) === -1, 'no coordinate ' + c + ' in the writes');
            assert.doesNotMatch(all, /"(lat|lng|latitude|longitude|pt|coords)"/);
            // A non-KP hole: no button.
            await ev("document.querySelector('#gps-overlay .gps-markd-sheet [data-mark=close]').click()");
            await ev('HardPanGps.setHole(2, 4)');
            await sleep(1200);
            assert.equal(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-markd'); return !b || b.style.display === 'none'; })()"), true, 'no button on hole 2');
            await shot('4-non-kp-hole');
        } finally { await j.close(); }
    });
}
