// 091 - MARK IS ITS OWN BUTTON + THE NEW ZOOM (Manny APPROVED Oct 27: "Card | gap | Enter score | gap | Mark - Mark is
// its own button, same size + same gap as Card, ◎ icon + "Mark". Remove the full-width Mark shot bar. Default zoom =
// today's zoomed-in view; the zoom button goes one step closer, then back to the full hole. Check no overlaps at SE / 17
// / Pro Max."). Real Chrome at 375x667 (SE), 402x874 (17), 440x956 (17 Pro Max); the 089 made-up course (synthetic).
// Checks: the row is Card | Enter score | Mark, Mark = Card's size, the two gaps equal, no full-width bar; ◎ + "Mark";
// nothing overlaps (the 089 club chips, Recenter, the plays-like pill, the zoom button, the rail, the labels, the row);
// Mark opens Mark shot exactly as the bar did (Which club?, 089: the tapped My miss club pre-selected), then shows
// the live yards; the zoom: a hole opens at 2x, tap = 4x, tap = the full hole, tap = 2x; Recenter / a new hole = 2x;
// holeCheck (the course check, Manny's OK): tee + green on the full frame, the view centre on the hole - and a
// centre off the hole FAILS (negative control). Screenshots into SHOTS_091.
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

const CODE = 'MRK091', KEY = 'mark091_test', ID = '990000000000000091';
const TEE = [33.4600, -111.9600], MID = G.destination(TEE, 0, 350);
const BALL1 = G.destination(TEE, 3, 215), BALL2 = G.destination(MID, 175, 40);
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const h = { 1: { g: { f: P(G.destination(MID, 180, 12)), c: P(MID), b: P(G.destination(MID, 0, 12)) }, t: { b: P(TEE) } } };
for (let n = 2; n <= 18; n++) { const t = G.destination(TEE, 90, 400 * (n - 1)); h[n] = { g: { c: P(G.destination(t, 0, n === 2 ? 168 * G.M_PER_YD : 350)) }, t: { b: P(t) } }; }
const TEE2 = h[2].t.b;   // 089: hole 2 is a PAR 3, 168 yds
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Mark Test Golf Club', course: '', city: 'Phoenix', state: 'AZ', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i === 0 ? { par: 4 } : i === 1 ? { par: 3 } : {}));
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
        overrides: { activeCourseKey: KEY, courseName: 'Mark Test Golf Club', eventName: 'Test 091 mark zoom', groupSizeOverrides: { 0: 2 } } });
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
const SHOTS = process.env.SHOTS_091 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (yd) => G.destination(MID, 180, yd * G.M_PER_YD);   // yd short of the green on the hole's line



const VPS = process.env.VP1 ? [{ width: 375, height: 667, n: 'SE' }] : [{ width: 375, height: 667, n: 'SE' }, { width: 402, height: 874, n: '17' }, { width: 440, height: 956, n: 'ProMax' }];
// The controls that must never overlap one another (visible ones only), and the labels that must not sit on a control.
const CTRL = "#gps-overlay .gps-miss-chip, #gps-overlay .gps-leftrow .gps-recenter, #gps-overlay .gps-ld-plays, #gps-overlay .gps-zoom, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-ld-bottom .gps-bottom > *, #gps-overlay .gps-ld-row2 > *, #gps-overlay .gps-ld-top, #gps-overlay .gps-markd";
const LBLS = "#gps-overlay .gps-miss-lbl span, #gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-arc-lbl, #gps-overlay .gps-green-lbl, #gps-overlay .gps-credit";
const OVERLAPS = "JSON.stringify((function(){ var vis = function (e) { if (e.offsetParent === null) return false; var cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return false; var b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1; };"
    + " var nm = function (e) { return (e.className && e.className.baseVal == null ? String(e.className) : e.tagName).split(' ').slice(0, 2).join('.'); };"
    + " var hit = function (a, b) { return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1; };"
    + " var C = Array.prototype.filter.call(document.querySelectorAll(\"" + CTRL + "\"), vis), L = Array.prototype.filter.call(document.querySelectorAll(\"" + LBLS + "\"), vis), out = [];"
    + " for (var i = 0; i < C.length; i++) for (var k = i + 1; k < C.length; k++) { if (C[i].contains(C[k]) || C[k].contains(C[i])) continue; if (hit(C[i].getBoundingClientRect(), C[k].getBoundingClientRect())) out.push(nm(C[i]) + ' x ' + nm(C[k])); }"
    + " L.forEach(function (l) { C.forEach(function (c) { if (c.contains(l) || l.contains(c)) return; if (hit(l.getBoundingClientRect(), c.getBoundingClientRect())) out.push('label ' + nm(l) + ' x ' + nm(c)); }); });"
    + " var W = innerWidth; C.forEach(function (c) { var b = c.getBoundingClientRect(); if (b.left < -1 || b.right > W + 1 || b.bottom > innerHeight + 1) out.push('off screen ' + nm(c)); });"
    + " return out; })())";
