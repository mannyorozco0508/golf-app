// ============================================================================
// MANNY'S 24-GOLFER PASTE, AND THE TRIP PAGE IT LANDS ON (2026-10-04)
//
// He pasted his real list - six groups, written the way a tee sheet is written -
// and five separate things were wrong:
//
//   a) "Group 4" / "Group 5" / "Group 6" PARSED AS GOLFERS ("Group · 4"), so a
//      24-man list reviewed as 30 golfers. Six phantom players, each with a
//      handicap, and a handicap is strokes.
//   b) After Yes, Player 1-4 were still on screen. The write had landed; nothing
//      re-read it. Every round's players come from a ONE-SHOT events/<code> read,
//      and the trips/ listener that fires afterwards is for the TRIP node.
//   c) The confirm said "28 placeholders replaced, 147 golfers added" - it was
//      adding up what it did to each round. An organizer counts people.
//   d) The rounds list was in map-key order with the Day label alone: his week
//      opened on "Day 2 PM" and no row said which course or when.
//   e) The same "Player N is not a name" paragraph was printed per placeholder
//      per round, in three places, until nothing else on the page could be read.
//
// AND THE REDESIGN: a new trip is FOUR THINGS on one screen - name, the rounds,
// the golfers, Build - with the day planner behind one line; the trip page reads
// name, rounds, golfers, then the numbers; and the golfers are shown IN THEIR
// GROUPS, because a group is who you play with and who can see your bets.
//
// THE MONEY RULE IS UNCHANGED AND STILL GUARDED HERE: a paste touches rounds
// with no scores, and a played round settles to the same cent before and after.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout and trip.html's top-level
// `let` bindings are not sandbox properties. tools/trip-simplify-check.js is the
// one that arrives the way he did - a cold trip.html at 390x844, his exact list
// typed in with real keystrokes - and it measured every item above, including
// the two things only a browser can see: the names ON SCREEN after the write,
// and a new trip built from the one-screen form with 24 golfers in 6 groups in
// both rounds. It also writes before/after screenshots to the Desktop.
//
// BASELINE. Against 0acaef3 (trip.html sha ae07af0fae77, trip-roster.js sha
// 460730b503a0, roster-paste.js sha 6b9b4aa7ac2b), over the FINISHED file:
// all 24 tests: 5 PASS / 19 FAIL. The three files were restored by sha from saved
// copies (trip.html 447633f3de456d05, trip-roster.js 9d42ae2a0bf4a05b,
// roster-paste.js e6e1c1cdac284bbb), never with git restore.
//
//   THE FIVE PASSES, and why each was already true there:
//     - the engine sha pins, which this wave does not touch;
//     - the played round settling to the same cent, because the money rule
//       shipped with the paste yesterday and is unchanged;
//     - a blank line separating groups, which is the behaviour the header rule
//       extends rather than replaces;
//     - and the TWO SORT CASES, which pass on that build FOR A DIFFERENT REASON:
//       with no tee time stored it sorted same-date rounds by the finished label,
//       and "Tue 10/13 AM" happens to precede "Tue 10/13 PM". Add a tee time and
//       the same sort puts 1:40 PM before 7:50 AM, which is what he saw. They are
//       kept because they go red the moment the order regresses, not because they
//       were red here.
//
//   Everything about headers, people counts, the calendar label, the groups, the
//   re-read and the quiet line is red.
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

const ctx = { console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
              parseInt, parseFloat, Date, isFinite };
