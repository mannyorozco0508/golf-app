// ============================================================================
// A ROUND NOBODY HAS PLAYED YET STILL SAYS WHAT IT IS (2026-10-05)
//
// Manny, on a fresh round: "too plain - no leaderboard, no widgets". The
// declutter had put every reading card behind the Status sheet, which is right
// for a round in progress and wrong for one that has not started: four empty
// boxes and a handle, and nothing on the page about what the group had just
// agreed to play for.
//
// THE SPLIT NOW: the sheet keeps SETTINGS AND ADMIN - the theme, the code, the
// nav, the Dots selector, Save & exit, Delete - and everything a golfer READS is
// back ON THE PAGE, below Prev/Next, scrollable. The first screen is unchanged
// and the landing rule still tests that the card fits it.
//
// AND THE LEADERBOARD IS ALWAYS THERE. It used to return nothing until somebody
// posted a score. Before anyone has started, every golfer is level: E, thru 0 -
// which is the truth, and it is what tells a group the app knows who is playing.
//
// BASELINE, measured over the FINISHED file against 211b33e (index.html swapped
// out and restored by sha), all 7 tests: 2 PASS / 5 FAIL. 2 + 5 = 7.
//   The two that pass describe what was already true: the arrival ran, and a fresh
//   card already fitted one screen - which is in this file because the reading
//   area must not break it. The five reds are the board on an unstarted round,
//   Today's games, where it reads its words from, and both halves of the split.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CD = makeCourseData(18);
const NAMES = ['Marty Marshall', 'Manny Orozco', 'Reese Richards', 'Vic Vance'];
const P = makePlayers(NAMES, [2, 9, 15, 4], 101);

// NO SCORES, NO BETS, NO CHALLENGES. The state a group is in standing on the
// first tee, which is the state the complaint came from.
const FRESH = {
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: P, courseData: CD,
    scores: {}, gameFormat: 'stroke', settlementMode: 'whole-dollar',
    groupSizeOverrides: { 0: 4 },
    moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [3, 8, 13, 18] },
                 net: { amount: 60, places: 2 },
                 skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross',
                                skinsScoring: 'gross', skinsCarryOver: true, startHole: 1 } },
    ownerUid: 'anon-cold'
};

const LOOK = `(function () {
  var card = document.getElementById('hole-view-card');
  var nav = card ? card.querySelector('.hole-view-nav-row') : null;
  var reading = document.getElementById('round-reading');
  var sheet = document.getElementById('round-sheet-body');
  var txt = function (el) { return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var ids = function (el) { return el ? [].slice.call(el.children).map(function (c) { return c.id || c.className; }) : []; };
  return JSON.stringify({
    hole: (document.querySelector('.hv-hole-num') || {}).innerText,
    scrollY: Math.round(window.pageYOffset || 0),
    navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
    readingTop: reading ? Math.round(reading.getBoundingClientRect().top + (window.pageYOffset || 0)) : null,
    readingText: txt(reading),
    readingIds: ids(reading),
    sheetIds: ids(sheet),
    board: txt(document.getElementById('live-ticker-mount')),
    games: txt(document.getElementById('todays-games-mount')),
    live: txt(document.getElementById('hole-live-mount'))
  });
})()`;

const S = {};
before(async () => {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=FRESH'),
        db: { events: { FRESH: FRESH }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [{ expression: LOOK }] });
    S.ok = r.ok; S.reason = r.reason;
    if (r.ok) S.v = JSON.parse(r.value[0]);
});

