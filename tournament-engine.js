// ============================================================================
// GolfApp — Shared Tournament Engine
// Used by tournament.html (organizer setup/leaderboard) and
// tournament-scorecard.html (each team's own scoring/leaderboard view), so
// both pages always compute totals and standings identically. Loaded via
// <script src="tournament-engine.js"> — plain functions, no DOM references.
//
// DEPENDS ON payouts.js for allocatePlacePayouts() and handicap.js for
// parseHcp()/getStrokes(). Both tournament pages load them; the mobile bundle and
// the service worker ship them.
//
// TWO STORAGE MODELS, ONE COMPETITION.
//
// Tournaments created before individual play stored a field of TEAMS, with player
// identity being a position in an array and scores keyed team{n}_h{h} or
// team{n}_p{i}_h{h}. Those records still exist, are still being scored, and are
// never rewritten.
//
// Individual events store a field of PLAYERS with opaque ids, and score keys that
// carry the id. A player can change team, group, flight or spelling and their
// scores stay attached to them.
//
// The two are reconciled in exactly one place - normalizeLeaderboardEntries() -
// which turns either shape into the same row. Everything downstream of that point
// (filtering by flight, sorting, competition ranking, payouts) is one
// implementation. The duplication is confined to reading storage, which is the
// part that genuinely differs; nothing about deciding who won is written twice.
// ============================================================================

// Works out a team's score for one hole from whichever players have posted a score so far.
// Scramble doesn't use this — it's a single shared score already, computed inline.
function computeTeamHoleScore(format, playerScores, shambleCountBest) {
    if (playerScores.length === 0) return null;
    if (format === 'bestball') {
        return Math.min(...playerScores);
    }
    if (format === 'shamble') {
        const n = shambleCountBest || 1;
        const sorted = playerScores.slice().sort((a, b) => a - b);
        const take = sorted.slice(0, Math.min(n, sorted.length));
        return take.reduce((s, v) => s + v, 0);
    }
    return null;
}

// Totals one team's round: gross strokes, holes completed, and par played through those holes.
function computeTeamTotals(data, team) {
    const format = data.format || 'scramble';
    const courseData = data.courseData || [];
    const scores = data.scores || {};
    const shambleCountBest = data.shambleCountBest || 1;

    let strokes = 0, thru = 0, parPlayed = 0;

    courseData.forEach(h => {
        if (format === 'scramble') {
            const v = scores[`team${team.num}_h${h.hole}`];
            if (v && v > 0) { strokes += parseInt(v, 10); thru++; parPlayed += h.par; }
        } else {
            const holeScores = [];
            team.players.forEach((p, pIdx) => {
                const v = scores[`team${team.num}_p${pIdx}_h${h.hole}`];
                if (v && v > 0) holeScores.push(parseInt(v, 10));
            });
            const teamHoleScore = computeTeamHoleScore(format, holeScores, shambleCountBest);
            if (teamHoleScore !== null) { strokes += teamHoleScore; thru++; parPlayed += h.par; }
        }
    });

    return { strokes, thru, parPlayed };
}

// Builds the full leaderboard: totals every team, applies each team's OWN handicap (not one
// flat number for the whole field — that made the handicap a no-op for standings), sorts
// teams with scores ahead of teams that haven't started, and assigns competition-style ranks
// (1, 1, 3...) so genuine ties are labeled instead of silently split apart.
// WHICH STORAGE MODEL A RECORD USES — decided by an explicit marker, never guessed.
//
// The tempting shortcut is "does it have a players node", and it is wrong: a
// legacy tournament could plausibly grow one later and the meaning of every score
// already stored would flip underneath it. An absent marker means legacy, forever.
function isPlayerModel(data) {
    return !!data && data.scoringModel === PLAYER_MODEL;
}

var PLAYER_MODEL = 'player-v1';

