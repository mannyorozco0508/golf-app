// ============================================================================
// THE COURSE PROXY - ONE BUILDER, USED BY BOTH ROUTES
//
// GolfCourseAPI's free tier is 35 requests a day, and that budget is GLOBAL:
// one key, shared by every golfer using the site. Two things follow, and this
// file is both of them.
//
//   THE KEY IS NEVER IN THE BROWSER. This repo's root is served publicly by
//   Cloudflare Pages - measured, /package.json and /build-shell.js both return
//   200 - so any file in the tree is a downloadable URL. The key lives only in
//   the Pages encrypted environment and only this Worker ever sees it.
//
//   THE QUOTA WAS THE HARDER PROBLEM, AND PRO CHANGED THAT. This was built
//   against the free tier: 35 requests a day, divided by a foursome setting up on
//   a Saturday morning, is not many. The cache, the daily ceiling, the per-IP cap
//   and the minimum query length all exist because of that number.
//
//   The account is now Pro - 10,000 a day - so the pressure those were built
//   under is gone. THEY HAVE NOT BEEN REMOVED, and the reasoning below is kept
//   rather than rewritten, because it explains why the code has the shape it has.
//   What changed is which of them are load-bearing: the ceiling became a runaway
//   detector rather than a ration, the per-IP cap now guards a PAID key, and the
//   cache became an optimisation rather than the difference between working and
//   not. Said plainly: at 10,000 a day you could delete the cache and the app
//   would still work. That was not true at 35.
//
// WHY THIS FILE EXISTS AT ALL, RATHER THAN THE RULE LIVING IN EACH ROUTE.
// CLAUDE.md: two entry points means one builder. A hand-written copy in each
// route is how one gets fixed and the other does not - this project has already
// paid for that with a per-press stake that reached the engine but not the
// pages. The leading underscore is Cloudflare's convention for a file under
// functions/ that is NOT routed: importable by both handlers, unreachable at
// /api/_lib.
//
// ---------------------------------------------------------------------------
// THE THREE SHAPES, AND WHY THEY MUST STAY THREE
// ---------------------------------------------------------------------------
//
//     { status: 'ok',           courses: [...] }   found some
//     { status: 'ok',           courses: [] }      asked, genuinely none
//     { status: 'unavailable',  reason: '...' }    could not ask
//
// EVERY REASON, AND WHAT EACH ONE TELLS YOU. This list is the whole vocabulary;
// a caller can switch on it exhaustively.
//
//   query_too_short   under MIN_QUERY characters. Nothing was asked and nothing
//                     was spent. Reachable with no key and no KV, which makes it
//                     the cheapest proof that ROUTING works.
//   not_configured    a required binding is missing - GOLFCOURSE_KV or
//                     GOLFCOURSE_API_KEY. Check both in the Pages project under
//                     Settings, and remember a binding only reaches deployments
//                     made AFTER it is set, so a redeploy may be what is needed.
//   bad_course_id     detail only: the id is not the 8-character opaque form
//                     the API's own spec declares. Refused for free rather than
//                     spending a request to be told it does not exist.
//   rate_limited      this IP has used its hourly allowance.
//   daily_limit       the 30-of-35 ceiling for today is reached.
//   upstream_error    the API answered with something we cannot use - any
//                     non-200, or a 200 whose body is not the shape we expect.
//                     If this appears immediately on a fresh day, suspect a
//                     WRONG key rather than a missing one; a missing one is
//                     not_configured.
//   network           the request never completed - thrown fetch, or our own
//                     5-second timeout aborting it.
//   no_such_route     HTTP 404, from functions/api/[[path]].js: an /api path
//                     with no Function behind it. Without the catch-all
//                     Pages answered these with index.html at 200 (no
//                     404.html, SPA fallback), which a caller trusting the
//                     status reads as success.
//   method_not_allowed HTTP 405 with an Allow header, same file: a method the
//                     route does not export (a POST to the GET-only search).
//                     A method mismatch on a routed module falls through to
//                     the catch-all - measured - so this is the only place
//                     Allow can be set.
//
// A FAILURE CARRIES NO courses KEY AT ALL - absent, not empty. A caller that
// forgets to check `status` must not be able to read an empty list out of a
// refusal and conclude the course does not exist.
//
// That collapse is the defect this project keeps meeting under new names. The
// picker said "No courses found for X" when the course existed, and then offered
// to add a duplicate under a global_courses key no client can ever delete. An
// online search that runs out of quota and reports "no results" would do the
// same thing again, on worse data.
//
// ---------------------------------------------------------------------------
// WHAT WE DO NOT KNOW ABOUT THE UPSTREAM, AND WHY IT DOES NOT MATTER
// ---------------------------------------------------------------------------
//
// Never observed: what the API returns when the quota is exhausted. Its OpenAPI
// spec declares no 429 and no rate-limit headers, and finding out costs requests
// from the same budget this file protects. Also unknown: when their day resets,
// and whether they count failed requests as we do.
//
// SO NOTHING HERE BRANCHES ON A QUOTA-SPECIFIC SIGNAL. No 429 check, no error
// body parse, no header read. One question is asked: did I get a 200 whose body
// parses as JSON and carries the payload I expect? Everything else is
// unavailable. If the real API answers exhaustion with a 429, a 403, a 200
// holding an error object, or a 418 with a poem in it, the behaviour is
// identical and correct.
//
// The one thing that would still surprise us is the upstream changing its
// SUCCESS shape. tools/golfcourse-contract-check.js is the answer to that: one
// real request, run by hand, never in npm test.
//
// ---------------------------------------------------------------------------
// WHY KV AND NOT THE CACHE API - STILL TRUE, AND NO LONGER THE REASON
// ---------------------------------------------------------------------------
//
// Cloudflare's Cache API is per-data-centre: "the contents of the cache do not
// replicate outside of the originating data center". A 35-a-day budget is
// GLOBAL, so a search cached in Portland did nothing for a golfer whose request
// landed in Dallas, and every data centre took its own miss. That is why this
// uses KV, which is global, and it is still an accurate description of the two
// products.
//
// It is no longer why the code MUST be this way. On Pro the arithmetic that made
// KV mandatory does not bind. KV is kept for latency, for resilience when the
// provider is down - a cached course still resolves - and because changing it
// would buy nothing. The paragraph is left standing because someone will
// otherwise re-derive the Cache API as an obvious simplification and be right
// about today and wrong about the reasoning.
// ============================================================================

