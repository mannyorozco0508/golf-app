// ============================================================================
// THE COURSE SEARCH STOPS BEING LITERAL (2026-10-05)
//
// Manny typed "Tri Mountain" and got nothing. The course is spelled
// "Tri-Mountain" on the sign and in the provider's database, and only the
// hyphenated spelling found it. Nobody types a hyphen.
//
// FOUR NORMALISATIONS, ON BOTH SIDES, before anything is compared: punctuation
// (hyphens and slashes to spaces; apostrophes and periods removed outright, so a
// dropped apostrophe cannot split a word in two), "&" to "and", a CLOSED list of
// abbreviations (st/saint, mt/mount, mtn/mountain and a dozen more), and the
// filler words that were already dropped from a query. Then three ways to match:
// substring, every query word prefix-matching some name word in ANY ORDER, and
// the JOINED form - "trimountain" - which needs five characters before it is
// allowed to fire.
//
// AND THE SAME SPELLINGS ARE TRIED ONLINE. The query goes to the provider AS
// TYPED first, because the provider is better at real names than we are; only a
// result-less answer earns a retry, so a course found first time still costs one
// request against the daily budget.
//
// THE CONTROL IS THE POINT OF THE FILE. A looser matcher that returns courses
// nobody asked for is worse than a strict one that misses: a golfer picks the
// wrong card and every handicap in the round is computed off the wrong rating.
// Section 3 is a directory of real names with queries that must NOT match.
//
// AND THE BASELINE CORRECTED MY DIAGNOSIS, which is worth more than the fix.
// Measured over the FINISHED file against main (a2a28ec, admin.html swapped out
// and restored by sha), all 10 tests: 3 PASS / 7 FAIL. 3 + 7 = 10.
//
//   "Tri Mountain" finds Tri-Mountain PASSED AT BASELINE. The old matcher
//   already turned every non-alphanumeric into a space, so the hyphen was never
//   the local problem - which means what failed Manny was the ONLINE lookup,
//   where the query went to the provider exactly as typed and the provider holds
//   the hyphenated spelling. The retry loop is the fix for the thing he actually
//   hit; the local loosening below fixes the cases that were genuinely broken.
//
//   The other two passes are the filler-word rule and "a query that names
//   nothing finds nothing" - both true before, both here as the things the
//   loosening must not break.
//   The seven reds are the joined form, the abbreviations, the ampersand, the
//   apostrophe, both halves of the online retry, the directory control (which
//   now counts exact hits rather than asserting a bare "nothing") and the joined
//   arm's length guard.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const ADMIN = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
const sb = loadHtmlInlineScript('admin.html', [], { search: '?fresh=1' });
const matches = (q, n) => vm.runInContext(
    'courseNameMatches(' + JSON.stringify(q) + ', ' + JSON.stringify(n) + ')', sb);
const variants = q => JSON.parse(vm.runInContext(
    'JSON.stringify(courseQueryVariants(' + JSON.stringify(q) + '))', sb));

const TRI = 'Tri-Mountain Golf Course';

describe('1. THE SPELLING MANNY TYPED FINDS THE COURSE', () => {

    test('"Tri Mountain" finds Tri-Mountain - and this one already worked', () => {
        // KEPT, AND DEMOTED HONESTLY: it passes against the old matcher too. The
        // local list was never the problem for this exact query; the online lookup
        // was. Section 2 is the fix for what Manny actually hit.
        assert.equal(matches('Tri Mountain', TRI), true);
        assert.equal(matches('tri mountain', TRI), true);
        assert.equal(matches('TRI MOUNTAIN', TRI), true);
    });

    test('and so do the joined and abbreviated spellings', () => {
        assert.equal(matches('trimountain', TRI), true, 'the joined form');
        assert.equal(matches('TriMountain', TRI), true);
        assert.equal(matches('tri-mtn golf', TRI), true, 'mtn is not expanded to mountain');
        assert.equal(matches('tri mtn', TRI), true);
        // AND THE OTHER DIRECTION: a hyphenated query against a spaced name.
        assert.equal(matches('Tri-Mountain', 'Tri Mountain Golf Course'), true);
        assert.equal(matches('trimountain', 'Tri Mountain Golf Course'), true);
    });

    test('St is Saint, both ways round', () => {
        assert.equal(matches('St Andrews', 'Saint Andrews Links'), true);
        assert.equal(matches('Saint Andrews', 'St. Andrews Old Course'), true);
        assert.equal(matches('st andrews', "ST ANDREWS"), true);
        assert.equal(matches('Mt Si', 'Mount Si Golf Course'), true);
    });

    test('& is and, and an apostrophe is nothing at all', () => {
        assert.equal(matches('Rock & Roll GC', 'Rock and Roll Golf Club'), true);
        assert.equal(matches('Rock and Roll', 'Rock & Roll GC'), true);
        // A DROPPED APOSTROPHE MUST NOT SPLIT A WORD: "Pete's" is "petes", so a
        // query of "petes" finds it and "pete s" is not what the name became.
        assert.equal(matches('Petes', "St. Pete's Golf Club"), true);
        assert.equal(matches("Pete's", 'Saint Petes GC'), true);
    });

    test('the filler words are still filler, and order still does not matter', () => {
        assert.equal(matches('Dobson Ranch Golf Course', 'Dobson Ranch'), true);
        assert.equal(matches('Ranch Dobson', 'Dobson Ranch Golf Course'), true);
        assert.equal(matches('pebble', 'Pebble Beach Golf Links'), true);
        assert.equal(matches('', TRI), true, 'an empty query lists everything');
    });
});

