// ============================================================================
// STRIPE PHASE 1 RULES BLOCK, IN THE FIREBASE DATABASE EMULATOR (2026-11-08)
//
// Two namespaces on one emulator (local port 9473, nothing live, no rules
// published):
//   LIVE = the LIVE rules read read-only on 2026-11-08 (database:get
//          /.settings/rules), saved as the ROLLBACK file in the inbox.
//   CAND = LIVE + the block, built by tools/stripe-rules-candidate.js, saved as
//          the CANDIDATE file in the inbox. Test 1 proves CAND === build(LIVE),
//          so the file that is tested is the file that would be published.
// The repo's database.rules.json is NOT used and NOT changed (it is behind live).
//
// Users go in ?auth=<unsigned token> (alg none). Measured on emulator 4.11.2:
// any Authorization: Bearer header is ADMIN, so only 'admin' arms use one -
// that is the Admin SDK the functions run as.
//
// LIVE arms are the controls: each refusal the block ADDS is shown accepted on
// LIVE (so the block, not some older rule, is what refuses it), and every flow
// that exists today (public sign-up, owner approve, owner cash tick) is shown
// accepted on BOTH.
//
// Skipped when the emulator jar, Java, or either inbox file is missing.
// Env: STRIPE_RULES_LIVE / STRIPE_RULES_CANDIDATE point elsewhere (the negative
// controls use the second to load a mutated candidate).
//
// BASELINE (new file, final run, branch stripe-1-server on 115296b8):
//   against LIVE alone (STRIPE_RULES_CANDIDATE := the live file): 8 tests,
//   2 pass / 6 fail. Pass: 2 (existing flows) and 4 (public create with a
//   server field - LIVE already refuses it, via registrations $other: false;
//   the block keeps that refusal and test 4 is there so it cannot regress).
//   Fail: 1 (file != build), 3 (cash paidVia / fees / allow-list read not
//   allowed yet), 5 (Stripe-paid lock absent), 6 (fees untyped), 7 (its CAND
//   half), 8 (registrationStatus read not open yet).
//   against CAND: 8 tests, 8 pass / 0 fail.
//   Negative controls on the block (11, mutated candidate in the scratchpad via
//   STRIPE_RULES_CANDIDATE): all 11 caught by an arm other than test 1.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { build } = require('./tools/stripe-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = process.env.STRIPE_RULES_LIVE || path.join(INBOX, 'TOURNAMENTS-STRIPE-RULES-ROLLBACK-live-20261108.json');
const CAND_FILE = process.env.STRIPE_RULES_CANDIDATE || path.join(INBOX, 'TOURNAMENTS-STRIPE-RULES-CANDIDATE.json');

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
const SKIP = !fs.existsSync(LIVE_FILE) ? { skip: 'no saved live rules ' + LIVE_FILE }
    : !fs.existsSync(CAND_FILE) ? { skip: 'no candidate ' + CAND_FILE }
    : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java) on this machine' } : {};

const PORT = 9473, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'stripelive', CAND: 'stripecand' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    // Live tournaments/<code> writes need auth.token.email; an organizer is email-signed-in.
    ...(provider === 'anonymous' ? {} : { email: uid + '@example.test', email_verified: true }),
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), anon: token('u-anon', 'anonymous') };

async function req(ns, method, p, body, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = AS[who] ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS[ns]}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    await r.text();
    return r.status;
}
const OK = 200;
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');   // emulator-only: it cannot load \s in a class (file on disk untouched)

const REG = (extra) => Object.assign({ createdAt: 1, fullName: 'Ann Golfer', email: 'ann@example.test', phone: '5555550100' }, extra || {});
const SEED = {
    tournaments: {
        STR1: { name: 'Stripe Open', ownerUid: 'u-org', createdAt: 1, format: 'scramble',
            fees: { entryFeeCents: 5000, collectByCard: true, allowCash: true } }
    },
    registrations: {
        STR1: {
            eCash: REG(),
            eStripe: REG({ paid: true, paidAt: 10, paidVia: 'stripe', ref: 'pi_seed1', amountCents: 5000, checkoutAt: 5 }),
            ePend: REG({ checkoutAt: 5 })
        }
    },
    payments: { allowedOwners: { 'u-org': true } },
    stripeEvents: { evt_seed: { type: 'checkout.session.completed', at: 1 } },
    registrationStatus: { STR1: { eStripe: { paid: true, paidVia: 'stripe', at: 10 } } }
};
let emu = null;
const reseed = async () => { for (const ns of Object.keys(NS)) assert.equal(await req(ns, 'PUT', '', SEED, 'admin'), OK); };

