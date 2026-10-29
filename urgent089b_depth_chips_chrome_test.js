// 089b - MY MISS CLUB CHIPS ACROSS THE WHOLE GREEN DEPTH, IN REAL CHROME (430x932 and 375x667; Manny Oct 27).
// A made-up course (synthetic - no licensed data), par 3s from the tee with a LIVE fix, still air:
//   hole 1 "Streamsong Red #8"-shaped F 79 / C 101 / B 122 -> GW · back −1, SW · middle (default), LW · front +5;
//   hole 2 deep F 118 / C 140 / B 160 -> 4 chips; hole 3 shallow F 151 / C 157 / B 163 -> 1 chip;
//   hole 4 F 122 / C 135 / B 148 -> the default (PW, closest) is NOT the app's pick (9i): the pill + Mark shot follow it.
// Checks: labels, default, longest on top, tap moves oval / label / pill, nothing under the chips (091's Card |
// Enter score | Mark row, Recenter, pill, labels, bubbles, rail), the next hole resets, NO live fix -> 089's pair.
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
const CODE = 'DEP89B', KEY = 'depth089b_test', ID = '990000000000000189';
const TEE = [27.9200, -81.9100];
const P = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const Y = G.M_PER_YD;
// hole n: tee, green F / C / B along bearing 0 (yards from the tee).
const GREENS = { 1: [79, 101, 122], 2: [118, 140, 160], 3: [151, 157, 163], 4: [122, 135, 148] };
const h = {};
for (let n = 1; n <= 18; n++) {
    const t = G.destination(TEE, 90, 600 * (n - 1)); const g = GREENS[n] || [330, 340, 350];
    h[n] = { g: { f: P(G.destination(t, 0, g[0] * Y)), c: P(G.destination(t, 0, g[1] * Y)), b: P(G.destination(t, 0, g[2] * Y)) }, t: { b: P(t) } };
}
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: 'Preview Red (synthetic)', course: '', city: 'Bowling Green', state: 'FL', lat: TEE[0], lng: TEE[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, i < 4 ? { par: 3 } : {}));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Ben Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: 'Preview Red (synthetic)', eventName: 'Test 089b depth chips', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true});}});})();";
const GEO = "(function(){ var cur = { lat: " + TEE[0] + ", lng: " + TEE[1] + " }, live = {}, n = 1; window.__gpsStop = false; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { if (window.__gpsStop) return; ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MB = { LW: 84, SW: 104, GW: 121, PW: 133, '9i': 145, '8i': 157, '7i': 169, '6i': 181, '5i': 193, Hy: 205, '3w': 230, Dr: 260 };
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now, src: 'weatherkit', obsAt: now - 20 * 60000, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_089B || '';