describe('2. THE ONLINE LOOKUP TRIES THE OTHER SPELLINGS', () => {

    test('as typed FIRST, then hyphenated, spaced and joined - deduped', () => {
        assert.deepEqual(variants('Tri Mountain'),
            ['Tri Mountain', 'Tri-Mountain', 'tri mountain', 'tri-mountain', 'trimountain']);
        // A one-word query has nothing to re-spell, so it costs one request.
        assert.deepEqual(variants('Pebble'), ['Pebble']);
        assert.deepEqual(variants(''), []);
    });

    test('and the retry loop stops on a result, an error or three tries', () => {
        const at = ADMIN.indexOf('async function runOnlineCourseSearch');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function renderOnlineOutcome', at));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /courseQueryVariants\(query\)\.slice\(0, 3\)/,
            'the daily budget is not bounded');
        assert.match(fn, /if \(!payload \|\| payload\.status !== 'ok'\) break;/,
            'a broken proxy would be asked three times and say the same thing slower');
        assert.match(fn, /if \(\(payload\.courses \|\| \[\]\)\.length > 0\) break;/,
            'a course found first time still costs more than one request');
        // THE GOLFER'S OWN WORDS ARE WHAT THE PAGE REPORTS BACK, not the variant
        // that happened to work - "no courses found for tri-mountain" when they
        // typed "Tri Mountain" reads as a different search.
        assert.match(fn, /renderOnlineOutcome\(payload, query\)/);
    });
});

describe('3. AND IT DOES NOT RETURN COURSES NOBODY ASKED FOR', () => {

    // THE CONTROL. A looser matcher that over-returns is worse than a strict one
    // that misses: the golfer picks the wrong card and every handicap in the
    // round is computed off the wrong course rating.
    const DIRECTORY = ['Tri-Mountain Golf Course', 'Dobson Ranch', 'Pebble Beach Golf Links',
                       'Saint Andrews Links', 'Camas Meadows Golf Club', 'The Links at Moses Pointe',
                       'Rock & Roll GC', 'Legacy Golf Resort'];

    test('a query that names nothing finds nothing', () => {
        ['xyzzy', 'zzzz', 'qqq'].forEach(q =>
            DIRECTORY.forEach(n => assert.equal(matches(q, n), false, q + ' matched ' + n)));
    });

    test('and a real name does not drag the rest of the directory with it', () => {
        const hits = q => DIRECTORY.filter(n => matches(q, n));
        assert.deepEqual(hits('Tri Mountain'), ['Tri-Mountain Golf Course']);
        assert.deepEqual(hits('trimountain'), ['Tri-Mountain Golf Course']);
        assert.deepEqual(hits('Dobson'), ['Dobson Ranch']);
        assert.deepEqual(hits('pebble beach'), ['Pebble Beach Golf Links']);
        assert.deepEqual(hits('camas'), ['Camas Meadows Golf Club']);
        // AND A FILLER WORD RETURNS WHAT IT LITERALLY APPEARS IN, which is what it
        // did before this wave too. I wrote this assertion the other way round
        // first - "golf" returns nothing - and the test caught that it was a
        // claim about a matcher nobody has ever shipped: the SUBSTRING arm runs
        // before filler words are dropped, so "golf" has always matched every
        // name containing it. That is unchanged here, and it is harmless: the
        // list it returns is the directory a golfer is already looking at.
        // Four, not five: "Rock & Roll GC" does not contain the word, and GC is
        // filler on both sides rather than an alias for it.
        assert.deepEqual(hits('golf'),
            ['Tri-Mountain Golf Course', 'Pebble Beach Golf Links', 'Camas Meadows Golf Club',
             'Legacy Golf Resort']);
    });

    test('the joined arm needs five characters, or it would match most things', () => {
        // MEASURED ON THE ARM ITSELF, not on a short query generally: a two-letter
        // query still matches through the SUBSTRING arm, as it always has, so
        // asserting "ro finds nothing" would be a claim about the wrong rule - my
        // first version of this test did exactly that and was wrong.
        //
        // "trim" can only reach Tri-Mountain through the joined form: it is not a
        // substring of "tri mountain golf course" and no word starts with it. At
        // four characters the joined arm is not allowed to fire; at five it is.
        assert.equal(matches('trim', TRI), false, 'the joined arm fired below its length guard');
        // AND IT IS AN EXACT MATCH, not a substring: "trimount" is a prefix of
        // "trimountain" and must NOT match, because a substring joined arm
        // returned "Lake Spanaway" for the query "lakes" - caught by the
        // no-growth sweep in course_picker_match_test.js.
        assert.equal(matches('trimount', TRI), false, 'the joined arm matches a mere prefix');
        assert.equal(matches('trimountain', TRI), true, 'the joined arm does not fire on the whole name');
    });
});
