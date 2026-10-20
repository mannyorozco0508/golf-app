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

    // A ONE-LETTER LAST NAME IS ALREADY AN INITIAL (polish #16, 2026-10-20):
    // "Test A" stays "Test A", never "Test A." - the dot only marks a cut.
    if (sameFirstAndInitial.length === 1) return last.length === 1 ? `${first} ${lastInitial}` : `${first} ${lastInitial}.`;
    return `${first} ${last}`;
}

// ---- SAME FIRST NAME, EVERY SCREEN (polish #2, 2026-10-20) ---------------
// Two Mikes in one round read "Mike v Mike" / "Mike +$5" on the hole sheet,
// the Nassau strip, LIVE MATCHES, Bets and Round Complete, because every one
// of those lines is cut from player.name's FIRST WORD - most of them inside
// the engines (match-engine t1Name, money-engine statusText, settlement-engine
// nameA), which this change does not touch.
//
// golferShortName: the name a short line shows - getSmartDisplayName against
// the round's roster ("Mike" alone; "Mike R." / "Mike S." when two Mikes;
// the full name when the initials collide too). Pure; does not escape.
//
// roundDataForDisplay: the SAME round, for a renderer to hand to an engine,
// with only the colliding golfers' names swapped for that label joined by
// no-break spaces ("Test\u00a0A"). Every engine label is
// name.split(' ')[0], and a no-break space is not ' ', so the engine's own
// label comes out "Test A" - without one line of engine code changing. The
// engines' arithmetic never reads a name (ids, handicaps, scores), so no
// figure can move. NO COLLISION -> THE SAME OBJECT BACK, so every round
// without two same first names is untouched byte for byte. A COPY, NEVER
// SAVED: callers pass it to presenters only; nothing writes it back.
function golferShortName(player, allPlayers) {
    if (!player || typeof player.name !== 'string' || !player.name.trim()) return String((player && player.name) || '').trim();
    const roster = (Array.isArray(allPlayers) ? allPlayers : []).filter(p => p && typeof p.name === 'string' && p.name.trim());
    if (!roster.includes(player)) roster.push(player);
    return getSmartDisplayName(player, roster);
}

// Short labels for a whole roster, keyed by id. Only names that change are in it.
function golferShortNameMap(players) {
    const list = Array.isArray(players) ? players : [];
    const out = {};
    list.forEach(p => {
        if (!p || typeof p.name !== 'string' || !p.name.trim()) return;
        const label = golferShortName(p, list);
        if (label !== p.name.trim().split(/\s+/)[0]) out[String(p.id)] = label;
    });
    return out;
}

// roster: the whole round (optional) - a group-scoped list still collides
// against every golfer in the round, not only the ones on screen.
function playersForDisplay(players, roster) {
    if (!Array.isArray(players)) return players;
    const map = golferShortNameMap(Array.isArray(roster) ? roster : players);
    if (!Object.keys(map).length) return players;
    return players.map(p => (p && map[String(p.id)] !== undefined)
        ? Object.assign({}, p, { name: map[String(p.id)].replace(/ /g, '\u00a0') }) : p);
}

function roundDataForDisplay(data) {
    if (!data || !Array.isArray(data.players)) return data;
    const ps = playersForDisplay(data.players);
    return ps === data.players ? data : Object.assign({}, data, { players: ps });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml, getSmartDisplayName, golferShortName, golferShortNameMap, playersForDisplay, roundDataForDisplay };
}
