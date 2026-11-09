// ============================================================================
// E1 sendAnnouncement - THE PURE RULES, THE HANDLER ON THE DB EMULATOR, AND
// THE DEPLOYED WRAPPER (2026-11-09)
//
// WHAT RUNS: no Functions emulator and no real FCM, ever.
//   (a) stripe-functions/announce-core.js, pure.
//   (b) handlers-announce.js makeAnnounceHandlers() with a real firebase-admin
//       Database on the RTDB emulator (local port 9562, nothing live) and a
//       RECORDING messaging mock - sendEachForMulticast is recorded and
//       answers a successCount the test chooses, so pushed: n is proven to be
//       FCM's count and not the token count.
//   (c) index.js's exported sendAnnouncement: its options (region, no Stripe
//       secret bound) and its refusals through .run(), on firebase-admin's
//       default app pointed at the emulator. A success through (c) would reach
//       real FCM, so it is never driven.
// The emulator namespace carries the E1 CANDIDATE rules, though the Admin SDK
// bypasses them (as it will in production).
//
// Skipped when stripe-functions/node_modules is missing (npm --prefix
// stripe-functions ci) or the emulator jar / Java is missing; a skip proves
// nothing.
//
// BASELINE (final file, branch event-e1e3; against cf86caf8, which has no
// announce-core.js / handlers-announce.js / sendAnnouncement; measured in an
// exported copy of cf86caf8 with this file copied in): all 11 tests:
// 0 PASS / 11 FAIL (C1/C2 require a missing file; the before hook's require
// throws, so H1-H7 and X1-X2 are red).
// Against the finished code: all 11 tests: 11 PASS / 0 FAIL.
// Code negative controls (10, saved copy + sha + RESTORED-OK): 10 of 10 caught.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const FN = path.join(__dirname, 'stripe-functions');
const HAS_MODULES = ['firebase-admin', 'firebase-functions'].every((m) => fs.existsSync(path.join(FN, 'node_modules', m)));
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
// The pure tests need neither.
const req = (f) => require(path.join(FN, f));

const PORT = 9562, HOST = '127.0.0.1:' + PORT, BASE = 'http://' + HOST;
const NS = 'e1handlers', NSW = 'e1wrap';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adminRest = async (ns, method, p, body) => (await fetch(`${BASE}/${p}.json?ns=${ns}`, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) })).json();

const WEATHER = 'Lightning in the area. Horn sounded: stop play, mark your ball, head to the clubhouse.';
const SEED = () => ({
    tournaments: {
        E1T: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1,
            announcements: {
                aW: { text: WEATHER, tpl: 'weather', at: 10, by: 'u-org' },
                aS: { text: 'Shotgun start at 8:00 AM. Head to your starting hole. Good luck!', tpl: 'start', at: 9, by: 'u-org' },
                aDone: { text: 'Already out.', tpl: 'custom', at: 8, by: 'u-org', pushed: 3 },
                aBad: { text: 'x'.repeat(201), tpl: 'custom', at: 8, by: 'u-org' }
            } },
        QUIET: { name: 'No Followers Open', ownerUid: 'u-org', createdAt: 1, announcements: { a1: { text: 'Hello field.', tpl: 'custom', at: 1, by: 'u-org' } } },
        BIG: { name: 'Big Field', ownerUid: 'u-org', createdAt: 1, announcements: { a1: { text: 'Hello field.', tpl: 'custom', at: 1, by: 'u-org' } } }
    },
    tournamentFollowers: {
        E1T: { 'u-fan': { at: 1, team: 'team4' }, 'u-off': { at: 1, team: 'team4' }, 'u-none': { at: 1, team: 'team7' }, 'u-two': { at: 1, team: 'gab12' }, 'u-blank': { at: 1, team: 'team9' } },
        BIG: Object.fromEntries(Array.from({ length: 520 }, (_, i) => ['u' + i, { at: 1, team: 'team1' }]))
    },
    pushTokens: Object.assign({
        'u-fan': { d1: { token: 'tok-fan', playerId: 'p1', at: 1 } },
        'u-off': { d1: { token: 'tok-off', playerId: 'p2', at: 1 } },
        'u-two': { d1: { token: 'tok-two-a', playerId: 'p3', at: 1 }, d2: { token: 'tok-fan', playerId: 'p3', at: 1 }, d3: { playerId: 'p3', at: 1 } },
        'u-blank': { d1: { token: 'tok-blank', playerId: 'p4', at: 1 } }
    }, Object.fromEntries(Array.from({ length: 520 }, (_, i) => ['u' + i, { d: { token: 'tok-' + i, playerId: 'p', at: 1 } }]))),
    pushPrefs: { 'u-off': { essentials: false, bets: true }, 'u-blank': { bets: false, hype: false } }
});

