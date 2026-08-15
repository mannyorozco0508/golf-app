const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

describe('admin.html — Round Ready summary generation (Part 4)', () => {
    const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js']);

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
        assert.equal(sandbox.document.getElementById('rr-main-game-text').textContent, '$10 Nassau — Automatic press at 2 Down');
        assert.equal(sandbox.document.getElementById('rr-sidebets-text').textContent, '2 active');
    });

    test('REGRESSION: a genuinely no-bet round (Stroke Play, nothing else) hides every betting box entirely', () => {
        sandbox.renderRoundReady({ eventName: 'Quick Round', courseName: 'Test Course', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke' });
        assert.equal(sandbox.document.getElementById('rr-main-game-box').style.display, 'none');
        assert.equal(sandbox.document.getElementById('rr-skins-box').style.display, 'none');
        assert.equal(sandbox.document.getElementById('rr-sidebets-box').style.display, 'none');
    });

    test('a Skins round shows the Skins box with real buy-in and carry status, separate from the main-game box', () => {
        sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', players: [{ name: 'A', hcp: '0' }], gameFormat: 'skins', skinsBuyIn: 2, skinsCarryOver: true });
        assert.equal(sandbox.document.getElementById('rr-skins-box').style.display, 'block');
        assert.equal(sandbox.document.getElementById('rr-skins-text').textContent, '$2 — Carry Over');
        assert.equal(sandbox.document.getElementById('rr-main-game-box').style.display, 'none', 'skins should not also populate the generic main-game box');
    });

    test('zero side matches keeps the Side Bets box hidden entirely, not shown with "0 active"', () => {
        sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke', sideMatches: {} });
        assert.equal(sandbox.document.getElementById('rr-sidebets-box').style.display, 'none');
    });
});

describe('BACKWARD COMPATIBILITY — Round Ready on data from before this batch existed', () => {
    const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js']);

    test('a round with no skinsBuyIn/skinsCarryOver fields at all still renders correctly for Skins format', () => {
        // Simulates a round saved before the Skins setup fields existed in the wizard at all.
        const oldData = { eventName: 'Old Round', courseName: 'Old Course', players: [{ name: 'A', hcp: '0' }], gameFormat: 'skins' };
        assert.doesNotThrow(() => sandbox.renderRoundReady(oldData));
        assert.equal(sandbox.document.getElementById('rr-skins-text').textContent, '$0 — Carry Over', 'should fall back to the same defaults skins.html itself already establishes');
    });

    test('a round with no sideMatches field at all (predates Side Matches) renders without throwing', () => {
        const oldData = { eventName: 'Ancient Round', courseName: 'X', players: [{ name: 'A', hcp: '0' }], gameFormat: 'stroke' };
        assert.doesNotThrow(() => sandbox.renderRoundReady(oldData));
        assert.equal(sandbox.document.getElementById('rr-sidebets-box').style.display, 'none');
    });

    test('a round with no players array at all renders a graceful empty state, not a crash', () => {
        assert.doesNotThrow(() => sandbox.renderRoundReady({ eventName: 'X', courseName: 'Y', gameFormat: 'stroke' }));
    });
});
