// ============================================================================
// RYDER CUP — TEAM COMPETITION LAYER (Phase 1)
//
// POINTS ONLY. THIS FILE CONTAINS NO MONEY.
//
// There is no stake, no ledger line, no payout, and no dollar figure anywhere in
// this file, and there is no code path from here into computeCombinedNetTotals(),
// the settlement allocator, Who Pays Who, or Player Payouts. The isolation is
// STRUCTURAL, not a display filter: a Ryder Cup result is a number of POINTS that
// no money surface ever reads, because no money surface imports this file.
//
// The one call this file makes into the money engine is calculateMatchEngine(),
// and it is called with stake 0 and holeBet 0 - see ryderFourBallState(). It is
// called for its HOLE ARITHMETIC ONLY. Its money outputs (t1TotalMoney, p1Money,
// activeMatches[].stake) are never read here. Passing a stake would not corrupt
// settlement either, since settlement never sees this call - but zero is passed
// so the intent is unmistakable to the next reader.
//
// WHY REUSE calculateMatchEngine AT ALL. Four-Ball match play is exactly what
// that engine already does: group by side, take the better score per side, award
// the hole, close the match out early when the lead exceeds the holes left. That
// math is protected and battle-tested. Re-implementing it here would create a
// second Match Play implementation that could disagree with the first about who
// won a hole, which is the one outcome worth avoiding. This file is an ADAPTER
// around the protected engine, not a replacement for it.
//
// LEGACY `ryder` IS UNTOUCHED. The old field-wide Four-Ball money format keeps its
// value, its arrays, its stake and its settlement semantics. Historical rounds
// re-settle byte for byte. This is a NEW competition type, `ryder-cup`, that lives
// beside it. Nothing in this file is reachable from a legacy `ryder` round.
// ============================================================================

// Bumping this is how a later phase can migrate a stored competition without
// guessing at which shape it is looking at.
var RYDER_CUP_SCHEMA_VERSION = 1;

var RYDER_POINTS_WIN = 1;
var RYDER_POINTS_HALVE = 0.5;
var RYDER_POINTS_LOSS = 0;

// ---------------------------------------------------------------------------
// SCHEMA (stored at data.ryderCup)
//
//   {
//     v: 1,
//     sides:   { A: { id:'A', name:'Team USA',   color:'red'  },
//                B: { id:'B', name:'Team Europe',color:'blue' } },
//     members: { '101':'A', '102':'A', '103':'B', '104':'B' },
//     matches: { m1: { id:'m1', sessionId:'s1', format:'fourball',
//                      scoring:'net', sideA:'A', sideB:'B',
//                      playersA:['101','102'], playersB:['103','104'] } }
//   }
//
// PHASE 2 ADDITIONS. A match may also carry:
//     format: 'singles'        one golfer per side
//     lockedAt: <ms>           set when the first score is posted
//     lockedA / lockedB        the roster snapshot taken at that moment
//
// FORWARD COMPATIBILITY, deliberately shallow. `sides` is a keyed map with a
// `name`, so "Team 1 / Team 2" is never baked in - Phase 1 simply defaults the
// names. Every match already carries a `sessionId`, so Day 1 Foursomes / Day 2
// Four-Ball / Day 3 Singles becomes a `sessions` map added ALONGSIDE these
// matches, not a migration that moves them. Every match already carries a
// `format`, so 'foursomes' and 'singles' slot in beside 'fourball' without
// reshaping anything.
//
// SOURCE OF TRUTH: the stored config plus the round's scores. Points are DERIVED
// on read, never stored. A stored point total would be a second copy of the truth
// that could drift from the scorecard it came from - the same class of bug as the
// Player Payouts receipt disagreeing with the engine it read from.
//
// The deliberate consequence: this config must never be edited in a way that
// reinterprets a completed match. Changing a membership after play would silently
// rewrite history. Phase 2 owns locking; Phase 1 records the hazard here.
// ---------------------------------------------------------------------------

