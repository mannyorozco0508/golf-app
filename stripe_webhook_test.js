// ============================================================================
// STRIPE PHASE 1 - THE HANDLERS AND THE DEPLOYED WRAPPERS, ON THE DB EMULATOR
//
// WHAT RUNS: the Functions emulator is NOT used. Two layers are driven instead:
//   (a) handlers.js's makeHandlers() with an injected firebase-admin Database
//       pointed at the RTDB emulator (local port 9474, nothing live) and a
//       Stripe client from the real `stripe` package whose network calls are
//       replaced by recording mocks (sessions.create, refunds.create,
//       refunds.list, paymentIntents.retrieve). Its webhooks helper is the real
//       one: every signature here is made with stripe.webhooks
//       .generateTestHeaderString and a FAKE secret, and verified by the real
//       constructEvent.
//   (b) index.js itself - the exported onCall .run() and the onRequest
//       handler - with the secrets as fake env values and firebase-admin's
//       default app on the emulator. Only paths that never reach Stripe's API
//       are driven through (b): refusals before any Stripe call, and
//       checkout.session.* webhooks (which need no API call). No request ever
//       leaves this machine; the mocked client's host is 127.0.0.1:1.
// The emulator namespace carries the CANDIDATE rules, though the Admin SDK
// bypasses them (as it will in production).
//
// Skipped when stripe-functions/node_modules is not installed
// (`npm --prefix stripe-functions ci`) or the emulator jar / Java is missing.
//
// BASELINE (new file, final run, branch stripe-1-server on 115296b8): 14 tests.
// Against 115296b8 (no stripe-functions/ at all): 0 pass / 0 fail / 14
// SKIPPED (the modules are absent, so the skip guard fires) - a skip proves
// nothing per assertion; the per-assertion proof is the negative controls
// (17 code controls run against this file and stripe_core_test.js: 16 caught,
// 1 inert by design - removing the stripeEvents pre-read leaves the
// transaction claim, which alone keeps a duplicate applied once).
// Against the finished code: 14 pass / 0 fail / 0 skipped.
//
// ACCOUNTS V2 (2026-11-13): K1 re-pinned to POST /v2/core/accounts + /v2/core/
// account_links with the v1 payout-schedule update (and its refusal recorded,
// not thrown); K6 gains the metadata-less account.updated for an account we
// hold. Baseline against main f7c1b8f3 (v1 creation): K1 + K6 red, 18 pass /
// 2 fail of 20. With the build (final run): 20 pass / 0 fail / 0 skipped.
// Controls (handlers.js / stripe-core.js mutated, restored by sha): the handler
// back on v1 accounts.create -> K1 red; a refused schedule update thrown ->
// K1 red; owner fallback dropped -> K6 red (+ 21 in stripe_core_test.js).
// CONTACT EMAIL (2026-11-13): K1 gains the no-email refusal (before any Stripe
// call) and contact_email on the create; X1 drives the wrapper's no-email
// refusal and pins its one email line in source. Baseline against main
// 501855b4: K1 + X1 red, 18 pass / 2 fail of 20. With the build (final run):
// 20 pass / 0 fail / 0 skipped. Controls: handler no longer refuses a missing
// email -> K1 + X1 red; the wrapper forgets the token email -> X1 red.
// V1 LINK (2026-11-13, second live run): K1 re-pinned - the link is POST /v1/account_links
// on the v2 account id, the v2 link call never made. Baseline against main 6b4bee9f:
// K1 red, 19 pass / 1 fail of 20. With the build (final run): 20 pass / 0 fail / 0 skipped.
// Control: the handler back on stripe.v2.core.accountLinks.create -> K1 red.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const FN = path.join(__dirname, 'stripe-functions');
const HAS_MODULES = ['stripe', 'firebase-admin', 'firebase-functions'].every((m) => fs.existsSync(path.join(FN, 'node_modules', m)));
function findJar() {
    const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
    const f = fs.existsSync(dir) && fs.readdirSync(dir).filter((x) => /^firebase-database-emulator-v[\d.]+\.jar$/.test(x)).sort().pop();
    return f ? path.join(dir, f) : null;
}
function findJava() {
    try { execSync('java -version', { stdio: 'ignore' }); return 'java'; } catch (e) { /* not on PATH */ }
    const jdks = path.join(os.homedir(), 'jdks');
    const d = fs.existsSync(jdks) && fs.readdirSync(jdks).sort().pop();
    const j = d && path.join(jdks, d, 'Contents', 'Home', 'bin', 'java');
    return j && fs.existsSync(j) ? j : null;
}
const JAR = findJar(), JAVA = findJava();
const SKIP = !HAS_MODULES ? { skip: 'stripe-functions/node_modules not installed' } : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java)' } : {};

const PORT = 9474, HOST = '127.0.0.1:' + PORT, BASE = 'http://' + HOST;
const NS = 'stripehandlers', NSW = 'stripewrap';
const SECRET = 'whsec_test_FAKE_not_a_real_secret';
const CSECRET = 'whsec_test_FAKE_connect_endpoint';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adminRest = async (ns, method, p, body) => (await fetch(`${BASE}/${p}.json?ns=${ns}`, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) })).json();

const REG = (extra) => Object.assign({ createdAt: 1, fullName: 'Ann Golfer', email: 'ann@example.test', phone: '5555550100' }, extra || {});
const SEED = () => ({
    tournaments: {
        STR1: { name: 'Stripe Open', ownerUid: 'u-org', createdAt: 1, fees: { entryFeeCents: 5000, collectByCard: true, allowCash: true } },
        NOCARD: { name: 'Cash only', ownerUid: 'u-org', createdAt: 1, fees: { entryFeeCents: 5000, collectByCard: false, allowCash: true } },
        BADFEE: { name: 'Bad fee', ownerUid: 'u-org', createdAt: 1, fees: { entryFeeCents: 99, collectByCard: true } },
        OTHER: { name: 'Not allow-listed', ownerUid: 'u-who', createdAt: 1, fees: { entryFeeCents: 5000, collectByCard: true } }
    },
    registrations: {
        STR1: { e1: REG(), eCash: REG({ paid: true, paidAt: 5, paidVia: 'cash' }), eStripe: REG({ paid: true, paidAt: 5, paidVia: 'stripe', ref: 'pi_PAID', amountCents: 5000 }), ePend: REG({ checkoutAt: 9 }) },
        NOCARD: { e1: REG() }, BADFEE: { e1: REG() }, OTHER: { e1: REG() }
    },
    payments: { allowedOwners: { 'u-org': true } }
});

