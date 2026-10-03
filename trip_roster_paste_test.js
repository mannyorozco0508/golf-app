// ============================================================================
// THE PASTED TRIP ROSTER, THE TRIP'S NAME, AND THE ROUND PICKER (2026-10-03)
//
// A trip is built before anybody knows who is coming. Every round starts with
// placeholders - "Player 1" ... "Player 12", which is three groups - and the
// real list arrives later, in a note on the organizer's phone:
//
//     B Jimmy 11 (captain)
//     A Paul 3.5
//     Marty 9
//     Lance 14.3
//
//     Reese 6
//     ...
//
// THE RULES THAT COST MONEY IF THEY ARE WRONG:
//
//   1. A ROUND WITH SCORES IS NEVER TOUCHED. Handicaps are read off the roster,
//      side matches name its player ids, the pool charges per golfer. The guard
//      is not "the field was not written" - it is the played round settling to
//      the SAME CENT before and after, with a $40 match on it, through the app's
//      own engines in one realm.
//   2. THE PASTED GOLFERS TAKE THE PLACEHOLDER SLOTS IN ORDER, AND THE SLOT
//      KEEPS ITS ID. Anything in an open round already pointing at a player id -
//      a side match set up in advance, a pool entry - must still point at the
//      same seat rather than at a golfer who no longer exists.
//   3. HANDICAPS ARE READ, AND A BRACKETED NOTE DOES NOT EAT ONE. "B Jimmy 11
//      (captain)" is Jimmy, flight B, handicap 11 - measured, because before
//      roster-paste.js's note stripper it parsed to the NAME "Jimmy 11
//      (captain)" with no handicap at all.
//   4. GROUPS ONLY WHEN THEY TILE THE ROSTER EXACTLY. Group sizes are positional
//      and a group decides who sees which wagers, so a pasted run written over a
//      roster that still holds leftover placeholders would put somebody in the
//      wrong group. When they cannot tile it, nothing is written and the review
//      says so.
//   5. ONE PARSER FOR BOTH PAGES. The same pasted list goes into a round
//      (admin.html) and into the trip that holds it (trip.html); two copies of
//      the rules would be two different sets of strokes.
//
// AND TWO SMALLER THINGS IN THE SAME WAVE: the trip's name can be corrected
// (Manny's Myrtle week went in as "Myrtle Beach 2006" and there was no way to
// edit it), and "Start From" lists rounds in DATE order naming the course
// ("Tue 10/13 AM - Caledonia") instead of unsorted Day labels.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout and trip.html's top-level
// `let` bindings are not sandbox properties, so the paste cannot be driven from
// here; the UI rules below are source scans with positive assertions, and the
// money and parsing rules are the real functions on real fixtures.
//
// BASELINE. Against fbd7ba1 (trip.html sha 794dcbb43cb0, trip-roster.js sha
// 1e8262acc9bd, admin.html sha 5002d90e277c). On that build roster-paste.js does
// not exist at all, the require throws at load, and node reports the FILE as one
// failing test: 0 pass / 1 fail, which is red and proves nothing per assertion.
// So the useful baseline is measured with THIS WAVE'S roster-paste.js present and
// the three pages at HEAD, over the FINISHED file, all 22 tests: 2 PASS / 20 FAIL.
//
//   THE TWO PASSES say nothing about this wave: the engine sha pins, and the
//   parser reading "B Jimmy 11 (captain)" - which is roster-paste.js's own rule,
//   carried over from admin.html unchanged. Every rule about placeholders, ids,
//   groups, the round picker, the rename and the one-parser claim is red.
//
// All seven files touched were restored by sha from saved copies (trip.html
// ae07af0fae77619a, trip-roster.js 460730b503a05e36, admin.html edd63dadbe93b463,
// roster-paste.js 6b9b4aa7ac2bbdb5, paste_flights_test.js 498f5e15fa10bbb7,
// sw.js aa44f2fefd52d6e6, sync-mobile-web.js d7a87de4fc830915), never with git
// restore.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const R = require('./trip-roster.js');
const P = require('./roster-paste.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha12 = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 12);
const TRIP = read('trip.html');
const ADMIN = read('admin.html');

// The engines in one realm, so the money assertions are the app's own arithmetic
// rather than a restatement of it.
const ctx = { console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
              parseInt, parseFloat, Date, isFinite };
vm.createContext(ctx);
['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'pool-engine.js', 'settlement-engine.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const money = (d) => plain(ctx.computeRoundMoneyByPlayer(d, d.courseData, d.scores));
const receipts = (d) => plain(ctx.buildSideMatchReceipts(d, d.courseData, d.scores));

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Marty', hcp: '4' }, { id: 102, name: 'Dee', hcp: '9' },
              { id: 103, name: 'Reese', hcp: '0' }, { id: 104, name: 'Jimmy', hcp: '12' }];
function playedScores() {
    const s = {};
    FOUR.forEach((p) => cd18.forEach((h) => { s['p' + p.id + '_h' + h.hole] = 4; }));
    [[1, 101], [5, 102], [9, 103], [13, 104]].forEach(([h, w]) => { s['p' + w + '_h' + h] = 3; });
    return s;
}
const PLAYED = {
    players: FOUR, courseData: cd18, scores: playedScores(), gameFormat: 'stroke',
    sideMatches: { m1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                         startHole: 1, stake: 40, pressRule: 'none', createdAt: 1 } }
};
const holders = (n) => Array.from({ length: n }, (_, i) => ({
    id: 101 + i, name: 'Player ' + (i + 1), hcp: '', team: 'Team 1', squad: 'red', playingForMoney: true }));
