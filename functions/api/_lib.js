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
//   THE QUOTA IS THE HARDER PROBLEM, AND IT IS STILL THE FREE TIER (corrected
//   2026-10-03). This file spent two weeks saying the account had moved to Pro -
//   10,000 a day - and every number in it was re-tuned on that basis: the
//   ceiling went 30 -> 9,000, the search cache 7 days -> 1 hour, and zero
//   results stopped being cached. THE ACCOUNT WAS NEVER UPGRADED. The plan is
//   "$0 per month / Up to 35 requests per day", and a 9,000 ceiling on a 35-a-day
//   key is not a runaway detector - it is no ceiling at all, because the
//   provider's whole day is gone two hundred and fifty times before ours
//   notices.
//
//   So the cache, the daily ceiling, the per-IP cap and the minimum query length
//   are load-bearing again, exactly as first written: 35 requests a day, divided
//   by a foursome setting up on a Saturday morning, is not many. At 35 a day you
//   cannot delete the cache and still have a working app.
//
//   THE CEILING IS NOW READ FROM THE ENVIRONMENT - GOLFCOURSE_DAILY_LIMIT - so
//   the day the plan does change, it is one edit in the Pages dashboard and no
//   deploy. PRO_DAILY_CEILING below is the number to put in it. That is the
//   whole reason the Pro figure is kept rather than deleted: the mistake this
//   correction is undoing was a number nobody could see from outside the code.
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
//   daily_limit       the day's lookups are gone - OURS OR THEIRS. Either our
//                     own ceiling for today is reached (see DAILY_CEILING and
//                     GOLFCOURSE_DAILY_LIMIT), or the provider answered 429.
//                     ONE reason for both deliberately: to a golfer on the
//                     first tee they mean the same thing and the advice is
//                     identical, and a vocabulary with two sentences saying the
//                     same thing has stopped meaning anything.
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
// SO THERE IS EXACTLY ONE QUOTA-SPECIFIC BRANCH, AND IT IS 429 (2026-10-03).
// No error body parse, no header read, no second guess. A 429 is the
// conventional answer to "you have used your quota", and on a 35-a-day key it
// is a state golfers will actually reach - so it maps onto daily_limit, which
// is the one reason whose sentence already tells somebody what to do instead.
// Everything else still asks the single question: did I get a 200 whose body
// parses as JSON and carries the payload I expect?
//
// THIS IS HONEST RATHER THAN COMPLETE, and the gap is worth naming. If the real
// API answers exhaustion with a 403, or a 200 holding an error object, that is
// upstream_error - "isn't answering right now" - which is wrong advice on a
// spent quota. We have never seen their exhaustion response and finding out
// costs requests from the budget this file protects. The fix, the day it turns
// up in a log, is one line in ask().
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
// GLOBAL, so a search cached in Portland does nothing for a golfer whose request
// lands in Dallas, and every data centre takes its own miss.
//
// That is why this uses KV, which is global, and ON THE FREE TIER IT IS AGAIN
// THE REASON THE CODE MUST BE THIS WAY rather than a nicety. A Pro-era edit of
// this file said the arithmetic no longer binds. It binds: thirty-five, split
// across Cloudflare's data centres, is not a working app. Do not re-derive the
// Cache API as an obvious simplification.
// ============================================================================

