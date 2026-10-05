// ============================================================================
// THE COMPACT LIVE PANEL, AND THE SPACE IT FILLS (2026-10-05)
//
// Manny, on the decluttered scorecard: "too simple now". Measured, he was right
// about the shape of it: a four-golfer card ended at y=471 on an 844px screen,
// so there were 373 pixels of nothing between Prev/Next and the sheet handle,
// and 58px of nothing above "Hole N".
//
// THREE CHANGES, and the constraint on all of them is that the card still has to
// fit ONE SCREEN - the landing rule from the last fix depends on it, and a card
// that stops fitting starts scrolling the banner under the status bar again.
//
//   1. The gap above the hole: 58px -> 36px, measured. #save-state stays (a
//      golfer typing a score wants to see it land); it stops costing 16px of
//      margin for 18px of text.
//   2. The "Dots:" selector moves into the Status sheet with everything else
//      that is not the hole.
//   3. A compact live panel under Prev/Next: the top five, this golfer's
//      matches one line each, and - only when they apply - the skins riding on
//      this hole and the KP.
//
// IT COMPUTES NOTHING, WHICH IS THE WHOLE DESIGN. Every line is read from the
// builder that already owns it: liveStandings(), buildLiveMatchStates() (money-
// engine's own presenter), kpLiveLineHtml() reused whole, and buildSkinsLedgerRows
// over settlement-engine's ledger. No money is recomputed and NO MID-ROUND TOTAL
// is printed - a stake is a fact about the wager, "+$30 with twelve to play" is
// the defect the Receipt itself once had.
//
// BASELINE, measured over the FINISHED file against 63d2c74 (index.html swapped
// out and restored by sha), all 9 tests: 2 PASS / 7 FAIL. 2 + 7 = 9.
//   The two that pass describe what was already true: the arrival itself ran, and
//   the card already fitted one screen - which is in this file precisely because
//   it is the constraint the other seven must not break, and the worst-case
//   fixture below (top five, two wagers, a skins carry and a KP on one hole) DID
//   break it at 863px before the panel was tightened to fit.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Hole 6 is the par 3 the round lands on: five holes played, every one of them
// tied, so a skins carry lands exactly there - and a par 3 with dots on is a KP
// hole. One fixture, both conditional lines.
const CD = makeCourseData(18).map(h => (h.hole === 6 ? Object.assign({}, h, { par: 3 }) : h));
const NAMES = ['Marty Marshall', 'Manny Orozco', 'Reese Richards', 'Vic Vance'];
const P = makePlayers(NAMES, [2, 9, 15, 4], 101);
const scores = {};
P.forEach(p => { for (let h = 1; h <= 5; h++) scores['p' + p.id + '_h' + h] = 4; });   // every hole tied

const ROUND = {
    eventName: 'Live panel', courseName: 'Dobson Ranch', players: P, courseData: CD, scores,
    gameFormat: 'stroke', settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 },
    // A skins game that CARRIES, so five tied holes ride onto the 6th.
    skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: true,
    // Dots on as a game, not just a stake: activeDotsGame() reads getRoundGames,
    // so a round-level dotPointVal alone leaves kpLiveLineHtml with nothing to say.
    additionalGames: {
        skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross',
                 skinsScoring: 'gross', skinsCarryOver: true, startHole: 1 },
        dots: { enabled: true, dotPointVal: 5, startHole: 1 }
    },
    dotPointVal: 5, greenieCarryover: false,
    // Two wagers the match presenter can express: a straight match and a Nassau.
    sideMatches: {
        sm1: { teamAIds: ['101'], teamBIds: ['102'], format: 'match', scoring: 'gross',
               stake: 20, pressRule: 'none', startHole: 1, createdAt: 1 },
        sm2: { teamAIds: ['101'], teamBIds: ['103'], format: 'nassau', scoring: 'gross',
               stake: 10, frontStake: 10, backStake: 10, overallStake: 20,
               pressRule: 'none', startHole: 1, createdAt: 2 }
    },
    ownerUid: 'anon-cold'
};

