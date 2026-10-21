// ============================================================================
// URGENT-051 - THE COURSE'S MAP PICTURE (esri / esri-closeup / usgs), PURE PARTS + THE PRE-CACHE
//
//   - the saved value: a string or { src, at }; newest wins; anything else is ignored; default esri.
//   - Esri's "Map data not yet available" tile is recognised (its bytes when the measured file is on
//     this Mac, and always by its look: one neutral grey) - real imagery is not.
//   - the pre-cache follows the course's picture: USGS into Cache Storage as before; Esri (and the
//     close-up's z20) into the browser HTTP cache only, under Esri's own Cache-Control, from the
//     COURSE area - the same tiles whatever happens elsewhere; a header that forbids caching stops it;
//     USGS chosen = no Esri request at all.
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

test('Cache-Control: only a positive max-age allows keeping a tile', () => {
    const I = sandbox().gps.imagery;
    assert.equal(I.maxAge('max-age=86400'), 86400);
    assert.equal(I.maxAge('public, max-age=3600'), 3600);
    assert.equal(I.maxAge('no-store'), 0);
    assert.equal(I.maxAge('no-cache, max-age=86400'), 0);
    assert.equal(I.maxAge('private, max-age=600'), 0);
    assert.equal(I.maxAge(''), 0);
    assert.equal(I.maxAge(null), 0);
});

const caledonia = (sb) => sb.HardPanGeo.osmCourse(sb.HardPanGpsCourses, 'caledonia');
test('the Esri tile list comes from the course alone, capped; the close-up adds z20 over the greens', () => {
    const t = sandbox(), G = t.sb.HardPanGeo, osm = caledonia(t.sb);
    const b = G.courseBounds(osm, [], 150);
    const greens = Object.keys(osm.holes).map((n) => G.resolveHole(osm.holes[n], []).mid).filter(Boolean);
    const e = t.gps.imagery.warmTiles(b, greens, 'esri'), c = t.gps.imagery.warmTiles(b, greens, 'esri-closeup');
    assert.ok(e.length > 20 && e.length <= t.gps.imagery.WARM_CAP, 'esri: ' + e.length);
    assert.ok(c.length >= e.length && c.length <= t.gps.imagery.WARM_CAP, 'close-up: ' + c.length);
    assert.ok(e.every((x) => x.z >= 16 && x.z <= 19), 'esri: z16-19 only');
    assert.ok(c.every((x) => x.z >= 16 && x.z <= 20), 'close-up: z16-20 only (z21 is asked live, never pre-fetched)');
    assert.deepEqual(JSON.stringify(t.gps.imagery.warmTiles(b, greens, 'esri')), JSON.stringify(e), 'the same course gives the same tiles');
    assert.equal(new Set(c.map((x) => x.z + '/' + x.x + '/' + x.y)).size, c.length, 'no tile twice');
    assert.ok(t.gps.imagery.warmTiles(b, greens, 'esri-closeup', 40).length <= 40, 'the cap holds');
});

