// BUG HUNT #8 and #13 (2026-11-12, Manny OK fix), both on tournament.html.
//  #8 a wrong event code popped a native alert "Tournament not found." and
//     bounced to the empty page (the organizer page on ?tourney=NOPE, and Open
//     by code with an unknown code). Now the page stays, with one sentence
//     under the hero and in the code box's own error line, the code left in
//     the box to fix; the address drops the bad code.
//  #13 the code box's placeholder rendered "E.G. R7SK48" (the input's uppercase
//     transform applied to it).
// The harness fails an arrival on any native dialog, so test 1 proves there is
// none. Reached the way a person reaches it: arrive cold
// (tools/lib/cold-arrival.js) at 390x844.
//
//  1 (#8) ?tourney=NOPE, signed in: no dialog; the setup screen with the
//    sentence; the code box holds NOPE with its own error line; the address is
//    clean
//  2 (#8) ?tourney=NOPE, signed out on the website (no code box): the sentence
//    still shows under the hero
//  3 (#13) the placeholder renders "e.g. R7SK48": computed text-transform none
//    on ::placeholder, and the typed code is still upper-cased on screen
//  4 money = base
//
// Baseline against main c6a0d97f (tournament.html swapped in by cp, restored
// by sha): all 4 tests: 1 PASS / 3 FAIL (test 4). With the fixes: 4 / 0.
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
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var box = $('#open-code-input');
  return { setup: shown($('#setup-screen')), manage: shown($('#manage-screen')), codeBox: shown($('#app-my-events')), note: t('#not-found-note'), err: t('#open-code-err'), code: box ? box.value : null, search: location.search,
    ph: box ? box.getAttribute('placeholder') : null, phTransform: box ? getComputedStyle(box, '::placeholder').textTransform : null, boxTransform: box ? getComputedStyle(box).textTransform : null };
})())` };
const go = async (query, auth, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db: F.scrambleDb({ ownerUid: 'u-org' }), auth, settleMs: 3500, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 (#8) an unknown code, signed in: no dialog, the sentence, the code in the box, a clean address', async () => {
    const [a] = await go('tourney=NOPE', OWNER);
    assert.equal(a.setup, true); assert.equal(a.manage, false);
    assert.equal(a.note, 'No event matches the code NOPE. Check the code and try again.');
    assert.equal(a.code, 'NOPE');
    assert.equal(a.err, 'No event matches the code NOPE. Check the code and try again.');
    assert.equal(a.search, '', 'the bad code is dropped from the address');
});

test('2 (#8) an unknown code, signed out on the website: the sentence under the hero', async () => {
    const [a] = await go('tourney=NOPE', 'signed-out');
    assert.equal(a.setup, true);
    assert.equal(a.note, 'No event matches the code NOPE. Check the code and try again.');
    assert.equal(a.codeBox, false, 'positive: the My events / code box is hidden on the website when signed out, so the hero note is the only place');
});

test('3 (#13) the placeholder is not upper-cased; a typed code still is', async () => {
    const [a] = await go('', OWNER, [{ tap: '#open-code-input' }, { cdp: { method: 'Input.insertText', params: { text: 'r7sk48' } } }, READ]);
    assert.equal(a.ph, 'e.g. R7SK48');
    assert.equal(a.phTransform, 'none');
    assert.equal(a.boxTransform, 'uppercase', 'positive: the typed code still reads upper-cased');
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
