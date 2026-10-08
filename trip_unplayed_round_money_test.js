// ============================================================================
// AN UNPLAYED ROUND OWES NOTHING (2026-10-07, STRICT)
//
// FOUND SETTING UP SCREENSHOTS on the Myrtle trip: Day 3 had not been played -
// not one score on it - and the trip money card charged every golfer -$5 for it
// and folded that into the trip total. The pot was counting before the trip was
// final.
//
// WHY IT HAPPENED. The trip sums each counted round's own settlement, and a
// buy-in is charged PER GOLFER the moment the round exists: that is correct
// inside a round (the pool is money on the table), and wrong across a trip
// nobody has played yet. The trip was asking a round that had not started what
// it owed, and the round answered.
//
// THE RULE. A round NOBODY has started contributes nothing to a trip total, and
// the trip says it is waiting on it. "Started" is not a new predicate: it is
// settlement-engine's own `started` - at least one golfer with at least one hole
// - already read on this screen to decide whether the heading may say Final.
//
// BASELINE against build 8's trip.html (21f9c7f, swapped in and restored by
// sha), all 14 tests: 13 PASS / 1 FAIL. The one red is the comparison - linking
// a round nobody has played changed every golfer's trip figure - and it is the
// whole defect. The per-round-row test passes there too and is VACUOUS on build
// 8: it looks for a charge within 600 characters of the Day 3 label and the old
// card put the figures elsewhere, so the comparison is what does the work.
//
// (With build 8's bet-strip.js swapped in as well, all 14 tests: 12 PASS / 2 FAIL -
// the extra red is the bet-strip pin below, which belongs to the Matches tab fix
// in the same brief, not to this one.)
//
// THE TRIP FIX TOUCHES NO ENGINE FILE. computeCombinedNetTotals and
// computeRoundSettlement are untouched; the fix is that trip.html stops ASKING
// an unplayed round what it owes.
//
// ONE MONEY FILE DID MOVE IN THIS WAVE, AND IT IS NOT THIS FIX: bet-strip.js,
// for the Matches tab defect. It is pinned explicitly at the bottom of this file
// with its old and new sha and the reason, rather than being edited into the
// golden list. The other nine are byte-identical to build 8.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const ENGINES = ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
                 'settlement-engine.js', 'pool-engine.js', 'payouts.js', 'course-data.js'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const FOUR = ['Manny', 'Tim', 'Rocco', 'Matt']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: '8', playingForMoney: true }));

// THE REAL DAY 3 POT, read off the live round 3MKUCF rather than invented: a $20
// buy-in with a $20 KP bucket, a $40 net prize and skins taking the remainder.
//
// WHY THAT SHAPE MATTERS - it is where the -$5 comes from, measured on the live
// record: four golfers x $20 is an $80 pot; with no scores the engine refunds
// the net prize and the skins remainder ($15 each) and HOLDS THE $20 KP POT,
// because a blank KP on a live round is "not yet" and only refunds once the
// round is finished. -$20 + $15 = -$5 each. That rule is right for a round in
// progress and wrong for a round nobody has teed off on.
const POT = { enabled: true, buyIn: 20, kp: { amount: 20, holes: [2, 8, 11, 16] },
              net: { amount: 40, places: [50, 30, 20] },
              skins: { mode: 'remainder', scoring: 'net', carryOver: true } };
function roundOf(scored) {
    const scores = {};
    if (scored) FOUR.forEach((p, i) => { for (let h = 1; h <= 18; h++) scores['p' + p.id + '_h' + h] = 4 + (i % 2); });
    return { eventName: 'Day', courseName: 'Caledonia', players: FOUR, gameFormat: 'stroke',
             courseData: CD, scores, settlementMode: 'whole-dollar',
             groupSizeOverrides: { 0: 4 }, moneyPool: POT };
}

// The trip page with whichever rounds the test wants linked. "Day 3" is the
// one nobody has started; the others are played.
function tripPage(labels) {
    const sb = loadHtmlInlineScript('trip.html', ENGINES, { search: '?trip=TF93GJ' });
    const rounds = labels.map((label, i) => ({
        code: 'RND' + i, label, countsTowardTrip: true, data: roundOf(label !== 'Day 3')
    }));
    vm.runInContext(`
        currentTripCode = 'TF93GJ';
        tripData = { name: 'Myrtle', rounds: ${JSON.stringify(
            Object.fromEntries(rounds.map(r => [r.code, { label: r.label }])))} };
        cachedRoundResults = ${JSON.stringify(rounds)};
        cachedCountedResults = cachedRoundResults.slice();
        renderTripMoneySettlement();
        'rendered';`, sb);
    const el = sb.document.getElementById('trip-money-settlement');
    return { sb, html: String(el.innerHTML || '') };
}

