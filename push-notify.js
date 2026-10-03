// ============================================================================
// PUSH NOTIFICATIONS: WHAT TO SAY, TO WHOM, AND HOW OFTEN (Wave 39, the pure half)
//
// Six notifications, three channels, one buzz a hole. This file decides all of
// that and sends nothing. It has no DOM, no db handle, no FCM credential and no
// network call - which is what lets every rule below be tested in plain node,
// and what keeps the one part of this feature that touches a service-account
// key down to a single Cloudflare Function with no product logic in it.
//
// THE SIX, as briefed:
//
//   1 youre-in        "<round>, <date> <tee time>"            essentials
//   2 final-results   "you won $40" / "you owe $25"           essentials
//   3 bet-challenge   "Jimmy challenged you: $20 Nassau"      bets    + actions
//   4 press-offered   a press or an Aloha, offered to you     bets    + actions
//   5 hype            hot streak, eagle, ace                  hype
//
// FIVE, NOT SIX. A tee-time reminder was the second and it is GONE - removed on
// Manny's call before it shipped. The tee-time FIELD stays, and 'youre-in' still
// quotes it.
//
// ESSENTIALS CANNOT BE TURNED OFF, and that is a product decision worth stating:
// knowing you are in a round, and what you ended up owing, are the two a golfer
// is relying on. Bets and Hype are opt-out.
// A golfer who wants none of it turns the whole thing off at the OS level, which
// is the honest place for that switch.
//
// ---------------------------------------------------------------------------
// WHAT THE RECON FOUND, AND IT CHANGES TWO OF THE SIX
// ---------------------------------------------------------------------------
//
// A ROUND HAS NO TEE TIME. Measured: `teeTime` appears nowhere in admin.html,
// index.html or database.rules.json. A round carries `roundDay` - which is a
// LABEL, "Single Round", not a date - and `createdAt`, which is when it was
// made. So notifications 1 and 2 have nothing to quote and nothing to schedule
// against until the setup screen asks for a tee time and the round stores one.
//
// This file is written as though that field exists, because the copy and the
// reminder arithmetic are the same either way, and every function that needs it
// REFUSES CLEANLY when it is absent - pushDecide returns { send: false,
// reason: 'no-tee-time' } rather than inventing a time. So the day the field
// lands, nothing here changes.
//
// THE ROSTER-TO-DEVICE MAPPING ALREADY EXISTS, and it is not new work. index.html
// has asked "Who am I?" since Wave 17 and stores the answer in localStorage as
// golfapp_me_<code> - resolvedMeId() turns it into a roster player id, and a
// stale or invented id degrades to null rather than breaking anything. That is
// exactly the join this feature needs: a device knows which player it is, and
// every golfer already has a uid from auth-boot.js (anonymous counts). So a
// registration is { uid, playerId, token } and nobody has to be asked a new
// question.
//
// ---------------------------------------------------------------------------
// ONE BUZZ PER HOLE, AND WHICH KINDS IT APPLIES TO
// ---------------------------------------------------------------------------
//
// The brief says max one buzz per hole. Applied to the HOLE-SCOPED kinds only -
// hype and press-offered - because those are the ones a busy hole can fire
// several of: three birdies and a press on the same green is four buzzes in a
// minute, and the throttle is the whole reason this feature is not annoying.
//
// IT MUST NOT APPLY TO ESSENTIALS. A final result that was dropped because a
// hype message got there first is a golfer who never finds out what they owe.
// Essentials are deduped (never sent twice for the same event) but never
// throttled, and a test asserts that.
//
// ---------------------------------------------------------------------------
// DEDUPE ACROSS PHONES
// ---------------------------------------------------------------------------
//
// Two different problems wear the same word, and only one of them is solvable
// here:
//
//   THE SAME EVENT SENT TWICE - a retry, a double write, two tabs - is what
//   pushDedupeKey exists for. The key is derived from the EVENT, never from the
//   clock, so the sender can record it and refuse a repeat. That is the one
//   that actually bites.
//
//   ONE PERSON, TWO DEVICES is not deduped, deliberately. A golfer with a phone
//   and a watch expects both to buzz, and silently picking one device is a
//   notification that did not arrive on the device they were looking at. The
//   dedupe is per PERSON PER EVENT, not per person per device, and the sender
//   fans out to every token that person has registered.
//
// PURE. No DOM, no db, no fetch. Plain var/function declarations, like
// course-import-rules.js: a `const` here collides fatally with any page that
// ever re-declares the name.
// ============================================================================

