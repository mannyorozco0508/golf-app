// ============================================================================
// THE SERVER FIXES FROM THE AUDIT (Section A: H2, H3, H5, M5 - 2026-10-16)
//
//   H2  gpsSearch: a day's ceiling for EVERYONE (gps_meta/config.searchesPerDay),
//       App Check enforced, and an UNCACHED search needs a real account ('signin');
//   H3  gpsCourse: gps_links/<key> only by the ORGANIZER of a live round on that
//       course, never over an existing link unless an owner; gpsUnlink for owners;
//   M5  gpsWind: known course points only (5 km), a per-golfer daily cap, a
//       bounded cache;
//   H5  /api/push-send: a verified Firebase ID token, the caller's own devices read
//       by the server, the words from a server-side template.
//
// Every test here fails on the code before these fixes. No Firebase, no GolfAPI,
// no Apple, no Google: the database, fetch and the token keys are fakes, and the
// ID tokens are signed with a key made in this file.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const Module = require('module');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'firebase-functions', 'gps-live-core.js'));
const skip = ON ? false : 'Consumer tree: no GPS live functions';
// The (app) tests load gps-geo.js / gps-live.js, which a Consumer tree removes (functions stay).
const APP_ON = ['gps-geo.js', 'gps-match.js', 'gps-live.js'].every((f) => fs.existsSync(path.join(__dirname, f)));
const appSkip = APP_ON ? skip : 'Consumer tree: no GPS app files';

// ---- fakes ------------------------------------------------------------------
function fakeDb(seed) {
    const root = JSON.parse(JSON.stringify(seed || {}));
    const parts = (p) => p.split('/').filter(Boolean);
    const get = (p) => { let o = root; for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
    const set = (p, v) => {
        const ks = parts(p); let o = root;
        ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
        if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    let n = 0;
    return {
        root, get: async (p) => get(p), set: async (p, v) => set(p, v),
        update: async (p, v) => Object.keys(v).forEach((k) => set(p + '/' + k, v[k])),
        push: async (p, v) => set(p + '/k' + String(++n).padStart(6, '0'), v),
        transaction: async (p, fn) => { const r = fn(get(p)); if (r === undefined) return { committed: false, value: get(p) }; set(p, r); return { committed: true, value: get(p) }; },
    };
}
const PW = '012141521086298986065';
function fakeApi() {
    const api = { calls: [] };
    api.fetch = async (url) => {
        const ep = url.replace('https://www.golfapi.io/api/v2.3', '');
        api.calls.push(ep);
        let body;
        if (ep.startsWith('/clubs')) body = { apiRequestsLeft: '300', clubs: [{ clubName: 'Prestwick Golf Course', city: 'Myrtle Beach', state: 'SC', courses: [{ courseID: PW, courseName: 'Prestwick', numHoles: 18, hasGPS: 1, numCoordinates: 104 }] }] };
        else if (ep.startsWith('/courses/')) body = { apiRequestsLeft: '300', courseID: PW, clubName: 'Prestwick Golf Course', courseName: 'Prestwick', city: 'Myrtle Beach', state: 'SC', latitude: 33.643, longitude: -78.961, numHoles: 18,
            parsMen: Array(18).fill(4), indexesMen: Array.from({ length: 18 }, (_, i) => i + 1), tees: [] };
        else body = { apiRequestsLeft: '300', coordinates: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, poi: 1, location: 2, latitude: 33.64 + i / 1000, longitude: -78.96 })) };
        return { ok: true, status: 200, json: async () => body };
    };
    return api;
}
const T0 = Date.UTC(2026, 9, 16, 15, 0, 0);
function setup(seed, opts) {
    const { createCore } = require('./firebase-functions/gps-live-core.js');
    const db = fakeDb(seed), api = fakeApi(), pushes = [];
    let t = T0;
    const core = createCore({ db, fetch: api.fetch, key: () => 'k', now: () => t, notify: async (k, d) => pushes.push([k, d]), owners: () => (opts && opts.owners) || [] });
    return { core, db, api, pushes, tick: (ms) => { t += ms; } };
}
const real = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'apple.com' } } });
const guest = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'anonymous' } } });
const MANNY = real('uMANNY');

