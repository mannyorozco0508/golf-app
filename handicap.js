// ============================================================================
// GolfApp — Handicap (SHARED CORE)
//
// Every stroke a golfer receives, and every relative-handicap decision a match
// makes, comes from these seven functions. They are the most duplicated code in
// the app: parseHcp and getStrokes exist in five places, the relative family in
// four, and admin.html carries a pair of byte-identical aliases under different
// names. Every copy was proved equivalent - 522 behavioural cases across every
// definition, zero divergences - before this file was written.
//
// ---------------------------------------------------------------------------
// THIS FILE IS ADDITIVE FOR NOW, AND THAT IS DELIBERATE
// ---------------------------------------------------------------------------
//
// money-engine.js still declares the same seven functions. That is a temporary,
// bounded and TESTED duplication, not an oversight: handicap_parity_test.js
// asserts the two are identical in source and in behaviour, and fails the moment
// either moves. It exists because migrating every consumer in one step means
// replacing forty test files in a single commit, and a project that edits code
// by pasting whole files into a browser does not get to take that risk.
//
// The sequence, so nobody has to guess where this is going:
//
//   1. THIS STEP - handicap.js exists, proved identical, nothing consumes it.
//   2. Pages load handicap.js and drop their own copies (admin's aliases too).
//   3. Test realms adopt handicap.js, in reviewable groups.
//   4. money-engine.js sheds the family, and the parity test above becomes a
//      no-copy guard instead.
//
// Until step 4 lands, a page that loads both files gets money-engine's copy,
// because it is declared second. The bytes are the same either way - that is the
// whole point of the guard - but it is worth knowing which one is running.
//
// NO DEPENDENCIES, NO TOP-LEVEL CODE. Loaded by pages at different points in
// their boot, so it must not reach for anything and must not do anything on load.
//
// The seven functions below this header are unchanged: no
// stroke-allocation algorithm moved, and no historical rounding was tidied up.
// They are the definitions money-engine.js has always had.
//
// INDEX CONVERSION (2026-09-23) is the block at the bottom. A golfer enters a
// Handicap Index. Course Handicap and Playing Handicap are derived there, and
// the Playing Handicap is what gets stored in player.hcp so getStrokes and
// every existing game keep reading the same field they always have.
// ============================================================================

// A stored handicap string to a number. A PLUS handicap is better than scratch,
// so "+2" is NEGATIVE two - the golfer gives strokes rather than receiving them.
// Anything unreadable is scratch: an empty box on the setup screen must not stop
// a round, and a golfer with no handicap entered plays off zero.
function parseHcp(hcpStr) {
    if (!hcpStr) return 0;
    const str = String(hcpStr).trim();
    if (str.startsWith("+")) return -Math.abs(parseFloat(str.substring(1)));
    return parseFloat(str) || 0;
}

// Strokes received on ONE hole, from a full-round handicap and that hole's
// stroke index. Past 18 the allocation wraps: a 27 gets one stroke everywhere and
// a second on the six hardest. A plus handicap GIVES a stroke back on the easiest
// holes, which is why this can return -1.
function getStrokes(hcpIndex, numericHcp) {
    if (numericHcp >= 0) {
        let strokes = Math.floor(numericHcp / 18);
        if (hcpIndex <= (numericHcp % 18)) strokes += 1;
        return strokes;
    } else {
        const plusVal = Math.abs(numericHcp);
        if (hcpIndex > (18 - plusVal)) return -1;
        return 0;
    }
}


// hole gets one stroke per full 18, and the remainder falls on the lowest indexes.
// rel 20 -> one everywhere plus a second on SI 1-2. rel 36 -> two everywhere.
// rel 40 -> two everywhere plus a third on SI 1-4.
function allocateMatchStrokes(rel, hcpIndex) {
    if (!(rel > 0)) return 0;
    return Math.floor(rel / 18) + ((hcpIndex <= (rel % 18)) ? 1 : 0);
}

// The one baseline for a match: the lowest parsed Playing Handicap among ALL
// participants, both sides counted together. Which team a golfer is on is
// irrelevant to this calculation, and player/team ORDER cannot change it because
// a minimum is order-independent.
function matchHandicapBaseline(matchPlayers) {
    var base = null;
    (matchPlayers || []).forEach(function (p) {
        var h = parseHcp(p.hcp);
        if (base === null || h < base) base = h;
    });
    return base === null ? 0 : base;
}

