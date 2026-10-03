// ============================================================================
// THE COURSE INDEX - names cheaply, cards one at a time.
//
// THE DEFECT, MEASURED 2026-10-03 against the live database over REST (the node
// carries `.read: true`, so anyone can repeat this):
//
//     global_courses                       61,258 bytes, 42 courses
//     global_courses?shallow=true             941 bytes, the same 42 keys
//     one API-imported record                8,576 bytes
//     average record                         1,440 bytes
//
// Four reads pulled the WHOLE node: a live listener in admin.html, the same in
// tournament.html, and two once() reads in trip.html. Every golfer who opened a
// setup page downloaded every course anybody had ever imported, and that payload
// grows by roughly 8 KB per import. At 500 courses it is 4.3 MB a load against a
// Spark download quota of 10 GB a month - about 2,400 setup loads.
//
// WHAT CANNOT BE DONE, AND IT IS THE REASON THIS FILE EXISTS. ?shallow=true IS A
// REST PARAMETER. The Firebase JS SDK has no shallow read - there is no option on
// a `ref`, no variant of once() - so the 65x saving is not available by changing
// a query. The alternative was a second index node in the database, which needs a
// database.rules.json change; this needs none.
//
// THE SHAPE, AND WHERE THE WIN ACTUALLY LANDS.
//
//   1. A REST probe for the KEY LIST. 941 bytes today and it stays small
//      forever - keys are 8-character ids, so a thousand courses is about 14 KB.
//   2. A NAME INDEX in localStorage. Keys cannot name a course, so a device with
//      no cache still reads the full node ONCE to build one.
//   3. A PER-COURSE read of global_courses/<key> when a course is selected,
//      which is the only moment any page needs a card.
//
// So a cold device pays what it always paid, once. Every load after that is 941
// bytes, plus one record for a course somebody added since, plus one record when
// a course is actually picked. For the organizer who opens this page every week,
// that is the whole of it.
//
// CARDS ARE NEVER CACHED. ONLY NAMES.
//
// This is the one decision in the file worth defending. The probe can see a key
// appear and a key disappear; it CANNOT see a record change. A cached card that
// had been corrected upstream would hand a round the wrong par and the wrong
// stroke index - and stroke index decides which holes a handicap stroke falls on,
// which decides net scores, which decides who gets paid. A stale NAME is a wrong
// label for at most a week, and the TTL below is what ends it. A stale CARD is a
// wrong payout nobody can see. So the selected course's record is always read
// fresh from the database, every time.
//
// PURE. No DOM, no db handle, no localStorage call - the pages own the IO and
// pass the stored text in and out. That is what makes this testable without a
// browser, which matters because helpers/mini-dom.js stubs localStorage with
// something that does not store. course_index_test.js holds the logic;
// tools/course-index-check.js proves the wiring in a real browser.
//
// Plain var/function declarations, like course-import-rules.js: a `const` here
// collides fatally with any page that ever re-declares the name.
// ============================================================================

// Seven days. The probe corrects an added or removed course immediately; only
// this corrects a RENAMED one, so it is the upper bound on how long a wrong
// label can sit in a picker. A week is short enough that nobody lives with it
// and long enough that the full read is rare.
var COURSE_INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// The version in the stored blob. Bump it and every device rebuilds the index
// from the database on its next load, which is the only migration this needs.
var COURSE_INDEX_VERSION = 1;

// THE localStorage KEY. Shared per origin with nine Consumer pages and two
// Tournament ones, so it is namespaced like golfapp-theme is.
var COURSE_INDEX_CACHE_KEY = 'golfapp-course-index-v1';

// ABOVE THIS MANY MISSING COURSES, READ THE WHOLE NODE INSTEAD.
//
// Twenty per-course reads at ~1,440 bytes is 29 KB in twenty round trips; the
// whole node is 61 KB in one. The crossover is not really about bytes - it is
// that a device returning after a season should not open twenty connections
// before it can draw a list. Below the threshold the saving is large and the
// cost is one request; above it, one read is simply the better shape.
var COURSE_INDEX_MISSING_LIMIT = 20;

// The sizes this wave is justified by, so a reader does not have to take the
// comment's word for it and a test can pin them. Measured, not estimated.
function courseIndexBytes() {
    return { wholeNode: 61258, shallow: 941, courses: 42, perRecordAvg: 1440, perRecordMax: 8576 };
}

