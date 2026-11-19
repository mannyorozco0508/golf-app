// ============================================================================
// JUST SAY IT on the homepage, layout A (Manny's pick, OK 2026-11-19 03:01 relayed ADVISOR-20261119-0302; the
// mockups ADVISOR-20261119-0241). "Just say it. We'll set it up." / "No menus. Type or say your game and HardPan
// builds it." after the band See how our tournaments work (2026-11-19 homepage A, Manny's pick; it sat after the comparison block before): a phone where the line types itself and the card appears, the next line, and
// four chips. Each card is jsi-cards.json, the app's own parser output (ask-hardpan.js askParse, sha 192bc1fde664) for
// golfers Sam (you), Josh, Bob and Paul, four lines it sets up completely ("for fun": no amount). When the parser is on
// this Mac (an app checkout), test 1 re-runs it and holds the cards to it.
// BASELINE against main c8a3c3e7: 0 / 4 (no section, no jsi-cards.json).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => { const p = path.join(REPO_ROOT, f); assert.ok(fs.existsSync(p), f + ' exists'); return fs.readFileSync(p, 'utf8'); };
const sectionOf = (h) => (String(h).match(/<section class="jsi" id="just-say-it"[\s\S]*?<\/section>\s*<script data-jsi>window\.JSI_CARDS = [\s\S]*?<\/script>\s*<script data-jsi>[\s\S]*?<\/script>/) || [''])[0];
const textOf = (h) => String(h).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// RE-PINNED 2026-11-19 (Manny 8:58 AM via ADVISOR-20261119-0905: skins default to no carryover): five cards. Plain
// skins first, carryover Off (the parser's own default); one card keeps "with carryovers" to show it can be on.
test('1 the five cards are the parser\'s: complete, no amount, and - when the parser is on this Mac - what it builds today', () => {
    const J = JSON.parse(read('jsi-cards.json'));
    assert.equal(J.cards.length, 5);
    assert.deepEqual(J.cards[0].lines.find((l) => l[0] === 'Carry over'), ['Carry over', 'Off'], 'plain skins: no carryover');
    assert.deepEqual(J.cards[4].lines.find((l) => l[0] === 'Carry over'), ['Carry over', 'On'], 'the carryovers example');
    J.cards.forEach((c) => {
        assert.ok(c.lines.some((l) => l[0] === 'Amount' && l[1] === 'No amount'), c.text);
        assert.ok(!c.lines.some((l) => /Tap to choose/.test(l[1])), c.text);
    });
    const parser = path.join(os.homedir(), 'golf-app-210-hr', 'ask-hardpan.js');
    if (!fs.existsSync(parser)) return;
    const A = require(parser);
    const ctx = { players: [{ id: '101', name: 'Sam' }, { id: '102', name: 'Josh' }, { id: '103', name: 'Bob' }, { id: '104', name: 'Paul' }], meId: '101', holes: Array.from({ length: 18 }, (_, i) => i + 1) };
    J.cards.forEach((c) => {
        const r = A.askParse(c.text, ctx);
        assert.equal(r.kind, 'game'); assert.deepEqual(r.missing, []);
        assert.equal(A.titleOf(r.bet), c.title);
        assert.deepEqual(A.linesOf(r.bet, r.missing, ctx, r).map((l) => [l.label, l.value]), c.lines, c.text);
    });
});
test('2 the homepage: the section after the band See how our tournaments work and before How you\'ll use it (homepage A), the heading and sub line, the looping phone, five chips, the cards as data', () => {
    const h = read('hardpan-home.html');
    const s = sectionOf(h);
    assert.ok(s.length > 1000, 'the section');
    // Re-pinned 2026-11-19 homepage A (Manny's pick): the section moved, unchanged, from after the comparison block to right after
    // the band "See how our tournaments work"; the comparison block now follows the feature rows (home_layout_a_test.js holds the whole order).
    assert.ok(h.indexOf('<section class="seeband" id="see-it"') > 0 && h.indexOf('<section class="seeband" id="see-it"') < h.indexOf('id="just-say-it"') && h.indexOf('id="just-say-it"') < h.indexOf('<section class="how" id="how"'), 'its place');
    assert.ok(h.indexOf('<section class="how" id="how"') < h.indexOf('<section class="wrap cmp" id="compare"'), 'the comparison block is below it now');
    assert.match(s, /<h2 id="jsi-h">Just say it\. We&rsquo;ll set it up\.<\/h2><p>No menus\. Type or say your game and HardPan builds it\.<\/p>/);
    assert.match(s, /<div class="jsi-say" id="jsi-say">/);
    assert.equal((s.match(/<button type="button" class="jsi-chip[ "]/g) || []).length, 5);
    assert.match(s, /<b>Off<\/b>/, 'the first card, drawn before the script runs, says no carryover');
    assert.deepEqual(JSON.parse(/window\.JSI_CARDS = (\[[\s\S]*?\]);<\/script>/.exec(s)[1]), JSON.parse(read('jsi-cards.json')).cards);
    assert.match(s, /prefers-reduced-motion: reduce/, 'the loop stops for reduced motion');
});
test('3 no money figure, no betting or cash word, no competitor, no "Coming soon" in the section', () => {
    const t = textOf(sectionOf(read('hardpan-home.html')));
    assert.ok(t.length > 100);
    assert.ok(!/\$\s?\d|\b(bet|bets|wager\w*|gambl\w*|pool|pot|cash|venmo|paypal|stake)\b/i.test(t));
    assert.ok(!/18birdies|golfshot|hole19|thegrint|swingu/i.test(sectionOf(read('hardpan-home.html'))));
    assert.ok(!/coming soon/i.test(t));
});
test('4 the mockup files did not ship', () => {
    ['home-jsi-a.html', 'home-jsi-b.html', 'home-jsi-c.html', 'see-it-jsi.html'].forEach((f) => assert.ok(!fs.existsSync(path.join(REPO_ROOT, f)), f));
});
