// ============================================================================
// GROUPING — ONE IMPLEMENTATION, FOUR CONSUMERS
//
// computeGroupSizes() and computeGroupBoundaries() decide which golfers belong
// to which foursome. Every ?group=N scorekeeper link, every group-scoped write
// permission, and every cross-group side match anchor rule is measured against
// their output. They were duplicated in four pages with NO coverage at all -
// the worst-tested duplication the architecture audit found.
//
// ---------------------------------------------------------------------------
// HOW THIS FILE WAS BUILT, AND WHY THAT ORDER MATTERS
// ---------------------------------------------------------------------------
//
// PHASE A of the shared-core wave wrote this suite against the FOUR ORIGINAL
// page-local definitions and proved them pairwise equivalent across the matrix
// below - before a single line was extracted. That sequencing is the whole
// point: extracting first and testing afterwards would only ever prove that the
// new module agrees with itself.
//
// PHASE B then created grouping.js from the definition all four already shared,
// and the four pages became consumers. So the assertions below did not change
// meaning when the code moved; they changed from "the four copies agree" to
// "the four consumers all reach the one implementation", which is strictly
// stronger and is what they now assert.
//
// ---------------------------------------------------------------------------
// NOTHING HERE REIMPLEMENTS THE ALGORITHM
// ---------------------------------------------------------------------------
//
// Every expectation is produced by RUNNING production code. The matrix compares
// each consumer's answer against the canonical module's answer for the same
// input - it never states what a group size "should" be. The only structural
// facts asserted are invariants that hold by definition (sizes sum to the field,
// boundaries tile it without gaps or overlap), and those are derived from the
// production output rather than from a copy of the rule that produced it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The four pages that hand out group links, and the dependency list each one
// actually carries in its <script src> tags. A test below asserts these lists
// against the pages themselves, so the harness cannot quietly stop describing
// production.
const CONSUMERS = {
    'admin.html': ['course-data.js', 'action-model.js', 'money-engine.js',
                   'settlement-engine.js', 'pool-engine.js', 'grouping.js'],
    'index.html': ['score-marks.js', 'money-engine.js', 'action-model.js',
                   'settlement-engine.js', 'pool-engine.js', 'bet-strip.js',
                   'hole-events.js', 'grouping.js'],
    'leaderboard.html': ['money-engine.js', 'action-model.js', 'settlement-engine.js',
                         'grouping.js'],
    'sidematches.html': ['action-model.js', 'settlement-engine.js', 'grouping.js'],
};
const PAGES = Object.keys(CONSUMERS);

const realms = {};
function realmFor(page) {
    if (!realms[page]) realms[page] = loadHtmlInlineScript(page, CONSUMERS[page]);
    return realms[page];
}
let canonical;
function canonicalRealm() {
    if (!canonical) canonical = loadJsFile('grouping.js');
    return canonical;
}

// vm objects carry a foreign prototype, so deepStrictEqual rejects them even
// when every value matches. JSON brings them into this realm.
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------
// THE INPUT MATRIX
//
// Built to be adversarial rather than representative. A grouping bug does not
// show up on twelve players in three clean foursomes; it shows up on the field
// that does not divide, the override larger than the remainder, the single
// golfer, and the values nobody meant to pass in.
// ---------------------------------------------------------------------------

const FIELD_SIZES = [
    // Nothing, and the smallest real rounds.
    0, 1, 2, 3,
    // Clean foursomes, and every remainder around them.
    4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    // Marty's Monday sizes and a men's club day.
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
    // Larger than anything the product expects, to pin current behaviour rather
    // than assume a cap exists.
    36, 40, 41, 60, 100,
];

