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
    assert.ok(/sources\.esri = \{ type: 'raster', tiles: \[esriTileUrl\(\)/.test(v), 'positive: the Esri layer is a stock raster source');
});
