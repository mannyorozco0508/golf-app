// ============================================================================
// A TRIP WITH ROUNDS IN IT MUST NOT BE DELETABLE IN ONE WRITE.
//
// Until this landed, trips/$tripCode was literally ".write": true and
// .validate explicitly permitted deletion - "newData.hasChildren() ||
// newData.val() === null". One write destroyed a week: the name, the round
// pointers, the organizer token, everything. The trip code is six characters,
// the repo is public, and the recap card prints the code on the image people
// screenshot.
//
// THE RULE THIS FILE PINS, the events idiom with one word changed:
//     ".write": "newData.exists() || !data.hasChild('rounds')"
// Delete a trip nobody has put a round in: allowed, so a mis-created trip can
// still go. Delete a trip with rounds: refused.
//
// ============================================================================
// READ THIS BEFORE CONCLUDING "TRIPS ARE PROTECTED NOW". THEY ARE NOT.
// ============================================================================
//
// 1. THIS GUARDS AN ACTION NO CLIENT PERFORMS. Every trips write path the app
//    can emit was enumerated from source - trip.html, admin.html and
//    tournament.html all write into trips/ - and NONE of them is a whole-trip
//    delete. The only .remove() on trips/ anywhere is trip.html:1132, and that
//    is a round POINTER. So the write this rule refuses is a console or hostile
//    one, not a mis-tap.
//
//    THAT IS A WEAKER JUSTIFICATION THAN RULE A ON EVENTS, and the difference
//    is worth keeping straight. There, a button every golfer could see issued
//    the destroying write - a playing partner read "End & Wipe" as "finish MY
//    card" and deleted the group's round. Here, nothing in the product can do
//    it. This rule closes a wide-open node on a public repo, which is worth
//    doing on its own; it does not stop an accident anybody has had.
//
// 2. IT DOES NOT BACK UP THE WAVE-3 ORGANIZER GATE. Measured, not assumed:
//    hasTripOrganizerAuthority was stubbed to always grant, a follower arrived
//    cold on a plain trip link and pressed the controls, and the two writes the
//    client issued -
//        remove trips/<code>/rounds/<round>
//        set    trips/<code>/rounds/<round>/countsTowardTrip
//    - were put to this rule as "must refuse". Both were ALLOWED, 2 failures in
//    2 tests. For any CHILD write, newData at $tripCode still exists, so the
//    guard clause is never reached.
//
//    The two protect different things and neither is the other's second layer:
//        the wave-3 gate   stops a follower removing a round pointer
//        this rule         stops a whole-trip delete
//    A comment claiming defence in depth here would be exactly the decoration
//    CLAUDE.md warns about - a second guard that never fires on the first
//    guard's cases is indistinguishable from one that does not work.
//
// 3. X3 IS THE DESTRUCTION PATH THAT ACTUALLY MATTERS FOR TRIPS, and this rule
//    does not touch it. A PUT of { name, createdAt } over a trip that has
//    rounds erases every round pointer as completely as a delete, passes
//    .validate, and no rule keyed on newData.exists() can see it - newData
//    EXISTS, it is merely missing children. That is the shape a COLLIDING TRIP
//    CODE takes, which is why code-issuer.js exists; it is not the shape this
//    rule blocks.
//
// 4. AND IT CAUSES ONE REFUSAL IT DOES NOT WANT. Removing the LAST round from a
//    trip whose ONLY child is rounds empties the node, and then BOTH clauses
//    fail - newData.exists() is false and !data.hasChild('rounds') is false too.
//    Real trips cannot reach it, because both creation paths write name and
//    createdAt. admin.html:5415 can, because it writes a round pointer without
//    checking the trip exists. X5 pins it.
//
//    RTDB CANNOT TELL THE TWO WRITES APART at $tripCode - a whole-trip delete
//    and a last-round removal both end with newData not existing there. The
//    events rule has no equivalent problem only because a round keeps
//    gameFormat, players and courseData, so deleting scores never empties it.
//
// The limits are asserted below as X1-X5 rather than described, so they live in
// the suite instead of only in a report nobody re-reads. X1-X4 are gaps the rule
// does not CLOSE; X5 is a refusal it does not WANT, and the tests pin those two
// kinds separately so neither can be quietly turned into the other.
//
// FIFTEEN OF THE SIXTEEN ROWS PASSED BEFORE THE RULE LANDED. They are here to
// catch the FIX, not the bug: trips/$tripCode was ".write": true, so anything
// that tightens it has to be shown not to break the nine real call sites.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const RULES = path.join(REPO, 'database.rules.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

