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
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const REPO_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8'));
const PROPOSAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'gps-rules-proposal.json'), 'utf8'));

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
const db = (uid) => targaryen.database(proposedRules(), DATA).as(uid ? { uid, provider: 'anonymous' } : null);
const can = (uid, p, v) => db(uid).write(p, v, NOW).allowed;

test('the proposal is NOT in database.rules.json - recorded, not applied', () => {
    assert.ok(REPO_RULES.rules.events && REPO_RULES.rules.global_courses, 'positive: the real ruleset loaded');
    assert.strictEqual(REPO_RULES.rules.course_gps, undefined);
    assert.strictEqual(REPO_RULES.rules.events.$eventCode.gpsPins, undefined);
    // TODAY, with the real rules: round pins are accepted (they ride the round's
    // own open write, like scores), and the shared course copy is refused outright.
    assert.strictEqual(targaryen.database(REPO_RULES, DATA).as({ uid: 'golfer' }).write('/events/ROUND1/gpsPins/h1', pin(33.451, -79.151), NOW).allowed, true);
    assert.strictEqual(targaryen.database(REPO_RULES, DATA).as({ uid: 'golfer' }).write('/events/ROUND1/gpsPins/h2', pin(33.451, -79.151), NOW).allowed, true, 'and today anyone can change one - which the proposal closes');
    assert.strictEqual(targaryen.database(REPO_RULES, DATA).as({ uid: 'org' }).write('/course_gps/caledonia/pins/h1', pin(33.45, -79.15, 'ROUND1'), NOW).allowed, false);
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

test('KNOWN LIMIT: a code holder can DELETE a round pin (validate does not run on delete)', () => {
    // If this ever starts failing, the limit is gone - delete this test and the
    // paragraph about it in the header and in docs/gps-builds.md.
    assert.strictEqual(can('golfer', '/events/ROUND1/gpsPins/h2', null), true);
});

test('the app writes what the proposal accepts: the course copy carries `ev`', () => {
    const v = fs.existsSync(path.join(__dirname, 'gps-view.js')) ? fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8') : null;
    if (!v) return;   // Consumer tree: no GPS side to check
    assert.ok(/Object\.assign\(\{\}, pin, \{ ev: S\.eventCode \}\)/.test(v), 'savePin stamps the round code on the course copy');
});
