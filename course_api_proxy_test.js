// ============================================================================
// THE PROXY MUST NEVER SAY "NO COURSES" WHEN IT MEANS "I COULD NOT ASK".
//
// GolfCourseAPI's budget is GLOBAL - one key, shared by every golfer using the
// site. A Cloudflare Pages Function stands between the app and the API so the key
// is never in the bundle, but the key was never the hard part. The quota was.
//
// THIS WAS BUILT AGAINST THE FREE TIER, 35 A DAY. The account is now Pro at
// 10,000, and the numbers below moved with it - the ceiling, the per-IP cap, the
// search TTL. The SHAPES did not, and that is the point of this file: the three
// response shapes and the refusal to collapse them were never about quota.
//
// Two things follow, and this file exists to pin both.
//
//   THE CACHE WAS THE POINT, AND IS NOW AN OPTIMISATION. At 35 a day, a search
//   asked twice was a budget gone by lunchtime on a Saturday. At 10,000 the cache
//   buys latency and survives a provider outage, and the app would work without
//   it. Said plainly so nobody defends it on the old grounds.
//
//   THE THREE SHAPES MUST STAY THREE. A search that found nothing and a search
//   that could not be made are DIFFERENT ANSWERS, and collapsing them is the
//   defect this project keeps finding under a different name. The picker said
//   "No courses found for X" when the course existed, and then offered to add a
//   duplicate under a global_courses key no client can ever delete. An online
//   search that runs out of quota and reports "no results" would do the same
//   thing again, on worse data.
//
//       { status: 'ok',          courses: [ ... ] }   found some
//       { status: 'ok',          courses: [] }        asked, genuinely none
//       { status: 'unavailable', reason: ... }        could not ask
//
//   `unavailable` carries NO courses key at all - not an empty one. Absent, so
//   a caller that forgets to check `status` cannot read an empty list out of a
//   failure and believe it.
//
// ---------------------------------------------------------------------------
// WHAT THE STUB CAN AND CANNOT PROVE - READ THIS BEFORE TRUSTING A GREEN RUN
// ---------------------------------------------------------------------------
//
// The success fixtures below are BYTES CAPTURED FROM THE LIVE API during the
// evaluation wave, not invented:
//
//     search "Legacy Golf Club"   1900 bytes    6 courses
//     search "Legacy"             7656 bytes   25 courses
//     search "Streamsong"         1224 bytes    4 courses
//     detail bwcdmzcy            13377 bytes    8 tee sets
//
// FOUR THINGS NO STUB HERE CAN PROVE:
//     what the API returns when the quota is exhausted. Never observed. Their
//       OpenAPI spec declares no 429 and no rate-limit headers, and finding out
//       costs requests from the same budget this file exists to protect.
//     when their day resets. Ours resets at UTC midnight.
//     whether they count failed or redirected requests the way we do.
//     whether their error bodies resemble anything below.
//
// THE DESIGN IS DELIBERATELY INSENSITIVE TO ALL FOUR, and that is what makes
// the ignorance survivable rather than fatal. The Function never branches on a
// quota-specific signal - no 429 check, no error-body parse, no header read. It
// asks one question: did I get a 200 whose body parses as JSON and carries a
// `courses` array? Everything else is `unavailable`. If the real API answers
// exhaustion with a 429, a 403, a 200 holding an error object, or a 418 with a
// poem in it, the behaviour is identical and correct.
//
// The one thing that could still surprise us is the upstream changing its
// SUCCESS shape. tools/golfcourse-contract-check.js is the answer to that: one
// real request, run by hand, never in npm test - because a suite that spends
// quota is a suite you stop running.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// CPX_LIB lets a negative control point this file at a TEMP COPY of the library
// carrying a deliberate defect - the cache torn out, the counter moved after the
// call - so each requirement can be shown to FAIL when the thing it guards is
// broken. Unset in normal use.
const LIB_PATH = process.env.CPX_LIB || 'functions/api/_lib.js';
const SEARCH_FN = process.env.CPX_SEARCH_FN || 'functions/api/course-search.js';

let LIB = null;
let SEARCH_MODULE = null;
let loadError = null;

before(async () => {
    try {
        LIB = await import(pathToFileURL(path.join(__dirname, LIB_PATH)).href);
        SEARCH_MODULE = await import(pathToFileURL(path.join(__dirname, SEARCH_FN)).href);
    } catch (e) {
        loadError = e;
    }
});

