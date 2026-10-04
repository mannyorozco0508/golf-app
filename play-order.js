// ============================================================================
// PLAY ORDER - THE ORDER THE HOLES ARE ACTUALLY PLAYED IN (2026-10-04)
//
// A round that starts on the 10th tee plays 10, 11 ... 18, then 1, 2 ... 9. The
// CARD is still numbered 1-18 and must stay that way: `courseData` is keyed and
// displayed by hole number, every score key is `p<id>_h<number>`, and skins, KP,
// Net Finish and the Full Card all read holes by number. What changes is the
// SEQUENCE, and only the things that depend on sequence.
//
// WHAT DEPENDS ON SEQUENCE, and this is the whole reason the file exists:
//
//   match status      who is up after six holes PLAYED
//   close-outs        "3&2" is three up with two still TO PLAY
//   auto-press        a press starts on the next hole PLAYED, not the next number
//   holes remaining   the same arithmetic, from the other end
//   thru              six holes played, whichever six
//
// WHAT DOES NOT, and must not be touched by this: a skin is won on a hole, a KP
// is a par 3, Net Finish is a total. They are counted, not sequenced.
//
// THE FIELD IS NOT CALLED startHole, DELIBERATELY. `startHole` is taken, and it
// means something else everywhere in this repo: the hole a BET starts on - a
// mid-round skins game "from H5" (action-model.js gameHoles), a press, a side
// match added on the turn. events/<code>/startHole is ALREADY READ as the legacy
// Dots start by index.html's kpLiveState, so a round-level reuse of that key
// would silently stop paying dots on the first nine. The round's tee is
// `startingHole`, which is what the tournament product has called the same thing
// since the shotgun sheet was built (tournament-scorecard.html "Start on hole N").
//
// Plain var/function declarations, like round-role.js: a `const` here collides
// fatally with any page that re-declares the name.
// ============================================================================

// THE ROUND'S TEE, normalised. Anything that is not a hole on this card is 1 -
// an absent field, a string, a 10 on a nine-hole round - because the one answer
// that is never wrong is "they played it in order".
function teeStartHole(data, courseData) {
    var holes = (courseData || []).map(function (h) { return Number(h && h.hole); })
        .filter(function (n) { return !isNaN(n); });
    var want = Number((data || {}).startingHole);
    if (!want || holes.indexOf(want) === -1) return holes.length ? Math.min.apply(null, holes) : 1;
    return want;
}

// THE TEE FOR ONE GROUP, on a two-tee start. groupStartingHoles is a map keyed by
// group number - { "1": 1, "2": 10 } - and a group with no entry plays the
// round's own tee. Group numbers are 1-based, as everywhere else in the app.
function groupStartHole(data, courseData, group) {
    var d = data || {};
    var g = Number(group);
    var map = d.groupStartingHoles;
    if (g && map && typeof map === 'object') {
        var v = Number(map[String(g)]);
        if (v) return teeStartHole({ startingHole: v }, courseData);
    }
    return teeStartHole(d, courseData);
}

// THE HOLES, IN THE ORDER THEY ARE PLAYED. A rotation of the card, not a filter:
// every hole appears exactly once, so anything iterating this still sees the whole
// round. Starting on the lowest hole returns the array unchanged - the SAME array
// contents in the same order - which is what keeps every existing round settling
// to the cent.
function playOrder(courseData, startHole) {
    var holes = (courseData || []).slice().sort(function (a, b) { return Number(a.hole) - Number(b.hole); });
    if (!holes.length) return holes;
    var at = -1;
    for (var i = 0; i < holes.length; i++) {
        if (Number(holes[i].hole) === Number(startHole)) { at = i; break; }
    }
    if (at <= 0) return holes;
    return holes.slice(at).concat(holes.slice(0, at));
}

// WHERE A HOLE SITS IN THE SEQUENCE, 0-based, or -1. Used for "how many are
// left", so it answers about the ORDER and never about the number.
function playOrderIndex(ordered, hole) {
    var list = ordered || [];
    for (var i = 0; i < list.length; i++) {
        if (Number(list[i].hole) === Number(hole)) return i;
    }
    return -1;
}

// THE NEXT HOLE PLAYED AFTER THIS ONE, and null on the last. This is what an
// auto-press has to start on: on a round that began at the 10th, a press
// triggered on 18 starts on hole 1, and "hole 19" is not a thing.
function nextHolePlayed(ordered, hole) {
    var i = playOrderIndex(ordered, hole);
    if (i === -1 || i + 1 >= (ordered || []).length) return null;
    return Number(ordered[i + 1].hole);
}

// THE LAST HOLE PLAYED - where Finish Round belongs. On a 10th-tee start that is
// hole 9, and on a group with its own tee it is that group's own last hole.
function lastHolePlayed(ordered) {
    var list = ordered || [];
    return list.length ? Number(list[list.length - 1].hole) : null;
}

// HOLES OF A SEGMENT STILL TO PLAY, counted in sequence. The segment is named by
// the holes it CONTAINS - a Nassau Front 9 is holes 1-9 by number, which is what
// golfers mean by it and what the brief asks for - and this says how many of them
// come after `hole` in the order actually being played.
//
// On a 1st-tee start this is identical to `endHole - hole`, which is the
// arithmetic match-engine.js used from the day it was written, so every round
// ever settled is unaffected. On a 10th-tee start they diverge, and the sequence
// is the one that is true.
function segmentHolesLeft(ordered, segmentHoles, hole) {
    var inSeg = {};
    (segmentHoles || []).forEach(function (h) { inSeg[String(Number(h))] = true; });
    var i = playOrderIndex(ordered, hole);
    if (i === -1) return 0;
    var left = 0;
    for (var j = i + 1; j < ordered.length; j++) {
        if (inSeg[String(Number(ordered[j].hole))]) left++;
    }
    return left;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        teeStartHole, groupStartHole, playOrder, playOrderIndex,
        nextHolePlayed, lastHolePlayed, segmentHolesLeft
    };
}
