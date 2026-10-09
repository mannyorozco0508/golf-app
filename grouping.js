// ============================================================================
// GolfApp — Grouping (SHARED CORE)
//
// Who is in which foursome. Two small functions, and almost everything that
// scopes a round hangs off them: the ?group=N scorekeeper links, which cards a
// group link may write, which side matches count as cross-group, and how the
// leaderboard splits a 24-golfer club day into rows people can read.
//
// WHY THIS FILE EXISTS
//
// These two functions were duplicated - byte for byte - in admin.html,
// index.html, leaderboard.html and sidematches.html, with no test coverage of
// any kind. Four copies of the rule that decides who may edit whose scores is
// the worst-tested duplication the architecture audit found, and grouping is
// the piece the tournament side of the product will need first.
//
// Before this file was created, all four copies were executed against several
// hundred cases - every field size from 0 to 100, every override shape the UI
// can produce and several it cannot - and proved to agree. This module is that
// agreed definition, not a rewrite of it. See grouping_parity_test.js, which
// was written against the four originals and now guards the four consumers.
//
// NO DEPENDENCIES, NO TOP-LEVEL CODE. Four pages load this at different points
// in their own boot, so it must not reach for anything and must not do anything
// on load. Plain global functions, matching the rest of the codebase.
// ============================================================================

// How many golfers are in each group, in order.
//
// FOURSOMES BY DEFAULT, and the last group takes whatever is left - nine golfers
// are 4/4/1, not 3/3/3. That is deliberate: the group a golfer is in decides
// which scorekeeper link reaches them, and rebalancing would move people between
// links mid-round.
//
// An override is honoured only when it is a positive number, and never beyond
// the golfers actually remaining - so "group 1 has 5" on a 3-golfer field is a
// group of 3 rather than a group of 5 that does not exist. Anything else - zero,
// negative, absent - falls through to the default, which is why a half-filled
// override object is safe to pass.
//
// Every group is guaranteed at least one golfer, which is what keeps the loop
// below terminating.
function computeGroupSizes(playerCount, overrides) {
    overrides = overrides || {};
    let sizes = [];
    let sum = 0;
    let gIdx = 0;
    while (sum < playerCount) {
        let remaining = playerCount - sum;
        let defaultSize = Math.min(4, remaining);
        let ov = overrides[gIdx];
        let sz = (ov !== undefined && ov > 0) ? Math.min(ov, remaining) : defaultSize;
        sizes.push(sz);
        sum += sz;
        gIdx++;
    }
    return sizes;
}

// The same grouping expressed as positions in the player list: group number,
// where that group starts, and how many it holds. Callers slice the round's
// players array with these, so the boundaries must tile the field exactly once -
// no gap, no overlap - or a golfer would appear in two groups or none.
//
// Groups are numbered from 1 because that is what the ?group= links carry.
function computeGroupBoundaries(playerCount, overrides) {
    const sizes = computeGroupSizes(playerCount, overrides);
    let boundaries = [];
    let idx = 0;
    sizes.forEach((size, i) => {
        boundaries.push({ group: i + 1, startIdx: idx, size: size });
        idx += size;
    });
    return boundaries;
}

// WHAT A ?group=N LINK PERMITS, in the one sentence an organizer sees before
// sending it to somebody.
//
// MEASURED, NOT INFERRED. tools/round-share-check.js opens every link the app hands
// out, at every roster size, and counts the score inputs its holder can edit:
//
//   4 golfers, ?group=1    76 inputs, 76 editable - the whole field
//   8 golfers, ?group=1    76 inputs, 76 editable - Golfers 1-4 and nobody else
//   8 golfers, ?group=2    76 inputs, 76 editable - Golfers 5-8 and nobody else
//   9 golfers, ?group=3    19 inputs, 19 editable - the one golfer in that group
//
// So a group link is ALWAYS a scorekeeper link, and never a read-only one: what
// changes above four golfers is not what it permits but WHO IT COVERS. The other
// groups are not locked on that card - they are not on it. A sentence promising
// "read-only" would describe a screen nobody is looking at. (The bare ?game=CODE
// link IS read-only above four golfers, and the setup card that used to hand it out
// said so; that card and that link are both gone from the app's share surfaces.)
//
// ONE DEFINITION because two surfaces show it: admin.html's Round Ready screen and
// sidematches.html's Ryder Cup handoff. If index.html's gate ever moves off
// players.length > 4, the check goes red and this has to catch up.
function groupLinkNoteText(playerCount) {
    const MULTI_GROUP_ABOVE = 4;   // index.html: const isMultiGroupRound = players.length > 4
    return (Number(playerCount) > MULTI_GROUP_ABOVE)
        ? 'Send each group only their own link \u2014 it opens that group\u2019s card '
          + 'and nobody else\u2019s.'
        : 'Scorekeeper link \u2014 send this to whoever is keeping the card.';
}

