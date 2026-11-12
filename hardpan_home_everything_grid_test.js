// 52B (Manny 2026-11-12): "EVERYTHING HARDPAN DOES", a tile grid under the hero
// of hardpan-home.html. Reached the way a visitor reaches it: arrive cold
// (tools/lib/cold-arrival.js) at 390x844 on the homepage, read what is on
// screen (innerText), tap; no page function is called.
//
//  1 the section sits under the hero and above the first Play card; the four
//    group names are on screen; 6 tiles per group show, the rest behind Show more
//  2 a tap on a tile opens one sentence and a See it link whose href is an id on
//    this page or /tournament; a second tap closes it; Show more reveals the group
//  3 Start a tournament: href /tournament, on screen in the Tournaments group
//  4 the section's text has no $, free, cash or price; the pricing tier names
//    are what they were
//  5 the 25 cards are still there, their h3 text identical to 03231f51
//  6 the first card is not pushed past 1700 px of page y at 390 wide; no
//    horizontal scroll
//  7 every See it anchor resolves to an element on the page (source)
//
// Baseline against main 03231f51 (that page swapped in by cp, restored by cp
// and sha): all 7 tests: 1 PASS / 6 FAIL (test 5: the cards were there).
// With the build: all 7 tests: 7 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const BASE = '03231f51';
const PAGE = fs.readFileSync(path.join(__dirname, 'hardpan-home.html'), 'utf8');
const h3s = (html) => [...html.matchAll(/<li class="fc" id="([^"]+)"[\s\S]*?<h3>([^<]*)<\/h3>/g)].map((m) => m[1] + '|' + m[2]);
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var top = function (s) { var e = $(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var vis = function (sel) { return Array.prototype.filter.call(document.querySelectorAll(sel), shown).length; };
  return { every: top('#everything'), hero: top('.hero'), heroBottom: $('.hero') ? Math.round($('.hero').getBoundingClientRect().bottom + window.scrollY) : null,
    firstCard: top('.fc'), features: top('#features'), cards: document.querySelectorAll('.fc').length,
    groups: Array.prototype.map.call(document.querySelectorAll('#everything .eg-h h3'), function (h) { return h.innerText; }),
    tilesAll: document.querySelectorAll('#everything .et').length, tilesShown: vis('#everything .et-b'),
    tournShown: vis('#eg-tourn .et-b'), tournAll: document.querySelectorAll('#eg-tourn .et').length,
    text: t('#everything'), tiers: Array.prototype.map.call(document.querySelectorAll('#pricing .nm'), function (e) { return e.innerText; }),
    open: Array.prototype.map.call(document.querySelectorAll('#everything .et-b[aria-expanded="true"]'), function (b) { return b.id; }),
    detail: (function () { var b = $('#everything .et-b[aria-expanded="true"]'); if (!b) return null; var d = document.getElementById(b.getAttribute('aria-controls')); var a = d && d.querySelector('.et-see'); return { shown: shown(d), text: d ? d.innerText.replace(/\\s+/g, ' ').trim() : null, href: a ? a.getAttribute('href') : null, target: a ? (/^#/.test(a.getAttribute('href')) ? !!document.getElementById(a.getAttribute('href').slice(1)) : a.getAttribute('href') === '/tournament') : null }; })(),
    start: (function () { var a = $('#start-a-tournament'); return a ? { href: a.getAttribute('href'), shown: shown(a), inTourn: !!a.closest('#eg-tourn'), text: a.innerText.trim() } : null; })(),
    scrollW: document.documentElement.scrollWidth, moreBtn: t('#eg-tourn .eg-more') };
})())` };
// The page scrolls smoothly (html { scroll-behavior: smooth }); the harness
// scrolls a target into view and taps at once, so the tap would land where the
// element WAS. Instant scrolling here is a harness setting, not a page change.
// (A pre-script runs before <html> exists, so the setting waits for DOMContentLoaded.)
const INSTANT = "document.addEventListener('DOMContentLoaded', function () { document.documentElement.style.scrollBehavior = 'auto'; });";
const go = async (steps) => {
    const r = await arriveCold({ url: fileUrl('hardpan-home.html', ''), db: {}, settleMs: 1500, steps, preScript: INSTANT });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 under the hero, above the first card: four groups, 6 tiles each on arrival', async () => {
    const [a] = await go([READ]);
    assert.ok(a.every !== null, 'the section is on the page');
    assert.ok(a.every >= a.heroBottom - 2 && a.every < a.firstCard, `hero ends ${a.heroBottom}, section ${a.every}, first card ${a.firstCard}`);
    assert.ok(a.every < a.features, 'before the features section');
    assert.deepEqual(a.groups, ['Play', 'Games', 'Your group', 'Tournaments']);
    assert.ok(a.tilesAll >= 50, `tiles in the page: ${a.tilesAll}`);
    assert.equal(a.tilesShown, 24, '6 per group on arrival');
    assert.match(a.text, /^EVERYTHING HARDPAN DOES \d+ features\. Tap one to read more\. Play /);
});

test('2 a tile opens to one sentence and a See it link that resolves; a second tap closes; Show more reveals the group', async () => {
    const [closed, open, again, more] = await go([READ, { tap: '#et-tourn-4' }, { sleep: 150 }, READ, { tap: '#et-tourn-4' }, { sleep: 150 }, READ, { tap: '#eg-tourn .eg-more' }, { sleep: 150 }, READ]);
    assert.deepEqual(closed.open, []);
    assert.deepEqual(open.open, ['et-tourn-4']);
    assert.equal(open.detail.shown, true);
    assert.match(open.detail.text, /^Every team gets its own scorecard link and QR; scan it in the app or open it in any browser\. See it →$/);
    assert.equal(open.detail.target, true, 'See it points at something on this page or /tournament: ' + open.detail.href);
    assert.deepEqual(again.open, []);
    assert.equal(closed.tournShown, 6); assert.equal(more.tournShown, more.tournAll, 'Show more shows them all');
    assert.ok(more.tournAll > 6);
    assert.match(closed.moreBtn, /^Show \d+ more$/);
});

test('3 Start a tournament: href /tournament, on screen, in the Tournaments group', async () => {
    const [a] = await go([READ]);
    assert.ok(a.start, 'the button exists');
    assert.equal(a.start.href, '/tournament');
    assert.equal(a.start.shown, true);
    assert.equal(a.start.inTourn, true);
    assert.equal(a.start.text, 'Start a tournament →');
});

test('4 no price or prize words in the section; the pricing tier names are unchanged', async () => {
    const [m] = await go([{ tap: '#eg-play .eg-more' }, { tap: '#eg-games .eg-more' }, { tap: '#eg-group .eg-more' }, { tap: '#eg-tourn .eg-more' }, { sleep: 100 }, READ]);
    assert.ok(m.text && m.text.length > 800, 'positive: the section has text');
    assert.doesNotMatch(m.text, /\$|\bfree\b|\bcash\b|\bprice/i);
    assert.deepEqual(m.tiers, ['Free', 'HardPan Pro', 'Host Pro', 'Trip Pass']);
});

test('5 the 25 cards are still there, h3 text identical to ' + BASE, async () => {
    const base = execFileSync('git', ['show', BASE + ':hardpan-home.html'], { cwd: __dirname, encoding: 'utf8' });
    const now = h3s(PAGE), was = h3s(base);
    assert.equal(was.length, 25, 'positive: the base had 25 cards');
    assert.deepEqual(now, was);
    const [a] = await go([READ]);
    assert.equal(a.cards, 25);
});

test('6 the first card is within 1700 px of the top at 390 wide; no horizontal scroll', async () => {
    const [a] = await go([READ]);
    assert.ok(a.firstCard !== null && a.firstCard <= 1700, `first card at ${a.firstCard}`);
    assert.ok(a.every !== null && a.every < a.firstCard, 'positive: the section is above it');
    assert.equal(a.scrollW, 390);
});

test('7 every See it anchor names an element on this page, or /tournament (source)', () => {
    const hrefs = [...PAGE.matchAll(/class="et-see" href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length >= 50, 'positive: ' + hrefs.length + ' See it links');
    const missing = hrefs.filter((h) => !(h === '/tournament' || (h[0] === '#' && new RegExp(' id="' + h.slice(1).replace(/[-]/g, '\\-') + '"').test(PAGE))));
    assert.deepEqual(missing, []);
});