test('pre-cache, Esri course: USGS to Cache Storage as before, Esri to the HTTP cache only, by the course area, once per max-age', async () => {
    const t = sandbox();
    const r = await t.gps.precacheCourse('caledonia', []);
    const esri = t.reqs.filter((q) => /esri\.test/.test(q.url)), usgs = t.reqs.filter((q) => /nationalmap/.test(q.url));
    assert.ok(usgs.length > 0, 'positive: USGS fetched');
    assert.ok(esri.length > 0 && r.esri && r.esri.ok, 'Esri warmed: ' + JSON.stringify(r.esri));
    assert.ok(esri.every((q) => q.init.cache === 'default' && q.init.credentials === 'omit'), 'Esri requests leave caching to the browser and Esri\'s headers');
    assert.ok(esri.every((q) => /token=KEY$/.test(q.url) && /\/tile\/(1[6-9])\//.test(q.url)), 'Esri z16-19 tiles');
    assert.ok(t.puts.length > 0 && t.puts.every((u) => /nationalmap/.test(u)), 'Cache Storage holds USGS only');
    const mark = JSON.parse(t.store.hardpan_esri_warm_v1_caledonia);
    assert.ok(mark.until > Date.now() + 22 * 3600e3 && mark.until <= Date.now() + 86400e3, 'kept no longer than Esri\'s max-age');
    const n = esri.length;
    const again = await t.gps.precacheCourse('caledonia', []);
    assert.equal(again.esri.reason, 'fresh');
    assert.equal(t.reqs.filter((q) => /esri\.test/.test(q.url)).length, n, 'no second warm-up inside the max-age');
});

test('pre-cache, close-up course: the z20 tiles over the greens too; pins in the round add their greens', async () => {
    const t = sandbox({ ls: { 'hardpan_imagery_v1_caledonia': JSON.stringify({ src: 'esri-closeup', at: 1 }) } });
    const r = await t.gps.precacheCourse('caledonia', []);
    assert.equal(r.esri.src, 'esri-closeup');
    assert.ok(t.reqs.some((q) => /esri\.test\/tile\/20\//.test(q.url)), 'z20 asked');
    assert.ok(!t.reqs.some((q) => /esri\.test\/tile\/(2[1-9])\//.test(q.url)), 'never past z20 ahead of time');
});

test('pre-cache: Esri headers that forbid caching stop the warm-up; USGS chosen asks Esri for nothing', async () => {
    const t = sandbox({ esriCacheControl: 'no-store' });
    const r = await t.gps.precacheCourse('caledonia', []);
    assert.equal(r.esri.reason, 'headers');
    assert.ok(t.reqs.filter((q) => /esri\.test/.test(q.url)).length <= 4, 'stopped at the first answers (4 in flight)');
    assert.equal(t.store.hardpan_esri_warm_v1_caledonia, undefined, 'nothing marked as kept');
    const u = sandbox({ ls: { 'hardpan_imagery_v1_caledonia': JSON.stringify({ src: 'usgs', at: 1 }) } });
    const ru = await u.gps.precacheCourse('caledonia', []);
    assert.equal(ru.esri.reason, 'usgs-chosen');
    assert.equal(u.reqs.filter((q) => /esri\.test/.test(q.url)).length, 0);
    assert.ok(u.reqs.some((q) => /nationalmap/.test(q.url)), 'positive: USGS still stored');
    const off = sandbox({ cfg: { esriWarm: false } });
    assert.equal((await off.gps.precacheCourse('caledonia', [])).esri.reason, 'off', 'gps-config esriWarm: false turns it off');
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
    const warm = v.slice(v.indexOf('function warmEsri('), v.indexOf('// ---- THE MAP'));
    assert.ok(!/caches\.|\.put\(|indexedDB/.test(warm), 'the Esri warm-up never touches Cache Storage or IndexedDB');
    assert.ok(!/\bfix\b|S\.dot|watchPosition/.test(warm), 'the Esri warm-up never reads the golfer\'s position');
    assert.ok(/cfg\(\)\.imageryShare === true/.test(v), 'the shared write waits for the rule (imageryShare)');
    const cfg = fs.readFileSync(path.join(ROOT, 'gps-config.js'), 'utf8');
    assert.ok(!/imageryShare:\s*true/.test(cfg), 'imageryShare is not on in the shipped config');
});

test('acknowledgements name Esri (incl. the close-up) and USGS', () => {
    const a = fs.readFileSync(path.join(ROOT, 'acknowledgements.html'), 'utf8');
    assert.ok(/Powered by <a href="https:\/\/www\.esri\.com">Esri<\/a>\. Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community/.test(a));
    assert.ok(/close-up imagery/.test(a) && /USDA, USGS The National Map: Orthoimagery/.test(a) && /set to USGS/.test(a));
});
