// ============================================================================
// TYPING MORE OF THE NAME YOU ARE SURE OF MUST NOT LOSE THE COURSE.
//
// admin.html's picker filters with
//
//     item.name.toLowerCase().includes(lowerFilter)
//
// a substring test on the WHOLE typed string. Every word a golfer adds can only
// narrow, never widen, so a course the directory calls "Camas Meadows Golf Club"
// is unfindable to anyone who types "Camas Meadows Golf Course".
//
// MEASURED ON ALL 141 REAL DIRECTORY ENTRIES, not a fixture:
//
//   59 of 141 (42%) end in one of Golf Club / Golf Course / Country Club /
//   Golf Links / Golf Resort. For those, 249 of 295 realistic confusions -
//   the golfer says the wrong one of the five - return NOTHING.
//
//   123 of 141 entries are findable by their distinctive words alone and LOST
//   the moment a suffix is added:
//       "camas meadows"              finds it
//       "camas meadows golf course"  does not
//
// This is the same defect as GolfCourseAPI's fuzzy match, in our own code, and
// it is worse here because there is no network to blame.
//
// ---------------------------------------------------------------------------
// THE FIX IS A UNION, AND THE UNION IS NOT DECORATION
// ---------------------------------------------------------------------------
//
// Stripping the suffix words and matching on the remaining tokens fixes all
// 1410 sign-name variants. STRIPPING ALONE IS A REGRESSION and this file exists
// partly to stop anyone shipping it:
//
//   a token-prefix matcher does not match INSIDE a word, and the substring test
//   does. 285 mid-word fragments that work today would stop working. "adows"
//   finds Camas Meadows today.
//
// So the rule is stripped-token OR today's substring - both halves, every time.
// Measured across all 141: sign-name failures 1185 -> 0, mid-token regressions
// 0, and mean results per SINGLE-WORD query 4.05 -> 4.05 with not one of them
// returning more than today. Multi-word queries DO return more, and that is the
// fix: twenty core phrases go from finding nothing to finding exactly their own
// course. See the note in R3 - an earlier version of this header claimed "not
// one query" without the single-word qualifier, which was an over-claim.
//
// Each half is proved load-bearing below by running the requirements against a
// matcher with that half removed, so neither can be dropped quietly later.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

// ---------------------------------------------------------------------------
// THE REAL DIRECTORY, READ FROM course-data.js. Not a fixture: the numbers
// pinned in this file were measured against these exact 141 names, and a
// fixture would let the directory drift away from what was measured.
// ---------------------------------------------------------------------------
function directoryNames() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'course-data.js'), 'utf8');
    return [...src.matchAll(/\{ id: "([^"]+)", name: "([^"]+)"/g)].map((m) => m[2]);
}
const NAMES = directoryNames();

// TODAY'S RULE, written out so "no worse than today" is measured against the
// real thing rather than against a remembered number.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();
const todayMatch = (q, n) => norm(n).includes(norm(q));

const SUFFIX_WORDS = ['golf', 'club', 'course', 'courses', 'resort', 'links',
                      'country', 'national', 'gc', 'cc', 'the', 'at', 'and'];

// The five endings a golfer actually confuses. Nobody types "Camas Meadows
// Resort" for a Golf Club; plenty say Course when the sign says Club.
const CONFUSABLE = ['golf club', 'golf course', 'country club', 'golf links', 'golf resort', 'golf'];
// The full variant set the 1410 figure was measured over.
const VARIANTS = ['golf club', 'golf course', 'golf resort', 'golf links', 'country club',
                  'golf', 'club', 'course', 'resort', ''];

const tokensOf = (s) => norm(s).split(' ').filter(Boolean);
const coreOf = (s) => tokensOf(s).filter((t) => !SUFFIX_WORDS.includes(t));

// ---------------------------------------------------------------------------
// THE PAGE'S OWN MATCHER. Loaded from admin.html's inline script, not
// reimplemented here - a test that reimplements the rule proves the test.
// ---------------------------------------------------------------------------
// CPM_PICKER_PAGE lets a negative control point this file at a TEMP COPY of
// admin.html carrying a reference implementation, so the requirements below can
// be shown SATISFIABLE without editing the real page to find out. A guard that
// no implementation can satisfy is red forever and proves nothing. Unset in
// normal use.
const PICKER_PAGE = process.env.CPM_PICKER_PAGE || 'admin.html';
let PAGE = null;
let loadError = null;
try {
    PAGE = loadHtmlInlineScript(PICKER_PAGE, [], { only: false });
} catch (e) {
    loadError = e;
}
const pageMatch = (q, n) => {
    if (!PAGE || typeof PAGE.courseNameMatches !== 'function') {
        throw new Error('admin.html does not export courseNameMatches');
    }
    return PAGE.courseNameMatches(q, n);
};

