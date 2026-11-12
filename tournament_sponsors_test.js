// HOLE SPONSORS, placement A (57; Manny 2026-11-12): the organizer names an
// event sponsor and a sponsor per hole on Setup; a sponsored hole shows one
// grey line under the hole name on the team card (the score box does not
// move); "Presented by" reads under the card's title; the recap thanks them;
// the Board tab gives the owner the TV board link. Reached the way each person
// reaches it: arrive cold (tools/lib/cold-arrival.js) at 390x844, tap and type;
// no page function is called.
//
//  1 the owner on Setup: the Sponsors block; typing the event sponsor writes
//    ONE update tournaments/SCR/sponsors/event {name}; Hole 7 + a name + Add
//    writes ONE set tournaments/SCR/sponsors/holes/7 {name}; Add with no name
//    refuses with a sentence and writes nothing
//  2 a golfer (not the owner) sees no sponsor inputs and no TV link
//  3 the golfer's card with sponsors: hole 7's row carries the line, hole 8's
//    does not; the score boxes sit where they sit without sponsors; Presented
//    by under the title. The multi-golfer card (best ball) carries it too
//  4 the recap lists the event sponsor and the holes
//  5 the owner's Board tab shows the TV link ending tournament-tv.html?tourney=SCR
//  6 money = base
//  7 the owner signs in AFTER the record arrived: the Sponsors block and the
//    Board tab's TV link draw (added 2026-11-12)
//
// Not proven here: the logo file -> 96 px data URL path (a file input cannot
// be driven cold); it is read by hand on the preview.
//
// Baseline against main 0f11073c (re-measured after the rebase; before the build): all 6 tests: 2 PASS / 4 FAIL
// (tests 2 and 6). With the build: 6 PASS / 0 FAIL.
// All 7 tests against preview-57 d29e5818 (page swapped in by cp, restored by
// sha): 6 PASS / 1 FAIL (test 7, the block empty). With the fix: 7 PASS / 0 FAIL.
// Control: the TV-link redraw removed alone -> test 7 red on the TV row.
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
const SPONSORS = { event: { name: 'Desert Ridge Auto' }, holes: { '7': { name: 'Sun Devil Dental' } } };
const withSponsors = (db) => { db.tournaments.SCR.sponsors = JSON.parse(JSON.stringify(SPONSORS)); return db; };
const ORG = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { block: shown($('#sponsors-setup')), eventInput: shown($('#sp-event-name')), addBtn: shown($('#sp-add')), err: t('#sp-err'),
    holeRows: Array.prototype.map.call(document.querySelectorAll('#sponsors-setup .sp-row'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    tvRow: shown($('#tv-link-row')), tvUrl: t('#tv-url'), recap: t('#recap-sponsors'),
    writes: (window.__coldWrites || []).filter(function (w) { return !/^organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const CARD = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e && shown(e) ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var box = function (n) { var r = document.getElementById('hole-row-' + n); var i = r && r.querySelector('input'); if (!i) return null; var b = i.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
  return { row7: t('#hole-row-7'), row8: t('#hole-row-8'), sp7: t('#hole-row-7 .hole-sponsor'), sp8: t('#hole-row-8 .hole-sponsor'), box7: box(7), box8: box(8),
    presented: t('#event-sponsor'), lines: document.querySelectorAll('#holes-list .hole-sponsor').length, writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())` };
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.insertText', params: { text } } }];
const go = async (page, query, db, auth, steps) => {
    const r = await arriveCold({ url: fileUrl(page, query), db, auth, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const setupTab = [{ tap: '#tab-btn-setup' }, { sleep: 300 }];
const scrollTo = (sel) => ({ expression: `(function(){ var e = document.querySelector('${sel}'); if (e) e.scrollIntoView({block:'center'}); return !!e; })()` });

test('1 the owner names the event sponsor and a hole sponsor: one write each; Add with no name refuses', async () => {
    const steps = setupTab.concat([scrollTo('#sponsors-setup'), { sleep: 200 }, ORG], type('#sp-event-name', 'Desert Ridge Auto'), [{ expression: "document.getElementById('sp-event-name').blur(), 1" }, { sleep: 300 }, ORG,
        { tap: '#sp-add' }, { sleep: 300 }, ORG, { expression: "document.getElementById('sp-hole').value = '7', 1" }], type('#sp-name', 'Sun Devil Dental'), [{ tap: '#sp-add' }, { sleep: 400 }, ORG,
        // The stand-in database re-fires nothing on a write (by design); the SDK
        // would deliver the next snapshot, so the harness delivers it here.
        { deliver: { path: 'tournaments/SCR', value: Object.assign(F.scrambleDb({ ownerUid: 'u-org' }).tournaments.SCR, { sponsors: { event: { name: 'Desert Ridge Auto' }, holes: { '7': { name: 'Sun Devil Dental' } } } }) } }, { sleep: 300 }, ORG]);
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: OWNER, settleMs: 3500, steps });
    assert.ok(r.ok, r.reason);
    const del = r.value.find((v) => v && typeof v === 'object' && 'listeners' in v);
    assert.ok(del && del.listeners > 0 && !(del.threw || []).length, 'the second snapshot reached a listener: ' + JSON.stringify(del));
    const [before, afterEvent, refused, afterHole, listed] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.equal(before.block, true, 'the Sponsors block is on Setup');
    assert.equal(before.eventInput, true); assert.equal(before.addBtn, true);
    assert.deepEqual(afterEvent.writes, [{ op: 'update', path: 'tournaments/SCR/sponsors/event', value: { name: 'Desert Ridge Auto' } }]);
    assert.equal(refused.err, 'Type the sponsor’s name.');
    assert.equal(refused.writes.length, 1, 'the refusal wrote nothing');
    assert.deepEqual(afterHole.writes[1], { op: 'set', path: 'tournaments/SCR/sponsors/holes/7', value: { name: 'Sun Devil Dental' } });
    assert.equal(afterHole.writes.length, 2);
    assert.match(listed.holeRows.join('|'), /Hole 7 Sun Devil Dental/, 'the next snapshot lists it: ' + JSON.stringify(listed.holeRows));
    assert.equal(listed.addBtn, true, 'and the Add row is still there for the next hole');
});

test('2 a golfer sees no sponsor inputs and no TV link', async () => {
    const [a] = await go('tournament.html', 'tourney=SCR', withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER, [ORG]);
    assert.equal(a.eventInput, false); assert.equal(a.addBtn, false); assert.equal(a.tvRow, false);
});

test('3 the card: one grey line on hole 7, none on hole 8, the score boxes where they were; Presented by; best ball too', async () => {
    const q = 'tourney=SCR&team=4&k=' + F.KEY4;
    const [plain] = await go('tournament-scorecard.html', q, F.scrambleDb({ ownerUid: 'u-org' }), GOLFER, [CARD]);
    const [a] = await go('tournament-scorecard.html', q, withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER, [CARD]);
    assert.equal(plain.lines, 0, 'positive control: no lines without sponsors');
    assert.equal(a.lines, 1);
    assert.equal(a.sp7, 'Hole sponsor · Sun Devil Dental');
    assert.match(a.row7, /^Hole 7 Par 4 /);
    assert.equal(a.sp8, null); assert.doesNotMatch(a.row8 || '', /sponsor/i);
    assert.deepEqual(a.box7, plain.box7, 'hole 7 score box did not move: ' + JSON.stringify([a.box7, plain.box7]));
    assert.deepEqual(a.box8, plain.box8);
    assert.equal(a.presented, 'Presented by Desert Ridge Auto');
    assert.equal(plain.presented, null);
    const bb = F.bestBallDb(); bb.tournaments.BBL.sponsors = JSON.parse(JSON.stringify(SPONSORS));
    const [b] = await go('tournament-scorecard.html', 'tourney=BBL&team=3', bb, GOLFER, [CARD]);
    assert.equal(b.sp7, 'Hole sponsor · Sun Devil Dental', 'the per-golfer card carries it too');
});

test('4 the recap thanks the sponsors', async () => {
    const [a] = await go('tournament.html', 'tourney=SCR&recap=1', withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER, [ORG]);
    assert.match(a.recap || '', /^THANKS TO OUR SPONSORS Event sponsor Desert Ridge Auto Hole 7 Sun Devil Dental$/);
    const [b] = await go('tournament.html', 'tourney=SCR&recap=1', F.scrambleDb({ ownerUid: 'u-org' }), GOLFER, [ORG]);
    assert.equal(b.recap, null, 'no sponsors: no card');
});

test('5 the owner\'s Board tab shows the TV link', async () => {
    const [a] = await go('tournament.html', 'tourney=SCR', F.scrambleDb({ ownerUid: 'u-org' }), OWNER, [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, ORG]);
    assert.equal(a.tvRow, true);
    assert.match(a.tvUrl, /\/tournament-tv\.html\?tourney=SCR$/);
});

test('6 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});

// 7 (found 2026-11-12 from the 58 report on Manny's iPad: an owner-only block
// drew empty when the record arrived BEFORE the sign-in). Arrive signed out,
// the owner signs in through the stand-in's door (no page function): Setup
// shows the Sponsors block with its inputs, the Board tab shows the TV link.
test('7 the owner signs in AFTER the record arrived: the Sponsors block and the TV link draw', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: F.scrambleDb({ ownerUid: 'u-org' }), auth: 'signed-out', settleMs: 3500,
        steps: [{ expression: `window.__signInAs(${JSON.stringify(OWNER)})` }, { sleep: 600 }, ...setupTab, scrollTo('#sponsors-setup'), { sleep: 200 }, ORG,
            { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, ORG] });
    assert.ok(r.ok, r.reason);
    const [s, b] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.equal(s.block, true, 'positive: the Sponsors block drew on Setup');
    assert.equal(s.eventInput, true); assert.equal(s.addBtn, true);
    assert.equal(b.tvRow, true, 'the TV link row on the Board tab');
    assert.match(b.tvUrl || '', /\/tournament-tv\.html\?tourney=SCR$/);
    assert.deepEqual(s.writes, [], 'drawing writes nothing');
});
