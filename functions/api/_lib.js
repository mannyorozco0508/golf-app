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
//   THE QUOTA IS THE HARDER PROBLEM. A cache, a daily ceiling, a per-IP cap and
//   a minimum query length, because 35 a day divided by a foursome setting up on
//   a Saturday morning is not many.
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
// ============================================================================

// Thirty, not thirty-five. Five in reserve for a retry, for the detail fetch
// that follows a search, and for the undercount below.
export const DAILY_CEILING = 30;
export const MIN_QUERY = 3;
export const IP_HOURLY_CAP = 5;

// LONG, NOT SHORT, AND THAT IS DELIBERATE. Scarcity inverts the usual instinct:
// a 7-day search cache costs one request per query per week instead of one per
// golfer. Course par and stroke index do not change, so detail is cached a
// month.
export const SEARCH_TTL = 7 * 24 * 60 * 60;
// AND A ZERO RESULT IS CACHED FOR THAT SAME WEEK, which is a decision waiting
// rather than an oversight. A zero result IS a success - the API answered, with
// nothing - so a misspelled course spends a request to learn nothing and then
// serves that emptiness to everyone for seven days, indistinguishable from "no
// such course". Fixing it is the fuzzy-spelling wave, not a TTL tweak: the
// upstream's own matching is a whole-string substring test and cannot correct a
// typo, so correction has to happen here, before the request. Recorded under
// Known open items in HANDOFF.md.
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
// ceiling is 30 of 35 rather than 35 of 35. Exact counting needs Durable
// Objects, which is a paid product and more machinery than this earns.
// ---------------------------------------------------------------------------
async function bump(kv, key, ttl) {
    const n = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(n), ttl ? { expirationTtl: ttl } : undefined);
    return n;
}
const readCount = async (kv, key) => parseInt((await kv.get(key)) || '0', 10);

// Resolves the injectable pieces. The routes pass nothing but `env`; the tests
// pass a fake KV, a scripted fetch and a frozen clock. Production code has no
// idea it is being tested - there is no test-only parameter here.
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
    // ONLY SUCCESS IS CACHED. Caching a failure would make one bad upstream
    // minute hide a course for seven days.
    await kv.put(searchCacheKey(q), JSON.stringify(asked.value), { expirationTtl: SEARCH_TTL });
    return { status: 'ok', courses: asked.value };
}

// ---------------------------------------------------------------------------
export async function handleDetail(d) {
    const { kv, now, doFetch, base, key } = wire(d);
    const id = String(d.id || '').toLowerCase();

    // Same reasoning as the short query: a malformed id is refused for free
    // rather than spending one of thirty-five to be told it does not exist.
    if (!COURSE_ID.test(id)) return unavailable('bad_course_id');

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
export function toResponse(out) {
    return new Response(JSON.stringify(out), {
        status: out.status === 'ok' ? 200 : 503,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }
    });
}
