// ============================================================================
// HARDPAN GPS LIVE - THE CLOUD FUNCTIONS' GUARDS (gps-live, 2026-10-10)
//
// firebase-functions/gps-live-core.js against a FAKE database and a FAKE GolfAPI
// that counts every call: signed-in only, search on a tap and cached, 5 new
// courses per golfer per day, 25 a day for everyone, the floor of 50 (and the
// alert), only courses a search returned with GPS, one pull per course, every
// call logged, the key never in a log, the card in global_courses' own shape.
// No Firebase, no network, no GolfAPI call.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'firebase-functions');
const ON = fs.existsSync(path.join(DIR, 'gps-live-core.js'));
const skip = ON ? false : 'Consumer tree: no GPS live functions';

// A Realtime Database in memory: get / set / update / push / transaction.
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
const KEY = 'test-key-never-logged-0123';
function fakeApi(opts) {
    const o = Object.assign({ left: 400 }, opts || {});
    const api = { calls: [], left: o.left };
    api.fetch = async (url, init) => {
        assert.equal(init.headers.Authorization, 'Bearer ' + KEY);
        const ep = url.replace('https://www.golfapi.io/api/v2.3', '');
        api.calls.push(ep);
        api.left -= ep.startsWith('/clubs') ? 0.1 : 1;
        const left = String(Math.round(api.left * 10) / 10);   // a STRING, as GolfAPI sends it
        let body;
        if (ep.startsWith('/clubs')) body = { apiRequestsLeft: left, clubs: [
            { clubName: 'Prestwick Golf Course', city: 'Myrtle Beach', state: 'SC', courses: [{ courseID: '012141521086298986065', courseName: 'Prestwick', numHoles: 18, hasGPS: 1, numCoordinates: 104 }] },
            { clubName: 'Talking Stick Golf Club', city: 'Scottsdale', state: 'AZ', courses: [
                { courseID: '01214152063997488954', courseName: 'North - O Odham', numHoles: 18, hasGPS: 1, numCoordinates: 120 },
                { courseID: '012141520639939791440', courseName: 'South - Piipaash', numHoles: 18, hasGPS: 1, numCoordinates: 117 }] },
            { clubName: 'Nowhere Muni', city: 'Tucson', state: 'AZ', courses: [{ courseID: '0999999999', courseName: 'Nowhere Muni', numHoles: 18, hasGPS: 0, numCoordinates: 0 }] }] };
        else if (ep.startsWith('/courses/')) body = { apiRequestsLeft: left, courseID: ep.split('/')[2], clubName: 'Prestwick Golf Course', courseName: 'Prestwick', city: 'Myrtle Beach', state: 'SC',
            latitude: 33.643, longitude: -78.961, numHoles: 18, parsMen: [4, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4], indexesMen: [9, 1, 5, 7, 11, 15, 13, 17, 3, 10, 14, 12, 18, 4, 8, 16, 2, 6],
            tees: [{ teeName: 'Black', teeColor: '#000', length1: 383, length2: 448 }, { teeName: 'White / Green' }] };
        else body = { apiRequestsLeft: left, coordinates: [].concat(...Array.from({ length: 18 }, (_, i) => [
            { hole: i + 1, poi: 1, location: 2, latitude: 33.64 + i / 1000, longitude: -78.96 }, { hole: i + 1, poi: 12, location: 2, latitude: 33.645 + i / 1000, longitude: -78.96 }])) };
        return { ok: true, status: 200, json: async () => body };
    };
    return api;
}
const T0 = Date.UTC(2026, 9, 11, 15, 0, 0);
function setup(seed, opts) {
    const { createCore } = require('./firebase-functions/gps-live-core.js');
    const db = fakeDb(seed), api = fakeApi(opts), pushes = [];
    let t = T0;
    const core = createCore({ db, fetch: api.fetch, key: () => KEY, now: () => t, notify: async (k, d) => pushes.push([k, d]), cfg: (opts && opts.cfg) || {} });
    return { core, db, api, pushes, tick: (ms) => { t += ms; } };
}
const MANNY = { uid: 'uMANNY', token: { firebase: { sign_in_provider: 'apple.com' } } };
const GUEST = { uid: 'uGUEST', token: { firebase: { sign_in_provider: 'anonymous' } } };
const PW = '012141521086298986065';
const quiet = (fn) => async () => { const e = console.error; console.error = () => {}; try { await fn(); } finally { console.error = e; } };

