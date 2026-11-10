// ============================================================================
// P1-d T2C: THE IN-APP BOARD, COLD (Phase 1 golfer day, Manny's pick 2026-11-10)
//
// "Your place first": a big "5th", "−3 thru 3 · N back of the lead", a tie
// line, "Around you" (2 above, 2 below, your row highlighted), "updated
// HH:MM", and "See all N teams" opening the full list. No prize amounts.
// The rows are the A3 board's: golferLeaderboardView in the golfer's own
// flight (defaultFlightFor), (You) by isMeRow. With flights the place is the
// place WITHIN the flight, and the card says "in A Flight".
//
// HOW EVERY TEST ARRIVES: cold, in headless Chrome, on the app link
// (?app=1), touching nothing but a real tap on the hole screen's leaderboard
// line ("See all ›") - the way a golfer gets there. Readers are innerText
// (helpers/app-card-fixtures.js). Nothing the page defines is called.
//
// TESTS: 6. Needs Chrome; without it every test is skipped and proves nothing.
//
// BASELINE against p1-base 48121bea (tournament-scorecard.html swapped in by
// cp from git show, this file run, the wave's card restored by cp from a
// saved copy, sha RESTORED-OK):
//
//   all 6 tests: 0 PASS / 6 FAIL / 0 cancelled.   0 + 6 = 6.
//
// NEGATIVE CONTROLS (mutation in tournament-scorecard.html, this file run,
// restored by cp from a scratch copy, sha re-checked RESTORED-OK):
//   C6 the board ignores the golfer's flight (flightId: null)   2 fail CAUGHT
//   C7 "Around you" is the top five, not the window round you   1 fail CAUGHT
//   C8 the tie line counts the golfer as level with themself     3 fail CAUGHT
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SKIP = fs.existsSync(CHROME) ? false : 'Chrome not found - this guard proves nothing without it';
const parse = (s) => JSON.parse(s);
const OPEN_BOARD = [{ tap: '#ap-board-line' }, { sleep: 200 }];

async function board(query, db, more) {
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', query), db, settleMs: 1500,
        steps: OPEN_BOARD.concat([F.READ_APP], more || []) });
    assert.ok(r.ok, 'the cold arrival did not run: ' + r.reason);
    return r.value.filter((x) => typeof x === 'string' && x[0] === '{').map(parse);
}

describe('T2C your place first', { skip: SKIP }, () => {
    test('5th of 18: the big place, to-par thru, back of the lead, the tie line, updated HH:MM', async () => {
        const [a] = await board('tourney=SCR&team=4&app=1', F.scrambleDb());
        assert.equal(a.screen, 'board');
        assert.equal(a.title, 'Leaderboard');
        assert.equal(a.sub, 'LIVESaturday Scramble · 18 teams');
        assert.equal(a.placeBig, '5th');
        assert.equal(a.placeLine, '−3 thru 3 · 6 back of the lead');
        assert.equal(a.tie, 'Team 15 is level with you (−3)');
        assert.equal(a.placeFlight, null, 'no flights: no flight line');
        assert.match(a.placeCard, /^TEAM 4 · YOU/i);
        assert.match(a.updated, /^updated \d{1,2}:\d{2}/);
        assert.doesNotMatch(a.appText, /\$|600|250|[Pp]rize/, 'no prize amounts');
    });

    test('around you: two above, you, two below - you highlighted, (You) on your row only', async () => {
        const [a] = await board('tourney=SCR&team=4&app=1', F.scrambleDb());
        assert.deepEqual(a.around, ['4 Team 7 2 −6', '5 Team 15 1 −3', '5 Team 4 (You) 3 −3', '6 Team 1 1 −2'.replace('6', '7'), '8 Team 11 1 −1']);
        assert.deepEqual(a.aroundMe, ['5 Team 4 (You) 3 −3']);
    });

    test('See all 18 teams opens the full list, every team once, you highlighted', async () => {
        const [a, b] = await board('tourney=SCR&team=4&app=1', F.scrambleDb(), [{ tap: '#ap-see-all' }, { sleep: 200 }, F.READ_APP]);
        assert.equal(a.seeAll, 'See all 18 teams');
        assert.equal(b.allRows.length, 18);
        assert.equal(b.allRows[0], '1 Team 9 3 −9');
        assert.equal(b.allRows.filter((r) => /\(You\)/.test(r)).length, 1);
        assert.equal(b.seeAll, null, 'the button gives way to the list');
    });
});