// ============================================================================
// H2 - gpsSearch
// ============================================================================
test('H2: a day\'s ceiling on UNCACHED searches for everyone (config searchesPerDay); rotating uids cannot pass it; owners can; the golfer is not charged for it', { skip }, async () => {
    const { core, api, db, pushes } = setup({ gps_meta: { config: { searchesPerDay: 3 } } }, { owners: ['uOWNER'] });
    const names = ['Prestwick', 'Talking Stick', 'Legacy', 'Dunes', 'Thistle'];
    for (let i = 0; i < 3; i++) assert.equal((await core.search(real('uROT' + i), { name: names[i] })).status, 'ok', 'search ' + (i + 1));
    const over = await core.search(real('uROT9'), { name: names[3] });
    assert.deepEqual([over.status, over.results], ['searchcap', []], 'a fresh uid is still stopped by the day');
    assert.equal(api.calls.length, 3, 'no GolfAPI call past the ceiling');
    assert.equal(db.root.gps_usage.uROT9['20261016'].searches, 0, 'the golfer\'s own count is given back');
    assert.ok(db.root.gps_alerts['searchcap_20261016'] && pushes.some((p) => p[0] === 'searchcap'), 'Manny is told');
    assert.equal((await core.search(real('uOWNER'), { name: names[4] })).status, 'ok', 'an owner passes the ceiling');
    assert.equal(db.root.gps_meta.day['20261016'].searches, 4, 'and is still counted');
    assert.equal((await core.search(real('uROT9'), { name: names[0] })).status, 'ok', 'a CACHED answer is never capped');
});

test('H2: the default ceiling is 200 a day and the config may move it within sane bounds only', { skip }, () => {
    const { DEFAULTS, cleanConfig } = require('./firebase-functions/gps-live-core.js');
    assert.equal(DEFAULTS.searchesPerDay, 200);
    assert.equal(DEFAULTS.searchNeedsAccount, true);
    assert.equal(cleanConfig({ searchesPerDay: 500 }).searchesPerDay, 500);
    assert.equal(cleanConfig({ searchesPerDay: 1e9 }).searchesPerDay, undefined, 'a typo never lifts it to a million');
    assert.equal(cleanConfig({ searchNeedsAccount: false }).searchNeedsAccount, false);
});

test('H2: an UNCACHED search needs a real account - a guest gets status signin and spends nothing; a cached answer still serves the guest', { skip }, async () => {
    const { core, api, db } = setup();
    const g = await core.search(guest('uGUEST1'), { name: 'Prestwick' });
    assert.deepEqual([g.status, g.results], ['signin', []]);
    assert.equal(api.calls.length, 0, 'no GolfAPI call for an anonymous uid');
    assert.equal((db.root.gps_usage || {}).uGUEST1, undefined, 'nothing counted');
    assert.equal((await core.search(MANNY, { name: 'Prestwick' })).status, 'ok');
    const cached = await core.search(guest('uGUEST2'), { name: 'prestwick' });
    assert.equal(cached.status, 'ok'); assert.equal(cached.results[0].id, PW);
    assert.equal(api.calls.length, 1, 'the guest read the cache');
    const owner = setup({}, { owners: ['uGUESTOWNER'] });
    assert.equal((await owner.core.search(guest('uGUESTOWNER'), { name: 'Prestwick' })).status, 'ok', 'an owner listed by uid is let through');
});

