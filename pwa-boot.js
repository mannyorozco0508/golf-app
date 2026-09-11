// ============================================================================
// PWA BOOT + CONNECTIVITY SAFETY
//
// Three jobs, one small file:
//
//   1. Register the service worker on the web build (never inside Capacitor).
//   2. Provide window.GolfNet - the connectivity pill, the pending-write
//      counter, and the beforeunload guard.
//   3. Provide window.GolfBack - the Android hardware back button, as one
//      precedence order every page shares. Armed only inside the native runtime.
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
    // WHY A SECOND COUNTER AND NOT A pending THAT NEVER CLEARS. A refused write
    // and a queued one need opposite words: a queued one lands when the signal
    // comes back, a refused one never lands at all. MEASURED against the live
    // database over CDP (tools/offline-measure.js) before this was written:
    //
    //   denied while online           REJECTED in ~110ms, PERMISSION_DENIED
    //   offline at the write          PENDING - never settled in 15s
    //   online, socket cut mid-flight RESOLVED at 3478ms once it came back
    //
    // So a rejection is the server refusing, never a dead spot on the 7th. That
    // is what makes a distinct, sticky failure state correct here instead of
    // nagging, and it is why `failed` is cleared by a successful write rather
    // than by a timer or by reconnecting.
    var failed = 0;
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
        return { online: isOnline(), pending: pending, failed: failed };
    }

    // Wrap any Firebase write promise. Increments before, decrements on settle -
    // resolve or reject, because either way it is no longer in flight - and now
    // records WHICH of the two it was.
    //
    // This used to be `promise.then(settle, settle)`: one handler for both
    // outcomes, so a refused write decremented the counter exactly like a saved
    // one and renderPill's last branch then hid the pill, which in this design is
    // the affirmative claim that everything is saved. The file's own header says
    // it exists to stop the app claiming success it does not have; that line
    // committed the same lie by a different route.
    //
    // 'neutral' is not a success. track(undefined) is not a write that landed, so
    // it must not clear a real failure.
    function track(promise) {
        pending++;
        notify();
        var done = false;
        function settle(outcome) {
            if (done) return;
            done = true;
            pending = Math.max(0, pending - 1);
            if (outcome === 'failed') failed++;
            else if (outcome === 'ok') failed = 0;
            notify();
        }
        try {
            if (promise && typeof promise.then === 'function') {
                // Observing a rejection necessarily marks the promise handled, so
                // the browser no longer raises unhandledrejection for it. That is
                // an acceptable trade only because the failure is now surfaced to
                // the golfer instead of to a console nobody is reading on a tee
                // box - and because the ORIGINAL promise is returned untouched, so
                // a caller's own .catch still receives the real error object.
                promise.then(function () { settle('ok'); },
                             function () { settle('failed'); });
            } else {
                settle('neutral');
            }
        } catch (e) {
            settle('neutral');
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
            // FIRST, AND STICKY. A refusal is the only state here that needs the
            // golfer to DO something, and it is the only one that does not resolve
            // itself: reconnecting does not un-refuse a write the server already
            // rejected. It clears when a later write actually lands, and at no
            // other time - not on a timer, not on an 'online' event.
            if (s.failed > 0) {
                el.style.display = 'block';
                el.style.background = '#fdecea';
                el.style.color = '#8a1c12';
                // THE COUNT, AND NOTHING ELSE. No advice, ever. The right action
                // differs per failure - re-enter a score, nothing to re-enter for a
                // refused course publish, and a refused round DELETE leaves the round
                // sitting there - and this counter cannot know which it is holding.
                // Every surface that knows WHAT failed says what to do about it:
                // index.html's save-state line names the hole, admin.html's Round
                // Ready note names the shared course list.
                el.textContent = '\uD83D\uDD34 ' + s.failed + ' change' + (s.failed === 1 ? '' : 's')
                    + ' did not go through.';
            } else if (!s.online && s.pending > 0) {
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
        if (pending <= 0 && failed <= 0) return undefined;
        // A refusal is worse than an outstanding write, not better: the write is
        // already gone and leaving is the moment the golfer stops being able to
        // re-enter it. Reading only `pending` meant the one state that is
        // permanently lost was the one state that raised no warning.
        // "could not be saved" and "loses them" are both false for a refused
        // DELETE: nothing was being saved, and nothing was lost - the round is
        // still there. This wording is true of all three failures.
        var msg = failed > 0
            ? 'Some changes did not go through.'
            : 'Changes are still waiting to sync. Leaving now may lose them.';
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e) e.returnValue = msg;
        return msg;
    }

    // ---- The hardware back button (Android) --------------------------------
    //
    // Capacitor 8 core has NO back-press handling: it is delegated entirely to
    // the @capacitor/app plugin, which fires 'backButton' with { canGoBack } and
    // otherwise does nothing - so without this block a press inside the Android
    // shell either closed the app (no plugin) or did nothing at all (plugin, no
    // listener). Neither is what a golfer means with the Dots modal open.
    //
    // ONE PRECEDENCE ORDER, walked top-down; the FIRST open probe acts and the
    // walk stops. One layer per press, always:
    //
    //   1  a sub-state inside an open modal      -> its own back   (page registers)
    //   2  a modal overlay on screen             -> close it        (generic below;
    //                                               a page may override ONE overlay's
    //                                               close, e.g. to clear a pending id)
    //   3  the ⋯ More popover                    -> close it        (generic below)
    //   5  the setup wizard past its first step  -> previous step   (admin registers)
    //   6  nothing open -> history.back() if the WebView can, else App.minimizeApp()
    //
    // 4 is reserved for the inline sheets (press panel, add-action, KP entry, hole
    // picker, group links, Cup join) and is deliberately not wired yet.
    //
    // NOT layers, by decision, and nothing here will ever treat them as one: the
    // Hole View / Full Card mode, accordions, the checkbox-driven Nassau and Main
    // Pool panels, the Cup setup draft (no Cancel exists; back must not discard
    // it), Round Ready -> wizard, and the New Trip form.
    //
    // WEB BEHAVIOUR IS UNCHANGED. The listener is armed only when
    // window.Capacitor.Plugins.App exists, which is the native runtime and nothing
    // else. On the web, press() is defined and never called by anything.
    //
    // THE PROBES A PAGE REGISTERS ARE CLOSURES, ON PURPOSE. pressPanelOpen,
    // currentWizardStep, rcJoin and their kind are script-scope `let`s in the
    // pages; this file cannot reach them by name and must not try. A page hands
    // over "is it open" and "close it" and keeps its state private.
    var backProbes = [];
    var overlayCloseOverrides = {};

    // probe: { name, priority, isOpen(), close() }
    //   or  { overlay: '<element id>', close() }  - replaces the generic close for
    //                                               that one overlay only
    function registerBackProbe(probe) {
        try {
            if (!probe) return false;
            if (probe.overlay && typeof probe.close === 'function') {
                overlayCloseOverrides[String(probe.overlay)] = probe.close;
                return true;
            }
            if (typeof probe.isOpen !== 'function' || typeof probe.close !== 'function') return false;
            backProbes.push({
                name: String(probe.name || 'probe'),
                priority: Number(probe.priority) || 9,
                isOpen: probe.isOpen,
                close: probe.close
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    // An overlay is on screen when its inline display says so - every page opens
    // one by writing style.display = 'flex' - or when it carries the `open` class,
    // which is how admin.html's paste modal is shown. CSS keeps them display:none
    // otherwise, so a blank inline style means closed.
    function overlayIsShown(el) {
        try {
            if (el.classList && el.classList.contains('open')) return true;
            var d = el.style && el.style.display;
            return !!d && d !== 'none';
        } catch (e) {
            return false;
        }
    }

    function shownOverlays() {
        try {
            var all = document.querySelectorAll('.modal-overlay, .recap-overlay');
            var out = [];
            for (var i = 0; i < all.length; i++) if (overlayIsShown(all[i])) out.push(all[i]);
            return out;
        } catch (e) {
            return [];
        }
    }

    // The LAST shown overlay in document order is treated as the top one. Two can
    // only be open together by a devtools call; one press still closes one.
    function closeTopOverlay() {
        var open = shownOverlays();
        if (open.length === 0) return;
        var el = open[open.length - 1];
        var override = el.id && overlayCloseOverrides[el.id];
        if (typeof override === 'function') { override(); return; }
        if (el.classList && el.classList.contains('open')) el.classList.remove('open');
        else el.style.display = 'none';
    }

    function openPopovers() {
        try {
            var all = document.querySelectorAll('details.nav-more[id]');
            var out = [];
            for (var i = 0; i < all.length; i++) if (all[i].open) out.push(all[i]);
            return out;
        } catch (e) {
            return [];
        }
    }

    // The two generic probes. Registered here so every page that loads this file
    // gets them without writing anything.
    registerBackProbe({ name: 'modal', priority: 2,
        isOpen: function () { return shownOverlays().length > 0; },
        close: closeTopOverlay });
    registerBackProbe({ name: 'popover', priority: 3,
        isOpen: function () { return openPopovers().length > 0; },
        close: function () { var d = openPopovers(); if (d.length) d[d.length - 1].open = false; } });

    function nativeApp() {
        try {
            var C = window.Capacitor;
            return (C && C.Plugins && C.Plugins.App) || null;
        } catch (e) {
            return null;
        }
    }

    // Returns the name of the layer that acted, or 'history' / 'minimize' / 'none'
    // when nothing was open. Tests read that; the listener ignores it.
    function pressBack(info) {
        var sorted = backProbes.slice().sort(function (a, b) { return a.priority - b.priority; });
        for (var i = 0; i < sorted.length; i++) {
            var probe = sorted[i];
            var open = false;
            // A probe that throws is a broken probe, not a reason to swallow the
            // press: skip it and keep walking.
            try { open = !!probe.isOpen(); } catch (e) { open = false; }
            if (!open) continue;
            try { probe.close(); } catch (e) { /* the layer stays; the walk still stops */ }
            return probe.name;
        }
        var canGoBack = !!(info && info.canGoBack);
        if (canGoBack && typeof history !== 'undefined' && history && typeof history.back === 'function') {
            history.back();
            return 'history';
        }
        var App = nativeApp();
        if (App && typeof App.minimizeApp === 'function') {
            // The root of the app. Minimise rather than exit: the round stays warm,
            // and one press can never lose the app the way exitApp() would.
            try { App.minimizeApp(); } catch (e) { /* nothing to do */ }
            return 'minimize';
        }
        return 'none';
    }

    function armBackButton() {
        var App = nativeApp();
        if (!App || typeof App.addListener !== 'function') return false;
        try {
            App.addListener('backButton', function (ev) { pressBack({ canGoBack: !!(ev && ev.canGoBack) }); });
            return true;
        } catch (e) {
            return false;
        }
    }

    var GolfBack = {
        register: registerBackProbe,
        press: pressBack,
        probes: function () {
            return backProbes.slice().sort(function (a, b) { return a.priority - b.priority; })
                .map(function (p) { return p.name; });
        },
        armed: false
    };

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
        _reset: function () { pending = 0; failed = 0; listeners = []; pillEl = null; }
    };

    if (typeof window !== 'undefined') {
        window.GolfNet = GolfNet;
        // Armed at load, not in boot(): the Capacitor bridge is injected before
        // any page script runs, and a page's first tap can come before `load`.
        GolfBack.armed = armBackButton();
        window.GolfBack = GolfBack;
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
            GolfBack: GolfBack,
            _boot: boot,
            _onBeforeUnload: onBeforeUnload
        };
    }
})();
