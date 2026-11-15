// ============================================================================
// THE LEADERBOARD TAB (LB-FINAL, Manny's pick 2026-11-14, built on the Advisor relay
// ADVISOR-20261114-1156-OK-build-final-set): Leaderboard / Skins / Pairings at the
// top of the Board tab, a tappable score header on a NET round (Net ⇄ / Gross ⇄),
// a scorecard sheet opened from any board row with Prev / Next in board order,
// and the flight chips as they were. It sits on the 36-hole board (MR) and the
// prize cards (PO): the Skins tab reads the same skinsSummary the prize screen does.
//
// HOW EACH TEST ARRIVES: ?tourney=STK, the page's own record listener fired with
// the two-course fixture (helpers/two-round-fixture.js) plus scoring groups, taps
// run the onclick text of rendered markup. No render function is called by name.
// The DEFAULT state (Leaderboard tab, sheet closed, Net header on a net round) is
// tested first.
//
// WHAT mini-dom CANNOT PROVE: layout. Where the sheet sits (bottom half-sheet on
// a phone, right-side panel from 900px) is measured in Chrome by
// tournament_leaderboard_sheet_chrome_test.js. Everything else is here.
//
// THE RULE BEHIND THE PAIRINGS TAB: a group's scorecard link carries its scoring
// key, so it is rendered for the organizer only; a watcher gets names and starts.
// Tests D3 / D4 pin both sides.
//
// BASELINE (final run of the final file) against main e1312cf2 (tournament.html
// sha256 fad162561b8f..., no sub-tabs, no sheet, no skins.js), run in a clean
// worktree at that commit: 18 tests - 1 pass / 17 fail. The one that passes is
// C1 (a gross round's header is plain To Par, true before and after). With the
// build: 18 pass / 0 fail.
// CONTROLS (each red, then restored by sha from a saved copy; measured 2026-11-14):
//   (k1) renderPairingsTab renders links for everyone (owner check removed) -> D4 red;
//   (k2) tapLeaderboardBasis does nothing -> C2 red;
//   (k3) the Skins tab passes no {tab:true} (owner controls leak in) -> B1, B2 red;
//   (k4) stepLeaderboardSheet ignores its direction -> E2 red here and B2 of
//        tournament_event_board_test.js red.
// RE-PIN 2026-11-15 09:18 (Manny: "go net (switch on everywhere)"): C3's mixed
// arm flipped - a Gross/Net mix now shows the switch with Gross selected instead
// of the refusal. BASELINE against preview-net 62f9e19e (tournament.html sha256
// 25d00b9a501adea9...): 18 tests - 17 pass / 1 fail (C3). With the build: 18 / 0.
// CONTROL (q2 in tournament_event_board_test.js: the mix treated as no board) ->
// C3 red; tournament.html restored by sha (c0953d7a50209181).
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/two-round-fixture.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

// The fixture with scoring groups on both rounds and a shotgun start, so the
// Pairings tab and the sheet's group link have something to show.
function record(opts) {
    const rec = F.record(opts);
    rec.startType = 'shotgun';
    rec.rounds.r1.scoringGroups = { g1: { name: 'Group 1', playerIds: ['pA', 'pB', 'pC', 'pF'], startingHole: '1', createdAt: 1 }, g2: { name: 'Group 2', playerIds: ['pD', 'pE', 'pG', 'pH'], startingHole: '10', createdAt: 2 } };
    rec.rounds.r2.scoringGroups = { h1: { name: 'Sunday 1', playerIds: ['pA', 'pD'], startingHole: '1', createdAt: 1 }, h2: { name: 'Sunday 2', playerIds: ['pB', 'pC', 'pE', 'pF', 'pG', 'pH'], startingHole: '5', createdAt: 2 } };
    return rec;
}
function netRound(rec) {
    rec.rounds.r1.scoringMode = 'net';
    rec.rounds.r1.handicaps = { pA: '4', pB: '6', pC: '2', pF: '8', pD: '15', pE: '14', pG: '18', pH: '12' };
    return rec;
}
function single() {
    const rec = F.record(); delete rec.rounds; delete rec.eventModel;
    rec.scores = Object.assign({}, F.sc('pA', F.ANA), F.flat('pB', 75, 18));
    rec.scoringGroups = { g1: { name: 'Group 1', playerIds: ['pA', 'pB'], createdAt: 1 } };
    return rec;
}
function arrive(rec, user) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=STK', beforeRun(s) { s.__dbReads = {}; } });
    if (user !== null) sb.__auth.setUser(user || ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => clone(rec), exists: () => true }));
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const board = (sb) => el(sb, 'leaderboard-list').innerHTML;
const shown = (sb, id) => (el(sb, id).style.display || '') !== 'none';
function tap(sb, markup, pick) {
    const tags = markup.match(/<(button|div|span|a)\b[^>]*onclick="[^"]*"[^>]*>/g) || [];
    const tag = tags.find(pick);
    assert.ok(tag, 'nothing to tap in that markup');
    const code = /\bonclick="([^"]*)"/.exec(tag)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const ds = {}; tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { ds[k] = v; });
    sb.__tapEl = { dataset: ds };
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
// The sub-tab buttons are static markup (mini-dom keeps no innerHTML for them), so
// a tap reads the page source, as the sheet's buttons do.
const subtabs = () => read(PAGE);
const rowsOf = (html) => html.split('<div class="lb-row lb-').slice(1);
const firstToPar = (html) => { const m = /<span class="lb-score(?: under)?">([^<]+)<\/span>/.exec(rowsOf(html)[0] || ''); return m ? m[1] : null; };

