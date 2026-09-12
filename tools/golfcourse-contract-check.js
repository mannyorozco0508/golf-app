#!/usr/bin/env node
// ============================================================================
// DOES THE REAL API STILL RETURN THE SHAPE OUR FIXTURES CLAIM IT DOES?
//
// MANUAL ONLY. THIS SPENDS QUOTA. IT MUST NEVER RUN IN npm test.
//
// The account is on Pro - 10,000 requests a day, not 35 - so one request is no
// longer expensive. The --live gate STAYS anyway: a tool that costs money should
// be deliberate, every sweep here globs tools/*check*.js and that filename
// matches, and a header saying "manual only" cannot stop a glob. What has come
// down is the alarm, not the gate.
//
// course_api_proxy_test.js drives a stub whose success responses are bytes
// captured from the live API. That stub is the only thing standing between us
// and a design built on what the API returned once, in September 2026. Four
// things it cannot prove are written into that file's header; three of them the
// proxy is deliberately insensitive to.
//
// The fourth is not, and it is the reason this file exists: IF THE UPSTREAM
// CHANGES ITS SUCCESS SHAPE - renames `courses`, nests it, drops `location` -
// every test stays green and the live app breaks. No stub can catch that. Only
// asking the real API can.
//
// WHY IT IS NOT IN THE SUITE. A test suite that spends a metered budget is a
// suite you stop running, and the day you stop running it is the day it stops
// protecting anything. That was acute at 35 a day and is merely true at 10,000.
// So this is a tool you invoke deliberately, and it tells you what it cost.
//
//   node tools/golfcourse-contract-check.js --live            1 request
//   node tools/golfcourse-contract-check.js --live --detail   2 requests
//
//   WITHOUT --live IT EXITS 2 AND SENDS NOTHING. That is deliberate: the sweeps
//   in this project glob tools/*check*.js, and this filename matches.
//
//   exit 0   the live response satisfies every shape assertion the fixtures do
//   exit 1   the upstream contract has changed - the proxy's assumptions are
//            stale and course_api_proxy_test.js is now guarding a fiction
//   exit 2   could not run: no key, no network. NOTHING PROVEN, and nothing
//            spent.
//
// THE KEY IS READ FROM THE macOS KEYCHAIN, never from a file, never from an
// argument, and is not printed. This repo's root is served publicly by
// Cloudflare Pages - measured, /package.json returns 200 - so a key in any file
// here would be a downloadable URL.
// ============================================================================

const { execFileSync } = require('child_process');

