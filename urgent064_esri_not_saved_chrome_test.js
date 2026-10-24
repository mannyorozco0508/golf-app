// ============================================================================
// URGENT-064 - ESRI IS NEVER SAVED ON THE PHONE; USGS STILL IS. IN REAL CHROME (WebGL), 393x852.
//
// Manny, Oct 21 3:56 PM: Esri allows offline use only on a custom plan, through its own SDKs - so the
// 051 warm-up is gone and Esri streams live only. USGS (public domain) is still saved for the course,
// and with no signal the map falls to it - never blank.
//
// A stand-in Esri and USGS on 127.0.0.1 (as urgent051_imagery_chrome_test.js) send every tile with
// Cache-Control: max-age=86400 - headers that WOULD let a browser keep them - and draw flat colours:
//     Esri z<=19 GREEN   Esri close-up z20+ BLUE   USGS ORANGE
//   1. Online, an esri-closeup course, zoomed past z20: Esri (and the close-up) are the picture, with
//      the Esri credit. The phone carries an old 051 warm mark; it is cleared.
//   2. Every storage read back: Cache Storage holds USGS tiles only (the positive: there ARE some),
//      no IndexedDB database, no Esri key in localStorage.
//   3. The browser's HTTP cache: the same view opened again asks the stand-in for every Esri tile
//      again (none came from the HTTP cache). Positive control: the same headers on a plain request
//      ARE kept by this browser (a second fetch never reaches the server).
//   4. No signal (Chrome offline): Esri off at once, the saved USGS is the picture (ORANGE, never
//      blank), the credit says USGS, and nothing reaches the stand-in.
// Shots (when ~/Desktop/claude-code-reports/064 exists): 064/chrome/<n>-<what>.png.
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

