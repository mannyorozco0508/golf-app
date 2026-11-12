// BUG HUNT #6 (2026-11-12, Manny OK fix): a locked round's card kept saying
// "Anyone with this link can score this card." under its status while every
// box was disabled. (The hunt's fixture used a status "final", which the
// engine does not know - it reads as "setup", hence "not open for scoring
// yet"; the false sentence is the same on a real "setup" or "closed" round.)
// Now the who-can-score line follows the round: closed -> "This round is
// closed; scores are final.", setup -> "This round isn't open for scoring
// yet.", open -> unchanged. Reached the way a golfer reaches it: arrive cold
// (tools/lib/cold-arrival.js) at 390x844 on the group link, touch nothing.
//
//  1 closed round: every box disabled; status says closed; the line says
//    closed, not "anyone can score"
//  2 setup round: every box disabled; the line says not open yet
//  3 open round: boxes editable; the line is "Anyone with this link can score
//    this card." (positive control)
//  4 money = base
//
// Baseline against main c6a0d97f (tournament-scorecard.html swapped in by cp,
// restored by sha): all 4 tests: 2 PASS / 2 FAIL (tests 3 and 4). With the fix: 4 / 0.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const READ = { expression: `JSON.stringify((function () {
  var t = function (s) { var e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none' ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var inputs = document.querySelectorAll('#holes-list input');
  return { sub: t('#status-sub'), truth: t('#link-truth'), inputs: inputs.length, disabled: Array.prototype.filter.call(inputs, function (i) { return i.disabled; }).length };
})())` };
const withStatus = (status) => { const d = F.groupDb(); d.tournaments.FLT.ownerUid = 'u-org'; d.tournaments.FLT.rounds.r2.status = status; return d; };
const go = async (db) => {
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=FLT&group=g3&round=r2'), db, auth: GOLFER, settleMs: 3000, steps: [READ] });
    assert.ok(r.ok, r.reason);
    return JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
};

test('1 a closed round: locked, and the line says so', async () => {
    const a = await go(withStatus('closed'));
    assert.ok(a.inputs > 0 && a.disabled === a.inputs, `every box disabled: ${a.disabled}/${a.inputs}`);
    assert.equal(a.sub, 'This round is closed — scores are final');
    assert.equal(a.truth, 'This round is closed; scores are final.');
});

test('2 a round still in setup: locked, and the line says not yet', async () => {
    const a = await go(withStatus('setup'));
    assert.ok(a.inputs > 0 && a.disabled === a.inputs);
    assert.equal(a.sub, 'This round is not open for scoring yet');
    assert.equal(a.truth, 'This round isn’t open for scoring yet.');
});

test('3 an open round: editable, the old line (positive control)', async () => {
    const a = await go(withStatus('open'));
    assert.ok(a.inputs > 0 && a.disabled === 0);
    assert.equal(a.truth, 'Anyone with this link can score this card.');
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