// playerId -> relative match handicap, SCOPED TO THIS MATCH ONLY. Never written
// back onto the player record: the same golfer legitimately carries a different
// relative handicap in a simultaneous match against different opponents.
function matchRelativeHandicaps(matchPlayers) {
    var base = matchHandicapBaseline(matchPlayers);
    var out = {};
    (matchPlayers || []).forEach(function (p) {
        out[String(p.id)] = parseHcp(p.hcp) - base;
    });
    return out;
}

// Which formats are genuinely HOLE-BY-HOLE MATCH PLAY played with individual
// balls. Scramble is excluded ON PURPOSE: it is a single-ball team format, so
// there is no individual ball for an individual relative stroke to attach to. It
// keeps its existing behaviour exactly. A 1v1 is always treated as a match
// regardless of the format label, which preserves the committed singles contract.
function isRelativeMatchFormat(gameFormat) {
    return ['match', 'nassau', 'bestball', 'ryder'].indexOf(gameFormat) !== -1;
}

function relativeMatchStrokes(hcpIndex, ownHcp, oppHcp) {
    // A two-player baseline is just the all-player baseline over a field of two.
    return allocateMatchStrokes(ownHcp - Math.min(ownHcp, oppHcp), hcpIndex);
}

// ============================================================================
// HANDICAP INDEX → COURSE HANDICAP → PLAYING HANDICAP
//
// The number a golfer types is a Handicap Index. Net math does not read that
// index. It reads player.hcp, and these functions decide what gets written
// there.
//
//   Course Handicap  = Index × (Slope / 113) + (Course Rating − Par)
//   Playing Handicap = Course Handicap × allowance, nearest whole number,
//                      with .5 rounding toward +∞ (10.5 → 11, −1.5 → −1).
//
// Allowance is a percent. 100 means the Playing Handicap is the rounded
// Course Handicap. The Course Handicap is not rounded before the multiply;
// the single rounding is the Playing Handicap, which is the number getStrokes
// receives.
//
// When Slope, Course Rating, or Par is missing or out of range, nothing is
// converted. The Index is stored as the Playing Handicap and flagged
// handicapUnconverted so every screen can say so. A blank index stays blank.
// A legacy player — the box still holds the handicap saved before this
// conversion — is returned unchanged, with no index fields.
// ============================================================================

function roundHalfUp(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 0;
    // .5 toward +∞. Math.floor(n + 0.5) is that rule: 10.5 → 11, −1.5 → −1.
    return Math.floor(n + 0.5);
}

function handicapUnconvertedNote() {
    return 'Slope, Course Rating, and Par are missing, so each Handicap Index is used as the Playing Handicap. Nets say so.';
}

function sanitizeHandicapIndex(raw) {
    var hcpVal = String(raw == null ? '' : raw).trim();
    if (hcpVal === '') return '';
    // A leading + is a plus index (better than scratch). Leave it for parseHcp.
    // Anything else is capped at 54, the USGA Handicap Index maximum. The old
    // setup cap of 36 was on a number people typed as the strokes themselves.
    if (hcpVal.charAt(0) === '+') return hcpVal;
    var numVal = parseFloat(hcpVal);
    if (isNaN(numVal)) numVal = 0;
    if (numVal > 54) numVal = 54;
    return String(numVal);
}

function teeRatingStatus(tee) {
    tee = tee || {};
    var slope = Number(tee.slope);
    var courseRating = Number(tee.courseRating);
    var par = Number(tee.par);
    var allowance = (tee.allowance === undefined || tee.allowance === null || tee.allowance === '')
        ? 100 : Number(tee.allowance);
    var missing = [];
    if (!(slope > 0)) missing.push('Slope');
    if (!(courseRating > 0)) missing.push('Course Rating');
    if (!(par > 0)) missing.push('Par');
    if (missing.length) {
        return { complete: false, reason: 'missing', message: handicapUnconvertedNote() };
    }
    if (slope < 55 || slope > 155) {
        return { complete: false, reason: 'invalid', message: 'Slope must be between 55 and 155. Until it is, each Handicap Index is used as the Playing Handicap.' };
    }
    if (courseRating < 20 || courseRating > 90) {
        return { complete: false, reason: 'invalid', message: 'Course Rating must be between 20 and 90. Until it is, each Handicap Index is used as the Playing Handicap.' };
    }
    if (par < 27 || par > 80 || par % 1 !== 0) {
        return { complete: false, reason: 'invalid', message: 'Par must be a whole number from 27 to 80. Until it is, each Handicap Index is used as the Playing Handicap.' };
    }
    if (!(allowance > 0) || allowance > 100) {
        return { complete: false, reason: 'invalid', message: 'Allowance must be from 1 to 100. Until it is, each Handicap Index is used as the Playing Handicap.' };
    }
    return { complete: true, slope: slope, courseRating: courseRating, par: par, allowance: allowance };
}

