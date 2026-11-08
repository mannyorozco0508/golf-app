// ============================================================================
// STRIPE PHASE 1 (TEST MODE) - THE HANDLERS, WITH EVERYTHING INJECTED.
//
// makeHandlers({ db, stripe, webhookSecret, now, emulator, log }) returns the
// three entry points index.js wires to firebase-functions:
//   createEntryCheckout(data, { origin })     -> { url }
//   refundEntry(data, { uid })                -> { status: 'pending' }
//   stripeWebhook(rawBody, signatureHeader)   -> { status, body }
//
// `db` is a firebase-admin Database (the tests hand it one pointed at the DB
// emulator). `stripe` is a Stripe client (the tests hand it the real package's
// webhooks helper plus mocked sessions/refunds - no network). Refusals are
// thrown as HandlerError {code, reason}; index.js turns them into HttpsError
// with details.reason set, exactly as the contract names them.
//
// Paths (contract): tournaments/<code>, registrations/<code>/<entryId>,
// payments/allowedOwners/<uid>, stripeEvents/<eventId>, and (Addendum
// 2026-11-08) registrationStatus/<code>/<entryId> = {paid, paidVia, at}. One server-only path the
// contract does not name: payments/checkoutAttempts/<code>/<entryId> (integer),
// the server's count of Checkout Sessions per entry (max 5). It sits under
// payments/, which clients can neither read nor write.
// ============================================================================
'use strict';

const core = require('./stripe-core.js');

class HandlerError extends Error {
    constructor(reason, message) {
        super(message || reason);
        this.reason = reason;
        this.code = core.ERROR_CODES[reason] || 'internal';
    }
}

const EVENT_ID = /^[A-Za-z0-9_-]{1,255}$/;

function makeHandlers(deps) {
    const db = deps.db, stripe = deps.stripe;
    const now = deps.now || (() => Date.now());
    const log = deps.log || (() => {});
    const val = async (p) => (await db.ref(p).once('value')).val();

    async function createEntryCheckout(data, ctx) {
        const ref = core.parseRef(data);   // only code + entryId are read; any amount in data is ignored
        if (!ref) throw new HandlerError(core.REASONS.NOT_FOUND);
        const origin = core.allowedOrigin(ctx && ctx.origin, { emulator: deps.emulator === true });
        if (!origin) throw new HandlerError(core.EXTRA_REASONS.BAD_ORIGIN);
        const { code, entryId } = ref;
        const tournament = await val('tournaments/' + code);
        const registration = await val('registrations/' + code + '/' + entryId);
        const ownerUid = tournament && typeof tournament.ownerUid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(tournament.ownerUid) ? tournament.ownerUid : null;
        const allowed = ownerUid ? await val('payments/allowedOwners/' + ownerUid) : null;
        const attemptsPath = 'payments/checkoutAttempts/' + code + '/' + entryId;
        const attempts = await val(attemptsPath);
        const plan = core.planCheckout({ tournament, registration, allowed, attempts });
        if (!plan.ok) throw new HandlerError(plan.reason);

        // Reserve the attempt BEFORE calling Stripe, so a burst cannot exceed 5.
        const tx = await db.ref(attemptsPath).transaction(core.nextAttempt);
        if (!tx.committed) throw new HandlerError(core.REASONS.TOO_MANY_ATTEMPTS);
        const attempt = tx.snapshot.val();

        const params = core.sessionParams({ code, entryId, origin, amountCents: plan.amountCents, eventName: tournament.name, email: registration.email });
        const session = await stripe.checkout.sessions.create(params, { idempotencyKey: core.checkoutIdempotencyKey(code, entryId, attempt) });
        await db.ref('registrations/' + code + '/' + entryId).update({ checkoutAt: now() });
        return { url: session.url };
    }

    async function refundEntry(data, ctx) {
        const ref = core.parseRef(data);
        if (!ctx || !ctx.uid) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        if (!ref) throw new HandlerError(core.REASONS.NOT_FOUND);
        const { code, entryId } = ref;
        const tournament = await val('tournaments/' + code);
        const registration = await val('registrations/' + code + '/' + entryId);
        const plan = core.planRefund({ callerUid: ctx.uid, tournament, registration });
        if (!plan.ok) throw new HandlerError(plan.reason);
        await stripe.refunds.create(
            { payment_intent: plan.paymentIntent, metadata: { code, entryId } },
            { idempotencyKey: core.refundIdempotencyKey(code, entryId, plan.paymentIntent) });
        await db.ref('registrations/' + code + '/' + entryId).update({ refundPendingAt: now() });
        return { status: 'pending' };
    }

    // Returns {status, body}. 400 = signature refused, NOTHING written.
    async function stripeWebhook(rawBody, signature) {
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, deps.webhookSecret);
        } catch (e) {
            log('webhook signature refused', e && e.message);
            return { status: 400, body: 'bad signature' };
        }
        if (!event || typeof event.id !== 'string' || !EVENT_ID.test(event.id)) return { status: 400, body: 'bad event id' };
        const evPath = 'stripeEvents/' + event.id;
        if ((await db.ref(evPath).once('value')).exists()) return { status: 200, body: 'duplicate' };

        const o = (event.data && event.data.object) || {};
        let piMetadata = null, refundId = null;
        if (core.EVENT_TYPES.indexOf(event.type) !== -1 && !/^checkout\.session\./.test(event.type)) {
            if (!core.parseRef(o.metadata) && typeof o.payment_intent === 'string') {
                const pi = await stripe.paymentIntents.retrieve(o.payment_intent);
                piMetadata = pi && pi.metadata;
            }
            if (event.type === 'charge.refunded') {
                const first = o.refunds && o.refunds.data && o.refunds.data[0];
                if (first && first.id) refundId = first.id;
                else {
                    const list = await stripe.refunds.list({ charge: o.id, limit: 1 });
                    refundId = list && list.data && list.data[0] && list.data[0].id;
                }
            }
        }
        const ref = core.eventRef(event, piMetadata);
        const tournament = ref ? await val('tournaments/' + ref.code) : null;
        const registration = ref ? await val('registrations/' + ref.code + '/' + ref.entryId) : null;
        const out = core.mapEvent(event, { ref, tournament, registration, refundId, now: now() });

        // Claim the event id. Only the delivery that creates the record applies it.
        const tx = await db.ref(evPath).transaction((cur) => (cur === null ? out.record : undefined));
        if (!tx.committed) return { status: 200, body: 'duplicate' };
        if (out.update) {
            try {
                // ONE multi-path update: the registration fields and, when paid
                // flips, the public status mirror land together or not at all.
                const tail = ref.code + '/' + ref.entryId;
                const multi = {};
                for (const k of Object.keys(out.update)) multi['registrations/' + tail + '/' + k] = out.update[k];
                if (out.status) multi['registrationStatus/' + tail] = out.status;
                await db.ref().update(multi);
            } catch (e) {
                await db.ref(evPath).remove();   // un-claim so Stripe's retry can apply it
                log('webhook write failed', event.id, e && e.message);
                return { status: 500, body: 'write failed' };
            }
        } else if (/^rejected-/.test(out.record.type)) {
            log('ALERT stripe event rejected', event.id, event.type, out.record.type);
        }
        return { status: 200, body: out.record.type };
    }

    return { createEntryCheckout, refundEntry, stripeWebhook };
}

module.exports = { makeHandlers, HandlerError };
