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
    var NOTE_PASTE = 'Paste the whole link from the email, or just the code from the end of it.';
    var NOTE_CONSOLE = 'Email sign-in is not turned on for this app yet. It has to be enabled in the Firebase console before a link can be sent.';
    var NOTE_NOT_READY = 'Sign-in is not ready yet. Wait a moment and try again.';
    var NOTE_BAD_EMAIL = 'That email address does not look usable.';
    var NOTE_BAD_LINK = 'That link has expired or was already used. Send a new one from this app.';
    var NOTE_LINK_UNAVAILABLE = 'This app cannot attach the link to the current account. Sign-in was not switched to a new account.';
    var NOTE_UID_CHANGED = 'The link did not stay on this account. Nothing was switched. Send a new link from this app and finish it here.';
    var NOTE_GENERIC = 'Could not finish sign-in. Check the signal and try the link again.';
    // THE PREVIEW-DEPLOY MESSAGE, and why it is its own note (2026-09-29).
    //
    // MEASURED against the project: sending a link with a continueUrl on a branch
    // preview is refused before any email leaves -
    //     POST accounts:sendOobCode  continueUrl=https://ui-wave31-my-groups.golf-app-5a5.pages.dev/admin.html
    //       -> UNAUTHORIZED_DOMAIN : Domain not allowlisted by project
    //     the same request with https://golf-app-5a5.pages.dev/admin.html  -> accepted
    // so the cause is the ORIGIN, not the email, the signal or the account.
    //
    // The SDK reports that as `auth/unauthorized-continue-uri`, which is a DIFFERENT
    // code from `auth/unauthorized-domain` and was not in the map below - so it fell
    // through to NOTE_GENERIC and the screen said "Could not finish sign-in. Check the
    // signal", after no email had been sent and with nothing wrong with the signal.
    // Two wrong things in one line: it blamed the network, and it implied a link was
    // on its way. The note now names the real cause and both ways out.
    function noteUnauthorizedOrigin() {
        var host = '';
        try { host = String((window.location && window.location.hostname) || ''); } catch (e) { host = ''; }
        return 'No email was sent: ' + (host ? host : 'this address')
            + ' is not on this project\u2019s authorized sign-in domains, so Firebase refused the '
            + 'request. Sign in on the live app instead, or add this exact hostname in Firebase '
            + 'Console \u2192 Authentication \u2192 Settings \u2192 Authorized domains.';
    }

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
        if (code === 'auth/operation-not-allowed') return NOTE_CONSOLE;
        // BOTH forms, because the SDK uses one for the page origin and the other for
        // the continueUrl, and a preview deploy hits the second one.
        if (code === 'auth/unauthorized-domain' || code === 'auth/unauthorized-continue-uri'
            || code === 'auth/invalid-continue-uri' || code === 'auth/missing-continue-uri') {
            return noteUnauthorizedOrigin();
        }
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

    // ---- THE NOTE IS REMEMBERED, NOT DROPPED (v214) -------------------------
    //
    // install() runs at parse time, in the HEAD, and wraps window.authReady so the
    // link is finished the moment the anonymous session resolves.
    // #email-link-status is in the BODY. So this used to be a race between the
    // auth promise and the parser, and the parser lost about half the time:
    //
    //     var el = document.getElementById('email-link-status');
    //     if (!el) return;                    // ... and the sentence was gone
    //
    // Measured cold, five runs: the lookup happened at 14-22ms with the element
    // absent (readyState 'loading') and the note was lost, or at 32-39ms with it
    // present and the note landed. linked=1 and the uid correct in every run - the
    // credential was always taken onto the anonymous user, and ONLY the
    // confirmation went missing. More settle time never helped because the write
    // had already happened and been thrown away.
    //
    // So the note is kept, and flushed when there is somewhere to put it: on
    // DOMContentLoaded, on load (for a note set after DOMContentLoaded had already
    // gone), and through flushStatus() for a caller that renders the area itself.
    // Every path - publish, submitSend, submitPaste, and install()'s two error
    // arms - goes through setStatus, so this is the only place it had to be fixed.
    var lastNote = '';
    var flushArmed = false;

    function flushStatus() {
        // Never blanks the element: with nothing remembered there is nothing to
        // say, and clearing it would wipe whatever the page had put there.
        if (!lastNote) return;
        var el = document.getElementById('email-link-status');
        if (el) el.textContent = lastNote;
    }
    function armFlush() {
        if (flushArmed) return;
        var rs = (typeof document !== 'undefined') ? document.readyState : null;
        // Already loaded: neither event will fire again, and the element genuinely
        // is not on this page. Arming would be a listener that never runs.
        if (rs && rs !== 'loading' && rs !== 'interactive') return;
        flushArmed = true;
        try { document.addEventListener('DOMContentLoaded', flushStatus); } catch (e) { /* no document events */ }
        try { window.addEventListener('load', flushStatus); } catch (e) { /* no window events */ }
    }
    // A MESSAGE NOBODY CAN SEE IS NOT A MESSAGE (2026-10-08). Manny reported
    // Finish sign-in doing NOTHING - no error, no sign-in. The app did answer:
    // measured in the Account panel at 390x844, the status line rendered at top
    // 832 of an 844px viewport, 24px off the bottom of the screen. So a refusal
    // now scrolls itself into view.
    //
    // ONLY ON A REFUSAL (reveal: true), not on every note: the running
    // "Finishing sign-in…" must not yank the panel around while somebody is
    // still reading the field they just typed into.
    function setStatus(text, opts) {
        lastNote = text || '';
        if (window.emailLinkAuth) window.emailLinkAuth.lastNote = lastNote;
        var el = document.getElementById('email-link-status');
        if (el) {
            el.textContent = lastNote;
            if (opts && opts.reveal && typeof el.scrollIntoView === 'function') {
                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {
                    try { el.scrollIntoView(); } catch (e2) { /* nothing more to try */ }
                }
            }
            return;
        }
        armFlush();
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
        // THE BUTTON ITSELF SAYS SO (2026-10-08), and the answer names the NEXT
        // STEP rather than only reporting success: the thing that went wrong on
        // a phone three times running was a golfer not knowing what to do with
        // the email once it arrived.
        var send = document.getElementById('email-link-send');
        if (typeof tapBusy === 'function') tapBusy(send, '\u23F3 Sending\u2026');
        setStatus('Sending the link…');
        whenReady().then(function () { return sendLink(email); }).then(function (sent) {
            publish(sent);
            if (typeof tapDone === 'function') {
                tapDone(send, '\u2713 Email sent \u2014 copy the link from Gmail '
                    + '(press and hold \u2192 Copy Link) and paste it below, then tap Finish sign-in.');
            }
        }, function (err) {
            setStatus(messageFor(err));
            if (typeof tapFail === 'function') tapFail(send, messageFor(err));
        });
        return false;
    }

    // THE CODE ON ITS OWN (2026-10-08). Manny on TestFlight: Account -> "Use
    // email instead" -> tapped the link in the email -> it opened the WEB app,
    // so the native app stayed anonymous and he was a spectator on his own
    // rounds. The paste field already existed and a pasted LINK already
    // completed sign-in in place - but a bare oobCode was refused, and that is
    // the short thing a person can read off a screen without copying a
    // 300-character URL on a phone.
    //
    // NO UNIVERSAL LINKS NEEDED, which is the point: the completion happens
    // inside the app from text the golfer brings in. Nothing about the link
    // path changes - it is tried first, exactly as before.
    //
    // A CODE IS NOT A LOOSE WORD. The shape is Firebase's: base64url, long
    // enough that a typo is not a sign-in attempt, so "hello" is refused.
    var CODE_RE = /^[A-Za-z0-9_-]{12,512}$/;

    // WHAT A MAIL APP ACTUALLY HANDS OVER (2026-10-08). Gmail's "Copy Link"
    // does NOT give you the link: it gives its own redirect,
    // https://www.google.com/url?q=<the real link, PERCENT-ENCODED>&source=gmail
    // so "oobCode=" is present only as "oobCode%3D" and every check for the
    // real thing failed. Manny pasted the whole link, correctly, and the app
    // told him to paste the whole link.
    //
    // SO THE TEXT IS UNWRAPPED FIRST: decode repeatedly until it stops
    // changing, which handles a wrapper inside a wrapper as well as a single
    // one, and bounded so a hostile string cannot spin. Nothing is fetched and
    // nothing is followed - this is string work on what the golfer pasted.
    function unwrapPaste(text) {
        var t = String(text == null ? '' : text);
        for (var i = 0; i < 4; i++) {
            if (!/%[0-9A-Fa-f]{2}/.test(t)) break;
            var next;
            try { next = decodeURIComponent(t); } catch (e) { break; }
            if (next === t) break;
            t = next;
        }
        return t;
    }

    // THE PAGE'S OWN apiKey, never a second copy of it. Read back off the
    // initialised Firebase app, so there is one source for it.
    function pageApiKey() {
        try {
            var fb = window.firebase;
            if (fb && typeof fb.app === 'function') {
                var o = fb.app().options || {};
                if (o.apiKey) return String(o.apiKey);
            }
        } catch (e) { /* fall through */ }
        try {
            if (window.firebaseConfig && window.firebaseConfig.apiKey) return String(window.firebaseConfig.apiKey);
        } catch (e) { /* fall through */ }
        return '';
    }

    // THE WRAPPER FIREBASE ACTUALLY SENDS (2026-10-08, the build 13 no-op). The
    // email arrives as
    //
    //   https://<project>.firebaseapp.com/__/auth/links?link=<URL-ENCODED
    //       action URL with mode=signIn&oobCode=...&continueUrl=...>
    //
    // The WRAPPER is not an action URL and the SDK will not accept it; the inner
    // one is, and it already carries the apiKey. So when a paste contains an
    // inner action URL that is what gets used - Firebase's own URL, untouched,
    // rather than anything reassembled here.
    function actionUrlFromPaste(text) {
        var raw = String(text == null ? '' : text).trim();
        if (!raw) return null;
        var m = /[?&](?:link|url|target|q)=([^&#\s]+)/.exec(raw);
        if (m) {
            var inner = m[1];
            for (var i = 0; i < 4 && /%[0-9A-Fa-f]{2}/.test(inner); i++) {
                var next;
                try { next = decodeURIComponent(inner); } catch (e) { break; }
                if (next === inner) break;
                inner = next;
                if (/oobCode=/.test(inner)) break;
            }
            if (/oobCode=/.test(inner) && /^https?:\/\//.test(inner)) return inner;
        }
        if (/^https?:\/\//.test(raw) && /[?&]oobCode=/.test(raw) && !/__\/auth\/links/.test(raw)) return raw;
        return null;
    }

    function codeFromPaste(text) {
        var raw = String(text == null ? '' : text).trim();
        if (!raw) return null;
        // The bare code, before any unwrapping can mangle it.
        if (CODE_RE.test(raw)) return raw;
        var t = unwrapPaste(raw);
        var m = /[?&\s]oobCode=([A-Za-z0-9_-]+)/.exec(t)
             || /^oobCode=([A-Za-z0-9_-]+)/.exec(t)
             || /oobCode=([A-Za-z0-9_-]+)/.exec(t);
        if (m) return m[1];
        return CODE_RE.test(t) ? t : null;
    }
    // The shape signInWithEmailLink parses: it reads oobCode (and mode) out of
    // the string and ignores the rest, so the origin here is cosmetic - but it
    // is shareBaseUrl() rather than location, because inside the shell location
    // is capacitor://localhost.
    // AND IT MUST CARRY AN apiKey (2026-10-08). Without one, Firebase's real
    // isSignInWithEmailLink answers FALSE - the key is part of an action URL's
    // shape - so every pasted bare code was refused on the device. The harness
    // has no real SDK and fell through to a regex that said yes, which is
    // exactly how this passed a green suite and failed on a phone.
    function linkForCode(code, apiKey) {
        var base = (typeof shareBaseUrl === 'function') ? shareBaseUrl()
            : ((typeof window !== 'undefined' && window.shareBaseUrl) ? window.shareBaseUrl() : WEB_FALLBACK);
        var key = apiKey || pageApiKey() || 'no-api-key';
        return base + 'admin.html?apiKey=' + encodeURIComponent(key)
            + '&mode=signIn&oobCode=' + encodeURIComponent(String(code || ''));
    }

    // WRAPPED END TO END, BECAUSE THE BUG WAS A NO-OP (2026-10-08). Manny on
    // build 13: Finish sign-in did nothing at all - no sign-in and no error -
    // for the full emailed link, for the oobCode alone, and for a fresh link's
    // code. A tap that produces NOTHING is the worst outcome available here:
    // there is no way to tell a refusal from a dead button. So every path out
    // of this function ends in a sentence on screen - the synchronous work sits
    // in a try, the catch speaks, and both promise arms speak.
    //
    // THE ORDER OF PREFERENCE, and it is not arbitrary:
    //   1. the INNER ACTION URL out of Firebase's /__/auth/links wrapper - its
    //      own URL, carrying the apiKey the SDK insists on
    //   2. the paste as it stands, when it already IS a sign-in link
    //   3. a link built around whatever code can be read out of it, carrying
    //      the page's apiKey
    function submitPaste() {
        // RESOLVED BEFORE THE FIRST RETURN. Measured in Chrome on 2026-10-08:
        // every path below used to speak through setStatus alone, and the two
        // that leave early - an unparseable paste, and the catch - left the
        // BUTTON silent. That is "Finish sign-in does NOTHING" exactly: the
        // golfer pastes the wrong thing, the button does not move, and the one
        // sentence explaining why is a status line further up the card.
        var fin = document.getElementById('email-link-finish');
        try {
            var paste = document.getElementById('email-link-paste');
            var typed = paste ? String(paste.value || '').trim() : '';
            var href = '';
            var action = actionUrlFromPaste(typed);
            if (action) href = action;
            else if (isEmailLink(typed)) href = typed;
            else {
                var code = codeFromPaste(typed);
                if (code) href = linkForCode(code);
            }
            if (!href) href = pageUrl();
            if (!actionUrlFromPaste(href) && !isEmailLink(href)) {
                setStatus(NOTE_PASTE, { reveal: true });
                if (typeof tapFail === 'function') tapFail(fin, NOTE_PASTE);
                return;
            }
            var input = document.getElementById('email-link-input');
            var email = input ? input.value : '';
            // THE BUTTON SAYS IT TOO (2026-10-08): the status line alone was the
            // thing Manny could not see, twice. tap-feedback.js is optional - a
            // page without it behaves exactly as before.
            if (typeof tapBusy === 'function') tapBusy(fin, '\u23F3 Signing in\u2026');
            setStatus('Finishing sign-in\u2026');
            whenReady().then(function () { return completeLink(href, email); }).then(function (result) {
                publish(result);
                if (typeof tapDone === 'function') tapDone(fin, '\u2713 Signed in');
            }, function (err) {
                setStatus(messageFor(err), { reveal: true });
                if (typeof tapFail === 'function') tapFail(fin, messageFor(err));
            });
        } catch (e) {
            // THE CATCH SPEAKS. A missing element, an SDK that is not there, a
            // string the URL parser throws on - any of them used to leave the
            // button looking dead.
            setStatus(messageFor(e) || NOTE_PASTE, { reveal: true });
            if (typeof tapFail === 'function') tapFail(fin, messageFor(e) || NOTE_PASTE);
        }
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
        codeFromPaste: codeFromPaste,
        actionUrlFromPaste: actionUrlFromPaste,
        pageApiKey: pageApiKey,
        linkForCode: linkForCode,
        pageUrl: pageUrl,
        continueUrl: continueUrl,
        actionCodeSettings: actionCodeSettings,
        planCompletion: planCompletion,
        migrationNote: migrationNote,
        sameOrganizer: sameOrganizer,
        messageFor: messageFor,
        // v214: the note, and the two ways to put it on screen. lastNote is what
        // was said most recently, whether or not the element existed at the time.
        lastNote: '',
        setStatus: setStatus,
        flushStatus: flushStatus,
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
