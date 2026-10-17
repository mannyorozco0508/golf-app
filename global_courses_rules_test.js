// ============================================================================
// global_courses IS THE WORST-SCOPED NODE IN THE DATABASE.
//
// Anyone with no round code and no account can overwrite any course, for every
// user of the app, permanently. A corrupted round hurts one group; a corrupted
// course hurts everyone who picks it afterwards.
//
// WHAT VALIDATION CAN AND CANNOT DO HERE - measured, so nobody re-derives it:
//
//   IT CANNOT STOP A PLAUSIBLE LIE. Replacing a real course with eighteen
//   par-3s is ALLOWED by every rule in this file and by every rule that could
//   be written. Par 3 is a legal par; every field in that payload is
//   individually valid. RTDB rules validate FIELDS. They cannot express "this
//   is not the real Pebble Beach", and no amount of tightening changes that.
//   Scenario A01 below asserts that out loud so the limit stays documented
//   rather than being rediscovered as a surprise.
//
//   IT CANNOT EXPRESS UNIQUENESS. There are no loops and no cross-sibling
//   aggregation, so "hcpIndex must be a permutation of 1..18" is not writable
//   as a rule. That matters: hollywood_beach in the live database carries
//   hcpIndex 9 on BOTH hole 1 and hole 18, and 11 on no hole. A19 asserts the
//   duplicate is accepted - not because it is good data, but because a rule
//   that pretended to catch it would be a rule that cannot exist.
//
//   WHAT IT DOES DO is raise the floor from "any object with a name" to "a
//   structurally valid 18-hole card": no par 99, no string scores, no
//   truncated cards, no 40-hole courses, no 5,000-character names.
//
// TIER-B, AND THE 18 IS DELIBERATE. The rule hard-codes exactly eighteen
// holes. The app cannot publish a nine-hole course today - the only publishing
// path is validateCourseGrid(), which builds exactly 18 rows - and closing that
// door is a decision, not an accident. A nine-hole course would need this rule
// changed on purpose.
//
// THIS FILE IS RED UNTIL THE RULES LAND. It was written before them, against
// the deployed database.rules.json, and 13 of its scenarios FAIL today. That is
// the point: a scenario that passes against today's rules proves nothing about
// the rules being written next.
//
// PHASE 1 (of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK)): the write rule is now
// CREATE-ONLY from a signed-in phone, and gapi_/gca_ keys are refused from
// phones. So the scenarios run as a signed-in phone ('phone') CREATING a card
// at a fresh key - the validation table is unchanged in meaning - while a
// write-back of an existing card is asserted REFUSED (correcting a shared card
// is the Admin/server path now; accepted by Manny) and a signed-out write is
// refused. Phase 1 also added `$other: false`, so A17 (a junk top-level field)
// flipped from allowed to refused.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const RULES = path.join(REPO, 'database.rules.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

// The 35 records the live database held on 2026-09-09, fetched over the REST
// endpoint. A SNAPSHOT, and it can drift: a course added after that date is not
// covered here. The presets below are read from source instead, so they cannot
// drift at all.
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(REPO, 'global_courses_snapshot.json'), 'utf8'));

// Read live from course-data.js rather than snapshotted, so a preset edited
// tomorrow is checked tomorrow. syncPresetsToFirebase() writes exactly
// { name, data } per preset, and this mirrors that payload.
function presetPayloads() {
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(REPO, 'course-data.js'), 'utf8')
        + '\n;globalThis.__presets = coursePresets;', sandbox);
    const out = {};
    Object.entries(sandbox.__presets).forEach(([id, c]) => {
        out[id] = { name: c.name, data: c.data };
    });
    return out;
}

const hole = (n, par, hcp) => ({ hole: n, par: par, hcpIndex: hcp });
const clean = () => { const d = []; for (let n = 1; n <= 18; n++) d.push(hole(n, 4, n)); return d; };
const withFirst = (h) => [h].concat(clean().slice(1));