function ryderCupConfig(data) {
    var d = data || {};
    var rc = d.ryderCup;
    if (!rc || typeof rc !== 'object') return null;
    var sides = rc.sides || {};
    var sideIds = Object.keys(sides);
    if (sideIds.length < 2) return null;
    return {
        v: rc.v || RYDER_CUP_SCHEMA_VERSION,
        // The competition's own name rides along with the config. Omitting it here
        // made ryderCupName() fall back to "Ryder Cup" for every Cup ever named.
        name: rc.name,
        sides: sides,
        members: rc.members || {},
        matches: rc.matches || {}
    };
}

// A round can carry a Ryder Cup competition regardless of its gameFormat. That is
// the whole point: `ryder-cup` is a LAYER, not a format. A Stroke Play round with
// Skins and three side matches can also be Session 2 of the Cup.
function hasRyderCup(data) {
    return ryderCupConfig(data) !== null;
}

function ryderSideOfPlayer(data, playerId) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return null;
    var side = cfg.members[String(playerId)];
    return side && cfg.sides[side] ? side : null;
}

function ryderSideName(data, sideId) {
    var cfg = ryderCupConfig(data);
    if (!cfg || !cfg.sides[sideId]) return String(sideId);
    return cfg.sides[sideId].name || String(sideId);
}

// ---------------------------------------------------------------------------
// THE ROSTER A MATCH IS ACTUALLY PLAYED BY
//
// Once a match locks, its roster is frozen into lockedA/lockedB and every later
// read uses that snapshot instead of the live config. This is the difference
// between a lock that merely greys out a button and one that cannot be defeated:
// even if the stored pairing is edited afterwards - by a stale client, a bad
// merge, or a hand edit in the Firebase console - the decided match still
// resolves under the roster that actually played it.
//
// The snapshot is CONFIGURATION, not a derived result. Points are still computed
// from scores every time. What is frozen is who was in the match, which is the
// one input a golfer could never reconstruct after the fact.
// ---------------------------------------------------------------------------
function ryderMatchRoster(match) {
    if (!match) return { a: [], b: [] };
    if (match.lockedAt && match.lockedA && match.lockedB) {
        return { a: match.lockedA.map(String), b: match.lockedB.map(String) };
    }
    return {
        a: (match.playersA || []).map(String),
        b: (match.playersB || []).map(String)
    };
}

// A match is live the moment ANY participant posts ANY score inside its holes.
// Deliberately first-score, not first-decision: "once this match starts, the
// pairing is locked" is a rule a golfer can hold in their head, and it closes the
// window where a roster edit could rewrite holes already played.
function ryderMatchHasScores(courseData, savedScores, match) {
    var roster = ryderMatchRoster(match);
    var ids = roster.a.concat(roster.b);
    return (courseData || []).some(function (h) {
        return ids.some(function (id) {
            return savedScores['p' + id + '_h' + h.hole] > 0;
        });
    });
}

function ryderMatchLockState(data, courseData, savedScores, match) {
    var started = ryderMatchHasScores(courseData, savedScores, match);
    return {
        locked: !!(match && match.lockedAt) || started,
        snapshotted: !!(match && match.lockedAt),
        reason: (match && match.lockedAt) ? 'locked-at-first-score'
            : (started ? 'scores-posted' : null)
    };
}

// Takes the snapshot. Idempotent - a match already carrying lockedAt is left
// exactly as it is, so calling this on every render cannot rewrite history.
function lockRyderMatch(match, whenMs) {
    if (!match || match.lockedAt) return false;
    match.lockedAt = whenMs || Date.now();
    match.lockedA = (match.playersA || []).map(String);
    match.lockedB = (match.playersB || []).map(String);
    return true;
}

