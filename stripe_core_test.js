// ============================================================================
// STRIPE PHASE 1 - THE PURE RULES (stripe-functions/stripe-core.js)
//
// No Stripe, no Firebase, no network: the module has no SDK imports, and test 1
// proves that from its source. Every rule the server enforces on money is a
// plain function here, so each one is asserted directly and each has a
// negative control (see the wave report).
//
// What this file CANNOT prove: that index.js / handlers.js actually call these
// functions, or that Stripe signs what we think it signs. stripe_webhook_test.js
// does that, through the handlers and the deployed wrappers, against the DB
// emulator with the stripe package's own signature helper.
//
// BASELINE (new file, final run, branch stripe-1-server on 115296b8): 13 tests.
// Against 115296b8 (no stripe-functions/stripe-core.js) the require fails at
// load: 0 pass / 1 fail (the file), nothing per assertion proven. Against the
// finished module: 13 pass / 0 fail.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('./stripe-functions/stripe-core.js');

const SRC = fs.readFileSync(path.join(__dirname, 'stripe-functions', 'stripe-core.js'), 'utf8');
const T = (fees, extra) => Object.assign({ ownerUid: 'u-org', name: 'Stripe Open', fees }, extra || {});
const FEES = { entryFeeCents: 5000, collectByCard: true, allowCash: true };
const REG = (extra) => Object.assign({ createdAt: 1, fullName: 'Ann', email: 'ann@example.test', phone: '5555550100' }, extra || {});
const plan = (o) => C.planCheckout(Object.assign({ tournament: T(FEES), registration: REG(), allowed: true, attempts: 0 }, o));