const OPEN12 = () => ({ players: holders(12), courseData: cd18, scores: {}, gameFormat: 'stroke' });
const rounds = () => [
    { code: 'AAA', label: 'Day 1 AM', data: JSON.parse(JSON.stringify(PLAYED)) },
    { code: 'BBB', label: 'Day 1 PM', data: OPEN12() },
    { code: 'CCC', label: 'Day 2', data: OPEN12() }
];

// Manny's own shape: a flight letter, a bracketed note, handicaps, and a blank
// line between groups.
const PASTE8 = ['B Jimmy 11 (captain)', 'A Paul 3.5', 'Marty 9', 'Lance 14.3',
                '', 'Reese 6', 'Mike 12', 'Dave 18', 'Tom 2'].join('\n');
const paste = (text) => P.parsePlayerPasteText(text);

// ===========================================================================
describe('1. A PLAYED ROUND KEEPS ITS ROSTER, ITS SCORES AND ITS MONEY', () => {

    test('THE PLAYED ROUND SETTLES THE SAME BEFORE AND AFTER A PASTE - to the cent', () => {
        const rs = rounds();
        const played = rs[0].data;
        const before = money(played);
        const beforeR = receipts(played);
        const plan = R.tripRosterPlan(rs);
        R.tripRosterPasteUpdates(plan, paste(PASTE8));
        // The played round's data object is the one the plan held, so if the
        // builder mutated it in place this is where it shows.
        assert.deepEqual(money(played), before, 'the played round settles differently after a paste');
        assert.deepEqual(receipts(played), beforeR);
        // NON-VACUITY ON THE RECEIPTS. The round's own format is Stroke Play with
        // no wager, so every net on computeRoundMoneyByPlayer is legitimately 0;
        // the $40 that makes this worth settling is the side match.
        assert.ok(beforeR.some((r) => (r.segments || []).some((g) => Math.abs(Number(g.money) || 0) > 0)),
            'the fixture settles no real money, so this is vacuous');
    });

    test('and it is not in the write AT ALL - by path, not by hope', () => {
        const plan = R.tripRosterPlan(rounds());
        const built = R.tripRosterPasteUpdates(plan, paste(PASTE8));
        const paths = Object.keys(built.updates);
        assert.ok(paths.length > 0, 'nothing was written, so this proves nothing');
        paths.forEach((p) => {
            assert.ok(!/AAA/.test(p), 'the played round is in the write: ' + p);
            assert.match(p, /^events\/(BBB|CCC)\/(players|groupSizeOverrides)$/);
        });
    });

    test('every round played means nothing is written, and the review says why', () => {
        const plan = R.tripRosterPlan([{ code: 'A', label: 'Day 1', data: PLAYED }]);
        const built = R.tripRosterPasteUpdates(plan, paste(PASTE8));
        assert.deepEqual(built.updates, {});
        assert.match(built.note, /keeps the roster it was played with/);
    });

    test('THE BUILDER RETURNS A WRITE; IT DOES NOT APPLY ONE', () => {
        const rs = rounds();
        const snapshot = JSON.stringify(rs);
        const plan = R.tripRosterPlan(rs);
        R.tripRosterPasteUpdates(plan, paste(PASTE8));
        assert.equal(JSON.stringify(rs), snapshot, 'the rounds were mutated in place');
    });

    test('the money engines are the ones that were signed off', () => {
        assert.equal(sha12('money-engine.js'), '12bfa41c2c8e');
        assert.equal(sha12('settlement-engine.js'), 'd9ee5e5a1afc');
        assert.equal(sha12('pool-engine.js'), '372e76d7d5c4');
        assert.equal(sha12('action-model.js'), '399ba26f0025');
        assert.equal(sha12('handicap.js'), '2d3b2f7fd916');
    });
});