// ---------------------------------------------------------------------------
// THE TWO HALVES, IMPLEMENTED HERE ONLY SO EACH CAN BE PROVED NECESSARY.
// These are controls. They are never the thing under test.
// ---------------------------------------------------------------------------
function strippedHalf(q, n) {
    const qt = coreOf(q);
    const ct = tokensOf(n);
    if (qt.length === 0) return false;
    return qt.every((x) => ct.some((c) => c.startsWith(x)));
}
const substringHalf = todayMatch;

describe('THE PAGE EXPOSES ONE MATCHER, AND BOTH FILTERS USE IT', () => {

    test('admin.html defines courseNameMatches', () => {
        assert.equal(loadError, null, 'admin.html inline script failed to load: ' + loadError);
        assert.equal(typeof (PAGE || {}).courseNameMatches, 'function',
            'admin.html must expose courseNameMatches(query, name). The picker filters with an '
            + 'inline arrow today, which cannot be tested and is duplicated across the '
            + 'directory filter and the global_courses filter.');
    });

    // COMMENTS ARE NOT CALL SITES. admin.html's own comment above the matcher
    // quotes the old inline filter verbatim - "This used to be
    // item.name.toLowerCase().includes(lowerFilter) inline" - and this test's
    // own message names it too. Scanning raw source matched both and reported a
    // defect in a correctly fixed page. CLAUDE.md records the same trap from the
    // trip money wave, where quoting the historical lie tripped the guard against
    // it. LINE COMMENTS FIRST, for the reason recorded there.
    function stripComments(src) {
        return String(src)
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
            .replace(/\/\*[\s\S]*?\*\//g, ' ');
    }

    test('BOTH filter sites route through it - two entry points, one builder', () => {
        const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, PICKER_PAGE), 'utf8'));
        // The directory filter and the global_courses filter are the same rule
        // applied twice. CLAUDE.md's standing lesson: a hand-written copy in each
        // is how one gets fixed and the other does not.
        const offenders = (src.match(/^.*\.name\.toLowerCase\(\)\.includes\(lowerFilter\).*$/gm) || [])
            .map((l) => l.trim());
        assert.deepEqual(offenders, [],
            'a filter still decides the match rule for itself instead of calling '
            + 'courseNameMatches. Both the directory list and the community list must ask the '
            + 'same function, or a golfer gets different answers from the two halves of one '
            + 'dropdown.\n  ' + offenders.join('\n  '));
    });
});

describe('R1 - EVERY SIGN-NAME VARIANT FINDS ITS COURSE', () => {

    test('the corpus is the real directory and is not empty', () => {
        // ANTI-VACUITY. Every assertion below is "for each of these names...",
        // and each of them is true of an empty list.
        assert.ok(NAMES.length >= 130,
            `only ${NAMES.length} directory names were parsed out of course-data.js; the `
            + 'numbers pinned in this file were measured over 141.');
        assert.ok(NAMES.includes('Camas Meadows Golf Club'),
            'the entry every example in this file is written around is gone from the directory');
    });

    test('all 1410 variants are found', () => {
        let trials = 0;
        const missed = [];
        NAMES.forEach((name) => {
            const c = coreOf(name);
            if (c.length === 0) return;
            VARIANTS.forEach((v) => {
                const typed = (c.join(' ') + ' ' + v).trim();
                trials++;
                if (!pageMatch(typed, name)) missed.push(typed + ' -> ' + name);
            });
        });
        assert.equal(trials, 1410,
            `expected 1410 trials over the measured directory, got ${trials}. The directory `
            + 'changed since these numbers were measured; re-measure before trusting them.');
        assert.deepEqual(missed.slice(0, 12), [],
            `${missed.length} of ${trials} sign-name variants do not find their own course. `
            + 'Today that number is 1185.');
    });

    test('the realistic confusion specifically - the wrong one of the five', () => {
        const missed = [];
        NAMES.forEach((name) => {
            const n = norm(name);
            const has = CONFUSABLE.filter((p) => n.endsWith(p));
            if (!has.length) return;
            const actual = has.sort((a, b) => b.length - a.length)[0];
            const stem = n.slice(0, n.length - actual.length).trim();
            if (!stem) return;
            CONFUSABLE.forEach((alt) => {
                if (alt === actual) return;
                if (!pageMatch(stem + ' ' + alt, name)) missed.push(stem + ' ' + alt + ' -> ' + name);
            });
        });
        assert.deepEqual(missed.slice(0, 10), [],
            `${missed.length} of 295 realistic confusions still fail. Today 249 do.`);
    });

    test('adding a suffix never loses a course the core words found', () => {
        // The perverse half of the defect: typing MORE of the name you are sure
        // of makes the course disappear. 123 of 141 entries do this today.
        const worse = [];
        NAMES.forEach((name) => {
            const short = coreOf(name).join(' ');
            if (!short || !pageMatch(short, name)) return;
            ['golf club', 'golf course', 'golf resort', 'country club'].forEach((v) => {
                if (!pageMatch(short + ' ' + v, name)) worse.push(short + ' + ' + v + ' -> ' + name);
            });
        });
        assert.deepEqual(worse.slice(0, 10), [],
            `${worse.length} entries are lost when a suffix is added to words that already `
            + 'found them. Today that is 123 of 141.');
    });
});

