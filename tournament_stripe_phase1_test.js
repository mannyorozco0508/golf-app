// ============================================================================
// STRIPE PHASE 1, TEST MODE - THE WEB HALF (tournament.html), 2026-11-08
//
// The contract is claude-mailbox-shared/tournaments/STRIPE-CONTRACT.md. The
// server half (createEntryCheckout, refundEntry, stripeWebhook) is the server
// helper's and is NOT in this branch; every callable here is a stand-in that
// records what the page asked for and answers from a plan.
//
// HOW EACH TEST ARRIVES. Through the URL a golfer or organizer opens
// (?register=CODE, ?register=CODE&entry=ID&checkout=done|cancel,
// ?tourney=CODE), the page's OWN database listeners fired with a record, and
// TAPS: tap() runs the onclick text of the element the golfer touches - read
// from the page's static markup, or from the markup the page itself rendered
// into innerHTML - with `this` bound to that element. No test names a render
// or sync function the page defines.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (a rendered
// button is found by its markup, not as a node), there is no layout (a shown
// element may still be 0x0), and static attributes are not parsed. Those are
// measured in Chrome by tools/tournament-stripe-check.js (cold arrival, stubbed
// callable, exit 0 on this branch).
//
// THE DEFAULT STATE IS TESTED FIRST: an event with no fees node shows exactly
// today's signup form and today's desk. That is the state every existing event
// is in.
//
// BASELINE (CLAUDE.md "a count comes from the FINAL run of the FINAL file"):
//   against pre-build 115296b8 (tournament.html sha256 5f6c2a64..., no Stripe
//   code, firebase-functions-compat.js absent): 42 tests - 2 pass / 40 fail.
//   The 2 that pass are F1 (the no-fees desk is today's desk) and G1 (a
//   signed-out visitor reads no list and sees no Refund) - both true of a page
//   with no payments at all; they are guards that must STAY green, not
//   evidence of the build. A1/A2/A3 fail at baseline only because mini-dom
//   hands back a detached, "shown" element for an id the page lacks.
//   on stripe-1-web after the build: 42 tests - 42 pass / 0 fail.
//   registrationStatus switch (stripe-1, 2026-11-08): 42 tests - 42 pass / 0 fail;
//   control (tournament.html put back to the registrations/ read): 40 pass / 2 fail.
// NEGATIVE CONTROLS (each mutated in tournament.html, restored by sha from a
// saved copy): pay button with collectByCard false -> A2; card toggle for a
// not-allow-listed owner -> H2; Refund for a non-owner with the desk gate
// stubbed open -> G2; Undo on a Stripe-paid entry -> E2 (+6 more); pay amount
// from entryFee dollars -> B1; desk tiles from entryFee dollars -> E4; old
// checkbox on a Stripe entry with no fees -> F2.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const HTML = read(PAGE);
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const FEES = { entryFeeCents: 10000, collectByCard: true, allowCash: true };
const REASONS = ['not-found', 'already-paid', 'not-collecting', 'not-allowed-owner', 'too-many-attempts', 'bad-fee'];

function settle() { return Promise.resolve().then(() => new Promise((r) => setImmediate(r))); }
const clone = (o) => JSON.parse(JSON.stringify(o));
function record(o) {
    return Object.assign({ name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', activeCourseKey: 'papago', courseData: COURSE,
        entryFee: 0, createdAt: 1, ownerUid: 'u-org', eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun',
        teams: { team1: { num: 1, name: 'Team 1', players: ['Ann Alpha'], handicap: 0 } } }, o || {});
}
function individual(o) {
    return record(Object.assign({ format: 'individual', scoringModel: 'player-v1', teams: {}, players: { p1: { id: 'p1', name: 'Al Lopez', handicap: '12', addedAt: 1 } } }, o || {}));
}

// THE STAND-IN CALLABLE. Installed after load and before any tap: the page
// looks for firebase.functions at tap time, as it would after the lazy load.
function stubCallables(sb, plan) {
    sb.__calls = [];
    sb.firebase.functions = () => ({ httpsCallable: (name) => (data) => {
        sb.__calls.push({ name, data: clone(data), writesBefore: sb.__dbWrites.length });
        const q = plan[name] || []; const step = q.length > 1 ? q.shift() : q[0];
        if (!step) return Promise.reject(Object.assign(new Error('no plan'), { code: 'functions/internal' }));
        if (step.reason !== undefined) return Promise.reject(Object.assign(new Error('refused'), { code: 'functions/failed-precondition', details: { reason: step.reason } }));
        return Promise.resolve({ data: clone(step.ok) });
    } });
}

