// ============================================================================
// gpsWind (firebase-functions/weather-core.js): Apple WeatherKit's token made and
// signed on the server, the course point only, the reading in the wind box's
// terms, one ask per course point per 10 minutes, NWS left to the app otherwise.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const W = require('./firebase-functions/weather-core.js');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const CREDS = { privateKey: PEM, keyId: 'KEY123', teamId: 'A2Z95T64UU', serviceId: 'com.rattlegolf.weather' };
const unb64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
// gpsWind needs the database since audit M5 (2026-10-16): the course must be one the
// server knows, and the golfer has a daily cap. A course at each point these tests ask about.
const ID1 = '012141521086298986065', ID2 = '0121415210000000001';
function knownDb() {
    const root = { gps_courses: { [ID1]: { id: ID1, lat: 33.45, lng: -79.153, h: {} }, [ID2]: { id: ID2, lat: 1, lng: 1, h: {} } } };
    const get = (p) => p.split('/').reduce((o, k) => (o == null ? null : o[k]), root);
    return { root, get: async (p) => { const v = get(p); return v === undefined ? null : v; },
        transaction: async (p, fn) => { const ks = p.split('/'); let o = root; ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); const r = fn(o[ks[ks.length - 1]] == null ? null : o[ks[ks.length - 1]]); if (r === undefined) return { committed: false }; o[ks[ks.length - 1]] = r; return { committed: true, value: r }; } };
}
const AT1 = { courseKey: 'gapi_' + ID1 }, AT2 = { courseKey: 'gapi_' + ID2 };

test('the token: ES256, kid / id / iss / sub as Apple asks, signed with the WeatherKit key, an hour long', () => {
    const t = W.makeToken(CREDS, 1800000000);
    const [h, c, sig] = t.split('.');
    assert.deepEqual(JSON.parse(unb64(h)), { alg: 'ES256', kid: 'KEY123', id: 'A2Z95T64UU.com.rattlegolf.weather' });
    assert.deepEqual(JSON.parse(unb64(c)), { iss: 'A2Z95T64UU', iat: 1800000000, exp: 1800003600, sub: 'com.rattlegolf.weather' });
    assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, unb64(sig)), 'the signature checks with the public key');
});

test('the reading: km/h -> mph, gusts, where it blows from and to, °F, when Apple measured it', () => {
    assert.deepEqual(W.readCurrent({ windSpeed: 12.9, windGust: 22.5, windDirection: 315, temperature: 18, asOf: '2026-10-14T13:05:00Z' }),
        { mph: 8, gustMph: 14, fromDeg: 315, toDeg: 135, tempF: 64, asOf: '2026-10-14T13:05:00Z' });
    assert.equal(W.readCurrent({ windDirection: 10 }), null);
});

test('gpsWind: signed-in only; the course point to 3 decimals; one ask per point per 10 minutes; off without the key; Apple refusing = unavailable', async () => {
    let t = 1800000000000; const asked = [];
    const fetchOk = async (u, o) => { asked.push({ u, auth: o.headers.Authorization }); return { ok: true, status: 200, json: async () => ({ currentWeather: { windSpeed: 12.9, windGust: 22.5, windDirection: 315, temperature: 18, asOf: '2026-10-14T13:05:00Z' } }) }; };
    const w = W.createWeather({ fetch: fetchOk, creds: () => CREDS, now: () => t, db: knownDb() });
    await assert.rejects(w.wind(null, { lat: 33.45, lon: -79.15 }), (e) => e.code === 'unauthenticated');
    await assert.rejects(w.wind({ uid: 'u' }, { lat: 'x', lon: 1 }), (e) => e.code === 'invalid-argument');
    const r = await w.wind({ uid: 'u' }, Object.assign({ lat: 33.450384, lon: -79.153438 }, AT1));
    assert.deepEqual([r.status, r.mph, r.gustMph, r.fromDeg, r.toDeg], ['ok', 8, 14, 315, 135]);
    assert.equal(asked[0].u, 'https://weatherkit.apple.com/api/v1/weather/en/33.45/-79.153?dataSets=currentWeather');
    assert.match(asked[0].auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    t += 9 * 60 * 1000;
    const again = await w.wind({ uid: 'v' }, Object.assign({ lat: 33.4504, lon: -79.1534 }, AT1));
    assert.deepEqual([again.cached, asked.length], [true, 1], 'another golfer at the same course within 10 minutes: no new ask');
    t += 2 * 60 * 1000;
    await w.wind({ uid: 'v' }, Object.assign({ lat: 33.4504, lon: -79.1534 }, AT1));
    assert.equal(asked.length, 2, 'after 10 minutes: asked again');
    assert.equal((await W.createWeather({ fetch: fetchOk, creds: () => ({ privateKey: '', keyId: '' }), db: knownDb() }).wind({ uid: 'u' }, Object.assign({ lat: 1, lon: 1 }, AT2))).status, 'off');
    const no = W.createWeather({ fetch: async () => ({ ok: false, status: 401 }), creds: () => CREDS, db: knownDb() });
    assert.deepEqual(await no.wind({ uid: 'u' }, Object.assign({ lat: 1, lon: 1 }, AT2)), { status: 'unavailable', http: 401 });
});

test('the app: off by default (NWS), the key never in the app, the course point only, Apple\'s attribution with its data', () => {
    const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
    if (!ON) return;
    const cfg = fs.readFileSync(path.join(__dirname, 'gps-config.js'), 'utf8'), live = fs.readFileSync(path.join(__dirname, 'gps-live.js'), 'utf8');
    const view = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.match(cfg, /weatherkit: false,/);
    assert.match(live, /function wind\(lat, lon, courseKey\) \{\s*var p = \{ lat: Math\.round\(Number\(lat\) \* 1e3\) \/ 1e3/);
    assert.ok(/window\.HardPanGpsLive\.wind\(pt\[0\], pt\[1\], S\.courseKey\)/.test(view), 'the COURSE point (coursePoint), never the golfer\'s fix - and the course it is, for the server\'s known-point check');
    assert.ok(/weatherkit\.apple\.com\/legal-attribution\.html/.test(view) && /src === 'weatherkit' \? '\\uF8FF Weather'/.test(view));
    for (const f of ['gps-view.js', 'gps-live.js', 'gps-config.js']) assert.ok(!/BEGIN PRIVATE KEY|WEATHERKIT_KEY/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')), f + ' carries no key');
});