test('signed in only: no Firebase user, no search and no course', { skip }, async () => {
    const { core, api } = setup();
    await assert.rejects(core.search(null, { name: 'Prestwick' }), (e) => e.code === 'unauthenticated');
    await assert.rejects(core.course(undefined, { courseId: PW }), (e) => e.code === 'unauthenticated');
    await assert.rejects(core.search(MANNY, { name: 'ab' }), (e) => e.code === 'invalid-argument', 'too short');
    await assert.rejects(core.course(MANNY, { courseId: '../gps_meta' }), (e) => e.code === 'invalid-argument', 'an id is digits');
    await assert.rejects(core.course(MANNY, { courseId: PW, ourKey: 'a/b' }), (e) => e.code === 'invalid-argument');
    assert.equal(api.calls.length, 0);
});

test('search: one GolfAPI call (0.1), then the same name from anyone is free for 30 days; same-club courses apart; GPS flag from hasGPS and points', { skip }, async () => {
    const { core, api, db, tick } = setup();
    const r = await core.search(MANNY, { name: 'Prestwick' });
    assert.equal(r.status, 'ok'); assert.deepEqual(api.calls, ['/clubs?name=Prestwick&country=usa']);
    const ts = r.results.filter((x) => x.club === 'Talking Stick Golf Club').map((x) => x.name);
    assert.deepEqual(ts, ['Talking Stick Golf Club (North - O Odham)', 'Talking Stick Golf Club (South - Piipaash)'], 'two entries, not one club');
    assert.equal(r.results.find((x) => x.id === PW).gps, true);
    assert.equal(r.results.find((x) => x.id === '0999999999').gps, false, 'hasGPS 0 / no points: no GPS');
    assert.equal(r.results[0].cached, false);
    await core.search(GUEST, { name: '  prestwick ' });
    tick(29 * 86400000); await core.search(GUEST, { name: 'PRESTWICK' });
    assert.equal(api.calls.length, 1, 'cached: same name, any golfer, any spacing or case');
    tick(2 * 86400000); await core.search(GUEST, { name: 'Prestwick' });
    assert.equal(api.calls.length, 2, 'after 30 days it is asked again');
    assert.equal(db.root.gps_meta.left, 399.8, 'calls left, read as a NUMBER');
    assert.equal(db.root.gps_meta.known[PW].gps, true, 'what a search returned is what may be pulled');
});

test('a course: 2 calls the first time, 0 after, for every golfer; cached in gps_courses in the app\'s shape; the scorecard in global_courses', { skip }, async () => {
    const { core, api, db } = setup();
    await core.search(MANNY, { name: 'Prestwick' });
    const r = await core.course(MANNY, { courseId: PW });
    assert.equal(r.status, 'ready'); assert.equal(r.cardKey, 'gapi_' + PW);
    assert.deepEqual(api.calls.slice(1), ['/courses/' + PW, '/coordinates/' + PW]);
    const c = db.root.gps_courses[PW];
    assert.equal(c.id, PW); assert.equal(c.club, 'Prestwick Golf Course'); assert.deepEqual(c.h['1'].g.c, [33.64, -78.96]); assert.deepEqual(c.h['1'].t.b, [33.645, -78.96]);
    assert.deepEqual(r.course, c, 'the phone gets exactly what is stored');
    const card = db.root.global_courses['gapi_' + PW];
    assert.equal(card.name, 'Prestwick Golf Course (Prestwick)');
    assert.equal(card.data.length, 18); assert.deepEqual(card.data[1], { hole: 2, par: 4, hcpIndex: 1 });
    assert.equal(card.source.provider, 'golfapi'); assert.equal(card.source.providerCourseId, PW);
    assert.deepEqual(card.tees.male.map((t) => t.name), ['Black'], 'a tee with no yards is left out');
    assert.equal(card.tees.male[0].holes[0].yardage, 383);
    const again = await core.course(GUEST, { courseId: PW });
    assert.equal(again.status, 'ready'); assert.equal(again.cardKey, 'gapi_' + PW);
    assert.equal(api.calls.length, 3, 'cached: 0 calls - even for a guest');
    assert.equal((db.root.gps_meta.lock || {})[PW], undefined, 'the lock is released');
});

