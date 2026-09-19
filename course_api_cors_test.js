// ============================================================================
// THE PROXY ANSWERS CORS FOR THE NATIVE SHELL, AND FOR NOBODY ELSE (2026-09-19).
//
// The iOS app's pages are served from capacitor://localhost (Android: http://
// localhost). A fetch from there to https://golf-app-5a5.pages.dev/api/... is
// cross-origin, and MEASURED on 2026-09-19 the live proxy answered a GET with
// Origin: capacitor://localhost with content-type, cache-control, cf-ray and
// nothing else - no Access-Control-Allow-Origin - so a WKWebView blocks the
// read and native course search fails as "couldn't reach". This is the one
// header that opens it, on the same proxy, for exactly the shell's origins.
//
// THE WEB IS UNTOUCHED. A same-origin request carries no Origin header (a
// same-origin GET fetch does not send one), so it gets exactly the two headers
// it always got and the same body. An origin that is not the shell's gets no
// CORS header at all - the browser refuses the read, as it does today. The
// allowlist is a literal in _lib.js (SHELL_ORIGINS); '*' is never emitted.
//
// Every arm below drives the ROUTE FILE (onRequestGet / onRequest), not the
// helper, with a real Request carrying the Origin - the thing Cloudflare
// invokes. course_api_proxy_test.js is the pattern.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let LIB = null, SEARCH = null, DETAIL = null, CATCHALL = null, loadError = null;
before(async () => {
    try {
        LIB = await import(pathToFileURL(path.join(__dirname, 'functions/api/_lib.js')).href);
        SEARCH = await import(pathToFileURL(path.join(__dirname, 'functions/api/course-search.js')).href);
        DETAIL = await import(pathToFileURL(path.join(__dirname, 'functions/api/course/[id].js')).href);
        CATCHALL = await import(pathToFileURL(path.join(__dirname, 'functions/api/[[path]].js')).href);
    } catch (e) { loadError = e; }
});
const loaded = () => { if (loadError) assert.fail('the functions did not load: ' + loadError.message); };

// A context whose handler answers without any upstream: no KV and no key ->
// not_configured (503), which is a toResponse() answer like any other.
const ctx = (url, origin) => ({
    request: new Request(url, { headers: Object.assign({ 'CF-Connecting-IP': '203.0.113.9' }, origin ? { Origin: origin } : {}) }),
    env: {}, params: {}
});
const headersOf = (res) => { const o = {}; res.headers.forEach((v, k) => { o[k] = v; }); return o; };

describe('THE ALLOWLIST', () => {
    test('SHELL_ORIGINS names the Capacitor origins and nothing on the public web', () => {
        loaded();
        assert.deepEqual(LIB.SHELL_ORIGINS, ['capacitor://localhost', 'http://localhost', 'https://localhost']);
        assert.equal(typeof LIB.corsHeadersFor, 'function');
    });
    test('corsHeadersFor: the shell origin is echoed with Vary; no origin and a stranger get nothing', () => {
        loaded();
        const h = (origin) => LIB.corsHeadersFor(new Request('https://site.test/api/x', { headers: origin ? { Origin: origin } : {} }));
        assert.deepEqual(h('capacitor://localhost'), { 'access-control-allow-origin': 'capacitor://localhost', 'vary': 'Origin' });
        assert.deepEqual(h('http://localhost'), { 'access-control-allow-origin': 'http://localhost', 'vary': 'Origin' });
        assert.deepEqual(h(null), {});
        assert.deepEqual(h('https://evil.test'), {});
        assert.deepEqual(h('https://golf-app-5a5.pages.dev'), {}, 'the web origin is same-origin to the proxy and never needs it');
        assert.deepEqual(h('capacitor://localhost.evil.test'), {}, 'exact match, not a prefix');
        assert.deepEqual(h('*'), {});
    });
});

describe('THE THREE ROUTES, THROUGH CLOUDFLARE\'S ENTRY POINTS', () => {
    for (const [name, run] of [
        ['course-search', (origin) => SEARCH.onRequestGet(ctx('https://site.test/api/course-search?q=streamsong', origin))],
        ['course/[id]', (origin) => DETAIL.onRequestGet(Object.assign(ctx('https://site.test/api/course/1', origin), { params: { id: '1' } }))],
        ['the catch-all (404)', (origin) => CATCHALL.onRequest(Object.assign(ctx('https://site.test/api/nothing', origin), { params: { path: ['nothing'] } }))]
    ]) {
        test(`${name}: SAME-ORIGIN (no Origin header) - exactly the two headers it always had, same body`, async () => {
            loaded();
            const res = await run(null);
            const h = headersOf(res);
            assert.deepEqual(Object.keys(h).sort(), ['cache-control', 'content-type'], 'the web request must be byte-identical: ' + JSON.stringify(h));
            assert.equal(h['content-type'], 'application/json; charset=utf-8');
            assert.equal(h['cache-control'], 'no-store');
            const body = await res.json();
            assert.ok(body && typeof body.status === 'string');
        });
        test(`${name}: the SHELL origin gets Access-Control-Allow-Origin echoed and Vary: Origin - and the same body`, async () => {
            loaded();
            const same = await (await run(null)).json();
            const res = await run('capacitor://localhost');
            const h = headersOf(res);
            assert.equal(h['access-control-allow-origin'], 'capacitor://localhost');
            assert.equal(h['vary'], 'Origin');
            assert.equal(h['content-type'], 'application/json; charset=utf-8');
            assert.equal(h['cache-control'], 'no-store');
            assert.deepEqual(await res.json(), same, 'CORS changes headers, never the answer');
        });
        test(`${name}: an UNKNOWN origin gets no CORS header (the browser refuses the read, as today)`, async () => {
            loaded();
            const h = headersOf(await run('https://evil.test'));
            assert.equal(h['access-control-allow-origin'], undefined);
            assert.equal(h['vary'], undefined);
        });
    }
    test('never a wildcard, anywhere in the functions', () => {
        loaded();
        const fs = require('fs');
        ['functions/api/_lib.js', 'functions/api/course-search.js', 'functions/api/course/[id].js', 'functions/api/[[path]].js'].forEach((f) => {
            assert.doesNotMatch(fs.readFileSync(path.join(__dirname, f), 'utf8'), /allow-origin['"]?\s*[:=]\s*['"]\*/i, f + ' emits *');
        });
    });
});
