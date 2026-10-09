// ============================================================================
// ONE-TAP SIGN-IN, AND THE UID GUARANTEE IT INHERITS
//
// WHY THE EMAIL LINK IS BEING DEMOTED, and it is structural rather than a bug.
// Manny tried it on his iPhone and it failed repeatedly: the link arrives in
// Gmail, Gmail opens it in the DEFAULT browser, and that is a different browser
// from the one the round was started in. A different browser is a different
// anonymous uid and a different IndexedDB, so the link lands somewhere that has
// never heard of the pending request - which is why it asked for the email again
// and why pasting it back did not finish. No copy change fixes a flow whose second
// step leaves the app.
//
// MEASURED, AND NOTHING WORKS UNTIL THE CONSOLE IS TOUCHED. As of 2026-09-30,
// against the real project with its public client key:
//
//   POST accounts:createAuthUri providerId=google.com
//     -> OPERATION_NOT_ALLOWED : The identity provider configuration is not found.
//   POST accounts:createAuthUri providerId=apple.com
//     -> the same
//   authorizedDomains (read back, not guessed): localhost,
//     golfapp-9fb21.firebaseapp.com, golfapp-9fb21.web.app, golf-app-5a5.pages.dev,
//     tournaments.rattlegolf.com, rattlegolf.com, hardpangolf.com
//   the popup handler https://golfapp-9fb21.firebaseapp.com/__/auth/handler -> 200
//
// So the handler is reachable from production and the two providers are OFF. This
// branch is not merged, and the buttons SAY that rather than failing blank -
// messageFor maps auth/operation-not-allowed and auth/configuration-not-found to
// "not switched on for this app yet".
//
// THE UID GUARANTEE IS THE ONE email-link-auth.js ALREADY MAKES, and the test below
// asserts the two decision tables agree rather than trusting that they do:
//   anonymous            -> LINK, same uid, so rounds, the trial and a pass stay
//   already linked       -> sign in
//   no user              -> sign in
//   link says the credential is already in use -> that is the SECOND DEVICE: sign
//   in as that account, and the note says the trial was not copied
//
// WHAT THIS FILE OWNS, NOW THAT THE NATIVE HALF EXISTS. In the Capacitor shell a
// popup has no window to open, so iOS goes through @capacitor-firebase/
// authentication and the native SDKs. That wiring - the iOS allowlist, the Google-
// only SPM trait, skipNativeAuth, the Google URL scheme out of the committed
// GoogleService-Info.plist, and what nativeCredential() builds from the plugin's
// reply - is oauth_native_test.js. This file stays on the DECISION TABLE: link vs
// sign in, and the note each outcome shows. nativeCredential() is still reached
// through a typeof guard and still returns null in a browser, so every test here
// takes the popup path, which is also what every web build does.
//
// THE RED BASELINE, all 12 tests, measured against main 8a4a980 where
// oauth-signin.js does not exist:
//
//     0 PASS / 12 FAIL
//
// BASELINE COUNT DELTA: +3 the linking case added in Build 12 (2026-10-08), and two
// on 2026-10-09 (a rejected token says which check failed; a sign-in that works
// clears every earlier failure note). The Build 12 one: a
// signed-in user WITHOUT that provider must LINK it rather than be switched to
// whatever account owns it. It is the other half of the test above it, and the
// half that was broken: planOauth inferred "already linked" from isAnonymous
// alone, so an email account tapping Google was moved rather than linked. It
// would have been red against 8a4a980 too, for the same no-module reason, but
// it was not measured there - so it is declared rather than folded into a
// number it was not part of.
//
// Every one is red for the same reason - there is no module - and the file earns
// its keep from the first line of it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
let O = null;
try { O = loadJsFile('oauth-signin.js').oauthSignin; } catch (e) { O = null; }
const need = () => { assert.ok(O, 'oauth-signin.js must exist and load as a plain global'); return O; };