test('only a course a search returned, with GPS: no blind pulls, no pulls of a course without GPS', { skip }, async () => {
    const { core, api } = setup();
    assert.equal((await core.course(MANNY, { courseId: PW })).status, 'unknown', 'never searched: refused');
    await core.search(MANNY, { name: 'Prestwick' });
    assert.equal((await core.course(MANNY, { courseId: '0999999999' })).status, 'nogps');
    assert.equal(api.calls.length, 1, 'only the search');
});

test('a NEW pull needs a real account (anonymous uids are free to mint); a guest still gets cached courses', { skip }, async () => {
    const { core, api } = setup();
    await core.search(GUEST, { name: 'Prestwick' });
    assert.equal((await core.course(GUEST, { courseId: PW })).status, 'account');
    assert.equal(api.calls.length, 1);
    const open = setup({}, { cfg: { pullNeedsAccount: false } });
    await open.core.search(GUEST, { name: 'Prestwick' });
    assert.equal((await open.core.course(GUEST, { courseId: PW })).status, 'ready', 'one setting');
});

test('caps: 5 new courses per golfer per day, 25 a day for everyone; tomorrow it starts again; a failed pull is not counted', { skip }, async () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(1000000000 + i));
    const seed = { gps_meta: { known: Object.fromEntries(ids.map((id) => [id, { gps: true, holes: 18 }])) } };
    const { core, db, tick } = setup(seed);
    for (let i = 0; i < 5; i++) assert.equal((await core.course(MANNY, { courseId: ids[i] })).status, 'ready');
    const sixth = await core.course(MANNY, { courseId: ids[5] });
    assert.equal(sixth.status, 'limit'); assert.equal(sixth.max, 5);
    assert.equal((await core.course(MANNY, { courseId: ids[0] })).status, 'ready', 'a course already pulled never counts');
    let n = 5;
    for (let u = 0; n < 25; u++) for (let i = 0; i < 5 && n < 25; i++, n++) {
        const who = { uid: 'u' + u, token: { firebase: { sign_in_provider: 'google.com' } } };
        assert.equal((await core.course(who, { courseId: ids[n] })).status, 'ready');
    }
    const other = { uid: 'uLATE', token: { firebase: { sign_in_provider: 'password' } } };
    await quiet(async () => assert.equal((await core.course(other, { courseId: ids[25] })).status, 'soon', 'the day\'s ceiling'))();
    assert.ok(db.root.gps_alerts['daycap_20261011'], 'Manny is told');
    assert.equal(db.root.gps_usage.uLATE['20261011'].pulls, 0, 'not counted against the golfer');
    tick(86400000);
    assert.equal((await core.course(MANNY, { courseId: ids[5] })).status, 'ready', 'a new day');
});

test('the floor: below 50 calls left nothing is pulled ("GPS coming soon"), Manny is alerted ONCE a day with a push and an ERROR line', { skip }, quiet(async () => {
    const { core, api, db, pushes } = setup({}, { left: 52.3 });
    await core.search(MANNY, { name: 'Prestwick' });                 // 52.2 left
    const r = await core.course(MANNY, { courseId: PW });           // needs 2: 50.2 left after - allowed
    assert.equal(r.status, 'ready');
    assert.equal(db.root.gps_meta.left, 50.2);
    await core.search(MANNY, { name: 'Talking' });                  // 50.1
    const s = await core.course(MANNY, { courseId: '01214152063997488954' });
    assert.equal(s.status, 'soon', '50.1 - 2 is under the floor');
    assert.equal(api.calls.filter((c) => !c.startsWith('/clubs')).length, 2, 'no call for it');
    await core.course(MANNY, { courseId: '012141520639939791440' });
    assert.equal(pushes.filter((p) => p[0] === 'floor').length, 1, 'one push a day, not one per tap');
    assert.ok(db.root.gps_alerts['floor_20261011'].left < 52);
    assert.equal((await core.course(GUEST, { courseId: PW })).status, 'ready', 'cached courses keep working below the floor');
    const low = setup({}, { left: 40 });
    low.db.root.gps_meta = { left: 40 };
    assert.equal((await low.core.search(MANNY, { name: 'Prestwick' })).status, 'soon', 'below the floor a NEW search waits too');
    assert.equal(low.api.calls.length, 0);
}));

