// ============================================================================
// GOLDEN: A ROUND WITH NO FLIGHTS, ON EVERY SURFACE FLIGHTS WILL TOUCH.
// (Flights, Wave 2, Step 1 - written before any flights code, 2026-09-13.)
//
// Wave 2 adds round.flights and player.flight. The contract is that a round
// with NO flights key - and a round with flights: { enabled: false } - renders
// and settles BYTE-IDENTICALLY to today. This file is what "today" means: one
// round, captured from the engine and from leaderboard.html's own renderer at
// 7d24422, frozen in flights_absent_golden.fixture.json and asserted here on:
//
//   computeSkinsPayoutLines + computeSkinsSettlementNet   (odd-dollar, flagged)
//   calculateBirdieGameTotalsForSettle
//   computeNetToParStandings, net AND gross
//   computeSkinsHoleLedger rows (official / tie / waiting)
//   computeCombinedNetTotals netByName, contributions, transactions
//   bet-strip skinsStatus text
//   THE RENDERED leaderboard board - flat and grouped, net and gross - as
//   the HTML string renderBoard() writes into #board-content, in the page's
//   own realm
//
// THE ROUND is built so every surface has something to say: eight golfers
// (two foursomes, so the grouped board differs from the flat one), a $8 split
// buy-in ($4/$4 each, pots $32/$32), five gross skins (32/5 leaves a remainder
// of 2 -> 7,7,6,6,6) and six net skins (32/6 -> 6,6,5,5,5,5) decided by
// handicaps, birdies to five golfers at $2, and hole 18 unposted so the ledger
// carries a waiting row and the standings say Thru 17.
//
// Every number is a literal in the fixture; the important ones are ALSO
// asserted in plain sight below so a reader can see what moved. The rendered
// boards are compared whole (and by sha256) - a golden for a renderer that
// only checked a few substrings would let a column go missing.
//
// Do not "fix" this golden to match a new engine or a new renderer. A golden
// that moves on a flightless round is the finding.
//
// RE-PINNED 2026-09-13, the leaderboard positions fix, the two GROSS boards
// only - read first, then written. This round has no ties on NET (the two net
// boards are untouched, sha for sha) but on GROSS five golfers sit on 67 and
// two on 68, and the board printed 1, 2, 3, 4, 5, 6, 7, 8 down them. It now
// prints the engine's label: gross_all 1, T2 x5, T7 x2; gross_group card 1
// reads 1, T2, T2, T2 and card 2 reads T1, T1, T3, T3. Row order, names, HCPs,
// scores and to-par are byte-identical; only the position cells moved.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'flights_absent_golden.fixture.json'), 'utf8'));
const CD = makeCourseData(18);

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f =>
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f }));
    return sb;
})();

