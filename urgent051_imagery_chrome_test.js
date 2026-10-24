// ============================================================================
// URGENT-051 - THE COURSE'S MAP PICTURE, IN REAL CHROME (WebGL), 393x852 and 375x667.
//
// A stand-in Esri on 127.0.0.1 (gps-config's esriTileUrl, as tools/gps-esri-cache-check.js does) and
// a stand-in USGS (the page's fetch for basemap.nationalmap.gov is sent to it) draw FLAT COLOURS, so
// the screenshot says which source is the picture:
//     Esri z<=19 GREEN   Esri z20-21 (close-up) BLUE   USGS ORANGE   Esri's placeholder GREY (never!)
// Every tile the stand-ins answer can be made to FAIL, or (close-up) to be the grey "Map data not yet
// available" card. A synthetic round on Caledonia (bundled greens), the course record course_gps/caledonia.
//
//   1. esri-closeup, real close-up tiles: zoomed past 20 the picture is BLUE; Esri credit.
//   2. esri-closeup, every close-up tile the PLACEHOLDER: GREEN (Esri z19), never grey; the layer goes off.
//   3. esri-closeup, close-up tiles FAIL (HTTP 500): GREEN.
//   4. esri-closeup, ALL Esri fails: ORANGE (USGS), the credit says USGS - never blank.
//   5. usgs chosen: ORANGE, the credit says USGS, and Esri was asked for NOTHING.
//   6. usgs chosen, USGS FAILS: GREEN (Esri) - never blank.
//   7. Fix the green (the organizer): "Map picture" -> three choices with a note each -> USGS: the map
//      changes at once, it is kept on the phone (no database write - the rule is not live), and the
//      NEXT round on the course opens on USGS.
//   8. PRIVACY: the pre-cache's USGS tiles are the same with the golfer at two places on the course,
//      it asks Esri for nothing (URGENT-064: Esri is never saved), and no request URL the page made
//      carries the golfer's position.
// Shots (when ~/Desktop/claude-code-reports/051 exists): 051/chrome/<n>-<what>.png.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no GPS round - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const OUT = path.join(os.homedir(), 'Desktop/claude-code-reports/051');
const SHOTS = path.join(OUT, 'chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- flat-colour PNG tiles, and a small PNG reader for the screenshots ----
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(fn) {
    const W = 256, raw = Buffer.alloc((W * 3 + 1) * W);
    for (let y = 0; y < W; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const c = fn(x, y); raw.set(c, y * (W * 3 + 1) + 1 + x * 3); } }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(W, 4); ih[8] = 8; ih[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COL = { GREEN: [40, 160, 60], BLUE: [40, 90, 220], ORANGE: [230, 140, 30], GREY: [204, 204, 204], BG: [29, 59, 42] };
const TILE = { GREEN: png(() => COL.GREEN), BLUE: png(() => COL.BLUE), ORANGE: png(() => COL.ORANGE),
    // Esri's card: flat #CCCCCC with white words across the middle.
    GREY: png((x, y) => (y > 110 && y < 146 && x > 50 && x < 206 && ((x >> 2) + (y >> 2)) % 3 === 0) ? [255, 255, 255] : COL.GREY) };
function readPng(buf) {
    let p = 8, w = 0, h = 0, ct = 0; const idat = [];
    while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + len);
        if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); p += 12 + len; }
    const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), st = w * bpp;
    for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)];
        for (let x = 0; x < st; x++) { const a = x >= bpp ? out[y * st + x - bpp] : 0, b = y ? out[(y - 1) * st + x] : 0, c = (x >= bpp && y) ? out[(y - 1) * st + x - bpp] : 0, v = raw[y * (st + 1) + 1 + x];
            let r; if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1); else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
            out[y * st + x] = r & 255; } }
    return { w, h, px: (x, y) => [out[(y * w + x) * bpp], out[(y * w + x) * bpp + 1], out[(y * w + x) * bpp + 2]] };
}
const nearest = (c) => Object.keys(COL).map((k) => [k, Math.abs(c[0] - COL[k][0]) + Math.abs(c[1] - COL[k][1]) + Math.abs(c[2] - COL[k][2])]).sort((a, b) => a[1] - b[1])[0];
// The picture's colour: a grid over the map's open middle band, each point to its nearest colour (or OTHER).
async function picture(j, name) {
    const r = await j.cdp('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.result.data, 'base64');
    if (name && fs.existsSync(OUT)) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), buf); }
    const im = readPng(buf), n = {};
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) {
        const x = Math.round(im.w * (0.12 + gx * 0.15)), y = Math.round(im.h * (0.30 + gy * 0.07));
        const [k, d] = nearest(im.px(x, y)); const key = d < 40 ? k : 'OTHER'; n[key] = (n[key] || 0) + 1;
    }
    return n;
}
const mostly = (n, k) => (n[k] || 0) >= 18;

