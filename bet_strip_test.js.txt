const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

// bet-strip.js is a pure presenter that calls the money engines. Loading it into
// the same sandbox as money-engine.js mirrors exactly how the browser resolves
// those globals on index.html (which carries its own parity-tested copies).
function loadStrip() {
    const sandbox = loadJsFile('money-engine.js');
    const vm = require('vm');
    const code = fs.readFileSync(path.join(REPO_ROOT, 'bet-strip.js'), 'utf8');
    vm.runInContext(code, sandbox, { filename: 'bet-strip.js' });
    return sandbox;
}

const S = loadStrip();

function strokeRound(overrides) {
    return Object.assign({
        gameFormat: 'match',
        matchScoringStyle: 'stroke',
        matchScoring: 'gross',
        matchStake: 50,
    }, overrides || {});
}

// Marty and Bud, gross, no handicap noise — every scenario below controls the
// result purely through raw hole scores so the expected outcome is hand-checkable.
function martyBud() {
    return makePlayers(['Marty', 'Bud'], [0, 0]);
}

function postScores(players, courseData, byHole) {
    const scores = {};
    courseData.forEach(h => {
        const entry = byHole[h.hole];
        if (!entry) return;
        if (entry[0] !== null && entry[0] !== undefined) scores[`p${players[0].id}_h${h.hole}`] = entry[0];
        if (entry[1] !== null && entry[1] !== undefined) scores[`p${players[1].id}_h${h.hole}`] = entry[1];
    });
    return scores;
}

describe('bet-strip.js — lastPlayedHoleFor (press start-hole safety)', () => {
    test('returns the highest hole actually played, not a count of completed holes', () => {
        const players = martyBud();
        const cd = makeCourseData(18);
        // Holes 1,2,3,5 posted — hole 4 skipped. A count would say 4; the truth is 5.
        const scores = postScores(players, cd, { 1: [4, 5], 2: [4, 5], 3: [4, 5], 5: [4, 5] });
        assert.equal(S.lastPlayedHoleFor([[players[0]], [players[1]]], cd, scores), 5);
    });

    test('SHOTGUN START: a group starting on hole 10 gets a hole number, never a count', () => {
        const players = martyBud();
        const cd = makeCourseData(18);
        const scores = postScores(players, cd, { 10: [4, 5], 11: [4, 5], 12: [4, 5] });
        assert.equal(S.lastPlayedHoleFor([[players[0]], [players[1]]], cd, scores), 12,
            'a count-based implementation would have returned 3 here and pressed onto hole 4');
    });

    test('a hole only one player has posted does not count as played', () => {
        const players = martyBud();
        const cd = makeCourseData(18);
        const scores = postScores(players, cd, { 1: [4, 5], 2: [4, null] });
        assert.equal(S.lastPlayedHoleFor([[players[0]], [players[1]]], cd, scores), 1);
    });

    test('no scores at all yields 0, so the first possible press is hole 1', () => {
        const players = martyBud();
        assert.equal(S.lastPlayedHoleFor([[players[0]], [players[1]]], makeCourseData(18), {}), 0);
    });
});

