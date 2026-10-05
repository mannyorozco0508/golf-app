// ============================================================================
// player-tees.js — A TEE PER GOLFER, AND WHAT IT IS WORTH
//
// WHY THIS IS ITS OWN FILE AND NOT handicap.js. handicap.js is protected: it
// owns every stroke the app gives away, and the rule in HANDOFF.md is that it
// does not move without a per-file approval. Nothing here changes how a stroke
// is computed. It answers a smaller question - WHICH TEE a golfer's numbers are
// computed from, and what the difference between two tees is worth - and hands
// the answer to handicap.js's existing builders, unchanged.
//
// THE WHOLE DESIGN IN ONE LINE: the per-golfer tee changes what is STORED in
// p.hcp, exactly as the round's tee already does. Every engine downstream -
// money, settlement, skins, the card - reads p.hcp through the two readers
// handicap.js owns, and is untouched. That is why a round where everyone plays the same tee is
// byte-identical, money and record alike, and why this wave cannot reach a
// round that was saved before it.
//
// TWO ROUNDS, TWO RULES, because they are two different kinds of number:
//
//   GHIN INDEX. The golfer's Index is converted to a Playing Handicap from the
//   slope and rating of THEIR tee. This is the real thing the USGA formula is
//   for and needs no adjustment of its own: the course handicap already carries
//   the tee inside it, through the slope and the rating-minus-par term that
//   handicap.js owns.
//
//   STROKES AS ENTERED. The number in the box IS the playing handicap, so there
//   is no formula to feed a tee into. By default the tee is RECORDED AND
//   NOTHING ELSE - a group that writes "12" means twelve, whatever tee they are
//   on, and silently moving it would be the app arguing with the people playing.
//   The optional switch applies the official difference between the two tees'
//   COURSE RATINGS, rounded half-up, which is what the Rules of Handicapping say
//   a player moving tees receives.
//
// MISSING DATA FAILS AT ZERO, never at a guess. A tee with no course rating -
// most hand-entered courses - adjusts by nothing at all, and the caller is free
// to say so. A difference is only ever as good as the two ratings behind it.
// ============================================================================
(function (root) {
    'use strict';

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    // Half-up, away from zero, so -0.5 is -1 and 0.5 is 1. The same convention
    // handicap.js uses for every stroke it awards.
    function roundHalfUp(n) {
        return n < 0 ? -Math.round(Math.abs(n)) : Math.round(n);
    }

    // THE SHAPE IS THE ONE THE ROUND ALREADY STORES. readTeeRatingFromDom writes
    // { teeKey, teeName, slope, courseRating, par, allowance } onto the round as
    // teeRating, and a golfer's own tee is the same object. key/name are accepted
    // as well so a caller holding a course-list entry is not a special case.
    function teeId(tee) {
        if (!tee) return '';
        return String(tee.teeKey || tee.key || tee.teeName || tee.name || '');
    }
    function teeName(tee) {
        if (!tee) return '';
        return String(tee.teeName || tee.name || '');
    }

    // The tee a golfer actually plays: their own when they have one, the round's
    // otherwise. An entry carrying a tee with no usable numbers is not a tee.
    function playerTee(entry, roundTee) {
        var t = entry && entry.tee;
        if (t && (num(t.slope) !== null || num(t.courseRating) !== null || teeId(t))) return t;
        return roundTee || null;
    }

    // Does this round have golfers on different tees? The question the scorecard
    // asks before it prints a tee beside anybody's name: on a round where
    // everyone is on the same tee, four identical chips say nothing.
    function hasMixedTees(players, roundTee) {
        var list = players || [];
        var seen = null;
        for (var i = 0; i < list.length; i++) {
            var key = teeId(playerTee(list[i], roundTee));
            if (seen === null) seen = key;
            else if (key !== seen) return true;
        }
        return false;
    }

    // WHAT MOVING TEES IS WORTH, in strokes, on a Strokes-as-entered round.
    // The official difference is between COURSE RATINGS: a golfer from a tee
    // rated 72.4 playing against one rated 70.1 receives the 2.3 shots that
    // separate the two sets of tees, rounded. Returns 0 - never null - when
    // either rating is missing, so a caller can add it unconditionally.
    function teeStrokeAdjustment(playerTeeObj, roundTeeObj) {
        var a = num(playerTeeObj && playerTeeObj.courseRating);
        var b = num(roundTeeObj && roundTeeObj.courseRating);
        if (a === null || b === null) return 0;
        return roundHalfUp(a - b);
    }

    // True when the adjustment is a real number rather than a fallback, so the
    // page can say "no rating for that tee" instead of silently giving nothing.
    function canAdjust(playerTeeObj, roundTeeObj) {
        return num(playerTeeObj && playerTeeObj.courseRating) !== null
            && num(roundTeeObj && roundTeeObj.courseRating) !== null;
    }

    // THE STORED HANDICAP ON A STROKES ROUND. `entered` is what the golfer typed
    // and is returned untouched unless the round asked for the adjustment AND
    // both ratings are there. A blank box stays blank: a golfer with no handicap
    // does not acquire one by standing on a different tee.
    function adjustedStrokesText(entered, playerTeeObj, roundTeeObj, adjustOn) {
        var raw = String(entered === null || entered === undefined ? '' : entered).trim();
        if (raw === '' || !adjustOn) return raw;
        var n = num(raw.charAt(0) === '+' ? '-' + raw.slice(1) : raw);
        if (n === null) return raw;
        var moved = n + teeStrokeAdjustment(playerTeeObj, roundTeeObj);
        if (moved < 0) return '+' + String(Math.abs(moved));
        return String(moved);
    }

    // What a chip beside a name says. Short on purpose: "Blue", not
    // "Men · Blue · 71.2/128".
    function teeLabel(tee) {
        var name = teeName(tee).trim();
        if (!name) return '';
        // The round select's own option text is "Men · Blue"; the chip wants the
        // tee, not the gender it was listed under.
        var parts = name.split('·');
        return parts[parts.length - 1].trim();
    }

    var api = { playerTee: playerTee, hasMixedTees: hasMixedTees, teeId: teeId,
                teeStrokeAdjustment: teeStrokeAdjustment, canAdjust: canAdjust,
                adjustedStrokesText: adjustedStrokesText, teeLabel: teeLabel };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.playerTees = api;
})(typeof window !== 'undefined' ? window : null);
