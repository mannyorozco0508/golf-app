// ============================================================================
// SETTING THE FOURSOMES ON THE DAY (Wave A, 2026-10-08)
//
// Manny, before a 24-man Myrtle trip: the Players step can change group SIZES
// but not WHO is in which group. A golfer's foursome comes from their position
// in the roster, and the only control on a row was the delete button - so
// putting four named people together meant deleting and re-adding them in
// order, on a phone, on a tee box.
//
// So: up/down on every row, and "Move to Group N".
//
// WHY THE LOGIC IS PURE AND LIVES IN grouping.js. The roster order IS the
// grouping - captureCurrentPlayerInputs() reads the rows in DOM order and
// carries each row's player id with it - so "move this golfer to group 3" is an
// array operation, and the array operation is the part that can be got wrong in
// ways nobody sees until the tee sheet is read aloud. The UI moves DOM nodes to
// match; grouping.js decides what the order should be.
//
// THE ID RULE THIS MUST NOT BREAK. player_id_stability_test.js exists because a
// golfer's id is what binds their scores to them. Reordering must carry ids
// with the golfers, never renumber by position - so every test below asserts on
// ids, not names or slots.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const box = () => loadJsFile('grouping.js', []);
const call = (expr, args) => {
    const sb = box();
    Object.keys(args).forEach(k => { sb[k] = args[k]; });
    return JSON.parse(vm.runInContext('JSON.stringify(' + expr + ')', sb));
};
// Twenty-four ids, the real field size.
const ids = () => Array.from({ length: 24 }, (_, i) => 101 + i);

describe('1. UP AND DOWN MOVE ONE GOLFER, AND CARRY THEIR ID', () => {

    test('down swaps with the next golfer', () => {
        const out = call('rosterMove(L, 0, 1)', { L: ids() });
        assert.equal(out[0], 102); assert.equal(out[1], 101);
        assert.equal(out.length, 24, 'the roster changed size');
    });

    test('up swaps with the previous golfer', () => {
        const out = call('rosterMove(L, 5, 4)', { L: ids() });
        assert.equal(out[4], 106); assert.equal(out[5], 105);
    });

    test('a move ACROSS a group boundary is the whole point', () => {
        // Index 4 is the first of group 2 on default sizes. Moving it up puts
        // that golfer in group 1 - which is the thing an organizer is trying to
        // do when they drag a name.
        const out = call('rosterMove(L, 4, 3)', { L: ids() });
        assert.deepEqual(out.slice(0, 5), [101, 102, 103, 105, 104]);
    });

    test('the ends do not wrap, and nothing is lost', () => {
        const top = call('rosterMove(L, 0, -1)', { L: ids() });
        assert.deepEqual(top, ids(), 'moving the first golfer up changed the order');
        const bot = call('rosterMove(L, 23, 24)', { L: ids() });
        assert.deepEqual(bot, ids(), 'moving the last golfer down changed the order');
    });

    test('every id survives every single-step move', () => {
        // The failure this catches is a splice that drops or duplicates - which
        // on a roster means a golfer with no scores or two of him.
        const start = ids();
        for (let i = 0; i < 24; i++) {
            [i - 1, i + 1].forEach((to) => {
                const out = call('rosterMove(L, F, T)', { L: start, F: i, T: to });
                assert.equal(out.length, 24, 'move ' + i + '->' + to + ' changed the count');
                assert.deepEqual(out.slice().sort((a, b) => a - b), start.slice().sort((a, b) => a - b),
                    'move ' + i + '->' + to + ' lost or duplicated an id');
            });
        }
    });
});

describe('2. MOVE TO GROUP N', () => {

    test('a golfer sent to group 3 ends up in group 3', () => {
        // Default sizes: group 3 is indices 8..11.
        const out = call('rosterMoveToGroup(L, 0, 3, {})', { L: ids() });
        const at = out.indexOf(101);
        assert.ok(at >= 8 && at <= 11, 'golfer 101 landed at index ' + at + ', not in group 3');
        assert.equal(out.length, 24);
    });

    test('and lands LAST in that group, so the result is predictable', () => {
        const out = call('rosterMoveToGroup(L, 0, 2, {})', { L: ids() });
        assert.equal(out[7], 101, 'expected the moved golfer at the end of group 2, got ' + out[7]);
    });

    test('moving BACKWARDS into an earlier group works too', () => {
        const out = call('rosterMoveToGroup(L, 23, 1, {})', { L: ids() });
        const at = out.indexOf(124);
        assert.ok(at <= 3, 'golfer 124 landed at index ' + at + ', not in group 1');
    });

    test('a golfer already in that group does not move', () => {
        const out = call('rosterMoveToGroup(L, 5, 2, {})', { L: ids() });
        assert.deepEqual(out, ids(), 'a no-op reshuffled the roster');
    });

    test('it respects custom group sizes', () => {
        // 6/6/6/6: group 2 is indices 6..11.
        const out = call('rosterMoveToGroup(L, 0, 2, O)', { L: ids(), O: { 0: 6, 1: 6, 2: 6, 3: 6 } });
        const at = out.indexOf(101);
        assert.ok(at >= 6 && at <= 11, 'with sixes, golfer 101 landed at ' + at + ' - not in group 2');
    });

    test('a group that does not exist leaves the roster alone', () => {
        assert.deepEqual(call('rosterMoveToGroup(L, 0, 9, {})', { L: ids() }), ids());
        assert.deepEqual(call('rosterMoveToGroup(L, 0, 0, {})', { L: ids() }), ids());
    });

    test('no id is lost moving every golfer to every group', () => {
        const start = ids();
        const sorted = start.slice().sort((a, b) => a - b);
        for (let i = 0; i < 24; i += 5) {
            for (let g = 1; g <= 6; g++) {
                const out = call('rosterMoveToGroup(L, F, G, {})', { L: start, F: i, G: g });
                assert.deepEqual(out.slice().sort((a, b) => a - b), sorted,
                    'moving index ' + i + ' to group ' + g + ' lost or duplicated an id');
            }
        }
    });
});

describe('3. THE GROUPING ITSELF IS UNTOUCHED', () => {

    test('computeGroupBoundaries still answers exactly as it did', () => {
        assert.deepEqual(call('computeGroupBoundaries(24, {})', {}),
            [{ group: 1, startIdx: 0, size: 4 }, { group: 2, startIdx: 4, size: 4 },
             { group: 3, startIdx: 8, size: 4 }, { group: 4, startIdx: 12, size: 4 },
             { group: 5, startIdx: 16, size: 4 }, { group: 6, startIdx: 20, size: 4 }]);
    });
});
