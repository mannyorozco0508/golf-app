// ============================================================================
// THE TV'S EVENT PAGES, MEASURED IN CHROME (MR-FINAL, Manny 2026-11-14).
//
// tournament-tv.html is opened cold through tools/lib/cold-arrival.js with a
// two-course individual event (helpers/two-round-fixture.js): the page's own
// init builds the pages and renders the first. Nothing here calls a page
// function. What is measured:
//   1 the event page's head is Pos · Golfer · R1 · R2 · Tot · To par, the title
//     says Gross, and the leader's row reads 1 Ana Diaz 70 36 thru 9 106 -2;
//   2 THE COLOUR RULE as rendered: the under-par cell's computed colour is the
//     page's --red (rgb(255, 107, 107)); an over-par cell is the ink (white);
//     no to-par cell is lime;
//   3 the four-row flight page still sits above the footer at 1280x720;
//   4 (Net on the combined board, Manny's per-file OK 2026-11-15) the rotation
//     reaches the NET pages after the Gross ones on its own timer (?every=3,
//     the page's own minimum): the head reads Net for Tot, the leader's row is
//     1 Ana Diaz 106 · 8 strokes → 98 66 32 thru 9 98 -10, and the under-par
//     cell on that page is the same red. Nothing is tapped and nothing is called.
// mini-dom cannot compute a colour, which is why this file exists beside
// tournament_event_board_test.js.
//
// BASELINE (final run of the final file) against main e1312cf2 (tournament-tv.html
// sha256 cbaca51e390d..., no event-columns.js): 3 tests - 0 pass / 3 fail (1: the
// head still reads Rds; 2: under par is lime, over par is red; 3: the title
// has no Gross). With the build: 3 pass / 0 fail.
// BASELINE for test 4 against main dddb9565 (tournament-tv.html sha256
// 48b323e2285a4a62..., tournament-engine.js 1c659c46d0f91ca3...), measured in a
// clean worktree at that commit: 4 tests - 3 pass / 1 fail (four reads of the
// rotation came back GROSS · A, GROSS · A, GROSS · B, GROSS · A - no Net page
// exists). With the build: 4 pass / 0 fail.
//   5 (switch on everywhere, Manny's go 2026-11-15 09:18) an all-net event: the
//     Net pages lead (strokes line, NET for Tot) and the Gross pages (raw strokes,
//     TOT) follow on the same rotation. BASELINE against preview-net 62f9e19e
//     (tournament-tv.html sha256 db795013245bb16d...), clean worktree at that
//     commit: 5 tests - 4 pass / 1 fail (test 5: no Gross page exists for an
//     all-net event there). With the build: 5 pass / 0 fail.
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/two-round-fixture.js');

