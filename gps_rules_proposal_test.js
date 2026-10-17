// ============================================================================
// THE GREEN-PIN RULES, AS PROPOSED - NOT PUBLISHED (gps-v1, decision 2026-10-07)
//
// Manny's rule: any round member can set an EMPTY green; only the organizer can
// change an existing one. docs/gps-rules-proposal.json holds the two blocks
// that would do it; this file merges them into an IN-MEMORY copy of
// database.rules.json (the repo file is not touched, and nothing is published)
// and runs every case through targaryen.
//
// WHAT "ROUND MEMBER" CAN MEAN TO A RULE. The database cannot tell a golfer in
// the round from anyone else holding its code - events are readable by code,
// and the scorecard writes as an anonymous user. So "member" is: signed in
// (anonymous counts) and naming a live round (one with players). That is the
// same trust the scores already run on.
//
// "ORGANIZER" is the round's ownerUid. For the shared course copy it is the
// organizer of the round named in the pin's `ev`, and that round must be AT
// that course - so the organizer of any round played at Caledonia may fix a
// Caledonia green, and nobody else may. An organizer who proves it only with
// the organizer-link token (no matching uid) is refused here: rules cannot read
// tokens. A round with no ownerUid (legacy) has no organizer: its round pins
// stay open to code holders, as its scores are.
//
// KNOWN LIMIT, asserted below so it cannot be forgotten: events/<code> grants
// .write to code holders at the round level, and a grant cannot be taken back
// lower down, so the round copy is protected by .validate - which does not run
// on a delete. A code holder could DELETE a round pin (never change it). The app
// never deletes one: an undo writes a new pin.
//
// PHASE 1 (of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK)). The green-pin rules are
// now IN database.rules.json, in their phase-1 form, so every case below runs
// against THE PUBLISHED FILE rather than the draft merged into a copy:
//   - events/<code>/gpsPins/$hole carries its own .write (first green by a
//     signed-in golfer on a live round; a change by the owner only), and the
//     round-level .write is no longer open to code holders - so the KNOWN LIMIT
//     is closed for an owned round. A legacy round (no ownerUid) is still
//     editable by any signed-in phone through the round-level legacy arm, so
//     there a code holder can still change or delete a round pin.
//   - course_gps/<key>/pins: as drafted, with an exact non-empty course key
//     (or a 27-hole pairing under a key ending _27).
//   - course_gps/<key>/osm and holeChoice are REFUSED from phones (the draft
//     let a phone fill an empty osm lookup). The app already treats a refused
//     osm write as fine.
// docs/gps-rules-proposal.json stays as the record of the draft.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const REPO_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8'));
const PROPOSAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'gps-rules-proposal.json'), 'utf8'));

// The draft merged into a copy - kept only to show the published file is NOT
// the draft (osm differs). Every verdict below reads REPO_RULES.
function proposedRules() {
    const r = JSON.parse(JSON.stringify(REPO_RULES));
    r.rules.course_gps = PROPOSAL.course_gps;
    r.rules.events.$eventCode.gpsPins = PROPOSAL['events/$eventCode/gpsPins'];
    return r;
}
const NOW = Date.now();
const pin = (lat, lng, ev, extra) => Object.assign({ mid: { lat, lng }, at: NOW - 1000, by: 'tap' }, ev ? { ev } : {}, extra || {});
const players = { 0: { id: 1, name: 'Ann' } };
const DATA = {
    events: {
        ROUND1: { ownerUid: 'org', activeCourseKey: 'caledonia', courseName: 'Caledonia', players, gpsPins: { h2: pin(33.45, -79.15) } },
        ROUND2: { ownerUid: 'org2', activeCourseKey: 'thistle_27', courseName: 'Thistle Golf Club (Cameron / Stewart)', players },
        LEGACY: { activeCourseKey: 'pinehills', courseName: 'Myrtlewood - Pine Hills', players, gpsPins: { h1: pin(33.7, -78.9) } },
        TYPED: { ownerUid: 'org3', courseName: 'Joe Muni', players },
    },
    course_gps: { caledonia: { pins: { h2: pin(33.45, -79.15, 'ROUND1') } } },
};
const db = (uid) => targaryen.database(REPO_RULES, DATA).as(uid ? { uid, provider: 'anonymous' } : null);
const can = (uid, p, v) => db(uid).write(p, v, NOW).allowed;

