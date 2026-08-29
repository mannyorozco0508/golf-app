// ============================================================================
// DELETED CONTROLS MUST STAY GUARDED
//
// Retiring the legacy Nassau editor deleted four form controls but left live
// code referencing them. Two of those references were unguarded and would have
// thrown on any legacy round:
//
//     getElementById('nassau-press-rule').options[...].text   -> Review crashed
//     parseFloat(getElementById("nassau-stake").value)        -> Save crashed
//
// The whole test suite was green at the time. Byte counts and hashes caught the
// problem; the tests did not. This file exists so the next deletion cannot
// repeat that.
//
// WHAT IT CHECKS: any `getElementById('x').value` where 'x' is not in the page's
// static markup, and the access is not guarded on the same line.
//
// WHAT IT DELIBERATELY DOES NOT CHECK - the limits are the point:
//
//   * Elements injected through template literals are IGNORED. A page that
//     builds `<input id="row-${i}">` at runtime is legitimate dynamic DOM, and
//     flagging it would make this test noise that people learn to skip.
//   * Guarding is judged per LINE. A guard three lines earlier reads as
//     unguarded here. That is deliberately conservative: a false alarm costs a
//     comment, a missed one costs a crash on a golfer's phone.
//   * It reasons about SOURCE TEXT, not runtime. It cannot prove an element is
//     present when the code runs - only that the markup declares it. The
//     mini-DOM cannot help: getElementById returns a stub for any id, so it
//     would report every element present and prove nothing.
//
// A full-file audit of every `.value` read found 115 across production, 91 of
// them provably safe static controls. Blanket-guarding those was rejected:
// unnecessary guards hide lifecycle bugs and substitute silent bad defaults for
// loud failures. This file guards the bug class instead.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const PAGES = ['admin.html','index.html','sidematches.html','leaderboard.html',
               'stats.html','settlement.html','trip.html','tournament.html',
               'tournament-scorecard.html','skins.html'];

// The controls deleted with the legacy Nassau editor. Every surviving reference
// to these must be guarded, because the elements are simply not there.
const RETIRED_CONTROLS = ['nassau-type','nassau-scoring','nassau-stake','nassau-press-rule'];