// ---------------------------------------------------------------------------
// FIXTURES - real captured responses, trimmed to what the assertions need.
// The full bodies live beside the contract check; these keep the file readable
// while staying the SHAPE the API actually returns, which is the part that
// matters: a top-level `courses` array of objects carrying id, club_name,
// course_name, location and a tees COUNT (search summarises tees as a number
// per grouping - the full tee data needs a second request by id).
// ---------------------------------------------------------------------------
const LIVE_SEARCH_LEGACY = {
    courses: [
        { id: 's21hccyk', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
          location: { address: '397 Golfcourse Rd, Leitchfield, KY 42754, USA',
                      city: 'Leitchfield', state: 'KY', country: 'United States' },
          tees: {} },
        { id: 'bwcdmzcy', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort',
          location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA',
                      city: 'Phoenix', state: 'AZ', country: 'United States' },
          tees: { female: 3, male: 5 } },
        { id: '5ngjj512', club_name: 'Legacy Golf Club', course_name: 'Legacy Golf Club',
          location: { address: '130 Par Excellence Drive, Henderson, NV 89074, United States',
                      city: 'Henderson', state: 'NV', country: 'United States' },
          tees: { female: 3, male: 5 } }
    ]
};
const LIVE_SEARCH_EMPTY = { courses: [] };

// ---------------------------------------------------------------------------
// A FAKE KV. Map-backed, honouring expirationTtl against an injectable clock.
//
// IT IS STRONGLY CONSISTENT AND REAL KV IS NOT. Cloudflare KV can serve a stale
// read for a short window after a write, which is exactly the case where two
// simultaneous requests both read the same counter and both write count+1 - an
// undercount. This fake will never show that, and teaching it to would be
// asserting the mock rather than the runtime. The undercount is why the ceiling
// is 9,000 of 10,000 rather than 10,000 of 10,000, and that headroom is the
// mitigation. It was 30 of 35 when this was written against the free tier.
// ---------------------------------------------------------------------------
function fakeKV(clock) {
    const store = new Map();
    return {
        _store: store,
        async get(key, type) {
            const row = store.get(key);
            if (!row) return null;
            if (row.expiresAt !== null && clock.now() >= row.expiresAt) { store.delete(key); return null; }
            return type === 'json' ? JSON.parse(row.value) : row.value;
        },
        async put(key, value, opts) {
            const ttl = opts && opts.expirationTtl;
            store.set(key, {
                value: typeof value === 'string' ? value : JSON.stringify(value),
                expiresAt: ttl ? clock.now() + (ttl * 1000) : null
            });
        },
        async delete(key) { store.delete(key); },
        keysMatching(prefix) { return [...store.keys()].filter((k) => k.startsWith(prefix)); }
    };
}

function fakeClock(iso) {
    let t = new Date(iso || '2026-09-11T10:00:00Z').getTime();
    return { now: () => t, advance: (ms) => { t += ms; }, date: () => new Date(t) };
}

// A scripted upstream. `script` is a function of (url, init) returning either a
// Response-like object, or throwing, so every failure mode is expressible.
function scriptedFetch(script) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url: String(url), init, at: calls.length });
        return script(String(url), init, calls.length - 1);
    };
    fn.calls = calls;
    return fn;
}

const jsonResponse = (obj, status) => ({
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    async json() { return obj; },
    async text() { return JSON.stringify(obj); }
});
const textResponse = (body, status) => ({
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    async json() { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    async text() { return body; }
});

// Assembles the dependency bag the handler takes. Keeping this in one place
// means a signature change shows up once rather than in thirty tests.
function deps(over) {
    const clock = (over && over.clock) || fakeClock();
    const kv = (over && over.kv) || fakeKV(clock);
    return Object.assign({
        q: 'legacy',
        ip: '203.0.113.7',
        clock,
        kv,
        fetch: scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY)),
        env: { GOLFCOURSE_API_KEY: 'test-key', GOLFCOURSE_API_BASE: 'https://upstream.test' }
    }, over || {});
}

const call = (d) => LIB.handleSearch(d);
const skipIfUnbuilt = () => {
    if (loadError) {
        assert.fail('the Function is not written yet, which is expected while the tests lead. '
            + 'Import failed: ' + (loadError && loadError.message));
    }
};

