// ============================================================================
// PASTE THE ITINERARY (Road Trip, 2026-10-03)
//
// A trip is built one round at a time: pick a course, set a headcount, repeat.
// For Manny's Myrtle Beach trip - five days, five courses, tee times from the
// booking email - that is a lot of tapping to re-enter something he has already
// been sent in text.
//
// So: a box he pastes the email into. One round per line.
//
//     Tue 10/13 — Caledonia Golf & Fish Club, Pawleys Island, 8:24 AM
//     Thu 10/15 — Thistle, McKay/Cameron, Sunset Beach
//     Fri 10/16 — Prestwick or Man O' War (not chosen)
//
// This file is the PARSER and nothing else: no DOM, no database, no network. It
// turns text into rows, and says for each one what it is confident about and
// what it is not. The review screen shows those rows and the golfer fixes them
// before anything is written - because a parser that writes straight through is
// a parser whose mistakes end up in the database.
//
// ---------------------------------------------------------------------------
// WHAT IT REFUSES TO GUESS
// ---------------------------------------------------------------------------
//
// "PRESTWICK OR MAN O' WAR (NOT CHOSEN)" IS NOT A COURSE. Picking the first one
// would put a round on a course the group has not booked, and a round carries a
// par and stroke-index card that decides where handicap strokes fall. An
// undecided round is saved with NO COURSE and the trip planner lets it be filled
// in later - which is the other half of this wave, and why these two shipped
// together.
//
// A SAVED COURSE IS MATCHED BEFORE ANYTHING IS SEARCHED. The provider is on the
// FREE tier: 35 requests a day, shared by every golfer using the site, and a
// course costs two (search then detail). So the plan this file produces says
// exactly how many searches it will spend, and the review screen shows that
// number before the golfer agrees to it. Four of the five courses on Manny's own
// itinerary are already bundled.
//
// 27-HOLE COMBOS MAP TO THE RIGHT NINES. "Thistle, McKay/Cameron" is not a
// course name, it is a course and a pair of loops, and the app already models
// that (nineHoleLoops). Matching "Thistle" and dropping the nines would build the
// wrong 18 holes - par 36 + par 36 is not par 35 + par 36 - so the pair is
// parsed and carried.
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that re-declares the name.
// ============================================================================

// A line that is clearly not a round: a blank, a header, a total, a note.
var TRIP_ITIN_SKIP = /^\s*$|^\s*(itinerary|confirmation|booking|total|notes?|golf package)\b/i;

// THE DATE. Accepted shapes, in the order they are tried, and every one of them
// is something a booking email actually sends:
//
//   Tue 10/13     a weekday and a numeric date - the common one
//   10/13         bare numeric
//   Oct 13        a month name
//   Tue Oct 13    both
//   2026-10-13    ISO, if somebody pasted from a spreadsheet
//
// THE YEAR IS NOT GUESSED FROM A TWO-DIGIT NUMBER. "10/13" has no year in it,
// and inferring one from today's date is how a trip booked in December for
// January lands eleven months early. The caller passes the year it means - the
// trip's own, or the current one - and a row says which it used.
var TRIP_ITIN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7,
                         aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function tripItinPad(n) { return (n < 10 ? '0' : '') + n; }

function tripItinDate(text, defaultYear) {
    var t = String(text || '').trim();
    var year = Number(defaultYear) || null;
    var m;
    // ISO first: it carries its own year and cannot be confused with anything.
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
    if (m) return { iso: m[1] + '-' + tripItinPad(Number(m[2])) + '-' + tripItinPad(Number(m[3])), rest: t.slice(m[0].length), hadYear: true };
    // A weekday prefix is noise once the date is found, but it is also the only
    // thing that makes "Tue 10/13" different from a score line, so it is matched
    // rather than stripped blindly.
    var wd = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i.exec(t);
    if (wd) t = t.slice(wd[0].length);
    m = /^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?\b/.exec(t);
    if (m) {
        var yr = m[3] ? Number(m[3]) : year;
        if (m[3] && String(m[3]).length === 2) yr = 2000 + Number(m[3]);
        if (!yr) return null;
        return { iso: yr + '-' + tripItinPad(Number(m[1])) + '-' + tripItinPad(Number(m[2])),
                 rest: t.slice(m[0].length), hadYear: !!m[3] };
    }
    m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/i.exec(t);
    if (m) {
        var mo = TRIP_ITIN_MONTHS[String(m[1]).toLowerCase().slice(0, 4)]
              || TRIP_ITIN_MONTHS[String(m[1]).toLowerCase().slice(0, 3)];
        if (!mo) return null;
        var y2 = m[3] ? Number(m[3]) : year;
        if (!y2) return null;
        return { iso: y2 + '-' + tripItinPad(mo) + '-' + tripItinPad(Number(m[2])),
                 rest: t.slice(m[0].length), hadYear: !!m[3] };
    }
    return null;
}

