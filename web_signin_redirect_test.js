// ============================================================================
// WEB SIGN-IN BY REDIRECT (web-signin-redirect, 2026-11-07)
//
// Manny's live check on hardpangolf.com: Chrome blocked the Google popup on the
// second try. Continue with / Link Apple and Google now go BY REDIRECT on
// hardpangolf.com and golf-app-5a5.pages.dev, which needs Firebase's "Option 3"
// (reverse-proxy /__/auth/ to firebaseapp.com, authDomain = the page's own host)
// because Safari and Chrome partition the third-party iframe a redirect returns
// through. oauth-signin.js holds the reasoning.
//
// WHAT THIS FILE PROVES (node, a vm realm per case, a fake Firebase that records
// every call and a real-shaped sessionStorage):
//   1. THE HOSTS - redirect only on the two listed hosts, and only when the app
//      really was initialised with that host as authDomain; everywhere else, and
//      for every caller that does not ask, the POPUP exactly as before.
//   2. THE UID GUARANTEE, as the popup keeps it: an anonymous organizer is
//      LINKED (linkWithRedirect, same uid, note "same organizer account");
//      the second device adopts with Firebase's credential off the error and
//      says nothing was copied; a deliberate link refuses; Back = nothing changed.
//   3. THE PROXY - functions/_middleware.js forwards /__/auth/ and /__/firebase/
//      to the project's firebaseapp.com host, GET and POST, never a 302 of its
//      own, and everything it blocked before is still blocked.
//   4. THE WORKER leaves /__/ to the network; THE PAGE is wired (positive
//      assertions on every slice).
// WHAT IT CANNOT PROVE: a real Google or Apple sign-in, the real Pages runtime,
// or a real browser's storage partitioning. web_signin_redirect_chrome_test.js
// drives the real page and the real auth SDK in Chrome against the Auth
// emulator; the console steps (OAuth redirect URIs, Apple return URLs) are
// Manny's and nothing here can see them.
//
// COUNTS (final run of the final file, 2026-11-07): 36 tests - on
// web-signin-redirect 36 pass / 0 fail; against origin/main d2f9ef9f 4 pass /
// 32 fail (4 + 32 = 36). The 4 green on main are the "unchanged" guarantees:
// signIn(which) is still the popup, a host that cannot redirect falls back to
// the popup, a shell navigation is still served, delete re-auth stays popup.
// Controls C1-C9 (report): each one turned this file and/or the Chrome file red.
// ============================================================================
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('oauth-signin.js');

function fakeStorage(seed) {
    const m = new Map(Object.entries(seed || {}));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

// One realm: the module, a host, a fake auth. `fail` maps a call name to an error
// code (or an error object); `redirectResult` is what getRedirectResult resolves.
function realm(o) {
    o = o || {};
    const calls = [];
    const host = o.host === undefined ? 'hardpangolf.com' : o.host;
    let user = o.user === undefined ? { uid: 'anon-1', isAnonymous: true, email: null, providerData: [] } : o.user;
    const fail = o.fail || {};
    const mkErr = (v) => (typeof v === 'string' ? Object.assign(new Error(v), { code: v }) : v);
    const rec = (name, ret) => function () {
        calls.push(name);
        if (fail[name]) return Promise.reject(mkErr(fail[name]));
        return Promise.resolve(typeof ret === 'function' ? ret.apply(null, arguments) : ret);
    };
    const withUser = (u) => { if (u) u.linkWithPopup = rec('linkWithPopup', () => ({ user: u })); if (u) u.linkWithRedirect = rec('linkWithRedirect', undefined); if (u) u.linkWithCredential = rec('linkWithCredential', () => ({ user: u })); return u; };
    withUser(user);
    const auth = {
        get currentUser() { return user; },
        app: { options: { authDomain: o.authDomain === undefined ? host : o.authDomain } },
        signInWithPopup: rec('signInWithPopup', () => ({ user: { uid: 'popup-user', isAnonymous: false, email: 'p@x' } })),
        signInWithRedirect: rec('signInWithRedirect', undefined),
        getRedirectResult: rec('getRedirectResult', () => (typeof o.redirectResult === 'function' ? o.redirectResult() : (o.redirectResult === undefined ? { user: user } : o.redirectResult))),
        signInWithCredential: rec('signInWithCredential', (c) => { user = withUser({ uid: 'owner-of-' + (c && c.tag), isAnonymous: false, email: 'g@x', providerData: [{ providerId: 'google.com' }] }); return { user }; })
    };
    if (o.noRedirectApi) { delete auth.signInWithRedirect; }
    const firebase = Object.assign(function () { return auth; }, {});
    firebase.auth = Object.assign(function () { return auth; }, {
        GoogleAuthProvider: function () { this.providerId = 'google.com'; this.addScope = () => {}; },
        OAuthProvider: Object.assign(function (id) { this.providerId = id; this.addScope = () => {}; this.credential = () => ({}); }, {
            credentialFromError: (e) => (e && e.__fromError) || null })
    });
    const storage = o.storage || fakeStorage();
    const sb = { console: { error() {}, warn() {}, log() {} }, Promise, JSON, Date, Object, String, Error, Array, Math,
        location: { hostname: host }, sessionStorage: storage, firebase };
    if (o.capacitor) sb.Capacitor = o.capacitor;
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'oauth-signin.js' });
    return { O: sb.oauthSignin, calls, auth, storage, setUser: (u) => { user = withUser(u); }, get user() { return user; } };
}
const PENDING = 'hardpan_oauth_redirect_pending';

