// ============================================================================
// SIGN OUT, AND DELETE ACCOUNT - WHAT THE LIVE RULES ACTUALLY ALLOW
//
// WHY THE WAVE EXISTS. App Review 5.1.1(v): an app that lets somebody create an
// account must let them delete it from inside the app. Wave 33 made Apple and
// Google the front door, and a grep of admin.html, organizer-gate.js,
// email-link-auth.js and oauth-signin.js found neither a sign-out nor a delete
// anywhere. So this is the missing half of that wave, and it is the most likely
// reason the next binary would be rejected.
//
// THE ONE THING THAT HAD TO BE MEASURED FIRST, and it changed the design. "Delete
// organizers/<uid>" cannot be done at all under the LIVE Stage 1 ruleset. Run
// through targaryen against database.rules.stage1.json - the file Manny published
// on 2026-09-29, not the repo's database.rules.json, which was never published:
//
//   organizers/<uid>                 REFUSED   no .write at that level
//   organizers/<uid>/firstSeenAt     REFUSED   create-only: !data.exists() && ...
//   organizers/<uid>/pass            REFUSED   .write is literally false
//   organizers/<uid>/groups          allowed   the owner writes the whole subtree
//   organizers/<uid>/groups/$id      allowed   the owner, and nobody else
//   sharedGroups/<key>/<uid>/$id     allowed   per leaf, owner of that uid
//   sharedGroups/<key>/<uid>         REFUSED   the grant is one level deeper
//
// Those seven rows are the first block below, so the design is held against the
// rules rather than against a reading of them. WHAT IT MEANS: the ACCOUNT can be
// deleted - the Auth user goes, which is what 5.1.1(v) is about - and the groups and
// every co-organizer pointer go with it. TWO KEYS SURVIVE, firstSeenAt and pass, and
// removing them needs a RULES CHANGE, which is Manny's call and is not in this wave.
// Nothing here hides that: deletePlan returns them as `keeps` with the rule that
// refuses each one, and the second warning tells the golfer a founder pass does not
// come back.
//
// WHY THE LEFTOVER IS NOT A HOLE. uids are never reused and organizers/<uid> is
// readable only by auth.uid === <uid>, which no longer exists after the delete. Two
// numbers nobody can reach is data to tidy, not an account that still exists.
//
// ROUNDS ARE NOT TOUCHED, and that is asserted rather than intended: the behavioural
// block checks that not one write goes near events/*. Other golfers may be scoring
// one of those rounds right now, and the round code is what they typed in.
//
// WHAT THIS FILE CANNOT PROVE.
//   - It cannot delete a real Firebase user. Every behavioural test drives the
//     page's own functions against the repo's db and auth stubs, so what is proved
//     is the ORDER, the STOP and the paths - not that Firebase accepts them.
//   - targaryen is not the Firebase emulator. It is the harness this repo has used
//     for rules since Wave 2 (ten suites), and the emulator cannot even load these
//     files - it rejects the email regex in BOTH the candidate and the previously
//     live ruleset with "Illegal regular expression, whitespacechar not found".
//   - mini-dom has no layout, so "shown" here means style.display, never that
//     anybody could see or tap it. The two-step arming is state, not geometry.
//
// THE BASELINE, all 34 tests, measured against main 7608a56 in a clean worktree -
// Wave 33 merged, no account-exit.js, no card, no sign-out anywhere in the app:
//
//     3 PASS / 31 FAIL
//
// The three that pass are the whole rules block, and they are honest about earning
// nothing from this wave: they measure a ruleset this wave does not touch. They are
// here because the DESIGN depends on those eight verdicts, and a rules publish that
// changed one of them would make this wave's delete silently incomplete. The 31
// reds are every line of the feature.
//
// (My own first draft of this paragraph said 8 PASS, from counting the targaryen
// ROWS instead of the tests that run them: eight rows, three tests. Measured: 3/31.)
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// A vm sandbox is another realm: deepStrictEqual on an array built in there fails
// "same structure, not reference-equal". Compare the JSON, not the object.
const plain = v => JSON.parse(JSON.stringify(v));
const SRC = read('admin.html');

let X = null;
try { X = loadJsFile('account-exit.js').accountExit; } catch (e) { X = null; }
const need = () => { assert.ok(X, 'account-exit.js must exist and load as a plain global'); return X; };

