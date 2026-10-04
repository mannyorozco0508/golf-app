// ============================================================================
// THREE WAYS INTO A ROUND (Wave 39)
//
// A round had two: the SCOREKEEPER, who holds a ?group=N link and enters scores,
// and the SPECTATOR, who holds the bare link and watches. There was no way to be
// the third and most common thing - A GOLFER WHO IS PLAYING AND NOT KEEPING
// SCORE. One person per group keeps the card; the other three are in the round,
// have money on it, and the app had nothing to say to them.
//
//     scorekeeper   ?group=N. Enters scores for that group. Unchanged.
//     playing       in the round, read-only card, THEIR OWN notifications.
//     watching      the bare link. Read-only, no notifications. Unchanged.
//
// WHY "playing" IS NOT JUST A SPECTATOR WHO PICKED A NAME. A spectator is nobody
// in particular: no bets are theirs, no final result is theirs, and nothing
// should buzz their phone. A playing golfer is a specific roster entry, and that
// is what makes their side bets, their Aloha, their final result and their hype
// addressable. The difference is a stored role, not a stored name.
//
// THE NAME COMES FROM MACHINERY THAT ALREADY EXISTS, and that is most of why
// this is small. index.html has asked "Who am I?" since Wave 17 - golfapp_me_
// <code> in localStorage, read back by resolvedMeId(), degrading a stale or
// invented id to null. MEASURED before building: whoAmILineHtml() has NO
// spectator gate (index.html:5797 - its only condition is two or more players in
// scope, which a bare-link spectator satisfies with the whole field) and setMe()
// is reachable. What did not exist was an ENTRY POINT: the picker is rendered
// only inside the Action Center body (index.html:6156), which is COLLAPSED by
// default and empty altogether on a round with no bets. So the mechanism was
// already there and nobody could find it.
//
// READ-ONLY IS NOT ENFORCED HERE. index.html's canWritePlayer() is the one gate
// on a score write and it stays the gate; this file only answers whether a role
// is a read-only one, and the page asks it there. A second permission rule would
// be a second answer to the same question.
//
// GOLFERS WITHOUT THE APP ARE UNCHANGED. The scorekeeper enters and accepts
// their bets in person, exactly as today. Nothing here makes the app a
// requirement for being in a round.
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that re-declares the name.
// ============================================================================

var ROUND_ROLE_SCOREKEEPER = 'scorekeeper';
var ROUND_ROLE_PLAYING = 'playing';
var ROUND_ROLE_WATCHING = 'watching';
var ROUND_ROLES = [ROUND_ROLE_SCOREKEEPER, ROUND_ROLE_PLAYING, ROUND_ROLE_WATCHING];

// Per round, like golfapp_me_<code>, because a golfer keeps score one week and
// plays the next and the answer belongs to the round rather than the device.
function roundRoleKey(code) { return 'golfapp_role_' + String(code || ''); }

// ---------------------------------------------------------------------------
// THE ROLE A VIEWER IS IN.
//
// A ?group= LINK IS ALWAYS THE SCOREKEEPER, whatever is stored. The URL is the
// lock - that is how a group link has always worked - and a golfer who tapped
// "I'm playing" last week and is sent a group link this week is keeping score
// this week. Letting a stored value override the URL would silence the one
// person whose phone has the card on it.
function roundRoleOf(input) {
    var d = input || {};
    if (d.hasGroupLock) return ROUND_ROLE_SCOREKEEPER;
    var stored = String(d.stored || '');
    if (stored === ROUND_ROLE_PLAYING) return ROUND_ROLE_PLAYING;
    if (stored === ROUND_ROLE_SCOREKEEPER) {
        // Stored scorekeeper with no ?group= is a stale answer - the link that
        // made it is gone. Treat it as watching rather than granting a write
        // scope the URL does not carry.
        return ROUND_ROLE_WATCHING;
    }
    return ROUND_ROLE_WATCHING;
}

// NO ROLE HERE GRANTS A WRITE. The scorekeeper's write comes from the URL and
// from index.html's canWritePlayer(), which stays the one gate on a score. This
// answers the narrower question the card asks: should this viewer be shown score
// inputs they cannot use?
function roundRoleIsReadOnly(role) {
    return role !== ROUND_ROLE_SCOREKEEPER;
}

// WHO GETS NOTIFICATIONS. A playing golfer, and nobody else.
//
// A spectator must never be notified: the bare link is what gets forwarded to
// wives, friends and group chats, and a phone that buzzes because somebody
// opened a link once is a phone that gets the app deleted. The scorekeeper is a
// playing golfer too, but they are HOLDING the card - they can see everything
// already, and a buzz for a bet they just entered themselves is noise.
function roundRoleWantsNotifications(role) {
    return role === ROUND_ROLE_PLAYING;
}

// A playing golfer who has not picked a name yet is not addressable: there is
// nothing to join their device to. So the role alone is not enough, and the page
// must not register a token until both are answered.
function roundRoleCanRegister(role, playerId) {
    return roundRoleWantsNotifications(role) && !!playerId;
}