// index.js loaded against stand-ins for firebase-functions / firebase-admin, so the
// options each callable is DECLARED with are read, not grepped.
function loadIndex() {
    const declared = {};
    const stubs = {
        'firebase-functions/v2/https': { onCall: (o, fn) => ({ __opts: o, __fn: fn }), HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } },
        'firebase-functions/params': { defineSecret: (n) => ({ name: n, value: () => '' }), defineString: (n) => ({ name: n, value: () => '' }) },
        'firebase-admin': { initializeApp: () => {}, database: () => ({}), messaging: () => ({}) },
    };
    const orig = Module._load;
    Module._load = function (req, parent, isMain) { return Object.prototype.hasOwnProperty.call(stubs, req) ? stubs[req] : orig.apply(this, arguments); };
    try {
        const file = require.resolve('./firebase-functions/index.js');
        delete require.cache[file];
        const m = require(file);
        Object.keys(m).forEach((k) => { declared[k] = m[k].__opts; });
        delete require.cache[file];
        return { declared, exports: m };
    } finally { Module._load = orig; }
}

test('H2: App Check is ENFORCED on gpsSearch, gpsCourse, gpsWind and gpsUnlink', { skip }, () => {
    const { declared } = loadIndex();
    for (const f of ['gpsSearch', 'gpsCourse', 'gpsWind', 'gpsUnlink']) {
        assert.ok(declared[f], f + ' is exported');
        assert.strictEqual(declared[f].enforceAppCheck, true, f + ' refuses a call with no App Check token');
    }
    assert.deepEqual(declared.gpsWind.secrets.map((s) => s.name), ['WEATHERKIT_KEY'], 'gpsWind keeps its own secret');
});

// ---- the app's side (gps-live.js) ----------------------------------------------
function sandbox(opts) {
    const o = Object.assign({ db: {}, user: { uid: 'uA' }, ls: {} }, opts || {});
    const requests = [], reads = [], store = o.ls;
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const firebase = {
        auth: () => ({ currentUser: o.user ? { uid: o.user.uid, getIdToken: () => Promise.resolve('ID-' + o.user.uid) } : null }),
        database: () => ({ ref: (p) => ({ once: () => { reads.push(p); const v = p.split('/').reduce((a, k) => (a == null ? null : a[k]), o.db); return Promise.resolve({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) }); } }) }),
    };
    if (o.appCheck) firebase.appCheck = () => ({ getToken: () => Promise.resolve({ token: o.appCheck }) });
    const sb = { localStorage, firebase, HARDPAN_GPS_CONFIG: { golfapi: true, osm: false, live: true, liveBase: 'https://fn.example', liveTest: true }, navigator: { onLine: true }, setTimeout, clearTimeout, AbortController, Promise, JSON, Object, Date, Math, Number, String, RegExp,
        fetch: (url, init) => { requests.push({ url, init, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o.reply ? o.reply(url, JSON.parse(init.body)) : { result: { status: 'ok', results: [] } }) }); } };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb);
    vm.runInContext(read('gps-match.js'), sb);
    vm.runInContext(read('gps-live.js'), sb);
    return { sb, L: sb.HardPanGpsLive, requests, reads };
}

test('H2 (app): the App Check token goes along when the app has App Check; the new answers read as plain words', { skip: appSkip }, async () => {
    const t = sandbox({ appCheck: 'AC-TOKEN' });
    await t.L.search('Prestwick');
    assert.equal(t.requests[0].init.headers['X-Firebase-AppCheck'], 'AC-TOKEN');
    const none = sandbox();
    await none.L.search('Prestwick');
    assert.equal(none.requests[0].init.headers['X-Firebase-AppCheck'], undefined, 'no SDK: no header, and no throw');
    assert.match(t.L.message('signin'), /Sign in \(Apple, Google or email\)/);
    assert.match(t.L.message('searchcap'), /courses already set up still work/);
    assert.notEqual(t.L.message('searchcap'), t.L.message('whatever'), 'searchcap has words of its own');
    assert.match(t.L.message('denied'), /admin/);
});

// ============================================================================
// H3 - gpsCourse links, gpsUnlink
// ============================================================================
const OURS = { global_courses: { gca_1: { name: 'Prestwick CC', data: [] } } };
async function linkWith(events, who, input, opts) {
    const s = setup(Object.assign({}, OURS, { events: events || {} }, (opts && opts.seed) || {}), opts);
    await s.core.search(MANNY, { name: 'Prestwick' });
    const r = await s.core.course(who, Object.assign({ courseId: PW, ourKey: 'gca_1' }, input));
    return Object.assign(s, { r, link: (s.db.root.gps_links || {}).gca_1 });
}

