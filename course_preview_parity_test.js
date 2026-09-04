// ============================================================================
// COURSE PREVIEW PARITY — the extraction changed nothing
//
// saveSettings() used to assemble finalCourseData inline. previewCourseData()
// now owns that assembly so the wizard can see the round's real scorecard before
// saving — specifically so KP auto-fill reads the SAME card the round will carry
// rather than re-deriving one and getting a different answer.
//
// An extraction is only safe if it is byte-for-byte inert. This file proves it by
// running the ORIGINAL algorithm, verbatim from main, inside the same sandbox and
// against the same DOM, then comparing both the hole array and the resulting
// course name for every shape the wizard can produce:
//
//   mapped 18   ·  unmapped (grid)  ·  Front 9  ·  Back 9  ·  loop course
//
// BACK 9 IS THE ONE THAT MATTERS. The trim keeps holes 10-18 and does NOT
// renumber them to 1-9. Anything that quietly "normalises" that would put KP
// money on holes the group is not playing, and it would look perfectly correct.
//
// The legacy copy below is deliberately not refactored or tidied. It is the old
// code. If it is ever made to resemble the new code, this file stops proving
// anything.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

// The original inline construction from saveSettings(), stripped of its three
// side effects (alert, save-button state, the global_courses write) and of
// nothing else. Returns what saveSettings would have ended up holding.
const LEGACY = `
function __legacyCourseData(courseKey, selectedCourseName) {
    const isEditing = document.getElementById('enable-custom-course').checked;
    let finalCourseData = [];

    if (isEditing) {
        const gridCheck = validateCourseGrid();
        if (!gridCheck.ok) return { failed: true, reason: gridCheck.message };
        finalCourseData = gridCheck.data;
    } else {
        if (nineHoleLoops[courseKey]) {
            const loops = nineHoleLoops[courseKey];
            const frontKey = document.getElementById("front-nine-select").value;
            const backKey = document.getElementById("back-nine-select").value;

            const frontRemapped = remapNineHandicaps(loops[frontKey].data, true);
            frontRemapped.forEach((item, idx) => { finalCourseData.push({ hole: idx + 1, par: item.par, hcpIndex: item.hcpIndex }); });

            if (backKey !== "none") {
                const backRemapped = remapNineHandicaps(loops[backKey].data, false);
                backRemapped.forEach((item, idx) => { finalCourseData.push({ hole: idx + 10, par: item.par, hcpIndex: item.hcpIndex }); });
                selectedCourseName = getCourseNameById(courseKey, globalCourses).split(' (')[0] + ' (' + loops[frontKey].name.split(' ')[0] + ' / ' + loops[backKey].name.split(' ')[0] + ')';
            } else {
                selectedCourseName = getCourseNameById(courseKey, globalCourses).split(' (')[0] + ' (' + loops[frontKey].name.split(' ')[0] + ' Only)';
            }
        } else if (globalCourses[courseKey]) {
            finalCourseData = globalCourses[courseKey].data;
        } else if (coursePresets[courseKey]) {
            finalCourseData = coursePresets[courseKey].data;
        } else {
            const unmappedCheck = validateCourseGrid();
            if (!unmappedCheck.ok) return { failed: true, reason: unmappedCheck.message };
            finalCourseData = unmappedCheck.data;
        }
    }

    if (!nineHoleLoops[courseKey]) {
        const roundLength = document.getElementById("round-length-select").value;
        if (roundLength === "front") {
            finalCourseData = finalCourseData.filter(h => h.hole <= 9);
            selectedCourseName += " (Front 9)";
        } else if (roundLength === "back") {
            finalCourseData = finalCourseData.filter(h => h.hole > 9);
            selectedCourseName += " (Back 9)";
        }
    }
    return { failed: false, data: finalCourseData, name: selectedCourseName };
}
`;

// A complete, valid 18-hole card typed into the custom grid. Par 3s at 3, 7, 12.
const GRID = [];
for (let i = 1; i <= 18; i++) GRID.push({ par: (i === 3 || i === 7 || i === 12) ? 3 : 4, hcp: i });

function boot(opts) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    const set = (id, prop, val) => { sb.document.getElementById(id)[prop] = val; };
    set('enable-custom-course', 'checked', !!opts.editing);
    set('round-length-select', 'value', opts.roundLength || '18');
    set('front-nine-select', 'value', opts.front || '');
    set('back-nine-select', 'value', opts.back || 'none');
    if (opts.fillGrid) {
        GRID.forEach((h, i) => {
            set('c-par-' + (i + 1), 'value', String(h.par));
            set('c-hcp-' + (i + 1), 'value', String(h.hcp));
        });
    }
    vm.runInContext(LEGACY, sb);
    return sb;
}

// Runs both implementations against the identical sandbox and returns both results.
function bothWays(sb, courseKey, startingName) {
    sb.__key = courseKey;
    sb.__name = startingName;
    const legacy = vm.runInContext('__legacyCourseData(__key, __name)', sb);
    const p = vm.runInContext('previewCourseData(__key)', sb);
    // Rebuild what saveSettings now does with the preview, in the same order.
    let name = startingName;
    if (p.courseNameOverride !== null) name = p.courseNameOverride;
    name += p.nameSuffix;
    return {
        legacy,
        preview: { failed: !p.ok, reason: p.reason, data: p.data, name, untrimmed: p.untrimmed }
    };
}

const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
// Arrays built inside the sandbox carry the vm's Array prototype, which strict
// deepEqual treats as a difference. Normalise before comparing shapes.
const holes = (d) => JSON.parse(JSON.stringify(d)).map(h => h.hole);

