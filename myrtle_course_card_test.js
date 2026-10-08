// ============================================================================
// A BUILT-IN COURSE MUST SAVE ITS 18 HOLES (2026-10-07)
//
// FOUND SETTING UP SCREENSHOTS, iPhone 17 Pro Max simulator, main 04f5fd1:
// choosing Caledonia, True Blue or Pine Lakes in Game Day setup saved a round
// whose scorecard said "No course data for this round yet." Three of the Myrtle
// courses - the trip this app was built for - could not be scored at all.
//
// THE MECHANISM, read out of the code rather than guessed:
//
//   course-index.js applyNames() merges a NAME-ONLY STUB into the page's
//   globalCourses for every key the index knows: { name: 'Caledonia ...' } and
//   nothing else. That is correct and deliberate - it is how the picker lists a
//   course without downloading its card.
//
//   previewCourseData() then asked globalCourses FIRST:
//       } else if (globalCourses[courseKey]) {
//           built = globalCourses[courseKey].data || [];     <- [] for a stub
//       } else if (coursePresets[courseKey]) {
//
//   so the stub won, `built` was empty, and the preset's real 18 holes - which
//   are in course-data.js, in this repo, needing no network - were never read.
//
// AND courseCardInHand() SAID THE CARD WAS ALREADY HERE, because a preset
// exists for the key, so nothing ever fetched the real record either. Each of
// those alone is survivable; together they produce an empty card from data that
// was sitting in the bundle.
//
// THE RULE: whichever source actually HAS holes wins, and "in hand" means hole
// data in hand - not "a key I recognise".
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

// THE THREE THAT FAILED ON THE PHONE, plus the rest of the Myrtle week so a
// regression on any of them is caught by name.
const MYRTLE = ['caledonia', 'trueblue', 'pinelakes'];
// course-data.js is a plain <script> with no module.exports - it is loaded into
// the page's globals. So the presets are read out of a page sandbox rather than
// required, which is also how the app sees them.
const { loadJsFile } = require('./helpers/load-script.js');
const CD = loadJsFile('course-data.js');
const PRESETS = {
    coursePresets: vm.runInContext('JSON.parse(JSON.stringify(coursePresets))', CD),
    courseDirectory: vm.runInContext('JSON.parse(JSON.stringify(courseDirectory))', CD)
};

function page() {
    return loadHtmlInlineScript('admin.html', ['course-data.js', 'course-index.js', 'grouping.js',
                                               'code-issuer.js', 'action-model.js']);
}
// THE STATE A PHONE IS ACTUALLY IN: the index has listed the course by name, so
// globalCourses holds a stub for it, and nothing has been fetched.
const withStubs = (sb) => vm.runInContext(`
    ${MYRTLE.map(k => `globalCourses[${JSON.stringify(k)}] = { name: 'stub ' + ${JSON.stringify(k)} };`).join('\n')}
    'stubbed';`, sb);

describe('1. THE CARD THAT COMES OUT OF SETUP', () => {

    MYRTLE.forEach((key) => {
        test(key + ': previewCourseData returns 18 holes even with a name-only stub in the way', () => {
            const sb = page();
            withStubs(sb);
            const out = vm.runInContext(`JSON.stringify(previewCourseData(${JSON.stringify(key)}))`, sb);
            const preview = JSON.parse(out);
            assert.equal(preview.ok, true, preview.reason);
            assert.equal(preview.data.length, 18,
                key + ' saved ' + preview.data.length + ' holes - the scorecard says "No course data '
                + 'for this round yet." and the round cannot be scored');
            // AND IT IS THE REAL CARD, not 18 blanks: pars and handicap indexes
            // from course-data.js, which is in the bundle.
            const expect = PRESETS.coursePresets[key].data;
            assert.deepEqual(preview.data.map(h => h.par), expect.map(h => h.par), 'the pars are not the course’s');
            assert.deepEqual(preview.data.map(h => h.hcpIndex), expect.map(h => h.hcpIndex),
                'the handicap indexes are not the course’s, so every net score is wrong');
        });
    });

    test('and "in hand" means HOLE DATA in hand, not a key we recognise', () => {
        const sb = page();
        // A preset with no card is NOT in hand: claiming otherwise is what
        // stopped the real record ever being fetched.
        vm.runInContext(`coursePresets.__empty = { name: 'Empty', data: [] };
                         globalCourses.__empty = { name: 'Empty' };`, sb);
        assert.equal(vm.runInContext("courseCardInHand('__empty')", sb), false,
            'a course with no holes anywhere reports its card as already here, so nothing fetches it');
        // A real preset IS in hand - no fetch needed, the data is in the bundle.
        assert.equal(vm.runInContext("courseCardInHand('caledonia')", sb), true);
    });

    test('a real global record still wins over a preset, because it is the live one', () => {
        const sb = page();
        vm.runInContext(`globalCourses.caledonia = { name: 'Caledonia', data: [
            ${Array.from({ length: 18 }, (_, i) => `{hole:${i + 1},par:3,hcpIndex:${i + 1}}`).join(',')}] };`, sb);
        const preview = JSON.parse(vm.runInContext("JSON.stringify(previewCourseData('caledonia'))", sb));
        assert.equal(preview.data.length, 18);
        assert.deepEqual(preview.data.map(h => h.par), Array(18).fill(3),
            'an imported or edited card must not be overridden by the built-in preset');
    });

    test('the three names are in the picker AND in the presets - one list, not two', () => {
        // The defect was only possible because a course can be listed without
        // its card. If a name ever leaves coursePresets, the picker offers a
        // course this app cannot score offline.
        // The directory is grouped by region, each group holding items.
        const dir = JSON.stringify((PRESETS.courseDirectory || []).map(g => g.items || []));
        MYRTLE.forEach((k) => {
            assert.ok(PRESETS.coursePresets[k], k + ' is not a built-in any more');
            assert.equal(PRESETS.coursePresets[k].data.length, 18, k + ' has no 18-hole card');
            assert.ok(dir.indexOf('"' + k + '"') !== -1, k + ' is not in the picker list');
        });
    });
});
