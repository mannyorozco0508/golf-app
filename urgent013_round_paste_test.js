// ============================================================================
// 013 (setup-flow simulations, path D): "PASTE THE WHOLE ROUND (groups, teams, games)"
// WITH MANNY'S 20 PAIRINGS.
//
// It sits on the same Players step as Paste Player List, and the pairings ARE groups,
// so it is a button the organizer can reach for. URGENT-004 taught Paste Player List
// the "Skeens 2.0/A" form; this paste never learned it. Measured in Chrome
// (tools/sim/setup-shapes.js D-wholeround), the exact text read as "1 day, 19 golfers"
// with golfers called "A" and "B", groups of 8, "This looks like 2 days", the two
// Matts and two Mikes as one golfer each with "two handicaps" - and Confirm wrote that
// roster. Two causes:
//   1. tspPlayersLine splits golfers on "/", so "2.0/A" became a golfer named "A";
//   2. tripItinDate took "Marty 9.0" for March 9 (any word STARTING with a month
//      abbreviation), so line 6 began a new day.
// The space form ("Skeens 2.0 A") read NO golfers at all (every line "Not understood").
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'trip-setup-paste.js'));
const skip = ON ? false : 'Consumer tree: no HardPan paste';
const I = require('./trip-itinerary.js');
const R = require('./roster-paste.js');
Object.assign(global, { tripItinParseLine: I.tripItinParseLine, tripItinTime: I.tripItinTime, tripItinCourse: I.tripItinCourse, splitTrailingHcpFlight: R.splitTrailingHcpFlight });
const P = ON ? require('./trip-setup-paste.js') : null;
const F = require('./tools/sim/lib/fixtures.js');

function flat(r) { return r.days[0].groups.map((g) => g.players.map((p) => [p.name, p.hcp, p.flight || null])); }

for (const [form, text] of [['"Skeens 2.0/A"', F.PAIRINGS_SLASH], ['"Skeens 2.0 A"', F.PAIRINGS_SPACE]]) {
    test('Manny\'s 20 pairings, ' + form + ': one day, five groups of 4, every name / handicap / flight', { skip }, () => {
        const r = P.parseSetupPaste(text, { year: 2026 });
        assert.equal(r.days.length, 1, 'one day (no "Marty 9" March 9)');
        const g = flat(r);
        assert.deepEqual(g.map((x) => x.length), [4, 4, 4, 4, 4]);
        const all = [].concat(...g);
        assert.deepEqual(all.map((x) => x[0]), F.NAMES);
        assert.deepEqual(all.map((x) => x[1]), F.HCP);
        assert.deepEqual(all.map((x) => x[2]), F.FLIGHT);
        assert.equal(all.filter((x) => x[2] === 'A').length, 10);
        assert.ok(!r.flags.some((f) => /Not understood|Not a name/.test(f.why)), 'nothing left out: ' + r.flags.map((f) => f.why).join(' | '));
    });
}

test('a flight is read only right after a handicap: "Matt B" and "Jim B" stay names; "Manny 8 / Jimmy 11" stays two golfers', { skip }, () => {
    assert.deepEqual(P.tspPlayersLine('Matt B, Jim B').players.map((p) => [p.name, p.flight || null]), [['Matt B', null], ['Jim B', null]]);
    assert.deepEqual(P.tspPlayersLine('Manny 8 / Jimmy 11').players.map((p) => [p.name, p.hcp]), [['Manny', '8'], ['Jimmy', '11']]);
    assert.deepEqual(P.tspPlayersLine('Manny 8 / B Jimmy 11').players.map((p) => [p.name, p.hcp, p.flight || null]), [['Manny', '8', null], ['Jimmy', '11', 'B']]);
    const vs = P.tspPlayersLine('Skeens 2.0/A & Bob 5.0/A vs Manny +2.0/A & Paul 4.0/A');
    assert.deepEqual(vs.teams, [['Skeens', 'Bob'], ['Manny', 'Paul']]);
    assert.deepEqual(vs.players.map((p) => p.flight), ['A', 'A', 'A', 'A']);
});

test('a month is a month: "Mar 9", "March 9", "Sept 4", "Oct 13" are dates; "Marty 9", "Junior 4", "Augie 8", "Decker 3", "Janet 12" are not', () => {
    for (const d of ['Mar 9', 'March 9', 'Sept 4', 'Sep 4', 'Oct 13', 'October 13', 'Jan. 2']) assert.ok(I.tripItinDate(d, 2026), d + ' is a date');
    for (const n of ['Marty 9', 'Junior 4', 'Augie 8', 'Decker 3', 'Janet 12', 'Mayer 7', 'Octavio 5', 'Novak 6']) assert.equal(I.tripItinDate(n, 2026), null, n + ' is a name');
    assert.equal(I.tripItinDate('Mar 9', 2026).iso, '2026-03-09');
});
