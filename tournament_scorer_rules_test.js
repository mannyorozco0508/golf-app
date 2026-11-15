// ============================================================================
// ONE SCORER PER GROUP, A - RULES (ADVISOR-20261114-1527) - targaryen, nothing live
//
// tools/scorer-rules-candidate.js adds tournaments/$tourneyCode/joins (the watch
// card's "That's me"). Two bases, each READ ONLY, each run as BASE (the
// control) and CAND = build(BASE):
//   LIVE = the last live read-back on this machine (env SCORER_RULES_LIVE, or
//          ~/Desktop/claude-mailbox/outbox/rules-publish-20261113-55a/
//          readback.json, sha256 bdf19a87...). Skipped when absent.
//   REPO = this repo's database.rules.json (behind live; its tournaments
//          node has the same owner grant). Always runs.
// Nothing is published; the repo's database.rules.json is not changed.
//
// What CAND must allow and refuse is asserted on CAND; what it newly allows is
// asserted REFUSED on BASE, so the block is what does the work. Test 6 is
// about Switch scorer and needs NO candidate: it runs on LIVE (and REPO) as
// they are, and proves the organizer's re-key is allowed today and that the
// old link's next score is refused while the new one's is accepted.
//
// BASELINE (final file, CLAUDE.md count rule): against preview-batch 5033e24b,
// where tools/scorer-rules-candidate.js does not exist (a detached worktree at
// 5033e24b with this file copied in): 6 tests - 1 pass / 5 fail (1 + 5 = 6).
// The 1 that passes is test 6 (Switch scorer on the rules as they are) - it
// needs no builder, by design. On preview-sc with the builder and the LIVE
// read-back present: 6 tests - 6 pass / 0 fail.
// Controls (the builder mutated, saved first and restored by sha):
//   R1 a golfer may delete a join (.write without newData.exists()) -> 3, 5 red
//   R2 extra fields allowed ($other removed)        -> 1, 3, 5 red
//   R3 any name (the roster match OR-ed away)       -> 3 red
//   R4 no owned-event check                         -> 3 red
//   R5 no group-exists check                        -> 3 red
//   R6 a future time allowed                        -> 3 red
//   R7 the builder also opens scores                -> 1, 4 red
//   R8 no team-exists check -> NOTHING red: a belt. On a team entry the name
//      rule (teams/<entry>/players/<i>) already refuses a team that does not
//      exist, so this check cannot be singled out. Said, not hidden.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const targaryen = require('targaryen');

let SC = null;
try { SC = require('./tools/scorer-rules-candidate.js'); } catch (e) { /* red below */ }

const LIVE_FILE = process.env.SCORER_RULES_LIVE || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'rules-publish-20261113-55a', 'readback.json');
const BASES = { REPO: JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8')) };
if (fs.existsSync(LIVE_FILE)) BASES.LIVE = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));

const AUTH = {
    owner: { uid: 'u-org', token: { email: 'org@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', token: { email: 'other@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    anon: { uid: 'u-anon', token: { firebase: { sign_in_provider: 'anonymous' } } },
    out: null
};
const T = 1763100000000;
const K_OLD = 'a1'.repeat(16), K_NEW = 'b2'.repeat(16);
const TS = { '.sv': 'timestamp' };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4 }));
function data(keys) {
    return {
        tournaments: {
            STK: { name: 'Starkey Classic', ownerUid: 'u-org', createdAt: 1, format: 'bestball', courseData: COURSE,
                teams: { team3: { num: 3, name: 'Group 3', players: ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz'] } },
                scores: { team3_p0_h5: 4 },
                joins: { team3: { p1: { name: 'Lee Park', at: T } } } },
            IND: { name: 'Starkey Individual', ownerUid: 'u-org', createdAt: 1, format: 'individual',
                players: { p3c: { id: 'p3c', name: 'Kim Vo' }, p3d: { id: 'p3d', name: 'Ray Diaz' } },
                scoringGroups: { g3: { name: 'Group 3', playerIds: ['p3c', 'p3d'] } } },
            MR: { name: 'Two Day', ownerUid: 'u-org', createdAt: 1, eventModel: 'round-v1',
                players: { p3c: { id: 'p3c', name: 'Kim Vo' } }, rounds: { r1: { name: 'Round 1', status: 'open', scoringGroups: { g3: { playerIds: ['p3c'] } } } } },
            LEG: { name: 'Legacy, no owner', createdAt: 1, teams: { team1: { num: 1, players: ['Al Lopez'] } } },
            OTH: { name: 'Other Open', ownerUid: 'u-other', createdAt: 1, teams: { team3: { num: 3, players: ['Zed Ames'] } } }
        },
        tournamentKeys: { STK: keys || { on: true, t: { team3: K_OLD } } },
        registrations: { STK: { e1: { fullName: 'Kim Vo', email: 'kim@example.com', phone: '6025550102', createdAt: 1, approvedAt: 2 } } }
    };
}
const db = (rules, who, d) => targaryen.database(rules, d || data()).as(AUTH[who]);
const wr = (rules, who, p, v, d) => db(rules, who, d).write(p, v).allowed;
const upd = (rules, who, p, patch, d) => db(rules, who, d).update(p, patch).allowed;
const arms = () => Object.keys(BASES).map((k) => [k, BASES[k], SC ? SC.build(BASES[k]) : null]);
const JOIN = (name) => ({ name: name, at: TS });

function leaves(o, p, out) {
    out = out || {};
    if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], p + '/' + k, out);
    else out[p] = o;
    return out;
}

