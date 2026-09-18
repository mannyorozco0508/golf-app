// ============================================================================
// tournaments.rattlegolf.com `/` MUST NOT BE THE CONSUMER APP.
//
// Same Cloudflare Pages project hosts both products. functions/index.js is
// the Pages mapping for `/`. On Host tournaments.rattlegolf.com it 302s to
// /tournament; on every other host it calls next() so index.html (Live
// Scorecard) is unchanged.
//
// WHAT THIS FILE PROVES. The handler Pages actually invokes (onRequest),
// driven with a Request whose URL is the host under test — that is the
// production signal. A helper-only test would pass a dead export.
//
// WHAT THIS FILE CANNOT PROVE. That Pages routes functions/index.js to `/`.
// That is Cloudflare's code. tools/tournament-host-check.js measures it over
// HTTP against `wrangler pages dev`, the same runtime the deployment compiles.
//
// HARNESS. Fake context.next() returns a sentinel body. If the tournament
// host falls through, the test sees CONSUMER_SENTINEL and fails. If a
// consumer host redirects, Location is set and the sentinel is missing.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { REPO_ROOT } = require('./helpers/load-script.js');

const FN = path.join(REPO_ROOT, 'functions', 'index.js');
const CONSUMER_SENTINEL = 'CONSUMER_LIVE_SCORECARD_SENTINEL';
const TOURNAMENT_SENTINEL = 'TOURNAMENT_LANDING_SENTINEL';

let MOD = null, loadError = null;
before(async () => {
    try {
        MOD = await import(pathToFileURL(FN).href);
    } catch (e) { loadError = e; }
});
const need = () => { if (loadError) assert.fail('could not load functions/index.js: ' + loadError.message); };

function ctx(url, headerHost) {
    let nextCalls = 0;
    const headers = headerHost ? { host: headerHost } : undefined;
    const request = new Request(url, headers ? { headers } : undefined);
    return {
        request,
        nextCalls: () => nextCalls,
        next: async () => {
            nextCalls += 1;
            const p = new URL(request.url).pathname;
            const body = p === '/tournament' || p === '/tournament.html'
                ? TOURNAMENT_SENTINEL : CONSUMER_SENTINEL;
            return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
        }
    };
}

async function hit(url, headerHost) {
    need();
    const c = ctx(url, headerHost);
    const res = await MOD.onRequest(c);
    return {
        status: res.status,
        location: res.headers.get('location'),
        body: await res.text(),
        nextCalls: c.nextCalls()
    };
}

// ===========================================================================
describe('the file Pages will route to / exists and exports onRequest', () => {

    test('POSITIVE: functions/index.js is the Pages mapping for / and exports onRequest', () => {
        assert.ok(fs.existsSync(FN), 'functions/index.js is missing - Pages will keep serving index.html on every host');
        const src = fs.readFileSync(FN, 'utf8');
        assert.match(src, /export async function onRequest/,
            'Pages invokes onRequest; another export name is not the entry point');
        assert.match(src, /tournaments\.rattlegolf\.com/,
            'the custom host this file exists to recognise must be named');
        assert.match(src, /\/tournament/,
            'the destination must be the Tournaments product path');
    });

    test('it is not named like a test, so node --test will not try to run a Worker module', () => {
        assert.equal(path.basename(FN), 'index.js');
        assert.ok(!/(_test|\.test|-test)/.test(path.basename(FN)));
    });
});

