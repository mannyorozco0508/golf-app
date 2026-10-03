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

// WHICH BET A PRESS BELONGS TO, AND IN WHAT ORDER (Wave 30).
//
// A Nassau is three wagers, and match-engine.js numbers presses PER BASE - so the
// Total's press and the Back 9's press are both "Press 1". On a card that lists all
// three bases that is two rows with one name, and it cannot be told apart from the
// hole range: the Total's press (H11-18) and a Back 9 press (H11-18) are identical.
// settlement-engine.js now carries baseId on the segment, which is the only thing
// that can answer it.
//
// A ONE-BET MATCH KEEPS ITS NUMBERS. Match Play has a single base and its presses
// CHAIN - base pressed at H5, that press pressed at H11, that one at H15 - so
// "Press 1 (H5) / Press 2 (H11) / Press 3 (H15)" is the true description and
// "Overall press" three times would be worse than what it replaced.
const SML_BASE_ORDER = { F9: 0, B9: 1, '18': 2 };
const SML_BASE_LABEL = { F9: 'Front 9', B9: 'Back 9', '18': 'Total' };

function sideMatchSegmentLabel(seg, multiBase) {
    const base = seg && seg.baseId;
    if (!seg || !(seg.pressNum > 0)) return seg ? seg.label : '';
    if (!multiBase || !SML_BASE_LABEL[base]) {
        return 'Press ' + seg.pressNum + ' (H' + seg.startHole + ')';
    }
    return SML_BASE_LABEL[base] + ' press (H' + seg.startHole + ')';
}

// Base first, then its own presses by start hole; Front 9, Back 9, Total in that
// order. The receipt's own order is engine order - F9, B9, Total, then every press
// in the order it was struck - which put a Back 9 press below the Total it has
// nothing to do with. A segment with no baseId (a stroke bet, an Aloha line) keeps
// its position exactly.
function sideMatchOrderedSegments(receipt) {
    const segs = (receipt && receipt.segments) || [];
    if (!segs.some(s => s && SML_BASE_ORDER[s.baseId] !== undefined)) return segs.slice();
    return segs.map((s, i) => ({ s: s, i: i })).sort((a, b) => {
        const oa = SML_BASE_ORDER[a.s.baseId], ob = SML_BASE_ORDER[b.s.baseId];
        if (oa === undefined || ob === undefined) return a.i - b.i;
        if (oa !== ob) return oa - ob;
        const pa = a.s.pressNum || 0, pb = b.s.pressNum || 0;
        if ((pa === 0) !== (pb === 0)) return pa === 0 ? -1 : 1;
        if (a.s.startHole !== b.s.startHole) return a.s.startHole - b.s.startHole;
        return a.i - b.i;
    }).map(x => x.s);
}