// ---------------------------------------------------------------------------
// THE ROUND. Everyone scores par on holes 1-17; hole 18 is unposted. A birdie
// (par - 1) is also an outright gross skin. Handicaps decide the net skins:
// Eli (20) takes four of them without a birdie.
// ---------------------------------------------------------------------------
const PLAYERS = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [2, 9, 15, 4, 20, 7, 11, 0]);
const SCORES = (() => {
    const s = {};
    PLAYERS.forEach(p => CD.slice(0, 17).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { s[`p${PLAYERS[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 2); birdie(0, 9); birdie(1, 5); birdie(2, 14); birdie(6, 11);   // Ann x2, Ben, Cal, Gus
    birdie(3, 13); birdie(7, 13);                                            // Dee and Hal tie hole 13 gross
    return s;
})();
const ROUND_KEYS = ['players', 'gameFormat', 'skinsBuyIn', 'skinsPotFormat', 'skinsCarryOver', 'birdieGameEnabled',
    'birdieUnitVal', 'birdieScoringType', 'courseData', 'scores', 'settlementMode', 'skinsRounding'];
function round() {
    return { players: PLAYERS, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false,
        birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross',
        courseData: CD, scores: SCORES, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
}
const VARIANTS = [
    ['flights ABSENT', () => round()],
    ['flights: { enabled: false } PRESENT', () => Object.assign(round(), { flights: { enabled: false } })]
];

// RE-PINNED 2026-09-16 (tap a name, see their card): every golfer row now
// carries data-player-id="<id>" so the card can find its golfer by identity,
// never by row index. The fixture is untouched; today's board is compared
// with that one attribute stripped, so ONLY the attribute moved and every
// byte of text, class and order is still held. A card is never open at
// render unless tapped, so no card row is in these boards.
const PID = / data-player-id="[^"]*"/g;
function renderBoard(data, scoring, mode) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = data;
    vm.runInContext(`currentMode = 'GOLD'; currentBoardData = __d; activeView = 'individual'; `
        + `activeScoring = '${scoring}'; groupViewMode = '${mode}'; renderBoard();`, sb);
    const raw = String(sb.document.getElementById('board-content').innerHTML || '');
    if (!PID.test(raw)) throw new Error('the board rows carry no data-player-id - the tap-a-name attribute is gone');
    PID.lastIndex = 0;
    return raw.replace(PID, '');
}
// Where two long strings first differ, with context - so a failure names the
// cell, not just the hash.
function firstDiff(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return `first difference at char ${i}:\n  expected ...${b.slice(Math.max(0, i - 60), i + 80)}...\n  actual   ...${a.slice(Math.max(0, i - 60), i + 80)}...`;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------
describe('1.1 THE FIXTURE HELPER', () => {
    test('makePlayers without a flight argument yields EXACTLY the six keys it always had', () => {
        PLAYERS.forEach(p => assert.deepEqual(Object.keys(p).sort(), ['hcp', 'id', 'name', 'playingForMoney', 'squad', 'team']));
        assert.deepEqual(PLAYERS.map(p => p.id), [101, 102, 103, 104, 105, 106, 107, 108]);
    });
    test('makePlayers WITH flights adds `flight` only where given, and nothing else', () => {
        const p = makePlayers(['A', 'B', 'C'], [0, 0, 0], 101, ['A', 'B']);
        assert.deepEqual(p.map(x => x.flight), ['A', 'B', undefined]);
        assert.deepEqual(Object.keys(p[0]).sort(), ['flight', 'hcp', 'id', 'name', 'playingForMoney', 'squad', 'team']);
        assert.deepEqual(Object.keys(p[2]).sort(), ['hcp', 'id', 'name', 'playingForMoney', 'squad', 'team']);
    });
    test('the round carries exactly the frozen keys (a flights key sneaking in by default would fail here)', () => {
        assert.deepEqual(Object.keys(round()), ROUND_KEYS);
        assert.deepEqual(Object.keys(VARIANTS[1][1]()), ROUND_KEYS.concat(['flights']));
    });
    test('the fixture file is the one captured at 7d24422', () => {
        assert.equal(FIX.capturedAt, '2026-09-13 at 7d24422');
        assert.deepEqual(Object.keys(FIX.boards).sort(), ['gross_all', 'gross_group', 'net_all', 'net_group']);
        Object.keys(FIX.boards).forEach(k => assert.equal(sha(FIX.boards[k]), FIX.boardSha256[k], k + ': the fixture HTML and its recorded hash disagree'));
    });
});

// ---------------------------------------------------------------------------
VARIANTS.forEach(([title, build]) => {
    describe('GOLDEN, ' + title, () => {
        const data = build();
        const E = FIX.engine;

        test('skins: five gross skins 7,7,6,6,6 and six net skins 6,6,5,5,5,5 over $32 halves; the per-golfer nets', () => {
            const L = J(ENG.computeSkinsPayoutLines(data, CD, SCORES));
            assert.deepEqual(L, E.lines);
            assert.deepEqual(L.gross.lines.map(l => [l.hole, l.playerName, l.value]), [[2, 'Ann', 7], [5, 'Ben', 7], [9, 'Ann', 6], [11, 'Gus', 6], [14, 'Cal', 6]]);
            assert.deepEqual(L.net.lines.map(l => [l.hole, l.playerName, l.value]), [[3, 'Eli', 6], [4, 'Eli', 6], [5, 'Ben', 5], [12, 'Eli', 5], [14, 'Cal', 5], [16, 'Eli', 5]]);
            assert.equal(L.gross.pot, 32); assert.equal(L.net.pot, 32);
            const net = J(ENG.computeSkinsSettlementNet(data, CD, SCORES));
            assert.deepEqual(net, E.skinsNet);
            assert.deepEqual(net, { 101: 5, 102: 4, 103: 3, 104: -8, 105: 14, 106: -8, 107: -2, 108: -8 });
        });

        test('birdies: seven birdies at $2, every other golfer pays - Ann +18, Eli and Fay -14', () => {
            const b = J(ENG.calculateBirdieGameTotalsForSettle(data, CD, SCORES));
            assert.deepEqual(b, E.birdies);
            assert.deepEqual(b, { 101: 18, 102: 2, 103: 2, 104: 2, 105: -14, 106: -14, 107: 2, 108: 2 });
            assert.equal(Object.values(b).reduce((x, y) => x + y, 0), 0);
        });

        test('standings, NET: Eli leads at -19 thru 17; GROSS: Ann leads at -2, five tied 2nd', () => {
            const n = J(ENG.computeNetToParStandings(PLAYERS, CD, SCORES, { basis: 'net' }));
            const g = J(ENG.computeNetToParStandings(PLAYERS, CD, SCORES, { basis: 'gross' }));
            assert.deepEqual(n, E.standingsNet);
            assert.deepEqual(g, E.standingsGross);
            assert.deepEqual(n.map(r => [r.name, r.toPar, r.positionLabel]),
                [['Eli', -19, '1'], ['Cal', -15, '2'], ['Gus', -12, '3'], ['Ben', -10, '4'], ['Fay', -7, '5'], ['Dee', -5, '6'], ['Ann', -4, '7'], ['Hal', -1, '8']]);
            assert.deepEqual(g.map(r => [r.name, r.toPar, r.positionLabel]),
                [['Ann', -2, '1'], ['Ben', -1, 'T2'], ['Cal', -1, 'T2'], ['Dee', -1, 'T2'], ['Gus', -1, 'T2'], ['Hal', -1, 'T2'], ['Eli', 0, 'T7'], ['Fay', 0, 'T7']]);
            n.forEach(r => assert.equal(r.thru, 17));
        });

        test('the hole ledger: official through 17, one waiting row (hole 18), the skins where they are', () => {
            const HL = ENG.computeSkinsHoleLedger(data, CD, SCORES);
            const rows = (h) => J(h.holes.map(r => [r.hole, r.state, r.official, r.winner ? r.winner.name : null, r.unitsWon]));
            assert.deepEqual({ gross: rows(HL.gross), grossThru: HL.gross.officialThru, net: rows(HL.net), netThru: HL.net.officialThru }, E.ledger);
            assert.equal(HL.gross.officialThru, 17);
            assert.deepEqual(rows(HL.gross).find(r => r[0] === 18), [18, 'waiting', false, null, null]);
            assert.deepEqual(rows(HL.gross).filter(r => r[1] === 'skin').map(r => r[0]), [2, 5, 9, 11, 14]);
            assert.equal(rows(HL.gross).filter(r => r[1] === 'tie').length, 12, 'hole 13 ties gross (Dee and Hal both birdie) plus eleven pars');
        });

        test('the combined ledger: netByName, every contributions line, Who Pays Who', () => {
            const c = ENG.computeCombinedNetTotals(data, CD, SCORES);
            assert.deepEqual(J(c.netByName), E.netByName);
            assert.deepEqual(J(c.contributions), E.contributions);
            assert.deepEqual(J(c.transactions), E.transactions);
            assert.deepEqual(J(c.netByName).ann, { name: 'Ann', net: 23 });
            assert.deepEqual(J(c.netByName).fay, { name: 'Fay', net: -22 });
            assert.deepEqual(J(c.contributions).eli.lines, [{ label: 'Skins', amount: 14 }, { label: 'Birdie Pool', amount: -14 }]);
            assert.deepEqual(J(c.transactions)[0], { from: 'Fay', to: 'Ann', amount: 22 });
            assert.equal(Object.values(J(c.netByName)).reduce((a, r) => a + r.net, 0), 0);
        });

        test('the strip text: "Eli 4 \u00B7 Ann 2"', () => {
            const st = J(ENG.skinsStatus(data, CD, SCORES, ENG.fieldParticipants(data)));
            assert.deepEqual(st, E.status);
            assert.equal(st.text, 'Eli 4 \u00B7 Ann 2');
        });

        [['net', 'all'], ['net', 'group'], ['gross', 'all'], ['gross', 'group']].forEach(([scoring, mode]) => {
            test(`THE RENDERED BOARD, ${scoring} / ${mode === 'all' ? 'All Players (flat)' : 'By Group'}: byte-identical HTML`, () => {
                const html = renderBoard(data, scoring, mode);
                const key = scoring + '_' + mode;
                assert.ok(html.length > 3000, 'the board rendered something: ' + html.length + ' chars');
                assert.equal(sha(html), FIX.boardSha256[key], firstDiff(html, FIX.boards[key]));
                assert.equal(html, FIX.boards[key]);
            });
        });

        test('the rendered boards are not vacuous: eight names, ranks, HCPs, and two group cards in the grouped view', () => {
            const flat = renderBoard(data, 'net', 'all');
            const grouped = renderBoard(data, 'net', 'group');
            PLAYERS.forEach(p => { assert.ok(flat.includes(p.name)); assert.ok(grouped.includes(p.name)); });
            assert.ok(/<td>1<\/td>[\s\S]*Eli/.test(flat), 'Eli is ranked first on the net flat board');
            assert.ok(/HCP: 20/.test(flat));
            assert.equal((grouped.match(/Group \d/g) || []).length, 2, 'two foursome cards');
            assert.ok(/Leading the Field: Eli/.test(grouped));
            assert.notEqual(flat, grouped, 'the grouped board is a different rendering, not the flat one twice');
        });
    });
});
