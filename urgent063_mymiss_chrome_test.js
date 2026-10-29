// URGENT-063 - MY MISS FROM THE AVERAGE CARRIES IN REAL CHROME (402x874 and 375x667). The 052 B made-up course
// (synthetic - no licensed data), hole 1 a par 4; a test golfer with Manny's bag typed in (7i 178, 8i 165, 9i 152,
// PW 140, 6i 192, 5i 205, 4i 218; Dr 285, 3W 255, Hy 235); still air. Checks: the toggle OFF by default; on, from the
// tee: no oval; Driver / 3W / Hybrid approaches and a 7-iron layup: no oval; a 7-iron approach: the oval (178:
// +/-8 deep, +/-11.6 wide, 25 deg) right short / left long on screen, its label clear; the (i) words; the My bag
// lines; a new My bag number moves the line and the oval on its own; the lefty mirror. Screenshots into SHOTS_063.
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

const CODE = 'MIS063', KEY = 'miss063_test', ID = '990000000000000063';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
// 089b: hole 1's green has its MIDDLE only, so the oval here stays the app's pick (the 7-iron) - with a front and
// a back, 089b's default is the club closest to the target (urgent089b_depth_chips_chrome_test.js).
const h = { 1: { g: { c: P(MID) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, 350)) }, t: { b: P(t) } }; }
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Chips Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Chips Test Golf Club', eventName: 'Test 063 my miss', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {}; return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
// Manny's bag (URGENT-063), typed in; still air, 70 F (so plays-like = the yards), nothing fetched.
const MB = { '7i': 178, '8i': 165, '9i': 152, PW: 140, '6i': 192, '5i': 205, '4i': 218, Dr: 285, '3w': 255, Hy: 235 };
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); })();";
const SHOTS = process.env.SHOTS_063 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (yd) => G.destination(MID, 180, yd * G.M_PER_YD);   // yd short of the green on the hole's line