// ===========================================================================
describe('Host tournaments.rattlegolf.com: `/` is the Tournaments product', () => {

    test('GET https://tournaments.rattlegolf.com/ 302s to /tournament and does not serve Consumer', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/');
        assert.equal(r.nextCalls, 0,
            'fell through to the static document — that is Live Scorecard on this host');
        assert.equal(r.status, 302);
        assert.ok(r.location, 'no Location header');
        const dest = new URL(r.location);
        assert.equal(dest.pathname, '/tournament');
        assert.equal(dest.hostname, 'tournaments.rattlegolf.com');
        assert.notEqual(r.body, CONSUMER_SENTINEL,
            'the Consumer sentinel is the body next() would have returned');
    });

    test('the Location is /tournament, not /tournament.html and not /', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/');
        assert.equal(new URL(r.location).pathname, '/tournament');
        assert.ok(!/tournament\.html/.test(r.location));
    });

    test('a preview host under that name redirects the same way', async () => {
        const r = await hit('https://pr-123.tournaments.rattlegolf.com/');
        assert.equal(r.status, 302);
        assert.equal(new URL(r.location).pathname, '/tournament');
        assert.equal(r.nextCalls, 0);
    });

    test('Host header against localhost still redirects — the wrangler/curl -H path', async () => {
        const r = await hit('http://127.0.0.1:8788/', 'tournaments.rattlegolf.com');
        assert.equal(r.status, 302, 'Host header was ignored; wrangler curl -H would still show Live Scorecard');
        assert.equal(new URL(r.location).pathname, '/tournament');
        assert.equal(r.nextCalls, 0);
    });

    test('/index.html on that host is treated as the same default document', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/index.html');
        assert.equal(r.status, 302);
        assert.equal(new URL(r.location).pathname, '/tournament');
        assert.equal(r.nextCalls, 0);
    });

    test('/tournament on that host is NOT redirected — no loop, product path stays', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/tournament');
        assert.equal(r.status, 200);
        assert.equal(r.body, TOURNAMENT_SENTINEL);
        assert.equal(r.nextCalls, 1);
        assert.equal(r.location, null);
    });

    test('a query on `/` is preserved on /tournament (a mistyped ?register= still arrives)', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/?register=ABCD');
        assert.equal(r.status, 302);
        const dest = new URL(r.location);
        assert.equal(dest.pathname, '/tournament');
        assert.equal(dest.search, '?register=ABCD');
    });
});

// ===========================================================================
describe('every other host keeps the Consumer root', () => {

    const CONSUMER_ROOTS = [
        'https://golf-app-5a5.pages.dev/',
        'https://rattlegolf.com/',
        'https://www.rattlegolf.com/',
        'http://localhost:8788/',
        'http://127.0.0.1:8788/',
        'https://not-tournaments.rattlegolf.com/',
        'https://tournaments.rattlegolf.com.evil.example/'
    ];

    for (const url of CONSUMER_ROOTS) {
        test(url + ' falls through to the static Consumer document', async () => {
            const r = await hit(url);
            assert.equal(r.status, 200, url + ' redirected: ' + r.location);
            assert.equal(r.body, CONSUMER_SENTINEL, url + ' did not serve the Consumer sentinel');
            assert.equal(r.nextCalls, 1, url + ' did not call next()');
            assert.equal(r.location, null);
        });
    }

    test('pages.dev `/tournament` is untouched (next, not a redirect off Consumer)', async () => {
        const r = await hit('https://golf-app-5a5.pages.dev/tournament');
        assert.equal(r.status, 200);
        assert.equal(r.body, TOURNAMENT_SENTINEL);
        assert.equal(r.nextCalls, 1);
    });

    test('a spoofed Host on a non-root path does not redirect /admin', async () => {
        const r = await hit('https://golf-app-5a5.pages.dev/admin', 'tournaments.rattlegolf.com');
        assert.equal(r.status, 200);
        assert.equal(r.body, CONSUMER_SENTINEL);
        assert.equal(r.nextCalls, 1);
    });
});

// ===========================================================================
describe('isolation: the redirect is what this file does, not a platform default', () => {

    test('onRequest is a function — Pages has something to invoke', async () => {
        need();
        assert.equal(typeof MOD.onRequest, 'function');
    });

    test('status is 302 not 301 — a permanent cache would trap a rollback', async () => {
        const r = await hit('https://tournaments.rattlegolf.com/');
        assert.equal(r.status, 302);
        assert.notEqual(r.status, 301);
        assert.notEqual(r.status, 308);
    });
});
