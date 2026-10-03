// ============================================================================
// THE TEE TIME (Wave 39)
//
// Wave 39's recon found a round carries NO tee time: `roundDay` is a label
// ("Single Round") and `createdAt` is when the round was made. So the two
// notifications a golfer most wants - "you're in, here is when" and a reminder
// half an hour before - had nothing to quote and nothing to schedule against.
//
// THE ONE RULE THAT COSTS SOMEBODY A MORNING IF IT IS WRONG: a tee time is a
// fact about the GOLF COURSE, not about the reader's phone. A Road Trip round
// set in Oregon must read 8:40 AM to the organizer standing on the tee AND to
// his wife reading the link at home in Phoenix. Rendering the instant in the
// READER's zone makes it say 8:40 to one and 9:40 to the other, and somebody
// turns up an hour early. So the zone it was SET in is stored beside the
// instant, and every display goes through it - asserted below with an injected
// formatter, so the claim does not depend on the machine running the test.
//
// AND THE OFFSET IS CAPTURED, NEVER RE-DERIVED. A round set in March for August
// would get the wrong offset if the offset were computed from the zone name at
// save time in March. teeTimeBuild takes the offset the browser reports for THAT
// INSTANT and writes it into the string.
//
// OPTIONAL IS A FIRST-CLASS STATE. A pickup round at 7am that nobody wrote down
// is normal, and so is a round carrying a corrupt string: both must render as
// nothing, never as an empty row or "Invalid Date".
//
// BASELINE. Against pre-build main (89b3c1a) tee-time.js does not exist, the
// require throws at load, and node reports the FILE as one failing test - no
// per-assertion signal.
//
// MEASURED with a stub whose ten functions return undefined and whose three
// constants are empty, over the FINISHED file, all 19 tests: 4 PASS / 15 FAIL.
// The module was restored by sha from a saved copy (8fc8c909ceafb410), never
// with git restore.
//
//   THE FOUR PASSES ARE ALL SOURCE SCANS of a tree where the PAGES had already
//   been wired and only the module had not: the purity scan (of the stub itself),
//   the shell and SHARED_SHELL membership, the four script tags, and the four
//   call sites. Not one of them says anything about behaviour, and I am not going
//   to pretend otherwise - they are in the file because a module nothing loads
//   and nothing calls is the other way this wave could have failed.
//
//   The 15 reds are the field names, building a string, the offset sign, the
//   half-hour zone, the malformed inputs, the corrupt-round case, the zone rule,
//   the two-rounds-read-8:40 case, the label shape, the fallback, the editing
//   round-trip, the reminder instant, the past-tee-time refusal, the change
//   detector, and the no-hand-formatting scan.
//
// I first wrote this header from the draft rather than from a run, with a
// 22-test total and a split that did not match it. baseline_arithmetic_test.js
// caught both - the file registers 19 - and the figures above are measured.
// Restating the wrong pair here would have tripped the same guard again, which is
// why this paragraph describes it instead of quoting it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const T = require('./tee-time.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Phoenix does not observe daylight saving, so its offset is +420 all year -
// which makes it the right fixture for "the offset is captured" without the
// test itself having to know a DST rule.
const PHX = { date: '2026-10-04', time: '08:40', off: 420, zone: 'America/Phoenix' };
const built = (o) => T.teeTimeBuild(o.date, o.time, o.off, o.zone);

// AN INJECTED FORMATTER, so "the zone is honoured" is a measurement and not a
// statement about the machine. It records what it was asked for and renders in
// that zone through the real Intl, which is the thing production uses.
function recordingFmt(log) {
    return function (locale, opts) {
        log.push(opts && opts.timeZone);
        return Intl.DateTimeFormat(locale, opts);
    };
}

