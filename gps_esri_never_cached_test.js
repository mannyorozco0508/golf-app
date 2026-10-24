// ============================================================================
// ESRI TILES ARE NEVER STORED BY THE APP (gps-v1, 2026-10-07)
//
// Esri's terms (confirmed): no app-side offline storage of basemap output -
// only ordinary browser HTTP caching under the caching headers Esri sends.
// This file proves the app side, with the REAL service worker code:
//
//   1. sw.js's own fetch handler (helpers/sw-harness.js runs it against a fake
//      Cache API and records every put) is handed Esri tile and metadata
//      requests, online and offline. It must NOT call respondWith - the browser
//      then fetches them itself, under its own HTTP cache - and must store
//      NOTHING. A same-origin shell request is the positive control: the same
//      harness, the same worker, handled and cached.
//   2. The same for the GENERATED HardPan web worker (dist/hardpan/sw.js),
//      built into a temp dir with GPS_ENABLED=1.
//   3. No IndexedDB anywhere in the GPS code or the worker, and the only
//      Cache Storage write in gps-view.js is the USGS pre-cache.
//
// tools/gps-esri-cache-check.js is the browser half: a real registered worker
// in Chrome, a stand-in Esri on another origin, and every Cache Storage entry
// and IndexedDB database read back after tiles load.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadServiceWorker, ORIGIN } = require('./helpers/sw-harness.js');

const ROOT = __dirname;
const ON = fs.existsSync(path.join(ROOT, 'gps-view.js'));

const ESRI = [
    'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/18/104876/73437?token=KEY',
    'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json&token=KEY',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/104876/73437',
];

async function prove(swPath, label) {
    for (const online of [true, false]) {
        const sw = loadServiceWorker(swPath, { online });
        for (const url of ESRI) {
            const r = await sw.request({ url, method: 'GET', mode: 'no-cors', destination: 'image' });
            assert.strictEqual(r.handled, false, `${label} (${online ? 'online' : 'offline'}) answered ${url} itself - the browser must fetch it`);
        }
        assert.deepStrictEqual(sw.puts.filter((u) => /arcgis/i.test(String(u))), [], `${label} stored an Esri response`);
        // POSITIVE CONTROL: the same worker, in the same harness, handles and
        // caches a same-origin shell file - so "not handled" above is a decision,
        // not a worker that handles nothing.
        if (online) {
            const shell = await sw.request({ url: ORIGIN + '/gps-view.js', method: 'GET', mode: 'no-cors', destination: 'script' });
            assert.strictEqual(shell.handled, true, `${label}: positive control - a shell file was not handled`);
            assert.ok(sw.puts.some((u) => /gps-view\.js$/.test(String(u))), `${label}: positive control - a shell file was not cached`);
        }
    }
}

test('the HardPan source worker (sw.js) never answers or stores an Esri request, online or offline', async () => {
    await prove(path.join(ROOT, 'sw.js'), 'sw.js');
});

test('the generated HardPan web worker (dist/hardpan/sw.js) never answers or stores one either', { skip: ON ? false : 'Consumer tree: no HardPan build' }, async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-esri-sw-'));
    execFileSync(process.execPath, [path.join(ROOT, 'build-shell.js'), 'consumer'],
        { env: Object.assign({}, process.env, { GPS_ENABLED: '1', BUILD_SHELL_DIST: out }), stdio: 'pipe' });
    const sw = path.join(out, 'hardpan', 'sw.js');
    assert.ok(/hardpan-usgs-/.test(fs.readFileSync(sw, 'utf8')), 'positive: this is the HardPan worker');
    await prove(sw, 'dist/hardpan/sw.js');
});