test('1. stripe-core.js is pure: no require() of anything, and it really exports the rules', () => {
    assert.doesNotMatch(SRC, /\brequire\s*\(/);
    assert.doesNotMatch(SRC, /\bfetch\s*\(|process\.env/);
    // positive: the module is the file we think it is
    for (const fn of ['planCheckout', 'mapEvent', 'planRefund', 'allowedOrigin', 'sessionParams', 'validFeeCents', 'parseRef', 'nextAttempt']) assert.equal(typeof C[fn], 'function', fn);
});

test('2. contract reason strings are exact', () => {
    assert.deepEqual(Object.values(C.REASONS).sort(), ['already-paid', 'bad-fee', 'not-allowed-owner', 'not-collecting', 'not-found', 'too-many-attempts']);
    for (const r of Object.values(C.REASONS).concat(Object.values(C.EXTRA_REASONS))) assert.ok(C.ERROR_CODES[r], 'error code for ' + r);
});

test('3. fee check: integer cents 100..100000 only', () => {
    for (const ok of [100, 5000, 100000]) assert.equal(C.validFeeCents(ok), true, String(ok));
    for (const bad of [99, 100001, 0, -100, 50.5, 5000.01, '5000', null, undefined, NaN, Infinity, true]) assert.equal(C.validFeeCents(bad), false, String(bad));
});

test('4. origin allow-list: the three hosts, a single-label preview, localhost only in the emulator', () => {
    for (const o of ['https://tournaments.rattlegolf.com', 'https://hardpangolf.com', 'https://golf-app-5a5.pages.dev', 'https://abc123.golf-app-5a5.pages.dev', 'https://stripe-1.golf-app-5a5.pages.dev']) assert.equal(C.allowedOrigin(o), o, o);
    for (const o of ['https://evil.com', 'http://tournaments.rattlegolf.com', 'https://tournaments.rattlegolf.com.evil.com', 'https://golf-app-5a5.pages.dev.evil.com',
        'https://a.b.golf-app-5a5.pages.dev', 'https://evilgolf-app-5a5.pages.dev', 'https://hardpangolf.com/', 'http://localhost:5000', 'http://localhost', 'null', '', undefined, null]) assert.equal(C.allowedOrigin(o), null, String(o));
    assert.equal(C.allowedOrigin('http://localhost:5000', { emulator: true }), 'http://localhost:5000');
    assert.equal(C.allowedOrigin('http://localhost.evil.com', { emulator: true }), null);
    assert.equal(C.allowedOrigin('http://127.0.0.1:5000', { emulator: true }), null);
});

test('5. metadata / input parse: only code + entryId, path-safe', () => {
    assert.deepEqual(C.parseRef({ code: 'STR1', entryId: 'e1abc', amountCents: 1 }), { code: 'STR1', entryId: 'e1abc' });
    for (const bad of [null, {}, { code: 'STR1' }, { code: 'A/B', entryId: 'e' }, { code: 'STR1', entryId: '../x' }, { code: 'S.1', entryId: 'e' }, { code: 'S#', entryId: 'e' },
        { code: 'S$', entryId: 'e' }, { code: 'S[1]', entryId: 'e' }, { code: 1, entryId: 'e' }, { code: '', entryId: 'e' }, { code: 'x'.repeat(65), entryId: 'e' }]) assert.equal(C.parseRef(bad), null, JSON.stringify(bad));
});

test('6. planCheckout: each refusal reason, and the amount is the record fee', () => {
    // Re-pinned 2026-11-12 (Connect): the plan also names the service fee (0 on a HardPan charge), the total and the destination (null).
    assert.deepEqual(plan({}), { ok: true, amountCents: 5000, serviceFeeCents: 0, totalCents: 5000, destination: null, attempt: 1 });
    assert.equal(plan({ tournament: null }).reason, 'not-found');
    assert.equal(plan({ registration: null }).reason, 'not-found');
    assert.equal(plan({ registration: REG({ paid: true, paidVia: 'cash' }) }).reason, 'already-paid');
    assert.equal(plan({ registration: REG({ paid: true, paidVia: 'stripe', ref: 'pi_1' }) }).reason, 'already-paid');
    assert.equal(plan({ allowed: null }).reason, 'not-allowed-owner');
    assert.equal(plan({ allowed: 'true' }).reason, 'not-allowed-owner');
    assert.equal(plan({ tournament: T(FEES, { ownerUid: '' }) }).reason, 'not-allowed-owner');
    assert.equal(plan({ tournament: T(Object.assign({}, FEES, { collectByCard: false })) }).reason, 'not-collecting');
    assert.equal(plan({ tournament: T(undefined) }).reason, 'not-collecting');
    assert.equal(plan({ tournament: T(Object.assign({}, FEES, { entryFeeCents: 99 })) }).reason, 'bad-fee');
    assert.equal(plan({ tournament: T(Object.assign({}, FEES, { entryFeeCents: 50.5 })) }).reason, 'bad-fee');
    assert.equal(plan({ attempts: 4 }).attempt, 5);
    assert.equal(plan({ attempts: 5 }).reason, 'too-many-attempts');
    // A refunded entry (paid false) can pay again.
    assert.equal(plan({ registration: REG({ paid: false, paidVia: 'stripe', refundedAt: 1 }) }).ok, true);
});

test('7. attempt counting: 5 then abort', () => {
    assert.equal(C.nextAttempt(null), 1);
    assert.equal(C.nextAttempt(4), 5);
    assert.equal(C.nextAttempt(5), undefined);
    assert.equal(C.nextAttempt(99), undefined);
    assert.equal(C.nextAttempt('3'), 1);   // garbage counts as zero, never as "unlimited"
    assert.equal(C.MAX_CHECKOUT_ATTEMPTS, 5);
});

test('8. sessionParams: usd, one line item at the server amount, metadata, URLs, idempotency keys', () => {
    const p = C.sessionParams({ code: 'STR1', entryId: 'e1', origin: 'https://tournaments.rattlegolf.com', amountCents: 5000, eventName: 'Stripe Open', email: 'ann@example.test' });
    assert.equal(p.mode, 'payment');
    assert.equal(p.line_items.length, 1);
    assert.deepEqual(p.line_items[0].price_data, { currency: 'usd', unit_amount: 5000, product_data: { name: 'Stripe Open entry fee' } });
    assert.deepEqual(p.metadata, { code: 'STR1', entryId: 'e1' });
    assert.deepEqual(p.payment_intent_data.metadata, { code: 'STR1', entryId: 'e1' });
    assert.equal(p.client_reference_id, 'STR1:e1');
    assert.equal(p.customer_email, 'ann@example.test');
    assert.equal(p.success_url, 'https://tournaments.rattlegolf.com/tournament?register=STR1&entry=e1&checkout=done');
    assert.equal(p.cancel_url, 'https://tournaments.rattlegolf.com/tournament?register=STR1&entry=e1&checkout=cancel');
    assert.equal(C.sessionParams({ code: 'S', entryId: 'e', origin: 'https://hardpangolf.com', amountCents: 100, email: 'not an email' }).customer_email, undefined);
    assert.equal(C.checkoutIdempotencyKey('STR1', 'e1', 3), 'checkout:STR1:e1:3');
    assert.equal(C.refundIdempotencyKey('STR1', 'e1', 'pi_9'), 'refund:STR1:e1:pi_9');
});

const SESSION = (o) => ({ id: 'evt_1', type: 'checkout.session.completed', data: { object: Object.assign({ object: 'checkout.session', payment_status: 'paid', amount_total: 5000, currency: 'usd', payment_intent: 'pi_A', metadata: { code: 'STR1', entryId: 'e1' } }, o) } });
const CTX = (o) => Object.assign({ ref: { code: 'STR1', entryId: 'e1' }, tournament: T(FEES), registration: REG(), now: 777 }, o);

test('9. mapEvent paid: exactly the contract update, only when amount === fee and currency usd', () => {
    assert.deepEqual(C.mapEvent(SESSION(), CTX()), { update: { paid: true, paidAt: 777, paidVia: 'stripe', ref: 'pi_A', amountCents: 5000 }, record: { type: 'checkout.session.completed', at: 777 }, status: { paid: true, paidVia: 'stripe', at: 777 } });
    const asy = SESSION({}); asy.type = 'checkout.session.async_payment_succeeded'; asy.data.object.payment_status = 'paid';
    assert.equal(C.mapEvent(asy, CTX()).update.paidVia, 'stripe');
    for (const [why, o] of [['under', { amount_total: 4999 }], ['over', { amount_total: 5001 }], ['zero', { amount_total: 0 }], ['string', { amount_total: '5000' }], ['eur', { currency: 'eur' }], ['USD caps', { currency: 'USD' }]]) {
        const out = C.mapEvent(SESSION(o), CTX());
        assert.equal(out.update, null, why);
        assert.equal(out.status, undefined, why);
        assert.equal(out.record.type, 'rejected-amount', why);
    }
    // fee on the record that is itself invalid: never paid
    assert.equal(C.mapEvent(SESSION({ amount_total: 50 }), CTX({ tournament: T({ entryFeeCents: 50, collectByCard: true }) })).update, null);
    assert.equal(C.mapEvent(SESSION({ payment_status: 'unpaid' }), CTX()).update, null);
    assert.equal(C.mapEvent(SESSION({ payment_intent: null }), CTX()).update, null);
    assert.equal(C.mapEvent(SESSION(), CTX({ ref: null })).record.type, 'rejected-metadata');
    assert.equal(C.mapEvent(SESSION(), CTX({ registration: null })).record.type, 'rejected-not-found');
    // already paid: same PI = no-op; another PI = never overwrite the first ref
    assert.equal(C.mapEvent(SESSION(), CTX({ registration: REG({ paid: true, ref: 'pi_A' }) })).record.type, 'already-applied');
    const dbl = C.mapEvent(SESSION({ payment_intent: 'pi_B' }), CTX({ registration: REG({ paid: true, paidVia: 'stripe', ref: 'pi_A' }) }));
    assert.equal(dbl.update, null); assert.equal(dbl.record.type, 'rejected-already-paid');
});

test('10. mapEvent refund / dispute / expired / unknown', () => {
    const paid = REG({ paid: true, paidVia: 'stripe', ref: 'pi_A', amountCents: 5000 });
    const ch = (o) => ({ id: 'evt_2', type: 'charge.refunded', data: { object: Object.assign({ object: 'charge', id: 'ch_1', payment_intent: 'pi_A', amount_refunded: 5000, refunded: true }, o) } });
    assert.deepEqual(C.mapEvent(ch(), CTX({ registration: paid, refundId: 're_1' })).update, { refundedAt: 777, refundCents: 5000, refundRef: 're_1', paid: false });
    assert.deepEqual(C.mapEvent(ch(), CTX({ registration: paid, refundId: 're_1' })).status, { paid: false, paidVia: 'stripe', at: 777 });
    const part = C.mapEvent(ch({ refunded: false, amount_refunded: 100 }), CTX({ registration: paid, refundId: 're_1' }));
    assert.equal('paid' in part.update, false, 'partial refund keeps paid');
    assert.equal(part.status, undefined, 'partial refund leaves the status mirror');
    assert.equal(C.mapEvent(ch({ payment_intent: 'pi_OTHER' }), CTX({ registration: paid })).update, null, 'refund for another PI');
    assert.equal(C.mapEvent(ch({ amount_refunded: 0 }), CTX({ registration: paid })).update, null);
    const dp = { id: 'evt_3', type: 'charge.dispute.created', data: { object: { object: 'dispute', payment_intent: 'pi_A' } } };
    assert.deepEqual(C.mapEvent(dp, CTX({ registration: paid })).update, { disputedAt: 777 });
    assert.equal(C.mapEvent({ ...dp, data: { object: { payment_intent: 'pi_Z' } } }, CTX({ registration: paid })).update, null);
    const ex = { id: 'evt_4', type: 'checkout.session.expired', data: { object: { metadata: { code: 'STR1', entryId: 'e1' } } } };
    assert.deepEqual(C.mapEvent(ex, CTX({ registration: REG({ checkoutAt: 5 }) })).update, { checkoutAt: null });
    assert.equal(C.mapEvent(ex, CTX()).update, null);
    assert.equal(C.mapEvent({ id: 'evt_5', type: 'invoice.paid', data: { object: {} } }, CTX()).record.type, 'ignored');
});

test('11. eventRef: sessions by their metadata only; charges fall back to the PaymentIntent metadata', () => {
    assert.deepEqual(C.eventRef(SESSION(), { code: 'X', entryId: 'Y' }), { code: 'STR1', entryId: 'e1' });
    assert.equal(C.eventRef(SESSION({ metadata: {} }), { code: 'X', entryId: 'Y' }), null);
    assert.deepEqual(C.eventRef({ type: 'charge.refunded', data: { object: { metadata: {} } } }, { code: 'X', entryId: 'Y' }), { code: 'X', entryId: 'Y' });
});

test('12. planRefund: signed-in owner only, Stripe-paid, not yet refunded', () => {
    const paid = REG({ paid: true, paidVia: 'stripe', ref: 'pi_A' });
    // Re-pinned 2026-11-12 (Connect): the plan also names the destination account (null on a HardPan charge).
    assert.deepEqual(C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: paid }), { ok: true, paymentIntent: 'pi_A', destination: null });
    assert.equal(C.planRefund({ callerUid: null, tournament: T(FEES), registration: paid }).reason, 'unauthenticated');
    assert.equal(C.planRefund({ callerUid: 'u-who', tournament: T(FEES), registration: paid }).reason, 'not-owner');
    assert.equal(C.planRefund({ callerUid: 'u-org', tournament: T(FEES, { ownerUid: undefined }), registration: paid }).reason, 'not-owner');
    assert.equal(C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: null }).reason, 'not-found');
    assert.equal(C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: REG({ paid: true, paidVia: 'cash' }) }).reason, 'not-stripe-paid');
    assert.equal(C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: REG({ paid: false, paidVia: 'stripe', ref: 'pi_A', refundedAt: 2 }) }).reason, 'already-refunded');
});

