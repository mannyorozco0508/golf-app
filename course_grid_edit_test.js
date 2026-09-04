// ============================================================================
// MANUAL COURSE GRID — EDITS MUST SURVIVE, AND A COMPLETED CARD MUST BE VALID
//
// THE BUG. For an unmapped course, admin.html's document-level click listener ran:
//
//     } else if (getCourseNameById(courseHiddenSelect.value, globalCourses) !== typedVal) {
//         courseHiddenSelect.value = ""; handleCourseChange();
//
// courseHiddenSelect.value is "" forever for an unmapped course, so
// getCourseNameById("") could never equal the typed name and that branch fired on
// EVERY click anywhere outside the course box - including every tap into a Par or
// HCP cell, and the Next button itself. Each firing re-ran handleCourseChange(),
// whose seed loop stamps all 36 inputs back to par 4 / hcp 1-18 unconditionally.
// The DOM was the only state, so nothing the golfer typed survived a single tap.
//
// THE FIX, in two layers:
//   B  the click branch also requires the course IDENTITY to have changed, so it
//      fires on a genuine course switch rather than on every tap.
//   A  handleCourseChange() repaints the grid only when the identity changed, so
//      even a redundant call cannot destroy valid entered values.
//
// Layer A is what these tests exercise directly, and it is the layer that protects
// the data: any future caller of handleCourseChange is now harmless. Layer B is
// pinned at source, because the repo harness's document.addEventListener is a no-op
// (helpers/mini-dom.js) and cannot dispatch the click. The full click-to-revert
// lifecycle was reproduced and re-verified in a real DOM outside the repo; jsdom is
// deliberately not added as a dependency.
//
// VALIDATION is new. The app had no par constraint anywhere and the old capture read
// `parseInt(...) || 4` / `|| i`, so a blank or mistyped cell silently became par 4 or
// a stroke index equal to the hole number - a plausible-looking course that was not
// the one played, feeding wrong strokes into money games.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('admin.html');
const codeOf = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const SRC_CODE = codeOf(SRC);
const E = loadJsFile('money-engine.js');

function page() {
    return loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
}
const run = (sb, code) => vm.runInContext(code, sb);
const val = (sb, expr) => { run(sb, `window.__v = ${expr};`); return sb.window.__v; };

// A real browser coerces input.value to a string; the repo's mini-dom hands back
// whatever was assigned, so a seeded numeric 4 arrives as 4 rather than '4'. Normalise
// here so these tests assert on the VALUE the golfer sees, not on the harness's typing.
const par = (sb, n) => String(val(sb, `document.getElementById('c-par-${n}').value`));
const hcp = (sb, n) => String(val(sb, `document.getElementById('c-hcp-${n}').value`));
const setPar = (sb, n, v) => run(sb, `document.getElementById('c-par-${n}').value = ${JSON.stringify(String(v))};`);
const setHcp = (sb, n, v) => run(sb, `document.getElementById('c-hcp-${n}').value = ${JSON.stringify(String(v))};`);

const seed = (sb, name) => run(sb,
    `courseSearchInput.value = ${JSON.stringify(name)}; courseHiddenSelect.value = ''; handleCourseChange();`);
// The redundant call the outside-click used to make. Under the fix it must be inert.
const repaintAgain = sb => run(sb, `handleCourseChange();`);
const validate = sb => JSON.parse(val(sb, `JSON.stringify(validateCourseGrid())`));
const capture = sb => JSON.parse(val(sb, `JSON.stringify(captureCourseDataGrid())`));
// A complete, valid card: par 4 everywhere, stroke indexes 1..18 in hole order.
function fillValid(sb) {
    for (let i = 1; i <= 18; i++) { setPar(sb, i, 4); setHcp(sb, i, i); }
}

