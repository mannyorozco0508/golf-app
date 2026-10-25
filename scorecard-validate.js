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

    // More than this many suspect cells on one card is a hard failure: the
    // Flash read was poor, and that is the only time Pro is worth its price.
    var MAX_SUSPECT_BEFORE_RETRY = 3;

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
                                        confidence: { type: 'NUMBER', description: '0..1' }
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
                    confidence: typeof c.confidence === 'number' && isFinite(c.confidence) ? c.confidence : 0
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
                row.cells[h] = { score: isInt(score) ? score : null, confidence: conf, suspect: reasons.length > 0, reasons: reasons };
            });

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
                flagNine(list, 'check_this_nine');
                hard.push({ code: 'sum_mismatch', row: ri, nine: label });
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
                    flagNine(unproven, 'check_total');
                    hard.push({ code: 'sum_mismatch', row: ri, nine: 'total' });
                } else {
                    row.totalWrittenWrong = true;
                }
            }
            result.rows.push(row);
        });

        if (holeCountWrong) hard.push({ code: 'hole_count' });
        if (value.players.length !== known.length) hard.push({ code: 'player_count', found: value.players.length, expected: known.length });

        var suspect = 0;
        result.rows.forEach(function (r) { Object.keys(r.cells).forEach(function (h) { if (r.cells[h].suspect) suspect++; }); });
        result.suspectCount = suspect;
        if (suspect > MAX_SUSPECT_BEFORE_RETRY) hard.push({ code: 'too_many_suspect', count: suspect });

        var claimed = {};
        result.rows.forEach(function (r) { if (r.index >= 0) claimed[r.index] = true; });
        result.missingPlayers = known.filter(function (p, i) { return !claimed[i]; }).map(function (p) { return p.name; });
        result.ok = hard.length === 0 && suspect === 0;
        return result;
    }

    // ONE retry on Pro, and only for a hard failure (handoff section 7).
    function needsRetry(validation) {
        return !!(validation && Array.isArray(validation.hard) && validation.hard.length > 0);
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
    function buildPrompt(ctx) {
        var c = ctx || {};
        var holes = expectedHoles(c);
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
            '- Map each handwritten name or initials to one of the known players above and return that exact name. If a row cannot be matched, return name "UNKNOWN:" followed by what is written.',
            '- Put what the row label actually says in row_label_as_written.',
            '- If a cell is blank or you cannot read it, return score null with low confidence. Never guess or invent a score.',
            '- confidence is 0 to 1: how sure you are of that one digit.',
            '- Report the OUT, IN and TOTAL exactly as written on the card in written_out, written_in, written_total (null if not written). Do not calculate them.',
            '- Return one entry per hole listed above for every player, and nothing else.'
        ].join('\n');
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
        needsRetry: needsRetry,
        betterOf: betterOf,
        buildPrompt: buildPrompt
    };
    if (typeof window !== 'undefined') window.ScorecardValidate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
