// ============================================================================
// AN UNMATCHED /api PATH ANSWERS 404 JSON; A WRONG METHOD ANSWERS 405 + Allow.
//
// Cloudflare Pages has no 404.html here, so a GET to an /api path with no
// Function answered with index.html at 200, and a POST to a GET-only route
// answered 405 with no Allow. Measured 2026-09-12 (tools/api-404-check.js,
// red at 39dd65e). functions/api/[[path]].js is the catch-all that fixes both;
// this file drives its handler with fake contexts and holds the bodies to the
// proxy's existing contract - the third shape, { status: 'unavailable',
// reason }, no courses key - through _lib.js's own toResponse.
//
// WHAT THIS FILE CANNOT PROVE: that Pages routes the way the design assumes
// - that the specific routes still win, that a method mismatch falls through
// to [[path]], that /no-such-page keeps the SPA. Those are Cloudflare's code
// and tools/api-404-check.js measures them over HTTP against wrangler pages
// dev. This file proves the handler; that one proves the routing.
//
// THE ROUTE LIST IS THE ONE PIECE THAT IS LITERAL, and here is why: Pages
// derives routes from FILENAMES, and a Worker has no filesystem at run time,
// so the catch-all cannot ask "which routes exist". What it CAN derive is the
// METHODS each route allows - from the route module's own exports - so a
// module that gains onRequestPost updates its Allow header by itself. The
// literal path list is held against the files on disk by the last test here,
// which is what stops it drifting the way build-shell.js's copy did.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { REPO_ROOT } = require('./helpers/load-script.js');

const CATCHALL = path.join(REPO_ROOT, 'functions', 'api', '[[path]].js');
let LIB = null, ROUTE = null, loadError = null;
before(async () => {
    try {
        LIB = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', 'api', '_lib.js')).href);
        ROUTE = await import(pathToFileURL(CATCHALL).href);
    } catch (e) { loadError = e; }
});
const need = () => { if (loadError) assert.fail('could not load the catch-all: ' + loadError.message); };

// A Pages context, the way the runtime hands it over: params.path is the
// array of segments the [[path]] matched.
function ctx(method, apiPath) {
    return {
        request: { method, url: 'https://golf-app-5a5.pages.dev/api/' + apiPath, headers: { get: () => null } },
        // Pages puts only the PATH segments in params.path; the query string is
        // not part of it. The first version of this helper split the query in
        // and reported a real 405 as a 404 - a harness fault, not the code's.
        params: { path: apiPath.split('?')[0].split('/') },
        env: {}
    };
}
async function bodyOf(res) { return JSON.parse(await res.text()); }

// ===========================================================================
describe('toResponse keeps its contract for existing callers, and takes an init', () => {

    test('with no init: 200 for ok, 503 for unavailable, JSON, no-store - unchanged', async () => {
        need();
        const ok = LIB.toResponse({ status: 'ok', courses: [] });
        const no = LIB.toResponse({ status: 'unavailable', reason: 'network' });
        assert.equal(ok.status, 200);
        assert.equal(no.status, 503);
        assert.match(no.headers.get('content-type'), /application\/json/);
        assert.equal(no.headers.get('cache-control'), 'no-store');
    });

    test('with init: the status is overridden and headers are merged, not replaced', async () => {
        need();
        const res = LIB.toResponse({ status: 'unavailable', reason: 'method_not_allowed' },
            { status: 405, headers: { Allow: 'GET' } });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'GET');
        assert.match(res.headers.get('content-type'), /application\/json/, 'the JSON content-type survives a merge');
        assert.equal(res.headers.get('cache-control'), 'no-store', 'no-store survives a merge');
    });
});

