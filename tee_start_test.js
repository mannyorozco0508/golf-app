// ============================================================================
// A ROUND THAT STARTS ON THE 10th TEE (2026-10-04, STRICT - match/press money)
//
// RECON FIRST, AND IT DID NOT EXIST. There was no round-level or per-group tee
// start anywhere in the consumer app: no control in the wizard, no field on
// events/<code>, and every surface took the play order to be the hole numbers in
// ascending order (index.html goToAdjacentHole sorts by number and is "clamped,
// never wrapped"; the hole view lands on holeNumbers[0] and calls the HIGHEST
// number the last hole; match-engine.js computes holes-left as endHole - hNum).
// The tournament product has had `startingHole` per group since the shotgun
// sheet - "Start on hole N" on tournament-scorecard.html - so the name is not
// invented here.
//
// THE ONE TRAP WORTH THE WHOLE RECON: `startHole` IS ALREADY TAKEN, and it means
// something else. Everywhere in this repo it is the hole a BET starts on - a
// skins game added "from H5" (action-model.js gameHoles), a press, a side match
// bought on the turn - and events/<code>/startHole is READ as the legacy Dots
// start by index.html's kpLiveState. A round-level reuse of that key would have
// silently stopped paying dots and KPs on the first nine. The round's tee is
// `startingHole`, and a test below holds that apart behaviourally.
//
// WHAT ORDER CHANGES, AND WHAT IT MUST NOT. Stroke totals, skins, KP and Net
// Finish are COUNTED, not sequenced: the same scores must settle identically
// whichever tee the group went off. Match status, close-outs, auto-press
// triggers and holes-remaining are SEQUENCED, and only those.
//
// THE WORKED EXAMPLE, measured against HEAD before any fix (ff99402 + the
// play-order module, no engine change):
//   Ann and Ben, singles, gross, $10, no presses. Ann wins holes 10, 11, 12.
//   Ben wins holes 1, 2, 3, 4. Every other hole halved. Stroke totals 76 and 75
//   either way.
//     1st-tee start   Ben 1 up, Ann -$10.      (correct, and unchanged)
//     10th-tee start  SHOULD be Ben 1 up: Ann is 3 up after three played, and
//                     when she is 3 up standing on the card's 16th there are
//                     ELEVEN holes still to play, so nothing can close. Ben then
//                     takes four of the last nine and wins by one.
//     10th-tee, as the engine answers it today: "Ann 3&2", closed on the 16th
//                     with 11 to play, Ann +$10. Ben's four wins never counted.
//   A $20 swing to the wrong golfer, from hole arithmetic standing in for
//   sequence. That is the defect this wave fixes, and test 3 below is it.
//
// TWO BASELINES, because this file was built in two approved halves.
//
// BASELINE 2 (the settlement half, 2026-10-04): measured over the FINISHED file
// against 3b436a8 - the branch with the engine and the pages already in play
// order and settlement-engine.js / bet-strip.js UNTOUCHED - all 22 tests:
// 18 PASS / 4 FAIL. 18 + 4 = 22. The four reds are exactly the three approvals:
// the Receipt's start-hole label, the auto-press that only exists off the 10th
// tee, the skins carry onto the 1st, and the bet strip's main chip.
//   CONTROLS, each fired behaviourally and each restored by sha from a saved
//   copy (never git restore): reverting the receipts' engine call to number
//   order reds section 4; reverting the skins carry reds section 5; reverting
//   the main chip to holes[0] reds section 6.
//
// AND AN HONEST CORRECTION TO WHAT MOVES MONEY. For a single match segment the
// final status is the sum of its holes whichever order they are added in, so a
// side bet with no presses pays the same either way - measured over 6,000 random
// cards, there is no divergence at all without a press. What moves money is the
// AUTO-PRESS: two down on the 18th green off the 10th tee leaves NINE holes to
// play and the press fires, where in number order the 18th is the last hole and
// no press can exist. The $20 swing in the header below was real but it was a
// MISMATCH - play-order accumulation against number-order arithmetic - which is
// the state this wave removed rather than a difference between the two tees.
//
// BASELINE 1 (the engine half), measured over the then-FINISHED file with
// play-order.js present and match-engine.js UNTOUCHED, all 14 tests:
// 11 PASS / 3 FAIL. 11 + 3 = 14.
//
// BASELINE COUNT DELTA: +8 - eight tests were added on 2026-10-04 after that
// first baseline was measured, when Manny approved settlement-engine.js and
// bet-strip.js per file. They are sections 4, 5 and 6, and baseline 2 above is
// the measurement that covers all 22.
//   Most of this file passes before the fix, and that is the honest shape of it:
//   the play-order module is new code and its seven tests are about itself; the
//   key-collision test describes a trap that was already there; and the 1st-tee
//   arms assert that nothing moved for a round that teed off the 1st, which is
//   the claim the goldens make and it was already true.
//   The THREE that are red are the whole feature: the 10th-tee money, a close-out
//   that must not fire early, and the Nassau Overall in play order.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const P = require('./play-order.js');