// ---- the stand-ins ----
const state = { hi: 'real', esri: 'ok', usgs: 'ok', log: [] };
let ESRI = null, srv = null;
before(async () => {
    srv = http.createServer((req, res) => {
        state.log.push(req.url);
        const m = /^\/(esri|usgs)\/(\d+)\/(\d+)\/(\d+)/.exec(req.url);
        const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=86400', 'Content-Type': 'image/png' };
        if (!m) { res.writeHead(404, cors); return res.end(); }
        const z = Number(m[2]);
        if (m[1] === 'usgs') { if (state.usgs === 'fail') { res.writeHead(500, cors); return res.end(); } res.writeHead(200, cors); return res.end(TILE.ORANGE); }
        if (state.esri === 'fail') { res.writeHead(500, cors); return res.end(); }
        if (z <= 19) { res.writeHead(200, cors); return res.end(TILE.GREEN); }
        if (state.hi === 'fail') { res.writeHead(500, cors); return res.end(); }
        res.writeHead(200, cors); return res.end(state.hi === 'placeholder' ? TILE.GREY : TILE.BLUE);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    ESRI = 'http://127.0.0.1:' + srv.address().port;
});
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } if (srv) srv.close(); });

const ME = [33.4528, -79.1547];
const CFG = () => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true,esriKey:'CHECK',esriTileUrl:'" + ESRI + "/esri/{z}/{y}/{x}?token={key}'});}});})();";
// The page's fetch for USGS goes to the stand-in (the app's own hpusgs protocol calls fetch).
const USGS = () => "(function(){var f=window.fetch.bind(window);window.__fetched=[];window.fetch=function(u,i){var s=String(u&&u.url||u);window.__fetched.push(s);var m=/basemap\\.nationalmap\\.gov\\/.*\\/tile\\/(\\d+)\\/(\\d+)\\/(\\d+)/.exec(s);if(m)return f('" + ESRI + "/usgs/'+m[1]+'/'+m[2]+'/'+m[3],i);return f(u,i);};try{performance.setResourceTimingBufferSize(20000);}catch(e){}})();";
const GEO = (p) => "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:" + p[0] + ",longitude:" + p[1] + ",accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:" + p[0] + ",longitude:" + p[1] + ",accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const round = (code) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 051 Alpha', 'Test 051 Bravo'],
        overrides: { eventName: 'Test 051 imagery', activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club (Caledonia)', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(250); } return false; }
const attr = (j, a) => j.evaluate("(function(){var e=document.querySelector('#gps-overlay .gps-map');return e?e.getAttribute('" + a + "'):null;})()");
const now = async (j) => JSON.parse(await j.evaluate('JSON.stringify(HardPanGps.imagery.now())'));

async function open(code, o) {
    const opt = o || {};
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG() + USGS() + GEO(opt.at || ME)
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');localStorage.setItem('hardpan_round_side','gps|" + code + "');" + (opt.ls || '') + "}catch(e){}";
    const db = { events: { [code]: round(code) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {}, course_gps: opt.imagery ? { caledonia: { imagery: opt.imagery } } : {} };
    const j = await openJourney({ db, viewport: opt.viewport || { width: 393, height: 852 }, webgl: true, preScript: pre });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    assert.ok(await until(j, "!!window.HardPanGps && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-map[data-ready=\"1\"]')", 30000), code + ': the map is up');
    await sleep(1500);
    return j;
}
// Zoom in with the wheel over the map until z >= target (the golfer's pinch).
async function zoomTo(j, target) {
    // 064: up to 60 wheel steps (a loaded machine drops some), then wait for the close-up layer to have
    // answered at least once - its tiles now stream live (no 051 warm-up has them in the HTTP cache).
    for (let i = 0; i < 60; i++) {
        const z = Number(await attr(j, 'data-zoom'));
        if (z >= target) break;
        await j.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 196, y: 330, deltaX: 0, deltaY: -240 });
        await sleep(450);
    }
    await sleep(2500);
    const z = Number(await attr(j, 'data-zoom'));
    if (z >= 20) await until(j, "(function(){var s=HardPanGps.imagery.now();return !!s&&(s.hiLoads+s.hiMiss+s.hiPlaceholders>0||!!s.hiOff);})()", 20000);
    await sleep(1000);
    return z;
}
const credit = (j) => j.evaluate("(document.querySelector('#gps-overlay .gps-credit-txt')||{}).textContent||''");
const attrib = (j) => j.evaluate("(document.querySelector('#gps-overlay .maplibregl-ctrl-attrib')||{}).textContent||''");