// ===========================================================================
describe('1. WHAT A ROUND STORES', () => {

    test('two fields, named once, so a save and a read cannot drift', () => {
        assert.equal(T.TEE_TIME_ISO_FIELD, 'teeTimeISO');
        assert.equal(T.TEE_TIME_ZONE_FIELD, 'teeTimeZone');
    });

    test('a date and a time become an instant WITH THE OFFSET IN IT', () => {
        const b = built(PHX);
        assert.equal(b.teeTimeISO, '2026-10-04T08:40:00-07:00');
        assert.equal(b.teeTimeZone, 'America/Phoenix');
    });

    test('THE SIGN IS THE ONE THING TO GET WRONG, and it is only converted here', () => {
        // getTimezoneOffset() is minutes to ADD to local to reach UTC; an ISO
        // offset is the other way round. Phoenix reports 420 and the string must
        // say -07:00. Inverting this makes every tee time fourteen hours out.
        assert.match(built(PHX).teeTimeISO, /-07:00$/);
        assert.match(T.teeTimeBuild('2026-10-04', '08:40', -600, 'Pacific/Auckland').teeTimeISO, /\+10:00$/);
        assert.match(T.teeTimeBuild('2026-10-04', '08:40', 0, 'Etc/UTC').teeTimeISO, /\+00:00$/);
    });

    test('a half-hour zone survives, because some of them are', () => {
        assert.match(T.teeTimeBuild('2026-10-04', '08:40', 330, 'Asia/Kolkata').teeTimeISO, /-05:30$/);
    });

    test('a malformed date, time or offset builds NOTHING - never a half-written field', () => {
        [['', '08:40', 420], ['2026-10-04', '', 420], ['4 Oct 2026', '08:40', 420],
         ['2026-10-04', '8:40', 420], ['2026-10-04', '24:00', 420], ['2026-10-04', '08:60', 420],
         ['2026-13-04', '08:40', 420], ['2026-10-32', '08:40', 420],
         ['2026-10-04', '08:40', NaN], ['2026-10-04', '08:40', 'soon']].forEach((a) => {
            assert.equal(T.teeTimeBuild(a[0], a[1], a[2], 'America/Phoenix'), null, JSON.stringify(a));
        });
    });

    test('NO TEE TIME AND A CORRUPT ONE READ THE SAME: nothing', () => {
        [null, undefined, {}, { teeTimeISO: '' }, { teeTimeISO: 'not a time' },
         { teeTimeISO: 'Invalid Date' }, { teeTimeISO: 42 }].forEach((d) => {
            assert.equal(T.teeTimeOf(d), null, JSON.stringify(d));
            assert.equal(T.hasTeeTime(d), false, JSON.stringify(d));
            assert.equal(T.teeTimeLabel(d), '', 'a corrupt round must not print "Invalid Date" on a header');
            assert.equal(T.teeTimeShort(d), '');
            assert.deepEqual(T.teeTimeInputs(d), { date: '', time: '' });
        });
        // THE POSITIVE HALF, beside the negatives, so this block cannot be
        // satisfied by functions that refuse everything.
        assert.equal(T.hasTeeTime(built(PHX)), true);
        assert.ok(T.teeTimeLabel(built(PHX)).length > 6);
    });
});

