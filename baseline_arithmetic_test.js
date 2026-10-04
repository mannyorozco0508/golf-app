// BASELINE ARITHMETIC - a guard header's red baseline has to add up.
//
// WHY THIS FILE EXISTS. Three waves running, the "N PASS / M FAIL" line in a new
// guard's header was written from a GUESS and not from a run:
//
//   Wave 24 (net_finish_no_names_test.js)  wrote 11 PASS / 14 FAIL  = 25, file had 26
//   Wave 27b (kp_forced_decision_test.js)  wrote  2 PASS /  3 FAIL, truth was 1 / 4
//   Wave 28 (guide_back_test.js)           wrote  3 PASS /  8 FAIL  = 11, file had  9
//
// Wave 24's was corrected before its commit; the other two were caught by a grep
// against the codeload tarball, minutes before or after a merge. Not one was caught
// by the suite. A baseline is the only claim in a guard header that cannot be
// re-derived from the code later, so a wrong one is permanent: the next reader
// believes the wave proved something it did not.
//
// WHAT THIS CATCHES, HONESTLY. Two of the three above. A sum check finds Wave 24
// (25 against 26 tests) and Wave 28 (11 against 9). It does NOT find Wave 27b,
// because 2+3 and the true 1+4 both come to 5 - a guess that happens to total
// correctly is indistinguishable from a measurement, to arithmetic and to any other
// static check. The only guard against that one is running the suite against the
// stated sha, and nothing here pretends otherwise.
//
// THE RULE, in two halves:
//
//   A. Every "N PASS / M FAIL" states the total it was measured at - "all 13:",
//      "all 26 tests:", "measured at 15 tests" - and N + M equals that total.
//   B. The stated total equals the number of tests the file actually REGISTERS,
//      unless a "BASELINE COUNT DELTA: +k <reason>" line beside that baseline
//      reconciles the difference, and k is the real difference.
//
// Half B needs an exact count, and `grep -c "test("` is not one: this very wave
// measured 14 declarations in landing_focus_test.js against 16 registered tests,
// because one forEach generates three. A guard that reconciled a baseline against
// a guessed count would be the defect it is trying to catch, one level up. So the
// count comes from helpers/count-tests.js, which loads the suite with node:test
// swapped for a stand-in: describe() bodies run so nested tests register, test()
// bodies NEVER run. No Chrome, no fixtures, 28ms for the Chrome suite.
//
// A FIGURE IN THIS FORM IS A CLAIM, INCLUDING ONE YOU ARE CONFESSING. The checker
// cannot tell a baseline from a sentence recording a wrong guess, so a wrong figure
// written out in full gets checked as though it were the measurement. That is why
// guide_back_test.js:49 and round_format_label_test.js:38 now write their mistakes
// as "3/8" and "2/3" - shorthand, out of the checked form. Keep it that way: an
// honest record of a mistake should not read as a second baseline to anyone, the
// checker included.
//
// THE ESCAPE HATCH IS DELIBERATE AND NARROW. landing_focus_test.js was measured at
// 15 tests and a 16th was added afterwards - a platform fact (a browser refuses to
// focus a disabled input) that is green with or without the wave. Re-measuring for
// it would have been theatre. So the file declares +1 and says why, and the guard
// checks the number rather than the sentence. A delta is a written statement a
// reader can disbelieve; silence is not.
//
// SCANNING THIS FILE. baseline_arithmetic_test.js is the one file the scan skips,
// by basename. Its controls below are hand-written headers with KNOWN faults - "3
// PASS / 8 FAIL against all 9 tests" is in here on purpose - so scanning itself would
// report every control as a defect and there would be no way to tell a control from
// a real one. That is the CLAUDE.md rule about checking your own new comments against
// the guard you just wrote, paid in advance: the exclusion is one line, named, and
// the controls are what prove the checker instead.
//
// THE BASELINE FOR THIS FILE ITSELF, all 10 tests. This guard's subject is comment
// text, so there is no reverted fix to measure against - instead:
//
//   THE SCAN, run over the SIX header files as they stood at main 2d9db8d (the Wave
//   28 merge), using this same helper rather than a re-typed copy of its regexes:
//   8 baselines scanned, 4 FAULTS. Two of them are the wizard header's pair, which
//   stated no total at all; one is kp_forced_decision_test.js's 25-test figure
//   against a file that now registers 28; one is guide_back_test.js's narrated wrong
//   guess, written out in full where the checker had to read it as a claim. All four
//   are fixed in this commit, which is why the scan is green here.
//
//   FOUR CONTROLS, each measured, not estimated - and I got two of the three I
//   predicted wrong before running them, in the file whose whole subject is written
//   figures that were never measured:
//     stub the sum check silent                      10 tests, 3 FAIL
//     stub the stated-total-vs-count check silent    10 tests, 1 FAIL
//     stub the missing-total check silent            10 tests, 1 FAIL
//     make count-tests.js report grep's 14 for
//       landing_focus_test.js instead of its 16      10 tests, 2 FAIL
//   Restored each time by copying back a saved file and printing its sha, per
//   CLAUDE.md - never with git checkout.
//
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// lineOf WAS NEVER IMPORTED, and that is the whole of the bug below: the helper
// has exported it all along, this file used it in one branch, and that branch had
// never executed - no prose file had ever restated a pair no suite claimed. So
// the first time one did, the guard threw "lineOf is not defined" instead of
// reporting the fault it had correctly found. A guard that cannot report is a
// guard that is not working.
const { PAIR, findAll, checkBaselines, countTests, filesWithBaselines, lineOf, ROOT }
    = require('./helpers/baseline-headers');

