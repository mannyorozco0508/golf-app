// ============================================================================
// ANDROID: hp-auth.js REFUSES APPLE AND GOOGLE IN PLAIN WORDS (android-2.0, 024 C)
//   The Android sign-in sheet offers email alone (android_signin_chrome_test.js, the tap
//   path). This is the belt under it: any other caller of signInApple / signInGoogle on
//   Android gets "On Android, sign in with email." and no native sheet is opened - not a
//   flow that cannot finish. iOS goes on to its native sheet as before.
//   Proved with the primary rule (the sheet) out of the picture: these calls come straight
//   to hp-auth.js, so the refusal is what stops them, or nothing does.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'hp-auth.js'));
const skip = ON ? false : 'Consumer tree: no hp-auth.js';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function world(platform) {
    const calls = [];
    const user = { uid: 'anon1', isAnonymous: true, email: null, displayName: null, providerData: [],
        linkWithCredential: (c) => { calls.push('link:' + c.providerId); return Promise.resolve({ user }); } };
    const auth = () => ({ currentUser: user, onAuthStateChanged: (fn) => { setTimeout(() => fn(user), 0); return () => {}; } });
    auth.OAuthProvider = function (id) { this.providerId = id; this.credential = (o) => ({ providerId: id, idToken: o.idToken }); };
    auth.GoogleAuthProvider = { credential: (id) => ({ providerId: 'google.com', idToken: id }) };
    const store = {};
    const sb = {
        console, setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Number, Math, Date, Error, RegExp, Map, Set, URL, URLSearchParams, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
        document: { createElement: () => ({ setAttribute() {}, addEventListener() {} }), head: { appendChild() {} }, querySelector: () => null },
        firebase: { auth, database: () => ({ ref: () => ({}) }) },
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        location: { href: 'https://app.test/home.html', search: '', origin: 'https://app.test', hostname: 'app.test', reload() {} },
        addEventListener() {},
        authBootState: { status: 'signed-in', uid: 'anon1' }, authReady: Promise.resolve('anon1'),
        Capacitor: { getPlatform: () => platform, isNativePlatform: () => true, Plugins: { FirebaseAuthentication: {
            signInWithApple: () => { calls.push('nativeApple'); return Promise.resolve({ credential: { idToken: 'a', nonce: 'n' } }); },
            signInWithGoogle: () => { calls.push('nativeGoogle'); return Promise.resolve({ credential: { idToken: 'g' } }); }
        } } },
        oauthSignin: null
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('hp-auth.js'), sb, { filename: 'hp-auth.js' });
    return { A: sb.HardPanAuth, calls };
}

for (const which of ['Apple', 'Google']) {
    test('ANDROID: signIn' + which + '() refuses in plain words and opens no native sheet', { skip, timeout: 5000 }, async () => {
        const w = world('android');
        // At once: a refusal, not a flow left pending.
        const r = await Promise.race([w.A['signIn' + which]().then(() => ({ ok: true }), (e) => e), new Promise((res) => setTimeout(() => res('pending'), 300))]);
        assert.ok(r && r.code === 'android-email-only' && r.message === 'On Android, sign in with email.', 'refused in plain words, got ' + (r && (r.code || r)));
        assert.deepEqual(w.calls, [], 'nothing native was asked');
    });
    test('iOS UNCHANGED: signIn' + which + '() is not refused for being on a phone', { skip, timeout: 5000 }, async () => {
        const w = world('ios');
        // iOS goes on to load oauth-signin.js, which this harness does not serve: the call stays
        // pending. Pending or failing for any other reason is fine; refused as Android is not.
        let code = null;
        const r = await Promise.race([w.A['signIn' + which]().then(() => 'done', (e) => { code = e.code; return 'failed'; }), new Promise((res) => setTimeout(() => res('pending'), 300))]);
        assert.ok(['done', 'failed', 'pending'].indexOf(r) !== -1);
        assert.notEqual(code, 'android-email-only');
    });
}
