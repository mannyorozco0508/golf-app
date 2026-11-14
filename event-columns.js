// ============================================================================
// EVENT COLUMNS - one builder for the multi-round board's R1 / R2 / TOT columns
// (Manny's pick, 2026-11-14, MR-FINAL). tournament.html and tournament-tv.html
// both show the combined board, and CLAUDE.md's rule is one builder for two
// entry points, so the per-round join lives here and nowhere else.
//
// WHAT IT DOES. The engine's computeEventStandings() ranks golfers across the
// countable rounds but carries only the totals. This asks the engine for each
// round's OWN board (roundView + computeTournamentLeaderboard, the same rows
// that round's card shows) and files each golfer's strokes, thru and to-par
// under that round. Nothing is re-scored here: a number in a column is the
// number the round board already showed. The engine is read, never edited.
//
// GROSS ONLY. The column shows the round board's strokes for that golfer. On a
// gross round that is gross; on a net round the engine's rows are net rows, and
// the column follows the round's own scoring as the combined board does today.
// A Net view of a GROSS combined board needs per-hole stroke allocation inside
// the engine (protected); that is proposed separately and not built here.
//
// COLOR AND MARKS are not decided here. Callers render; this returns numbers.
// ============================================================================
(function (root) {
    'use strict';

    // The engine's functions are globals on the pages and arguments in tests.
    function pick(fns, name) {
        if (fns && typeof fns[name] === 'function') return fns[name];
        if (typeof root[name] === 'function') return root[name];
        return null;
    }

    // columns: [{ rid, name, short, holes, status }], in the event's round order
    // (countable rounds only: open or closed, the same set the engine sums).
    // byPlayer: { playerId: { rid: { strokes, thru, toPar, complete, hasScores } } }
    function eventRoundColumns(data, fns) {
        const countable = pick(fns, 'countableRoundIds');
        const view = pick(fns, 'roundView');
        const board = pick(fns, 'computeTournamentLeaderboard');
        const out = { columns: [], byPlayer: {} };
        if (!data || !countable || !view || !board) return out;
        const ids = countable(data) || [];
        const rounds = data.rounds || {};
        ids.forEach((rid, i) => {
            const r = rounds[rid] || {};
            const v = view(data, rid);
            if (!v) return;
            const holes = (v.courseData || r.courseData || []).length || 18;
            out.columns.push({ rid: rid, name: r.name || ('Round ' + (i + 1)), short: 'R' + (i + 1), holes: holes,
                status: r.status || 'open', courseName: r.courseName || v.courseName || '', scoringMode: r.scoringMode === 'net' ? 'net' : 'gross' });
            (board(v) || []).forEach((row) => {
                if (row.entryType !== 'player' || !row.playerId) return;
                const p = out.byPlayer[row.playerId] || (out.byPlayer[row.playerId] = {});
                p[rid] = { strokes: row.hasScores ? row.strokes : null, thru: row.hasScores ? row.thru : 0,
                    toPar: row.hasScores ? row.toPar : null, complete: !!row.hasScores && row.thru === holes, hasScores: !!row.hasScores };
            });
        });
        return out;
    }

    // The ring a hole score gets, by its relation to par. Circles under par,
    // squares over, never a colour (Manny 2026-11-14: "green for birdies and red
    // for bogeys is just dumb"). The number keeps its own colour.
    function holeMark(score, par) {
        const s = Number(score), p = Number(par);
        if (!(s > 0) || !(p > 0)) return '';
        const d = s - p;
        if (d <= -2) return 'mark-eagle';
        if (d === -1) return 'mark-birdie';
        if (d === 1) return 'mark-bogey';
        if (d >= 2) return 'mark-double';
        return '';
    }

    // The hole-by-hole card for one golfer in one round, read from the round's
    // own scores map (the `${pid}_h${n}` keys the scorecard page writes).
    // Returns { holes: [{ hole, par, score, mark }], out, inn, total, thru }.
    function playerRoundHoles(data, rid, playerId, fns) {
        const view = pick(fns, 'roundView');
        const v = view && data ? view(data, rid) : null;
        const r = ((data && data.rounds) || {})[rid] || {};
        const cd = (v && v.courseData) || r.courseData || [];
        const scores = r.scores || {};
        const holes = cd.map((h, i) => {
            const n = Number(h.hole) || (i + 1);
            const sc = Number(scores[playerId + '_h' + n]) || 0;
            return { hole: n, par: Number(h.par) || 0, score: sc, mark: sc ? holeMark(sc, h.par) : '' };
        });
        const sum = (list) => list.reduce((a, h) => a + (h.score || 0), 0);
        const played = holes.filter((h) => h.score > 0);
        return { holes: holes, out: sum(holes.slice(0, 9)), inn: sum(holes.slice(9, 18)), total: sum(holes), thru: played.length,
            parOut: holes.slice(0, 9).reduce((a, h) => a + h.par, 0), parIn: holes.slice(9, 18).reduce((a, h) => a + h.par, 0) };
    }

    const api = { eventRoundColumns: eventRoundColumns, holeMark: holeMark, playerRoundHoles: playerRoundHoles };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.eventRoundColumns = eventRoundColumns;
    root.holeMark = holeMark;
    root.playerRoundHoles = playerRoundHoles;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
