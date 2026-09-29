// The checker behind baseline_arithmetic_test.js - kept out of the suite file so the
// measurement script that takes a baseline for that guard can use the same code
// rather than a re-typed copy of these regexes.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const SELF_SCAN_SKIP = 'baseline_arithmetic_test.js';   // see that file's header

// A "N PASS / M FAIL" claim.
const PAIR = /(\d+)\s*PASS\s*\/\s*(\d+)\s*FAIL/g;
// A stated total: "all 13:", "all 26 tests", "measured at 15 tests", "of 9 tests".
const TOTAL = /\ball (\d+)(?:\s+tests?)?\b|\bmeasured at (\d+)\s+tests?\b|\bof (\d+)\s+tests?\b/g;
// A declared difference between the stated total and the file's real test count.
const DELTA = /BASELINE COUNT DELTA:\s*([+-]\d+)\s+(\S[^\n]*)/g;

const WINDOW = 400;   // characters; a baseline and its total live in one paragraph

function findAll(re, text) {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const captured = m.slice(1).filter(g => g !== undefined);
        out.push({ index: m.index, end: m.index + m[0].length, raw: m[0], groups: captured });
    }
    return out;
}

// The token nearest to `at` that no other PAIR sits between. That pairing is what
// lets one header carry two baselines - kp_forced_decision_test.js carries Wave 23's
// and Wave 27b's - without either one borrowing the other's total.
function nearest(tokens, at, pairs) {
    let best = null;
    for (const t of tokens) {
        const lo = Math.min(t.index, at.index), hi = Math.max(t.end, at.end);
        if (hi - lo > WINDOW) continue;
        const blocked = pairs.some(p => p !== at && p.index > lo && p.end < hi);
        if (blocked) continue;
        const d = hi - lo;
        if (!best || d < best.d) best = { d: d, token: t };
    }
    return best ? best.token : null;
}

function lineOf(text, index) {
    return text.slice(0, index).split('\n').length;
}

// Checks one file's baselines. Returns a list of plain-English faults.
// `counted` is the file's real registered-test count, or null for a file that is
// not a suite (sw.js carries a restatement of one of these baselines in a note).
function checkBaselines(file, text, counted) {
    const faults = [];
    const pairs = findAll(PAIR, text);
    const totals = findAll(TOTAL, text);
    const deltas = findAll(DELTA, text);

    for (const p of pairs) {
        const where = file + ':' + lineOf(text, p.index);
        const pass = Number(p.groups[0]), fail = Number(p.groups[1]);
        const sum = pass + fail;

        const tok = nearest(totals, p, pairs);
        if (!tok) {
            faults.push(where + ' "' + p.raw + '" states no total. Write the total it was '
                + 'measured at ("all N tests:") so the numbers can be checked.');
            continue;
        }
        const stated = Number(tok.groups[0]);
        if (sum !== stated) {
            faults.push(where + ' "' + p.raw + '" sums to ' + sum + ', but the baseline says '
                + 'it was measured at ' + stated + ' tests.');
            continue;
        }
        if (counted === null) continue;         // not a suite file; see the caller
        if (stated !== counted) {
            const d = nearest(deltas, p, pairs);
            if (!d) {
                faults.push(where + ' "' + p.raw + '" was measured at ' + stated + ' tests but '
                    + file + ' registers ' + counted + '. Re-measure, or declare it beside the '
                    + 'baseline: "BASELINE COUNT DELTA: ' + (counted - stated > 0 ? '+' : '')
                    + (counted - stated) + ' <why>".');
            } else if (Number(d.groups[0]) !== counted - stated) {
                faults.push(where + ' declares BASELINE COUNT DELTA: ' + d.groups[0]
                    + ' but the real difference is ' + (counted - stated > 0 ? '+' : '')
                    + (counted - stated) + ' (' + counted + ' registered, ' + stated + ' stated).');
            }
        }
    }
    return faults;
}

function countTests(file) {
    const out = execFileSync(process.execPath,
        [path.join(__dirname, 'count-tests.js'), path.join(ROOT, file)],
        { encoding: 'utf8' });
    const n = Number(String(out).trim());
    assert.ok(Number.isFinite(n) && n > 0, 'count-tests.js gave no count for ' + file);
    return n;
}

// Every file in the repo that carries a baseline. Kept as a scan rather than a list
// so a new guard is covered the day it is written, not the day someone remembers.
function filesWithBaselines() {
    const skip = new Set(['node_modules', '.git', 'test-runs', 'www', 'ios', 'android', 'dist']);
    const found = [];
    (function walk(dir, rel) {
        for (const name of fs.readdirSync(dir)) {
            if (skip.has(name) || name.startsWith('.')) continue;
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            if (st.isDirectory()) { walk(full, rel ? rel + '/' + name : name); continue; }
            if (!/\.(js|json|html|md)$/.test(name)) continue;
            if (name === SELF_SCAN_SKIP) continue;
            const text = fs.readFileSync(full, 'utf8');
            if (!/\d+\s*PASS\s*\/\s*\d+\s*FAIL/.test(text)) continue;
            found.push({ file: rel ? rel + '/' + name : name, text: text });
        }
    })(ROOT, '');
    return found;
}


module.exports = { PAIR, TOTAL, DELTA, WINDOW, findAll, nearest, lineOf,
                   checkBaselines, countTests, filesWithBaselines, ROOT };