// The three channels, and which of the six ride on each.
var PUSH_CHANNELS = ['essentials', 'bets', 'hype'];
var PUSH_KIND_CHANNEL = {
    'youre-in': 'essentials',
    'final-results': 'essentials',
    'bet-challenge': 'bets',
    'press-offered': 'bets',
    'hype': 'hype'
};
// The kinds a single hole can fire more than one of. Everything else is an
// occasion, not an event on a hole.
var PUSH_HOLE_SCOPED = { 'press-offered': true, 'hype': true };

function pushChannelOf(kind) {
    return PUSH_KIND_CHANNEL[kind] || null;
}

// A GOLFER'S SETTINGS, NORMALISED. Anything unreadable becomes the default, and
// the default is everything ON except nothing - a golfer who has never touched
// the screen gets the full set, which is what somebody who turned the feature on
// is asking for. essentials is forced true whatever is stored, because a stored
// `false` could only have come from a bug or a hand edit.
function pushPrefsNormalise(raw) {
    var p = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    return {
        essentials: true,
        bets: p.bets === undefined ? true : !!p.bets,
        hype: p.hype === undefined ? true : !!p.hype
    };
}

function pushAllowed(kind, prefs) {
    var ch = pushChannelOf(kind);
    if (!ch) return false;
    return !!pushPrefsNormalise(prefs)[ch];
}