// ===========================================================================
describe('THE MODULE EXISTS AND EXPOSES ONE BUILDER', () => {

    test('_lib.js loads and exports the shared rule', () => {
        skipIfUnbuilt();
        ['handleSearch', 'handleDetail', 'normaliseQuery', 'searchCacheKey',
         'counterKey', 'rateKey'].forEach((name) => {
            assert.equal(typeof LIB[name], 'function', `_lib.js must export ${name}`);
        });
        // RE-PINNED FOR PRO. Every one of these moved when the account went from
        // 35 requests a day to 10,000, and re-pinning them is the deliberate
        // confirmation this guard exists to demand - not a workaround.
        assert.equal(LIB.DAILY_CEILING, 9000,
            'the ceiling is no longer a ration - nothing this app legitimately does approaches '
            + '9,000 lookups in a day, so reaching it means something is LOOPING');
        assert.equal(LIB.MIN_QUERY, 3,
            'unchanged, and deliberately: this was never about quota. It stops a single letter '
            + 'being sent to a substring matcher.');
        assert.equal(LIB.IP_HOURLY_CAP, 60,
            'five an hour made setting up a four-round trip painful. Sixty is invisible to a '
            + 'person and still stops a script - and it matters MORE now, because it guards a '
            + 'PAID key.');
        assert.equal(LIB.SEARCH_TTL, 60 * 60,
            'search cached an hour, not seven days. A long cache was scarcity protection; its '
            + 'cost is that a newly added course stays unfindable until it expires.');
        assert.equal(LIB.DETAIL_TTL, 30 * 24 * 60 * 60,
            'detail unchanged - par and stroke index do not change');
    });

    // CLAUDE.md's standing rule: testing the handler directly proves the handler
    // works, not that anything calls it. That gap has shipped a broken default
    // three times in this repo. The route file is the thing Cloudflare invokes.
    test('onRequestGet ACTUALLY ROUTES to the handler - not just exported beside it', async () => {
        skipIfUnbuilt();
        assert.equal(typeof SEARCH_MODULE.onRequestGet, 'function',
            'course-search.js must export onRequestGet - it is Cloudflare\'s entry point');
        const clock = fakeClock();
        const kv = fakeKV(clock);
        const fetchStub = scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY));
        // THE STUB GOES ON THE GLOBAL, NOT INTO A PARAMETER. An earlier draft
        // passed { __test: { fetch } } into the route, which would have meant a
        // test-only backdoor parameter in a Function deployed to the public
        // internet. Replacing globalThis.fetch keeps production code with no
        // idea it is being tested.
        const realFetch = globalThis.fetch;
        globalThis.fetch = fetchStub;
        let res;
        try {
            res = await SEARCH_MODULE.onRequestGet({
                request: new Request('https://site.test/api/course-search?q=legacy', {
                    headers: { 'CF-Connecting-IP': '203.0.113.9' }
                }),
                env: { GOLFCOURSE_API_KEY: 'k', GOLFCOURSE_API_BASE: 'https://upstream.test',
                       GOLFCOURSE_KV: kv }
            });
        } finally {
            globalThis.fetch = realFetch;
        }
        const body = await res.json();
        assert.equal(body.status, 'ok', 'the route did not produce a handler response');
        assert.equal(fetchStub.calls.length, 1, 'the route did not reach the upstream through '
            + 'the handler');
        assert.ok(kv._store.size > 0, 'the route did not use the KV binding it was given');
    });
});

