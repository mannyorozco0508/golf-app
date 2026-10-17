// ============================================================================
// DELETE MY ACCOUNT, SERVER SIDE (accountDelete) - App Review 5.1.1(v)
//
//   accountDelete({ appleAuthorizationCode?, appleClientId? })
//     -> { status: 'deleted', appleRevoked, removed[] }
//
// WHY IT IS ON THE SERVER. Two things the app cannot do for itself:
//   1. SIGN IN WITH APPLE TOKENS HAVE TO BE REVOKED when an account is deleted
//      (Apple's account-deletion requirement). Revoking needs a client secret - a
//      JWT signed with the Sign in with Apple key - and that key never ships in an
//      app. The app hands over a FRESH authorization code from the native Apple
//      sheet; this code exchanges it at https://appleid.apple.com/auth/token for a
//      refresh token and revokes that at https://appleid.apple.com/auth/revoke.
//   2. THE WHOLE RECORD. The database rules let an owner delete the pieces of
//      organizers/<uid> they may write, not the record itself (a proposed rules
//      change forbids it outright), so firstSeenAt and a pass were left behind. The
//      Admin SDK is not bound by the rules: organizers/<uid>, pushTokens/<uid>,
//      pushPrefs/<uid>, gps_usage/<uid> and every co-organizer pointer go here.
//
// THE ORDER: Apple first, then the data, then the Auth user LAST.
//   - An Apple revoke that fails STOPS everything: nothing is deleted, the caller
//     is told, and a retry (with a new code) finishes the job. An account deleted
//     with its Apple grant still live is the thing this function exists to stop.
//   - No code for an Apple account (the web, where Firebase's popup never hands
//     one over) is NOT a stop: the account is still deleted, and the answer says
//     appleRevoked: false with the reason, so a person is never trapped in an
//     account they asked to delete.
//   - The data goes in ONE multi-path update, then the Auth user.
//
// ROUNDS ARE NOT TOUCHED (events/*): other golfers may be scoring one right now,
// and the round code is theirs as much as the organizer's. account-exit.js says so
// on screen before anybody taps.
//
// SECRETS: the team id, key id and private key are Secret Manager secrets read at
// call time (index.js). Never logged, never returned, never stored.
// ============================================================================
'use strict';
const crypto = require('crypto');

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUD = 'https://appleid.apple.com';
const CODE_MAX = 2048;

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function unb64url(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function coded(code, message) { const e = new Error(message || code); e.code = code; return e; }

// Apple's client secret: ES256, header { alg, kid }, claims { iss: team, iat, exp,
// aud: appleid.apple.com, sub: the app's client id (its bundle id) }. Five minutes
// is plenty - it is made, used twice and thrown away inside one call.
function makeClientSecret(o, clientId, nowSec) {
    const iat = nowSec || Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: o.keyId };
    const claims = { iss: o.teamId, iat, exp: iat + 300, aud: APPLE_AUD, sub: clientId };
    const data = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
    const sig = crypto.sign('sha256', Buffer.from(data), { key: o.privateKey, dsaEncoding: 'ieee-p1363' });
    return data + '.' + b64url(sig);
}

function form(obj) {
    return Object.keys(obj).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
}

// The id_token's claims, read only to compare `sub` with the Apple id on the
// Firebase user. It came straight from Apple over TLS in answer to our own
// request, so its signature is not what is being relied on here.
function idTokenSub(idToken) {
    try { return String(JSON.parse(unb64url(String(idToken).split('.')[1]).toString('utf8')).sub || ''); }
    catch (e) { return ''; }
}