test('1. the builder exists, adds only tournaments/$tourneyCode/joins on each base, and refuses to build twice', () => {
    assert.ok(SC, 'tools/scorer-rules-candidate.js is missing');
    for (const [name, base, cand] of arms()) {
        const a = leaves(base, ''), b = leaves(cand, '');
        const moved = Object.keys(Object.assign({}, a, b)).filter((k) => a[k] !== b[k]);
        assert.ok(moved.length >= 5, name + ' positive: the block adds leaves (' + moved.length + ')');
        assert.deepEqual(moved.filter((k) => !SC.PATHS.some((p) => k.startsWith(p + '/'))), [], name + ': a leaf outside joins moved');
        assert.throws(() => SC.build(cand), /LIVE HAS MOVED/, name + ': building twice refuses');
    }
});

test('2. anyone with the code (signed out or anonymous) can join as a golfer on the card - team slot, group player, round group - and change it; BASE refuses every one', () => {
    assert.ok(SC, 'no builder');
    for (const [name, base, cand] of arms()) {
        for (const who of ['out', 'anon']) {
            const cases = [['tournaments/STK/joins/team3/p2', 'Kim Vo'], ['tournaments/STK/joins/team3/p1', 'Lee Park'],
                ['tournaments/IND/joins/g3/p3c', 'Kim Vo'], ['tournaments/MR/joins/r1_g3/p3c', 'Kim Vo']];
            for (const [p, n] of cases) {
                assert.equal(wr(cand, who, p, JOIN(n)), true, name + ' ' + who + ' joins ' + p);
                assert.equal(wr(base, who, p, JOIN(n)), false, name + ' ' + who + ' refused on BASE ' + p);
            }
        }
    }
});

test('3. a join is name + at only, the roster\'s own name for that slot, on an entry that exists of an owned event; a golfer cannot delete one', () => {
    assert.ok(SC, 'no builder');
    for (const [name, , cand] of arms()) {
        const no = (p, v, why) => assert.equal(wr(cand, 'out', p, v), false, name + ': ' + why);
        no('tournaments/STK/joins/team3/p2', { name: 'Kim Vo', at: TS, uid: 'u-x' }, 'an extra field (uid)');
        no('tournaments/STK/joins/team3/p2', { name: 'Kim Vo', at: TS, email: 'kim@example.com' }, 'an extra field (email)');
        no('tournaments/STK/joins/team3/p2', { name: 'Kim Vo' }, 'no at');
        no('tournaments/STK/joins/team3/p2', { at: TS }, 'no name');
        no('tournaments/STK/joins/team3/p2', { name: 'Someone Rude', at: TS }, 'a name that is not the roster\'s');
        no('tournaments/STK/joins/team3/p2', { name: 'Lee Park', at: TS }, 'another slot\'s name');
        no('tournaments/STK/joins/team3/p2', { name: 'Kim Vo', at: T * 10 }, 'a time in the future');
        no('tournaments/STK/joins/team3/p2', { name: 'Kim Vo', at: 'now' }, 'an untyped time');
        no('tournaments/STK/joins/team9/p0', JOIN('Kim Vo'), 'a team that does not exist');
        no('tournaments/IND/joins/g9/p3c', JOIN('Kim Vo'), 'a group that does not exist');
        no('tournaments/IND/joins/g3/p9z', JOIN('Kim Vo'), 'a player that does not exist');
        no('tournaments/STK/joins/team3/Kim Vo', JOIN('Kim Vo'), 'a slot that is not p<i> / a player id');
        no('tournaments/LEG/joins/team1/p0', JOIN('Al Lopez'), 'a legacy event with no owner');
        no('tournaments/STK/joins/team3/p1', null, 'a golfer deletes a join');
        no('tournaments/STK/joins/team3', null, 'a golfer deletes the card\'s joins');
        assert.equal(wr(cand, 'out', 'tournaments/STK/joins/team3/p2', JOIN('Kim Vo')), true, name + ' positive: the plain join still passes');
    }
});

