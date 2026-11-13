// BUG-HUNT #10 (2026-11-12, Manny OK to fix on a preview): the 📣 Announcements
// door lived only on the Leaderboard tab (#open-announce in #event-tools-row).
// The organizer runs the day from Event day, so the same door joins Event
// day's action tiles (#eh-act-announce -> eventHomeGo('announce') -> the same
// showTab('announce') the board's door calls). The board's door stays.
//
// Reached the way the organizer reaches it: cold arrival (tools/lib/cold-arrival.js,
// stand-in database, real headless Chrome, 390x844), signed in as the owner,
// tap Event day, tap the tile; no page function is called by name.
//
//  1 the owner on Event day: the Announce tile is drawn beside Team QR / Desk /
//    Board / Setup; tapping it opens the Announcements tool ("Send to the field")
//    and parks Event day; the board's own door is still there
//  2 a signed-out visitor: no Event day tab, no tile on screen, no tool
//  3 money = base
//
// Baseline against main 5041dd9b (tournament.html swapped in by cp, restored by
// sha): all 3 tests: 2 PASS / 1 FAIL (test 1). With the build on preview-bug10:
// 3 PASS / 0 FAIL. Control: the tile's eventHomeGo branch removed -> test 1 red
// (the tile draws but the tool never opens).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PROBE = { expression: `JSON.stringify((function () {
  var vis = function (s) { var e = document.querySelector(s); if (!e) return false; var cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var txt = function (s) { var e = document.querySelector(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : ''; };
  var tileBox = (function () { var e = document.getElementById('eh-act-announce'); if (!e) return null; var r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })();
  return { homeTab: vis('#tab-btn-home'), home: vis('#manage-tab-home'), tile: vis('#eh-act-announce'), tileText: txt('#eh-act-announce'), tileBox: tileBox,
    desk: vis('#eh-act-desk'), tool: vis('#manage-tab-announce'), toolText: txt('#manage-tab-announce').slice(0, 400), boardDoor: vis('#open-announce'), board: vis('#manage-tab-leaderboard') };
})())` };
const parse = (r) => r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));

test('1 the owner on Event day: the Announce tile, the tool behind it; the board door stays', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: OWNER, viewport: { width: 390, height: 844 }, settleMs: 3500,
        steps: [{ tap: '#tab-btn-home' }, { sleep: 300 }, PROBE, { tap: '#eh-act-announce' }, { sleep: 300 }, PROBE, { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, PROBE] });
    assert.ok(r.ok, r.reason);
    const [a, b, c] = parse(r);
    assert.ok(a.home && a.desk, 'positive: Event day is open with its tiles: ' + JSON.stringify(a));
    assert.ok(a.tile, 'the Announce tile is on Event day: ' + JSON.stringify(a));
    assert.match(a.tileText, /Announce/);
    assert.ok(a.tileBox && a.tileBox[0] >= 44 && a.tileBox[1] >= 44, 'a real tap target: ' + JSON.stringify(a.tileBox));
    assert.ok(!a.tool, 'the tool is closed until tapped');
    assert.ok(b.tool && !b.home, 'the tile opens the Announcements tool and parks Event day: ' + JSON.stringify(b));
    assert.match(b.toolText, /Send to the field/);
    assert.ok(c.board && c.boardDoor, 'the board keeps its own door: ' + JSON.stringify(c));
});

test('2 a signed-out visitor: no Event day tab, no tile on screen, no tool', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: 'signed-out', viewport: { width: 390, height: 844 }, settleMs: 3500, steps: [PROBE] });
    assert.ok(r.ok, r.reason);
    const [a] = parse(r);
    assert.ok(a.board, 'positive: the visitor sees the board');
    assert.equal(a.homeTab, false); assert.equal(a.tile, false); assert.equal(a.tool, false);
});

test('3 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
