// ============================================================================
// PASTE THE ITINERARY (Road Trip, 2026-10-03)
//
// Manny's Myrtle Beach trip is 12-16 October: five days, five courses, tee times
// in a booking email he has already been sent. Building that one round at a time
// is a lot of tapping to re-enter text he is holding.
//
// THE THREE THINGS THAT COST SOMETHING IF THE PARSER GETS THEM WRONG:
//
//   1. A COURSE NOBODY HAS CHOSEN. "Prestwick or Man O' War (not chosen)" is not
//      a course, and picking the first one puts the round on a card - a par and
//      stroke-index layout - the group is not playing. Handicap strokes fall on
//      the holes that card names, so the wrong card is the wrong money.
//   2. THE WRONG TWO NINES. "Thistle, McKay/Cameron" is a course AND a pair of
//      loops. Matching Thistle and dropping the nines builds par 36 + par 36
//      where the group plays par 35 + par 36, with a different stroke index.
//   3. A SEARCH NOBODY AGREED TO. The provider is the FREE tier - 35 requests a
//      day, shared by everybody, two per course - so the plan says how many it
//      will spend and the review screen shows that number first.
//
// AND THE PARSER NEVER WRITES. It produces rows; the review screen shows them
// and the golfer fixes them. A parser that writes straight through is a parser
// whose mistakes end up in the database.
//
// MEASURED AGAINST MANNY'S OWN TEXT, not an invented fixture, with the real
// course directory and the real nine-hole loops.
//
// BASELINE. Against pre-build main (a9fbf8d) trip-itinerary.js does not exist,
// the require throws at load, and node reports the FILE as one failing test.
//
// MEASURED with a stub whose thirteen exported functions return undefined, over
// the FINISHED file, all 19 tests: 2 PASS / 17 FAIL. The module was restored by
// sha from a saved copy (3e84b6e49db77e81), never with git restore.
//
//   BOTH PASSES ARE SOURCE SCANS, and neither says anything about parsing: the
//   purity scan reads the stub's own source, and the shipping scan reads sw.js,
//   sync-mobile-web.js and trip.html - all of which were already wired when the
//   stub went in. The 17 reds are every rule: Manny's three lines, the nines, the
//   undecided round, the search count, the dates, the times and the matching.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require('./trip-itinerary.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// THE REAL DIRECTORY AND THE REAL LOOPS. 141 courses and Thistle's three nines,
// read out of course-data.js, so a match that works here works on the phone.
const cd = {};
vm.createContext(cd);
vm.runInContext(read('course-data.js') + '\nthis.D = courseDirectory; this.L = nineHoleLoops;', cd);
const KNOWN = {};
cd.D.forEach((g) => g.items.forEach((i) => { KNOWN[i.id] = i.name; }));
const LOOPS = cd.L;
const plan = (text) => T.tripItinPlan(text, { year: 2026, known: KNOWN, loops: LOOPS });

// Manny's own paste, character for character.
const MYRTLE = [
    'Tue 10/13 — Caledonia Golf & Fish Club, Pawleys Island, 8:24 AM',
    'Thu 10/15 — Thistle, McKay/Cameron, Sunset Beach',
    "Fri 10/16 — Prestwick or Man O' War (not chosen)"
].join('\n');

