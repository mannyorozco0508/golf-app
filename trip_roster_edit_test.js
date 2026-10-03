// ============================================================================
// ADDING AND REMOVING GOLFERS ON A TRIP (2026-10-03)
//
// A trip's rounds are created with placeholder players and the real roster is
// filled in per round, so a golfer who joins on the Wednesday meant opening
// every remaining round by hand.
//
// THE ONE RULE THAT MAKES IT SAFE, and the whole reason this file exists:
//
//     A ROUND THAT HAS SCORES IS FINISHED BUSINESS.
//
// Not "mostly finished", not "probably safe". A round with ONE posted score has a
// settled or settling money position: handicaps are read off its roster, side
// matches name its player ids, the pool charges a buy-in per golfer, and skins
// and dots are per hole per player. Adding a golfer would change who is in a bet
// that has already been played; removing one would orphan their scores and every
// bet naming them.
//
// SO THE GUARD IS NOT "the roster changed correctly". It is THE PLAYED ROUNDS DID
// NOT MOVE - asserted as money, not as a field: the same round settled before and
// after a roster change, to the cent, with the engines frozen by sha.
//
// WHY NOT "not yet started" BY TEE TIME. A tee time is a plan; a score is a fact.
// A group that teed off late and a group that teed off early and posted nothing
// are the same round as far as money is concerned, and a clock would get one of
// them wrong.
//
// BASELINE. Against pre-build main (a9fbf8d) trip-roster.js does not exist, the
// require throws at load, and node reports the FILE as one failing test.
//
// MEASURED with a stub whose nine exported functions return undefined, over the
// FINISHED file, all 19 tests: 6 PASS / 13 FAIL. The module was restored by sha
// from a saved copy (1e8262acc9bd1740), never with git restore.
//
//   SIX PASSES, and every one of them is a control rather than the feature:
//     - the two money tests and the engine sha pins. They are true on main
//       because main cannot change a roster at all, and they are EXACTLY what
//       would go red if this wave touched a played round. That is the point of
//       them, not a weakness in them.
//     - the no-mutation test, which a stub satisfies by doing nothing.
//     - the purity scan and the page scans, which read a tree where trip.html was
//       already wired and the module was not.
//
//   The 13 reds are every rule the module owns: what closes a round, the
//   open/closed split, the named untouched rounds, the per-round ids, the
//   already-there refusal, the empty-round refusal and the remove list.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const R = require('./trip-roster.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sha12 = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 12);

// The engines in one realm, so the money assertions below are the app's own
// arithmetic rather than a restatement of it.
const ctx = { console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
              parseInt, parseFloat, Date, isFinite };
vm.createContext(ctx);
['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
 'pool-engine.js', 'settlement-engine.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const plainOf = (v) => JSON.parse(JSON.stringify(v));

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = [{ id: 101, name: 'Marty', hcp: '4' }, { id: 102, name: 'Dee', hcp: '9' },
              { id: 103, name: 'Reese', hcp: '0' }, { id: 104, name: 'Jimmy', hcp: '12' }];
function playedScores() {
    const s = {};
    FOUR.forEach((p) => cd18.forEach((h) => { s['p' + p.id + '_h' + h.hole] = 4; }));
    [[1, 101], [5, 102], [9, 103], [13, 104]].forEach(([h, w]) => { s['p' + w + '_h' + h] = 3; });
    return s;
}
// A played round with real money on it: a match-play side bet and a money pool.
const PLAYED = {
    players: FOUR, courseData: cd18, scores: playedScores(), gameFormat: 'stroke',
    sideMatches: { m1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                         startHole: 1, stake: 40, pressRule: 'none', createdAt: 1 } }
};
const OPEN = { players: FOUR, courseData: cd18, scores: {}, gameFormat: 'stroke' };
const rounds = () => [
    { code: 'AAA', label: 'Day 1', data: JSON.parse(JSON.stringify(PLAYED)) },
    { code: 'BBB', label: 'Day 2', data: JSON.parse(JSON.stringify(OPEN)) },
    { code: 'CCC', label: 'Day 3', data: JSON.parse(JSON.stringify(OPEN)) }
];
const money = (d) => plainOf(ctx.computeRoundMoneyByPlayer(d, d.courseData, d.scores));
const receipts = (d) => plainOf(ctx.buildSideMatchReceipts(d, d.courseData, d.scores));