describe('bet-strip.js — eligibility (press button shown only where pressing is real)', () => {
    const cd = makeCourseData(18);
    const players = martyBud();

    test('PLAIN STROKE PLAY with no money wager: no strip, no press button', () => {
        const m = S.buildBetStrip({ gameFormat: 'stroke', players }, cd, {}, players);
        assert.equal(m.eligible, false);
        assert.equal(m.canPress, false);
    });

    test('SKINS: hidden — the app has no Skins press concept and must not invent one', () => {
        const m = S.buildBetStrip({ gameFormat: 'skins', players, skinsBuyIn: 5 }, cd, {}, players);
        assert.equal(m.eligible, false);
    });

    test('WOLF: hidden', () => {
        const four = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        const m = S.buildBetStrip({ gameFormat: 'wolf', players: four, wolfPointVal: 5 }, cd, {}, four);
        assert.equal(m.eligible, false);
    });

    test('DOTS, STABLEFORD and HI-LO: all hidden', () => {
        ['dots', 'stableford', 'hilo'].forEach(fmt => {
            assert.equal(S.buildBetStrip({ gameFormat: fmt, players }, cd, {}, players).eligible, false, fmt);
        });
    });

    test('STROKE PLAY MONEY WAGER: shown', () => {
        const scores = postScores(players, cd, { 1: [4, 5] });
        const m = S.buildBetStrip(strokeRound({ players }), cd, scores, players);
        assert.equal(m.eligible, true);
        assert.equal(m.mode, 'stroke');
    });

    test('a Stroke Play 1v1 set up with a $0 stake is not eligible — nothing is at stake', () => {
        const m = S.buildBetStrip(strokeRound({ players, matchStake: 0 }), cd, {}, players);
        assert.equal(m.eligible, false);
    });

    test('MATCH PLAY: shown, in match mode', () => {
        const p = martyBud();
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const scores = postScores(p, cd, { 1: [4, 5] });
        const m = S.buildBetStrip({ gameFormat: 'match', players: p, matchStake: 150, matchScoring: 'gross' }, cd, scores, p);
        assert.equal(m.eligible, true);
        assert.equal(m.mode, 'match');
    });

    test('NASSAU: shown, with a chip per leg rather than one merged MAIN', () => {
        const p = martyBud();
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const scores = postScores(p, cd, { 1: [4, 5] });
        const m = S.buildBetStrip({ gameFormat: 'nassau', players: p, nassauStake: 10, nassauScoring: 'gross', nassauPressRule: 'none' }, cd, scores, p);
        assert.equal(m.eligible, true);
        const keys = m.chips.filter(c => !c.key.startsWith('P')).map(c => c.short).join(',');
        assert.equal(keys, 'F9,B9,TOT', 'collapsing Nassau to one chip would hide two real wagers');
    });
});

describe('bet-strip.js — terminology never mixes Match Play with Stroke Play', () => {
    const cd = makeCourseData(18);

    test('STROKE terminology: "Marty +3", never "Marty 3 UP"', () => {
        const players = martyBud();
        const scores = postScores(players, cd, { 1: [3, 4], 2: [3, 4], 3: [3, 4] });
        const m = S.buildBetStrip(strokeRound({ players }), cd, scores, players);
        assert.equal(m.chips[0].statusText, 'Marty +3');
        assert.ok(!/UP/.test(m.chips[0].statusText), 'match-play wording must never appear in a stroke bet');
    });

    test('STROKE tie reads TIED, not ALL SQUARE', () => {
        const players = martyBud();
        const scores = postScores(players, cd, { 1: [4, 4], 2: [5, 5] });
        const m = S.buildBetStrip(strokeRound({ players }), cd, scores, players);
        assert.equal(m.chips[0].statusText, 'TIED');
    });

    test('MATCH terminology: "Marty 2 UP" and "ALL SQUARE", never "+2"', () => {
        const p = martyBud();
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const cfg = { gameFormat: 'match', players: p, matchStake: 150, matchScoring: 'gross', matchPressRule: 'none' };

        const won2 = postScores(p, cd, { 1: [3, 4], 2: [3, 4] });
        assert.equal(S.buildBetStrip(cfg, cd, won2, p).chips[0].statusText, 'Marty 2 UP');

        const square = postScores(p, cd, { 1: [3, 4], 2: [4, 3] });
        assert.equal(S.buildBetStrip(cfg, cd, square, p).chips[0].statusText, 'ALL SQUARE');
    });
});

describe('bet-strip.js — AT STAKE vs WON is never blurred', () => {
    const cd = makeCourseData(18);

    test('an unfinished wager says AT STAKE and is marked LIVE', () => {
        const players = martyBud();
        const scores = postScores(players, cd, { 1: [3, 4], 2: [3, 4] });
        const m = S.buildBetStrip(strokeRound({ players }), cd, scores, players);
        const d = m.chips[0].detail;
        assert.equal(d.live, true);
        assert.match(d.stateLabel, /LIVE/);
        assert.equal(d.moneyLine, '$50 AT STAKE');
        assert.ok(!/won/i.test(d.statusLine), 'an in-progress bet must never read as already won');
    });

    test('a completed wager flips to FINAL and shows real won money', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 18; h++) byHole[h] = [4, 5];
        const m = S.buildBetStrip(strokeRound({ players }), cd, postScores(players, cd, byHole), players);
        const d = m.chips[0].detail;
        assert.equal(d.live, false);
        assert.match(d.stateLabel, /FINAL/);
        assert.equal(d.statusLine, 'Marty won');
        assert.equal(d.moneyLine, '+$50');
    });

    test('a completed TIE pays nobody and says so explicitly', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 18; h++) byHole[h] = [4, 4];
        const m = S.buildBetStrip(strokeRound({ players }), cd, postScores(players, cd, byHole), players);
        assert.equal(m.chips[0].detail.statusLine, 'Tied \u2014 nobody pays');
        assert.equal(m.chips[0].detail.moneyLine, '$0');
    });
});