// ===========================================================================
describe('1. MANNY\'S OWN ITINERARY, LINE BY LINE', () => {

    test('three lines, three rounds, no problems', () => {
        const p = plan(MYRTLE);
        assert.equal(p.rows.length, 3);
        assert.equal(p.problems, 0, p.rows.map(T.tripItinRowLabel).join(' | '));
        assert.equal(p.ready, 3);
    });

    test('CALEDONIA: matched to the SAVED course, with its tee time, costing nothing', () => {
        const r = plan(MYRTLE).rows[0];
        assert.equal(r.date, '2026-10-13');
        assert.equal(r.time, '08:24', '8:24 AM must become 08:24, not 20:24');
        assert.equal(r.courseKey, 'caledonia', 'it is in the bundled directory and must not be searched');
        assert.equal(r.willSearch, undefined);
        // THE TOWN IS NOT A COURSE. "Pawleys Island" is in the line to help a
        // human read it; searching for it finds nothing.
        assert.equal(r.courseName, 'Caledonia Golf & Fish Club');
    });

    test('THISTLE: matched, AND the two nines in the order given', () => {
        const r = plan(MYRTLE).rows[1];
        assert.equal(r.courseKey, 'thistle_27');
        assert.equal(r.frontNineKey, 'mackay', 'McKay was written first, so it is the front nine');
        assert.equal(r.backNineKey, 'cameron');
        // par 35 + par 36 is not par 36 + par 36, and the stroke indexes differ.
        assert.notEqual(r.frontNineKey, r.backNineKey);
    });

    test('"McKAY" AND "MacKAY" ARE THE SAME NINE - measured, not hypothetical', () => {
        // Manny's itinerary says McKay; course-data.js says MacKay Nine.
        assert.deepEqual(T.tripItinNines('thistle_27', ['McKay', 'Cameron'], LOOPS),
            { front: 'mackay', back: 'cameron' });
        assert.deepEqual(T.tripItinNines('thistle_27', ['MacKay', 'Stewart'], LOOPS),
            { front: 'mackay', back: 'stewart' });
        // AND IT MUST NOT COLLAPSE TWO REAL NINES. Cameron and Stewart stay
        // distinct with the vowels gone (cmrn, stwrt).
        assert.deepEqual(T.tripItinNines('thistle_27', ['Stewart', 'Cameron'], LOOPS),
            { front: 'stewart', back: 'cameron' });
        assert.equal(T.tripItinNines('thistle_27', ['Nonesuch', 'Cameron'], LOOPS), null,
            'an unrecognised nine must be asked about, not guessed');
    });

    test('"PRESTWICK OR MAN O\' WAR (NOT CHOSEN)" IS NO COURSE AT ALL', () => {
        const r = plan(MYRTLE).rows[2];
        assert.equal(r.undecided, true);
        assert.equal(r.courseKey, null, 'picking one would put the round on a card they are not playing');
        assert.equal(r.courseName, null);
        // The options are kept so the review screen shows what he wrote.
        assert.deepEqual(r.options, ['Prestwick', "Man O' War"]);
        assert.match(r.why, /no course/i);
        assert.equal(r.date, '2026-10-16');
    });

    test('ONLY THE UNMATCHED COURSE COSTS A SEARCH, and the plan says how many', () => {
        // The free tier is 35 a day, shared by everybody, and a course is two
        // requests - the search returns only a COUNT of tee boxes, so the card
        // needs a second call by id.
        assert.equal(plan(MYRTLE).searches, 0,
            'every course on this itinerary is either saved or undecided');
        const p = plan(MYRTLE + '\nMon 10/12 — Somewhere Nobody Has Heard Of, 9:00 AM');
        assert.equal(p.searches, 2, 'one unknown course is one search and one detail');
        assert.equal(p.rows[3].willSearch, true);
    });
});

// ===========================================================================
describe('2. THE DATE, AND THE YEAR IT DOES NOT GUESS', () => {

    test('every shape a booking email sends', () => {
        const d = (t) => (T.tripItinDate(t, 2026) || {}).iso;
        assert.equal(d('Tue 10/13'), '2026-10-13');
        assert.equal(d('10/13'), '2026-10-13');
        assert.equal(d('Oct 13'), '2026-10-13');
        assert.equal(d('Tue Oct 13'), '2026-10-13');
        assert.equal(d('October 13, 2027'), '2027-10-13');
        assert.equal(d('2026-10-13'), '2026-10-13');
        assert.equal(d('10/13/26'), '2026-10-13');
        assert.equal(d('Thurs. 10/15'), '2026-10-15');
    });

    test('A TWO-DIGIT DATE CARRIES NO YEAR, so one is never invented', () => {
        // Inferring a year from today is how a trip booked in December for
        // January lands eleven months early.
        assert.equal(T.tripItinDate('10/13'), null, 'no year passed, no date produced');
        assert.equal(T.tripItinDate('Oct 13'), null);
        assert.equal(T.tripItinDate('10/13', 2026).usedDefaultYear, undefined);
        assert.equal(T.tripItinDate('10/13', 2026).hadYear, false, 'and the row records that it borrowed one');
        assert.equal(T.tripItinDate('2026-10-13').hadYear, true, 'ISO brings its own');
    });

    test('a line with no date is a problem, not a round', () => {
        const r = T.tripItinParseLine('Caledonia Golf & Fish Club', { year: 2026 });
        assert.equal(r.ok, false);
        assert.match(r.why, /no date/i);
    });

    test('blank lines and email furniture are skipped, not reported', () => {
        ['', '   ', 'Itinerary', 'Booking confirmation #4821', 'Total: $1,240', 'Notes:']
            .forEach((l) => assert.equal(T.tripItinParseLine(l, { year: 2026 }), null, JSON.stringify(l)));
    });
});

