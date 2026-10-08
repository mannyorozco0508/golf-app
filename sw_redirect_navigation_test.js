// ============================================================================
// SAFARI WILL NOT OPEN A PAGE THE WORKER REDIRECTED (2026-10-06)
//
// MEASURED ON A PHONE, which is the only reason this is known: Manny, Safari,
// the preview URL. Open the round online - fine. Enter scores offline - fine.
// CLOSE THE TAB WHILE STILL OFFLINE AND REOPEN IT:
//
//     "Safari can't open the page. Response served by service worker has
//      redirections."
//
// Chrome serves the same response without a word, which is why every check in
// this repo was green and the defect reached a phone.
//
// WHY IT HAPPENS. Cloudflare Pages redirects /index.html to / - it strips the
// extension - so fetch() follows the redirect and returns a response with
// redirected === true and a different .url. The worker cached that response and
// handed it to respondWith(). The Fetch spec forbids serving such a response to
// a navigation, and WebKit is the engine that enforces it. Offline, the cached
// copy is served for the navigation and Safari refuses the document outright:
// not a blank page, not stale data - no page at all, with the round's scores
// sitting in localStorage behind a door that will not open.
//
// THE FIX IS TO LAUNDER IT. A Response rebuilt from the body, the status and
// the headers is byte-identical and carries no redirect history. The worker
// rebuilds before caching AND before serving, and stores the result under BOTH
// the url that was asked for and the url the network ended at - with the query
// string kept, because every link this app hands out carries ?game= and most
// carry &group=, and a cache holding only one of the two misses on the other.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It runs the REAL worker from sw.js
// against a fake network that redirects, and asserts the property WebKit
// enforces - redirected === false on anything served to or cached for a
// navigation. It is NOT Safari: safaridriver is installed on this machine but
// Remote Automation is not enabled, so no Safari session could be opened. The
// phone is the only Safari in this loop, which is why the reopen steps are in
// the report.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadServiceWorker } = require('./helpers/sw-harness.js');

const SW = path.join(__dirname, 'sw.js');
const ORIGIN = 'https://golf-app-5a5.pages.dev';
// WHAT CLOUDFLARE PAGES DOES: /index.html -> /, query preserved.
const STRIP_HTML = {
    [ORIGIN + '/index.html?game=ABCD&group=1']: ORIGIN + '/?game=ABCD&group=1',
    [ORIGIN + '/index.html?game=ABCD']: ORIGIN + '/?game=ABCD',
    [ORIGIN + '/index.html']: ORIGIN + '/'
};
const nav = (url) => ({ url, method: 'GET', mode: 'navigate', destination: 'document' });

describe('1. ONLINE: the worker never hands a redirect to a navigation', () => {

    test('the served response carries no redirect history', async () => {
        const sw = loadServiceWorker(SW, { online: true, redirect: STRIP_HTML });
        const r = await sw.request(nav(ORIGIN + '/index.html?game=ABCD&group=1'));
        assert.equal(r.handled, true, 'the worker did not answer the navigation at all');
        assert.equal(r.rejected, null, String(r.rejected));
        assert.equal(r.response.redirected, false,
            'this is the exact response Safari refuses to open');
        // AND IT IS THE SAME PAGE: laundering must not change the bytes.
        assert.match(String(r.response.body), /NETWORK:/);
        assert.equal(r.response.status, 200);
    });

    test('and it is cached under BOTH urls, with the query kept', async () => {
        const sw = loadServiceWorker(SW, { online: true, redirect: STRIP_HTML });
        await sw.request(nav(ORIGIN + '/index.html?game=ABCD&group=1'));
        const keys = sw.puts;
        assert.ok(keys.includes(ORIGIN + '/index.html?game=ABCD&group=1'),
            'the url the browser will ask for next time is not cached: ' + JSON.stringify(keys));
        assert.ok(keys.includes(ORIGIN + '/?game=ABCD&group=1'),
            'the url Cloudflare actually serves is not cached: ' + JSON.stringify(keys));
        // THE QUERY IS THE ROUND. A key without ?game= is a cached page that
        // cannot tell which round it is - and &group= is which four golfers.
        keys.filter((k) => /index\.html|\/\?/.test(k)).forEach((k) =>
            assert.match(k, /game=ABCD/, 'a cached page key lost its query: ' + k));
    });

    test('NOTHING REDIRECTED IS EVER PUT IN THE CACHE', async () => {
        const sw = loadServiceWorker(SW, { online: true, redirect: STRIP_HTML });
        await sw.request(nav(ORIGIN + '/index.html?game=ABCD&group=1'));
        const cache = sw.cache();
        [...cache.values()].forEach((res) =>
            assert.notEqual(res.redirected, true,
                'a redirected response is in the cache, so the next offline reopen fails'));
    });

    test('a response that was NOT redirected is cached as it always was', async () => {
        const sw = loadServiceWorker(SW, { online: true });   // no redirects at all
        const r = await sw.request(nav(ORIGIN + '/index.html?game=ABCD'));
        assert.equal(r.response.redirected, false);
        assert.deepEqual(sw.puts, [ORIGIN + '/index.html?game=ABCD'],
            'the straight path must still store exactly one key');
    });
});

