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
    NOT_CONNECTED: 'not-connected',
    BAD_ORIGIN: 'bad-origin',
    NOT_OWNER: 'not-owner',
    NOT_STRIPE_PAID: 'not-stripe-paid',
    ALREADY_REFUNDED: 'already-refunded',
    UNAUTHENTICATED: 'unauthenticated',
    // Accounts v2 needs a contact email on the account when the recipient
    // configuration is requested (Stripe, live log 2026-11-13 18:07 UTC:
    // "If configuration.recipient is supplied, the Account must have a contact
    // email."). The owner's sign-in email is it; a sign-in without one is refused
    // before any Stripe call.
    NO_EMAIL: 'no-email'
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
    'unauthenticated': 'unauthenticated',
    'not-connected': 'failed-precondition',
    'no-email': 'failed-precondition'
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
//   connect     (Phase 2) null when the owner has no Stripe account, else
//               { acct, chargesEnabled } from stripeAccounts/<uid> + connectStatus/<uid>
//   platformFeeCents / eventFeeCents  the service fee setting (platform/connect/serviceFeeCents,
//               platform/connect/eventOverrides/<code>/serviceFeeCents; Manny-only nodes)
// -> {ok:false, reason} | {ok:true, amountCents (the entry fee), serviceFeeCents, totalCents, onAccount, attempt}
//   onAccount   the connected account the DIRECT charge is made on (null = HardPan's own charge, Phase 1)
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
    // CONNECT (2026-11-12). No account on file: the HardPan charge of Phase 1,
    // no service fee. An account that cannot take charges yet: refuse - money
    // must never land in the wrong account while the organizer is mid-setup.
    // Charges enabled: a DIRECT charge on the organizer's account, and the golfer
    // pays the entry fee PLUS HardPan's service fee, which is the application fee.
    const c = input.connect;
    let onAccount = null, serviceFeeCents = 0;
    if (c && typeof c === 'object' && c.acct !== undefined && c.acct !== null) {
        if (!ACCT_ID.test(String(c.acct))) return { ok: false, reason: REASONS.BAD_FEE };
        if (c.chargesEnabled !== true) return { ok: false, reason: EXTRA_REASONS.NOT_CONNECTED };
        const fee = serviceFee({ platformFeeCents: input.platformFeeCents, eventFeeCents: input.eventFeeCents });
        if (!fee.ok) return { ok: false, reason: fee.reason };
        onAccount = c.acct; serviceFeeCents = fee.cents;
    }
    return { ok: true, amountCents: fees.entryFeeCents, serviceFeeCents, totalCents: fees.entryFeeCents + serviceFeeCents, onAccount, attempt: attempts + 1 };
}

// ---- CONNECT (Phase 2, 2026-11-12). Manny's decisions, in order: layout A;
// only owners in payments/allowedOwners may connect; HardPan charges a service
// fee per golfer ON TOP of the entry fee on card sign-ups ($4 by default, a
// platform setting with a per-event override only Manny writes), taken as the
// Connect application fee, so the organizer receives the full entry fee minus
// Stripe's processing; payouts on a 7-day delay; Stripe issues the 1099-Ks.
// RISK MODEL (Manny, 2026-11-13 16:40, after the sandbox refused the create):
// STRIPE-MANAGED RISK with DIRECT CHARGES and the FULL Stripe dashboard.
// The account is created with fees_collector + losses_collector = 'stripe'
// (Stripe bills the organizer its processing and carries negative balances;
// HardPan holds no reserve). The checkout session is created ON the connected
// account (the handler passes stripeAccount), so the charge is the organizer's
// own: their statement descriptor, their Stripe fee; HardPan's $4 is the
// application fee on that charge. Refunds run on the connected account too
// and return the application fee. The organizer manages the account at
// dashboard.stripe.com (no Express login link). Direct-charge events are
// emitted on the connected account, so the Connected-accounts endpoint
// handles them (CONNECT_ENDPOINT_EVENT_TYPES).
const ACCT_ID = /^acct_[A-Za-z0-9]{1,64}$/;   // shape only; Stripe's ids are 16 chars, the tests' are short
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_SERVICE_FEE_CENTS = 400;
const MAX_SERVICE_FEE_CENTS = 2000;
// ACCOUNTS V2 (2026-11-13). Stripe refuses POST /v1/accounts for new Connect
// integrations ("Stripe no longer recommends Accounts v1 ... use POST
// /v2/core/accounts"; the Dashboard's "Accounts v1 support" policy did not
// lift it for our key, Grok 10:04). Only CREATION moves to v2: the account is
// made with POST /v2/core/accounts (dashboard 'express', the application
// collects fees and losses, card_payments + stripe_transfers requested) and
// its onboarding link with POST /v2/core/account_links. Everything else stays
// on v1, which Stripe documents as working with v2 account ids: GET
// /v1/accounts/{id} returns the v1 shape (charges_enabled, payouts_enabled,
// requirements.currently_due), login links, and v2 accounts keep sending the
// v1 account.updated event, so the second endpoint is unchanged. The v2 create
// has no payout-schedule field; the 7-day delay is applied right after with
// the v1 update, and a refusal there is recorded, not hidden (handlers.js).
const CONNECT = Object.freeze({ country: 'US', countryV2: 'us', currency: 'usd', payoutDelayDays: 7, siteUrl: 'https://tournaments.rattlegolf.com' });
const CONNECT_EVENT_TYPES = Object.freeze(['account.updated', 'account.application.deauthorized']);
// Where the organizer manages a full-dashboard account (no login-link API for it).
const DASHBOARD_URL = 'https://dashboard.stripe.com/';

