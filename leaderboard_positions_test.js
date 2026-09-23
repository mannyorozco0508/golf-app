// ============================================================================
// LEADERBOARD POSITIONS: TIES SHARE A PLACE AND CONSUME THE PLACES THEY SPAN
//
// WHY THE LEADERBOARD DIFFERED from settlement.html's LIVE RESULTS and the
// Receipt (read before anything was changed): all three rank on the same
// value (computeNetToParStandings' sortVal, to-par on the chosen basis), and
// the engine already hands every row a positionLabel - "1", "T2", "T2", "4" -
// computed field-wide with the tie rule. settlement.html prints that label.
// leaderboard.html did not: boardRowHtml printed ITS OWN INDEX (`idx + 1`)
// over a list it re-sorted itself (boardSort: not-started last, then sortVal,
// roster order among ties). So it rendered 1, 2, 3, 4 straight down a tie. It
// rendered its own index; it did not rank on a different value.
//
// THE FIX: the label comes from the engine. The flat board uses the field-wide
// positionLabel each row already carries; a By Flight or By Group card is
// ranked WITHIN the card, so it asks the same engine for the card's golfers
// and reads their labels - one rule, one implementation, three surfaces.
// Row ORDER is unchanged (boardSort), which is what keeps the rendered-board
// golden byte-identical on a round with no ties.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Eight golfers, hcp 0, all through 18 at par except: Ann -2, Ben -1, Cal -1,
// Dee E, Eli E, Fay E, Gus +1, Hal not started. Net == gross (hcp 0), so the
// field reads 1, T2, T2, T4, T4, T4, 7, -.
const P = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101,
    ['A', 'A', 'B', 'B', 'A', 'B', 'A', 'B']);
const SCORES = (() => {
    const s = {};
    P.slice(0, 7).forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const adj = (i, h, d) => { s[`p${P[i].id}_h${h}`] = CD[h - 1].par + d; };
    adj(0, 1, -1); adj(0, 2, -1); adj(1, 3, -1); adj(2, 4, -1); adj(6, 5, +1);
    return s;
})();
const round = (extra) => Object.assign({ players: P, gameFormat: 'stroke', courseData: CD, scores: SCORES }, extra || {});

function page(data, mode) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = data;
    vm.runInContext(`currentMode = 'POS1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';`
        + (mode ? ` groupViewMode = '${mode}'; groupViewChosen = true;` : '')
        + ` document.__mount(document.getElementById('live-skins-mount')); renderBoard();`, sb);
    // RE-PINNED 2026-09-16 (tap a name): rows carry data-player-id now; the
    // fixture is untouched and compared with that one attribute stripped.
    const raw = String(sb.document.getElementById('board-content').innerHTML || '');
    return raw.replace(/ data-player-id="[^"]*"/g, '');
}
// [ [pos, name], ... ] in rendered order, per table.
const rows = (html) => [...html.matchAll(/<td(?: style="width:30px;")?>([^<]*)<\/td>\s*<td class="player-name">([A-Z][a-z]+)/g)].map(m => [m[1], m[2]]);
const cards = (html) => html.split('<div style="margin-top:18px;').slice(1);

describe('THE FLAT BOARD reads the engine\'s label', () => {
    test('1, T2, T2, T4, T4, T4, 7, and - for a golfer not started', () => {
        const got = rows(page(round(), 'all'));   // eight golfers default to By Group; the flat board is All Players
        assert.deepEqual(got, [['1', 'Ann'], ['T2', 'Ben'], ['T2', 'Cal'], ['T4', 'Dee'], ['T4', 'Eli'], ['T4', 'Fay'], ['7', 'Gus'], ['-', 'Hal']]);
    });
    test('the engine says the same thing, which is the point', () => {
        const E = loadJsFile('money-engine.js', ['handicap.js']);
        const st = E.computeNetToParStandings(P, CD, SCORES, { basis: 'net' });
        assert.deepEqual(JSON.parse(JSON.stringify(st.map(r => r.positionLabel))), ['1', 'T2', 'T2', 'T4', 'T4', 'T4', '7', '—']);
    });
    test('gross basis: the same ties (hcp 0), labelled the same', () => {
        const sb = loadHtmlInlineScript('leaderboard.html');
        sb.__d = round();
        vm.runInContext(`currentMode = 'POS1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'gross'; groupViewMode = 'all'; groupViewChosen = true; document.__mount(document.getElementById('live-skins-mount')); renderBoard();`, sb);
        assert.deepEqual(rows(String(sb.document.getElementById('board-content').innerHTML)).map(r => r[0]), ['1', 'T2', 'T2', 'T4', 'T4', 'T4', '7', '-']);
    });
});

describe('BY FLIGHT: ranked within the card, ties within the card', () => {
    test('Flight A (Ann -2, Ben -1, Eli E, Gus +1) reads 1, 2, 3, 4; Flight B (Cal -1, Dee E, Fay E, Hal -) reads 1, T2, T2, -', () => {
        const html = page(round({ flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }), 'flight');
        const [a, b] = cards(html);
        assert.deepEqual(rows(a), [['1', 'Ann'], ['2', 'Ben'], ['3', 'Eli'], ['4', 'Gus']]);
        assert.deepEqual(rows(b), [['1', 'Cal'], ['T2', 'Dee'], ['T2', 'Fay'], ['-', 'Hal']]);
    });
});

