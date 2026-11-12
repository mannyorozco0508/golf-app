// BUG HUNT #1 (2026-11-12, Manny OK fix): the course picker applied a
// DIFFERENT shared course's scorecard on one shared word. bestSharedCourseKey
// accepted a shared record when it shared ceil(tokens/2) distinctive words
// with the picked name, so "The Boulders (North)" took "Troon North Monument"
// (every par on the event would have been Troon's). Now every distinctive word
// of the picked name must be in the shared name. Reached the way the organizer
// reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844 on the create
// form, type in the course box, tap the row; the online lookup answers nothing
// (no key here), so the shared list is the only other source.
//
//  1 shared list holds "Troon North Monument"; type "boul", tap "The Boulders
//    (North)": the box reads The Boulders (North), the course key is NOT the
//    Troon record, the note is the placeholder note (amber), not "from the
//    shared course list"
//  2 positive: shared list holds "Papago Golf Course"; type "pap", tap "Papago
//    Golf Club": the shared card IS used (green note), as before
//  3 shared list holds "Boulders South"; tap "The Boulders (North)": not taken
//    (one word shared, one word contradicted)
//  4 money = base
//
// Baseline against main c6a0d97f (tournament.html swapped in by cp, restored
// by sha): all 4 tests: 2 PASS / 2 FAIL (tests 2 and 4). With the fix: 4 / 0.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const NOFETCH = `(function () { var real = window.fetch; window.fetch = function (u) { var s = String(u); if (/\\/api\\//.test(s)) return Promise.resolve(new Response(JSON.stringify({ status: 'ok', courses: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })); return real.apply(this, arguments); }; })();`;
const course = (name) => ({ name, data: F.PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 })) });
const db = (shared) => ({ tournaments: {}, events: {}, trips: {}, global_courses: shared });
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = function (s) { var e = $(s); return e && getComputedStyle(e).display !== 'none' ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { box: ($('#course-search-input') || {}).value, key: ($('#course-key') || {}).value, note: t('#course-note'), noteClass: ($('#course-note') || {}).className || '',
    options: Array.prototype.map.call(document.querySelectorAll('#course-dropdown .custom-select-option'), function (o) { return (o.innerText || '').trim(); }) };
})())` };
const pick = async (shared, typed) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', ''), db: db(shared), auth: OWNER, settleMs: 3000, preScript: NOFETCH,
        steps: [{ tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: typed } } }, { sleep: 250 }, READ, { tap: '#course-dropdown .custom-select-option:not(.course-shared-row)' }, { sleep: 900 }, READ] });   // re-pinned 2026-11-12 (bug #11 A): the shared list now sits first in the dropdown, so the DIRECTORY row is tapped by class, as the organizer taps it by name; the claim (what the auto-fetch matches) is unchanged
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 "The Boulders (North)" does not take "Troon North Monument" from the shared list', async () => {
    const [list, a] = await pick({ t1: course('Troon North Monument') }, 'boul');
    assert.match(list.options[0] || '', /^The Boulders \(North\)/, 'positive: the first row is the Boulders: ' + JSON.stringify(list.options));
    assert.equal(a.box, 'The Boulders (North)');
    assert.notEqual(a.key, 't1', 'not the Troon record');
    assert.doesNotMatch(a.note || '', /shared course list|Troon/);
    assert.match(a.note || '', /Pars are set to 4/, 'the placeholder note, in the open');
    assert.doesNotMatch(a.noteClass, /\bok\b/);
});

test('2 positive: "Papago Golf Club" still takes the shared "Papago Golf Course" card', async () => {
    const [, a] = await pick({ p1: course('Papago Golf Course') }, 'pap');
    assert.equal(a.key, 'p1');
    assert.equal(a.note, 'Scorecard: Papago Golf Course, from the shared course list.');
    assert.match(a.noteClass, /\bok\b/);
});

test('3 "Boulders South" is not "The Boulders (North)"', async () => {
    const [, a] = await pick({ s1: course('Boulders South') }, 'boul');
    assert.equal(a.box, 'The Boulders (North)');
    assert.notEqual(a.key, 's1');
    assert.doesNotMatch(a.note || '', /shared course list/);
});

test('4 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
