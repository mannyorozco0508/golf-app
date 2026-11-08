// ============================================================================
// SHOTGUN NEXT HOLE - THE PURE FUNCTION, AND THE CARD STILL IN ITS
// PRE-APPROVAL STATE (Item 2, 2026-11-07)
//
// tournament-engine.js gains startingHoleNumber(), tournamentPlayOrder() and
// nextHoleInPlayOrder(). LOGIC ONLY: Manny has not approved the mockup, so
// tournament-scorecard.html is NOT wired and still says "Enter Hole 1" on a
// team that tees off on hole 8. The last describe block pins that CURRENT
// output on purpose - the wiring wave must flip it deliberately, not discover
// it changed.
//
// NAMED tournamentPlayOrder, NOT playOrder: play-order.js already declares a
// global playOrder for the consumer pages. The rotation is the same one, and
// the parity test below holds the two together on every numeric tee.
//
// WHAT THE HARNESS CAN AND CANNOT PROVE. The page test loads the real card
// through helpers/load-script.js and fires the page's own value listener with
// a record. mini-dom has no <template>, and setHolesListPreservingFocus parses
// through one, so the test gives created templates an empty `content`. On a
// FIRST render that branch is never read (the shape key differs, so the list
// is rebuilt from the html string); the shim only stops a throw. No layout, no
// scrolling: the once-only auto-scroll to the start row is not observable here.
//
// TESTS: 18 (final run of the finished file: 18 pass / 0 fail).
//
// WIRING WAVE (2026-11-08, mockup A2 approved by Manny). The last describe
// block's five page pins were FLIPPED ON PURPOSE to the wired card: "Enter
// Hole 8", rows 8..18 then 1..7, group card "Enter Hole 8", and the source
// now calling tournamentPlayOrder/nextHoleInPlayOrder. Still 18 tests, 18
// pass. Against c3b7a139's card those five fail and the 13 engine tests pass
// (13 / 5 / 0 / 18). The baseline and controls below are the logic wave's.
//
// BASELINE against 1fb1ef43 (tournament-engine.js sha256 3626301c...; the
// scorecard is unchanged by this wave, a18e5dbf...), the engine swapped back to
// that commit's copy and restored by sha from a saved copy:
//
//   4 PASS / 14 FAIL / 0 cancelled / 18 tests.   4 + 14 = 18.
//
// The file LOADS at baseline - the engine exists, only the new names do not -
// so each engine test fails on "not a function"; nothing is cancelled. The 14
// are the 13 engine tests plus the page test that also asks the engine for the
// answer. The 4 that pass are page-only pins on the card's pre-approval output,
// which this wave must NOT change: green before and after by design.
//
// NEGATIVE CONTROLS (mutation in the named file, test run, file restored by cp
// from a scratch copy, sha re-checked RESTORED-OK each time):
//   C1 drop the wrap (rotation keeps only tee..end)      engine  5 fail  CAUGHT
//   C2 ignore startingHole (always from the first hole)  engine 10 fail  CAUGHT
//   C3 "8A" unreadable (regex without the wave letter)   engine  1 fail  CAUGHT
//   C4 next = one past furthest scored, not first gap    engine  1 fail  CAUGHT
//   C5 status line "Enter Hole ${startingHole}"          card    3 fail  CAUGHT
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const engine = loadJsFile('tournament-engine.js');
const consumer = loadJsFile('play-order.js');
const plain = (v) => JSON.parse(JSON.stringify(v));

const card = (n) => [...Array(n)].map((_, i) => ({ hole: i + 1, par: [4, 5, 3][i % 3] }));
const C18 = card(18);
const C9 = card(9);
const scoredSet = (...holes) => (h) => holes.includes(h);
const next = (o) => plain(engine.nextHoleInPlayOrder(o));
const order = (holes, start) => engine.tournamentPlayOrder(holes, start).map((h) => Number(h.hole));