function courseHandicapFromIndex(index, slope, courseRating, par) {
    return index * (slope / 113) + (courseRating - par);
}

function playingHandicapFromCourse(course, allowancePercent) {
    return roundHalfUp(course * allowancePercent / 100);
}

function formatStoredHandicap(n) {
    var w = roundHalfUp(n);
    if (w < 0) return '+' + String(Math.abs(w));
    return String(w);
}

function formatHandicapLabel(raw) {
    var t = String(raw === undefined || raw === null ? '' : raw).trim();
    if (t === '') return '0';
    if (t.charAt(0) === '+') return t;
    var n = Number(t);
    if (!isFinite(n)) return t;
    if (n < 0) return '+' + String(Math.abs(n));
    return String(n);
}

function formatCourseLabel(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '\u2014';
    var negative = n < 0;
    var hundredths = roundHalfUp(Math.abs(n) * 100) / 100;
    var s = hundredths.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    if (negative && s !== '0') return '+' + s;
    return s;
}

function convertHandicapIndex(indexText, tee) {
    var text = sanitizeHandicapIndex(indexText);
    if (text === '') return { ok: false, reason: 'blank', indexText: '', unconverted: false };
    var index = parseHcp(text);
    var rating = teeRatingStatus(tee);
    if (!rating.complete || !isFinite(index)) {
        return {
            ok: false,
            reason: rating.complete ? 'unreadable' : rating.reason,
            message: rating.message || handicapUnconvertedNote(),
            indexText: text,
            index: index,
            unconverted: true
        };
    }
    var course = courseHandicapFromIndex(index, rating.slope, rating.courseRating, rating.par);
    var playing = playingHandicapFromCourse(course, rating.allowance);
    return {
        ok: true,
        indexText: text,
        index: index,
        course: course,
        playing: playing,
        playingText: formatStoredHandicap(playing),
        unconverted: false
    };
}

// What Save writes onto one golfer. legacyHcp is the attribute stamped on a
// row loaded from a round that predates Index conversion. While the box still
// holds that exact string, the golfer is left alone — re-saving must not
// reinterpret a stored Playing Handicap as an Index.
function playerHandicapFields(enteredText, legacyHcp, tee) {
    var raw = String(enteredText == null ? '' : enteredText).trim();
    var legacy = (legacyHcp == null) ? null : String(legacyHcp);
    if (legacy !== null && raw === legacy) return { hcp: legacy };
    var conv = convertHandicapIndex(raw, tee);
    if (conv.reason === 'blank') return { hcp: '' };
    if (conv.ok) {
        return {
            hcp: conv.playingText,
            handicapIndex: conv.indexText,
            courseHandicap: conv.course
        };
    }
    return {
        hcp: conv.indexText,
        handicapIndex: conv.indexText,
        handicapUnconverted: true
    };
}

// Null when this golfer has no Index (a round saved before conversion, or a
// blank). Callers keep their existing "HCP n" line in that case.
function handicapFacingLabel(player) {
    if (!player) return null;
    var indexRaw = player.handicapIndex;
    if (indexRaw === undefined || indexRaw === null || String(indexRaw).trim() === '') return null;
    var idx = formatHandicapLabel(indexRaw);
    if (player.handicapUnconverted) {
        return 'Index ' + idx + ' \u00b7 no tee rating, used as Playing Handicap';
    }
    return 'Index ' + idx
        + ' \u00b7 Course ' + formatCourseLabel(player.courseHandicap)
        + ' \u00b7 Playing ' + formatHandicapLabel(player.hcp);
}
