// ============================================================================
// THE LOCKED-DOWN RULES, PROBED (mailbox 003, 2026-10-17) - PREP ONLY, NOTHING PUBLISHED
//
// rules/database.rules.proposed.json (built by tools/build-proposed-rules.js from the LIVE
// rules read on 2026-10-17) against two lists:
//   DENY  every probe in INDEPENDENT-AUDIT.md section A (C1-C4, H4, M1, M2, M4's write) and the
//         tricks around them (delete + recreate, claiming a legacy round, a forged scorer claim);
//   ALLOW every normal flow: organizer setup, scorekeeper, player scoring, spectator read,
//         trips, tournaments, offline replay (the queued writes landing later, signed in).
// Each DENY is paired with the same write by the person who SHOULD be able to make it, so a
// rule that refuses everything cannot pass.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'database.rules.proposed.json'), 'utf8'));
const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'live-2026-10-17.json'), 'utf8'));
const NOW = Date.now();
const DAY = 86400000;

// People. Round organizers are usually ANONYMOUS (the app signs every phone in anonymously);
// trip and tournament organizers sign in with email.
const anon = (uid) => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const email = (uid, e) => ({ uid, provider: 'password', token: { email: e, email_verified: true, firebase: { sign_in_provider: 'password' } } });
const OWN = anon('own');            // the round's organizer
const GOLFER = anon('golfer');      // a golfer / scorekeeper on the round
const STRANGER = anon('stranger');  // signed in, holds the code, not on the round
const OUT = null;                   // not signed in
const TRIPOWN = email('tripown', 'trip@owner.test');
const OLDTRIP = email('oldtrip', 'old@owner.test');
const TORG = email('torg', 'torg@owner.test');

const players = { 0: { id: 101, name: 'Ann Able' }, 1: { id: 102, name: 'Ben Bravo' } };
const courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const card = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const pin = (lat, lng, ev) => Object.assign({ mid: { lat, lng }, at: NOW - 1000, by: 'tap' }, ev ? { ev } : {});
const round = (extra) => Object.assign({ players, courseData, courseName: 'Caledonia', activeCourseKey: 'caledonia', scores: { p101_h1: 4 },
    organizerToken: 'tok-0123456789abcdef', scoreKeys: { 1: 'abc' }, payouts: { a: 1 }, nassauStake: 5, skinsBuyIn: 10 }, extra || {});