// ---------------------------------------------------------------------------
// THE PROBE URL. shallow=true is the entire point: without it this is the 61 KB
// download the file exists to remove, which is why the test pins the query
// string and not just the path.
function courseIndexShallowUrl(databaseURL) {
    var base = String(databaseURL || '').replace(/\/+$/, '');
    return base + '/global_courses.json?shallow=true';
}

// A shallow body is a flat map of key -> true. Sorted, so a diff is stable.
//
// AND AN UNUSABLE BODY IS null, NEVER []. The difference is load-bearing: []
// means "the database has no courses", which would tell the plan below to drop
// every cached name and leave the picker empty. null means "I could not ask",
// and the plan keeps the cache on null. A dropped signal must not look like an
// empty database - that is the same collapse the course proxy's three response
// shapes exist to prevent, one layer down.
function courseIndexKeysFrom(shallowVal) {
    if (!shallowVal || typeof shallowVal !== 'object' || Array.isArray(shallowVal)) return null;
    var keys = Object.keys(shallowVal);
    if (!keys.length) return null;
    return keys.sort();
}

// key -> name, from whole records. The cards are read and thrown away here on
// purpose: this is the only thing that ever reaches localStorage.
function courseIndexNamesFrom(records) {
    var out = {};
    if (!records || typeof records !== 'object') return out;
    Object.keys(records).forEach(function (k) {
        var name = records[k] && records[k].name;
        if (typeof name === 'string' && name.trim()) out[k] = name;
    });
    return out;
}

// A NAME IS ENOUGH TO DRAW THE PICKER, and a stub is what the pages read while
// no card has been fetched.
//
// A STUB CARRIES NO data AND NO tees KEY. Three places read
// globalCourses[key].data synchronously and branch on the object existing; a
// stub carrying `data: []` would take the "this course is mapped" path and build
// a round off an empty card. Absent is the only safe shape, and a test asserts
// it rather than trusting this comment.
function courseIndexStubs(names) {
    var out = {};
    if (!names || typeof names !== 'object') return out;
    Object.keys(names).forEach(function (k) {
        var name = names[k];
        if (typeof name === 'string' && name.trim()) out[k] = { name: name };
    });
    return out;
}

// ---------------------------------------------------------------------------
// THE PLAN. Given what is cached and what the probe saw, what has to be read?
//
//   { use: 'full' }                      read global_courses whole, once
//   { use: 'cache', names, missing: [] } draw from the cache, read nothing
//   { use: 'cache', names, missing:[k] } draw from the cache, read those records
//
// `names` is null on the full path because there is nothing to draw with until
// that read lands - which is today's behaviour exactly, and the reason a cold
// device is no worse off than before.
function courseIndexPlan(cached, liveKeys, now) {
    var at = cached && typeof cached.at === 'number' ? cached.at : null;
    var names = cached && cached.names && typeof cached.names === 'object' ? cached.names : null;
    var fresh = at !== null && at <= now && (now - at) < COURSE_INDEX_TTL_MS;
    if (!names || !fresh) return { use: 'full', names: null, missing: [] };

    // The probe failed. Keep the cache: a wrong-but-complete picker beats an
    // empty one, and the per-course read on selection still gets a real card.
    if (!liveKeys) return { use: 'cache', names: names, missing: [] };

    var live = {};
    liveKeys.forEach(function (k) { live[k] = true; });

    var kept = {};
    Object.keys(names).forEach(function (k) { if (live[k]) kept[k] = names[k]; });

    var missing = liveKeys.filter(function (k) { return !names[k]; });
    if (missing.length > COURSE_INDEX_MISSING_LIMIT) return { use: 'full', names: null, missing: [] };

    return { use: 'cache', names: kept, missing: missing };
}

// ---------------------------------------------------------------------------
// THE CACHE IS TEXT, AND EVERY WAY IT CAN BE WRONG RETURNS null.
//
// localStorage is shared per origin and outlives everything: an older version of
// this app, a half-written value, a quota error mid-write, a different app on the
// same host. A throw in here happens before the page has drawn anything, so
// there is no form of garbage that may do anything but return null.
//
// A STAMP IN THE FUTURE IS REJECTED. A device whose clock is set forward would
// otherwise hold an index that never expires, and never expiring is the one
// state in which a renamed course stays wrong for ever.
function courseIndexSerialise(names, now) {
    return JSON.stringify({ v: COURSE_INDEX_VERSION, at: now, names: courseIndexNamesFrom(courseIndexStubs(names)) });
}

