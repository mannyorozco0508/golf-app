#!/usr/bin/env node
// ============================================================================
// THE SUITE CHECK - reads the TAP log `npm test` just wrote and says, in words
// that cannot be confused, which of three things happened:
//
//   A TEST FAILED                 an assertion inside a file - the ordinary red
//   A FILE DIED WITHOUT RUNNING   the runner's child exited non-zero or by a
//     ITS TESTS                   signal with no failing row of its own; its
//                                 results are lost and the file counts as ONE
//                                 test. The runner's spec output prints only
//                                 'test failed' for this; the TAP carries the
//                                 exitCode and signal, which is why the log is
//                                 kept (Wave C, 2026-09-15: three such deaths
//                                 over ~114 runs were classified from the spec
//                                 summary alone, and nobody ever had the field
//                                 that tells a process.exit from a SIGKILL).
//   TESTS DROPPED                 the total is below the last green run's -
//                                 results were lost even if no death line was
//                                 seen. The last green total is written by this
//                                 check itself (test-runs/last-green.json), so
//                                 there is no hand-maintained number.
//
// A fourth shape - a HANG - never reaches this check, because the run never
// ends; that one you see as a run that will not finish (an 18-hour example was
// found alive on 2026-09-15).
//
// Usage: node tools/suite-check.js [test-runs/last.tap]
// Exit 0 only when nothing failed, nothing died and nothing dropped.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tapPath = path.resolve(process.argv[2] || path.join(ROOT, 'test-runs', 'last.tap'));
const greenPath = path.join(path.dirname(tapPath), 'last-green.json');

if (!fs.existsSync(tapPath)) {
    console.log('SUITE CHECK: no TAP log at ' + tapPath + ' - the run did not write one (did it start?)');
    process.exit(2);
}
const lines = fs.readFileSync(tapPath, 'utf8').split('\n');

// The totals the runner prints at the end.
const totals = {};
lines.forEach(l => { const m = /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)/.exec(l); if (m) totals[m[1]] = Number(m[2]); });
const ended = 'tests' in totals && 'fail' in totals;

// A file-level death: a top-level `not ok N - <file>` whose YAML block carries
// exitCode / signal. A failed TEST never has those fields.
const deaths = [];
for (let i = 0; i < lines.length; i++) {
    const m = /^not ok \d+ - (.+)$/.exec(lines[i]);
    if (!m) continue;
    const block = { name: m[1], exitCode: null, signal: null, duration: null, error: null };
    let sawField = false;
    for (let j = i + 1; j < lines.length && !/^  \.\.\./.test(lines[j]); j++) {
        let k;
        if ((k = /^  exitCode: (.+)$/.exec(lines[j]))) { block.exitCode = k[1]; sawField = true; }
        else if ((k = /^  signal: (.+)$/.exec(lines[j]))) { block.signal = k[1]; sawField = true; }
        else if ((k = /^  duration_ms: (.+)$/.exec(lines[j]))) block.duration = Number(k[1]);
        else if ((k = /^  error: (.+)$/.exec(lines[j]))) block.error = k[1];
    }
    if (sawField) deaths.push(block);
}

const green = fs.existsSync(greenPath) ? JSON.parse(fs.readFileSync(greenPath, 'utf8')) : null;
const out = [];
let bad = false;

if (!ended) {
    out.push('SUITE CHECK: the TAP log has no totals - the run did not end (a hang, or it was killed). Nothing can be concluded from it.');
    bad = true;
}

deaths.forEach(d => {
    bad = true;
    const how = d.signal && d.signal !== '~' ? 'killed by ' + d.signal.replace(/'/g, '')
              : 'exited with code ' + d.exitCode;
    out.push('A FILE DIED WITHOUT RUNNING ITS TESTS: ' + d.name + ' - ' + how
        + (d.duration != null ? ' after ' + Math.round(d.duration) + ' ms' : '')
        + '. Its rows are lost; it counted as one test. This is NOT a failed test.');
});

if (ended) {
    const testFails = totals.fail - deaths.length;
    if (testFails > 0) { bad = true; out.push(testFails + ' TEST' + (testFails === 1 ? '' : 'S') + ' FAILED (an assertion inside a file - see the spec output above).'); }
    if (totals.cancelled > 0) { bad = true; out.push(totals.cancelled + ' test' + (totals.cancelled === 1 ? '' : 's') + ' CANCELLED (a parent ended before its child).'); }
    if (green && totals.tests < green.tests) {
        bad = true;
        out.push('TESTS DROPPED: ' + totals.tests + ' ran, the last green run had ' + green.tests + ' (' + green.at + ') - '
            + (green.tests - totals.tests) + ' results are missing' + (deaths.length ? ', which is what the death above cost.' : ' and no death line explains it: read the TAP.'));
    }
    if (!bad) {
        fs.writeFileSync(greenPath, JSON.stringify({ tests: totals.tests, pass: totals.pass, at: new Date().toISOString() }, null, 1) + '\n');
        out.push('GREEN: ' + totals.tests + ' tests, ' + totals.pass + ' passed' + (green ? ' (last green ' + green.tests + ')' : '') + '; last-green recorded.');
    } else {
        out.push('totals: tests ' + totals.tests + ' pass ' + totals.pass + ' fail ' + totals.fail + ' cancelled ' + (totals.cancelled || 0)
            + (green ? ' (last green: ' + green.tests + ' tests)' : ''));
    }
}
console.log('---- SUITE CHECK (' + path.relative(ROOT, tapPath) + ') ----');
out.forEach(l => console.log(l));
process.exit(bad ? 1 : 0);