// ===========================================================================
describe('2. THE TIME IS THE COURSE\'S, NEVER THE READER\'S', () => {

    test('the stored zone is what the formatter is asked for - measured, not assumed', () => {
        const log = [];
        T.teeTimeLabel(built(PHX), recordingFmt(log));
        assert.deepEqual(log, ['America/Phoenix'],
            'the display did not ask for the round\'s zone. Rendering the instant in the '
            + 'READER\'s zone is how a Road Trip round reads 8:40 to the organizer and 9:40 to '
            + 'his wife at home, and somebody turns up an hour early.');
    });

    test('TWO ROUNDS SET AT 8:40 IN DIFFERENT ZONES BOTH READ 8:40', () => {
        // The defect in one assertion. These are two different instants - three
        // hours apart - and both cards must say 8:40 AM.
        const phx = built(PHX);
        const nyc = T.teeTimeBuild('2026-10-04', '08:40', 240, 'America/New_York');
        assert.equal(T.teeTimeShort(phx), '8:40 AM');
        assert.equal(T.teeTimeShort(nyc), '8:40 AM');
        assert.notEqual(T.teeTimeOf(phx).ms, T.teeTimeOf(nyc).ms, 'they really are different instants');
    });

    test('the label reads "<date> · <time>", the app\'s own two-part shape', () => {
        assert.equal(T.teeTimeLabel(built(PHX)), 'Sun Oct 4 · 8:40 AM');
    });

    test('NO ZONE, OR A ZONE Intl DOES NOT KNOW, FALLS BACK TO THE OFFSET - still correct', () => {
        // The offset was recorded at the course, so reading the string's own
        // fields is right rather than merely safe.
        assert.equal(T.teeTimeShort({ teeTimeISO: '2026-10-04T08:40:00-07:00' }), '8:40 AM');
        assert.equal(T.teeTimeShort({ teeTimeISO: '2026-10-04T08:40:00-07:00', teeTimeZone: 'Mars/Olympus' }), '8:40 AM');
        assert.equal(T.teeTimeShort({ teeTimeISO: '2026-10-04T13:05:00+01:00' }), '1:05 PM');
        // MIDNIGHT AND NOON, which is where a 12-hour clock goes wrong.
        assert.equal(T.teeTimeShort({ teeTimeISO: '2026-10-04T00:05:00-07:00' }), '12:05 AM');
        assert.equal(T.teeTimeShort({ teeTimeISO: '2026-10-04T12:00:00-07:00' }), '12:00 PM');
    });

    test('editing reads back THE TIME THAT WAS TYPED, wherever the organizer is now', () => {
        assert.deepEqual(T.teeTimeInputs(built(PHX)), { date: '2026-10-04', time: '08:40' });
        assert.deepEqual(T.teeTimeInputs(T.teeTimeBuild('2026-10-04', '08:40', 240, 'America/New_York')),
            { date: '2026-10-04', time: '08:40' }, 'a Date round-trip here would shift it');
    });
});

// ===========================================================================
describe('3. THE REMINDER\'S INSTANT', () => {

    test('thirty minutes before, and the brief\'s number is the file\'s number', () => {
        assert.equal(T.TEE_TIME_REMINDER_MS, 30 * 60 * 1000);
        const b = built(PHX);
        assert.equal(T.teeTimeReminderAt(b, Date.UTC(2026, 9, 4, 0, 0)),
            T.teeTimeOf(b).ms - 30 * 60 * 1000);
    });

    test('A REMINDER IS NEVER SCHEDULED INTO THE PAST', () => {
        // A phone fires a past notification immediately, which is the opposite
        // of a reminder: a golfer opening a finished round would be told to go
        // and tee off.
        const b = built(PHX);
        assert.equal(T.teeTimeReminderAt(b, Date.UTC(2027, 0, 1)), null);
        assert.equal(T.teeTimeReminderAt(b, T.teeTimeOf(b).ms - 30 * 60 * 1000), null, 'the exact moment counts as gone');
        assert.equal(T.teeTimeReminderAt(null, Date.now()), null);
    });

    test('the change detector fires on a MOVED time and stays quiet otherwise', () => {
        const b = built(PHX);
        assert.equal(T.teeTimeChanged(b.teeTimeISO, b), false,
            're-registering the same notification on every page load fills a phone\'s queue '
            + 'with duplicates of one reminder');
        assert.equal(T.teeTimeChanged(null, b), true, 'a tee time appearing is a change');
        assert.equal(T.teeTimeChanged(b.teeTimeISO, {}), true, 'a tee time REMOVED is a change');
        assert.equal(T.teeTimeChanged(b.teeTimeISO, built({ date: '2026-10-04', time: '09:10', off: 420, zone: PHX.zone })), true);
        assert.equal(T.teeTimeChanged(null, {}), false);
    });
});