const DATA = {
    events: {
        ROUND1: round({ ownerUid: 'own', gpsPins: { h2: pin(33.45, -79.15) } }),
        LEGACY: round({}),
        TRIPRD: round({ ownerUid: 'tripown', tripCode: 'TRIP1' }),
        AT27: round({ ownerUid: 'own27', activeCourseKey: 'thistle_27', courseName: 'Thistle Golf Club (Cameron / Stewart)' }),
        NOKEY: round({ ownerUid: 'ownnk', activeCourseKey: '' }),
    },
    trips: {
        TRIP1: { ownerUid: 'tripown', ownerEmail: 'trip@owner.test', tripName: 'Myrtle', eventCode: 'TRIPRD', rounds: { TRIPRD: { name: 'Day 1' } } },
        OLDT: { ownerEmail: 'old@owner.test', tripName: 'Old trip', eventCode: 'X1' },
    },
    global_courses: {
        pebble_beach: { name: 'Pebble Beach', data: card },
        gapi_123: { name: 'Server card', data: card },
        gca_456: { name: 'Import', data: card, source: { providerCourseId: 456 } },
    },
    organizers: { own: { firstSeenAt: NOW - 40 * DAY, groups: { g1: { name: 'Sunday', members: { m1: { name: 'Ann' } } } } } },
    tournaments: {
        TKEY: { ownerUid: 'torg', name: 'Keyed', lockedLinks: true, teams: { team1: { name: 'A' }, team2: { name: 'B' } }, scores: { team1_h1: 4 } },
        TOLD: { ownerUid: 'torg', name: 'Before keys', teams: { team1: { name: 'A' } }, scores: {} },
        TMULTI: { ownerUid: 'torg', name: 'Two days', lockedLinks: true, eventModel: 'rounds', rounds: { r1: { name: 'Day 1', status: 'open', scores: {} } } },
    },
    tournamentKeys: { TKEY: { team1: 'k-team1-aaaaaaaa', team2: 'k-team2-bbbbbbbb', groupg1: 'k-group-cccccccc' }, TMULTI: { team1: 'k-multi-dddddddd' } },
    tournamentScorers: { TKEY: { s1: { slot: 'team1', key: 'k-team1-aaaaaaaa' }, sg: { slot: 'groupg1', key: 'k-group-cccccccc' } }, TMULTI: { s1: { slot: 'team1', key: 'k-multi-dddddddd' } } },
    course_gps: { caledonia: { pins: { h2: pin(33.45, -79.15, 'ROUND1') } } },
};
const db = (rules, data) => targaryen.database(rules || RULES, data || DATA);
const can = (who, p, v, rules) => db(rules).as(who).write(p, v, NOW).allowed;
const canUpdate = (who, p, patch, rules) => db(rules).as(who).update(p, patch, NOW).allowed;
const canRead = (who, p) => db().as(who).read(p, NOW).allowed;
const DENY = (who, p, v, why) => assert.strictEqual(can(who, p, v), false, 'should DENY: ' + why);
const ALLOW = (who, p, v, why) => assert.strictEqual(can(who, p, v), true, 'should ALLOW: ' + why);
const S1 = anon('s1'), SG = anon('sg');

test('the proposal is built on LIVE, and the live probes really were open (the control)', () => {
    assert.ok(RULES.rules.events && RULES.rules.gps_courses && RULES.rules.gps_links, 'live-only blocks kept');
    // C1 on the LIVE rules: a signed-out phone rewrites a round's players. If this ever fails
    // the probe itself is broken, not the lock.
    assert.strictEqual(can(OUT, '/events/ROUND1/scores/p101_h2', 5, LIVE), true, 'live: signed-out score write');
    assert.strictEqual(can(STRANGER, '/trips/TRIP1/tripName', 'pwned', LIVE), false, 'live trips refuse anonymous (email needed)');
    assert.strictEqual(can(OUT, '/global_courses/pebble_beach', { name: 'Pebble', data: card.map((h) => Object.assign({}, h, { par: 3 })) }, LIVE), true, 'live: anyone rewrites a course');
    assert.strictEqual(can(OUT, '/tournaments/TKEY/scores/team1_h2', 3, LIVE), true, 'live: signed-out tournament score');
});