const BASE = process.env.GOLFCOURSE_API_BASE || 'https://api.golfcourseapi.com';
const WANT_DETAIL = process.argv.includes('--detail');
// --query <text> overrides the probe query. The default stays Streamsong, a
// small known set; a deliberately broad query ("Golf Club") is how to see
// whether `courses` is a capped page - still one request, still no paging
// parameter, so the answer describes the request the proxy actually sends.
const QUERY = (() => { const i = process.argv.indexOf('--query'); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : 'Streamsong'; })();
// --param <name>=<value> appends &<name>=<value> to the search URL, ONLY when
// given; --page <n> is the same thing spelled for one name. The default request
// stays exactly what the proxy sends. Added to learn whether the 25-course
// result on a broad query is a page the API will move past under SOME name
// (page, current_page, offset) or widen (page_size), or a hard ceiling. On
// 2026-09-12 `page=2` returned the same first course as page 1.
const EXTRA_PARAMS = (() => {
    const out = [];
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--page' && /^\d+$/.test(process.argv[i + 1] || '')) out.push(['page', process.argv[i + 1]]);
        if (process.argv[i] === '--param' && /^[A-Za-z_]+=.+$/.test(process.argv[i + 1] || '')) {
            const eq = process.argv[i + 1].indexOf('=');
            out.push([process.argv[i + 1].slice(0, eq), process.argv[i + 1].slice(eq + 1)]);
        }
    }
    return out;
})();
const EXTRA_QS = EXTRA_PARAMS.map(([k, v]) => '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('');

function keyFromKeychain() {
    try {
        return execFileSync('security',
            ['find-generic-password', '-a', process.env.USER, '-s', 'golfcourse-api', '-w'],
            { encoding: 'utf8' }).trim();
    } catch (e) { return null; }
}

// SPENT IS REPORTED HONESTLY, INCLUDING WHEN WE DO NOT KNOW. An earlier version
// hard-coded requestsSpent: 0 in this bail, which was a lie in exactly the case
// that matters: a fetch that dies AFTER reaching the API has already been
// counted upstream, and reporting 0 would have told you a request was free when
// it was not. This is the same discipline the Function's own counter follows -
// increment before the call, because a request that dies in flight was still
// made. Caught by running this tool against an unreachable host and reading its
// own output.
let spent = 0;
const bail = (why, extra) => {
    console.log(JSON.stringify({
        verdict: 'COULD NOT RUN', why, extra,
        requestsSpent: spent,
        spentNote: spent > 0
            ? 'AT LEAST ONE REQUEST WAS STARTED. If it reached the API before failing it has '
              + 'been counted against the daily budget, and we cannot tell from here.'
            : 'nothing was sent'
    }, null, 2));
    process.exit(2);
};

// The shape assertions. These are the SAME claims course_api_proxy_test.js's
// fixtures embody, written once here against the live body. If a fixture and
// the live API ever disagree, this is where it surfaces.
function checkSearchShape(body) {
    const f = [];
    if (!body || typeof body !== 'object') { f.push('the body is not an object'); return f; }
    if (!Array.isArray(body.courses)) {
        f.push('`courses` is not a top-level array. The proxy treats a body without a courses '
            + 'array as unavailable, so this change would make EVERY live search report '
            + '"could not search" while every test stayed green.');
        return f;
    }
    if (body.courses.length === 0) {
        f.push('the probe search returned zero courses, so the per-course assertions below '
            + 'cannot run. Pick a different query - this is not an upstream defect.');
        return f;
    }
    const c = body.courses[0];
    [['id', 'string'], ['club_name', 'string'], ['course_name', 'string']].forEach(([k, t]) => {
        if (typeof c[k] !== t) f.push(`course.${k} is ${typeof c[k]}, expected ${t}`);
    });
    if (!/^[0-9abcdefghjkmnpqrstvwxyz]{8}$/.test(String(c.id))) {
        f.push(`course.id "${c.id}" is not the 8-character opaque form the spec declares. `
            + 'detailCacheKey and the /api/course/[id] route both assume it.');
    }
    if (!c.location || typeof c.location !== 'object') {
        f.push('course.location is missing. It is the ONLY ranking signal this API provides - '
            + 'there is no lat/long - and the picker needs city and state to tell four '
            + 'identically named Legacy Golf Clubs apart.');
    } else {
        ['city', 'state'].forEach((k) => {
            if (!(k in c.location)) f.push(`course.location.${k} is absent`);
        });
    }
    if (!('tees' in c)) {
        f.push('course.tees is absent from the search summary. Its presence is what lets the '
            + 'picker show "no tee data" without spending a detail request.');
    }
    return f;
}

function checkDetailShape(body) {
    const f = [];
    const c = body && body.course;
    if (!c) { f.push('detail response has no top-level `course` key'); return f; }
    if (!c.tees || typeof c.tees !== 'object') { f.push('course.tees is missing'); return f; }
    const groups = Object.keys(c.tees);
    if (groups.length === 0) { f.push('course.tees is empty for a course chosen for having tees'); return f; }
    const arr = c.tees[groups[0]];
    if (!Array.isArray(arr)) {
        f.push(`course.tees.${groups[0]} is not an array. TEE SETS BEING SEPARATE OBJECTS is `
            + 'the finding that made this API viable at all - each carrying its own rating, '
            + 'slope and holes. A flattened shape would break handicap allocation.');
        return f;
    }
    const t = arr[0] || {};
    ['tee_name', 'course_rating', 'slope_rating', 'total_yards', 'par_total'].forEach((k) => {
        if (!(k in t)) f.push(`tee.${k} is absent`);
    });
    if (!Array.isArray(t.holes) || t.holes.length === 0) {
        f.push('tee.holes is not a non-empty array');
    } else {
        ['par', 'yardage', 'handicap'].forEach((k) => {
            if (!(k in t.holes[0])) f.push(`tee.holes[0].${k} is absent - par and handicap are `
                + 'the 36 numbers the whole import exists to stop a golfer typing');
        });
    }
    return f;
}

// A COMMENT SAYING "MANUAL ONLY" DOES NOT STOP A GLOB.
//
// Every sweep in this project runs `for f in tools/*check*.js`, and this
// filename matches. Without the gate below, one sweep would silently spend a
// request - and the standing cold-check sweep runs several times a wave. The
// file's header already said manual only; a glob cannot read it.
//
// So the run is opt-in: --live, or GOLFCOURSE_CONTRACT_LIVE=1. Invoked any other
// way it exits 2 having sent nothing, which is exactly what a sweep should get
// from a tool that costs money.
const OPTED_IN = process.argv.includes('--live')
    || process.env.GOLFCOURSE_CONTRACT_LIVE === '1';

(async () => {
    if (!OPTED_IN) {
        console.log(JSON.stringify({
            verdict: 'COULD NOT RUN',
            why: 'this check SPENDS from the GolfCourseAPI daily budget and will not run '
               + 'without an explicit opt-in. Re-run with --live when you actually want to '
               + 'know whether the upstream contract still holds.',
            requestsSpent: 0
        }, null, 2));
        process.exit(2);
    }
    const key = keyFromKeychain();
    if (!key) {
        bail('no key in the macOS keychain under service "golfcourse-api". Add it with: '
           + 'security add-generic-password -a "$USER" -s golfcourse-api -w');
    }

    const failures = [];
    const observed = {};
    const get = async (path) => {
        spent++;
        const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + key } });
        return { status: r.status, body: await r.text() };
    };

    let search;
    try { search = await get('/v1/search?search_query=' + encodeURIComponent(QUERY) + EXTRA_QS); }
    catch (e) { bail('the search request did not complete: ' + (e && e.message)); }

    observed.searchStatus = search.status;
    if (search.status !== 200) {
        // NOT exit 2. A non-200 here is a real finding - it may be the quota
        // answer we have never seen, and it is worth recording exactly.
        console.log(JSON.stringify({
            verdict: 'FAIL', requestsSpent: spent,
            failures: ['the live search returned HTTP ' + search.status + '. If this is quota '
                + 'exhaustion, THIS IS THE FIRST TIME WE HAVE SEEN IT - record the status and '
                + 'the body, because the proxy has never been able to observe them.'],
            observed: { status: search.status, body: search.body.slice(0, 400) }
        }, null, 2));
        process.exit(1);
    }

    let body;
    try { body = JSON.parse(search.body); }
    catch (e) { failures.push('the live search body is not JSON: ' + search.body.slice(0, 200)); }

    if (body) {
        failures.push(...checkSearchShape(body));
        // EVERY TOP-LEVEL KEY, not only `courses`. The spec defines a Metadata
        // schema (current_page, page_size, first_page, last_page, total_records)
        // that no endpoint references; the proxy keeps body.courses and discards
        // the rest, and the fixtures are trimmed. So nothing in the repo could
        // say whether a search body carries pagination. This line can.
        observed.query = QUERY;
        observed.extraParams = EXTRA_PARAMS.map(([k, v]) => k + '=' + v);
        observed.courseIds = Array.isArray(body.courses) ? body.courses.map((c) => c && c.id) : null;
        observed.searchTopLevelKeys = Object.keys(body);
        observed.coursesLength = Array.isArray(body.courses) ? body.courses.length : null;
        observed.courseCount = (body.courses || []).length;
        observed.firstCourse = (body.courses || [])[0]
            ? { id: body.courses[0].id, club_name: body.courses[0].club_name,
                location: body.courses[0].location, tees: body.courses[0].tees }
            : null;
    }

    if (WANT_DETAIL && body && (body.courses || []).length) {
        const withTees = body.courses.find((c) => c.tees && Object.keys(c.tees).length);
        if (!withTees) {
            failures.push('no course in the probe search carries tee data, so the detail half '
                + 'cannot run. Not an upstream defect - pick another query.');
        } else {
            const det = await get('/v1/courses/' + withTees.id);
            observed.detailStatus = det.status;
            if (det.status !== 200) failures.push('detail returned HTTP ' + det.status);
            else {
                try { failures.push(...checkDetailShape(JSON.parse(det.body))); }
                catch (e) { failures.push('the detail body is not JSON'); }
            }
        }
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, requestsSpent: spent,
        note: 'These came out of the daily budget - 10,000 on Pro. The proxy has its own counter in KV and '
            + 'knows nothing about requests made by this tool.',
        failures, observed
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
