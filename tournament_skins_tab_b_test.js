// ============================================================================
// THE PUBLIC SKINS TAB, LAYOUT B (Manny's pick 2026-11-19, "Skins tab B";
// mockup ~/Desktop/claude-mailbox-shared/tournaments/skins-sharpen/skins-tab-b.png).
// Under the one header line (tournament_skins_tab_words_test.js) a golfer sees:
//   - filters: Round (only with more than one round), Gross / Net (only when the
//     event's skins play both), Flight (All flights + each flight, when the event
//     has flights). Default: the first round, gross, All flights;
//   - "Most skins" first: competition rank (ties share, T2), golfer, skins won and,
//     only when an amount exists, the amount in the event's prize word (shortText);
//   - "Hole by hole ›" collapsed, with "N won · M tied" (holes, for the filter);
//     a tap opens the existing hole-by-hole rows for the filter, a second closes it.
// Everything is read from TournamentPrizes.skinsSummary's round panels; nothing on
// the tab decides who won. Filters and the open list are per viewer, in memory.
//
// THE FLIGHT FILTER NARROWS WHOSE SKINS ARE SHOWN; IT NEVER RE-DECIDES A HOLE.
// That is how the skins were computed: an all-field game (no rules, or a game with
// no flights) is decided across the whole field, so "B Flight" lists B golfers'
// wins from that same game and says "Each hole was decided across the whole field."
// A game limited to some flights is decided among them, so it is shown only under
// a flight it covers, with no whole-field sentence. Tied holes are the game's, so
// the tie line and the "tied" count stay the field's.
//
// THE USER PATH, in mini-dom: arrive at tournament.html?tourney=STK, the record
// arrives on the page's own listener, the Skins sub-tab is tapped by running the
// button's own onclick from the static markup, and every filter chip and "Hole by
// hole ›" is tapped through the onclick the page rendered. No page function is
// called by name. HARNESS LIMITS: no layout (the 390 px fit is measured in Chrome,
// tools/skins-tab-b-check.js), innerHTML is a string (rows are read from markup).
// FIXTURES helpers/prize-fixtures.js: starkey() (Cascade 4 Ray, 9 Ana, 15 Dana;
// Olympic 3 Mia, 11 Sam, 16 Joe; A and B flights), oneDay() (one round).
//
// BASELINE (final file, 15 tests) against 971f1168 (tournament.html sha256
// 02f3b2e783d924f7..., swapped in from a saved copy, restored by sha 07d92a8a4c83097e
// beside RESTORED-OK): 0 PASS / 15 FAIL. 0 + 15 = 15. Every test reaches the filters
// or the Most skins table first, neither of which exists before layout B.
// AFTER (tournament.html sha256 07d92a8a4c83097e...): 15 / 0.
// NEGATIVE CONTROLS (measured 2026-11-19, each on the built page, restored from the
// saved copy, sha 07d92a8a4c83097e printed beside RESTORED-OK):
//   1. ties never share a rank (no "T")            -> A2 A3 B1 B2 B3 B4 D1 red (8 / 7)
//   2. the flight filter shows everyone            -> B2 C2 red (13 / 2)
//   3. Hole by hole open by default                -> A4 B2 C1 C2 red (11 / 4)
//   4. the amount column always on                 -> D1 red (14 / 1)
//   5. the Net chip ignored (always gross panels)  -> B3 red (14 / 1)
//   6. the round chip ignored (always round 1)     -> B1 C2 red (13 / 2)
//   7. Gross / Net shown on a gross-only event     -> A1 red (14 / 1)
//   8. a flight game kept under another flight     -> B4 red (14 / 1; inert until B4
//      gained its hole-list assertions, which is why they are there)
//   9. the whole-field sentence on every flight    -> B4 red (14 / 1)
//  10. the hole list ignores the flight filter     -> C2 red (14 / 1)
//  11. the Hole by hole tap does nothing           -> 12 / 3 here, and the re-pinned
//      B1 of tournament_leaderboard_tabs_test.js red (17 / 1)
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const F = require('./helpers/prize-fixtures.js');
const SRC = require('fs').readFileSync(require('path').join(__dirname, 'tournament.html'), 'utf8');