test('H3: no round, no link - a guest (or anyone) asking for a course with our key no longer links it', { skip }, async () => {
    const g = await linkWith({}, guest('uGUEST'), {});
    assert.equal(g.r.status, 'account', 'a guest still may not pull');
    const m = await linkWith({}, MANNY, {});
    assert.equal(m.r.status, 'ready', 'the course still comes back');
    assert.equal(m.link, undefined, 'but with no round code nothing is linked');
});

test('H3: the ORGANIZER of a live round on that course links it; anyone else, another course, a replaced or deleted round: refused', { skip }, async () => {
    const ok = await linkWith({ ABC123: { ownerUid: 'uMANNY', activeCourseKey: 'gca_1' } }, MANNY, { roundCode: 'abc123' });
    assert.equal(ok.link, PW, 'the organizer of a round on gca_1 links it (code case does not matter)');
    const cases = [
        [{ ABC123: { ownerUid: 'uSOMEONE', activeCourseKey: 'gca_1' } }, 'not the organizer'],
        [{ ABC123: { ownerUid: 'uMANNY', activeCourseKey: 'gca_2' } }, 'a round on another course'],
        [{ ABC123: { ownerUid: 'uMANNY', activeCourseKey: 'gca_1', supersededBy: 'XYZ999' } }, 'a replaced round'],
        [{}, 'a deleted (absent) round'],
        [{ ABC123: { activeCourseKey: 'gca_1' } }, 'a legacy round with no ownerUid'],
    ];
    for (const [events, why] of cases) {
        const s = await linkWith(events, MANNY, { roundCode: 'ABC123' });
        assert.equal(s.r.status, 'ready', why + ': the course still comes back');
        assert.equal(s.link, undefined, why + ': no link');
    }
    const s = setup(OURS);
    await assert.rejects(s.core.course(MANNY, { courseId: PW, ourKey: 'gca_1', roundCode: '../x' }), (e) => e.code === 'invalid-argument');
});

test('H3: an existing link is never overwritten - except by an owner (ALERT_UIDS / config.ownerUids)', { skip }, async () => {
    const ev = { ABC123: { ownerUid: 'uMANNY', activeCourseKey: 'gca_1' } };
    const kept = await linkWith(ev, MANNY, { roundCode: 'ABC123' }, { seed: { gps_links: { gca_1: '0000000001' } } });
    assert.equal(kept.link, '0000000001', 'the organizer cannot replace a link');
    const boss = await linkWith({}, real('uBOSS'), {}, { seed: { gps_links: { gca_1: '0000000001' } }, owners: ['uBOSS'] });
    assert.equal(boss.link, PW, 'an owner replaces it, round or not');
    assert.ok(Object.values(boss.db.root.gps_log).some((l) => l.act === 'link' && l.result === 'relinked' && l.was === '0000000001'), 'and it is logged');
});

test('H3: gpsUnlink - owners only; it removes gps_links/<key> and nothing else', { skip }, async () => {
    const s = setup({ gps_links: { gca_1: PW, gca_2: PW } }, { owners: ['uBOSS'] });
    assert.equal(typeof s.core.unlink, 'function');
    assert.deepEqual(await s.core.unlink(MANNY, { ourKey: 'gca_1' }), { status: 'denied' });
    assert.equal(s.db.root.gps_links.gca_1, PW, 'a golfer cannot unlink');
    await assert.rejects(s.core.unlink(null, { ourKey: 'gca_1' }), (e) => e.code === 'unauthenticated');
    await assert.rejects(s.core.unlink(real('uBOSS'), { ourKey: 'a/b' }), (e) => e.code === 'invalid-argument');
    assert.deepEqual(await s.core.unlink(real('uBOSS'), { ourKey: 'gca_1' }), { status: 'ok', was: PW });
    assert.deepEqual(s.db.root.gps_links, { gca_2: PW });
    assert.ok(loadIndex().declared.gpsUnlink, 'deployed as its own callable');
});

