// ============================================================================
// POST /api/scorecard-scan - the server handler (functions/api/_scan.js) with a
// STUBBED Gemini. No test here makes a network call: every fetch goes to the
// scripted stub below, and an unexpected URL fails the test.
//
// What is held: inert not_configured, the request checks, Firebase ID token
// verification, paid gating + the free scans, the rate limits and monthly cap,
// the request sent to Gemini (strict schema, temperature 0), the ONE Pro retry
// only on validation failure, the route and the catch-all row.
// ============================================================================
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const API = path.join(REPO_ROOT, 'functions', 'api');
let S = null, ROUTE = null, CATCH = null, loadError = null;
before(async () => {
    try {
        S = await import(pathToFileURL(path.join(API, '_scan.js')).href);
        ROUTE = await import(pathToFileURL(path.join(API, 'scorecard-scan.js')).href);
        CATCH = await import(pathToFileURL(path.join(API, '[[path]].js')).href);
    } catch (e) { loadError = e; }
});
const need = () => { if (loadError) assert.fail('could not load the scan handler: ' + loadError.message); };

const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-10-24T18:00:00Z');
const clock = { date: () => new Date(NOW) };
const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const ROUND = { holes: 18, par: PAR, course: 'Test Links', players: [{ name: 'Test Golfer A' }, { name: 'Test Golfer B' }] };
const IMAGE = { mimeType: 'image/jpeg', data: Buffer.from('not really a jpeg').toString('base64') };
const BODY = { image: IMAGE, round: ROUND };

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
async function idToken(claims, opts) {
    const o = opts || {};
    const t = Math.floor(NOW.getTime() / 1000);
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: o.kid || 'kid-1', typ: 'JWT' }));
    const payload = b64u(JSON.stringify(Object.assign({
        iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'test-uid-1',
        iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: 'anonymous' }
    }, claims || {})));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(header + '.' + payload));
    return header + '.' + payload + '.' + (o.badSig ? b64u(Buffer.from('nope')) : b64u(sig));
}

// --- fake KV ------------------------------------------------------------------
function fakeKV() {
    const m = new Map();
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } };
}

// --- a card the model "read" ----------------------------------------------------
function cardJson(opts) {
    const o = opts || {};
    const row = (name, off) => {
        const holes = PAR.map((p, i) => ({ hole: i + 1, score: p + off, confidence: 0.99 }));
        const out = holes.slice(0, 9).reduce((s, c) => s + c.score, 0);
        const inn = holes.slice(9).reduce((s, c) => s + c.score, 0);
        return { name, row_label_as_written: name, holes, written_out: out + (o.badOut ? 1 : 0), written_in: inn, written_total: out + inn };
    };
    return JSON.stringify({ players: [row('Test Golfer A', 0), row('Test Golfer B', 1)], notes: '' });
}
const geminiOk = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 900, thoughtsTokenCount: 0 } } });

// --- the scripted fetch -----------------------------------------------------------
// script: { pass: <RTDB pass value>, flash: [response], pro: [response] }
function stubFetch(script) {
    const calls = [];
    const fn = async (url, init) => {
        const u = String(url);
        calls.push({ url: u, init });
        const reply = (r) => {
            if (r && r.throws) throw new Error('offline');
            return {
                ok: r.status >= 200 && r.status < 300, status: r.status,
                headers: { get: (h) => (h.toLowerCase() === 'cache-control' ? 'public, max-age=3600' : null) },
                json: async () => { if (r.json === undefined) throw new Error('no json'); return r.json; }
            };
        };
        if (u.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')) {
            return reply(script.jwks || { status: 200, json: { keys: [KEYS.jwk] } });
        }
        if (u.startsWith('https://golfapp-9fb21-default-rtdb.firebaseio.com/organizers/')) {
            return reply(script.rtdb || { status: 200, json: script.pass === undefined ? null : script.pass });
        }
        const g = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:]+):generateContent$/.exec(u);
        if (g) {
            const which = /pro/.test(decodeURIComponent(g[1])) ? 'pro' : 'flash';
            const list = script[which] || [];
            const next = list.shift();
            if (!next) assert.fail('unexpected ' + which + ' call');
            return reply(next);
        }
        assert.fail('unexpected network call to ' + u);
    };
    fn.calls = calls;
    fn.gemini = () => calls.filter((c) => c.url.includes('generativelanguage'));
    return fn;
}

