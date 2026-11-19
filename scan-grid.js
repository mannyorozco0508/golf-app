// ============================================================================
// SCAN GRID - the one place the "card vs app" grid is drawn from.
//
// Two pages show the same thing: tournament.html's Desk (the Scan check and the
// Cards turned in queue) and tournament-scorecard.html (a golfer's "Turn in our
// card" check screen, C, ADVISOR-20261118-1533). Before this file the grid
// lived inside tournament.html as cardCheckGridHtml; a second copy on the
// golfer's card is what "two entry points means one builder" (CLAUDE.md)
// refuses, so the rows live here. tournament.html's cardCheckGridHtml now calls
// gridHtml and nothing else; its markup is byte for byte what it was
// (tournament_card_check_test.js B2 and F1 hold the cells).
//
// Plain ES5 in the scan-compare.js wrapper: a browser sees window.ScanGrid,
// Node sees module.exports. No DOM, no database, no fetch: strings in, a
// string out.
//
//   gridHtml({ holes, players, rows, esc })
//     holes    [{ hole, par }] for the round, in hole order (cardCheckHoles)
//     players  [{ key, name }] the card's golfers in record order (the unit's players)
//     rows     the stored check's rows: { <key>: { row, h: { h<n>: cell } } } (ScanCompare.compareCard)
//     esc      the page's HTML escaper (text-safe.js escapeHtml)
//   -> one <table class="ck-grid"> per nine: HOLE / PAR rows, then one row per
//      golfer. A cell is: a match or a chosen hole -> the digit with its ring
//      (birdie circle, eagle double, bogey square, double+ double square; red
//      only under par); unsure -> amber "5?" over "app 4"; mismatch -> red "6"
//      over "app 5"; the card's digit with nothing in the app -> dotted ink
//      (td.ck-m, not red: there is nothing to disagree with); empty -> blank.
//      The last column marks the nine: ✓ every hole matches, ≠ something
//      differs, ? only unsure cells are open, nothing while open holes are
//      only fills.
//
//   mark(score, par) -> '' | ' eagle' | ' birdie' | ' bogey' | ' double'  (the
//      ring class; red only under par - the colour rule)
// ============================================================================
(function () {
    'use strict';

    function mark(score, par) {
        var d = Number(score) - Number(par);
        if (!(score > 0) || !(par > 0)) return '';
        return d <= -2 ? ' eagle' : d === -1 ? ' birdie' : d === 1 ? ' bogey' : d >= 2 ? ' double' : '';
    }

    function gridHtml(o) {
        var holes = (o && o.holes) || [];
        var players = (o && o.players) || [];
        var rows = (o && o.rows) || {};
        var esc = (o && typeof o.esc === 'function') ? o.esc : function (s) { return String(s === undefined || s === null ? '' : s); };
        var nines = [holes.filter(function (h) { return h.hole <= 9; }), holes.filter(function (h) { return h.hole >= 10; })].filter(function (n) { return n.length; });
        return nines.map(function (nine) {
            var tag = nine[0].hole >= 10 ? 'IN' : 'OUT';
            var t = '<table class="ck-grid"><tr class="ck-hr"><th>Hole</th>' + nine.map(function (h) { return '<th>' + h.hole + '</th>'; }).join('') + '<th>' + tag + '</th><th></th></tr>'
                + '<tr class="ck-par"><th>Par</th>' + nine.map(function (h) { return '<td>' + (h.par || '') + '</td>'; }).join('') + '<td>' + nine.reduce(function (s, h) { return s + (h.par || 0); }, 0) + '</td><td></td></tr>';
            players.forEach(function (p) {
                var r = rows[p.key] || { h: {} };
                var sum = 0, all = true, any = false;
                var cells = nine.map(function (h) {
                    var cell = (r.h || {})['h' + h.hole] || { status: 'empty' };
                    var shown = cell.choice === 'card' ? cell.card : (cell.app !== undefined ? cell.app : cell.card);
                    if (shown > 0) sum += shown; else all = false;
                    if (cell.status === 'match' || cell.choice) {
                        if (cell.status !== 'match') any = true;
                        return '<td><span class="ck-d' + mark(shown, h.par) + '">' + (shown || '') + '</span></td>';
                    }
                    if (cell.status === 'empty') { all = false; return '<td></td>'; }
                    any = true;
                    if (cell.status === 'unsure') return '<td class="ck-u"><span>' + cell.card + '?</span><small>app ' + cell.app + '</small></td>';
                    if (cell.status === 'mismatch') return '<td class="ck-x"><span>' + cell.card + '</span><small>app ' + cell.app + '</small></td>';
                    // The card has a digit and the app has nothing yet (an untyped hole): the card's digit, in ink, marked "card".
                    // Not red: there is nothing to disagree with. Use the whole card fills these in one tap.
                    if (cell.card > 0 && cell.app === undefined) return '<td class="ck-m"><span>' + cell.card + '</span></td>';
                    return '<td class="ck-x"><span>' + (cell.card || '–') + '</span><small>app ' + (cell.app || '–') + '</small></td>';
                }).join('');
                var open = nine.some(function (h) { var cell = (r.h || {})['h' + h.hole]; return cell && cell.status !== 'match' && cell.status !== 'empty' && !cell.choice; });
                var unsureOnly = open && nine.every(function (h) { var cell = (r.h || {})['h' + h.hole]; return !cell || cell.status === 'match' || cell.status === 'empty' || cell.choice || cell.status === 'unsure'; });
                // Open holes that are only "card digit, nothing in the app" are not a disagreement: no mark until they are filled.
                var fillOnly = open && nine.every(function (h) { var cell = (r.h || {})['h' + h.hole]; return !cell || cell.status === 'match' || cell.status === 'empty' || cell.choice || (cell.status === 'missing' && cell.card > 0 && cell.app === undefined); });
                var mk = !r.row ? '' : (open ? (fillOnly ? '' : (unsureOnly ? '<span class="ck-q">?</span>' : '<span class="ck-ne">≠</span>')) : (all || any ? '✓' : ''));
                var short = String(p.name).split(' ').filter(Boolean);
                var nm = short.length > 1 ? short[0] + ' ' + short[short.length - 1].charAt(0) : (short[0] || '');
                t += '<tr><th class="ck-nm">' + esc(nm) + '</th>' + cells + '<td class="ck-sum">' + (sum || '') + '</td><td class="ck-mk">' + mk + '</td></tr>';
            });
            return t + '</table>';
        }).join('');
    }

    var api = { gridHtml: gridHtml, mark: mark };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.ScanGrid = api;
})();
