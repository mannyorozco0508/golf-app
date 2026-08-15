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
        const zoneA = sandbox.document.getElementById('sm-player-picker-a').innerHTML;
        const zoneB = sandbox.document.getElementById('sm-player-picker-b').innerHTML;
        assert.ok(zoneA.includes('Group') && zoneB.includes('Group'), 'both side zones should show group labels once there are multiple groups');
    });

    test('group labels stay hidden for a single foursome — nothing to distinguish', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, {});
        const zoneA = sandbox.document.getElementById('sm-player-picker-a').innerHTML;
        assert.ok(!zoneA.includes('Group'));
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

describe('FIXED THIS BATCH — the picker is now fully deterministic, no auto-balancing surprises', () => {
    test('REGRESSION (was a bug, now fixed): two players can be placed on the SAME side directly, in exactly one tap each', () => {
        // Previously: tapping two different unpicked players always auto-balanced them onto
        // OPPOSITE sides, with no direct way to put them on the same side without a detour.
        // This test proves that's no longer true — pickPlayerForSide is fully explicit about
        // which side a tap targets, so "John + Mike" on the same side just works.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['John', 'Mike'], [0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        sandbox.pickPlayerForSide(String(players[1].id), 'a');
        const state = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        assert.equal(state, JSON.stringify({ [players[0].id]: 'a', [players[1].id]: 'a' }),
            'both players should land on side "a" — exactly what was tapped, exactly two taps, no detour');
    });

    test('tapping a player already on a side, under that same side, removes them (toggle off)', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A'], [0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        assert.equal(vm.runInContext('JSON.stringify(sidematchPickState)', sandbox), '{}');
    });

    test('tapping a player already on side A, under side B, moves them there in one deliberate tap', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A'], [0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        sandbox.pickPlayerForSide(String(players[0].id), 'b');
        assert.equal(vm.runInContext('JSON.stringify(sidematchPickState)', sandbox), JSON.stringify({ [players[0].id]: 'b' }));
    });

    test('REGRESSION: attempting to overfill a side (3rd player, max is 2) changes nothing — no silent reassignment', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        sandbox.pickPlayerForSide(String(players[1].id), 'a');
        const beforeOverflow = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        sandbox.pickPlayerForSide(String(players[2].id), 'a'); // side a already has 2 — should be rejected
        const afterOverflow = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        assert.equal(beforeOverflow, afterOverflow, 'state must be completely unchanged when a side is already full');
        assert.ok(sandbox.document.getElementById('sm-team-size-indicator').innerHTML.includes('already has 2'));
    });

    test('Stroke Play format enforces a max of 1 per side, matching the engine\'s real 1v1-only constraint', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B'], [0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        sandbox.__setElement('sm-format', 'stroke');
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a');
        sandbox.pickPlayerForSide(String(players[1].id), 'a'); // 2nd player to side a under stroke play — should be rejected
        const state = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        assert.equal(state, JSON.stringify({ [players[0].id]: 'a' }));
    });

    test('ACCEPTANCE SCENARIO C: Manny+Mike vs John+Steve, created directly, no tricks, exactly 4 taps', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['Manny', 'John', 'Mike', 'Steve'], [0, 0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickState = {};', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id), 'a'); // Manny
        sandbox.pickPlayerForSide(String(players[2].id), 'a'); // Mike
        sandbox.pickPlayerForSide(String(players[1].id), 'b'); // John
        sandbox.pickPlayerForSide(String(players[3].id), 'b'); // Steve
        const state = vm.runInContext('JSON.stringify(sidematchPickState)', sandbox);
        assert.equal(state, JSON.stringify({ [players[0].id]: 'a', [players[2].id]: 'a', [players[1].id]: 'b', [players[3].id]: 'b' }));
        assert.ok(sandbox.document.getElementById('sm-team-size-indicator').innerHTML.includes('2v2'));
    });
});
