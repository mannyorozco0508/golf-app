// URGENT-049 part 3 - THE SHOT LOG IN MY BAG, SHOT HISTORY AND PLAYS LIKE, IN REAL CHROME
// (393x852 and 375x667, the GPS map, a stand-in GPS and a stand-in wind reading).
// A made-up course (synthetic - no licensed data); the GPS screen's golfer is Ann.
//   0  a counted shot record (HardPanShotLog.add - what the Mark shot chips write, 049 part 1)
//      with a position passed in: stored without it
//   1  a synthetic season in the log: 7-iron 24 shots at random angles (qualified), 6-iron 4
//   2  My bag: 7-iron "learned · 24 shots" + "wind: head −2.0 · tail ..." ; 6-iron "wind: generic ·
//      N of 8 windy shots"; the handedness setting (Right-handed default -> Left-handed kept)
//   3  Shot history (7-iron): newest first, filter 10-15 mph, filter From left, swipe-to-delete
//   4  Plays like on the map: 150 out, 9 mph into the golfer -> the pill says "yours", its number
//      uses Ann's own 7-iron headwind; the (i) says "From your 24 marked 7-iron shots: ..."
//   5  Reset on the 7-iron -> its marked shots cleared, back to the old number (160, short of it
//      now: the 6-iron); the (i) says "Generic wind model - 5 more windy 6-iron shots to learn yours"
//   6  THE GUARD: the phone's storage and every database write - no coordinate in the log
// Screenshots into SHOTS_049 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-shot-log.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

