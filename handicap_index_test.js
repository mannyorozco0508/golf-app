// ============================================================================
// HANDICAP INDEX → COURSE HANDICAP → PLAYING HANDICAP
//
// The number a golfer types is a Handicap Index.
//   Course Handicap  = Index × (Slope / 113) + (Course Rating − Par)
//   Playing Handicap = Course Handicap × allowance, nearest whole number,
//                      .5 rounds toward +∞ (10.5 → 11, −1.5 → −1).
//
// player.hcp, the field getStrokes already reads, becomes that Playing
// Handicap. A round saved before this conversion has no handicapIndex; Save
// leaves its hcp alone. Missing Slope / Course Rating / Par does not pretend
// the Index was already a Playing Handicap: the golfer is flagged and the
// sentence says so.
//
// THE COURSE STEP. Slope, Course Rating and Par are not typed. A course row
// calls selectCourse, which fills them from that course's tees and shows the
// tee names. A course with no rated tees hides the block. An online result
// calls openImportConfirm; the tees are on the fetched card before the course
// is saved, and the dropdown has to show them then. A test that only called
// syncTeeRatingFromCourse would miss a page that never did either.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const H = loadJsFile('handicap.js');
const ADMIN = read('admin.html');

const TEE = { slope: 113, courseRating: 72, par: 72, allowance: 100 };
const HARD = { slope: 130, courseRating: 72, par: 72, allowance: 100 };

describe('the formula', () => {
    test('slope 113 and rating equal to par leaves the index, then rounds', () => {
        assert.equal(H.courseHandicapFromIndex(12.4, 113, 72, 72), 12.4);
        assert.equal(H.playingHandicapFromCourse(12.4, 100), 12);
        assert.equal(H.playingHandicapFromCourse(12.5, 100), 13);
    });

    test('.5 rounds up, including a negative course handicap', () => {
        assert.equal(H.roundHalfUp(10.5), 11);
        assert.equal(H.roundHalfUp(-1.5), -1);
        assert.equal(H.roundHalfUp(10.4), 10);
        assert.equal(H.roundHalfUp(0.5), 1);
        assert.equal(H.roundHalfUp(-0.5), 0);
        const up = H.convertHandicapIndex('10.5', TEE);
        assert.equal(up.ok, true);
        assert.equal(up.course, 10.5);
        assert.equal(up.playing, 11);
        assert.equal(up.playingText, '11');
        const plus = H.convertHandicapIndex('+1.5', TEE);
        assert.equal(plus.playing, -1);
        assert.equal(plus.playingText, '+1');
    });

    test('allowance 95 rounds 9.5 up to 10', () => {
        const tee = Object.assign({}, TEE, { allowance: 95 });
        const got = H.convertHandicapIndex('10', tee);
        assert.equal(got.course, 10);
        assert.equal(got.playing, 10);
    });

    test('a higher slope raises the playing handicap above the index', () => {
        const got = H.convertHandicapIndex('10', HARD);
        assert.ok(Math.abs(got.course - (10 * 130 / 113)) < 1e-9);
        assert.equal(got.playing, 12);
        assert.equal(got.playingText, '12');
        // The stroke the index would NOT have given is the one Playing does.
        assert.equal(H.getStrokes(12, got.playing), 1);
        assert.equal(H.getStrokes(12, 10), 0);
    });

    test('course rating below par lowers the course handicap', () => {
        const got = H.convertHandicapIndex('10', { slope: 113, courseRating: 71.2, par: 72, allowance: 100 });
        assert.ok(Math.abs(got.course - 9.2) < 1e-9);
        assert.equal(got.playing, 9);
    });

    test('an index above 54 is capped; a plus index is kept', () => {
        assert.equal(H.sanitizeHandicapIndex('60'), '54');
        assert.equal(H.sanitizeHandicapIndex('+2'), '+2');
        assert.equal(H.convertHandicapIndex('60', TEE).index, 54);
    });
});

describe('missing tee rating is said, not silent', () => {
    test('no slope does not convert', () => {
        const got = H.playerHandicapFields('12.4', null, { courseRating: 72, par: 72 });
        assert.equal(got.handicapUnconverted, true);
        assert.equal(got.handicapIndex, '12.4');
        assert.equal(got.hcp, '12.4');
        assert.equal(got.courseHandicap, undefined);
        const label = H.handicapFacingLabel(got);
        assert.match(label, /Index 12\.4/);
        assert.match(label, /used as Playing Handicap/);
        assert.match(H.handicapUnconvertedNote(), /Slope, Course Rating, and Par are missing/);
    });

    test('a slope outside 55–155 is refused the same way', () => {
        const status = H.teeRatingStatus({ slope: 200, courseRating: 72, par: 72 });
        assert.equal(status.complete, false);
        const got = H.playerHandicapFields('8', null, { slope: 200, courseRating: 72, par: 72 });
        assert.equal(got.handicapUnconverted, true);
    });

    test('a legacy playing handicap is not reinterpreted as an index', () => {
        const kept = H.playerHandicapFields('12', '12', HARD);
        assert.equal(kept.hcp, '12');
        assert.equal(kept.handicapIndex, undefined);
        assert.equal(H.handicapFacingLabel({ hcp: '12' }), null);
        const edited = H.playerHandicapFields('10', '12', HARD);
        assert.equal(edited.handicapIndex, '10');
        assert.equal(edited.hcp, '12');
        assert.equal(edited.handicapUnconverted, undefined);
    });

    test('a blank box stays blank', () => {
        const blank = H.playerHandicapFields('', null, HARD);
        assert.equal(blank.hcp, '');
        assert.equal(blank.handicapIndex, undefined);
    });

    test('a converted golfer is labelled Index, Course, and Playing', () => {
        const fields = H.playerHandicapFields('10.4', null, TEE);
        assert.equal(fields.hcp, '10');
        assert.equal(fields.handicapIndex, '10.4');
        const label = H.handicapFacingLabel(fields);
        assert.match(label, /Index 10\.4/);
        assert.match(label, /Course 10\.4/);
        assert.match(label, /Playing 10/);
    });
});