// ============================================================================
describe('SEEDING AN UNMAPPED COURSE', () => {

    // CONTRACT CHANGED, AND DELIBERATELY. This used to seed par 4 on every hole
    // with stroke indexes 1..18 in hole order, and these tests asserted that.
    // That card is complete, well-formed, passes validateCourseGrid() in full -
    // and is fiction. A golfer could read the red COURSE NOT MAPPED warning, see
    // 36 filled cells, assume the work was done, and save. The invented handicaps
    // then wrote to global_courses, shared with every future golfer on that course.
    //
    // Unmapped courses now seed BLANK. These assertions are stronger than the ones
    // they replace: the old pair only checked that 36 cells held specific numbers,
    // while these check the safety property that nothing plausible-but-false can
    // reach the database by inaction. The blank grid is what makes the existing
    // "Hole 1 is missing a Par" refusal reachable at all.

    test('seeds nothing - every par and stroke index is blank', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        for (let i = 1; i <= 18; i++) {
            assert.equal(par(sb, i), '', 'hole ' + i + ' par must be blank');
            assert.equal(hcp(sb, i), '', 'hole ' + i + ' hcp must be blank');
        }
    });

    test('hole 9 and hole 18 are blank too, not just the visible middle', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        assert.equal(par(sb, 9), '');
        assert.equal(hcp(sb, 9), '');
        assert.equal(par(sb, 18), '');
        assert.equal(hcp(sb, 18), '');
    });

    test('an untouched unmapped card cannot be saved', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        const v = validate(sb);
        assert.equal(v.ok, false, 'a blank card must be refused');
        assert.match(v.message, /Hole 1 is missing a Par/);
    });
});

// ============================================================================
describe('EDITS SURVIVE A REDUNDANT REPAINT', () => {

    test('PAR 4 -> 5 on hole 1 stays 5', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 1, 5);
        repaintAgain(sb);
        assert.equal(par(sb, 1), '5');
    });

    test('HCP 1 -> 7 on hole 1 stays 7', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setHcp(sb, 1, 7);
        repaintAgain(sb);
        assert.equal(hcp(sb, 1), '7');
    });

    test('HOLE 9 survives', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 9, 3); setHcp(sb, 9, 17);
        repaintAgain(sb);
        assert.equal(par(sb, 9), '3');
        assert.equal(hcp(sb, 9), '17');
    });

    test('HOLE 18 survives', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 18, 5); setHcp(sb, 18, 2);
        repaintAgain(sb);
        assert.equal(par(sb, 18), '5');
        assert.equal(hcp(sb, 18), '2');
    });

    test('consecutive FRONT-NINE edits all survive', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        [[1,5],[2,3],[5,5],[9,3]].forEach(([h,p]) => { setPar(sb, h, p); repaintAgain(sb); });
        assert.deepEqual([1,2,5,9].map(h => par(sb, h)), ['5','3','5','3'],
            'an earlier edit must not be undone by a later repaint');
    });

    test('consecutive BACK-NINE edits all survive', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        [[10,5],[13,3],[16,5],[18,3]].forEach(([h,p]) => { setPar(sb, h, p); repaintAgain(sb); });
        assert.deepEqual([10,13,16,18].map(h => par(sb, h)), ['5','3','5','3']);
    });

    test('TEN redundant repaints change nothing', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 1, 5); setHcp(sb, 18, 2);
        for (let i = 0; i < 10; i++) repaintAgain(sb);
        assert.equal(par(sb, 1), '5');
        assert.equal(hcp(sb, 18), '2');
    });

    test('the repaint is guarded on course IDENTITY, not on whether cells look filled', () => {
        assert.match(SRC_CODE, /const identity = currentCourseIdentity\(\);/);
        assert.match(SRC_CODE, /const courseActuallyChanged = \(identity !== lastCourseChangeKey\);/);
        assert.match(SRC_CODE, /if \(courseActuallyChanged\) \{/);
        // Explicitly NOT the heuristic the brief ruled out.
        assert.ok(!/if \([^)]*\.value !== ['"]['"]\)[^\n]*return/.test(SRC_CODE),
            'must not skip repaint merely because inputs are non-empty');
    });

    test('the outside-click branch also requires an identity change', () => {
        assert.match(SRC_CODE, /&& lastCourseChangeKey !== customCourseKeyFor\(typedVal\)/,
            'layer B: the spurious trigger is gated on a real course change');
    });
});

