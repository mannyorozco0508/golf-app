// ============================================================================
// JUST SAY IT on the homepage: ONE block, the typed Try box (2026-11-19 homepage A, Manny's pick; the mockup reads
// "Just say it (try it) - one box, no looping demo beside it", and ADVISOR-20261119-0906 "ONE Just say it block:
// keep the interactive Try box; drop the duplicate").
//
// RE-WRITTEN 2026-11-19. This file used to hold the looping demo (#just-say-it, two <script data-jsi> blocks and
// jsi-cards.json; Manny's pick A of 03:01). That demo is gone; the Try box (#try-say, site-features.js) moved from
// under the Games row to the demo's place, after the band See how our tournaments work and before How you'll use it.
// Its cards are the app parser's own output (web_e_features_test.js section 5 holds every card to dev-204's
// ask-hardpan.js). Carryover defaults to off (ADVISOR-20261119-0905): plain skins shows Carry over Off, and one card
// keeps "with carryovers" to show it can be on.
//
// BASELINE (final file, 4 tests) against 1dfe04be (the looping demo on the page, the Try box under Games; hardpan-home.html,
// site-features.js and jsi-cards.json swapped in, restored by sha): 1 PASS / 3 FAIL. Test 4 passes there (the Try box
// already had no money word). 1 + 3 = 4. After: 4 / 0.
// CONTROLS (restored by sha, e7a94aaaf4a9 5dc1cf4cca72 RESTORED-OK): the carryovers card set to Off -> test 3 fails (3 / 1); the Try
// box left under the Games row -> test 2 fails (3 / 1).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const home = read('hardpan-home.html');
const tryBox = (home.match(/<div class="wrap trywrap"><section class="try" id="try-say"[\s\S]*?<\/section><\/div>/) || [''])[0];
const textOf = (h) => String(h).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// The Try box's table in site-features.js: one JSON object per line.
function table() {
    return read('site-features.js').split('\n').filter((l) => /^\s*\{"text":/.test(l)).map((l) => JSON.parse(l.trim().replace(/,$/, '')));
}

test('1 the looping demo is gone: no #just-say-it section, no <script data-jsi>, no jsi-cards.json', () => {
    assert.ok(tryBox.length > 500, 'positive: the Try box is on the page');
    assert.doesNotMatch(home, /id="just-say-it"/);
    assert.doesNotMatch(home, /<script data-jsi>/);
    assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'jsi-cards.json')), 'jsi-cards.json is gone');
    assert.equal((home.match(/<form id="ts-form"/g) || []).length, 1, 'one typed box');
});

test('2 the Try box stands third: after the band See how our tournaments work, before How you\'ll use it', () => {
    const at = home.indexOf('<section class="try" id="try-say"');
    assert.ok(at > 0, 'positive');
    assert.ok(home.indexOf('id="see-it"') < at && at < home.indexOf('<section class="how" id="how"'), 'its place');
    assert.match(tryBox, /<h3 id="try-say-h">Try Just say it<\/h3>/);
});

test('3 plain skins shows no carryover; one card and chip say "with carryovers" and show it on', () => {
    const T = table();
    assert.ok(T.length >= 6, 'positive: the table is read');
    const plain = T.find((r) => r.text === 'Skins for everyone, for fun');
    const carry = T.find((r) => r.text === 'Skins for everyone, with carryovers, for fun');
    assert.ok(plain && carry, 'both skins cards');
    assert.deepEqual(plain.lines.find((l) => l[0] === 'Carry over'), ['Carry over', 'Off']);
    assert.deepEqual(carry.lines.find((l) => l[0] === 'Carry over'), ['Carry over', 'On']);
    assert.ok(tryBox.includes('data-say="Skins for everyone, with carryovers, for fun"'), 'its chip');
});

test('4 no money figure, no betting or cash word, no competitor, no "Coming soon" in the Try box', () => {
    const t = textOf(tryBox);
    assert.ok(t.length > 100, 'positive');
    assert.ok(!/\$\s?\d|\b(bet|bets|wager\w*|gambl\w*|pool|pot|cash|venmo|paypal|stake)\b/i.test(t));
    assert.ok(!/18birdies|golfshot|hole19|thegrint|swingu/i.test(tryBox));
    assert.ok(!/coming soon/i.test(t));
});