// THE MUTATION GATE. A pairing change is REJECTED, not merely hidden. Callers get
// a reason they can show; nothing is written when ok is false.
function applyRyderPairingChange(data, courseData, savedScores, matchId, next) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return { ok: false, error: 'no-competition' };
    var match = cfg.matches[matchId];
    if (!match) return { ok: false, error: 'no-such-match' };

    var lock = ryderMatchLockState(data, courseData, savedScores, match);
    if (lock.locked) {
        return { ok: false, error: 'match-locked', reason: lock.reason };
    }

    var candidate = Object.assign({}, data, {
        ryderCup: Object.assign({}, cfg, {
            matches: Object.assign({}, cfg.matches, {
                matchIdPlaceholder: null
            })
        })
    });
    candidate.ryderCup.matches = Object.assign({}, cfg.matches);
    delete candidate.ryderCup.matches.matchIdPlaceholder;
    candidate.ryderCup.matches[matchId] = Object.assign({}, match, {
        playersA: (next.playersA || []).map(String),
        playersB: (next.playersB || []).map(String)
    });

    var problems = validateRyderCup(candidate);
    if (problems.length > 0) return { ok: false, error: 'invalid', problems: problems };

    match.playersA = (next.playersA || []).map(String);
    match.playersB = (next.playersB || []).map(String);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// VALIDATION
//
// EXCLUSIVITY IS SESSION-SCOPED, NOT COMPETITION-GLOBAL. A golfer plays one Ryder
// match per session and several across a trip - Day 1 AM, Day 1 PM, Day 2 AM.
// Scoping this globally would work for Phase 2 and then have to be torn out the
// moment sessions arrive, so it is scoped correctly now while it costs nothing.
//
// THIS SAYS NOTHING ABOUT SIDE MATCHES. A golfer may appear in any number of
// normal Rattle wagers simultaneously; that is a different layer with different
// rules and this function must never be pointed at it.
// ---------------------------------------------------------------------------
var RYDER_ROSTER_SIZE = { fourball: 2, singles: 1 };

function validateRyderCup(data) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return [];
    var problems = [];
    var seenBySession = {};

    Object.keys(cfg.matches).forEach(function (mid) {
        var m = cfg.matches[mid];
        var session = m.sessionId || 's1';
        var roster = ryderMatchRoster(m);
        var want = RYDER_ROSTER_SIZE[m.format || 'fourball'];

        if (want && (roster.a.length !== want || roster.b.length !== want)) {
            problems.push({
                type: 'roster-size', matchId: mid, format: m.format || 'fourball',
                message: (m.format || 'fourball') + ' needs ' + want + ' per side, got '
                    + roster.a.length + ' v ' + roster.b.length
            });
        }

        if (!seenBySession[session]) seenBySession[session] = {};
        roster.a.concat(roster.b).forEach(function (id) {
            if (seenBySession[session][id]) {
                problems.push({
                    type: 'double-booked', matchId: mid, playerId: id, session: session,
                    message: 'golfer ' + id + ' is already in match '
                        + seenBySession[session][id] + ' this session'
                });
            } else {
                seenBySession[session][id] = mid;
            }
        });

        roster.a.forEach(function (id) {
            if (cfg.members[id] && cfg.members[id] !== m.sideA) {
                problems.push({ type: 'wrong-side', matchId: mid, playerId: id,
                    message: 'golfer ' + id + ' plays for ' + cfg.members[id]
                        + ' but is on side ' + m.sideA });
            }
        });
        roster.b.forEach(function (id) {
            if (cfg.members[id] && cfg.members[id] !== m.sideB) {
                problems.push({ type: 'wrong-side', matchId: mid, playerId: id,
                    message: 'golfer ' + id + ' plays for ' + cfg.members[id]
                        + ' but is on side ' + m.sideB });
            }
        });
    });

    return problems;
}

