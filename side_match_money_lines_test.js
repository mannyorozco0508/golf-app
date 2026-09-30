// ============================================================================
// SIDE MATCH CARDS SHOW THE MONEY PER BET (Wave 29)
//
// THE REPORT. Manny added a Match Play side match after the round - Marty vs
// Manny, NET, $20/match, press 2 down - and the card said:
//
//     FINAL · Manny 3&2 · P1 (h5) Marty 1&0 · P2 (h11) Manny 3&2
//             · P3 (h15) Marty 1&0     Ledger: $0 | $0
//
// The $0 is RIGHT: Manny took the base and Press 2, Marty took Press 1 and
// Press 3, $40 each, net nothing. It reads as broken because the card never
// says that. Post-round side bets are a core use - a group enters the wager
// after the round and has to see who won what - so a card that shows the
// result of every bet and none of the money is the wrong half.
//
// WHAT THIS WAVE BUILDS, and what it deliberately does not:
//   side-match-lines.js   ONE builder, pure over buildSideMatchReceipts
//   skins.html            the Bets card: a dollar line per bet, push summary
//   stats.html            Final Results: the same lines above the side totals
//   settlement.html       the Receipt: the push summary (its per-bet money
//                         has been correct since v141)
//   bet-strip.js:819      `decided += 0` - the one line that made a won Match
//                         Play side bet worth nothing on the scorecard
//   NOT sidematches.html  the v135 split stays: that card is one line, and
//                         bets_matches_split_test.js:200 asserts no ledger
//   NOT the "N&0" wording and NOT baseId press labels - Wave 30, unapproved
//
// NOTHING IS RECOMPUTED. Every dollar on every surface comes from
// settlement-engine.js buildSideMatchReceipts, which has returned per-segment
// { stake, result, winner, money, toSideA } since v141. The builder in this
// wave is string assembly over that, and the test below asserts the file
// contains no engine call at all.
//
// THE OPEN-SEGMENT TRAP, measured before anything was built. An unfinished
// segment reports a NON-ZERO money with a NULL winner:
//     Match Play thru 6, Manny 1 up, still open:
//        money $30, winner null, result "Reese 1 up"
// So `money` means "what this bet pays if it ended now", not "what it paid".
// settlement.html:1023 has always gated on `seg.winner && seg.money > 0`;
// every surface here uses the same gate, and the tests below prove an
// undecided bet prints no dollars anywhere.
//
// AND A HALVED MATCH IS NEVER `closed`. A segment closes when |status| > holes
// remaining; at hole 18 that is |0| > 0, false. So a finished all-square match
// is not closed, and skins.html's `isFinal = every(m => m.closed)` called it
// LIVE. Finishedness here is EVERY HOLE IN RANGE POSTED, never `closed`.
//
// THE FIXTURES, in helpers/side-match-cards.js, are Manny's two real bets:
//   matchRound()   the card above - base + three CHAINED presses, net $0
//   nassauRound()  Manny vs Reese, and REESE TOOK EVERY BET: -$100 / +$100,
//                  which is what his screen showed. Two presses, both called
//                  "Press 1", of different bets - the Wave 30 question
//   netRound()     Manny scratch v Marty off 18 over identical scores: NET is
//                  all square, GROSS is Manny 10&8. The allowance is the only
//                  difference between the two cards, so it is exercised.
//   mixedCardsRound()  the three states one card has to tell apart: a finished
//                  push, a bet thru 6 of 18, and a finished all-square
//
// THE RED BASELINE, measured against the FINAL file per CLAUDE.md's count rule -
// re-run after the last assertion was written, with the six changed production files
// swapped back to branch point fec1050 by sha and side-match-lines.js removed:
//
//     skins.html 07d577a8..., stats.html a89b635b..., settlement.html 5c1df231...,
//     bet-strip.js 000156db..., index.html 83eeff21..., sidematches.html 5271f03e...
//
//     all 29 tests:   5 PASS / 24 FAIL
//
// IT TOOK THREE MEASUREMENTS TO GET THAT RIGHT, and each correction is worth more
// than the number:
//   I first wrote 7 PASS from a guess. The truth at 27 tests was 5 - the Receipt's
//     "no dollars on an undecided bet" was NOT already true, because MATCH NET reads
//     receipt.net, which books open segments, and printed "Reese +$30" on a bet with
//     twelve holes unplayed.
//   Then I added two tests after measuring, and the arithmetic guard from Wave 27
//     went red on its first real wave: the header said 5/22 at 27 tests while the file
//     registered 29. (Written in shorthand here on purpose - baseline_arithmetic_test
//     .js reads a full "N PASS / M FAIL" as a CLAIM, confession or not.) Re-measured
//     rather than declaring a delta, which is what the count rule asks for.
//   The re-measurement then showed 6 PASS, and the sixth was a VACUOUS assertion of
//     mine: "a verified round still explains its money" matched /all square/i anywhere
//     in the mount, and a halved SEGMENT already printed "All square" - it was reading
//     a different line from the one it was about. Tightened to the MATCH NET line, and
//     the honest figure is 5.
//
// THE FIVE THAT PASS WITHOUT THE WAVE, and not one of them is coverage:
//   FOUR FIXTURE CHECKS - the engine already returns every figure this wave prints,
//     which is the whole argument for calling it a display wave. They are the
//     precondition, not the feature.
//   ONE v135 CHECK - the Matches tab is one line today and must stay one line, so it
//     is green before and after by design.
//
// One of the 24 reds is red for a LOAD reason rather than a behaviour one, and saying
// so is the point: the scorecard's "AT STAKE" test names side-match-lines.js in its
// dependency list, so at the baseline bet-strip.js cannot load at all.
//
// FIVE NEGATIVE CONTROLS, each measured, each red BEHAVIOURALLY - and restored by
// copying a saved file back and printing its sha, never with git checkout:
//
//   bet-strip.js back to `decided += 0`        27 tests, 3 FAIL
//       and the figure itself moved, which is the point: the scorecard row for
//       Manny's Nassau went netMoney -100, netText "You're down $100" to
//       netMoney 0, netText "" - a hundred dollars lost and no money on screen.
//   side-match-lines.js drops the seg.winner gate   27 tests, 2 FAIL
//       an unfinished bet starts announcing the provisional figure.
//   skins.html isFinal back to every(m => m.closed) 27 tests, 1 FAIL
//       the finished all-square match reads LIVE again.
//   settlement.html MATCH NET back to receipt.net   27 tests, 2 FAIL
//       "Reese +$30" returns to a bet with twelve holes unplayed.
//   sideMatchRangeComplete stubbed true             27 tests, 2 FAIL
//       a level match mid-round starts claiming it was halved.
//
// WHAT mini-dom CANNOT PROVE, said plainly: layout, and the tap that opens the
// scorecard's Action Center. The index.html test below sets actionCenterOpen
// and calls the page's own renderActionCenter - it is the one test here that is
// not a pure arrival, and it is marked. Every other page test loads the page
// with the link's query string and lets the round arrive through the listener
// the page itself registered.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/side-match-cards.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CODE = F.CODE;
const BARE = `?game=${CODE}`;
// The globals a page gives bet-strip.js, in the order a page gives them.
// side-match-lines.js is in the list because index.html, skins.html and
// sidematches.html all load it beside bet-strip.js - leaving it out here would
// test a bundle that does not ship.
const ENG = ['handicap.js', 'match-engine.js', 'action-model.js', 'money-engine.js',
    'settlement-engine.js', 'side-match-lines.js'];