test('13. firebase.json carries ONLY the tournaments-stripe codebase; the site never serves stripe-functions/', async () => {
    const fb = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase.json'), 'utf8'));
    assert.deepEqual(fb.database, { rules: 'database.rules.json' });
    assert.ok(Array.isArray(fb.functions));
    assert.deepEqual(fb.functions.map((f) => [f.codebase, f.source, f.runtime]), [['tournaments-stripe', 'stripe-functions', 'nodejs22']]);
    const { pathToFileURL } = require('url');
    const M = await import(pathToFileURL(path.join(__dirname, 'functions', '_middleware.js')).href);
    for (const p of ['/stripe-functions', '/stripe-functions/', '/stripe-functions/index.js', '/stripe-functions/README.md', '/stripe-functions/package.json', '/%73tripe-functions/index.js']) assert.equal(M.isBlockedPath(p), true, p);
    const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '_routes.json'), 'utf8'));
    assert.ok(routes.include.includes('/stripe-functions') && routes.include.includes('/stripe-functions/*'));
    // positive: the site pages are still not blocked
    assert.equal(M.isBlockedPath('/tournament.html'), false);
});

// ---------------------------------------------------------------------------
// STRIPE CONNECT (Phase 2, 2026-11-12; Manny's decisions: layout A; only
// payments/allowedOwners may connect; application fee $0 (platform number,
// default absent); 7-day payout delay; the card statement shows the organizer
// (on_behalf_of); Stripe issues the 1099-Ks (Express)). Pure rules only here;
// the handlers are driven in stripe_webhook_test.js.
// Baseline for tests 14-21 (+19b) against main 5041dd9b (no Connect code): each
// fails at the first call (the function is not exported): 13 pass / 9 fail.
// With the build: 22 pass / 0 fail. Controls (stripe-core.js mutated, restored by
// sha from a saved copy): default fee 0 -> 17 + 18 red; application_fee_amount
// dropped -> 19 red; refund without reverse_transfer -> 20 red; mid-setup not
// refused -> 18 red; anyone may connect -> 16 red; webhook total not exact -> 9 + 19b red.
// ---------------------------------------------------------------------------
test('14. Connect account params: Express, US, card_payments + transfers, 7-day daily payout delay, the organizer name, uid in metadata', () => {
    const p = C.accountCreateParams({ uid: 'u-org', name: 'Hope Foundation' });
    assert.equal(p.type, 'express'); assert.equal(p.country, 'US');
    assert.deepEqual(p.capabilities, { card_payments: { requested: true }, transfers: { requested: true } });
    assert.deepEqual(p.settings.payouts.schedule, { interval: 'daily', delay_days: 7 });
    assert.equal(p.business_profile.name, 'Hope Foundation');
    assert.equal(p.business_profile.url, 'https://tournaments.rattlegolf.com');
    assert.deepEqual(p.metadata, { uid: 'u-org' });
    assert.equal(C.accountCreateParams({ uid: 'u-org', name: '' }).business_profile.name, undefined, 'no made-up name');
    assert.equal(C.accountCreateParams({ uid: 'u-org', name: 'x'.repeat(300) }).business_profile.name.length, 100, 'clipped');
    assert.equal(C.connectIdempotencyKey('u-org'), 'connect-acct:u-org');
});

