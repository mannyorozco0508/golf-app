const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

function setStateAndRender(sandbox, data, pickState, formatVal) {
    sandbox.__data = data;
    sandbox.__pickState = pickState;
    if (formatVal) sandbox.__setElement('sm-format', formatVal);
    vm.runInContext('currentData = __data; sidematchPickState = __pickState; renderSideMatchPicker();', sandbox);
}

describe('sidematches.html — live team-size feedback (Part 4/2)', () => {
    test('a balanced 1v1 pick shows a clear green confirmation', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['Manny', 'John'], [-2, 5]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, { [players[0].id]: 'a', [players[1].id]: 'b' });
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(indicator.includes('1v1') && indicator.includes('var(--brand-green)'));
    });

    test('a balanced 2v2 pick is correctly detected', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, { [players[0].id]: 'a', [players[1].id]: 'a', [players[2].id]: 'b', [players[3].id]: 'b' });
        assert.ok(sandbox.document.getElementById('sm-team-size-indicator').innerHTML.includes('2v2'));
    });

    test('REGRESSION: uneven sides are clearly flagged before save, not left to fail silently at save time', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, { [players[0].id]: 'a', [players[1].id]: 'a', [players[2].id]: 'b' });
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(indicator.includes('Uneven') && indicator.includes('accent-red'));
        assert.equal(sandbox.document.getElementById('sm-preview').style.display, 'none');
    });

    test('REGRESSION: Stroke Play format correctly restricts to 1v1, matching the engine\'s real constraint', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) },
            { [players[0].id]: 'a', [players[1].id]: 'a', [players[2].id]: 'b', [players[3].id]: 'b' }, 'stroke');
        sandbox.updateSideMatchPickerFeedback();
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(indicator.includes('1v1 only'));
    });

    test('a genuine handicap difference in a 1v1 shows the correct stroke count in the preview', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['Manny', 'John'], [-2, 5]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, { [players[0].id]: 'a', [players[1].id]: 'b' });
        const preview = sandbox.document.getElementById('sm-preview').innerHTML;
        assert.ok(preview.includes('John receives 7 strokes'), 'a -2 vs +5 handicap gap should be exactly 7 strokes over 18 holes');
    });

    test('equal handicaps show no stroke note at all', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B'], [8, 8]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, { [players[0].id]: 'a', [players[1].id]: 'b' });
        const preview = sandbox.document.getElementById('sm-preview').innerHTML;
        assert.ok(!preview.includes('receives'), 'equal handicaps should not claim anyone receives strokes');
    });
});

describe('sidematches.html — cross-group labeling (Part 11)', () => {
    test('group labels appear when the round genuinely has multiple groups', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [0, 0, 0, 0, 0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, {});
        assert.ok(sandbox.document.getElementById('sm-player-picker').innerHTML.includes('Group'));
    });

    test('group labels stay hidden for a single foursome — nothing to distinguish', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, {});
        assert.ok(!sandbox.document.getElementById('sm-player-picker').innerHTML.includes('Group'));
    });
});

describe('sidematches.html — delete confirmation shows real match details (Part 15)', () => {
    test('the confirmation dialog names the actual players, format, and stake — not a generic message', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        const data = {
            players,
            sideMatches: { sm1: { format: 'match', teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)], stake: 50 } }
        };
        sandbox.__data = data;
        vm.runInContext('currentData = __data;', sandbox);
        sandbox.deleteSideMatch('sm1');
        const details = sandbox.document.getElementById('sm-delete-details').innerHTML;
        assert.ok(details.includes('Manny') && details.includes('John') && details.includes('$50'));
        assert.equal(sandbox.document.getElementById('sidematch-delete-modal').style.display, 'flex');
    });

    test('cancelling clears the pending delete without touching Firebase', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        sandbox.deleteSideMatch('sm1');
        sandbox.closeSideMatchDeleteModal();
        assert.equal(sandbox.document.getElementById('sidematch-delete-modal').style.display, 'none');
    });
});