// ---------------------------------------------------------------------------
// THE COPY. One place, so the phone and any future surface cannot disagree.
//
// EVERY SENTENCE IS ABOUT THE READER. "you won $40", not "Marty won $40" - a
// notification is addressed to one person and the body has one line to be worth
// unlocking the phone for.
//
// AND HYPE NEVER REVEALS STANDINGS. A hot streak is news; who is leading and who
// owes what is the round's business and belongs in the app. pushCopy returns no
// money and no position for a hype message, and push_notify_test.js holds that
// against a banned vocabulary rather than trusting this comment.
// ---------------------------------------------------------------------------
function pushMoneyText(cents) {
    var n = Math.abs(Number(cents) || 0) / 100;
    var whole = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pushCopy(kind, facts) {
    var f = facts || {};
    var round = String(f.roundName || '').trim();
    if (kind === 'youre-in') {
        // The brief's shape exactly: "<round>, <date> <tee time>".
        var when = [String(f.dateText || '').trim(), String(f.teeTimeText || '').trim()]
            .filter(Boolean).join(' ');
        return { title: "You're in", body: round + (when ? ', ' + when : '') };
    }
    if (kind === 'final-results') {
        // THE ONE SENTENCE A GROUP WAITS FOR. Signed to the reader: positive is
        // owed TO them. Zero is not "you won $0" - it is its own outcome, and
        // this app has already learned that a bare $0 reads as a bug.
        var cents = Number(f.netCents) || 0;
        var tail = cents > 0 ? 'you won ' + pushMoneyText(cents)
            : (cents < 0 ? 'you owe ' + pushMoneyText(cents) : 'you came out even');
        return { title: '🏁 Final results are in', body: 'Final results are in — ' + tail };
    }
    if (kind === 'bet-challenge') {
        var who = String(f.fromName || 'Someone').trim();
        var what = [f.stakeText || (f.stakeCents ? pushMoneyText(f.stakeCents) : ''), f.formatLabel]
            .filter(Boolean).join(' ');
        return {
            title: who + ' challenged you',
            body: who + ' challenged you: ' + what,
            actions: ['accept', 'decline']
        };
    }
    if (kind === 'press-offered') {
        var p = String(f.fromName || 'Someone').trim();
        var label = String(f.offerLabel || 'a press').trim();
        return {
            title: p + ' offered a press',
            body: p + ' offered ' + label,
            actions: ['accept', 'decline']
        };
    }
    if (kind === 'hype') {
        return { title: pushHypeTitle(f), body: pushHypeBody(f) };
    }
    return null;
}

// HYPE, AND THE THREE THINGS WORTH A BUZZ. A hole-in-one, an eagle, and a run of
// birdies - which is the one that needs a definition, so it has one: three
// birdies inside any five consecutive holes, counted on GROSS, the way
// score-marks.js already decides what a birdie is.
var PUSH_STREAK_BIRDIES = 3;
var PUSH_STREAK_WINDOW = 5;

function pushHypeTitle(f) {
    if (f.hype === 'ace') return '⛳ Hole in one';
    if (f.hype === 'eagle') return '🦅 Eagle';
    return '🔥 Hot streak';
}
function pushHypeBody(f) {
    var who = String(f.playerName || 'Somebody').trim();
    if (f.hype === 'ace') return who + ' aced hole ' + Number(f.hole || 0);
    if (f.hype === 'eagle') return who + ' made eagle on hole ' + Number(f.hole || 0);
    return who + ' has ' + PUSH_STREAK_BIRDIES + ' birdies in ' + PUSH_STREAK_WINDOW + ' holes';
}

// WHICH HYPE A HOLE EARNED, if any. Reads the marks score-marks.js already
// decides - '' | 'birdie' | 'eagle' - so a birdie means here exactly what the
// red circle on the card means, and nothing re-derives par.
//
// Returns null, or { hype: 'ace' | 'eagle' | 'streak', hole }. ONE PER HOLE, in
// descending order of how much it is worth interrupting somebody for.
function pushHypeFor(marksByHole, hole, strokesOnHole) {
    var h = Number(hole) || 0;
    if (!h) return null;
    var mark = marksByHole && marksByHole[h];
    if (Number(strokesOnHole) === 1) return { hype: 'ace', hole: h };
    if (mark === 'eagle') return { hype: 'eagle', hole: h };
    // The streak window ENDS on this hole, so a run is announced on the hole
    // that completed it and never again.
    var birdies = 0;
    for (var k = h - PUSH_STREAK_WINDOW + 1; k <= h; k++) {
        if (k >= 1 && marksByHole && (marksByHole[k] === 'birdie' || marksByHole[k] === 'eagle')) birdies++;
    }
    if (mark === 'birdie' && birdies >= PUSH_STREAK_BIRDIES) return { hype: 'streak', hole: h };
    return null;
}

// ---------------------------------------------------------------------------
// THE KEYS. Both are derived from the EVENT and never from the clock, because a
// key with a timestamp in it cannot stop a retry.
// ---------------------------------------------------------------------------
function pushDedupeKey(kind, facts) {
    var f = facts || {};
    var parts = [String(kind), String(f.roundCode || ''), String(f.uid || '')];
    if (PUSH_HOLE_SCOPED[kind]) parts.push('h' + (Number(f.hole) || 0));
    // An offer is identified by the offer, not the hole alone: two presses on
    // one hole are two different things to accept.
    if (f.offerId) parts.push(String(f.offerId));
    if (kind === 'hype' && f.hype) parts.push(String(f.hype));
    return parts.join(':');
}

function pushThrottleKey(roundCode, uid, hole) {
    return 'buzz:' + String(roundCode || '') + ':' + String(uid || '') + ':h' + (Number(hole) || 0);
}

// ---------------------------------------------------------------------------
// THE ONE DECISION FUNCTION. Everything above is read through this, so a caller
// cannot accidentally skip the throttle or the preference check.
//
//   { send, reason, channel, copy, dedupeKey, throttleKey }
//
// `reason` is always set, including on a send, so a log says WHY as well as
// whether - the thing that is impossible to reconstruct afterwards otherwise.
// ---------------------------------------------------------------------------
function pushDecide(input) {
    var d = input || {};
    var kind = String(d.kind || '');
    var facts = d.facts || {};
    var no = function (reason) { return { send: false, reason: reason, channel: pushChannelOf(kind), copy: null }; };

    if (!pushChannelOf(kind)) return no('unknown-kind');
    if (!facts.uid) return no('no-recipient');
    if (!d.tokens || !d.tokens.length) return no('no-device');
    if (!pushAllowed(kind, d.prefs)) return no('channel-off');

    // THE TEE TIME A ROUND DOES NOT HAVE YET. Refused cleanly rather than
    // inventing a time - see the recon note at the top of this file.
    if (kind === 'youre-in' && !facts.teeTimeText) return no('no-tee-time');

    var dedupeKey = pushDedupeKey(kind, facts);
    if (d.alreadySent && d.alreadySent[dedupeKey]) return no('already-sent');

    var throttleKey = null;
    if (PUSH_HOLE_SCOPED[kind]) {
        throttleKey = pushThrottleKey(facts.roundCode, facts.uid, facts.hole);
        // ESSENTIALS ARE NEVER THROTTLED - they are not in PUSH_HOLE_SCOPED, so
        // this branch cannot reach them, which is the point of the table rather
        // than a condition here.
        if (d.buzzedHoles && d.buzzedHoles[throttleKey]) return no('throttled');
    }

    var copy = pushCopy(kind, facts);
    if (!copy || !copy.body) return no('no-copy');

    return {
        send: true, reason: 'ok', channel: pushChannelOf(kind),
        copy: copy, dedupeKey: dedupeKey, throttleKey: throttleKey
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PUSH_CHANNELS, PUSH_KIND_CHANNEL, PUSH_HOLE_SCOPED,
        PUSH_STREAK_BIRDIES, PUSH_STREAK_WINDOW,
        pushChannelOf, pushPrefsNormalise, pushAllowed, pushMoneyText, pushCopy,
        pushHypeTitle, pushHypeBody, pushHypeFor, pushDedupeKey, pushThrottleKey,
        pushDecide
    };
}