// ===========================================================================
describe('A MISCONFIGURED DEPLOY PRODUCES A REASON, NEVER A CRASH', () => {

    // BOTH OF THESE WERE REAL, AND BOTH WERE FOUND ON THE LIVE SITE AFTER THE
    // Function had already been pushed - not by reading the code.
    //
    //   NO KV BINDING gave "error code: 1101" at HTTP 500, because
    //   context.env.GOLFCOURSE_KV was undefined and kv.get threw. A 1101 is not
    //   one of the three shapes and a caller can do nothing with it.
    //
    //   NO API KEY did not crash, which made it worse: it sent "Bearer
    //   undefined", SPENT A REQUEST from the daily budget to collect a
    //   guaranteed 401, and reported upstream_error - pointing whoever read it
    //   at the API rather than at their own dashboard.

    test('no KV binding -> not_configured, and nothing throws', async () => {
        skipIfUnbuilt();
        const d = deps({ kv: undefined, env: { GOLFCOURSE_API_KEY: 'k' } });
        const res = await call(d);
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'not_configured');
        assert.ok(!('courses' in res));
    });

    test('no API key -> not_configured, and NO REQUEST IS SPENT', async () => {
        skipIfUnbuilt();
        const d = deps({ env: { GOLFCOURSE_API_BASE: 'https://upstream.test' } });
        const res = await call(d);
        assert.equal(res.reason, 'not_configured');
        assert.equal(d.fetch.calls.length, 0,
            'a deploy with no key still called upstream. Every one of those is a request from '
            + 'the daily budget, guaranteed to come back 401, and it would burn the ceiling on '
            + 'calls that could never have succeeded.');
        assert.equal(await d.kv.get(LIB.counterKey(d.clock.date())), null,
            'an unconfigured request incremented the daily counter');
    });

    test('neither binding -> not_configured', async () => {
        skipIfUnbuilt();
        const res = await call(deps({ kv: undefined, env: {} }));
        assert.equal(res.reason, 'not_configured');
    });

    test('the detail route is guarded the same way', async () => {
        skipIfUnbuilt();
        const res = await LIB.handleDetail({ id: 'bwcdmzcy', env: {}, kv: undefined });
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'not_configured');
        assert.ok(!('course' in res));
    });

    // THE ORDER MATTERS AND IS ASSERTED. query_too_short must still answer with
    // nothing configured at all, because that is the cheapest possible live
    // proof that Cloudflare is routing the file - it needs no key, no KV and no
    // upstream. It is step one of the dashboard checklist.
    test('a short query STILL answers with nothing configured - the routing proof', async () => {
        skipIfUnbuilt();
        const res = await call(deps({ q: 'ab', kv: undefined, env: {} }));
        assert.equal(res.reason, 'query_too_short',
            'the config guard was placed before the length check, so ?q=ab no longer proves '
            + 'routing on an unconfigured deploy');
    });

    test('a BAD COURSE ID is still refused before the config guard, for the same reason', async () => {
        skipIfUnbuilt();
        const res = await LIB.handleDetail({ id: 'nope', env: {}, kv: undefined });
        assert.equal(res.reason, 'bad_course_id');
    });

    test('the reason vocabulary is closed - every reason this can emit is documented', () => {
        skipIfUnbuilt();
        // A caller switching on `reason` needs the list to be finite and
        // written down. This asserts the file documents each one it can produce.
        const src = fs.readFileSync(path.join(__dirname, LIB_PATH), 'utf8');
        // COMMENTS ARE THE DOCUMENTATION AND CODE IS THE EMISSION, so the two
        // halves must read different things or each proves the other.
        //
        // And "emitted" cannot mean `unavailable('x')` literally. An earlier
        // version checked exactly that and failed on upstream_error and network,
        // which are produced as { error: 'network' } inside ask() and passed
        // through - correct code, wrong test. Any quoted occurrence in
        // comment-stripped source counts.
        const code = src.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        const comments = src.split('\n').filter((l) => l.trim().startsWith('//')).join('\n');
        ['query_too_short', 'not_configured', 'bad_course_id', 'rate_limited',
         'daily_limit', 'upstream_error', 'network'].forEach((r) => {
            const emitted = code.includes("'" + r + "'");
            const documented = new RegExp('//\\s+' + r + '\\s').test(comments);
            assert.ok(emitted, `${r} is documented but never emitted - the table is stale`);
            assert.ok(documented,
                `${r} is emitted but not in the reason table. A caller cannot switch on a `
                + 'vocabulary that is not written down.');
        });
    });
});

