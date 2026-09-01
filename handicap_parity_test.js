// ============================================================================
// HANDICAP — ONE DEFINITION, ONE OWNER
//
// handicap.js is the single canonical owner of the seven handicap functions.
// Nothing else in the repo declares them.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE USED TO BE
// ---------------------------------------------------------------------------
//
// Scaffolding. money-engine.js and five pages each carried their own copy, and
// removing them all in one commit was measured - on a disposable tree - at forty
// broken test files and 814KB of replacements. This project edits code by pasting
// whole files into a browser, so the migration was staged instead, and this file
// guarded the temporary duplication at every step:
//
//   1. handicap.js created, proved identical, loaded by nothing.
//   2. Eight pages moved onto it; admin.html's two aliases deleted.
//   3. Test realms adopted it, in four reviewable groups.
//   4. money-engine.js shed the family. THIS STEP.
//
// Every stage was green before the next began, and the migration-state assertions
// were rewritten at each transition rather than deleted - so the coverage never
// lapsed and the file always described where the migration actually stood.
//
// ---------------------------------------------------------------------------
// WHAT IT IS NOW
// ---------------------------------------------------------------------------
//
// The end-state guard. There is no duplicate left to compare, so the assertions
// changed from "the copies agree" to "there is exactly one copy, everything
// reaches it, and nothing can grow another". A parity suite for a duplicate that
// no longer exists proves nothing; a silently passing suite is worse than none.
//
// Nothing here reimplements a handicap rule. Every expected value is either
// measured from handicap.js itself or is a contract worth stating in one place -
// a plus handicap is negative, scramble is not a relative format, the baseline is
// the lowest golfer in the match.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const FAMILY = [
    'parseHcp',
    'getStrokes',
    'allocateMatchStrokes',
    'matchHandicapBaseline',
    'matchRelativeHandicaps',
    'relativeMatchStrokes',
    'isRelativeMatchFormat',
];

// Every place a definition of this family currently lives. admin.html is listed
// under the alias names it actually uses; the aliases are byte-identical to
// canonical and are removed in step 2.
// One owner. The list survives as a list because a second entry appearing here
// is exactly the change that must be deliberate.
const OWNERS = { 'handicap.js': FAMILY };

// Everything that CONSUMES the family without declaring it.
const CONSUMER_MODULES = ['money-engine.js', 'settlement-engine.js'];

// Every page that loads handicap.js and must own no copy of its own.
const MIGRATED_PAGES = ['admin.html', 'index.html', 'leaderboard.html',
                        'settlement.html', 'sidematches.html', 'skins.html',
                        'stats.html', 'trip.html'];

function bareRealm(file) {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    vm.runInContext(read(file), sb, { filename: file });
    return sb;
}

const realms = {};
function realmFor(file) {
    if (!realms[file]) {
        realms[file] = file.endsWith('.html') ? loadHtmlInlineScript(file) : bareRealm(file);
    }
    return realms[file];
}

// admin.html's aliases are gone, so every owner now uses the canonical names.
const fnIn = (file, name) => realmFor(file)[name];

const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const norm = (fn) => fn.toString().replace(/\s+/g, ' ').replace(/^function \w+/, 'function _');

// ---------------------------------------------------------------------------
// THE INPUT MATRIX
//
// Adversarial rather than representative. A handicap bug does not show up on a
// 12 playing off 12; it shows up on the plus handicap, the empty box, the string
// with a trailing space, and the stroke index nobody meant to pass in.
// ---------------------------------------------------------------------------

const HCP_STRINGS = [
    '0', '1', '9', '18', '27', '36', '54',        // scratch through absurd
    '+1', '+2', '+5.5',                            // better than scratch
    '8.4', '12.7', '.5', '0.0', '1e2',             // fractional and exotic
    '-3',                                          // negative, which is not a plus
    '', '  ', 'abc', '18 ', ' 18',                 // unreadable or untrimmed
    undefined, null,
];

const STROKE_INDEXES = [1, 2, 3, 9, 10, 17, 18, 0, 19, -1, undefined, null, NaN, '5'];