// ---- C1 / M2 / M4: rounds ---------------------------------------------------------------
test('C1: nobody but the organizer rewrites a round (players, stakes, payouts, token, keys, settings)', () => {
    for (const who of [OUT, STRANGER, GOLFER]) {
        DENY(who, '/events/ROUND1/players', { 0: { id: 1, name: 'Mallory' } }, 'players');
        DENY(who, '/events/ROUND1/nassauStake', 500, 'a stake');
        DENY(who, '/events/ROUND1/skinsBuyIn', 500, 'skins buy-in');
        DENY(who, '/events/ROUND1/payouts', { a: 999 }, 'payouts');
        DENY(who, '/events/ROUND1/organizerToken', 'mallory-0123456789', 'the organizer token (M4 write)');
        DENY(who, '/events/ROUND1/scoreKeys', { 1: 'x' }, 'scoreKeys');
        DENY(who, '/events/ROUND1/courseData', courseData, 'courseData');
        DENY(who, '/events/ROUND1/settlementMode', 'x', 'a setting');
        DENY(who, '/events/ROUND1/kpCancelled', { cancelled: true }, 'KP cancel (organizer only in the app)');
        DENY(who, '/events/ROUND1', null, 'delete the round');
        DENY(who, '/events/ROUND1/ownerUid', who ? who.uid : 'x', 'take the round');
    }
    ALLOW(OWN, '/events/ROUND1/nassauStake', 10, 'the organizer changes the stake');
    ALLOW(OWN, '/events/ROUND1/players', { 0: { id: 101, name: 'Ann Able' }, 1: { id: 103, name: 'Cal Cole' } }, 'the organizer edits players');
    ALLOW(OWN, '/events/ROUND1/organizerToken', 'tok-fedcba9876543210', 'the organizer resets the token');
    ALLOW(OWN, '/events/ROUND1', null, 'the organizer deletes their round');
});
test('C1: signed out, nothing at all is written - not even a score', () => {
    DENY(OUT, '/events/ROUND1/scores/p101_h2', 5, 'a signed-out score');
    DENY(OUT, '/events/ROUND1/scores', null, 'wipe scores signed out');
    DENY(OUT, '/events/NEWONE', round({ ownerUid: 'x' }), 'create signed out');
});
test('delete + recreate: nobody empties a code to claim it', () => {
    DENY(STRANGER, '/events/ROUND1', round({ ownerUid: 'stranger' }), 'overwrite as a new owner');
    DENY(STRANGER, '/events/ROUND1', null, 'delete first');
    assert.strictEqual(canUpdate(STRANGER, '/', { 'events/ROUND1': null, 'events/ROUND1x': round({ ownerUid: 'stranger' }) }), false, 'one atomic delete + create');
    DENY(GOLFER, '/events/LEGACY', null, 'a legacy round (no owner) cannot be deleted by a code holder');
    DENY(GOLFER, '/events/LEGACY/ownerUid', 'golfer', 'nor claimed');
    DENY(GOLFER, '/events/NEWONE', round({ ownerUid: 'someone-else' }), 'create naming another uid');
});
test('M2: the round keeps its shape - players and courseData are what the app writes', () => {
    DENY(OWN, '/events/ROUND1/players', 'Mallory', 'players as a string');
    DENY(OWN, '/events/ROUND1/players/0', { id: '101', name: 'Ann' }, 'id as a string');
    DENY(OWN, '/events/ROUND1/players/0', { id: 101, name: '' }, 'empty name');
    DENY(OWN, '/events/ROUND1/players/0', { id: 101, name: 'x'.repeat(61) }, '61-character name');
    DENY(OWN, '/events/ROUND1/players/0', { id: 101, name: 7 }, 'name as a number');
    DENY(OWN, '/events/ROUND1/courseData', 'par 3s', 'courseData as a string');
    DENY(OWN, '/events/ROUND1/courseData/0', { hole: 0, par: 4 }, 'hole 0');
    DENY(OWN, '/events/ROUND1/courseData/0', { hole: 1, par: 9 }, 'par 9');
    DENY(OWN, '/events/ROUND1/organizerToken', 'short', 'a token under 16');
    ALLOW(OWN, '/events/ROUND1/players/0', { id: 101, name: 'x'.repeat(60), hcp: 4 }, '60 characters, extra fields kept');
    ALLOW(OWN, '/events/ROUND1/courseData/0', { hole: 1, par: 3, hcpIndex: 7, yardage: 160 }, 'a real hole');
});
test('THE 21-DAY WALL IS GONE: an organizer whose trial "ended" long ago still creates a round', () => {
    ALLOW(OWN, '/events/NEWONE', round({ ownerUid: 'own' }), '40 days after firstSeenAt, no pass');
    ALLOW(anon('brandnew'), '/events/NEWTWO', round({ ownerUid: 'brandnew' }), 'no organizers record at all');
    assert.ok(!/1814400000|pass\/expiresAt/.test(JSON.stringify(RULES.rules.events)), 'no trial clause left in the events rules');
    assert.ok(/1814400000/.test(JSON.stringify(LIVE.rules.events)), 'control: live has it');
});

