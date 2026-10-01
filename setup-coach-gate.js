// ============================================================================
// THE SETUP COACH CANNOT HAND OVER A HOLLOW ROUND
//
// WHAT WENT WRONG, as Manny met it. Home -> "Help me set this up" starts well:
// Step 1 asks how many golfers. But the coach's last step is a HANDOFF - "Ready for
// the course? / Take me there" - and coachFinish() sent the host straight to the
// wizard's REVIEW page whatever had been answered. So Review could read
//
//     Course    Not selected
//     Players   0 added
//
// with "Save & Start Round" sitting under it. Skipping that step did the same thing,
// because Skip just advanced to the end.
//
// WHAT THE OLD CODE DID AND DID NOT CATCH, measured rather than assumed:
//   - saveSettings() ALREADY refuses with no course: "Please select or type a Golf
//     Course name before saving". So a course-less round could not actually be
//     written - but the refusal arrives as a telling-off at the end of the walk,
//     after the host has been shown a Review that looked finished.
//   - Players are deliberately NOT required to save. That is a real workflow, with
//     its own comment in saveSettings: a host sets up a whole trip's rounds in
//     advance and fills the rosters in later. So "no players" is only wrong on a
//     COACH-DRIVEN round, where the host has just been asked how many golfers are
//     playing and answered. That is why every gate here is scoped to the coach.
//
// SO THIS FILE IS THE ORDER, NOT THE ENFORCEMENT. It is pure: it takes what the DOM
// says and returns which requirements are unmet, which wizard step each one is
// edited on, and what the button should say. admin.html reads the DOM, calls this,
// and jumps. Keeping it pure is what lets the tests drive the whole decision table
// without a browser.
//
// THE RANGES ARE MINIMA, and that is deliberate. "Five to eight" cannot mean exactly
// five, so the requirement is AT LEAST five - enough to catch a Review with two rows
// on it, without refusing a host who answered "five to eight" and brought seven.
// ============================================================================
(function () {
    'use strict';

    // The coach's own answer -> the fewest golfers that answer can honestly mean.
    var EXPECTED = { four: 4, eight: 5, big: 9 };
    function coachExpectedGolfers(size) {
        var n = EXPECTED[String(size || '')];
        return n ? n : 0;
    }

    // WHICH COACH STEPS MAY BE SKIPPED. Skip stays for the optional extras - flights,
    // money, handicaps - and comes OFF the two answers the round cannot be built
    // without: how many golfers, and what is being played. A Skip on a required step
    // used to walk straight to a blank Review, which is the bug.
    var REQUIRED_STEPS = { size: true, format: true };
    function coachStepIsRequired(key) {
        return !!REQUIRED_STEPS[String(key || '')];
    }

    // ---- THE REQUIREMENTS, IN THE ORDER THEY ARE FIXED --------------------
    //
    // state:
    //   courseName   the text in the course field, trimmed
    //   formatValue  the game-format select's value
    //   teeRequired  true when the course HAS rated tees and the handicap basis
    //                needs them (a course with no rated tees asks for nothing)
    //   teeComplete  true when slope and rating are actually read back
    //   playerCount  how many player rows are on screen
    //   expected     coachExpectedGolfers(the size answer), 0 when unanswered
    // steps: { course, format, players } - the wizard's own step numbers, passed in
    // so this file never hardcodes a number the workflow can change.
    function coachGateRows(state, steps) {
        var s = state || {};
        var st = steps || {};
        var expected = Number(s.expected) || 0;
        var have = Number(s.playerCount) || 0;
        // A coach round with no size answer still needs SOMEBODY on it: one row is
        // the floor, because a round with nobody in it cannot be scored by anyone.
        var needPlayers = expected || 1;
        return [
            {
                key: 'course',
                met: !!(s.courseName && String(s.courseName).trim()),
                step: st.course,
                label: 'Course',
                cta: 'Pick a course',
                why: 'A round with no course has no scorecard, so no hole has a par or a stroke index.'
            },
            {
                key: 'tee',
                // Only a requirement when the course offers rated tees AND the
                // handicaps need them. Everything else is already met.
                met: !s.teeRequired || !!s.teeComplete,
                step: st.course,
                label: 'Tee and rating',
                cta: 'Pick a tee',
                why: 'GHIN indexes become course handicaps from the tee, so without one the strokes are guesses.'
            },
            {
                key: 'format',
                met: !!(s.formatValue && String(s.formatValue).trim()),
                step: st.format,
                label: 'Scoring',
                cta: 'Choose the scoring',
                why: 'The format decides what a hole is worth, and every other screen is drawn from it.'
            },
            {
                key: 'players',
                met: have >= needPlayers,
                step: st.players,
                label: 'Players',
                cta: have === 0 ? 'Add players' : 'Add ' + (needPlayers - have) + ' more',
                why: expected
                    ? 'You said ' + expected + ' or more are playing and the round has ' + have + '.'
                    : 'A round needs at least one golfer on it.',
                need: needPlayers,
                have: have
            }
        ];
    }

    function coachUnmet(state, steps) {
        return coachGateRows(state, steps).filter(function (r) { return !r.met; });
    }
    function coachFirstUnmet(state, steps) {
        var out = coachUnmet(state, steps);
        return out.length ? out[0] : null;
    }
    function coachGateClear(state, steps) {
        return coachUnmet(state, steps).length === 0;
    }

    // The sentence above the blocked Save. It NAMES what is missing rather than
    // saying "something is missing", because the host is standing on the tee.
    function coachBlockLine(state, steps) {
        var out = coachUnmet(state, steps);
        if (!out.length) return '';
        var names = out.map(function (r) { return r.label.toLowerCase(); });
        var list = names.length === 1 ? names[0]
            : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
        return 'This round still needs ' + list + '. Nothing has been saved yet.';
    }

    var api = {
        coachExpectedGolfers: coachExpectedGolfers,
        coachStepIsRequired: coachStepIsRequired,
        coachGateRows: coachGateRows,
        coachUnmet: coachUnmet,
        coachFirstUnmet: coachFirstUnmet,
        coachGateClear: coachGateClear,
        coachBlockLine: coachBlockLine
    };
    if (typeof window !== 'undefined') window.setupCoachGate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
