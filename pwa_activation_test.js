// ============================================================================
// PWA ACTIVATION LAYER
//
// Covers the service worker's runtime behaviour and the registration helper.
// Everything here runs the REAL sw.js and the REAL pwa-boot.js inside a VM
// against mock browser APIs, rather than reading the source and asserting on
// strings. String assertions would pass on code that does not work.
//
// The mock Cache is spec-faithful in the one way that matters: a cache lookup
// matches the FULL request url, query string included, unless {ignoreSearch}
// is passed. That single detail is what this file exists to protect. Every
// link this app hands out carries ?game=CODE, so a cache that only matches
// bare filenames can serve none of them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const ORIGIN = 'https://golf-app-5a5.pages.dev';
// Read from sw.js rather than hardcoded. Pinning the literal here meant every
// legitimate cache bump broke four unrelated tests, which trains people to
// treat these failures as noise. The version is asserted explicitly in its own
// test below; everywhere else it is simply looked up.
const CACHE_NAME = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8').match(/const CACHE_VERSION = '([^']+)'/)[1];

// Same reasoning for the shell size: derived from the actual SHELL_FILES array,
// so adding a file to the shell does not require editing a magic number here.
const SHELL_COUNT = (function () {
    const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    const body = sw.slice(sw.indexOf('const SHELL_FILES'));
    const arr = body.slice(body.indexOf('['), body.indexOf('];')).replace(/\/\/[^\n]*/g, '');
    return [...arr.matchAll(/'\.\/([^']+)'/g)].length;
})();

// ---------------------------------------------------------------------------
// Service worker harness
// ---------------------------------------------------------------------------

function loadServiceWorker({ online = true, seedCaches = {}, failUrls = [], redirect = null } = {}) {
    // MUTABLE, so a test can do what a phone does: install WITH signal, then
    // lose it. The old harness's cache.add() wrote to the store without
    // fetching, so an "offline" install still filled the cache - which a real
    // browser never does, since cache.add() fetches. The install now fetches
    // (it has to launder redirects), so that artifact became a visible failure
    // and the honest sequence is install online, then go offline.
    let isOnline = online;
    const stores = new Map();
    Object.keys(seedCaches).forEach((name) => {
        stores.set(name, new Map(seedCaches[name].map((u) => [new URL(u, ORIGIN + '/').href, 'SEED:' + u])));
    });
    const listeners = {};
    const warnings = [];

    const cacheFor = (name) => ({
        add: (u) => {
            if (failUrls.includes(u)) return Promise.reject(new Error('404 ' + u));
            stores.get(name).set(new URL(u, ORIGIN + '/').href, 'CACHED:' + u);
            return Promise.resolve();
        },
        put: (req, res) => { stores.get(name).set(req.url, res); return Promise.resolve(); },
    });

    // THE INSTALL NO LONGER USES cache.add() (2026-10-06). It fetches each shell
    // file and stores a REBUILT response, because Cloudflare Pages redirects
    // /index.html to / and WebKit refuses to serve a redirected response to a
    // navigation - which is how a Safari reopen offline failed on a phone with
    // "Response served by service worker has redirections". So this harness has
    // to model the three things that rebuild needs: a fetch that returns a
    // response with a body and a redirect flag, and the Response and Request
    // constructors. Without them the install THREW and nothing was cached at
    // all, which showed up here as every offline request falling through to the
    // No connection card.
    // ONE BODY SHAPE: it came off the network, so it says so. The runtime
    // assertions read it to prove network-first; the install only counts keys.
    const bodyFor = (u) => 'NETWORK:' + String(u).replace(ORIGIN + '/', '').replace(/^\.\//, '');
    const netResponse = (u) => {
        const requested = new URL(String(u).replace(/^\.\//, ''), ORIGIN + '/').href;
        const redirectsTo = redirect && redirect[requested];
        return {
            ok: true, status: 200, statusText: 'OK',
            url: redirectsTo || requested,
            redirected: !!redirectsTo,
            headers: { get: () => null },
            // BOTH, because the worker reads blob() when it has to launder a
            // redirect and the runtime assertions read the body directly.
            body: bodyFor(u),
            blob: () => Promise.resolve({ __body: bodyFor(u) }),
            clone() { return netResponse(u); }
        };
    };

    const sandbox = {
        self: {
            addEventListener: (t, f) => { listeners[t] = f; },
            skipWaiting: () => {},
            clients: { claim: () => {} },
            location: { origin: ORIGIN, href: ORIGIN + '/sw.js' },
        },
        caches: {
            open: (n) => { if (!stores.has(n)) stores.set(n, new Map()); return Promise.resolve(cacheFor(n)); },
            keys: () => Promise.resolve([...stores.keys()]),
            delete: (n) => Promise.resolve(stores.delete(n)),
            match: (req, opts) => {
                const url = typeof req === 'string' ? req : req.url;
                for (const [, c] of stores) {
                    if (c.has(url)) return Promise.resolve(c.get(url));
                    if (opts && opts.ignoreSearch) {
                        const bare = url.split('?')[0];
                        for (const [k, v] of c) if (k.split('?')[0] === bare) return Promise.resolve(v);
                    }
                }
                return Promise.resolve(undefined);
            },
        },
        console: { warn: (...a) => warnings.push(a.map(String).join(' ')), info: () => {} },
        // A REBUILT RESPONSE CARRIES NO REDIRECT HISTORY - redirected is false by
        // construction here exactly as it is in a browser, which is the property
        // the worker is laundering for.
        Response: class {
            constructor(body, init) {
                const i = init || {};
                this.body = (body && body.__body !== undefined) ? body.__body : body;
                this.status = i.status === undefined ? 200 : i.status;
                this.statusText = i.statusText || '';
                this.ok = this.status >= 200 && this.status < 300;
                this.headers = i.headers || { get: () => null };
                this.redirected = false;
                this.url = '';
            }
            blob() { return Promise.resolve({ __body: this.body }); }
            clone() { return this; }
        },
        Request: class { constructor(u) { this.url = typeof u === 'string' ? new URL(u, ORIGIN + '/').href : u.url; this.method = 'GET'; } },
        fetch: (req) => {
            const u = req && req.url ? req.url : req;
            if (!isOnline) return Promise.reject(new TypeError('Failed to fetch'));
            if (failUrls.includes(u) || failUrls.includes(String(u).replace(ORIGIN + '/', './'))) {
                return Promise.resolve({ ok: false, status: 404, url: u, redirected: false,
                    headers: { get: () => null }, blob: () => Promise.resolve({ __body: '' }),
                    clone() { return this; } });
            }
            // A page request keeps the old 'NETWORK:' shape the runtime
            // assertions read; a shell file gets the fuller response the install
            // needs. Both are the same object type as far as the worker cares.
            return Promise.resolve(netResponse(u));
        },
        URL, Promise, TypeError,
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8'), sandbox);

    const install = async () => { let p; await listeners.install({ waitUntil: (x) => { p = x; } }); await p; };
    const activate = async () => { let p; await listeners.activate({ waitUntil: (x) => { p = x; } }); await p; };
    const request = async (url, kind = 'navigate') => {
        let out;
        const req = {
            method: 'GET',
            url: url.startsWith('http') ? url : ORIGIN + '/' + url,
            mode: kind === 'navigate' ? 'navigate' : 'no-cors',
            destination: kind === 'navigate' ? 'document' : 'script',
        };
        listeners.fetch({ request: req, respondWith: (x) => { out = x; } });
        return out === undefined ? '__PASSTHROUGH__' : await out;
    };

    return { install, activate, request, stores, warnings, listeners,
             goOffline: () => { isOnline = false; }, goOnline: () => { isOnline = true; } };
}

// The real links the app generates. Not invented for the test - these mirror
// the ?game= / ?group= pattern produced by the group-link builder.
const REAL_LINKS = [
    'index.html?game=ABCD&group=1',
    'index.html?game=ABCD&group=2',
    'index.html?game=ABCD',
    'settlement.html?game=ABCD',
    'sidematches.html?game=ABCD&group=3',
    'skins.html?game=ABCD',
    'stats.html?game=ABCD',
    'trip.html?trip=WXYZ',
];

// ---------------------------------------------------------------------------

describe('SERVICE WORKER - offline behaviour against the URLs the app actually uses', () => {

    test('every real parameterised link is served from cache when offline', async () => {
        const sw = loadServiceWorker({ online: true });
        await sw.install();          // with signal, as an install always is
        sw.goOffline();              // then the phone loses it
        for (const link of REAL_LINKS) {
            const res = await sw.request(link, 'navigate');
            assert.notEqual(res, undefined, `${link} resolved to undefined - respondWith(undefined) throws a TypeError and the navigation fails outright.`);
            assert.notEqual(res.status, 503, `${link} fell through to the offline notice instead of the cached shell. The precached shell has no query string, so page requests must be matched with {ignoreSearch:true}.`);
        }
    });

    test('a page request never resolves to undefined, even for something never cached', async () => {
        const sw = loadServiceWorker({ online: true });
        await sw.install();
        sw.goOffline();
        const res = await sw.request('never-existed.html?game=ABCD', 'navigate');
        assert.notEqual(res, undefined, 'Offline navigations must always get a Response.');
        assert.equal(res.status, 503, 'An uncacheable page should get the explicit offline notice, not a blank failure.');
    });

    test('scripts are matched exactly - loosening the match there would gain nothing', async () => {
        const sw = loadServiceWorker({ online: true });
        await sw.install();
        sw.goOffline();
        for (const js of ['pool-engine.js', 'match-engine.js', 'money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js', 'hole-events.js', 'live-skins.js', 'score-marks.js']) {
            const res = await sw.request(js, 'script');
            assert.ok(res && res !== '__PASSTHROUGH__' && res.status !== 503, `${js} was not served from cache offline.`);
        }
    });

    test('IDENTITY: all groups share one cached shell, and that is safe because identity is read from the live URL', async () => {
        // The cached bytes are identical for group=1 and group=2 - there is only
        // one index.html. What keeps them apart is that every page reads
        // window.location.search at runtime, which is the address the browser
        // actually navigated to, not the key the response was stored under.
        // If a page ever stopped doing that, sharing the shell WOULD collapse
        // identity, so the source check below is part of the contract.
        // ONLINE INSTALL, THEN NO SIGNAL - what a phone does. (An install
        // fetches, so an "offline install" caches nothing in a browser.)
        const sw = loadServiceWorker({ online: true });
        await sw.install();
        sw.goOffline();
        const g1 = await sw.request('index.html?game=ABCD&group=1', 'navigate');
        const g2 = await sw.request('index.html?game=ABCD&group=2', 'navigate');
        assert.equal(g1, g2, 'Both groups should be served the same cached shell.');

        const pages = ['index.html', 'admin.html', 'leaderboard.html', 'settlement.html', 'sidematches.html', 'skins.html', 'stats.html', 'trip.html', 'tournament.html', 'tournament-scorecard.html'];
        pages.forEach((p) => {
            const src = fs.readFileSync(path.join(REPO, p), 'utf8');
            assert.match(src, /new URLSearchParams\(\s*window\.location\.search\s*\)/, `${p} no longer derives its identity from window.location.search. Serving a shared cached shell is only safe while it does.`);
        });
    });

    test('online, the network is preferred so a deploy is never trapped behind the cache', async () => {
        const sw = loadServiceWorker({ online: true });
        await sw.install();
        const res = await sw.request('index.html?game=ABCD&group=1', 'navigate');
        // The handler returns the network Response itself, not a cached string.
        assert.ok(res && typeof res.clone === 'function', 'Handler should return the live network response while online, not a cached copy.');
        // RE-POINTED 2026-10-06: the harness's fetch used to return a bare
        // object whose clone() was the STRING 'NETWORK:<url>'. The install now
        // has to read a body and rebuild a Response (to launder redirects), so
        // the fake fetch returns something Response-shaped and the body is
        // where the marker lives. The claim is unchanged: online, the handler
        // serves what the network gave it.
        assert.match(String(res.body), /^NETWORK:/, 'Handler should be network-first while online.');
    });

    test('Firebase and other cross-origin traffic passes straight through, untouched', async () => {
        const sw = loadServiceWorker({ online: false });
        await sw.install();
        let out;
        sw.listeners.fetch({ request: { method: 'GET', url: 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js', mode: 'no-cors', destination: 'script' }, respondWith: (x) => { out = x; } });
        assert.equal(out, undefined, 'Cross-origin requests must not be intercepted.');
        let out2;
        sw.listeners.fetch({ request: { method: 'POST', url: ORIGIN + '/index.html', mode: 'navigate', destination: 'document' }, respondWith: (x) => { out2 = x; } });
        assert.equal(out2, undefined, 'Non-GET requests must not be intercepted.');
    });
});

describe('SERVICE WORKER - install and update behaviour', () => {

    test('a fresh install caches the whole shell', async () => {
        // ONLINE, because an install fetches. The old harness's cache.add()
        // wrote to the store without a network call, so this passed with
        // online:false - which no browser does.
        const sw = loadServiceWorker({ online: true });
        await sw.install();
        assert.equal(sw.stores.get(CACHE_NAME).size, SHELL_COUNT, `All ${SHELL_COUNT} shell files should be cached.`);
    });

    test('one failing file costs that file only, and is logged rather than swallowed', async () => {
        const sw = loadServiceWorker({ online: true, failUrls: ['./icon-512.png'] });
        await sw.install();
        assert.equal(sw.stores.get(CACHE_NAME).size, SHELL_COUNT - 1, 'A single failure must not abort the whole install.');
        assert.equal(sw.warnings.length, 1, 'The failure should be logged.');
    });

    test('UPDATE: activating a new version deletes every older cache', async () => {
        const sw = loadServiceWorker({ online: false, seedCaches: { 'golfapp-v3-score-marks': ['./index.html'], 'golfapp-v2-old': ['./index.html'] } });
        await sw.install();
        assert.equal(sw.stores.size, 3, 'Old caches should still be present before activate.');
        await sw.activate();
        assert.deepEqual([...sw.stores.keys()], [CACHE_NAME], 'Activate must leave only the current cache.');
    });

    test('the cache version is a bumped golfapp key, and moves whenever the shell changes', () => {
        // The point of this assertion is not any one literal - it is that the
        // key is versioned at all, so activate() can delete what came before.
        // It is pinned to the shape, plus the current value, so a bump is a
        // deliberate one-line edit here rather than four mystery failures.
        assert.match(CACHE_NAME, /^golfapp-v\d+/, 'The cache key must carry a version number.');
        assert.equal(CACHE_NAME, 'golfapp-v318-gps-polish', 'Cache key changed - if that was deliberate, update this line; every installed device drops its old cache on activate.');
    });
});

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

function loadBoot({ hasSW = true, protocol = 'https:', hostname = 'golf-app-5a5.pages.dev', capacitor = undefined, registerImpl } = {}) {
    const calls = [];
    const warnings = [];
    const navigator = {};
    if (hasSW) {
        navigator.serviceWorker = {
            register: registerImpl || ((script, opts) => { calls.push({ script, opts }); return Promise.resolve({ addEventListener: () => {} }); }),
        };
    }
    const listeners = {};
    const sandbox = {
        window: { location: { protocol, hostname }, addEventListener: (t, f) => { listeners[t] = f; }, Capacitor: capacitor },
        navigator,
        document: { readyState: 'complete' },
        console: { warn: (...a) => warnings.push(a.map(String).join(' ')), info: () => {} },
        module: { exports: {} },
        Promise,
    };
    sandbox.window.navigator = navigator;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(REPO, 'pwa-boot.js'), 'utf8'), sandbox);
    return { calls, warnings, api: sandbox.module.exports };
}

describe('PWA BOOT - registration is centralized, environment-aware, and cannot break the round', () => {

    test('registers on the web build', () => {
        const b = loadBoot();
        assert.equal(b.calls.length, 1, 'Should register exactly once on https web.');
        assert.equal(b.calls[0].script, 'sw.js');
        // Compared field-by-field: the options object is constructed inside the VM
        // context, so its prototype is not the host realm's Object and a structural
        // deepEqual fails on identity alone.
        assert.equal(b.calls[0].opts.scope, './');
    });

    test('does NOT register inside the Capacitor native shell', () => {
        const native = loadBoot({ capacitor: { isNativePlatform: () => true } });
        assert.equal(native.calls.length, 0, 'The native bundle already serves files from disk; a second caching layer only adds a way to serve stale copies.');
        assert.equal(native.api.isNativeShell(), true);

        const byProtocol = loadBoot({ protocol: 'capacitor:', capacitor: undefined });
        assert.equal(byProtocol.calls.length, 0, 'capacitor: protocol should also be treated as native.');
    });

    test('still registers when Capacitor is present but reports a web platform', () => {
        const b = loadBoot({ capacitor: { isNativePlatform: () => false } });
        assert.equal(b.calls.length, 1, 'Capacitor building for web should behave like the web build.');
    });

    test('does nothing where service workers are unavailable, and does not throw', () => {
        assert.doesNotThrow(() => {
            const b = loadBoot({ hasSW: false });
            assert.equal(b.calls.length, 0);
            assert.equal(b.api.canRegister(), false);
        });
    });

    test('does not register over plain http (localhost excepted)', () => {
        assert.equal(loadBoot({ protocol: 'http:', hostname: 'example.com' }).calls.length, 0);
        assert.equal(loadBoot({ protocol: 'http:', hostname: 'localhost' }).calls.length, 1);
    });

    test('FAILURE SAFETY: a rejected registration is logged and swallowed, never surfaced to the golfer', async () => {
        const b = loadBoot({ registerImpl: () => Promise.reject(new Error('boom')) });
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(b.warnings.length, 1, 'The failure should be logged.');
        assert.match(b.warnings[0], /app continues normally/);
    });

    test('FAILURE SAFETY: a registration that throws synchronously does not propagate', () => {
        let result;
        assert.doesNotThrow(() => {
            const b = loadBoot({ registerImpl: () => { throw new Error('sync boom'); } });
            result = b;
        }, 'A throwing register() must never reach the page and block score entry.');
        assert.match(result.warnings.join(' '), /app continues normally/);
    });

    test('does NOT auto-reload on update - a reload mid-hole would discard in-progress entry', () => {
        const src = fs.readFileSync(path.join(REPO, 'pwa-boot.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
        assert.doesNotMatch(src, /location\.reload/, 'No automatic reload. The fetch handler is network-first, so an online golfer already gets fresh files on the next navigation.');
        assert.doesNotMatch(src, /controllerchange/, 'Listening for controllerchange to force a reload is exactly the pattern being avoided here.');
    });
});
