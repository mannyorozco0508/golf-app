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
//
// ============================================================================
// PHASE 1 (2026-10-17, rules/database.rules.phase1.json; Manny: "fix trips in
// the app now" - trips need no email sign-in; redeploy pending Manny's OK).
// ============================================================================
//
//   trips/$tripCode .write
//     auth != null && (
//       (!data.exists() && newData.exists() && newData.child('ownerUid').val() === auth.uid)
//       || (data.exists() && newData.exists() && (ownerUid === auth.uid
//            || (!data.hasChild('ownerUid') && ownerEmail === auth.token.email))))
//   .validate  newData.hasChildren(['ownerUid']) || newData.hasChildren(['ownerEmail'])
//
// What that does to the limits above, measured in the table below:
//   - NO TRIP IS EVER DELETED from a phone (newData.exists() in both arms):
//     D1 still refused, D2 (an empty trip) and X2 (the walkaround's second step)
//     are refused now. The two-write walkaround is CLOSED.
//   - A trip is its OWNER'S, by ownerUid - an anonymous session counts. A
//     signed-in stranger is refused (S1), so for an owned trip the rule now
//     BACKS the wave-3 gate rather than standing beside it; signed out is refused.
//   - CREATION needs ownerUid = the creator's uid in the payload. The app stamps
//     it on createTripBlank and in buildTrip's multi-path update (gps-features,
//     branch gps-trip-owner - not merged into this tree yet); the payloads
//     WITHOUT it (A3, A4: today's trip.html in this tree) are refused.
//   - X1 / X3 / X4 remain - but only for the trip's owner.
//   - X5 (a rounds-only node) is frozen outright: it has no owner.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const targaryen = require('targaryen');

const REPO = __dirname;
const RULES = path.join(REPO, 'database.rules.json');
const { runTargaryen: runTargaryenToFile } = require('./helpers/targaryen-run.js');

const OWNER = 'u-owner';
const ROOT = {
    trips: {
        // A trip with rounds in it - the thing that must not vanish in one write.
        LIVE: {
            name: 'Myrtle 2026', createdAt: 1, organizerToken: 'tok', ownerUid: OWNER,
            rounds: { RA: { label: 'Day 1', addedAt: 1 }, RB: { label: 'Day 2', addedAt: 2 } }
        },
        // A trip nobody has put anything in yet.
        EMPTY: { name: 'Just Created', createdAt: 1, ownerUid: OWNER },
        // Its own node, so the walkaround does not disturb LIVE.
        WALK: { name: 'Walkaround', createdAt: 1, ownerUid: OWNER, rounds: { RA: { label: 'Day 1', addedAt: 1 } } },
        // A MALFORMED TRIP: its only child is rounds. See X5.
        BARE: { rounds: { RA: { label: 'Day 1', addedAt: 1 } } }
    },
    events: { RA: { gameFormat: 'stroke', ownerUid: OWNER }, RB: { gameFormat: 'stroke', ownerUid: OWNER } },
    tournaments: {}, global_courses: {}, app_settings: {}
};
// Phase 1: the owner is an ANONYMOUS session (the app signs in anonymously at
// boot), so these rows prove no email sign-in is needed.
const anon = (uid) => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const USERS = { nobody: null, owner: anon(OWNER), stranger: anon('u-stranger') };

const buildTripUpdate = (stamp) => Object.assign({
    'trips/NEWB/name': 'Bandon', 'trips/NEWB/createdAt': 9, 'trips/NEWB/organizerToken': 'tok2',
    'trips/NEWB/rounds/RN': { label: 'Day 1', addedAt: 1 },
    'events/RN': { gameFormat: 'stroke', ownerUid: OWNER }
}, stamp ? { 'trips/NEWB/ownerUid': OWNER } : {});

