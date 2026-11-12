// BUG HUNT #3 (2026-11-12, Manny OK fix): a spectator who opens the board link
// (tournament.html?tourney=CODE, the TV QR's follow link) landed on the
// organizer sign-in card - three buttons, 520 px - above the leaderboard. Now
// the board comes first, a one-line "Organizer? Sign in" sits where the card
// was and scrolls to the full card at the bottom of the page; the owner's own
// flow is unchanged (signed in: no card, no line). Reached the way a spectator
// reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844, touch
// nothing, then tap the line.
//
//  1 anonymous visitor: the board's first rows are above the sign-in card on
//    the page; the "Organizer? Sign in" line is in the first screen; the card
//    still exists with its Apple and Google buttons (positive)
//  2 tapping the line brings the card into the viewport
//  3 the owner, signed in: no card, no line (as before)
//  4 money = base
//
// Baseline against main c6a0d97f (tournament.html swapped in by cp, restored
// by sha): all 4 tests: 2 PASS / 2 FAIL (tests 3 and 4). With the fix: 4 / 0.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const db = () => Object.assign(F.scrambleDb({ ownerUid: 'u-org' }), { tournamentKeys: { SCR: { on: true, t: { team4: F.KEY4 } } } });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var top = function (s) { var e = $(s); return e && shown(e) ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  var vtop = function (s) { var e = $(s); return e && shown(e) ? Math.round(e.getBoundingClientRect().top) : null; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { panel: shown($('#signin-panel-manage')), panelTop: top('#signin-panel-manage'), panelVTop: vtop('#signin-panel-manage'), boardTop: top('#leaderboard-list'), rows: document.querySelectorAll('#leaderboard-list .lb-row').length,
    hint: t('#org-signin-hint'), hintTop: top('#org-signin-hint'), apple: shown($('#signin-panel-manage-apple')), google: shown($('#signin-panel-manage-google')), vh: window.innerHeight };
})())` };
const go = async (auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: db(), auth, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 a spectator: the board above the sign-in card, the line in the first screen, the card still there', async () => {
    const [a] = await go(GOLFER, [READ]);
    assert.ok(a.rows > 1, 'positive: the board rendered rows: ' + a.rows);
    assert.equal(a.panel, true, 'the sign-in card exists'); assert.equal(a.apple, true); assert.equal(a.google, true);
    assert.ok(a.panelTop > a.boardTop, `the card is below the board: card ${a.panelTop} board ${a.boardTop}`);
    assert.equal(a.hint, 'Organizer? Sign in ›');
    assert.ok(a.hintTop !== null && a.hintTop < 400, 'the line is in the first screen: ' + a.hintTop);
});

test('2 tapping the line brings the card into view', async () => {
    const [before, after] = await go(GOLFER, [READ, { tap: '#org-signin-hint' }, { sleep: 600 }, READ]);
    assert.ok(before.panelVTop > before.vh, 'positive: the card starts below the fold: ' + before.panelVTop);
    assert.ok(after.panelVTop !== null && after.panelVTop >= 0 && after.panelVTop < after.vh, 'the card is on screen after the tap: ' + after.panelVTop);
});

test('3 the owner: no card, no line', async () => {
    const [a] = await go(OWNER, [READ]);
    assert.equal(a.panel, false); assert.equal(a.hint, null);
    assert.ok(a.rows > 1);
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
