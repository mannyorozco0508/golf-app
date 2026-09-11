// ============================================================================
// AN IMPORTED COURSE KEY MUST MATCH ITS OWN PROVENANCE.
//
// admin.html keys an imported course as `gca_` + the provider's course id. That
// makes the key a pure function of the provider id - measured, 200 calls on one
// course produce one key - which is what stops four courses named "Legacy Golf
// Club" collapsing into a single permanent record, as they did under the old
// name-slug scheme.
//
// But NOTHING SERVER-SIDE ENFORCES IT. `$courseId` appears nowhere in the
// global_courses validate expression, so any key at all can be created as long
// as the record carries a name and eighteen holes. A loop, a typo in a future
// refactor, or a script written by someone who never read this can write
// `gca_anything`, and `.write: "newData.exists()"` means NO CLIENT CAN EVER
// DELETE IT.
//
// THE QUOTA USED TO BE AN ACCIDENTAL BRAKE ON THAT. At 35 requests a day a
// runaway ran out of road before it did much damage. The account is now Pro at
// 10,000 a day and that brake is gone, which is what makes this worth doing now
// rather than eventually.
//
// THE PROPOSED CLAUSE, and it is deliberately narrow:
//
//     a key beginning `gca_` must equal 'gca_' + source/providerCourseId
//
// ---------------------------------------------------------------------------
// TESTS FIRST. THE REAL database.rules.json IS NOT TOUCHED BY THIS FILE.
// ---------------------------------------------------------------------------
//
// Every run builds a TEMP COPY of the rules with the clause added and points
// targaryen at that. CLAUDE.md: never edit the real rules to run a control. If
// the clause is wrong, the only casualty is a temp file.
//
// THE CASE THAT MATTERS MOST IS THE MERGE, and it is measured rather than
// reasoned. The round publish writes `.update({name, data})`, and after an
// import that write lands on a `gca_` key - admin.html:3814 puts the key in the
// hidden select, :5607 reads it back. If Firebase evaluates `.validate` against
// only the written subtree rather than the merged record, that write carries no
// `source` and THE CLAUSE WOULD REFUSE EVERY EDIT TO EVERY IMPORTED COURSE.
//
// Firebase applies a multi-path update as writes to the CHILDREN, so the parent's
// validate should see the merge. "Should" is why this is a test. The scenario
// below writes to `global_courses/<key>/name` on an existing record, which is
// exactly that shape.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');
const REAL_RULES = path.join(REPO, 'database.rules.json');

// ---------------------------------------------------------------------------
// THE CLAUSE, ADDED TO A COPY.
//
// `beginsWith` and string concatenation are both RTDB rule primitives. The
// leading `!` means every key that is NOT gca_ short-circuits to true and is
// completely unconstrained - which is what makes the 36 live keys safe by
// construction rather than by luck.
// ---------------------------------------------------------------------------
const GCA_CLAUSE =
    "(!$courseId.beginsWith('gca_') || "
  + "$courseId === 'gca_' + newData.child('source/providerCourseId').val())";

// ADDS THE CLAUSE ONLY IF IT IS NOT ALREADY THERE.
//
// Before the clause shipped this always appended, because the real file never
// had it. Now it does, and appending a second copy would make the temp rules
// differ from what deploys - which the agreement assertion above would catch,
// but as a confusing failure rather than the real one.
function buildTempRules() {
    const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
    const node = rules.rules.global_courses.$courseId;
    if (node['.validate'].indexOf("beginsWith('gca_')") === -1) {
        node['.validate'] = '(' + node['.validate'] + ') && ' + GCA_CLAUSE;
    }
    const p = path.join(os.tmpdir(), 'gca-rules-' + process.pid + '.json');
    fs.writeFileSync(p, JSON.stringify(rules, null, 2));
    return p;
}

// ---------------------------------------------------------------------------
// THE 36 LIVE KEYS. 35 from the committed snapshot plus zz_scratch_probe, which
// was created after that snapshot was taken and is the one record Manny
// specifically wants proved - it has NO source node at all and it is already
// undeletable. A rule that made it harder to deal with would be the rule making
// an existing problem worse.
// ---------------------------------------------------------------------------
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(REPO, 'global_courses_snapshot.json'), 'utf8'));
const CARD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PROBE = { name: 'ZZ Scratch Probe', data: CARD };
const LIVE = Object.assign({}, SNAPSHOT, { zz_scratch_probe: PROBE });

