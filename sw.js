// GolfApp Service Worker
// Purpose: let the app shell (HTML/CSS/JS) load instantly and work offline.
// This does NOT touch Firebase's live data sync - Realtime Database uses its
// own WebSocket connection and offline handling, completely separate from this.
//
// Bump this version string any time you want to force everyone's cached shell
// to refresh (e.g. after a big update). Old caches are cleaned up automatically.
// WHY THIS VERSION MOVED
//
// It sat at 'golfapp-v1' through every batch of this project. The fetch handler is
// network-first, so an online browser does get fresh files - but an installed PWA on
// iOS routinely paints from cache first, and anything already stored under a cache key
// that never changes is never invalidated. That is how a device kept rendering a
// scorecard whose markup had been deleted from the repo weeks earlier.
//
// Bumping the key makes the activate handler delete every older cache outright, so the
// next launch is guaranteed to be the deployed build. Bump it whenever the app shell
// changes in a way people must see. Moved to v4 because the shell list below gained
// pool-engine.js, and again to v5 when pwa-boot.js joined it - every already-installed
// device is carrying a cache that is missing whatever the newest entry is.
// Moved to v6 because the shell list below gained the three Tournament Mode files.
// They were shipped to the mobile bundle by sync-mobile-web.js but never precached
// here, so Tournament Mode only worked offline if it had been opened online first -
// exactly the wrong failure for a buddies trip, where the first launch may well be
// at a remote course with no signal.
// Moved to v7 because the shell gained the two local Firebase SDK files. Until
// this bump reaches a device, an installed PWA keeps its v6 cache and would never
// fetch them.
// Moved to v8 after a physical-device session where it was genuinely unclear whether
// the phone had loaded the newly deployed index.html or was painting an older cached
// shell. The shell FILE LIST is unchanged here; the key moves purely so the activate
// handler drops every older cache and the next launch is provably the deployed build.
// Ambiguity about which build is on the phone costs more than a single cold fetch.
// Moved to v9 because index.html - a shell file - changed again: the handicap-dot
// context gained an Auto mode that merges independent side matches, plus a start-hole
// gate on which holes draw match dots. The shell FILE LIST is unchanged; the key moves
// so an installed PWA cannot keep painting the v8 scorecard.
// Moved to v10 because index.html - a shell file - changed again: marks on the
// primary gross score are now gross-only (boxes), and a subordinate net-birdie
// indicator was added beneath it. The shell FILE LIST is unchanged; the key moves so
// an installed PWA cannot keep painting the v9 card, which circled gross pars.
// Moved to v11 because two precached files changed: bet-strip.js now resolves each
// press's own stake instead of the round's base stake, and index.html renders that
// amount plus the start hole on the collapsed ladder and offers a press-amount
// picker. An installed PWA on v10 would keep telling a golfer that a $50 press is
// $20. The shell FILE LIST is unchanged.
// Moved to v12 because admin.html - a precached shell file - changed: the course
// Par/HCP grid no longer reseeds itself on every outside tap, and a completed card is
// now validated at the Next/save boundary. On v11 an installed PWA would keep the
// build where a golfer literally cannot enter an unmapped course. Shell list unchanged.
// Moved to v13 to force every installed PWA to drop its cached shell. Six precached
// pages - admin, leaderboard, settlement, stats, skins, sidematches - carried a
// date-based kill switch that blanked the page once a hardcoded date passed. Without
// this bump an installed app would keep serving the expired shell from cache and stay
// dark even though the deployed fix is live. Shell FILE LIST unchanged.
const CACHE_VERSION = 'golfapp-v13-no-date-gate';

