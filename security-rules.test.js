// ============================================================================
// SECURITY RULES — behavioral tests against the actual database.rules.json
//
// Runs the real `targaryen` CLI (a pure-JS Firebase Realtime Database rules
// simulator) as a subprocess against database.rules.json and a declarative
// test-definitions file (security-rules.tests-data.json), then parses its
// output. This is the one new dependency in this whole test suite —
// everything else uses only Node's built-in test runner. It's justified
// specifically because Firebase security rules are their own small
// declarative language; reading them isn't the same as knowing how they
// actually behave, and getting this wrong in either direction is high-stakes
// (too loose = still exploitable, too strict = breaks real golfer
// workflows). targaryen is a single, narrowly-scoped, well-established
// package for exactly this purpose — not a general dependency stack.
//
// This uses the CLI (child_process) rather than targaryen's JS API directly
// — the JS API's `targaryen.users.unauthenticated` helper did not behave as
// documented in this version (returned null rather than a usable auth
// object), while the standalone CLI mode is fully documented, declarative,
// and was directly verified working before this file was written.
//
// NOTE ON THE REAL FIREBASE EMULATOR: the actual Firebase RTDB emulator
// (`firebase emulators:start`) needs to download its Java binary from
// storage.googleapis.com, which this project's dev sandbox does not have
// network access to. targaryen was used instead specifically because it
// needs no network access beyond the npm registry at install time. Before
// actually deploying database.rules.json to production, running the real
// emulator once (`firebase emulators:start --only database`) in an
// environment with full network access is still worth doing as a final
// sanity check.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = __dirname;
const RULES_PATH = path.join(REPO_ROOT, 'database.rules.json');
const TESTS_DATA_PATH = path.join(__dirname, 'security-rules.tests-data.json');
const TARGARYEN_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');

function runTargaryen() {
    try {
        const output = execFileSync(TARGARYEN_BIN, [RULES_PATH, TESTS_DATA_PATH, '--verbose'], { encoding: 'utf8' });
        return { exitCode: 0, output };
    } catch (e) {
        // targaryen exits non-zero if any test failed — that's a real result, not a crash
        return { exitCode: e.status, output: (e.stdout || '') + (e.stderr || '') };
    }
}

describe('SECURITY RULES — full behavioral suite against database.rules.json', () => {
    test('every declared scenario in security-rules.tests-data.json passes', () => {
        const { exitCode, output } = runTargaryen();
        const summaryMatch = output.match(/(\d+) failures? in (\d+) tests?/);
        assert.ok(summaryMatch, `Could not parse targaryen output:\n${output}`);
        const failures = parseInt(summaryMatch[1], 10);
        const total = parseInt(summaryMatch[2], 10);
        assert.equal(failures, 0, `${failures} of ${total} security rule scenarios failed:\n${output}`);
        assert.equal(exitCode, 0, 'targaryen should exit 0 when every scenario passes');
        assert.ok(total >= 15, `Expected at least 15 scenarios to actually run, got ${total} — this test file's assertions are only as good as the scenarios in security-rules.tests-data.json`);
    });
});
