// ============================================================================
// SCORECARD SCAN - THE ONE VALIDATOR (server AND app)
//
// URGENT-066 item 2. A photo of a paper scorecard goes to Gemini, which reads
// the gross strokes per player per hole. This file decides which of those
// cells a golfer must look at before anything is saved. It is the SAME code in
// two places, on purpose (handoff section 7):
//
//   functions/api/_scan.js imports it to decide whether to spend ONE retry on
//     the Pro model.
//   The app loads it (classic <script>, window.ScorecardValidate) to paint the
//     confirm grid: amber = suspect cell, red = a nine whose sum does not match
//     what was written on the card.
//
// Two copies would drift - one gets fixed and the other does not - so there is
// exactly one. It is plain ES5 in the same wrapper as card-is-in.js: a browser
// sees window.ScorecardValidate, Node and the Pages bundler see module.exports.
//
// NO MONEY LOGIC HERE. This only reads digits and flags doubts. Nothing is
// written until the golfer taps "Use these scores", and then the normal
// score-entry path writes them exactly as if typed.
//
// THE ROUND CONTEXT (what the app sends with the photo, and what this reads):
//   {
//     holes: 9 | 18,                    the round's hole count
//     startHole: 1 | 10,                optional; a 9-hole round on the back = 10
//     expectedHoles: [1..18],           optional; overrides the two above
//     par: [4,5,3,...],                 par[hole-1]
//     strokeIndex: [7,1,15,...],        optional, strokeIndex[hole-1]
//     players: [{ name, initials?, nicknames?: [], handicap? }],  in round order
//     course?, tee?                     prompt context only
//   }
// ============================================================================
(function () {
    'use strict';

    // THE FREE-SCAN NUMBER. ONE constant, read by the server gate and by any
    // app copy that says how many are left. Manny picks the number (handoff
    // section 9); 3 is the placeholder he approved on Oct 24.
    var SCAN_FREE_LIMIT = 3;

    // Below this, the model is not sure enough for a golfer to skip the cell.
    var MIN_CONFIDENCE = 0.85;

    // More than this many UNSURE cells on one card is a hard failure: the
    // Flash read was poor, and that is the only time Pro is worth its price.
    // Unsure = suspect for a reason of its own (low confidence, blank, out of
    // range, an unmatched name), NOT a cell that is amber only because the
    // nine it sits in does not add up to what the pen wrote (see SUM_REASONS).
    var MAX_SUSPECT_BEFORE_RETRY = 3;

    // THE RETRY AND THE PEN (Manny's OK 2026-11-16, "scanner speed fix A").
    // A nine whose cells do not add up to the written OUT / IN / TOT is still
    // flagged red, and every cell of it still goes amber, so the golfer looks
    // at it before saving; that part has not changed. What changed is the Pro
    // retry: four live handwritten cards on Nov 16 (helpers/fixtures/
    // scan-handwritten-reads.json) came back with every digit right at 0.99,
    // and every one still cost a second, slower model call (24.8 to 29.0 s a
    // scan against 7.6 to 16.4 s without) because the PEN had added wrong and
    // a sum mismatch counted as a reason to retry. Pro was kept 0 of 4 times.
    // Now a sum mismatch alone never earns the retry. A mismatched nine that
    // also holds a cell the model was unsure about ('unsure_nine') does, and
    // so does every other hard failure, exactly as before.
    var SUM_REASONS = ['check_this_nine', 'check_total'];
    // REWRITTEN DIGITS (2026-11-17, Manny: "improve crossed-out/rewritten digit
    // reading (both test cards must pass)"). The two synthetic rewrite cards
    // (scan-test/synthetic s04, s11: a struck 4 with the correction written small
    // beside it) read the struck digit at 0.85-0.95 confidence, so nothing but the
    // pen's OUT total caught them, and after the Nov 16 prompt sentence one of the
    // two still read 4 live. Three things now stand behind that sentence:
    //   1. The schema carries `other` per cell: the second digit visible in the
    //      cell (the struck one). A cell with an `other` is amber ('rewritten'),
    //      so the golfer glances at it, but it is NOT an unsure cell: it never
    //      earns the Pro retry by itself and never counts toward the threshold.
    //   2. resolveRewrites: when a nine (or the TOT) does not add up to what the
    //      pen wrote, and swapping one cell's score with its `other` (or two
    //      cells') makes it add up exactly, the swap is taken, the cell marked
    //      swapped, and the nine stands. The model's doubt plus the pen's
    //      arithmetic settle the digit; a swap that does not add up is not taken.
    //   3. focusFor + buildPrompt(ctx, focus): the server's second, FOCUSED Flash
    //      read for a nine that still does not add up (the FOCUS block names the
    //      row, the holes, the written figure and the sum the digits make, and
    //      says to look for a second digit in each of those cells).
    var REWRITE_REASON = 'rewritten';
    function isUnsure(cell) {
        return cell.reasons.some(function (r) { return SUM_REASONS.indexOf(r) === -1 && r !== REWRITE_REASON; });
    }

    // ------------------------------------------------------------------------
    // THE RESPONSE SCHEMA sent to Gemini as generationConfig.responseSchema
    // (handoff section 6). Gemini's schema is an OpenAPI subset, written here
    // with the upper-case type names its REST reference uses.
    // ------------------------------------------------------------------------
    function responseSchema() {
        return {
            type: 'OBJECT',
            properties: {
                players: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            name: { type: 'STRING', description: "must be one of the known names, or 'UNKNOWN:<as written>'" },
                            row_label_as_written: { type: 'STRING' },
                            holes: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: {
                                        hole: { type: 'INTEGER' },
                                        score: { type: 'INTEGER', nullable: true },
                                        confidence: { type: 'NUMBER', description: '0..1' },
                                        // 2026-11-17: the second digit in a cell - the crossed-out, scribbled-over or overwritten one. null when the cell shows one digit.
                                        other: { type: 'INTEGER', nullable: true, description: 'a second digit visible in the same cell: the crossed-out, scribbled-over or overwritten one; null when the cell shows one digit' }
                                    },
                                    required: ['hole', 'score', 'confidence']
                                }
                            },
                            written_out: { type: 'INTEGER', nullable: true },
                            written_in: { type: 'INTEGER', nullable: true },
                            written_total: { type: 'INTEGER', nullable: true }
                        },
                        required: ['name', 'holes', 'written_out', 'written_in', 'written_total']
                    }
                },
                notes: { type: 'STRING' }
            },
            required: ['players']
        };
    }

    // ------------------------------------------------------------------------
    // ROUND CONTEXT HELPERS
    // ------------------------------------------------------------------------
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

    function expectedHoles(ctx) {
        var c = ctx || {};
        if (Array.isArray(c.expectedHoles) && c.expectedHoles.length) {
            return c.expectedHoles.filter(isInt).slice().sort(function (a, b) { return a - b; });
        }
        var n = c.holes === 9 ? 9 : 18;
        var start = (n === 9 && c.startHole === 10) ? 10 : 1;
        var out = [];
        for (var h = start; h < start + n; h++) out.push(h);
        return out;
    }

    function arrAt(arr, hole) {
        if (Array.isArray(arr)) { var v = arr[hole - 1]; return isInt(v) ? v : null; }
        if (arr && typeof arr === 'object') { var w = arr[hole] !== undefined ? arr[hole] : arr[String(hole)]; return isInt(w) ? w : null; }
        return null;
    }
    function parFor(ctx, hole) { return arrAt(ctx && ctx.par, hole); }
    function siFor(ctx, hole) { return arrAt(ctx && ctx.strokeIndex, hole); }

    // Strokes a player receives on a hole from a whole-number handicap and the
    // hole's stroke index - the plain allocation, used ONLY to decide how high
    // a score is believable. It never reaches a settlement.
    function strokesOn(handicap, si, holeCount) {
        if (!isInt(handicap) || handicap < 0 || !isInt(si) || si < 1) return null;
        var n = holeCount === 9 ? 9 : 18;
        var base = Math.floor(handicap / n);
        return base + (si <= handicap % n ? 1 : 0);
    }

    // ------------------------------------------------------------------------
    // NAME MATCHING. The card says "MO", "Manny", "Orozco" or "Mny"; the round
    // knows "Manny Orozco". Each written row is scored against every known
    // player, then rows are assigned best-first so two rows can never claim
    // the same golfer.
    // ------------------------------------------------------------------------
    function norm(s) {
        return String(s === null || s === undefined ? '' : s).toLowerCase()
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function initialsOf(name) {
        return norm(name).split(' ').filter(Boolean).map(function (w) { return w.charAt(0); }).join('');
    }
    function editDistance(a, b) {
        if (a === b) return 0;
        var m = a.length, n = b.length, prev = [], cur = [], i, j;
        for (j = 0; j <= n; j++) prev[j] = j;
        for (i = 1; i <= m; i++) {
            cur = [i];
            for (j = 1; j <= n; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
            }
            prev = cur;
        }
        return prev[n];
    }

    // 0 = no match. Higher = better. Exact beats everything.
    function nameScore(written, player) {
        var w = norm(written);
        if (!w || !player) return 0;
        var full = norm(player.name);
        if (!full) return 0;
        if (w === full) return 100;
        var aliases = [].concat(player.nicknames || [], player.initials ? [player.initials] : []).map(norm).filter(Boolean);
        if (aliases.indexOf(w) !== -1) return 95;
        var words = full.split(' ');
        var wNoSpace = w.replace(/ /g, '');
        if (words.indexOf(w) !== -1) return 85;                       // "Manny" or "Orozco"
        if (wNoSpace.length >= 2 && wNoSpace === initialsOf(full)) return 80;   // "MO", "M.O."
        if (w.length >= 3 && words.some(function (x) { return x.indexOf(w) === 0; })) return 70;   // "Man"
        if (w.length >= 3 && full.indexOf(w) === 0) return 70;
        // One slip of the pen on a name of four letters or more ("Mnny").
        var close = [full].concat(words).some(function (x) { return x.length >= 4 && editDistance(w, x) <= 1; });
        if (close) return 60;
        return 0;
    }

    // rows: [{ name, row_label_as_written }]. players: the round's known list.
    // Returns, per row, { index, match } where match is exact|fuzzy|none|duplicate.
    function matchNames(rows, players) {
        var known = Array.isArray(players) ? players : [];
        var cands = [];
        (rows || []).forEach(function (r, ri) {
            var said = String((r && r.name) || '');
            var unknown = /^UNKNOWN:/i.test(said);
            var tries = [];
            if (!unknown && said) tries.push(said);
            if (r && r.row_label_as_written) tries.push(r.row_label_as_written);
            if (unknown) tries.push(said.replace(/^UNKNOWN:/i, ''));
            known.forEach(function (p, pi) {
                var best = 0;
                tries.forEach(function (t) { best = Math.max(best, nameScore(t, p)); });
                if (best > 0) cands.push({ row: ri, player: pi, score: best });
            });
        });
        // Best pairs first; ties keep card order, then round order.
        cands.sort(function (a, b) { return (b.score - a.score) || (a.row - b.row) || (a.player - b.player); });
        var out = (rows || []).map(function () { return { index: -1, match: 'none' }; });
        var takenRow = {}, takenPlayer = {}, wanted = {};
        cands.forEach(function (c) {
            wanted[c.row] = wanted[c.row] || c;
            if (takenRow[c.row] || takenPlayer[c.player]) return;
            takenRow[c.row] = true; takenPlayer[c.player] = true;
            out[c.row] = { index: c.player, match: c.score >= 100 ? 'exact' : 'fuzzy' };
        });
        // A row whose only plausible golfer was already claimed is a DUPLICATE,
        // not merely unknown: the card names someone twice, or the model did.
        out.forEach(function (o, ri) { if (o.index === -1 && wanted[ri]) o.match = 'duplicate'; });
        return out;
    }

    // ------------------------------------------------------------------------
    // PARSE. Model text (or an object) -> the schema's shape, or an error.
    // A wrong shape is a validation failure, never a crash.
    // ------------------------------------------------------------------------
    function parseModelOutput(raw) {
        var obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch (e) { return { ok: false, error: 'not_json' }; }
        }
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.players)) return { ok: false, error: 'bad_shape' };
        var players = [];
        for (var i = 0; i < obj.players.length; i++) {
            var p = obj.players[i];
            if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !Array.isArray(p.holes)) {
                return { ok: false, error: 'bad_shape' };
            }
            var holes = [];
            for (var j = 0; j < p.holes.length; j++) {
                var c = p.holes[j];
                if (!c || typeof c !== 'object' || !isInt(c.hole)) return { ok: false, error: 'bad_shape' };
                holes.push({
                    hole: c.hole,
                    score: c.score === undefined ? null : c.score,
                    confidence: typeof c.confidence === 'number' && isFinite(c.confidence) ? c.confidence : 0,
                    other: isInt(c.other) ? c.other : null   // 2026-11-17: the struck digit, when the cell shows two
                });
            }
            var num = function (v) { return isInt(v) ? v : null; };
            players.push({
                name: p.name,
                row_label_as_written: typeof p.row_label_as_written === 'string' ? p.row_label_as_written : '',
                holes: holes,
                written_out: num(p.written_out),
                written_in: num(p.written_in),
                written_total: num(p.written_total)
            });
        }
        return { ok: true, value: { players: players, notes: typeof obj.notes === 'string' ? obj.notes : '' } };
    }

    // ------------------------------------------------------------------------
    // VALIDATE. The whole of handoff section 7.
    //
    // Returns {
    //   ok:            no hard failure and no suspect cell
    //   hard:          [{ code, row?, nine? }]  sum_mismatch | unmatched_name |
    //                  duplicate_name | too_many_suspect | player_count |
    //                  hole_count | parse_error
    //   suspectCount:  suspect cells across the card
    //   holes:         the holes the round expects
    //   rows: [{ row, index, name, rowLabel, match,
    //            cells: { <hole>: { score, confidence, suspect, reasons[] } },
    //            sums: { out, in, total }, written: { out, in, total },
    //            nines: { front: 'ok'|'mismatch'|'unchecked'|null, back: ... } }]
    //   missingPlayers: [known names no row matched]
    // }
    // ------------------------------------------------------------------------
    // A nine (or the whole card) against the pen's figure: swap one cell's score for
    // its `other`, or two cells', when that - and only that - makes the sum exact.
    // Returns true when a swap was taken. Cells without an `other`, a nine the pen
    // did not total, or a nine with a blank are left alone.
    function resolveRewrites(row, list, written) {
        if (written === null || !list.length) return false;
        var sum = 0, cands = [];
        for (var i = 0; i < list.length; i++) {
            var cell = row.cells[list[i]];
            if (!cell || !isInt(cell.score)) return false;
            sum += cell.score;
            if (isInt(cell.other) && !cell.swapped) cands.push(cell);
        }
        if (sum === written || !cands.length) return false;
        var swap = function (cell) { var s = cell.score; cell.score = cell.other; cell.other = s; cell.swapped = true; };
        for (var a = 0; a < cands.length; a++) {
            if (sum - cands[a].score + cands[a].other === written) { swap(cands[a]); return true; }
        }
        for (var x = 0; x < cands.length; x++) {
            for (var y = x + 1; y < cands.length; y++) {
                if (sum - cands[x].score + cands[x].other - cands[y].score + cands[y].other === written) { swap(cands[x]); swap(cands[y]); return true; }
            }
        }
        return false;
    }

    // The scores the app should show: the model's read with every swap the
    // validator took written into it (the app reads `result`, not the cells).
    // Pure: a copy; the parsed value is left as it was.
    function applyRewrites(value, validation) {
        if (!value || !Array.isArray(value.players) || !validation || !Array.isArray(validation.rows)) return value;
        var out = { players: [], notes: value.notes };
        value.players.forEach(function (p, ri) {
            var row = validation.rows[ri];
            var q = {};
            Object.keys(p).forEach(function (k) { q[k] = p[k]; });
            q.holes = p.holes.map(function (c) {
                var cell = row && row.cells && row.cells[c.hole];
                if (!cell || !cell.swapped) return c;
                var d = {};
                Object.keys(c).forEach(function (k) { d[k] = c[k]; });
                d.score = cell.score; d.other = cell.other;
                return d;
            });
            out.players.push(q);
        });
        return out;
    }

    // The FOCUS of a second read: every row whose nine (or TOT) still does not add
    // up after the swaps, with the pen's figure and the sum the digits make.
    function focusFor(validation, ctx) {
        var focus = [];
        if (!validation || !Array.isArray(validation.rows)) return focus;
        var holes = expectedHoles(ctx);
        var front = holes.filter(function (h) { return h <= 9; }), back = holes.filter(function (h) { return h >= 10; });
        validation.rows.forEach(function (row) {
            var name = row.name || row.rowLabel || '';
            var add = function (list, label, written) {
                if (written === null || written === undefined) return;
                var s = 0; list.forEach(function (h) { var v = row.cells[h] && row.cells[h].score; if (isInt(v)) s += v; });
                focus.push({ name: name, nine: label, holes: list.slice(), written: written, sum: s });
            };
            if (row.nines.front === 'mismatch') add(front, 'out', row.written && row.written.out);
            if (row.nines.back === 'mismatch') add(back, 'in', row.written && row.written['in']);
            if (row.nines.front !== 'mismatch' && row.nines.back !== 'mismatch' && row.cells && row.written && row.written.total !== null
                && row.written.total !== undefined && row.nines.front !== 'ok' && row.nines.back !== 'ok') add(holes, 'total', row.written.total);
        });
        return focus;
    }

    function validateScan(parsed, ctx) {
        var c = ctx || {};
        var known = Array.isArray(c.players) ? c.players : [];
        var holes = expectedHoles(c);
        var holeCount = holes.length;
        var hard = [];
        var result = { ok: false, hard: hard, suspectCount: 0, holes: holes, rows: [], missingPlayers: [] };

        var value = parsed && parsed.ok === true ? parsed.value : (parsed && Array.isArray(parsed.players) ? parsed : null);
        if (!value) {
            hard.push({ code: 'parse_error' });
            result.missingPlayers = known.map(function (p) { return p.name; });
            return result;
        }

        var matches = matchNames(value.players, known);
        var holeCountWrong = false;

        value.players.forEach(function (p, ri) {
            var m = matches[ri];
            var row = {
                row: ri,
                index: m.index,
                name: m.index >= 0 ? known[m.index].name : null,
                rowLabel: p.row_label_as_written || p.name,
                match: m.match,
                cells: {},
                sums: { out: null, 'in': null, total: null },
                written: { out: p.written_out, 'in': p.written_in, total: p.written_total },
                nines: { front: null, back: null }
            };
            if (m.match === 'none') hard.push({ code: 'unmatched_name', row: ri });
            if (m.match === 'duplicate') hard.push({ code: 'duplicate_name', row: ri });

            // The cells the model returned, by hole. A repeated hole keeps the
            // first and counts as a wrong hole count.
            var byHole = {};
            var returned = 0;
            p.holes.forEach(function (cell) {
                if (holes.indexOf(cell.hole) === -1 || byHole[cell.hole]) { holeCountWrong = true; return; }
                byHole[cell.hole] = cell; returned++;
            });
            if (returned !== holeCount) holeCountWrong = true;

            var player = m.index >= 0 ? known[m.index] : null;
            holes.forEach(function (h) {
                var cell = byHole[h];
                var reasons = [];
                var score = cell ? cell.score : null;
                var conf = cell ? cell.confidence : 0;
                var par = parFor(c, h);
                if (!cell) reasons.push('missing');
                else if (score === null) reasons.push('blank');
                else if (!isInt(score)) reasons.push('not_integer');
                else {
                    if (score < 1 || (par !== null && score > par + 6)) reasons.push('out_of_range');
                    if (score === 1 && par !== null && par >= 4) reasons.push('ace_on_par_' + par);
                    var hcp = player && isInt(player.handicap) ? player.handicap : null;
                    var strokes = hcp === null ? null : strokesOn(hcp, siFor(c, h), holeCount === 9 ? 9 : 18);
                    // Net double bogey + 3: par + 2 + strokes received + 3. Only
                    // when the handicap and stroke index are known - a guess here
                    // would paint honest high scores amber.
                    if (par !== null && strokes !== null && score > par + 2 + strokes + 3
                        && reasons.indexOf('out_of_range') === -1) reasons.push('above_net_double_plus_3');
                }
                if (cell && conf < MIN_CONFIDENCE) reasons.push('low_confidence');
                if (m.match === 'none' || m.match === 'duplicate') reasons.push('unmatched_name');
                var other = cell && isInt(cell.other) ? cell.other : null;
                if (other !== null) reasons.push(REWRITE_REASON);   // two digits in the cell: amber, not unsure
                row.cells[h] = { score: isInt(score) ? score : null, confidence: conf, suspect: reasons.length > 0, reasons: reasons, other: other, swapped: false };
            });

            // REWRITTEN DIGITS (header): before the sums are judged, a nine that does
            // not add up but does once one cell (or two) trades its score for its
            // `other` takes that trade. The pen's figure decides which digit stands.
            var frontH = holes.filter(function (h) { return h <= 9; });
            var backH = holes.filter(function (h) { return h >= 10; });
            resolveRewrites(row, frontH, p.written_out);
            resolveRewrites(row, backH, p.written_in);
            if (p.written_out === null && p.written_in === null) resolveRewrites(row, holes, p.written_total);

            // SUMS AGAINST WHAT WAS WRITTEN. A nine is only checked when the card
            // shows a figure for it and the round plays it. A mismatch flags
            // EVERY cell of that nine: the wrong one could be any of them.
            var sumOf = function (list) {
                var s = 0, all = true;
                list.forEach(function (h) { var v = row.cells[h] && row.cells[h].score; if (isInt(v)) s += v; else all = false; });
                return { sum: s, complete: all };
            };
            var front = holes.filter(function (h) { return h <= 9; });
            var back = holes.filter(function (h) { return h >= 10; });
            var f = sumOf(front), b = sumOf(back), t = sumOf(holes);
            row.sums.out = front.length ? f.sum : null;
            row.sums['in'] = back.length ? b.sum : null;
            row.sums.total = t.sum;
            var flagNine = function (list, why) {
                list.forEach(function (h) {
                    var cell = row.cells[h];
                    if (cell.reasons.indexOf(why) === -1) cell.reasons.push(why);
                    cell.suspect = true;
                });
            };
            var checkNine = function (list, written, key, label) {
                if (!list.length) return;
                if (written === null) { row.nines[key] = 'unchecked'; return; }
                if (written === sumOf(list).sum && sumOf(list).complete) { row.nines[key] = 'ok'; return; }
                row.nines[key] = 'mismatch';
                // Decided BEFORE the nine's own marks go on, so only a doubt
                // the model itself had counts (low confidence, blank, out of range).
                var unsure = list.some(function (h) { return isUnsure(row.cells[h]); });
                flagNine(list, 'check_this_nine');
                hard.push({ code: 'sum_mismatch', row: ri, nine: label });
                if (unsure) hard.push({ code: 'unsure_nine', row: ri, nine: label });
            };
            checkNine(front, p.written_out, 'front', 'out');
            checkNine(back, p.written_in, 'back', 'in');
            if (p.written_total !== null && !(p.written_total === t.sum && t.complete)) {
                // The total disagrees. Flag each nine that did not already prove
                // itself; if both nines matched, the pen added up wrong and every
                // cell is already backed by a matching nine.
                var unproven = [];
                if (row.nines.front !== 'ok') unproven = unproven.concat(front);
                if (row.nines.back !== 'ok') unproven = unproven.concat(back);
                if (unproven.length) {
                    var unsureTotal = unproven.some(function (h) { return isUnsure(row.cells[h]); });
                    flagNine(unproven, 'check_total');
                    hard.push({ code: 'sum_mismatch', row: ri, nine: 'total' });
                    if (unsureTotal && !hard.some(function (h) { return h.code === 'unsure_nine' && h.row === ri; })) hard.push({ code: 'unsure_nine', row: ri, nine: 'total' });
                } else {
                    row.totalWrittenWrong = true;
                }
            }
            result.rows.push(row);
        });

        if (holeCountWrong) hard.push({ code: 'hole_count' });
        if (value.players.length !== known.length) hard.push({ code: 'player_count', found: value.players.length, expected: known.length });

        var suspect = 0, unsure = 0;
        result.rows.forEach(function (r) { Object.keys(r.cells).forEach(function (h) {
            if (r.cells[h].suspect) suspect++;
            if (isUnsure(r.cells[h])) unsure++;
        }); });
        result.suspectCount = suspect;       // what the app paints amber (unchanged)
        result.unsureCount = unsure;         // what the retry decision counts
        if (unsure > MAX_SUSPECT_BEFORE_RETRY) hard.push({ code: 'too_many_suspect', count: unsure });

        var claimed = {};
        result.rows.forEach(function (r) { if (r.index >= 0) claimed[r.index] = true; });
        result.missingPlayers = known.filter(function (p, i) { return !claimed[i]; }).map(function (p) { return p.name; });
        result.ok = hard.length === 0 && suspect === 0;
        return result;
    }

    // ONE retry on Pro, and only for a hard failure (handoff section 7) that a
    // second read could fix. A sum mismatch on its own is the pen's arithmetic,
    // not the model's reading: it stays a hard failure for the golfer's screen
    // and earns no retry (see THE RETRY AND THE PEN above).
    function needsRetry(validation) {
        if (!validation || !Array.isArray(validation.hard)) return false;
        return validation.hard.some(function (h) { return h.code !== 'sum_mismatch'; });
    }

    // Which of two validated reads to show. Fewer hard failures wins, then
    // fewer suspect cells; a tie keeps the FIRST (the Flash read), because the
    // retry has to earn its place.
    function betterOf(a, b) {
        if (!b) return 'first';
        if (!a) return 'second';
        if (b.hard.length !== a.hard.length) return b.hard.length < a.hard.length ? 'second' : 'first';
        if (b.suspectCount !== a.suspectCount) return b.suspectCount < a.suspectCount ? 'second' : 'first';
        return 'first';
    }

    // ------------------------------------------------------------------------
    // THE PROMPT (handoff section 5): everything we already know, so the model
    // only has to read digits. Names are sent because matching handwriting to
    // the round's golfers is the job; nothing else about them is.
    // ------------------------------------------------------------------------
    // 2026-11-17: `focus` (focusFor) adds the FOCUS block for the server's second,
    // careful read of a nine that did not add up. Without it the prompt is the one
    // the first read sends.
    function buildPrompt(ctx, focus) {
        var c = ctx || {};
        var holes = expectedHoles(c);
        var f = Array.isArray(focus) ? focus : [];
        var known = (Array.isArray(c.players) ? c.players : []).map(function (p, i) {
            var extra = [].concat(p.initials ? [p.initials] : [], p.nicknames || []).filter(Boolean);
            return (i + 1) + '. ' + String(p.name || '') + (extra.length ? ' (also written as: ' + extra.join(', ') + ')' : '');
        });
        var line = function (label, fn) { return label + ': ' + holes.map(function (h) { var v = fn(c, h); return h + '=' + (v === null ? '?' : v); }).join(', '); };
        return [
            'You are reading a photo of a handwritten golf scorecard.',
            'Course: ' + String(c.course || 'unknown') + (c.tee ? ' (' + c.tee + ' tees)' : '') + '.',
            'This round plays ' + holes.length + ' holes: ' + holes.join(', ') + '. Front nine = holes 1-9 (OUT), back nine = holes 10-18 (IN).',
            line('Par per hole', parFor),
            line('Stroke index per hole', siFor),
            'There are ' + known.length + ' players, in this order:',
            known.join('\n'),
            'Rules:',
            '- Read ONLY the gross strokes for each player on each hole.',
            '- Ignore putts, dots, handicap stroke dots, circles, squares, match marks, + and - signs, and anything that is not the stroke count.',
            // Manny's typed OK 2026-11-16 ("scanner event list" item 4): two synthetic cards with a crossed-out digit and a new one written
            // beside it read the STRUCK digit both times (scan-test/synthetic s04, s11, Nov 16); both were caught only because the written
            // total disagreed. The rule names the case; a scan that still cannot tell says null, which the validator flags, never a silent digit.
            // 2026-11-17 (Manny, "improve crossed-out/rewritten digit reading"): the Nov 16 sentence named the case; this one
            // says what the cell looks like, names the `other` field and makes the choice explicit. One of the two synthetic
            // rewrite cards (s11) still read the struck 4 at 0.9 live on Nov 16 with the shorter sentence.
            '- A cell may hold TWO digits: an earlier one crossed out, scribbled over or written over, and the correction written beside, above or on top of it, often smaller or heavier. The correction is the score; put the crossed-out digit in other (null when the cell shows one digit). If you cannot tell which digit stands, return score null with low confidence and the digit you doubt in other.',
            '- Map each handwritten name or initials to one of the known players above and return that exact name. If a row cannot be matched, return name "UNKNOWN:" followed by what is written.',
            '- Put what the row label actually says in row_label_as_written.',
            '- If a cell is blank or you cannot read it, return score null with low confidence. Never guess or invent a score.',
            '- confidence is 0 to 1: how sure you are of that one digit.',
            '- Report the OUT, IN and TOTAL exactly as written on the card in written_out, written_in, written_total (null if not written). Do not calculate them.',
            '- Return one entry per hole listed above for every player, and nothing else.'
        ].concat(f.length ? [
            'FOCUS - a second, careful read. The first read of these cells did not add up to what the pen wrote:',
            f.map(function (x) {
                var span = x.holes.length ? 'holes ' + x.holes[0] + '-' + x.holes[x.holes.length - 1] : 'holes';
                var word = x.nine === 'out' ? 'OUT' : (x.nine === 'in' ? 'IN' : 'TOTAL');
                return '- ' + x.name + ', ' + span + ': the written ' + word + ' is ' + x.written + ' but the digits read add to ' + x.sum + '. Look at each of these cells for a second digit - a crossed-out, scribbled-over or overwritten one with the correction written beside, above or on top of it, often smaller. The correction is the score; the struck digit goes in other.';
            }).join('\n'),
            'Return the whole card again, every player and every hole, with these cells read again.'
        ] : []).join('\n');
    }

    var api = {
        SCAN_FREE_LIMIT: SCAN_FREE_LIMIT,
        MIN_CONFIDENCE: MIN_CONFIDENCE,
        MAX_SUSPECT_BEFORE_RETRY: MAX_SUSPECT_BEFORE_RETRY,
        responseSchema: responseSchema,
        expectedHoles: expectedHoles,
        strokesOn: strokesOn,
        nameScore: nameScore,
        matchNames: matchNames,
        parseModelOutput: parseModelOutput,
        validateScan: validateScan,
        applyRewrites: applyRewrites,
        focusFor: focusFor,
        needsRetry: needsRetry,
        betterOf: betterOf,
        buildPrompt: buildPrompt
    };
    if (typeof window !== 'undefined') window.ScorecardValidate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