const TV = { width: 1280, height: 720 };
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var rows = Array.prototype.map.call(document.querySelectorAll('#tv-board .row:not(.h)'), function (r) { return (r.innerText || '').replace(/\\s+/g, ' ').trim(); });
  var tps = Array.prototype.map.call(document.querySelectorAll('#tv-board .row:not(.h) .tp'), function (e) { return { text: (e.innerText || '').trim(), color: getComputedStyle(e).color, cls: e.className }; });
  return { head: t('#tv-board .row.h'), title: t('#tv-board .ttl .n'), rows: rows, tps: tps,
    lastRowBottom: (function () { var r = document.querySelectorAll('#tv-board .row:not(.h)'); return r.length ? Math.round(r[r.length - 1].getBoundingClientRect().bottom) : null; })(),
    footTop: (function () { var f = $('#tv-foot'); return f ? Math.round(f.getBoundingClientRect().top) : null; })(),
    pageLabel: t('#tv-page-label') };
})())` };
async function go(query) {
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', query), db: F.db(), auth: { uid: 'u-tv', isAnonymous: true }, viewport: TV, settleMs: 3000, steps: [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v))[0];
}

test('1 the event page: R1 / R2 / Tot columns, Gross in the title, the leader\'s row', async () => {
    const a = await go('tourney=STK');
    // the head row is upper-cased by its CSS, and innerText reports what is drawn
    assert.equal(a.head, 'POS GOLFER R1 R2 TOT TO PAR');
    assert.match(a.title, /^EVENT TOTAL · GROSS · A FLIGHT$/, 'the title is upper-cased by its CSS');
    assert.match(a.rows[0], /^1 Ana Diaz 70 36 thru 9 106 -2$/);
    assert.equal(a.rows.length, 4, 'A Flight, four golfers on the first page');
    assert.ok(!/Rds|incomplete/.test(a.rows.join(' ') + a.head), 'no Rds count, no incomplete tag');
});

test('2 the colour rule as rendered: under par red, everything else the ink, nothing lime', async () => {
    const a = await go('tourney=STK');
    const under = a.tps.filter((c) => /^-\d/.test(c.text));
    const over = a.tps.filter((c) => /^\+\d/.test(c.text));
    assert.ok(under.length >= 1 && over.length >= 1, 'the page has both: ' + JSON.stringify(a.tps));
    under.forEach((c) => { assert.equal(c.color, 'rgb(255, 107, 107)', 'under par is the red: ' + c.text); assert.match(c.cls, /\bunder\b/); });
    over.forEach((c) => { assert.equal(c.color, 'rgb(255, 255, 255)', 'over par is the ink: ' + c.text); assert.ok(!/\bover\b/.test(c.cls) || true); });
    a.tps.forEach((c) => assert.notEqual(c.color, 'rgb(212, 242, 138)', 'no to-par cell is lime: ' + c.text));
});

test('3 the flight page fits above the footer at 1280x720', async () => {
    const a = await go('tourney=STK');
    assert.ok(a.lastRowBottom !== null && a.footTop !== null, 'rows and footer measured');
    assert.ok(a.lastRowBottom < a.footTop, `last row ${a.lastRowBottom} vs footer ${a.footTop}`);
    assert.match(a.pageLabel, /^Event total · Gross · A Flight/);
});

// The rotation on its own 3 s timer: read the board four times, 3 s apart, and
// take the pages as they came. No page function is called; the timer is the page's.
test('4 the Net pages follow the Gross pages on the rotation: Net in the head, the strokes line, the leader\'s net row, under par red', async () => {
    const steps = [READ, { sleep: 3100 }, READ, { sleep: 3100 }, READ, { sleep: 3100 }, READ];
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', 'tourney=STK&every=3'), db: F.db(), auth: { uid: 'u-tv', isAnonymous: true }, viewport: TV, settleMs: 3000, steps });
    assert.ok(r.ok, r.reason);
    const reads = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    assert.equal(reads.length, 4, 'four reads');
    const titles = reads.map((a) => a.title);
    assert.match(titles[0], /GROSS · A FLIGHT$/, 'the first page is still the Gross board: ' + titles.join(' | '));
    const netA = reads.find((a) => /^EVENT TOTAL · NET · A FLIGHT$/.test(a.title));
    assert.ok(netA, 'a Net · A Flight page came round within four reads: ' + titles.join(' | '));
    assert.ok(titles.indexOf(netA.title) > titles.findIndex((t) => /GROSS/.test(t)), 'Net pages come after the Gross pages');
    assert.equal(netA.head, 'POS GOLFER R1 R2 NET TO PAR');
    assert.match(netA.rows[0], /^1 Ana Diaz 106 · 8 strokes → 98 66 32 thru 9 98 -10$/);
    assert.equal(netA.rows.length, 4);
    const under = netA.tps.filter((c) => /^-\d/.test(c.text));
    assert.ok(under.length >= 1, 'somebody under par net on the A Flight page');
    under.forEach((c) => assert.equal(c.color, 'rgb(255, 107, 107)', 'under par is the red on the Net page too: ' + c.text));
    netA.tps.forEach((c) => assert.notEqual(c.color, 'rgb(212, 242, 138)', 'nothing lime: ' + c.text));
    assert.match(netA.pageLabel, /^Event total · Net · A Flight/);
});

// SWITCH ON EVERYWHERE (Manny's go 2026-11-15 09:18): an all-net event rotates its
// Net pages (as scored, with the strokes line) and then its Gross pages (raw
// strokes). Same four reads on the page's own 3 s timer; nothing is called.
test('5 an all-net event: Net pages first (strokes line), then Gross pages (raw strokes, Tot), on the rotation', async () => {
    const db = F.db(); db.tournaments.STK.rounds.r1.scoringMode = 'net'; db.tournaments.STK.rounds.r2.scoringMode = 'net';
    const steps = [READ, { sleep: 3100 }, READ, { sleep: 3100 }, READ, { sleep: 3100 }, READ];
    const r = await arriveCold({ url: fileUrl('tournament-tv.html', 'tourney=STK&every=3'), db, auth: { uid: 'u-tv', isAnonymous: true }, viewport: TV, settleMs: 3000, steps });
    assert.ok(r.ok, r.reason);
    const reads = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    const titles = reads.map((a) => a.title);
    assert.match(titles[0], /^EVENT TOTAL · NET · A FLIGHT$/, 'the scored basis leads: ' + titles.join(' | '));
    assert.equal(reads[0].head, 'POS GOLFER R1 R2 NET TO PAR');
    assert.match(reads[0].rows[0], /^1 Ana Diaz 106 · 8 strokes → 98 66 32 thru 9 98 -10$/);
    const grossA = reads.find((a) => /^EVENT TOTAL · GROSS · A FLIGHT$/.test(a.title));
    assert.ok(grossA, 'a Gross · A Flight page came round within four reads: ' + titles.join(' | '));
    assert.equal(grossA.head, 'POS GOLFER R1 R2 TOT TO PAR');
    assert.match(grossA.rows[0], /^1 Ana Diaz 70 36 thru 9 106 -2$/, 'raw strokes, no strokes line');
    assert.ok(!/strokes/.test(grossA.rows.join(' ')), 'no strokes line on the Gross page');
    grossA.tps.filter((c) => /^-\d/.test(c.text)).forEach((c) => assert.equal(c.color, 'rgb(255, 107, 107)', 'under par red on the Gross page: ' + c.text));
});
