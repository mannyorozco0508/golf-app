// ============================================================================
// GolfApp — Payouts (SHARED CORE)
//
// ONE primitive: given a set of finishers with competition ranks and a list of
// per-place prize amounts, decide what each finisher is paid.
//
// WHY THIS FILE EXISTS
//
// The rule below was written twice - once as computeTournamentPayouts() in
// tournament-engine.js, and once inline inside trip.html's renderPrizePayouts().
// tournament-engine.js's own comment said it "mirrors Trip Mode's prize-payout
// math exactly", which is an accurate description of a duplicate and not a
// substitute for one. Both products pay places; both split ties the same way;
// and a tie that straddles the last paid position is exactly the case a second
// copy gets wrong six months later.
//
// Before this file was written, both implementations were executed - the real
// ones, including trip.html's through its own render function - across nineteen
// adversarial cases: single winner, two- three- and four-way ties, ties in the
// middle of the paid range, a tie on the last paid place, a tie straddling the
// paid/unpaid boundary, an all-tied field, odd-dollar and cent-level divisions,
// an empty pool, no paid places at all, more finishers than places, fewer
// finishers than places, fractional and negative amounts, ranks that do not
// start at 1, duplicate names, and a twelve-player field with two large ties.
// Zero divergences. This module is that agreed rule, not a rewrite of it.
//
// WHAT IS DELIBERATELY NOT HERE
//
// The money-pool allocators in pool-engine.js - splitCentsEvenly(),
// allocateWholeDollars(), moneyPoolNetPlaceCents(). They look adjacent and are
// not the same primitive: they work in integer cents, allocate by percentage or
// weight, and carry a documented largest-remainder determinism rule that this
// one does not need. They are also not duplicated anywhere. Moving them here
// would be tidiness, and it would drag Consumer settlement into a shared module.
//
// Also not here: presses, Nassau settlement, Stroke side-match settlement, debt
// reconciliation. Those are Consumer settlement workflow and stay there.
//
// NO DEPENDENCIES, NO TOP-LEVEL CODE. Loaded by pages at different points in
// their boot. Plain global functions, matching the rest of the codebase.
// ============================================================================

// What each finisher is paid, given competition ranks and per-place amounts.
//
// entries      [{ rank }, ...]  in finishing order. Anything else on an entry is
//                               carried through untouched, so a caller can keep
//                               its own name/team field.
// spotAmounts  [amount, ...]    index 0 is first place. A finisher outside the
//                               paid places is returned with an amount of 0
//                               rather than omitted, because both products show
//                               the whole field and a missing row reads as a bug.
//
// THE TIE RULE, which is the only part worth arguing about:
//
// Competition ranks mean a tie for 1st occupies positions 1 AND 2, so the next
// finisher is 3rd. A tied group therefore collects the money for every position
// it occupies, and splits it evenly. Two golfers tied for 1st on a 200/120/80
// board take (200+120)/2 = 160 each, and third place still gets 80.
//
// A tie that straddles the last paid position splits only the money that
// actually falls inside the paid range - three golfers tied for 3rd on that same
// board occupy positions 3, 4 and 5, of which only position 3 pays, so they take
// 80/3 each and nothing is invented for positions 4 and 5.
//
// NO ROUNDING HAPPENS HERE. The division is left exact and each product formats
// it its own way - Trip renders through fmtAmt(), Tournament prints its own
// column. Rounding inside this function would silently change what one of them
// displays, and neither product asked for that.
function allocatePlacePayouts(entries, spotAmounts) {
    const list = entries || [];
    const amounts = spotAmounts || [];
    const n = amounts.length;

    // Group by rank, preserving the order finishers arrived in. Object key order
    // is insertion order for these string keys, but the ranks are sorted
    // numerically below rather than relied upon, because a rank of 10 must not
    // sort before a rank of 2.
    const rankGroups = {};
    list.forEach(e => {
        if (!rankGroups[e.rank]) rankGroups[e.rank] = [];
        rankGroups[e.rank].push(e);
    });

    const payouts = [];
    Object.keys(rankGroups).map(Number).sort((a, b) => a - b).forEach(rank => {
        const group = rankGroups[rank];
        // The positions this tied group occupies: its rank, through rank + size - 1.
        const lastPos = rank + group.length - 1;
        let sumForGroup = 0;
        for (let pos = rank; pos <= lastPos; pos++) {
            if (pos >= 1 && pos <= n) sumForGroup += amounts[pos - 1];
        }
        const each = sumForGroup / group.length;
        group.forEach(entry => payouts.push({ entry: entry, rank: rank, amount: each }));
    });

    return payouts;
}
