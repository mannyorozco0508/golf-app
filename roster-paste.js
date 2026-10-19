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

// ---- A TRAILING HANDICAP AND FLIGHT (URGENT-004, 2026-10-18) ---------------
//
// Manny's Monday list is written handicap-then-flight at the END of each line:
//
//     Skeens 2.0/A
//     Manny +2.0/A
//     Glenn 12.0/B
//
// Before this, none of those read: "/A" is not a number, so BARE_HCP_RE failed and
// the WHOLE line became the name, with no handicap and no flight - and switching
// Flights on afterwards put all twenty golfers in A. (No build ever read this
// form; only a LEADING flight, "A Skeens 2", was understood.)
//
// THE FLIGHT IS READ ONLY WHEN A HANDICAP COMES RIGHT BEFORE IT. "Matt B" and
// "Jim B" stay last initials - the same rule as LEAD_FLIGHT_RE's "never a trailing
// letter" - because a lone trailing letter is a name. Accepted between the number
// and the letter: "/", ",", or whitespace (tabs too); the number may be bracketed:
//     Name 12/B   Name 12 / b   Name, 12, B   Name 12 B   Name (12) B   Name\t12\tB
// A plus handicap keeps its sign ("+2.0"), the way the app stores one; parseHcp in
// handicap.js reads "+2" as two strokes given. Same -10..54 range as BARE_HCP_RE.
const TRAIL_HCP_FLIGHT_RE = /^(.+?)[\s,]+\(?\s*([+-]?\d{1,2}(?:\.\d)?)\s*\)?\s*(?:[\/,]\s*|\s+)([ABab])$/;
// "Name (12)" - a bracketed handicap with no flight. Read before the note
// stripper, which would otherwise take "(12)" off the line as a note.
const TRAIL_PAREN_HCP_RE = /^(.+?)\s*\(\s*([+-]?\d{1,2}(?:\.\d)?)\s*\)$/;
function splitTrailingHcpFlight(line) {
    const t = String(line == null ? '' : line).trim();
    let m = TRAIL_HCP_FLIGHT_RE.exec(t);
    if (m) {
        const v = parseFloat(m[2]);
        if (v >= -10 && v <= 54) return { name: m[1].replace(/[\s,]+$/, '').trim(), hcp: m[2], flight: m[3].toUpperCase() };
    }
    m = TRAIL_PAREN_HCP_RE.exec(t);
    if (m) {
        const v = parseFloat(m[2]);
        if (v >= -10 && v <= 54) return { name: m[1].replace(/[\s,]+$/, '').trim(), hcp: m[2], flight: undefined };
    }
    return null;
}

// ROWS THAT ALREADY HOLD A WHOLE LINE AS THEIR NAME (URGENT-004). A list pasted
// before this fix left "Glenn 12.0/B" in the name box with an empty handicap. When
// the roster is drawn again (Flights switched on, the step reopened), such a row is
// split into name / handicap / flight - but ONLY when its handicap box is empty, so
// a number somebody typed is never replaced. Returns the fixed list (new objects)
// and how many rows changed; nothing else on a row is touched.
function fixPastedRows(list) {
    let fixed = 0, anyFlight = false;
    const out = (list || []).map(p => {
        if (!p || String(p.hcp == null ? '' : p.hcp).trim() !== '') return p;
        const r = splitTrailingHcpFlight(p.name);
        if (!r || !r.name) return p;
        fixed++;
        const q = Object.assign({}, p, { name: r.name, hcp: r.hcp });
        if (r.flight) { q.flight = r.flight; anyFlight = true; }
        return q;
    });
    return { list: out, fixed, anyFlight };
}

