// ============================================================================
// CHECK-IN RULES CANDIDATE (CI-FINAL, 2026-11-14) - targaryen, nothing live
//
// tools/checkin-rules-candidate.js adds arrivedAt / arrivedBy (and a read on
// paid) under registrations/$code/$entryId. Two bases, each READ ONLY, each run
// as BASE (the control) and CAND = build(BASE):
//   LIVE = the last live read-back on this machine (env CHECKIN_RULES_LIVE, or
//          ~/Desktop/claude-mailbox/outbox/rules-publish-20261113-55a/
//          readback.json, sha256 bdf19a87...). Skipped when absent.
//   REPO = this repo's database.rules.json (behind live, but its registrations
//          entry has the same shape). Always runs.
// Nothing is published; the repo's database.rules.json is not changed.
//
// What CAND must allow and refuse is asserted on CAND; what it newly allows is
// asserted REFUSED on BASE, so the block is what does the work.
//
// BASELINE (final file, CLAUDE.md count rule): against main e1312cf2, where
// tools/checkin-rules-candidate.js does not exist (measured by removing it and
// restoring by sha 17effd90...): 7 tests - 0 pass / 7 fail. On preview-ci with
// the builder and the LIVE read-back present: 7 tests - 7 pass / 0 fail.
// Controls (builder mutated, restored by sha): golfer overwrite allowed, the
// arrivedBy-golfer pairing dropped, arrivedBy rewritable while arrived, no
// arrivedAt read, no paid read, arrival without approvedAt, arrivedBy writable
// by anyone, arrivedBy untyped, arrivedAt never valid - each turns 1 to 3 red.
// The builder's own "already has arrivedAt" refusal is inert under test 1
// (the paid .read refusal fires first): a belt the test cannot single out.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const targaryen = require('targaryen');

let CI = null;
try { CI = require('./tools/checkin-rules-candidate.js'); } catch (e) { /* red below */ }

const LIVE_FILE = process.env.CHECKIN_RULES_LIVE || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'rules-publish-20261113-55a', 'readback.json');
const BASES = { REPO: JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8')) };
if (fs.existsSync(LIVE_FILE)) BASES.LIVE = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));