const ROW = "JSON.stringify((function(){ var row = document.querySelector('#gps-overlay .gps-ld-bottom .gps-bottom'); if (!row) return null;"
    + " var kids = Array.prototype.filter.call(row.children, function (e) { return e.offsetParent !== null && getComputedStyle(e).display !== 'none'; });"
    + " var bar = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-ld-bottom > .gps-mark-shot, #gps-overlay .gps-mark-shot'), function (e) { return e.offsetParent !== null && !e.closest('.gps-ld-bottom .gps-bottom'); }).length;"
    + " return { kids: kids.map(function (e) { var b = e.getBoundingClientRect(); return { c: String(e.className).split(' ')[0], l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, text: e.textContent.replace(/\\s+/g, ' ').trim() }; }), bar: bar, rowW: row.getBoundingClientRect().width,"
    + " ms: (function(){ var m = document.querySelector('#gps-overlay .gps-mark-shot'); return m ? { ico: (m.querySelector('.gps-ico') || {}).textContent || null, cap: (m.querySelector('.gps-cap') || {}).textContent || null, title: m.getAttribute('title') } : null; })() }; })())";

for (const vp of VPS) {
    test('091 Mark button + zoom at ' + vp.n + ' ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded091')) { sessionStorage.setItem('seeded091', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Mark Test Golf Club', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Phoenix', state: 'AZ' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: { width: vp.width, height: vp.height }, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome091-' + vp.n + '-' + n + '.png')); } };
        const moveTo = async (p) => { await ev('__moveTo(' + p[0] + ',' + p[1] + ')'); await sleep(2500); };
        const zn = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.zoomNow())'));
        const near = (a, b) => Math.abs(a - b) < 0.05;
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map ' + JSON.stringify(j.consoleErrors.slice(0, 5)) + ' ' + await ev("JSON.stringify({ m: !!window.HardPanGps && HardPanGps.isMounted(), s: window.HardPanGps && HardPanGps.side(), r: !!document.querySelector('#gps-overlay .gps-map[data-ready]') })"));
            await sleep(1500);
            // 1 - THE ZOOM: hole 1 opens on 2x (one zoom level over the full hole), on the hole.
            let z = await zn();
            assert.equal(z.step, 0); assert.equal(z.x, 2, 'opens at 2x ' + JSON.stringify(z));
            assert.ok(near(z.zoom, Math.min(z.full + 1, z.max)), '2x = the full hole + 1 zoom level (never past the imagery) ' + JSON.stringify(z));
            assert.equal(z.view, 'hole');
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)), [], 'no overlaps on the hole view (zoom button showing)');
            assert.ok(await ev("document.querySelector('#gps-overlay .gps-zoom').offsetParent !== null"), 'the zoom button shows on the hole view');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-zoom').getAttribute('data-zoom')"), '2x');
            let hc = JSON.parse(await ev('JSON.stringify(HardPanGps.holeCheck())'));
            assert.equal(hc.teeIn, true, 'full frame: tee'); assert.equal(hc.greenIn, true, 'full frame: green'); assert.equal(hc.centerOnHole, true, 'the 2x view is on the hole');
            assert.equal(hc.zoomX, 2);
            // holeCheck put the map back where it was.
            const z1 = await zn(); assert.ok(near(z1.zoom, z.zoom), 'holeCheck leaves the view alone');
            // Negative control (the course check's new rule): a centre 1 km off the hole fails; one on the line passes.
            const off = G.destination(TEE, 270, 1000), onl = G.destination(TEE, 0, 160);
            assert.equal(await ev('HardPanGps.viewCenterOnHole(' + JSON.stringify(off) + ',' + JSON.stringify(TEE) + ',' + JSON.stringify(MID) + ')'), false, 'off the hole: FAIL');
            assert.equal(await ev('HardPanGps.viewCenterOnHole(' + JSON.stringify(onl) + ',' + JSON.stringify(TEE) + ',' + JSON.stringify(MID) + ')'), true, 'on the hole: pass');
            await shot('1-hole-opens-2x');
            // Tap: 4x (one step closer). Tap: the full hole. Tap: 2x again.
            await ev("document.querySelector('#gps-overlay .gps-zoom').click()"); await sleep(600);
            z = await zn(); assert.equal(z.x, 4, 'tap 1 = 4x ' + JSON.stringify(z)); assert.ok(near(z.zoom, Math.min(z.full + 2, z.max)), 'one step closer (never past the imagery) ' + JSON.stringify(z));
            assert.ok(z.zoom >= z1.zoom - 0.01, 'never further out');
            console.log('# 091 zoom levels ' + vp.n + ': full ' + z.full.toFixed(2) + ', 2x ' + z1.zoom.toFixed(2) + ', 4x ' + z.zoom.toFixed(2) + ', max ' + z.max);
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)), [], 'no overlaps at 4x');
            assert.equal(await ev("document.querySelector('#gps-overlay .gps-zoom').getAttribute('aria-label')"), 'Back to the full hole');
            await shot('2-zoom-4x');
            await ev("document.querySelector('#gps-overlay .gps-zoom').click()"); await sleep(600);
            z = await zn(); assert.equal(z.x, 1, 'tap 2 = the full hole'); assert.ok(near(z.zoom, z.full), 'the full hole frame ' + JSON.stringify(z));
            hc = JSON.parse(await ev('JSON.stringify(HardPanGps.holeCheck())')); assert.equal(hc.viewTeeIn, true); assert.equal(hc.viewGreenIn, true, 'full hole: tee + green on screen');
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)), [], 'no overlaps on the full hole');
            await shot('3-zoom-full-hole');
            await ev("document.querySelector('#gps-overlay .gps-zoom').click()"); await sleep(600);
            z = await zn(); assert.equal(z.x, 2, 'tap 3 = 2x again'); assert.equal(z.step, 0);
            // Recenter = the 2x default; a new hole = the 2x default.
            await ev("document.querySelector('#gps-overlay .gps-zoom').click()"); await sleep(400);
            await ev("document.querySelector('#gps-overlay .gps-leftrow .gps-recenter').click()"); await sleep(800);
            z = await zn(); assert.equal(z.x, 2, 'Recenter = 2x');
            await ev('HardPanGps.goHole(2)'); await sleep(2000);
            z = await zn(); assert.equal(z.x, 2, 'hole 2 opens at 2x'); assert.equal(JSON.parse(await ev('JSON.stringify(HardPanGps.holeCheck())')).centerOnHole, true);
            await ev('HardPanGps.goHole(1)'); await sleep(2000);
            // 2 - My miss ON, 168 out: the 089 chips + the plays-like pill + Recenter + zoom + the row.
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(800);
            await ev("document.querySelector('#gps-overlay [data-ts-sw=mymiss]').click()");
            await ev("document.querySelector('#gps-overlay .gps-tools').click()"); await sleep(1500);
            await moveTo(out(168));
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips && n.chips.list.length === 2); })()", 8000), 'two chips');
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-ld-plays') && document.querySelector('#gps-overlay .gps-ld-plays').offsetParent !== null", 6000), 'the plays-like pill');
            await sleep(1200);
            // THE ROW: Card | Enter score | Mark.
            const R = JSON.parse(await ev(ROW));
            assert.ok(R, 'the row');
            assert.deepEqual(R.kids.map((k) => k.c), ['gps-side-bets', 'gps-scorebox', 'gps-mark-shot'], 'Card | Enter score | Mark: ' + JSON.stringify(R.kids));
            const [card, score, mark] = R.kids;
            assert.ok(Math.abs(mark.w - card.w) <= 1 && Math.abs(mark.h - card.h) <= 1, 'Mark = Card\'s size ' + JSON.stringify([card, mark]));
            assert.ok(Math.abs((score.l - card.r) - (mark.l - score.r)) <= 1, 'the same gap both sides ' + (score.l - card.r) + ' / ' + (mark.l - score.r));
            assert.ok(score.l - card.r >= 6, 'a gap');
            assert.ok(Math.abs(mark.t - card.t) <= 1, 'one row');
            assert.equal(R.bar, 0, 'no full-width Mark shot bar');
            assert.equal(R.ms.ico, '\u25CE'); assert.equal(R.ms.cap, 'Mark');
            assert.ok(/Mark shot/.test(R.ms.title || ''), 'the full label as its title: ' + R.ms.title);
            assert.ok(score.w >= 150, 'Enter score keeps room: ' + score.w);
            // NOTHING OVERLAPS.
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)), [], 'no overlaps (chips, Recenter, pill, zoom, rail, labels, row)');
            assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'), 'no sideways scroll');
            await shot('4-row-chips-pill');
            // 3 - MARK opens Mark shot, as the bar did: tap the club-down chip (089) -> Mark -> "Which club?" with it on.
            const m = JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
            const D = m.chips.list.find((c) => c.club !== m.chips.app).club;
            await ev("document.querySelector('#gps-overlay .gps-miss-chip[data-miss-chip=\"" + D + "\"]').click()"); await sleep(800);
            await ev("document.querySelector('#gps-overlay .gps-ld-bottom .gps-bottom .gps-mark-shot').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"" + D + "\"].on')", 8000), 'Mark opens Mark shot with the tapped club: ' + await ev("(document.querySelector('#gps-overlay .gps-bagask')||{}).innerText"));
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)).filter((x) => !/bagask/.test(x)), [], 'no overlaps with Mark shot open');
            await shot('5-mark-open');
            // Walk 30 yds: Mark shows the live yards (what the bar's "📍 30 yds" said), the title the full label.
            await moveTo(out(138));
            assert.ok(await until("/^\\d+ yds$/.test((document.querySelector('#gps-overlay .gps-mark-shot .gps-cap')||{}).textContent||'')", 8000), 'the live yards: ' + await ev("document.querySelector('#gps-overlay .gps-mark-shot').textContent"));
            assert.ok(/^\u25CE \d+ yds$/.test(await ev("document.querySelector('#gps-overlay .gps-mark-shot').getAttribute('title')")));
            assert.deepEqual(JSON.parse(await ev(OVERLAPS)).filter((x) => !/bagask/.test(x)), [], 'no overlaps (live yards)');
            // Nothing written anywhere but this phone.
            assert.doesNotMatch(await ev("JSON.stringify(window.__WRITES || [])"), /shotlog|zoom|mark/i);
        } finally { await j.close(); }
    });
}
