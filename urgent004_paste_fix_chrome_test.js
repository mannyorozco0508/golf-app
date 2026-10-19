// URGENT-004 IN REAL CHROME: a saved round whose twenty golfers still hold the
// whole pasted line as their name ("Glenn 12.0/B", HCP empty), the state Manny's
// Monday round was left in by the broken paste - with Flights switched on by hand,
// so every golfer reads A. Opening the round's Players step must split every row
// into name / HCP / flight (A 10 · B 10) and say "Fixed 20 golfers' handicaps and
// flights" - with no re-paste. Nothing is written until the organizer saves.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const CODE = 'URG4X';
const LINES = ['Skeens 2.0/A', 'Bob 5.0/A', 'Manny +2.0/A', 'Paul 4.0/A', 'Glenn 12.0/B', 'Marty 9.0/B', 'Scott 6.0/B', 'Eddie 12.0/B',
    'Carl 6.0/A', 'Matt 8.0/B', 'Jeremy 14.0/B', 'Matt 12.0/B', 'Kopp 6.0/A', 'Tim 1.0/A', 'Dalen +2.0/A', 'Mike 4.0/A',
    'Crone 10.0/B', 'Todd 14.0/B', 'Mike 6.0/A', 'Jim 12.0/B'];
const DB = {
    events: { [CODE]: {
        eventName: 'Monday', courseName: 'Test Links', activeCourseKey: 'comm_links', gameFormat: 'stroke', courseData: CD,
        scores: {}, settlementMode: 'whole-dollar',
        flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' },
        players: LINES.map((l, i) => ({ id: 101 + i, name: l, hcp: '', team: 'Team ' + (Math.floor(i / 2) + 1), squad: i % 2 ? 'blue' : 'red', playingForMoney: true, flight: 'A' }))
    } },
    global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, tournaments: {}
};
const READ = `(function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#player-list .player-row'));
    var note = document.getElementById('roster-fix-note');
    if (typeof refreshFlightsCount === 'function') refreshFlightsCount();
    return JSON.stringify({
        rows: rows.map(function (r) {
            var f = r.querySelector('.p-flight-input');
            return [(r.querySelector('.p-name-input') || {}).value, (r.querySelector('.p-hcp-input') || {}).value, f ? f.getAttribute('data-flight') : null];
        }),
        count: (document.getElementById('flights-count') || {}).textContent || '',
        note: note && note.offsetParent !== null ? note.innerText : '',
        writes: (window.__coldWrites || []).length
    });
})()`;

describe("URGENT-004: Manny's 20 rows fix themselves when the round's Players step opens", () => {
    test('name / HCP / flight split, A 10 · B 10, the note, nothing written', { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', 'game=' + CODE),
            db: DB, settleMs: 2500, viewport: { width: 390, height: 844 },
            steps: [{ expression: "(function(){ if (typeof goToWizardStep === 'function') goToWizardStep(5); return 'ok'; })()" }, { sleep: 600 }, { expression: READ }]
        });
        assert.equal(r.ok, true, r.reason);
        const s = JSON.parse(r.value.filter(v => typeof v === 'string' && v.charAt(0) === '{').pop());
        assert.deepEqual(s.rows.map(x => x[0]), ['Skeens', 'Bob', 'Manny', 'Paul', 'Glenn', 'Marty', 'Scott', 'Eddie', 'Carl', 'Matt', 'Jeremy', 'Matt', 'Kopp', 'Tim', 'Dalen', 'Mike', 'Crone', 'Todd', 'Mike', 'Jim']);
        assert.deepEqual(s.rows.map(x => x[1]), ['2.0', '5.0', '+2.0', '4.0', '12.0', '9.0', '6.0', '12.0', '6.0', '8.0', '14.0', '12.0', '6.0', '1.0', '+2.0', '4.0', '10.0', '14.0', '6.0', '12.0']);
        assert.deepEqual(s.rows.filter(x => x[2] === 'B').map(x => x[0]), ['Glenn', 'Marty', 'Scott', 'Eddie', 'Matt', 'Jeremy', 'Matt', 'Crone', 'Todd', 'Jim']);
        assert.equal(s.count, 'A: 10 · B: 10');
        assert.match(s.note, /Fixed 20 golfers' handicaps and flights\./);
        assert.match(s.note, /Two golfers named Matt, two golfers named Mike/);
        assert.equal(s.writes, 0, 'opening the step must not write the round');
    });
});