// ---------------------------------------------------------------------------
// FOUR-BALL AND SINGLES RESOLUTION
//
// Builds a virtual two-team roster and hands it to the protected engine. The
// virtual/'Team 1'/'Team 2' shape is the same adapter buildSideMatchReceipts()
// already uses (settlement-engine.js) - deliberately, so a Ryder Four-Ball and a
// 2v2 side match over the same four golfers can never disagree about a hole.
// ---------------------------------------------------------------------------
function ryderFourBallState(data, courseData, savedScores, match) {
    if (typeof calculateMatchEngine !== 'function') return null;
    var cfg = ryderCupConfig(data);
    if (!cfg || !match) return null;

    var byId = {};
    (data.players || []).forEach(function (p) { byId[String(p.id)] = p; });

    var roster = ryderMatchRoster(match);
    var idsA = roster.a;
    var idsB = roster.b;
    var teamA = idsA.map(function (id) { return byId[id]; }).filter(Boolean);
    var teamB = idsB.map(function (id) { return byId[id]; }).filter(Boolean);
    if (teamA.length === 0 || teamB.length === 0) return null;

    var virtual = teamA.map(function (p) { return Object.assign({}, p, { team: 'Team 1' }); })
        .concat(teamB.map(function (p) { return Object.assign({}, p, { team: 'Team 2' }); }));

    // 'bestball' is the engine's name for better-ball-of-side hole resolution,
    // which IS Four-Ball. Not the legacy 'ryder' value - that carries a stake and
    // a whole contract this layer must stay clear of.
    //
    // SINGLES NEEDS NO SEPARATE ENGINE. calculateMatchEngine derives
    // isSinglesMatch from ROSTER SIZE - t1Players.length === 1 && t2Players.length
    // === 1 - not from a format string, so one golfer per side already receives
    // the correct singles handicap baseline through this identical call. Adding a
    // second scoring path for singles would create exactly the duplicate the brief
    // forbids, and better-ball of one golfer is that golfer's score.
    //
    // pressRule 'none': a Ryder Cup match is worth one point. Presses are a money
    // device and have no meaning in a competition that pays no money.
    //
    // stake 0, holeBet 0: no money is requested and none is read back.
    var calc = calculateMatchEngine(
        virtual, courseData, savedScores,
        match.scoring || 'net',
        'bestball',
        'none',
        0,   // stake
        0,   // holeBet
        []   // no presses
    );
    if (!calc) return null;

    var base = (calc.activeMatches || []).filter(function (m) {
        return !m.pressNum && m.baseId !== 'F9' && m.baseId !== 'B9';
    })[0] || (calc.activeMatches || [])[0];
    if (!base) return null;

    var holes = (courseData || []).filter(function (h) {
        return h.hole >= base.startHole && h.hole <= base.endHole;
    });
    var thru = 0;
    holes.forEach(function (h) {
        var anyA = idsA.some(function (id) { return savedScores['p' + id + '_h' + h.hole] > 0; });
        var anyB = idsB.some(function (id) { return savedScores['p' + id + '_h' + h.hole] > 0; });
        if (anyA && anyB) thru++;
    });

    return {
        matchId: match.id,
        sessionId: match.sessionId || 's1',
        format: match.format || 'fourball',
        sideA: match.sideA, sideB: match.sideB,
        nameA: ryderSideName(data, match.sideA),
        nameB: ryderSideName(data, match.sideB),
        playersA: teamA.map(function (p) { return p.name; }),
        playersB: teamB.map(function (p) { return p.name; }),
        status: base.status,
        closed: !!base.closed,
        thru: thru,
        totalHoles: holes.length,
        // Decided means the point is final: either closed out early (3&2) or all
        // holes played. An undecided match still reports provisional points so a
        // live scoreboard can show a projection, but standings separate the two.
        decided: !!base.closed || (holes.length > 0 && thru >= holes.length),
        result: base.closed && base.finalResult
            ? base.finalResult
            : (base.status === 0
                ? 'All square'
                : (base.status > 0 ? calc.t1Name : calc.t2Name) + ' ' + Math.abs(base.status) + ' up')
    };
}

