// ============================================================================
// SKINS (skins.js) - STRICT lane, PO build 2026-11-14 (ADVISOR-20261114-1156-OK-build-final-set)
//
// The pure counter behind the prize screen's Skins card. The rules are in
// skins.js's header; each describe() below holds one of them to numbers worked
// out by hand, not read back from the module.
//
// WHAT THIS FILE PROVES: the counter, on the record shapes the board stores
// (golfer, scramble team, best-ball golfers), including withdrawn golfers and
// unposted holes. WHAT IT DOES NOT: whether a page shows any of it - that is
// tournament_prizes_cards_test.js (mini-dom) and tournament_prizes_chrome_test.js
// (cold Chrome).
//
// BASELINE against main e1312cf2 (tournament.html sha256 fad162561b8f4db8; skins.js
// does not exist there): the require throws at load, node reports 1 test / 0 pass /
// 1 fail - no per-assertion meaning. FINAL RUN on preview-po: 17 tests / 17 pass /
// 0 fail.
//
// NEGATIVE CONTROLS (skins.js mutated in place, restored from a saved copy by
// sha each time - never git checkout):
//   K1 TIE RULE: the first golfer on the low score wins it even when tied
//      (atLow.length === 1 -> atLow.length >= 1)                  -> 8 fail
//   K2 CARRYOVER: a carried skin is dropped (row.skins = 1 + carriedIn -> 1)
//                                                                  -> 3 fail
//   K3 LAST HOLE: a tie on the last hole is handed to the first tied golfer
//      instead of carrying nowhere                                 -> 4 fail
//   K4 PENDING: a hole somebody has not posted is decided among those who did
//                                                                  -> 2 fail
//   K5 NET: scoringBasis 'net' computed on gross instead of refused -> 1 fail
//   Each red, each restored from the saved copy, sha256 39ae84d39798edd6 printed
//   beside RESTORED-OK after every control.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./skins.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const PAR = [4, 5, 3, 4];
const holes4 = PAR.map((p, i) => ({ hole: i + 1, par: p }));
const ent = (id, arr) => ({ id, name: id.toUpperCase(), scores: Object.fromEntries(arr.map((v, i) => [i + 1, v]).filter(([, v]) => v !== null)) });
const run = (rows, carryover, holes) => S.computeSkins({ holes: holes || holes4, entrants: rows }, { carryover, scoringBasis: 'gross' });
const statuses = (r) => r.holes.map((h) => h.status + (h.winner ? ':' + h.winner + 'x' + h.skins : ''));

describe('1. THE TIE RULE: only a unique low score wins', () => {
    test('a unique low wins one skin', () => {
        const r = run([ent('a', [3, 5, 3, 4]), ent('b', [4, 5, 3, 4]), ent('c', [5, 5, 3, 4])], false);
        assert.deepEqual(statuses(r), ['won:ax1', 'tied', 'tied', 'tied']);
        assert.equal(r.holes[0].score, 3);
        assert.equal(r.tally.a.skins, 1);
        assert.deepEqual(r.tally.a.holes, [1]);
    });
    test('two golfers on the low score: nobody wins, even though a third is worse', () => {
        const r = run([ent('a', [3, 4, 3, 4]), ent('b', [3, 5, 3, 4]), ent('c', [5, 5, 3, 4])], false);
        assert.equal(r.holes[0].status, 'tied');
        assert.deepEqual(r.holes[0].tiedIds, ['a', 'b']);
        assert.equal(r.holes[0].winner, null);
        assert.equal(r.holes[1].winner, 'a', 'positive: hole 2 has a unique low');
        assert.equal(r.totals.skins, 1);
    });
    test('a three-way tie is still a tie', () => {
        const r = run([ent('a', [4, 4, 3, 4]), ent('b', [4, 5, 3, 4]), ent('c', [4, 5, 3, 4])], false);
        assert.equal(r.holes[0].status, 'tied');
        assert.equal(r.holes[0].tiedIds.length, 3);
    });
});

