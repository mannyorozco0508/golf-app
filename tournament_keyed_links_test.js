// EVERY SCORECARD LINK THE OWNER'S PAGE OFFERS CARRIES ITS TEAM'S KEY once the
// keys are on (Advisor 2026-11-11 15:09: a QR link with no &k= on an event whose
// lock panel said "Keys are on"). Reached the way the organizer reaches it: a
// cold arrival (tools/lib/cold-arrival.js) at 390x844 signed in as the owner,
// keys on for every team in the fixture; the record's snapshot lands before the
// keys', as it does live. No page function is called: the check reads every
// element that holds a scorecard URL (Share buttons' data-share-url, the inline
// QR boxes' data-url, Send/QR buttons, hrefs) on the Setup and Leaderboard tabs,
// and taps a Setup Share to read the modal's link.
//
//  1 keys on: every scorecard link on Setup and Leaderboard has &k=<that team's
//    key>; the Setup card's Share opens a modal whose link has it too; the
//    count is positive
//  2 keys not on (an event from before the lock): no link has &k=, and the
//    lock panel does not claim keys
//  3 money = base
//
// Baseline against main 94004026 (before the fix): all 3 tests: 2 PASS / 1 FAIL.
// The 1 is test 1: 18 Setup Share links (and the modal) had no key.
// With the fix: all 3 tests: 3 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const keysFor = () => { const t = {}; for (let n = 1; n <= 18; n++) t['team' + n] = 'k' + String(n).padStart(2, '0') + '-' + 'a'.repeat(27); return t; };
const READ = { expression: `JSON.stringify((function () {
  var links = [];
  document.querySelectorAll('[data-share-url],[data-url],a[href*="tournament-scorecard"]').forEach(function (e) {
    var u = e.dataset.shareUrl || e.dataset.url || e.getAttribute('href') || '';
    if (!/tournament-scorecard/.test(u)) return;
    var team = (u.match(/[?&]team=([0-9]+)/) || [])[1]; var k = (u.match(/[?&]k=([a-z0-9-]+)/) || [])[1] || null;
    links.push({ where: (e.closest('[id]') || {}).id, team: team, k: k });
  });
  var modal = (document.getElementById('share-link-text') || {}).innerText || '';
  var lock = ((document.getElementById('lock-links-state') || {}).innerText || '').trim();
  return { n: links.length, links: links, modal: modal, lock: lock };
})())` };
const go = async (db, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db, auth: OWNER, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 keys on: every scorecard link on Setup and Leaderboard carries its team\'s key; the Setup Share modal too', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    const keys = keysFor();
    db.tournamentKeys = { SCR: { on: true, t: keys } };
    const [setup, board, modal] = await go(db, [READ, { tap: '#tab-btn-leaderboard' }, { sleep: 400 }, READ,
        { tap: '#tab-btn-setup' }, { sleep: 300 }, { tap: '#team-cards-list [data-share-url][data-share-name="Team 4"]' }, { sleep: 300 }, READ]);
    assert.match(setup.lock, /^Keys are on/, 'positive: the lock panel says keys are on');
    for (const [name, v] of [['Setup', setup], ['Leaderboard', board]]) {
        assert.ok(v.n >= 18, name + ': links found: ' + v.n);
        const bad = v.links.filter((l) => !l.team || l.k !== keys['team' + l.team]);
        assert.deepEqual(bad, [], name + ': links without their team\'s key');
    }
    assert.match(modal.modal, /tournament-scorecard\.html\?tourney=SCR&team=4&k=k04-a{27}$/, 'the modal from the Setup card: ' + modal.modal);
});

test('2 keys not on (an event from before the lock): no link claims a key, and the lock panel says so', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' });
    const [setup] = await go(db, [READ]);
    assert.ok(setup.n >= 18, 'links found: ' + setup.n);
    assert.deepEqual(setup.links.filter((l) => l.k), [], 'no key to carry');
    assert.doesNotMatch(setup.lock, /^Keys are on/);
});

test('3 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
