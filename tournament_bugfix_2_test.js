// BUG HUNT #2 (2026-11-12, Manny OK fix): a link WITHOUT its scoring key on an
// event whose keys are on. The page cannot know the keys are on before it
// writes (tournamentKeys/<code> is readable by the owner only, live rules
// 2026-11-11), so the first write is where it learns: the database refuses it
// (PERMISSION_DENIED). Before: the red "can't score this card" sentence under
// the status, but 18 boxes stayed editable and the card still said "Anyone
// with this link can score this card." Now, on that refusal from a keyless
// link, the card goes read-only, the sentence names the missing key, and the
// Leaderboard tab still works. A refusal on a link THAT HAS a key keeps the
// old sentence (the key is wrong or the event is frozen; the boxes stay).
// Reached the way the golfer reaches it: arrive cold (tools/lib/cold-arrival.js)
// at 390x844, tap the box, type, leave it. The stand-in database accepts every
// write, so the harness makes score writes reject exactly as the SDK reports a
// refusal; the page never calls a test function.
//
//  1 keyless link, write refused: every box disabled, no "Saved", the status
//    sentence and #link-truth both name the missing key; Leaderboard renders
//  2 keyed link, write refused: the old sentence, boxes still editable
//  3 positive control: keyless link, write accepted (keys off): "✓ Saved",
//    boxes editable, "Anyone with this link can score this card."
//  4 money = base
//
// Baseline against main c6a0d97f (tournament-scorecard.html swapped in by cp,
// restored by sha): all 4 tests: 3 PASS / 1 FAIL (test 1). With the fix: 4 / 0.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const UA = `Object.defineProperty(navigator, 'userAgent', { get: function () { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'; } });`;
// Score writes reject with PERMISSION_DENIED, the way the SDK reports a rule refusal.
const REFUSE_SCORES = `(function () { var orig = window.firebase && firebase.database; if (!orig) return; firebase.database = function () { var real = orig.apply(window.firebase, arguments); var out = Object.create(real); out.ref = function (p) { var r = real.ref(p); var proxy = Object.create(r); ['update', 'set'].forEach(function (m) { proxy[m] = function (v) { var hit = /\\/scores\\//.test(String(p || '')) || (v && typeof v === 'object' && Object.keys(v).some(function (k) { return /\\/scores\\//.test(k); })); if (hit) return Promise.reject({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED: Permission denied' }); return r[m].apply(r, arguments); }; }); ['on', 'once', 'off', 'push', 'child', 'remove'].forEach(function (m) { proxy[m] = function () { return r[m].apply(r, arguments); }; }); return proxy; }; return out; }; Object.keys(orig).forEach(function (k) { firebase.database[k] = orig[k]; }); })();`;
const keyed = (db) => Object.assign(db, { tournamentKeys: { SCR: { on: true, t: { team4: F.KEY4 } } } });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var inputs = document.querySelectorAll('#holes-list input');
  return { save: t('#save-state'), truth: t('#link-truth'), inputs: inputs.length, disabled: Array.prototype.filter.call(inputs, function (i) { return i.disabled; }).length,
    rows: document.querySelectorAll('#leaderboard-list .lb-row').length, board: shown($('#tab-leaderboard')), body: (document.body.innerText || '').replace(/\\s+/g, ' ') };
})())` };
const SCORE = [{ expression: "(function(){ var e = document.querySelector('#hole-row-7 input'); e.scrollIntoView({block:'center'}); return 1; })()" }, { tap: '#hole-row-7 input' }, { cdp: { method: 'Input.insertText', params: { text: '4' } } }, { expression: "document.querySelector('#hole-row-7 input').blur(), 1" }, { sleep: 700 }, READ];
const go = async (query, db, pre, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', query), db, auth: GOLFER, settleMs: 3000, preScript: pre, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const MISSING = 'This link is missing its scoring key. Ask your organizer for your team’s link; the leaderboard still works.';

test('1 keyless link, refused: read-only card, the missing-key sentence, the board still works', async () => {
    const [a, b] = await go('tourney=SCR&team=4', keyed(F.scrambleDb({ ownerUid: 'u-org' })), UA + REFUSE_SCORES, SCORE.concat([{ tap: '#tab-btn-leaderboard' }, { sleep: 400 }, READ]));
    assert.equal(a.inputs, 18, 'positive: the card rendered');
    assert.equal(a.disabled, 18, 'every box disabled after the refusal');
    assert.doesNotMatch(a.body, /✓ Saved/);
    assert.match(a.save || '', /missing its scoring key/);
    assert.equal(a.truth, MISSING);
    assert.equal(b.board, true); assert.ok(b.rows > 1, 'the board rendered rows: ' + b.rows);
});

test('2 keyed link, refused: the old sentence, boxes stay', async () => {
    const [a] = await go('tourney=SCR&team=4&k=' + F.KEY4, keyed(F.scrambleDb({ ownerUid: 'u-org' })), UA + REFUSE_SCORES, SCORE);
    assert.match(a.save || '', /Not saved — this link can’t score this card|Not saved — this link can't score this card/);
    assert.equal(a.disabled, 0);
    assert.equal(a.truth, 'Anyone with this link can score this card.');
});

test('3 positive control: keyless link accepted (keys off): Saved, boxes editable', async () => {
    const [a] = await go('tourney=SCR&team=4', F.scrambleDb({ ownerUid: 'u-org' }), UA, SCORE);
    assert.equal(a.save, '✓ Saved');
    assert.equal(a.disabled, 0);
    assert.equal(a.truth, 'Anyone with this link can score this card.');
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
