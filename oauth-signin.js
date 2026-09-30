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
    function planOauth(user) {
        if (!user || !user.uid) return { action: 'sign-in', reason: 'no-user' };
        if (!user.isAnonymous) return { action: 'sign-in', reason: 'already-linked' };
        return { action: 'link', reason: 'anonymous' };
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

    function messageFor(err) {
        var code = err && err.code;
        if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return NOTE_NOT_ENABLED;
        if (code === 'auth/popup-blocked') return NOTE_POPUP_BLOCKED;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
            || code === 'auth/user-cancelled') return NOTE_CANCELLED;
        if (code === 'sdk-absent' || code === 'no-provider') return NOTE_NOT_READY;
        // The same lesson the preview sign-in fix recorded: an unauthorized ORIGIN is
        // its own failure and must not be reported as a network problem.
        if (code === 'auth/unauthorized-domain') {
            var host = '';
            try { host = String((window.location && window.location.hostname) || ''); } catch (e) { host = ''; }
            return 'Sign-in is not allowed from ' + (host || 'this address')
                + '. Add it in Firebase Console → Authentication → Settings → Authorized domains, or use the live app.';
        }
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

    // ONE ENTRY POINT. Returns { uid, note, preserved } or rejects with a coded
    // error; never leaves a half-signed-in state behind, because link failures fall
    // through to a full sign-in and nothing else is written on the way.
    function signIn(which) {
        var auth = authInstance();
        if (!auth) return Promise.reject(Object.assign(new Error('sdk-absent'), { code: 'sdk-absent' }));
        var provider = providerFor(which);
        if (!provider) return Promise.reject(Object.assign(new Error('no-provider'), { code: 'no-provider' }));
        var before = snapshot(auth.currentUser);
        var plan = planOauth(auth.currentUser);

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
                if (plan.action === 'link' && auth.currentUser) {
                    return Promise.resolve(auth.currentUser.linkWithCredential(credential))
                        .then(finish, function (err) {
                            if (!isAdoptSignal(err)) throw err;
                            return Promise.resolve(auth.signInWithCredential(credential)).then(finish);
                        });
                }
                return Promise.resolve(auth.signInWithCredential(credential)).then(finish);
            });
        }

        if (plan.action === 'link' && auth.currentUser) {
            return Promise.resolve(auth.currentUser.linkWithPopup(provider))
                .then(finish, function (err) {
                    if (!isAdoptSignal(err)) throw err;
                    return popupSignIn();
                });
        }
        return popupSignIn();
    }

    window.oauthSignin = {
        PROVIDERS: PROVIDERS,
        planOauth: planOauth,
        isAdoptSignal: isAdoptSignal,
        noteFor: noteFor,
        messageFor: messageFor,
        providerFor: providerFor,
        nativeCredential: nativeCredential,
        signIn: signIn,
        notes: { preserved: NOTE_PRESERVED, adopted: NOTE_ADOPTED, fresh: NOTE_FRESH,
                 cancelled: NOTE_CANCELLED, notEnabled: NOTE_NOT_ENABLED,
                 popupBlocked: NOTE_POPUP_BLOCKED, notReady: NOTE_NOT_READY, generic: NOTE_GENERIC }
    };
})();
