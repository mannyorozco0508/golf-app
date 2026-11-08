// ============================================================================
// STRIPE PHASE 1 (TEST MODE) - THE PURE PART. No SDK imports, no I/O.
//
// Everything here is a plain function of its arguments so the money rules can
// be unit tested without Stripe, Firebase or a network:
//   - the fee check (integer cents, 100..100000)
//   - the origin allow-list for success/cancel URLs
//   - metadata parsing (code / entryId, path-safe)
//   - the checkout planner (who may get a session, and for how much)
//   - the webhook event -> registration update mapping
//   - the refund planner (owner check)
//   - checkout attempt counting
//
// THE AMOUNT IS NEVER AN INPUT FROM THE CLIENT. planCheckout reads the fee from
// the tournament record it is handed; the callable's `data` is only parsed for
// {code, entryId} and anything else in it is ignored.
//
// Contract: ~/Desktop/claude-mailbox-shared/tournaments/STRIPE-CONTRACT.md.
// Names here (fields, reasons, function names) must not drift from it.
// ============================================================================
'use strict';

const FEE_MIN_CENTS = 100;
const FEE_MAX_CENTS = 100000;
const MAX_CHECKOUT_ATTEMPTS = 5;
const CURRENCY = 'usd';

// Contract reasons for createEntryCheckout, exact strings.
const REASONS = Object.freeze({
    NOT_FOUND: 'not-found',
    ALREADY_PAID: 'already-paid',
    NOT_COLLECTING: 'not-collecting',
    NOT_ALLOWED_OWNER: 'not-allowed-owner',
    TOO_MANY_ATTEMPTS: 'too-many-attempts',
    BAD_FEE: 'bad-fee'
});
// Server-side reasons the contract does not list (refusals it implies).
const EXTRA_REASONS = Object.freeze({
    BAD_ORIGIN: 'bad-origin',
    NOT_OWNER: 'not-owner',
    NOT_STRIPE_PAID: 'not-stripe-paid',
    ALREADY_REFUNDED: 'already-refunded',
    UNAUTHENTICATED: 'unauthenticated'
});
// HttpsError codes per reason (the wrapper builds the HttpsError).
const ERROR_CODES = Object.freeze({
    'not-found': 'not-found',
    'already-paid': 'failed-precondition',
    'not-collecting': 'failed-precondition',
    'not-allowed-owner': 'permission-denied',
    'too-many-attempts': 'resource-exhausted',
    'bad-fee': 'failed-precondition',
    'bad-origin': 'permission-denied',
    'not-owner': 'permission-denied',
    'not-stripe-paid': 'failed-precondition',
    'already-refunded': 'failed-precondition',
    'unauthenticated': 'unauthenticated'
});

const FIXED_ORIGINS = Object.freeze([
    'https://tournaments.rattlegolf.com',
    'https://hardpangolf.com',
    'https://golf-app-5a5.pages.dev'
]);
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.golf-app-5a5\.pages\.dev$/;
const LOCALHOST_ORIGIN = /^http:\/\/localhost(?::\d{1,5})?$/;

// A key that is safe as one RTDB path segment and as a Stripe metadata value.
const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

function isIntegerCents(n) {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}
function validFeeCents(n) {
    return isIntegerCents(n) && n >= FEE_MIN_CENTS && n <= FEE_MAX_CENTS;
}

// Returns the origin itself when it may receive a success/cancel redirect,
// otherwise null. localhost only when the caller says this is the emulator.
function allowedOrigin(origin, opts) {
    if (typeof origin !== 'string') return null;
    if (FIXED_ORIGINS.indexOf(origin) !== -1) return origin;
    if (PREVIEW_ORIGIN.test(origin)) return origin;
    if (opts && opts.emulator === true && LOCALHOST_ORIGIN.test(origin)) return origin;
    return null;
}

// {code, entryId} from a callable's data or a Stripe metadata object. Returns
// null on anything malformed. Never reads any other key.
function parseRef(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const code = obj.code, entryId = obj.entryId;
    if (typeof code !== 'string' || typeof entryId !== 'string') return null;
    if (!SAFE_KEY.test(code) || !SAFE_KEY.test(entryId)) return null;
    return { code, entryId };
}

