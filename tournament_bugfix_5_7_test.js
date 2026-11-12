// BUG HUNT #5 and #7 (2026-11-12, Manny OK fix), both on tournament.html.
//  #5 a multi-round event's header read "undefined • Individual Stroke Play":
//     the course lives on each round, not on the event. Now the header uses the
//     event's course, else the latest round's, else the format alone.
//  #7 the recap said "🏆 Winners" while play was on. Now, until every counted
//     card is complete (or the round is closed), the row reads "⏳ Leading" with
//     the holes played; a finished field gets "🏆 Winners".
// Reached the way the organizer / a golfer reaches it: arrive cold
// (tools/lib/cold-arrival.js) at 390x844, touch nothing.
//
//  1 (#5) the owner opens a two-round event: the header is "Tidewater •
//    Individual Stroke Play" (the rounds' course), and "undefined" is nowhere
//  2 (#5) no course anywhere: the header is the format alone
//  3 (#7) recap mid-round (thru 3 of 18): "⏳ Leading" and "thru 3", no "Winners"
//  4 (#7) recap with every team through 18: "🏆 Winners"
//  5 money = base
//
// Baseline against main c6a0d97f (tournament.html swapped in by cp, restored
// by sha): all 5 tests: 2 PASS / 3 FAIL (tests 4 and 5). With the fixes: 5 / 0.
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
const READ = { expression: `JSON.stringify((function () {
  var t = function (s) { var e = document.querySelector(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { sub: t('#manage-t-sub'), lbSub: t('#lb-t-sub'), recap: t('#recap-winners'), body: (document.body.innerText || '').replace(/\\s+/g, ' ') };
})())` };
const go = async (query, db, auth) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, auth, settleMs: 3500, steps: [READ] });
    assert.ok(r.ok, r.reason);
    return JSON.parse(r.value.filter((v) => typeof v === 'string' && v[0] === '{').pop());
};
const owned = () => { const d = F.groupDb(); d.tournaments.FLT.ownerUid = 'u-org'; return d; };

test('1 (#5) two-round event: the header names the rounds\' course, never "undefined"', async () => {
    const a = await go('tourney=FLT', owned(), OWNER);
    assert.equal(a.sub, 'Tidewater • Individual Stroke Play');
    assert.doesNotMatch(a.body, /undefined/);
});

test('2 (#5) no course anywhere: the format alone', async () => {
    const d = owned(); Object.values(d.tournaments.FLT.rounds).forEach((r) => { delete r.courseName; });
    const a = await go('tourney=FLT', d, OWNER);
    assert.equal(a.sub, 'Individual Stroke Play');
    assert.doesNotMatch(a.body, /undefined/);
});

test('3 (#7) recap mid-round: Leading, with the holes played', async () => {
    const a = await go('tourney=SCR&recap=1', F.scrambleDb({ ownerUid: 'u-org' }), GOLFER);
    assert.ok(a.recap && a.recap.length > 10, 'positive: the recap card has a row: ' + a.recap);
    assert.match(a.recap, /^⏳ Leading Team 9 · P9 -9 · thru 3/);
    assert.doesNotMatch(a.recap, /Winners/);
});

test('4 (#7) recap with every card complete: Winners', async () => {
    const d = F.scrambleDb({ ownerUid: 'u-org' }); const t = d.tournaments.SCR; t.scores = {};
    Object.keys(t.teams).forEach((k) => { const n = t.teams[k].num; for (let h = 1; h <= 18; h++) t.scores[`team${n}_h${h}`] = n === 9 ? 3 : 4; });
    const a = await go('tourney=SCR&recap=1', d, GOLFER);
    assert.match(a.recap, /^🏆 Winners Team 9 · P9 -18/);
    assert.doesNotMatch(a.recap, /Leading|thru/);
});

test('5 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
