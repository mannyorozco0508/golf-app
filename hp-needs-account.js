// ============================================================================
// HardPan - THE NEEDS-AN-ACCOUNT PROMPT (URGENT-048 part 3)
//
//   window.HardPanNeedsAccount.prompt({ feature, why, label, scope, href })
//       -> Promise<'signin' | 'notnow'>
//
// A bottom sheet, as previewed (claude-code-reports/048/preview/048-needs-account):
// an icon, "Sign in to use <Venmo>", the why, a green Sign in, "Not now", and a
// note that the round, GPS and games on this phone keep working.
//
//   Sign in -> window.HardPanAccountUI.openSignIn() (048 part 1). Resolves 'signin'
//              once window.HardPanAuth.onChange (048 part 2) reports signed in. If
//              the golfer closes the sign-in sheet without signing in, the promise
//              simply stays open: nothing waits on it to unblock anything.
//   Not now -> resolves 'notnow'. With `href`, "Not now" IS that link (a real
//              <a target=_blank>, the same way the page's own button opens it), so
//              the link still opens - a nudge, never a wall.
//
// AT MOST ONCE per `scope` (the round code) per feature, remembered on this phone
// (localStorage hardpan_needs_account; in memory if storage is blocked).
//
// shouldPrompt({ feature, scope }) is the synchronous check a caller makes in its
// click handler BEFORE stopping the tap: true only when this phone is signed out
// (anonymous), sign-in is on the page, no sheet is open, and this feature has not
// been asked about in this round yet. Missing HardPanAuth or HardPanAccountUI =
// false, so a page without sign-in behaves exactly as it does today.
//
// WORDING: this sheet sits on payment screens. Never the words for staking money.
// Nothing here reads or writes the database, location, or any money figure.
// Friends / chat / watching are not in this build (2.1); their copy is ready here.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var KEY = 'hardpan_needs_account';
    var FEATURES = {
        venmo: { label: 'Venmo', icon: '💸', why: 'So the money goes to the right person, and your friends see it’s really you.',
            fine: 'Not now: your round, GPS and games on this phone keep working. Settle up in cash anytime.' },
        friends: { label: 'Friends', icon: '👋', why: 'So your friends can find you, and see it’s really you.' },
        chat: { label: 'chat', icon: '💬', why: 'So the group knows who’s talking.' },
        watch: { label: 'Watch', icon: '👀', why: 'So the group knows who’s following along.' }
    };
    var FINE = 'Not now: your round, GPS and games on this phone keep working.';
    var mem = {}, open = null;

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function auth() { return W.HardPanAuth && typeof W.HardPanAuth.state === 'function' ? W.HardPanAuth : null; }
    function ui() { return W.HardPanAccountUI && typeof W.HardPanAccountUI.openSignIn === 'function' ? W.HardPanAccountUI : null; }
    function signedIn() { var a = auth(); if (!a) return true; try { var s = a.state(); return !!(s && s.signedIn); } catch (e) { return true; } }
    function seenKey(feature, scope) { return String(scope || '-') + '|' + String(feature || '-'); }
    function seenAll() { try { return JSON.parse(W.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return mem; } }
    function seen(o) { return !!seenAll()[seenKey(o.feature, o.scope)] || !!mem[seenKey(o.feature, o.scope)]; }
    function markSeen(o) {
        var k = seenKey(o.feature, o.scope), all = seenAll();
        mem[k] = Date.now(); all[k] = mem[k];
        // Keep the list short: the newest 200 round x feature marks.
        var ks = Object.keys(all).sort(function (a, b) { return all[b] - all[a]; });
        ks.slice(200).forEach(function (x) { delete all[x]; });
        try { W.localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
    }
    function shouldPrompt(o) {
        o = o || {};
        return !!(auth() && ui() && !signedIn() && !open && !seen(o));
    }

    var CSS = '.hpna-scrim{position:fixed;inset:0;background:rgba(10,20,15,.42);z-index:2147483000;opacity:0;transition:opacity .18s;}'
        + '.hpna-sheet{position:fixed;left:0;right:0;bottom:0;z-index:2147483001;background:#f2f4ef;color:#13241d;border-radius:22px 22px 0 0;'
        + 'padding:0 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.18);max-width:560px;margin:0 auto;'
        + 'font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-align:left;'
        + 'transform:translateY(100%);transition:transform .22s ease-out;box-sizing:border-box;}'
        + '.hpna-on .hpna-scrim{opacity:1;} .hpna-on .hpna-sheet{transform:none;}'
        + '.hpna-sheet *{box-sizing:border-box;}'
        + '.hpna-grab{width:40px;height:5px;border-radius:3px;background:#c9d1cc;margin:8px auto 6px;}'
        + '.hpna-ic{width:56px;height:56px;border-radius:16px;background:#e2f1ea;display:flex;align-items:center;justify-content:center;font-size:28px;margin:6px 2px 10px;}'
        + '.hpna-t{font-size:24px;font-weight:800;letter-spacing:-.01em;line-height:1.2;margin:0 0 6px;}'
        + '.hpna-why{font-size:16px;line-height:1.4;margin:2px 2px 16px;}'
        + '.hpna-in{display:flex;align-items:center;justify-content:center;width:100%;min-height:58px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font:inherit;font-weight:800;font-size:19px;line-height:1;cursor:pointer;}'
        + '.hpna-no{display:block;width:100%;text-align:center;color:#0f4c3a;font:inherit;font-weight:800;font-size:17px;line-height:50px;margin-top:4px;background:none;border:0;text-decoration:none;cursor:pointer;}'
        + '.hpna-fine{font-size:12.5px;color:#5d6b64;text-align:center;margin-top:12px;line-height:1.45;}'
        + '@media print{.hpna-root{display:none !important;}}';
    function style(d) {
        if (d.getElementById('hpna-style')) return;
        var st = d.createElement('style'); st.id = 'hpna-style'; st.textContent = CSS;
        (d.head || d.documentElement).appendChild(st);
    }

    function prompt(o) {
        o = o || {};
        if (open) return open.promise;
        var f = FEATURES[o.feature] || {};
        var label = o.label || f.label || 'this';
        var title = o.title || ('Sign in to use ' + label);
        var why = o.why || f.why || 'So your friends see it’s really you.';
        var fine = o.fine || f.fine || FINE;
        var d = W.document;
        var done, promise = new Promise(function (r) { done = r; });
        open = { promise: promise };
        markSeen(o);
        style(d);
        var root = d.createElement('div');
        root.className = 'hpna-root';
        root.setAttribute('data-hpna', String(o.feature || ''));
        var no = o.href
            ? '<a class="hpna-no" data-hpna-no href="' + esc(o.href) + '" target="_blank" rel="noopener">Not now</a>'
            : '<button type="button" class="hpna-no" data-hpna-no>Not now</button>';
        root.innerHTML = '<div class="hpna-scrim" data-hpna-scrim></div>'
            + '<div class="hpna-sheet" role="dialog" aria-modal="true" aria-labelledby="hpna-t">'
            + '<div class="hpna-grab"></div>'
            + '<div class="hpna-ic" aria-hidden="true">' + esc(o.icon || f.icon || '👤') + '</div>'
            + '<h2 class="hpna-t" id="hpna-t">' + esc(title) + '</h2>'
            + '<div class="hpna-why">' + esc(why) + '</div>'
            + '<button type="button" class="hpna-in" data-hpna-in>Sign in</button>'
            + no
            + '<div class="hpna-fine">' + esc(fine) + '</div></div>';
        (d.body || d.documentElement).appendChild(root);
        // Next frame: slide up.
        (W.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })(function () { root.classList.add('hpna-on'); });
        var prevFocus = d.activeElement;
        try { root.querySelector('[data-hpna-in]').focus({ preventScroll: true }); } catch (e) {}

        function close() {
            d.removeEventListener('keydown', onKey, true);
            if (root.parentNode) root.parentNode.removeChild(root);
            open = null;
            try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (e) {}
        }
        function notNow(openLink) {
            // A tap outside / Escape is "Not now" too: the link still opens.
            if (openLink && o.href) { try { W.open(o.href, '_blank', 'noopener'); } catch (e) {} }
            close();
            done('notnow');
        }
        function signIn() {
            close();
            var a = auth(), off = null, finished = false;
            function check() {
                if (finished || !signedIn()) return;
                finished = true;
                if (typeof off === 'function') { try { off(); } catch (e) {} }
                done('signin');
            }
            if (a && typeof a.onChange === 'function') { try { off = a.onChange(check); } catch (e) {} }
            var u = ui();
            if (u) { try { u.openSignIn(); } catch (e) {} }
            check();
        }
        function onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); notNow(true); } }
        d.addEventListener('keydown', onKey, true);
        root.addEventListener('click', function (ev) {
            var t = ev.target;
            if (t.closest('[data-hpna-in]')) { ev.preventDefault(); signIn(); return; }
            if (t.closest('[data-hpna-no]')) {
                // A link "Not now" keeps its own default action: the browser opens it.
                // The sheet goes on the next tick, after the browser has followed it.
                if (!o.href) { ev.preventDefault(); notNow(false); return; }
                root.style.pointerEvents = 'none';
                setTimeout(function () { notNow(false); }, 0);
                return;
            }
            if (t.closest('[data-hpna-scrim]')) { ev.preventDefault(); notNow(true); }
        });
        return promise;
    }

    W.HardPanNeedsAccount = {
        prompt: prompt,
        shouldPrompt: shouldPrompt,
        seen: seen,
        isOpen: function () { return !!open; },
        FEATURES: FEATURES,
        _reset: function () { mem = {}; try { W.localStorage.removeItem(KEY); } catch (e) {} }
    };
})();