test('15. account link params: onboarding type, return/refresh on the allowed origin only', () => {
    const l = C.accountLinkParams({ acct: 'acct_1', origin: 'https://tournaments.rattlegolf.com', code: 'ABC' });
    assert.equal(l.account, 'acct_1'); assert.equal(l.type, 'account_onboarding');
    assert.equal(l.return_url, 'https://tournaments.rattlegolf.com/tournament?tourney=ABC&connect=return');
    assert.equal(l.refresh_url, 'https://tournaments.rattlegolf.com/tournament?tourney=ABC&connect=refresh');
    assert.equal(C.accountLinkParams({ acct: 'acct_1', origin: 'https://evil.example', code: 'ABC' }), null, 'a bad origin gets no link');
    assert.equal(C.accountLinkParams({ acct: 'acct_1', origin: 'https://tournaments.rattlegolf.com', code: 'bad code' }), null, 'a bad code gets no link');
});

test('16. planConnect: the signed-in OWNER of the event, and only an allow-listed owner (payments/allowedOwners)', () => {
    const t = T(FEES);
    assert.deepEqual(C.planConnect({ callerUid: 'u-org', tournament: t, allowed: true }), { ok: true, uid: 'u-org' });
    assert.equal(C.planConnect({ callerUid: null, tournament: t, allowed: true }).reason, 'unauthenticated');
    assert.equal(C.planConnect({ callerUid: 'u-org', tournament: null, allowed: true }).reason, 'not-found');
    assert.equal(C.planConnect({ callerUid: 'u-else', tournament: t, allowed: true }).reason, 'not-owner');
    assert.equal(C.planConnect({ callerUid: 'u-org', tournament: t, allowed: false }).reason, 'not-allowed-owner', 'Manny 2026-11-12: only owners he approves may connect');
    assert.equal(C.planConnect({ callerUid: 'u-org', tournament: t, allowed: 'true' }).reason, 'not-allowed-owner', 'exactly true');
    assert.equal(C.ERROR_CODES['not-connected'], 'failed-precondition');
});

