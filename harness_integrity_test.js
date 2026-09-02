// ============================================================================
// TEST HARNESS INTEGRITY
//
// The repo carried two stray copies at its root - `fixtures.js` and
// `load_script.js` - byte-for-byte duplicates of `helpers/fixtures.js` and
// `helpers/load-script.js`. Nothing required them. They almost certainly landed
// from an upload predating the helpers/ folder; the underscore-vs-hyphen spelling
// is exactly what a hand-rename leaves behind.
//
// Dead files are harmless until someone edits one copy. Then the repo has two
// versions of the harness that loads every engine under test, and no way to tell
// which one is real. That is the same trap four duplicate Skins implementations
// created, and it is much cheaper to prevent than to diagnose.
//
// This file is deliberately cheap: it reads a directory listing. It exists to
// fail loudly the moment a second copy of the harness appears.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const rootFiles = fs.readdirSync(REPO_ROOT);

describe('THE TEST HARNESS LIVES IN EXACTLY ONE PLACE', () => {
    test('helpers/ holds the canonical harness', () => {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'helpers', 'load-script.js')));
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'helpers', 'fixtures.js')));
    });

    test('no duplicate harness sits at the repo root', () => {
        // Both spellings, because the strays used the underscore form while helpers/
        // uses the hyphen form - a future stray could arrive as either.
        ['fixtures.js', 'load_script.js', 'load-script.js'].forEach(f => {
            assert.ok(!rootFiles.includes(f),
                `${f} is a duplicate of the helpers/ harness — delete it, or tests will start ` +
                `disagreeing about which copy is real`);
        });
    });

    test('every test requires the harness from helpers/, never from the root', () => {
        const testFiles = rootFiles.filter(f => /(_test|\.test)\.js$/.test(f));
        assert.ok(testFiles.length > 30, 'sanity: the suite should be substantial');

        testFiles.forEach(f => {
            const src = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
            // A root-relative require of the harness would resolve to a stray copy.
            assert.ok(!/require\(['"]\.\/(load_script|load-script|fixtures)['"]\)/.test(src),
                `${f} requires the harness from the repo root instead of helpers/`);
        });
    });
});

describe('TEST FILE DISCOVERY — nothing is silently skipped', () => {
    // node --test discovers *_test.js, *.test.js and *-test.js by default. The repo
    // mixes the first two for historical reasons, which is fine - but a file named
    // outside every pattern would never run, and would look like passing coverage.
    const DISCOVERED = /(_test|\.test|-test)\.js$/;

    test('every file whose name suggests a test actually matches a discovery pattern', () => {
        const looksLikeTest = rootFiles.filter(f =>
            f.endsWith('.js') && /test/i.test(f) && !/tests-data/.test(f));
        assert.ok(looksLikeTest.length > 30, 'sanity: the suite should be substantial');

        looksLikeTest.forEach(f => {
            assert.match(f, DISCOVERED,
                `${f} looks like a test but matches no node --test pattern, so it never runs`);
        });
    });

    // ------------------------------------------------------------------
    // WHY THIS EXISTS. A Part 2 test file was committed from a tablet as
    // "\u6b62 kp_live_value_test.js" - a stray CJK character and a space in front of an
    // otherwise correct name. It still ended in _test.js, so the pattern check above
    // passed it. `node --test` walks the directory and ran it, so the totals looked
    // right. But the filename carried a SPACE, and every argument-based run - the
    // glob invocations used for the date and timezone sweeps - split it into two
    // arguments and silently dropped all 38 tests. Green either way; coverage present
    // in one runner and absent in the other, with nothing to say so.
    //
    // The rule is therefore about the CHARACTERS, not the suffix.
    const PLAIN_BASENAME = /^[A-Za-z0-9._-]+$/;

    test('no test filename carries whitespace or non-ASCII characters', () => {
        const testFiles = rootFiles.filter(f => DISCOVERED.test(f));
        testFiles.forEach(f => {
            assert.match(f, PLAIN_BASENAME,
                `"${f}" contains a character that breaks argument-based test runs. ` +
                'A space splits it into two arguments; anything non-ASCII may not survive ' +
                'a shell or CI runner. Rename it to plain [A-Za-z0-9._-].');
        });
    });

    test('a malformed filename cannot shadow a canonical one', () => {
        // TWO CONDITIONS, BOTH REQUIRED. Name shape alone is not enough:
        // auto_dot_context_test.js legitimately ends with dot_context_test.js, and a
        // rule that fired on that would be noise. Content alone is not enough either -
        // a repo-wide hash-uniqueness rule would be brittle the first time two fixtures
        // coincide. So this fires only where BOTH hold: one basename ends with another
        // complete basename AND the two files are byte-identical. That is precisely the
        // shape of a prefix-corrupted duplicate, and essentially nothing else.
        const testFiles = rootFiles.filter(f => DISCOVERED.test(f));
        const bytes = {};
        testFiles.forEach(f => { bytes[f] = fs.readFileSync(path.join(REPO_ROOT, f)); });
        testFiles.forEach(a => {
            testFiles.forEach(b => {
                if (a === b || !a.endsWith(b)) return;
                assert.ok(!bytes[a].equals(bytes[b]),
                    `"${a}" ends with the whole name of "${b}" and is byte-identical to it. ` +
                    'One is a corrupted copy of the other, and both are being discovered ' +
                    'and run - delete the malformed one.');
            });
        });
    });

    test('the naming conventions in use are exactly the ones node discovers', () => {
        const testFiles = rootFiles.filter(f => DISCOVERED.test(f));
        const underscore = testFiles.filter(f => /_test\.js$/.test(f)).length;
        const dotted = testFiles.filter(f => /\.test\.js$/.test(f)).length;
        // Both are legitimate; this records the split so an unexplained drop is visible.
        assert.ok(underscore > 0 && dotted > 0);
        assert.equal(underscore + dotted, testFiles.length,
            'a test file is using a naming style this repo has not used before — verify it runs');
    });
});
