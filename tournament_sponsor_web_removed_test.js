// SPONSORS ON THE WEB: NONE (Manny 2026-11-14, ADVISOR-20261114-1156-OK-build-final-set).
// One placement only: the HardPan app's GPS tee card ("Hole N presented by ..."),
// built by the iOS and Android lanes from tournaments/CODE/sponsors/holes/<n>
// {name, logo}. "No ads on the card or the TV." So with sponsors ON THE RECORD,
// every golfer- or watcher-facing web screen renders no sponsor name, no
// sponsor logo and no sponsor wording; the organizer's Setup -> Sponsors still
// shows and saves them (the positive control: the data is real, the screens
// are not blank).
//
// Reached the way each person reaches it: arrive cold (tools/lib/cold-arrival.js),
// tap and type, no page function is called. Text is read with innerText (never
// textContent: the page's own script source would match the names), scoped to
// the body of each screen; a logo is caught by its exact data URL on any <img>.
//
//  1 the team card (scramble, team 4) and the per-golfer card (best ball):
//    no sponsor text or logo anywhere on screen; positive: hole 7's row reads
//    "Hole 7 Par 4" and 18 hole rows drew
//  2 the board (tournament.html, a golfer, Board tab): none; positive: the
//    leader row (Team 9) is on screen
//  3 the TV board, every page of a full cycle at ?every=3: none, and the same
//    three pages as with no sponsors; positive: each page shows team rows
//  4 the recap: none; positive: the Leading row is on screen
//  5 Setup -> Sponsors (the owner): the event name and holes 7, 12, 18 listed
//    with their logos, the placement sentence, and Add writes ONE set
//    tournaments/SCR/sponsors/holes/9 {name} (the data contract's path)
//
// Baseline against main e1312cf2 (tournament.html fad16256..., tournament-tv.html
// cbaca51e..., tournament-scorecard.html 42860db9...; the three pages swapped in by
// cp, restored by sha): all 5 tests: 1 PASS / 4 FAIL. 1, 3, 4 red on the sponsor
// text; 5 red on the placement sentence; 2 green because main's board never
// showed a sponsor (controls f-h below prove its assertions live).
// With the build: 5 PASS / 0 FAIL.
// Controls (one page mutated from a saved copy, the one test run, restored by sha):
//  a the card's "Hole N" row label renamed -> 1 red (positive);
//  b the TV rows not rendered -> 3 red (positive);
//  c the recap's result rows not rendered -> 4 red (positive);
//  d Setup's hole-sponsor rows not listed -> 5 red (positive);
//  e Add writes sponsors/hole/<n> -> 5 red (the path);
//  f the board shows a hole sponsor's name -> 2 red (name);
//  g the board shows a hole sponsor's logo, no text -> 2 red (logo);
//  h the board shows "Presented by ..." -> 2 red (wording).
//
// What this cannot prove: the GPS tee card itself (native, other lanes).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

