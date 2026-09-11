#!/usr/bin/env node
// ============================================================================
// DOES CLOUDFLARE ACTUALLY ROUTE THE FILE, RESOLVE THE KV BINDING, AND HAND THE
// FUNCTION ITS SECRET?
//
// course_api_proxy_test.js drives the handler directly with a fake KV and a
// scripted fetch. It proves the RULE. It cannot prove any of the following,
// because none of them is JavaScript we wrote:
//
//   that Pages turns functions/api/course-search.js into /api/course-search
//   that functions/api/_lib.js is NOT served, being underscore-prefixed
//   that context.env.GOLFCOURSE_KV is a real KV namespace at runtime
//   that an encrypted environment variable arrives as context.env at all
//   that the answer survives JSON over HTTP
//
// CLAUDE.md's standing rule is that a check must reach the thing the way a user
// does. Here the "user" is Cloudflare's runtime, so this runs the real one:
// `wrangler pages dev` compiles the same Worker the deployment does, with a real
// local KV namespace, and every assertion below is made over HTTP.
//
// NO LIVE KEY AND NO QUOTA. The upstream is a stub HTTP server started by this
// file, and GOLFCOURSE_API_BASE points the Function at it. A fake key is bound
// so the "the secret arrives" assertion has something to observe - the stub
// records the Authorization header it was sent.
//
// THIS IS NOT A COLD-ARRIVAL CHECK. Every other tools/*check*.js in this repo
// means "Chrome, cold, touch nothing". There is no page and no browser here; it
// is an HTTP integration check, and it is named in HANDOFF.md as the exception.
//
//   node tools/course-api-proxy-check.js
//
//   exit 0   Pages routes it, KV resolves, the secret arrives, shapes hold
//   exit 1   one of those is false
//   exit 2   could not run - wrangler missing, port busy, server never ready.
//            NOTHING PROVEN.
// ============================================================================

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const REPO = path.join(__dirname, '..');
const UPSTREAM_PORT = 8798;
const PAGES_PORT = 8799;
const FAKE_KEY = 'test-key-not-real-0000';

// The stub upstream. Scripted per path so one run can exercise a success, a
// zero result and a failure without restarting anything.
let upstreamHits = [];
let upstreamMode = 'ok';
const LIVE_SHAPE = {
    courses: [
        { id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
          location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix',
                      state: 'AZ', country: 'United States' },
          tees: { female: 3, male: 5 } }
    ]
};

function startUpstream() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            upstreamHits.push({ url: req.url, auth: req.headers.authorization || '' });
            if (upstreamMode === 'error') { res.writeHead(500); return res.end('{"error":"boom"}'); }
            if (upstreamMode === 'garbage') { res.writeHead(200); return res.end('<html>nope'); }
            if (upstreamMode === 'empty') {
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(JSON.stringify({ courses: [] }));
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(LIVE_SHAPE));
        });
        srv.on('error', reject);
        srv.listen(UPSTREAM_PORT, () => resolve(srv));
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(pathname) {
    const res = await fetch('http://localhost:' + PAGES_PORT + pathname);
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (e) { /* left null on purpose */ }
    return { status: res.status, text, body };
}