describe('bet-strip.js — press start hole is always the next UNPLAYED hole', () => {
    const cd = makeCourseData(18);

    test('after hole 9 is complete, the next press starts hole 10', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 9; h++) byHole[h] = [4, 5];
        const m = S.buildBetStrip(strokeRound({ players }), cd, postScores(players, cd, byHole), players);
        assert.equal(m.canPress, true);
        assert.equal(m.nextPressHole, 10);
    });

    test('REGRESSION: out-of-order entry never presses onto an already-played hole', () => {
        const players = martyBud();
        const scores = postScores(players, cd, { 1: [4, 5], 2: [4, 5], 3: [4, 5], 5: [4, 5] });
        const m = S.buildBetStrip(strokeRound({ players }), cd, scores, players);
        assert.equal(m.nextPressHole, 6, 'the old count-based logic produced 5 — a hole already in the books');
    });

    test('no press offered once the round is complete', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 18; h++) byHole[h] = [4, 5];
        const m = S.buildBetStrip(strokeRound({ players }), cd, postScores(players, cd, byHole), players);
        assert.equal(m.canPress, false);
        assert.equal(m.nextPressHole, null);
    });

    test('no second press offered on a hole that already has one', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 9; h++) byHole[h] = [4, 5];
        const data = strokeRound({ players, strokePresses: { a: { startHole: 10, stake: 50 } } });
        const m = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(m.canPress, false);
    });

    test('a 9-hole round never offers a press beyond hole 9', () => {
        const nine = makeCourseData(9);
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 9; h++) byHole[h] = [4, 5];
        const m = S.buildBetStrip(strokeRound({ players }), nine, postScores(players, nine, byHole), players);
        assert.equal(m.canPress, false);
    });
});

describe('bet-strip.js — presses appear, stay compact, and carry their own amount', () => {
    const cd = makeCourseData(18);

    test('ONE press produces MAIN + P1', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 9; h++) byHole[h] = [4, 5];
        const data = strokeRound({ players, strokePresses: { a: { startHole: 6, stake: 50 } } });
        const m = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(m.chips.map(c => c.short).join(','), 'MAIN,P1');
        assert.equal(m.pressCount, 1);
    });

    test('MULTIPLE presses each keep their own stake, never the parent\'s', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 15; h++) byHole[h] = [4, 5];
        const data = strokeRound({
            players,
            strokePresses: { a: { startHole: 6, stake: 50 }, b: { startHole: 10, stake: 100 }, c: { startHole: 14, stake: 200 } }
        });
        const m = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(m.chips.map(c => c.short).join(','), 'MAIN,P1,P2,P3');
        assert.equal(m.chips.map(c => c.detail.stake).join(','), '50,50,100,200');
    });

    test('7+ presses stay a flat chip list — never seven expanded cards', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 17; h++) byHole[h] = [4, 5];
        const presses = {};
        [4, 6, 8, 10, 12, 14, 16].forEach((h, i) => { presses['p' + i] = { startHole: h, stake: 25 }; });
        const m = S.buildBetStrip(strokeRound({ players, strokePresses: presses }), cd, postScores(players, cd, byHole), players);
        assert.equal(m.chips.length, 8, 'MAIN + 7 presses');
        assert.equal(m.pressCount, 7);
        // Compactness is structural: every chip is one short status string, and
        // only the tapped one ever expands (detail is data, not rendered markup).
        m.chips.forEach(c => {
            assert.ok(c.statusText.length <= 18, `chip status "${c.statusText}" is too long for a compact strip`);
        });
    });

    test('each press only sees holes inside its own range', () => {
        const players = martyBud();
        // Marty crushes holes 1-5, then both play dead even the rest of the way.
        const byHole = {};
        for (let h = 1; h <= 5; h++) byHole[h] = [3, 5];
        for (let h = 6; h <= 18; h++) byHole[h] = [4, 4];
        const data = strokeRound({ players, strokePresses: { a: { startHole: 6, stake: 50 } } });
        const m = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(m.chips[0].statusText, 'Marty +10', 'MAIN sees the whole round');
        assert.equal(m.chips[1].statusText, 'TIED', 'P1 must not inherit Marty\'s hole 1-5 lead');
    });
});

