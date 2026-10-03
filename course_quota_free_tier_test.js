// ============================================================================
// THE PLAN IS FREE, NOT PRO - AND THE CEILING MOVES WITH THE PLAN
//
// The scaling audit of 2026-10-03 reported the GolfCourseAPI account as Pro,
// $9.99/month, 10,000 requests a day. IT IS NOT. Manny is on the FREE tier:
// "$0 per month / Up to 35 requests per day". Everything the audit concluded
// downstream of that number was wrong in the same direction - it said the
// provider quota was the one limit we would never see, when on 35 a day it is
// the FIRST one a Saturday morning reaches.
//
// The code had the same error written into it. functions/api/_lib.js was built
// against the free tier, then re-tuned for Pro: the ceiling went from 30 to
// 9,000, the search cache from seven days to one hour, and zero results stopped
// being cached - every one of those traded requests for freshness on the
// strength of having ten thousand a day. On 35 a day the ceiling of 9,000 is
// not a runaway detector, it is NO CEILING AT ALL: the provider's own limit is
// reached two hundred and fifty times before ours notices.
//
// THIS GUARD PINS THE TWO THINGS THAT FOLLOW.
//
//   1. The ceiling is 35 by default and reads GOLFCOURSE_DAILY_LIMIT from the
//      Pages environment, so an upgrade is a dashboard edit and not a deploy.
//      9,000 stays in the file as PRO_DAILY_CEILING - the number to put in that
//      variable - rather than being deleted and re-derived later.
//
//   2. Running out says so. Our ceiling and the provider's 429 both land on
//      daily_limit, and daily_limit's sentence tells a golfer what to do
//      instead. An empty list is the one thing it must never be: this project
//      has already told a golfer a course did not exist when the truth was we
//      could not ask, and then offered to add a duplicate.
//
// WHY ONE REASON AND NOT TWO. A provider 429 and our own ceiling mean the same
// thing to a golfer on the first tee - the day's lookups are gone - and the
// advice is identical. course_import_test.js requires every reason to carry a
// DISTINCT message, and rightly: two sentences saying the same thing is a
// vocabulary that has stopped meaning anything. So 429 maps onto daily_limit
// and the reason table says it covers both.
//
// WHAT THIS FILE DOES NOT CLAIM. The provider's exhaustion shape is still
// unobserved - their spec declares no 429 and no rate-limit headers, and
// finding out costs requests from the budget. A 429 is handled because it is
// the conventional answer; a 403, or a 200 carrying an error object, still
// lands on upstream_error. That is honest rather than complete, and the fix if
// it turns up is one line here.
//
// BASELINE, measured against pre-build main (4e56993, functions/api/_lib.js
// sha256 d33bbae0c894, course-import-rules.js 250a0cf0a447), over the FINISHED
// file, all 19 tests: 7 PASS / 12 FAIL.
//
// I first wrote a 14-test figure with a 3/11 split here from memory of the
// draft. It was wrong twice over - the count and the arithmetic - and the
// numbers above are the measured ones. CLAUDE.md's rule exists because this
// keeps happening.
//
// THE TWELVE REDS are the whole correction: DAILY_CEILING at 35,
// PRO_DAILY_CEILING, the dailyCeiling export, the four malformed-env forms,
// refusal at 35, the detail route reading the same ceiling, the 429 mapping on
// both routes, 429 not being cached, the new sentence, admin.html's suffix, and
// the scan for a file still claiming the plan is Pro.
//
// THE SEVEN THAT PASS, and exactly why each one does. Two of them are INERT
// against this HEAD and I am not going to pretend otherwise:
//   - "at 34 it still asks" passes because main's ceiling is 9,000 and 34 is
//     nowhere near it. It proves nothing about 35 today; it is the clean-case
//     companion that stops the refusal test being satisfied by a proxy that
//     refuses everything.
//   - "GOLFCOURSE_DAILY_LIMIT=9000 makes the same counter value pass" passes
//     because main ALREADY compares against 9,000, with or without the
//     variable. It only becomes load-bearing once the default is 35, which is
//     the moment it starts proving the env read is wired rather than exported.
//   The other five are live and deliberate:
//   - "a 500 is still upstream_error" is the negative control on the 429
//     branch: it is what fails if I map every non-200 onto daily_limit and
//     hide a wrong key behind "try again tomorrow".
//   - "a 200 search still works" proves the fixture and the local harness.
//   - the scanner scan, the no-typing scan and the does-not-exist scan all pass
//     on main's Pro-era sentence too. They are here because the NEW sentence
//     has to keep satisfying them, and the scanner one is the only thing
//     standing between the brief's wording and a promise the app cannot keep.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const LIB_PATH = 'functions/api/_lib.js';
let LIB = {};
let loadError = null;
try {
    LIB = require('./' + LIB_PATH);
} catch (e) {
    loadError = e;
}
const RULES = require('./course-import-rules.js');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// ---------------------------------------------------------------------------
// The same shapes course_api_proxy_test.js uses, kept local so this file can be
// read on its own.
function fakeKV() {
    const store = new Map();
    return {
        async get(key) { return store.has(key) ? store.get(key) : null; },
        async put(key, value) { store.set(key, String(value)); },
        snapshot() { return new Map(store); }
    };
}
const fakeClock = (iso) => ({ date: () => new Date(iso || '2026-10-03T16:00:00Z') });
const jsonResponse = (obj, status) => ({
    ok: (status || 200) >= 200 && (status || 200) < 300,
    status: status || 200,
    async json() { return obj; },
    async text() { return JSON.stringify(obj); }
});
function countingFetch(script) {
    const calls = [];
    const fn = async (url, init) => { calls.push(String(url)); return script(String(url), calls.length - 1); };
    fn.calls = calls;
    return fn;
}
const COURSES = [{ id: 'abcd2345', club_name: 'Legacy Golf Resort', course_name: 'Legacy Golf Resort' }];
function deps(over) {
    const clock = (over && over.clock) || fakeClock();
    const kv = (over && over.kv) || fakeKV();
    return Object.assign({
        q: 'legacy', ip: '203.0.113.7', clock, kv,
        fetch: countingFetch(() => jsonResponse({ courses: COURSES })),
        env: { GOLFCOURSE_API_KEY: 'test-key', GOLFCOURSE_API_BASE: 'https://upstream.test' }
    }, over || {});
}
const needLib = () => {
    if (loadError) assert.fail('functions/api/_lib.js did not load: ' + loadError.message);
};