// ===========================================================================
describe('R1 - A CACHE HIT MAKES NO UPSTREAM CALL', () => {

    // FIRST ASSERTION IN THE FILE BY DESIGN. The whole proxy exists to make 35
    // requests a day survive a Saturday. If this does not hold, nothing else
    // here matters.
    test('a warm cache calls upstream ZERO times', async () => {
        skipIfUnbuilt();
        const d = deps();
        await d.kv.put(LIB.searchCacheKey('legacy'), JSON.stringify(LIVE_SEARCH_LEGACY.courses),
            { expirationTtl: LIB.SEARCH_TTL });
        const res = await call(d);
        assert.equal(d.fetch.calls.length, 0,
            'a cached search reached the upstream anyway. Not fewer calls - ZERO.');
        assert.equal(res.status, 'ok');
        assert.equal(res.courses.length, 3, 'the cached courses were not returned');
    });

    test('a cache hit does not spend budget either', async () => {
        skipIfUnbuilt();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), '7');
        await d.kv.put(LIB.searchCacheKey('legacy'), JSON.stringify(LIVE_SEARCH_LEGACY.courses),
            { expirationTtl: LIB.SEARCH_TTL });
        await call(d);
        assert.equal(await d.kv.get(LIB.counterKey(d.clock.date())), '7',
            'a cache hit incremented the daily counter. It made no request; it must cost none.');
    });

    test('two identical searches make ONE upstream call', async () => {
        skipIfUnbuilt();
        const d = deps();
        await call(d);
        await call(d);
        assert.equal(d.fetch.calls.length, 1,
            'the second identical search was not served from cache');
    });

    test('and the cache expires - a stale search is fetched again', async () => {
        skipIfUnbuilt();
        const d = deps();
        await call(d);
        assert.equal(d.fetch.calls.length, 1);
        d.clock.advance((LIB.SEARCH_TTL * 1000) + 1000);
        await call(d);
        assert.equal(d.fetch.calls.length, 2,
            'the cache never expires, so a course added upstream could never be found');
    });
});

// ===========================================================================
describe('R2 - THE COUNTER INCREMENTS BEFORE THE CALL', () => {

    // ORDERING IS PROVED FROM INSIDE THE CALL. A test that checked the counter
    // afterwards could not tell before from after - both end at N+1. So the
    // fetch stub reads the counter AT THE MOMENT IT IS INVOKED and records what
    // it saw. Increment-before shows as N+1 during the call.
    test('the counter already reads N+1 DURING the upstream call', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        await kv.put(LIB.counterKey(clock.date()), '4');
        let seenDuringCall = null;
        const d = deps({
            clock, kv,
            fetch: scriptedFetch(async () => {
                seenDuringCall = await kv.get(LIB.counterKey(clock.date()));
                return jsonResponse(LIVE_SEARCH_LEGACY);
            })
        });
        await call(d);
        assert.equal(seenDuringCall, '5',
            `the counter read ${seenDuringCall} during the upstream call, expected 5. It is `
            + 'being incremented AFTER the call, so a request that dies in flight is spent '
            + 'upstream and uncounted here - and the ceiling drifts high.');
    });

    test('a call that THROWS still counts', async () => {
        skipIfUnbuilt();
        const d = deps({ fetch: scriptedFetch(() => { throw new TypeError('network down'); }) });
        await d.kv.put(LIB.counterKey(d.clock.date()), '4');
        const res = await call(d);
        assert.equal(await d.kv.get(LIB.counterKey(d.clock.date())), '5',
            'a failed request did not count. Upstream may well have counted it.');
        assert.equal(res.status, 'unavailable');
    });

    test('the counter is per UTC day and a new day starts clean', async () => {
        skipIfUnbuilt();
        const clock = fakeClock('2026-09-11T23:59:00Z');
        const kv = fakeKV(clock);
        await kv.put(LIB.counterKey(clock.date()), String(LIB.DAILY_CEILING));
        const d = deps({ clock, kv });
        assert.equal((await call(d)).status, 'unavailable', 'expected the ceiling to bite');
        clock.advance(2 * 60 * 1000);
        const d2 = deps({ clock, kv, fetch: scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY)) });
        const res2 = await call(d2);
        assert.equal(res2.status, 'ok',
            'the counter did not roll at UTC midnight, so the budget never comes back');
    });
});

