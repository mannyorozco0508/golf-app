// v202 (2026-09-22, THE BOARD HEADER TRIM): the transform that turns a rendered
// leaderboard captured before this wave into what the same round renders now.
// board-polish-v201.js runs FIRST (it owns v201's edits); this adds v202's, and
// like its sibling it throws when an edit finds nothing, so an inert transform
// cannot pass for a proof. The rows, the positions and the totals are untouched
// by everything here - it is the banner's shape and where it appears.
//
// The two differences a CAPTURE OF #board-content can see (everything else this
// wave changed - the header line, the control row, the format toggle, the th
// padding - is above the board or in CSS, and no board capture holds it):
//   1. THE FLAT BOARD GAINS THE FOLDED BANNER. It always had none: the grouped
//      and flighted builders emitted it and the flat one did not, so on the new
//      default (a field over twelve opens flat) the field leader would have
//      vanished. `opts.banner` is the exact banner html to prepend, because the
//      capture of a flat board does not contain one to copy.
//   2. EVERY banner carries .h2h-fold, one line instead of two.
function boardV202(html, opts) {
    const o = opts || {};
    let out = String(html);
    const had = /<div class="h2h-banner">/.test(out);
    out = out.replace(/<div class="h2h-banner">/g, '<div class="h2h-banner h2h-fold">');
    if (o.banner) {
        if (had || /h2h-fold/.test(out)) throw new Error('boardV202: this capture already has a banner; do not prepend one');
        out = o.banner + out;
    } else if (!had) {
        throw new Error('boardV202: no banner to fold and none handed in');
    }
    return out;
}
// The folded banner for a field leader, exactly as fieldLeaderBannerHtml builds
// it - the caller passes the leader's own name and figures so the test states the
// text rather than copying a template it cannot check.
function foldedBannerHtml(name, toPar, thru) {
    const plain = toPar === 0 ? 'E' : (toPar > 0 ? '+' + toPar : String(toPar));
    return '<div class="h2h-banner h2h-fold">\n'
        + '                <div class="h2h-status">🏆 Leading the Field: ' + name + '</div>\n'
        + '                <div class="h2h-sub">' + plain + ' thru ' + thru + '</div>\n'
        + '            </div>';
}
module.exports = { boardV202, foldedBannerHtml };