describe('T2C leads and ties at the top', { skip: SKIP }, () => {
    test('leading alone: "leading by 2"; tied for the lead: "tied for the lead" and the tie line', async () => {
        const db1 = F.scrambleDb();
        Object.assign(db1.tournaments.SCR.scores, { team4_h7: 1, team4_h8: 1, team4_h9: 1 });   // 13 vs 24 = -11, Team 9 next at -9
        const [a] = await board('tourney=SCR&team=4&app=1', db1);
        assert.equal(a.placeBig, '1st');
        assert.equal(a.placeLine, '−11 thru 6 · leading by 2');
        assert.equal(a.tie, null);

        const db2 = F.scrambleDb();
        Object.assign(db2.tournaments.SCR.scores, { team4_h7: 1, team4_h8: 2, team4_h9: 2 });   // 15 vs 24 = -9, level with Team 9
        const [b] = await board('tourney=SCR&team=4&app=1', db2);
        assert.equal(b.placeBig, '1st');
        assert.equal(b.placeLine, '−9 thru 6 · tied for the lead');
        assert.equal(b.tie, 'Team 9 is level with you (−9)');
    });
});

describe('T2C flights - your place within your flight', { skip: SKIP }, () => {
    test('a team in A Flight: place in the flight, "in A Flight", only A Flight teams around you and in See all', async () => {
        const db = F.scrambleDb({ flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } } });
        const t = db.tournaments.SCR.teams;
        // A Flight: 12 (-8), 7 (-6), 4 (-3), 11 (-1), 3 (not started). Everyone else B.
        Object.keys(t).forEach((k) => { t[k].flightId = ['team12', 'team7', 'team4', 'team11', 'team3'].includes(k) ? 'fA' : 'fB'; });
        const [a, b] = await board('tourney=SCR&team=4&app=1', db, [{ tap: '#ap-see-all' }, { sleep: 200 }, F.READ_APP]);
        assert.equal(a.placeBig, '3rd');
        assert.equal(a.placeFlight, 'in A Flight');
        assert.equal(a.sub, 'LIVESaturday Scramble · 5 teams in A Flight');
        assert.equal(a.placeLine, '−3 thru 3 · 5 back of the lead', 'behind the FLIGHT leader (Team 12, -8)');
        assert.equal(a.tie, null, 'Team 15 is level but in B Flight');
        assert.deepEqual(a.around, ['1 Team 12 3 −8', '2 Team 7 2 −6', '3 Team 4 (You) 3 −3', '4 Team 11 1 −1', '- Team 3 - —']);
        assert.equal(a.seeAll, 'See all 5 teams in A Flight');
        assert.equal(b.allRows.length, 5);
    });

    test('the hole screen says the flight place too: "3rd of 5 in A Flight"', async () => {
        const db = F.scrambleDb({ flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 } } });
        const t = db.tournaments.SCR.teams;
        ['team12', 'team7', 'team4', 'team11', 'team3'].forEach((k) => { t[k].flightId = 'fA'; });
        const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=SCR&team=4&app=1'), db, settleMs: 1500, steps: [F.READ_APP] });
        assert.ok(r.ok, r.reason);
        const a = parse(r.value[0]);
        assert.equal(a.place, '3rd of 5 in A Flight');
        assert.equal(a.next, 'Hole 7 · Par 4', 'positive control: the hole screen rendered');
    });
});
