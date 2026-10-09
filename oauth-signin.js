// ============================================================================
// ONE-TAP SIGN-IN: APPLE AND GOOGLE
//
// WHY THIS REPLACES THE EMAIL LINK AS THE FRONT DOOR. Manny tried the email link
// on his iPhone and it failed repeatedly, and the failure is structural rather
// than a bug: the link arrives in Gmail, Gmail opens it in the DEFAULT browser,
// and that is a different browser from the one the round was started in. A
// different browser is a different anonymous uid and a different IndexedDB, so
// the link lands somewhere that has never heard of the pending request - which is
// why it then asked for the email again and why pasting it back did not finish.
// No amount of copy fixes a flow whose second step leaves the app.
//
// Apple and Google never leave the browser: a popup from the user's own tap,
// postMessage back, done. One tap, no inbox, no app switch.
//
// THE UID GUARANTEE IS THE SAME ONE email-link-auth.js MAKES, and it is the whole
// reason this file is not three lines of signInWithPopup:
//
//   anonymous user, provider not yet linked   -> linkWithPopup   SAME uid, so the
//       rounds already set up on this browser, the free trial and a founder pass
//       all stay where they are
//   the provider is already on another account (the second device)
//       -> signInWithPopup, and the note SAYS the trial was not copied
//   no user at all, or already linked          -> signInWithPopup
//
// planOauth() below is the same decision table as planCompletion() in
// email-link-auth.js, and oauth_signin_test.js asserts the pair agree.
//
// BOTH PROVIDERS ARE NOW ON, and the earlier measurement is kept because it is why
// the not-enabled message exists at all. Before the console was touched on
// 2026-09-30:
//     POST accounts:createAuthUri providerId=google.com -> OPERATION_NOT_ALLOWED
//     POST accounts:createAuthUri providerId=apple.com  -> OPERATION_NOT_ALLOWED
//     "The identity provider configuration is not found."
// Google and Apple were then enabled (Apple Services ID com.rattlegolf.app.web) and
// both signed in on the preview as the organizer. So messageFor's "not switched on
// for this app yet" is now the fallback for a console that changes under us rather
// than the normal case.
// The authorized-domains list already carries golf-app-5a5.pages.dev,
// hardpangolf.com, rattlegolf.com and tournaments.rattlegolf.com - read back from
// the project, not guessed - so the popup handler is reachable from production.
//
// THE NATIVE SEAM IS WIRED, and nativeCredential() below is the whole of it on this
// side. In the Capacitor shell a popup has no window to open, so the iOS app goes
// through @capacitor-firebase/authentication and the native Apple and Google SDKs:
// the plugin is allowlisted for iOS in capacitor.config.ts (SPM, not CocoaPods, with
// the Google trait only so the Facebook SDK is not linked), skipNativeAuth keeps the
// native SDK from taking the session so an anonymous organizer is still LINKED, and
// GoogleService-Info.plist is committed - nothing in it is a secret and ios/
// .gitignore carries the reasoning. oauth_native_test.js holds that wiring.
//
// The call is still reached through a typeof guard and still returns null on the
// web, so a browser takes the popup path exactly as before. What nothing here can
// prove is a tap on a device: the Apple side also needs the Sign in with Apple
// capability on the App target, which is an Xcode step.
// ============================================================================
(function () {
    'use strict';

    var NOTE_PRESERVED = 'Signed in. This is the same organizer account, so the free trial and a founder pass stay with you. Rounds you already set up stay yours.';
    var NOTE_ADOPTED = 'Signed in as that account. The free trial and a founder pass are the ones on it - they are not copied from the anonymous account this browser had before, and rounds set up on that anonymous account are not moved.';
    var NOTE_FRESH = 'Signed in. The free trial and a founder pass, if this account has them, are the ones on this account.';
    var NOTE_CANCELLED = 'Sign-in cancelled. Nothing changed.';
    var NOTE_NOT_ENABLED = 'That sign-in is not switched on for this app yet. It has to be enabled in the Firebase console first.';
    var NOTE_POPUP_BLOCKED = 'The browser blocked the sign-in window. Allow pop-ups for this site, or use email instead.';
    var NOTE_NOT_READY = 'Sign-in is not ready yet. Wait a moment and try again.';
    var NOTE_GENERIC = 'Could not finish sign-in. Nothing changed - try again, or use email instead.';
    // THE NATIVE-ONLY FAILURES. None of these can happen in a browser popup, because
    // the popup hands Firebase a credential Firebase itself minted. On iOS the
    // credential is built here out of what the Apple or Google SDK returned, so it
    // can be wrong in ways a popup cannot, and each one needs a different answer.
    var NOTE_BAD_CREDENTIAL = 'Apple or Google signed you in, but this app could not finish it - the sign-in token was rejected. Nothing changed. Use email instead for now and tell Manny it said the token was rejected.';
    var NOTE_NO_CONNECTION = 'No connection while signing in. Nothing changed - try again when you have signal.';

    var PROVIDERS = { apple: 'apple.com', google: 'google.com' };

    function authInstance() {
        try {
            if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') return null;
            return firebase.auth();
        } catch (e) { return null; }
    }

    // The provider object, with the scopes each one needs to hand back a name and
    // an email. Apple returns the name ONLY on the first authorisation, which is
    // why nothing here depends on getting one.
    function providerFor(which) {
        var id = PROVIDERS[which];
        if (!id) return null;
        try {
            if (which === 'google') {
                var g = new firebase.auth.GoogleAuthProvider();
                g.addScope('email');
                return g;
            }
            var a = new firebase.auth.OAuthProvider(id);
            a.addScope('email');
            a.addScope('name');
            return a;
        } catch (e) { return null; }
    }

    // THE DECISION TABLE, and it is deliberately the same shape as
    // email-link-auth.js planCompletion(). user: { uid, isAnonymous } or null.
    // WHICH PROVIDERS ARE ALREADY ON THIS ACCOUNT. providerData is the SDK's own
    // list; a missing or odd shape reads as "none", which errs towards linking
    // rather than towards switching accounts.
    function linkedProviders(user) {
        var out = [];
        var list = (user && user.providerData) || [];
        for (var i = 0; i < list.length; i++) {
            var id = list[i] && list[i].providerId;
            if (id) out.push(String(id));
        }
        return out;
    }

    // THE RULE IS ABOUT THE PROVIDER, NOT ABOUT ANONYMITY (Build 12,
    // 2026-10-08). This read:
    //
    //     if (!user.isAnonymous) return { action: 'sign-in', reason: 'already-linked' };
    //
    // and "already-linked" was the wrong name for it. A golfer signed in with
    // EMAIL has no Apple provider attached, so tapping Continue with Apple ran
    // signInWithCredential and SWITCHED him to whatever account that Apple
    // identity belongs to - which is how Manny ended up with a stray
    // privaterelay account while his email account kept all his rounds.
    //
    // So: a user with the provider already on them signs in; a user WITHOUT it
    // links. `which` is optional and, when it is absent, every old caller gets
    // exactly the answer it got before - asserted as a control in
    // oauth_link_to_account_test.js.
    function planOauth(user, which) {
        if (!user || !user.uid) return { action: 'sign-in', reason: 'no-user' };
        if (user.isAnonymous) return { action: 'link', reason: 'anonymous' };
        if (!which) return { action: 'sign-in', reason: 'already-linked' };
        var want = PROVIDERS[which] || which;
        if (linkedProviders(user).indexOf(String(want)) !== -1) {
            return { action: 'sign-in', reason: 'already-linked' };
        }
        return { action: 'link', reason: 'provider-not-linked' };
    }

    // A link that fails because the credential already belongs to somebody is the
    // SECOND DEVICE, not an error: sign in as that account instead and say so.
    var ADOPT_CODES = {
        'auth/credential-already-in-use': 1,
        'auth/email-already-in-use': 1,
        'auth/account-exists-with-different-credential': 1,
        'auth/provider-already-linked': 1
    };
    function isAdoptSignal(err) {
        return !!(err && err.code && ADOPT_CODES[err.code]);
    }
    // Firebase puts the credential on the adopt errors. Prefer it; fall back to the
    // one we presented. Kept as its own function so a test can state which wins.
    function adoptCredential(err, presented) {
        var onErr = err && err.credential;
        return onErr || presented;
    }

    // ONE APPLE TOKEN, ONE FIREBASE CALL (build 7, 2026-10-09). Firebase refuses an
    // Apple ID token it has already seen: "auth/missing-or-invalid-nonce: Duplicate
    // credential received. Please try again with a new credential." On Manny's phone
    // the guest's linkWithCredential spent the token (Apple was already on his real
    // account - credential-already-in-use), and the adopt then signed in with a
    // credential carrying THE SAME token: ours when the error had none, and Firebase's
    // own when it was rebuilt from the token rather than a pendingToken. So:
    //   - every Apple token sent to Firebase is remembered (in memory, never logged),
    //     and sendApple refuses to send one twice;
    //   - the adopt uses Firebase's credential only when it is a one-time
    //     pendingToken or a token not already spent;
    //   - otherwise it asks Apple again - the plugin makes a NEW nonce per request -
    //     and signs in with that.
    var spentApple = [];
    function tokenOf(cred) {
        if (!cred) return null;
        if (cred.idToken) return String(cred.idToken);
        try { var j = typeof cred.toJSON === 'function' ? cred.toJSON() : null; return j && j.idToken ? String(j.idToken) : null; } catch (e) { return null; }
    }
    function pendingOf(cred) {
        if (!cred) return null;
        if (cred.pendingToken) return String(cred.pendingToken);
        try { var j = typeof cred.toJSON === 'function' ? cred.toJSON() : null; return j && j.pendingToken ? String(j.pendingToken) : null; } catch (e) { return null; }
    }
    function isSpent(cred) {
        var t = tokenOf(cred);
        return !pendingOf(cred) && !!t && spentApple.indexOf(t) !== -1;
    }
    function sendApple(cred, call) {
        if (isSpent(cred)) {
            return Promise.reject(Object.assign(new Error('An Apple token is never sent twice'), { code: 'auth/missing-or-invalid-nonce' }));
        }
        var t = tokenOf(cred);
        if (t && !pendingOf(cred)) { spentApple.push(t); if (spentApple.length > 8) spentApple.shift(); }
        return Promise.resolve(call(cred));
    }
    // Firebase's credential for the adopt: on the error (compat) or rebuilt from it.
    function errorCredential(err) {
        if (err && err.credential) return err.credential;
        try {
            var P = firebase.auth.OAuthProvider;
            return (P && typeof P.credentialFromError === 'function' && P.credentialFromError(err)) || null;
        } catch (e) { return null; }
    }
    // Apple only: a credential safe to sign in with after the link spent ours, or null
    // (then a fresh Apple request is the only honest way in).
    function appleAdoptCredential(err) {
        var c = errorCredential(err);
        return c && !isSpent(c) ? c : null;
    }

    function snapshot(user) {
        if (!user || !user.uid) return null;
        return { uid: String(user.uid), isAnonymous: !!user.isAnonymous, email: user.email || null };
    }

    function noteFor(before, after) {
        if (!after || !after.uid) return '';
        if (before && before.uid && String(before.uid) === String(after.uid)) return NOTE_PRESERVED;
        if (before && before.uid) return NOTE_ADOPTED;
        return NOTE_FRESH;
    }

    // THAT PROVIDER IS ON ANOTHER ACCOUNT. On a DELIBERATE "Link Apple" tap this
    // must not become an account switch: adopting is precisely the move that
    // made the stray account, and it is never what "link this to my account"
    // asked for. So it refuses, names the problem, and promises nothing.
    var NOTE_LINK_TAKEN = 'That Apple or Google account is already attached to a different account in this app, so it cannot be linked to this one. Nothing was changed. Sign in with that account instead, or remove it from the other one first.';

    // " (auth/invalid-credential: The audience in ID Token [...] does not match ...)".
    // Anything shaped like a token (eyJ...) is cut out, and it is kept short.
    function credentialDetail(err) {
        var code = String((err && err.code) || '');
        var msg = String((err && err.message) || '').replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[a-z-]+\)\.?\s*$/i, '')
            .replace(/eyJ[A-Za-z0-9_\-\.]{10,}/g, '[token]').trim();
        if (msg.length > 180) msg = msg.slice(0, 177) + '...';
        if (msg === code) msg = '';
        return (code || msg) ? ' (' + code + (msg ? ': ' + msg : '') + ')' : '';
    }

    function messageFor(err, opts) {
        var code = err && err.code;
        if (opts && opts.deliberateLink && isAdoptSignal(err)) return NOTE_LINK_TAKEN;
        if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return NOTE_NOT_ENABLED;
        if (code === 'auth/popup-blocked') return NOTE_POPUP_BLOCKED;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
            || code === 'auth/user-cancelled') return NOTE_CANCELLED;
        if (code === 'sdk-absent' || code === 'no-provider') return NOTE_NOT_READY;
        // An idToken Firebase will not accept, or a nonce that does not match the
        // one inside it. This is the native path's own failure mode.
        // THE DETAIL IS SHOWN (2026-10-09). On a new bundle (HardPan GPS,
        // com.rattlegolf.gpsbeta) Apple failed here and Google did not, and this
        // sentence alone cannot say WHICH check Firebase refused - the audience
        // (which app the token is for) or the nonce. Firebase's own message names
        // it ("The audience in ID Token [..] does not match the expected
        // audience"), so it is appended - the code and that message, never a token.
        if (code === 'auth/invalid-credential' || code === 'auth/missing-or-invalid-nonce'
            || code === 'auth/invalid-credential-or-provider-id') return NOTE_BAD_CREDENTIAL + credentialDetail(err);
        if (code === 'auth/network-request-failed') return NOTE_NO_CONNECTION;
        // The same lesson the preview sign-in fix recorded: an unauthorized ORIGIN is
        // its own failure and must not be reported as a network problem.
        if (code === 'auth/unauthorized-domain') {
            var host = '';
            try { host = String((window.location && window.location.hostname) || ''); } catch (e) { host = ''; }
            return 'Sign-in is not allowed from ' + (host || 'this address')
                + '. Add it in Firebase Console → Authentication → Settings → Authorized domains, or use the live app.';
        }
        // AN UNMAPPED CODE IS SHOWN, AND THAT IS NOT A DEBUG LEFTOVER.
        //
        // Wave 33's native Apple sign-in failed on Manny's iPhone with exactly this
        // sentence and nothing else, and there was no way to find out why: the shell
        // has no visible console, the error was caught here, and the one fact that
        // would have identified it - the code - was the one thing thrown away. A
        // message that says "could not finish" and hides WHICH failure it was costs
        // a whole round trip to a physical device every time.
        //
        // So an error this function does not recognise ends with its own code. Every
        // failure the code path expects is named above and shows a plain sentence
        // with no code in it; seeing one on screen means the mapping is missing a
        // case, which is information, not noise.
        if (code) return NOTE_GENERIC + ' (' + String(code) + ')';
        return NOTE_GENERIC;
    }

    // THE NATIVE SEAM. Returns a firebase credential from the native Apple or
    // Google SDK without signing in natively, so the JS layer can LINK it to the
    // anonymous user and keep the uid. Null on the web and in a shell without the
    // plugin, which is every build today.
    function nativeCredential(which) {
        try {
            var plugin = window.Capacitor && window.Capacitor.Plugins
                && window.Capacitor.Plugins.FirebaseAuthentication;
            if (!plugin) return null;
            var call = which === 'google' ? plugin.signInWithGoogle : plugin.signInWithApple;
            if (typeof call !== 'function') return null;
            // skipNativeAuth keeps the native SDK from creating its own session, which
            // is what leaves the JS anonymous user in place to be linked.
            return Promise.resolve(call.call(plugin, { skipNativeAuth: true })).then(function (r) {
                var c = r && r.credential;
                if (!c || !c.idToken) return null;
                return which === 'google'
                    ? firebase.auth.GoogleAuthProvider.credential(c.idToken, c.accessToken || null)
                    : new firebase.auth.OAuthProvider('apple.com').credential({
                        idToken: c.idToken, rawNonce: c.nonce || undefined });
            });
        } catch (e) { return null; }
    }

    // EVERY FAILURE IS ALSO LOGGED, because in the iOS shell console.error is the
    // only thing that reaches a place Manny can read it: Capacitor forwards web-view
    // console output to the native log, so an Xcode Cmd+R run shows the code even
    // when the screen shows a sentence. Never logs a token - the code, the message
    // and which button, nothing else.
    function logFailure(which, err) {
        try {
            if (typeof console === 'undefined' || !console.error) return;
            console.error('oauth-signin ' + String(which) + ' failed: '
                + String((err && err.code) || 'no-code') + ' ' + String((err && err.message) || ''));
        } catch (e) { /* a console that throws is not worth a failed sign-in */ }
    }

    // ONE ENTRY POINT. Returns { uid, note, preserved } or rejects with a coded
    // error; never leaves a half-signed-in state behind, because link failures fall
    // through to a full sign-in and nothing else is written on the way.
    // `opts.deliberateLink` is set by the Account sheet's "Link Apple" /
    // "Link Google" buttons: the golfer is attaching a provider to the account
    // they are already in, so being moved to a different account instead is a
    // failure, not a fallback.
    function signIn(which, opts) {
        // The one wrapper: whatever fails, the code is logged once, then rethrown
        // unchanged so the caller still decides what the screen says.
        return signInAttempt(which, opts).then(null, function (err) {
            logFailure(which, err);
            throw err;
        });
    }

    function signInAttempt(which, opts) {
        var deliberate = !!(opts && opts.deliberateLink);
        var auth = authInstance();
        if (!auth) return Promise.reject(Object.assign(new Error('sdk-absent'), { code: 'sdk-absent' }));
        var provider = providerFor(which);
        if (!provider) return Promise.reject(Object.assign(new Error('no-provider'), { code: 'no-provider' }));
        var before = snapshot(auth.currentUser);
        var plan = planOauth(auth.currentUser, which);

        function finish(cred) {
            var after = snapshot((cred && cred.user) || auth.currentUser);
            return { uid: after ? after.uid : null, email: after ? after.email : null,
                     note: noteFor(before, after),
                     preserved: !!(before && after && String(before.uid) === String(after.uid)) };
        }
        function popupSignIn() { return Promise.resolve(auth.signInWithPopup(provider)).then(finish); }

        var native = nativeCredential(which);
        if (native) {
            return native.then(function (credential) {
                if (!credential) return popupSignIn();
                var apple = which !== 'google';
                var user = auth.currentUser;
                var link = function (c) { return user.linkWithCredential(c); };
                var signInWith = function (c) { return auth.signInWithCredential(c); };
                if (plan.action === 'link' && user) {
                    return (apple ? sendApple(credential, link) : Promise.resolve(link(credential)))
                        .then(finish, function (err) {
                            // A DELIBERATE LINK NEVER ADOPTS. The golfer asked to
                            // attach this provider to the account they are in; being
                            // moved to a different account instead is the defect.
                            if (deliberate) throw err;
                            if (!isAdoptSignal(err)) throw err;
                            // THE CREDENTIAL ON THE ERROR, WHEN THERE IS ONE. Firebase
                            // attaches it to credential-already-in-use and
                            // account-exists-with-different-credential precisely so the
                            // second step does not have to re-present the first one,
                            // and for Apple that matters: the popup path never re-uses
                            // a credential because the SDK hands back a fresh one, and
                            // the native path was the only place doing it. GOOGLE
                            // falls back to the credential we built (a Google token
                            // may be presented again). APPLE never does.
                            if (!apple) return Promise.resolve(signInWith(adoptCredential(err, credential))).then(finish);
                            // APPLE: never the spent token again (see sendApple).
                            var onErr = appleAdoptCredential(err);
                            if (onErr) return sendApple(onErr, signInWith).then(finish);
                            var again = nativeCredential(which);
                            if (!again) throw err;
                            return again.then(function (fresh) {
                                if (!fresh) throw err;
                                return sendApple(fresh, signInWith).then(finish);
                            });
                        });
                }
                return (apple ? sendApple(credential, signInWith) : Promise.resolve(signInWith(credential))).then(finish);
            });
        }

        if (plan.action === 'link' && auth.currentUser) {
            return Promise.resolve(auth.currentUser.linkWithPopup(provider))
                .then(finish, function (err) {
                    if (deliberate) throw err;          // see the native path above
                    if (!isAdoptSignal(err)) throw err;
                    return popupSignIn();
                });
        }
        return popupSignIn();
    }

    window.oauthSignin = {
        PROVIDERS: PROVIDERS,
        linkedProviders: linkedProviders,
        NOTE_LINK_TAKEN: NOTE_LINK_TAKEN,
        planOauth: planOauth,
        isAdoptSignal: isAdoptSignal,
        noteFor: noteFor,
        messageFor: messageFor,
        providerFor: providerFor,
        nativeCredential: nativeCredential,
        adoptCredential: adoptCredential,
        appleAdoptCredential: appleAdoptCredential,
        signIn: signIn,
        notes: { preserved: NOTE_PRESERVED, adopted: NOTE_ADOPTED, fresh: NOTE_FRESH,
                 cancelled: NOTE_CANCELLED, notEnabled: NOTE_NOT_ENABLED,
                 popupBlocked: NOTE_POPUP_BLOCKED, notReady: NOTE_NOT_READY, generic: NOTE_GENERIC }
    };
})();