const ROOT = {
    trips: {
        // A trip with rounds in it - the thing that must not vanish in one write.
        LIVE: {
            name: 'Myrtle 2026', createdAt: 1, organizerToken: 'tok',
            rounds: { RA: { label: 'Day 1', addedAt: 1 }, RB: { label: 'Day 2', addedAt: 2 } }
        },
        // A trip nobody has put anything in yet.
        EMPTY: { name: 'Just Created', createdAt: 1 },
        // Its own node, so the walkaround does not disturb LIVE.
        WALK: { name: 'Walkaround', createdAt: 1, rounds: { RA: { label: 'Day 1', addedAt: 1 } } },
        // A MALFORMED TRIP: its only child is rounds. See X5.
        BARE: { rounds: { RA: { label: 'Day 1', addedAt: 1 } } }
    },
    events: { RA: { gameFormat: 'stroke' }, RB: { gameFormat: 'stroke' } },
    tournaments: {}, global_courses: {}, app_settings: {}
};

// EVERY ROW NAMES ITS CALL SITE, or says plainly that it has none. A rule that
// refuses a write the app actually makes is worse than no rule.
const TABLE = [
    // --- the refusal this rule exists for ---------------------------------
    { id: 'D1', verdict: 'refuse', what: 'delete a trip that HAS rounds',
      site: 'not a call site - no client does this; see limit 1 in the header',
      why: 'one write destroyed the name, every round pointer and the organizer token',
      path: 'trips/LIVE', data: null },

    // --- and the two that keep it from being a rule that just says no ------
    { id: 'D2', verdict: 'allow', what: 'delete an EMPTY trip',
      site: 'no UI does this today; kept legal so a mis-created trip can still go',
      why: 'the empty case is the one a delete is legitimately for, exactly as on events',
      path: 'trips/EMPTY', data: null },
    { id: 'D3', verdict: 'allow', what: 'write a round pointer INTO an existing trip',
      site: 'admin.html:5415',
      why: 'THE CONTROL FOR A RULE THAT REFUSES EVERYTHING. A round saved with ?trip=CODE '
         + 'joins the trip here, from a different page entirely',
      path: 'trips/LIVE/rounds/RC', data: { label: 'Day 3', addedAt: 3 } },

    // --- every real trip write the app performs ---------------------------
    { id: 'A1', verdict: 'allow', what: 'create a whole trip in one set()',
      site: 'trip.html:927 createTripBlank',
      why: 'a rule that blocked creation would end the feature',
      path: 'trips/NEWCODE',
      data: { name: 'Bandon', createdAt: 9, rounds: {}, organizerToken: 'tok2' } },
    { id: 'A2', verdict: 'allow', what: 'buildTrip multi-path: the trip name',
      site: 'trip.html:840', why: 'the planner writes the trip in pieces, not as one object',
      path: 'trips/NEWCODE/name', data: 'Bandon' },
    { id: 'A3', verdict: 'allow', what: 'buildTrip multi-path: createdAt',
      site: 'trip.html:841', why: 'same multi-path update as A2',
      path: 'trips/NEWCODE/createdAt', data: 9 },
    { id: 'A4', verdict: 'allow', what: 'buildTrip multi-path: the organizer token',
      site: 'trip.html:842',
      why: 'wave 3 mints this at creation; a rule that blocked it would lock every new trip',
      path: 'trips/NEWCODE/organizerToken', data: 'tok2' },
    { id: 'A5', verdict: 'allow', what: 'buildTrip multi-path: a round pointer',
      site: 'trip.html:864', why: 'the planner creates a trip and its rounds in one update',
      path: 'trips/NEWCODE/rounds/RA', data: { label: 'Day 1', addedAt: 1 } },
    { id: 'A6', verdict: 'allow', what: 'relabel a round already in the trip',
      site: 'trip.html:1109 linkRound',
      why: 'the only way to correct a day label',
      path: 'trips/LIVE/rounds/RA', data: { label: 'Day One, fixed' } },
    { id: 'A7', verdict: 'allow', what: 'REMOVE a round pointer from a trip',
      site: 'trip.html:1132 removeRound',
      why: 'dropping a round from the week is legitimate and must stay possible - and note '
         + 'this is a child delete, which is why this rule cannot see it',
      path: 'trips/LIVE/rounds/RA', data: null },
    { id: 'A8', verdict: 'allow', what: 'toggle whether a round counts',
      site: 'trip.html:1149 toggleRoundCounted',
      why: 'a rained-out day must be excludable; this write moves the money total',
      path: 'trips/LIVE/rounds/RA/countsTowardTrip', data: false },
    { id: 'A9', verdict: 'allow', what: 'attach a tournament to a trip',
      site: 'tournament.html:2189',
      why: 'a DIFFERENT PRODUCT writing into a trip - the write most likely to be forgotten '
         + 'by anyone reasoning from trip.html alone',
      path: 'trips/LIVE/tournaments/T1', data: { label: 'Club Champs', addedAt: 4 } },

    // --- the limits, asserted rather than described ------------------------
    { id: 'X1', verdict: 'allow', what: 'WALKAROUND step 1: delete the whole rounds node',
      site: 'not a call site - a determined client',
      why: 'DOCUMENTED, NOT ENDORSED. A child delete, and this rule cannot see it. Asserted '
         + 'so the bypass lives in the suite instead of only in a report.',
      path: 'trips/WALK/rounds', data: null },
    { id: 'X2', verdict: 'allow', what: 'WALKAROUND step 2: delete the now-empty trip',
      site: 'not a call site - the second half of the same bypass',
      why: 'the cost of destroying a trip goes from one write to two. It does not become '
         + 'impossible, and it is not meant to.',
      path: 'trips/EMPTY', data: null },
    { id: 'X3', verdict: 'allow', what: 'OVERWRITE a trip that has rounds with a valid empty one',
      site: 'not a call site - THE SHAPE A COLLIDING TRIP CODE TAKES',
      why: 'erases every round pointer as completely as a delete, and is not a delete, so no '
         + 'rule keyed on newData.exists() sees it. This is the destruction path that actually '
         + 'matters for trips; code-issuer.js made it unlikely, this rule does not touch it.',
      path: 'trips/LIVE', data: { name: 'Myrtle 2026', createdAt: 1 } },
    { id: 'X5', verdict: 'refuse', what: 'remove the LAST round pointer from a rounds-only trip',
      site: 'trip.html:1132 removeRound, on a node admin.html:5415 can create',
      why: 'A KNOWN LIMIT, AND A REFUSAL THIS RULE DOES NOT WANT. Removing the last round from '
         + 'a trip whose ONLY child is rounds empties the whole node, so newData.exists() is '
         + 'false at $tripCode AND !data.hasChild(\'rounds\') is false - both clauses fail and the '
         + 'write is refused, leaving an orphan nobody can clear. '
         + 'REAL TRIPS CANNOT REACH THIS: both creation paths write name and createdAt '
         + '(trip.html:840-841 buildTrip, trip.html:927 createTripBlank), so trips/<code> always '
         + 'has other children and removing a round can never empty it - measured, name+createdAt '
         + '+rounds and name+createdAt+token+rounds both ALLOW the same delete. '
         + 'THE PATH THAT CAN reach it is admin.html:5415, which writes '
         + 'trips/<tripLinkCode>/rounds/<round> WITHOUT CHECKING THE TRIP EXISTS - a hand-edited '
         + '?trip= URL, or a trip deleted between round setup and save, creates a node whose only '
         + 'child is rounds. '
         + 'RTDB CANNOT DISTINGUISH THE TWO WRITES at $tripCode: a whole-trip delete and a '
         + 'last-round removal both end with newData not existing there. That is why the events '
         + 'rule has no equivalent problem - a round always keeps gameFormat, players and '
         + 'courseData, so deleting scores never empties it. Asserted as REFUSE because that is '
         + 'what the rule does, not what it should do. '
         + 'SEE ALSO: round_delete_rules_test.js, where row T1 asserts this same write must be '
         + 'ALLOWED and is DEFERRED to a test.todo for exactly this reason. That todo carries '
         + 'the open question in full, including the untested candidate fix - a .validate '
         + 'requiring a name when the node has rounds, refusing the malformed CREATE rather '
         + 'than the removal afterwards. The two rows are one problem seen from both sides and '
         + 'neither is complete alone.',
      path: 'trips/BARE/rounds/RA', data: null },
    { id: 'X4', verdict: 'allow', what: 'delete the organizerToken, re-opening the trip',
      site: 'not a call site - what makes wave 3 a guardrail and not a boundary',
      why: 'strip the token and hasTripOrganizerAuthority() returns true for everybody again, '
         + 'because absent means legacy. Asserted so nobody later calls that gate enforced.',
      path: 'trips/LIVE/organizerToken', data: null }
];

