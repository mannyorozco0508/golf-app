// ============================================================================
// 064 SEARCH - ONE CLUB, MORE THAN ONE COURSE (Starfire) + THE OSM-ONLY LIST (Goldendale), UNIT.
//
// Manny, typed in Claude Code: "Goldendale: fix A (show OSM-only courses as 'Not set up yet · Add this
// course'); apply to Starfire too."
//   1  gps-live find with the SAVED Starfire answer (gps_search/starfire_golf_club, Oct 23: King 18 +
//      Mulligan, both Scottsdale AZ) and our row's city guess "Paradise Valley": no clear match, but
//      oneClub - every match is our club, in our state (the city mismatch does not matter).
//   2  two different clubs by one name: not oneClub.
//   3  the OpenStreetMap coverage list the app ships: Goldendale Golf Club (WA) is there, keyless.
// The Cloud Function is stood in by a fake fetch (no network, no GolfAPI call, no database).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

// The answer our gpsSearch saved for "Starfire Golf Club" (064-6d, read-only copy of gps_search).
const KING = { id: '0121160834025376', club: 'Starfire Golf Club', course: 'King 18', name: 'Starfire Golf Club (King 18)', city: 'Scottsdale', state: 'AZ', holes: 18, gps: true };
const MULL = { id: '0111744455094783703', club: 'Starfire Golf Club', course: 'Mulligan', name: 'Starfire Golf Club (Mulligan)', city: 'Scottsdale', state: 'AZ', holes: 9, gps: true };

function liveWith(answers) {
    const calls = [];
    const store = {};
    const W = {
        HARDPAN_GPS_CONFIG: { live: true, golfapi: true, liveBase: 'https://example.invalid', liveTest: true },
        localStorage: { length: 0, key: () => null, getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        firebase: { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('tok') } }) },
    };
    const fetch = (url, init) => {
        const name = url.split('/').pop(), data = JSON.parse(init.body).data;
        calls.push([name, data]);
        const results = name === 'gpsSearch' ? (answers[data.name] || []) : [];
        return Promise.resolve({ json: () => Promise.resolve({ result: { status: 'ok', results } }) });
    };
    const ctx = { window: W, fetch, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Number, RegExp, Math, Date };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'gps-live.js'), 'utf8'), ctx);
    return { L: W.HardPanGpsLive, calls };
}

test('Starfire: the saved answer + our "Paradise Valley" guess -> no clear match, but ONE CLUB (King 18 + Mulligan)', async () => {
    const { L, calls } = liveWith({ 'Starfire Golf Club': [KING, MULL] });
    const f = await L.find('Starfire Golf Club', { city: 'Paradise Valley', state: 'AZ' });
    assert.equal(f.status, 'ok');
    assert.equal(f.clear, null, 'the city guess matches neither - no clear pick (as before)');
    assert.equal(f.oneClub, true, 'every match is Starfire Golf Club in AZ: one club, two courses');
    assert.deepEqual(f.matches.map((m) => m.id).sort(), [KING.id, MULL.id].sort());
    assert.deepEqual(calls.map((c) => c[0]), ['gpsSearch'], 'one search, the name only');
    assert.deepEqual(Object.keys(calls[0][1]), ['name'], 'no location leaves the phone');
});

test('two DIFFERENT clubs by one name are not one club', async () => {
    const OTHER = { id: '0999000111', club: 'Starfire Country Club West', course: 'West', name: 'Starfire Country Club West', city: 'Mesa', state: 'AZ', holes: 18, gps: true };
    const { L } = liveWith({ 'Starfire Golf Club': [KING, OTHER] });
    const f = await L.find('Starfire Golf Club', { city: 'Paradise Valley', state: 'AZ' });
    assert.equal(f.status, 'ok');
    assert.equal(f.oneClub, false);
});

test('one club, but one of its courses in another state: not one club', async () => {
    const { L } = liveWith({ 'Starfire Golf Club': [KING, Object.assign({}, MULL, { state: 'NV' })] });
    const f = await L.find('Starfire Golf Club', { city: 'Paradise Valley', state: 'AZ' });
    assert.equal(f.matches.length, 1, 'our state only (as before)');
    assert.equal(f.oneClub, true, 'the one left is our club');
});

test('clubKey: "(King 18)" and "golf club" are not the club', () => {
    const { L } = liveWith({});
    assert.equal(L.clubKey('Starfire Golf Club (King 18)'), 'starfire');
    assert.equal(L.clubKey('Starfire Golf Club'), 'starfire');
    assert.equal(L.clubKey('Talking Stick Golf Club'), 'talking stick');
});

test('Goldendale Golf Club is in the OpenStreetMap WA list the app ships (keyless - search shows it as "Not set up yet")', () => {
    const W = {};
    const ctx = { window: W };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'gps-coverage-wa.js'), 'utf8'), ctx);
    const rows = W.HardPanGpsCoverage.WA.rows.filter((r) => /goldendale/i.test(r[1]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1], 'Goldendale Golf Club');
    assert.equal(rows[0][2], 'Goldendale');
    const dir = fs.readFileSync(path.join(__dirname, 'course-data.js'), 'utf8');
    assert.doesNotMatch(dir, /goldendale/i, 'not in our directory: no key, no card');
});
