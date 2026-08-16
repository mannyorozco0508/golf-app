const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const vm = require('vm');

function withData(sandbox, data) {
    sandbox.__d = data;
    vm.runInContext('currentData = __d;', sandbox);
}

describe('LIVE ACTION AGGREGATOR — locked vs live logic, no new math', () => {
    test('ACCEPTANCE TEST 1: screenshot-like scenario - one dominant player, 8 presses, all correctly locked', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 17; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        scores[`p${players[0].id}_h18`] = 4; scores[`p${players[1].id}_h18`] = 4;
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, matchPressRule: '2down', courseData: cd, scores });

        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.presses.length, 8);
        assert.equal(summary.betCounts.final, 9);
        assert.equal(summary.lockedTotal, 1350);
        const ids = summary.presses.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length, 'every press must have a unique identifier');
    });

    test('a mixed round (some locked, some live, some losing) is classified correctly per segment', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 10; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        for (let h = 11; h <= 13; h++) { scores[`p${players[0].id}_h${h}`] = 4; scores[`p${players[1].id}_h${h}`] = 3; }
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, matchPressRule: '2down', courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.ok(summary.betCounts.winning > 0);
        assert.ok(summary.betCounts.losing > 0);
        assert.ok(summary.betCounts.final > 0);
        assert.ok(summary.presses.filter(p => !p.closed).length > 0);
    });

    test('REGRESSION: unfinished bets never get labeled FINAL', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = { [`p${players[0].id}_h1`]: 3, [`p${players[1].id}_h1`]: 4, [`p${players[0].id}_h2`]: 4, [`p${players[1].id}_h2`]: 4 };
        withData(sandbox, { players, gameFormat: 'match', matchStake: 100, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.mainGame.segments[0].closed, false);
        assert.equal(summary.betCounts.final, 0);
    });

    test('all-square is represented correctly, not as winning or losing', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(4);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        withData(sandbox, { players, gameFormat: 'match', matchStake: 50, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.betCounts.allSquare, 1);
        assert.equal(summary.betCounts.winning, 0);
        assert.equal(summary.betCounts.losing, 0);
    });

    test('Nassau front/back presses use unique ids, not colliding "Press 1" labels for both legs', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 12; h++) { scores[`p${players[0].id}_h${h}`] = 4; scores[`p${players[1].id}_h${h}`] = 5; }
        withData(sandbox, { players, gameFormat: 'nassau', nassauStake: 10, nassauPressRule: '2down', courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        const ids = summary.presses.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(summary.presses.length > 5);
    });

    test('Side Matches correctly appear in the aggregated summary with real status', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(12);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        const sideMatches = { sm1: { format: 'match', scoring: 'net', teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)], stake: 20, pressRule: 'none' } };
        withData(sandbox, { players, gameFormat: 'stroke', sideMatches, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.sideMatchLines.length, 1);
        assert.equal(summary.sideMatchLines[0].thru, 12);
        assert.ok(summary.sideMatchLines[0].statusText.includes('Manny'));
    });

    test('a no-bet Stroke Play round produces no main game and no side matches', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const players = makePlayers(['A', 'B'], [0, 0]);
        withData(sandbox, { players, gameFormat: 'stroke', courseData: [], scores: {} });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.mainGame, null);
        assert.equal(summary.sideMatchLines.length, 0);
    });

    test('SCORE CORRECTION: changing an earlier hole recalculates bet counts, no stale state', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 7; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, matchPressRule: '2down', courseData: cd, scores });
        const before = sandbox.buildLiveActionSummary(players, players);
        scores[`p${players[0].id}_h7`] = 6; scores[`p${players[1].id}_h7`] = 3;
        const after = sandbox.buildLiveActionSummary(players, players);
        assert.notEqual(JSON.stringify(before.betCounts), JSON.stringify(after.betCounts));
    });

    test('ACCEPTANCE TEST 5: at round completion, the dashboard locked total exactly matches the canonical settlement', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const engine = loadJsFile('money-engine.js');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        const data = { players, gameFormat: 'match', matchStake: 150, matchPressRule: '2down', courseData: cd, scores };
        withData(sandbox, data);
        const summary = sandbox.buildLiveActionSummary(players, players);
        const canonical = engine.computeRoundMoneyByPlayer(data, cd, scores);
        const canonicalNet = canonical.players.find(p => p.name === 'Manny').net;
        assert.equal(summary.lockedTotal, canonicalNet);
    });
});

