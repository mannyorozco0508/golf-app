// 093 - THE PAR 3 CLUB SWITCHER, IN REAL CHROME (375x667 SE, 402x874 17, 440x956 Pro Max). Manny picked A (Oct 28):
// on the par 3 GPS view ONE pill "‹ SW · middle ›" replaces the stacked My miss chips in the same lower-left spot.
// › = more club, ‹ = less club, the end arrows dimmed, a swipe does the same; the text keeps each chip's label; the
// "from tee" tag right above it (only from the tee); the default = the club closest to the target; the oval and the
// Plays-like pill follow it. The My miss label + note leaves the map; a tap on the pill's middle shows it as a small
// card for 4 s (tap again hides). The carry arc labels are dimmed to 40%. VoiceOver: "Club 7 iron, middle. Swipe or
// tap arrows to change." Approaches (par 4) keep the chip stack. 0 overlaps: the distance bubbles vs the pill / tag,
// and the pill / tag / card vs Recenter, the Card | Enter score | Mark row and the right rail - with a live fix, the
// held fix (30 s) and "from tee" (089c's cases). A made-up course (synthetic - no licensed data), still air.
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
const CODE = 'SWT093', KEY = 'switch093_test', ID = '990000000000000293';
const TEE = [27.9200, -81.9100];
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const Y = G.M_PER_YD;
// Hole 2 is Streamsong-like (F 79 / C 101 / B 122: LW / SW / GW); hole 3 a deep green (4 clubs); 1 and 4 as 089c.
const GREENS = { 1: [147, 158, 168], 2: [79, 101, 122], 3: [118, 140, 160], 4: [122, 135, 148] };
const HOLES = [1, 2, 3, 4];
const h = {};
for (let n = 1; n <= 18; n++) {
    const t = G.destination(TEE, 90, 600 * (n - 1)); const g = GREENS[n] || [330, 340, 350];
    h[n] = { g: { f: P(G.destination(t, 0, g[0] * Y)), c: P(G.destination(t, 0, g[1] * Y)), b: P(G.destination(t, 0, g[2] * Y)) }, t: { b: P(t) }, ap: P(G.destination(t, 0, 200 * Y)) };
}
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Preview Switch (synthetic)', course: '', city: 'Bowling Green', state: 'FL', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i < 4 ? { par: 3 } : { par: 4 }));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: 'Preview Switch (synthetic)', eventName: 'Test 093 switcher', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__gpsStop = false; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { if (window.__gpsStop) return; ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MB = { LW: 84, SW: 104, GW: 121, PW: 133, '9i': 145, '8i': 157, '7i': 169, '6i': 181, '5i': 193, Hy: 205, '3w': 230, Dr: 260 };
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true }));"
    + " localStorage.setItem('hardpan_gps_arcs_v1', JSON.stringify({ 'n:test golfer': 1, 'Test Golfer': 1 })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_093 || '';
// Overlaps (> 0 px): every distance bubble vs the pill, the "from tee" tag and the usual labels / row / Recenter (089c);
// and the pill, the tag and the note card vs Recenter, the row, the right rail, the top bar and the Plays-like pill.
const OVERLAPS = "JSON.stringify((function(){ var vis = function (e) { if (!e || e.offsetParent === null) return false; var s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };"
    + " var nm = function (e) { return String(e.className).split(' ')[0] + ':' + e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 24); };"
    + " var all = function (q) { return Array.prototype.filter.call(document.querySelectorAll(q), vis); };"
    + " var hit = function (a, q) { return Math.min(a.right, q.right) - Math.max(a.left, q.left) > 0 && Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top) > 0; };"
    + " var bs = all('#gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on');"
    + " var os = all('#gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chip, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-miss-lbl span, #gps-overlay .gps-green-lbl, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-carry-lbl, #gps-overlay .gps-arc-lbl, #gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-recenter');"
    + " var out = []; bs.forEach(function (p) { var a = p.getBoundingClientRect(); os.forEach(function (e) { if (hit(a, e.getBoundingClientRect())) out.push(nm(p) + ' x ' + nm(e)); }); });"
    + " var mine = all('#gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-miss-card');"
    + " var fixed = all('#gps-overlay .gps-recenter, #gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-right > *, #gps-overlay .gps-top, #gps-overlay .gps-ld-plays, #gps-overlay .gps-zoom');"
    + " mine.forEach(function (m) { var a = m.getBoundingClientRect(); fixed.forEach(function (e) { if (e.contains(m) || m.contains(e)) return; if (hit(a, e.getBoundingClientRect())) out.push(nm(m) + ' x ' + nm(e)); }); });"
    + " mine.forEach(function (m, i) { mine.forEach(function (k, j) { if (j > i && hit(m.getBoundingClientRect(), k.getBoundingClientRect())) out.push(nm(m) + ' x ' + nm(k)); }); });"
    + " var vw = document.documentElement.clientWidth; mine.forEach(function (m) { var a = m.getBoundingClientRect(); if (a.left < 0 || a.right > vw) out.push(nm(m) + ' off screen'); });"
    + " return { hits: out, bubbles: bs.length }; })())";