// ===========================================================================
describe('R3 - AT THE CEILING: unavailable / daily_limit, NOT AN EMPTY LIST', () => {

    test('the ceiling refuses, names the reason, and makes no call', async () => {
        skipIfUnbuilt();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), String(LIB.DAILY_CEILING));
        const res = await call(d);
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'daily_limit');
        assert.equal(d.fetch.calls.length, 0, 'the ceiling was checked after the call, or not '
            + 'at all - the request went out anyway');
    });

    // ASSERTED SEPARATELY AND DELIBERATELY. A caller that forgets to check
    // `status` must not be able to read an empty list out of a refusal and
    // conclude the course does not exist.
    test('a refusal carries NO courses key at all - absent, not empty', async () => {
        skipIfUnbuilt();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), String(LIB.DAILY_CEILING));
        const res = await call(d);
        assert.ok(!('courses' in res),
            'the refusal carries a courses key. Even empty, that is the collapse this whole '
            + 'file exists to prevent: it reads as "we searched and found nothing".');
    });

    test('one below the ceiling still works, so the guard is a ceiling and not a wall', async () => {
        skipIfUnbuilt();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), String(LIB.DAILY_CEILING - 1));
        const res = await call(d);
        assert.equal(res.status, 'ok');
        assert.equal(d.fetch.calls.length, 1);
    });

    test('the per-IP cap refuses without spending the daily budget', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        for (let i = 0; i < LIB.IP_HOURLY_CAP; i++) {
            await call(deps({ clock, kv, q: 'query number ' + i }));
        }
        const before = await kv.get(LIB.counterKey(clock.date()));
        const d = deps({ clock, kv, q: 'one more distinct query' });
        const res = await call(d);
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'rate_limited');
        assert.equal(d.fetch.calls.length, 0);
        assert.equal(await kv.get(LIB.counterKey(clock.date())), before,
            'a rate-limited request spent daily budget it never used');
    });
});

// ===========================================================================
describe('R4 - ERROR, TIMEOUT AND GARBAGE ALL RETURN unavailable', () => {

    const cases = [
        ['a 500 from upstream', () => jsonResponse({ error: 'boom' }, 500), 'upstream_error'],
        ['a 429 from upstream', () => jsonResponse({ error: 'slow down' }, 429), 'upstream_error'],
        ['a 401 from upstream', () => jsonResponse({ error: 'unauthorized' }, 401), 'upstream_error'],
        ['fetch throwing', () => { throw new TypeError('fetch failed'); }, 'network'],
        ['a timeout', () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }, 'network'],
        ['a 200 whose body is not JSON', () => textResponse('<html>maintenance</html>'), 'upstream_error'],
        ['a 200 with JSON but no courses array', () => jsonResponse({ message: 'hi' }), 'upstream_error']
    ];

    cases.forEach(([label, script, expectedReason]) => {
        test(`${label} -> unavailable / ${expectedReason}, never an empty list`, async () => {
            skipIfUnbuilt();
            const d = deps({ fetch: scriptedFetch(script) });
            const res = await call(d);
            assert.equal(res.status, 'unavailable', `${label} did not report unavailable`);
            assert.equal(res.reason, expectedReason);
            assert.ok(!('courses' in res),
                `${label} produced a courses key. A golfer would be told the course does not `
                + 'exist when the truth is we could not ask.');
        });
    });

    test('a failure is NOT cached - the next search tries again', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        const failing = deps({ clock, kv, fetch: scriptedFetch(() => jsonResponse({}, 500)) });
        await call(failing);
        const working = deps({ clock, kv, fetch: scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY)) });
        const res = await call(working);
        assert.equal(res.status, 'ok',
            'a transient upstream failure was cached for seven days, so one bad minute makes a '
            + 'course unfindable for a week');
        assert.equal(working.fetch.calls.length, 1);
    });
});

