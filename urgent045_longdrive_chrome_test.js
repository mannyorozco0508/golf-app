// URGENT-045 #2b - LONG DRIVE, IN REAL CHROME (393x852 and 375x667, the GPS map, a stand-in GPS).
// A made-up course (synthetic - no licensed data): hole 1 a par 4 with a saved line
// (course_gps/<key>/lines/h1); 2 golfers, a Weekly Game with no KP yet.
//   1  + Bet > More > Long Drive: the Weekly Game sheet, hole 1, $20 KP money, Save ->
//      moneyPool.longDrive = { holes: [1], allowRough: false } and kp.holes = [1]
//   2  the GPS map on hole 1: "🏌️ Mark my drive" in the bottom row (layout D)
//   3  Ann ~260 yds out on the line (fairway): mark -> the sheet "260 yds · fairway", Long Drive: Ann;
//      kpLeaders / kpWinners written as the KP block writes them
//   4  Ben 275 yds out, 40 yds right (rough): mark -> "rough - doesn't count"; Ann keeps it
//   5  PAYOUT through the existing KP engine (pool-engine computeMoneyPool): hole 1 paid to Ann, $20
//   6  every write of the whole flow: no latitude, no longitude
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

const CODE = 'LDG045', KEY = 'ldgps_test', ID = '990000000000000046';
const YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400);
const BALL_FW = G.destination(G.destination(TEE, 0, 260 * YDM), 90, 5 * YDM);     // ~260 out, 5 yds right of the line
const BALL_RGH = G.destination(G.destination(TEE, 0, 275 * YDM), 90, 40 * YDM);   // ~278 out, 40 yds right
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'LD Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const LINE = { pts: [P(TEE), P(G.destination(TEE, 0, 240)), P(MID)], at: 1792000000000, ev: 'OTHER1' };
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'LD Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.moneyPool = { enabled: true, buyIn: 20, net: null, skins: { mode: 'remainder', scoring: 'net', carryOver: true } };
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SHOTS = process.env.SHOTS_045 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Long Drive at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id), ben = String(r0.players[1].id);
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const j = await openJourney({ db: { events: { [CODE]: r0 }, course_gps: { [KEY]: { lines: { h1: LINE } } }, global_courses: { [KEY]: { name: 'LD Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1500); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const sheetText = "(function(){ var s = document.querySelector('#gps-overlay .gps-markd-sheet'); return s && s.style.display !== 'none' ? s.innerText : ''; })()";
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("!!window.HardPanBet && !!window.HardPanGpsLd && typeof currentData !== 'undefined' && !!currentData && !!currentData.players", 20000), 'the round');
            // 1. + Bet > More > Long Drive
            assert.equal(await ev("HardPanBet.open()"), true, '+ Bet opens');
            await ev("document.querySelector('#hp-bet [data-hb=more]').click()");
            assert.ok(await until("!!document.querySelector('#hp-bet [data-hb=longdrive]')", 4000), 'the Long Drive tile under More');
            await shot('0-bet-more-longdrive');
            await ev("document.querySelector('#hp-bet [data-hb=longdrive]').click()");
            assert.ok(await until("HardPanBet.weeklyOpen() && !!document.querySelector('#hp-weekly #wk-ld')", 4000), 'the Weekly Game sheet with the Long Drive row');
            const chips = JSON.parse(await ev("JSON.stringify(Array.from(document.querySelectorAll('#hp-weekly [data-wk-ld]')).map(function(b){return b.textContent;}))"));
            assert.ok(chips.indexOf('1 · P4') > -1, 'hole 1 (par 4) offered'); assert.ok(chips.every((c) => !/P3/.test(c)), 'no par 3s');
            assert.match(await ev("document.getElementById('wk-why').textContent"), /Pick the Long Drive hole/);
            await ev("document.querySelector('#hp-weekly [data-wk-ld=\"1\"]').click()");
            await ev("(function(){ var i = document.querySelector('#hp-weekly [data-wk-in=kpAmt]'); i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
            await ev("HardPanBet.weeklyOpen() && (function(){ var a = document.querySelector('#hp-weekly [data-wk-ld=\"1\"]'); return a && a.classList.contains('on'); })()");
            await shot('0b-weekly-longdrive');
            await ev("document.querySelector('#hp-weekly [data-wk=save]').click()");
            assert.ok(await until("!HardPanBet.weeklyOpen()", 6000), 'saved: ' + await ev("(document.getElementById('wk-why')||{}).textContent"));
            const mp = JSON.parse(await ev("JSON.stringify(window.__DB.events['" + CODE + "'].moneyPool)"));
            assert.deepEqual(mp.longDrive, { holes: [1], allowRough: false });
            assert.deepEqual(mp.kp, { amount: 20, holes: [1] });
            // 2. the GPS map on hole 1
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-markd') && document.querySelector('#gps-overlay .gps-markd').style.display !== 'none'", 10000), 'the Mark button on the Long Drive hole');
            const s1 = JSON.parse(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-markd-btn'), rb = b.getBoundingClientRect(); return JSON.stringify({ text: b.textContent, inBottom: !!b.closest('.gps-ld-bottom'), w: innerWidth, sw: document.documentElement.scrollWidth, btnBottom: rb.bottom, h: innerHeight }); })()"));
            assert.equal(s1.text, '🏌️ Mark my drive');
            assert.equal(s1.inBottom, true, 'in the bottom row (layout D)');
            assert.ok(s1.btnBottom <= s1.h, 'on screen');
            assert.ok(s1.sw <= s1.w, 'no sideways scroll');
            assert.ok(await until("(function(){ var c = HardPanMark.context(); return !!(c && c.savedLine && c.tee); })()", 8000), 'the saved line reached the button');
            await shot('1-ld-hole-button');
            // 3. Ann in the fairway, ~260 out
            await ev('__moveTo(' + BALL_FW[0] + ',' + BALL_FW[1] + ')');
            await sleep(1500);
            await ev("document.querySelector('#gps-overlay .gps-markd-btn').click()");
            assert.ok(await until(sheetText + ".indexOf('Long Drive: Ann') > -1", 8000), 'the result sheet: ' + await ev(sheetText));
            let txt = await ev(sheetText);
            assert.match(txt, /Ann Alpha: 26[01] yds · fairway/);
            assert.match(txt, /Distances only - no position leaves this phone\./);
            assert.equal(await ev("(function(){ var r = document.querySelector('#gps-overlay .gps-markd-sheet').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })()"), true, 'the sheet is on screen');
            await shot('2-ld-fairway-result');
            // 4. Ben in the rough, longer
            await ev("document.querySelector('#gps-overlay .gps-markd-sheet [data-mark=close]').click()");
            // the GPS screen's golfer pick (who the score sheet / Mark button is for) -> Ben
            await ev("localStorage.setItem('hardpan_gps_golfer_" + CODE + "','" + ben + "')");
            assert.ok(await until("(function(){ var c = HardPanMark.context(); return !!(c && c.golfer && String(c.golfer.id) === '" + ben + "'); })()", 8000), 'Ben is the golfer');
            await ev('__moveTo(' + BALL_RGH[0] + ',' + BALL_RGH[1] + ')');
            await sleep(1500);
            await ev("document.querySelector('#gps-overlay .gps-markd-btn').click()");
            assert.ok(await until(sheetText + ".indexOf('Ben Bravo') > -1", 8000), 'Ben on the sheet');
            txt = await ev(sheetText);
            assert.match(txt, /Ben Bravo: 2[78]\d yds · rough - doesn’t count/);
            assert.match(txt, /Long Drive: Ann Alpha/);
            await shot('3-ld-rough-result');
            // 5. the payout, by the existing KP engine
            const pay = JSON.parse(await ev("(function(){ var r = computeMoneyPool(currentData, currentData.courseData, currentData.scores || {}); var l = r.kp.lines.filter(function(x){ return x.hole === 1; })[0]; return JSON.stringify(l); })()"));
            assert.equal(pay.state, 'paid'); assert.equal(pay.winnerId, ann); assert.equal(pay.cents, 2000);
            const db = JSON.parse(await ev("JSON.stringify({ ev: window.__DB.events['" + CODE + "'], writes: window.__WRITES || [] })"));
            assert.equal(db.ev.kpWinners.h1, ann);
            assert.equal(db.ev.kpLeaders.h1.playerId, ann);
            assert.equal(db.ev.ldGps.h1.marks[ann].lie, 'fairway');
            assert.equal(db.ev.ldGps.h1.marks[ben].lie, 'rough');
            // 6. THE GUARD, in the page: nothing written holds a coordinate.
            const all = JSON.stringify(db.writes) + JSON.stringify(db.ev.ldGps) + JSON.stringify(db.ev.kpLeaders) + JSON.stringify(db.ev.ldGpsLog || {}) + JSON.stringify(db.ev.moneyPool);
            for (const c of [TEE, MID, BALL_FW, BALL_RGH].flat()) assert.ok(all.indexOf(String(c).slice(0, 6)) === -1, 'no coordinate ' + c + ' in the writes');
            assert.doesNotMatch(all, /"(lat|lng|latitude|longitude|pt|coords)"/);
            // 7. The card's KP block on hole 1 says Long Drive and the yards (the words changed from gps-longdrive.js).
            await ev("document.querySelector('#gps-overlay .gps-markd-sheet [data-mark=close]').click()");
            await ev("(function(){ var b = document.querySelector('#gps-overlay [data-hp-bar=card], #hp-card-bet [data-hp-bar=card]'); if (b && b.offsetParent) b.click(); else if (window.HardPanRound && HardPanRound.go) HardPanRound.go('card'); return 1; })()");
            const kpOk = await until("(function(){ var m = document.getElementById('kp-entry-mount'); return !!m && /Long Drive/.test(m.innerText); })()", 8000);
            const kpTxt = await ev("(function(){ var m = document.getElementById('kp-entry-mount'); return m ? m.innerText : '(no mount)'; })()");
            assert.ok(kpOk, 'the card KP block: ' + kpTxt);
            assert.match(kpTxt, /Hole 1 — Long Drive/);
            assert.match(kpTxt, /Ann Alpha/);
            assert.match(kpTxt, /26[01] yds/);
            assert.doesNotMatch(kpTxt, /Closest to the Pin|Distance not recorded/);
            await shot('4-card-kp-block-long-drive');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            await until("HardPanGps.side() === 'gps'", 8000);
            // A non-Long-Drive hole: no button.
            await ev('HardPanGps.setHole(2, 4)');
            await sleep(1200);
            assert.equal(await ev("(function(){ var b = document.querySelector('#gps-overlay .gps-markd'); return !b || b.style.display === 'none'; })()"), true, 'no button on hole 2');
        } finally { await j.close(); }
    });
}
