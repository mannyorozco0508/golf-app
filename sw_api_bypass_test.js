// ============================================================================
// THE SERVICE WORKER MUST NOT CACHE /api, AND functions/ MUST NOT GROW A TEST.
//
// Measured in the /functions recon of 2026-09-11 and not re-measured here:
// sw.js's fetch handler exempts only non-GET and cross-origin requests, so a
// same-origin GET to /api/* is intercepted like a shell file; the network-first
// branch then cache.put()s EVERY response - a 503 {status:"unavailable"} JSON
// included - into the CACHE_VERSION cache. The Cache API does not honour the
// Function's cache-control: no-store, so a golfer who searched while the
// provider was rate-limited can, hours later and offline, be shown that stale
// refusal as if it were current. And with nothing stored, the offline branch
// answers an /api fetch with the inline 503 "No connection" HTML shell, which
// the picker only survives because res.json() throws on HTML.
//
// This file pins the behaviour a proxy call should have: the worker leaves
// /api alone. Not cached online; not served from cache or from the HTML shell
// offline - the fetch rejects and the caller's own catch handles it, which is
// what admin.html:3626-3628 already does.
//
// THE HARNESS is helpers/sw-harness.js - a vm sandbox with a fake caches, a
// fake fetch and a captured fetch listener, the same shape as
// pwa_activation_test.js's. Shared with deployment_build_test.js, which runs
// the same driver against the two GENERATED workers in dist/, so every copy
// of the handler is measured the same way. Its fake fetch returns a 503 JSON
// for /api so the "a refusal gets cached" case is the one being measured.
//
// WHAT THIS FILE CANNOT PROVE. That a real browser's Cache API stores the
// entry. It runs sw.js's own handler against a fake cache, so it proves what
// the handler ASKS the cache to do, not what Chrome does with the request. A
// cold Chrome check with an /api fetch and caches.keys() is the other half,
// and is not written yet.
//
// SECTION (d) is a different guard: node --test discovers tests RECURSIVELY,
// and no repo guard looks under functions/. A functions/api/x_test.js would run
// in npm test from a directory whose files are ES modules shipped to a Worker.
// This asserts nothing there matches a discovery pattern - positively, so an
// empty or missing directory cannot pass by having nothing to check.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const { loadServiceWorker: loadWorker, ORIGIN } = require('./helpers/sw-harness.js');
const SW = path.join(REPO_ROOT, 'sw.js');
const loadServiceWorker = (opts) => loadWorker(SW, opts);
const CACHE_NAME = loadServiceWorker().cacheName;

const API_URL = ORIGIN + '/api/course-search?q=legacy';