const ENV = { GEMINI_API_KEY: 'stub-key-for-tests' };
async function scan(script, extra) {
    const e = extra || {};
    const fetch = stubFetch(script);
    const kv = e.kv || fakeKV();
    const logs = [];
    const out = await S.handleScan({
        env: Object.assign({}, ENV, e.env || {}), kv, fetch, clock, log: (l) => logs.push(l),
        body: e.body || BODY,
        authorization: e.authorization !== undefined ? e.authorization : 'Bearer ' + await idToken(e.claims, e.tokenOpts)
    });
    return { out, fetch, kv, logs };
}
beforeEach(() => { if (S) S.resetKeyCache(); });

describe('shipped inert: not_configured before anything else', () => {
    test('no GEMINI_API_KEY -> not_configured, and no fetch at all', async () => {
        need();
        const fetch = stubFetch({});
        const out = await S.handleScan({ env: { GOLFCOURSE_KV: fakeKV() }, fetch, clock, body: BODY, authorization: 'Bearer x' });
        assert.deepEqual(out, { status: 'not_configured' });
        assert.equal(fetch.calls.length, 0);
    });
    test('a blank key is no key', async () => {
        need();
        const out = await S.handleScan({ env: { GEMINI_API_KEY: '   ', GOLFCOURSE_KV: fakeKV() }, fetch: stubFetch({}), clock, body: BODY });
        assert.equal(out.status, 'not_configured');
    });
    test('a key but no KV to count free scans in -> not_configured', async () => {
        need();
        const out = await S.handleScan({ env: { GEMINI_API_KEY: 'k' }, fetch: stubFetch({}), clock, body: BODY });
        assert.equal(out.status, 'not_configured');
    });
    test('the route answers 503 not_configured with an empty env', async () => {
        need();
        const req = { method: 'POST', headers: { get: () => null }, json: async () => BODY };
        const res = await ROUTE.onRequestPost({ request: req, env: {} });
        assert.equal(res.status, 503);
        assert.deepEqual(JSON.parse(await res.text()), { status: 'not_configured' });
        assert.equal(res.headers.get('cache-control'), 'no-store');
    });
    test('the existing course KV binding is accepted, with scan: prefixed keys', async () => {
        need();
        const kv = fakeKV();
        const fetch = stubFetch({ flash: [geminiOk(cardJson())] });
        const out = await S.handleScan({ env: { GEMINI_API_KEY: 'k', GOLFCOURSE_KV: kv }, fetch, clock, log: () => {},
            body: BODY, authorization: 'Bearer ' + await idToken() });
        assert.equal(out.status, 'ok');
        assert.ok([...kv.m.keys()].every((k) => k.startsWith('scan:')));
    });
    test('no key, password or token is committed in the scan files', () => {
        ['_scan.js', 'scorecard-scan.js'].forEach((f) => {
            const src = fs.readFileSync(path.join(API, f), 'utf8');
            assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(src), f + ' carries what looks like a Google API key');
        });
    });
});