describe('1. THE TRIP MONEY CARD', () => {

    // THE LEDGER LINES AS RENDERED, name -> dollars, read out of the card.
    function ledger(html) {
        const out = {};
        const re = /<span>([^<]+)<\/span><span><span class="val-(?:pos|neg)">([+\u2212-]?\$[0-9.]+)<\/span>/g;
        let m;
        while ((m = re.exec(html))) {
            out[m[1].trim()] = Number(String(m[2]).replace(/[^0-9.-]/g, '')) * (/[\u2212-]\$/.test(m[2]) ? -1 : 1);
        }
        return out;
    }

    test('THE TRIP TOTAL IS THE ROUNDS THAT WERE PLAYED, and nothing else', () => {
        // THE COMPARISON IS THE CLAIM. The same two played rounds, rendered once
        // with an unplayed Day 3 linked and once without it: every golfer's trip
        // figure must be identical. No expected number is typed here, so the
        // test cannot drift from the engine.
        const withUnplayed = ledger(tripPage(['Day 1', 'Day 2', 'Day 3']).html);
        const playedOnly = ledger(tripPage(['Day 1', 'Day 2']).html);
        assert.ok(Object.keys(playedOnly).length >= 2,
            'the played-only card has no ledger lines, so this comparison proves nothing: '
            + JSON.stringify(playedOnly));
        assert.deepEqual(withUnplayed, playedOnly,
            'linking a round NOBODY has played changed the trip money. With Day 3: '
            + JSON.stringify(withUnplayed) + ' without it: ' + JSON.stringify(playedOnly));
    });

    test('and the unplayed round is not charging anybody on its own row', () => {
        const { html } = tripPage(['Day 1', 'Day 2', 'Day 3']);
        const at = html.indexOf('Day 3');
        assert.ok(at !== -1, 'Day 3 is not mentioned at all - the group needs to know it is waiting');
        // -$5 a head is the signature: a $20 buy-in less a $15 refund, with the
        // $20 KP pot held open because the round is not finished.
        assert.doesNotMatch(html.slice(at, at + 600), /[\u2212-]\$5\b/,
            'the unplayed round still shows a charge: ' + html.slice(at, at + 200));
    });

    test('the heading says it is not final, and names the round it is waiting on', () => {
        const { html } = tripPage(['Day 1', 'Day 2', 'Day 3']);
        // THE APP'S OWN WORDS, read off the card rather than guessed: the heading
        // is "Not Settled Yet" and the line under it names the rounds.
        assert.match(html, /Not Settled Yet/);
        assert.match(html, /Not started yet: Day 3/,
            'nothing says which round it is waiting for');
        assert.doesNotMatch(html.slice(0, 600), /\bFinal\b/,
            'the card claims Final with a round nobody has started');
    });

    test('A PLAYED ROUND STILL PAYS - the positive control', () => {
        // Skipping an unplayed round must not become skipping a round: a guard
        // that only ever hides money would pass on an app that shows none.
        const { html } = tripPage(['Day 1']);
        const lines = ledger(html);
        assert.ok(Object.keys(lines).length >= 2, 'a played round shows no ledger at all: ' + html.slice(0, 200));
        assert.ok(Object.values(lines).some(v => Math.abs(v) > 0.005), 'every figure is zero: ' + JSON.stringify(lines));
    });
});

describe('2. AND NINE OF THE TEN MONEY FILES DID NOT MOVE', () => {

    // BY SHA, against build 8's tree. The trip fix is that trip.html stops
    // asking an unplayed round what it owes; nothing about how a round computes
    // money changed, and that claim is checkable rather than asserted in prose.
    //
    // THE TENTH IS bet-strip.js, AND IT DID MOVE - deliberately, for the
    // Matches tab defect in the same brief. It is pinned separately below
    // rather than quietly renumbered here, because a golden list that gets
    // edited whenever it goes red is not a golden list.
    const GOLDEN = {
        'money-engine.js': '12bfa41c2c8e6b8a', 'settlement-engine.js': '6ddd4c8676cd8802',
        'payouts.js': 'c35e34f571e564c0', 'pool-engine.js': '372e76d7d5c41c38',
        'handicap.js': '2d3b2f7fd916a4b8', 'action-model.js': '399ba26f0025b8d1',
        'ryder-cup.js': '0b4e3f9059ad29a8', 'score-marks.js': '02f972d6d2fc7cad',
        'hole-events.js': '6fd7f7edf41e848b'
    };
    const shaOf = (f) => crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(__dirname, f))).digest('hex').slice(0, 16);
    Object.keys(GOLDEN).forEach((f) => {
        test(f + ' is byte-identical to build 8', () => {
            assert.equal(shaOf(f), GOLDEN[f],
                f + ' changed. If that is deliberate, say which file and why in the report - '
                + 'this wave claims no engine file moved.');
        });
    });

    // ------------------------------------------------------------------------
    // bet-strip.js: CHANGED ON PURPOSE, AND IT IS A PROTECTED FILE.
    //
    // build 8      6a876155251e71a2
    // this wave    3b2dd5fb785e16f3
    //
    // WHY: on a FINISHED round every row on the Matches tab read "All square -
    // Thru 18", including the one Manny won 7&6. buildSideActionRows took its
    // headline from the live bet strip, and `closed` is false for a level match
    // at the 18th, so it picked the undecided chip. The change reads the
    // RECEIPT settlement-engine.js already priced and prints its words.
    //
    // NO ARITHMETIC AND NO NEW MONEY. The one numeric expression added is
    // Math.abs() on a net the receipt had already computed, used to build a
    // label. matches_tab_finished_test.js holds the behaviour; this holds the
    // line that nothing else in the file moved with it.
    // ------------------------------------------------------------------------
    test('bet-strip.js moved, and only for the Matches tab fix', () => {
        assert.equal(shaOf('bet-strip.js'), '3b2dd5fb785e16f3',
            'bet-strip.js is not the version this wave reviewed - re-pin it and say why.');
        const code = fs.readFileSync(path.join(__dirname, 'bet-strip.js'), 'utf8');
        // The fix is present and reads the receipt rather than re-deriving.
        assert.match(code, /sideMatchRangeComplete\(sm, data\.players/,
            'the finished-match gate is gone from bet-strip.js');
        assert.match(code, /sideMatchOrderedSegments\(rec\)/,
            'bet-strip.js no longer reads the receipt segments');
        // AND IT STILL SUMS NO MONEY OF ITS OWN: the only decided figure comes
        // from side-match-lines.js, which sums the receipt.
        assert.match(code, /sideMatchDecidedNet\(smlReceipts\[id\]\)/,
            'the decided figure is no longer the receipt’s own');
    });
});