// An imported record, shaped as buildImportRecord produces one.
const imported = (providerId, over) => Object.assign({
    name: 'Legacy Golf Resort',
    data: CARD,
    location: { address: '6808 S 32nd St, Phoenix, AZ 85042, USA', city: 'Phoenix', state: 'AZ' },
    tees: { male: [{ name: 'Copper', rating: 72.1, slope: 128, totalYards: 6768, parTotal: 71,
                     holes: CARD.map(h => ({ par: h.par, yardage: 400, hcpIndex: h.hcpIndex })) }],
            female: [] },
    source: { provider: 'golfcourseapi', providerCourseId: providerId,
              providerClubName: 'Legacy Golf Resort', importedAt: 1757600000000,
              siFrom: 'male/Copper' }
}, over || {});

function buildTests() {
    const tests = {};
    const root = { events: {}, trips: {}, tournaments: {}, app_settings: {},
                   global_courses: Object.assign({}, LIVE, {
                       // pre-existing imported record, for the merge scenarios
                       gca_bwcdmzcy: imported('bwcdmzcy')
                   }) };

    // ---- UNAFFECTED: all 36 live keys, written back exactly as they are ----
    Object.entries(LIVE).forEach(([id, rec]) => {
        tests['global_courses/' + id] = { canWrite: [{ auth: 'nobody', data: rec }] };
    });

    // ---- ACCEPTED ----
    tests['global_courses/gca_s21hccyk'] = { canWrite: [{ auth: 'nobody', data: imported('s21hccyk') }] };
    tests['global_courses/gca_5ngjj512'] = { canWrite: [{ auth: 'nobody', data: imported('5ngjj512') }] };

    // ---- THE MERGE CASE. Writes to CHILDREN of an existing gca_ record, which
    // is how Firebase applies .update({name, data}). ----
    tests['global_courses/gca_bwcdmzcy/name'] = { canWrite: [{ auth: 'nobody', data: 'Legacy Golf Resort (edited)' }] };
    tests['global_courses/gca_bwcdmzcy/data'] = { canWrite: [{ auth: 'nobody', data: CARD }] };

    // ---- REFUSED ----
    tests['global_courses/gca_mismatch1'] = { cannotWrite: [{ auth: 'nobody', data: imported('s21hccyk') }] };
    tests['global_courses/gca_nosource1'] = { cannotWrite: [{ auth: 'nobody', data: { name: 'No Source', data: CARD } }] };
    tests['global_courses/gca_emptyid1'] = { cannotWrite: [{ auth: 'nobody',
        data: imported('', { source: { provider: 'golfcourseapi', importedAt: 1 } }) }] };

    return { root, tests };
}