for (const V of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    const tag = V.width + 'x' + V.height;
    test(tag + ' 1-3: Esri close-up - real tiles BLUE; placeholder or failing close-up tiles fall back to Esri z19 (GREEN), never grey', { timeout: 240000 }, async () => {
        state.esri = 'ok'; state.usgs = 'ok'; state.hi = 'real';
        let j = await open('T051A' + V.width, { imagery: 'esri-closeup', viewport: V });
        assert.equal(await attr(j, 'data-img-src'), 'esri-closeup', 'the course record set the picture');
        let z = await zoomTo(j, 20.4);
        assert.ok(z >= 20.3, 'zoomed past 20: ' + z);
        let n = await picture(j, tag + '-1-closeup-real');
        assert.ok(mostly(n, 'BLUE'), 'the close-up tiles are the picture: ' + JSON.stringify(n));
        assert.equal(await attr(j, 'data-esri-hi-max'), '21');
        assert.equal(await credit(j), 'Powered by Esri');
        assert.ok(/Powered by Esri/.test(await attrib(j)) && /Vantor/.test(await attrib(j)), 'the Esri credit, on the map: ' + await attrib(j));
        await j.close();

        state.hi = 'placeholder';
        j = await open('T051B' + V.width, { imagery: 'esri-closeup', viewport: V });
        z = await zoomTo(j, 20.4);
        n = await picture(j, tag + '-2-closeup-placeholder');
        assert.ok(mostly(n, 'GREEN') && !n.GREY && !n.BG, 'placeholder -> Esri z19 under it, never the grey card: ' + JSON.stringify(n));
        const s = await now(j);
        assert.ok(s.hiPlaceholders > 0 && s.hiLoads === 0, 'the placeholders were recognised: ' + JSON.stringify(s));
        assert.ok(await until(j, "HardPanGps.imagery.now().hiOff === 'missing'", 8000), 'a course with none: the close-up layer goes off, quietly');
        await j.close();

        state.hi = 'fail';
        j = await open('T051C' + V.width, { imagery: 'esri-closeup', viewport: V });
        await zoomTo(j, 20.4);
        n = await picture(j, tag + '-3-closeup-fail');
        assert.ok(mostly(n, 'GREEN') && !n.BG, 'failing close-up tiles -> Esri z19: ' + JSON.stringify(n));
        assert.ok(!(await now(j)).esriFailed, 'close-up misses never drop Esri itself');
        await j.close();
    });

    test(tag + ' 4-6: all Esri failing -> USGS; USGS chosen -> USGS and no Esri request; USGS failing -> Esri', { timeout: 240000 }, async () => {
        state.esri = 'fail'; state.usgs = 'ok'; state.hi = 'real';
        let j = await open('T051D' + V.width, { imagery: 'esri-closeup', viewport: V });
        assert.ok(await until(j, "HardPanGps.imagery.now().esriFailed", 15000), 'Esri dropped after errors in a row');
        await sleep(2500);
        let n = await picture(j, tag + '-4-esri-down-usgs');
        assert.ok(mostly(n, 'ORANGE') && !n.BG, 'Esri down -> USGS, never blank: ' + JSON.stringify(n));
        assert.equal(await credit(j), 'USGS');
        await j.close();

        state.esri = 'ok';
        const before = state.log.filter((u) => /^\/esri\//.test(u)).length;
        j = await open('T051E' + V.width, { imagery: 'usgs', viewport: V });
        n = await picture(j, tag + '-5-usgs-chosen');
        assert.ok(mostly(n, 'ORANGE'), 'USGS is the picture: ' + JSON.stringify(n));
        assert.equal(await credit(j), 'USGS');
        assert.ok(/USDA, USGS The National Map: Orthoimagery/.test(await attrib(j)) && !/Powered by Esri/.test(await attrib(j)), 'the USGS credit only: ' + await attrib(j));
        assert.equal(await attr(j, 'data-max-zoom'), '18', 'USGS: the map stops at z18');
        assert.equal(state.log.filter((u) => /^\/esri\//.test(u)).length, before, 'Esri was asked for nothing while USGS is the picture');
        await j.close();

        state.usgs = 'fail';
        j = await open('T051F' + V.width, { imagery: 'usgs', viewport: V });
        assert.ok(await until(j, "HardPanGps.imagery.now().usgsFailed", 20000), 'USGS failing is noticed');
        await sleep(2500);
        n = await picture(j, tag + '-6-usgs-down-esri');
        assert.ok(mostly(n, 'GREEN') && !n.BG, 'USGS down -> Esri, never blank: ' + JSON.stringify(n));
        assert.equal(await credit(j), 'Powered by Esri');
        await j.close();
        state.usgs = 'ok';
    });
}

test('7: Fix the green - the organizer picks USGS: three choices with notes, the map changes, kept on the phone for the next round, no database write', { timeout: 180000 }, async () => {
    state.esri = 'ok'; state.usgs = 'ok'; state.hi = 'real';
    const j = await open('T051G');
    assert.equal(await attr(j, 'data-img-src'), 'esri');
    await j.evaluate("document.querySelector('#gps-overlay .gps-tools-menu .gps-fix-green').click()");
    assert.ok(await until(j, "(function(){var b=document.querySelector('#gps-overlay .gps-img-open');return !!b&&b.offsetParent!==null;})()", 5000), 'Fix the green shows "Map picture"');
    assert.match(await j.evaluate("document.querySelector('#gps-overlay .gps-img-open').textContent"), /Map picture: Esri satellite/);
    await j.evaluate("document.querySelector('#gps-overlay .gps-img-open').click()");
    await sleep(400);
    const rows = JSON.parse(await j.evaluate("JSON.stringify([].map.call(document.querySelectorAll('#gps-overlay .gps-img-list button'),function(b){return {k:b.getAttribute('data-img'),name:b.querySelector('b').textContent,note:b.querySelector('span').textContent,on:b.classList.contains('on'),vis:b.offsetParent!==null};}))"));
    assert.deepEqual(rows.map((r) => r.k), ['esri', 'esri-closeup', 'usgs']);
    assert.ok(rows.every((r) => r.vis && r.note.length > 10), 'each choice with its one-line note: ' + JSON.stringify(rows));
    assert.ok(rows[0].on && !rows[2].on, 'the current one is marked');
    assert.match(await j.evaluate("document.querySelector('#gps-overlay .gps-img-sub').textContent"), /on this phone/);
    await picture(j, '7-fix-the-green-sheet');
    await j.evaluate("document.querySelector('#gps-overlay .gps-img-list button[data-img=\"usgs\"]').click()");
    await sleep(2500);
    assert.equal(await attr(j, 'data-img-src'), 'usgs', 'the map changes at once');
    assert.ok(JSON.parse(await j.evaluate("localStorage.getItem('hardpan_imagery_v1_caledonia')")).src === 'usgs', 'kept on the phone');
    await j.evaluate("document.querySelector('#gps-overlay .gps-img-done').click()");
    await j.evaluate("(document.querySelector('#gps-overlay .gps-cancel')||{click:function(){}}).click()");
    await sleep(1500);
    const n = await picture(j, '7-usgs-after-pick');
    assert.ok(mostly(n, 'ORANGE'), 'USGS now: ' + JSON.stringify(n));
    // THE NEXT ROUND on the same course, on this phone: USGS.
    await j.goto(fileUrl('index.html', 'game=T051G&group=1&me=101'), 300);
    assert.ok(await until(j, "!!window.HardPanGps && document.querySelector('#gps-overlay .gps-map[data-ready=\"1\"]')", 30000));
    await sleep(1000);
    assert.equal(await attr(j, 'data-img-src'), 'usgs', 'the next round on the course keeps the pick');
    const db = await j.close();
    assert.ok(!(db.course_gps && db.course_gps.caledonia && db.course_gps.caledonia.imagery), 'no database write while the rule is not live');
});

test('8: PRIVACY - the pre-cache saves USGS for the course area only (the same tiles from two places), asks Esri for nothing, and no URL carries the golfer\'s position', { timeout: 180000 }, async () => {
    state.esri = 'ok'; state.usgs = 'ok'; state.hi = 'real';
    const runs = [];
    for (const [i, at] of [[0, ME], [1, [33.4561, -79.1513]]]) {
        const j = await open('T051H' + i, { at, imagery: 'esri-closeup' });
        // The round's own pre-cache (index.html, 4 s after it opens) first; then once more, asked here, fresh.
        assert.ok(await until(j, "!!localStorage.getItem('hardpan_usgs_done_v1_caledonia')", 30000), 'the round opened -> its pre-cache saved USGS');
        await j.evaluate("localStorage.removeItem('hardpan_usgs_done_v1_caledonia'), caches.delete('hardpan-usgs-v1').then(function(){return 1;})");
        const mark = Number(await j.evaluate('window.__fetched.length'));
        const res = JSON.parse(await j.evaluate("HardPanGps.precacheCourse('caledonia', []).then(function(r){return JSON.stringify(r);})"));
        assert.ok(res.ok && res.fetched > 0, 'positive: the USGS pre-cache ran: ' + JSON.stringify(res));
        assert.equal(res.esri, undefined, '064: no Esri step');
        const asked = JSON.parse(await j.evaluate('JSON.stringify(window.__fetched.slice(' + mark + '))'));
        assert.deepEqual(asked.filter((u) => /\/esri\//.test(u)), [], '064: the pre-cache asked Esri for nothing');
        const pre = asked.filter((u) => /nationalmap/.test(u)).map((u) => u.replace(/\?.*$/, '')).sort();
        assert.ok(!Object.keys(JSON.parse(await j.evaluate('JSON.stringify(localStorage)'))).some((k) => /esri_warm/.test(k)), '064: no Esri warm mark');
        const urls = JSON.parse(await j.evaluate("JSON.stringify(performance.getEntriesByType('resource').map(function(e){return e.name;}).concat(window.__fetched))")).concat(state.log);
        runs.push({ at, pre, urls });
        await j.close();
    }
    assert.ok(runs[0].pre.length > 10, 'positive: USGS tiles were asked for: ' + runs[0].pre.length);
    assert.deepEqual(runs[1].pre, runs[0].pre, 'the same course area, wherever the golfer stands');
    for (const r of runs) {
        const needles = [];
        for (const d of [3, 4, 5, 6]) needles.push(r.at[0].toFixed(d), r.at[1].toFixed(d));
        needles.push(String(r.at[0]), String(r.at[1]));
        for (const u of r.urls) for (const s of needles) assert.ok(!decodeURIComponent(u).includes(s), 'a request carried the golfer\'s position ' + s + ': ' + u);
    }
});