describe('1. WHICH HOSTS GO BY REDIRECT', () => {
    test('the two Cloudflare Pages hosts, and only those', () => {
        const r = realm();
        assert.deepEqual([...r.O.REDIRECT_HOSTS].sort(), ['golf-app-5a5.pages.dev', 'hardpangolf.com']);
    });
    test('authDomainFor: the page host on a listed host, firebaseapp.com everywhere else', () => {
        const r = realm();
        assert.equal(r.O.authDomainFor('hardpangolf.com'), 'hardpangolf.com');
        assert.equal(r.O.authDomainFor('golf-app-5a5.pages.dev'), 'golf-app-5a5.pages.dev');
        for (const h of ['abc123.golf-app-5a5.pages.dev', 'rattlegolf.com', 'localhost', '127.0.0.1', '', 'www.hardpangolf.com']) {
            assert.equal(r.O.authDomainFor(h), 'golfapp-9fb21.firebaseapp.com', h);
        }
    });
    test('redirectAvailable on hardpangolf.com with authDomain = hardpangolf.com', () => {
        assert.equal(realm().O.redirectAvailable(), true);
    });
    test('NOT when the app was initialised with firebaseapp.com (an old cached admin.html)', () => {
        assert.equal(realm({ authDomain: 'golfapp-9fb21.firebaseapp.com' }).O.redirectAvailable(), false);
    });
    test('NOT on a preview subdomain, NOT in the native shell, NOT without sessionStorage, NOT without the SDK call', () => {
        assert.equal(realm({ host: 'abc.golf-app-5a5.pages.dev' }).O.redirectAvailable(), false);
        assert.equal(realm({ capacitor: { Plugins: { FirebaseAuthentication: {} } } }).O.redirectAvailable(), false);
        assert.equal(realm({ storage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('blocked'); }, removeItem() {} } }).O.redirectAvailable(), false);
        assert.equal(realm({ noRedirectApi: true }).O.redirectAvailable(), false);
    });
});

describe('2. THE POPUP IS UNCHANGED FOR EVERY CALLER THAT DOES NOT ASK', () => {
    test('signIn(which) with no options on hardpangolf.com is still linkWithPopup', async () => {
        const r = realm();
        await r.O.signIn('google');
        assert.deepEqual(r.calls, ['linkWithPopup']);
        assert.equal(r.storage.getItem(PENDING), null, 'a popup sign-in left a redirect note behind');
    });
    test('{ redirect: true } on a host that cannot redirect falls back to the popup', async () => {
        const r = realm({ host: 'rattlegolf.com', authDomain: 'golfapp-9fb21.firebaseapp.com' });
        const out = await r.O.signIn('apple', { redirect: true });
        assert.deepEqual(r.calls, ['linkWithPopup']);
        assert.equal(out.preserved, true);
    });
});

