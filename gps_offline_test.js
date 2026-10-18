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
    // 009: the 5-point heights below are what the courseElev switch OFF gives; the whole-course
    // samples (the switch on, as it ships) have their own tests at the end (whole: true).
    const o = Object.assign({ online: true, ls: {}, cfg: { golfapi: true, osm: false, live: false, features: { courseElev: false } } }, opts || {});
    if (o.whole) o.cfg = Object.assign({}, o.cfg, { features: {}, elevGapMs: 0 });
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

// ---- 009: THE WHOLE COURSE'S HEIGHTS (switch courseElev, on as it ships) ----------------
function slowSandbox(opts) {
    // EPQS answers a few ms later; the most requests ever in flight at once is counted.
    const t = sandbox(Object.assign({ whole: true }, opts || {}));
    const inner = t.sb.fetch;
    t.maxBusy = 0; let busy = 0;
    t.sb.fetch = (url, o) => { busy++; t.maxBusy = Math.max(t.maxBusy, busy); return new Promise((ok) => setTimeout(ok, 2)).then(() => { busy--; return inner(url, o); }); };
    return t;
}
const pointOf = (u) => { const q = /x=([-\d.]+)&y=([-\d.]+)/.exec(u); return [Number(q[2]), Number(q[1])]; };

test('009: the constant the GPS screen reads the course record under is gps-offline\'s own', { skip }, () => {
    const { O } = sandbox();
    assert.ok(read('gps-view.js').includes(`var CELEV_PREFIX = '${O._const.CELEV_PREFIX}';`));
    assert.match(read('gps-config.js'), /courseElev: true/);
});

test('009: the course opened with signal - every hole sampled ONCE (tee, every 25 yds, green front / center / back), one request at a time, the hole on screen first', { skip }, async () => {
    const t = slowSandbox();
    const rec = t.sb.HardPanGeo.golfapiMatch(t.sb.HardPanGolfApi, 'prestwick', '', null, 18, null).record;
    const plan = t.sb.HardPanGeo.courseElevPoints(rec);
    const want = Object.values(plan).reduce((n, l) => n + l.length, 0);
    assert.ok(want >= 18 * 20, 'about 21 points a hole on a 437-yd hole: ' + want);
    const r = await t.O.prefetchElevations('prestwick', '', { first: 7 });
    assert.equal(r.whole, true); assert.equal(r.ok, true);
    assert.equal(t.requests.length, want, 'each course point once');
    assert.equal(t.maxBusy, 1, 'one at a time');
    const first = t.requests.slice(0, plan['7'].length).map(pointOf);
    assert.deepEqual(first, plan['7'].map((p) => [p[0], p[1]]), 'the hole on screen first');
    assert.ok(t.requests.every((u) => /^https:\/\/epqs\.nationalmap\.gov\/v1\/json\?x=/.test(u)), 'USGS EPQS only');
    // ONE compact key for the course, small; nothing under the old per-point keys.
    const keys = Object.keys(t.store);
    assert.deepEqual(keys, ['hardpan_celev_v1_prestwick']);
    assert.ok(t.store.hardpan_celev_v1_prestwick.length < 12000, 'compact: ' + t.store.hardpan_celev_v1_prestwick.length + ' bytes for 18 holes');
    const rc = JSON.parse(t.store.hardpan_celev_v1_prestwick);
    assert.equal(rc.done, true);
    // It decodes to the very heights EPQS gave, at the very points.
    const got = t.O.celevSamples('prestwick');
    assert.equal(got['1'].length, plan['1'].length);
    got['1'].forEach(([la, ln, ft], i) => { assert.deepEqual([la, ln], plan['1'][i]); assert.equal(ft, Math.round(la * 1000) % 100 + 20); });
    // Never fetched twice: a second open, a download - nothing asked.
    const n = t.requests.length;
    await t.O.prefetchElevations('prestwick', '');
    const d = await t.O.download('prestwick', { card: CARD });
    assert.equal(t.requests.filter((u) => /epqs/.test(u)).length, n, 'not asked again');
    assert.equal(d.pack.elevCourse, true);
    assert.deepEqual(Array.from(d.pack.elevPoints), []);
    await t.O.remove('prestwick');
    assert.ok(t.store.hardpan_celev_v1_prestwick, 'deleting the offline pack keeps the course\'s few-KB heights (never fetched twice)');
});

