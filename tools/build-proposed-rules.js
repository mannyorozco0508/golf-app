#!/usr/bin/env node
// ============================================================================
// THE LOCKED-DOWN DATABASE RULES, BUILT FROM WHAT IS LIVE (mailbox 003, 2026-10-17)
//
//   node tools/build-proposed-rules.js     -> rules/database.rules.proposed.json
//
// PREP ONLY - NOTHING IS DEPLOYED FROM HERE. The base is the LIVE ruleset read on 2026-10-17
// (rules/live-2026-10-17.json; the repo's database.rules.json is NOT what is live and must never
// be deployed as it stands). Every change below names the audit item it answers; anything not
// named is copied from live unchanged. rules_lockdown_test.js holds the result to every audit
// probe (DENY) and every normal flow (ALLOW).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const live = JSON.parse(fs.readFileSync(path.join(HERE, 'rules', 'live-2026-10-17.json'), 'utf8'));
const R = JSON.parse(JSON.stringify(live.rules));

// ---- EVENTS (audit C1, C4, M2, M4) ------------------------------------------------------
const E = R.events.$eventCode;
const OWNER = "data.child('ownerUid').val() === auth.uid";
const TRIP_OWNER = "(data.child('tripCode').isString() && root.child('trips/' + data.child('tripCode').val() + '/ownerUid').val() === auth.uid)";
// Every write needs auth. Create: the creator stamps their own uid (the 21-day organizer wall is
// GONE - games are free, Manny 2026-10-17). An existing round with an owner: the owner (or the
// owner of the trip it belongs to) writes setup and deletes. A legacy round (no ownerUid, before
// 2026-08-24): signed-in users may still update it, never delete it. A delete therefore needs the
// owner, which also closes delete + recreate (nobody else can empty the code to claim it).
E['.write'] = "auth != null && ("
    + "(!data.exists() && newData.exists() && newData.child('ownerUid').val() === auth.uid)"
    + " || (data.exists() && (" + OWNER + " || " + TRIP_OWNER + "))"
    + " || (data.exists() && !data.hasChild('ownerUid') && newData.exists())"
    + ")";
// The round's shape (M2): players and courseData must be what the app writes; never a string.
E.players = { '.validate': 'newData.hasChildren()', $i: {
    '.validate': "newData.hasChildren(['id', 'name']) && newData.child('id').isNumber() && newData.child('name').isString() && newData.child('name').val().length >= 1 && newData.child('name').val().length <= 60" } };
E.courseData = { '.validate': 'newData.hasChildren()', $i: {
    '.validate': "newData.hasChildren(['hole', 'par']) && newData.child('hole').isNumber() && newData.child('hole').val() >= 1 && newData.child('hole').val() <= 18 && newData.child('par').isNumber() && newData.child('par').val() >= 3 && newData.child('par').val() <= 6" } };
// A NEW token is a real one (the app mints 32 hex); a save that carries the round's existing
// token unchanged is never refused for it (older rounds may hold shorter ones).
E.organizerToken = { '.validate': 'newData.val() === data.val() || (newData.isString() && newData.val().length >= 16 && newData.val().length <= 64)' };
// The game play children: any SIGNED-IN golfer on the round (scorekeepers, players). Each was
// "while the round exists" with no auth; now auth is required too (C1).
const PLAY = ['scores', 'scoresVerified', 'kpLeaders', 'kpWinners', 'kpConfirmed', 'kpGroupAnswers', 'challenges', 'sideMatches',
    'matchPresses', 'strokePresses', 'dots', 'auditLog', 'wolfCalls', 'ryderCup', 'ryderCupRef', 'ryderFoursomes', 'additionalGameInstances', 'pointsGame'];
