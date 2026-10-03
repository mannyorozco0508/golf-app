// ============================================================================
// THE BUILD BUTTON USES THE ITINERARY IT WAS SHOWN (Road Trip, 2026-10-03)
//
// Manny pasted seven Myrtle rounds on his phone. The review read all seven.
// He tapped "Build Trip & All Rounds" and got:
//
//     Set up at least one day above, or use "Skip planning" below.
//
// Nothing was wrong with the parser and nothing was wrong with the review. The
// planner rebuilds every round on screen from the "How Many Days" box, that box
// was empty, and so renderDayPlanner made zero days and renderRoundPlanner threw
// all seven rounds away immediately after applyItinerary had created them. Then
// renderRoundPlanner's first act - reading the form back into the configs - was
// an ERASE rather than a capture, because the form on screen still belonged to
// the previous render.
//
// FOUR THINGS ARE GUARDED HERE:
//
//   1. THE DAY COUNT IS PART OF THE STATE. applyItinerary writes the box and the
//      day model, so the rebuild it triggers produces the days the itinerary has.
//   2. ONE DAY PER DATE, NOT PER LINE. Two lines on 10/12 are one 36-hole day.
//      Seven lines over five dates is a FIVE day trip - the number every "Day N"
//      label, the trip leaderboard and the round-count invariant read.
//   3. AN ACCEPTED ITINERARY OUTLIVES THE FORM. buildTrip rebuilds from it when
//      the planner is empty, so a cleared box or a collapsed card cannot delete
//      a plan the golfer was shown, and the refusal never says "set up at least
//      one day" while an itinerary is loaded.
//   4. THE NINES IN BRACKETS. The app's own name for that course is "Thistle
//      Golf Club (NC - 27 Hole)", so a golfer copying it writes the loops the
//      same way: "... (NC - 27 Hole) (mackay/cameron)". The segment rule never
//      saw those, and silently dropped them - Thistle then plays Cameron/MacKay
//      instead of MacKay/Cameron, which is a different stroke index and
//      different money. FOUND BY THE CHROME CHECK, not by a source scan.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout and trip.html's top-level
// `let` bindings are not sandbox properties, so applyItinerary's state cannot be
// driven from here; the assertions below are the pure day grouping, the parser,
// and source scans of the wiring. tools/trip-itinerary-build-check.js is the one
// that arrives the way Manny did - a cold trip.html at 390x844, real CDP taps
// and keystrokes, nothing the page defines called - and it is what measured the
// seven rounds, the five days, the Thistle nines and the refusal that is gone.
//
// BASELINE. Against the merged HEAD that shipped the bug (1cb0e91, trip.html sha
// b56490ad401d, trip-itinerary.js sha 3e84b6e49db7), over the FINISHED file:
// all 16 tests: 2 PASS / 14 FAIL. Both files were restored by sha from saved copies
// (trip.html f3f8cfee2143cd0d, trip-itinerary.js 2061f09d3cbc12e4), never with
// git restore.
//
//   BOTH PASSES ARE IN SECTION 5 and neither is about the bug: the comma form of
//   the nines, which always worked, and the Caledonia line, which has no nines to
//   confuse. Every other rule is red - including all four grouping cases, because
//   tripItinDays is not exported on that build and the call throws in each one.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const T = require('./trip-itinerary.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const TRIP = read('trip.html');

// The slice of trip.html a rule is about, ended at the next top-level function
// rather than at a hand-written name the next feature can invalidate.
function fnOf(name) {
    const at = TRIP.indexOf('function ' + name + '(');
    assert.ok(at > 0, name + ' is not in trip.html at all');
    const end = TRIP.indexOf('\n    function ', at + 30);
    const slice = TRIP.slice(at, end > at ? end : at + 4000);
    assert.ok(slice.length > 80, name + ' sliced to nothing - the endpoint drifted');
    return slice;
}

const LOOPS = { thistle_27: {
    cameron: { name: 'Cameron Nine (Par 36)' },
    mackay: { name: 'MacKay Nine (Par 36)' },
    stewart: { name: 'Stewart Nine (Par 35)' } } };
const KNOWN = { thistle_27: 'Thistle Golf Club (NC - 27 Hole)', caledonia: 'Caledonia Golf & Fish Club' };
const planRows = (text) => T.tripItinPlan(text, { year: 2026, known: KNOWN, loops: LOOPS }).rows;

