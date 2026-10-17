// ============================================================================
// accountDelete (firebase-functions/account-delete-core.js): Sign in with Apple
// revoked with a client secret signed on the server, then every record this
// account owns outside the rounds, then the Auth user LAST. A FAKE database, a
// FAKE Admin Auth and a FAKE appleid.apple.com that records every call. No
// Firebase, no network, no Apple.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const A = require('./firebase-functions/account-delete-core.js');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const APPLE = { teamId: 'TEAM123456', keyId: 'KEYABC1234', privateKey: PEM, clientIds: ['com.rattlegolf.app', 'com.rattlegolf.gpsbeta'] };
const unb64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const NOW = 1800000000000;

function fakeDb(seed) {
    const root = JSON.parse(JSON.stringify(seed || {}));
    const parts = (p) => p.split('/').filter(Boolean);
    const get = (p) => { let o = root; for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
    const del = (p) => { const ks = parts(p); let o = root; for (const k of ks.slice(0, -1)) { if (o == null || typeof o !== 'object') return; o = o[k]; } if (o && typeof o === 'object') delete o[ks[ks.length - 1]]; };
    const updates = [];
    return {
        root, updates,
        get: async (p) => get(p),
        update: async (p, v) => { updates.push({ p, v: JSON.parse(JSON.stringify(v)) }); Object.keys(v).forEach((k) => { if (v[k] === null) del((p ? p + '/' : '') + k); }); },
    };
}
function fakeAuth(user, log) {
    return {
        getUser: async (uid) => { log.push('getUser'); if (!user) throw Object.assign(new Error('nope'), { code: 'auth/user-not-found' }); return user; },
        deleteUser: async (uid) => { log.push('deleteUser:' + uid); },
    };
}
// Apple: token answers per client id; revoke answers 200 unless told otherwise.
function fakeApple(opts) {
    const o = Object.assign({ codeFor: 'com.rattlegolf.app', sub: '001234.apple.sub', revokeStatus: 200 }, opts || {});
    const calls = [];
    const fetch = async (url, init) => {
        const body = Object.fromEntries(new URLSearchParams(init.body));
        calls.push({ url, body, headers: init.headers, method: init.method });
        if (url === A.APPLE_TOKEN_URL) {
            if (o.tokenStatus) return { ok: false, status: o.tokenStatus, json: async () => ({ error: 'invalid_grant' }) };
            if (body.client_id !== o.codeFor) return { ok: false, status: 400, json: async () => ({ error: 'invalid_client' }) };
            return { ok: true, status: 200, json: async () => ({ access_token: 'at-1', refresh_token: 'rt-1', id_token: b64({ alg: 'RS256' }) + '.' + b64({ sub: o.sub, aud: body.client_id }) + '.sig' }) };
        }
        if (url === A.APPLE_REVOKE_URL) return { ok: o.revokeStatus === 200, status: o.revokeStatus, json: async () => ({}) };
        throw new Error('unexpected fetch ' + url);
    };
    return { fetch, calls };
}
const SEED = () => ({
    events: { ZZTEST: { ownerUid: 'u9', scores: { p101_h1: 4 } } },
    organizers: { u9: { firstSeenAt: 1, pass: { kind: 'founder' }, groups: { g1: { name: 'Thursday', coOrganizers: { 'a,b@c,com': true, 'x,y@z,com': false } } } }, other: { firstSeenAt: 2 } },
    pushTokens: { u9: { dev1: { token: 't', playerId: '', at: 1 } }, other: { dev2: { token: 'u', playerId: '', at: 1 } } },
    pushPrefs: { u9: { bets: true, hype: false } },
    gps_usage: { u9: { '2026-10-17': { searches: 2 } } },
    sharedGroups: { 'a,b@c,com': { u9: { g1: true }, other: { g7: true } } },
});
const APPLE_USER = { uid: 'u9', providerData: [{ providerId: 'apple.com', uid: '001234.apple.sub' }] };
const AUTH_APPLE = { uid: 'u9', token: { firebase: { sign_in_provider: 'apple.com' } } };

function setup(o) {
    const opts = o || {};
    const db = fakeDb(SEED());
    const log = [];
    const apple = fakeApple(opts.apple);
    const fn = A.createAccountDelete({ db, auth: fakeAuth(opts.user === undefined ? APPLE_USER : opts.user, log), fetch: apple.fetch,
        apple: () => (opts.creds === undefined ? APPLE : opts.creds), now: () => NOW });
    return { db, log, apple, fn };
}

test('the client secret: ES256, kid, iss = team, aud = appleid.apple.com, sub = the app, five minutes, signed with the Apple key', () => {
    const t = A.makeClientSecret(APPLE, 'com.rattlegolf.app', 1800000000);
    const [h, c, sig] = t.split('.');
    assert.deepEqual(JSON.parse(unb64(h)), { alg: 'ES256', kid: 'KEYABC1234' });
    assert.deepEqual(JSON.parse(unb64(c)), { iss: 'TEAM123456', iat: 1800000000, exp: 1800000300, aud: 'https://appleid.apple.com', sub: 'com.rattlegolf.app' });
    assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, unb64(sig)), 'verifies with the public key');
});