describe('LIVE ACTION — Wolf section (pure pass-through, zero new math)', () => {
    test('REGRESSION: aggregator output is byte-identical to a direct calcWolfEngine call', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(4);
        const players = makePlayers(['Manny', 'John', 'Mike', 'Steve'], [0, 0, 0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { players.forEach((p, i) => scores[`p${p.id}_h${h.hole}`] = 4 + (i === 0 ? -1 : 0)); });
        const wolfCalls = {};
        cd.forEach(h => wolfCalls[`h${h.hole}`] = { call: 'lone', partnerId: null });
        const data = { players, gameFormat: 'wolf', wolfCalls, wolfPointVal: 5, wolfLoneMult: 2, courseData: cd, scores };
        withData(sandbox, data);

        const rawCalc = sandbox.calcWolfEngine(data, cd, scores);
        const summary = sandbox.buildLiveActionSummary(players, players);
        const summaryTotals = {};
        summary.wolfSummary.totals.forEach(t => {
            const p = players.find(pl => pl.name === t.name);
            summaryTotals[p.id] = t.points;
        });
        assert.equal(JSON.stringify(rawCalc.totals), JSON.stringify(summaryTotals), 'aggregator must be a pure pass-through, never an independent recalculation');
    });

    test('identifies the current Wolf and hole correctly', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(2);
        const players = makePlayers(['Manny', 'John', 'Mike', 'Steve'], [0, 0, 0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { players.forEach(p => scores[`p${p.id}_h${h.hole}`] = 4); });
        const wolfCalls = { h1: { call: 'lone', partnerId: null }, h2: { call: 'lone', partnerId: null } };
        withData(sandbox, { players, gameFormat: 'wolf', wolfCalls, wolfPointVal: 5, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.wolfSummary.currentHole, 2, 'hole 2 is Steve\'s turn as Wolf (players[(hole-1)%4])');
    });
});

describe('LIVE ACTION — Dots/Junk section (money conversion uses the newly-approved rule)', () => {
    test('a local calcDotsEngine copy exists and matches the canonical raw unit counts exactly', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const engine = loadJsFile('money-engine.js');
        const players = [{ id: 101, name: 'A' }, { id: 102, name: 'B' }];
        const dots = { h1: { p101: ['birdie', 'greenie'] }, h2: { p102: ['snake'] } };
        const canonical = engine.calcDotsEngine({ players, dots }, [], {});
        const local = sandbox.calcDotsEngine({ players, dots }, [], {});
        assert.equal(JSON.stringify(canonical.totals), JSON.stringify(local.totals));
    });

    test('dots money conversion is zero-sum, using the approved "every other player pays" rule', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(3);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        const dots = { h1: { [`p${players[0].id}`]: ['birdie'] } };
        withData(sandbox, { players, gameFormat: 'dots', dots, dotPointVal: 3, courseData: cd, scores: {} });
        const summary = sandbox.buildLiveActionSummary(players, players);
        const sum = summary.dotsSummary.reduce((s, d) => s + d.money, 0);
        assert.equal(sum, 0);
    });
});

describe('LIVE ACTION — Skins section (reuses the existing live carry-over/void functions)', () => {
    test('a carry-over skins round correctly shows units won per player', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(3);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 5, [`p${players[1].id}_h2`]: 5,
            [`p${players[0].id}_h3`]: 3, [`p${players[1].id}_h3`]: 5,
        };
        withData(sandbox, { players, gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.skinsSummary.players.find(p => p.name === 'Manny').won, 3, 'Manny absorbs all 3 carried units');
        assert.equal(summary.skinsSummary.pendingUnits, 0);
    });

    test('unresolved carry shows correctly as pending, not silently dropped', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(2);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        withData(sandbox, { players, gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        assert.equal(summary.skinsSummary.pendingUnits, 2);
    });
});

describe('LIVE ACTION — Birdie Pool section (side games, independent of main format)', () => {
    test('birdie pool money is zero-sum and correctly attributed', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(3);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        const scores = { [`p${players[0].id}_h1`]: cd[0].par - 1, [`p${players[1].id}_h1`]: cd[0].par };
        withData(sandbox, { players, gameFormat: 'stroke', birdieGameEnabled: true, birdieUnitVal: 5, courseData: cd, scores });
        const summary = sandbox.buildLiveActionSummary(players, players);
        const sum = summary.birdieKpSummary.birdie.reduce((s, p) => s + p.money, 0);
        assert.equal(sum, 0);
    });

    // REMOVED IN WAVE 4: Dollar Game / KP was retired from the product, so there is no
    // longer a live KP section to display. The calculation survives in
    // settlement-engine.js as a legacy reader for historical rounds only - covered by
    // the legacy tests in wave4_finish_test.js rather than here.

    test('the dashboard appears even with ONLY a birdie pool active - no main game, no side match required', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(3);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        const scores = { [`p${players[0].id}_h1`]: cd[0].par - 1, [`p${players[1].id}_h1`]: cd[0].par };
        withData(sandbox, { players, gameFormat: 'stroke', birdieGameEnabled: true, birdieUnitVal: 5, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        assert.equal(sandbox.document.getElementById('live-action-box').style.display, 'block');
    });
});