const PLAY_WRITE = "auth != null && root.child('events/' + $eventCode).exists()";
PLAY.forEach((k) => { E[k] = Object.assign({}, E[k] || {}, { '.write': PLAY_WRITE }); });
// GPS greens on the round (C4): the FIRST green of a hole by any signed-in golfer; changing one
// that is there is the owner's.
const PIN_OK = "$hole.matches(/^h([1-9]|1[0-9]|2[0-7])$/) && newData.child('mid/lat').isNumber() && newData.child('mid/lat').val() >= -90 && newData.child('mid/lat').val() <= 90 && newData.child('mid/lng').isNumber() && newData.child('mid/lng').val() >= -180 && newData.child('mid/lng').val() <= 180 && newData.child('at').isNumber() && newData.child('at').val() <= now + 600000";
// The round's write is no longer open to code holders, so this .write is the whole story (the
// draft had the owner check in a .validate, which a delete skips).
E.gpsPins = { $hole: {
    '.write': "auth != null && root.child('events/' + $eventCode).exists() && (!data.exists() || root.child('events/' + $eventCode + '/ownerUid').val() === auth.uid)",
    '.validate': "newData.hasChildren(['mid', 'at']) && " + PIN_OK } };

// ---- TRIPS (audit C2) -------------------------------------------------------------------
const T = R.trips.$tripCode;
// The owner only (like seasons). A trip made before ownerUid (legacy) is the ownerEmail's until it
// is migrated (rules/migrations: its ownerUid is written from its organizer). No delete.
// OWNER BY UID, ANY SIGN-IN (Manny 2026-10-17): the app stamps the creator's uid (anonymous too) on a
// new trip, and the owner is whoever holds that uid - an email is not needed to prove it.
T['.write'] = "auth != null && ("
    + "(!data.exists() && newData.exists() && newData.child('ownerUid').val() === auth.uid)"
    + " || (data.exists() && newData.exists() && (data.child('ownerUid').val() === auth.uid || (!data.hasChild('ownerUid') && data.child('ownerEmail').val() === auth.token.email)))"
    + ")";
// LIVE requires ownerEmail on every trip, and no trip has one: live refuses EVERY trip write today
// (create, rename, the builder, a golfer's who-am-I) - measured with targaryen (mailbox 005). A trip
// is valid with its owner (ownerUid, stamped by the migration) or, legacy, an ownerEmail.
T['.validate'] = "newData.hasChildren(['ownerUid']) || newData.hasChildren(['ownerEmail'])";
// LIVE lets only an EMAIL sign-in READ a trip, so a trip link never opens for a golfer's anonymous
// phone (batch1_safety_test, mailbox 005). Any signed-in phone reads it, as a round is read by code.
T['.read'] = 'auth != null';
T.ownerUid = { '.validate': "(!data.exists() && auth != null && newData.val() === auth.uid) || (data.exists() && newData.val() === data.val())" };
// What the trip's GOLFERS write - who-am-I and the points league - stays theirs (signed in).
T.identity = Object.assign({}, T.identity, { '.write': "auth != null && root.child('trips/' + $tripCode).exists()" });
T.league = { '.write': "auth != null && auth.token.email != null && root.child('trips/' + $tripCode).exists()" };

// ---- SEASONS (mailbox 005, Manny: the same as trips) --------------------------------------
// LIVE lets only an EMAIL sign-in READ a season, so a season link never opens on a golfer's
// anonymous phone. Any signed-in phone reads it. (Writes are unchanged from live.)
R.seasons.$seasonCode['.read'] = 'auth != null';

// ---- GLOBAL COURSES (audit C3) ------------------------------------------------------------
const GC = R.global_courses.$courseId;
// Users CREATE a course card; nobody rewrites one from a phone. gapi_* / gca_* are the server's
// (the GolfAPI pull / the import service with the Admin SDK, which the rules do not bind).
GC['.write'] = "auth != null && !data.exists() && newData.exists() && !$courseId.beginsWith('gapi_') && !$courseId.beginsWith('gca_')";
GC.tees = { '.validate': 'newData.hasChildren()', $gender: { '.validate': "$gender === 'male' || $gender === 'female'" } };
GC.location = { '.validate': 'newData.hasChildren()',
    latitude: { '.validate': 'newData.isNumber() && newData.val() >= -90 && newData.val() <= 90' },
    longitude: { '.validate': 'newData.isNumber() && newData.val() >= -180 && newData.val() <= 180' },
    city: { '.validate': 'newData.isString() && newData.val().length <= 80' }, state: { '.validate': 'newData.isString() && newData.val().length <= 40' },
    country: { '.validate': 'newData.isString() && newData.val().length <= 60' }, address: { '.validate': 'newData.isString() && newData.val().length <= 200' },
    $other: { '.validate': false } };
