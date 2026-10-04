// ============================================================================
// SIDE BET CHALLENGES: A PENDING OFFER THAT HOLDS NO MONEY (Wave 39)
//
// A side bet could only be created by somebody holding a scorekeeper link. The
// other three golfers in a foursome - the ones who can now follow along as
// players - could want a bet and had no way to ask for one. So: a CHALLENGE, a
// record of an offer, which becomes a side match only when the other side says
// yes.
//
//     events/<code>/challenges/<id> = { from, to, terms, status, createdAt }
//
// IT IS A DIFFERENT NODE FROM sideMatches, AND THAT IS THE WHOLE SAFETY MODEL.
// Every engine in this app reads sideMatches: money-engine, settlement-engine,
// bet-strip, side-match-lines, the Receipt. None of them has ever heard of
// challenges and none of them is being taught. So a pending challenge CANNOT
// appear in a settlement, cannot move a dollar and cannot change a golden -
// not because a filter excludes it, but because nothing that counts money looks
// at that node. challenge_money_test.js asserts it with the goldens by sha.
//
// ACCEPTING DOES NOT WRITE A BET OF ITS OWN. It calls the same payload builder
// the in-app creator calls, and writes to the same place, so the side match an
// accepted challenge produces is BYTE-IDENTICAL to the one the creator would
// have written from the same terms. CLAUDE.md: two entry points means one
// builder, and this project has already paid for a hand-written copy per
// surface - a per-press stake that reached the engine but not the pages.
//
// THE TERMS ARE THE CREATOR'S TERMS, not a subset. Format, scoring, stake,
// press rule, start hole, and the whole stroke and Nassau field sets. A
// challenge that could only express half a bet would be a second, poorer
// creator, and the golfer offered one would not know what they were agreeing to.
//
// NOTHING HERE DECIDES WHO MAY WRITE. The database rules do that, and
// sidematches.html's own gates do it on the client. This file validates a shape
// and names a status.
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that re-declares the name.
// ============================================================================

var CHALLENGE_PENDING = 'pending';
var CHALLENGE_ACCEPTED = 'accepted';
var CHALLENGE_DECLINED = 'declined';
var CHALLENGE_CANCELLED = 'cancelled';
var CHALLENGE_CLOSED = 'closed';
// Every status a challenge can hold. `closed` is what a finished round does to
// one nobody answered - see challengeStatusAfter.
var CHALLENGE_STATUSES = [CHALLENGE_PENDING, CHALLENGE_ACCEPTED, CHALLENGE_DECLINED,
                          CHALLENGE_CANCELLED, CHALLENGE_CLOSED];

var CHALLENGE_FORMATS = ['match', 'nassau', 'stroke'];

// ---------------------------------------------------------------------------
// THE TERMS, VALIDATED BEFORE ANYTHING IS WRITTEN OR SHOWN.
//
// The same contract saveSideMatch() enforces on the way out, because a challenge
// that cannot become a side match is a promise the Accept button cannot keep.
// Returns { ok } or { ok: false, reason } - a sentence, because this reaches a
// golfer.
function challengeTermsRefuse(terms) {
    var t = terms || {};
    var fmt = String(t.format || '');
    if (CHALLENGE_FORMATS.indexOf(fmt) === -1) return 'Pick Match Play, Nassau or Stroke Play.';
    var hole = Number(t.startHole);
    if (!(hole >= 1 && hole <= 18)) return 'A bet has to start on a hole from 1 to 18.';
    var num = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };
    if (fmt === 'stroke') {
        // The creator's own rule: a stroke bet with neither amount tracks no money.
        if (num(t.holeStake) <= 0 && num(t.overallStake) <= 0) {
            return "Set a $ per hole or a $ overall amount above 0, or the bet tracks no money.";
        }
    } else if (fmt === 'nassau') {
        if (num(t.frontStake) <= 0 && num(t.backStake) <= 0 && num(t.overallStake) <= 0) {
            return 'Set at least one Nassau amount above 0.';
        }
    } else if (num(t.stake) <= 0) {
        return 'Set a stake above 0.';
    }
    return null;
}
function challengeTermsValid(terms) { return challengeTermsRefuse(terms) === null; }

