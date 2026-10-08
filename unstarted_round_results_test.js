// ============================================================================
// AN UNPLAYED ROUND'S OWN RESULTS PAGE OWES NOBODY ANYTHING (2026-10-07)
//
// MANNY'S RULE, carried over from the trip ledger: until a round has STARTED,
// its Results page shows $0 for everyone - no charge and no refund.
//
// THE DEFECT, measured on his real Day 3 (3MKUCF, Pine Lakes, 4 golfers, 0
// scores, $20 buy-in with KP $20 / Net $40 / Skins remainder - read from the
// live database and saved as unstarted_round.fixture.json):
//
//   each golfer paid        $20
//   the card refunded      "$60 / 4"  = $15 each
//   the KP bucket held     "$5 in the pot" on each of four blank holes
//   so the page said       every golfer was $5 down on a round nobody played
//
// computeCombinedNetTotals says -5 for all four, which is exactly what the
// trip page was reading before it was fixed.
//
// WHERE THE FIX IS, AND WHERE IT IS NOT. NO ENGINE FILE WAS TOUCHED.
// pool-engine.js keeps Manny's 2026-09-22 rule that KP money never goes back
// to the field, and the engine still answers -5 for an unstarted round - that
// is asserted below, deliberately, so nobody later reads this guard as a claim
// that the arithmetic changed. The fix is that settlement.html stops
// PRESENTING the pot's accounting before the round starts, the same shape as
// trip.html's fix: stop ASKING an unplayed round what it owes.
//
// THIS FILE IS THE SOURCE HALF OF A PAIR. It can see the gate but not the
// screen. tools/unstarted-results-check.js is the rendered half: it opens the
// Results URL on this same fixture in Chrome and measures 5 faults against the
// pre-fix page and 0 after, with a POSITIVE CONTROL that the same round, fully
// played, still renders the whole pool card.
//
// BASELINE, against the pre-fix settlement.html (sha 663ec44e9a5179fe), all 7
// tests: 5 PASS / 2 FAIL. The two reds are the gate and its sentence. Of the
// five that pass there:
//   - four are the engine arm (the `started` predicate, its control, the -$5
//     answer and the sha goldens) and are MEANT to pass on both sides - this
//     fix does not change any of them, which is the claim they exist to hold;
//   - one is "the gate reads ONE predicate", a doesNotMatch, and it is INERT
//     against the pre-fix file - there was no gate at all to read the wrong
//     way. It is a don't-regress pin on the fix's shape, not a caught defect,
//     and saying so beats inventing an assertion to make it look caught.
// The rendered half (tools/unstarted-results-check.js) is what measures the
// screen itself: 5 faults before, 0 after.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ROUND = JSON.parse(read('unstarted_round.fixture.json'));

// The whole function, ending at the next one - never a character count, which
// is a guess about file length that any edit above the claim invalidates.
function fnOf(src, name) {
    const at = src.indexOf('function ' + name);
    if (at === -1) return null;
    const end = src.indexOf('\n    function ', at + 10);
    return src.slice(at, end === -1 ? src.length : end);
}

describe('1. THE PAGE DOES NOT ACCOUNT FOR A ROUND NOBODY STARTED', () => {

    test('the pool section is gated on the round having started', () => {
        const fn = fnOf(read('settlement.html'), 'renderMoneyPoolSection');
        // POSITIVE ASSERTION FIRST: a slice that collapsed to nothing satisfies
        // every "must contain" below by never being compared at all.
        assert.ok(fn && fn.length > 800, 'renderMoneyPoolSection did not slice - this test is guarding nothing');
        assert.match(fn, /computeMoneyPool\(data, courseData, savedScores\)/,
            'the slice is not the pool renderer');
        assert.match(fn, /receiptSettlement\(data, courseData, savedScores\)/,
            'the pool card no longer asks whether the round has started');
        assert.match(fn, /if \(!poolStart\.started\)/,
            'the unstarted branch is gone, so an unplayed round is accounted for again');
    });

    test('and it says so in the trip page’s own words, with $0 a golfer', () => {
        // DECODED: the em dash is written as an escape, and a plain regex sees
        // six ASCII characters where the golfer sees one glyph.
        const fn = decodeEscapes(fnOf(read('settlement.html'), 'renderMoneyPoolSection') || '');
        assert.match(fn, /Not played yet — it owes nobody anything\./,
            'the unstarted card does not carry the sentence');
        assert.match(fn, /\$0/, 'the unstarted card shows no $0 figure');
        // ONE RULE, ONE SENTENCE. The trip ledger says the same thing about the
        // same state; if one of them is reworded the pair stops agreeing and a
        // golfer gets two different explanations of one rule.
        assert.match(decodeEscapes(read('trip.html')),
            /Not played yet — it owes nobody anything\./,
            'trip.html no longer carries the sentence this page was matched to');
    });

    test('the gate reads ONE predicate, not a second definition of started', () => {
        const fn = fnOf(read('settlement.html'), 'renderMoneyPoolSection');
        // Not a hand-rolled "any score?" scan: the page's own receiptSettlement()
        // wraps settlement-engine's computeRoundSettlement, which is what the
        // trip, the receipt head and the Finish Round gate all read.
        assert.doesNotMatch(fn, /Object\.keys\(savedScores[^)]*\)\.length === 0/,
            'the pool card invented its own started test instead of reading the engine');
    });
});

