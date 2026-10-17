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
    const core = createCore({ db, fetch: api.fetch, key: () => KEY, now: () => t, notify: async (k, d) => pushes.push([k, d]), cfg: (opts && opts.cfg) || {}, owners: () => (opts && opts.owners) || [] });
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
    // A GUEST GETS CACHED ANSWERS ONLY (audit H2, 2026-10-16): past 30 days a guest's search
    // would call GolfAPI, so it is 'signin' - and a real account's asks again.
    tick(2 * 86400000); assert.equal((await core.search(GUEST, { name: 'Prestwick' })).status, 'signin');
    assert.equal(api.calls.length, 1, 'a guest never spends a call');
    await core.search(MANNY, { name: 'Prestwick' });
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
    await core.search(MANNY, { name: 'Prestwick' });   // a guest may not make the uncached search (audit H2)
    assert.equal((await core.course(GUEST, { courseId: PW })).status, 'account');
    assert.equal(api.calls.length, 1);
    const open = setup({}, { cfg: { pullNeedsAccount: false } });
    await open.core.search(MANNY, { name: 'Prestwick' });
    assert.equal((await open.core.course(GUEST, { courseId: PW })).status, 'ready', 'one setting');
});

test('caps: 15 new courses per golfer per day, 50 a day for everyone; tomorrow it starts again; a failed pull is not counted', { skip }, quiet(async () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(1000000000 + i));
    const seed = { gps_meta: { known: Object.fromEntries(ids.map((id) => [id, { gps: true, holes: 18 }])) } };
    const { core, db, tick, pushes } = setup(seed);
    for (let i = 0; i < 15; i++) assert.equal((await core.course(MANNY, { courseId: ids[i] })).status, 'ready');
    const over = await core.course(MANNY, { courseId: ids[15] });
    assert.equal(over.status, 'limit'); assert.equal(over.max, 15);
    assert.equal(over.message, "You've hit your daily limit for new GPS courses. You can still play and score this round; GPS for new courses resets tomorrow.");
    assert.ok(db.root.gps_alerts['userlimit_uMANNY_20261011'], 'Manny is told when anyone hits it');
    assert.ok(pushes.some((p) => p[0] === 'userlimit_uMANNY'));
    assert.equal((await core.course(MANNY, { courseId: ids[0] })).status, 'ready', 'a course already pulled never counts');
    let n = 15;
    for (let u = 0; n < 50; u++) for (let i = 0; i < 15 && n < 50; i++, n++) {
        const who = { uid: 'u' + u, token: { firebase: { sign_in_provider: 'google.com' } } };
        assert.equal((await core.course(who, { courseId: ids[n] })).status, 'ready');
    }
    const other = { uid: 'uLATE', token: { firebase: { sign_in_provider: 'password' } } };
    assert.equal((await core.course(other, { courseId: ids[50] })).status, 'soon', 'the day\'s ceiling (50)');
    assert.ok(db.root.gps_alerts['daycap_20261011']);
    assert.equal(db.root.gps_usage.uLATE['20261011'].pulls, 0, 'not counted against the golfer');
    tick(86400000);
    assert.equal((await core.course(MANNY, { courseId: ids[15] })).status, 'ready', 'a new day');
}));

test('the OWNER (ALERT_UIDS) has no per-golfer cap and passes the day\'s ceiling - but the floor still stops everyone, and every pull is still counted', { skip }, quiet(async () => {
    const ids = Array.from({ length: 25 }, (_, i) => String(2000000000 + i));
    const seed = { gps_meta: { known: Object.fromEntries(ids.map((id) => [id, { gps: true, holes: 18 }])) } };
    const { core, db } = setup(seed, { owners: ['uMANNY'] });
    for (let i = 0; i < 20; i++) assert.equal((await core.course(MANNY, { courseId: ids[i] })).status, 'ready', 'pull ' + (i + 1));
    assert.equal(db.root.gps_usage.uMANNY['20261011'].pulls, 20, 'counted, not capped');
    // The day's ceiling: owners pass it too (Manny, 2026-10-11), and their pulls still count toward it.
    const day = setup({ gps_meta: Object.assign({}, seed.gps_meta, { day: { 20261011: { pulls: 50 } } }) }, { owners: ['uMANNY'] });
    assert.equal((await day.core.course(MANNY, { courseId: ids[21] })).status, 'ready', 'past the 50-a-day ceiling');
    assert.equal(day.db.root.gps_meta.day['20261011'].pulls, 51);
    const golfer = { uid: 'uOTHER', token: { firebase: { sign_in_provider: 'google.com' } } };
    assert.equal((await day.core.course(golfer, { courseId: ids[22] })).status, 'soon', 'everyone else still stops at the ceiling');
    const low = setup({ gps_meta: Object.assign({}, seed.gps_meta, { left: 51 }) }, { owners: ['uMANNY'], left: 51 });
    assert.equal((await low.core.course(MANNY, { courseId: ids[0] })).status, 'soon', '51 left - 2 is under the floor: even the owner waits');
}));

