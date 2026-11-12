// OPEN AN EVENT BY CODE (Advisor 2026-11-11 18:05: Manny, signed in on the
// website with no events listed, found no way to open the event he runs and
// had to type ?tourney=R7SK48 into the address bar). Reached the way the
// organizer reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844 at
// tournament.html, tap the box, type, tap Open; no page function is called.
//
//  1 signed in, nothing listed: the box is under My events; type " scr " (lower
//    case, spaces), Open -> the event opens as the owner, and the account
//    pointer organizers/u-org/tournaments/SCR is written (same as the link)
//  2 a bad code ("R7") refuses with a sentence and stays on the page
//  3 a half-typed code survives the account list redrawing
//  4 money = base
//
// Baseline against my-events-account f1c8ebd4 (before the box): all 4 tests:
// 1 PASS / 3 FAIL (test 4). With the build: all 4 tests: 4 PASS / 0 FAIL.
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
  var box = $('#open-code-input'), panel = $('#app-my-events');
  return { box: shown(box), boxInPanel: !!(box && panel && panel.contains(box)), label: t('.open-code label'), value: box ? box.value : null,
    err: t('#open-code-err'), rows: Array.prototype.map.call(document.querySelectorAll('#app-my-events .my-event'), function (b) { return b.dataset.code; }), note: t('#app-my-events .my-events-note'), manage: shown($('#manage-screen')), href: location.search,
    writes: (window.__coldWrites || []).filter(function (w) { return /organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path }; }) };
})())` };
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.insertText', params: { text } } }];
const go = async (steps) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: OWNER, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 the box under My events: type a code, Open -> the event opens and the pointer is written', async () => {
    const [before, after] = await go([READ].concat(type('#open-code-input', ' scr '), [{ tap: '#open-code-btn' }, { sleep: 3500 }, READ]));
    assert.equal(before.box, true, 'the box is on screen');
    assert.equal(before.boxInPanel, true, 'inside My events');
    assert.equal(before.label, 'Open an event by code');
    assert.equal(before.note, 'No events yet. Create one below, or open an event you run by its code.');
    assert.equal(after.href, '?tourney=SCR');
    assert.equal(after.manage, true, 'the event opened as the owner');
    assert.deepEqual(after.writes, [{ op: 'update', path: 'organizers/u-org/tournaments/SCR' }]);
});

test('2 a bad code refuses with a sentence and stays', async () => {
    const [a] = await go(type('#open-code-input', 'R7').concat([{ tap: '#open-code-btn' }, { sleep: 400 }, READ]));
    assert.equal(a.box, true, 'positive: still on the page');
    assert.equal(a.err, 'Type the event code: letters and numbers, like R7SK48.');
    assert.equal(a.href, '');
});

test('3 a half-typed code survives a redraw of the list', async () => {
    const redraw = { deliver: { path: 'organizers/u-org/tournaments', value: { ZZZZ: { at: 1, name: 'Other' } } } };
    const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: OWNER, settleMs: 3500, steps: type('#open-code-input', 'R7S').concat([redraw, { sleep: 500 }, READ]) });
    assert.ok(r.ok, r.reason);
    const del = r.value.find((v) => v && typeof v === 'object' && 'listeners' in v);
    assert.ok(del && del.listeners > 0 && !(del.threw || []).length, JSON.stringify(del));
    const a = JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
    assert.deepEqual(a.rows, ['ZZZZ'], 'positive: the list did redraw');
    assert.equal(a.value, 'R7S');
    assert.equal(a.box, true);
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