describe('the request is checked for free, before anyone is verified', () => {
    test('bad bodies', async () => {
        need();
        const cases = [
            [null, 'bad_request'],
            [{ round: ROUND }, 'bad_image'],
            [{ image: { mimeType: 'image/gif', data: IMAGE.data }, round: ROUND }, 'bad_image'],
            [{ image: { mimeType: 'image/jpeg', data: 'not base64!!' }, round: ROUND }, 'bad_image'],
            [{ image: { mimeType: 'image/jpeg', data: 'A'.repeat(S.MAX_IMAGE_CHARS + 4) }, round: ROUND }, 'bad_image'],
            [{ image: IMAGE, round: Object.assign({}, ROUND, { holes: 12 }) }, 'bad_request'],
            [{ image: IMAGE, round: Object.assign({}, ROUND, { players: [] }) }, 'bad_request'],
            [{ image: IMAGE, round: Object.assign({}, ROUND, { par: undefined }) }, 'bad_request']
        ];
        for (const [body, reason] of cases) {
            const fetch = stubFetch({});
            const out = await S.handleScan({ env: ENV, kv: fakeKV(), fetch, clock, body, authorization: 'Bearer x' });
            assert.deepEqual(out, { status: 'unavailable', reason }, JSON.stringify(body && Object.keys(body)));
            assert.equal(fetch.calls.length, 0);
        }
    });
    test('a data: URL prefix is accepted and stripped', () => {
        need();
        const r = S.readBody({ image: { mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,' + IMAGE.data }, round: ROUND });
        assert.equal(r.image.data, IMAGE.data);
    });
    test('only the fields the prompt needs go any further', () => {
        need();
        const r = S.readBody({ image: IMAGE, round: Object.assign({}, ROUND, {
            players: [{ name: 'Test Golfer A', email: 'x@y.z', uid: 'u1' }], venmo: '@x' }) });
        assert.deepEqual(Object.keys(r.round.players[0]).filter((k) => r.round.players[0][k] !== undefined), ['name']);
        assert.equal(r.round.venmo, undefined);
    });
});

describe('Firebase ID token verification', () => {
    test('no Authorization header -> refused sign_in, no model call', async () => {
        need();
        const { out, fetch } = await scan({}, { authorization: '' });
        assert.deepEqual(out, { status: 'refused', reason: 'sign_in' });
        assert.equal(fetch.gemini().length, 0);
    });
    test('wrong audience, wrong issuer, expired, bad signature, unknown kid -> sign_in', async () => {
        need();
        const t = Math.floor(NOW.getTime() / 1000);
        const bad = [
            { claims: { aud: 'other-project' } },
            { claims: { iss: 'https://securetoken.google.com/other' } },
            { claims: { exp: t - 1 } },
            { claims: { sub: '' } },
            { tokenOpts: { badSig: true } },
            { tokenOpts: { kid: 'kid-unknown' } }
        ];
        for (const b of bad) {
            const { out, fetch } = await scan({}, b);
            assert.deepEqual(out, { status: 'refused', reason: 'sign_in' }, JSON.stringify(b));
            assert.equal(fetch.gemini().length, 0);
        }
    });
    test('the signing keys cannot be fetched -> unavailable network, not sign_in', async () => {
        need();
        const { out } = await scan({ jwks: { throws: true } });
        assert.deepEqual(out, { status: 'unavailable', reason: 'network' });
    });
    test('a valid token verifies and names the uid', async () => {
        need();
        const fetch = stubFetch({});
        const who = await S.verifyIdToken(await idToken({ sub: 'abc', firebase: { sign_in_provider: 'apple.com' } }),
            { projectId: PROJECT, now: NOW, doFetch: fetch, subtle: webcrypto.subtle });
        assert.deepEqual(who, { uid: 'abc', anonymous: false });
    });
});

describe('gating: paid hosts, plus SCAN_FREE_LIMIT free scans', () => {
    test('the free number is the one constant from the shared validator', async () => {
        need();
        const V = require(path.join(REPO_ROOT, 'scorecard-validate.js'));
        assert.equal(S.SCAN_FREE_LIMIT, V.SCAN_FREE_LIMIT);
        assert.equal(S.SCAN_FREE_LIMIT, 3);
        const src = fs.readFileSync(path.join(API, '_scan.js'), 'utf8');
        assert.ok(!/SCAN_FREE_LIMIT\s*=\s*\d/.test(src), '_scan.js must not keep its own copy of the number');
    });
    test('no pass: 3 scans work, the 4th is needs_pass and calls no model', async () => {
        need();
        const kv = fakeKV();
        const left = [];
        for (let i = 0; i < 3; i++) {
            // A fresh minute each time so the burst brake is not what refuses.
            const at = new Date(NOW.getTime() + i * 61000);
            const fetch = stubFetch({ pass: null, flash: [geminiOk(cardJson())] });
            const out = await S.handleScan({ env: ENV, kv, fetch, clock: { date: () => at }, log: () => {},
                body: BODY, authorization: 'Bearer ' + await idToken() });
            assert.equal(out.status, 'ok', 'scan ' + (i + 1));
            assert.equal(out.paid, false);
            left.push(out.freeScansLeft);
        }
        assert.deepEqual(left, [2, 1, 0]);
        const { out, fetch } = await scan({ pass: null }, { kv });
        assert.deepEqual(out, { status: 'refused', reason: 'needs_pass' });
        assert.equal(fetch.gemini().length, 0);
    });
    test('the pass is read AS the caller (their own token), no service account', async () => {
        need();
        const { fetch } = await scan({ pass: null, flash: [geminiOk(cardJson())] });
        const read = fetch.calls.find((c) => c.url.includes('firebaseio.com'));
        assert.match(read.url, /\/organizers\/test-uid-1\/pass\.json\?auth=/);
        assert.equal(read.init.method, undefined, 'a GET - the Worker never writes the database');
    });
    test('a live pass scans without spending free scans', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.freeKey('test-uid-1'), '3');   // free scans already gone
        const { out } = await scan({ pass: { kind: 'trip', expiresAt: NOW.getTime() + 86400000 }, flash: [geminiOk(cardJson())] }, { kv });
        assert.equal(out.status, 'ok');
        assert.equal(out.paid, true);
        assert.equal(out.freeScansLeft, null);
        assert.equal(kv.m.get(S.freeKey('test-uid-1')), '3');
    });
    test('an expired pass is not a pass', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.freeKey('test-uid-1'), '3');
        const { out } = await scan({ pass: { kind: 'trip', expiresAt: NOW.getTime() - 1 } }, { kv });
        assert.deepEqual(out, { status: 'refused', reason: 'needs_pass' });
    });
    test('the pass read failing falls back to the free scans, never to unlimited', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.freeKey('test-uid-1'), '3');
        const { out } = await scan({ rtdb: { status: 401, json: { error: 'Permission denied' } } }, { kv });
        assert.deepEqual(out, { status: 'refused', reason: 'needs_pass' });
        const r2 = await scan({ rtdb: { throws: true } }, { kv });
        assert.deepEqual(r2.out, { status: 'refused', reason: 'needs_pass' });
    });
    test('a failed model call does not use up a free scan', async () => {
        need();
        const kv = fakeKV();
        const { out } = await scan({ flash: [{ status: 500, json: {} }] }, { kv });
        assert.deepEqual(out, { status: 'unavailable', reason: 'upstream_error' });
        assert.equal(kv.m.get(S.freeKey('test-uid-1')), undefined);
    });
});

