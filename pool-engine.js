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
    const refundReason = t => result.refund.reasons.push(t);

    // ---- KP ---------------------------------------------------------------
    const kpCfg = pool.kp;
    if (kpCfg && (Number(kpCfg.amount) || 0) > 0) {
        const amountCents = Math.round(Number(kpCfg.amount) * 100);
        const holes = (kpCfg.holes || []).map(Number).sort((a, b) => a - b);
        const shares = splitCentsEvenly(amountCents, holes.length);
        const kpWinners = data.kpWinners || {};
        const lines = [];
        let unclaimed = 0;
        holes.forEach((h, i) => {
            const wid = kpWinners['h' + h];
            // Only a POOL PARTICIPANT can take pool money. A non-participant on the
            // sticks gets bragging rights; their KP share refunds to the field.
            if (wid && isIn(wid)) {
                pay(wid, shares[i]);
                lines.push({ hole: h, winnerId: String(wid), winnerName: nameOf(wid), cents: shares[i] });
            } else {
                unclaimed += shares[i];
                lines.push({ hole: h, winnerId: null, winnerName: null, cents: shares[i] });
            }
        });
        if (unclaimed > 0) { refundCents += unclaimed; refundReason('Unclaimed KP money refunded to the field.'); }
        result.kp = { amountCents, perHoleCents: shares, lines, unclaimedCents: unclaimed };
    }

    // ---- NET FINISH --------------------------------------------------------
    const netCfg = pool.net;
    if (netCfg && moneyPoolNetTotal(netCfg) > 0) {
        const placeCents = moneyPoolNetPlaceCents(netCfg);
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
            // TIES SPLIT THE TIED PLACES' MONEY. Two golfers tied for 1st in a
            // 50/30/20 structure share 80% equally and 3rd place still pays 20% -
            // the standard scoreboard convention, applied in cents.
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
                    const shares = splitCentsEvenly(groupCents, span);
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
        result.net = { amountCents, standings, lines, unpaidCents: unpaid };
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
        const shares = splitCentsEvenly(refundCents, participants.length);
        participants.forEach((p, i) => {
            pay(p.id, shares[i]);
            result.refund.perPlayerCents[String(p.id)] = shares[i];
        });
        result.refund.cents = refundCents;
    }

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