// ---------------------------------------------------------------------------
// WHAT THE ARRIVAL SHEET OFFERS.
//
// Returns rows in the order they are shown. A group row per group, then playing,
// then watching - deliberately: the scorekeeper choice is the one that has to be
// right, and it is the one a golfer is least likely to be making.
//
// NOTHING IS OFFERED TO A VIEWER WHO ALREADY HAS A ROLE FROM THE URL. A ?group=
// link has chosen, and the organizer is not joining their own round.
function roundRoleChoices(input) {
    var d = input || {};
    if (d.hasGroupLock) return [];
    if (d.superseded) return [];
    // NOT the owner exclusion - see roundRoleShouldAsk. On a multi-group round
    // the organizer picks a group like anybody else; it is the single-group
    // OFFER LINE that has nothing to offer them.
    if (d.isOrganizer && (d.boundaries || []).length <= 1) return [];
    var players = d.players || [];
    var boundaries = d.boundaries || [];
    var rows = [];
    // ONE GROUP IS STILL A CHOICE. A foursome has exactly one card and somebody
    // has to be holding it; before this, a single-group round offered nothing at
    // all and every golfer landed on a writable card, which is how four people
    // end up typing over each other.
    var groups = boundaries.length ? boundaries : (players.length ? [{ group: 1, startIdx: 0, size: players.length }] : []);
    groups.forEach(function (b) {
        var names = players.slice(b.startIdx, b.startIdx + b.size).map(function (p) {
            return (d.label ? d.label(p) : (p && p.name) || '?');
        });
        rows.push({
            role: ROUND_ROLE_SCOREKEEPER, group: b.group,
            title: 'Keep score for Group ' + b.group,
            sub: names.join(', ')
        });
    });
    if (players.length) {
        rows.push({
            role: ROUND_ROLE_PLAYING,
            title: "I'm playing (not keeping score)",
            sub: 'Pick your name next. You get your own bets and your final result.'
        });
    }
    rows.push({
        role: ROUND_ROLE_WATCHING,
        title: 'Just watching',
        sub: 'Follow the round. Nothing will buzz your phone.'
    });
    return rows;
}

// Does the sheet need to be shown at all? Separate from the rows so a caller
// cannot accidentally show an empty sheet, and so "already answered" is one
// readable condition rather than four.
// A BLOCKING SHEET ON ARRIVAL IS FOR A ROUND THAT ALREADY HAD ONE.
//
// A multi-group round has asked "which group are you keeping score for?" on the
// bare link since 2026-09-20, so adding two rows to that sheet changes nothing
// about when a golfer is interrupted.
//
// A SINGLE-GROUP ROUND HAS NEVER BEEN INTERRUPTED, and it must not start being.
// Measured when it did: 39 guards went red, among them the byte-for-byte arrival
// pins that exist precisely to catch an unintended change to what a golfer lands
// on, three Chrome layout checks, and the modal-layering tests - because a
// foursome's bare link is how most of this app's checks, and most of its golfers,
// arrive. A modal in front of all of them is a different product decision from
// the one this wave was asked for.
//
// So the CHOICE is offered on every round and the SHEET is not: on a foursome it
// is one line on the card (roundRoleOfferLine below) that opens the same sheet.
// Same three answers, same storage, nothing blocked.
// THE OWNER IS NOT EXCLUDED FROM THE SHEET, and that is a correction.
//
// The first version skipped it for the round's owner - "they made the round,
// they are not joining it" - and organizer_doors_after_picker_test.js caught
// that: on a MULTI-GROUP round the organizer is one of the golfers and picks
// which group they are keeping score for, exactly like everybody else. That
// whole suite exists because the doors used to vanish when they answered it.
//
// The owner exclusion belongs on the single-group OFFER LINE instead, where
// there is genuinely nothing to pick: they already hold the whole card.
function roundRoleShouldAsk(input) {
    var d = input || {};
    if (d.hasGroupLock || d.superseded) return false;
    if (d.dismissed) return false;
    if (String(d.stored || '')) return false;
    if (!(d.players || []).length) return false;
    // The gate this sheet has always had.
    return (d.boundaries || []).length > 1;
}

// THE SINGLE-GROUP OFFER: one line, above the card, not in the way.
//
// Returns '' when there is nothing to offer - a group link, the owner, a round
// already answered - so the caller cannot render an empty prompt.
function roundRoleOfferLine(input) {
    var d = input || {};
    if (d.hasGroupLock || d.isOrganizer || d.superseded) return '';
    if (!(d.players || []).length) return '';
    if ((d.boundaries || []).length > 1) return '';   // that round gets the sheet
    if (String(d.stored || '')) return '';
    return 'Keeping score, playing, or just watching?';
}

// The sentence a playing golfer sees instead of score boxes, so the read-only
// card explains itself rather than looking broken.
function roundRoleNote(role, name) {
    if (role === ROUND_ROLE_PLAYING) {
        return name
            ? 'Following along as ' + name + '. ' + ROUND_ROLE_WHO_KEEPS
            : 'Following along. Pick your name to get your own bets and result.';
    }
    if (role === ROUND_ROLE_WATCHING) return 'Just watching. ' + ROUND_ROLE_WHO_KEEPS;
    return '';
}
var ROUND_ROLE_WHO_KEEPS = 'Your group’s scorekeeper is entering the scores.';

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROUND_ROLE_SCOREKEEPER, ROUND_ROLE_PLAYING, ROUND_ROLE_WATCHING, ROUND_ROLES,
        ROUND_ROLE_WHO_KEEPS, roundRoleKey, roundRoleOf, roundRoleIsReadOnly,
        roundRoleWantsNotifications, roundRoleCanRegister, roundRoleChoices,
        roundRoleShouldAsk, roundRoleOfferLine, roundRoleNote
    };
}