// NINE THOUSAND, AND ITS PURPOSE HAS CHANGED.
//
// This was 30 of 35 on the free tier, and it was RATIONING: five in reserve for
// a retry, the detail fetch that follows a search, and the undercount eventual
// consistency permits. Every one of those thirty mattered.
//
// On Pro - 10,000 a day - rationing is over. The ceiling is now a RUNAWAY
// DETECTOR. Nothing this app legitimately does approaches nine thousand lookups
// in a day; a foursome setting up a round costs two. So reaching it does not
// mean "we have been busy", it means SOMETHING IS LOOPING, and the right
// response is to look rather than to wait for tomorrow.
//
// The thousand of headroom is still there for the same undercount reason.
export const DAILY_CEILING = 9000;
export const MIN_QUERY = 3;
// SIXTY AN HOUR, NOT FIVE. Five was tight enough that setting up a four-round
// trip was painful, and it only made sense while the whole day was thirty-five.
// It matters MORE now, not less: this is the only thing protecting a PAID key
// from one bad actor, and sixty is invisible to a person while still stopping a
// script.
export const IP_HOURLY_CAP = 60;

// ONE HOUR FOR SEARCH, A MONTH FOR DETAIL.
//
// Search was SEVEN DAYS because requests were scarce - a week-long cache cost one
// request per query per week instead of one per golfer. On Pro that pressure is
// gone, and a long search cache has a cost of its own: a course added upstream
// stays unfindable until the entry expires. An hour keeps the latency win and
// the protection against a hammering client, and lets a new course show up the
// same morning.
//
// Detail stays a month. Par and stroke index do not change, and re-fetching them
// buys nothing.
export const SEARCH_TTL = 60 * 60;
// AND A ZERO RESULT IS NO LONGER CACHED AT ALL. That was an open decision while
// requests were scarce: a zero IS a success - the API answered, with nothing - so
// caching it was free protection against a repeated typo, at the price of
// serving that emptiness to everyone for a week, indistinguishable from "no such
// course". A golfer who mistyped "Quintero" once made it unfindable until the
// entry expired.
//
// On Pro the trade disappears: re-asking costs a request out of ten thousand, and
// the wrong answer costs a golfer their course. So zeros are not stored. This
// closes the open item HANDOFF.md recorded under Known open items - not by
// solving the spelling problem, which is still its own wave, but by removing the
// part that made a typo persistent.
export const DETAIL_TTL = 30 * 24 * 60 * 60;