// The REAL engine, in a realm with its real dependency. No stubs: this file is
// about money, and a stubbed engine would be a test of the stub.
const engine = (function () {
    const sb = { console };
    vm.createContext(sb);
    ['handicap.js', 'match-engine.js'].forEach(f => vm.runInContext(read(f), sb));
    return (players, courseData, scores, opts) => {
        const o = opts || {};
        sb.__p = players; sb.__cd = courseData; sb.__s = scores;
        sb.__o = Object.assign({ scoring: 'gross', format: 'match', press: 'none', stake: 10, holeBet: 0, manual: [], cfg: null }, o);
        return JSON.parse(vm.runInContext('JSON.stringify((function () {'
            + ' var r = calculateMatchEngine(__p, __cd, __s, __o.scoring, __o.format, __o.press, __o.stake, __o.holeBet, __o.manual, __o.cfg);'
            + ' return { money: r.t1TotalMoney, thru: r.maxThru, segs: r.activeMatches.map(function (m) {'
            + '   return { id: m.id, label: m.label, startHole: m.startHole, endHole: m.endHole,'
            + '            status: m.status, closed: m.closed, res: m.finalResult || null }; }) };'
            + '})())', sb));
    };
})();

const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const ANN = { id: 1, name: 'Ann Alpha', hcp: '0', team: 'Team 1' };
const BEN = { id: 2, name: 'Ben Bravo', hcp: '0', team: 'Team 2' };
// Every hole halved at 4s, except the holes named, which that golfer wins with a 4 to a 5.
function card(annWins, benWins) {
    const s = {};
    CD.forEach(h => {
        const a = annWins.includes(h.hole) ? 4 : (benWins.includes(h.hole) ? 5 : 4);
        const b = annWins.includes(h.hole) ? 5 : (benWins.includes(h.hole) ? 4 : 4);
        s['p1_h' + h.hole] = a; s['p2_h' + h.hole] = b;
    });
    return s;
}
const strokeTotal = (scores, id) => CD.reduce((n, h) => n + scores['p' + id + '_h' + h.hole], 0);
const seg = (r, id) => r.segs.find(s => s.id === id);