describe('2. CARRYOVER', () => {
    // a/b tie 1 and 2; c wins 3 alone; a wins 4 alone.
    const field = () => [ent('a', [4, 5, 4, 3]), ent('b', [4, 5, 4, 4]), ent('c', [5, 6, 2, 4])];
    test('on: two tied holes carry into the next hole won outright (3 skins), then the count restarts', () => {
        const r = run(field(), true);
        assert.deepEqual(statuses(r), ['tied', 'tied', 'won:cx3', 'won:ax1']);
        assert.equal(r.holes[0].carriesTo, 2);
        assert.equal(r.holes[1].carriesTo, 3);
        assert.equal(r.holes[2].carriedIn, 2);
        assert.equal(r.holes[3].carriedIn, 0);
        assert.deepEqual(plain(r.totals), { holesWon: 2, skins: 4, carried: 2, notWon: 0, pending: 0 });
        assert.equal(r.tally.c.skins, 3);
    });
    test('off: the same scores give one skin a hole won, and the tied holes are simply not won', () => {
        const r = run(field(), false);
        assert.deepEqual(statuses(r), ['tied', 'tied', 'won:cx1', 'won:ax1']);
        assert.equal(r.holes[0].carriesTo, null);
        assert.equal(r.holes[0].notWon, 1);
        assert.deepEqual(plain(r.totals), { holesWon: 2, skins: 2, carried: 0, notWon: 2, pending: 0 });
    });
    test('carryover is on unless it is switched off', () => {
        assert.equal(S.computeSkins({ holes: holes4, entrants: field() }).carryover, true);
        assert.equal(S.computeSkins({ holes: holes4, entrants: field() }).totals.skins, 4);
    });
});

describe('3. THE LAST HOLE: a tie there carries nowhere', () => {
    test('a tie on the last hole is no skin, and what was carried into it is not won either', () => {
        // a wins 1; holes 2, 3, 4 all tied.
        const r = run([ent('a', [3, 5, 3, 4]), ent('b', [4, 5, 3, 4])], true);
        assert.deepEqual(statuses(r), ['won:ax1', 'tied', 'tied', 'tied']);
        assert.equal(r.holes[3].carriesTo, null);
        assert.equal(r.holes[3].carriedIn, 2);
        assert.equal(r.holes[3].notWon, 3);
        assert.deepEqual(plain(r.totals), { holesWon: 1, skins: 1, carried: 0, notWon: 3, pending: 0 });
        assert.equal(r.tally.b.skins, 0);
    });
    test('the last hole is the last one in hole order, whatever order the card lists them in', () => {
        const shuffled = [holes4[3], holes4[0], holes4[2], holes4[1]];
        const r = run([ent('a', [3, 5, 3, 4]), ent('b', [4, 5, 3, 4])], true, shuffled);
        assert.deepEqual(r.holes.map((h) => h.hole), [1, 2, 3, 4]);
        assert.equal(r.holes[3].notWon, 3);
    });
    test('the last hole won outright takes what was carried into it', () => {
        const r = run([ent('a', [3, 5, 3, 3]), ent('b', [4, 5, 3, 4])], true);
        assert.equal(r.holes[3].winner, 'a');
        assert.equal(r.holes[3].skins, 3);
        assert.equal(r.totals.notWon, 0);
    });
});

describe('4. A HOLE NOT POSTED IS PENDING, NOT GUESSED', () => {
    test('carryover on: the unposted hole and every hole after it wait', () => {
        const r = run([ent('a', [3, null, 3, 3]), ent('b', [4, 5, 4, 4])], true);
        assert.deepEqual(statuses(r), ['won:ax1', 'pending', 'pending', 'pending']);
        assert.equal(r.totals.pending, 3);
        assert.equal(r.totals.skins, 1);
    });
    test('carryover off: only the unposted hole waits', () => {
        const r = run([ent('a', [3, null, 3, 3]), ent('b', [4, 5, 4, 4])], false);
        assert.deepEqual(statuses(r), ['won:ax1', 'pending', 'won:ax1', 'won:ax1']);
        assert.equal(r.totals.pending, 1);
    });
    test('a golfer with no score at all is not in the game; a 0, a 31 or a fraction is not a score', () => {
        const r = run([ent('a', [3, 4, 3, 3]), ent('b', [4, 5, 4, 4]), ent('z', [null, null, null, null]),
            { id: 'q', name: 'Q', scores: { 1: 0, 2: 31, 3: 2.5 } }], true);
        assert.deepEqual(Object.keys(r.tally).sort(), ['a', 'b']);
        assert.equal(r.totals.pending, 0);
        assert.equal(r.totals.skins, 4);
    });
});

