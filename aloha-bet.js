// ============================================================================
// GolfApp — THE ALOHA BET (SHARED, v215, 2026-09-23)
//
// "Double or nothing on the last hole." Offered by the side that is DOWN money
// in a match, to square the day in one hole. The side that is up has to accept.
//
// WHAT IT ACTUALLY IS, once the framing is stripped off: a ONE-HOLE,
// WINNER-TAKES-THE-STAKE wager on the match's last hole, played alongside the
// match and changing nothing about it. That is worth saying because it makes the
// arithmetic a single line instead of a table of cases:
//
//     deficit D   = |the match's net right now|, the losing side's hole
//     stake S     = D (double or nothing) or D/2 (half)
//     the hole's winner takes S. A halved hole pays nobody.
//
// Check it against the words. Double, losing side wins: they take D, the match
// net was D against them, so the day is SQUARED. Double, leading side wins: they
// take another D, so the deficit DOUBLES. Half, losing side wins: the deficit
// shrinks by D/2. Half, leading side wins: it grows by D/2. Every case in the
// brief falls out of "the winner takes S", and there is no second rule.
//
// THE AMOUNT IS FROZEN AT OFFER TIME and stored on the record. The golfers
// agreed to a number out loud on the tee; that number is what settles. It also
// makes settlement deterministic - the deficit would otherwise move while the
// last hole was being played, and no test could pin it.
//
// NO GOLF MATHEMATICS LIVES HERE, and none is needed. The two inputs come from
// money-engine.js, which is untouched:
//   the match's net      calculateMatchEngine(...).t1TotalMoney - signed, and
//                        positive when side A is up
//   the hole's winner    calculateMatchEngine(...).holeLog[hole].holeWinner,
//                        already computed with the match's own scoring and its
//                        handicap strokes applied
// This file only decides WHETHER an offer is allowed and WHAT an accepted one
// pays. settlement-engine.js calls it through a typeof guard, so the protected
// file gains plumbing and no arithmetic.
//
// WHAT IT NEVER TOUCHES. The Weekly Game, skins, KP, net finish, dots, junk and
// every other pot: an Aloha is money between two sides of one match and is
// booked only against that match. aloha_bet_test.js holds a round with all four
// running and asserts each of their totals is byte-identical with the Aloha
// accepted and declined.
//
// A STROKE SIDE MATCH IS DELIBERATELY EXCLUDED. Its money is two independent
// wagers (a per-hole rate and an overall), settled by calculateHoleBetEngine and
// calculateOverallBetEngine - there is no single "match net" to be down in, and
// no hole-by-hole match winner to settle against. Offering an Aloha there would
// need a different rule and different arithmetic, so it says no and gives that
// reason rather than guessing.
// ============================================================================
(function (root) {
    'use strict';

    // The formats whose money comes from calculateMatchEngine - the ones that
    // have a match net and a hole winner. Exactly the list
    // legacyMainAsSideMatch settles, for the same reason.
    var MATCH_FORMATS = ['match', 'nassau', 'bestball', 'scramble', 'ryder'];

    var MODE_DOUBLE = 'double';
    var MODE_HALF = 'half';

    // Why an offer is not available. The UI says these in words; they are also
    // what the tests assert on, so a refusal cannot be mistaken for another.
    var REASONS = {
        off: 'off',                 // the round does not allow the Aloha
        format: 'format',           // not a match-play wager
        noHole: 'no-hole',          // the match has no holes left to play
        scored: 'scored',           // the last hole already has a score
        square: 'square',           // nobody is down - there is nothing to square
        exists: 'exists',           // one Aloha per match, ever
        ok: 'ok'
    };

    function isOn(data) {
        return !!(data && data.alohaAllowed === true);
    }
    function isMatchFormat(fmt) {
        return MATCH_FORMATS.indexOf(String(fmt || '')) > -1;
    }
    // The LAST HOLE OF THIS MATCH, not hole 18. A nine-hole round ends on 9; a
    // side match struck on the 9th tee ends on the round's last hole too, but a
    // match scoped to a shorter card ends where its card ends. courseData is
    // walked in its own order and the largest hole number is the last one - a
    // back nine is 10..18 and ends on 18.
    function alohaLastHole(matchHoles) {
        var holes = (matchHoles || []).map(function (h) { return Number(h && h.hole); })
            .filter(function (n) { return n > 0; });
        if (holes.length === 0) return null;
        return Math.max.apply(null, holes);
    }
    // ANY score on that hole closes the offer. Not "every participant has one":
    // the bet is struck on the tee, and once one golfer has posted it is too
    // late for the other side to be asked fairly.
    function holeIsUnscored(participantIds, hole, scores) {
        if (!hole) return false;
        var s = scores || {};
        return !(participantIds || []).some(function (id) {
            return s['p' + id + '_h' + hole] > 0;
        });
    }
    // WHERE THE RECORD LIVES. A side match keeps it on itself. THE MAIN GAME keeps
    // it at matchPresses/aloha - the only node under events/<code> that holds the
    // main game's wagers and is writable by a code-holder under
    // database.rules.json - so a synthetic main-game match (settlement-engine.js's
    // legacyMainAsSideMatch, or alohaMainGameMatch below) reads it from `data`.
    // Knowing that HERE is what keeps it out of the protected file.
    function alohaRecordOf(match, data) {
        if (match && match.aloha) return match.aloha;
        if (match && (match.__legacyMain || match.__mainGame)) {
            return (data && data.matchPresses && data.matchPresses.aloha) || null;
        }
        return null;
    }
    // 'A' when side A won the hole, 'B' for side B, null for a halved hole or
    // one with no result. holeWinner is a NAME from the engine's holeLog.
    function alohaSideOfWinner(holeWinner, sideAName, sideBName) {
        var w = String(holeWinner == null ? '' : holeWinner);
        if (w === '' || w === 'Halved') return null;
        if (w === String(sideAName)) return 'A';
        if (w === String(sideBName)) return 'B';
        return null;
    }

    // WHAT AN OFFER WOULD BE, for one match, right now.
    //
    // input: { data, match, matchHoles, participantIds, matchNet }
    //   matchNet  signed, positive when side A is up (t1TotalMoney)
    // Returns { allowed, reason, offeringSide, leadingSide, deficit, lastHole,
    //           amounts: { double, half } }. offeringSide is the only side that
    //   may offer - the one that is DOWN. Never the leader.
    function alohaOffer(input) {
        var o = input || {};
        var data = o.data || {};
        var match = o.match || null;
        var lastHole = alohaLastHole(o.matchHoles);
        var net = Number(o.matchNet);
        if (!isFinite(net)) net = 0;
        var deficit = Math.abs(net);
        var down = net > 0 ? 'B' : (net < 0 ? 'A' : null);
        var up = net > 0 ? 'A' : (net < 0 ? 'B' : null);
        var out = {
            allowed: false, reason: REASONS.off, offeringSide: down, leadingSide: up,
            deficit: deficit, lastHole: lastHole,
            amounts: { double: deficit, half: deficit / 2 }
        };
        if (!isOn(data)) { out.reason = REASONS.off; return out; }
        if (!match || !isMatchFormat(match.format)) { out.reason = REASONS.format; return out; }
        if (alohaRecordOf(match, data)) { out.reason = REASONS.exists; return out; }
        if (!lastHole) { out.reason = REASONS.noHole; return out; }
        if (!holeIsUnscored(o.participantIds, lastHole, o.scores)) { out.reason = REASONS.scored; return out; }
        // Checked LAST of the refusals, so "all square" is what a level match is
        // told rather than a more generic no.
        if (!down) { out.reason = REASONS.square; return out; }
        out.allowed = true;
        out.reason = REASONS.ok;
        return out;
    }
    // Can THIS side offer? The leader never can, which is the whole point.
    function alohaCanOfferAs(input, side) {
        var o = alohaOffer(input);
        return !!(o.allowed && side && String(side) === o.offeringSide);
    }
    function alohaStakeFor(deficit, mode) {
        var d = Number(deficit);
        if (!isFinite(d) || d <= 0) return 0;
        return String(mode) === MODE_HALF ? d / 2 : d;
    }

    // The record a page writes when the offer is made. Pure - the caller does
    // the writing.
    function alohaOfferRecord(input, side, mode, nowMs) {
        var o = alohaOffer(input);
        if (!o.allowed || String(side) !== o.offeringSide) return null;
        var m = String(mode) === MODE_HALF ? MODE_HALF : MODE_DOUBLE;
        return {
            offeredBySide: o.offeringSide,
            mode: m,
            amount: alohaStakeFor(o.deficit, m),
            hole: o.lastHole,
            status: 'offered',
            offeredAt: Number(nowMs) || 0
        };
    }

    // WHAT AN ACCEPTED ALOHA PAYS, as money TO SIDE A (negative pays side B).
    //
    // Only an ACCEPTED one pays. 'offered' and never answered pays nothing, and
    // so does 'declined' - the brief's "declined or unanswered = no bet" needs
    // no timer, because neither state settles.
    function alohaResult(aloha, winnerSide) {
        var out = { settled: false, toSideA: 0, amount: 0, winnerSide: null, reason: 'none' };
        if (!aloha) { out.reason = 'absent'; return out; }
        if (String(aloha.status) !== 'accepted') { out.reason = String(aloha.status || 'absent'); return out; }
        var amount = Number(aloha.amount);
        if (!isFinite(amount) || amount <= 0) { out.reason = 'no-amount'; return out; }
        out.amount = amount;
        var w = winnerSide === 'A' || winnerSide === 'B' ? winnerSide : null;
        out.winnerSide = w;
        if (!w) { out.reason = 'halved'; out.settled = true; return out; }   // a halved hole pays nobody
        out.settled = true;
        out.reason = 'won';
        out.toSideA = w === 'A' ? amount : -amount;
        return out;
    }

    // THE ONE CALL settlement-engine.js MAKES, and it makes it twice - once for
    // the Receipt's segment and once for the ledger's line - so the two cannot
    // disagree about a number. Everything the protected file gains is plumbing:
    // this function does the deciding, and money-engine.js's calc does the math.
    //
    // calc is calculateMatchEngine's result for THIS match: holeLog for the
    // hole's winner, t1Name/t2Name to say which side that is.
    //
    // THE ROUND-LEVEL GATE IS ENFORCED HERE TOO, not only in the UI that wrote
    // the record. A round with the setting off settles as though the record were
    // not there - because an organizer who turns it off after a bet was struck
    // has said no, and the money must follow that.
    //
    // Returns null when nothing settles: no record, not accepted, the round says
    // no, or the hole has no result yet. A HALVED hole returns a line with
    // toSideA 0, so the Receipt can say "nobody pays" the way a halved press
    // already does, while the ledger - which ignores zero amounts - gains none.
    function alohaSettledForMatch(data, match, calc, matchHoles) {
        if (!isOn(data)) return null;
        var aloha = alohaRecordOf(match, data);
        if (!aloha || String(aloha.status) !== 'accepted') return null;
        if (!match || !isMatchFormat(match.format)) return null;
        var hole = Number(aloha.hole) || alohaLastHole(matchHoles);
        if (!hole) return null;
        var log = (calc && calc.holeLog && calc.holeLog[hole]) || null;
        if (!log) return null;                       // the hole has not been played
        var winnerSide = alohaSideOfWinner(log.holeWinner, calc && calc.t1Name, calc && calc.t2Name);
        var res = alohaResult(aloha, winnerSide);
        if (!res.settled) return null;
        var winnerName = winnerSide === 'A' ? (calc && calc.t1Name) : (winnerSide === 'B' ? (calc && calc.t2Name) : null);
        return {
            toSideA: res.toSideA,
            amount: res.amount,
            hole: hole,
            label: alohaSegmentLabel(aloha),
            winnerName: winnerName || null,
            result: winnerName ? (winnerName + ' won the hole') : 'Halved — nobody pays'
        };
    }

    // THE MAIN GAME AS A MATCH (v216).
    //
    // A DELIBERATE, TESTED DUPLICATION. settlement-engine.js's
    // legacyMainAsSideMatch already turns the main game into this shape, but it
    // lives in a protected file and cannot be exported to a page - so the Matches
    // tab needs its own copy to know who is down and by how much. The rules are
    // identical on purpose: the same format list, the same stake fields, the same
    // Team 1 / Team 2 derivation, the same "no stake or nobody on one side means no
    // match". aloha_bet_test.js asserts the two shapes AGREE on a real round, so a
    // drift between them fails the suite instead of quietly offering a bet the
    // engine will settle differently.
    function alohaMainGameMatch(data) {
        var d = data || {};
        var fmt = String(d.gameFormat || '');
        if (!isMatchFormat(fmt)) return null;
        var stake = fmt === 'nassau' ? Number(d.nassauStake || 0) : Number(d.matchStake || 0);
        if (!(stake > 0)) return null;
        var players = (d.players || []).filter(function (p) { return p && p.playingForMoney !== false; });
        var a = players.filter(function (p) { return String(p.team || 'Team 1') === 'Team 1'; }).map(function (p) { return String(p.id); });
        var b = players.filter(function (p) { return String(p.team || '') === 'Team 2'; }).map(function (p) { return String(p.id); });
        if (a.length === 0 || b.length === 0) return null;
        return {
            __mainGame: true,
            format: fmt,
            scoring: fmt === 'nassau' ? (d.nassauScoring || 'net') : (d.matchScoring || 'net'),
            stake: stake,
            pressRule: fmt === 'nassau' ? (d.nassauPressRule || 'none') : (d.matchPressRule || 'none'),
            presses: d.matchPresses || {},
            teamAIds: a,
            teamBIds: b,
            startHole: 1
        };
    }

    // THE MAIN GAME'S ACCEPTED ALOHA, for the one place its money is booked.
    //
    // settlement-engine.js's ledger books the main game through
    // getRoundGames/computeGameNetByPlayerId, which never sees a side-match shape -
    // which is exactly why v215 shipped a main game whose Receipt moved and whose
    // ledger did not. This does the whole job so the protected file only has to
    // hand over `data`, the card and the scores, and book what comes back.
    //
    // It calls calculateMatchEngine itself, guarded: the same engine, the same
    // arguments the settled side-match path uses, so the hole's winner and the
    // match's net are the engine's own numbers and not a second opinion.
    function alohaSettledForMainGame(data, courseData, savedScores) {
        var d = data || {};
        var match = alohaMainGameMatch(d);
        if (!match) return null;
        if (!alohaRecordOf(match, d)) return null;
        if (typeof calculateMatchEngine !== 'function') return null;
        var idsA = match.teamAIds;
        var players = (d.players || []).filter(function (p) { return p && p.playingForMoney !== false; });
        var virtual = players.map(function (p) {
            return Object.assign({}, p, { team: idsA.indexOf(String(p.id)) > -1 ? 'Team 1' : 'Team 2' });
        });
        var presses = match.presses ? Object.keys(match.presses).map(function (k) { return match.presses[k]; }) : [];
        var calc = null;
        try {
            calc = calculateMatchEngine(virtual, courseData || [], savedScores || {},
                match.scoring, match.format, match.pressRule, match.stake, 0, presses,
                (typeof nassauStakeConfig === 'function' ? nassauStakeConfig(d) : undefined));
        } catch (e) { return null; }
        if (!calc) return null;
        var settled = alohaSettledForMatch(d, match, calc, courseData || []);
        if (!settled) return null;
        return Object.assign({}, settled, { sideAIds: match.teamAIds, sideBIds: match.teamBIds });
    }

    // The Receipt's label for the line, and the one sentence the UI shows.
    function alohaSegmentLabel(aloha) {
        var a = aloha || {};
        return String(a.mode) === MODE_HALF ? 'Aloha (half)' : 'Aloha (double or nothing)';
    }
    var EXPLAINER = 'Double or nothing on the last hole — the side that’s down offers, '
        + 'the side that’s up has to accept.';
    // SAID OUT LOUD, because the app cannot tell who is tapping. There is no
    // per-golfer identity here - only the round code and the group links - so
    // "the side that's up has to accept" is enforced as "a device whose link
    // covers that side", exactly the standard a press already uses. Anyone
    // holding the round's link could tap Accept, and the UI must not imply
    // otherwise.
    var TRUST_NOTE = 'On the group’s word — anyone with this round’s link can tap Accept.';

    var api = {
        MATCH_FORMATS: MATCH_FORMATS,
        MODE_DOUBLE: MODE_DOUBLE,
        MODE_HALF: MODE_HALF,
        ALOHA_REASONS: REASONS,
        ALOHA_EXPLAINER: EXPLAINER,
        ALOHA_TRUST_NOTE: TRUST_NOTE,
        alohaAllowedOnRound: isOn,
        alohaIsMatchFormat: isMatchFormat,
        alohaLastHole: alohaLastHole,
        alohaHoleIsUnscored: holeIsUnscored,
        alohaRecordOf: alohaRecordOf,
        alohaSideOfWinner: alohaSideOfWinner,
        alohaOffer: alohaOffer,
        alohaCanOfferAs: alohaCanOfferAs,
        alohaStakeFor: alohaStakeFor,
        alohaOfferRecord: alohaOfferRecord,
        alohaResult: alohaResult,
        alohaSettledForMatch: alohaSettledForMatch,
        alohaMainGameMatch: alohaMainGameMatch,
        alohaSettledForMainGame: alohaSettledForMainGame,
        alohaSegmentLabel: alohaSegmentLabel
    };
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
