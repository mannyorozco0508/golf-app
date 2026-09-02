// ============================================================================
// GolfApp — Safe Text (SHARED CORE)
//
// One escaping function, loaded by every page that renders a name.
//
// WHY THIS FILE EXISTS
//
// Golfer names, trip names and course names are user input, and eight pages
// interpolated them straight into template literals that become innerHTML. The
// security framing is the weaker half of the problem: an attacker needs the round
// code, and script execution buys them nothing they cannot already do with it.
//
// The stronger half is CORRECTNESS. A golfer legitimately called
//
//     Bob <the Hammer>          renders as nothing at all - the browser reads an
//                               unknown tag and swallows it
//     Mike & Dave's Trip        renders intact today, but only by luck
//
// so an ordinary group with an ordinary name sees a broken screen. That is the bug
// a TestFlight tester actually hits.
//
// ESCAPE AT THE OUTPUT BOUNDARY, NEVER IN STORAGE. Firebase keeps the name exactly
// as typed. Nothing here rewrites stored data, and nothing double-encodes history:
// escaping is applied once, at the moment a string becomes markup.
//
// ALL FIVE CHARACTERS. & < > " ' - the ampersand FIRST, or escaping the others
// would re-escape the ampersands they introduce and turn O'Brien into O&amp;#39;Brien
// on screen. The apostrophe matters because golfers are called O'Brien, and the
// double quote matters because names land inside attributes.
//
// THIS IS FOR HTML. It is not correct for JavaScript string context, and no caller
// should use it that way - a name that must reach a handler is passed by id
// through a data attribute instead of being interpolated into code.
// ============================================================================

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml };
}