// ===========================================================================
describe('1. A ROUND WITH SCORES IS NEVER TOUCHED', () => {

    test('one posted score closes a round; an empty scores object does not', () => {
        assert.equal(R.tripRoundHasScores(PLAYED), true);
        assert.equal(R.tripRoundHasScores(OPEN), false);
        assert.equal(R.tripRoundHasScores({ scores: {} }), false);
        assert.equal(R.tripRoundHasScores({}), false);
        assert.equal(R.tripRoundHasScores(null), false);
        // A KEY WRITTEN AND THEN CLEARED is not a score. Object.keys().length
        // would call this round played and freeze a roster nobody has used.
        assert.equal(R.tripRoundHasScores({ scores: { p101_h1: 0 } }), false);
        assert.equal(R.tripRoundHasScores({ scores: { p101_h1: null } }), false);
        assert.equal(R.tripRoundHasScores({ scores: { p101_h1: 1 } }), true, 'a hole in one is a score');
    });

    test('A VERIFIED ROUND IS CLOSED even if it somehow has no scores', () => {
        assert.equal(R.tripRoundIsClosed({ verified: true, scores: {} }), true);
        assert.equal(R.tripRoundIsClosed({ settledAt: 1, scores: {} }), true);
        assert.equal(R.tripRoundIsClosed(OPEN), false, 'and an untouched round is open');
    });

    test('the plan splits them and NAMES the untouched ones', () => {
        const p = R.tripRosterPlan(rounds());
        assert.deepEqual(p.open.map((r) => r.label), ['Day 2', 'Day 3']);
        assert.deepEqual(p.closed.map((r) => r.label), ['Day 1']);
        assert.equal(p.total, 3);
        const note = R.tripRosterPlanNote(p, 'add Jimmy to');
        assert.match(note, /2 of 3 rounds/);
        assert.match(note, /Untouched \(already has scores\): Day 1/,
            '"some rounds were skipped" is not something an organizer can check');
    });

    test('every round played means nothing to change, said plainly', () => {
        const p = R.tripRosterPlan([{ code: 'A', label: 'Day 1', data: PLAYED }]);
        assert.equal(p.open.length, 0);
        assert.match(R.tripRosterPlanNote(p, 'change'), /nothing to change/);
        assert.deepEqual(R.tripRosterAddUpdates(p, 'Newbie').updates, {});
        assert.deepEqual(R.tripRosterRemoveUpdates(p, 'Marty').updates, {});
    });

    test('A PLAYED ROUND IS NOT IN THE WRITE AT ALL - by path, not by hope', () => {
        const p = R.tripRosterPlan(rounds());
        const add = R.tripRosterAddUpdates(p, 'Newbie');
        const rem = R.tripRosterRemoveUpdates(p, 'Jimmy');
        [add, rem].forEach((built) => {
            Object.keys(built.updates).forEach((path) => {
                assert.ok(!/AAA/.test(path), 'the played round is in the write: ' + path);
                assert.match(path, /^events\/(BBB|CCC)\/players$/);
            });
        });
        assert.equal(Object.keys(add.updates).length, 2);
    });
});