// ===========================================================================
describe('2. PLACEHOLDERS FIRST, IN ORDER, KEEPING THE SEAT', () => {

    test('a placeholder is "Player 7"; a golfer called Player is not', () => {
        ['Player 1', 'player 12', 'Player12', '  Player 3  '].forEach((n) =>
            assert.equal(R.tripIsPlaceholderName(n), true, n));
        ['Player', 'Playerman 4', 'Jimmy', 'Player One', ''].forEach((n) =>
            assert.equal(R.tripIsPlaceholderName(n), false, n));
    });

    test('eight pasted into twelve placeholders: eight replaced, four left, ids unchanged', () => {
        const plan = R.tripRosterPlan(rounds());
        const built = R.tripRosterPasteUpdates(plan, paste(PASTE8));
        const list = built.updates['events/BBB/players'];
        assert.equal(list.length, 12);
        assert.deepEqual(list.slice(0, 8).map((p) => p.name),
            ['Jimmy', 'Paul', 'Marty', 'Lance', 'Reese', 'Mike', 'Dave', 'Tom']);
        assert.deepEqual(list.slice(0, 8).map((p) => p.id), [101, 102, 103, 104, 105, 106, 107, 108],
            'the seat keeps its id, or anything pointing at it is orphaned');
        assert.deepEqual(list.slice(8).map((p) => p.name), ['Player 9', 'Player 10', 'Player 11', 'Player 12']);
        assert.equal(built.replaced, 16, 'eight in each of the two open rounds');
        assert.equal(built.added, 0);
        assert.match(built.note, /4 placeholders left over/);
    });

    test('THIRTY-TWO PASTED INTO TWELVE: the rest are added, with fresh ids', () => {
        const text = Array.from({ length: 32 }, (_, i) => 'Golfer' + (i + 1) + ' ' + (i % 20))
            .map((l, i) => (i && i % 4 === 0 ? '\n' + l : l)).join('\n');
        const plan = R.tripRosterPlan(rounds());
        const built = R.tripRosterPasteUpdates(plan, paste(text));
        const list = built.updates['events/BBB/players'];
        assert.equal(list.length, 32);
        assert.equal(new Set(list.map((p) => p.id)).size, 32, 'two golfers share an id');
        assert.deepEqual(list.slice(0, 12).map((p) => p.id), holders(12).map((p) => p.id));
        assert.equal(list[0].name, 'Golfer1');
        assert.equal(list[31].name, 'Golfer32');
    });

    test('a name already on the round is not added twice', () => {
        const rs = [{ code: 'BBB', label: 'Day 1 PM',
            data: { players: [{ id: 101, name: 'Jimmy', hcp: '11' }].concat(holders(3)),
                    courseData: cd18, scores: {}, gameFormat: 'stroke' } }];
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rs), paste('Jimmy 11\nPaul 3.5'));
        const list = built.updates['events/BBB/players'];
        assert.equal(list.filter((p) => p.name === 'Jimmy').length, 1,
            'two entries with one name is two golfers to every engine in this app');
        assert.equal(list[0].id, 101, 'and the one already there keeps its seat');
        assert.equal(list[1].name, 'Paul');
    });

    test('nothing pasted writes nothing', () => {
        const plan = R.tripRosterPlan(rounds());
        assert.deepEqual(R.tripRosterPasteUpdates(plan, paste('')).updates, {});
        assert.deepEqual(R.tripRosterPasteUpdates(plan, null).updates, {});
    });
});