// ---------------------------------------------------------------------------
describe('1. THE ORDER THE HOLES ARE PLAYED IN', () => {

    test('a 10th-tee start plays 10..18 then 1..9, every hole exactly once', () => {
        const o = P.playOrder(CD, 10);
        assert.deepEqual(o.map(h => h.hole),
            [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.equal(o.length, CD.length, 'a rotation, not a filter');
    });

    test('and the 1st tee is the array it was given, in the order it was given', () => {
        // THIS IS WHAT KEEPS EVERY EXISTING ROUND SETTLING TO THE CENT.
        assert.deepEqual(P.playOrder(CD, 1).map(h => h.hole), CD.map(h => h.hole));
        assert.deepEqual(P.playOrder(CD, 0).map(h => h.hole), CD.map(h => h.hole), 'absent is the 1st');
        assert.deepEqual(P.playOrder(CD, 99).map(h => h.hole), CD.map(h => h.hole), 'a hole not on the card is the 1st');
    });

    test('the next hole played, and the last one', () => {
        const o = P.playOrder(CD, 10);
        assert.equal(P.nextHolePlayed(o, 18), 1, 'a press on the 18th starts on the 1st, not on hole 19');
        assert.equal(P.nextHolePlayed(o, 9), null, 'nothing follows the last hole played');
        assert.equal(P.lastHolePlayed(o), 9, 'Finish Round belongs on the 9th');
        assert.equal(P.lastHolePlayed(P.playOrder(CD, 1)), 18);
    });

    test('holes left in a segment is the old arithmetic on a 1st-tee start', () => {
        // The reason the money goldens cannot move: for a card played 1..18 this
        // function and `endHole - hole` are the same number, on every hole of
        // every segment. Asserted exhaustively rather than claimed.
        const o = P.playOrder(CD, 1);
        const all = CD.map(h => h.hole);
        const front = all.filter(h => h <= 9), back = all.filter(h => h > 9);
        [[all, 18], [front, 9], [back, 18]].forEach(([holes, endHole]) => {
            holes.forEach(h => {
                assert.equal(P.segmentHolesLeft(o, holes, h), endHole - h,
                    'segment ending ' + endHole + ', hole ' + h);
            });
        });
    });

    test('and on a 10th-tee start it is the sequence, which is the point', () => {
        const o = P.playOrder(CD, 10);
        const all = CD.map(h => h.hole);
        assert.equal(P.segmentHolesLeft(o, all, 16), 11,
            'standing on the 16th off the 10th tee there are eleven holes to play');
        assert.equal(P.segmentHolesLeft(o, all, 9), 0, 'the 9th is the last');
        assert.equal(P.segmentHolesLeft(o, all, 18), 9);
        // A Nassau Front 9 is holes 1-9 BY NUMBER and is played second here.
        assert.equal(P.segmentHolesLeft(o, all.filter(h => h <= 9), 18), 9, 'none of the front is played yet');
        assert.equal(P.segmentHolesLeft(o, all.filter(h => h > 9), 18), 0, 'the back is done');
    });

    test('the round tee and a group tee, normalised', () => {
        assert.equal(P.teeStartHole({ startingHole: 10 }, CD), 10);
        assert.equal(P.teeStartHole({}, CD), 1);
        assert.equal(P.teeStartHole({ startingHole: '10' }, CD), 10, 'a string from a <select> is a number');
        assert.equal(P.teeStartHole({ startingHole: 10 }, CD.slice(0, 9)), 1, 'a 10 on a nine-hole card is the 1st');
        const two = { startingHole: 1, groupStartingHoles: { '2': 10 } };
        assert.equal(P.groupStartHole(two, CD, 1), 1, 'group 1 is off the 1st');
        assert.equal(P.groupStartHole(two, CD, 2), 10, 'group 2 is off the 10th');
        assert.equal(P.groupStartHole(two, CD, 3), 1, 'a group with no entry plays the round tee');
    });

    test('THE KEY IS NOT startHole, and that is behavioural', () => {
        // startHole means "this BET starts on hole N" everywhere in this repo,
        // and events/<code>/startHole is read as the legacy Dots start. A round
        // tee stored there would stop paying dots and KPs on the first nine.
        const src = read('play-order.js');
        assert.match(src, /startingHole/, 'the module does not name the round tee at all');
        assert.ok(!/data\.startHole|\.startHole\b\s*\)/.test(src),
            'play-order.js reads startHole, which belongs to bets');
        // AND THE COLLISION IS REAL, not a story: this is the live reader.
        assert.match(read('index.html'), /if \(hole < \(parseInt\(currentData\.startHole, 10\) \|\| 1\)\) return null;/,
            'kpLiveState no longer reads currentData.startHole - re-read the collision before trusting the comment above');
        assert.match(read('action-model.js'), /const start = \(game && game\.startHole\) \|\| 1;/,
            'action-model no longer treats startHole as a game start');
    });
});

// ---------------------------------------------------------------------------
describe('2. SAME SCORES, TWO TEES', () => {

    const scores = card([10, 11, 12], [1, 2, 3, 4]);

    test('stroke totals are identical - they are counted, not sequenced', () => {
        assert.equal(strokeTotal(scores, 1), 76);
        assert.equal(strokeTotal(scores, 2), 75);
        // The same two numbers whichever order the holes are walked in. Asserted
        // by summing over the ORDERED card, which is what a totals row does.
        [1, 10].forEach(tee => {
            const o = P.playOrder(CD, tee);
            assert.equal(o.reduce((n, h) => n + scores['p1_h' + h.hole], 0), 76, 'tee ' + tee);
            assert.equal(o.reduce((n, h) => n + scores['p2_h' + h.hole], 0), 75, 'tee ' + tee);
        });
    });

    test('THE 1st-TEE ANSWER IS UNCHANGED: Ben 1 up, Ann -$10', () => {
        const r = engine([ANN, BEN], P.playOrder(CD, 1), scores);
        assert.equal(r.money, -10);
        assert.equal(seg(r, '18').status, -1);
        assert.match(String(seg(r, '18').res), /Ben 1 up/);
        assert.equal(r.thru, 18);
    });

    test('THE 10th-TEE ANSWER IS THE SAME MONEY, for a different reason', () => {
        // Ann is 3 up after three holes played. Standing on the card's 16th there
        // are ELEVEN holes still to play, so nothing can close; Ben takes four of
        // the last nine and wins by one. The engine used to call this "Ann 3&2"
        // on the 16th and stop counting - a $20 swing to the wrong golfer.
        const r = engine([ANN, BEN], P.playOrder(CD, 10), scores);
        assert.equal(seg(r, '18').status, -1,
            'the match closed early and stopped counting: ' + JSON.stringify(seg(r, '18')));
        assert.equal(r.money, -10, 'the money went to the wrong side');
        assert.match(String(seg(r, '18').res), /Ben 1 up/);
        assert.equal(r.thru, 18, 'every hole was played either way');
    });

    test('a close-out still closes, when it really is over', () => {
        // Ann wins every hole of the back (her first nine) and then the 1st. Nine
        // up with nine to play is NOT over - Ben could win all nine and square it
        // - so the close comes on the tenth hole played: ten up with eight left.
        const over = card([10, 11, 12, 13, 14, 15, 16, 17, 18, 1], []);
        const r = engine([ANN, BEN], P.playOrder(CD, 10), over);
        const m = seg(r, '18');
        assert.equal(m.closed, true, 'ten up with eight to play is not open');
        assert.match(String(m.res), /Ann 10&8/, 'the result reads: ' + m.res);
        // AND NINE UP WITH NINE TO PLAY REALLY IS STILL OPEN, so the line above
        // is not satisfied by an engine that closes everything. Measured AT THAT
        // MOMENT: only the back is on the card, which is a group walking off the
        // 18th green having started on the 10th tee. (Play the front out and it
        // closes on the very next hole - nine up with eight left - which is what
        // "Ann 9&8" above the fix was, on the right hole for the wrong reason.)
        const sofar = {};
        [10, 11, 12, 13, 14, 15, 16, 17, 18].forEach(h => { sofar['p1_h' + h] = 4; sofar['p2_h' + h] = 5; });
        const nine = engine([ANN, BEN], P.playOrder(CD, 10), sofar);
        assert.equal(nine.thru, 9, 'nine holes played');
        assert.equal(seg(nine, '18').status, 9);
        assert.equal(seg(nine, '18').closed, false,
            'nine up with nine to play was called over: ' + JSON.stringify(seg(nine, '18')));
        // THE SAME NINE HOLES OFF THE 1st TEE IS OVER, because there is nothing
        // left to play - the sequence is the only difference between the two.
        const front = {};
        [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(h => { front['p1_h' + h] = 4; front['p2_h' + h] = 5; });
        const half = engine([ANN, BEN], P.playOrder(CD.slice(0, 9), 1), front);
        assert.equal(seg(half, '18').closed, true, 'a nine-hole card nine up is over');
    });
});

// ---------------------------------------------------------------------------
describe('3. PRESSES AND NASSAU SEGMENTS IN PLAY ORDER', () => {

    test('an auto-press on the 18th starts on the 1st, not on hole 19', () => {
        // Two down on the 18th off the 10th tee, with nine holes still to play,
        // is exactly when a press is wanted. The press has to cover 1..9.
        const scores = card([], [10, 11]);
        const r = engine([ANN, BEN], P.playOrder(CD, 10), scores, { press: '2down' });
        const press = r.segs.find(s => s.id !== '18' && s.id !== 'F9' && s.id !== 'B9');
        assert.ok(press, 'two down with sixteen to play raised no press at all');
        assert.ok(press.startHole <= 18,
            'the press starts on hole ' + press.startHole + ', which is not a hole on this card');
        assert.equal(press.startHole, 12, 'two down after the 11th presses the 12th');
    });

    test('a Nassau is Front 1-9 and Back 10-18 BY NUMBER, whichever tee', () => {
        const scores = card([10, 11, 12], [1, 2, 3, 4]);
        [1, 10].forEach(tee => {
            const r = engine([ANN, BEN], P.playOrder(CD, tee), scores,
                { format: 'nassau', cfg: { F9: 5, B9: 5, '18': 10 } });
            assert.equal(seg(r, 'F9').startHole, 1, 'tee ' + tee);
            assert.equal(seg(r, 'F9').endHole, 9, 'tee ' + tee);
            assert.equal(seg(r, 'B9').startHole, 10, 'tee ' + tee);
            assert.equal(seg(r, 'B9').endHole, 18, 'tee ' + tee);
            // AND EACH NINE SETTLES THE SAME EITHER WAY, because play order and
            // number order agree WITHIN a nine - only the order of the two nines
            // differs, and the segments are independent wagers.
            assert.equal(seg(r, 'F9').status, -4, 'front, tee ' + tee);
            assert.equal(seg(r, 'B9').status, 3, 'back, tee ' + tee);
        });
    });

    test('and the Overall is in PLAY order, which is where the two differ', () => {
        const scores = card([10, 11, 12], [1, 2, 3, 4]);
        const one = engine([ANN, BEN], P.playOrder(CD, 1), scores, { format: 'nassau', cfg: { F9: 5, B9: 5, '18': 10 } });
        const ten = engine([ANN, BEN], P.playOrder(CD, 10), scores, { format: 'nassau', cfg: { F9: 5, B9: 5, '18': 10 } });
        assert.equal(seg(one, '18').status, -1);
        assert.equal(seg(ten, '18').status, -1, 'the overall closed early off the 10th: ' + JSON.stringify(seg(ten, '18')));
        // Same money both ways on THIS card: front -$5, back +$5, overall -$10.
        assert.equal(one.money, -10);
        assert.equal(ten.money, -10);
    });
});

// ---------------------------------------------------------------------------
// 4. THE SETTLEMENT HALF (2026-10-04, per-file approved: settlement-engine.js
//    and bet-strip.js)
//
// The main game settled in play order first, and for one commit a side bet on
// the same round settled in NUMBER order - so two wagers over the same holes
// could disagree about who was three up. That is the gap these close.
//
// EVERY WORKED EXAMPLE BELOW IS THE SAME SCORES TWICE: once off the 1st tee and
// once off the 10th, with nothing else different. The 1st-tee arm is the control
// that keeps the other one honest.
// ---------------------------------------------------------------------------
const { loadJsFile } = require('./helpers/load-script.js');
const SETTLE = loadJsFile('settlement-engine.js', ['money-engine.js']);

const SM_PLAYERS = [
    { id: 1, name: 'Ann Alpha', hcp: '0' }, { id: 2, name: 'Ben Bravo', hcp: '0' },
    { id: 3, name: 'Cal Charlie', hcp: '0' }, { id: 4, name: 'Dee Delta', hcp: '0' }
];
// The worked example from section 2, as a SIDE match: Ann wins 10, 11, 12; Ben
// wins 1, 2, 3, 4; everything else halved. Cal and Dee match Ben, so the skins
// fixtures below have ties to carry.
function roundFor(tee, extra) {
    const scores = {};
    CD.forEach(h => {
        const annWins = [10, 11, 12].includes(h.hole);
        const benWins = [1, 2, 3, 4].includes(h.hole);
        scores['p1_h' + h.hole] = annWins ? 4 : (benWins ? 5 : 4);
        scores['p2_h' + h.hole] = annWins ? 5 : (benWins ? 4 : 4);
        scores['p3_h' + h.hole] = 5;
        scores['p4_h' + h.hole] = 5;
    });
    return Object.assign({
        players: SM_PLAYERS, courseData: CD, scores,
        startingHole: tee === 10 ? 10 : 1,
        sideMatches: {
            sm1: {
                teamAIds: [1], teamBIds: [2], format: 'match', scoring: 'gross',
                stake: 10, pressRule: 'none', startHole: 1, createdAt: 1
            }
        }
    }, extra || {});
}
const receiptsFor = (data) => SETTLE.buildSideMatchReceipts(data, data.courseData, data.scores);

describe('4. A SIDE MATCH SETTLES LIKE THE MAIN GAME', () => {

    test('the same scores, both tees: Ben 1 up either way - and the 10th used to say Ann', () => {
        const one = receiptsFor(roundFor(1))[0];
        const ten = receiptsFor(roundFor(10))[0];
        assert.ok(one && ten, 'no side-match receipt was built at all');
        const segOf = r => (r.segments || []).find(s => !/press/i.test(String(s.label || '')));
        // THE CONTROL ARM: unchanged, and it is the arm the goldens pin.
        assert.match(String(segOf(one).result), /Ben 1 up/, '1st tee: ' + segOf(one).result);
        // THE APPROVED CHANGE: the same money, reached through the sequence. Before
        // it, this read "Ann 3&2" - closed on the card's 16th with ELEVEN holes
        // still to play - and paid the other golfer.
        assert.match(String(segOf(ten).result), /Ben 1 up/, '10th tee: ' + segOf(ten).result);
        assert.equal(segOf(one).money, segOf(ten).money,
            'the two tees paid different money on identical scores: '
            + segOf(one).money + ' vs ' + segOf(ten).money);
    });

    test('and the Receipt says the hole it STARTED on, which off the 10th is the 10th', () => {
        // settlement.html prints "Started Hole ${row.startHole}" off each segment,
        // and that number comes from the first hole of the range IN PLAY ORDER.
        const base = (tee) => receiptsFor(roundFor(tee))[0].segments[0];
        assert.equal(base(1).startHole, 1);
        assert.equal(base(10).startHole, 10,
            'the Receipt still names the lowest-numbered hole rather than the first one played');
        assert.equal(base(10).endHole, 9, 'and the last hole played is the 9th');
    });

    test('THE PRESS THAT ONLY EXISTS OFF THE 10th TEE - and it is the money', () => {
        // THE WORKED EXAMPLE, and the honest one. For a single match segment the
        // final status is the sum of the holes whichever order they are added in,
        // so a side bet with NO presses pays the same either way (the test above).
        // What moves money is an AUTO-PRESS: standing on the 18th green two down,
        // a group that teed off the 10th has NINE holes still to play and the press
        // fires; in number order the 18th is the last hole and no press is possible
        // at all. Measured over 6,000 random cards, this is the shape of every
        // divergence there is.
        //   Ann wins 1, 3, 6, 13, 16, 18. Ben wins 2, 4, 5, 7, 14. $10, 2-down rule.
        const press = (tee) => {
            const scores = {};
            const annWins = [1, 3, 6, 13, 16, 18], benWins = [2, 4, 5, 7, 14];
            CD.forEach(h => {
                const a = annWins.includes(h.hole), b = benWins.includes(h.hole);
                scores['p1_h' + h.hole] = a ? 4 : (b ? 5 : 4);
                scores['p2_h' + h.hole] = a ? 5 : (b ? 4 : 4);
            });
            const data = {
                players: [SM_PLAYERS[0], SM_PLAYERS[1]], courseData: CD, scores,
                startingHole: tee === 10 ? 10 : 1,
                sideMatches: { sm1: { teamAIds: [1], teamBIds: [2], format: 'match',
                    scoring: 'gross', stake: 10, pressRule: '2down', startHole: 1, createdAt: 1 } }
            };
            return SETTLE.buildSideMatchReceipts(data, CD, scores)[0];
        };
        const one = press(1), ten = press(10);
        // 1st TEE: one wager, Ann 1 up, $10 to Ann. No press - the only hole she was
        // two down on was the last one.
        assert.equal(one.segments.length, 1, '1st tee segments: ' + JSON.stringify(one.segments));
        assert.equal(one.netTo, 'Ann');
        assert.equal(one.netAmount, 10);
        // 10th TEE: the same scores raise a press on the 18th - the ninth hole they
        // played - covering 1..9, which Ben wins. $10 each way, nobody pays.
        assert.equal(ten.segments.length, 2, '10th tee segments: ' + JSON.stringify(ten.segments));
        const p = ten.segments.find(x => /press/i.test(String(x.label)));
        assert.ok(p, 'no press was raised with nine holes still to play');
        assert.equal(p.startHole, 1, 'the press starts on the hole AFTER the 18th, which is the 1st');
        assert.equal(p.endHole, 9, 'and it runs to the last hole played');
        assert.match(String(p.result), /Ben 1 up/);
        assert.equal(ten.netAmount, 0, 'the press did not reach the money: ' + JSON.stringify(ten.segments));
    });

    test('a NASSAU side bet: each nine by number, the Overall in play order', () => {
        const nassau = (tee) => {
            const d = roundFor(tee);
            d.sideMatches.sm1 = Object.assign({}, d.sideMatches.sm1,
                { format: 'nassau', frontStake: 5, backStake: 5, overallStake: 10 });
            return receiptsFor(d)[0];
        };
        const one = nassau(1), ten = nassau(10);
        const label = (r, re) => (r.segments || []).find(s => re.test(String(s.label || '')));
        // Front is holes 1-9 and Back is 10-18 whichever tee, so each nine settles
        // identically - only the order of the two nines differs, and they are
        // independent wagers. `money` is a magnitude and `toSideA` the direction,
        // so both are compared: equal magnitudes paid the other way round would be
        // the whole bug.
        ['Front', 'Back', 'Total'].forEach(name => {
            const a = label(one, new RegExp(name)), b = label(ten, new RegExp(name));
            assert.ok(a && b, name + ' segment missing');
            assert.equal(a.money, b.money, name + ': ' + a.money + ' vs ' + b.money);
            assert.equal(a.toSideA, b.toSideA, name + ' went to the other side');
            assert.equal(a.result, b.result, name + ': ' + a.result + ' vs ' + b.result);
        });
        // AND THE THREE WAGERS REALLY DID GO DIFFERENT WAYS on this card, so the
        // test above is not satisfied by three identical rows: Ben took the front
        // 4&3, Ann took the back 3&2, Ben took the Total 1 up.
        assert.notEqual(label(one, /Front/).toSideA, label(one, /Back/).toSideA,
            'the front and the back went to the same golfer, so this fixture proves nothing');
        assert.match(String(label(ten, /Front/).result), /Ben 4&3/);
        assert.match(String(label(ten, /Back/).result), /Ann 3&2/);
        assert.match(String(label(ten, /Total/).result), /Ben 1 up/);
    });
});

describe('5. SKINS CARRY TO THE NEXT HOLE PLAYED', () => {

    // Ann alone birdies the 1st; everybody halves the 18th. Off the 1st tee the
    // 18th is the last hole and its skin is left pending. Off the 10th tee the
    // 18th is the NINTH hole played and the tie carries forward to the 1st - which
    // Ann wins, so she takes two units instead of one.
    function skinsRound(tee) {
        const scores = {};
        CD.forEach(h => { SM_PLAYERS.forEach(p => { scores['p' + p.id + '_h' + h.hole] = 4; }); });
        scores['p1_h1'] = 3;                       // Ann alone wins the 1st
        return {
            players: SM_PLAYERS, courseData: CD, scores,
            startingHole: tee === 10 ? 10 : 1,
            skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: true
        };
    }
    const skinsOf = (data) => SETTLE.computeSkinsPayoutLines(data, data.courseData, data.scores);
    const linesOf = (r) => ((r.gross && r.gross.lines) || []);

    test('off the 1st tee: the 1st is the first hole played, so nothing has carried', () => {
        const r = skinsOf(skinsRound(1));
        const won = linesOf(r);
        assert.equal(won.length, 1, 'skins won: ' + JSON.stringify(won));
        assert.equal(won[0].hole, 1);
        assert.equal(won[0].units, 1, 'something carried onto the first hole played');
        assert.equal(r.gross.pendingUnits, 17,
            'the seventeen halved holes after it are pending: got ' + r.gross.pendingUnits);
    });

    test('off the 10th tee the SAME scores carry nine ties onto the 1st', () => {
        const r = skinsOf(skinsRound(10));
        const won = linesOf(r);
        assert.equal(won.length, 1, 'skins won: ' + JSON.stringify(won));
        assert.equal(won[0].hole, 1, 'the only hole anybody won outright is still the 1st');
        // THE WORKED EXAMPLE: holes 10 to 18 are played first and all nine halve,
        // so nine units ride onto the 1st - which Ann wins outright - and she takes
        // ten. The eight holes after it (2 to 9) halve and stay pending.
        assert.equal(won[0].units, 10,
            'the nine halved holes of the back nine did not carry onto the 1st: got '
            + won[0].units + ' unit(s)');
        assert.equal(r.gross.pendingUnits, 8,
            'the eight holes played after the 1st are pending: got ' + r.gross.pendingUnits);
    });

    test('and a first-tee round is byte-identical, which is the whole promise', () => {
        // The helper hands back the CALLER'S OWN ARRAY for a first-tee round, so
        // nothing re-sorts and nothing re-orders. Asserted on the serialised result
        // rather than on the arithmetic, because "byte-identical" is the claim.
        const data = skinsRound(1);
        const before = JSON.stringify(skinsOf(data));
        const asPlayed = SETTLE.computeSkinsPayoutLines(data, P.playOrder(data.courseData, 1), data.scores);
        assert.equal(JSON.stringify(asPlayed), before);
    });
});

// ---------------------------------------------------------------------------
describe('6. THE BET STRIP SAYS THE HOLE IT STARTED ON', () => {

    // bet-strip.js is PROTECTED and this is the one approved site: the main chip's
    // "Started Hole N". Off the 10th tee the main bet started on the 10th, and the
    // chip has to agree with the Receipt segment two sections above - they are the
    // same wager on the same screen.
    const STRIP = loadJsFile('bet-strip.js',
        ['handicap.js', 'match-engine.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js']);
    const strokePlayers = [
        { id: 1, name: 'Ann Alpha', hcp: '0', playingForMoney: true },
        { id: 2, name: 'Ben Bravo', hcp: '0', playingForMoney: true }
    ];
    function stripFor(tee) {
        const scores = {};
        CD.forEach(h => { scores['p1_h' + h.hole] = 4; scores['p2_h' + h.hole] = 5; });
        const data = {
            players: strokePlayers, courseData: CD, scores, startingHole: tee,
            gameFormat: 'match', matchScoringStyle: 'stroke', matchStake: 10,
            matchScoring: 'gross', matchPressRule: 'none'
        };
        return STRIP.buildBetStrip(data, CD, scores, strokePlayers);
    }

    test('the main chip starts on the first hole PLAYED', () => {
        const one = stripFor(1), ten = stripFor(10);
        assert.equal(one.eligible, true, 'the strip is not eligible, so nothing is being measured');
        assert.equal(ten.eligible, true);
        assert.equal(one.chips[0].detail.startHole, 1);
        assert.equal(one.chips[0].detail.rangeText, 'Started Hole 1');
        assert.equal(ten.chips[0].detail.startHole, 10,
            'the chip still names the lowest-numbered hole: ' + ten.chips[0].detail.rangeText);
        assert.equal(ten.chips[0].detail.rangeText, 'Started Hole 10');
        // AND THE WAGER ITSELF IS THE SAME WAGER either way - same stake, same
        // winner, same money - so the hole number is the only thing that moved.
        assert.equal(one.chips[0].stake, ten.chips[0].stake);
        assert.equal(one.chips[0].statusText, ten.chips[0].statusText);
    });
});