describe('3. THE UID GUARANTEE, BY REDIRECT', () => {
    test('an ANONYMOUS organizer is LINKED by redirect - never a fresh sign-in', async () => {
        const r = realm();
        const out = await r.O.signIn('google', { redirect: true });
        assert.deepEqual(r.calls, ['linkWithRedirect'], 'it must LINK the anonymous user, not sign in fresh');
        assert.equal(out.redirecting, true);
        const p = JSON.parse(r.storage.getItem(PENDING));
        assert.equal(p.action, 'link');
        assert.equal(p.which, 'google');
        assert.equal(p.before.uid, 'anon-1');
        assert.equal(p.deliberate, false);
    });
    test('BACK: the same uid comes back, the note says the trial and rounds stay', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('apple', { redirect: true });
        // the page reloads: a NEW realm, the same tab storage, the same (now linked) uid
        const r2 = realm({ storage, user: { uid: 'anon-1', isAnonymous: false, email: 'a@privaterelay', providerData: [{ providerId: 'apple.com' }] } });
        const out = await r2.O.resumeRedirect();
        assert.deepEqual(r2.calls, ['getRedirectResult']);
        assert.equal(out.uid, 'anon-1');
        assert.equal(out.preserved, true);
        assert.equal(out.note, r2.O.notes.preserved);
        assert.equal(out.which, 'apple');
        assert.equal(storage.getItem(PENDING), null, 'the note is one answer per trip');
    });
    test('a page load that started NO redirect asks Firebase nothing', async () => {
        const r = realm();
        assert.equal(await r.O.resumeRedirect(), null);
        assert.deepEqual(r.calls, []);
    });
    test('THE SECOND DEVICE: credential-already-in-use signs in with Firebase\'s credential, and SAYS nothing moved', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('google', { redirect: true });
        const err = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { tag: 'G' } });
        const r2 = realm({ storage, fail: { getRedirectResult: err } });
        const out = await r2.O.resumeRedirect();
        assert.deepEqual(r2.calls, ['getRedirectResult', 'signInWithCredential'], 'link first, then adopt - the popup order');
        assert.equal(out.uid, 'owner-of-G');
        assert.equal(out.preserved, false);
        assert.equal(out.note, r2.O.notes.adopted);
    });
    test('APPLE adopts with the error\'s own credential (credentialFromError), never re-sending a spent one', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('apple', { redirect: true });
        const err = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', __fromError: { tag: 'A', pendingToken: 'p1' } });
        const r2 = realm({ storage, fail: { getRedirectResult: err } });
        const out = await r2.O.resumeRedirect();
        assert.deepEqual(r2.calls, ['getRedirectResult', 'signInWithCredential']);
        assert.equal(out.uid, 'owner-of-A');
    });
    test('no credential on the error: ONE plain signInWithRedirect (the popup\'s second popup), and never a third', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('google', { redirect: true });
        const err = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use' });
        const r2 = realm({ storage, fail: { getRedirectResult: err } });
        const out = await r2.O.resumeRedirect();
        assert.deepEqual(r2.calls, ['getRedirectResult', 'signInWithRedirect']);
        assert.equal(out.redirecting, true);
        const p = JSON.parse(storage.getItem(PENDING));
        assert.equal(p.adopting, true);
        assert.equal(p.before.uid, 'anon-1', 'the before-uid survives the second trip, so the note stays honest');
        // and if THAT one also comes back in use, it stops
        const r3 = realm({ storage, fail: { getRedirectResult: err } });
        await assert.rejects(r3.O.resumeRedirect(), (e) => e.code === 'auth/credential-already-in-use');
        assert.deepEqual(r3.calls, ['getRedirectResult']);
    });
    test('A DELIBERATE LINK that comes back in use is REFUSED - never an account switch', async () => {
        const storage = fakeStorage();
        const email = { uid: 'h8', isAnonymous: false, email: 'm@x', providerData: [{ providerId: 'password' }] };
        const r = realm({ storage, user: email });
        await r.O.signIn('google', { redirect: true, deliberateLink: true });
        assert.deepEqual(r.calls, ['linkWithRedirect'], 'an email account must LINK Google, not switch');
        const err = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { tag: 'G' } });
        const r2 = realm({ storage, user: email, fail: { getRedirectResult: err } });
        await assert.rejects(r2.O.resumeRedirect(), (e) => {
            assert.equal(e.deliberate, true);
            assert.equal(r2.O.messageFor(e, { deliberateLink: true }), r2.O.NOTE_LINK_TAKEN);
            return true;
        });
        assert.deepEqual(r2.calls, ['getRedirectResult'], 'it signed in as the other account');
    });
    test('a real failure propagates and nothing is switched', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('google', { redirect: true });
        const r2 = realm({ storage, fail: { getRedirectResult: 'auth/network-request-failed' } });
        await assert.rejects(r2.O.resumeRedirect(), (e) => e.code === 'auth/network-request-failed' && e.which === 'google');
        assert.deepEqual(r2.calls, ['getRedirectResult']);
    });
    test('BACK BUTTON at Google (no result): "not finished, nothing changed"', async () => {
        const storage = fakeStorage();
        await realm({ storage }).O.signIn('google', { redirect: true });
        const r2 = realm({ storage, redirectResult: { user: null } });
        await assert.rejects(r2.O.resumeRedirect(), (e) => {
            assert.equal(e.code, 'auth/redirect-cancelled');
            assert.equal(r2.O.messageFor(e), r2.O.notes.redirectCancelled);
            assert.match(r2.O.messageFor(e), /Nothing changed/);
            return true;
        });
    });
    test('nobody signed in: signInWithRedirect; provider already on the account: signInWithRedirect', async () => {
        const r = realm({ user: null });
        await r.O.signIn('google', { redirect: true });
        assert.deepEqual(r.calls, ['signInWithRedirect']);
        const r2 = realm({ user: { uid: 'u', isAnonymous: false, email: 'e', providerData: [{ providerId: 'google.com' }] } });
        await r2.O.signIn('google', { redirect: true });
        assert.deepEqual(r2.calls, ['signInWithRedirect']);
    });
    test('the SDK refusing before it leaves clears the note and rejects with its code', async () => {
        const r = realm({ fail: { linkWithRedirect: 'auth/operation-not-allowed' } });
        await assert.rejects(r.O.signIn('apple', { redirect: true }), (e) => e.code === 'auth/operation-not-allowed');
        assert.equal(r.storage.getItem(PENDING), null);
    });
    test('a stale note (over 30 minutes) is dropped without asking Firebase', async () => {
        const storage = fakeStorage({ [PENDING]: JSON.stringify({ v: 1, which: 'google', action: 'link', before: { uid: 'anon-1' }, at: Date.now() - 31 * 60 * 1000 }) });
        const r = realm({ storage });
        assert.equal(await r.O.resumeRedirect(), null);
        assert.deepEqual(r.calls, []);
        assert.equal(storage.getItem(PENDING), null);
    });
    test('CONTROL: the redirect decision is the same planOauth table the popup uses', () => {
        const at = SRC.indexOf('function startRedirect');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 300, 'startRedirect slice collapsed');
        assert.match(fn, /plan\.action === 'link'/);
        assert.match(fn, /linkWithRedirect/);
        assert.match(fn, /signInWithRedirect/);
    });
});

