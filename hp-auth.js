// ============================================================================
// HardPan - window.HardPanAuth (URGENT-048 part 2: auth wiring + round attach)
//
// ONE SMALL API FOR THE HOME PILL, THE SIGN-IN / PROFILE SHEETS AND THE
// NEEDS-AN-ACCOUNT PROMPT. It adds NO auth of its own: every sign-in goes through
// the flows admin.html's Account panel already uses -
//   Apple / Google  -> oauth-signin.js  oauthSignin.signIn(which)
//   email link      -> email-link-auth.js  emailLinkAuth.sendLink / completeLink
//   sign out        -> account-exit.js  accountExit.signOut({ auth, reload })
// Those three files are loaded on first use (they are already in the app shell),
// so Home pays nothing until a golfer taps Sign in.
//
// ROUND ATTACH (the rule: rounds played signed out on this phone stay attached on
// first sign-in). The phone is an ANONYMOUS Firebase user from launch (auth-boot.js)
// and every round it starts carries ownerUid = that uid. oauth-signin.js and
// email-link-auth.js LINK the new credential onto that anonymous user
// (linkWithCredential / linkWithPopup), so the uid - and every ownerUid - stays the
// same. The one exception is an Apple / Google / email identity that already belongs
// to another account: oauth-signin.js then SWITCHES to that account. The rounds stay
// in this phone's History (local snapshots), but their ownerUid is still the old
// anonymous uid. This file only NOTES that move on the phone (hardpan_auth_moves);
// it never writes to the database. movedRounds() lists the rounds it affects.
//
// PROFILE (all on this phone, nothing sent anywhere):
//   name    hardpan_my_name   (the key the Range already uses; front-door meName() reads it)
//   hcp     hardpan_my_hcp    { h, at } (front-door myHcp() weighs it against the newest round)
//   tees    hardpan_default_tees  (simple-flow: the last tee used at a course still wins;
//           this is the pick at a course this phone has never played, when that tee exists)
//   venmo / cashapp  venmo-pay.js getProfile / setProfile (hardpan_pay_profile)
//
// NO LOCATION, NO TOKENS. Nothing here reads a position, and no token or credential
// is stored or logged.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : this;

    var NAME_KEY = 'hardpan_my_name', HCP_KEY = 'hardpan_my_hcp', TEES_KEY = 'hardpan_default_tees';
    var PAY_KEY = 'hardpan_pay_profile', LAST_TEE = 'hardpan_last_tee_', MOVES_KEY = 'hardpan_auth_moves';
    var PROVIDER_NAMES = { 'apple.com': 'apple', 'google.com': 'google', 'password': 'email', 'emailLink': 'email' };

    var here = '';
    try { here = (W.document && W.document.currentScript && W.document.currentScript.src) || ''; } catch (e) { here = ''; }
    var BASE = here ? here.replace(/[^\/]*$/, '') : '';

    function ls(k, v) {
        try {
            if (arguments.length > 1) { if (v == null || v === '') W.localStorage.removeItem(k); else W.localStorage.setItem(k, String(v)); return v; }
            return W.localStorage.getItem(k);
        } catch (e) { return null; }
    }
    function lsJson(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
    function clean(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 40); }

    // ---- THE AUTH INSTANCE ---------------------------------------------------
    function auth() {
        try { return W.firebase && typeof W.firebase.auth === 'function' ? W.firebase.auth() : null; } catch (e) { return null; }
    }
    function user() { var a = auth(); return a ? a.currentUser || null : null; }
    // auth-boot.js loads the auth SDK asynchronously and settles authReady once the
    // anonymous session is in (or failed). Either way the SDK is then as ready as it gets.
    function ready() {
        var r = W.authReady;
        var p = r && typeof r.then === 'function' ? r.then(function () { }, function () { }) : Promise.resolve();
        return p.then(function () { hook(); return auth(); });
    }

    // ---- LOADING THE EXISTING FLOWS ON FIRST USE -------------------------------
    var loading = {};
    function loadScript(file, has) {
        if (has()) return Promise.resolve(true);
        if (loading[file]) return loading[file];
        var d = W.document;
        if (!d || !d.createElement) return Promise.resolve(false);
        loading[file] = new Promise(function (resolve) {
            var s = d.createElement('script');
            s.src = BASE + file;
            s.async = true;
            s.onload = function () { resolve(has()); };
            s.onerror = function () { delete loading[file]; resolve(false); };
            (d.head || d.documentElement).appendChild(s);
        });
        return loading[file];
    }
    function needOauth() { return loadScript('oauth-signin.js', function () { return !!(W.oauthSignin && typeof W.oauthSignin.signIn === 'function'); }); }
    function needEmail() { return loadScript('email-link-auth.js', function () { return !!(W.emailLinkAuth && typeof W.emailLinkAuth.sendLink === 'function'); }); }
    function needExit() { return loadScript('account-exit.js', function () { return !!(W.accountExit && typeof W.accountExit.signOut === 'function'); }); }
    function needVenmo() { return loadScript('venmo-pay.js', function () { return !!(W.HardPanVenmo && typeof W.HardPanVenmo.setProfile === 'function'); }); }

    function coded(code, message) { var e = new Error(message || code); e.code = code; return e; }

    // ---- STATE ----------------------------------------------------------------
    function providerOf(u) {
        if (!u) return null;
        if (u.isAnonymous) return 'anonymous';
        var list = u.providerData || [];
        for (var i = 0; i < list.length; i++) {
            var id = list[i] && list[i].providerId;
            if (id && PROVIDER_NAMES[id] && PROVIDER_NAMES[id] !== 'email') return PROVIDER_NAMES[id];
        }
        for (var j = 0; j < list.length; j++) {
            var id2 = list[j] && list[j].providerId;
            if (id2 && PROVIDER_NAMES[id2]) return PROVIDER_NAMES[id2];
        }
        return u.email ? 'email' : null;
    }
    // The name shown on the pill / profile: what the golfer typed, else the account's name,
    // else the front of the email. Anonymous: what they typed, or ''.
    function nameFor(u) {
        var typed = clean(ls(NAME_KEY));
        if (typed) return typed;
        if (!u || u.isAnonymous) return '';
        var dn = clean(u.displayName);
        if (dn) return dn;
        var em = String(u.email || '');
        // Apple's private relay address is not a name.
        if (em && !/privaterelay\.appleid\.com$/i.test(em)) return clean(em.split('@')[0].replace(/[._-]+/g, ' '));
        return '';
    }
    function initialOf(name, u) {
        var n = String(name || '').trim();
        if (n) return n.charAt(0).toUpperCase();
        var em = String((u && u.email) || '').trim();
        return em ? em.charAt(0).toUpperCase() : '';
    }
    function state() {
        var u = user();
        if (!u) {
            // Before the auth SDK is in: what auth-boot knows (an anonymous launch), never "signed in".
            var b = W.authBootState || {};
            var nm0 = clean(ls(NAME_KEY));
            return { signedIn: false, anonymous: !!b.uid, uid: b.uid || null, name: nm0, initial: initialOf(nm0, null), provider: b.uid ? 'anonymous' : null };
        }
        var nm = nameFor(u);
        return {
            signedIn: !u.isAnonymous,
            anonymous: !!u.isAnonymous,
            uid: String(u.uid),
            name: nm,
            initial: initialOf(nm, u),
            provider: providerOf(u)
        };
    }

    // ---- CHANGES ----------------------------------------------------------------
    var listeners = [];
    var hooked = false, lastUser = null;
    function emit() {
        var s = state();
        listeners.slice().forEach(function (fn) { try { fn(s); } catch (e) { /* one bad listener is not the page's problem */ } });
    }
    // The same move email-link-auth.js publishBoot() makes: authBootState is what
    // ownRound() / the GPS organizer checks read, so it follows the account the phone
    // is now in. Never touches status while auth-boot is still pending.
    function publishBoot(u) {
        var b = W.authBootState;
        if (!b || !u || !u.uid) return;
        b.uid = String(u.uid);
        if (u.email) b.email = u.email;
        if (b.status !== 'pending') b.status = 'signed-in';
    }
    // AN ACCOUNT SWITCH, NOTED ON THE PHONE: anonymous A -> a different account B.
    function noteMove(before, after) {
        if (!before || !after || !before.uid || !after.uid) return;
        if (!before.isAnonymous || after.isAnonymous || String(before.uid) === String(after.uid)) return;
        var list = lsJson(MOVES_KEY);
        if (!Array.isArray(list)) list = [];
        if (list.some(function (m) { return m && m.from === before.uid && m.to === after.uid; })) return;
        list.push({ from: String(before.uid), to: String(after.uid), at: Date.now() });
        if (list.length > 20) list = list.slice(-20);
        try { W.localStorage.setItem(MOVES_KEY, JSON.stringify(list)); } catch (e) { }
    }
    function snap(u) { return u && u.uid ? { uid: String(u.uid), isAnonymous: !!u.isAnonymous } : null; }
    function onAuth(u) {
        var now = snap(u);
        noteMove(lastUser, now);
        if (u) publishBoot(u);
        lastUser = now;
        emit();
    }
    function hook() {
        if (hooked) return;
        var a = auth();
        if (!a || typeof a.onAuthStateChanged !== 'function') return;
        hooked = true;
        // The uid the page booted with counts as "before" for a switch made on this page.
        var b = W.authBootState;
        lastUser = snap(a.currentUser) || (b && b.uid ? { uid: String(b.uid), isAnonymous: true } : null);
        try { a.onAuthStateChanged(onAuth); } catch (e) { hooked = false; }
    }
    function onChange(fn) {
        if (typeof fn !== 'function') return function () { };
        listeners.push(fn);
        hook();
        if (!hooked) ready();
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }

    // ---- SIGN IN / OUT (the existing flows) ----------------------------------------
    // Resolves { uid, preserved, note, state } - preserved: the uid did not change, so
    // every round this phone set up stays this account's. Rejects with the flow's own
    // coded error, plus .message = the sentence the existing flow shows for it.
    function oauth(which) {
        return ready().then(needOauth).then(function (ok) {
            if (!ok) throw coded('sdk-absent', 'Sign-in is not ready yet. Wait a moment and try again.');
            var O = W.oauthSignin;
            return O.signIn(which).then(function (r) {
                return { uid: r && r.uid, email: (r && r.email) || null, preserved: !!(r && r.preserved), note: (r && r.note) || '', state: state() };
            }, function (err) {
                var e = err || coded('unknown');
                try { e.message = O.messageFor(e); } catch (x) { }
                throw e;
            });
        });
    }
    function signInApple() { return oauth('apple'); }
    function signInGoogle() { return oauth('google'); }
    // EMAIL: step 1 sends the link (email-link-auth sendLink); step 2 finishes it from
    // the pasted link or code (the same parsing as the Account panel's Finish). On the
    // web, tapping the link lands on admin.html, which finishes it there as before.
    function signInEmail(email) {
        return ready().then(needEmail).then(function (ok) {
            if (!ok) throw coded('sdk-absent', 'Sign-in is not ready yet. Wait a moment and try again.');
            var E = W.emailLinkAuth;
            return E.sendLink(email).then(function (r) {
                return { sent: true, email: r && r.email, note: (r && r.note) || '' };
            }, function (err) {
                var e = err || coded('unknown');
                try { e.message = E.messageFor(e); } catch (x) { }
                throw e;
            });
        });
    }
    function finishEmail(pasted, email) {
        return ready().then(needEmail).then(function (ok) {
            if (!ok) throw coded('sdk-absent', 'Sign-in is not ready yet. Wait a moment and try again.');
            var E = W.emailLinkAuth;
            var typed = String(pasted || '').trim(), href = '';
            var action = E.actionUrlFromPaste(typed);
            if (action) href = action;
            else if (E.isEmailLink(typed)) href = typed;
            else { var code = E.codeFromPaste(typed); if (code) href = E.linkForCode(code); }
            if (!href) throw coded('bad-paste', 'Paste the whole link from the email, or type the code at the end of it.');
            return E.completeLink(href, email).then(function (r) {
                if (!r || r.status !== 'signed-in') {
                    throw coded(r && r.status === 'need-email' ? 'need-email' : 'not-link', (r && r.note) || 'That is not a sign-in link.');
                }
                return { uid: r.after && r.after.uid, preserved: !!r.preserved, note: r.note || '', state: state() };
            }, function (err) {
                var e = err || coded('unknown');
                try { e.message = E.messageFor(e); } catch (x) { }
                throw e;
            });
        });
    }
    // Sign out with account-exit.js. It reloads the page (opts.reload === false to skip),
    // and auth-boot then starts a fresh anonymous session - GPS, scoring and this phone's
    // History carry on as before.
    function signOut(opts) {
        return ready().then(needExit).then(function (ok) {
            var a = auth();
            if (!ok || !a) throw coded('sdk-absent', 'Sign-in is not ready yet. Wait a moment and try again.');
            var deps = { auth: a };
            if (!opts || opts.reload !== false) deps.reload = function () { try { W.location.reload(); } catch (e) { } };
            return W.accountExit.signOut(deps).then(function (r) { emit(); return r; }, function (err) {
                var e = err || coded('unknown');
                try { e.message = W.accountExit.messageFor(e); } catch (x) { }
                throw e;
            });
        });
    }

    // ---- PROFILE ---------------------------------------------------------------------
    function doors() { return W.HardPanDoors || null; }
    function hcpText(v) {
        var s = String(v == null ? '' : v).trim().replace(/^\+\s*/, '+');
        if (!s) return '';
        var n = Number(s.replace(/^\+/, ''));
        if (!isFinite(n) || n < 0 || n > 54) return null;
        return s.charAt(0) === '+' && n > 0 ? '+' + n : String(n);
    }
    function lastTees() {
        // The tee this phone last started a round on, per course (simple-flow's memory).
        var out = {};
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (k && k.indexOf(LAST_TEE) === 0) { var v = ls(k); if (v) out[k.slice(LAST_TEE.length)] = v; }
            }
        } catch (e) { }
        return out;
    }
    function mostUsed(map) {
        var n = {}, best = '', bestN = 0;
        Object.keys(map).forEach(function (k) { var t = map[k]; n[t] = (n[t] || 0) + 1; if (n[t] > bestN) { bestN = n[t]; best = t; } });
        return best;
    }
    function payProfile() {
        var V = W.HardPanVenmo;
        if (V && typeof V.getProfile === 'function') { try { return V.getProfile(); } catch (e) { } }
        var p = lsJson(PAY_KEY) || {};
        return { venmo: p.venmo || null, cashapp: p.cashapp || null };
    }
    function profileGet() {
        var D = doors();
        var name = clean(ls(NAME_KEY)) || state().name || '';
        if (!name && D && typeof D.meName === 'function') { var m = D.meName(); if (m && m !== 'Me') name = m; }
        var hcp = '';
        if (D && typeof D.myHcp === 'function') { try { hcp = String(D.myHcp() || ''); } catch (e) { hcp = ''; } }
        if (!hcp) { var hh = lsJson(HCP_KEY); hcp = hh && hh.h != null ? String(hh.h) : ''; }
        var byCourse = lastTees();
        var tees = clean(ls(TEES_KEY)) || mostUsed(byCourse) || '';
        var pay = payProfile();
        return { name: name, hcp: hcp, tees: tees, teesByCourse: byCourse, venmo: pay.venmo || null, cashapp: pay.cashapp || null };
    }
    // Only the fields given are changed ('' / null clears one). Resolves the new profile;
    // rejects { code: 'bad-hcp' } for a handicap that is not 0-54 (or +n).
    function profileSet(p) {
        p = p || {};
        if (Object.prototype.hasOwnProperty.call(p, 'hcp')) {
            var h = hcpText(p.hcp);
            if (h === null) return Promise.reject(coded('bad-hcp', 'Handicap is a number from 0 to 54 (a plus handicap as +2).'));
        }
        if (Object.prototype.hasOwnProperty.call(p, 'name')) {
            var nm = clean(p.name);
            ls(NAME_KEY, nm);
        }
        if (Object.prototype.hasOwnProperty.call(p, 'hcp')) {
            if (h) { try { W.localStorage.setItem(HCP_KEY, JSON.stringify({ h: h, at: Date.now() })); } catch (e) { } } else ls(HCP_KEY, null);
        }
        if (Object.prototype.hasOwnProperty.call(p, 'tees')) ls(TEES_KEY, clean(p.tees, 30));
        var payDone = Promise.resolve();
        var hasV = Object.prototype.hasOwnProperty.call(p, 'venmo'), hasC = Object.prototype.hasOwnProperty.call(p, 'cashapp');
        if (hasV || hasC) {
            payDone = needVenmo().then(function (ok) {
                if (!ok) throw coded('sdk-absent', 'Could not save the Venmo / Cash App names right now. Try again.');
                var cur = W.HardPanVenmo.getProfile();
                W.HardPanVenmo.setProfile({ venmo: hasV ? p.venmo : cur.venmo, cashapp: hasC ? p.cashapp : cur.cashapp });
            });
        }
        return payDone.then(function () { emit(); return profileGet(); });
    }

    // ---- ROUND ATTACH: what an account switch left behind (read-only) -----------------
    function moves() { var l = lsJson(MOVES_KEY); return Array.isArray(l) ? l : []; }
    // The rounds in this phone's History whose ownerUid is an anonymous uid this phone
    // has since switched away from: they still show and still score; only the organizer
    // edits need the old uid. Nothing is written.
    function movedRounds() {
        var from = {}, out = [];
        moves().forEach(function (m) { if (m && m.from) from[m.from] = m.to; });
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i), mm = /^golfapp_snap_v1_(\w+)$/.exec(k || '');
                if (!mm) continue;
                var o = lsJson(k), owner = o && o.data && o.data.ownerUid;
                if (owner && from[owner]) out.push({ code: mm[1], ownerUid: String(owner), nowUid: from[owner] });
            }
        } catch (e) { }
        return out;
    }

    W.HardPanAuth = {
        state: state,
        onChange: onChange,
        ready: ready,
        signInApple: signInApple,
        signInGoogle: signInGoogle,
        signInEmail: signInEmail,
        finishEmail: finishEmail,
        signOut: signOut,
        profile: { get: profileGet, set: profileSet },
        moves: moves,
        movedRounds: movedRounds,
        KEYS: { name: NAME_KEY, hcp: HCP_KEY, tees: TEES_KEY, moves: MOVES_KEY },
        _test: { providerOf: providerOf, nameFor: nameFor, initialOf: initialOf, hcpText: hcpText, noteMove: noteMove, onAuth: onAuth, reset: function () { hooked = false; lastUser = null; listeners = []; loading = {}; } }
    };
    // Hook as soon as the auth SDK is there, so a switch made on this page is noted.
    ready();
})();
