// 52A BATCH 1 (Manny 2026-11-12): seven real Tournaments cards join the
// homepage's Organize row (the same card shape as the other 25, each with a
// real screenshot of the live pages), and a "Start a tournament" button sits
// over the row and in the hero. Reached the way a visitor reaches it: arrive
// cold (tools/lib/cold-arrival.js) at hardpan-home.html, 390x844, touch
// nothing; innerText and geometry are read in real Chrome. No page function
// is called.
//
//  1 the Organize row holds the old 5 cards + 7 new ones, in that order; every
//    new card has an eyebrow, a headline, one sentence and a screenshot that
//    LOADS (naturalWidth > 0 from the served path) at 780 wide
//  2 the Start a tournament button over the Organize row: on screen at 390 px,
//    href /tournament, at least 44 px tall and 160 px wide; the hero has one too
//  3 the 25 cards main had keep their headlines, in the same order (git show)
//  4 the seven new cards' text has no "$", "free", "cash", "prize" (positive:
//    there are seven)
//  5 no horizontal scroll at 390 px; the Organize row's count reads 12
//  6 the screens manifest lists the 7 new screens in page order with their files
//  7 (added 2026-11-12) Ask caddie: no Coming soon (positive: its eyebrow drew),
//    its picture a 1170x2532 phone screen that loads, the 400 file 400x866
//
// Baseline against main 0f11073c (hardpan-home.html + manifest swapped in by
// cp, restored by sha): all 6 tests: 1 PASS / 5 FAIL (test 3: main agrees with
// itself). With the build: all 6 tests: 6 PASS / 0 FAIL.
// Test 7, the finished 7-test file against the batch-1 head 58e31e9e (page,
// manifest and ask-caddie-400.webp swapped in by cp, restored by sha):
// 6 PASS / 1 FAIL (test 7). With the re-capture: 7 PASS / 0 FAIL. Controls:
// the tag put back -> red; the old 400 file back -> red; the eyebrow cut -> red
// (the positive assertion).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const NEW = ['f-team-links', 'f-my-events', 'f-card-board', 'f-contests', 'f-photos', 'f-announce', 'f-desk'];
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var rect = function (e) { if (!e) return null; var r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  var org = document.querySelector('ul[aria-label="Organize features"]');
  var cards = org ? Array.prototype.map.call(org.querySelectorAll('li.fc'), function (li) {
    var img = li.querySelector('img');
    return { id: li.id, eb: (li.querySelector('.eb') || {}).innerText || '', h3: (li.querySelector('h3') || {}).innerText || '', p: (li.querySelector('p') || {}).innerText || '',
      text: (li.innerText || '').replace(/\\s+/g, ' ').trim(), src: img ? '/' + img.getAttribute('src').replace(/^\\//, '') : null, natural: img ? img.naturalWidth : -1, complete: img ? img.complete : false, width: img ? img.getAttribute('width') : null };
  }) : null;
  var allH3 = Array.prototype.map.call(document.querySelectorAll('section#features li.fc h3'), function (h) { return h.textContent.trim(); });
  var allIds = Array.prototype.map.call(document.querySelectorAll('section#features li.fc'), function (li) { return li.id; });
  var b = $('#start-tournament'), hb = $('#hero-start-tournament');
  return { cards: cards, allH3: allH3, allIds: allIds, btn: rect(b), btnHref: b ? b.getAttribute('href') : null, btnText: b ? b.innerText : null, hero: rect(hb), heroHref: hb ? hb.getAttribute('href') : null,
    gn: (function () { var g = $('#g-organize .gn, ul[aria-label="Organize features"]'); var h = org && org.parentElement ? org.parentElement.querySelector('.gn') : null; return h ? h.innerText : null; })(),
    scrollW: document.scrollingElement.scrollWidth, vw: window.innerWidth };
})())` };
// The images are lazy: scroll the Organize row into view and give them a moment.
// The page serves root-absolute /media/screens/ paths (as every card does); under
// file:// the harness points each new card's img at the same file relatively, so
// "loads" proves the file exists and decodes, not where the server mounts it.
const SHOW = { expression: `(function(){ var u = document.querySelector('ul[aria-label="Organize features"]'); if (!u) return 'none'; u.scrollIntoView({block:'center'});
  u.querySelectorAll('img').forEach(function (i) { i.loading = 'eager'; var src = i.getAttribute('src') || ''; if (src.charAt(0) === '/') { i.setAttribute('srcset', (i.getAttribute('srcset') || '').split('/media/').join('media/')); i.src = src.slice(1); } }); return 'shown'; })()` };
const go = async () => {
    const r = await arriveCold({ url: fileUrl('hardpan-home.html', ''), db: {}, auth: 'signed-out', settleMs: 1500, steps: [SHOW, { sleep: 1200 }, READ] });
    assert.ok(r.ok, r.reason);
    return JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
};
const baseHtml = () => execFileSync('git', ['show', '0f11073c:hardpan-home.html'], { cwd: __dirname, encoding: 'utf8' });

test('1 the Organize row: the old 5 then the 7 new cards, each complete, each screenshot loads at 780 wide', async () => {
    const a = await go();
    assert.ok(a.cards, 'the Organize row exists');
    assert.deepEqual(a.cards.map((c) => c.id), ['f-tourney', 'f-create-event', 'f-join-event', 'f-event-board', 'f-prizes'].concat(NEW));
    a.cards.slice(5).forEach((c) => {
        assert.ok(c.eb.length >= 5 && c.h3.length >= 12 && c.p.length >= 20, c.id + ': ' + JSON.stringify([c.eb, c.h3, c.p]));
        assert.match(c.src, /^\/media\/screens\/[a-z-]+-400\.webp$/);
        assert.ok(c.complete && c.natural > 0, c.id + ': the screenshot did not load (' + c.src + ', naturalWidth ' + c.natural + ')');
        assert.equal(c.width, '780', c.id + ': a 2x capture');
        const file = path.join(__dirname, c.src.replace(/^\//, ''));
        assert.ok(fs.existsSync(file) && fs.statSync(file).size < 150 * 1024, c.src + ' missing or over 150 KB');
        assert.ok(fs.existsSync(file.replace('-400.webp', '-780.webp')), c.src.replace('-400', '-780') + ' missing');
    });
});

test('2 Start a tournament: over the Organize row and in the hero, on screen at 390 px, href /tournament, thumb-size', async () => {
    const a = await go();
    assert.ok(a.btn, 'the Organize button exists');
    assert.equal(a.btnHref, '/tournament'); assert.match(a.btnText, /^Start a tournament/);
    assert.ok(a.btn.h >= 44 && a.btn.w >= 160, 'size ' + JSON.stringify(a.btn));
    assert.ok(a.btn.l >= 0 && a.btn.r <= a.vw, 'inside the screen: ' + JSON.stringify(a.btn));
    assert.ok(a.hero && a.heroHref === '/tournament' && a.hero.h >= 44 && a.hero.r <= a.vw, 'the hero button: ' + JSON.stringify(a.hero));
});

test('3 the 25 cards main had keep their headlines and order', async () => {
    const a = await go();
    const wasH3 = [...baseHtml().matchAll(/<li class="fc"[^>]*>[\s\S]*?<h3>([^<]*)<\/h3>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.equal(wasH3.length, 25, 'positive: main had 25');
    const mineOld = a.allH3.filter((h, i) => !NEW.includes(a.allIds[i]));
    assert.deepEqual(mineOld, wasH3);
});

test('4 the new cards say nothing about money: no "$", free, cash, prize', async () => {
    const a = await go();
    const mine = a.cards.slice(5);
    assert.equal(mine.length, 7, 'positive: seven new cards');
    mine.forEach((c) => assert.doesNotMatch(c.text, /\$|\bfree\b|\bcash\b|\bprizes?\b/i, c.id + ': ' + c.text));
});

test('5 no horizontal scroll at 390 px; the row count reads 12', async () => {
    const a = await go();
    assert.ok(a.scrollW <= a.vw, 'scrollWidth ' + a.scrollW + ' > ' + a.vw);
    assert.match(a.gn || '', /^12 /);
});

test('6 the screens manifest lists the seven new screens in page order with their files', () => {
    const man = JSON.parse(fs.readFileSync(path.join(__dirname, 'media/screens/manifest.json'), 'utf8'));
    const keys = man.screens.map((s) => s.key);
    const at = keys.indexOf('prizes');
    assert.ok(at > 0, 'positive: the fifth Organize card is listed');
    assert.deepEqual(keys.slice(at + 1, at + 8), ['team-qr-links', 'my-events', 'card-board', 'contests', 'photos-after', 'announcements', 'registration-desk']);
    man.screens.slice(at + 1, at + 8).forEach((s) => {
        assert.deepEqual(s.files, ['/media/screens/' + s.key + '-400.webp', '/media/screens/' + s.key + '-780.webp']);
        s.files.forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, f.replace(/^\//, ''))), f));
        assert.equal(s.width, 780); assert.equal(s.height, 1688);
    });
});

// 7 ASK CADDIE (Manny 2026-11-12, preview-52a): the card's picture was a 786x460
// crop that read as an empty dark screen; it is now a full phone screen on a real
// hole (release-206, Talking Stick Piipaash #1, satellite, the Ask answer showing).
// Ask caddie ships in the app (gps-ask-caddie.js on release-204, -205, -206; 2.0.6
// released on the App Store 2026-11-12), so the card no longer says Coming soon.
// Arrived cold at 390 px, touch nothing: the card's innerText and its loaded image.
const ASK = { expression: `JSON.stringify((function () {
  var li = document.getElementById('f-ask-caddie'); if (!li) return { missing: true };
  li.scrollIntoView({ block: 'center' });
  var img = li.querySelector('img'); var src = img.getAttribute('src') || '';
  var srcset = img.getAttribute('srcset') || '';
  window.__ask400 = new Image(); window.__ask400.src = 'media/screens/ask-caddie-400.webp';
  img.loading = 'eager'; if (src.charAt(0) === '/') { img.setAttribute('srcset', srcset.split('/media/').join('media/')); img.src = src.slice(1); }
  return { text: li.innerText.replace(/\\s+/g, ' ').trim(), src: src, srcset: srcset, w: img.getAttribute('width'), h: img.getAttribute('height'), fit: li.querySelector('.s').className };
})())` };
const ASK_IMG = { expression: `JSON.stringify((function () { var i = document.querySelector('#f-ask-caddie img'), f = window.__ask400; return { complete: i.complete, nw: i.naturalWidth, nh: i.naturalHeight, f400: [f.naturalWidth, f.naturalHeight] }; })())` };
test('7 Ask caddie: no Coming soon, and its picture is a full 390x844 phone screen that loads', async () => {
    const r = await arriveCold({ url: fileUrl('hardpan-home.html', ''), db: {}, auth: 'signed-out', settleMs: 1500, steps: [ASK, { sleep: 1200 }, ASK_IMG] });
    assert.ok(r.ok, r.reason);
    const v = r.value.filter((x) => typeof x === 'string' && x[0] === '{');
    const a = JSON.parse(v[0]), im = JSON.parse(v[v.length - 1]);
    assert.ok(!a.missing, 'the Ask caddie card exists');
    assert.match(a.text, /ASK CADDIE/, 'positive: the card drew its eyebrow');
    assert.match(a.text, /Ask what it plays\./);
    assert.doesNotMatch(a.text, /coming soon/i, 'Ask caddie shipped: no Coming soon on its card');
    assert.equal(a.src, '/media/screens/ask-caddie-400.webp');
    assert.match(a.srcset, /\/media\/screens\/ask-caddie-1170\.webp 1170w/);
    // srcset hands the card the 1170 file here; the 400 file (phones at 1x-2x) is loaded on its own and judged too.
    assert.deepEqual(im.f400, [400, 866], 'ask-caddie-400.webp is the 400-wide phone screen');
    assert.deepEqual([a.w, a.h], ['1170', '2532'], 'a 390x844 @3x capture, not the old 786x460 crop');
    // naturalWidth is density-corrected under srcset (the 400 file at 2x reads 200), so judge the shape:
    // loaded, and as tall as a 390x844 phone screen (866 / 400), not the old crop (460 / 786).
    assert.ok(im.complete && im.nw > 0 && Math.abs(im.nh / im.nw - 866 / 400) < 0.02, 'the picture loads as a phone screen: ' + JSON.stringify(im));
    assert.equal(a.fit, 's', 'no letterbox: the picture fills the card like its neighbours');
    const big = path.join(__dirname, 'media/screens/ask-caddie-1170.webp');
    assert.ok(fs.existsSync(big) && fs.statSync(big).size < 300 * 1024, 'ask-caddie-1170.webp missing or over 300 KB');
});