function courseIndexParse(text, now) {
    if (typeof text !== 'string' || !text) return null;
    var blob;
    try { blob = JSON.parse(text); } catch (e) { return null; }
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return null;
    if (blob.v !== COURSE_INDEX_VERSION) return null;
    if (typeof blob.at !== 'number' || !isFinite(blob.at) || blob.at > now) return null;
    if (!blob.names || typeof blob.names !== 'object' || Array.isArray(blob.names)) return null;
    return { at: blob.at, names: courseIndexNamesFrom(courseIndexStubs(blob.names)) };
}

// ---------------------------------------------------------------------------
// THE LOADER - ONE BUILDER, THREE PAGES
//
// CLAUDE.md: two entry points means one builder. THREE pages read the shared
// course list, and the first version of this wave hand-wrote the probe, the
// cache wrapper, the per-course read and the full-read fallback into admin.html,
// ready to be copied twice. That is exactly the shape that gave this project a
// per-press stake which reached the engine but not the pages.
//
// SO EVERY PIECE OF IO IS INJECTED and nothing here touches document, window,
// firebase or localStorage - which is also what keeps this file testable in
// plain node, where helpers/mini-dom.js has no fetch and a localStorage that
// does not store.
//
//   into         the page's OWN course map, MUTATED IN PLACE. This is what lets
//                every existing reader - globalCourses[key].name, .data, the
//                Object.keys sweeps - carry on unchanged.
//   readRecord   (key) -> Promise<record|null>. The page owns the db handle.
//   readAll      () -> Promise<records|null>. The cold path.
//   fetchJson    (url) -> Promise<any|null>. The page owns fetch, and returning
//                null for "could not ask" is the page's job.
//   getItem      (key) -> string|null, already wrapped in try/catch.
//   setItem      (key, text) -> void, already wrapped.
//   onApply      () -> void. Redraw whatever the page draws from names.
//   databaseURL  for the shallow probe.
//   now          optional clock, for tests.
function courseIndexLoader(deps) {
    var into = deps.into;
    var reads = {};
    var now = deps.now || function () { return Date.now(); };
    var nothing = function () { return null; };
    var apply = deps.onApply || function () {};

    function cachedIndex() {
        try { return courseIndexParse(deps.getItem(COURSE_INDEX_CACHE_KEY), now()); }
        catch (e) { return null; }
    }
    function saveIndex(names) {
        try { deps.setItem(COURSE_INDEX_CACHE_KEY, courseIndexSerialise(names, now())); }
        catch (e) { /* no cache next time: one full read, and nothing else */ }
    }

    // ONE RECORD, READ ONCE PER PAGE AND NEVER WRITTEN TO DISK. The probe sees a
    // key appear and disappear; it cannot see a record CHANGE. A cached card
    // that had been corrected upstream would hand a round the wrong stroke
    // index, which decides where a handicap stroke falls and therefore who gets
    // paid. Names go to localStorage; cards never do.
    // EVERY IO CALL GOES THROUGH THIS, AND IT IS NOT DEFENSIVENESS FOR ITS OWN
    // SAKE. A read that THROWS, or returns something that is not a promise, must
    // become a resolved null - not an unhandled rejection in a chain nobody is
    // awaiting. Several test harnesses stub db.ref().once() with a plain object,
    // and the first version of this file raised "deps.readAll(...).then is not a
    // function" from 69 tests in files that have nothing to do with courses. The
    // same shape is possible in production from a half-initialised SDK, and the
    // right answer there is identical: no record, draw what we have.
    function settled(fn) {
        try { return Promise.resolve(fn()).catch(nothing); } catch (e) { return Promise.resolve(null); }
    }

    function readOne(key) {
        if (!key) return Promise.resolve(null);
        if (!reads[key]) {
            reads[key] = settled(function () { return deps.readRecord(key); })
                .then(function (r) { return r || null; });
        }
        return reads[key];
    }

    // THE GATE EVERY COURSE SELECTION PASSES. Resolves on the same microtask
    // once the record is in hand, so a second pick of the same course, a
    // directory preset or a nine-hole loop costs nothing.
    function ensureCard(key) {
        if (!key) return Promise.resolve(null);
        if (into[key] && into[key].data) return Promise.resolve(into[key]);
        return readOne(key).then(function (rec) {
            if (rec && rec.name) into[key] = rec;
            return rec;
        });
    }

    // Stubs are MERGED OVER, never replacing: a record already fetched, or one
    // the page just imported and wrote, keeps its card. And a key the probe no
    // longer sees is dropped UNLESS it holds a real card - a course being read
    // right now must not vanish from under the page.
    function applyNames(names) {
        var stubs = courseIndexStubs(names);
        Object.keys(stubs).forEach(function (k) { if (!into[k]) into[k] = stubs[k]; });
        Object.keys(into).forEach(function (k) {
            if (!names[k] && !(into[k] && into[k].data)) delete into[k];
        });
        apply();
    }

    // THE COLD PATH, AND IT IS EXACTLY WHAT THESE PAGES ALWAYS DID. No cache, an
    // expired index, or a season of new courses: read the node once, draw from
    // it, and write the names so the next load costs 941 bytes.
    function readWhole() {
        return settled(function () { return deps.readAll(); }).then(function (all) {
            var records = (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
            // ONLY A THING THAT LOOKS LIKE A RECORD IS ADOPTED. The first version
            // copied every key of whatever readAll resolved to, so a stub that
            // answered with a SNAPSHOT instead of its value put `val` into the
            // course map as a course. A nameless entry cannot be offered in a
            // picker or scored, and one carrying a stray `data` key would read as
            // MAPPED - a round built on nothing.
            Object.keys(records).forEach(function (k) {
                var r = records[k];
                if (r && typeof r === 'object' && typeof r.name === 'string' && r.name.trim()) into[k] = r;
            });
            saveIndex(courseIndexNamesFrom(records));
            apply();
            return records;
        });
    }

    function load() {
        var cached = cachedIndex();

        // NO CACHE MEANS NO PROBE. THE COLD PATH MUST NOT BE SLOWER THAN WHAT IT
        // REPLACES.
        //
        // The probe exists for ONE purpose: to diff a cached name index against
        // the keys that are live. With nothing cached there is nothing to diff -
        // courseIndexPlan answers 'full' whatever the probe says - so asking
        // first only adds a network round trip in front of the read a fresh
        // device was always going to make.
        //
        // MEASURED, and it was not theoretical: tools/tournament-net-reachable-check.js
        // types a course name and clicks the row on the next line, the way a tap
        // does. Standalone it passed; inside the full suite, with several Chrome
        // instances competing, the probe had not answered in time and the course
        // list was still empty when the row was clicked - so the net-unavailable
        // warning never appeared and TEST 20 went red. A page whose first paint
        // waits on a request it does not need is a page that races.
        if (!cached) return readWhole();

        // WARM: draw the cached names BEFORE the probe answers. They are already
        // on the device, and waiting on a round trip to show them would make this
        // slower than the whole-node read it replaces.
        applyNames(cached.names);
        return settled(function () {
            return deps.fetchJson(courseIndexShallowUrl(deps.databaseURL));
        }).then(function (body) {
            var plan = courseIndexPlan(cached, courseIndexKeysFrom(body), now());
            if (plan.use === 'full') return readWhole();
            applyNames(plan.names);
            if (!plan.missing.length) return null;
            return Promise.all(plan.missing.map(readOne)).then(function (recs) {
                var names = {};
                Object.keys(plan.names).forEach(function (k) { names[k] = plan.names[k]; });
                plan.missing.forEach(function (k, i) {
                    if (recs[i] && recs[i].name) { into[k] = recs[i]; names[k] = recs[i].name; }
                });
                saveIndex(names);
                apply();
                return null;
            });
        });
    }

    return { load: load, ensureCard: ensureCard, readOne: readOne };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        COURSE_INDEX_TTL_MS, COURSE_INDEX_VERSION, COURSE_INDEX_CACHE_KEY,
        COURSE_INDEX_MISSING_LIMIT, courseIndexBytes, courseIndexShallowUrl,
        courseIndexKeysFrom, courseIndexNamesFrom, courseIndexStubs,
        courseIndexPlan, courseIndexSerialise, courseIndexParse, courseIndexLoader
    };
}
