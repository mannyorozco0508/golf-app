// EVENT DAY HOME (T3B, Manny's pick 2026-11-10), reached the way an organizer
// reaches it: arrive cold at tournament.html?tourney=CODE signed in as the owner,
// touch nothing (tools/lib/cold-arrival.js). No page function is called; the
// checks read innerText and visibility, and tap real elements.
//
//  1 owner, live event, taps the Event day pill (the only tap): status, leader,
//    start time; Needs you = teams with no score + golfers unpaid (the Desk's count)
//  2 owner, nothing scored, touches nothing: lands on Setup as before (landing on
//    Event day is Manny's call, not built); Event day reads
//    "Not started", "0 of N", and Needs you is empty
//  3 a golfer (not the owner): no Event day pill, no panel
//  4 tapping "golfers unpaid" opens the Desk on its Unpaid chip
//  5 multi-round, amounts saved, no basis the engine can use: "Pick what prizes
//    go by", and its tap reaches the basis control on the board
//  6 money = base: payouts.js, tournament-engine.js, handicap.js are main
//    09a51a93 byte for byte; the home shows no prize amount
//
// Baseline against main 09a51a93 (before the build): all 6 tests: 1 PASS / 5 FAIL.
// The 1 is test 3: on main no golfer sees an Event day pill, because there is none.
// With the build: all 6 tests: 6 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e || e.offsetParent === null) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { pill: shown($('#tab-btn-home')), home: shown($('#manage-tab-home')), setup: shown($('#manage-tab-setup')),
    desk: shown($('#manage-tab-desk')), board: shown($('#manage-tab-leaderboard')),
    k: t('#eh-status-k'), big: t('#eh-status-big'), sub: t('#eh-status-sub'), live: shown($('#eh-live')),
    needs: Array.prototype.map.call(document.querySelectorAll('#eh-needs-list .eh-need'), function (e) { return (e.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    none: t('.eh-none'), homeText: t('#manage-tab-home'),
    chip: t('.reg-chip.active'), basisTop: (function () { var e = $('#payout-basis-control'); return e && shown(e) ? Math.round(e.getBoundingClientRect().top) : null; })() };
})())` };
const go = async (db, code, auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code), db, auth, settleMs: 2500, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const regs = () => ({ SCR: {
    e1: { name: 'Al Lopez', paid: false, approvedAt: 1, teamNum: 4 },
    e2: { name: 'Jo Kim', paid: false, approvedAt: 1, teamNum: 4 },
    e3: { name: 'Ed Ruiz', paid: true, approvedAt: 1, teamNum: 4 } } });
const liveDb = () => Object.assign(F.scrambleDb({ ownerUid: 'u-org' }), { registrations: regs() });

const OPEN = [{ tap: '#tab-btn-home' }, { sleep: 200 }];
test('1 owner, live event, taps Event day: status and Needs you', async () => {
    const [a] = await go(liveDb(), 'SCR', OWNER, OPEN.concat([READ]));
    assert.equal(a.pill, true, 'the Event day pill is there for the owner');
    assert.equal(a.home, true, 'Event day is open');
    assert.equal(a.setup, false);
    assert.equal(a.live, true);
    assert.equal(a.k, 'LIVE NOW', 'innerText is the rendered, upper-cased label');
    assert.equal(a.big, '8 of 18 teams scoring');
    assert.equal(a.sub, 'Leader Team 9 -9 · Shotgun 8:00 AM');
    assert.equal(a.needs.length, 2, JSON.stringify(a.needs));
    assert.match(a.needs[0], /^10 10 teams with no score yet Team 3, Team 5, Team 6, \.\.\. · Send their link$/);
    assert.equal(a.needs[1], '2 2 golfers unpaid Desk');
});

test('2 owner, nothing scored: lands on Setup as before; Event day says Not started', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org', scores: {} });
    const [a, b] = await go(db, 'SCR', OWNER, [READ, { tap: '#tab-btn-home' }, { sleep: 200 }, READ]);
    assert.equal(a.setup, true, 'Setup, the old landing');
    assert.equal(a.home, false);
    assert.equal(b.home, true);
    assert.equal(b.k, 'NOT STARTED');
    assert.equal(b.big, '0 of 18 teams scoring');
    assert.equal(b.live, false);
    assert.deepEqual(b.needs, []);
    assert.equal(b.none, 'Nothing needs you right now.');
});

test('3 a golfer (not the owner) never sees Event day', async () => {
    const [a] = await go(liveDb(), 'SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(a.pill, false);
    assert.equal(a.home, false);
    assert.equal(a.board, true, 'the golfer has the board (positive: the page loaded)');
});

test('4 tapping "golfers unpaid" opens the Desk on its Unpaid chip', async () => {
    const [, b] = await go(liveDb(), 'SCR', OWNER, OPEN.concat([READ, { tap: '#eh-needs-list .eh-need[data-need="unpaid"]' }, { sleep: 300 }, READ]));
    assert.equal(b.desk, true);
    assert.equal(b.home, false);
    assert.equal(b.chip, 'Unpaid 2', 'the same 2 the home counted');
});

test('5 multi-round, prize amounts saved, no usable basis: the home asks, and its tap reaches the basis control', async () => {
    const db = F.groupDb();
    Object.assign(db.tournaments.FLT, { ownerUid: 'u-org', payoutSpots: [100], payoutBasis: 'rGone' });
    const [a, b] = await go(db, 'FLT', OWNER, OPEN.concat([READ, { tap: '#eh-needs-list .eh-need[data-need="basis"]' }, { sleep: 300 }, READ]));
    assert.equal(a.home, true);
    assert.ok(a.needs.some((n) => n === '1 Pick what prizes go by Golfers see "Prize results coming soon" until you do'), JSON.stringify(a.needs));
    assert.equal(b.board, true);
    assert.ok(b.basisTop !== null && b.basisTop >= -2 && b.basisTop < 844, 'the basis control is on screen: top ' + b.basisTop);
});

test('6 money = base; the home shows no prize amount', async () => {
    execFileSync('git', ['diff', '--quiet', '09a51a93', '--', 'payouts.js', 'tournament-engine.js', 'handicap.js'], { cwd: __dirname });
    const [a] = await go(liveDb(), 'SCR', OWNER, OPEN.concat([READ]));
    assert.ok(a.homeText && a.homeText.includes('teams scoring'), 'positive: the home rendered');
    assert.doesNotMatch(a.homeText, /\$|pro shop|credit/);
});
