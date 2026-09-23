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
// THE UNTOUCHED SCREEN. The Course step's note and the three fields are in
// the HTML. A test that only called syncTeeRatingFromCourse would miss a
// page that never filled them. The default assertion reads the markup. The
// tee-fill assertion clicks selectCourse, which is what a course row calls.
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

describe('Setup shows the tee, and the default is the missing-rating sentence', () => {
    test('the course step ships empty Slope, Course Rating, and Par', () => {
        assert.match(ADMIN, /id="tee-slope"/);
        assert.match(ADMIN, /id="tee-course-rating"/);
        assert.match(ADMIN, /id="tee-par"/);
        assert.match(ADMIN, /id="tee-allowance" value="100"/);
        assert.ok(!/id="tee-slope"[^>]*value=/.test(ADMIN), 'Slope is empty until a tee fills it');
        const note = H.handicapUnconvertedNote();
        assert.ok(ADMIN.includes(note), 'the sentence on the page is the one the converter uses');
        assert.match(ADMIN, /playerHandicapFields\(/);
        const save = ADMIN.slice(ADMIN.indexOf('const playersList = []'), ADMIN.indexOf('playersList.push(entry)') + 'playersList.push(entry)'.length);
        assert.ok(save.length > 80);
        assert.match(save, /playerHandicapFields\(/);
        assert.match(save, /playersList\.push\(entry\)/);
        assert.match(ADMIN, /teeRating: teeForSave/);
    });

    test('choosing a tee fills Slope, Course Rating, and Par', () => {
        const sb = loadHtmlInlineScript('admin.html', ['handicap.js', 'course-data.js', 'action-model.js']);
        // mini-dom does not parse text nodes out of markup, so the sentence is
        // pinned against the file above. The live fields start empty.
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
        assert.equal(sb.document.getElementById('tee-slope').value, '130');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '71.8');
        assert.equal(sb.document.getElementById('tee-par').value, '72');
        assert.match(sb.document.getElementById('tee-rating-note').textContent, /Slope 130/);
        assert.match(sb.document.getElementById('tee-rating-note').textContent, /Playing Handicap/);
        const fields = sb.playerHandicapFields('10', null, sb.readTeeRatingFromDom());
        assert.equal(fields.handicapIndex, '10');
        assert.equal(fields.hcp, '11');
        assert.equal(fields.handicapUnconverted, undefined);
        assert.equal(typeof fields.courseHandicap, 'number');
        vm.runInContext(`selectCourse('gca_plain', 'No Rating');`, sb);
        assert.equal(sb.document.getElementById('tee-slope').value, '');
        assert.equal(sb.document.getElementById('tee-course-rating').value, '');
        assert.equal(sb.document.getElementById('tee-par').value, '');
        assert.equal(sb.document.getElementById('tee-rating-note').textContent, sb.handicapUnconvertedNote());
        // A record can carry tees and no hole card. The grid write must not
        // throw before the rating fields are filled.
        vm.runInContext(`globalCourses['gca_teesonly'] = { name: 'Tees Only', tees: { male: [{ name: 'Blue', rating: 72, slope: 130, parTotal: 72 }] } }; selectCourse('gca_teesonly', 'Tees Only');`, sb);
        assert.equal(sb.document.getElementById('tee-slope').value, '130');
        assert.equal(sb.document.getElementById('tee-par').value, '72');
    });
});
