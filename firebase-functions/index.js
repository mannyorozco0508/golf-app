// ============================================================================
// HARDPAN GPS LIVE - THE TWO CLOUD FUNCTIONS (Firebase golfapp-9fb21, 2nd gen)
//
//   gpsSearch({ name })              -> { status, results[] }
//   gpsCourse({ courseId, ourKey? }) -> { status, course, cardKey }
//
// The GolfAPI key is the Secret Manager secret GOLFAPI_KEY: set it once with
//   firebase functions:secrets:set GOLFAPI_KEY
// It is read here at call time and never logged, returned or stored.
// Callable functions refuse a call with no Firebase ID token before this code
// runs; gps-live-core.js checks request.auth again and does everything else.
//
//   gpsWind({ lat, lon })            -> { status, mph, gustMph, fromDeg, toDeg, tempF, asOf }
//     Apple WeatherKit (weather-core.js). NOT DEPLOYED until Manny's OK. Needs, once:
//       firebase functions:secrets:set WEATHERKIT_KEY      (the .p8 file's text)
//       WEATHERKIT_KEY_ID, WEATHERKIT_TEAM_ID, WEATHERKIT_SERVICE_ID  (params, in .env.<project>)
//     and the app's gps-config.js weatherkit: true. Without them the app uses NWS.
//
// DEPLOY ONLY THESE:  firebase deploy --only functions:gps-live:gpsSearch,functions:gps-live:gpsCourse
//   (gpsWind, when approved: firebase deploy --only functions:gps-live:gpsWind)
// (a bare `firebase deploy` would also publish database.rules.json)
// ============================================================================
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { createCore } = require('./gps-live-core.js');
const { createWeather } = require('./weather-core.js');

admin.initializeApp();
const GOLFAPI_KEY = defineSecret('GOLFAPI_KEY');
// Whose phones get the "GolfAPI calls are running out" push: comma-separated uids.
const ALERT_UIDS = defineString('ALERT_UIDS', { default: '' });
// Apple WeatherKit (gpsWind): the private key is a secret; the ids are plain params.
const WEATHERKIT_KEY = defineSecret('WEATHERKIT_KEY');
const WEATHERKIT_KEY_ID = defineString('WEATHERKIT_KEY_ID', { default: '' });
const WEATHERKIT_TEAM_ID = defineString('WEATHERKIT_TEAM_ID', { default: '' });
const WEATHERKIT_SERVICE_ID = defineString('WEATHERKIT_SERVICE_ID', { default: '' });

const rtdb = () => admin.database();
const db = {
    get: async (p) => (await rtdb().ref(p).once('value')).val(),
    set: (p, v) => rtdb().ref(p).set(v),
    update: (p, v) => rtdb().ref(p).update(v),
    push: (p, v) => rtdb().ref(p).push(v),
    transaction: async (p, fn) => {
        const r = await rtdb().ref(p).transaction(fn);
        return { committed: r.committed, value: r.snapshot.val() };
    },
};
async function notify(kind, detail) {
    const uids = ALERT_UIDS.value().split(',').map((s) => s.trim()).filter(Boolean);
    const body = kind === 'floor' ? `GolfAPI calls left: ${detail.left}. New courses are paused (floor ${detail.floor}).`
        : `New GPS courses hit today's cap (${detail.max}).`;
    for (const uid of uids) {
        const devices = (await db.get('pushTokens/' + uid)) || {};
        const tokens = Object.keys(devices).map((d) => devices[d] && devices[d].token).filter(Boolean);
        if (tokens.length) await admin.messaging().sendEachForMulticast({ tokens, notification: { title: 'HardPan GPS', body } });
    }
}
let core = null;
function getCore() {
    if (!core) core = createCore({ db, fetch: (u, o) => fetch(u, o), key: () => GOLFAPI_KEY.value().trim(), notify });
    return core;
}
function wrap(fn) {
    return async (request) => {
        try { return await fn(request.auth, request.data || {}); }
        catch (e) {
            if (e && e.code === 'unauthenticated') throw new HttpsError('unauthenticated', e.message);
            if (e && e.code === 'invalid-argument') throw new HttpsError('invalid-argument', e.message);
            console.error('gps-live', String(e && e.message || e));
            throw new HttpsError('internal', 'GPS is not available right now.');
        }
    };
}
const opts = { region: 'us-central1', secrets: [GOLFAPI_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MiB' };
exports.gpsSearch = onCall(opts, wrap((auth, data) => getCore().search(auth, data)));
exports.gpsCourse = onCall(opts, wrap((auth, data) => getCore().course(auth, data)));
let weather = null;
function getWeather() {
    if (!weather) weather = createWeather({ fetch: (u, o) => fetch(u, o),
        creds: () => ({ privateKey: WEATHERKIT_KEY.value(), keyId: WEATHERKIT_KEY_ID.value(), teamId: WEATHERKIT_TEAM_ID.value(), serviceId: WEATHERKIT_SERVICE_ID.value() }) });
    return weather;
}
exports.gpsWind = onCall(Object.assign({}, opts, { secrets: [WEATHERKIT_KEY] }), wrap((auth, data) => getWeather().wind(auth, data)));