describe('R2 - MID-TOKEN FRAGMENTS STILL WORK (the regression stripping alone introduces)', () => {

    test('"adows" still finds Camas Meadows Golf Club', () => {
        assert.ok(pageMatch('adows', 'Camas Meadows Golf Club'),
            'a mid-word fragment stopped matching. This is what a token-prefix matcher does '
            + 'on its own, and it is the reason the rule is a UNION rather than a replacement.');
    });

    test('every mid-token fragment that works today still works', () => {
        const broken = [];
        let checked = 0;
        NAMES.forEach((name) => {
            tokensOf(name).forEach((tk) => {
                if (tk.length < 5) return;
                const frag = tk.slice(2);
                if (!todayMatch(frag, name)) return;
                checked++;
                if (!pageMatch(frag, name)) broken.push(frag + ' -> ' + name);
            });
        });
        assert.ok(checked >= 200,
            `only ${checked} mid-token fragments were exercised; 285 were measured. This `
            + 'assertion is running on too little to mean anything.');
        assert.deepEqual(broken.slice(0, 10), [],
            `${broken.length} of ${checked} mid-token fragments regressed.`);
    });
});

describe('R3 - SINGLE-WORD QUERIES RETURN EXACTLY WHAT THEY DO TODAY', () => {

    const countToday = (q) => NAMES.filter((n) => todayMatch(q, n)).length;
    const countNew = (q) => NAMES.filter((n) => pageMatch(q, n)).length;

    // The exact counts measured. Pinned as numbers so a future widening of the
    // strip list shows up as a diff rather than as a vague "feels noisier".
    const PINNED = { Pine: 3, Camas: 1, Meadow: 2, Oak: 3, Glen: 4, River: 9,
                     Eagle: 4, Willow: 2, Chambers: 1 };

    Object.keys(PINNED).forEach((q) => {
        test(`"${q}" returns exactly ${PINNED[q]}, as today`, () => {
            assert.equal(countToday(q), PINNED[q],
                `today's count for "${q}" is no longer ${PINNED[q]} - the directory changed and `
                + 'this pin is stale');
            assert.equal(countNew(q), PINNED[q],
                `"${q}" now returns ${countNew(q)} results where today it returns ${PINNED[q]}. `
                + 'The picker got noisier.');
        });
    });

    // WHAT I CLAIMED AND WHAT IS ACTUALLY TRUE.
    //
    // The measurement behind this wave reported "not one query returns more
    // results than today". That was measured over SINGLE distinctive words, and
    // it holds for those - the nine pins above are exact. It does NOT generalise
    // to multi-word queries, and saying so without the qualifier was an
    // over-claim on my part.
    //
    // Multi-word queries DO return more, and that is the fix working:
    //   "tahoma valley yelm"   0 -> 1   Tahoma Valley Golf Course (Yelm)
    //   "stone creek oregon city" 0 -> 1   Stone Creek Golf Club (Oregon City)
    // Twenty core phrases go from finding NOTHING to finding exactly their own
    // course. Asserting "nothing grows" would forbid the feature.
    //
    // Broadening also happens and is intended: "mountain golf" finds 1 today and
    // 6 under the union, because 'golf' is dropped and 'mountain' is what the
    // golfer actually typed. A golfer searching "mountain golf" wants the
    // mountain courses.
    //
    // So the honest invariants are: single-word counts are unchanged (pinned
    // above), and every multi-word query still finds the course it came from.
    test('every multi-word query still finds its own course', () => {
        const lost = [];
        NAMES.forEach((name) => {
            const phrase = coreOf(name).join(' ');
            if (!phrase || phrase.indexOf(' ') === -1) return;
            if (!pageMatch(phrase, name)) lost.push(phrase + ' -> ' + name);
        });
        assert.deepEqual(lost.slice(0, 10), [],
            `${lost.length} multi-word core phrases no longer find the course they came from.`);
    });

    test('across every distinctive word in the directory, nothing grows', () => {
        const grew = [];
        NAMES.forEach((name) => {
            coreOf(name).forEach((q) => {
                const t = countToday(q), n = countNew(q);
                if (n > t) grew.push(`"${q}" ${t} -> ${n}`);
            });
        });
        assert.deepEqual([...new Set(grew)].slice(0, 10), [],
            'queries returning more results than today. Measured: zero.');
    });
});