describe('rate limits and the monthly cost cap', () => {
    const PASS = { kind: 'season', expiresAt: NOW.getTime() + 86400000 };
    test('a 4th scan in one minute is rate_limited', async () => {
        need();
        const kv = fakeKV();
        for (let i = 0; i < 3; i++) assert.equal((await scan({ pass: PASS, flash: [geminiOk(cardJson())] }, { kv })).out.status, 'ok');
        const { out, fetch } = await scan({ pass: PASS }, { kv });
        assert.deepEqual(out, { status: 'refused', reason: 'rate_limited' });
        assert.equal(fetch.gemini().length, 0);
    });
    test('30 a day per account', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.dayKey('test-uid-1', NOW), String(S.PER_DAY));
        assert.deepEqual((await scan({ pass: PASS }, { kv })).out, { status: 'refused', reason: 'daily_limit' });
    });
    test('the monthly cap refuses, and SCAN_MONTHLY_CAP overrides it', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.monthKey(NOW), '5');
        assert.deepEqual((await scan({ pass: PASS }, { kv, env: { SCAN_MONTHLY_CAP: '5' } })).out,
            { status: 'refused', reason: 'monthly_cap' });
        assert.equal(S.monthlyCap({}), 20000);
        assert.equal(S.monthlyCap({ SCAN_MONTHLY_CAP: 'abc' }), 20000);
        assert.equal(S.monthlyCap({ SCAN_MONTHLY_CAP: '0' }), 20000);
        assert.equal(S.monthlyCap({ SCAN_MONTHLY_CAP: ' 900 ' }), 900);
    });
});