// ===========================================================================
describe('4. ONE BUILDER, AND EVERY SURFACE READS IT', () => {

    test('PURE: no DOM, no db, no clock of its own', () => {
        const m = read('tee-time.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['document.', 'window.', 'firebase.', 'localStorage', 'Date.now()'].forEach((bad) => {
            assert.ok(!m.includes(bad), 'tee-time.js touches ' + bad + ' - the caller owns both');
        });
        assert.doesNotMatch(read('tee-time.js'), /^\s*const tee/m,
            'a const here collides with any page that re-declares the name');
    });

    test('it ships: the service-worker shell and SHARED_SHELL', () => {
        assert.match(read('sw.js'), /'\.\/tee-time\.js'/,
            'the pages call it UNGUARDED where a tee time is displayed, so a cached shell '
            + 'without it would throw inside a renderer');
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(read('sync-mobile-web.js'));
        assert.ok(shared && /'tee-time\.js'/.test(shared[1]), 'not in SHARED_SHELL');
    });

    test('ALL FOUR SURFACES LOAD IT - the setter and the three readers', () => {
        ['admin.html', 'index.html', 'game.html', 'trip.html'].forEach((f) => {
            assert.match(read(f), /<script src="tee-time\.js"><\/script>/, f + ' does not load it');
        });
    });

    test('and each one CALLS it, rather than loading a file it never reads', () => {
        // The positive half of the pin above: a script tag proves nothing on its
        // own, and a hand-written formatter per page is how one of them ends up
        // an hour out.
        assert.match(read('admin.html'), /teeTimeBuild\(/, 'admin.html must be the one place that WRITES one');
        assert.match(read('admin.html'), /teeTimeInputs\(/, 'and must read it back for editing');
        ['index.html', 'game.html', 'trip.html'].forEach((f) => {
            assert.match(read(f), /teeTime(Label|Short)\(/, f + ' loads the module but never displays a tee time');
        });
    });

    test('NO PAGE TOUCHES THE RAW FIELD TO DISPLAY IT', () => {
        // A second formatter is the whole defect this file exists to prevent, and
        // no assertion above would catch one.
        //
        // THE CLAIM IS PRECISE, because a blanket ban on toLocaleTimeString was
        // wrong: index.html uses it for the score-change history log, and that
        // one SHOULD be in the reader's zone - "when did I make this edit" is a
        // fact about the reader's own session, not about a golf course. Banning
        // it there would have been a rule invented to protect this test.
        //
        // So: the READER pages must not name the raw field at all, and the two
        // WRITERS may name it only where they build a payload.
        ['index.html', 'game.html'].forEach((f) => {
            const src = read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
            assert.ok(!/teeTimeISO|teeTimeZone/.test(src),
                f + ' reads the raw tee-time field. Every display goes through '
                + 'teeTimeLabel/teeTimeShort, which format in the ROUND\'s zone - rendering the '
                + 'instant in the reader\'s zone is how somebody turns up an hour early.');
        });
        // The two writers name the field - they have to, it is what they store -
        // so the claim there is that NO STRING SURGERY is done on it. A `new
        // Date(teeTimeISO)` or a `.slice()` on it in a page is a second formatter
        // being born.
        ['admin.html', 'trip.html'].forEach((f) => {
            const src = read(f).replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
            assert.match(src, /teeTime(?:ISO|Zone):/, f + ' never writes a tee time at all');
            [/new Date\([^)]*teeTime/, /Date\.parse\([^)]*teeTime/,
             /teeTime(?:ISO|Zone)[^;\n]{0,40}(?:toLocale|\.slice\(|\.substring\(|\.split\()/,
             /(?:toLocale|\.slice\(|\.substring\(|\.split\()[^;\n]{0,40}teeTime(?:ISO|Zone)/].forEach((re) => {
                assert.ok(!re.test(src), f + ' does string surgery on the raw tee time (' + re + ')');
            });
        });
        // AND THE MODULE IS WHERE THAT SURGERY LIVES, so this block is not
        // satisfied by a repo in which nothing parses a tee time at all.
        assert.match(read('tee-time.js'), /Date\.parse\(iso\)/);
    });
});