// THIRTY-FIVE, WHICH IS THE WHOLE DAY, AND WHY THERE IS NO LONGER A RESERVE.
//
// The free tier is 35 requests a day. This was 30 of 35 when first written -
// five held back for a retry, for the detail fetch that follows a search, and
// for the undercount that KV's eventual consistency permits. The reserve bought
// one thing: it kept us from ever meeting the provider's own refusal, whose
// shape we had never seen and could not report sensibly.
//
// A 429 NOW MAPS ONTO daily_limit, so meeting their refusal and meeting ours
// produce the same answer and the same sentence. The reserve was protecting us
// from an outcome that is now handled, and five of thirty-five is a seventh of
// the day - enough to matter on a Saturday morning. So the ceiling is the whole
// 35, and overshooting it costs a golfer nothing worse than the message they
// were about to get anyway.
//
// A foursome setting up a round costs two requests: one search, one detail. So
// 35 is roughly seventeen new courses a day across every golfer using the site -
// and NOT seventeen rounds, because a course already in global_courses or in the
// KV cache costs nothing. That is the real shape of the limit.
//
// AND IT IS AN ENVIRONMENT READ. GOLFCOURSE_DAILY_LIMIT in the Pages project
// overrides this; PRO_DAILY_CEILING is what to put in it on the $9.99 plan.
// Pinned by course_quota_free_tier_test.js, which also proves the override is
// wired into admit() rather than merely exported.
export const DAILY_CEILING = 35;

// The Pro tier's ceiling: 9,000 of their 10,000, the thousand of headroom being
// the same undercount allowance the old reserve was. Not used by default - it is
// the value GOLFCOURSE_DAILY_LIMIT takes the day the plan changes, kept here so
// nobody has to re-derive it from a pricing page.
export const PRO_DAILY_CEILING = 9000;

// A MALFORMED LIMIT FALLS BACK TO THE FREE TIER, IN BOTH DIRECTIONS.
//
// This is the only place a typo in a dashboard field can reach the budget, and
// it can go wrong two ways that look nothing alike:
//
//   NaN - '', '  ', 'abc', a stray object - would make every `>=` comparison
//   against it false, and the ceiling INFINITE. One bad character and we hand
//   the provider's whole day to the first script that finds us.
//
//   ZERO - a '0' typed to mean "off" - would refuse every search with
//   daily_limit on a fresh morning, indistinguishable from the quota being
//   genuinely gone. Nobody would look at the dashboard, because the app would
//   be saying exactly what it says when it is working correctly.
//
// So only a clean positive integer counts. Anything else is 35, which is the
// value that is both safe and true.
export function dailyCeiling(env) {
    const raw = env && env.GOLFCOURSE_DAILY_LIMIT;
    if (raw === null || raw === undefined) return DAILY_CEILING;
    const text = String(raw).trim();
    if (!/^[0-9]+$/.test(text)) return DAILY_CEILING;
    const n = parseInt(text, 10);
    return n > 0 ? n : DAILY_CEILING;
}
export const MIN_QUERY = 3;
// SIXTY AN HOUR, AND IT IS NOW LARGER THAN THE WHOLE DAY.
//
// Five an hour was the free-tier figure, raised to sixty for Pro because five
// made setting up a four-round trip painful. On 35 a day the per-IP cap can no
// longer be the thing that rations - the daily ceiling gets there first, every
// time - so this is purely an abuse brake: it stops one script from emptying the
// day in a burst, and it is invisible to a person.
//
// LEFT AT SIXTY DELIBERATELY, not lowered back to five. Lowering it would make
// a trip organiser the person it hurts, and it would not save a single request
// that the 35 ceiling does not already save.
export const IP_HOURLY_CAP = 60;

