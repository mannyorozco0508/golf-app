// ============================================================================
// A PASTED COURSE NOBODY HAS SAVED GETS LOOKED UP (Road Trip, 2026-10-03)
//
// Manny's review read "2026-10-14 14:06 — Myrtlewood PineHills — will look up
// online" and "2 online lookups". He tapped Use these 7 rounds, and Day 2 PM's
// course was BLANK - "Search / Select Course" - with no message at all.
//
// TWO FAULTS, AND THE FIRST ONE IS THE EXPENSIVE ONE:
//
//   1. THAT COURSE WAS ALREADY SAVED. The directory calls it "Myrtlewood - Pine
//      Hills"; he wrote "Myrtlewood PineHills". Normalised those are
//      "myrtlewood pine hills" and "myrtlewood pinehills" - ONE SPACE apart -
//      so the matcher missed, and a course he already had was sent to a search
//      that costs two of the day's 35 requests. Compared space-free they are
//      the same string, and the round fills for nothing.
//   2. NOTHING LOOKED ANYTHING UP. The review priced a lookup the apply step
//      never performed: applyItinerary set courseId to '' and moved on, so a
//      round that said "will look up online" became a blank box that looks
//      exactly like a choice the golfer made. Now Use (and Build) run the
//      lookup, import the card through the SAME rules and onto the SAME
//      global_courses/<key> as admin.html, and a round that still has no course
//      says "Needs a course: <name>" with one tap that searches again.
//
// AND AMBIGUITY IS A QUESTION. A multi-course facility answers a search with
// its whole family - Myrtlewood is PineHills, Palmetto and Hummingbird - and
// three different eighteens carry three different stroke indexes, which is
// three different amounts of money. The picker is only automatic when the
// answer is not in doubt.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout, no real fetch, and
// trip.html's top-level `let` bindings are not sandbox properties, so the
// lookup cannot be driven from here. tools/trip-itinerary-lookup-check.js is
// the one that arrives the way Manny did: a cold trip.html at 390x844 with the
// proxy replaced by canned provider payloads, his exact line typed in with real
// keystrokes, and four arrivals - the saved course matching for free (0 API
// calls), the unsaved one imported and filled (2 calls, the record checked on
// global_courses/gca_mw_pine), the 429 showing "Needs a course" and writing
// nothing, and an ambiguous name producing a pick list that fills the round when
// tapped. IT IS ALSO WHAT CAUGHT the stale-config bug in the first draft: a
// `cfg` held across a render is an orphan, because renderRoundPlanner rebuilds
// those objects.
//
// BASELINE. Against 89bd116, the build that shipped the bug (trip.html sha
// f3f8cfee2143, trip-itinerary.js sha 2061f09d3cbc, course-import-rules.js sha
// 97145c70c106), over the FINISHED file: all 19 tests: 1 PASS / 18 FAIL. All
// four files touched were restored by sha from saved copies (trip.html
// 794dcbb43cb09397, trip-itinerary.js 4176ac064e858d42, course-import-rules.js
// 69d9c2562dc43cd1, admin.html 5002d90e277c186a), never with git restore.
//
//   THE ONE PASS is a negative rule that was already true on that build: a
//   course that genuinely is not saved still costs two requests. Everything else
//   is red, including the two cases about names not collapsing - tripItinTight
//   does not exist there, so they throw rather than quietly passing.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T = require('./trip-itinerary.js');
const C = require('./course-import-rules.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const TRIP = read('trip.html');
const ADMIN = read('admin.html');

// The real directory, out of course-data.js, so a match that works here works
// on the phone.
const cd = {};
vm.createContext(cd);
vm.runInContext(read('course-data.js') + '\nthis.D = courseDirectory; this.L = nineHoleLoops;', cd);
const KNOWN = {};
cd.D.forEach((g) => g.items.forEach((i) => { KNOWN[i.id] = i.name; }));
const plan = (text) => T.tripItinPlan(text, { year: 2026, known: KNOWN, loops: cd.L });

function fnOf(name) {
    const at = TRIP.indexOf('function ' + name + '(');
    assert.ok(at > 0, name + ' is not in trip.html at all');
    const end = TRIP.indexOf('\n    function ', at + 30);
    const slice = TRIP.slice(at, end > at ? end : at + 5000);
    assert.ok(slice.length > 80, name + ' sliced to nothing - the endpoint drifted');
    return slice;
}

describe('1. HIS EXACT LINE COSTS NOTHING', () => {
    const LINE = 'Wed 10/14 — Myrtlewood PineHills, Myrtle Beach, 2:06 PM';

    test('"Myrtlewood PineHills" IS the saved "Myrtlewood - Pine Hills"', () => {
        const p = plan(LINE);
        assert.equal(p.rows.length, 1);
        assert.equal(p.rows[0].courseKey, 'pinehills');
        assert.equal(p.rows[0].willSearch, undefined, 'a course he already has must not be searched for');
        assert.equal(p.searches, 0);
        assert.equal(p.rows[0].time, '14:06', 'and the tee time he pasted is still read');
    });

    test('the review says so, in the words the screen shows', () => {
        assert.match(T.tripItinRowLabel(plan(LINE).rows[0]), /Myrtlewood - Pine Hills/);
        assert.doesNotMatch(T.tripItinRowLabel(plan(LINE).rows[0]), /look up online/);
    });

    test('and one space does not collapse two different courses', () => {
        // Pine Hills and Pine Lakes are both in the Myrtle group, and both end
        // up space-free as pine-something: they must stay apart.
        assert.equal(T.tripItinMatch('Pine Lakes Country Club', KNOWN), 'pinelakes');
        assert.equal(T.tripItinMatch('Myrtlewood PineHills', KNOWN), 'pinehills');
        assert.notEqual(T.tripItinTight('pinehills'), T.tripItinTight('pine lakes'));
    });

    test('a course that genuinely is not saved still costs two requests', () => {
        const p = plan('Wed 10/14 — Tidewater Golf Club, 9:10 AM');
        assert.equal(p.rows[0].courseKey, null);
        assert.equal(p.rows[0].willSearch, true);
        assert.equal(p.searches, 2);
    });
});

describe('2. WHICH ONLINE RESULT, AND WHETHER TO ASK', () => {
    const FAMILY = [
        { id: 'mw_pine', name: 'Myrtlewood Golf Club (PineHills)' },
        { id: 'mw_palm', name: 'Myrtlewood Golf Club (Palmetto)' },
        { id: 'mw_hum', name: 'Myrtlewood Golf Club (Hummingbird)' }
    ];

    test('the words he typed pick PineHills out of the family', () => {
        const out = T.tripItinPickOnline('Myrtlewood PineHills', FAMILY);
        assert.ok(out.pick, 'a clear answer must not be turned into a question');
        assert.equal(out.pick.id, 'mw_pine');
    });

    test('the bare facility name is a QUESTION, not a guess', () => {
        const out = T.tripItinPickOnline('Myrtlewood', FAMILY);
        assert.equal(out.pick, undefined, 'three different eighteens is three different stroke indexes');
        assert.equal(out.choices.length, 3);
    });

    test('an exact name wins even when others contain it', () => {
        const out = T.tripItinPickOnline('Caledonia Golf & Fish Club', [
            { id: 'a', name: 'Caledonia Golf & Fish Club' },
            { id: 'b', name: 'Caledonia Golf & Fish Club Executive' }
        ]);
        assert.equal(out.pick.id, 'a');
    });

    test('nothing to choose from is null, not an empty pick list', () => {
        assert.equal(T.tripItinPickOnline('Anywhere', []), null);
        assert.equal(T.tripItinPickOnline('Anywhere', null), null);
    });
});

describe('3. THE LOOKUP RUNS, AND IT IS THE IMPORT PATH THAT ALREADY EXISTS', () => {
    test('trip.html loads the shared import rules and asks the same proxy', () => {
        assert.match(TRIP, /<script src="course-import-rules\.js"><\/script>/);
        assert.match(TRIP, /'\/api\/course-search\?q=' \+ encodeURIComponent\(name\)/);
        assert.match(TRIP, /'\/api\/course\/' \+ encodeURIComponent\(cand\.id\)/);
        assert.match(fnOf('tripCourseApiBase'), /courseProxyBase\(document, GOLF_WEB_ORIGIN\)/,
            'a relative /api/ fetch cannot reach the proxy from the shell');
    });

    test('Use these N rounds actually spends what the review priced', () => {
        assert.match(fnOf('applyItinerary'), /resolveItinCourses\(\)/);
    });

    test('and so does Build, one pass only', () => {
        const build = fnOf('buildTrip');
        assert.match(build, /itinPendingLookups\(\)\.length/);
        assert.match(build, /resolveItinCourses\(\)\.then\(\(\) => buildTrip\(\)\)/);
        assert.match(fnOf('resolveItinCourses'), /lookupTried = true/,
            'without this the rebuild-and-build pair can loop forever');
    });

    test('the card is validated BEFORE anything is written, and the record is the shared one', () => {
        const imp = fnOf('itinImportProviderCourse');
        const gate = imp.indexOf('importCardOrRefuse');
        const write = imp.indexOf("db.ref('global_courses/'");
        assert.ok(gate > -1 && write > gate,
            'a card the validator would refuse must not reach a record no client can delete');
        assert.match(imp, /buildImportRecord\(detail, siFrom\)/);
        assert.match(imp, /importedCourseKeyFor\(detail, itinDirectoryNames\(\), tripCourses\)/);
        assert.match(imp, /\.update\(rec\)/, 'admin.html merges; a set here would drop fields it does not know');
    });

    test('ONE builder, not two: the record and its key live in course-import-rules.js', () => {
        ['courseProxyBase', 'buildImportRecord', 'importedCourseKeyFor'].forEach((fn) => {
            assert.equal(typeof C[fn], 'function', fn + ' is not exported');
        });
        assert.ok(!/function buildImportRecord\(/.test(ADMIN),
            'admin.html declares its own record builder again - two pages writing one record');
        const rec = C.buildImportRecord({ id: 'x1', club_name: 'Club', course_name: 'Course',
            location: { city: 'Town' }, tees: { male: [{ tee_name: 'Blue', total_yards: 6600,
                holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, yardage: 380, handicap: i + 1 })) }] } },
            'male/Blue');
        assert.equal(rec.name, 'Club (Course)');
        assert.equal(rec.data.length, 18);
        assert.equal(rec.source.siFrom, 'male/Blue');
        assert.equal(rec.source.providerCourseId, 'x1');
    });
});

