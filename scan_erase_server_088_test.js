// ============================================================================
// 088 item 1 (078 "ADDED Oct 26" must-have): POST /api/scan-erase - Delete
// account also erases the scorecard-scan counts. The server half
// (functions/api/_scan.js handleScanErase, functions/api/scan-erase.js); the
// app half is on 088-scan-erase-gps (account-exit.js scanEraser).
//
// No network: the Firebase signing keys come from a stubbed fetch, with a real
// RSA key, so the ID token is verified for real. KV is an in-memory fake.
//
// What is held:
//   - ONLY the caller's own counts go: the score free count, the course-card
//     free count (080's scan:course:<uid>), this minute + the two before, today +
//     the two days before. The uid comes from the token - a uid in the body is
//     ignored.
//   - ANOTHER account's counts are untouched, and so is the global month total.
//   - Unauthenticated / a bad signature / an expired token / another project's
//     token is refused and erases nothing.
//   - Inert without KV (not_configured), and it does NOT need the Gemini key.
//   - The route, the preflight, and the catch-all row.
//   - Negative control: the same KV after a refused call is byte-identical.
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { webcrypto } = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const API = path.join(REPO_ROOT, 'functions', 'api');
let S = null, ROUTE = null, CATCH = null, loadError = null;
before(async () => {
    try {
        S = await import(pathToFileURL(path.join(API, '_scan.js')).href);
        ROUTE = await import(pathToFileURL(path.join(API, 'scan-erase.js')).href);
        CATCH = await import(pathToFileURL(path.join(API, '[[path]].js')).href);
    } catch (e) { loadError = e; }
});
const need = () => { if (loadError) assert.fail('could not load: ' + loadError.message); };

const PROJECT = 'golfapp-9fb21';
const NOW = new Date('2026-10-26T21:00:30Z');
const clock = { date: () => new Date(NOW) };

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
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' }));
    const payload = b64u(JSON.stringify(Object.assign({
        iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'uid-me',
        iat: t - 60, exp: t + 3000, auth_time: t - 60, firebase: { sign_in_provider: 'google.com' }
    }, claims || {})));
    const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', KEYS.pair.privateKey, Buffer.from(header + '.' + payload));
    return header + '.' + payload + '.' + (o.badSig ? b64u(Buffer.from('nope')) : b64u(sig));
}
function fakeKV(seed) {
    const m = new Map(Object.entries(seed || {}));
    return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); } };
}
const jwksFetch = (calls) => async (url) => {
    calls && calls.push(String(url));
    if (String(url) === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') {
        return { ok: true, status: 200, headers: { get: () => 'max-age=3600' }, json: async () => ({ keys: [KEYS.jwk] }) };
    }
    throw new Error('unexpected fetch ' + url);
};
// Both accounts have scanned: free + course counts, minute and day counts (now
// and earlier), plus the one global month total.
function seeded() {
    const kv = {};
    for (const uid of ['uid-me', 'uid-other']) {
        kv['scan:free:' + uid] = '2';
        kv['scan:course:' + uid] = '1';
        kv['scan:min:' + uid + ':2026-10-26T21:00'] = '1';
        kv['scan:min:' + uid + ':2026-10-26T20:59'] = '1';
        kv['scan:day:' + uid + ':2026-10-26'] = '3';
        kv['scan:day:' + uid + ':2026-10-25'] = '2';
        kv['scan:day:' + uid + ':2026-10-24'] = '1';
    }
    kv['scan:month:2026-10'] = '14';
    return kv;
}
const env = { FIREBASE_PROJECT_ID: PROJECT };   // NO GEMINI_API_KEY: erasing must not need it
async function erase(kv, authorization, extra) {
    S.resetKeyCache();
    const logs = [];
    const out = await S.handleScanErase(Object.assign({ env, kv, fetch: jwksFetch(), clock, log: (l) => logs.push(l), authorization }, extra || {}));
    return { out, logs };
}