const OUT = path.join(os.homedir(), 'Desktop/claude-code-reports/064');
const SHOTS = path.join(OUT, 'chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(c) {
    const W = 256, raw = Buffer.alloc((W * 3 + 1) * W);
    for (let y = 0; y < W; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) raw.set(c, y * (W * 3 + 1) + 1 + x * 3); }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(W, 4); ih[8] = 8; ih[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
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
const COL = { GREEN: [40, 160, 60], BLUE: [40, 90, 220], ORANGE: [230, 140, 30], BG: [29, 59, 42] };
const TILE = { GREEN: png(COL.GREEN), BLUE: png(COL.BLUE), ORANGE: png(COL.ORANGE) };
const nearest = (c) => Object.keys(COL).map((k) => [k, Math.abs(c[0] - COL[k][0]) + Math.abs(c[1] - COL[k][1]) + Math.abs(c[2] - COL[k][2])]).sort((a, b) => a[1] - b[1])[0];
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

const log = [];
let BASE = null, srv = null;
before(async () => {
    srv = http.createServer((req, res) => {
        log.push(req.url);
        // Headers that WOULD let the browser keep every tile for a day.
        const h = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'image/png' };
        if (/^\/ctl\//.test(req.url)) { res.writeHead(200, Object.assign({}, h, { 'Content-Type': 'text/plain' })); return res.end('control'); }
        const m = /^\/(esri|usgs)\/(\d+)\/(\d+)\/(\d+)/.exec(req.url);
        if (!m) { res.writeHead(404, h); return res.end(); }
        res.writeHead(200, h);
        return res.end(m[1] === 'usgs' ? TILE.ORANGE : (Number(m[2]) <= 19 ? TILE.GREEN : TILE.BLUE));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    BASE = 'http://127.0.0.1:' + srv.address().port;
});
let J = null;
after(async () => { try { if (J) await J.close(); } catch (e) {} if (srv) srv.close(); });

const ME = [33.4528, -79.1547];
const CFG = () => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true,esriKey:'CHECK',esriTileUrl:'" + BASE + "/esri/{z}/{y}/{x}?token={key}'});}});})();";
const USGS = () => "(function(){var f=window.fetch.bind(window);window.__fetched=[];window.fetch=function(u,i){var s=String(u&&u.url||u);window.__fetched.push(s);var m=/basemap\\.nationalmap\\.gov\\/.*\\/tile\\/(\\d+)\\/(\\d+)\\/(\\d+)/.exec(s);if(m)return f('" + BASE + "/usgs/'+m[1]+'/'+m[2]+'/'+m[3],i);return f(u,i);};})();";
const GEO = (p) => "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:" + p[0] + ",longitude:" + p[1] + ",accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t;}, getCurrentPosition:function(ok){ok({coords:{latitude:" + p[0] + ",longitude:" + p[1] + ",accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const CODE = 'T064E';
const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test 064 Alpha', 'Test 064 Bravo'],
        overrides: { eventName: 'Test 064 esri not saved', activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club (Caledonia)', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(250); } return false; }
const attr = (j, a) => j.evaluate("(function(){var e=document.querySelector('#gps-overlay .gps-map');return e?e.getAttribute('" + a + "'):null;})()");
const credit = (j) => j.evaluate("(document.querySelector('#gps-overlay .gps-credit-txt')||{}).textContent||''");
const esriTiles = (from) => log.slice(from).filter((u) => /^\/esri\//.test(u)).map((u) => u.replace(/\?.*$/, ''));
const URL_ = () => fileUrl('index.html', 'game=' + CODE + '&group=1&me=101');
async function mapUp(j) {
    assert.ok(await until(j, "!!window.HardPanGps && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-map[data-ready=\"1\"]')", 30000), 'the map is up');
    await sleep(3000);
}

test('064: Esri streams live and is never saved (Cache Storage, IndexedDB, localStorage, HTTP cache); USGS is saved and is the no-signal picture', { timeout: 300000 }, async () => {
    // An old 051 warm mark, as b81c170b left on Manny's phone: it must be cleared and must not keep Esri offline.
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG() + USGS() + GEO(ME)
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');localStorage.setItem('hardpan_round_side','gps|" + CODE + "');"
        + "if(!sessionStorage.getItem('__seeded064')){sessionStorage.setItem('__seeded064','1');localStorage.setItem('hardpan_esri_warm_v1_caledonia',JSON.stringify({at:Date.now(),until:Date.now()+86400000,n:200,src:'esri-closeup'}));}}catch(e){}";
    const db = { events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {}, course_gps: { caledonia: { imagery: 'esri-closeup' } } };
    const j = J = await openJourney({ db, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });

    // 1. Online: Esri is the picture, live, with its credit.
    let from = log.length;
    await j.goto(URL_(), 300);
    await mapUp(j);
    const first = esriTiles(from);
    let n = await picture(j, '1-online-esri-live');
    assert.ok(mostly(n, 'GREEN'), 'Esri is the picture online: ' + JSON.stringify(n));
    assert.equal(await credit(j), 'Powered by Esri');
    assert.ok(first.length > 0, 'positive: Esri tiles were streamed: ' + first.length);
    assert.equal(await j.evaluate("localStorage.getItem('hardpan_esri_warm_v1_caledonia')"), null, 'the old 051 warm mark is cleared');
    // The close-up streams too (its own protocol).
    for (let i = 0; i < 30 && Number(await attr(j, 'data-zoom')) < 20.4; i++) { await j.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 196, y: 330, deltaX: 0, deltaY: -240 }); await sleep(450); }
    await sleep(2500);
    n = await picture(j, '1b-online-closeup-live');
    assert.ok(mostly(n, 'BLUE'), 'the close-up is the picture past z20: ' + JSON.stringify(n));
    assert.ok(esriTiles(from).some((u) => /^\/esri\/2[01]\//.test(u)), 'positive: close-up tiles were streamed');

    // 2. Every storage, read back. The round's USGS pre-cache runs ~4 s after it opens.
    assert.ok(await until(j, "!!localStorage.getItem('hardpan_usgs_done_v1_caledonia')", 40000), 'the USGS pre-cache finished');
    const st = JSON.parse(await j.evaluate(`(async function(){
        var out = { caches: {}, idb: null, ls: Object.keys(localStorage) };
        var names = await caches.keys();
        for (var i = 0; i < names.length; i++) { var c = await caches.open(names[i]); out.caches[names[i]] = (await c.keys()).map(function (r) { return r.url; }); }
        try { out.idb = (await indexedDB.databases()).map(function (d) { return d.name; }); } catch (e) { out.idb = 'n/a'; }
        return JSON.stringify(out);
    })()`));
    const all = [].concat(...Object.values(st.caches));
    assert.ok(all.length > 0 && all.some((u) => /basemap\.nationalmap\.gov/.test(u)), 'positive: USGS tiles ARE saved: ' + all.length);
    assert.deepEqual(all.filter((u) => u.indexOf(BASE + '/esri') === 0 || /arcgis\.com|World_Imagery/.test(u)), [], 'no Esri entry in Cache Storage');
    assert.ok(st.idb === 'n/a' || st.idb.length === 0, 'no IndexedDB database: ' + JSON.stringify(st.idb));
    assert.deepEqual(st.ls.filter((k) => /esri/i.test(k)), [], 'no Esri key in localStorage');

    // 3. The HTTP cache. Positive control first: these headers ARE kept by this browser for a plain request.
    const c0 = log.filter((u) => /^\/ctl\//.test(u)).length;
    await j.evaluate("fetch('" + BASE + "/ctl/1').then(function(r){return r.text();}).then(function(){return fetch('" + BASE + "/ctl/1');}).then(function(r){return r.text();})");
    assert.equal(log.filter((u) => /^\/ctl\//.test(u)).length - c0, 1, 'positive control: the browser kept the plain response (second fetch never reached the server)');
    // The same view again: every Esri tile is asked of the server again.
    from = log.length;
    await j.goto(URL_(), 300);
    await mapUp(j);
    const again = new Set(esriTiles(from));
    const missed = first.filter((u) => !again.has(u));
    assert.ok(again.size > 0, 'positive: Esri streamed again');
    assert.ok(missed.length <= Math.floor(first.length * 0.1), 'the same view asked the server again for the Esri tiles (none came from the HTTP cache): ' + missed.length + ' of ' + first.length + ' not re-asked');

    // 4. No signal: Esri off at once, the saved USGS is the picture.
    from = log.length;
    await j.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    assert.ok(await until(j, 'navigator.onLine === false', 5000), 'the page is offline');
    assert.ok(await until(j, 'HardPanGps.imagery.now().esriFailed', 8000), 'no signal -> Esri off at once');
    await sleep(3000);
    n = await picture(j, '2-offline-saved-usgs');
    assert.ok(mostly(n, 'ORANGE') && !n.BG, 'offline: the saved USGS is the picture, never blank: ' + JSON.stringify(n));
    assert.equal(await credit(j), 'USGS');
    assert.deepEqual(log.slice(from), [], 'nothing reached the network while offline');
    // Reopened with no signal: straight onto the saved USGS.
    await j.goto(URL_(), 300);
    await mapUp(j);
    n = await picture(j, '3-offline-reopen-saved-usgs');
    assert.ok(mostly(n, 'ORANGE') && !n.BG, 'reopened offline: the saved USGS, never blank: ' + JSON.stringify(n));
    assert.ok((await j.evaluate('JSON.stringify(HardPanGps.imagery.now())')).indexOf('"esriFailed":true') !== -1, 'Esri starts off with no signal');
    await j.cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const left = await j.close(); J = null;
    assert.ok(left && left.events && left.events[CODE], 'the stub database only (no live database)');
});
