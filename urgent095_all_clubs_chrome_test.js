// 095 (Manny, Oct 28) - THE PAR 3 CLUB SWITCHER STEPS THROUGH EVERY CLUB IN MY BAG, IN REAL CHROME (375x667 SE,
// 440x956 Pro Max). Streamsong Red #8 (094's test geometry from the bundled OSM extract), the golfer 114 yds from the
// middle (a live fix). ‹ › step through ALL 12 clubs (LW .. Dr), shortest to longest, both ways; the end arrows dim only
// at LW and Dr; the oval and the Plays-like pill follow each club; off the green the text says where it lands
// ("LW · 8 short of the front", "9i · 10 past the back"); on the green as today ("SW · middle −7"). The default = the
// club closest to the target; a dragged target re-picks it, but 095b keeps a tapped / stepped club (reset on the next
// hole / shot); the on-green numbers follow the target. The
// middle tap still shows the My miss card. No overlaps (the pill must fit "LW · .. short of the front" on the SE).
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-arcs-plan.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
global.window = global; require('./gps-geo.js');
const G = window.HardPanGeo, Y = G.M_PER_YD;
const CODE = 'ALL095', KEY = 'allclubs095_test', ID = '990000000000000095';
const P = (p) => [Number(p[0].toFixed(7)), Number(p[1].toFixed(7))];

// Streamsong Red #6 / #8 from the bundled OSM extract: the hole line's first point (tee) and the green polygon's centre.
const OSM = JSON.parse(fs.readFileSync(path.join(__dirname, 'gps-osm', 'streamsong_red_blue.json'), 'utf8')).elements;
const GREENS = OSM.filter((e) => e.tags && e.tags.golf === 'green' && e.geometry);
const REAL = {};
[[6, 846920423, [156, 186, 215]], [8, 846930767, [79, 101, 122]]].forEach(([n, id, fcb]) => {
    const w = OSM.find((e) => e.id === id), g = w.geometry, tee = [g[0].lat, g[0].lon], end = [g[g.length - 1].lat, g[g.length - 1].lon];
    const ring = GREENS.map((x) => x.geometry.map((p) => [p.lat, p.lon])).find((r) => G.pointInRing(end, r));
    const cen = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
    const brg = G.bearingDeg(tee, cen);
    REAL[n] = { tee: P(tee), brg, f: P(G.destination(tee, brg, fcb[0] * Y)), c: P(G.destination(tee, brg, fcb[1] * Y)), b: P(G.destination(tee, brg, fcb[2] * Y)) };
});
const T0 = [27.676, -81.95];
const h = {};
for (let n = 1; n <= 18; n++) {
    if (REAL[n]) { h[n] = { g: { f: REAL[n].f, c: REAL[n].c, b: REAL[n].b }, t: { b: REAL[n].tee } }; continue; }
    const t = G.destination(T0, 180, 600 * n); h[n] = { g: { c: P(G.destination(t, 0, 350 * Y)) }, t: { b: P(t) } };
}
const NAME = 'Streamsong Resort (095 test geometry)';
const GAPI = { v: 1, built: 'test', links: { [KEY]: ID }, courses: { [ID]: { id: ID, club: NAME, course: 'Red', city: 'Streamsong', state: 'FL', lat: REAL[6].tee[0], lng: REAL[6].tee[1], holes: 18, h } } };
const CD = makeCourseData(18).map((x, i) => Object.assign({}, x, (i === 5 || i === 7) ? { par: 3 } : {}));
const round = () => { const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Golfer', 'Test Bravo'], courseData: CD,
    overrides: { activeCourseKey: KEY, courseName: NAME, eventName: 'Test 095 all clubs', groupSizeOverrides: { 0: 2 } } }); r.additionalGames = {}; r.additionalGameInstances = {}; return r; };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:false,live:false,golfapiFile:'gps-golfapi-test.js',devPro:true,weatherkit:false});}});})();";
