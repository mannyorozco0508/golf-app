// ============================================================================
// TWO CARD GUARDS: NO ROUND IS SAVED WITHOUT HOLES, AND NO ROUND WITH HOLES IS
// STOPPED (hotfix, approved 2026-10-07)
//
// main 256fab1 fixed the case that hit round ZNBLP8: a BUILT-IN course whose
// shared record was a name-only stub now saves the built-in's 18 holes. What it
// left, measured against main 05fd3a0: a shared record with NO card and NO
// built-in behind it - an online import whose card has not arrived on bad
// signal, or a record carrying tees but no holes - still built `.data || []`,
// an EMPTY card, and Save had no refusal for one.
//
//   GUARD 1  previewCourseData refuses that record: "this course has no hole
//            card yet. Check your signal and pick the course again, or tick
//            Review / Edit Course Pars & Handicaps and type the pars."
//   GUARD 2  saveSettings refuses an empty card, whatever produced it, with the
//            same sentence. It tests the card and nothing else.
//
// THE OTHER HALF, which Manny asked for in so many words: the refusal must not
// block a round that HAS holes. So every way a card is built is held to building
// one - 18 holes, front nine, back nine, Thistle pairings and a single nine, a
// typed card, a course typed in by name, a loaded shared record, and main's
// built-in-over-stub fix.
//
// What mini-dom cannot drive - Save itself, the note on screen, the button
// coming back, nothing written - tools/course-card-guard-check.js does in
// Chrome, including GUARD 2 alone with GUARD 1 switched off.
//
// BASELINE (all 13 tests) against main 05fd3a0's admin.html: 8 pass / 5 fail.
// The 5: both GUARD 1 tests, GUARD 2, and the two source pins that need the new
// sentence and guard to exist. The 8 that pass on main and on the fix are every
// "has holes" test, the KP reader and main's own fix - unchanged by the guards,
// which is the point. On the fix: 13 / 0.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

function preview(courseKey, opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    vm.runInContext('globalCourses = ' + JSON.stringify(opts.globals || {}), sb);
    const set = (id, prop, val) => { sb.document.getElementById(id)[prop] = val; };
    set('course-select', 'value', courseKey);
    set('course-search-input', 'value', opts.typed || '');
    set('enable-custom-course', 'checked', !!opts.grid);
    set('round-length-select', 'value', opts.length || '18');
    if (opts.front) set('front-nine-select', 'value', opts.front);
    if (opts.back) set('back-nine-select', 'value', opts.back);
    if (opts.grid) for (let i = 1; i <= 18; i++) { set('c-par-' + i, 'value', String(opts.grid[i - 1])); set('c-hcp-' + i, 'value', String(i)); }
    return JSON.parse(JSON.stringify(vm.runInContext('previewCourseData(' + JSON.stringify(courseKey) + ')', sb)));
}
const holes = (out) => (out && out.data ? out.data.length : 0);
const NO_CARD = /this course has no hole card yet\. Check your signal and pick the course again, or tick .*Review \/ Edit Course Pars & Handicaps and type the pars\./;

// ---- GUARD 1 ------------------------------------------------------------------
test('GUARD 1: an imported course whose card has not loaded (name-only stub, no built-in) is refused, not built empty', () => {
    const out = preview('gca_zzguard', { globals: { gca_zzguard: { name: 'Zed Links' } } });
    assert.strictEqual(out.ok, false, 'built ' + holes(out) + ' holes from a stub');
    assert.ok(NO_CARD.test(out.reason), out.reason);
});

test('GUARD 1: a shared record with tees but no hole card is refused the same way', () => {
    const out = preview('gca_teesonly', { globals: { gca_teesonly: { name: 'Tees Only GC', tees: { male: [{ name: 'Blue', rating: 70, slope: 120 }] } } } });
    assert.strictEqual(out.ok, false);
    assert.ok(NO_CARD.test(out.reason), out.reason);
});

// ---- GUARD 2 (source; the behaviour is the Chrome check's) ----------------------
test('GUARD 2: Save refuses an empty card with the same sentence, testing the card and nothing else', () => {
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    const at = src.indexOf('const preview = previewCourseData(courseKey);');
    assert.ok(at > 0, 'positive: the save path');
    const save = src.slice(at, at + 2600);
    assert.ok(/if \(!Array\.isArray\(finalCourseData\) \|\| finalCourseData\.length === 0\) \{\s*uiRefuse\('\\u26A0\\uFE0F Course card problem: ' \+ NO_HOLE_CARD\);\s*return;\s*\}/.test(save),
        'the empty-card refusal is missing or tests something other than the card');
    // It sits AFTER the existing-round branch, so a re-save keeps its own card first.
    assert.ok(save.indexOf('loadedCourseData && courseKey === loadedCourseKey') < save.indexOf('finalCourseData.length === 0'));
});