describe('1. ONE DAY PER DATE, NOT ONE DAY PER LINE', () => {
    test('two rounds on the same date are ONE day of two', () => {
        const days = T.tripItinDays([
            { date: '2026-10-12', time: '08:24' },
            { date: '2026-10-12', time: '13:40' },
            { date: '2026-10-13', time: '09:10' }
        ]);
        assert.equal(days.length, 2, 'three lines over two dates is a two-day trip');
        assert.equal(days[0].rows.length, 2);
        assert.equal(days[1].rows.length, 1);
    });

    test("Manny's seven lines over five dates are FIVE days", () => {
        const dates = ['2026-10-12', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-14', '2026-10-15', '2026-10-16'];
        const days = T.tripItinDays(dates.map(d => ({ date: d })));
        assert.equal(days.length, 5);
        assert.deepEqual(days.map(d => d.rows.length), [2, 1, 2, 1, 1]);
    });

    test('a THIRD round on one date starts another day slot rather than being dropped', () => {
        // The planner holds at most two rounds in a day. Wrong about the
        // calendar, right about the money - and visible on the review first.
        const days = T.tripItinDays([
            { date: '2026-10-12' }, { date: '2026-10-12' }, { date: '2026-10-12' }
        ]);
        assert.equal(days.length, 2);
        assert.equal(days[0].rows.length, 2);
        assert.equal(days[1].rows.length, 1);
        assert.equal(days.reduce((n, d) => n + d.rows.length, 0), 3, 'no line may be lost');
    });

    test('one line is one day, and the order is the order given', () => {
        const days = T.tripItinDays([{ date: '2026-10-16' }]);
        assert.equal(days.length, 1);
        assert.equal(days[0].date, '2026-10-16');
    });
});

describe('2. THE DAY COUNT BOX IS STATE, NOT DECORATION', () => {
    const apply = fnOf('applyItinerary');

    test('applyItinerary writes the day count box before it rebuilds', () => {
        assert.match(apply, /trip-days-input/, 'the box is never written, so the rebuild makes zero days');
        const box = apply.indexOf('trip-days-input');
        const render = apply.indexOf('renderDayPlanner()');
        assert.ok(box > 0 && render > box, 'the box must be set BEFORE renderDayPlanner reads it');
    });

    test('and it keeps the rows, so the plan survives the form', () => {
        assert.match(apply, /itinApplied = /, 'nothing remembers the accepted itinerary');
        assert.match(TRIP, /let itinApplied/);
    });

    test('the rebuild it triggers is told not to read the old form back', () => {
        const render = fnOf('renderRoundPlanner');
        assert.match(render, /function renderRoundPlanner\(skipCapture\)/);
        assert.match(render, /if \(!skipCapture\) roundConfigs\.forEach/,
            'the capture is unconditional, so it erases what applyItinerary just set');
        assert.match(apply, /renderRoundPlanner\(true\)/);
    });

    test('and a rebuild carries the tee times, which have no box to be read from', () => {
        const render = fnOf('renderRoundPlanner');
        assert.match(render, /cfg\.teeDate = roundConfigs\[i\]\.teeDate/);
        assert.match(render, /cfg\.teeClock = roundConfigs\[i\]\.teeClock/);
    });
});

describe('3. BUILD USES THE ITINERARY IT WAS SHOWN', () => {
    const build = fnOf('buildTrip');

    test('an empty planner with an accepted itinerary is rebuilt, not refused', () => {
        assert.match(build, /roundConfigs\.length === 0 && itinApplied/);
        const rebuild = build.indexOf('itinApplied');
        const refuse = build.indexOf('Set up at least one day');
        assert.ok(rebuild > 0 && refuse > rebuild,
            'the refusal is reached before the itinerary is consulted');
        assert.match(build, /roundConfigs = plan\.flat/);
    });

    test('the refusal names the tap that is missing when an itinerary was only read', () => {
        assert.match(build, /itinPlan && itinPlan\.ready/);
        assert.match(build, /Use these/);
    });

    test('the final read of the form tolerates rounds that were never rendered', () => {
        // The configs can now come from an accepted itinerary rather than from
        // the form, and an unrendered round has no boxes - unguarded, this threw
        // before anything was written.
        assert.match(build, /const courseEl = document\.getElementById\(`round-course-\$\{i\}`\);/);
        assert.match(build, /if \(courseEl\) cfg\.courseId = courseEl\.value;/);
        assert.ok(!/cfg\.courseId = document\.getElementById\(`round-course-\$\{i\}`\)\.value/.test(build),
            'still dereferencing an element that may not exist');
    });
});

describe('4. THE LINE NEAR THE BUILD BUTTON', () => {
    test('it exists, outside the paste card, above the button', () => {
        const note = TRIP.indexOf('id="itin-ready-note"');
        const card = TRIP.indexOf('id="itin-paste-card"');
        const cardEnd = TRIP.indexOf('</details>', card);
        const button = TRIP.indexOf('id="build-trip-btn"');
        assert.ok(note > 0, 'no line near the Build button names the ready itinerary');
        assert.ok(note > cardEnd, 'the line is inside the paste card, which collapses');
        assert.ok(note < button, 'the line must be above the button it describes');
    });

    test('and it is written whenever the plan changes', () => {
        assert.match(fnOf('applyItinerary'), /renderItinReadyNote\(\)/);
        assert.match(fnOf('renderItinReadyNote'), /from your itinerary ready/);
        assert.match(fnOf('buildTrip'), /renderItinReadyNote\(\)/);
    });
});

describe('5. THE NINES IN BRACKETS', () => {
    test('"(NC - 27 Hole) (mackay/cameron)" keeps the course AND both loops, in order', () => {
        const r = planRows('Thu 10/15 - Thistle Golf Club (NC - 27 Hole) (mackay/cameron), 8:40 AM')[0];
        assert.equal(r.courseKey, 'thistle_27');
        assert.equal(r.frontNineKey, 'mackay');
        assert.equal(r.backNineKey, 'cameron');
    });

    test('the comma form still works, and so does the bracket with no slash in it', () => {
        const comma = planRows('Thu 10/15 - Thistle, McKay/Cameron, Sunset Beach')[0];
        assert.equal(comma.frontNineKey, 'mackay');
        assert.equal(comma.backNineKey, 'cameron');
        const plain = planRows('Thu 10/15 - Thistle Golf Club (NC - 27 Hole)')[0];
        assert.equal(plain.courseKey, 'thistle_27');
        assert.equal(plain.frontNineKey, undefined, 'a bracket with no slash is not a pair of nines');
    });

    test('a bracketed pair does not swallow the course name', () => {
        const r = planRows('Mon 10/12 - Caledonia Golf & Fish Club, Pawleys Island, 8:24 AM')[0];
        assert.equal(r.courseKey, 'caledonia');
        assert.equal(r.frontNineKey, undefined);
    });
});