for (const vp of [{ width: 430, height: 932 }, { width: 375, height: 667 }]) {
    test('089b My miss chips across the green depth at ' + vp.width + 'x' + vp.height, { timeout: 300000 }, async () => {
        const pid = (round().players[0] || {}).id;
        const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
            + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
            + "if (!sessionStorage.getItem('seeded089b')) { sessionStorage.setItem('seeded089b', '1'); " + SEED + " }";
        const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: 'Preview Red (synthetic)', data: CD, location: { latitude: TEE[0], longitude: TEE[1], city: 'Bowling Green', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
            viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
        const ev = (x) => j.evaluate(x);
        const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
        const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(1200); await j.shot(path.join(SHOTS, 'chrome089b-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
        const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
        // 093 (Manny's approved change): on a par 3 the stacked chips are ONE switcher pill and the My miss label + note
        // left the map for a card (tap the pill's middle). These helpers read the same things through the switcher.
        const swOn = async () => !!(await ev("(function(){ var s = HardPanGps.missSwitch && HardPanGps.missSwitch(); return !!(s && s.on); })()"));
        const lbl = async () => {
            if (!(await swOn())) return JSON.parse(await ev('JSON.stringify(HardPanGps.missLbl())'));
            await ev("document.querySelector('#gps-overlay .gps-miss-mid').click()"); await sleep(250);
            const c = JSON.parse(await ev("JSON.stringify((function(){ var c = document.querySelector('#gps-overlay .gps-miss-card'); if (!c || c.style.display === 'none') return null; var a = c.getBoundingClientRect(), hits = [];"
                + " Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay .gps-ld-rail > *, #gps-overlay .gps-ld-plays, #gps-overlay .gps-ld-top, #gps-overlay .gps-ld-bottom, #gps-overlay .gps-miss-pill, #gps-overlay .gps-miss-chips-from, #gps-overlay .gps-recenter'), function (e) { if (e.offsetParent === null) return; var q = e.getBoundingClientRect(); if (Math.min(a.right, q.right) - Math.max(a.left, q.left) > 0.5 && Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top) > 0.5) hits.push(String(e.className).split(' ')[0]); });"
                + " return { text: (c.querySelector('b') || {}).textContent || '', note: (c.querySelector('span') || {}).textContent || '', noteShown: !!c.querySelector('span'), hits: hits, card: true }; })())"));
            await ev("document.querySelector('#gps-overlay .gps-miss-mid').click()"); await sleep(250);
            return c;
        };
        const pill = () => ev("(document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || ''");
        const tap0 = (c) => ev("(function(){ var b = document.querySelector('#gps-overlay .gps-miss-chip[data-miss-chip=\"" + c + "\"]'); if (!b) return false; b.click(); return true; })()");
        let chips = async () => JSON.parse(await ev("JSON.stringify(Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip'), function (e) { return e.offsetParent !== null; }).map(function (e) { var b = e.getBoundingClientRect(); return { club: e.getAttribute('data-miss-chip'), text: e.textContent.replace(/\\s+/g, ' ').trim(), on: e.classList.contains('gps-miss-chip-on'), t: b.top, b: b.bottom, h: b.height }; }))"));
        // 093: on the switcher, "tapping a chip" = stepping the arrows to that club.
        const sw = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missSwitch())'));
        const step = async (c) => { for (let k = 0; k < 20; k++) {   // 095: the switcher holds every club in My bag (up to 14)
            const s = await sw(); if (s.sel === c) return true; const i = s.list.indexOf(c), at = s.list.indexOf(s.sel); if (i < 0) return false; await ev("document.querySelector('#gps-overlay " + (i > at ? '.gps-miss-more' : '.gps-miss-less') + "').click()"); await sleep(400); } return (await sw()).sel === c; };
        const tap = async (c) => (await swOn()) ? step(c) : tap0(c);
        // 093: the chip labels on the switcher - every club's label, longest first, read by stepping through them, then back.
        const chips0 = chips;
        chips = async () => {
            if (!(await swOn())) return chips0();
            const s0 = await sw(), out = [];
            const r = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-miss-pill').getBoundingClientRect())"));
            for (const c of s0.list.slice().reverse()) { await step(c); const s = await sw(); out.push({ club: c, text: s.text.replace(/^\u2039|\u203a$/g, '').replace(/\s+/g, ' ').trim(), on: c === s0.sel, t: r.top, b: r.bottom, h: r.height }); }
            await step(s0.sel);
            // 095 (Manny's approved change): the switcher steps through EVERY club in My bag, and its text is now zone + yds
            // vs the target. 089b's chips (on the green + the nearest within 5 yds of the front / back) and their 089b labels
            // are read from the same chip data (missNow) with gps-miss-pattern's depthText; the pill itself: 093 / 095 tests.
            const nn = await now(), MP = require('./gps-miss-pattern.js'), sh = (c) => (c === 'Dr' ? 'Dr' : c.replace(/w$/, 'W'));
            const offS = (x) => (x.spot.zone === 'front' && x.spot.off < 0 ? -x.spot.off : null), offL = (x) => (x.spot.zone === 'back' && x.spot.off > 0 ? x.spot.off : null);
            const ss = nn.chips.list.filter((x) => offS(x) != null && offS(x) <= 5).sort((p, q) => offS(p) - offS(q))[0], ll = nn.chips.list.filter((x) => offL(x) != null && offL(x) <= 5).sort((p, q) => offL(p) - offL(q))[0];
            const keep = nn.chips.list.filter((x) => x.on).concat([ss, ll].filter(Boolean)).map((x) => x.club);
            return out.filter((x) => keep.includes(x.club)).map((x) => Object.assign({}, x, { text: MP.depthText(sh(x.club), nn.chips.list.find((y) => y.club === x.club).spot, 'yd') }));
        };
        // Anything visible under a chip: 091's bottom row (Card | Enter score | Mark), Recenter, the pill, labels, bubbles, rail, top row.
        const under = async () => JSON.parse(await ev("JSON.stringify((function(){ var vis = function (e) { return e && e.offsetParent !== null && e.getBoundingClientRect().width > 0; };"
            + " var cs = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-miss-chip, #gps-overlay .gps-miss-pill'), vis);"
            + " var os = Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-ld-bottom button, #gps-overlay .gps-ld-bottom .gps-mark-shot, #gps-overlay .gps-recenter, #gps-overlay .gps-ld-plays, #gps-overlay .gps-pill-to, #gps-overlay .gps-pill-on, #gps-overlay .gps-green-lbl, #gps-overlay .gps-miss-lbl span, #gps-overlay .gps-ring-lbl, #gps-overlay .gps-carry-lbl, #gps-overlay .gps-right > *, #gps-overlay .gps-ld-rail > *, #gps-overlay .gps-ld-top'), vis);"
            + " var out = []; cs.forEach(function (c) { var a = c.getBoundingClientRect(); os.forEach(function (e) { var q = e.getBoundingClientRect(); if (Math.min(a.right, q.right) - Math.max(a.left, q.left) > 0.5 && Math.min(a.bottom, q.bottom) - Math.max(a.top, q.top) > 0.5) out.push(c.textContent + ' x ' + e.className); }); }); return out; })())"));
        const atTee = async (n) => { await ev('HardPanGps.goHole(' + n + ')'); await ev('__moveTo(' + h[n].t.b[0] + ',' + h[n].t.b[1] + ')'); await sleep(3000);
            await ev("(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()"); await sleep(600);
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.oval && n.chips && n.chips.depth); })()", 8000), 'hole ' + n + ' depth chips: ' + JSON.stringify(await now())); };
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
            await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
            assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
            assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
            await sleep(1500);
            assert.equal(await ev("HardPanMissPattern.isOn('Test Golfer')"), true, 'My miss on (seeded)');
            // The one-time tips (Customize, the elevation note) dismissed, as on a phone after the first look.
            const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
            await ev(tips); await sleep(800);
            assert.ok(await ev("!!document.querySelector('#gps-overlay .gps-ld-bottom .gps-mark-shot')"), "091's bottom row Mark");
            // 1 - Streamsong-shaped: 3 chips, labelled, longest on top, SW the default, from the live fix.
            await atTee(1);
            let n = await now(), cs = await chips();
            assert.equal(n.chips.from, 'me', 'the live fix');
            assert.deepEqual(cs.map((c) => c.text), ['GW · back −1', 'SW · middle', 'LW · front +5']);
            assert.deepEqual(cs.map((c) => c.on), [false, true, false]);
            assert.equal(n.chips.def, 'SW'); assert.equal(n.oval.club, 'SW');
            cs.forEach((c) => assert.equal(Math.round(c.h), 40, '40 px tall'));
            if (!(await swOn())) for (let i = 1; i < cs.length; i++) assert.ok(cs[i - 1].b <= cs[i].t, 'stacked, no overlap');   // 093: one pill on a par 3
            const rc = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-recenter').getBoundingClientRect())"));
            assert.ok(cs[cs.length - 1].b <= rc.top - 9, 'above Recenter');
            assert.deepEqual(await under(), [], 'nothing under the chips');
            let L = await lbl();
            assert.deepEqual(L.hits, [], 'the My miss label clear');
            assert.equal(L.note, 'Sand wedge: 3 yds past the target · the middle'); assert.equal(L.noteShown, true, 'the note shows: ' + JSON.stringify(L));
            assert.match(await pill(), /· SW$/);
            await shot('1-streamsong');
            // Tap LW: oval, label, pill.
            assert.equal(await tap('LW'), true);
            assert.ok(await until("HardPanGps.missNow().oval.club === 'LW'", 5000));
            n = await now(); assert.equal(n.pick, 'LW'); assert.equal(n.chips.sel, 'LW');
            L = await lbl();
            assert.equal(L.text, 'My miss · Lob wedge');
            assert.equal(L.note, 'Lob wedge: 17 yds short of the target · 5 yds onto the front');
            assert.equal(L.noteShown, true, 'the one-line note shows (clear of the chips and the row): ' + JSON.stringify(L));
            assert.deepEqual(L.hits, [], 'the note clear of the chips / row');
            assert.ok(await until("/· LW$/.test((document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || '')", 4000), 'pill follows: ' + await pill());
            assert.deepEqual(await under(), [], 'nothing under the chips (LW)');
            // Tap SW (the default) back: the pick clears.
            await tap('SW'); await sleep(800); n = await now(); assert.equal(n.pick, (await swOn()) ? 'SW' : null, '095b: a step onto the default is kept on the par 3 switcher'); assert.equal(n.oval.club, 'SW');
            // 2 - deep green: 4 chips (max), the default 9i.
            await tap('LW'); await sleep(500);
            await atTee(2); n = await now(); cs = await chips();
            assert.equal(n.pick, null, 'the next hole resets the pick');
            assert.deepEqual(cs.map((c) => c.text), ['8i · back −3', '9i · middle +5', 'PW · middle −7', 'GW · front +3']);
            assert.equal(n.chips.def, '9i'); assert.deepEqual(cs.map((c) => c.on), [false, true, false, false]);
            assert.deepEqual(await under(), [], 'nothing under 4 chips');
            assert.ok(cs[cs.length - 1].b <= rc.top - 9, '4 chips above Recenter');
            await shot('2-four');
            // 3 - shallow green: 1 chip.
            await atTee(3); cs = await chips();
            assert.deepEqual(cs.map((c) => c.text), ['8i · middle']); assert.equal(cs[0].on, true);
            await shot('3-one');
            // 4 - the default (PW, closest to 135) is not the app's pick (9i): pill + Mark shot follow PW.
            await atTee(4); n = await now(); cs = await chips();
            assert.equal(n.chips.app, '9i'); assert.equal(n.chips.def, 'PW'); assert.equal(n.oval.club, 'PW');
            assert.deepEqual(cs.map((c) => c.text), ['9i · back −3', 'PW · middle', 'GW · front −1']);
            assert.ok(await until("/· PW$/.test((document.querySelector('#gps-overlay .gps-ld-pltext') || {}).textContent || '')", 4000), 'pill = the default chip: ' + await pill());
            // 5 - THE HELD FIX: the phone stops answering. After 10 s the app's fix is dropped (unchanged), but My miss
            // keeps the last fix while under 60 s old: still the depth chips from the golfer's spot.
            await atTee(4);
            await ev('window.__gpsStop = true'); await sleep(12500);
            // 101 gate: the app redraws on its 3 s stale tick (10-13 s after the last fix); wait for that tick BEFORE
            // appOrigin() (a test hook that drops the stale fix itself, without a redraw). Every assertion below is kept.
            await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.chips && n.chips.held); })()", 4000);
            assert.equal(await ev('HardPanGps.appOrigin()'), 'tee', 'the 10 s rule unchanged: the app measures from the tee');
            n = await now();
            assert.ok(n.chips && n.chips.depth && n.chips.from === 'me' && n.chips.held === true, '12 s: held ' + JSON.stringify(n.chips));
            const age = await ev('HardPanGps.missFixAge(0)');
            await ev('HardPanGps.missFixAge(' + (59000 - age) + ')'); await sleep(600);
            n = await now(); assert.ok(n.chips && n.chips.from === 'me' && n.chips.held, '59 s: still held ' + JSON.stringify(n.chips));
            assert.equal(await ev("!!document.querySelector('#gps-overlay .gps-miss-chips-from')"), false, 'no "from tee" while held');
            await ev('HardPanGps.missFixAge(2000)'); await sleep(800);
            n = await now();
            // 6 - NO fix: measured from the mapped tee, still the depth chips, labelled "from tee".
            assert.ok(n.oval && n.chips && n.chips.depth, '61 s: depth chips from the tee ' + JSON.stringify(n));
            assert.equal(n.chips.from, 'tee'); assert.equal(n.chips.held, false);
            assert.equal(await ev("(document.querySelector('#gps-overlay .gps-miss-chips-from') || {}).textContent || ''"), 'from tee');
            cs = await chips(); assert.deepEqual(cs.map((c) => c.text), ['9i · back −3', 'PW · middle', 'GW · front −1'], 'the same chips from the tee (on the tee)');
            await shot('4-from-tee');
            assert.deepEqual(await under(), [], 'nothing under the chips (from tee)');
            const ft = JSON.parse(await ev("JSON.stringify(document.querySelector('#gps-overlay .gps-miss-chips-from').getBoundingClientRect())"));
            assert.ok(ft.bottom <= cs[0].t, '"from tee" above the chips');
            assert.deepEqual((await lbl()).hits, [], 'the label clear (from tee)');
            // A live fix again: back to it, no "from tee".
            await ev('window.__gpsStop = false'); await ev('__moveTo(' + h[4].t.b[0] + ',' + h[4].t.b[1] + ')');
            assert.ok(await until("(function(){ var n = HardPanGps.missNow(); return !!(n && n.chips && n.chips.depth && n.chips.from === 'me' && !n.chips.held); })()", 8000), 'fix back: the live spot');
            assert.equal(await ev("!!document.querySelector('#gps-overlay .gps-miss-chips-from')"), false);
            // 7 - (hole 4, live fix) Mark shot pre-selects the default chip's club (PW, not the app's 9i).
            await ev("document.querySelector('#gps-overlay .gps-mark-shot').click()");
            assert.ok(await until("!!document.querySelector('#gps-overlay .gps-bagask [data-bag-club=\"PW\"].on')", 8000), 'Mark shot takes PW: ' + await ev("(document.querySelector('#gps-overlay .gps-bagask')||{}).innerText"));
            assert.ok(await until('(function(){ var n = HardPanGps.missNow(); return !!n && n.chips === null; })()', 6000), 'no chips while the shot is open: ' + JSON.stringify(await now()) + ' ' + await ev('JSON.stringify(HardPanGps.chipsOpen ? HardPanGps.chipsOpen() : null)'));
            // Nothing stored, nothing written.
            assert.doesNotMatch(await ev("JSON.stringify(window.__WRITES || [])"), /mymiss|missPick|depth/);
            assert.equal(await ev("Object.keys(localStorage).filter(function (k) { return /pick|chip|depth/i.test(k) && /miss/i.test(k); }).length"), 0);
        } finally { await j.close(); }
    });
}