describe('A. the sub-tabs, as they arrive', () => {
    test('A1 default: Leaderboard is the tab, the board panel shows, Skins and Pairings are hidden', () => {
        const sb = arrive(record());
        assert.match(el(sb, 'lb-sub-board').className, /\bactive\b/);
        assert.ok(!/\bactive\b/.test(el(sb, 'lb-sub-skins').className) && !/\bactive\b/.test(el(sb, 'lb-sub-pairings').className));
        assert.ok(shown(sb, 'lb-board-panel') && !shown(sb, 'lb-skins-panel') && !shown(sb, 'lb-pairings-panel'));
        assert.match(text(board(sb).split('</div>')[0]), /^Pos Golfer R1 R2 Tot To Par$/, 'the 36-hole board is the default view');
    });
    test('A2 tapping Skins and Pairings swaps the panels; tapping Leaderboard brings the board back', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-skins"/.test(t));
        assert.ok(!shown(sb, 'lb-board-panel') && shown(sb, 'lb-skins-panel') && !shown(sb, 'lb-pairings-panel'));
        assert.equal(el(sb, 'lb-sub-skins').getAttribute('aria-selected'), 'true');
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        assert.ok(!shown(sb, 'lb-skins-panel') && shown(sb, 'lb-pairings-panel'));
        tap(sb, subtabs(sb), (t) => /id="lb-sub-board"/.test(t));
        assert.ok(shown(sb, 'lb-board-panel') && !shown(sb, 'lb-pairings-panel'));
    });
    test('A3 the flight chips are untouched and still narrow the board', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-flight-filter').innerHTML, (t) => /setLeaderboardFlight\('fB'\)/.test(t));
        const rows = rowsOf(board(sb));
        assert.equal(rows.length, 4);
        assert.ok(rows.every((r) => /Dana Ruiz|Lee Park|Kim Vo|Ray Diaz/.test(r)), 'B Flight only');
    });
});