// The builder may not exist yet; each test that needs it says so on its own
// rather than taking the whole file down with a load error.
let B = null;
try { B = loadJsFile('side-match-lines.js', ['handicap.js', 'match-engine.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js']); }
catch (e) { B = null; }
const needBuilder = () => {
    assert.ok(B, 'side-match-lines.js must exist and load as a plain global');
    return B;
};

const engine = loadJsFile('settlement-engine.js', ['money-engine.js']);
const receiptsOf = data => engine.buildSideMatchReceipts(data, data.courseData, data.scores);
const receiptFor = (data, id) => receiptsOf(data).find(r => r.matchId === id);

// Load the page with the link's own query string and let the round ARRIVE
// through the listener the page registered - never by calling a renderer.
function arrive(page, data, search) {
    const sb = loadHtmlInlineScript(page, [], { search: search || BARE, only: false });
    const handler = (sb.__dbHandlers || []).find(h => h.event === 'value' && h.path === 'events/' + CODE);
    assert.ok(handler, page + ' must register its round listener at events/' + CODE);
    handler.cb({ val: () => data, exists: () => true });
    return sb;
}
const mount = (sb, id) => {
    const el = sb.document.getElementById(id);
    assert.ok(el, 'the page must have #' + id);
    return String(el.innerHTML || '');
};
// Dollars, in the order they appear, so a card can be read like a card.
const dollars = s => (String(s).match(/\$\d[\d,]*/g) || []);
// The engines run in a vm context, so an array they return has a DIFFERENT Array
// prototype and deepStrictEqual refuses it as "same structure, not reference-equal".
// Copied into this realm before any structural comparison.
const here = a => Array.from(a);

