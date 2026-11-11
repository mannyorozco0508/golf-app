// EDIT NAMES AFTER SAVE, option B (Manny 2026-11-11): an Edit button on each
// Setup team card turns it into editable rows; Save is one update of that
// team's name, players and handicap. Reached the way an organizer reaches it:
// arrive cold (tools/lib/cold-arrival.js) at 390x844 signed in as the owner,
// tap and type; no page function is called.
//
//  1 Edit Team 3 (no scores): rename the team, rename a golfer, add one,
//    remove one, Save -> ONE update with exactly name/players/handicap under
//    teams/team3; nothing else written (no new team, no key write)
//  2 the card after Save shows the new names; the team's scorecard link is the
//    same URL with the same key
//  3 a team WITH scores (Team 4): the remove buttons are disabled and the note
//    says why; a rename saves; the players array keeps every place
//  4 Cancel writes nothing and restores the card
//  5 an empty golfer row refuses Save with a sentence, writes nothing
//  6 a golfer (not the owner) sees no Edit button
//  7 money = base
//
// Baseline against main 3119e847 (before the build): all 6 tests: 2 PASS / 4 FAIL.
// The 2 are test 6 (no Edit button for a golfer, before or after) and test 7.
// With the build: all 6 tests: 6 PASS / 0 FAIL. (Tests 1 and 2 are one test.)
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const K3 = 'k3-' + 'a'.repeat(29), K4 = 'k4-' + 'b'.repeat(29);
const fixture = () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    db.tournaments.SCR.teams.team3 = { num: 3, name: 'Team 3', players: ['J', 'A', 'Zed'], handicap: 0 };
    db.tournamentKeys = { SCR: { on: true, t: { team3: K3, team4: K4 } } };
    return db;
};
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var card = function (n) { var b = document.querySelector('#team-cards-list [data-share-name][data-share-url*="team=' + n + '&"]'); return b ? (b.closest('.team-link-row') || {}).innerText : null; };
  return { editor: !!$('#team-edit-card'), editTeam: ($('#team-edit-card') || { dataset: {} }).dataset.team || null, err: t('#te-err'), note: t('.te-note'),
    xDisabled: Array.prototype.map.call(document.querySelectorAll('#team-edit-card .te-x'), function (b) { return b.disabled; }),
    editBtns: Array.prototype.filter.call(document.querySelectorAll('#team-cards-list .team-edit'), function (b) { var r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0; }).length, card3: card(3) ? card(3).replace(/\\s+/g, ' ').trim() : null,
    link3: (function () { var b = document.querySelector('#team-cards-list [data-share-url*="team=3&"]'); return b ? b.dataset.shareUrl : null; })(),
    writes: (window.__coldWrites || []).filter(function (w) { return !/^organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] } } }, { cdp: { method: 'Input.insertText', params: { text } } }];
const go = async (db, steps, auth) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db, auth: auth || OWNER, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1+2 Edit Team 3: rename team and golfer, add one, remove one, Save -> one update of name/players/handicap; the card and the same keyed link', async () => {
    const [before, mid, after] = await go(fixture(), [READ, { tap: '#team-cards-list .team-edit[data-team="3"]' }, { sleep: 200 }, READ]
        .concat(type('#te-name', 'Ramirez Foursome'), type('#te-p0', 'Josh Ramirez'), [{ tap: '.te-x[data-idx="2"]' }, { sleep: 150 }, { tap: '#te-add' }, { sleep: 150 }], type('#te-p2', 'Al Lopez'),
            type('#te-hcp', '10'), [{ tap: '#te-save' }, { sleep: 400 }, READ]));
    assert.equal(mid.editor, true); assert.equal(mid.editTeam, '3');
    assert.deepEqual(mid.xDisabled, [false, false, false], 'no scores: each golfer can be removed');
    const upd = after.writes.filter((w) => w.op === 'update');
    assert.equal(after.writes.length, 1, JSON.stringify(after.writes));
    assert.deepEqual(upd[0], { op: 'update', path: '', value: {
        'tournaments/SCR/teams/team3/name': 'Ramirez Foursome',
        'tournaments/SCR/teams/team3/players': ['Josh Ramirez', 'A', 'Al Lopez'],
        'tournaments/SCR/teams/team3/handicap': 10 } });
    assert.equal(after.editor, false, 'the editor closed');
    assert.match(after.card3, /Ramirez Foursome/);
    assert.match(after.card3, /Josh Ramirez/); assert.match(after.card3, /Al Lopez/);
    assert.equal(after.link3, before.link3, 'the same scorecard link');
    assert.match(after.link3, new RegExp('team=3&k=' + K3 + '$'), 'with the same key');
});

test('3 a team with scores: remove disabled, the note says why; a rename saves and keeps every place', async () => {
    const [mid, after] = await go(fixture(), [{ tap: '#team-cards-list .team-edit[data-team="4"]' }, { sleep: 200 }, READ].concat(type('#te-p1', 'Jo Kimball'), [{ tap: '#te-save' }, { sleep: 400 }, READ]));
    assert.deepEqual(mid.xDisabled, [true, true, true, true]);
    assert.match(mid.note, /^This team has scores: golfers can be renamed or added, not removed\./);
    assert.deepEqual(after.writes.map((w) => w.value['tournaments/SCR/teams/team4/players']), [['Al Lopez', 'Jo Kimball', 'Ed Ruiz', 'Bo Diaz']]);
});

test('4 Cancel writes nothing and restores the card', async () => {
    const [open, a] = await go(fixture(), [{ tap: '#team-cards-list .team-edit[data-team="3"]' }, { sleep: 200 }, READ].concat(type('#te-name', 'Nope'), [{ tap: '#te-cancel' }, { sleep: 200 }, READ]));
    assert.equal(open.editor, true, 'positive: the editor was open before Cancel');
    assert.equal(a.editor, false);
    assert.deepEqual(a.writes, []);
    assert.match(a.card3, /Team 3/);
});

test('5 an empty golfer row refuses Save with a sentence', async () => {
    const [a] = await go(fixture(), [{ tap: '#team-cards-list .team-edit[data-team="3"]' }, { sleep: 200 }, { tap: '#te-add' }, { sleep: 150 }, { tap: '#te-save' }, { sleep: 300 }, READ]);
    assert.equal(a.editor, true);
    assert.equal(a.err, 'Fill in every golfer, or remove the empty row.');
    assert.deepEqual(a.writes, []);
});

test('6 a golfer (not the owner) sees no Edit button', async () => {
    const [a] = await go(fixture(), [READ], { uid: 'u-golfer', isAnonymous: true });
    assert.equal(a.editBtns, 0);
});

test('7 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