// THE FULL TIER-B TABLE. Every row asserts a SPECIFIC verdict - `allow` rows are
// as load-bearing as `refuse` rows, because a rule that refuses everything would
// satisfy a table made only of refusals.
const TABLE = [
    // --- the four things Tier-B deliberately does NOT stop ------------------
    { id: 'A01', what: 'all 18 holes turned into par 3s',        verdict: 'allow',
      why: 'every field is individually valid; rules cannot detect a plausible lie',
      data: { name: 'Caledonia Golf & Fish Club', data: clean().map(h => hole(h.hole, 3, h.hcpIndex)) } },
    { id: 'A02', what: 'name replaced, data intact',             verdict: 'allow',
      why: 'a non-empty string name is a valid name; rules cannot know it is the wrong one',
      data: { name: 'HACKED', data: clean() } },
    // PHASE 1: refused. global_courses/$courseId now carries $other: false
    // (with name/data/tees/location/source/createdAt/updatedAt/createdBy
    // declared), so an undeclared top-level field is refused. Was 'allow'.
    { id: 'A17', what: 'junk extra top-level field',             verdict: 'refuse',
      data: { name: 'X', data: clean(), evil: true } },
    { id: 'A19', what: 'duplicate hcpIndex (the hollywood_beach shape)', verdict: 'allow',
      why: 'uniqueness is not expressible in RTDB rules, and a live record already has this shape',
      data: { name: 'X', data: [hole(1, 4, 9), hole(2, 4, 9)].concat(clean().slice(2)) } },

    // --- structure ----------------------------------------------------------
    { id: 'A03', what: 'data is a string',                       verdict: 'refuse',
      data: { name: 'X', data: 'not-a-course' } },
    { id: 'A04', what: 'data missing entirely',                  verdict: 'refuse',
      data: { name: 'X' } },
    { id: 'A05', what: 'name missing',                           verdict: 'refuse',
      data: { data: clean() } },
    { id: 'A06', what: 'name empty string',                      verdict: 'refuse',
      data: { name: '', data: clean() } },
    { id: 'A18', what: 'name of 5,000 characters',               verdict: 'refuse',
      data: { name: 'Z'.repeat(5000), data: clean() } },
    { id: 'A20', what: 'the whole course replaced by a scalar',  verdict: 'refuse',
      data: 'wiped' },

    // --- hole count ---------------------------------------------------------
    { id: 'A14', what: 'a truncated card - only 1 hole',         verdict: 'refuse',
      data: { name: 'X', data: [hole(1, 4, 1)] } },
    { id: 'A15', what: '40 holes',                               verdict: 'refuse',
      data: { name: 'X', data: Array.from({ length: 40 }, (_, i) => hole(Math.min(i + 1, 18), 4, Math.min(i + 1, 18))) } },
    { id: 'A16', what: 'a hole object missing par',              verdict: 'refuse',
      data: { name: 'X', data: withFirst({ hole: 1, hcpIndex: 1 }) } },

    // --- field ranges -------------------------------------------------------
    { id: 'A07', what: 'par 99',                                 verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(1, 99, 1)) } },
    { id: 'A08', what: 'par 0',                                  verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(1, 0, 1)) } },
    { id: 'A09', what: 'par as the string "4"',                  verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(1, '4', 1)) } },
    { id: 'A10', what: 'hcpIndex 0',                             verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(1, 4, 0)) } },
    { id: 'A11', what: 'hcpIndex 99',                            verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(1, 4, 99)) } },
    { id: 'A12', what: 'hole 0',                                 verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(0, 4, 1)) } },
    { id: 'A13', what: 'hole 19',                                verdict: 'refuse',
      data: { name: 'X', data: withFirst(hole(19, 4, 1)) } },
];