// ===========================================================================
describe('R5 - A GENUINE ZERO RESULT IS ok WITH AN EMPTY LIST', () => {

    // A ZERO IS STILL AN ANSWER - AND IS NO LONGER STORED.
    // On the free tier a cached zero was free protection against a repeated typo.
    // Its cost is that one golfer mistyping "Quintero" makes that misspelling
    // answer "nothing" for everyone until the entry expires, indistinguishable
    // from the course not existing. On Pro, re-asking costs one request of ten
    // thousand and the wrong answer costs a golfer their round.
    test('a zero result is NOT cached - the next identical search asks again', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        const f = scriptedFetch(() => jsonResponse(LIVE_SEARCH_EMPTY));
        await call(deps({ clock, kv, fetch: f, q: 'quintaro' }));
        await call(deps({ clock, kv, fetch: f, q: 'quintaro' }));
        assert.equal(f.calls.length, 2,
            'the empty answer was cached, so a single mistyped search makes that spelling '
            + 'report "nothing" for everyone until it expires');
        assert.equal(kv.keysMatching('search:').length, 0,
            'an empty result was written to the cache');
    });

    test('but a NON-empty result still is - the cache did not simply stop working', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        const f = scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY));
        await call(deps({ clock, kv, fetch: f, q: 'legacy' }));
        await call(deps({ clock, kv, fetch: f, q: 'legacy' }));
        assert.equal(f.calls.length, 1, 'real results are no longer cached either');
    });


    test('asked and found nothing -> ok, courses []', async () => {
        skipIfUnbuilt();
        const d = deps({ fetch: scriptedFetch(() => jsonResponse(LIVE_SEARCH_EMPTY)) });
        const res = await call(d);
        assert.equal(res.status, 'ok');
        assert.deepEqual(res.courses, []);
    });

    // THE DISCRIMINATION ASSERTION. This exists specifically so that collapsing
    // unavailable into an empty list cannot pass. Every other assertion in R4
    // could be satisfied by a response that merely LOOKS different; this one
    // compares them field by field and requires them to be genuinely distinct.
    test('the zero-result answer is DISTINGUISHABLE from every failure', async () => {
        skipIfUnbuilt();
        const zero = await call(deps({ fetch: scriptedFetch(() => jsonResponse(LIVE_SEARCH_EMPTY)) }));

        const ceiling = (() => {
            const d = deps();
            return d.kv.put(LIB.counterKey(d.clock.date()), String(LIB.DAILY_CEILING))
                .then(() => call(d));
        })();
        const failures = [
            await ceiling,
            await call(deps({ fetch: scriptedFetch(() => jsonResponse({}, 500)) })),
            await call(deps({ fetch: scriptedFetch(() => { throw new TypeError('x'); }) })),
            await call(deps({ fetch: scriptedFetch(() => textResponse('nope')) })),
            await call(deps({ q: 'ab' }))
        ];

        failures.forEach((f, i) => {
            assert.notDeepEqual(zero, f,
                `failure case ${i} is byte-identical to a genuine zero-result answer. A caller `
                + 'cannot tell "there is no such course" from "we could not look".');
            assert.notEqual(zero.status, f.status,
                `failure case ${i} reports status "${f.status}", the same as a real result`);
        });
        assert.equal(zero.status, 'ok');
        assert.ok(Array.isArray(zero.courses));
    });
});

// ===========================================================================
describe('R6 - A SHORT QUERY IS REJECTED WITHOUT AN UPSTREAM CALL', () => {

    ['', 'a', 'ab', '  a  ', '   '].forEach((q) => {
        test(`q=${JSON.stringify(q)} costs nothing`, async () => {
            skipIfUnbuilt();
            const d = deps({ q });
            await d.kv.put(LIB.counterKey(d.clock.date()), '3');
            const res = await call(d);
            assert.equal(d.fetch.calls.length, 0, 'a short query reached the upstream');
            assert.equal(await d.kv.get(LIB.counterKey(d.clock.date())), '3',
                'a rejected query spent budget');
            assert.equal(res.status, 'unavailable');
            assert.equal(res.reason, 'query_too_short');
            assert.ok(!('courses' in res));
        });
    });

    test('exactly 3 characters IS allowed - the boundary is not off by one', async () => {
        skipIfUnbuilt();
        const d = deps({ q: 'leg' });
        const res = await call(d);
        assert.equal(res.status, 'ok');
        assert.equal(d.fetch.calls.length, 1);
    });
});

