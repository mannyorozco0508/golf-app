const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

// pickState is an ORDERED ARRAY of ids now: the first half of the taps is one side,
// the second half the other. It replaced { id: 'a' | 'b' }, which cannot express order
// at all - and Object.keys returns integer-like keys ascending regardless of insertion,
// so the old shape could not even be read back in tap order.
function setStateAndRender(sandbox, data, pickState, formatVal) {
    sandbox.__data = data;
    sandbox.__pickState = pickState;
    if (formatVal) sandbox.__setElement('sm-format', formatVal);
    vm.runInContext('currentData = __data; sidematchPickOrder = __pickState; renderSideMatchPicker();', sandbox);
}

describe('sidematches.html — live team-size feedback (Part 4/2)', () => {
    test('a balanced 1v1 pick shows a clear green confirmation', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['Manny', 'John'], [-2, 5]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, [String(players[0].id), String(players[1].id)]);
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        // RE-PINNED TO THE PAIRING LINE. The indicator said "1v1" with the names in a
        // separate preview box; it reads "Manny vs John" now, which is the line that
        // replaced the Side 1 / Side 2 headings. Naming both golfers is strictly more
        // than "1v1" said.
        assert.ok(indicator.includes('Manny') && indicator.includes('John')
            && indicator.includes('vs') && indicator.includes('var(--brand-green)'));
    });

    test('a balanced 2v2 pick is correctly detected', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, [String(players[0].id), String(players[1].id), String(players[2].id), String(players[3].id)]);
        const line2 = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(['A', 'B', 'C', 'D'].every(n => line2.includes(n)) && line2.includes('vs'),
            'a 2v2 must read as both pairs, not as the string "2v2"');
    });

    test('REGRESSION: uneven sides are clearly flagged before save, not left to fail silently at save time', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, [String(players[0].id), String(players[1].id), String(players[2].id)]);
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        // The wording moved with the model: three taps is an INCOMPLETE 2v2, and the
        // line shows the pairing so far plus what is missing rather than the bare word
        // "Uneven". Still red, still refuses, still hides the preview.
        assert.ok(indicator.includes('tap one more') && indicator.includes('accent-red'));
        assert.equal(sandbox.document.getElementById('sm-preview').style.display, 'none');
    });

    test('Stroke Play now accepts 2v2 — the engine constraint that forced 1v1 is fixed', () => {
        // This used to assert "1v1 only". That restriction existed because the settlement
        // engine's stroke branch took teamAPlayers[0] and teamBPlayers[0], so a 2v2 would
        // have settled two golfers and silently dropped the other two. The engine now
        // takes the whole side and scores it best ball, so the restriction is gone.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) },
            [String(players[0].id), String(players[1].id),
             String(players[2].id), String(players[3].id)], 'stroke');
        sandbox.updateSideMatchPickerFeedback();
        const indicator = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(!indicator.includes('1v1 only'), 'the restriction should be gone');
        // RE-PINNED: the line names both pairs instead of saying "2v2". Asserting the
        // four names is strictly more than the size label was.
        assert.ok(['A', 'B', 'C', 'D'].every(n => indicator.includes(n)) && indicator.includes('vs'),
            `expected a 2v2 pairing line, got: ${indicator}`);
    });

    test('a genuine handicap difference in a 1v1 shows the correct stroke count in the preview', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['Manny', 'John'], [-2, 5]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, [String(players[0].id), String(players[1].id)]);
        const preview = sandbox.document.getElementById('sm-preview').innerHTML;
        assert.ok(preview.includes('John receives 7 strokes'), 'a -2 vs +5 handicap gap should be exactly 7 strokes over 18 holes');
    });

    test('equal handicaps show no stroke note at all', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B'], [8, 8]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, [String(players[0].id), String(players[1].id)]);
        const preview = sandbox.document.getElementById('sm-preview').innerHTML;
        assert.ok(!preview.includes('receives'), 'equal handicaps should not claim anyone receives strokes');
    });
});