describe('R4 - INCREMENTAL TYPING NEVER LOSES A COURSE', () => {

    test('every prefix of every real name still finds it', () => {
        const lost = [];
        let checked = 0;
        NAMES.forEach((name) => {
            const full = norm(name);
            for (let i = 1; i <= full.length; i++) {
                const q = full.slice(0, i).trim();
                if (!q) continue;
                checked++;
                if (!pageMatch(q, name)) lost.push(q + ' -> ' + name);
            }
        });
        assert.ok(checked >= 2500, `only ${checked} prefixes exercised; 2977 were measured`);
        assert.deepEqual(lost.slice(0, 10), [],
            `${lost.length} of ${checked} prefixes lost their course mid-typing.`);
    });
});

describe('EACH HALF IS LOAD-BEARING - PROVED, NOT ASSERTED', () => {

    // A union whose halves are never shown to be individually necessary is two
    // things nobody can justify removing and one nobody can justify keeping.

    test('WITHOUT the substring half, mid-token fragments die', () => {
        assert.ok(!strippedHalf('adows', 'Camas Meadows Golf Club'),
            'the stripped half alone was expected to FAIL on a mid-word fragment. If it now '
            + 'passes, the substring half is no longer load-bearing and this union is '
            + 'carrying a component nothing needs.');
        let broken = 0;
        NAMES.forEach((name) => tokensOf(name).forEach((tk) => {
            if (tk.length < 5) return;
            const frag = tk.slice(2);
            if (todayMatch(frag, name) && !strippedHalf(frag, name)) broken++;
        }));
        assert.ok(broken >= 200,
            `dropping the substring half was measured to break 285 mid-token fragments; this `
            + `run found ${broken}. Too few for the control to be demonstrating anything.`);
    });

    test('WITHOUT the stripped half, sign names die', () => {
        let missed = 0, trials = 0;
        NAMES.forEach((name) => {
            const c = coreOf(name);
            if (!c.length) return;
            VARIANTS.forEach((v) => {
                trials++;
                if (!substringHalf((c.join(' ') + ' ' + v).trim(), name)) missed++;
            });
        });
        assert.ok(missed >= 1000,
            `dropping the stripped half was measured to lose 1185 of 1410 sign-name variants; `
            + `this run found ${missed} of ${trials}.`);
    });
});