describe('B. the Skins tab', () => {
    test('B1 default: skins so far, gross, the organizer\'s carryover, per round; the same numbers as the prize screen', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-skins"/.test(t));
        const t = text(el(sb, 'lb-skins-panel').innerHTML);
        assert.match(t, /^\d+ skins? so far Gross · carryover on · Cascade \d+ skins? · Olympic \d+ skins? \(holes still open\)/);
        assert.match(t, /The organizer has not set an amount a skin yet/);
        const sk = vm.runInContext('TournamentPrizes.skinsSummary(currentData)', sb);
        assert.match(t, new RegExp('^' + sk.skins + ' skins? so far'), 'the count is skinsSummary\'s');
        assert.ok(sk.skins > 0, 'positive: the fixture has skins');
        assert.ok((el(sb, 'lb-skins-panel').innerHTML.match(/class="pz-row/g) || []).length >= sk.holesWon, 'a row per hole won');
    });
    test('B2 the tab is read-only: no amount input, no carryover buttons, no Open toggle; a watcher sees the same', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-skins"/.test(t));
        const h = el(sb, 'lb-skins-panel').innerHTML;
        assert.ok(!/prize-skin-amount|savePrizeSetting|togglePrizeSkins|id="prize-skins-open"/.test(h), 'no organizer controls on the tab');
        const w = arrive(record(), null);
        tap(w, subtabs(w), (t) => /id="lb-sub-skins"/.test(t));
        assert.equal(text(el(w, 'lb-skins-panel').innerHTML), text(h), 'watcher and organizer read the same tab');
    });
    test('B3 when the organizer has set an amount, the tab names it and never calls it cash', () => {
        const sb = arrive(record({ prizeSettings: { perSkin: 20, carryover: true } }));
        tap(sb, subtabs(sb), (t) => /id="lb-sub-skins"/.test(t));
        const t = text(el(sb, 'lb-skins-panel').innerHTML);
        assert.match(t, /\$20 pro shop credit a skin, as the organizer set it/);
        assert.ok(!/cash/i.test(t));
    });
});

describe('C. the score header on a round board', () => {
    test('C1 a GROSS round: the header is plain To Par, no tap', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('r1'\)/.test(t));
        const head = board(sb).split('</div>')[0];
        assert.match(text(head), /^Pos Golfer Thru To Par$/);
        assert.ok(!/lb-th-tap/.test(head));
    });
    test('C2 a NET round: the header reads Net ⇄; a tap shows the same golfers as gross and reads Gross ⇄; a second tap goes back', () => {
        const sb = arrive(netRound(record()));
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('r1'\)/.test(t));
        let b = board(sb);
        assert.match(text(b.split('</div>')[0]), /^Pos Golfer Thru Net ⇄$/);
        const netFirst = firstToPar(b);
        tap(sb, b, (t) => /tapLeaderboardBasis\(\)/.test(t));
        b = board(sb);
        assert.match(text(b.split('</div>')[0]), /^Pos Golfer Thru Gross ⇄$/);
        const grossRows = rowsOf(b);
        assert.equal(grossRows.length, 8, 'the same field');
        const ana = grossRows.find((r) => /Ana Diaz/.test(r));
        assert.match(ana, /<span class="lb-score under">-2<\/span>/, 'Ana\'s gross 70 is -2 and red');
        assert.notEqual(firstToPar(b), null);
        tap(sb, b, (t) => /tapLeaderboardBasis\(\)/.test(t));
        b = board(sb);
        assert.match(text(b.split('</div>')[0]), /^Pos Golfer Thru Net ⇄$/);
        assert.equal(firstToPar(b), netFirst, 'back to the net board');
    });
    // RE-PINNED 2026-11-15 09:18 (Manny: "go net (switch on everywhere)"): a Gross/Net
    // mix is no longer refused on the Event chip - the switch shows with Gross
    // selected and the engine combines on that basis (tournament_event_board_test.js D9).
    test('C3 the Event chip keeps the Gross | Net switch and a plain header (both rounds net); one net + one gross round gets the switch too, Gross selected', () => {
        const both = netRound(record());
        both.rounds.r2.scoringMode = 'net'; both.rounds.r2.handicaps = both.rounds.r1.handicaps;
        const sb = arrive(both);
        assert.equal(el(sb, 'lb-basis').style.display, 'flex');
        assert.match(el(sb, 'lb-basis').innerHTML, /class="active" aria-pressed="true" >Net</);
        assert.ok(!/lb-th-tap/.test(board(sb)), 'the event board has no tappable header');
        const mixed = arrive(netRound(record()));
        assert.equal(el(mixed, 'lb-basis').style.display, 'flex', 'the switch shows on a mixed event');
        assert.match(el(mixed, 'lb-basis').innerHTML, /class="active" aria-pressed="true" >Gross</);
        assert.equal(el(mixed, 'lb-combined-note').style.display, 'none', 'no refusal sentence');
        assert.ok(!/mixes Gross and Net rounds/.test(el(mixed, 'lb-combined-note').textContent));
        assert.ok(!/lb-th-tap/.test(board(mixed)), 'and still no tappable header on the event board');
    });
});