// Ids declared in STATIC markup. An id inside a template literal is skipped: an
// odd number of backticks before it means we are inside one.
function staticIds(src) {
    const ids = new Set();
    for (const m of src.matchAll(/id="([^"$]+)"/g)) {
        if ((src.slice(0, m.index).match(/`/g) || []).length % 2 === 0) ids.add(m.group ? m.group(1) : m[1]);
    }
    return ids;
}
// The STATEMENT containing an access, not just its line. Guards legitimately wrap
// across lines:
//
//     || (document.getElementById("nassau-stake")
//             ? (parseFloat(document.getElementById("nassau-stake").value) || 10)
//             : 0);
//
// A per-line window called that unguarded, which was a false positive on correct
// code. Walking back to the previous statement boundary sees the whole expression.
function statementAt(src, i) {
    // Widened twice during development, for two real shapes in this codebase:
    //
    //   1. a ternary guard wrapping across lines
    //   2. `if (x && getElementById('y')) { getElementById('y').value = ... }`
    //      where the access sits inside a block, so stopping at the nearest `{`
    //      cut the window off AFTER the guard and reported correct code as unsafe.
    //
    // Anchoring on the line start and reaching back a couple of lines covers both
    // without pulling in unrelated statements.
    let start = src.lastIndexOf('\n', i);
    for (let back = 0; back < 2 && start > 0; back++) {
        const prev = src.lastIndexOf('\n', start - 1);
        if (prev === -1) break;
        const between = src.slice(prev, start);
        // Stop widening once we cross a statement that clearly ended.
        if (/;\s*$/.test(between) && !/\?\s*$|&&\s*$|\|\|\s*$/.test(between)) break;
        start = prev;
    }
    let end = src.indexOf(';', i);
    const nl = src.indexOf('\n', i);
    if (end === -1 || (nl !== -1 && nl < end && !/[?&|(]\s*$/.test(src.slice(i, nl)))) end = nl;
    return src.slice(start + 1, end === -1 ? src.length : end + 1);
}
const lineAt = (src, i) => statementAt(src, i);

// Guarded means: the same line tests THIS element for existence before using it.
//
// The first version of this accepted any line containing '&&', '||' or starting
// with 'if (' as long as the id appeared somewhere. That was too loose: sabotaging
// the real guards produced lines that still matched, and two negative controls
// passed when they should have failed. The check now requires an existence test on
// the element itself - the lookup appearing WITHOUT `.value` attached - which is
// what a guard actually looks like.
function isGuarded(line, id) {
    const lookups = [`getElementById("${id}")`, `getElementById('${id}')`];
    // A bare lookup: the id fetched and tested, not immediately dereferenced.
    const testedForExistence = lookups.some(look => {
        let i = line.indexOf(look);
        while (i !== -1) {
            const after = line.slice(i + look.length);
            // `getElementById('x')` followed by `)`, ` &&`, ` ?`, `)` etc - not `.something`
            if (!after.startsWith('.')) return true;
            i = line.indexOf(look, i + 1);
        }
        return false;
    });
    if (!testedForExistence) return false;
    // Normalise whitespace before looking for the conditional: a guard may wrap,
    // putting the `?` on its own line, which a raw ' ? ' search would miss.
    const flat = line.replace(/\s+/g, ' ');
    return flat.includes(' ? ') || flat.includes('&&') || flat.trim().startsWith('if (')
        || /\)\s*\?/.test(line);
}

// Every `.value` access whose id is absent from static markup and unguarded.
function unguardedGhostAccesses(file) {
    const src = read(file);
    const ids = staticIds(src);
    const out = [];
    for (const m of src.matchAll(/document\.getElementById\((["'])([^"']+)\1\)\.value/g)) {
        const id = m[2];
        if (ids.has(id)) continue;
        const line = lineAt(src, m.index);
        if (!isGuarded(line, id)) out.push({ file, id, line: line.trim().slice(0, 100) });
    }
    return out;
}
// Any access at all - read or write - to a named control.
function accessesTo(file, id) {
    const src = read(file);
    const out = [];
    ['"', "'"].forEach(q => {
        const needle = `getElementById(${q}${id}${q})`;
        let i = src.indexOf(needle);
        while (i !== -1) {
            out.push(lineAt(src, i));
            i = src.indexOf(needle, i + 1);
        }
    });
    return out;
}

// ============================================================================

describe('THE RETIRED NASSAU CONTROLS ARE GONE AND STAY GUARDED', () => {

    RETIRED_CONTROLS.forEach(id => {
        test(`${id} is absent from every page's markup`, () => {
            PAGES.forEach(p => {
                assert.ok(!staticIds(read(p)).has(id),
                    id + ' reappeared in ' + p + '. If that was deliberate, this test ' +
                    'should be updated - but check every reference to it first.');
            });
        });

        test(`every surviving reference to ${id} is guarded`, () => {
            // Writes count too. The Save crash was a write:
            //   parseFloat(getElementById("nassau-stake").value)
            PAGES.forEach(p => {
                accessesTo(p, id).forEach(line => {
                    const usesIt = /\.(value|options|textContent|innerHTML|checked|style|selectedIndex)/.test(line);
                    if (!usesIt) return;
                    assert.ok(isGuarded(line, id),
                        p + ': unguarded access to the deleted control "' + id + '"\n  ' + line.trim().slice(0, 140));
                });
            });
        });
    });

    test('the legacy round-format data fields are still READ — deletion was UI-only', () => {
        // The controls went; the saved values did not. An old round still carries
        // nassauStake and still settles from it.
        assert.match(read('settlement-engine.js'), /data\.nassauStake/);
        assert.match(read('money-engine.js'), /nassauFrontStake/);
        assert.match(read('admin.html'), /loadedLegacyNassau/,
            'admin still captures an old round\u2019s Nassau settings for Review');
    });
});

