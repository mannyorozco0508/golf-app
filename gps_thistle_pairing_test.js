// ============================================================================
// THISTLE: THE ORGANIZER PICKS THE PAIRING, AND HOLES 1-18 GET THE RIGHT GREENS
// (gps-v1, 2026-10-07)
//
// Thistle is 27 holes in three nines - Cameron, Stewart, MacKay - and an
// 18-hole round is one of three pairings chosen at booking:
//
//     Stewart / MacKay      MacKay / Cameron      Cameron / Stewart
//
// The organizer chooses the pairing in round setup, with the "Front 9" and
// "Back 9" selects. This drives the SAME builder Save calls -
// admin.html previewCourseData() - with each official pairing selected, takes
// the card and the round name it produces, turns that name into the GPS
// course key exactly as the scorecard does (gps-geo.courseGpsKey), and checks
// that holes 1-9 carry the front nine's greens and 10-18 the back nine's, and
// that every hole's line length fits the par on the card the builder made.
//
// WHAT THE SETUP SCREEN ALLOWS THAT THE COURSE DOES NOT (reported 2026-10-07,
// not changed here): the two selects offer every nine on both sides, so
// MacKay / Stewart or Stewart / Stewart can be chosen, and the DEFAULT is
// Cameron / MacKay - not one of the three pairings. The GPS side handles any
// order correctly (last test); whether setup should offer only the three
// pairings is Manny's call.
//
// OSM spells the third nine "McKay"; the app, the card and this file say MacKay.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const skip = ON ? false : 'Consumer tree (GPS_ENABLED=0): no GPS greens to map';
const geo = ON ? require('./gps-geo.js') : null;
const table = ON ? require('./gps-courses.js') : null;

function setUp(front, back) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    const set = (id, prop, val) => { sb.document.getElementById(id)[prop] = val; };
    set('course-select', 'value', 'thistle_27');
    set('enable-custom-course', 'checked', false);
    set('front-nine-select', 'value', front);
    set('back-nine-select', 'value', back);
    const out = vm.runInContext('previewCourseData("thistle_27")', sb);
    return JSON.parse(JSON.stringify(out));
}

const OFFICIAL = [['stewart', 'mackay'], ['mackay', 'cameron'], ['cameron', 'stewart']];

OFFICIAL.forEach(([front, back]) => {
    test(`${front} / ${back}: the card, the name, the GPS key and the greens all line up`, { skip }, () => {
        const out = setUp(front, back);
        assert.ok(out.ok, out.reason);
        assert.strictEqual(out.data.length, 18, 'an 18-hole card');
        const cap = (s) => (s === 'mackay' ? 'MacKay' : s[0].toUpperCase() + s.slice(1));
        assert.strictEqual(out.courseNameOverride, `Thistle Golf Club (${cap(front)} / ${cap(back)})`);
        const key = geo.courseGpsKey('thistle_27', out.courseNameOverride, true);
        assert.strictEqual(key, `thistle_27_${front}_${back}`);
        const rec = geo.osmCourse(table, key);
        for (let n = 1; n <= 18; n++) {
            const nine = n <= 9 ? front : back;
            const src = table['thistle_27_' + nine].holes[String(n <= 9 ? n : n - 9)];
            assert.deepStrictEqual(rec.holes[String(n)], src, `hole ${n} should be ${nine} ${n <= 9 ? n : n - 9}`);
            const par = out.data[n - 1].par;
            const yds = rec.holes[String(n)].osm.lineM / 0.9144;
            const [lo, hi] = par === 3 ? [70, 260] : par === 4 ? [230, 500] : [400, 640];
            assert.ok(yds >= lo && yds <= hi, `hole ${n} (${nine}) is ${yds.toFixed(0)} yds on a par ${par}`);
        }
        // Stewart's rebuilt greens are flagged on the holes Stewart occupies in this pairing.
        const flagged = Object.keys(rec.verify || {}).map(Number).sort((a, b) => a - b);
        const expected = front === 'stewart' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : back === 'stewart' ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [];
        assert.deepStrictEqual(flagged, expected);
    });
});

test('the setup DEFAULT is Cameron / MacKay - not one of the three pairings (reported, not changed)', { skip }, () => {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js']);
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    assert.ok(/frontSelect\.selectedIndex = 0;\s*backSelect\.selectedIndex = \(loopKeys\.length > 1\) \? 1 : 0;/.test(src), 'positive: the default-selection lines');
    const keys = vm.runInContext('Object.keys(nineHoleLoops.thistle_27)', sb);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(keys)), ['cameron', 'mackay', 'stewart']);
    // selectedIndex 0 / 1 of that order:
    assert.ok(!OFFICIAL.some(([f, b]) => f === 'cameron' && b === 'mackay'), 'Cameron / MacKay is not an official pairing');
});

test('any order the setup screen allows still maps the right greens (MacKay / Stewart)', { skip }, () => {
    const out = setUp('mackay', 'stewart');
    const rec = geo.osmCourse(table, geo.courseGpsKey('thistle_27', out.courseNameOverride, true));
    assert.deepStrictEqual(rec.holes['1'], table.thistle_27_mackay.holes['1']);
    assert.deepStrictEqual(rec.holes['10'], table.thistle_27_stewart.holes['1']);
});