describe('bet-strip.js — score corrections refresh the strip, never a stale cache', () => {
    const cd = makeCourseData(18);

    test('correcting a hole BEFORE a press start hole moves MAIN but not the press', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 12; h++) byHole[h] = [4, 4];
        const data = strokeRound({ players, strokePresses: { a: { startHole: 6, stake: 50 } } });

        const before = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(before.chips[0].statusText, 'TIED');
        assert.equal(before.chips[1].statusText, 'TIED');

        byHole[3] = [2, 4]; // correct hole 3 — outside P1's range
        const after = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(after.chips[0].statusText, 'Marty +2', 'MAIN must pick up the correction');
        assert.equal(after.chips[1].statusText, 'TIED', 'P1 starts at hole 6 and must not move');
    });

    test('correcting a hole INSIDE a press range moves both', () => {
        const players = martyBud();
        const byHole = {};
        for (let h = 1; h <= 12; h++) byHole[h] = [4, 4];
        const data = strokeRound({ players, strokePresses: { a: { startHole: 6, stake: 50 } } });
        byHole[8] = [2, 4];
        const after = S.buildBetStrip(data, cd, postScores(players, cd, byHole), players);
        assert.equal(after.chips[0].statusText, 'Marty +2');
        assert.equal(after.chips[1].statusText, 'Marty +2');
    });
});

describe('bet-strip.js — the strip only shows the golfer\'s OWN group', () => {
    test('a side match involving nobody in this group is not counted', () => {
        const cd = makeCourseData(18);
        const all = makePlayers(['Marty', 'Bud', 'Ken', 'Dave'], [0, 0, 0, 0]);
        const myGroup = [all[0], all[1]];
        const data = strokeRound({
            players: all,
            sideMatches: {
                mine: { teamAIds: [String(all[0].id)], teamBIds: [String(all[1].id)] },
                theirs: { teamAIds: [String(all[2].id)], teamBIds: [String(all[3].id)] }
            }
        });
        const scores = postScores(myGroup, cd, { 1: [4, 5] });
        const m = S.buildBetStrip(data, cd, scores, myGroup);
        assert.equal(m.sideBets.total, 1, 'a golfer entering scores must not be shown other foursomes\' bets');
    });
});

// ---------------------------------------------------------------------------
// ACCEPTANCE SCENARIOS
// ---------------------------------------------------------------------------

describe('ACCEPTANCE — Marty vs Bud, Stroke Play with three presses, standing on hole 17', () => {
    const cd = makeCourseData(18);

    // Hand-built so each segment lands on an exact, independently checkable margin:
    //   H1-5    Marty -4  (MAIN only)
    //   H6-9    Marty -2  (MAIN + P1)
    //   H10-13  Bud   -3  (MAIN + P1 + P2)  -> Marty +3 overall, +1 for P1, Bud +2 for P2
    //   H14-17  level    (everything)       -> P3 tied
    // Segment margins (Marty minus Bud; negative means Marty ahead) chosen so all
    // four wagers land on the exact spec targets simultaneously:
    //   H1-5   = -2   (MAIN only)
    //   H6-9   = -3   (MAIN + P1)
    //   H10-13 = +2   (MAIN + P1 + P2)
    //   H14-17 =  0   (everything)
    // MAIN = -3 (Marty +3) | P1 = -1 (Marty +1) | P2 = +2 (Bud +2) | P3 = 0 (TIED)
    function scenarioScores(players) {
        const byHole = {};
        [1, 2].forEach(h => { byHole[h] = [4, 5]; });          // Marty -2
        [3, 4, 5].forEach(h => { byHole[h] = [4, 4]; });
        [6, 7, 8].forEach(h => { byHole[h] = [4, 5]; });        // Marty -3
        byHole[9] = [4, 4];
        [10, 11].forEach(h => { byHole[h] = [5, 4]; });         // Bud -2
        [12, 13].forEach(h => { byHole[h] = [4, 4]; });
        [14, 15, 16, 17].forEach(h => { byHole[h] = [4, 4]; }); // level
        return postScores(players, cd, byHole);
    }

    const players = martyBud();
    const data = strokeRound({
        players,
        strokePresses: {
            a: { startHole: 6, stake: 50 },
            b: { startHole: 10, stake: 100 },
            c: { startHole: 14, stake: 200 }
        }
    });
    const model = S.buildBetStrip(data, cd, scenarioScores(players), players);

    test('the strip reads MAIN / P1 / P2 / P3 with the exact expected statuses', () => {
        assert.equal(model.chips.map(c => c.short).join(','), 'MAIN,P1,P2,P3');
        assert.equal(model.chips[0].statusText, 'Marty +3');
        assert.equal(model.chips[1].statusText, 'Marty +1');
        assert.equal(model.chips[2].statusText, 'Bud +2');
        assert.equal(model.chips[3].statusText, 'TIED');
    });

    test('tapping P2 shows Press 2, $100, started H10, Bud ahead, $100 at stake', () => {
        const p2 = model.chips[2].detail;
        assert.equal(p2.title, 'Press 2');
        assert.equal(p2.stake, 100);
        assert.equal(p2.startHole, 10);
        assert.equal(p2.rangeText, 'H10\u201318');
        assert.match(p2.stateLabel, /LIVE/);
        assert.equal(p2.statusLine, 'Bud leads by 2');
        assert.equal(p2.moneyLine, '$100 AT STAKE');
    });

    test('every wager is still live, and hole 18 is the next available press', () => {
        assert.equal(model.liveCount, 4);
        assert.equal(model.lockedCount, 0);
        assert.equal(model.canPress, true);
        assert.equal(model.nextPressHole, 18);
    });
});