test('4. a joiner reaches nothing else: no score on a keyed event, no proof, no key, no scorer name, no registration, no event field', () => {
    assert.ok(SC, 'no builder');
    for (const [name, , cand] of arms()) {
        for (const who of ['out', 'anon']) {
            const no = (ok, why) => assert.equal(ok, false, name + ' ' + who + ': ' + why);
            no(wr(cand, who, 'tournaments/STK/scores/team3_p2_h6', 4), 'a score with no proof (keys on)');
            no(upd(cand, who, '/', { 'tournaments/STK/scores/team3_p2_h6': 4, 'tournaments/STK/joins/team3/p2': JOIN('Kim Vo') }), 'a score riding with a join');
            no(wr(cand, who, 'tournamentKeys/STK/t/team3', K_NEW), 'a key');
            no(wr(cand, who, 'tournaments/STK/scorers/team3', { name: 'Kim Vo', at: TS }), 'the scorer name');
            no(wr(cand, who, 'registrations/STK/e1/approvedAt', T), 'a registration');
            no(wr(cand, who, 'tournaments/STK/name', 'Renamed'), 'the event name');
            no(wr(cand, who, 'tournaments/STK/teams/team3/players/2', 'Kim Vo'), 'the roster');
        }
    }
});

test('5. the owner clears a join (one, or the card\'s); a signed-in organizer of another event cannot', () => {
    assert.ok(SC, 'no builder');
    for (const [name, , cand] of arms()) {
        assert.equal(wr(cand, 'owner', 'tournaments/STK/joins/team3/p1', null), true, name + ' owner clears one');
        assert.equal(wr(cand, 'owner', 'tournaments/STK/joins/team3', null), true, name + ' owner clears the card');
        assert.equal(wr(cand, 'other', 'tournaments/STK/joins/team3/p1', null), false, name + ' the other organizer clears');
        assert.equal(wr(cand, 'owner', 'tournaments/STK/joins/team3/p2', { name: 'Kim Vo', at: TS, note: 'x' }), false, name + ' the owner cannot write a bad shape either');
    }
});

test('6. SWITCH SCORER on the rules as they are (no candidate): the owner re-keys a team after scores and names the scorer; the old link\'s next score is refused, the new one\'s accepted; nobody else can re-key', () => {
    for (const [name, base] of Object.keys(BASES).map((k) => [k, BASES[k]])) {
        // the Desk's one update, against an event with a posted score
        assert.equal(upd(base, 'owner', '/', { 'tournamentKeys/STK/t/team3': K_NEW, 'tournaments/STK/scorers/team3': { name: 'Lee Park', at: TS } }), true, name + ' owner switches');
        for (const who of ['out', 'anon', 'other'])
            assert.equal(upd(base, who, '/', { 'tournamentKeys/STK/t/team3': K_NEW }), false, name + ' ' + who + ' cannot re-key');
        // after the switch
        const after = data({ on: true, t: { team3: K_NEW } });
        const score = (k) => upd(base, 'out', '/', { 'tournaments/STK/scores/team3_p2_h6': 4, 'scoreProofs/STK/team3_p2_h6': { who: 'team3', k: k, t: TS } }, after);
        assert.equal(score(K_OLD), false, name + ' the old link is refused');
        assert.equal(score(K_NEW), true, name + ' the new link scores');
        // and before it, the old link scored (the control for the pair above)
        const before = (k) => upd(base, 'out', '/', { 'tournaments/STK/scores/team3_p2_h6': 4, 'scoreProofs/STK/team3_p2_h6': { who: 'team3', k: k, t: TS } });
        assert.equal(before(K_OLD), true, name + ' positive: the old link scored before the switch');
    }
});