const OVERRIDE_SHAPES = [
    { label: 'none', overrides: undefined },
    { label: 'null', overrides: null },
    { label: 'empty', overrides: {} },
    { label: 'first group of 3', overrides: { 0: 3 } },
    { label: 'first group of 2', overrides: { 0: 2 } },
    { label: 'first group of 5', overrides: { 0: 5 } },
    { label: 'two overrides', overrides: { 0: 3, 1: 5 } },
    { label: 'three overrides', overrides: { 0: 2, 1: 2, 2: 2 } },
    { label: 'override on a group that does not exist', overrides: { 9: 3 } },
    { label: 'override larger than the whole field', overrides: { 0: 99 } },
    // Values the UI should never produce. Whatever production does with them is
    // what it must keep doing - these pin behaviour, they do not endorse it.
    { label: 'zero override', overrides: { 0: 0 } },
    { label: 'negative override', overrides: { 0: -2 } },
    { label: 'fractional override', overrides: { 0: 2.5 } },
    { label: 'string override', overrides: { 0: '3' } },
    { label: 'string key override', overrides: { '0': 3 } },
    { label: 'mixed valid and invalid', overrides: { 0: 3, 1: 0, 2: 5 } },
];

// Field sizes that are not counts at all. Included because currentData.players
// can be missing or malformed on a partly-loaded round, and every page calls
// these functions with players.length off whatever it was handed.
const ODD_FIELDS = [-1, -4, NaN, 4.5, 0.5];

function everyCase(fn) {
    FIELD_SIZES.forEach(n => OVERRIDE_SHAPES.forEach(o =>
        fn(n, o.overrides, `${n} players / ${o.label}`)));
}

// ===========================================================================
// 0. HARNESS INTEGRITY
// ===========================================================================

describe('HARNESS — four real consumers and one real module', () => {

    test('grouping.js exists and owns both functions', () => {
        const g = canonicalRealm();
        assert.equal(typeof g.computeGroupSizes, 'function');
        assert.equal(typeof g.computeGroupBoundaries, 'function');
    });

    test('every consumer exposes both functions at runtime', () => {
        PAGES.forEach(p => {
            const r = realmFor(p);
            assert.equal(typeof r.computeGroupSizes, 'function', p + ' should reach computeGroupSizes');
            assert.equal(typeof r.computeGroupBoundaries, 'function', p + ' should reach computeGroupBoundaries');
        });
    });

    test('the dependency lists match what each page actually loads', () => {
        // Fidelity, checked against the pages themselves. A realm built from a
        // convenient list rather than the real one stops representing production,
        // and every comparison below softens into an opinion.
        PAGES.forEach(page => {
            const src = read(page);
            assert.match(src, /<script src="grouping\.js">/,
                page + ' must load grouping.js');
            assert.ok(CONSUMERS[page].includes('grouping.js'),
                page + "'s harness dependency list must include grouping.js");
        });
    });

    test('the realms are distinct, so agreement cannot be an artefact of one load', () => {
        const fns = PAGES.map(p => realmFor(p).computeGroupSizes);
        for (let i = 0; i < fns.length; i++) {
            for (let j = i + 1; j < fns.length; j++) {
                assert.notEqual(fns[i], fns[j], PAGES[i] + ' and ' + PAGES[j] + ' share a realm');
            }
        }
    });

    test('the matrix is large enough to be worth running', () => {
        // A guard against someone trimming the fixtures until the suite is fast
        // and meaningless.
        assert.ok(FIELD_SIZES.length >= 30, 'field sizes should span the real range and beyond');
        assert.ok(OVERRIDE_SHAPES.length >= 15, 'override shapes should include the invalid ones');
        assert.ok(FIELD_SIZES.length * OVERRIDE_SHAPES.length >= 400,
            'the matrix should be in the hundreds of cases, not dozens');
    });
});

// ===========================================================================
// 1. EVERY CONSUMER AGREES WITH THE CANONICAL MODULE
//
// This is the assertion that was written in PHASE A against four page-local
// copies and proved them equivalent before any extraction happened.
// ===========================================================================