test('the limits are SETTINGS: gps_meta/config overrides the defaults (read again within a minute); nonsense is ignored', { skip }, quiet(async () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(3000000000 + i));
    const seed = { gps_meta: { known: Object.fromEntries(ids.map((id) => [id, { gps: true, holes: 18 }])), config: { userPullsPerDay: 2, floor: 0, pullsPerDay: 'lots', ownerUids: 'uBOSS1' } } };
    const { core, db, tick } = setup(seed);
    assert.equal((await core.course(MANNY, { courseId: ids[0] })).status, 'ready');
    assert.equal((await core.course(MANNY, { courseId: ids[1] })).status, 'ready');
    const third = await core.course(MANNY, { courseId: ids[2] });
    assert.deepEqual([third.status, third.max], ['limit', 2], 'the database said 2');
    const boss = { uid: 'uBOSS1', token: { firebase: { sign_in_provider: 'apple.com' } } };
    for (let i = 3; i < 6; i++) assert.equal((await core.course(boss, { courseId: ids[i] })).status, 'ready', 'an owner listed in the config');
    db.root.gps_meta.config.userPullsPerDay = 3;
    assert.equal((await core.course(MANNY, { courseId: ids[2] })).status, 'limit', 'still cached');
    tick(61000);
    assert.equal((await core.course(MANNY, { courseId: ids[2] })).status, 'ready', 'a minute later: 3');
    const { cleanConfig } = require('./firebase-functions/gps-live-core.js');
    assert.deepEqual(cleanConfig({ floor: 0, userPullsPerDay: 1e9, pullsPerDay: -1, searchDays: 'x' }), { ownerUids: [] }, 'a typo never lifts the floor or the caps');
}));

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
    // Since audit H3 (2026-10-16) a link needs the organizer's round on that course
    // (functions_security_test.js has the refusals).
    const { core, db } = setup({ global_courses: { gca_123: { name: 'Prestwick CC', data: [] } }, events: { ABC123: { ownerUid: 'uMANNY', activeCourseKey: 'gca_123' } } });
    await core.search(MANNY, { name: 'Prestwick' });
    await core.course(MANNY, { courseId: PW, ourKey: 'gca_123', roundCode: 'ABC123' });
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

// ---- BUILD 12 (2026-10-10): what Manny's phone hit ------------------------------
// The Realtime Database hands holes "1".."18" back as an ARRAY with [0] empty.
const asFirebase = (c) => Object.assign({}, c, { h: [null].concat(Array.from({ length: 18 }, (_, i) => c.h[String(i + 1)])) });

test('a cached course comes back from Firebase with holes as an ARRAY ([0] empty): the phone gets an object keyed 1..18', { skip }, async () => {
    const { core, db } = setup();
    await core.search(MANNY, { name: 'Prestwick' });
    await core.course(MANNY, { courseId: PW });
    db.root.gps_courses[PW] = asFirebase(db.root.gps_courses[PW]);   // what the database really stores / returns
    const r = await core.course(GUEST, { courseId: PW });
    assert.equal(r.status, 'ready');
    assert.ok(!Array.isArray(r.course.h), 'an object');
    assert.deepEqual(Object.keys(r.course.h), Array.from({ length: 18 }, (_, i) => String(i + 1)));
    assert.deepEqual(r.course.h['1'].g.c, [33.64, -78.96]);
});