const DEFAULT_BASE = 'https://api.golfcourseapi.com';
const UPSTREAM_TIMEOUT_MS = 5000;

// The id shape the API's own spec declares: 8 characters from the lowercase
// alphabet with i, l, o and u removed. Validated here so a malformed id is
// refused for free rather than spending a request to be told no.
const COURSE_ID = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/;

// ---------------------------------------------------------------------------
// KEYS. Normalisation is what makes "Legacy", "legacy " and "LEGACY" one cache
// entry rather than three of thirty-five.
//
// It must not be so eager that unrelated queries collide - serving one course's
// results under another's name would be worse than a cache miss - so it only
// lowercases, collapses runs of whitespace and trims. "pine" and "pines" stay
// different.
// ---------------------------------------------------------------------------
export function normaliseQuery(q) {
    return String(q === null || q === undefined ? '' : q)
        .toLowerCase().replace(/\s+/g, ' ').trim();
}
export function searchCacheKey(q) { return 'search:' + normaliseQuery(q); }
export function detailCacheKey(id) { return 'detail:' + String(id).toLowerCase(); }

// UTC, because that is when KV's own daily limits reset. The upstream's reset
// hour is unknown; if it differs there is a window each day where the two
// disagree, which is not worth solving until it bites.
export function counterKey(d) { return 'quota:' + d.toISOString().slice(0, 10); }
export function rateKey(ip, d) { return 'rate:' + ip + ':' + d.toISOString().slice(0, 13); }

const unavailable = (reason) => ({ status: 'unavailable', reason });

// ---------------------------------------------------------------------------
// THE COUNTER IS INCREMENTED BEFORE THE UPSTREAM CALL, NEVER AFTER.
//
// A request that dies in flight was still made, and upstream may well have
// counted it. Incrementing afterwards means every failure is spent there and
// free here, and the ceiling drifts high exactly when things are going wrong.
//
// KV IS EVENTUALLY CONSISTENT, so two requests arriving together can both read
// the same count and both write count+1 - an undercount. That is why the
// ceiling is 9,000 of 10,000 rather than 10,000 of 10,000 - it was 30 of 35
// when this was written against the free tier. Exact counting needs Durable
// Objects, which is a paid product and more machinery than this earns.
// ---------------------------------------------------------------------------
async function bump(kv, key, ttl) {
    const n = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(n), ttl ? { expirationTtl: ttl } : undefined);
    return n;
}
const readCount = async (kv, key) => parseInt((await kv.get(key)) || '0', 10);

