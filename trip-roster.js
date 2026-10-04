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

// ---------------------------------------------------------------------------
// THE ROUND PICKER'S LABEL AND ORDER (2026-10-03).
//
// "Start From" listed rounds by the key order of the trip's rounds map and
// showed the Day label alone - so a seven-round trip offered "Day 1 AM", "Day 3",
// "Day 1 PM" in whatever order they were written, and nothing on the row said
// which course. An organizer copying Friday's settings from Tuesday's round has
// to recognise it by the course.
//
// THE DATE IS THE ORDER WHEN THERE IS ONE. A round built from a pasted itinerary
// carries the date it was pasted with; a round linked by hand has none, and an
// invented one would sort it wrongly with confidence, so those keep their
// addedAt order and sit after the dated ones.
var TRIP_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function tripRoundWhen(date) {
    // yyyy-mm-dd, read as a LOCAL date: new Date('2026-10-13') is UTC midnight,
    // which prints as the 12th anywhere west of Greenwich - the whole trip would
    // read a day early.
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return '';
    return TRIP_WEEKDAYS[d.getDay()] + ' ' + Number(m[2]) + '/' + Number(m[3]);
}

// "Tue 10/13 AM - Caledonia": a day, which half of it, and a course.
//
// NO CLOCK (2026-10-04). A pasted itinerary still carries 8:24 and 1:40, and the
// ORDER below is still built from them - it is the only thing that can tell a
// morning round from an afternoon one - but no screen in this app shows a tee
// time or asks for one any more. The AM/PM comes off the round's own label,
// where the planner put it.
function tripRoundPickerLabel(round) {
    var r = round || {};
    var when = tripRoundWhen(r.date);
    var label = String(r.label || r.code || '').trim();
    var half = /\b(AM|PM)\b\s*$/i.exec(label);
    var left = when ? (when + (half ? ' ' + half[1].toUpperCase() : '')) : label;
    var course = String(r.courseName || '').trim();
    if (!left) left = label || String(r.code || '');
    return course ? left + ' \u00B7 ' + course : left;
}

// ---------------------------------------------------------------------------
// THE GOLFERS, IN THEIR GROUPS (2026-10-04).
//
// A trip roster read as one long alphabetical list, which is not how anybody
// holds it: a trip is groups, and a group is who you are playing with and who
// can see your bets. `sizes` comes from grouping.js computeGroupSizes - the
// page's own answer - because reimplementing grouping here is how two surfaces
// end up disagreeing about who is in group 3.
function tripGroupRows(players, sizes) {
    var list = (players || []).slice();
    var out = [];
    var at = 0;
    (sizes || []).forEach(function (size, i) {
        var members = list.slice(at, at + size);
        at += size;
        if (members.length) out.push({ group: i + 1, players: members });
    });
    // Anything the sizes did not cover is still somebody: a trailing group rather
    // than a golfer who vanishes off the screen.
    if (at < list.length) out.push({ group: out.length + 1, players: list.slice(at) });
    return out;
}

// ---------------------------------------------------------------------------
// ONE QUIET LINE FOR PLACEHOLDERS (2026-10-04).
//
// tripIdentityProblems reports one problem per placeholder PER ROUND, which for
// 24 unnamed golfers over three rounds is seventy-two paragraphs - repeated in
// the money card, the awards card and the leaderboard. Each paragraph was true
// and the page was unreadable.
//
// A PLACEHOLDER IS NOT THE DANGEROUS CASE. It is the normal state of a trip
// nobody has pasted names into yet: the trip total correctly waits, and all the
// organizer needs is one line telling them what to do. A DUPLICATE REAL NAME is
// the dangerous case - two golfers one balance - and those keep their own
// sentence, every one of them.
function tripIdentityDigest(problems) {
    var list = problems || [];
    var names = {};
    var rounds = {};
    var others = [];
    list.forEach(function (p) {
        if (p && p.kind === 'placeholder') {
            names[tripNameKey(p.name)] = true;
            if (p.round) rounds[p.round] = true;
            return;
        }
        others.push(p);
    });
    return {
        placeholders: Object.keys(names).length,
        placeholderRounds: Object.keys(rounds),
        others: others
    };
}

function tripPlaceholderNote(digest) {
    var d = digest || { placeholders: 0 };
    if (!d.placeholders) return '';
    // THE ROUNDS ARE NAMED, THE GOLFERS ARE NOT. Which round to open is the only
    // part an organizer has to act on; "Player 2", "Player 3", "Player 4" in each
    // of three rounds is the wall this replaced.
    var rounds = (d.placeholderRounds || []);
    return 'Add real names before the first round \u2014 ' + d.placeholders + ' golfer'
        + (d.placeholders === 1 ? ' is' : 's are') + ' still a placeholder'
        + (rounds.length ? ' in ' + rounds.join(', ') : '') + '. '
        + 'Trip totals wait until then; each round\u2019s own money is unaffected.';
}