for (const vp of [{ width: 402, height: 874 }, { width: 375, height: 667 }]) {
    test('URGENT-063 My miss from the average carries at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded063')) { sessionStorage.setItem('seeded063', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Chips Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome063-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
        const hasOval = () => ev("(function(){ var l = HardPanGps.mapLayers(); return !!l && l.layers.indexOf('mymiss-fill') !== -1; })()");
        const moveTo = async (p) => { await ev('__moveTo(' + p[0] + ',' + p[1] + ')'); await sleep(2500); };
        const none = async (what, whys) => {
            const n = await now();
            assert.equal(await hasOval(), false, what + ': no oval ' + JSON.stringify(n));
            assert.equal(await ev("HardPanGps.missLbl()"), null, what + ': no label');
            assert.ok(whys.includes(n.why), what + ': why ' + n.why);
        };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            // 1 - the toggle defaults OFF (GPS tools > MAP).
            assert.equal(await ev("HardPanMissPattern.isOn('Test Golfer')"), false, 'off by default');
            await ev("document.querySelector('#gps-overlay .gps-tools').click()");
            assert.ok(await until("(function(){ var t = document.querySelector('#gps-overlay .gps-tsheet'); return !!t && t.style.display !== 'none'; })()", 5000), 'Tools');
            assert.equal(await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').getAttribute('aria-checked')"), 'false', 'the switch shows Off');
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(1500);
            // 2 - on, from the tee: no oval.
            await none('the tee', ['tee']);
            await shot('1-tee-none');
            // 3 - Driver / 3W / Hybrid approaches. 101 (Manny's standing rule, Oct 29: My miss shows on EVERY approach, the
            // club closest to the plays-like): was no oval (why 'club'); now the oval on that club, no hide reason.
            const shown = async (what, clubs) => {
                assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && " + JSON.stringify(clubs) + ".indexOf(n.oval.club) !== -1); })()", 8000), what + ': the ' + clubs.join(' / ') + ' oval ' + JSON.stringify(await now()));
                assert.equal((await now()).why, null, what + ': no hide reason');
            };
            await moveTo(out(280)); await shown('280 out (Driver)', ['Dr']);
            await moveTo(out(250)); await shown('250 out (3-wood)', ['3w', '5w']);   // or the generic 5-wood fitted at 243, if closer to the plays-like
            await moveTo(out(230)); await shown('230 out (Hybrid)', ['Hy', '5w', '3i']);   // 101b: or the new 3-iron (his Hy / 4i midpoint, 227)   // the bag has no 5-wood: its generic carry fitted between Hy 235 and 3w 255 (243) may be the closest
            // 4 - a layup: 300 out, 7-iron picked at Mark shot - the green is out of its range.
            await moveTo(out(300));
            await ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]')", 8000), 'chips');
            await ev("document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"7i\"]').click()");
            await sleep(1500);
            await none('300 out, 7-iron layup', ['range', 'layup']);
            // 5 - a 7-iron approach, 168 out: the oval, right short / left long, its label clear.
            await moveTo(out(168));   // plays ~176 here (the made-up course plays a little long)
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.oval.club === '7i'); })()", 8000), '7-iron oval: ' + JSON.stringify(await now()));
            await sleep(1000);
            let n = await now();
            assert.equal(n.oval.carry, 178);
            assert.ok(Math.abs(n.oval.b - 8.01) < 0.01 && Math.abs(n.oval.a - 11.57) < 0.01 && n.oval.tilt === -25, JSON.stringify(n.oval));
            assert.ok(n.screen.rightY > 0 && n.screen.leftY < 0, 'on screen: right side lower (short), left higher (long) ' + JSON.stringify(n.screen));
            const L = JSON.parse(await ev('JSON.stringify(HardPanGps.missLbl())'));
            assert.equal(L.text, 'My miss · 7-iron');
            assert.deepEqual(L.hits, [], 'label clear of the rail, bubbles, pill: ' + JSON.stringify(L));
            assert.equal(L.onOval, false);
            assert.ok(L.box.l >= 2 && L.box.r <= L.w - 2, 'on screen');
            await shot('2-approach-7i');
            // 6 - the (i): the formula in plain words.
            await ev('HardPanGps.openPlaysInfo()');
            assert.ok(await until("(function(){ var e = document.querySelector('#gps-overlay .gps-plinfo-miss'); return !!e && e.style.display !== 'none'; })()", 5000), 'the (i) My miss paragraph');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-plinfo-miss-t').textContent"), await ev('HardPanMissPattern.infoText()'));
            assert.match(await ev("document.querySelector('#gps-overlay .gps-plinfo-miss').textContent"), /4\.5% of the carry long and short, 6\.5% of the carry left and right, tilted 25°/);
            await shot('3-info');
            await ev("document.querySelector('#gps-overlay .gps-plinfo-done').click()"); await sleep(500);
            // 7 - My bag: the line per iron (and none for Driver / woods / hybrid).
            await ev("document.querySelector('#gps-overlay .gps-tools-menu .gps-my-bag').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay [data-bag-miss=\"7i\"]')", 6000), 'My bag lines');
            const lines = JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#gps-overlay [data-bag-miss]'), function (e) { return [e.getAttribute('data-bag-miss'), e.textContent]; }))"));
            const want = { '4i': '4-iron · 218 · miss right ≈ 6 short, miss left ≈ 6 long', '5i': '5-iron · 205 · miss right ≈ 6 short, miss left ≈ 6 long', '6i': '6-iron · 192 · miss right ≈ 5 short, miss left ≈ 5 long',
                '7i': '7-iron · 178 · miss right ≈ 5 short, miss left ≈ 5 long', '8i': '8-iron · 165 · miss right ≈ 5 short, miss left ≈ 5 long', '9i': '9-iron · 152 · miss right ≈ 4 short, miss left ≈ 4 long' };
            Object.keys(want).forEach((c) => assert.equal((lines.find((l) => l[0] === c) || [])[1], want[c], c));
            assert.match((lines.find((l) => l[0] === 'PW') || [])[1] || '', / · 140 · miss right ≈ 4 short, miss left ≈ 4 long$/);
            assert.ok(!lines.some((l) => ['Dr', '3w', '5w', 'Hy'].includes(l[0])), 'no line for driver / woods / hybrid');
            await shot('4-mybag-lines');
            // 8 - My bag changes (7-iron typed 182): the line and the oval follow on their own.
            await ev("(function(){ var i = document.querySelector('#gps-overlay [data-bag-edit=\"7i\"]'); i.value = '182'; i.dispatchEvent(new Event('change', { bubbles: true })); })()");
            assert.ok(await until("(document.querySelector('#gps-overlay [data-bag-miss=\"7i\"]') || {}).textContent === '7-iron · 182 · miss right ≈ 5 short, miss left ≈ 5 long'", 5000), 'the line follows');
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.oval.carry === 182); })()", 6000), 'the oval follows: ' + JSON.stringify(await now()));
            n = await now();
            assert.ok(Math.abs(n.oval.a - 0.065 * 182) < 0.01 && Math.abs(n.oval.b - 0.045 * 182) < 0.01, JSON.stringify(n.oval));
            // 9 - left-handed (049 I play): the mirror.
            await ev("document.querySelector('#gps-overlay .gps-tools-menu .gps-my-bag').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay [data-bag-hand=\"L\"]')", 6000));
            await ev("document.querySelector('#gps-overlay [data-bag-hand=\"L\"]').click()");
            assert.ok(await until("(document.querySelector('#gps-overlay [data-bag-miss=\"7i\"]') || {}).textContent === '7-iron · 182 · miss left ≈ 5 short, miss right ≈ 5 long'", 5000), 'lefty line');
            await ev("document.querySelector('#gps-overlay .gps-bag-done').click()");
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.oval.tilt === 25 && n.screen && n.screen.leftY > 0 && n.screen.rightY < 0); })()", 6000), 'lefty: left short, right long ' + JSON.stringify(await now()));
            await shot('5-lefty');
            // Nothing about it goes to the database; no coordinates in what it keeps.
            assert.doesNotMatch(await ev("JSON.stringify(window.__WRITES || [])"), /mymiss|offline|shotlog/);
            assert.doesNotMatch(await ev("localStorage.getItem('hardpan_mymiss_v1')"), /lat|lng|\d+\.\d{4,}/);
        } finally { await j.close(); }
    });
}
