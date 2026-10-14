// ============================================================================
// HARDPAN GPS - LIVE WIND FROM APPLE WEATHERKIT (gpsWind), server side only.
//
// Apple's WeatherKit REST API needs a JSON Web Token signed (ES256) with the
// WeatherKit private key from Certificates, Identifiers & Profiles. The key, its
// id, the team id and the service id live in Secret Manager / params and are read
// here at call time; the token is made here and never leaves the server. The app
// sends the COURSE's point (three decimals) and gets back the wind - nothing else.
//
// Free: 500,000 calls a month come with the Apple Developer Program membership;
// past that Apple refuses calls (a paid tier is a subscription the Account Holder
// chooses - nothing is billed by itself). Answers are kept 10 minutes per course
// point, so a group of golfers asks Apple once.
//
// Apple's terms: wherever the data is shown, the Apple Weather mark and the link
// to its other data sources (the app's wind sheet does this).
// ============================================================================
'use strict';
const crypto = require('crypto');

const KMH_TO_MPH = 0.621371;
const CACHE_MS = 10 * 60 * 1000;

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

// The token Apple asks for: header { alg ES256, kid, id: team.service }, claims { iss: team,
// sub: service, iat, exp }. Signed with the P-256 key, raw (r || s) signature.
function makeToken(o, nowSec) {
    const iat = nowSec || Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: o.keyId, id: o.teamId + '.' + o.serviceId };
    const claims = { iss: o.teamId, iat, exp: iat + 3600, sub: o.serviceId };
    const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
    const sig = crypto.sign('sha256', Buffer.from(data), { key: o.privateKey, dsaEncoding: 'ieee-p1363' });
    return data + '.' + b64url(sig);
}

// Apple's currentWeather -> the wind box's reading: mph, gusts, where it blows TO and FROM,
// the temperature, and when Apple measured it.
function readCurrent(cw) {
    if (!cw || typeof cw.windSpeed !== 'number' || typeof cw.windDirection !== 'number') return null;
    const fromDeg = ((Math.round(cw.windDirection) % 360) + 360) % 360;
    return {
        mph: Math.round(cw.windSpeed * KMH_TO_MPH),
        gustMph: typeof cw.windGust === 'number' ? Math.round(cw.windGust * KMH_TO_MPH) : null,
        fromDeg, toDeg: (fromDeg + 180) % 360,
        tempF: typeof cw.temperature === 'number' ? Math.round(cw.temperature * 9 / 5 + 32) : null,
        asOf: cw.asOf || null
    };
}

// opts: { fetch, creds: () => ({ privateKey, keyId, teamId, serviceId }), now? }
function createWeather(opts) {
    const cache = new Map();
    const now = () => (opts.now ? opts.now() : Date.now());
    async function wind(auth, data) {
        if (!auth || !auth.uid) { const e = new Error('Sign in first.'); e.code = 'unauthenticated'; throw e; }
        const lat = Number(data && data.lat), lon = Number(data && data.lon);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { const e = new Error('lat / lon'); e.code = 'invalid-argument'; throw e; }
        // The course's point only: three decimals (~100 m) is all the wind needs.
        const la = Math.round(lat * 1e3) / 1e3, lo = Math.round(lon * 1e3) / 1e3, key = la + ',' + lo;
        const hit = cache.get(key);
        if (hit && now() - hit.at < CACHE_MS) return Object.assign({ status: 'ok', cached: true }, hit.reading);
        const c = opts.creds();
        if (!c || !c.privateKey || !c.keyId || !c.teamId || !c.serviceId) return { status: 'off' };
        const token = makeToken(c, Math.floor(now() / 1000));
        const url = 'https://weatherkit.apple.com/api/v1/weather/en/' + la + '/' + lo + '?dataSets=currentWeather';
        const res = await opts.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!res || !res.ok) return { status: 'unavailable', http: res ? res.status : 0 };
        const reading = readCurrent((await res.json()).currentWeather);
        if (!reading) return { status: 'unavailable' };
        cache.set(key, { at: now(), reading });
        return Object.assign({ status: 'ok' }, reading);
    }
    return { wind };
}

module.exports = { createWeather, makeToken, readCurrent };