test('17. service fee (Manny 2026-11-12): $4 per golfer by default, ON TOP of the entry fee; the platform number or a per-event override set by Manny only; whole cents $0..$20; never from the client', () => {
    assert.deepEqual(C.serviceFee({}), { ok: true, cents: 400 }, 'default $4 when nothing is set');
    assert.deepEqual(C.serviceFee({ platformFeeCents: 300 }), { ok: true, cents: 300 }, 'the platform number');
    assert.deepEqual(C.serviceFee({ platformFeeCents: 300, eventFeeCents: 0 }), { ok: true, cents: 0 }, 'a per-event override wins, even to $0');
    assert.deepEqual(C.serviceFee({ platformFeeCents: 300, eventFeeCents: 250 }), { ok: true, cents: 250 });
    assert.deepEqual(C.serviceFee({ platformFeeCents: 2001 }), { ok: false, reason: 'bad-fee' }, 'over $20');
    assert.deepEqual(C.serviceFee({ eventFeeCents: 12.5 }), { ok: false, reason: 'bad-fee' }, 'integer cents only');
    assert.deepEqual(C.serviceFee({ eventFeeCents: -1 }), { ok: false, reason: 'bad-fee' });
    assert.equal(C.DEFAULT_SERVICE_FEE_CENTS, 400);
});

