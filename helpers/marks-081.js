// URGENT-081 (2026-10-26): the Receipt's Full Scorecard now also draws a square for a bogey and
// a double square for a double bogey or worse, and its legend names them after "Eagle or better".
// A capture taken before is brought up to that text here, ONCE (marksLegend), or today's HTML has
// the two new classes and legend entries taken back off (unmark081) - so every other byte still
// compares exactly, and a second difference anywhere is still red. urgent081_marks_test.js proves
// separately that the squares land on exactly the holes gross-vs-par names.
'use strict';
function marksLegend(t) {
    if (typeof t !== 'string' || t.indexOf('| Eagle or better |') < 0) return t;
    return t.split('| Eagle or better |').join('| Eagle or better | Bogey| | Double bogey or worse| |');   // the two entries are their own spans (legend-pair), so the text breaks after each
}
function unmark081(html) {
    if (typeof html !== 'string') return html;
    return html.replace(/ class="mark-(?:bogey|double)"/g, '')
        .replace(/\s*<span class="legend-pair"><span class="legend-dot legend-bogey"><\/span> Bogey<\/span>\s*<span class="legend-pair"><span class="legend-dot legend-double"><\/span> Double bogey or worse<\/span>/, '');
}
module.exports = { marksLegend, unmark081 };