// EVERY ROW NAMES ITS CALL SITE, or says plainly that it has none. A rule that
// refuses a write the app actually makes is worse than no rule. A row with
// `update` is a multi-path update at the root, run through targaryen's API (the
// CLI table takes one path per write).
const TABLE = [
    // --- the refusal this rule exists for ---------------------------------
    { id: 'D1', verdict: 'refuse', who: 'owner', what: 'delete a trip that HAS rounds',
      site: 'not a call site - no client does this; see limit 1 in the header',
      why: 'one write destroyed the name, every round pointer and the organizer token',
      path: 'trips/LIVE', data: null },
    { id: 'D2', verdict: 'refuse', who: 'owner', what: 'delete an EMPTY trip',
      site: 'no UI does this today',
      why: 'PHASE 1: no trip is deleted from a phone at all (newData.exists() in both arms). '
         + 'Was allowed so a mis-created trip could go; that is the Admin/server path now',
      path: 'trips/EMPTY', data: null },
    { id: 'D3', verdict: 'allow', who: 'owner', what: 'write a round pointer INTO an existing trip',
      site: 'admin.html:13101',
      why: 'THE CONTROL FOR A RULE THAT REFUSES EVERYTHING. A round saved with ?trip=CODE '
         + 'joins the trip here, from a different page entirely - by the trip owner',
      path: 'trips/LIVE/rounds/RC', data: { label: 'Day 3', addedAt: 3 } },

    // --- every real trip write the app performs ---------------------------
    { id: 'A1', verdict: 'allow', who: 'owner', what: 'create a whole trip in one set(), ownerUid stamped',
      site: 'trip.html:2052 createTripBlank (gps-trip-owner stamps ownerUid)',
      why: 'a rule that blocked creation would end the feature; an anonymous creator owns it',
      path: 'trips/NEWCODE',
      data: { name: 'Bandon', createdAt: 9, rounds: {}, organizerToken: 'tok2', ownerUid: OWNER } },
    { id: 'A2', verdict: 'allow', who: 'owner', what: 'buildTrip multi-path, ownerUid stamped: name, createdAt, token, a round pointer, the round',
      site: 'trip.html:1899 buildTrip (gps-trip-owner stamps ownerUid)',
      why: 'the planner writes the trip in pieces in ONE atomic update; one refused piece refuses the week',
      update: buildTripUpdate(true) },
    { id: 'A3', verdict: 'refuse', who: 'owner', what: 'createTripBlank WITHOUT ownerUid (today\'s trip.html in this tree)',
      site: 'trip.html:2052 createTripBlank, before gps-trip-owner',
      why: 'PHASE 1: a create must name its owner; the app fix stamps it',
      path: 'trips/NEWCODE2', data: { name: 'Bandon', createdAt: 9, rounds: {}, organizerToken: 'tok2' } },
    { id: 'A4', verdict: 'refuse', who: 'owner', what: 'buildTrip multi-path WITHOUT ownerUid',
      site: 'trip.html:1899 buildTrip, before gps-trip-owner',
      why: 'PHASE 1: the unstamped trip fails the create arm and the validate, so the whole update - rounds too - is refused',
      update: buildTripUpdate(false) },
    { id: 'A5', verdict: 'allow', who: 'owner', what: 'rename the trip',
      site: 'trip.html:2252',
      why: 'ONE CHILD, NOT THE TRIP - the owner corrects a name',
      path: 'trips/LIVE/name', data: 'Myrtle Beach 2026' },
    { id: 'A6', verdict: 'allow', who: 'owner', what: 'relabel a round already in the trip',
      site: 'trip.html:2299 linkRound',
      why: 'the only way to correct a day label',
      path: 'trips/LIVE/rounds/RA', data: { label: 'Day One, fixed' } },
    { id: 'A7', verdict: 'allow', who: 'owner', what: 'REMOVE a round pointer from a trip',
      site: 'trip.html:2347 removeRound',
      why: 'dropping a round from the week is legitimate and must stay possible - a child delete',
      path: 'trips/LIVE/rounds/RA', data: null },
    { id: 'A8', verdict: 'allow', who: 'owner', what: 'toggle whether a round counts',
      site: 'trip.html:2364 toggleRoundCounted',
      why: 'a rained-out day must be excludable; this write moves the money total',
      path: 'trips/LIVE/rounds/RA/countsTowardTrip', data: false },
    { id: 'A9', verdict: 'allow', who: 'owner', what: 'attach a tournament to a trip',
      site: 'tournament.html:2189',
      why: 'a DIFFERENT PRODUCT writing into a trip - the write most likely to be forgotten '
         + 'by anyone reasoning from trip.html alone',
      path: 'trips/LIVE/tournaments/T1', data: { label: 'Club Champs', addedAt: 4 } },

    // --- who: phase 1 makes the trip its owner's ----------------------------
    { id: 'S1', verdict: 'refuse', who: 'stranger', what: 'a signed-in stranger removes a round pointer',
      site: 'trip.html:2347 removeRound, from a follower\'s phone',
      why: 'PHASE 1: the trip is its owner\'s by ownerUid - the server now refuses what the wave-3 gate hides',
      path: 'trips/LIVE/rounds/RA', data: null },
    { id: 'S2', verdict: 'refuse', who: 'nobody', what: 'signed out, a stamped create',
      site: 'not a call site - every page signs in at boot',
      why: 'PHASE 1: every trip write needs a sign-in',
      path: 'trips/NEWCODE3', data: { name: 'Bandon', createdAt: 9, ownerUid: OWNER } },
    { id: 'S3', verdict: 'refuse', who: 'stranger', what: 'a stranger creates a trip naming SOMEONE ELSE as owner',
      site: 'not a call site - a hostile client',
      why: 'the create arm requires ownerUid to be the writer\'s own uid',
      path: 'trips/NEWCODE4', data: { name: 'Bandon', createdAt: 9, ownerUid: OWNER } },

    // --- the limits, asserted rather than described ------------------------
    { id: 'X1', verdict: 'allow', who: 'owner', what: 'WALKAROUND step 1: delete the whole rounds node',
      site: 'not a call site - a determined client',
      why: 'DOCUMENTED, NOT ENDORSED. A child delete the parent rule allows - for the OWNER only in phase 1. '
         + 'Asserted so the gap lives in the suite instead of only in a report.',
      path: 'trips/WALK/rounds', data: null },
    { id: 'X2', verdict: 'refuse', who: 'owner', what: 'WALKAROUND step 2: delete the now-empty trip',
      site: 'not a call site - the second half of the same bypass',
      why: 'PHASE 1 CLOSES THE WALKAROUND: no trip is deleted from a phone, empty or not.',
      path: 'trips/EMPTY', data: null },
    { id: 'X3', verdict: 'allow', who: 'owner', what: 'OVERWRITE a trip that has rounds with a valid empty one',
      site: 'not a call site - THE SHAPE A COLLIDING TRIP CODE TAKES',
      why: 'erases every round pointer as completely as a delete, and is not a delete, so no '
         + 'rule keyed on newData.exists() sees it. Phase 1 narrows it to the trip\'s owner (a colliding '
         + 'creator is a different uid and is refused); code-issuer.js made the collision unlikely.',
      path: 'trips/LIVE', data: { name: 'Myrtle 2026', createdAt: 1, ownerUid: OWNER } },
    { id: 'X5', verdict: 'refuse', who: 'owner', what: 'remove the LAST round pointer from a rounds-only trip',
      site: 'trip.html:2347 removeRound, on a node admin.html:13101 could once create',
      why: 'A KNOWN LIMIT. A trip whose ONLY child is rounds has no ownerUid, so in phase 1 it is FROZEN: '
         + 'no phone writes it (the create arm and the trip validate both need ownerUid). '
         + 'REAL TRIPS CANNOT REACH THIS: both creation paths write name and createdAt '
         + 'and now ownerUid. admin.html:13101 writes trips/<tripLinkCode>/rounds/<round> WITHOUT CHECKING '
         + 'THE TRIP EXISTS, and in phase 1 that write onto a missing trip is refused rather than '
         + 'creating an orphan. Removing an existing orphan is the Admin/server path. '
         + 'SEE ALSO: round_delete_rules_test.js, where row T1 is DEFERRED to a test.todo - '
         + 'one problem seen from both sides.',
      path: 'trips/BARE/rounds/RA', data: null },
    { id: 'X4', verdict: 'allow', who: 'owner', what: 'delete the organizerToken',
      site: 'not a call site - what made wave 3 a guardrail and not a boundary',
      why: 'strip the token and hasTripOrganizerAuthority() returns true for everybody again, '
         + 'because absent means legacy - but in phase 1 only the OWNER can strip it, and the rule '
         + 'still refuses everyone else\'s writes.',
      path: 'trips/LIVE/organizerToken', data: null }
];
const SINGLE = TABLE.filter((r) => !r.update);
const MULTI = TABLE.filter((r) => r.update);