// ---- scoring on a round ------------------------------------------------------------------
test('SCORES: any signed-in golfer on the round scores, as today; the shape still holds', () => {
    ALLOW(GOLFER, '/events/ROUND1/scores/p101_h2', 5, 'a golfer scores');
    ALLOW(STRANGER, '/events/ROUND1/scores/p102_h2', 5, 'a scorekeeper with the code (the app cannot tell them apart; unchanged)');
    ALLOW(GOLFER, '/events/ROUND1/scores/p101_h1', null, 'clear a score');
    DENY(GOLFER, '/events/ROUND1/scores/p101_h2', 40, 'a 40');
    DENY(GOLFER, '/events/ROUND1/scores/garbage', 4, 'a bad key');
    DENY(GOLFER, '/events/NOSUCH/scores/p101_h2', 4, 'a score into a round that does not exist');
    for (const k of ['kpLeaders/h3', 'kpWinners/h3', 'kpConfirmed/h3', 'kpGroupAnswers/g1', 'sideMatches/m1', 'matchPresses/x', 'strokePresses/x',
        'dots/p101_h2', 'auditLog/a1', 'scoresVerified/p101', 'wolfCalls/h1', 'ryderCup/x', 'ryderCupRef/x', 'ryderFoursomes/x', 'additionalGameInstances/x', 'pointsGame/x']) {
        ALLOW(GOLFER, '/events/ROUND1/' + k, { v: 1 }, 'game play child ' + k);
        DENY(OUT, '/events/ROUND1/' + k, { v: 1 }, 'signed out ' + k);
    }
});
test('LEGACY rounds (made before ownerUid) still take setup from signed-in phones, never a delete', () => {
    ALLOW(GOLFER, '/events/LEGACY/nassauStake', 5, 'as before - there is no organizer to check');
    DENY(OUT, '/events/LEGACY/nassauStake', 5, 'but signed in');
    DENY(GOLFER, '/events/LEGACY', null, 'no delete');
});
test('TRIP rounds: the trip owner sets players and pots on the trip\'s rounds; a stranger does not', () => {
    ALLOW(TRIPOWN, '/events/TRIPRD/players', players, 'roster');
    assert.strictEqual(canUpdate(TRIPOWN, '/', { 'events/TRIPRD/players': players, 'events/TRIPRD/groupSizeOverrides': { 1: 4 }, 'events/TRIPRD/moneyPool': { pot: 20 } }), true, 'trip-roster multi-path update');
    DENY(STRANGER, '/events/TRIPRD/players', players, 'a stranger');
    DENY(OLDTRIP, '/events/TRIPRD/players', players, 'another trip organizer');
});