describe('the Gemini request', () => {
    test('2.5 Flash, strict JSON schema, temperature 0, thinking off, key in a header not the URL', async () => {
        need();
        const { fetch } = await scan({ flash: [geminiOk(cardJson())] });
        const [call] = fetch.gemini();
        assert.match(call.url, /models\/gemini-2\.5-flash:generateContent$/);
        assert.ok(!call.url.includes('stub-key-for-tests'));
        assert.equal(call.init.headers['x-goog-api-key'], 'stub-key-for-tests');
        const body = JSON.parse(call.init.body);
        assert.equal(body.generationConfig.temperature, 0);
        assert.equal(body.generationConfig.responseMimeType, 'application/json');
        assert.deepEqual(body.generationConfig.responseSchema, require(path.join(REPO_ROOT, 'scorecard-validate.js')).responseSchema());
        assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
        const parts = body.contents[0].parts;
        assert.match(parts[0].text, /Test Golfer A/);
        assert.deepEqual(parts[1], { inline_data: { mime_type: 'image/jpeg', data: IMAGE.data } });
    });
    test('SCAN_MODEL and SCAN_RETRY_MODEL come from the environment', async () => {
        need();
        const { fetch } = await scan({ flash: [geminiOk('{}')], pro: [geminiOk(cardJson())] },
            { env: { SCAN_MODEL: 'gemini-9-flash-test', SCAN_RETRY_MODEL: 'gemini-9-pro-test' } });
        const urls = fetch.gemini().map((c) => c.url);
        assert.match(urls[0], /gemini-9-flash-test/);
        assert.match(urls[1], /gemini-9-pro-test/);
    });
    test('the log line has no image bytes, no names and no account id', async () => {
        need();
        const { logs } = await scan({ flash: [geminiOk(cardJson())] });
        assert.equal(logs.length, 1);
        const line = logs[0];
        assert.ok(!line.includes(IMAGE.data));
        assert.ok(!line.includes('Test Golfer'));
        assert.ok(!line.includes('test-uid-1'));
        const j = JSON.parse(line);
        assert.equal(j.outcome, 'ok');
        assert.deepEqual(j.tokens, [{ model: 'gemini-2.5-flash', input: 1800, output: 900, thinking: 0 }]);
    });
});

