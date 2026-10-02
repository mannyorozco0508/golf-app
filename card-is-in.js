// ============================================================================
// "YOUR CARD IS IN" - THE END OF A GROUP'S JOB, SAID OUT LOUD
//
// THE PROBLEM. A foursome posts its last score and the app says nothing. The hole
// view still looks like a hole view, the Finish button still reads "Finish Round",
// and nobody on the tee box knows whether they are done, whether the money is
// settled, or where to go. On a six-group round they are done KEEPING SCORE and the
// round is not over, and those are two different facts that nothing distinguished.
//
// THREE FACTS, AND KEEPING THEM APART IS THE WHOLE JOB:
//
//   1. IS THIS GROUP'S CARD COMPLETE?   Every golfer in THIS group has every hole.
//      That is a per-group question and it is what "your card is in" answers.
//   2. IS THE ROUND FINISHED?           settlement-engine's computeRoundFinish over
//      the WHOLE field - the same resolver Net Finish uses to decide whether it may
//      print names. Passed in as roundFinished; never recomputed here, because two
//      answers to "is it over" is exactly the defect this repo has paid for before.
//   3. AM I KEEPING A CARD AT ALL?      A group link is a scorekeeper's link. A bare
//      link on a multi-group round is not keeping any particular card, so it never
//      gets told "your card is in" - it gets the waiting state, which is the true
//      thing to say to somebody watching.
//
// WHY A GROUP'S THRU IS THE MINIMUM. "Group 4 (thru 16)" means every golfer in it
// has at least 16 holes, which is what somebody waiting wants to know. Taking the
// maximum would announce a group as nearly done on the strength of its fastest
// card, and taking an average would be a number nobody could point at.
//
// PICKED-UP BALLS, AND WHY THIS DOES NOT OVERRULE THE ENGINE. A group where somebody
// picked up never has every hole, so its card never completes by counting. The round
// can still be FINISHED, because the organizer verified it - computeRoundFinish's
// verified arm - and when the round is finished this card says so regardless of what
// the counting says. The engine's answer wins; the counting only ever adds the
// per-group "your card is in" that the engine does not model.
//
// NOTHING HERE TOUCHES MONEY, and nothing here locks anything. Score editing stays
// exactly as it was: the card carries a "Fix a score" link because a card that is in
// is not a card that is frozen, and saying so is cheaper than a support question.
// ============================================================================
(function () {
    'use strict';

    var WORDS = {
        mine: '✅ Your card is in.',
        mineSub: 'You are done keeping score.',
        finalHead: '🏁 Final results are in',
        finalSub: 'Every group is finished.',
        waitHead: 'Still playing',
        results: 'See Results',
        leaderboard: 'See Leaderboard',
        fix: 'Fix a score',
        singleFinal: 'Results are final.'
    };

    // How many holes a golfer must have. The card is the course that was set up -
    // 18, or 9 on a nine-hole round - and an empty course means the question cannot
    // be asked at all.
    function holeNumbers(courseData) {
        return (courseData || []).map(function (h) { return h && h.hole; })
            .filter(function (n) { return n > 0; });
    }

    // Per-group: who is in it, how many holes the slowest card has, and whether
    // every golfer in it has every hole.
    //
    // OUT GOLFERS ARE NOT WAITED ON. players[i].out is the roster's own "not playing
    // today" flag, written by the Players sheet. A group of four with one out is a
    // threeball, and holding the round open for a golfer who is not there would be
    // the app arguing with the people on the course.
    function groupProgress(players, courseData, scores, groupOf) {
        var holes = holeNumbers(courseData);
        var sc = scores || {};
        var map = groupOf || {};
        var out = {};
        (players || []).forEach(function (p) {
            if (!p || p.out) return;
            var g = map[String(p.id)];
            if (g === undefined || g === null) return;
            var key = String(g);
            if (!out[key]) out[key] = { group: g, players: 0, thru: holes.length, complete: true, posted: 0 };
            var row = out[key];
            var n = 0;
            holes.forEach(function (h) { if (Number(sc['p' + p.id + '_h' + h]) > 0) n += 1; });
            row.players += 1;
            row.posted += n;
            if (n < row.thru) row.thru = n;
            if (!holes.length || n < holes.length) row.complete = false;
        });
        return Object.keys(out).map(function (k) { return out[k]; })
            .sort(function (a, b) { return Number(a.group) - Number(b.group); });
    }

    // "Waiting on 2 groups - Group 4 (thru 16), Group 6 (thru 14)". A group that has
    // not teed off at all still reads (thru 0), which is the truth and is better than
    // leaving it off the list.
    function waitingLine(waiting) {
        var list = waiting || [];
        if (!list.length) return '';
        var names = list.map(function (g) { return 'Group ' + g.group + ' (thru ' + g.thru + ')'; });
        return 'Waiting on ' + list.length + ' group' + (list.length === 1 ? '' : 's')
            + ' — ' + names.join(', ');
    }

    // ---- THE ONE BUILDER -------------------------------------------------
    //
    // state in:
    //   players, courseData, scores   the round, as the page already holds it
    //   groupOf                       playerGroupMap() - id -> group number
    //   hasGroupLock, lockedGroup     this session's ?group=
    //   groupCount                    how many groups the round has
    //   roundFinished                 computeRoundSettlement(...).finished, passed in
    //
    // out: { show, kind, head, sub, note, cta, ctaKind, fix, waiting }
    //   kind 'mine'    this group is in, the round is not
    //        'final'   the round is finished - said to everybody, card-keeper or not
    //        'waiting' somebody else is still out, and this session is not keeping a
    //                  card that is in
    //        'none'    nothing to say yet
    function cardIsInState(input) {
        var s = input || {};
        var holes = holeNumbers(s.courseData);
        var groups = groupProgress(s.players, s.courseData, s.scores, s.groupOf);
        var count = Number(s.groupCount) || groups.length || 1;
        var finished = !!s.roundFinished;
        var waiting = groups.filter(function (g) { return !g.complete; });
        var mineComplete = false;
        if (s.hasGroupLock && s.lockedGroup !== null && s.lockedGroup !== undefined) {
            var mine = groups.filter(function (g) { return String(g.group) === String(s.lockedGroup); })[0];
            mineComplete = !!(mine && mine.complete);
        } else if (count <= 1) {
            // THE BARE LINK ON A ONE-GROUP ROUND IS THE SCOREKEEPER. There is only
            // one card, and whoever is holding the round is keeping it.
            mineComplete = groups.length === 1 && groups[0].complete;
        }
        // A round with no course, or one nobody has started, has nothing to say.
        var anyPosted = groups.some(function (g) { return g.posted > 0; });
        if (!holes.length || !anyPosted) {
            return { show: false, kind: 'none', head: '', sub: '', note: '', cta: '', ctaKind: '', fix: false, waiting: [] };
        }

        // THE ENGINE'S ANSWER FIRST. A finished round is final for everybody, and it
        // is said the same way to the group that just holed out and to somebody who
        // opened the link from the clubhouse.
        if (finished) {
            return {
                show: true, kind: 'final',
                head: WORDS.finalHead,
                sub: mineComplete ? (WORDS.mineSub + ' ' + WORDS.finalSub) : WORDS.finalSub,
                note: '', cta: WORDS.results, ctaKind: 'results',
                fix: mineComplete, waiting: []
            };
        }
        if (mineComplete) {
            // ONE GROUP AND NOT FINISHED means a picked-up ball: the counting says
            // the card is in, the engine says the round is not over (nobody has
            // verified it). Both are true, so both are said, and the button goes to
            // the results the organizer has to look at.
            var single = count <= 1;
            return {
                show: true, kind: 'mine',
                head: WORDS.mine,
                sub: WORDS.mineSub,
                note: single ? '' : waitingLine(waiting),
                cta: single ? WORDS.results : WORDS.leaderboard,
                ctaKind: single ? 'results' : 'leaderboard',
                fix: true, waiting: waiting
            };
        }
        if (waiting.length && waiting.length < groups.length) {
            // SOMEBODY IS IN AND SOMEBODY IS OUT, and this session is not the one
            // that is in. Never "your card is in" - that is item 4 of the brief and
            // the whole reason this branch exists.
            return {
                show: true, kind: 'waiting',
                head: WORDS.waitHead, sub: '', note: waitingLine(waiting),
                cta: WORDS.leaderboard, ctaKind: 'leaderboard', fix: false, waiting: waiting
            };
        }
        return { show: false, kind: 'none', head: '', sub: '', note: '', cta: '', ctaKind: '', fix: false, waiting: [] };
    }

    // THE POPUP'S WAITING LINE (Wave 36 revision). Shorter than the card's: no
    // count, because the names are right there - "Waiting on Group 4 (thru 16),
    // Group 6 (thru 14)."
    function waitingShort(waiting) {
        var list = waiting || [];
        if (!list.length) return '';
        return 'Waiting on ' + list.map(function (g) {
            return 'Group ' + g.group + ' (thru ' + g.thru + ')';
        }).join(', ') + '.';
    }

    // THE ABOVE-THE-HOLE CARD IS NOW ONE LINE (Wave 36 revision). Manny tested the
    // full card on a device and it was too much on a screen whose job is score
    // entry. The popup carries the scores; this is the ambient line that remains,
    // and for a watcher it is the only thing that ever says who is still out.
    function cardIsInOneLine(state) {
        var st = state || {};
        if (!st.show) return '';
        if (st.kind === 'final') return WORDS.finalHead;
        if (st.kind === 'mine') {
            // The card-keeper's line keeps the waiting names, because on a
            // multi-group round that is the whole answer to "are we done".
            return st.note ? WORDS.mine + ' ' + st.note : WORDS.mine;
        }
        return st.note || WORDS.waitHead;
    }

    // WHO IS IN THIS GROUP, for the popup's score rows. The popup shows THIS
    // GROUP only - the whole point of it - and this is the one place that decides
    // which golfers that means, so the popup and the waiting line cannot disagree.
    //
    // NO SCORING MATH HERE. The rows themselves are built by
    // computeNetToParStandings in money-engine.js, which is what every other
    // surface in the app uses; this only picks the players.
    function groupMembers(players, groupOf, lockedGroup, hasGroupLock) {
        var list = (players || []).filter(function (p) { return p && !p.out; });
        if (!hasGroupLock || lockedGroup === null || lockedGroup === undefined) return list;
        var map = groupOf || {};
        return list.filter(function (p) { return String(map[String(p.id)]) === String(lockedGroup); });
    }

    // The Results tab's one line, from the same state: who is still out, or Final.
    function resultsBanner(state) {
        var st = state || {};
        if (st.kind === 'final') return { show: true, text: 'Final', note: '' };
        if (st.note) return { show: true, text: 'Not final yet', note: st.note };
        return { show: false, text: '', note: '' };
    }

    var api = {
        WORDS: WORDS,
        groupProgress: groupProgress,
        waitingLine: waitingLine,
        waitingShort: waitingShort,
        cardIsInOneLine: cardIsInOneLine,
        groupMembers: groupMembers,
        cardIsInState: cardIsInState,
        resultsBanner: resultsBanner
    };
    if (typeof window !== 'undefined') window.cardIsIn = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
