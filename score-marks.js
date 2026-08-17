// ============================================================================
// GolfApp — Score Marks
//
// Decides whether a hole score gets a circle: red for a birdie, green for an eagle
// or better. That is the whole file.
//
// WHY IT IS SHARED
// The live Full Scorecard and the Receipt/PDF scorecard are built by different code
// on different pages. If each decided for itself what counts as a birdie, the two
// would eventually disagree - and a golfer comparing his phone to the PDF would have
// no way to tell which one was lying. One function, both pages, no drift.
//
// GROSS ONLY. A birdie is a birdie: the number written on the card against the par
// of the hole. Handicap strokes change what a hole is WORTH in a net game, they do
// not turn a 4 on a par 4 into a birdie. The Birdie Game already settles on gross,
// and these circles are a reading aid for that, not a second opinion.
//
// DISPLAY ONLY. Nothing here touches Birdie Game math, settlement, handicaps or
// score entry - it reads two numbers and returns a string.
// ============================================================================

// '' | 'birdie' | 'eagle'
//
// Deliberately returns nothing for a blank, a zero, a placeholder or a missing par:
// an empty cell is not an achievement, and circling one would be worse than useless
// on a card someone is still filling in.
function scoreMark(grossScore, par) {
    const s = parseInt(grossScore, 10);
    const p = parseInt(par, 10);
    if (!s || !p || s <= 0 || p <= 0) return '';

    const under = p - s;
    if (under >= 2) return 'eagle';   // eagle, albatross, hole-in-one on a par 3+
    if (under === 1) return 'birdie';
    return '';                        // par, bogey or worse gets no decoration
}

// The class both scorecards attach. One name, so a CSS change lands in both places.
function scoreMarkClass(grossScore, par) {
    const mark = scoreMark(grossScore, par);
    return mark ? ' mark-' + mark : '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scoreMark, scoreMarkClass };
}