describe('previewCourseData() reproduces the original construction exactly', () => {

    test('MAPPED 18: a preset course, full round', () => {
        const sb = boot({ roundLength: '18' });
        const { legacy, preview } = bothWays(sb, 'caledonia', 'Caledonia Golf & Fish Club');
        assert.equal(legacy.failed, false);
        assert.equal(preview.failed, false);
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.equal(preview.data.length, 18);
    });

    test('FRONT 9: holes 1-9, name suffixed', () => {
        const sb = boot({ roundLength: 'front' });
        const { legacy, preview } = bothWays(sb, 'caledonia', 'Caledonia Golf & Fish Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.deepEqual(holes(preview.data), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.match(preview.name, /\(Front 9\)$/);
    });

    // THE NUMBERING TEST. 10-18, not 1-9.
    test('BACK 9: holes keep their 10-18 numbering', () => {
        const sb = boot({ roundLength: 'back' });
        const { legacy, preview } = bothWays(sb, 'caledonia', 'Caledonia Golf & Fish Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.deepEqual(holes(preview.data), [10, 11, 12, 13, 14, 15, 16, 17, 18],
            'The back nine is numbered 10-18. Renumbering it to 1-9 would move every KP hole.');
        assert.match(preview.name, /\(Back 9\)$/);
    });

    test('UNMAPPED: falls through to the typed grid', () => {
        const sb = boot({ roundLength: '18', fillGrid: true });
        const { legacy, preview } = bothWays(sb, 'comm_somewhereunmapped', 'Somewhere Unmapped');
        assert.equal(legacy.failed, false);
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.equal(preview.data.length, 18);
    });

    test('UNMAPPED, BLANK GRID: both refuse, with the same reason', () => {
        // The anti-fiction path: an unmapped course seeds nothing, so the grid is
        // empty and the card must be refused rather than invented.
        const sb = boot({ roundLength: '18', fillGrid: false });
        const { legacy, preview } = bothWays(sb, 'comm_blankcourse', 'Blank Course');
        assert.equal(legacy.failed, true);
        assert.equal(preview.failed, true);
        assert.equal(preview.reason, legacy.reason);
        assert.match(preview.reason, /Hole 1 is missing a Par/);
    });

    test('CUSTOM GRID EDITING: the typed card wins', () => {
        const sb = boot({ roundLength: '18', editing: true, fillGrid: true });
        const { legacy, preview } = bothWays(sb, 'caledonia', 'Caledonia Golf & Fish Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.equal(preview.data[2].par, 3, 'the grid, not the preset');
    });

    test('LOOP COURSE: two nines remapped to 1-9 and 10-18, name rebuilt', () => {
        const sb = boot({ front: 'cameron', back: 'mackay', roundLength: '18' });
        const { legacy, preview } = bothWays(sb, 'thistle_27', 'Thistle Golf Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.deepEqual(holes(preview.data),
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    });

    test('LOOP COURSE, ONE NINE: nine holes, "Only" name', () => {
        const sb = boot({ front: 'stewart', back: 'none', roundLength: '18' });
        const { legacy, preview } = bothWays(sb, 'thistle_27', 'Thistle Golf Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.equal(preview.data.length, 9);
    });

    // A loop course ignores round-length entirely; the trim is guarded on it.
    test('LOOP COURSE ignores round length, exactly as before', () => {
        const sb = boot({ front: 'cameron', back: 'mackay', roundLength: 'back' });
        const { legacy, preview } = bothWays(sb, 'thistle_27', 'Thistle Golf Club');
        same(preview.data, legacy.data);
        assert.equal(preview.name, legacy.name);
        assert.equal(preview.data.length, 18, 'the back-9 trim must not touch a loop course');
    });
});

describe('previewCourseData() publishes the same card it always did', () => {

    test('untrimmed is what global_courses receives, not the trimmed round', () => {
        // saveSettings writes preview.untrimmed. A group playing nine holes must not
        // shorten the shared course record for everyone else.
        const sb = boot({ roundLength: 'back', editing: true, fillGrid: true });
        sb.__key = 'comm_publishme';
        const p = vm.runInContext('previewCourseData(__key)', sb);
        assert.equal(p.untrimmed.length, 18, 'the published card stays 18 holes');
        assert.equal(p.data.length, 9, 'the round itself is nine');
        assert.deepEqual(holes(p.data), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
    });

    test('saveSettings publishes untrimmed, and the trimmed round is never written', () => {
        // Behavioural coverage stops at previewCourseData's return value; which of the
        // two arrays saveSettings hands to global_courses is a decision only the call
        // site makes. Pinned at the source, because getting it wrong would silently
        // shorten a shared course record to nine holes for every future golfer.
        const fs = require('fs');
        const path = require('path');
        const { REPO_ROOT } = require('./helpers/load-script.js');
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        const at = src.indexOf('db.ref(`global_courses/${courseKey}`).set(');
        assert.ok(at > -1, 'the publish call must still exist');
        const block = src.slice(at, at + 220);
        assert.match(block, /data: preview\.untrimmed/,
            'global_courses must receive the untrimmed card.');
        assert.doesNotMatch(block, /data: preview\.data\b/,
            'Publishing the trimmed round would shorten the course for everyone.');
    });
});

describe('saveSettings() actually uses the seam', () => {

    test('the inline construction is gone from saveSettings', () => {
        const fs = require('fs');
        const path = require('path');
        const { REPO_ROOT } = require('./helpers/load-script.js');
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.match(src, /const preview = previewCourseData\(courseKey\);/,
            'saveSettings must consume the seam.');
        assert.doesNotMatch(src, /\/\/ Universal 9-Hole Trim Logic/,
            'The duplicate trim must be gone, or two copies can drift apart.');
        // Exactly one place may apply the round-length trim.
        const trims = (src.match(/roundLength === "front"/g) || []).length;
        assert.equal(trims, 1, 'the trim must exist in exactly one place');
    });
});
