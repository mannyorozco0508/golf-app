#!/usr/bin/env node
// ============================================================================
// AN UNMATCHED /api PATH MUST NOT RETURN THE SPA.
//
// There is no 404.html, so Cloudflare Pages is in SPA-fallback mode and an
// unmatched path answers with index.html at HTTP 200. Measured live in the
// /functions recon of 2026-09-11: /api/nope -> 200 text/html 487230B. For the
// picker that reads as reason 'network' (res.json() throws on HTML - a wrong
// diagnosis, a safe outcome). For anything that POSTs to /api and trusts the
// status - a payment webhook - it reads as a SUCCESSFUL DELIVERY with no
// retry. That is the failure this check exists to make visible.
//
// THIS IS NOT A COLD-ARRIVAL CHECK. Like tools/course-api-proxy-check.js it
// drives HTTP against the real Pages runtime - `wrangler pages dev .` compiles
// the same Worker the deployment does - because routing is Cloudflare's code,
// not ours, and no stub can prove which file answers a URL. No key, no quota:
// the upstream is never reached (a short query is refused before any call).
//
//   node tools/api-404-check.js
//
//   exit 0   unmatched /api paths answer 404 JSON on GET and POST; a POST to a
//            GET-only route answers 405 with Allow; the real routes and the
//            non-api SPA fallback are untouched
//   exit 1   one of those is false - the JSON names which
//   exit 2   could not run: wrangler missing, port busy, never ready.
//            NOTHING PROVEN.
//
// The three POSITIVE CONTROLS are the point: a catch-all that swallowed the
// real routes, or one that broke the SPA fallback for /no-such-page, would
// pass a check that only looked at /api/nope.
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const PAGES_PORT = 8798;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, pathname, body) {
    const res = await fetch('http://localhost:' + PAGES_PORT + pathname, {
        method, redirect: 'manual',
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* left null on purpose */ }
    return {
        status: res.status,
        contentType: res.headers.get('content-type') || '',
        allow: res.headers.get('allow'),
        bytes: text.length, json,
        isHtml: /^\s*<!DOCTYPE html>/i.test(text)
    };
}

(async () => {
    const failures = [];
    const observed = {};
    let pages = null;
    const persistDir = path.join(REPO, '.wrangler-checkstate-' + process.pid);
    const bail = (why, extra) => {
        if (pages) pages.kill();
        try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch (e) {}
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    pages = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--port', String(PAGES_PORT),
        '--kv', 'GOLFCOURSE_KV', '--persist-to', persistDir],
        { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    pages.stdout.on('data', (d) => { log += d; });
    pages.stderr.on('data', (d) => { log += d; });

    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
        await sleep(1000);
        try { await fetch('http://localhost:' + PAGES_PORT + '/api/course-search?q=x'); ready = true; }
        catch (e) { /* not up yet */ }
    }
    if (!ready) bail('wrangler pages dev never became ready on port ' + PAGES_PORT, { log: log.slice(-1200) });

    try {
        // ---- (c) POSITIVE CONTROLS FIRST: the world this check must not change ----
        const search = await call('GET', '/api/course-search?q=ab');
        const detail = await call('GET', '/api/course/not-a-valid-id');
        const spa = await call('GET', '/no-such-page');
        observed.control = {
            search: { status: search.status, reason: search.json && search.json.reason },
            detail: { status: detail.status, reason: detail.json && detail.json.reason },
            nonApiUnmatched: { status: spa.status, contentType: spa.contentType, isHtml: spa.isHtml, bytes: spa.bytes }
        };
        if (!search.json || search.json.reason !== 'query_too_short') {
            failures.push('CONTROL: GET /api/course-search?q=ab did not reach its handler (expected query_too_short): '
                + JSON.stringify(observed.control.search));
        }
        if (!detail.json || detail.json.reason !== 'bad_course_id') {
            failures.push('CONTROL: GET /api/course/<bad> did not reach its handler (expected bad_course_id): '
                + JSON.stringify(observed.control.detail));
        }
        if (!(spa.status === 200 && spa.isHtml)) {
            failures.push('CONTROL: a NON-api unmatched path must still get the SPA (200, HTML) - that is '
                + 'Consumer\'s routing and this wave must not touch it: ' + JSON.stringify(observed.control.nonApiUnmatched));
        }
        const controlsGreen = failures.length === 0;

        // ---- (a) UNMATCHED /api: 404 JSON, GET and POST ----
        const getNope = await call('GET', '/api/nope');
        const postNope = await call('POST', '/api/nope', { hello: 'world' });
        const deepNope = await call('GET', '/api/course/abcdefgh/extra');
        observed.unmatched = {
            'GET /api/nope': { status: getNope.status, contentType: getNope.contentType, isHtml: getNope.isHtml, bytes: getNope.bytes, json: getNope.json },
            'POST /api/nope': { status: postNope.status, contentType: postNope.contentType, isHtml: postNope.isHtml, bytes: postNope.bytes, json: postNope.json },
            'GET /api/course/abcdefgh/extra': { status: deepNope.status, isHtml: deepNope.isHtml }
        };
        [['GET /api/nope', getNope], ['POST /api/nope', postNope], ['GET /api/course/abcdefgh/extra', deepNope]].forEach(([name, r]) => {
            if (r.status !== 404) failures.push(`${name}: expected 404, got ${r.status}${r.isHtml ? ' (the SPA - index.html)' : ''}`);
            if (r.isHtml) failures.push(`${name}: answered with HTML - a caller trusting the status sees success`);
            if (!/application\/json/.test(r.contentType)) failures.push(`${name}: content-type is ${JSON.stringify(r.contentType)}, expected application/json`);
        });

        // ---- (b) POST to a GET-only route: 405 + Allow, not the SPA, not 404 ----
        const postSearch = await call('POST', '/api/course-search?q=legacy', { q: 'legacy' });
        const postDetail = await call('POST', '/api/course/abcdefgh', {});
        observed.methodMismatch = {
            'POST /api/course-search': { status: postSearch.status, allow: postSearch.allow, isHtml: postSearch.isHtml, contentType: postSearch.contentType },
            'POST /api/course/<id>': { status: postDetail.status, allow: postDetail.allow, isHtml: postDetail.isHtml, contentType: postDetail.contentType }
        };
        [['POST /api/course-search', postSearch], ['POST /api/course/<id>', postDetail]].forEach(([name, r]) => {
            if (r.status !== 405) failures.push(`${name}: expected 405, got ${r.status}${r.isHtml ? ' (the SPA)' : r.status === 404 ? ' (a 404 says the route does not exist; it does, for GET)' : ''}`);
            if (!r.allow || !/\bGET\b/.test(r.allow)) failures.push(`${name}: no Allow header naming GET (got ${JSON.stringify(r.allow)})`);
            if (r.isHtml) failures.push(`${name}: answered with HTML`);
        });

        console.log(JSON.stringify({
            verdict: failures.length ? 'FAIL' : 'PASS',
            controlsGreen, failures, observed
        }, null, 2));
    } catch (e) {
        bail('a request threw: ' + (e && e.message), { log: log.slice(-800) });
    }
    pages.kill();
    try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