test('phase 1 (2026-10-17) carries course_gps and events gpsPins - the draft is history, not the rule', () => {
    assert.ok(REPO_RULES.rules.events && REPO_RULES.rules.global_courses, 'positive: the real ruleset loaded');
    // Was: course_gps / gpsPins undefined in the repo file. Phase-1 rules
    // of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK): both are live.
    assert.ok(REPO_RULES.rules.course_gps && REPO_RULES.rules.course_gps.$courseKey.pins.$hole['.write'], 'course_gps pins rule is live');
    assert.ok(REPO_RULES.rules.events.$eventCode.gpsPins.$hole['.write'], 'round pins carry their own .write');
    assert.strictEqual(REPO_RULES.rules.course_gps.$courseKey.osm['.write'], false, 'osm is refused from phones (the draft allowed an empty fill)');
    assert.strictEqual(REPO_RULES.rules.course_gps.$courseKey.holeChoice['.write'], false);
    assert.notDeepStrictEqual(proposedRules().rules.course_gps, REPO_RULES.rules.course_gps, 'the published block is not the draft');
    // TODAY, with the real rules: a golfer sets an empty round pin, may NOT change
    // one on an owned round (the draft's whole point, now enforced), and the
    // organizer sets the shared course copy.
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h1', pin(33.451, -79.151)), true);
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h2', pin(33.451, -79.151)), false, 'a golfer cannot change an owned round\'s green');
    assert.strictEqual(can('org', '/course_gps/caledonia/pins/h1', pin(33.45, -79.15, 'ROUND1')), true);
});

test('course_gps: any signed-in round member sets an EMPTY green; nobody but the organizer changes it', () => {
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', pin(33.451, -79.151, 'ROUND1')), true, 'empty: a golfer may set it');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h2', pin(33.451, -79.151, 'ROUND1')), false, 'existing: a golfer may NOT change it');
    assert.strictEqual(can('org', '/course_gps/caledonia/pins/h2', pin(33.451, -79.151, 'ROUND1')), true, 'existing: the organizer may');
    assert.strictEqual(can('org2', '/course_gps/caledonia/pins/h2', pin(33.451, -79.151, 'ROUND1')), false, 'another round\'s organizer naming ROUND1 is not its organizer');
});

test('course_gps: the round named must exist and be AT that course', () => {
    assert.strictEqual(can('org2', '/course_gps/caledonia/pins/h1', pin(33.451, -79.151, 'ROUND2')), false, 'a Thistle round cannot write Caledonia');
    assert.strictEqual(can('org2', '/course_gps/thistle_27_cameron_stewart/pins/h1', pin(33.9, -78.6, 'ROUND2')), true, 'a 27-hole pairing key starts with the round\'s course key');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', pin(33.451, -79.151, 'NOSUCH')), false, 'no such round');
    assert.strictEqual(can('org3', '/course_gps/name_joe_muni/pins/h1', pin(40, -75, 'TYPED')), false, 'a typed-in course has no course key to share under');
    assert.strictEqual(can(null, '/course_gps/caledonia/pins/h1', pin(33.451, -79.151, 'ROUND1')), false, 'signed out');
});

test('course_gps: no deletes, and only a well-formed pin', () => {
    assert.strictEqual(can('org', '/course_gps/caledonia/pins/h2', null), false, 'not even the organizer deletes - undo writes a new pin');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', { mid: { lat: '33', lng: -79 }, at: NOW, ev: 'ROUND1' }), false, 'lat as a string');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', pin(133, -79.15, 'ROUND1')), false, 'lat out of range');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', pin(33.45, -79.15)), false, 'no ev');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h0', pin(33.45, -79.15, 'ROUND1')), false, 'hole 0');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h28', pin(33.45, -79.15, 'ROUND1')), false, 'hole 28');
    assert.strictEqual(can('golfer', '/course_gps/caledonia/pins/h1', pin(33.45, -79.15, 'ROUND1', { at: NOW + 3600000 })), false, 'stamped an hour in the future, to win "newest" for ever');
});

