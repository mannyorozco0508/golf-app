// ============================================================================
// GolfApp — email-link sign-in that KEEPS the anonymous uid (Consumer, Wave 1)
//
// WHY. Anonymous auth is per browser origin. The App Store app, Safari, the
// home-screen PWA and a Mac are four organizers. On 2026-09-21 a round created
// in the app showed its organizer as a spectator in Safari. v200's organizer
// link is a bearer workaround. This is the account: Firebase email link, taken
// onto the anonymous user with linkWithCredential, so the uid does not change.
//
// WHAT IS KEYED ON THAT UID, AND WHAT THIS FILE DOES NOT MOVE
//   organizers/<uid>/firstSeenAt   the 21-day trial clock. Write-once, by the
//                                  organizer gate, before a round is created.
//   organizers/<uid>/pass          a founder pass (or any pass). ".write": false
//                                  in database.rules.json — this client cannot
//                                  copy it, and must not try.
//   events/<code>/ownerUid         the round's organizer. Immutable once set.
// Linking the anonymous user leaves all three where they are, because the uid
// in them is still the uid. A second device that signs in with the same email
// ADOPTS that uid (signInWithEmailLink). Its own anonymous organizers/<old>
// record is left behind and is not merged — a pass cannot be written by a
// client, and a fresh firstSeenAt on the adopted uid is refused (write-once).
// Rounds created on the abandoned anonymous uid stay on it.
//
// WHICH CALL
//   current user is anonymous  -> linkWithCredential(EmailAuthProvider
//                                 .credentialWithLink). Same uid.
//   no user, or already linked -> signInWithEmailLink.
//   link rejected because the email is already on an account
//     (auth/email-already-in-use, auth/credential-already-in-use,
//      auth/provider-already-linked)
//                              -> signInWithEmailLink. That is the second
//                                 device. The uid becomes the account that
//                                 already holds the trial and the pass.
// A link that returned a different uid is a failure, not a success: this file
// will not report the organizer as preserved.
//
// THE LINK HAS TO BE FINISHED BY THE BROWSER THAT ASKED. The continue URL is
// the web origin's admin.html (shareBaseUrl, never capacitor://localhost —
// that is not an address an email can open, and index.html with no ?game=
// redirects away and would drop the code). Inside the iOS shell the message
// says to paste the link back into this app. Opening it in another browser
// first attaches the email THERE.
//
// NOT IN THIS FILE. No database write. No security-rules change. No purchase,
// no StoreKit, no "buy" — a pass already on this uid simply stays.
// tournament.html does not load this. It keeps email-and-password.
// ============================================================================
(function () {
    if (typeof window === 'undefined') return;

    var EMAIL_KEY = 'golfapp_email_for_sign_in';
    var UID_KEY = 'golfapp_email_link_uid';
    var WEB_FALLBACK = 'https://golf-app-5a5.pages.dev/';
    var IOS_BUNDLE = 'com.rattlegolf.app';

    var ALREADY_ON_ACCOUNT = {
        'auth/email-already-in-use': true,
        'auth/credential-already-in-use': true,
        'auth/provider-already-linked': true
    };

    var NOTE_PRESERVED = 'Signed in. This is the same organizer account, so the free trial and a founder pass stay with you. Rounds you already set up stay yours.';
    var NOTE_ADOPTED = 'Signed in on this device as your email account. The free trial and a founder pass stay on that account. They are not copied from the anonymous account this browser had before, and rounds set up on that anonymous account are not moved.';
    var NOTE_FRESH = 'Signed in. The free trial and a founder pass, if this account has them, are the ones on this account.';
    var NOTE_SENT = 'Link sent. Open it in this app, or paste it below. Finish here before you open it in another browser — that would start a different account and leave the free trial and a founder pass behind.';
    var NOTE_NEED_EMAIL = 'Enter the same email address the link was sent to, then tap Finish sign-in.';
    var NOTE_PASTE = 'Paste the whole link from the email.';
    var NOTE_CONSOLE = 'Email sign-in is not turned on for this app yet. It has to be enabled in the Firebase console before a link can be sent.';
    var NOTE_NOT_READY = 'Sign-in is not ready yet. Wait a moment and try again.';
    var NOTE_BAD_EMAIL = 'That email address does not look usable.';
    var NOTE_BAD_LINK = 'That link has expired or was already used. Send a new one from this app.';
    var NOTE_LINK_UNAVAILABLE = 'This app cannot attach the link to the current account. Sign-in was not switched to a new account.';
    var NOTE_UID_CHANGED = 'The link did not stay on this account. Nothing was switched. Send a new link from this app and finish it here.';
    var NOTE_GENERIC = 'Could not finish sign-in. Check the signal and try the link again.';

    function normalizeEmail(email) {
        return String(email == null ? '' : email).trim().toLowerCase();
    }
    function isPlausibleEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function authInstance() {
        var fb = window.firebase;
        if (!fb || typeof fb.auth !== 'function') return null;
        try { return fb.auth(); } catch (e) { return null; }
    }

    function pageUrl() {
        var loc = window.location || {};
        var href = String(loc.href || '');
        var search = String(loc.search || '');
        if (/oobCode=/.test(href)) return href;
        if (/oobCode=/.test(search)) {
            var base = href.split('?')[0] || (WEB_FALLBACK + 'admin.html');
            return base + (search.charAt(0) === '?' ? search : ('?' + search));
        }
        return href;
    }

    function isEmailLink(url) {
        var s = String(url || '');
        if (!s || !/oobCode=/.test(s)) return false;
        var a = authInstance();
        if (a && typeof a.isSignInWithEmailLink === 'function') {
            try { return !!a.isSignInWithEmailLink(s); } catch (e) { /* the URL shape below */ }
        }
        return /[?&]mode=signIn(?:&|$)/.test(s) && /[?&]oobCode=[^&#\s]+/.test(s);
    }

    // Where the email sends the golfer back. shareBaseUrl() is the web origin
    // inside Capacitor and THIS origin on http(s), so a preview deploy does not
    // email a production link. admin.html, not index.html: the scorecard sends
    // a visitor with no ?game= straight to the lobby and would drop the code.
    function continueUrl() {
        var base = null;
        try {
            if (typeof shareBaseUrl === 'function') base = shareBaseUrl();
            else if (typeof window.shareBaseUrl === 'function') base = window.shareBaseUrl();
        } catch (e) { base = null; }
        if (!base) {
            var origin = String((window.location && window.location.origin) || '');
            base = /^https?:\/\//i.test(origin) ? origin.replace(/\/+$/, '') + '/' : WEB_FALLBACK;
        }
        return String(base).replace(/\/+$/, '') + '/admin.html';
    }

    function actionCodeSettings(url) {
        return {
            url: url || continueUrl(),
            handleCodeInApp: true,
            iOS: { bundleId: IOS_BUNDLE },
            android: { packageName: IOS_BUNDLE, installApp: false }
        };
    }

    // user: { uid, isAnonymous } or null. pending: { email, uid } from THIS
    // device when it sent the link, or null.
    // Anonymous, and not a different anonymous uid than the one that asked
    // -> link. A stored request for a different uid means this browser is not
    // the one whose trial should absorb the email.
    function planCompletion(user, pending) {
        if (!user || !user.uid) return { action: 'sign-in', reason: 'no-user' };
        if (!user.isAnonymous) return { action: 'sign-in', reason: 'already-linked' };
        if (pending && pending.uid && String(pending.uid) !== String(user.uid)) {
            return { action: 'sign-in', reason: 'different-anonymous-user' };
        }
        return { action: 'link', reason: 'anonymous' };
    }

    function migrationNote(before, after) {
        if (!after || !after.uid) return '';
        if (before && before.uid && String(before.uid) === String(after.uid)) return NOTE_PRESERVED;
        if (before && before.uid) return NOTE_ADOPTED;
        return NOTE_FRESH;
    }

    function sameOrganizer(beforeUid, afterUid) {
        return !!(beforeUid && afterUid && String(beforeUid) === String(afterUid));
    }

    function readPending() {
        try {
            var email = localStorage.getItem(EMAIL_KEY);
            if (!email) return null;
            return { email: normalizeEmail(email), uid: localStorage.getItem(UID_KEY) || null };
        } catch (e) { return null; }
    }
    function rememberPending(email, uid) {
        try {
            localStorage.setItem(EMAIL_KEY, email);
            if (uid) localStorage.setItem(UID_KEY, String(uid));
            else localStorage.removeItem(UID_KEY);
        } catch (e) { /* private mode: the finish screen asks for the email */ }
    }
    function clearPending() {
        try { localStorage.removeItem(EMAIL_KEY); localStorage.removeItem(UID_KEY); } catch (e) {}
    }

    function messageFor(err) {
        var code = err && err.code;
        if (code === 'auth/operation-not-allowed' || code === 'auth/unauthorized-domain') return NOTE_CONSOLE;
        if (code === 'sdk-absent') return NOTE_NOT_READY;
        if (code === 'auth/invalid-email') return NOTE_BAD_EMAIL;
        if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') return NOTE_BAD_LINK;
        if (code === 'link-unavailable') return NOTE_LINK_UNAVAILABLE;
        if (code === 'link-uid-changed') return NOTE_UID_CHANGED;
        if (code === 'auth/missing-email') return NOTE_NEED_EMAIL;
        return NOTE_GENERIC;
    }

    function snapshotUser(user) {
        if (!user || !user.uid) return null;
        return { uid: String(user.uid), isAnonymous: !!user.isAnonymous, email: user.email || null };
    }

    function publishBoot(user, email) {
        var state = window.authBootState;
        if (!state || !user || !user.uid) return;
        // auth-boot owns the pending -> signed-in transition and resolves
        // authReady there. Overwriting status while it is still pending would
        // make that resolver return early and leave the promise hanging.
        state.uid = user.uid;
        state.email = user.email || email || state.email || null;
        if (state.status !== 'pending') state.status = 'signed-in';
    }

    function setStatus(text) {
        var el = document.getElementById('email-link-status');
        if (!el) return;
        el.textContent = text || '';
    }

    function provider() {
        var fb = window.firebase;
        var authFn = fb && fb.auth;
        return (authFn && authFn.EmailAuthProvider) || null;
    }

    function linkCredential(auth, cred) {
        var user = auth.currentUser;
        if (user && typeof user.linkWithCredential === 'function') return user.linkWithCredential(cred);
        if (typeof auth.linkWithCredential === 'function') return auth.linkWithCredential(cred);
        var err = new Error('link-unavailable');
        err.code = 'link-unavailable';
        return Promise.reject(err);
    }

    function userFrom(cred, auth) {
        return (cred && cred.user) || (auth && auth.currentUser) || null;
    }

    var inflight = null;

    function runComplete(href, email, pending) {
        var auth = authInstance();
        if (!auth) {
            var missing = new Error('sdk-absent');
            missing.code = 'sdk-absent';
            return Promise.reject(missing);
        }
        var before = snapshotUser(auth.currentUser);
        var plan = planCompletion(before, pending);

        function finish(user, how) {
            clearPending();
            var after = snapshotUser(user);
            if (after) after.email = after.email || email;
            publishBoot(after, email);
            var preserved = how === 'link' && sameOrganizer(before && before.uid, after && after.uid);
            return {
                status: 'signed-in',
                how: how,
                before: before,
                after: after,
                preserved: preserved,
                note: migrationNote(before, after)
            };
        }
        function signIn() {
            if (typeof auth.signInWithEmailLink !== 'function') {
                var err = new Error('sdk-absent');
                err.code = 'sdk-absent';
                return Promise.reject(err);
            }
            return Promise.resolve(auth.signInWithEmailLink(email, href)).then(function (cred) {
                var u = userFrom(cred, auth);
                if (!u || !u.uid) {
                    var noUser = new Error('no-user');
                    noUser.code = 'no-user';
                    throw noUser;
                }
                return finish(u, 'sign-in');
            });
        }
        function link() {
            var EmailAuthProvider = provider();
            if (!EmailAuthProvider || typeof EmailAuthProvider.credentialWithLink !== 'function') {
                var err = new Error('link-unavailable');
                err.code = 'link-unavailable';
                return Promise.reject(err);
            }
            var cred;
            try { cred = EmailAuthProvider.credentialWithLink(email, href); }
            catch (e) { return Promise.reject(e); }
            return Promise.resolve(linkCredential(auth, cred)).then(function (result) {
                var u = userFrom(result, auth);
                if (!u || !u.uid) {
                    var noUser = new Error('no-user');
                    noUser.code = 'no-user';
                    throw noUser;
                }
                if (before && before.uid && String(u.uid) !== String(before.uid)) {
                    var changed = new Error('link-uid-changed');
                    changed.code = 'link-uid-changed';
                    throw changed;
                }
                return finish(u, 'link');
            }, function (err) {
                if (err && ALREADY_ON_ACCOUNT[err.code]) return signIn();
                throw err;
            });
        }
        return plan.action === 'link' ? link() : signIn();
    }

    function completeLink(url, emailOpt) {
        var href = String(url || pageUrl() || '');
        if (!isEmailLink(href)) return Promise.resolve({ status: 'not-link' });
        var pending = readPending();
        var email = normalizeEmail(emailOpt || (pending && pending.email) || '');
        if (!isPlausibleEmail(email)) return Promise.resolve({ status: 'need-email', note: NOTE_NEED_EMAIL });
        if (inflight && inflight.href === href && inflight.email === email) return inflight.promise;
        var promise = runComplete(href, email, pending);
        inflight = { href: href, email: email, promise: promise };
        promise.then(function () { if (inflight && inflight.promise === promise) inflight = null; }, function () { if (inflight && inflight.promise === promise) inflight = null; });
        return promise;
    }

    function sendLink(email) {
        var norm = normalizeEmail(email);
        if (!isPlausibleEmail(norm)) {
            var bad = new Error('invalid-email');
            bad.code = 'auth/invalid-email';
            return Promise.reject(bad);
        }
        var auth = authInstance();
        if (!auth || typeof auth.sendSignInLinkToEmail !== 'function') {
            var missing = new Error(auth ? 'operation-not-allowed' : 'sdk-absent');
            missing.code = auth ? 'auth/operation-not-allowed' : 'sdk-absent';
            return Promise.reject(missing);
        }
        var user = auth.currentUser;
        var uid = user && user.uid ? String(user.uid) : null;
        var settings = actionCodeSettings(continueUrl());
        rememberPending(norm, uid);
        return Promise.resolve(auth.sendSignInLinkToEmail(norm, settings)).then(function () {
            return { email: norm, uid: uid, continueUrl: settings.url, note: NOTE_SENT };
        }, function (err) {
            clearPending();
            throw err;
        });
    }

    function publish(result) {
        window.emailLinkAuth.lastResult = result || null;
        if (!result) return;
        if (result.note) setStatus(result.note);
        else if (result.status === 'need-email') setStatus(NOTE_NEED_EMAIL);
    }

    function whenReady() {
        var ready = window.authReady;
        if (ready && typeof ready.then === 'function') {
            return ready.then(function (uid) { return uid; }, function () { return null; });
        }
        return Promise.resolve(null);
    }

    function submitSend(ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        var input = document.getElementById('email-link-input');
        var email = input ? input.value : '';
        setStatus('Sending the link…');
        whenReady().then(function () { return sendLink(email); }).then(function (sent) {
            publish(sent);
        }, function (err) {
            setStatus(messageFor(err));
        });
        return false;
    }

    function submitPaste() {
        var paste = document.getElementById('email-link-paste');
        var typed = paste ? String(paste.value || '').trim() : '';
        var href = typed || pageUrl();
        if (!isEmailLink(href)) { setStatus(NOTE_PASTE); return; }
        var input = document.getElementById('email-link-input');
        var email = input ? input.value : '';
        setStatus('Finishing sign-in…');
        whenReady().then(function () { return completeLink(href, email); }).then(function (result) {
            publish(result);
        }, function (err) {
            setStatus(messageFor(err));
        });
    }

    window.emailLinkAuth = {
        EMAIL_KEY: EMAIL_KEY,
        UID_KEY: UID_KEY,
        IOS_BUNDLE: IOS_BUNDLE,
        NOTE_PRESERVED: NOTE_PRESERVED,
        NOTE_ADOPTED: NOTE_ADOPTED,
        NOTE_FRESH: NOTE_FRESH,
        NOTE_SENT: NOTE_SENT,
        NOTE_NEED_EMAIL: NOTE_NEED_EMAIL,
        NOTE_CONSOLE: NOTE_CONSOLE,
        NOTE_UID_CHANGED: NOTE_UID_CHANGED,
        normalizeEmail: normalizeEmail,
        isPlausibleEmail: isPlausibleEmail,
        isEmailLink: isEmailLink,
        pageUrl: pageUrl,
        continueUrl: continueUrl,
        actionCodeSettings: actionCodeSettings,
        planCompletion: planCompletion,
        migrationNote: migrationNote,
        sameOrganizer: sameOrganizer,
        messageFor: messageFor,
        readPending: readPending,
        sendLink: sendLink,
        completeLink: completeLink,
        submitSend: submitSend,
        submitPaste: submitPaste
    };

    // Finish a link the moment this page is that link — after anonymous auth
    // has landed, so linkWithCredential sees the organizer's uid and not a
    // signed-out gap (which would signInWithEmailLink and mint a new one).
    // authReady is replaced only on this URL, so every other arrival keeps the
    // promise auth-boot created.
    function install() {
        if (window.__emailLinkAuthInstalled) return;
        window.__emailLinkAuthInstalled = true;
        var href = pageUrl();
        if (!isEmailLink(href)) return;
        var prev = window.authReady;
        if (!prev || typeof prev.then !== 'function') return;
        window.authReady = prev.then(function (uid) {
            return completeLink(href).then(function (result) {
                publish(result);
                return (result && result.after && result.after.uid) || uid;
            }, function (err) {
                setStatus(messageFor(err));
                return uid;
            });
        }, function (err) {
            return completeLink(href).then(function (result) {
                if (result && result.after && result.after.uid) {
                    publish(result);
                    return result.after.uid;
                }
                setStatus(messageFor(err));
                throw err;
            });
        });
        window.authReady.catch(function () {});
    }
    install();
})();