const TEAMS = [
    [{ id: 1, name: 'A', hcp: '0' }, { id: 2, name: 'B', hcp: '18' }],
    [{ id: 1, name: 'A', hcp: '+2' }, { id: 2, name: 'B', hcp: '9' }],
    [{ id: 1, name: 'A', hcp: '12' }, { id: 2, name: 'B', hcp: '12' }],
    [{ id: 1, name: 'A', hcp: '5' }, { id: 2, name: 'B', hcp: '9' },
     { id: 3, name: 'C', hcp: '2' }, { id: 4, name: 'D', hcp: '30' }],
    [{ id: 1, name: 'A', hcp: '' }, { id: 2, name: 'B', hcp: '7' }],
    [],
];

const FORMATS = ['match', 'nassau', 'bestball', 'scramble', 'ryder', 'stroke',
                 'skins', 'wolf', '', undefined, null];

// ===========================================================================
// 0. THE MODULE ITSELF
// ===========================================================================

describe('handicap.js — a shared module with nothing behind it', () => {

    test('it owns all seven functions', () => {
        const h = realmFor('handicap.js');
        FAMILY.forEach(fn => assert.equal(typeof h[fn], 'function', 'handicap.js should own ' + fn));
    });

    test('it has no dependencies of its own', () => {
        // Executed in a realm with nothing but the language, not inspected. Pages
        // load it at different points in their boot, so it must not reach for
        // anything - not a DOM, not Firebase, not another engine.
        const bare = {};
        vm.createContext(bare);
        vm.runInContext(read('handicap.js'), bare, { filename: 'handicap.js' });
        assert.equal(bare.parseHcp('+2'), -2);
        assert.equal(bare.getStrokes(1, 18), 1);
    });

    test('it runs no top-level code', () => {
        const src = read('handicap.js')
            .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const topLevel = src.split('\n')
            .filter(l => /^\S/.test(l))
            .filter(l => !/^function\s/.test(l) && !/^\}/.test(l) && l.trim() !== '');
        assert.deepEqual(topLevel, [], 'handicap.js should be function declarations only');
    });

    test('every migrated page loads it, and owns no copy of its own', () => {
        // REVERSED IN STEP 2. This used to assert that NO page loaded handicap.js,
        // because step 1 was deliberately additive. Step 2 moved eight pages onto it,
        // so the useful statement is the opposite one.
        MIGRATED_PAGES.forEach(page => {
            const src = read(page);
            assert.match(src, /<script src="handicap\.js">/, page + ' must load handicap.js');
            const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
            FAMILY.concat(['parseHcpAdmin', 'getStrokesAdmin']).forEach(fn =>
                assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                    page + ' must not redeclare ' + fn));
        });
    });

    test('it loads BEFORE the engines and before every inline block', () => {
        // These are plain globals. A page that loaded handicap.js after
        // money-engine.js would still work today - money-engine declares the same
        // seven - and would break silently in step 4. Order is pinned now, while it
        // is still cheap to get right.
        MIGRATED_PAGES.forEach(page => {
            const src = read(page);
            const at = src.indexOf('<script src="handicap.js">');
            const inline = src.indexOf('<script>');
            assert.ok(at > -1 && at < inline, page + ' must load handicap.js before its inline block');
            ['money-engine.js', 'settlement-engine.js'].forEach(engine => {
                const tag = src.indexOf('<script src="' + engine + '">');
                if (tag > -1) assert.ok(at < tag,
                    page + ' must load handicap.js before ' + engine);
            });
        });
    });
});

// ===========================================================================
// 1. SOURCE IDENTITY
// ===========================================================================

