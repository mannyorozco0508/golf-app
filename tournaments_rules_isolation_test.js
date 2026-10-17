// ============================================================================
// THE NARROWED tournaments/$tourneyCode BLOCK, IN ISOLATION (2026-09-18).
//
// THE RULE. A code-holder writes scores and nothing else; everything structural
// is the owner's. database.rules.json:
//   tournaments/$tourneyCode .write
//     (!data.exists() && auth != null && newData.child('ownerUid').val() === auth.uid)
//     || (data.exists() && newData.exists() && auth != null && auth.uid === data.child('ownerUid').val())
//   scores/$scoreKey and rounds/$roundId/scores/$scoreKey: .write true, with a
//   validate on the key shape (the three shapes the scorecard writes, hole 1-18)
//   and the value (a whole number 1..30). The grant sits on the KEY so a board
//   cannot be wiped or replaced in one write. A legacy record (no ownerUid) is
//   frozen for structure - one existed at the decision, FN68, Manny's own
//   throwaway - and the claim a signed-in user could make on it is CLOSED.
//
// THE REGISTRATIONS LESSON, APPLIED BEFORE THE ROWS WERE TRUSTED. A negative
// row can pass for the wrong reason: here the wrong reasons are the parent
// .validate (a whole-record write without ownerUid) and the ownerUid child
// validate (a wrong uid), and the score-key validate (a malformed key or
// value). So: a temp copy stubs the PARENT .write to true, leaving every
// validate and the score grants exactly as they are, and this file requires
//   - every OWNERSHIP negative under tournaments/ to go GREEN (allowed) under
//     the stub - proof each one is refused by the boundary, not by a validate;
//   - every VALIDATE negative (an ownerUid path, or a malformed score key or
//     value) to STAY RED under the stub - proof those are validate's own work;
//   - every positive row to stay green (the stub is permissive, not broken);
//   - the clean file green on every row, with positive tournaments rows in it;
//   - nothing outside tournaments/ to move.
// A SECOND STUB sets the two score grants to true (candidate 1, as first
// published) and requires the SQUAT rows - a score under a code with nothing
// behind it, or under a round that does not exist - to go green there and
// only there: the existence condition is the grant's own work, found by the
// live probe (HANDOFF, "The squat"), not by any row that wrote to a record
// that existed.
// registrations_rules_isolation_test.js is the pattern; the rows themselves
// live in security-rules.tests-data.json (118 under tournaments/ at writing).
//
// RE-PINNED 2026-10-17: phase-1 rules of 2026-10-17 (rules/database.rules.phase1.json,
// trips with no email sign-in; redeploy pending Manny's OK). The tournaments STRUCTURE rule is live's:
//   auth != null && auth.token.email != null
//     && (!data.exists() || (data.hasChild('ownerUid') && data.child('ownerUid').val() === auth.uid))
// What that moves in this file's classification, measured:
//   - the boundary is email sign-in + owner. An anonymous create (NEWCODE2) is
//     refused by the BOUNDARY now, not by a validate;
//   - a create without ownerUid (NEWCODE) is refused by the parent .validate;
//   - a legacy record (QRST, no ownerUid) is FROZEN by the parent .validate -
//     scores included, so "a legacy record still takes scores" is gone - and
//     the claim (writing ownerUid onto it) is closed TWICE: by the boundary
//     and by the ownerUid validate (set only at creation);
//   - the owner may delete their own tournament (live has no newData.exists()
//     in the owner arm), so that row is a positive now.
// ============================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = __dirname;
const REAL_RULES = path.join(REPO, 'database.rules.json');
const DATA_PATH = path.join(REPO, 'security-rules.tests-data.json');