// ---- GPS pins (C4) -----------------------------------------------------------------------
test('C4 round pins: the FIRST green by a golfer; changing or deleting one is the organizer\'s', () => {
    ALLOW(GOLFER, '/events/ROUND1/gpsPins/h1', pin(33.451, -79.151), 'empty green');
    DENY(GOLFER, '/events/ROUND1/gpsPins/h2', pin(33.451, -79.151), 'change one');
    DENY(GOLFER, '/events/ROUND1/gpsPins/h2', null, 'DELETE one (the draft let this through)');
    DENY(GOLFER, '/events/ROUND1/gpsPins', null, 'wipe the node');
    DENY(GOLFER, '/events/ROUND1/gpsPins', { h2: pin(1, 1) }, 'replace the node');
    DENY(OUT, '/events/ROUND1/gpsPins/h1', pin(33.451, -79.151), 'signed out');
    DENY(GOLFER, '/events/ROUND1/gpsPins/h1', { mid: { lat: 33 }, at: NOW }, 'malformed');
    DENY(GOLFER, '/events/ROUND1/gpsPins/h1', Object.assign(pin(33.4, -79.1), { at: NOW + 3600000 }), 'stamped in the future');
    ALLOW(OWN, '/events/ROUND1/gpsPins/h2', pin(33.451, -79.151), 'the organizer fixes one');
    assert.strictEqual(canUpdate(GOLFER, '/', { 'events/ROUND1': null }), false, 'delete + recreate around the owner check');
});
test('C4 course_gps: exact non-empty course key, organizer-only changes, no deletes, no phone-written OSM cache', () => {
    ALLOW(GOLFER, '/course_gps/caledonia/pins/h1', pin(33.451, -79.151, 'ROUND1'), 'empty green, round at this course');
    DENY(GOLFER, '/course_gps/caledonia/pins/h2', pin(33.451, -79.151, 'ROUND1'), 'change one');
    ALLOW(OWN, '/course_gps/caledonia/pins/h2', pin(33.451, -79.151, 'ROUND1'), 'the round\'s organizer changes one');
    DENY(OWN, '/course_gps/caledonia/pins/h2', null, 'no deletes, even the organizer');
    DENY(anon('ownnk'), '/course_gps/anything_at_all/pins/h1', pin(1, 1, 'NOKEY'), 'EMPTY activeCourseKey (beginsWith(\'\') was true for every course)');
    DENY(OWN, '/course_gps/caledonia_national/pins/h1', pin(1, 1, 'ROUND1'), 'a different course that starts with the same letters');
    ALLOW(anon('own27'), '/course_gps/thistle_27_cameron_stewart/pins/h1', pin(33.9, -78.6, 'AT27'), 'a 27-hole pairing key');
    DENY(GOLFER, '/course_gps/caledonia/pins/h1', pin(33.45, -79.15, 'NOSUCH'), 'no such round');
    DENY(OUT, '/course_gps/caledonia/pins/h1', pin(33.45, -79.15, 'ROUND1'), 'signed out');
    DENY(GOLFER, '/course_gps/caledonia/pins/h28', pin(33.45, -79.15, 'ROUND1'), 'hole 28');
    const osm = { v: 1, src: 'osm-lookup', at: NOW - 1000, holes: { 1: { osm: { mid: [47.2, -122.57] } } } };
    DENY(GOLFER, '/course_gps/newcourse/osm', osm, 'the write-once OSM cache from a phone');
    DENY(GOLFER, '/course_gps/newcourse/holeChoice', 'x', 'holeChoice from a phone');
    DENY(GOLFER, '/gps_courses/x', { a: 1 }, 'gps_courses');
    DENY(GOLFER, '/gps_links/x', 'y', 'gps_links');
    assert.strictEqual(canRead(GOLFER, '/course_gps/caledonia'), true, 'a signed-in phone reads greens');
    assert.strictEqual(canRead(OUT, '/course_gps/caledonia'), false, 'signed out does not');
});

// ---- C2 trips ----------------------------------------------------------------------------
test('C2: only the trip\'s owner writes it; golfers keep who-am-I and the league', () => {
    for (const who of [OUT, STRANGER, OLDTRIP]) {
        DENY(who, '/trips/TRIP1/rounds', {}, 'rounds list');
        DENY(who, '/trips/TRIP1/organizerToken', 'x'.repeat(20), 'trip token');
        DENY(who, '/trips/TRIP1/tripName', 'pwned', 'name');
        DENY(who, '/trips/TRIP1', null, 'delete');
        DENY(who, '/trips/TRIP1/ownerUid', who ? who.uid : 'x', 'take it');
    }
    ALLOW(TRIPOWN, '/trips/TRIP1/tripName', 'Myrtle 2026', 'the owner');
    ALLOW(TRIPOWN, '/trips/TRIP1/rounds/NEWRD', { name: 'Day 2', createdAt: NOW }, 'the owner adds a round');
    ALLOW(TRIPOWN, '/trips/NEWTRIP', { ownerUid: 'tripown', ownerEmail: 'trip@owner.test', tripName: 'New' }, 'create with your own uid');
    DENY(TRIPOWN, '/trips/NEWTRIP2', { ownerUid: 'someone', ownerEmail: 'trip@owner.test', tripName: 'New' }, 'create naming another uid');
    ALLOW(GOLFER, '/trips/TRIP1/identity/TRIPRD/101', 'golfer', 'a golfer says who they are (anonymous ok)');
    ALLOW(email('g2', 'g2@x.test'), '/trips/TRIP1/league/x', { pts: 3 }, 'the league');
    DENY(OUT, '/trips/TRIP1/identity/TRIPRD/101', 'x', 'signed out');
});
test('C2 legacy trips (no ownerUid yet): the ownerEmail\'s until migrated, and it can stamp itself', () => {
    ALLOW(OLDTRIP, '/trips/OLDT/tripName', 'Old trip 2', 'the email that made it');
    ALLOW(OLDTRIP, '/trips/OLDT/ownerUid', 'oldtrip', 'it claims its own trip (the migration, or the app on sign-in)');
    DENY(TRIPOWN, '/trips/OLDT/tripName', 'x', 'another email');
    DENY(TRIPOWN, '/trips/OLDT/ownerUid', 'tripown', 'another email claims it');
});

