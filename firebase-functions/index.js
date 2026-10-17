// ============================================================================
// HARDPAN GPS LIVE - THE TWO CLOUD FUNCTIONS (Firebase golfapp-9fb21, 2nd gen)
//
//   gpsSearch({ name })              -> { status, results[] }
//   gpsCourse({ courseId, ourKey?, roundCode? }) -> { status, course, cardKey }
//   gpsUnlink({ ourKey })            -> { status: 'ok' | 'denied', was }   (owners only)
//
// The GolfAPI key is the Secret Manager secret GOLFAPI_KEY: set it once with
//   firebase functions:secrets:set GOLFAPI_KEY
// It is read here at call time and never logged, returned or stored.
// Callable functions refuse a call with no Firebase ID token before this code
// runs; gps-live-core.js checks request.auth again and does everything else.
//
//   gpsWind({ lat, lon, courseKey, courseId? }) -> { status, mph, gustMph, fromDeg, toDeg, tempF, asOf }
//     Apple WeatherKit (weather-core.js). NOT DEPLOYED until Manny's OK. Needs, once:
//       firebase functions:secrets:set WEATHERKIT_KEY      (the .p8 file's text)
//       WEATHERKIT_KEY_ID, WEATHERKIT_TEAM_ID, WEATHERKIT_SERVICE_ID  (params, in .env.<project>)
//     and the app's gps-config.js weatherkit: true. Without them the app uses NWS.
//
//   accountDelete({ appleAuthorizationCode?, appleClientId? })  -> { status: 'deleted', appleRevoked, removed[] }
//     Delete my account (account-delete-core.js): revokes Sign in with Apple, removes
//     organizers/<uid>, pushTokens/<uid>, pushPrefs/<uid>, gps_usage/<uid> and the
//     co-organizer pointers with the Admin SDK, then the Auth user. NOT DEPLOYED until
//     Manny's OK. Needs, once (the Sign in with Apple key from Certificates, Identifiers
//     & Profiles > Keys, with "Sign in with Apple" enabled):
//       firebase functions:secrets:set APPLE_SIGNIN_TEAM_ID
//       firebase functions:secrets:set APPLE_SIGNIN_KEY_ID
//       firebase functions:secrets:set APPLE_SIGNIN_PRIVATE_KEY   (the .p8 file's text)
//     APPLE_CLIENT_IDS (param) is the bundle ids whose codes it accepts.
//     Deploy: firebase deploy --only functions:gps-live:accountDelete
//
// DEPLOY ONLY THESE:  firebase deploy --only functions:gps-live:gpsSearch,functions:gps-live:gpsCourse,functions:gps-live:gpsUnlink
//   (gpsWind, when approved: firebase deploy --only functions:gps-live:gpsWind)
// (a bare `firebase deploy` would also publish database.rules.json)
//
// APP CHECK IS ENFORCED (audit H2, 2026-10-16): every one of these refuses a call
// that carries no valid App Check token (header X-Firebase-AppCheck), before any
// code here runs. gps-live.js sends one when the app has the App Check SDK
// (firebase.appCheck()); until the app is built with App Check registered for its
// iOS app (App Attest / DeviceCheck) these functions refuse EVERY call, so deploy
// them only together with - or after - that app build.
// ============================================================================
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { createCore } = require('./gps-live-core.js');
const { createWeather } = require('./weather-core.js');
const { createAccountDelete } = require('./account-delete-core.js');

admin.initializeApp();
const GOLFAPI_KEY = defineSecret('GOLFAPI_KEY');
// Whose phones get the "GolfAPI calls are running out" push: comma-separated uids.
const ALERT_UIDS = defineString('ALERT_UIDS', { default: '' });
// Apple WeatherKit (gpsWind): the private key is a secret; the ids are plain params.
const WEATHERKIT_KEY = defineSecret('WEATHERKIT_KEY');
const WEATHERKIT_KEY_ID = defineString('WEATHERKIT_KEY_ID', { default: '' });
const WEATHERKIT_TEAM_ID = defineString('WEATHERKIT_TEAM_ID', { default: '' });
const WEATHERKIT_SERVICE_ID = defineString('WEATHERKIT_SERVICE_ID', { default: '' });
// Sign in with Apple token revocation (accountDelete): all three are secrets.
const APPLE_SIGNIN_TEAM_ID = defineSecret('APPLE_SIGNIN_TEAM_ID');
const APPLE_SIGNIN_KEY_ID = defineSecret('APPLE_SIGNIN_KEY_ID');
const APPLE_SIGNIN_PRIVATE_KEY = defineSecret('APPLE_SIGNIN_PRIVATE_KEY');
// The app bundle ids an Apple authorization code may have been issued to.
const APPLE_CLIENT_IDS = defineString('APPLE_CLIENT_IDS', { default: 'com.rattlegolf.app,com.rattlegolf.gpsbeta' });

