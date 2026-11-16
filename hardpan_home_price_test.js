// ============================================================================
// PRICE B + D on hardpan-home.html (Manny's pick 2026-11-16 13:34 via the Advisor,
// ADVISOR-20261116-1335-OK-build-price-BD; mockups tournaments/mockups-price/price-ABCD).
//
// B: a price band directly under the store badges in the fold: the headline price, the
//    founding words, "up to $75 a year less" and "Popular golf GPS apps charge up to $99.99/yr".
// D: the comparison block "Everything your group needs, in one app", the first section after
//    the fold: nine rows + a price row, HardPan next to a "Typical golf GPS app".
//
// What this file holds:
//  1. Every figure comes through site-pricing.js slots: the page carries no literal dollar
//     figure; the saving is COMPUTED from compare.othersUpTo and the headline price ($75 with
//     the founding price, $50 once founding closes), never typed; a missing figure shows the
//     dash, never a wrong number.
//  2. The band sits inside the fold's .cta right after the badges and links to #pricing; the
//     block is the first section after #top and before #how.
//  3. No competitor is named anywhere on the page, and no negative word; every "typical" cell
//     on the page is a cell in site-compare-sources.md, with the checked-on date, so a changed
//     sentence has to carry its source.
//  4. The phone rules exist (the fan at 62 % in REAL sizes, not a transform: a scaled box kept
//     its full height and covered the Golfers door, caught by hardpan_home_scenes_test 2.6; the
//     band stacked; the block as HardPan line + one grey line per row; nothing under 15 px, the
//     page's rule). Layout is NOT measured here (mini-dom has none); it was measured in headless
//     Chrome against a local copy on 2026-11-16: see the build log line.
//
// BASELINE against main 1cc0128e (the page before the build): 1 pass / 10 fail of 11, measured
// with this file copied there after the last test was written (the one pass is the "no
// competitor name" scan, true of the old page too). 11 / 0 on the branch.
// NEGATIVE CONTROLS (each restored by sha): saving typed instead of computed -> 1 red; the
// block moved below #how -> 1 red; a literal "$75" in the band -> 1 red; "18Birdies" in a
// cell -> 1 red; a cell reworded without the sources file -> 1 red; the phone fan rule
// deleted -> 1 red; a 13 px size in the new CSS -> hardpan_home_scenes_test goes red (its rule, not this file's).
// ============================================================================
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const html = read('hardpan-home.html');
const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
let sources = '';
try { sources = read('site-compare-sources.md'); } catch (e) { sources = ''; }   // absent on the pre-build main: the sourced-cells test goes red, the rest still run
const at = (needle) => { const i = html.indexOf(needle); assert.ok(i >= 0, 'missing on the page: ' + needle.slice(0, 60)); return i; };
const slice = (from, to) => { const i = at(from); const j = html.indexOf(to, i); assert.ok(j > i, 'no end for ' + from.slice(0, 40)); return html.slice(i, j); };

function pricing(mutate) {
    const sb = { window: {} };
    vm.createContext(sb);
    vm.runInContext(read('site-pricing.js'), sb);
    if (mutate) mutate(sb.window.HARDPAN_SITE_PRICING);
    const keys = [];
    html.replace(/data-price="([^"]+)"/g, (_, k) => { keys.push(k); return ''; });
    const slots = keys.map((k) => ({ key: k, textContent: '', getAttribute: () => k }));
    sb.window.HardPanSitePricingFill({ querySelectorAll: (s) => (s === '[data-price]' ? slots : []) });
    const by = {};
    slots.forEach((s) => { by[s.key] = s.textContent; });
    return { P: sb.window.HARDPAN_SITE_PRICING, by, slots };
}

