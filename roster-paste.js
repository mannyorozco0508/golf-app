// ============================================================================
// THE PASTED ROSTER - one parser, shared.
//
// Manny keeps his weekly list in a note on his phone and pastes it whole:
//
//     B Jimmy 11 (captain)
//     A Paul 3.5
//     Marty 9
//
//     Lance 14.3
//
// A leading A or B is a flight, a trailing number is a handicap, a bracketed
// note is reported rather than silently eaten, and a BLANK LINE is a group
// boundary. Two pages read that text now - admin.html, for a round's roster
// (since 2026-09-21), and trip.html, for a whole trip's (2026-10-03) - so the
// rules live here. A second copy would make a list parse one way into a round
// and another way into the trip that holds it, and the difference would be
// handicaps, which is money.
//
// PURE. No DOM, no db, no page name. Plain top-level declarations, loaded by a
// <script src> before each page's inline script (the pages must not re-declare
// these names: a `const` in a page over a `var` here is a SyntaxError that kills
// the whole inline block).
//
// THE NOTE STRIPPER STAYS IN my-groups.js, reached through the same typeof guard
// admin.html used before this file existed. It is one implementation either way,
// and moving it would have meant re-pinning every My Groups test for no gain;
// both pages load that file.
// ============================================================================

// A BARE TRAILING HANDICAP. With no comma on the line, a last token that looks like
// a handicap - optional sign, one or two digits, at most one decimal place, within
// -10..54 - is one: "Marty 9", "Marty +2", "Lance 14.3". Anything else stays part
// of the name, so "Matt H" and "Tommy Chen" are whole names, "Marty 99" is a name,
// and a line that is ONLY a number ("12") is a name too - the token must follow
// whitespace after at least one character of name. The comma form is untouched:
// when a comma is present the line splits there, as it always has.
const BARE_HCP_RE = /^(.+?)\s+([+-]?\d{1,2}(?:\.\d)?)$/;
function splitNameAndHcp(line) {
    const commaIdx = line.indexOf(',');
    if (commaIdx !== -1) {
        return { name: line.slice(0, commaIdx).trim(), hcp: line.slice(commaIdx + 1).trim() };
    }
    const m = BARE_HCP_RE.exec(line);
    if (m) {
        const v = parseFloat(m[2]);
        if (v >= -10 && v <= 54) return { name: m[1].trim(), hcp: m[2] };
    }
    return { name: line, hcp: '' };
}

// A LEADING FLIGHT LETTER (2026-09-21). Manny keeps his list with the flight
// beside each name - "A · Randy T 12" - and pastes it as-is. A LEADING A or B,
// then ANY run of separators (spaces, commas, dashes, dots, colons, middots),
// then the name, sets that golfer's flight; case-insensitive. The handicap
// still reads as the trailing number of what is left. If any line carries a
// flight, the commit turns flights on for the round.
//
// NEVER A TRAILING LETTER. "Matt B" and "Jim B" carry a last initial; reading
// it as a flight would strip both and drop both golfers into B. Leading only -
// the regex is anchored at ^ and nothing looks at the end of a line.
//
// THE INITIALS GUARD. A lone dot or dash GLUED to the next letter is part of a
// name: "B.J. Smith", "A.J.", "A-Rod" are names, not flights. A dot with a
// space after it ("B. J Smith"), a run of dots ("B... Jim"), or any other
// separator ("A, Randy", "A: Randy", "A · Randy") is a flight. The rule errs
// toward the name: a real golfer is never silently moved; at worst a flight
// typed as "B.Jim" lands in A with "B.Jim" for a name, which is visible.
//
// ONLY A AND B EXIST. A leading C, D or any other single letter followed by a
// separator run is NOT a flight and is not invented into one: the line is kept
// as typed for the name and the preview says so (flaggedFlights), so the
// organizer fixes the row after adding rather than losing the golfer.
//
// NO LETTER WHERE OTHERS HAVE ONE: the golfer goes in A - the same default a
// fresh row gets when flights are switched on (appendFlightControl) - and the
// preview counts them so the organizer can move them.
// Separators: whitespace , - – — . : · • (a regex literal - a doubled
// escape in a string is the defect course_import_name_test.js scans for).
const LEAD_FLIGHT_RE = /^([A-Za-z])([\s,\-\u2013\u2014.:\u00B7\u2022]+)(\S.*)$/;
function splitLeadingFlight(line) {
    const m = LEAD_FLIGHT_RE.exec(line);
    if (!m) return { flight: undefined, rest: line, notAFlight: false };
    const gluedInitial = (m[2] === '.' || m[2] === '-') && /^[A-Za-z]/.test(m[3]);
    if (gluedInitial) return { flight: undefined, rest: line, notAFlight: false };
    const letter = m[1].toUpperCase();
    if (letter !== 'A' && letter !== 'B') return { flight: undefined, rest: line, notAFlight: true };
    return { flight: letter, rest: m[3], notAFlight: false };
}