describe('ACCEPTANCE — Match Play, $150, main plus seven presses stays compact', () => {
    const cd = makeCourseData(18);

    function autoPressChain() {
        const p = martyBud();
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        // Marty wins holes 1-8. Under a 1-down rule each open match presses once, and
        // each new press immediately goes 1 up and spawns the next - a long press chain.
        // Stopping at hole 8 keeps the base match mathematically alive (8 up, 10 to play).
        const byHole = {};
        for (let h = 1; h <= 8; h++) byHole[h] = [3, 5];
        const data = {
            gameFormat: 'match', players: p, matchStake: 150,
            matchScoring: 'gross', matchPressRule: '1down'
        };
        return S.buildBetStrip(data, cd, postScores(p, cd, byHole), p);
    }

    test('MAIN plus a 7+ press chain renders as a flat chip list, never stacked cards', () => {
        const m = autoPressChain();
        assert.equal(m.eligible, true);
        assert.ok(m.pressCount >= 7, `expected at least 7 presses, got ${m.pressCount}`);
        assert.equal(m.chips.length, m.pressCount + 1);
    });

    test('every chip in a 7+ press match stays short enough for one scrollable row', () => {
        autoPressChain().chips.forEach(c => {
            assert.ok(c.statusText.length <= 18, `"${c.statusText}" would break the compact strip`);
            assert.ok(/UP|ALL SQUARE|&/.test(c.statusText), 'match chips must use match wording');
        });
    });

    test('with an automatic press already covering the next hole, no duplicate press is offered', () => {
        // Correct behaviour, and worth pinning: a 1-down rule has already opened a press
        // on the next hole, so showing PRESS would let a golfer double up on the same
        // hole by accident. The button reappears as soon as that hole is played.
        const m = autoPressChain();
        assert.equal(m.canPress, false);
        assert.ok(m.chips.some(c => c.detail.startHole === 9), 'the automatic press on hole 9 should exist');
    });

    test('a manual-press match with many presses running still offers the PRESS button', () => {
        const p = martyBud();
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const byHole = {};
        for (let h = 1; h <= 8; h++) byHole[h] = [3, 5];
        const data = {
            gameFormat: 'match', players: p, matchStake: 150, matchScoring: 'gross',
            matchPressRule: 'none', matchPresses: { a: { baseId: '18', startHole: 4 } }
        };
        const m = S.buildBetStrip(data, cd, postScores(p, cd, byHole), p);
        assert.ok(m.pressCount >= 1);
        assert.equal(m.canPress, true);
        assert.equal(m.nextPressHole, 9, 'eight holes played, so the press starts on hole 9');
    });
});

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------

const NAV_PAGES = ['index.html', 'leaderboard.html', 'skins.html', 'settlement.html', 'stats.html', 'sidematches.html'];

