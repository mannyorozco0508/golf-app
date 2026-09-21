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

// ---- THE NAME A GOLFER READS (2026-09-21, v190) --------------------------
// Lifted VERBATIM from leaderboard.html (it lived inline there since the
// Board was written) so the Game tab draws the same name the Board does:
// a first name unique in the roster stands alone ("Marty"); two golfers who
// share a first name carry their last initial with a dot ("Randy T.",
// "Randy C."); same first name AND same initial, the full stored name. The
// Game tab had its own formatter that cut every name to its first token,
// which turned Randy T / Randy C / Matt M / Matt B / Matt H into two Randys
// and three Matts (game_tab_names_test.js). Two entry points, one builder.
// DOES NOT ESCAPE - every caller wraps the result in escapeHtml at the
// innerHTML boundary, as leaderboard.html always did.
function getSmartDisplayName(player, allPlayers) {
    let parts = player.name.trim().split(/\s+/);
    let first = parts[0];
    if (parts.length === 1) return first; 

    let last = parts.slice(1).join(" ");
    let lastInitial = last.charAt(0).toUpperCase();

    let sameFirstName = allPlayers.filter(p => p.name.trim().split(/\s+/)[0].toLowerCase() === first.toLowerCase());
    if (sameFirstName.length === 1) return first; 

    let sameFirstAndInitial = sameFirstName.filter(p => {
        let pParts = p.name.trim().split(/\s+/);
        if (pParts.length === 1) return false;
        let pLastInitial = pParts.slice(1).join(" ").charAt(0).toUpperCase();
        return pLastInitial === lastInitial;
    });

    if (sameFirstAndInitial.length === 1) return `${first} ${lastInitial}.`; 
    return `${first} ${last}`;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml, getSmartDisplayName };
}
