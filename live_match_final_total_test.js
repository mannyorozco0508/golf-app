// ============================================================================
// WHO WON WHAT, ON THE CARD THAT SHOWS THE PRESSES (Job 2, 2026-10-03)
//
// Manny, iPhone, GFLBAM group 3: a match with presses, every bet decided, and
// LIVE MATCHES & PRESSES told him who was up in each segment and the stake
// beside it - and never who had won what overall. Four closed rows, no answer.
//
// WHY IT READ THAT WAY. The card reads buildLiveMatchState() in money-engine.js,
// which is a presenter of the MATCH ENGINE: holes won, who is up, which presses
// are running. It knows nothing about money, deliberately - the comment above it
// says "NO SETTLEMENT ARITHMETIC HERE" and that is right. Settlement does know,
// and it is a tab away.
//
// TWO THINGS LAND HERE, and both consume what is already priced.
//
//   1. ONE BOLD LINE AT THE BOTTOM OF EACH MATCH, once that match is over:
//      "Reese +$100 (won 5 of 5 bets)", or "Reese +$40 · Manny +$40 — All
//      square". Every figure comes from sideMatchDecidedNet() and
//      sideMatchDecidedTally() over the receipt settlement-engine.js already
//      built. NOTHING in this wave computes money.
//
//   2. THE FINAL WORDING MATCHES THE RECEIPT. money-engine's statusText is a
//      scoreboard reading - "Reese 3 UP" - correct while a match runs and FALSE
//      once it is over: a bet that ended on the 16th is 3&2, and "N up" is how
//      golfers describe a match that went all the way to the 18th. So the same
//      bet read "3 UP" on the scorecard and "3&2" on the Receipt. match-engine
//      has set finalResult since it was written and the receipt already carried
//      it; the live card simply was not reading it.
//
// MID-ROUND THERE IS NO TOTAL, and that is a requirement rather than an
// omission. A running total on an unfinished match is the exact defect the
// Receipt itself once had, printing "MATCH NET · Reese +$30" with twelve holes
// unplayed. `complete` comes from sideMatchRangeComplete(), NOT from seg.closed:
// a segment closes when the lead exceeds the holes left, so at the 18th |0| > 0
// is false and an all-square match that went the distance is never "closed".
//
// EVERY FIGURE IN THIS FILE IS MEASURED, not chosen. The fixtures are driven
// through the real engines and the expectations are what came back.
//
// BASELINE, measured against pre-build main (d147a8a) in a clean worktree, over
// the FINISHED file, all 16 tests: 5 PASS / 11 FAIL.
//
//   THE FIVE THAT PASS, and three of them are passing FOR THE WRONG REASON,
//   which is worth saying plainly:
//     - "thru 6: no total line anywhere", "a match over on 9 of 18 posted holes
//       has no total" and "mid-round neither surface shows a total" are all true
//       on main because MAIN SHOWS NO TOTAL EVER. They are inert as detectors
//       today and they are in the file anyway, because "no total mid-round" is
//       the requirement most easily broken by the thing being added.
//     - "the card still renders, with the segment and its stake" and "the same
//       match reads identically on both surfaces" are live carried invariants:
//       the first is the positive half that stops the absence assertions being
//       satisfied by a card that never drew, and the second genuinely fails if
//       only one of the two pages is wired.
//
//   The eleven reds are the total line in all four of its forms, the 3&2 wording
//   on the base, on each press and across a Nassau's three segments, the FINAL
//   mark on an all-square segment, the leaderboard's half, and the two source
//   scans - the no-engine rule and the typeof guard - which fail on main because
//   the functions they are about do not exist there.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
             'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
             'side-match-lines.js'];
const LB = ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
            'side-match-lines.js'];
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// ---------------------------------------------------------------------------
// ONE FIXTURE BUILDER. Two golfers off scratch on a par-4 18, so a won hole is
// a birdie and nothing depends on a handicap allocation. winsA / winsB are the
// holes each side takes; everything else is halved.
function round(winsA, winsB, thru, wager) {
    const ps = [{ id: 101, name: 'Reese', hcp: '0' }, { id: 102, name: 'Manny', hcp: '0' }];
    const sc = {};
    ps.forEach((p) => cd18.forEach((h) => { if (h.hole <= thru) sc['p' + p.id + '_h' + h.hole] = 4; }));
    winsA.forEach((h) => { if (h <= thru) sc['p101_h' + h] = 3; });
    winsB.forEach((h) => { if (h <= thru) sc['p102_h' + h] = 3; });
    return {
        players: ps, courseData: cd18, scores: sc, gameFormat: 'stroke',
        sideMatches: { w1: Object.assign({
            format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'],
            startHole: 1, stake: 20, pressRule: 'none'
        }, wager || {}) }
    };
}

