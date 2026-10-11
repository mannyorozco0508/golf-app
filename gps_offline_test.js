// ============================================================================
// HARDPAN GPS - OFFLINE COURSE PACKS + PLAYS-LIKE HEIGHTS UP FRONT (gps-features)
//
// gps-offline.js in a sandbox with a fake tile cache, a fake USGS (tiles + EPQS)
// and a fake phone storage: a download stores the course's USGS tiles, its card
// and every hole's heights at the very points and keys gps-view.js reads; never
// an Esri tile, never the golfer's position; with no signal nothing is asked;
// delete keeps what another pack still uses; and the GPS screen no longer asks
// for heights on the tee.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-offline.js'));
const skip = ON ? false : 'Consumer tree: no GPS offline packs';

const PW = '012141521086298986065';
function course(id, lat) {
    const h = {};
    // Each hole on its own ground (its own longitude), green 400 m north of its tee.
    for (let i = 1; i <= 18; i++) { const lng = -78.96 - i / 500; h[String(i)] = { g: { f: [lat - 0.0001, lng], c: [lat, lng], b: [lat + 0.0001, lng] }, t: { b: [lat - 0.0036, lng] } }; }
    return { id, club: 'Prestwick Golf Course', course: 'Prestwick', lat, lng: -78.96, holes: 18, pars: Array(18).fill(4), hcp: [], tees: [], h };
}
function sandbox(opts) {
    const o = Object.assign({ online: true, ls: {}, cfg: { golfapi: true, osm: false, live: false } }, opts || {});
    const store = o.ls, cache = new Map(), requests = [];
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const caches = { open: () => Promise.resolve({ match: (u) => Promise.resolve(cache.get(u)), put: (u, r) => { cache.set(u, r); return Promise.resolve(); }, delete: (u) => Promise.resolve(cache.delete(u)) }) };
    const fetch = (url) => {
        requests.push(url);
        if (/epqs/.test(url)) { const lat = Number(/y=([-\d.]+)/.exec(url)[1]); return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: o.noHeight ? -1000000 : Math.round(lat * 1000) % 100 + 20 }) }); }
        return Promise.resolve({ ok: true, headers: { get: () => 'image/jpeg' }, body: 'tile' });
    };
    const sb = { localStorage, caches, fetch, navigator: { onLine: o.online }, HARDPAN_GPS_CONFIG: o.cfg, Promise, JSON, Object, Math, Number, String, Date, setTimeout };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    sb.HardPanGolfApi = { v: 1, courses: { [PW]: course(PW, 33.64), B2: course('B2', 33.64) }, links: { prestwick: PW, other: 'B2' } };
    vm.runInContext(read('gps-offline.js'), sb);
    return { sb, store, cache, requests, O: sb.HardPanGpsOffline };
}
const CARD = { name: 'Prestwick Country Club', data: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })) };

test('the tile cache, the tile URL, the pre-cache mark and the height points / keys are gps-view.js\'s own', { skip }, () => {
    const v = read('gps-view.js'), { O } = sandbox();
    const c = O._const;
    assert.ok(v.includes(`var USGS_CACHE = '${c.USGS_CACHE}';`));
    assert.ok(v.includes(`url: '${c.USGS_URL}'`));
    assert.ok(v.includes(`var PRECACHE_MARK = '${c.PRECACHE_MARK}';`));
    assert.ok(v.includes(`var EPQS_URL = '${c.EPQS_URL}';`));
    assert.ok(v.includes(`var ELEV_PREFIX = '${c.ELEV_PREFIX}';`));
    assert.ok(v.includes(`var ELEV_T = ${JSON.stringify(c.ELEV_T).replace(/,/g, ', ')};`));
    assert.ok(!/arcgis\.com|ibasemaps|esri/i.test(read('gps-offline.js').replace(/^\s*\/\/.*$/gm, '')), 'no Esri URL anywhere in it: their tiles are never stored');
});

test('download: the course\'s USGS tiles, its card and every hole\'s heights are on the phone; the pack says so', { skip }, async () => {
    const { O, store, cache, requests } = sandbox();
    const steps = [];
    const r = await O.download('prestwick', { name: 'Prestwick Country Club', card: CARD, progress: (p) => steps.push(Object.keys(p)[0]) });
    assert.equal(r.ok, true, JSON.stringify(r));
    const p = O.status('prestwick');
    assert.equal(p.holes, 18); assert.equal(p.gpsId, PW); assert.equal(p.tilesOk, true); assert.equal(p.elevOk, true);
    assert.ok(p.tiles.length > 0 && p.tiles.every((u) => cache.has(u)), 'every tile stored');
    assert.ok(p.tiles.every((u) => /basemap\.nationalmap\.gov\/.+USGSImageryOnly/.test(u)), 'USGS only');
    assert.equal(p.elevPoints.length, 18 * 5 - 0, 'tee, 25/50/75 %, green - per hole');
    assert.ok(p.elevPoints.every((k) => JSON.parse(store[k]).ft > 0), 'heights kept under gps-view\'s keys');
    assert.deepEqual(p.card.data, CARD.data, 'the card, for setup with no signal');
    assert.ok(store['hardpan_usgs_done_v1_prestwick'], 'gps-view will not fetch the tiles again');
    assert.ok(steps.includes('tiles') && steps.includes('elev'), 'progress reported');
    assert.ok(requests.every((u) => /nationalmap\.gov/.test(u)), 'only USGS was asked (tiles, heights)');
    // Again: nothing more is asked.
    const n = requests.length;
    await O.download('prestwick', { name: 'Prestwick Country Club', card: CARD });
    assert.equal(requests.length, n, 'a second download asks for nothing');
});