// ===========================================================================
describe('1. THE CEILING IS THE FREE TIER, AND IT IS CONFIGURABLE', () => {

    test('DAILY_CEILING defaults to 35 - the free tier\'s whole day', () => {
        needLib();
        assert.equal(LIB.DAILY_CEILING, 35,
            'the account is on "$0 per month / Up to 35 requests per day". A ceiling of 9,000 '
            + 'lets us spend the provider\'s entire day 257 times over before ours notices.');
    });

    test('PRO_DAILY_CEILING keeps 9,000 in the file as the number to SET, not to use', () => {
        needLib();
        assert.equal(LIB.PRO_DAILY_CEILING, 9000,
            'the Pro ceiling is not deleted - it is the value GOLFCOURSE_DAILY_LIMIT takes on '
            + 'the day the plan changes, and a number nobody has to re-derive');
        assert.notEqual(LIB.DAILY_CEILING, LIB.PRO_DAILY_CEILING,
            'the default IS the Pro number again - the plan correction did not land');
    });

    test('dailyCeiling reads GOLFCOURSE_DAILY_LIMIT, so an upgrade is a dashboard edit', () => {
        needLib();
        assert.equal(typeof LIB.dailyCeiling, 'function', '_lib.js must export dailyCeiling');
        assert.equal(LIB.dailyCeiling({ GOLFCOURSE_DAILY_LIMIT: '9000' }), 9000);
        assert.equal(LIB.dailyCeiling({ GOLFCOURSE_DAILY_LIMIT: '150' }), 150);
        assert.equal(LIB.dailyCeiling({ GOLFCOURSE_DAILY_LIMIT: 9000 }), 9000,
            'a number, not only a string - a local harness may pass either');
    });

    test('A MALFORMED LIMIT FALLS BACK TO 35 - it never opens the tap and never closes it', () => {
        needLib();
        // Both directions are a real hazard. '' or 'abc' resolving to NaN would
        // make every comparison false and the ceiling infinite - we would hand
        // the provider's whole day to one typo. '0' resolving to 0 would refuse
        // every search with daily_limit on a fresh morning, which looks exactly
        // like the quota being gone and is indistinguishable from it.
        [undefined, null, '', '   ', 'abc', '0', '-5', '35.5', 'Infinity', {}].forEach((v) => {
            assert.equal(LIB.dailyCeiling({ GOLFCOURSE_DAILY_LIMIT: v }), 35,
                JSON.stringify(v) + ' did not fall back to the free-tier default');
        });
        assert.equal(LIB.dailyCeiling(undefined), 35, 'no env at all must still answer 35');
        assert.equal(LIB.dailyCeiling({}), 35);
    });
});