test('18. planCheckout with Connect: no account = the HardPan charge as before (no service fee); an account that cannot charge yet = not-connected; charges enabled = destination charge, the golfer pays entry + service fee', () => {
    const base = { tournament: T(FEES), registration: REG(), allowed: true, attempts: 0 };
    const none = C.planCheckout(Object.assign({}, base, { connect: null }));
    assert.equal(none.ok, true); assert.equal(none.destination, null); assert.equal(none.serviceFeeCents, 0); assert.equal(none.amountCents, 5000); assert.equal(none.totalCents, 5000);
    const half = C.planCheckout(Object.assign({}, base, { connect: { acct: 'acct_1', chargesEnabled: false } }));
    assert.deepEqual(half, { ok: false, reason: 'not-connected' }, 'an organizer mid-setup is never charged into the wrong account');
    const on = C.planCheckout(Object.assign({}, base, { connect: { acct: 'acct_1', chargesEnabled: true } }));
    assert.equal(on.ok, true); assert.equal(on.destination, 'acct_1'); assert.equal(on.amountCents, 5000); assert.equal(on.serviceFeeCents, 400); assert.equal(on.totalCents, 5400);
    const ov = C.planCheckout(Object.assign({}, base, { connect: { acct: 'acct_1', chargesEnabled: true }, platformFeeCents: 300, eventFeeCents: 100 }));
    assert.equal(ov.serviceFeeCents, 100); assert.equal(ov.totalCents, 5100);
    const bad = C.planCheckout(Object.assign({}, base, { connect: { acct: 'acct_1', chargesEnabled: true }, platformFeeCents: 9999 }));
    assert.deepEqual(bad, { ok: false, reason: 'bad-fee' });
    assert.equal(C.planCheckout(Object.assign({}, base, { connect: { acct: 'nope', chargesEnabled: true } })).ok, false, 'a malformed account id is not a destination');
    assert.equal(C.planCheckout(Object.assign({}, base, { allowed: false, connect: { acct: 'acct_1', chargesEnabled: true } })).reason, 'not-allowed-owner', 'the allowed-owner gate still stands in front of every branch');
});

