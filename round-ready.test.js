const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

describe('admin.html — Round Ready summary generation (Part 4)', () => {
    const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);

    // BEHAVIOUR CHANGE (Scoring vs Action, phase 1): Round Ready now answers the two
    // questions a golfer actually asks, in order - how are we scoring, and what's the
    // money. The old #rr-main-game / #rr-skins / #rr-sidebets boxes are replaced by
    // #rr-scoring (always shown) and #rr-action (a list). A plain Stroke Play round used
    // to render NOTHING here; it now states the scoring format and says so explicitly.
    test('ACCEPTANCE SCENARIO A: a real Nassau + Skins + side bets round renders the exact correct summary', () => {
        const data = {
            eventName: 'Saturday Game', courseName: 'Gold Mountain',
            players: [{ name: 'Manny', hcp: '+2' }, { name: 'John', hcp: '5' }, { name: 'Mike', hcp: '9' }, { name: 'Steve', hcp: '14' }],
            gameFormat: 'nassau', nassauStake: 10, nassauPressRule: '2down',
            sideMatches: { sm1: {}, sm2: {} }
        };
        sandbox.renderRoundReady(data);
        assert.equal(sandbox.document.getElementById('rr-course-sub').textContent, 'Saturday Game — Gold Mountain');
        assert.ok(sandbox.document.getElementById('rr-players-list').innerHTML.includes('Manny'));
        // Nassau is BOTH: it organises the scoring and carries the wager. It honestly
        // appears in both lists rather than being forced into one.
        assert.equal(sandbox.document.getElementById('rr-scoring-text').textContent, 'Nassau');
        const action = sandbox.document.getElementById('rr-action-text').innerHTML;
        assert.ok(action.includes('$10 Nassau — Automatic press at 2 Down'), action);
        assert.ok(action.includes('2 Side Bets'), action);
        assert.equal(sandbox.document.getElementById('rr-action-box').style.display, 'block');
    });

    test('REGRESSION: a genuinely no-bet round (Stroke Play, nothing else) says so instead of showing money boxes', () => {
        sandbox.renderRoundReady({ eventName: 'Quick Round', courseName: 'Test Course', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke' });
        // Stroke Play carries no inherent wager, so the Action list must be empty - but the
        // golfer is told that explicitly rather than shown a blank screen.
        assert.equal(sandbox.document.getElementById('rr-action-box').style.display, 'none');
        assert.equal(sandbox.document.getElementById('rr-noaction-box').style.display, 'block');
        assert.equal(sandbox.document.getElementById('rr-scoring-text').textContent, 'Stroke Play');
    });

    test('a Skins round states its buy-in and carry status in the Action list', () => {
        sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', players: [{ name: 'A', hcp: '0' }], gameFormat: 'skins', skinsBuyIn: 2, skinsCarryOver: true });
        assert.equal(sandbox.document.getElementById('rr-scoring-text').textContent, 'Skins');
        const skinsAction = sandbox.document.getElementById('rr-action-text').innerHTML;
        assert.ok(skinsAction.includes('$2 Skins — Carry Over'), skinsAction);
        // Exactly one Skins line: the main format must not also be counted as a stacked game.
        assert.equal((skinsAction.match(/Skins/g) || []).length, 1, skinsAction);
    });

    test('zero side matches produces no Side Bets line, rather than "0 active"', () => {
        sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke', sideMatches: {} });
        assert.ok(!sandbox.document.getElementById('rr-action-text').innerHTML.includes('Side Bet'));
    });
});

describe('BACKWARD COMPATIBILITY — Round Ready on data from before this batch existed', () => {
    const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);

    test('a round with no skinsBuyIn/skinsCarryOver fields at all still renders correctly for Skins format', () => {
        // Simulates a round saved before the Skins setup fields existed in the wizard at all.
        const oldData = { eventName: 'Old Round', courseName: 'Old Course', players: [{ name: 'A', hcp: '0' }], gameFormat: 'skins' };
        assert.doesNotThrow(() => sandbox.renderRoundReady(oldData));
        assert.ok(sandbox.document.getElementById('rr-action-text').innerHTML.includes('$0 Skins — Carry Over'),
            'should fall back to the same defaults skins.html itself already establishes');
    });

    test('a round with no sideMatches field at all (predates Side Matches) renders without throwing', () => {
        const oldData = { eventName: 'Ancient Round', courseName: 'X', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke' };
        assert.doesNotThrow(() => sandbox.renderRoundReady(oldData));
        assert.ok(!sandbox.document.getElementById('rr-action-text').innerHTML.includes('Side Bet'));
    });

    test('a round with no players array at all renders a graceful empty state, not a crash', () => {
        assert.doesNotThrow(() => sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', gameFormat: 'stroke' }));
    });
});
