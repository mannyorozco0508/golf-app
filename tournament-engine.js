// ============================================================================
// GolfApp — Shared Tournament Engine
// Used by tournament.html (organizer setup/leaderboard) and
// tournament-scorecard.html (each team's own scoring/leaderboard view), so
// both pages always compute totals and standings identically. Loaded via
// <script src="tournament-engine.js"> — plain functions, no DOM references.
//
// DEPENDS ON payouts.js for allocatePlacePayouts(). Both tournament pages load
// it; the mobile bundle and the service worker ship it.
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
    const teams = data.teams || {};
    const inScope = teamsInFlight(teams, flightId);

    let rows = inScope.map(tid => {
        const t = teams[tid];
        const { strokes, thru, parPlayed } = computeTeamTotals(data, t);
        const handicap = (t.handicap !== undefined && t.handicap !== null) ? t.handicap : 0;
        const net = thru > 0 ? strokes - handicap : 0;
        const toPar = thru > 0 ? net - parPlayed : null;
        return { num: t.num, teamName: t.name || `Team ${t.num}`, strokes, thru, toPar, hasScores: thru > 0 };
    });

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
