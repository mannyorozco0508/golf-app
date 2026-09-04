// ============================================================================
// RE-LINKING A TRIP ROUND EDITS THE LABEL. IT DOES NOT RESET THE ROUND.
//
// linkRound() wrote the round node with .set(), which replaces it wholesale. The
// only way to correct a round's label is to link it again, so that one ordinary
// action silently destroyed two values stored alongside it:
//
//   countsTowardTrip  read as `!== false`, so ABSENCE MEANS COUNTS. A round the
//                     organizer had deliberately excluded - a washout, a practice
//                     round - walked back into the trip leaderboard, the money
//                     settlement and the awards, with nothing on screen to say so.
//   addedAt           orders the rounds, so the round also jumped to the end of
//                     the week.
//
// Neither was covered: countsTowardTrip appears in five test files and is set to
// true in every one, so the exclusion path had never been exercised at all.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const SRC = fs.readFileSync(path.join(REPO_ROOT, 'trip.html'), 'utf8');
const linkRound = () => {
    const a = SRC.indexOf('function linkRound()');
    assert.notEqual(a, -1, 'linkRound() must exist');
    return SRC.slice(a, SRC.indexOf('\n    function ', a + 10));
};

describe('trip re-link preserves what it did not ask to change', () => {

    test('NO_WHOLESALE_SET: the round node is patched, never replaced', () => {
        const body = linkRound();
        assert.doesNotMatch(body, /\.set\(\{\s*label/,
            'A .set() replaces the node and takes countsTowardTrip with it.');
        assert.match(body, /roundRef\.update\(patch\)/,
            'Re-linking must update only the fields it means to change.');
    });

    test('EXCLUSION_SURVIVES: countsTowardTrip is never written by linkRound', () => {
        // Comments in the function name the field to explain the bug; only code counts.
        const code = linkRound().split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
        assert.ok(!code.includes('countsTowardTrip'),
            'linkRound must not touch the exclusion flag in either direction - '
            + 'toggleRoundCounted owns it.');
    });

    test('ORDER_SURVIVES: addedAt is stamped once, when the round first joins', () => {
        const body = linkRound();
        assert.match(body, /if \(!existing\.exists\(\)\) patch\.addedAt = Date\.now\(\);/,
            'Re-stamping addedAt reorders the trip.');
    });

    test('the reader still treats absence as counting, which is why this matters', () => {
        // If this ever flips to `=== true`, the bug above becomes harmless and this
        // test should be revisited rather than deleted.
        assert.match(SRC, /countsTowardTrip !== false/,
            'absence means the round counts toward the trip');
    });
});