let M = null;
before(async () => { M = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', '_middleware.js')).href); });

describe('4. THE PROXY (functions/_middleware.js, Firebase option 3)', () => {
    test('the two prefixes are forwarded; nothing else is', () => {
        for (const p of ['/__/auth/handler', '/__/auth/handler.js', '/__/auth/iframe', '/__/auth/iframe.js', '/__/auth/experiments.js', '/__/auth/links', '/__/firebase/init.json']) {
            assert.equal(M.isAuthProxyPath(p), true, p);
        }
        for (const p of ['/', '/admin.html', '/__/', '/__/other', '/api/x', '/__auth/handler', '/x/__/auth/handler', '/__/auth/../tools/x', '/__/auth/%2e%2e/x']) {
            assert.equal(M.isAuthProxyPath(p), false, p);
        }
    });
    test('to the project\'s own firebaseapp.com, same path and query, whatever the request host', () => {
        assert.equal(M.AUTH_PROXY_ORIGIN, 'https://golfapp-9fb21.firebaseapp.com');
        assert.equal(M.authProxyTarget('https://hardpangolf.com/__/auth/handler?apiKey=k&authType=signInViaRedirect'),
            'https://golfapp-9fb21.firebaseapp.com/__/auth/handler?apiKey=k&authType=signInViaRedirect');
        assert.equal(M.authProxyTarget('https://evil.example/__/auth/iframe'), 'https://golfapp-9fb21.firebaseapp.com/__/auth/iframe');
    });
    test('GET: forwarded transparently, redirect manual, no Host header, never cached', async () => {
        let seen = null;
        const fake = async (url, init) => { seen = { url, init }; return new Response('<html>handler</html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
        const req = new Request('https://hardpangolf.com/__/auth/handler?x=1', { headers: { 'cf-connecting-ip': '1.2.3.4', accept: 'text/html' } });
        const res = await M.authProxy(req, fake);
        assert.equal(seen.url, 'https://golfapp-9fb21.firebaseapp.com/__/auth/handler?x=1');
        assert.equal(seen.init.method, 'GET');
        assert.equal(seen.init.redirect, 'manual', 'a 302 from Firebase must reach the browser, not be followed here');
        assert.equal(seen.init.headers.get('host'), null);
        assert.equal(seen.init.headers.get('cf-connecting-ip'), null);
        assert.equal(seen.init.headers.get('accept'), 'text/html');
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '<html>handler</html>');
        assert.equal(res.headers.get('cache-control'), 'no-store');
    });
    test('POST (Apple answers by form_post): the body goes through byte for byte', async () => {
        let seen = null;
        const fake = async (url, init) => { seen = { url, init }; return new Response('ok', { status: 200 }); };
        const body = 'code=abc&id_token=eyJx&state=s1';
        await M.authProxy(new Request('https://hardpangolf.com/__/auth/handler', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), fake);
        assert.equal(seen.init.method, 'POST');
        assert.equal(Buffer.from(seen.init.body).toString(), body);
        assert.equal(seen.init.headers.get('content-type'), 'application/x-www-form-urlencoded');
    });
    test('a redirect from Firebase is handed back as-is (Location intact)', async () => {
        const fake = async () => new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/o/oauth2/auth?x=1' } });
        const res = await M.authProxy(new Request('https://hardpangolf.com/__/auth/handler'), fake);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), 'https://accounts.google.com/o/oauth2/auth?x=1');
    });
    test('other methods are refused', async () => {
        const res = await M.authProxy(new Request('https://hardpangolf.com/__/auth/handler', { method: 'DELETE' }), async () => { throw new Error('must not fetch'); });
        assert.equal(res.status, 405);
    });
    test('onRequest: /__/auth/ is proxied, a page still goes to next(), a blocked path is still 404', async () => {
        let nexted = 0;
        const ctx = (u) => ({ request: new Request(u), next: async () => { nexted++; return new Response('static'); } });
        const page = await M.onRequest(ctx('https://hardpangolf.com/'));
        assert.equal(await page.text(), 'static');
        const blocked = await M.onRequest(ctx('https://hardpangolf.com/tools/x.js'));
        assert.equal(blocked.status, 404);
        assert.equal(nexted, 1);
        const at = read('functions/_middleware.js').indexOf('export async function onRequest');
        const fn = read('functions/_middleware.js').slice(at, at + 400);
        assert.match(fn, /isAuthProxyPath\(pathname\)\) return authProxy\(context\.request\)/);
    });
    test('_routes.json sends /__/auth/* and /__/firebase/* to the Function, and still holds every old rule', () => {
        const R = JSON.parse(read('_routes.json'));
        assert.ok(R.include.includes('/__/auth/*'));
        assert.ok(R.include.includes('/__/firebase/*'));
        for (const r of ['/', '/api/*', '/tools/*', '/*_test.js', '//*']) assert.ok(R.include.includes(r), r);
        assert.ok(R.include.length + R.exclude.length <= 100);
    });
});