// ===========================================================================
describe('3. HANDICAPS, FLIGHTS AND NOTES ARE READ THE SAME WAY ON BOTH PAGES', () => {

    test('"B Jimmy 11 (captain)" is Jimmy, flight B, handicap 11', () => {
        const r = paste(PASTE8);
        assert.deepEqual(r.validPlayers[0], { name: 'Jimmy', hcp: '11', flight: 'B' });
        assert.deepEqual(r.notedLines.map((l) => l.note), ['captain'],
            'the note is reported, not silently eaten');
    });

    test('the handicaps reach the round, as strings, beside the names', () => {
        const plan = R.tripRosterPlan(rounds());
        const list = R.tripRosterPasteUpdates(plan, paste(PASTE8)).updates['events/BBB/players'];
        assert.deepEqual(list.slice(0, 4).map((p) => [p.name, p.hcp]),
            [['Jimmy', '11'], ['Paul', '3.5'], ['Marty', '9'], ['Lance', '14.3']]);
        assert.equal(list[0].flight, 'B');
        // The defaults the planner writes, so a pasted golfer is indistinguishable
        // from one created with the round.
        assert.equal(list[0].team, 'Team 1');
        assert.equal(list[0].playingForMoney, true);
    });

    test('ONE PARSER: it lives in roster-paste.js and admin.html no longer has a copy', () => {
        assert.equal(typeof P.parsePlayerPasteText, 'function');
        assert.ok(!/function parsePlayerPasteText\(/.test(ADMIN),
            'admin.html declares the paste parser again - two pages, two sets of strokes');
        assert.match(ADMIN, /<script src="roster-paste\.js"><\/script>/);
        assert.match(TRIP, /<script src="roster-paste\.js"><\/script>/);
        assert.match(TRIP, /<script src="my-groups\.js"><\/script>/, 'the note stripper lives there');
        assert.match(read('sw.js'), /'\.\/roster-paste\.js'/, 'not precached: an installed device would 404 on it');
        assert.match(read('sync-mobile-web.js'), /'roster-paste\.js'/, 'not in the native bundle');
    });
});

// ===========================================================================
describe('4. GROUPS ONLY WHEN THEY TILE THE ROSTER EXACTLY', () => {

    test('32 pasted as eight fours writes eight group sizes', () => {
        const text = Array.from({ length: 32 }, (_, i) => 'Golfer' + (i + 1) + ' 10')
            .map((l, i) => (i && i % 4 === 0 ? '\n' + l : l)).join('\n');
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), paste(text));
        assert.deepEqual(built.updates['events/BBB/groupSizeOverrides'],
            { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 });
        assert.deepEqual(built.groupsWritten, ['Day 1 PM', 'Day 2']);
    });

    test('and NOTHING when placeholders are left over - said, not silently skipped', () => {
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), paste(PASTE8));
        assert.equal(built.updates['events/BBB/groupSizeOverrides'], undefined,
            'positional sizes over a roster with leftover slots put somebody in the wrong group');
        assert.deepEqual(built.groupsWritten, []);
        assert.match(built.note, /Groups are left as they are/);
    });

    test('a paste with no blank line in it writes no groups at all', () => {
        const text = Array.from({ length: 12 }, (_, i) => 'Golfer' + (i + 1) + ' 10').join('\n');
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), paste(text));
        assert.equal(built.updates['events/BBB/groupSizeOverrides'], undefined);
        assert.equal(built.updates['events/BBB/players'].length, 12);
    });
});