describe('2. OFFLINE REOPEN: the round opens at either url', () => {

    // The two shapes a golfer actually reopens. The first is what the browser
    // remembers from the address bar; the second is what Cloudflare serves.
    [['the requested url', '/index.html?game=ABCD&group=1'],
     ['the redirected url', '/?game=ABCD']].forEach(([what, pathAndQuery]) => {
        test('reopening offline at ' + what + ' serves a clean page', async () => {
            // Online once, which is how the page got on the phone at all.
            const warm = loadServiceWorker(SW, { online: true, redirect: STRIP_HTML });
            await warm.request(nav(ORIGIN + '/index.html?game=ABCD&group=1'));
            await warm.request(nav(ORIGIN + '/index.html?game=ABCD'));
            const seed = [...warm.cache().entries()];
            assert.ok(seed.length >= 2, 'nothing was cached to reopen from');

            // Then the tab is closed and reopened with no signal.
            const cold = loadServiceWorker(SW, { online: false, seed });
            const r = await cold.request(nav(ORIGIN + pathAndQuery));
            assert.equal(r.handled, true);
            assert.equal(r.rejected, null, String(r.rejected));
            assert.notEqual(r.response, undefined, 'respondWith resolved to nothing');
            assert.equal(r.response.redirected, false,
                'Safari refuses this: the reopen shows "has redirections" instead of the round');
            assert.notEqual(r.response.status, 503,
                'it fell through to the No connection page instead of the cached round');
        });
    });

    test('AND A LEGACY REDIRECTED ENTRY IS LAUNDERED ON THE WAY OUT', async () => {
        // Phones already carry cache entries written by the old worker. If only
        // the write path were fixed, the FIRST offline reopen after the update
        // would still fail - the one that matters.
        const stale = {
            status: 200, ok: true, body: 'CACHED-OLD', url: ORIGIN + '/?game=ABCD&group=1',
            redirected: true,
            headers: { get: () => null },
            blob: () => Promise.resolve({ __body: 'CACHED-OLD' }),
            clone() { return Object.assign({}, this); }
        };
        const sw = loadServiceWorker(SW, { online: false,
            seed: [[ORIGIN + '/index.html?game=ABCD&group=1', stale]] });
        const r = await sw.request(nav(ORIGIN + '/index.html?game=ABCD&group=1'));
        assert.equal(r.response.redirected, false, 'the stale redirected entry was served as-is');
        assert.match(String(r.response.body), /CACHED-OLD/, 'the page it serves is not the cached one');
    });

    test('a page never opened on this phone still gets the No connection card', async () => {
        const sw = loadServiceWorker(SW, { online: false, seed: [] });
        const r = await sw.request(nav(ORIGIN + '/index.html?game=NEVER'));
        assert.equal(r.response.status, 503);
        assert.match(String(r.response.body), /No connection/);
    });
});

