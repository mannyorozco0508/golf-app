// THE CLUBHOUSE TV BOARD (57, TV option A; Manny 2026-11-12): a new read-only
// page, tournament-tv.html?tourney=CODE, for the bar TV. Reached the way the
// TV reaches it: arrive cold (tools/lib/cold-arrival.js) at 1280x720 with the
// stand-in database, touch nothing; no page function is called.
//
//  1 the header (event name, course · format · 18 teams, LIVE, updated HH:MM),
//    the column heads, the rows in the engine's order (Team 9 first at -9),
//    a row at least 28 px of type, eight rows a page, the QR and the follow address
//  2 two flights: Flight A (8 teams) one page, Flight B (10) two, three dots, "Next:" names the other flight;
//    at ?every=5 the second page is on screen 3.5 s after a read before the turn
//  3 sponsors on the record: a last page thanks them (event + holes); no
//    sponsors: no such page
//  4 nothing written; a missing code gets a sentence
//  5 no price or prize words on any page
//  6 money = base
//  --- TV polish (Manny 2026-11-12, after the preview) ---
//  7 golfer names under each team (Team 4: Al Lopez · Jo Kim · Ed Ruiz · Bo
//    Diaz; Team 9: P9); an individual event has no second line
//  8 full width: no side column, the board >= 90% of the viewport, eight rows
//    a page and the eighth above the footer at 1280x720 (ten with names overflowed by 117 px)
//  9 nothing scored: "Waiting for first scores" with the start info and no
//    rows; the next snapshot with one score brings the table
// 10 a phone (390x844): the QR hidden, nothing past the right edge, POS and
//    TEAM heads not overlapping, no THRU column
// 11 (#12) without flights the pages read "1–8 of 18" / "Next: 9–16 of 18";
//    a tie reads "Team 15 tied" in text
//
// Baseline for 7-11 against the pre-polish page (preview-57 2bc21070's
// tournament-tv.html, swapped in by cp, restored by sha): 5 tests: 0 PASS / 5 FAIL.
// With the polish: all 11 tests: 11 PASS / 0 FAIL.
//
// Baseline against main 0f11073c (re-measured after the rebase; before the build, no tournament-tv.html):
// all 6 tests: 1 PASS / 5 FAIL (test 6). With the build: 6 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const TV = { width: 1280, height: 720 };
const withFlights = (db) => {
    const t = db.tournaments.SCR;
    t.flights = { fA: { id: 'fA', name: 'Flight A', createdAt: 1 }, fB: { id: 'fB', name: 'Flight B', createdAt: 2 } };
    Object.keys(t.teams).forEach((k) => { t.teams[k].flightId = t.teams[k].num <= 8 ? 'fA' : 'fB'; });   // 8 in A (one page), 10 in B (two)
    return db;
};
const withSponsors = (db) => {
    db.tournaments.SCR.sponsors = { event: { name: 'Desert Ridge Auto' }, holes: { '7': { name: 'Sun Devil Dental' }, '12': { name: 'Papago Grill' } } };
    return db;
};
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var rows = Array.prototype.map.call(document.querySelectorAll('#tv-board .row:not(.h)'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); });
  var r1 = document.querySelector('#tv-board .row:not(.h) .nm');
  return { name: t('#tv-name'), sub: t('#tv-sub'), live: t('#tv-live'), head: t('#tv-board .row.h'), title: t('#tv-board .ttl .n'), rows: rows,
    rowPx: r1 ? parseFloat(getComputedStyle(r1).fontSize) : 0, qr: !!document.querySelector('#tv-qr canvas, #tv-qr img'), follow: t('#tv-follow'),
    dots: document.querySelectorAll('#tv-dots i').length, dotOn: Array.prototype.findIndex.call(document.querySelectorAll('#tv-dots i'), function (i) { return i.className === 'on'; }),
    pageLabel: t('#tv-page-label'), nextLabel: t('#tv-next-label'), sponsors: Array.prototype.map.call(document.querySelectorAll('#tv-board .sp .hs'), function (e) { return (e.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    evSponsor: t('#tv-board .sp .ev-sp'), body: (document.body.innerText || '').replace(/\\s+/g, ' '), msg: t('#tv-board .err'),
    names: Array.prototype.map.call(document.querySelectorAll('#tv-board .row:not(.h) .nm2'), function (e) { return (e.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    side: !!document.querySelector('.side'), boardW: ($('#tv-board') || { getBoundingClientRect: function () { return { width: 0 }; } }).getBoundingClientRect().width, vw: window.innerWidth,
    lastRowBottom: (function () { var r = document.querySelectorAll('#tv-board .row:not(.h)'); return r.length ? Math.round(r[r.length - 1].getBoundingClientRect().bottom) : null; })(),
    footTop: (function () { var f = $('#tv-foot'); return f ? Math.round(f.getBoundingClientRect().top) : null; })(),
    waiting: t('#tv-board .wait'), waitInfo: t('#tv-board .wait .wi'),
    qrShown: (function () { var q = $('#tv-qr'); if (!q) return false; var r = q.getBoundingClientRect(); return getComputedStyle(q).display !== 'none' && r.width > 0; })(),
    scrollW: document.scrollingElement.scrollWidth, posRight: (function () { var e = document.querySelector('#tv-board .row.h .pos'); return e ? Math.round(e.getBoundingClientRect().right) : null; })(),
    teamLeft: (function () { var e = document.querySelector('#tv-board .row.h .nm'); return e ? Math.round(e.getBoundingClientRect().left) : null; })(),
    thruShown: (function () { var e = document.querySelector('#tv-board .row.h .th'); return !!e && getComputedStyle(e).display !== 'none'; })(),
    writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())` };
const go = async (db, query, steps, viewport) => {
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', query), db, auth: { uid: 'u-tv', isAnonymous: true }, viewport: viewport || TV, settleMs: 3000, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 header, heads, the engine order in big type, the QR and the follow address', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(a.name, 'Saturday Scramble');
    assert.match(a.sub, /^Papago · Scramble · 18 teams$/);
    assert.match(a.live, /^LIVE updated \d{1,2}:\d{2} [AP]M$/);
    assert.equal(a.head, 'POS TEAM THRU TO PAR');   // innerText reflects text-transform
    assert.match(a.rows[0], /^1 Team 9 P9 3 -9$/, 'the leader first, names under the team: ' + a.rows[0]);
    assert.ok(a.rows.length === 8, 'eight rows a page: ' + a.rows.length);
    assert.ok(a.rowPx >= 28, 'a row is big type: ' + a.rowPx + 'px');
    assert.equal(a.qr, true, 'the QR drew');
    assert.equal(a.follow, 'tournaments.rattlegolf.com');
});

test('2 flights: one page each, dots, Next names the other; the page turns at ?every=3', async () => {
    // ?every=5: the first read lands before the first turn (settle 3 s), the
    // second after it and before the second (two pages cycle A, B, A ...).
    const [a, b] = await go(withFlights(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=5', [READ, { sleep: 3500 }, READ]);
    assert.equal(a.dots, 3); assert.equal(a.dotOn, 0);
    assert.equal(a.title, 'FLIGHT A');   // text-transform: uppercase assert.match(a.pageLabel, /^Flight A · 5 s a page$/); assert.equal(a.nextLabel, 'Next: Flight B · 1–8 of 10');
    assert.ok(a.rows.length === 8 && a.rows.every((r) => /Team [1-8]( tied)? /.test(r)), 'Flight A holds teams 1-8: ' + JSON.stringify(a.rows));
    assert.equal(b.title, 'FLIGHT B'); assert.equal(b.dotOn, 1);
    assert.ok(b.rows.length === 8 && b.rows.every((r) => /Team (9|1[0-8])( tied)? /.test(r)), 'Flight B holds teams 9-18: ' + JSON.stringify(b.rows));
});

test('3 sponsors: a last page thanks them; none: no such page', async () => {
    const reads = await go(withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=3', [READ, { sleep: 3500 }, READ, { sleep: 3100 }, READ]);
    const a = reads[0];
    assert.equal(a.dots, 4, '18 teams = three pages of eight, then sponsors');
    // reads at ~3 s, ~6.6 s, ~9.7 s after load; the fourth page (sponsors) is on from 9 s; a spare arrival reads at ~9.7 s too
    const sp = reads.concat(await go(withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=3', [{ sleep: 6700 }, READ])).find((x) => x.evSponsor);
    assert.ok(sp, 'the sponsors page came round');
    assert.equal(sp.evSponsor, 'Desert Ridge Auto');
    assert.deepEqual(sp.sponsors, ['Sun Devil Dental Hole 7', 'Papago Grill Hole 12']);
    const [none] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(none.dots, 3, 'no sponsors: three pages only');
    assert.doesNotMatch(none.body, /sponsor/i);
});

test('4 read-only; a missing code gets a sentence', async () => {
    const [a] = await go(withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR');
    assert.deepEqual(a.writes, []);
    const [b] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=NOPE');
    assert.equal(b.msg, 'No tournament found with that code.');
    const [c] = await go(F.scrambleDb({ ownerUid: 'u-org' }), '');
    assert.match(c.msg, /add \?tourney=CODE to the address/);
});

test('5 no price or prize words on any page', async () => {
    const pages = await go(withSponsors(withFlights(F.scrambleDb({ ownerUid: 'u-org' }))), 'tourney=SCR&every=3', [READ, { sleep: 3100 }, READ, { sleep: 3100 }, READ]);
    assert.ok(pages.length === 3 && pages[0].body.length > 200, 'positive: three pages read');
    pages.forEach((p) => assert.doesNotMatch(p.body, /\$|prize|cash|price|free/i));
});

test('7 golfer names under each team; none on an individual event', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    const t4 = a.rows.find((r) => /^\d+ Team 4 /.test(r));
    assert.ok(t4, 'Team 4 is on page 1: ' + JSON.stringify(a.rows));
    assert.match(t4, /^\d+ Team 4( tied)? Al Lopez · Jo Kim · Ed Ruiz · Bo Diaz 3 -3$/);
    assert.equal(a.names.length, a.rows.length, 'every team row carries its names line');
    const g = F.groupDb(); const code = Object.keys(g.tournaments)[0];
    const [b] = await go(g, 'tourney=' + code);
    assert.ok(b.rows.length > 0, 'positive: the individual board has rows');
    assert.equal(b.names.length, 0, 'no second line on an individual event');
});

test('8 full width: no side column, the board spans the screen, ten rows above the footer', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(a.side, false);
    assert.ok(a.boardW >= a.vw * 0.9, 'board ' + a.boardW + ' of ' + a.vw);
    assert.equal(a.rows.length, 8, 'eight rows a page');
    assert.ok(a.lastRowBottom <= a.footTop, 'the eighth row (' + a.lastRowBottom + ') sits above the footer (' + a.footTop + ')');
});

test('9 nothing scored: Waiting for first scores; the first score brings the table', async () => {
    const db = F.scrambleDb({ ownerUid: 'u-org' }); db.tournaments.SCR.scores = {};
    const scored = JSON.parse(JSON.stringify(db.tournaments.SCR)); scored.scores = { team4_h4: 4 };
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', 'tourney=SCR'), db, auth: { uid: 'u-tv', isAnonymous: true }, viewport: TV, settleMs: 3000,
        steps: [READ, { deliver: { path: 'tournaments/SCR', value: scored } }, { sleep: 300 }, READ] });
    assert.ok(r.ok, r.reason);
    const del = r.value.find((v) => v && typeof v === 'object' && 'listeners' in v);
    assert.ok(del && del.listeners > 0 && !(del.threw || []).length, JSON.stringify(del));
    const [a, b] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.equal(a.waiting && a.waiting.replace(/ .*/, ''), 'Waiting', a.waiting);
    assert.match(a.waiting, /^Waiting for first scores/);
    assert.match(a.waitInfo, /Shotgun start · 8:00 AM · 18 teams/);
    assert.equal(a.rows.length, 0); assert.equal(a.qr, true, 'the QR still shows while waiting');
    assert.equal(b.waiting, null); assert.ok(b.rows.length >= 8, 'the table after the first score: ' + b.rows.length);
    assert.match(b.rows[0], /^1 Team 4 /);
});

test('10 a phone: QR hidden, nothing past the right edge, heads apart, no THRU', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR', [READ], { width: 390, height: 844 });
    assert.ok(a.rows.length > 0, 'positive: rows drew');
    assert.equal(a.qrShown, false);
    assert.ok(a.scrollW <= 390, 'scrollWidth ' + a.scrollW);
    assert.ok(a.posRight <= a.teamLeft, 'POS right ' + a.posRight + ' <= TEAM left ' + a.teamLeft);
    assert.equal(a.thruShown, false);
    assert.match(a.body, /tournaments\.rattlegolf\.com/, 'the address still reads');
});

test('11 (#12) page ranges without flights; a tie reads with a space', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(a.pageLabel, '1–8 of 18 · 10 s a page');
    assert.equal(a.nextLabel, 'Next: 9–16 of 18');
    assert.ok(a.rows.some((r) => /Team 15 tied /.test(r)), 'tie with a space: ' + JSON.stringify(a.rows));
});

test('6 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