test('009: the samples are COURSE points - never the golfer; "no data" kept as none; no signal / outside the US: nothing asked (no fallback service)', { skip }, async () => {
    assert.ok(!/geolocation|watchPosition|coords/.test(read('gps-offline.js').replace(/^\s*\/\/.*$/gm, '')), 'no position anywhere in gps-offline.js');
    const t = slowSandbox({ noHeight: true });
    await t.O.prefetchElevations('prestwick', '');
    const n = t.requests.length;
    assert.ok(n > 0);
    assert.ok(JSON.parse(t.store.hardpan_celev_v1_prestwick).h['1'].filter((x, i) => i % 3 === 2).every((v) => v === null), 'none = null');
    await t.O.prefetchElevations('prestwick', '');
    assert.equal(t.requests.length, n, 'a none is not asked again');
    const off = slowSandbox({ online: false });
    assert.equal((await off.O.prefetchElevations('prestwick', '')).reason, 'offline');
    assert.equal(off.requests.length, 0);
    // Outside the US (a course at 56 N): no heights at all, and no other service is asked.
    const abroad = sandbox({ whole: true });
    abroad.sb.HardPanGolfApi.courses.SC = course('SC', 56.0);
    abroad.sb.HardPanGolfApi.courses.SC.lng = -4.6;
    Object.values(abroad.sb.HardPanGolfApi.courses.SC.h).forEach((h, i) => { const lng = -4.6 - i / 500; h.g = { f: [55.9999, lng], c: [56, lng], b: [56.0001, lng] }; h.t = { b: [55.9964, lng] }; });
    abroad.sb.HardPanGolfApi.links.troon = 'SC';
    const ra = await abroad.O.prefetchElevations('troon', '');
    assert.equal(abroad.requests.length, 0, 'outside the US: nothing asked');
    assert.equal(ra.elev.fetched, 0);
    const src = read('gps-offline.js');
    assert.ok(/Open-Meteo/.test(src) && /non-commercial/.test(src) && /HardPan is a paid app/.test(src), 'the reason is written down');
    assert.ok(!/open-meteo\.com/i.test(src.replace(/^\s*\/\/.*$/gm, '')), 'Open-Meteo is not called');
    assert.ok(!/elevFallbackUrl/.test(read('gps-config.js')), 'the fallback hook is left unset');
});

test('009: the switch off - the 5 points per hole, exactly as before', { skip }, async () => {
    const t = sandbox();   // courseElev: false
    const r = await t.O.prefetchElevations('prestwick');
    assert.equal(r.elev.fetched, 90);
    assert.equal(Object.keys(t.store).filter((k) => /celev/.test(k)).length, 0);
});

test('009: the GPS screen reads the course samples for the golfer, the target and the green - worked out on the phone; this hole first; off = as before', { skip }, () => {
    const v = read('gps-view.js');
    const sec = v.slice(v.indexOf('var CELEV_PREFIX'), v.indexOf('function lineElev('));
    assert.ok(/HardPanFeature\('courseElev'\)/.test(sec) && /G\.elevFromSamples\(sm, pt\)/.test(sec), 'interpolated here');
    assert.ok(!/fetch\(|\.ref\(|XMLHttpRequest/.test(sec), 'nothing sent from here');
    assert.ok(/if \(o\.from === 'tee'\) return ptElev\(r, r\.tee, 'tee'\);\s*\n\s*return ptElev\(r, o\.pt\);/.test(v), 'the golfer');
    assert.ok(/var to = targetPt \? ptElev\(r, targetPt\) : ptElev\(r, r\.mid, 'mid'\);/.test(v), 'the target / the green');
    assert.ok(/O\.prefetchElevations\(S\.courseKey, \(S\.round && S\.round\.courseName\) \|\| '', \{ first: S\.hole,/.test(v), 'this hole first');
    assert.ok(/function prefetchCourseElevs\(\) \{\s*if \(!S \|\| !S\.pro \|\| S\.elevPrefetch \|\| cfg\(\)\.elevOnTee !== false \|\| tournament\(\)\) return;/.test(v), 'GPS Map only, once, never in tournament mode');
});