// ===========================================================================
describe('2. AND ITS MONEY DOES NOT MOVE - asserted as money', () => {

    test('THE PLAYED ROUND SETTLES THE SAME BEFORE AND AFTER A ROSTER CHANGE', () => {
        // The claim that matters. Not "the field was not written" - the actual
        // arithmetic, to the cent, on a round with a $40 match on it.
        const before = money(PLAYED);
        const beforeR = receipts(PLAYED);
        const p = R.tripRosterPlan(rounds());
        R.tripRosterAddUpdates(p, 'Newbie');
        R.tripRosterRemoveUpdates(p, 'Jimmy');
        // The played round's data object is the one the plan held, so if either
        // builder mutated it in place this is where it shows.
        const after = money(PLAYED);
        assert.deepEqual(after, before, 'the played round settles differently after a roster change');
        assert.deepEqual(receipts(PLAYED), beforeR);
        // THE NON-VACUOUS CHECK IS ON THE RECEIPTS, not on the main-format money.
        // computeRoundMoneyByPlayer answers for the ROUND's format, which here is
        // Stroke Play with no wager on it - so every net is legitimately 0. The
        // $40 that makes this fixture worth settling is the side match, and that
        // lives on the receipt.
        const segs = beforeR.reduce((n, r) => n + (r.segments || []).length, 0);
        assert.ok(segs > 0, 'the fixture has no priced side match, so this is vacuous');
        assert.ok(beforeR.some((r) => (r.segments || []).some((g) => Math.abs(Number(g.money) || 0) > 0)),
            'the fixture settles no real money, so this is vacuous');
    });

    test('THE BUILDERS DO NOT MUTATE ANYTHING - they return a write, they do not apply one', () => {
        const rs = rounds();
        const snapshot = JSON.stringify(rs);
        const p = R.tripRosterPlan(rs);
        R.tripRosterAddUpdates(p, 'Newbie', { hcp: '7' });
        R.tripRosterRemoveUpdates(p, 'Dee');
        assert.equal(JSON.stringify(rs), snapshot,
            'a builder changed the rounds it was given. The page writes; this decides.');
    });

    test('THE ENGINES ARE UNTOUCHED, by sha', () => {
        assert.equal(sha12('money-engine.js'), '12bfa41c2c8e');
        assert.equal(sha12('settlement-engine.js'), 'd9ee5e5a1afc');
        assert.equal(sha12('pool-engine.js'), '372e76d7d5c4');
        assert.equal(sha12('handicap.js'), '2d3b2f7fd916');
    });
});

// ===========================================================================
describe('3. ADDING', () => {

    test('a fresh id per round, above everything already there', () => {
        const p = R.tripRosterPlan(rounds());
        const built = R.tripRosterAddUpdates(p, 'Newbie', { hcp: '7' });
        const added = built.updates['events/BBB/players'].slice(-1)[0];
        assert.equal(added.id, 105, 'ids are per round, and 104 was taken');
        assert.equal(added.name, 'Newbie');
        assert.equal(added.hcp, '7');
        // THE SAME DEFAULTS THE PLANNER WRITES, so a golfer added later is
        // indistinguishable from one created with the round.
        assert.equal(added.team, 'Team 1');
        assert.equal(added.squad, 'red');
        assert.equal(added.playingForMoney, true);
    });

    test('the id is computed PER ROUND, not once for the trip', () => {
        const odd = [{ code: 'X', label: 'D1', data: { players: [{ id: 101, name: 'A' }], scores: {} } },
                     { code: 'Y', label: 'D2', data: { players: [{ id: 999, name: 'A' }], scores: {} } }];
        const built = R.tripRosterAddUpdates(R.tripRosterPlan(odd), 'B');
        assert.equal(built.updates['events/X/players'].slice(-1)[0].id, 102);
        assert.equal(built.updates['events/Y/players'].slice(-1)[0].id, 1000,
            'a shared counter would collide with the 999 in the other round');
    });

    test('ALREADY THERE IS NOT ADDED AGAIN - two entries with one name is two golfers', () => {
        const p = R.tripRosterPlan(rounds());
        const built = R.tripRosterAddUpdates(p, 'marty');   // same golfer, different case
        assert.deepEqual(built.updates, {});
        assert.deepEqual(built.skipped, ['Day 2', 'Day 3']);
        assert.deepEqual(built.added, []);
    });

    test('a blank name writes nothing', () => {
        const p = R.tripRosterPlan(rounds());
        ['', '   ', null, undefined].forEach((n) =>
            assert.deepEqual(R.tripRosterAddUpdates(p, n).updates, {}, JSON.stringify(n)));
    });
});

