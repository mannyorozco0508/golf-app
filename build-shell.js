#!/usr/bin/env node
// ============================================================================
// GolfApp — Deployment Builder
//
// Produces two independently deployable PWAs from ONE flat source tree:
//
//     node build-shell.js consumer     -> dist/consumer
//     node build-shell.js tournament   -> dist/tournament
//     node build-shell.js              -> both
//
// WHAT IT DOES, AND DELIBERATELY DOES NOT DO
//
// It copies. There is no bundler, no transform, no minifier and no dependency
// graph to get wrong - the app is plain HTML and plain <script src> globals, and
// a build that only copies is a build whose output you can read.
//
// Membership comes from the three product shell declarations in
// sync-mobile-web.js: SHARED_SHELL, CONSUMER_SHELL, TOURNAMENT_SHELL. Those were
// written as classification before any deployment existed, precisely so this
// script would not be the place ownership gets decided under time pressure.
//
// TWO FILES ARE GENERATED RATHER THAN COPIED: sw.js and manifest.json. Each
// output needs its own, because two root-scope service workers cannot coexist on
// one origin and because two installable apps need two identities. Generating
// them from the same source template keeps one caching strategy rather than two
// drifting copies, and means the precache list is derived from what actually
// landed in that output instead of being maintained by hand.
//
// THE SOURCE TREE IS UNTOUCHED. dist/ is output; the flat root files remain the
// only place anything is edited, and the current combined deployment still works
// exactly as before.
// ============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// ---------------------------------------------------------------------------
// MEMBERSHIP — read from the declarations, never restated here
// ---------------------------------------------------------------------------