function successUrls(origin, code, entryId) {
    const base = origin + '/tournament?register=' + encodeURIComponent(code) + '&entry=' + encodeURIComponent(entryId);
    return { success_url: base + '&checkout=done', cancel_url: base + '&checkout=cancel' };
}

function isStripePaid(reg) {
    return !!reg && reg.paid === true;
}

// Who may get a Checkout Session, and for how much.
//   tournament  tournaments/<code> (needs ownerUid, fees)
//   registration registrations/<code>/<entryId>
//   allowed     payments/allowedOwners/<ownerUid> (must be === true)
//   attempts    sessions already created for this entry (server count)
// -> {ok:false, reason} | {ok:true, amountCents, attempt}
function planCheckout(input) {
    const t = input && input.tournament, reg = input && input.registration;
    if (!t || typeof t !== 'object' || !reg || typeof reg !== 'object') return { ok: false, reason: REASONS.NOT_FOUND };
    if (isStripePaid(reg)) return { ok: false, reason: REASONS.ALREADY_PAID };
    if (!t.ownerUid || input.allowed !== true) return { ok: false, reason: REASONS.NOT_ALLOWED_OWNER };
    const fees = t.fees || {};
    if (fees.collectByCard !== true) return { ok: false, reason: REASONS.NOT_COLLECTING };
    if (!validFeeCents(fees.entryFeeCents)) return { ok: false, reason: REASONS.BAD_FEE };
    const attempts = isIntegerCents(input.attempts) ? input.attempts : 0;
    if (attempts >= MAX_CHECKOUT_ATTEMPTS) return { ok: false, reason: REASONS.TOO_MANY_ATTEMPTS };
    return { ok: true, amountCents: fees.entryFeeCents, attempt: attempts + 1 };
}

// The attempt counter's transaction body: reserve one more slot or abort.
// Returns the new count, or undefined to abort (RTDB transaction semantics).
function nextAttempt(current) {
    const n = isIntegerCents(current) ? current : 0;
    if (n >= MAX_CHECKOUT_ATTEMPTS) return undefined;
    return n + 1;
}

function checkoutIdempotencyKey(code, entryId, attempt) {
    return 'checkout:' + code + ':' + entryId + ':' + attempt;
}
function refundIdempotencyKey(code, entryId, paymentIntent) {
    return 'refund:' + code + ':' + entryId + ':' + paymentIntent;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The params for stripe.checkout.sessions.create. amountCents comes from
// planCheckout (the server's fee), never from the request.
function sessionParams(o) {
    const name = (typeof o.eventName === 'string' && o.eventName.trim()) ? o.eventName.trim().slice(0, 200) : 'Tournament';
    const urls = successUrls(o.origin, o.code, o.entryId);
    const meta = { code: o.code, entryId: o.entryId };
    const p = {
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: o.amountCents, product_data: { name: name + ' entry fee' } } }],
        client_reference_id: o.code + ':' + o.entryId,
        metadata: meta,
        payment_intent_data: { metadata: meta, statement_descriptor_suffix: 'TOURNEY' },
        success_url: urls.success_url,
        cancel_url: urls.cancel_url
    };
    if (typeof o.email === 'string' && EMAIL.test(o.email)) p.customer_email = o.email;
    return p;
}

// Who may refund: the signed-in owner, on an entry Stripe paid and not yet refunded.
function planRefund(input) {
    const uid = input && input.callerUid;
    if (!uid) return { ok: false, reason: EXTRA_REASONS.UNAUTHENTICATED };
    const t = input.tournament, reg = input.registration;
    if (!t || !reg) return { ok: false, reason: REASONS.NOT_FOUND };
    if (!t.ownerUid || t.ownerUid !== uid) return { ok: false, reason: EXTRA_REASONS.NOT_OWNER };
    if (reg.refundedAt) return { ok: false, reason: EXTRA_REASONS.ALREADY_REFUNDED };
    if (reg.paidVia !== 'stripe' || typeof reg.ref !== 'string' || !/^pi_/.test(reg.ref)) return { ok: false, reason: EXTRA_REASONS.NOT_STRIPE_PAID };
    return { ok: true, paymentIntent: reg.ref };
}

// Event types the endpoint is registered for (README lists them for the dashboard).
const EVENT_TYPES = Object.freeze([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.expired',
    'charge.refunded',
    'charge.dispute.created'
]);