test('H3 (app): the round code goes with the course key; after the save linkRound offers the link again for 0 GolfAPI calls, only when needed', { skip: appSkip }, async () => {
    const COURSE = { id: PW, h: { 1: { g: { c: [33.64, -78.96] } } } };
    const t = sandbox({ reply: (u, b) => ({ result: { status: 'ready', course: COURSE, cardKey: null } }) });
    await t.L.course(PW, 'gca_1', 'abc123');
    assert.deepEqual(t.requests[0].body, { data: { courseId: PW, ourKey: 'gca_1', roundCode: 'ABC123' } });
    await t.L.course(PW, null, 'ABC123');
    assert.deepEqual(t.requests[1].body, { data: { courseId: PW } }, 'no key: no round code either');
    assert.equal(await t.L.linkRound('ABC123', 'gca_1'), true);
    assert.deepEqual(t.requests[2].body, { data: { courseId: PW, ourKey: 'gca_1', roundCode: 'ABC123' } }, 'a course this phone got from the function: cached, 0 calls');
    const have = sandbox({ db: { gps_links: { gca_1: PW } }, reply: () => ({ result: { status: 'ready', course: COURSE } }) });
    await have.L.course(PW, 'gca_1');
    await have.L.linkRound('ABC123', 'gca_1');
    assert.equal(have.requests.length, 1, 'already linked in the database: no call');
    const never = sandbox();
    assert.equal(await never.L.linkRound('ABC123', 'gca_9'), false, 'a course the phone did not get from the function: never a pull');
    assert.equal(never.requests.length, 0);
    const a = read('admin.html');
    assert.match(a, /L\.course\(x\.id, key, currentMode\)/);
    const at = a.indexOf('recordSavedRound(currentMode);\n');
    const after = a.slice(at, at + 600);
    assert.match(after, /\/\/ GPS:BEGIN[\s\S]*window\.HardPanGpsLive\.linkRound\(currentMode, payload\.activeCourseKey\)[\s\S]*\/\/ GPS:END/, 'after the round is saved, GPS-only');
});

// ============================================================================
// M5 - gpsWind
// ============================================================================
const W = (() => { try { return require('./firebase-functions/weather-core.js'); } catch (e) { return null; } })();
const PEM = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const CREDS = { privateKey: PEM, keyId: 'K', teamId: 'T', serviceId: 'S' };
function windRig(seed, opts) {
    const asked = [];
    const db = fakeDb(seed);
    let t = T0;
    const w = W.createWeather({ db, creds: () => CREDS, now: () => t, owners: () => (opts && opts.owners) || [],
        fetch: async (u) => { asked.push(u); return { ok: true, status: 200, json: async () => ({ currentWeather: { windSpeed: 10, windDirection: 90, temperature: 20 } }) }; } });
    return { w, db, asked, tick: (ms) => { t += ms; } };
}
const COURSES = { gps_courses: { [PW]: { id: PW, lat: 33.643, lng: -78.961, h: { 1: { g: { c: [33.64, -78.96] } } } } }, gps_links: { gca_1: PW },
    global_courses: { az_x: { name: 'X', location: { latitude: 33.5, longitude: -111.9 } } } };

test('M5: wind only for a point within 5 km of a course the SERVER knows (gps_courses by id / gapi_ key / gps_links, or global_courses location)', { skip }, async () => {
    const { w, asked } = windRig(COURSES);
    const u = { uid: 'u1' };
    assert.equal((await w.wind(u, { lat: 40.7, lon: -74.0 })).status, 'unknown', 'any point on Earth, no course: refused');
    assert.equal((await w.wind(u, { lat: 40.7, lon: -74.0, courseKey: 'gca_1' })).status, 'unknown', 'a real course, a point 900 km away: refused');
    assert.equal(asked.length, 0, 'Apple is never asked for those');
    assert.equal((await w.wind(u, { lat: 33.641, lon: -78.96, courseKey: 'gca_1' })).status, 'ok', 'linked course, its own point');
    assert.equal((await w.wind(u, { lat: 33.67, lon: -78.97, courseKey: 'gapi_' + PW })).status, 'ok', '3 km from its greens');
    assert.equal((await w.wind(u, { lat: 33.70, lon: -78.96, courseKey: 'whatever', courseId: PW })).status, 'unknown', '6 km: refused');
    assert.equal((await w.wind(u, { lat: 33.501, lon: -111.9, courseKey: 'az_x' })).status, 'ok', 'a saved card\'s location');
    assert.equal(W.kmBetween([33.64, -78.96], [33.69, -78.96]) > 5, true);
});

