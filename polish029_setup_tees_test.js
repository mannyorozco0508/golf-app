// ============================================================================
// POLISH 029 #1: A NEW GOLFER GETS THE ROUND'S PICKED TEE.
//
// Walked on the Simulator (029, shots 04/10/51): White picked at Papago, the golfer saved on
// "Men · Black 75.0/130"; the next round at Dobson (no Black tee) saved the golfer on Papago's
// Black again; Game Day's new golfer row showed Black while the round was White.
// THE CAUSE: a row's tee dropdown was a copy of the round select taken when the row was built,
// and never touched again - a tee tapped later, or another course, left the row on the old
// value (the first option, the tips) and the old course's options. The save reads the row.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const DEPS = ['course-data.js', 'player-tees.js', 'roster-paste.js', 'handicap.js', 'handicap-labels.js'];
const PAPAGO = { male: [{ name: 'Black', slope: 130, rating: 75.0, parTotal: 72 }, { name: 'Blue', slope: 125, rating: 72.0, parTotal: 72 },
                        { name: 'White', slope: 120, rating: 70.1, parTotal: 72 }, { name: 'Gold', slope: 111, rating: 65.0, parTotal: 72 }] };
const DOBSON = { male: [{ name: 'Back', slope: 128, rating: 72.9, parTotal: 72 }, { name: 'White', slope: 119, rating: 70.0, parTotal: 72 }],
                 female: [{ name: 'Red', slope: 117, rating: 70.5, parTotal: 72 }] };
const page = () => loadHtmlInlineScript('admin.html', DEPS, { search: '?game=TEE029' });
const SETUP = `globalCourses['papago'] = { name: 'Papago', data: [{ hole: 1, par: 4, hcpIndex: 1 }], tees: ${JSON.stringify(PAPAGO)} };
    globalCourses['dobson'] = { name: 'Dobson', data: [{ hole: 1, par: 4, hcpIndex: 1 }], tees: ${JSON.stringify(DOBSON)} };
    function useCourse(k) { var c = document.getElementById('course-select'); if (c) c.value = k; syncTeeRatingFromCourse(k, {}); }
    function pickTee(k) { var s = document.getElementById('tee-rating-select'); s.value = k; applySelectedTee(); }
    function rows() { var out = [], rs = document.getElementById('player-list').querySelectorAll('.player-row');
        for (var i = 0; i < rs.length; i++) { var sel = rs[i].querySelector('.p-tee-input'), o = sel && Array.prototype.filter.call(sel.options, function (x) { return x.value === sel.value; })[0];
            out.push({ key: rs[i].getAttribute('data-tee-key') || '', val: sel ? sel.value : null, text: o ? o.textContent : '', n: sel ? sel.options.length : 0 }); }
        return out; }`;
const run = (sb, js) => JSON.parse(vm.runInContext('(function () {' + SETUP + js + '})()', sb));

describe('POLISH #1: the golfer row is on the round\'s picked tee', () => {
    test('a row built on the default (the tips) moves to the tee picked afterwards', () => {
        const r = run(page(), "useCourse('papago'); addPlayerRow('Test A', '12'); var before = rows()[0]; pickTee('male:2'); return JSON.stringify({ before: before, after: rows()[0], round: document.getElementById('tee-rating-select').value });");
        assert.equal(r.before.text, 'Men · Black', 'fixture: the row starts on the first option, as on the phone');
        assert.equal(r.round, 'male:2');
        assert.equal(r.after.val, 'male:2', 'the golfer stayed on ' + r.after.text + ' with White picked');
        assert.equal(r.after.text, 'Men · White');
        assert.equal(r.after.key, 'male:2');
    });
    test('another course: the row takes THAT course\'s tees and the round\'s tee - never Papago\'s Black', () => {
        const r = run(page(), "useCourse('papago'); addPlayerRow('Test A', '12'); useCourse('dobson'); pickTee('male:1'); return JSON.stringify(rows()[0]);");
        assert.equal(r.n, 3, 'the row still offers the old course\'s ' + r.n + ' tees');
        assert.equal(r.val, 'male:1');
        assert.equal(r.text, 'Men · White');
    });
    test('a golfer\'s OWN tee (picked on the row) stays when the round tee changes on the same course', () => {
        const r = run(page(), `useCourse('papago'); addPlayerRow('Own', '5'); addPlayerRow('Follow', '9');
            var s = document.getElementById('player-list').querySelectorAll('.player-row')[0].querySelector('.p-tee-input');
            s.value = 'male:1'; (s._listeners.change || []).forEach(function (f) { f({}); });
            pickTee('male:3'); return JSON.stringify(rows());`);
        assert.equal(r[0].val, 'male:1', 'the golfer\'s own Blue was overwritten');
        assert.equal(r[1].val, 'male:3', 'CONTROL: the other golfer follows the round');
    });
    test('...but a new course puts even that golfer on the round\'s tee (keys are positions)', () => {
        const r = run(page(), `useCourse('papago'); addPlayerRow('Own', '5');
            var s = document.getElementById('player-list').querySelectorAll('.player-row')[0].querySelector('.p-tee-input');
            s.value = 'male:0'; (s._listeners.change || []).forEach(function (f) { f({}); });
            useCourse('dobson'); pickTee('male:1'); return JSON.stringify(rows()[0]);`);
        assert.equal(r.text, 'Men · White', 'a tee from another course was carried over: ' + r.text);
    });
    test('a copied golfer whose tee was named for another course is not put on that key here', () => {
        const r = run(page(), `useCourse('dobson'); pickTee('male:1');
            appendPlayerFrom({ name: 'Copied', hcp: '7', tee: { teeKey: 'male:0', teeName: 'Men · Black' } }, false, 1);
            appendPlayerFrom({ name: 'Same', hcp: '7', tee: { teeKey: 'male:0', teeName: 'Men · Back' } }, false, 2);
            return JSON.stringify(rows());`);
        assert.equal(r[0].val, 'male:1', 'Papago\'s "Men · Black" landed on Dobson\'s ' + r[0].text);
        assert.equal(r[1].val, 'male:0', 'CONTROL: a tee that IS this course\'s keeps its key');
    });
    test('the save stores no per-golfer tee when the golfer is on the round tee (source)', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, 'admin.html'), 'utf8');
        assert.match(src, /rowTee\.teeKey !== teeForSave\.teeKey/, 'the save\'s same-tee rule moved');
    });
});
