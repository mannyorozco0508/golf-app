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
//   scorecardStackedHtml(opts)
//                           the board's layout (wave 2, 2026-09-16): TWO
//                           STACKED NINES - 1-9 with OUT, then 10-18 with IN
//                           and TOT - as two tables in the same classes, so a
//                           phone shows the whole card without a sideways
//                           swipe. A nine-hole course is one table with TOT.
//                           The golfer's row is labelled with the FIRST name.
//   netMattersOn(data)      the ONE answer to "does net matter on this round":
//                           somebody has a handicap AND the money was decided
//                           on net - a net pool, or net skins, or stableford.
//                           Written by the Receipt, moved here so the board's
//                           card shows net on exactly the same terms. Reads
//                           parseHcp and resolveSkinsMode as globals.
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
            return { id: p.id, name: p.name, hcp: p.hcp, gross: gross, net: net, out: p.out === true };   // out (v195): marked Out on the Players sheet - drawn greyed, scores kept
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
            let r = `<tr${g.out ? ' class="golfer-out"' : ''}><td class="rt-name">${esc(g.name)}</td>`;
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

    // DOES NET MATTER ON THIS ROUND? The Receipt's own rule, unchanged: printing
    // a net row on a round nobody played net doubles the card for nothing;
    // printing gross only on a round whose MONEY was decided on net forces
    // golfers back to the paper card. resolveSkinsMode() answers "which basis
    // WOULD skins use" and defaults to 'split', so it is only asked when a
    // skins game exists at all - unguarded it made every handicapped round net.
    function netMattersOn(data) {
        const d = data || {};
        const players = d.players || [];
        const anyHcp = players.some(p => (typeof parseHcp === 'function' ? parseHcp(p.hcp) : Number(p.hcp) || 0) > 0);
        const poolNet = !!(d.moneyPool && d.moneyPool.enabled
            && ((d.moneyPool.net && Number(d.moneyPool.net.amount) > 0)
                || (d.moneyPool.skins && d.moneyPool.skins.scoring !== 'gross')));
        const hasSkinsGame = !!(
            (d.additionalGames && d.additionalGames.skins)
            || d.gameFormat === 'skins'
            || (d.skinsBuyIn !== undefined && Number(d.skinsBuyIn) > 0)
            || (d.moneyPool && d.moneyPool.skins
                && d.moneyPool.skins.mode && d.moneyPool.skins.mode !== 'none')
        );
        const skinsNetMode = hasSkinsGame && (typeof resolveSkinsMode === 'function')
            ? resolveSkinsMode(d) !== 'gross' : false;
        return anyHcp && (poolNet || skinsNetMode || d.gameFormat === 'stableford');
    }

    // THE BOARD'S LAYOUT: two stacked nines. Same cells, same classes, same
    // dash; the only thing that differs from the Receipt's line is where the
    // line breaks. Each nine is its own <table class="receipt-table sc-nine">:
    // the front carries OUT, the back carries IN and TOT; a course with one
    // nine gets one table carrying TOT. No player-name cell anywhere in it.
    // The row label is the golfer's FIRST name: the column is 57px on a phone
    // and "Cal Cha..." read as a bug where "Cal" reads as a label - the full
    // name is on the board row directly above. A one-word name is the name.
    function firstNameOf(name) {
        return String(name == null ? '' : name).trim().split(/\s+/)[0] || '';
    }
    function scorecardStackedHtml(opts) {
        const c = scorecardCells(opts);
        const cell = (v, cls) => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
        const dashOr = v => (v === null || v === undefined) ? DASH : v;
        const both = c.hasFront && c.hasBack;
        // One nine: { holes: the header/golfer arrays for it, secs: [[label, headerKey], ...] }
        const nines = [];
        if (c.hasFront) nines.push({ side: 'front', secs: both ? [['OUT', 'out']] : [['TOT', 'tot']] });
        if (c.hasBack) nines.push({ side: 'back', secs: both ? [['IN', 'in'], ['TOT', 'tot']] : [['TOT', 'tot']] });
        let html = '<div class="sc-stack">';
        nines.forEach(n => {
            html += `<table class="receipt-table sc-nine sc-${n.side}">`;
            const head = (label, vals, secOf) => {
                let r = `<tr><th class="rt-name">${label}</th>`;
                vals[n.side].forEach(v => { r += `<th>${v}</th>`; });
                n.secs.forEach(([lab, key]) => { r += `<th class="rt-sec">${secOf(lab, key)}</th>`; });
                return r + '</tr>';
            };
            html += head('HOLE', c.header.hole, lab => lab);
            html += head('PAR', c.header.par, (lab, key) => c.header.par[key]);
            // SI, NOT HCP (v201). This row is the hole's STROKE INDEX - its
            // difficulty rank, 1..18 - and calling it HCP put the hole's number
            // under a column header that reads as the golfer's handicap, directly
            // beneath a board row that may show no handicap at all. The Receipt's
            // own layout (scorecardRowsHtml) is a different builder and keeps its
            // wording; this is the board's expanded card.
            html += head('SI', c.header.hcp, () => '');
            c.golfers.forEach(g => {
                let r = `<tr${g.out ? ' class="golfer-out"' : ''}><td class="rt-name">${esc(firstNameOf(g.name))}</td>`;
                g.gross[n.side].forEach(x => { r += cell(dashOr(x.value), x.cls); });
                n.secs.forEach(([lab, key]) => { r += cell(g.gross[key] || DASH, 'rt-sec'); });
                html += r + '</tr>';
                if (g.net) {
                    let nr = `<tr class="rt-net"><td class="rt-name">net</td>`;
                    g.net[n.side].forEach(x => { nr += cell(dashOr(x.value)); });
                    n.secs.forEach(([lab, key]) => { nr += cell(g.net[key] || DASH, 'rt-sec'); });
                    html += nr + '</tr>';
                }
            });
            html += '</table>';
        });
        return html + '</div>';
    }

    const api = { scorecardCells: scorecardCells, scorecardRowsHtml: scorecardRowsHtml,
                  scorecardStackedHtml: scorecardStackedHtml, netMattersOn: netMattersOn };
    if (typeof window !== 'undefined') window.ScorecardRows = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