// THE SCORECARD, RENDERED THE WAY THE PAGE RENDERS IT. renderLiveTicker() is the
// page's own render for this mount - the same call its data handler makes - and
// the assertions read the mount, never a builder's return value.
function scorecard(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`
        window.location.pathname='/index.html'; window.location.origin='https://x.dev';
        currentMode='GFLBAM';
        currentData=${JSON.stringify(d)};
        renderLiveTicker();
    `, sb);
    return sb.document.getElementById('live-ticker-mount').innerHTML;
}
function leaderboard(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`
        window.location.pathname='/leaderboard.html'; window.location.origin='https://x.dev';
        window.location.search='?game=GFLBAM'; currentMode='GFLBAM';
        currentBoardData=${JSON.stringify(d)}; activeView='individual';
        groupViewMode='flat'; activeScoring='net'; renderBoard();
    `, sb);
    return sb.document.getElementById('live-matches-mount').innerHTML;
}
// The total line's own text, scoped to the element whose content is the claim -
// never the whole card, and never textContent of a page whose scripts are in it.
const totals = (html) => [...String(html).matchAll(/<div class="lm-final-total">([^<]*)<\/div>/g)]
    .map((m) => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim());
// The status text ALONE, with the " · FINAL" mark stripped - that mark has its
// own test. Decoded, because "3&2" reaches the markup as "3&amp;2" and a regex
// written with the literal character would never match it.
const statuses = (html) => [...String(html).matchAll(/class="lm-(?:seg|press)-status[^"]*">([^<]*)</g)]
    .map((m) => m[1].replace(/&amp;/g, '&').replace(/\s*\u00B7\s*FINAL\s*$/, '').trim());

// ===========================================================================
describe('1. A FINISHED MATCH SAYS WHO WON WHAT - THE THING THE CARD OWED MANNY', () => {

    test('one bet, won: "Reese +$20 (won 1 of 1 bet)"', () => {
        // Reese takes 1, 2 and 3 and halves the rest: three up with two to play
        // at the 16th, so the bet closes there. All 18 are posted, because the
        // group plays them out.
        const t = totals(scorecard(round([1, 2, 3], [], 18)));
        assert.deepEqual(t, ['Reese +$20 (won 1 of 1 bet)']);
    });

    test('A MATCH WITH PRESSES NAMES THE WHOLE HAUL: "Reese +$80 (won 4 of 4 bets)"', () => {
        // The reported case: a base plus three automatic presses, every one of
        // them to the same golfer. $20 four times.
        const t = totals(scorecard(round([1, 2, 3, 4, 5, 6, 7], [], 18, { pressRule: '2down' })));
        assert.deepEqual(t, ['Reese +$80 (won 4 of 4 bets)']);
    });

    test('LEVEL BY MONEY IS NOT LEVEL BY NOTHING: "Reese +$40 · Manny +$40 — All square"', () => {
        // A Nassau, front to Reese and back to Manny at $40 a side, the overall
        // halved. Net zero - and "$0" with no explanation is exactly what sent
        // Manny looking for a bug in the first place.
        const t = totals(scorecard(round([1, 2, 3], [10, 11, 12], 18,
            { format: 'nassau', frontStake: 40, backStake: 40, overallStake: 0 })));
        assert.deepEqual(t, ['Reese +$40 · Manny +$40 — All square']);
    });

    test('every bet halved says nobody pays, which is different news again', () => {
        const t = totals(scorecard(round([1], [2], 18)));
        assert.deepEqual(t, ['All square — nobody pays']);
    });
});

// ===========================================================================
describe('2. MID-ROUND THERE IS NO TOTAL', () => {

    test('thru 6 with one side 2 up: no total line anywhere on the card', () => {
        const html = scorecard(round([1, 2], [], 6));
        assert.deepEqual(totals(html), [],
            'a running total on an unfinished match is the defect the Receipt itself had - '
            + 'it printed "+$30" with twelve holes unplayed');
    });

    test('and the card still renders, with the segment and its stake', () => {
        // THE POSITIVE HALF. "No total" is trivially true of a card that did not
        // render, so the absence above means nothing without this.
        const html = scorecard(round([1, 2], [], 6));
        assert.match(html, /LIVE MATCHES/);
        assert.match(html, /lm-stake/);
        assert.deepEqual(statuses(html), ['Reese 2 UP'],
            'mid-round the scoreboard reading is the RIGHT one - the bet is not over');
    });

    test('a match that is over but on only 9 of 18 posted holes has no total either', () => {
        // sideMatchRangeComplete is EVERY hole in the bet's range posted by every
        // participant. Nine holes in is not a finished 18-hole bet, however
        // closed the segment is.
        const html = scorecard(round([1, 2, 3, 4, 5], [], 9));
        assert.deepEqual(totals(html), []);
    });
});

// ===========================================================================
describe('3. THE FINAL WORDING IS THE RECEIPT\'S: 3&2, NOT 3 UP', () => {

    test('a bet that closed on the 16th reads 3&2 on the live card', () => {
        const html = scorecard(round([1, 2, 3], [], 18));
        assert.deepEqual(statuses(html), ['Reese 3&2']);
        assert.ok(!/3 UP/.test(html),
            'the card still says "3 UP" about a bet that ended two holes early. That is how a '
            + 'match taken to the 18th is described, and the Receipt one tab away says 3&2 '
            + 'about the same bet.');
    });

    test('"N up" SURVIVES when the match really did go to the 18th', () => {
        // The control on the rule above. If the fix were "never say up", this is
        // the test that fails - and it would be wrong, because a match won on
        // the final hole is one up and nothing else.
        const html = scorecard(round([1], [], 18));
        assert.deepEqual(statuses(html), ['Reese 1 up']);
    });

    test('each press carries ITS OWN closing margin, not the base match\'s', () => {
        const html = scorecard(round([1, 2, 3, 4, 5, 6, 7], [], 18, { pressRule: '2down' }));
        assert.deepEqual(statuses(html), ['Reese 7&6', 'Reese 5&4', 'Reese 3&2', 'Reese 1 up']);
    });

    test('a Nassau names all three segments the Receipt\'s way', () => {
        const html = scorecard(round([1, 2, 3], [10, 11, 12], 18,
            { format: 'nassau', frontStake: 40, backStake: 40, overallStake: 0 }));
        assert.deepEqual(statuses(html), ['Reese 3&2', 'Manny 3&2', 'All square']);
    });

    test('FINAL is on every row of a finished match, including the all-square one', () => {
        // seg.closed is false for a level match at the 18th - the lead does not
        // exceed the holes left - so a card keyed on `closed` left the Total of
        // that Nassau with no FINAL mark while the two sides it halved were
        // marked. Completeness is what decides it now.
        const html = scorecard(round([1, 2, 3], [10, 11, 12], 18,
            { format: 'nassau', frontStake: 40, backStake: 40, overallStake: 0 }));
        assert.equal((html.match(/FINAL/g) || []).length, 3, 'three segments, three FINAL marks');
    });
});

// ===========================================================================
describe('4. THE LEADERBOARD SHOWS THE SAME CARD, SO IT SHOWS THE SAME TOTAL', () => {

    test('the same finished match reads identically on both surfaces', () => {
        const d = round([1, 2, 3, 4, 5, 6, 7], [], 18, { pressRule: '2down' });
        assert.deepEqual(totals(leaderboard(d)), totals(scorecard(d)));
        assert.deepEqual(statuses(leaderboard(d)), statuses(scorecard(d)));
    });

    test('and mid-round neither shows a total', () => {
        const d = round([1, 2], [], 6);
        assert.deepEqual(totals(leaderboard(d)), []);
        assert.match(leaderboard(d), /LIVE MATCHES/, 'the leaderboard card still renders');
    });
});

// ===========================================================================
describe('5. NOTHING HERE COMPUTES MONEY', () => {

    test('the new builders call NO engine - every figure comes off the receipt', () => {
        const src = read('side-match-lines.js');
        const fn = src.slice(src.indexOf('function sideMatchFinalTotal('),
                             src.indexOf('function sideMatchLiveFinals('));
        assert.match(fn, /sideMatchDecidedTally\(/, 'the tally is where the counts come from');
        assert.match(fn, /sideMatchDecidedNet\(/, 'and the net is where the money comes from');
        ['calculateMatchEngine', 'computeCombinedNetTotals', 'computeMoneyPool', 'getStrokes']
            .forEach((bad) => assert.ok(!fn.includes(bad),
                'sideMatchFinalTotal calls ' + bad + '. The one rule of this file is that it '
                + 'assembles strings over a priced receipt - a second arithmetic is a second '
                + 'answer, and this app has paid for one of those.'));
    });

    test('the pages reach it through a typeof guard, so a cached shell without it still draws', () => {
        ['index.html', 'leaderboard.html'].forEach((f) => {
            const src = read(f);
            assert.match(src, /typeof sideMatchLiveFinals === 'function'/,
                f + ' calls sideMatchLiveFinals unguarded - a shell cached before side-match-lines.js '
                + 'shipped to this page would throw inside the renderer and lose the whole card');
        });
        assert.match(read('leaderboard.html'), /<script src="side-match-lines\.js"><\/script>/,
            'leaderboard.html must actually load the file it now reads');
    });
});
