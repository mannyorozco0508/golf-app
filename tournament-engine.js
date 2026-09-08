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

// IS NET ACTUALLY BEING APPLIED? THE ONE PLACE THAT DECIDES.
//
// Asking for net and getting net are different things: on a course the app has
// never mapped, resolveTournamentCourseData() fabricates a 1..18 index,
// courseIndexSynthetic records that it did, and hasUsableStrokeIndex() refuses
// to allocate on it. The round is then scored GROSS, correctly.
//
// The label on the golfer's card used to ask a different question - scoringMode
// alone - so the card read "Net" over a gross board and told the golfer net was
// being worked out for them. Nothing was broken on screen; the sentence was
// simply false, which is worse, because a wrong number gets queried and a
// confident wrong sentence gets believed.
//
// So the arithmetic and every word describing it now ask the SAME function. If
// the rule ever changes, it changes here, once, and the labels follow. Three
// names because callers genuinely ask three different questions - what was
// asked for, what is happening, and whether those differ:
//
//   netWasRequested   the stored setting, nothing more
//   netIsInPlay       the setting AND a course that can carry it - this is the
//                     one the scoring uses
//   netWasRefused     asked for and not happening. The case that needs a
//                     sentence on screen.
function netWasRequested(data) {
    return !!data && data.scoringMode === 'net';
}

function netIsInPlay(data) {
    return netWasRequested(data) && hasUsableStrokeIndex(data);
}

function netWasRefused(data) {
    return netWasRequested(data) && !netIsInPlay(data);
}

// WHAT THIS FORMAT IS CALLED. ONE DEFINITION.
//
// There were three: a formatLabel() in each of the two pages, byte-identical
// and both wrong - they handled shamble and bestball and returned 'Scramble'
// for everything else, so an Individual Stroke Play event announced itself as a
// Scramble on the organizer header, the leaderboard header and the printed
// sheet - and a formatLabelFor() sitting in the same file as one of them,
// correct, used only by the rounds list. Two copies of a rule, one of which
// already had the answer the other got wrong, is exactly the duplication that
// ships the same defect twice.
//
// An unknown format falls back to its own stored value rather than to a guess,
// because naming a format something it is not is how this started.
function formatLabelFor(fmt) {
    return { scramble: 'Scramble', shamble: 'Shamble', bestball: '2-Man Best Ball',
             individual: 'Individual Stroke Play' }[fmt] || fmt || '\u2014';
}

// WITHDRAWN: A RESULT THAT IS NO LONGER IN THE COMPETITION.
//
// Deleting a golfer who has scored removes the record and ORPHANS their score
// keys - nothing reaches them again, because addPlayerToField mints a fresh id,
// so re-adding the same person creates a different competitor with an empty
// card. Wave 5 measured exactly that: one tap, no confirmation, eighteen holes
// unreachable.
//
// So a scored competitor is withdrawn instead. The record stays, the scores
// stay, the id stays - and every board asks THIS function rather than testing
// the field itself, so "withdrawn" cannot come to mean two different things in
// two places. Declared, never inferred: no marker means active, which is what
// every record written before today is.
var COMPETITOR_WITHDRAWN = 'withdrawn';

function isWithdrawn(entry) {
    return !!entry && entry.status === COMPETITOR_WITHDRAWN;
}

// HOW MANY HOLES THIS COMPETITOR HAS ACTUALLY POSTED, wherever the scores live.
// A single-round record keeps them at the root; a multi-round event keeps them
// per round, and a golfer who played Saturday has a result even if Sunday's
// round is empty. Counting only the root would offer Delete on a scored golfer
// the moment an event grew a second round.
function competitorScoreCount(data, id) {
    if (!data || !id) return 0;
    const prefix = String(id) + '_h';
    let n = 0;
    const tally = scores => Object.keys(scores || {})
        .forEach(k => { if (k.indexOf(prefix) === 0) n++; });
    tally(data.scores);
    Object.keys(data.rounds || {}).forEach(rid => tally((data.rounds[rid] || {}).scores));
    return n;
}