before(async () => {
    if (SKIP.skip) return;
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS.LIVE}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    for (const [ns, file] of [['LIVE', LIVE_FILE], ['CAND', CAND_FILE]]) {
        const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS[ns]}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(fs.readFileSync(file, 'utf8')) });
        assert.equal(r.status, OK, ns + ' rules refused by the emulator: ' + (await r.text()).slice(0, 200));
    }
});
after(() => { if (emu) emu.kill(); });

test('1. the candidate file is exactly build(LIVE), and the block touches only its six paths', SKIP, () => {
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const cand = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8'));
    assert.deepEqual(cand, build(live));
    // Positive: the block is really in the file.
    assert.ok(cand.rules.payments && cand.rules.stripeEvents && cand.rules.tournaments.$tourneyCode.fees && cand.rules.registrationStatus);
    assert.match(cand.rules.registrations.$code.$entryId['.validate'], /paidVia/);
    // Everything else is byte-identical to live.
    const strip = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.rules.payments; delete c.rules.stripeEvents; delete c.rules.registrationStatus; delete c.rules.tournaments.$tourneyCode.fees;
        const e = c.rules.registrations.$code.$entryId; delete e['.validate']; ['paidVia', 'ref', 'amountCents', 'checkoutAt', 'refundPendingAt', 'refundedAt', 'refundCents', 'refundRef', 'disputedAt'].forEach((k) => delete e[k]); return c; };
    assert.deepEqual(strip(cand), strip(live));
});

test('2. existing flows pass on LIVE and CAND: public sign-up, owner approve (one multi-path update), owner edit, owner remove', SKIP, async () => {
    await reseed();
    for (const ns of ['LIVE', 'CAND']) {
        assert.equal(await req(ns, 'PUT', 'registrations/STR1/eNew1', REG(), null), OK, ns + ' signed-out public create');
        assert.equal(await req(ns, 'PUT', 'registrations/STR1/eNew2', REG({ shirtSize: 'L', dinnerCount: 1 }), 'anon'), OK, ns + ' anonymous public create');
        assert.equal(await req(ns, 'PATCH', '', { 'tournaments/STR1/players/p1': { id: 'p1', name: 'Ann Golfer', handicap: '0', addedAt: 2 },
            'registrations/STR1/eCash/approvedAt': 2, 'registrations/STR1/eCash/playerId': 'p1' }, 'owner'), OK, ns + ' owner approve');
        assert.equal(await req(ns, 'PATCH', 'registrations/STR1/eStripe', { fullName: 'Ann G', email: 'ann2@example.test', phone: '5555550101' }, 'owner'), OK, ns + ' owner edit on a Stripe-paid entry');
        assert.equal(await req(ns, 'PATCH', 'registrations/STR1/eStripe', { approvedAt: 3, teamNum: 2 }, 'owner'), OK, ns + ' owner approve a Stripe-paid entry');
        assert.equal(await req(ns, 'DELETE', 'registrations/STR1/eNew1', undefined, 'owner'), OK, ns + ' owner removes an entry');
        assert.equal(await req(ns, 'DELETE', 'registrations/STR1/eStripe', undefined, 'owner'), OK, ns + ' owner removes a Stripe-paid entry from the field');
    }
});