describe('4. NEVER A SILENT BLANK', () => {
    const render = fnOf('renderRoundPlanner');

    test('a round with no course names it, says why, and offers the search', () => {
        assert.match(render, /!cfg\.courseId && cfg\.needsCourse/);
        assert.match(render, /Needs a course: \$\{escapeHtml\(cfg\.needsCourse\)\}/);
        assert.match(render, /needs-course-search-\$\{i\}/);
        assert.match(render, /runRoundOnlineSearch\(\$\{i\}\)/);
        assert.match(render, /Tap to search/);
    });

    test('the box is pre-filled with the name he pasted', () => {
        assert.match(render, /: \(cfg\.needsCourse \|\| ''\)/);
    });

    test('every refusal reason gets a sentence, from the shared list', () => {
        const look = fnOf('itinLookupCourse');
        assert.match(look, /courseImportMessage\(\(payload && payload\.reason\) \|\| 'upstream_error'\)/);
        // The free tier's own sentence, which is what Manny will actually hit.
        assert.match(C.courseImportMessage('daily_limit'), /resting for today/);
    });

    test('an undecided Friday is NOT a round that needs a course', () => {
        // "Prestwick or Man O' War (not chosen)" is a deliberate blank, and
        // pestering him about it would make the honest state look like a fault.
        const row = plan("Fri 10/16 — Prestwick or Man O' War (not chosen)").rows[0];
        assert.equal(row.undecided, true);
        assert.match(fnOf('itinRowsToConfigs'), /\(!r\.courseKey && !r\.undecided\)/);
    });
});