describe('baseline arithmetic', () => {

    // --- the scan over the real headers -------------------------------------

    test('the scan finds the headers that carry baselines', () => {
        const files = filesWithBaselines();
        const names = files.map(f => f.file).sort();
        // Positive assertion, per CLAUDE.md: a scan that found nothing satisfies
        // every "no faults" assertion below it, forever.
        assert.ok(names.length >= 8, 'expected at least 8 files with baselines, found '
            + names.length + ': ' + names.join(', '));
        for (const expected of ['guide_back_test.js', 'kp_forced_decision_test.js',
            'landing_focus_test.js', 'net_finish_no_names_test.js']) {
            assert.ok(names.includes(expected), 'the scan missed ' + expected);
        }
        const pairs = files.reduce((n, f) => n + findAll(PAIR, f.text).length, 0);
        assert.ok(pairs >= 10, 'expected at least 10 baselines across those files, found ' + pairs);
    });

    test('every baseline states its total, and PASS + FAIL equals it', () => {
        const faults = [];
        const files = filesWithBaselines();
        for (const f of files) {
            const isSuite = /_test\.js$/.test(f.file);
            const counted = isSuite ? countTests(f.file) : null;
            faults.push(...checkBaselines(f.file, f.text, counted));
            if (!isSuite) {
                // A note outside a suite may only restate a baseline that exists.
                for (const p of findAll(PAIR, f.text)) {
                    const inSuite = files.some(o => /_test\.js$/.test(o.file)
                        && new RegExp(p.groups[0] + '\\s*PASS\\s*/\\s*' + p.groups[1] + '\\s*FAIL')
                            .test(o.text));
                    if (!inSuite) {
                        // lineOf() DID NOT EXIST until 2026-10-03. This branch had
                        // never executed - no prose file had ever restated a pair
                        // no suite claimed - so the first time one did, the guard
                        // threw "lineOf is not defined" instead of reporting the
                        // fault it had correctly found. A guard that cannot report
                        // is a guard that is not working, and this is the second
                        // half of the same lesson as an inert assertion.
                        const line = f.text.slice(0, p.index).split('\n').length;
                        faults.push(f.file + ':' + line + ' restates "'
                            + p.raw + '", which no suite header claims.');
                    }
                }
            }
        }
        assert.deepStrictEqual(faults, [], '\n  ' + faults.join('\n  ') + '\n');
    });

    // --- the counter, which half B depends on -------------------------------

    test('the test count is REGISTERED tests, not declarations of test(', () => {
        const text = fs.readFileSync(path.join(ROOT, 'landing_focus_test.js'), 'utf8');
        const declarations = (text.match(/\btest\(/g) || []).length;
        const counted = countTests('landing_focus_test.js');
        assert.strictEqual(counted, 16, 'landing_focus_test.js registers 16 tests');
        assert.ok(counted > declarations, 'the count must come from registration, not grep: '
            + declarations + ' declarations, ' + counted + ' registered - a forEach generates '
            + 'three of them, which is exactly why grep cannot be trusted here');
    });

    test('counting a suite does not RUN it', () => {
        // landing_focus_test.js drives real Chrome over CDP. If counting ran its
        // bodies this would take a minute and need a browser; it takes milliseconds.
        const t0 = Date.now();
        countTests('landing_focus_test.js');
        const ms = Date.now() - t0;
        assert.ok(ms < 8000, 'counting landing_focus_test.js took ' + ms + 'ms - if that is '
            + 'seconds, node:test is not being stubbed and the suite is running');
    });

    // --- controls: the checker is proved on headers with known faults -------

    test('CONTROL a sum that does not match the stated total is caught', () => {
        const bad = '// Against main abc1234, all 9 tests:\n//\n//     3 PASS / 8 FAIL\n';
        const faults = checkBaselines('fake_test.js', bad, 9);
        assert.strictEqual(faults.length, 1, 'expected one fault, got: ' + faults.join(' | '));
        assert.match(faults[0], /sums to 11, but the baseline says it was measured at 9/);
    });

    test('CONTROL Wave 24 and Wave 28 as they were actually written are caught', () => {
        const w28 = checkBaselines('guide_back_test.js',
            '// all 9 tests:\n//\n//     3 PASS / 8 FAIL\n', 9);
        const w24 = checkBaselines('net_finish_no_names_test.js',
            '// all 26 tests:\n//\n//     11 PASS / 14 FAIL\n', 26);
        assert.strictEqual(w28.length, 1, 'Wave 28 baseline not caught');
        assert.strictEqual(w24.length, 1, 'Wave 24 baseline not caught');
    });

    test('CONTROL Wave 27b is NOT caught, and this test is the record of that limit', () => {
        // 2 + 3 = 5 and the true 1 + 4 = 5. Arithmetic cannot separate them. If this
        // test ever goes red because the checker grew a way to tell, delete it and
        // say so in the header - do not weaken the checker to keep it green.
        const guessed = checkBaselines('kp_forced_decision_test.js',
            '// all 5 tests:\n//\n//     2 PASS / 3 FAIL\n', 5);
        assert.deepStrictEqual(guessed, [], 'a wrong split that sums correctly is invisible here');
    });

    test('CONTROL a baseline with no stated total is caught', () => {
        const faults = checkBaselines('fake_test.js', '// measured red:\n//  3 PASS / 4 FAIL\n', 7);
        assert.strictEqual(faults.length, 1, 'expected one fault, got: ' + faults.join(' | '));
        assert.match(faults[0], /states no total/);
    });

    test('CONTROL a stated total that is not the file count needs a DELTA, and a wrong DELTA is caught', () => {
        const header = '// all 15 tests:\n//\n//     8 PASS / 7 FAIL\n';
        const undeclared = checkBaselines('fake_test.js', header, 16);
        assert.strictEqual(undeclared.length, 1, 'an unexplained 15-against-16 must be caught');
        assert.match(undeclared[0], /registers 16.*BASELINE COUNT DELTA: \+1/s);

        const wrong = checkBaselines('fake_test.js',
            header + '// BASELINE COUNT DELTA: +3  a reason\n', 16);
        assert.strictEqual(wrong.length, 1, 'a delta of the wrong size must be caught');
        assert.match(wrong[0], /declares BASELINE COUNT DELTA: \+3 but the real difference is \+1/);

        const right = checkBaselines('fake_test.js',
            header + '// BASELINE COUNT DELTA: +1  a test added after the measurement\n', 16);
        assert.deepStrictEqual(right, [], 'a correct, explained delta must pass');
    });

    test('CONTROL two baselines in one header do not borrow each other totals', () => {
        // kp_forced_decision_test.js carries Wave 23's (28) and Wave 27b's (25).
        const two = '// all 28:\n//\n//     25 PASS / 3 FAIL\n//\n'
            + '// and the earlier one, all 25 tests: 6 PASS / 19 FAIL.\n'
            + '// BASELINE COUNT DELTA: +3  three cases added in Wave 27b\n';
        assert.deepStrictEqual(checkBaselines('kp_forced_decision_test.js', two, 28), []);

        const swapped = '// all 25 tests:\n//\n//     25 PASS / 3 FAIL\n//\n'
            + '// and the earlier one, all 28: 6 PASS / 19 FAIL.\n';
        assert.strictEqual(checkBaselines('kp_forced_decision_test.js', swapped, 28).length, 2,
            'both baselines must be measured against their own total');
    });
});