// ---------------------------------------------------------------------------
// THE ONE PAYLOAD BUILDER, USED BY BOTH ENTRY POINTS.
//
// sidematches.html saveSideMatch() calls this with what it read from its form;
// an accepted challenge calls it with the stored terms. That is what makes the
// two writes identical rather than merely similar - and it is why this takes
// plain values and no DOM.
//
// `startHole` is passed separately from the terms on purpose. A challenge struck
// on the 6th tee and accepted on the 9th must start where the ACCEPT happens, or
// one side walks in already knowing three holes of the result. The caller
// decides; this records it.
function sideMatchPayloadFromTerms(terms, ctx) {
    var t = terms || {};
    var c = ctx || {};
    var fmt = String(t.format || 'match');
    var ids = function (list) { return (list || []).map(String).filter(Boolean); };
    var num = function (v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; };
    var scoring = t.scoring === 'gross' ? 'gross' : 'net';
    var startHole = num(c.startHole, num(t.startHole, 1)) || 1;
    var now = num(c.now, 0) || Date.now();

    var payload = {
        format: fmt, scoring: scoring,
        teamAIds: ids(c.teamAIds), teamBIds: ids(c.teamBIds),
        startHole: startHole, createdAt: now
    };
    // Ownership metadata, exactly as the creator writes it: omitted entirely on a
    // one-group round so those wagers stay byte-identical to existing ones.
    if (c.scope) {
        payload.scope = c.scope;
        if (c.scope === 'group' && c.ownerGroup !== null && c.ownerGroup !== undefined) {
            payload.ownerGroup = c.ownerGroup;
        }
    }

    if (fmt === 'stroke') {
        payload.holeStake = num(t.holeStake, 0);
        payload.overallStake = num(t.overallStake, 0);
        payload.tieRule = t.tieRule || 'carry';
        payload.overallMode = t.overallMode || 'total';
        payload.segment = t.segment || '18';
        return payload;
    }

    payload.stake = num(t.stake, 0);
    payload.pressRule = t.pressRule || 'none';
    if (fmt !== 'nassau') return payload;

    // NASSAU GOES THROUGH action-model.js, which is the one builder for it and is
    // shared with Step 6 of round setup. Not reimplemented here: two hand-written
    // Nassau payloads is the exact bug this project has already paid for.
    if (typeof buildNassauWagerPayload !== 'function') return payload;
    var built = buildNassauWagerPayload({
        teamAIds: payload.teamAIds, teamBIds: payload.teamBIds,
        frontStake: t.frontStake, backStake: t.backStake, overallStake: t.overallStake,
        autoPressStake: (t.autoPressStake === undefined ? null : t.autoPressStake),
        pressRule: t.pressRule, scoring: scoring, startHole: startHole,
        createdAt: now
    });
    var out = {};
    Object.keys(payload).forEach(function (k) { out[k] = payload[k]; });
    Object.keys(built).forEach(function (k) { out[k] = built[k]; });
    return out;
}

// ---------------------------------------------------------------------------
// THE RECORD. from and to are ROSTER PLAYER IDS, not uids - a challenge is
// between two golfers in this round, and the roster id is what every surface in
// this app already identifies a golfer by.
function challengeRecord(input) {
    var d = input || {};
    var terms = d.terms || {};
    var out = {
        from: String(d.from || ''), to: String(d.to || ''),
        status: CHALLENGE_PENDING,
        createdAt: Number(d.now) || 0,
        terms: {}
    };
    // ONLY THE FIELDS THE FORMAT USES. A stored tieRule on a Nassau is a value
    // nothing reads that will one day disagree with the code, and the rules
    // validate refuses keys outside this set.
    var fmt = String(terms.format || 'match');
    var keep = ['format', 'scoring', 'startHole'];
    if (fmt === 'stroke') keep = keep.concat(['holeStake', 'overallStake', 'tieRule', 'overallMode', 'segment']);
    else if (fmt === 'nassau') keep = keep.concat(['stake', 'pressRule', 'frontStake', 'backStake', 'overallStake', 'autoPressStake']);
    else keep = keep.concat(['stake', 'pressRule']);
    keep.forEach(function (k) {
        if (terms[k] === undefined || terms[k] === null) return;
        out.terms[k] = (k === 'format' || k === 'scoring' || k === 'tieRule'
            || k === 'overallMode' || k === 'segment' || k === 'pressRule')
            ? String(terms[k]) : Number(terms[k]);
    });
    out.terms.format = fmt;
    out.terms.scoring = terms.scoring === 'gross' ? 'gross' : 'net';
    return out;
}