describe('SINGLE OWNER — nothing else declares the family', () => {

    test('money-engine.js consumes the family and no longer declares it', () => {
        // REVERSED IN STEP 4. This used to assert that handicap.js matched
        // money-engine.js character for character, because both declared the seven.
        // money-engine.js now calls them as globals - which is what it always did
        // internally; only the declaration moved.
        const src = read('money-engine.js');
        FAMILY.forEach(fn => assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(src),
            'money-engine.js must not redeclare ' + fn));
        // And it must still USE them, or the extraction quietly deleted behaviour
        // rather than moving it.
        ['parseHcp', 'getStrokes'].forEach(fn =>
            assert.ok(new RegExp('(?<![.\\w])' + fn + '\\s*\\(').test(src),
                'money-engine.js should still call ' + fn));
    });

    test('settlement-engine.js was never touched and still consumes them too', () => {
        const src = read('settlement-engine.js');
        FAMILY.forEach(fn => assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(src),
            'settlement-engine.js must not declare ' + fn));
        assert.ok(/getStrokes\(/.test(src) && /parseHcp\(/.test(src),
            'settlement-engine.js calls the canonical pair, as it always has');
    });

    test('every migrated page RESOLVES to the canonical function at runtime', () => {
        // Source text says the page copies are gone. This says each page actually ends
        // up with the right function once every script has run in browser order -
        // which source text alone cannot show.
        const h = realmFor('handicap.js');
        MIGRATED_PAGES.forEach(page => {
            const sb = loadHtmlInlineScript(page);
            FAMILY.forEach(fn => {
                if (typeof sb[fn] !== 'function') return; // page may not reach every member
                assert.equal(norm(sb[fn]), norm(h[fn]),
                    page + ' resolves ' + fn + ' to something other than the canonical one');
            });
            assert.equal(sb.parseHcp('+2'), -2, page + ' must parse a plus handicap canonically');
        });
    });
});

// ===========================================================================
// 2. BEHAVIOURAL PARITY
//
// Source identity would survive a copy that never runs. These execute.
// ===========================================================================