test('19. sessionParams on a destination charge: two line items (entry fee, HardPan service fee), application_fee_amount = the service fee, on_behalf_of + transfer_data, acct in both metadata; the platform charge is one line item as before', () => {
    const base = { code: 'ABC', entryId: 'e1', origin: 'https://tournaments.rattlegolf.com', amountCents: 5000, eventName: 'Hope Scramble' };
    const plat = C.sessionParams(base);
    assert.equal(plat.line_items.length, 1); assert.equal(plat.line_items[0].price_data.unit_amount, 5000);
    assert.equal(plat.payment_intent_data.on_behalf_of, undefined); assert.equal(plat.payment_intent_data.transfer_data, undefined); assert.equal(plat.metadata.acct, undefined);
    const dest = C.sessionParams(Object.assign({}, base, { acct: 'acct_1', serviceFeeCents: 400 }));
    assert.equal(dest.payment_intent_data.on_behalf_of, 'acct_1');
    assert.deepEqual(dest.payment_intent_data.transfer_data, { destination: 'acct_1' });
    assert.equal(dest.payment_intent_data.application_fee_amount, 400, 'HardPan keeps the service fee');
    assert.deepEqual(dest.line_items.map((l) => [l.price_data.product_data.name, l.price_data.unit_amount]), [['Hope Scramble entry fee', 5000], ['HardPan service fee', 400]]);
    assert.equal(dest.metadata.acct, 'acct_1'); assert.equal(dest.metadata.serviceFeeCents, '400'); assert.equal(dest.payment_intent_data.metadata.acct, 'acct_1');
    const zero = C.sessionParams(Object.assign({}, base, { acct: 'acct_1', serviceFeeCents: 0 }));
    assert.equal(zero.line_items.length, 1, 'a $0 override adds no line'); assert.equal(zero.payment_intent_data.application_fee_amount, undefined);
});