const AUTH = {
    owner: { uid: 'u-org', token: { email: 'org@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', token: { email: 'other@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    anon: { uid: 'u-anon', token: { firebase: { sign_in_provider: 'anonymous' } } },
    out: null
};
const T = 1763100000000;
const DATA = {
    tournaments: {
        STK: { name: 'Starkey Cup', ownerUid: 'u-org', createdAt: 1 },
        OTH: { name: 'Other Open', ownerUid: 'u-other', createdAt: 1 }
    },
    registrations: {
        STK: {
            e1: { fullName: 'Ray Diaz', email: 'ray@example.com', phone: '6025550101', createdAt: 1, approvedAt: 2, playerId: 'p1' },
            e2: { fullName: 'Kim Vo', email: 'kim@example.com', phone: '6025550102', createdAt: 1 },   // not approved
            e3: { fullName: 'Jo Park', email: 'jo@example.com', phone: '6025550103', createdAt: 1, approvedAt: 2, playerId: 'p3', paid: true, paidAt: 3, arrivedAt: T, arrivedBy: 'golfer' },
            // an arrival time with no arrivedBy (an older write): a golfer may not stamp it
            e4: { fullName: 'Eva Lin', email: 'eva@example.com', phone: '6025550105', createdAt: 1, approvedAt: 2, playerId: 'p4', arrivedAt: T }
        },
        OTH: {
            x1: { fullName: 'Al Lopez', email: 'al@example.com', phone: '6025550104', createdAt: 1, approvedAt: 2, playerId: 'p9', arrivedAt: T, arrivedBy: 'organizer' }
        }
    }
};
const db = (rules, who) => targaryen.database(rules, DATA).as(AUTH[who]);
const upd = (rules, who, p, patch) => db(rules, who).update(p, patch).allowed;
const wr = (rules, who, p, v) => db(rules, who).write(p, v).allowed;
const rd = (rules, who, p) => db(rules, who).read(p).allowed;
const GOLFER = { arrivedAt: T + 60000, arrivedBy: 'golfer' };
const arms = () => Object.keys(BASES).map((k) => [k, BASES[k], CI ? CI.build(BASES[k]) : null]);

function leaves(o, p, out) {
    out = out || {};
    if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], p + '/' + k, out);
    else out[p] = o;
    return out;
}

test('1. the builder exists, adds exactly its three paths on each base, and refuses to build twice', () => {
    assert.ok(CI, 'tools/checkin-rules-candidate.js is missing');
    for (const [name, base, cand] of arms()) {
        const a = leaves(base, ''), b = leaves(cand, '');
        const moved = Object.keys(Object.assign({}, a, b)).filter((k) => a[k] !== b[k]);
        assert.ok(moved.length >= 6, name + ' positive: the block adds leaves (' + moved.length + ')');
        assert.deepEqual(moved.filter((k) => !CI.PATHS.some((p) => k === p || k.startsWith(p + '/'))), [], name + ': a leaf outside the three paths moved');
        assert.ok(CI.PATHS.every((p) => moved.some((k) => k === p || k.startsWith(p + '/'))), name + ': each path is added');
        assert.throws(() => CI.build(cand), /LIVE HAS MOVED/, name + ': building twice refuses');
    }
});

test('2. a golfer (signed out, or anonymous) can check in an approved entry: arrivedAt + arrivedBy golfer, once; BASE refuses it', () => {
    assert.ok(CI, 'no builder');
    for (const [name, base, cand] of arms()) {
        for (const who of ['out', 'anon']) {
            assert.equal(upd(cand, who, 'registrations/STK/e1', GOLFER), true, name + ' ' + who + ' checks in');
            assert.equal(upd(base, who, 'registrations/STK/e1', GOLFER), false, name + ' ' + who + ' refused on BASE');
        }
    }
});

test('3. a golfer cannot change or clear an arrival, cannot claim "organizer", cannot check in an unapproved entry, cannot write one key without the other, cannot touch any other key', () => {
    assert.ok(CI, 'no builder');
    for (const [name, , cand] of arms()) {
        const no = (who, p, patch, why) => assert.equal(upd(cand, who, p, patch), false, name + ' ' + who + ': ' + why);
        for (const who of ['out', 'anon']) {
            no(who, 'registrations/STK/e3', { arrivedAt: T + 999, arrivedBy: 'golfer' }, 'change an existing arrival');
            no(who, 'registrations/STK/e3', { arrivedAt: T + 999 }, 'change an existing arrival time alone');
            no(who, 'registrations/STK/e3', { arrivedAt: null, arrivedBy: null }, 'clear an arrival');
            assert.equal(wr(cand, who, 'registrations/STK/e3/arrivedAt', null), false, name + ' ' + who + ': remove arrivedAt alone');
            no(who, 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'organizer' }, 'claim organizer');
            no(who, 'registrations/STK/e4', { arrivedBy: 'golfer' }, 'stamp arrivedBy onto an existing arrival');
            no(who, 'registrations/STK/e2', GOLFER, 'unapproved entry');
            no(who, 'registrations/STK/e1', { arrivedAt: T }, 'arrivedAt alone');
            no(who, 'registrations/STK/e1', { arrivedBy: 'golfer' }, 'arrivedBy alone');
            no(who, 'registrations/STK/e1', { arrivedAt: 'now', arrivedBy: 'golfer' }, 'untyped time');
            no(who, 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'golfer', paid: true }, 'paid riding along');
            for (const [k, v] of [['paid', true], ['paidAt', T], ['approvedAt', T], ['fullName', 'Someone Else'], ['email', 'x@example.com'], ['teamNum', 2], ['playerId', 'p2']])
                assert.equal(wr(cand, who, 'registrations/STK/e1/' + k, v), false, name + ' ' + who + ': write ' + k);
            no(who, 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'golfer', note: 'hi' }, 'an unnamed key');
            assert.equal(upd(cand, who, 'registrations/STK/e1', GOLFER), true, name + ' ' + who + ' positive: the plain check-in still passes');
        }
    }
});