// ===========================================================================
describe('4. REMOVING', () => {

    test('dropped from the open rounds, and SCORES ARE NOT TOUCHED', () => {
        const p = R.tripRosterPlan(rounds());
        const built = R.tripRosterRemoveUpdates(p, 'Jimmy');
        assert.deepEqual(built.removed, ['Day 2', 'Day 3']);
        assert.equal(built.updates['events/BBB/players'].length, 3);
        assert.ok(!built.updates['events/BBB/players'].some((x) => x.name === 'Jimmy'));
        // IT CANNOT NEED TO TOUCH SCORES: an open round has none. That is exactly
        // why the open/closed split is the safety model rather than a convenience -
        // a remove that had to clean up scores is a remove that could get it wrong.
        Object.keys(built.updates).forEach((path) =>
            assert.match(path, /\/players$/, 'a remove wrote somewhere other than players: ' + path));
    });

    test('IT REFUSES TO EMPTY A ROUND', () => {
        // A round with no players is a round nothing can be scored on, and the app
        // has no screen for it. The organizer deletes the round instead.
        const solo = [{ code: 'S', label: 'Day 1', data: { players: [{ id: 101, name: 'Marty' }], scores: {} } }];
        const built = R.tripRosterRemoveUpdates(R.tripRosterPlan(solo), 'Marty');
        assert.deepEqual(built.updates, {});
        assert.deepEqual(built.refused, ['Day 1']);
        assert.deepEqual(built.removed, []);
    });

    test('a golfer who is not on a round is skipped, not an error', () => {
        const p = R.tripRosterPlan(rounds());
        const built = R.tripRosterRemoveUpdates(p, 'Nobody');
        assert.deepEqual(built.updates, {});
        assert.deepEqual(built.skipped, ['Day 2', 'Day 3']);
    });

    test('the remove list offers only golfers a change could reach', () => {
        const p = R.tripRosterPlan(rounds());
        assert.deepEqual(R.tripOpenRosterNames(p), ['Dee', 'Jimmy', 'Marty', 'Reese']);
        const closedOnly = R.tripRosterPlan([{ code: 'A', label: 'D1', data: PLAYED }]);
        assert.deepEqual(R.tripOpenRosterNames(closedOnly), [],
            'offering a name that cannot be removed is offering a button that does nothing');
    });
});

// ===========================================================================
describe('5. IT SHIPS, AND THE PAGE USES IT', () => {

    test('PURE: no DOM, no database', () => {
        const m = read('trip-roster.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        ['document.', 'window.', 'firebase.', 'db.ref', 'localStorage']
            .forEach((bad) => assert.ok(!m.includes(bad), 'trip-roster.js touches ' + bad));
        assert.doesNotMatch(read('trip-roster.js'), /^\s*const trip/m);
    });

    test('in the shell, in SHARED_SHELL, loaded and called by trip.html', () => {
        assert.match(read('sw.js'), /'\.\/trip-roster\.js'/);
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(read('sync-mobile-web.js'));
        assert.ok(shared && /'trip-roster\.js'/.test(shared[1]));
        assert.match(read('trip.html'), /<script src="trip-roster\.js"><\/script>/);
        assert.match(read('trip.html'), /tripRosterPlan\(/, 'loaded but never called');
    });

    test('THE WRITE IS ONE update(), AND ORGANIZER-ONLY', () => {
        const src = read('trip.html');
        ['tripAddGolfer', 'tripRemoveGolfer'].forEach((fn) => {
            const at = src.indexOf('async function ' + fn);
            assert.ok(at > -1, fn + ' is gone');
            const body = src.slice(at, at + 1800);
            assert.match(body, /db\.ref\(\)\.update\(built\.updates\)/,
                fn + ' does not write the builder\'s map in one update');
            assert.ok(!/events\/\$\{/.test(body),
                fn + ' builds its own path. Every path comes from trip-roster.js, which is '
                + 'what keeps a played round out of the write.');
        });
        // A roster change moves who is in a bet, so it is not a thing the plain
        // share link may do.
        const edit = src.slice(src.indexOf('function renderTripRosterEdit'), src.indexOf('async function tripAddGolfer'));
        assert.match(edit, /hasTripOrganizerAuthority\(\)/, 'the roster editor is not organizer-gated');
    });
});