// ---- C3 global_courses -------------------------------------------------------------------
test('C3: course cards are create-only from phones; gapi_* / gca_* are the server\'s', () => {
    const cheat = card.map((h) => Object.assign({}, h, { par: 3 }));
    for (const who of [OUT, STRANGER, OWN]) {
        DENY(who, '/global_courses/pebble_beach', { name: 'Pebble Beach', data: cheat }, 'rewrite par');
        DENY(who, '/global_courses/pebble_beach/data/0/par', 3, 'one cell');
        DENY(who, '/global_courses/pebble_beach', null, 'delete');
        DENY(who, '/global_courses/gapi_123/data/0/hcpIndex', 18, 'a server card');
        DENY(who, '/global_courses/gapi_999', { name: 'Fake', data: card }, 'a new gapi_ card');
        DENY(who, '/global_courses/gca_789', { name: 'Fake', data: card, source: { providerCourseId: 789 } }, 'a new gca_ card');
    }
    ALLOW(GOLFER, '/global_courses/joes_muni', { name: 'Joe\'s Muni', data: card }, 'a new course card');
    ALLOW(GOLFER, '/global_courses/joes_muni2', { name: 'Joe\'s Muni 2', data: card, location: { latitude: 33.1, longitude: -79.2, city: 'Town' }, tees: { male: [{ name: 'Blue' }] } }, 'with place and tees');
    DENY(OUT, '/global_courses/joes_muni', { name: 'Joe\'s Muni', data: card }, 'signed out');
    DENY(GOLFER, '/global_courses/joes_muni3', { name: 'X', data: card, junk: 'a'.repeat(5000) }, '$other');
    DENY(GOLFER, '/global_courses/joes_muni4', { name: 'X', data: card, location: { latitude: 133 } }, 'latitude out of range');
    DENY(GOLFER, '/global_courses/joes_muni5', { name: 'X', data: card, location: { evil: 1 } }, 'location $other');
    DENY(GOLFER, '/global_courses/joes_muni6', { name: 'X', data: card, tees: { robot: [{ name: 'x' }] } }, 'tees other than male / female');
    assert.strictEqual(canRead(OUT, '/global_courses/pebble_beach'), true, 'the directory stays public to read');
});