// Which group each golfer is in, keyed by id: { '101': 1, '102': 1, '105': 2 }.
//
// The same slicing computeGroupBoundaries hands out, folded into a lookup so a
// wager's participants can be checked one id at a time. Ids are keyed as
// strings because the two storage shapes disagree - teamAIds may hold numbers
// or strings depending on which page wrote them - and a lookup that only matched
// one of them would silently hide half the round's matches.
function playerGroupMap(players, overrides) {
    const list = players || [];
    const map = {};
    computeGroupBoundaries(list.length, overrides || {}).forEach(b => {
        for (let i = b.startIdx; i < b.startIdx + b.size; i++) {
            if (list[i]) map[String(list[i].id)] = b.group;
        }
    });
    return map;
}

// WHO MAY SEE A WAGER. One rule, consulted by the Bets tab and the Matches tab,
// so a group can never be shown a match on one page and lose it on the other.
//
//   see(wager) = no ?group= on the link            (the bare link sees everything)
//             || the wager names no participants   (round-wide: everybody's)
//             || some participant is in this group (ours, or shared with us)
//
// DERIVED FROM PARTICIPANTS, NEVER FROM ownerGroup OR scope. Those two fields
// are written by the Action form and by nothing else - an auto-paired slate
// carries neither, and every round saved before they existed carries neither -
// so a rule that read them would blank the Bets tab on exactly the rounds a
// club day produces. teamAIds / teamBIds / participantIds are on every wager
// the app has ever written, and a cross-group match resolves to "mine" for BOTH
// groups in it by construction, which is what a cross-group match should do.
//
// participantIds: the wager's own list (teamAIds + teamBIds for a match, the
//                 participantIds of a field game). Absent or empty means the
//                 wager covers the whole money field.
// lockedGroup:    the group number from ?group=, or null on the bare link.
// groupOf:        playerGroupMap() for the round.
function canLinkSeeWager(participantIds, lockedGroup, groupOf) {
    if (lockedGroup === null || lockedGroup === undefined) return true;
    const ids = (participantIds || []).map(String);
    if (ids.length === 0) return true;
    const map = groupOf || {};
    return ids.some(id => String(map[id]) === String(lockedGroup));
}

// ===========================================================================
// SETTING THE FOURSOMES ON THE DAY (2026-10-08)
//
// THE ROSTER ORDER IS THE GROUPING. computeGroupBoundaries above slices the
// roster into foursomes by POSITION, and admin.html's
// captureCurrentPlayerInputs() reads the player rows in DOM order carrying each
// row's id - so "move this golfer into group 3" is an array operation, and it
// belongs here beside the function that decides what a group is.
//
// IDS RIDE WITH THE GOLFERS, NEVER WITH THE SLOT. A golfer's id is what binds
// their scores to them (player_id_stability_test.js exists for that reason), so
// these functions move ENTRIES and renumber nothing.
// ===========================================================================

// One step, or any step: the entry at `from` ends up at `to`, everything else
// closes up behind it. Out-of-range leaves the list alone rather than wrapping -
// a thumb on the Up arrow of the first golfer should do nothing, not send him
// to the bottom of the sheet.
function rosterMove(list, from, to) {
    var out = (list || []).slice();
    var f = Number(from), t = Number(to);
    if (!(f >= 0 && f < out.length)) return out;
    if (!(t >= 0 && t < out.length)) return out;
    if (f === t) return out;
    var moved = out.splice(f, 1)[0];
    out.splice(t, 0, moved);
    return out;
}

// MOVE TO GROUP N, landing LAST in that group.
//
// Why last rather than first: an organizer filling a foursome taps three names
// in the order they think of them, and "last" makes the result the order they
// tapped. Landing first would reverse it.
//
// A fixed group size means somebody is displaced - that is inherent to a
// position-based grouping and is what the dividers already show: the golfer who
// was last in group N becomes first in group N+1. Nothing is lost.
function rosterMoveToGroup(list, from, group, overrides) {
    var out = (list || []).slice();
    var f = Number(from);
    var g = Number(group);
    if (!(f >= 0 && f < out.length)) return out;
    var bounds = computeGroupBoundaries(out.length, overrides || {});
    var target = null;
    for (var i = 0; i < bounds.length; i++) if (bounds[i].group === g) target = bounds[i];
    if (!target) return out;
    // ALREADY THERE IS A NO-OP, not a reshuffle: tapping a golfer's own group
    // must not move the three people around him.
    if (f >= target.startIdx && f < target.startIdx + target.size) return out;
    // ONE RULE, BOTH DIRECTIONS, and the first version of this was two rules
    // with an off-by-one in the backwards case. Take the golfer out, then insert
    // at the index he should FINISH at: in the shortened list the insertion
    // index and the final index are the same number, whichever side he came
    // from. Moving the last golfer to group 1 lands him at 3; moving the first
    // to group 2 lands him at 7. No direction test needed.
    var last = target.startIdx + target.size - 1;
    var moved = out.splice(f, 1)[0];
    out.splice(last, 0, moved);
    return out;
}
