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
    // A secret may be handed in as a value or as a thunk (index.js resolves a
    // defineSecret only inside the function that binds it).
    const secretOf = (x) => (typeof x === 'function' ? x() : x);
    const UIDRE = /^[A-Za-z0-9_-]{1,128}$/;
    // CONNECT (2026-11-12): what the owner has on file, never sent to a client.
    const connectOf = async (ownerUid) => {
        if (!ownerUid) return null;
        const acct = await val('stripeAccounts/' + ownerUid);
        if (!acct || typeof acct.acct !== 'string') return null;
        const st = await val('connectStatus/' + ownerUid);
        return { acct: acct.acct, chargesEnabled: !!(st && st.chargesEnabled === true) };
    };

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
        const connect = await connectOf(ownerUid);
        const platformFeeCents = connect ? await val('platform/connect/serviceFeeCents') : undefined;
        const eventFeeCents = connect ? await val('platform/connect/eventOverrides/' + code + '/serviceFeeCents') : undefined;
        const plan = core.planCheckout({ tournament, registration, allowed, attempts, connect, platformFeeCents: platformFeeCents === null ? undefined : platformFeeCents, eventFeeCents: eventFeeCents === null ? undefined : eventFeeCents });
        if (!plan.ok) throw new HandlerError(plan.reason);

        // Reserve the attempt BEFORE calling Stripe, so a burst cannot exceed 5.
        const tx = await db.ref(attemptsPath).transaction(core.nextAttempt);
        if (!tx.committed) throw new HandlerError(core.REASONS.TOO_MANY_ATTEMPTS);
        const attempt = tx.snapshot.val();

        const params = core.sessionParams({ code, entryId, origin, amountCents: plan.amountCents, eventName: tournament.name, email: registration.email, acct: plan.destination, serviceFeeCents: plan.serviceFeeCents });
        const session = await stripe.checkout.sessions.create(params, { idempotencyKey: core.checkoutIdempotencyKey(code, entryId, attempt) });
        // checkoutAt on the entry and, on the record, who is paid (the Desk and
        // the register line read it; the account id itself stays server-side).
        const multi = {};
        multi['registrations/' + code + '/' + entryId + '/checkoutAt'] = now();
        multi['tournaments/' + code + '/fees/paidTo'] = plan.destination ? 'organizer' : 'hardpan';
        await db.ref().update(multi);
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
            core.refundParams(plan, { code, entryId }),
            { idempotencyKey: core.refundIdempotencyKey(code, entryId, plan.paymentIntent) });
        await db.ref('registrations/' + code + '/' + entryId).update({ refundPendingAt: now() });
        return { status: 'pending' };
    }

    // Returns {status, body}. 400 = signature refused, NOTHING written.
    async function stripeWebhook(rawBody, signature) {
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, secretOf(deps.webhookSecret));
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

    // ---- CONNECT (2026-11-12) ---------------------------------------------
    // createConnectOnboardingLink({code}, {uid, origin}) -> {url}: the signed-in
    // owner of this event, allow-listed by Manny, gets ONE Express account
    // (idempotent on the uid) and an onboarding link that returns to this event.
    async function createConnectOnboardingLink(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid || !UIDRE.test(String(uid))) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        const code = data && typeof data.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.code) ? data.code : null;
        if (!code) throw new HandlerError(core.REASONS.NOT_FOUND);
        const origin = core.allowedOrigin(ctx.origin, { emulator: deps.emulator === true });
        if (!origin) throw new HandlerError(core.EXTRA_REASONS.BAD_ORIGIN);
        const tournament = await val('tournaments/' + code);
        const allowed = await val('payments/allowedOwners/' + uid);
        const plan = core.planConnect({ callerUid: uid, tournament, allowed });
        if (!plan.ok) throw new HandlerError(plan.reason);
        let acct = await val('stripeAccounts/' + uid);
        if (!acct || typeof acct.acct !== 'string') {
            const name = (tournament.beneficiary && String(tournament.beneficiary).trim()) || (tournament.organizerName && String(tournament.organizerName).trim()) || '';
            const created = await stripe.accounts.create(core.accountCreateParams({ uid, name }), { idempotencyKey: core.connectIdempotencyKey(uid) });
            acct = { acct: created.id, createdAt: now() };
            await db.ref('stripeAccounts/' + uid).set(acct);
        }
        const linkParams = core.accountLinkParams({ acct: acct.acct, origin, code, emulator: deps.emulator === true });
        if (!linkParams) throw new HandlerError(core.EXTRA_REASONS.BAD_ORIGIN);
        const link = await stripe.accountLinks.create(linkParams);
        return { url: link.url };
    }
    // getConnectStatus({}, {uid}) -> the mirror's fields + state; writes connectStatus/<uid>.
    async function getConnectStatus(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid || !UIDRE.test(String(uid))) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        const acct = await val('stripeAccounts/' + uid);
        if (!acct || typeof acct.acct !== 'string') return { connected: false, state: 'none' };
        const account = await stripe.accounts.retrieve(acct.acct);
        const status = core.connectStatusOf(account, now());
        await db.ref('connectStatus/' + uid).set(status);
        return Object.assign({ connected: true, state: core.connectState(status) }, status);
    }
    // createConnectDashboardLink({}, {uid}) -> {url}: the Express dashboard for the caller's own account.
    async function createConnectDashboardLink(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid || !UIDRE.test(String(uid))) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        const acct = await val('stripeAccounts/' + uid);
        if (!acct || typeof acct.acct !== 'string') throw new HandlerError(core.EXTRA_REASONS.NOT_CONNECTED);
        const link = await stripe.accounts.createLoginLink(acct.acct);
        return { url: link.url };
    }
    // The second endpoint ("listen to events on Connected accounts"), its own
    // secret. account.updated -> the mirror; deauthorized -> everything off.
    async function stripeConnectWebhook(rawBody, signature) {
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, secretOf(deps.connectWebhookSecret));
        } catch (e) {
            log('connect webhook signature refused', e && e.message);
            return { status: 400, body: 'bad signature' };
        }
        if (!event || typeof event.id !== 'string' || !EVENT_ID.test(event.id)) return { status: 400, body: 'bad event id' };
        const evPath = 'stripeEvents/' + event.id;
        if ((await db.ref(evPath).once('value')).exists()) return { status: 200, body: 'duplicate' };
        let owner = null;
        if (event.type === 'account.application.deauthorized' && typeof event.account === 'string') {
            const all = await val('stripeAccounts');
            const hit = all && Object.keys(all).find((u) => all[u] && all[u].acct === event.account);
            if (hit) owner = { uid: hit };
        }
        const out = core.mapAccountEvent(event, now(), owner);
        const tx = await db.ref(evPath).transaction((cur) => (cur === null ? out.record : undefined));
        if (!tx.committed) return { status: 200, body: 'duplicate' };
        if (out.uid && out.status) {
            try { await db.ref('connectStatus/' + out.uid).set(out.status); }
            catch (e) { await db.ref(evPath).remove(); log('connect webhook write failed', event.id, e && e.message); return { status: 500, body: 'write failed' }; }
        } else if (/^rejected-/.test(out.record.type)) {
            log('ALERT connect event rejected', event.id, event.type, out.record.type);
        }
        return { status: 200, body: out.record.type };
    }

    return { createEntryCheckout, refundEntry, stripeWebhook, createConnectOnboardingLink, getConnectStatus, createConnectDashboardLink, stripeConnectWebhook };
}

module.exports = { makeHandlers, HandlerError };
