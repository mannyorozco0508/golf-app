// ============================================================================
// MONEY POOL — the whole-round prize pot
//
// A round-wide pot, separate from Group Action: every participant pays one
// buy-in, and the pot is allocated across up to three prize buckets:
//
//   KP          fixed amount, split equally across the chosen KP holes
//   NET FINISH  fixed amount, paid to the top net finishers by percentage
//   SKINS       fixed amount OR the remainder of the pot, paid by skins won
//
// NOTHING HERE INVENTS GOLF MATH. Skins winners come from the settlement
// engine's own computeSkinsCarryOverForSettle / computeSkinsVoidForSettle -
// the functions every skins dollar in the app already trusts. Net scoring is
// getStrokes/parseHcp - the same handicap math the leaderboard uses. KP
// winners are read from data.kpWinners, the storage shape the app has always
// used. This file only decides WHO GETS HOW MUCH OF A FIXED POT.
//
// THE ZERO-SUM RULE, stated once:
//   sum(buy-ins) === sum(prizes paid) + sum(refunds), to the cent, always.
// Money with no winner - an unclaimed KP, an unwon skins pot, a bucket on a
// round with no qualifying scores - is REFUNDED equally to the participants,
// never silently absorbed. Every path below either pays a named winner or
// refunds the field; there is no third destination for a dollar.
//
// ALL ARITHMETIC IS IN INTEGER CENTS. Percent splits and equal shares produce
// fractions; cents make every division auditable and make the zero-sum check
// exact instead of within-epsilon. Leftover cents from a split go to the
// earlier-sorted winners, one cent each, deterministically.
// ============================================================================

// ---------------------------------------------------------------------------
// CONFIG SHAPE (data.moneyPool)
//
//   {
//     enabled: true,
//     buyIn: 40,                          // dollars per participant
//     participantIds: ['101','102',...],  // optional; default = everyone playing for money
//     kp:    { amount: 100, holes: [4, 14] },            // optional bucket
//     net:   { amount: 100, places: [50, 30, 20] },      // optional; percents, sum 100
//     skins: { mode: 'remainder'|'fixed'|'none',         // optional bucket
//              amount: 280,               // when mode==='fixed'
//              scoring: 'net'|'gross',
//              carryOver: true }
//   }
//
// Amounts are DOLLARS in storage (what the organizer typed); the engine works
// in cents internally. 'remainder' is only offered on skins, and at most one
// bucket may be the remainder by construction.
// ---------------------------------------------------------------------------

function moneyPoolParticipants(data) {
    const pool = data.moneyPool || {};
    const players = data.players || [];
    if (Array.isArray(pool.participantIds) && pool.participantIds.length > 0) {
        const wanted = pool.participantIds.map(String);
        return players.filter(p => wanted.indexOf(String(p.id)) !== -1);
    }
    return players.filter(p => p.playingForMoney !== false);
}

// CUSTOM vs PRESET net payouts. One predicate, used by validation, settlement and
// the setup screen, so all three agree on what a config means.
function isCustomNetPayout(net) {
    return !!(net && net.payoutMode === 'custom' && Array.isArray(net.amounts));
}

// The net bucket's total, in dollars. For custom payouts it is the SUM OF THE
// PLACES - derived, never stored - so $40 + $30 can never drift from "$70".
function moneyPoolNetTotal(net) {
    if (!net) return 0;
    if (isCustomNetPayout(net)) {
        return net.amounts.map(Number).filter(a => isFinite(a) && a > 0).reduce((a, b) => a + b, 0);
    }
    return Number(net.amount) || 0;
}

// CENTS PER PLACE - the one list the tie logic walks.
//
// Preset percentages become cents by cumulative-floor differences (the same
// telescoping rule the skins bucket uses), so the places always sum to exactly
// the bucket and never to 100.01% of it. Because consecutive differences
// telescope, summing these per-place figures across a tied span gives precisely
// the span total the percentage code produced before this change - which is why
// every existing preset round settles to the same cent.
function moneyPoolNetPlaceCents(net) {
    if (!net) return [];
    if (isCustomNetPayout(net)) {
        return net.amounts.map(Number).map(a => (isFinite(a) && a > 0) ? Math.round(a * 100) : 0)
            .filter(c => c > 0);
    }
    const amountCents = Math.round((Number(net.amount) || 0) * 100);
    const places = (net.places || []).map(Number);
    const out = [];
    let cumPct = 0, prevFloor = 0;
    places.forEach(pct => {
        cumPct += pct;
        const cumFloor = Math.floor(amountCents * cumPct / 100);
        out.push(cumFloor - prevFloor);
        prevFloor = cumFloor;
    });
    return out;
}

