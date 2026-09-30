// ============================================================================
// THE DELETE RULE: organizers/$uid MAY BE EMPTIED BY ITS OWNER, AND NOTHING ELSE
//
// WHY. Wave 34 built sign-out and delete-account for App Review 5.1.1(v), and the
// measurement that shaped it was this: under the LIVE Stage 1 ruleset the owner can
// remove their groups and their co-organizer pointers, and CANNOT remove
// organizers/<uid> itself, firstSeenAt, or pass. So a deleted account left two keys
// behind. Manny approved one addition to fix that, and this file is the proof of
// what it does and - more importantly - what it does not.
//
// PUBLISHED 2026-09-30, ~4:40 AM Phoenix, from PUBLISH-THIS-database.rules.stage2delete
// .json with no edits. Post-publish on the phone: a score save PASSED and My Groups
// still listed "Thursday game". So this file's subject is now the LIVE ruleset, and
// database.rules.stage1.json is the rollback.
//
// THE WHOLE DELTA, one key, on top of the ruleset it replaced:
//
//   "organizers": { "$uid": { ".write":
//       "newData.val() === null && auth != null && auth.uid === $uid" } }
//
// A .write at a node governs every write to it AND to everything under it, because
// a grant from the root down cannot be revoked deeper. That is exactly why the
// newData.val() === null half is load-bearing: when this rule is consulted for a
// write to organizers/<uid>/pass, newData AT THIS NODE is the whole record as it
// would be afterwards. Setting a pass leaves a non-null record, so the rule is
// false and pass stays unwritable. Only a write that leaves the record EMPTY
// passes, which is the definition of deleting the account.
//
// ONE EDGE CASE, and it is intended rather than tolerated: for a record whose only
// key is pass, removing pass empties the node, so the rule allows it. That write IS
// a full delete - there is nothing else in the record - and calling it a leak would
// mean the rule cannot distinguish "delete my account" from "delete my account".
// The rows below use a record with three keys, which is every real one.
//
// WHICH HARNESS RAN, PLAINLY, BECAUSE THE BRIEF ASKED FOR AN EMULATOR TEST. I
// installed firebase-tools 15.32.0 and ran the real Database emulator, and here is
// exactly what it did and did not prove:
//
//   1. IT REFUSES TO LOAD THIS FILE, reproduced live rather than remembered:
//        database.rules.stage2delete.json:189:131:
//        Illegal regular expression, 'whitespacechar' not found
//      That is the authorized-email regex in the registrations branch, which has
//      been in the ruleset since long before this wave - the emulator refuses the
//      PUBLISHED file the same way. So a full emulator run on the real file is
//      impossible, and that is not something this wave introduced.
//
//   2. WITH A VARIANT WHOSE ONLY DIFFERENCE IS THAT REGEX (\s swapped for an
//      explicit space/tab/CR/LF class, one .validate, diffed to prove it) THE
//      EMULATOR LOADS THE RULES. That is worth having on its own: Google's own rules
//      parser accepts the new .write expression, so the console will not reject the
//      publish for syntax.
//
//   3. IT CANNOT ENFORCE THEM OVER REST, measured rather than assumed. A PUT to
//      organizers/$uid/pass - which EVERY version of this ruleset gives ".write":
//      false - returns HTTP 200 with no auth at all, with
//      ?auth_variable_override={"uid":"u-other"}, and with Authorization: Bearer
//      owner. Every one of the twelve rows came back "allow", including an
//      unauthenticated delete of another organizer's record. The emulator's REST
//      endpoint is admin-privileged; enforcing rules through it needs a client SDK
//      pointed at the Auth emulator, which is a build in its own right.
//
// So ENFORCEMENT below is targaryen, the harness all ten of this repo's rules suites
// use, with three negative controls and the whole Stage 1 table re-run. The report
// says the same thing rather than implying the emulator checked the verdicts.
//
// AND THE REGRESSION IS THE REAL TABLE, not a hand-picked subset. The last test
// re-runs rules_stage1_test.js - all 21 of its rows, plus its byte-identical events
// parent check - with RULES_CANDIDATE pointed at the new file. "Everything Stage 1
// allowed is still allowed" is therefore measured by the table that defined Stage 1.
//
// THE BASELINE, all 12 tests, against main 7608a56 in a clean worktree - no
// candidate file, no rollback copy, no account-exit.js:
//
//     5 PASS / 7 FAIL
//
// I had guessed 0 / 13 before running it, and both numbers were wrong. What the five
// greens actually are, because four of them earn nothing:
//   - the table-shape test and "exactly TWO outcomes change" only read the table in
//     this file, so they pass wherever the file is;
//   - "the SAME rows behave as stated under the PUBLISHED file" and "the published
//     file itself fails the candidate table" run against stage1, which exists there;
//   - and the Stage 1 regression is VACUOUS at that sha for a reason worth naming:
//     rules_stage1_test.js has no RULES_CANDIDATE override until this wave adds one,
//     so the spawned suite quietly tested stage1 against itself and passed. It is
//     live now - point the override at a file that takes something away and it goes
//     red - but at the baseline it proved nothing, and saying so is the point.
// The seven reds are every test that needs the candidate, the rollback copy, or the
// app change.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');
// PUBLISHED 2026-09-30, ~4:40 AM Phoenix, by console paste of
// PUBLISH-THIS-database.rules.stage2delete.json with no edits. So the names moved,
// exactly as they did in rules_stage1_test.js after its own publish: what this file
// calls LIVE is the stage2delete file, and stage1 is now PREV - the rollback. Calling
// stage1 "live" after the publish would have made every comparison below mislabelled
// while still passing.
const LIVE = path.join(REPO, 'database.rules.stage2delete.json');    // published 2026-09-30
const PREV = path.join(REPO, 'database.rules.stage1.json');          // the rollback
const ROLLBACK = path.join(REPO, 'database.rules.rollback-stage1.json');