// ONE HOUR FOR SEARCH, A MONTH FOR DETAIL - AND THE HOUR IS NOW A JUDGEMENT CALL
// RATHER THAN A FREE ONE.
//
// Search was SEVEN DAYS when requests were scarce: a week-long cache cost one
// request per query per week instead of one per golfer. It was shortened to an
// hour on the belief that the account was Pro, which was wrong, so the trade is
// back - and it is a real trade now, not an obvious win either way.
//
// LEFT AT AN HOUR, and here is the reasoning rather than a silent revert. The
// week-long cache paid off against the SAME query repeated across days, which is
// not the traffic this app has: a group searches a course once, imports it, and
// from then on it is in global_courses and never searched again. What the hour
// does buy is that a course added upstream shows up the same morning instead of
// next week. If the day's 35 start running out in practice, this is the first
// dial to turn back up - and course_quota_free_tier_test.js is where to record
// it when that happens.
//
// Detail stays a month. Par and stroke index do not change, and re-fetching them
// buys nothing.
export const SEARCH_TTL = 60 * 60;
// AND A ZERO RESULT IS STILL NOT CACHED, WHICH IS THE EXPENSIVE CHOICE.
//
// A zero IS a success - the API answered, with nothing - so caching it would be
// free protection against a repeated typo. The price is serving that emptiness
// to everyone until it expires, indistinguishable from "no such course": a
// golfer who mistyped "Quintero" once made it unfindable for the whole TTL.
//
// That was traded away on the Pro reading, where re-asking cost one request out
// of ten thousand. On 35 a day the arithmetic is genuinely close, and this KEEPS
// the uncached behaviour anyway, for one reason: the failure it prevents is the
// defect this whole file exists to prevent. Telling a golfer a course does not
// exist when it does is what the local picker did, and it ended with an offer to
// add a duplicate under a key no client can delete. A typo costing a second
// request is a worse day for the budget and a better day for the golfer.
//
// HANDOFF.md's Known open items records this as the half-fix it is: the spelling
// problem is still its own wave.
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
// the same count and both write count+1 - an undercount. We therefore drift
// OVER the ceiling, never under it, which is why the reserve used to exist and
// why removing it was only safe once a provider 429 had a sensible answer.
// Exact counting needs Durable Objects, which is a paid product and more
// machinery than this earns.
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
        key: d.env && d.env.GOLFCOURSE_API_KEY,
        // Resolved HERE, with everything else injectable, so both routes get the
        // same number from the same place and a test can set it the way the
        // dashboard does - through env - rather than through a back door.
        ceiling: dailyCeiling(d.env)
    };
}

// The gate every upstream call passes: per-IP first, then the daily ceiling,
// then the increment. A request refused by either must spend nothing.
async function admit(kv, ip, now, ceiling) {
    if (ip) {
        const rk = rateKey(ip, now);
        if (await readCount(kv, rk) >= IP_HOURLY_CAP) return unavailable('rate_limited');
        await bump(kv, rk, 60 * 60);
    }
    const ck = counterKey(now);
    // The ceiling is a PARAMETER, not the constant. Reading DAILY_CEILING here
    // would make GOLFCOURSE_DAILY_LIMIT a variable that exists, is documented,
    // and does nothing - which is the exact shape of the dead wires CLAUDE.md
    // keeps recording.
    if (await readCount(kv, ck) >= ceiling) return unavailable('daily_limit');
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
    if (!res) return { error: 'upstream_error' };
    // THE ONE QUOTA-SPECIFIC BRANCH. 429 is the provider saying the day is
    // spent, which is daily_limit - the reason whose sentence tells a golfer
    // what to do instead. Everything else non-200 stays upstream_error, and a
    // 401 in particular MUST: that is a wrong key, and reporting it as "try
    // again tomorrow" would hide a misconfigured deploy for ever.
    if (res.status === 429) return { error: 'daily_limit' };
    if (!res.ok) return { error: 'upstream_error' };
    let body;
    try { body = await res.json(); } catch (e) { return { error: 'upstream_error' }; }
    const value = pick(body);
    if (value === undefined) return { error: 'upstream_error' };
    return { value };
}

// ---------------------------------------------------------------------------
export async function handleSearch(d) {
    const { kv, now, doFetch, base, key, ceiling } = wire(d);
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

    const refused = await admit(kv, d.ip, now, ceiling);
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
    // existing, for everyone. Re-asking costs one of thirty-five, which is not
    // nothing - and the wrong answer costs a golfer their round.
    if (asked.value.length > 0) {
        await kv.put(searchCacheKey(q), JSON.stringify(asked.value), { expirationTtl: SEARCH_TTL });
    }
    return { status: 'ok', courses: asked.value };
}

