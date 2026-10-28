// 089 - MY MISS CLUB CHIPS IN REAL CHROME (402x874 and 375x667; Manny Oct 27). The 063 made-up course (synthetic - no
// licensed data): hole 1 a par 4, hole 2 a par 3 of 168. Manny's bag typed in (7i 178, 8i 165 ...); still air.
// Checks: My miss off = no chips; on, 168 out: two chips ("7i +N long" selected, "8i -N short"), stacked bottom-left,
// 16 px from the edge, 40 px tall, above Recenter; the note "7-iron lands N yds long"; the ring faded; the same two
// layers; nothing under the chips; tap 8i: oval + label + note + the plays-like pill's club follow; tap 7i back;
// the pick resets on the next shot (walked on) and the next hole; one chip when only one club is in range; Mark shot
// takes the tapped club and the chips hide while it is open; none with no oval, in tournament mode, on a par-4 tee,
// with My miss off; a par-3 tee shows them. Screenshots into SHOTS_089.
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

const CODE = 'MIS089', KEY = 'miss089_test', ID = '990000000000000089';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
// 089b: hole 1's green has its MIDDLE only (no front / back), so these checks keep testing 089's pair of chips
// (089b's chips across the green depth need a front and a back: urgent089b_depth_chips_chrome_test.js).
const h = { 1: { g: { c: P(MID) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, n === 2 ? 168 * G.M_PER_YD : 350)) }, t: { b: P(t) } }; }
const TEE2 = h[2].t.b;   // 089: hole 2 is a PAR 3, 168 yds
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Chips Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : i === 1 ? { par: 3 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Chips Test Golf Club', eventName: 'Test 089 miss chips', groupSizeOverrides: { 0: 2 } } });
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
const SHOTS = process.env.SHOTS_089 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (yd) => G.destination(MID, 180, yd * G.M_PER_YD);   // yd short of the green on the hole's line


for (const vp of [{ width: 402, height: 874 }, { width: 375, height: 667 }]) {
    test('089 My miss club chips at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded089')) { sessionStorage.setItem('seeded089', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Chips Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome089-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
        const lbl = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missLbl())'));
        const moveTo = async (p) => { await ev('__moveTo(' + p[0] + ',' + p[1] + ')'); await sleep(2500); };
        // The chips on screen: [{ club, text, on, box }].
        const chips = async () => JSON.parse(await ev("JSON.stringify((function(){ var w = document.querySelector('#gps-overlay .gps-map-wrap').getBoundingClientRect(); return Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip'), function (e) { return e.offsetParent !== null; }).map(function (e) { var b = e.getBoundingClientRect(); return { club: e.getAttribute('data-miss-chip'), text: e.textContent, on: e.classList.contains('gps-miss-chip-on') && e.getAttribute('aria-pressed') === 'true', box: { l: b.left - w.left, t: b.top - w.top, r: b.right - w.left, b: b.bottom - w.top }, sx: b.left }; }); })())"));
        const pill = () => ev("(document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || ''");
        const tap = (c) => ev("(function(){ var b = document.querySelector('#gps-overlay .gps-miss-chip[data-miss-chip=\"" + c + "\"]'); if (!b) return false; b.click(); return true; })()");
        // Nothing visible (label, bubbles, F / C / B, the "20 yd" ring label, pill) under a chip.
        const underChips = async () => JSON.parse(await ev("JSON.stringify((function(){ var cs = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip'), function (e) { return e.offsetParent !== null; }).map(function (e) { return e.getBoundingClientRect(); }); var out = []; Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay .gps-miss-lbl span, #gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on, #gps-overlay .gps-green-lbl, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-ld-plays, #gps-overlay .gps-carry-lbl'), function (e) { if (e.offsetParent === null) return; var q = e.getBoundingClientRect(); if (!(q.width > 0 && q.height > 0)) return; cs.forEach(function (b) { if (Math.min(b.right, q.right) - Math.max(b.left, q.left) > 0.5 && Math.min(b.bottom, q.bottom) - Math.max(b.top, q.top) > 0.5) out.push(String(e.className) + ':' + e.textContent); }); }); return out; })())"));
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            // 1 - My miss OFF (the default): a 7-iron approach has no chips, no oval.
            await moveTo(out(168));
            assert.equal(await ev("HardPanMissPattern.isOn('Test Golfer')"), false);
            assert.deepEqual(await chips(), [], 'My miss off: no chips');
            assert.ok(await until("/· (7i|8i)$/.test((document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || '')", 10000), 'the pill: the app\'s pick ' + await pill());
            // My miss ON (GPS tools > MAP).
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(800);
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(1500);
            // 2 - 168 out (the made-up course plays ~165 here): TWO chips - the app's pick (A,
            // selected) over the next club down (D); the note; the faded ring; the fade.
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips && n.chips.list.length === 2); })()", 8000), 'two chips: ' + JSON.stringify(await now()));
            let n = await now(), cs = await chips();
            const A = n.chips.app, D = n.chips.list.find((c) => c.club !== A).club;
            const NM = JSON.parse(await ev('JSON.stringify(HardPanGpsBag.NAMES)'));
            assert.ok([['7i', '8i'], ['8i', '9i']].some((x) => x[0] === A && x[1] === D), 'the two clubs around the plays-like: ' + JSON.stringify(n) + ' ' + await pill());
            assert.equal(n.chips.sel, A); assert.equal(n.oval.club, A); assert.equal(n.pick, null);
            assert.deepEqual(cs.map((c) => c.club), [A, D], 'longer club on top');
            assert.deepEqual(cs.map((c) => c.on), [true, false], 'the app\'s pick selected');
            const dA = n.chips.list.find((c) => c.club === A).delta, dD = n.chips.list.find((c) => c.club === D).delta;
            assert.ok(dA > dD, 'the longer club lands longer');
            assert.equal(cs[0].text, await ev("HardPanMissPattern.chipText('" + A + "', " + dA + ")"));
            assert.equal(cs[1].text, await ev("HardPanMissPattern.chipText('" + D + "', " + dD + ")"));
            assert.ok(cs[0].box.b <= cs[1].box.t, 'stacked');
            cs.forEach((c) => { assert.ok(Math.abs(c.sx - 16) <= 1, '16 px from the edge: ' + c.sx); assert.ok(Math.round(c.box.b - c.box.t) === 40, '40 px tall'); });
            const rc = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-leftrow .gps-recenter').getBoundingClientRect())"));
            const wr = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-map-wrap').getBoundingClientRect())"));
            assert.ok(cs[1].box.b + wr.top <= rc.top - 9, 'above Recenter');
            let L = await lbl();
            assert.equal(L.text, 'My miss · ' + NM[A]);
            assert.equal(L.note, await ev("HardPanMissPattern.landNote('" + NM[A] + "', " + dA + ", 0)"));
            if (Math.abs(dA) > 2.5) assert.match(L.note, new RegExp('^' + NM[A] + ' lands \\d+ yds (long|short)$')); else if (Math.abs(dA) < 1.5) assert.equal(L.note, '', 'within 2 yds: no note');
            assert.deepEqual(L.hits, [], 'label clear (chips included): ' + JSON.stringify(L));
            assert.deepEqual(await underChips(), [], 'nothing under the chips');
            const lay = JSON.parse(await ev('JSON.stringify(HardPanGps.mapLayers())'));
            assert.deepEqual(lay.layers.filter((l) => /^mymiss-/.test(l)), ['mymiss-fill', 'mymiss-line'], 'the same two layers');
            assert.equal(n.ringFaded, await ev("!!document.querySelector('#gps-overlay .gps-target')"), 'the target ring fades (when it shows)');
            if (n.ringFaded) {
                assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-target .gps-ring')).opacity"), '0.4');
                assert.equal(await ev("getComputedStyle(document.querySelector('#gps-overlay .gps-target .gps-ring-dot')).opacity"), '0.85');
            }
            await shot('1-app-pick');
            // 3 - tap D: the oval, label, note AND the pill's club move to D.
            assert.equal(await tap(D), true);
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.oval.club === '" + D + "'); })()", 5000), 'D oval: ' + JSON.stringify(await now()));
            n = await now(); cs = await chips(); L = await lbl();
            assert.equal(n.pick, D); assert.equal(n.chips.sel, D); assert.equal(n.chips.app, A); assert.equal(n.oval.carry, MB[D]);
            assert.deepEqual(cs.map((c) => c.on), [false, true], 'D selected');
            assert.equal(L.text, 'My miss · ' + NM[D]);
            assert.equal(L.note, await ev("HardPanMissPattern.landNote('" + NM[D] + "', " + n.chips.list.find((c) => c.club === D).delta + ", 0)"));
            assert.ok(await until("/· " + D + "$/.test((document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || '')", 4000), 'the pill follows the chip: ' + await pill());
            assert.deepEqual(L.hits, [], 'label clear: ' + JSON.stringify(L));
            assert.deepEqual(await underChips(), [], 'nothing under the chips (D)');
            await shot('2-down-tapped');
            // 4 - tap A back: the app's pick again.
            await tap(A); await sleep(800);
            n = await now(); assert.equal(n.oval.club, A); assert.equal(n.pick, null); assert.doesNotMatch(await pill(), new RegExp('· ' + D + '$'));
            // 5 - next shot without Mark shot: tap D, walk 47 yds back (more than 40 from where he tapped) -> the app's pick there.
            await tap(D); await sleep(800); assert.equal((await now()).oval.club, D);
            await moveTo(out(215));
            n = await now();
            assert.equal(n.pick, null, 'the pick resets on the next shot ' + JSON.stringify(n) + ' ' + await pill());
            if (n.oval) assert.equal(n.chips.sel, n.chips.app);
            // 130 out: PW (140) is the pick and nothing in the bag is shorter: ONE chip, selected.
            await moveTo(out(130));
            n = await now();
            assert.ok(n.oval && n.oval.club === 'PW', JSON.stringify(n));
            cs = await chips(); assert.deepEqual(cs.map((c) => c.club), ['PW'], 'one chip'); assert.equal(cs[0].on, true);
            await moveTo(out(168)); n = await now(); assert.ok(n.oval && n.chips && n.chips.sel === n.chips.app && n.pick === null, 'back at 168: the app\'s pick ' + JSON.stringify(n));
            // 6 - Mark shot uses the tapped club; the chips hide while that shot is open at the ball.
            const downNow = async () => { const m = await now(); const x = m && m.chips && m.chips.list.find((c) => c.club !== m.chips.app); return x ? x.club : null; };
            const D6 = await downNow(); assert.ok(D6, 'a second chip at 168');
            await tap(D6); await sleep(800); assert.equal((await now()).oval.club, D6);
            await ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"" + D6 + "\"].on')", 8000), 'Mark shot pre-selects the tapped club: ' + await ev("(document.querySelector('#gps-overlay .gps-bagask')||{}).innerText"));
            await sleep(1000);
            n = await now();
            assert.equal(n.oval.club, D6, 'the open shot\'s club'); assert.equal(n.chips, null, 'no chips while Mark shot is open'); assert.equal(n.pick, null);
            assert.deepEqual(await chips(), []);
            await shot('3-mark-open');
            // 7 - no chips where there is no oval: 250 out (3-wood).
            await moveTo(out(250)); n = await now();
            assert.equal(n.oval, null); assert.deepEqual(await chips(), [], 'no oval: no chips');
            // 8 - tournament mode: no chips (My miss itself is hidden).
            // (215 out: more than 40 yds from the shot marked at 168, so that shot is no longer open at this ball.)
            await moveTo(out(215)); assert.ok((await chips()).length >= 1, 'chips at 215: ' + JSON.stringify(await now()));
            await ev("localStorage.setItem('hardpan_tournament_phone', '1')"); await moveTo(out(213));
            assert.deepEqual(await chips(), [], 'tournament: no chips'); assert.equal((await now()).oval, null);
            await ev("localStorage.removeItem('hardpan_tournament_phone')"); await moveTo(out(215));
            assert.ok((await chips()).length >= 1, 'back after tournament');
            // 9 - next hole: the pick resets. Tap the club down, hole 2 (a par 3 - the TEE shows chips), back to 1.
            const D9 = await downNow(); assert.ok(D9, 'a second chip');
            await tap(D9); await sleep(800); assert.equal((await now()).pick, D9);
            await ev('HardPanGps.goHole(2)'); await moveTo(TEE2); await sleep(1500);
            n = await now();
            assert.equal(await ev('HardPanGps.hole()'), 2);
            assert.equal(n.pick, null, 'the pick resets on the next hole');
            assert.ok(n.oval && n.chips && n.chips.list.length >= 1, 'par-3 tee: the oval and chips ' + JSON.stringify(n));
            await shot('4-par3-tee');
            // 10 - par 4 tee: none.
            await ev('HardPanGps.goHole(1)'); await moveTo(TEE); await sleep(1500);
            n = await now(); assert.equal(n.oval, null); assert.deepEqual(await chips(), [], 'par-4 tee: no chips');
            // 11 - My miss OFF: chips gone, ring back.
            await moveTo(out(215));
            assert.ok((await chips()).length >= 1);
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(800);
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(1500);
            assert.deepEqual(await chips(), [], 'off: no chips');
            assert.equal(await ev("!!document.querySelector('#gps-overlay .gps-target.gps-target-mymiss')"), false, 'off: the ring at full strength');
            // Nothing stored, nothing written.
            assert.doesNotMatch(await ev("JSON.stringify(window.__WRITES || [])"), /mymiss|offline|shotlog|missPick/);
            assert.equal(await ev("Object.keys(localStorage).filter(function (k) { return /pick|chip/i.test(k) && /miss/i.test(k); }).length"), 0);
        } finally { await j.close(); }
    });
}