test('M5: a per-golfer daily cap (gps_meta/config.userWindPerDay, default 120); owners are not capped; a new day resets it', { skip }, async () => {
    const { w, db, tick } = windRig(Object.assign({ gps_meta: { config: { userWindPerDay: 2 } } }, COURSES), { owners: ['uBOSS'] });
    const at = { lat: 33.641, lon: -78.96, courseKey: 'gca_1' };
    assert.equal((await w.wind({ uid: 'u1' }, at)).status, 'ok');
    assert.equal((await w.wind({ uid: 'u1' }, at)).status, 'ok');
    assert.deepEqual(await w.wind({ uid: 'u1' }, at), { status: 'limit', max: 2 }, 'even a cached point counts: the cap is on the golfer');
    assert.equal(db.root.gps_usage.u1['20261016'].wind, 2);
    for (let i = 0; i < 4; i++) assert.equal((await w.wind({ uid: 'uBOSS' }, at)).status, 'ok', 'owner');
    tick(86400000);
    assert.equal((await w.wind({ uid: 'u1' }, at)).status, 'ok', 'tomorrow');
    const dflt = windRig(COURSES);
    for (let i = 0; i < 120; i++) await dflt.w.wind({ uid: 'u2' }, at);
    assert.equal((await dflt.w.wind({ uid: 'u2' }, at)).status, 'limit', 'the 121st of the day');
});

test('M5: the cache holds at most 500 points, the oldest dropped first; no database, no wind', { skip }, async () => {
    const { w, asked } = windRig(COURSES, { owners: ['u1'] });
    assert.equal(W.CACHE_MAX, 500);
    const pts = [];
    for (let i = 0; i < 23 && pts.length < 501; i++) for (let j = 0; j < 23 && pts.length < 501; j++) pts.push({ lat: Math.round((33.63 + i / 1000) * 1e3) / 1e3, lon: Math.round((-78.97 + j / 1000) * 1e3) / 1e3 });
    for (const p of pts) assert.equal((await w.wind({ uid: 'u1' }, Object.assign({ courseKey: 'gca_1' }, p))).status, 'ok');
    assert.equal(w._cache.size, 500, 'bounded');
    assert.equal(w._cache.has(pts[0].lat + ',' + pts[0].lon), false, 'the oldest went first');
    const n = asked.length;
    assert.equal((await w.wind({ uid: 'u1' }, Object.assign({ courseKey: 'gca_1' }, pts[500]))).cached, true, 'the newest is still kept');
    assert.equal(asked.length, n);
    const bare = W.createWeather({ fetch: async () => { throw new Error('never'); }, creds: () => CREDS });
    assert.deepEqual(await bare.wind({ uid: 'u' }, { lat: 1, lon: 1 }), { status: 'off' }, 'the guards need the database');
});

test('M5 (app): the wind ask names the round\'s course (key and GolfAPI id), still never the golfer\'s position', { skip: appSkip }, async () => {
    const t = sandbox({ db: {}, ls: { hardpan_gpslive_link_v1_gca_1: JSON.stringify(PW) } });
    await t.L.wind(33.64123, -78.96011, 'gca_1');
    assert.deepEqual(t.requests[0].body, { data: { lat: 33.641, lon: -78.96, courseKey: 'gca_1', courseId: PW } });
    assert.match(read('gps-view.js'), /window\.HardPanGpsLive\.wind\(pt\[0\], pt\[1\], S\.courseKey\)/);
});