// deps: {
//   db:    { get(path), update(path, value) }        Admin SDK, rules do not apply
//   auth:  { getUser(uid), deleteUser(uid) }         Admin SDK
//   fetch: (url, init) => Response
//   apple: () => ({ teamId, keyId, privateKey, clientIds: [] })
//   now?:  () => ms
// }
function createAccountDelete(deps) {
    const now = () => (deps.now ? deps.now() : Date.now());

    async function appleCall(url, body) {
        const res = await deps.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: form(body)
        });
        let json = null;
        try { json = await res.json(); } catch (e) { json = null; }
        return { ok: !!(res && res.ok), status: res ? res.status : 0, json };
    }

    // Exchange the code, check it is THIS person's Apple id, revoke. Throws
    // 'apple-revoke-failed' (with no secret in the message) on any refusal.
    async function revokeApple(code, hint, appleUid) {
        const c = deps.apple ? deps.apple() : null;
        const ids = (c && Array.isArray(c.clientIds) ? c.clientIds : []).map(String).filter(Boolean);
        if (!c || !c.teamId || !c.keyId || !c.privateKey || !ids.length) {
            throw coded('apple-not-configured', 'Sign in with Apple revocation is not configured on the server.');
        }
        // THE APP'S OWN CLIENT ID FIRST when it says which it is (HardPan and the
        // GPS build are different bundle ids), but only one on the allow list.
        const order = hint && ids.indexOf(String(hint)) !== -1 ? [String(hint)].concat(ids.filter((i) => i !== String(hint))) : ids;
        const nowSec = Math.floor(now() / 1000);
        for (const clientId of order) {
            const secret = makeClientSecret(c, clientId, nowSec);
            const tok = await appleCall(APPLE_TOKEN_URL, { client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' });
            const err = tok.json && tok.json.error;
            // invalid_client: the code was issued to another of our bundle ids. Try the next.
            if (!tok.ok && err === 'invalid_client' && order.length > 1) continue;
            if (!tok.ok || !tok.json) throw coded('apple-revoke-failed', 'Apple refused the code (' + (err || tok.status) + ').');
            const sub = idTokenSub(tok.json.id_token);
            if (appleUid && sub && sub !== String(appleUid)) {
                throw coded('apple-account-mismatch', 'That Apple ID is not the one on this account.');
            }
            const token = tok.json.refresh_token || tok.json.access_token;
            if (!token) throw coded('apple-revoke-failed', 'Apple returned no token to revoke.');
            const rev = await appleCall(APPLE_REVOKE_URL, {
                client_id: clientId, client_secret: secret, token,
                token_type_hint: tok.json.refresh_token ? 'refresh_token' : 'access_token'
            });
            if (!rev.ok) throw coded('apple-revoke-failed', 'Apple did not confirm the revoke (' + rev.status + ').');
            return { clientId };
        }
        throw coded('apple-revoke-failed', 'Apple refused the code for every client id.');
    }

    // Every path this account owns outside the rounds, as one multi-path update.
    async function recordPaths(uid) {
        const paths = ['organizers/' + uid, 'pushTokens/' + uid, 'pushPrefs/' + uid, 'gps_usage/' + uid];
        let groups = null;
        try { groups = await deps.db.get('organizers/' + uid + '/groups'); } catch (e) { groups = null; }
        Object.keys((groups && typeof groups === 'object') ? groups : {}).forEach((gid) => {
            const co = (groups[gid] && groups[gid].coOrganizers) || {};
            Object.keys(co).forEach((emailKey) => {
                const p = 'sharedGroups/' + emailKey + '/' + uid;
                if (co[emailKey] === true && paths.indexOf(p) === -1) paths.push(p);
            });
        });
        return paths;
    }

    async function deleteAccount(auth, data) {
        if (!auth || !auth.uid) throw coded('unauthenticated', 'Sign in first.');
        const uid = String(auth.uid);
        const anonymous = !!(auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider === 'anonymous');
        if (anonymous) throw coded('failed-precondition', 'There is no account to delete.');
        const d = data || {};
        const code = typeof d.appleAuthorizationCode === 'string' ? d.appleAuthorizationCode.trim() : '';
        if (code.length > CODE_MAX) throw coded('invalid-argument', 'appleAuthorizationCode');

        let user = null;
        try { user = await deps.auth.getUser(uid); }
        catch (e) { if (!(e && e.code === 'auth/user-not-found')) throw e; }
        const apple = ((user && user.providerData) || []).filter((p) => p && p.providerId === 'apple.com')[0] || null;

        // 1. APPLE. A failure here throws before anything is deleted.
        let appleRevoked = false, appleReason = apple ? '' : 'not-apple';
        if (apple && code) {
            await revokeApple(code, d.appleClientId, apple.uid);
            appleRevoked = true;
        } else if (apple) {
            appleReason = 'no-code';
        }

        // 2. THE DATA, in one write.
        const paths = await recordPaths(uid);
        const update = {};
        paths.forEach((p) => { update[p] = null; });
        await deps.db.update('', update);

        // 3. THE AUTH USER, LAST.
        if (user) {
            try { await deps.auth.deleteUser(uid); }
            catch (e) { if (!(e && e.code === 'auth/user-not-found')) throw e; }
        }
        const out = { status: 'deleted', appleRevoked, removed: paths };
        if (!appleRevoked && appleReason) out.appleReason = appleReason;
        return out;
    }

    return { deleteAccount };
}

module.exports = { createAccountDelete, makeClientSecret, idTokenSub, APPLE_TOKEN_URL, APPLE_REVOKE_URL };