(async () => {
    const failures = [];
    const observed = {};
    let upstream = null;
    let pages = null;

    const bail = async (why, extra) => {
        if (pages) pages.kill();
        if (upstream) upstream.close();
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    try { upstream = await startUpstream(); }
    catch (e) { await bail('the stub upstream could not bind port ' + UPSTREAM_PORT + ': ' + e.message); }

    // A FRESH KV DIRECTORY EVERY RUN. wrangler persists local KV to disk between
    // runs, so a cache entry or a counter left by the previous run would make
    // "the cache was cold" or "the ceiling had not been reached" quietly false.
    const persistDir = path.join(REPO, '.wrangler-checkstate-' + process.pid);
    pages = spawn('npx', ['wrangler', 'pages', 'dev', '.',
        '--port', String(PAGES_PORT),
        '--kv', 'GOLFCOURSE_KV',
        '--persist-to', persistDir,
        '--binding', 'GOLFCOURSE_API_KEY=' + FAKE_KEY,
        '--binding', 'GOLFCOURSE_API_BASE=http://localhost:' + UPSTREAM_PORT],
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
    if (!ready) await bail('wrangler pages dev never became ready on port ' + PAGES_PORT,
        { log: log.slice(-1200) });

    try {
        // ---- 1. THE ROUTE EXISTS AND IS THE FUNCTION, NOT A STATIC FILE ----
        upstreamHits = []; upstreamMode = 'ok';
        const hit = await get('/api/course-search?q=legacy');
        observed.route = { status: hit.status, body: hit.body };
        if (!hit.body || hit.body.status !== 'ok') {
            failures.push('GET /api/course-search did not produce a Function response. Got HTTP '
                + hit.status + ' body ' + JSON.stringify(hit.text).slice(0, 200)
                + '. Pages is not routing functions/api/course-search.js to this URL.');
        }
        if ((hit.body && hit.body.courses || []).length !== 1) {
            failures.push('the route did not return the upstream courses');
        }

        // ---- 2. THE SECRET ARRIVES IN env ----
        observed.upstreamAuth = (upstreamHits[0] || {}).auth || '(no upstream call)';
        if (upstreamHits.length === 0) {
            failures.push('the Function never called the upstream, so whether the secret '
                + 'arrived cannot be observed');
        } else if (observed.upstreamAuth !== 'Bearer ' + FAKE_KEY) {
            failures.push('the bound secret did not reach the upstream call. The stub was sent '
                + JSON.stringify(observed.upstreamAuth) + '. If this is empty, context.env is '
                + 'not carrying GOLFCOURSE_API_KEY and the live Function would call the API '
                + 'unauthenticated.');
        }

        // ---- 3. THE KV BINDING IS REAL - proved by a second identical request ----
        const before = upstreamHits.length;
        const again = await get('/api/course-search?q=LEGACY%20%20');
        observed.secondRequest = { status: again.status, upstreamCallsAfter: upstreamHits.length };
        if (upstreamHits.length !== before) {
            failures.push('a second identical search hit the upstream again, so nothing was '
                + 'cached. Either context.env.GOLFCOURSE_KV is not a working namespace at '
                + 'runtime, or the write silently failed - and the 35/day budget has no cache '
                + 'in front of it.');
        }
        if (!again.body || again.body.status !== 'ok' || again.body.courses.length !== 1) {
            failures.push('the cached response did not come back intact: '
                + JSON.stringify(again.body).slice(0, 200));
        }
        // and the normalisation held across the wire, not just in unit tests
        if (upstreamHits.length === before && again.body
            && again.body.courses[0].location.state !== 'AZ') {
            failures.push('location.state did not survive the KV round trip - it is the only '
                + 'ranking signal this API provides');
        }

        // ---- 4. THE UNDERSCORE FILE IS NOT SERVED AND NOT ROUTED ----
        const lib = await get('/api/_lib');
        const libRaw = await get('/functions/api/_lib.js');
        observed.libRoute = { status: lib.status, isFunctionJson: !!(lib.body && lib.body.status) };
        observed.libSourceStatus = libRaw.status;

        // NOT A STATUS CHECK. An earlier version asserted lib.status !== 200 and
        // failed - because Pages answers an unmatched path with index.html at
        // HTTP 200, which is the SPA fallback working correctly, not the module
        // being routed. What must be true is that /api/_lib does not produce a
        // FUNCTION response.
        if (lib.body && lib.body.status) {
            failures.push('/api/_lib produced a Function response - the underscore-prefixed '
                + 'shared module is being routed as an endpoint: ' + JSON.stringify(lib.body));
        }

        // OBSERVATION, NOT A FAILURE, AND THE REASON MATTERS. Under
        // `wrangler pages dev .` the static root IS the repo root, so
        // functions/ sits inside it and is served. Production is configured the
        // same way - measured, /package.json and /build-shell.js both return 200
        // on the live site - so the Function source is very likely readable
        // there too. That is not a new exposure: this repository is public on
        // GitHub and every file in it is already at a URL. What would be a real
        // failure is the KEY being in it, which is asserted below.
        observed.functionSourcePubliclyReadable = libRaw.status === 200
            && /DAILY_CEILING/.test(libRaw.text);
        if (observed.functionSourcePubliclyReadable && libRaw.text.includes(FAKE_KEY)) {
            failures.push('the Function source contains the key. It must only ever come from '
                + 'context.env.');
        }

        // ---- 5. THE THREE SHAPES, OVER REAL HTTP ----
        upstreamMode = 'empty';
        const zero = await get('/api/course-search?q=nothingmatchesthis');
        observed.zeroResult = { status: zero.status, body: zero.body };
        if (!zero.body || zero.body.status !== 'ok' || !Array.isArray(zero.body.courses)
            || zero.body.courses.length !== 0) {
            failures.push('a genuine zero result did not come back as ok with an empty array: '
                + JSON.stringify(zero.body));
        }
        if (zero.status !== 200) failures.push('a zero result returned HTTP ' + zero.status);

        upstreamMode = 'error';
        const err = await get('/api/course-search?q=upstreamisbroken');
        observed.upstreamError = { status: err.status, body: err.body };
        if (!err.body || err.body.status !== 'unavailable') {
            failures.push('an upstream 500 did not come back as unavailable: '
                + JSON.stringify(err.body));
        }
        if (err.body && 'courses' in err.body) {
            failures.push('AN UNAVAILABLE RESPONSE CARRIES A courses KEY OVER THE WIRE. That is '
                + 'the collapse the whole design exists to prevent - a golfer would be told the '
                + 'course does not exist when the truth is we could not ask.');
        }

        upstreamMode = 'garbage';
        const junk = await get('/api/course-search?q=upstreamtalksnonsense');
        observed.upstreamGarbage = { status: junk.status, body: junk.body };
        if (!junk.body || junk.body.status !== 'unavailable') {
            failures.push('a non-JSON upstream body did not come back as unavailable');
        }

        // ---- 6. THE SHORT QUERY IS REFUSED WITHOUT REACHING UPSTREAM ----
        const hitsBeforeShort = upstreamHits.length;
        const short = await get('/api/course-search?q=ab');
        observed.shortQuery = { status: short.status, body: short.body,
                                upstreamCalls: upstreamHits.length - hitsBeforeShort };
        if (upstreamHits.length !== hitsBeforeShort) {
            failures.push('a 2-character query reached the upstream and spent budget');
        }
        if (!short.body || short.body.reason !== 'query_too_short') {
            failures.push('a short query did not report query_too_short');
        }

        // ---- 7. THE DETAIL ROUTE'S DYNAMIC SEGMENT RESOLVES ----
        upstreamMode = 'ok';
        const bad = await get('/api/course/not-a-valid-id');
        observed.detailBadId = { status: bad.status, body: bad.body };
        if (!bad.body || bad.body.reason !== 'bad_course_id') {
            failures.push('/api/course/<id> did not resolve its dynamic segment, or did not '
                + 'validate the id: ' + JSON.stringify(bad.body).slice(0, 200));
        }

        // ---- 7b. A MISCONFIGURED DEPLOY RETURNS A REASON, NOT A 1101 ----
        //
        // THIS IS THE ARM THAT MATTERS MOST, because the defect it guards was
        // found on the LIVE SITE after the Function was already pushed - not by
        // any test. With no KV binding, context.env.GOLFCOURSE_KV was undefined,
        // kv.get threw, and Cloudflare returned "error code: 1101" at HTTP 500.
        // A 1101 is not one of the three shapes and a caller can do nothing with
        // it.
        //
        // It needs its own wrangler instance, because the binding is a
        // start-time flag. That is why this check takes about a minute.
        const unconfPort = PAGES_PORT + 1;
        const unconf = spawn('npx', ['wrangler', 'pages', 'dev', '.',
            '--port', String(unconfPort),
            '--binding', 'GOLFCOURSE_API_BASE=http://localhost:' + UPSTREAM_PORT],
            { cwd: REPO, stdio: ['ignore', 'ignore', 'ignore'] });
        try {
            let up = false;
            for (let i = 0; i < 60 && !up; i++) {
                await sleep(1000);
                try { await fetch('http://localhost:' + unconfPort + '/api/course-search?q=x'); up = true; }
                catch (e) { /* not yet */ }
            }
            if (!up) {
                failures.push('the unconfigured-deploy arm never started, so the 1101 defect is '
                    + 'unguarded at the HTTP level');
            } else {
                const g = async (p) => {
                    const r = await fetch('http://localhost:' + unconfPort + p);
                    const t = await r.text();
                    let b = null; try { b = JSON.parse(t); } catch (e) { /* left null */ }
                    return { status: r.status, text: t, body: b };
                };
                const noKv = await g('/api/course-search?q=streamsong');
                observed.unconfiguredRealQuery = { status: noKv.status, body: noKv.body,
                                                   raw: noKv.body ? undefined : noKv.text.slice(0, 80) };
                if (!noKv.body || noKv.body.status !== 'unavailable'
                    || noKv.body.reason !== 'not_configured') {
                    failures.push('a deploy with no KV binding did not return '
                        + 'unavailable/not_configured over HTTP. Got ' + noKv.status + ' '
                        + JSON.stringify(noKv.body || noKv.text.slice(0, 120))
                        + '. If that is a 1101, the Function is throwing instead of degrading '
                        + 'and a misconfigured deploy is uninterpretable to the app.');
                }
                if (noKv.status === 500) {
                    failures.push('an unconfigured deploy answered HTTP 500. It must answer 503 '
                        + 'with a reason - 500 is Cloudflare reporting an exception.');
                }
                // and the routing proof must still work with NOTHING configured
                const stillRoutes = await g('/api/course-search?q=ab');
                observed.unconfiguredShortQuery = { status: stillRoutes.status, body: stillRoutes.body };
                if (!stillRoutes.body || stillRoutes.body.reason !== 'query_too_short') {
                    failures.push('?q=ab no longer answers query_too_short on an unconfigured '
                        + 'deploy. That is the cheapest live proof that Cloudflare is routing '
                        + 'the file at all, and step one of the dashboard checklist.');
                }
            }
        } finally { unconf.kill(); }

        // ---- 8. THE KEY IS NEVER IN A RESPONSE ----
        // SCANNED OVER THE ACTUAL HTTP BODIES, NOT OVER `observed`. An earlier
        // version stringified `observed` - which deliberately records the
        // Authorization header the stub was sent, for assertion 2 - and then
        // found the key in its own diagnostics and reported a leak. The check
        // was scanning itself.
        const wireBodies = [hit.text, again.text, zero.text, err.text, junk.text,
                            short.text, bad.text].join('\n');
        observed.bytesScannedForKey = wireBodies.length;
        if (wireBodies.includes(FAKE_KEY)) {
            failures.push('THE KEY APPEARS IN A RESPONSE BODY SENT TO THE BROWSER. The entire '
                + 'reason this Function exists is that the repo root is public and the key '
                + 'cannot reach a client.');
        }
    } catch (e) {
        await bail('the check threw mid-run: ' + (e && e.message), { log: log.slice(-800) });
    }

    pages.kill();
    upstream.close();
    try { require('fs').rmSync(persistDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, observed }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
