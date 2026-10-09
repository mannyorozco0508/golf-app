// ============================================================================
// THE PLAYERS COLUMN HEADER SAYS WHAT THE SWITCH SAYS (2026-10-08)
//
// The setup screen has one control that decides what the number in each
// handicap box IS - "Strokes (use as typed)" or "GHIN Index (adjust by tee)" -
// and the box's own placeholder has followed it since Wave 37. THE COLUMN
// HEADER ABOVE THOSE BOXES DID NOT: it was the literal string "Index" in all
// three branches of the header builder, so a Strokes round - which is the
// DEFAULT for a new round - showed "Index" over numbers the app uses exactly as
// typed.
//
// That is the same defect handicap-labels.js was written to kill. Its own
// header says so: "admin.html's setup row hardcoded 'Index' - wrong on every
// strokes round". The placeholder was fixed then and the header was missed.
//
// A golfer typing 11 into a box under a heading that says Index has been told
// the app will convert it, and on a strokes round it will not.
//
// BASELINE, against pre-wave main d6dbb45 (admin.html sha 8fe6a913fa7eddca on
// that tree), all 4 tests: 1 PASS / 3 FAIL. The one green is handicap-labels.js
// still answering 'as-entered' -> Strokes and anything else -> Index: that
// helper was already right before this wave, and the defect was that the
// Players header never asked it. A guard with no passing assertion here would
// not be able to tell a missing helper from an unused one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ADMIN = read('admin.html');

describe('THE HEADER FOLLOWS THE SWITCH', () => {

    test('no branch of the header builder hardcodes the word', () => {
        const at = ADMIN.indexOf('function renderPlayerListHeaderAndWarning');
        assert.notEqual(at, -1, 'the header builder is gone');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 400, 'the builder did not slice - this test is guarding nothing');
        const headers = [...fn.matchAll(/headerRow\.innerHTML = `([^`]*)`/g)].map((m) => m[1]);
        assert.equal(headers.length, 3, 'expected three header branches, found ' + headers.length);
        headers.forEach((h, i) => {
            assert.doesNotMatch(h, /<span>Index<\/span>/,
                'header branch ' + (i + 1) + ' still hardcodes Index: ' + h);
            assert.match(h, /\$\{hcpHead\}|handicapSetupBoxLabel\(\)/,
                'header branch ' + (i + 1) + ' does not ask what the box is called: ' + h);
        });
        // POSITIVE: the branches still build a header at all.
        headers.forEach((h) => assert.match(h, /<span>Name<\/span>/, 'a branch lost the Name column'));
    });

    test('and the label comes from the one place that decides it', () => {
        const at = ADMIN.indexOf('function renderPlayerListHeaderAndWarning');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 10));
        assert.match(fn, /handicapSetupBoxLabel\(\)/,
            'the header invents its own answer instead of asking handicapSetupBoxLabel');
    });

    test('changing the switch redraws the header, not only the boxes', () => {
        // handicapBasisChanged rewrote every placeholder and left the header
        // alone - so the two said different things on the same screen until
        // something else happened to re-render.
        const at = ADMIN.indexOf('function handicapBasisChanged');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 100, 'handicapBasisChanged did not slice');
        assert.match(fn, /renderPlayerListHeaderAndWarning\(/,
            'flipping the switch does not redraw the column header');
    });

    test('the two possible words are still the two words', () => {
        // handicap-labels.js owns them; if that ever changes, this says so
        // rather than letting the header drift to a third spelling.
        const labels = read('handicap-labels.js');
        assert.match(labels, /'as-entered' \? 'Strokes' : 'Index'/,
            'handicapBoxPlaceholder no longer answers Strokes/Index');
    });
});