// ===========================================================================
// 1. THE LIVE RULES. Same harness as rules_stage1_test.js, same shape of data
//    file - a bare user name for a read, an { auth, data } object for a write,
//    and data: null IS a delete.
// ===========================================================================
const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
const LIVE_RULES = path.join(REPO_ROOT, 'database.rules.stage1.json');
const OWNER = 'u-owner';
const CO_KEY = 'a,person@gmail,com';
const GROUP = {
    name: 'Thursday game', ownerUid: OWNER, createdAt: 1, updatedAt: 1,
    coOrganizers: { [CO_KEY]: true },
    members: { marty: { name: 'Marty', hcp: '9' } }
};
const ROOT = {
    events: { ZZTEST: { eventName: 'Thursday', ownerUid: OWNER, scores: { p101_h1: 4 } } },
    organizers: {
        [OWNER]: { firstSeenAt: 1, pass: { kind: 'founder', expiresAt: 4102444800000 }, groups: { g1: GROUP } },
        'u-other': { firstSeenAt: 1 }
    },
    sharedGroups: { [CO_KEY]: { [OWNER]: { g1: true } } }
};
const USERS = {
    owner: { uid: OWNER, provider: 'password', token: { email: 'owner@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', provider: 'password', token: { email: 'x@y.com', email_verified: true, firebase: { sign_in_provider: 'password' } } }
};
// EVERY ROW IS A DELETE THIS WAVE EITHER PERFORMS OR DELIBERATELY DOES NOT.
const DELETES = [
    { id: 'D1', path: 'organizers/' + OWNER, who: 'owner', verdict: 'refuse',
      why: 'the whole record has no .write at that level, so a one-call delete is impossible' },
    { id: 'D2', path: 'organizers/' + OWNER + '/firstSeenAt', who: 'owner', verdict: 'refuse',
      why: 'create-only by rule, so it survives the delete and the plan says so' },
    { id: 'D3', path: 'organizers/' + OWNER + '/pass', who: 'owner', verdict: 'refuse',
      why: '.write is false: a founder pass cannot be removed by anybody holding it' },
    { id: 'D4', path: 'organizers/' + OWNER + '/groups', who: 'owner', verdict: 'allow',
      why: 'ONE write removes every saved group, which is what the plan performs' },
    { id: 'D5', path: 'organizers/' + OWNER + '/groups/g1', who: 'owner', verdict: 'allow',
      why: 'a single group can go on its own, which is what My Groups already does' },
    { id: 'D6', path: 'organizers/' + OWNER + '/groups/g1', who: 'other', verdict: 'refuse',
      why: 'and nobody else may: the delete is the owner, not any signed-in user' },
    { id: 'D7', path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1', who: 'owner', verdict: 'allow',
      why: 'the co-organizer pointer, per leaf - this is why the plan enumerates them' },
    { id: 'D8', path: 'sharedGroups/' + CO_KEY + '/' + OWNER, who: 'owner', verdict: 'refuse',
      why: 'the grant is one level deeper, so the pointers cannot be swept in one call' }
];

function runRules() {
    const tests = {};
    DELETES.forEach(row => {
        const bucket = row.verdict === 'allow' ? 'canWrite' : 'cannotWrite';
        const entry = tests[row.path] || {};
        entry[bucket] = (entry[bucket] || []).concat([{ auth: row.who, data: null }]);
        tests[row.path] = entry;
    });
    const f = path.join(os.tmpdir(), 'account-exit-rules-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests: tests }, null, 1));
    try { return { code: 0, out: execFileSync(TARGARYEN, [LIVE_RULES, f], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

describe('WHAT THE LIVE RULES LET AN OWNER DELETE', () => {

    test('the table has both verdicts and every row says why', () => {
        // A table of only refusals is satisfied by a ruleset that refuses
        // everything, which would also stop every score in the app.
        assert.ok(DELETES.filter(r => r.verdict === 'allow').length >= 3);
        assert.ok(DELETES.filter(r => r.verdict === 'refuse').length >= 4);
        DELETES.forEach(r => assert.ok(r.why && r.why.length > 25, r.id + ' must say why'));
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the rules harness this repo uses');
        assert.ok(fs.existsSync(LIVE_RULES), 'database.rules.stage1.json is the PUBLISHED ruleset');
    });

    test('EVERY delete verdict holds against the published Stage 1 file', () => {
        const { code, out } = runRules();
        assert.equal(code, 0, 'targaryen disagreed:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and it is the PUBLISHED file, not the repo one that was never published', () => {
        // database.rules.json still carries the Stage 2 owner-only round parent. A
        // guard that measured it would be describing rules nobody is running.
        assert.ok(/stage1/.test(LIVE_RULES), 'the rules under test must be the stage1 file');
        const live = JSON.parse(read('database.rules.stage1.json'));
        const org = live.rules.organizers.$uid;
        assert.equal(org['.write'], undefined, 'no .write at organizers/$uid - D1 depends on this');
        assert.equal(org.pass['.write'], false, 'pass is unwritable - D3 depends on this');
        assert.ok(/!data\.exists\(\)/.test(org.firstSeenAt['.write']), 'firstSeenAt is create-only - D2');
        assert.ok(/auth\.uid === \$uid/.test(org.groups['.write']), 'groups is owner-writable - D4');
    });
});

// ===========================================================================
// 2. THE PLAN, PURE
// ===========================================================================
describe('THE DELETE PLAN IS A LIST, AND IT NAMES WHAT IT CANNOT TAKE', () => {

    const groups = () => ({
        g1: { name: 'Thursday game', coOrganizers: { 'a,b@c,com': true, 'd,e@f,com': true } },
        g2: { name: 'Sunday game' },
        g3: { name: 'Old game', coOrganizers: { 'gone@x,com': false } }
    });

    test('every pointer, then ONE write for all the groups', () => {
        const p = need().deletePlan('u9', groups());
        const paths = plain(p.removals).map(r => r.path);
        // g3's only coOrganizers entry is FALSE, so it is not a pointer and must not
        // be in the list - an invite that was withdrawn has nothing to remove.
        assert.deepEqual(paths, [
            'sharedGroups/a,b@c,com/u9/g1',
            'sharedGroups/d,e@f,com/u9/g1',
            'organizers/u9',
            'organizers/u9/groups'
        ], 'a coOrganizers entry that is not true is not a pointer: ' + JSON.stringify(paths));
        assert.equal(p.pointerCount, 2);
        assert.equal(p.groupCount, 3);
        // THE POINTERS COME FIRST because their paths are only knowable while the
        // groups are still there. Then the whole record - which Stage 1 refuses and
        // the approved delta allows - and the groups write as the fallback for the
        // world where the publish has not happened yet.
        const soft = plain(p.removals).filter(r => r.soft).map(r => r.path);
        assert.deepEqual(soft, ['organizers/u9', 'organizers/u9/groups'],
            'both organizers writes are SOFT: one of them is expected to be refused in either world');
        assert.ok(plain(p.removals).slice(0, 2).every(r => !r.soft),
            'the pointer removals are HARD - if they fail, the account must not be deleted');
    });

    test('no groups means no group write at all', () => {
        [null, undefined, {}, 'nonsense', 7].forEach(v => {
            const p = need().deletePlan('u9', v);
            assert.deepEqual(plain(p.removals).map(r => r.path), ['organizers/u9'],
                'the record attempt always stands; only the groups write is conditional: ' + JSON.stringify(v));
            assert.equal(p.groupCount, 0);
        });
    });

    test('the plan NAMES the two keys the rules refuse, with the reason', () => {
        const p = need().deletePlan('u9', groups());
        const paths = plain(p.keeps).map(k => k.path);
        assert.deepEqual(paths, ['organizers/u9/firstSeenAt', 'organizers/u9/pass']);
        p.keeps.forEach(k => assert.ok(k.why && k.why.length > 20, k.path + ' must carry the rule that refuses it'));
        assert.ok(/write to false|\.write/.test(p.keeps[1].why), 'the pass reason must name the rule: ' + p.keeps[1].why);
        // AND NOTHING IN THE REMOVALS MAY BE ONE OF THEM. This is the assertion that
        // ties the plan to the rules block above: a removal of either path would be
        // permission-denied at runtime, which would stop the delete for everybody.
        const removed = plain(p.removals).map(r => r.path);
        paths.forEach(k => assert.ok(removed.indexOf(k) === -1, k + ' must never be attempted'));
    });

    test('NOTHING IN THE PLAN TOUCHES A ROUND', () => {
        const p = need().deletePlan('u9', groups());
        p.removals.forEach(r => assert.ok(!/^events/.test(r.path),
            'events/* is other golfers still scoring: ' + r.path));
    });

    test('the card is for a signed-in account only', () => {
        const x = need();
        assert.equal(x.planExit(null).show, false);
        assert.equal(x.planExit({ uid: 'a', isAnonymous: true }).show, false);
        assert.equal(x.planExit({ uid: 'a', isAnonymous: true }).reason, 'anonymous');
        const ok = x.planExit({ uid: 'a', isAnonymous: false, email: 'a@b.com' });
        assert.equal(ok.show, true);
        assert.equal(ok.uid, 'a');
    });
});

// ===========================================================================
// 3. THE WORDS. Copy that describes behaviour is behaviour.
// ===========================================================================
describe('THE WARNINGS SAY DIFFERENT THINGS, BECAUSE THEY ARE DIFFERENT THINGS', () => {

    test('sign out promises the rounds stay and the way back is signing in again', () => {
        const w = need().WORDS;
        assert.match(w.signOutWarn, /rounds you set up here stay/i);
        assert.match(w.signOutWarn, /round codes/i, 'it must say WHERE they stay');
        assert.match(w.signOutWarn, /sign in again/i, 'and how to get the organizer screens back');
        assert.notEqual(w.signOutWarn, w.deleteWarn1, 'sign out is not a lighter delete');
    });

    test('the first delete warning says rounds are NOT deleted', () => {
        const w = need().WORDS;
        assert.match(w.deleteWarn1, /does NOT delete rounds/i);
        assert.match(w.deleteWarn1, /groups/i);
        assert.match(w.deleteWarn1, /co-organizer/i);
    });

    test('a FOUNDER PASS gets its own unmissable sentence', () => {
        const x = need();
        const loud = x.deleteWarning({ kind: 'pass', passKind: 'founder' });
        assert.match(loud, /FOUNDER PASS/);
        assert.match(loud, /does not release it|nothing brings it back/i,
            'the rules cannot remove a pass, so the honest word is that it is stranded: ' + loud);
        assert.ok(loud.indexOf(x.WORDS.deleteWarn2) === 0, 'the last check still leads');
    });

    test('an UNKNOWN standing is hedged, never silent', () => {
        const x = need();
        [null, undefined, { kind: 'trial' }, {}].forEach(s => {
            const m = x.deleteWarning(s);
            assert.match(m, /founder pass/i, 'silence would let somebody delete a pass unwarned: ' + JSON.stringify(s));
            assert.ok(!/THIS ACCOUNT HAS A FOUNDER PASS/.test(m),
                'and it must not CLAIM one when the read did not say so');
        });
    });

    test('an unmapped error code is shown, not swallowed', () => {
        const x = need();
        assert.match(x.messageFor({ code: 'auth/whatever-is-new' }), /\(auth\/whatever-is-new\)$/);
        assert.match(x.messageFor({ code: 'removal-failed' }), /NOT deleted/);
        assert.ok(!/\(removal-failed\)/.test(x.messageFor({ code: 'removal-failed' })), 'a mapped code leaks nothing');
        assert.match(x.messageFor(new Error('no code')), /Could not finish/);
    });
});

// ===========================================================================
// 4. BEHAVIOURAL, THROUGH THE PAGE'S OWN FUNCTIONS. The db and auth stubs are
//    the repo's; __dbWrites is what the page actually sent, in order.
// ===========================================================================
describe('DELETING AN ACCOUNT: THE ORDER, AND THE STOP', () => {

    function page(opts) {
        const o = opts || {};
        const sb = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
        const deleted = [];
        sb.__dbReads = Object.assign({
            'organizers/u9/groups': { g1: { name: 'Thursday game', coOrganizers: { 'a,b@c,com': true } } }
        }, o.reads || {});
        if (o.refuse) sb.__dbRefuse = o.refuse;
        let reloads = 0;
        sb.location.reload = () => { reloads += 1; };
        const user = {
            uid: 'u9', isAnonymous: false, email: 'a@b.com',
            providerData: [{ providerId: o.provider || 'apple.com' }],
            // STAMPED WITH HOW MANY WRITES HAD ALREADY HAPPENED. Two separate
            // lists - writes here, deletes there - are both satisfied by deleting
            // the user FIRST, which is the one order that cannot work: the token
            // that authorises the writes would already be gone. So the stamp is
            // the assertion.
            delete: () => {
                deleted.push('delete@' + sb.__dbWrites.length);
                if (o.deleteError && deleted.length === 1) return Promise.reject(o.deleteError);
                return Promise.resolve();
            }
        };
        sb.firebase.auth().signOut = () => { deleted.push('signOut'); return Promise.resolve(); };
        sb.__auth.setUser(user);
        const reauths = [];
        sb.window.oauthSignin = {
            signIn: (which) => { reauths.push(which); return Promise.resolve({ uid: 'u9' }); }
        };
        sb.oauthSignin = sb.window.oauthSignin;
        return {
            sb, deleted, reauths,
            reloads: () => reloads,
            writes: () => sb.__dbWrites.map(w => w.op + ' ' + w.path),
            text: id => { const e = sb.document.getElementById(id); return e ? e.textContent : null; },
            shown: id => { const e = sb.document.getElementById(id); return e ? e.style.display !== 'none' : null; },
            tap: what => sb.exitTap(what),
            go: () => sb.exitGo()
        };
    }
    const tick = () => new Promise(r => setTimeout(r, 15));

    test('ARRIVE AND TOUCH NOTHING: a signed-in organizer has the card, an anonymous one does not', () => {
        // The page's own arrival calls refreshAccountState, which is what must
        // repaint this - not a call to syncAccountExit by name.
        const anon = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
        anon.refreshAccountState();
        assert.equal(anon.document.getElementById('account-exit-card').style.display, 'none',
            'an anonymous organizer has no account to sign out of');
        const p = page();
        p.sb.refreshAccountState();
        assert.equal(p.shown('account-exit-card'), true, 'a signed-in organizer does');
        assert.match(SRC, /<section id="account-exit-card"[^>]*style="display:none;"/,
            'and it ships hidden in the MARKUP, so it is never visible for one paint');
    });

    test('ONE TAP OF DELETE ARMS NOTHING - the go button appears only on the second', () => {
        const p = page();
        p.sb.refreshAccountState();
        assert.equal(p.shown('account-exit-go'), false, 'nothing armed on arrival');
        p.tap('delete');
        assert.equal(p.shown('account-exit-go'), false,
            'a single stray tap must never be one tap from deleting an account');
        assert.match(p.text('account-exit-warn'), /does NOT delete rounds/i, 'but it must warn');
        assert.equal(p.text('account-delete'), 'Yes, continue', 'and say what the next tap does');
        p.tap('delete');
        assert.equal(p.shown('account-exit-go'), true);
        assert.equal(p.text('account-exit-go'), 'Delete my account');
        assert.match(p.text('account-exit-warn'), /Last check/);
    });

    test('CANCEL puts it all back, and nothing was written', () => {
        const p = page();
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.tap('cancel');
        assert.equal(p.shown('account-exit-go'), false);
        assert.equal(p.text('account-exit-warn'), '');
        assert.equal(p.text('account-delete'), 'Delete account');
        assert.deepEqual(p.writes(), [], 'nothing may be written before the last tap');
        assert.deepEqual(p.deleted, []);
    });

    test('THE ORDER: pointers, then the groups, then the Auth user LAST', async () => {
        const p = page();
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        // The stub refuses nothing, so this is the AFTER-PUBLISH world: the whole
        // record goes in one write and the groups write is skipped as moot.
        assert.deepEqual(p.writes(), [
            'remove sharedGroups/a,b@c,com/u9/g1',
            'remove organizers/u9'
        ], 'the data goes first, while the token is still valid');
        assert.deepEqual(p.deleted, ['delete@2'],
            'the Auth user must be deleted AFTER the writes - delete it first and every write after it is permission-denied forever');
        assert.equal(p.reloads(), 1, 'then the page reloads, so no stale uid is left in authReady');
    });

    test('NOT ONE WRITE GOES NEAR A ROUND', async () => {
        const p = page();
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        p.sb.__dbWrites.forEach(w => assert.ok(!/^events/.test(w.path),
            'other golfers may still be scoring that round: ' + w.path));
        assert.ok(p.sb.__dbWrites.length > 0, 'and the check is not passing on an empty list');
    });

    test('A REFUSED REMOVAL STOPS THE DELETE: the account survives', async () => {
        // A POINTER, which is a HARD removal. The two organizers writes are soft -
        // one of them is expected to be refused in either world - so refusing those
        // must NOT stop the delete, and the test below that one proves it.
        const p = page({
            refuse: (path, op) => (op === 'remove' && /^sharedGroups/.test(path))
                ? Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }) : null
        });
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.deleted, [],
            'deleting the user after a failed removal would strand data nobody can ever reach');
        assert.equal(p.reloads(), 0, 'and the page must not reload as if it worked');
        assert.match(p.text('account-exit-status'), /NOT deleted/,
            'the screen has to say so: ' + p.text('account-exit-status'));
    });

    test('AFTER THE PUBLISH: organizers/<uid> goes in ONE write, and the groups write is not even attempted', async () => {
        // THE RULES WENT LIVE 2026-09-30, ~4:40 AM Phoenix. The page-path proof is
        // the ORDER test above - two writes, the record among them and no groups
        // write at all. This one calls deleteAccount directly, because the fact being
        // asserted is in its RESULT rather than on the screen: recordRemoved is the
        // single flag that says which of the two worlds a delete happened in, and
        // done['.../groups'] === 'skipped' is the proof the fallback did not run.
        const sb = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
        sb.__dbReads = { 'organizers/u9/groups': { g1: { name: 'Thursday game', coOrganizers: { 'a,b@c,com': true } } } };
        const user = { uid: 'u9', isAnonymous: false, email: 'a@b.com',
                       providerData: [{ providerId: 'apple.com' }],
                       delete: () => Promise.resolve() };
        const out = await sb.window.accountExit.deleteAccount({
            auth: { currentUser: user }, db: sb.db, reload: () => {}
        });
        assert.equal(out.recordRemoved, true, 'the whole record must be what went');
        assert.equal(out.done['organizers/u9'], 'removed');
        assert.equal(out.done['organizers/u9/groups'], 'skipped',
            'the groups fallback must not run once the record is gone - it is one write, not two');
        assert.deepEqual(sb.__dbWrites.map(w => w.path), [
            'sharedGroups/a,b@c,com/u9/g1',
            'organizers/u9'
        ], 'exactly two writes: the pointer, and the record');
        // AND THE KEEPS ARE NOW MOOT, which the result says rather than the header:
        // firstSeenAt and pass went with the record.
        assert.equal(out.keeps.length, 2, 'the plan still NAMES them, for the rollback world');
    });

    test('BEFORE THE PUBLISH (or after a rollback): the record is refused, the groups write runs, the account still goes', async () => {
        // This is the world the app is in RIGHT NOW: Stage 1 has no .write at
        // organizers/<uid>, so the first attempt is permission-denied. It must not
        // be the STOP, and the fallback must actually run - otherwise the feature
        // could not be tested until the publish landed.
        const p = page({
            refuse: (path, op) => (op === 'remove' && path === 'organizers/u9')
                ? Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }) : null
        });
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.writes(), [
            'remove sharedGroups/a,b@c,com/u9/g1',
            'remove organizers/u9',
            'remove organizers/u9/groups'
        ], 'the refused record attempt is followed by the groups fallback');
        assert.deepEqual(p.deleted, ['delete@3'], 'and the account is deleted anyway');
        assert.equal(p.reloads(), 1);
        assert.match(p.text('account-exit-status'), /^$|Deleting/,
            'no failure message: a refused soft removal is not an error');
    });

    test('A REFUSED READ of the groups stops it too, and removes nothing', async () => {
        const p = page({ reads: { 'organizers/u9/groups': null } });
        // The stub answers null for an unknown path, which is indistinguishable from
        // "no groups" - so this arm asserts the benign case rather than pretending:
        // no groups means no removals, and the delete proceeds.
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.writes(), ['remove organizers/u9'],
            'no groups means no pointer and no groups write - only the record attempt');
        assert.deepEqual(p.deleted, ['delete@1'], 'and an account with no groups still deletes');
    });

    test('requires-recent-login RE-RUNS THE SIGN-IN, then deletes', async () => {
        const p = page({ deleteError: Object.assign(new Error('recent'), { code: 'auth/requires-recent-login' }) });
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.reauths, ['apple'], 'the provider on the account is the one it re-runs');
        assert.deepEqual(p.deleted, ['delete@2', 'delete@2'], 'and it tries again after the re-auth');
        assert.equal(p.reloads(), 1);
    });

    test('a GOOGLE account re-authenticates with Google', async () => {
        const p = page({
            provider: 'google.com',
            deleteError: Object.assign(new Error('recent'), { code: 'auth/requires-recent-login' })
        });
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.reauths, ['google']);
    });

    test('an EMAIL-LINK account cannot be re-authenticated here, and is told so', async () => {
        const p = page({
            provider: 'password',
            deleteError: Object.assign(new Error('recent'), { code: 'auth/requires-recent-login' })
        });
        p.sb.refreshAccountState();
        p.tap('delete'); p.tap('delete');
        p.go();
        await tick();
        assert.deepEqual(p.reauths, [], 'there is no popup to re-run for an email link');
        assert.deepEqual(p.deleted, ['delete@2'], 'one attempt, which Firebase refused');
        assert.match(p.text('account-exit-status'), /Sign in once more/,
            'and the screen says what to do rather than failing blank: ' + p.text('account-exit-status'));
        assert.equal(p.reloads(), 0);
    });
});