// A PAID ENTRY THAT IS NOT YET A PERSON.
//
// A captain pays for four and names one. The setup form drops the other three
// before the write - filter(v => v.length > 0) - so the money exists and the
// competitors do not. An unnamed entry is the slot itself: a real place in the
// field, assignable to a group, scoreable, named whenever the captain gets
// round to it.
//
// DECLARED, NOT INFERRED FROM AN EMPTY NAME. An organizer who tabs past a text
// box has not bought an entry, and a record whose name happens to be blank is
// indistinguishable from a mistake. The marker is written deliberately when the
// slot is created and REMOVED the moment a name arrives, so - exactly like
// withdrawal - absence of the marker is the ordinary state and there is only
// one way of being a named competitor.
//
// NOT the same field as status. A withdrawn golfer has left the competition; an
// unnamed one has not arrived in it. Overloading one field would make two very
// different sentences share a value.
function isUnnamed(entry) {
    return !!entry && entry.unnamed === true;
}

// AN ABSENT HANDICAP IS NOT A HANDICAP OF ZERO.
//
// A slot nobody has numbered was written handicap '0' and, on a NET event, was
// ranked as a scratch golfer - the one handicap nobody would have chosen for an
// unknown person, and the hardest to notice because scratch is a perfectly
// ordinary thing for a real golfer to be.
//
// DECLARED, NEVER INFERRED FROM THE VALUE. An organizer can legitimately enter
// 0: a scratch golfer exists. So "missing" cannot be read off the number, off
// an empty string, or off the field being absent. It is a marker, written when
// the slot is created and cleared the moment a number arrives.
//
// GROSS EVENTS ARE UNTOUCHED. There is no handicap to be missing when none is
// being applied, so a pending entry plays and ranks exactly like anybody else.
function handicapIsPending(entry) {
    return !!entry && entry.handicapPending === true;
}

// WHAT TO CALL SOMEBODY WHO HAS NO NAME YET, in the one place that decides it.
// `p.name || 'Player'` was the old fallback and it lied twice over: it read the
// same for a slot nobody has named and for a record whose name failed to save.
function competitorDisplayName(entry) {
    if (isUnnamed(entry)) return 'Unnamed entry';
    return (entry && entry.name) || 'Player';
}

// THE PENDING WORDS, TYPED ONCE.
//
// The board and the golfer's own card both have to say that a handicap has not
// arrived yet. Wave 17 wrote the sentence on the board and the card kept
// printing `handicap || 0`, so the surface actually carried around the course
// was the one still claiming an unknown person plays off scratch. Two
// hand-written sentences for one fact is how formatLabel and the pool defect
// both happened, so neither page types these words: the phrase is a constant
// and the display rule is a function.
var HANDICAP_PENDING_TEXT = 'handicap pending';

// What to show where a handicap number goes. A REAL ZERO IS A REAL ZERO - a
// scratch golfer still reads "0" here, which is the whole reason absence is a
// marker rather than something read off the value.
function handicapDisplay(entry) {
    if (handicapIsPending(entry)) return HANDICAP_PENDING_TEXT;
    // Unchanged from what every surface did before this function existed: an
    // absent value on a record with no pending marker is a legacy zero.
    const h = entry ? entry.handicap : undefined;
    return (h === undefined || h === null || h === '') ? '0' : String(h);
}

// WHO BOUGHT THIS ENTRY.
//
// NOT A PAYMENT. A captain pays for a foursome, three of the slots have no name
// yet, and until wave 18 nothing recorded whose they were - the organizer had
// the money and no way to say where it came from, and three slots that read
// identically on the field list. This is the link a payment will later attach
// to: `name` and `contact` are what an organizer types today, `ref` is where a
// Stripe object id goes when there is one. Nothing here charges anybody.
//
// STRUCTURED, NOT PARSED. The payer is its own object on the player record,
// never smuggled into the name field, so reading it is a property access and
// naming the entry cannot disturb it.
//
// OPTIONAL, and absence is the ordinary state - an entry with no payer is
// exactly the entry every organizer has been creating all along.
function entryPayer(entry) {
    const p = entry && entry.paidBy;
    if (!p || typeof p !== 'object') return null;
    const str = v => String(v === undefined || v === null ? '' : v).trim();
    const name = str(p.name);
    if (!name) return null;
    return { name: name, contact: str(p.contact), ref: str(p.ref) };
}

