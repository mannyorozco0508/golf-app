// ============================================================================
// SIDE MATCH CARDS: ONE SENTENCE PER BET, AND ONE FOR THE MATCH (Wave 29)
//
// WHY THIS FILE EXISTS. Manny added a Match Play side match after the round and
// the card told him the result of all four bets and none of the money:
//
//     FINAL · Manny 3&2 · P1 (h5) Marty 1&0 · P2 (h11) Manny 3&2
//             · P3 (h15) Marty 1&0     Ledger: $0 | $0
//
// The $0 was right - two bets each, $40 apiece, net nothing - and the card gave
// a group no way to see that. Entering a bet after the round is a core use, so
// "who won what" is the thing the card exists to say.
//
// FOUR SURFACES DRAW THE SAME BET: the Bets tab (skins.html), Final Results
// (stats.html), the Receipt (settlement.html, which the share-sheet PDF prints)
// and the scorecard's My Round card (index.html, through bet-strip.js). CLAUDE.md
// is explicit that two entry points means one builder, and this is four - so the
// sentences live here once and every page reads them.
//
// NOTHING HERE COMPUTES MONEY. Every figure comes from settlement-engine.js
// buildSideMatchReceipts(), which has priced each segment - stake, result,
// winner, money, toSideA - since v141. This file is string assembly over that
// receipt, and side_match_money_lines_test.js asserts it calls no engine.
//
// TWO RULES THAT COST REAL MONEY IF YOU GET THEM WRONG, both measured:
//
//   1. `money` IS NOT "WHAT IT PAID". An unfinished segment reports a non-zero
//      money with a NULL winner - a Match Play bet thru 6 with Reese one up
//      reads money $30, winner null. That is "what this pays if it ends now".
//      settlement.html:1023 has always gated on seg.winner; so does every line
//      here. A card that printed money without that gate would tell a group
//      somebody had won $30 with twelve holes still to play.
//
//   2. `closed` IS NOT "FINISHED". A segment closes when the lead exceeds the
//      holes remaining; at the 18th that is |0| > 0, which is false. So an
//      all-square match that went the distance is NEVER closed, and a card
//      keyed on `closed` called a finished bet LIVE. Finishedness here is
//      EVERY HOLE IN THE BET'S RANGE POSTED BY EVERY PARTICIPANT -
//      sideMatchRangeComplete() below - and the caller must pass it in.
//
// WHICH IS WHY `complete` IS AN ARGUMENT AND NOT A GUESS. A level segment says
// "All square" whether the round is over or still going, and the receipt cannot
// tell those apart on its own. Without completeness this file would have to
// choose between calling a live level match "halved" and calling a finished one
// undecided. It is told instead.
// ============================================================================
'use strict';

// Whole dollars where the figure is whole, cents where there genuinely are cents,
// and THOUSANDS SEPARATORS either way - because this sentence goes on the document
// people settle from, and settlement.html's own fmtWhole() has grouped since v150
// for exactly that reason. A first draft here did not group and dropped the comma
// out of "MATCH NET - Carp +$15,000"; receipt_print_polish_test.js caught it.
// Formatting only: nothing parses this string back, so a comma cannot reach a sum.
function smlMoney(n) {
    const v = Math.abs(Number(n) || 0);
    const group = x => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (Number.isInteger(v)) return group(v);
    const whole = Math.floor(v);
    return group(whole) + v.toFixed(2).slice(String(whole).length);
}

// EVERY HOLE IN THE BET'S RANGE, POSTED BY EVERY PARTICIPANT.
//
// The range is the side match's own - a bet struck on the 6th tee covers H6-18 -
// and it comes from action-model.js sideMatchHoles(), the one place that answers
// that question, rather than a second copy of the same filter here.
function sideMatchRangeComplete(sm, players, courseData, savedScores, opts) {
    if (!sm) return false;
    // A ROUND THE ORGANIZER HAS FINISHED IS OVER FOR EVERY BET IN IT.
    //
    // "Every hole posted" is the right rule for a live card and the wrong one for a
    // settled round. settlement-engine.js computeRoundFinish has said since v148 that
    // a round is finished when it is VERIFIED or every started card is complete - a
    // picked-up ball and a golfer who left after nine are both finished rounds, and
    // the Receipt exists only for those. Measured: without this, a verified round
    // with one golfer through nine printed "MATCH NET - Still playing" on a receipt
    // headed FINAL, and receipt_final_test.js caught it.
    //
    // It costs nothing in accuracy: calculateMatchEngine only scores a hole both
    // sides posted, so a blank hole was never in the money to begin with.
    if (opts && opts.roundFinished) return true;
    const holes = (typeof sideMatchHoles === 'function')
        ? sideMatchHoles(sm, courseData || [])
        : (courseData || []).filter(h => h.hole >= ((sm && sm.startHole) || 1));
    if (!holes || holes.length === 0) return false;
    const ids = [].concat(sm.teamAIds || [], sm.teamBIds || []).map(String);
    const parts = (players || []).filter(p => ids.includes(String(p.id)));
    if (parts.length === 0) return false;
    const scores = savedScores || {};
    return holes.every(h => parts.every(p => {
        const v = scores['p' + p.id + '_h' + h.hole];
        return v !== undefined && v !== null && Number(v) > 0;
    }));
}

