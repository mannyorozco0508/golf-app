// ============================================================================
// URGENT-051 - THE COURSE'S MAP PICTURE (esri / esri-closeup / usgs), PURE PARTS + THE PRE-CACHE
//
//   - the saved value: a string or { src, at }; newest wins; anything else is ignored; default esri.
//   - Esri's "Map data not yet available" tile is recognised (its bytes when the measured file is on
//     this Mac, and always by its look: one neutral grey) - real imagery is not.
//   - the pre-cache: USGS into Cache Storage as before, whatever the course's picture; Esri is NEVER
//     saved (URGENT-064, Manny Oct 21: Esri allows offline only on a custom plan via its own SDKs) -
//     no warm-up, no Esri request from the pre-cache at all, every Esri tile asked with no-store.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const ON = fs.existsSync(path.join(ROOT, 'gps-view.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no gps-view.js' }, f);

function sandbox(opts) {
    const o = opts || {};
    const store = Object.assign({}, o.ls || {});
    const reqs = [], puts = [];
    const sb = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        JSON, Object, Math, Number, String, Date, Promise, RegExp, Array, isFinite, Uint8Array, setTimeout, clearTimeout,
        navigator: { onLine: true, userAgent: 'test' },
        fetch: (url, init) => {
            reqs.push({ url: String(url), init: init || {} });
            const esri = /esri\.test/.test(url);
            const cc = esri ? (o.esriCacheControl || 'max-age=86400') : 'max-age=86400';
            return Promise.resolve({ ok: true, status: 200, headers: { get: (h) => (/cache-control/i.test(h) ? cc : (/content-type/i.test(h) ? 'image/jpeg' : null)) }, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
        },
        caches: { open: () => Promise.resolve({ match: () => Promise.resolve(null), put: (u) => { puts.push(String(u)); return Promise.resolve(); } }) }
    };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = Object.assign({ esriKey: 'KEY', esriTileUrl: 'https://esri.test/tile/{z}/{y}/{x}?token={key}' }, o.cfg || {});
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'gps-geo.js'), 'utf8'), sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'gps-courses.js'), 'utf8'), sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'gps-view.js'), 'utf8'), sb);
    return { gps: sb.HardPanGps, store, reqs, puts, sb };
}

test('the saved value: string or { src, at }; newest wins; junk ignored; default esri', () => {
    const I = sandbox().gps.imagery;
    assert.deepEqual(Array.from(I.sources), ['esri', 'esri-closeup', 'usgs']);
    assert.equal(I.norm('usgs').src, 'usgs');
    assert.equal(I.norm({ source: 'esri-closeup', at: 5 }).src, 'esri-closeup');
    assert.equal(I.norm('google'), null, 'Google is never a choice here');
    assert.equal(I.norm({ src: 'mapbox' }), null);
    assert.equal(I.pick([]), 'esri');
    assert.equal(I.pick([null, undefined, 'apple']), 'esri');
    assert.equal(I.pick(['esri-closeup']), 'esri-closeup', 'a plain string record (set by us) counts');
    assert.equal(I.pick([{ src: 'esri-closeup', at: 100 }, null, { src: 'usgs', at: 200 }]), 'usgs', 'the newer phone pick wins');
    assert.equal(I.pick([{ src: 'esri-closeup', at: 300 }, null, { src: 'usgs', at: 200 }]), 'esri-closeup', 'the newer record wins');
    assert.equal(I.pick([{ src: 'esri', at: 0 }, { src: 'usgs', at: 0 }]), 'esri', 'a tie keeps the shared record');
    for (const k of I.sources) { assert.ok(I.words[k].name && I.words[k].note.length < 70, k + ': a name and a one-line note'); }
});

test('the course\'s picture: record, the GolfAPI record and this phone - read back by course', () => {
    const t = sandbox({ ls: {
        'hardpan_gps_course_v1_gca_x': JSON.stringify({ imagery: { src: 'esri-closeup', at: 10 } }),
        'hardpan_imagery_v1_gca_y': JSON.stringify({ src: 'usgs', at: 10 }),
        'hardpan_imagery_v1_alias_gca_z': JSON.stringify({ src: 'esri-closeup', at: 1 }) } });
    assert.equal(t.gps.imagery.forCourse('gca_x'), 'esri-closeup');
    assert.equal(t.gps.imagery.forCourse('gca_y'), 'usgs');
    assert.equal(t.gps.imagery.forCourse('gca_z'), 'esri-closeup', 'the linked GolfAPI course record (gapi_<id>)');
    assert.equal(t.gps.imagery.forCourse('other'), 'esri');
});

// A 32x32 RGBA picture from a function of (x, y).
const pic = (f) => { const a = new Uint8Array(32 * 32 * 4); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const c = f(x, y); a.set([c[0], c[1], c[2], 255], (y * 32 + x) * 4); } return a; };