// ONE LINE PER BET. `complete` says whether the bet's holes are all in.
//
//   decided and won   "Marty +$20"
//   decided and level "$0 · halved"
//   still live        ""            - never the engine's provisional figure
function sideMatchBetLines(receipt, opts) {
    if (!receipt || !receipt.segments) return [];
    const complete = !!(opts && opts.complete);
    const bases = {};
    receipt.segments.forEach(s => { if (s && !(s.pressNum > 0) && s.baseId) bases[s.baseId] = 1; });
    const multiBase = Object.keys(bases).length > 1;
    return sideMatchOrderedSegments(receipt).map(seg => {
        const money = Math.abs(Number(seg.money) || 0);
        const won = !!seg.winner && money > 0;
        const halved = !seg.winner && money === 0 && complete;
        return {
            label: sideMatchSegmentLabel(seg, multiBase),
            rawLabel: seg.label,
            baseId: seg.baseId,
            pressNum: seg.pressNum,
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

// ===========================================================================
// THE FINAL TOTAL ON THE LIVE CARD (Job 2, 2026-10-03)
//
// WHY. Manny's GFLBAM round, group 3, iPhone: a match with presses, every bet
// decided, and the LIVE MATCHES & PRESSES card said who was up in each segment
// and the stake beside it - and never said who had won what overall. The card
// reads buildLiveMatchState() in money-engine.js, which is a presenter of the
// match engine and knows nothing about money; settlement does, and it is a tab
// away. So a group looking at four closed rows had to add it up themselves.
//
// NOTHING HERE COMPUTES MONEY, same as the rest of this file: every figure comes
// out of sideMatchDecidedNet() and sideMatchDecidedTally(), which read a receipt
// settlement-engine.js has already priced. If this and the Receipt ever disagree
// it is a bug in one of two string builders, never in two sums.
//
// WHY A SECOND LINE AND NOT sideMatchNetLine(). That one is the Receipt's
// sentence and it is deliberately wordy - "Reese +$100 - Reese won 5 bets
// ($100)" - because the Receipt is the document people settle from. This is one
// bold line at the bottom of a live card on a phone, so it is the same facts in
// the shortest honest form: "Reese +$100 (won 5 of 5 bets)".
//
// MID-ROUND IT IS EMPTY, and that is the point of `complete` being an argument.
// A running total on an unfinished match is the defect settlement.html had: a
// Match Play bet thru 6 printed "MATCH NET - Reese +$30" with twelve holes
// unplayed. An empty string is the correct answer until the bet is over.
function sideMatchFinalTotal(receipt, opts) {
    if (!receipt || !(opts && opts.complete)) return '';
    const t = sideMatchDecidedTally(receipt);
    const net = sideMatchDecidedNet(receipt);
    const nameA = receipt.nameA || 'Side A';
    const nameB = receipt.nameB || 'Side B';
    // "of N" counts EVERY bet in the match, presses included, because that is
    // what a golfer is looking at on the card. When the match is complete there
    // are no live segments left, so the denominator is the rows on screen.
    const won = (n) => '(won ' + n + ' of ' + t.total + ' bet' + (t.total === 1 ? '' : 's') + ')';

    if (net > 0) return nameA + ' +$' + smlMoney(net) + ' ' + won(t.aBets);
    if (net < 0) return nameB + ' +$' + smlMoney(-net) + ' ' + won(t.bBets);

    // LEVEL, AND THE TWO KINDS ARE NOT THE SAME NEWS. Both sides winning $40
    // each is a match where four bets changed hands; every bet halved is a match
    // where none did. A single "All square" for both is what made Manny go
    // looking for a bug in the first place.
    if (t.aBets === 0 && t.bBets === 0) return 'All square — nobody pays';
    return nameA + ' +$' + smlMoney(t.aMoney) + ' · ' + nameB + ' +$' + smlMoney(t.bMoney)
        + ' — All square';
}

// THE RECEIPT'S OWN WORDING FOR EVERY SEGMENT, KEYED SO A LIVE CARD CAN USE IT.
//
// THE DEFECT THIS FIXES. money-engine.js's statusText is a scoreboard reading -
// "Reese 3 UP" - which is right while a match is running and WRONG once it is
// over. A match play bet that ended on the 16th is "3&2": three up with two to
// play, and it cannot be any other number. "3 UP" on a finished bet is how
// golfers describe a match that went to the 18th, so printing it on a bet that
// closed early says something false about where it finished - and the Receipt,
// one tab away, correctly says 3&2 about the same bet.
//
// match-engine.js sets m.finalResult when a segment closes and
// settlement-engine.js puts it on seg.result, so the true sentence already
// exists and the live card simply was not reading it. Keyed by baseId and press
// number, which is the only pair that identifies a segment: a Nassau's Total
// press and its Back 9 press are both "Press 1" and both run H11-18.
function sideMatchResultByKey(receipt) {
    const out = {};
    if (!receipt || !receipt.segments) return out;
    receipt.segments.forEach(function (seg) {
        if (!seg) return;
        const key = String(seg.baseId === undefined || seg.baseId === null ? '' : seg.baseId)
            + '|' + Number(seg.pressNum || 0);
        if (seg.result) out[key] = seg.result;
    });
    return out;
}

function sideMatchResultKey(baseId, pressNum) {
    return String(baseId === undefined || baseId === null ? '' : baseId) + '|' + Number(pressNum || 0);
}

// WHAT THE LIVE CARD NEEDS, FOR EVERY WAGER ON IT, IN ONE CALL.
//
// TWO SURFACES draw LIVE MATCHES & PRESSES - index.html's scorecard and
// leaderboard.html - from the same buildLiveMatchStates(). So the join between a
// live state and its priced receipt lives here once rather than being written
// twice; CLAUDE.md has cost this project a hand-written copy per page before.
//
// Returns a map keyed the way the card is: the wager id for a side match, and
// '__main' for the round's own format, which is what buildSideMatchReceipts
// calls the legacy main wager.
//
//   { complete, total, results }
//
// complete comes from sideMatchRangeComplete(), NOT from seg.closed. A segment
// closes when the lead exceeds the holes left, so at the 18th |0| > 0 is false
// and an all-square match that went the distance is never "closed" - a card
// keyed on that would call a finished bet live. And `roundFinished` is derived
// here from computeRoundFinish() when it is available, so both pages agree
// about a verified round or a group that picked up, without either having to
// ask.
//
// A MISSING ENGINE RETURNS AN EMPTY MAP, so a cached shell without
// settlement-engine.js draws exactly the card it drew before this wave rather
// than throwing inside a renderer.
function sideMatchLiveFinals(data, courseData, savedScores, states, opts) {
    const out = {};
    if (!states || !states.length) return out;
    if (typeof buildSideMatchReceipts !== 'function') return out;
    let receipts = [];
    try { receipts = buildSideMatchReceipts(data, courseData, savedScores) || []; } catch (e) { return out; }
    const byId = {};
    receipts.forEach(r => { if (r && r.matchId) byId[r.matchId] = r; });

    const d = data || {};
    const sideMatches = d.sideMatches || {};
    let roundFinished = !!(opts && opts.roundFinished);
    if (!roundFinished && typeof computeRoundFinish === 'function') {
        try { roundFinished = !!computeRoundFinish(d, courseData, savedScores).finished; } catch (e) { roundFinished = false; }
    }

    states.forEach(st => {
        const matchId = (st && st.isSideMatch && st.wagerId) ? st.wagerId : '__main';
        const receipt = byId[matchId];
        if (!receipt || out[matchId]) return;
        const sm = (st && st.isSideMatch && st.wagerId)
            ? sideMatches[st.wagerId]
            : (typeof legacyMainAsSideMatch === 'function' ? legacyMainAsSideMatch(d) : null);
        const complete = sideMatchRangeComplete(sm, d.players || [], courseData, savedScores,
            { roundFinished: roundFinished });
        out[matchId] = {
            complete: complete,
            total: sideMatchFinalTotal(receipt, { complete: complete }),
            // THE RECEIPT'S WORDING, AND ONLY WHEN THE BET IS OVER. Mid-round the
            // scoreboard reading is the right one - "Reese 3 UP" is what is true
            // while it is being played.
            results: complete ? sideMatchResultByKey(receipt) : {}
        };
    });
    return out;
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
