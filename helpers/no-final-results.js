// v195b (2026-09-22): on a Weekly Game round the Results page and the printed
// Receipt no longer carry the "🏁 Final Results" per-golfer NET list - the
// buy-ins are cash on the first tee and the payer needs Player Payouts. Every
// text-for-text golden of a pool receipt captured before that has the card in
// it; this strips exactly that segment from the CAPTURE - the head cell and the
// name / "±$N NET" pairs that follow it, nothing else - so the old text with
// this one wave's subtraction must equal the new text, character for character.
// The card stays on rounds without the Weekly Game; those captures pass through
// untouched (the head is simply not there). Asserts the segment was found when
// the caller says it must be, so an inert strip cannot pass for a proof.
function noFinalResults(t, opts) {
    // The card's own markup contributed a whitespace cell after its last row, so
    // that one '| ' goes with it: '|Sunday| | |🏁 …|Wes Whiskey|-$20 NET| |💰' -> '|Sunday| | |💰'.
    const re = /\|🏁 Final Results(\|[^|]+\|[+\-−]?\$[\d.]+ NET)+\| /;
    const had = re.test(t);
    if (opts && opts.require && !had) throw new Error('noFinalResults: the capture had no Final Results segment');
    return t.replace(re, '');
}
module.exports = { noFinalResults };