describe('ONE Pro retry, only on a validation failure', () => {
    test('a clean Flash read: no Pro call', async () => {
        need();
        const { out, fetch } = await scan({ flash: [geminiOk(cardJson())] });
        assert.equal(out.status, 'ok');
        assert.equal(out.retried, false);
        assert.equal(out.model, 'gemini-2.5-flash');
        assert.equal(fetch.gemini().length, 1);
        assert.equal(out.validation.ok, true);
        assert.equal(out.result.players.length, 2);
    });
    test('a few amber cells but no hard failure: still no Pro call', async () => {
        need();
        const j = JSON.parse(cardJson());
        j.players[0].holes[0].confidence = 0.5;
        const { out, fetch } = await scan({ flash: [geminiOk(JSON.stringify(j))] });
        assert.equal(out.retried, false);
        assert.equal(out.validation.suspectCount, 1);
        assert.equal(fetch.gemini().length, 1);
    });
    test('a sum mismatch on Flash -> one Pro call; the better Pro read is used', async () => {
        need();
        const { out, fetch } = await scan({ flash: [geminiOk(cardJson({ badOut: true }))], pro: [geminiOk(cardJson())] });
        assert.equal(fetch.gemini().length, 2);
        assert.match(fetch.gemini()[1].url, /gemini-2\.5-pro/);
        assert.deepEqual(JSON.parse(fetch.gemini()[1].init.body).generationConfig.thinkingConfig, { thinkingBudget: 512 });
        assert.equal(out.retried, true);
        assert.equal(out.model, 'gemini-2.5-pro');
        assert.equal(out.validation.ok, true);
    });
    test('Pro is no better -> the Flash read is kept, and there is never a third call', async () => {
        need();
        const { out, fetch } = await scan({ flash: [geminiOk(cardJson({ badOut: true }))], pro: [geminiOk(cardJson({ badOut: true }))] });
        assert.equal(fetch.gemini().length, 2);
        assert.equal(out.retried, true);
        assert.equal(out.model, 'gemini-2.5-flash');
        assert.equal(out.validation.ok, false);
    });
    test('unparseable Flash output counts as a validation failure -> Pro', async () => {
        need();
        const { out, fetch } = await scan({ flash: [geminiOk('not json')], pro: [geminiOk(cardJson())] });
        assert.equal(fetch.gemini().length, 2);
        assert.equal(out.status, 'ok');
        assert.equal(out.model, 'gemini-2.5-pro');
    });
    test('both unreadable -> unavailable, and no free scan is used', async () => {
        need();
        const kv = fakeKV();
        const { out } = await scan({ flash: [geminiOk('')], pro: [geminiOk('nope')] }, { kv });
        assert.deepEqual(out, { status: 'unavailable', reason: 'upstream_error' });
        assert.equal(kv.m.get(S.freeKey('test-uid-1')), undefined);
    });
    test('a Flash network / HTTP failure is NOT a validation failure: no Pro call', async () => {
        need();
        for (const [resp, reason] of [[{ throws: true }, 'network'], [{ status: 429, json: {} }, 'busy'], [{ status: 400, json: {} }, 'upstream_error']]) {
            const { out, fetch } = await scan({ flash: [resp] });
            assert.deepEqual(out, { status: 'unavailable', reason });
            assert.equal(fetch.gemini().length, 1, reason);
        }
    });
    test('Pro failing on the network keeps the Flash read', async () => {
        need();
        const { out, fetch } = await scan({ flash: [geminiOk(cardJson({ badOut: true }))], pro: [{ throws: true }] });
        assert.equal(fetch.gemini().length, 2);
        assert.equal(out.status, 'ok');
        assert.equal(out.model, 'gemini-2.5-flash');
        assert.equal(out.retried, true);
    });
    test('no room under the monthly cap -> no retry spent', async () => {
        need();
        const kv = fakeKV();
        kv.m.set(S.monthKey(NOW), '4');
        const { out, fetch } = await scan({ flash: [geminiOk(cardJson({ badOut: true }))] }, { kv, env: { SCAN_MONTHLY_CAP: '5' } });
        assert.equal(fetch.gemini().length, 1);
        assert.equal(out.retried, false);
    });
});