// ---- A HEADER IS A BOUNDARY, NOT A GOLFER (2026-10-04) -------------------
//
// Manny pasted his real 24-golfer list, written the way a tee sheet is written:
//
//     Group 1
//     Zack Carrano 6
//     Derrick J Doncaster 15
//     ...
//     Group 2
//     ...
//
// Every "Group N" line parsed as a GOLFER - name "Group", handicap N - so a
// 24-man list reviewed as "30 golfers", and six phantom players would have gone
// into every round with a handicap each. A handicap is strokes, and strokes are
// money.
//
// THREE KINDS OF LINE ARE SEPARATORS: a blank line (as before), a group header,
// and a line that is only a tee time. Each CLOSES the current group and opens the
// next, exactly as a blank line does - so a list written "Group 1 ... Group 2 ..."
// with no blank lines in it is still six groups.
//
// THE HEADER WORDS ARE A CLOSED LIST - group, grp, flight, foursome, team, tee,
// tee time - optionally followed by a number or a single letter, and optionally
// followed by a tee time. Nothing else is a header: "Group Captain Smith 8" has a
// name after the number and stays a golfer, which is the direction this must err
// in. A golfer is never silently dropped; at worst a header nobody listed stays a
// golfer, and that is visible on the review.
var ROSTER_HEADER_WORDS = /^(?:group|grp|flight|foursome|team|tee\s*time|tee)\s*[:#.\-\u2013\u2014]?\s*(?:[0-9]{1,2}|[A-Za-z])?$/i;
var ROSTER_TRAILING_TIME = /[\s\-\u2013\u2014(,:]*\d{1,2}[:.]\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?\s*\)?$/i;

// '' for a golfer line; 'blank', 'header' or 'time' for a separator.
function rosterPasteSeparator(line) {
    var t = String(line == null ? '' : line).trim();
    if (!t) return 'blank';
    var head = t.replace(ROSTER_TRAILING_TIME, '').trim();
    if (!head) return 'time';                       // the whole line was a tee time
    if (ROSTER_HEADER_WORDS.test(head)) return 'header';
    return '';
}

function parsePlayerPasteText(text) {
    const lines = text.split('\n');
    let validPlayers = [];
    let flaggedLines = [];
    let flaggedFlights = [];     // a leading letter that is not A or B - kept as typed, said in the preview
    let notedLines = [];         // "(captain)" and the like: taken off the line, reported in the preview
    let groups = [];
    let inGroup = false;     // true while inside a run of non-empty lines
    lines.forEach((rawLine, idx) => {
        const line = rawLine.trim();
        // A BLANK LINE, A GROUP HEADER OR A BARE TEE TIME all close the current run.
        // See rosterPasteSeparator above for why a header must not be a golfer: six
        // "Group N" lines became six phantom golfers, each with a handicap.
        if (rosterPasteSeparator(line)) { inGroup = false; return; }
        if (!inGroup) { groups.push(0); inGroup = true; }

        // v194: a trailing period comes off a pasted name ("Anthony." -> "Anthony";
        // the iPhone's double-space-for-a-period puts one on every line). Only
        // trailing, only periods; "Jr." at the end loses its dot too - accepted.
        // Stored names are never rewritten; this is the paste only.
        // A TRAILING NOTE IN BRACKETS COMES OFF FIRST (v260). Measured before
        // this: "B Jimmy 11 (captain)" parsed to the NAME "Jimmy 11 (captain)"
        // with NO handicap, because the note sat between the number and the end
        // of the line. The note is reported rather than dropped silently, so the
        // review says what it ignored.
        const noted = (typeof stripTrailingNote === 'function')
            ? stripTrailingNote(line) : { text: line, note: '' };
        if (noted.note) notedLines.push({ lineNumber: idx + 1, text: line, note: noted.note });
        const { flight, rest, notAFlight } = splitLeadingFlight(noted.text);
        // A not-a-flight line is kept AS TYPED: its comma is part of what was
        // typed ("D, Jim" is not "D" with a handicap of "Jim"), so only the bare
        // trailing number is read off it.
        const { name, hcp } = notAFlight ? splitNameAndHcp(rest.replace(/,/g, '\u0000')) : splitNameAndHcp(rest);

        if (name === '') {
            flaggedLines.push({ lineNumber: idx + 1, text: rawLine.trim() || '(blank before the comma)' });
            return;
        }
        if (notAFlight) flaggedFlights.push({ lineNumber: idx + 1, text: line, letter: line[0].toUpperCase() });
        // v194: a trailing period comes off the NAME ("Anthony." -> "Anthony", "Matt H. 12"
        // -> Matt H / 12): the iPhone's double-space-for-a-period puts one on every
        // line. Only trailing, only periods; "Jr." at the end loses its dot too -
        // accepted. Stored names are never rewritten; this is the paste only.
        const player = { name: (notAFlight ? name.replace(/\u0000/g, ',') : name).replace(/\.+$/, '').trim(), hcp };
        if (flight) player.flight = flight;
        validPlayers.push(player);
        groups[groups.length - 1]++;
    });
    groups = groups.filter(n => n > 0);   // a run made only of flagged lines is not a group
    const anyFlight = validPlayers.some(p => p.flight);
    const flights = anyFlight
        ? { A: validPlayers.filter(p => p.flight === 'A').length, B: validPlayers.filter(p => p.flight === 'B').length, unlettered: validPlayers.filter(p => !p.flight).length }
        : null;
    return { validPlayers, flaggedLines, flaggedFlights, notedLines, groups, flights };
}

if (typeof module !== 'undefined' && module.exports) {
    // IN NODE THERE IS NO SCRIPT ORDER. The browser gets stripTrailingNote from
    // my-groups.js, loaded before this file; a require here gives a test of this
    // module exactly what the page sees, instead of a parser that quietly stops
    // stripping notes the moment it is tested on its own.
    if (typeof stripTrailingNote !== 'function') {
        try { stripTrailingNote = require('./my-groups.js').stripTrailingNote; }
        catch (e) { /* a caller without it gets the guard's own answer: no note */ }
    }
    module.exports = { BARE_HCP_RE, LEAD_FLIGHT_RE, ROSTER_HEADER_WORDS, splitNameAndHcp,
        splitLeadingFlight, rosterPasteSeparator, parsePlayerPasteText };
}