// A firebase stand-in whose auth calls are recorded, so "which call was made" is
// the assertion rather than a guess. No network, no popup, no provider needed.
function fakeFirebase(opts) {
    const o = opts || {};
    const calls = [];
    const user = o.user === undefined
        ? { uid: 'anon-1', isAnonymous: true, email: null }
        : o.user;
    const after = o.after || { uid: 'anon-1', isAnonymous: false, email: 'a@b.com' };
    const mk = name => (arg) => {
        calls.push(name);
        if (o.fail && o.fail[name]) return Promise.reject(Object.assign(new Error(name), { code: o.fail[name] }));
        return Promise.resolve({ user: after });
    };
    const auth = {
        currentUser: user && {
            uid: user.uid, isAnonymous: user.isAnonymous, email: user.email,
            // providerData TRAVELS (2026-10-08). The stub used to copy three
            // fields and drop this one, which was harmless while planOauth only
            // looked at isAnonymous - and silently defeated every fixture the
            // moment the rule became "is this provider already on the account".
            // A fixture whose data never reaches the code under test is the
            // same class of fault as an empty slice.
            providerData: user.providerData || [],
            linkWithPopup: mk('linkWithPopup'), linkWithCredential: mk('linkWithCredential')
        },
        signInWithPopup: mk('signInWithPopup'),
        signInWithCredential: mk('signInWithCredential')
    };
    const fb = function () { return auth; };
    return { calls, auth, firebase: Object.assign(fb, {
        auth: Object.assign(function () { return auth; }, {
            GoogleAuthProvider: function () { this.addScope = () => {}; },
            OAuthProvider: function () { this.addScope = () => {}; this.credential = () => ({}); }
        })
    }) };
}
function withFirebase(stub) {
    const sb = loadJsFile('oauth-signin.js');
    sb.firebase = stub.firebase;
    sb.window.firebase = stub.firebase;
    return sb.oauthSignin;
}

