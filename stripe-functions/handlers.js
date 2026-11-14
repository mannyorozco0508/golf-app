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

        const params = core.sessionParams({ code, entryId, origin, amountCents: plan.amountCents, eventName: tournament.name, email: registration.email, acct: plan.onAccount, serviceFeeCents: plan.serviceFeeCents });
        // A DIRECT charge: the session is created ON the organizer's account (stripeAccount).
        const sopts = { idempotencyKey: core.checkoutIdempotencyKey(code, entryId, attempt) };
        if (plan.onAccount) sopts.stripeAccount = plan.onAccount;
        const session = await stripe.checkout.sessions.create(params, sopts);
        // checkoutAt on the entry and, on the record, who is paid (the Desk and
        // the register line read it; the account id itself stays server-side).
        const multi = {};
        multi['registrations/' + code + '/' + entryId + '/checkoutAt'] = now();
        multi['tournaments/' + code + '/fees/paidTo'] = plan.onAccount ? 'organizer' : 'hardpan';
        if (plan.onAccount) multi['tournaments/' + code + '/fees/serviceFeeCents'] = plan.serviceFeeCents;
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
        // A direct charge is refunded ON the connected account, with refund_application_fee
        // (core.refundParams), so HardPan's $4 goes back to the organizer.
        const ropts = { idempotencyKey: core.refundIdempotencyKey(code, entryId, plan.paymentIntent) };
        if (plan.onAccount) ropts.stripeAccount = plan.onAccount;
        const refund = await stripe.refunds.create(core.refundParams(plan, { code, entryId }), ropts);
        await db.ref('registrations/' + code + '/' + entryId).update({ refundPendingAt: now() });
        // FIX C audit (Grok retest 2026-11-13 18:11 read the organizer as short by the fee): the
        // application fee is read back from Stripe after the refund and the answer is recorded
        // server-side (payments/refundAudit), with an ALERT in the log when it was not returned.
        // Measured, not assumed; the audit never blocks the refund.
        if (plan.onAccount) {
            try {
                const charge = refund && typeof refund.charge === 'string' ? refund.charge : null;
                const fees = charge ? await stripe.applicationFees.list({ charge, limit: 1 }) : null;
                const fee = fees && fees.data && fees.data[0];
                const audit = { refund: refund && refund.id ? refund.id : null, at: now(), appFeeCents: fee ? fee.amount : null, appFeeRefundedCents: fee ? fee.amount_refunded : null, appFeeRefunded: !!(fee && fee.refunded === true) };
                await db.ref('payments/refundAudit/' + code + '/' + entryId).set(audit);
                if (!fee || fee.refunded !== true) log('ALERT application fee not refunded', code, entryId, audit.refund, audit.appFeeCents, audit.appFeeRefundedCents);
            } catch (e) { log('refund audit failed', code, entryId, e && e.message); }
        }
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
        return applyPaymentEvent(event, evPath, {});
    }
    // The payment pipeline, shared by both endpoints. `acctOpts` is {} for a
    // platform event and { stripeAccount } for a direct charge's event, which
    // lives on the connected account (its PaymentIntent and refunds are read there).
    async function applyPaymentEvent(event, evPath, acctOpts) {
        const o = (event.data && event.data.object) || {};
        let piMetadata = null, refundId = null;
        if (core.EVENT_TYPES.indexOf(event.type) !== -1 && !/^checkout\.session\./.test(event.type)) {
            if (!core.parseRef(o.metadata) && typeof o.payment_intent === 'string') {
                const pi = await stripe.paymentIntents.retrieve(o.payment_intent, acctOpts);
                piMetadata = pi && pi.metadata;
            }
            if (event.type === 'charge.refunded') {
                const first = o.refunds && o.refunds.data && o.refunds.data[0];
                if (first && first.id) refundId = first.id;
                else {
                    const list = await stripe.refunds.list({ charge: o.id, limit: 1 }, acctOpts);
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

    // ---- CONNECT (2026-11-12; Accounts v2 2026-11-13) ----------------------
    // createConnectOnboardingLink({code}, {uid, origin}) -> {url}: the signed-in
    // owner of this event, allow-listed by Manny, gets ONE Express-dashboard
    // account (POST /v2/core/accounts, idempotent on the uid) and a v2 onboarding
    // link that returns to this event. The 7-day payout delay is a v1 update
    // right after creation; if Stripe refuses that update the account still
    // onboards and the refusal is kept on stripeAccounts/<uid>/payoutScheduleError
    // and logged ALERT - never silent, never blocking.
    const ACCT_V1_API_ERROR_MAX = 300;
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
            // Stripe requires a contact email on a v2 account with the recipient
            // configuration (live log 2026-11-13 18:07 UTC). The owner's sign-in
            // email, from the verified token; none -> refused before any Stripe call.
            const email = core.connectEmail(ctx.email);
            if (!email) throw new HandlerError(core.EXTRA_REASONS.NO_EMAIL);
            const name = (tournament.beneficiary && String(tournament.beneficiary).trim()) || (tournament.organizerName && String(tournament.organizerName).trim()) || '';
            const created = await stripe.v2.core.accounts.create(core.accountCreateParams({ uid, name, email }), { idempotencyKey: core.connectIdempotencyKey(uid) });
            acct = { acct: created.id, createdAt: now(), api: 'v2' };
            if (name) acct.name = name.slice(0, 100);
            try { await stripe.accounts.update(created.id, core.payoutScheduleParams()); }
            catch (e) {
                acct.payoutScheduleError = String((e && e.message) || e).slice(0, ACCT_V1_API_ERROR_MAX);
                log('ALERT payout schedule not applied', uid, acct.payoutScheduleError);
            }
            await db.ref('stripeAccounts/' + uid).set(acct);
            // A fresh mirror for the new account (nothing enabled yet), replacing any retired account's.
            await db.ref('connectStatus/' + uid).set(core.connectStatusOf({}, now(), name));
        }
        const linkParams = core.accountLinkParams({ acct: acct.acct, origin, code, emulator: deps.emulator === true });
        if (!linkParams) throw new HandlerError(core.EXTRA_REASONS.BAD_ORIGIN);
        const link = await stripe.accountLinks.create(linkParams);   // v1 link on the v2 account id (see core.accountLinkParams)
        return { url: link.url };
    }
    // getConnectStatus({}, {uid}) -> the mirror's fields + state; writes connectStatus/<uid>.
    // The resolved service fee for an event: Manny's per-event override, else the
    // platform number, else $4 (core.serviceFee).
    const serviceFeeFor = async (code) => {
        const platformFeeCents = await val('platform/connect/serviceFeeCents');
        const eventFeeCents = await val('platform/connect/eventOverrides/' + code + '/serviceFeeCents');
        return core.serviceFee({ platformFeeCents: platformFeeCents === null ? undefined : platformFeeCents, eventFeeCents: eventFeeCents === null ? undefined : eventFeeCents });
    };
    async function getConnectStatus(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid || !UIDRE.test(String(uid))) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        const acct = await val('stripeAccounts/' + uid);
        // No account on file (none yet, or retired): the owner-readable mirror is
        // cleared too, so the card can never show a retired account's status.
        if (!acct || typeof acct.acct !== 'string') { await db.ref('connectStatus/' + uid).remove(); return { connected: false, state: 'none' }; }
        const account = await stripe.accounts.retrieve(acct.acct);   // v1 view of the v2 account
        const status = core.connectStatusOf(account, now(), acct.name);
        await db.ref('connectStatus/' + uid).set(status);
        const out = Object.assign({ connected: true, state: core.connectState(status) }, status);
        // With {code} for an event this caller owns: the fee the golfer will be
        // charged on top, and the organizer's name, go on the PUBLIC record so
        // the register screen can say "Entry $50 + $4 service fee" and
        // "Paid to Hope Foundation" before the first checkout.
        const code = data && typeof data.code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.code) ? data.code : null;
        if (code) {
            const t = await val('tournaments/' + code);
            if (t && t.ownerUid === uid) {
                const fee = await serviceFeeFor(code);
                if (fee.ok) {
                    const multi = {};
                    multi['tournaments/' + code + '/fees/serviceFeeCents'] = fee.cents;
                    multi['tournaments/' + code + '/fees/paidToName'] = status.name || null;
                    // FIX A (Grok retest 2026-11-13 18:11: the form showed only the $5): the golfer's
                    // form shows the service fee line only when fees.paidTo says the organizer is
                    // paid. Until now only the FIRST checkout wrote that - too late for the form.
                    // Payouts on = card sign-ups will be the organizer's direct charges: say so now.
                    if (core.connectState(status) === 'on') multi['tournaments/' + code + '/fees/paidTo'] = 'organizer';
                    await db.ref().update(multi);
                    out.serviceFeeCents = fee.cents;
                }
            }
        }
        return out;
    }
    // createConnectDashboardLink({}, {uid}) -> {url}: where the caller manages their
    // own account. A FULL-dashboard account has no login-link API (that was the
    // Express dashboard's); the organizer signs in at dashboard.stripe.com.
    async function createConnectDashboardLink(data, ctx) {
        const uid = ctx && ctx.uid;
        if (!uid || !UIDRE.test(String(uid))) throw new HandlerError(core.EXTRA_REASONS.UNAUTHENTICATED);
        const acct = await val('stripeAccounts/' + uid);
        if (!acct || typeof acct.acct !== 'string') throw new HandlerError(core.EXTRA_REASONS.NOT_CONNECTED);
        return { url: core.DASHBOARD_URL };
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
        // A direct charge's payment event (checkout.session.*, charge.*) arrives here,
        // on the connected account: the same pipeline as the platform endpoint, with
        // the PaymentIntent / refunds read on that account; mapEvent holds
        // event.account against the session's own acct.
        if (core.EVENT_TYPES.indexOf(event.type) !== -1) {
            if (typeof event.account !== 'string' || !/^acct_/.test(event.account)) {
                await db.ref(evPath).transaction((cur) => (cur === null ? { type: 'rejected-account', at: now() } : undefined));
                log('ALERT connect payment event without an account', event.id, event.type);
                return { status: 200, body: 'rejected-account' };
            }
            return applyPaymentEvent(event, evPath, { stripeAccount: event.account });
        }
        // Whose account: looked up by the account id for every Connect event
        // (deauthorized names it in event.account, account.updated in
        // data.object.id), so the mirror is written for an account we hold even
        // when the v1 view of a v2 account carries no metadata.uid.
        let owner = null;
        const acctId = (typeof event.account === 'string' && event.account) || (event.data && event.data.object && typeof event.data.object.id === 'string' && /^acct_/.test(event.data.object.id) && event.data.object.id) || null;
        if (acctId && core.CONNECT_EVENT_TYPES.indexOf(event.type) !== -1) {
            const all = await val('stripeAccounts');
            const hit = all && Object.keys(all).find((u) => all[u] && all[u].acct === acctId);
            if (hit) owner = { uid: hit, name: (all[hit] && typeof all[hit].name === 'string') ? all[hit].name : null };
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