// ===========================================================================
describe('3. THE TEE TIME IS OPTIONAL, AND AM/PM IS NOT GUESSED', () => {

    test('every clock shape, and midday and midnight', () => {
        const t = (x) => (T.tripItinTime(x) || {}).time;
        assert.equal(t('8:24 AM'), '08:24');
        assert.equal(t('8:24am'), '08:24');
        assert.equal(t('1:05 PM'), '13:05');
        assert.equal(t('12:00 PM'), '12:00', 'noon is 12:00, not 00:00');
        assert.equal(t('12:30 AM'), '00:30', 'half past midnight is 00:30, not 12:30');
        assert.equal(t('07:50'), '07:50');
        assert.equal(t('no time here'), undefined);
    });

    test('a line with no time still produces a round', () => {
        const r = T.tripItinParseLine('Thu 10/15 — Thistle', { year: 2026 });
        assert.equal(r.ok, true);
        assert.equal(r.time, null, 'absent is first class - half an itinerary has no times');
        assert.equal(r.courseName, 'Thistle');
    });

    test('THE TIME IS NOT LEFT IN THE COURSE NAME', () => {
        const r = T.tripItinParseLine('Tue 10/13 — Caledonia Golf & Fish Club, 8:24 AM', { year: 2026 });
        assert.equal(r.courseName, 'Caledonia Golf & Fish Club',
            'the clock must come out of the name, or nothing matches it');
    });
});

// ===========================================================================
describe('4. MATCHING IS FORGIVING ONE WAY AND STRICT THE OTHER', () => {

    test('an itinerary drops the suffix, and that still matches', () => {
        assert.equal(T.tripItinMatch('Caledonia', KNOWN), 'caledonia');
        assert.equal(T.tripItinMatch('Caledonia Golf & Fish Club', KNOWN), 'caledonia');
        assert.equal(T.tripItinMatch('True Blue', KNOWN), 'trueblue');
        assert.equal(T.tripItinMatch("Man O' War", KNOWN), 'manofwar',
            'the apostrophe and the curly one must both work');
        assert.equal(T.tripItinMatch('Man O’ War', KNOWN), 'manofwar');
    });

    test('AMBIGUOUS IS NOT MATCHED - two courses must never collapse into one', () => {
        // Eagle's Pride is in the directory twice, Red/Blue and Red/Green, with
        // DIFFERENT stroke indexes. Picking one is picking somebody's money.
        assert.equal(T.tripItinMatch("Eagle's Pride", KNOWN), null,
            'an ambiguous name must be asked about rather than resolved');
        assert.equal(T.tripItinMatch('', KNOWN), null);
        assert.equal(T.tripItinMatch('Somewhere Nobody Has Heard Of', KNOWN), null);
    });

    test('and an exact name wins over a partial one', () => {
        const known = { a: 'Thistle', b: 'Thistle Golf Club (NC - 27 Hole)' };
        assert.equal(T.tripItinMatch('Thistle', known), 'a');
    });
});

// ===========================================================================
describe('5. IT PARSES AND NOTHING ELSE', () => {

    test('PURE: no DOM, no database, no network, no clock of its own', () => {
        const m = read('trip-itinerary.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['document.', 'window.', 'firebase.', 'db.ref', 'localStorage', 'fetch(', 'Date.now()', 'new Date']
            .forEach((bad) => assert.ok(!m.includes(bad),
                'trip-itinerary.js touches ' + bad + '. It turns text into rows; the page writes, '
                + 'and the YEAR is passed in rather than read off a clock.'));
        assert.doesNotMatch(read('trip-itinerary.js'), /^\s*const trip/m,
            'a const here collides with any page that re-declares the name');
    });

    test('it ships, and trip.html loads and calls it', () => {
        assert.match(read('sw.js'), /'\.\/trip-itinerary\.js'/);
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(read('sync-mobile-web.js'));
        assert.ok(shared && /'trip-itinerary\.js'/.test(shared[1]), 'not in SHARED_SHELL');
        assert.match(read('trip.html'), /<script src="trip-itinerary\.js"><\/script>/);
        assert.match(read('trip.html'), /tripItinPlan\(/, 'loaded but never called');
    });

    test('THE REVIEW LABEL SAYS WHAT WILL HAPPEN, including the cost', () => {
        const p = plan(MYRTLE + '\nMon 10/12 — Somewhere Nobody Has Heard Of');
        const labels = p.rows.map(T.tripItinRowLabel);
        assert.match(labels[0], /^2026-10-13 08:24 — Caledonia Golf & Fish Club$/);
        assert.match(labels[1], /mackay\/cameron/);
        assert.match(labels[2], /no course yet/);
        assert.match(labels[3], /will look up online/,
            'a row that spends a request must say so before the golfer agrees');
    });
});
