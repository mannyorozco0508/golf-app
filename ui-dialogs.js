// ============================================================================
// ui-dialogs.js — THE APP'S OWN TELLING, ASKING AND TYPING
//
// WHAT THIS REPLACES. alert(), confirm() and prompt() render a browser chrome
// that says "golf-app-5a5.pages.dev says" above the message — or the capacitor://
// origin inside the native app. A golfer reads that as a website error, not as
// their scorecard talking to them. There were 161 of them across the consumer
// pages (tournament.html is the other product and is out of scope).
//
// FOUR THINGS, AND THE SPLIT IS NOT COSMETIC — IT IS WHAT THE MESSAGE IS FOR:
//
//   uiRefuse(msg)   THE ACTION DID NOT HAPPEN. Inline, next to the control that
//                   was tapped, and it STAYS until something changes. A refusal
//                   that floats away leaves a golfer tapping a dead button twice
//                   wondering why nothing happens.
//
//   uiFail(msg)     A WRITE FAILED. Inline and PERSISTENT, never self-dismissing.
//                   This is the most dangerous message in the app: "PRESS NOT
//                   SAVED — nothing was created". A golfer who misses it believes
//                   they have a $20 press that does not exist.
//
//   uiToast(msg)    IT WORKED. The only self-dismissing one, and the only one
//                   allowed to float. Dwell scales with the message: a press
//                   receipt is three lines ("PRESS CONFIRMED / Ann vs Ben / $20 /
//                   Starts Hole 7") and three lines need longer than "Link
//                   copied".
//
//   uiConfirm(o)    A DECISION. Returns a PROMISE<boolean>. The page's modal
//                   pattern, 44px targets, and the destructive choice is NOT the
//                   one under the thumb by default.
//
//   uiAmount(o)     A NUMBER. Returns a PROMISE<number|null>. inputmode="decimal"
//                   so a phone gives a numeric keypad, which prompt() cannot do.
//
// THE PROMISES ARE THE WHOLE RISK OF THIS WAVE. confirm() and prompt() are
// synchronous and these are not, so every caller must await. A MISSED AWAIT DOES
// NOT THROW — it silently inverts the guard:
//
//     if (!confirm(msg)) return;   ->   if (!Promise) return;
//                                  ->   !Promise is always false
//                                  ->   the return never runs and the round is
//                                       deleted without anyone being asked
//
// and the test harness's confirm() returns true, so a site with a forgotten await
// behaves in tests exactly as it does in production. dialog_await_guard_test.js
// reads the SOURCE at every call site for that reason, because no behavioural
// test can see this.
//
// WHERE "INLINE" IS. There is no per-call anchor to plumb through 24 call sites,
// so this records the last control a golfer actually tapped (one capture-phase
// listener) and puts the note after that control's row. That is reliable on iOS,
// where a tapped <button> does not necessarily take focus, so activeElement is
// not a substitute.
//
// SELF-CONTAINED ON PURPOSE. It injects its own CSS. Three pages had drifting
// copies of .modal-overlay (admin.html's backdrop and z-index had already
// diverged from index.html's and sidematches.html's) and six consumer pages had
// none at all, so "use the page's existing modal" would have meant adding a
// fourth and fifth copy. One file, loaded by any page that needs to speak.
// ============================================================================
(function (root) {
    'use strict';

    var STYLE_ID = 'ui-dialogs-style';
    var NOTE_CLASS = 'ui-note';

    // ---- CSS, injected once ------------------------------------------------
    // Colours come from the pages' own CSS custom properties, so this inherits
    // light and dark without knowing anything about either.
    var CSS = [
        '.ui-note{display:block;margin:8px 0 4px 0;padding:10px 12px;border-radius:8px;',
        'font-size:0.82rem;line-height:1.45;white-space:pre-line;text-align:left;border:1px solid}',
        '.ui-note-refuse{background:var(--warn-bg,#fff4e5);border-color:var(--warn-border,#e08a00);color:var(--warn-text,#7a4a00)}',
        '.ui-note-fail{background:var(--danger-box-bg,#fff0f0);border-color:var(--accent-red,#e63946);color:var(--accent-red,#e63946);font-weight:bold}',
        '.ui-toast-wrap{position:fixed;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));',
        'z-index:4000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 12px}',
        '.ui-toast{max-width:420px;width:100%;box-sizing:border-box;background:var(--brand-green,#0f4c3a);color:#F2EDE4;',
        'padding:12px 14px;border-radius:10px;font-size:0.85rem;line-height:1.45;white-space:pre-line;',
        'box-shadow:0 6px 18px rgba(0,0,0,0.25);text-align:left}',
        '.ui-sheet{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);',
        'z-index:4100;align-items:center;justify-content:center;box-sizing:border-box;',
        'padding:max(20px,env(safe-area-inset-top,0px)) 20px max(20px,env(safe-area-inset-bottom,0px)) 20px}',
        '.ui-sheet.open{display:flex}',
        '.ui-sheet-card{background:var(--modal-bg,#fff);color:var(--text-main,#1a1a1a);border-radius:14px;',
        'padding:18px;max-width:420px;width:100%;box-sizing:border-box;max-height:100%;overflow:auto}',
        '.ui-sheet-title{font-weight:800;color:var(--brand-green,#0f4c3a);font-size:1rem;margin:0 0 8px 0}',
        '.ui-sheet-body{font-size:0.86rem;line-height:1.5;color:var(--text-main,#1a1a1a);white-space:pre-line;margin:0 0 14px 0}',
        '.ui-sheet-row{display:flex;gap:10px;flex-wrap:wrap}',
        '.ui-sheet-row button{flex:1 1 140px;min-height:44px;border-radius:10px;font-size:0.9rem;font-weight:bold;cursor:pointer;padding:0 14px}',
        '.ui-btn-cancel{background:var(--bg-card,#fff);color:var(--text-main,#1a1a1a);border:1px solid var(--border-mid,#d0e1db)}',
        '.ui-btn-go{background:var(--brand-green,#0f4c3a);color:#fff;border:1px solid var(--brand-green,#0f4c3a)}',
        '.ui-btn-danger{background:var(--accent-red,#e63946);color:#fff;border:1px solid var(--accent-red,#e63946)}',
        '.ui-amount-input{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;margin:0 0 12px 0;',
        'border:1px solid var(--border-mid,#d0e1db);border-radius:8px;font-size:16px;',
        'background:var(--bg-card,#fff);color:var(--text-main,#1a1a1a)}'
    ].join('');

    function ensureStyle() {
        if (typeof document === 'undefined' || !document.head) return;
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    // ---- WHERE A NOTE GOES -------------------------------------------------
    // The last control the golfer actually pressed. Captured on the way DOWN so
    // it is recorded before the handler runs and calls uiRefuse.
    var lastTapped = null;
    function rememberTap(ev) {
        var t = ev && ev.target;
        while (t && t !== document.body) {
            var tag = (t.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a' || t.getAttribute && t.getAttribute('onclick')) {
                lastTapped = t; return;
            }
            t = t.parentNode;
        }
    }
    function installTapWatch() {
        if (typeof document === 'undefined' || !document.addEventListener) return;
        try {
            document.addEventListener('click', rememberTap, true);
            document.addEventListener('touchstart', rememberTap, true);
        } catch (e) { /* no document events in a bare realm */ }
    }

    function esc(s) {
        if (typeof escapeHtml === 'function') return escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // One note at a time. A second refusal replaces the first rather than
    // stacking, because two stale warnings above a button is worse than one.
    function clearNotes() {
        if (typeof document === 'undefined' || !document.querySelectorAll) return;
        var all = document.querySelectorAll('.' + NOTE_CLASS);
        for (var i = 0; i < all.length; i++) {
            if (all[i].parentNode) all[i].parentNode.removeChild(all[i]);
        }
    }

    function placeNote(kind, message) {
        ensureStyle();
        clearNotes();
        if (typeof document === 'undefined' || !document.createElement) return null;
        var note = document.createElement('div');
        note.className = NOTE_CLASS + ' ' + NOTE_CLASS + '-' + kind;
        note.setAttribute('role', kind === 'fail' ? 'alert' : 'status');
        note.textContent = String(message == null ? '' : message);
        var anchor = lastTapped;
        var host = (anchor && anchor.parentNode) ? anchor.parentNode : null;
        if (host && host.insertBefore) {
            if (anchor.nextSibling) host.insertBefore(note, anchor.nextSibling);
            else host.appendChild(note);
        } else if (document.body && document.body.appendChild) {
            document.body.appendChild(note);
        }
        if (note.scrollIntoView) {
            try { note.scrollIntoView({ block: 'nearest' }); } catch (e) { /* no layout */ }
        }
        return note;
    }

    // THE ACTION DID NOT HAPPEN. Persistent.
    function uiRefuse(message) { return placeNote('refuse', message); }
    // A WRITE FAILED. Persistent, and louder. Never self-dismisses.
    function uiFail(message) { return placeNote('fail', message); }

    // ---- IT WORKED ---------------------------------------------------------
    // The only floating, self-dismissing one. Dwell scales with how much there
    // is to read: a press receipt is four lines and four lines are not a glance.
    var DWELL_BASE = 2600;
    var DWELL_PER_LINE = 900;
    var DWELL_MAX = 9000;
    function dwellFor(message) {
        var lines = String(message == null ? '' : message).split('\n').length;
        return Math.min(DWELL_MAX, DWELL_BASE + (lines - 1) * DWELL_PER_LINE);
    }
    function toastWrap() {
        var w = document.getElementById('ui-toast-wrap');
        if (w) return w;
        w = document.createElement('div');
        w.id = 'ui-toast-wrap';
        w.className = 'ui-toast-wrap';
        w.setAttribute('role', 'status');
        if (document.body && document.body.appendChild) document.body.appendChild(w);
        return w;
    }
    // `ms` overrides the computed dwell. Not a test hook: a caller with a longer
    // sentence than its line count suggests can say so. Omitted everywhere in the
    // app today, which is the point - the default is derived from the message.
    function uiToast(message, ms) {
        ensureStyle();
        if (typeof document === 'undefined' || !document.createElement) return null;
        var el = document.createElement('div');
        el.className = 'ui-toast';
        el.textContent = String(message == null ? '' : message);
        var w = toastWrap();
        if (w && w.appendChild) w.appendChild(el);
        ms = (typeof ms === 'number' && ms > 0) ? ms : dwellFor(message);
        if (typeof setTimeout === 'function') {
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
        }
        el.__dwellMs = ms;
        return el;
    }

    // ---- A DECISION --------------------------------------------------------
    function sheet() {
        var s = document.getElementById('ui-sheet');
        if (s) return s;
        s = document.createElement('div');
        s.id = 'ui-sheet';
        s.className = 'ui-sheet';
        s.setAttribute('role', 'dialog');
        s.setAttribute('aria-modal', 'true');
        if (document.body && document.body.appendChild) document.body.appendChild(s);
        return s;
    }
    function closeSheet() {
        var s = document.getElementById('ui-sheet');
        if (s && s.classList) s.classList.remove('open');
        if (s) s.innerHTML = '';
    }

    // Returns a PROMISE<boolean>. Every caller must await it — see the header.
    function uiConfirm(opts) {
        var o = opts || {};
        var title = o.title || 'Are you sure?';
        var body = o.body || '';
        var goText = o.confirmText || 'Yes';
        var cancelText = o.cancelText || 'Cancel';
        var danger = o.danger !== false;   // these are destructive by default
        ensureStyle();
        if (typeof document === 'undefined' || !document.createElement || typeof Promise === 'undefined') {
            return Promise.resolve(false);
        }
        var s = sheet();
        s.innerHTML =
            '<div class="ui-sheet-card">'
          + '<p class="ui-sheet-title">' + esc(title) + '</p>'
          + (body ? '<p class="ui-sheet-body">' + esc(body) + '</p>' : '')
          + '<div class="ui-sheet-row">'
          + '<button type="button" class="ui-btn-cancel" id="ui-sheet-no">' + esc(cancelText) + '</button>'
          + '<button type="button" class="' + (danger ? 'ui-btn-danger' : 'ui-btn-go') + '" id="ui-sheet-yes">' + esc(goText) + '</button>'
          + '</div></div>';
        if (s.classList) s.classList.add('open');
        return new Promise(function (resolve) {
            var done = false;
            function finish(v) {
                if (done) return;
                done = true;
                closeSheet();
                resolve(v);
            }
            var yes = document.getElementById('ui-sheet-yes');
            var no = document.getElementById('ui-sheet-no');
            // CANCEL IS THE ONE UNDER THE THUMB. The destructive button is second
            // and is never focused: nobody deletes a round by double-tapping.
            if (yes) yes.onclick = function () { finish(true); };
            if (no) no.onclick = function () { finish(false); };
            if (no && no.focus) { try { no.focus(); } catch (e) {} }
            s.__resolve = finish;
        });
    }

    // ---- A NUMBER ----------------------------------------------------------
    // Returns a PROMISE<number|null>. null means cancelled, and a caller must
    // tell null apart from 0 — which is why this never resolves to NaN.
    function uiAmount(opts) {
        var o = opts || {};
        var title = o.title || 'Amount';
        var body = o.body || '';
        var initial = (o.value === undefined || o.value === null) ? '' : String(o.value);
        ensureStyle();
        if (typeof document === 'undefined' || !document.createElement || typeof Promise === 'undefined') {
            return Promise.resolve(null);
        }
        var s = sheet();
        s.innerHTML =
            '<div class="ui-sheet-card">'
          + '<p class="ui-sheet-title">' + esc(title) + '</p>'
          + (body ? '<p class="ui-sheet-body">' + esc(body) + '</p>' : '')
          + '<input id="ui-amount-input" class="ui-amount-input" type="number" inputmode="decimal" '
          + 'step="any" min="0" autocomplete="off" aria-label="' + esc(title) + '">'
          + '<div class="ui-sheet-row">'
          + '<button type="button" class="ui-btn-cancel" id="ui-amount-cancel">Cancel</button>'
          + '<button type="button" class="ui-btn-go" id="ui-amount-ok">' + esc(o.confirmText || 'Save') + '</button>'
          + '</div></div>';
        if (s.classList) s.classList.add('open');
        var box = document.getElementById('ui-amount-input');
        if (box) {
            box.value = initial;
            if (box.focus) { try { box.focus(); } catch (e) {} }
        }
        return new Promise(function (resolve) {
            var done = false;
            function finish(v) {
                if (done) return;
                done = true;
                closeSheet();
                resolve(v);
            }
            var ok = document.getElementById('ui-amount-ok');
            var cancel = document.getElementById('ui-amount-cancel');
            if (ok) ok.onclick = function () {
                var raw = box ? String(box.value == null ? '' : box.value).trim() : '';
                if (raw === '') { finish(null); return; }
                var n = Number(raw);
                // NEVER NaN. A caller that got NaN out of prompt() created a press
                // with a NaN stake; this returns null instead and the caller's own
                // refusal says so.
                finish(isFinite(n) ? n : null);
            };
            if (cancel) cancel.onclick = function () { finish(null); };
            s.__resolve = finish;
        });
    }

    installTapWatch();

    var api = {
        uiRefuse: uiRefuse,
        uiFail: uiFail,
        uiToast: uiToast,
        uiConfirm: uiConfirm,
        uiAmount: uiAmount,
        uiClearNotes: clearNotes,
        uiCloseSheet: closeSheet,
        uiDwellFor: dwellFor,
        __uiRememberTap: rememberTap
    };
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