// The predicate, beside isUnnamed and isWithdrawn, for a consumer that only
// needs to ask whether anybody is recorded.
function hasPayer(entry) {
    return entryPayer(entry) !== null;
}

// TELLING ONE CAPTAIN'S THREE SLOTS APART.
//
// A payer's name alone does not distinguish them - that was the point of
// recording it and it is not enough on its own, because three rows reading
// "Captain Smith" are as interchangeable as three rows reading "Unnamed entry".
// The position within that payer's entries is what separates them, ordered by
// when they were added so the numbering is stable across renders and does not
// shift when an unrelated entry is created.
//
// Grouped by the payment reference when there is one, and otherwise by name and
// contact together - two different Smiths with different emails are two payers.
function payerEntryTag(players, pid) {
    const all = players || {};
    const mine = entryPayer(all[pid]);
    if (!mine) return '';
    const keyOf = e => { const p = entryPayer(e); return p ? (p.ref || (p.name + '|' + p.contact).toLowerCase()) : null; };
    const key = keyOf(all[pid]);
    const siblings = Object.keys(all)
        .filter(id => keyOf(all[id]) === key)
        .sort((a, b) => ((all[a].addedAt || 0) - (all[b].addedAt || 0)) || (a < b ? -1 : a > b ? 1 : 0));
    if (siblings.length < 2) return mine.name;
    return `${mine.name} · ${siblings.indexOf(pid) + 1} of ${siblings.length}`;
}

// HOW MANY COMPETITORS ARE THERE, AND WHAT IS ONE CALLED. ONE BRANCH.
//
// An individual event keeps its field in players/ and nothing in teams/, so
// anything that counted teams to mean competitors read ZERO on it. That was not
// one bug: a $300 entry fee produced a $0 pool, AND the "a flight in use is not
// deleted" guard reported no occupants and let an organizer delete a flight
// three golfers were assigned to - the precise thing its own comment says it
// exists to prevent.
//
// The branch on the declared model is written HERE, once, and returns both the
// records and the word for them together. Two functions each branching on the
// same marker is how the pool and the flight guard drifted apart in the first
// place; one that hands back a pair cannot.
//
// NEVER from key shape, always from the marker: a legacy record has no
// scoringModel and is a team event forever, which is what keeps every stored
// tournament reading the way it always has.
function competitorModel(data) {
    return isPlayerModel(data)
        ? { entries: (data && data.players) || {}, word: 'golfer' }
        : { entries: (data && data.teams) || {}, word: 'team' };
}

function competitorEntries(data) {
    return competitorModel(data).entries;
}

function competitorCount(data) {
    return Object.keys(competitorEntries(data)).length;
}

// "3 golfers" / "1 team". The count is passed in rather than recomputed so a
// caller that already has a filtered number - a flight's occupants, say - can
// name it without the noun and the number disagreeing.
function competitorNoun(data, n) {
    const word = competitorModel(data).word;
    return Number(n) === 1 ? word : word + 's';
}