// CAN THIS COURSE ALLOCATE STROKES HONESTLY?
//
// Net individual play needs a real stroke index per hole. When an organizer picks a
// course the app has never mapped, resolveTournamentCourseData() fabricates
// hcpIndex 1..18 in hole order so the round can still be played gross - a straight
// allocation that looks completely valid and is not. Ranking net money on an
// invented index is worse than refusing, so a synthetic course is refused: the
// event runs Gross until somebody supplies the real card.
//
// courseIndexSynthetic is written by the organizer page when it uses the fallback.
// The structural check below is the second line of defence, for records saved
// before that flag existed or hand-edited since.
function hasUsableStrokeIndex(data) {
    if (!data || data.courseIndexSynthetic === true) return false;
    const holes = data.courseData || [];
    if (holes.length === 0) return false;
    // Bounded by 18, not by the number of holes played. getStrokes() allocates over a
    // standard eighteen, and a nine-hole card legitimately carries indexes drawn from
    // that range - checking against holes.length rejected a real course whose front
    // nine happened to hold SI 12.
    const seen = {};
    for (let i = 0; i < holes.length; i++) {
        const si = holes[i].hcpIndex;
        if (typeof si !== 'number' || !isFinite(si)) return false;
        if (si !== Math.floor(si) || si < 1 || si > 18) return false;
        if (seen[si]) return false;   // a duplicated index is not an allocation
        seen[si] = true;
    }
    return true;
}

// Strokes a player receives on one hole, from the SHARED handicap module. This is
// competition stroke play, not wagering: getStrokes() by course stroke index, with
// no relative-to-opponent adjustment anywhere. allocateMatchStrokes() and
// relativeMatchStrokes() belong to Consumer match play and are deliberately unused.
function playerStrokesOnHole(player, hole) {
    return getStrokes(hole.hcpIndex, parseHcp(player.handicap));
}

// ---------------------------------------------------------------------------
// NORMALIZATION — the only place the two storage models are told apart
// ---------------------------------------------------------------------------

// One row per team, read from the legacy shape. Byte-for-behaviour the rows this
// engine has always produced.
function normalizeTeamEntries(data) {
    const teams = data.teams || {};
    return Object.keys(teams).map(tid => {
        const t = teams[tid];
        const totals = computeTeamTotals(data, t);
        const handicap = (t.handicap !== undefined && t.handicap !== null) ? t.handicap : 0;
        const net = totals.thru > 0 ? totals.strokes - handicap : 0;
        return {
            entryType: 'team', entryKey: tid, num: t.num,
            teamName: t.name || `Team ${t.num}`,
            strokes: totals.strokes, thru: totals.thru, parPlayed: totals.parPlayed,
            toPar: totals.thru > 0 ? net - totals.parPlayed : null,
            hasScores: totals.thru > 0,
            flightId: t.flightId || null,
        };
    });
}

// One row per player, read from the player-keyed shape.
//
// NET IS DERIVED, NEVER STORED. Only the gross score is written by the scoring
// surface; strokes are computed here from the player's handicap and the hole's
// index, so correcting a handicap re-ranks the field without touching a score. Net
// counts strokes only on holes actually played, so a partial round is compared on
// the same basis as a completed one.
function normalizePlayerEntries(data) {
    const players = data.players || {};
    const scores = data.scores || {};
    const holes = data.courseData || [];
    const useNet = data.scoringMode === 'net' && hasUsableStrokeIndex(data);
    let idx = 0;

    return Object.keys(players).map(pid => {
        const p = players[pid];
        let strokes = 0, thru = 0, parPlayed = 0, received = 0;
        holes.forEach(h => {
            const v = scores[`${pid}_h${h.hole}`];
            if (v && v > 0) {
                strokes += parseInt(v, 10);
                thru++;
                parPlayed += h.par;
                if (useNet) received += playerStrokesOnHole(p, h);
            }
        });
        idx++;
        const net = strokes - received;   // received is 0 in gross mode
        return {
            entryType: 'player', entryKey: pid, num: idx,
            teamName: p.name || 'Player',
            playerId: pid, playerName: p.name || 'Player',
            strokes: strokes, thru: thru, parPlayed: parPlayed,
            strokesReceived: received, net: thru > 0 ? net : null,
            toPar: thru > 0 ? net - parPlayed : null,
            hasScores: thru > 0,
            flightId: p.flightId || null,
        };
    });
}

// The one fork. Everything after this call is model-agnostic.
function normalizeLeaderboardEntries(data) {
    return isPlayerModel(data) ? normalizePlayerEntries(data) : normalizeTeamEntries(data);
}

