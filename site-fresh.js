// ============================================================================
// THE HOMEPAGE RELOADS ITSELF WHEN A NEW RELEASE IS LIVE AND THE TAB COMES BACK (ADVISOR-20261116-0049)
//
// Its own file, on purpose: site-features.js promises (web_e_features_test.js) that it sends nothing anywhere, and the
// one request this needs is a HEAD of the page's own address. Loaded by hardpan-home.html only (not in sw.js's shell
// list, not in the native bundle). Guard: hardpan_home_fresh_test.js.
// ============================================================================
(function () {
    'use strict';
    // Manny's iPhone kept showing an old homepage in a tab it had open since before a deploy; the tiles it had were the
    // old ones. functions/_front-door.js now serves `/` with the deploy's build in Server-Timing (build;desc=<sha>) and
    // X-HardPan-Build. This remembers the build the page was loaded from (the navigation entry's serverTiming; where that
    // is not readable, the first HEAD answer) and, whenever the tab comes back to the front (visibilitychange, pageshow
    // from the back-forward cache, online), at most once a minute, asks `/` with a HEAD (cache: no-store; the service
    // worker never intercepts a HEAD) for the build now live. A different build reloads the page, unless the viewer or a
    // sheet is open: then the reload waits for the next return. Nothing is polled while the tab is in front. A visitor on
    // a page the Function did not stamp (a local file, a very old deploy) sees 'dev' or '' and nothing ever reloads.
    (function () {
        var loaded = '';
        try {
            var nav = performance.getEntriesByType('navigation')[0];
            (nav && nav.serverTiming || []).forEach(function (t) { if (t.name === 'build' && t.description) loaded = t.description; });
        } catch (e) { /* no timing entry: the first HEAD answer is the baseline */ }
        var last = 0, busy = false;
        function liveBuild() {
            return fetch(location.pathname + location.search, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' })
                .then(function (r) { return r.ok ? (r.headers.get('X-HardPan-Build') || '') : ''; })
                .catch(function () { return ''; });
        }
        function check() {
            if (document.visibilityState === 'hidden' || busy) return;
            var now = Date.now();
            if (now - last < 60000) return;
            last = now; busy = true;
            liveBuild().then(function (b) {
                busy = false;
                if (!b || b === 'dev') return;
                if (!loaded) { loaded = b; return; }
                if (b === loaded) return;
                var fvEl = document.getElementById('fv');
                if ((fvEl && !fvEl.hidden) || document.querySelector('.sheet:not([hidden])')) { last = 0; return; }
                location.reload();
            });
        }
        document.addEventListener('visibilitychange', check);
        window.addEventListener('pageshow', function (ev) { if (ev.persisted) { last = 0; check(); } });
        window.addEventListener('online', function () { last = 0; check(); });
        window.__hpLoadedBuild = function () { return loaded; };   // read by the guard; nothing on the page calls it
    })();
})();