// THE POINT AWARD. Win 1 / halve 0.5 each / loss 0. Reads only `status`.
function ryderMatchPoints(state) {
    if (!state) return null;
    if (state.status > 0) return { pointsA: RYDER_POINTS_WIN, pointsB: RYDER_POINTS_LOSS };
    if (state.status < 0) return { pointsA: RYDER_POINTS_LOSS, pointsB: RYDER_POINTS_WIN };
    return { pointsA: RYDER_POINTS_HALVE, pointsB: RYDER_POINTS_HALVE };
}

function computeRyderMatchResult(data, courseData, savedScores, matchId) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return null;
    var match = cfg.matches[matchId];
    if (!match) return null;
    var state = ryderFourBallState(data, courseData, savedScores, match);
    if (!state) return null;
    var pts = ryderMatchPoints(state);
    state.pointsA = pts.pointsA;
    state.pointsB = pts.pointsB;
    return state;
}

// ---------------------------------------------------------------------------
// STANDINGS. `points` counts DECIDED matches only - what a side has actually
// banked. `projected` includes matches still in progress at their current state,
// which is what a live scoreboard shows. Kept separate so a page can never
// accidentally present a projection as a final score.
// ---------------------------------------------------------------------------
function computeRyderCupStandings(data, courseData, savedScores) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return null;

    var sides = {};
    Object.keys(cfg.sides).forEach(function (id) {
        sides[id] = {
            id: id,
            name: cfg.sides[id].name || id,
            color: cfg.sides[id].color || null,
            // OFFICIAL is what a side has banked: decided matches only. PROJECTED
            // adds matches still in progress at their current standing. They are
            // never summed into one number, because a scoreboard that shows 1.5
            // without saying whether that point is won or merely being won is the
            // scoreboard that starts an argument on the 18th green.
            points: 0,      // banked / official - Phase 1 name, kept for compatibility
            official: 0,
            projected: 0
        };
    });

    var matches = [];
    Object.keys(cfg.matches).forEach(function (mid) {
        var r = computeRyderMatchResult(data, courseData, savedScores, mid);
        if (!r) return;
        matches.push(r);
        if (sides[r.sideA]) {
            sides[r.sideA].projected += r.pointsA;
            if (r.decided) { sides[r.sideA].points += r.pointsA; sides[r.sideA].official += r.pointsA; }
        }
        if (sides[r.sideB]) {
            sides[r.sideB].projected += r.pointsB;
            if (r.decided) { sides[r.sideB].points += r.pointsB; sides[r.sideB].official += r.pointsB; }
        }
    });

    return {
        v: cfg.v,
        sides: sides,
        matches: matches,
        problems: validateRyderCup(data),
        decidedCount: matches.filter(function (m) { return m.decided; }).length,
        liveCount: matches.filter(function (m) { return !m.decided; }).length,
        totalMatches: matches.length,
        // Every match is worth exactly one point, split or whole. A later phase can
        // make this configurable; nothing here assumes it is 1 beyond this line.
        pointsAvailable: matches.length * RYDER_POINTS_WIN
    };
}

// ---------------------------------------------------------------------------
// SETUP-SIDE HELPERS (Phase 3B)
//
// Everything below serves the organizer's setup screen. None of it scores a hole
// or moves a dollar. It builds the stored competition, decides what may still be
// changed, and answers whether the whole thing can be thrown away.
//
// The organizer UI must call these rather than re-deriving the rules, so there is
// exactly one definition of "is this pairing legal" and one of "is it too late to
// change it".
// ---------------------------------------------------------------------------

// The only session that exists until the three-day structure lands. Deliberately
// an opaque id, not "Day 1 Morning": Phase 2 scoped exclusivity by session, and
// the real ids ('d1-foursomes', 'd3-singles') slot in here later without a
// migration. Nothing may assume the set of sessions is {this one}.
var RYDER_DEFAULT_SESSION = 's1';