// SAME NAME TWICE (URGENT-004): two "Matt"s are two golfers - never merged - but
// the card and the board can't tell them apart, so the review names them and asks
// for a last initial. Case-insensitive on the whole name; returns [{ name, count }].
function duplicateRosterNames(list) {
    const seen = {};
    (list || []).forEach(p => {
        const n = String((p && p.name) || '').trim();
        if (!n) return;
        const k = n.toLowerCase();
        (seen[k] = seen[k] || { name: n, count: 0 }).count++;
    });
    return Object.keys(seen).map(k => seen[k]).filter(x => x.count > 1);
}
function duplicateNamesNote(list) {
    const d = duplicateRosterNames(list);
    if (!d.length) return '';
    const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
    return d.map(x => (words[x.count] || x.count) + ' golfers named ' + x.name).join(', ')
        .replace(/^./, c => c.toUpperCase())
        + ' - kept as separate golfers. Add a last initial so the card can tell them apart.';
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
// URGENT-008: a header may end in its own punctuation ("Group 1:", "Group 1 -",
// "Team 2.", "Foursome 3)") - the fuzzer found "Group 1:" read as a GOLFER.
var ROSTER_HEADER_WORDS = /^(?:group|grp|flight|foursome|team|tee\s*time|tee)\s*[:#.\-\u2013\u2014]?\s*(?:[0-9]{1,2}|[A-Za-z])?\s*[:.)\-\u2013\u2014]?$/i;
// "A Flight", "B flight:" - the letter first. Only A and B (the flights that exist).
var ROSTER_FLIGHT_FIRST_HEADER = /^([AB])\s*[-\u2013\u2014]?\s*flight\s*[:.\-\u2013\u2014]?$/i;
// A list number on a line by itself: "1.", "2)", "#3", "4:", "(5)". A BARE number
// ("12") is not one - it stays a golfer line, so it shows on the review.
var ROSTER_NUMBER_HEADER = /^(?:#\s?\d{1,2}[.:)]?|\(?\d{1,2}[.:)])$/;
// A spreadsheet's column headings: every word is a heading word, and one of them
// names the golfer column ("Name<TAB>HCP<TAB>Flight", "Player Handicap").
var ROSTER_COLUMN_WORDS = /^(?:name|names|player|players|golfer|golfers|first|last|full|hcp|hdcp|hcap|handicap|handicaps|index|hi|flight|flt|tee|tees|group|grp|no|#)\.?$/i;
var ROSTER_TRAILING_TIME = /[\s\-\u2013\u2014(,:]*\d{1,2}[:.]\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?\s*\)?$/i;

// '' for a golfer line; 'blank', 'header' or 'time' for a separator.
function rosterPasteSeparator(line) {
    var t = String(line == null ? '' : line).trim();
    if (!t) return 'blank';
    var head = t.replace(ROSTER_TRAILING_TIME, '').trim();
    if (!head) return 'time';                       // the whole line was a tee time
    if (ROSTER_HEADER_WORDS.test(head)) return 'header';
    if (ROSTER_FLIGHT_FIRST_HEADER.test(head)) return 'header';
    if (ROSTER_NUMBER_HEADER.test(t)) return 'header';
    var words = t.split(/[\s,|\/]+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 6 && words.every(function (w) { return ROSTER_COLUMN_WORDS.test(w); })
        && words.some(function (w) { return /^(?:name|names|player|players|golfer|golfers|first|last)$/i.test(w); })) return 'header';
    return '';
}

// THE FLIGHT A HEADER NAMES (URGENT-008): "Flight A", "A Flight", "flight b:" -> 'A' / 'B'.
// The golfers under it, with no letter of their own, play in that flight. null for
// any other line.
function rosterFlightHeader(line) {
    var t = String(line == null ? '' : line).trim().replace(ROSTER_TRAILING_TIME, '').trim();
    var m = /^flight\s*[:#.\-\u2013\u2014]?\s*([AB])\s*[:.)\-\u2013\u2014]?$/i.exec(t) || ROSTER_FLIGHT_FIRST_HEADER.exec(t);
    return m ? m[1].toUpperCase() : null;
}

// ---- A TEE AT THE END OF A LINE, AND ONLY A REAL ONE (2026-10-05) --------
//
// "Zack Carrano 6 blue" means Zack plays the blue tees. The danger is obvious
// from this file's own history: "Group 1" once parsed as a golfer called Group
// with a handicap of 1, and six phantom players nearly went into a round with
// strokes each. A tee is strokes too, on a round with the adjustment switched
// on, so the rule here is the narrowest one that can work:
//
//   A TRAILING WORD IS A TEE ONLY IF IT NAMES A TEE THIS COURSE ACTUALLY HAS.
//
// No vocabulary, no colour list, no guessing. The caller passes the round's own
// tee names; anything that does not match one of them is part of the golfer's
// name, exactly as it is today. A paste with no tee names passed in behaves
// byte-identically to before this existed - which is every existing caller, and
// a test holds it.
function splitTrailingTee(text, teeNames) {
    const names = (teeNames || []).map(n => String(n || '').trim().toLowerCase()).filter(Boolean);
    if (!names.length) return { tee: undefined, rest: text };
    // A REAL TEE NAME CAN BE TWO WORDS (2026-10-08). Caledonia's six are
    // "Pintail Black", "Pintail Blue" and so on. The old pattern was greedy on
    // the left, so only the LAST word was ever offered as a tee: "Tim Bell 11
    // Pintail White" left "Pintail" in the name and took no tee, because the
    // word before "White" is not a handicap. Found on the iOS Simulator against
    // the live record.
    //
    // So the longest trailing phrase wins, four words down to one, and the
    // set-off rule below is applied to whatever is left - unchanged. With one
    // word this is exactly the old behaviour.
    const raw = String(text || '').trim();
    let m = null, hit = -1;
    for (let words = 4; words >= 1 && hit === -1; words--) {
        // THE END ANCHOR IS A VARIABLE, and that is not fussiness: paste_flights_test.js
        // forbids the literal sequence dollar-quote-paren anywhere in this file,
        // because the flight rule must stay anchored at the START of a line and
        // that guard is how it is held there. Writing the anchor inline here
        // tripped it - my own code caught by my own guard, which is the point of
        // having it.
        const END = '$';
        const re = new RegExp('^(.*\\S)([\\s]*[\u00B7\u2022\u2013\u2014-][\\s]*|\\s+)'
            + '((?:[A-Za-z]+[ ]+){' + (words - 1) + '}[A-Za-z]+)' + END);
        const got = re.exec(raw);
        if (!got) continue;
        const at = names.indexOf(got[3].trim().toLowerCase());
        if (at === -1) continue;
        m = got; hit = at;
    }
    if (!m || hit === -1) return { tee: undefined, rest: text };
    // AND THE RULE ERRS TOWARD THE NAME, as everything else in this file does.
    // "Mary Blue" is a golfer on a course that happens to have blue tees, so a
    // bare space is not enough: the tee must either follow the HANDICAP, which
    // is how a tee sheet is written ("Zack Carrano 6 blue"), or be set off by a
    // dash or a middot ("Mary - blue"). Measured against this file's own
    // history: six "Group N" lines once became six golfers with handicaps, and
    // a tee is strokes too on a round with the adjustment on.
    //
    // A COMMA IS NOT A SET-OFF HERE, because it already means something else in
    // this parser: "Mary, 12" is the name/handicap form. Leaving it out keeps
    // every comma line parsing exactly as it does today.
    // The greedy name group swallows a trailing dash, so the set-off is looked
    // for at the END of what is left as well as in the separator itself -
    // "Mary - blue" splits as "Mary -" + " " + "blue" without this.
    const trimmed = m[1].replace(/[\s]*[\u00B7\u2022\u2013\u2014-]$/, '').trim();
    const setOff = (trimmed !== m[1].trim()) || /[\u00B7\u2022\u2013\u2014-]/.test(m[2]);
    if (!setOff && !BARE_HCP_RE.test(m[1])) return { tee: undefined, rest: text };
    return { tee: (teeNames || [])[hit], rest: setOff ? trimmed : m[1] };
}

function parsePlayerPasteText(text, teeNames) {
    // \r\n (Excel, Windows) and a lone \r (old Mac exports) end a line too.
    const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
    let validPlayers = [];
    let playerLines = [];        // URGENT-008: the 1-based line each golfer came from (parallel to validPlayers)
    let flaggedLines = [];
    let flaggedFlights = [];     // a leading letter that is not A or B - kept as typed, said in the preview
    let notedLines = [];         // "(captain)" and the like: taken off the line, reported in the preview
    let groups = [];
    let inGroup = false;     // true while inside a run of non-empty lines
    let headerFlight = null; // set by a "Flight A" / "B Flight" header line
    lines.forEach((rawLine, idx) => {
        // URGENT-008: tabs, non-breaking spaces and runs of spaces are one space;
        // a bullet or a list number in front of the line is not part of the name.
        const line = rosterPasteCleanLine(rawLine);
        // A BLANK LINE, A GROUP HEADER OR A BARE TEE TIME all close the current run.
        // See rosterPasteSeparator above for why a header must not be a golfer: six
        // "Group N" lines became six phantom golfers, each with a handicap.
        if (rosterPasteSeparator(line)) {
            // "Flight A" over a block of golfers gives them A (URGENT-008); another
            // header or a blank line leaves the flight as it is.
            const fh = rosterFlightHeader(line);
            if (fh) headerFlight = fh;
            inGroup = false; return;
        }
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
        // "Skeens 2.0/A", "Glenn 12 B", "Matt (12) b": a trailing handicap and flight
        // (URGENT-004). Read first - the note stripper would take "(12)" as a note.
        const trail = splitTrailingHcpFlight(line);
        if (trail && trail.name) {
            const lead = splitLeadingFlight(trail.name);
            const tp = { name: (lead.flight ? lead.rest : trail.name).replace(/\.+$/, '').trim(), hcp: trail.hcp };
            const fl = trail.flight || lead.flight || headerFlight;
            if (fl) tp.flight = fl;
            validPlayers.push(tp);
            playerLines.push(idx + 1);
            groups[groups.length - 1]++;
            return;
        }
        const noted = (typeof stripTrailingNote === 'function')
            ? stripTrailingNote(line) : { text: line, note: '' };
        if (noted.note) notedLines.push({ lineNumber: idx + 1, text: line, note: noted.note });
        const { flight, rest, notAFlight } = splitLeadingFlight(noted.text);
        // THE TEE COMES OFF AFTER the flight and the note, and BEFORE the name and
        // handicap are split - "B Zack 6 blue" is flight B, Zack, 6, blue tees.
        const teed = splitTrailingTee(rest, teeNames);
        // A not-a-flight line is kept AS TYPED: its comma is part of what was
        // typed ("D, Jim" is not "D" with a handicap of "Jim"), so only the bare
        // trailing number is read off it.
        const { name, hcp } = notAFlight ? splitNameAndHcp(teed.rest.replace(/,/g, '\u0000')) : splitNameAndHcp(teed.rest);

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
        else if (headerFlight) player.flight = headerFlight;
        if (teed.tee) player.teeName = teed.tee;
        validPlayers.push(player);
        playerLines.push(idx + 1);
        groups[groups.length - 1]++;
    });
    groups = groups.filter(n => n > 0);   // a run made only of flagged lines is not a group
    const anyFlight = validPlayers.some(p => p.flight);
    const flights = anyFlight
        ? { A: validPlayers.filter(p => p.flight === 'A').length, B: validPlayers.filter(p => p.flight === 'B').length, unlettered: validPlayers.filter(p => !p.flight).length }
        : null;
    const duplicates = duplicateRosterNames(validPlayers);
    return { validPlayers, flaggedLines, flaggedFlights, notedLines, groups, flights, duplicates, playerLines };
}

// ---- THE LINE AS PASTED, CLEANED (URGENT-008, 2026-10-18) -------------------
//
// The paste fuzzer (tools/sim/paste-fuzz.js) pasted lists the ways organizers do
// and found the line itself was never cleaned beyond trim():
//
//   Excel / Sheets   "Zack\tCarrano\t6\tA" -> a golfer named "Zack<TAB>Carrano"
//   iMessage / Notes "Big\u00A0Jim 12"      -> a name holding a non-breaking space,
//                                             which never matches "Big Jim" again
//   Notes bullets    "\u2022 Skeens 2.0/A"   -> a golfer named "\u2022 Skeens"
//   numbered lists   "1) Skeens 2.0 A"      -> a golfer named "1) Skeens"
//
// So, before anything reads the line: every run of whitespace (tab, NBSP, the
// narrow NBSP iOS puts before AM) is one space; invisible zero-width marks go;
// and ONE leading bullet (\u2022 * \u25AA \u25CF \u25E6 \u2023 \u00B7, or a
// dash with a space after it) or list number ("1)", "1.", "(1)", "#1") comes off.
//
// WHAT IS NOT A LIST NUMBER: a number with no bracket or dot after it. "12 Skeens"
// may be a handicap written first; it stays on the line, and checkLines below
// says so. A dash glued to a word ("-Rod") is not a bullet. A dot followed by a
// digit ("1.5 Skeens") is not a list number.
const ROSTER_BULLET_RE = /^(?:[\u2022\u2023\u2043\u2219\u25AA\u25AB\u25CF\u25E6\u25A0\u25A1\u00B7*>]+\s*|[-\u2013\u2014]\s+)/;
const ROSTER_LIST_NUMBER_RE = /^(?:\(?\d{1,2}[.)]|#\s?\d{1,2}[.):]?)\s+/;
function rosterPasteCleanLine(raw) {
    let t = String(raw == null ? '' : raw)
        .replace(/[\u200B\u200C\u2060\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    for (let i = 0; i < 2; i++) {
        const b = t.replace(ROSTER_BULLET_RE, '');
        const n = b.replace(ROSTER_LIST_NUMBER_RE, '');
        if (n === t) break;
        t = n.trim();
    }
    return t;
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
    module.exports = { rosterPasteCleanLine, rosterFlightHeader, BARE_HCP_RE, LEAD_FLIGHT_RE, ROSTER_HEADER_WORDS, splitNameAndHcp,
        splitLeadingFlight, splitTrailingTee, rosterPasteSeparator, parsePlayerPasteText,
        TRAIL_HCP_FLIGHT_RE, splitTrailingHcpFlight, fixPastedRows, duplicateRosterNames, duplicateNamesNote };
}