// Through helpers/targaryen-run.js (stdout to a file): a pipe truncates the
// table at 33,214 bytes on macOS and the parser below then sees only part of it.
const { runTargaryen: runTargaryenToFile } = require('./helpers/targaryen-run.js');
function runTargaryen(rulesPath) { return runTargaryenToFile(rulesPath, DATA_PATH); }
const TICK = '✓', CROSS = '✖';
const stripAnsi = (s) => String(s).replace(/\[[0-9;]*m/g, '');
function verdictRows(output) {
    return stripAnsi(output).split('\n')
        .filter((l) => l.indexOf('│') > -1)
        .map((l) => l.split('│').map((c) => c.trim()).filter((c) => c !== ''))
        .filter((c) => c.length >= 5 && [TICK, CROSS].indexOf(c[c.length - 2]) > -1 && [TICK, CROSS].indexOf(c[c.length - 1]) > -1)
        .map((c) => ({ path: c[0], op: c[1], auth: c[2], expect: c[c.length - 2], got: c[c.length - 1] }));
}
const isT = (r) => /^tournaments(\/|$)/.test(r.path);
const label = (r) => `${r.path} ${r.op} ${r.auth} expect ${r.expect}`;
// THE NEGATIVES THAT ARE A VALIDATE'S, NOT THE BOUNDARY'S - named one by one,
// with the validate that refuses each, so the list can be read against the
// rules file. Everything else that is refused must be refused by ownership.
// (targaryen prints auth 'null' for the signed-out user.)
const VALIDATE_ROWS = [
    { path: 'tournaments/NEWCODE2', auth: 'null', why: 'ownerUid validate: a create carrying ownerUid needs auth' },
    { path: 'tournaments/NEWCODE2', auth: 'stranger', why: 'ownerUid validate: the uid must be the writer\'s own' },
    // (phase 1: NEWCODE2 by 'anonymous' is the BOUNDARY's now - auth.token.email != null.)
    { path: 'tournaments/NEWCODE', auth: /./, why: 'parent validate (phase 1): a create without ownerUid - the boundary only asks for an email sign-in' },
    { path: /^tournaments\/QRST(\/|$)/, auth: /./, why: 'parent validate (phase 1, as live): a record with no ownerUid is FROZEN - every write under it fails hasChildren([\'ownerUid\'])' },
    { path: 'tournaments/OWNED', auth: 'organizer', why: 'parent validate: even the owner may not drop ownerUid (the {name:"X"} row); the owner\'s delete is a positive in phase 1' },
    { path: 'tournaments/OWNED/ownerUid', auth: 'stranger', why: 'ownerUid validate: never changed once set' },
    { path: 'tournaments/OWNED/ownerUid', auth: 'null', why: 'ownerUid validate: never removed' },
    { path: 'tournaments/OWNED/ownerUid', auth: 'organizer', why: 'ownerUid validate: never changed, even by the owner (the u-stranger row)' },
    { path: 'tournaments/QRST/ownerUid', auth: 'null', why: 'ownerUid validate: needs auth' },
    { path: /^tournaments\/(OWNED|QRST)\/(rounds\/r1\/)?scores\/[^/]+$/, auth: /./, why: 'score-key validate: shape and value' }
];
// THE SQUAT ROWS are neither: a score key under a code with nothing behind it,
// or under a round that does not exist. They are refused by the GRANT'S OWN
// CONDITION (root.child(...).exists()), which the parent stub lets through
// (true cascades down) and the grant stub does not. Named apart, held apart.
const SQUAT_ROWS = [
    { path: 'tournaments/NOPE/scores/team1_h1' },
    { path: 'tournaments/NOPE/rounds/r1/scores/p1_h1' },
    { path: 'tournaments/OWNED/rounds/r9/scores/p1_h1', auth: 'null' }
];
const isSquatRow = (r) => SQUAT_ROWS.some((q) => q.path === r.path && (!q.auth || q.auth === r.auth));
const isValidateRow = (r) => VALIDATE_ROWS.some((v) => (v.path instanceof RegExp ? v.path.test(r.path) : v.path === r.path) && (v.auth instanceof RegExp ? v.auth.test(r.auth) : v.auth === r.auth));
// Reads are not a write boundary; the parent has no .read and the record is public.
const isWrite = (r) => r.op === 'write';

function declared() {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const out = { negativeWrites: 0, positive: 0, all: 0 };
    Object.entries(data.tests).forEach(([k, v]) => {
        const n = ['canRead', 'cannotRead', 'canWrite', 'cannotWrite'].reduce((m, kk) => m + (v[kk] || []).length, 0);
        out.all += n;
        if (!/^tournaments(\/|$)/.test(k)) return;
        out.negativeWrites += (v.cannotWrite || []).length;
        out.positive += (v.canRead || []).length + (v.canWrite || []).length;
    });
    return out;
}

function buildPermissiveCopy() {
    const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
    const t = rules.rules.tournaments && rules.rules.tournaments.$tourneyCode;
    assert.ok(t, 'database.rules.json has no tournaments/$tourneyCode block to stub');
    t['.write'] = true;   // ONLY the boundary; every validate and both score grants stay
    const p = path.join(os.tmpdir(), 'tournaments-permissive-' + process.pid + '.json');
    fs.writeFileSync(p, JSON.stringify(rules, null, 2));
    return p;
}
// THE SECOND STUB: the parent boundary left exactly as it is, the two score
// grants set to true - i.e. the published candidate 1, the one the live probe
// found the squat in. Under it the squat rows must go GREEN and nothing else
// may move: that names the existence condition as the grant's own work.
function buildGrantStubCopy() {
    const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
    const t = rules.rules.tournaments.$tourneyCode;
    t.scores.$scoreKey['.write'] = true;
    t.rounds.$roundId.scores.$scoreKey['.write'] = true;
    const p = path.join(os.tmpdir(), 'tournaments-grant-stub-' + process.pid + '.json');
    fs.writeFileSync(p, JSON.stringify(rules, null, 2));
    return p;
}

// THE THIRD STUB (phase 1): the grants set to true AND the parent .validate set
// to true. A squat under a code with NOTHING behind it (NOPE) is now closed
// twice - by the existence condition and by the parent validate (a record
// created by a score write has no ownerUid) - so only with both opened does it
// go green. A squat under an EXISTING record (OWNED/rounds/r9) is the grant's
// alone and goes green under the plain grant stub.
function buildGrantAndValidateStubCopy() {
    const rules = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
    const t = rules.rules.tournaments.$tourneyCode;
    t.scores.$scoreKey['.write'] = true;
    t.rounds.$roundId.scores.$scoreKey['.write'] = true;
    t['.validate'] = 'true';
    const p = path.join(os.tmpdir(), 'tournaments-grant-validate-stub-' + process.pid + '.json');
    fs.writeFileSync(p, JSON.stringify(rules, null, 2));
    return p;
}

let CLEAN = null, STUBBED = null, STUB_PATH = null, GRANTSTUB = null, GRANT_PATH = null, GRANTVAL = null, GRANTVAL_PATH = null;
before(() => { CLEAN = runTargaryen(REAL_RULES); STUB_PATH = buildPermissiveCopy(); STUBBED = runTargaryen(STUB_PATH); GRANT_PATH = buildGrantStubCopy(); GRANTSTUB = runTargaryen(GRANT_PATH); GRANTVAL_PATH = buildGrantAndValidateStubCopy(); GRANTVAL = runTargaryen(GRANTVAL_PATH); });
after(() => { [STUB_PATH, GRANT_PATH, GRANTVAL_PATH].forEach((p) => { try { fs.unlinkSync(p); } catch (e) { /* gone */ } }); });

describe('THE HARNESS IS REALLY RUNNING', () => {
    test('both runs produced a verdict table with every declared row in it', () => {
        const d = declared();
        assert.ok(d.all >= 240, 'the data file declares ' + d.all + ' rows; this file expects the full suite');
        assert.equal(verdictRows(CLEAN.output).length, d.all, 'clean run: parsed rows != declared rows');
        assert.equal(verdictRows(STUBBED.output).length, d.all, 'stubbed run: parsed rows != declared rows');
    });
    test('the real file is the narrowed block, and the stub differs from it in the parent .write ONLY', () => {
        const real = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8')).rules.tournaments.$tourneyCode;
        // Re-pinned: phase-1 rules of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK) (live's structure rule).
        assert.equal(real['.write'], "auth != null && auth.token.email != null && (!data.exists() || (data.hasChild('ownerUid') && data.child('ownerUid').val() === auth.uid))");
        // The grant is on the KEY (a board cannot be replaced in one write) and it
        // requires the record - and at the multi-round depth the round - to EXIST.
        // Candidate 1 said `true` here; the live probe wrote a score under a code
        // with nothing behind it, the record came into being, and the organizer's
        // own create on that code would have been refused. Candidate 2 (published
        // 2026-09-18, live hash 66d26ee9...) closed it.
        assert.equal(real.scores.$scoreKey['.write'], "root.child('tournaments/' + $tourneyCode).exists()");
        assert.ok(!('.write' in real.scores), 'no grant on scores/ itself - a board must not be replaceable in one write');
        assert.equal(real.rounds.$roundId.scores.$scoreKey['.write'], "root.child('tournaments/' + $tourneyCode + '/rounds/' + $roundId).exists()");
        assert.match(real.scores.$scoreKey['.validate'], /newData\.val\(\) <= 30/);
        assert.equal(real.scores.$scoreKey['.validate'], real.rounds.$roundId.scores.$scoreKey['.validate'], 'one validate at both depths');
        const stub = JSON.parse(fs.readFileSync(STUB_PATH, 'utf8')).rules;
        assert.equal(stub.tournaments.$tourneyCode['.write'], true);
        const a = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8')).rules; delete a.tournaments.$tourneyCode['.write'];
        const b = stub; delete b.tournaments.$tourneyCode['.write'];
        assert.deepEqual(b, a, 'the stub copy differs from the real file somewhere other than the parent .write');
    });
    test('THE PARSER FIRES: the permissive stub produced red rows at all', () => {
        assert.notEqual(STUBBED.exitCode, 0, 'a tournaments .write of true failed no scenario - targaryen is not evaluating it');
        assert.ok(verdictRows(STUBBED.output).some((r) => r.expect !== r.got), 'the stub run has failures but the parser sees none');
    });
});

describe('THE ISOLATION CONTROL - structure refused BY ownership, not by a validate', () => {
    test('the CLEAN file is green on every row, and the tournaments rows include positives at both score depths', () => {
        const rows = verdictRows(CLEAN.output);
        const red = rows.filter((r) => r.expect !== r.got).map(label);
        assert.equal(red.length, 0, 'clean file red on:\n  ' + red.join('\n  '));
        assert.equal(CLEAN.exitCode, 0);
        const pos = rows.filter((r) => isT(r) && r.expect === TICK);
        assert.ok(pos.some((r) => /^tournaments\/OWNED\/scores\/team1_h2$/.test(r.path) && r.auth === 'null'), 'no positive: nobody writes a single-round score');
        assert.ok(pos.some((r) => /^tournaments\/OWNED\/rounds\/r1\/scores\/p1_h2$/.test(r.path) && r.auth === 'null'), 'no positive: nobody writes a multi-round score');
        assert.ok(pos.some((r) => /^tournaments\/OWNED\/name$/.test(r.path) && r.auth === 'organizer'), 'no positive: the owner renames');
        // Was: a positive - "a legacy record still takes scores". Phase 1 (as live)
        // freezes a record with no ownerUid entirely, so the row is a negative now.
        assert.ok(rows.some((r) => /^tournaments\/QRST\/scores\/team1_h2$/.test(r.path) && r.expect === CROSS && r.got === CROSS), 'a legacy record (no ownerUid) is frozen - scores included');
        assert.ok(pos.some((r) => r.path === 'tournaments/OWNED' && r.auth === 'organizer'), 'no positive: the owner deletes their own tournament');
    });

    test('EVERY ownership negative goes GREEN with the parent .write stubbed true', () => {
        const rows = verdictRows(STUBBED.output).filter((r) => isT(r) && isWrite(r) && r.expect === CROSS && !isValidateRow(r) && !isSquatRow(r));
        assert.ok(rows.length >= 40, 'only ' + rows.length + ' ownership negatives - the rows are missing');
        const inert = rows.filter((r) => r.got === CROSS).map(label);
        assert.equal(inert.length, 0, inert.length + ' ownership row(s) STILL REFUSED with the boundary wide open - refused by a validate, '
            + 'so they prove nothing about ownership:\n  ' + inert.join('\n  '));
    });

    test('EVERY validate negative stays RED under the stub - those are the validates\' own work', () => {
        // The verdict table shows path, op and auth - not the data - so the rows
        // are laid out in the data file so that no path+auth pair mixes a validate
        // refusal with a boundary refusal. tournaments/OWNED by the organizer is
        // asserted apart below: {name:'X'} (validate: drops ownerUid) is its only
        // negative in phase 1 - the owner's delete is a positive now.
        const rows = verdictRows(STUBBED.output).filter((r) => isT(r) && isWrite(r) && r.expect === CROSS && isValidateRow(r)
            && !(r.path === 'tournaments/OWNED' && r.auth === 'organizer')
            && !(r.path === 'tournaments/QRST' && r.auth === 'null'));
        assert.ok(rows.length >= 10, 'only ' + rows.length + ' validate negatives');
        const flipped = rows.filter((r) => r.got === TICK).map(label);
        assert.equal(flipped.length, 0, 'a validate row went green under the stub - it was the boundary refusing it, misclassified:\n  ' + flipped.join('\n  '));
        const ownerRows = verdictRows(STUBBED.output).filter((r) => r.path === 'tournaments/OWNED' && r.auth === 'organizer' && r.expect === CROSS);
        assert.equal(ownerRows.length, 1, 'the owner has one negative on the record root: drop-ownerUid (the delete is allowed in phase 1)');
        assert.equal(ownerRows.filter((r) => r.got === CROSS).length, 1, 'it stays red under the stub (the drop-ownerUid validate)');
        // Phase 1: tournaments/QRST signed out carries a rename (parent validate:
        // frozen, no ownerUid) AND a delete (the boundary's - a validate never
        // runs on a delete). Asserted apart, the same way.
        const qrst = verdictRows(STUBBED.output).filter((r) => r.path === 'tournaments/QRST' && r.auth === 'null' && r.expect === CROSS);
        assert.equal(qrst.length, 2, 'QRST signed out: a rename and a delete');
        assert.equal(qrst.filter((r) => r.got === CROSS).length, 1, 'the rename stays red under the stub (frozen by the parent validate)');
        assert.equal(qrst.filter((r) => r.got === TICK).length, 1, 'the delete flips (refused by the boundary)');
    });

    test('THE CLAIM CLOSES BY THE BOUNDARY: the legacy ownerUid write by a signed-in user is refused by ownership - and, in phase 1, by the ownerUid validate too', () => {
        // Was: refused on the clean file and GREEN under the parent stub (the child
        // validate allowed it). Phase-1 rules of 2026-10-17 (rules/database.rules.phase1.json,
        // trips with no email sign-in; redeploy pending Manny's OK): ownerUid is settable only at creation (!data.parent().exists()),
        // and the record is frozen by the parent validate - so the stub alone does
        // not let it through. The boundary's own refusal is proved with the
        // VALIDATES stubbed instead: still refused, by ownership.
        const clean = verdictRows(CLEAN.output).find((r) => r.path === 'tournaments/QRST/ownerUid' && r.auth === 'organizer' && r.expect === CROSS);
        const stubbed = verdictRows(STUBBED.output).filter((r) => r.path === 'tournaments/QRST/ownerUid' && r.auth === 'organizer' && r.expect === CROSS);
        assert.ok(clean && clean.got === CROSS, 'the claim is not refused on the clean file');
        assert.ok(stubbed.length > 0 && stubbed.every((r) => r.got === CROSS), 'the claim went through with the boundary open - the ownerUid validate no longer holds it');
        const targaryen = require('targaryen');
        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        const org = data.users.organizer;
        const noValidates = JSON.parse(fs.readFileSync(REAL_RULES, 'utf8'));
        const t = noValidates.rules.tournaments.$tourneyCode;
        t['.validate'] = 'true'; t.ownerUid['.validate'] = 'true';
        assert.equal(targaryen.database(noValidates, data.root).as(org).write('/tournaments/QRST/ownerUid', org.uid).allowed, false,
            'with the validates stubbed, the boundary let a signed-in user claim a record with no owner');
        assert.equal(targaryen.database(noValidates, data.root).as(org).write('/tournaments/OWNED/name', 'Renamed').allowed, true,
            'positive control: with the validates stubbed, the owner still writes their own record');
    });

    test('the positive tournaments rows stay green under the stub', () => {
        const rows = verdictRows(STUBBED.output).filter((r) => isT(r) && r.expect === TICK);
        assert.equal(rows.length, declared().positive);
        const red = rows.filter((r) => r.got !== TICK).map(label);
        assert.equal(red.length, 0, 'a permissive stub refused:\n  ' + red.join('\n  '));
    });

    test('and NO row outside tournaments/ moved', () => {
        const clean = verdictRows(CLEAN.output).filter((r) => !isT(r));
        const stubbed = verdictRows(STUBBED.output).filter((r) => !isT(r));
        assert.equal(stubbed.length, clean.length);
        const moved = stubbed.filter((r, i) => r.got !== clean[i].got).map(label);
        assert.equal(moved.length, 0, 'rows outside tournaments changed verdict under the stub:\n  ' + moved.join('\n  '));
    });

    test('THE SQUAT: refused by the grant\'s own existence condition - red on the clean file, GREEN under the grant stub (under a code with nothing behind it: only with the parent validate opened too), and the grant stub moves nothing else', () => {
        const clean = verdictRows(CLEAN.output), grant = verdictRows(GRANTSTUB.output);
        assert.equal(grant.length, clean.length);
        const squatClean = clean.filter((r) => isSquatRow(r) && r.expect === CROSS);
        assert.ok(squatClean.length >= 5, 'only ' + squatClean.length + ' squat rows - the rows are missing');
        squatClean.forEach((r) => assert.equal(r.got, CROSS, 'the squat is open on the clean file: ' + label(r)));
        // Phase 1: the squat under an EXISTING record goes green under the grant
        // stub alone; the squat under NOPE (nothing behind the code) stays red
        // there - the parent validate refuses a record with no ownerUid - and goes
        // green only with the grants AND the parent validate opened.
        const squatGrant = grant.filter((r) => isSquatRow(r) && r.expect === CROSS);
        const existing = squatGrant.filter((r) => !/^tournaments\/NOPE\//.test(r.path));
        const nope = squatGrant.filter((r) => /^tournaments\/NOPE\//.test(r.path));
        assert.ok(existing.length >= 1 && nope.length >= 4, 'squat rows missing: ' + existing.length + ' / ' + nope.length);
        const stillRed = existing.filter((r) => r.got === CROSS).map(label);
        assert.equal(stillRed.length, 0, 'a squat row under an existing record stayed refused with the grants set to true - something other than the existence condition refuses it:\n  ' + stillRed.join('\n  '));
        nope.forEach((r) => assert.equal(r.got, CROSS, 'a NOPE squat went through with only the grants open - the parent validate no longer holds it: ' + label(r)));
        const both = verdictRows(GRANTVAL.output).filter((r) => isSquatRow(r) && r.expect === CROSS);
        const bothRed = both.filter((r) => r.got === CROSS).map(label);
        assert.equal(bothRed.length, 0, 'a squat row stayed refused with the grants AND the parent validate open:\n  ' + bothRed.join('\n  '));
        // NOTHING ELSE MOVES under the grant stub: the ownership rows and the validate
        // rows are the parent's and the validates' - the grant condition is not what
        // holds them.
        const moved = grant.filter((r, i) => !isSquatRow(r) && r.got !== clean[i].got).map(label);
        assert.equal(moved.length, 0, 'the grant stub moved a row that is not a squat row:\n  ' + moved.join('\n  '));
    });

    test('the count of ownership negatives is what the data file declares, minus the validate rows', () => {
        const rows = verdictRows(STUBBED.output).filter((r) => isT(r) && isWrite(r) && r.expect === CROSS);
        assert.equal(rows.length, declared().negativeWrites);
    });
});
