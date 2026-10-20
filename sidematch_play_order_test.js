// ============================================================================
// SIDE MATCHES IN PLAY ORDER (2026-10-19, Manny: "OK side matches use play order
// (sideMatchHoles), hole-1 rounds unchanged").
//
// A round off the 10th tee plays 10..18 then 1..9. Side matches (Match / Nassau / Hi-Lo /
// stroke bets) took their holes from action-model.js sideMatchHoles BY NUMBER, so:
//   - the live match card walked 1..18: a whole-round match won on 10..16 read
//     "Ann 5 UP" CLOSED (5&4 by number) with holes 1..9 still to play;
//   - a bet "from H13" covered 13..18 only, never the 1..9 still to be played after it;
//   - "where a new bet starts" / "the first hole a new game can start" were walked by
//     number (after 10..18 and 1..3 were in, nothing was left to bet on).
// Now, given the round, they walk in play order. A round off its first hole - or a caller
// with no round - is the original path exactly (1,500 generated rounds compared old vs new,
// identical: totals, receipts, live states, ranges; see the sidematch-play-order commit).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['handicap.js', 'play-order.js', 'match-engine.js', 'hilo-engine.js', 'action-model.js', 'money-engine.js',
    'settlement-engine.js', 'pool-engine.js', 'side-match-lines.js'];
function realm() {
    const ctx = vm.createContext({ console });
    FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f }));
    return ctx;
}
const C = realm();
const run = (expr, d) => { C.d = JSON.parse(JSON.stringify(d)); return JSON.parse(vm.runInContext('JSON.stringify(' + expr + ')', C)); };
const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [{ id: 101, name: 'Ann A', hcp: '0', playingForMoney: true }, { id: 103, name: 'Cal C', hcp: '0', playingForMoney: true }];
function round(tee, holesWon, sm) {
    const scores = {};
    holesWon.forEach(h => { scores['p101_h' + h] = 3; scores['p103_h' + h] = 4; });
    const d = { gameFormat: 'stroke', holeBetStake: 0, settlementMode: 'exact', courseData: CD, scores, players: PLAYERS,
        sideMatches: { m1: Object.assign({ format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['103'], startHole: 1, stake: 10, pressRule: 'none', createdAt: 1 }, sm || {}) } };
    if (tee !== undefined) d.startingHole = tee;
    return d;
}
const holesOf = (d) => run('sideMatchHoles(d.sideMatches.m1, d.courseData, d).map(function (h) { return h.hole; })', d);

describe('sideMatchHoles: the range, in play order', () => {
    test('10th tee, whole round: 10..18 then 1..9', () => {
        assert.deepEqual(holesOf(round(10, [])), [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    test('10th tee, from H13: 13..18 then 1..9 (the holes still to PLAY), not 13..18 alone', () => {
        assert.deepEqual(holesOf(round(10, [], { startHole: 13 })), [13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
    test('10th tee, from H3 (after the turn): 3..9', () => {
        assert.deepEqual(holesOf(round(10, [], { startHole: 3 })), [3, 4, 5, 6, 7, 8, 9]);
    });
    test('hole-1 round (startingHole 1 or none): exactly the original - the same array, the number filter', () => {
        for (const tee of [undefined, 1]) {
            const d = round(tee, []);
            assert.equal(vm.runInContext('(function(){ var x = JSON.parse(' + JSON.stringify(JSON.stringify(d)) + '); return sideMatchHoles(x.sideMatches.m1, x.courseData, x) === x.courseData; })()', C), true);
            assert.deepEqual(holesOf(round(tee, [], { startHole: 7 })), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
        }
    });
    test('no round passed: the original by-number range', () => {
        const d = round(10, [], { startHole: 13 });
        assert.deepEqual(run('sideMatchHoles(d.sideMatches.m1, d.courseData).map(function (h) { return h.hole; })', d), [13, 14, 15, 16, 17, 18]);
    });
});

describe('the live match card closes out on the holes as PLAYED', () => {
    test('10th tee, Ann wins 10..16, 1..9 unplayed: 7 UP and still open (was "5 UP" closed by number)', () => {
        const st = run('buildLiveMatchStates(d, d.courseData, d.scores)', round(10, [10, 11, 12, 13, 14, 15, 16]));
        const seg = st[0].segments[0];
        assert.equal(seg.statusText, 'Ann 7 UP');
        assert.equal(seg.closed, false);
    });
    test('the same holes on a hole-1 round are unchanged by the fix', () => {
        const st = run('buildLiveMatchStates(d, d.courseData, d.scores)', round(1, [1, 2, 3, 4, 5, 6, 7]));
        assert.equal(st[0].segments[0].statusText, 'Ann 7 UP');
    });
    test('10th tee, Ann wins 10..18 and 1..2: closed 11&7 in play order', () => {
        const st = run('buildLiveMatchStates(d, d.courseData, d.scores)', round(10, [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2]));
        assert.equal(st[0].segments[0].closed, true);
    });
});

describe('where a new bet / game starts, in play order', () => {
    const posted = (holes) => { const s = {}; holes.forEach(h => { s['p101_h' + h] = 4; s['p103_h' + h] = 4; }); return s; };
    test('10th tee, 10..12 in: starts on 13', () => {
        const d = Object.assign(round(10, []), { scores: posted([10, 11, 12]) });
        assert.equal(run('sideMatchStartHole(d.players, d.courseData, d.scores, d)', d), 13);
        assert.equal(run('nextAddActionHole(d, d.courseData, d.scores)', d), 13);
    });
    test('10th tee, 10..18 and 1..3 in: starts on 4 (by number there was nothing left)', () => {
        const d = Object.assign(round(10, []), { scores: posted([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3]) });
        assert.equal(run('sideMatchStartHole(d.players, d.courseData, d.scores, d)', d), 4);
        assert.equal(run('nextAddActionHole(d, d.courseData, d.scores)', d), 4);
    });
    test('10th tee, nothing in: the card\'s first hole (the whole-round record)', () => {
        const d = round(10, []);
        assert.equal(run('sideMatchStartHole(d.players, d.courseData, d.scores, d)', d), 1);
    });
    test('hole-1 round: as before', () => {
        const d = Object.assign(round(undefined, []), { scores: posted([1, 2, 3]) });
        assert.equal(run('sideMatchStartHole(d.players, d.courseData, d.scores, d)', d), 4);
        assert.equal(run('nextAddActionHole(d, d.courseData, d.scores)', d), 4);
    });
});
