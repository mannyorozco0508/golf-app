// ============================================================================
// /api/card-turn-in - the server handler (functions/api/_turnin.js) with a fake
// KV and a stubbed network. No test here makes a network call: every fetch goes
// to the scripted stub below, and an unexpected URL fails the test.
//
// C (ADVISOR-20261118-1533, Manny's pick 2026-11-18): a golfer's phone sends
// the scanner's read of the group's paper card; it waits in the scanner's KV
// (metadata = sender, time, state; value = the read; the photo beside it)
// until the organizer approves or declines it on the Desk. Nothing here writes
// a score, anywhere - the page does that, through the corrector, on Approve.
//
// What is held: inert not_configured; the token (anonymous verifies); send
// needs the event and the owner's switch, 3 a minute, bounded sizes, a shaped
// read; status is public and carries no read, photo or uid; list / read /
// photo / approve / decline are the owner's and nobody else's; the route and
// the catch-all row; HTTP statuses.
//
// BASELINE against pre-build main fc9680e7 (no functions/api/_turnin.js, no
// card-turn-in.js), this file copied there and run: the handler cannot load,
// so need() fails every test: 0 pass / 18 fail / 0 cancelled of 18 (the load
// failure is asserted, not thrown). On preview-card-turnin: 18 / 0.
// ============================================================================
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const API = path.join(REPO_ROOT, 'functions', 'api');
let T = null, S = null, ROUTE = null, CATCH = null, loadError = null;
before(async () => {
    try {
        T = await import(pathToFileURL(path.join(API, '_turnin.js')).href);
        S = await import(pathToFileURL(path.join(API, '_scan.js')).href);
        ROUTE = await import(pathToFileURL(path.join(API, 'card-turn-in.js')).href);
        CATCH = await import(pathToFileURL(path.join(API, '[[path]].js')).href);
    } catch (e) { loadError = e; }
});
const need = () => { if (loadError) assert.fail('could not load the turn-in handler: ' + loadError.message); };

const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-11-22T17:00:00Z');
const clock = { date: () => new Date(NOW) };
const CODE = 'STK26';
const OWNER = 'u-org', GOLFER = 'anon-golfer-1', OTHER = 'anon-other-2';

// --- a real RSA key, so verification runs for real against a stub JWKS ------
let KEYS = null;
before(async () => {
    const pair = await webcrypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
    KEYS = { pair, jwk: Object.assign({ kid: 'kid-1', alg: 'RS256', use: 'sig' }, jwk) };
});
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function idToken(uid, anonymous) {
    const t = Math.floor(NOW.getTime() / 1000);
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' }));
    const payload = b64u(JSON.stringify({
        iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid,
        iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: anonymous === false ? 'password' : 'anonymous' }
    }));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(header + '.' + payload));
    return header + '.' + payload + '.' + b64u(sig);
}

// --- fake KV: get / put (with metadata + ttl) / getWithMetadata / list / delete ---
function fakeKV() {
    const m = new Map();   // key -> { value, metadata, ttl }
    return {
        m,
        get: async (k) => (m.has(k) ? m.get(k).value : null),
        getWithMetadata: async (k) => (m.has(k) ? { value: m.get(k).value, metadata: m.get(k).metadata || null } : { value: null, metadata: null }),
        put: async (k, v, o) => { m.set(k, { value: String(v), metadata: (o && o.metadata) || null, ttl: o && o.expirationTtl }); },
        delete: async (k) => { m.delete(k); },
        list: async (o) => ({ keys: [...m.keys()].filter((k) => !o || !o.prefix || k.indexOf(o.prefix) === 0).map((k) => ({ name: k, metadata: m.get(k).metadata || null })), list_complete: true })
    };
}