describe('BEHAVIOUR — every definition answers identically', () => {

    // Files that own a given function, so a page that only carries parseHcp and
    // getStrokes is not asked about the relative family.
    const ownersOf = (fn) => Object.keys(OWNERS).filter(f =>
        OWNERS[f].includes(fn) || (f === 'admin.html' && OWNERS[f].includes(fn + 'Admin')));

    test('parseHcp — plus handicaps, blanks, fractions and junk', () => {
        // ONE owner now. The comparison that remains is not copy-against-copy - there
        // is no copy - but every CONSUMER against the canonical module, which is the
        // thing that can actually go wrong once a realm forgets its prerequisite.
        const files = ownersOf('parseHcp');
        assert.deepEqual(files, ['handicap.js']);
        HCP_STRINGS.forEach(h => {
            const answers = files.map(f => [f, JSON.stringify(fnIn(f, 'parseHcp')(h))]);
            const distinct = new Set(answers.map(a => a[1]));
            assert.equal(distinct.size, 1,
                'parseHcp disagreed on ' + JSON.stringify(h) + ': ' + JSON.stringify(answers));
        });
    });

    test('parseHcp — the plus-handicap rule specifically', () => {
        // Measured from production, then pinned, because it is the one rule here
        // that a reader is most likely to get backwards: a plus handicap is
        // NEGATIVE, because the golfer gives strokes.
        const p = realmFor('handicap.js').parseHcp;
        assert.equal(p('+2'), -2);
        assert.equal(p('+5.5'), -5.5);
        assert.equal(p('0'), 0);
        assert.equal(p(''), 0, 'an empty box is scratch, not a crash');
        assert.equal(p('abc'), 0);
        assert.equal(p('-3'), -3, 'a minus sign is not a plus handicap');
    });

    test('getStrokes — every handicap against every stroke index', () => {
        const files = ownersOf('getStrokes');
        const canonicalParse = realmFor('handicap.js').parseHcp;
        HCP_STRINGS.forEach(h => STROKE_INDEXES.forEach(i => {
            const n = canonicalParse(h);
            const answers = files.map(f => [f, JSON.stringify(fnIn(f, 'getStrokes')(i, n))]);
            assert.equal(new Set(answers.map(a => a[1])).size, 1,
                'getStrokes disagreed on ' + JSON.stringify([h, i]) + ': ' + JSON.stringify(answers));
        }));
    });

    test('getStrokes — the boundaries that decide a hole', () => {
        const g = realmFor('handicap.js').getStrokes;
        assert.equal(g(1, 18), 1, 'an 18 gets a stroke on every hole');
        assert.equal(g(18, 18), 1);
        assert.equal(g(1, 27), 2, 'past 18 the allocation wraps');
        assert.equal(g(10, 27), 1);
        // THE EQUALITY EDGE. hcpIndex === numericHcp % 18 is the hole that decides
        // whether a 9 gets a stroke on SI 9, and it is the one boundary a <= / <
        // slip changes. Added after a negative control mutated exactly that and the
        // cases above stayed green.
        assert.equal(g(9, 9), 1, 'a 9 receives on SI 9, not just SI 1-8');
        assert.equal(g(10, 9), 0, 'and not on SI 10');
        assert.equal(g(4, 22), 2, 'wrapping past 18 keeps the same inclusive edge');
        assert.equal(g(5, 22), 1);
        assert.equal(g(1, 0), 0, 'scratch receives nothing');
        assert.equal(g(17, -2), -1, 'a plus 2 gives a stroke back on the easiest holes');
        assert.equal(g(16, -2), 0);
    });

    test('the relative match family — baseline, allocation and format gate', () => {
        const files = ownersOf('matchHandicapBaseline');
        assert.deepEqual(files, ['handicap.js']);

        TEAMS.forEach(t => {
            const base = files.map(f => [f, JSON.stringify(fnIn(f, 'matchHandicapBaseline')(t))]);
            assert.equal(new Set(base.map(a => a[1])).size, 1,
                'matchHandicapBaseline disagreed: ' + JSON.stringify(base));
            const rel = files.map(f => [f, JSON.stringify(plain(fnIn(f, 'matchRelativeHandicaps')(t)))]);
            assert.equal(new Set(rel.map(a => a[1])).size, 1,
                'matchRelativeHandicaps disagreed: ' + JSON.stringify(rel));
        });

        [0, 1, 5, 9, 18, 27, -3, 0.5].forEach(rel => STROKE_INDEXES.forEach(i => {
            const a = files.map(f => [f, JSON.stringify(fnIn(f, 'allocateMatchStrokes')(rel, i))]);
            assert.equal(new Set(a.map(x => x[1])).size, 1,
                'allocateMatchStrokes disagreed on ' + JSON.stringify([rel, i]));
        }));

        ['0', '9', '18', '+2'].forEach(own => ['0', '9', '18', '+2'].forEach(opp =>
            [1, 9, 18].forEach(i => {
                const a = files.map(f => {
                    const p = fnIn(f, 'parseHcp');
                    return [f, JSON.stringify(fnIn(f, 'relativeMatchStrokes')(i, p(own), p(opp)))];
                });
                assert.equal(new Set(a.map(x => x[1])).size, 1,
                    'relativeMatchStrokes disagreed on ' + JSON.stringify([own, opp, i]));
            })));

        FORMATS.forEach(fmt => {
            const a = files.map(f => [f, JSON.stringify(fnIn(f, 'isRelativeMatchFormat')(fmt))]);
            assert.equal(new Set(a.map(x => x[1])).size, 1,
                'isRelativeMatchFormat disagreed on ' + JSON.stringify(fmt));
        });
    });

    test('the baseline is the LOWEST golfer in the match, both sides counted together', () => {
        // The rule the whole relative-handicap contract rests on, pinned on its own
        // so a regression cannot hide inside a loop.
        const h = realmFor('handicap.js');
        assert.equal(h.matchHandicapBaseline(
            [{ hcp: '9' }, { hcp: '2' }, { hcp: '30' }, { hcp: '5' }]), 2);
        assert.equal(h.matchHandicapBaseline([{ hcp: '+2' }, { hcp: '9' }]), -2,
            'a plus handicap is the lowest, not the highest');
        assert.equal(h.matchHandicapBaseline([]), 0, 'an empty match is scratch');
    });

    test('scramble is NOT a relative-handicap format', () => {
        const h = realmFor('handicap.js');
        assert.equal(h.isRelativeMatchFormat('match'), true);
        assert.equal(h.isRelativeMatchFormat('nassau'), true);
        assert.equal(h.isRelativeMatchFormat('scramble'), false,
            'a scramble has one team score, so relative allocation does not apply');
    });
});

// ===========================================================================
// 3. THE EXPIRY DATE
// ===========================================================================

