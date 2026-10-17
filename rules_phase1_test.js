// ============================================================================
// PHASE 1 OF THE LOCKDOWN, AGAINST TODAY'S CLIENTS (mailbox 005, 2026-10-17) - NOT PUBLISHED
//
// rules/database.rules.phase1.json must close the audit's holes WITHOUT breaking the apps and pages
// people use today: the live app 1.0.8 (main 387cf89), TestFlight build 15 (gps-features 504f2aa)
// and the web. Every write below is one those clients make, in the shape they make it (read from
// their code); each is run against LIVE (the control) and PHASE 1. A flow that works on live must
// work on phase 1, except the three Manny accepted (005): a second-device organizer link without the
// owner's sign-in (003-3), phones editing a shared course card or importing gca_ (003-2), and an
// organizer deleting their own record (M1). Trips are frozen on live today (no trip has the
// ownerEmail live requires) - phase 1 opens them to their owner after the migration.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');
const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'live-2026-10-17.json'), 'utf8'));
const P1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'database.rules.phase1.json'), 'utf8'));
const MIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'migrations', 'trips-ownerUid-2026-10-17.json'), 'utf8'));
const NOW = Date.now();
const anon = (uid) => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const email = (uid, e) => ({ uid, provider: 'password', token: { email: e, email_verified: true, firebase: { sign_in_provider: 'password' } } });
const MANNY = email('h8AxnefqnuZNKv6XwvFFIKRMHSS2', 'manny@example.test');
const OWN = anon('own'), GOLFER = anon('golfer'), OUT = null, TORG = email('torg', 't@x.test');
const players = [{ id: 101, name: 'Ann Able', hcp: '8', team: 'Team 1', squad: 'red', playingForMoney: true }, { id: 102, name: 'Ben Bravo', hcp: '12', team: 'Team 1', squad: 'red', playingForMoney: true }];
const courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const card = courseData;
const round = (x) => Object.assign({ eventName: 'Single Round', players, courseData, courseName: 'Caledonia', activeCourseKey: 'caledonia', gameFormat: 'nassau', nassauStake: 5,
    skinsBuyIn: 5, organizerToken: 'tok-0123456789abcdef0123', scoreKeys: { 1: 'h' } }, x || {});
const pin = (ev) => Object.assign({ mid: { lat: 33.45, lng: -79.15 }, at: NOW - 1000, by: 'tap' }, ev ? { ev } : {});

function data(migrated) {
    const d = {
        events: { R1: round({ ownerUid: 'own', scores: { p101_h1: 4 } }), LEG: round({}), TR1: round({ ownerUid: MANNY.uid, tripCode: 'T9WL' }) },
        trips: { T9WL: { name: 'Myrtle', createdAt: 1, organizerToken: 'x'.repeat(32), rounds: { TR1: { label: 'Day 1', addedAt: 1 } } } },
        global_courses: { pebble: { name: 'Pebble', data: card }, gca_1: { name: 'Imp', data: card, source: { providerCourseId: 1 } } },
        organizers: { newbie: { firstSeenAt: NOW - 1000 }, own: { firstSeenAt: NOW - 40 * 86400000, groups: { g1: { name: 'Sunday', members: { m1: { name: 'Ann' } } } } } },
        tournaments: {
            TONE: { ownerUid: 'torg', name: 'Scramble', teams: { team1: { num: 1, name: 'A' } }, scores: {} },
            TMULTI: { ownerUid: 'torg', name: 'Two days', eventModel: 'rounds', rounds: { r1: { id: 'r1', name: 'Day 1', status: 'open', createdAt: 1, scoringGroups: {}, scores: {} } } } },
        pushTokens: {},
    };
    if (migrated) d.trips.T9WL.ownerUid = MANNY.uid;
    return d;
}
const W = (rules, d, who, p, v) => targaryen.database(rules, d).as(who).write(p, v, NOW).allowed;
const U = (rules, d, who, p, v) => targaryen.database(rules, d).as(who).update(p, v, NOW).allowed;
// Both: works today on LIVE, still works on PHASE 1.
function KEEPS(what, f) { assert.strictEqual(f(LIVE, data(false)), true, 'control - live allows: ' + what); assert.strictEqual(f(P1, data(true)), true, 'phase 1 must still allow: ' + what); }

