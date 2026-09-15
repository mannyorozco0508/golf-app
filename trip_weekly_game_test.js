// ============================================================================
// THE TRIP SAYS WEEKLY GAME (Wave A, fix 2). trip.html only.
//
// TRIP_TOTAL_INCLUDES is the list the trip money card's sentence is built from
// ("Includes the main game, …, KPs and the Weekly Game."), and it still said
// 'the Main Pool' after v142/v143 renamed the pool everywhere else. The
// category is renamed; the pin that held the old name moves with it. The list
// is still held against every label the engine can emit (trip_money_truth_test):
// the engine's own ledger label is MAIN_POOL_LEDGER_LABEL = 'Main Pool'
// (action-model.js, protected, unchanged) and that label maps to this category.
//
// THE PROOF, v136-v143's way: trip_weekly_game_prev.fixture.json holds the
// tag-stripped text of the money card, the recap card and the share text on a
// two-round trip, captured at 71b8f6d. Today's text equals the old text with
// exactly ONE substitution - "the Main Pool." -> "the Weekly Game." - on each.
//
// THE RE-SCAN. trip.html with comments stripped - a scan that first eats a
// `//` line comment and only then a `/* */` block, so a `/*` inside a line
// comment (":1048 trips/*/tournaments/*") cannot swallow 800 lines the way a
// naive block-first strip does - names the pool nowhere else.
//
// The trip page loads its rounds with once('value'), which the harness stub
// resolves to null, so like every trip suite this one hands the linked rounds
// to the page and calls its renderers; the sentence itself is reached through
// the three surfaces that print it, never by calling its builder.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { linkedRounds, DEPS } = require('./helpers/trip-weekly-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const TRIP = read('trip.html');
const PREV = JSON.parse(read('trip_weekly_game_prev.fixture.json'));

// Comments out, left to right: an HTML comment, a string (kept), a line
// comment, a block comment - whichever starts first wins, so a `/*` inside a
// `//` comment is part of the line comment, and a `//` inside a string
// ("https://") is part of the string.
function stripComments(s) {
    return s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
}

function trip() {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    vm.runInContext(`tripData = { name: 'Myrtle Beach 2026' }; cachedRoundResults = ${JSON.stringify(linkedRounds())}; cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); openTripRecap();`, sb);
    return {
        money: strip(sb.document.getElementById('trip-money-settlement').innerHTML),
        recap: strip(sb.document.getElementById('trip-recap-card').innerHTML),
        share: String(vm.runInContext('buildShareRecapText()', sb)),
        list: JSON.parse(JSON.stringify(vm.runInContext('TRIP_TOTAL_INCLUDES', sb)))
    };
}

// ---------------------------------------------------------------------------
describe('THE LIST', () => {
    test('TRIP_TOTAL_INCLUDES names the Weekly Game and not the Main Pool; the other five categories are as they were', () => {
        const list = trip().list;
        assert.deepEqual(list, ['the main game', 'side games', 'side matches and presses', 'the Birdie Pool', 'KPs', 'the Weekly Game']);
    });
    test('the source literal is the pinned six (the runtime list is the literal, not a rewrite)', () => {
        assert.match(TRIP, /const TRIP_TOTAL_INCLUDES = \[\s*'the main game', 'side games', 'side matches and presses',\s*'the Birdie Pool', 'KPs', 'the Weekly Game'\s*\];/);
    });
});

// ---------------------------------------------------------------------------
describe('THE THREE SURFACES THAT PRINT THE SENTENCE', () => {
    const SENTENCE = 'Includes the main game, side games, side matches and presses, the Birdie Pool, KPs and the Weekly Game.';
    test('the money card, the recap card and the share text each carry the sentence once, and say Main Pool nowhere', () => {
        const t = trip();
        ['money', 'recap', 'share'].forEach(k => {
            assert.equal((t[k].match(/Includes [^.]*\./g) || []).length, 1, k + ' carries the sentence once');
            assert.ok(t[k].includes(SENTENCE), k + ': ' + (t[k].match(/Includes [^.]*\./) || [])[0]);
            assert.doesNotMatch(t[k], /Main Pool/i, k);
        });
        assert.ok(t.money.length > 500 && t.recap.length > 300 && t.share.length > 500, 'each surface rendered content');
    });
});

// ---------------------------------------------------------------------------
describe('THE PROOF - the old text with exactly one substitution IS the new text', () => {
    test('the previous capture is pinned (71b8f6d)', () => {
        assert.equal(PREV.capturedAt, '71b8f6d');
        assert.equal(sha(read('trip_weekly_game_prev.fixture.json')).slice(0, 8), 'd325b8a5');
        ['money', 'recap', 'share'].forEach(k => assert.equal((PREV[k].match(/the Main Pool\./g) || []).length, 1, k + ' said Main Pool once'));
    });
    ['money', 'recap', 'share'].forEach(k => test(k + ': today == old with "the Main Pool." -> "the Weekly Game.", nothing else', () => {
        assert.equal(trip()[k], PREV[k].replace('the Main Pool.', 'the Weekly Game.'));
    }));
});

// ---------------------------------------------------------------------------
describe('THE RE-SCAN - nothing else on trip.html names the pool the old way', () => {
    const code = stripComments(TRIP);
    test('the strip is sound: the list literal and the sentence builder survive it, and the 800-line comment trap did not fire', () => {
        assert.match(code, /const TRIP_TOTAL_INCLUDES = \[/, 'the literal is in the stripped source');
        assert.match(code, /function tripTotalScopeSentence\(\)/);
        assert.match(code, /function renderTripMoneySettlement\(\)/, 'the renderer, 800 lines after the :1048 comment, is still there');
        assert.ok(code.length > TRIP.length * 0.4, 'stripped ' + code.length + ' of ' + TRIP.length);
        assert.ok(!/trips\/\*\/tournaments\/\*/.test(code), 'the line comment holding /* was removed as a line comment');
    });
    test('no "Main Pool" outside comments, in any case; the one rendered name is Weekly Game', () => {
        assert.doesNotMatch(code, /main pool/i);
        assert.equal((code.match(/Weekly Game/g) || []).length, 1, 'the category, once');
    });
});