describe('BY GROUP: ranked within the card, ties within the card', () => {
    test('Group 1 (Ann, Ben, Cal, Dee) reads 1, T2, T2, 4; Group 2 (Eli, Fay, Gus, Hal) reads T1, T1, 3, -', () => {
        const html = page(round({ groupSizeOverrides: { 0: 4, 1: 4 } }), 'group');
        const [g1, g2] = cards(html);
        assert.deepEqual(rows(g1), [['1', 'Ann'], ['T2', 'Ben'], ['T2', 'Cal'], ['4', 'Dee']]);
        assert.deepEqual(rows(g2), [['T1', 'Eli'], ['T1', 'Fay'], ['3', 'Gus'], ['-', 'Hal']]);
    });
    test('All Players on a flighted round: the field-wide labels, with badges', () => {
        const html = page(round({ flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }), 'all');
        assert.deepEqual(rows(html).map(r => r[0]), ['1', 'T2', 'T2', 'T4', 'T4', 'T4', '7', '-']);
        assert.equal((html.match(/player-flight/g) || []).length, 7 + 1);
    });
});

// THE TIED ROUND, FROZEN. The rendered-board golden (flights_absent_golden)
// holds a round with no ties and must not move; these three boards are the
// rows it "gains" for a round with them - pinned by sha, the HTML in the
// fixture beside this file so a diff is readable.
const FIXTURE = path.join(__dirname, 'leaderboard_positions_golden.fixture.json');
describe('THE TIED-ROUND BOARDS, byte for byte', () => {
    const boards = {
        flat: page(round(), 'all'),
        flight: page(round({ flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }), 'flight'),
        group: page(round({ groupSizeOverrides: { 0: 4, 1: 4 } }), 'group')
    };
    if (process.env.LEADERBOARD_POSITIONS_GOLDEN_WRITE === '1') {
        fs.writeFileSync(FIXTURE, JSON.stringify({ capturedAt: new Date().toISOString(), boards, sha256: Object.fromEntries(Object.keys(boards).map(k => [k, sha(boards[k])])) }, null, 2) + '\n');
    }
    const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    // v201 (the board polish): the frozen HTML through this wave's edits IS today's
    // HTML - helpers/board-polish-v201.js names each one and throws if it finds
    // nothing. What this golden is FOR is the tie labels, and they are asserted
    // unchanged below the byte comparison: the transform touches the header row,
    // the HCP span, the Thru cell and the badge, never a position or a total.
    // Every golfer here is scratch (hcp 0) and the round has no skins game, so the
    // blank-handicap and badge edits do not apply - declared, not skipped.
    const { boardV201 } = require('./helpers/board-polish-v201.js');
    Object.keys(boards).forEach(k => {
        test(k + ' board: the frozen HTML through the v201 edits, with every position unchanged', () => {
            // seven of the eight are thru 18 here, so the "F" edit DOES apply (the
            // eighth has not teed off and keeps its 0) - no declaration, and the
            // transform throws if it finds none.
            const want = boardV201(FX.boards[k], { holes: CD.length });
            assert.equal(sha(boards[k]), sha(want), 'the board moved by more than this wave\'s edits');
            assert.equal(boards[k], want);
            assert.equal(sha(FX.boards[k]), FX.sha256[k], 'and the frozen capture is untouched');
            assert.match(FX.boards[k], /T2/, 'the frozen board carries a tie');
            // THE NUMBERS: every position label and every total in the frozen board
            // is in today's board, in the same order.
            const cells = h => [...h.matchAll(/<td[^>]*>(T?\d+|-|E|F|[+-]\d+)<\/td>/g)].map(m => m[1]);
            const beforeCells = cells(FX.boards[k]).filter(x => x !== '17' && x !== '18');
            const afterCells = cells(boards[k]).filter(x => x !== '17' && x !== '18' && x !== 'F');
            assert.deepEqual(afterCells, beforeCells, 'positions and totals, cell for cell');
        });
    });
});

describe('THE SEAM (source)', () => {
    test('boardRowHtml prints the label it is handed, never its own index; the sections ask the engine', () => {
        const src = read('leaderboard.html');
        const row = src.slice(src.indexOf('function boardRowHtml('), src.indexOf('function boardSectionHtml('));
        assert.ok(!/\$\{idx \+ 1\}/.test(row), 'no self-made position');
        assert.match(row, /\$\{opts && opts\.label !== undefined \? opts\.label : /, 'the label comes in through opts');
        assert.match(src, /function boardPositionLabels\(/);
        assert.match(src.slice(src.indexOf('function boardPositionLabels(')), /computeNetToParStandings\(/);
        const section = src.slice(src.indexOf('function boardSectionHtml('), src.indexOf('function fieldLeaderBannerHtml('));
        assert.match(section, /boardPositionLabels\(/);
        const flat = src.slice(src.indexOf('function renderFlatBoard('), src.indexOf('function renderFlightedBoard('));
        assert.match(flat, /boardPositionLabels\(/);
    });
});