// ---------------------------------------------------------------------------
export async function handleDetail(d) {
    const { kv, now, doFetch, base, key, ceiling } = wire(d);
    const id = String(d.id || '').toLowerCase();

    // Same reasoning as the short query: a malformed id is refused for free
    // rather than spending one of thirty-five to be told it does not exist.
    if (!COURSE_ID.test(id)) return unavailable('bad_course_id');
    if (!isConfigured({ kv, key })) return unavailable('not_configured');

    const cached = await kv.get(detailCacheKey(id));
    if (cached) return { status: 'ok', course: JSON.parse(cached) };

    const refused = await admit(kv, d.ip, now, ceiling);
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
// CORS FOR THE NATIVE SHELL, AND FOR NOBODY ELSE (2026-09-19). The iOS app's
// pages live at capacitor://localhost (Android: http://localhost), so a fetch
// from there to this proxy is cross-origin; measured 2026-09-19, the live
// answer carried no Access-Control-Allow-Origin and a WKWebView refused the
// read - native course search could not reach the proxy at all. The echo below
// is for exactly these origins, matched whole. A same-origin web request sends
// no Origin header and gets exactly the headers it always got; any other
// origin gets no CORS header and the browser refuses the read, as it does
// today. Never '*': the budget behind this proxy is the whole reason it exists.
//
// THE CANONICAL WEB ORIGIN JOINS ON 2026-10-04. The shell fetches the proxy BY
// ITS ORIGIN (product-links.js GOLF_WEB_ORIGIN), so a page served from
// pages.dev is same-origin and sends no Origin header at all - but a page opened
// from one Pages URL while the fetch names the other (a preview host, say) is
// not, and the echo costs nothing: it is this project's own site either way.
export const SHELL_ORIGINS = ['capacitor://localhost', 'http://localhost', 'https://localhost',
                              'https://golf-app-5a5.pages.dev'];
export function corsHeadersFor(request) {
    const origin = request && request.headers && typeof request.headers.get === 'function'
        ? request.headers.get('Origin') : null;
    if (!origin || SHELL_ORIGINS.indexOf(origin) === -1) return {};
    return { 'access-control-allow-origin': origin, 'vary': 'Origin' };
}

// ---------------------------------------------------------------------------
// THE PREFLIGHT, which is what actually broke (2026-10-04).
//
// A POST carrying content-type: application/json is NOT a simple request: the
// browser - WKWebView included - sends OPTIONS first and will not send the POST
// at all unless that answer says the method and the header are allowed. Nothing
// here exported onRequestOptions, so the preflight fell through to the catch-all
// and came back 405. The app reported what fetch() reports when a preflight
// fails: "Load failed", with no status and nothing in it to read.
//
// A PREFLIGHT IS ONLY EVER ANSWERED FOR AN ORIGIN THE ECHO ABOVE ALLOWS. For any
// other origin this returns no CORS headers at all and the browser refuses, which
// is the same answer it gave before.
export function preflightHeadersFor(request, methods) {
    const cors = corsHeadersFor(request);
    if (!cors['access-control-allow-origin']) return {};
    const asked = request && request.headers && typeof request.headers.get === 'function'
        ? request.headers.get('Access-Control-Request-Headers') : null;
    return Object.assign({}, cors, {
        'access-control-allow-methods': (methods && methods.length ? methods : ['GET', 'POST']).concat(['OPTIONS']).join(', '),
        // Echo what was asked for rather than guessing a list: the app sends
        // content-type, and a future caller sending one more header should not
        // need this file edited.
        'access-control-allow-headers': asked || 'content-type',
        'access-control-max-age': '600'
    });
}

// 204, because a preflight has no body to read and a JSON one would only invite
// a caller to read it.
export function preflightResponse(request, methods) {
    const headers = preflightHeadersFor(request, methods);
    return new Response(null, { status: 204, headers: headers });
}

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
export function noSuchRoute(request) {
    return toResponse(unavailable('no_such_route'), { status: 404, headers: corsHeadersFor(request) });
}
export function methodNotAllowed(allow, request) {
    return toResponse(unavailable('method_not_allowed'), { status: 405, headers: Object.assign({ Allow: allow.join(', ') }, corsHeadersFor(request)) });
}