function challengeIsPending(ch) {
    return !!ch && String(ch.status || '') === CHALLENGE_PENDING;
}

// WHAT A GIVEN ACTION DOES TO A CHALLENGE, and the only transitions there are.
//
// A challenge that is not pending is FINISHED. Answering an answered one twice -
// two taps, a retry, a notification tapped after the scorekeeper already said yes
// - must change nothing, because the second answer would create a second bet.
function challengeStatusAfter(ch, action) {
    if (!challengeIsPending(ch)) return null;
    if (action === 'accept') return CHALLENGE_ACCEPTED;
    if (action === 'decline') return CHALLENGE_DECLINED;
    if (action === 'cancel') return CHALLENGE_CANCELLED;
    if (action === 'close') return CHALLENGE_CLOSED;
    return null;
}

// WHO MAY ANSWER ONE.
//
//   The golfer it was sent TO, if this device is them.
//   The scorekeeper of a group one of the two golfers is in - because golfers
//   without the app are accepted for in person, exactly as a bet is created for
//   them today.
//   The challenger may CANCEL their own, and nothing else.
//
// A spectator may do none of it, and neither may a playing golfer who is not in
// the match: a bet between two other people is not theirs to answer.
function challengeMayAnswer(ch, who) {
    var w = who || {};
    var me = w.meId === undefined || w.meId === null ? '' : String(w.meId);
    if (!challengeIsPending(ch)) return { accept: false, decline: false, cancel: false };
    var isTo = !!me && me === String(ch.to);
    var isFrom = !!me && me === String(ch.from);
    var keeper = !!w.isScorekeeper;
    return {
        accept: isTo || keeper,
        decline: isTo || keeper,
        // The challenger can withdraw; so can the scorekeeper, who may be
        // tidying up a bet nobody is going to answer.
        cancel: isFrom || keeper
    };
}

