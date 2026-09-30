// ============================================================================
// THE SIDE MATCHES FROM MANNY'S PHONE, as fixtures.
//
// Wave 29's subject is the CARD, so these rounds exist to put a known set of
// bet results on screen and then read the dollars back. Every expectation in
// side_match_money_lines_test.js is MEASURED from these rounds rather than
// asserted from a design document - see that file's header.
//
// The hole results are expressed as a diff per hole from side A's point of
// view: +1 A wins the hole, -1 B wins it, 0 halved. Handicaps are 0 in the
// first two rounds so net equals gross and the arithmetic is checkable by eye;
// netRound() carries real handicaps because Manny's round was NET and a
// fixture that never exercises a stroke allowance proves nothing about it.
// ============================================================================
'use strict';

const { makePlayers, makeCourseData } = require('./fixtures.js');

// Marty vs Manny, Match Play, NET, $20/match, press 2 down.
// Reproduces the card Manny read: the base and three CHAINED presses - the base
// pressed at H5, that press pressed at H11, that one pressed at H15, because
// match-engine.js lets each segment spawn exactly one press.
const MATCH_DIFFS = [1, 0, 0, 1, -1, 0, 0, 0, 0, -1, 1, 0, 0, 1, 1, 0, -1, -1];

// Manny vs Reese, Nassau, NET, $20, press 2 down - REESE TAKES EVERY BET, which
// is what Manny's screen actually showed (Manny -$100 / Reese +$100). Reese wins
// H1, H10, H17 and H18 and halves the rest; that is what puts a press on the
// TOTAL bet at H11 and a press on the BACK 9 at H18, both numbered "Press 1".
const NASSAU_DIFFS = [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, -1, -1];

// A pair whose every hole is halved: finished, all square, nobody pays.
const HALVED_DIFFS = new Array(18).fill(0);

const CODE = 'SMCARD';

// Scores for ONE pair, from the diffs. A wins a hole with 3, B with 3, halved 4-4.
function pairScores(scores, a, b, diffs, upTo) {
    diffs.forEach((d, i) => {
        const h = i + 1;
        if (upTo && h > upTo) return;
        scores['p' + a.id + '_h' + h] = d > 0 ? 3 : 4;
        scores['p' + b.id + '_h' + h] = d < 0 ? 3 : 4;
    });
    return scores;
}

function baseRound(players, courseData, scores, sideMatches, extra) {
    return Object.assign({
        eventName: 'Side Match Cards', players, courseData, scores,
        gameFormat: 'stroke', matchStake: 0, groupSizeOverrides: {},
        sideMatches
    }, extra || {});
}

// ONE MATCH PLAY BET, finished, net $0 - two bets each, the push Manny asked about.
function matchRound(extra) {
    const [manny, marty] = makePlayers(['Manny Orozco', 'Marty Stone'], [0, 0]);
    const courseData = makeCourseData(18);
    const scores = pairScores({}, manny, marty, MATCH_DIFFS);
    return baseRound([manny, marty], courseData, scores, {
        mm: {
            format: 'match', scoring: 'net', stake: 20, pressRule: '2down',
            teamAIds: [String(manny.id)], teamBIds: [String(marty.id)], createdAt: 1
        }
    }, extra);
}

// ONE NASSAU, finished, REESE +$100. Three bases and two presses, and the two
// presses are the labelling problem: both are "Press 1", of different bets.
function nassauRound(extra) {
    const [manny, reese] = makePlayers(['Manny Orozco', 'Reese Kelly'], [0, 0]);
    const courseData = makeCourseData(18);
    const scores = pairScores({}, manny, reese, NASSAU_DIFFS);
    return baseRound([manny, reese], courseData, scores, {
        mr: {
            format: 'nassau', scoring: 'net', stake: 20, pressRule: '2down',
            teamAIds: [String(manny.id)], teamBIds: [String(reese.id)], createdAt: 1
        }
    }, extra);
}

// NET, WITH REAL HANDICAPS - and its own gross control beside it.
//
// Manny off scratch, Marty off 18. Marty's 18 strokes fall one to a hole, so on
// GROSS Manny wins every hole and on NET every hole is halved. Two side matches
// over the SAME scores, differing only in `scoring`, so the allowance is the only
// thing that can explain the difference between the two cards. A fixture where net
// and gross agree would prove nothing about the allowance at all.
function netRound(extra) {
    const [manny, marty] = makePlayers(['Manny Orozco', 'Marty Stone'], [0, 18]);
    const courseData = makeCourseData(18);
    const scores = {};
    courseData.forEach(h => {
        scores['p' + manny.id + '_h' + h.hole] = 4;
        scores['p' + marty.id + '_h' + h.hole] = 5;
    });
    return baseRound([manny, marty], courseData, scores, {
        netm: {
            format: 'match', scoring: 'net', stake: 20, pressRule: 'none',
            teamAIds: [String(manny.id)], teamBIds: [String(marty.id)], createdAt: 1
        },
        grossm: {
            format: 'match', scoring: 'gross', stake: 20, pressRule: 'none',
            teamAIds: [String(manny.id)], teamBIds: [String(marty.id)], createdAt: 2
        }
    }, extra);
}

// THE CARD ROUND: three bets in the three states a card has to tell apart.
//   mm   finished, two bets each, PUSH
//   rd   thru 6 of 18, UNDECIDED - a card must print no money for it
//   ef   finished and ALL SQUARE - which match-engine never marks `closed`,
//        so a card keyed on `closed` calls a finished bet LIVE
function mixedCardsRound(extra) {
    const [manny, marty, reese, dale, evan, faye] = makePlayers(
        ['Manny Orozco', 'Marty Stone', 'Reese Kelly', 'Dale Ward', 'Evan Pike', 'Faye Lund'],
        [0, 0, 0, 0, 0, 0]);
    const courseData = makeCourseData(18);
    const scores = {};
    pairScores(scores, manny, marty, MATCH_DIFFS);
    pairScores(scores, reese, dale, [1, 0, 0, 0, 0, 0], 6);
    pairScores(scores, evan, faye, HALVED_DIFFS);
    return baseRound([manny, marty, reese, dale, evan, faye], courseData, scores, {
        mm: {
            format: 'match', scoring: 'net', stake: 20, pressRule: '2down',
            teamAIds: [String(manny.id)], teamBIds: [String(marty.id)], createdAt: 1
        },
        rd: {
            format: 'match', scoring: 'net', stake: 30, pressRule: 'none',
            teamAIds: [String(reese.id)], teamBIds: [String(dale.id)], createdAt: 2
        },
        ef: {
            format: 'match', scoring: 'net', stake: 40, pressRule: 'none',
            teamAIds: [String(evan.id)], teamBIds: [String(faye.id)], createdAt: 3
        }
    }, extra);
}

module.exports = {
    CODE, MATCH_DIFFS, NASSAU_DIFFS, HALVED_DIFFS,
    matchRound, nassauRound, netRound, mixedCardsRound
};