// A TAP. The onclick text of the element, from the page's markup, run in the
// page's realm with `this` = the element. Static markup first; `rendered` is
// the innerHTML the page wrote (for rows, sheets and cards it builds).
function onclickOf(markup, test) {
    const tags = markup.match(/<(button|a|input)\b[^>]*>/g) || [];
    const tag = tags.find(test);
    if (!tag) return null;
    const m = /\bonclick="([^"]*)"/.exec(tag) || /\bonchange="([^"]*)"/.exec(tag);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
}
function tap(sb, markup, test, elId) {
    const code = onclickOf(markup, test);
    assert.ok(code, 'nothing to tap in that markup');
    sb.__tapEl = elId ? sb.document.getElementById(elId) : { dataset: datasetOf(markup, test) };
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
function datasetOf(markup, test) {
    const tag = (markup.match(/<(button|a|input)\b[^>]*>/g) || []).find(test) || '';
    const ds = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k.replace(/-([a-z])/g, (x, c) => c.toUpperCase())] = v; });
    return ds;
}
const byId = (id) => (tag) => new RegExp('\\bid="' + id + '"').test(tag);
const byClass = (cls) => (tag) => new RegExp('class="[^"]*\\b' + cls + '\\b').test(tag);

function arriveRegister(rec, search) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: search || '?register=REG1', beforeRun(s) { s.__dbReads = { 'tournaments/REG1': clone(rec) }; } });
    sb.location.href = 'https://tournaments.rattlegolf.com/tournament?register=REG1';
    return sb;
}
function arriveOwner(rec, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=OWN1', localStorage: !!opts.seed, seedStorage: opts.seed,
        beforeRun(s) { s.__dbReads = Object.assign({}, opts.reads || {}); } });
    sb.__auth.setUser('user' in opts ? opts.user : ORGANIZER);
    fireRecord(sb, rec);
    return sb;
}
function fireRecord(sb, rec) {
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/OWN1$/.test(h.path)).forEach((h) => h.cb({ val: () => clone(rec), exists: () => true }));
}
function fireRegistrations(sb, data) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && /registrations\/OWN1$/.test(h.path));
    assert.ok(hs.length > 0, 'no registrations listener');
    hs.forEach((h) => h.cb({ val: () => clone(data), exists: () => true }));
}
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const fill = (sb) => { el(sb, 'reg-name').value = 'Al Lopez'; el(sb, 'reg-email').value = 'al@example.com'; el(sb, 'reg-phone').value = '602-555-0142'; };
const regSets = (sb) => sb.__dbWrites.filter((w) => w.op === 'set' && /^registrations\/REG1\/[^/]+$/.test(w.path));
const rowOf = (sb, id) => { const h = html(sb, 'registration-list'); const at = h.indexOf('data-entry-id="' + id + '"'); assert.ok(at !== -1, 'row ' + id + ' rendered'); const next = h.indexOf('<div class="reg-row"', at + 10); return h.slice(at, next === -1 ? undefined : next); };

// ---------------------------------------------------------------------------
describe('A. THE DEFAULT STATE: no fees node, today\'s signup form', () => {
    test('A1 no fees: Sign up shown, no pay button, no fee box, no cash line; Sign up writes the entry and calls nothing', async () => {
        const sb = arriveRegister(record()); await settle(); stubCallables(sb, {});
        assert.equal(shown(sb, 'reg-submit'), true);
        assert.equal(shown(sb, 'reg-pay'), false); assert.equal(shown(sb, 'reg-fee-box'), false); assert.equal(shown(sb, 'reg-cash-line'), false);
        fill(sb); tap(sb, HTML, byId('reg-submit')); await settle();
        assert.equal(regSets(sb).length, 1, 'one signup written');
        assert.equal(sb.__calls.length, 0, 'no callable on a no-fees event');
        assert.equal(sb.location.href, 'https://tournaments.rattlegolf.com/tournament?register=REG1', 'the page did not go anywhere');
        assert.match(html(sb, 'reg-status'), /you are signed up/, 'positive: the old confirmation');
    });
    test('A2 a fee with collectByCard false shows no pay button (the toggle is the only switch)', async () => {
        const sb = arriveRegister(record({ fees: { entryFeeCents: 10000, collectByCard: false, allowCash: true } })); await settle();
        assert.equal(shown(sb, 'reg-pay'), false); assert.equal(shown(sb, 'reg-submit'), true);
    });
    test('A3 collectByCard true with a fee the server would refuse (not whole cents / out of range) shows no pay button', async () => {
        for (const bad of [99, 100000.5, 100001, '10000']) {
            const sb = arriveRegister(record({ fees: { entryFeeCents: bad, collectByCard: true, allowCash: true } })); await settle();
            assert.equal(shown(sb, 'reg-pay'), false, 'fee ' + JSON.stringify(bad));
        }
    });
});