describe('1. THE PAGE SAYS WHAT THE ROUND IS', () => {
    test('ran', () => assert.ok(S.ok, S.reason));

    test('the leaderboard is there before a single score, with everyone level', () => {
        const v = S.v;
        // RE-POINTED 2026-10-05: THE STANDINGS A FRESH ROUND SHOWS ARE THE COMPACT
        // LINES. The bordered card below them was the same five names a second
        // time and is now behind the pop-up those lines open. The CLAIM is
        // unchanged and is the one Manny asked for - a round nobody has started
        // still names every golfer, level - so it is read where it is now shown.
        NAMES.forEach(n => assert.ok(String(v.live).indexOf(n.split(' ')[0]) > -1,
            n + ' is not on the board: ' + v.live));
        assert.ok((String(v.live).match(/\bE\b/g) || []).length >= 4,
            'the four golfers are not all level: ' + v.live);
        // thru 0, said outright, on the compact line under Prev/Next.
        assert.match(String(v.live), /thru 0/, 'the compact line does not say thru 0: ' + v.live);
        // AND THE WAY TO THE FULL BOARD IS ON IT. Without this, "the leaderboard
        // is there" would be satisfied by five names and no way to the rest.
        assert.match(String(v.live), /Full board/, 'no way to the full field: ' + v.live);
        // The mount still holds the OTHER dashboard cards - skins, dots, matches.
        // What must not be there is a second copy of the standings.
        assert.ok(!/LIVE LEADERBOARD/.test(String(v.board)),
            'the duplicate board card is back under the compact lines: ' + v.board);
    });

    test("Today's games lists what was set up, in the builders' own words", () => {
        const g = String(S.v.games);
        assert.match(g, /TODAY/i, "there is no Today's games card: " + g);
        assert.match(g, /Stroke Play/, 'the format is missing: ' + g);
        assert.match(g, /Skins/, 'the skins game is missing: ' + g);
        assert.match(g, /\$5/, 'the skins stake is missing: ' + g);
        assert.match(g, /WEEKLY GAME/i, 'the pot is missing: ' + g);
        assert.match(g, /\$80/, 'the pot figure is missing: ' + g);
    });

    test('and it reads those words from action-model, it does not write its own', () => {
        const fn = IDX.slice(IDX.indexOf('function renderTodaysGames()'),
                             IDX.indexOf('function renderHoleLive()'));
        assert.ok(fn.length > 500, 'the slice is empty - the endpoint drifted');
        ['getRoundGames(', 'describeGame(', 'buildMoneyPoolBanner('].forEach(b =>
            assert.ok(fn.indexOf(b) > -1, 'it does not consume ' + b));
        assert.ok(!/computeMoneyPool|\$' \+|cents|\* *buyIn/.test(fn),
            'the card is computing money instead of printing what the builders return');
    });
});

describe('2. THE SPLIT: reading on the page, settings behind the handle', () => {
    test('the reading area sits below Prev/Next and holds the cards', () => {
        const v = S.v;
        assert.ok(v.readingTop > v.navBottom,
            'the reading area is above Prev/Next: ' + v.readingTop + ' vs ' + v.navBottom);
        ['todays-games-mount', 'live-ticker-mount', 'hole-recap-mount',
         'live-skins-mount', 'action-center-mount', 'bet-strip-mount'].forEach(id =>
            assert.ok(v.readingIds.indexOf(id) > -1, id + ' is not in the reading area'));
        assert.ok(v.readingIds.indexOf('round-landing-summary') > -1,
            'Playing With is not on the page');
        assert.ok(v.readingIds.indexOf('status-panel') > -1, 'the status panel is not on the page');
    });

    test('and the sheet keeps settings and admin, nothing to read', () => {
        const v = S.v;
        ['header-controls-row', 'header-box', 'app-nav-wrap', 'scorecard-footer',
         'end-round-mount'].forEach(id =>
            assert.ok(v.sheetIds.indexOf(id) > -1, id + ' left the sheet'));
        ['live-ticker-mount', 'action-center-mount', 'status-panel', 'round-landing-summary',
         'live-skins-mount', 'bet-strip-mount'].forEach(id =>
            assert.ok(v.sheetIds.indexOf(id) === -1, id + ' is still behind the handle'));
        // The list in the page says the same thing, which is what the mover reads.
        const sheetList = IDX.slice(IDX.indexOf('var ROUND_SHEET_BLOCKS = ['),
                                    IDX.indexOf('];', IDX.indexOf('var ROUND_SHEET_BLOCKS = [')));
        assert.ok(!/status-panel|round-landing-summary/.test(sheetList),
            'a reading card is back in the sheet list');
    });
});

describe('3. AND THE FIRST SCREEN IS UNCHANGED', () => {
    test('the card still fits, so the landing still lands at the top', () => {
        const v = S.v;
        assert.equal(v.hole, 'Hole 1', 'a fresh round lands on the 1st: ' + v.hole);
        assert.ok(v.navBottom <= 844, 'Prev/Next is off the bottom at ' + v.navBottom);
        assert.equal(v.scrollY, 0, 'the page scrolled on a card that fits');
    });
});
