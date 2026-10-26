// ============================================================================
// HARDPAN ACCOUNT UI (URGENT-048 part 1, Manny 7:23 AM: "we need to sign in somewhere,
// especially if people communicate"). Built EXACTLY as the approved preview
// (claude-code-reports/048/preview/signin-compare.png):
//
//   1. Home's profile spot, top right of the HardPan title row (#hpa-spot in home.html):
//      signed out or anonymous = a "Sign in" pill; signed in = the golfer's initial.
//   2. The sign-in sheet: Sign in with Apple (Apple's black button), Google, "Use email
//      instead", the why-line and the "Golf GPS works without it" card.
//   3. The profile sheet: name, handicap, default tees, Venmo / Cash App, Sign out.
//
// UI ONLY. Every auth call and every stored value goes through window.HardPanAuth
// (hp-auth.js, 048 part 2): state(), onChange(fn), signInApple/Google(), signInEmail(email)
// + finishEmail(pasted, email), signOut(), profile.get() / profile.set({ name, hcp, tees,
// venmo, cashapp }), movedRounds().
// Nothing here talks to Firebase, and nothing here blocks anything: GPS, scoring and
// bets on this phone never ask for this sheet. Without hp-auth.js the pill still shows
// and the sheet says sign-in is not ready - nothing else changes.
//
// window.HardPanAccountUI.openSignIn() / openProfile() are the hooks the "needs an
// account" prompt (048 part 3) opens.
// ============================================================================
(function () {
    'use strict';
    var W = window, D = document;

    var WORDS = {
        signIn: 'Sign in',
        why: 'So friends, chat and Venmo know it’s you.',
        apple: 'Sign in with Apple',
        google: 'Sign in with Google',
        email: 'Use email instead',
        okBold: 'Golf GPS works without it.',
        okRest: ' So do scoring and bets on this phone. Rounds already on this phone come with you.',
        profile: 'Profile',
        signOut: 'Sign out',
        signOutFine: 'Signing out keeps this phone’s rounds and GPS.',
        signingIn: 'Signing in…',
        signingOut: 'Signing out…',
        notReady: 'Sign-in isn’t ready yet. Wait a moment and try again.',
        failed: 'Could not finish sign-in. Nothing changed - try again.',
        emailTitle: 'Sign in with email',
        emailWhy: 'We\u2019ll email you a sign-in link.',
        emailSend: 'Send sign-in link',
        emailBad: 'Type your email address.',
        sending: 'Sending\u2026',
        emailSent: 'Link sent to {e}. Open it on this phone, or paste the link (or the code at the end of it) here.',
        pastePh: 'Paste the link or code',
        emailFinish: 'Finish signing in',
        emailAgain: 'Send it again',
        otherWays: 'Other ways to sign in',
        switched: 'This {via} sign-in already had an account, so this phone is now signed in to that account.',
        moved: 'Rounds this phone played before you signed in still show in History and keep scoring. Editing their setup needs the phone\u2019s earlier sign-in.'
    };
    var LEGAL = { privacy: 'https://golf-app-5a5.pages.dev/privacy.html', terms: 'https://golf-app-5a5.pages.dev/terms.html' };

    var APPLE_SVG = '<svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';
    var GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    var PERSON_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0f4c3a" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

    // The preview's look (048-mock.css + base.css), scoped under .hpa-.
    var CSS = ''
        + '.hpa-hrow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 6px;min-height:44px}'
        + '#v-simple .hpa-hrow .hs-hello{margin:0}'
        + '.hpa-pill{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px 0 10px;border-radius:999px;background:#fff;border:1.5px solid #d0e1db;color:#0f4c3a;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;flex:none;-webkit-tap-highlight-color:transparent}'
        + '.hpa-pill .pi{width:20px;height:20px;border-radius:50%;background:#e2f1ea;display:flex;align-items:center;justify-content:center}'
        + '.hpa-ini{width:40px;height:40px;border-radius:50%;background:#0f4c3a;color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #fff,0 0 0 4.5px #d0e1db;border:0;padding:0;font-family:inherit;cursor:pointer;flex:none;margin-right:4px}'
        + '.hpa-scrim{position:fixed;inset:0;background:rgba(10,20,15,.42);z-index:900}'
        + '.hpa-sheet{position:fixed;left:0;right:0;bottom:0;max-width:520px;margin:0 auto;max-height:92vh;overflow-y:auto;background:#f2f4ef;color:#13241d;border-radius:22px 22px 0 0;z-index:901;padding:0 16px calc(env(safe-area-inset-bottom) + 22px);box-shadow:0 -8px 30px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;box-sizing:border-box}'
        + '.hpa-sheet *{box-sizing:border-box}'
        + '.hpa-grab{width:40px;height:5px;border-radius:3px;background:#c9d1cc;margin:8px auto 6px}'
        + '.hpa-hd{display:flex;align-items:center;gap:10px;min-height:44px}'
        + '.hpa-hd .t{font-size:24px;font-weight:800;letter-spacing:-.01em;flex:1}'
        + '.hpa-x{width:36px;height:36px;border-radius:50%;background:#e9eee9;display:flex;align-items:center;justify-content:center;font-size:17px;color:#13241d;border:0;padding:0;font-family:inherit;cursor:pointer}'
        + '.hpa-why{font-size:16px;line-height:1.4;color:#13241d;margin:2px 2px 16px}'
        + '.hpa-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:54px;border-radius:14px;font-size:18px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em;cursor:pointer;font-family:inherit}'
        + '.hpa-btn.apple{background:#000;color:#fff;border:0}'
        + '.hpa-btn.apple svg{width:19px;height:22px;margin-top:-3px}'
        + '.hpa-btn.google{background:#fff;color:#1f1f1f;border:1px solid #747775;font-family:Roboto,-apple-system,sans-serif;font-weight:500}'
        + '.hpa-btn.google svg{width:20px;height:20px}'
        + '.hpa-btn[disabled]{opacity:.55}'
        + '.hpa-email{display:block;width:100%;text-align:center;color:#0f4c3a;font-weight:800;font-size:16px;line-height:44px;background:none;border:0;font-family:inherit;cursor:pointer}'
        + '.hpa-ok{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #dfe5df;border-radius:14px;padding:12px 14px;margin-top:8px;font-size:14px;line-height:1.4;color:#5d6b64}'
        + '.hpa-ok b{color:#13241d}.hpa-ok .e{font-size:18px;line-height:1.2}'
        + '.hpa-fine{font-size:12.5px;color:#5d6b64;text-align:center;margin-top:12px;line-height:1.45}'
        + '.hpa-fine a{color:inherit;text-decoration:none}'
        + '.hpa-msg{font-size:14px;line-height:1.4;color:#5d6b64;text-align:center;margin:4px 2px 6px;min-height:0}'
        + '.hpa-msg.err{color:#b3261e;font-weight:700}'
        + '.hpa-who{display:flex;align-items:center;gap:14px;margin:4px 2px 16px}'
        + '.hpa-who .hpa-ini{width:56px;height:56px;font-size:24px;cursor:default}'
        + '.hpa-who .nm{font-size:21px;font-weight:800}.hpa-who .vi{font-size:13.5px;color:#5d6b64;margin-top:2px}'
        + '.hpa-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#667;margin:16px 2px 8px;text-transform:uppercase}'
        + '.hpa-list{background:#fff;border:1px solid #dfe5df;border-radius:16px;overflow:hidden;margin-bottom:12px}'
        + '.hpa-li{display:flex;align-items:center;gap:10px;width:100%;padding:0 14px;min-height:52px;border:0;border-top:1px solid #dfe5df;background:#fff;font-size:16px;font-weight:600;color:#13241d;font-family:inherit;text-align:left;cursor:pointer}'
        + '.hpa-li:first-child{border-top:0}'
        // 062: the plain "Golf GPS · renews <date>" line (not a button) and its "Free trial" badge.
        + '.hpa-li.hpa-sub{cursor:default;font-weight:600}'
        + '.hpa-badge{margin-left:auto;padding:3px 9px;border-radius:999px;background:#e7f3ec;color:#0f4c3a;font-size:12px;font-weight:800;letter-spacing:.02em;white-space:nowrap}'
        + '.hpa-li .r{margin-left:auto;font-size:16px;color:#13241d;font-weight:500;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'
        + '.hpa-li .r.ph{color:#9aa0a6}'
        + '.hpa-li .r b{font-size:22px;color:#9aa0a6;font-weight:400}'
        + '.hpa-dot{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #9aa0a6;background:#fff;flex:none}'
        + '.hpa-signout{display:block;width:100%;text-align:center;color:#b3261e;font-weight:800;font-size:17px;line-height:50px;background:#fff;border:1px solid #dfe5df;border-radius:16px;font-family:inherit;cursor:pointer}'
        + '.hpa-edit input{width:100%;height:52px;border:1px solid #d0e1db;border-radius:14px;padding:0 14px;font-size:18px;font-family:inherit;background:#fff;color:#13241d;outline:none}'
        + '.hpa-edit .hint{font-size:13.5px;color:#5d6b64;margin:8px 2px 0;line-height:1.4}'
        + '.hpa-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}'
        + '.hpa-chip{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:999px;border:1.5px solid #d0e1db;background:#fff;font-size:15px;font-weight:700;color:#13241d;font-family:inherit;cursor:pointer}'
        + '.hpa-chip.on{border-color:#0f4c3a;background:#e2f1ea;color:#0f4c3a}'
        + '.hpa-chip .hpa-dot{width:14px;height:14px}'
        + '.hpa-save{display:flex;align-items:center;justify-content:center;width:100%;min-height:54px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font-family:inherit;font-weight:800;font-size:18px;margin-top:14px;cursor:pointer}'
        + '.hpa-cancel{display:block;width:100%;text-align:center;color:#0f4c3a;font-weight:800;font-size:16px;line-height:46px;background:none;border:0;font-family:inherit;cursor:pointer}';

    var TEES = ['Black', 'Blue', 'White', 'Gold', 'Red', 'Green'];
    var TEE_COLORS = { black: '#111', blue: '#1d4ed8', white: '#fff', gold: '#d4a017', yellow: '#e6c200', red: '#c62828', green: '#2e7d32', silver: '#c0c0c0', orange: '#ef6c00', copper: '#b87333', tips: '#111', championship: '#111', forward: '#c62828' };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function $(id) { return D.getElementById(id); }
    function api() { return W.HardPanAuth || null; }
    function state() {
        try { var a = api(); var s = a && typeof a.state === 'function' ? a.state() : null; return s || {}; } catch (e) { return {}; }
    }
    // Signed in means a real account. An anonymous session (auth-boot.js gives everyone
    // one) is "signed out" for this screen.
    function signedIn(s) { return !!(s && s.signedIn && !s.anonymous); }
    function profileNow() {
        try { var a = api(); var p = a && a.profile && typeof a.profile.get === 'function' ? a.profile.get() : null; return p || {}; } catch (e) { return {}; }
    }
    function readProfile() {
        try { return Promise.resolve(profileNow()).then(function (p) { return p || {}; }, function () { return {}; }); } catch (e) { return Promise.resolve({}); }
    }
    function initialOf(s, p) {
        var n = (s && s.initial) || (p && p.name) || (s && s.name) || '';
        var c = String(n).trim().charAt(0);
        return c ? c.toUpperCase() : '';
    }
    function providerLabel(pr) {
        var k = String(pr || '').toLowerCase();
        if (/apple/.test(k)) return 'Apple';
        if (/google/.test(k)) return 'Google';
        if (/mail|password|link/.test(k)) return 'email';
        return '';
    }
    function teeColor(t) {
        var k = String(t || '').toLowerCase().trim();
        if (TEE_COLORS[k]) return TEE_COLORS[k];
        for (var n in TEE_COLORS) if (k.indexOf(n) !== -1) return TEE_COLORS[n];
        return '#fff';
    }
    function dot(t) { var c = teeColor(t); return '<span class="hpa-dot" style="background:' + c + ';border-color:' + (c === '#fff' ? '#9aa0a6' : c) + '"></span>'; }
    function handle(v, sign) { var s = String(v || '').trim().replace(/^[@$]+/, ''); return s ? sign + s : ''; }

    function injectCss() {
        if ($('hpa-css')) return;
        var st = D.createElement('style'); st.id = 'hpa-css'; st.textContent = CSS;
        (D.head || D.documentElement).appendChild(st);
    }

    // ---- 1. THE PROFILE SPOT ON HOME --------------------------------------------
    function renderSpot() {
        var b = $('hpa-spot');
        if (!b) return;
        var s = state();
        if (signedIn(s)) {
            var ini = initialOf(s, profileNow());
            b.className = 'hpa-ini';
            b.setAttribute('data-hpa-state', 'in');
            b.setAttribute('aria-label', 'Profile');
            b.innerHTML = ini ? esc(ini) : PERSON_SVG.replace('#0f4c3a', '#fff').replace('width="12" height="12"', 'width="20" height="20"');
        } else {
            b.className = 'hpa-pill';
            b.setAttribute('data-hpa-state', 'out');
            b.setAttribute('aria-label', 'Sign in');
            b.innerHTML = '<span class="pi">' + PERSON_SVG + '</span>' + WORDS.signIn;
        }
    }
    function spotTap() { if (signedIn(state())) openProfile(); else openSignIn(); }

    // ---- THE SHEET FRAME ----------------------------------------------------------
    var open = null;   // 'signin' | 'profile' | null
    function close() {
        ['hpa-scrim', 'hpa-sheet'].forEach(function (id) { var e = $(id); if (e && e.parentNode) e.parentNode.removeChild(e); });
        open = null;
    }
    function frame(kind, html) {
        injectCss();
        close();
        var scrim = D.createElement('div'); scrim.id = 'hpa-scrim'; scrim.className = 'hpa-scrim';
        scrim.addEventListener('click', close);
        var sh = D.createElement('div'); sh.id = 'hpa-sheet'; sh.className = 'hpa-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
        sh.setAttribute('data-hpa-sheet', kind);
        sh.innerHTML = html;
        D.body.appendChild(scrim); D.body.appendChild(sh);
        open = kind;
        return sh;
    }
    function head(title) { return '<div class="hpa-grab"></div><div class="hpa-hd"><span class="t">' + esc(title) + '</span><button type="button" class="hpa-x" data-hpa="close" aria-label="Close">✕</button></div>'; }
    function setMsg(sh, text, err) {
        var m = sh && sh.querySelector('.hpa-msg');
        if (!m) return;
        m.textContent = text || '';
        m.className = 'hpa-msg' + (err ? ' err' : '');
    }
    function busy(sh, on) {
        Array.prototype.forEach.call(sh.querySelectorAll('button[data-hpa]'), function (b) { if (b.getAttribute('data-hpa') !== 'close') b.disabled = !!on; });
    }

    // ---- 2. THE SIGN-IN SHEET -----------------------------------------------------
    // ANDROID (android-2.0, 024 C; Manny, 2026-10-24): email is the way in on Android. No Apple
    // there, ever; Google comes with its own step (024 D1, once the app's Play signing keys are
    // in Firebase). So the sheet offers "Sign in with email" alone, and its email step goes back
    // to it with a plain Back. iOS and the web keep all three, exactly as before.
    function android() { try { return !!(W.Capacitor && typeof W.Capacitor.getPlatform === 'function' && W.Capacitor.getPlatform() === 'android'); } catch (e) { return false; } }
    function pickHtml() {
        return '<div class="hpa-why">' + esc(WORDS.why) + '</div>'
            + (android()
                ? '<button type="button" class="hpa-btn" data-hpa="email">' + esc(WORDS.emailTitle) + '</button>'
                : '<button type="button" class="hpa-btn apple" data-hpa="apple">' + APPLE_SVG + esc(WORDS.apple) + '</button>'
                    + '<button type="button" class="hpa-btn google" data-hpa="google">' + GOOGLE_SVG + esc(WORDS.google) + '</button>'
                    + '<button type="button" class="hpa-email" data-hpa="email">' + esc(WORDS.email) + '</button>')
            + '<div class="hpa-msg" role="status" aria-live="polite"></div>'
            + '<div class="hpa-ok"><span class="e" aria-hidden="true">📍</span><span><b>' + esc(WORDS.okBold) + '</b>' + esc(WORDS.okRest) + '</span></div>'
            + '<div class="hpa-fine"><a href="' + LEGAL.privacy + '" target="_blank" rel="noopener">Privacy</a> · <a href="' + LEGAL.terms + '" target="_blank" rel="noopener">Terms</a></div>';
    }
    // EMAIL, the existing email-link flow in two steps (as the Account panel): send the
    // link, then open it on this phone - or paste the link / code here and Finish.
    var emailTo = '';
    function emailHtml(sent, note) {
        if (!sent) return '<div class="hpa-edit" data-hpa-email="1"><div class="hpa-why">' + esc(WORDS.emailWhy) + '</div>'
            + '<input type="email" id="hpa-email-in" value="' + esc(emailTo) + '" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="email" inputmode="email" placeholder="you@example.com" aria-label="Email">'
            + '<div class="hpa-msg" role="status" aria-live="polite"></div>'
            + '<button type="button" class="hpa-save" data-hpa="emailsend">' + esc(WORDS.emailSend) + '</button>'
            + '<button type="button" class="hpa-cancel" data-hpa="pick">‹ ' + esc(android() ? 'Back' : WORDS.otherWays) + '</button></div>';
        return '<div class="hpa-edit" data-hpa-email="2"><div class="hpa-why">' + esc(note || WORDS.emailSent.replace('{e}', emailTo)) + '</div>'
            + '<input type="text" id="hpa-email-paste" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(WORDS.pastePh) + '" aria-label="' + esc(WORDS.pastePh) + '">'
            + '<div class="hpa-msg" role="status" aria-live="polite"></div>'
            + '<button type="button" class="hpa-save" data-hpa="emailfinish">' + esc(WORDS.emailFinish) + '</button>'
            + '<button type="button" class="hpa-cancel" data-hpa="email">' + esc(WORDS.emailAgain) + '</button></div>';
    }
    function setBody(sh, title, html) {
        var t = sh.querySelector('.hpa-hd .t'); if (t) t.textContent = title;
        var b = sh.querySelector('.hpa-body'); if (b) b.innerHTML = html;
    }
    function openSignIn() {
        var sh = frame('signin', head(WORDS.signIn) + '<div class="hpa-body">' + pickHtml() + '</div>');
        sh.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-hpa]') : null;
            if (!b || b.disabled) return;
            var a = b.getAttribute('data-hpa');
            if (a === 'close') return close();
            if (a === 'pick') return setBody(sh, WORDS.signIn, pickHtml());
            if (a === 'email') { setBody(sh, WORDS.emailTitle, emailHtml(false)); var i = $('hpa-email-in'); if (i) { try { i.focus(); } catch (e) { } } return; }
            if (a === 'emailsend') return sendEmail(sh);
            if (a === 'emailfinish') return finishEmail(sh);
            var fn = { apple: 'signInApple', google: 'signInGoogle' }[a];
            if (fn) start(sh, fn);
        });
        return sh;
    }
    function sendEmail(sh) {
        var a = api(), i = $('hpa-email-in');
        var em = String((i && i.value) || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setMsg(sh, WORDS.emailBad, true); return; }
        if (!a || typeof a.signInEmail !== 'function') { setMsg(sh, WORDS.notReady, true); return; }
        emailTo = em;
        busy(sh, true); setMsg(sh, WORDS.sending);
        var p; try { p = Promise.resolve(a.signInEmail(em)); } catch (e) { p = Promise.reject(e); }
        p.then(function (r) {
            if (open !== 'signin') return;
            setBody(sh, WORDS.emailTitle, emailHtml(true, r && r.note));
        }, function (err) {
            if (open !== 'signin') return;
            busy(sh, false); setMsg(sh, failText(err), true);
        });
    }
    function finishEmail(sh) {
        var a = api(), i = $('hpa-email-paste');
        var v = String((i && i.value) || '').trim();
        if (!v) { setMsg(sh, WORDS.pastePh + '.', true); return; }
        if (!a || typeof a.finishEmail !== 'function') { setMsg(sh, WORDS.notReady, true); return; }
        busy(sh, true); setMsg(sh, WORDS.signingIn);
        var p; try { p = Promise.resolve(a.finishEmail(v, emailTo)); } catch (e) { p = Promise.reject(e); }
        p.then(function () { if (open === 'signin') { close(); renderSpot(); } }, function (err) {
            if (open !== 'signin') return;
            busy(sh, false); setMsg(sh, failText(err), true);
        });
    }
    // hp-auth.js puts the existing flow's own friendly sentence on err.message.
    function failText(err) {
        var m = err && err.message ? String(err.message) : '';
        return m || WORDS.failed;
    }
    function start(sh, fn) {
        var a = api();
        if (!a || typeof a[fn] !== 'function') { setMsg(sh, WORDS.notReady, true); return; }
        busy(sh, true); setMsg(sh, WORDS.signingIn);
        var p;
        try { p = Promise.resolve(a[fn]()); } catch (e) { p = Promise.reject(e); }
        p.then(function (r) {
            if (open !== 'signin') return;
            busy(sh, false);
            if (signedIn(state()) || (r && r.uid)) { close(); renderSpot(); return; }
            setMsg(sh, (r && r.note) || '');
        }, function (err) {
            if (open !== 'signin') return;
            busy(sh, false);
            setMsg(sh, failText(err), true);
        });
    }

    // ---- 3. THE PROFILE SHEET -----------------------------------------------------
    function row(key, label, value, placeholder, extra) {
        var has = value != null && String(value) !== '';
        return '<button type="button" class="hpa-li" data-hpa="edit" data-hpa-field="' + key + '">' + esc(label)
            + '<span class="r' + (has ? '' : ' ph') + '">' + (has ? (extra || '') + esc(value) : esc(placeholder)) + '<b>›</b></span></button>';
    }
    function openProfile() {
        var sh = frame('profile', head(WORDS.profile) + '<div class="hpa-body"></div>');
        sh.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-hpa]') : null;
            if (!b || b.disabled) return;
            var a = b.getAttribute('data-hpa');
            if (a === 'close') return close();
            if (a === 'edit') return editField(sh, b.getAttribute('data-hpa-field'));
            if (a === 'signout') return doSignOut(sh);
            if (a === 'back') return fillProfile(sh);
            if (a === 'save') return saveField(sh);
            if (a === 'tee') { var i = sh.querySelector('.hpa-edit input'); if (i) i.value = b.getAttribute('data-hpa-tee'); Array.prototype.forEach.call(sh.querySelectorAll('.hpa-chip'), function (c) { c.classList.toggle('on', c === b); }); }
        });
        fillProfile(sh);
        return sh;
    }
    function fillProfile(sh) {
        var body = sh.querySelector('.hpa-body');
        if (!body) return;
        var s = state();
        return readProfile().then(function (p) {
            if (open !== 'profile') return;
            var name = p.name || s.name || '';
            var ini = initialOf(s, p);
            var via = providerLabel(s.provider);
            body.innerHTML = '<div class="hpa-who"><span class="hpa-ini">' + (ini ? esc(ini) : '') + '</span><div><div class="nm">' + esc(name || 'Your profile') + '</div>'
                + (via ? '<div class="vi">Signed in with ' + esc(via) + '</div>' : '') + '</div></div>'
                + '<div class="hpa-h">You</div><div class="hpa-list">'
                + row('name', 'Name', name, 'Add your name')
                + row('hcp', 'Handicap', p.hcp, 'Add')
                + row('tees', 'Default tees', p.tees, 'Pick', p.tees ? dot(p.tees) : '')
                + '</div>' + subLine()
                + '<div class="hpa-h">Get paid</div><div class="hpa-list">'
                + row('venmo', 'Venmo', handle(p.venmo, '@'), 'Add @username')
                + row('cashapp', 'Cash App', handle(p.cashapp, '$'), 'Add $cashtag')
                + '</div><div class="hpa-msg" role="status" aria-live="polite"></div>'
                + (switchedVia(via) ? '<div class="hpa-fine" data-hpa-switched="1" style="text-align:left;margin:0 2px 12px">' + esc(WORDS.switched.replace('{via}', switchedVia(via))) + '</div>' : '')
                + (movedCount() ? '<div class="hpa-fine" data-hpa-moved="' + movedCount() + '" style="text-align:left;margin:0 2px 12px">' + esc(WORDS.moved) + '</div>' : '')
                + '<button type="button" class="hpa-signout" data-hpa="signout">' + esc(WORDS.signOut) + '</button>'
                + '<div class="hpa-fine">' + esc(WORDS.signOutFine) + '</div>';
        });
    }
    // 064-6b: the "signed in as that account" note oauth-signin.js writes for a switch
    // never showed (the sign-in sheet closes on success), so Profile says it.
    function switchedVia(via) {
        try { var a = api(); var l = a && typeof a.lastSignIn === 'function' ? a.lastSignIn() : null; return l && l.switched && via ? via : ''; } catch (e) { return ''; }
    }
    // URGENT-062: ONE plain line about Golf GPS (Manny, 052 CHANGED 11:41 AM): "Golf GPS · renews
    // Oct 21, 2027" (auto-renew off: "· ends <date>"), with a "Free trial" badge during the trial.
    // No reminder, no cancel prompt, nothing to tap. Only with the paywall on and an active trial
    // or subscription (window.HardPanEntitlement.statusLine - the App Store's own dates); else
    // nothing at all.
    function subLine() {
        var E = W.HardPanEntitlement, st = null;
        try { st = E && typeof E.statusLine === 'function' ? E.statusLine() : null; } catch (e) { st = null; }
        if (!st || !st.line) return '';
        return '<div class="hpa-list" data-hpa-sub="1"><div class="hpa-li hpa-sub">' + esc(st.line)
            + (st.badge ? '<span class="hpa-badge">' + esc(st.badge) + '</span>' : '') + '</div></div>';
    }
    function movedCount() {
        try { var a = api(); var l = a && typeof a.movedRounds === 'function' ? a.movedRounds() : []; return Array.isArray(l) ? l.length : 0; } catch (e) { return 0; }
    }
    var FIELDS = {
        name: { label: 'Name', hint: 'The name your group sees.', attrs: 'autocapitalize="words" autocomplete="given-name" maxlength="40"' },
        hcp: { label: 'Handicap', hint: 'Your index, e.g. 12.4 (a plus handicap: +2).', attrs: 'inputmode="decimal" maxlength="5"' },
        tees: { label: 'Default tees', hint: 'Used when you start a round. Change it per round anytime.', attrs: 'autocapitalize="words" maxlength="24"' },
        venmo: { label: 'Venmo', hint: 'Your Venmo username, so friends can pay you. Kept on this phone.', attrs: 'autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="31" placeholder="@username"' },
        cashapp: { label: 'Cash App', hint: 'Your $cashtag. Kept on this phone.', attrs: 'autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="21" placeholder="$cashtag"' }
    };
    var editing = null;
    function editField(sh, key) {
        var f = FIELDS[key]; if (!f) return;
        var body = sh.querySelector('.hpa-body');
        readProfile().then(function (p) {
            if (open !== 'profile') return;
            editing = key;
            var cur = key === 'name' ? (p.name || state().name || '') : key === 'venmo' ? handle(p.venmo, '@') : key === 'cashapp' ? handle(p.cashapp, '$') : (p[key] == null ? '' : String(p[key]));
            var chips = '';
            if (key === 'tees') {
                var list = TEES.slice(); if (cur && list.map(function (t) { return t.toLowerCase(); }).indexOf(cur.toLowerCase()) === -1) list.unshift(cur);
                chips = '<div class="hpa-chips">' + list.map(function (t) { return '<button type="button" class="hpa-chip' + (cur.toLowerCase() === t.toLowerCase() ? ' on' : '') + '" data-hpa="tee" data-hpa-tee="' + esc(t) + '">' + dot(t) + esc(t) + '</button>'; }).join('') + '</div>';
            }
            body.innerHTML = '<div class="hpa-edit" data-hpa-editing="' + key + '"><div class="hpa-h">' + esc(f.label) + '</div>' + chips
                + '<input type="text" value="' + esc(cur) + '" ' + f.attrs + ' aria-label="' + esc(f.label) + '">'
                + '<div class="hint">' + esc(f.hint) + '</div>'
                + '<div class="hpa-msg" role="status" aria-live="polite"></div>'
                + '<button type="button" class="hpa-save" data-hpa="save">Save</button>'
                + '<button type="button" class="hpa-cancel" data-hpa="back">Cancel</button></div>';
            var t = sh.querySelector('.hpa-hd .t'); if (t) t.textContent = WORDS.profile;
            var i = body.querySelector('input'); if (i) { try { i.focus(); } catch (e) { } i.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveField(sh); }); }
        });
    }
    function cleanValue(key, raw) {
        var v = String(raw == null ? '' : raw).trim();
        if (key === 'venmo' || key === 'cashapp') return { v: v.replace(/^[@$]+/, '') };
        return { v: v };
    }
    function saveField(sh) {
        var key = editing, i = sh.querySelector('.hpa-edit input');
        if (!key || !i) return;
        var c = cleanValue(key, i.value);
        if (c.err) { setMsg(sh, c.err, true); return; }
        var a = api();
        if (!a || !a.profile || typeof a.profile.set !== 'function') { setMsg(sh, WORDS.notReady, true); return; }
        var patch = {}; patch[key] = c.v;
        busy(sh, true);
        var p; try { p = Promise.resolve(a.profile.set(patch)); } catch (e) { p = Promise.reject(e); }
        p.then(function () {
            editing = null;
            if (open !== 'profile') return;
            fillProfile(sh); renderSpot();
        }, function (err) {
            busy(sh, false);
            setMsg(sh, (err && err.message) || 'Could not save that. Try again.', true);
        });
    }
    function doSignOut(sh) {
        var a = api();
        if (!a || typeof a.signOut !== 'function') { setMsg(sh, WORDS.notReady, true); return; }
        busy(sh, true); setMsg(sh, WORDS.signingOut);
        var p; try { p = Promise.resolve(a.signOut()); } catch (e) { p = Promise.reject(e); }
        p.then(function () { close(); renderSpot(); }, function (err) {
            busy(sh, false);
            setMsg(sh, (err && err.message) || 'Could not sign out. Try again.', true);
        });
    }

    // ---- WIRING -------------------------------------------------------------------
    var attached = false;
    function attach() {
        var a = api();
        if (attached || !a) return !!attached;
        attached = true;
        try {
            if (typeof a.onChange === 'function') a.onChange(function () {
                renderSpot();
                // Signed out somewhere else: the profile sheet has nothing to show.
                if (open === 'profile' && !signedIn(state())) close();
                if (open === 'signin' && signedIn(state())) close();
            });
        } catch (e) { }
        renderSpot();
        return true;
    }
    function init() {
        injectCss();
        var b = $('hpa-spot');
        if (b && !b.__hpa) { b.__hpa = true; b.addEventListener('click', spotTap); }
        renderSpot();
        if (!attach()) {
            // hp-auth.js may load after this file (or async): look for it a few times.
            var n = 0, t = setInterval(function () { if (attach() || ++n > 40) clearInterval(t); }, 250);
        }
    }
    W.addEventListener('hardpan-auth-ready', function () { attach(); renderSpot(); });
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();

    W.HardPanAccountUI = {
        WORDS: WORDS,
        openSignIn: openSignIn,
        openProfile: openProfile,
        close: close,
        render: renderSpot,
        isOpen: function () { return open; },
        _signedIn: signedIn,
        _cleanValue: cleanValue,
        _initialOf: initialOf,
        _providerLabel: providerLabel
    };
})();
