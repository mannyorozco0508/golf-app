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