// FLIGHTS FILTER THE FIELD; THEY DO NOT RANK IT DIFFERENTLY.
//
// A flight is a subset of the same teams, standing in the same competition, judged
// by the same rule - so there is exactly one ranking implementation and the flight
// view reaches it by narrowing the input, never by copying the sort. A second
// ranking path would be a second definition of "tied", and the whole point of a
// flight is that the B flight is scored the same way the Championship flight is.
//
// flightId omitted or null means OVERALL, which is every team including those with
// no flight at all. That default is what keeps historical tournaments - which have
// no flights node and no flightId on any team - behaving exactly as before.
function teamsInFlight(teams, flightId) {
    const ids = Object.keys(teams);
    if (!flightId) return ids;
    return ids.filter(tid => (teams[tid] || {}).flightId === flightId);
}

// Teams that belong to no flight the tournament actually has.
//
// A team with no flightId is obviously unassigned. So is a team pointing at a
// flight that no longer exists - and that case matters, because without it such a
// team appears in NO count at all and disappears from the organizer's view of the
// field. The dropdown already falls back to Unassigned for a dangling id; this
// makes the counts agree with it rather than quietly losing a team.
function unassignedTeamIds(teams, flights) {
    const all = teams || {};
    const known = flights || {};
    return Object.keys(all).filter(tid => {
        const fid = (all[tid] || {}).flightId;
        return !fid || !known[fid];
    });
}

// How many teams sit in each flight, plus the unassigned count. Derived, never
// stored - a cached count is a count that goes stale the first time a team moves.
function flightTeamCounts(data) {
    const teams = data.teams || {};
    const flights = data.flights || {};
    const counts = {};
    Object.keys(flights).forEach(fid => { counts[fid] = 0; });
    Object.keys(teams).forEach(tid => {
        const fid = teams[tid].flightId;
        // A team pointing at a deleted flight is counted as unassigned below rather
        // than resurrecting the missing flight as a phantom row.
        if (fid && counts[fid] !== undefined) counts[fid]++;
    });
    counts.__unassigned = unassignedTeamIds(teams, flights).length;
    return counts;
}

// data      the tournament record
// flightId  optional. Omitted or null ranks the whole field, which is what every
//           existing caller does and what every historical record produces.
function computeTournamentLeaderboard(data, flightId) {
    // Storage is read once, here. The sort and the rank pass below never learn which
    // model produced these rows, which is what stops a second definition of "tied"
    // from appearing the moment a second storage shape does.
    let rows = normalizeLeaderboardEntries(data)
        .filter(r => !flightId || r.flightId === flightId);

    rows.sort((a, b) => {
        if (a.hasScores && !b.hasScores) return -1;
        if (!a.hasScores && b.hasScores) return 1;
        if (!a.hasScores && !b.hasScores) return a.num - b.num;
        return a.toPar - b.toPar;
    });

    // Competition ranking (1, 1, 3, 4...) — only among teams that actually have scores;
    // teams that haven't started yet don't get a numeric rank at all.
    let rank = 0;
    rows.forEach((r, idx) => {
        if (!r.hasScores) { r.rank = null; return; }
        if (idx > 0 && rows[idx - 1].hasScores && r.toPar === rows[idx - 1].toPar) {
            r.rank = rows[idx - 1].rank;
        } else {
            r.rank = idx + 1;
        }
    });

    return rows;
}

// Mirrors Trip Mode's prize-payout math exactly: maps final standings onto paid spots, and a
// tie that straddles the paid/unpaid line only splits whatever money actually falls within
// the paid range.
function computeTournamentPayouts(rows, spotAmounts) {
    // The place/tie rule lives in payouts.js, shared with Trip Mode's prize table.
    // It was duplicated here and there until the shared-core extraction; the
    // comment on this function used to say it "mirrors Trip Mode's prize-payout
    // math exactly", which described a duplicate rather than replacing one.
    //
    // Teams with no scores are excluded first - they have no rank - and the
    // team-shaped return is rebuilt here so every existing caller is untouched.
    const scoredRows = rows.filter(r => r.hasScores);
    return allocatePlacePayouts(scoredRows, spotAmounts)
        .map(p => ({ teamName: p.entry.teamName, rank: p.rank, amount: p.amount }));
}

function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