function buildTestsData() {
    const tests = {};
    TABLE.forEach((row) => {
        // Rows can share a path - X2 reuses EMPTY, A6/A7 both act on rounds/RA -
        // so entries are merged rather than silently overwriting each other.
        const entry = tests[row.path] || {};
        const bucket = row.verdict === 'refuse' ? 'cannotWrite' : 'canWrite';
        entry[bucket] = (entry[bucket] || []).concat([{ auth: 'nobody', data: row.data }]);
        tests[row.path] = entry;
    });
    return { root: ROOT, users: { nobody: null }, tests };
}

function runTargaryen(rulesPath, dataPath) {
    try {
        return { exitCode: 0, output: execFileSync(TARGARYEN, [rulesPath, dataPath], { encoding: 'utf8' }) };
    } catch (e) {
        return { exitCode: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
}

describe('trips/<code> — a trip with rounds cannot be deleted in one write', () => {

    const dataPath = path.join(os.tmpdir(), 'trip-delete-tests-' + process.pid + '.json');
    fs.writeFileSync(dataPath, JSON.stringify(buildTestsData(), null, 1));

    test('the table covers both verdicts and every real call site', () => {
        // A table of only refusals is satisfied by ".write": false, which would
        // stop anyone creating a trip at all.
        const refuse = TABLE.filter((r) => r.verdict === 'refuse');
        const allow = TABLE.filter((r) => r.verdict === 'allow');
        // Two refusals: the one this rule is FOR (D1) and the one it causes by
        // accident (X5). They are counted together deliberately - a table that
        // pretended there was only one would be hiding the second.
        assert.equal(refuse.length, 2, 'D1, the delete this rule is for, and X5, the one it causes');
        assert.ok(refuse.some((r) => r.id === 'D1') && refuse.some((r) => r.id === 'X5'));
        assert.ok(allow.length >= 14, `only ${allow.length} allow rows - the app has more to protect`);
        allow.forEach((r) => assert.ok(r.why && r.why.length > 15,
            `${r.id} is allowed on purpose and must say why, or a later reader will "fix" it`));
        // Every row standing for real app traffic must name its file:line.
        TABLE.filter((r) => /^A[0-9]$/.test(r.id) || r.id === 'D3').forEach((r) => {
            assert.match(r.site, /\.html:\d+/, `${r.id} must name its real call site`);
        });
    });

    test('all three writing pages are represented', () => {
        // trip.html, admin.html and tournament.html all write into trips/.
        // Reasoning from trip.html alone misses two of them, and a rule that
        // refused either would break a real workflow silently.
        const sites = TABLE.map((r) => r.site).join(' ');
        ['trip.html:', 'admin.html:', 'tournament.html:'].forEach((p) => {
            assert.ok(sites.includes(p), `no row stands for a write from ${p}`);
        });
    });

    test('the limits of this rule are asserted, not just described', () => {
        const limits = TABLE.filter((r) => r.id.startsWith('X'));
        assert.equal(limits.length, 5,
            'the two-write walkaround, the overwrite, the token strip, and the rounds-only refusal');
        // X1-X4 are gaps the rule does not CLOSE. X5 is the opposite kind of limit:
        // a refusal the rule does not WANT. Asserting either as the other would be a
        // lie, so the verdicts are pinned separately.
        ['X1', 'X2', 'X3', 'X4'].forEach((id) => assert.equal(
            limits.find((r) => r.id === id).verdict, 'allow',
            `${id} documents a gap this rule does not close; asserting it as refused would be a lie`));
        const x5 = limits.find((r) => r.id === 'X5');
        assert.equal(x5.verdict, 'refuse',
            'X5 is a write the app makes and this rule refuses; pretending otherwise hides it');
        assert.match(x5.why, /admin\.html:5415/,
            'X5 must name the path that can actually create a rounds-only trip node');
        assert.match(x5.why, /name and createdAt/,
            'X5 must record why real trips cannot reach it, or a reader will think it is common');
        // The two halves of this question live in different files. If either link
        // is dropped, the other half becomes unfindable.
        assert.match(x5.why, /round_delete_rules_test\.js/,
            'X5 must point at the deferred T1 row that is the other half of this question');
        // X3 is the one that matters most; pin that the row says so somewhere.
        // Asserted across site AND why deliberately: which field carries the fact
        // is a formatting choice, that the row carries it at all is not.
        const x3 = limits.find((r) => r.id === 'X3');
        assert.match(x3.site + ' ' + x3.why, /colliding|collision/i,
            'X3 must record that this is the shape a trip-code collision takes');
    });

    test('this rule is NOT claimed to back up the wave-3 organizer gate', () => {
        // Measured: with the UI gate stubbed silent, the two writes a follower's
        // client issues are BOTH allowed by this rule, because newData at
        // $tripCode still exists for any child write. A7 and A8 are those exact
        // writes, and they are asserted ALLOW - so this file can never be read as
        // claiming the rule covers them.
        const a7 = TABLE.find((r) => r.id === 'A7');
        const a8 = TABLE.find((r) => r.id === 'A8');
        assert.equal(a7.verdict, 'allow', 'removeRound is the wave-3 gate\'s job, not this rule\'s');
        assert.equal(a8.verdict, 'allow', 'toggleRoundCounted likewise');
    });

    test('every scenario passes against database.rules.json', () => {
        const { exitCode, output } = runTargaryen(RULES, dataPath);
        const m = output.match(/(\d+) failures? in (\d+) tests?/);
        assert.ok(m, `could not parse targaryen output:\n${output}`);
        assert.equal(parseInt(m[1], 10), 0, `scenarios failed:\n${output}`);
        assert.equal(parseInt(m[2], 10), TABLE.length,
            `${m[2]} scenarios ran but the table has ${TABLE.length} rows`);
        assert.equal(exitCode, 0);
    });

    test('the deployed rule is the one this file was written against', () => {
        // A hash would go stale on any unrelated edit; the clause itself is the
        // thing that matters, and naming it here means a silent loosening back to
        // ".write": true fails loudly rather than passing every scenario above by
        // being permissive.
        const rules = JSON.parse(fs.readFileSync(RULES, 'utf8'));
        assert.equal(rules.rules.trips.$tripCode['.write'],
            "newData.exists() || !data.hasChild('rounds')",
            'the trips write rule is not the clause this file pins');
    });
});
