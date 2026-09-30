// ============================================================================
// RULES STAGE 1 — TESTED BEFORE IT WAS PUBLISHED, AND NOW LIVE
//
// PUBLISHED 2026-09-29 ~7:01 PM, by console paste of database.rules.stage1.json.
// Post-publish: a score from a ?group= link SAVED, and a forced-KP answer on GFLBAM
// SAVED. The rollback is dab91d8, one paste, and it is on the Desktop.
//
// THIS FILE STILL EARNS ITS PLACE AFTER THE PUBLISH. It is now the only executable
// description of what is live: database.rules.json is NOT the live ruleset and still
// carries the Stage 2 owner-only parent. Every scenario below runs against the live
// file and against the ruleset it replaced, so "Stage 1 took nothing away" stays a
// measurement rather than a memory.
//
// WHAT STAGE 1 IS. Everything in the repo rules file that is ADDITIVE, with the
// events/$eventCode parent left EXACTLY as it is live (dab91d8):
//
//   16 child .writes on a round     scores, kpLeaders, kpWinners, kpConfirmed,
//       kpGroupAnswers, sideMatches, matchPresses, strokePresses, dots,
//       wolfCalls, ryderCup, ryderCupRef, ryderFoursomes,
//       additionalGameInstances, auditLog, scoresVerified
//   the seasons/$seasonCode subtree  never enforced live; landed from PR #17
//   organizers/$uid/groups           NEW - My Groups, owner OR co-organizer
//   sharedGroups                     NEW - the co-organizer discovery pointer
//
// Nothing that works today can stop working, because the only rule that could
// have taken something away - the events parent - is byte-identical to live. That
// is asserted below rather than promised.
//
// WHY THE FILE IS database.rules.stage1.json AND NOT database.rules.json. Making
// the repo file the Stage 1 file turns 22 tests red across eleven suites: three
// rules suites (round_delete_rules_test.js, wave2_rules_test.js,
// legacy_round_setup_write_test.js) assert the OWNER-ONLY parent, which Stage 1
// deliberately does not ship, and eight more pin the rules file by sha. Parking
// owner-only requirements to make Stage 1 fit is a REDUCTION in tested protection
// and is not mine to decide, so Stage 1 is its own file, tested here, and the repo
// file is untouched. See the report for the decision Manny has to make.
//
// WHY NOT THE EMULATOR, which is what was asked for. It was tried, it runs, and it
// CANNOT LOAD EITHER FILE:
//
//   database.rules.json:189:131  Illegal regular expression, 'whitespacechar' not found
//   (the LIVE dab91d8 file, same regex at 106:131, same refusal)
//
// The regex is `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` on a tournament registration email.
// The Realtime Database emulator's regex engine does not support \s inside a
// character class; the production engine does, and has been running that exact
// line in production since v171. So the emulator would only work if the rules were
// edited to suit the harness - which is backwards, and CLAUDE.md's rule about not
// letting the harness prove the thing you are assuming applies exactly.
//
// targaryen is what this repo already uses for rules - ten suites run through it -
// it accepts the file, it needs no login, and it is in the suite. Every check below
// runs through it, against BOTH files, so a difference between the candidate and
// live is a measurement rather than a claim.
//
// THE RED BASELINE, all 11 tests: against database.rules.json alone this file has
// no candidate to test, so it is stated the other way round - each scenario below
// is run against the LIVE file too, and the four that differ are asserted to
// differ. That comparison IS the baseline: if the candidate stopped adding
// anything, the four would agree and this file would go red.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');
const CANDIDATE = path.join(REPO, 'database.rules.stage1.json');
const REPO_RULES = path.join(REPO, 'database.rules.json');
// PREV, NOT LIVE. dab91d8 was the live ruleset until 2026-09-29, when Stage 1 was
// published from database.rules.stage1.json through the console. It is now the
// ROLLBACK, and the comparison below is "what Stage 1 changed relative to what it
// replaced" - which is the same measurement, correctly named. Calling this variable
// LIVE after the publish would have made the whole file assert a false label.
const PREV = path.join(os.tmpdir(), 'rules-prev-dab91d8-' + process.pid + '.json');
fs.writeFileSync(PREV, execFileSync('git', ['show', 'dab91d8:database.rules.json'], { cwd: REPO, encoding: 'utf8' }));