// ===========================================================================
describe('2. THE CEILING IS LOAD-BEARING THROUGH THE HANDLER, NOT JUST EXPORTED', () => {

    // CLAUDE.md: a test that calls the function under test directly proves the
    // function works and nothing about whether anything calls it. dailyCeiling
    // could return 35 all day while admit() still compared against a constant.

    test('at 35 on the counter the search is refused - daily_limit, with NO courses key', async () => {
        needLib();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), '35');
        const res = await LIB.handleSearch(d);
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'daily_limit');
        assert.ok(!('courses' in res), 'a refusal carrying courses reads as "no such course"');
        assert.equal(d.fetch.calls.length, 0, 'a refused request still went upstream');
    });

    test('at 34 it still asks - the ceiling is 35, not 34', async () => {
        needLib();
        const d = deps();
        await d.kv.put(LIB.counterKey(d.clock.date()), '34');
        const res = await LIB.handleSearch(d);
        assert.equal(res.status, 'ok');
        assert.equal(d.fetch.calls.length, 1);
    });

    test('GOLFCOURSE_DAILY_LIMIT=9000 makes the SAME counter value pass - the env moves money', async () => {
        needLib();
        const d = deps({
            env: { GOLFCOURSE_API_KEY: 'test-key', GOLFCOURSE_API_BASE: 'https://upstream.test',
                   GOLFCOURSE_DAILY_LIMIT: '9000' }
        });
        await d.kv.put(LIB.counterKey(d.clock.date()), '35');
        const res = await LIB.handleSearch(d);
        assert.equal(res.status, 'ok',
            'the env variable is decoration: 35 on the counter refused a request the configured '
            + 'ceiling of 9,000 permits');
        assert.equal(d.fetch.calls.length, 1);
    });

    test('the detail route reads the same configured ceiling as search', async () => {
        needLib();
        const d = deps({ id: 'abcd2345', fetch: countingFetch(() => jsonResponse({ course: { tees: {} } })) });
        await d.kv.put(LIB.counterKey(d.clock.date()), '35');
        const refused = await LIB.handleDetail(d);
        assert.equal(refused.reason, 'daily_limit');
        assert.ok(!('course' in refused));

        const open = deps({
            id: 'abcd2345',
            fetch: countingFetch(() => jsonResponse({ course: { tees: {} } })),
            env: { GOLFCOURSE_API_KEY: 'k', GOLFCOURSE_API_BASE: 'https://upstream.test',
                   GOLFCOURSE_DAILY_LIMIT: '9000' }
        });
        await open.kv.put(LIB.counterKey(open.clock.date()), '35');
        assert.equal((await LIB.handleDetail(open)).status, 'ok');
    });
});

// ===========================================================================
describe('3. A PROVIDER 429 IS THE QUOTA BEING GONE, NOT AN UNKNOWN ERROR', () => {

    test('a 429 from upstream reports daily_limit, not upstream_error', async () => {
        needLib();
        const d = deps({ fetch: countingFetch(() => jsonResponse({ error: 'rate limit exceeded' }, 429)) });
        const res = await LIB.handleSearch(d);
        assert.equal(res.status, 'unavailable');
        assert.equal(res.reason, 'daily_limit',
            'upstream_error points whoever reads it at a broken provider. A 429 is the provider '
            + 'telling us the day is spent, which is the one thing the golfer-facing sentence '
            + 'already knows how to say.');
        assert.ok(!('courses' in res));
    });

    test('a 429 on the detail route says the same thing', async () => {
        needLib();
        const d = deps({ id: 'abcd2345', fetch: countingFetch(() => jsonResponse({}, 429)) });
        const res = await LIB.handleDetail(d);
        assert.equal(res.reason, 'daily_limit');
        assert.ok(!('course' in res));
    });

    test('a 500 is STILL upstream_error - the 429 branch did not swallow every failure', async () => {
        needLib();
        const d = deps({ fetch: countingFetch(() => jsonResponse({ error: 'boom' }, 500)) });
        assert.equal((await LIB.handleSearch(d)).reason, 'upstream_error');
        const d401 = deps({ fetch: countingFetch(() => jsonResponse({ error: 'unauthorized' }, 401)) });
        assert.equal((await LIB.handleSearch(d401)).reason, 'upstream_error',
            'a 401 is a WRONG KEY and must not be reported as the day being used up - that '
            + 'would hide a misconfigured deploy behind "try again tomorrow" for ever');
    });

    test('a 429 is not cached - the next search after a reset tries again', async () => {
        needLib();
        const kv = fakeKV();
        const clock = fakeClock();
        let status = 429;
        const d = deps({ kv, clock, fetch: countingFetch(() => jsonResponse({ courses: COURSES }, status)) });
        assert.equal((await LIB.handleSearch(d)).reason, 'daily_limit');
        status = 200;
        const again = await LIB.handleSearch(deps({ kv, clock, fetch: countingFetch(() => jsonResponse({ courses: COURSES }, 200)) }));
        assert.equal(again.status, 'ok', 'a 429 was cached and outlived the condition that caused it');
    });

    test('a 200 search still works - the fixture and the harness are not the thing failing', async () => {
        needLib();
        const res = await LIB.handleSearch(deps());
        assert.equal(res.status, 'ok');
        assert.equal(res.courses.length, 1);
    });
});

