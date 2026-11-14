// ============================================================================
// HARDPAN TOURNAMENTS LANDING PAGE (tournaments.html -> hardpangolf.com/tournaments)
// Manny 2026-11-14: layout "C with B's phones" from mockups-landing/landing-C-blend-2026-11-14.png.
//
// What this file holds (source, no browser):
//   1. the page exists, is static (no <script>, no service-worker registration), and every
//      picture it names is a file in the repo (the site's own media + media/landing/)
//   2. the copy rules: "HardPan Tournaments" branding, no "Rattle" anywhere in the page,
//      pricing exactly "$0 for organizers" + "$4 per golfer, paid by the golfer", card
//      payments tagged "coming" (twice: the tile and the pricing line), no betting words
//   3. the links: Set up my event -> /tournament, Contact -> /support, footer Privacy / Terms /
//      Support, nav anchors to sections that exist
//   4. the layout markers the pick asked for: the band has three fanned phones (p1 team card,
//      p2 GPS in front, p3 leaderboard) over the TV frame; the phone CSS keeps a fan (no
//      stacked column), and the desktop fan leaves room for its captions above the TV frame
// What it cannot prove: pixels. tools/landing-fan-check.js opens the page in headless Chrome
// at 390 and 1400 and measures that no phone leaves the frame and no caption sits under the
// TV frame. Run it by hand after touching the band.
// BASELINE (new file, final run, branch preview-landing on e1312cf2): 4 tests. Against main
// e1312cf2 (no tournaments.html, the page reads as ''): 0 pass / 4 fail. With the build: 4 pass /
// 0 fail. tools/landing-fan-check.js on the built page (wrangler, 390 + 1400): 0 fails. FAST lane
// (copy and layout): no negative controls; the two self-caught defects on the way were the page's
// own comment carrying the forbidden word (test 2) and the width/height attributes stretching
// the framed pictures (the fan check: a 314px phone at 390), both fixed before this header.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PAGE = path.join(ROOT, 'tournaments.html');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, 'utf8') : '';
const body = () => html.slice(html.indexOf('<body'));
const css = () => { const m = /<style>([\s\S]*?)<\/style>/.exec(html); return m ? m[1] : ''; };
const text = () => body().replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

test('1. tournaments.html exists, is static, and every picture it names is a repo file', () => {
    assert.ok(html.length > 5000, 'the page is there (positive)');
    assert.equal((html.match(/<script/g) || []).length, 0, 'no script on the landing page');
    assert.ok(!/serviceWorker|sw\.js/.test(html), 'no service-worker registration');
    const srcs = [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(srcs.length >= 6, 'positive: pictures on the page: ' + srcs.length);
    srcs.forEach((s) => { assert.match(s, /^\/media\/(screens|landing)\/[a-z0-9-]+\.webp$/, s); assert.ok(fs.existsSync(path.join(ROOT, s.slice(1))), s + ' is missing'); });
    [...html.matchAll(/<img [^>]*>/g)].forEach((m) => assert.match(m[0], /\balt="[^"]{20,}"/, 'every picture has a real alt: ' + m[0].slice(0, 80)));
});

test('2. copy rules: HardPan Tournaments, no Rattle, the exact pricing, card payments "coming", no betting words', () => {
    const t = text();
    assert.ok(t.length > 2000, 'positive: there is copy to judge');
    assert.match(html, /<title>HardPan Tournaments: run your golf event in one link<\/title>/);
    assert.match(t, /Run your golf event in one link\./);
    assert.doesNotMatch(html, /Rattle/i, 'no Rattle wording anywhere in the page (markup included)');
    assert.match(t, /\$0 for organizers/); assert.match(t, /\$4 per golfer, paid by the golfer/);
    // the only dollar figures in the COPY are the two pricing lines and the $4 fee sentence; every other amount is inside a picture
    assert.deepEqual([...new Set(t.match(/\$\d+(?:\.\d\d)?/g))].sort(), ['$0', '$4'], 'dollar figures in the copy');
    assert.equal((html.match(/class="tag">coming</g) || []).length, 2, 'card payments tagged coming on the tile and on the pricing line');
    assert.doesNotMatch(t, /\b(bet|bets|betting|wager|gambl\w*|pot|buy-?in|stake)\b/i, 'no betting words');
    assert.match(t, /Free for organizers\./);
});

test('3. links: Set up my event -> /tournament, Contact -> /support, the footer, the nav anchors', () => {
    assert.ok((html.match(/href="\/tournament"[^>]*>Set up my event</g) || []).length >= 2, 'Set up my event opens the organizer page (hero + closing band)');
    assert.match(html, /href="\/support"[^>]*>Contact us</);
    ['/privacy', '/terms', '/support', '/'].forEach((h) => assert.ok(html.includes('href="' + h + '"'), h));
    ['#get', '#how', '#pricing', '#faq'].forEach((a) => { assert.ok(html.includes('href="' + a + '"'), a + ' link'); assert.ok(html.includes('id="' + a.slice(1) + '"'), a + ' target'); });
    assert.doesNotMatch(html, /href="https?:\/\/tournaments\.rattlegolf/, 'no old-host link');
});

test('4. the band Manny picked: three fanned phones (team card, GPS in front, leaderboard) over the TV frame; a small fan on a phone, captions clear of the TV on desktop', () => {
    const band = html.slice(html.indexOf('During the round'), html.indexOf('What organizers get'));
    assert.ok(band.length > 500, 'positive: the band is there');
    assert.match(band, /class="phone p1"[\s\S]*card-board-780\.webp/); assert.match(band, /class="phone p2"[\s\S]*gps-886\.webp/); assert.match(band, /class="phone p3"[\s\S]*prizes-780\.webp/);
    assert.ok(band.indexOf('class="phone p3"') < band.indexOf('class="desk"'), 'the TV frame comes after the phones');
    assert.match(band, /tv-board-1280\.webp/);
    const c = css();
    assert.match(c, /\.D \.fan \.p2\{[^}]*z-index:3/, 'GPS in front (desktop)');
    const phone = c.slice(c.indexOf('@media (max-width:520px)'));
    assert.match(phone, /\.D \.fan \.phone\{position:absolute/, 'a fan on a phone, not a column');
    assert.doesNotMatch(phone, /flex-direction:column/, 'no stacked column');
    assert.match(phone, /\.D \.fan \.p2\{[^}]*z-index:3/, 'GPS in front on a phone');
    assert.match(c, /\.D \.fan\{position:relative;height:470px;margin:10px 0 70px\}/, 'the desktop fan leaves 70px for its captions above the TV frame');
});