// A COMPETITION HAS ITS OWN NAME. The sides are "Team Rattle" and "Team Chaos";
// the competition is "The Myrtle Cup". Those are different things, and hardcoding
// the title as "Ryder Cup" would make the format the name. Falls back only when a
// competition predates this field.
function ryderCupName(data) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return null;
    var n = cfg.name;
    return (typeof n === 'string' && n.trim()) ? n.trim() : 'Ryder Cup';
}

// Builds the stored object from what the organizer typed. PURE - it writes
// nothing and reads no scores; the caller persists the result only after
// validateRyderCupSave() approves it.
//
// NOTE THE ABSENT FIELDS. There is no stake, no press rule, no per-hole amount
// and no payout anywhere in this shape, and a test asserts they can never appear.
// A Cup match is worth a point.
function buildRyderCupConfig(input) {
    var inp = input || {};
    var sides = {
        A: { id: 'A', name: (inp.nameA || 'Team A').toString().trim() || 'Team A' },
        B: { id: 'B', name: (inp.nameB || 'Team B').toString().trim() || 'Team B' }
    };
    if (inp.colorA) sides.A.color = inp.colorA;
    if (inp.colorB) sides.B.color = inp.colorB;

    var members = {};
    Object.keys(inp.members || {}).forEach(function (pid) {
        var side = inp.members[pid];
        if (side === 'A' || side === 'B') members[String(pid)] = side;
    });

    var matches = {};
    (inp.matches || []).forEach(function (m, i) {
        var id = m.id || ('m' + (i + 1));
        matches[id] = {
            id: id,
            sessionId: m.sessionId || RYDER_DEFAULT_SESSION,
            format: m.format === 'singles' ? 'singles' : 'fourball',
            scoring: m.scoring || 'net',
            sideA: 'A', sideB: 'B',
            playersA: (m.playersA || []).map(String),
            playersB: (m.playersB || []).map(String)
        };
        // A pairing already locked keeps its snapshot across an edit of OTHER
        // pairings. Dropping it here would silently unlock a started match.
        if (m.lockedAt) {
            matches[id].lockedAt = m.lockedAt;
            matches[id].lockedA = (m.lockedA || []).map(String);
            matches[id].lockedB = (m.lockedB || []).map(String);
        }
    });

    return {
        v: RYDER_CUP_SCHEMA_VERSION,
        name: (inp.name || '').toString().trim() || 'Ryder Cup',
        sides: sides,
        members: members,
        matches: matches
    };
}

// A golfer may be in the round without being in the Cup - a trip has golfers who
// sit a session out. Only those actually assigned are members.
function ryderCupMemberIds(data) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return [];
    return Object.keys(cfg.members);
}

// THE SAVE GATE. Everything an organizer's save must survive, in one place.
//
// Beyond the structural rules validateRyderCup() already enforces, this adds the
// two that only exist once play has started:
//
//   a locked pairing may not be re-rostered
//   a golfer inside a locked pairing may not change sides
//
// The second is the subtle one. Without it an organizer could leave Match 1
// untouched, move Manny from Team Rattle to Team Chaos, and retroactively turn a
// completed match into an illegal one. The roster snapshot protects who PLAYED;
// this protects which side they played FOR.
function validateRyderCupSave(data, courseData, savedScores, nextCup) {
    var problems = [];
    var candidate = { players: (data || {}).players || [], ryderCup: nextCup };
    validateRyderCup(candidate).forEach(function (p) { problems.push(p); });

    var prev = ryderCupConfig(data);
    if (!prev) return problems;

    Object.keys(prev.matches).forEach(function (mid) {
        var before = prev.matches[mid];
        var lock = ryderMatchLockState(data, courseData, savedScores, before);
        if (!lock.locked) return;

        var after = (nextCup.matches || {})[mid];
        if (!after) {
            problems.push({ type: 'locked-match-removed', matchId: mid,
                message: 'that match has started and cannot be removed' });
            return;
        }
        // THE DECLARED ROSTER, not ryderMatchRoster(after). That helper prefers the
        // lock snapshot, so asking it about the incoming edit compared the snapshot
        // to itself and reported no change - the check defeated by the very field
        // it exists to protect.
        var was = ryderMatchRoster(before);
        var now = { a: (after.playersA || []).map(String), b: (after.playersB || []).map(String) };
        if (was.a.join(',') !== now.a.join(',') || was.b.join(',') !== now.b.join(',')) {
            problems.push({ type: 'locked-match-edited', matchId: mid,
                message: 'that match has started - its pairing is locked' });
        }
        was.a.concat(was.b).forEach(function (pid) {
            if (prev.members[pid] && nextCup.members[pid]
                && prev.members[pid] !== nextCup.members[pid]) {
                problems.push({ type: 'locked-member-moved', matchId: mid, playerId: pid,
                    message: 'that golfer is in a match that has started and cannot change teams' });
            }
        });
    });

    return problems;
}