describe('one-tap sign-in keeps the organizer', () => {

    test('the module is a plain global with one entry point', () => {
        const o = need();
        ['signIn', 'planOauth', 'messageFor', 'noteFor', 'isAdoptSignal', 'nativeCredential']
            .forEach(f => assert.equal(typeof o[f], 'function', f));
        assert.deepEqual(Object.keys(o.PROVIDERS).sort(), ['apple', 'google']);
        assert.equal(o.PROVIDERS.apple, 'apple.com');
        assert.equal(o.PROVIDERS.google, 'google.com');
    });

    test('THE DECISION TABLE AGREES WITH email-link-auth.js, rather than being trusted to', () => {
        const o = need();
        const E = loadJsFile('email-link-auth.js').emailLinkAuth;
        const cases = [
            [null, 'sign-in'],
            [{ uid: 'a', isAnonymous: true }, 'link'],
            [{ uid: 'a', isAnonymous: false }, 'sign-in']
        ];
        cases.forEach(([user, want]) => {
            assert.equal(o.planOauth(user).action, want, 'oauth: ' + JSON.stringify(user));
            assert.equal(E.planCompletion(user, null).action, want, 'email link: ' + JSON.stringify(user));
        });
    });

    test('AN ANONYMOUS ORGANIZER IS LINKED, so the uid and the trial survive', async () => {
        const stub = fakeFirebase();
        const o = withFirebase(stub);
        const r = await o.signIn('google');
        assert.deepEqual(stub.calls, ['linkWithPopup'], 'it must LINK, not sign in fresh');
        assert.equal(r.preserved, true);
        assert.equal(r.uid, 'anon-1', 'the same uid the rounds are on');
        assert.equal(r.note, o.notes.preserved);
    });

    test('THE SECOND DEVICE: a credential already in use signs in, and SAYS the trial moved', async () => {
        const stub = fakeFirebase({
            fail: { linkWithPopup: 'auth/credential-already-in-use' },
            after: { uid: 'other-account', isAnonymous: false, email: 'a@b.com' }
        });
        const o = withFirebase(stub);
        const r = await o.signIn('apple');
        assert.deepEqual(stub.calls, ['linkWithPopup', 'signInWithPopup'], 'link first, then adopt');
        assert.equal(r.preserved, false);
        assert.equal(r.uid, 'other-account');
        assert.equal(r.note, o.notes.adopted);
        assert.match(r.note, /not copied/, 'the note must not imply the trial came along');
    });

    test('all four "already belongs to somebody" codes are the adopt path', () => {
        const o = need();
        ['auth/credential-already-in-use', 'auth/email-already-in-use',
            'auth/account-exists-with-different-credential', 'auth/provider-already-linked']
            .forEach(c => assert.equal(o.isAdoptSignal({ code: c }), true, c));
        // And a genuine failure is NOT: a network error must not silently switch
        // accounts, which is the one thing worse than failing.
        ['auth/network-request-failed', 'auth/popup-blocked', 'auth/internal-error']
            .forEach(c => assert.equal(o.isAdoptSignal({ code: c }), false, c));
    });

    test('A REAL FAILURE PROPAGATES - nothing is switched behind the golfer back', async () => {
        const stub = fakeFirebase({ fail: { linkWithPopup: 'auth/network-request-failed' } });
        const o = withFirebase(stub);
        await assert.rejects(() => o.signIn('google'), e => e.code === 'auth/network-request-failed');
        assert.deepEqual(stub.calls, ['linkWithPopup'], 'and it did NOT fall through to a sign-in');
    });

    test('an already-linked user signs in and is not linked again', async () => {
        // THE FIXTURE NOW SAYS WHICH PROVIDER IS LINKED, and that is the point
        // of the Build 12 change rather than a loosening (2026-10-08). This
        // fixture used to declare only isAnonymous:false and rely on
        // planOauth INFERRING "already linked" from it - and that inference was
        // the defect: a golfer signed in with EMAIL has no Google provider on
        // him, so the inference sent him down signInWithCredential and SWITCHED
        // his account. Measured in the project's auth: that is how a stray
        // privaterelay account appeared while the email account kept all 38
        // rounds. The rule is about the PROVIDER now, so a test about an
        // already-linked user has to say what is linked.
        const stub = fakeFirebase({
            user: { uid: 'u-real', isAnonymous: false, email: 'a@b.com',
                    providerData: [{ providerId: 'google.com' }] },
            after: { uid: 'u-real', isAnonymous: false, email: 'a@b.com' } });
        const o = withFirebase(stub);
        const r = await o.signIn('google');
        assert.deepEqual(stub.calls, ['signInWithPopup']);
        assert.equal(r.preserved, true);
    });

    test('and a signed-in user WITHOUT that provider LINKS it instead of switching', async () => {
        // The other half of the same rule, and the one that was broken: an
        // email account tapping Google must have Google attached to it, not be
        // moved to whatever account owns that Google identity.
        const stub = fakeFirebase({
            user: { uid: 'u-real', isAnonymous: false, email: 'a@b.com',
                    providerData: [{ providerId: 'password' }] },
            after: { uid: 'u-real', isAnonymous: false, email: 'a@b.com' } });
        const o = withFirebase(stub);
        const r = await o.signIn('google');
        assert.deepEqual(stub.calls, ['linkWithPopup'], 'it switched accounts instead of linking');
        assert.equal(r.preserved, true, 'the uid must not move when a provider is linked');
    });

    test('THE PROVIDERS ARE OFF TODAY, and the button says so instead of failing blank', () => {
        const o = need();
        assert.equal(o.messageFor({ code: 'auth/operation-not-allowed' }), o.notes.notEnabled);
        assert.equal(o.messageFor({ code: 'auth/configuration-not-found' }), o.notes.notEnabled);
        assert.match(o.notes.notEnabled, /Firebase console/, 'and names where to switch it on');
        // The measurement is recorded next to the code that handles it.
        assert.match(read('oauth-signin.js'), /OPERATION_NOT_ALLOWED/);
    });

    test('a cancelled popup is not an error, and a blocked one says what to do', () => {
        const o = need();
        ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']
            .forEach(c => assert.equal(o.messageFor({ code: c }), o.notes.cancelled, c));
        assert.match(o.messageFor({ code: 'auth/popup-blocked' }), /Allow pop-ups|use email instead/);
        // The lesson from the preview sign-in fix, carried forward: an unauthorized
        // ORIGIN is its own failure and is never reported as a network problem.
        const m = o.messageFor({ code: 'auth/unauthorized-domain' });
        assert.match(m, /Authorized domains/);
        assert.ok(!/Check the signal/.test(m));
    });

    test('THE NATIVE PATH IS A SEAM, reached only when the plugin is there', () => {
        const o = need();
        assert.equal(o.nativeCredential('google'), null, 'no plugin, no native path');
        const src = read('oauth-signin.js');
        assert.match(src, /skipNativeAuth: true/,
            'the native SDK must not create its own session, or there is no anonymous '
            + 'user left to link and the uid guarantee is gone');
        assert.match(src, /linkWithCredential/, 'and the credential is LINKED, not signed in');
        // THIS LINE USED TO ASSERT THE OPPOSITE, and the flip is the point rather
        // than a loosened test. While the native half was unbuilt, "the plist is
        // not in this repo" was one of the three facts that made it unreachable
        // from here. The plist is now committed - nothing in it is a secret, it
        // ships inside every binary, and ios/.gitignore carries the reasoning - so
        // asserting its ABSENCE would now fail on a correct tree. What is still
        // true, and is what this file actually owns, is the line above: with no
        // plugin on the window there is no native path, so every test here takes
        // the popup path. The wiring is oauth_native_test.js's.
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'ios/App/App/GoogleService-Info.plist')),
            'GoogleService-Info.plist is committed - without it the iOS build has no Firebase options and Continue with Google is dead on the device');
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'ios/App/CapApp-SPM/Package.swift')),
            'the iOS project is SPM, not CocoaPods');
        assert.match(read('capacitor.config.ts'), /THE iOS TARGET LINKS EXACTLY THESE/,
            'and iOS plugins are an explicit allowlist');
    });

    test('THE PANEL leads with one tap and keeps email as the fallback', () => {
        const src = read('admin.html');
        const acct = src.slice(src.indexOf('id="account-modal"'), src.indexOf('<!-- Dot Game Modal -->'));
        assert.ok(acct.indexOf('id="oauth-card"') < acct.indexOf('id="email-link-card"'),
            'one tap comes first');
        assert.match(acct, /Continue with Apple/);
        assert.match(acct, /Continue with Google/);
        assert.match(acct, /<section id="email-link-card"[^>]*style="display:none;"/,
            'the email card ships hidden');
        assert.match(acct, /Use email instead/, 'and is one tap away');
        assert.match(src, /<script src="oauth-signin\.js"><\/script>/);
    });

    test('and every write in the panel is CONDITIONAL, because of the mutation loop', () => {
        // watchAccountStatus observes #account-modal with subtree + characterData +
        // childList and answers by calling refreshAccountState. An unconditional
        // textContent write re-fires it, which calls back, which writes again: 33.7s
        // to a CDP timeout in headless Chrome, twice now in this file's history.
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function oauthTap'), src.indexOf('function openAccountPanel'));
        assert.ok(!/\.textContent\s*=/.test(fn), 'no direct textContent write: ' + fn.slice(0, 200));
        assert.match(fn, /setTextOnce\(/, 'it goes through setTextOnce');
        assert.match(fn, /emailFallbackShown/, 'and the fallback state is a boolean, not a style read');
    });
});