test('one pull per course: a second phone tapping during the pull is told to wait, and no call is spent twice', { skip }, async () => {
    const { core, api, db } = setup();
    await core.search(MANNY, { name: 'Prestwick' });
    db.root.gps_meta.lock = { [PW]: { at: T0 - 1000, uid: 'uOTHER' } };
    assert.equal((await core.course(MANNY, { courseId: PW })).status, 'busy');
    assert.equal(api.calls.length, 1);
    assert.equal(db.root.gps_usage.uMANNY['20261011'].pulls, 0, 'not counted');
});

test('every call is logged (who, what, cost, calls left) - and the key never is', { skip }, async () => {
    const { core, db } = setup();
    await core.search(MANNY, { name: 'Prestwick' });
    await core.course(MANNY, { courseId: PW });
    await core.course(GUEST, { courseId: PW });
    const log = Object.values(db.root.gps_log);
    assert.ok(log.some((l) => l.act === 'call' && l.endpoint === '/clubs' && l.cost === 0.1 && l.left === 399.9 && l.uid === 'uMANNY'));
    assert.ok(log.some((l) => l.act === 'course' && l.result === 'pulled' && l.cost === 2 && l.id === PW));
    assert.ok(log.some((l) => l.act === 'course' && l.result === 'cache' && l.cost === 0 && l.uid === 'uGUEST'));
    assert.ok(!JSON.stringify(db.root).includes(KEY), 'the key is nowhere in the database');
    const src = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'gps-live-core.js'), 'utf8');
    assert.ok(/defineSecret\('GOLFAPI_KEY'\)/.test(src), 'from Secret Manager');
    assert.ok(!/console\.\w+\([^)]*key\(\)/.test(src), 'never printed');
});

test('links: our course key -> its GolfAPI course, first link wins, only for a course of ours', { skip }, async () => {
    const { core, db } = setup({ global_courses: { gca_123: { name: 'Prestwick CC', data: [] } } });
    await core.search(MANNY, { name: 'Prestwick' });
    await core.course(MANNY, { courseId: PW, ourKey: 'gca_123' });
    assert.equal(db.root.gps_links.gca_123, PW);
    await core.course(MANNY, { courseId: '012141520639939791440', ourKey: 'nope_key' });
    assert.equal(db.root.gps_links.nope_key, undefined, 'not one of our courses');
});

test('the card: only when it passes the database\'s own rule (18 holes, par 3-6, handicaps 1-18 once each)', { skip }, () => {
    const { cardRecord } = require('./firebase-functions/gps-live-core.js');
    const s = { id: '1', club: 'X', course: 'X', city: '', state: '', lat: 0, lng: 0, holes: 18, pars: Array(18).fill(4), hcp: Array.from({ length: 18 }, (_, i) => i + 1), tees: [] };
    assert.equal(cardRecord(s, 1).name, 'X');
    assert.equal(cardRecord(Object.assign({}, s, { hcp: Array(18).fill(1) }), 1), null, 'repeated handicaps');
    assert.equal(cardRecord(Object.assign({}, s, { pars: Array(18).fill(0) }), 1), null, 'no pars');
    assert.equal(cardRecord(Object.assign({}, s, { holes: 9, pars: Array(9).fill(4), hcp: Array(9).fill(1) }), 1), null, '9 holes: typed, v1');
});

test('one stripCourse: the Mac puller and the functions share it; deploy names only these functions', { skip }, () => {
    const P = require('./tools/golfapi-pull.js'), S = require('./firebase-functions/golfapi-strip.js');
    assert.equal(P.stripCourse, S.stripCourse); assert.equal(P.leftOf, S.leftOf);
    const fj = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase.json'), 'utf8'));
    assert.equal(fj.functions[0].source, 'firebase-functions');
    assert.equal(fj.database.rules, 'database.rules.json');
    assert.ok(/firebase deploy --only functions:gps-live:gpsSearch,functions:gps-live:gpsCourse/.test(fs.readFileSync(path.join(DIR, 'index.js'), 'utf8')));
    assert.ok(/node_modules/.test(fs.readFileSync(path.join(DIR, '.gitignore'), 'utf8')));
});