// WHAT THE ENTRIES ON A LEADERBOARD ARE. Derived from the record's declared
// model, not from which view happens to be on screen: the same field is the
// same competitors whether you are looking at one round, another round or the
// combined standings. The event view already said "Golfer" and the round views
// said "Team" over the same golfers, which is what one label per view buys you.
function entryColumnLabel(data) {
    const word = competitorModel(data).word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// NET OR GROSS, IN A SENTENCE, FOR A DOCUMENT THAT LEAVES THE BUILDING.
//
// A printed sheet with no scoring mode on it is a net result and a gross result
// as the same piece of paper. It asks the two predicates above rather than
// restating either condition, so the sheet cannot disagree with the board it
// was printed from.
//
// Null for team formats: a scramble has no net/gross choice to state, and
// printing one would be inventing a distinction the event does not have.
function scoringModeLine(data) {
    if (!isPlayerModel(data)) return null;
    if (netIsInPlay(data)) return 'Net';
    if (netWasRefused(data)) {
        return "Gross \u2014 this course has no real stroke index, so net strokes "
             + "can't be allocated";
    }
    return 'Gross';
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
    const useNet = netIsInPlay(data);
    let idx = 0;

    // A WITHDRAWN GOLFER IS OFF THE BOARD AND STILL IN THE RECORD. Filtered
    // before the map so the remaining ranks close up rather than leaving a gap
    // where somebody used to be.
    return Object.keys(players).filter(pid => !isWithdrawn(players[pid])).map(pid => {
        const p = players[pid];
        // CANNOT BE NETTED. Decided here, once, so no surface has to work it out
        // for itself: a net event plus a handicap nobody has supplied means
        // there is no net score to rank, only a gross one that would be a
        // different competition.
        const pending = useNet && handicapIsPending(p);
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
        const shown = competitorDisplayName(p);
        return {
            entryType: 'player', entryKey: pid, num: idx,
            teamName: shown,
            playerId: pid, playerName: shown,
            strokes: strokes, thru: thru, parPlayed: parPlayed,
            strokesReceived: received, net: (thru > 0 && !pending) ? net : null,
            toPar: (thru > 0 && !pending) ? net - parPlayed : null,
            // hasScores is what ranking, payouts and the event total all key
            // off, so a pending entry is unranked and unpaid everywhere by the
            // one decision above rather than by four separate ones. netPending
            // is what lets a screen say WHY instead of leaving a bare dash.
            hasScores: thru > 0 && !pending,
            netPending: pending,
            holesPosted: thru,
            flightId: p.flightId || null,
        };
    });
}

// The one fork. Everything after this call is model-agnostic.
function normalizeLeaderboardEntries(data) {
    return isPlayerModel(data) ? normalizePlayerEntries(data) : normalizeTeamEntries(data);
}

// ===========================================================================
// MULTI-ROUND EVENTS
//
// A tournament used to BE a round: one course, one format, one set of scores, all
// at the record root. A club championship is an EVENT that contains rounds, and
// the two must coexist without either learning about the other.
//
// The boundary is one function - roundContext() - which returns a view of a single
// round shaped exactly like a single-round tournament record. Everything
// downstream (normalization, flight filtering, sorting, competition ranking) is
// handed that view and never discovers it was assembled. There is no
// `if (rounds) … else …` anywhere in the scoring path, which is the whole point:
// a third storage model would be a third view, not a third leaderboard.
//
// EVENT owns what persists: identity, the player field and their stable ids,
// flights, teams, the trip link, entry fee.
// ROUND owns what changes: course, format, scoring mode, groups, starting holes,
// scores, handicap snapshots, status.
// ===========================================================================

var ROUND_MODEL = 'round-v1';

// Declared, never inferred - the same rule the player model follows. A record
// without the marker is a single-round tournament forever, and no rounds node can
// appear later and change how its stored scores are read.
function isMultiRound(data) {
    return !!data && data.eventModel === ROUND_MODEL;
}

// A round can be configured, live, or finished. Status gates GOLFER writes only -
// an organizer configures in SETUP and reviews in CLOSED.
var ROUND_SETUP = 'setup';
var ROUND_OPEN = 'open';
var ROUND_CLOSED = 'closed';

function roundStatus(round) {
    const st = (round || {}).status;
    return st === ROUND_OPEN || st === ROUND_CLOSED ? st : ROUND_SETUP;
}

// Only an open or closed round counts towards the event. A round still being
// configured is not a round anybody has played.
function countableRoundIds(data) {
    // ONE ordering, filtered - not a second sort that could disagree with the first
    // about which round is Round 1.
    const rounds = (data || {}).rounds || {};
    return orderedRoundIds(data).filter(rid => roundStatus(rounds[rid]) !== ROUND_SETUP);
}

// ROUNDS IN THE ORDER THEY ARE PLAYED.
//
// Creation order by default, because ids are opaque and a name can be changed -
// "Round 1" means the first one created, not the one alphabetically first.
//
// An organizer who reorders gets an explicit sortOrder, and it is honoured ahead of
// creation time. Reordering must not be done by rewriting createdAt: that field is
// also what tells you when a round was actually made, and a reorder is not a
// statement about history. Rounds without sortOrder keep their creation order
// beneath any that have been placed deliberately.
function orderedRoundIds(data) {
    const rounds = (data || {}).rounds || {};
    return Object.keys(rounds).sort((a, b) => {
        const ao = rounds[a].sortOrder, bo = rounds[b].sortOrder;
        const aHas = typeof ao === 'number', bHas = typeof bo === 'number';
        if (aHas && bHas && ao !== bo) return ao - bo;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (rounds[a].createdAt || 0) - (rounds[b].createdAt || 0);
    });
}

// THE COMPATIBILITY SEAM.
//
// Given an event and a round id, returns something every existing function can
// already read. Given a single-round record - or no round id - returns the record
// itself, untouched, which is what keeps historical tournaments behaving exactly
// as they always have.
//
// THE HANDICAP SNAPSHOT IS APPLIED HERE. A round records each player's handicap
// when it opens; from then on that round is scored with those numbers. Correcting
// a golfer's handicap before round two must not silently restate round one's
// result, and because the overlay happens at this boundary, none of the scoring
// code below has to know that snapshots exist.
function roundView(data, roundId) {
    if (!isMultiRound(data) || !roundId) return data;
    const round = (data.rounds || {})[roundId];
    if (!round) return null;

    const snapshots = round.handicaps || {};
    const eventPlayers = data.players || {};
    const players = {};
    Object.keys(eventPlayers).forEach(pid => {
        const p = eventPlayers[pid];
        // The snapshot wins when it exists. Absent - a round still in setup, or a
        // player added after the round opened - falls back to the live handicap,
        // which is exactly what a single-round record does.
        players[pid] = (snapshots[pid] !== undefined && snapshots[pid] !== null)
            ? Object.assign({}, p, { handicap: snapshots[pid] })
            : p;
    });

    return {
        // Event-level, carried through unchanged.
        scoringModel: data.scoringModel,
        players: players,
        flights: data.flights,
        teams: data.teams,
        name: data.name,
        // Round-level, resolved from the round.
        format: round.format,
        shambleCountBest: round.shambleCountBest,
        courseName: round.courseName,
        activeCourseKey: round.activeCourseKey,
        courseData: round.courseData || [],
        courseIndexSynthetic: round.courseIndexSynthetic,
        scoringMode: round.scoringMode,
        scoringGroups: round.scoringGroups || {},
        scores: round.scores || {},
        // Carried so callers can gate on it without re-reading the round.
        roundId: roundId,
        roundName: round.name,
        roundStatus: roundStatus(round),
    };
}

// One round's standings. No new ranking code: the round view goes straight into
// the same leaderboard every single-round tournament uses.
function computeRoundLeaderboard(data, roundId, flightId) {
    const view = roundView(data, roundId);
    if (!view) return [];
    return computeTournamentLeaderboard(view, flightId);
}

// ---------------------------------------------------------------------------
// EVENT STANDINGS
// ---------------------------------------------------------------------------

// WHICH ROUNDS CAN BE ADDED TOGETHER.
//
// A scramble round produces TEAM rows and an individual round produces PLAYER
// rows; there is no shared competitive entity to sum, and inventing one would be
// inventing a points conversion nobody specified. Gross and net are likewise not
// addable - a net total and a gross total are different competitions.
//
// So an event has a combined standing only when every countable round belongs to
// one family. Otherwise the round leaderboards still work and the event says so
// plainly rather than showing a number that means nothing.
// WHY combined standings are or are not available. A bare false is
// indistinguishable from a bug to the organizer looking at the screen, so every
// refusal carries a sentence they can act on.
function aggregateAvailability(data) {
    if (!isMultiRound(data)) {
        return { available: false, rows: [], reason:
            'This event is a single round, so there are no rounds to combine. Round results are the event results.' };
    }
    const ids = countableRoundIds(data);
    if (ids.length === 0) {
        return { available: false, rows: [], reason:
            'No rounds are open yet. A round has to be open or closed before it counts towards the event.' };
    }
    if (ids.length === 1) {
        return { available: false, rows: [], reason:
            'Only a single round is open, so the round leaderboard is already the event standing.' };
    }
    const rounds = data.rounds || {};
    const anyTeam = ids.some(rid => rounds[rid].format !== 'individual');
    const anyIndividual = ids.some(rid => rounds[rid].format === 'individual');
    if (anyTeam && anyIndividual) {
        return { available: false, rows: [], reason:
            'This event mixes team rounds with Individual Stroke Play. A team score and an individual score are not the same thing, so they cannot be added together — each round still has its own leaderboard.' };
    }
    if (anyTeam) {
        return { available: false, rows: [], reason:
            'Combined standings are only worked out for Individual Stroke Play at the moment. Each team round still has its own leaderboard.' };
    }
    const modes = ids.map(rid => (rounds[rid].scoringMode === 'net' ? 'net' : 'gross'));
    if (!modes.every(m => m === modes[0])) {
        return { available: false, rows: [], reason:
            'This event mixes Gross and Net rounds. Those are different competitions, so the totals cannot be added — each round still has its own leaderboard.' };
    }
    return { available: true, reason: null, family: 'individual:' + modes[0] };
}

function aggregateFamily(data) {
    const a = aggregateAvailability(data);
    if (!a.available) return null;
    const ids = countableRoundIds(data);
    const rounds = data.rounds || {};
    const families = ids.map(rid => 'individual:' + (rounds[rid].scoringMode === 'net' ? 'net' : 'gross'));
    const first = families[0];
    return first;
}

function canAggregate(data) {
    return aggregateFamily(data) !== null;
}

// EVENT STANDINGS, AGGREGATED BY PLAYER ID.
//
// Never by name: two golfers called Dave Smith are two competitors, and summing
// them would hand one of them the other's rounds.
//
// THE COMPLETENESS RULE, stated once and pinned by tests:
//
//   A player who has completed every countable round ranks ahead of a player who
//   has not, regardless of strokes. Fewer holes played is not a better score.
//   Within the same completeness state, the canonical competition result decides -
//   summed to-par, which is already relative to the holes actually played.
//
// That keeps a mid-round field ordered sensibly while a round is open, and stops a
// golfer who skipped Saturday from leading on Sunday afternoon.
function computeEventStandings(data, flightId) {
    const availability = aggregateAvailability(data);
    if (!availability.available) return availability;
    const ids = countableRoundIds(data);
    const players = data.players || {};
    const totals = {};

    ids.forEach(rid => {
        const view = roundView(data, rid);
        const holeCount = (view.courseData || []).length;
        // The round's OWN leaderboard rows - same normalization, same handicap
        // snapshot, same net decision - so a player's event total is built from the
        // exact numbers their round card showed.
        computeTournamentLeaderboard(view).forEach(row => {
            if (row.entryType !== 'player') return;
            const t = totals[row.playerId] || (totals[row.playerId] = {
                playerId: row.playerId,
                playerName: (players[row.playerId] || {}).name || row.playerName,
                teamName: (players[row.playerId] || {}).name || row.playerName,
                flightId: (players[row.playerId] || {}).flightId || null,
                strokes: 0, strokesReceived: 0, toPar: 0,
                holesPlayed: 0, roundsPlayed: 0, roundsComplete: 0,
                entryType: 'event', entryKey: row.playerId,
            });
            if (!row.hasScores) return;
            t.strokes += row.strokes;
            t.strokesReceived += row.strokesReceived || 0;
            t.toPar += row.toPar;
            t.holesPlayed += row.thru;
            t.roundsPlayed += 1;
            if (holeCount > 0 && row.thru === holeCount) t.roundsComplete += 1;
        });
    });

    let rows = Object.keys(totals).map(pid => totals[pid])
        .filter(r => !flightId || r.flightId === flightId);

    rows.forEach((r, i) => {
        r.countableRounds = ids.length;
        r.completedAll = r.roundsComplete === ids.length;
        r.hasScores = r.roundsPlayed > 0;
        r.num = i + 1;
    });

    // THE SAME sort-and-rank the round board uses. Only the ordering rule differs,
    // because an event position depends on completeness as well as score.
    rankRows(rows,
        (a, b) => {
            // COMPLETENESS BEFORE SCORE. A golfer who skipped Saturday has fewer
            // strokes than one who played it, and fewer strokes must not buy the lead.
            if (a.completedAll !== b.completedAll) return a.completedAll ? -1 : 1;
            if (a.roundsComplete !== b.roundsComplete) return b.roundsComplete - a.roundsComplete;
            return a.toPar - b.toPar;
        },
        (a, b) => a.completedAll === b.completedAll
               && a.roundsComplete === b.roundsComplete
               && a.toPar === b.toPar);
    return { available: true, reason: null, rows: rows };
}

// WHICH LEADERBOARD IS IN VIEW. ASKED ONCE.
//
// Three surfaces need this answer: the organizer's board, the sheet that board
// prints, and the golfer's own Leaderboard tab on a round-scoped link. Two of
// them used to answer it for themselves by calling
// computeTournamentLeaderboard(data) on the EVENT ROOT - which on a multi-round
// record holds no scores at all - so both rendered a full field with every
// score blank, directly beneath a board that was correct.
//
// That is the same failure as the two formatLabel copies and the team-counting
// pool: a question answered independently in more than one place drifts, and
// the copy that drifts is always the one nobody is looking at.
//
// selection is null or 'event' for the combined standings, or a round id.
// A single-round record ignores it entirely and returns what it always did.
function resolveLeaderboardView(data, selection, flightId) {
    if (!isMultiRound(data)) {
        return { kind: 'round', scope: 'single', available: true, reason: null,
                 rows: computeTournamentLeaderboard(data, flightId), title: null };
    }
    const viewing = selection || 'event';
    if (viewing === 'event') {
        const r = computeEventStandings(data, flightId);
        return { kind: 'event', scope: 'event', available: r.available,
                 reason: r.reason, rows: r.rows || [], title: 'Event total' };
    }
    const round = (data.rounds || {})[viewing];
    if (!round) {
        return { kind: 'round', scope: 'round', available: false, rows: [],
                 reason: 'That round is no longer part of this event.', title: null };
    }
    return { kind: 'round', scope: 'round', available: true, reason: null,
             rows: computeRoundLeaderboard(data, viewing, flightId),
             title: round.name || 'Round' };
}

// FLIGHTS FILTER THE FIELD; THEY DO NOT RANK IT DIFFERENTLY.
//
// A flight is a subset of the same competitors, standing in the same
// competition, judged by the same rule - so there is exactly one ranking
// implementation and the flight view reaches it by narrowing the input, never
// by copying the sort. A second ranking path would be a second definition of
// "tied", and the whole point of a flight is that the B flight is scored the
// same way the Championship flight is.
//
// flightId omitted or null means OVERALL, which is every competitor including
// those in no flight at all. That default is what keeps historical tournaments -
// which have no flights node and no flightId on anybody - behaving exactly as
// before.
//
// teamsInFlight() USED TO LIVE HERE AND HAD NO CALLERS. The leaderboard filters
// normalized rows by flightId directly, in computeTournamentLeaderboard. It was
// deleted rather than kept: it looked exactly like the flight rule, so it was a
// decoy somebody would eventually "fix" to no effect.

// Teams that belong to no flight the tournament actually has.
//
// A team with no flightId is obviously unassigned. So is a team pointing at a
// flight that no longer exists - and that case matters, because without it such a
// team appears in NO count at all and disappears from the organizer's view of the
// field. The dropdown already falls back to Unassigned for a dangling id; this
// makes the counts agree with it rather than quietly losing a team.
function unassignedTeamIds(competitors, flights) {
    const all = competitors || {};
    const known = flights || {};
    return Object.keys(all).filter(id => {
        const fid = (all[id] || {}).flightId;
        return !fid || !known[fid];
    });
}

// How many teams sit in each flight, plus the unassigned count. Derived, never
// stored - a cached count is a count that goes stale the first time a team moves.
function flightTeamCounts(data) {
    // SHARES poolTotal's ASSUMPTION, deliberately: this counts everyone in the
    // field, including a WITHDRAWN competitor. So a flight holding only
    // withdrawn golfers reports occupants and stays undeletable - which is the
    // conservative answer, because deleting it would strand a flightId on
    // records that still hold real scores. See the note at poolTotal in
    // tournament.html for the entry-fee side of the same choice.
    //
    // COMPETITORS, NOT TEAMS. On an individual event the flightId lives on the
    // player, so counting teams reported zero occupants for a flight full of
    // golfers and unlocked the delete button that guards them. The name is kept
    // because two page call sites and a test pin it; what it counts is now the
    // field, whichever model holds it.
    const competitors = competitorEntries(data);
    const flights = (data && data.flights) || {};
    const counts = {};
    Object.keys(flights).forEach(fid => { counts[fid] = 0; });
    Object.keys(competitors).forEach(id => {
        const fid = competitors[id].flightId;
        // Anyone pointing at a deleted flight is counted as unassigned below
        // rather than resurrecting the missing flight as a phantom row.
        if (fid && counts[fid] !== undefined) counts[fid]++;
    });
    counts.__unassigned = unassignedTeamIds(competitors, flights).length;
    return counts;
}

// data      the tournament record
// flightId  optional. Omitted or null ranks the whole field, which is what every
//           existing caller does and what every historical record produces.
// THE ONE SORT AND THE ONE RANK PASS IN THIS ENGINE.
//
// A round leaderboard, a flight leaderboard and an event's combined standings are
// three questions about the same competition, so they get one answer. Callers
// supply a comparator and a same-position test; ranking itself is written once.
//
// Competition ranking (1, 1, 3, 4...) — and an entry that has not started gets no
// numeric rank at all rather than being ranked last, because "hasn't teed off" is
// not a position.
function rankRows(rows, compare, samePosition) {
    rows.sort((a, b) => {
        if (a.hasScores !== b.hasScores) return a.hasScores ? -1 : 1;
        if (!a.hasScores && !b.hasScores) return (a.num || 0) - (b.num || 0);
        return compare(a, b);
    });
    rows.forEach((r, idx) => {
        if (!r.hasScores) { r.rank = null; return; }
        const prev = rows[idx - 1];
        if (idx > 0 && prev.hasScores && samePosition(r, prev)) {
            r.rank = prev.rank;
        } else {
            r.rank = idx + 1;
        }
    });
    return rows;
}

function computeTournamentLeaderboard(data, flightId) {
    // Storage is read once, in normalizeLeaderboardEntries. Everything after this
    // point is model-agnostic, which is what stops a second definition of "tied"
    // appearing the moment a second storage shape does.
    return rankRows(
        normalizeLeaderboardEntries(data).filter(r => !flightId || r.flightId === flightId),
        (a, b) => a.toPar - b.toPar,
        (r, prev) => r.toPar === prev.toPar);
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
