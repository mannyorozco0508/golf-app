// ============================================================================
// GolfApp — Net Finish line (SHARED)
//
// ONE SENTENCE, TWO PAGES. "1st $50, 2nd $30, 3rd $20" - the paid places of the
// Weekly Game's Net Finish pot and what each one is worth, naming nobody. The Game
// tab has printed it since v186 to describe the wager before a ball is struck; the
// scorecard prints it from Wave 24 while the round is still live, because naming
// winners of an unfinished round is what this wave removed.
//
// WHY IT IS A FILE AND NOT A FUNCTION IN EACH PAGE. Two hand-written copies of a
// money sentence is the exact fault that put a per-press stake on the engine and not
// on the pages, and a $10 Nassau showing $30 live against a correct $45 receipt. The
// Game tab's copy DID already differ from what the scorecard needed: it re-derived
// the split from the setup config, and on a legacy cents round that path disagrees
// with the engine by a cent (settlement.html records the case - 3999/3001 where the
// engine allocated 4000/3000). One builder, and it reads the engine.
//
// IT CONSUMES placeCents AND NEVER RECOMPUTES. pool-engine.js exposes
// net.placeCents as "the ALLOCATED value of each paid position, exposed additively",
// already resolved for the round's settlement mode - whole-dollar allocation
// included. This file formats those integers and does no arithmetic of its own. A
// net result with no placeCents returns NOTHING rather than falling back to
// percentages: a missing split is a bug to see, not a figure to invent.
//
// AVAILABLE BEFORE ANYONE TEES OFF. placeCents is populated from the moment a pool
// is valid - measured at [5000,3000,2000] with zero scores posted - which is why the
// scorecard can show the pot and the split on hole one.
//
// THE SEPARATOR BELONGS TO THE CALLER. The Game tab reads ", " inside a sentence and
// the scorecard reads " · " in a compact head. Sharing the punctuation would have
// forced one of the two to change wording it had already settled on, so the parts
// are handed back and each page joins them. The MONEY is what must not drift.
//
// NET FINISH IS NEVER FLIGHTED. Only skins and birdies carry a flight scope, and
// pool-engine's flight code lives entirely in the skins bucket - so there is one pot
// and one split here, on a flighted round as much as any other. A caller drawing
// this per flight would be inventing a division the money does not make.
// ============================================================================

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th. The 11-13 window is why this is not
// "n + 'th'" and not a lookup on the last digit alone.
function netFinishOrdinal(n) {
    const i = (n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0);
    return n + ['th', 'st', 'nd', 'rd'][i];
}

// Cents in, the string a golfer reads out. Exact: a $3.33 place prints $3.33, never
// $3. The rounding this avoids is the whole subject of tools/money-format-check.js -
// "a rounded figure looks exactly like an exact one".
function netFinishMoney(cents) {
    const c = Number(cents) || 0;
    return '$' + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
}

// The paid places, in order, as ['1st $50', '2nd $30', '3rd $20'].
// Reads net.placeCents and nothing else - see the header.
function netFinishPlaceParts(net) {
    const cents = (net && Array.isArray(net.placeCents)) ? net.placeCents : null;
    if (!cents || cents.length === 0) return [];
    return cents.map((c, i) => netFinishOrdinal(i + 1) + ' ' + netFinishMoney(c));
}

// The same thing joined. Default " · " is the scorecard's; the Game tab passes ", ".
function netFinishSplitText(net, sep) {
    const parts = netFinishPlaceParts(net);
    if (parts.length === 0) return '';
    return parts.join(sep === undefined ? ' · ' : sep);
}
