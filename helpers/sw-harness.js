// ============================================================================
// RUN A SERVICE WORKER FILE AGAINST A FAKE BROWSER, AND WATCH WHAT IT ASKS FOR.
//
// A vm sandbox with a fake `caches`, a fake `fetch` and a captured fetch
// listener. It runs the worker's OWN handler and records what that handler
// asks the cache to do - which is what a test about caching has to measure.
// It cannot prove what Chrome's real Cache API does with the same request;
// that is a cold Chrome check's job.
//
// Used by sw_api_bypass_test.js against the root sw.js and by
// deployment_build_test.js against the two GENERATED workers in dist/, so one
// driver measures every copy of the handler the same way. Before this file
// existed pwa_activation_test.js and sw_api_bypass_test.js each carried their
// own copy of it; pwa_activation's is older and still its own, deliberately -
// its fake network returns strings and its assertions read them back.
//
//   loadServiceWorker(swPath, { online, seed })
//     swPath   absolute path to the worker file
//     online   true: fetch resolves; false: fetch rejects TypeError
//     seed     [[url, response], ...] pre-stored in the worker's own cache
//   returns { request, stores, puts, cacheName, cache() }
//     request({ url, method, mode, destination }) -> { handled, response, rejected }
//       handled  respondWith was called
//       response what its promise resolved to (undefined if not handled)
//       rejected the error if that promise rejected, else null
//
// The fake network answers any /api/ URL as the Function does on a refusal -
// HTTP 503, JSON, cache-control: no-store - so "a refusal became a document"
// is the case measured, not a happy 200.
// ============================================================================

const fs = require('fs');
const vm = require('vm');

const ORIGIN = 'https://golf-app-5a5.pages.dev';

// REDIRECTS AND A REAL-ENOUGH Response (2026-10-06). WebKit refuses to serve a
// response with redirected === true to a navigation, and Cloudflare Pages
// redirects /index.html to / - so the worker has to launder such a response
// before caching or serving it. None of that could be measured here: the fake
// responses had no `redirected`, no `url`, no blob(), and the sandbox had no
// Response or Request constructor to rebuild one with.
//
// `redirect` maps a requested url to the url the network ends up at. A response
// built for a redirected request carries redirected: true and the FINAL url,
// which is exactly what fetch() hands back.
function networkResponseFor(url, redirect) {
    const isApi = /\/api\//.test(url);
    const body = isApi ? '{"status":"unavailable","reason":"rate_limited"}' : 'NETWORK:' + url;
    const finalUrl = (redirect && redirect[url]) || url;
    return {
        status: isApi ? 503 : 200,
        ok: !isApi,
        body,
        url: finalUrl,
        redirected: finalUrl !== url,
        headers: { get: (k) => (k.toLowerCase() === 'cache-control' ? (isApi ? 'no-store' : 'public') : null) },
        blob() { return Promise.resolve({ __body: body }); },
        clone() { return networkResponseFor(url, redirect); }
    };
}

// The two constructors the worker uses to launder a response. Minimal on
// purpose: a rebuilt Response carries NO redirect history, which is the whole
// property under test, so `redirected` is false by construction here exactly as
// it is in a browser.
function makeResponseClass() {
    return class FakeResponse {
        constructor(body, init) {
            const i = init || {};
            this.status = i.status === undefined ? 200 : i.status;
            this.statusText = i.statusText || '';
            this.ok = this.status >= 200 && this.status < 300;
            this.body = (body && body.__body !== undefined) ? body.__body : body;
            this.headers = i.headers && typeof i.headers.get === 'function'
                ? i.headers
                : { get: (k) => ((i.headers || {})[k] || (i.headers || {})[String(k).toLowerCase()] || null) };
            this.redirected = false;
            this.url = '';
        }
        blob() { return Promise.resolve({ __body: this.body }); }
        clone() { const r = new FakeResponse({ __body: this.body }, { status: this.status, statusText: this.statusText, headers: this.headers }); return r; }
    };
}
function makeRequestClass() {
    return class FakeRequest {
        constructor(input, init) {
            this.url = typeof input === 'string' ? new URL(input, ORIGIN + '/').href : input.url;
            this.method = (init && init.method) || 'GET';
            this.mode = (init && init.mode) || 'cors';
            this.destination = (init && init.destination) || '';
        }
    };
}

function loadServiceWorker(swPath, { online = true, seed = [], redirect = null } = {}) {
    const source = fs.readFileSync(swPath, 'utf8');
    const m = /const CACHE_VERSION = '([^']+)'/.exec(source);
    if (!m) throw new Error(swPath + ' declares no CACHE_VERSION');
    const cacheName = m[1];

    const stores = new Map();
    const listeners = {};
    const puts = [];
    const cacheFor = (name) => ({
        add: (u) => { stores.get(name).set(new URL(u, ORIGIN + '/').href, { status: 200, body: 'CACHED:' + u }); return Promise.resolve(); },
        put: (req, res) => { puts.push(req.url); stores.get(name).set(req.url, res); return Promise.resolve(); }
    });
    stores.set(cacheName, new Map(seed.map(([u, res]) => [u, res])));

    const sandbox = {
        self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: ORIGIN, href: ORIGIN + '/sw.js' } },
        Response: makeResponseClass(),
        Request: makeRequestClass(),
        URL: URL,
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
            }
        },
        console: { warn() {}, info() {} },
        fetch: (req) => (online ? Promise.resolve(networkResponseFor(req.url, redirect)) : Promise.reject(new TypeError('Failed to fetch'))),
        URL, Promise, TypeError
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: swPath });
    if (typeof listeners.fetch !== 'function') throw new Error(swPath + ' registered no fetch listener');

    // Drive one request the way the browser does, then let the fire-and-forget
    // cache.put inside the handler's .then() settle before anything is read.
    const request = async ({ url, method = 'GET', mode = 'cors', destination = '' }) => {
        let handled = false, out;
        const req = { method, url: url.startsWith('http') ? url : ORIGIN + '/' + url, mode, destination };
        listeners.fetch({ request: req, respondWith: (p) => { handled = true; out = p; } });
        const result = { handled, response: undefined, rejected: null };
        if (handled) {
            try { result.response = await out; } catch (e) { result.rejected = e; }
        }
        await new Promise((r) => setImmediate(r));
        return result;
    };
    return { request, stores, puts, cacheName, cache: () => stores.get(cacheName) };
}

module.exports = { loadServiceWorker, ORIGIN };