// ---------------------------------------------------------------------------
// 2026-10-09 (HardPan GPS build 4 on a real iPhone): Apple's token was rejected
// and Google worked; the sentence alone could not say why, and the red note
// stayed on the sheet after Google signed in.
// ---------------------------------------------------------------------------
test('a rejected token says WHICH check failed - Firebase\'s code and message - and never the token', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'oauth-signin.js'), 'utf8');
    const sb = { window: { location: { hostname: 'x' } }, console };
    require('vm').runInNewContext(src, sb);
    const O = sb.window.oauthSignin;
    const msg = O.messageFor({ code: 'auth/invalid-credential', message: 'Firebase: The audience in ID Token [com.rattlegolf.gpsbeta] does not match the expected audience. (auth/invalid-credential).' });
    assert.match(msg, /the sign-in token was rejected/);
    assert.match(msg, /\(auth\/invalid-credential: The audience in ID Token \[com\.rattlegolf\.gpsbeta\] does not match the expected audience\.?\)$/);
    const jwt = O.messageFor({ code: 'auth/invalid-credential', message: 'bad token eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.eyJhdWQiOiJ4In0.sig' });
    assert.ok(!/eyJ/.test(jwt), 'a token reached the screen: ' + jwt);
});

test('a sign-in that works clears every sign-in failure on the sheet', () => {
    const admin = require('fs').readFileSync(require('path').join(__dirname, 'admin.html'), 'utf8');
    assert.match(admin, /function clearSignInFailures\(\)/);
    const tap = admin.slice(admin.indexOf('function oauthTap('), admin.indexOf('function oauthTap(') + 900);
    assert.match(tap, /signIn\(which\)\.then\(function \(r\) \{\s*clearSignInFailures\(\);/);
    const link = admin.slice(admin.indexOf('function oauthLinkTap('), admin.indexOf('function oauthLinkTap(') + 900);
    assert.match(link, /\.then\(function \(r\) \{\s*clearSignInFailures\(\);/);
    assert.match(admin, /if \(linked && typeof clearSignInFailures === 'function'\) clearSignInFailures\(\);/, 'the email path clears them too');
});