GC.name = { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 120' };
['source', 'createdAt', 'updatedAt', 'createdBy'].forEach((k) => { GC[k] = GC[k] || {}; });
GC.$other = { '.validate': false };

// ---- TOURNAMENTS (audit H4) ---------------------------------------------------------------
const TO = R.tournaments.$tourneyCode;
const T_OWNER = "root.child('tournaments/' + $tourneyCode + '/ownerUid').val() === auth.uid";
const SCORER = "root.child('tournamentScorers/' + $tourneyCode + '/' + auth.uid)";
const SLOT = SCORER + ".child('slot').val()";
const KEYED = "root.child('tournamentKeys/' + $tourneyCode).exists()";
// A score needs a signed-in phone, and then: the organizer; or, on an event with scoring keys
// (created with lockedLinks), a scorer whose claim holds a valid key - a TEAM key writes only that
// team's keys (teamN_...), a GROUP key writes golfer keys (p..._hN); or, on an event made before
// keys (no tournamentKeys), any signed-in phone, so the links already texted out keep working.
const SCORE_WRITE = "auth != null && (" + T_OWNER
    + " || !" + KEYED
    + " || (" + SCORER + ".exists() && ("
    + "(" + SLOT + ".beginsWith('team') && $scoreKey.beginsWith(" + SLOT + " + '_'))"
    + " || (" + SLOT + ".beginsWith('group') && !$scoreKey.beginsWith('team'))"
    + ")))";
TO.scores = { $scoreKey: Object.assign({}, TO.scores.$scoreKey, { '.write': SCORE_WRITE }) };
// rounds/<rid>: LIVE has a different shape here (eventCode / label / status, $other refused) that
// no branch wrote and the app's multi-round events do not match - live refuses the app's round
// record and its scores today (reported). The proposal takes the APP's shape: the round record
// is the organizer's, its scores follow the score rule above.
TO.rounds = { $roundId: {
    '.write': "auth != null && " + T_OWNER,
    '.validate': 'newData.hasChildren()',
    scores: { $scoreKey: { '.write': "root.child('tournaments/' + $tourneyCode + '/rounds/' + $roundId).exists() && " + SCORE_WRITE,
        '.validate': TO.scores.$scoreKey['.validate'] } } } };
// The team / group keys: the organizer's alone (not readable by players - the tournament node is
// public, so the keys live OUTSIDE it).
R.tournamentKeys = { $tourneyCode: { '.read': "auth != null && " + T_OWNER, '.write': "auth != null && " + T_OWNER,
    $slot: { '.validate': "$slot.matches(/^(team[0-9]{1,3}|group[A-Za-z0-9_-]{1,24})$/) && newData.isString() && newData.val().length >= 8 && newData.val().length <= 40" } } };
// A scorer's claim: their own uid, a slot and the slot's key, which must match the organizer's.
// Not readable by anyone but the organizer (the key is in it).
R.tournamentScorers = { $tourneyCode: { '.read': "auth != null && " + T_OWNER, $uid: {
    '.write': "auth != null && auth.uid === $uid",
    '.validate': "newData.hasChildren(['slot', 'key']) && newData.child('slot').isString() && newData.child('slot').val().matches(/^(team[0-9]{1,3}|group[A-Za-z0-9_-]{1,24})$/) && newData.child('key').isString() && newData.child('key').val() === root.child('tournamentKeys/' + $tourneyCode + '/' + newData.child('slot').val()).val()" } } };

// ---- ORGANIZERS (audit M1) ----------------------------------------------------------------
const O = R.organizers.$uid;
// No deleting your own record (that reset firstSeenAt). account-exit.js already falls back to
// deleting the groups when this is refused (its 'soft' first step).
delete O['.write'];

// ---- THE 21-DAY WALL IS GONE (Manny 2026-10-17: games are free) - see events .write above. --

// ---- COURSE GPS (audit C4: the draft's holes closed) --------------------------------------
// course_gps/<key>: the shared greens (Manny 2026-10-07: any golfer on a round fills an EMPTY
// green; only that round's organizer changes one). The draft's holes, closed:
//   - an EMPTY activeCourseKey made beginsWith('') true for every course: the round's key must be
//     non-empty and the course key EXACTLY it, or - for a 27-hole key (..._27) only - it plus
//     '_<nines>' (the pairing), so 'caledonia' cannot write 'caledonia_national';
//   - the owner check sat in a .validate, which a delete skips: it is in the .write, and no deletes;
//   - the write-once OSM cache took any shape from any phone and could never be fixed: osm and
//     holeChoice are the server's now (the app's writes there are best effort; a refusal is fine).
const EV = "root.child('events/' + newData.child('ev').val())";
const AKEY = EV + ".child('activeCourseKey')";
R.course_gps = { $courseKey: {
    '.read': 'auth != null',
    pins: { $hole: {
        '.write': "auth != null && newData.exists() && newData.child('ev').isString() && " + EV + ".child('players').exists()"
            + " && " + AKEY + ".isString() && " + AKEY + ".val().length > 0"
            + " && ($courseKey === " + AKEY + ".val() || (" + AKEY + ".val().matches(/_27$/) && $courseKey.beginsWith(" + AKEY + ".val() + '_')))"
            + " && (!data.exists() || " + EV + ".child('ownerUid').val() === auth.uid)",
        '.validate': "newData.hasChildren(['mid', 'at', 'ev']) && " + PIN_OK } },
    osm: { '.write': false }, holeChoice: { '.write': false }, $other: { '.write': false } } };
// gps_meta/config: the founding-price switch the GPS Map paywall reads (foundingOpen, foundingCap;
// mailbox 007, Manny's OK 2026-10-18). Readable by any signed-in phone; written only by the server /
// the console (no .write). The rest of gps_meta (counters, alerts, raw pulls) stays unreadable.
R.gps_meta = { config: { '.read': 'auth != null' } };
// gps_courses / gps_links / gps_usage stay as live (read signed-in, written only by the server).

fs.writeFileSync(path.join(HERE, 'rules', 'database.rules.proposed.json'), JSON.stringify({ rules: R }, null, 2) + '\n');
console.log('rules/database.rules.proposed.json written (phase 2: everything)');

// ---- PHASE 1 (mailbox 005, Manny 2026-10-17): close the holes NOW, without breaking the apps and
// pages people use today - live 1.0.8, TestFlight build 15 (gps-features 504f2aa) and the web.
// Everything above, EXCEPT what today's clients cannot do yet:
//   - tournament scores: today's web scorecard (tournament-scorecard.html on main) does not sign in,
//     so a score keeps live's rule (the event exists, or the round exists) and the scoring keys /
//     claims wait for phase 2 with the page that writes them;
//   - so tournamentKeys / tournamentScorers are not in phase 1.
// The tournament ROUND record is fixed in phase 1 (the app's shape; live refuses it today).
const P1 = JSON.parse(JSON.stringify(R));
const TO1 = P1.tournaments.$tourneyCode;
TO1.scores = JSON.parse(JSON.stringify(live.rules.tournaments.$tourneyCode.scores));
TO1.rounds.$roundId.scores.$scoreKey['.write'] = "root.child('tournaments/' + $tourneyCode + '/rounds/' + $roundId).exists()";
delete P1.tournamentKeys;
delete P1.tournamentScorers;
fs.writeFileSync(path.join(HERE, 'rules', 'database.rules.phase1.json'), JSON.stringify({ rules: P1 }, null, 2) + '\n');
console.log('rules/database.rules.phase1.json written (phase 1: safe for today\'s clients)');

// ---- PHASE 2 ONLY: added after the phase-1 file is written --------------------------------
// QUICK STATS (mailbox 008): events/<code>/stats/p<id>_h<n> = { putts, fw, gir }, written by any
// signed-in golfer on the round, like scores. Until phase 2 ships, the app keeps stats on the phone.
R.events.$eventCode.stats = { '.write': PLAY_WRITE, $k: { '.validate': "$k.matches(/^p[0-9]+_h([1-9]|1[0-8])$/) && newData.hasChildren() && (!newData.hasChild('putts') || (newData.child('putts').isNumber() && newData.child('putts').val() >= 0 && newData.child('putts').val() <= 9))" } };
fs.writeFileSync(path.join(HERE, 'rules', 'database.rules.proposed.json'), JSON.stringify({ rules: R }, null, 2) + '\n');
console.log('rules/database.rules.proposed.json rewritten with the phase-2-only additions (stats)');