const OWNER = 'u-owner', OTHER = 'u-other', CO = 'u-co';
const OWNER_EMAIL = 'owner@example.com';
const CO_EMAIL = 'A.Person@Gmail.com';
const CO_KEY = 'a,person@gmail,com';

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// A round that exists and has been played - the state every scorekeeper write
// below actually happens in.
const ROUND = {
    eventName: 'Thursday', gameFormat: 'stroke', courseData: CD,
    players: [{ id: 101, name: 'Marty Stone' }],
    scores: { p101_h1: 4 }, ownerUid: OWNER, organizerToken: 'tok'
};
const GROUP = {
    name: 'Thursday game', ownerUid: OWNER, createdAt: 1, updatedAt: 1,
    coOrganizers: { [CO_KEY]: true },
    members: { marty: { name: 'Marty', hcp: '9', playCount: 3, lastPlayedAt: 1 } }
};
const ROOT = {
    events: { ZZTEST: ROUND },
    organizers: {
        [OWNER]: { firstSeenAt: 1, groups: { g1: GROUP } },
        [OTHER]: { firstSeenAt: 1 }
    },
    sharedGroups: { [CO_KEY]: { [OWNER]: { g1: true } } },
    trips: {}, tournaments: {}, global_courses: {}, app_settings: {}, seasons: {}
};