describe('5. THE SERVICE WORKER LEAVES /__/ ALONE', () => {
    const { loadServiceWorker, ORIGIN } = require('./helpers/sw-harness.js');
    test('a navigation to /__/auth/handler is not answered from the cache or the shell', async () => {
        for (const online of [true, false]) {
            const sw = loadServiceWorker(path.join(REPO_ROOT, 'sw.js'), { online });
            const r = await sw.request({ url: ORIGIN + '/__/auth/handler?apiKey=k', mode: 'navigate', destination: 'document' });
            assert.equal(r.handled, false, 'online=' + online);
            assert.ok(!sw.puts.some((u) => /\/__\//.test(u)));
        }
    });
    test('POSITIVE CONTROL: a shell navigation IS still answered', async () => {
        const sw = loadServiceWorker(path.join(REPO_ROOT, 'sw.js'), { online: true });
        const r = await sw.request({ url: 'admin.html', mode: 'navigate', destination: 'document' });
        assert.equal(r.handled, true);
    });
    test('the version moved, with its Moved to line', () => {
        const sw = read('sw.js');
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v408-2\.0';/);
        assert.match(sw, /\/\/ Moved to v383-2\.0 \(web sign-in by redirect\)/);
    });
});

describe('6. THE PAGE IS WIRED', () => {
    const html = read('admin.html');
    test('authDomain comes from authDomainFor, with the old literal as the fallback', () => {
        const at = html.indexOf('const firebaseConfig = {');
        const cfg = html.slice(at, html.indexOf('};', at));
        assert.ok(cfg.length > 100, 'firebaseConfig slice collapsed');
        assert.match(cfg, /authDomainFor\(location\.hostname\)/);
        assert.match(cfg, /"golfapp-9fb21\.firebaseapp\.com"/);
    });
    test('the two Continue taps and the two Link taps ask for the redirect', () => {
        const fnOf = (name) => { const at = html.indexOf('function ' + name + '('); return html.slice(at, html.indexOf('\n    function ', at + 10)); };
        const tap = fnOf('oauthTap'), link = fnOf('oauthLinkTap');
        assert.ok(tap.length > 200 && link.length > 200, 'slice collapsed');
        assert.match(tap, /signIn\(which, \{ redirect: true \}\)/);
        assert.match(link, /signIn\(which, \{ deliberateLink: true, redirect: true \}\)/);
        assert.match(tap, /r\.redirecting/);
    });
    test('the delete re-authentication still uses the popup (it must not leave the page mid-delete)', () => {
        const at = html.indexOf('function accountReauthFn');
        const fn = html.slice(at, html.indexOf('\n    }', at));
        assert.match(fn, /oauthSignin\.signIn\(which\)/);
        assert.doesNotMatch(fn, /redirect/);
    });
    test('a failure note shown to a signed-in account is cleared only when the ACCOUNT changes, not on every repaint', () => {
        const at = html.indexOf('function refreshAccountState');
        const fn = html.slice(at, html.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 400, 'slice collapsed');
        assert.match(fn, /data-failures-cleared-for/);
        assert.match(fn, /clearSignInFailures\(\)/);
        assert.doesNotMatch(fn, /if \(linked && typeof clearSignInFailures === 'function'\) clearSignInFailures\(\);/, 'the clear-on-every-repaint line is back');
    });
    test('the page resumes on load, after authReady, and answers beside the right button', () => {
        const at = html.indexOf('function resumeOauthRedirect');
        const fn = html.slice(at, html.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 400, 'slice collapsed');
        assert.match(fn, /redirectPending\(\)/);
        assert.match(fn, /openAccountPanel\(\)/);
        assert.match(fn, /oauthLinkDone/);
        assert.match(fn, /oauthSignedInDone/);
        assert.match(fn, /window\.authReady/);
        assert.match(fn, /ready\.then\(go, go\)/);
    });
});