function buildTestsData() {
    const presets = presetPayloads();
    const tests = {};

    // REGRESSION GUARD. Every record the database already holds, CREATED
    // exactly as it is under a fresh key by a signed-in phone. A rule that
    // rejects one of these would refuse a real card's shape, and it must fail
    // here rather than on a golfer's phone at a course.
    //
    // PHASE 1: re-saving the record AT ITS OWN KEY is now REFUSED for a phone
    // and signed out - create-only (the "push to global database" correction of
    // an existing card is the Admin/server path; accepted by Manny).
    Object.entries(SNAPSHOT).forEach(([id, rec]) => {
        tests[`global_courses/${id}`] = { cannotWrite: [{ auth: 'phone', data: rec }, { auth: 'nobody', data: rec }] };
        tests[`global_courses/copy_${id}`] = { canWrite: [{ auth: 'phone', data: rec }] };
    });
    // The same guard for every preset syncPresetsToFirebase would write, as a
    // CREATE. That write is a ROOT multi-path update and RTDB applies it
    // atomically, so ONE rejected preset fails all of them together (and in
    // phase 1 any preset key that already exists refuses the whole update).
    Object.entries(presets).forEach(([id, rec]) => {
        tests[`global_courses/preset_${id}`] = { canWrite: [{ auth: 'phone', data: rec }] };
    });

    TABLE.forEach((row) => {
        const key = `global_courses/atk_${row.id}`;
        tests[key] = row.verdict === 'refuse'
            ? { cannotWrite: [{ auth: 'phone', data: row.data }] }
            : { canWrite: [{ auth: 'phone', data: row.data }] };
    });

    // PHASE 1 extras: signed out creates nothing; gapi_/gca_ keys are the
    // server's, never a phone's.
    tests['global_courses/atk_signed_out'] = { cannotWrite: [{ auth: 'nobody', data: { name: 'X', data: clean() } }] };
    tests['global_courses/gapi_phone_probe'] = { cannotWrite: [{ auth: 'phone', data: { name: 'X', data: clean() } }] };

    return {
        counts: { live: Object.keys(SNAPSHOT).length, presets: Object.keys(presets).length,
                  attacks: TABLE.length, extras: 2, total: Object.keys(tests).length },
        json: {
            root: { events: {}, trips: {}, tournaments: {},
                    global_courses: SNAPSHOT, app_settings: {} },
            users: { nobody: null, phone: { uid: 'u-phone', provider: 'anonymous' } },
            tests: tests
        }
    };
}

// Through helpers/targaryen-run.js (phase 1 doubled this table): a pipe
// truncates targaryen's output at ~33 KB on macOS; a file does not. A non-zero
// exit means scenarios failed - a real result, not a crash.
function runTargaryen(rulesPath, dataPath) {
    return require('./helpers/targaryen-run.js').runTargaryen(rulesPath, dataPath);
}

describe('global_courses — Tier-B validation', () => {

    const built = buildTestsData();
    const dataPath = path.join(os.tmpdir(), 'global-courses-tests-' + process.pid + '.json');
    fs.writeFileSync(dataPath, JSON.stringify(built.json, null, 1));

    test('the scenario set is the size it claims to be', () => {
        // A suite that can pass by running nothing is the failure this repo has
        // already paid for. These floors make an empty or truncated fixture loud.
        assert.equal(built.counts.live, 35, 'the live snapshot should hold 35 courses');
        assert.ok(built.counts.presets >= 26, `only ${built.counts.presets} presets were read from course-data.js`);
        assert.equal(built.counts.attacks, 20, 'the Tier-B attack table has 20 rows');
        // Phase 1: each live record is two paths (write-back refused, fresh-key
        // create accepted), plus the two signed-out / gapi_ extras.
        assert.equal(built.counts.total, 2 * built.counts.live + built.counts.presets + built.counts.attacks + built.counts.extras);
    });

    test('the table asserts both verdicts, not only refusals', () => {
        // A table made only of `refuse` rows is satisfied by a rule that refuses
        // everything, including every real course.
        const allow = TABLE.filter((r) => r.verdict === 'allow');
        const refuse = TABLE.filter((r) => r.verdict === 'refuse');
        // Phase 1: A17 moved from allow to refuse ($other: false), so 3 / 17.
        assert.equal(allow.length, 3, 'three scenarios are deliberately allowed');
        assert.equal(refuse.length, 17, 'seventeen scenarios must be refused');
        allow.forEach((r) => assert.ok(r.why && r.why.length > 20,
            `${r.id} is allowed on purpose and must say why, or a later reader will "fix" it`));
    });

    test('every scenario passes against database.rules.json', () => {
        const { exitCode, output } = runTargaryen(RULES, dataPath);
        const m = output.match(/(\d+) failures? in (\d+) tests?/);
        assert.ok(m, `could not parse targaryen output:\n${output}`);
        const failures = parseInt(m[1], 10);
        const total = parseInt(m[2], 10);
        // targaryen counts every canWrite/cannotWrite entry, so >= the path count.
        assert.ok(total >= built.counts.total,
            `targaryen ran ${total} scenarios, expected at least ${built.counts.total}`);
        assert.equal(failures, 0,
            `${failures} of ${total} global_courses scenarios failed.\n`
            + 'Until the Tier-B rules land, 13 failures here are EXPECTED and are the\n'
            + 'reason this file was written first.\n' + output);
        assert.equal(exitCode, 0);
    });
});