// A 48x24 solid PNG data URL: the shape Setup saves (data:image/png;base64,...).
function png(r, g, b) {
    const w = 48, h = 24, T = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
    const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
    return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const SPONSORS = { event: { name: 'Desert Ridge Auto', logo: png(192, 57, 43) },
    holes: { '7': { name: 'Sun Devil Dental', logo: png(123, 31, 162) }, '12': { name: 'Papago Grill', logo: png(230, 126, 34) }, '18': { name: 'Camelback Title', logo: png(29, 111, 184) } } };
const NAMES = [SPONSORS.event.name].concat(Object.values(SPONSORS.holes).map((h) => h.name));
const LOGOS = [SPONSORS.event.logo].concat(Object.values(SPONSORS.holes).map((h) => h.logo));
const withSponsors = (db, code) => { db.tournaments[code || 'SCR'].sponsors = JSON.parse(JSON.stringify(SPONSORS)); return db; };
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const GOLFER = { uid: 'u-golfer', isAnonymous: true };
const PHONE = { width: 390, height: 844 };

// Everything a screen shows: body innerText, the logos on any <img>, plus
// screen-specific positives.
const READ = { expression: `JSON.stringify((function () {
  var LOGOS = ${JSON.stringify(LOGOS)};
  var t = function (s) { var e = document.querySelector(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { body: (document.body.innerText || '').replace(/\\s+/g, ' '),
    logos: Array.prototype.filter.call(document.querySelectorAll('img'), function (i) { return LOGOS.indexOf(i.getAttribute('src')) >= 0; }).length,
    row7: t('#hole-row-7'), holeRows: document.querySelectorAll('#holes-list [id^="hole-row-"]').length,
    tvRows: Array.prototype.map.call(document.querySelectorAll('#tv-board .row:not(.h)'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    dots: document.querySelectorAll('#tv-dots i').length, recapWinners: t('#recap-winners'),
    spRows: Array.prototype.map.call(document.querySelectorAll('#sponsors-setup .sp-row'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); }),
    spRowLogos: Array.prototype.filter.call(document.querySelectorAll('#sponsors-setup img'), function (i) { return LOGOS.indexOf(i.getAttribute('src')) >= 0; }).length,
    eventName: (document.getElementById('sp-event-name') || {}).value || null, placement: t('#sp-placement'),
    writes: (window.__coldWrites || []).filter(function (w) { return !/^organizers\\//.test(w.path); }).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const go = async (page, query, db, auth, steps, viewport) => {
    const r = await arriveCold({ url: fileUrl(page, query), db, auth, viewport: viewport || PHONE, settleMs: 3000, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const noSponsor = (read, where) => {
    NAMES.forEach((n) => assert.ok(!read.body.includes(n), where + ' shows the sponsor ' + n));
    assert.doesNotMatch(read.body, /sponsor|presented by/i, where + ' carries sponsor wording');
    assert.equal(read.logos, 0, where + ' shows a sponsor logo');
};

test('1 the card: no sponsor on any hole row or under the title (team card and per-golfer card)', async () => {
    const [a] = await go('tournament-scorecard.html', 'tourney=SCR&team=4&k=' + F.KEY4, withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER);
    assert.match(a.row7 || '', /^Hole 7 Par 4\b/, 'positive: hole 7 drew: ' + a.row7);
    assert.equal(a.holeRows, 18, 'positive: 18 hole rows');
    noSponsor(a, 'the team card');
    const bb = withSponsors(F.bestBallDb(), 'BBL');
    const [b] = await go('tournament-scorecard.html', 'tourney=BBL&team=3', bb, GOLFER);
    assert.match(b.row7 || '', /Hole 7/, 'positive: the per-golfer card drew hole 7: ' + b.row7);
    noSponsor(b, 'the per-golfer card');
});

test('2 the board: no sponsor', async () => {
    const [a] = await go('tournament.html', 'tourney=SCR', withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER, [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, READ]);
    assert.match(a.body, /Team 9/, 'positive: the leader is on the board');
    noSponsor(a, 'the board');
});

test('3 the TV: no sponsor on any page of a full cycle, and no extra page', async () => {
    const TV = { width: 1280, height: 720 };
    const reads = await go('tournament-tv.html', 'tourney=SCR&every=3', withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), { uid: 'u-tv', isAnonymous: true },
        [READ, { sleep: 3300 }, READ, { sleep: 3300 }, READ, { sleep: 3300 }, READ], TV);
    assert.equal(reads.length, 4);
    reads.forEach((r, i) => {
        assert.ok(r.tvRows.length > 0, 'positive: read ' + i + ' shows team rows');
        assert.equal(r.dots, 3, 'three pages of eight, no sponsors page');
        noSponsor(r, 'TV read ' + i);
    });
});

test('4 the recap: no sponsor', async () => {
    const [a] = await go('tournament.html', 'tourney=SCR&recap=1', withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), GOLFER);
    assert.match(a.recapWinners || '', /Leading/, 'positive: the recap drew its results: ' + a.recapWinners);
    noSponsor(a, 'the recap');
});

test('5 Setup -> Sponsors still lists and saves them, and says where they show', async () => {
    const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SCR'), db: withSponsors(F.scrambleDb({ ownerUid: 'u-org' })), auth: OWNER, viewport: PHONE, settleMs: 3000,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 400 }, { expression: "document.getElementById('sponsors-setup').scrollIntoView({block:'center'}), 1" }, { sleep: 200 }, READ,
            { expression: "document.getElementById('sp-hole').value = '9', 1" }, { tap: '#sp-name' }, { cdp: { method: 'Input.insertText', params: { text: 'Pinnacle Peak Pizza' } } },
            { tap: '#sp-add' }, { sleep: 400 }, READ] });
    assert.ok(r.ok, r.reason);
    const [a, b] = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.equal(a.eventName, 'Desert Ridge Auto');
    assert.deepEqual(a.spRows.map((s) => s.replace(/ (Change|\+ Logo) ✕$/, '')), ['Hole 7 Sun Devil Dental', 'Hole 12 Papago Grill', 'Hole 18 Camelback Title']);
    assert.equal(a.spRowLogos, 4, 'the event logo and three hole logos');
    assert.equal(a.placement, 'A hole sponsor shows once on that hole\'s GPS screen in the HardPan app: when a golfer\'s phone reaches the tee, a card reads "Hole 7 presented by" the name, with the logo, for 6 seconds, and the golfer can close it. The scorecard, the board, the TV and the recap show no sponsors. Nothing is billed or collected here.');
    assert.match(a.body, /Event sponsor \(optional, saved but not shown yet\)/);
    assert.deepEqual(b.writes, [{ op: 'set', path: 'tournaments/SCR/sponsors/holes/9', value: { name: 'Pinnacle Peak Pizza' } }]);
});
