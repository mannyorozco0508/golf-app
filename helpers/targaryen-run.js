// ============================================================================
// RUN TARGARYEN AND GET ALL OF ITS OUTPUT.
//
// targaryen's CLI prints its verdict table and exits. Read through a PIPE
// (execFileSync / spawnSync with encoding), the output stops at 33,214 bytes on
// macOS - the process exits before the pipe drains, and the summary line
// "N failures in M tests" is never seen. That was invisible while the table
// was under the pipe buffer; the tournaments narrowing (2026-09-18) added 113
// rows, the table passed 50 KB, and three rules suites went red with "Could
// not parse targaryen output" on a run that had 0 failures. Written to a FILE,
// stdout is synchronous and complete. Every rules test runs it through here.
// ============================================================================
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');

function runTargaryen(rulesPath, dataPath) {
    const f = path.join(os.tmpdir(), 'targaryen-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.txt');
    const fd = fs.openSync(f, 'w');
    let status;
    try {
        status = spawnSync(TARGARYEN, [rulesPath, dataPath, '--verbose'], { stdio: ['ignore', fd, fd] }).status;
    } finally {
        fs.closeSync(fd);
    }
    const output = fs.readFileSync(f, 'utf8');
    try { fs.unlinkSync(f); } catch (e) { /* gone */ }
    return { exitCode: status, output };
}

module.exports = { runTargaryen, TARGARYEN };