describe('LIVE ACTION — Main Match hierarchy and at-stake/locked language (UX polish batch)', () => {
    test('a FINAL main match shows locked language, never "at stake"', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-main-match').innerHTML;
        assert.ok(html.includes('FINAL'));
        assert.ok(html.includes('+$150 locked'));
        assert.ok(!html.includes('at stake'), 'a mathematically closed bet must never say "at stake"');
    });

    test('REGRESSION: an unfinished main match shows "at stake", never presents the stake as already won', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 7; h++) { scores[`p${players[0].id}_h${h}`] = 4; scores[`p${players[1].id}_h${h}`] = 4; }
        for (let h = 8; h <= 11; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 4; }
        withData(sandbox, { players, gameFormat: 'match', matchStake: 20, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-main-match').innerHTML;
        assert.ok(html.includes('LIVE'));
        assert.ok(html.includes('$20 at stake'));
        assert.ok(!html.includes('locked'), 'an unfinished bet must never say the stake is locked/won');
    });

    test('all-square status shows the explicit text word "ALL SQUARE", not color alone', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(4);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        withData(sandbox, { players, gameFormat: 'match', matchStake: 50, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-main-match').innerHTML;
        assert.ok(html.includes('ALL SQUARE'));
    });

    test('the Presses section header shows the Total/Locked/Live breakdown, matching the exact spec hierarchy', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 17; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        scores[`p${players[0].id}_h18`] = 4; scores[`p${players[1].id}_h18`] = 4;
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, matchPressRule: '2down', courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-press-ladder').innerHTML;
        assert.ok(html.includes('8 Total'));
        assert.ok(html.includes('Locked'));
        assert.ok(html.includes('Live'));
    });

    test('live presses show an aggregate "at stake" total, since touch devices can\'t hover to see per-pill tooltips', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 3; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        withData(sandbox, { players, gameFormat: 'match', matchStake: 20, matchPressRule: '2down', courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-press-ladder').innerHTML;
        assert.ok(html.includes('at stake'), 'live presses must spell out the at-stake total visibly, not rely only on a hover tooltip');
    });

    test('Side Bets correctly show "at stake" vs "locked" language matching their own closed state', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(12);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        const sideMatches = { sm1: { format: 'match', scoring: 'net', teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)], stake: 20, pressRule: 'none' } };
        withData(sandbox, { players, gameFormat: 'stroke', sideMatches, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-sidematches').innerHTML;
        assert.ok(html.includes('locked'), 'a mathematically closed side match (Manny wins every hole thru 12 with 6 to play) should show locked language');
    });

    test('SCORE CORRECTION with the new hierarchy: correcting an earlier hole updates the Main Match section, not stale', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2'; players.forEach(p => p.playingForMoney = true);
        let scores = {};
        for (let h = 1; h <= 7; h++) { scores[`p${players[0].id}_h${h}`] = 3; scores[`p${players[1].id}_h${h}`] = 5; }
        withData(sandbox, { players, gameFormat: 'match', matchStake: 150, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const before = sandbox.document.getElementById('live-action-main-match').innerHTML;

        scores[`p${players[0].id}_h7`] = 6; scores[`p${players[1].id}_h7`] = 3;
        sandbox.renderLiveActionSummary(players, players);
        const after = sandbox.document.getElementById('live-action-main-match').innerHTML;
        assert.notEqual(before, after, 'correcting hole 7 must visibly update the Main Match section on next render');
    });

    test('Skins never shows a "final" dollar figure mid-round - carry is honestly labeled not-yet-final', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(2);
        const players = makePlayers(['A', 'B'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 4; });
        withData(sandbox, { players, gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        const html = sandbox.document.getElementById('live-action-skins').innerHTML;
        assert.ok(!/\$\d/.test(html), 'skins must not show any dollar figure while the carry chain is still unresolved');
        assert.ok(html.includes('not final yet') || html.includes('carrying'));
    });
});

describe('LIVE ACTION UI RENDERING', () => {
    test('the box stays hidden entirely for a genuinely no-bet round', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const players = makePlayers(['A', 'B'], [0, 0]);
        withData(sandbox, { players, gameFormat: 'stroke', courseData: [], scores: {} });
        sandbox.renderLiveActionSummary(players, players);
        assert.equal(sandbox.document.getElementById('live-action-box').style.display, 'none');
    });

    test('ACCEPTANCE TEST 2: a 4-bet round (Nassau + 2 Side Matches) renders all sections without throwing', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(18);
        const manny = { id: 101, name: 'Manny', hcp: '-2', team: 'Team 1', playingForMoney: true };
        const john = { id: 102, name: 'John', hcp: '5', team: 'Team 2', playingForMoney: true };
        const mike = { id: 103, name: 'Mike', hcp: '9', team: 'Team 1', playingForMoney: true };
        const steve = { id: 104, name: 'Steve', hcp: '14', team: 'Team 2', playingForMoney: true };
        const players = [manny, john, mike, steve];
        let scores = {};
        for (let h = 1; h <= 12; h++) { scores[`p101_h${h}`] = 4; scores[`p102_h${h}`] = 5; scores[`p103_h${h}`] = 4; scores[`p104_h${h}`] = 5; }
        const sideMatches = {
            sm1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], stake: 20, pressRule: 'none' },
            sm2: { format: 'match', scoring: 'net', teamAIds: ['101', '103'], teamBIds: ['102', '104'], stake: 10, pressRule: 'none' }
        };
        withData(sandbox, { players, gameFormat: 'nassau', nassauStake: 10, nassauPressRule: '2down', courseData: cd, scores, sideMatches });
        assert.doesNotThrow(() => sandbox.renderLiveActionSummary(players, players));
        assert.equal(sandbox.document.getElementById('live-action-box').style.display, 'block');
        assert.equal(sandbox.document.getElementById('live-action-sidematches').innerHTML.split('⚔️').length - 1, 2);
    });

    test('ACCEPTANCE TEST 4: a single simple 1v1 side bet with no main game stays minimal, no empty sections', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(9);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        players.forEach(p => p.playingForMoney = true);
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 4; scores[`p${players[1].id}_h${h.hole}`] = 5; });
        const sideMatches = { sm1: { format: 'match', scoring: 'net', teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)], stake: 20, pressRule: 'none' } };
        withData(sandbox, { players, gameFormat: 'stroke', sideMatches, courseData: cd, scores });
        sandbox.renderLiveActionSummary(players, players);
        assert.equal(sandbox.document.getElementById('live-action-press-ladder').innerHTML, '');
        assert.equal(sandbox.document.getElementById('live-action-skins').innerHTML, '');
        assert.equal(sandbox.document.getElementById('live-action-wolf').innerHTML, '');
        assert.equal(sandbox.document.getElementById('live-action-dots').innerHTML, '');
        assert.notEqual(sandbox.document.getElementById('live-action-sidematches').innerHTML, '');
    });

    test('renderLiveActionSummary never throws across every supported format, with and without side games', () => {
        const sandbox = loadHtmlInlineScript('index.html');
        const cd = makeCourseData(4);
        const p4 = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        p4.forEach(p => p.playingForMoney = true);
        p4[0].team = 'Team 1'; p4[1].team = 'Team 1'; p4[2].team = 'Team 2'; p4[3].team = 'Team 2';
        let scores4 = {}; cd.forEach(h => p4.forEach(p => scores4[`p${p.id}_h${h.hole}`] = 4));
        ['stroke', 'match', 'nassau', 'wolf', 'dots', 'skins', 'stableford'].forEach(fmt => {
            const wolfCalls = {}; cd.forEach(h => wolfCalls[`h${h.hole}`] = { call: 'lone', partnerId: null });
            withData(sandbox, {
                players: p4, gameFormat: fmt, courseData: cd, scores: scores4,
                matchStake: 50, nassauStake: 10, wolfCalls, wolfPointVal: 5, dotPointVal: 2, dots: {},
                skinsBuyIn: 2, birdieGameEnabled: true, birdieUnitVal: 3, kpGameEnabled: true, kpBuyIn: 2, kpWinners: {}
            });
            assert.doesNotThrow(() => sandbox.renderLiveActionSummary(p4, p4), `format ${fmt} must not throw`);
        });
    });
});