const CODE = 'WND049', KEY = 'wndgps_test', ID = '990000000000000049';
const YDM = 0.9144;
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 400 * YDM);
const BALL = G.destination(TEE, 0, 250 * YDM);   // 150 yds out, straight at the green
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Wind Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Wind Test Golf Club', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
const GEO = "(function(){ var cur = { lat: " + BALL[0] + ", lng: " + BALL[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// The wind: 9 mph FROM the north (0) = straight into a golfer hitting north (hole 1 runs north).
const WIND = "try{localStorage.setItem('hardpan_wind_v1_" + KEY + "', JSON.stringify({ at: Date.now() + 3600e3, src: 'weatherkit', obsAt: Date.now(), mph: 9, fromDeg: 0, toDeg: 180, tempF: 70 }));}catch(e){}";
// A synthetic season for Ann (seeded): 7-iron 24 shots (head -2.0 / tail +0.9 / left -0.6 / right -0.3,
// still air 170) at random angles incl. 88; 6-iron 4 shots. My bag set up: 4i 205, 5i 195, 6i 180, 7i 160, 8i 150. Dates descending from Oct 20.
const SEED = "(function(){ var s = 3, r = function(){ return (s = (s * 16807) % 2147483647) / 2147483647; }, L = HardPanShotLog, WL = HardPanWindLearn;"
    + " var K = { head: -2.0, tail: 0.9, left: -0.6, right: -0.3 };"
    + " for (var i = 0; i < 24; i++) { var rel = i === 0 ? 88 : Math.round(r() * 3599) / 10, mph = Math.round((i % 6 === 5 ? 2 : 6 + r() * 14) * 10) / 10, c = WL.components(mph, rel);"
    + "  L.add({ golfer: 'Ann Alpha', club: '7i', carry: 170 + K.head * c.head + K.tail * c.tail + K.left * c.fromLeft + K.right * c.fromRight + (r() - .5) * 2, windMph: mph, relAngle: rel, tempF: 72,"
    + "   course: i % 2 ? 'Papago' : 'Dobson Ranch', hole: 1 + (i * 7) % 18, date: Date.UTC(2026, 9, 20, 18) - i * 86400e3 / 2, wxHour: new Date(Date.UTC(2026, 9, 20, 18) - i * 43200e3).toISOString(), src: 'weatherkit' }); }"
    + " [[180, 6, 0], [176, 7, 20], [186, 8, 170], [181, 3, 250]].forEach(function (x, i) { L.add({ golfer: 'Ann Alpha', club: '6i', carry: x[0], windMph: x[1], relAngle: x[2], course: 'Papago', hole: 2 + i, date: Date.UTC(2026, 9, 19) + i }); });"
    + " return L.list({ golfer: 'Ann Alpha' }).length; })()";
const SHOTS = process.env.SHOTS_049 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test('Shot log, My bag, Shot history, Plays like at ' + vp.width + 'x' + vp.height, { timeout: 240000 }, async () => {
        const r0 = round(), ann = String(r0.players[0].id);
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + WIND + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + ann + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
        const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: { [KEY]: { name: 'Wind Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1000); await j.shot(path.join(SHOTS, 'chrome-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const BAG = "document.querySelector('#gps-overlay .gps-bag')", HIST = "document.querySelector('#gps-overlay .gps-shist')";
        const text = (sel) => ev("(function(){ var s = " + sel + "; return s && s.style.display !== 'none' ? s.innerText : ''; })()");
        const tap = (sel, inner) => ev("(function(){ var s = " + sel + "; var b = s && s.querySelector(" + JSON.stringify(inner) + "); if (!b) return false; b.click(); return true; })()");
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE), 5000);
            assert.ok(await until("typeof currentData !== 'undefined' && !!currentData && !!currentData.players && !!window.HardPanGps", 20000), 'the round');
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            await ev('HardPanGps.setHole(1, 4)');
            await sleep(1200);
            // My bag set up (so the pill names a club): 6-iron 180, 7-iron 160 ("entered"), 8-iron 150.
            await ev("document.querySelector('#gps-overlay .gps-my-bag').click()");
            assert.ok(await until("!!window.HardPanShotLog && !!window.HardPanWindLearn && !!window.HardPanShotBag && !!window.HardPanGpsBag", 8000), 'the 049 files load with My bag');
            await ev("(function(){ var d = HardPanGpsBag.defaultCarries(10); d['4i'] = 205; d['5i'] = 195; d['6i'] = 180; d['7i'] = 160; d['8i'] = 150; d['9i'] = 138; HardPanGpsBag.setup('Ann Alpha', d); return 1; })()");
            const writes0 = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).length;
            // 0. a counted shot record (what the chips write), a position handed in by mistake
            const id0 = await ev("HardPanShotLog.add({ golfer: 'Ann Alpha', club: '8i', carry: 148, windMph: 10, windFromDeg: 47, bearingDeg: 137, tempF: 71, elevFt: -2, course: 'Wind Test Golf Club', hole: 1, date: Date.now(), wxHour: '2026-10-21T15:00:00Z', src: 'weatherkit', p: [" + BALL.join(',') + "], lat: " + BALL[0] + " })");
            assert.ok(id0, 'the record saved');
            const rec0 = JSON.parse(await ev("JSON.stringify(HardPanShotLog.list({ golfer: 'Ann Alpha', club: '8i' })[0])"));
            assert.equal(rec0.relAngle, 270, 'wind from 47 on a 137 line = 270 (from the left)');
            assert.equal(rec0.across, -10); assert.equal(rec0.p, undefined); assert.equal(rec0.lat, undefined);
            // 1. the season
            assert.equal(await ev(SEED), 29);
            // 2. My bag
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            await ev("document.querySelector('#gps-overlay .gps-my-bag').click()");
            assert.ok(await until("(function(){ var s = " + BAG + "; return !!s && s.style.display !== 'none' && !!s.querySelector('[data-bag-wind=\"7i\"]'); })()", 6000), 'My bag with the wind lines');
            const row = (c) => ev("(function(){ var r = " + BAG + ".querySelector('[data-bag-row=\"" + c + "\"]'); return r ? r.querySelector('.gps-bag-yd').value + ' | ' + r.innerText.replace(/\\s+/g, ' ') : ''; })()");
            const r7 = await row('7i');
            assert.match(r7, /^170 \| 7-iron learned · 24 shots Reset wind: head −2\.\d · tail \+0\.\d · from left −0\.\d · from right −0\.\d yd\/mph Shot history \(24\)$/, r7);
            assert.match(await row('6i'), /wind: generic · 3 of 8 windy shots/);
            assert.match(await row('8i'), /^150 \|.*wind: generic · 1 of 8 windy shots Shot history \(1\)$/, 'one 8-iron shot: the typed / set-up number stays');
            assert.match(await text(BAG), /Wind: yards per mph, learned per club once it has 8 marked shots in wind over 5 mph/);
            const hand = () => ev("Array.from(" + BAG + ".querySelectorAll('[data-bag-hand]')).map(function(b){ return b.textContent + '=' + b.getAttribute('aria-pressed'); }).join(',')");
            assert.equal(await hand(), 'Right-handed=true,Left-handed=false');
            await ev(BAG + ".querySelector('[data-bag-row=\"7i\"]').scrollIntoView({ block: 'center' })");
            await shot('1-my-bag-wind');
            await tap(BAG, '[data-bag-hand="L"]');
            assert.equal(await hand(), 'Right-handed=false,Left-handed=true');
            assert.equal(await ev("HardPanShotLog.hand('Ann Alpha')"), 'L');
            await tap(BAG, '[data-bag-hand="R"]');
            // 3. Shot history
            assert.equal(await tap(BAG, '[data-bag-hist="7i"]'), true);
            assert.ok(await until("(function(){ var s = " + HIST + "; return !!s && s.style.display !== 'none'; })()", 4000), 'Shot history');
            assert.equal(await ev(BAG + ".style.display"), 'none', 'My bag steps aside');
            const rows = () => ev("JSON.stringify(Array.from(" + HIST + ".querySelectorAll('.gps-shist-row')).map(function(r){ return r.innerText.replace(/\\s+/g, ' ').replace(/ Delete$/, ''); }))").then(JSON.parse);
            let all = await rows();
            assert.equal(all.length, 24);
            assert.match(all[0], /^\d{3} still air \d{3} Hole 1 · Dobson Ranch · Oct 20 (\d+ mph (into you|behind you|from the left|from the right) \(\d+°\)|calm) · 72°F$/, all[0]);
            assert.match(await text(HIST), /^7-iron · shot history/);
            assert.match(await text(HIST), /24 marked shots · still-air carry 170 yds · wind: head −2/);
            await shot('2-shot-history');
            const want = JSON.parse(await ev("JSON.stringify(HardPanShotLog.list({ golfer: 'Ann Alpha', club: '7i', strength: '10-15' }).length)"));
            await tap(HIST, '[data-shist-s="10-15"]');
            let f = await rows();
            assert.equal(f.length, want); assert.ok(want > 0 && want < 24);
            f.forEach((t) => { const m = t.match(/ (\d+) mph /); assert.ok(m && +m[1] >= 10 && +m[1] <= 15, t); });
            await tap(HIST, '[data-shist-s=""]');
            await tap(HIST, '[data-shist-d="left"]');
            f = await rows();
            assert.ok(f.length > 0 && f.every((t) => / from the left \((2[3-9]\d|3[01]\d)°\)/.test(t)), f.join(' / '));
            assert.equal(await ev("Array.from(" + HIST + ".querySelectorAll('[aria-pressed=true]')).map(function(b){ return b.textContent; }).join(',')"), 'Any wind,From left');
            await shot('3-shot-history-from-left');
            // swipe-to-delete the first from-left shot
            const id1 = await ev(HIST + ".querySelector('.gps-shist-row').getAttribute('data-shist-id')");
            await ev("(function(){ var r = " + HIST + ".querySelector('.gps-shist-row'); var b = r.getBoundingClientRect(), y = b.top + b.height / 2;"
                + " var T = function (cx) { return new Touch({ identifier: 1, target: r, clientX: cx, clientY: y }); };"
                + " r.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(b.left + 250)], changedTouches: [T(b.left + 250)] }));"
                + " r.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(b.left + 120)] })); return 1; })()");
            assert.equal(await ev(HIST + ".querySelector('.gps-shist-row').classList.contains('gps-swiped')"), true, 'swiped open');
            await sleep(300);
            await shot('3b-swipe-delete');
            await tap(HIST, '[data-shist-del="' + id1 + '"]');
            assert.equal(await ev("HardPanShotLog.list({ golfer: 'Ann Alpha', club: '7i' }).length"), 23, 'deleted');
            assert.equal(await ev("HardPanShotLog.list({ golfer: 'Ann Alpha', club: '7i' }).some(function(s){ return s.id === '" + id1 + "'; })"), false);
            await tap(HIST, '.gps-shist-done');
            assert.ok(await until("(function(){ var s = " + BAG + "; return !!s && s.style.display !== 'none'; })()", 3000), 'Done -> back to My bag');
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            // 4. Plays like with Ann's own 7-iron
            await ev('__moveTo(' + BALL[0] + ',' + BALL[1] + ')');
            assert.ok(await until("(function(){ var p = document.querySelector('#gps-overlay .gps-ld-plays'); return !!p && p.style.display !== 'none' && /yours/.test(p.innerText); })()", 10000),
                'the pill says yours: ' + await ev("(document.querySelector('#gps-overlay .gps-ld-plays') || {}).innerText"));
            const pill = await ev("document.querySelector('#gps-overlay .gps-ld-plays').innerText.replace(/\\s+/g, ' ')");
            const f7 = JSON.parse(await ev("JSON.stringify(HardPanShotBag.clubFit('Ann Alpha', '7i'))"));
            const raw = Number(pill.match(/^(\d+)/)[1]), pl = Number(pill.match(/(\d+)y · 7i/)[1]);
            assert.ok(Math.abs(pl - (raw - f7.head * 9)) <= 1.5, pill + ' vs ' + raw + ' + ' + (-f7.head * 9).toFixed(1));
            assert.ok(pl > Math.round(raw * 1.09) - 1, 'more than the generic 1%/mph: ' + pill);
            await shot('4-plays-like-yours');
            await ev("document.querySelector('#gps-overlay .gps-ld-plays').click()");
            assert.ok(await until("(function(){ var s = document.querySelector('#gps-overlay .gps-plinfo'); return !!s && s.style.display !== 'none' && !!s.querySelector('.gps-plinfo-src'); })()", 5000), 'the (i) with its source line');
            const src = await ev("document.querySelector('#gps-overlay .gps-plinfo-src').textContent");
            assert.match(src, /^From your 23 marked 7-iron shots: −2\.\d yd per mph of headwind, \+0\.\d tailwind, −0\.\d from the left, −0\.\d from the right\. Wind now: 9 mph into you \(0°\)\.$/, src);
            assert.match(await text("document.querySelector('#gps-overlay .gps-plinfo')"), /Wind, your numbers:/);
            await shot('5-info-yours');
            await ev("document.querySelector('#gps-overlay .gps-plinfo-done').click()");
            // 5. Reset the 7-iron: its marked shots go, the number goes back to the set-up 160
            await ev("document.querySelector('#gps-overlay .gps-my-bag').click()");
            assert.ok(await until("(function(){ var s = " + BAG + "; return !!s && s.style.display !== 'none'; })()", 4000));
            await tap(BAG, '[data-bag-reset="7i"]');
            assert.equal(await ev("HardPanShotLog.list({ golfer: 'Ann Alpha', club: '7i' }).length"), 0);
            assert.match(await row('7i'), /^160 \| 7-iron entered/);
            assert.match(await row('6i'), /^\d+ \| 6-iron learned · 4 shots/, 'the 6-iron untouched');
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            assert.ok(await until("(function(){ var p = document.querySelector('#gps-overlay .gps-ld-plays'); return !!p && p.style.display !== 'none' && !/yours/.test(p.innerText); })()", 6000), 'generic again');
            await ev("document.querySelector('#gps-overlay .gps-ld-plays').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-plinfo-src.gen')", 5000));
            assert.match(await ev("document.querySelector('#gps-overlay .gps-plinfo-src').textContent"), /^Generic wind model — 5 more windy 6-iron shots to learn yours$/, 'the 7-iron (160) no longer reaches: the 6-iron, 3 windy shots');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-plinfo-srcsub').textContent"), '3 of 8 marked shots in wind over 5 mph');
            await shot('6-info-generic');
            // 6. THE GUARD
            const ls = await ev("JSON.stringify(localStorage.getItem('hardpan_shotlog_v1'))");
            assert.ok(!new RegExp(String(BALL[0]).slice(0, 7).replace('.', '\\.')).test(ls) && !/"lat"|"lng"|"p":/.test(ls), 'no position in the log');
            const writes = JSON.parse(await ev('JSON.stringify(window.__WRITES || [])')).slice(writes0);
            assert.ok(!writes.some((w) => /shot|player_shots|player_clubs/.test(JSON.stringify(w))), 'nothing written to the database: ' + JSON.stringify(writes).slice(0, 300));
        } finally { await j.close(); }
    });
}