describe('Item 2. play order from the group\'s tee', () => {
    test('start 1, nothing scored: hole 1 with its par', () => {
        assert.deepEqual(next({ holes: C18, startingHole: '1', isScored: () => false }), { hole: 1, par: 4 });
        assert.deepEqual(order(C18, 1), C18.map((h) => h.hole));
    });

    test('start 8, nothing scored: "Enter Hole 8", not 1', () => {
        assert.deepEqual(next({ holes: C18, startingHole: '8', isScored: () => false }), { hole: 8, par: C18[7].par });
    });

    test('start 8 with 8 scored: next is 9', () => {
        assert.equal(next({ holes: C18, startingHole: 8, isScored: scoredSet(8) }).hole, 9);
    });

    test('wraps 18 -> 1: start 8 with 8..18 scored is hole 1, and the order is a rotation', () => {
        const done = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        assert.equal(next({ holes: C18, startingHole: '8', isScored: scoredSet(...done) }).hole, 1);
        assert.deepEqual(order(C18, '8'), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7]);
    });

    test('a skipped hole is next: 8 and 10 scored -> 9', () => {
        assert.equal(next({ holes: C18, startingHole: '8', isScored: scoredSet(8, 10) }).hole, 9);
    });

    test('all scored -> null', () => {
        assert.equal(engine.nextHoleInPlayOrder({ holes: C18, startingHole: '8', isScored: () => true }), null);
        assert.equal(engine.nextHoleInPlayOrder({ holes: [], startingHole: '8', isScored: () => false }), null);
    });

    test('9-hole round: start 5 wraps 9 -> 1, and a tee of 12 is not on this card', () => {
        assert.deepEqual(order(C9, 5), [5, 6, 7, 8, 9, 1, 2, 3, 4]);
        assert.equal(next({ holes: C9, startingHole: 5, isScored: scoredSet(5, 6, 7, 8, 9) }).hole, 1);
        assert.deepEqual(order(C9, 12), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test('the course\'s own hole list: a back-nine card plays 10..18, unsorted input is sorted', () => {
        const back = card(18).slice(9).reverse();
        assert.deepEqual(order(back, 14), [14, 15, 16, 17, 18, 10, 11, 12, 13]);
        assert.equal(next({ holes: back, startingHole: null, isScored: () => false }).hole, 10);
    });

    test('startingHole missing or garbage plays from hole 1', () => {
        [undefined, null, '', 'abc', '0', 'tee', {}, 99].forEach((s) =>
            assert.equal(next({ holes: C18, startingHole: s, isScored: () => false }).hole, 1, 'start ' + JSON.stringify(s)));
    });

    test('"8A" is hole 8 (the wave letter is a group, not a hole)', () => {
        assert.equal(engine.startingHoleNumber('8A'), 8);
        assert.equal(engine.startingHoleNumber(' 1b '), 1);
        assert.equal(engine.startingHoleNumber('A8'), null);
        assert.deepEqual(next({ holes: C18, startingHole: '8A', isScored: () => false }), { hole: 8, par: C18[7].par });
        assert.equal(next({ holes: C18, startingHole: '8B', isScored: scoredSet(8) }).hole, 9);
    });

    test('a rotation, never a filter: every hole once, input not mutated', () => {
        const input = card(18).reverse();
        const snap = JSON.stringify(input);
        const o = order(input, '13');
        assert.equal(o.length, 18);
        assert.deepEqual(o.slice().sort((a, b) => a - b), C18.map((h) => h.hole));
        assert.equal(JSON.stringify(input), snap);
    });

    test('parity with play-order.js on every numeric tee and on garbage', () => {
        [1, 2, 8, 10, 18, 0, 25, 'x'].forEach((s) => {
            const theirs = consumer.playOrder(C18, consumer.teeStartHole({ startingHole: s }, C18)).map((h) => h.hole);
            assert.deepEqual(order(C18, s), theirs, 'tee ' + s);
        });
    });

    test('isScored missing is treated as nothing scored', () => {
        assert.equal(next({ holes: C18, startingHole: '3' }).hole, 3);
    });
});

// ----------------------------------------------------------------------------
// THE CARD, WIRED (2026-11-08). These pinned the PRE-APPROVAL card ("Enter Hole
// 1" under "Starting Hole: 8", rows 1..18). Manny approved mockup A2 on
// 2026-11-08 and the wiring wave flipped all five ON PURPOSE, through the same
// page listener, to what the approved card shows. The fuller user-path guard
// is tournament_scorecard_wired_test.js.
// ----------------------------------------------------------------------------
const CODE = 'NXT1';
function openCard(query, record) {
    const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: '?' + query });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => {
        const n = make(tag);
        if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] };
        return n;
    };
    sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'tournaments/' + CODE)
        .forEach((x) => x.cb({ val: () => plain(record), exists: () => true }));
    const text = (id) => String(sb.document.getElementById(id).textContent || '');
    return { sb, text, list: String(sb.document.getElementById('holes-list').innerHTML || '') };
}
const COURSE = C18.map((h, i) => Object.assign({ hcpIndex: i + 1 }, h));
const teamEvent = () => ({ name: 'Shotgun Scramble', format: 'scramble', courseName: 'Tidewater', courseData: COURSE,
    startType: 'shotgun', teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], startingHole: '8' } }, scores: {} });
