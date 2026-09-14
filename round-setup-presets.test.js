const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile } = require('./helpers/load-script.js');
const { makePlayers } = require('./helpers/fixtures.js');

describe('admin.html — stake presets write the exact same field manual entry would', () => {
    const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js']);

    test('setStakePreset sets the input value directly — no new stored model', () => {
        sandbox.document.getElementById('nassau-stake-presets'); // ensure element exists in stub registry
        sandbox.event = { target: sandbox.document.getElementById('__fake_preset_btn') };
        sandbox.setStakePreset('nassau-stake', 5, 'nassau-stake-presets');
        assert.equal(sandbox.document.getElementById('nassau-stake').value, 5);
    });

    test('setSkinsPreset sets skins-buyin directly, same field skins.html already reads', () => {
        sandbox.event = { target: sandbox.document.getElementById('__fake_skins_btn') };
        sandbox.setSkinsPreset(2);
        assert.equal(sandbox.document.getElementById('skins-buyin').value, 2);
    });

    test('setSkinsCarrySetting writes true/false as a string into the exact field saveSettings() reads', () => {
        sandbox.setSkinsCarrySetting(true);
        assert.equal(sandbox.document.getElementById('skins-carryover').value, 'true');
        sandbox.setSkinsCarrySetting(false);
        assert.equal(sandbox.document.getElementById('skins-carryover').value, 'false');
    });

    // The press-rule explanation test that stood here drove updatePressRuleExplanation
    // against a <select> the page lost in de07a2f (2026-08-27). It kept passing
    // because mini-dom resolves any id; in a browser the same helper threw on every
    // reopen of every wizard-saved round (round_reopen_test.js). Helper, table and
    // call are gone; this pins that they stay gone.
    test('the legacy Nassau press-rule helper is gone with its control, and loadModeData no longer restores the retired editor', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, 'admin.html'), 'utf8').replace(/\/\/[^\n]*/g, '');
        assert.ok(!/updatePressRuleExplanation\(|function updatePressRuleExplanation|nassau-press-explanation/.test(src));
        assert.ok(!/getElementById\("nassau-(type|scoring|stake|press-rule)"\)\.value = data\./.test(src), 'no restore into a retired Nassau control');
        assert.equal(typeof sandbox.updatePressRuleExplanation, 'undefined');
    });
});

describe('index.html — renderLandingSummary (the player "first 10 seconds" summary)', () => {
    // currentData is a lexically-scoped `let` inside index.html's own script — not reachable
    // from outside the vm context directly. Running a second snippet in the SAME context (not
    // a new one) lets that snippet's plain assignment resolve to the existing binding, which is
    // exactly how the real page's own Firebase listener sets it — this is not a parallel
    // reimplementation, it's driving the real function with real-shaped input.
    const sandbox = loadHtmlInlineScript('index.html');

    function setCurrentDataAndRender(data, filteredPlayers, allPlayers) {
        sandbox.__currentDataForTest = data;
        sandbox.__filteredPlayersForTest = filteredPlayers;
        sandbox.__allPlayersForTest = allPlayers;
        vm.runInContext(
            'currentData = __currentDataForTest; renderLandingSummary(__filteredPlayersForTest, __allPlayersForTest);',
            sandbox
        );
    }

    test('REGRESSION: a no-bet Stroke Play round shows plain text, not a betting-styled box (Part 12)', () => {
        const players = makePlayers(['Manny', 'John', 'Mike', 'Steve'], [0, 0, 0, 0]);
        setCurrentDataAndRender({ gameFormat: 'stroke' }, players, players);
        const html = sandbox.document.getElementById('landing-active-games').innerHTML;
        assert.ok(html.includes('no bets'), 'a genuinely no-bet round should say so plainly');
        assert.ok(!html.includes('💵'), 'should not show any money-game iconography when nothing is enabled');
    });

    test('REGRESSION: a heavy-bet round (Nassau + Skins + side matches) lists every active game clearly (Part 13)', () => {
        const players = makePlayers(['Manny', 'John', 'Mike', 'Steve'], [-2, 5, 9, 14]);
        const data = {
            gameFormat: 'nassau', nassauStake: 10, nassauPressRule: '2down',
            skinsBuyIn: 2, skinsCarryOver: true, // note: skins isn't the main format here, just checking side fields don't leak in wrongly
            sideMatches: {
                sm1: { teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)] },
                sm2: { teamAIds: [String(players[0].id), String(players[2].id)], teamBIds: [String(players[1].id), String(players[3].id)] }
            }
        };
        setCurrentDataAndRender(data, players, players);
        const html = sandbox.document.getElementById('landing-active-games').innerHTML;
        assert.ok(html.includes('$10 Nassau'), 'should show the real configured stake');
        assert.ok(html.includes('Automatic press at 2 Down'), 'should explain the real press rule in plain language');
        assert.ok(html.includes('2 Side Bets'), 'should count both side matches involving this group');
    });

    test('a Skins round correctly shows buy-in and carry-over status', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        setCurrentDataAndRender({ gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true }, players, players);
        const html = sandbox.document.getElementById('landing-active-games').innerHTML;
        assert.ok(html.includes('$5 Skins'));
        assert.ok(html.includes('Carry Over'));
    });

    test('side match counting only includes matches this specific group is actually part of', () => {
        const groupPlayers = makePlayers(['Manny', 'John'], [0, 0]);
        const otherPlayers = makePlayers(['Mike', 'Steve'], [0, 0], 201); // distinct IDs from a different group
        const data = {
            gameFormat: 'stroke',
            sideMatches: {
                sm1: { teamAIds: [String(otherPlayers[0].id)], teamBIds: [String(otherPlayers[1].id)] } // not this group's match
            }
        };
        setCurrentDataAndRender(data, groupPlayers, groupPlayers.concat(otherPlayers));
        const html = sandbox.document.getElementById('landing-active-games').innerHTML;
        assert.ok(!html.includes('Side Bet'), 'a side match not involving this group should not be counted for them');
    });

    test('dismissing the summary sets a per-round localStorage flag, not a global one', () => {
        assert.ok(sandbox.document.getElementById('landing-group-names').innerHTML.includes("localStorage.setItem('landingDismissed_"),
            'the dismiss action should be scoped to the specific round code, not dismiss it for every round forever');
    });
});

describe('BACKWARD COMPATIBILITY — old rounds without the new Skins fields still work correctly', () => {
    const ix = loadHtmlInlineScript('index.html');

    // This block used to assert `(undefined) !== false === true` - a statement
    // about JavaScript, not about the page - under a claim that an absent flag
    // "defaults to Carry Over". It never did in the money: skinsCarriesOver()
    // (action-model.js) has always paid an absent flag as NO CARRY, and since
    // 431cf40 every surface asks it. The assertion below is about the page:
    // the resolver index.html actually loads, and what it answers.
    test('a round with no skinsCarryOver field at all is NO CARRY on index.html, the same answer the engine pays', () => {
        assert.equal(typeof ix.skinsCarriesOver, 'function', 'index.html loads the one resolver');
        assert.equal(ix.skinsCarriesOver(undefined), false, 'absent means no carry');
        assert.equal(ix.skinsCarriesOver(true), true, 'and an explicit true still carries');
        assert.ok(!/skinsCarryOver\s*!==\s*false/.test(require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8')),
            'index.html holds no private `!== false` answer to the carry question');
    });
});
