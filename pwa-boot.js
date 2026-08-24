// ============================================================================
// PWA BOOT - the one place the service worker gets registered.
//
// Deliberately tiny, deliberately centralized, and deliberately incapable of
// breaking the round. Everything in here is wrapped so that no failure path
// can throw into the page. A golfer standing on the 4th tee must be able to
// enter a score whether or not this file did anything at all.
//
// NOT YET WIRED INTO ANY PAGE. This file is inert until a <script src> tag
// points at it. See the batch report for why activation was held back: with
// Firebase Realtime Database on web there is no on-disk write queue, so an
// offline reload loses unsynced scores. Turning the offline shell on before
// that is handled would make the app LOOK offline-capable while quietly
// dropping money and scores, which is worse than today's honest browser error.
// ============================================================================

(function () {
    'use strict';

    // ---- Where are we running? ---------------------------------------------
    //
    // The same HTML ships to three places and only one of them should register
    // a service worker:
    //
    //   web / Cloudflare Pages  -> register. This is the PWA.
    //   Capacitor native        -> do NOT register. The native shell already
    //                              serves every file from the app bundle on
    //                              disk; there is nothing for a network-first
    //                              worker to improve, and adding a second
    //                              caching layer over capacitor:// just creates
    //                              a way for the bundled app to serve stale
    //                              copies of files the user cannot refresh.
    //   file:// (opened locally)-> cannot register; the API is unavailable.
    //
    // Capacitor injects window.Capacitor before app code runs, and serves the
    // app from capacitor:// (iOS) or http://localhost (Android). Checking the
    // global is the documented test; the protocol check is a belt-and-braces
    // fallback in case the global is ever injected later than this script runs.
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

    // ---- Registration -------------------------------------------------------
    //
    // Runs after load so it never competes with the scorecard for bandwidth or
    // main-thread time on a phone on cell data at a course.
    function registerServiceWorker() {
        if (isNativeShell()) return 'skipped-native';
        if (!canRegister()) return 'unsupported';

        try {
            navigator.serviceWorker.register('sw.js', { scope: './' })
                .then(function (reg) {
                    // NO AUTO-RELOAD ON UPDATE, on purpose.
                    //
                    // sw.js calls skipWaiting() and clients.claim(), so a new
                    // worker takes control as soon as it installs. It would be
                    // easy to listen for controllerchange and reload the page to
                    // pick up new code immediately - and it would be wrong. That
                    // reload can land mid-hole, halfway through entering a
                    // foursome's scores, and anything typed but not yet committed
                    // goes with it.
                    //
                    // The cost of not reloading is small: the fetch handler is
                    // network-first, so an online golfer already gets fresh files
                    // on the next navigation. Nobody gets trapped on stale code;
                    // they just finish the hole first.
                    if (reg && typeof reg.addEventListener === 'function') {
                        reg.addEventListener('updatefound', function () {
                            console.info('[pwa] a new version is installing; it will be used on next load');
                        });
                    }
                })
                .catch(function (err) {
                    // A failed registration is a non-event for the golfer. No
                    // alert, no banner, no thrown error - the app works exactly
                    // as it does today, straight off the network.
                    console.warn('[pwa] service worker registration failed (app continues normally):', err && err.message);
                });
            return 'registering';
        } catch (err) {
            console.warn('[pwa] service worker registration threw (app continues normally):', err && err.message);
            return 'threw';
        }
    }

    function boot() {
        try {
            registerServiceWorker();
        } catch (err) {
            console.warn('[pwa] boot failed (app continues normally):', err && err.message);
        }
    }

    if (typeof window !== 'undefined') {
        if (document.readyState === 'complete') {
            boot();
        } else {
            window.addEventListener('load', boot);
        }
    }

    // Exported for tests only. The page never calls these.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { isNativeShell: isNativeShell, canRegister: canRegister, registerServiceWorker: registerServiceWorker };
    }
})();