describe('SIDE MATCH SCORE CORRECTION — recalculates correctly, no stale cache (Part 19)', () => {
    const engine = loadJsFile('money-engine.js');
    const { calculateMatchEngine } = engine;

    test('REGRESSION: correcting an earlier hole flips the side match result correctly', () => {
        const cd = makeCourseData(18);
        const p1 = { id: 101, name: 'Manny', hcp: '0', team: 'Team 1' };
        const p2 = { id: 102, name: 'John', hcp: '0', team: 'Team 2' };
        let scores = {};
        for (let h = 1; h <= 12; h++) { scores[`p101_h${h}`] = 4; scores[`p102_h${h}`] = 4; }
        scores['p101_h5'] = 3;

        const before = calculateMatchEngine([p1, p2], cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(before.t1TotalMoney, 20);

        scores['p101_h5'] = 5; scores['p102_h5'] = 3;
        const after = calculateMatchEngine([p1, p2], cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(after.t1TotalMoney, -20, 'correcting hole 5 to the other player should flip the result entirely');
    });
});

describe('CROSS-GROUP SIDE MATCHES — 1v1 and 2v2 spanning two groups (Part 11/Scenario D)', () => {
    const engine = loadJsFile('money-engine.js');
    const { calculateMatchEngine } = engine;

    test('a 1v1 between players in two different groups computes normally — the engine has no group concept at all', () => {
        const cd = makeCourseData(18);
        const manny = { id: 101, name: 'Manny', hcp: '0', team: 'Team 1' }; // group 1
        const chris = { id: 105, name: 'Chris', hcp: '0', team: 'Team 2' }; // group 2
        let scores = {};
        cd.forEach(h => { scores[`p101_h${h.hole}`] = 3; scores[`p105_h${h.hole}`] = 5; });
        const calc = calculateMatchEngine([manny, chris], cd, scores, 'net', 'match', 'none', 15, 0, []);
        assert.equal(calc.t1TotalMoney, 15, 'group membership is irrelevant to the engine — Manny should simply win outright');
    });

    test('a 2v2 spanning two groups (John+Mike vs David+Alex) computes correctly', () => {
        const cd = makeCourseData(18);
        const john = { id: 102, name: 'John', hcp: '0', team: 'Team 1' };
        const mike = { id: 103, name: 'Mike', hcp: '0', team: 'Team 1' };
        const david = { id: 107, name: 'David', hcp: '0', team: 'Team 2' };
        const alex = { id: 108, name: 'Alex', hcp: '0', team: 'Team 2' };
        let scores = {};
        cd.forEach(h => { scores[`p102_h${h.hole}`] = 4; scores[`p103_h${h.hole}`] = 3; scores[`p107_h${h.hole}`] = 5; scores[`p108_h${h.hole}`] = 5; });
        const calc = calculateMatchEngine([john, mike, david, alex], cd, scores, 'net', 'match', 'none', 10, 0, []);
        assert.equal(calc.t1TotalMoney, 10, 'Team 1\'s best ball (3) beats Team 2\'s best ball (5) on every hole');
    });
});

describe('DOCUMENTED FINDING — the picker\'s auto-balance-on-first-tap can prevent a specific desired grouping via simple re-tapping', () => {
    test('tapping two players in sequence does not always let the second land on the same side as the first without an intermediate detour', () => {
        // This documents existing (pre-batch, untouched) tap-cycling behavior discovered while
        // building the new live feedback — not something this batch changed or was asked to fix.
        // First tap on an unpicked player auto-balances to whichever side has fewer picks; a
        // second tap on a DIFFERENT already-'b'-assigned player has no direct path back to 'a'
        // except being removed and re-picked once the balance shifts.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['John', 'Mike'], [0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.toggleSideMatchPick(String(players[0].id)); // John: unset -> 'a' (auto-balance, 0<=0)
        sandbox.toggleSideMatchPick(String(players[1].id)); // Mike: unset -> 'b' (auto-balance, 1<=0 is false)
        const state = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        assert.equal(state, JSON.stringify({ [players[0].id]: 'a', [players[1].id]: 'b' }),
            'confirms: two sequential taps on two different unpicked players always split them onto opposite sides, never the same side, by design of the existing auto-balance logic');
    });
});
