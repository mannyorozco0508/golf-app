// ============================================================================
// ONE calculateMatchEngine — THE PARITY CORPUS
//
// v218 deleted two page-local copies of calculateMatchEngine in favour of one
// canonical implementation in match-engine.js. This file is the evidence that
// the deletion was safe, and the tripwire that keeps it safe.
//
// IT HAS TWO JOBS, AND THEY OUTLIVE THE WAVE IN DIFFERENT WAYS.
//
// 1. EVERY COPY IN THE REPO AGREES. The suite DISCOVERS each file that declares
//    calculateMatchEngine and runs the whole corpus through it, comparing full
//    returns against the canonical one. Before the deletion that was three
//    files (money-engine.js, index.html, stats.html) and this is the measurement
//    that proved they agreed: 3 copies, 13 fixtures, 0 disagreements at ae22953.
//    After the deletion there is one copy, so this half has nothing left to
//    compare - which is exactly why `there is exactly ONE` is asserted in the
//    same file. Reintroduce a page copy and it is picked up automatically and
//    has to agree.
//
// 2. THE CANONICAL ENGINE'S OWN ARITHMETIC IS PINNED. Job 1 goes quiet once
//    there is a single copy, and a suite that cannot fail is not a guard. So
//    helpers/match-engine-golden.json carries every fixture's money, press
//    count, segment count, final results and hole-by-hole winners - the numbers
//    three copies agreed on BEFORE the deletion. Any drift in match-engine.js
//    fails here even though the parity half is silent.
//
// The corpus itself lives in helpers/match-engine-corpus.js, shared with
// tools/match-engine-golden.js, because a generator and an assertion that
// describe different rounds prove nothing about each other.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { FIXTURES, argsFor, normalise, KNOWN_DIVERGENCES } = require('./helpers/match-engine-corpus.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// ---------------------------------------------------------------------------
// WHICH FILES DECLARE IT. Discovered, never listed: a hand-written list is a
// claim about the repo that goes stale silently, and the whole reason this wave
// existed was that exactly such a list had drifted for three releases.
// ---------------------------------------------------------------------------
function declaringFiles() {
    return fs.readdirSync(REPO_ROOT)
        .filter(f => /\.(html|js)$/.test(f))
        .filter(f => !/_test\.js$|\.test\.js$/.test(f))
        .filter(f => /function\s+calculateMatchEngine\s*\(/.test(read(f)))
        .sort();
}

function canonicalEngine() {
    const owner = declaringFiles().find(f => f.endsWith('.js'));
    assert.ok(owner, 'no .js file declares calculateMatchEngine');
    const sb = loadJsFile(owner, ['handicap.js', 'text-safe.js']);
    assert.equal(typeof sb.calculateMatchEngine, 'function',
        owner + ' must define calculateMatchEngine');
    return { name: owner, fn: sb.calculateMatchEngine };
}

// A page's OWN copy, in a realm built from that page's REAL <script> tags.
// NO extra dependencies are passed. loadHtmlInlineScript loads the page's tags
// and then any extras on top, and the extras are how stats.html came to be
// tested with a money-engine.js it does not actually load. If a page needs a
// module it has to declare it, and a missing tag must surface here as the
// ReferenceError a browser would throw.
const realms = {};
function pageEngine(page) {
    if (!realms[page]) realms[page] = loadHtmlInlineScript(page);
    return vm.runInContext(
        'typeof calculateMatchEngine === "function" ? calculateMatchEngine : null', realms[page]);
}

describe('calculateMatchEngine — one copy, and every copy agrees', () => {

    test('there is exactly ONE declaration of calculateMatchEngine in the repo', () => {
        // v218's whole point. At ae22953 this was three, and the two page copies
        // had drifted: both escaped the winner name inside finalResult, index.html
        // returned a dead pressesByHole, stats.html dropped t1Players/t2Players.
        const files = declaringFiles();
        assert.deepEqual(files, ['match-engine.js'],
            'expected match-engine.js alone to declare calculateMatchEngine, found: ' + files.join(', '));
    });

    test('the canonical copy is UNESCAPED — escaping belongs at the sinks', () => {
        // The page copies wrapped winnerName in escapeHtml() INSIDE the engine.
        // That protected finalResult and left t1Name, t2Name and holeWinner raw in
        // the same render - index.html:9262 escaped the closed-match arm of a
        // ternary and left the live arm open, both into the same innerHTML. It was
        // a half-applied guard, not a safety net. Escaping moved to the callers,
        // where it can cover the team names too; the engine returns plain text.
        const { name } = canonicalEngine();
        const line = read(name).split('\n').find(l => /m\.finalResult\s*=/.test(l));
        assert.ok(line, 'no finalResult assignment found in ' + name);
        assert.ok(!/escapeHtml/.test(line),
            'the canonical engine must not escape; the sinks do. Found: ' + line.trim());
        assert.match(line, /\$\{winnerName\}/);
    });

    test('pressesByHole is gone, and nothing anywhere looks for it', () => {
        // index.html's copy built it and returned it, and NOTHING read it -
        // measured across every .html and .js in the repo before deleting.
        // Deleted outright rather than carried into the canonical return.
        // COMMENTS STRIPPED FIRST. match-engine.js and money-engine.js both name
        // pressesByHole in prose, recording what was deleted and why - that is the
        // history, not the key. A test that matched the bare word would fail on its
        // own documentation and be "fixed" by deleting the explanation.
        const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const hits = fs.readdirSync(REPO_ROOT)
            .filter(f => /\.(html|js)$/.test(f))
            .filter(f => !/_test\.js$|\.test\.js$/.test(f))
            .filter(f => /pressesByHole/.test(codeOnly(read(f))));
        assert.deepEqual(hits, [], 'pressesByHole came back in: ' + hits.join(', '));
    });

    test('the canonical return still carries t1Players and t2Players', () => {
        // THE REGRESSION THIS REPLACES A PAGE-LEVEL GUARD FOR. wave4_finish_test.js
        // pinned index.html's return literal because omitting these two crashed
        // computeRoundMoneyByPlayer outright the first time the scorecard asked for
        // settlement. index.html no longer has a return literal to pin, so the
        // assertion moved to the one engine that does - and it is asserted on the
        // ACTUAL RETURN, not on source text, which is stricter.
        const { fn } = canonicalEngine();
        const r = normalise(fn.apply(null, argsFor(FIXTURES[0])));
        // normalise() strips them, so read the raw return for this one.
        const raw = fn.apply(null, argsFor(FIXTURES[0]));
        assert.ok(Array.isArray(raw.t1Players) && Array.isArray(raw.t2Players),
            'computeRoundMoneyByPlayer reads both of these');
        assert.ok(raw.t1Players.length > 0 && raw.t2Players.length > 0);
        assert.equal(typeof r.t1TotalMoney, 'number');
    });

    describe('every declaring file agrees with the canonical engine', () => {
        // Job 1. Quiet while there is one copy - which the assertion above
        // guarantees - and automatic the moment a copy reappears.
        const { name: canonName, fn: canon } = canonicalEngine();
        const others = declaringFiles().filter(f => f !== canonName);

        test('the discovery ran and produced a comparable canonical engine', () => {
            assert.equal(typeof canon, 'function');
            assert.ok(Array.isArray(others));
        });

        test('NO FOURTH DIVERGENCE: only the known fields ever differed', () => {
            // The assertion that made the deletion safe to do at all. Rather than
            // deep-equal after normalising - which can only say "something
            // differs" - this walks every leaf path of both returns and NAMES the
            // paths that disagree, then holds that set against the recorded list.
            //
            // It is what corrected this wave's own recon. The first measurement
            // normalised activeMatches[].finalResult alone and reported the
            // remaining difference as unexplained, because the holeLog copies
            // finalResult into totRes, f9Res and b9Res. One divergence, four
            // fields - and a fifth field appearing here now fails by name instead
            // of being absorbed into a normaliser.
            const leaves = (o, pre, out) => {
                out = out || {};
                if (o && typeof o === 'object') Object.keys(o).forEach(k => leaves(o[k], pre ? pre + '.' + k : k, out));
                else out[pre] = o;
                return out;
            };
            const generalise = (k) => k.replace(/\.\d+\./g, '.N.').replace(/^(\w+)\.\d+$/, '$1.N')
                                       .replace(/\.\d+$/, '.N');
            const seen = new Set();
            others.forEach(other => {
                const fn = other.endsWith('.html') ? pageEngine(other)
                    : loadJsFile(other, ['handicap.js', 'text-safe.js']).calculateMatchEngine;
                FIXTURES.forEach(f => {
                    const a = leaves(JSON.parse(JSON.stringify(canon.apply(null, argsFor(f)))));
                    const b = leaves(JSON.parse(JSON.stringify(fn.apply(null, argsFor(f)))));
                    new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => {
                        if (String(a[k]) !== String(b[k])) seen.add(generalise(k));
                    });
                });
            });
            // Every observed path must be covered by a recorded divergence. The
            // recorded list may be wider than what a given repo state exhibits -
            // once the page copies are gone `others` is empty and nothing is
            // observed at all - but nothing UNRECORDED may appear.
            const unexplained = [...seen].filter(k =>
                !KNOWN_DIVERGENCES.some(d => k === d || k.startsWith(d + '.')));
            assert.deepEqual(unexplained, [],
                'calculateMatchEngine copies differ on fields v218 did not account for: '
                + unexplained.join(', '));
        });

        others.forEach(other => {
            FIXTURES.forEach(f => {
                test(other + ' agrees with ' + canonName + ' on: ' + f.label, () => {
                    const fn = other.endsWith('.html')
                        ? pageEngine(other)
                        : loadJsFile(other, ['handicap.js', 'text-safe.js']).calculateMatchEngine;
                    assert.equal(typeof fn, 'function', other + ' did not yield the function');
                    assert.deepEqual(normalise(fn.apply(null, argsFor(f))),
                                     normalise(canon.apply(null, argsFor(f))));
                });
            });
        });
    });

    describe('the canonical engine\'s recorded arithmetic', () => {
        // Job 2, and the half that keeps this file load-bearing forever.
        const { fn: canon } = canonicalEngine();
        const GOLDEN = require('./helpers/match-engine-golden.json');

        FIXTURES.forEach(f => {
            test('unchanged: ' + f.label, () => {
                const g = GOLDEN[f.label];
                assert.ok(g, 'no golden recorded for "' + f.label + '"');
                const r = normalise(canon.apply(null, argsFor(f)));
                assert.equal(r.t1TotalMoney, g.t1TotalMoney, 't1TotalMoney moved');
                assert.equal(r.pressCount, g.pressCount, 'pressCount moved');
                assert.equal(r.activeMatches.length, g.segments, 'segment count moved');
                assert.equal(r.maxThru, g.maxThru, 'maxThru moved');
                assert.equal(r.usesRelativeHandicap, g.usesRelativeHandicap);
                assert.equal(r.matchBaseline, g.matchBaseline, 'the handicap baseline moved');
                assert.deepEqual(r.activeMatches.map(m => m.finalResult || ''), g.finalResults);
                // The hole-by-hole winners - the field the Aloha settles against.
                assert.deepEqual(Object.keys(r.holeLog).map(h => r.holeLog[h].holeWinner),
                                 g.holeWinners);
            });
        });

        test('the golden corpus covers every fixture, with nothing left over', () => {
            // A golden file with a stale entry is a golden file nobody is reading.
            assert.deepEqual(Object.keys(GOLDEN).sort(), FIXTURES.map(f => f.label).sort());
        });

        test('the corpus can actually express an escaping difference', () => {
            // THE FIXTURE FAULT THAT NEARLY SHIPPED THIS WAVE'S RECON WRONG.
            // finalResult interpolates the winning team's FIRST TOKEN. The first
            // version of this measurement used "Mike & Dave" - first token "Mike",
            // nothing to escape - and reported the drifting copies as identical.
            // A corpus that cannot express the difference under test would report
            // agreement forever, so assert it can.
            const raw = JSON.stringify(FIXTURES.map(f => f.players.map(p => p.name)));
            assert.match(raw, /'/, 'no apostrophe in any fixture name');
            assert.match(raw, /&/, 'no ampersand in any fixture name');
            assert.match(raw, /</, 'no angle bracket in any fixture name');
            // And at least one recorded finalResult must contain a raw character
            // that escaping would have changed - proof the corpus reaches the line.
            const results = JSON.stringify(Object.values(GOLDEN).map(g => g.finalResults));
            assert.ok(/[&<']/.test(results.replace(/\\"/g, '')),
                'no golden finalResult carries an escapable character');
        });
    });
});
