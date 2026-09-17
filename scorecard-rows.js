// ============================================================================
// SCORECARD ROWS - the one place the hole-by-hole card is drawn from.
//
// settlement.html's Full Scorecard (the Receipt, and so the PDF the share
// sheet sends) and the leaderboard's tap-a-name card show the same thing: a
// HOLE / PAR / HCP header, then per golfer a gross row with birdie and eagle
// rings, and - when net matters on the round - a net row. Before this file the
// Receipt drew those rows inline and the Matches tab's mini scorecard drew its
// own with its own rings. A third copy on the leaderboard is what "two entry
// points means one builder" (CLAUDE.md) refuses, so the rows live here.
//
// THE BUILDER EMITS CELLS; THE CALLER CHOOSES THE LAYOUT.
//
//   scorecardCells(opts)    the numbers and classes, split front / back with
//                           OUT / IN / TOT on every row, one golfer or many.
//                           No markup. The board lays these out as two stacked
//                           nines; the Receipt as one line of 18.
//   scorecardRowsHtml(opts) the Receipt's layout: one line of 18, in the
//                           receipt-table classes settlement.html styles
//                           (rt-name, rt-sec, rt-net). Byte for byte what the
//                           Receipt rendered before the extraction -
//                           scorecard_rows_test.js holds eleven rounds to it.
//
// opts = { courseData, scores, players, showNet, ringOf }
//   courseData  [{ hole, par, hcpIndex }]  any order, any subset of 1-18
//   scores      { 'p<id>_h<n>': score }    the round's scores node
//   players     [{ id, name, hcp }]        the golfers to draw, in this order
//   showNet     boolean                    the CALLER decides whether net
//                                          matters on the round (the Receipt
//                                          asks handicaps + net pool + skins
//                                          basis); this file never guesses
//   ringOf      (score, par) -> class      '' | 'mark-birdie' | 'mark-eagle',
//                                          from score-marks.js's scoreMarkClass
//                                          (trimmed). Passed in, not required
//                                          here, so a page that has not loaded
//                                          score-marks.js gets no rings rather
//                                          than a ReferenceError.
//
// NO ARITHMETIC OF ITS OWN BEYOND ADDING UP. Net strokes come from the canonical
// getStrokes/parseHcp in money-engine.js, read as globals exactly as the
// Receipt read them; where they are absent a golfer gets 0 strokes, as before.
// Names are escaped through text-safe.js's escapeHtml.
// ============================================================================
(function (root) {
    'use strict';

    const DASH = '–';

    function esc(v) {
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        if (typeof require === 'function') { try { return require('./text-safe.js').escapeHtml(v); } catch (e) { /* fall through */ } }
        return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    // money-engine.js exports nothing under Node (it is a browser global file),
    // so there is no require fallback here: a test that wants net rows installs
    // getStrokes/parseHcp as globals, the way a page has them.
    function strokesFn() {
        if (typeof getStrokes === 'function' && typeof parseHcp === 'function') return (hcpIndex, hcp) => getStrokes(hcpIndex, parseHcp(hcp));
        return () => 0;
    }

    function scorecardCells(opts) {
        const o = opts || {};
        const courseData = (o.courseData || []).slice().sort((a, b) => a.hole - b.hole);
        const scores = o.scores || {};
        const players = o.players || [];
        const ringOf = typeof o.ringOf === 'function' ? o.ringOf : () => '';
        const strokes = strokesFn();

        const front = courseData.filter(h => h.hole <= 9);
        const back = courseData.filter(h => h.hole > 9);
        const sum = (list, f) => list.reduce((s, h) => s + (f(h) || 0), 0);
        const hcpOf = h => (h.hcpIndex !== undefined && h.hcpIndex !== null) ? h.hcpIndex : DASH;

        const header = {
            hole: { front: front.map(h => h.hole), back: back.map(h => h.hole), out: 'OUT', in: 'IN', tot: 'TOT' },
            par: { front: front.map(h => h.par), back: back.map(h => h.par), out: sum(front, h => h.par), in: sum(back, h => h.par) },
            hcp: { front: front.map(hcpOf), back: back.map(hcpOf), out: '', in: '', tot: '' }
        };
        header.par.tot = header.par.out + header.par.in;

        const golfers = players.map(p => {
            const get = h => scores['p' + p.id + '_h' + h.hole] || null;
            const grossCell = h => { const g = get(h); return { value: g, cls: g === null ? '' : String(ringOf(g, h.par) || '') }; };
            const gross = { front: front.map(grossCell), back: back.map(grossCell), out: sum(front, get), in: sum(back, get) };
            gross.tot = gross.out + gross.in;
            let net = null;
            if (o.showNet) {
                const netOf = h => { const g = get(h); return g === null ? null : g - strokes(h.hcpIndex, p.hcp); };
                const netCell = h => ({ value: netOf(h), cls: '' });
                net = { front: front.map(netCell), back: back.map(netCell), out: sum(front, netOf), in: sum(back, netOf) };
                net.tot = net.out + net.in;
            }
            return { id: p.id, name: p.name, hcp: p.hcp, gross: gross, net: net };
        });

        return { front: front, back: back, hasFront: front.length > 0, hasBack: back.length > 0, header: header, golfers: golfers };
    }

    // THE RECEIPT'S LAYOUT: one line of 18. Every string below is the Receipt's
    // own, moved here unchanged - the section columns, the dash for an unscored
    // hole, the empty HCP sections, the class on the net row.
    function scorecardRowsHtml(opts) {
        const c = scorecardCells(opts);
        const cell = (v, cls) => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
        const headRow = (label, vals, outVal, inVal, total) => {
            let r = `<tr><th class="rt-name">${label}</th>`;
            if (c.hasFront) { vals.front.forEach(v => { r += `<th>${v}</th>`; }); if (c.hasBack) r += `<th class="rt-sec">${outVal}</th>`; }
            if (c.hasBack) { vals.back.forEach(v => { r += `<th>${v}</th>`; }); if (c.hasFront) r += `<th class="rt-sec">${inVal}</th>`; }
            return r + `<th class="rt-sec">${total}</th></tr>`;
        };
        let html = '';
        html += headRow('HOLE', c.header.hole, 'OUT', 'IN', 'TOT');
        html += headRow('PAR', c.header.par, c.header.par.out, c.header.par.in, c.header.par.tot);
        html += headRow('HCP', c.header.hcp, '', '', '');

        const dashOr = v => (v === null || v === undefined) ? DASH : v;
        c.golfers.forEach(g => {
            let r = `<tr><td class="rt-name">${esc(g.name)}</td>`;
            if (c.hasFront) { g.gross.front.forEach(x => { r += cell(dashOr(x.value), x.cls); }); if (c.hasBack) r += cell(g.gross.out || DASH, 'rt-sec'); }
            if (c.hasBack) { g.gross.back.forEach(x => { r += cell(dashOr(x.value), x.cls); }); if (c.hasFront) r += cell(g.gross.in || DASH, 'rt-sec'); }
            r += cell(g.gross.tot || DASH, 'rt-sec') + '</tr>';
            html += r;
            if (g.net) {
                let nr = `<tr class="rt-net"><td class="rt-name">net</td>`;
                if (c.hasFront) { g.net.front.forEach(x => { nr += cell(dashOr(x.value)); }); if (c.hasBack) nr += cell(g.net.out || DASH, 'rt-sec'); }
                if (c.hasBack) { g.net.back.forEach(x => { nr += cell(dashOr(x.value)); }); if (c.hasFront) nr += cell(g.net.in || DASH, 'rt-sec'); }
                nr += cell(g.net.tot || DASH, 'rt-sec') + '</tr>';
                html += nr;
            }
        });
        return html;
    }

    const api = { scorecardCells: scorecardCells, scorecardRowsHtml: scorecardRowsHtml };
    if (typeof window !== 'undefined') window.ScorecardRows = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