// Dated rounds first, in date order (then by the label so AM precedes PM), and
// undated ones after in the order they were added.
function tripRoundPickerRows(rounds) {
    var rows = (rounds || []).map(function (r, i) {
        return {
            code: r.code,
            label: tripRoundPickerLabel(r),
            date: String(r.date || ''),
            // THE TIME SORTS, NOT THE FINISHED LABEL (2026-10-04). Sorting
            // same-date rounds by the label put "1:40 PM" before "7:50 AM",
            // because "1" is less than "7". 24-hour time is the only form of a tee
            // time that sorts, which is the form that gets stored.
            time: String(r.time || ''),
            raw: String(r.label || ''),
            addedAt: Number(r.addedAt) || 0,
            idx: i
        };
    });
    rows.sort(function (a, b) {
        if (!!a.date !== !!b.date) return a.date ? -1 : 1;
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.date && a.time !== b.time) {
            if (!a.time || !b.time) return a.time ? -1 : 1;   // a timed round before an untimed one
            return a.time < b.time ? -1 : 1;
        }
        if (a.date && a.raw !== b.raw) return a.raw < b.raw ? -1 : 1;   // "Day 2 AM" before "Day 2 PM"
        if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
        return a.idx - b.idx;
    });
    return rows;
}

// ---------------------------------------------------------------------------
// THE PASTED ROSTER (2026-10-03).
//
// A trip is built before anybody knows who is coming, so every round starts with
// placeholders - "Player 1" ... "Player 12", which is three groups. Later the
// organizer has the real list in a note on his phone, with handicaps and blank
// lines between groups, and pastes it whole.
//
// PASTED GOLFERS REPLACE THE PLACEHOLDERS IN ORDER, THEN KEEP ADDING. Twelve
// placeholders and thirty-two pasted names is eight groups: the first twelve
// slots are overwritten and twenty more are appended. REPLACING KEEPS THE SLOT'S
// ID, so anything in an open round that already points at a player id - a side
// match the organizer set up in advance, a pool entry - still points at the same
// seat rather than at a golfer who no longer exists.
//
// A NAME ALREADY ON THE ROUND IS NOT ADDED TWICE. Two entries with one name and
// two ids is two golfers to every engine in this app.
//
// AND IT ONLY TOUCHES ROUNDS WITH NO SCORES. tripRosterPlan draws that line, and
// a round with one posted score keeps the roster it was played with - handicaps
// are read off it, side matches name its ids, the pool charges per golfer. The
// untouched rounds are NAMED.
function tripIsPlaceholderName(name) {
    // The exact shape the planner writes, and nothing looser: a real golfer
    // called "Player" (it happens - a surname) must not be treated as a slot.
    return /^player\s*\d+$/i.test(String(name || '').trim());
}