function declaredList(name) {
    const src = fs.readFileSync(path.join(ROOT, 'sync-mobile-web.js'), 'utf8');
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(src);
    if (!m) throw new Error(name + ' is not declared in sync-mobile-web.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const SHARED = declaredList('SHARED_SHELL');
const CONSUMER = declaredList('CONSUMER_SHELL');
const TOURNAMENT = declaredList('TOURNAMENT_SHELL');

// Generated per output, so they are never copied from source.
const GENERATED = ['sw.js', 'manifest.json'];

const PRODUCTS = {
    consumer: {
        files: SHARED.concat(CONSUMER),
        cacheName: 'consumer-v45-no-native-print',
        appName: 'Rattle Golf',
        shortName: 'Rattle Golf',
        description: 'Live-syncing golf scorecard and betting tracker',
        startUrl: './admin.html',
        themeColor: '#0E2B1F',
        backgroundColor: '#F6F4EC',
        // MASKABLE IS CORRECT HERE and is not a copy of what Tournament does.
        // Android keeps only the inner 80% circle of a maskable icon; the brush
        // R spans 74.7% of the canvas and sits centred, so the crop takes
        // background and nothing else. Measured, not assumed.
        icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
    },
    tournament: {
        files: SHARED.concat(TOURNAMENT),
        // Moved to v36. The icons changed in v35 and the manifest both tournament
        // pages link is new in v36 - a precached page whose manifest is not in the
        // same cache generation cannot be installed offline, and an installed
        // device would keep serving the head of the page without the link at all.
        // Everything v34 carried is still here:
        //   tournament-scorecard.html  the hole you are typing is never rebuilt;
        //                              stroke dots on the golfer's own card; the
        //                              roster no longer prints "(0)" for a
        //                              handicap nobody has supplied
        //   tournament-engine.js       netIsInPlay/netWasRefused, one format
        //                              label, one competitor count, withdrawal,
        //                              unnamed entries, pending handicaps, and
        //                              who bought an entry
        //   tournament.html            Net/Gross and format wording derived from
        //                              the engine, pool counts golfers on an
        //                              individual event, the flight guard holds,
        //                              multi-round events reachable, a paid slot
        //                              with no name yet, and the payer on it
        // NOT sw.js. That file's CACHE_VERSION is the CONSUMER key; bumping it
        // would re-download the Consumer shell for changes that are not in it and
        // still leave Tournament devices on the old files.
        cacheName: 'tournament-v36-its-own-manifest',
        // WORKING NAME ONLY. The Tournament product has not been named; this is
        // deliberately plain and trivially changeable, and nothing depends on it.
        appName: 'GolfApp Tournaments',
        shortName: 'Tournaments',
        description: 'Tournament scoring and live leaderboard',
        startUrl: './tournament.html',
        // ITS OWN MARK, AND "any" ONLY - NOT "any maskable".
        //
        // The other product keeps maskable because its icon is a centred mark
        // that survives the crop. This one carries the word TOURNAMENTS in a
        // banner across the bottom, and a maskable crop destroys it. Measured on
        // the 1024 master: the safe circle at the glyph mid-line is 485px wide
        // and the word spans 801px, so 38.8% of the letter pixels fall outside
        // it - T, O, T and S go entirely and a home screen reads "URNAMEN".
        //
        // Declaring "any" does not make the icon worse anywhere. It tells Android
        // to letterbox the artwork inside its mask instead of cropping to it,
        // which is exactly what a word-bearing icon needs. iOS is unaffected
        // either way: its own corner mask clips ZERO pixels of this artwork.
        icons: [
            { src: 'tournament-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'tournament-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        themeColor: '#1d3557',
        backgroundColor: '#f4f6f8',
    },
};

// ---------------------------------------------------------------------------
// GENERATED SERVICE WORKER
//
// The caching STRATEGY is lifted verbatim from the source worker - network-first,
// ignoreSearch on navigations, file-by-file precaching, delete-older-caches on
// activate. Only two things differ per output: the cache key and the precache
// list, and the list is derived from what this build actually copied.
// ---------------------------------------------------------------------------

function serviceWorkerFor(product, shipped) {
    const precache = shipped
        .filter(f => f !== 'sw.js')          // a worker never precaches itself
        .map(f => "    './" + f + "',")
        .join('\n');

    return `// GENERATED BY build-shell.js — DO NOT EDIT THIS FILE.
//
// Edit sw.js at the repo root (the caching strategy) or the product shell
// declarations in sync-mobile-web.js (what is precached), then rebuild.
//
// This is the ${product} deployment's worker. It precaches exactly the files this
// output contains and nothing else - a Consumer worker asking for a Tournament
// page would 404 on install, and a Tournament worker holding Consumer pages would
// ship a product its golfers never open.
//
// The cache key is product-specific so the two deployments cannot evict or serve
// each other's shell, even if they were ever hosted on one origin by accident.
const CACHE_VERSION = '${PRODUCTS[product].cacheName}';

const SHELL_FILES = [
${precache}
];

self.addEventListener('install', (event) => {
    // Cached one file at a time, deliberately: cache.addAll() is atomic, so one
    // bad entry would silently turn off offline support for the whole app.
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => Promise.all(
            SHELL_FILES.map((file) => cache.add(file).catch((err) => {
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
    // Same-origin GETs only - and /api IS NOT THE SHELL. The course proxy
    // (functions/api/) answers from this origin; intercepting it cached every
    // response, a 503 refusal included, because the Cache API ignores the
    // Function's no-store, and served it back offline. The proxy's KV is its
    // cache; this worker leaves /api to the browser's own fetch. Matched on
    // the PATHNAME - a shell URL whose query mentions "/api" is still the
    // shell. Kept identical to sw.js; deployment_build_test.js runs both
    // generated workers through the same driver as the root one.
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin
        || /^\\/api(\\/|$)/.test(url.pathname)) {
        return;
    }
    const isNavigation = request.mode === 'navigate' || request.destination === 'document';

    // WHY THE QUERY STRING IS IGNORED FOR PAGES. Every real link carries one -
    // index.html?game=ABCD&group=1, tournament-scorecard.html?tourney=X&team=2 -
    // and a cache lookup matches the full URL. Each page derives its identity at
    // runtime from window.location.search, so one cached shell serves them all
    // and the address bar still says which round and which group.
    async function fromCacheOrOffline() {
        const exact = await caches.match(request);
        if (exact) return exact;
        if (isNavigation) {
            const shell = await caches.match(request, { ignoreSearch: true });
            if (shell) return shell;
        }
        return new Response(
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Offline</title></head><body style="font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;">'
            + '<h1 style="font-size:3rem;margin:0;">\\u26F3</h1>'
            + '<h2 style="color:#1d3557;">No connection</h2>'
            + '<p style="color:#666;line-height:1.5;">This page has not been opened on this device yet, so there is nothing saved to show. '
            + 'Reconnect and reload.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    // Network-first, so a fresh deploy shows up on the next navigation rather than
    // being trapped behind a stale cache. Cache is the no-connection fallback.
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
`;
}

// ---------------------------------------------------------------------------
// GENERATED MANIFEST
// ---------------------------------------------------------------------------

function manifestFor(product) {
    const p = PRODUCTS[product];
    return JSON.stringify({
        name: p.appName,
        short_name: p.shortName,
        description: p.description,
        start_url: p.startUrl,
        scope: './',
        display: 'standalone',
        background_color: p.backgroundColor,
        theme_color: p.themeColor,
        orientation: 'portrait-primary',
        // READ FROM THE PRODUCT, not written here. One hard-coded list served both
        // manifests, which is why the organizer PWA installed wearing the other
        // product's mark - and why "maskable" was inherited by an icon that cannot
        // survive being cropped to a circle. Each product declares its own above,
        // beside its own name and colours, where the choice is visible.
        icons: p.icons,
    }, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------

function build(product) {
    const spec = PRODUCTS[product];
    if (!spec) throw new Error('unknown product: ' + product);
    const out = path.join(DIST, product);

    // Wiped, not merged. A file left from an earlier run is indistinguishable from
    // one that is supposed to be there, and it hides exactly the failure this
    // script exists to catch - drop a file from a declaration and the stale copy
    // still satisfies the checks below.
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    const copied = [];
    const missing = [];
    spec.files.forEach((file) => {
        if (GENERATED.includes(file)) return;
        const src = path.join(ROOT, file);
        if (!fs.existsSync(src)) { missing.push(file); return; }
        fs.copyFileSync(src, path.join(out, file));
        copied.push(file);
    });

    if (missing.length > 0) {
        console.error('MISSING (declared but not found at the repo root):', missing.join(', '));
        process.exit(1);
    }

    const shipped = copied.concat(GENERATED).sort();
    fs.writeFileSync(path.join(out, 'sw.js'), serviceWorkerFor(product, shipped));
    fs.writeFileSync(path.join(out, 'manifest.json'), manifestFor(product));

    // GATE: a page shipped without a script it loads does not crash - the call
    // sites guard engines with `typeof fn === 'function'` and silently do nothing.
    // The Money Pool is the worst case: the pot computes as zero and disappears
    // from the banner, the receipt and the settlement with no error anywhere.
    const broken = [];
    shipped.filter((f) => f.endsWith('.html')).forEach((page) => {
        const html = fs.readFileSync(path.join(out, page), 'utf8');
        [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)]
            .map((m) => m[1].replace(/^\.\//, ''))
            .filter((r) => r.endsWith('.js') && !r.includes('//') && !r.includes('/') && !r.includes(':'))
            .forEach((script) => {
                if (!fs.existsSync(path.join(out, script))) {
                    broken.push(page + ' loads ' + script + ', which is not in this output');
                }
            });
    });
    if (broken.length > 0) {
        console.error('BUILD IS INCOMPLETE - do not deploy dist/' + product + ':');
        broken.forEach((b) => console.error('  -', b));
        process.exit(1);
    }

    console.log('Built dist/' + product + ': ' + shipped.length + ' files ('
        + copied.length + ' copied, ' + GENERATED.length + ' generated)');
    console.log('  cache: ' + spec.cacheName + '  |  start_url: ' + spec.startUrl);
    return shipped;
}

const requested = process.argv[2];
if (requested && !PRODUCTS[requested]) {
    console.error('unknown product: ' + requested + ' (expected consumer or tournament)');
    process.exit(1);
}
(requested ? [requested] : Object.keys(PRODUCTS)).forEach(build);
console.log('Outputs verified: every shipped page has every script it loads.');