describe('the route and the catch-all', () => {
    test('POST and OPTIONS only; the catch-all lists it with Allow: POST', async () => {
        need();
        assert.equal(typeof ROUTE.onRequestPost, 'function');
        assert.equal(typeof ROUTE.onRequestOptions, 'function');
        assert.equal(ROUTE.onRequestGet, undefined);
        const row = CATCH.ROUTES.find((r) => r.file === 'scorecard-scan.js');
        assert.ok(row, 'scorecard-scan.js needs a row in [[path]].js');
        assert.deepEqual(row.methods, ['OPTIONS', 'POST']);
        const res = await CATCH.onRequest({ request: { method: 'GET', headers: { get: () => null } }, params: { path: ['scorecard-scan'] }, env: {} });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('Allow'), 'OPTIONS, POST');
    });
    test('the preflight allows the Authorization header the app sends', async () => {
        need();
        const req = { method: 'OPTIONS', headers: { get: (h) => ({ Origin: 'capacitor://localhost', 'Access-Control-Request-Headers': 'authorization, content-type' })[h] || null } };
        const res = await ROUTE.onRequestOptions({ request: req, env: {} });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get('access-control-allow-origin'), 'capacitor://localhost');
        assert.match(res.headers.get('access-control-allow-headers'), /authorization/);
    });
    test('HTTP status per answer', () => {
        need();
        assert.equal(S.statusFor({ status: 'ok' }), 200);
        assert.equal(S.statusFor({ status: 'not_configured' }), 503);
        assert.equal(S.statusFor({ status: 'refused', reason: 'sign_in' }), 401);
        assert.equal(S.statusFor({ status: 'refused', reason: 'needs_pass' }), 402);
        assert.equal(S.statusFor({ status: 'refused', reason: 'rate_limited' }), 429);
        assert.equal(S.statusFor({ status: 'unavailable', reason: 'bad_image' }), 400);
    });
});

// fa83de35 bug (live test, Oct 25): wire() kept globalThis.fetch bare, and w.doFetch(...)
// then ran it with `this` = the wire object. Cloudflare Workers throw "Illegal invocation"
// for that, so Gemini and the paid-pass read failed every time. Mimic the Workers rule.
test('server: the default fetch is never called with a foreign `this` (Workers "Illegal invocation")', async () => {
    const S = await import('./functions/api/_scan.js');
    const real = globalThis.fetch;
    let badThis = 0, calls = 0;
    globalThis.fetch = function (url) {
        calls++;
        if (this !== undefined && this !== globalThis) { badThis++; throw new TypeError('Illegal invocation'); }
        return Promise.resolve(new Response('{}', { status: 500 }));
    };
    try {
        const wire = S.wire || (S.default && S.default.wire);
        if (typeof wire !== 'function') { assert.ok(true, 'wire() not exported; covered by the source check below'); }
        else {
            const w = wire({}, { GEMINI_API_KEY: 'test-not-a-key' });
            try { await w.doFetch('https://example.invalid/x'); } catch (e) { /* network stub */ }
            assert.equal(badThis, 0, 'fetch was called with the wire object as `this`');
        }
    } finally { globalThis.fetch = real; }
    const src = require('fs').readFileSync(require('path').join(__dirname, 'functions/api/_scan.js'), 'utf8');
    assert.ok(!/doFetch:\s*d\.fetch\s*\|\|\s*globalThis\.fetch\s*,/.test(src), 'bare globalThis.fetch stored on the wire object');
});

// Oct 25: a refused Gemini call logs ONLY codes (HTTP status, error.status, reason enums),
// never Google's message text, the body or the key.
test('server: a refused Gemini call logs its codes, never the message or the key', async () => {
    const S = await import('./functions/api/_scan.js');
    const lines = [];
    const errBody = { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Requests from referer <empty> are blocked. KEY-SECRET-xyz',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } };
    const fakeFetch = async () => new Response(JSON.stringify(errBody), { status: 403, headers: { 'content-type': 'application/json' } });
    const w = { doFetch: fakeFetch, key: 'KEY-SECRET-xyz', log: (l) => lines.push(l) };
    const r = await S.callGemini(w, 'gemini-2.5-flash', { mime: 'image/jpeg', data: 'AAAA' }, { holes: 18, par: [], players: [] });
    assert.equal(r.error, 'upstream_error');
    assert.deepEqual(r.upstream, { http: 403, status: 'PERMISSION_DENIED', reasons: ['API_KEY_HTTP_REFERRER_BLOCKED'] });
    assert.ok(!JSON.stringify(r).includes('KEY-SECRET'), 'the key or message must never be kept');
    assert.ok(!JSON.stringify(r).includes('referer'), 'Google message text must never be kept');
});
