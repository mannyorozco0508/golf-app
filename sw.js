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
// changes in a way people must see.
const CACHE_VERSION = 'golfapp-v2-scorecard-cleanup';

// Every file the shell actually needs. The old list predated the shared engine files
// and the pages added since, so those were only ever cached opportunistically at
// runtime - fine online, useless on the first offline launch at a remote course.
const SHELL_FILES = [
    './index.html',
    './admin.html',
    './leaderboard.html',
    './skins.html',
    './stats.html',
    './settlement.html',
    './sidematches.html',
    './trip.html',
    './instructions.html',
    './shared.html',
    // Shared engines. index.html cannot render a scorecard without these.
    './money-engine.js',
    './settlement-engine.js',
    './action-model.js',
    './bet-strip.js',
    './hole-events.js',
    './course-data.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {
            // Ignore individual file failures (e.g. a file that doesn't exist yet) so
            // install doesn't fail outright - whatever succeeds still gets cached.
        })
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
    // to the network untouched.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    // Network-first: always prefer the latest deployed version when online,
    // so a fresh GitHub Pages deploy shows up immediately. Cache is purely
    // a fallback for when there's no connection at all.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
                return response;
            })
            .catch(() => caches.match(request))
    );
});