describe('088 POST /api/scan-erase', () => {
    test('erases ONLY the signed-in account\'s own counts: score, course, per-minute, per-day', async () => {
        need();
        const kv = fakeKV(seeded());
        const { out, logs } = await erase(kv, 'Bearer ' + await idToken());
        assert.deepEqual(out, { status: 'erased', erased: 7 });
        assert.equal(S.statusFor(out), 200);
        const mine = [...kv.m.keys()].filter((k) => k.includes('uid-me'));
        assert.deepEqual(mine, [], 'nothing of uid-me left: ' + mine.join(', '));
        assert.ok(!logs.join('').includes('uid-me'), 'the log line never carries the account id');
    });

    test('ANOTHER account\'s counts are untouched, and so is the global month total', async () => {
        need();
        const seed = seeded();
        const kv = fakeKV(seed);
        await erase(kv, 'Bearer ' + await idToken());
        for (const [k, v] of Object.entries(seed)) {
            if (k.includes('uid-other') || k.startsWith('scan:month:')) assert.equal(kv.m.get(k), v, k);
        }
        assert.equal([...kv.m.keys()].length, 8, '7 of uid-other + the month total');
    });

    test('a uid in the body or query cannot pick the account: the token decides', async () => {
        need();
        const kv = fakeKV(seeded());
        const { out } = await erase(kv, 'Bearer ' + await idToken(), { body: { uid: 'uid-other' }, uid: 'uid-other' });
        assert.equal(out.status, 'erased');
        assert.equal(kv.m.get('scan:free:uid-other'), '2');
        assert.equal(kv.m.get('scan:free:uid-me'), undefined);
    });

    test('UNAUTHENTICATED is refused and erases nothing (no header, not Bearer, bad signature, expired, another project)', async () => {
        need();
        const cases = [
            undefined, '', 'Basic abc', 'Bearer ', 'Bearer not.a.jwt',
            'Bearer ' + await idToken({}, { badSig: true }),
            'Bearer ' + await idToken({ exp: Math.floor(NOW.getTime() / 1000) - 10 }),
            'Bearer ' + await idToken({ aud: 'some-other-project', iss: 'https://securetoken.google.com/some-other-project' })
        ];
        for (const a of cases) {
            const seed = seeded();
            const kv = fakeKV(seed);
            const { out } = await erase(kv, a);
            assert.deepEqual(out, { status: 'refused', reason: 'sign_in' }, String(a).slice(0, 30));
            assert.equal(S.statusFor(out), 401);
            assert.deepEqual(Object.fromEntries(kv.m), seed, 'NEGATIVE CONTROL: the KV is exactly as it was');
        }
    });

    test('Google\'s keys unreachable: unavailable network (the app retries), nothing erased', async () => {
        need();
        const seed = seeded();
        const kv = fakeKV(seed);
        const { out } = await erase(kv, 'Bearer ' + await idToken(), { fetch: async () => { throw new TypeError('offline'); } });
        assert.deepEqual(out, { status: 'unavailable', reason: 'network' });
        assert.deepEqual(Object.fromEntries(kv.m), seed);
    });

    test('inert without KV (not_configured), and a second call is harmless (idempotent)', async () => {
        need();
        S.resetKeyCache();
        assert.deepEqual(await S.handleScanErase({ env, fetch: jwksFetch(), clock, authorization: 'Bearer ' + await idToken() }), { status: 'not_configured' });
        const kv = fakeKV(seeded());
        await erase(kv, 'Bearer ' + await idToken());
        const again = await erase(kv, 'Bearer ' + await idToken());
        assert.deepEqual(again.out, { status: 'erased', erased: 0 });
    });

    test('the keys are exactly the ones the scan writes (the same key functions), incl. 080\'s course key', () => {
        need();
        const keys = S.eraseKeysFor('u1', NOW);
        assert.deepEqual(keys, [
            S.freeKey('u1'), 'scan:course:u1',
            S.minuteKey('u1', NOW), 'scan:min:u1:2026-10-26T20:59', 'scan:min:u1:2026-10-26T20:58',
            S.dayKey('u1', NOW), 'scan:day:u1:2026-10-25', 'scan:day:u1:2026-10-24'
        ]);
        // When 080 merges, its courseFreeKey must be this same literal.
        if (typeof S.courseFreeKey === 'function') assert.equal(S.courseFreeKey('u1'), 'scan:course:u1');
    });

    test('the route: POST with the Authorization header, the preflight, and the catch-all row', async () => {
        need();
        assert.equal(typeof ROUTE.onRequestPost, 'function');
        assert.equal(typeof ROUTE.onRequestOptions, 'function');
        const res = await ROUTE.onRequestPost({ env: {}, request: new Request('https://golf-app-5a5.pages.dev/api/scan-erase', { method: 'POST', headers: { Origin: 'capacitor://localhost' } }) });
        assert.equal(res.status, 503, 'no KV bound in this env: inert');
        assert.deepEqual(await res.json(), { status: 'not_configured' });
        const row = CATCH.ROUTES.find((r) => r.file === 'scan-erase.js');
        assert.ok(row && row.matches(['scan-erase']) && !row.matches(['scan-erase', 'x']));
        assert.deepEqual(row.methods, ['OPTIONS', 'POST']);
    });
});