vm.createContext(ctx);
['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'pool-engine.js', 'settlement-engine.js', 'grouping.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const money = (d) => plain(ctx.computeRoundMoneyByPlayer(d, d.courseData, d.scores));
const receipts = (d) => plain(ctx.buildSideMatchReceipts(d, d.courseData, d.scores));

// HIS LIST: six "Group N" headers, no blank lines, a tee time under one header,
// three-part names, a handicap on every line.
const HIS_PASTE = [
    'Group 1', '8:24 AM', 'Zack Carrano 6', 'Derrick J Doncaster 15', 'Mike Treacy 11', 'Pat Morrissey 8',
    'Group 2', 'Tom Kelly 4', 'Sean Burke 20', 'Jim Walsh 12', 'Ray Fox 9',
    'Group 3', 'Al Grant 7', 'Ed Noone 16', 'Dan Quill 13', 'Joe Hart 5',
    'Group 4', 'Hugh Dolan 18', 'Liam Moran 2', 'Cian Reddy 14', 'Eoin Barry 10',
    'Group 5', 'Noel Hickey 6', 'Fran Deasy 22', 'Barry Tobin 3', 'Ger Lynch 17',
    'Group 6', 'Shay Nolan 1', 'Colm Egan 19', 'Rory Breen 8', 'Dara Mulcahy 24'
].join('\n');

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Marty', hcp: '4' }, { id: 102, name: 'Dee', hcp: '9' },
              { id: 103, name: 'Reese', hcp: '0' }, { id: 104, name: 'Jimmy', hcp: '12' }];
const playedScores = () => {
    const s = {};
    FOUR.forEach((p) => cd18.forEach((h) => { s['p' + p.id + '_h' + h.hole] = 4; }));
    s.p101_h1 = 3;
    return s;
};
const PLAYED = { players: FOUR, courseData: cd18, scores: playedScores(), gameFormat: 'stroke',
    sideMatches: { m1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                         startHole: 1, stake: 40, pressRule: 'none', createdAt: 1 } } };
const holders = (n) => Array.from({ length: n }, (_, i) => ({
    id: 101 + i, name: 'Player ' + (i + 1), hcp: '', team: 'Team 1', squad: 'red', playingForMoney: true }));
const rounds = () => [
    { code: 'AAA', label: 'Day 1 AM', data: JSON.parse(JSON.stringify(PLAYED)) },
    { code: 'BBB', label: 'Day 2 AM', data: { players: holders(4), courseData: cd18, scores: {}, gameFormat: 'stroke' } },
    { code: 'CCC', label: 'Day 2 PM', data: { players: holders(4), courseData: cd18, scores: {}, gameFormat: 'stroke' } }
];

function fnOf(name) {
    const at = TRIP.indexOf('function ' + name + '(');
    assert.ok(at > 0, name + ' is not in trip.html at all');
    const end = TRIP.indexOf('\n    function ', at + 30);
    const slice = TRIP.slice(at, end > at ? end : at + 6000);
    assert.ok(slice.length > 80, name + ' sliced to nothing - the endpoint drifted');
    return slice;
}

// ===========================================================================
describe('a) A GROUP HEADER IS NOT A GOLFER', () => {

    test("his 24-man list is 24 golfers in 6 groups, not 30", () => {
        const r = P.parsePlayerPasteText(HIS_PASTE);
        assert.equal(r.validPlayers.length, 24);
        assert.deepEqual(r.groups, [4, 4, 4, 4, 4, 4]);
        assert.ok(!r.validPlayers.some((p) => /^group$/i.test(p.name)),
            'a header is on the roster as a golfer: ' + JSON.stringify(r.validPlayers.map((p) => p.name)));
    });

    test('the names and handicaps survive, three-part names included', () => {
        const r = P.parsePlayerPasteText(HIS_PASTE);
        assert.deepEqual(r.validPlayers[0], { name: 'Zack Carrano', hcp: '6' });
        assert.deepEqual(r.validPlayers[1], { name: 'Derrick J Doncaster', hcp: '15' });
        assert.deepEqual(r.validPlayers[23], { name: 'Dara Mulcahy', hcp: '24' });
    });

    test('headers, bare tee times and blank lines all close a group', () => {
        ['Group 4', 'GROUP 4', 'group', 'Grp 2', 'Flight A', 'Team 1', 'Tee Time', 'Group 4 - 8:24 AM']
            .forEach((l) => assert.equal(P.rosterPasteSeparator(l), 'header', JSON.stringify(l)));
        ['8:24 AM', '13:40', '(7:50 am)'].forEach((l) =>
            assert.equal(P.rosterPasteSeparator(l), 'time', JSON.stringify(l)));
        assert.equal(P.rosterPasteSeparator(''), 'blank');
        assert.equal(P.rosterPasteSeparator('   '), 'blank');
    });

    test('AND A GOLFER IS NEVER DROPPED - the rule errs toward the name', () => {
        ['Group Captain Smith 8', 'Zack Carrano 6', 'B Jimmy 11 (captain)', 'Teddy Ryan 5',
         'Grpahic Designer 4', 'Flight Lieutenant Jones 9'].forEach((l) =>
            assert.equal(P.rosterPasteSeparator(l), '', JSON.stringify(l) + ' was eaten as a header'));
    });

    test('a blank line still separates groups, as it always did', () => {
        const r = P.parsePlayerPasteText('Ann 1\nBo 2\n\nCy 3\nDi 4');
        assert.deepEqual(r.groups, [2, 2]);
        assert.equal(r.validPlayers.length, 4);
    });
});