// The golfer 114 yds short of the green's middle on #8's line (a live fix, moved with __moveTo). Stand-in only.
const R8 = REAL[8], AT = P(G.destination(R8.c, R8.brg + 180, 114 * Y));
const GEO = "(function(){ var cur = { lat: " + AT[0] + ", lng: " + AT[1] + " }, live = {}, n = 1; window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 3 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const MAPS = "(function(){ var real; window.__maps = []; Object.defineProperty(window, 'maplibregl', { configurable: true, get: function () { return real; }, set: function (v) { if (v && v.Map && !v.__w) { var M = v.Map; var Wm = function (o) { var m = new M(o); window.__maps.push(m); return m; }; Wm.prototype = M.prototype; try { v.Map = Wm; } catch (e) {} v.__w = 1; } real = v; } }); })();";
const MB = { LW: 84, SW: 107, GW: 121, PW: 133, '9i': 145, '8i': 168, '7i': 180, '6i': 192, '5i': 208, Hy: 220, '3w': 235, Dr: 260 };
const MP = require('./gps-miss-pattern.js');
const ALL = ['LW', 'SW', 'GW', 'PW', '9i', '8i', '7i', '6i', '5i', 'Hy', '3w', 'Dr'];
const BAG = { v: 1, golfers: { 'n:test golfer': { shots: {}, set: MB, setupDone: true } } };
const SEED = "(function(){ var now = Date.now(), w = JSON.stringify({ at: now + 3600e3, src: 'weatherkit', obsAt: now, mph: 0, gustMph: null, toDeg: 180, fromDeg: 0, tempF: 70 });"
    + " ['" + KEY + "', 'gapi_" + ID + "'].forEach(function (k) { localStorage.setItem('hardpan_wind_v1_' + k, w); });"
    + " localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(JSON.stringify(BAG)) + "); localStorage.setItem('hardpan_mymiss_v1', JSON.stringify({ 'n:test golfer': true, 'Test Golfer': true }));"
    + " localStorage.setItem('hardpan_gps_arcs_v1', JSON.stringify({ 'n:test golfer': 1, 'Test Golfer': 1 })); })();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS_095 || '';
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