const rtdb = () => admin.database();
const db = {
    get: async (p) => (await rtdb().ref(p).once('value')).val(),
    set: (p, v) => rtdb().ref(p).set(v),
    update: (p, v) => (p ? rtdb().ref(p) : rtdb().ref()).update(v),
    push: (p, v) => rtdb().ref(p).push(v),
    transaction: async (p, fn) => {
        const r = await rtdb().ref(p).transaction(fn);
        return { committed: r.committed, value: r.snapshot.val() };
    },
};
async function notify(kind, detail) {
    const uids = ALERT_UIDS.value().split(',').map((s) => s.trim()).filter(Boolean);
    const body = kind === 'floor' ? `GolfAPI calls left: ${detail.left}. New courses are paused (floor ${detail.floor}).`
        : /^userlimit_/.test(kind) ? `A golfer hit the daily limit for new GPS courses (${detail.max}).`
        : kind === 'searchcap' ? `GPS course searches hit today's cap (${detail.max}).`
        : `New GPS courses hit today's cap (${detail.max}).`;
    for (const uid of uids) {
        const devices = (await db.get('pushTokens/' + uid)) || {};
        const tokens = Object.keys(devices).map((d) => devices[d] && devices[d].token).filter(Boolean);
        if (tokens.length) await admin.messaging().sendEachForMulticast({ tokens, notification: { title: 'HardPan GPS', body } });
    }
}
let core = null;
function getCore() {
    // OWNERS (no per-golfer daily cap): the ALERT_UIDS uids - plus gps_meta/config.ownerUids.
    const owners = () => ALERT_UIDS.value().split(',').map((x) => x.trim()).filter(Boolean);
    if (!core) core = createCore({ db, fetch: (u, o) => fetch(u, o), key: () => GOLFAPI_KEY.value().trim(), notify, owners });
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
const opts = { region: 'us-central1', secrets: [GOLFAPI_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MiB', enforceAppCheck: true };
exports.gpsSearch = onCall(opts, wrap((auth, data) => getCore().search(auth, data)));
exports.gpsCourse = onCall(opts, wrap((auth, data) => getCore().course(auth, data)));
// Owners only (the check is in gps-live-core.js unlink): removes a wrong gps_links/<key>.
exports.gpsUnlink = onCall(opts, wrap((auth, data) => getCore().unlink(auth, data)));
let weather = null;
function getWeather() {
    const owners = () => ALERT_UIDS.value().split(',').map((x) => x.trim()).filter(Boolean);
    if (!weather) weather = createWeather({ fetch: (u, o) => fetch(u, o), db, owners,
        creds: () => ({ privateKey: WEATHERKIT_KEY.value(), keyId: WEATHERKIT_KEY_ID.value(), teamId: WEATHERKIT_TEAM_ID.value(), serviceId: WEATHERKIT_SERVICE_ID.value() }) });
    return weather;
}
exports.gpsWind = onCall(Object.assign({}, opts, { secrets: [WEATHERKIT_KEY] }), wrap((auth, data) => getWeather().wind(auth, data)));

// DELETE MY ACCOUNT. Its own wrapper: the app needs to tell "Apple refused" (try
// again) from "the server is not there" (account-exit.js falls back to the client
// delete), so the reason travels in the error's details. Never a secret in a log.
let accountDel = null;
function getAccountDelete() {
    if (!accountDel) accountDel = createAccountDelete({ db, fetch: (u, o) => fetch(u, o),
        auth: { getUser: (uid) => admin.auth().getUser(uid), deleteUser: (uid) => admin.auth().deleteUser(uid) },
        apple: () => ({ teamId: APPLE_SIGNIN_TEAM_ID.value().trim(), keyId: APPLE_SIGNIN_KEY_ID.value().trim(), privateKey: APPLE_SIGNIN_PRIVATE_KEY.value(),
            clientIds: APPLE_CLIENT_IDS.value().split(',').map((s) => s.trim()).filter(Boolean) }) });
    return accountDel;
}
const PASS_THROUGH = { unauthenticated: 1, 'invalid-argument': 1, 'failed-precondition': 1 };
exports.accountDelete = onCall({ region: 'us-central1', secrets: [APPLE_SIGNIN_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MiB' },
    async (request) => {
        try { return await getAccountDelete().deleteAccount(request.auth, request.data || {}); }
        catch (e) {
            const code = String((e && e.code) || '');
            if (PASS_THROUGH[code]) throw new HttpsError(code, e.message);
            if (/^apple-/.test(code)) throw new HttpsError('failed-precondition', e.message, { reason: code });
            console.error('accountDelete', code, String(e && e.message || e).slice(0, 200));
            throw new HttpsError('internal', 'Could not delete the account right now.');
        }
    });