function runTargaryen(rulesPath, dataPath) {
    try {
        return { exitCode: 0,
                 output: execFileSync(TARGARYEN, [rulesPath, dataPath, '--verbose'], { encoding: 'utf8' }) };
    } catch (e) {
        return { exitCode: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
}

let RESULT = null;
let RULES_PATH = null;
let DATA_PATH = null;

before(() => {
    RULES_PATH = buildTempRules();
    const built = buildTests();
    DATA_PATH = path.join(os.tmpdir(), 'gca-tests-' + process.pid + '.json');
    fs.writeFileSync(DATA_PATH, JSON.stringify({
        root: built.root, users: { nobody: null }, tests: built.tests
    }, null, 1));
    RESULT = runTargaryen(RULES_PATH, DATA_PATH);
});

// ---------------------------------------------------------------------------
// PARSING TARGARYEN'S VERDICT TABLE.
//
// THE FIRST VERSION OF THIS MATCHED NOTHING, AND THE WHOLE FILE WENT GREEN ON
// IT. It looked for lines shaped `✗ some/path`, which targaryen does not print.
// What it actually prints is an ANSI-coloured box-drawing table:
//
//   │ global_courses/caledonia │ write │ null │ ✓ │ ✖ │
//
// So failedPaths() returned [] every time, and every assertion of the form
// "this path is NOT in the failed list" was TRUE OF AN EMPTY LIST - forty-five
// green tests proving nothing. That is CLAUDE.md's inert-assertion failure
// exactly, and it was caught only by forcing the rule to `false`, which must
// refuse everything, and watching the regex still return [].
//
// The parser now strips ANSI, splits each row on the box character, and reads
// the LAST cell - "Got" - which is ✖ on a failure. And the test below proves it
// fires, by running that same impossible rule and requiring a non-empty result.
// ---------------------------------------------------------------------------
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, '');

// A FAILURE IS Expect !== Got, NOT "Got IS ✖".
//
// The second bug in this function, and it only surfaced once the first was
// fixed. A `cannotWrite` scenario is SUPPOSED to come back denied - Expect ✖,
// Got ✖ - and reading the Got column alone counted all three of the
// deliberately-refused cases as failures. targaryen itself said "0 failures in
// 43 tests" while this function reported three. The table's own verdict is the
// comparison of the last two columns.
const TICK = '\u2713';
const CROSS = '\u2716';

function parseFailedPaths(output) {
    return stripAnsi(output).split('\n')
        .filter((l) => l.indexOf('\u2502') > -1)
        .map((l) => l.split('\u2502').map((c) => c.trim()).filter((c) => c !== ''))
        // Drops the header row, whose last two cells are "Expect" and "Got".
        .filter((cells) => cells.length >= 5
            && [TICK, CROSS].indexOf(cells[cells.length - 2]) > -1
            && [TICK, CROSS].indexOf(cells[cells.length - 1]) > -1)
        .filter((cells) => cells[cells.length - 2] !== cells[cells.length - 1])
        .map((cells) => cells[0]);
}
const failedPaths = () => parseFailedPaths((RESULT && RESULT.output) || '');

// The full table, so an assertion can say "this row says DENIED" rather than
// only "this row is not among the failures" - an absence is what an empty
// parser returns, and that is how the first version of this file went green.
function verdictRows() {
    const out = {};
    stripAnsi((RESULT && RESULT.output) || '').split('\n')
        .filter((l) => l.indexOf('\u2502') > -1)
        .map((l) => l.split('\u2502').map((c) => c.trim()).filter((c) => c !== ''))
        .filter((c) => c.length >= 5
            && [TICK, CROSS].indexOf(c[c.length - 2]) > -1
            && [TICK, CROSS].indexOf(c[c.length - 1]) > -1)
        .forEach((c) => { out[c[0]] = { expect: c[c.length - 2], got: c[c.length - 1] }; });
    return out;
}

describe('THE HARNESS IS REALLY RUNNING', () => {

    test('targaryen ran and produced output', () => {
        assert.ok(RESULT, 'the before hook did not run');
        assert.ok((RESULT.output || '').length > 40,
            'targaryen produced almost nothing, so every assertion below would be reading an '
            + 'empty string: ' + JSON.stringify((RESULT.output || '').slice(0, 200)));
    });

    // THIS ASSERTION TURNED AROUND WHEN THE CLAUSE SHIPPED, AND THAT IS WHY IT
    // IS WORTH EXPLAINING RATHER THAN JUST EDITING.
    //
    // While the clause was unapproved it read: the temp copy must carry it, and
    // database.rules.json must NOT. That was a guard against the single most
    // tempting shortcut available in this repo - editing a protected, DEPLOYED
    // rules file to make a red test go green. It would have gone red by name if
    // anyone had.
    //
    // The clause is now approved and landed, so "the real file must not carry
    // it" is backwards: it would fail on correct code. What the assertion
    // becomes is the other half of the same idea - the temp copy the tests
    // measure and the file that actually deploys must agree. A temp copy that
    // drifted from the deployed rules would mean these 46 tests were measuring
    // something nobody runs.
    test('the temp copy and the REAL file both carry the clause, and agree', () => {
        const temp = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
        const real = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
        const t = temp.rules.global_courses.$courseId['.validate'];
        const r = real.rules.global_courses.$courseId['.validate'];
        assert.match(t, /beginsWith\('gca_'\)/,
            'the temp copy does not carry the clause, so this run is measuring the old rules');
        assert.match(r, /beginsWith\('gca_'\)/,
            'database.rules.json no longer carries the clause. Either it was reverted, or a '
            + 'deploy went out without it - and gca_ keys are unenforced again.');
        assert.equal(t, r,
            'the temp copy and the deployed rules have DRIFTED. These tests would be measuring '
            + 'an expression nobody runs.\n  temp: ' + t + '\n  real: ' + r);
    });

    test('THE VERDICT PARSER ACTUALLY FIRES - proved against an impossible rule', () => {
        // Without this, every "path X is not in the failed list" assertion in
        // this file is true of an empty list. An earlier parser returned []
        // unconditionally and the whole file passed on it.
        const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
        rules.rules.global_courses.$courseId['.validate'] = 'false';
        const rp = path.join(os.tmpdir(), 'gca-impossible-' + process.pid + '.json');
        fs.writeFileSync(rp, JSON.stringify(rules, null, 2));
        const res = runTargaryen(rp, DATA_PATH);
        const failed = parseFailedPaths(res.output);
        assert.notEqual(res.exitCode, 0,
            'a rule of `false` did not fail any scenario, so targaryen is not evaluating '
            + 'these rules at all');
        assert.ok(failed.length > 0,
            'a rule that refuses EVERYTHING produced an empty failed-path list. The parser '
            + 'cannot see targaryen\'s verdicts, and every assertion in this file that reads '
            + 'that list is inert.');
        assert.ok(failed.includes('global_courses/caledonia'),
            'the parser found failures but not the one it must: got ' + JSON.stringify(failed.slice(0, 5)));
        fs.unlinkSync(rp);
    });

    test('the corpus is the real 36, not a sample', () => {
        assert.equal(Object.keys(LIVE).length, 36,
            `only ${Object.keys(LIVE).length} live keys in the corpus. A rule that breaks a `
            + 'working course is worse than the gap it closes, and a sample is how the one with '
            + 'the unusual name gets missed.');
        assert.ok(LIVE.zz_scratch_probe, 'zz_scratch_probe is not in the corpus');
    });
});

describe('THE MERGE CASE - MEASURED, NOT REASONED', () => {

    // If this fails, the clause as written would refuse every edit to every
    // imported course and MUST be redesigned before it goes near the real file.
    test('a {name, data} update onto an EXISTING gca_ record is ACCEPTED', () => {
        const failed = failedPaths();
        const broke = failed.filter(p => p.includes('gca_bwcdmzcy'));
        assert.deepEqual(broke, [],
            'WRITING A CHILD OF AN EXISTING gca_ RECORD WAS REFUSED. That means Firebase '
            + 'evaluates .validate against only the written subtree, not the merged record - '
            + 'so the round publish, which writes {name, data} to the gca_ key after an '
            + 'import (admin.html:3814 sets it, :5607 reads it), would be refused for every '
            + 'imported course. THE CLAUSE NEEDS REDESIGNING BEFORE IT GOES NEAR THE REAL '
            + 'FILE.\n  refused: ' + JSON.stringify(broke));
    });
});

describe('EVERY LIVE KEY IS UNAFFECTED - ALL 36', () => {

    Object.keys(LIVE).forEach((id) => {
        test(`${id} still writes back cleanly`, () => {
            const failed = failedPaths();
            assert.ok(!failed.includes('global_courses/' + id),
                `${id} is a course that works today and the clause refused it. A rule that `
                + 'breaks a working course is worse than the gap it closes.');
        });
    });

    test('zz_scratch_probe specifically - it has NO source and is already undeletable', () => {
        // Called out separately because it is the record with the least to lose
        // and the most already wrong with it. The clause must not be the reason
        // it becomes harder to deal with than it already is.
        assert.ok(!('source' in PROBE), 'the probe fixture has gained a source node');
        assert.ok(!failedPaths().includes('global_courses/zz_scratch_probe'),
            'the clause refused zz_scratch_probe. It carries no source, it cannot be deleted '
            + 'by any client, and making it unwritable as well would leave it in a worse state '
            + 'than the gap this rule closes.');
    });
});

describe('gca_ KEYS ARE HELD TO THEIR OWN PROVENANCE', () => {

    test('a matching providerCourseId is ACCEPTED', () => {
        const failed = failedPaths();
        ['gca_s21hccyk', 'gca_5ngjj512'].forEach((k) => {
            assert.ok(!failed.includes('global_courses/' + k),
                `${k} matches its own providerCourseId and was refused - the clause is too `
                + 'strict and would block real imports');
        });
    });

    test('a MISMATCHED providerCourseId is refused', () => {
        // Read off the table directly rather than inferred from the absence of a
        // failure: the row must say the write was DENIED, and the scenario must
        // agree that denial was expected.
        const rows = verdictRows();
        [['gca_mismatch1', 'a gca_ key whose providerCourseId names a different course'],
         ['gca_nosource1', 'a gca_ key with no source node at all'],
         ['gca_emptyid1', 'a gca_ key whose providerCourseId is empty']].forEach(([k, what]) => {
            const row = rows['global_courses/' + k];
            assert.ok(row, `${k} produced no verdict row - the scenario did not run`);
            assert.equal(row.got, CROSS, `${what} was ACCEPTED. The clause does not bind.`);
            assert.equal(row.expect, row.got, `${k}: expected ${row.expect}, got ${row.got}`);
        });
    });

    test('the whole scenario table agreed with targaryen', () => {
        // The cannotWrite rows are verdicts in the data file; targaryen fails the
        // run if any disagrees. Exit code 0 means every accepted case was
        // accepted AND every refused case was refused.
        assert.equal(RESULT.exitCode, 0,
            'at least one scenario disagreed. This is the whole result - a refused case that '
            + 'was accepted means the clause does not bind; an accepted case that was refused '
            + 'means it breaks something real.\n' + (RESULT.output || '').slice(-2000));
    });

    test('AND A CLEAN CASE STILL PASSES, so this cannot be satisfied by refusing everything', () => {
        // CLAUDE.md's standing requirement for any guard: prove it is not a rule
        // that simply says no. The 36 live keys above are that proof at scale;
        // this names it so the reason survives.
        assert.ok(Object.keys(LIVE).length >= 36);
        assert.ok(!failedPaths().includes('global_courses/caledonia'),
            'a plain directory-keyed course was refused, so the clause is refusing everything '
            + 'rather than only malformed gca_ keys');
    });
});