test('3. allowed new writes on CAND: owner cash paid (with and without paidVia) and un-tick; Admin SDK Stripe paid; owner fees; own allow-list read', SKIP, async () => {
    await reseed();
    const ns = 'CAND';
    assert.equal(await req(ns, 'PATCH', 'registrations/STR1/eCash', { paid: true, paidAt: 123, paidVia: 'cash' }, 'owner'), OK, 'owner cash paid with paidVia');
    assert.equal(await req(ns, 'PATCH', 'registrations/STR1/eCash', { paid: false, paidAt: null, paidVia: null }, 'owner'), OK, 'owner un-ticks a cash entry');
    assert.equal(await req(ns, 'PATCH', 'registrations/STR1/eCash', { paid: true, paidAt: 124 }, 'owner'), OK, 'owner Desk tick as today (no paidVia)');
    assert.equal(await req(ns, 'PATCH', 'registrations/STR1/ePend', { paid: true, paidAt: 200, paidVia: 'stripe', ref: 'pi_ok', amountCents: 5000 }, 'admin'), OK, 'Admin SDK Stripe paid');
    assert.equal(await req(ns, 'PATCH', 'registrations/STR1/ePend', { refundPendingAt: 300, refundedAt: 301, refundCents: 5000, refundRef: 're_ok', paid: false, disputedAt: 302, checkoutAt: null }, 'admin'), OK, 'Admin SDK refund/dispute/expire fields');
    assert.equal(await req(ns, 'PUT', 'tournaments/STR1/fees', { entryFeeCents: 100, collectByCard: false, allowCash: true }, 'owner'), OK, 'owner fees at the 100c floor');
    assert.equal(await req(ns, 'PATCH', 'tournaments/STR1/fees', { entryFeeCents: 100000 }, 'owner'), OK, 'owner fees at the 100000c ceiling');
    assert.equal(await req(ns, 'PUT', 'tournaments/NEW1', { ownerUid: 'u-who', name: 'New', createdAt: 1, fees: { entryFeeCents: 2500, collectByCard: true, allowCash: false } }, 'stranger'), OK, 'a new event created with fees by its new owner');
    assert.equal(await req(ns, 'GET', 'payments/allowedOwners/u-org', undefined, 'owner'), OK, 'owner reads own allow-list entry');
    assert.equal(await req(ns, 'GET', 'payments/allowedOwners/u-who', undefined, 'stranger'), OK, 'a uid not on the list reads its own (null) entry');
    // A full-entry rewrite by the owner that keeps every server field unchanged is allowed.
    assert.equal(await req(ns, 'PUT', 'registrations/STR1/eStripe', REG({ paid: true, paidAt: 10, paidVia: 'stripe', ref: 'pi_seed1', amountCents: 5000, checkoutAt: 5, approvedAt: 9 }), 'owner'), OK, 'owner set() with server fields unchanged');
});

const PUBLIC_REFUSED = [
    ['paidVia cash', { paidVia: 'cash' }], ['paidVia stripe', { paidVia: 'stripe' }], ['ref', { ref: 'pi_x' }], ['amountCents', { amountCents: 5000 }],
    ['checkoutAt', { checkoutAt: 1 }], ['refundPendingAt', { refundPendingAt: 1 }], ['refundedAt', { refundedAt: 1 }],
    ['refundCents', { refundCents: 1 }], ['refundRef', { refundRef: 're_x' }], ['disputedAt', { disputedAt: 1 }],
    ['paid (existing rule)', { paid: true }]
];
const OWNER_SERVER_ONLY = [['ref', 'pi_owner'], ['amountCents', 5000], ['checkoutAt', 1], ['refundPendingAt', 1], ['refundedAt', 1], ['refundCents', 5000], ['refundRef', 're_owner'], ['disputedAt', 1]];

test('4. CAND refuses a public create carrying any paid / server-only field', SKIP, async () => {
    await reseed();
    let i = 0;
    for (const [label, extra] of PUBLIC_REFUSED) {
        for (const who of [null, 'anon']) assert.notEqual(await req('CAND', 'PUT', 'registrations/STR1/pub' + (i++), REG(extra), who), OK, 'public create with ' + label + ' as ' + (who || 'signed-out'));
    }
    // positive: the same create without the field is accepted (so a refusal above is the field, not the path)
    assert.equal(await req('CAND', 'PUT', 'registrations/STR1/pubClean', REG(), null), OK);
});

