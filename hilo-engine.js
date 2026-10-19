// ============================================================================
// GolfApp — HI-LO, THE 2v2 SIDE BET (016, 2026-10-19)
//
// Manny's spec, Oct 19. Two golfers a side, each playing their own ball. Every
// hole is worth TWO points:
//
//     LOW BALL   1 point  - the side whose BEST score on the hole is lower
//     HIGH BALL  1 point  - the side whose WORSE score on the hole is lower
//
// A tie on a point is a WASH: nobody gets it and nothing carries. The money is
// $ per point - the side behind pays (point difference x stake), split evenly
// between its two golfers, the way every other 2v2 side bet already splits.
//
// THIS FILE OWNS EVERY HI-LO RULE AND ALL OF ITS ARITHMETIC. settlement-engine.js
// calls it through a typeof guard from two additive branches (the ledger line in
// computeCombinedNetTotals and the receipt in buildSideMatchReceipts) and no golf
// maths entered that file - the same arrangement aloha-bet.js has.
//
// NOT THE ROUND-FORMAT HI-LO. settlement-engine.js already has a calculateHiLoEngine
// for a ROUND whose main format is Hi-Lo (half a point per contest, `team` field on
// the roster). That one is untouched and this file does not call it: this is a SIDE
// BET, stored in sideMatches with teamAIds/teamBIds like Match Play and Nassau, and
// its points are whole.
//
// NET. "Net uses the round's handicap strokes per hole": getStrokes(hcpIndex,
// parseHcp(p.hcp)) from handicap.js - the strokes the card gives each golfer on
// each hole, the same allocation the 2v2 Stroke Play side bet and the round-format
// Hi-Lo use. NOT the match-play "off the low man" relative allocation that 2v2
// Match Play / Nassau use (match-engine.js). That is a real choice and it is
// flagged for Manny in the 016 report; it is one line (strokesFor) here.
//
// A HOLE A GOLFER DOES NOT FINISH. The rule every other 2v2 bet in this app uses
// (match-engine.js best ball, calculateOverallBetEngine's side best ball, and the
// round-format Hi-Lo): a hole counts once EACH SIDE has at least one posted
// score, and a side plays it with whoever posted. So a side with one ball on a
// hole plays that ball as both its low ball and its high ball. A side with no
// ball on a hole has not played it, and the hole decides nothing.
//
// PURE. No DOM, no Firebase, no globals written except the exported names. It
// reads getStrokes/parseHcp from handicap.js when they are loaded.
// ============================================================================
(function (root) {
    'use strict';

    var FORMAT = 'hilo';
    var LABEL = 'Hi-Lo';

    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

    function firstName(p) { return String((p && p.name) || '').trim().split(/\s+/)[0]; }

    // Strokes a golfer receives on one hole. Gross: none.
    function strokesFor(p, hole, scoring) {
        if (scoring !== 'net') return 0;
        if (typeof root.getStrokes !== 'function' || typeof root.parseHcp !== 'function') return 0;
        return root.getStrokes(hole.hcpIndex, root.parseHcp(p.hcp));
    }

    // The posted scores of one side on one hole, net or gross, ascending.
    function sideScores(side, hole, scores, scoring) {
        var out = [];
        (side || []).forEach(function (p) {
            var v = scores['p' + p.id + '_h' + hole.hole];
            if (v && Number(v) > 0) out.push(parseInt(v, 10) - strokesFor(p, hole, scoring));
        });
        return out.sort(function (a, b) { return a - b; });
    }

    // THE CALCULATION.
    //
    //   teamA, teamB   player objects ({ id, name, hcp })
    //   holes          the holes this bet covers (sideMatchHoles(sm, courseData))
    //   savedScores    the round's scores
    //   opts           { scoring: 'net'|'gross', stake: $ per point }
    //
    // Returns null when either side is empty. Otherwise:
    //   lowA lowB highA highB   points won on each contest
    //   pointsA pointsB diff    totals, diff = pointsA - pointsB
    //   toSideA                 diff x stake (positive: side A collects)
    //   played                  holes decided so far (each side had a ball)
    //   holesInRange            how many holes the bet covers
    //   complete                every hole in range has been played
    //   holeLog                 { [hole]: { low: 'A'|'B'|null, high: 'A'|'B'|null } }
    function calculateHiLoSideMatch(teamA, teamB, holes, savedScores, opts) {
        var o = opts || {};
        var scoring = o.scoring === 'gross' ? 'gross' : 'net';
        var stake = num(o.stake);
        if (!teamA || !teamB || teamA.length === 0 || teamB.length === 0) return null;
        var scores = savedScores || {};
        var r = {
            lowA: 0, lowB: 0, highA: 0, highB: 0,
            pointsA: 0, pointsB: 0, diff: 0, toSideA: 0,
            played: 0, holesInRange: (holes || []).length, complete: false,
            holeLog: {}, stake: stake, scoring: scoring
        };
        (holes || []).forEach(function (h) {
            var a = sideScores(teamA, h, scores, scoring);
            var b = sideScores(teamB, h, scores, scoring);
            if (a.length === 0 || b.length === 0) return;   // not played by both sides
            r.played += 1;
            var aLow = a[0], bLow = b[0];
            var aHigh = a[a.length - 1], bHigh = b[b.length - 1];
            var low = aLow < bLow ? 'A' : (bLow < aLow ? 'B' : null);
            var high = aHigh < bHigh ? 'A' : (bHigh < aHigh ? 'B' : null);
            if (low === 'A') r.lowA += 1; else if (low === 'B') r.lowB += 1;
            if (high === 'A') r.highA += 1; else if (high === 'B') r.highB += 1;
            r.holeLog[h.hole] = { low: low, high: high };
        });
        r.pointsA = r.lowA + r.highA;
        r.pointsB = r.lowB + r.highB;
        r.diff = r.pointsA - r.pointsB;
        r.toSideA = r.diff * stake;
        r.complete = r.holesInRange > 0 && r.played === r.holesInRange;
        return r;
    }

    // The two sides of a stored side match, from the roster. Ids compare as strings.
    function hiloSides(sm, players) {
        var ids = function (list) { return (list || []).map(String); };
        var a = ids(sm && sm.teamAIds), b = ids(sm && sm.teamBIds);
        var all = players || [];
        return {
            teamA: all.filter(function (p) { return a.indexOf(String(p.id)) > -1; }),
            teamB: all.filter(function (p) { return b.indexOf(String(p.id)) > -1; })
        };
    }

    // ONE STORED WAGER, PRICED. `holes` is already the wager's own range.
    function hiloForSideMatch(sm, teamA, teamB, holes, savedScores) {
        if (!sm || sm.format !== FORMAT) return null;
        return calculateHiLoSideMatch(teamA, teamB, holes, savedScores,
            { scoring: sm.scoring || 'net', stake: sm.stake || 0 });
    }

    function sideName(side, joiner) {
        return (side || []).map(firstName).join(joiner || ' + ');
    }

    // THE LIVE LINE, in Manny's words:
    //     Hi-Lo: Bob + Manny +3 (Low 5-3, High 4-3)
    // The leader is named and their numbers come first. Level reads
    //     Hi-Lo: All square (Low 4-4, High 3-3)
    // with side A's numbers first. Points, never dollars: no money mid-round.
    function hiloLine(calc, nameA, nameB) {
        if (!calc) return '';
        if (calc.played === 0) return LABEL + ': Not started';
        var aLeads = calc.diff >= 0;
        var low = aLeads ? (calc.lowA + '-' + calc.lowB) : (calc.lowB + '-' + calc.lowA);
        var high = aLeads ? (calc.highA + '-' + calc.highB) : (calc.highB + '-' + calc.highA);
        var head = calc.diff === 0 ? 'All square'
            : ((aLeads ? nameA : nameB) + ' +' + Math.abs(calc.diff));
        return LABEL + ': ' + head + ' (Low ' + low + ', High ' + high + ')';
    }

    // THE RECEIPT'S TWO BETS. Low Ball and High Ball are each "points x stake" -
    // the receipt shape settlement.html, the Bets tab and Final Results already
    // read (side-match-lines.js), so no page needs a Hi-Lo special case to print
    // the money. The two segments sum to toSideA by construction.
    //
    // `winner` is set only once every hole in the range has been played - the same
    // "no dollars mid-round" rule every other segment follows. A finished round with
    // a hole a whole side never played is handled where the round's finish is known
    // (sideMatchRangeComplete with roundFinished), exactly as for Match Play.
    function hiloReceiptSegments(calc, nameA, nameB, firstHole, lastHole) {
        if (!calc) return [];
        var seg = function (label, baseId, a, b) {
            var lead = a - b;
            var who = lead > 0 ? nameA : (lead < 0 ? nameB : null);
            return {
                label: label, baseId: baseId, pressNum: 0,
                startHole: firstHole, endHole: lastHole,
                stake: calc.stake,
                result: calc.played === 0 ? 'Not started'
                    : (who ? (who + ' ' + Math.max(a, b) + '-' + Math.min(a, b)) : ('All square ' + a + '-' + b)),
                winner: (calc.complete && who) ? who : null,
                money: Math.abs(lead) * calc.stake,
                toSideA: lead > 0
            };
        };
        return [
            seg('Low Ball', 'LOW', calc.lowA, calc.lowB),
            seg('High Ball', 'HIGH', calc.highA, calc.highB)
        ];
    }

    // THE WHOLE RECEIPT for one Hi-Lo wager, given the base fields
    // buildSideMatchReceipts has already filled in (matchId, names, teams, scoring).
    // Returns a NEW object; the base is not mutated.
    function hiloReceipt(base, sm, teamA, teamB, holes, savedScores, firstHole, lastHole) {
        var calc = hiloForSideMatch(sm, teamA, teamB, holes, savedScores);
        if (!calc) return null;
        var r = {};
        Object.keys(base || {}).forEach(function (k) { r[k] = base[k]; });
        r.format = LABEL;
        r.hilo = calc;
        r.segments = hiloReceiptSegments(calc, r.nameA, r.nameB, firstHole, lastHole);
        r.net = calc.toSideA;
        r.netTo = r.net > 0 ? r.nameA : (r.net < 0 ? r.nameB : null);
        r.netAmount = Math.abs(r.net);
        r.perPlayerA = teamA.length ? r.net / teamA.length : 0;
        r.perPlayerB = teamB.length ? -r.net / teamB.length : 0;
        return r;
    }

    // WHAT EACH GOLFER IS OWED OR OWES, split evenly within a side - the split
    // computeCombinedNetTotals applies to every 2v2 side bet. Zero-sum by
    // construction when both sides are the same size.
    function hiloShares(calc, teamA, teamB) {
        var out = {};
        if (!calc) return out;
        (teamA || []).forEach(function (p) { out[String(p.id)] = calc.toSideA / teamA.length; });
        (teamB || []).forEach(function (p) { out[String(p.id)] = -calc.toSideA / teamB.length; });
        return out;
    }

    // THE SHAPE A SAVED HI-LO MUST HAVE: two golfers a side. The New Action form and
    // anything else that writes one checks this; settlement does not refuse an odd
    // record (a golfer removed from the round leaves a side of one, and that side
    // plays its one ball as both low and high, the same as a hole a partner misses).
    function hiloShapeOk(teamAIds, teamBIds) {
        return (teamAIds || []).length === 2 && (teamBIds || []).length === 2;
    }

    var api = {
        HILO_FORMAT: FORMAT,
        HILO_LABEL: LABEL,
        calculateHiLoSideMatch: calculateHiLoSideMatch,
        hiloSides: hiloSides,
        hiloForSideMatch: hiloForSideMatch,
        hiloSideName: sideName,
        hiloLine: hiloLine,
        hiloReceiptSegments: hiloReceiptSegments,
        hiloReceipt: hiloReceipt,
        hiloShares: hiloShares,
        hiloShapeOk: hiloShapeOk
    };
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
