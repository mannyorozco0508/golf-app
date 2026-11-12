// GET HARDPAN, A + B (Manny 2026-11-12): on the team scorecard page, in the
// browser, a slim banner under the Scorecard | Leaderboard pills (A) and a
// reasons card after the holes and under the board (B). Reached the way a
// golfer reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844 on a
// keyed team link, touch nothing or tap; no page function is called.
//
//  1 a golfer in the browser: the banner is on screen under the pills with the
//    first hole's score box still in the first screen; the card closes the
//    holes list; Leaderboard: the same banner, the card under the board
//  2 Why? opens the three reasons and the two store badges in place; Less closes
//  3 x hides the banner and is remembered: a second arrival on this phone shows
//    no banner, and the card is still there
//  4 app mode (?app=1): no banner, no card, "Get HardPan" nowhere on screen
//  5 Get goes to the App Store on an iPhone, Google Play on Android, the
//    homepage's Get the app section on a desktop
//  6 no price or prize words in the banner or the card; nothing written
//  7 money = base
//
// Baseline against main dd86c327 (before the build): all 7 tests: 2 PASS / 5 FAIL
// (tests 4 and 7). With the build: all 7 tests: 7 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const K4 = 'k4-' + 'b'.repeat(29);
const fixture = () => Object.assign(F.scrambleDb({ ownerUid: 'u-org' }), { tournamentKeys: { SCR: { on: true, t: { team4: K4 } } } });
const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const Q = 'tourney=SCR&team=4&k=' + K4;
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var top = function (s) { var e = $(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  var body = (document.body.innerText || '');
  return { bar: shown($('#getapp-bar')), barTop: top('#getapp-bar'), barText: t('#getapp-bar'), pillsTop: top('.top-nav-bar'), titleTop: top('#event-title'),
    firstBoxTop: top('#holes-list .score-input, #holes-list input'), barBottom: $('#getapp-bar') ? Math.round($('#getapp-bar').getBoundingClientRect().bottom + window.scrollY) : null,
    cardCard: shown($('#getapp-card-card')), cardCardTop: top('#getapp-card-card'), lastHoleTop: (function () { var h = document.querySelectorAll('#holes-list .hole-row, #holes-list .hole-entry, #holes-list > *'); return h.length ? Math.round(h[h.length - 1].getBoundingClientRect().top + window.scrollY) : null; })(),
    cardBoard: shown($('#getapp-card-board')), boardTop: top('#leaderboard-list'), cardBoardTop: top('#getapp-card-board'),
    reasons: document.querySelectorAll('#getapp-bar .getapp-more .getapp-rs').length, badges: document.querySelectorAll('#getapp-bar .getapp-more .getapp-badges a').length, why: t('#getapp-why'), moreShown: shown($('#getapp-more')),
    cardText: t('#getapp-card-card'), cardReasons: document.querySelectorAll('#getapp-card-card .getapp-rs').length,
    get: ($('#getapp-get') || {}).href || null, mentions: (body.match(/Get HardPan/g) || []).length, tab: $('#tab-leaderboard') && getComputedStyle($('#tab-leaderboard')).display !== 'none' ? 'board' : 'card',
    writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())` };
const go = async (steps, query, pre) => {
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', query || Q), db: fixture(), auth: GOLFER, settleMs: 3000, steps, preScript: pre });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 the banner under the pills on both tabs, the card after the holes and under the board', async () => {
    const [a, b] = await go([READ, { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, READ]);
    assert.equal(a.tab, 'card');
    assert.equal(a.bar, true, 'the banner is on screen');
    assert.ok(a.barTop > a.pillsTop && a.barBottom <= a.titleTop, `under the pills, above the title: pills ${a.pillsTop} bar ${a.barTop}-${a.barBottom} title ${a.titleTop}`);
    assert.ok(a.firstBoxTop !== null && a.firstBoxTop < 844, `the first score box is still in the first screen (top ${a.firstBoxTop})`);
    assert.match(a.barText, /Get HardPan · live yardages, your card and the board in the app\. Why\? Get/, 'the one line (the HP tile reads first)');
    assert.equal(a.cardCard, true, 'the card on the card tab');
    assert.ok(a.cardCardTop > a.lastHoleTop, `after the last hole: hole ${a.lastHoleTop} card ${a.cardCardTop}`);
    assert.equal(a.cardReasons, 3);
    assert.equal(b.tab, 'board');
    assert.equal(b.bar, true, 'the same banner on the Leaderboard tab');
    assert.equal(b.cardBoard, true, 'the card under the board');
    assert.ok(b.cardBoardTop > b.boardTop, `under the board: board ${b.boardTop} card ${b.cardBoardTop}`);
});

test('2 Why? opens three reasons and two store badges in place; Less closes them', async () => {
    const [closed, open, again] = await go([READ, { tap: '#getapp-why' }, { sleep: 150 }, READ, { tap: '#getapp-why' }, { sleep: 150 }, READ]);
    assert.equal(closed.moreShown, false); assert.equal(closed.why, 'Why?');
    assert.equal(open.moreShown, true); assert.equal(open.reasons, 3); assert.equal(open.badges, 2); assert.equal(open.why, 'Less');
    assert.match(open.barText, /front, middle and back of every green/);
    assert.equal(again.moreShown, false); assert.equal(again.why, 'Why?');
});

test('3 x hides the banner, and this phone remembers; the card stays', async () => {
    const [before, after] = await go([READ, { tap: '#getapp-x' }, { sleep: 150 }, READ]);
    assert.equal(before.bar, true, 'positive: the banner was there');
    assert.equal(after.bar, false);
    assert.equal(after.cardCard, true, 'the card is not the banner');
    const [next] = await go([READ], Q, `try { localStorage.setItem('hp_getapp_ack', '1'); } catch (e) {}`);
    assert.equal(next.bar, false, 'a second arrival: no banner');
    assert.equal(next.cardCard, true);
});

test('4 app mode: no banner, no card, Get HardPan nowhere on screen', async () => {
    const [a] = await go([READ], Q + '&app=1');
    assert.equal(a.bar, false); assert.equal(a.cardCard, false); assert.equal(a.cardBoard, false);
    assert.equal(a.mentions, 0);
});

test('5 Get: the App Store on an iPhone, Google Play on Android, the homepage elsewhere', async () => {
    const ua = (s) => `Object.defineProperty(navigator, 'userAgent', { get: function () { return ${JSON.stringify(s)}; } });`;
    const [ip] = await go([READ], Q, ua('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
    const [an] = await go([READ], Q, ua('Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36'));
    const [mac] = await go([READ], Q, ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0 Safari/537.36'));
    assert.equal(ip.get, 'https://apps.apple.com/app/id6808220335');
    assert.equal(an.get, 'https://play.google.com/store/apps/details?id=com.rattlegolf.app');
    assert.equal(mac.get, 'https://hardpangolf.com/#get-the-app');
});

test('6 no price or prize words; nothing written', async () => {
    const [a] = await go([{ tap: '#getapp-why' }, { sleep: 150 }, READ]);
    const text = (a.barText || '') + ' ' + (a.cardText || '');
    assert.ok(text.length > 100, 'positive: there is text to check');
    assert.doesNotMatch(text, /\$|free|price|cash|prize|trial/i);
    assert.deepEqual(a.writes, []);
});

test('7 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