// The service fee in cents: the per-event override when Manny set one, else the
// platform number, else $4. Whole cents, $0..$20. The client never sends it.
function serviceFee(o) {
    const pick = (o && o.eventFeeCents !== undefined && o.eventFeeCents !== null) ? o.eventFeeCents
        : (o && o.platformFeeCents !== undefined && o.platformFeeCents !== null) ? o.platformFeeCents
        : DEFAULT_SERVICE_FEE_CENTS;
    if (!isIntegerCents(pick) || pick > MAX_SERVICE_FEE_CENTS) return { ok: false, reason: REASONS.BAD_FEE };
    return { ok: true, cents: pick };
}

// Who may start onboarding: the signed-in owner of this event, and only an
// owner Manny listed in payments/allowedOwners.
function planConnect(input) {
    const uid = input && input.callerUid;
    if (!uid || !UID.test(String(uid))) return { ok: false, reason: EXTRA_REASONS.UNAUTHENTICATED };
    const t = input.tournament;
    if (!t || typeof t !== 'object') return { ok: false, reason: REASONS.NOT_FOUND };
    if (!t.ownerUid || t.ownerUid !== uid) return { ok: false, reason: EXTRA_REASONS.NOT_OWNER };
    if (input.allowed !== true) return { ok: false, reason: REASONS.NOT_ALLOWED_OWNER };
    return { ok: true, uid };
}
function connectIdempotencyKey(uid) { return 'connect-acct:' + uid; }
// POST /v2/core/accounts under Stripe-managed risk (Manny 2026-11-13 16:40):
// `dashboard: 'full'` with fees_collector + losses_collector = 'stripe' - the
// sandbox platform profile's model (Stripe-managed risk, direct charges). The
// Express dashboard with managed risk is a Stripe public preview on a preview
// API version, so the full dashboard it is. Only the merchant configuration is
// requested (card_payments: the organizer takes the charge directly); no
// recipient configuration - nothing is transferred. No `type`, no
// `capabilities`, no `settings.payouts` here: those are v1 fields.
// The organizer's sign-in email as Stripe's contact_email, or null.
function connectEmail(email) {
    const e = (typeof email === 'string') ? email.trim().toLowerCase() : '';
    return (e && e.length <= 254 && EMAIL.test(e)) ? e : null;
}
function accountCreateParams(o) {
    const name = (typeof o.name === 'string' && o.name.trim()) ? o.name.trim().slice(0, 100) : null;
    const email = connectEmail(o.email);
    const p = {
        dashboard: 'full',
        identity: { country: CONNECT.countryV2 },
        defaults: {
            currency: CONNECT.currency,
            responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
            profile: { business_url: CONNECT.siteUrl }
        },
        configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } }
        },
        metadata: { uid: o.uid }
    };
    if (name) p.display_name = name;
    if (email) p.contact_email = email;
    return p;
}
// The v1 update applied right after creation (v2 has no schedule field).
function payoutScheduleParams() {
    return { settings: { payouts: { schedule: { interval: 'daily', delay_days: CONNECT.payoutDelayDays } } } };
}
// The onboarding link: POST /v1/account_links with the v2 account id (2026-11-13,
// second live run). Stripe created the v2 account and then refused the v2 link
// in legacy TEST MODE: "Cannot create a v2 account link for acct_… with
// recipient config capabilities other than stripe_balance.stripe_transfers
// requested in testmode. Please switch to an account created in a sandbox to
// test." Legacy test mode "partially supports V2" (docs.stripe.com/testing-use-
// cases); v1 endpoints take v2 account ids (the v1 payout-schedule update on
// this very account went through), so the link is the v1 call again. If Stripe
// refuses this too, the way through is a Sandbox (STRIPE-SANDBOX-STEPS.md).
function accountLinkParams(o) {
    const origin = allowedOrigin(o.origin, { emulator: o.emulator === true });
    if (!origin || !SAFE_KEY.test(String(o.code)) || !ACCT_ID.test(String(o.acct))) return null;
    const base = origin + '/tournament?tourney=' + encodeURIComponent(o.code) + '&connect=';
    return { account: o.acct, type: 'account_onboarding', return_url: base + 'return', refresh_url: base + 'refresh' };
}
// The owner-readable mirror connectStatus/<uid>, from a v1-shaped Stripe
// Account object (GET /v1/accounts/{id} on a v2 account returns this shape).
// `fallbackName` is the name we gave at creation, kept in stripeAccounts, for
// when the v1 view carries no business_profile.name.
function connectStatusOf(acct, now, fallbackName) {
    const req = (acct && acct.requirements && Array.isArray(acct.requirements.currently_due)) ? acct.requirements.currently_due.filter((x) => typeof x === 'string').slice(0, 50) : [];
    const clean = (s) => (typeof s === 'string' && s.trim()) ? s.trim().slice(0, 100) : null;
    const name = clean(acct && acct.business_profile && acct.business_profile.name) || clean(fallbackName);
    return { chargesEnabled: !!(acct && acct.charges_enabled === true), payoutsEnabled: !!(acct && acct.payouts_enabled === true), detailsSubmitted: !!(acct && acct.details_submitted === true), due: req, name, updatedAt: now };
}
// 'none' (no account) | 'finish' (started, not fully on) | 'on' (charges + payouts enabled)
function connectState(st) {
    if (!st || typeof st !== 'object') return 'none';
    return (st.chargesEnabled === true && st.payoutsEnabled === true) ? 'on' : 'finish';
}
// Connected-account events (the second endpoint). -> { uid|null, status|null, record }
// `owner` is what the handler found in stripeAccounts for the event's account id
// ({uid, name}): deauthorized events carry no metadata of their own, and the v1
// view of a v2 account is not relied on for metadata either - an account we
// hold is ours whether or not metadata.uid comes through. The two must agree
// when both are present.
function mapAccountEvent(event, now, owner) {
    const rec = (type) => ({ type, at: now });
    const o = event && event.data && event.data.object;
    if (!o || CONNECT_EVENT_TYPES.indexOf(event.type) === -1) return { uid: null, status: null, record: rec('ignored') };
    const ownerUid = owner && typeof owner.uid === 'string' && UID.test(owner.uid) ? owner.uid : null;
    if (event.type === 'account.updated') {
        const metaUid = o.metadata && typeof o.metadata.uid === 'string' && UID.test(o.metadata.uid) ? o.metadata.uid : null;
        const uid = metaUid || ownerUid;
        if (!uid || (metaUid && ownerUid && metaUid !== ownerUid)) return { uid: null, status: null, record: rec('rejected-account') };
        return { uid, status: connectStatusOf(o, now, owner && owner.name), record: rec(event.type) };
    }
    const uid = ownerUid;
    if (!uid) return { uid: null, status: null, record: rec('rejected-account') };
    return { uid, status: { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, due: [], name: null, updatedAt: now, deauthorizedAt: now }, record: rec(event.type) };
}
// Refund params: a direct charge is refunded ON the connected account (the
// handler passes stripeAccount) and returns our application fee, so the golfer
// is made whole and the organizer is never short; nothing to reverse.
function refundParams(plan, ref) {
    const p = { payment_intent: plan.paymentIntent, metadata: { code: ref.code, entryId: ref.entryId } };
    if (plan.onAccount) p.refund_application_fee = true;
    return p;
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
    const items = [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: o.amountCents, product_data: { name: name + ' entry fee' } } }];
    const pid = { metadata: meta, statement_descriptor_suffix: 'TOURNEY' };
    // CONNECT: a DIRECT charge on the organizer's account (the handler creates
    // the session with stripeAccount = acct, so no on_behalf_of / transfer_data
    // here); HardPan's service fee is its own line the golfer sees, and the
    // application fee HardPan keeps. $0 adds no line and no fee.
    if (typeof o.acct === 'string' && ACCT_ID.test(o.acct)) {
        const fee = isIntegerCents(o.serviceFeeCents) ? o.serviceFeeCents : 0;
        meta.acct = o.acct; meta.serviceFeeCents = String(fee);
        if (fee > 0) {
            items.push({ quantity: 1, price_data: { currency: CURRENCY, unit_amount: fee, product_data: { name: 'HardPan service fee' } } });
            pid.application_fee_amount = fee;
        }
    }
    const p = {
        mode: 'payment',
        line_items: items,
        client_reference_id: o.code + ':' + o.entryId,
        metadata: meta,
        payment_intent_data: pid,
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
    return { ok: true, paymentIntent: reg.ref, onAccount: (typeof reg.acct === 'string' && ACCT_ID.test(reg.acct)) ? reg.acct : null };
}