describe('1. every figure through site-pricing.js; the saving is computed', () => {
    test('the page carries no literal dollar figure; the band and the block use slots', () => {
        assert.doesNotMatch(noComments.replace(/<script[\s\S]*?<\/script>/g, ''), /\$\s?[0-9]/, 'a typed dollar figure on the page');
        const band = slice('<a class="pband"', '</a>');
        ['pro-headline', 'pro-label', 'pro-after', 'compare-save', 'compare-others'].forEach((k) => assert.match(band, new RegExp('data-price="' + k + '"'), 'band slot ' + k));
        const block = slice('<section class="wrap cmp" id="compare"', '</section>');
        ['compare-checked', 'pro-headline', 'pro-label', 'pro-after', 'compare-others', 'free-golfers'].forEach((k) => assert.match(block, new RegExp('data-price="' + k + '"'), 'block slot ' + k));
    });
    test('founding open: $24.99/yr, then $49.99/yr, up to $99.99/yr, saving $75 (computed), checked Nov 16, 2026', () => {
        const { P, by, slots } = pricing();
        assert.equal(P.pro.foundingOpen, true);
        assert.equal(by['pro-headline'], P.pro.founding + '/yr');
        assert.equal(by['pro-after'], P.pro.yearly + '/yr');
        assert.equal(by['compare-others'], P.compare.othersUpTo + '/yr');
        assert.equal(P.compare.othersUpTo, '$99.99');
        assert.equal(by['compare-save'], '$75');
        assert.equal(by['compare-checked'], 'Nov 16, 2026');
        slots.forEach((s) => assert.notEqual(s.textContent, '–', 'slot ' + s.key + ' shows the dash'));
    });
    test('founding closed: the saving follows the yearly price ($50), the "then" slot becomes the monthly option', () => {
        const { P, by } = pricing((p) => { p.pro.foundingOpen = false; });
        assert.equal(by['pro-headline'], P.pro.yearly + '/yr');
        assert.equal(by['compare-save'], '$50');
        assert.equal(by['pro-after'], P.pro.monthly + '/mo');
    });
    test('a saving is never typed: a changed comparison figure moves it; a missing one shows the dash', () => {
        assert.equal(pricing((p) => { p.compare.othersUpTo = '$79.99'; }).by['compare-save'], '$55');
        assert.equal(pricing((p) => { p.compare.othersUpTo = '$89.49'; }).by['compare-save'], '$64.50');
        const gone = pricing((p) => { delete p.compare; });
        assert.equal(gone.by['compare-save'], '–');
        assert.equal(gone.by['compare-others'], '–');
        assert.equal(pricing((p) => { p.compare.othersUpTo = '$9.99'; }).by['compare-save'], '–', 'a figure below ours is not a saving');
        assert.doesNotMatch(read('site-pricing.js'), /'\$75'|"\$75"/, 'the saving is typed in site-pricing.js');
    });
});

describe('2. where they sit', () => {
    test('the band is inside the fold\'s .cta, right after the badges, a link to #pricing', () => {
        const fold = slice('<section class="wrap hero fold" id="top">', '</section>');
        const badges = fold.indexOf('<div class="badges hb">');
        const band = fold.indexOf('<a class="pband" id="pband" href="#pricing">');
        const ctaEnd = fold.indexOf('<a class="webapp"');
        assert.ok(badges > 0 && band > badges && band < ctaEnd, 'band not between the badges and the web-app link: ' + [badges, band, ctaEnd]);
        assert.match(fold.slice(badges, band), /<\/div>\s*$/, 'the band does not directly follow the badges');
        assert.match(fold, /up to <span data-price="compare-save"><\/span> a year less/);
        assert.match(fold, /Popular golf GPS apps charge up to <span data-price="compare-others"><\/span>/);
    });
    test('the block is the first section after the fold and before How you\'ll use it', () => {
        const top = at('<section class="wrap hero fold" id="top">');
        const topEnd = html.indexOf('</section>', top);
        const cmp = at('<section class="wrap cmp" id="compare" aria-labelledby="cmp-h">');
        const how = at('<section class="how" id="how"');
        assert.ok(topEnd < cmp && cmp < how, 'order: fold ' + topEnd + ', compare ' + cmp + ', how ' + how);
        const between = html.slice(topEnd, cmp);
        assert.doesNotMatch(between, /<section/, 'another section sits between the fold and the block');
        assert.match(html, /<h2 id="cmp-h">Everything your group needs, in one app<\/h2>/);
    });
    test('nine feature rows + the price row; HardPan says Included or Free forever on every one', () => {
        const block = slice('<section class="wrap cmp" id="compare"', '</section>');
        const rows = block.match(/<tr><td class="what">[\s\S]*?<\/tr>/g) || [];
        assert.equal(rows.length, 9);
        rows.forEach((r) => assert.match(r, /<td class="us">(Included|Free forever)<\/td>/, r.slice(0, 80)));
        assert.equal((block.match(/<td class="us">Free forever<\/td>/g) || []).length, 1);
        assert.match(block, /<tr class="cmp-price"><td class="what">Price<\/td>/);
        assert.match(block, /Venmo/, 'the settle-up row names Venmo');
        assert.match(block, /36-hole board, the board on a TV, check-in, entry fees by Venmo/);
    });
});