describe('NAVIGATION — the More menu exposes every secondary destination', () => {
    NAV_PAGES.forEach(page => {
        const html = fs.readFileSync(path.join(REPO_ROOT, page), 'utf8');
        const menu = html.slice(html.indexOf('nav-more-menu'), html.indexOf('</details>'));

        test(`${page} lists Matches, Stats, Trip and Home inside the More menu`, () => {
            ['sidematches.html', 'stats.html', 'trip.html', 'admin.html'].forEach(dest => {
                assert.ok(menu.includes(`href="${dest}"`), `${page}'s More menu is missing ${dest}`);
            });
        });

        test(`${page} keeps the More popover OUTSIDE the horizontally scrolling nav bar`, () => {
            // This is the actual root cause of the clipped menu: an overflow-x:auto
            // container clips absolutely-positioned descendants. The <details> must
            // be a sibling of .top-nav-bar, inside .app-nav-wrap.
            const navBarEnd = html.indexOf('</div>', html.indexOf('class="top-nav-bar"'));
            const detailsStart = html.indexOf('<details class="nav-more"');
            assert.ok(html.includes('class="app-nav-wrap"'), `${page} is missing the .app-nav-wrap positioning context`);
            assert.ok(detailsStart > navBarEnd, `${page} still has the More menu nested inside the scrolling nav bar`);
        });

        test(`${page} never ships the More menu forced open`, () => {
            assert.ok(!/nav-more"?\s+open/.test(html), `${page} has a hardcoded open attribute on the More menu`);
        });

        test(`${page} preserves the game code on every in-round More destination`, () => {
            // ?game=CODE is applied at runtime to every .nav-link. Trip is deliberately
            // excluded — trip.html reads ?trip=, not ?game=, so a game code there would
            // be meaningless.
            ['sidematches.html', 'stats.html', 'admin.html'].forEach(dest => {
                const anchor = menu.slice(menu.indexOf(`href="${dest}"`));
                assert.ok(anchor.slice(0, 120).includes('nav-link'), `${page}: ${dest} would lose the game code`);
            });
        });
    });

    test('the popover is constrained to the viewport so it cannot run off a 320px screen', () => {
        const css = fs.readFileSync(path.join(REPO_ROOT, 'leaderboard.html'), 'utf8');
        const rule = css.slice(css.indexOf('.nav-more-menu {'), css.indexOf('}', css.indexOf('.nav-more-menu {')));
        assert.ok(rule.includes('max-width: calc(100vw'), 'the menu must be capped to the viewport width');
        assert.ok(rule.includes('position: absolute'), 'the menu anchors to .app-nav-wrap');
    });
});

describe('SCORECARD WIRING — the strip is mounted and prompt() is gone', () => {
    const idx = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

    test('index.html loads bet-strip.js', () => {
        assert.ok(idx.includes('<script src="bet-strip.js"></script>'));
    });

    test('the strip is mounted between score entry and Prev/Next', () => {
        const mount = idx.indexOf(`html += '<div id="bet-strip-mount"></div>'`);
        const nav = idx.indexOf('html += navRowHtml;');
        assert.ok(mount > -1, 'no bet strip mount point found');
        assert.ok(mount < nav, 'bet status must sit above Prev/Next, not below it');
    });

    test('REGRESSION: no prompt() anywhere in index.html — it fails silently in an installed PWA', () => {
        const codeOnly = idx.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/\bprompt\(/.test(codeOnly), 'prompt() is unreliable in a standalone PWA and must not gate a money action');
    });

    test('the press flow never blocks on confirm() either', () => {
        const pressArea = idx.slice(idx.indexOf('function pressMatchBet'), idx.indexOf('function pressMatchBet') + 600);
        assert.ok(!/confirm\(/.test(pressArea));
    });

    test('the detailed action panel derives its press hole from the last hole played', () => {
        assert.ok(idx.includes('lastPlayedHoleFor([[s.p1], [s.p2]]'), 'stroke panel still uses a count');
        assert.ok(idx.includes('lastPlayedHoleFor([matchCalc.t1Players, matchCalc.t2Players]'), 'match panel still uses maxThru');
        assert.ok(!/holesCompleted \+ 1/.test(idx), 'a count-based press start hole is still present');
    });

    test('the strip is hidden in print/PDF output', () => {
        assert.ok(/@media print \{ \.bet-strip-wrap/.test(idx));
    });
});

describe('END-TO-END RENDER — the real production renderer, in a stubbed DOM', () => {
    const vm = require('vm');

    // currentData is a `let` inside index.html's page script, so the scenario is
    // injected by evaluating a shim INSIDE the same context rather than assigning
    // a property from outside. This drives renderBetStrip() exactly as the browser
    // does, catching any string-building or escaping fault the model tests can't.
    function renderScenario() {
        const sb = loadHtmlInlineScript('index.html', ['bet-strip.js']);
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Bud'], [0, 0]);
        const byHole = {};
        [1, 2].forEach(h => byHole[h] = [4, 5]); [3, 4, 5].forEach(h => byHole[h] = [4, 4]);
        [6, 7, 8].forEach(h => byHole[h] = [4, 5]); byHole[9] = [4, 4];
        [10, 11].forEach(h => byHole[h] = [5, 4]); [12, 13].forEach(h => byHole[h] = [4, 4]);
        [14, 15, 16, 17].forEach(h => byHole[h] = [4, 4]);
        const scores = {};
        Object.keys(byHole).forEach(h => {
            scores[`p${p[0].id}_h${h}`] = byHole[h][0];
            scores[`p${p[1].id}_h${h}`] = byHole[h][1];
        });
        const payload = JSON.stringify({
            gameFormat: 'match', matchScoringStyle: 'stroke', matchScoring: 'gross', matchStake: 50,
            players: p, courseData: cd, scores,
            strokePresses: { a: { startHole: 6, stake: 50 }, b: { startHole: 10, stake: 100 }, c: { startHole: 14, stake: 200 } }
        });
        vm.runInContext(`currentData = ${payload}; window.__scFilteredPlayers = currentData.players; renderBetStrip();`, sb);
        return sb;
    }

    const html = () => renderScenario().document.getElementById('bet-strip-mount').innerHTML;

    test('renders four chips with correct statuses and a visible PRESS button', () => {
        const out = html();
        assert.ok(out.includes('>MAIN</span><span class="bc-status">Marty +3<'));
        assert.ok(out.includes('>P1</span><span class="bc-status">Marty +1<'));
        assert.ok(out.includes('>P2</span><span class="bc-status">Bud +2<'));
        assert.ok(out.includes('>P3</span><span class="bc-status">TIED<'));
        assert.ok(out.includes('class="bet-press-btn"'), 'PRESS must be on the scorecard, not behind a menu');
    });

    test('chip onclick handlers are correctly quoted and callable', () => {
        assert.ok(html().includes(`onclick="toggleBetChip('P2')"`));
    });

    test('tapping P2 expands its detail in place, with LIVE + AT STAKE wording', () => {
        const sb = renderScenario();
        vm.runInContext(`toggleBetChip('P2');`, sb);
        const out = sb.document.getElementById('bet-strip-mount').innerHTML;
        assert.ok(out.includes('Press 2'));
        assert.ok(out.includes('H10\u201318 \u00B7 $100'));
        assert.ok(out.includes('Bud leads by 2'));
        assert.ok(out.includes('$100 AT STAKE'));
        assert.ok(!/won/i.test(out.slice(out.indexOf('bet-chip-detail'))), 'a live press must never read as won');
    });

    test('tapping PRESS shows the start hole prominently and same-amount is one more tap', () => {
        const sb = renderScenario();
        vm.runInContext(`openPressPanel();`, sb);
        const out = sb.document.getElementById('bet-strip-mount').innerHTML;
        assert.ok(out.includes('NEW PRESS STARTS HOLE 18'), 'the golfer must never guess which holes count');
        assert.ok(out.includes(`onclick="confirmStrokePress(50)"`), 'same-amount press must be a single further tap');
        assert.ok(out.includes('Custom'), 'a custom amount must still be reachable');
    });

    test('the strip renders nothing at all for a format that cannot be pressed', () => {
        const sb = loadHtmlInlineScript('index.html', ['bet-strip.js']);
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Bud'], [0, 0]);
        const payload = JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores: {} });
        vm.runInContext(`currentData = ${payload}; window.__scFilteredPlayers = currentData.players; renderBetStrip();`, sb);
        assert.equal(sb.document.getElementById('bet-strip-mount').innerHTML, '');
    });
});
