// ============================================================================
// A WITHDRAWN GOLFER'S CONTEST MARK NEVER LEADS (Manny 2026-11-19: "OK fix the
// withdrawn-golfer KP defect on a preview").
//
// FOUND BY tools/event-sim (the full-event simulation, 2026-11-19): a golfer
// withdrawn after nine holes had the best closest-to-the-pin mark on hole 3.
// The organizer's Contest holes list showed them first, so they were the one
// "Make winner" confirmed and Post results posted. The board already left them
// out (tournament-engine.js isWithdrawn); the contest ranking did not, and its
// "through" count read players[pid].withdrawn, a field nothing writes.
//
// THE ENTRY POINT. W1-W3 arrive the way the organizer does: tournament.html
// ?tourney=.., the page's own listeners fired with the record, then a tap on
// the Contests tab. No test names a render function the page defines.
// The golfer's own contest board left the card on 2026-11-11 (EC2 A,
// tournament_contests_test.js C1), so the organizer's list is the one screen
// that shows the ranking; the recap names only confirmed winners.
// W4 is the "through" count. Nothing on any page draws it any more (it lived on
// the golfer board), so it has no user entry point: it is tested as a function,
// and that is said here rather than dressed up.
//
// mini-dom: innerHTML is a string, so the rows are read as text and the
// Make winner buttons by their data-entry attribute.
//
// BASELINE (final file, 4 tests), against live main a0040730 (tournament-contests.js
//   and the two pages as deployed): 1 PASS / 3 FAIL. W2 passes there (the
//   un-withdrawn control: nothing to leave out). W1, W3 and W4 fail: the
//   withdrawn golfer leads and has a Make winner button, and the through count is 3.
//   After the fix: 4 PASS / 0 FAIL.
// NEGATIVE CONTROLS (each mutated in place, restored by copying a saved file
//   back and printing its sha beside RESTORED-OK):
//   1. ranked() ignores withdrawnKey                       -> W1, W3 fail
//   2. tournament.html passes no record to ranked()        -> W1, W3 fail
//   3. withdrawnKey reads .withdrawn instead of .status    -> W1, W3, W4 fail
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const ORG = 'tournament.html';
const ORG_HTML = fs.readFileSync(path.join(REPO_ROOT, ORG), 'utf8');
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const clone = (o) => JSON.parse(JSON.stringify(o));

// A group event, the scoring model the simulation ran: entries are keyed by player id.
function groupEvent(withdrawn) {
    const players = {
        p1: { id: 'p1', name: 'Wes Gone', handicap: '10', addedAt: 1 },
        p2: { id: 'p2', name: 'Ana Next', handicap: '12', addedAt: 2 },
        p3: { id: 'p3', name: 'Bo Third', handicap: '14', addedAt: 3 }
    };
    if (withdrawn) players.p1.status = 'withdrawn';
    const scores = {};
    ['p1', 'p2', 'p3'].forEach((p) => { scores[p + '_h3'] = 3; });
    return { name: 'Sim Club', format: 'individual', scoringModel: 'player-v1', courseName: 'Sim', courseData: COURSE, createdAt: 1,
        ownerUid: 'u-org', players, scores,
        scoringGroups: { g1: { name: 'Group 1', startingHole: '1', playerIds: ['p1', 'p2', 'p3'], createdAt: 1 } },
        contests: { h3: { kind: 'kp', allowGps: true } } };
}
const ENTRIES = { h3: {
    p1: { name: 'Wes Gone', team: 'g1', kind: 'kp', inches: 9, by: 'typed', at: 1 },
    p2: { name: 'Ana Next', team: 'g1', kind: 'kp', inches: 49, by: 'typed', at: 2 },
    p3: { name: 'Bo Third', team: 'g1', kind: 'kp', inches: 80, by: 'typed', at: 3 } } };

function fire(sb, re, value) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'the page registered no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(value), exists: () => value != null }));
}
function tapTab(sb) {
    const tag = (ORG_HTML.match(/<(button|span)\b[^>]*>/g) || []).find((t) => /\bid="tab-btn-contests"/.test(t));
    assert.ok(tag, 'positive: the Contests tab button is in the page');
    const m = /\bonclick="([^"]*)"/.exec(tag);
    sb.__tapEl = { dataset: {} };
    vm.runInContext('(function () { return ' + m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") + ' }).call(__tapEl)', sb);
}
function arriveOwner(rec) {
    const sb = loadHtmlInlineScript(ORG, [], { search: '?tourney=WD1' });
    sb.__auth.setUser(ORGANIZER);
    fire(sb, /^tournaments\/WD1$/, rec);
    fire(sb, /^contestEntries\/WD1$/, ENTRIES);
    tapTab(sb);
    return sb;
}
const entriesHtml = (sb) => String(sb.document.getElementById('contest-entries').innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('W1 the organizer opens Contests after withdrawing the hole-3 leader: the next golfer leads, the withdrawn mark is not listed', () => {
    const sb = arriveOwner(groupEvent(true));
    const t = plain(entriesHtml(sb));
    assert.match(t, /^Hole 3 entries Ana Next 4 ft 1 in Make winner Remove Bo Third 6 ft 8 in Make winner Remove/, 'positive: the list rendered, Ana first');
    assert.doesNotMatch(t, /Wes Gone/);
});

test('W2 control: the same event, nobody withdrawn: the best mark leads as before', () => {
    const sb = arriveOwner(groupEvent(false));
    assert.match(plain(entriesHtml(sb)), /^Hole 3 entries Wes Gone 0 ft 9 in Make winner Remove Ana Next 4 ft 1 in/);
});

test('W3 no Make winner can be tapped for the withdrawn golfer; one exists for the next', () => {
    const h = entriesHtml(arriveOwner(groupEvent(true)));
    const btns = h.match(/<button\b[^>]*makeContestWinner[^>]*>/g) || [];
    assert.ok(btns.some((b) => /data-entry="p2"/.test(b)), 'positive: Ana has a Make winner button');
    assert.ok(!btns.some((b) => /data-entry="p1"/.test(b)), 'the withdrawn golfer has none');
});

test('W4 the through count leaves the withdrawn golfer out (function only: no page draws it now)', () => {
    const C = require('./tournament-contests.js');
    const rec = groupEvent(true);
    assert.deepEqual(C.throughCount(rec, 3), { done: 2, total: 2, noun: 'golfers' });
    assert.deepEqual(C.throughCount(groupEvent(false), 3), { done: 3, total: 3, noun: 'golfers' }, 'positive: all three count when none withdrew');
});