for (const vp of [{ width: 375, height: 667 }, { width: 440, height: 956 }]) {
test('095 par 3 switcher steps through every club - Streamsong Red #8 at 114, ' + vp.width + 'x' + vp.height, { timeout: 500000 }, async () => {
    const pid = (round().players[0] || {}).id;
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO + MAPS + 'window.HardPanGolfApi = ' + JSON.stringify(GAPI) + ';'
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','" + pid + "');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}"
        + "if (!sessionStorage.getItem('seeded095')) { sessionStorage.setItem('seeded095', '1'); " + SEED + " }";
    const j = await openJourney({ db: { events: { [CODE]: round() }, global_courses: { [KEY]: { name: NAME, data: CD, location: { latitude: REAL[6].tee[0], longitude: REAL[6].tee[1], city: 'Streamsong', state: 'FL' } } }, trips: {}, organizers: {}, tournaments: {} },
        viewport: vp, webgl: true, preScript: PRE, blockUrls: ['*nationalmap.gov*', '*arcgis*', '*googleapis*', '*weather.gov*'] });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(900); await j.shot(path.join(SHOTS, 'chrome095-' + vp.width + 'x' + vp.height + '-' + n + '.png')); } };
    const MAP = 'window.__maps[window.__maps.length - 1]';
    const sw = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missSwitch())'));
    const now = async () => JSON.parse(await ev('JSON.stringify(HardPanGps.missNow())'));
    const click = (q) => ev("(function(){ var b = document.querySelector('#gps-overlay " + q + "'); if (!b) return 0; b.click(); return 1; })()");
    const drag = async (pt) => {
        const xy = JSON.parse(await ev("(function(){ var m = " + MAP + ", t = HardPanGps.target(), r = m.getContainer().getBoundingClientRect(), a = m.project([t[1], t[0]]), b = m.project([" + pt[1] + "," + pt[0] + "]);"
            + " return JSON.stringify({ x0: r.left + a.x, y0: r.top + a.y, x1: r.left + b.x, y1: r.top + b.y }); })()"));
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(xy.x0), y: Math.round(xy.y0) });
        await j.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(xy.x0), y: Math.round(xy.y0), button: 'left', clickCount: 1 });
        for (let i = 1; i <= 10; i++) await j.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(xy.x0 + (xy.x1 - xy.x0) * i / 10), y: Math.round(xy.y0 + (xy.y1 - xy.y0) * i / 10), button: 'left', buttons: 1 });
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(xy.x1), y: Math.round(xy.y1), button: 'left', clickCount: 1 });
        await sleep(1500);
    };
    const tips = "(function(){ ['.hpf-hint-x', '#gps-overlay .gps-elevnote-ok'].forEach(function (q) { var b = document.querySelector(q); if (b && b.offsetParent !== null) b.click(); }); return 1; })()";
    const fails = [], check = (ok, msg) => { if (!ok) fails.push(msg); };
    const checkOv = async (tag) => { const ov = JSON.parse(await ev(OVERLAPS)); if (ov.hits.length) fails.push(tag + ': ' + JSON.stringify(ov.hits)); };
    // The club closest to the target from the chips' own numbers (|delta|).
    const closest = (n) => n.chips.list.slice().sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
    try {
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
        await ev("(function(){ if (HardPanGps.side() !== 'gps') { var b = document.querySelector('#hp-card-bet [data-hp-bar=gps]'); if (b) b.click(); } return 1; })()");
        assert.ok(await until("HardPanGps.isMounted() && HardPanGps.side() === 'gps' && !!document.querySelector('#gps-overlay .gps-map[data-ready]')", 25000), 'the map');
        assert.ok(await until('!!window.HardPanMissPattern', 15000), 'My miss loaded');
        await ev(tips); await sleep(800);
        await ev('HardPanGps.goHole(8)'); await ev('__moveTo(' + AT[0] + ',' + AT[1] + ')'); await sleep(3000); await ev(tips);
        assert.ok(await until("(function(){ var s = HardPanGps.missSwitch(); return !!(s && s.on); })()", 10000), 'the switcher shows: ' + JSON.stringify(await sw()));
        await sleep(800);
        let s = await sw(), n = await now();
        assert.deepEqual(s.list, ALL, 'every club in My bag, shortest to longest');
        assert.equal(s.fromTee, false, 'a live fix (114 to the middle)');
        const def0 = closest(n).club;
        assert.equal(s.sel, def0, 'default = the club closest to the target: ' + JSON.stringify(n.chips.list.map((x) => x.club + ' ' + x.delta.toFixed(1))));
        assert.ok(['SW', 'GW'].includes(def0), 'SW / GW around 114: ' + def0);
        await shot('0-default'); await checkOv('default');
        // ‹ down to LW: the ‹ end dims only there.
        const texts = {};
        for (let k = 0; k < 12 && s.sel !== 'LW'; k++) { check(!s.lessOff, '‹ dimmed before LW at ' + s.sel); await click('.gps-miss-less'); await sleep(600); s = await sw(); }
        assert.equal(s.sel, 'LW'); assert.equal(s.lessOff, true, '‹ dimmed at LW'); assert.equal(s.moreOff, false);
        await click('.gps-miss-less'); await sleep(400); assert.equal((await sw()).sel, 'LW', '‹ at LW does nothing');
        // › through EVERY club to Dr: the oval and the Plays-like pill follow each one.
        for (let k = 0; k < ALL.length; k++) {
            s = await sw(); n = await now();
            check(s.sel === ALL[k], 'step › ' + k + ': ' + s.sel + ' vs ' + ALL[k]);
            texts[s.sel] = s.text;
            check(n.oval && n.oval.club === s.sel, 'the oval follows ' + s.sel + ': ' + JSON.stringify(n.oval && n.oval.club));
            check(s.lessOff === (k === 0) && s.moreOff === (k === ALL.length - 1), 'arrows at ' + s.sel + ': ' + s.lessOff + '/' + s.moreOff);
            if (k === 0 || k === 4 || k === ALL.length - 1) { await checkOv('club ' + s.sel); await shot('1-' + s.sel); }
            if (k < ALL.length - 1) { await click('.gps-miss-more'); await sleep(600); }
        }
        assert.equal(s.sel, 'Dr'); assert.equal(s.moreOff, true, '› dimmed at Dr');
        assert.match(await ev("(document.querySelector('#gps-overlay .gps-ld-plays') || {}).textContent || ''"), /Dr/, 'the Plays-like pill follows to Dr');
        // The texts: off the green where it lands; on the green as today.
        assert.match(texts.LW, /^LW · \d+ short of the front$/, 'LW: ' + texts.LW);
        ['9i', '8i', '7i', '6i', '5i', 'Hy', '3W', 'Dr'].forEach((c) => { const t = texts[c === '3W' ? '3w' : c]; check(new RegExp('^' + c + ' · \\d+ past the back$').test(t), c + ': ' + t); });
        ['SW', 'GW'].forEach((c) => check(/^(SW|GW) · (front|middle|back)( [+−]\d+)?$/.test(texts[c]), c + ': ' + texts[c]));
        // ‹ back down the whole bag (both ways).
        for (let k = ALL.length - 1; k > 0; k--) { await click('.gps-miss-less'); await sleep(450); s = await sw(); check(s.sel === ALL[k - 1], 'step ‹ to ' + ALL[k - 1] + ': ' + s.sel); check(s.text === texts[s.sel], 'same text both ways ' + s.sel); }
        // The longest text fits on this phone: LW "N short of the front", no overlaps, on screen.
        assert.equal(s.sel, 'LW'); await checkOv('LW long text'); await shot('2-LW-long-text');
        // The middle tap: the My miss card, unchanged.
        await click('.gps-miss-mid'); await sleep(500); s = await sw();
        check(s.card && /My miss/.test(s.cardText), 'the card: ' + JSON.stringify(s.cardText));
        await click('.gps-miss-mid'); await sleep(300);
        // A tap on 7i, then the target dragged to the front: the default re-picks, every club's numbers follow.
        for (const c of ['SW', 'GW', 'PW', '9i', '8i', '7i']) { await click('.gps-miss-more'); await sleep(450); }
        assert.equal((await sw()).sel, '7i');
        const before = (await now()).chips.list.map((x) => x.club + ':' + x.delta.toFixed(1)).join(',');
        const onTxt = (n) => { const o = {}; n.chips.list.forEach((x) => { o[x.club] = MP.switchText(x.club === 'Dr' ? 'Dr' : x.club.replace(/w$/, 'W'), x.spot, 'yd', x.delta); }); return o; };
        const t0 = onTxt(await now());
        await drag(G.destination(R8.c, R8.brg + 180, 16 * Y));
        n = await now(); s = await sw();
        check(n.chips.list.map((x) => x.club + ':' + x.delta.toFixed(1)).join(',') !== before, 'every club follows the new target');
        // Manny: "zone + yards vs target" - the on-green numbers change with the drag; the off-green texts keep the edge form.
        const t1 = onTxt(n);
        check(s.text === t1[s.sel], 'the pill shows the new text: ' + s.text + ' vs ' + t1[s.sel]);
        ['SW', 'GW'].forEach((c) => { check(/^(SW|GW) · (front|middle|back)( [+−]\d+)?$/.test(t1[c]), c + ' on-green form: ' + t1[c]); check(t1[c] !== t0[c], c + ' on-green number follows the drag: ' + t0[c] + ' -> ' + t1[c]); });
        ['9i', '8i', '7i', 'Dr'].forEach((c) => check(/ past the back$/.test(t1[c]), c + ' keeps the edge form: ' + t1[c]));
        check(/ short of the front$/.test(t1.LW), 'LW keeps the edge form: ' + t1.LW);
        // 095b (Manny: "Keep my tapped club"): the tapped 7i STAYS after the drag; its text and oval follow the target.
        check(s.sel === '7i', 'drag after a tap keeps the tapped club 7i, got ' + s.sel);
        check(n.oval && n.oval.club === '7i', 'the oval stays 7i: ' + JSON.stringify(n.oval && n.oval.club));
        check(s.list.join() === ALL.join(), 'still every club after the drag');
        await shot('3-drag-front-kept-7i'); await checkOv('drag front');
        // Step to SW (on the green), drag to the back: SW is kept and its number follows the target.
        for (let k = 0; k < 12 && (await sw()).sel !== 'SW'; k++) { await click('.gps-miss-less'); await sleep(450); }
        assert.equal((await sw()).sel, 'SW');
        const swBefore = (await sw()).text;
        await drag(G.destination(R8.c, R8.brg, 16 * Y));
        n = await now(); s = await sw(); const t2 = onTxt(n);
        check(s.sel === 'SW', 'drag after a step keeps SW, got ' + s.sel);
        check(s.text === t2.SW && s.text !== swBefore, 'SW text follows the drag: ' + swBefore + ' -> ' + s.text);
        await shot('4-drag-back-kept-SW'); await checkOv('drag back');
        // The next hole: the tapped choice resets to the closest club (as 089).
        await ev('HardPanGps.goHole(9)'); await sleep(1500); await ev('HardPanGps.goHole(8)'); await sleep(2500);
        assert.ok(await until("(function(){ var s = HardPanGps.missSwitch(); return !!(s && s.on); })()", 10000), 'switcher back on #8');
        n = await now(); s = await sw();
        check(s.sel === closest(n).club, 'next hole: reset to the closest ' + closest(n).club + ', got ' + s.sel);
        // No tapped club: a drag re-picks the closest club (front, then back).
        await drag(G.destination(R8.c, R8.brg + 180, 16 * Y));
        n = await now(); s = await sw(); const selF = s.sel;
        check(s.sel === closest(n).club, 'no tap, front: re-picked to the closest ' + closest(n).club + ', got ' + s.sel);
        await drag(G.destination(R8.c, R8.brg, 16 * Y));
        n = await now(); s = await sw();
        check(s.sel === closest(n).club && s.sel !== selF, 'no tap, back: re-picked ' + selF + ' -> ' + s.sel + ' (closest ' + closest(n).club + ')');
        // The next shot (the golfer moves on more than 40 yds): a tapped club resets to the closest.
        for (let k = 0; k < 3; k++) { await click('.gps-miss-more'); await sleep(450); }
        const tapped = (await sw()).sel;
        const NEXT = P(G.destination(R8.c, R8.brg + 180, 160 * Y));
        await ev('__moveTo(' + NEXT[0] + ',' + NEXT[1] + ')'); await sleep(2500);
        assert.ok(await until("(function(){ var s = HardPanGps.missSwitch(); return !!(s && s.on); })()", 10000), 'switcher on at the next shot: ' + JSON.stringify(await now()));
        n = await now(); s = await sw();
        check(s.sel === closest(n).club, 'next shot: the tapped ' + tapped + ' reset to the closest ' + closest(n).club + ', got ' + s.sel);
        assert.deepEqual(fails, [], fails.join('\n'));
    } finally { await j.close(); }
});
}
