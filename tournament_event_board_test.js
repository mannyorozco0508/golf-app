// ============================================================================
// THE 36-HOLE BOARD (MR-FINAL, Manny's pick 2026-11-14, built on the Advisor relay
// ADVISOR-20261114-1156-OK-build-final-set): R1 / R2 / TOT columns on the combined
// board, rows that open to both rounds' cards with rings, a Gross | Net switch
// above the board, a Rounds card on Setup, and the colour rule on every board
// and the TV: an UNDER-par to-par number is red, everything else keeps its colour.
//
// HOW EACH PAGE TEST ARRIVES: through ?tourney=STK, the page's OWN record
// listener fired with a two-course individual event (Cascade closed, Olympic in
// play, eight golfers in two flights), and taps run the onclick text of the
// markup the page rendered. No test calls a render function by name. The
// DEFAULT state (nothing tapped) is tested first.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (rows are
// found by markup, not as nodes), there is no layout, and computed colour does
// not exist. The colour rule is therefore pinned at the CSS source here and
// MEASURED in Chrome by tournament_tv_event_columns_test.js (computed colour of
// an under-par and an over-par cell on the TV) and by the cold-arrival shots in
// claude-mailbox-shared/tournaments/build-mr/.
//
// THE ENGINE IS NOT EDITED. The per-round numbers come from event-columns.js,
// which asks the engine for each round's own board; the order of the combined
// board is still computeEventStandings' (completed rounds first, then to par).
//
// BASELINE (CLAUDE.md: the FINAL run of the FINAL file). Against main e1312cf2
// (tournament.html sha256 fad162561b8f..., tournament-tv.html cbaca51e390d...,
// no event-columns.js, run in a clean worktree at that commit): 23 tests -
// 1 pass / 22 fail. The one that passes is E3 (a single-round event has no
// Rounds card: the element is absent there, so its innerHTML is ''). With the
// build: 23 pass / 0 fail.
// CONTROLS (each turned its tests red, then restored by sha from a saved copy;
// measured 2026-11-14 on this file at 23 tests):
//   (c1) `toParClass` returns 'lb-score' for every row -> A4, C3 red;
//   (c2) `.lb-score.under` rule removed from the CSS -> C1 red;
//   (c3) the `thru` sub-cell dropped from the event rows -> A3 red (and the
//        re-pinned "in play" test in tournament_multiround_test.js);
//   (c4) renderEventEntryCards returns '' -> B1 red (re-measured after the LB re-pin: B1, B2);
//   (c5) the TV's `.row .tp.under { color: var(--red) }` set back to lime -> C2
//        red here and test 2 of tournament_tv_event_columns_test.js (the
//        computed colour) red in Chrome.
//
// NET ON THE COMBINED BOARD (2026-11-15, Manny's per-file OK for
// tournament-engine.js - the paragraph "THE ENGINE IS NOT EDITED" above describes
// the 11-14 build; this wave edits it, see tournament_multiround_test.js s.10).
// D1 is re-pinned (Net ENABLED), D5-D7 and F6 are new, E1 and F1 re-pinned (the
// card says "Gross and Net"; a cell carries strokesReceived and net). Every test
// still arrives through ?tourney=STK and taps rendered onclick text; the Net
// numbers asserted are hand-checked against the fixture (stroke index = hole
// number, Ana 4 and Dana 15: 4 + 4 and 15 + 9 of 15 on the nine played).
// BASELINE against main dddb9565 (tournament.html sha256 507acbddaa14777d...,
// engine 1c659c46d0f91ca3...), run in a clean worktree at that commit: 27 tests - 20 pass /
// 7 fail (D1, D5, D6, D7, E1, F1, F6). With the build: 27 pass / 0 fail.
// CONTROLS (each restored by sha from a saved copy, RESTORED-OK printed):
//   (n1)-(n3) the engine controls listed in tournament_multiround_test.js s.10:
//        n1 -> D5, D7, F6 red; n2 -> D6 red; n3 -> D6 red;
//   (p1) renderLeaderboardBasis keeps the Net half disabled (enabled flag false)
//        -> D1, D5, D7 red (94 / 3 across the two files).
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The fixture (shared with the Chrome TV test): Starkey Cup, Cascade closed + Olympic in play, 8 golfers.
const { record, sc, ANA } = require('./helpers/two-round-fixture.js');