// Which registration an event is about, from what the event itself carries.
// Sessions carry metadata; charges/disputes need the PaymentIntent's metadata,
// which the wrapper fetches and passes as `piMetadata`.
function eventRef(event, piMetadata) {
    const o = event && event.data && event.data.object;
    if (!o) return null;
    if (/^checkout\.session\./.test(event.type)) return parseRef(o.metadata);
    return parseRef(o.metadata) || parseRef(piMetadata);
}

// THE MAPPING. Given a verified event and what the database holds, return
//   { update: <fields for registrations/<code>/<entryId>> | null, record: {type, at},
//     status?: <registrationStatus/<code>/<entryId> value> }
// `status` (Addendum 2026-11-08) is the public, server-written mirror the
// signed-out golfer's ?checkout=done page reads by exact id; it is set only
// when paid flips (paid, or a FULL refund).
// `record` goes to stripeEvents/<event.id> in all cases (idempotency).
// A null update means: write NOTHING to the registration.
//   ctx = { ref: {code, entryId} | null, tournament, registration, refundId, now }
function mapEvent(event, ctx) {
    const now = ctx.now;
    const rec = (type) => ({ type, at: now });
    const o = event && event.data && event.data.object;
    if (!o || EVENT_TYPES.indexOf(event.type) === -1) return { update: null, record: rec('ignored') };
    if (!ctx.ref) return { update: null, record: rec('rejected-metadata') };
    const reg = ctx.registration;
    if (!reg || !ctx.tournament) return { update: null, record: rec('rejected-not-found') };

    switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
            if (event.type === 'checkout.session.completed' && o.payment_status !== 'paid') return { update: null, record: rec('pending-payment') };
            const fee = ctx.tournament.fees && ctx.tournament.fees.entryFeeCents;
            if (!validFeeCents(fee) || o.amount_total !== fee || o.currency !== CURRENCY) return { update: null, record: rec('rejected-amount') };
            if (typeof o.payment_intent !== 'string' || !/^pi_/.test(o.payment_intent)) return { update: null, record: rec('rejected-metadata') };
            if (reg.paid === true) {
                // Same payment delivered as a different event: nothing to do. A
                // different payment on an already-paid entry is a double charge -
                // never overwrite the first ref; it needs a refund in the dashboard.
                return { update: null, record: rec(reg.ref === o.payment_intent ? 'already-applied' : 'rejected-already-paid') };
            }
            return { update: { paid: true, paidAt: now, paidVia: 'stripe', ref: o.payment_intent, amountCents: o.amount_total }, record: rec(event.type), status: { paid: true, paidVia: 'stripe', at: now } };
        }
        case 'charge.refunded': {
            if (reg.ref !== o.payment_intent) return { update: null, record: rec('rejected-ref') };
            if (!isIntegerCents(o.amount_refunded) || o.amount_refunded <= 0) return { update: null, record: rec('rejected-amount') };
            const u = { refundedAt: now, refundCents: o.amount_refunded };
            if (typeof ctx.refundId === 'string' && /^re_/.test(ctx.refundId)) u.refundRef = ctx.refundId;
            if (o.refunded === true) {
                u.paid = false;
                return { update: u, record: rec(event.type), status: { paid: false, paidVia: 'stripe', at: now } };
            }
            return { update: u, record: rec(event.type) };
        }
        case 'charge.dispute.created': {
            if (reg.ref !== o.payment_intent) return { update: null, record: rec('rejected-ref') };
            return { update: { disputedAt: now }, record: rec(event.type) };
        }
        case 'checkout.session.expired': {
            if (reg.checkoutAt === undefined || reg.checkoutAt === null) return { update: null, record: rec(event.type) };
            return { update: { checkoutAt: null }, record: rec(event.type) };
        }
        default:
            return { update: null, record: rec('ignored') };
    }
}

module.exports = {
    FEE_MIN_CENTS, FEE_MAX_CENTS, MAX_CHECKOUT_ATTEMPTS, CURRENCY,
    REASONS, EXTRA_REASONS, ERROR_CODES, FIXED_ORIGINS, EVENT_TYPES,
    validFeeCents, allowedOrigin, parseRef, successUrls, planCheckout, nextAttempt,
    checkoutIdempotencyKey, refundIdempotencyKey, sessionParams, planRefund,
    eventRef, mapEvent
};
