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
    const h = makeHandlers(Object.assign({ db: cdb, stripe: m.s, webhookSecret: SECRET, now: () => ++clock }, opts || {}));
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
    // RE-PINNED 2026-11-09 (E1): the codebase also exports sendAnnouncement,
    // which binds NO Stripe secret - tournament_e1_announce_server_test.js X1
    // holds that. The three contract functions below are unchanged.
    assert.deepEqual(Object.keys(m).sort(), ['createEntryCheckout', 'refundEntry', 'sendAnnouncement', 'stripeWebhook']);
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