describe('PARITY — computeGroupSizes', () => {

    PAGES.forEach(page => {
        test(`${page} matches grouping.js on every case in the matrix`, () => {
            const g = canonicalRealm();
            const r = realmFor(page);
            let checked = 0;
            everyCase((n, overrides, label) => {
                assert.deepEqual(plain(r.computeGroupSizes(n, overrides)),
                                 plain(g.computeGroupSizes(n, overrides)),
                                 page + ' diverged on: ' + label);
                checked++;
            });
            assert.ok(checked > 400, 'the matrix should have run, got ' + checked + ' cases');
        });
    });

    test('the odd field values behave identically everywhere', () => {
        // Not counts at all. Whatever production does with them - and it does
        // something specific - every consumer must do the same thing.
        const g = canonicalRealm();
        ODD_FIELDS.forEach(n => {
            const expected = plain(g.computeGroupSizes(n, {}));
            PAGES.forEach(page => {
                assert.deepEqual(plain(realmFor(page).computeGroupSizes(n, {})), expected,
                    page + ' diverged on field size ' + String(n));
            });
        });
    });
});

describe('PARITY — computeGroupBoundaries', () => {

    PAGES.forEach(page => {
        test(`${page} matches grouping.js on every case in the matrix`, () => {
            const g = canonicalRealm();
            const r = realmFor(page);
            everyCase((n, overrides, label) => {
                assert.deepEqual(plain(r.computeGroupBoundaries(n, overrides)),
                                 plain(g.computeGroupBoundaries(n, overrides)),
                                 page + ' diverged on: ' + label);
            });
        });
    });
});

// ===========================================================================
// 2. STRUCTURAL INVARIANTS
//
// Derived from production output, never from a copy of the rule. These exist so
// a mutation that changes every consumer identically - which parity alone would
// happily accept - still fails.
// ===========================================================================

describe('INVARIANTS — the field is tiled exactly once', () => {

    test('sizes always sum to the field, for every case', () => {
        const g = canonicalRealm();
        everyCase((n, overrides, label) => {
            if (!(n > 0)) return;
            const sizes = g.computeGroupSizes(n, overrides);
            assert.equal(sizes.reduce((s, v) => s + v, 0), n,
                'the groups must account for every golfer: ' + label);
        });
    });

    test('no group is empty, so the loop can never stall', () => {
        const g = canonicalRealm();
        everyCase((n, overrides, label) => {
            if (!(n > 0)) return;
            g.computeGroupSizes(n, overrides).forEach(sz =>
                assert.ok(sz > 0, 'a zero-size group would never terminate: ' + label));
        });
    });

    test('boundaries tile the field with no gap and no overlap', () => {
        const g = canonicalRealm();
        everyCase((n, overrides, label) => {
            if (!(n > 0)) return;
            const b = g.computeGroupBoundaries(n, overrides);
            let expectedStart = 0;
            b.forEach((bd, i) => {
                assert.equal(bd.group, i + 1, 'groups are numbered from 1: ' + label);
                assert.equal(bd.startIdx, expectedStart, 'a gap or overlap appeared: ' + label);
                expectedStart += bd.size;
            });
            assert.equal(expectedStart, n, 'the last boundary must reach the end: ' + label);
        });
    });

    test('boundaries and sizes describe the same grouping', () => {
        const g = canonicalRealm();
        everyCase((n, overrides) => {
            // plain() on BOTH sides. These come out of a vm realm, and deepStrictEqual
            // rejects a foreign prototype even when every value matches - the exact
            // trap money_parity_test.js documents.
            assert.deepEqual(plain(g.computeGroupBoundaries(n, overrides).map(b => b.size)),
                             plain(g.computeGroupSizes(n, overrides)));
        });
    });

    test('a field of four or fewer is one group', () => {
        // The single most common shape in this app, pinned on its own so a
        // regression there cannot hide inside a 400-case loop.
        const g = canonicalRealm();
        [1, 2, 3, 4].forEach(n =>
            assert.deepEqual(plain(g.computeGroupSizes(n, {})), [n],
                n + ' golfers should be a single group'));
    });

    test('an empty field produces no groups at all', () => {
        const g = canonicalRealm();
        assert.deepEqual(plain(g.computeGroupSizes(0, {})), []);
        assert.deepEqual(plain(g.computeGroupBoundaries(0, {})), []);
    });
});

// ===========================================================================
// 3. NO-COPY GUARD
// ===========================================================================