// THE TEE TIME, if the line carries one. "8:24 AM", "08:24", "8:24am". Optional
// by design: half an itinerary arrives without them.
function tripItinTime(text) {
    var m = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i.exec(String(text || ''));
    if (m) {
        var h = Number(m[1]) % 12;
        if (String(m[3]).toLowerCase() === 'p') h += 12;
        return { time: tripItinPad(h) + ':' + m[2], raw: m[0] };
    }
    m = /\b(\d{1,2}):(\d{2})\b/.exec(String(text || ''));
    if (m) {
        var hh = Number(m[1]);
        if (!(hh >= 0 && hh <= 23)) return null;
        return { time: tripItinPad(hh) + ':' + m[2], raw: m[0] };
    }
    return null;
}

// AN UNDECIDED ROUND. "Prestwick or Man O' War (not chosen)", "TBD", "to be
// decided", "course TBA". The options are kept so the review screen can show
// what the golfer wrote rather than a blank.
var TRIP_ITIN_UNDECIDED = /\b(tbd|tba|to be (decided|determined|confirmed)|not (yet )?(chosen|decided|booked)|undecided)\b/i;

function tripItinUndecided(text) {
    var t = String(text || '');
    if (TRIP_ITIN_UNDECIDED.test(t)) {
        return { options: tripItinOptions(t) };
    }
    // " X or Y " with nothing else to go on is a choice nobody has made.
    var opts = tripItinOptions(t);
    if (opts.length > 1) return { options: opts };
    return null;
}

function tripItinOptions(text) {
    return String(text || '')
        .replace(/\([^)]*\)/g, ' ')                      // drop the "(not chosen)" note
        .split(/\s+\bor\b\s+/i)
        .map(function (p) { return p.replace(/[,;]\s*$/, '').trim(); })
        .filter(function (p) { return p.length > 1; });
}

// THE COURSE NAME, AND THE NINES IF IT CARRIES THEM.
//
// "Thistle, McKay/Cameron, Sunset Beach" is a course, a pair of loops, and a
// town. The town is dropped - it is in the itinerary to help a human read it,
// and matching on it would make "Sunset Beach" a candidate course name. The
// loops are kept, because 27 holes with the wrong two nines is the wrong card.
function tripItinCourse(text) {
    var t = String(text || '').replace(/^[\s—–,:-]+/, '').trim();
    if (!t) return null;
    var time = tripItinTime(t);
    if (time) t = t.replace(time.raw, ' ');
    // The nines, if a segment looks like "A/B" with letters on both sides.
    var nines = null;
    // IN BRACKETS TOO. The app's own name for that course is "Thistle Golf Club
    // (NC - 27 Hole)", so a golfer copying it writes the loops the same way -
    // "Thistle Golf Club (NC - 27 Hole) (mackay/cameron)" - and the segment rule
    // below never sees them, because the comma split leaves one segment with
    // brackets round it. Dropped silently, Thistle would play Cameron/MacKay
    // instead: two different nines, two different stroke indexes, different
    // money. The bracket with no slash in it ("(NC - 27 Hole)") is left alone.
    var paren = /\(\s*([A-Za-z][A-Za-z'\u2019 ]{1,20})\s*\/\s*([A-Za-z][A-Za-z'\u2019 ]{1,20})\s*\)/.exec(t);
    if (paren) {
        nines = [paren[1].trim(), paren[2].trim()];
        t = t.replace(paren[0], ' ').replace(/\s{2,}/g, ' ').trim();
    }
    var parts = t.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
    var kept = [];
    parts.forEach(function (p) {
        var m = /^([A-Za-z][A-Za-z'’ ]{1,20})\s*\/\s*([A-Za-z][A-Za-z'’ ]{1,20})$/.exec(p);
        if (m && !nines) { nines = [m[1].trim(), m[2].trim()]; return; }
        kept.push(p);
    });
    // THE FIRST SEGMENT IS THE COURSE. Everything after it in a booking line is
    // a town, a state or a note - "Caledonia Golf & Fish Club, Pawleys Island"
    // is one course in one town, and searching for the town finds nothing.
    var name = (kept[0] || '').replace(/[\s,;]+$/, '').trim();
    if (!name) return null;
    return { name: name, nines: nines };
}