// EVERY ROW IS ONE OF THE SECTION-5 CHECKS FROM THE PUBLISH PLAN, plus the four
// that separate the candidate from live. `live` is what the SAME row does under
// dab91d8 - stated, so the difference is measured and not assumed.
const TABLE = [
    // --- participation stays open. This is the whole risk surface of Stage 1.
    { id: 'P1', what: 'a group scorekeeper posts a score', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'the single most common write in the app, from a ?group= link with no sign-in',
      path: 'events/ZZTEST/scores/p101_h2', data: 4 },
    { id: 'P2', what: 'a group answers the forced KP', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'kpGroupAnswers already works in production - GFLBAM holds three stored answers',
      path: 'events/ZZTEST/kpGroupAnswers/h4/g1', data: { answer: 'none', at: 1 } },
    { id: 'P3', what: 'a side match is added mid-round', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'money the group agreed to, entered by whoever has the phone',
      path: 'events/ZZTEST/sideMatches/m1', data: { format: 'match', stake: 20, teamAIds: ['101'], teamBIds: ['102'] } },
    { id: 'P4', what: 'the organizer verifies the scores', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'Finish Round is reachable from a group link', path: 'events/ZZTEST/scoresVerified', data: { verified: true, verifiedAt: 1, verifiedBy: 'organizer' } },
    { id: 'P5', what: 'a KP winner is recorded', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'the KP entry card is on the scorecard', path: 'events/ZZTEST/kpWinners/h3', data: '101' },
    { id: 'P6', what: 'a press is written', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'a press costs real money and is entered at the tee', path: 'events/ZZTEST/matchPresses/p1', data: { baseId: '18', startHole: 5 } },
    { id: 'P7', what: 'a dot is awarded', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'junk is entered by the group', path: 'events/ZZTEST/dots/h4', data: { '101': 1 } },

    // --- STAGE 1 DOES NOT LOCK THE PARENT, and that is the point of Stage 1.
    { id: 'E1', what: 'a code-holder edits the round NAME', who: 'nobody', verdict: 'allow', prev: 'allow',
      why: 'Stage 1 leaves the parent exactly as live - no lockout is possible, and no '
         + 'new protection is claimed here either. Stage 2 is where this becomes the owner.',
      path: 'events/ZZTEST/eventName', data: 'Renamed' },

    // --- MY GROUPS. The four rows that are NEW, and differ from live.
    { id: 'G1', what: 'the OWNER writes their own group', who: 'owner', verdict: 'allow', prev: 'refuse',
      why: 'without this My Groups cannot save at all - it is why Stage 1 exists',
      path: 'organizers/' + OWNER + '/groups/g2',
      data: { name: 'Bandon trip', ownerUid: OWNER, createdAt: 1, updatedAt: 1, members: { paul: { name: 'Paul', hcp: '3.5' } } } },
    { id: 'G2', what: 'a STRANGER reads somebody else group', who: 'other', verdict: 'refuse', prev: 'refuse',
      why: 'privacy: an account sees only its own groups and the ones shared with it',
      op: 'read', path: 'organizers/' + OWNER + '/groups/g1' },
    { id: 'G3', what: 'a CO-ORGANIZER reads the group they were named on', who: 'co', verdict: 'allow', prev: 'refuse',
      why: 'a co-organizer must be able to start a round from it - matched on auth.token.email',
      op: 'read', path: 'organizers/' + OWNER + '/groups/g1' },
    { id: 'G4', what: 'a CO-ORGANIZER saves a handicap back', who: 'co', verdict: 'allow', prev: 'refuse',
      why: 'their edits save back - that is what making one means',
      path: 'organizers/' + OWNER + '/groups/g1/members/marty/hcp', data: '8' },
    { id: 'G5', what: 'a STRANGER writes into somebody else group', who: 'other', verdict: 'refuse', prev: 'refuse',
      why: 'the same wall from the other side', path: 'organizers/' + OWNER + '/groups/g1/members/marty/hcp', data: '99' },
    { id: 'G6', what: 'a CO-ORGANIZER adds another co-organizer', who: 'co', verdict: 'refuse', prev: 'refuse',
      why: 'only the owner decides who else gets in', path: 'organizers/' + OWNER + '/groups/g1/coOrganizers/x@y,com', data: true },
    { id: 'G7', what: 'nobody signed in reads a group', who: 'nobody', verdict: 'refuse', prev: 'refuse',
      why: 'a roster of forty real names is not public', op: 'read', path: 'organizers/' + OWNER + '/groups/g1' },
    { id: 'G8', what: 'a group with no name or no members', who: 'owner', verdict: 'refuse', prev: 'refuse',
      why: 'the validate, so a half-written group cannot land', path: 'organizers/' + OWNER + '/groups/g3', data: { ownerUid: OWNER } },
    { id: 'G9', what: 'a handicap stored as a NUMBER', who: 'owner', verdict: 'refuse', prev: 'refuse',
      why: 'handicaps are used AS ENTERED: "3.5" and "+2" are strings, and a number here '
         + 'would quietly change what the app hands back',
      path: 'organizers/' + OWNER + '/groups/g1/members/marty/hcp', data: 9 },

    // --- THE DISCOVERY POINTER.
    { id: 'S1', what: 'the OWNER points the group at a co-organizer email', who: 'owner', verdict: 'allow', prev: 'refuse',
      why: 'the only way the other account can FIND the group',
      path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1', data: true },
    { id: 'S2', what: 'the CO-ORGANIZER reads their own pointer list', who: 'co', verdict: 'allow', prev: 'refuse',
      why: 'it is how the panel lists groups shared with them', op: 'read', path: 'sharedGroups/' + CO_KEY },
    { id: 'S3', what: 'a STRANGER reads somebody else pointer list', who: 'other', verdict: 'refuse', prev: 'refuse',
      why: 'that list is who shares with whom, and is nobody else business', op: 'read', path: 'sharedGroups/' + CO_KEY },
    { id: 'S4', what: 'a STRANGER points at a group they do not own', who: 'other', verdict: 'refuse', prev: 'refuse',
      why: 'nobody can invite themselves into someone else group',
      path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1', data: true }
];

const USERS = {
    nobody: null,
    owner: { uid: OWNER, provider: 'password', token: { email: OWNER_EMAIL, email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: OTHER, provider: 'password', token: { email: 'someone@else.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    co: { uid: CO, provider: 'password', token: { email: CO_EMAIL, email_verified: true, firebase: { sign_in_provider: 'password' } } }
};

function buildData(which) {
    const tests = {};
    TABLE.forEach(row => {
        const entry = tests[row.path] || {};
        const want = which === 'prev' ? row.prev : row.verdict;
        const bucket = (row.op === 'read')
            ? (want === 'allow' ? 'canRead' : 'cannotRead')
            : (want === 'allow' ? 'canWrite' : 'cannotWrite');
        // A READ ROW IS A BARE USER NAME in targaryen's data file, not an {auth}
        // object. Written the wrong way, EVERY read row fails - including
        // "auth.uid === 'u'" - which looks exactly like a broken rule and cost an
        // hour of blaming the co-organizer expression. Measured and pinned in the
        // harness test below.
        entry[bucket] = (entry[bucket] || []).concat([
            row.op === 'read' ? row.who : { auth: row.who, data: row.data }
        ]);
        tests[row.path] = entry;
    });
    return { root: ROOT, users: USERS, tests: tests };
}

function run(rulesPath, which) {
    const f = path.join(os.tmpdir(), 'rules-stage1-' + which + '-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify(buildData(which), null, 1));
    try { return { code: 0, out: execFileSync(TARGARYEN, [rulesPath, f], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

describe('rules Stage 1 — additive, and proved so before it is published', () => {

    test('the table covers participation, privacy and both verdicts', () => {
        // A table of only refusals is satisfied by a rule that refuses everything,
        // which here would stop every score in the app.
        const allow = TABLE.filter(r => r.verdict === 'allow');
        const refuse = TABLE.filter(r => r.verdict === 'refuse');
        assert.ok(allow.length >= 12, 'only ' + allow.length + ' allow rows');
        assert.ok(refuse.length >= 8, 'only ' + refuse.length + ' refuse rows');
        TABLE.forEach(r => assert.ok(r.why && r.why.length > 20, r.id + ' must say why'));
        assert.equal(TABLE.filter(r => r.id[0] === 'P').length, 7, 'every scorekeeper write is a row');
    });

    test('EVERY Stage 1 expectation holds', () => {
        const { code, out } = run(CANDIDATE, 'candidate');
        assert.equal(code, 0, 'targaryen refused the candidate:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('the events parent is BYTE-IDENTICAL to dab91d8, so nothing was taken away', () => {
        const cand = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8')).rules.events.$eventCode;
        const live = JSON.parse(fs.readFileSync(PREV, 'utf8')).rules.events.$eventCode;
        assert.equal(cand['.write'], live['.write'], 'the one rule that could lock anybody out');
        assert.equal(cand['.read'], live['.read']);
        assert.equal(cand['.validate'], live['.validate']);
    });

    test('and it is the dab91d8 form, not the repo form - Stage 2 is a separate decision', () => {
        const cand = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8')).rules.events.$eventCode['.write'];
        const repo = JSON.parse(fs.readFileSync(REPO_RULES, 'utf8')).rules.events.$eventCode['.write'];
        assert.notEqual(cand, repo, 'the repo file tightens the parent; Stage 1 does not');
        assert.match(repo, /auth\.uid === data\.child\('ownerUid'\)\.val\(\)/, 'that is the Stage 2 shape');
        assert.ok(!/auth\.uid === data\.child\('ownerUid'\)\.val\(\)/.test(cand),
            'Stage 1 must carry no owner-only arm on the parent');
    });

    test('the same table against the ruleset it REPLACED: only the new paths differ', () => {
        const { code, out } = run(PREV, 'prev');
        assert.equal(code, 0, 'the live expectations did not hold:\n' + out.slice(-3000));
        // WHAT THIS PROVES. Every row's live verdict is asserted too, so the four
        // groups of differences are measured: everything that is allowed today is
        // still allowed, and the only things that change are the new keys.
        const differ = TABLE.filter(r => r.verdict !== r.prev).map(r => r.id);
        assert.deepEqual(differ, ['G1', 'G3', 'G4', 'S1', 'S2'],
            'Stage 1 changes exactly five outcomes, all of them on organizers/ or sharedGroups');
        differ.forEach(id => {
            const row = TABLE.find(r => r.id === id);
            assert.match(row.path, /^(organizers|sharedGroups)\//, id + ' must be a new path');
            assert.equal(row.prev, 'refuse', id + ' is refused today because the rule does not exist');
            assert.equal(row.verdict, 'allow', id + ' is what Stage 1 adds');
        });
        // Nothing a scorekeeper does changes at all.
        TABLE.filter(r => r.id[0] === 'P' || r.id[0] === 'E').forEach(r =>
            assert.equal(r.verdict, r.prev, r.id + ' must behave identically before and after'));
    });

    test('kpGroupAnswers was ALLOWED under dab91d8 too, which is why nothing was ever broken', () => {
        // The HANDOFF note said publishing without this child BREAKS the forced-KP
        // gate. It is true only if the parent tightens at the same time: the live
        // parent lets any code-holder write an existing round, so the child inherits
        // permission. GFLBAM holds three stored answers as the field evidence.
        const row = TABLE.find(r => r.id === 'P2');
        assert.equal(row.prev, 'allow');
        assert.equal(row.verdict, 'allow');
        assert.match(fs.readFileSync(path.join(REPO, 'HANDOFF.md'), 'utf8'),
            /kpGroupAnswers WORKS TODAY\s+via the open parent/,
            'HANDOFF.md must carry the correction');
    });

    test('Stage 1 adds exactly the four things it is supposed to, and nothing else', () => {
        const cand = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8')).rules;
        const live = JSON.parse(fs.readFileSync(PREV, 'utf8')).rules;
        const CHILDREN = ['scores', 'kpLeaders', 'kpWinners', 'kpConfirmed', 'kpGroupAnswers',
            'sideMatches', 'matchPresses', 'strokePresses', 'dots', 'wolfCalls', 'ryderCup',
            'ryderCupRef', 'ryderFoursomes', 'additionalGameInstances', 'auditLog', 'scoresVerified'];
        CHILDREN.forEach(c => assert.equal(cand.events.$eventCode[c]['.write'],
            "root.child('events/' + $eventCode).exists()", c + ' must be open to a code-holder'));
        assert.equal(CHILDREN.length, 16);
        assert.ok(cand.seasons && cand.seasons.$seasonCode['.read'], 'the seasons subtree');
        assert.ok(cand.organizers.$uid.groups, 'organizers/$uid/groups');
        assert.ok(cand.sharedGroups, 'sharedGroups');
        assert.ok(!live.organizers.$uid.groups && !live.sharedGroups, 'neither exists live');
        // Nothing was removed.
        Object.keys(live).forEach(k => assert.ok(cand[k], 'Stage 1 must not drop ' + k));
    });

    test('THE HARNESS ITSELF: replace() swaps EVERY dot, and a read row is a bare name', () => {
        // Both were measured rather than assumed, because the whole co-organizer rule
        // rests on them:
        //   auth.token.email.toLowerCase().replace('.', ',') on "A.Person@Gmail.com"
        //   === "a,person@gmail,com"      ALL dots        -> true
        //   === "a,person@gmail.com"      first dot only  -> false
        // So replace is global, which is what the stored key assumes.
        const probe = path.join(os.tmpdir(), 'rules-probe-' + process.pid);
        fs.writeFileSync(probe + '.rules.json', JSON.stringify({ rules: {
            all: { '.read': "auth != null && auth.token.email.toLowerCase().replace('.', ',') === 'a,person@gmail,com'" },
            first: { '.read': "auth != null && auth.token.email.toLowerCase().replace('.', ',') === 'a,person@gmail.com'" }
        } }));
        fs.writeFileSync(probe + '.tests.json', JSON.stringify({
            root: { all: 1, first: 1 },
            users: { co: { uid: 'u', provider: 'password', token: { email: 'A.Person@Gmail.com' } } },
            tests: { all: { canRead: ['co'] }, first: { cannotRead: ['co'] } }
        }));
        let out;
        try { out = execFileSync(TARGARYEN, [probe + '.rules.json', probe + '.tests.json'], { encoding: 'utf8' }); }
        catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
        assert.match(out, /0 failures in 2 tests/, 'replace() is not global here:\n' + out);
    });

    test('a co-organizer CANNOT add another co-organizer - a deeper rule does not revoke', () => {
        // MEASURED, and it was wrong on the first draft: granting write at $groupId
        // and putting an owner-only rule on the coOrganizers child does NOT stop a
        // co-organizer editing it. In Realtime Database, any rule from the root down
        // that GRANTS wins, and a deeper rule cannot take it back. targaryen printed
        // both lines - the owner-only one false, the $groupId one true - and allowed
        // the write.
        //
        // So $groupId grants write to NOBODY. The owner is covered by groups/.write
        // above it, and the co-organizer is granted only at the three children they
        // legitimately touch: members, lastRound and updatedAt.
        const g = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8')).rules.organizers.$uid.groups;
        assert.equal(g['.write'], 'auth != null && auth.uid === $uid', 'the owner, at the collection');
        assert.ok(!g.$groupId['.write'], '$groupId must grant write to nobody');
        ['members', 'lastRound', 'updatedAt'].forEach(k =>
            assert.match(g.$groupId[k]['.write'], /data\.parent\(\)\.child\('coOrganizers\//,
                k + ' is where a co-organizer is granted, and it reads the group above it'));
        assert.ok(!g.$groupId.coOrganizers['.write'] || /auth\.uid === \$uid/.test(g.$groupId.coOrganizers['.write']),
            'and nothing grants a co-organizer write on coOrganizers');
    });

    test('a co-organizer is matched on the EMAIL, case and dots handled', () => {
        const g = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8')).rules.organizers.$uid.groups;
        const cand = { '.read': g.$groupId['.read'], '.write': g.$groupId.members['.write'] };
        // A database key cannot hold a dot, so the stored key is the email with dots
        // as commas and the rule does the same swap. toLowerCase because an email is
        // not case-sensitive and a golfer will type it either way.
        assert.match(cand['.read'], /auth\.token\.email\.toLowerCase\(\)\.replace\('\.', ','\)/);
        assert.match(cand['.write'], /auth\.token\.email\.toLowerCase\(\)\.replace\('\.', ','\)/);
        assert.match(cand['.read'], /auth\.token\.email != null/, 'a user with no email must not throw');
        // Only the owner can change who the co-organizers are, and that is achieved
        // by NOT granting write at $groupId at all - see the test above.
    });

    test('THE EMULATOR CANNOT RUN THIS, and the reason is recorded not glossed', () => {
        // Measured: `firebase emulators:start --only database` under Node 20 loads,
        // then refuses BOTH files at the same regex - the candidate at 189:131 and
        // the LIVE dab91d8 file at 106:131, "Illegal regular expression,
        // 'whitespacechar' not found". The expression is a tournament registration
        // email check that has been in production since v171. The emulator's regex
        // engine does not support \s in a character class; production's does.
        const rx = /\[\^@\\\\s\]/;
        assert.match(fs.readFileSync(CANDIDATE, 'utf8'), rx, 'the candidate carries it');
        assert.match(fs.readFileSync(PREV, 'utf8'), rx, 'and so does the live file');
        // Editing it to suit the emulator would be changing production rules to fit a
        // harness. targaryen accepts it, which is why every check above runs there.
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
    });
});
