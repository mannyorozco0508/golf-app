// ============================================================================
// Firebase Functions codebase `tournaments-stripe` (2nd gen, nodejs22,
// us-central1). TEST MODE. Thin wrappers only: every rule lives in
// stripe-core.js (pure) and handlers.js (injected db + stripe).
//
// Secrets (Firebase secrets only, never in the repo): STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET. Deploy: README.md. Never deploy without Manny's typed OK.
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
const OPTS = { region: 'us-central1', secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] };

// The DEFAULT app specifically: another named app in the process must not stop it.
if (!admin.apps.some((a) => a && a.name === '[DEFAULT]')) admin.initializeApp();

let cached = null;
function handlers() {
    if (!cached) {
        cached = makeHandlers({
            db: admin.database(),
            stripe: new Stripe(STRIPE_SECRET_KEY.value()),
            webhookSecret: STRIPE_WEBHOOK_SECRET.value(),
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
