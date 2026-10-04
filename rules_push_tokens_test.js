// ============================================================================
// THE PUSH NODES: A TOKEN IS A CAPABILITY, SO NOBODY ELSE MAY SEE IT
//
// NOT PUBLISHED. database.rules.push.json is prepared for Grok to publish and
// this file is the proof of what it does and - more importantly - what it does
// not. The rollback is database.rules.rollback-stage2delete.json, which is a
// byte-identical copy of what is live today.
//
// WHAT IS LIVE RIGHT NOW is database.rules.stage2delete.json, published
// 2026-09-30 ~4:40 AM Phoenix. Note that the repo's own database.rules.json is
// NOT that file - it predates the My Groups and organizer-delete publishes - so
// the base for this delta is stage2delete, and a test below pins that.
//
// THE WHOLE DELTA: two new TOP-LEVEL nodes, pushTokens and pushPrefs, each
// readable and writable only by the uid that owns it. NOTHING UNDER events/
// CHANGES, and a test asserts the events parent is byte-identical - rounds,
// scores, side matches and money are what the whole app does, and a push wave
// has no business near them.
//
// WHY A TOKEN IS OWNER-READ AND NOT WORLD-READ. An FCM token is a capability:
// anyone holding one can push to that phone. Everything else in this app that
// is world-readable - a round, the course list - is content. A token is not
// content, so `.read` is the owner alone, and no client can enumerate anybody
// else's devices. THE SENDER DOES NOT NEED A GRANT HERE: a Cloudflare Function
// holding the service account bypasses rules entirely, so there is nothing to
// open up for it. That is the whole reason this delta can be this small.
//
// WHY pushPrefs HAS NO `essentials` KEY. It cannot be turned off - the three
// notifications a golfer relies on to be at the right tee and to find out what
// they owe - so push-notify.js forces it true whatever arrives. Storing it would
// be storing a value nothing reads, and a stored `false` could then only mean a
// bug. The $other validate below refuses the key outright.
//
// THE EMULATOR CANNOT CHECK ANY OF THIS, and that is recorded rather than worked
// around: measured in Wave 34, the RTDB emulator refuses to load this ruleset
// ("Illegal regular expression, 'whitespacechar' not found" at the email regex)
// and cannot enforce rules over REST at all - a `.write: false` path answered 200
// with no auth. So enforcement here is targaryen, the harness all of this repo's
// rules suites use.
//
// BASELINE, measured against pre-build main, over the FINISHED file, all 12
// tests: 0 PASS / 12 FAIL - database.rules.push.json does not exist there, so
// every row refuses and every structural pin fails. There is no partial state
// for a rules file to be in: it is the old one or the new one.
//
// RE-MEASURED when challenges joined the file: this header was first written
// against a 9-test version, and three controls came with the new node.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const LIVE = path.join(REPO, 'database.rules.stage2delete.json');      // published today
const NEXT = path.join(REPO, 'database.rules.push.json');              // for Grok to publish
const ROLLBACK = path.join(REPO, 'database.rules.rollback-stage2delete.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

const ME = 'u-me';
const ROOT = {
    events: { ZZTEST: { eventName: 'Thursday', ownerUid: ME, scores: { p101_h1: 4 },
        challenges: { c1: { from: '101', to: '102', status: 'pending', createdAt: 1,
            terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20, pressRule: 'none' } } } } },
    organizers: { [ME]: { firstSeenAt: 1 } },
    pushTokens: { [ME]: { dev1: { token: 'apns-aaa', playerId: '101', at: 1 } } },
    pushPrefs: { [ME]: { bets: true, hype: true } }
};
const USERS = {
    nobody: null,
    me: { uid: ME, provider: 'password', token: { email: 'me@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', provider: 'password', token: { email: 'x@y.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    anon: { uid: 'u-anon', provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } }
};

// EVERY ROW SAYS WHAT IT IS FOR, and `live` is what the SAME row does under the
// file that is published today - so the difference this publish makes is
// measured rather than asserted.
const W = [
    { id: 'T1', what: 'I register my own device', who: 'me', next: 'allow', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-bbb', playerId: '102', at: 1 },
      why: 'the point of the delta - without it the $other catch-all refuses every push write' },
    { id: 'T2', what: 'somebody else writes a token into MY subtree', who: 'other', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-evil', playerId: '102', at: 1 },
      why: 'a token in my subtree is a phone the sender will buzz as me - this is the hijack' },
    { id: 'T3', what: 'an unauthenticated visitor writes a token', who: 'nobody', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-evil', playerId: '102', at: 1 },
      why: 'a null auth must not slip through auth.uid === $uid' },
    { id: 'T4', what: 'an ANONYMOUS golfer registers their own device', who: 'anon', next: 'allow', live: 'refuse',
      path: 'pushTokens/u-anon/dev1', data: { token: 'apns-ccc', playerId: '103', at: 1 },
      why: 'most golfers in a round are anonymous - auth-boot signs them in that way, and a '
         + 'rule that only admitted email accounts would ship a feature almost nobody could use' },
    { id: 'T5', what: 'I remove my own device', who: 'me', next: 'allow', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev1', data: null,
      why: 'a token must be removable by its owner - a device that is gone must stop being buzzed' },
    { id: 'T6', what: 'a token with no playerId', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-bbb', at: 1 },
      why: 'a token without a player is a device the sender cannot address - it would be stored and never used' },
    { id: 'T7', what: 'a 900-character token', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'x'.repeat(900), playerId: '101', at: 1 },
      why: 'the only unbounded string a client can write here, so it is bounded' },
    { id: 'T8', what: 'a stamp in the future', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-bbb', playerId: '101', at: 4102444800000 },
      why: 'the same now-bound every other timestamp in this ruleset carries' },
    { id: 'T9', what: 'a stray key smuggled into a token record', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushTokens/' + ME + '/dev2', data: { token: 'apns-bbb', playerId: '101', at: 1, pass: 'founder' },
      why: 'an open record under a writable node is a place to park anything, and this database '
         + 'already learned that with the $other catch-all' },
    { id: 'P1', what: 'I turn my own bets channel off', who: 'me', next: 'allow', live: 'refuse',
      path: 'pushPrefs/' + ME + '/bets', data: false,
      why: 'the settings screen writes exactly this' },
    { id: 'P2', what: 'somebody else turns MY hype off', who: 'other', next: 'refuse', live: 'refuse',
      path: 'pushPrefs/' + ME + '/hype', data: false,
      why: 'owner-only, same as the tokens' },
    { id: 'P3', what: 'a non-boolean preference', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushPrefs/' + ME + '/bets', data: 'yes',
      why: 'pushPrefsNormalise coerces on the way out, and the store should not hold junk either way' },
    { id: 'P4', what: 'an essentials:false smuggled in', who: 'me', next: 'refuse', live: 'refuse',
      path: 'pushPrefs/' + ME + '/essentials', data: false,
      why: 'ESSENTIALS CANNOT BE TURNED OFF. A stored false would be a value nothing reads that '
         + 'one day disagrees with the code - so the key is refused rather than ignored' },
    { id: 'X1', what: 'a scorekeeper posts a score', who: 'nobody', next: 'allow', live: 'allow',
      path: 'events/ZZTEST/scores/p101_h2', data: 4,
      why: 'the most common write in the app, and this delta must not go near it' },
    { id: 'X2', what: 'the owner still cannot write themselves a pass', who: 'me', next: 'refuse', live: 'refuse',
      path: 'organizers/' + ME + '/pass', data: { kind: 'founder', expiresAt: 4102444800000 },
      why: 'the Wave 34 delta still stands - a later publish must not loosen an earlier one' },

    // ---- CHALLENGES, AND WHAT THIS DELTA ACTUALLY ADDS ----
    //
    // MEASURED, AND IT IS NOT WHAT I EXPECTED. Under the file that is LIVE today,
    // EVERY ONE of these eleven writes is ALLOWED - including a made-up status, a
    // golfer challenging himself, a $100,001 stake, a start hole of 19 and a
    // stray key. The `live` column below says so on every row.
    //
    // WHY: `.write` at events/$eventCode governs its whole subtree, and an
    // unknown child has no .validate, so the database would already accept
    // arbitrary junk at events/<code>/challenges. The permission was never the
    // missing piece.
    //
    // SO THIS DELTA IS A VALIDATION, NOT A GRANT, and that is the honest way to
    // describe it to whoever publishes it. The write model is deliberately the one
    // sideMatches already uses - the gate is that the round exists - because a
    // following player holds no scorekeeper link and must still be able to ASK,
    // and a challenge holds LESS than a side match does: no money moves until it
    // is accepted, and accepting writes a sideMatch through the normal path.
    //
    // The three rows that stay ALLOW under the new file are the three the feature
    // needs: offer, answer, withdraw. The other eight are shapes that would
    // otherwise sit in the database waiting for Accept to read them.
    { id: 'C1', what: 'a golfer offers a challenge', who: 'nobody', next: 'allow', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 1, terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20, pressRule: 'none' } },
      why: 'the point of the delta - a following player has no scorekeeper link and must still be able to ASK' },
    { id: 'C2', what: 'the answer is written', who: 'nobody', next: 'allow', live: 'allow',
      path: 'events/ZZTEST/challenges/c1/status', data: 'accepted',
      why: 'accept and decline are the whole point of a pending record' },
    { id: 'C3', what: 'a challenge is withdrawn', who: 'nobody', next: 'allow', live: 'allow',
      path: 'events/ZZTEST/challenges/c1', data: null,
      why: 'a challenger who changes their mind leaves nothing behind' },
    { id: 'C4', what: 'a made-up status', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c1/status', data: 'half-accepted',
      why: 'the status vocabulary is closed - a reader switching on it needs it finite' },
    { id: 'C5', what: 'a challenge with no terms', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2', data: { from: '101', to: '102', status: 'pending', createdAt: 1 },
      why: 'a bet nobody can read the terms of cannot be accepted, and would sit pending for ever' },
    { id: 'C6', what: 'a challenge against yourself', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '101', status: 'pending', createdAt: 1, terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20 } },
      why: 'a match needs two sides, and the engine would price a golfer against himself' },
    { id: 'C7', what: 'a made-up format', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 1, terms: { format: 'skins', scoring: 'net', startHole: 1, stake: 20 } },
      why: 'Accept would have to build a side match out of it, and only three formats have a builder' },
    { id: 'C8', what: 'a stake above the money ceiling', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 1, terms: { format: 'match', scoring: 'net', startHole: 1, stake: 100001 } },
      why: 'the same [0, 100000] bound every other money field in this ruleset carries' },
    { id: 'C9', what: 'a stray key smuggled into the terms', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 1, terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20, payout: 999 } },
      why: 'an open terms record under a writable node is a place to park anything, and Accept reads terms' },
    { id: 'C10', what: 'a start hole of 19', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 1, terms: { format: 'match', scoring: 'net', startHole: 19, stake: 20 } },
      why: 'a bet that starts after the round is over cannot be settled, and the creator refuses it too' },
    { id: 'C11', what: 'a createdAt in the future', who: 'nobody', next: 'refuse', live: 'allow',
      path: 'events/ZZTEST/challenges/c2',
      data: { from: '101', to: '102', status: 'pending', createdAt: 4102444800000, terms: { format: 'match', scoring: 'net', startHole: 1, stake: 20 } },
      why: 'the same now-bound every other timestamp in this ruleset carries' }
];

