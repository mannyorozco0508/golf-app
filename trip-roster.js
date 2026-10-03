// ============================================================================
// ADDING AND REMOVING GOLFERS ON A TRIP (2026-10-03)
//
// A trip's rounds are created with placeholder players - Player 1..N - and the
// real roster is filled in per round. So when somebody drops out on the Tuesday,
// or a fifth golfer joins on the Wednesday, the organizer has to open every
// remaining round and edit it by hand.
//
// THIS FILE IS THE RULE FOR WHICH ROUNDS A CHANGE MAY TOUCH, and it is the whole
// reason the feature is safe:
//
//     A ROUND THAT HAS SCORES IS FINISHED BUSINESS.
//
// Not "mostly finished" and not "probably safe to edit". A round with a single
// posted score has a settled or settling money position: handicaps are read off
// its roster, side matches name its player ids, the pool charges its buy-ins per
// golfer, and skins and dots are per hole per player. Adding a golfer to it
// would change who is in a bet that has already been played; removing one would
// orphan their scores and the bets naming them.
//
// So: a roster change applies to rounds with NO SCORES AT ALL, and the rest are
// listed by name as untouched. The organizer is told which, rather than left to
// infer it - "applied to 3 of 5 rounds" with the two named is a sentence they
// can check against what they remember playing.
//
// WHY NOT "NOT YET STARTED" BY TEE TIME. A tee time is a plan; a score is a
// fact. A group that teed off late and a group that teed off early and posted
// nothing are the same round as far as money is concerned, and a clock would get
// one of them wrong.
//
// PURE. No DOM, no database. The page reads the rounds, this says what may
// change, and the page writes.
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that re-declares the name.
// ============================================================================

// A round has scores when ANY score key holds a number above zero. Not
// Object.keys().length: a round can carry an empty scores object, and a key
// written and then cleared leaves a 0 or a null behind.
function tripRoundHasScores(data) {
    var scores = (data && data.scores) || {};
    var keys = Object.keys(scores);
    for (var i = 0; i < keys.length; i++) {
        var v = scores[keys[i]];
        if (v !== null && v !== undefined && Number(v) > 0) return true;
    }
    return false;
}

// AND A VERIFIED ROUND IS FINISHED EVEN IF IT SOMEHOW HAS NO SCORES. The
// organizer has signed it off; whatever it holds is the record.
function tripRoundIsClosed(data) {
    var d = data || {};
    if (d.verified === true || d.scoresVerified === true) return true;
    if (d.settledAt || d.verifiedAt) return true;
    return tripRoundHasScores(d);
}

// ---------------------------------------------------------------------------
// THE PLAN. Given the trip's rounds, which ones a roster change touches and
// which it leaves alone - with the untouched ones NAMED, because "some rounds
// were skipped" is not something an organizer can check.
//
// rounds: [{ code, label, data }] - the shape trip.html already holds in
// cachedRoundResults.
function tripRosterPlan(rounds) {
    var open = [];
    var closed = [];
    (rounds || []).forEach(function (r) {
        var entry = { code: r.code, label: r.label || r.code, data: r.data };
        if (tripRoundIsClosed(r.data)) closed.push(entry);
        else open.push(entry);
    });
    return {
        open: open, closed: closed,
        total: open.length + closed.length
    };
}

// The sentence the screen shows before anything is written. It names the
// untouched rounds, and it says nothing about rounds it is not going to change.
function tripRosterPlanNote(plan, verb) {
    var p = plan || { open: [], closed: [], total: 0 };
    var v = verb || 'change';
    if (p.total === 0) return 'This trip has no rounds yet.';
    if (p.open.length === 0) {
        return 'Every round in this trip has scores, so there is nothing to ' + v
            + ' — a round with scores keeps the roster it was played with.';
    }
    var line = 'Will ' + v + ' ' + p.open.length + ' of ' + p.total + ' round'
        + (p.total === 1 ? '' : 's') + '.';
    if (p.closed.length) {
        line += ' Untouched (already has scores): '
            + p.closed.map(function (r) { return r.label; }).join(', ') + '.';
    }
    return line;
}