test('no runtime cache route for Esri, no IndexedDB, and the only Cache Storage write is USGS', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const code = (t) => t.replace(/\/\/.*$/gm, '');
    assert.ok(/self\.addEventListener\('fetch'/.test(sw), 'positive: the fetch handler is there');
    assert.ok(!/arcgis/i.test(code(sw)), 'sw.js code names an Esri host');
    const files = ['sw.js'].concat(ON ? ['gps-view.js', 'gps-geo.js', 'gps-config.js'] : []);
    const codeLines = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    files.forEach((f) => assert.ok(!/indexedDB|IDBFactory/.test(codeLines(f)), f + ' uses IndexedDB'));
    if (!ON) return;
    // Raw lines, skipping only whole-line comments: a naive strip of '//' eats the
    // put line itself, which contains the regex /^image\//.
    const raw = fs.readFileSync(path.join(ROOT, 'gps-view.js'), 'utf8');
    const v = raw;
    const puts = raw.split('\n').filter((l) => /\.put\(/.test(l) && !/^\s*\/\//.test(l));
    assert.strictEqual(puts.length, 1, 'exactly one Cache Storage write in gps-view.js');
    assert.ok(/cache\.put\(url, r\)/.test(puts[0]));
    const pre = v.slice(v.indexOf('function precacheCourse('), v.indexOf('// ---- THE HOLE VIEW'));
    assert.ok(/TILES\.usgs\.url\.replace/.test(pre) && !/keyedUrl|esriTileUrl/.test(pre), 'the pre-cache builds USGS urls only');
    // The Esri layer is a plain MapLibre raster source: the browser fetches each
    // tile, under its own HTTP cache, and nothing here stores one.
    // (Wave 2: built in ONE place, esriSource(), used by buildMap.)
    assert.ok(/function esriSource\(key\) \{\s*return \{ type: 'raster', tiles: \[esriTileUrl\(\)/.test(v) && /sources\.esri = esriSource\(key\)/.test(v), 'positive: the Esri layer is a stock raster source');
});

// ============================================================================
// URGENT-064 (Manny, Oct 21 3:56 PM): Esri allows offline use only on a custom plan through its own
// SDKs, so the 051 warm-up is gone and NO Esri tile is written to any cache or storage - Cache
// Storage, IndexedDB, localStorage, or the browser's HTTP cache (every Esri tile is asked with
// cache: 'no-store'). USGS (public domain) is still saved for the course. The browser half, with a
// real map in Chrome, is urgent064_esri_not_saved_chrome_test.js.
// ============================================================================
const vm = require('vm');
function gpsSandbox(cfgExtra, ls) {
    const store = Object.assign({}, ls || {});
    const fetches = [], puts = [], idb = [], lsWrites = [];
    const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { lsWrites.push(k); store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        JSON, Object, Math, Number, String, Date, Promise, RegExp, Array, isFinite, Uint8Array, setTimeout, clearTimeout,
        navigator: { onLine: true, userAgent: 'test' },
        // Any IndexedDB use at all is recorded.
        indexedDB: new Proxy({}, { get: (t, k) => { idb.push(String(k)); return () => ({}); } }),
        fetch: (url, init) => {
            fetches.push({ url: String(url), init: init || {} });
            return Promise.resolve({ ok: true, status: 200, headers: { get: (h) => (/cache-control/i.test(h) ? 'max-age=86400' : (/content-type/i.test(h) ? 'image/jpeg' : null)) }, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
        },
        caches: { open: () => Promise.resolve({ match: () => Promise.resolve(null), put: (u) => { puts.push(String(u)); return Promise.resolve(); } }) }
    };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = Object.assign({ esriKey: 'KEY' }, cfgExtra || {});
    vm.createContext(sb);
    for (const f of ['gps-geo.js', 'gps-courses.js', 'gps-view.js', 'gps-match.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb);
    return { sb, store, fetches, puts, idb, lsWrites };
}
const isEsri = (u) => /arcgis\.com\/arcgis\/rest\/services\/World_Imagery|arcgisonline/i.test(String(u));

test('064: no Esri tile is ever written to any cache or storage - and USGS still is', { skip: ON ? false : 'Consumer tree: no gps-view.js' }, async () => {
    for (const src of ['esri', 'esri-closeup', 'usgs']) {
        // An old 051 warm mark on the phone must not bring anything back.
        const t = gpsSandbox({}, { hardpan_imagery_v1_caledonia: JSON.stringify({ src, at: 1 }), hardpan_esri_warm_v1_caledonia: JSON.stringify({ until: Date.now() + 86400e3 }) });
        const r = await t.sb.HardPanGps.precacheCourse('caledonia', []);
        // USGS: still saved (positive control - the same harness records a write).
        assert.ok(r && r.ok && r.fetched > 0, src + ': USGS pre-cache ran: ' + JSON.stringify(r));
        assert.ok(t.puts.length > 0 && t.puts.every((u) => /basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGSImageryOnly/.test(u)), src + ': Cache Storage got USGS tiles only');
        // Esri: nothing asked, nothing stored, anywhere.
        assert.deepStrictEqual(t.fetches.filter((q) => isEsri(q.url)), [], src + ': the pre-cache asked Esri for nothing');
        assert.deepStrictEqual(t.puts.filter(isEsri), [], src + ': no Esri entry in Cache Storage');
        assert.deepStrictEqual(t.idb, [], src + ': IndexedDB never touched');
        assert.deepStrictEqual(t.lsWrites.filter((k) => /esri/i.test(k)), [], src + ': no Esri mark written to localStorage');
    }
    // The browser's HTTP cache: every Esri tile URL the app asks for - the map, the close-up, the
    // setup picker - goes with cache: 'no-store'; USGS keeps its ordinary request.
    const t = gpsSandbox();
    const I = t.sb.HardPanGps.imagery, M = t.sb.HardPanGpsMatch;
    for (const z of [16, 18, 19, 20, 21]) {
        const u = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/' + z + '/104876/73437?token=KEY';
        assert.strictEqual(I.esriNoStore(u).cache, 'no-store', 'GPS map, z' + z);
        assert.strictEqual(M.esriNoStore(u).cache, 'no-store', 'setup picker, z' + z);
    }
    const usgs = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/16/1/2';
    assert.strictEqual(I.esriNoStore(usgs).cache, undefined);
    assert.strictEqual(M.esriNoStore(usgs).cache, undefined);
    // And in the code: the three Esri request sites carry it.
    const v = fs.readFileSync(path.join(ROOT, 'gps-view.js'), 'utf8');
    assert.ok(/transformRequest: esriNoStore,/.test(v), 'the GPS map');
    assert.ok(/ml\.addProtocol\('hpesri'[\s\S]{0,400}cache: 'no-store'/.test(v), 'the close-up protocol');
    const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    assert.ok(/imageryStyle\(\), transformRequest: window\.HardPanGpsMatch\.esriNoStore,/.test(admin), 'the setup picker map');
    assert.ok(!/function warmEsri\(/.test(v), 'the 051 Esri warm-up is gone');
});