describe('2. THE ENGINE IS UNCHANGED, AND STILL ANSWERS WHAT IT ANSWERED', () => {

    const sb = () => loadJsFile('settlement-engine.js',
        ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
         'pool-engine.js', 'payouts.js']);
    const run = (data, scores, expr) => {
        const box = sb();
        box.DATA = data; box.CD = data.courseData; box.SCORES = scores;
        return JSON.parse(vm.runInContext('JSON.stringify(' + expr + ')', box));
    };

    test('computeRoundSettlement says this round has NOT started', () => {
        const st = run(ROUND, {}, 'computeRoundSettlement(DATA, CD, SCORES)');
        assert.equal(st.started, false, 'the fixture is not an unstarted round any more');
        assert.equal(st.settled, false);
    });

    test('and it DOES start on one hole from one golfer - the control', () => {
        // Without this, "not started" could be true of a fixture the engine
        // simply cannot read, and the gate above would be guarding a mistake.
        const one = {}; one['p' + ROUND.players[0].id + '_h1'] = 4;
        const st = run(ROUND, one, 'computeRoundSettlement(DATA, CD, SCORES)');
        assert.equal(st.started, true, 'one posted hole does not start the round');
    });

    test('THE ARITHMETIC IS UNTOUCHED: the engine still returns -$5 a golfer here', () => {
        // This is NOT the behaviour being fixed, and saying so is the point.
        // pool-engine.js holds the $20 KP bucket as unresolved because four KP
        // holes are blank - Manny's own rule, 2026-09-22, that KP money never
        // goes back to the field. $80 in, $60 refunded, $20 held = -$5 each.
        // The page simply stops presenting that before the round starts. If a
        // later wave DOES change the engine, this test goes red and the claim
        // in this file's header has to be rewritten rather than quietly left.
        const comb = run(ROUND, {}, 'computeCombinedNetTotals(DATA, CD, SCORES)');
        const nets = Object.values(comb.netByName).map(v => v.net);
        assert.deepEqual(nets, [-5, -5, -5, -5],
            'the engine’s answer for an unstarted round moved: ' + JSON.stringify(comb.netByName));
        const pool = run(ROUND, {}, 'computeMoneyPool(DATA, CD, SCORES)');
        assert.equal(pool.kpUnresolvedCents, 2000, 'the held KP bucket moved');
        assert.equal(pool.refund.cents, 6000, 'the refund moved');
    });

    test('every money file is byte-identical to what this wave started from', () => {
        // BY SHA. The fix is one branch in a page; no engine file is edited, and
        // that claim is checkable rather than asserted in prose. bet-strip.js is
        // pinned at the value the four-bug wave left it at (it was re-pinned
        // there with its reason), not at build 8's.
        const GOLDEN = {
            'money-engine.js': '12bfa41c2c8e6b8a', 'settlement-engine.js': '6ddd4c8676cd8802',
            'payouts.js': 'c35e34f571e564c0', 'pool-engine.js': '372e76d7d5c41c38',
            'handicap.js': '2d3b2f7fd916a4b8', 'action-model.js': '399ba26f0025b8d1',
            'ryder-cup.js': '0b4e3f9059ad29a8', 'score-marks.js': '02f972d6d2fc7cad',
            'hole-events.js': '6fd7f7edf41e848b', 'bet-strip.js': '3b2dd5fb785e16f3'
        };
        const moved = Object.keys(GOLDEN).filter((f) => crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(__dirname, f))).digest('hex').slice(0, 16) !== GOLDEN[f]);
        assert.deepEqual(moved, [],
            'money file(s) changed in a wave that claims none did - name which and why: ' + moved.join(', '));
    });
});
