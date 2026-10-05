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

// ONE BET'S MONEY, BY THE SAME KEY ITS RESULT USES (2026-10-05).
//
// The redesigned match card prints a dollar line on every ROW - "Reese +$20"
// beside "Front 9 - Reese 2&1" - and the header prints the overall. Both come
// off the receipt settlement-engine.js has already priced: this reads seg.money,
// seg.winner and seg.toSideA and formats them. NOTHING IS SUMMED HERE and
// nothing is decided here; a segment with no winner has no money line at all,
// which is what keeps the mid-round rule - no dollars until a bet is decided -
// true by construction rather than by a caller remembering it.
function sideMatchMoneyByKey(receipt) {
    const out = {};
    if (!receipt || !receipt.segments) return out;
    const nameA = receipt.nameA || 'Side A';
    const nameB = receipt.nameB || 'Side B';
    receipt.segments.forEach(function (seg) {
        if (!seg) return;
        const key = sideMatchResultKey(seg.baseId, seg.pressNum);
        const money = Math.abs(Number(seg.money) || 0);
        if (!seg.winner && money === 0 && seg.result) {
            // A HALVED BET IS NEWS, and it is not the same news as an open one:
            // it has a result and no money. An open bet has neither.
            out[key] = 'Halved';
            return;
        }
        if (!seg.winner || money <= 0) { out[key] = ''; return; }
        out[key] = (seg.toSideA ? nameA : nameB) + ' +$' + smlMoney(money);
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
            // THE REDESIGNED CARD'S HEADER AND ROWS, from the same receipt and
            // only when the bet is over. net/tally are what the header prints
            // (who won, how much, how many bets); money is one line per row.
            net: complete ? sideMatchDecidedNet(receipt) : 0,
            tally: complete ? sideMatchDecidedTally(receipt) : null,
            money: complete ? sideMatchMoneyByKey(receipt) : {},
            nameA: receipt.nameA || '',
            nameB: receipt.nameB || '',
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

// ===========================================================================
// THE LIVE MATCH CARD — ONE BUILDER, EVERY SURFACE (2026-10-05)
//
// THIS WAS TWO COPIES. index.html's scorecard and leaderboard.html each held
// their own buildLiveMatchHtml, and the redesign found them the way this repo
// always finds a duplicate: one was changed, and the parity test that compares
// the two surfaces went red. CLAUDE.md has a rule for exactly this - two entry
// points means one builder - and a card about MONEY is the worst possible place
// to keep two.
//
// The two things that genuinely differ between the pages are passed in:
//   pressHref(wagerId)   where the Press link goes
//   maySee(wagerId)      the leaderboard's group-link filter; the scorecard's
//                        states are already scoped, so it passes nothing
//
// EVERYTHING ELSE IS THE SAME CARD, which is the point: the terms, the sides,
// the answer top right, one row per bet and the presses under it. No figure is
// computed here - sideMatchLiveFinals joins each wager to the receipt
// settlement-engine.js already priced, and the money map is EMPTY until the bet
// is over, which is what makes "no dollars mid-round" true by construction.
// ===========================================================================
function buildLiveMatchCardHtml(data, courseData, savedScores, visibleIds, opts) {
var o = opts || {};
var pressHref = o.pressHref || function () { return ""; };
var maySee = o.maySee || function () { return true; };
    if (typeof buildLiveMatchStates !== 'function') return '';
    // EVERY wager visible to this viewer, not just the round format. A real
    // Nassau is created from Action and lives in sideMatches, so reading only
    // the round format left the supported path invisible on the scorecard.
    const states = (buildLiveMatchStates(data, courseData, savedScores, visibleIds) || [])
    .filter(st => !st.isSideMatch || maySee(st.wagerId));
    if (!states || states.length === 0) return '';
    // FINAL TOTALS, AND THE RECEIPT'S OWN WORDING (Job 2, 2026-10-03).
    //
    // THE DEFECT: with presses, this card said who was up in each segment and
    // the stake beside it, and NEVER said who had won what overall. Manny's
    // GFLBAM round, group 3: four closed rows and no answer. The card reads
    // buildLiveMatchState(), a presenter of the match engine, which knows
    // nothing about money - settlement does, and it is a tab away.
    //
    // NOTHING IS RECOMPUTED HERE. sideMatchLiveFinals() joins each live
    // wager to the receipt settlement-engine.js has already priced, and every
    // figure comes out of sideMatchDecidedNet()/sideMatchDecidedTally(). If
    // this and the Receipt ever disagree it is a bug in a string builder.
    //
    // MID-ROUND IT IS EMPTY, deliberately: a running total on an unfinished
    // match is the defect the Receipt itself had, printing "+$30" with twelve
    // holes unplayed.
    const finals = (typeof sideMatchLiveFinals === 'function')
        ? sideMatchLiveFinals(data, courseData, savedScores, states) : {};
    const finalFor = (st) => finals[(st && st.isSideMatch && st.wagerId) ? st.wagerId : '__main'] || null;
    // A FINISHED BET READS LIKE THE RECEIPT. money-engine's statusText is a
    // scoreboard reading - "Reese 3 UP" - which is right while a match runs
    // and false once it is over: a bet that ended on the 16th is 3&2, and "3
    // UP" is how golfers describe one that went to the 18th. match-engine
    // already sets finalResult and the receipt already carries it; this card
    // simply was not reading it.
    const finalStatus = (fin, baseId, pressNum, fallback) => {
        if (!fin || !fin.complete) return fallback;
        const r = fin.results[sideMatchResultKey(baseId, pressNum)];
        return r || fallback;
    };
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    // The stake is what DEFINES the bet, so it belongs on screen. Amounts only -
    // never a running total, which is settlement's job and is not final mid-round.
    const money = v => (v === undefined || v === null || isNaN(Number(v))) ? '' : '$' + Number(v);

    // ---- THE CARD MANNY APPROVED (2026-10-05) --------------------------
    //
    // DISPLAY ONLY. Every figure on it comes out of the builders that already
    // priced the round - sideMatchDecidedNet, sideMatchDecidedTally,
    // sideMatchMoneyByKey and the receipt's own finalResult. Nothing is
    // summed here and nothing is decided here, so this card and the Receipt
    // cannot disagree about a dollar.
    //
    // THE SHAPE: a terms line in small type ("Nassau - NET - $20 - auto press
    // 2 down"), the two sides in big type with a FINAL tag, and the overall
    // money TOP RIGHT in the largest type on the card with "won 5 of 5 bets"
    // under it. Then one row per bet, and presses indented under the bet they
    // belong to.
    //
    // MID-ROUND THERE ARE NO DOLLARS ANYWHERE ON IT. The top right shows the
    // live status instead ("Reese 2 UP") and the rows show their status. That
    // is the Receipt's rule and it is held by construction: the money map is
    // EMPTY until sideMatchRangeComplete says the bet is over.
    const liveTop = (st) => {
        const segs = (st.segments || []).filter(g => g.started);
        const seg = segs.find(g => !g.closed) || segs[segs.length - 1];
        return seg ? ((st.formatLabel === 'Nassau' ? (seg.label + ' ') : '') + seg.statusText) : '';
    };
    // THE TERMS, FROM THE ROUND'S OWN RECORD. The live state carries the
    // format, the scoring and the stakes; the press RULE is a property of the
    // wager, so it is read off the wager rather than added to money-engine.js
    // - a protected file that should not grow a field for a label.
    const PRESS_WORDS = { '2down': 'auto press 2 down', '1down': 'auto press 1 down',
                          'anytime': 'press any hole', 'none': '' };
    const pressWords = (st) => {
        const sm = (st.isSideMatch && st.wagerId) ? ((data.sideMatches || {})[st.wagerId] || {}) : {};
        const rule = sm.pressRule
            || (st.formatLabel === 'Nassau' ? data.nassauPressRule : data.matchPressRule);
        return PRESS_WORDS[rule] || '';
    };
    const termsLine = (st) => {
        const bits = [st.formatLabel];
        if (st.scoring) bits.push(String(st.scoring).toUpperCase());
        const stake = (st.segments || []).map(g => Number(g.stake) || 0).filter(v => v > 0)[0];
        if (stake) bits.push('$' + stake);
        const pw = pressWords(st);
        if (pw) bits.push(pw);
        return bits.join(' \u00B7 ');
    };

    let html = '<div class="lm-card"><div class="lm-head">'
        + '<span class="lm-title">\u2694\uFE0F LIVE MATCHES &amp; PRESSES</span>'
        + '<span class="lm-sub">' + states.length + ' wager' + (states.length === 1 ? '' : 's')
        + '</span></div>';

    states.forEach((st, i) => {
        const fin = finalFor(st);
        const done = !!(fin && fin.complete);
        if (i > 0) html += '<div class="lm-divider"></div>';
        // THE HEADER BLOCK: terms, the two sides, and the answer top right.
        html += '<div class="lm-top">'
             + '<div class="lm-top-left">'
             + '<div class="lm-terms">' + esc(termsLine(st)) + '</div>'
             + '<div class="lm-sides">' + esc(st.t1Name) + ' v ' + esc(st.t2Name)
             + (done ? '<span class="lm-final-tag">FINAL</span>' : '')
             + '</div></div>'
             + '<div class="lm-top-right">';
        if (done) {
            const t = fin.tally || {};
            const net = Number(fin.net || 0);
            const who = net > 0 ? fin.nameA : (net < 0 ? fin.nameB : '');
            html += '<div class="lm-top-money">'
                 + (net === 0 ? 'All square' : esc(who) + ' +$' + Math.abs(net))
                 + '</div><div class="lm-top-sub">'
                 + esc(net === 0
                    ? ((t.aBets === t.bBets && t.aMoney === t.bMoney && t.aBets > 0)
                        ? ('each won ' + t.aBets + ' bet' + (t.aBets === 1 ? '' : 's') + ' ($' + t.aMoney + ')')
                        : (t.halvedBets === t.total ? 'every bet halved' : 'nobody pays'))
                    : ('won ' + (net > 0 ? t.aBets : t.bBets) + ' of ' + t.total
                       + ' bet' + (t.total === 1 ? '' : 's')))
                 + '</div>';
        } else {
            // NO DOLLARS MID-ROUND. The status is what is true right now.
            html += '<div class="lm-top-live">' + esc(liveTop(st)) + '</div>'
                 + (st.thru ? '<div class="lm-top-sub">thru ' + st.thru + '</div>' : '');
        }
        html += '</div></div>';
        html += '<div class="lm-wager-head lm-wager-tools">'
        // PRESS, WITHOUT A SECOND WRITE PATH.
        //
        // The writer for a side-match press lives in sidematches.html with its
        // amount prompt, permission gate and offline guard. Porting it here would
        // mean two implementations of a money write, and a write-side divergence
        // corrupts data rather than merely displaying it wrong.
        //
        // So this is a LINK, not a button: it carries the golfer to the wager on
        // the Matches tab with the card highlighted, and they press there with the
        // amount in front of them. One tap more, one write path.
        if (st.isSideMatch && st.canPress && st.wagerId) {
            html += '<a class="lm-press-link" href="' + esc(pressHref(st.wagerId))
                 + '">\uD83D\uDD25 Press \u00B7 H' + st.nextPressHole + ' \u203A</a>';
        }
        html += '</div>';

        // ONE ROW PER BET. Left: the bet's name and its result. Right: the
        // money, in the success colour, and ONLY when the bet is decided -
        // fin.money is empty until then, so a mid-round row carries a status
        // and nothing else.
        const moneyFor = (baseId, pressNum) =>
            (fin && fin.money) ? (fin.money[sideMatchResultKey(baseId, pressNum)] || '') : '';
        st.segments.forEach(seg => {
            const m = moneyFor(seg.id, 0);
            html += '<div class="lm-seg' + (seg.closed ? ' lm-closed' : '') + '">'
                 + '<div class="lm-seg-row"><span class="lm-seg-name">' + esc(seg.label.toUpperCase()) + '</span>'
                 + '<span class="lm-seg-status' + (seg.started ? '' : ' lm-quiet') + '">'
                 + esc(finalStatus(fin, seg.id, 0, seg.statusText))
                 // A ROW SAYS WHEN ITS OWN BET IS OVER, which is NOT the same fact
                 // as the header's FINAL tag. A Nassau's Front can be 8&6 - beyond
                 // catching - while the Back is still being played and the MATCH is
                 // not settled: the tag speaks for the match, this speaks for the
                 // bet. Keyed on seg.closed, which is the match engine's own answer.
                 + (seg.closed ? ' \u00B7 FINAL' : '') + '</span>'
                 + '<span class="lm-row-money">' + (m ? esc(m) : money(seg.stake)) + '</span></div>';
            seg.presses.forEach(p => {
                const pm = moneyFor(seg.id, p.pressNum);
                html += '<div class="lm-press' + (p.closed ? ' lm-closed' : '') + '">'
                     // AUTO OR MANUAL STAYS ON THE TAG. The mockup shows one
                     // press and does not distinguish them; two earlier waves
                     // added that word because a caddie could not see an
                     // AUTOMATIC press had been created on their behalf, and
                     // dropping it to match a drawing would take back a fix.
                     + '<span class="lm-press-tag">\u21B3 ' + (p.auto ? 'Auto press' : 'Press')
                     + ' \u00B7 hole ' + p.startHole + '</span>'
                     + '<span class="lm-press-status">' + esc(finalStatus(fin, seg.id, p.pressNum, p.statusText))
                     + (p.closed ? ' \u00B7 FINAL' : '') + '</span>'
                     + '<span class="lm-row-money">' + (pm ? esc(pm) : money(p.stake)) + '</span></div>';
            });
            html += '</div>';
        });
    });
    return html + '</div>';
}