// ---- H4 tournaments ----------------------------------------------------------------------
test('H4: a keyed tournament takes a team\'s scores only from a phone holding that team\'s key', () => {
    ALLOW(S1, '/tournaments/TKEY/scores/team1_h2', 4, 'team 1\'s scorer');
    ALLOW(S1, '/tournaments/TKEY/scores/team1_p0_h2', 4, 'team 1\'s scorer, a golfer box');
    DENY(S1, '/tournaments/TKEY/scores/team2_h2', 4, 'team 1\'s scorer on team 2');
    DENY(S1, '/tournaments/TKEY/scores/team12_h2', 4, 'team 1\'s scorer on team 12 (prefix trick)');
    DENY(STRANGER, '/tournaments/TKEY/scores/team1_h2', 4, 'no claim');
    DENY(OUT, '/tournaments/TKEY/scores/team1_h2', 4, 'signed out');
    ALLOW(SG, '/tournaments/TKEY/scores/pabc123_h2', 4, 'a group scorer, a golfer\'s score');
    DENY(SG, '/tournaments/TKEY/scores/team1_h2', 4, 'a group scorer on a team');
    ALLOW(TORG, '/tournaments/TKEY/scores/team2_h3', 4, 'the organizer corrects any score');
    DENY(S1, '/tournaments/TKEY/scores/team1_h2', 31, 'shape still holds');
});
test('H4: a scorer\'s claim must carry the organizer\'s key; keys are the organizer\'s alone', () => {
    ALLOW(STRANGER, '/tournamentScorers/TKEY/stranger', { slot: 'team2', key: 'k-team2-bbbbbbbb' }, 'the key from the link');
    DENY(STRANGER, '/tournamentScorers/TKEY/stranger', { slot: 'team2', key: 'guess-guess' }, 'a guessed key');
    DENY(STRANGER, '/tournamentScorers/TKEY/stranger', { slot: 'team3', key: 'k-team2-bbbbbbbb' }, 'a key for another slot');
    DENY(STRANGER, '/tournamentScorers/TKEY/s1', { slot: 'team2', key: 'k-team2-bbbbbbbb' }, 'a claim for another uid');
    DENY(STRANGER, '/tournamentScorers/TKEY/stranger', { slot: '../team2', key: 'k-team2-bbbbbbbb' }, 'a path in the slot');
    DENY(OUT, '/tournamentScorers/TKEY/x', { slot: 'team2', key: 'k-team2-bbbbbbbb' }, 'signed out');
    assert.strictEqual(canRead(STRANGER, '/tournamentKeys/TKEY'), false, 'nobody reads the keys');
    assert.strictEqual(canRead(STRANGER, '/tournamentScorers/TKEY'), false, 'nor the claims');
    assert.strictEqual(canRead(TORG, '/tournamentKeys/TKEY'), true, 'the organizer does');
    DENY(STRANGER, '/tournamentKeys/TKEY/team1', 'k-mine-12345678', 'write a key');
    ALLOW(TORG, '/tournamentKeys/TKEY/team3', 'k-team3-eeeeeeee', 'the organizer mints one');
    DENY(TORG, '/tournamentKeys/TKEY/team3', 'short', 'a key under 8');
});
test('H4: an event made before keys keeps its texted links working (signed in); multi-round scores', () => {
    ALLOW(STRANGER, '/tournaments/TOLD/scores/team1_h2', 4, 'an old link, signed in');
    DENY(OUT, '/tournaments/TOLD/scores/team1_h2', 4, 'but signed in');
    ALLOW(S1, '/tournaments/TMULTI/rounds/r1/scores/team1_h2', 4, 'a multi-round team scorer');
    DENY(STRANGER, '/tournaments/TMULTI/rounds/r1/scores/team1_h2', 4, 'no claim');
    DENY(S1, '/tournaments/TMULTI/rounds/r9/scores/team1_h2', 4, 'a round that does not exist');
    ALLOW(TORG, '/tournaments/TMULTI/rounds/r2', { id: 'r2', name: 'Day 2', status: 'setup', createdAt: NOW, format: 'individual', scoringGroups: {}, scores: {} }, 'the organizer adds a round, in the app\'s shape');
    DENY(STRANGER, '/tournaments/TMULTI/rounds/r1/status', 'closed', 'a stranger closes a round');
    DENY(STRANGER, '/tournaments/TKEY/name', 'pwned', 'structure is the organizer\'s');
    ALLOW(TORG, '/tournaments/TNEW', { ownerUid: 'torg', name: 'New', lockedLinks: true, teams: {} }, 'the organizer creates one');
});

