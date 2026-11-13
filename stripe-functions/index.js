// ============================================================================
// Firebase Functions codebase `tournaments-stripe` (2nd gen, nodejs22,
// us-central1). TEST MODE. Thin wrappers only: every rule lives in
// stripe-core.js (pure) and handlers.js (injected db + stripe).
//
// Secrets (Firebase secrets only, never in the repo): STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET. Deploy: README.md. Never deploy without Manny's typed OK.
// Also E1 sendAnnouncement (2026-11-09): organizer notes pushed to app followers.
// ============================================================================
'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { makeHandlers, HandlerError } = require('./handlers.js');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
// CONNECT (2026-11-12): the connected-account endpoint has its own signing secret.
const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret('STRIPE_CONNECT_WEBHOOK_SECRET');
const OPTS = { region: 'us-central1', secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] };
const CONNECT_OPTS = { region: 'us-central1', secrets: [STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET] };

// The DEFAULT app specifically: another named app in the process must not stop it.
if (!admin.apps.some((a) => a && a.name === '[DEFAULT]')) admin.initializeApp();

let cached = null;
function handlers() {
    if (!cached) {
        cached = makeHandlers({
            db: admin.database(),
            stripe: new Stripe(STRIPE_SECRET_KEY.value()),
            // Thunks: a secret resolves only inside a function that binds it.
            webhookSecret: () => STRIPE_WEBHOOK_SECRET.value(),
            connectWebhookSecret: () => STRIPE_CONNECT_WEBHOOK_SECRET.value(),
            emulator: process.env.FUNCTIONS_EMULATOR === 'true',
            log: (...a) => logger.warn(...a)
        });
    }
    return cached;
}

function asHttpsError(e) {
    if (e instanceof HandlerError) return new HttpsError(e.code, e.reason, { reason: e.reason });
    logger.error('tournaments-stripe internal error', e && e.message);
    return new HttpsError('internal', 'internal');
}

exports.createEntryCheckout = onCall(OPTS, async (request) => {
    const headers = (request.rawRequest && request.rawRequest.headers) || {};
    try {
        return await handlers().createEntryCheckout(request.data, { origin: headers.origin });
    } catch (e) { throw asHttpsError(e); }
});

exports.refundEntry = onCall(OPTS, async (request) => {
    try {
        return await handlers().refundEntry(request.data, { uid: request.auth && request.auth.uid });
    } catch (e) { throw asHttpsError(e); }
});

// ---- CONNECT (2026-11-12): onboarding, status, dashboard; the second endpoint.
exports.createConnectOnboardingLink = onCall(OPTS, async (request) => {
    const headers = (request.rawRequest && request.rawRequest.headers) || {};
    // The owner's sign-in email (verified token) is the v2 account's contact_email.
    const token = (request.auth && request.auth.token) || {};
    try { return await handlers().createConnectOnboardingLink(request.data, { uid: request.auth && request.auth.uid, origin: headers.origin, email: token.email }); }
    catch (e) { throw asHttpsError(e); }
});
exports.getConnectStatus = onCall(OPTS, async (request) => {
    try { return await handlers().getConnectStatus(request.data, { uid: request.auth && request.auth.uid }); }
    catch (e) { throw asHttpsError(e); }
});
exports.createConnectDashboardLink = onCall(OPTS, async (request) => {
    try { return await handlers().createConnectDashboardLink(request.data, { uid: request.auth && request.auth.uid }); }
    catch (e) { throw asHttpsError(e); }
});
exports.stripeConnectWebhook = onRequest(CONNECT_OPTS, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    try {
        const out = await handlers().stripeConnectWebhook(req.rawBody, req.get('stripe-signature'));
        res.status(out.status).send(out.body);
    } catch (e) {
        logger.error('stripeConnectWebhook internal error', e && e.message);
        res.status(500).send('error');
    }
});

// ---- E4 PHOTO WALL (2026-11-09): no Stripe, no secrets, no money ---------
// photo-handlers.js holds every rule; these are thin wrappers. The bucket is
// named, not taken from the app default, so it is the one Storage was turned
// on with (2026-11-03) and the one storage.rules names.
const PHOTO_OPTS = { region: 'us-central1' };
const PHOTO_BUCKET = 'golfapp-9fb21.firebasestorage.app';
const { makePhotoHandlers, PhotoError } = require('./photo-handlers.js');
let photoCached = null;
function photos() {
    if (!photoCached) photoCached = makePhotoHandlers({ db: admin.database(), bucket: admin.storage().bucket(PHOTO_BUCKET) });
    return photoCached;
}
function photoError(e) {
    if (e instanceof PhotoError) return new HttpsError(e.code, e.reason, { reason: e.reason });
    logger.error('tournament photos internal error', e && e.message);
    return new HttpsError('internal', 'internal');
}
const caller = (request) => ({ uid: request.auth && request.auth.uid, email: request.auth && request.auth.token && request.auth.token.email });
['photoLinks', 'approvePhoto', 'hidePhoto'].forEach((name) => {
    exports[name] = onCall(PHOTO_OPTS, async (request) => {
        try { return await photos()[name](request.data, caller(request)); } catch (e) { throw photoError(e); }
    });
});
exports.reportPhoto = onCall(PHOTO_OPTS, async (request) => {
    try { return await photos().reportPhoto(request.data); } catch (e) { throw photoError(e); }
});

exports.stripeWebhook = onRequest(OPTS, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    try {
        const out = await handlers().stripeWebhook(req.rawBody, req.get('stripe-signature'));
        res.status(out.status).send(out.body);
    } catch (e) {
        logger.error('stripeWebhook internal error', e && e.message);
        res.status(500).send('error');
    }
});

// ---- E1 (2026-11-09): sendAnnouncement, owner only. No Stripe and no secret:
// its own options object, so the Stripe secrets are not bound to it. Every rule
// lives in announce-core.js / handlers-announce.js (injected db + messaging).
const { makeAnnounceHandlers, AnnounceError } = require('./handlers-announce.js');
const ANNOUNCE_OPTS = { region: 'us-central1' };
let announceCached = null;
function announceHandlers() {
    if (!announceCached) {
        announceCached = makeAnnounceHandlers({
            db: admin.database(),
            messaging: admin.messaging(),
            log: (...a) => logger.warn(...a)
        });
    }
    return announceCached;
}
exports.sendAnnouncement = onCall(ANNOUNCE_OPTS, async (request) => {
    try {
        return await announceHandlers().sendAnnouncement(request.data, { uid: request.auth && request.auth.uid });
    } catch (e) {
        if (e instanceof AnnounceError) throw new HttpsError(e.code, e.reason, { reason: e.reason });
        logger.error('sendAnnouncement internal error', e && e.message);
        throw new HttpsError('internal', 'internal');
    }
});