describe('5. NET IS REFUSED WITH A REASON', () => {
    test('scoringBasis net: not available, nothing counted, and the sentence says why', () => {
        const r = S.computeSkins({ holes: holes4, entrants: [ent('a', [3, 4, 3, 3]), ent('b', [4, 5, 4, 4])] }, { carryover: true, scoringBasis: 'net' });
        assert.equal(r.available, false);
        assert.deepEqual(r.holes, []);
        assert.match(r.reason, /handicap strokes/);
        assert.doesNotMatch(r.reason, /protected|secure|locked/i);
        assert.equal(run([ent('a', [3, 4, 3, 3]), ent('b', [4, 5, 4, 4])], true).available, true, 'positive: gross is available');
    });
});

describe('6. THE RECORD SHAPES THE BOARD STORES', () => {
    const CD = holes4;
    test('golfer event: <playerId>_h<N>, withdrawn golfers left out, names through nameOf', () => {
        const v = { scoringModel: 'player-v1', courseData: CD,
            players: { pA: { name: 'Ana' }, pB: { name: 'Bo' }, pW: { name: 'Wes', status: 'withdrawn' } },
            scores: { pA_h1: 3, pA_h2: 5, pB_h1: 4, pB_h2: 5, pW_h1: 1 } };
        const e = S.entrantsFromRecord(v, (p) => p.name + '!');
        assert.deepEqual(plain(e), [
            { id: 'pA', owner: 'pA', name: 'Ana!', scores: { 1: 3, 2: 5 } },
            { id: 'pB', owner: 'pB', name: 'Bo!', scores: { 1: 4, 2: 5 } }]);
        const r = S.computeSkins({ holes: CD, entrants: e }, { carryover: false });
        assert.equal(r.holes[0].winner, 'pA', 'the withdrawn 1 on hole 1 does not win it');
    });
    test('scramble: one entrant a team, team<N>_h<N>, owned by the team key', () => {
        const v = { format: 'scramble', courseData: CD, teams: { team1: { num: 1, name: 'Alpha', players: ['A', 'B'] }, team2: { num: 2, players: ['C'] } },
            scores: { team1_h1: 3, team2_h1: 4 } };
        const e = S.entrantsFromRecord(v);
        assert.deepEqual(plain(e).map((x) => [x.id, x.owner, x.name, x.scores]), [['team1', 'team1', 'Alpha', { 1: 3 }], ['team2', 'team2', 'Team 2', { 1: 4 }]]);
    });
    test('best ball: one entrant a golfer, team<N>_p<i>_h<N>, owned by the team', () => {
        const v = { format: 'bestball', courseData: CD, teams: { team1: { num: 1, name: 'Alpha', players: ['Al', 'Bea'] } },
            scores: { team1_p0_h1: 4, team1_p1_h1: 3 } };
        const e = S.entrantsFromRecord(v);
        assert.deepEqual(plain(e).map((x) => [x.id, x.owner, x.name, x.scores]), [['team1_p0', 'team1', 'Al', { 1: 4 }], ['team1_p1', 'team1', 'Bea', { 1: 3 }]]);
    });
});

describe('7. THE RING A WINNING SCORE WEARS', () => {
    test('eagle double ring, birdie ring, par plain, bogey square, double+ double square', () => {
        assert.deepEqual([2, 3, 4, 5, 6, 7].map((s) => S.scoreMark(s, 4)), ['eagle', 'birdie', '', 'bogey', 'double', 'double']);
        assert.equal(S.scoreMark(3, null), '', 'no par, no ring');
    });
});
