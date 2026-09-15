// ============================================================================
// GolfApp — Anonymous Auth at boot (SHARED CORE)
//
// MONETIZATION.md, build step 1. Every Consumer page loads this ONE tag,
// directly after firebase-app-compat.js. It makes auth.uid exist and exposes
//
//     window.authReady   a promise: resolves to the uid, rejects on failure
//     window.authBootState  { status: 'pending'|'signed-in'|'failed', uid, reason }
//
// so the create path can await the uid in a later wave. NOTHING awaits it in
// this wave, and nothing on any page may wait for it at render: a page that
// renders behind a pending network call is a page that shows nothing at a
// course with no signal.
//
// FIRE AND FORGET, BY CONSTRUCTION
//   - This tag runs at parse time, before the page's inline initializeApp, so
//     it only CREATES the promise here. The work starts on a zero-delay timer,
//     which fires after parsing - after initializeApp, after every other tag.
//   - The auth SDK (firebase-auth-compat.js, 132 KB) is NOT a blocking tag on
//     the page. This file injects it as an async <script> from its own
//     directory, so parsing and first paint never wait for it. A page that
//     already has firebase.auth() (a test harness, or a page that loads the
//     SDK itself) skips the injection.
//   - A persisted user is asked for first (onAuthStateChanged's first
//     emission): a returning device has its anonymous user restored from
//     IndexedDB with no network at all, and a page that signs in some other
//     way is never clobbered. Only when nobody is restored is a new anonymous
//     user made.
//
// OFFLINE AND FAILURE ARE NORMAL, NOT ERRORS. signInAnonymously is an HTTPS
// call and fails offline with auth/network-request-failed; an SDK that did
// not load, or a provider not enabled in the console, fails too. authReady
// rejects with that reason, authBootState says so, ONE console.warn is
// written, and nothing else changes: no alert, no retry loop, no unhandled
// rejection (the promise carries its own no-op catch, so a page that never
// asked is never told). A consumer that awaits it sees the rejection.
//
// tournament.html does NOT load this: its gates treat any signed-in user as
// an organizer, so an anonymous user would hide its sign-in form and become a
// tournament's ownerUid. It keeps its own SDK tag and email sign-in.
// ============================================================================
(function () {
    if (typeof window === 'undefined') return;

    var settle = {};
    var ready = new Promise(function (resolve, reject) { settle.resolve = resolve; settle.reject = reject; });
    // An un-awaited rejection is the normal offline case, never an event.
    ready.catch(function () { });
    var state = { status: 'pending', uid: null, reason: null };
    window.authReady = ready;
    window.authBootState = state;

    // Where this file was served from, so the SDK is fetched from beside it -
    // the same directory on the web, in www/app and on file://.
    var here = (document.currentScript && document.currentScript.src) ? document.currentScript.src : '';
    var SDK = here.replace(/[^\/]*$/, '') + 'firebase-auth-compat.js';

    function fail(reason, err) {
        if (state.status !== 'pending') return;
        state.status = 'failed';
        state.reason = reason;
        var e = err || new Error('auth-boot: ' + reason);
        if (!e.code) e.code = reason;
        try { console.warn('auth-boot: no anonymous session (' + reason + ')'); } catch (x) { }
        settle.reject(e);
    }
    function ok(user) {
        if (state.status !== 'pending') return;
        state.status = 'signed-in';
        state.uid = user.uid;
        settle.resolve(user.uid);
    }

    function signIn() {
        var fb = window.firebase;
        if (!fb || typeof fb.auth !== 'function') return fail('sdk-absent');
        var auth;
        try { auth = fb.auth(); } catch (e) { return fail('auth-unavailable', e); }
        if (!auth || typeof auth.onAuthStateChanged !== 'function') return fail('auth-unavailable');

        var decided = false;
        var unsub = null;
        var first = function (user) {
            if (decided) return;
            decided = true;
            if (typeof unsub === 'function') { try { unsub(); } catch (x) { } }
            if (user && user.uid) return ok(user);
            if (typeof auth.signInAnonymously !== 'function') return fail('anonymous-unavailable');
            var p;
            try { p = auth.signInAnonymously(); }
            catch (e) { return fail((e && e.code) || 'sign-in-threw', e); }
            Promise.resolve(p).then(function (cred) {
                var u = (cred && cred.user) || auth.currentUser;
                if (u && u.uid) ok(u); else fail('no-user');
            }, function (err) {
                fail((err && err.code) || 'sign-in-failed', err);
            });
        };
        try {
            unsub = auth.onAuthStateChanged(first, function (err) { fail((err && err.code) || 'auth-error', err); });
        } catch (e) { fail('auth-unavailable', e); }
    }

    function start() {
        var fb = window.firebase;
        if (!fb) return fail('sdk-absent');
        if (typeof fb.auth === 'function') return signIn();
        // No idea where this file was served from (no currentScript - not a real
        // parse-time tag) means no idea where the SDK is: say so rather than guess.
        if (!here || !document.head) return fail('sdk-absent');
        var s = document.createElement('script');
        s.src = SDK;
        s.async = true;
        s.onload = function () { signIn(); };
        s.onerror = function () { fail('sdk-absent'); };
        document.head.appendChild(s);
    }

    setTimeout(start, 0);
})();