for (const vp of [{ width: 375, height: 667 }, { width: 402, height: 874 }, { width: 440, height: 956 }]) {
    test('093 par 3 club switcher at ' + vp.width + 'x' + vp.height, { timeout: 500000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded093')) { sessionStorage.setItem('seeded093', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Preview Switch (synthetic)', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Bowling Green', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome093-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const sw = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missSwitch())'));
        const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
        const overlaps = async () => JSON.parse(await ev(OVERLAPS));
        const click = (q) => ev("(function(){ var b = document.querySelector('#gps-overlay " + q + "'); if (!b) return 0; b.click(); return 1; })()");
        const rect = async (q) => JSON.parse(await ev("JSON.stringify((function(){ var e = document.querySelector('#gps-overlay " + q + "'); if (!e) return null; var b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; })())"));
        // A real mouse drag across the pill (pointer events): dx < 0 = a swipe left.
        const swipe = async (dx) => {
            const r = await rect('.gps-miss-pill .gps-miss-mid'); const x = (r.l + r.r) / 2, y = (r.t + r.b) / 2;
            await j.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
            for (let k = 1; k <= 6; k++) await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx * k / 6, y: y + 2, button: 'left', buttons: 1 });
            await j.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + 2, button: 'left', buttons: 0, clickCount: 1 });
            await sleep(700);
        };
        const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
        const fails = [];
        const checkOv = async (tag) => { const ov = await overlaps(); if (ov.hits.length) fails.push(tag + ': ' + JSON.stringify(ov.hits)); return ov; };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            assert.equal(await ev("HardPanMissPattern.isOn('Test Golfer')"), true, 'My miss on (seeded)');
            await ev(tips); await sleep(800);

            // ---- HOLE 2 (Streamsong-like): the switcher itself, with a live fix at the tee.
            await ev('HardPanGps.goHole(2)'); await ev('__moveTo(' + h[2].t.b[0] + ',' + h[2].t.b[1] + ')'); await sleep(3000); await ev(tips);
            // Plain DOM first (also the negative control on e194de29: the 3-chip stack, no pill).
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips); })()", 8000), 'My miss oval + chips');
            await sleep(800);
            const dom = JSON.parse(await ev("JSON.stringify({ chips: document.querySelectorAll('#gps-overlay .gps-miss-chip').length, pills: document.querySelectorAll('#gps-overlay .gps-miss-pill').length, lbl: !!document.querySelector('#gps-overlay .gps-miss-lbl') })"));
            assert.deepEqual(dom, { chips: 0, pills: 1, lbl: false }, 'par 3: one pill, no chip stack, the label off the map');
            assert.ok(await until("(function(){ var s = HardPanGps.missSwitch(); return !!(s && s.on); })()", 8000), 'the switcher shows: ' + JSON.stringify(await sw()));
            let s = await sw();
            // 095 (Manny, Oct 28): the switcher now steps through EVERY club in My bag, shortest first (was the 089b chips LW / SW / GW).
            assert.deepEqual(s.list, ['LW', 'SW', 'GW', 'PW', '9i', '8i', '7i', '6i', '5i', 'Hy', '3w', 'Dr'], 'every club in My bag, shortest first');
            assert.equal(s.sel, 'SW', 'default = the club closest to the target');
            assert.equal(s.text, 'SW · middle', 'the chip label');
            assert.equal(s.aria, 'Club Sand wedge, middle. Swipe or tap arrows to change.');
            assert.equal(s.lessOff, false); assert.equal(s.moreOff, false);
            assert.equal(s.fromTee, false, 'no "from tee" tag with a live fix');
            assert.equal(s.lblOnMap, false, 'the My miss label + note box left the map');
            assert.equal(s.dim, true);
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-miss-chip').length"), 0, 'no chip stack on a par 3');
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-miss-pill').length"), 1, 'one pill');
            // The same lower-left spot as the chips: 8 px into the row (16 px from the edge), 10 px above Recenter.
            const pr = await rect('.gps-miss-pill'), rc = await rect('.gps-leftrow .gps-recenter');
            assert.ok(Math.abs(pr.l - 16) <= 1, 'pill 16 px from the left edge: ' + JSON.stringify(pr));
            // 10 px above Recenter (the SE: lifted a little more only when it would touch the Plays-like pill).
            const tight = await ev("document.querySelector('#gps-overlay .gps-miss-chips').classList.contains('gps-miss-pill-tight')");
            assert.ok(rc && pr.b <= rc.t - 9 && (tight || pr.b >= rc.t - 11), 'pill 10 px above Recenter: ' + JSON.stringify([pr, rc, tight]));
            assert.equal(Math.round(pr.b - pr.t), 40, '40 px tall');
            // Carry arc labels dimmed (opacity .4), still there.
            const op = JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#gps-overlay .gps-carry-lbl'), function (e) { return getComputedStyle(e).opacity; }))"));
            assert.ok(op.length >= 1, 'carry labels drawn: ' + JSON.stringify(op));
            assert.ok(op.every((o) => Math.abs(Number(o) - 0.4) < 0.01), 'carry labels at 40%: ' + JSON.stringify(op));
            await checkOv('hole 2 live');
            await shot('2-live');
            // › more club: GW (the end: › dimmed); the oval and the Plays-like pill follow.
            await click('.gps-miss-more'); await sleep(700);
            s = await sw(); let m = await now();
            assert.equal(s.sel, 'GW'); assert.equal(s.text, 'GW · back +20', '095: zone + yds vs the target (121 vs 101)'); assert.equal(s.moreOff, false, '095: GW is no longer the end'); assert.equal(s.lessOff, false);
            assert.equal(m.oval.club, 'GW', 'the oval follows'); assert.equal(m.pick, 'GW');
            assert.match(await ev("(document.querySelector('#gps-overlay .gps-ld-plays') || {}).textContent || ''"), /GW/, 'the Plays-like pill follows');
            // 095: the › end is now the bag's longest club (Dr), dimmed there; › at the end does nothing; back to GW.
            for (let k = 0; k < 9; k++) { await click('.gps-miss-more'); await sleep(350); }
            s = await sw(); assert.equal(s.sel, 'Dr'); assert.equal(s.moreOff, true, '› dimmed at Dr');
            await click('.gps-miss-more'); await sleep(500);
            assert.equal((await sw()).sel, 'Dr', '› at the end does nothing');
            for (let k = 0; k < 9; k++) { await click('.gps-miss-less'); await sleep(350); }
            assert.equal((await sw()).sel, 'GW');
            // ‹ less club twice: LW (‹ dimmed).
            await click('.gps-miss-less'); await sleep(500); await click('.gps-miss-less'); await sleep(700);
            s = await sw(); m = await now();
            assert.equal(s.sel, 'LW'); assert.equal(s.text, 'LW · front −17', '095: zone + yds vs the target (84 vs 101)'); assert.equal(s.lessOff, true); assert.equal(s.moreOff, false);
            assert.equal(s.aria, 'Club Lob wedge, front minus 17. Swipe or tap arrows to change.');
            assert.equal(m.oval.club, 'LW');
            await click('.gps-miss-less'); await sleep(500);
            assert.equal((await sw()).sel, 'LW', '‹ at the end does nothing');
            // Swipe left = more club, swipe right = less club; a swipe does not open the card.
            await swipe(-70); s = await sw();
            assert.equal(s.sel, 'SW', 'swipe left: more club'); assert.equal(s.card, false, 'a swipe is not a tap');
            await swipe(-70); assert.equal((await sw()).sel, 'GW');
            await swipe(70); assert.equal((await sw()).sel, 'SW', 'swipe right: less club');
            await swipe(70); assert.equal((await sw()).sel, 'LW');
            await swipe(8); s = await sw(); assert.equal(s.sel, 'LW', 'a short drag is not a swipe');
            assert.equal(s.card, true, 'a short drag is a tap (the card)');
            await click('.gps-miss-mid'); await sleep(300); assert.equal((await sw()).card, false);
            // The note card: tap the middle - the label + note for 4 s; tap again hides it.
            await click('.gps-miss-mid'); await sleep(300);
            s = await sw(); m = await now();
            assert.equal(s.card, true, 'card shown');
            assert.ok(s.cardText.indexOf('My miss · Lob wedge') === 0 && m.note && s.cardText.indexOf(m.note) > 0, 'the label + the note: ' + JSON.stringify([s.cardText, m.note]));
            assert.match(m.note, /short of the target · 5 yds onto the front/);
            const cr = await rect('.gps-miss-card'), pr2 = await rect('.gps-miss-pill');
            assert.ok(cr.b <= pr2.t - 6, 'the card sits above the pill');
            await checkOv('hole 2 card');
            await shot('2-card');
            await sleep(4300);
            assert.equal((await sw()).card, false, 'gone after 4 s');
            await click('.gps-miss-mid'); await sleep(400);
            assert.equal((await sw()).card, true);
            await click('.gps-miss-mid'); await sleep(400);
            assert.equal((await sw()).card, false, 'tap again hides it');
            await checkOv('hole 2 after');

            // ---- HOLES 1-4: live fix, the held fix at 30 s and "from tee" (089c's bubble cases) - 0 overlaps.
            for (const n of HOLES) {
                await ev('window.__gpsStop = false');
                await ev('HardPanGps.goHole(' + n + ')'); await ev('__moveTo(' + h[n].t.b[0] + ',' + h[n].t.b[1] + ')'); await sleep(3000);
                await ev(tips); await sleep(600);
                assert.ok(await until("(function(){ var n = HardPanGps.missNow(), s = HardPanGps.missSwitch(); return !!(n && n.oval && n.chips && n.chips.from === 'me' && !n.chips.held && s.on); })()", 8000), 'hole ' + n + ' live: ' + JSON.stringify(await sw()));
                s = await sw(); m = await now();
                assert.equal(s.sel, m.chips.def, 'hole ' + n + ': the default');
                assert.equal(s.lessOff, s.list[0] === s.sel); assert.equal(s.moreOff, s.list[s.list.length - 1] === s.sel);
                await checkOv('hole ' + n + ' live');
                await ev('window.__gpsStop = true'); await sleep(12500);
                const age = await ev('HardPanGps.missFixAge(0)');
                await ev('HardPanGps.missFixAge(' + (30000 - age) + ')'); await sleep(1500);
                m = await now(); s = await sw();
                assert.ok(m.chips && m.chips.from === 'me' && m.chips.held === true && s.on && !s.fromTee, 'hole ' + n + ' held 30 s ' + JSON.stringify(s));
                let ov = await checkOv('hole ' + n + ' held 30 s');
                assert.ok(ov.bubbles > 0, 'a distance bubble shows');
                await shot(n + '-held30');
                await ev('HardPanGps.missFixAge(31000)'); await sleep(1500);
                m = await now(); s = await sw();
                assert.ok(m.chips && m.chips.from === 'tee' && s.on && s.fromTee, 'hole ' + n + ' from tee ' + JSON.stringify(s));
                const ft = await rect('.gps-miss-chips-from'), pp = await rect('.gps-miss-pill');
                assert.ok(ft.b <= pp.t && pp.t - ft.b <= 12 && Math.abs(ft.l - pp.l) <= 1, '"from tee" right above the pill ' + JSON.stringify([ft, pp]));
                await click('.gps-miss-mid'); await sleep(300);
                ov = await checkOv('hole ' + n + ' from tee (+ card)');
                assert.ok(ov.bubbles > 0, 'a distance bubble shows');
                await shot(n + '-fromtee');
                await click('.gps-miss-mid'); await sleep(300);
            }

            // ---- AN APPROACH (hole 5, par 4, 140 to the middle): the chip stack as today, the label on the map.
            await ev('window.__gpsStop = false');
            await ev('HardPanGps.goHole(5)'); await ev('__moveTo(' + h[5].ap[0] + ',' + h[5].ap[1] + ')'); await sleep(3500); await ev(tips);
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips); })()", 10000), 'approach chips ' + JSON.stringify(await now()));
            s = await sw();
            assert.equal(s.on, false, 'no switcher on an approach'); assert.equal(s.par3, false);
            assert.equal(s.dim, false, 'carry labels not dimmed on an approach');
            assert.ok(await ev("document.querySelectorAll('#gps-overlay .gps-miss-chip').length") >= 1, 'the chip stack');
            assert.equal(await ev("document.querySelectorAll('#gps-overlay .gps-miss-pill').length"), 0);
            assert.equal(s.lblOnMap, true, 'the My miss label stays on the map');
            await shot('5-approach');
            assert.deepEqual(fails, [], '0 overlaps');
        } finally { await j.close(); }
    });
}