test('round pins: anyone on the round sets an EMPTY green; only the organizer changes one', () => {
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h1', pin(33.451, -79.151)), true, 'empty: allowed');
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h2', pin(33.451, -79.151)), false, 'existing: a golfer may NOT change it');
    assert.strictEqual(can('org', '/events/ROUND1/gpsPins/h2', pin(33.451, -79.151)), true, 'existing: the organizer may');
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h1', { mid: { lat: 33 }, at: NOW }), false, 'malformed');
    assert.strictEqual(can('golfer', '/events/LEGACY/gpsPins/h1', pin(33.701, -78.901)), true, 'a round with no organizer stays open, as its scores are');
});

test('KNOWN LIMIT, narrowed by phase 1: no golfer deletes an OWNED round\'s pin; on a legacy round a signed-in code holder still can', () => {
    // Was: a code holder can delete any round pin (the round-level grant was
    // open). Phase-1 rules of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK): an owned
    // round's grant is the owner's, and gpsPins/$hole refuses a non-owner change
    // or delete. A legacy round (no ownerUid) is still editable by any signed-in
    // phone through the round-level legacy arm, so the limit survives there.
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h2', null), false, 'owned round: a golfer cannot delete a pin');
    assert.strictEqual(can(null, '/events/ROUND1/gpsPins/h2', null), false, 'signed out: no');
    assert.strictEqual(can('golfer', '/events/LEGACY/gpsPins/h1', null), true, 'legacy round: still deletable by a signed-in code holder');
});

test('the app writes what the proposal accepts: the course copy carries `ev`', () => {
    const v = fs.existsSync(path.join(__dirname, 'gps-view.js')) ? fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8') : null;
    if (!v) return;   // Consumer tree: no GPS side to check
    assert.ok(/Object\.assign\(\{\}, pin, \{ ev: S\.eventCode \}\)/.test(v), 'savePin stamps the round code on the course copy');
});

test('course_gps/<key>/osm (build 5): REFUSED from every phone in phase 1 - the app treats that as fine', () => {
    // Was: a signed-in phone fills an EMPTY lookup (the draft). Phase-1 rules
    // of 2026-10-17 (rules/database.rules.phase1.json, trips with no email sign-in; redeploy pending Manny's OK): osm is .write false - no phone
    // fills, changes or deletes it.
    const rec = { v: 1, src: 'osm-lookup', at: NOW - 1000, holes: { 1: { osm: { mid: [47.2, -122.57] } } } };
    assert.strictEqual(can('golfer', '/course_gps/gca_50bc8qqa/osm', rec), false, 'empty: refused even to a signed-in phone');
    assert.strictEqual(can(null, '/course_gps/gca_50bc8qqa/osm', rec), false, 'signed out: no');
    assert.strictEqual(can('org', '/course_gps/gca_50bc8qqa/osm', Object.assign({}, rec, { src: 'typed' })), false, 'not a typed record either');
    const withOsm = JSON.parse(JSON.stringify(DATA));
    withOsm.course_gps.gca_50bc8qqa = { osm: rec };
    assert.strictEqual(targaryen.database(REPO_RULES, withOsm).as({ uid: 'org', provider: 'anonymous' }).write('/course_gps/gca_50bc8qqa/osm', rec, NOW).allowed, false, 'once there, nobody overwrites it');
    assert.strictEqual(targaryen.database(REPO_RULES, withOsm).as({ uid: 'org', provider: 'anonymous' }).write('/course_gps/gca_50bc8qqa/osm', null, NOW).allowed, false, 'or deletes it');
    // The draft, for the record, would have accepted the empty fill.
    assert.strictEqual(targaryen.database(proposedRules(), DATA).as({ uid: 'golfer', provider: 'anonymous' }).write('/course_gps/gca_50bc8qqa/osm', rec, NOW).allowed, true, 'positive control: the draft differs here');
});
