#!/usr/bin/env node
// ============================================================================
// ESRI TILES ARE NEVER STORED BY THE APP - IN A REAL BROWSER, WITH THE REAL
// SERVICE WORKER IN CONTROL (gps-v1, 2026-10-07)
//
// Esri's terms allow only ordinary browser HTTP caching under its own headers:
// no app-side offline storage. gps_esri_never_cached_test.js proves the worker's
// code; this proves the browser agrees.
//
//   - The app is served over http://localhost (the only http origin pwa-boot
//     registers the worker on), so the REAL sw.js installs and controls the page.
//   - A stand-in Esri runs on http://127.0.0.1:<other port> - a different origin,
//     as Esri is - serving tiles with Esri's own header, Cache-Control:
//     max-age=86400, and a copyrightText for the credit. gps-config.js is served
//     pointing the Esri layer at it (the data source is replaced; the page is not
//     touched). The Firebase stand-in is the shared cold-arrival one.
//   - Arrive, reload so the worker is in control, open GPS, let Esri tiles load,
//     then read back EVERY Cache Storage entry and EVERY IndexedDB database.
//     Then reload and open GPS again, and read them back again.
//
// PASSES WHEN: the worker controls the page and has cached the shell (positive
// controls - otherwise "nothing stored" is true of a worker that never ran);
// Esri tiles were drawn from the stand-in; and no Cache Storage entry is an Esri
// request, and there is no IndexedDB database, after either visit.
//
//   node tools/gps-esri-cache-check.js   exit code 0 = passed, 1 = a guarantee broke, 2 = could not run
// ============================================================================
'use strict';
const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
if (!fs.existsSync(path.join(REPO, 'gps-view.js'))) { console.error('Consumer tree: no GPS side.'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const TILE = fs.readFileSync(path.join(REPO, 'icon-192.png'));

function listen(handler, host) {
    return new Promise((resolve) => {
        const s = http.createServer(handler);
        s.listen(0, host, () => resolve({ server: s, port: s.address().port }));
    });
}

(async () => {
    const esriHits = [];
    const esri = await listen((req, res) => {
        esriHits.push(req.url);
        if (/\/MapServer\?f=json/.test(req.url)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=86400' });
            return res.end(JSON.stringify({ copyrightText: 'Source: stand-in Esri' }));
        }
        if (/\/MapServer\/tile\//.test(req.url)) {
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
            return res.end(TILE);
        }
        res.writeHead(404); res.end();
    }, '127.0.0.1');
    const ESRI_ORIGIN = 'http://127.0.0.1:' + esri.port;
    const CONFIG = `window.HARDPAN_GPS_CONFIG = { esriKey: 'CHECK', esriTileUrl: '${ESRI_ORIGIN}/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={key}', esriMetaUrl: '${ESRI_ORIGIN}/arcgis/rest/services/World_Imagery/MapServer?f=json&token={key}' };\n`;

    const app = await listen((req, res) => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/gps-config.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(CONFIG); }
        const file = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
        const f = path.join(REPO, file);
        if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(fs.readFileSync(f));
    }, '127.0.0.1');
    const BASE = 'http://localhost:' + app.port;

    const sb = {};
    vm.runInNewContext(fs.readFileSync(path.join(REPO, 'course-data.js'), 'utf8') + ';this.p=coursePresets;', sb);
    const table = require('../gps-courses.js');
    const h1 = table.caledonia.holes['1'].osm;
    const me = [h1.tee[0] + 0.55 * (h1.mid[0] - h1.tee[0]), h1.tee[1] + 0.55 * (h1.mid[1] - h1.tee[1])];
    const sensor = `Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: ${me[0]}, longitude: ${me[1]}, accuracy: 5 } }); }, 50); return 1; }, clearWatch: function () {} } });`;

    // Everything the page has stored, read through the real APIs. Async, so it
    // is parked on window and read by a later step.
    const STORE_SCAN = `(window.__scan = null, (async function () {
        const out = { controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), caches: {}, idb: null };
        for (const n of await caches.keys()) { const c = await caches.open(n); out.caches[n] = (await c.keys()).map(function (r) { return r.url; }); }
        try { out.idb = indexedDB.databases ? (await indexedDB.databases()).map(function (d) { return d.name; }) : 'no databases() API'; } catch (e) { out.idb = 'error ' + e.message; }
        window.__scan = JSON.stringify(out);
    })(), 'scanning')`;
    const TILES = `JSON.stringify({ esriDrawn: [].slice.call(document.querySelectorAll('#gps-overlay img.leaflet-tile-loaded')).filter(function (i) { return i.src.indexOf(${JSON.stringify(ESRI_ORIGIN)}) === 0; }).length,
        credit: (document.querySelector('#gps-overlay .leaflet-control-attribution') || {}).innerText || '' })`;

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-esri-cache-'));
    const preset = sb.p.caledonia;
    const res = await arriveCold({
        url: BASE + '/index.html?game=ESRIC&group=1',
        rounds: { ESRIC: { eventName: 'esri cache', activeCourseKey: 'caledonia', courseName: preset.name, gameFormat: 'stroke',
                           courseData: JSON.parse(JSON.stringify(preset.data)), players: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }], scores: {} } },
        viewport: { width: 390, height: 844 }, preScript: sensor, settleMs: 3500, profileDir: profile,
        steps: [
            { sleep: 2500 }, { expression: 'location.reload()' }, { sleep: 4000 },     // now controlled
            { tap: '.gps-side-gps' }, { sleep: 5000 }, { expression: TILES },
            { expression: STORE_SCAN }, { sleep: 2000 }, { expression: 'window.__scan' },
            { expression: 'location.reload()' }, { sleep: 4000 },                       // second visit (GPS remembered)
            { sleep: 4000 }, { expression: TILES },
            { expression: STORE_SCAN }, { sleep: 2000 }, { expression: 'window.__scan' },
        ],
    });
    try { esri.server.close(); app.server.close(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    if (!res.ok) { console.log(JSON.stringify({ ok: false, reason: res.reason }, null, 1)); process.exit(2); }

    const vals = res.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    const [tiles1, scan1, tiles2, scan2] = vals;
    const fails = [];
    const tileHits = esriHits.filter((u) => /\/tile\//.test(u)).length;
    [[scan1, 'first visit'], [scan2, 'second visit']].forEach(([s, when]) => {
        if (!s) { fails.push(when + ': no storage scan'); return; }
        if (!s.controlled) fails.push(when + ': the service worker did not control the page (the check proves nothing)');
        const all = Object.keys(s.caches).reduce((a, n) => a.concat(s.caches[n].map((u) => n + ' ' + u)), []);
        if (!all.some((e) => /golfapp-v\d+.* .*\/(index\.html|gps-view\.js)$/.test(e))) fails.push(when + ': the shell is not cached (positive control) ' + Object.keys(s.caches).join(','));
        const esriStored = all.filter((e) => e.indexOf(ESRI_ORIGIN) !== -1 || /World_Imagery|arcgis\.com/.test(e));
        if (esriStored.length) fails.push(when + ': Esri requests in Cache Storage: ' + esriStored.slice(0, 3).join(' | '));
        const usgsCache = s.caches['hardpan-usgs-v1'] || [];
        if (usgsCache.some((u) => !/^https:\/\/basemap\.nationalmap\.gov\//.test(u))) fails.push(when + ': something other than USGS in hardpan-usgs-v1');
        if (!Array.isArray(s.idb) || s.idb.length) fails.push(when + ': IndexedDB: ' + JSON.stringify(s.idb));
    });
    if (!(tiles1 && tiles1.esriDrawn > 0) || tileHits === 0) fails.push('the stand-in Esri drew no tiles (positive control): ' + JSON.stringify(tiles1) + ' hits ' + tileHits);
    if (!/Powered by Esri/.test((tiles1 && tiles1.credit) || '')) fails.push('no Esri credit while Esri drew: ' + (tiles1 && tiles1.credit));
    if (!/Source: stand-in Esri/.test((tiles1 && tiles1.credit) || '')) fails.push('the credit did not come from the stand-in metadata: ' + (tiles1 && tiles1.credit));
    const realEsri = res.requests.filter((u) => /arcgis\.com|arcgisonline\.com/.test(String(u)));
    if (realEsri.length) fails.push('the check reached the REAL Esri: ' + realEsri.slice(0, 2).join(' | '));

    const summary = {
        controlled: [scan1 && scan1.controlled, scan2 && scan2.controlled],
        caches: scan2 ? Object.keys(scan2.caches).map((n) => n + ': ' + scan2.caches[n].length) : null,
        indexedDB: scan2 && scan2.idb,
        esriTilesDrawn: [tiles1 && tiles1.esriDrawn, tiles2 && tiles2.esriDrawn],
        esriTileRequestsReachingServer: tileHits,
        credit: tiles1 && tiles1.credit,
        fails,
    };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
