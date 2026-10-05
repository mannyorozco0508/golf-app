// ============================================================================
// STAGE 2: SETUP BELONGS TO THE ACCOUNT THAT CREATED THE ROUND
//
// NOT PUBLISHED. database.rules.stage2-ownerlock.json is prepared for Grok;
// database.rules.rollback-stage2-ownerlock.json is a byte-identical copy of what
// is live (sha db6cecca, read out of the database with the service account on
// 2026-10-05 and equal to the repo's database.rules.json, which mirrors it).
//
// THE PROBLEM. On a round that exists, the live rule lets ANY client write
// ANYTHING except deleting a played round. A golfer holding the round link can
// rewrite the roster, the course, the format and the stakes of somebody else's
// round. The link is world-readable, so it was never a credential.
//
// WHY NOT SIMPLY KEY ON ownerUid. Because 96 of production's rounds predate the
// owner gate and thousands of golfers' Mondays run on rounds whose setup is
// edited from whichever phone is nearest. Locking every owned round would lock
// those groups out of their own rounds with no warning and no way back.
//
// SO: ownerLock, AND IT IS BORN WITH THE ROUND. A round created from now on
// carries ownerLock: true, and THAT is what the lock keys on. A round without it
// behaves exactly as it does today - no lockout, nothing to notice. The flag
// cannot be added afterwards: its .validate admits it only in the write that
// creates the round, which is what stops a stranger locking somebody else's
// legacy round and what stops a lock arriving on a round with no owner, where
// it would mean NOBODY could edit the setup.
//
// WHAT STAYS OPEN, AND IT IS MOST OF THE APP. Scores, KPs, side matches, match
// and stroke presses, dots, wolf calls, challenges, the audit log and the
// verification flag all carry their own `.write` grant keyed on the round
// existing, and a child grant is not revoked by a parent refusal. So a locked
// round plays exactly as an unlocked one does from any device with the link -
// that is the whole point, and rows L4 to L9 are it.
//
// BASELINE, measured over the FINISHED file against this branch's parent
// (2878b9d, with the two new rules files moved aside and organizer-gate.js and
// admin.html swapped out, all four restored by sha), all 13 tests:
// 3 PASS / 10 FAIL. 3 + 10 = 13.
//   The three that pass are the ones that do not need any of it: the table's own
//   shape, the LIVE column (which is about the published file and is the whole
//   point of having a live column), and "exactly these rows move" - a property
//   of the table rather than of any ruleset, which is why it is cheap and worth
//   having. Everything that reads the Stage 2 file, the stamp or the sentence is
//   red there: a rules file has no partial state, and neither has a sentence.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const REPO = __dirname;
const LIVE = path.join(REPO, 'database.rules.json');                       // mirrors production
const NEXT = path.join(REPO, 'database.rules.stage2-ownerlock.json');      // for Grok to publish
const ROLLBACK = path.join(REPO, 'database.rules.rollback-stage2-ownerlock.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

const ME = 'u-owner';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const PLAYERS = [{ id: 101, name: 'Dale Whitmore' }, { id: 102, name: 'Marty Marshall' }];
const BASE = { eventName: 'Saturday', gameFormat: 'stroke', courseData: CD, players: PLAYERS };
const PLAYED = { scores: { p101_h1: 4, p102_h1: 5 } };

const ROOT = {
    events: {
        // A round created AFTER Stage 2 ships: owned and locked.
        LOCKED: Object.assign({}, BASE, PLAYED, { ownerUid: ME, ownerLock: true,
            organizerToken: 'tok', sideMatches: { m1: { stake: 10 } } }),
        LOCKED_EMPTY: Object.assign({}, BASE, { ownerUid: ME, ownerLock: true }),
        // A round created BEFORE it: owned, not locked. Nothing may change here.
        OWNED: Object.assign({}, BASE, PLAYED, { ownerUid: ME }),
        // And one from before the owner gate at all.
        LEGACY: Object.assign({}, BASE, PLAYED)
    },
    // A LIVE PASS ON BOTH, so the creation gate is not what any row below is
    // measuring: the trial window is time-relative and has its own suite.
    organizers: { [ME]: { firstSeenAt: 1, pass: { type: 'season', expiresAt: 4102444800000, transactionId: 'fixture' } },
                  'u-other': { firstSeenAt: 1, pass: { type: 'season', expiresAt: 4102444800000, transactionId: 'fixture' } } },
    trips: {}, tournaments: {}, global_courses: {}, app_settings: {}
};
const USERS = {
    nobody: null,
    me: { uid: ME, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } },
    other: { uid: 'u-other', provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } }
};

