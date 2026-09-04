// ============================================================================
// AUTO-KP — the app already knows which holes are par 3s
//
// The organizer picks the course in Step 1. The KP field then asked them to
// retype that course's par 3s as a comma-separated list, which is information
// the round is already holding.
//
// THE TWO WAYS THIS GOES WRONG, and the tests that exist to stop each:
//
//   WRONG HOLES   Reading globalCourses/coursePresets directly ignores the loop
//                 remap and the round-length trim. A Back 9 round's par 3s are
//                 12 and 16; a raw read says 3 and 7. Both look like plausible
//                 golf. One of them puts the KP money on holes nobody is
//                 playing. BACK_9_KEEPS_ITS_NUMBERING is the guard.
//
//   INVENTED DATA An unmapped course seeds a BLANK grid on purpose - the
//                 anti-fiction rule. Auto-fill must fail that trust test and say
//                 so, not fall back to a default set of holes.
//                 UNMAPPED_INVENTS_NOTHING is the guard.
//
// AND THE RULE THAT PROTECTS THE GOLFER: a list the organizer has stated is
// theirs. Groups drop a par 3, or add a short par 4, or play only two KPs. A
// course change offers the new par 3s; it never applies them silently. Saved
// rounds count as stated - see main_pool_persistence_test.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const src = () => fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

// caledonia: par 3s at 3, 6, 9 on the front and 11, 17 on the back.
const CALEDONIA_PAR3S = [3, 6, 9, 11, 17];

function wizard(opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    const set = (id, prop, val) => { sb.document.getElementById(id)[prop] = val; };
    // currentCourseIdentity() reads the hidden select first. These are top-level
    // bindings in the page, so drive the elements they point at.
    set('course-select', 'value', opts.courseKey || '');
    set('course-search-input', 'value', opts.typed || '');
    set('enable-custom-course', 'checked', !!opts.editing);
    set('round-length-select', 'value', opts.roundLength || '18');
    set('front-nine-select', 'value', opts.front || '');
    set('back-nine-select', 'value', opts.back || 'none');
    if (opts.grid) {
        for (let i = 1; i <= 18; i++) {
            const par = opts.grid[i - 1];
            set('c-par-' + i, 'value', par === null ? '' : String(par));
            set('c-hcp-' + i, 'value', String(i));
        }
    }
    return sb;
}

const suggest = (sb) => JSON.parse(JSON.stringify(vm.runInContext('mpParThreeSuggestion()', sb)));
const autofill = (sb) => vm.runInContext('mpAutoFillKpHoles()', sb);
const field = (sb) => String(sb.document.getElementById('mp-kp-holes').value || '');
const note = (sb) => String(sb.document.getElementById('mp-kp-source').textContent || '');
const chip = (sb) => sb.document.getElementById('mp-kp-suggest');

describe('AUTO-KP detects par 3s from the round the group is actually playing', () => {

    test('a mapped 18-hole course fills every par 3', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        const s = suggest(sb);
        assert.equal(s.ok, true);
        assert.deepEqual(s.holes, CALEDONIA_PAR3S);
        autofill(sb);
        assert.equal(field(sb), '3, 6, 9, 11, 17');
        assert.equal(note(sb), 'Par 3s from the course scorecard');
    });

    test('FRONT 9 offers only the front nine par 3s', () => {
        const sb = wizard({ courseKey: 'caledonia', roundLength: 'front' });
        assert.deepEqual(suggest(sb).holes, [3, 6, 9]);
        autofill(sb);
        assert.equal(field(sb), '3, 6, 9');
    });

    // THE ONE THAT MATTERS. A raw read of the course record gives 3 and 7 here.
    test('BACK_9_KEEPS_ITS_NUMBERING: the back nine suggests 11 and 17', () => {
        const sb = wizard({ courseKey: 'caledonia', roundLength: 'back' });
        const s = suggest(sb);
        assert.deepEqual(s.holes, [11, 17],
            'The back nine is numbered 10-18. Suggesting 3 and 7 would put the KP money on holes nobody is playing.');
        s.holes.forEach(h => assert.ok(h >= 10 && h <= 18, 'hole ' + h + ' is not on the back nine'));
        autofill(sb);
        assert.equal(field(sb), '11, 17');
    });

    test('a loop course uses its remapped numbering', () => {
        const sb = wizard({ courseKey: 'thistle_27', front: 'cameron', back: 'mackay' });
        const s = suggest(sb);
        assert.equal(s.ok, true);
        // Cameron par 3s sit at positions 4 and 8; MacKay's at 3 and 6, so 13 and 16.
        assert.deepEqual(s.holes, [4, 8, 12, 15]);
        s.holes.forEach(h => assert.ok(h >= 1 && h <= 18));
    });

    test('a single-nine loop stops at nine holes', () => {
        const sb = wizard({ courseKey: 'thistle_27', front: 'stewart', back: 'none' });
        const s = suggest(sb);
        assert.equal(s.ok, true);
        s.holes.forEach(h => assert.ok(h <= 9, 'a one-nine round has no hole ' + h));
    });

    test('a typed custom grid is read as the round it describes', () => {
        const grid = [4,4,3,4,5,4,4,3,4, 4,4,4,3,5,4,4,3,4];
        const sb = wizard({ courseKey: 'comm_typedcourse', grid });
        assert.deepEqual(suggest(sb).holes, [3, 8, 13, 17]);
    });
});