// Event types the PLATFORM endpoint is registered for (HardPan's own charges).
const EVENT_TYPES = Object.freeze([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.expired',
    'charge.refunded',
    'charge.dispute.created'
]);
// The CONNECTED-ACCOUNTS endpoint: the account events plus the same payment
// events, which a direct charge emits on the organizer's account (with
// event.account). README lists both sets for the dashboard.
const CONNECT_ENDPOINT_EVENT_TYPES = Object.freeze(CONNECT_EVENT_TYPES.concat(EVENT_TYPES));

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
            // CONNECT: a destination session carries acct + serviceFeeCents in its
            // metadata (set by sessionParams, never by a client); the total the
            // golfer paid must be the entry fee plus exactly that service fee.
            const acct = (o.metadata && typeof o.metadata.acct === 'string' && ACCT_ID.test(o.metadata.acct)) ? o.metadata.acct : null;
            // A direct charge's event arrives on the connected account (event.account):
            // it must be the account the session was made on, and a platform event
            // must not claim one.
            const evAcct = typeof event.account === 'string' ? event.account : null;
            if ((evAcct || acct) && evAcct !== acct) return { update: null, record: rec('rejected-account') };
            let service = 0;
            if (acct) {
                const raw = o.metadata.serviceFeeCents;
                service = /^\d{1,5}$/.test(String(raw)) ? Number(raw) : NaN;
                if (!isIntegerCents(service) || service > MAX_SERVICE_FEE_CENTS) return { update: null, record: rec('rejected-amount') };
            }
            if (!validFeeCents(fee) || o.amount_total !== fee + service || o.currency !== CURRENCY) return { update: null, record: rec('rejected-amount') };
            if (typeof o.payment_intent !== 'string' || !/^pi_/.test(o.payment_intent)) return { update: null, record: rec('rejected-metadata') };
            if (reg.paid === true) {
                // Same payment delivered as a different event: nothing to do. A
                // different payment on an already-paid entry is a double charge -
                // never overwrite the first ref; it needs a refund in the dashboard.
                return { update: null, record: rec(reg.ref === o.payment_intent ? 'already-applied' : 'rejected-already-paid') };
            }
            const upd = { paid: true, paidAt: now, paidVia: 'stripe', ref: o.payment_intent, amountCents: fee };
            if (acct) { upd.serviceFeeCents = service; upd.acct = acct; }
            return { update: upd, record: rec(event.type), status: { paid: true, paidVia: 'stripe', at: now } };
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
    eventRef, mapEvent,
    // Connect (2026-11-12)
    DEFAULT_SERVICE_FEE_CENTS, MAX_SERVICE_FEE_CENTS, CONNECT, CONNECT_EVENT_TYPES, CONNECT_ENDPOINT_EVENT_TYPES, DASHBOARD_URL,
    serviceFee, planConnect, connectIdempotencyKey, connectEmail, accountCreateParams, payoutScheduleParams, accountLinkParams,
    connectStatusOf, connectState, mapAccountEvent, refundParams
};