// Has ANY Cup match begun? Governs whether the competition may be thrown away.
function ryderCupHasStarted(data, courseData, savedScores) {
    var cfg = ryderCupConfig(data);
    if (!cfg) return false;
    return Object.keys(cfg.matches).some(function (mid) {
        return ryderMatchLockState(data, courseData, savedScores, cfg.matches[mid]).locked;
    });
}

// DELETION IS A ONE-WAY DOOR. Before anyone tees off, a Cup created by mistake is
// just a bad draft and removing it costs nothing. After the first score it holds
// results that exist nowhere else - points are derived from config plus scores, so
// deleting the config destroys the history rather than archiving it. Blocked until
// a future phase designs a real archive.
function canRemoveRyderCup(data, courseData, savedScores) {
    if (!hasRyderCup(data)) return { ok: false, error: 'no-competition' };
    if (ryderCupHasStarted(data, courseData, savedScores)) {
        return { ok: false, error: 'already-started',
            message: 'A match has already started. The Cup cannot be removed.' };
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// YOUR MATCH
//
// Resolved from the golfers already in front of the reader, using Rattle's
// EXISTING group mechanism - the caller passes the ids it already has, the same
// set window.__scFilteredPlayers holds on the scorecard. No second identity
// system is introduced, because the app does not have a first one to extend: a
// group-locked link IS the identity.
//
// RETURNS NULL RATHER THAN GUESSING. An organizer or spectator with no group
// context gets nothing here, and the caller shows the scoreboard and All Matches
// instead. Naming a match "yours" to someone who is not in it is worse than
// showing them no match at all.
// ---------------------------------------------------------------------------
function ryderMatchForPlayers(data, courseData, savedScores, playerIds) {
    var cfg = ryderCupConfig(data);
    if (!cfg || !playerIds || playerIds.length === 0) return null;
    var want = playerIds.map(String);

    var hit = null;
    Object.keys(cfg.matches).forEach(function (mid) {
        if (hit) return;
        var roster = ryderMatchRoster(cfg.matches[mid]);
        var ids = roster.a.concat(roster.b);
        if (ids.some(function (id) { return want.indexOf(id) !== -1; })) hit = mid;
    });
    if (!hit) return null;
    return computeRyderMatchResult(data, courseData, savedScores, hit);
}

// A phone-width status line: "2 UP thru 14", "AS thru 12", "FINAL - 3 & 2".
// Formats only. Every value it prints was decided by the protected match engine.
function ryderStatusLine(state) {
    if (!state) return '';
    if (state.decided) {
        if (state.status === 0) return 'HALVED';
        return 'FINAL \u00B7 ' + state.result;
    }
    if (state.status === 0) return 'AS thru ' + state.thru;
    return Math.abs(state.status) + ' UP thru ' + state.thru;
}