describe('MIGRATION STATE — this scaffolding is meant to come down', () => {

    test('a normal engine realm receives handicap.js as a prerequisite', () => {
        // The harness contract that replaced forty hand-maintained dependency lists.
        // money-engine.js calls the family as globals, so a realm holding it alone
        // does not describe production - and used to only appear to work because
        // money-engine.js carried its own copy.
        const { MODULE_PREREQS } = require('./helpers/load-script.js');
        CONSUMER_MODULES.forEach(m => assert.ok((MODULE_PREREQS[m] || []).includes('handicap.js'),
            m + ' must declare handicap.js as a prerequisite'));

        const realm = loadJsFile('money-engine.js');
        assert.equal(typeof realm.parseHcp, 'function',
            'a normal money-engine realm should reach the canonical parseHcp');
        assert.equal(realm.parseHcp('+2'), -2);
        assert.equal(realm.getStrokes(1, 18), 1);
    });

    test('a deliberately crippled realm still fails loudly', () => {
        // The opt-out has to keep working, or there is no way to prove that a missing
        // dependency breaks rather than quietly miscalculating a stroke.
        const crippled = loadJsFile('money-engine.js', [], { only: true });
        assert.equal(typeof crippled.parseHcp, 'undefined',
            'without handicap.js the realm should have no handicap function at all');
        // calcStablefordEngine reaches getStrokes on the first scored hole, so it is
        // the shortest path from "the module is missing" to "the app breaks".
        assert.throws(() => crippled.calcStablefordEngine(
            { players: [{ id: 1, name: 'A', hcp: '0' }] },
            [{ hole: 1, par: 4, hcpIndex: 1 }], { p1_h1: 4 }),
            /getStrokes is not defined/,
            'an engine that needs a stroke must throw, not compute one wrong');
    });

    test('handicap.js loads BEFORE money-engine.js, not merely alongside it', () => {
        // Order matters at load time for nothing - these are function declarations -
        // but it matters enormously for intent, and a page that got it backwards
        // would have been silently fine right up until step 4. Pinned in both places
        // it is expressed: the harness prerequisite, and every page's script tags.
        const { MODULE_PREREQS } = require('./helpers/load-script.js');
        assert.deepEqual(MODULE_PREREQS['money-engine.js'], ['handicap.js']);
        MIGRATED_PAGES.forEach(page => {
            const src = read(page);
            const h = src.indexOf('<script src="handicap.js">');
            ['money-engine.js', 'settlement-engine.js'].forEach(engine => {
                const e = src.indexOf('<script src="' + engine + '">');
                if (e > -1) assert.ok(h > -1 && h < e, page + ': handicap.js must precede ' + engine);
            });
        });
    });

    test('the duplicate owners are exactly the ones we know about', () => {
        // A directory scan, so a copy appearing somewhere new - trip.html, an engine
        // file, a page added later - fails here instead of drifting quietly.
        const expected = new Set(Object.keys(OWNERS));
        fs.readdirSync(REPO_ROOT)
            .filter(f => (f.endsWith('.html') || f.endsWith('.js')))
            .filter(f => !/_test\.js$|\.test\.js$/.test(f))
            .forEach(f => {
                const src = read(f).replace(/<script src=[^>]*><\/script>/g, '');
                const owns = FAMILY.concat(['parseHcpAdmin', 'getStrokesAdmin'])
                    .some(fn => new RegExp('function\\s+' + fn + '\\s*\\(').test(src));
                if (owns) {
                    assert.ok(expected.has(f),
                        f + ' has grown a handicap copy that this suite does not know about');
                }
            });
    });

    test('admin.html\u2019s aliases are gone and cannot come back', () => {
        // REVERSED IN STEP 2. parseHcpAdmin / getStrokesAdmin were byte-identical to
        // canonical under different names - which is exactly why a grep for the real
        // names never found them, and why they are worth a permanent guard rather
        // than a deletion nobody remembers.
        const src = read('admin.html');
        assert.ok(!/parseHcpAdmin/.test(src), 'no reference to parseHcpAdmin may remain');
        assert.ok(!/getStrokesAdmin/.test(src), 'no reference to getStrokesAdmin may remain');
        const a = realmFor('admin.html');
        assert.equal(typeof a.parseHcp, 'function', 'admin.html must reach canonical parseHcp');
        assert.equal(a.parseHcp('+2'), -2);
        assert.equal(a.getStrokes(1, 18), 1);
    });
});