// --- the network: Google's keys and the event's children, as the caller ---
function stubFetch(script) {
    const calls = [];
    const fn = async (url) => {
        const u = String(url);
        calls.push(u);
        const reply = (status, json) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => json });
        if (u.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return reply(200, { keys: [KEYS.jwk] });
        const tr = /^https:\/\/golfapp-9fb21-default-rtdb\.firebaseio\.com\/tournaments\/([^/]+)\/([A-Za-z]+)\.json\?auth=(.+)$/.exec(u);
        if (tr) {
            if (script.tourneyFail) return reply(500, null);
            const rec = (script.tourneys || {})[tr[1]];
            const v = rec ? rec[tr[2]] : null;
            return reply(200, v === undefined ? null : v);
        }
        assert.fail('unexpected network call to ' + u);
    };
    fn.calls = calls;
    return fn;
}
const EVENT_ON = { ownerUid: OWNER, cardTurnIn: true, eventDate: '2026-11-22' };
const EVENT_OFF = { ownerUid: OWNER, eventDate: '2026-11-22' };

// --- a card the scanner read (the live response's result shape) ---
const SCAN = () => ({
    players: [
        { name: 'Dana Ruiz', row_label_as_written: 'Dana R', holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, score: 4 + (i % 3), confidence: i === 6 ? 0.55 : 0.97 })), written_out: 45, written_in: 44, written_total: 89 },
        { name: 'Lee Park', holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, score: 5, confidence: 0.95 })), written_out: null, written_in: null, written_total: 90 }
    ],
    notes: ''
});
const PHOTO = Buffer.from('jpeg bytes of the card photo'.repeat(40)).toString('base64');

async function call(o) {
    const fetch = stubFetch({ tourneys: o.tourneys === undefined ? { [CODE]: EVENT_ON } : o.tourneys, tourneyFail: o.tourneyFail });
    const kv = o.kv || fakeKV();
    const logs = [];
    const out = await T.handleTurnIn({
        env: o.env || {}, kv: o.noKv ? null : kv, fetch, clock: o.clock || clock, log: (l) => logs.push(l),
        method: o.method || 'POST', body: o.body, query: o.query,
        authorization: o.authorization !== undefined ? o.authorization : 'Bearer ' + await idToken(o.uid || GOLFER, o.anonymous)
    });
    return { out, kv, fetch, logs };
}
const SEND = (over) => Object.assign({ action: 'send', code: CODE, sk: 'g2', scan: SCAN(), by: 'Dana', photo: PHOTO }, over || {});
beforeEach(() => { if (S) S.resetKeyCache(); });

// ============================================================================
describe('inert, and who is asking', () => {
    test('no KV binding: not_configured (503), nothing read, nothing stored', async () => {
        need();
        const fetch = stubFetch({});
        const out = await T.handleTurnIn({ env: {}, fetch, clock, log: () => {}, method: 'POST', body: SEND(), authorization: 'Bearer x.y.z' });
        assert.deepEqual(out, { status: 'not_configured' });
        assert.equal(T.statusFor(out), 503);
        assert.equal(fetch.calls.length, 0);
    });
    test('no token, a bad token: refused sign_in (401) before any read', async () => {
        need();
        let r = await call({ body: SEND(), authorization: null });
        assert.deepEqual(r.out, { status: 'refused', reason: 'sign_in' });
        assert.equal(T.statusFor(r.out), 401);
        assert.equal(r.fetch.calls.length, 0);
        r = await call({ body: SEND(), authorization: 'Bearer not.a.jwt' });
        assert.deepEqual(r.out, { status: 'refused', reason: 'sign_in' });
        assert.equal(r.kv.m.size, 0);
    });
});

