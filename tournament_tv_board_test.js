// THE CLUBHOUSE TV BOARD (57, TV option A; Manny 2026-11-12): a new read-only
// page, tournament-tv.html?tourney=CODE, for the bar TV. Reached the way the
// TV reaches it: arrive cold (tools/lib/cold-arrival.js) at 1280x720 with the
// stand-in database, touch nothing; no page function is called.
//
//  1 the header (event name, course · format · 18 teams, LIVE, updated HH:MM),
//    the column heads, the rows in the engine's order (Team 9 first at -9),
//    a row at least 28 px of type, the QR box and the follow address
//  2 two flights: one page a flight, two dots, "Next:" names the other flight;
//    at ?every=5 the second page is on screen 3.5 s after a read before the turn
//  3 sponsors on the record: a last page thanks them (event + holes); no
//    sponsors: no such page
//  4 nothing written; a missing code gets a sentence
//  5 no price or prize words on any page
//  6 money = base
//
// Baseline against main 03231f51 (before the build, no tournament-tv.html):
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
    Object.keys(t.teams).forEach((k) => { t.teams[k].flightId = t.teams[k].num <= 9 ? 'fA' : 'fB'; });
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
    writes: (window.__coldWrites || []).map(function (w) { return w.path; }) };
})())` };
const go = async (db, query, steps) => {
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', query), db, auth: { uid: 'u-tv', isAnonymous: true }, viewport: TV, settleMs: 3000, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 header, heads, the engine order in big type, the QR and the follow address', async () => {
    const [a] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(a.name, 'Saturday Scramble');
    assert.match(a.sub, /^Papago · Scramble · 18 teams$/);
    assert.match(a.live, /^LIVE updated \d{1,2}:\d{2} [AP]M$/);
    assert.equal(a.head, 'POS TEAM THRU TO PAR');   // innerText reflects text-transform
    assert.match(a.rows[0], /^1 Team 9 3 -9$/, 'the leader first: ' + a.rows[0]);
    assert.ok(a.rows.length >= 10, 'ten rows a page: ' + a.rows.length);
    assert.ok(a.rowPx >= 28, 'a row is big type: ' + a.rowPx + 'px');
    assert.equal(a.qr, true, 'the QR drew');
    assert.equal(a.follow, 'tournaments.rattlegolf.com');
});

test('2 flights: one page each, dots, Next names the other; the page turns at ?every=3', async () => {
    // ?every=5: the first read lands before the first turn (settle 3 s), the
    // second after it and before the second (two pages cycle A, B, A ...).
    const [a, b] = await go(withFlights(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=5', [READ, { sleep: 3500 }, READ]);
    assert.equal(a.dots, 2); assert.equal(a.dotOn, 0);
    assert.equal(a.title, 'FLIGHT A');   // text-transform: uppercase assert.match(a.pageLabel, /^Flight A · 5 s a page$/); assert.equal(a.nextLabel, 'Next: Flight B');
    assert.ok(a.rows.every((r) => /Team [1-9] /.test(r)), 'Flight A holds teams 1-9: ' + JSON.stringify(a.rows));
    assert.equal(b.title, 'FLIGHT B'); assert.equal(b.dotOn, 1);
    assert.ok(b.rows.length > 0 && b.rows.every((r) => /Team 1[0-8] /.test(r)), 'Flight B holds teams 10-18: ' + JSON.stringify(b.rows));
});

test('3 sponsors: a last page thanks them; none: no such page', async () => {
    const [a, b] = await go(withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=3', [READ, { sleep: 3500 }, READ, { sleep: 3100 }, READ]);
    assert.equal(a.dots, 3, '18 teams = two pages of ten, then sponsors');
    const sp = [a, b].concat(await go(withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), 'tourney=SCR&every=3', [{ sleep: 6600 }, READ])).find((x) => x.evSponsor);
    assert.ok(sp, 'the sponsors page came round');
    assert.equal(sp.evSponsor, 'Desert Ridge Auto');
    assert.deepEqual(sp.sponsors, ['Sun Devil Dental Hole 7', 'Papago Grill Hole 12']);
    const [none] = await go(F.scrambleDb({ ownerUid: 'u-org' }), 'tourney=SCR');
    assert.equal(none.dots, 2, 'no sponsors: two pages only');
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

test('6 money = base', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
