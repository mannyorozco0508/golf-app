// ============================================================================
// AN ANONYMOUS USER IS NOT A TOURNAMENT ORGANIZER (2026-09-15).
// tournament.html and database.rules.json (the ownerUid rule, one clause).
//
// THE HOLE, measured against the live project the morning Anonymous sign-in
// went live: Firebase Auth persists per ORIGIN, not per page. auth-boot.js
// signs every consumer-page visitor in anonymously; tournament.html does not
// load auth-boot, but the SDK restores the same user there, its
// onAuthStateChanged set authUser to it, the sign-in panels hid, #signed-in-as
// read "Signed in as <uid> · Sign out", and a real press of Save answered
// "Please select a golf course" - the sign-in gate had been passed. The rule
// agreed: an anonymous session satisfies `auth != null`. Targaryen confirmed
// an anonymous auth could create a tournament with ownerUid = its own uid.
//
// THE FIX, both halves:
//   tournament.html  ONE seam. Every organizer check on the page reads
//                    authUser (the Save gate, the ownerUid write, canManage,
//                    renderSignedInAs, renderSignInPanels - the re-scan below
//                    pins that nothing reads the SDK's user directly), and
//                    onAuthStateChanged now stores a NON-anonymous user or
//                    null. An anonymous session sees the page exactly as a
//                    signed-out one does. It is not signed out: that uid is the
//                    golfer's identity on the consumer pages.
//   database.rules.json  the ownerUid .validate additionally requires
//                    auth.token.firebase.sign_in_provider !== 'anonymous'.
//                    Nothing else in the file moved (pinned by sha of the
//                    file with that one string restored).
//
// THE PROOF that email users see the old page: tournament_anonymous_owner_prev
// .fixture.json holds, from 6536216, the auth-facing surface (both
// #signed-in-as mounts, both sign-in panels, the Setup tab/panel presence, the
// Save gate's alerts and creating set()) for an email organizer, an email
// stranger and nobody, on an owned and a legacy record, in both arrival
// orders. Today's surface deep-equals it. The anonymous user's surface
// deep-equals NOBODY's.
//
// The page is reached the way the gate suite reaches it: the record through
// the page's own value handler, the user through the SDK stub's
// onAuthStateChanged (helpers/load-script.js). The rules are run through
// targaryen on the repo's database.rules.json with this suite's own scenario
// file, whose users carry the token shape the real database gives every auth.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');
const H = require('./helpers/tournament-auth-surface.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const PREV = JSON.parse(read('tournament_anonymous_owner_prev.fixture.json'));
const ANON = { uid: 'anon-live-1', isAnonymous: true, email: null };
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-other', email: 'other@example.com', isAnonymous: false };
const USERS = { organizer: ORGANIZER, stranger: STRANGER, nobody: null };
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');

// ---------------------------------------------------------------------------
describe('THE PAGE: an anonymous user sees what a signed-out user sees', () => {
    [['owned', H.OWNED], ['legacy', H.LEGACY]].forEach(([r, rec]) => ['user-first', 'record-first'].forEach(order => {
        test(`${r} record, ${order}: sign-in panels shown, #signed-in-as empty, Setup as for nobody - the anonymous surface deep-equals nobody's`, () => {
            const anon = H.surface(H.arrive(rec(), ANON, order));
            const nobody = H.surface(H.arrive(rec(), null, order));
            assert.deepEqual(anon, nobody);
            assert.equal(anon.signedInAs, ''); assert.equal(anon.signedInAsSetup, '');
            assert.equal(anon.panelManage.display, 'block'); assert.match(anon.panelManage.html, /Organizers sign in to set up and edit a tournament/);
            assert.match(anon.panelManage.html, /Sign in/);
            if (r === 'owned') { assert.equal(anon.setupTab, false); assert.equal(anon.setupPanel, false); }
            else { assert.equal(anon.setupTab, true, 'a legacy tournament is open to everyone, as before'); }
            assert.equal(anon.leaderboardTab, true);
        });
    }));
    test('the Save gate refuses the anonymous user with the sign-in message and writes nothing', async () => {
        const r = await H.save(ANON);
        assert.deepEqual(r.alerts, ['Sign in to create a tournament. Organizers sign in; golfers never need to.']);
        assert.deepEqual(r.sets, []);
        assert.equal(r.surface.signedInAs, ''); assert.equal(r.surface.panelSetup.display, 'block');
    });
    test('an anonymous user who then signs in with email is the email organizer (the SDK replaces the user; the page follows)', () => {
        const sb = H.arrive(H.OWNED(), ANON, 'user-first');
        assert.equal(H.surface(sb).setupTab, false);
        sb.__auth.setUser(ORGANIZER);
        const s = H.surface(sb);
        assert.equal(s.setupTab, true); assert.match(s.signedInAs, /Signed in as org@example\.com/); assert.equal(s.panelManage.display, 'none');
    });
});

// ---------------------------------------------------------------------------
describe('THE PROOF: email users, strangers and nobody see the page they saw at 6536216, character for character', () => {
    test('the baseline is pinned', () => {
        assert.equal(PREV.capturedAt, '6536216');
        assert.equal(sha(read('tournament_anonymous_owner_prev.fixture.json')).slice(0, 8), '06cdc32e');
        assert.equal(Object.keys(PREV.arrivals).length, 12); assert.equal(Object.keys(PREV.saves).length, 3);
        assert.match(PREV.arrivals['organizer/owned/user-first'].signedInAs, /Signed in as org@example\.com/, 'captured with content');
    });
    Object.entries(USERS).forEach(([u, user]) => [['owned', H.OWNED], ['legacy', H.LEGACY]].forEach(([r, rec]) => ['user-first', 'record-first'].forEach(order =>
        test(`${u} / ${r} / ${order}`, () => assert.deepEqual(H.surface(H.arrive(rec(), user, order)), PREV.arrivals[u + '/' + r + '/' + order])))));
    Object.entries(USERS).forEach(([u, user]) => test(`Save as ${u}: the same alerts, the same creating set (ownerUid ${user ? user.uid : 'none - refused'})`, async () => {
        const r = await H.save(user);
        assert.deepEqual(r, PREV.saves[u]);
    }));
});

// ---------------------------------------------------------------------------
describe('THE RULES (targaryen on database.rules.json)', () => {
    const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
    const DATA = path.join(REPO_ROOT, 'tournament_anonymous_owner.tests-data.json');
    const ESC = String.fromCharCode(27);
    const strip = s => String(s).split(ESC).map((p, i) => i === 0 ? p : p.replace(/^\[[0-9;]*m/, '')).join('');
    function run(rulesPath) {
        try { return { code: 0, out: strip(execFileSync(TARGARYEN, [rulesPath, DATA, '--verbose'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) }; }
        catch (e) { return { code: e.status, out: strip((e.stdout || '') + (e.stderr || '')) }; }
    }
    const BAR = String.fromCharCode(0x2502);
    const rows = out => out.split('\n').filter(l => l.startsWith(BAR + ' tournaments/') || l.startsWith(BAR + ' registrations/')).map(l => l.split(BAR).map(c => c.trim()).filter(Boolean));
    test('an anonymous auth cannot create a tournament it owns, cannot set ownerUid on an existing one; email and google owners can create; a legacy record without an owner is still open; null is unchanged; the owner\'s manage path is unchanged', () => {
        const r = run(path.join(REPO_ROOT, 'database.rules.json'));
        const rs = rows(r.out);
        assert.equal(rs.length, 18, r.out);
        rs.forEach(row => assert.equal(row[3], row[4], row.join(' | ')));
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /0 failures in 18 tests/);
    });
    test('the users in the scenario carry the token the real database gives every auth (sign_in_provider), including "anonymous"', () => {
        const d = JSON.parse(read('tournament_anonymous_owner.tests-data.json'));
        assert.equal(d.users.anonymous.token.firebase.sign_in_provider, 'anonymous');
        ['organizer', 'newcomer', 'google'].forEach(u => assert.notEqual(d.users[u].token.firebase.sign_in_provider, 'anonymous'));
    });
    test('the rule: one clause added to ownerUid, and NOTHING else in the file moved', () => {
        const rules = read('database.rules.json');
        const clause = "auth.token.firebase.sign_in_provider !== 'anonymous' && ";
        assert.equal(rules.split(clause).length, 2, 'the clause appears exactly once');
        assert.match(rules, /"ownerUid": \{\s*"\.validate": "\(!data\.exists\(\) && auth != null && auth\.token\.firebase\.sign_in_provider !== 'anonymous' && newData\.val\(\) === auth\.uid\) \|\| \(data\.exists\(\) && newData\.val\(\) === data\.val\(\)\)"/);
        // The tournaments block is exactly what 075c7a4 committed. (Until the Wave 2
        // draft this pinned the whole file's sha with the clause removed; the events
        // and organizers rules have moved since, so the pin is on THIS block now -
        // wave2_rules_test.js holds the same literal.)
        const t = JSON.parse(rules).rules.tournaments;
        assert.equal(JSON.stringify(t), JSON.stringify({ '$tourneyCode': { '.read': true, '.write': '!data.exists() || newData.exists()',
            '.validate': "(newData.hasChildren() || newData.val() === null) && (!data.hasChild('ownerUid') || newData.hasChild('ownerUid'))",
            ownerUid: { '.validate': "(!data.exists() && auth != null && auth.token.firebase.sign_in_provider !== 'anonymous' && newData.val() === auth.uid) || (data.exists() && newData.val() === data.val())" } } }));
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM (tournament.html, comments stripped)', () => {
    const code = stripComments(read('tournament.html'));
    test('onAuthStateChanged stores a non-anonymous user or null - the one seam', () => {
        assert.match(code, /firebase\.auth\(\)\.onAuthStateChanged\(\(user\) => \{\s*authUser = \(user && !user\.isAnonymous\) \? user : null;\s*applyManageGate\(\);\s*renderSignedInAs\(\);\s*\}\);/);
        assert.equal((code.match(/isAnonymous/g) || []).length, 1);
    });
    test('every organizer check reads authUser; nothing reads the SDK\'s user directly; the anonymous user is never signed out', () => {
        assert.ok(!/currentUser/.test(code), 'no currentUser reader');
        assert.equal((code.match(/firebase\.auth\(\)/g) || []).length, 3, 'signInWithEmailAndPassword, signOut (the button), onAuthStateChanged');
        assert.equal((code.match(/\bauthUser\b/g) || []).length, 11, 'the declaration, the seam, the Save gate, the ownerUid write, canManage (2), renderSignedInAs (3 + 1), renderSignInPanels');
        assert.match(code, /if \(!authUser\) \{\s*alert\('Sign in to create a tournament/);
        assert.match(code, /ownerUid: authUser\.uid/);
        assert.match(code, /return !!\(authUser && authUser\.uid === owner\);/);
        assert.match(code, /if \(authUser\) \{ el\.style\.display = 'none'; el\.innerHTML = ''; return; \}/);
        assert.equal((code.match(/signOut\(\)/g) || []).length, 1, 'only the Sign out button signs out');
    });
});