describe('send: a golfer turns in the card', () => {
    test('an anonymous session, the switch on: stored under turnin:<CODE>:<card> with the sender, the time and the state as metadata, the read as the value, the photo beside it, 21 days', async () => {
        need();
        const r = await call({ body: SEND() });
        assert.equal(r.out.status, 'ok', JSON.stringify(r.out));
        assert.deepEqual(r.out.card, { sk: 'g2', by: 'Dana', at: NOW.getTime(), state: 'sent', decidedAt: 0, photo: true });
        const card = r.kv.m.get('turnin:STK26:g2');
        assert.ok(card, 'the card key');
        assert.deepEqual(card.metadata, { by: 'Dana', at: NOW.getTime(), state: 'sent', decidedAt: 0, photo: true });
        assert.equal(card.ttl, T.TTL_SECONDS);
        const v = JSON.parse(card.value);
        assert.equal(v.uid, GOLFER, 'the sender\'s uid is in the value, for the record, never in an answer');
        assert.equal(v.scan.players.length, 2);
        assert.equal(v.scan.players[0].holes[6].confidence, 0.55);
        assert.equal(v.scan.players[0].written_total, 89);
        const photo = r.kv.m.get('turninphoto:STK26:g2');
        assert.equal(photo.value, PHOTO);
        assert.equal(photo.ttl, T.TTL_SECONDS);
        // The event was asked two things, as the caller: does it exist, is the switch on.
        const reads = r.fetch.calls.filter((u) => u.includes('/tournaments/STK26/'));
        assert.deepEqual(reads.map((u) => /\/([A-Za-z]+)\.json/.exec(u)[1]).sort(), ['cardTurnIn', 'ownerUid']);
        assert.ok(r.logs.length === 1 && !r.logs[0].includes(GOLFER), 'the log line carries no account id');
    });
    test('the switch off (absent) on a real event: refused turnin_off (403), nothing stored', async () => {
        need();
        const r = await call({ body: SEND(), tourneys: { [CODE]: EVENT_OFF } });
        assert.deepEqual(r.out, { status: 'refused', reason: 'turnin_off' });
        assert.equal(T.statusFor(r.out), 403);
        assert.equal([...r.kv.m.keys()].filter((k) => k.startsWith('turnin:STK26')).length, 0);
    });
    test('no such event: refused no_event (404); the event unreadable: unavailable network (503)', async () => {
        need();
        let r = await call({ body: SEND({ code: 'NOPE99' }) });
        assert.deepEqual(r.out, { status: 'refused', reason: 'no_event' });
        assert.equal(T.statusFor(r.out), 404);
        r = await call({ body: SEND(), tourneyFail: true });
        assert.deepEqual(r.out, { status: 'unavailable', reason: 'network' });
        assert.equal(T.statusFor(r.out), 503);
    });
    test('the body is checked for free, before the event is read: a bad code, a bad card id, a shapeless read, a 31 on a hole, a non-string photo', async () => {
        need();
        for (const bad of [SEND({ code: 'st' }), SEND({ sk: 'g2/../x' }), SEND({ scan: { players: 'x' } }), SEND({ scan: { players: [] } }), SEND({ photo: 12 }),
            SEND({ scan: { players: [{ name: 'A', holes: [{ hole: 1, score: 31 }] }] } }), SEND({ scan: { players: [{ name: 'A', holes: [{ hole: 19, score: 4 }] }] } })]) {
            const r = await call({ body: bad });
            assert.deepEqual(r.out, { status: 'refused', reason: 'bad_request' }, JSON.stringify(bad).slice(0, 80));
            assert.equal(r.fetch.calls.filter((u) => u.includes('/tournaments/')).length, 0, 'no event read for a bad body');
            assert.equal(r.kv.m.size, 0);
        }
        assert.equal(T.statusFor({ status: 'refused', reason: 'bad_request' }), 400);
    });
    test('too big: a photo over ~660 KB or a read over 60 KB is refused too_big (413) for free', async () => {
        need();
        let r = await call({ body: SEND({ photo: 'A'.repeat(T.MAX_PHOTO_CHARS + 4) }) });
        assert.deepEqual(r.out, { status: 'refused', reason: 'too_big' });
        assert.equal(T.statusFor(r.out), 413);
        const fat = SCAN(); fat.notes = 'x'.repeat(T.MAX_SCAN_CHARS);
        r = await call({ body: SEND({ scan: fat }) });
        assert.deepEqual(r.out, { status: 'refused', reason: 'too_big' });
        assert.equal(r.fetch.calls.filter((u) => u.includes('/tournaments/')).length, 0);
    });
    test('the read is cleaned, not copied: unknown fields dropped, names cut at 80, a blank score kept as null, confidence clamped to 0..1', async () => {
        need();
        const scan = SCAN();
        scan.players[0].extra = { anything: true };
        scan.players[0].name = 'N'.repeat(100);
        scan.players[0].holes[0] = { hole: 1, score: null, confidence: 7, junk: 1 };
        const r = await call({ body: SEND({ scan, photo: undefined, by: ' Dana  ' }) });
        assert.equal(r.out.status, 'ok');
        const v = JSON.parse(r.kv.m.get('turnin:STK26:g2').value);
        assert.equal(v.scan.players[0].extra, undefined);
        assert.equal(v.scan.players[0].name.length, 80);
        assert.deepEqual(v.scan.players[0].holes[0], { hole: 1, score: null, confidence: 1 });
        assert.equal(r.out.card.by, 'Dana');
        assert.equal(r.out.card.photo, false);
        assert.ok(!r.kv.m.has('turninphoto:STK26:g2'), 'no photo key without a photo');
    });
    test('3 sends a minute per account: the 4th is rate_limited (429); a re-send replaces the earlier read and photo', async () => {
        need();
        const kv = fakeKV();
        for (let i = 0; i < 3; i++) {
            const r = await call({ kv, body: SEND({ sk: 'g' + (i + 1) }) });
            assert.equal(r.out.status, 'ok', 'send ' + (i + 1));
        }
        let r = await call({ kv, body: SEND({ sk: 'g4' }) });
        assert.deepEqual(r.out, { status: 'refused', reason: 'rate_limited' });
        assert.equal(T.statusFor(r.out), 429);
        assert.ok(!kv.m.has('turnin:STK26:g4'));
        // Another account, the next minute: a re-send of g1 without a photo drops the old photo.
        const later = { date: () => new Date(NOW.getTime() + 61000) };
        assert.ok(kv.m.has('turninphoto:STK26:g1'));
        r = await call({ kv, clock: later, uid: OTHER, body: SEND({ sk: 'g1', photo: null, by: 'Lee' }) });
        assert.equal(r.out.status, 'ok');
        assert.equal(kv.m.get('turnin:STK26:g1').metadata.by, 'Lee');
        assert.ok(!kv.m.has('turninphoto:STK26:g1'), 'the earlier photo is gone with the re-send');
    });
});

