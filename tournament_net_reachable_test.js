// ============================================================================
// THE NET-REACHABLE CHECK RUNS INSIDE THE SUITE, AND "COULD NOT RUN" IS A FAILURE.
//
// tools/tournament-net-reachable-check.js is the only check in the repo that can
// see "correct and unreachable": #individual-setup-note - the one Gross/Net
// control in the product - once sat display:block inside a hidden ancestor, and
// helpers/mini-dom.js has no layout, so a panel that is styled visible and has
// no rect is invisible to everything else in this suite. The tool taps the
// format cards in Chrome and reads rects; then it builds a Net event through the
// page's own controls (sign-in gate, save, handicaps, a scoring group, the
// scorecard) and compares the organizer's board to arithmetic done by hand.
//
// NOTHING RAN IT. Written 2026-09-08; broken by the organizer sign-in gate four
// days later (the journey was opened without auth, the save refused), and again
// by course search on 2026-09-17 (rows became nodes; it matched an onclick
// attribute). Six days and one day unnoticed, because a hand-run tool that
// nobody runs is a tool that is not there. This file spawns it on every
// `npm test`, ~40 s, and turns its exit contract into assertions:
//
//   exit 0   every named assertion true          -> this file is green
//   exit 1   a divergence the JSON names          -> red, naming it
//   exit 2   COULD NOT RUN - NOTHING WAS PROVEN   -> red, quoting the bail.
//            An exit 2 is exactly the state the tool sat in for six days; it
//            must never read as a pass here.
//
// The tool is spawned as a child process, not required: its module.exports is
// a couple of probe strings, and everything it proves happens in its main.
// Chrome is already a dependency of this suite (hole_view_landing_test.js and
// others drive it through the same tools/lib), so this assumes nothing new.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');

const TOOL = path.join(REPO_ROOT, 'tools', 'tournament-net-reachable-check.js');

describe('tools/tournament-net-reachable-check.js, run inside the suite', () => {
    let run = null, report = null;

    before(() => {
        run = spawnSync(process.execPath, [TOOL], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 240000 });
        try { report = JSON.parse(run.stdout); } catch (e) { report = null; }
    }, { timeout: 250000 });

    test('POSITIVE: the tool is the one described - it still names its three tests and its exit contract', () => {
        const src = fs.readFileSync(TOOL, 'utf8');
        assert.match(src, /TEST 18\s+the radios are on screen after a real tap/);
        assert.match(src, /TEST 19\s+END TO END, THROUGH THE UI/);
        assert.match(src, /exit 2\s+could not run\. NOTHING WAS PROVEN/);
        assert.match(src, /openJourney\(\{ db: FIXTURE_DB\(\), auth: OWNER \}\)/, 'the journey must sign in as the organizer, or the save is refused');
    });

    test('the tool ran to a verdict - exit 2 ("NOTHING WAS PROVEN") is a failure here, never a pass', () => {
        assert.ok(run, 'the tool was not spawned');
        assert.notEqual(run.status, 2, 'COULD NOT RUN: ' + String(run.stderr || '').trim());
        assert.ok(run.status === 0 || run.status === 1, 'unexpected exit ' + run.status + ' (signal ' + run.signal + '): ' + String(run.stderr || '').slice(0, 400));
        assert.ok(report && typeof report === 'object', 'the tool printed no JSON report (exit ' + run.status + ', signal ' + run.signal + '): stdout ' + JSON.stringify(String(run.stdout || '').slice(0, 300)) + ' stderr ' + JSON.stringify(String(run.stderr || '').slice(0, 600)));
    });

    test('TEST 18: the radios have a rect after a real tap on Individual, and only then', () => {
        const a = report && report.TEST_18_radios_reachable && report.TEST_18_radios_reachable.assertions;
        assert.ok(a, 'no TEST 18 block');
        Object.keys(a).forEach((k) => assert.equal(a[k], true, 'TEST 18 ' + k));
    });

    test('TEST 19: a Net event built through the UI scores the hand-computed board, and differs from Gross', () => {
        const t = report && report.TEST_19_end_to_end;
        assert.ok(t && typeof t === 'object', 'TEST 19 did not run: ' + JSON.stringify(t));
        Object.keys(t.assertions).forEach((k) => assert.equal(t.assertions[k], true, 'TEST 19 ' + k + ' - board ' + JSON.stringify(t.netRun && t.netRun.board)));
    });

    test('TEST 20: the refusal appears on a broken-index card, retracts on Gross, and is absent on a real index', () => {
        const w = report && report.TEST_20_the_unreachable_warning;
        assert.ok(w && w.assertions, 'no TEST 20 block: ' + Object.keys(report || {}).join(','));
        Object.keys(w.assertions).forEach((k) => assert.equal(w.assertions[k], true, 'TEST 20 ' + k));
    });

    test('TEST 20b: choosing Net on a broken-index card is recorded as not genuine and scores gross', () => {
        const b = report && report.TEST_20b_what_gets_stored_on_an_unmapped_course;
        assert.ok(b && typeof b === 'object' && b.assertions, 'no TEST 20b block: ' + JSON.stringify(b));
        Object.keys(b.assertions).forEach((k) => assert.equal(b.assertions[k], true, 'TEST 20b ' + k));
    });

    test('the verdict is PASS with no problems', () => {
        assert.ok(report, 'no report');
        assert.deepEqual(report.problems, [], 'the tool named problems');
        assert.equal(report.verdict, 'PASS');
        assert.equal(run.status, 0);
    });
});
