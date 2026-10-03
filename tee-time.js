// ============================================================================
// THE TEE TIME A ROUND NEVER HAD (Wave 39)
//
// Wave 39's recon found that a round carries no tee time at all: `roundDay` is a
// LABEL ("Single Round") and `createdAt` is when the round was made. So a golfer
// opening a round could not see when the group tees off, and the "you're in"
// notification had nothing to quote.
//
// A 30-MINUTE REMINDER WAS BUILT HERE AND REMOVED on Manny's call before it
// shipped. The FIELD stays, on every surface that shows it; the two functions
// only the reminder used (teeTimeReminderAt, teeTimeChanged) came out with it,
// because unreachable code still ships and git history is the right home for
// code that is not running.
//
// THIS FILE IS THE WHOLE RULE, and it is pure: no DOM, no db, no Date.now()
// except where a caller passes one in. One builder, because four surfaces read a
// tee time - the setup screen that sets it, the scorecard header, the Game tab,
// and the trip planner - and a hand-written formatter per page is how one of them
// ends up an hour out.
//
// ---------------------------------------------------------------------------
// WHAT IS STORED, AND WHY IT IS TWO FIELDS
// ---------------------------------------------------------------------------
//
//     teeTimeISO    "2026-10-04T08:40:00-07:00"   an instant, offset included
//     teeTimeZone   "America/Phoenix"             the zone it was SET in
//
// THE ISO STRING ALONE IS NOT ENOUGH, and this is the trap worth spelling out.
// An instant answers "when does the group tee off" - that is what a reminder is
// scheduled against, and it is unambiguous. It does NOT answer "what time does
// the card say", because a golfer in Phoenix and a spectator in New York reading
// the same round must both see 8:40 AM: the tee time is a fact about the golf
// course, not about the reader's phone. Rendering an instant in the READER's
// zone is how a Road Trip round in Oregon reads 8:40 to the organizer and 11:40
// to his wife at home, and she turns up three hours early.
//
// So the zone is stored beside the instant and every display goes through it.
// Intl.DateTimeFormat with a timeZone does the work; where Intl is missing or
// the zone is one it does not know, the OFFSET INSIDE THE ISO STRING is the
// fallback and it is still right - it was recorded at the course.
//
// AND THE OFFSET IS NOT COMPUTED FROM THE ZONE NAME LATER. Daylight saving moves:
// a round set in March for August would get the wrong offset if we re-derived it,
// so the offset is captured at the moment the organizer typed the time and never
// recalculated.
//
// OPTIONAL, AND ABSENT IS A FIRST-CLASS STATE. A pickup round at 7am that nobody
// wrote down is normal. Every function here answers cleanly for a round with no
// tee time - teeTimeOf returns null, teeTimeLabel returns '' - and nothing shows
// an empty row or an "Invalid Date".
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that re-declares the name.
// ============================================================================

// The two field names, once, so a typo cannot make a round that saves a tee time
// nothing reads.
var TEE_TIME_ISO_FIELD = 'teeTimeISO';
var TEE_TIME_ZONE_FIELD = 'teeTimeZone';

// ---------------------------------------------------------------------------
// READING WHAT A ROUND HOLDS
//
// Returns null, or { iso, zone, ms }. A STRING THAT DOES NOT PARSE IS NO TEE
// TIME: a round carrying garbage must render the same as a round carrying
// nothing, never "Invalid Date" on the scorecard header.
function teeTimeOf(data) {
    var d = data || {};
    var iso = d[TEE_TIME_ISO_FIELD];
    if (typeof iso !== 'string' || !iso) return null;
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return null;
    var zone = typeof d[TEE_TIME_ZONE_FIELD] === 'string' && d[TEE_TIME_ZONE_FIELD]
        ? d[TEE_TIME_ZONE_FIELD] : null;
    return { iso: iso, zone: zone, ms: ms };
}

function hasTeeTime(data) { return !!teeTimeOf(data); }

// ---------------------------------------------------------------------------
// WRITING ONE. The inputs are what an <input type="date"> and an
// <input type="time"> hand over - "2026-10-04" and "08:40" - plus the offset the
// browser reports for THAT INSTANT, which is the only way to get daylight saving
// right for a date months away.
//
// `offsetMinutes` is getTimezoneOffset()'s sign convention: minutes to ADD to
// local time to reach UTC, so Phoenix in October is +420. The ISO offset is the
// negation of that, which is the single most common place to put the sign the
// wrong way round - and teeTimeBuild is the only place in this app that does the
// conversion.
function teeTimePad(n) { return (n < 10 ? '0' : '') + n; }