const groupEvent = () => ({ name: 'Shotgun Stroke', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
    courseName: 'Tidewater', courseData: COURSE, startType: 'shotgun',
    players: { pA: { id: 'pA', name: 'Ann Lee', handicap: '4' } },
    scoringGroups: { g1: { name: 'Group 1', playerIds: ['pA'], startingHole: '8' } }, scores: {} });

describe('WIRED (A2 approved 2026-11-08): the card plays from its tee', () => {
    test('team card on a hole-8 start, no scores: "Enter Hole 8" beside "Starting Hole: 8"', () => {
        const c = openCard('tourney=' + CODE + '&team=1', teamEvent());
        assert.equal(c.text('status-main'), 'Enter Hole 8', 'flipped from the pre-approval "Enter Hole 1"');
        assert.equal(c.text('starting-hole-banner'), '🚀 Starting Hole: 8');
        assert.equal(c.text('status-sub'), "Enter your team's score below to get started");
    });

    test('team card list is printed in play order: 8..18 then 1..7', () => {
        const c = openCard('tourney=' + CODE + '&team=1', teamEvent());
        const rows = [...c.list.matchAll(/id="hole-row-(\d+)"/g)].map((m) => Number(m[1]));
        assert.deepEqual(rows, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7]);
    });

    test('the card shows the engine answer: 8', () => {
        const rec = teamEvent();
        const hit = next({ holes: rec.courseData, startingHole: rec.teams.team1.startingHole,
            isScored: (h) => (rec.scores['team1_h' + h] || 0) > 0 });
        assert.equal(hit.hole, 8);
        assert.equal(openCard('tourney=' + CODE + '&team=1', rec).text('status-main'), 'Enter Hole ' + hit.hole);
    });

    test('individual group card on a hole-8 start: banner "Start on hole 8", status "Enter Hole 8"', () => {
        const c = openCard('tourney=' + CODE + '&group=g1', groupEvent());
        assert.equal(c.text('starting-hole-banner'), '🚀 Start on hole 8');
        assert.equal(c.text('status-main'), 'Enter Hole 8', 'flipped from the pre-approval "Thru 0"');
        assert.match(c.list, /id="hole-row-1"/);
        assert.match(c.list, /^\s*<div class="hole-row" id="hole-row-8"/, 'hole 8 is the first row');
    });

    test('the scorecard calls the play-order functions (source, identifiers)', () => {
        const src = fs.readFileSync(path.join(__dirname, 'tournament-scorecard.html'), 'utf8');
        assert.match(src, /`Enter Hole \$\{/, 'positive: the status names a computed hole');
        assert.ok(/nextHoleInPlayOrder\(/.test(src) && /tournamentPlayOrder\(/.test(src), 'wired');
        assert.ok(!/`Enter Hole 1`/.test(src), 'the hard-coded hole 1 is gone');
    });
});