// ============================================================================
describe('MID-EDIT STATES ARE LEFT ALONE', () => {

    test('a temporarily EMPTY cell is not refilled', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 4, '');
        repaintAgain(sb);
        assert.equal(par(sb, 4), '', 'deleting before retyping must not snap back to 4');
    });

    test('a temporarily DUPLICATE stroke index is allowed', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        // The duplicate is now built explicitly. This used to lean on the seed
        // putting SI 7 on hole 7 for free; an unmapped course seeds blank, so the
        // collision has to be typed the way a golfer would type it. Same property
        // under test either way: mid-swap of SI 1 and SI 7, hole 1 becomes 7
        // before hole 7 becomes 1, and a repaint must not "correct" either cell.
        setHcp(sb, 7, 7);
        setHcp(sb, 1, 7);
        repaintAgain(sb);
        assert.equal(hcp(sb, 1), '7');
        assert.equal(hcp(sb, 7), '7', 'both hold 7 mid-swap, and neither is corrected');
    });

    test('nothing validates during editing', () => {
        // validateCourseGrid is called only from wizardNext and the save path.
        const callers = SRC_CODE.split('\n').filter(l => /validateCourseGrid\(\)/.test(l));
        // The definition, captureCourseDataGrid's use, the wizard boundary, and the two
        // save-path branches. Nothing else may call it.
        assert.equal(callers.length, 5, 'unexpected call sites:\n' + callers.join('\n'));
        assert.equal(callers.filter(l => /function validateCourseGrid/.test(l)).length, 1);
        assert.ok(!/oninput="[^"]*validateCourseGrid/.test(SRC));
        assert.ok(!/onblur="[^"]*validateCourseGrid/.test(SRC));
        assert.ok(!/onchange="[^"]*validateCourseGrid/.test(SRC));
    });
});

// ============================================================================
describe('A GENUINE COURSE CHANGE STILL REPAINTS', () => {

    test('a different unmapped course clears the old card', () => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        setPar(sb, 1, 6); setHcp(sb, 1, 12);
        seed(sb, 'Completely Different Muni');
        // Still the point of the original test - a real course switch must not
        // leave the previous course's numbers on screen - but the replacement is
        // now blank rather than a seeded par 4, so the carried-over 6/12 cannot
        // hide inside a card that looks filled in.
        assert.equal(par(sb, 1), '', 'a real change must clear the old card');
        assert.equal(hcp(sb, 1), '');
    });

    test('selecting a MAPPED course replaces the grid with that course\u2019s data', () => {
        const sb = page();
        seed(sb, 'Some Custom Track');
        setPar(sb, 1, 6); setHcp(sb, 1, 12);
        run(sb, `selectCourse('caledonia', 'Caledonia Golf & Fish Club');`);
        // Pinned against the bundled preset rather than a copied constant.
        const preset = val(sb, `JSON.stringify(coursePresets['caledonia'].data)`);
        const data = JSON.parse(preset);
        const h1 = data.find(h => h.hole === 1), h18 = data.find(h => h.hole === 18);
        assert.equal(par(sb, 1), String(h1.par));
        assert.equal(hcp(sb, 1), String(h1.hcpIndex));
        assert.equal(par(sb, 18), String(h18.par));
        assert.equal(hcp(sb, 18), String(h18.hcpIndex));
        assert.notEqual(par(sb, 1), '6', 'the stale custom edit must be gone');
    });

    test('re-selecting the SAME mapped course does not wipe an adjustment', () => {
        const sb = page();
        run(sb, `selectCourse('caledonia', 'Caledonia Golf & Fish Club');`);
        setPar(sb, 3, 6);
        run(sb, `selectCourse('caledonia', 'Caledonia Golf & Fish Club');`);
        assert.equal(par(sb, 3), '6');
    });
});