describe('NO PAGE READS .value FROM AN ELEMENT THAT DOES NOT EXIST', () => {

    PAGES.forEach(p => {
        test(`${p} has no unguarded ghost .value access`, () => {
            const ghosts = unguardedGhostAccesses(p);
            assert.deepEqual(ghosts.map(g => g.id + ' :: ' + g.line), [],
                p + ' reads .value from an id that is not in its static markup. Either ' +
                'the element was deleted and this reference was missed, or the id is ' +
                'built dynamically - in which case guard the access.');
        });
    });

    test('across every page, the total is zero', () => {
        const all = PAGES.flatMap(unguardedGhostAccesses);
        assert.equal(all.length, 0,
            all.map(g => g.file + ': ' + g.id).join('\n'));
    });
});

describe('THE DETECTOR ACTUALLY DETECTS', () => {

    // Without these, the suite above could pass by doing nothing at all - which is
    // exactly how the original crashes slipped through a green run.

    test('it flags an unguarded read of a nonexistent id', () => {
        const src = 'const x = document.getElementById("no-such-control").value;';
        const ids = staticIds(src);
        assert.ok(!ids.has('no-such-control'));
        assert.ok(!isGuarded(src, 'no-such-control'), 'a bare read must not read as guarded');
    });

    test('it accepts a guarded access to a nonexistent id', () => {
        [
            'if (document.getElementById("gone")) { document.getElementById("gone").value = 1; }',
            'const v = document.getElementById("gone") ? document.getElementById("gone").value : 0;',
            'if (data.x && document.getElementById("gone")) document.getElementById("gone").value = data.x;',
        ].forEach(line => assert.ok(isGuarded(line, 'gone'), 'should be guarded: ' + line));
    });

    test('it does not flag an element that IS in static markup', () => {
        const src = '<input id="real-one"><script>const v = document.getElementById("real-one").value;</script>';
        assert.ok(staticIds(src).has('real-one'));
    });

    test('it ignores ids built in template literals', () => {
        // The documented limitation, asserted so it cannot change silently.
        const src = 'const html = `<input id="row-${i}">`;';
        assert.equal(staticIds(src).size, 0,
            'template-literal ids must not be treated as static markup');
    });

    test('a bare lookup with || is NOT a guard', () => {
        // The exact shape that let a sabotaged nassau-stake pass: the id appears,
        // and so does '||', but nothing tests whether the element exists.
        const line = '|| parseFloat(document.getElementById("nassau-stake").value) || 10;';
        assert.ok(!isGuarded(line, 'nassau-stake'));
    });

    test('an if() testing something ELSE is NOT a guard', () => {
        // The shape that let a sabotaged nassau-scoring pass.
        const line = 'if (data.nassauScoring) { document.getElementById("nassau-scoring").value = data.nassauScoring; }';
        assert.ok(!isGuarded(line, 'nassau-scoring'));
    });

    test('a guard on a different line does NOT count', () => {
        // Conservative by design: a false alarm costs a comment, a missed one
        // costs a crash on a golfer\u2019s phone.
        const line = 'document.getElementById("gone").value = 1;';
        assert.ok(!isGuarded(line, 'gone'));
    });
});

describe('THIS BATCH CHANGED NO PRODUCTION CODE', () => {

    test('the 91 safe static reads were left alone', () => {
        // Blanket optional chaining was rejected. Spot-check that ordinary reads
        // of real controls are still plain and unguarded, as they should be.
        const src = read('admin.html');
        ['game-format-select','round-length-select','hole-bet-stake'].forEach(id => {
            assert.ok(staticIds(src).has(id), id + ' must exist in markup');
            assert.ok(src.includes(`getElementById("${id}").value`),
                id + ' should still be read plainly - it is always present');
        });
    });

    test('no optional chaining crept into the audited pages', () => {
        ['admin.html','sidematches.html'].forEach(p => {
            assert.ok(!/getElementById\([^)]*\)\?\./.test(read(p)),
                p + ' gained optional chaining; guards should be deliberate, not blanket');
        });
    });
});
