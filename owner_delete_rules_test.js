// ============================================================================
// THE OWNER MAY DELETE THEIR OWN ROUND, EVEN AFTER IT HAS BEEN PLAYED
//
// NOT PUBLISHED. database.rules.ownerdelete.json is prepared for Grok to
// publish; database.rules.rollback-ownerdelete.json is a byte-identical copy of
// what is live. This file is the proof of what the delta does and, more
// importantly, what it does not.
//
// WHAT IS LIVE WAS MEASURED, NOT ASSUMED (2026-10-05). The live ruleset was read
// straight out of the database with the service account
// (.settings/rules.json, 20,774 bytes) and compared against every rules file in
// the repo. It is database.rules.push.json, sha256 955ffd4a6ea2e1c5... - so the
// push wave IS live now, and rules_push_tokens_test.js's header, which says
// stage2delete is live, is one publish behind. TWO THINGS FOLLOW, and both are
// worth more than this delta:
//
//   1. THE REPO'S OWN database.rules.json IS NOT LIVE AND HAS NOT BEEN FOR A
//      WHILE. It is 13,099 bytes against the live 20,774 and is missing whole
//      subtrees - challenges, organizers/groups, pushTokens, pushPrefs,
//      sharedGroups. Every suite that runs targaryen against THAT file is
//      describing a ruleset nobody publishes. round_delete_rules_test.js is one
//      of them, which is why this file exists beside it rather than inside it.
//   2. THE LIVE events/$eventCode HAS NO OWNER-ONLY SETUP CLAUSE. Live reads
//      `data.exists() && (newData.exists() || !data.hasChild('scores'))`: on a
//      round that already exists, ANY client may write ANYTHING except a
//      whole-round delete of a played round. The owner-only setup that
//      round_delete_rules_test.js pins (rows S1, S4, S5, O1) is in the repo file
//      and is NOT in the database. Rows X3 and X5 below assert the live
//      behaviour rather than the one the repo file describes.
//
// THE DELTA IS ONE OR-TERM, inside the clause that already governs an existing
// round:
//
//   || (auth != null && data.hasChild('ownerUid')
//       && auth.uid === data.child('ownerUid').val())
//
// so a signed-in client whose uid IS the round's ownerUid may delete it whatever
// it holds. Everyone else is bit-for-bit unchanged: a non-owner, an anonymous
// code-holder and an unauthenticated visitor are all still refused on a played
// round, and a LEGACY round - one with no ownerUid at all - cannot reach the new
// term, so nothing about it moves.
//
// WHY THIS IS NOT A WEAKENING WORTH ARGUING ABOUT. The guard it relaxes was
// never a security boundary: the two-write walkaround (delete events/<code>/
// scores, then delete the round) has always been open to ANY code-holder, and
// still is - row X4. What the guard actually stopped was the OWNER, on their own
// round, doing in one tap what a stranger could already do in two. The accident
// it was protecting against is now handled where accidents belong, in the
// confirm: the owner is told how many golfers' scores go with it.
//
// BASELINE, measured over the FINISHED file against main (d003ecf, with the two
// new rules files moved aside and restored by sha), all 12 tests:
// 4 PASS / 8 FAIL. 4 + 8 = 12.
//   The four that pass are the ones that do not need the file to exist: the
//   table's own shape, the LIVE column (which is about the published file and is
//   the point of having a live column at all), "exactly one row moves" (a
//   property of the table, which is why it is cheap and worth having), and the
//   sha pin on the live base. Everything that reads
//   database.rules.ownerdelete.json - every expectation, the delta pin, the
//   rollback pin and all five controls - is red there, because a rules file has
//   no partial state: it is the old one or the new one.
//   The two that pass are the table's own shape checks - that it has both
//   verdicts, a null-auth row, an anonymous row and a reason on every row - which
//   are assertions about this file and not about any ruleset. Every row, every
//   structural pin and every control is red there, because the file to publish
//   does not exist: a rules file has no partial state.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const LIVE = path.join(REPO, 'database.rules.push.json');                  // measured live 2026-10-05
const NEXT = path.join(REPO, 'database.rules.ownerdelete.json');           // for Grok to publish
const ROLLBACK = path.join(REPO, 'database.rules.rollback-ownerdelete.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

const ME = 'u-me';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const PLAYERS = [{ id: 101, name: 'Dale Whitmore' }, { id: 102, name: 'Marty Marshall' }];
const BASE = { eventName: 'Saturday', gameFormat: 'stroke', courseData: CD, players: PLAYERS };

const ROOT = {
    events: {
        // The round Manny was looking at: his, and played.
        OWNED_PLAYED: Object.assign({}, BASE, { ownerUid: ME, organizerToken: 'tok',
            scores: { p101_h1: 4, p102_h1: 5 }, sideMatches: { m1: { stake: 10 } } }),
        // His, and nobody has teed off.
        OWNED_EMPTY: Object.assign({}, BASE, { ownerUid: ME, organizerToken: 'tok' }),
        // No owner recorded at all - every round from before the owner wave.
        LEGACY_PLAYED: Object.assign({}, BASE, { scores: { p101_h1: 4 } }),
        // SOMEBODY ELSE'S round, played. Two owners in one database is the state
        // the real database is always in, and it is what makes "the owner" mean
        // the owner OF THIS ROUND rather than an owner of something.
        OTHERS_PLAYED: Object.assign({}, BASE, { ownerUid: 'u-other', scores: { p101_h1: 4 } })
    },
    organizers: { [ME]: { firstSeenAt: 1 } },
    trips: {}, tournaments: {}, global_courses: {}, app_settings: {}
};
const USERS = {
    nobody: null,
    me: { uid: ME, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } },
    other: { uid: 'u-other', provider: 'password', token: { email: 'x@y.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    anon: { uid: 'u-anon', provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } }
};

// `live` is what the SAME row does under the file published today, so the
// difference this publish makes is measured rather than described.
const W = [
    // ---- THE DELTA, and it is one row -----------------------------------
    { id: 'D1', what: 'the OWNER deletes their own PLAYED round', who: 'me', next: 'allow', live: 'refuse',
      site: 'index.html endAndClearRound, on the device signed in as the round owner',
      why: 'THE POINT OF THE PUBLISH. Manny, round ZSGZWH: his round, his uid on it, eight '
         + 'scores, and the database refused the delete. One tap must do what a stranger '
         + 'could already do in two writes.' },

    // ---- MANNY'S THREE CONTROLS, stated as rows -------------------------
    { id: 'D2', what: 'a DIFFERENT signed-in golfer deletes that played round', who: 'other', next: 'refuse', live: 'refuse',
      site: 'not a call site - the scorecard hides the button, and this is the rule behind it',
      why: 'the whole delta is the uid comparison. If this ever allows, the term is not '
         + 'comparing anything and every played round in the database is one tap from gone.' },
    { id: 'D3', what: 'an ANONYMOUS code-holder deletes that played round', who: 'anon', next: 'refuse', live: 'refuse',
      site: 'not a call site - a golfer who was handed the round link',
      why: 'THE REALISTIC ATTACKER AND THE REALISTIC ACCIDENT. Every golfer in a round is '
         + 'signed in anonymously by auth-boot, so "signed in" is not a credential here - '
         + 'only being the owner is.' },
    { id: 'D4', what: 'an unauthenticated visitor deletes that played round', who: 'nobody', next: 'refuse', live: 'refuse',
      site: 'not a call site - a bare client with the code',
      why: 'auth is null, so auth.uid must not slip through the comparison' },

    // ---- what must NOT move ---------------------------------------------
    { id: 'D5', what: 'the owner deletes their own UNPLAYED round', who: 'me', next: 'allow', live: 'allow',
      site: 'the same button, on a round set up wrong before anyone teed off',
      why: 'already allowed, and the delta must not be the thing that starts allowing it' },
    { id: 'D6', what: 'a code-holder deletes an UNPLAYED round', who: 'anon', next: 'allow', live: 'allow',
      site: 'not a call site - the scorecard shows the button to the organizer only',
      why: 'DOCUMENTED, NOT ENDORSED, and unchanged by this delta: the live rule has always '
         + 'let anyone bin a round nobody has played. Asserted so the publish is not blamed '
         + 'for it later.' },
    { id: 'D7', what: 'anybody deletes a LEGACY played round (no ownerUid)', who: 'anon', next: 'refuse', live: 'refuse',
      site: 'not a call site - every round created before the owner wave',
      why: 'the new term needs an ownerUid to compare against, so a legacy round cannot reach '
         + 'it. These are the rounds most exposed to an accident and nothing about them moves.' },
    { id: 'D8', what: 'the owner-by-uid deletes a LEGACY played round', who: 'me', next: 'refuse', live: 'refuse',
      site: 'not a call site - the same organizer, on a round that never recorded who made it',
      why: 'data.hasChild(ownerUid) is false, so there is nobody to be. The app keeps refusing '
         + 'this one before the confirm, which is why its sentence stays in index.html.' },

    // ---- normal traffic, which a rules wave must never touch -------------
    { id: 'X1', what: 'a scorekeeper posts a score', who: 'nobody', next: 'allow', live: 'allow',
      site: 'index.html saveScore',
      why: 'the most common write in the app; a delta that went near it would be felt on every hole' },
    { id: 'X2', what: 'a scorekeeper clears a score', who: 'anon', next: 'allow', live: 'allow',
      site: 'index.html saveScore with an empty box',
      why: 'a child delete - newData at $eventCode still exists - and corrections must keep working' },
    { id: 'X3', what: 'a code-holder overwrites an owned played round with an empty one', who: 'anon', next: 'allow', live: 'allow',
      site: 'not a call site - the overwrite hole',
      why: 'DOCUMENTED, NOT ENDORSED. This destroys a round as completely as a delete and is '
         + 'not a delete, so no rule keyed on newData.exists() sees it. It is open TODAY and '
         + 'this delta neither opens nor closes it - asserted so the suite carries the gap '
         + 'rather than a report nobody re-reads.' },
    { id: 'X4', what: 'WALKAROUND: a code-holder deletes the scores node', who: 'anon', next: 'allow', live: 'allow',
      site: 'not a call site - step one of the two-write bypass',
      why: 'the reason the guard this delta relaxes was never a boundary: anyone could already '
         + 'do this, and then delete the scoreless round' },
    { id: 'X5', what: 'a code-holder rewrites the roster on an owned round', who: 'anon', next: 'allow', live: 'allow',
      site: 'not a call site',
      why: 'MEASURED, AND NOT WHAT THE REPO FILE SAYS. database.rules.json describes owner-only '
         + 'setup; the LIVE file has no such clause, so this is allowed today. Recorded here so '
         + 'the next rules wave starts from the database rather than from the repo.' },
    { id: 'D9', what: 'an owner deletes SOMEBODY ELSE\'S played round', who: 'me', next: 'refuse', live: 'refuse',
      site: 'not a call site - the same tap, on a round this device did not create',
      why: 'being AN owner is not being THIS round\'s owner. The comparison is against the '
         + 'record being written, and a database with two owners in it is the only one that '
         + 'can tell the difference.' },
    { id: 'X6', what: 'the owner writes themselves a pass', who: 'me', next: 'refuse', live: 'refuse',
      site: 'not a call site - the monetization gate',
      why: 'an earlier publish closed this and a later one must not loosen it' }
];

function dataFile(which) {
    const tests = {};
    W.forEach((row) => {
        const want = which === 'live' ? row.live : row.next;
        const e = tests[row.path || pathOf(row)] || {};
        const bucket = want === 'allow' ? 'canWrite' : 'cannotWrite';
        e[bucket] = (e[bucket] || []).concat([{ auth: row.who, data: dataOf(row) }]);
        tests[pathOf(row)] = e;
    });
    const f = path.join(os.tmpdir(), 'owner-delete-' + which + '-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests: tests }, null, 1));
    return f;
}
// The path and payload each row stands for, kept beside the row ids so the table
// above reads as scenarios rather than as JSON.
const PATHS = {
    D1: ['events/OWNED_PLAYED', null], D2: ['events/OWNED_PLAYED', null],
    D3: ['events/OWNED_PLAYED', null], D4: ['events/OWNED_PLAYED', null],
    D5: ['events/OWNED_EMPTY', null], D6: ['events/OWNED_EMPTY', null],
    D7: ['events/LEGACY_PLAYED', null], D8: ['events/LEGACY_PLAYED', null],
    X1: ['events/OWNED_PLAYED/scores/p101_h2', 4],
    X2: ['events/OWNED_PLAYED/scores/p101_h1', null],
    X3: ['events/OWNED_PLAYED', { gameFormat: 'stroke', players: [], courseData: [], ownerUid: ME }],
    X4: ['events/OWNED_PLAYED/scores', null],
    X5: ['events/OWNED_PLAYED/players', []],
    D9: ['events/OTHERS_PLAYED', null],
    X6: ['organizers/' + ME + '/pass', { kind: 'founder', expiresAt: 4102444800000 }]
};
const pathOf = (r) => PATHS[r.id][0];
const dataOf = (r) => PATHS[r.id][1];

function run(rulesPath, which) {
    try { return { code: 0, out: execFileSync(TARGARYEN, [rulesPath, dataFile(which)], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') }; }
}
// A mutated ruleset, written to a temp path. NO REPO FILE IS TOUCHED, so there is
// nothing to restore - the controls run on a copy.
function mutated(fn) {
    const d = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
    fn(d);
    const f = path.join(os.tmpdir(), 'owner-delete-ctl-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    return f;
}
const WRITE = (d) => d.rules.events.$eventCode['.write'];
const setWrite = (d, v) => { d.rules.events.$eventCode['.write'] = v; };

describe('THE OWNER DELETE DELTA, AND THE LINE IT DOES NOT CROSS', () => {

    test('the table has both verdicts, a null-auth row, an anonymous row, and a reason each', () => {
        assert.ok(W.filter((r) => r.next === 'allow').length >= 5,
            'a table of refusals is satisfied by a ruleset that refuses everything');
        assert.ok(W.filter((r) => r.next === 'refuse').length >= 5);
        assert.ok(W.some((r) => r.who === 'nobody' && r.next === 'refuse'), 'no null-auth row');
        assert.ok(W.some((r) => r.who === 'anon' && r.next === 'refuse'),
            'every golfer in a round is anonymous, so an anonymous refusal is the one that matters');
        assert.ok(W.some((r) => r.who === 'me' && r.next === 'allow'), 'nothing proves the grant');
        W.forEach((r) => {
            assert.ok(r.why && r.why.length > 25, r.id + ' must say why');
            assert.ok(r.site && r.site.length > 10, r.id + ' must name the call site it stands for');
            assert.ok(PATHS[r.id], r.id + ' has no path');
        });
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
    });

    test('EVERY expectation holds against the FILE TO BE PUBLISHED', () => {
        const { code, out } = run(NEXT, 'next');
        assert.equal(code, 0, 'targaryen disagreed with database.rules.ownerdelete.json:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and the SAME rows behave as recorded against the file that is LIVE TODAY', () => {
        // So the difference this publish makes is measured, not described: one row
        // moves, D1, and thirteen do not.
        const { code, out } = run(LIVE, 'live');
        assert.equal(code, 0, 'the live column is wrong:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('EXACTLY ONE ROW MOVES, and it is the owner on their own played round', () => {
        const moved = W.filter((r) => r.next !== r.live);
        assert.deepEqual(moved.map((r) => r.id), ['D1'],
            'the publish changes more than the one thing it is for: ' + JSON.stringify(moved.map(r => r.id)));
        assert.equal(moved[0].who, 'me');
        assert.equal(moved[0].live, 'refuse');
        assert.equal(moved[0].next, 'allow');
    });

    test('THE DELTA IS ONE STRING, and nothing else in the ruleset moved', () => {
        assert.ok(fs.existsSync(NEXT), 'database.rules.ownerdelete.json is what Grok publishes');
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
        assert.deepEqual(changed, ['/rules/events/$eventCode/.write'],
            'the publish touched more than the events write rule: ' + JSON.stringify(changed));
        // AND THE DIFFERENCE INSIDE THAT STRING IS AN ADDED OR-TERM, not a rewrite:
        // the live rule survives verbatim inside the new one.
        const a = WRITE(live), b = WRITE(next);
        assert.ok(b.length > a.length, 'the new rule is not longer - something was removed');
        assert.match(b, /\|\| \(auth != null && data\.hasChild\('ownerUid'\) && auth\.uid === data\.child\('ownerUid'\)\.val\(\)\)/);
        assert.equal(b.replace(" || (auth != null && data.hasChild('ownerUid') && auth.uid === data.child('ownerUid').val())", ''), a,
            'the live rule does not survive verbatim inside the new one');
    });

    test('THE ROLLBACK IS BYTE-IDENTICAL TO WHAT IS LIVE', () => {
        assert.ok(fs.existsSync(ROLLBACK), 'a publish with no rollback copy is a publish nobody can undo');
        assert.equal(fs.readFileSync(ROLLBACK, 'utf8'), fs.readFileSync(LIVE, 'utf8'),
            'the rollback must be the live file exactly - not a reconstruction of it');
    });

    test('and the live file this delta is built on is RECORDED, not assumed', () => {
        // Read out of the database with the service account on 2026-10-05 and
        // compared against every rules file in the repo. The sha is here so the
        // next wave can tell at a glance whether it is still the base.
        const crypto = require('crypto');
        const sha = crypto.createHash('sha256').update(fs.readFileSync(LIVE)).digest('hex');
        assert.equal(sha.slice(0, 16), '955ffd4a6ea2e1c5',
            'database.rules.push.json has moved since it was verified against the live database - '
            + 're-read .settings/rules.json before publishing anything built on it');
        // AND THE REPO'S OWN FILE IS NOT IT, said out loud so nobody treats
        // database.rules.json as the base for the next delta.
        const repo = fs.readFileSync(path.join(REPO, 'database.rules.json'), 'utf8');
        assert.notEqual(repo, fs.readFileSync(LIVE, 'utf8'),
            'database.rules.json now matches live - if that was a deliberate publish, this '
            + 'file and rules_push_tokens_test.js both need their base re-pointed');
    });

    test('CONTROL: without the new term, the owner is refused again', () => {
        // The grant is the whole publish. If D1 still passes with the term gone,
        // this table is not measuring the thing it was written for.
        const f = mutated((d) => setWrite(d,
            WRITE(d).replace(" || (auth != null && data.hasChild('ownerUid') && auth.uid === data.child('ownerUid').val())", '')));
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'the owner row passes without the term that grants it - the row is inert');
    });

    test('CONTROL: comparing nothing lets every signed-in golfer delete a played round', () => {
        // The uid comparison is the only thing between "the owner" and "anyone
        // with an account", and every golfer in a round has one.
        const f = mutated((d) => setWrite(d,
            WRITE(d).replace("(auth != null && data.hasChild('ownerUid') && auth.uid === data.child('ownerUid').val())", 'auth != null')));
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0, 'a signed-in stranger could delete a played round and the table did not notice');
        assert.match(out, /OWNED_PLAYED/, 'it failed somewhere else: ' + out.slice(-600));
    });

    test('CONTROL: dropping the ownerUid existence check reaches the legacy rounds', () => {
        // data.child('ownerUid').val() is null on a legacy round. Comparing a uid
        // to null is false, so this control may well be INERT - and if it is, that
        // is the finding, not a reason to invent an assertion. Asserted either way
        // below, with the outcome named.
        const f = mutated((d) => setWrite(d,
            WRITE(d).replace("data.hasChild('ownerUid') && ", '')));
        const { code } = run(f, 'next');
        // targaryen evaluates the comparison rather than throwing, so a legacy
        // round still refuses and this control is INERT. It is kept because it
        // says WHY the hasChild is there - belt, not braces - and because a
        // future rules engine that treated a missing child differently would make
        // it fire.
        assert.equal(code, 0,
            'the hasChild guard turned out to be load-bearing after all - say so in this '
            + 'header and keep the control, because that is a stronger result than inert');
    });

    test('CONTROL: an owner term that ignores the round deletes the wrong things', () => {
        // The term is scoped to data at $eventCode. Pointing it at the ROOT owner
        // of nothing in particular is the mistake a copy-paste makes.
        const f = mutated((d) => setWrite(d,
            WRITE(d).replace("data.child('ownerUid').val()", "root.child('events/OTHERS_PLAYED/ownerUid').val()")));
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0,
            'the owner of ONE round could delete another, and the table did not notice');
        assert.match(out, /OWNED_PLAYED/, 'it failed somewhere else: ' + out.slice(-600));
    });

    test('CONTROL: the scores guard still refuses everyone who is not the owner', () => {
        // The other direction. Removing !data.hasChild('scores') must not be what
        // is holding D2/D3/D4 up - if it were, the refusals would be about the
        // round having scores rather than about who is asking.
        const f = mutated((d) => setWrite(d, WRITE(d).replace(" || !data.hasChild('scores')", '')));
        const { code, out } = run(f, 'next');
        assert.notEqual(code, 0, 'nothing broke, so no row depended on the scores clause at all');
        assert.match(out, /OWNED_EMPTY/,
            'the scores clause is what lets an unplayed round be binned; its removal should show there');
    });
});