// A MISCONFIGURED DEPLOY MUST PRODUCE A REASON, NEVER A CRASH.
//
// Both of these were real, and both were found by checking the live site rather
// than trusting the code:
//
//   NO KV BINDING. context.env.GOLFCOURSE_KV came back undefined, kv.get threw
//   TypeError: Cannot read properties of undefined (reading 'get'), and
//   Cloudflare turned that into "error code: 1101" at HTTP 500 - which is not
//   one of the three shapes and not something a caller can interpret.
//
//   NO API KEY. Worse in one way: it did NOT crash. It sent
//   "Bearer undefined" upstream, SPENT A REQUEST from the daily budget to
//   collect a guaranteed 401, and reported upstream_error - pointing whoever
//   read it at the API rather than at their own dashboard. Repeat that and the
//   day's ceiling is burned on requests that could never have succeeded.
//
// So the guard sits AFTER the short-query check - so ?q=ab still answers
// query_too_short with nothing configured, which is the cheapest live proof
// that routing works - and BEFORE the cache, the counter and the call.
//
// ONE REASON FOR BOTH, deliberately. The caller only needs "could not ask"; the
// two bindings are named in the reason table above for whoever is fixing it.
function isConfigured(w) { return !!(w.kv && w.key); }

// Resolves the injectable pieces. The routes pass nothing but `env`; the tests
// pass a fake KV, a scripted fetch and a frozen clock. Production code has no
// idea it is being tested - there is no test-only parameter here.
//
// EVERY env READ IS OPTIONAL-CHAINED. context.env itself is always present in a
// real Pages deployment, but a route that throws on a malformed context is a
// route that returns 1101 instead of a reason, which is the whole defect this
// block exists to prevent.
function wire(d) {
    return {
        kv: d.kv || (d.env && d.env.GOLFCOURSE_KV),
        now: d.clock && d.clock.date ? d.clock.date() : new Date(),
        doFetch: d.fetch || globalThis.fetch,
        base: (d.env && d.env.GOLFCOURSE_API_BASE) || DEFAULT_BASE,
        key: d.env && d.env.GOLFCOURSE_API_KEY
    };
}

// The gate every upstream call passes: per-IP first, then the daily ceiling,
// then the increment. A request refused by either must spend nothing.
async function admit(kv, ip, now) {
    if (ip) {
        const rk = rateKey(ip, now);
        if (await readCount(kv, rk) >= IP_HOURLY_CAP) return unavailable('rate_limited');
        await bump(kv, rk, 60 * 60);
    }
    const ck = counterKey(now);
    if (await readCount(kv, ck) >= DAILY_CEILING) return unavailable('daily_limit');
    await bump(kv, ck, 2 * 24 * 60 * 60);
    return null;
}

// One place where an upstream response becomes either a payload or a reason.
// `pick` pulls the expected field out and returns undefined if it is not the
// shape we require - which is what makes an unrecognised body `unavailable`
// rather than silently empty.
async function ask(doFetch, url, key, pick) {
    let res;
    try {
        res = await doFetch(url, {
            headers: { Authorization: 'Bearer ' + key },
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
        });
    } catch (e) {
        // A thrown fetch and an AbortError - which is what our own timeout looks
        // like - are the same thing to a golfer: we could not ask.
        return { error: 'network' };
    }
    if (!res || !res.ok) return { error: 'upstream_error' };
    let body;
    try { body = await res.json(); } catch (e) { return { error: 'upstream_error' }; }
    const value = pick(body);
    if (value === undefined) return { error: 'upstream_error' };
    return { value };
}