// ---------------------------------------------------------------------------
// ONE LINE -> ONE ROW.
//
// Every row says what it is: a date, a course name or an undecided choice, and
// optionally a tee time. `why` is the sentence the review screen shows when
// something needs a human.
function tripItinParseLine(line, opts) {
    var o = opts || {};
    var raw = String(line || '');
    if (TRIP_ITIN_SKIP.test(raw)) return null;
    var d = tripItinDate(raw, o.year);
    if (!d) return { ok: false, raw: raw.trim(), why: 'No date on this line.' };

    var rest = d.rest || '';
    var time = tripItinTime(rest);
    var undecided = tripItinUndecided(rest);
    var row = {
        ok: true, raw: raw.trim(), date: d.iso, usedDefaultYear: !d.hadYear,
        time: time ? time.time : null
    };
    if (undecided) {
        row.undecided = true;
        row.options = undecided.options.map(function (p) {
            var c = tripItinCourse(p);
            return c ? c.name : p;
        }).filter(Boolean);
        row.courseName = null;
        row.why = row.options.length > 1
            ? 'Not chosen yet (' + row.options.join(' or ') + ') — the round is saved with no course.'
            : 'No course yet — the round is saved with no course.';
        return row;
    }
    var c = tripItinCourse(rest);
    if (!c) {
        row.ok = false;
        row.why = 'A date but no course name.';
        return row;
    }
    row.courseName = c.name;
    if (c.nines) row.nines = c.nines;
    return row;
}

