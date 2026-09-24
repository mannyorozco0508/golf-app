// ============================================================================
// GolfApp — HANDICAP LABELS (SHARED, v212, 2026-09-23)
//
// WHAT A GOLFER READS ABOUT THEIR OWN HANDICAP, and nothing else. Marty's group
// follows GHIN, so the Index -> Course Handicap conversion is the default and
// stays it; what was missing was any way to tell the three numbers apart. A
// board row said "17" and a golfer off 18 had no idea whether that was their
// index, their course handicap, or a typo.
//
// NO ARITHMETIC LIVES HERE. Every number comes from handicap.js - which this
// wave does not touch - or from what the round was saved with:
//   player.handicapIndex     the GHIN Handicap Index, as typed
//   player.courseHandicap    Index x (Slope/113) + (CourseRating - Par), stored
//   player.hcp               the Playing Handicap, the number the nets use
//   player.handicapUnconverted  saved with no usable tee rating
// This file only decides which of them to say, and in how many words.
//
// TWO ENTRY POINTS, ONE BUILDER. The Board row and the Players sheet both want
// the short form, and game.html wants the sentence. This repo has already paid
// for a hand-written copy of a shared rule in each of two pages (action-model.js
// exists because of it), so the label is defined once, here. It is a SEPARATE
// file from handicap.js because handicap.js is protected: money, settlement and
// handicap arithmetic are off-limits by default, and a display wave has no
// business in there.
//
// WHY COMPACT ROUNDS THE COURSE HANDICAP. The stored courseHandicap is a float
// (an 18 index off a 71.2/72 course is 17.2). A board row is one line on a
// phone, so it shows the whole number - formatStoredHandicap, the same rounding
// (.5 up) the Playing Handicap uses. At the 100% allowance this wave ships they
// are the same number; the FULL form, on the expanded card, keeps the exact
// figure and the Playing Handicap beside it so nothing is hidden.
// ============================================================================
(function (root) {
    'use strict';

    var DOT = ' · ';

    // Which basis the round is on. Absent means GHIN: that is what every round
    // saved before this setting existed was already doing, so a legacy round's
    // reading does not change.
    function handicapBasisOf(data) {
        var v = data && data.handicapBasis;
        return (String(v) === 'as-entered') ? 'as-entered' : 'ghin-index';
    }

    function hasIndex(player) {
        if (!player) return false;
        var raw = player.handicapIndex;
        return !(raw === undefined || raw === null || String(raw).trim() === '');
    }

    // "Index 18 · Course 17" - the Board row and the Players sheet. null when
    // this golfer has no Index, and the caller keeps its own "HCP n" line.
    function handicapCompactLabel(player) {
        if (!hasIndex(player)) return null;
        var idx = (typeof formatHandicapLabel === 'function')
            ? formatHandicapLabel(player.handicapIndex) : String(player.handicapIndex);
        // Saved with no usable Slope/Rating/Par: there is no Course Handicap to
        // name, and inventing one would be the worst kind of wrong number.
        if (player.handicapUnconverted) return 'Index ' + idx + DOT + 'no tee rating';
        var course = player.courseHandicap;
        if (typeof course !== 'number' || !isFinite(course)) return 'Index ' + idx;
        var whole = (typeof formatStoredHandicap === 'function') ? formatStoredHandicap(course) : String(Math.round(course));
        return 'Index ' + idx + DOT + 'Course ' + whole;
    }

    // "Index 18 · Course 17.2 · Playing 17" - the expanded card. handicap.js's
    // own label, called rather than copied.
    function handicapFullLabel(player) {
        if (typeof handicapFacingLabel !== 'function') return null;
        return handicapFacingLabel(player);
    }

    // The one sentence a round says about where its handicaps come from. Said
    // ONCE, on the Game tab - never per golfer.
    function handicapBasisSentence(data) {
        var d = data || {};
        if (handicapBasisOf(d) === 'as-entered') {
            return 'Handicaps are used as entered — the number beside each golfer is their Playing Handicap. '
                + 'No tee conversion is applied on this round.';
        }
        var tee = d.teeRating || null;
        var status = (typeof teeRatingStatus === 'function') ? teeRatingStatus(tee) : null;
        if (!status || !status.complete) {
            return (typeof handicapUnconvertedNote === 'function')
                ? handicapUnconvertedNote()
                : 'Each Handicap Index is used as the Playing Handicap.';
        }
        var teeName = (tee && String(tee.teeName || '').trim()) || '';
        var head = teeName ? (teeName + ' tee') : 'The selected tee';
        return head + DOT + 'Slope ' + status.slope + DOT + 'Course Rating ' + status.courseRating
            + DOT + 'Par ' + status.par + '. '
            + 'Course Handicaps are converted from GHIN Handicap Indexes: '
            + 'Index × (Slope / 113) + (Course Rating − Par)'
            + (status.allowance === 100 ? '' : ', then ' + status.allowance + '% allowance')
            + ', rounded (.5 up).';
    }

    // THE LINE BESIDE AN INDEX BOX (v213). The Players sheet's box IS the
    // Handicap Index on a GHIN round, so the line under it says what that index
    // converts to on this round's tee - and it moves as the golfer types.
    //
    // `stored` is the golfer as the record holds them, and it is here for one
    // case only: a golfer SAVED with no tee rating, on a round whose tee is rated
    // NOW (the organizer set it afterwards). Converting their untouched index in
    // the line would promise a Course Handicap the save does not write - the save
    // only rewrites a golfer whose box actually changed - so the line says what
    // is true instead, and what to do about it.
    function handicapBoxNote(boxText, data, stored) {
        var d = data || {};
        if (handicapBasisOf(d) === 'as-entered') return null;
        var text = String(boxText === undefined || boxText === null ? '' : boxText).trim();
        if (text === '') return null;
        // THE BOX IS UNCHANGED AND THIS GOLFER HAS NO COMPLETED CONVERSION - no
        // stored Index at all (a round from before the conversion existed), or one
        // stored without a usable tee rating. Converting the untouched text here
        // would promise a Course Handicap the save does not write: the save only
        // rewrites a golfer whose box actually CHANGED. So say what is true, and
        // what to do about it.
        if (stored) {
            var idxRaw = stored.handicapIndex;
            var hasIdx = !(idxRaw === undefined || idxRaw === null || String(idxRaw).trim() === '');
            var converted = hasIdx && !stored.handicapUnconverted;
            var shownText = String(hasIdx ? idxRaw : (stored.hcp || '')).trim();
            if (!converted && shownText === text) return 'Not yet converted — retype to convert';
        }
        if (typeof convertHandicapIndex !== 'function') return null;
        var conv = convertHandicapIndex(text, d.teeRating || null);
        if (!conv) return null;
        if (conv.reason === 'blank') return null;
        if (!conv.ok) return 'No tee rating — used as entered';
        return 'Course ' + formatCourseLabel(conv.course) + DOT + 'plays ' + conv.playingText;
    }

    // Does this round have anything to say about handicaps at all? A round where
    // nobody has an Index and no tee is rated gets no card and no sentence.
    function handicapBasisWorthSaying(data) {
        var d = data || {};
        if (handicapBasisOf(d) === 'as-entered') return (d.players || []).some(function (p) { return p && String(p.hcp || '').trim() !== ''; });
        if ((d.players || []).some(hasIndex)) return true;
        var status = (typeof teeRatingStatus === 'function') ? teeRatingStatus(d.teeRating || null) : null;
        return !!(status && status.complete);
    }

    var api = {
        handicapBasisOf: handicapBasisOf,
        handicapCompactLabel: handicapCompactLabel,
        handicapFullLabel: handicapFullLabel,
        handicapBasisSentence: handicapBasisSentence,
        handicapBoxNote: handicapBoxNote,
        handicapBasisWorthSaying: handicapBasisWorthSaying
    };
    // Globals, the way every other shared file on these pages is consumed.
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