const LOOK = `(function () {
  var card = document.getElementById('hole-view-card');
  var hdr = card ? card.querySelector('.hole-view-header') : null;
  var nav = card ? card.querySelector('.hole-view-nav-row') : null;
  var live = document.getElementById('hole-live-mount');
  var sheet = document.getElementById('round-sheet-body');
  var dots = document.getElementById('dot-context-row');
  return JSON.stringify({
    hole: (document.querySelector('.hv-hole-num') || {}).innerText,
    headingTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
    navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
    cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : null,
    scrollY: Math.round(window.pageYOffset || 0),
    docH: document.documentElement.scrollHeight,
    // innerText, so a panel that is in the DOM and not painted does not count.
    liveText: live ? (live.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    liveH: live ? Math.round(live.getBoundingClientRect().height) : null,
    boardChips: live ? live.querySelectorAll('.hl-chip').length : -1,
    matchLines: live ? live.querySelectorAll('.hl-match').length : -1,
    fullBoard: live ? !!live.querySelector('.hl-more') : null,
    // The Dots selector must be in the sheet, not on the card.
    dotsInSheet: !!(dots && sheet && sheet.contains(dots)),
    dotsInCard: !!(dots && card && card.contains(dots))
  });
})()`;

const S = {};
before(async () => {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=LIVEP'),
        db: { events: { LIVEP: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [{ expression: LOOK },
                { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 600 }, { expression: LOOK }] });
    S.ok = r.ok; S.reason = r.reason;
    if (r.ok) { S.arrive = JSON.parse(r.value[0]); S.next = JSON.parse(r.value[r.value.length - 1]); }
});

describe('1. THE PANEL IS THERE, AND IT IS THE THREE THINGS', () => {
    test('ran', () => assert.ok(S.ok, S.reason));

    test('the top five, with thru, and a way to the full board', () => {
        const v = S.arrive;
        assert.equal(v.hole, 'Hole 6', 'the round did not land on the par 3: ' + v.hole);
        assert.ok(v.boardChips >= 4 && v.boardChips <= 5,
            'the board shows ' + v.boardChips + ' golfers - it is the top five, not the field');
        assert.match(v.liveText, /thru 5/, 'no "thru" on the board: ' + v.liveText);
        assert.equal(v.fullBoard, true, 'there is no way to the full board');
    });

    test("this golfer's matches, one line each, with the stake and no running total", () => {
        const v = S.arrive;
        assert.ok(v.matchLines >= 2, 'the two wagers rendered ' + v.matchLines + ' lines');
        assert.match(v.liveText, /Marty v Manny/, 'the straight match is not named: ' + v.liveText);
        assert.match(v.liveText, /Nassau/, 'the Nassau is not named');
        assert.match(v.liveText, /\$20/, 'the stake is missing');
        // NO MID-ROUND TOTAL. A stake is a fact about the wager; a net figure with
        // thirteen holes unplayed is the defect the Receipt itself once had.
        assert.ok(!/\+\$|-\$|\bup \$|owes/i.test(v.liveText),
            'a running total appeared mid-round: ' + v.liveText);
    });

    test('and this hole, only because this hole has something on it', () => {
        const v = S.arrive;
        // Five tied holes ride onto the 6th, and the 6th is a par 3 with dots on.
        assert.match(v.liveText, /6 skins on this hole/, 'the carry is not named: ' + v.liveText);
        assert.match(v.liveText, /KP/i, 'the KP line is not there on a par 3: ' + v.liveText);
    });

    test('a hole with nothing on it says nothing about it', () => {
        // Next goes to the 7th: a par 4, nothing carried onto it. The board and the
        // matches stay; the hole line goes. That is what "only when it applies" means.
        const v = S.next;
        assert.equal(v.hole, 'Hole 7');
        assert.ok(!/skins on this hole/.test(v.liveText), 'the carry followed the golfer: ' + v.liveText);
        assert.ok(v.boardChips >= 4, 'the board disappeared with it');
        assert.ok(v.matchLines >= 2, 'the matches disappeared with it');
    });
});

