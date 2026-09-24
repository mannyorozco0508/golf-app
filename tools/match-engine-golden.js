#!/usr/bin/env node
// ============================================================================
// RECORD THE calculateMatchEngine GOLDEN CORPUS
//
//   node tools/match-engine-golden.js --check     compare, exit 1 on a diff
//   node tools/match-engine-golden.js --write     re-record helpers/match-engine-golden.json
//
// The goldens are what match_engine_parity_test.js holds the canonical engine to
// once there is only one copy left to compare. They were first recorded at
// ae22953, from THREE copies in agreement (money-engine.js, index.html and
// stats.html) - so they are a measurement of the behaviour v218 preserved, not a
// snapshot of whatever the engine happened to do afterwards.
//
// --write RE-PINS them. That is the deliberate confirmation a real arithmetic
// change asks for, and it must come with a reason in the commit; it is not a way
// past a red test. Run --check first and read the diff.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('../helpers/load-script.js');
const { FIXTURES, argsFor, normalise } = require('../helpers/match-engine-corpus.js');
const vm = require('vm');

const OUT = path.join(REPO_ROOT, 'helpers/match-engine-golden.json');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function declaringFiles() {
    return fs.readdirSync(REPO_ROOT)
        .filter(f => /\.(html|js)$/.test(f))
        .filter(f => !/_test\.js$|\.test\.js$/.test(f))
        .filter(f => /function\s+calculateMatchEngine\s*\(/.test(read(f)))
        .sort();
}

function engineFrom(file) {
    if (file.endsWith('.js')) {
        return loadJsFile(file, ['handicap.js', 'text-safe.js']).calculateMatchEngine;
    }
    // A page's realm from its REAL script tags only - no harness top-ups, so a
    // page that is missing a module fails here the way a browser would.
    const sb = loadHtmlInlineScript(file);
    return vm.runInContext('typeof calculateMatchEngine === "function" ? calculateMatchEngine : null', sb);
}

function record(fn) {
    const out = {};
    FIXTURES.forEach(f => {
        const r = normalise(fn.apply(null, argsFor(f)));
        out[f.label] = {
            t1TotalMoney: r.t1TotalMoney,
            pressCount: r.pressCount,
            segments: r.activeMatches.length,
            maxThru: r.maxThru,
            usesRelativeHandicap: r.usesRelativeHandicap,
            matchBaseline: r.matchBaseline,
            finalResults: r.activeMatches.map(m => m.finalResult || ''),
            holeWinners: Object.keys(r.holeLog).map(h => r.holeLog[h].holeWinner)
        };
    });
    return out;
}

const files = declaringFiles();
const canonical = files.find(f => f.endsWith('.js'));
if (!canonical) { console.error('FAIL: no .js file declares calculateMatchEngine'); process.exit(2); }

console.log('declaring files: ' + files.join(', '));
console.log('canonical      : ' + canonical);

// Every copy must agree BEFORE anything is recorded. Recording from one copy
// while another disagrees would pin the disagreement.
const base = record(engineFrom(canonical));
let drift = 0;
files.filter(f => f !== canonical).forEach(f => {
    const other = record(engineFrom(f));
    FIXTURES.forEach(fx => {
        const a = JSON.stringify(base[fx.label]), b = JSON.stringify(other[fx.label]);
        if (a !== b) { drift++; console.log('DRIFT  ' + f + '  ' + fx.label + '\n   canonical ' + a + '\n   ' + f + ' ' + b); }
    });
});
console.log(files.length + ' copies, ' + FIXTURES.length + ' fixtures, ' + drift + ' disagreements beyond the three normalised fields');
if (drift) { console.error('FAIL: copies disagree - resolve before recording'); process.exit(3); }

const mode = process.argv[2];
if (mode === '--write') {
    fs.writeFileSync(OUT, JSON.stringify(base, null, 2) + '\n');
    console.log('WROTE ' + path.relative(REPO_ROOT, OUT));
} else {
    if (!fs.existsSync(OUT)) { console.error('FAIL: ' + OUT + ' does not exist; run --write'); process.exit(4); }
    const have = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const diffs = FIXTURES.filter(f => JSON.stringify(have[f.label]) !== JSON.stringify(base[f.label]));
    diffs.forEach(f => console.log('CHANGED  ' + f.label + '\n   recorded ' + JSON.stringify(have[f.label]) + '\n   now      ' + JSON.stringify(base[f.label])));
    console.log(diffs.length ? 'FAIL: ' + diffs.length + ' fixture(s) moved' : 'OK: goldens match');
    process.exit(diffs.length ? 1 : 0);
}