// ONE LINE PER BET. `complete` says whether the bet's holes are all in.
//
//   decided and won   "Marty +$20"
//   decided and level "$0 · halved"
//   still live        ""            - never the engine's provisional figure
function sideMatchBetLines(receipt, opts) {
    if (!receipt || !receipt.segments) return [];
    const complete = !!(opts && opts.complete);
    return receipt.segments.map(seg => {
        const money = Math.abs(Number(seg.money) || 0);
        const won = !!seg.winner && money > 0;
        const halved = !seg.winner && money === 0 && complete;
        return {
            label: seg.label,
            startHole: seg.startHole,
            endHole: seg.endHole,
            holesText: 'H' + seg.startHole + (seg.endHole > seg.startHole ? '–' + seg.endHole : ''),
            stake: seg.stake,
            stakeText: '$' + smlMoney(seg.stake),
            result: seg.result,
            winner: won ? seg.winner : null,
            money: won ? money : 0,
            decided: won || halved,
            moneyText: won ? (seg.winner + ' +$' + smlMoney(money)) : (halved ? '$0 · halved' : '')
        };
    });
}

// THE DECIDED MONEY, signed to side A. Winner-gated, so a bet still being played
// contributes nothing. This is the figure bet-strip.js reports on the scorecard,
// and it is equal by construction to the segments the Receipt prints.
function sideMatchDecidedNet(receipt) {
    if (!receipt || !receipt.segments) return 0;
    return receipt.segments.reduce((n, seg) => {
        if (!seg.winner) return n;
        const money = Math.abs(Number(seg.money) || 0);
        return n + (seg.toSideA ? money : -money);
    }, 0);
}

// WHO WON HOW MANY, AND FOR HOW MUCH. The count is what turns a bare $0 into an
// explanation: "each won 2 bets ($40 each)" is the sentence Manny's card owed him.
function sideMatchDecidedTally(receipt) {
    const t = { aBets: 0, aMoney: 0, bBets: 0, bMoney: 0, halvedBets: 0, liveBets: 0, total: 0 };
    if (!receipt || !receipt.segments) return t;
    receipt.segments.forEach(seg => {
        t.total += 1;
        const money = Math.abs(Number(seg.money) || 0);
        if (seg.winner && money > 0) {
            if (seg.toSideA) { t.aBets += 1; t.aMoney += money; }
            else { t.bBets += 1; t.bMoney += money; }
        } else if (money === 0) t.halvedBets += 1;
        else t.liveBets += 1;
    });
    return t;
}

// THE MATCH LINE. Replaces a bare "$0" or a push with no reason, and - just as
// importantly - replaces a NET FIGURE ON AN UNFINISHED BET. settlement.html's
// MATCH NET read `receipt.net`, which includes open segments, so a Match Play
// bet thru 6 printed "MATCH NET · Reese +$30" while twelve holes were unplayed.
// Measured on the fixtures before this wave. Decided money only, here.
function sideMatchNetLine(receipt, opts) {
    if (!receipt) return '';
    const complete = !!(opts && opts.complete);
    const t = sideMatchDecidedTally(receipt);
    const net = sideMatchDecidedNet(receipt);
    const nameA = receipt.nameA || 'Side A';
    const nameB = receipt.nameB || 'Side B';
    const bets = n => n + ' bet' + (n === 1 ? '' : 's');

    if (!complete) {
        const decidedCount = t.aBets + t.bBets + t.halvedBets;
        return decidedCount === 0
            ? 'Still playing — nothing decided yet'
            : 'Still playing — ' + bets(decidedCount) + ' decided, the rest live';
    }

    if (net > 0) {
        return nameA + ' +$' + smlMoney(net) + ' — ' + nameA + ' won ' + bets(t.aBets)
            + ' ($' + smlMoney(t.aMoney) + ')'
            + (t.bBets > 0 ? ', ' + nameB + ' ' + bets(t.bBets) + ' ($' + smlMoney(t.bMoney) + ')' : '');
    }
    if (net < 0) {
        return nameB + ' +$' + smlMoney(-net) + ' — ' + nameB + ' won ' + bets(t.bBets)
            + ' ($' + smlMoney(t.bMoney) + ')'
            + (t.aBets > 0 ? ', ' + nameA + ' ' + bets(t.aBets) + ' ($' + smlMoney(t.aMoney) + ')' : '');
    }
    // LEVEL. The three ways a side match comes to nothing, each said differently,
    // because "$0" is what sent Manny looking for a bug.
    if (t.aBets === 0 && t.bBets === 0) {
        return t.halvedBets === t.total && t.total > 0
            ? 'All square — every bet halved, nobody pays'
            : 'All square — nobody pays';
    }
    if (t.aBets === t.bBets && t.aMoney === t.bMoney) {
        return 'All square — each won ' + bets(t.aBets) + ' ($' + smlMoney(t.aMoney) + ' each)';
    }
    return 'All square — ' + nameA + ' won ' + bets(t.aBets) + ' ($' + smlMoney(t.aMoney) + '), '
        + nameB + ' ' + bets(t.bBets) + ' ($' + smlMoney(t.bMoney) + ')';
}