function buildTestsData() {
    const tests = {};
    SINGLE.forEach((row) => {
        // Rows can share a path - X2 reuses EMPTY, A6/A7/S1 act on rounds/RA -
        // so entries are merged rather than silently overwriting each other.
        const entry = tests[row.path] || {};
        const bucket = row.verdict === 'refuse' ? 'cannotWrite' : 'canWrite';
        entry[bucket] = (entry[bucket] || []).concat([{ auth: row.who, data: row.data }]);
        tests[row.path] = entry;
    });
    return { root: ROOT, users: USERS, tests };
}

describe('trips/<code> — a trip with rounds cannot be deleted in one write', () => {

    const dataPath = path.join(os.tmpdir(), 'trip-delete-tests-' + process.pid + '.json');
    fs.writeFileSync(dataPath, JSON.stringify(buildTestsData(), null, 1));

    test('the table covers both verdicts and every real call site', () => {
        // A table of only refusals is satisfied by ".write": false, which would
        // stop anyone creating a trip at all.
        const refuse = TABLE.filter((r) => r.verdict === 'refuse');
        const allow = TABLE.filter((r) => r.verdict === 'allow');
        // Phase 1: the delete this rule is FOR (D1), the deletes phase 1 adds (D2,
        // X2), the unstamped creates (A3, A4), who (S1-S3), and the frozen orphan (X5).
        assert.deepEqual(refuse.map((r) => r.id).sort(), ['A3', 'A4', 'D1', 'D2', 'S1', 'S2', 'S3', 'X2', 'X5'].sort());
        // Was >= 14: phase 1 refuses the two empty-trip deletes (D2, X2) that were
        // allows, and the old single-piece buildTrip rows are one atomic row (A2).
        assert.ok(allow.length >= 11, `only ${allow.length} allow rows - the app has more to protect`);
        allow.forEach((r) => assert.ok(r.why && r.why.length > 15,
            `${r.id} is allowed on purpose and must say why, or a later reader will "fix" it`));
        // Every row standing for real app traffic must name its file:line.
        TABLE.filter((r) => /^A[0-9]$/.test(r.id) || r.id === 'D3').forEach((r) => {
            assert.match(r.site, /\.html:\d+/, `${r.id} must name its real call site`);
        });
    });

    test('all three writing pages are represented', () => {
        const sites = TABLE.map((r) => r.site).join(' ');
        ['trip.html:', 'admin.html:', 'tournament.html:'].forEach((p) => {
            assert.ok(sites.includes(p), `no row stands for a write from ${p}`);
        });
    });

    test('the limits of this rule are asserted, not just described', () => {
        const limits = TABLE.filter((r) => r.id.startsWith('X'));
        assert.equal(limits.length, 5,
            'the two-write walkaround, the overwrite, the token strip, and the rounds-only refusal');
        // X1, X3, X4 are gaps the rule does not CLOSE (owner-only now). X2 is the
        // walkaround's second step, which phase 1 DOES close. X5 is a frozen orphan.
        ['X1', 'X3', 'X4'].forEach((id) => assert.equal(
            limits.find((r) => r.id === id).verdict, 'allow',
            `${id} documents a gap this rule does not close; asserting it as refused would be a lie`));
        assert.equal(limits.find((r) => r.id === 'X2').verdict, 'refuse', 'phase 1 refuses every trip delete');
        ['X1', 'X3', 'X4'].forEach((id) => assert.equal(limits.find((r) => r.id === id).who, 'owner',
            `${id} is open to the OWNER only in phase 1`));
        const x5 = limits.find((r) => r.id === 'X5');
        assert.equal(x5.verdict, 'refuse');
        assert.match(x5.why, /admin\.html:\d+/,
            'X5 must name the path that could create a rounds-only trip node');
        assert.match(x5.why, /name and createdAt/,
            'X5 must record why real trips cannot reach it, or a reader will think it is common');
        assert.match(x5.why, /round_delete_rules_test\.js/,
            'X5 must point at the deferred T1 row that is the other half of this question');
        const x3 = limits.find((r) => r.id === 'X3');
        assert.match(x3.site + ' ' + x3.why, /colliding|collision/i,
            'X3 must record that this is the shape a trip-code collision takes');
    });

    test('phase 1 BACKS the wave-3 organizer gate on an owned trip: the owner\'s writes pass, a stranger\'s are refused', () => {
        // Was: "this rule is NOT claimed to back up the wave-3 organizer gate" -
        // with ".write" keyed only on newData.exists(), a follower's removeRound
        // and toggleRoundCounted were both allowed. Phase 1 keys the trip on
        // ownerUid, so the same writes are the owner's (A7, A8) and a signed-in
        // stranger's removeRound is refused (S1).
        const by = (id) => TABLE.find((r) => r.id === id);
        assert.equal(by('A7').verdict, 'allow'); assert.equal(by('A7').who, 'owner');
        assert.equal(by('A8').verdict, 'allow'); assert.equal(by('A8').who, 'owner');
        assert.equal(by('S1').verdict, 'refuse'); assert.equal(by('S1').who, 'stranger');
        assert.equal(by('S1').path, by('A7').path, 'the same write, a different uid');
    });

    test('every scenario passes against database.rules.json', () => {
        const { exitCode, output } = runTargaryenToFile(RULES, dataPath);
        const m = output.match(/(\d+) failures? in (\d+) tests?/);
        assert.ok(m, `could not parse targaryen output:\n${output}`);
        assert.equal(parseInt(m[1], 10), 0, `scenarios failed:\n${output}`);
        assert.equal(parseInt(m[2], 10), SINGLE.length,
            `${m[2]} scenarios ran but the table has ${SINGLE.length} single-path rows`);
        assert.equal(exitCode, 0);
        // The multi-path rows (buildTrip), through the API.
        const rules = JSON.parse(fs.readFileSync(RULES, 'utf8'));
        assert.equal(MULTI.length, 2);
        MULTI.forEach((row) => {
            const got = targaryen.database(rules, ROOT).as(USERS[row.who]).update('/', row.update).allowed;
            assert.equal(got, row.verdict === 'allow', `${row.id} (${row.what}): expected ${row.verdict}`);
        });
        // And the stamped create is the anonymous creator's own: a stranger's
        // session sending the same stamped multi-path is refused.
        assert.equal(targaryen.database(rules, ROOT).as(USERS.stranger).update('/', buildTripUpdate(true)).allowed, false);
        assert.equal(targaryen.database(rules, ROOT).as(null).update('/', buildTripUpdate(true)).allowed, false, 'signed out');
    });

    test('the deployed rule is the one this file was written against', () => {
        // A hash would go stale on any unrelated edit; the clause itself is the
        // thing that matters. Was: "newData.exists() || !data.hasChild('rounds')".
        // Phase 1 (2026-10-17, trips with no email sign-in; redeploy pending
        // Manny's OK): owner by ownerUid, no trip delete.
        const rules = JSON.parse(fs.readFileSync(RULES, 'utf8'));
        assert.equal(rules.rules.trips.$tripCode['.write'],
            "auth != null && ((!data.exists() && newData.exists() && newData.child('ownerUid').val() === auth.uid) || (data.exists() && newData.exists() && (data.child('ownerUid').val() === auth.uid || (!data.hasChild('ownerUid') && data.child('ownerEmail').val() === auth.token.email))))",
            'the trips write rule is not the clause this file pins');
        assert.equal(rules.rules.trips.$tripCode['.validate'], "newData.hasChildren(['ownerUid']) || newData.hasChildren(['ownerEmail'])");
    });
});
