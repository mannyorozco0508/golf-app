// ============================================================================
// JUST SAY IT, MOCKUPS (ADVISOR-20261119-0241, Manny 2:40 AM: "Just type in the game and it'll be set up"):
// home-jsi-a.html (a looping demo), home-jsi-b.html (a before / after pair), home-jsi-c.html (a big Try it box), and
// see-it-jsi.html (the showcase's Everyday part). Each card shown is jsi-cards.json, which is the app's own parser
// output (ask-hardpan.js askParse, sha 192bc1fde664) for golfers Sam (you), Josh, Bob and Paul. When that parser is on
// this Mac (an iOS / Android checkout), test 1 re-runs it and holds the cards to it.
// Held: no money figure, no bet / pool / wager / gamble / cash word, no competitor; the four lines set up completely
// (nothing left to choose); each mockup carries the same four cards.
// BASELINE against main 7c44310e: none of these files exist there, 0 / 4.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => { const p = path.join(REPO_ROOT, f); assert.ok(fs.existsSync(p), f + ' exists'); return fs.readFileSync(p, 'utf8'); };
const PAGES = ['home-jsi-a.html', 'home-jsi-b.html', 'home-jsi-c.html'];
const textOf = (h) => String(h).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const sectionOf = (h) => (String(h).match(/<section class="jsi" id="just-say-it"[\s\S]*?<\/section>\s*<script>window\.JSI_CARDS = [\s\S]*?<\/script>/) || [''])[0];

test('1 the four cards are the parser\'s: complete (nothing missing), no amount, and - when the parser is on this Mac - equal to what it builds today', () => {
    const J = JSON.parse(read('jsi-cards.json'));
    assert.equal(J.cards.length, 4);
    J.cards.forEach((c) => {
        assert.ok(c.lines.length >= 5, c.text);
        assert.ok(c.lines.some((l) => l[0] === 'Amount' && l[1] === 'No amount'), c.text + ': for fun');
        assert.ok(!c.lines.some((l) => /Tap to choose/.test(l[1])), c.text + ': nothing left to choose');
    });
    const parser = path.join(os.homedir(), 'golf-app-210-hr', 'ask-hardpan.js');
    if (!fs.existsSync(parser)) return;   // the web repo does not carry the app's parser
    const A = require(parser);
    const ctx = { players: [{ id: '101', name: 'Sam' }, { id: '102', name: 'Josh' }, { id: '103', name: 'Bob' }, { id: '104', name: 'Paul' }], meId: '101', holes: Array.from({ length: 18 }, (_, i) => i + 1) };
    J.cards.forEach((c) => {
        const r = A.askParse(c.text, ctx);
        assert.equal(r.kind, 'game', c.text);
        assert.deepEqual(r.missing, [], c.text);
        assert.equal(A.titleOf(r.bet), c.title);
        assert.deepEqual(A.linesOf(r.bet, r.missing, ctx, r).map((l) => [l.label, l.value]), c.lines, c.text);
    });
});
test('2 each homepage mockup: the section with "Just say it. We\'ll set it up." and the sub line, the four lines as chips, the cards as data; the rest is the live homepage', () => {
    const J = JSON.parse(read('jsi-cards.json'));
    const live = read('hardpan-home.html');
    PAGES.forEach((f) => {
        const h = read(f);
        const s = sectionOf(h);
        assert.ok(s.length > 500, f + ': the section was found');
        assert.match(s, /<h2 id="jsi-h">Just say it\. We&rsquo;ll set it up\.<\/h2><p>No menus\. Type or say your game and HardPan builds it\.<\/p>/);
        assert.equal((s.match(/<button type="button" class="jsi-chip[ "]/g) || []).length, 4, f + ': four chips');
        assert.deepEqual(JSON.parse(/window\.JSI_CARDS = (\[[\s\S]*?\]);<\/script>/.exec(s)[1]), J.cards, f + ': the cards are jsi-cards.json');
        assert.equal(h.replace(/<!-- JUST SAY IT \(ADVISOR[\s\S]*?<section class="wrap cmp" id="compare"/, '<section class="wrap cmp" id="compare"').replace(/\n    \/\* JUST SAY IT \(mockup 2026-11-19\) \*\/[\s\S]*?<\/style>/, '</style>'), live, f + ': nothing else on the page moved');
    });
});
test('3 no money figure, no betting or cash word, no competitor, no "Coming soon" in any mockup section or the showcase card', () => {
    const bits = PAGES.map((f) => sectionOf(read(f))).concat([(read('see-it-jsi.html').match(/<div class="ecard jsi-e"[\s\S]*?<\/div><\/div><\/div>/) || [''])[0]]);
    bits.forEach((b, i) => {
        assert.ok(b.length > 300, 'section ' + i + ' found');
        const t = textOf(b);
        assert.ok(!/\$\s?\d|\b(bet|bets|wager\w*|gambl\w*|pool|pot|cash|venmo|paypal|stake)\b/i.test(t), 'a money word: ' + (t.match(/\$\s?\d|\b(bet|bets|wager\w*|gambl\w*|pool|pot|cash|venmo|paypal|stake)\b/i) || [])[0]);
        assert.ok(!/18birdies|golfshot|hole19|thegrint|swingu/i.test(b));
        assert.ok(!/coming soon/i.test(t));
    });
});
test('4 the showcase mockup: one Just say it card in the Everyday part, the parser\'s 2 v 2 Best Ball', () => {
    const h = read('see-it-jsi.html');
    assert.equal((h.match(/class="ecard jsi-e"/g) || []).length, 1);
    assert.match(h, /Best ball, me and Josh vs Bob and Paul, for fun[\s\S]{0,400}2 v 2 Best Ball/);
});