test('Esri\'s placeholder is recognised by its look; real ground is not', () => {
    const I = sandbox().gps.imagery;
    // The placeholder: flat #CCCCCC with a band of white words.
    assert.equal(I.greyCard(pic((x, y) => (y >= 14 && y <= 18 && x > 6 && x < 26 && (x + y) % 3 === 0) ? [255, 255, 255] : [204, 204, 204])), true);
    assert.equal(I.greyCard(pic(() => [204, 204, 204])), true);
    // Real ground: a sandy bunker, a green, a fairway with texture, a dark road, snow-white, a mid-grey parking lot with cars.
    assert.equal(I.greyCard(pic((x, y) => [171 + (x % 5), 150 + (y % 4), 107])), false, 'sand');
    assert.equal(I.greyCard(pic((x, y) => [69 + (x * y) % 9, 99 + (x % 7), 65])), false, 'grass');
    assert.equal(I.greyCard(pic(() => [60, 60, 60])), false, 'dark grey is not the placeholder');
    assert.equal(I.greyCard(pic(() => [250, 250, 250])), false, 'white is not the placeholder');
    assert.equal(I.greyCard(pic((x, y) => ((x * 7 + y * 3) % 5 === 0) ? [40, 60, 150] : [190, 190, 190])), false, 'cars on a lot');
});

const PROBE = path.join(process.env.CLAUDE_JOB_DIR || path.join(os.homedir(), '.claude/jobs/3bafec95'), 'tmp/u051/probe/pap-20.jpg');
test('the measured Esri placeholder file (z20 at Papago, 2026-10-21) matches the fingerprint', { skip: fs.existsSync(PROBE) ? false : 'the probe tile is not on this Mac' }, async () => {
    const t = sandbox();
    const b = fs.readFileSync(PROBE);
    assert.equal(b.length, t.gps.imagery.PLACEHOLDER.len);
    assert.equal(t.gps.imagery.fnv32(new Uint8Array(b)), t.gps.imagery.PLACEHOLDER.fnv);
    assert.equal(await t.gps.imagery.isPlaceholder(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), true);
    // One byte different: not the fingerprint (and no decoder in node, so not judged by look): a real tile.
    const c = Buffer.from(b); c[100] ^= 1;
    assert.equal(await t.gps.imagery.isPlaceholder(c.buffer.slice(c.byteOffset, c.byteOffset + c.length)), false);
});

const caledonia = (sb) => sb.HardPanGeo.osmCourse(sb.HardPanGpsCourses, 'caledonia');
test('064: no Esri warm-up any more - the 051 helpers are gone from the API', () => {
    const I = sandbox().gps.imagery;
    assert.equal(I.warmTiles, undefined, 'no Esri tile list for a warm-up');
    assert.equal(I.maxAge, undefined, 'no Cache-Control reading for keeping Esri');
    assert.equal(I.WARM_CAP, undefined);
    assert.equal(typeof I.esriNoStore, 'function');
});

for (const src of ['esri', 'esri-closeup', 'usgs']) {
    test('pre-cache, ' + src + ' course: USGS to Cache Storage as before; Esri is asked for nothing and nothing is marked', async () => {
        const t = sandbox(src === 'esri' ? {} : { ls: { 'hardpan_imagery_v1_caledonia': JSON.stringify({ src, at: 1 }) } });
        const r = await t.gps.precacheCourse('caledonia', [[33.45, -79.15]]);
        const esri = t.reqs.filter((q) => /esri\.test/.test(q.url)), usgs = t.reqs.filter((q) => /nationalmap/.test(q.url));
        assert.ok(usgs.length > 0 && r && r.ok && r.fetched > 0, 'positive: USGS fetched and stored: ' + JSON.stringify(r));
        assert.ok(t.puts.length > 0 && t.puts.every((u) => /nationalmap/.test(u)), 'Cache Storage holds USGS only');
        assert.equal(esri.length, 0, 'the pre-cache asked Esri for nothing');
        assert.equal(r.esri, undefined, 'no Esri step in the result');
        assert.ok(!Object.keys(t.store).some((k) => /esri/i.test(k)), 'no Esri mark kept: ' + Object.keys(t.store).join(','));
    });
}

test('pre-cache: esriWarm in gps-config changes nothing now (off is the only way)', async () => {
    const on = sandbox({ cfg: { esriWarm: true } });
    await on.gps.precacheCourse('caledonia', []);
    assert.equal(on.reqs.filter((q) => /esri\.test/.test(q.url)).length, 0, 'esriWarm: true does not bring the warm-up back');
    assert.ok(on.puts.length > 0, 'positive: USGS stored');
});

test('every Esri tile request is no-store; USGS and anything else untouched', () => {
    const I = sandbox().gps.imagery;
    assert.deepEqual(JSON.parse(JSON.stringify(I.esriNoStore('https://esri.test/tile/18/104876/73437?token=KEY'))), { url: 'https://esri.test/tile/18/104876/73437?token=KEY', cache: 'no-store' });
    assert.ok(I.isEsriTile('https://esri.test/tile/20/1/2?token=KEY'));
    const u = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/16/1/2';
    assert.deepEqual(JSON.parse(JSON.stringify(I.esriNoStore(u))), { url: u }, 'USGS keeps its normal request');
    assert.equal(I.esriNoStore('hpusgs://16/1/2').cache, undefined);
    assert.equal(I.esriNoStore('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json').cache, undefined, 'only tiles are matched (the stand-in template here)');
    // The real template, with no stand-in: the real Esri tile host.
    const real = sandbox({ cfg: { esriTileUrl: '' } }).gps.imagery;
    assert.equal(real.esriNoStore('https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/18/1/2?token=K').cache, 'no-store');
});