describe('D. the Pairings tab', () => {
    test('D1 default: the first round\'s groups in starting-hole order, names, starts; a chip a round', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        const h = el(sb, 'lb-pairings-panel').innerHTML;
        assert.match(text(h), /Cascade Olympic Group 1 Hole 1 Ana Diaz · Joe Fox · Sam Ortiz · Mia Chen/);
        assert.match(text(h), /Group 2 Hole 10 Dana Ruiz · Lee Park · Kim Vo · Ray Diaz/);
        assert.match(text(h), /Shotgun start: each group starts on its hole\./);
    });
    test('D2 the Olympic chip shows Sunday\'s groups', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        tap(sb, el(sb, 'lb-pairings-panel').innerHTML, (t) => /setPairingsRound\('r2'\)/.test(t));
        const t = text(el(sb, 'lb-pairings-panel').innerHTML);
        assert.match(t, /Sunday 1 Hole 1 Ana Diaz · Dana Ruiz/);
        assert.match(t, /Sunday 2 Hole 5/);
    });
    test('D3 the organizer gets a Group card link per group and the Print button', () => {
        const sb = arrive(record());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        const h = el(sb, 'lb-pairings-panel').innerHTML;
        assert.equal((h.match(/Group card ▶/g) || []).length, 2);
        assert.match(h, /href="[^"]*tourney=STK&group=g1&round=r1/);
        assert.match(h, /onclick="printTournamentPairings\(\)"/);
        assert.match(text(h), /Group cards are scoring links; share them only with that group\./);
    });
    test('D4 a watcher gets names and starts, no scoring link, no print', () => {
        const sb = arrive(record(), null);
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        const h = el(sb, 'lb-pairings-panel').innerHTML;
        assert.match(text(h), /Group 1 Hole 1 Ana Diaz/);
        assert.ok(!/group=|&k=|Group card|printTournamentPairings/.test(h), 'nothing a watcher could score with');
    });
    test('D5 a single-round tee-time event: Tee 1 for everyone, no round chips', () => {
        const sb = arrive(single());
        tap(sb, subtabs(sb), (t) => /id="lb-sub-pairings"/.test(t));
        const t = text(el(sb, 'lb-pairings-panel').innerHTML);
        assert.match(t, /^Group 1 Tee 1 Ana Diaz · Joe Fox/);
        assert.ok(!/setPairingsRound/.test(el(sb, 'lb-pairings-panel').innerHTML));
        assert.match(t, /Everyone starts on the first tee\./);
    });
});

describe('E. the scorecard sheet from a round board and a single-round record', () => {
    test('E1 single-round: a tap opens the golfer\'s 18 holes with the rings and the round line', () => {
        const sb = arrive(single());
        assert.ok(!/\bopen\b/.test(el(sb, 'lb-sheet').className));
        tap(sb, board(sb), (t) => /data-entry="pA"/.test(t));
        assert.match(el(sb, 'lb-sheet').className, /\bopen\b/);
        assert.equal(el(sb, 'lb-sheet-name').textContent, 'Ana Diaz');
        const b = el(sb, 'lb-sheet-body').innerHTML;
        assert.equal((b.match(/class="h"/g) || []).length, 18);
        assert.match(text(b), /^Cascade · 70 \(-2\) complete Hole 1 2 3/);
        assert.equal((b.match(/mark-eagle"/g) || []).length - 1, 1);
        assert.match(el(sb, 'lb-sheet-group').getAttribute('href') || '', /tourney=STK&group=g1/, 'the organizer\'s link to the group card');
    });
    test('E2 Prev / Next follow the board order on a round chip; Next past the end does nothing', () => {
        const sb = arrive(record());
        tap(sb, el(sb, 'lb-round-filter').innerHTML, (t) => /setLeaderboardRound\('r2'\)/.test(t));
        const names = rowsOf(board(sb)).map((r) => text(r.split('</span>')[1] || '').split(' (')[0]);
        tap(sb, board(sb), (t) => /data-entry="pA"/.test(t));
        const i = names.indexOf('Ana Diaz');
        assert.ok(i >= 0);
        assert.equal(el(sb, 'lb-sheet-next-name').textContent, names[i + 1] || '');
        tap(sb, read(PAGE), (t) => /id="lb-sheet-next"/.test(t));
        assert.equal(el(sb, 'lb-sheet-name').textContent, names[i + 1]);
        assert.match(text(el(sb, 'lb-sheet-body').innerHTML), /^Olympic ·/, 'the chip\'s round, not the event');
        for (let k = 0; k < 10; k++) tap(sb, read(PAGE), (t) => /id="lb-sheet-next"/.test(t));
        assert.equal(el(sb, 'lb-sheet-name').textContent, names[names.length - 1], 'stops at the last row');
        assert.equal(el(sb, 'lb-sheet-next').disabled, true);
    });
    test('E3 on the Event chip the organizer\'s group link goes to the round in play', () => {
        const sb = arrive(record());
        tap(sb, board(sb), (t) => /data-entry="pA"/.test(t));
        assert.match(el(sb, 'lb-sheet-group').getAttribute('href') || '', /group=h1&round=r2/, 'Sunday 1 at Olympic, the open round');
        assert.equal(el(sb, 'lb-sheet-group').style.display, '');
    });
    test('E4 the sheet CSS: a bottom sheet by default, a right-side panel from 900px', () => {
        const css = read(PAGE);
        assert.match(css, /\.lb-sheet-overlay \{ display: none; position: fixed; inset: 0;[^}]*align-items: flex-end; \}/);
        assert.match(css, /@media \(min-width: 900px\) \{\s*\.lb-sheet-overlay \{[^}]*justify-content: flex-end;[^}]*\}\s*\.lb-sheet \{ width: 420px;/);
    });
});