test('19b. mapEvent on a destination payment: amount_total must equal entry + service fee; the entry records amountCents (the entry fee) and serviceFeeCents; a platform payment is unchanged', () => {
    const ctx = { ref: { code: 'ABC', entryId: 'e1' }, tournament: T(FEES), registration: REG(), now: 7 };
    const dest = (total, meta) => ({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', amount_total: total, currency: 'usd', payment_intent: 'pi_9', metadata: Object.assign({ code: 'ABC', entryId: 'e1' }, meta) } } });
    const ok = C.mapEvent(dest(5400, { acct: 'acct_1', serviceFeeCents: '400' }), ctx);
    assert.deepEqual(ok.update, { paid: true, paidAt: 7, paidVia: 'stripe', ref: 'pi_9', amountCents: 5000, serviceFeeCents: 400, acct: 'acct_1' });
    assert.deepEqual(ok.status, { paid: true, paidVia: 'stripe', at: 7 });
    assert.equal(C.mapEvent(dest(5000, { acct: 'acct_1', serviceFeeCents: '400' }), ctx).record.type, 'rejected-amount', 'the entry fee alone is not the total');
    assert.equal(C.mapEvent(dest(5400, { acct: 'acct_1', serviceFeeCents: 'abc' }), ctx).record.type, 'rejected-amount', 'a bad fee in metadata never passes');
    const plat = C.mapEvent(dest(5000, {}), ctx);
    assert.deepEqual(plat.update, { paid: true, paidAt: 7, paidVia: 'stripe', ref: 'pi_9', amountCents: 5000 });
});

test('20. refunds on a destination charge pull the transfer back and return our fee; a platform charge refunds as before; mapEvent keeps acct on the paid entry', () => {
    const regD = REG({ paid: true, paidVia: 'stripe', ref: 'pi_1', acct: 'acct_1' });
    const planD = C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: regD });
    assert.equal(planD.ok, true);
    assert.deepEqual(C.refundParams(planD, { code: 'ABC', entryId: 'e1' }), { payment_intent: 'pi_1', metadata: { code: 'ABC', entryId: 'e1' }, reverse_transfer: true, refund_application_fee: true });
    const planP = C.planRefund({ callerUid: 'u-org', tournament: T(FEES), registration: REG({ paid: true, paidVia: 'stripe', ref: 'pi_2' }) });
    assert.deepEqual(C.refundParams(planP, { code: 'ABC', entryId: 'e1' }), { payment_intent: 'pi_2', metadata: { code: 'ABC', entryId: 'e1' } });
    const evNo = { id: 'evt_2', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', amount_total: 5000, currency: 'usd', payment_intent: 'pi_9', metadata: { code: 'ABC', entryId: 'e1', acct: 'bogus' } } } };
    assert.equal(C.mapEvent(evNo, { ref: { code: 'ABC', entryId: 'e1' }, tournament: T(FEES), registration: REG(), now: 7 }).update.acct, undefined, 'a malformed account id is not stored (and no service fee is expected on a platform payment)');
});

test('21. account events: account.updated -> the status mirror for the uid in metadata; deauthorized -> everything off; unknown account -> rejected, no uid', () => {
    const acct = { id: 'acct_1', object: 'account', charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ['external_account'] }, business_profile: { name: 'Hope Foundation' }, metadata: { uid: 'u-org' } };
    const st = C.connectStatusOf(acct, 9);
    assert.deepEqual(st, { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, due: ['external_account'], name: 'Hope Foundation', updatedAt: 9 });
    assert.equal(C.connectState(st), 'finish');
    assert.equal(C.connectState({ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, due: [] }), 'on');
    assert.equal(C.connectState(null), 'none');
    const up = C.mapAccountEvent({ id: 'evt_a', type: 'account.updated', data: { object: acct } }, 9);
    assert.equal(up.uid, 'u-org'); assert.deepEqual(up.status, st); assert.equal(up.record.type, 'account.updated');
    const de = C.mapAccountEvent({ id: 'evt_b', type: 'account.application.deauthorized', account: 'acct_1', data: { object: { id: 'ca_1', object: 'application' } } }, 9, { uid: 'u-org' });
    assert.equal(de.uid, 'u-org'); assert.equal(de.status.chargesEnabled, false); assert.equal(de.status.payoutsEnabled, false); assert.equal(de.status.deauthorizedAt, 9);
    const unk = C.mapAccountEvent({ id: 'evt_c', type: 'account.updated', data: { object: Object.assign({}, acct, { metadata: {} }) } }, 9);
    assert.equal(unk.uid, null); assert.equal(unk.record.type, 'rejected-account');
    assert.equal(C.mapAccountEvent({ id: 'evt_d', type: 'payout.paid', data: { object: {} } }, 9).record.type, 'ignored');
    assert.deepEqual(C.CONNECT_EVENT_TYPES, ['account.updated', 'account.application.deauthorized']);
});