function teeTimeBuild(dateText, timeText, offsetMinutes, zone) {
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || '').trim());
    var tm = /^(\d{2}):(\d{2})$/.exec(String(timeText || '').trim());
    if (!dm || !tm) return null;
    var hh = Number(tm[1]), mm = Number(tm[2]);
    if (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59)) return null;
    var mo = Number(dm[2]), day = Number(dm[3]);
    if (!(mo >= 1 && mo <= 12) || !(day >= 1 && day <= 31)) return null;

    var off = Number(offsetMinutes);
    if (!isFinite(off)) return null;
    // getTimezoneOffset() is minutes to ADD to local to get UTC; an ISO offset is
    // the other way round. Phoenix: getTimezoneOffset() 420, ISO "-07:00".
    var sign = off > 0 ? '-' : '+';
    var abs = Math.abs(off);
    var iso = dm[1] + '-' + dm[2] + '-' + dm[3] + 'T' + tm[1] + ':' + tm[2] + ':00'
        + sign + teeTimePad(Math.floor(abs / 60)) + ':' + teeTimePad(abs % 60);
    if (!isFinite(Date.parse(iso))) return null;
    var out = {};
    out[TEE_TIME_ISO_FIELD] = iso;
    out[TEE_TIME_ZONE_FIELD] = (typeof zone === 'string' && zone) ? zone : null;
    return out;
}

// What the two inputs should show when an EXISTING tee time is opened for
// editing. Read back from the ISO string's own fields rather than from a Date,
// so a round set in another zone edits as the time it was set - the organizer
// typed 8:40 and the box says 8:40, wherever they are now.
function teeTimeInputs(data) {
    var t = teeTimeOf(data);
    if (!t) return { date: '', time: '' };
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(t.iso);
    return m ? { date: m[1], time: m[2] } : { date: '', time: '' };
}

// ---------------------------------------------------------------------------
// DISPLAY. Always in the zone the time was SET in - see the header.
//
// `fmt` is injected so a test can prove the zone is honoured without depending
// on the machine's own locale; production passes nothing and gets Intl.
function teeTimeParts(data, fmt) {
    var t = teeTimeOf(data);
    if (!t) return null;
    var maker = fmt || (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat : null);
    if (maker && t.zone) {
        try {
            var f = maker('en-US', {
                timeZone: t.zone, weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit'
            });
            var bits = {};
            f.formatToParts(new Date(t.ms)).forEach(function (p) { bits[p.type] = p.value; });
            if (bits.hour && bits.minute) {
                return {
                    dateText: [bits.weekday, bits.month, bits.day].filter(Boolean).join(' '),
                    timeText: bits.hour + ':' + bits.minute + (bits.dayPeriod ? ' ' + bits.dayPeriod : ''),
                    zone: t.zone, ms: t.ms
                };
            }
        } catch (e) { /* an unknown zone falls through to the offset below */ }
    }
    // THE FALLBACK IS THE OFFSET IN THE STRING, and it is still correct: it was
    // recorded at the course. No Intl, an unrecognised zone, or no zone stored
    // all land here rather than on the reader's own clock.
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t.iso);
    if (!m) return null;
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var h24 = Number(m[4]);
    var h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return {
        dateText: MON[Number(m[2]) - 1] + ' ' + Number(m[3]),
        timeText: h12 + ':' + m[5] + ' ' + (h24 < 12 ? 'AM' : 'PM'),
        zone: t.zone, ms: t.ms
    };
}

// "Sat Oct 4 · 8:40 AM", or '' for a round with no tee time. The separator is
// the app's own middle dot, matching every other two-part label.
function teeTimeLabel(data, fmt) {
    var p = teeTimeParts(data, fmt);
    if (!p) return '';
    return [p.dateText, p.timeText].filter(Boolean).join(' · ');
}

// Just the clock, for a header that already says the date.
function teeTimeShort(data, fmt) {
    var p = teeTimeParts(data, fmt);
    return p ? p.timeText : '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TEE_TIME_ISO_FIELD, TEE_TIME_ZONE_FIELD,
        teeTimeOf, hasTeeTime, teeTimeBuild, teeTimeInputs, teeTimeParts,
        teeTimeLabel, teeTimeShort
    };
}