let emu, admin, db, Stripe, makeHandlers, HandlerError, signer;
const reseed = async (ns) => adminRest(ns || NS, 'PUT', '', SEED());
const read = async (p, ns) => adminRest(ns || NS, 'GET', p);

// A Stripe client from the real package: real webhooks helper, mocked network methods.
function mockStripe() {
    const s = new Stripe('sk_test_FAKE', { host: '127.0.0.1', port: 1, protocol: 'http', maxNetworkRetries: 0 });
    const calls = { sessions: [], refunds: [], refundList: [], pi: [] };
    s.checkout = { sessions: { create: async (params, opts) => { calls.sessions.push({ params, opts }); return { id: 'cs_test_' + calls.sessions.length, url: 'https://checkout.stripe.com/c/pay/cs_test_' + calls.sessions.length }; } } };
    s.refunds = {
        create: async (params, opts) => { calls.refunds.push({ params, opts }); return { id: 're_MOCK1', status: 'pending' }; },
        list: async (params) => { calls.refundList.push(params); return { data: [{ id: 're_LISTED' }] }; }
    };
    s.paymentIntents = { retrieve: async (id) => { calls.pi.push(id); return { id, metadata: { code: 'STR1', entryId: 'eStripe' } }; } };
    // CONNECT (2026-11-12): accounts + account links, recorded; retrieve answers from `acctState`.
    calls.accounts = []; calls.links = []; calls.logins = []; calls.retrieves = [];
    calls.acctState = { id: 'acct_MOCK1', charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements: { currently_due: ['external_account', 'tos_acceptance.date'] }, business_profile: { name: 'Hope Foundation' }, metadata: { uid: 'u-org' } };
    // ACCOUNTS V2 (2026-11-13): creation and the onboarding link are v2
    // (s.v2.core.*); the v1 create / account_links stay mocked ONLY to prove
    // they are never called. retrieve / update / login links stay v1.
    calls.v1accounts = []; calls.v1links = []; calls.updates = [];
    calls.updateThrows = null;   // set to an Error to make the v1 payout-schedule update fail
    s.accounts = {
        create: async (params, opts) => { calls.v1accounts.push({ params, opts }); return { id: 'acct_V1_NEVER' }; },
        update: async (id, params) => { calls.updates.push({ id, params }); if (calls.updateThrows) throw calls.updateThrows; return Object.assign({ id }, calls.acctState); },
        retrieve: async (id) => { calls.retrieves.push(id); return Object.assign({ id }, calls.acctState); },
        createLoginLink: async (id) => { calls.logins.push(id); return { url: 'https://connect.stripe.com/express/' + id }; }
    };
    s.accountLinks = { create: async (params) => { calls.v1links.push(params); return { object: 'account_link', url: 'https://connect.stripe.com/setup/e/' + params.account + '/v1' }; } };
    s.v2 = { core: {
        accounts: { create: async (params, opts) => { calls.accounts.push({ params, opts }); return { id: 'acct_MOCK1', object: 'v2.core.account' }; } },
        accountLinks: { create: async (params) => { calls.links.push(params); return { object: 'v2.core.account_link', url: 'https://connect.stripe.com/setup/e/' + params.account + '/x' }; } }
    } };
    return { s, calls };
}
// Count every update() the handlers make on a registrations/ path.
function countingDb(real) {
    const updates = [];
    // A root multi-path update counts once, as the registration fields it carries.
    return { updates, ref: (p) => {
        const r = p === undefined ? real.ref() : real.ref(p);
        const u = r.update.bind(r);
        if (p === undefined) r.update = (v) => {
            const keys = Object.keys(v).filter((k) => k.startsWith('registrations/'));
            if (keys.length) { const pre = keys[0].split('/').slice(0, 3).join('/'); const f = {}; keys.forEach((k) => { f[k.slice(pre.length + 1)] = v[k]; }); updates.push([pre, f]); }
            return u(v);
        };
        else if (p.startsWith('registrations/')) r.update = (v) => { updates.push([p, v]); return u(v); };
        return r;
    } };
}
let clock = 1000;
function H(opts) {
    const m = mockStripe();
    const cdb = countingDb(db);
    const h = makeHandlers(Object.assign({ db: cdb, stripe: m.s, webhookSecret: SECRET, connectWebhookSecret: CSECRET, now: () => ++clock }, opts || {}));
    return { h, calls: m.calls, updates: cdb.updates };
}
const sign = (payload, secret) => signer.webhooks.generateTestHeaderString({ payload, secret: secret || SECRET });
const evt = (id, type, object) => JSON.stringify({ id, object: 'event', type, api_version: '2026-09-30', created: 1, data: { object } });
const session = (o) => Object.assign({ id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid', amount_total: 5000, currency: 'usd', payment_intent: 'pi_NEW', metadata: { code: 'STR1', entryId: 'e1' } }, o);
const ORIGIN = { origin: 'https://tournaments.rattlegolf.com' };
async function refused(p, reason) {
    await assert.rejects(p, (e) => { assert.ok(e instanceof HandlerError, String(e)); assert.equal(e.reason, reason); return true; });
}

before(async () => {
    if (SKIP.skip) return;
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = HOST;
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-stripe', databaseURL: `${BASE}?ns=${NSW}` });
    process.env.GCLOUD_PROJECT = 'demo-stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_FAKE';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    const cand = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox', 'TOURNAMENTS-STRIPE-RULES-CANDIDATE.json');
    if (fs.existsSync(cand)) for (const ns of [NS, NSW]) await fetch(`${BASE}/.settings/rules.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(cand, 'utf8').split('[^@\\\\s]').join('[^@ ]') });
    admin = require(path.join(FN, 'node_modules', 'firebase-admin'));
    Stripe = require(path.join(FN, 'node_modules', 'stripe'));
    ({ makeHandlers, HandlerError } = require(path.join(FN, 'handlers.js')));
    const app = admin.initializeApp({ projectId: 'demo-stripe', databaseURL: `${BASE}?ns=${NS}` }, 'handlers-test');
    db = app.database();
    signer = new Stripe('sk_test_FAKE', { host: '127.0.0.1', port: 1, protocol: 'http' });
});
after(async () => {
    try { if (admin) await Promise.all(admin.apps.map((a) => a.delete())); } catch (e) { /* closing */ }
    if (emu) emu.kill();
});

// ---------------------------------------------------------------- webhook
test('W1. a signed checkout.session.completed at the right amount writes exactly the contract update plus stripeEvents', SKIP, async () => {
    await reseed();
    const { h, updates } = H();
    const body = evt('evt_W1', 'checkout.session.completed', session());
    const out = await h.stripeWebhook(Buffer.from(body), sign(body));
    assert.equal(out.status, 200);
    const reg = await read('registrations/STR1/e1');
    assert.equal(reg.paid, true); assert.equal(reg.paidVia, 'stripe'); assert.equal(reg.ref, 'pi_NEW'); assert.equal(reg.amountCents, 5000); assert.equal(typeof reg.paidAt, 'number');
    assert.equal(updates.length, 1);
    assert.deepEqual(Object.keys(updates[0][1]).sort(), ['amountCents', 'paid', 'paidAt', 'paidVia', 'ref']);
    assert.deepEqual(Object.keys(await read('stripeEvents/evt_W1')).sort(), ['at', 'type']);
    // Addendum 2026-11-08: the public status mirror, same update
    const st = await read('registrationStatus/STR1/e1');
    assert.deepEqual({ paid: st.paid, paidVia: st.paidVia }, { paid: true, paidVia: 'stripe' });
    assert.equal(st.at, reg.paidAt);
});

test('W2. a forged webhook writes nothing: wrong secret, tampered body, missing header, expired timestamp', SKIP, async () => {
    await reseed();
    const { h, updates } = H();
    const body = evt('evt_W2', 'checkout.session.completed', session());
    const tampered = evt('evt_W2', 'checkout.session.completed', session({ amount_total: 5000, metadata: { code: 'STR1', entryId: 'eCash' } }));
    const old = signer.webhooks.generateTestHeaderString({ payload: body, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    for (const [why, raw, sig] of [['wrong secret', body, sign(body, 'whsec_attacker')], ['tampered body', tampered, sign(body)], ['no header', body, undefined], ['garbage header', body, 't=1,v1=00'], ['replayed old', body, old]]) {
        const out = await h.stripeWebhook(Buffer.from(raw), sig);
        assert.equal(out.status, 400, why);
    }
    assert.equal(updates.length, 0);
    assert.equal(await read('stripeEvents/evt_W2'), null);
    assert.equal(await read('registrationStatus'), null);
    assert.deepEqual(await read('registrations/STR1/e1'), REG());
    // positive: the same body with the right signature IS accepted (so 400 above is the signature)
    assert.equal((await h.stripeWebhook(Buffer.from(body), sign(body))).status, 200);
    assert.equal((await read('registrations/STR1/e1')).paid, true);
});

test('W3. wrong amount: the registration is untouched, stripeEvents says rejected-amount', SKIP, async () => {
    for (const [i, o] of [[1, { amount_total: 4999 }], [2, { amount_total: 100 }], [3, { amount_total: 500000 }]].entries()) {
        await reseed();
        const { h, updates } = H();
        const body = evt('evt_W3_' + i, 'checkout.session.completed', session(o[1]));
        assert.equal((await h.stripeWebhook(Buffer.from(body), sign(body))).status, 200);
        assert.deepEqual(await read('registrations/STR1/e1'), REG(), JSON.stringify(o[1]));
        assert.equal(updates.length, 0);
        assert.equal((await read('stripeEvents/evt_W3_' + i)).type, 'rejected-amount');
        assert.equal(await read('registrationStatus'), null);
    }
});

test('W4. currency not usd is refused the same way', SKIP, async () => {
    await reseed();
    const { h, updates } = H();
    const body = evt('evt_W4', 'checkout.session.completed', session({ currency: 'eur' }));
    await h.stripeWebhook(Buffer.from(body), sign(body));
    assert.deepEqual(await read('registrations/STR1/e1'), REG());
    assert.equal(updates.length, 0);
    assert.equal((await read('stripeEvents/evt_W4')).type, 'rejected-amount');
    assert.equal(await read('registrationStatus'), null);
});

test('W5. a duplicate event is applied once: sequential and concurrent deliveries', SKIP, async () => {
    await reseed();
    const { h, updates } = H();
    const body = evt('evt_W5', 'checkout.session.completed', session());
    assert.equal((await h.stripeWebhook(Buffer.from(body), sign(body))).body, 'checkout.session.completed');
    const first = (await read('registrations/STR1/e1')).paidAt;
    assert.equal((await h.stripeWebhook(Buffer.from(body), sign(body))).body, 'duplicate');
    assert.equal((await read('registrations/STR1/e1')).paidAt, first);
    assert.equal(updates.length, 1);
    // concurrent: three deliveries of a refund at once
    await adminRest(NS, 'PATCH', 'registrations/STR1/e1', { ref: 'pi_NEW' });
    const rb = evt('evt_W5r', 'charge.refunded', { object: 'charge', id: 'ch_1', payment_intent: 'pi_NEW', amount_refunded: 5000, refunded: true, metadata: { code: 'STR1', entryId: 'e1' } });
    const outs = await Promise.all([1, 2, 3].map(() => h.stripeWebhook(Buffer.from(rb), sign(rb))));
    assert.equal(outs.filter((o) => o.body === 'charge.refunded').length, 1, JSON.stringify(outs));
    assert.equal(updates.length, 2);
});

test('W6. charge.refunded writes the refund fields and paid:false (PI metadata + refund id fetched from the mocked client)', SKIP, async () => {
    await reseed();
    const { h, calls } = H();
    const body = evt('evt_W6', 'charge.refunded', { object: 'charge', id: 'ch_9', payment_intent: 'pi_PAID', amount_refunded: 5000, refunded: true, metadata: {} });
    assert.equal((await h.stripeWebhook(Buffer.from(body), sign(body))).status, 200);
    const reg = await read('registrations/STR1/eStripe');
    assert.equal(reg.paid, false); assert.equal(reg.refundCents, 5000); assert.equal(reg.refundRef, 're_LISTED'); assert.equal(typeof reg.refundedAt, 'number');
    assert.equal(reg.ref, 'pi_PAID'); assert.equal(reg.paidVia, 'stripe');
    assert.deepEqual(calls.pi, ['pi_PAID']);
    const st = await read('registrationStatus/STR1/eStripe');
    assert.equal(st.paid, false); assert.equal(st.paidVia, 'stripe'); assert.equal(st.at, reg.refundedAt);
    assert.deepEqual(calls.refundList, [{ charge: 'ch_9', limit: 1 }]);
});

test('W7. dispute sets disputedAt; expired session clears checkoutAt; unpaid completion writes nothing; a second payment never overwrites the first', SKIP, async () => {
    await reseed();
    const { h, updates } = H();
    const d = evt('evt_W7d', 'charge.dispute.created', { object: 'dispute', id: 'dp_1', charge: 'ch_9', payment_intent: 'pi_PAID', metadata: {} });
    await h.stripeWebhook(Buffer.from(d), sign(d));
    assert.equal(typeof (await read('registrations/STR1/eStripe')).disputedAt, 'number');
    const x = evt('evt_W7x', 'checkout.session.expired', session({ payment_status: 'unpaid', metadata: { code: 'STR1', entryId: 'ePend' } }));
    await h.stripeWebhook(Buffer.from(x), sign(x));
    assert.equal((await read('registrations/STR1/ePend')).checkoutAt, undefined);
    const u = evt('evt_W7u', 'checkout.session.completed', session({ payment_status: 'unpaid' }));
    await h.stripeWebhook(Buffer.from(u), sign(u));
    assert.deepEqual(await read('registrations/STR1/e1'), REG());
    const dbl = evt('evt_W7b', 'checkout.session.completed', session({ payment_intent: 'pi_SECOND', metadata: { code: 'STR1', entryId: 'eStripe' } }));
    await h.stripeWebhook(Buffer.from(dbl), sign(dbl));
    assert.equal((await read('registrations/STR1/eStripe')).ref, 'pi_PAID');
    assert.equal((await read('stripeEvents/evt_W7b')).type, 'rejected-already-paid');
    assert.equal(updates.length, 2);   // dispute + expired only
    assert.equal(await read('registrationStatus'), null, 'dispute / expiry / unpaid / double never touch the status mirror');
});

// ---------------------------------------------------------------- checkout
test('C1. createEntryCheckout: the fee comes from the record, never from the client; idempotency key; checkoutAt; url', SKIP, async () => {
    await reseed();
    const { h, calls } = H();
    const out = await h.createEntryCheckout({ code: 'STR1', entryId: 'e1', amountCents: 1, amount: 1, unit_amount: 1, entryFeeCents: 1, price: 1, currency: 'eur' }, ORIGIN);
    assert.match(out.url, /^https:\/\/checkout\.stripe\.com\//);
    assert.equal(calls.sessions.length, 1);
    const { params, opts } = calls.sessions[0];
    assert.equal(params.line_items[0].price_data.unit_amount, 5000);
    assert.equal(params.line_items[0].price_data.currency, 'usd');
    assert.doesNotMatch(JSON.stringify(params), /"(amountCents|amount|price|entryFeeCents)"/);
    assert.equal(opts.idempotencyKey, 'checkout:STR1:e1:1');
    assert.equal(params.success_url, 'https://tournaments.rattlegolf.com/tournament?register=STR1&entry=e1&checkout=done');
    assert.equal(typeof (await read('registrations/STR1/e1')).checkoutAt, 'number');
    assert.equal(await read('payments/checkoutAttempts/STR1/e1'), 1);
});

test('C2. createEntryCheckout refusals, each before any Stripe call and with no write', SKIP, async () => {
    await reseed();
    const { h, calls, updates } = H();
    await refused(h.createEntryCheckout({ code: 'STR1', entryId: 'eCash' }, ORIGIN), 'already-paid');
    await refused(h.createEntryCheckout({ code: 'STR1', entryId: 'eStripe' }, ORIGIN), 'already-paid');
    await refused(h.createEntryCheckout({ code: 'OTHER', entryId: 'e1' }, ORIGIN), 'not-allowed-owner');
    await refused(h.createEntryCheckout({ code: 'NOCARD', entryId: 'e1' }, ORIGIN), 'not-collecting');
    await refused(h.createEntryCheckout({ code: 'BADFEE', entryId: 'e1' }, ORIGIN), 'bad-fee');
    await refused(h.createEntryCheckout({ code: 'STR1', entryId: 'nope' }, ORIGIN), 'not-found');
    await refused(h.createEntryCheckout({ code: 'NOPE', entryId: 'e1' }, ORIGIN), 'not-found');
    await refused(h.createEntryCheckout({ code: 'STR1/x', entryId: 'e1' }, ORIGIN), 'not-found');
    for (const origin of ['https://evil.com', 'https://golf-app-5a5.pages.dev.evil.com', 'http://localhost:5000', undefined]) await refused(h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, { origin }), 'bad-origin');
    assert.equal(calls.sessions.length, 0);
    assert.equal(updates.length, 0);
    assert.equal(await read('payments/checkoutAttempts'), null);
    // localhost passes only in the emulator
    const em = H({ emulator: true });
    await em.h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, { origin: 'http://localhost:5000' });
    assert.match(em.calls.sessions[0].params.success_url, /^http:\/\/localhost:5000\/tournament\?/);
});

test('C3. at most 5 sessions per entry, counted on the server (sequential and a burst)', SKIP, async () => {
    await reseed();
    const { h, calls } = H();
    for (let i = 1; i <= 5; i++) await h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN);
    await refused(h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN), 'too-many-attempts');
    assert.deepEqual(calls.sessions.map((c) => c.opts.idempotencyKey), [1, 2, 3, 4, 5].map((n) => 'checkout:STR1:e1:' + n));
    const b = H();
    const res = await Promise.allSettled([1, 2, 3, 4, 5, 6, 7, 8].map(() => b.h.createEntryCheckout({ code: 'STR1', entryId: 'ePend' }, ORIGIN)));
    assert.equal(b.calls.sessions.length, 5, 'a burst of 8 created ' + b.calls.sessions.length);
    assert.equal(res.filter((r) => r.status === 'rejected' && r.reason.reason === 'too-many-attempts').length, 3);
});

// ---------------------------------------------------------------- refund
test('R1. refundEntry by the owner: full refund of the stored PI, idempotency key, refundPendingAt, {status:pending}', SKIP, async () => {
    await reseed();
    const { h, calls } = H();
    assert.deepEqual(await h.refundEntry({ code: 'STR1', entryId: 'eStripe', amountCents: 1 }, { uid: 'u-org' }), { status: 'pending' });
    assert.equal(calls.refunds.length, 1);
    assert.deepEqual(calls.refunds[0].params, { payment_intent: 'pi_PAID', metadata: { code: 'STR1', entryId: 'eStripe' } });
    assert.equal(calls.refunds[0].opts.idempotencyKey, 'refund:STR1:eStripe:pi_PAID');
    const reg = await read('registrations/STR1/eStripe');
    assert.equal(typeof reg.refundPendingAt, 'number');
    assert.equal(reg.paid, true, 'paid stays until the webhook says refunded');
});

test('R2. refundEntry refusals: non-owner, signed-out, cash-paid, already refunded - no Stripe call, no write', SKIP, async () => {
    await reseed();
    await adminRest(NS, 'PUT', 'registrations/STR1/eDone', REG({ paid: false, paidVia: 'stripe', ref: 'pi_DONE', refundedAt: 3 }));
    const { h, calls, updates } = H();
    await refused(h.refundEntry({ code: 'STR1', entryId: 'eStripe' }, { uid: 'u-who' }), 'not-owner');
    await refused(h.refundEntry({ code: 'STR1', entryId: 'eStripe' }, { uid: undefined }), 'unauthenticated');
    await refused(h.refundEntry({ code: 'STR1', entryId: 'eCash' }, { uid: 'u-org' }), 'not-stripe-paid');
    await refused(h.refundEntry({ code: 'STR1', entryId: 'eDone' }, { uid: 'u-org' }), 'already-refunded');
    await refused(h.refundEntry({ code: 'STR1', entryId: 'zz' }, { uid: 'u-org' }), 'not-found');
    assert.equal(calls.refunds.length, 0);
    assert.equal(updates.length, 0);
    assert.equal((await read('registrations/STR1/eStripe')).refundPendingAt, undefined);
});

// ---------------------------------------------------------------- the deployed wrappers (index.js)
test('X1. index.js: exports exactly the three contract functions, us-central1, both secrets bound, HttpsError carries details.reason', SKIP, async () => {
    const m = require(path.join(FN, 'index.js'));
    // RE-PINNED 2026-11-09 (event tools merge): the codebase also exports
    // sendAnnouncement (E1; tournament_e1_announce_server_test.js X1 holds it)
    // and the four photo-wall callables (E4). None of them binds a Stripe
    // secret; the three Stripe functions below are pinned exactly as before.
    const PHOTO = ['approvePhoto', 'hidePhoto', 'photoLinks', 'reportPhoto'];
    // RE-PINNED 2026-11-12 (Connect, Manny): three onboarding callables and the
    // connected-account endpoint join; the endpoint binds the Connect secret.
    assert.deepEqual(Object.keys(m).sort(), ['approvePhoto', 'createConnectDashboardLink', 'createConnectOnboardingLink', 'createEntryCheckout', 'getConnectStatus', 'hidePhoto', 'photoLinks', 'refundEntry', 'reportPhoto', 'sendAnnouncement', 'stripeConnectWebhook', 'stripeWebhook']);
    for (const k of ['createConnectOnboardingLink', 'getConnectStatus', 'createConnectDashboardLink']) {
        assert.deepEqual(m[k].__endpoint.region, ['us-central1'], k);
        assert.ok(m[k].__endpoint.callableTrigger, k + ' is a callable');
        assert.deepEqual(m[k].__endpoint.secretEnvironmentVariables.map((x) => x.key).sort(), ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], k);
    }
    assert.ok(m.stripeConnectWebhook.__endpoint.httpsTrigger);
    assert.deepEqual(m.stripeConnectWebhook.__endpoint.secretEnvironmentVariables.map((x) => x.key).sort(), ['STRIPE_CONNECT_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY']);
    for (const k of PHOTO) {
        assert.deepEqual(m[k].__endpoint.region, ['us-central1'], k);
        assert.ok(m[k].__endpoint.callableTrigger, k + ' is a callable');
        assert.ok(!(m[k].__endpoint.secretEnvironmentVariables || []).length, k + ' binds no Stripe secret');
    }
    for (const k of ['createEntryCheckout', 'refundEntry', 'stripeWebhook']) {
        assert.deepEqual(m[k].__endpoint.region, ['us-central1'], k);
        assert.deepEqual(m[k].__endpoint.secretEnvironmentVariables.map((s) => s.key).sort(), ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], k);
    }
    assert.ok(m.createEntryCheckout.__endpoint.callableTrigger && m.refundEntry.__endpoint.callableTrigger);
    assert.ok(m.stripeWebhook.__endpoint.httpsTrigger);
    await reseed(NSW);
    const reason = async (p) => { try { await p; return 'resolved'; } catch (e) { return e.code + '/' + (e.details && e.details.reason); } };
    assert.equal(await reason(m.createEntryCheckout.run({ data: { code: 'STR1', entryId: 'e1' }, rawRequest: { headers: { origin: 'https://evil.com' } } })), 'permission-denied/bad-origin');
    assert.equal(await reason(m.createEntryCheckout.run({ data: { code: 'OTHER', entryId: 'e1' }, rawRequest: { headers: ORIGIN } })), 'permission-denied/not-allowed-owner');
    assert.equal(await reason(m.createEntryCheckout.run({ data: { code: 'STR1', entryId: 'eCash' }, rawRequest: { headers: ORIGIN } })), 'failed-precondition/already-paid');
    assert.equal(await reason(m.refundEntry.run({ data: { code: 'STR1', entryId: 'eStripe' }, auth: { uid: 'u-who' }, rawRequest: { headers: {} } })), 'permission-denied/not-owner');
    assert.equal(await reason(m.refundEntry.run({ data: { code: 'STR1', entryId: 'eStripe' }, rawRequest: { headers: {} } })), 'unauthenticated/unauthenticated');
    // Accounts v2 (2026-11-13): the wrapper hands the handler the token's email;
    // a signed-in owner whose token has none is refused before any Stripe call.
    assert.equal(await reason(m.createConnectOnboardingLink.run({ data: { code: 'STR1' }, auth: { uid: 'u-org', token: {} }, rawRequest: { headers: ORIGIN } })), 'failed-precondition/no-email');
    assert.equal(await reason(m.createConnectOnboardingLink.run({ data: { code: 'STR1' }, auth: { uid: 'u-org' }, rawRequest: { headers: ORIGIN } })), 'failed-precondition/no-email');
    // The positive half cannot run here (a token WITH an email would reach
    // Stripe's API, which layer (b) never does), so the wrapper's one line is
    // pinned in source: the token's email is what it hands the handler.
    const wrapperSrc = fs.readFileSync(path.join(FN, 'index.js'), 'utf8');
    const connectWrapper = wrapperSrc.slice(wrapperSrc.indexOf('exports.createConnectOnboardingLink'), wrapperSrc.indexOf('exports.getConnectStatus'));
    assert.match(connectWrapper, /const token = \(request\.auth && request\.auth\.token\) \|\| \{\};/);
    assert.match(connectWrapper, /email: token\.email/);
});

test('X2. index.js stripeWebhook (onRequest): forged = 400 and nothing written; signed = 200 and paid; GET = 405', SKIP, async () => {
    const m = require(path.join(FN, 'index.js'));
    await reseed(NSW);
    const call = (method, raw, sig) => new Promise((resolve) => {
        const headers = { 'stripe-signature': sig, 'content-type': 'application/json' };
        const req = { method, rawBody: raw === undefined ? undefined : Buffer.from(raw), headers, body: raw ? JSON.parse(raw) : {}, get: (h) => headers[String(h).toLowerCase()], header: (h) => headers[String(h).toLowerCase()], url: '/', query: {} };
        const res = { statusCode: 200, headersSent: false, status(c) { this.statusCode = c; return this; }, send(b) { resolve({ status: this.statusCode, body: b }); return this; }, set() { return this; }, setHeader() {}, getHeader() {}, end(b) { resolve({ status: this.statusCode, body: b }); } };
        m.stripeWebhook(req, res);
    });
    const body = evt('evt_X2', 'checkout.session.completed', session());
    assert.equal((await call('POST', body, sign(body, 'whsec_attacker'))).status, 400);
    assert.deepEqual(await read('registrations/STR1/e1', NSW), REG());
    assert.equal(await read('stripeEvents/evt_X2', NSW), null);
    assert.equal((await call('GET')).status, 405);
    assert.equal((await call('POST', body, sign(body))).status, 200);
    const reg = await read('registrations/STR1/e1', NSW);
    assert.equal(reg.paid, true); assert.equal(reg.paidVia, 'stripe'); assert.equal(reg.amountCents, 5000);
    assert.equal((await read('registrationStatus/STR1/e1', NSW)).paid, true);
});


// ------------------------------------------------------------ CONNECT (2026-11-12)
// Manny's decisions: only payments/allowedOwners may connect; a $4 service fee
// per golfer on top of the entry fee as the application fee; 7-day payout delay;
// the statement shows the organizer; the account id never reaches a client.
// Baseline: against main 5041dd9b these 6 tests fail at the first call (no
// handler): 20 tests, 13 pass / 7 fail (K1-K6 + X1's export pin). With the build:
// 20 pass / 0 fail / 0 skipped.
const SEED_CONNECT = () => { const d = SEED(); d.stripeAccounts = { 'u-org': { acct: 'acct_MOCK1', createdAt: 1 } }; d.connectStatus = { 'u-org': { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, due: [], name: 'Hope Foundation', updatedAt: 1 } }; return d; };

test('K1. createConnectOnboardingLink (Accounts v2): the allow-listed owner gets ONE account from POST /v2/core/accounts (Express dashboard, uid in metadata, idempotent), the 7-day payout delay as the v1 update, and a v2 onboarding link back to this event; v1 create never called; refusals before any Stripe call', SKIP, async () => {
    await reseed();
    const { h, calls } = H();
    // No sign-in email -> refused before any Stripe call (Stripe needs contact_email
    // on a v2 account with the recipient configuration; live log 2026-11-13 18:07 UTC).
    await refused(h.createConnectOnboardingLink({ code: 'STR1' }, { uid: 'u-org', origin: 'https://tournaments.rattlegolf.com' }), 'no-email');
    await refused(h.createConnectOnboardingLink({ code: 'STR1' }, { uid: 'u-org', origin: 'https://tournaments.rattlegolf.com', email: 'nope' }), 'no-email');
    assert.equal(calls.accounts.length + calls.links.length, 0, 'no Stripe call without an email');
    assert.equal(await read('stripeAccounts/u-org'), null);
    const OWNER = { uid: 'u-org', origin: 'https://tournaments.rattlegolf.com', email: 'Org@Example.test' };
    const out = await h.createConnectOnboardingLink({ code: 'STR1' }, OWNER);
    assert.match(out.url, /^https:\/\/connect\.stripe\.com\/setup\//);
    assert.equal(calls.accounts.length, 1, 'one v2 create');
    assert.equal(calls.accounts[0].params.contact_email, 'org@example.test');
    assert.equal(calls.v1accounts.length, 0, 'POST /v1/accounts is never called (Stripe refuses it)');
    // 2026-11-13 second live run: the link is the v1 call on the v2 account id (legacy test mode
    // refused the v2 link); the v2 link call is never made.
    assert.equal(calls.links.length, 0, 'POST /v2/core/account_links is never called');
    assert.equal(calls.v1links.length, 1, 'POST /v1/account_links, once');
    const { params, opts } = calls.accounts[0];
    assert.equal(params.dashboard, 'express'); assert.equal(params.type, undefined);
    assert.deepEqual(params.defaults.responsibilities, { fees_collector: 'application', losses_collector: 'application' });
    assert.equal(params.configuration.merchant.capabilities.card_payments.requested, true);
    assert.equal(params.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested, true);
    assert.deepEqual(params.metadata, { uid: 'u-org' }); assert.equal(params.display_name, undefined, 'STR1 has no beneficiary / organizerName: no made-up display name');
    assert.equal(opts.idempotencyKey, 'connect-acct:u-org');
    assert.deepEqual(calls.updates, [{ id: 'acct_MOCK1', params: { settings: { payouts: { schedule: { interval: 'daily', delay_days: 7 } } } } }], 'the 7-day delay is the v1 update on the new account');
    assert.deepEqual(calls.v1links[0], { account: 'acct_MOCK1', type: 'account_onboarding', return_url: 'https://tournaments.rattlegolf.com/tournament?tourney=STR1&connect=return', refresh_url: 'https://tournaments.rattlegolf.com/tournament?tourney=STR1&connect=refresh' });
    const saved = await read('stripeAccounts/u-org');
    assert.equal(saved.acct, 'acct_MOCK1'); assert.equal(typeof saved.createdAt, 'number'); assert.equal(saved.api, 'v2'); assert.equal(saved.name, undefined); assert.equal(saved.payoutScheduleError, undefined);
    // A second call reuses the account: one more link, no second account, no second
    // schedule update - and no email needed once the account exists.
    await h.createConnectOnboardingLink({ code: 'STR1' }, { uid: 'u-org', origin: 'https://tournaments.rattlegolf.com' });
    assert.equal(calls.accounts.length, 1); assert.equal(calls.v1links.length, 2); assert.equal(calls.updates.length, 1);
    // Stripe refuses the schedule update: the organizer still gets the link, and
    // the refusal is kept on the server-only record (not hidden).
    await adminRest(NS, 'DELETE', 'stripeAccounts/u-org');
    calls.updateThrows = new Error('No such parameter: settings[payouts]');
    const again = await h.createConnectOnboardingLink({ code: 'STR1' }, OWNER);
    assert.match(again.url, /^https:\/\/connect\.stripe\.com\/setup\//);
    const kept = await read('stripeAccounts/u-org');
    assert.equal(kept.acct, 'acct_MOCK1'); assert.equal(kept.payoutScheduleError, 'No such parameter: settings[payouts]');
    calls.updateThrows = null;
    // Refusals: signed out, not the owner, not allow-listed (OTHER's owner u-who), bad origin, bad code.
    const n = calls.accounts.length + calls.links.length;
    await refused(h.createConnectOnboardingLink({ code: 'STR1' }, { uid: null, origin: 'https://tournaments.rattlegolf.com' }), 'unauthenticated');
    await refused(h.createConnectOnboardingLink({ code: 'STR1' }, { uid: 'u-else', origin: 'https://tournaments.rattlegolf.com' }), 'not-owner');
    await refused(h.createConnectOnboardingLink({ code: 'OTHER' }, { uid: 'u-who', origin: 'https://tournaments.rattlegolf.com' }), 'not-allowed-owner');
    await refused(h.createConnectOnboardingLink({ code: 'STR1' }, { uid: 'u-org', origin: 'https://evil.example' }), 'bad-origin');
    await refused(h.createConnectOnboardingLink({ code: 'bad code' }, { uid: 'u-org', origin: 'https://tournaments.rattlegolf.com' }), 'not-found');
    assert.equal(calls.accounts.length + calls.links.length, n, 'no Stripe call on a refusal');
    assert.equal(await read('stripeAccounts/u-who'), null);
});

test('K2. getConnectStatus: reads the account and writes the owner-readable mirror (never the account id); no account = {connected:false}; signed out refused', SKIP, async () => {
    await reseed(); await adminRest(NS, 'PUT', 'stripeAccounts', { 'u-org': { acct: 'acct_MOCK1', createdAt: 1 } });
    const { h, calls } = H();
    const st = await h.getConnectStatus({}, { uid: 'u-org' });
    assert.deepEqual(calls.retrieves, ['acct_MOCK1']);
    assert.equal(st.connected, true); assert.equal(st.chargesEnabled, false); assert.deepEqual(st.due, ['external_account', 'tos_acceptance.date']); assert.equal(st.name, 'Hope Foundation'); assert.equal(st.state, 'finish');
    const mirror = await read('connectStatus/u-org');
    assert.equal(mirror.chargesEnabled, false); assert.equal(mirror.name, 'Hope Foundation'); assert.equal(typeof mirror.updatedAt, 'number');
    assert.ok(!JSON.stringify(mirror).includes('acct_'), 'the account id never reaches the mirror');
    assert.ok(!JSON.stringify(st).includes('acct_'), 'nor the answer');
    calls.acctState = Object.assign({}, calls.acctState, { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } });
    assert.equal((await h.getConnectStatus({}, { uid: 'u-org' })).state, 'on');
    assert.equal((await read('connectStatus/u-org')).payoutsEnabled, true);
    assert.deepEqual(await h.getConnectStatus({}, { uid: 'u-who' }), { connected: false, state: 'none' });
    assert.equal(await read('connectStatus/u-who'), null, 'no mirror for no account');
    await refused(h.getConnectStatus({}, { uid: null }), 'unauthenticated');
    // With {code} for an event the caller owns: the resolved service fee and the
    // organizer's name land on the RECORD (public), so the golfer's register
    // screen can show "Entry $50 + $4 service fee" and "Paid to Hope Foundation".
    const withCode = await h.getConnectStatus({ code: 'STR1' }, { uid: 'u-org' });
    assert.equal(withCode.serviceFeeCents, 400);
    const fees = await read('tournaments/STR1/fees');
    assert.equal(fees.serviceFeeCents, 400); assert.equal(fees.paidToName, 'Hope Foundation');
    await adminRest(NS, 'PUT', 'platform/connect/eventOverrides/STR1/serviceFeeCents', 250);
    assert.equal((await h.getConnectStatus({ code: 'STR1' }, { uid: 'u-org' })).serviceFeeCents, 250);
    assert.equal((await read('tournaments/STR1/fees')).serviceFeeCents, 250);
    // Not the caller's event: status still answers, the record is untouched.
    await h.getConnectStatus({ code: 'OTHER' }, { uid: 'u-org' });
    assert.equal((await read('tournaments/OTHER/fees')).serviceFeeCents, undefined);
    // No account: nothing written to the record either.
    await h.getConnectStatus({ code: 'OTHER' }, { uid: 'u-who' });
    assert.equal((await read('tournaments/OTHER/fees')).serviceFeeCents, undefined);
});

test('K3. createConnectDashboardLink: an Express login link for the caller\'s own account only', SKIP, async () => {
    await reseed(); await adminRest(NS, 'PUT', 'stripeAccounts', { 'u-org': { acct: 'acct_MOCK1', createdAt: 1 } });
    const { h, calls } = H();
    assert.deepEqual(await h.createConnectDashboardLink({}, { uid: 'u-org' }), { url: 'https://connect.stripe.com/express/acct_MOCK1' });
    assert.deepEqual(calls.logins, ['acct_MOCK1']);
    await refused(h.createConnectDashboardLink({}, { uid: 'u-who' }), 'not-connected');
    await refused(h.createConnectDashboardLink({}, { uid: null }), 'unauthenticated');
    assert.equal(calls.logins.length, 1);
});

test('K4. createEntryCheckout on a connected owner: two line items (entry + $4 service fee), application fee, on_behalf_of/transfer_data, fees/paidTo = organizer; mid-setup = not-connected and no session', SKIP, async () => {
    await adminRest(NS, 'PUT', '', SEED_CONNECT());
    const { h, calls } = H();
    const out = await h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN);
    assert.match(out.url, /^https:\/\/checkout\.stripe\.com\//);
    const { params } = calls.sessions[0];
    assert.deepEqual(params.line_items.map((l) => [l.price_data.product_data.name, l.price_data.unit_amount]), [['Stripe Open entry fee', 5000], ['HardPan service fee', 400]]);
    assert.equal(params.payment_intent_data.application_fee_amount, 400);
    assert.equal(params.payment_intent_data.on_behalf_of, 'acct_MOCK1'); assert.deepEqual(params.payment_intent_data.transfer_data, { destination: 'acct_MOCK1' });
    assert.equal(params.metadata.acct, 'acct_MOCK1'); assert.equal(params.metadata.serviceFeeCents, '400');
    assert.equal((await read('tournaments/STR1/fees')).paidTo, 'organizer', 'the record says who is paid, without naming the account');
    assert.equal((await read('tournaments/STR1/fees')).serviceFeeCents, 400, 'and the fee the golfer was charged on top');
    assert.equal(typeof (await read('registrations/STR1/e1')).checkoutAt, 'number');
    // Platform setting + per-event override (Manny-only nodes) change the fee; the client cannot.
    await adminRest(NS, 'PUT', 'platform/connect', { serviceFeeCents: 300, eventOverrides: { STR1: { serviceFeeCents: 100 } } });
    const two = H(); await two.h.createEntryCheckout({ code: 'STR1', entryId: 'e1', serviceFeeCents: 0 }, ORIGIN);
    assert.equal(two.calls.sessions[0].params.payment_intent_data.application_fee_amount, 100);
    await adminRest(NS, 'DELETE', 'platform/connect/eventOverrides');
    const three = H(); await three.h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN);
    assert.equal(three.calls.sessions[0].params.payment_intent_data.application_fee_amount, 300);
    // Mid-setup: refused, nothing created, paidTo untouched.
    await adminRest(NS, 'PUT', 'connectStatus/u-org/chargesEnabled', false);
    const four = H();
    await refused(four.h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN), 'not-connected');
    assert.equal(four.calls.sessions.length, 0);
    // No account at all: the HardPan charge of Phase 1, one line, paidTo = hardpan.
    await reseed();
    const five = H(); await five.h.createEntryCheckout({ code: 'STR1', entryId: 'e1' }, ORIGIN);
    assert.equal(five.calls.sessions[0].params.line_items.length, 1); assert.equal(five.calls.sessions[0].params.payment_intent_data.on_behalf_of, undefined);
    assert.equal((await read('tournaments/STR1/fees')).paidTo, 'hardpan');
});

test('K5. refundEntry on a destination charge reverses the transfer and returns the service fee; the platform charge refunds as before', SKIP, async () => {
    await adminRest(NS, 'PUT', '', SEED_CONNECT());
    await adminRest(NS, 'PUT', 'registrations/STR1/eDest', REG({ paid: true, paidAt: 5, paidVia: 'stripe', ref: 'pi_DEST', amountCents: 5000, serviceFeeCents: 400, acct: 'acct_MOCK1' }));
    const { h, calls } = H();
    assert.deepEqual(await h.refundEntry({ code: 'STR1', entryId: 'eDest' }, { uid: 'u-org' }), { status: 'pending' });
    assert.deepEqual(calls.refunds[0].params, { payment_intent: 'pi_DEST', metadata: { code: 'STR1', entryId: 'eDest' }, reverse_transfer: true, refund_application_fee: true });
    await h.refundEntry({ code: 'STR1', entryId: 'eStripe' }, { uid: 'u-org' });
    assert.deepEqual(calls.refunds[1].params, { payment_intent: 'pi_PAID', metadata: { code: 'STR1', entryId: 'eStripe' } });
});

test('K6. stripeConnectWebhook: a signed account.updated writes the mirror for the uid in its metadata; deauthorized turns everything off; forged = 400 and nothing written; an account nobody owns is recorded rejected; idempotent', SKIP, async () => {
    await adminRest(NS, 'PUT', '', SEED_CONNECT());
    const { h } = H();
    const acct = { id: 'acct_MOCK1', object: 'account', charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ['external_account'] }, business_profile: { name: 'Hope Foundation' }, metadata: { uid: 'u-org' } };
    const body = evt('evt_acct_1', 'account.updated', acct);
    let r = await h.stripeConnectWebhook(body, sign(body, 'whsec_WRONG'));
    assert.equal(r.status, 400); assert.equal((await read('connectStatus/u-org')).payoutsEnabled, true, 'untouched by a forgery');
    r = await h.stripeConnectWebhook(body, sign(body, SECRET));
    assert.equal(r.status, 400, 'the PLATFORM endpoint secret does not sign the Connect endpoint');
    r = await h.stripeConnectWebhook(body, sign(body, CSECRET));
    assert.equal(r.status, 200); assert.equal(r.body, 'account.updated');
    const m = await read('connectStatus/u-org');
    assert.equal(m.chargesEnabled, true); assert.equal(m.payoutsEnabled, false); assert.deepEqual(m.due, ['external_account']);
    assert.equal((await read('stripeEvents/evt_acct_1')).type, 'account.updated');
    assert.equal((await h.stripeConnectWebhook(body, sign(body, CSECRET))).body, 'duplicate');
    // Deauthorized: the event names the account, not the uid; the handler looks the owner up.
    const de = JSON.stringify({ id: 'evt_de_1', object: 'event', type: 'account.application.deauthorized', account: 'acct_MOCK1', api_version: '2026-09-30', created: 1, data: { object: { id: 'ca_1', object: 'application' } } });
    r = await h.stripeConnectWebhook(de, sign(de, CSECRET));
    assert.equal(r.status, 200);
    const off = await read('connectStatus/u-org');
    assert.equal(off.chargesEnabled, false); assert.equal(off.payoutsEnabled, false); assert.equal(typeof off.deauthorizedAt, 'number');
    // An account nobody owns: recorded, nothing else written.
    const stranger = evt('evt_acct_2', 'account.updated', Object.assign({}, acct, { id: 'acct_STRANGER', metadata: {} }));
    r = await h.stripeConnectWebhook(stranger, sign(stranger, CSECRET));
    assert.equal(r.status, 200); assert.equal(r.body, 'rejected-account');
    assert.equal((await read('stripeEvents/evt_acct_2')).type, 'rejected-account');
    assert.deepEqual(Object.keys(await read('connectStatus')), ['u-org']);
    // Accounts v2 (2026-11-13): the v1 view of a v2 account arrives with no
    // metadata.uid and no business_profile.name; it is OUR account (stripeAccounts
    // holds its id), so the mirror is written, with the name kept at creation.
    await adminRest(NS, 'PUT', 'stripeAccounts/u-org', { acct: 'acct_MOCK1', createdAt: 1, api: 'v2', name: 'Hope Foundation' });
    const bare = evt('evt_acct_3', 'account.updated', Object.assign({}, acct, { charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] }, metadata: {}, business_profile: {} }));
    r = await h.stripeConnectWebhook(bare, sign(bare, CSECRET));
    assert.equal(r.status, 200); assert.equal(r.body, 'account.updated');
    const v2m = await read('connectStatus/u-org');
    assert.equal(v2m.chargesEnabled, true); assert.equal(v2m.payoutsEnabled, true); assert.equal(v2m.name, 'Hope Foundation'); assert.equal(v2m.deauthorizedAt, undefined);
});
