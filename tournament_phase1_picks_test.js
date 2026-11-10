// Phase 1 picks (Manny, 2026-11-10), reached the way a user reaches them.
//
//  1. Entry-fee help: "The organizer collects entry fees (cash, Venmo, etc.).
//     Card payments in Rattle Golf are coming." A signed-in organizer arriving cold
//     at tournament.html sees it with no tap (the default state), and after
//     pressing the Individual format card (which rewrites the help).
//  2. Leaderboard Share note, option A: the "Anyone with this link..." note
//     sits under the Share button with a gap. Before this it overlapped the
//     button by 4 CSS px. Geometry is measured in headless Chrome, because
//     mini-dom has no layout.
//
// No page function is called: the checks tap DOM elements and read innerText
// and getBoundingClientRect (tools/lib/cold-arrival.js).
//
// Baseline against phase1 105668c0 (before the picks): all 4 tests: 0 PASS / 4 FAIL.
// Controls (restored by sha ea2302a26ba3): old rewrite text fails 2 and 4; changed static
// line fails 1; margin back to -4px fails 3.
// With the picks: all 4 tests: 4 PASS / 0 FAIL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, REPO_ROOT } = require('./tools/lib/cold-arrival.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = path.join(REPO_ROOT, 'tournament.html');
const HELP = 'The organizer collects entry fees (cash, Venmo, etc.). Card payments in Rattle Golf are coming.';
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const CODE = 'PICKS1';
const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const fill = (k, v) => { const o = {}; CD18.forEach((h) => { o[k + '_h' + h.hole] = v; }); return o; };
const p = (id, name) => ({ id, name, handicap: '0' });
const record = {
    ownerUid: 'u-org', name: 'Member-Guest', courseName: 'Test GC', courseData: CD18, createdAt: 1,
    eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', entryFee: 0,
    players: { pA: p('pA', 'Ann'), pB: p('pB', 'Bob') },
    rounds: { r1: { id: 'r1', name: 'Round', status: 'open', createdAt: 1, format: 'individual', scoringMode: 'gross',
        courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false, scoringGroups: {},
        scores: Object.assign({}, fill('pA', 4), fill('pB', 5)) } }
};
const emptyDb = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: {} });

const READ_HELP = `JSON.stringify((function(){var h=document.getElementById('t-entry-fee-help');
  return {vis:!!(h&&h.offsetParent), txt:h?h.innerText:null};})())`;
const TAP_INDIVIDUAL = `(function(){var b=document.getElementById('fmt-individual'); if(b) b.click(); return !!b;})()`;
const TAP_BOARD = `(function(){var b=document.getElementById('tab-btn-leaderboard'); if(b&&b.offsetParent!==null) b.click(); return !!b;})()`;
const MEASURE = `JSON.stringify((function(){var b=document.getElementById('lb-watch-share'); if(!b||b.offsetParent===null) return {err:'no button'};
  var n=[].slice.call(document.querySelectorAll('p')).filter(function(x){return /Anyone with this link can watch/.test(x.innerText||'');})[0];
  if(!n) return {err:'no note'}; var br=b.getBoundingClientRect(), nr=n.getBoundingClientRect();
  return {btnBottom:br.bottom, noteTop:nr.top, noteH:nr.height, gap:+(nr.top-br.bottom).toFixed(2)};})())`;

test('1 organizer, cold, touches nothing: the entry-fee help says who collects the fee', async () => {
    const r = await arriveCold({ url: 'file://' + PAGE, db: emptyDb(), auth: OWNER, settleMs: 4000, steps: [{ expression: READ_HELP }] });
    assert.ok(r.ok, r.reason);
    const v = JSON.parse(r.value[0]);
    assert.equal(v.vis, true, 'the help line is on screen');
    assert.equal(v.txt, HELP);
});

test('2 organizer presses Individual: the rewritten help is the same sentence', async () => {
    const r = await arriveCold({ url: 'file://' + PAGE, db: emptyDb(), auth: OWNER, settleMs: 4000,
        steps: [{ expression: TAP_INDIVIDUAL }, { sleep: 300 }, { expression: READ_HELP }] });
    assert.ok(r.ok, r.reason);
    assert.equal(r.value[0], true, 'the Individual card exists');
    const v = JSON.parse(r.value[2]);
    assert.equal(v.vis, true);
    assert.equal(v.txt, HELP);
});

test('3 golfer opens the board: the Share note sits under the button with a gap (option A)', async () => {
    const r = await arriveCold({ url: 'file://' + PAGE + '?tourney=' + CODE,
        db: Object.assign(emptyDb(), { tournaments: { [CODE]: record } }), auth: 'anonymous', settleMs: 4000,
        steps: [{ expression: TAP_BOARD }, { sleep: 400 }, { expression: MEASURE }] });
    assert.ok(r.ok, r.reason);
    const v = JSON.parse(r.value[2]);
    assert.equal(v.err, undefined, v.err);
    assert.ok(v.noteH > 0, 'the note has height (it is really there)');
    assert.ok(v.gap >= 4, 'the note starts ' + v.gap + ' px below the button bottom (negative = overlap)');
});

test('4 source, decoded: the old "square up for real" help is gone; the new sentence is in both places', () => {
    const src = decodeEscapes(fs.readFileSync(PAGE, 'utf8'));
    assert.equal(src.split(HELP).length - 1, 2, 'the static markup and the format-card rewrite');
    assert.doesNotMatch(src, /square up for real/);
});
