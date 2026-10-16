// HARDPAN SCORE MARKS (gps-marks, 2026-10-16): the Receipt's legend names the two new marks,
// "Bogey" and "Double bogey or worse", after "Eagle or better" - in the GPS tree only (the lines
// are in a GPS block of settlement.html; the Consumer tree is unchanged). A capture taken before
// is brought up to that text here, ONCE, and a second difference anywhere is still red.
'use strict';
const fs = require('fs');
const path = require('path');
const HP = fs.existsSync(path.join(__dirname, '..', 'score-marks-hp.js'));
function marksLegend(t) {
    if (!HP || typeof t !== 'string') return t;
    const n = t.split('| Eagle or better |').length - 1;
    if (n === 0) return t;
    return t.split('| Eagle or better |').join('| Eagle or better | Bogey | Double bogey or worse |');
}
// The same receipt as HTML: today's markup with the HardPan boxes taken back off - the
// class on a bogey / double bogey cell, and the two legend entries - so a capture taken
// before them still compares byte for byte. score_marks_test.js proves separately that the
// boxes land on exactly the holes the classifier names.
function unmarkHardPan(html) {
    if (!HP || typeof html !== 'string') return html;
    return html.replace(/ class="mark-(?:bogey|double)"/g, '').replace(/ mark-(?:bogey|double)\b/g, '')
        .replace(' <span class="legend-dot legend-bogey"></span> Bogey <span class="legend-dot legend-double"></span> Double bogey or worse', '');
}
module.exports = { marksLegend, unmarkHardPan, HP };