// `live` is what the SAME row does under the file published today, so the
// difference this publish makes is measured rather than described.
const W = [
    // ---- A LOCKED ROUND: SETUP IS THE OWNER'S --------------------------
    { id: 'L1', what: 'the OWNER rewrites the roster', who: 'me', next: 'allow', live: 'allow',
      p: 'events/LOCKED/players', d: [{ id: 101, name: 'Dale' }],
      why: 'the organizer must keep editing their own round, which is the half a lock breaks first' },
    { id: 'L2', what: 'a code-holder rewrites the roster', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/LOCKED/players', d: [{ id: 999, name: 'Nobody' }],
      why: 'THE POINT OF THE PUBLISH. The round link is world-readable, so it was never a credential' },
    { id: 'L3', what: 'a code-holder rewrites the course', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/LOCKED/courseData', d: [],
      why: 'the card itself - every score already posted is read against these pars' },
    { id: 'L4', what: 'a code-holder posts a score', who: 'other', next: 'allow', live: 'allow',
      p: 'events/LOCKED/scores/p101_h2', d: 4,
      why: 'THE HALF THAT MUST NOT BREAK. The child grant is not revoked by a parent refusal, and '
         + 'this is the most common write in the app' },
    { id: 'L5', what: 'a code-holder adds a side match', who: 'other', next: 'allow', live: 'allow',
      p: 'events/LOCKED/sideMatches/m2', d: { stake: 20 },
      why: 'a bet between two golfers in the group is not the organizer’s to approve' },
    { id: 'L6', what: 'a code-holder records a KP', who: 'other', next: 'allow', live: 'allow',
      p: 'events/LOCKED/kpLeaders/h3', d: { playerId: '101' },
      why: 'answered on the tee by whoever is standing there' },
    { id: 'L7', what: 'a code-holder records dots', who: 'other', next: 'allow', live: 'allow',
      p: 'events/LOCKED/dots/h3', d: { p101: { birdie: 1 } },
      why: 'junk is entered hole by hole, from any phone in the group' },
    { id: 'L8', what: 'a code-holder offers a challenge', who: 'nobody', next: 'allow', live: 'allow',
      p: 'events/LOCKED/challenges/c1',
      d: { from: '101', to: '102', status: 'pending', createdAt: 1,
           terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20, pressRule: 'none' } },
      why: 'a following player holds no scorekeeper link and must still be able to ASK' },
    { id: 'L9', what: 'a code-holder presses a match', who: 'other', next: 'allow', live: 'allow',
      p: 'events/LOCKED/matchPresses/mp1', d: { startHole: 4, stake: 10 },
      why: 'a press is a decision made on the hole, by the golfer who is down' },
    { id: 'L10', what: 'a code-holder deletes a locked round nobody has played', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/LOCKED_EMPTY', d: null,
      why: 'an unplayed round has always been deletable by anyone holding the code; on a locked '
         + 'round it is the owner’s, and this is the one row where the lock is STRICTER than '
         + 'the scores guard rather than beside it' },
    { id: 'L11', what: 'the owner deletes their own locked played round', who: 'me', next: 'allow', live: 'allow',
      p: 'events/LOCKED', d: null,
      why: 'the owner-delete rule published this morning and this must not take it back' },
    { id: 'L12', what: 'a code-holder removes the lock', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/LOCKED/ownerLock', d: null,
      why: 'A LOCK THAT CAN BE DELETED IS NOT A LOCK. The key has no child grant, so the parent '
         + 'decides - and on a locked round the parent is the owner' },
    { id: 'L13', what: 'the owner turns the lock off', who: 'me', next: 'refuse', live: 'allow',
      p: 'events/LOCKED/ownerLock', d: false,
      why: 'the flag is true or absent; a stored false would be a third state nothing reads' },

    // ---- AN OWNED ROUND FROM BEFORE STAGE 2: NOTHING CHANGES -----------
    { id: 'U1', what: 'a code-holder rewrites the roster on an UNLOCKED owned round', who: 'other', next: 'allow', live: 'allow',
      p: 'events/OWNED/players', d: [{ id: 101, name: 'Dale' }],
      why: 'THE GRANDFATHER CLAUSE. 96 of production’s rounds predate the owner gate and their '
         + 'groups edit setup from whichever phone is nearest. Locking them would be a silent '
         + 'lockout with no way back' },
    { id: 'U2', what: 'a stranger ADDS a lock to an unlocked owned round', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/OWNED/ownerLock', d: true,
      why: 'otherwise a code-holder could force Stage 2 onto somebody else’s old round and lock '
         + 'the rest of the group out of it' },
    { id: 'U3', what: 'the owner deletes their unlocked played round', who: 'me', next: 'allow', live: 'allow',
      p: 'events/OWNED', d: null, why: 'the owner-delete rule, unchanged on a grandfathered round' },
    { id: 'U4', what: 'a code-holder deletes that played round', who: 'other', next: 'refuse', live: 'refuse',
      p: 'events/OWNED', d: null, why: 'the scores guard, unchanged' },

    // ---- A LEGACY ROUND WITH NO OWNER AT ALL ---------------------------
    { id: 'G1', what: 'a code-holder rewrites the roster on a LEGACY round', who: 'nobody', next: 'allow', live: 'allow',
      p: 'events/LEGACY/players', d: [{ id: 101, name: 'Dale' }],
      why: 'there is nobody to be the owner of, so there is nothing to lock it to' },
    { id: 'G2', what: 'a lock is added to a legacy round', who: 'other', next: 'refuse', live: 'allow',
      p: 'events/LEGACY/ownerLock', d: true,
      why: 'THE DENIAL OF SERVICE THIS CLOSES. A lock with no ownerUid behind it would mean the '
         + 'locked clause can never be satisfied: nobody could edit that round again, ever' },
    { id: 'G3', what: 'a code-holder deletes a played legacy round', who: 'nobody', next: 'refuse', live: 'refuse',
      p: 'events/LEGACY', d: null, why: 'the scores guard, unchanged' },

    // ---- CREATION ------------------------------------------------------
    { id: 'C1', what: 'an organizer creates a locked round', who: 'me', next: 'allow', live: 'allow',
      p: 'events/NEWCODE', d: { gameFormat: 'stroke', players: [], courseData: [], ownerUid: ME, ownerLock: true },
      why: 'the shape the app writes from now on - if this refuses, nobody can start a round' },
    { id: 'C2', what: 'a create carrying somebody else’s ownerUid', who: 'other', next: 'refuse', live: 'refuse',
      p: 'events/NEWCODE', d: { gameFormat: 'stroke', players: [], courseData: [], ownerUid: ME, ownerLock: true },
      why: 'the creation gate, unchanged' },
    { id: 'C3', what: 'a create with no identity', who: 'nobody', next: 'refuse', live: 'refuse',
      p: 'events/NEWCODE', d: { gameFormat: 'stroke', players: [], courseData: [] },
      why: 'the creation gate, unchanged' }
];

