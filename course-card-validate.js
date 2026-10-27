// ============================================================================
// COURSE-CARD SCAN - THE ONE VALIDATOR (server AND app)            080, Oct 26
//
// "Course mode" of the scan server: a photo of a BLANK printed scorecard in,
// the course's card out - pars, the men's and ladies' handicap (stroke index)
// rows, and each tee's per-hole yardages. Same pattern as scorecard-validate.js
// (the score mode, which this file does not touch): one plain ES5 file that
// functions/api/_scan.js imports and the app can load as a classic <script>
// (window.CourseCardValidate), so the server's retry decision and the app's
// amber cells come from the same code.
//
// WHAT IS READ (DECISIONS.md, Oct 26): tee NAMES + YARDAGES only. Course
// rating and slope are never read or returned - they move handicap strokes,
// which moves money. Nothing here writes anywhere: the app saves the card
// through its normal typed-pars path after the golfer has looked at it.
//
// HARD CHECKS (any one earns the ONE Pro retry; Save stays off in the app):
//   par_range       a par that is not a whole number 3-6 (or is missing)
//   par_total       total par outside 60-75 (18 holes) / 27-38 (9 holes)
//   par_written     the printed par OUT / IN / TOTAL disagrees with the cells
//   hcp_men         the men's HCP row does not use 1..N exactly once
//   hcp_ladies      a ladies' HCP row was returned but does not use 1..N once
//   tee_written     a tee's yardages do not add up to its printed OUT/IN/TOTAL
//   hole_count      a row is not N long, or no tee / no par row at all
//   parse_error     the answer did not parse
// SOFT (amber, Save allowed after a look):
//   yards_range     a yardage outside 50-700
//   unsure          a cell the model itself said it was not sure of
// ============================================================================
(function () {
    'use strict';

    // Course scans get their OWN free allowance, separate from the 3 score
    // scans (DECISIONS.md, Oct 26: "its own 3 free").
    var COURSE_SCAN_FREE_LIMIT = 3;

    var PAR_TOTAL = { 18: [60, 75], 9: [27, 38] };
    var YARDS = [50, 700];

    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

    // ------------------------------------------------------------------------
    // THE RESPONSE SCHEMA (Gemini OpenAPI subset). Compact on purpose: no
    // per-cell confidence object (that roughly triples the output tokens) -
    // an `unsure` list names the few cells the model doubts instead.
    // ------------------------------------------------------------------------
    function responseSchema() {
        var ints = { type: 'ARRAY', items: { type: 'INTEGER', nullable: true } };
        var written = {
            type: 'OBJECT',
            properties: {
                out: { type: 'INTEGER', nullable: true },
                'in': { type: 'INTEGER', nullable: true },
                total: { type: 'INTEGER', nullable: true }
            }
        };
        return {
            type: 'OBJECT',
            properties: {
                course_name: { type: 'STRING', nullable: true },
                holes: { type: 'INTEGER' },
                par: ints,
                par_written: written,
                hcp_men: ints,
                hcp_ladies: ints,
                tees: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            name: { type: 'STRING' },
                            yards: ints,
                            written: written
                        },
                        required: ['name', 'yards']
                    }
                },
                unsure: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: { row: { type: 'STRING' }, hole: { type: 'INTEGER' } },
                        required: ['row', 'hole']
                    }
                },
                notes: { type: 'STRING' }
            },
            required: ['holes', 'par', 'hcp_men', 'tees']
        };
    }

    // ------------------------------------------------------------------------
    // THE PROMPT. Built from the hole count and an optional course name only -
    // nothing about the golfer, and no location.
    // ------------------------------------------------------------------------
    function buildCoursePrompt(ctx) {
        var c = ctx || {};
        var n = c.holes === 9 ? 9 : 18;
        return [
            'You are reading a photo of a BLANK printed golf scorecard to learn the course\'s card.',
            (c.name ? 'The golfer says the course is: ' + String(c.name).slice(0, 120) + '.' : 'The course name is not known.'),
            'The card should have ' + n + ' holes. Return arrays of exactly ' + n + ' entries, hole 1 first.',
            'Read ONLY these printed rows:',
            '- course_name: the course or club name if it is printed on the card, else null.',
            '- par: the printed Par row, one number per hole. par_written: the Par row\'s printed OUT, IN and TOTAL exactly as printed.',
            '- hcp_men: the men\'s Handicap / HCP / Hdcp / Stroke Index row. If there is only one handicap row, it goes here.',
            '- hcp_ladies: the ladies\' / women\'s handicap row, if the card prints one separately; else an empty array. Never copy the men\'s row into it.',
            '- tees: every tee yardage row (the rows named for a tee color or name, e.g. Black, Blue, White, Gold, Red, or combos like Blue/White). name = the tee name exactly as printed, without any rating or slope. yards = one yardage per hole. written = that row\'s printed OUT, IN and TOTAL yardage exactly as printed.',
            'Rows can be anywhere on the card: a tee or handicap row may be printed BELOW the empty score boxes, and the Par row may sit in the middle. Check the whole card.',
            'Ignore: course rating and slope numbers, the empty score boxes, any handwriting, column headings such as HCP / NET / INITIAL, logos, ads and watermarks or text printed across the card.',
            'Never guess or calculate a number. If a cell cannot be read, return null for it and add {row, hole} to unsure (row = "par", "hcp_men", "hcp_ladies" or the tee name). Also list any cell you are not sure of.',
            'Do not calculate OUT, IN or TOTAL; copy them as printed, or null if not printed.',
            'holes = ' + n + '. notes: anything odd about the card, in a few words.'
        ].join('\n');
    }

    // ------------------------------------------------------------------------
    // PARSE. Model text (or an object) -> a clean shape, or an error.
    // ------------------------------------------------------------------------
    function intsOrNull(a) {
        if (!Array.isArray(a)) return null;
        return a.map(function (v) { return isInt(v) ? v : null; });
    }
    function writtenOf(w) {
        var o = w && typeof w === 'object' ? w : {};
        return { out: isInt(o.out) ? o.out : null, 'in': isInt(o['in']) ? o['in'] : null, total: isInt(o.total) ? o.total : null };
    }
    function parseCourseOutput(raw) {
        var obj = raw;
        if (typeof raw === 'string') {
            try { obj = JSON.parse(raw); } catch (e) { return { ok: false, error: 'not_json' }; }
        }
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.par) || !Array.isArray(obj.tees)) return { ok: false, error: 'bad_shape' };
        var tees = [];
        for (var i = 0; i < obj.tees.length; i++) {
            var t = obj.tees[i];
            if (!t || typeof t !== 'object' || typeof t.name !== 'string' || !Array.isArray(t.yards)) return { ok: false, error: 'bad_shape' };
            tees.push({ name: t.name.trim().slice(0, 40), yards: intsOrNull(t.yards), written: writtenOf(t.written) });
        }
        var unsure = (Array.isArray(obj.unsure) ? obj.unsure : []).filter(function (u) {
            return u && typeof u.row === 'string' && isInt(u.hole);
        }).map(function (u) { return { row: u.row, hole: u.hole }; });
        return {
            ok: true,
            value: {
                course_name: typeof obj.course_name === 'string' && obj.course_name.trim() ? obj.course_name.trim().slice(0, 120) : null,
                holes: isInt(obj.holes) ? obj.holes : obj.par.length,
                par: intsOrNull(obj.par),
                par_written: writtenOf(obj.par_written),
                hcp_men: intsOrNull(obj.hcp_men) || [],
                hcp_ladies: intsOrNull(obj.hcp_ladies) || [],
                tees: tees,
                unsure: unsure,
                notes: typeof obj.notes === 'string' ? obj.notes.slice(0, 300) : ''
            }
        };
    }

    // ------------------------------------------------------------------------
    // VALIDATE.
    // Returns { ok, hard:[{code,row?,hole?,nine?}], soft:[...], suspectCount,
    //           saveLadies, parTotal }
    // ------------------------------------------------------------------------
    function sum(a, from, to) {
        var s = 0;
        for (var i = from; i < to; i++) { if (!isInt(a[i])) return null; s += a[i]; }
        return s;
    }
    // Printed OUT / IN / TOTAL against the cells. A total not printed is not checked.
    function writtenMismatches(cells, written, n) {
        var bad = [];
        if (!written) return bad;
        if (n === 18) {
            var o = sum(cells, 0, 9), i = sum(cells, 9, 18), t = sum(cells, 0, 18);
            if (written.out !== null && o !== written.out) bad.push('out');
            if (written['in'] !== null && i !== written['in']) bad.push('in');
            if (written.total !== null && t !== written.total) bad.push('total');
        } else {
            var s = sum(cells, 0, n);
            // A 9-hole card prints its sum as OUT or TOTAL.
            if (written.out !== null && s !== written.out) bad.push('out');
            if (written.total !== null && s !== written.total) bad.push('total');
        }
        return bad;
    }
    // 1..n each exactly once.
    function isPermutation(row, n) {
        if (!Array.isArray(row) || row.length !== n) return false;
        var seen = {};
        for (var i = 0; i < n; i++) {
            var v = row[i];
            if (!isInt(v) || v < 1 || v > n || seen[v]) return false;
            seen[v] = true;
        }
        return true;
    }

    function validateCourse(parsed, ctx) {
        var c = ctx || {};
        var hard = [], soft = [];
        if (!parsed || !parsed.ok) {
            return { ok: false, hard: [{ code: 'parse_error' }], soft: [], suspectCount: 0, saveLadies: false, parTotal: null };
        }
        var v = parsed.value;
        var n = c.holes === 9 ? 9 : (c.holes === 18 ? 18 : (v.holes === 9 ? 9 : 18));

        // Par
        var par = v.par || [];
        if (par.length !== n) hard.push({ code: 'hole_count', row: 'par' });
        for (var h = 0; h < n; h++) {
            var p = par[h];
            if (!isInt(p) || p < 3 || p > 6) hard.push({ code: 'par_range', row: 'par', hole: h + 1 });
        }
        var parTotal = sum(par, 0, n);
        var range = PAR_TOTAL[n];
        if (parTotal === null || parTotal < range[0] || parTotal > range[1]) hard.push({ code: 'par_total', row: 'par' });
        writtenMismatches(par, v.par_written, n).forEach(function (nine) { hard.push({ code: 'par_written', row: 'par', nine: nine }); });

        // Handicap rows
        if (!isPermutation(v.hcp_men, n)) hard.push({ code: 'hcp_men', row: 'hcp_men' });
        var ladiesGiven = v.hcp_ladies.some(function (x) { return x !== null; });
        var ladiesOk = ladiesGiven && isPermutation(v.hcp_ladies, n);
        if (ladiesGiven && !ladiesOk) hard.push({ code: 'hcp_ladies', row: 'hcp_ladies' });

        // Tees
        if (!v.tees.length) hard.push({ code: 'hole_count', row: 'tees' });
        v.tees.forEach(function (t) {
            if (t.yards.length !== n) { hard.push({ code: 'hole_count', row: t.name }); return; }
            writtenMismatches(t.yards, t.written, n).forEach(function (nine) { hard.push({ code: 'tee_written', row: t.name, nine: nine }); });
            t.yards.forEach(function (y, i) {
                if (!isInt(y) || y < YARDS[0] || y > YARDS[1]) soft.push({ code: 'yards_range', row: t.name, hole: i + 1 });
            });
        });

        v.unsure.forEach(function (u) { soft.push({ code: 'unsure', row: u.row, hole: u.hole }); });

        return {
            ok: hard.length === 0 && soft.length === 0,
            hard: hard,
            soft: soft,
            suspectCount: soft.length,
            // DECISIONS.md: ALSO save the ladies' row - only when it was read right.
            saveLadies: ladiesOk,
            parTotal: parTotal
        };
    }

    // Same rules as the score path: ONE Pro retry, only for a hard failure;
    // fewer hard fails wins, then fewer soft; a tie keeps the Flash read.
    function needsRetry(validation) {
        return !!(validation && Array.isArray(validation.hard) && validation.hard.length > 0);
    }
    function betterOf(a, b) {
        if (!b) return 'first';
        if (!a) return 'second';
        if (b.hard.length !== a.hard.length) return b.hard.length < a.hard.length ? 'second' : 'first';
        if (b.suspectCount !== a.suspectCount) return b.suspectCount < a.suspectCount ? 'second' : 'first';
        return 'first';
    }

    var api = {
        COURSE_SCAN_FREE_LIMIT: COURSE_SCAN_FREE_LIMIT,
        responseSchema: responseSchema,
        buildCoursePrompt: buildCoursePrompt,
        parseCourseOutput: parseCourseOutput,
        validateCourse: validateCourse,
        needsRetry: needsRetry,
        betterOf: betterOf
    };
    if (typeof window !== 'undefined') window.CourseCardValidate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