const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
function arrive(rec, user) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=STK', beforeRun(s) { s.__dbReads = {}; } });
    if (user !== null) sb.__auth.setUser(user || ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => clone(rec), exists: () => true }));
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const board = (sb) => el(sb, 'leaderboard-list').innerHTML;
// A TAP: the onclick of the first tag in `markup` that `pick` accepts, run in the
// page's realm with `this` bound to a stand-in carrying that tag's data- attributes.
function tap(sb, markup, pick) {
    const tags = markup.match(/<(button|div|a)\b[^>]*onclick="[^"]*"[^>]*>/g) || [];
    const tag = tags.find(pick);
    assert.ok(tag, 'nothing to tap in that markup');
    const code = /\bonclick="([^"]*)"/.exec(tag)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const ds = {}; tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; });
    sb.__tapEl = { dataset: ds };
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
const rowsOf = (html) => html.split('<div class="lb-row lb-event').slice(1).map((r) => r.split('</div>\n')[0]);

describe('A. the combined board, as it arrives (nothing tapped)', () => {
    test('A1 header: one column a round, a total, to par; no Rds column', () => {
        const sb = arrive(record());
        const head = text(board(sb).split('</div>')[0]);
        assert.equal(head, 'Pos Golfer R1 R2 Tot To Par');
        assert.ok(!/\bRds\b/.test(board(sb)), 'the Rds count is gone');
    });
    test('A2 each golfer row carries both rounds strokes and the total so far', () => {
        const sb = arrive(record());
        const ana = rowsOf(board(sb)).find((r) => /Ana Diaz/.test(r));
        assert.ok(ana, 'Ana has a row');
        const cells = (ana.match(/<span class="lb-rnd">([\s\S]*?)<\/span>/g) || []).map(text);
        assert.deepEqual(cells.map((c) => c.split(' ')[0]), ['70', '36'], 'R1 and R2 strokes, as the round boards show them');
        assert.match(ana, /<span class="lb-tot">106<\/span>/, '70 + 36 so far');
        assert.equal(rowsOf(board(sb)).length, 8, 'the whole field');
    });
    test('A3 a round in play reads "thru N" under its score; the word incomplete is gone', () => {
        const sb = arrive(record());
        const b = board(sb);
        assert.match(b, /<span class="lb-rnd">36<small>thru 9<\/small><\/span>/, "Ana's Olympic card thru 9");
        assert.match(b, /<span class="lb-rnd">70<\/span>/, 'a complete round has no thru line');
        assert.ok(!/\(incomplete\)/.test(b), 'the old tag is gone');
        assert.ok(!/<span class="lb-thru">/.test(b), 'no holes-thru column on the event board');
    });
    test('A4 colour rule: the under class sits only on negative to-par cells', () => {
        const sb = arrive(record());
        const rows = rowsOf(board(sb));
        const under = rows.filter((r) => /lb-score under/.test(r));
        assert.equal(under.length, 1, 'one golfer under par in this field');
        assert.match(under[0], /Ana Diaz/);
        assert.match(under[0], /<span class="lb-score under">-2<\/span>/);
        const over = rows.filter((r) => /<span class="lb-score">\+\d+<\/span>/);
        assert.ok(over.length >= 6, 'over-par rows are plain lb-score: ' + over.length);
        assert.ok(!/lb-score over/.test(board(sb)) && !/lb-score up\b/.test(board(sb)), 'nothing marks over par');
    });
    test('A5 the ranking is the engine\'s, untouched: the leader is the best complete-rounds golfer', () => {
        const sb = arrive(record());
        const rows = rowsOf(board(sb));
        assert.match(rows[0], /lb-pos">1<\/span>[\s\S]*Ana Diaz/);
        assert.match(rows[rows.length - 1], /Kim Vo/, 'the worst to-par last, every golfer has one round complete and one in play');
    });
});

describe('B. tapping a row opens both rounds\' cards in the scorecard sheet (LB-FINAL re-pin 2026-11-14)', () => {
    // RE-PINNED when the leaderboard build landed on this branch: Manny's LB pick
    // (a half-sheet with Prev / Next) replaced the first MR build's inline expand.
    // The cards are the same markup; they now render into #lb-sheet-body.
    const sheet = (sb) => el(sb, 'lb-sheet');
    const sheetBody = (sb) => el(sb, 'lb-sheet-body').innerHTML;
    test('B1 default: the sheet is closed; a tap on Ana opens it on her with both rounds and the rings', () => {
        const sb = arrive(record());
        assert.ok(!/\bopen\b/.test(sheet(sb).className), 'closed on arrival');
        assert.ok(!/lb-expand/.test(board(sb)), 'nothing inline on the board');
        tap(sb, board(sb), (t) => /data-entry="pA"/.test(t));
        assert.match(sheet(sb).className, /\bopen\b/, 'the sheet opened');
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Ana Diaz');
        assert.equal(el(sb, 'lb-sheet-sub').textContent, 'A Flight · handicap 4 · 1st · Event -2');
        const ex = sheetBody(sb);
        assert.match(ex, /Cascade · Cascade Golf Course · 70 <span class="under">\(-2\)<\/span><small>complete · handicap 4<\/small>/);
        assert.match(ex, /Olympic · Olympic Course · 36 <span class="">\(E\)<\/span><small>thru 9 · handicap 4<\/small>/);
        assert.equal((ex.match(/mark-eagle"/g) || []).length - 1, 2, 'two eagles (minus the key swatch)');
        assert.equal((ex.match(/mark-birdie"/g) || []).length - 1, 3, 'three birdies');
        assert.equal((ex.match(/mark-bogey"/g) || []).length - 1, 5, 'five bogeys');
        assert.equal((ex.match(/mark-double"/g) || []).length - 1, 0, 'no doubles');
        assert.match(ex, /class="s"><i class="">–<\/i>/, 'an unplayed hole is a dash in no ring');
        assert.ok(!/color:\s*(green|red)/.test(ex), 'rings carry no colour of their own');
    });
    test('B2 Prev / Next walk the board in its order; Close shuts it', () => {
        const sb = arrive(record());
        tap(sb, board(sb), (t) => /data-entry="pA"/.test(t));
        assert.equal(el(sb, 'lb-sheet-prev').disabled, true, 'nothing before the leader');
        assert.equal(el(sb, 'lb-sheet-next-name').textContent, 'Sam Ortiz', 'the next name is the board\'s second row');
        tap(sb, read(PAGE), (t) => /id="lb-sheet-next"/.test(t));
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Sam Ortiz');
        assert.equal(el(sb, 'lb-sheet-prev-name').textContent, 'Ana Diaz');
        assert.match(sheetBody(sb), /handicap 2/);
        tap(sb, read(PAGE), (t) => /id="lb-sheet-prev"/.test(t));
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Ana Diaz');
        tap(sb, read(PAGE), (t) => /onclick="closeLeaderboardSheet\(\)"/.test(t) && /button/.test(t));
        assert.ok(!/\bopen\b/.test(sheet(sb).className), 'closed');
    });
    test('B3 a watcher (signed out) opens it too, without the group scoring link', () => {
        const sb = arrive(record(), null);
        tap(sb, board(sb), (t) => /data-entry="pB"/.test(t));
        assert.match(sheet(sb).className, /\bopen\b/);
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Joe Fox');
        assert.equal(el(sb, 'lb-sheet-group').style.display, 'none', 'no scoring link for a watcher');
    });
});

describe('C. the colour rule at the source, both pages', () => {
    test('C1 the board CSS colours under par red and names no over-par colour', () => {
        const css = read(PAGE);
        assert.match(css, /\.lb-score\.under \{ color: var\(--accent-red\); \}/);
        assert.ok(!/\.lb-score\.over\b/.test(css), 'no over-par rule exists');
        assert.ok(!/\.lb-score[^{]*\{[^}]*(green|lime)/.test(css), 'no green anywhere near the score cell');
    });
    test('C2 the TV CSS: .tp.under is the red, and the old .tp.over rule is gone', () => {
        const css = read('tournament-tv.html');
        assert.match(css, /\.row \.tp\.under \{ color: var\(--red\); \}/);
        assert.ok(!/\.tp\.over/.test(css), 'over par keeps the ink colour');
        assert.ok(!/\.tp\.under \{ color: var\(--lime\)/.test(css), 'under par is not lime any more');
    });
    test('C3 a round board (single chip) marks under par the same way and nothing else', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('r1'\)/.test(t));
        const b = board(sb);
        assert.match(text(b.split('</div>')[0]), /^Pos Golfer Thru To Par$/, 'the round board keeps its Thru column');
        assert.match(b, /<span class="lb-score under">-2<\/span>/, 'Ana under par in red');
        assert.ok(!/lb-score over/.test(b));
        assert.ok(!/lb-rnd/.test(b), 'no round columns on a single round');
    });
});

describe('D. Gross | Net above the combined board', () => {
    // RE-PINNED 2026-11-15 (Net on the combined board, Manny's per-file OK for
    // tournament-engine.js): the Net half is ENABLED on a gross event whose rounds
    // can all allocate strokes; the "not available yet" sentence is gone from the
    // default state and comes back only naming a round that refuses (D6).
    test('D1 default: shown on the Event chip, Gross active, Net enabled; the board is still gross', () => {
        const sb = arrive(record());
        assert.equal(el(sb, 'lb-basis').style.display, 'flex');
        const h = el(sb, 'lb-basis').innerHTML;
        assert.match(h, /<button type="button" class="active" aria-pressed="true" >Gross<\/button>/);
        assert.match(h, /<button type="button" class="" aria-pressed="false" onclick="setLeaderboardBasis\('net'\)">Net<\/button>/);
        assert.ok(!/disabled/.test(h), 'neither half is disabled');
        assert.equal(el(sb, 'lb-basis-note').textContent, 'Gross across the rounds. Tap Net for each round’s net from its own handicap and course.');
        assert.ok(!/not available/.test(el(sb, 'lb-basis-note').textContent));
        const b = board(sb);
        assert.equal(text(b.split('</div>')[0]), 'Pos Golfer R1 R2 Tot To Par', 'the default board is the gross one');
        assert.ok(!/lb-strokes/.test(b), 'no strokes line until Net is tapped');
        assert.match(rowsOf(b)[0], /Ana Diaz[\s\S]*<span class="lb-tot">106<\/span>/);
    });
    test('D5 tap Net: per-round net cells, the Net total, the strokes line under each name, net to par; the order is the engine\'s net order; Gross brings it back', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-basis').innerHTML, (t) => /setLeaderboardBasis\('net'\)/.test(t));
        const h = el(sb, 'lb-basis').innerHTML;
        assert.match(h, /<button type="button" class="" aria-pressed="false" onclick="setLeaderboardBasis\('as-scored'\)">Gross<\/button>/);
        assert.match(h, /<button type="button" class="active" aria-pressed="true" >Net<\/button>/);
        assert.equal(el(sb, 'lb-basis-note').textContent, 'Gross so far · strokes received so far → net. Strokes are each course’s handicap for that round; on a round in play only holes played count.');
        const b = board(sb);
        assert.equal(text(b.split('</div>')[0]), 'Pos Golfer R1 R2 Net To Par');
        const rows = rowsOf(b);
        // Ana, handicap 4, stroke index = hole number on both cards: 4 strokes at
        // Cascade (70 -> 66) and 4 on Olympic's front nine (36 -> 32): 106 - 8 = 98.
        assert.match(rows[0], /lb-pos">1<\/span>[\s\S]*Ana Diaz[\s\S]*<small class="lb-strokes">106 · 8 strokes → 98<\/small>/);
        assert.match(rows[0], /<span class="lb-rnd">66<\/span><span class="lb-rnd">32<small>thru 9<\/small><\/span><span class="lb-tot">98<\/span>\s*<span class="lb-score under">-10<\/span>/);
        // Dana, handicap 15: 15 strokes at Cascade (84 -> 69) but only 9 of them on
        // Olympic thru 9 (44 -> 35) - the holes-played rule: 128 - 24 = 104, not 128 - 30.
        const dana = rows.find((r) => /Dana Ruiz/.test(r));
        assert.match(dana, /<small class="lb-strokes">128 · 24 strokes → 104<\/small>/);
        assert.match(dana, /<span class="lb-rnd">69<\/span><span class="lb-rnd">35<small>thru 9<\/small><\/span><span class="lb-tot">104<\/span>/);
        assert.match(dana, /lb-pos">4<\/span>/, 'Dana is 4th net (6th gross)');
        assert.match(rows.find((r) => /Sam Ortiz/.test(r)), /lb-pos">5<\/span>/, 'Sam is 5th net (2nd gross)');
        assert.equal(rows.filter((r) => /lb-score under/.test(r)).length, 5, 'five golfers under par net; the class still sits only on negative to-par cells');
        assert.ok(!/lb-score over/.test(b));
        tap(sb, el(sb, 'lb-basis').innerHTML, (t) => /setLeaderboardBasis\('as-scored'\)/.test(t));
        const g = board(sb);
        assert.equal(text(g.split('</div>')[0]), 'Pos Golfer R1 R2 Tot To Par');
        assert.ok(!/lb-strokes/.test(g));
        assert.match(rowsOf(g)[1], /Sam Ortiz/, 'the gross order is back');
    });
    test('D6 a round whose course has no real stroke index: Net disabled, the note names the round; the Rounds card says the same', () => {
        const rec = record(); rec.rounds.r2.courseIndexSynthetic = true;
        const sb = arrive(rec);
        const h = el(sb, 'lb-basis').innerHTML;
        assert.match(h, /class="active" aria-pressed="true" >Gross<\/button>/);
        assert.match(h, /<button type="button" class="" aria-pressed="false" disabled>Net<\/button>/);
        assert.equal(el(sb, 'lb-basis-note').textContent, 'Gross across the rounds. Olympic is on a course with no real stroke index, so net strokes can’t be allocated for it. Net on the combined board needs a real scorecard for that round.'.replace('’', "'"));
        assert.match(text(el(sb, 'rounds-card').innerHTML), /Board shows Event total · R1 · R2 · Tot · Gross \(Olympic is on a course with no real stroke index/);
        // Tapping Net (nothing to tap: the half is disabled) cannot happen; the
        // state the page is left in is still gross even if the basis were set.
        assert.equal(text(board(sb).split('</div>')[0]), 'Pos Golfer R1 R2 Tot To Par');
    });
    test('D7 in Net view the sheet\'s round lines read gross · strokes → net with net to par', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-basis').innerHTML, (t) => /setLeaderboardBasis\('net'\)/.test(t));
        tap(sb, board(sb), (t) => /data-entry="pD"/.test(t));
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Dana Ruiz');
        assert.equal(el(sb, 'lb-sheet-sub').textContent, 'B Flight · handicap 15 · 4th · Event -4');
        const ex = el(sb, 'lb-sheet-body').innerHTML;
        assert.match(ex, /Cascade · Cascade Golf Course · 84 · 15 strokes → 69 <span class="under">\(-3\)<\/span><small>complete · handicap 15<\/small>/);
        assert.match(ex, /Olympic · Olympic Course · 44 · 9 strokes → 35 <span class="under">\(-1\)<\/span><small>thru 9 · handicap 15<\/small>/);
    });
    test('D2 a round chip hides the switch; back on Event it returns', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('r2'\)/.test(t));
        assert.equal(el(sb, 'lb-basis').style.display, 'none');
        assert.equal(el(sb, 'lb-basis').innerHTML, '');
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('event'\)/.test(t));
        assert.equal(el(sb, 'lb-basis').style.display, 'flex');
    });
    test('D3 all-net rounds: Net is the active half and Gross is the disabled one', () => {
        const rec = record();
        rec.rounds.r1.scoringMode = 'net'; rec.rounds.r2.scoringMode = 'net';
        const sb = arrive(rec);
        const h = el(sb, 'lb-basis').innerHTML;
        assert.match(h, /class="" aria-pressed="false" disabled>Gross<\/button>/);
        assert.match(h, /class="active" aria-pressed="true" >Net<\/button>/);
        assert.match(el(sb, 'lb-basis-note').textContent, /^Net across the rounds/);
    });
    test('D4 a single-round event shows no switch at all', () => {
        const rec = record();
        delete rec.rounds; delete rec.eventModel; rec.scores = sc('pA', ANA);
        const sb = arrive(rec);
        assert.equal(el(sb, 'lb-basis').style.display, 'none');
        assert.ok(!/lb-rnd/.test(board(sb)));
    });
});

describe('E. the Rounds card on Setup', () => {
    test('E1 default: both rounds as tiles with course, format, scoring and state; the board, flights and prize basis lines', () => {
        const sb = arrive(record());
        const t = text(el(sb, 'rounds-card').innerHTML);
        assert.match(t, /^2 rounds · 36 holes · each round has its own course/);
        assert.match(t, /Cascade Cascade Golf Course · 18 holes Individual Stroke Play · Gross ✓ Closed · 8 of 8 cards/);
        assert.match(t, /Olympic Olympic Course · 18 holes Individual Stroke Play · Gross ● Open · in play, 8 of 8 scoring/);
        // RE-PINNED 2026-11-15 (Net on the combined board): both bases are on the board.
        assert.match(t, /Board shows Event total · R1 · R2 · Tot · Gross and Net Flights/);
        assert.match(t, /Flights A Flight \(4\) · B Flight \(4\)/);
        assert.match(t, /Prizes go by Event total · trophies and pro shop credit$/);
        assert.ok(!/\$\d/.test(t), 'no amounts on the card');
    });
    test('E2 the prize basis names the round when one is saved; the editable list is still under the card', () => {
        const sb = arrive(record({ payoutBasis: 'r2' }));
        assert.match(text(el(sb, 'rounds-card').innerHTML), /Prizes go by Olympic ·/);
        assert.match(el(sb, 'rounds-list').innerHTML, /renameRound\('r1'/, 'the list keeps its editors');
    });
    test('E3 a single-round event has no card', () => {
        const rec = record(); delete rec.rounds; delete rec.eventModel;
        const sb = arrive(rec);
        assert.equal(el(sb, 'rounds-card').innerHTML, '');
    });
});

describe('F. event-columns.js, the one builder both pages read', () => {
    const engine = loadJsFile('tournament-engine.js');
    // On a tree without the module (the baseline) these five fail on this line
    // instead of cancelling the whole file.
    let ec = null; try { ec = require('./event-columns.js'); } catch (e) { ec = null; }
    const need = () => assert.ok(ec, 'event-columns.js exists');
    const fns = { countableRoundIds: engine.countableRoundIds, roundView: engine.roundView, computeTournamentLeaderboard: engine.computeTournamentLeaderboard };
    test('F1 columns follow the engine\'s countable rounds, in order, with strokes/thru/complete per golfer', () => {
        need();
        const c = ec.eventRoundColumns(record(), fns);
        assert.deepEqual(c.columns.map((x) => [x.short, x.name, x.holes, x.status]), [['R1', 'Cascade', 18, 'closed'], ['R2', 'Olympic', 18, 'open']]);
        // RE-PINNED 2026-11-15: a cell also carries strokesReceived and net (0 and
        // the gross strokes with no basis asked for). Every number above is unchanged.
        assert.deepEqual(c.byPlayer.pA.r1, { strokes: 70, thru: 18, toPar: -2, complete: true, hasScores: true, strokesReceived: 0, net: 70 });
        assert.deepEqual(c.byPlayer.pA.r2, { strokes: 36, thru: 9, toPar: 0, complete: false, hasScores: true, strokesReceived: 0, net: 36 });
        assert.equal(c.byPlayer.pF.r2.thru, 7);
    });
    test('F6 basis net: each cell is that round\'s net from its own snapshot and card; a round in play allocates on holes played only', () => {
        need();
        const fnsNet = Object.assign({}, fns, { roundViewOnBasis: engine.roundViewOnBasis });
        const c = ec.eventRoundColumns(record(), fnsNet, { basis: 'net' });
        assert.deepEqual(c.byPlayer.pD.r1, { strokes: 84, thru: 18, toPar: -3, complete: true, hasScores: true, strokesReceived: 15, net: 69 });
        assert.deepEqual(c.byPlayer.pD.r2, { strokes: 44, thru: 9, toPar: -1, complete: false, hasScores: true, strokesReceived: 9, net: 35 });
        assert.deepEqual(ec.eventRoundColumns(record(), fns, { basis: 'net' }), { columns: [], byPlayer: {} }, 'without the engine\'s basis view it returns the empty shape, never a gross cell labelled net');
    });
    test('F2 a round still in setup is not a column (the engine does not count it either)', () => {
        need();
        const rec = record(); rec.rounds.r3 = Object.assign({}, rec.rounds.r2, { name: 'Sunday', status: 'setup', createdAt: 30, scores: {} });
        assert.deepEqual(ec.eventRoundColumns(rec, fns).columns.map((x) => x.short), ['R1', 'R2']);
    });
    test('F3 holeMark: circle under par, square over, nothing at par', () => {
        need();
        assert.equal(ec.holeMark(3, 4), 'mark-birdie');
        assert.equal(ec.holeMark(2, 4), 'mark-eagle');
        assert.equal(ec.holeMark(1, 4), 'mark-eagle');
        assert.equal(ec.holeMark(4, 4), '');
        assert.equal(ec.holeMark(5, 4), 'mark-bogey');
        assert.equal(ec.holeMark(6, 4), 'mark-double');
        assert.equal(ec.holeMark(9, 4), 'mark-double');
        assert.equal(ec.holeMark(0, 4), '');
    });
    test('F4 playerRoundHoles sums the card the way the scorecard does', () => {
        need();
        const c = ec.playerRoundHoles(record(), 'r1', 'pA', fns);
        assert.equal(c.total, 70); assert.equal(c.out, 33); assert.equal(c.inn, 37); assert.equal(c.thru, 18);
        assert.equal(c.parOut, 36); assert.equal(c.parIn, 36);
        assert.deepEqual(c.holes.filter((h) => h.mark).map((h) => h.hole + ':' + h.mark), ['2:mark-birdie', '5:mark-bogey', '7:mark-eagle', '9:mark-birdie', '17:mark-bogey']);
        const o = ec.playerRoundHoles(record(), 'r2', 'pA', fns);
        assert.equal(o.thru, 9); assert.equal(o.total, 36); assert.equal(o.holes[9].score, 0);
    });
    test('F5 without the engine in reach it returns an empty shape, never throws', () => {
        need();
        assert.deepEqual(ec.eventRoundColumns(record(), {}), { columns: [], byPlayer: {} });
    });
});
