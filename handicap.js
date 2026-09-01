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
// NOTHING HERE IS NEW. No algorithm changed, no historical behaviour moved, no
// rounding was tidied up. These are the definitions money-engine.js has always
// had, moved and commented, and the tests prove exactly that.
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

// Which formats are genuinely HOLE-BY-HOLE MATCH PLAY played with individual
// balls. Scramble is excluded ON PURPOSE: it is a single-ball team format, so
// there is no individual ball for an individual relative stroke to attach to. It
// keeps its existing behaviour exactly. A 1v1 is always treated as a match
// regardless of the format label, which preserves the committed singles contract.
function isRelativeMatchFormat(gameFormat) {
    return ['match', 'nassau', 'bestball', 'ryder'].indexOf(gameFormat) !== -1;
}