describe('AUTO-KP never invents course data', () => {

    test('UNMAPPED_INVENTS_NOTHING: a blank grid produces no holes and says so', () => {
        const sb = wizard({ courseKey: 'comm_neverbeenmapped' });   // no grid filled
        const s = suggest(sb);
        assert.equal(s.ok, false, 'an unmapped course is not trustworthy');
        assert.deepEqual(s.holes, []);
        autofill(sb);
        assert.equal(field(sb), '', 'nothing may be written into the field');
        assert.match(note(sb), /Enter the KP holes for this course/,
            'the organizer must be told why it is empty');
        assert.match(note(sb), /don't have its scorecard yet/);
    });

    test('ONE missing par makes the whole card untrustworthy', () => {
        const grid = [4,4,3,4,5,4,4,3,4, 4,4,4,3,5,4,4,3,4];
        grid[11] = null;                        // hole 12 left blank
        const sb = wizard({ courseKey: 'comm_partialcard', grid });
        const s = suggest(sb);
        assert.equal(s.ok, false,
            'A partially mapped card must not be half-trusted; the missing hole could be a par 3.');
        autofill(sb);
        assert.equal(field(sb), '');
    });

    test('a nonsense par value is refused rather than skipped', () => {
        const grid = [4,4,3,4,5,4,4,3,4, 4,4,4,3,5,4,4,3,4];
        grid[5] = 9;                            // par 9 is not golf
        const sb = wizard({ courseKey: 'comm_badpar', grid });
        assert.equal(suggest(sb).ok, false);
    });

    // THE PATH validateCourseGrid() NEVER SEES. A mapped course is read straight
    // out of globalCourses/coursePresets - no grid, no validator. global_courses is
    // golfer-contributed and has been poisoned before, so a card that arrives
    // missing a par, or carrying a par of 0, must fail the trust test here or
    // auto-fill will quietly report par 3s from an incomplete scorecard.
    test('a MAPPED course missing a par is not trusted', () => {
        const sb = wizard({ courseKey: 'comm_poisoned' });
        vm.runInContext(`globalCourses = { comm_poisoned: { name: 'Poisoned', data: ` +
            JSON.stringify(Array.from({ length: 18 }, (_, i) => ({
                hole: i + 1, par: i === 6 ? undefined : (i === 2 ? 3 : 4), hcpIndex: i + 1
            }))) + ` } };`, sb);
        const s = suggest(sb);
        assert.equal(s.ok, false,
            'A mapped card with a hole missing its par must not be half-trusted.');
        autofill(sb);
        assert.equal(field(sb), '');
        assert.match(note(sb), /Enter the KP holes/);
    });

    test('a MAPPED course with a par of 0 is not trusted', () => {
        const sb = wizard({ courseKey: 'comm_zeropar' });
        vm.runInContext(`globalCourses = { comm_zeropar: { name: 'Zero', data: ` +
            JSON.stringify(Array.from({ length: 18 }, (_, i) => ({
                hole: i + 1, par: i === 10 ? 0 : (i === 2 ? 3 : 4), hcpIndex: i + 1
            }))) + ` } };`, sb);
        assert.equal(suggest(sb).ok, false, 'par 0 is not a hole anyone played');
    });

    test('a MAPPED course with a blank-string par is not trusted', () => {
        const sb = wizard({ courseKey: 'comm_blankpar' });
        vm.runInContext(`globalCourses = { comm_blankpar: { name: 'Blank', data: ` +
            JSON.stringify(Array.from({ length: 18 }, (_, i) => ({
                hole: i + 1, par: i === 4 ? '' : (i === 2 ? 3 : 4), hcpIndex: i + 1
            }))) + ` } };`, sb);
        assert.equal(suggest(sb).ok, false, "an empty par is not a 0 and not a 4");
    });

    test('a fully mapped course from globalCourses IS trusted', () => {
        // The positive half of the same boundary: a complete contributed card works.
        const sb = wizard({ courseKey: 'comm_goodcard' });
        vm.runInContext(`globalCourses = { comm_goodcard: { name: 'Good', data: ` +
            JSON.stringify(Array.from({ length: 18 }, (_, i) => ({
                hole: i + 1, par: (i === 2 || i === 15) ? 3 : 4, hcpIndex: i + 1
            }))) + ` } };`, sb);
        const s = suggest(sb);
        assert.equal(s.ok, true);
        assert.deepEqual(s.holes, [3, 16]);
    });

    test('no course chosen yet produces no suggestion', () => {
        const sb = wizard({});
        assert.equal(suggest(sb).ok, false);
        autofill(sb);
        assert.equal(field(sb), '');
    });

    test('a course with no par 3s at all fills nothing and does not claim provenance', () => {
        const grid = new Array(18).fill(4);
        const sb = wizard({ courseKey: 'comm_nopar3s', grid });
        const s = suggest(sb);
        assert.equal(s.ok, true, 'the card is trustworthy');
        assert.deepEqual(s.holes, [], 'it simply has no par 3s');
        autofill(sb);
        assert.equal(field(sb), '');
    });
});

describe('AUTO-KP never overwrites a list the organizer has stated', () => {

    test('a typed list survives a course change, and the new par 3s are offered', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        autofill(sb);
        assert.equal(field(sb), '3, 6, 9, 11, 17');

        // The group drops two of them by hand.
        sb.document.getElementById('mp-kp-holes').value = '3, 9';
        vm.runInContext('mpKpHolesEdited();', sb);

        // Now the round moves to another course.
        sb.document.getElementById('course-select').value = 'trueblue';
        autofill(sb);

        assert.equal(field(sb), '3, 9', 'THE OVERRIDE: their list must survive.');
        assert.equal(chip(sb).style.display, 'inline-block', 'the new par 3s must be offered');
        assert.match(String(chip(sb).textContent), /^Use par 3s \(/);
    });

    test('taking the suggestion applies it and follows the course again', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        sb.document.getElementById('mp-kp-holes').value = '4';
        vm.runInContext('mpKpHolesEdited();', sb);
        autofill(sb);
        assert.equal(chip(sb).style.display, 'inline-block');

        vm.runInContext('mpUseSuggestedKpHoles();', sb);
        assert.equal(field(sb), '3, 6, 9, 11, 17');
        assert.equal(vm.runInContext('kpHolesTouched', sb), false,
            'accepting the par 3s means the field follows the course again');
        assert.equal(chip(sb).style.display, 'none');
    });

    test('an untouched field follows a course change', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        autofill(sb);
        sb.document.getElementById('course-select').value = 'trueblue';
        autofill(sb);
        assert.notEqual(field(sb), '3, 6, 9, 11, 17', 'it should have moved to the new course');
        assert.equal(note(sb), 'Par 3s from the course scorecard');
    });

    test('an untouched field follows a round-length change', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        autofill(sb);
        assert.equal(field(sb), '3, 6, 9, 11, 17');
        sb.document.getElementById('round-length-select').value = 'back';
        autofill(sb);
        assert.equal(field(sb), '11, 17', 'switching to the back nine must re-derive');
    });

    test('a manual list that happens to match the par 3s shows provenance, not a chip', () => {
        const sb = wizard({ courseKey: 'caledonia' });
        sb.document.getElementById('mp-kp-holes').value = '3, 6, 9, 11, 17';
        vm.runInContext('mpKpHolesEdited();', sb);
        autofill(sb);
        assert.equal(chip(sb).style.display, 'none', 'nothing to suggest — it already matches');
        assert.equal(note(sb), 'Par 3s from the course scorecard');
    });

    test('an untrustworthy course does not nag someone who already typed a list', () => {
        const sb = wizard({ courseKey: 'comm_unmappedagain' });
        sb.document.getElementById('mp-kp-holes').value = '5, 12';
        vm.runInContext('mpKpHolesEdited();', sb);
        autofill(sb);
        assert.equal(field(sb), '5, 12');
        assert.equal(note(sb), '', 'they have already answered the question');
    });
});

describe('AUTO-KP is wired into the wizard', () => {

    test('a course change triggers it', () => {
        const s = src();
        const fn = s.slice(s.indexOf('function handleCourseChange()'));
        assert.match(fn.slice(0, fn.indexOf('\n    function ')), /mpAutoFillKpHoles\(\)/);
    });

    test('a round-length change triggers it', () => {
        assert.match(src(), /id="round-length-select" onchange="mpAutoFillKpHoles\(\)"/);
    });

    test('enabling the pool triggers it', () => {
        const s = src();
        const fn = s.slice(s.indexOf('function mpToggle()'));
        assert.match(fn.slice(0, fn.indexOf('\n    function ')), /mpAutoFillKpHoles\(\)/);
    });

    test('it reads the preview, never the raw course record', () => {
        const s = src();
        const fn = s.slice(s.indexOf('function mpParThreeSuggestion()'));
        const body = fn.slice(0, fn.indexOf('\n    function '));
        assert.match(body, /previewCourseData\(key\)/);
        assert.doesNotMatch(body, /coursePresets\[/,
            'reading the course record directly skips the trim and the loop remap');
        assert.doesNotMatch(body, /globalCourses\[/);
    });
});