// ===========================================================================
describe('c) THE COUNTS ARE PEOPLE', () => {

    test('24 golfers into two open rounds of four is 4 and 20, not 8 and 40', () => {
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), P.parsePlayerPasteText(HIS_PASTE));
        assert.equal(built.people, 24);
        assert.equal(built.replaced, 4, 'four placeholder seats per round, not eight summed');
        assert.equal(built.added, 20);
        assert.deepEqual(built.perRound.map((r) => [r.label, r.replaced, r.added]),
            [['Day 2 AM', 4, 20], ['Day 2 PM', 4, 20]]);
    });

    test('and the sentence says it once, for the rounds it will change', () => {
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), P.parsePlayerPasteText(HIS_PASTE));
        assert.match(built.note, /24 golfers pasted, 24 with a handicap, 6 groups as pasted/);
        assert.match(built.note, /Will update 2 of 3 rounds: each gets these 24 golfers — 4 into placeholder slots, 20 added\./);
        assert.ok(!/147|28 placeholder/.test(built.note), 'per-round sums are back: ' + built.note);
    });
});

// ===========================================================================
describe('THE MONEY RULE IS UNCHANGED', () => {

    test('a played round settles the same before and after, to the cent', () => {
        const rs = rounds();
        const played = rs[0].data;
        const before = money(played);
        const beforeR = receipts(played);
        R.tripRosterPasteUpdates(R.tripRosterPlan(rs), P.parsePlayerPasteText(HIS_PASTE));
        assert.deepEqual(money(played), before);
        assert.deepEqual(receipts(played), beforeR);
        assert.ok(beforeR.some((r) => (r.segments || []).some((g) => Math.abs(Number(g.money) || 0) > 0)),
            'the fixture settles no real money, so this is vacuous');
    });

    test('and the played round is not in the write', () => {
        const built = R.tripRosterPasteUpdates(R.tripRosterPlan(rounds()), P.parsePlayerPasteText(HIS_PASTE));
        Object.keys(built.updates).forEach((p) => assert.ok(!/AAA/.test(p), 'played round written: ' + p));
        assert.deepEqual(built.groupsWritten, ['Day 2 AM', 'Day 2 PM']);
        assert.deepEqual(built.updates['events/BBB/groupSizeOverrides'], { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 });
    });

    test('the engines are the ones that were signed off', () => {
        assert.equal(sha12('money-engine.js'), '12bfa41c2c8e');
        assert.equal(sha12('settlement-engine.js'), 'd9ee5e5a1afc');
        assert.equal(sha12('pool-engine.js'), '372e76d7d5c4');
        assert.equal(sha12('handicap.js'), '2d3b2f7fd916');
    });
});

