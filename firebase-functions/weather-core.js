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
//
// THE GUARDS (audit M5, 2026-10-16) - it used to answer any signed-in uid, for any
// point on Earth, as often as asked:
//   1. KNOWN COURSE POINTS ONLY. The app sends the round's course (courseKey, and
//      the GolfAPI courseId when it has one) with the point. The point must lie
//      within KNOWN_KM (5 km) of where the SERVER says that course is: the course
//      in gps_courses/<id> (its club point and its greens) - reached by the id, a
//      gapi_<id> key, or gps_links/<key> - or global_courses/<key>/location. The
//      simplest rule the database can answer in two or three reads, with no index
//      of every course; a course the server does not know (bundled-only / OSM-only)
//      answers 'unknown' and the app reads NWS, as it does whenever this is off.
//   2. A PER-GOLFER DAILY CAP: gps_meta/config.userWindPerDay (default 120 - a
//      4-hour round asks about 24 times), counted at gps_usage/<uid>/<day>/wind on
//      the Arizona day; owners (ALERT_UIDS / config.ownerUids) are not capped.
//   3. A BOUNDED CACHE: at most CACHE_MAX points in memory, the oldest dropped first.
// ============================================================================
'use strict';
const crypto = require('crypto');
const { dayKey, cleanConfig, ID_RE, KEY_RE } = require('./gps-live-core.js');

const KMH_TO_MPH = 0.621371;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const KNOWN_KM = 5;
const DEFAULT_WIND_PER_DAY = 120;

// Great-circle distance, km (haversine): plenty for "within 5 km".
function kmBetween(a, b) {
    const rad = Math.PI / 180, dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const okPt = (la, lo) => { la = Number(la); lo = Number(lo); return la || lo ? (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : null) : null; };
// Where a stored GolfAPI course is: its club point and every green centre.
function coursePoints(c) {
    const out = [];
    if (!c || typeof c !== 'object') return out;
    const p = okPt(c.lat, c.lng); if (p) out.push(p);
    const h = c.h && typeof c.h === 'object' ? c.h : {};
    Object.keys(h).forEach((k) => { const g = h[k] && h[k].g && h[k].g.c; const q = Array.isArray(g) ? okPt(g[0], g[1]) : null; if (q) out.push(q); });
    return out;
}

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

// opts: { fetch, creds: () => ({ privateKey, keyId, teamId, serviceId }), db, owners?: () => [uid], now? }
// NO db, NO WIND: the guards above need the database, so without one it answers 'off'.
function createWeather(opts) {
    const cache = new Map();
    const now = () => (opts.now ? opts.now() : Date.now());
    const db = opts.db || null;
    // The oldest point goes first once there are CACHE_MAX (a Map keeps insertion order).
    function remember(key, value) {
        cache.delete(key);
        cache.set(key, value);
        while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    // gps_meta/config, as gps-live-core reads it (60 s), for the cap and the owners.
    let cfgCache = null, cfgAt = 0;
    async function settings() {
        if (cfgCache && now() - cfgAt < 60000) return cfgCache;
        let raw = null;
        try { raw = await db.get('gps_meta/config'); } catch (e) { raw = null; }
        const c = cleanConfig(raw);
        cfgCache = { perDay: c.userWindPerDay != null ? c.userWindPerDay : DEFAULT_WIND_PER_DAY,
            owners: new Set([].concat(c.ownerUids || [], (opts.owners ? opts.owners() : []) || [])) };
        cfgAt = now();
        return cfgCache;
    }
    // Where the server says the round's course is (see THE GUARDS, 1).
    async function knownPoints(courseKey, courseId) {
        const ids = [], pts = [];
        if (ID_RE.test(courseId)) ids.push(courseId);
        const g = /^gapi_(\d{6,30})$/.exec(courseKey);
        if (g) ids.push(g[1]);
        else if (KEY_RE.test(courseKey)) {
            const linked = String((await db.get('gps_links/' + courseKey)) || '');
            if (ID_RE.test(linked)) ids.push(linked);
            const loc = await db.get('global_courses/' + courseKey + '/location');
            const p = loc && typeof loc === 'object' ? okPt(loc.latitude, loc.longitude) : null;
            if (p) pts.push(p);
        }
        for (const id of Array.from(new Set(ids))) pts.push(...coursePoints(await db.get('gps_courses/' + id)));
        return pts;
    }
    async function wind(auth, data) {
        if (!auth || !auth.uid) { const e = new Error('Sign in first.'); e.code = 'unauthenticated'; throw e; }
        const lat = Number(data && data.lat), lon = Number(data && data.lon);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { const e = new Error('lat / lon'); e.code = 'invalid-argument'; throw e; }
        if (!db) return { status: 'off' };
        // The course's point only: three decimals (~100 m) is all the wind needs.
        const la = Math.round(lat * 1e3) / 1e3, lo = Math.round(lon * 1e3) / 1e3, key = la + ',' + lo;
        const courseKey = String((data && data.courseKey) || ''), courseId = String((data && data.courseId) || '');
        const pts = await knownPoints(courseKey, courseId);
        if (!pts.some((p) => kmBetween(p, [la, lo]) <= KNOWN_KM)) return { status: 'unknown' };
        const uid = String(auth.uid), set = await settings();
        if (!set.owners.has(uid)) {
            const r = await db.transaction(`gps_usage/${uid}/${dayKey(now())}/wind`, (cur) => ((Number(cur) || 0) >= set.perDay ? undefined : (Number(cur) || 0) + 1));
            if (!r.committed) return { status: 'limit', max: set.perDay };
        }
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
        remember(key, { at: now(), reading });
        return Object.assign({ status: 'ok' }, reading);
    }
    return { wind, _cache: cache };
}

module.exports = { createWeather, makeToken, readCurrent, kmBetween, coursePoints, CACHE_MAX, KNOWN_KM };
