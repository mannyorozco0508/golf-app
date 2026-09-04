// ============================================================================
// ROUND SETUP — a stake belongs to the round only if the round plays that game
//
// saveSettings() read #skins-buyin unconditionally. The Step 4 Skins box only
// HIDES when the format is not Skins; it does not clear. So the ordinary path of
//
//     choose Skins -> set $5 -> Back -> switch to Stroke Play -> save
//
// stored gameFormat 'stroke' WITH skinsBuyIn 5. getRoundGames() yields no skins
// game and settlement pays nothing for it, while roundHasSkinsGame() answers true
// off that raw field. That is the leftover the Bets tab now has to explain.
//
// The rule is extracted into a named function rather than left inline, because a
// rule buried in a 400-line save routine cannot be tested and this one is about
// money entering the database.
//
// SECOND FIELD, OPPOSITE PROBLEM. skinsPotFormat is the Gross / Net / Split
// choice, and the wizard never wrote it at all - skins.html was the only surface
// in the app that could set it. It now belongs in setup alongside buy-in and
// carry.
//
// ITS DEFAULT IS LOAD-BEARING. A wizard round today carries no skinsPotFormat,
// and BOTH settlement (computeSkinsSettlementNet) and the Bets tab fall back to
// 'split'. Any other default would silently change what every new Skins round
// pays. DEFAULT_MATCHES_TODAYS_FALLBACK pins that.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const sandbox = loadHtmlInlineScript('admin.html', ['course-data.js']);
const src = () => fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

describe('admin.html — the Skins buy-in follows the format', () => {

    test('a Skins round saves the buy-in that was typed', () => {
        assert.equal(sandbox.skinsBuyInForSave('skins', '5'), 5);
        assert.equal(sandbox.skinsBuyInForSave('skins', '0'), 0);
    });

    // THE FIX. Shipped behaviour stores 5 here.
    test('LEFTOVER_IS_NOT_SAVED: a non-Skins round saves no buy-in', () => {
        assert.equal(sandbox.skinsBuyInForSave('stroke', '5'), 0,
            'A stroke round must not carry a Skins buy-in attached to no game.');
        assert.equal(sandbox.skinsBuyInForSave('nassau', '20'), 0);
        assert.equal(sandbox.skinsBuyInForSave('wolf', '2'), 0);
    });

    test('junk in the field is money out of the database', () => {
        assert.equal(sandbox.skinsBuyInForSave('skins', ''), 0);
        assert.equal(sandbox.skinsBuyInForSave('skins', 'abc'), 0);
        // Firebase rules require a NUMBER in [0, 100000]; NaN would be rejected
        // outright and the whole round save would fail with PERMISSION_DENIED.
        assert.equal(typeof sandbox.skinsBuyInForSave('skins', 'abc'), 'number');
        assert.ok(!Number.isNaN(sandbox.skinsBuyInForSave('skins', undefined)));
    });
});

describe('admin.html — Pot Format moves into setup', () => {

    test('the chosen mode is saved', () => {
        assert.equal(sandbox.skinsPotFormatForSave('skins', 'gross'), 'gross');
        assert.equal(sandbox.skinsPotFormatForSave('skins', 'net'), 'net');
        assert.equal(sandbox.skinsPotFormatForSave('skins', 'split'), 'split');
    });

    test('DEFAULT_MATCHES_TODAYS_FALLBACK: an unset control still means split', () => {
        // Both settlement and skins.html read (skinsPotFormat || 'split'). If this
        // returned 'gross', every new Skins round would quietly stop paying net.
        assert.equal(sandbox.skinsPotFormatForSave('skins', ''), 'split');
        assert.equal(sandbox.skinsPotFormatForSave('skins', undefined), 'split');
        assert.equal(sandbox.skinsPotFormatForSave('skins', 'nonsense'), 'split',
            'An unrecognised value must land on the historical default, not pass through.');
    });

    test('a non-Skins round saves no pot format at all', () => {
        assert.equal(sandbox.skinsPotFormatForSave('stroke', 'gross'), null,
            'Writing a pot format for a round with no Skins game is the same leak again.');
    });
});

describe('admin.html — the rules are wired into the save, not just defined', () => {

    test('saveSettings uses the helpers rather than reading the field raw', () => {
        const s = src();
        assert.match(s, /skinsBuyIn = skinsBuyInForSave\(/,
            'saveSettings must go through the rule.');
        assert.match(s, /skinsPotFormat = skinsPotFormatForSave\(/);
        // The exact shipped line that caused this. If it comes back, so does the bug.
        assert.doesNotMatch(s, /const skinsBuyIn = document\.getElementById\("skins-buyin"\) \? \(parseFloat/,
            'The unconditional read must be gone, not merely bypassed.');
    });

    test('the pot format control lives inside the Skins-only box', () => {
        // #skins-settings is shown only when the format is Skins. A control placed
        // outside it would be offered on every round, which is how this started.
        const s = src();
        const box = s.indexOf('id="skins-settings"');
        const ctrl = s.indexOf('id="skins-pot-format"');
        const end = s.indexOf('id="skins-carry-explanation"');
        assert.ok(box > -1 && ctrl > -1 && end > -1, 'all three anchors must exist');
        assert.ok(ctrl > box && ctrl < end,
            'The pot format control must sit inside the Skins-only settings box.');
    });

    test('the saved field is the one settlement reads', () => {
        // resolveSkinsMode() recognises exactly these three. A fourth value would
        // fall through to 'split' and quietly ignore the golfer's choice.
        const s = src();
        ['split', 'gross', 'net'].forEach(v => {
            assert.ok(s.includes('value="' + v + '"'),
                'the control must offer ' + v);
        });
    });
});
