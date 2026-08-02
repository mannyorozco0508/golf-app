// GolfApp Service Worker
// Purpose: let the app shell (HTML/CSS/JS) load instantly and work offline.
// This does NOT touch Firebase's live data sync - Realtime Database uses its
// own WebSocket connection and offline handling, completely separate from this.
//
// Bump this version string any time you want to force everyone's cached shell
// to refresh (e.g. after a big update). Old caches are cleaned up automatically.
const CACHE_VERSION = 'golfapp-v1';

const SHELL_FILES = [
    './index.html',
    './admin.html',
    './leaderboard.html',
    './skins.html',
    './stats.html',
    './settlement.html',
    './shared.html',
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