test('5. CAND refuses the owner: paidVia stripe, any server-only field (set, change or delete), any paid move on a Stripe-paid entry', SKIP, async () => {
    await reseed();
    const no = async (p, body, why) => assert.notEqual(await req('CAND', 'PATCH', p, body, 'owner'), OK, why);
    await no('registrations/STR1/eCash', { paidVia: 'stripe' }, 'owner sets paidVia stripe');
    await no('registrations/STR1/eCash', { paid: true, paidAt: 1, paidVia: 'stripe' }, 'owner marks paid by stripe');
    await no('registrations/STR1/eCash', { paidVia: 'venmo' }, 'paidVia outside cash/stripe');
    for (const [f, v] of OWNER_SERVER_ONLY) await no('registrations/STR1/eCash', { [f]: v }, 'owner writes ' + f);
    await no('registrations/STR1/eStripe', { ref: 'pi_other' }, 'owner changes ref');
    await no('registrations/STR1/eStripe', { ref: null }, 'owner deletes ref');
    await no('registrations/STR1/eStripe', { amountCents: 1 }, 'owner changes amountCents');
    await no('registrations/STR1/ePend', { checkoutAt: null }, 'owner deletes checkoutAt');
    await no('registrations/STR1/eStripe', { paid: false }, 'owner un-ticks a Stripe-paid entry');
    await no('registrations/STR1/eStripe', { paid: false, paidAt: null }, 'owner un-ticks (Desk patch) a Stripe-paid entry');
    await no('registrations/STR1/eStripe', { paidAt: 11 }, 'owner moves paidAt on a Stripe-paid entry');
    await no('registrations/STR1/eStripe', { paidVia: 'cash' }, 'owner flips Stripe to cash');
    await no('registrations/STR1/eStripe', { paidVia: null }, 'owner deletes paidVia stripe');
    // multi-path at root cannot route around it
    await no('', { 'registrations/STR1/eStripe/paid': false }, 'owner root multi-path un-tick');
    // stranger and anon are refused whole-entry writes on an existing entry (existing rule) - control that the paths are real
    assert.notEqual(await req('CAND', 'PATCH', 'registrations/STR1/eCash', { paid: true, paidAt: 1, paidVia: 'cash' }, 'stranger'), OK, 'stranger cash tick');
    // positive in the same block: the owner CAN still write a plain field on these entries
    assert.equal(await req('CAND', 'PATCH', 'registrations/STR1/eStripe', { teamNum: 3 }, 'owner'), OK);
});

test('6. CAND refuses fees writes that are not the owner or not typed; payments and stripeEvents are closed', SKIP, async () => {
    await reseed();
    const FEE = (o) => Object.assign({ entryFeeCents: 5000, collectByCard: true, allowCash: true }, o);
    for (const who of ['stranger', 'anon', null]) assert.notEqual(await req('CAND', 'PUT', 'tournaments/STR1/fees', FEE(), who), OK, 'fees by ' + (who || 'signed-out'));
    for (const [why, body] of [['99c', FEE({ entryFeeCents: 99 })], ['100001c', FEE({ entryFeeCents: 100001 })], ['fractional', FEE({ entryFeeCents: 5000.5 })],
        ['string cents', FEE({ entryFeeCents: '5000' })], ['dollars-looking 0', FEE({ entryFeeCents: 0 })], ['collectByCard string', FEE({ collectByCard: 'yes' })],
        ['allowCash number', FEE({ allowCash: 1 })], ['extra field', FEE({ amountCents: 1 })]]) {
        assert.notEqual(await req('CAND', 'PUT', 'tournaments/STR1/fees', body, 'owner'), OK, 'owner fees ' + why);
    }
    assert.notEqual(await req('CAND', 'PUT', 'tournaments/STR1/fees', 5000, 'owner'), OK, 'fees as a bare number');
    assert.notEqual(await req('CAND', 'GET', 'payments/allowedOwners/u-org', undefined, 'stranger'), OK, 'stranger reads another uid allow-list');
    assert.notEqual(await req('CAND', 'GET', 'payments/allowedOwners/u-org', undefined, null), OK, 'signed-out reads allow-list');
    assert.notEqual(await req('CAND', 'PUT', 'payments/allowedOwners/u-org', true, 'owner'), OK, 'owner writes own allow-list');
    assert.notEqual(await req('CAND', 'PUT', 'payments/allowedOwners/u-who', true, 'stranger'), OK, 'stranger adds self');
    assert.notEqual(await req('CAND', 'GET', 'payments', undefined, 'owner'), OK, 'payments root read');
    assert.notEqual(await req('CAND', 'PUT', 'payments/checkoutAttempts/STR1/eCash', 0, 'owner'), OK, 'owner resets attempt count');
    assert.notEqual(await req('CAND', 'GET', 'stripeEvents/evt_seed', undefined, 'owner'), OK, 'stripeEvents read');
    assert.notEqual(await req('CAND', 'PUT', 'stripeEvents/evt_new', { type: 'x', at: 1 }, 'owner'), OK, 'stripeEvents write');
    assert.notEqual(await req('CAND', 'DELETE', 'stripeEvents/evt_seed', undefined, 'owner'), OK, 'stripeEvents delete');
    // positive: the typed fees write by the owner is accepted
    assert.equal(await req('CAND', 'PUT', 'tournaments/STR1/fees', FEE(), 'owner'), OK);
});