// ===========================================================================
describe('R7 - KEY NORMALISATION: ONE CACHE ENTRY, NOT FOUR', () => {

    const VARIANTS = ['Legacy', 'legacy ', 'LEGACY', '  legacy  '];

    test('every casing and padding maps to one key', () => {
        skipIfUnbuilt();
        const keys = new Set(VARIANTS.map((v) => LIB.searchCacheKey(v)));
        assert.equal(keys.size, 1,
            `${VARIANTS.length} spellings produced ${keys.size} cache keys: `
            + JSON.stringify([...keys]));
    });

    test('and they cost ONE upstream call between them', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        const fetchStub = scriptedFetch(() => jsonResponse(LIVE_SEARCH_LEGACY));
        for (const v of VARIANTS) {
            await call(deps({ clock, kv, fetch: fetchStub, q: v }));
        }
        assert.equal(fetchStub.calls.length, 1,
            `four spellings of one word cost ${fetchStub.calls.length} requests`);
        assert.equal(kv.keysMatching('search:').length, 1,
            'the store holds more than one entry for the same search');
    });

    test('internal whitespace collapses too', () => {
        skipIfUnbuilt();
        assert.equal(LIB.searchCacheKey('camas   meadows'), LIB.searchCacheKey('camas meadows'));
    });

    test('but genuinely different searches stay different', () => {
        skipIfUnbuilt();
        // Normalisation must not be so eager it merges unrelated queries - that
        // would serve one course's results for another's name.
        assert.notEqual(LIB.searchCacheKey('legacy'), LIB.searchCacheKey('streamsong'));
        assert.notEqual(LIB.searchCacheKey('pine'), LIB.searchCacheKey('pines'));
    });
});

// ===========================================================================
describe('FORWARD COMPATIBILITY - THE RESULT SET IS NOT PRUNED', () => {

    // Location-aware ranking is a later wave, and it is RANKING rather than
    // filtering: the API carries no lat/long, so the only signal is
    // location.state, and hiding out-of-state courses would hide the right
    // answer - the Phoenix course is "Legacy Golf Resort" and a golfer may well
    // be searching for it from another state.
    //
    // Ranking is presentation and belongs in the picker, which needs no Function
    // change and no cache change to do it. The ONE thing that must be true now
    // is that the Function does not truncate: a picker cannot reorder what it
    // never received.
    test('every course upstream returned reaches the caller, unpruned', async () => {
        skipIfUnbuilt();
        const many = { courses: Array.from({ length: 25 }, (_, i) => ({
            id: 'id' + String(i).padStart(6, '0'), club_name: 'Club ' + i,
            course_name: 'Course ' + i,
            location: { city: 'Town', state: i % 2 ? 'AZ' : 'KY', country: 'United States' },
            tees: { male: 4 } })) };
        const d = deps({ fetch: scriptedFetch(() => jsonResponse(many)) });
        const res = await call(d);
        assert.equal(res.courses.length, 25,
            'the Function pruned the result set. State ranking in a later wave can only '
            + 'reorder what it is given.');
    });

    test('location survives the round trip, including through the cache', async () => {
        skipIfUnbuilt();
        const clock = fakeClock();
        const kv = fakeKV(clock);
        await call(deps({ clock, kv }));
        const cached = await call(deps({ clock, kv,
            fetch: scriptedFetch(() => { throw new Error('must not be called'); }) }));
        const phoenix = cached.courses.find((c) => c.id === 'bwcdmzcy');
        assert.ok(phoenix, 'the Phoenix course did not survive the cache round trip');
        assert.equal(phoenix.location.state, 'AZ',
            'location.state was dropped in caching - the only ranking signal this API '
            + 'provides, since it carries no lat/long');
        assert.equal(phoenix.location.city, 'Phoenix');
    });
});

// ===========================================================================
describe('THE KEY NEVER LEAVES THE FUNCTION', () => {

    test('the upstream request carries the key and the response never does', async () => {
        skipIfUnbuilt();
        const d = deps();
        const res = await call(d);
        const sent = d.fetch.calls[0];
        const auth = (sent.init && sent.init.headers &&
            (sent.init.headers.Authorization || sent.init.headers.authorization)) || '';
        assert.match(auth, /^Bearer /, 'the upstream call did not send a bearer token');
        assert.ok(auth.includes('test-key'), 'the key was not sent upstream');
        const serialised = JSON.stringify(res);
        assert.ok(!serialised.includes('test-key'),
            'THE API KEY APPEARS IN THE RESPONSE BODY. The whole reason this Function exists '
            + 'is that the repo root is served publicly and the key cannot be in the bundle - '
            + 'echoing it to the browser would undo that entirely.');
    });

    test('the upstream base comes from env, so a test can point it at a stub', async () => {
        skipIfUnbuilt();
        const d = deps();
        await call(d);
        assert.ok(d.fetch.calls[0].url.startsWith('https://upstream.test'),
            'GOLFCOURSE_API_BASE was ignored: ' + d.fetch.calls[0].url);
    });
});