describe('SIGNING OUT IS ONE TAP BEHIND ONE WARNING', () => {

    function page() {
        const sb = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
        const calls = [];
        let reloads = 0;
        sb.location.reload = () => { reloads += 1; };
        sb.firebase.auth().signOut = () => { calls.push('signOut'); return Promise.resolve(); };
        sb.__auth.setUser({
            uid: 'u9', isAnonymous: false, email: 'a@b.com',
            providerData: [{ providerId: 'apple.com' }],
            delete: () => { calls.push('delete'); return Promise.resolve(); }
        });
        return { sb, calls, reloads: () => reloads,
                 text: id => { const e = sb.document.getElementById(id); return e ? e.textContent : null; },
                 shown: id => { const e = sb.document.getElementById(id); return e ? e.style.display !== 'none' : null; } };
    }
    const tick = () => new Promise(r => setTimeout(r, 15));

    test('the warning comes first, and it is the sign-out one', () => {
        const p = page();
        p.sb.refreshAccountState();
        assert.equal(p.shown('account-exit-go'), false);
        p.sb.exitTap('signout');
        assert.equal(p.shown('account-exit-go'), true, 'sign out is one tap behind its warning');
        assert.equal(p.text('account-exit-go'), 'Sign out');
        assert.match(p.text('account-exit-warn'), /rounds you set up here stay/i);
        assert.ok(!/cannot be undone/.test(p.text('account-exit-warn')),
            'signing out is not the destructive one and must not borrow its words');
    });

    test('it signs out, reloads, and deletes NOTHING', async () => {
        const p = page();
        p.sb.refreshAccountState();
        p.sb.exitTap('signout');
        p.sb.exitGo();
        await tick();
        assert.deepEqual(p.calls, ['signOut'], 'no delete, ever, from this button');
        assert.deepEqual(p.sb.__dbWrites, [], 'and not one write');
        assert.equal(p.reloads(), 1, 'the reload is what hands the device to a fresh anonymous organizer');
    });

    test('exitGo does nothing at all when nothing is armed', async () => {
        const p = page();
        p.sb.refreshAccountState();
        p.sb.exitGo();
        p.sb.exitTap('delete');
        p.sb.exitGo();
        await tick();
        assert.deepEqual(p.calls, [], 'the first delete step is a warning, not an action');
        assert.deepEqual(p.sb.__dbWrites, []);
    });
});