// ===========================================================================
describe('the catch-all: 404 JSON for an unmatched /api path, GET and POST', () => {

    ['GET', 'POST', 'PUT', 'DELETE'].forEach((m) => {
        test(`${m} /api/nope -> 404, the contract's third shape, no courses key`, async () => {
            need();
            const res = await ROUTE.onRequest(ctx(m, 'nope'));
            assert.equal(res.status, 404);
            assert.match(res.headers.get('content-type'), /application\/json/);
            assert.equal(res.headers.get('cache-control'), 'no-store');
            const body = await bodyOf(res);
            assert.equal(body.status, 'unavailable');
            assert.equal(body.reason, 'no_such_route');
            assert.ok(!('courses' in body) && !('course' in body), 'a refusal carries no courses key - absent, not empty');
        });
    });

    test('a deeper unmatched path under a real prefix is still 404, not the detail route', async () => {
        need();
        const res = await ROUTE.onRequest(ctx('GET', 'course/abcdefgh/extra'));
        assert.equal(res.status, 404);
        assert.equal((await bodyOf(res)).reason, 'no_such_route');
    });
});

// ===========================================================================
describe('the catch-all: 405 + Allow for a method a real route does not export', () => {

    [['course-search', 'course-search?q=legacy'], ['course/<id>', 'course/abcdefgh']].forEach(([name, p]) => {
        test(`POST /api/${name} -> 405, Allow: GET, reason method_not_allowed`, async () => {
            need();
            const res = await ROUTE.onRequest(ctx('POST', p));
            assert.equal(res.status, 405, `POST to the GET-only ${name} route`);
            assert.equal(res.headers.get('allow'), 'GET');
            assert.match(res.headers.get('content-type'), /application\/json/);
            const body = await bodyOf(res);
            assert.equal(body.status, 'unavailable');
            assert.equal(body.reason, 'method_not_allowed');
        });
    });

    test('the Allow header is DERIVED from the route module\'s exports, not typed', async () => {
        need();
        // The table the catch-all uses. Each entry's methods must be exactly
        // the onRequest<Method> exports of the module it names.
        const table = ROUTE.ROUTES;
        assert.ok(Array.isArray(table) && table.length >= 2, 'the catch-all exposes its route table');
        for (const r of table) {
            const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'functions', 'api', r.file)).href);
            const exported = Object.keys(mod).filter((k) => /^onRequest[A-Z][a-z]+$/.test(k))
                .map((k) => k.replace('onRequest', '').toUpperCase()).sort();
            assert.deepEqual(r.methods.slice().sort(), exported,
                `${r.file}: the catch-all thinks it allows ${r.methods}, the module exports ${exported}`);
        }
        const search = table.find((r) => r.file === 'course-search.js');
        assert.deepEqual(search.methods, ['GET']);
    });
});

// ===========================================================================
describe('the literal route list matches the files on disk', () => {

    // Pages routes by filename: functions/api/course-search.js -> /api/course-search,
    // functions/api/course/[id].js -> /api/course/:id. _-prefixed files are not
    // routed and [[path]] is the catch-all itself. Derive the expected routes
    // from the tree and hold the catch-all's table to them, both directions.
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

    test('every routed file is in the table, and every table entry is a routed file', () => {
        need();
        const root = path.join(REPO_ROOT, 'functions', 'api');
        const routed = walk(root).map((f) => path.relative(root, f))
            .filter((f) => f.endsWith('.js') && !path.basename(f).startsWith('_') && !/\[\[/.test(f)).sort();
        assert.ok(routed.length >= 2, 'expected at least the two proxy routes on disk: ' + JSON.stringify(routed));
        const inTable = ROUTE.ROUTES.map((r) => r.file).sort();
        assert.deepEqual(inTable, routed,
            'the catch-all\'s literal route list has drifted from functions/api/ on disk');
    });

    test('each table entry matches its own route path and nothing else', () => {
        need();
        const search = ROUTE.ROUTES.find((r) => r.file === 'course-search.js');
        const detail = ROUTE.ROUTES.find((r) => r.file === 'course/[id].js');
        assert.ok(search.matches(['course-search']));
        assert.ok(!search.matches(['course-search', 'x']));
        assert.ok(detail.matches(['course', 'abcdefgh']));
        assert.ok(!detail.matches(['course']));
        assert.ok(!detail.matches(['course', 'abcdefgh', 'extra']));
        assert.ok(!search.matches(['nope']) && !detail.matches(['nope']));
    });
});