// ===========================================================================
describe('a) ONLINE: a same-origin GET to /api is NOT written to the cache', () => {

    test('after the fetch, the CACHE_VERSION cache holds no /api entry and no put was attempted', async () => {
        const sw = loadServiceWorker({ online: true });
        const r = await sw.request({ url: API_URL });
        // Whether the worker passes it through untouched or answers it, the
        // cache must be left alone. Assert on the cache, not on the response.
        const keys = [...sw.cache().keys()];
        assert.ok(!keys.includes(API_URL),
            `/api response was written into ${CACHE_NAME}: ${JSON.stringify(keys)} - a 503 refusal is now `
            + 'a cached document that outlives the condition that caused it');
        assert.ok(!sw.puts.some((u) => /\/api\//.test(u)),
            'cache.put was called with an /api URL: ' + JSON.stringify(sw.puts));
        // What the caller got, for the record: either passthrough (the browser
        // fetches) or the network response itself. Both are fine; a cached one is not.
        assert.ok(!r.handled || (r.response && r.response.status === 503),
            'the caller must see the network answer (503 here) or nothing from the worker');
    });

    test('POSITIVE CONTROL: the same harness DOES record a put for a shell GET', async () => {
        // If this fails, the harness is not seeing cache.put at all, and (a)
        // above passes by blindness rather than by behaviour.
        const sw = loadServiceWorker({ online: true });
        await sw.request({ url: 'index.html', mode: 'navigate', destination: 'document' });
        assert.ok(sw.puts.includes(ORIGIN + '/index.html'), 'a shell navigation must still be cached: ' + JSON.stringify(sw.puts));
    });
});

// ===========================================================================
describe('b) OFFLINE: a same-origin GET to /api gets neither a stored body nor the HTML shell', () => {

    test('with nothing stored: the worker does not answer with the inline "No connection" shell', async () => {
        const sw = loadServiceWorker({ online: false });
        const r = await sw.request({ url: API_URL });
        if (r.handled && r.rejected === null) {
            const res = r.response;
            const body = res && String(res.body || '');
            assert.ok(!(res && res.status === 503 && /No connection|<!DOCTYPE html>/i.test(body)),
                'offline, an /api fetch was answered with the inline HTML shell instead of rejecting - '
                + 'the picker only survives that because res.json() throws on HTML');
            assert.fail('offline, the worker resolved an /api fetch with something: status '
                + (res && res.status) + ' body ' + JSON.stringify(body).slice(0, 80)
                + ' - it must reject (or not intercept) so the caller\'s catch runs');
        }
        // Passthrough (the browser rejects) or the worker's promise rejected. Both correct.
        assert.ok(!r.handled || r.rejected instanceof Error);
    });

    test('with a stale /api refusal stored from earlier: it is NOT served back', async () => {
        const stale = { status: 503, body: '{"status":"unavailable","reason":"daily_limit"}' };
        const sw = loadServiceWorker({ online: false, seed: [[API_URL, stale]] });
        const r = await sw.request({ url: API_URL });
        if (r.handled && r.rejected === null) {
            assert.fail('offline, the worker served a stored /api body back to the picker: '
                + JSON.stringify(r.response && r.response.body).slice(0, 80)
                + ' - a daily_limit from hours ago shown as if current');
        }
        assert.ok(!r.handled || r.rejected instanceof Error);
    });

    test('POSITIVE CONTROL: offline, a shell navigation with a stored copy IS served from cache', async () => {
        const sw = loadServiceWorker({ online: false, seed: [[ORIGIN + '/index.html', { status: 200, body: 'SEED:index' }]] });
        const r = await sw.request({ url: 'index.html?game=ABCD', mode: 'navigate', destination: 'document' });
        assert.ok(r.handled && r.response && r.response.body === 'SEED:index',
            'the offline shell path must still work, or (b) is passing because the worker is broken for everything');
    });
});

// ===========================================================================
describe('c) EXISTING BEHAVIOUR STAYS PINNED', () => {

    test('a shell GET is still cached online (network-first, then stored)', async () => {
        const sw = loadServiceWorker({ online: true });
        await sw.request({ url: 'action-model.js', mode: 'no-cors', destination: 'script' });
        assert.ok(sw.cache().has(ORIGIN + '/action-model.js'), 'shell scripts must still be written to the cache');
    });

    test('a SHELL request whose query contains "/api" is still the shell: intercepted and cached', async () => {
        // The exemption must key on the pathname. A string-contains on the href
        // would let index.html?next=/api/x slip past the worker - and then a
        // golfer arriving on that link offline would get nothing.
        const sw = loadServiceWorker({ online: true });
        const url = ORIGIN + '/index.html?next=%2Fapi%2Fcourse-search&game=ABCD';
        const r = await sw.request({ url, mode: 'navigate', destination: 'document' });
        assert.ok(r.handled, 'a shell navigation must be intercepted even when its query mentions /api');
        assert.ok(sw.puts.includes(url), 'and cached: ' + JSON.stringify(sw.puts));
        // The raw form, too - some links are built unencoded.
        const sw2 = loadServiceWorker({ online: true });
        const raw = ORIGIN + '/index.html?next=/api/course-search';
        const r2 = await sw2.request({ url: raw, mode: 'navigate', destination: 'document' });
        assert.ok(r2.handled && sw2.puts.includes(raw), 'unencoded "/api" in a query must not exempt the shell');
    });

    test('a path that merely starts with "api" - /apis/, /api-docs - is not exempt either', async () => {
        const sw = loadServiceWorker({ online: true });
        for (const p of ['apis/thing.js', 'api-docs.html']) {
            const r = await sw.request({ url: p, mode: 'no-cors', destination: 'script' });
            assert.ok(r.handled, p + ' is not the proxy and must still be handled');
        }
    });

    test('cross-origin GET and same-origin POST pass through - pinned by pwa_activation_test.js:183-192, not repeated here', () => {
        // Referenced rather than duplicated: that file asserts respondWith is
        // never called for https://www.gstatic.com/... and for a POST. This
        // line only makes sure the reference still points at something.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'pwa_activation_test.js'), 'utf8');
        assert.match(src, /Cross-origin requests must not be intercepted/);
        assert.match(src, /Non-GET requests must not be intercepted/);
    });
});

// ===========================================================================
describe('d) functions/ holds no file node --test would discover', () => {

    const DISCOVERY = /(_test|\.test|-test)\.[cm]?js$|^test-.*\.[cm]?js$|^test\.[cm]?js$/;
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

    test('every file under functions/ is a Worker module, none is named like a test', () => {
        const root = path.join(REPO_ROOT, 'functions');
        assert.ok(fs.existsSync(root), 'functions/ is missing - this guard has nothing to guard');
        const files = walk(root).map((f) => path.relative(REPO_ROOT, f));
        // POSITIVE: the three known Worker files are there, so an empty
        // directory cannot satisfy the negative below.
        assert.ok(files.length >= 3, 'expected at least the three proxy files, found ' + JSON.stringify(files));
        assert.ok(files.includes(path.join('functions', 'api', '_lib.js')));
        const named = files.filter((f) => DISCOVERY.test(path.basename(f)) || /\/test\//.test(f));
        assert.deepEqual(named, [],
            'these would be RUN by npm test from inside the Worker directory: ' + JSON.stringify(named));
        files.forEach((f) => assert.match(f, /\.js$/, f + ' is not a .js module'));
    });
});