// Validation is its own function so the SETUP UI can reject a bad pot before it
// is ever saved, with the same rules settlement enforces. Returns { valid,
// errors[], totalPool, fixedAllocated, remainder } - dollars, for display.
function validateMoneyPool(data, courseData) {
    const pool = data.moneyPool;
    const errors = [];
    if (!pool || pool.enabled === false) return { valid: false, errors: ['No money pool configured.'] };

    const participants = moneyPoolParticipants(data);
    const buyIn = Number(pool.buyIn) || 0;
    if (buyIn <= 0) errors.push('Buy-in must be more than $0.');
    if (participants.length < 2) errors.push('A money pool needs at least two golfers in it.');

    const totalPool = buyIn * participants.length;
    let fixed = 0;

    const kp = pool.kp;
    if (kp && (Number(kp.amount) || 0) > 0) {
        const holes = Array.isArray(kp.holes) ? kp.holes : [];
        if (holes.length === 0) errors.push('KP has money on it but no KP holes chosen.');
        const courseHoles = (courseData || []).map(h => parseInt(h.hole, 10));
        holes.forEach(h => {
            if (courseHoles.length && courseHoles.indexOf(parseInt(h, 10)) === -1)
                errors.push(`KP hole ${h} is not on this course.`);
        });
        if (new Set(holes.map(Number)).size !== holes.length) errors.push('The same KP hole is listed twice.');
        fixed += Number(kp.amount);
    }

    // NET FINISH accepts either shape:
    //   PRESET  places: [50,30,20]  percentages of net.amount (must total 100)
    //   CUSTOM  payoutMode:'custom', amounts: [40,30]  exact dollars per place
    // Custom exists because golfers say "forty and thirty", not "57.14% and
    // 42.86% of seventy". Its total is DERIVED from the amounts - one source of
    // truth, never a stored $70 that could disagree with its own places.
    const net = pool.net;
    const netTotal = moneyPoolNetTotal(net);
    // CUSTOM SHAPE IS CHECKED EVEN WHEN THE TOTAL IS $0. moneyPoolNetTotal() sums
    // only positive entries, so a config of nothing but "-5" totals zero and would
    // otherwise skip the block entirely: no error shown, and the organizer's net
    // prize silently disappearing. A bad number gets named either way.
    if (isCustomNetPayout(net)) {
        const raw = net.amounts;
        const bad = raw.filter(a => a !== '' && a !== null && a !== undefined
            && (!isFinite(Number(a)) || Number(a) < 0));
        if (bad.length) errors.push('Every net payout must be $0 or more.');
        else if (netTotal <= 0) errors.push('Enter at least one net payout amount.');
    }
    if (net && netTotal > 0) {
        if (!isCustomNetPayout(net)) {
            const places = Array.isArray(net.places) ? net.places.map(Number) : [];
            if (places.length === 0) errors.push('Net prize has money on it but no paid places.');
            const pctSum = places.reduce((a, b) => a + b, 0);
            if (places.length && Math.abs(pctSum - 100) > 0.001)
                errors.push(`Net payout percentages must total 100% (currently ${pctSum}%).`);
            if (places.some(p => p <= 0)) errors.push('Every paid net place needs a positive percentage.');
        }
        fixed += netTotal;
    }

    const skins = pool.skins || { mode: 'none' };
    if (skins.mode === 'fixed') {
        if ((Number(skins.amount) || 0) <= 0) errors.push('Fixed skins allocation must be more than $0.');
        else fixed += Number(skins.amount);
    }

    // THE HARD INVARIANT: allocated money may never exceed the pot.
    if (fixed > totalPool + 0.001) {
        errors.push(`$${(fixed - totalPool).toFixed(0)} over budget — the pot is $${totalPool.toFixed(0)} but $${fixed.toFixed(0)} is allocated.`);
    }

    // With no remainder bucket, every dollar must still have a destination.
    const remainder = totalPool - fixed;
    if (skins.mode !== 'remainder' && remainder > 0.001) {
        errors.push(`$${remainder.toFixed(0)} of the pot is unallocated — add it to a bucket or set skins to take the remainder.`);
    }

    return { valid: errors.length === 0, errors, totalPool, fixedAllocated: fixed,
             remainder: skins.mode === 'remainder' ? Math.max(0, remainder) : 0 };
}

