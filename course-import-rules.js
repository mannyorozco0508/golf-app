// ============================================================================
// COURSE IMPORT RULES - the pure half of online course search, shared.
//
// Two pages search the course proxy (functions/api/): admin.html (Consumer,
// since 2026-09-12) and tournament.html (Option B, 2026-09-17). Each keeps its
// own DOM-bound code - the row, the outcome list, the confirm panel, what it
// writes and where - written against its own elements. What they must NEVER
// disagree on is here: what a valid card is, which tee is canonical, what each
// refusal reason says, and where the provider's list is cut. A copy of these
// that drifted would make a card valid on one page and refused on the other.
//
// PURE. No DOM, no db, no page name. Plain top-level declarations, loaded by a
// <script src> before each page's inline script (the pages must not re-declare
// these names: a `const` in the page over a `var` here is a SyntaxError that
// kills the whole inline block - tournament.html learned that with
// PLAYER_MODEL). course_import_rules_test.js holds the rules; course_import_test.js
// still reaches them through admin.html, by name, as it always did.
// ============================================================================

// The provider's hard ceiling on a search: at this many results the list may
// have been cut. Named next to the messages, because the sentence that quotes
// it must move with it.
var ONLINE_SEARCH_CEILING = 25;

// ---- EVERY REASON GETS ITS OWN SENTENCE ----
//
// NONE OF THEM SAYS "no courses found", and none implies the course does not
// exist. Every one means WE COULD NOT ASK. The local picker told a golfer a
// course was not there when it was, and then offered to add a duplicate; an
// online search that runs out of quota must not repeat it one layer up.
//
// query_too_short is the odd one out - nothing failed and nothing was spent -
// so it tells the golfer what to do instead of reporting a problem.
//
// daily_limit here says WHEN it comes back and nothing about a manual path:
// admin.html has a grid the golfer can type into and appends that offer itself;
// tournament.html has no grid and must not promise one.
var ONLINE_SEARCH_MESSAGES = {
    query_too_short: 'Type a little more to search online.',
    not_configured: "Online search isn't set up yet.",
    bad_course_id: "That course link didn't work — try searching again.",
    rate_limited: "You've searched online a few times just now. Try again in a few minutes.",
    daily_limit: "Online search has used up today's lookups. It works again tomorrow.",
    upstream_error: "Online search isn't answering right now.",
    network: "Couldn't reach online search. Check your signal."
};
function courseImportMessage(reason) {
    return ONLINE_SEARCH_MESSAGES[reason] || ONLINE_SEARCH_MESSAGES.upstream_error;
}

// ---- THE CARD, VALIDATED BEFORE IT IS EVER SHOWN OR WRITTEN ----
//
// Same invariant admin.html's validateCourseGrid enforces and the same one the
// Firebase rules enforce: par 3-6, stroke index a clean permutation of 1-18.
// About a tenth of provider records carry no tee data at all and nothing
// guarantees the rest are well formed, so a card that cannot satisfy it is
// refused here rather than written anywhere.
function importCardOrRefuse(tee) {
    const holes = (tee && tee.holes) || [];
    if (holes.length !== 18) {
        return { ok: false, reason: 'This course has no complete 18-hole card from the provider.' };
    }
    const seen = {};
    const data = [];
    for (let i = 0; i < 18; i++) {
        const par = Number(holes[i].par);
        const si = Number(holes[i].handicap);
        if (!(par >= 3 && par <= 6)) {
            return { ok: false, reason: `Hole ${i + 1} has par ${par}, which is outside 3-6.` };
        }
        if (!(si >= 1 && si <= 18)) {
            return { ok: false, reason: `Hole ${i + 1} has handicap ${si}, which is outside 1-18.` };
        }
        if (seen[si]) {
            return { ok: false, reason: `Handicap ${si} is used on both hole ${seen[si]} and hole ${i + 1}.` };
        }
        seen[si] = i + 1;
        data.push({ hole: i + 1, par: par, hcpIndex: si });
    }
    for (let n = 1; n <= 18; n++) {
        if (!seen[n]) return { ok: false, reason: `Handicap ${n} is not used on any hole.` };
    }
    return { ok: true, data: data };
}

// Picks the tee whose stroke index becomes canonical: the longest men's set,
// falling back to the longest women's. Recorded in source.siFrom either way.
function pickCanonicalTee(detail) {
    const byYards = (arr) => (arr || []).slice().sort((a, b) => (b.total_yards || 0) - (a.total_yards || 0))[0];
    const m = byYards((detail.tees || {}).male);
    if (m) return { gender: 'male', tee: m };
    const f = byYards((detail.tees || {}).female);
    if (f) return { gender: 'female', tee: f };
    return null;
}

// Every tee set a detail record carries, flat, in the order a chooser lists
// them: men's by length, then women's by length. Each entry names its gender
// so siFrom ("male/Blue") can be built from a pick.
function allTeeSets(detail) {
    const byYards = (arr) => (arr || []).slice().sort((a, b) => (b.total_yards || 0) - (a.total_yards || 0));
    const out = [];
    byYards((detail.tees || {}).male).forEach((t) => out.push({ gender: 'male', tee: t }));
    byYards((detail.tees || {}).female).forEach((t) => out.push({ gender: 'female', tee: t }));
    return out;
}

// THE NAME A GOLFER READS, composed once (2026-09-19). The provider gives a
// club and a course: Streamsong Resort / Red, Legacy Golf Resort / Legacy Golf
// Resort. Taking course_name alone stored and showed "Red" - and next week's
// picker would offer Red, Blue and Black with no club. The app's own directory
// names a club's course as CLUB (COURSE): "TPC Scottsdale (Stadium)", "Talking
// Stick Golf Club (O'odham)". So: club (course) when they differ, the bare
// name when they are the same (case-insensitively), whichever exists when only
// one does. Every name on the import path - the result row, the typed name,
// the panel title, the confirm label, the stored record, and the matcher that
// decides which key an import lands on - comes from here, on both pages.
function courseDisplayName(c) {
    const club = String((c && c.club_name) || '').trim();
    const course = String((c && c.course_name) || '').trim();
    if (!club) return course;
    if (!course || course.toLowerCase() === club.toLowerCase()) return club;
    return club + ' (' + course + ')';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ONLINE_SEARCH_CEILING, ONLINE_SEARCH_MESSAGES, courseImportMessage, importCardOrRefuse, pickCanonicalTee, allTeeSets, courseDisplayName };
}