// ---- A ROUND WITH HOLES IS NEVER STOPPED ---------------------------------------
test('has holes: every built-in Myrtle and Ridgefield course, with its shared record still a stub (main\'s fix kept)', () => {
    ['caledonia', 'trueblue', 'pinelakes', 'pinehills', 'manofwar', 'swwa_trimountain'].forEach((k) => {
        const out = preview(k, { globals: { [k]: { name: k } } });
        assert.ok(out.ok && holes(out) === 18, k + ': ' + holes(out) + ' holes, reason ' + out.reason);
    });
});

test('has holes: a LOADED shared record (an import) builds its own card', () => {
    const card = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const out = preview('gca_loaded', { globals: { gca_loaded: { name: 'Loaded GC', data: card } } });
    assert.ok(out.ok && holes(out) === 18, out.reason);
});

test('has holes: front nine and back nine rounds', () => {
    const front = preview('caledonia', { length: 'front' });
    const back = preview('caledonia', { length: 'back' });
    assert.ok(front.ok && holes(front) === 9, 'front ' + holes(front));
    assert.ok(back.ok && holes(back) === 9 && back.data[0].hole === 10, 'back ' + holes(back));
});

test('has holes: Thistle - all three official pairings, and a single nine', () => {
    [['stewart', 'mackay'], ['mackay', 'cameron'], ['cameron', 'stewart']].forEach(([f, b]) => {
        const out = preview('thistle_27', { front: f, back: b });
        assert.ok(out.ok && holes(out) === 18, f + '/' + b + ': ' + holes(out));
    });
    const nine = preview('thistle_27', { front: 'cameron', back: 'none' });
    assert.ok(nine.ok && holes(nine) === 9, 'single nine: ' + holes(nine));
});

test('has holes: a card the organizer typed (Review / Edit Course Pars ticked)', () => {
    const grid = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
    const out = preview('caledonia', { grid });
    assert.ok(out.ok && holes(out) === 18, out.reason);
    assert.strictEqual(out.data[3].par, 5, 'the typed card, not the built-in');
});

test('has holes: a course typed in by name with no key, card filled in', () => {
    const grid = Array.from({ length: 18 }, () => 4);
    const out = preview('', { typed: 'Joe\'s Muni', grid });
    assert.ok(out.ok && holes(out) === 18, out.reason);
});

test('the KP auto-fill reads a refusal as "no card", as it always read an empty one', () => {
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    assert.ok(/if \(!preview \|\| !preview\.ok \|\| !preview\.data \|\| !preview\.data\.length\) return \{ ok: false, holes: \[\] \};/.test(src));
});

test('a refusal cannot leave Save dead: the button is put back by the finally block, not by each refusal', () => {
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    // Sliced from saveSettings to the NEXT top-level function, not to the first
    // closing brace - the first draft cut off three hundred lines early.
    const at = src.indexOf('async function saveSettings()');
    assert.ok(at > 0, 'positive: saveSettings');
    const body = src.slice(at, src.indexOf('\n    function ', at + 30));
    assert.ok(body.indexOf('GUARD 2') > 0, 'positive: the slice contains guard 2');
    assert.ok(/let handedOff = false;/.test(body) && /\} finally \{[\s\S]*?if \(saveBtn && !handedOff\) \{\s*saveBtn\.innerText = originalText;\s*saveBtn\.disabled = false;/.test(body), 'the finally restore is gone');
    assert.ok(body.indexOf('GUARD 2') < body.indexOf('} finally {'), 'guard 2 sits inside the try the finally closes');
});

test('the one sentence is defined once and says what to do', () => {
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    assert.strictEqual((src.match(/const NO_HOLE_CARD = /g) || []).length, 1);
    assert.ok(/pick the course again/.test(src) && /type the pars/.test(src));
});

test('main\'s own fix is still the first line of defence: built-in beats a stub (myrtle_course_card_test.js holds it too)', () => {
    const out = preview('caledonia', { globals: { caledonia: { name: 'Caledonia Golf & Fish Club' } } });
    assert.ok(out.ok && holes(out) === 18);
});
