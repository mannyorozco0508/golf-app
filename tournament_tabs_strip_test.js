// THE ORGANIZER'S TAB STRIP ON A PHONE (bug hunt #4, option B; Manny
// 2026-11-12). Five equal columns in one row, icon over a short label on a
// phone, the full label beside the icon from 480 px. Reached the way the
// organizer reaches it: arrive cold (tools/lib/cold-arrival.js) signed in as
// the owner, read the tab rectangles, tap; no page function is called.
//
//  1 390x844: all five tab buttons inside the viewport (left >= 0, right <= 390),
//    each >= 44 px tall and >= 60 px wide, no horizontal scroll; the short
//    labels read Event day / Setup / Desk / Board / Contests; tapping Board
//    opens the leaderboard panel and marks the tab active
//  2 1280x800: all five inside the container, the full labels (Setup & Links,
//    Leaderboard), each >= 40 px tall; no horizontal scroll
//  3 a non-owner: only the Board tab is on screen (the gate hides the rest) and
//    it is not stretched past the row (<= 390 wide)
//  4 money = base
//
// Baseline against main 0f11073c (before the build, the page swapped in by cp
// and restored by sha): all 4 tests: 1 PASS / 3 FAIL (test 4; the old pills are 35 px tall,
// so the non-owner test fails there too). With the
// build: all 4 tests: 4 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const READ = { expression: `JSON.stringify((function () {
  var tabs = ['home', 'setup', 'desk', 'leaderboard', 'contests'].map(function (k) {
    var e = document.getElementById('tab-btn-' + k); if (!e) return { k: k, missing: true };
    var r = e.getBoundingClientRect(); var shown = getComputedStyle(e).display !== 'none' && r.width > 0;
    return { k: k, shown: shown, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), text: (e.innerText || '').replace(/\\s+/g, ' ').trim(), active: e.classList.contains('active') };
  });
  var c = document.querySelector('.top-nav-bar'); var cr = c ? c.getBoundingClientRect() : null;   // the strip itself: the first .container is the hidden create screen
  var lb = document.getElementById('manage-tab-leaderboard');
  return { tabs: tabs, scrollW: document.scrollingElement.scrollWidth, vw: window.innerWidth, container: cr ? [Math.round(cr.left), Math.round(cr.right)] : null,
    board: !!lb && getComputedStyle(lb).display !== 'none', manage: !!document.getElementById('manage-screen') && getComputedStyle(document.getElementById('manage-screen')).display !== 'none' };
})())` };
const go = async (viewport, auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: F.scrambleDb({ ownerUid: 'u-org' }), auth, viewport, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 a phone: five tabs in one row, all on screen, thumb-size, short labels; Board opens the leaderboard', async () => {
    const [a, b] = await go({ width: 390, height: 844 }, OWNER, [READ, { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, READ]);
    assert.equal(a.manage, true, 'positive: the manage screen is open');
    assert.equal(a.vw, 390);
    a.tabs.forEach((t) => {
        assert.equal(t.shown, true, t.k + ' is shown');
        assert.ok(t.left >= 0 && t.right <= 390, `${t.k} inside the viewport: ${t.left}-${t.right}`);
        assert.ok(t.h >= 44, `${t.k} tall enough: ${t.h}`);
        assert.ok(t.w >= 60, `${t.k} wide enough: ${t.w}`);
    });
    assert.deepEqual(a.tabs.map((t) => t.text), ['🏁 Event day', '⚙️ Setup', '📋 Desk', '🏆 Board', '🎯 Contests']);
    assert.ok(a.scrollW <= 390, 'no horizontal scroll: ' + a.scrollW);
    assert.equal(b.board, true, 'the leaderboard panel opened');
    assert.equal(b.tabs.find((t) => t.k === 'leaderboard').active, true);
    assert.equal(b.tabs.find((t) => t.k === 'setup').active, false);
});

test('2 a desktop: the full labels, all inside the container, no horizontal scroll', async () => {
    const [a] = await go({ width: 1280, height: 800 }, OWNER, [READ]);
    assert.ok(a.container && a.container[1] - a.container[0] > 400, 'positive: the strip measured: ' + a.container);
    a.tabs.forEach((t) => {
        assert.equal(t.shown, true);
        assert.ok(t.left >= a.container[0] - 1 && t.right <= a.container[1] + 1, `${t.k} inside the strip: ${t.left}-${t.right} vs ${a.container}`);
        assert.ok(t.h >= 40, `${t.k} tall enough: ${t.h}`);
    });
    assert.deepEqual(a.tabs.map((t) => t.text), ['🏁 Event day', '⚙️ Setup & Links', '📋 Desk', '🏆 Leaderboard', '🎯 Contests']);
    assert.ok(a.scrollW <= 1280);
});

test('3 a non-owner: only Board is on screen, inside the row', async () => {
    const [a] = await go({ width: 390, height: 844 }, { uid: 'u-golfer', isAnonymous: true }, [READ]);
    const shown = a.tabs.filter((t) => t.shown).map((t) => t.k);
    assert.deepEqual(shown, ['leaderboard']);
    const lb = a.tabs.find((t) => t.k === 'leaderboard');
    assert.ok(lb.left >= 0 && lb.right <= 390 && lb.h >= 44, JSON.stringify(lb));
    assert.ok(a.scrollW <= 390);
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