// READS ARE THEIR OWN TABLE, because canRead takes a bare user name.
const R = [
    { id: 'R1', what: 'I read my own tokens', who: 'me', next: 'allow', path: 'pushTokens/' + ME },
    { id: 'R2', what: 'somebody else reads my tokens', who: 'other', next: 'refuse', path: 'pushTokens/' + ME },
    { id: 'R3', what: 'an unauthenticated visitor reads my tokens', who: 'nobody', next: 'refuse', path: 'pushTokens/' + ME },
    { id: 'R4', what: 'I read my own prefs', who: 'me', next: 'allow', path: 'pushPrefs/' + ME },
    { id: 'R5', what: 'somebody else reads my prefs', who: 'other', next: 'refuse', path: 'pushPrefs/' + ME }
];

function dataFile(which) {
    const tests = {};
    W.forEach((row) => {
        const want = which === 'live' ? row.live : row.next;
        const e = tests[row.path] || {};
        const bucket = want === 'allow' ? 'canWrite' : 'cannotWrite';
        e[bucket] = (e[bucket] || []).concat([{ auth: row.who, data: row.data }]);
        tests[row.path] = e;
    });
    if (which !== 'live') {
        R.forEach((row) => {
            const e = tests[row.path] || {};
            const bucket = row.next === 'allow' ? 'canRead' : 'cannotRead';
            e[bucket] = (e[bucket] || []).concat([row.who]);
            tests[row.path] = e;
        });
    }
    const f = path.join(os.tmpdir(), 'rules-push-' + which + '-' + process.pid + '.json');
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
    const d = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
    fn(d);
    const f = path.join(os.tmpdir(), 'rules-push-ctl-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    return f;
}

describe('THE PUSH NODES, AND THE LINE THEY DO NOT CROSS', () => {

    test('the table has both verdicts, a null-auth row, an anonymous row, and a reason each', () => {
        assert.ok(W.filter((r) => r.next === 'allow').length >= 5,
            'a table of refusals is satisfied by a ruleset that refuses everything');
        assert.ok(W.filter((r) => r.next === 'refuse').length >= 8);
        assert.ok(W.filter((r) => r.id[0] === 'C').length >= 10,
            'the challenges node is new and money-adjacent - it needs more than a row or two');
        assert.ok(W.some((r) => r.who === 'nobody' && r.next === 'refuse'));
        assert.ok(W.some((r) => r.who === 'anon' && r.next === 'allow'),
            'most golfers in a round are anonymous - a rule that excluded them would ship a '
            + 'feature almost nobody could use');
        W.forEach((r) => assert.ok(r.why && r.why.length > 25, r.id + ' must say why'));
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
    });

    test('THE DELTA IS EXACTLY TWO TOP-LEVEL NODES, and nothing else moved', () => {
        assert.ok(fs.existsSync(NEXT), 'database.rules.push.json is what Grok publishes');
        const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
        const next = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
        const added = [];
        (function walk(a, b, p) {
            Object.keys(b).forEach((k) => {
                if (!(k in a)) { added.push(p + '/' + k); return; }
                if (typeof b[k] === 'object' && b[k] && typeof a[k] === 'object' && a[k]) walk(a[k], b[k], p + '/' + k);
                else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) added.push('CHANGED ' + p + '/' + k);
            });
            Object.keys(a).forEach((k) => { if (!(k in b)) added.push('REMOVED ' + p + '/' + k); });
        })(live, next, '');
        assert.deepEqual(added.sort(), ['/rules/events/$eventCode/challenges',
                                       '/rules/pushPrefs', '/rules/pushTokens'].sort(),
            'the publish must add exactly these three and change nothing else: ' + JSON.stringify(added));
    });

    test('EVERY NODE THAT COUNTS MONEY IS BYTE-IDENTICAL - events/ gains one child and nothing moves', () => {
        // Rounds, scores, side matches and money are what the whole app does.
        //
        // events/ IS NO LONGER BYTE-IDENTICAL AS A WHOLE, and that is the one
        // thing this wave changes about it: challenges/ is a NEW CHILD. Asserted
        // child by child instead, so the claim gets stronger rather than weaker -
        // scores, sideMatches, matchPresses, ownerUid and the parent .write are
        // all pinned individually, and a publish that touched any of them fails
        // here even though the parent has legitimately changed.
        const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
        const next = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
        Object.keys(live.rules).forEach((k) => {
            if (k === 'events') return;
            assert.equal(JSON.stringify(next.rules[k]), JSON.stringify(live.rules[k]),
                'the publish changed ' + k);
        });
        const a = live.rules.events.$eventCode;
        const b = next.rules.events.$eventCode;
        Object.keys(a).forEach((k) => {
            assert.equal(JSON.stringify(b[k]), JSON.stringify(a[k]),
                'the publish changed events/$eventCode/' + k);
        });
        assert.deepEqual(Object.keys(b).filter((k) => !(k in a)), ['challenges'],
            'events/$eventCode gained something other than challenges');
        // AND THE MONEY CHILDREN BY NAME, because "every key" is satisfied by a
        // ruleset in which those keys happen not to exist.
        ['scores', 'sideMatches', 'matchPresses', 'strokePresses', 'ownerUid', '.write']
            .forEach((k) => assert.ok(k in b, 'events/$eventCode lost ' + k));
    });

    test('THE ROLLBACK IS BYTE-IDENTICAL TO WHAT IS LIVE', () => {
        assert.ok(fs.existsSync(ROLLBACK), 'a publish with no rollback copy is a publish nobody can undo');
        assert.equal(fs.readFileSync(ROLLBACK, 'utf8'), fs.readFileSync(LIVE, 'utf8'),
            'the rollback must be the live file exactly - not a reconstruction of it');
    });

    test('EVERY expectation holds against the FILE TO BE PUBLISHED', () => {
        const { code, out } = run(NEXT, 'next');
        assert.equal(code, 0, 'targaryen disagreed with database.rules.push.json:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and the SAME rows behave as recorded against the file that is LIVE TODAY', () => {
        // So the difference this publish makes is measured, not described. Every
        // push row refuses under the live file - the $other catch-all - and the
        // two round rows behave identically, which is the claim.
        const { code, out } = run(LIVE, 'live');
        assert.equal(code, 0, 'the live column is wrong:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('CONTROL: world-readable tokens are caught', () => {
        // A token is a capability. If `.read` were ever widened to true, every
        // golfer could enumerate every phone in the database - and nothing else
        // in this file would notice.
        const f = mutated((d) => { d.rules.pushTokens.$uid['.read'] = true; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'a world-readable pushTokens passed the suite - the read rows are inert');
    });

    test('CONTROL: dropping the uid check lets anybody write anybody a token', () => {
        const f = mutated((d) => { d.rules.pushTokens.$uid['.write'] = 'auth != null'; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'any signed-in golfer could register a phone as somebody else');
    });

    test('CONTROL: dropping the terms validate lets anything into a challenge', () => {
        // Accept READS terms and builds a side match out of them, so an open terms
        // record is a way to put arbitrary keys in front of the payload builder.
        const f = mutated((d) => { delete d.rules.events.$eventCode.challenges.$challengeId.terms['$other']; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'a stray key passed the suite - the terms validate is decoration');
    });

    test('CONTROL: dropping the status vocabulary lets a made-up status through', () => {
        const f = mutated((d) => { delete d.rules.events.$eventCode.challenges.$challengeId.status; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'any string became a status - a reader cannot switch on that');
    });

    test('CONTROL: dropping the self-challenge check lets a golfer bet himself', () => {
        const f = mutated((d) => {
            const v = d.rules.events.$eventCode.challenges.$challengeId['.validate'];
            d.rules.events.$eventCode.challenges.$challengeId['.validate'] =
                v.replace(" && newData.child('from').val() !== newData.child('to').val()", '');
        });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0, 'the engine would price a golfer against himself');
    });

    test('CONTROL: dropping the record validate lets a stray key through', () => {
        const f = mutated((d) => { delete d.rules.pushTokens.$uid.$deviceId['$other']; });
        const { code } = run(f, 'next');
        assert.notEqual(code, 0,
            'an open record under a writable node is a place to park anything - and this is the '
            + 'control that proves the $other validate is doing work rather than decorating');
    });
});