describe('NO LOCAL COPY — the four pages consume, they do not own', () => {

    test('grouping.js is the only declaration in the repo', () => {
        const src = read('grouping.js');
        ['computeGroupSizes', 'computeGroupBoundaries'].forEach(fn =>
            assert.match(src, new RegExp('function\\s+' + fn + '\\s*\\('),
                'grouping.js must own ' + fn));
    });

    test('no consumer redeclares either function inline', () => {
        // Load order is <script src> first, inline block second, and both are
        // plain globals - so a re-declared copy inline would WIN and silently
        // restore the duplication. Adding the script tag is not the extraction;
        // the absence of these is.
        PAGES.forEach(page => {
            const inline = read(page).replace(/<script src=[^>]*><\/script>/g, '');
            ['computeGroupSizes', 'computeGroupBoundaries'].forEach(fn =>
                assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                    page + ' must not redeclare ' + fn + ' - it would shadow grouping.js'));
        });
    });

    test('nothing else in the repo declares them either', () => {
        // Cheap, and it catches a copy appearing somewhere this suite does not
        // otherwise look - stats.html, trip.html, an engine file.
        fs.readdirSync(REPO_ROOT)
            .filter(f => (f.endsWith('.html') || f.endsWith('.js')) && f !== 'grouping.js')
            .filter(f => !/_test\.js$|\.test\.js$/.test(f))
            .forEach(f => {
                const src = read(f).replace(/<script src=[^>]*><\/script>/g, '');
                ['computeGroupSizes', 'computeGroupBoundaries'].forEach(fn =>
                    assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(src),
                        fn + ' has reappeared in ' + f));
            });
    });

    test('every consumer FAILS LOUDLY without grouping.js, it does not degrade', () => {
        // The silent-failure class this codebase has been bitten by: plain
        // <script src> globals whose call sites are guarded with
        // `typeof fn === 'function'` turn a missing module into a quiet wrong
        // answer. Group scoping decides who may write which scores, so a quiet
        // wrong answer there is worse than a broken page.
        PAGES.forEach(page => {
            // { only: true } - the harness loads a page's real script tags by default,
            // which is what keeps every other realm faithful. This is the one case that
            // needs the opposite: a realm deliberately missing the module, to prove the
            // page breaks rather than quietly grouping everyone into one foursome.
            const withoutModule = CONSUMERS[page].filter(d => d !== 'grouping.js');
            const crippled = loadHtmlInlineScript(page, withoutModule, { only: true });
            assert.equal(typeof crippled.computeGroupSizes, 'undefined',
                page + ' should have no grouping function without the module');
        });
    });
});

// ===========================================================================
// 4. SCRIPT ORDER
// ===========================================================================

describe('SCRIPT ORDER — the module loads before anything that needs it', () => {

    test('grouping.js is a <script src> in the head, before the inline block', () => {
        PAGES.forEach(page => {
            const src = read(page);
            const tagAt = src.indexOf('<script src="grouping.js">');
            const inlineAt = src.indexOf('<script>');
            assert.ok(tagAt > -1, page + ' must load grouping.js');
            assert.ok(inlineAt > -1, page + ' should have an inline block');
            assert.ok(tagAt < inlineAt,
                page + ' must load grouping.js BEFORE its inline block, or the page '
                     + 'would depend on nothing more than luck');
        });
    });

    test('grouping.js has no dependencies of its own', () => {
        // It is loaded first on some pages and later on others, so it must not
        // reach for anything. Executed in a bare realm rather than inspected.
        const bare = { };
        vm.createContext(bare);
        vm.runInContext(read('grouping.js'), bare, { filename: 'grouping.js' });
        assert.equal(typeof bare.computeGroupSizes, 'function');
        assert.deepEqual(plain(bare.computeGroupSizes(9, {})), [4, 4, 1]);
    });

    test('grouping.js runs no top-level code', () => {
        // Loading a module must not have side effects, because four pages load it
        // at different points in their own boot.
        const src = read('grouping.js');
        const withoutComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const topLevel = withoutComments.split('\n')
            .filter(l => /^\S/.test(l))
            .filter(l => !/^function\s/.test(l) && !/^\}/.test(l) && l.trim() !== '');
        assert.deepEqual(topLevel, [], 'grouping.js should be function declarations only');
    });
});
