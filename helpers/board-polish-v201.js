// v201 (2026-09-22, THE BOARD POLISH): the transform that turns a rendered
// leaderboard captured before this wave into the HTML the same round renders
// now, so every byte-for-byte board golden keeps proving that NO NUMBER MOVED -
// only what is said and where. board_polish_test.js proves the new behaviour;
// the callers prove the old HTML, with exactly these edits, IS today's HTML.
// Each edit throws when it finds nothing, so an inert transform cannot pass.
//
// The five differences, all of them this wave's:
//   1. the header row:  <th>Player</th> -> <th>Golfer</th>, "To Par" -> "To par",
//      and every SECTION table gains that same header (it had none; only the
//      flat board carried one).
//   2. the name cell:  <span class="player-hcp">HCP: 6</span> -> ...>HCP 6</span>
//      on the same line (the CSS moved it inline - not visible in the HTML), and
//      a BLANK handicap loses the span altogether.
//   3. the score cell: a golfer with no handicap loses the "Net N" span.
//   4. the Thru cell: a finished golfer reads F instead of the hole count. The
//      caller says how many holes the round has, because "finished" is
//      thru >= courseData.length and the HTML does not carry it.
//   5. the skins badge: a winner's name cell gains
//      <span class="skins-badge">🥩 N</span>. Handed in per golfer NAME by the
//      caller, with the count from the engine's ledger - neither the count nor
//      the id is in a capture (renderBoard strips data-player-id).
//
// A capture whose golfers all have handicaps and no skins needs only 1, 2 and 4.
function boardV201(html, opts) {
    const o = opts || {};
    let out = String(html);
    const must = (cond, what) => { if (!cond) throw new Error('boardV201: nothing to edit for ' + what); };

    // 1. the header, and one on every section table
    const OLD_HEAD = '<thead><tr><th>Pos</th><th style="text-align:left;">Player</th><th>Score</th><th>To Par</th><th>Thru</th></tr></thead>';
    const NEW_HEAD = '<thead><tr><th>Pos</th><th style="text-align:left;">Golfer</th><th>Score</th><th>To par</th><th>Thru</th></tr></thead>';
    const hadHead = out.indexOf(OLD_HEAD) >= 0;
    out = out.split(OLD_HEAD).join(NEW_HEAD);
    // a section table is `<table class="board-table" style="margin-bottom:0;">\n<indent><tbody>`
    const SECTION = /(<table class="board-table" style="margin-bottom:0;">)(\s*)(<tbody>)/g;
    const hadSection = SECTION.test(out);
    SECTION.lastIndex = 0;
    out = out.replace(SECTION, (all, open, ws, tbody) => open + ws + NEW_HEAD + ws + tbody);
    must(hadHead || hadSection, 'the header row');

    // 2. + 3. the handicap, and the net line for a golfer without one
    const blanks = o.blankHcpNames || [];
    const hadHcp = /<span class="player-hcp">HCP: /.test(out);
    must(hadHcp || blanks.length === 0, 'the HCP line');
    blanks.forEach(name => {
        // the whole row for that golfer: drop the HCP span and the Net span
        const rowRe = new RegExp('(<tr[^>]*>[\\s\\S]*?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?)</tr>');
        const m = rowRe.exec(out);
        if (!m) throw new Error('boardV201: no row for ' + name);
        const fixed = m[1]
            .replace(/<span class="player-hcp">HCP: [^<]*<\/span>/, '')
            .replace(/<span class="score-net">Net [^<]*<\/span>/, '');
        if (fixed === m[1]) throw new Error('boardV201: nothing removed for ' + name);
        out = out.replace(m[1], fixed);
    });
    out = out.replace(/<span class="player-hcp">HCP: ([^<]*)<\/span>/g, '<span class="player-hcp">HCP $1</span>');

    // 5. the badge, beside the name, before the HCP span (the row builder's order).
    // EVERY row that names the golfer - a grouped board draws them once per section.
    // By NAME, not by id: a capture has its data-player-id stripped (renderBoard
    // removes it so the attribute's arrival could not move a golden).
    Object.keys(o.skinsByName || {}).forEach(name => {
        const n = o.skinsByName[name];
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rowRe = new RegExp('(<td class="player-name">' + esc + ')(<span class="player-hcp">|<span class="player-flight">|</td>)', 'g');
        let hits = 0;
        out = out.replace(rowRe, (all, head, tail) => { hits++; return head + '<span class="skins-badge">\uD83E\uDD69 ' + n + '</span>' + tail; });
        if (hits === 0) throw new Error('boardV201: no name cell for ' + name);
    });

    // 4. F for a finished golfer: the LAST cell of a row that carries a name cell.
    // NOT anchored on data-player-id - a capture has it stripped (see 5).
    if (o.holes) {
        let touched = 0;
        out = out.replace(/(<td class="player-name">[\s\S]*?)<td>(\d+)<\/td>(\s*)(<\/tr>)/g,
            (all, head, thru, ws, close) => {
                if (Number(thru) < o.holes) return all;
                touched++;
                return head + '<td>F</td>' + ws + close;
            });
        must(touched > 0 || o.noneFinished === true, 'a finished golfer');
    }
    return out;
}
// THE SAME EDITS ON A TAG-STRIPPED CAPTURE (board_stats_scope's goldens are text,
// not markup): "|HCP: 8|" -> "|HCP 8|", every section table gains its header cells
// "|Pos|Golfer|Score|To par|Thru|", the flat board's header words change, a
// finished golfer's thru cell becomes F, and a winner's name is followed by the
// badge. `opts.sectionHeadAfter` is the text that ends a section's own head row
// (the capture's "|Thru 12| | | |"), because a text capture has no <table> to
// anchor on. Throws when an edit it must make finds nothing.
function boardTextV201(text, opts) {
    const o = opts || {};
    let out = String(text);
    let edited = false;
    if (/\|HCP: /.test(out)) { out = out.replace(/\|HCP: /g, '|HCP '); edited = true; }
    // the flat board's own header row, in text
    if (out.indexOf('|Pos|Player|Score|To Par|Thru|') >= 0) { out = out.split('|Pos|Player|Score|To Par|Thru|').join('|Pos|Golfer|Score|To par|Thru|'); edited = true; }
    // a section head: the capture's "…|Thru N| | | |" (or "Not started"), then the rows
    if (o.sections) {
        const re = /(\|(?:Thru \d+|Not started)\| \| \| \|)/g;
        let hits = 0;
        out = out.replace(re, (all) => { hits++; return all + 'Pos|Golfer|Score|To par|Thru| |'; });
        if (hits === 0) throw new Error('boardTextV201: no section head to give a header row');
        edited = true;
    }
    (o.finishedThru ? [o.finishedThru] : []).forEach(n => {
        const re = new RegExp('\\|' + n + '\\|', 'g');
        if (!re.test(out)) throw new Error('boardTextV201: no thru ' + n + ' cell');
        out = out.replace(re, '|F|');
        edited = true;
    });
    Object.keys(o.skinsByName || {}).forEach(name => {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(\\|' + esc + ')(\\|)', 'g');
        let hits = 0;
        out = out.replace(re, (all, a, b) => { hits++; return a + '\uD83E\uDD69 ' + o.skinsByName[name] + b; });
        if (hits === 0) throw new Error('boardTextV201: no name cell for ' + name);
        edited = true;
    });
    if (!edited) throw new Error('boardTextV201: nothing was edited');
    return out;
}
module.exports = { boardV201, boardTextV201 };