// ---------------------------------------------------------------------------
// THE WRITE, AS A PLAIN MAP the page hands to one update().
//
// ADDING appends a golfer to each OPEN round's players, with a fresh id that
// collides with nothing in that round. Ids are per round in this app - a trip's
// rounds are separate events - so the next free id is computed per round rather
// than once.
//
// NOTHING IS WRITTEN FOR A ROUND THAT ALREADY HAS THEM. Re-adding a name that is
// already on a round would create a second entry with the same name and a
// different id, which is two golfers as far as every engine is concerned.
function tripNextPlayerId(players) {
    var max = 100;
    (players || []).forEach(function (p) {
        var n = Number(p && p.id);
        if (isFinite(n) && n > max) max = n;
    });
    return max + 1;
}

function tripNameKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function tripRosterAddUpdates(plan, name, opts) {
    var o = opts || {};
    var clean = String(name || '').trim();
    var out = { updates: {}, added: [], skipped: [] };
    if (!clean) return out;
    var key = tripNameKey(clean);
    (plan && plan.open ? plan.open : []).forEach(function (r) {
        var players = ((r.data || {}).players || []).slice();
        var already = players.some(function (p) { return tripNameKey(p && p.name) === key; });
        if (already) { out.skipped.push(r.label); return; }
        players.push({
            id: tripNextPlayerId(players), name: clean,
            hcp: o.hcp === undefined || o.hcp === null ? '' : String(o.hcp),
            // THE SAME DEFAULTS THE PLANNER WRITES for a placeholder golfer, so a
            // golfer added later is indistinguishable from one created with the
            // round.
            team: 'Team 1', squad: 'red', playingForMoney: true
        });
        out.updates['events/' + r.code + '/players'] = players;
        out.added.push(r.label);
    });
    return out;
}

// REMOVING drops the golfer from each OPEN round's players.
//
// IT DOES NOT TOUCH SCORES, and it cannot need to: an open round has none. That
// is exactly why the closed/open split is the safety model rather than a
// convenience - a remove that had to clean up scores would be a remove that
// could get it wrong.
//
// AND IT REFUSES TO EMPTY A ROUND. A round with no players is a round nothing
// can be scored on, and the app has no screen for it; the organizer deletes the
// round instead.
function tripRosterRemoveUpdates(plan, name) {
    var key = tripNameKey(name);
    var out = { updates: {}, removed: [], skipped: [], refused: [] };
    if (!key) return out;
    (plan && plan.open ? plan.open : []).forEach(function (r) {
        var players = ((r.data || {}).players || []);
        var kept = players.filter(function (p) { return tripNameKey(p && p.name) !== key; });
        if (kept.length === players.length) { out.skipped.push(r.label); return; }
        if (kept.length === 0) { out.refused.push(r.label); return; }
        out.updates['events/' + r.code + '/players'] = kept;
        out.removed.push(r.label);
    });
    return out;
}

// Every name on the trip's OPEN rounds, so the remove list offers only golfers a
// change could actually reach.
function tripOpenRosterNames(plan) {
    var seen = {};
    var out = [];
    (plan && plan.open ? plan.open : []).forEach(function (r) {
        ((r.data || {}).players || []).forEach(function (p) {
            var n = String((p && p.name) || '').trim();
            if (!n) return;
            var k = tripNameKey(n);
            if (seen[k]) return;
            seen[k] = true;
            out.push(n);
        });
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        tripRoundHasScores, tripRoundIsClosed, tripRosterPlan, tripRosterPlanNote,
        tripNextPlayerId, tripNameKey, tripRosterAddUpdates, tripRosterRemoveUpdates,
        tripOpenRosterNames
    };
}