function tripRosterPasteUpdates(plan, pasted, opts) {
    var o = opts || {};
    var incoming = ((pasted || {}).validPlayers || []).filter(function (p) {
        return String((p && p.name) || '').trim() !== '';
    });
    var groups = ((pasted || {}).groups || []).filter(function (n) { return n > 0; });
    // EVERY COUNT HERE IS PEOPLE, NOT WRITES (2026-10-04). The confirm said
    // "28 placeholders replaced, 147 golfers added" for a 24-man list, because it
    // added up what it did to each round - and a trip of seven rounds multiplies
    // every number by seven. An organizer counts people. `perRound` keeps the
    // per-round figures for the rare case the rounds differ.
    var out = { updates: {}, changed: [], skipped: [], people: incoming.length,
                replaced: 0, added: 0, perRound: [],
                leftoverPlaceholders: 0, leftoverRounds: 0, groupsWritten: [] };
    if (!incoming.length) return out;

    (plan && plan.open ? plan.open : []).forEach(function (r) {
        var players = ((r.data || {}).players || []).map(function (p) {
            return Object.assign({}, p);
        });
        var have = {};
        players.forEach(function (p) {
            if (!tripIsPlaceholderName(p.name)) have[tripNameKey(p.name)] = true;
        });
        var slots = [];
        players.forEach(function (p, i) { if (tripIsPlaceholderName(p.name)) slots.push(i); });

        var replaced = 0;
        var added = 0;
        incoming.forEach(function (g) {
            var clean = String(g.name).trim();
            var key = tripNameKey(clean);
            if (have[key]) return;               // already on this round, under a real name
            have[key] = true;
            var seat = {
                name: clean,
                hcp: (g.hcp === undefined || g.hcp === null) ? '' : String(g.hcp).trim(),
                team: 'Team 1', squad: 'red', playingForMoney: true
            };
            if (g.flight) seat.flight = g.flight;
            if (slots.length) {
                var at = slots.shift();
                // THE ID STAYS WITH THE SEAT. A fresh id here would orphan
                // anything already pointing at that slot.
                seat.id = players[at].id;
                players[at] = seat;
                replaced++;
            } else {
                seat.id = tripNextPlayerId(players);
                players.push(seat);
                added++;
            }
        });

        if (!replaced && !added) { out.skipped.push(r.label); return; }
        out.updates['events/' + r.code + '/players'] = players;
        out.changed.push(r.label);
        out.perRound.push({ label: r.label, replaced: replaced, added: added });
        // PEOPLE: the largest figure any one round saw, not the sum over rounds.
        // On the normal trip every round is the same list, so these ARE the
        // per-person counts; where rounds differ, the note says so.
        if (replaced > out.replaced) out.replaced = replaced;
        if (added > out.added) out.added = added;
        if (slots.length) {
            out.leftoverRounds++;
            if (slots.length > out.leftoverPlaceholders) out.leftoverPlaceholders = slots.length;
        }

        // GROUPS FROM THE PASTE, ONLY WHEN THEY CAN TILE THE ROSTER EXACTLY.
        // Group sizes are POSITIONAL, so writing the pasted runs over a roster
        // that still holds leftover placeholders or golfers who were already
        // there would put somebody in the wrong group - and a group is who sees
        // which wagers. When they cannot tile it, nothing is written and the
        // round keeps the automatic sizes, which is the state it was already in.
        var tiles = groups.length > 1 && !slots.length
            && groups.reduce(function (a, b) { return a + b; }, 0) === players.length;
        if (tiles) {
            var overrides = {};
            groups.forEach(function (size, i) { overrides[i] = size; });
            out.updates['events/' + r.code + '/groupSizeOverrides'] = overrides;
            out.groupsWritten.push(r.label);
        }
    });

    if (o.note !== false) out.note = tripRosterPasteNote(plan, out, incoming, groups);
    return out;
}

// WHAT THE REVIEW SCREEN SAYS BEFORE ANYTHING IS WRITTEN. Counts, not adjectives,
// and the rounds it will not touch by name.
function tripRosterPasteNote(plan, result, incoming, groups) {
    var p = plan || { open: [], closed: [], total: 0 };
    var lines = [];
    var n = (incoming || []).length;
    var withHcp = (incoming || []).filter(function (g) { return String(g.hcp || '').trim() !== ''; }).length;
    lines.push(n + ' golfer' + (n === 1 ? '' : 's') + ' pasted, ' + withHcp + ' with a handicap'
        + ((groups || []).length > 1 ? ', ' + groups.length + ' groups as pasted' : ''));
    if (!p.open.length) {
        lines.push('Every round in this trip has scores, so nothing will change — a round with scores keeps the roster it was played with.');
        return lines.join('\n');
    }
    var same = (result.perRound || []).every(function (r) {
        return r.replaced === result.replaced && r.added === result.added;
    });
    lines.push('Will update ' + result.changed.length + ' of ' + p.total + ' round'
        + (p.total === 1 ? '' : 's')
        + (same
            ? ': each gets these ' + n + ' golfer' + (n === 1 ? '' : 's') + ' \u2014 '
              + result.replaced + ' into placeholder slot' + (result.replaced === 1 ? '' : 's')
              + ', ' + result.added + ' added.'
            : ': ' + (result.perRound || []).map(function (r) {
                  return r.label + ' (' + r.replaced + ' replaced, ' + r.added + ' added)';
              }).join(', ') + '.'));
    if (result.leftoverPlaceholders) {
        lines.push(result.leftoverPlaceholders + ' placeholder'
            + (result.leftoverPlaceholders === 1 ? '' : 's') + ' left over on '
            + result.leftoverRounds + ' round' + (result.leftoverRounds === 1 ? '' : 's')
            + ' — the pasted list is shorter than the round. Remove them, or paste the rest.');
    }
    if ((groups || []).length > 1 && !result.groupsWritten.length) {
        lines.push('Groups are left as they are: the pasted groups do not fit this roster exactly, and a group decides who sees which bets.');
    }
    if (p.closed.length) {
        lines.push('Untouched (already has scores): '
            + p.closed.map(function (r) { return r.label; }).join(', ') + '.');
    }
    return lines.join('\n');
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
        tripOpenRosterNames, tripIsPlaceholderName, tripRosterPasteUpdates, tripRosterPasteNote,
        tripRoundWhen, tripRoundPickerLabel, tripRoundPickerRows,
        tripGroupRows, tripIdentityDigest, tripPlaceholderNote
    };
}