describe('Setup fills the tee from the course, and does not ask for the numbers', () => {
    test('the course step hides the rating block until a tee exists', () => {
        const panel = ADMIN.slice(ADMIN.indexOf('id="tee-rating-panel"'), ADMIN.indexOf('id="wizard-step-2"'));
        assert.ok(panel.length > 80, 'the course-step slice must contain the tee block');
        assert.match(panel, /id="tee-rating-select"/);
        assert.match(panel, /id="tee-rating-filled"/);
        assert.match(panel, /display:\s*none/);
        assert.match(panel, /type="hidden" id="tee-slope"/);
        assert.match(panel, /type="hidden" id="tee-course-rating"/);
        assert.match(panel, /type="hidden" id="tee-par"/);
        assert.match(panel, /id="tee-allowance" value="100"/);
        assert.ok(!/No tee rating on this course/.test(panel));
        assert.ok(!/<label[^>]*for="tee-slope"/.test(panel));
        assert.ok(!/<label[^>]*for="tee-course-rating"/.test(panel));
        assert.ok(!/<label[^>]*for="tee-par"/.test(panel));
        assert.ok(!/Allowance %/.test(panel));
        assert.ok(!panel.includes(H.handicapUnconvertedNote()));
        // The players step still says what an unconverted Index means. That
        // sentence is not a form, and it is the one the converter uses.
        assert.ok(ADMIN.includes(H.handicapUnconvertedNote()));
        assert.match(ADMIN, /playerHandicapFields\(/);
        const save = ADMIN.slice(ADMIN.indexOf('const playersList = []'), ADMIN.indexOf('playersList.push(entry)') + 'playersList.push(entry)'.length);
        assert.ok(save.length > 80);
        assert.match(save, /playerHandicapFields\(/);
        assert.match(save, /playersList\.push\(entry\)/);
        assert.match(ADMIN, /teeRating: teeForSave/);
    });

    test('choosing a course with tees fills Slope, Course Rating, and Par', () => {
        const sb = loadHtmlInlineScript('admin.html', ['handicap.js', 'course-data.js', 'action-model.js']);
        assert.equal(sb.document.getElementById('tee-slope').value, '');
        const holes = [];
        for (let i = 1; i <= 18; i++) holes.push({ hole: i, par: 4, hcpIndex: i });
        sb.__course = {
            name: 'Test Club',
            data: holes,
            source: { siFrom: 'male/Blue' },
            tees: {
                male: [{ name: 'Blue', rating: 71.8, slope: 130, parTotal: 72 }],
                female: [{ name: 'Red', rating: 69.4, slope: 121, parTotal: 72 }]
            }
        };
        sb.__plain = { name: 'No Rating', data: holes };
        vm.runInContext(`globalCourses['gca_test'] = __course; globalCourses['gca_plain'] = __plain; selectCourse('gca_test', 'Test Club');`, sb);
        const sel = sb.document.getElementById('tee-rating-select');
        const names = Array.prototype.map.call(sel.options, o => o.textContent);
        assert.deepEqual(names, ['Men · Blue', 'Women · Red']);
        assert.equal(sb.document.getElementById('tee-rating-panel').style.display, 'block');
        assert.equal(sb.document.getElementById('tee-slope').value, '130');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '71.8');
        assert.equal(sb.document.getElementById('tee-par').value, '72');
        const filled = sb.document.getElementById('tee-rating-filled').textContent;
        assert.match(filled, /Slope 130/);
        assert.match(filled, /Course Rating 71\.8/);
        assert.match(filled, /Par 72/);
        const fields = sb.playerHandicapFields('10', null, sb.readTeeRatingFromDom());
        assert.equal(fields.handicapIndex, '10');
        assert.equal(fields.hcp, '11');
        assert.equal(fields.handicapUnconverted, undefined);
        assert.equal(typeof fields.courseHandicap, 'number');
        // The other tee, through the select's own onchange.
        sel.value = 'female:0';
        vm.runInContext(/onchange="([^"]+)"/.exec(ADMIN.slice(ADMIN.indexOf('id="tee-rating-select"'), ADMIN.indexOf('id="tee-rating-select"') + 200))[1], sb);
        assert.equal(sb.document.getElementById('tee-slope').value, '121');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '69.4');
        vm.runInContext(`selectCourse('gca_plain', 'No Rating');`, sb);
        assert.equal(sb.document.getElementById('tee-rating-panel').style.display, 'none');
        assert.equal(sb.document.getElementById('tee-slope').value, '');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '');
        assert.equal(sb.document.getElementById('tee-par').value, '');
        assert.equal(sb.document.getElementById('tee-rating-filled').textContent, '');
        assert.ok(!Array.prototype.some.call(sb.document.getElementById('tee-rating-select').options, o => /No tee rating/.test(o.textContent || '')));
        assert.match(sb.document.getElementById('handicap-index-note').textContent, /used as the Playing Handicap/);
        // A record can carry tees and no hole card. The grid write must not
        // throw before the rating fields are filled. Firebase may hand the
        // tee list back as an object keyed "0","1" rather than an array.
        vm.runInContext(`globalCourses['gca_teesonly'] = { name: 'Tees Only', tees: { male: { '0': { name: 'Gold', rating: 70.2, slope: 125, parTotal: 71 } } } }; selectCourse('gca_teesonly', 'Tees Only');`, sb);
        assert.equal(sb.document.getElementById('tee-slope').value, '125');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '70.2');
        assert.equal(sb.document.getElementById('tee-par').value, '71');
        assert.equal(sb.document.getElementById('tee-rating-select').options[0].textContent, 'Men · Gold');
    });

    test('an online Continental card fills its tees before the course is saved', async () => {
        const sb = loadHtmlInlineScript('admin.html', ['handicap.js', 'course-data.js', 'action-model.js', 'course-import-rules.js']);
        const holes = [];
        for (let i = 1; i <= 18; i++) holes.push({ par: i <= 6 ? 4 : 3, yardage: 150, handicap: i });
        const tee = (name, rating, slope, yards) => ({
            tee_name: name, course_rating: rating, slope_rating: slope,
            par_total: 60, total_yards: yards, holes
        });
        // Live golfcourseapi card for Continental Golf Course, Scottsdale
        // (id n4qjfdjd), measured 2026-09-23. Men's Blue is the longest men's
        // set, so it is the canonical tee.
        sb.__detail = {
            id: 'n4qjfdjd',
            club_name: 'Continental Golf Course',
            course_name: 'Continental Golf Course',
            location: { city: 'Scottsdale', state: 'AZ' },
            tees: {
                male: [tee('Blue', 58.4, 86, 3761), tee('Forward', 57.1, 83, 3361)],
                female: [tee('Blue', 59.8, 90, 3766), tee('Forward', 57.6, 84, 3374)]
            }
        };
        sb.fetch = () => Promise.resolve({ json: () => Promise.resolve({ status: 'ok', course: sb.__detail }) });
        // mini-dom has no Event and no dispatchEvent. The import path fires one
        // change after the tees are filled; the harness only needs it not to throw.
        sb.Event = function () { return {}; };
        sb.document.getElementById('enable-custom-course').dispatchEvent = function () {};
        // The name was already typed, so the course identity does not change
        // when the card arrives. That is the path that used to leave the
        // manual block up.
        vm.runInContext(`courseSearchInput.value = 'Continental Golf Course'; courseHiddenSelect.value = ''; handleCourseChange();`, sb);
        assert.equal(sb.document.getElementById('tee-rating-panel').style.display, 'none');
        await sb.openImportConfirm({ id: 'n4qjfdjd', club_name: 'Continental Golf Course', course_name: 'Continental Golf Course' });
        const sel = sb.document.getElementById('tee-rating-select');
        const names = Array.prototype.map.call(sel.options, o => o.textContent);
        assert.deepEqual(names, ['Men · Blue', 'Men · Forward', 'Women · Blue', 'Women · Forward']);
        assert.equal(sb.document.getElementById('tee-rating-panel').style.display, 'block');
        assert.equal(sb.document.getElementById('tee-slope').value, '86');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '58.4');
        assert.equal(sb.document.getElementById('tee-par').value, '60');
        assert.match(sb.document.getElementById('tee-rating-filled').textContent, /Slope 86/);
        assert.match(sb.document.getElementById('tee-rating-filled').textContent, /Course Rating 58\.4/);
        assert.match(sb.document.getElementById('tee-rating-filled').textContent, /Par 60/);
        assert.equal(sb.document.getElementById('course-select').value, '');
        sel.value = 'male:1';
        vm.runInContext(/onchange="([^"]+)"/.exec(ADMIN.slice(ADMIN.indexOf('id="tee-rating-select"'), ADMIN.indexOf('id="tee-rating-select"') + 200))[1], sb);
        assert.equal(sb.document.getElementById('tee-slope').value, '83');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '57.1');
        const playing = sb.playerHandicapFields('10', null, sb.readTeeRatingFromDom());
        assert.equal(playing.handicapUnconverted, undefined);
        assert.equal(typeof playing.hcp, 'string');
        assert.ok(playing.hcp !== '10');
    });
});