// Splits `cents` across `n` recipients as evenly as cents allow: the first
// (cents % n) shares are one cent larger. Deterministic, exact.
function splitCentsEvenly(cents, n) {
    if (n <= 0) return [];
    const base = Math.floor(cents / n);
    const extra = cents - base * n;
    const out = [];
    for (let i = 0; i < n; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
}

// ---------------------------------------------------------------------------
// WHOLE-DOLLAR SETTLEMENT
//
// WHY THIS EXISTS
//
// Every bucket above works in integer cents, which makes the zero-sum identity
// exact and auditable. It also means a $100 bucket shared three ways settles at
// $33.34 / $33.33 / $33.33. Nobody standing in a car park settles a golf bet in
// cents, and worse, a cent-accurate engine forces every downstream surface to
// round for display - at which point the Receipt, Final Results and Who Pays Who
// can each round differently and stop agreeing about what a golfer is owed.
//
// So a whole-dollar round allocates the ACTUAL BUCKET in whole dollars, once,
// inside the engine. Those integers are the canonical answer. Nothing downstream
// rounds anything; it consumes what the engine allocated.
//
// THE RULE: LARGEST REMAINDER, STABLE ORDER
//
//   1. exact_i   = bucket * weight_i / totalWeight
//   2. base_i    = floor(exact_i)
//   3. leftover  = bucket - sum(base)          // always an integer, 0 <= leftover < n
//   4. the leftover dollars go one each to the entries with the largest
//      fractional part; ties broken by POSITION, lowest index first.
//
// Step 4 is the whole determinism guarantee. Position means the caller's own
// order, which for players is roster order - the order they appear in
// data.players, the same order the setup screen wrote and the scorecard shows.
// Roster order is used rather than alphabetical because it is the product's
// existing stable ordering; sorting by name would make the extra dollar move if
// somebody fixed a typo in a golfer's name.
//
// Conservation is structural: sum(base) + leftover === bucket by construction,
// so no allocation can create or destroy a dollar regardless of the weights.
//
//   allocateWholeDollars(100, [1,1,1])  -> [34, 33, 33]
//   allocateWholeDollars(70,  [1,1,1])  -> [24, 23, 23]
//   allocateWholeDollars(25,  [1,1])    -> [13, 12]
//   allocateWholeDollars(310, [1,1,1,1,1,1,1,1,1]) -> four 35s then five 34s
//
// LEGACY ROUNDS NEVER REACH THIS. See isWholeDollarRound().
// ---------------------------------------------------------------------------

function allocateWholeDollars(totalDollars, weights) {
    const n = (weights || []).length;
    if (n === 0) return [];
    const total = Math.round(Number(totalDollars) || 0);
    const sumW = weights.reduce((a, w) => a + (Number(w) || 0), 0);
    if (sumW <= 0) return weights.map(() => 0);

    const rows = weights.map((w, i) => {
        const exact = total * (Number(w) || 0) / sumW;
        const base = Math.floor(exact);
        return { i, base, frac: exact - base };
    });

    let leftover = total - rows.reduce((a, r) => a + r.base, 0);

    // Largest fractional part first; equal fractions resolved by original
    // position, so the same inputs always hand the extra dollar to the same
    // recipient.
    const order = rows.slice().sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
    for (let k = 0; k < order.length && leftover > 0; k++) { order[k].base += 1; leftover -= 1; }

    const out = new Array(n);
    rows.forEach(r => { out[r.i] = r.base; });
    return out;
}

// A round settles in whole dollars only when it says so.
//
// ABSENCE MEANS LEGACY, ALWAYS. Every round saved before this feature has no
// settlementMode field, so it takes the cent path it has always taken and
// settles to exactly the same numbers it did yesterday. That is the entire
// backward-compatibility contract, and it is one line so it cannot rot.
function isWholeDollarRound(data) {
    return !!data && data.settlementMode === 'whole-dollar';
}

// ---------------------------------------------------------------------------
// THE POOL SETTLEMENT.
// Returns null when no pool is configured (legacy rounds by construction), or:
// {
//   valid, errors,
//   totalPoolCents, buyInCents, participants: [{id,name}],
//   kp:    { amountCents, perHoleCents, lines: [{hole, winnerId, winnerName, cents}] , unclaimedCents }
//   net:   { amountCents, standings: [...], lines: [{place, ids:[..], names, pctShare, cents}], unpaidCents }
//   skins: { amountCents, scoring, carryOver, lines: [{hole, winnerId, winnerName, units, cents}],
//            totalUnits, pendingUnits, unwonCents }
//   refund:{ cents, perPlayerCents: {pid: cents}, reasons: [...] }
//   perPlayerCents: { pid: net cents (prizes + refunds - buyIn) }
// }
// ---------------------------------------------------------------------------
function computeMoneyPool(data, courseData, savedScores) {
    const pool = data.moneyPool;
    if (!pool || pool.enabled === false) return null;

    const check = validateMoneyPool(data, courseData);
    const participants = moneyPoolParticipants(data);
    const isIn = id => participants.some(p => String(p.id) === String(id));
    const nameOf = id => { const p = participants.find(x => String(x.id) === String(id)); return p ? p.name : '?'; };

    const buyInCents = Math.round((Number(pool.buyIn) || 0) * 100);
    const totalPoolCents = buyInCents * participants.length;

    const result = {
        valid: check.valid, errors: check.errors,
        totalPoolCents, buyInCents,
        participants: participants.map(p => ({ id: String(p.id), name: p.name })),
        kp: null, net: null, skins: null,
        refund: { cents: 0, perPlayerCents: {}, reasons: [] },
        perPlayerCents: {}
    };
    if (!check.valid) return result;

    const perPlayer = {};
    participants.forEach(p => { perPlayer[String(p.id)] = -buyInCents; });
    const pay = (id, cents) => { perPlayer[String(id)] += cents; };
    let refundCents = 0;
    // KP money nobody has resolved yet. Withheld from every golfer and surfaced so
    // every surface can agree the round is not settled.
    let kpUnresolvedCents = 0;
    const refundReason = t => result.refund.reasons.push(t);

    // Whole-dollar mode allocates each bucket in dollars and stores the result as
    // whole-dollar cents (always a multiple of 100), so every downstream consumer
    // keeps reading the same perPlayerCents shape it always has and simply never
    // sees a fractional dollar. Legacy rounds skip all of it.
    const wholeDollar = isWholeDollarRound(data);
    const D = (dollars) => Math.round(dollars) * 100;

    // ---- KP ---------------------------------------------------------------
    //
    // UNRESOLVED IS NOT A REFUND.
    //
    // This block used to treat a KP hole with no winner as unclaimed and push the
    // money into refundCents. That could not tell "nobody won it" from "nobody
    // entered it" - so a $100 KP bucket nobody had typed in yet came back as $8 and
    // $9 refund lines on twelve golfers' receipts, and the round presented itself as
    // settled. Real money, quietly reassigned, on a screen that looked final.
    //
    // The two are now distinguished by an explicit organizer decision:
    //
    //   kpConfirmed not true          -> UNRESOLVED. Withheld from every player, and
    //                                    every surface must refuse to call the round
    //                                    final until somebody resolves it.
    //   confirmed + winner            -> paid.
    //   confirmed + noWinner: true    -> a legitimate refund. The organizer has said
    //                                    out loud that nobody won this hole. A blank
    //                                    field never means this.
    //   winner not a pool participant -> refund, unchanged. Bragging rights.
    //
    // WHAT THIS DOES TO ZERO-SUM, deliberately: while money is unresolved the player
    // ledger sums to -kpUnresolvedCents rather than 0, because the buy-ins were
    // charged and that share has not been handed out. The invariant that still holds
    // absolutely - and the one worth protecting - is that no money disappears:
    //
    //     prizes + refunds + kpUnresolvedCents === totalPoolCents
    //
    // Confirming the KPs distributes the money and zero-sum returns to 0.
    const kpConf = data.kpConfirmed;
    const kpIsConfirmed = !!(kpConf && kpConf.confirmed === true);
    const kpCfg = pool.kp;
    if (kpCfg && (Number(kpCfg.amount) || 0) > 0) {
        const amountCents = Math.round(Number(kpCfg.amount) * 100);
        const holes = (kpCfg.holes || []).map(Number).sort((a, b) => a - b);
        // $100 across 3 KP holes is $34/$33/$33, not $33.34/$33.33/$33.33. Holes are
        // already sorted, so hole order is the stable order and the extra dollar
        // always lands on the earliest KP hole.
        const shares = wholeDollar
            ? allocateWholeDollars(amountCents / 100, holes.map(() => 1)).map(D)
            : splitCentsEvenly(amountCents, holes.length);
        const kpWinners = data.kpWinners || {};
        const kpNoWinner = (data.kpNoWinner || {});
        const lines = [];
        let unclaimed = 0;      // legitimately nobody's - refunds
        let unresolved = 0;     // nobody has said yet - withheld
        holes.forEach((h, i) => {
            const wid = kpWinners['h' + h];
            const declaredNoWinner = kpNoWinner['h' + h] === true;

            // Only a POOL PARTICIPANT can take pool money. A non-participant on the
            // sticks gets bragging rights; their KP share refunds to the field.
            if (kpIsConfirmed && wid && isIn(wid)) {
                pay(wid, shares[i]);
                lines.push({ hole: h, winnerId: String(wid), winnerName: nameOf(wid),
                             cents: shares[i], state: 'paid' });
            } else if (kpIsConfirmed && (declaredNoWinner || (wid && !isIn(wid)))) {
                // Confirmed AND either the organizer said outright that nobody won it,
                // or the winner is not in the pool. A BLANK hole never lands here:
                // silence is not a decision, so it stays unresolved even on a round
                // somebody marked confirmed. Confirmation is refused upstream while a
                // hole is blank, and this is the defensive half of that rule.
                unclaimed += shares[i];
                lines.push({ hole: h, winnerId: null, winnerName: null,
                             cents: shares[i], state: 'refunded' });
            } else {
                // Nobody has resolved this hole. The money stays where it is.
                unresolved += shares[i];
                lines.push({ hole: h, winnerId: wid ? String(wid) : null,
                             winnerName: wid ? nameOf(wid) : null,
                             cents: shares[i], state: 'unresolved' });
            }
        });
        if (unclaimed > 0) { refundCents += unclaimed; refundReason('Unclaimed KP money refunded to the field.'); }
        kpUnresolvedCents = unresolved;
        result.kp = { amountCents, perHoleCents: shares, lines,
                      unclaimedCents: unclaimed, unresolvedCents: unresolved,
                      confirmed: kpIsConfirmed };
    }

    // ---- NET FINISH --------------------------------------------------------
    const netCfg = pool.net;
    if (netCfg && moneyPoolNetTotal(netCfg) > 0) {
        // PLACE AMOUNTS THEMSELVES MUST BE WHOLE DOLLARS.
        //
        // Allocating only the TIED groups was not enough, and a Receipt integration
        // test is what caught it: $70 split 57.142857% / 42.857143% comes out of the
        // percentage math as $39.99 / $30.01, and with no tie there was nothing to
        // re-split, so those cents printed straight onto the Receipt.
        //
        // In whole-dollar mode the percentages become WEIGHTS and the allocator
        // divides the bucket directly, which gives the $40 / $30 the organizer typed.
        // A custom-amount payout is already whole dollars by construction and is
        // passed through the same allocator so the two paths cannot drift.
        const placeCents = wholeDollar
            ? allocateWholeDollars(
                  moneyPoolNetTotal(netCfg),
                  isCustomNetPayout(netCfg)
                      ? netCfg.amounts.map(Number).filter(a => isFinite(a) && a > 0)
                      : (netCfg.places || []).map(Number)
              ).map(D)
            : moneyPoolNetPlaceCents(netCfg);
        const amountCents = placeCents.reduce((a, b) => a + b, 0);
        // Net totals over holes actually scored - the SAME formula the leaderboard
        // uses, via the same canonical helpers. No new handicap math.
        const standings = participants.map(p => {
            let net = 0, played = 0;
            (courseData || []).forEach(h => {
                const v = savedScores[`p${p.id}_h${h.hole}`];
                if (v && v > 0) {
                    net += parseInt(v, 10) - getStrokes(h.hcpIndex, parseHcp(p.hcp));
                    played++;
                }
            });
            return { id: String(p.id), name: p.name, net, played };
        }).filter(s => s.played > 0)
          .sort((a, b) => a.net - b.net || a.name.localeCompare(b.name));

        const lines = [];
        let paid = 0;
        if (standings.length > 0) {
            // TIES CONSUME THE PLACES THEY OCCUPY, then split the combined money.
            //
            // The wording here used to say a 50/30/20 tie for 1st "shares 80%
            // equally and 3rd place still pays 20%". That describes the same
            // behaviour the code performs, but it reads as though 2nd place were
            // simply skipped rather than CONSUMED - and the two golfers tied for
            // 1st occupy 1st AND 2nd, which is why they share $80 and why the
            // next golfer is 3rd rather than 2nd. Left as it was, the next person
            // to touch this would have had two plausible readings to choose from.
            let place = 1;
            let i = 0;
            while (i < standings.length && place <= placeCents.length) {
                const tied = standings.filter(s => s.net === standings[i].net);
                const span = tied.length;
                // ONE TIE RULE, unchanged: golfers tied for a place consume that
                // place AND the ones below it, and split the combined money. With
                // $40/$30, two tied for 1st take $70 and split it $35 each; nobody
                // below them is paid, because 2nd place was consumed by the tie.
                let groupCents = 0;
                for (let k = place; k < place + span && k <= placeCents.length; k++) groupCents += placeCents[k - 1];
                if (groupCents > 0) {
                    // POSITIONS ARE CONSUMED FIRST, THEN THE COMBINED AMOUNT IS SPLIT.
                    // Three tied for 1st in a $50/$30/$20 structure consume all three
                    // places, so $100 is split $34/$33/$33 - not three separately
                    // rounded place amounts, which would not sum to $100. `tied` is
                    // in standings order, which is roster order within a tie.
                    const shares = wholeDollar
                        ? allocateWholeDollars(groupCents / 100, tied.map(() => 1)).map(D)
                        : splitCentsEvenly(groupCents, span);
                    tied.forEach((s, j) => pay(s.id, shares[j]));
                    paid += groupCents;
                    lines.push({ place, ids: tied.map(s => s.id), names: tied.map(s => s.name),
                                 net: tied[0].net, cents: groupCents, split: span > 1,
                                 pctShare: amountCents > 0 ? (groupCents / amountCents) * 100 : 0 });
                }
                i += span;
                place += span;
            }
        }
        // Rounding residue from percent math, or a round with nobody scored yet:
        // whatever the bucket did not pay goes back to the field, never nowhere.
        const unpaid = amountCents - paid;
        if (unpaid > 0) {
            refundCents += unpaid;
            if (standings.length === 0) refundReason('Net prize refunded — no scores posted.');
        }
        // placeCents is the ALLOCATED value of each paid position, exposed additively
        // so a receipt can explain a tie without recomputing it. Callers previously had
        // to reach for moneyPoolNetPlaceCents(), which is the legacy percentage path -
        // on a whole-dollar round that returns 3999/3001 where this engine actually
        // allocated 4000/3000, and the receipt printed "$39.99 + $30.01 = $70".
        result.net = { amountCents, standings, lines, placeCents, unpaidCents: unpaid };
    }

    // ---- SKINS -------------------------------------------------------------
    const skCfg = pool.skins || { mode: 'none' };
    if (skCfg.mode === 'remainder' || skCfg.mode === 'fixed') {
        const amountCents = skCfg.mode === 'fixed'
            ? Math.round(Number(skCfg.amount) * 100)
            : totalPoolCents
                - (result.kp ? result.kp.amountCents : 0)
                - (result.net ? result.net.amountCents : 0);
        const scoring = skCfg.scoring === 'gross' ? 'gross' : 'net';
        const carry = skCfg.carryOver !== false;

        // THE CANONICAL SKINS ENGINE decides the winners and the units - the same
        // functions every skins wager in the app settles through. This bucket only
        // divides a fixed pot by those units.
        const calc = carry
            ? computeSkinsCarryOverForSettle(participants, courseData || [], savedScores, scoring)
            : computeSkinsVoidForSettle(participants, courseData || [], savedScores, scoring);
        const totalUnits = calc.skins.reduce((a, s) => a + s.unitsWon, 0) + calc.pendingUnits;
        const lines = [];
        let paid = 0;
        if (totalUnits > 0 && calc.skins.length > 0) {
            // TELESCOPING ALLOCATION. Rounding each line independently overpaid the
            // pot - eighteen Math.rounds summed to $480.08 on a $480 pot, which the
            // reconciliation invariant caught on the first run. Each line instead
            // gets floor(amount * cumulativeUnits / total) minus the previous
            // cumulative floor: the differences telescope, so the lines sum to at
            // most the pot by construction, every cent lands on a real winner, and
            // the pending carry's share falls out as the exact residue.
            if (wholeDollar) {
                // ONE ALLOCATOR OVER THE CANONICAL UNITS. The skins engine above still
                // decides which holes produced units and who owns them - this only
                // divides the actual bucket. Weights include the pending carry as a
                // final entry so an unwon carry keeps its exact share of the pot
                // instead of that share being smeared across the winners; whatever it
                // is allocated falls out as `unwon` below and refunds to the field.
                //
                // Skins are in hole order, so hole order is the stable order and the
                // extra dollars land on the earliest holes.
                const weights = calc.skins.map(s => s.unitsWon);
                if (calc.pendingUnits > 0) weights.push(calc.pendingUnits);
                const alloc = allocateWholeDollars(amountCents / 100, weights);
                calc.skins.forEach((s, idx) => {
                    const cents = D(alloc[idx]);
                    pay(s.player.id, cents);
                    paid += cents;
                    lines.push({ hole: s.hole, winnerId: String(s.player.id), winnerName: s.player.name,
                                 units: s.unitsWon, cents });
                });
            } else {
            let cumUnits = 0, prevFloor = 0;
            calc.skins.forEach(s => {
                cumUnits += s.unitsWon;
                const cumFloor = Math.floor(amountCents * cumUnits / totalUnits);
                const cents = cumFloor - prevFloor;
                prevFloor = cumFloor;
                pay(s.player.id, cents);
                paid += cents;
                lines.push({ hole: s.hole, winnerId: String(s.player.id), winnerName: s.player.name,
                             units: s.unitsWon, cents });
            });
            }
        }
        const unwon = amountCents - paid;
        if (unwon > 0) {
            refundCents += unwon;
            if (calc.skins.length === 0) refundReason('Skins pot refunded — no skins were won.');
            else if (calc.pendingUnits > 0) refundReason(`Carry of ${calc.pendingUnits} unwon skin${calc.pendingUnits === 1 ? '' : 's'} refunded.`);
        }
        result.skins = { amountCents, scoring, carryOver: carry, lines,
                         totalUnits, pendingUnits: calc.pendingUnits, unwonCents: unwon };
    }

    // ---- REFUNDS -----------------------------------------------------------
    // Every unpaid cent comes back to the field equally. This is what makes the
    // zero-sum identity structural rather than hoped-for.
    if (refundCents > 0) {
        // Refunds are allocated the same way as every other bucket, or the last
        // step of a whole-dollar round would reintroduce the cents the first three
        // just removed. `participants` is roster order, so the extra dollar goes to
        // the earliest golfer on the roster, every time.
        //
        // A refund in whole-dollar mode is always a whole number of dollars,
        // because it is what a whole-dollar bucket did not pay out.
        const shares = wholeDollar
            ? allocateWholeDollars(refundCents / 100, participants.map(() => 1)).map(D)
            : splitCentsEvenly(refundCents, participants.length);
        participants.forEach((p, i) => {
            pay(p.id, shares[i]);
            result.refund.perPlayerCents[String(p.id)] = shares[i];
        });
        result.refund.cents = refundCents;
    }

    // Canonical, so no surface has to infer it. `settled` is the single question a
    // UI should ask before printing the word FINAL.
    result.kpUnresolvedCents = kpUnresolvedCents;
    result.settled = kpUnresolvedCents === 0;

    result.perPlayerCents = perPlayer;
    return result;
}

// Dollars view for settlement: { pid: dollars }. The single integration point
// computeCombinedNetTotals uses. Cents→dollars division is exact display math;
// the books balance in cents underneath.
function computeMoneyPoolNetByPlayerId(data, courseData, savedScores) {
    const r = computeMoneyPool(data, courseData, savedScores);
    if (!r || !r.valid) return {};
    const out = {};
    Object.keys(r.perPlayerCents).forEach(pid => { out[pid] = r.perPlayerCents[pid] / 100; });
    return out;
}

// A round is "locked" for pool-rule edits once anyone has scored: changing the
// money mid-round is how arguments start. Creation-time setup is unaffected.
function moneyPoolRulesLocked(data) {
    const scores = data.scores || {};
    return Object.keys(scores).some(k => scores[k] && scores[k] > 0);
}