// Every file the shell actually needs. The old list predated the shared engine files
// and the pages added since, so those were only ever cached opportunistically at
// runtime - fine online, useless on the first offline launch at a remote course.
//
// THE RULE: if a page is listed here, every script that page loads must be listed too.
// These engines are plain <script src> globals and their call sites guard them with
// `typeof fn === 'function'`, so a missing engine does not throw - it silently does
// nothing. pool-engine.js was missing from this list while index.html, admin.html and
// settlement.html all load it, which meant an offline Money Pool computed as zero and
// disappeared from the banner, the receipt and the settlement totals with no error shown.
// bundle_manifest_test.js enforces the rule now.
const SHELL_FILES = [
    './index.html',
    './admin.html',
    './leaderboard.html',
    './skins.html',
    './stats.html',
    './settlement.html',
    './sidematches.html',
    './trip.html',
    // Tournament Mode. Linked from admin.html and trip.html, and shipped to the
    // mobile bundle - but omitted here until v6, which is why a first-time offline
    // launch showed the "No connection" page.
    './tournament.html',
    './tournament-scorecard.html',
    './instructions.html',
    './shared.html',
    // Shared engines. index.html cannot render a scorecard without these.
    './score-marks.js',
    './money-engine.js',
    './settlement-engine.js',
    './action-model.js',
    './bet-strip.js',
    './hole-events.js',
    './pool-engine.js',
    './course-data.js',
    // Both tournament pages load this; a cached page without its engine renders a
    // broken shell, which reads as "the app is working" and is worse than the
    // offline notice.
    './tournament-engine.js',
    './pwa-boot.js',
    // THE FIREBASE SDK, SERVED FROM THIS ORIGIN.
    //
    // Every data-bearing page loads these from gstatic today, so a genuinely cold
    // offline launch throws `ReferenceError: firebase is not defined` before any
    // page script runs. Precaching them here removes that dependency.
    //
    // ORDER MATTERS AT RUNTIME: firebase-app-compat.js defines the global that
    // firebase-database-compat.js attaches to, so a page must load app first. The
    // order in this array does not itself control that - it is the <script> tags on
    // each page that do - but they are listed in dependency order so the intent is
    // visible to whoever edits this next.
    //
    // Batch 7A only makes them available. The 11 pages still point at gstatic; 7B
    // flips them over.
    './firebase-app-compat.js',
    './firebase-database-compat.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    // Cached one file at a time, deliberately.
    //
    // cache.addAll() is atomic: if any single request 404s, the whole promise rejects
    // and NOTHING is written to the cache. The previous version wrapped that in a
    // .catch() whose comment claimed "whatever succeeds still gets cached" - which is
    // not how addAll behaves. One bad filename would have silently turned off offline
    // support for the entire app, and the swallowed rejection meant nothing would ever
    // have surfaced it. For an app whose job is to work on a course with no signal,
    // that is the wrong way round: a single missing file should cost that one file,
    // not the whole shell.
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => Promise.all(
            SHELL_FILES.map((file) => cache.add(file).catch((err) => {
                // Logged rather than swallowed, so a broken entry is findable in
                // Safari/Chrome devtools instead of failing invisibly.
                console.warn('[sw] could not cache', file, err);
            }))
        ))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only handle same-origin GET requests for the app shell. Everything else
    // (Firebase calls, external scripts, POSTs, etc.) passes straight through
    // to the network untouched. Firebase Realtime Database runs on a different
    // origin over its own WebSocket, so none of this touches live data sync.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    // A page request, as opposed to a script/icon/manifest request.
    const isNavigation = request.mode === 'navigate' || request.destination === 'document';

    // WHY THE QUERY STRING HAS TO BE IGNORED FOR PAGES
    //
    // Cache lookups match the FULL url, query string included. Every real link
    // this app hands out carries one:
    //
    //     index.html?game=ABCD&group=1     scorekeeper
    //     index.html?game=ABCD             organizer
    //     settlement.html?game=ABCD        receipt
    //
    // The install handler precaches './index.html' with no query at all, so a
    // plain lookup for any of those misses, respondWith() resolves to undefined,
    // and the navigation fails outright. The precached shell could never serve a
    // single URL a golfer actually opens.
    //
    // Ignoring the query string on page requests fixes that, and it is safe here
    // for a specific reason worth stating: every page in this app derives its
    // identity at runtime from window.location.search - the live document URL,
    // not the cache key. index.html reads `new URLSearchParams(window.location.search)`
    // to set currentMode and lockedGroup; the other nine pages do the same. So a
    // Group 2 scorekeeper served the shared cached shell still reads group=2 from
    // their own address bar and stays locked to Group 2. The HTML bytes are
    // identical for every group; only the URL differs, and the URL is preserved.
    //
    // Scripts and icons keep exact matching - they have no query strings, and
    // loosening the match there would gain nothing.
    async function fromCacheOrOffline() {
        const exact = await caches.match(request);
        if (exact) return exact;

        if (isNavigation) {
            const shell = await caches.match(request, { ignoreSearch: true });
            if (shell) return shell;
        }

        // Never resolve to undefined. respondWith(undefined) throws a TypeError
        // and produces a blank failed navigation with nothing to explain it.
        return new Response(
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Offline</title></head><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;">'
            + '<h1 style="font-size:3rem;margin:0;">\u26F3</h1>'
            + '<h2 style="color:#1d3557;">No connection</h2>'
            + '<p style="color:#666;line-height:1.5;">This page has not been opened on this device yet, so there is nothing saved to show. '
            + 'Reconnect and reload.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    // Network-first: always prefer the latest deployed version when online, so a
    // fresh deploy shows up on the next navigation rather than being trapped
    // behind a stale cache entry. Cache is purely the no-connection fallback.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
                return response;
            })
            .catch(() => fromCacheOrOffline())
    );
});
