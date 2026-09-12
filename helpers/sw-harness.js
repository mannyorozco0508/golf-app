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

function networkResponseFor(url) {
    const isApi = /\/api\//.test(url);
    const body = isApi ? '{"status":"unavailable","reason":"rate_limited"}' : 'NETWORK:' + url;
    return {
        status: isApi ? 503 : 200,
        body,
        headers: { get: (k) => (k.toLowerCase() === 'cache-control' ? (isApi ? 'no-store' : 'public') : null) },
        clone() { return { status: this.status, body: this.body, headers: this.headers }; }
    };
}

function loadServiceWorker(swPath, { online = true, seed = [] } = {}) {
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
        self: { addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: ORIGIN } },
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
        Response: class { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.headers = (init && init.headers) || {}; } },
        fetch: (req) => (online ? Promise.resolve(networkResponseFor(req.url)) : Promise.reject(new TypeError('Failed to fetch'))),
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