// ---------------------------------------------------------------------------
// WHAT IT READS AS. One builder, so the Matches tab, the notification and any
// future surface cannot describe the same offer differently.
function challengeStakeText(terms) {
    var t = terms || {};
    var n = function (v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; };
    var money = function (v) {
        var a = Math.abs(n(v));
        return '$' + (Number.isInteger(a) ? String(a) : a.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };
    if (t.format === 'stroke') {
        var parts = [];
        if (n(t.holeStake) > 0) parts.push(money(t.holeStake) + '/hole');
        if (n(t.overallStake) > 0) parts.push(money(t.overallStake) + ' overall');
        return parts.join(', ');
    }
    if (t.format === 'nassau') {
        var f = n(t.frontStake), b = n(t.backStake), o = n(t.overallStake);
        // The app's own Nassau shorthand: one number when all three agree.
        if (f === b && b === o && f > 0) return money(f);
        return [f, b, o].map(money).join(' / ');
    }
    return money(t.stake);
}

var CHALLENGE_FORMAT_LABEL = { match: 'Match Play', nassau: 'Nassau', stroke: 'Stroke Play' };

function challengeFormatLabel(terms) {
    return CHALLENGE_FORMAT_LABEL[(terms || {}).format] || 'Match Play';
}

// "Pending: Jimmy v Manny $20 Nassau" - the Matches tab line, exactly as briefed.
function challengePendingLine(ch, nameOf) {
    if (!ch) return '';
    var name = typeof nameOf === 'function' ? nameOf : function (id) { return String(id); };
    var who = (name(ch.from) || '?') + ' v ' + (name(ch.to) || '?');
    return 'Pending: ' + who + ' ' + challengeStakeText(ch.terms) + ' ' + challengeFormatLabel(ch.terms);
}

// The facts push-notify.js pushCopy('bet-challenge') needs, so the notification
// and the card quote the same bet.
function challengeNotifyFacts(ch, nameOf, roundCode) {
    if (!ch) return null;
    var name = typeof nameOf === 'function' ? nameOf : function (id) { return String(id); };
    return {
        kind: 'bet-challenge',
        roundCode: String(roundCode || ''),
        fromName: name(ch.from) || 'Someone',
        stakeText: challengeStakeText(ch.terms),
        formatLabel: challengeFormatLabel(ch.terms),
        offerId: String(ch.id || '')
    };
}

// Every pending challenge in a round, oldest first, so the Matches tab lists them
// in the order they were offered.
function challengesPending(data) {
    var all = (data && data.challenges) || {};
    return Object.keys(all)
        .map(function (id) {
            var ch = all[id] || {};
            var out = {};
            Object.keys(ch).forEach(function (k) { out[k] = ch[k]; });
            out.id = id;   // the map key wins - see challengesVisible
            return out;
        })
        .filter(challengeIsPending)
        .sort(function (a, b) { return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
}

// ---------------------------------------------------------------------------
// WHO SEES A CHALLENGE (Wave 39, Job 1)
//
// THE SAME SCOPING SIDE MATCHES ALREADY HAVE, plus the two golfers themselves.
//
// grouping.js canLinkSeeWager() is the one rule for "may this link see this
// wager", and it is DERIVED FROM PARTICIPANTS rather than from a stored
// ownerGroup - which is what makes a cross-group bet resolve to "mine" for BOTH
// groups in it, by construction. A Group 4 v Group 1 challenge therefore shows on
// Group 4's card and on Group 1's, and on nobody else's. That is exactly the
// behaviour asked for, and it needs no new scoping concept.
//
// WHAT IS NEW IS THE TWO PHONES. A following player holds no ?group= link at
// all, so the link-based rule alone would either show them everything or nothing.
// A golfer is shown a challenge THEY ARE IN, whoever they are holding it as -
// because it is their money and, if they are the one it was sent to, their
// decision.
//
// A SPECTATOR SEES NONE OF THEM. The bare link is what gets forwarded to wives,
// friends and group chats; a list of who is betting what is not for that reader,
// and they have nothing to answer. This is deliberately STRICTER than side
// matches, which a spectator can see - a struck bet is part of the round's story,
// an unanswered offer between two other people is not.
//
// THE ROUND'S OWNER SEES THEM ALL, because they manage the round: a pending offer
// nobody is going to answer is theirs to tidy up, which is why
// challengeMayAnswer() gives a scorekeeper `cancel`.
//
// RESULTS AND THE RECEIPT ARE UNTOUCHED. They list side matches, and an accepted
// challenge IS a side match by then - so an accepted bet appears there exactly as
// it does today, through nothing this function does.
function challengeVisibleTo(ch, who) {
    if (!ch) return false;
    var w = who || {};
    if (w.isOwner) return true;
    var me = w.meId === undefined || w.meId === null ? '' : String(w.meId);
    // THEIR OWN, whatever link they hold.
    if (me && (me === String(ch.from) || me === String(ch.to))) return true;
    // A GROUP SCOREKEEPER, through the one rule side matches use.
    if (w.lockedGroup === null || w.lockedGroup === undefined) return false;
    if (typeof canLinkSeeWager !== 'function') return false;
    return canLinkSeeWager([String(ch.from), String(ch.to)], w.lockedGroup, w.groupOf || {});
}

// Every challenge this viewer may see, in whatever status - so one filter serves
// the pending list and anything that later wants the answered ones.
function challengesVisible(data, who) {
    var all = (data && data.challenges) || {};
    return Object.keys(all)
        .map(function (id) {
            var ch = all[id] || {};
            var out = {};
            Object.keys(ch).forEach(function (k) { out[k] = ch[k]; });
            // THE MAP KEY WINS, always, and it is set LAST. A stored `id` field -
            // written by an older client, or copied in by hand - would otherwise
            // overwrite the key the page writes answers to, and Accept would
            // update a challenge that does not exist. Caught by the ordering test
            // in challenge_money_test.js, whose fixture carried both.
            out.id = id;
            return out;
        })
        .filter(function (ch) { return challengeVisibleTo(ch, who); })
        .sort(function (a, b) { return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0); });
}

// ---------------------------------------------------------------------------
// WHO MAY ANSWER AN ALOHA (Wave 39, item 2)
//
// THE DEFECT: respondAloha() is gated on canPressSideMatch(), which asks "does
// this link hold a scorekeeper scope that has a stake in this match". A
// FOLLOWING PLAYER holds no group link at all, so on a multi-group round the
// answer is no - and an Aloha is offered TO a side, not to a scorekeeper. The
// golfer whose money it is could not answer for it.
//
// THE GATE WIDENS BY EXACTLY ONE CASE, and no more:
//
//   A PLAYING GOLFER MAY ANSWER AN ALOHA OFFERED TO THE SIDE THEY ARE ON.
//
// Not any match - the one they are in. Not the offering side - an Aloha is
// answered by the side that did NOT offer it, which is the whole shape of the
// bet (the side that is down offers; the side that is up has to accept). And not
// a spectator, who is nobody in particular and has no money in anything.
//
// THE SCOREKEEPER KEEPS EVERYTHING THEY HAD, because golfers without the app are
// answered for in person, exactly as their bets are created for them today.
//
// NO RULES CHANGE IS NEEDED FOR THIS. Measured: the database already permits any
// write under an existing event - that is how a scorekeeper with no account
// posts a score - so this was never the database refusing. It was the client,
// and the client is where it is fixed.
function alohaMayRespond(input) {
    var d = input || {};
    // The existing answer, whatever it was, is preserved untouched.
    if (d.canPress) return true;
    if (!d.offeredToSideIds || !d.offeredToSideIds.length) return false;
    var me = d.meId === undefined || d.meId === null ? '' : String(d.meId);
    if (!me) return false;
    if (d.role !== ROUND_ROLE_PLAYING_LITERAL) return false;
    return d.offeredToSideIds.map(String).indexOf(me) !== -1;
}
// Written as a literal rather than importing round-role.js, because this file is
// loaded by sidematches.html and round-role.js is not - and a typeof guard that
// silently answered "not playing" would quietly re-break the thing this fixes.
var ROUND_ROLE_PLAYING_LITERAL = 'playing';

// WHICH SIDE AN ALOHA IS OFFERED TO: the one that did not offer it. aloha-bet.js
// records offeringSide as 'A' or 'B'; this turns that into the ids of the side
// that has to answer.
function alohaAnsweringSideIds(match, rec) {
    if (!match || !rec) return [];
    var offering = String(rec.offeringSide || '');
    if (offering !== 'A' && offering !== 'B') return [];
    var ids = offering === 'A' ? match.teamBIds : match.teamAIds;
    return (ids || []).map(String);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CHALLENGE_PENDING, CHALLENGE_ACCEPTED, CHALLENGE_DECLINED, CHALLENGE_CANCELLED,
        CHALLENGE_CLOSED, CHALLENGE_STATUSES, CHALLENGE_FORMATS, CHALLENGE_FORMAT_LABEL,
        challengeTermsRefuse, challengeTermsValid, sideMatchPayloadFromTerms,
        challengeRecord, challengeIsPending, challengeStatusAfter, challengeMayAnswer,
        challengeStakeText, challengeFormatLabel, challengePendingLine,
        challengeNotifyFacts, challengesPending,
        alohaMayRespond, alohaAnsweringSideIds,
        challengeVisibleTo, challengesVisible
    };
}