describe('status: what a golfer may see', () => {
    test('GET ?code&sk: the card\'s state, sender and times - never the read, the photo or the uid; a card nobody sent is no_card (404)', async () => {
        need();
        const kv = fakeKV();
        await call({ kv, body: SEND() });
        let r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g2' }, uid: OTHER });
        assert.deepEqual(r.out, { status: 'ok', card: { sk: 'g2', by: 'Dana', at: NOW.getTime(), state: 'sent', decidedAt: 0, photo: true } });
        assert.ok(!JSON.stringify(r.out).includes(GOLFER));
        assert.equal(r.fetch.calls.filter((u) => u.includes('/tournaments/')).length, 0, 'a status read asks the database nothing');
        r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g9' } });
        assert.deepEqual(r.out, { status: 'refused', reason: 'no_card' });
        assert.equal(T.statusFor(r.out), 404);
    });
});

describe('the owner\'s side: list, read, photo, approve, decline', () => {
    async function seeded() {
        const kv = fakeKV();
        await call({ kv, body: SEND({ sk: 'g2' }) });
        await call({ kv, uid: OTHER, body: SEND({ sk: 'team4', by: 'Al', photo: null }) });
        return kv;
    }
    test('list: the owner gets every card of the event from the keys\' metadata (one list call, no reads), oldest first, without reads or photos', async () => {
        need();
        const kv = await seeded();
        const r = await call({ kv, method: 'GET', query: { code: CODE }, uid: OWNER, anonymous: false });
        assert.equal(r.out.status, 'ok', JSON.stringify(r.out));
        assert.deepEqual(r.out.cards.map((c) => c.sk), ['g2', 'team4']);
        assert.deepEqual(r.out.cards[1], { sk: 'team4', by: 'Al', at: NOW.getTime(), state: 'sent', decidedAt: 0, photo: false });
        assert.ok(!JSON.stringify(r.out).includes('"scan"') && !JSON.stringify(r.out).includes(PHOTO.slice(0, 20)));
        const reads = r.fetch.calls.filter((u) => u.includes('/tournaments/STK26/'));
        assert.deepEqual(reads.map((u) => /\/([A-Za-z]+)\.json/.exec(u)[1]), ['ownerUid'], 'the owner check, nothing else');
    });
    test('list, read, photo, approve and decline are refused not_owner (403) for a golfer, and for a signed-in stranger', async () => {
        need();
        const kv = await seeded();
        for (const who of [{ uid: GOLFER }, { uid: 'stranger', anonymous: false }]) {
            for (const req of [
                { method: 'GET', query: { code: CODE } },
                { method: 'GET', query: { code: CODE, sk: 'g2', read: '1' } },
                { method: 'GET', query: { code: CODE, sk: 'g2', photo: '1' } },
                { body: { action: 'approve', code: CODE, sk: 'g2' } },
                { body: { action: 'decline', code: CODE, sk: 'g2' } }]) {
                const r = await call(Object.assign({ kv }, who, req));
                assert.deepEqual(r.out, { status: 'refused', reason: 'not_owner' }, JSON.stringify(req));
            }
        }
        assert.equal(T.statusFor({ status: 'refused', reason: 'not_owner' }), 403);
        assert.equal(kv.m.get('turnin:STK26:g2').metadata.state, 'sent', 'nothing changed');
    });
    test('read: the owner gets one card\'s scanner read; photo: its JPEG; a card nobody sent is no_card', async () => {
        need();
        const kv = await seeded();
        let r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g2', read: '1' }, uid: OWNER, anonymous: false });
        assert.equal(r.out.status, 'ok');
        assert.equal(r.out.card.sk, 'g2');
        assert.equal(r.out.card.scan.players.length, 2);
        assert.equal(r.out.card.scan.players[0].name, 'Dana Ruiz');
        assert.ok(!JSON.stringify(r.out).includes(GOLFER), 'no uid, even to the owner');
        r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g2', photo: '1' }, uid: OWNER, anonymous: false });
        assert.deepEqual(r.out, { status: 'ok', sk: 'g2', photo: PHOTO });
        r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'team4', photo: '1' }, uid: OWNER, anonymous: false });
        assert.deepEqual(r.out, { status: 'refused', reason: 'no_card' }, 'team4 was sent without a photo');
        r = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g7', read: '1' }, uid: OWNER, anonymous: false });
        assert.deepEqual(r.out, { status: 'refused', reason: 'no_card' });
    });
    test('approve / decline: the owner flips the state and the time; the read and the photo stay; the golfer\'s status says which; no score is written anywhere (this handler has no database write at all)', async () => {
        need();
        const kv = await seeded();
        const later = { date: () => new Date(NOW.getTime() + 5 * 60000) };
        let r = await call({ kv, clock: later, uid: OWNER, anonymous: false, body: { action: 'approve', code: CODE, sk: 'g2' } });
        assert.deepEqual(r.out, { status: 'ok', card: { sk: 'g2', by: 'Dana', at: NOW.getTime(), state: 'approved', decidedAt: NOW.getTime() + 300000, photo: true } });
        r = await call({ kv, clock: later, uid: OWNER, anonymous: false, body: { action: 'decline', code: CODE, sk: 'team4' } });
        assert.equal(r.out.card.state, 'declined');
        assert.equal(JSON.parse(kv.m.get('turnin:STK26:g2').value).scan.players.length, 2, 'the read stays');
        assert.ok(kv.m.has('turninphoto:STK26:g2'), 'the photo stays');
        const g = await call({ kv, method: 'GET', query: { code: CODE, sk: 'g2' }, uid: GOLFER });
        assert.equal(g.out.card.state, 'approved');
        const d = await call({ kv, method: 'GET', query: { code: CODE, sk: 'team4' }, uid: OTHER });
        assert.equal(d.out.card.state, 'declined');
        // Every network call this file ever makes is a GET of the key set or an event child: no write reaches the database.
        const src = require('fs').readFileSync(path.join(API, '_turnin.js'), 'utf8');
        assert.ok(!/method:\s*['"](PUT|PATCH|POST|DELETE)['"]/.test(src), 'no database write in _turnin.js');
        assert.ok(!/\/scores\//.test(src), 'no score path in _turnin.js');
        r = await call({ kv, uid: OWNER, anonymous: false, body: { action: 'approve', code: CODE, sk: 'g9' } });
        assert.deepEqual(r.out, { status: 'refused', reason: 'no_card' });
        r = await call({ kv, uid: OWNER, anonymous: false, body: { action: 'shred', code: CODE, sk: 'g2' } });
        assert.deepEqual(r.out, { status: 'refused', reason: 'bad_request' });
    });
});

describe('the route and the catch-all', () => {
    const req = (method, url, body, auth) => ({
        method, url,
        headers: { get: (h) => (h.toLowerCase() === 'authorization' ? (auth === undefined ? null : auth) : (h.toLowerCase() === 'origin' ? 'https://golf-app-5a5.pages.dev' : null)) },
        json: async () => body
    });
    test('card-turn-in.js exports GET, POST and OPTIONS; the catch-all has its row and derives Allow from them', async () => {
        need();
        assert.deepEqual(Object.keys(ROUTE).filter((k) => /^onRequest/.test(k)).sort(), ['onRequestGet', 'onRequestOptions', 'onRequestPost']);
        const row = CATCH.ROUTES.find((r) => r.file === 'card-turn-in.js');
        assert.ok(row, 'the catch-all names card-turn-in.js');
        assert.ok(row.matches(['card-turn-in']) && !row.matches(['card-turn-in', 'x']) && !row.matches(['card-turn-ins']));
        assert.deepEqual(row.methods, ['GET', 'OPTIONS', 'POST']);
    });
    test('a POST without KV through the route: 503 JSON not_configured, no-store, CORS for the site', async () => {
        need();
        const res = await ROUTE.onRequestPost({ env: {}, request: req('POST', 'https://hardpangolf.com/api/card-turn-in', SEND(), 'Bearer x.y.z') });
        assert.equal(res.status, 503);
        assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await res.json(), { status: 'not_configured' });
    });
    test('a GET without a token through the route: 401 sign_in (KV present); OPTIONS answers the preflight with GET, POST', async () => {
        need();
        const res = await ROUTE.onRequestGet({ env: { SCAN_KV: fakeKV() }, request: req('GET', 'https://hardpangolf.com/api/card-turn-in?code=STK26&sk=g2', null) });
        assert.equal(res.status, 401);
        assert.deepEqual(await res.json(), { status: 'refused', reason: 'sign_in' });
        const pre = await ROUTE.onRequestOptions({ request: req('OPTIONS', 'https://hardpangolf.com/api/card-turn-in', null) });
        assert.ok(pre.status === 204 || pre.status === 200);
        assert.match(String(pre.headers.get('access-control-allow-methods') || ''), /GET/);
        assert.match(String(pre.headers.get('access-control-allow-methods') || ''), /POST/);
    });
    test('statusFor: ok 200, every refusal its own code, anything else 503', () => {
        need();
        assert.equal(T.statusFor({ status: 'ok' }), 200);
        assert.equal(T.statusFor({ status: 'refused', reason: 'turnin_off' }), 403);
        assert.equal(T.statusFor({ status: 'refused', reason: 'no_event' }), 404);
        assert.equal(T.statusFor({ status: 'unavailable', reason: 'network' }), 503);
        assert.equal(T.statusFor({ status: 'unavailable', reason: 'upstream_error' }), 503);
    });
});