test('7. LIVE controls: what the block newly refuses is accepted on LIVE today (so the block is what refuses it)', SKIP, async () => {
    await reseed();
    assert.equal(await req('LIVE', 'PATCH', 'registrations/STR1/eStripe', { paid: false, paidAt: null }, 'owner'), OK, 'LIVE: owner un-ticks a Stripe-paid entry');
    assert.equal(await req('LIVE', 'PUT', 'tournaments/STR1/fees', { entryFeeCents: 99, collectByCard: 'yes', junk: 1 }, 'owner'), OK, 'LIVE: untyped fees');
    // Already refused on LIVE by $other: false (the new children keep them refused for clients, and add the stripe lock).
    assert.notEqual(await req('LIVE', 'PATCH', 'registrations/STR1/eCash', { paidVia: 'cash' }, 'owner'), OK, 'LIVE: paidVia is not in the schema yet');
    assert.notEqual(await req('LIVE', 'GET', 'payments/allowedOwners/u-org', undefined, 'owner'), OK, 'LIVE: payments falls to root $other (closed)');
    // ...and CAND opens exactly the one it should
    assert.equal(await req('CAND', 'PATCH', 'registrations/STR1/eCash', { paidVia: 'cash' }, 'owner'), OK, 'CAND: owner paidVia cash');
    assert.equal(await req('CAND', 'GET', 'payments/allowedOwners/u-org', undefined, 'owner'), OK, 'CAND: own allow-list read');
});

test('8. registrationStatus (Addendum 2026-11-08): anyone reads ONE entry by exact id; nobody lists $code; no client writes', SKIP, async () => {
    await reseed();
    for (const who of [null, 'anon', 'stranger', 'owner']) {
        assert.equal(await req('CAND', 'GET', 'registrationStatus/STR1/eStripe', undefined, who), OK, 'exact-id read as ' + (who || 'signed-out'));
        assert.equal(await req('CAND', 'GET', 'registrationStatus/STR1/eNone', undefined, who), OK, 'exact-id read of an absent id (null) as ' + (who || 'signed-out'));
        assert.notEqual(await req('CAND', 'GET', 'registrationStatus/STR1', undefined, who), OK, 'list $code as ' + (who || 'signed-out'));
        assert.notEqual(await req('CAND', 'GET', 'registrationStatus', undefined, who), OK, 'list root as ' + (who || 'signed-out'));
        assert.notEqual(await req('CAND', 'PUT', 'registrationStatus/STR1/eCash', { paid: true, paidVia: 'stripe', at: 1 }, who), OK, 'write a status as ' + (who || 'signed-out'));
        assert.notEqual(await req('CAND', 'PATCH', 'registrationStatus/STR1/eStripe', { paid: false }, who), OK, 'change a status as ' + (who || 'signed-out'));
        assert.notEqual(await req('CAND', 'DELETE', 'registrationStatus/STR1/eStripe', undefined, who), OK, 'delete a status as ' + (who || 'signed-out'));
    }
    // a shallow list is a list too
    const r = await fetch(`${BASE}/registrationStatus/STR1.json?ns=${NS.CAND}&shallow=true`);
    await r.text();
    assert.notEqual(r.status, OK, 'shallow list of $code');
    // positive: the read returns the server-written value, and the Admin SDK can write it
    const got = await (await fetch(`${BASE}/registrationStatus/STR1/eStripe.json?ns=${NS.CAND}`)).json();
    assert.deepEqual(got, { paid: true, paidVia: 'stripe', at: 10 });
    assert.equal(await req('CAND', 'PUT', 'registrationStatus/STR1/eCash', { paid: true, paidVia: 'stripe', at: 2 }, 'admin'), OK);
    // LIVE control: today the exact-id read is refused (root $other), so the block is what opens it
    assert.notEqual(await req('LIVE', 'GET', 'registrationStatus/STR1/eStripe', undefined, null), OK, 'LIVE refuses the status read');
});