// ---------------------------------------------------------------------------
export async function handleSearch(d) {
    const { kv, now, doFetch, base, key } = wire(d);
    const q = normaliseQuery(d.q);

    // Refused before anything is read or spent. A short query is not a search
    // that found nothing - we never asked - so it is `unavailable` with a reason
    // rather than a fourth shape.
    if (q.length < MIN_QUERY) return unavailable('query_too_short');

    // Before the cache, the counter and the call - see isConfigured above.
    if (!isConfigured({ kv, key })) return unavailable('not_configured');

    // THE CACHE COMES BEFORE EVERY GATE. A cached answer costs no upstream
    // request, so it must cost no budget and no rate-limit allowance either.
    const cached = await kv.get(searchCacheKey(q));
    if (cached) return { status: 'ok', courses: JSON.parse(cached) };

    const refused = await admit(kv, d.ip, now);
    if (refused) return refused;

    const asked = await ask(doFetch,
        base + '/v1/search?search_query=' + encodeURIComponent(q), key,
        (body) => (body && Array.isArray(body.courses) ? body.courses : undefined));
    if (asked.error) return unavailable(asked.error);

    // THE RESULT SET IS STORED AND RETURNED WHOLE, NEVER PRUNED. The API carries
    // no lat/long, so location.state is the only ranking signal there is, and
    // ranking belongs in the picker - which cannot reorder what it never
    // received. Trimming here would also mean invalidating every cached entry
    // the day ranking arrives.
    //
    // ONLY SUCCESS IS CACHED, AND A ZERO RESULT IS NOT A SUCCESS WORTH KEEPING.
    //
    // Caching a failure would make one bad upstream minute hide a course for the
    // whole TTL. And an EMPTY result is the subtler version of the same thing: a
    // golfer who mistypes a course name once would make that misspelling
    // permanently answer "nothing", indistinguishable from the course not
    // existing, for everyone. On Pro, re-asking costs one request out of ten
    // thousand and the wrong answer costs a golfer their round.
    if (asked.value.length > 0) {
        await kv.put(searchCacheKey(q), JSON.stringify(asked.value), { expirationTtl: SEARCH_TTL });
    }
    return { status: 'ok', courses: asked.value };
}

// ---------------------------------------------------------------------------
export async function handleDetail(d) {
    const { kv, now, doFetch, base, key } = wire(d);
    const id = String(d.id || '').toLowerCase();

    // Same reasoning as the short query: a malformed id is refused for free
    // rather than spending one of thirty-five to be told it does not exist.
    if (!COURSE_ID.test(id)) return unavailable('bad_course_id');
    if (!isConfigured({ kv, key })) return unavailable('not_configured');

    const cached = await kv.get(detailCacheKey(id));
    if (cached) return { status: 'ok', course: JSON.parse(cached) };

    const refused = await admit(kv, d.ip, now);
    if (refused) return refused;

    const asked = await ask(doFetch, base + '/v1/courses/' + encodeURIComponent(id), key,
        (body) => (body && body.course && typeof body.course === 'object'
            ? body.course : undefined));
    if (asked.error) return unavailable(asked.error);

    // The whole course, including every tee set. Tee sets arriving as SEPARATE
    // OBJECTS - each with its own course_rating, slope_rating, yardages and
    // 18-hole array - is the finding that made this API usable for handicap
    // allocation at all. Nothing here reshapes them.
    await kv.put(detailCacheKey(id), JSON.stringify(asked.value), { expirationTtl: DETAIL_TTL });
    return { status: 'ok', course: asked.value };
}

// Both routes answer the same way: 200 for an answer, 503 for "could not ask",
// and never a cacheable response - the Function's own KV is the cache, and a
// browser or edge cache holding a 503 would outlast the condition that caused
// it.
//
// init is OPTIONAL and the two proxy routes pass none. The catch-all passes
// { status: 404 } or { status: 405, headers: { Allow: 'GET' } }; its headers
// are merged over the two fixed ones, never in place of them, so a refusal
// is JSON and no-store whatever its status.
export function toResponse(out, init) {
    return new Response(JSON.stringify(out), {
        status: (init && init.status) || (out.status === 'ok' ? 200 : 503),
        headers: Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }, (init && init.headers) || {})
    });
}

// THE CATCH-ALL'S TWO REFUSALS, built here so the reason table above and the
// code that emits each reason stay in one file - course_api_proxy_test.js
// holds them together.
export function noSuchRoute() {
    return toResponse(unavailable('no_such_route'), { status: 404 });
}
export function methodNotAllowed(allow) {
    return toResponse(unavailable('method_not_allowed'), { status: 405, headers: { Allow: allow.join(', ') } });
}