// ===========================================================================
describe('d) THE ROUNDS READ LIKE A CALENDAR', () => {

    const ROWS = [
        { code: 'RD3', label: 'Day 2 PM', date: '2026-10-13', time: '13:40', addedAt: 30, courseName: 'True Blue' },
        { code: 'RD1', label: 'Day 1 AM', date: '2026-10-12', time: '08:24', addedAt: 10, courseName: 'Caledonia' },
        { code: 'RD2', label: 'Day 2 AM', date: '2026-10-13', time: '07:50', addedAt: 20, courseName: 'True Blue' }
    ];

    test('"Tue 10/13 · 8:24 AM · Caledonia"', () => {
        assert.equal(R.tripRoundPickerLabel(ROWS[1]), 'Mon 10/12 · 8:24 AM · Caledonia');
        assert.equal(R.tripRoundClock('08:24'), '8:24 AM');
        assert.equal(R.tripRoundClock('13:40'), '1:40 PM');
        assert.equal(R.tripRoundClock('00:05'), '12:05 AM');
        assert.equal(R.tripRoundClock('12:00'), '12:00 PM');
        assert.equal(R.tripRoundClock(''), '');
        assert.equal(R.tripRoundClock('8:24 AM'), '', 'only 24-hour time is stored, and only that sorts');
    });

    test('THE TIME SORTS, NOT THE LABEL: 7:50 AM before 1:40 PM', () => {
        assert.deepEqual(R.tripRoundPickerRows(ROWS).map((r) => r.code), ['RD1', 'RD2', 'RD3']);
    });

    test('a round with no tee time keeps its AM/PM label and still sorts', () => {
        const noTime = [{ code: 'A', label: 'Day 1 PM', date: '2026-10-12', addedAt: 2 },
                        { code: 'B', label: 'Day 1 AM', date: '2026-10-12', addedAt: 1 }];
        assert.deepEqual(R.tripRoundPickerRows(noTime).map((r) => r.code), ['B', 'A']);
        assert.equal(R.tripRoundPickerLabel(noTime[0]), 'Mon 10/12 PM');
    });

    test('the page uses it, and stores the tee time to sort by', () => {
        assert.match(TRIP, /const rows = tripRoundPickerRows\(roundCodes\.map/);
        assert.match(TRIP, /if \(cfg\.teeClock\) roundRow\.time = cfg\.teeClock;/);
        const list = fnOf('renderRoundsList');
        assert.match(list, /index\.html\?game=\$\{code\}/, 'the Open link');
        assert.match(list, /<details/, 'Edit is tucked');
    });
});

// ===========================================================================
describe('THE GOLFERS, IN THEIR GROUPS', () => {

    test('tripGroupRows slices the roster by the sizes it is given', () => {
        const players = Array.from({ length: 10 }, (_, i) => ({ name: 'G' + (i + 1) }));
        const rows = R.tripGroupRows(players, ctx.computeGroupSizes(10, {}));
        assert.equal(rows.reduce((n, g) => n + g.players.length, 0), 10, 'nobody may be dropped');
        assert.deepEqual(rows.map((g) => g.group), rows.map((_, i) => i + 1));
    });

    test('and anything the sizes do not cover is still somebody', () => {
        const rows = R.tripGroupRows([{ name: 'A' }, { name: 'B' }, { name: 'C' }], [2]);
        assert.equal(rows.length, 2);
        assert.equal(rows[1].players[0].name, 'C');
    });

    test('the page renders them, from grouping.js, for the next unplayed round', () => {
        const fn = fnOf('renderTripRoster');
        assert.match(fn, /computeGroupSizes\(players\.length/);
        assert.match(fn, /tripGroupRows\(players, sizes\)/);
        assert.match(fn, /!tripRoundIsClosed\(r\.data\)/);
        assert.match(TRIP, /<script src="grouping\.js"><\/script>/);
    });
});

// ===========================================================================
describe('b) THE WRITE IS RE-READ, OR THE SCREEN LIES', () => {

    test('every roster write is followed by a re-read', () => {
        ['applyTripRosterPaste', 'tripAddGolfer', 'tripRemoveGolfer'].forEach((name) => {
            const fn = fnOf(name);
            const wrote = fn.indexOf('db.ref().update(built.updates)');
            const refreshed = fn.indexOf('refreshTripComputations()');
            assert.ok(wrote > -1, name + ' does not write');
            assert.ok(refreshed > wrote, name + ' writes and never re-reads: the page keeps the old roster');
        });
    });
});

// ===========================================================================
describe('e) ONE QUIET LINE FOR PLACEHOLDERS', () => {

    test('the digest counts PEOPLE and keeps the dangerous problems whole', () => {
        const problems = [
            { kind: 'placeholder', round: 'Day 1', name: 'Player 1' },
            { kind: 'placeholder', round: 'Day 2', name: 'Player 1' },
            { kind: 'placeholder', round: 'Day 1', name: 'Player 2' },
            { kind: 'duplicate', round: 'Day 1', name: 'Mike', message: 'two Mikes' }
        ];
        const d = R.tripIdentityDigest(problems);
        assert.equal(d.placeholders, 2, 'one golfer in two rounds is one golfer');
        assert.equal(d.others.length, 1, 'a duplicate real name must never be folded away');
        assert.match(R.tripPlaceholderNote(d), /Add real names before the first round/);
        assert.equal(R.tripPlaceholderNote({ placeholders: 0 }), '');
    });

    test('the notice is quiet when the only problem is placeholders, and loud otherwise', () => {
        const fn = fnOf('tripBlockedNotice');
        assert.match(fn, /tripIdentityDigest\(cachedIdentityProblems\)/);
        assert.match(fn, /if \(!digest\.others\.length\)/);
        assert.match(fn, /waiting for real names/);
        assert.match(fn, /digest\.others\.slice\(0, 4\)/, 'a duplicate still gets its own sentence');
    });

    test('and the money card and the awards card use that one notice', () => {
        assert.match(TRIP, /html \+= tripBlockedNotice\('Trip Total'/);
        assert.match(TRIP, /container\.innerHTML = tripBlockedNotice\('Awards'/);
        assert.ok(!/Rename placeholder players before trusting/.test(TRIP),
            'the second, louder placeholder banner is back');
    });
});

// ===========================================================================
describe('THE NEW-TRIP SCREEN IS FOUR THINGS', () => {

    test('name, the rounds, the golfers, Build - and the day planner is one line', () => {
        const form = TRIP.slice(TRIP.indexOf('id="create-trip-form"'), TRIP.indexOf('id="build-trip-btn"'));
        ['trip-name-input', 'itin-paste-card', 'golfer-paste-card', 'day-planner-card']
            .forEach((id) => assert.ok(form.indexOf(id) > -1, id + ' is not on the new-trip screen'));
        assert.ok(form.indexOf('golfer-paste-card') > form.indexOf('itin-paste-card'), 'the golfers come after the rounds');
        assert.ok(form.indexOf('day-planner-card') > form.indexOf('golfer-paste-card'), 'the day planner is last');
        assert.match(form, /id="day-planner-card"[^>]*>\s*<summary[^>]*>[^<]*Set the days up by hand instead/,
            'the day planner must be collapsed behind one line');
        assert.match(form, /id="itin-paste-card"[^>]*open>/, 'the itinerary is open on arrival');
        assert.match(form, /id="golfer-paste-card"[^>]*open>/, 'the golfers are open on arrival');
    });

    test('a pasted list goes into every round it builds, with its groups', () => {
        const fn = fnOf('buildTrip');
        assert.match(fn, /const golferPlan = setupGolferPlan\(\);/);
        assert.match(fn, /golferPlan\.players\.forEach/);
        assert.match(fn, /groupSizeOverrides: groupOverrides/);
        // AND ONLY WHEN THE SIZES TILE THE FIELD: a positional size that does not
        // add up puts somebody in the wrong group, and a group is who sees a bet.
        assert.match(fn, /reduce\(\(a, b\) => a \+ b, 0\) === players\.length/);
    });

    test('with no paste, the headcount still makes Player 1..N', () => {
        const fn = fnOf('buildTrip');
        assert.match(fn, /name: `Player \$\{p \+ 1\}`/);
        assert.match(fnOf('setupGolferPlan'), /n > 0 && n <= 40/);
    });
});