function tripItinParse(text, opts) {
    return String(text || '').split(/\r?\n/)
        .map(function (l) { return tripItinParseLine(l, opts); })
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// THE PLAN: WHAT WILL BE MATCHED, WHAT WILL BE SEARCHED, AND WHAT IT COSTS.
//
// `known` is a map of courseKey -> name: the bundled directory plus whatever is
// in the shared list. A SAVED COURSE COSTS NOTHING, so matching comes first and
// the search list is only what is left - which on the free tier is the whole
// point, because 35 requests a day divided by a group planning a trip is not
// many.
//
// NAME MATCHING IS DELIBERATELY FORGIVING IN ONE DIRECTION ONLY. "Thistle" must
// match "Thistle Golf Club", and "Caledonia" must match "Caledonia Golf & Fish
// Club" - an itinerary drops the suffix. But two different courses must never
// collapse: the match requires one name to CONTAIN the other after
// normalisation, and refuses when more than one known course would match.
function tripItinNormalise(name) {
    return String(name || '').toLowerCase()
        .replace(/[’']/g, '')
        .replace(/&/g, ' and ')
        .replace(/\b(golf|club|course|courses|country|cc|gc|links|resort|the|at)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tripItinMatch(name, known) {
    var want = tripItinNormalise(name);
    if (!want) return null;
    var hits = [];
    Object.keys(known || {}).forEach(function (key) {
        var have = tripItinNormalise(known[key]);
        if (!have) return;
        if (have === want) { hits.push({ key: key, exact: true }); return; }
        if (have.indexOf(want) !== -1 || want.indexOf(have) !== -1) hits.push({ key: key, exact: false });
    });
    if (!hits.length) return null;
    var exact = hits.filter(function (h) { return h.exact; });
    if (exact.length === 1) return exact[0].key;
    // AMBIGUOUS IS NOT MATCHED. "Eagle's Pride" matching both the Red/Blue and
    // the Red/Green combo must ask rather than pick one - the two have different
    // stroke indexes, which is money.
    if (hits.length === 1) return hits[0].key;
    return null;
}

// THE NINES, BY NAME. "McKay/Cameron" -> the two loop keys on that course, in
// the order given, because the first nine is holes 1-9.
function tripItinNines(courseKey, nines, loops) {
    var all = (loops || {})[courseKey];
    if (!all || !nines || nines.length !== 2) return null;
    // MAC AND MC ARE THE SAME NINE, and this is not a hypothetical: Manny's own
    // itinerary says "McKay/Cameron" and the course data says "MacKay Nine".
    // Dropping the vowels makes them identical (mcky) without making two
    // genuinely different loops collide - Cameron and Stewart stay cmrn and
    // stwrt. Narrow on purpose: it is applied only to the NINES, where the set
    // is three names on one course, never to course matching, where the name
    // space is every course in the world.
    var devowel = function (x) { return String(x).replace(/[aeiou]/g, ''); };
    var pick = function (want) {
        var w = tripItinNormalise(want).replace(/\s+nine$/, '');
        if (!w) return null;
        var found = null;
        Object.keys(all).forEach(function (k) {
            if (found) return;
            var kn = tripItinNormalise(k);
            var nn = tripItinNormalise(all[k].name).replace(/\s+nine.*$/, '');
            if (kn === w || nn === w || kn.indexOf(w) !== -1 || w.indexOf(kn) !== -1) { found = k; return; }
            if (devowel(kn) === devowel(w) || devowel(nn) === devowel(w)) found = k;
        });
        return found;
    };
    var a = pick(nines[0]);
    var b = pick(nines[1]);
    if (!a || !b) return null;
    return { front: a, back: b };
}

// Returns { rows, searches, ready, problems } - everything the review screen
// needs, and the search count the golfer is agreeing to.
function tripItinPlan(text, ctx) {
    var c = ctx || {};
    var rows = tripItinParse(text, { year: c.year });
    var searches = 0;
    rows.forEach(function (row) {
        if (!row.ok) return;
        if (row.undecided) { row.courseKey = null; return; }
        var key = tripItinMatch(row.courseName, c.known || {});
        row.courseKey = key || null;
        if (key) {
            row.matchedName = (c.known || {})[key];
            if (row.nines) {
                var n = tripItinNines(key, row.nines, c.loops || {});
                if (n) { row.frontNineKey = n.front; row.backNineKey = n.back; }
                else row.why = 'Saved course, but these two nines were not recognised — pick them after saving.';
            }
            return;
        }
        // NOT SAVED: this one costs a lookup. Two requests, search then detail -
        // the search returns only a COUNT of tee boxes, so the card needs a
        // second call by id.
        row.willSearch = true;
        searches += 2;
    });
    return {
        rows: rows,
        searches: searches,
        // The free tier is 35 a day, shared by everybody. Said as a number rather
        // than a warning, because the golfer can see how many courses they pasted.
        ready: rows.filter(function (r) { return r.ok; }).length,
        problems: rows.filter(function (r) { return !r.ok; }).length
    };
}

// ONE DAY PER DATE, NOT ONE DAY PER LINE (2026-10-03).
//
// The planner counts DAYS and asks each one 18 or 36, and a trip's own round
// count comes from that. Two lines on 10/12 are one 36-hole day, so mapping a
// line to a day would have told Manny's five-day Myrtle week it was seven days
// long - and the trip leaderboard, the round-count invariant and every "Day N"
// label downstream read that number.
//
// The planner holds at most two rounds in a day. A third line on the same date
// is not refused and not dropped: it starts another day slot, which is wrong
// about the calendar and right about the money, and the golfer can see it on
// the review before anything is written. Rows must already be in date order.
function tripItinDays(rows) {
    var days = [];
    (rows || []).forEach(function (row) {
        var last = days[days.length - 1];
        if (last && last.date === row.date && last.rows.length < 2) { last.rows.push(row); return; }
        days.push({ date: row.date, rows: [row] });
    });
    return days;
}

// The label a review row reads as, so the screen and any future surface cannot
// word it differently.
function tripItinRowLabel(row) {
    if (!row) return '';
    if (!row.ok) return row.raw + ' — ' + (row.why || 'could not read this line');
    var when = row.date + (row.time ? ' ' + row.time : '');
    if (row.undecided) return when + ' — no course yet';
    var name = row.matchedName || row.courseName;
    var nines = row.frontNineKey ? ' (' + row.frontNineKey + '/' + row.backNineKey + ')' : '';
    return when + ' — ' + name + nines + (row.willSearch ? ' — will look up online' : '');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TRIP_ITIN_MONTHS, tripItinDate, tripItinTime, tripItinUndecided, tripItinOptions,
        tripItinCourse, tripItinParseLine, tripItinParse, tripItinNormalise,
        tripItinMatch, tripItinNines, tripItinPlan, tripItinDays, tripItinRowLabel
    };
}