// ---- M1 organizers -----------------------------------------------------------------------
test('M1: an organizer cannot delete their record or reset firstSeenAt; groups still work', () => {
    DENY(OWN, '/organizers/own', null, 'delete the node');
    DENY(OWN, '/organizers/own/firstSeenAt', NOW, 'reset firstSeenAt');
    DENY(OWN, '/organizers/own/firstSeenAt', null, 'delete firstSeenAt');
    DENY(OWN, '/organizers/own', { firstSeenAt: NOW }, 'replace the node');
    ALLOW(anon('fresh'), '/organizers/fresh/firstSeenAt', NOW - 1000, 'the first stamp');
    ALLOW(OWN, '/organizers/own/groups/g1', null, 'account-exit\'s fallback: delete the groups');
    ALLOW(OWN, '/organizers/own/groups/g2', { name: 'Tuesday', members: { m1: { name: 'Ben' } } }, 'a group');
    DENY(STRANGER, '/organizers/own/groups/g2', { name: 'x', members: {} }, 'someone else\'s groups');
});

// ---- the normal flows, end to end --------------------------------------------------------
test('FLOW organizer setup: create, Round Setup save (one update), keys, tokens - all signed in as the owner', () => {
    ALLOW(OWN, '/events/FLOW1', round({ ownerUid: 'own' }), 'create');
    const d = JSON.parse(JSON.stringify(DATA)); d.events.FLOW1 = round({ ownerUid: 'own' });
    const as = (who) => targaryen.database(RULES, d).as(who);
    assert.strictEqual(as(OWN).update('/events/FLOW1', { nassauStake: 10, skinsBuyIn: 5, settlementMode: 'net', groupStartingHoles: { 1: 1 }, players, courseData, scoreKeys: { 1: 'h' } }, NOW).allowed, true, 'admin saveSettings update');
    assert.strictEqual(as(OWN).update('/events/FLOW1', { birdieUnitVal: 2, birdieScoringType: 'net' }, NOW).allowed, true, 'skins.html birdie config');
    assert.strictEqual(as(OWN).write('/events/FLOW1/kpCancelled', { cancelled: true, originalCents: 500 }, NOW).allowed, true, 'KP cancel');
    assert.strictEqual(as(GOLFER).update('/events/FLOW1', { nassauStake: 10 }, NOW).allowed, false, 'a golfer cannot');
});
test('FLOW spectator read: a round, the course directory and a tournament stay readable by code', () => {
    assert.strictEqual(canRead(OUT, '/events/ROUND1'), true);
    assert.strictEqual(canRead(OUT, '/tournaments/TKEY'), true);
    assert.strictEqual(canRead(STRANGER, '/events/ROUND1/scores'), true);
});
test('FLOW offline replay: the queue\'s writes land later, signed in, one by one and as a batch', () => {
    // The phone was offline; its durable queue replays set() calls and a multi-path update.
    const as = (who) => db().as(who);
    assert.strictEqual(as(GOLFER).update('/', { 'events/ROUND1/scores/p101_h3': 4, 'events/ROUND1/scores/p102_h3': 5, 'events/ROUND1/scoresVerified/p101': null }, NOW).allowed, true, 'scores + clear verified');
    assert.strictEqual(as(GOLFER).update('/', { 'events/ROUND1/scores/p101_h3': 4, 'events/ROUND1/nassauStake': 99 }, NOW).allowed, false, 'a batch smuggling a stake is refused whole');
    assert.strictEqual(as(GOLFER).write('/events/ROUND1/gpsPins/h5', pin(33.4, -79.1), NOW).allowed, true, 'a queued first green');
    assert.strictEqual(as(OUT).write('/events/ROUND1/scores/p101_h3', 4, NOW).allowed, false, 'replayed before sign-in finishes: refused (the queue keeps it and retries)');
    assert.strictEqual(as(S1).write('/tournaments/TKEY/scores/team1_h5', 4, NOW).allowed, true, 'a tournament score replayed');
});