test('ROUNDS (index / admin / skins / sidematches / settlement, 1.0.8 and build 15): every flow still works', () => {
    KEEPS('create a round (signed in, ownerUid stamped; live also needs the trial window - newbie is inside it)', (r, d) => W(r, d, anon('newbie'), '/events/NEW1', round({ ownerUid: 'newbie' })));
    KEEPS('Round Setup saveSettings - one update by the owner', (r, d) => U(r, d, OWN, '/events/R1', { nassauStake: 10, skinsBuyIn: 5, players, courseData, settlementMode: 'whole-dollar' }));
    KEEPS('skins.html birdie config by the owner', (r, d) => U(r, d, OWN, '/events/R1', { birdieUnitVal: 2, birdieScoringType: 'net' }));
    KEEPS('a scorekeeper scores', (r, d) => W(r, d, GOLFER, '/events/R1/scores/p101_h2', 5));
    KEEPS('a scorekeeper clears a score', (r, d) => W(r, d, GOLFER, '/events/R1/scores/p101_h1', null));
    for (const k of ['kpWinners/h3', 'kpConfirmed/h3', 'sideMatches/m1', 'matchPresses/x', 'dots/h1', 'auditLog/a1', 'scoresVerified/p101', 'wolfCalls/h1', 'additionalGameInstances/x', 'kpGroupAnswers/g1'])
        KEEPS('a golfer writes ' + k, (r, d) => W(r, d, GOLFER, '/events/R1/' + k, { v: 1 }));
    KEEPS('the offline queue replays a batch', (r, d) => U(r, d, GOLFER, '/', { 'events/R1/scores/p101_h3': 4, 'events/R1/scores/p102_h3': 5, 'events/R1/scoresVerified/p101': null }));
    KEEPS('a legacy round (no owner) takes setup from a signed-in phone', (r, d) => W(r, d, GOLFER, '/events/LEG/nassauStake', 5));
    KEEPS('the owner deletes their round', (r, d) => W(r, d, OWN, '/events/R1', null));
    KEEPS('GPS (build 15): the first green on a hole, the round copy', (r, d) => W(r, d, GOLFER, '/events/R1/gpsPins/h3', pin()));
    assert.strictEqual(targaryen.database(P1, data(true)).as(OUT).read('/events/R1', NOW).allowed, true, 'spectators read by code');
});
test('ROUNDS: the holes are closed (C1, M2, M4 write) - and the accepted 003-3 case', () => {
    const d = data(true);
    for (const who of [OUT, GOLFER]) {
        assert.strictEqual(W(P1, d, who, '/events/R1/players', 'pwned'), false);
        assert.strictEqual(W(P1, d, who, '/events/R1/nassauStake', 500), false);
        assert.strictEqual(W(P1, d, who, '/events/R1/organizerToken', 'mallory-0123456789'), false);
        assert.strictEqual(W(P1, d, who, '/events/R1', null), false);
    }
    assert.strictEqual(W(P1, d, OUT, '/events/R1/scores/p101_h2', 5), false, 'signed out: nothing');
    assert.strictEqual(W(LIVE, data(false), OUT, '/events/R1/nassauStake', 500), true, 'control: live let a signed-out code holder change the stake');
    assert.strictEqual(W(P1, d, anon('second-phone'), '/events/R1/nassauStake', 10), false, '003-3 (accepted): the organizer link alone on a second phone, not signed in as the owner');
});
test('TRIPS: frozen on live today; after the migration the owner edits again, golfers write who-am-I', () => {
    assert.strictEqual(W(LIVE, data(false), MANNY, '/trips/T9WL/name', 'Myrtle 2026'), false, 'control: live refuses even the owner (no ownerEmail on any trip)');
    assert.strictEqual(W(P1, data(true), MANNY, '/trips/T9WL/name', 'Myrtle 2026'), true, 'phase 1 + migration: the owner renames');
    assert.strictEqual(W(P1, data(true), MANNY, '/trips/T9WL/rounds/TR2', { label: 'Day 2', addedAt: 2 }), true, 'adds a round');
    assert.strictEqual(U(P1, data(true), MANNY, '/', { 'events/TR1/players': players, 'events/TR1/moneyPool': { enabled: true, buyIn: 10 } }), true, 'trip roster / pots on its rounds');
    assert.strictEqual(W(P1, data(true), GOLFER, '/trips/T9WL/identity/TR1/101', 'golfer'), true, 'a golfer says who they are');
    assert.strictEqual(W(P1, data(true), anon('x'), '/trips/T9WL/name', 'pwned'), false, 'nobody else');
    assert.strictEqual(W(P1, data(false), MANNY, '/trips/T9WL/name', 'x'), false, 'before the migration it stays frozen (as live)');
    assert.ok(MIG['trips/TF93GJ/ownerUid'] === MANNY.uid && Object.keys(MIG).length === 6 && !MIG['trips/Z28Y/ownerUid'], 'the migration: Manny on TF93GJ / 3SKVBL / 9WLQ63 / FYYQ95, two organizers, the 15 owner-less trips left alone (Manny 2026-10-17)');
});
test('TOURNAMENTS: today\'s web scorecard (no sign-in) still scores; the round record is fixed', () => {
    KEEPS('a team score from the web scorecard, signed out', (r, d) => W(r, d, OUT, '/tournaments/TONE/scores/team1_h2', 4));
    assert.strictEqual(W(LIVE, data(false), OUT, '/tournaments/TMULTI/rounds/r1/scores/p1abc_h2', 4), false, 'control: live refuses a multi-round score today');
    assert.strictEqual(W(P1, data(true), OUT, '/tournaments/TMULTI/rounds/r1/scores/p1abc_h2', 4), true, 'phase 1: a multi-round score lands (the page writes it, signed out)');
    assert.strictEqual(W(LIVE, data(false), TORG, '/tournaments/TMULTI/rounds/r2', { id: 'r2', name: 'Day 2', status: 'setup', createdAt: 2, scoringGroups: {}, scores: {} }), false, 'control: live refuses the app\'s round record');
    assert.strictEqual(W(P1, data(true), TORG, '/tournaments/TMULTI/rounds/r2', { id: 'r2', name: 'Day 2', status: 'setup', createdAt: 2, scoringGroups: {}, scores: {} }), true, 'phase 1: the organizer adds a round');
    assert.strictEqual(W(P1, data(true), anon('x'), '/tournaments/TMULTI/rounds/r1/status', 'closed'), false, 'a stranger does not touch a round record');
    assert.ok(!P1.rules.tournamentKeys && !P1.rules.tournamentScorers, 'scoring keys wait for phase 2');
});
test('COURSES, ORGANIZERS, GPS, PUSH: today\'s flows; the accepted 003-2 / M1 cases', () => {
    KEEPS('a new course card', (r, d) => W(r, d, OWN, '/global_courses/joes_muni', { name: 'Joe\'s Muni', data: card }));
    assert.strictEqual(W(P1, data(true), OWN, '/global_courses/pebble/data/0/par', 3), false, '003-2 (accepted): no edits to a shared card');
    assert.strictEqual(W(P1, data(true), OWN, '/global_courses/gca_2', { name: 'X', data: card, source: { providerCourseId: 2 } }), false, '003-2: gca_ imports are the server\'s');
    KEEPS('the organizer stamp (first time)', (r, d) => W(r, d, anon('fresh'), '/organizers/fresh/firstSeenAt', NOW - 1000));
    KEEPS('a saved group', (r, d) => W(r, d, OWN, '/organizers/own/groups/g2', { name: 'Tue', members: { m1: { name: 'Ben' } } }));
    KEEPS('account exit\'s fallback: delete the groups', (r, d) => W(r, d, OWN, '/organizers/own/groups', null));
    assert.strictEqual(W(P1, data(true), OWN, '/organizers/own', null), false, 'M1 (accepted): no deleting your own record');
    assert.strictEqual(W(P1, data(true), GOLFER, '/course_gps/caledonia/pins/h3', pin('R1')), true, 'build 15: the shared green, round at this course');
    assert.strictEqual(W(P1, data(true), GOLFER, '/course_gps/caledonia/osm', { v: 1 }), false, 'build 15\'s OSM cache write is refused - best effort, the app ignores it');
    KEEPS('a push token for yourself', (r, d) => W(r, d, OWN, '/pushTokens/own/t1', { token: 'abc', playerId: '101', at: NOW - 1000 }));
});
test('NO 21-DAY WALL in phase 1', () => {
    assert.ok(!/1814400000/.test(JSON.stringify(P1.rules.events)));
    assert.strictEqual(W(P1, data(true), OWN, '/events/NEW9', round({ ownerUid: 'own' })), true, '40 days on, no pass');
});
test('TRIPS: a golfer\'s anonymous phone opens the trip link (live: email sign-in only)', () => {
    assert.strictEqual(targaryen.database(LIVE, data(false)).as(GOLFER).read('/trips/T9WL', NOW).allowed, false, 'control: live refuses an anonymous golfer');
    assert.strictEqual(targaryen.database(P1, data(true)).as(GOLFER).read('/trips/T9WL', NOW).allowed, true, 'phase 1: any signed-in phone');
    assert.strictEqual(targaryen.database(P1, data(true)).as(OUT).read('/trips/T9WL', NOW).allowed, false, 'signed out: no');
});