test('an Apple account: code exchanged, refresh token revoked, then the records in ONE write, then the Auth user LAST', async () => {
    const { db, log, apple, fn } = setup();
    const out = await fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c-123' });
    assert.equal(out.status, 'deleted');
    assert.equal(out.appleRevoked, true);
    assert.deepEqual(apple.calls.map((c) => c.url), [A.APPLE_TOKEN_URL, A.APPLE_REVOKE_URL]);
    const [tok, rev] = apple.calls;
    assert.equal(tok.method, 'POST');
    assert.equal(tok.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.deepEqual([tok.body.client_id, tok.body.code, tok.body.grant_type], ['com.rattlegolf.app', 'c-123', 'authorization_code']);
    assert.match(tok.body.client_secret, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.deepEqual([rev.body.client_id, rev.body.token, rev.body.token_type_hint], ['com.rattlegolf.app', 'rt-1', 'refresh_token']);
    assert.equal(db.updates.length, 1, 'one multi-path write');
    assert.deepEqual(Object.keys(db.updates[0].v).sort(), ['gps_usage/u9', 'organizers/u9', 'pushPrefs/u9', 'pushTokens/u9', 'sharedGroups/a,b@c,com/u9'].sort());
    assert.equal(db.updates[0].p, '', 'at the root');
    assert.deepEqual(log, ['getUser', 'deleteUser:u9'], 'the Auth user goes after the data');
    assert.equal(db.root.organizers.u9, undefined, 'the WHOLE record, firstSeenAt and pass included');
    assert.equal(db.root.pushTokens.u9, undefined);
    assert.equal(db.root.pushPrefs.u9, undefined);
    assert.equal(db.root.gps_usage.u9, undefined);
    assert.equal(db.root.sharedGroups['a,b@c,com'].u9, undefined);
    // CONTROLS: other people's records, and every round, are untouched.
    assert.deepEqual(db.root.organizers.other, { firstSeenAt: 2 });
    assert.ok(db.root.pushTokens.other.dev2);
    assert.deepEqual(db.root.sharedGroups['a,b@c,com'].other, { g7: true });
    assert.deepEqual(db.root.events.ZZTEST, { ownerUid: 'u9', scores: { p101_h1: 4 } }, 'rounds are never touched');
});

test('the GPS build\'s code: the wrong bundle id is skipped, the app\'s hint goes first', async () => {
    const a = setup({ apple: { codeFor: 'com.rattlegolf.gpsbeta' } });
    await a.fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c' });
    assert.deepEqual(a.apple.calls.map((c) => c.body.client_id), ['com.rattlegolf.app', 'com.rattlegolf.gpsbeta', 'com.rattlegolf.gpsbeta']);
    const b = setup({ apple: { codeFor: 'com.rattlegolf.gpsbeta' } });
    await b.fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c', appleClientId: 'com.rattlegolf.gpsbeta' });
    assert.deepEqual(b.apple.calls.map((c) => c.body.client_id), ['com.rattlegolf.gpsbeta', 'com.rattlegolf.gpsbeta']);
    const c = setup();
    await c.fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c', appleClientId: 'com.evil.app' });
    assert.equal(c.apple.calls[0].body.client_id, 'com.rattlegolf.app', 'a hint not on the allow list is ignored');
});

test('APPLE REFUSES: nothing is deleted - not the records, not the Auth user', async () => {
    for (const apple of [{ tokenStatus: 400 }, { revokeStatus: 500 }, { sub: 'somebody.else' }]) {
        const { db, log, fn } = setup({ apple });
        await assert.rejects(fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c' }), (e) => /^apple-/.test(e.code), JSON.stringify(apple));
        assert.equal(db.updates.length, 0, 'no record removed: ' + JSON.stringify(apple));
        assert.ok(!log.some((l) => /^deleteUser/.test(l)), 'the account survives: ' + JSON.stringify(apple));
        assert.ok(db.root.organizers.u9.pass);
    }
});

test('the Apple key missing on the server is a refusal, never a silent delete without revoking', async () => {
    const { db, log, fn } = setup({ creds: { teamId: '', keyId: '', privateKey: '', clientIds: [] } });
    await assert.rejects(fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'c' }), (e) => e.code === 'apple-not-configured');
    assert.equal(db.updates.length, 0);
    assert.ok(!log.some((l) => /^deleteUser/.test(l)));
});

test('an Apple account with NO code (the web): still deleted, and the answer says it was not revoked', async () => {
    const { db, log, apple, fn } = setup();
    const out = await fn.deleteAccount(AUTH_APPLE, {});
    assert.deepEqual([out.status, out.appleRevoked, out.appleReason], ['deleted', false, 'no-code']);
    assert.equal(apple.calls.length, 0);
    assert.equal(db.root.organizers.u9, undefined);
    assert.ok(log.includes('deleteUser:u9'));
});

test('GOOGLE and EMAIL-LINK accounts: no Apple call at all, everything else the same', async () => {
    for (const providerId of ['google.com', 'password']) {
        const { db, log, apple, fn } = setup({ user: { uid: 'u9', providerData: [{ providerId, uid: 'x' }] } });
        const out = await fn.deleteAccount({ uid: 'u9', token: { firebase: { sign_in_provider: providerId } } }, { appleAuthorizationCode: 'ignored' });
        assert.deepEqual([out.status, out.appleRevoked], ['deleted', false]);
        assert.equal(apple.calls.length, 0, providerId + ': Apple is never asked');
        assert.equal(db.root.organizers.u9, undefined);
        assert.equal(db.root.pushTokens.u9, undefined);
        assert.deepEqual(log, ['getUser', 'deleteUser:u9']);
    }
});

test('guards: signed-in only, never an anonymous session, a code of sane size', async () => {
    const { fn, db } = setup();
    await assert.rejects(fn.deleteAccount(null, {}), (e) => e.code === 'unauthenticated');
    await assert.rejects(fn.deleteAccount({ uid: 'u9', token: { firebase: { sign_in_provider: 'anonymous' } } }, {}), (e) => e.code === 'failed-precondition');
    await assert.rejects(fn.deleteAccount(AUTH_APPLE, { appleAuthorizationCode: 'x'.repeat(5000) }), (e) => e.code === 'invalid-argument');
    assert.equal(db.updates.length, 0);
});

test('an Auth user already gone: the records still go, and it is not an error', async () => {
    const { db, log, fn } = setup({ user: null });
    const out = await fn.deleteAccount({ uid: 'u9', token: {} }, {});
    assert.equal(out.status, 'deleted');
    assert.equal(db.root.organizers.u9, undefined);
    assert.deepEqual(log, ['getUser']);
});

test('index.js: a callable, the Apple key from Secret Manager, the deploy line names only this function, no key in the repo', () => {
    const src = fs.readFileSync(path.join(__dirname, 'firebase-functions', 'index.js'), 'utf8');
    assert.match(src, /exports\.accountDelete = onCall\(/);
    ['APPLE_SIGNIN_TEAM_ID', 'APPLE_SIGNIN_KEY_ID', 'APPLE_SIGNIN_PRIVATE_KEY'].forEach((k) => assert.ok(src.includes("defineSecret('" + k + "')"), k));
    assert.match(src, /firebase deploy --only functions:gps-live:accountDelete/);
    const core = fs.readFileSync(path.join(__dirname, 'firebase-functions', 'account-delete-core.js'), 'utf8');
    for (const s of [src, core]) assert.ok(!/BEGIN PRIVATE KEY/.test(s), 'no key in the repo');
    assert.ok(!/console\.\w+\([^)]*(privateKey|client_secret|secret\))/.test(src + core), 'never logged');
});