test('an interrupted pull is not paid for twice: the /courses answer is kept, a retry asks only for /coordinates (cost 1), then it is cleared', { skip }, async () => {
    const { core, api, db } = setup();
    await core.search(MANNY, { name: 'Prestwick' });
    // The first attempt dies after /courses (the coordinates call fails).
    const realFetch = api.fetch;
    let failCoords = true;
    const { createCore } = require('./firebase-functions/gps-live-core.js');
    const flaky = createCore({ db, key: () => KEY, now: () => T0, fetch: (u, i) => (failCoords && /\/coordinates\//.test(u) ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : realFetch(u, i)) });
    const first = await quietly(() => flaky.course(MANNY, { courseId: PW }));
    assert.equal(first.status, 'error');
    assert.ok(db.root.gps_meta.partial[PW].course, 'the /courses answer is kept');
    assert.equal(db.root.gps_usage.uMANNY['20261011'].pulls, 0, 'a failed pull is not counted');
    failCoords = false;
    const before = api.calls.length;
    const again = await flaky.course(MANNY, { courseId: PW });
    assert.equal(again.status, 'ready');
    assert.deepEqual(api.calls.slice(before), ['/coordinates/' + PW], 'only the missing call');
    assert.equal((db.root.gps_meta.partial || {})[PW], undefined, 'cleared once complete');
    const log = Object.values(db.root.gps_log).filter((l) => l.act === 'course' && /^pulled/.test(l.result || ''));
    assert.deepEqual(log.map((l) => [l.cost, l.result]), [[1, 'pulled (resumed)']]);
});
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// ---- BUILD 13 (2026-10-11): RATED TEES - the Players step offers a tee only with a rating AND a slope ----
test('the card carries RATED tees in the import shape (men\'s ratings -> male, women\'s -> female); the raw answer is kept, so a later fix costs 0 calls', { skip }, async () => {
    const { core, db, api } = setup();
    const realFetch = api.fetch;
    const { createCore } = require('./firebase-functions/gps-live-core.js');
    const rated = createCore({ db, key: () => KEY, now: () => T0, fetch: async (u, i) => {
        const r = await realFetch(u, i);
        if (!/\/courses\//.test(u)) return r;
        const b = await r.json();
        b.parsWomen = b.parsMen.slice(); b.indexesWomen = b.indexesMen.slice();
        b.tees = [{ teeName: 'Black', courseRatingMen: '74.9', slopeMen: '140', length1: 383, length2: 448 },
            { teeName: 'Red', courseRatingMen: 66.3, slopeMen: 115, courseRatingWomen: 70.5, slopeWomen: 126, length1: 300 },
            { teeName: 'Unrated', length1: 350 }];
        return { ok: true, status: 200, json: async () => b };
    } });
    await core.search(MANNY, { name: 'Prestwick' });
    assert.equal((await rated.course(MANNY, { courseId: PW })).status, 'ready');
    const card = db.root.global_courses['gapi_' + PW];
    assert.deepEqual(card.tees.male.map((t) => [t.name, t.rating, t.slope, t.parTotal]), [['Black', 74.9, 140, 72], ['Red', 66.3, 115, 72], ['Unrated', undefined, undefined, 72]],
        'numbers, not strings; an unrated tee is kept for its yards but round setup will not offer it');
    assert.deepEqual(card.tees.female.map((t) => [t.name, t.rating, t.slope]), [['Red', 70.5, 126]], 'only tees GolfAPI rates for women');
    assert.equal(card.tees.male[0].holes[1].yardage, 448);
    assert.ok(db.root.gps_meta.raw[PW].course.tees, 'the raw /courses answer is kept (server only)');
    assert.equal(db.root.gps_courses[PW].tees[0].rm, 74.9, 'and the cached course keeps the ratings');
});

test('the backfill tool rewrites ONLY the tees, spends a GolfAPI call only with --allow-call, and never prints the key', { skip }, () => {
    const src = fs.readFileSync(path.join(__dirname, 'tools/gps-live-backfill.js'), 'utf8');
    assert.ok(/if \(!allowCall\) \{ console\.log\(`\$\{id\} \(\$\{card\.name\}\): no kept raw answer - needs ONE GolfAPI call/.test(src), 'no call without --allow-call');
    assert.ok(/set\('\/gps_courses\/' \+ id \+ '\/tees', s\.tees\);\s*\n\s*set\('\/global_courses\/gapi_' \+ id \+ '\/tees', fresh\.tees\);/.test(src), 'only the two tees nodes are written');
    assert.ok(!/console\.\w+\([^)]*\bkey\b/.test(src), 'the key is never printed');
    assert.ok(/'database:get'/.test(src) && !/database:remove|'--only'/.test(src), 'reads / sets through the Firebase CLI; no removes, no deploys');
});

test('the day is ARIZONA\'s: limits reset at midnight Phoenix (UTC-7, no daylight saving), not at 5 PM', { skip }, () => {
    const { dayKey } = require('./firebase-functions/gps-live-core.js');
    assert.equal(dayKey(Date.UTC(2026, 9, 11, 23, 59)), '20261011', '4:59 PM Phoenix Oct 11 - before the old 5 PM reset');
    assert.equal(dayKey(Date.UTC(2026, 9, 12, 0, 30)), '20261011', '5:30 PM Phoenix: still Oct 11 (UTC would have said Oct 12)');
    assert.equal(dayKey(Date.UTC(2026, 9, 12, 6, 59)), '20261011', '11:59 PM Phoenix');
    assert.equal(dayKey(Date.UTC(2026, 9, 12, 7, 0)), '20261012', 'midnight Phoenix: a new day');
    assert.equal(dayKey(Date.UTC(2026, 6, 4, 7, 0)), '20260704', 'July too - Arizona keeps no daylight saving');
});
