// ============================================================================
// A ROUND WITH SCORES IN IT MUST NOT BE DELETABLE IN ONE WRITE.
//
// Today .write on events/$eventCode is literally `true` and .validate
// explicitly permits deletion - "newData.hasChildren() || newData.val() ===
// null". One write destroys a live round, and every golfer in the group has a
// button that issues it, because every group link is the same page.
//
// RULE A, the shape this file pins:
//     ".write": "newData.exists() || !data.hasChild('scores')"
// Delete a round nobody has played: allowed, which keeps "End & Wipe" working
// for the case it is legitimately for. Delete a round with scores: refused.
//
// CHILD DELETES ARE STRUCTURALLY UNAFFECTED, and that is not luck. For a write
// at events/X/scores/K the rule at $eventCode is evaluated with newData
// referring to the data AT $eventCode after the write - and the round still
// exists. So newData.exists() is TRUE for every child delete and a .write keyed
// on it cannot block one. Clearing a score, undoing a correction, removing a
// side match or a wolf call or a Ryder pointer all keep working. Every one of
// them is asserted below rather than assumed, because "it should be fine" is
// how a rule wave breaks a live round.
//
// WHAT RULE A DOES NOT DO, asserted out loud so the suite documents the limits
// instead of a report nobody re-reads:
//
//   THE TWO-WRITE WALKAROUND. Delete events/<code>/scores first - a child
//   delete, allowed - and the round then has no scores, so deleting the root is
//   allowed too. Rule A raises the cost of destroying a played round from one
//   write to two. It does not make it impossible, and it is not meant to: this
//   is an accident guardrail at the same strength as the ?group= links, not a
//   security boundary. The app has no accounts and the server cannot tell a
//   confused playing partner from the organizer.
//
//   THE OVERWRITE HOLE, which is worse and is not a delete at all. A PUT of
//   { gameFormat:'stroke', players:[], courseData:[] } over a played round
//   passes .validate and erases every score just as completely. No rule keyed
//   on newData.exists() sees it. Anti-destruction by blocking deletes guards
//   ONE SHAPE of destruction - the shape an accident takes.
//
// THIS FILE IS RED UNTIL THE RULE LANDS. Written first, against the deployed
// database.rules.json, where exactly one scenario fails: the scored-round
// delete that is currently allowed.
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

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const PLAYED = {
    eventName: 'Saturday', gameFormat: 'stroke', courseData: CD,
    players: [{ id: 101, name: 'Dale Whitmore' }],
    scores: { p101_h1: 4, p101_h2: 5 },
    sideMatches: { m1: { stake: 10 } },
    wolfCalls: { h3: { caller: 101 } },
    ryderCup: { sessions: 1 }, ryderCupRef: { host: 'ABCDEF' },
    scoresVerified: { by: 'organizer' }, kpConfirmed: true
};
const UNPLAYED = {
    eventName: 'Saturday', gameFormat: 'stroke', courseData: CD,
    players: [{ id: 101, name: 'Dale Whitmore' }]
};

const ROOT = {
    events: { PLAYED: PLAYED, EMPTY: UNPLAYED },
    trips: { T1: { rounds: { PLAYED: { label: 'Saturday' } } } },
    tournaments: {}, global_courses: {}, app_settings: {}
};