describe('5. A HELD CONFIG IS AN ORPHAN AFTER A RENDER', () => {
    // renderRoundPlanner rebuilds roundConfigs into NEW objects, so a `cfg`
    // captured before a render and written after it updates nothing. The first
    // draft did exactly that and left the round reading "Searching online..."
    // with the answer already in hand.
    test('the three async handlers address rounds by index', () => {
        ['runRoundOnlineSearch', 'pickRoundOnlineCourse'].forEach((name) => {
            const fn = fnOf(name);
            assert.match(fn, /roundConfigs\[i\]/, name + ' does not address the round by index');
            assert.ok(!/const cfg = roundConfigs\[i\];/.test(fn),
                name + ' holds a config across a render again');
        });
        assert.match(fnOf('itinApplyOutcome'), /const cfg = roundConfigs\[i\];/,
            'the one place that may read it is the one that re-reads it after the await');
    });

    test('and the rebuild carries every field the lookup owns', () => {
        const r = fnOf('renderRoundPlanner');
        ['wantCourse', 'needsCourse', 'needsWhy', 'choices', 'lookupTried'].forEach((f) => {
            // The right-hand side may coerce (!!, || ''), so the rule is that the
            // field is assigned FROM the old config, not the exact spelling.
            assert.match(r, new RegExp('cfg\\.' + f + ' = [^;]*roundConfigs\\[i\\]\\.' + f),
                f + ' is dropped by the rebuild, so an 18/36 toggle would lose it');
        });
    });
});