// ===========================================================================
describe('5. THE ROUND PICKER: DATE ORDER, AND THE COURSE NAMED', () => {

    const ROWS = [
        { code: 'C3', label: 'Day 3', date: '', addedAt: 30, courseName: 'Prestwick' },
        { code: 'A2', label: 'Day 1 PM', date: '2026-10-12', addedAt: 20, courseName: 'True Blue' },
        { code: 'A1', label: 'Day 1 AM', date: '2026-10-12', addedAt: 10, courseName: 'Caledonia' },
        { code: 'B1', label: 'Day 2', date: '2026-10-13', addedAt: 15, courseName: 'Pine Lakes' }
    ];

    test('"Tue 10/13 AM - Caledonia", and a local date, not a UTC one', () => {
        assert.equal(R.tripRoundPickerLabel(ROWS[2]), 'Mon 10/12 AM · Caledonia');
        assert.equal(R.tripRoundPickerLabel(ROWS[3]), 'Tue 10/13 · Pine Lakes');
        // new Date('2026-10-13') is UTC midnight, which prints as the 12th
        // anywhere west of Greenwich - the whole trip would read a day early.
        assert.equal(R.tripRoundWhen('2026-10-13'), 'Tue 10/13');
        assert.equal(R.tripRoundWhen(''), '');
        assert.equal(R.tripRoundWhen('not a date'), '');
    });

    test('dated rounds sort by date, AM before PM; undated keep addedAt and come last', () => {
        assert.deepEqual(R.tripRoundPickerRows(ROWS).map((r) => r.code), ['A1', 'A2', 'B1', 'C3']);
        assert.equal(R.tripRoundPickerRows(ROWS)[3].label, 'Day 3 · Prestwick',
            'a round with no date keeps its own label rather than being given an invented one');
    });

    test('the page uses it, and the date is stored when the itinerary gave one', () => {
        assert.match(TRIP, /tripRoundPickerRows\(roundCodes\.map/);
        assert.match(TRIP, /if \(cfg\.teeDate\) roundRow\.date = cfg\.teeDate;/);
        assert.ok(!/<option value="\$\{code\}">\$\{rounds\[code\]\.label\}<\/option>/.test(TRIP),
            'the unsorted label-only list is back');
    });

    test('and the whole add-a-round section is one line until it is wanted', () => {
        const at = TRIP.indexOf('id="add-round-card"');
        assert.ok(at > 0, 'the section is not collapsed');
        const head = TRIP.slice(at - 200, at + 400);
        assert.match(head, /<details/);
        assert.match(head, /Add another round/);
        // Still inside the organizer-only wrapper: collapsing a control is not
        // the same as permitting it.
        assert.ok(TRIP.indexOf('id="trip-organizer-tools"') < at);
    });
});

// ===========================================================================
describe('6. RENAMING THE TRIP', () => {

    test('the control exists, organizer-gated at render AND in the handler', () => {
        assert.match(TRIP, /id="trip-rename-row"/);
        assert.match(TRIP, /id="trip-rename-input"/);
        const fn = TRIP.slice(TRIP.indexOf('function saveTripRename()'),
                              TRIP.indexOf('function linkRound()'));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /if \(!hasTripOrganizerAuthority\(\)\) return;/,
            'hiding a button is not a gate');
        assert.match(fn, /A trip needs a name/, 'an empty name must be refused, not written');
        const render = TRIP.slice(TRIP.indexOf('function renderTripRenameControl()'),
                                  TRIP.indexOf('function openTripRename()'));
        assert.match(render, /hasTripOrganizerAuthority\(\)/);
    });

    test('it writes ONE CHILD, never the trip node', () => {
        const fn = TRIP.slice(TRIP.indexOf('function saveTripRename()'),
                              TRIP.indexOf('function linkRound()'));
        assert.match(fn, /db\.ref\(`trips\/\$\{currentTripCode\}\/name`\)\.set\(name\)/);
        assert.ok(!/db\.ref\(`trips\/\$\{currentTripCode\}`\)\.set/.test(fn),
            'a set() on the trip node would replace the rounds, the token and the pool');
        assert.match(fn, /reportTripWriteFailure/, 'a refused rename must say so');
    });
});
