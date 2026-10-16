// ============================================================================
// HardPan — Score Marks above par (gps-marks, 2026-10-16). HardPan only (GPS_SHELL).
//
// score-marks.js decides the circles (birdie, eagle or better) and is pinned byte-identical
// with the money files, so it is NOT edited. This file, loaded right after it on every page
// that draws a card, adds the standard boxes on top of the same rule:
//   'bogey'  - one over par: a box
//   'double' - two or more over: a double box
// GROSS ONLY and DISPLAY ONLY, exactly like score-marks.js: two numbers in, a word out.
// Blank / 0 / no par -> '' (score-marks.js's own answer, unchanged). Birdie / eagle untouched.
// ============================================================================
(function (root) {
    'use strict';
    var base = root && typeof root.scoreMark === 'function' ? root.scoreMark : null;
    function circles(g, p) {
        if (base) return base(g, p);
        var s = parseInt(g, 10), q = parseInt(p, 10);
        if (!s || !q || s <= 0 || q <= 0) return '';
        return q - s >= 2 ? 'eagle' : (q - s === 1 ? 'birdie' : '');
    }
    function scoreMark(grossScore, par) {
        var m = circles(grossScore, par);
        if (m) return m;
        var s = parseInt(grossScore, 10), q = parseInt(par, 10);
        if (!s || !q || s <= 0 || q <= 0) return '';
        var over = s - q;
        if (over === 1) return 'bogey';
        if (over >= 2) return 'double';
        return '';
    }
    function scoreMarkClass(grossScore, par) {
        var m = scoreMark(grossScore, par);
        return m ? ' mark-' + m : '';
    }
    if (root && base) { root.scoreMark = scoreMark; root.scoreMarkClass = scoreMarkClass; }
    if (typeof module !== 'undefined' && module.exports) module.exports = { scoreMark: scoreMark, scoreMarkClass: scoreMarkClass };
})(typeof window !== 'undefined' ? window : null);
