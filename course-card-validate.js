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
// WHAT IS READ. Oct 26 (DECISIONS.md): tee NAMES + YARDAGES only; rating and
// slope were left out because they move handicap strokes, which moves money.
// Nov 16 2026 (Manny, typed in the tournaments tab: "OK scanner reads course
// rating + slope per tee (front or back of the card)"): each tee's printed
// Course Rating and Slope ARE read now - the men's pair (or the only pair
// printed) as rating / slope, a ladies' pair as rating_ladies / slope_ladies -
// from wherever the card prints them: the tee-name cell ("Copper 72.1/128"),
// a ratings table, or the BACK of the card, which the caller may send as a
// second photo. They are checked SOFTLY only (below): a wrong rating is amber
// for the golfer to look at, never a Pro retry. Nothing here writes anywhere:
// the app saves the card through its normal typed path after the golfer has
// looked at it.
//
// THE RANGE (Nov 16 2026, 23:16, Advisor "rating range - use the app's numbers",
// asked by the iOS lane: the app checked 55-80 while this file said 55-85): the
// server's range is the APP's range - an 18-hole course rating 55.0-80.0, a
// 9-hole rating 27.0-40.0, slope 55-155 on both. A value outside it is flagged
// (rating_range / slope_range, soft, below) AND comes back NULL in the result
// for the golfer to type - withRatingsInRange(), which the server applies to the
// read it picks. It is NEVER clamped to the edge of the range: 95.0 becomes
// null, not 80.0, because a rating that is wrong by a digit moves handicap
// strokes, and a clamped one would look right.
//
// HARD CHECKS (any one earns the ONE Pro retry; Save stays off in the app):
//   par_range       a par that is not a whole number 3-6 (or is missing)
//   par_total       total par outside 60-75 (18 holes) / 27-38 (9 holes)
//   par_written     the printed par OUT / IN / TOTAL disagrees with the cells
//   hcp_men         the men's HCP row does not use 1..N exactly once
//   hcp_ladies      a ladies' HCP row was returned but does not use 1..N once
//   hole_count      a row is not N long, or no tee / no par row at all
//   parse_error     the answer did not parse
// SOFT (amber, Save allowed after a look; never earns the Pro retry):
//   tee_written     a tee's yardages do not add up to its printed OUT/IN/TOTAL
//                   (tfweb-2, Manny Oct 26: AMBER for the golfer to fix, not
//                   a block or a retry - a soft warning in the response)
//   yards_range     a yardage outside 50-700
//   rating_range    a tee's course rating outside the app's range: 55.0-80.0 on an
//                   18-hole card, 27.0-40.0 on a 9-hole card (who: men | ladies);
//                   the value comes back null (see THE RANGE above)
//   slope_range     a tee's slope outside 55-155, the USGA range (who: men | ladies);
//                   the value comes back null
//   rating_pair     a rating without its slope, or a slope without its rating
//   unsure          a cell the model itself said it was not sure of (hole 0 =
//                   that tee's rating / slope cell)
// ============================================================================
(function () {
    'use strict';

    // Course scans get their OWN free allowance, separate from the 3 score
    // scans (DECISIONS.md, Oct 26: "its own 3 free").
    var COURSE_SCAN_FREE_LIMIT = 3;

    var PAR_TOTAL = { 18: [60, 75], 9: [27, 38] };
    var YARDS = [50, 700];
    // Course rating (one decimal) by hole count - the APP's numbers (THE RANGE, above).
    var RATING = { 18: [55, 80], 9: [27, 40] };
    var SLOPE = [55, 155];      // the USGA slope range, 9 or 18 holes

    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
    function isNum(n) { return typeof n === 'number' && isFinite(n); }

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
                            written: written,
                            // Nov 16: the tee's printed Course Rating / Slope (men's, or the only pair), and the ladies' pair.
                            rating: { type: 'NUMBER', nullable: true },
                            slope: { type: 'INTEGER', nullable: true },
                            rating_ladies: { type: 'NUMBER', nullable: true },
                            slope_ladies: { type: 'INTEGER', nullable: true }
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
    // THE PROMPT. Built from the hole count, an optional course name and the
    // number of photos (1, or 2 when the back of the card came too) - nothing
    // about the golfer, and no location.
    // ------------------------------------------------------------------------
    function buildCoursePrompt(ctx) {
        var c = ctx || {};
        var n = c.holes === 9 ? 9 : 18;
        var two = c.photos === 2;
        return [
            (two
                ? 'You are reading two photos of the same BLANK printed golf scorecard to learn the course\'s card: the FRONT of the card (the hole grid) and the BACK of the same card. Read each row from whichever side prints it; the course rating and slope are often on the back.'
                : 'You are reading a photo of a BLANK printed golf scorecard to learn the course\'s card.'),
            (c.name ? 'The golfer says the course is: ' + String(c.name).slice(0, 120) + '.' : 'The course name is not known.'),
            'The card should have ' + n + ' holes. Return arrays of exactly ' + n + ' entries, hole 1 first.',
            'Read ONLY these printed rows:',
            '- course_name: the course or club name if it is printed on the card, else null.',
            '- par: the printed Par row, one number per hole. par_written: the Par row\'s printed OUT, IN and TOTAL exactly as printed.',
            '- hcp_men: the men\'s Handicap / HCP / Hdcp / Stroke Index row. If there is only one handicap row, it goes here.',
            '- hcp_ladies: the ladies\' / women\'s handicap row, if the card prints one separately; else an empty array. Never copy the men\'s row into it.',
            '- tees: every tee yardage row (the rows named for a tee color or name, e.g. Black, Blue, White, Gold, Red, or combos like Blue/White). name = the tee name exactly as printed, without any rating or slope. yards = one yardage per hole. written = that row\'s printed OUT, IN and TOTAL yardage exactly as printed.',
            '- rating / slope: that tee\'s printed Course Rating (a number with one decimal, e.g. 72.1) and Slope (a whole number, e.g. 128), wherever the card prints them: in the tee-name cell (e.g. "Copper 72.1/128"), in a ratings table, or on the back of the card. The men\'s pair (or the only pair printed) goes in rating / slope; a ladies\' / women\'s pair goes in rating_ladies / slope_ladies. null for a pair the card does not print. A rating printed for a tee that has no yardage row goes in notes, not in tees.',
            'Rows can be anywhere on the card: a tee or handicap row may be printed BELOW the empty score boxes, and the Par row may sit in the middle. Check the whole card.',
            'Ignore: the empty score boxes, any handwriting, column headings such as HCP / NET / INITIAL, logos, ads and watermarks or text printed across the card.',
            'Never guess or calculate a number. If a cell cannot be read, return null for it and add {row, hole} to unsure (row = "par", "hcp_men", "hcp_ladies" or the tee name; hole = 0 for a rating or slope cell). Also list any cell you are not sure of.',
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
    // A course rating is a number to one decimal (72.1); a slope a whole number. Anything else is null.
    function ratingOf(v) { return isNum(v) ? Math.round(v * 10) / 10 : null; }
    function slopeOf(v) { return isInt(v) ? v : null; }
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
            tees.push({
                name: t.name.trim().slice(0, 40), yards: intsOrNull(t.yards), written: writtenOf(t.written),
                rating: ratingOf(t.rating), slope: slopeOf(t.slope),
                rating_ladies: ratingOf(t.rating_ladies), slope_ladies: slopeOf(t.slope_ladies)
            });
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
    // The card's hole count: the caller's word first (the body's course.holes), then
    // the model's, 18 unless it is 9. validateCourse and withRatingsInRange agree.
    function holesOf(v, c) {
        return c.holes === 9 ? 9 : (c.holes === 18 ? 18 : (v && v.holes === 9 ? 9 : 18));
    }
    function ratingInRange(rating, n) { var r = RATING[n]; return rating !== null && rating >= r[0] && rating <= r[1]; }
    function slopeInRange(slope) { return slope !== null && slope >= SLOPE[0] && slope <= SLOPE[1]; }
    // A tee's rating / slope pair, SOFT only: both null is a card that does not print
    // one; one of the two missing is rating_pair; a value outside the range for n
    // holes is rating_range / slope_range. who = 'men' | 'ladies'.
    function ratingFlags(row, rating, slope, who, n, soft) {
        if (rating === null && slope === null) return;
        if (rating === null || slope === null) soft.push({ code: 'rating_pair', row: row, who: who });
        if (rating !== null && !ratingInRange(rating, n)) soft.push({ code: 'rating_range', row: row, who: who });
        if (slope !== null && !slopeInRange(slope)) soft.push({ code: 'slope_range', row: row, who: who });
    }
    // THE RANGE (header): a copy of a parsed card's value with every rating / slope
    // outside the range for its hole count set to NULL - the golfer types it. Never
    // clamped. Pure: the input is left as it was; everything else is carried over.
    function withRatingsInRange(value, ctx) {
        if (!value || !Array.isArray(value.tees)) return value;
        var n = holesOf(value, ctx || {});
        var out = {};
        Object.keys(value).forEach(function (k) { out[k] = value[k]; });
        out.tees = value.tees.map(function (t) {
            var u = {};
            Object.keys(t).forEach(function (k) { u[k] = t[k]; });
            u.rating = ratingInRange(t.rating, n) ? t.rating : null;
            u.slope = slopeInRange(t.slope) ? t.slope : null;
            u.rating_ladies = ratingInRange(t.rating_ladies, n) ? t.rating_ladies : null;
            u.slope_ladies = slopeInRange(t.slope_ladies) ? t.slope_ladies : null;
            return u;
        });
        return out;
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
        var n = holesOf(v, c);

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
            writtenMismatches(t.yards, t.written, n).forEach(function (nine) { soft.push({ code: 'tee_written', row: t.name, nine: nine }); });
            t.yards.forEach(function (y, i) {
                if (!isInt(y) || y < YARDS[0] || y > YARDS[1]) soft.push({ code: 'yards_range', row: t.name, hole: i + 1 });
            });
            ratingFlags(t.name, t.rating, t.slope, 'men', n, soft);
            ratingFlags(t.name, t.rating_ladies, t.slope_ladies, 'ladies', n, soft);
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
        withRatingsInRange: withRatingsInRange,
        needsRetry: needsRetry,
        betterOf: betterOf
    };
    if (typeof window !== 'undefined') window.CourseCardValidate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
