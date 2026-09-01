// ============================================================================
// HANDICAP — ONE DEFINITION, TEMPORARILY IN TWO FILES
//
// handicap.js is the shared-core home for the seven handicap functions.
// money-engine.js still declares the same seven. That duplication is deliberate,
// bounded and guarded, and this file is the guard.
//
// ---------------------------------------------------------------------------
// WHY THE DUPLICATION EXISTS AT ALL
// ---------------------------------------------------------------------------
//
// Removing the family from money-engine.js in one step was measured, on a
// disposable copy, against the committed tree:
//
//     forty test files stop working, because they build engine realms from
//     hand-written module lists that money-engine.js used to satisfy on its own
//
// Those forty files are 814KB. This project edits code by pasting whole files
// into a browser, and a doubled paste on one of them is a real and previously
// observed failure. So the migration is staged, every step green:
//
//   1. THIS STEP - handicap.js exists and is proved identical. Nothing loads it.
//   2. Pages load it and drop their own copies, including admin.html's aliases.
//   3. Test realms adopt it, in reviewable groups.
//   4. money-engine.js sheds the family; the assertions below become a no-copy
//      guard and this file is renamed to match.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE MUST NOT BECOME
// ---------------------------------------------------------------------------
//
// A permanent parity suite for a permanent duplicate. This project has spent
// four batches removing exactly that pattern. The assertions here are scaffolding
// with an expiry date, and the last test in this file says so out loud: it fails
// the moment money-engine.js stops declaring the family, which is the signal that
// step 4 has landed and this file needs rewriting rather than deleting.
//
// Everything below RUNS both definitions. Nothing reimplements a handicap rule,
// and no expected value is typed in that was not first measured from production.
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
const OWNERS = {
    'handicap.js': FAMILY,
    'money-engine.js': FAMILY,
    'index.html': FAMILY,
    'sidematches.html': FAMILY,
    'stats.html': FAMILY,
    'skins.html': ['parseHcp', 'getStrokes'],
    'admin.html': ['parseHcpAdmin', 'getStrokesAdmin'],
};

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

// The function under one file's own naming. Only admin.html differs.
const fnIn = (file, name) =>
    realmFor(file)[file === 'admin.html' ? name + 'Admin' : name];

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

    test('the file is not yet loaded by any page — step 1 is additive', () => {
        // Pinned so that step 2 is a deliberate edit here rather than a silent
        // change of meaning. When a page starts loading handicap.js, this fails and
        // whoever did it updates the migration state in this file.
        fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html')).forEach(page => {
            assert.ok(!/<script src="handicap\.js">/.test(read(page)),
                page + ' now loads handicap.js - step 2 has begun, update this suite');
        });
    });
});

// ===========================================================================
// 1. SOURCE IDENTITY
// ===========================================================================

describe('IDENTICAL SOURCE — handicap.js is a move, not a rewrite', () => {

    test('every function matches money-engine.js character for character', () => {
        const h = realmFor('handicap.js');
        const m = realmFor('money-engine.js');
        FAMILY.forEach(fn => assert.equal(norm(h[fn]), norm(m[fn]),
            fn + ' differs between handicap.js and money-engine.js - this file is '
               + 'supposed to be a move, so a difference means an algorithm changed'));
    });

    test('and matches every page copy too, including admin.html under its aliases', () => {
        const h = realmFor('handicap.js');
        Object.keys(OWNERS).filter(f => f !== 'handicap.js').forEach(file => {
            const names = file === 'admin.html' ? ['parseHcp', 'getStrokes'] : OWNERS[file];
            names.forEach(fn => {
                const local = fnIn(file, fn);
                assert.equal(typeof local, 'function', file + ' should still own ' + fn);
                assert.equal(norm(local), norm(h[fn]), file + "'s " + fn + ' has drifted');
            });
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
        const files = ownersOf('parseHcp');
        assert.ok(files.length >= 6, 'every current owner should be compared, got ' + files.length);
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
        assert.equal(g(1, 0), 0, 'scratch receives nothing');
        assert.equal(g(17, -2), -1, 'a plus 2 gives a stroke back on the easiest holes');
        assert.equal(g(16, -2), 0);
    });

    test('the relative match family — baseline, allocation and format gate', () => {
        const files = ownersOf('matchHandicapBaseline');
        assert.ok(files.length >= 4, 'four files own the relative family, got ' + files.length);

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

    test('money-engine.js still declares the family, so the duplication is the known one', () => {
        // WHEN THIS FAILS, STEP 4 HAS LANDED. That is good news, and it is a signal
        // to rewrite this file as a no-copy guard rather than to delete it. A parity
        // suite for a duplicate that no longer exists proves nothing, and a silently
        // passing suite is worse than none.
        const src = read('money-engine.js');
        FAMILY.forEach(fn => assert.match(src, new RegExp('function\\s+' + fn + '\\s*\\('),
            'money-engine.js no longer declares ' + fn
            + ' - the migration has moved on and this suite must be rewritten'));
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

    test('admin.html still uses its aliases, and they are still equivalent', () => {
        // Removed in step 2. Until then, the aliases must keep matching canonical -
        // they are what admin.html actually calls when it shows a golfer their
        // strokes on the setup screen.
        const a = realmFor('admin.html');
        const h = realmFor('handicap.js');
        assert.equal(typeof a.parseHcpAdmin, 'function');
        assert.equal(typeof a.getStrokesAdmin, 'function');
        HCP_STRINGS.forEach(s =>
            assert.equal(a.parseHcpAdmin(s), h.parseHcp(s), 'parseHcpAdmin drifted on ' + JSON.stringify(s)));
        STROKE_INDEXES.forEach(i => [0, 9, 18, 27, -2].forEach(n =>
            assert.equal(a.getStrokesAdmin(i, n), h.getStrokes(i, n),
                'getStrokesAdmin drifted on ' + JSON.stringify([i, n]))));
    });
});