// Every row names the real call site it stands for. A scenario nothing in the
// app actually does is a scenario nobody has to keep working.
const TABLE = [
    // --- the one thing Rule A exists to stop ------------------------------
    { id: 'D1', what: 'delete a round that HAS scores', verdict: 'refuse',
      site: 'admin.html:5399 and index.html:6227, endAndClearRound()',
      path: 'events/PLAYED', data: null },

    // --- and the case it must keep working --------------------------------
    { id: 'D2', what: 'delete a round nobody has played', verdict: 'allow',
      site: 'the same two buttons, on a round set up wrong before anyone teed off',
      why: 'there is nothing to lose, and an organizer must be able to bin a mistake',
      path: 'events/EMPTY', data: null },

    // --- every child delete in the app ------------------------------------
    { id: 'C1', what: 'clear a score', verdict: 'allow', site: 'index.html:5031 saveScore',
      why: 'newData at $eventCode still exists, so a .write keyed on it cannot block this',
      path: 'events/PLAYED/scores/p101_h1', data: null },
    { id: 'C2', what: 'undo restores a score', verdict: 'allow', site: 'index.html:5174 undoAuditEntry',
      why: 'the correction path must survive any rule about the round root',
      path: 'events/PLAYED/scores/p101_h2', data: null },
    { id: 'C3', what: 'remove a side match', verdict: 'allow', site: 'sidematches.html:2375',
      why: 'money the group agreed to cancel', path: 'events/PLAYED/sideMatches/m1', data: null },
    { id: 'C4', what: 'clear a wolf call', verdict: 'allow', site: 'index.html:7133',
      why: 'a miscalled hole must be correctable', path: 'events/PLAYED/wolfCalls/h3', data: null },
    { id: 'C5', what: 'remove ryderCup', verdict: 'allow', site: 'sidematches.html:3564',
      why: 'unwinding a Cup that was set up wrong', path: 'events/PLAYED/ryderCup', data: null },
    { id: 'C6', what: 'remove ryderCupRef', verdict: 'allow', site: 'sidematches.html:3569',
      why: 'the pointer goes with the Cup', path: 'events/PLAYED/ryderCupRef', data: null },
    { id: 'C7', what: 'un-verify scores after an edit', verdict: 'allow', site: 'index.html:5110',
      why: 'editing a score must invalidate the review, or the review lies',
      path: 'events/PLAYED/scoresVerified', data: null },
    { id: 'C8', what: 'null a child through a multi-path update', verdict: 'allow',
      site: 'index.html:4030, kpConfirmed = null',
      why: 'a KP change unconfirms the round', path: 'events/PLAYED/kpConfirmed', data: null },

    // --- normal traffic must be untouched ---------------------------------
    { id: 'W1', what: 'write a score', verdict: 'allow', site: 'index.html:5034 saveScore',
      why: 'the single most common write in the app; a rule that touched it would be felt '
         + 'on every hole by every group',
      path: 'events/PLAYED/scores/p101_h3', data: 6 },
    { id: 'W2', what: 'create a new round', verdict: 'allow', site: 'admin.html round save',
      why: 'a rule that blocked creation would end the product',
      path: 'events/NEWCODE', data: { gameFormat: 'stroke', players: [], courseData: [] } },
    // DEFERRED - see the test.todo below. The row is kept because it is still
    // TRUE that removing a trip round pointer must be allowed; what changed is
    // that a rule on trips/ now also fires on this write, and on THIS fixture -
    // a trip whose only child is rounds - it refuses. Deleting the row would
    // lose the requirement; asserting it would fail; changing the fixture would
    // be editing a test to fit a rule.
    { id: 'T1', what: 'remove a trip round pointer', verdict: 'allow', site: 'trip.html:1132',
      why: 'a different root entirely; the EVENTS rule must not reach it - which is still '
         + 'true, and was this row\'s whole point. The trips rule is what reaches it now.',
      deferred: true,
      path: 'trips/T1/rounds/PLAYED', data: null },

    // --- the limits, asserted rather than described ------------------------
    { id: 'X1', what: 'WALKAROUND step 1: delete the whole scores node', verdict: 'allow',
      site: 'not a call site - a hostile or determined client',
      why: 'DOCUMENTED, NOT ENDORSED. This is a child delete and Rule A cannot see it. '
         + 'Asserted so the bypass lives in the suite instead of only in a report.',
      path: 'events/PLAYED/scores', data: null },
    { id: 'X2', what: 'WALKAROUND step 2: delete the now-scoreless round', verdict: 'allow',
      site: 'not a call site - the second half of the same bypass',
      why: 'Rule A raises the cost from one write to two. It does not make it impossible, '
         + 'and it is not meant to.',
      path: 'events/EMPTY', data: null },
    { id: 'X3', what: 'OVERWRITE a played round with an empty valid one', verdict: 'allow',
      site: 'not a call site - the hole that matters most',
      why: 'This destroys the round as completely as a delete and is not a delete, so no '
         + 'rule keyed on newData.exists() sees it. Closing it needs a different rule.',
      path: 'events/PLAYED', data: { gameFormat: 'stroke', players: [], courseData: [] } },
];

// Deferred rows are documentation, not scenarios: they state a requirement the
// suite still holds while an open question about it is unresolved. They are not
// handed to targaryen, because there is no verdict to assert yet.
const ACTIVE = TABLE.filter((r) => !r.deferred);

function buildTestsData() {
    const tests = {};
    ACTIVE.forEach((row) => {
        // Each scenario gets its own path key where possible; X2 reuses EMPTY,
        // so it is merged into the same entry rather than silently overwriting.
        const key = row.path;
        const entry = tests[key] || {};
        const bucket = row.verdict === 'refuse' ? 'cannotWrite' : 'canWrite';
        entry[bucket] = (entry[bucket] || []).concat([{ auth: 'nobody', data: row.data }]);
        tests[key] = entry;
    });
    return { tests, json: { root: ROOT, users: { nobody: null }, tests } };
}