describe('2. THE DOTS SELECTOR IS IN THE SHEET', () => {
    test('it moved, and it is not on the card', () => {
        assert.equal(S.arrive.dotsInSheet, true, 'the Dots selector is not in the Status sheet');
        assert.equal(S.arrive.dotsInCard, false, 'the Dots selector is still on the hole card');
        assert.match(IDX, /'dot-context-row',\s+\/\/ the Dots: selector/,
            'it is not in the list the mover reads');
    });
});

describe('3. THE GAP ABOVE THE HOLE', () => {
    test('the heading is near the top of the page, not 58px down it', () => {
        // Measured before: 58. The page is at scroll 0 on a card that fits, so this
        // is the whole distance between the top of the screen and the hole.
        assert.equal(S.arrive.scrollY, 0, 'the page is scrolled, so this measures nothing');
        assert.ok(S.arrive.headingTop <= 44,
            'the heading is ' + S.arrive.headingTop + 'px down the page');
        assert.ok(S.arrive.headingTop >= 6, 'the heading is jammed against the edge');
        assert.match(IDX, /body\.has-round-sheet #save-state \{ margin-top: 2px; margin-bottom: 4px; \}/,
            'the save line is back to costing more room than it occupies');
    });
});

describe('4. IT READS, IT DOES NOT COMPUTE', () => {
    test('every line comes from the builder that owns it', () => {
        const fn = IDX.slice(IDX.indexOf('function renderHoleLive()'),
                             IDX.indexOf('function holeSkinsCarry('));
        assert.ok(fn.length > 800, 'the slice is empty - the endpoint drifted');
        ['liveStandings(', 'buildLiveMatchStates(', 'kpLiveLineHtml(', 'holeSkinsCarry('].forEach(b =>
            assert.ok(fn.indexOf(b) > -1, 'it does not consume ' + b));
        // NO ARITHMETIC ON MONEY. The only number it prints is seg.stake, which is
        // the wager's own figure off the builder.
        assert.ok(!/calculateMatchEngine|computeRoundMoney|settleRound|\* *stake|stake *\*/.test(fn),
            'money is being computed in the panel');
        assert.match(fn, /seg\.stake/, 'the stake is no longer read off the segment');
        const carry = IDX.slice(IDX.indexOf('function holeSkinsCarry('),
                                IDX.indexOf('function renderCardWidgets()'));
        assert.match(carry, /liveSkinsLedgerEntries|buildSkinsLedgerRows/,
            'the carry is counted here instead of read from the ledger');
        assert.ok(!/\$|cents|value/.test(carry), 'the carry line prints money - units only');
    });

    test('THE CARD STILL FITS ONE SCREEN, which is the constraint on all of it', () => {
        [['arrival', S.arrive], ['after Next', S.next]].forEach(([when, v]) => {
            assert.ok(v.navBottom <= 844, when + ': Prev/Next is off the bottom at ' + v.navBottom);
            assert.ok(v.cardBottom <= 844, when + ': the card ends at ' + v.cardBottom);
            assert.equal(v.scrollY, 0, when + ': the page scrolled on a card that fits');
            // AND THE PAGE IS DELIBERATELY LONGER THAN THE SCREEN (2026-10-05).
            // The reading area - the leaderboard, Today's Games, the skins card, My
            // Round - is back ON the page below the hole, because a fresh round
            // behind a handle said nothing at all about what the group was playing
            // for. What must never happen is the CARD not fitting, which is the two
            // lines above and what the landing rule tests; what is below it is
            // scrollable by design.
        });
    });
});