// ===========================================================================
describe('4. RUNNING OUT SAYS SO, AND NAMES A WAY TO KEEP PLAYING', () => {

    test('the shared sentence says the search is resting and points at a saved course', () => {
        const m = RULES.courseImportMessage('daily_limit');
        assert.match(m, /resting/i,
            'Manny\'s wording: "Course search is resting for today". Got: ' + JSON.stringify(m));
        assert.match(m, /saved course/i,
            'the golfer needs somewhere to go. The app has 42 courses already imported and a '
            + 'picker over them on every page that searches.');
        assert.match(m, /tomorrow/, 'it must still say when it comes back');
    });

    test('IT DOES NOT PROMISE A SCANNER - there is no scanner', () => {
        // The brief asked for "add it with the scanner". The scorecard-photo
        // OCR was REMOVED from Consumer 1.0 - admin.html says so in full, and
        // it was removed partly so privacy.html's "no photos or camera access"
        // stayed true. Copy that describes behaviour is behaviour; a sentence
        // offering a scanner to a golfer standing on the first tee is the same
        // class of defect as the money card that said it counted the main
        // format only while counting side matches too.
        const pages = ['admin.html', 'tournament.html', 'course-import-rules.js'];
        assert.doesNotMatch(RULES.courseImportMessage('daily_limit'), /scan/i,
            'the shared message offers a scanner. There is no camera entry point in the app.');
        pages.forEach((f) => {
            const src = read(f);
            assert.ok(!/scanner['"]|with the scanner|use the scanner/i.test(src),
                f + ' now offers a scanner to a golfer. The OCR path was deleted for 1.0.');
        });
    });

    test('the shared sentence STILL says nothing about typing - tournament.html has no grid', () => {
        // Unchanged invariant, re-asserted because the copy moved. admin.html
        // has an editable par/handicap grid and appends the offer itself;
        // tournament.html has none and must not promise one.
        assert.doesNotMatch(RULES.courseImportMessage('daily_limit'), /type|below|yourself/i);
    });

    test('admin.html appends the manual path to the NEW sentence, and it reads as one message', () => {
        const admin = loadHtmlInlineScript('admin.html', [], { only: false });
        const m = admin.onlineSearchMessage('daily_limit');
        assert.match(m, /resting/i, 'admin.html is building its suffix onto a stale base sentence');
        assert.match(m, /type the card in below/,
            'the manual path is the whole reason a golfer on the first tee can still play');
        assert.ok(!/—\s*you can still type/.test(m),
            'the suffix still joins with a dash onto a sentence that already has one - two '
            + 'em-dashes in one sentence is how this reads as a run-on on a phone');
    });

    test('NO message implies the course does not exist - the defect this vocabulary exists for', () => {
        ['query_too_short', 'not_configured', 'bad_course_id', 'rate_limited',
         'daily_limit', 'upstream_error', 'network'].forEach((r) => {
            const m = RULES.courseImportMessage(r);
            assert.doesNotMatch(m, /no courses? found|does ?n.t exist|no (such )?course|nothing (matched|found)/i, r);
        });
    });
});

// ===========================================================================
describe('5. THE FILE NO LONGER CLAIMS THE PLAN IS PRO', () => {

    test('_lib.js and HANDOFF.md say Free, and neither asserts 10,000 a day as ours', () => {
        const lib = read(LIB_PATH);
        const handoff = read('HANDOFF.md');
        [[LIB_PATH, lib], ['HANDOFF.md', handoff]].forEach(([name, src]) => {
            assert.ok(!/account is now Pro|The account is Pro|on Pro the|we are on Pro/i.test(src),
                name + ' still states the account is Pro. It is the free tier: 35 a day.');
        });
        assert.match(lib, /35 requests a day/,
            '_lib.js must name the number it is actually rationing');
        assert.match(handoff, /GOLFCOURSE_DAILY_LIMIT/,
            'HANDOFF.md must name the variable to change on the day the plan changes - that is '
            + 'the whole point of making it an env read');
    });
});