test('the height points come from the COURSE (tee -> green), never from the golfer, and match gps-view\'s math', { skip }, () => {
    const { O, sb } = sandbox();
    const rec = sb.HardPanGeo.golfapiMatch(sb.HardPanGolfApi, 'prestwick', '', null, 18, null).record;
    const pts = O.elevPoints(rec);
    const h1 = rec.holes['1'].osm;
    const r5 = (p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
    assert.deepEqual(pts.slice(0, 5), [0, 0.25, 0.5, 0.75, 1].map((t) => r5([h1.tee[0] + (h1.mid[0] - h1.tee[0]) * t, h1.tee[1] + (h1.mid[1] - h1.tee[1]) * t])));
    assert.ok(!/geolocation|watchPosition|coords/.test(read('gps-offline.js').replace(/^\s*\/\/.*$/gm, '')), 'no position anywhere in it');
});

test('no signal: nothing is asked, nothing is half-stored; no GPS data: no pack', { skip }, async () => {
    const off = sandbox({ online: false });
    assert.equal((await off.O.download('prestwick', { card: CARD })).reason, 'offline');
    assert.equal(off.requests.length, 0); assert.equal(off.O.status('prestwick'), null);
    assert.equal((await off.O.prefetchElevations('prestwick')).reason, 'offline');
    const none = sandbox();
    assert.equal((await none.O.download('nowhere_gc', { card: CARD })).reason, 'nogps');
    assert.equal(none.O.status('nowhere_gc'), null);
});

test('delete: the pack goes, and its tiles / heights - except those another downloaded course still uses', { skip }, async () => {
    const { O, store, cache } = sandbox();
    await O.download('prestwick', { card: CARD });
    await O.download('other', { card: CARD });     // same ground: shares every tile and point
    const tiles = O.status('prestwick').tiles, pts = O.status('prestwick').elevPoints;
    assert.equal(await O.remove('prestwick'), true);
    assert.equal(O.status('prestwick'), null);
    assert.ok(tiles.every((u) => cache.has(u)) && pts.every((k) => store[k]), 'still used by the other pack: kept');
    await O.remove('other');
    assert.ok(tiles.every((u) => !cache.has(u)) && pts.every((k) => !store[k]), 'the last one out removes them');
    assert.equal(store['hardpan_usgs_done_v1_other'], undefined);
});

test('a place with no USGS height ("no data") is kept as none - asked once, never again', { skip }, async () => {
    const t = sandbox({ noHeight: true });
    const r = await t.O.prefetchElevations('prestwick');
    assert.equal(r.elev.fetched, 90);
    const n = t.requests.length;
    await t.O.prefetchElevations('prestwick');
    assert.equal(t.requests.length, n, 'not asked again');
});

test('the GPS screen asks for NO height on the tee (elevOnTee: false) - the whole course once, when the round opens with signal; setup fetches them at pick; the download row is HardPan only', { skip }, () => {
    const v = read('gps-view.js'), a = read('admin.html'), c = read('gps-config.js');
    assert.ok(/function fetchElevs\(\) \{[\s\S]{0,400}if \(cfg\(\)\.elevOnTee === false\) return;/.test(v), 'no per-hole fetch on the tee');
    assert.ok(/elevOnTee: false/.test(c));
    assert.ok(/function prefetchCourseElevs\(\)[\s\S]{0,600}O\.prefetchElevations\(S\.courseKey/.test(v), 'once per course at round open');
    assert.ok(/O\.prefetchElevations\(key, name\)/.test(a), 'and at setup');
    const consumer = require('./tools/gps-flag.js').applyFlag(a, false);
    assert.ok(!/gpsOffline|gps-offline|Download for offline/.test(consumer), 'none of it in the Consumer app');
    assert.ok(/\/\/ GPS:BEGIN\s*\n\s*if \(typeof gpsOfflineCardFill === 'function'\) gpsOfflineCardFill\(id\);\s*\n\s*\/\/ GPS:END/.test(a), 'the card from the pack with no signal');
});