describe('THE STRIP LIST IS NOT OVER-EAGER', () => {

    // Manny's control, and the one that could have sunk the design: a course
    // genuinely called "The National" or "Links" would have its distinctive word
    // eaten by the strip list.

    test('no real directory entry is reduced to nothing', () => {
        const emptied = NAMES.filter((n) => coreOf(n).length === 0);
        assert.deepEqual(emptied, [],
            'these course names consist entirely of suffix words, so stripping removes the '
            + 'whole query and the golfer can never search for them by name.');
    });

    test('the words most likely to be part of a real name are checked by name', () => {
        // 'national' and 'links' appear mid-name in this directory, and 'country'
        // is always part of "Country Club". Each must still leave something.
        [['Meriwether National Golf Club', 'meriwether'],
         ['Orchard Hills Country Club', 'orchard hills'],
         ['The Club at Emerald Hills', 'emerald hills']].forEach(([name, expectCore]) => {
            assert.ok(NAMES.includes(name), `${name} is no longer in the directory`);
            assert.equal(coreOf(name).join(' '), expectCore,
                `stripping "${name}" left "${coreOf(name).join(' ')}", expected "${expectCore}"`);
            assert.ok(pageMatch(name, name), `${name} no longer matches its own full name`);
        });
    });

    test('no strip word is the LEADING token of a real course name', () => {
        // The most dangerous way to be over-eager: a course whose name STARTS
        // with a strip word leads with something the stripped half throws away.
        // This is a structural check on the LIST against the corpus, and it is
        // deliberately not a behavioural one - see the note below for why a
        // behavioural check cannot work here.
        const leading = {};
        NAMES.forEach((n) => {
            const first = tokensOf(n)[0];
            if (SUFFIX_WORDS.includes(first)) (leading[first] = leading[first] || []).push(n);
        });
        // 'the' is on the list and legitimately leads several names; that is
        // exactly what the empty-query fallback exists for, so it is exempt.
        delete leading.the;
        assert.deepEqual(Object.keys(leading), [],
            'these strip words lead a real course name, so the stripped half discards the '
            + 'first thing a golfer types: ' + JSON.stringify(leading));
    });

    test('MANNY\'S CONTROL IS INERT ON THIS DIRECTORY, AND THAT IS THE FINDING', () => {
        // Asked to prove an over-eager strip list would be caught, I added three
        // real distinctive words - meadows, pine, creek - to the list and ran
        // everything. It was 24 of 24 GREEN and the cold check PASSED.
        //
        // MEASURED, comparing the correct list against the over-eager one:
        //   entries reduced to nothing          0  vs  0
        //   core-phrase queries pulling in a
        //     course other than their own       0  vs  0
        //   two-word slices doing the same     40  vs 41
        //   worst-case result count           124  vs 124   (both on "o")
        //
        // The reason is structural: the union's substring half still finds the
        // right course, and widening the stripped half only collides if some
        // OTHER name shares what is left. On these 141 names it essentially
        // never does.
        //
        // So there is no behavioural assertion to write. CLAUDE.md: a control
        // that mutates something genuinely harmless SHOULD be inert, and the
        // honest move is to say so rather than invent an assertion to make it
        // look caught.
        //
        // What guards the list instead: the leading-token check above, the
        // reduced-to-nothing check, the synthetic fallback below, and the fact
        // that the list is pinned here by content - adding a word is a visible
        // diff someone has to justify.
        assert.deepEqual(SUFFIX_WORDS, ['golf', 'club', 'course', 'courses', 'resort', 'links',
                                        'country', 'national', 'gc', 'cc', 'the', 'at', 'and'],
            'the strip list changed. It is pinned by content because no behavioural test on '
            + 'this directory can detect an over-eager entry - adding a word has to be argued '
            + 'for, not measured after the fact.');
        const src = fs.readFileSync(path.join(REPO_ROOT, PICKER_PAGE), 'utf8');
        const m = /COURSE_SUFFIX_WORDS\s*=\s*\[([^\]]*)\]/.exec(src);
        assert.ok(m, 'COURSE_SUFFIX_WORDS is not declared in ' + PICKER_PAGE);
        const pageList = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
        assert.deepEqual(pageList, SUFFIX_WORDS,
            'the page\'s strip list and this test\'s have drifted apart, so every assertion '
            + 'in this file is measuring a different rule than the page applies.');
    });

    test('AND A NAME MADE ONLY OF SUFFIX WORDS STILL WORKS - the hypothetical', () => {
        // No entry in today's 141 is like this, so the real corpus cannot prove
        // the mechanism degrades gracefully. These are synthetic on purpose, and
        // labelled as such: they are the courses that would break the design if
        // the union did not fall back.
        assert.ok(pageMatch('The National', 'The National'),
            'a course named entirely from the strip list cannot be found by its own name. The '
            + 'union must fall back to substring when stripping leaves nothing.');
        assert.ok(pageMatch('national', 'The National'));
        assert.ok(pageMatch('links', 'The Links'));
    });
});