const OWNER = 'u-owner';
const CO_KEY = 'a,person@gmail,com';
const GROUP = {
    name: 'Thursday game', ownerUid: OWNER, createdAt: 1, updatedAt: 1,
    coOrganizers: { [CO_KEY]: true },
    members: { marty: { name: 'Marty', hcp: '9' } }
};
// A record with THREE keys, which is what a real organizer has once they have a
// pass. The edge case in the header is the one-key record, and it is not this.
const ROOT = {
    events: { ZZTEST: { eventName: 'Thursday', ownerUid: OWNER, scores: { p101_h1: 4 } } },
    organizers: {
        [OWNER]: { firstSeenAt: 1, pass: { kind: 'founder', expiresAt: 4102444800000 }, groups: { g1: GROUP } },
        'u-other': { firstSeenAt: 1 },
        'u-passonly': { pass: { kind: 'founder', expiresAt: 4102444800000 } }
    },
    sharedGroups: { [CO_KEY]: { [OWNER]: { g1: true } } }
};
const USERS = {
    nobody: null,
    owner: { uid: OWNER, provider: 'password', token: { email: 'owner@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', provider: 'password', token: { email: 'x@y.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    passonly: { uid: 'u-passonly', provider: 'password', token: { email: 'p@q.com', email_verified: true, firebase: { sign_in_provider: 'password' } } }
};

// EVERY ROW SAYS WHAT IT IS FOR, and `live` is what the SAME row does under the
// published file - so the difference the publish makes is measured, not asserted.
const T = [
    { id: 'A1', what: 'the owner empties their whole record', who: 'owner', live: 'allow', prev: 'refuse',
      path: 'organizers/' + OWNER, data: null,
      why: 'this is the point of the delta: delete account now removes firstSeenAt and pass with it' },
    { id: 'A2', what: 'somebody else tries to empty it', who: 'other', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER, data: null,
      why: 'the auth.uid half - without it any signed-in golfer could wipe any organizer' },
    { id: 'A3', what: 'an unauthenticated visitor tries to empty it', who: 'nobody', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER, data: null,
      why: 'a null auth must not slip through auth.uid === $uid' },
    { id: 'A4', what: 'the owner OVERWRITES the record with something', who: 'owner', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER, data: { firstSeenAt: 1, pass: { kind: 'founder', expiresAt: 9 } },
      why: 'the newData null half - a delete rule that also permits a rewrite is a pass-granting rule' },
    { id: 'A5', what: 'the owner writes themselves a pass', who: 'owner', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER + '/pass', data: { kind: 'founder', expiresAt: 4102444800000 },
      why: 'THE ONE THAT MATTERS: a parent grant cannot be revoked deeper, so this is what the null half exists to stop' },
    { id: 'A6', what: 'the owner deletes only their pass', who: 'owner', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER + '/pass', data: null,
      why: 'the record still has two keys afterwards, so it is not a delete and pass stays unremovable' },
    { id: 'A7', what: 'the owner deletes only firstSeenAt', who: 'owner', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER + '/firstSeenAt', data: null,
      why: 'same reason - the trial clock cannot be reset by shaving one key off the record' },
    { id: 'A8', what: 'the owner writes a bigger firstSeenAt', who: 'owner', live: 'refuse', prev: 'refuse',
      path: 'organizers/' + OWNER + '/firstSeenAt', data: 99,
      why: 'the create-only rule still stands: a running trial cannot be restarted' },
    { id: 'A9', what: 'the owner removes their groups', who: 'owner', live: 'allow', prev: 'allow',
      path: 'organizers/' + OWNER + '/groups', data: null,
      why: 'unchanged, and still the fallback the app uses until the publish lands' },
    { id: 'A10', what: 'the owner removes one co-organizer pointer', who: 'owner', live: 'allow', prev: 'allow',
      path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1', data: null,
      why: 'unchanged: the pointers are removed leaf by leaf either way' },
    { id: 'A11', what: 'a scorekeeper posts a score', who: 'nobody', live: 'allow', prev: 'allow',
      path: 'events/ZZTEST/scores/p101_h2', data: 4,
      why: 'the most common write in the app, and this delta must not go near it' },
    { id: 'A12', what: 'a record whose ONLY key is pass loses it', who: 'passonly', live: 'allow', prev: 'refuse',
      path: 'organizers/u-passonly/pass', data: null,
      why: 'the intended edge case in the header: emptying that record IS deleting that account' }
];

function dataFile(which) {
    const tests = {};
    T.forEach(row => {
        const want = which === 'prev' ? row.prev : row.live;
        const entry = tests[row.path] || {};
        const bucket = want === 'allow' ? 'canWrite' : 'cannotWrite';
        entry[bucket] = (entry[bucket] || []).concat([{ auth: row.who, data: row.data }]);
        tests[row.path] = entry;
    });
    const f = path.join(os.tmpdir(), 'rules-stage2-' + which + '-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests: tests }, null, 1));
    return f;
}
function run(rulesPath, which) {
    try { return { code: 0, out: execFileSync(TARGARYEN, [rulesPath, dataFile(which)], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') }; }
}
// A mutated ruleset, written to a temp path. NO REPO FILE IS TOUCHED, so there is
// nothing to restore - the controls run on a copy.
function mutated(fn) {
    const d = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
    fn(d);
    const f = path.join(os.tmpdir(), 'rules-stage2-ctl-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    return f;
}

describe('THE DELETE RULE, AND THE TWO HALVES THAT MAKE IT SAFE', () => {

    test('the table has both verdicts, a null-auth row, and a reason each', () => {
        assert.ok(T.filter(r => r.live === 'allow').length >= 4, 'a table of refusals is satisfied by a ruleset that refuses everything');
        assert.ok(T.filter(r => r.live === 'refuse').length >= 6);
        assert.ok(T.some(r => r.who === 'nobody' && r.live === 'refuse'));
        T.forEach(r => assert.ok(r.why && r.why.length > 25, r.id + ' must say why'));
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
    });

    test('the live file is the previous one plus ONE key', () => {
        assert.ok(fs.existsSync(LIVE), 'database.rules.stage2delete.json is what is LIVE since 2026-09-30');
        const live = JSON.parse(fs.readFileSync(PREV, 'utf8'));
        const next = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
        const added = [];
        (function walk(a, b, p) {
            Object.keys(b).forEach(k => {
                if (!(k in a)) { added.push(p + '/' + k); return; }
                if (typeof b[k] === 'object' && b[k] && typeof a[k] === 'object' && a[k]) walk(a[k], b[k], p + '/' + k);
                else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) added.push('CHANGED ' + p + '/' + k);
            });
            Object.keys(a).forEach(k => { if (!(k in b)) added.push('REMOVED ' + p + '/' + k); });
        })(live, next, '');
        assert.deepEqual(added, ['/rules/organizers/$uid/.write'],
            'the publish added exactly one key and changed nothing else: ' + JSON.stringify(added));
        assert.equal(next.rules.organizers.$uid['.write'],
            'newData.val() === null && auth != null && auth.uid === $uid');
    });

    test('the events parent is still BYTE-IDENTICAL to what it replaced', () => {
        // Rounds are what the whole app does. A rules publish that touched this
        // parent would be a different wave with a different approval.
        const prev = JSON.parse(fs.readFileSync(PREV, 'utf8'));
        const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
        assert.equal(JSON.stringify(live.rules.events), JSON.stringify(prev.rules.events));
    });

    test('EVERY expectation holds against the LIVE file', () => {
        const { code, out } = run(LIVE, 'live');
        assert.equal(code, 0, 'targaryen disagreed with the live file:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and the SAME rows behave as stated under the ROLLBACK file', () => {
        // Which is what makes the `prev` column a measurement rather than a memory.
        const { code, out } = run(PREV, 'prev');
        assert.equal(code, 0, 'the prev column is wrong somewhere:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('exactly TWO rule outcomes change, and both are deletes', () => {
        const changed = T.filter(r => r.live !== r.prev);
        assert.deepEqual(changed.map(r => r.id), ['A1', 'A12']);
        changed.forEach(r => {
            assert.equal(r.data, null, r.id + ' must be a delete');
            assert.equal(r.live, 'allow');
            assert.equal(r.prev, 'refuse');
        });
        // Two ROWS. The third change the publish brings is in the app rather than in
        // the ruleset - organizers/<uid> becomes removable, so account-exit.js's
        // whole-record attempt starts succeeding and its groups fallback stops
        // running - and that is not a rules row, which is why this count is 2.
        assert.equal(changed.length, 2);
    });

    test('NEGATIVE CONTROL: drop the newData-null half and the pass becomes writable', () => {
        const f = mutated(d => {
            d.rules.organizers.$uid['.write'] = 'auth != null && auth.uid === $uid';
        });
        const { code, out } = run(f, 'live');
        assert.notEqual(code, 0, 'a rule that lets the owner write anything under their record must FAIL this table');
        assert.match(out, /organizers\/u-owner\/pass|organizers\/u-owner/, out.slice(-1500));
    });

    test('NEGATIVE CONTROL: drop the auth half and anybody can wipe anybody', () => {
        const f = mutated(d => {
            d.rules.organizers.$uid['.write'] = 'newData.val() === null';
        });
        const { code, out } = run(f, 'live');
        assert.notEqual(code, 0, 'without auth.uid === $uid, A2 and A3 must fail');
        assert.match(out, /organizers\/u-owner/, out.slice(-1500));
    });

    test('NEGATIVE CONTROL: the ROLLBACK file fails the live table', () => {
        // Proof the table is not vacuous: the ruleset this replaced cannot satisfy
        // it, because A1 and A12 are the whole point of the publish. It is also what
        // a rollback would cost - roll back and the app is back to leaving
        // firstSeenAt and any pass behind on a deleted account.
        const { code } = run(PREV, 'live');
        assert.notEqual(code, 0, 'if stage1 passed the live table, the publish would have changed nothing');
    });
});

describe('THE ROLLBACK, AND WHAT THE PUBLISH MUST NOT TAKE AWAY', () => {

    test('the rollback copy is BYTE-IDENTICAL to the ruleset it rolls back to', () => {
        assert.ok(fs.existsSync(ROLLBACK), 'a publish with no rollback in hand is not a publish');
        assert.equal(fs.readFileSync(ROLLBACK, 'utf8'), fs.readFileSync(PREV, 'utf8'),
            'the rollback must be exactly Stage 1, not a reconstruction of it');
    });

    test('EVERYTHING STAGE 1 ALLOWED IS STILL ALLOWED - its own 21 rows, re-run against LIVE', () => {
        // Not a hand-picked subset: rules_stage1_test.js is run again with its
        // candidate pointed at the new file, so the table that DEFINED Stage 1 is
        // the table that says the publish took nothing away.
        let out = '';
        try {
            // TAP, because the default reporter's summary lines are decorated and a
            // regex against them is a regex against a presentation choice.
            out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout', 'rules_stage1_test.js'], {
                cwd: REPO, encoding: 'utf8',
                // NODE_TEST_CONTEXT MUST GO. A child `node --test` that inherits it
                // switches to the v8-serializer reporter for its parent runner and
                // writes nothing a regex can read - the first version of this test
                // matched against an empty string and failed for that reason alone.
                env: (function () {
                    const e = Object.assign({}, process.env, { RULES_CANDIDATE: LIVE });
                    delete e.NODE_TEST_CONTEXT;
                    delete e.NODE_OPTIONS;
                    return e;
                })()
            });
        } catch (e) {
            out = (e.stdout || '') + (e.stderr || '');
            assert.fail('the Stage 1 suite fails against the candidate:\n' + out.slice(-3000));
        }
        assert.match(out, /# fail 0/, out.slice(-2000));
        assert.match(out, /# pass 11/, 'all 11 Stage 1 tests must run: ' + out.slice(-800));
    });

    test('the app did not need the publish to have happened, and still does not', () => {
        // account-exit.js tries the whole record FIRST and falls back to groups when
        // the rules refuse it, so the same build works before and after - and it is
        // also what makes the rollback safe: roll the rules back and the fallback
        // simply starts running again, with no release.
        const src = fs.readFileSync(path.join(REPO, 'account-exit.js'), 'utf8');
        assert.match(src, /WHOLE RECORD FIRST/, 'the file must say which strategy it uses');
        assert.match(src, /organizers\/' \+ id\b/, 'and it must try the record path');
    });
});