describe('side match money per bet', () => {

    // ---- A. THE FIXTURES ARE WHAT MANNY SAW -------------------------------
    // The engine already holds every figure this wave prints. These four are
    // the precondition for the rest; they pass before the wave and after it.

    test('the Match Play card is two bets each and a genuine push', () => {
        const r = receiptFor(F.matchRound(), 'mm');
        assert.deepEqual(here(r.segments).map(s => s.label),
            ['Overall Match', 'Press 1', 'Press 2', 'Press 3']);
        // Wave 30: a bet that goes the distance is "1 up", not "1&0" - hLeft is 0 and
        // the & form means "with N to play".
        assert.deepEqual(here(r.segments).map(s => s.result),
            ['Manny 3&2', 'Marty 1 up', 'Manny 3&2', 'Marty 1 up']);
        assert.deepEqual(here(r.segments).map(s => s.money), [20, 20, 20, 20]);
        assert.deepEqual(here(r.segments).map(s => s.toSideA), [true, false, true, false]);
        assert.equal(r.net, 0);
        assert.equal(r.netTo, null, 'a push names nobody');
    });

    test('the Nassau is REESE +$100, and two of its bets are both called "Press 1"', () => {
        const r = receiptFor(F.nassauRound(), 'mr');
        assert.equal(r.net, -100, 'side A is Manny: he is down a hundred');
        assert.equal(r.netTo, 'Reese');
        assert.equal(r.netAmount, 100);
        assert.ok(r.segments.every(s => s.winner === 'Reese'), 'Reese took every bet');
        // The engine still numbers presses per base - both are "Press 1" - and Wave 30
        // is what makes them tellable apart: the receipt now carries baseId.
        const pressLabels = r.segments.filter(s => /press/i.test(s.label)).map(s => s.label);
        assert.deepEqual(here(pressLabels), ['Press 1', 'Press 1']);
        assert.deepEqual(here(r.segments).filter(s => s.pressNum > 0).map(s => s.baseId), ['18', 'B9'],
            'the H11 press is the TOTAL bet, the H18 press is the BACK 9 - display only');
        assert.deepEqual(here(r.segments).filter(s => /press/i.test(s.label)).map(s => s.startHole), [11, 18]);
    });

    test('NET and GROSS disagree over identical scores, so the allowance is exercised', () => {
        const data = F.netRound();
        const net = receiptFor(data, 'netm'), gross = receiptFor(data, 'grossm');
        assert.equal(net.segments[0].result, 'All square');
        assert.equal(net.segments[0].money, 0);
        assert.equal(net.net, 0);
        assert.equal(gross.segments[0].result, 'Manny 10&8');
        assert.equal(gross.net, 20);
    });

    test('the card round carries a finished push, an undecided bet and a finished all-square', () => {
        const data = F.mixedCardsRound();
        const push = receiptFor(data, 'mm'), open = receiptFor(data, 'rd'), sq = receiptFor(data, 'ef');
        assert.equal(push.net, 0);
        // THE TRAP: money without a winner. Undecided, and worth $30 if it ended now.
        assert.equal(open.segments[0].winner, null);
        assert.equal(open.segments[0].money, 30);
        assert.equal(open.segments[0].result, 'Reese 1 up');
        // Finished and level - and NOT closed, which is why `closed` cannot mean final.
        assert.equal(sq.segments[0].result, 'All square');
        assert.equal(sq.segments[0].money, 0);
        assert.equal(sq.net, 0);
    });

    // ---- B. THE ONE BUILDER -----------------------------------------------

    test('side-match-lines.js exists and exposes the builder as a plain global', () => {
        const b = needBuilder();
        ['sideMatchBetLines', 'sideMatchNetLine', 'sideMatchDecidedNet', 'sideMatchRangeComplete']
            .forEach(fn => assert.equal(typeof b[fn], 'function', fn + ' must be a plain global'));
    });

    test('one line per bet, in the receipt order, with the dollars on the winner side', () => {
        const b = needBuilder();
        const lines = b.sideMatchBetLines(receiptFor(F.matchRound(), 'mm'), { complete: true });
        assert.equal(lines.length, 4, 'four bets, four lines');
        // Wave 30: a one-bet match keeps its press NUMBERS, because they chain - the
        // base pressed at H5, that press at H11, that one at H15 - and gains the hole.
        assert.deepEqual(here(lines).map(l => l.label),
            ['Overall Match', 'Press 1 (H5)', 'Press 2 (H11)', 'Press 3 (H15)']);
        assert.deepEqual(here(lines).map(l => l.moneyText),
            ['Manny +$20', 'Marty +$20', 'Manny +$20', 'Marty +$20']);
        assert.ok(lines.every(l => l.decided === true));
        assert.equal(lines[1].result, 'Marty 1 up', 'the engine result rides along untouched');
    });

    test('an all-square finished bet says halved, and $0', () => {
        const b = needBuilder();
        const [line] = b.sideMatchBetLines(receiptFor(F.mixedCardsRound(), 'ef'), { complete: true });
        assert.match(line.moneyText, /halved/i);
        assert.match(line.moneyText, /\$0/);
        assert.equal(line.decided, true, 'halved IS decided - it decided that nobody pays');
    });

    test('an UNDECIDED bet gets no money at all - the open-segment trap', () => {
        const b = needBuilder();
        const [line] = b.sideMatchBetLines(receiptFor(F.mixedCardsRound(), 'rd'), { complete: false });
        assert.equal(line.decided, false);
        assert.equal(line.moneyText, '', 'the engine offers $30 here; a card must not print it');
        assert.equal(dollars(line.moneyText).length, 0);
    });

    test('a LEVEL bet that is still being played is not called halved', () => {
        // The receipt says "All square" whether the round is over or not, so the
        // difference between halved and undecided cannot come from the segment. It
        // is passed in. Same receipt, both answers - which is the control for the
        // rule as well as the rule.
        const b = needBuilder();
        const r = receiptFor(F.mixedCardsRound(), 'ef');
        assert.match(b.sideMatchBetLines(r, { complete: true })[0].moneyText, /halved/i);
        assert.equal(b.sideMatchBetLines(r, { complete: false })[0].moneyText, '',
            'a level match mid-round has decided nothing, and must not claim to');
    });

    test('the push summary counts the bets each side won and what they were worth', () => {
        const b = needBuilder();
        const data = F.mixedCardsRound();
        const line = b.sideMatchNetLine(receiptFor(data, 'mm'), { complete: true });
        assert.match(line, /all square/i, 'a bare $0 is what made the card read as broken');
        assert.match(line, /2 bets/, 'each side won two');
        assert.match(line, /\$40/, 'and they were worth forty each');
    });

    test('a decided match names the winner and the amount, and an unfinished one does not', () => {
        const b = needBuilder();
        const data = F.mixedCardsRound();
        assert.match(b.sideMatchNetLine(receiptFor(F.nassauRound(), 'mr'), { complete: true }),
            /Reese \+\$100/);
        const openLine = b.sideMatchNetLine(receiptFor(data, 'rd'), { complete: false });
        assert.equal(dollars(openLine).length, 0, 'nothing decided, no dollars');
    });

    test('finishedness is every hole in range posted, NOT the engine closed flag', () => {
        const b = needBuilder();
        const data = F.mixedCardsRound();
        const sq = data.sideMatches.ef, open = data.sideMatches.rd, push = data.sideMatches.mm;
        const complete = sm => b.sideMatchRangeComplete(sm, data.players, data.courseData, data.scores);
        assert.equal(complete(sq), true, 'a finished all-square match is FINISHED');
        assert.equal(complete(push), true);
        assert.equal(complete(open), false, 'thru 6 of 18 is not');
        // The control for the rule itself: the engine never marks the all-square
        // segment closed, so anything keyed on `closed` gets this one wrong.
        const r = receiptFor(data, 'ef');
        assert.equal(r.segments[0].winner, null, 'no winner, and no close either');
    });

    test('a round the organizer FINISHED is over for the bet too, blank holes and all', () => {
        // "Every hole posted" is right for a live card and wrong for a settled round.
        // computeRoundFinish has said since v148 that a VERIFIED round is finished -
        // a picked-up ball, a golfer who left after nine - and the Receipt exists only
        // for those. Without this the Receipt printed "MATCH NET - Still playing"
        // under a heading that said FINAL.
        const b = needBuilder();
        const data = F.mixedCardsRound();
        const sm = data.sideMatches.rd;                  // Reese v Dale, thru 6 of 18
        assert.equal(b.sideMatchRangeComplete(sm, data.players, data.courseData, data.scores),
            false, 'on its own, six holes of eighteen is not finished');
        assert.equal(b.sideMatchRangeComplete(sm, data.players, data.courseData, data.scores,
            { roundFinished: true }), true, 'but the organizer finishing the round is');
        // And it costs nothing in accuracy: the engine only ever scored the holes both
        // sides posted, so the money is the same either way.
        const r = receiptFor(data, 'rd');
        assert.equal(r.segments[0].result, 'Reese 1 up');
        assert.equal(b.sideMatchDecidedNet(r), 0, 'an open segment still pays nobody');
    });

    test('RECEIPT: a verified round with a golfer through nine still explains its money', () => {
        const data = Object.assign({}, F.mixedCardsRound(),
            { scoresVerified: { verified: true, verifiedAt: 1, verifiedBy: 'organizer' } });
        const c = mount(arrive('settlement.html', data), 'settle-content');
        // THE NET LINE SPECIFICALLY. A first draft matched /all square/i anywhere in the
        // mount and passed at the baseline, because a halved SEGMENT already printed
        // "All square" - the assertion was reading a different line from the one it was
        // about. Measured, caught, tightened.
        assert.match(c, /MATCH NET · All square — each won 2 bets/,
            'the push must be explained on the net line of a finished receipt');
        assert.doesNotMatch(c, /Still playing/,
            'a receipt headed FINAL may not tell a group their bet is still going');
    });

    test('the builder recomputes nothing: no engine call in the file', () => {
        needBuilder();
        const src = read('side-match-lines.js');
        ['calculateMatchEngine', 'calculateOverallBetEngine', 'calculateHoleBetEngine',
            'buildBetStrip', 'computeCombinedNetTotals'].forEach(fn =>
                assert.ok(!new RegExp(fn + '\\s*\\(').test(src), src && fn + ' must not be called here'));
        assert.match(src, /receipt/i, 'it is a presenter over a receipt');
    });

    // ---- C. THE BETS TAB (skins.html) - arrive like a golfer ---------------

    test('BETS TAB: every bet line carries its dollar result', () => {
        const m = mount(arrive('skins.html', F.matchRound()), 'bets-matches');
        assert.match(m, /Manny \+\$20/, 'the base bet says who won it and for how much');
        assert.match(m, /Marty \+\$20/, 'and so does the press Marty took');
        assert.equal((m.match(/\+\$20/g) || []).length, 4, 'four bets, four dollar results');
    });

    test('BETS TAB: the Ledger row stays - the v135 split is not being reopened', () => {
        const m = mount(arrive('skins.html', F.nassauRound()), 'bets-matches');
        assert.match(m, /Ledger:/, 'bets_matches_split_test.js pins this row on Bets');
        assert.match(m, /Reese \+\$100|Reese: \+\$100/, 'and the ledger still names the side total');
        assert.equal((m.match(/Reese \+\$20/g) || []).length, 5, 'five bets, every one of them Reese');
    });

    test('BETS TAB: a finished all-square match reads FINAL, not LIVE', () => {
        const sb = arrive('skins.html', F.mixedCardsRound());
        const card = mount(sb, 'bets-matches');
        const ef = card.slice(card.indexOf('bets-match-ef'));
        assert.ok(ef.length > 40, 'the all-square card must render at all');
        assert.match(ef, /FINAL/, 'every hole is posted: the bet is over');
        assert.doesNotMatch(ef.slice(0, ef.indexOf('</div>') + 200), /LIVE/,
            'and `closed` is false on a halved segment, which is why this was wrong');
    });

    test('BETS TAB: an undecided bet shows no dollar result', () => {
        const card = mount(arrive('skins.html', F.mixedCardsRound()), 'bets-matches');
        const rd = card.slice(card.indexOf('bets-match-rd'), card.indexOf('bets-match-ef'));
        assert.ok(rd.length > 40, 'the undecided card must render');
        assert.doesNotMatch(rd, /\+\$30/, 'the engine offers $30; an unfinished bet has won nothing');
        assert.match(rd, /LIVE/);
    });

    // ---- D. FINAL RESULTS (stats.html) ------------------------------------

    test('FINAL RESULTS: the per-bet lines sit above the side totals', () => {
        const c = mount(arrive('stats.html', F.nassauRound()), 'stats-content');
        assert.match(c, /Reese \+\$20/, 'each bet, with its own money');
        assert.equal((c.match(/Reese \+\$20/g) || []).length, 5);
        assert.match(c, /\$100\.00|\+\$100/, 'and the side total it already printed');
    });

    test('FINAL RESULTS: the push summary replaces a bare $0.00 pair', () => {
        const c = mount(arrive('stats.html', F.matchRound()), 'stats-content');
        assert.match(c, /all square/i);
        assert.match(c, /2 bets/);
    });

    // ---- E. THE RECEIPT (settlement.html) ---------------------------------

    test('RECEIPT: the push summary, beside per-bet money it already printed', () => {
        const c = mount(arrive('settlement.html', F.matchRound()), 'settle-content');
        assert.match(c, /Manny \+\$20/, 'v141 already printed this');
        assert.match(c, /all square/i, 'what it never explained was the $0');
        assert.match(c, /2 bets/);
    });

    test('RECEIPT: still no dollars on an undecided bet', () => {
        const c = mount(arrive('settlement.html', F.mixedCardsRound()), 'settle-content');
        const rd = c.slice(c.indexOf('Reese'), c.indexOf('Reese') + 900);
        assert.doesNotMatch(rd, /Reese \+\$30/, 'the gate at settlement.html:1023 must stay');
    });

    // ---- F. THE SCORECARD, and bet-strip.js:819 ---------------------------

    test('SCORECARD ROW: a finished match side bet is worth its real decided money', () => {
        const bs = loadJsFile('bet-strip.js', ENG);
        const data = F.nassauRound();
        const me = String(data.players[0].id);           // Manny
        const [row] = bs.buildSideActionRows(data, data.courseData, data.scores, data.players, me);
        assert.equal(row.netMoney, -100, 'Manny is down a hundred and the row must say so');
        assert.match(row.netText, /\$100/);
    });

    test('SCORECARD ROW: the figure EQUALS buildSideMatchReceipts, for every fixture', () => {
        const bs = loadJsFile('bet-strip.js', ENG);
        const cases = [[F.matchRound(), 'mm'], [F.nassauRound(), 'mr'],
            [F.mixedCardsRound(), 'mm'], [F.mixedCardsRound(), 'ef'], [F.netRound(), 'netm']];
        cases.forEach(([data, id]) => {
            const r = receiptFor(data, id);
            const decided = r.segments.reduce((n, s) => n + (s.winner ? (s.toSideA ? s.money : -s.money) : 0), 0);
            const rows = bs.buildSideActionRows(data, data.courseData, data.scores, data.players,
                String(data.players[0].id));
            const row = rows.find(x => x.key === id);
            assert.ok(row, id + ' must produce a row');
            const mine = (r.teamA || []).some(n => n === data.players[0].name) ? decided : -decided;
            // `|| 0` normalises NEGATIVE ZERO: negating a $0 push gives -0, and
            // deepStrictEqual/equal distinguish it from 0. The money is identical.
            assert.equal(row.netMoney || 0, mine || 0, id + ': the row and the receipt must agree');
        });
    });

    test('SCORECARD ROW: an undecided bet still reads AT STAKE, not decided money', () => {
        const bs = loadJsFile('bet-strip.js', ENG);
        const data = F.mixedCardsRound();
        const rows = bs.buildSideActionRows(data, data.courseData, data.scores, data.players,
            String(data.players[2].id));                  // Reese, thru 6
        const row = rows.find(x => x.key === 'rd');
        assert.equal(row.netMoney, 0, 'nothing is decided yet');
        assert.ok(row.atStake > 0, 'but there is money riding');
        assert.match(row.netText, /at stake/i);
    });

    test('SCORECARD CARD: the money reaches the My Round card on a finished bet', () => {
        // NOT a pure arrival: opening the Action Center is a tap, so this test sets
        // the flag the tap sets and calls the page's own renderer. Everything else
        // about the round arrives as data. Said plainly per CLAUDE.md.
        const sb = loadHtmlInlineScript('index.html',
            ['action-model.js', 'match-engine.js', 'money-engine.js', 'settlement-engine.js',
                'bet-strip.js', 'hole-events.js', 'side-match-lines.js'], { search: BARE, only: false });
        const data = F.nassauRound();
        vm.runInContext(`currentData = ${JSON.stringify(data)};`
            + `window.__scFilteredPlayers = currentData.players; currentViewedHole = 18;`
            + `meId = '${data.players[0].id}'; actionCenterOpen = true; renderActionCenter();`, sb);
        const out = String(sb.document.getElementById('action-center-mount').innerHTML || '');
        assert.match(out, /\$100/, 'a Nassau Manny lost by a hundred must say so on his scorecard');
        assert.match(out, /mc-money/, 'through the card money slot, not some new one');
    });

    // ---- G. THE MATCHES TAB IS UNCHANGED (v135) ---------------------------

    test('MATCHES TAB: one result line, no ledger, no per-bet dollars', () => {
        const list = mount(arrive('sidematches.html', F.matchRound()), 'sidematches-list');
        assert.match(list, /FINAL/, 'the one line it has always had');
        assert.doesNotMatch(list, /Ledger:/, 'bets_matches_split_test.js:200 pins this');
        assert.doesNotMatch(list, /Manny \+\$20|Marty \+\$20/,
            'the money display lives on Bets, and this wave does not reopen that');
    });

    test('THE ONE BUILDER, not five: no page writes its own money line', () => {
        const pages = ['skins.html', 'stats.html', 'settlement.html'];
        pages.forEach(p => {
            const src = read(p);
            assert.match(src, /sideMatchBetLines|sideMatchNetLine/, p + ' must consult the builder');
            assert.ok(!/function sideMatchBetLines\s*\(/.test(src),
                p + ' must not shadow the builder');
        });
        assert.match(read('sw.js'), /side-match-lines\.js/, 'and the shell must cache it');
    });
});