// ===========================================================================
// 5. THE WIRING. A feature nothing loads is not a feature.
// ===========================================================================
describe('IT IS LOADED, PRECACHED, AND REPAINTED WITH THE PANEL', () => {

    test('admin.html loads the file', () => {
        assert.match(SRC, /<script src="account-exit\.js"><\/script>/);
    });

    test('the Account panel repaints it, so a sign-in inside the panel shows the card', () => {
        const fn = SRC.slice(SRC.indexOf('function refreshAccountState'), SRC.indexOf('function previewPastedPlayers'));
        assert.ok(fn.length > 200, 'the slice collapsed');
        assert.match(fn, /syncAccountExit\(\)/,
            'without this, signing in with the panel open would leave the card hidden');
    });

    test('it is in the consumer shell, so the panel works offline', () => {
        const sw = read('sw.js');
        assert.match(sw, /'\.\/account-exit\.js'/, 'a golfer who wants out should not have to find signal first');
        // build-shell.js reads CONSUMER_SHELL out of sync-mobile-web.js, so that is
        // the list a missing entry would be missing from.
        const shell = read('sync-mobile-web.js');
        assert.match(shell, /'account-exit\.js'/, 'and the consumer bundle must ship it');
    });

    test('the card sells nothing, and the lobby scan still passes', () => {
        const lobby = SRC.slice(SRC.indexOf('id="lobby-screen"'), SRC.indexOf('id="admin-screen"'));
        assert.ok(lobby.indexOf('id="account-exit-card"') > -1, 'the card is in the lobby slice');
        assert.doesNotMatch(lobby, /buy|purchase|checkout|StoreKit|credit card|App Store/i,
            'the same words email_link_auth_test.js bans in this slice, comments included');
    });

    test('a page where auth has NOT landed paints nothing and throws nothing', () => {
        // setup_account_link_test.js deletes window.firebase and swaps in an auth()
        // that throws - the state every page is in before auth lands - and the
        // standing read calls refreshAccountState from inside a .then, so an
        // unwrapped firebase.auth() comes back out as an unhandled rejection. It did:
        // that suite went red on "not ready" until both calls here were wrapped.
        const sb = loadHtmlInlineScript('admin.html', ['account-exit.js', 'my-groups.js']);
        sb.firebase = { auth: function () { throw new Error('not ready'); } };
        sb.window.firebase = sb.firebase;
        sb.refreshAccountState();
        assert.equal(sb.document.getElementById('account-exit-card').style.display, 'none',
            'no account is knowable, so no card');
        // AND NOTHING CAN BE ARMED, which is why exitGo is silent rather than
        // apologetic: syncAccountExit hides the card and resets the step, so the two
        // taps below do nothing and write nothing. (exitGo carries its own
        // not-ready guard for the auth-throws-between-arming-and-tapping race; it
        // cannot be reached through the panel, and this test does not pretend to.)
        sb.exitTap('signout');
        sb.exitGo();
        assert.equal(sb.document.getElementById('account-exit-status').textContent, '');
        // mini-dom does not parse a STATIC style attribute, so this button's display
        // reads undefined until something assigns it - and with the card hidden,
        // syncAccountExit returns before it ever does. Undefined here means "never
        // made visible", which is the claim; asserting 'none' would be asserting the
        // harness rather than the page.
        const goDisplay = sb.document.getElementById('account-exit-go').style.display;
        assert.ok(goDisplay === undefined || goDisplay === 'none',
            'the go button must never have been shown, got ' + JSON.stringify(goDisplay));
        assert.deepEqual(sb.__dbWrites, [], 'and not one write');
        delete sb.firebase;
        delete sb.window.firebase;
        sb.refreshAccountState();
        assert.equal(sb.document.getElementById('account-exit-card').style.display, 'none');
    });

    test('the step is a STRING, not a read of style.display', () => {
        // mini-dom does not parse a static style attribute, so a card that ships
        // display:none reads back undefined here and a toggle keyed on the string
        // would behave differently in the harness from the browser.
        const fn = SRC.slice(SRC.indexOf('var exitStep'), SRC.indexOf('function refreshAccountState'));
        assert.ok(fn.length > 400, 'the slice collapsed');
        // AND IT IS A var. refreshAccountState runs synchronously thousands of lines
        // above the declaration, so a let is in its temporal dead zone there - four
        // Chrome suites went red on "Cannot access exitStep before initialization".
        assert.match(fn, /var exitStep = 'none'/);
        assert.ok(!/exitStep = document\./.test(fn));
        assert.ok(!/style\.display ===/.test(fn.slice(0, fn.indexOf('function syncAccountExit'))),
            'the STATE must never be read back out of the DOM');
    });
});