test('4. a stranger cannot touch a different event: no clear, no organizer mark, no new entry made of arrival keys; a signed-in organizer of another event is a stranger here', () => {
    assert.ok(CI, 'no builder');
    for (const [name, , cand] of arms()) {
        for (const who of ['owner', 'anon', 'out']) {
            assert.equal(upd(cand, who, 'registrations/OTH/x1', { arrivedAt: null, arrivedBy: null }), false, name + ' ' + who + ' clears OTH');
            assert.equal(upd(cand, who, 'registrations/OTH/x1', { arrivedBy: 'golfer' }), false, name + ' ' + who + ' rewrites OTH arrivedBy');
            assert.equal(upd(cand, who, 'registrations/OTH/nope', GOLFER), false, name + ' ' + who + ' creates an entry from arrival keys');
            assert.equal(wr(cand, who, 'registrations/OTH/x1/paid', true), false, name + ' ' + who + ' marks OTH paid');
        }
        assert.equal(upd(cand, 'other', 'registrations/STK/e3', { arrivedAt: null, arrivedBy: null }), false, name + ' the other organizer clears STK');
        assert.equal(upd(cand, 'other', 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'organizer' }), false, name + ' the other organizer marks STK');
        assert.equal(upd(cand, 'other', 'registrations/OTH/x1', { arrivedAt: null, arrivedBy: null }), true, name + ' positive: OTH\'s own organizer clears OTH');
    }
});

test('5. the owner sets (organizer) and clears an arrival on any entry of the event; BASE refuses the set (closed schema)', () => {
    assert.ok(CI, 'no builder');
    for (const [name, base, cand] of arms()) {
        assert.equal(upd(cand, 'owner', 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'organizer' }), true, name + ' owner marks');
        assert.equal(upd(cand, 'owner', 'registrations/STK/e3', { arrivedAt: null, arrivedBy: null }), true, name + ' owner undoes');
        assert.equal(upd(cand, 'owner', 'registrations/STK/e3', { arrivedAt: T + 5, arrivedBy: 'organizer' }), true, name + ' owner overwrites');
        assert.equal(upd(cand, 'owner', 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'desk' }), false, name + ' owner: arrivedBy is typed');
        assert.equal(upd(base, 'owner', 'registrations/STK/e1', { arrivedAt: T, arrivedBy: 'organizer' }), false, name + ' BASE refuses the owner\'s mark (no named key)');
    }
});

test('6. reads: anyone reads one entry\'s arrivedAt and paid; nobody but the owner reads the entry, its email or its name, or the event\'s list', () => {
    assert.ok(CI, 'no builder');
    for (const [name, base, cand] of arms()) {
        for (const who of ['out', 'anon', 'other']) {
            assert.equal(rd(cand, who, 'registrations/STK/e3/arrivedAt'), true, name + ' ' + who + ' arrivedAt');
            assert.equal(rd(cand, who, 'registrations/STK/e3/paid'), true, name + ' ' + who + ' paid');
            assert.equal(rd(base, who, 'registrations/STK/e3/arrivedAt'), false, name + ' ' + who + ' arrivedAt closed on BASE');
            for (const p of ['registrations/STK', 'registrations/STK/e3', 'registrations/STK/e3/email', 'registrations/STK/e3/fullName', 'registrations/STK/e3/phone', 'registrations/STK/e3/arrivedBy'])
                assert.equal(rd(cand, who, p), false, name + ' ' + who + ' reads ' + p);
        }
        assert.equal(rd(cand, 'owner', 'registrations/STK'), true, name + ' positive: the owner reads the list');
    }
});

test('7. today\'s flows hold on CAND: a public signup create, the owner\'s approve and paid, the golfer still cannot create pre-approved', () => {
    assert.ok(CI, 'no builder');
    for (const [name, , cand] of arms()) {
        const signup = { fullName: 'New Golfer', email: 'new@example.com', phone: '6025550199', createdAt: T };
        assert.equal(wr(cand, 'out', 'registrations/STK/n1', signup), true, name + ' public signup');
        assert.equal(wr(cand, 'out', 'registrations/STK/n2', Object.assign({ approvedAt: T }, signup)), false, name + ' pre-approved signup');
        assert.equal(wr(cand, 'out', 'registrations/STK/n3', Object.assign({ arrivedAt: T, arrivedBy: 'golfer' }, signup)), false, name + ' a signup that arrives itself (not approved)');
        assert.equal(upd(cand, 'owner', 'registrations/STK/e2', { approvedAt: T, playerId: 'p2' }), true, name + ' owner approves');
        assert.equal(upd(cand, 'owner', 'registrations/STK/e2', { paid: true, paidAt: T }), true, name + ' owner marks paid');
    }
});