const NEW = Date.UTC(2026, 10, 19, 17, 0, 0);
const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const ev = (ps, extra) => F.starkey(Object.assign({ createdAt: NEW }, ps ? { prizeSettings: ps } : {}, extra || {}));
const BOTH = { g1: { name: '', basis: 'both', createdAt: 1 } };
// Handicaps that make net differ from gross (as tools/place-rules-check.js).
const HC = { pA: '8', pS: '0', pJ: '2', pM: '1', pL: '0', pD: '6', pK: '10', pR: '3' };
const withHc = (rec) => { Object.keys(rec.players).forEach((k) => { rec.players[k].handicap = HC[k]; }); return rec; };

function open(rec, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=STK' });
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/STK$/.test(h.path)).forEach((h) => h.cb({ val: () => plain(rec), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    const m = /id="lb-sub-skins"[^>]*onclick="([^"]+)"/.exec(SRC);
    assert.ok(m, 'positive: the Skins sub-tab exists in the markup');
    vm.runInContext(m[1], sb);
    return sb;
}
const panel = (sb) => String(sb.document.getElementById('lb-skins-panel').innerHTML);
// A tap on a rendered element by its id: the onclick the page wrote, as the browser runs it.
function tap(sb, id) {
    const tag = (panel(sb).match(/<(?:button|a|div)\b[^>]*>/g) || []).find((t) => new RegExp(`\\bid="${id}"`).test(t));
    assert.ok(tag, 'nothing rendered with id ' + id);
    const code = /\bonclick="([^"]*)"/.exec(tag)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    vm.runInContext('(function () { ' + code + ' })()', sb);
}
// The chips of one filter group, by aria-label: [{ id, label, on }].
function chips(html, label) {
    const m = new RegExp(`<div class="pz-chips" role="group" aria-label="${label}">([\\s\\S]*?)</div>`).exec(html);
    if (!m) return null;
    return (m[1].match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || []).map((b) => ({ id: /id="([^"]+)"/.exec(b)[1], label: text(b), on: /aria-pressed="true"/.test(b) }));
}
// The Most skins table: one text line per row.
function most(html) {
    const m = /<div class="pz-card sk-most" id="lb-skins-most">([\s\S]*?)<\/div><button/.exec(html);
    assert.ok(m, 'positive: the Most skins table is on the tab');
    assert.match(m[1], /Most skins/, 'positive: the table has its title');
    return (m[1].split('<div class="pz-row sk-most-row">').slice(1)).map(text);
}
const holesBtn = (html) => { const m = /<button[^>]*id="lb-skins-holes"[^>]*>([\s\S]*?)<\/button>/.exec(html); return m ? { text: text(m[1]), open: /aria-expanded="true"/.test(m[0]) } : null; };
const holesList = (html) => { const i = html.indexOf('id="lb-skins-holes-list">'); return i === -1 ? null : text(html.slice(i + 'id="lb-skins-holes-list">'.length)); };

describe('A. the default state: the first round, gross, all flights, Most skins first, holes collapsed', () => {
    test('A1 the filters: a chip per round (Cascade on), no Gross / Net on a gross event, All flights on', () => {
        const html = panel(open(ev({ perSkin: 20 })));
        assert.deepEqual(chips(html, 'Round').map((c) => [c.label, c.on]), [['Cascade', true], ['Olympic', false]]);
        assert.deepEqual(chips(html, 'Flight').map((c) => [c.label, c.on]), [['All flights', true], ['A Flight', false], ['B Flight', false]]);
        assert.equal(chips(html, 'Gross or net'), null, 'only gross is played: no basis filter');
    });
    test('A2 Most skins on Cascade, $20 a skin: ties share the rank, the amount in the prize word', () => {
        assert.deepEqual(most(panel(open(ev({ perSkin: 20 })))), ['T1 Ana Diaz 1 $20 credit', 'T1 Dana Ruiz 1 $20 credit', 'T1 Ray Diaz 1 $20 credit']);
    });
    test('A3 competition ranks: one ahead, three share second (T2); skins x the value a skin', () => {
        const rec = ev({ perSkin: 20 });
        rec.rounds.r1.scores.pL_h2 = 3;   // Lee: a birdie on a halved hole, his skin
        rec.rounds.r1.scores.pA_h5 = 2;   // Ana: a second skin
        assert.deepEqual(most(panel(open(rec))), ['1 Ana Diaz 2 $40 credit', 'T2 Dana Ruiz 1 $20 credit', 'T2 Lee Park 1 $20 credit', 'T2 Ray Diaz 1 $20 credit']);
    });
    test('A4 Hole by hole is collapsed, with its one-line summary of the filter', () => {
        const html = panel(open(ev({ perSkin: 20 })));
        assert.deepEqual(holesBtn(html), { text: 'Hole by hole › 3 won · 15 tied', open: false });
        assert.equal(holesList(html), null, 'no hole rows until it is tapped');
        assert.ok(html.indexOf('id="lb-skins-most"') < html.indexOf('id="lb-skins-holes"'), 'Most skins comes first');
    });
    test('A5 carryover on: the carried skins count in Most skins (Cascade: Dana 6, Ana 5, Ray 4)', () => {
        assert.deepEqual(most(panel(open(ev({ perSkin: 20, carryover: true })))), ['1 Dana Ruiz 6 $120 credit', '2 Ana Diaz 5 $100 credit', '3 Ray Diaz 4 $80 credit']);
    });
});

describe('B. each filter changes the table', () => {
    test('B1 Round: tapping Olympic shows Olympic\'s winners, the chip moves', () => {
        const sb = open(ev({ perSkin: 20 }));
        tap(sb, 'lb-skins-round-1');
        const html = panel(sb);
        assert.deepEqual(chips(html, 'Round').map((c) => c.on), [false, true]);
        assert.deepEqual(most(html), ['T1 Joe Fox 1 $20 credit', 'T1 Mia Chen 1 $20 credit', 'T1 Sam Ortiz 1 $20 credit']);
    });
    test('B2 Flight: B Flight lists B golfers\' wins and says the holes were decided across the field', () => {
        const sb = open(ev({ perSkin: 20 }));
        tap(sb, 'lb-skins-flight-1');
        const html = panel(sb);
        assert.deepEqual(most(html), ['T1 Dana Ruiz 1 $20 credit', 'T1 Ray Diaz 1 $20 credit']);
        assert.match(text(html), /B Flight golfers' skins\. Each hole was decided across the whole field\./);
        assert.deepEqual(holesBtn(html), { text: 'Hole by hole › 2 won · 15 tied', open: false });
        tap(sb, 'lb-skins-flight-all');
        assert.equal(most(panel(sb)).length, 3, 'All flights brings Ana back');
        assert.doesNotMatch(text(panel(sb)), /golfers' skins/, 'no flight sentence on All flights');
    });
    test('B3 Gross / Net: a gross-and-net game shows both chips; Net shows the net winners', () => {
        const sb = open(withHc(ev({ perSkin: 20, skins: { games: BOTH } })));
        assert.deepEqual(chips(panel(sb), 'Gross or net').map((c) => [c.label, c.on]), [['Gross', true], ['Net', false]]);
        assert.deepEqual(most(panel(sb)), ['T1 Ana Diaz 1 $20 credit', 'T1 Dana Ruiz 1 $20 credit', 'T1 Ray Diaz 1 $20 credit']);
        tap(sb, 'lb-skins-basis-net');
        assert.deepEqual(chips(panel(sb), 'Gross or net').map((c) => c.on), [false, true]);
        assert.deepEqual(most(panel(sb)), ['T1 Ana Diaz 1 $20 credit', 'T1 Dana Ruiz 1 $20 credit']);
    });
    test('B4 games by flight with shared amounts: each game\'s value a skin; a flight shows only its own game, no whole-field sentence', () => {
        const games = { m: { name: 'Men', flights: { fA: true }, basis: 'both', share: 1000, createdAt: 1 }, l: { name: 'Ladies', flights: { fB: true }, basis: 'gross', share: 200, createdAt: 2 } };
        const sb = open(ev({ skins: { value: 'share', games } }));
        assert.deepEqual(most(panel(sb)), ['T1 Ana Diaz 1 $125 credit', 'T1 Dana Ruiz 1 $100 credit', 'T1 Ray Diaz 1 $100 credit']);
        tap(sb, 'lb-skins-flight-0');
        const html = panel(sb);
        assert.deepEqual(most(html), ['1 Ana Diaz 1 $125 credit']);
        assert.match(text(html), /A Flight golfers' skins\./);
        assert.doesNotMatch(text(html), /whole field/, 'a flight game is not the whole field');
        // The Ladies game (B Flight only) has nothing for A Flight: not its ties either.
        assert.deepEqual(holesBtn(html), { text: 'Hole by hole › 1 won · 17 tied', open: false });
        tap(sb, 'lb-skins-holes');
        const list = holesList(panel(sb));
        assert.match(list, /^9 4 Ana Diaz par 5 \$125 credit Tied · no skin: holes 1–8, 10–18 Skins total 1 hole won · 1 skin \$125 pro shop credit$/);
    });
});

describe('C. Hole by hole ›', () => {
    test('C1 a tap opens the hole rows for the filter; a second tap closes them', () => {
        const sb = open(ev({ perSkin: 20 }));
        tap(sb, 'lb-skins-holes');
        let html = panel(sb);
        assert.equal(holesBtn(html).open, true);
        const list = holesList(html);
        assert.match(list, /^4 3 Ray Diaz par 4 \$20 credit 9 4 Ana Diaz par 5 \$20 credit 15 2 Dana Ruiz par 3 \$20 credit Tied · no skin: holes 1–3, 5–8, 10–14, 16–18/);
        assert.doesNotMatch(list, /Olympic|Mia Chen/, 'Cascade only');
        tap(sb, 'lb-skins-holes');
        html = panel(sb);
        assert.equal(holesBtn(html).open, false);
        assert.equal(holesList(html), null);
    });
    test('C2 open, it follows the filters: Olympic, then B Flight (B golfers\' rows, the field\'s ties)', () => {
        const sb = open(ev({ perSkin: 20 }));
        tap(sb, 'lb-skins-holes');
        tap(sb, 'lb-skins-round-1');
        assert.match(holesList(panel(sb)), /^3 3 Mia Chen par 4 \$20 credit 11 3 Sam Ortiz par 5 \$20 credit 16 3 Joe Fox par 4 \$20 credit/);
        tap(sb, 'lb-skins-round-0');
        tap(sb, 'lb-skins-flight-1');
        const list = holesList(panel(sb));
        assert.match(list, /^4 3 Ray Diaz par 4 \$20 credit 15 2 Dana Ruiz par 3 \$20 credit Tied · no skin: holes 1–3, 5–8, 10–14, 16–18/);
        assert.doesNotMatch(list, /Ana Diaz/);
    });
    test('C3 the filters and the open list are the viewer\'s own: nothing is written', () => {
        const sb = open(ev({ perSkin: 20 }), F.OWNER);
        const before = sb.__dbWrites.length;
        ['lb-skins-holes', 'lb-skins-round-1', 'lb-skins-flight-0', 'lb-skins-holes'].forEach((id) => tap(sb, id));
        assert.ok(most(panel(sb)).length > 0, 'positive: the taps rendered the table');
        assert.equal(sb.__dbWrites.length, before);
    });
});

describe('D. what is not there', () => {
    test('D1 no amount: no amount column, no "$", the skins still counted', () => {
        const rows = most(panel(open(ev())));
        assert.deepEqual(rows, ['T1 Ana Diaz 1', 'T1 Dana Ruiz 1', 'T1 Ray Diaz 1']);
        assert.doesNotMatch(panel(open(ev())).split('id="lb-skins-most"')[1].split('id="lb-skins-holes"')[0], /pz-amt|\$/);
    });
    test('D2 a one-round event: no Round filter; the flights and Most skins still show', () => {
        const html = panel(open(F.oneDay({ createdAt: NEW, prizeSettings: { perSkin: 20 } })));
        assert.equal(chips(html, 'Round'), null);
        assert.ok(chips(html, 'Flight').length === 3, 'positive: the flight chips are there');
        assert.deepEqual(most(html), ['1 Ana Diaz 1 $20 credit']);
    });
    test('D3 no betting words on the tab, every filter open', () => {
        const sb = open(withHc(ev({ perSkin: 20, skins: { games: BOTH } })));
        tap(sb, 'lb-skins-holes'); tap(sb, 'lb-skins-basis-net'); tap(sb, 'lb-skins-flight-1');
        const t = text(panel(sb));
        assert.match(t, /Most skins/, 'positive: the tab rendered');
        assert.doesNotMatch(t, /\b(bet|bets|pot|pool|wager)\b|cash/i);
    });
});