test('SEASONS: a golfer\'s anonymous phone opens the season link (live: email sign-in only)', () => {
    const d = data(true); d.seasons = { S1: { ownerEmail: 'o@x.test', name: 'Tuesdays' } };
    const dl = data(false); dl.seasons = d.seasons;
    assert.strictEqual(targaryen.database(LIVE, dl).as(GOLFER).read('/seasons/S1', NOW).allowed, false, 'control: live refuses an anonymous golfer');
    assert.strictEqual(targaryen.database(P1, d).as(GOLFER).read('/seasons/S1', NOW).allowed, true, 'phase 1: any signed-in phone');
    assert.strictEqual(targaryen.database(P1, d).as(OUT).read('/seasons/S1', NOW).allowed, false, 'signed out: no');
    assert.strictEqual(JSON.stringify(P1.rules.seasons.$seasonCode['.write']), JSON.stringify(LIVE.rules.seasons.$seasonCode['.write']), 'season writes are live\'s, unchanged');
});
test('TRIPS: an anonymous organizer creates a trip stamped with its own uid, and edits it (Manny 2026-10-17)', () => {
    const d = data(true); const ORG = anon('triporg');
    assert.strictEqual(W(P1, d, ORG, '/trips/NEWT', { name: 'Weekend', createdAt: NOW, rounds: {}, organizerToken: 'x'.repeat(32), ownerUid: 'triporg' }), true, 'createTripBlank with ownerUid');
    assert.strictEqual(U(P1, d, ORG, '/', { 'trips/NEWB/name': 'Built', 'trips/NEWB/createdAt': NOW, 'trips/NEWB/organizerToken': 'x'.repeat(32), 'trips/NEWB/ownerUid': 'triporg',
        'trips/NEWB/rounds/RB1': { label: 'Day 1', addedAt: NOW }, 'events/RB1': round({ ownerUid: 'triporg', tripCode: 'NEWB' }) }), true, 'the builder\'s one multi-path update');
    const d2 = data(true); d2.trips.MINE = { name: 'Mine', createdAt: 1, ownerUid: 'triporg', rounds: {} };
    assert.strictEqual(W(P1, d2, ORG, '/trips/MINE/name', 'Renamed'), true, 'the anonymous owner renames');
    assert.strictEqual(W(P1, d, ORG, '/trips/NEWX', { name: 'X', createdAt: NOW, rounds: {}, ownerUid: 'someone-else' }), false, 'naming another uid');
    assert.strictEqual(W(P1, d, ORG, '/trips/NEWY', { name: 'Y', createdAt: NOW, rounds: {} }), false, 'no ownerUid: refused (the app before this fix)');
    assert.strictEqual(W(P1, d2, anon('other'), '/trips/MINE/name', 'pwned'), false, 'not the owner');
});