test('the 051 warm marks are cleared once; nothing else in storage is touched', () => {
    const t = sandbox();
    const keys = ['hardpan_esri_warm_v1_caledonia', 'hardpan_esri_warm_v1_gca_x', 'hardpan_usgs_done_v1_caledonia', 'hardpan_imagery_v1_caledonia'];
    keys.forEach((k) => { t.store[k] = '{"until":99999999999999}'; });
    const ls = t.sb.localStorage;
    ls.key = (i) => Object.keys(t.store)[i];
    Object.defineProperty(ls, 'length', { get: () => Object.keys(t.store).length, configurable: true });
    assert.equal(t.gps.imagery.clearOldEsriWarm(), 2);
    assert.deepEqual(Object.keys(t.store).sort(), ['hardpan_imagery_v1_caledonia', 'hardpan_usgs_done_v1_caledonia']);
});

test('wiring: the close-up layer, its own protocol, the fallback chain, the switch, and nothing stored but USGS', () => {
    const v = fs.readFileSync(path.join(ROOT, 'gps-view.js'), 'utf8');
    assert.ok(/addEsriHiProtocol\(ml\);/.test(v) && /ml\.addProtocol\('hpesri'/.test(v), 'the close-up tiles go through the placeholder check');
    assert.ok(/if \(ph\) \{[^}]*throw new Error\('esri placeholder'\)/.test(v), 'a placeholder is an error (a missing tile), not a picture');
    assert.ok(/minzoom: TILES\.maxNativeZoom \+ 1, maxzoom: TILES\.closeZoom/.test(v) && /closeZoom: 21,/.test(v), 'the close-up source: z20-21');
    assert.ok(/addLayer\(\{ id: 'esri-hi'[^\n]*'acc-fill'\)/.test(v), 'the close-up layer sits right over the z19 Esri layer');
    assert.ok(/var want = \(pinning \|\| S\.esriFailed \|\| usgsPicture\(\)\) \? 'none' : 'visible';/.test(v), 'Esri held back while USGS is the picture');
    assert.ok(/S\.imgSrc === 'usgs' && S\.usgsErrRun >= ESRI_ERRS_TO_FAIL\) failUsgs\(\)/.test(v), 'USGS failing hands over to Esri');
    assert.ok(/data\.indexOf|\.put\(/.test(v) && v.split('\n').filter((l) => /\.put\(/.test(l) && !/^\s*\/\//.test(l)).length === 1, 'still exactly one Cache Storage write (USGS)');
    assert.ok(!/function warmEsri\(|esriWarmValid|hardpan_esri_warm_v1_' \+/.test(v), '064: no Esri warm-up, and nothing reads its old marks');
    assert.ok(/function onOffline\(\) \{ dropEsri\('offline'\);/.test(v), '064: no signal -> Esri off at once (nothing of it is kept)');
    assert.ok(/var offEsri = offline;/.test(v), '064: a map built with no signal starts on USGS');
    assert.ok(/fetch\(url, \{ mode: 'cors', credentials: 'omit', cache: 'no-store' \}\)/.test(v.slice(v.indexOf("ml.addProtocol('hpesri'"), v.indexOf('function esriHiSource('))), '064: the close-up asks with no-store');
    assert.ok(/transformRequest: esriNoStore,/.test(v), '064: the map asks every Esri tile with no-store');
    const pre = v.slice(v.indexOf('function precacheCourse('), v.indexOf('function precacheUsgs('));
    assert.ok(/return precacheUsgs\(courseKey, extraPts\);/.test(pre) && !/esri/i.test(pre.replace(/\/\/.*$/gm, '')), '064: the pre-cache is USGS only');
    assert.ok(/cfg\(\)\.imageryShare === true/.test(v), 'the shared write waits for the rule (imageryShare)');
    const cfg = fs.readFileSync(path.join(ROOT, 'gps-config.js'), 'utf8');
    assert.ok(!/imageryShare:\s*true/.test(cfg), 'imageryShare is not on in the shipped config');
});

test('acknowledgements name Esri (incl. the close-up) and USGS', () => {
    const a = fs.readFileSync(path.join(ROOT, 'acknowledgements.html'), 'utf8');
    assert.ok(/Powered by <a href="https:\/\/www\.esri\.com">Esri<\/a>\. Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community/.test(a));
    assert.ok(/close-up imagery/.test(a) && /USDA, USGS The National Map: Orthoimagery/.test(a) && /set to USGS/.test(a));
    assert.ok(/Esri imagery is shown live and is never saved on the phone\./.test(a), '064: the Esri line says it is never saved');
    assert.ok(!/cache rules allow/.test(a), '064: the old "kept as long as Esri\'s cache rules allow" wording is gone');
    assert.ok(/back-up picture stored on the phone for no signal/.test(a), 'USGS is still the saved back-up');
});