// ============================================================================
describe('COMPLETED-CARD VALIDATION', () => {

    const bad = (mut) => {
        const sb = page();
        seed(sb, 'Manny Test Links');
        fillValid(sb);
        mut(sb);
        return validate(sb);
    };

    test('a valid 1..18 permutation passes', () => {
        const sb = page(); seed(sb, 'X'); fillValid(sb);
        const r = validate(sb);
        assert.equal(r.ok, true);
        assert.equal(r.data.length, 18);
    });

    test('PAR: blank, non-numeric and out-of-range are blocked', () => {
        assert.match(bad(sb => setPar(sb, 9, '')).message, /Hole 9 is missing a Par/);
        assert.match(bad(sb => setPar(sb, 5, 'abc')).message, /Hole 5 Par must be a whole number/);
        assert.match(bad(sb => setPar(sb, 9, 2)).message, /Hole 9 Par is 2/);
        assert.match(bad(sb => setPar(sb, 18, 7)).message, /Hole 18 Par is 7/);
    });

    test('PAR 3 through 6 are accepted', () => {
        [3, 4, 5, 6].forEach(p => {
            const sb = page(); seed(sb, 'X'); fillValid(sb); setPar(sb, 1, p);
            assert.equal(validate(sb).ok, true, 'par ' + p + ' must be legal');
        });
    });

    test('HCP: blank, non-numeric and out-of-range are blocked', () => {
        assert.match(bad(sb => setHcp(sb, 18, '')).message, /Hole 18 is missing a Handicap/);
        assert.match(bad(sb => setHcp(sb, 4, 'x')).message, /Hole 4 Handicap must be a whole number/);
        assert.match(bad(sb => setHcp(sb, 9, 0)).message, /Hole 9 Handicap is 0/);
        assert.match(bad(sb => setHcp(sb, 18, 19)).message, /Hole 18 Handicap is 19/);
    });

    test('A COMPLETED DUPLICATE is blocked, naming both holes', () => {
        const r = bad(sb => setHcp(sb, 9, 18));
        assert.equal(r.ok, false);
        assert.match(r.message, /Handicap 18 is used on both hole 9 and hole 18/);
    });

    test('a missing stroke index is blocked', () => {
        // Swap hole 1 to 7 without freeing 7 -> 1 is unused and 7 duplicated.
        const r = bad(sb => setHcp(sb, 1, 7));
        assert.equal(r.ok, false);
    });

    test('HOLE 9 and HOLE 18 are inside the validated range', () => {
        assert.equal(bad(sb => setPar(sb, 9, 9)).ok, false, 'hole 9 par checked');
        assert.equal(bad(sb => setHcp(sb, 9, 0)).ok, false, 'hole 9 hcp checked');
        assert.equal(bad(sb => setPar(sb, 18, 9)).ok, false, 'hole 18 par checked');
        assert.equal(bad(sb => setHcp(sb, 18, 0)).ok, false, 'hole 18 hcp checked');
    });
});

// ============================================================================
describe('NO SILENT DEFAULTS AT CAPTURE', () => {

    test('the old fallbacks are gone from the source', () => {
        assert.ok(!/parseInt\(document\.getElementById\(`c-par-\$\{i\}`\)\.value\) \|\| 4/.test(SRC_CODE));
        assert.ok(!/parseInt\(document\.getElementById\(`c-hcp-\$\{i\}`\)\.value\) \|\| i/.test(SRC_CODE));
    });

    test('an invalid PAR does not silently become 4', () => {
        const sb = page(); seed(sb, 'X'); fillValid(sb);
        setPar(sb, 9, '');
        assert.equal(capture(sb), null, 'capture must refuse rather than invent par 4');
    });

    test('an invalid HCP does not silently become the hole number', () => {
        const sb = page(); seed(sb, 'X'); fillValid(sb);
        setHcp(sb, 18, '');
        assert.equal(capture(sb), null, 'capture must refuse rather than invent hcp 18');
    });

    test('capture returns exactly the entered values when valid', () => {
        const sb = page(); seed(sb, 'X'); fillValid(sb);
        setPar(sb, 1, 5); setHcp(sb, 1, 7); setHcp(sb, 7, 1);
        setPar(sb, 9, 3); setPar(sb, 18, 5); setHcp(sb, 18, 2); setHcp(sb, 2, 18);
        const data = capture(sb);
        assert.ok(data, 'the card is valid');
        const by = {}; data.forEach(h => { by[h.hole] = h; });
        assert.deepEqual(by[1],  { hole: 1,  par: 5, hcpIndex: 7 });
        assert.deepEqual(by[9],  { hole: 9,  par: 3, hcpIndex: 9 });
        assert.deepEqual(by[18], { hole: 18, par: 5, hcpIndex: 2 });
    });
});

