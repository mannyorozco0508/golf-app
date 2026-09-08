// ============================================================================
// FIXTURES THAT MATCH WHAT THE APP WOULD ACTUALLY WRITE.
//
// Wave 7 compared every fixture in tools/ against the payload saveTournament
// really produces, and found three shapes no code path can make:
//
//   1. Player ids like p1 / pAce. Real ids are minted, seventeen-ish characters.
//      Nothing parses an id today, so the short ones were safe - but they were
//      safe by luck, and no test had ever run a real id through a score key.
//   2. A round with status 'open' and NO handicaps. setRoundStatus writes the
//      status and the snapshot in ONE update, so that state cannot exist. Every
//      multi-round result this project has reported was measured on it, which
//      means roundView's snapshot branch has never once executed.
//   3. A round with no shambleCountBest. createRound writes it; every fixture
//      omitted it, and computeTeamHoleScore reads `|| 1` - so a Best-2 shamble
//      silently scored as Best 1 and no fixture could have caught it.
//
// THE MINTER IS NOT COPIED HERE. mintId lives in tournament.html; its source is
// read out of that file and evaluated, so a change to the real minter changes
// these ids too. A reimplementation would be a second id scheme that agrees
// with the first until the day it does not.
//
// Everything else below MIRRORS A NAMED WRITER, and says which. When one of
// those writers changes, this file is wrong and should be updated with it.
// ============================================================================

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

// --- the real minter, taken from the page rather than reimplemented ---------
function loadRealMinter() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
    const start = src.indexOf('function mintId(');
    if (start === -1) {
        throw new Error('tournament.html no longer defines mintId - fixtures cannot '
            + 'mint ids the way the app does, and must not guess');
    }
    const end = src.indexOf('\n    }', start);
    const body = src.slice(start, end + 6);
    // idSeq is the page's module-level counter; it is declared here so the
    // extracted function closes over one the same way.
    const make = new Function('let idSeq = 0; ' + body + '; return mintId;');
    return make();
}

const mintId = loadRealMinter();
const newPlayerId = () => mintId('p');
const newGroupId = () => mintId('g');
const newRoundId = () => mintId('r');
const newFlightId = () => mintId('f');

// --- records, each mirroring the writer named in its comment ----------------

// MIRRORS saveTournament's pendingPlayers (tournament.html): the setup screen
// stores every golfer at handicap '0' with an addedAt. A handicap other than
// '0' models a later edit through updatePlayerHandicap, which is reachable.
function playerRecord(name, handicap, addedAt) {
    return {
        id: null,               // filled by field() below, from the real minter
        name: name,
        handicap: handicap === undefined ? '0' : String(handicap),
        addedAt: addedAt,
    };
}

// A field of golfers keyed by real minted ids. Returns the map and a
// name -> id index, because assertions are written against names.
function playerField(spec) {
    const players = {}, byName = {};
    spec.forEach((p, i) => {
        const pid = newPlayerId();
        players[pid] = Object.assign(playerRecord(p.name, p.handicap, i + 1), { id: pid });
        if (p.flightId) players[pid].flightId = p.flightId;
        byName[p.name] = pid;
    });
    return { players, byName, ids: Object.keys(players) };
}

// MIRRORS createScoringGroup + assignPlayerToGroup.
function scoringGroup(name, playerIds, createdAt, startingHole) {
    const g = { id: newGroupId(), name: name, playerIds: playerIds.slice(),
                createdAt: createdAt === undefined ? 1 : createdAt };
    if (startingHole !== undefined) g.startingHole = startingHole;
    return g;
}

// MIRRORS createRound's payload, field for field, INCLUDING shambleCountBest -
// the field every previous fixture omitted.
function roundRecord(opts) {
    const o = opts || {};
    return {
        id: o.id || newRoundId(),
        name: o.name || 'Round 1',
        status: 'setup',
        createdAt: o.createdAt === undefined ? 1 : o.createdAt,
        format: o.format || 'individual',
        scoringMode: o.scoringMode || 'gross',
        shambleCountBest: o.shambleCountBest === undefined ? 1 : o.shambleCountBest,
        courseName: o.courseName || '',
        activeCourseKey: o.activeCourseKey || '',
        courseData: o.courseData || [],
        courseIndexSynthetic: !!o.courseIndexSynthetic,
        scoringGroups: o.scoringGroups || {},
        scores: o.scores || {},
    };
}

// MIRRORS setRoundStatus(rid, 'open'). THE SNAPSHOT AND THE STATUS ARE ONE
// UPDATE - that is the whole point of this function existing. A round cannot be
// open without one, and pretending otherwise is what hid the overlay branch.
//
// The snapshot is taken from the players passed in, exactly as the writer takes
// it from currentData.players: absent, null or empty handicap becomes '0'.
function openRound(round, players) {
    const snap = {};
    Object.keys(players || {}).forEach(pid => {
        const h = players[pid].handicap;
        snap[pid] = (h === undefined || h === null || h === '') ? '0' : h;
    });
    return Object.assign({}, round, { status: 'open', handicaps: snap });
}

// MIRRORS setRoundStatus(rid, 'closed'), which adds closedAt and nothing else.
function closeRound(round, closedAt) {
    return Object.assign({}, round, { status: 'closed',
        closedAt: closedAt === undefined ? 2 : closedAt });
}

// MIRRORS saveTournament's payload. The individual branch adds scoringModel,
// scoringMode, players and an empty scoringGroups; the team branch does not.
// NEITHER writes `scores`, `flights`, `startType`, `tripCode`, `eventModel` or
// `rounds` - a fresh record simply has no such keys, and every consumer reads
// them with an absent-default. Fixtures here follow that.
function eventRecord(opts) {
    const o = opts || {};
    const rec = {
        name: o.name || 'Golf Tournament',
        format: o.format || 'scramble',
        courseIndexSynthetic: !!o.courseIndexSynthetic,
        courseName: o.courseName || '',
        activeCourseKey: o.activeCourseKey || '',
        courseData: o.courseData || [],
        entryFee: o.entryFee === undefined ? 0 : o.entryFee,
        shambleCountBest: o.shambleCountBest === undefined ? 1 : o.shambleCountBest,
        teams: o.teams || {},
        createdAt: o.createdAt === undefined ? 1 : o.createdAt,
    };
    if (o.format === 'individual') {
        rec.scoringModel = 'player-v1';
        rec.scoringMode = o.scoringMode || 'gross';
        rec.players = o.players || {};
        rec.scoringGroups = o.scoringGroups || {};
    }
    // Only present when the caller is deliberately modelling a state some later
    // control produces - scores after a hole is entered, flights after
    // createFlight, and so on.
    ['scores', 'flights', 'rounds', 'eventModel', 'startType', 'tripCode']
        .forEach(k => { if (o[k] !== undefined) rec[k] = o[k]; });
    return rec;
}

module.exports = {
    mintId, newPlayerId, newGroupId, newRoundId, newFlightId,
    playerField, scoringGroup, roundRecord, openRound, closeRound, eventRecord,
    REPO_ROOT,
};