function dataFile(which) {
    const tests = {};
    W.forEach((row) => {
        const want = which === 'live' ? row.live : row.next;
        const e = tests[row.p] || {};
        const bucket = want === 'allow' ? 'canWrite' : 'cannotWrite';
        e[bucket] = (e[bucket] || []).concat([{ auth: row.who, data: row.d }]);
        tests[row.p] = e;
    });
    const f = path.join(os.tmpdir(), 'ownerlock-' + which + '-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests: tests }, null, 1));
    return f;
}
function run(rulesPath, which) {
    try { return { code: 0, out: execFileSync(TARGARYEN, [rulesPath, dataFile(which)], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') }; }
}
// A mutated ruleset on a temp path. NO REPO FILE IS TOUCHED.
function mutated(fn) {
    const d = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
    fn(d);
    const f = path.join(os.tmpdir(), 'ownerlock-ctl-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    return f;
}
const EV = (d) => d.rules.events.$eventCode;

describe('STAGE 2: THE LOCK, AND EVERYTHING IT LEAVES ALONE', () => {

    test('the table has both verdicts, a null-auth row, and a reason each', () => {
        assert.ok(W.filter(r => r.next === 'allow').length >= 8,
            'a table of refusals is satisfied by a ruleset that refuses everything');
        assert.ok(W.filter(r => r.next === 'refuse').length >= 6);
        assert.ok(W.some(r => r.who === 'nobody'), 'no null-auth row');
        // THE PLAY PATHS ARE THE MAJORITY ON PURPOSE: this publish is judged by what
        // it does NOT break.
        assert.ok(W.filter(r => r.id[0] === 'L' && r.next === 'allow').length >= 6,
            'the locked round has too few still-open rows to prove Monday survives');
        W.forEach(r => assert.ok(r.why && r.why.length > 25, r.id + ' must say why'));
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
    });

    test('EVERY expectation holds against the FILE TO BE PUBLISHED', () => {
        const { code, out } = run(NEXT, 'next');
        assert.equal(code, 0, 'targaryen disagreed with the Stage 2 file:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and the SAME rows behave as recorded against the file that is LIVE TODAY', () => {
        const { code, out } = run(LIVE, 'live');
        assert.equal(code, 0, 'the live column is wrong:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('EXACTLY THESE ROWS MOVE, and every one of them is a code-holder on setup', () => {
        const moved = W.filter(r => r.next !== r.live);
        assert.deepEqual(moved.map(r => r.id), ['L2', 'L3', 'L10', 'L12', 'L13', 'U2', 'G2'],
            'the publish changes rows it is not for: ' + JSON.stringify(moved.map(r => r.id)));
        moved.forEach(r => assert.equal(r.live, 'allow', r.id + ' was already refused'));
        // And nothing a golfer does mid-round moved.
        ['L4', 'L5', 'L6', 'L7', 'L8', 'L9'].forEach(id => {
            const r = W.find(x => x.id === id);
            assert.equal(r.next, 'allow', id + ' stopped working on a locked round');
            assert.equal(r.live, 'allow');
        });
    });

    test('THE DELTA IS THE PARENT WRITE AND ONE NEW KEY, and nothing else moved', () => {
        const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
        const next = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
        const changed = [];
        (function walk(a, b, p) {
            Object.keys(b).forEach((k) => {
                if (!(k in a)) { changed.push('ADDED ' + p + '/' + k); return; }
                if (typeof b[k] === 'object' && b[k] && typeof a[k] === 'object' && a[k]) walk(a[k], b[k], p + '/' + k);
                else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(p + '/' + k);
            });
            Object.keys(a).forEach((k) => { if (!(k in b)) changed.push('REMOVED ' + p + '/' + k); });
        })(live, next, '');
        assert.deepEqual(changed.sort(), ['ADDED /rules/events/$eventCode/ownerLock',
                                          '/rules/events/$eventCode/.write'].sort(),
            'the publish touched more than the lock: ' + JSON.stringify(changed));
        // AND THE OWNER-DELETE GRANT SURVIVES VERBATIM inside the new rule - a
        // publish that quietly dropped it would pass every row above except L11.
        assert.match(EV(next)['.write'],
            /auth != null && data\.hasChild\('ownerUid'\) && auth\.uid === data\.child\('ownerUid'\)\.val\(\)/);
    });

    test('THE ROLLBACK IS BYTE-IDENTICAL TO WHAT IS LIVE', () => {
        assert.ok(fs.existsSync(ROLLBACK), 'a publish with no rollback copy is a publish nobody can undo');
        assert.equal(fs.readFileSync(ROLLBACK, 'utf8'), fs.readFileSync(LIVE, 'utf8'));
        const sha = require('crypto').createHash('sha256').update(fs.readFileSync(LIVE)).digest('hex');
        assert.equal(sha.slice(0, 16), 'db6ceccaaeae3aa6',
            'database.rules.json has moved since it was verified against the live database - '
            + 're-read .settings/rules.json before publishing anything built on it');
    });

    test('CONTROL: without the locked clause, the OWNER loses their own setup', () => {
        const f = mutated((d) => {
            EV(d)['.write'] = EV(d)['.write'].replace(
                "(data.exists() && data.hasChild('ownerLock') && data.hasChild('ownerUid') && auth != null && data.hasChild('ownerUid') && auth.uid === data.child('ownerUid').val()) || ", '');
        });
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0, 'the clause grants nothing - every locked row passes without it');
        assert.match(out, /LOCKED/, 'it failed somewhere else: ' + out.slice(-500));
    });

    test('CONTROL: comparing nothing lets any signed-in golfer edit a locked round', () => {
        const f = mutated((d) => {
            EV(d)['.write'] = EV(d)['.write'].replace(
                "data.hasChild('ownerLock') && data.hasChild('ownerUid') && auth != null && data.hasChild('ownerUid') && auth.uid === data.child('ownerUid').val()",
                "data.hasChild('ownerLock') && auth != null");
        });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'a stranger with an account could rewrite a locked roster');
    });

    test('CONTROL: a lock with no owner behind it locks EVERYBODY out', () => {
        // The reason the locked clause asks for ownerUid as well. Without that, a
        // round carrying a lock and no owner satisfies neither branch - and G2 is
        // the row that would put one there.
        const f = mutated((d) => {
            EV(d)['.write'] = EV(d)['.write'].replace("!(data.hasChild('ownerLock') && data.hasChild('ownerUid'))",
                                                      "!data.hasChild('ownerLock')");
            delete EV(d).ownerLock;
        });
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0, 'nothing noticed that a legacy round could be bricked');
        assert.match(out, /LEGACY|OWNED/, 'it failed somewhere else: ' + out.slice(-500));
    });

    test('CONTROL: without its validate, the lock can be added to anybody’s round', () => {
        const f = mutated((d) => { delete EV(d).ownerLock; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'the lock is addable after the fact and nothing caught it');
    });

    test('CONTROL: drop the scores grant and Monday stops, which is what L4 is for', () => {
        const f = mutated((d) => { delete EV(d).scores['.write']; });
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0, 'the play rows do not depend on the child grant at all');
        assert.match(out, /scores/, 'it failed somewhere else: ' + out.slice(-500));
    });
});

describe('THE APP WRITES THE LOCK, AND SAYS SO WHEN IT REFUSES', () => {
    const GATE = fs.readFileSync(path.join(REPO, 'organizer-gate.js'), 'utf8');
    const ADMIN = fs.readFileSync(path.join(REPO, 'admin.html'), 'utf8');

    test('stamp() writes ownerLock on a NEW round and never on an existing one', () => {
        // Behavioural, through the one builder every create goes through - and the
        // "existing" cases are the ones that matter, because adding the flag to a
        // round that already exists is the write the published rule refuses
        // outright, which would fail the WHOLE save rather than just the flag.
        const sb = loadJsFile('organizer-gate.js');
        const stamp = (payload, existing) => {
            const expr = 'JSON.stringify(window.organizerGate.stamp(' + JSON.stringify(payload)
                + ", 'u-1', " + JSON.stringify(existing === undefined ? null : existing) + '))';
            return JSON.parse(vm.runInContext(expr, sb));
        };
        assert.equal(stamp({ a: 1 }).ownerLock, true, 'a new round is not locked');
        assert.equal(stamp({ a: 1 }).ownerUid, 'u-1');
        // trip.html calls stamp with two arguments; every round in its batch is new.
        assert.equal(stamp({ a: 1 }, undefined).ownerLock, true);
        // An OWNED round being re-saved: the flag is already stored and update()
        // merges, so the payload must not carry it.
        assert.equal('ownerLock' in stamp({ a: 1 }, { exists: true, ownerUid: 'u-1' }), false,
            'a re-save carries the flag, which the rule refuses on an existing round');
        // A LEGACY round: no ownerUid either, exactly as before Stage 2.
        const legacy = stamp({ a: 1 }, { exists: true, ownerUid: null });
        assert.equal('ownerLock' in legacy, false, 'a legacy round is being locked');
        assert.equal('ownerUid' in legacy, false, 'a legacy round is being stamped - this refuses the save');
    });

    test('and the refusal names the one thing that fixes it', () => {
        assert.match(ADMIN, /const SETUP_LOCKED_SENTENCE =/, 'there is no sentence');
        const i = ADMIN.indexOf('const SETUP_LOCKED_SENTENCE =');
        const sentence = ADMIN.slice(i, ADMIN.indexOf(';', ADMIN.indexOf('round link', i)));
        assert.match(sentence, /Sign in with that email/, 'it does not say how to get in');
        assert.match(sentence, /Scores, bets, KPs and side matches still save/,
            '"locked" on its own reads as "you cannot use this round"');
        // AND IT IS REACHED WITHOUT ASKING THE SERVER WHY: the page knows the round
        // is owned by another uid, so a refused save IS the lock. The trial wall
        // must not get the chance to explain a refusal it did not cause.
        const at = ADMIN.indexOf('const myUid = (window.authBootState && window.authBootState.uid) || null;');
        assert.ok(at > -1, 'the local check is gone');
        const blk = ADMIN.slice(at, at + 900);
        assert.match(blk, /loadedOwnerUid && myUid && loadedOwnerUid !== myUid/);
        assert.ok(blk.indexOf('uiFail(SETUP_LOCKED_SENTENCE)') < blk.indexOf('explainRefusal'),
            'the trial wall is consulted first and will mis-explain a lockout');
    });
});