describe('sidematches.html — cross-group labeling (Part 11)', () => {
    test('group labels appear when the round genuinely has multiple groups', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [0, 0, 0, 0, 0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, []);
        // ONE ROSTER NOW. This read both side zones; there is one list, so the label has
        // to be on it - and each golfer appears exactly once, which is the point of the
        // change and is asserted here rather than assumed.
        const roster = sandbox.document.getElementById('sm-player-picker-a').innerHTML;
        assert.ok(roster.includes('Group'), 'the single roster must show group labels once there are multiple groups');
        assert.equal((roster.match(/player-pick-badge/g) || []).length, players.length,
            'every golfer appears exactly once - the roster is not listed twice');
    });

    test('group labels stay hidden for a single foursome — nothing to distinguish', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        setStateAndRender(sandbox, { players, courseData: makeCourseData(18) }, []);
        const roster = sandbox.document.getElementById('sm-player-picker-a').innerHTML;
        assert.ok(!roster.includes('Group'));
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
    test('two taps build a 1v1 in tap order, first tapped against second', () => {
        // REWRITTEN FOR THE ORDERED PICKER, not weakened. The old assertion was that a
        // tap is explicit about WHICH SIDE it targets, because the picker before it
        // auto-balanced. There are no sides to target now: the order is the model, and
        // what has to be deterministic is that two taps produce first-vs-second and
        // nothing else. Same property - no surprise placement - stated in the new terms.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['John', 'Mike'], [0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id));
        sandbox.pickPlayerForSide(String(players[1].id));
        const state = vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox);
        assert.equal(state, JSON.stringify([String(players[0].id), String(players[1].id)]),
            'the order is exactly what was tapped, in the order it was tapped');
        const sides = vm.runInContext('JSON.stringify(sidematchSides())', sandbox);
        assert.equal(sides, JSON.stringify({ teamAIds: [String(players[0].id)],
                                             teamBIds: [String(players[1].id)] }),
            'first tap is one side, second is the other');
    });

    test('tapping a chosen golfer again removes them', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A'], [0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id));
        sandbox.pickPlayerForSide(String(players[0].id));
        assert.equal(vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox), '[]');
    });

    test('a removed golfer leaves no gap — everyone after them shifts up', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        // REPLACES "moves them to the other side in one tap". There are no sides to
        // move between; a second tap removes. What has to hold instead is that removing
        // somebody from the MIDDLE closes the gap, or the numbers on the badges would
        // stop matching the sides they produce.
        sandbox.pickPlayerForSide(String(players[0].id));
        sandbox.pickPlayerForSide(String(players[1].id));
        sandbox.pickPlayerForSide(String(players[2].id));
        sandbox.pickPlayerForSide(String(players[1].id)); // take the middle one back out
        assert.equal(vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox),
            JSON.stringify([String(players[0].id), String(players[2].id)]),
            'the third tap moves up into second place');
    });

    test('REGRESSION: a fifth tap changes nothing — no silent reassignment', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B', 'C', 'D', 'E'], [0, 0, 0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        // THE CAP MOVED WITH THE MODEL. It was two PER SIDE, checked when a zone was
        // tapped; it is four IN TOTAL now, because the sides are derived from the order.
        // Same supported shape - 1v1 or 2v2, never three a side - refused at the same
        // moment, with the reason still on screen and nothing silently reassigned.
        [0, 1, 2, 3].forEach(i => sandbox.pickPlayerForSide(String(players[i].id)));
        const beforeOverflow = vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox);
        sandbox.pickPlayerForSide(String(players[4].id)); // a fifth — must be rejected
        const afterOverflow = vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox);
        assert.equal(beforeOverflow, afterOverflow, 'the order must be completely unchanged when four are already picked');
        assert.ok(sandbox.document.getElementById('sm-team-size-indicator').innerHTML.includes('four golfers already'));
    });

    test('Stroke Play now takes 2 per side, the same as every other match format', () => {
        // Four taps, first two against last two - which is the 2v2 the engine scores
        // best ball. The old version tapped twice into one zone; there is no zone now.
        // REVERSED DELIBERATELY. This used to assert a max of one golfer per side for
        // Stroke Play, described as "the engine's real 1v1-only constraint". That
        // stopped being true when settlement-engine.js learned to score a whole stroke
        // side best ball, and the cap was never a guard anyway - it lived in the picker
        // only, so a format switch walked past it. Stroke Play is 1v1 or 2v2 now, and
        // the picker says so.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        sandbox.__setElement('sm-format', 'stroke');
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        [0, 1, 2, 3].forEach(i => sandbox.pickPlayerForSide(String(players[i].id)));
        const sides = vm.runInContext('JSON.stringify(sidematchSides())', sandbox);
        assert.equal(sides, JSON.stringify({
            teamAIds: [String(players[0].id), String(players[1].id)],
            teamBIds: [String(players[2].id), String(players[3].id)] }),
            'a second golfer must be accepted on a Stroke Play side');
    });

    test('Stroke Play still refuses a fifth golfer', () => {
        // The cap moved, it did not disappear. 1v1 or 2v2 is the supported shape for
        // every format; three a side has never settled and still must not be buildable.
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['A', 'B', 'C', 'D', 'E'], [0, 0, 0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        sandbox.__setElement('sm-format', 'stroke');
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        [0, 1, 2, 3].forEach(i => sandbox.pickPlayerForSide(String(players[i].id)));
        const before = vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox);
        sandbox.pickPlayerForSide(String(players[4].id));
        assert.equal(vm.runInContext('JSON.stringify(sidematchPickOrder)', sandbox), before,
            'the order must be unchanged once four are picked, on Stroke Play too');
        assert.ok(sandbox.document.getElementById('sm-team-size-indicator').innerHTML.includes('four golfers already'));
    });

    test('ACCEPTANCE SCENARIO C: Manny+Mike vs John+Steve, created directly, no tricks, exactly 4 taps', () => {
        const sandbox = loadHtmlInlineScript('sidematches.html');
        const players = require('./helpers/fixtures.js').makePlayers(['Manny', 'John', 'Mike', 'Steve'], [0, 0, 0, 0]);
        sandbox.__data = { players, courseData: makeCourseData(18) };
        vm.runInContext('currentData = __data; sidematchPickOrder = [];', sandbox);
        sandbox.pickPlayerForSide(String(players[0].id)); // Manny
        sandbox.pickPlayerForSide(String(players[2].id)); // Mike
        sandbox.pickPlayerForSide(String(players[1].id)); // John
        sandbox.pickPlayerForSide(String(players[3].id)); // Steve
        const state = vm.runInContext('JSON.stringify(sidematchSides())', sandbox);
        // Manny + Mike tapped first, John + Steve second - the same four taps, and the
        // same two sides, without ever choosing a colour. Ids are ascending within a
        // side because that is the byte order the old screen wrote.
        const asc = (x, y) => Number(x) - Number(y);
        assert.equal(state, JSON.stringify({
            teamAIds: [String(players[0].id), String(players[2].id)].sort(asc),
            teamBIds: [String(players[1].id), String(players[3].id)].sort(asc) }));
        // And the line a golfer actually reads says the same thing in words.
        const line = sandbox.document.getElementById('sm-team-size-indicator').innerHTML;
        assert.ok(['Manny', 'Mike', 'John', 'Steve'].every(n => line.includes(n))
            && line.includes('vs'), `expected the pairing in words, got: ${line}`);
    });
});
