// ============================================================================
// PWA BOOT + CONNECTIVITY SAFETY
//
// Two jobs, one small file:
//
//   1. Register the service worker on the web build (never inside Capacitor).
//   2. Provide window.GolfNet - the connectivity pill, the pending-write
//      counter, and the beforeunload guard.
//
// EVERYTHING HERE IS OPTIONAL TO THE ROUND. If this file 404s, fails to parse,
// or throws, the app must behave exactly as it did before it existed. A golfer
// on the 4th tee has to be able to enter a score whether or not any of this
// ran. Every entry point is wrapped accordingly.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It does not store anything durably. Firebase Realtime Database on web has no
// on-disk write queue - `outstandingPuts_` is a plain in-memory array, and the
// only things the SDK ever writes to localStorage are a host hint and a
// websocket-failure flag. So a reload while offline loses unsynced writes, full
// stop. Nothing here can change that, and nothing here pretends to. The pill
// says "keep this page open" because that is literally the guarantee.
//
// THE MONEY GUARD IS NOT HERE, ON PURPOSE. Refusing an offline press has to
// work even if this file never loaded, so that check lives inline in the pages
// that create money and depends on nothing but navigator.onLine.
// ============================================================================

(function () {
    'use strict';

    // ---- Environment -------------------------------------------------------
    //
    // The same HTML ships to the web and, via sync-mobile-web.js, into the
    // Capacitor bundle. Only the web build should register a worker: the native
    // shell already serves every file from disk, so a second network-first
    // cache layer over capacitor:// adds nothing except a way to serve stale
    // copies the user cannot refresh away.
    function isNativeShell() {
        try {
            if (typeof window.Capacitor !== 'undefined') {
                if (typeof window.Capacitor.isNativePlatform === 'function') {
                    return window.Capacitor.isNativePlatform();
                }
                return true;
            }
            return window.location.protocol === 'capacitor:';
        } catch (e) {
            return false;
        }
    }

    function canRegister() {
        return typeof navigator !== 'undefined'
            && 'serviceWorker' in navigator
            && (window.location.protocol === 'https:' || window.location.hostname === 'localhost');
    }

    function registerServiceWorker() {
        if (isNativeShell()) return 'skipped-native';
        if (!canRegister()) return 'unsupported';
        try {
            navigator.serviceWorker.register('sw.js', { scope: './' })
                .then(function (reg) {
                    // NO AUTO-RELOAD ON UPDATE, on purpose.
                    //
                    // sw.js calls skipWaiting() and clients.claim(), so a new worker
                    // takes control as soon as it installs. Listening for
                    // controllerchange and reloading would pick up new code instantly
                    // - and could land mid-hole, discarding a foursome's half-entered
                    // scores. The fetch handler is network-first, so an online golfer
                    // already gets fresh files on the next navigation. Nobody is
                    // trapped on stale code; they just finish the hole first.
                    if (reg && typeof reg.addEventListener === 'function') {
                        reg.addEventListener('updatefound', function () {
                            console.info('[pwa] a new version is installing; it will be used on next load');
                        });
                    }
                })
                .catch(function (err) {
                    console.warn('[pwa] service worker registration failed (app continues normally):', err && err.message);
                });
            return 'registering';
        } catch (err) {
            console.warn('[pwa] service worker registration threw (app continues normally):', err && err.message);
            return 'threw';
        }
    }

    // ---- Pending-write tracking -------------------------------------------
    //
    // Counts writes handed to Firebase but NOT yet acknowledged by the server.
    // This is UI state only. It does not duplicate, cache, or replay any data -
    // it is a number, and its single purpose is to stop the app telling a
    // golfer something is saved when it is not.
    //
    // Why a counter and not a flag: a scorekeeper entering four players on a
    // hole fires four writes in a second. A boolean would clear on the first
    // acknowledgement and claim "Online" while three were still in flight.
    var pending = 0;
    var listeners = [];

    function notify() {
        listeners.forEach(function (fn) {
            try { fn(state()); } catch (e) { /* a broken listener must not break tracking */ }
        });
    }

    function isOnline() {
        try {
            // navigator.onLine is the browser's own view. It can be optimistic
            // (a captive portal reads as "online"), which is why it is used to
            // REFUSE actions rather than to promise success.
            return navigator.onLine !== false;
        } catch (e) {
            return true;
        }
    }

    function state() {
        return { online: isOnline(), pending: pending };
    }

    // Wrap any Firebase write promise. Increments before, decrements on settle
    // - resolve or reject, because either way it is no longer in flight.
    function track(promise) {
        pending++;
        notify();
        var done = false;
        function settle() {
            if (done) return;
            done = true;
            pending = Math.max(0, pending - 1);
            notify();
        }
        try {
            if (promise && typeof promise.then === 'function') {
                promise.then(settle, settle);
            } else {
                settle();
            }
        } catch (e) {
            settle();
        }
        return promise;
    }

    // ---- The status pill ---------------------------------------------------
    //
    // Injected at the very top of <body> rather than into the scorecard markup,
    // so the frozen hierarchy - hole header, score boxes, Prev/Next - is not
    // touched and navigation never gets pushed away from score entry.
    //
    // The wording is the whole point. It never says "Saved" or "Synced" on the
    // strength of a Firebase local event: RTDB fires those immediately, before
    // the server has seen anything, so treating one as confirmation is exactly
    // the lie this file exists to prevent.
    var pillEl = null;

    function ensurePill() {
        if (pillEl || typeof document === 'undefined' || !document.body) return pillEl;
        try {
            pillEl = document.createElement('div');
            pillEl.id = 'golfnet-status';
            pillEl.setAttribute('role', 'status');
            pillEl.setAttribute('aria-live', 'polite');
            pillEl.style.cssText = 'font:600 0.72rem -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
                + 'text-align:center;padding:5px 10px;border-radius:0 0 10px 10px;margin:0 auto 6px auto;'
                + 'max-width:420px;line-height:1.35;display:none;';
            document.body.insertBefore(pillEl, document.body.firstChild);
        } catch (e) {
            pillEl = null;
        }
        return pillEl;
    }

    function renderPill() {
        var el = ensurePill();
        if (!el) return;
        var s = state();
        try {
            if (!s.online && s.pending > 0) {
                el.style.display = 'block';
                el.style.background = '#fff4d6';
                el.style.color = '#8a6100';
                el.textContent = '\uD83D\uDFE1 Offline \u2014 ' + s.pending + ' change' + (s.pending === 1 ? '' : 's')
                    + ' waiting to sync. Keep this page open.';
            } else if (!s.online) {
                el.style.display = 'block';
                el.style.background = '#fff4d6';
                el.style.color = '#8a6100';
                el.textContent = '\uD83D\uDFE1 Offline \u2014 keep this page open. Scores sync when the connection returns.';
            } else if (s.pending > 0) {
                el.style.display = 'block';
                el.style.background = '#eef6f2';
                el.style.color = '#0f4c3a';
                el.textContent = '\uD83D\uDFE1 Waiting to sync (' + s.pending + ')\u2026';
            } else {
                // Nothing in flight and the browser reports a connection. The pill
                // hides rather than announcing "Online" - a permanent green badge
                // is noise on a phone held one-handed on a tee box.
                el.style.display = 'none';
                el.textContent = '';
            }
        } catch (e) { /* never let a cosmetic update throw into the page */ }
    }

    // ---- Leaving with work in flight ---------------------------------------
    //
    // Only armed while something is genuinely unacknowledged. An always-on
    // prompt gets dismissed reflexively and then means nothing on the one
    // occasion it matters.
    function onBeforeUnload(e) {
        if (pending <= 0) return undefined;
        var msg = 'Changes are still waiting to sync. Leaving now may lose them.';
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e) e.returnValue = msg;
        return msg;
    }

    // ---- Boot --------------------------------------------------------------
    // MARK THE NATIVE SHELL ON THE DOCUMENT.
    //
    // One class, set from the one detection mechanism, so a page can style itself
    // differently inside Capacitor without inventing a second way to ask. Used by
    // settlement.html and trip.html to hide the print controls, which cannot work
    // in WKWebView - window.print() is a silent no-op there.
    function markNativeShell() {
        try {
            if (isNativeShell() && document.documentElement) {
                document.documentElement.classList.add('is-native');
            }
        } catch (e) { /* cosmetic only; never break boot */ }
    }

    function boot() {
        try {
            markNativeShell();
            registerServiceWorker();
            renderPill();
            listeners.push(renderPill);
            window.addEventListener('online', renderPill);
            window.addEventListener('offline', renderPill);
            window.addEventListener('beforeunload', onBeforeUnload);
        } catch (err) {
            console.warn('[pwa] boot failed (app continues normally):', err && err.message);
        }
    }

    // Public surface. Kept deliberately small.
    var GolfNet = {
        // Already used internally to skip service-worker registration inside
        // Capacitor. Exposed because the Consumer pages need the same answer for a
        // different reason: the native bundle is Consumer ONLY, so any link to a
        // Tournament page resolves to a file that is not there.
        isNative: isNativeShell,
        isOnline: isOnline,
        state: state,
        track: track,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        _reset: function () { pending = 0; listeners = []; pillEl = null; }
    };

    if (typeof window !== 'undefined') {
        window.GolfNet = GolfNet;
        if (document.readyState === 'complete') {
            boot();
        } else {
            window.addEventListener('load', boot);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            isNativeShell: isNativeShell,
            canRegister: canRegister,
            registerServiceWorker: registerServiceWorker,
            GolfNet: GolfNet,
            _boot: boot,
            _onBeforeUnload: onBeforeUnload
        };
    }
})();