describe('3. no names, no knocks, every cell sourced', () => {
    test('no competitor name anywhere on the page', () => {
        assert.doesNotMatch(noComments, /18Birdies|SwingU|Golfshot|Hole19|Golf Genius|GolfStatus|Live Tourney|Arccos/i);
    });
    test('no negative word in the typical column, never a cross mark', () => {
        const block = slice('<section class="wrap cmp" id="compare"', '</section>');
        const them = (block.match(/<td class="them">([\s\S]*?)<\/td>/g) || []).join(' ');
        assert.ok(them.length > 200, 'positive: the typical column has text');
        assert.doesNotMatch(them, /✗|❌|\bno\b|worse|bad|lack|missing|can't|cannot|don't|doesn't/i, them);
    });
    test('every typical-column cell on the page is a cell in site-compare-sources.md, which carries the checked-on date', () => {
        const block = slice('<section class="wrap cmp" id="compare"', '</section>');
        const cells = (block.match(/<td class="them">([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        assert.equal(cells.length, 10);
        cells.filter((c) => !/^up to /.test(c)).forEach((c) => assert.ok(sources.includes(c), 'cell not in site-compare-sources.md: ' + c));
        assert.match(sources, /Nov 16, 2026/);
        assert.match(sources, /\$99\.99/);
        ['18Birdies', 'SwingU', 'Golfshot', 'Hole19'].forEach((n) => assert.match(sources, new RegExp(n), 'the sources file names ' + n));
    });
});

describe('4. the phone rules exist (layout measured in Chrome, not here)', () => {
    test('the fan at 62 % in real sizes, the band stacked, the block as blocks, nothing under 15 px', () => {
        const phone = slice('    @media (max-width:700px) {\n        .fold { padding:0 16px; }', '\n    }\n</style>');
        assert.match(phone, /\.fan \{ margin-top:14px; width:222px; height:247px; \}/);
        assert.match(phone, /\.fp\.c \{ width:112px; height:241px; left:55px; border-width:3px; border-radius:16px; \}/);
        assert.doesNotMatch(phone, /\.fan \{[^}]*transform:scale/, 'a scaled fan covers the doors (2.6)');
        assert.match(phone, /\.pband \{ flex-direction:column;/);
        assert.match(phone, /\.cmp table, \.cmp tbody, \.cmp tr, \.cmp td \{ display:block; width:auto; \}/);
        assert.match(phone, /\.cmp thead \{ display:none; \}/);
        assert.match(phone, /\.cmp td\.them \{ display:block; width:auto; font-size:15px;/, 'the desktop 35 % width would squeeze the grey line on a phone');
        const desk = slice('    .pband {', '    .cmp-foot');
        assert.match(desk, /\.pband b \{ font-size:36px; font-weight:900;/);
        const sizes = (desk + phone.slice(phone.indexOf('/* PRICE B on a phone'))).match(/font-size:([0-9.]+)px/g).map((m) => parseFloat(m.slice(10)));
        assert.ok(sizes.length > 10 && sizes.every((n) => n >= 15), 'new text under 15 px: ' + sizes.filter((n) => n < 15).join());
        assert.match(desk, /\.cmp td\.us::before \{ content:"\\2713  "; font-weight:900; \}/);
    });
});