describe('3. AND THE NATIVE APP IS NOT INVOLVED AT ALL', () => {

    test('pwa-boot refuses to register a worker inside the native shell', () => {
        const fs = require('fs');
        const boot = fs.readFileSync(path.join(__dirname, 'pwa-boot.js'), 'utf8');
        // THE ANSWER TO "does this affect the native app": no, and this is why.
        // Capacitor serves the bundle from local files under capacitor://localhost
        // and pwa-boot never registers the worker there, so no response is
        // intercepted, nothing is redirected and nothing is cached by sw.js.
        // The durable queue is localStorage and works identically either way.
        const at = boot.indexOf('function registerServiceWorker');
        assert.notEqual(at, -1, 'the registrar is gone, so this proves nothing');
        const fn = boot.slice(at, boot.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 80, 'the slice collapsed, so this assertion is vacuous');
        // THE NATIVE CHECK IS FIRST, AND THAT ORDER IS THE WHOLE ANSWER.
        // canRegister() alone would say YES inside Capacitor: it accepts
        // https: OR hostname 'localhost', and the native shell serves the
        // bundle from capacitor://localhost - whose hostname IS localhost. The
        // only thing keeping the worker out of the native app is this line
        // running before that one.
        assert.match(fn, /^\s*function registerServiceWorker\(\)\s*\{\s*\n\s*if \(isNativeShell\(\)\) return 'skipped-native';/,
            'the native guard is no longer the first statement, so the worker could register in the app');
        assert.ok(fn.indexOf("return 'skipped-native'") < fn.indexOf('canRegister()'),
            'canRegister() is reached before the native check');
    });
});

// ---------------------------------------------------------------------------
describe('4. ONE MESSAGE ABOUT ONE FACT', () => {

    const fs = require('fs');
    const boot = fs.readFileSync(path.join(__dirname, 'pwa-boot.js'), 'utf8');

    test('the banner says nothing on a page that has the badge', () => {
        // MEASURED ON THE PHONE: both showed at once - this yellow banner
        // ("scores are saved on this phone") and the scorecard's badge
        // ("Saved on this phone - N waiting"). Two sentences about one fact and
        // only one of them carried the number.
        assert.match(boot, /function badgeOwnsTheMessage\(\)/);
        assert.match(boot, /document\.getElementById\('offline-badge'\)/);
        const fn = boot.slice(boot.indexOf('function renderPill'),
                              boot.indexOf('function renderPill') + 400);
        assert.match(fn, /if \(badgeOwnsTheMessage\(\)\) \{/,
            'the banner no longer defers to the badge, so both speak again');
        assert.match(fn, /mine\.style\.display = 'none'/);
    });

    test('and where there is no badge, the banner carries the COUNT', () => {
        assert.match(boot, /function offlineSentence\(\)/);
        assert.match(boot, /' saved on this phone, waiting to send\.'/,
            'the banner has no count, so the number is said nowhere on those pages');
        assert.match(boot, /function waitingCount\(\)/);
        // AND THE OLD SENTENCE SURVIVES WHERE IT IS STILL TRUE: a page with no
        // durable queue (the tournament pages) gets the original warning.
        assert.match(boot, /keep this page open\. Scores sync when the connection returns\./);
    });

    test('the two never contradict: the badge is the only one with a count on the scorecard', () => {
        const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        assert.match(idx, /id="offline-badge"/, 'the scorecard badge is gone, so the banner is now silent for nothing');
        // The badge's own words come from offline-queue.js, one definition.
        const q = fs.readFileSync(path.join(__dirname, 'offline-queue.js'), 'utf8');
        // The glyph is a raw character in the source here, so this reads the
        // sentence as written rather than assuming an escape (CLAUDE.md: a
        // source assertion about user-facing text must not depend on which
        // form the author happened to type).
        assert.match(q, /Saved on this phone \u00b7 ' \+ n \+ ' waiting/,
            'the badge sentence or its count moved; the banner is silent on this page, so it would be said nowhere');
    });
});
