// ============================================================================
// ONE ENTRY PER COURSE IN THE PICKER, AND IT IS THE ONE WITH TEES (2026-10-08)
//
// Manny's decision, after the tee-dropdown audit. The picker draws TWO lists:
// the hard-coded courseDirectory in course-data.js, and the gca_/comm_ records
// out of global_courses. Two courses were in both, and the hard-coded copy was
// the one with NO rated tees:
//
//   "Camas Meadows Golf Club"  swwa_camasmeadows  built in, 0 tee sets
//   "Camas Meadows Golf Course" gca_p5mcq4dm      shared,  14 tee sets
//   "Chambers Bay"              wa_chambers       built in, 0 tee sets
//   "Chambers Bay Golf Club"    gca_50bc8qqa      shared,  20 tee sets
//
// Picking the built-in one gave a round that could never offer a per-golfer
// tee, and the two entries sat next to each other looking like the same course
// typed twice. So the built-in ENTRY goes and the shared record stays.
//
// WHAT MUST NOT BREAK, and it is the whole reason this file exists rather than
// a two-line deletion on its own: 37 saved rounds point at those two keys.
// Measured on the live database 2026-10-08 - 14 on wa_chambers, 23 on
// swwa_camasmeadows, and 36 of the 37 carry their own pars and stroke indexes.
// The one that does not (4MT92T, "Single Round" on Camas Meadows) reads the
// shared record, which is not being touched.
//
// So this pins THREE things, and the name is the one that could go quietly
// wrong: getCourseNameById reads courseDirectory FIRST and global_courses
// second, so deleting a directory entry moves those rounds onto the second
// branch. If that branch did not answer, every one of those 37 rounds would
// open with a blank course name.
//
// BASELINE, against main 4eec65d (course-data.js sha dc865d97cb2c704e), all 5
// tests: 3 PASS / 2 FAIL. 3 + 2 = 5. The THREE that pass there are the ones
// that must be TRUE BEFORE AND AFTER - the directory parsing as a real list,
// the card still being in coursePresets, and the name still resolving. They are
// the safety net, not evidence of the change; the two reds are the change.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const GONE = [
    { id: 'swwa_camasmeadows', name: 'Camas Meadows Golf Club', twin: 'Camas Meadows Golf Course' },
    { id: 'wa_chambers', name: 'Chambers Bay', twin: 'Chambers Bay Golf Club' }
];

function directory() {
    const sb = loadJsFile('course-data.js', []);
    return JSON.parse(vm.runInContext(`(function () {
        var out = [];
        courseDirectory.forEach(function (g) {
            (g.items || []).forEach(function (i) { out.push({ id: i.id, name: i.name, group: g.group }); });
        });
        return JSON.stringify(out);
    })()`, sb));
}

describe('1. THE PICKER NO LONGER OFFERS THE TEE-LESS COPY', () => {

    test('the directory is still a real list - the positive control', () => {
        // Without this, every "is not in the list" below is true of an empty one.
        const d = directory();
        assert.ok(d.length > 20, 'courseDirectory parsed as ' + d.length + ' entries - parsing is broken');
        assert.ok(d.some(i => i.id === 'caledonia'), 'Caledonia is gone from the directory too, so this deleted the wrong thing');
    });

    GONE.forEach((c) => {
        test(`${c.name} is not hard-coded in the picker any more`, () => {
            const d = directory();
            const hit = d.filter(i => i.id === c.id || i.name === c.name);
            assert.deepEqual(hit, [],
                c.name + ' is still in courseDirectory, so the picker shows it beside "' + c.twin
                + '" and the one a golfer taps has no rated tees');
        });
    });

    test('BUT THE CARD STAYS, because 37 saved rounds point at these keys', () => {
        const sb = loadJsFile('course-data.js', []);
        const got = JSON.parse(vm.runInContext(`(function () {
            var out = {};
            ${JSON.stringify(GONE.map(c => c.id))}.forEach(function (k) {
                var p = (typeof coursePresets !== 'undefined') ? coursePresets[k] : null;
                out[k] = p ? ((p.data || []).length) : 0;
            });
            return JSON.stringify(out);
        })()`, sb));
        GONE.forEach((c) => {
            assert.equal(got[c.id], 18,
                c.id + ' lost its card (' + got[c.id] + ' holes). The ENTRY comes out of the picker; '
                + 'the pars and stroke indexes stay, or every round on that key opens blank.');
        });
    });

    test('AND THE NAME STILL RESOLVES, off the shared record instead of the directory', () => {
        // getCourseNameById reads courseDirectory first and global_courses
        // second. Deleting the first answer moves these rounds onto the second,
        // so the second is asserted here rather than assumed.
        const sb = loadJsFile('course-data.js', []);
        const got = JSON.parse(vm.runInContext(`(function () {
            var shared = { swwa_camasmeadows: { name: 'Camas Meadows Golf Club' },
                           wa_chambers: { name: 'Chambers Bay' } };
            return JSON.stringify({
                camas: getCourseNameById('swwa_camasmeadows', shared),
                chambers: getCourseNameById('wa_chambers', shared),
                // AND A KEY NOBODY HAS STILL ANSWERS EMPTY, so this is not a
                // function that simply echoes whatever it is given.
                nonsense: getCourseNameById('no_such_course', shared)
            });
        })()`, sb));
        assert.equal(got.camas, 'Camas Meadows Golf Club',
            'a round on swwa_camasmeadows would open with the course name "' + got.camas + '"');
        assert.equal(got.chambers, 'Chambers Bay',
            'a round on wa_chambers would open with the course name "' + got.chambers + '"');
        assert.equal(got.nonsense, '', 'getCourseNameById invents a name for an unknown key');
    });
});