// ============================================================================
// H5 - /api/push-send
// ============================================================================
const subtle = globalThis.crypto.subtle;
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let KEYS = null;
async function keys() {
    if (KEYS) return KEYS;
    const pair = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = await subtle.exportKey('jwk', pair.publicKey);
    const other = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    KEYS = { pair, other, jwks: { keys: [Object.assign({}, jwk, { kid: 'kid-1', alg: 'RS256', use: 'sig' })] } };
    return KEYS;
}
const NOW = Date.UTC(2026, 9, 16, 18, 0, 0), NOW_S = Math.floor(NOW / 1000);
async function idToken(over, signWith, kid) {
    const k = await keys();
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: kid || 'kid-1', typ: 'JWT' }));
    const claims = b64u(JSON.stringify(Object.assign({ iss: 'https://securetoken.google.com/golfapp-9fb21', aud: 'golfapp-9fb21', sub: 'uMANNY', user_id: 'uMANNY',
        iat: NOW_S - 60, exp: NOW_S + 3000, auth_time: NOW_S - 600 }, over || {})));
    const sig = await subtle.sign('RSASSA-PKCS1-v1_5', (signWith || k.pair).privateKey, new TextEncoder().encode(header + '.' + claims));
    return header + '.' + claims + '.' + b64u(sig);
}
const SA = (() => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return JSON.stringify({ client_email: 'fcm@golfapp-9fb21.iam.gserviceaccount.com', project_id: 'golfapp-9fb21', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
})();
// Google, FCM and the database, all fake: what was asked and what was posted.
function pushNet(tokensInDb) {
    const net = { asked: [], sent: [] };
    net.fetch = async (url, init) => {
        net.asked.push(url);
        if (url === 'https://oauth2.googleapis.com/token') return { ok: true, json: async () => ({ access_token: 'AT' }) };
        if (/^https:\/\/fcm\.googleapis\.com\//.test(url)) { net.sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; }
        if (/^https:\/\/golfapp-9fb21-default-rtdb\.firebaseio\.com\/pushTokens\//.test(url)) return { ok: true, json: async () => tokensInDb };
        throw new Error('no network in tests: ' + url);
    };
    return net;
}
async function send(body, opts) {
    const M = await import('./functions/api/_push.js');
    const k = await keys();
    const net = pushNet(opts && 'db' in opts ? opts.db : { dev1: { token: 'TOKEN-OF-MY-PHONE', playerId: '', at: 1 } });
    const out = await M.handleSend(Object.assign({ env: { FCM_SERVICE_ACCOUNT: SA }, now: NOW, fetch: net.fetch, jwks: async () => k.jwks }, body));
    return { out, net };
}

test('H5: no ID token, or one that is not Google\'s for this project and alive: refused, and nothing is sent', async () => {
    const k = await keys();
    const cases = [
        [null, 'no token'],
        ['not.a.jwt', 'garbage'],
        [await idToken({ aud: 'some-other-project' }), 'another project'],
        [await idToken({ iss: 'https://securetoken.google.com/some-other-project' }), 'another issuer'],
        [await idToken({ exp: NOW_S - 1 }), 'expired'],
        [await idToken({ iat: NOW_S + 3600 }), 'issued in the future'],
        [await idToken({ sub: '' }), 'no uid'],
        [await idToken({}, k.other), 'signed by someone else\'s key'],
    ];
    for (const [tok, why] of cases) {
        const { out, net } = await send({ idToken: tok, template: 'test' });
        assert.equal(out.status, 'refused', why);
        assert.equal(net.sent.length, 0, why + ': nothing sent');
        assert.equal(net.asked.length, 0, why + ': nothing even asked');
    }
    const unknown = await send({ idToken: await idToken({}, null, 'kid-unknown'), template: 'test' });
    assert.deepEqual(unknown.out, { status: 'refused', reason: 'unknown_key' });
});

test('H5: a verified caller is sent the TEMPLATE\'s words, on the devices the SERVER reads for that uid - never tokens or words from the body', async () => {
    const tok = await idToken();
    const { out, net } = await send({ idToken: tok, template: 'test', params: {}, tokens: ['ATTACKER-TOKEN'], decided: { send: true, copy: { title: 'Pay', body: 'Send $500 to ...' } } });
    assert.equal(out.status, 'ok'); assert.equal(out.sent, 1);
    const dbRead = net.asked.find((u) => /firebaseio\.com\/pushTokens\//.test(u));
    assert.equal(dbRead, 'https://golfapp-9fb21-default-rtdb.firebaseio.com/pushTokens/uMANNY.json?auth=' + encodeURIComponent(tok), 'the caller\'s own node, read with the caller\'s own token');
    assert.deepEqual(net.sent.map((m) => m.message.token), ['TOKEN-OF-MY-PHONE']);
    assert.deepEqual(net.sent[0].message.notification, { title: "You're in", body: 'Test notification, right now' });
    assert.ok(!JSON.stringify(net.sent).includes('ATTACKER') && !JSON.stringify(net.sent).includes('$500'));
    assert.equal(net.sent[0].message.data.test, '1');
    const none = await send({ idToken: tok, template: 'test' }, { db: null });
    assert.deepEqual(none.out, { status: 'unavailable', reason: 'no_device' });
});

test('H5: templates are a closed list with checked parameters; other recipients (round code + player ids) are refused', async () => {
    const tok = await idToken();
    for (const [body, reason] of [
        [{}, 'bad_template'], [{ template: 'free-text' }, 'bad_template'], [{ template: 'constructor' }, 'bad_template'],
        [{ template: 'test', params: { body: 'hi' } }, 'bad_params'], [{ template: 'test', params: 'x' }, 'bad_params'],
        [{ template: 'test', roundCode: 'ABC123', recipients: ['p1'] }, 'recipients_unsupported'],
    ]) {
        const { out, net } = await send(Object.assign({ idToken: tok }, body));
        assert.deepEqual(out, { status: 'refused', reason }, JSON.stringify(body));
        assert.equal(net.sent.length, 0);
    }
    const T = await import('./functions/api/_push_templates.js');
    assert.deepEqual(Object.keys(T.TEMPLATES), ['test']);
});

test('H5: the route passes the Bearer token through and a refusal is a 401, not a 503; with no secret it is still not_configured', async () => {
    const route = await import('./functions/api/push-send.js');
    const req = (h, body) => ({ method: 'POST', headers: { get: (k) => (k === 'Origin' ? 'capacitor://localhost' : (k === 'Authorization' ? h : null)) }, json: async () => body });
    const res = await route.onRequestPost({ request: req(null, { template: 'test' }), env: { FCM_SERVICE_ACCOUNT: SA } });
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(await res.text()), { status: 'refused', reason: 'signin' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    const off = await route.onRequestPost({ request: req('Bearer x', { template: 'test' }), env: {} });
    assert.equal(JSON.parse(await off.text()).reason, 'not_configured');
});

test('H5 (app): the test button sends its ID token and the template id - no tokens, no words', () => {
    const a = read('admin.html');
    const at = a.indexOf('async function sendTestNotification()');
    const fn = a.slice(at, a.indexOf('\n    function ', at + 30));
    assert.match(fn, /authorization: 'Bearer ' \+ idToken/);
    assert.match(fn, /body: JSON\.stringify\(\{ template: 'test', params: \{\} \}\)/);
    assert.ok(!/JSON\.stringify\(\{ decided/.test(fn), 'the old open-relay shape (decided + tokens in the body) is gone');
    const callers = fs.readdirSync(__dirname).filter((f) => /\.(html|js)$/.test(f) && !/_test\.js$|\.test\.js$/.test(f) && f !== 'sw.js')
        .filter((f) => read(f).includes("/api/push-send'"));
    assert.deepEqual(callers, ['admin.html'], 'the one caller of the route');
});