// ============================================================================
describe('THE NEXT / SAVE BOUNDARY', () => {

    test('Next blocks on an invalid card and does not advance', () => {
        const sb = page();
        run(sb, `goToWizardStep(2); document.getElementById('enable-custom-course').checked = true;`);
        seed(sb, 'Manny Test Links'); fillValid(sb);
        setHcp(sb, 9, 18);
        run(sb, `window.__alerts = []; window.alert = m => window.__alerts.push(m);`);
        run(sb, `wizardNext(2);`);
        assert.equal(val(sb, 'currentWizardStep'), 2, 'must not advance');
        assert.match(sb.window.__alerts[0], /Handicap 18 is used on both hole 9 and hole 18/);
    });

    test('Next advances on a valid card and the EDITED values are what capture returns', () => {
        const sb = page();
        run(sb, `goToWizardStep(2); document.getElementById('enable-custom-course').checked = true;`);
        seed(sb, 'Manny Test Links'); fillValid(sb);
        setPar(sb, 1, 5); setPar(sb, 9, 3); setHcp(sb, 18, 2); setHcp(sb, 2, 18);
        run(sb, `window.__alerts = []; window.alert = m => window.__alerts.push(m);`);
        run(sb, `wizardNext(2);`);
        assert.equal(sb.window.__alerts.length, 0);
        assert.equal(val(sb, 'currentWizardStep'), 3, 'must advance');
        const by = {}; capture(sb).forEach(h => { by[h.hole] = h; });
        assert.equal(by[1].par, 5);
        assert.equal(by[9].par, 3);
        assert.equal(by[18].hcpIndex, 2);
    });

    test('BACK from Format returns to the same edited values', () => {
        const sb = page();
        run(sb, `goToWizardStep(2); document.getElementById('enable-custom-course').checked = true;`);
        seed(sb, 'Manny Test Links'); fillValid(sb);
        setPar(sb, 1, 5); setHcp(sb, 18, 2); setHcp(sb, 2, 18);
        run(sb, `wizardNext(2); wizardBack(3);`);
        assert.equal(val(sb, 'currentWizardStep'), 2);
        assert.equal(par(sb, 1), '5', 'Back must not reseed');
        assert.equal(hcp(sb, 18), '2');
    });

    test('the wizard boundary only fires for the custom grid', () => {
        assert.match(SRC_CODE, /if \(fromStep === 2\) \{/);
        assert.match(SRC_CODE, /const customBox = document\.getElementById\('enable-custom-course'\);/);
        assert.match(SRC_CODE, /if \(customBox && customBox\.checked\) \{/);
    });

    // STRUCTURE MOVED, GUARANTEE UNCHANGED AND NOW STRICTER.
    //
    // This assembly used to sit inline in saveSettings(); it now lives in
    // previewCourseData() so KP auto-fill can read the same card the round will be
    // saved with. The contract being protected is identical - a course card is
    // validated before it can be published to global_courses, on BOTH the editing
    // and the unmapped branch - but it is now pinned to the refusal itself rather
    // than to two functions' relative positions in the file. The write must sit
    // behind `if (!preview.ok) return`, which is a stronger statement than
    // "validation appears earlier in the source".
    test('the course card is validated before the global course is written', () => {
        const preview = SRC_CODE.slice(SRC_CODE.indexOf('function previewCourseData(courseKey)'));
        const body = preview.slice(0, preview.indexOf('function validateCourseGrid()'));
        assert.match(body, /const gridCheck = validateCourseGrid\(\);/,
            'the editing branch must validate');
        assert.match(body, /const unmappedCheck = validateCourseGrid\(\);/,
            'the unmapped branch must validate too');
        assert.match(body, /ok: false, reason: gridCheck\.message/,
            'a bad grid must be refused, not returned');
        assert.match(body, /ok: false, reason: unmappedCheck\.message/);

        const save = SRC_CODE.slice(SRC_CODE.indexOf('function saveSettings()'));
        assert.match(save, /const preview = previewCourseData\(courseKey\);/);
        const refusal = save.indexOf('if (!preview.ok) {');
        const writeIdx = save.indexOf('db.ref(`global_courses/${courseKey}`).set(');
        assert.ok(refusal > -1, 'saveSettings must refuse an invalid card');
        assert.ok(refusal < writeIdx, 'the refusal must gate the write');
        assert.match(save.slice(refusal, writeIdx), /return;/,
            'the refusal must return before anything is published');
    });
});

// ============================================================================
describe('THE SAVED CARD IS THE CARD THAT GETS PLAYED', () => {

    test('a saved course reloads to exactly those values', () => {
        const sb = page();
        seed(sb, 'Manny Test Links'); fillValid(sb);
        setPar(sb, 1, 5); setHcp(sb, 1, 7); setHcp(sb, 7, 1); setPar(sb, 9, 3);
        setPar(sb, 18, 5); setHcp(sb, 18, 2); setHcp(sb, 2, 18);
        const saved = capture(sb);
        assert.ok(saved);
        // Round-trip it through globalCourses exactly as the save path stores it.
        run(sb, `globalCourses['mannytest'] = { name: 'Manny Test Links', data: ${JSON.stringify(saved)} };`);
        run(sb, `selectCourse('mannytest', 'Manny Test Links');`);
        assert.equal(par(sb, 1), '5');
        assert.equal(hcp(sb, 1), '7');
        assert.equal(par(sb, 9), '3');
        assert.equal(par(sb, 18), '5');
        assert.equal(hcp(sb, 18), '2');
    });

    test('EDITED STROKE INDEXES REACH THE CANONICAL HANDICAP PATH', () => {
        const sb = page();
        seed(sb, 'Manny Test Links'); fillValid(sb);
        // Move stroke index 1 from hole 1 to hole 18 - a swap that changes who
        // strokes where in a real match.
        setHcp(sb, 18, 1); setHcp(sb, 1, 18);
        const courseData = capture(sb);
        assert.ok(courseData, 'the swapped card is valid');

        const players = [
            { id: 1, name: 'Manny', hcp: '3',  team: 'Team 1' },
            { id: 2, name: 'Marty', hcp: '10', team: 'Team 2' },
        ];
        const scores = {};
        courseData.forEach(h => { scores['p1_h' + h.hole] = 4; scores['p2_h' + h.hole] = 4; });
        const calc = JSON.parse(JSON.stringify(
            E.calculateMatchEngine(players, courseData, scores, 'net', 'match', 'none', 20, 0, [])));

        assert.equal(calc.matchBaseline, 3);
        assert.deepEqual(calc.relHcpById, { '1': 0, '2': 7 }, 'relative handicap is unchanged by this batch');

        // Marty's 7 strokes now follow the EDITED indexes: hole 18 (SI 1) is stroked,
        // hole 1 (SI 18) is not. Under the seeded card it was the other way round.
        const strokeAt = hole => E.allocateMatchStrokes(
            calc.relHcpById['2'], courseData.find(h => h.hole === hole).hcpIndex);
        assert.equal(strokeAt(18), 1, 'hole 18 now carries stroke index 1');
        assert.equal(strokeAt(1), 0, 'hole 1 no longer strokes');
        assert.equal(calc.holeLog[18].holeWinner, 'Marty', 'and the edit decides a real hole');
        assert.equal(calc.holeLog[1].holeWinner, 'Halved');
    });

    test('the seeded card would have produced the opposite result', () => {
        const sb = page();
        seed(sb, 'Manny Test Links'); fillValid(sb);
        const courseData = capture(sb);
        const players = [
            { id: 1, name: 'Manny', hcp: '3',  team: 'Team 1' },
            { id: 2, name: 'Marty', hcp: '10', team: 'Team 2' },
        ];
        const scores = {};
        courseData.forEach(h => { scores['p1_h' + h.hole] = 4; scores['p2_h' + h.hole] = 4; });
        const calc = JSON.parse(JSON.stringify(
            E.calculateMatchEngine(players, courseData, scores, 'net', 'match', 'none', 20, 0, [])));
        assert.equal(calc.holeLog[1].holeWinner, 'Marty', 'seeded SI 1 on hole 1');
        assert.equal(calc.holeLog[18].holeWinner, 'Halved');
    });
});

// ============================================================================
describe('NOTHING ELSE MOVED', () => {

    test('the step navigator still only toggles visibility', () => {
        const nav = SRC_CODE.slice(SRC_CODE.indexOf('function goToWizardStep'),
                                   SRC_CODE.indexOf('function goToWizardStep') + 700);
        assert.match(nav, /el\.classList\.toggle\('active', i === n\)/);
        assert.ok(!/innerHTML/.test(nav), 'Back/Next must not rebuild the grid DOM');
    });

    test('updateCustomCoursePars still only writes the total cells', () => {
        const fn = SRC_CODE.slice(SRC_CODE.indexOf('function updateCustomCoursePars'),
                                  SRC_CODE.indexOf('function updateCustomCoursePars') + 900);
        assert.ok(!/c-par-\$\{i\}`\)\.value =/.test(fn), 'it must never write an input value');
        assert.match(fn, /outEl\.textContent = outPar/);
    });

    test('the money and handicap engines were not touched', () => {
        ['money-engine.js','settlement-engine.js','bet-strip.js','action-model.js','pool-engine.js']
            .forEach(f => assert.ok(
                !/validateCourseGrid|lastCourseChangeKey|currentCourseIdentity/.test(read(f)), f));
    });

    test('handicap arithmetic is unchanged', () => {
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(18, -2), -1);
        assert.equal(E.allocateMatchStrokes(7, 7), 1);
        assert.equal(E.allocateMatchStrokes(7, 8), 0);
    });

    test('no Firebase rules or security surface changed', () => {
        assert.ok(!/validateCourseGrid/.test(read('database.rules.json')));
        assert.match(SRC_CODE, /db\.ref\(`global_courses\/\$\{courseKey\}`\)\.set\(/,
            'the same single global-course write path');
    });
});