describe('B. M2a: the fee and the pay button come from fees.entryFeeCents', () => {
    // Re-pinned 2026-11-11 (Manny: ONE entry fee field): the record's fee is $123.45 per
    // golfer, and fees.entryFeeCents is its mirror (12345), which the server reads.
    test('B1 card fees: pay button + fee box + cash line; Sign up hidden; the amount is the one fee, per golfer, as cents', async () => {
        const sb = arriveRegister(record({ entryFee: 123.45, entryFeePer: 'golfer', fees: Object.assign({}, FEES, { entryFeeCents: 12345 }) })); await settle();
        assert.equal(shown(sb, 'reg-pay'), true); assert.equal(shown(sb, 'reg-fee-box'), true);
        assert.equal(shown(sb, 'reg-cash-line'), true); assert.equal(shown(sb, 'reg-submit'), false);
        assert.equal(el(sb, 'reg-pay').textContent, 'Pay entry fee $123.45 ›');
        assert.equal(el(sb, 'reg-fee-amount').textContent, '$123.45');
        assert.ok(!/\$50/.test(el(sb, 'reg-pay').textContent));
        // The one field wins over a stale mirror: $50 per golfer with cents still 12345 reads $50.
        const stale = arriveRegister(record({ entryFee: 50, entryFeePer: 'golfer', fees: Object.assign({}, FEES, { entryFeeCents: 12345 }) })); await settle();
        assert.equal(el(stale, 'reg-pay').textContent, 'Pay entry fee $50.00 \u203a');
    });
    test('B2 allowCash false: no "Sign up without paying"', async () => {
        const sb = arriveRegister(record({ fees: Object.assign({}, FEES, { allowCash: false }) })); await settle();
        assert.equal(shown(sb, 'reg-pay'), true); assert.equal(shown(sb, 'reg-cash-line'), false);
    });
    test('B3 Pay: the signup is written FIRST, then createEntryCheckout({code, entryId}) - no amount - then the browser goes to the url', async () => {
        const sb = arriveRegister(record({ fees: FEES })); await settle();
        stubCallables(sb, { createEntryCheckout: [{ ok: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' } }] });
        fill(sb); tap(sb, HTML, byId('reg-pay')); await settle(); await settle();
        const sets = regSets(sb);
        assert.equal(sets.length, 1, 'one signup');
        const entryId = sets[0].path.split('/')[2];
        assert.ok(!('paid' in sets[0].value) && !('paidVia' in sets[0].value), 'the signup carries no payment keys');
        assert.equal(sb.__calls.length, 1);
        assert.equal(sb.__calls[0].name, 'createEntryCheckout');
        assert.deepEqual(sb.__calls[0].data, { code: 'REG1', entryId: entryId }, 'code and entryId only - never an amount');
        assert.ok(sb.__calls[0].writesBefore >= 1 && sb.__dbWrites.indexOf(sets[0]) < sb.__calls[0].writesBefore, 'the write was made before the callable ran');
        assert.equal(sb.location.href, 'https://checkout.stripe.com/c/pay/cs_test_1');
    });
    test('B4 "Sign up without paying" writes the signup and calls nothing', async () => {
        const sb = arriveRegister(record({ fees: FEES })); await settle(); stubCallables(sb, {});
        fill(sb); tap(sb, HTML, byId('reg-cash-signup')); await settle();
        assert.equal(regSets(sb).length, 1); assert.equal(sb.__calls.length, 0);
        assert.match(html(sb, 'reg-status'), /you are signed up/);
    });
    test('B5 a url that is not https is never followed', async () => {
        const sb = arriveRegister(record({ fees: FEES })); await settle();
        stubCallables(sb, { createEntryCheckout: [{ ok: { url: 'javascript:alert(1)' } }] });
        fill(sb); tap(sb, HTML, byId('reg-pay')); await settle(); await settle();
        assert.equal(sb.location.href, 'https://tournaments.rattlegolf.com/tournament?register=REG1');
        assert.match(plain(html(sb, 'reg-checkout')), /Registered · Unpaid/);
    });
});

describe('C. every createEntryCheckout refusal reason has its own sentence', () => {
    const SENT = {
        'not-found': /couldn't find your sign-up/,
        'already-paid': /already paid\. There is nothing more to pay/,
        'not-collecting': /isn't taking card payments right now/,
        'not-allowed-owner': /aren't switched on for this organizer yet/,
        'too-many-attempts': /Too many payment attempts/,
        'bad-fee': /entry fee on this event isn't set up right/
    };
    REASONS.forEach((reason) => test('C ' + reason, async () => {
        const sb = arriveRegister(record({ fees: FEES })); await settle();
        stubCallables(sb, { createEntryCheckout: [{ reason }] });
        fill(sb); tap(sb, HTML, byId('reg-pay')); await settle(); await settle();
        const panel = plain(html(sb, 'reg-checkout'));
        assert.match(panel, /Registered · Unpaid/);
        assert.match(panel, SENT[reason]);
        const offersPay = /id="reg-pay-again"/.test(html(sb, 'reg-checkout'));
        assert.equal(offersPay, ['already-paid', 'not-collecting', 'not-allowed-owner'].indexOf(reason) === -1, 'Pay again only where paying again can work');
    }));
    test('C the page knows exactly the contract\'s six reasons (source, decoded, with a positive anchor)', () => {
        const src = decodeEscapes(HTML);
        const at = src.indexOf('var CHECKOUT_REASON_TEXT = {');
        assert.ok(at !== -1, 'the reason table exists');
        const body = src.slice(at, src.indexOf('};', at));
        const keys = [...body.matchAll(/'([a-z-]+)':/g)].map((m) => m[1]);
        assert.deepEqual(keys.sort(), REASONS.slice().sort());
    });
});

describe('D. M2c: back from Stripe - the RECORD decides, never the URL', () => {
    function fireEntry(sb, value) {
        const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && h.path === 'registrationStatus/REG1/e1');
        assert.ok(hs.length > 0, 'the page listens on its own entry status');
        assert.equal(sb.__dbHandlers.filter((h) => /^registrations\//.test(h.path)).length, 0, 'a signed-out golfer never listens on the owner-only registrations');
        hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
    }
    test('D1 ?checkout=done: Payment processing until paid === true AND paidVia === stripe', async () => {
        const sb = arriveRegister(record({ fees: FEES }), '?register=REG1&entry=e1&checkout=done'); await settle();
        assert.equal(shown(sb, 'reg-form'), false);
        assert.match(plain(html(sb, 'reg-checkout')), /Payment processing…/);
        fireEntry(sb, { paid: true, paidVia: 'cash', at: 1 });
        assert.match(plain(html(sb, 'reg-checkout')), /Payment processing…/, 'cash is not a card payment');
        fireEntry(sb, { paid: false, paidVia: 'stripe', at: 1 });
        assert.match(plain(html(sb, 'reg-checkout')), /Payment processing…/, 'paid false is not paid');
        fireEntry(sb, { paid: true, paidVia: 'stripe', at: 2 });
        const panel = plain(html(sb, 'reg-checkout'));
        assert.match(panel, /You're registered · Paid/);
        assert.match(panel, /\$100\.00 paid by card · Stripe emails your receipt/);
        assert.match(panel, /Shotgun 8:00 AM/);
    });
    test('D2 the entry status cannot be read (rules not published, or offline): the page says so instead of waiting forever', async () => {
        // The stub's on() drops a cancel callback, so the arrival keeps it here -
        // installed before the page runs, the way the SDK would hold it.
        const sb = loadHtmlInlineScript(PAGE, [], { search: '?register=REG1&entry=e1&checkout=done', beforeRun(s) {
            s.__dbReads = { 'tournaments/REG1': clone(record({ fees: FEES })) }; s.__cancels = [];
            const orig = s.db.ref.bind(s.db);
            s.db.ref = (p) => { const r = orig(p); const on = r.on; r.on = (ev, cb, cancel) => { if (typeof cancel === 'function') s.__cancels.push({ path: p, cancel }); return on.call(r, ev, cb); }; return r; };
        } });
        await settle();
        assert.match(plain(html(sb, 'reg-checkout')), /Payment processing…/);
        const c = sb.__cancels.find((x) => x.path === 'registrationStatus/REG1/e1');
        assert.ok(c, 'the page listens with a cancel arm');
        c.cancel(Object.assign(new Error('permission_denied'), { code: 'PERMISSION_DENIED' }));
        const panel = plain(html(sb, 'reg-checkout'));
        assert.match(panel, /Payment processing…/);
        assert.match(panel, /This page can't check the payment from here/);
        assert.match(panel, /Stripe emails your receipt/);
    });
    test('D3 ?checkout=cancel: Registered · Unpaid with Pay again, which asks for the SAME entry', async () => {
        const sb = arriveRegister(record({ fees: FEES }), '?register=REG1&entry=e1&checkout=cancel'); await settle();
        stubCallables(sb, { createEntryCheckout: [{ ok: { url: 'https://checkout.stripe.com/c/pay/cs_test_2' } }] });
        const panelHtml = html(sb, 'reg-checkout');
        assert.match(plain(panelHtml), /Registered · Unpaid/);
        assert.match(plain(panelHtml), /The \$100\.00 entry fee is still owed/);
        tap(sb, panelHtml, byId('reg-pay-again')); await settle(); await settle();
        assert.deepEqual(sb.__calls.map((c) => c.data), [{ code: 'REG1', entryId: 'e1' }]);
        assert.equal(regSets(sb).length, 0, 'Pay again writes no second signup');
        assert.equal(sb.location.href, 'https://checkout.stripe.com/c/pay/cs_test_2');
    });
});

// ---------------------------------------------------------------------------
const NOV12 = new Date(2026, 10, 12, 10, 0, 0).getTime();
const DESK_REGS = {
    e1: { fullName: 'Al Lopez', email: 'al@example.com', phone: '6025550142', createdAt: 1, paid: true, paidAt: 5, paidVia: 'stripe', ref: 'pi_1', amountCents: 12345, approvedAt: 6, playerId: 'p1' },
    e2: { fullName: 'Sam Ortiz', email: 'sam@example.com', phone: '6025550143', createdAt: 2, paid: true, paidAt: 5, paidVia: 'cash' },
    e3: { fullName: 'Jo Kim', email: 'jo@example.com', phone: '6025550144', createdAt: 3 },
    e4: { fullName: 'Pat Reyes', email: 'pat@example.com', phone: '6025550145', createdAt: 4, paid: false, paidVia: 'stripe', ref: 'pi_4', amountCents: 12345, refundedAt: NOV12, refundCents: 12345 },
    e5: { fullName: 'Dee Nguyen', email: 'dee@example.com', phone: '6025550146', createdAt: 5, paid: true, paidVia: 'stripe', ref: 'pi_5', amountCents: 12345, refundPendingAt: 7 },
    e6: { fullName: 'Lee Park', email: 'lee@example.com', phone: '6025550147', createdAt: 6, paid: true, paidVia: 'stripe', ref: 'pi_6', amountCents: 12345, disputedAt: 8 }
};
const DESK_FEES = { entryFeeCents: 12345, collectByCard: true, allowCash: true };

describe('E. M3: the Desk with fees', () => {
    function desk() { const sb = arriveOwner(individual({ fees: DESK_FEES })); fireRegistrations(sb, DESK_REGS); return sb; }
    test('E1 badges: Paid (Stripe) / Paid (cash) / Unpaid / Refunded / Refund pending / Disputed', () => {
        const sb = desk();
        assert.match(plain(rowOf(sb, 'e1')), /Paid \(Stripe\) \$123\.45/);
        assert.match(plain(rowOf(sb, 'e2')), /Paid \(cash\)/);
        assert.match(plain(rowOf(sb, 'e3')), /Unpaid/);
        assert.match(plain(rowOf(sb, 'e4')), /Refunded \$123\.45 · Nov 12/);
        assert.match(plain(rowOf(sb, 'e5')), /Refund pending/);
        assert.match(plain(rowOf(sb, 'e6')), /Disputed/);
    });
    test('E2 a Stripe-paid entry has Refund and NO Undo, NO checkbox, NO Mark cash paid', () => {
        const r = rowOf(desk(), 'e1');
        assert.match(r, /class="[^"]*reg-refund-btn/);
        assert.ok(!/reg-undo-btn|Undo/.test(r), 'no Undo on a card payment');
        assert.ok(!/type="checkbox"/.test(r), 'no Paid checkbox on a card payment');
        assert.ok(!/reg-cash-btn/.test(r));
    });
    test('E3 refunded / pending / disputed entries have no pay control at all', () => {
        const sb = desk();
        ['e4', 'e5', 'e6'].forEach((id) => assert.ok(!/reg-refund-btn|reg-undo-btn|reg-cash-btn|type="checkbox"/.test(rowOf(sb, id)), id));
        assert.match(plain(rowOf(sb, 'e5')), /Dee Nguyen/, 'positive: the row is there');
    });
    test('E4 tiles from cents, the card-fee note, refunds counted', () => {
        const sb = desk();
        const tiles = plain(html(sb, 'registration-counts'));
        assert.match(tiles, /\$123\.45 card \(1\)/);
        assert.match(tiles, /\$123\.45 cash \(1\)/);
        assert.match(tiles, /\$123\.45 unpaid \(1\)/);
        assert.match(tiles, /Card fees are absorbed by HardPan/);
        assert.match(tiles, /1 refund: \$123\.45\./);
    });
    test('E5 filters: All / Card / Cash / Unpaid / Refunded, and a chip filters', () => {
        const sb = desk();
        const chips = html(sb, 'registration-chips');
        assert.match(plain(chips), /^All 6 Card 1 Cash 1 Unpaid 1 Refunded 3/);
        tap(sb, chips, (t) => /setRegistrationFilter\('card'\)/.test(t));
        const list = html(sb, 'registration-list');
        assert.ok(/data-entry-id="e1"/.test(list) && !/data-entry-id="e2"/.test(list), 'Card shows only the card payment');
    });
    test('E6 Mark cash paid writes paid + paidAt + paidVia cash; Undo clears all three', async () => {
        const sb = desk();
        tap(sb, rowOf(sb, 'e3'), byClass('reg-cash-btn')); await settle();
        const w1 = sb.__dbWrites.filter((w) => w.path === 'registrations/OWN1/e3');
        assert.equal(w1.length, 1); assert.equal(w1[0].op, 'update');
        assert.equal(w1[0].value.paid, true); assert.equal(w1[0].value.paidVia, 'cash'); assert.equal(typeof w1[0].value.paidAt, 'number');
        tap(sb, rowOf(sb, 'e2'), byClass('reg-undo-btn')); await settle();
        const w2 = sb.__dbWrites.filter((w) => w.path === 'registrations/OWN1/e2');
        assert.deepEqual(clone(w2.map((w) => w.value)), [{ paid: false, paidAt: null, paidVia: null }]);
    });
    test('E7 Refund: the sheet names who and how much; refundEntry gets {code, entryId}; the page writes nothing itself', async () => {
        const sb = desk(); stubCallables(sb, { refundEntry: [{ ok: { status: 'pending' } }] });
        tap(sb, rowOf(sb, 'e1'), byClass('reg-refund-btn'));
        const sheet = html(sb, 'refund-sheet-body');
        assert.match(plain(sheet), /Refund Al Lopez \$123\.45\?/);
        const before = sb.__dbWrites.length;
        tap(sb, sheet, byId('refund-confirm')); await settle(); await settle();
        assert.deepEqual(sb.__calls.map((c) => [c.name, c.data]), [['refundEntry', { code: 'OWN1', entryId: 'e1' }]]);
        assert.equal(sb.__dbWrites.length, before, 'refund is the server\'s write, not the page\'s');
        assert.match(plain(html(sb, 'refund-sheet-body')), /Also remove from the field\?/);
    });
    test('E8 then "Remove from the field" is ONE owner write (withdrawn); "Keep in the field" writes nothing', async () => {
        const yes = desk(); stubCallables(yes, { refundEntry: [{ ok: { status: 'pending' } }] });
        tap(yes, rowOf(yes, 'e1'), byClass('reg-refund-btn')); tap(yes, html(yes, 'refund-sheet-body'), byId('refund-confirm')); await settle(); await settle();
        const before = yes.__dbWrites.length;
        tap(yes, html(yes, 'refund-sheet-body'), byId('refund-remove-yes')); await settle();
        assert.deepEqual(clone(yes.__dbWrites.slice(before).map((w) => [w.op, w.path, w.value])), [['set', 'tournaments/OWN1/players/p1/status', 'withdrawn']]);
        const no = desk(); stubCallables(no, { refundEntry: [{ ok: { status: 'pending' } }] });
        tap(no, rowOf(no, 'e1'), byClass('reg-refund-btn')); tap(no, html(no, 'refund-sheet-body'), byId('refund-confirm')); await settle(); await settle();
        const b2 = no.__dbWrites.length;
        tap(no, html(no, 'refund-sheet-body'), byId('refund-remove-no')); await settle();
        assert.equal(no.__dbWrites.length, b2);
    });
    test('E9 a refused refund says so and changes nothing', async () => {
        const sb = desk(); stubCallables(sb, { refundEntry: [{ reason: 'not-owner' }] });
        tap(sb, rowOf(sb, 'e1'), byClass('reg-refund-btn'));
        const before = sb.__dbWrites.length;
        tap(sb, html(sb, 'refund-sheet-body'), byId('refund-confirm')); await settle(); await settle();
        assert.equal(sb.__dbWrites.length, before);
        assert.match(String(el(sb, 'refund-sheet-error').textContent), /didn't go through\. Nothing was changed/);
    });
});

describe('F. THE DEFAULT STATE: no fees node, today\'s Desk', () => {
    test('F1 the Paid checkbox, the old note, no tiles, no pay buttons', () => {
        const sb = arriveOwner(individual());
        fireRegistrations(sb, { e2: { fullName: 'Sam Ortiz', email: 's@example.com', phone: '6025550143', createdAt: 2, paid: true }, e3: { fullName: 'Jo Kim', email: 'j@example.com', phone: '6025550144', createdAt: 3 } });
        const list = html(sb, 'registration-list');
        assert.equal((list.match(/type="checkbox"/g) || []).length, 2, 'positive: today\'s checkbox, once per row');
        assert.ok(!/reg-pay-btn|reg-refund-btn/.test(list));
        assert.ok(!/pay-tiles/.test(html(sb, 'registration-counts')));
        assert.equal(el(sb, 'registration-desk-note').textContent, 'Tick Paid when you have the cash, then approve golfers into the field.');
        assert.match(plain(html(sb, 'registration-chips')), /^All 2 Unpaid 1 Paid 1/);
    });
    test('F2 even with no fees, an entry Stripe touched gets no checkbox and no Undo', () => {
        const sb = arriveOwner(individual());
        fireRegistrations(sb, { e1: DESK_REGS.e1 });
        const r = rowOf(sb, 'e1');
        assert.ok(!/type="checkbox"|reg-undo-btn/.test(r));
        assert.match(r, /reg-refund-btn/);
    });
});

describe('G. Refund is the owner\'s, and that is provable with the desk gate switched off', () => {
    test('G1 a signed-out visitor: the page never reads the list, so no rows and no Refund', () => {
        const sb = arriveOwner(individual({ fees: DESK_FEES }), { user: null });
        assert.equal(sb.__dbHandlers.filter((h) => /registrations\/OWN1$/.test(h.path)).length, 0, 'no registrations listener for a visitor');
        assert.ok(!/reg-refund-btn/.test(html(sb, 'registration-list')));
        assert.match(plain(html(sb, 'leaderboard-list')), /Al Lopez|No scores yet/, 'positive: the visitor does get the board');
    });
    test('G2 ISOLATION: desk gate stubbed open, a signed-in NON-owner still gets no Refund; the owner (clean case) does', () => {
        const sb = arriveOwner(individual({ fees: DESK_FEES }));
        fireRegistrations(sb, DESK_REGS);
        assert.match(html(sb, 'registration-list'), /reg-refund-btn/, 'clean case: the owner sees Refund');
        const handler = sb.__dbHandlers.find((h) => h.event === 'value' && /registrations\/OWN1$/.test(h.path));
        sb.registrationAllowed = () => true;                                   // the PRIMARY gate, switched off
        sb.__auth.setUser({ uid: 'u-stranger', email: 's@example.com', isAnonymous: false });
        handler.cb({ val: () => clone(DESK_REGS), exists: () => true });        // the rows render anyway
        const list = html(sb, 'registration-list');
        assert.match(list, /data-entry-id="e1"/, 'the rows did render with the gate off');
        assert.ok(!/reg-refund-btn/.test(list), 'the row-level owner check alone keeps Refund off');
    });
});

describe('H. M4: the Entry fees card', () => {
    test('H1 allow-listed owner: the card toggle, cash toggle and Stripe box (TEST MODE)', async () => {
        const sb = arriveOwner(record({ fees: FEES }), { reads: { 'payments/allowedOwners/u-org': true } });
        await settle(); fireRecord(sb, record({ fees: FEES }));
        const card = html(sb, 'entry-fees-block');
        assert.match(card, /id="fees-card"/); assert.match(card, /id="fees-cash"/);
        assert.match(plain(card), /Collect entry fees by card/); assert.match(plain(card), /STRIPE CONNECTED/); assert.match(plain(card), /TEST MODE/);
        assert.equal(shown(sb, 'entry-fees-block'), true);
    });
    test('H2 not allow-listed: no card toggle, "Card payments coming soon"', async () => {
        const sb = arriveOwner(record({ fees: FEES }), { reads: { 'payments/allowedOwners/u-org': null } });
        await settle(); fireRecord(sb, record({ fees: FEES }));
        const card = html(sb, 'entry-fees-block');
        assert.ok(!/id="fees-card"/.test(card)); assert.ok(!/STRIPE CONNECTED/.test(card));
        assert.match(plain(card), /Card payments coming soon/);
        assert.match(plain(card), /Entry fees/, 'positive: the card itself is there');
    });
    // RE-PINNED 2026-11-11 (Manny: ONE entry fee field). The card has no box of
    // its own: it reads entryFee / entryFeePer (Setup > Event details) and mirrors
    // the integer cents the server reads into fees.entryFeeCents.
    test('H3 the card reads the one fee: $85.50 per golfer -> "85.50 per golfer" and fees.entryFeeCents 8550 mirrored; a per-team fee turns cards off; no fee box of its own', async () => {
        const sb = arriveOwner(record({ fees: FEES, entryFee: 85.5, entryFeePer: 'golfer' }), { reads: { 'payments/allowedOwners/u-org': true } });
        await settle(); fireRecord(sb, record({ fees: FEES, entryFee: 85.5, entryFeePer: 'golfer' }));
        const card = html(sb, 'entry-fees-block');
        assert.ok(!/id="fees-dollars"/.test(card), 'no second fee box');
        assert.match(plain(card), /Entry fee set under Event details \$85\.50 per golfer/);
        const feeWrites = () => sb.__dbWrites.filter((w) => /^tournaments\/OWN1\/fees/.test(w.path));
        assert.deepEqual(clone(feeWrites().map((w) => [w.op, w.value])), [['update', { entryFeeCents: 8550 }]], 'the cents the server reads, mirrored once');
        const team = arriveOwner(record({ fees: FEES, entryFee: 400, entryFeePer: 'team' }), { reads: { 'payments/allowedOwners/u-org': true } });
        await settle(); fireRecord(team, record({ fees: FEES, entryFee: 400, entryFeePer: 'team' }));
        assert.match(plain(html(team, 'entry-fees-block')), /\$400 per team/);
        assert.match(plain(html(team, 'entry-fees-block')), /This fee is per team, so cards stay off/);
        const w = team.__dbWrites.filter((x) => /^tournaments\/OWN1\/fees/.test(x.path));
        assert.deepEqual(clone(w.map((x) => [x.op, x.value])), [['update', { entryFeeCents: null, collectByCard: false }]]);
    });
    test('H4 the card toggle writes fees/collectByCard only for an allow-listed owner', async () => {
        const ok = arriveOwner(record({ fees: FEES }), { reads: { 'payments/allowedOwners/u-org': true } });
        await settle(); fireRecord(ok, record({ fees: FEES }));
        el(ok, 'fees-card').checked = false; tap(ok, html(ok, 'entry-fees-block'), byId('fees-card'), 'fees-card');
        assert.deepEqual(clone(ok.__dbWrites.filter((w) => /fees\/collectByCard$/.test(w.path)).map((w) => w.value)), [false]);
    });
    test('H5 a visitor sees no fees card', () => {
        const sb = arriveOwner(record({ fees: FEES }), { user: null });
        assert.equal(html(sb, 'entry-fees-block'), ''); assert.equal(shown(sb, 'entry-fees-block'), false);
    });
});

describe('I. M1 web part: the organizer\'s event-day panel', () => {
    const PAR = 4;
    const scores = {}; [1, 2, 3].forEach((h) => { scores['team1_h' + h] = PAR - 1; }); [1, 2, 3, 4, 5].forEach((h) => { scores['team3_h' + h] = PAR - 1; });
    const day = () => record({ payoutSpots: [600, 250], scores, teams: {
        team1: { num: 1, name: 'Team 7', players: ['Ann Alpha'], handicap: 0 },
        team2: { num: 2, name: 'Team 15', players: ['Bo Bravo'], handicap: 0 },
        team3: { num: 3, name: 'Team 9', players: ['Cal Charlie'], handicap: 0 } } });
    test('I1 owner: posting count, quiet 40+ min from what this phone saw, no-scores team, prizes from the saved spots, desk counts', () => {
        const seed = { 'hpEventDaySeen:OWN1': JSON.stringify({ team1: { thru: 3, at: Date.now() - 41 * 60 * 1000 } }) };
        const sb = arriveOwner(day(), { seed });
        fireRegistrations(sb, { d1: { fullName: 'Ann Alpha', email: 'a@example.com', phone: '602-555-0100', createdAt: 1, teamNum: 1, approvedAt: 2, paid: true } });
        const p = plain(html(sb, 'event-day-panel'));
        assert.match(p, /2 of 3 teams posting/);
        assert.match(p, /1 quiet 40\+ min/);
        assert.match(p, /Team 7 · last score \d+:\d\d, thru 3/);
        assert.match(p, /Team 15 · no scores yet/);
        // Re-pinned 2026-11-11: prizes read as pro shop credit (main, no cash prizes).
        assert.match(p, /1st Team 9 \$600 pro shop credit/); assert.match(p, /2nd Team 7 \$250 pro shop credit/);
        assert.match(p, /1 of 1 in the field · 1 paid · 0 unpaid/);
        assert.match(html(sb, 'event-day-panel'), /href="sms:6025550100"/);
    });
    test('I2 a team that just moved is not quiet', () => {
        const sb = arriveOwner(day(), { seed: { 'hpEventDaySeen:OWN1': '{}' } });
        assert.ok(!/quiet 40\+ min/.test(html(sb, 'event-day-panel')));
        assert.match(plain(html(sb, 'event-day-panel')), /2 of 3 teams posting/);
    });
    test('I3 the prize summary is the Prize Results list a watcher reads (same engine, same saved spots)', () => {
        const watcher = arriveOwner(day(), { user: null });
        const fromResults = plain(html(watcher, 'payout-results')).replace(/ — /g, ' ');
        // Re-pinned 2026-11-11: prizes read as pro shop credit (main, no cash prizes).
        assert.match(fromResults, /1st Team 9 \$600 pro shop credit 2nd Team 7 \$250 pro shop credit/);
        const owner = arriveOwner(day());
        assert.ok(plain(html(owner, 'event-day-panel')).indexOf(fromResults) !== -1, 'the panel carries the same lines');
    });
    test('I4 a visitor sees no panel', () => {
        const sb = arriveOwner(day(), { user: null });
        assert.equal(html(sb, 'event-day-panel'), ''); assert.equal(shown(sb, 'event-day-panel'), false);
    });
});

describe('J. source guards (decoded, each with a positive anchor)', () => {
    const src = decodeEscapes(HTML);
    test('J1 the page never writes paidVia stripe, ref, amountCents or any refund field', () => {
        const at = src.indexOf('// ===== STRIPE PHASE 1, TEST MODE');
        assert.ok(at !== -1, 'the block exists');
        const block = src.slice(at, src.indexOf('// ===== SCORING-LINK KEYS', at));
        assert.match(block, /paidVia: 'cash'/, 'positive: the cash write is here');
        assert.ok(!/paidVia:\s*'stripe'/.test(block));
        assert.ok(!/[{,]\s*(ref|amountCents|refundedAt|refundCents|refundRef|refundPendingAt|disputedAt|checkoutAt)\s*:/.test(block.replace(/\/\/[^\n]*/g, '')), 'no server-only key is written');
        assert.match(block, /\{ paid: true, paidAt: Date\.now\(\), paidVia: 'cash' \}/, 'positive: the object-literal shape the scan looks for is real');
    });
    test('J2 the functions SDK is vendored, pinned, and loaded on demand - not a blocking tag', () => {
        const buf = fs.readFileSync(path.join(REPO_ROOT, 'firebase-functions-compat.js'));
        assert.equal(buf.length, 8189);
        assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), '5e5a11259cdffcf04b4fc29413624bb92cc31829f46348affbafef7da12ac7c2');
        assert.match(buf.toString('utf8'), /"@firebase\/functions-compat","0\.3\.5"/);
        assert.ok(!/<script src="\.?\/?firebase-functions-compat\.js"/.test(HTML), 'not a blocking tag');
        assert.match(src, /s\.src = '\.\/firebase-functions-compat\.js'/, 'positive: the lazy loader names it');
    });
});