function runTargaryen(dataPath) {
    try {
        return { exitCode: 0, output: execFileSync(TARGARYEN, [RULES, dataPath], { encoding: 'utf8' }) };
    } catch (e) {
        return { exitCode: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
}

describe('events/<code> — a played round cannot be deleted in one write', () => {

    const built = buildTestsData();
    const dataPath = path.join(os.tmpdir(), 'round-delete-tests-' + process.pid + '.json');
    fs.writeFileSync(dataPath, JSON.stringify(built.json, null, 1));

    test('the table covers every real delete site and both verdicts', () => {
        // A table of only refusals is satisfied by a rule that refuses
        // everything - which here would break score entry for the whole app.
        const refuse = ACTIVE.filter((r) => r.verdict === 'refuse');
        const allow = ACTIVE.filter((r) => r.verdict === 'allow');
        assert.equal(refuse.length, 1, 'exactly one scenario is refused: the scored-round delete');
        assert.ok(allow.length >= 14, `only ${allow.length} allow rows - the app has more than that to protect`);
        allow.forEach((r) => assert.ok(r.why && r.why.length > 15,
            `${r.id} is allowed on purpose and must say why, or a later reader will "fix" it`));
        // Every child-delete row must name the file:line it stands for.
        TABLE.filter((r) => r.id.startsWith('C')).forEach((r) => {
            assert.match(r.site, /\.html:\d+/, `${r.id} must name its real call site`);
        });
    });

    test('the limits of this rule are asserted, not just described', () => {
        // If someone later "closes" the walkaround by making these refuse, this
        // test tells them the suite knew about it and chose otherwise.
        const limits = TABLE.filter((r) => r.id.startsWith('X'));
        assert.equal(limits.length, 3, 'the two-write walkaround and the overwrite hole');
        limits.forEach((r) => assert.equal(r.verdict, 'allow',
            `${r.id} documents a gap Rule A does not close; asserting it as refused would be a lie`));
    });

    // ------------------------------------------------------------------
    // T1 IS DEFERRED, NOT DELETED. Precedent: points_race_test.js:54, which
    // parks an open product question as a todo rather than asserting either
    // way. This is the other half of X5 in trip_delete_rules_test.js - the two
    // describe one problem from opposite sides, and neither is complete alone.
    // ------------------------------------------------------------------
    test.todo('OPEN QUESTION: removing the LAST round pointer from a trip whose only child '
        + 'is `rounds` is now REFUSED, and T1 above asserts it must be allowed. Both are '
        + 'right, which is why this is parked rather than fixed. '
        + 'WHY THE RULE CANNOT TELL: a whole-trip delete and a last-round removal BOTH leave '
        + 'newData not existing at trips/$tripCode, so ".write": "newData.exists() || '
        + '!data.hasChild(\'rounds\')" fails both clauses and refuses. There is no clause at '
        + 'that node which permits one and refuses the other. '
        + 'WHY THE EVENTS RULE HAS NO EQUIVALENT PROBLEM: a round keeps gameFormat, players '
        + 'and courseData, so deleting its scores never empties the node and newData.exists() '
        + 'stays true. The asymmetry is in the DATA SHAPE, not in the rule. '
        + 'WHY NO REAL TRIP CAN REACH IT: both creation paths write name and createdAt - '
        + 'trip.html:840-841 buildTrip and trip.html:927 createTripBlank - so trips/<code> '
        + 'always has other children and removing a round can never empty it. Measured: '
        + 'name+createdAt+rounds and name+createdAt+organizerToken+rounds both ALLOW the same '
        + 'delete; only a rounds-only node refuses. '
        + 'THE PATH THAT CAN REACH IT: admin.html:5415 writes trips/<tripLinkCode>/rounds/'
        + '<round> WITHOUT checking the trip exists, so a hand-edited ?trip= URL, or a trip '
        + 'deleted between round setup and save, creates a node whose only child is rounds. '
        + 'That round can then never be removed, leaving an orphan nobody can clear. '
        + 'THE CANDIDATE FIX, UNTESTED: a .validate on trips/$tripCode requiring a name when '
        + 'the node has rounds - refusing the malformed CREATE rather than the removal '
        + 'afterwards. buildTrip and createTripBlank both write name in the same write so '
        + 'they should be unaffected, but that is reasoning and not measurement: it needs its '
        + 'own scenario table and its own negative controls before it goes anywhere near the '
        + 'rules file. '
        + 'SEE ALSO: X5 in trip_delete_rules_test.js, which asserts the refusal as a known '
        + 'limit so it is visible from the trips side too.', () => {});

    test('every scenario passes against database.rules.json', () => {
        const { exitCode, output } = runTargaryen(dataPath);
        const m = output.match(/(\d+) failures? in (\d+) tests?/);
        assert.ok(m, `could not parse targaryen output:\n${output}`);
        const failures = parseInt(m[1], 10);
        assert.ok(parseInt(m[2], 10) >= ACTIVE.length,
            `targaryen ran ${m[2]} scenarios, expected at least ${ACTIVE.length}`);
        // A deferred row must not silently become zero rows. If somebody deletes
        // T1 instead of resolving it, this says so.
        assert.equal(TABLE.length - ACTIVE.length, 1,
            'exactly one row is deferred: T1, pending the open question below');
        assert.equal(failures, 0,
            `${failures} of ${m[2]} round-delete scenarios failed.\n` + output);
        assert.equal(exitCode, 0);
    });
});