function mockMessaging(successOf) {
    const calls = [];
    return { calls, sendEachForMulticast: async (msg) => { calls.push(JSON.parse(JSON.stringify(msg))); return { successCount: successOf ? successOf(msg) : msg.tokens.length, failureCount: 0, responses: [] }; } };
}

let emu, admin, db, makeAnnounceHandlers, AnnounceError;
const reseed = async (ns) => adminRest(ns || NS, 'PUT', '', SEED());
const read = async (p, ns) => adminRest(ns || NS, 'GET', p);
async function refused(p, reason) {
    await assert.rejects(p, (e) => { assert.ok(e instanceof AnnounceError, String(e)); assert.equal(e.reason, reason); return true; });
}

before(async () => {
    if (SKIP.skip) return;
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = HOST;
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-e1', databaseURL: `${BASE}?ns=${NSW}` });
    process.env.GCLOUD_PROJECT = 'demo-e1';
    process.env.STRIPE_SECRET_KEY = 'sk_test_FAKE';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_FAKE';
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    const cand = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox', 'TOURNAMENTS-E1-RULES-CANDIDATE.json');
    if (fs.existsSync(cand)) for (const ns of [NS, NSW]) await fetch(`${BASE}/.settings/rules.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(cand, 'utf8').split('[^@\\\\s]').join('[^@ ]') });
    admin = req('node_modules/firebase-admin');
    ({ makeAnnounceHandlers, AnnounceError } = req('handlers-announce.js'));
    const app = admin.initializeApp({ projectId: 'demo-e1', databaseURL: `${BASE}?ns=${NS}` }, 'e1-handlers-test');
    db = app.database();
});
after(async () => {
    try { if (admin) await Promise.all(admin.apps.map((a) => a.delete())); } catch (e) { /* closing */ }
    if (emu) emu.kill();
});

// ---------------------------------------------------------------- (a) pure
test('C1. announce-core.js is pure and its planner refuses in order: unauthenticated, not-found, not-owner, bad-announcement, already-sent', () => {
    const src = fs.readFileSync(path.join(FN, 'announce-core.js'), 'utf8');
    assert.ok(!/require\(/.test(src), 'no require in the pure core');
    const C = req('announce-core.js');
    const t = { ownerUid: 'u-org' }, a = { text: 'Hi', tpl: 'custom', at: 1 };
    assert.deepEqual(C.planSend({ uid: null, tournament: t, announcement: a }), { ok: false, reason: 'unauthenticated' });
    assert.deepEqual(C.planSend({ uid: 'u-org', tournament: null, announcement: a }), { ok: false, reason: 'not-found' });
    assert.deepEqual(C.planSend({ uid: 'u-org', tournament: t, announcement: null }), { ok: false, reason: 'not-found' });
    assert.deepEqual(C.planSend({ uid: 'u-who', tournament: t, announcement: a }), { ok: false, reason: 'not-owner' });
    assert.deepEqual(C.planSend({ uid: 'u-org', tournament: {}, announcement: a }), { ok: false, reason: 'not-owner' });
    for (const bad of [{ text: '', tpl: 'custom', at: 1 }, { text: 'x'.repeat(201), tpl: 'custom', at: 1 }, { text: 'Hi', tpl: 'chat', at: 1 }, { text: 'Hi', tpl: 'custom' }])
        assert.deepEqual(C.planSend({ uid: 'u-org', tournament: t, announcement: bad }), { ok: false, reason: 'bad-announcement' }, JSON.stringify(bad));
    assert.deepEqual(C.planSend({ uid: 'u-org', tournament: t, announcement: Object.assign({ pushed: 0 }, a) }), { ok: false, reason: 'already-sent' });
    assert.deepEqual(C.planSend({ uid: 'u-org', tournament: t, announcement: a }), { ok: true });
    assert.equal(C.parseAnnounceRef({ code: 'E1T', id: 'a1' }).code, 'E1T');
    for (const bad of [null, {}, { code: 'E1T' }, { code: 'E/1', id: 'a' }, { code: 'E1T', id: 'a.b' }, { code: 5, id: 'a' }]) assert.equal(C.parseAnnounceRef(bad), null, JSON.stringify(bad));
    assert.equal(C.ERROR_CODES['rate-limited'], 'resource-exhausted');
    assert.equal(C.ERROR_CODES['not-owner'], 'permission-denied');
});

test('C2. the minute, prefs, tokens and the notification: claimMinute aborts inside 60 s; essentials:false is the only pref that refuses; E1b titles', () => {
    const C = req('announce-core.js');
    assert.deepEqual(C.claimMinute(100000)(null), { lastAt: 100000 });
    assert.equal(C.claimMinute(100000)({ lastAt: 40001 }), undefined, '59.999 s later aborts');
    assert.deepEqual(C.claimMinute(100000)({ lastAt: 40000 }), { lastAt: 100000 }, 'exactly 60 s later claims');
    assert.equal(C.pushAllowed(null), true); assert.equal(C.pushAllowed({ bets: false, hype: false }), true);
    assert.equal(C.pushAllowed({ essentials: false }), false); assert.equal(C.pushAllowed({ essentials: true }), true);
    assert.deepEqual(C.tokensOf({ a: { token: 't1' }, b: { playerId: 'x' }, c: { token: '' }, d: { token: 'x'.repeat(401) }, e: null }), ['t1']);
    assert.deepEqual(C.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.equal(C.pushTitle('Rattle Classic', 'weather'), 'Rattle Classic: play suspended');
    assert.equal(C.pushTitle('Rattle Classic', 'start'), 'Rattle Classic');
    assert.deepEqual(C.pushMessage(['t'], { code: 'E1T', id: 'a1', tpl: 'start', text: 'Go', eventName: 'Rattle Classic' }),
        { tokens: ['t'], notification: { title: 'Rattle Classic', body: 'Go' }, data: { kind: 'tournament-announcement', code: 'E1T', id: 'a1' } });
});

// ---------------------------------------------------------------- (b) handler on the emulator
test('H1. owner sends: followers -> prefs -> tokens (deduped, essentials-off skipped, token-less skipped), one multicast, pushed = FCM successCount', SKIP, async () => {
    await reseed();
    const m = mockMessaging((msg) => msg.tokens.length - 1);   // one token "fails": pushed must be FCM's number
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 1000000 });
    const out = await h.sendAnnouncement({ code: 'E1T', id: 'aW' }, { uid: 'u-org' });
    assert.equal(m.calls.length, 1);
    assert.deepEqual(m.calls[0].tokens.slice().sort(), ['tok-blank', 'tok-fan', 'tok-two-a']);
    assert.ok(!m.calls[0].tokens.includes('tok-off'), 'essentials:false gets no notification');
    assert.deepEqual(m.calls[0].notification, { title: 'Rattle Classic: play suspended', body: WEATHER });
    assert.deepEqual(m.calls[0].data, { kind: 'tournament-announcement', code: 'E1T', id: 'aW' });
    assert.deepEqual(out, { pushed: 2 });
    assert.equal(await read('tournaments/E1T/announcements/aW/pushed'), 2);
    assert.deepEqual(await read('announcementSends/E1T'), { lastAt: 1000000 });
    assert.equal((await read('tournaments/E1T/announcements/aW')).text, WEATHER, 'the note itself is untouched');
});

test('H2. refusals write nothing and send nothing: unauthenticated, non-owner, bad ref, missing event / note, malformed note, already pushed', SKIP, async () => {
    await reseed();
    const m = mockMessaging();
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 1000000 });
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aW' }, {}), 'unauthenticated');
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aW' }, { uid: 'u-who' }), 'not-owner');
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aW' }, { uid: 'u-fan' }), 'not-owner');
    await refused(h.sendAnnouncement({ code: 'E1T' }, { uid: 'u-org' }), 'not-found');
    await refused(h.sendAnnouncement({ code: 'NOPE', id: 'aW' }, { uid: 'u-org' }), 'not-found');
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aNone' }, { uid: 'u-org' }), 'not-found');
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aBad' }, { uid: 'u-org' }), 'bad-announcement');
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aDone' }, { uid: 'u-org' }), 'already-sent');
    assert.equal(m.calls.length, 0, 'nothing sent');
    assert.equal(await read('tournaments/E1T/announcements/aW/pushed'), null);
    assert.equal(await read('tournaments/E1T/announcements/aDone/pushed'), 3);
    assert.equal(await read('announcementSends/E1T'), null, 'a refusal does not spend the minute');
});

test('H3. rate limit, counted on the server: a second send inside 60 s is refused and sends nothing; at 60 s it goes', SKIP, async () => {
    await reseed();
    let clock = 5000000;
    const m = mockMessaging();
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => clock });
    assert.deepEqual(await h.sendAnnouncement({ code: 'E1T', id: 'aS' }, { uid: 'u-org' }), { pushed: 3 });
    clock += 59999;
    await refused(h.sendAnnouncement({ code: 'E1T', id: 'aW' }, { uid: 'u-org' }), 'rate-limited');
    assert.equal(m.calls.length, 1);
    assert.equal(await read('tournaments/E1T/announcements/aW/pushed'), null, 'the refused note has no pushed');
    clock += 1;
    assert.deepEqual(await h.sendAnnouncement({ code: 'E1T', id: 'aW' }, { uid: 'u-org' }), { pushed: 3 });
    assert.equal(m.calls.length, 2);
    // per EVENT: another event is not held by this one's minute
    assert.deepEqual(await h.sendAnnouncement({ code: 'QUIET', id: 'a1' }, { uid: 'u-org' }), { pushed: 0 });
});

test('H4. no followers / no tokens: pushed 0 is written, FCM is never called', SKIP, async () => {
    await reseed();
    const m = mockMessaging();
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 7000000 });
    assert.deepEqual(await h.sendAnnouncement({ code: 'QUIET', id: 'a1' }, { uid: 'u-org' }), { pushed: 0 });
    assert.equal(m.calls.length, 0);
    assert.equal(await read('tournaments/QUIET/announcements/a1/pushed'), 0);
});

test('H5. prefs off for EVERY follower with a token: nobody is notified', SKIP, async () => {
    await reseed();
    for (const u of ['u-fan', 'u-two', 'u-blank']) await adminRest(NS, 'PUT', 'pushPrefs/' + u, { essentials: false });
    const m = mockMessaging();
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 8000000 });
    assert.deepEqual(await h.sendAnnouncement({ code: 'E1T', id: 'aS' }, { uid: 'u-org' }), { pushed: 0 });
    assert.equal(m.calls.length, 0);
});

test('H6. 520 followers: two multicasts (500 + 20), pushed is their summed success', SKIP, async () => {
    await reseed();
    const m = mockMessaging();
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 9000000 });
    assert.deepEqual(await h.sendAnnouncement({ code: 'BIG', id: 'a1' }, { uid: 'u-org' }), { pushed: 520 });
    assert.deepEqual(m.calls.map((c) => c.tokens.length), [500, 20]);
    assert.equal(m.calls[0].notification.title, 'Big Field');
});

test('H7. a multicast that throws is logged, not fatal: pushed counts only what FCM accepted', SKIP, async () => {
    await reseed();
    const logs = [];
    let n = 0;
    const m = { calls: [], sendEachForMulticast: async (msg) => { n++; if (n === 1) throw new Error('fcm down'); return { successCount: msg.tokens.length }; } };
    const h = makeAnnounceHandlers({ db, messaging: m, now: () => 9500000, log: (...a) => logs.push(a.join(' ')) });
    assert.deepEqual(await h.sendAnnouncement({ code: 'BIG', id: 'a1' }, { uid: 'u-org' }), { pushed: 20 });
    assert.ok(logs.some((l) => /fcm down/.test(l)));
});

// ---------------------------------------------------------------- (c) index.js
test('X1. index.js exports sendAnnouncement beside the three Stripe functions: us-central1, a callable, NO Stripe secret bound', SKIP, async () => {
    const m = req('index.js');
    // RE-PINNED at the event-tools merge (2026-11-09): E4 adds approvePhoto, hidePhoto, photoLinks, reportPhoto.
    assert.deepEqual(Object.keys(m).sort(), ['approvePhoto', 'createEntryCheckout', 'hidePhoto', 'photoLinks', 'refundEntry', 'reportPhoto', 'sendAnnouncement', 'stripeWebhook']);
    const ep = m.sendAnnouncement.__endpoint;
    assert.deepEqual(ep.region, ['us-central1']);
    assert.ok(ep.callableTrigger);
    assert.ok(!ep.secretEnvironmentVariables || ep.secretEnvironmentVariables.length === 0, 'no secret on sendAnnouncement');
});

test('X2. index.js sendAnnouncement refusals carry details.reason: unauthenticated, not-owner, rate-limited (driven through .run on the emulator)', SKIP, async () => {
    const m = req('index.js');
    await reseed(NSW);
    await adminRest(NSW, 'PUT', 'announcementSends/E1T', { lastAt: Date.now() });
    const reason = async (p) => { try { await p; return 'resolved'; } catch (e) { return e.code + '/' + (e.details && e.details.reason); } };
    assert.equal(await reason(m.sendAnnouncement.run({ data: { code: 'E1T', id: 'aW' }, rawRequest: { headers: {} } })), 'unauthenticated/unauthenticated');
    assert.equal(await reason(m.sendAnnouncement.run({ data: { code: 'E1T', id: 'aW' }, auth: { uid: 'u-who' }, rawRequest: { headers: {} } })), 'permission-denied/not-owner');
    assert.equal(await reason(m.sendAnnouncement.run({ data: { code: 'E1T', id: 'aW' }, auth: { uid: 'u-org' }, rawRequest: { headers: {} } })), 'resource-exhausted/rate-limited');
    assert.equal(await reason(m.sendAnnouncement.run({ data: { code: 'E1T', id: 'aDone' }, auth: { uid: 'u-org' }, rawRequest: { headers: {} } })), 'already-exists/already-sent');
});
