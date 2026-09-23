// ============================================================================
// FLIGHTS ON THE LEADERBOARD. (Flights, Wave 2, Step 6, 2026-09-13.)
//
// leaderboard.html now:
//   - reads the live skins ledger's `flights` (one card per flight; the top
//     level is null when flighted and rendered NOTHING before this step)
//   - swaps the two-position group-view toggle for a pill row on a flighted
//     round: By Group / By Flight / All Players when the round also has more
//     than one group, By Flight / All Players otherwise. A flightless round
//     keeps exactly today's toggle and never shows the pills.
//   - By Flight: the group cards' treatment (banner + card per section), sliced
//     by TAG, ranked within the section; an empty flight is an empty card
//   - All Players: an A/B badge on every row. By Flight: the card header says
//     it and the rows do not repeat it. By Group: no badge.
//   - ONE row builder for the flat board, the group cards and the flight cards.
//
// THE HEADLINE: flights_absent_golden_test.js's four rendered boards still pass
// untouched, byte for byte, through the refactored renderers.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);

// The Step 3 split round (two foursomes = two group boundaries).
const P = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101, ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
function scoresFor(players) {
    const s = {};
    players.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { if (players[idx]) s[`p${players[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 1); birdie(0, 2); birdie(1, 3); birdie(4, 2); birdie(5, 5); birdie(6, 7); birdie(7, 9); birdie(4, 11);
    birdie(2, 13); birdie(3, 13); birdie(6, 13);
    return s;
}
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } };
const round = (players, flights, extra) => Object.assign({ players, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross',
    skinsCarryOver: false, courseData: CD, scores: scoresFor(players), settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' },
    flights === undefined ? {} : { flights }, extra || {});

// Interleaved tags, so a slice by roster position and a slice by tag differ.
const MIXED = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101, ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']);

function page(data, mode, chosen) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = data;
    vm.runInContext(`currentMode = 'LB1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';`
        + (mode ? ` groupViewMode = '${mode}'; groupViewChosen = ${chosen === false ? 'false' : 'true'};` : '')
        + ` document.__mount(document.getElementById('live-skins-mount')); renderBoard();`, sb);
    const id = (x) => sb.document.getElementById(x);
    return {
        sb,
        board: String(id('board-content').innerHTML || ''),
        skins: String(id('live-skins-mount').innerHTML || ''),
        // v202: the two-position toggle and the pill row became ONE segmented
        // control (#view-pills, .bc-view). The retired toggle's own wrapper is gone;
        // its ids (label-group-view / label-all-view) and checkbox are kept hidden
        // and in step, and WHICH segments show is the control's real answer now.
        pills: id('view-pills').style.display,
        pillAll: id('pill-all-view').style.display,
        pillGroup: id('pill-group-view').style.display,
        pillFlight: id('pill-flight-view').style.display,
        mode: vm.runInContext('groupViewMode', sb),
        active: ['group', 'flight', 'all'].filter(m => id('pill-' + m + '-view').classList.contains('active'))
    };
}
const namesIn = (html) => (html.match(/<td class="player-name">([A-Z][a-z]+)/g) || []).map(m => m.replace('<td class="player-name">', ''));

describe('6.1 THE LIVE SKINS BOARD ON A FLIGHTED ROUND', () => {
    test('renders one LIVE SKINS card per flight; hole 13 is not listed under A (a no-carry tie) and is Gus under B', () => {
        const r = page(round(P, ON));
        assert.equal((r.skins.match(/LIVE SKINS \u2014 FLIGHT [AB]/g) || []).length, 2);
        const a = r.skins.slice(r.skins.indexOf('FLIGHT A'), r.skins.indexOf('FLIGHT B'));
        const b = r.skins.slice(r.skins.indexOf('FLIGHT B'));
        // v137 (card skins): a no-carry tie pays nobody and is not a row.
        assert.ok(!/Hole 13 \u2014/.test(a), 'a tied hole is not listed under A');
        assert.ok(!/No Skin/.test(a));
        assert.match(b, /Hole 13 \u2014 Gus \u00B7 Gross \d+/);
        assert.match(a, /Ann 2 \u00B7 Ben 1/);
    });
    test('a flightless round renders exactly one card with no flight heading', () => {
        const r = page(round(P));
        assert.equal((r.skins.match(/LIVE SKINS/g) || []).length, 1);
        assert.ok(!/FLIGHT [AB]/.test(r.skins));
    });
    test('a flight of zero renders "Nobody in this flight" for B rather than vanishing', () => {
        const allA = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'A', 'A', 'A']);
        const r = page(round(allA, ON));
        assert.match(r.skins, /FLIGHT B[\s\S]*Nobody in this flight/);
        assert.match(r.skins, /FLIGHT A[\s\S]*Ann 2/);
    });
});

describe('6.2 THE CONTROL', () => {
    test('NO FLIGHTS, two groups: the control offers All and Groups, never Flights (v202: one segmented control)', () => {
        const r = page(round(P));
        assert.equal(r.pills, 'flex');
        assert.equal(r.pillAll, ''); assert.equal(r.pillGroup, ''); assert.equal(r.pillFlight, 'none');
        // v202: the two-position toggle's markup is gone; its ids live on, hidden
        // and in step (board_header_trim_test.js pins that), and the control the
        // golfer sees is the one segmented row.
        assert.match(read('leaderboard.html'), /<div class="bc-view" id="view-pills">/);
        assert.match(read('leaderboard.html'), /id="label-group-view"/);
    });
    test('FLIGHTS, two groups: all three segments show; the default is By Flight (a small field - v202 opens a field over twelve flat)', () => {
        const r = page(round(P, ON), null);
        assert.equal(r.pills, 'flex');
        assert.equal(r.pillAll, ''); assert.equal(r.pillFlight, '');
        assert.equal(r.pillGroup, '');
        assert.equal(r.mode, 'flight');
        assert.deepEqual(r.active, ['flight']);
    });
    test('FLIGHTS, one group: By Group is hidden - a two-way pill row; a stale "group" mode resolves to By Flight', () => {
        const four = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'B', 'A', 'B']);
        const r = page(round(four, ON), 'group', true);
        assert.equal(r.pills, 'flex');
        assert.equal(r.pillGroup, 'none');
        assert.equal(r.mode, 'flight');
    });
    test('a golfer\'s choice is kept: All Players stays All Players on the next render', () => {
        const r = page(round(P, ON), 'all', true);
        assert.equal(r.mode, 'all');
        assert.deepEqual(r.active, ['all']);
    });
});

describe('6.2 / 6.3 THE SECTIONS AND THE BADGES', () => {
    test('BY FLIGHT slices by TAG: interleaved tags land in the right cards, ranked within the card, no badge on the rows', () => {
        const r = page(round(MIXED, ON), 'flight', true);
        assert.match(r.board, /Leading the Field/);
        const a = r.board.slice(r.board.indexOf('Flight A'), r.board.indexOf('Flight B'));
        const b = r.board.slice(r.board.indexOf('Flight B'));
        assert.deepEqual(namesIn(a).sort(), ['Ann', 'Cal', 'Eli', 'Gus'], 'A is the odd roster positions - by tag, not by position');
        assert.deepEqual(namesIn(b).sort(), ['Ben', 'Dee', 'Fay', 'Hal']);
        // Ranks from 1 WITHIN the card - "1" or, since the positions wave, "T1" when
        // the card's leaders are tied (this MIXED round ties at the top of a flight).
        assert.ok(/<td style="width:30px;">T?1<\/td>/.test(a) && /<td style="width:30px;">T?1<\/td>/.test(b), 'each card ranks from 1');
        assert.ok(!/player-flight/.test(r.board), 'no badge in By Flight - the card header carries it');
        assert.equal((r.board.match(/Group \d/g) || []).length, 0, 'no group cards in this mode');
    });
    test('ALL PLAYERS: every golfer visible, each row badged with their flight', () => {
        const r = page(round(MIXED, ON), 'all', true);
        assert.equal(namesIn(r.board).length, 8);
        const badges = r.board.match(/<span class="player-flight">([AB])<\/span>/g) || [];
        assert.equal(badges.length, 8, 'one badge per row');
        assert.match(r.board, /Ann<span class="player-flight">A<\/span>/);
        assert.match(r.board, /Ben<span class="player-flight">B<\/span>/);
    });
    test('BY GROUP on a flighted round: the foursome cards, no badge (the group is not the flight)', () => {
        const r = page(round(MIXED, ON), 'group', true);
        assert.equal((r.board.match(/Group \d/g) || []).length, 2);
        assert.ok(!/player-flight/.test(r.board));
    });
    test('a flight of ZERO renders an empty Flight B card, not a vanished one', () => {
        const allA = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'A', 'A', 'A']);
        const r = page(round(allA, ON), 'flight', true);
        assert.match(r.board, /Flight B/);
        assert.match(r.board, /Nobody in this flight\./);
        assert.equal(namesIn(r.board).length, 4);
    });
    test('a flightless round has no badge anywhere, in either mode', () => {
        assert.ok(!/player-flight/.test(page(round(P), 'all', true).board));
        assert.ok(!/player-flight/.test(page(round(P), 'group', true).board));
    });
    test('ONE row builder: the flat board, the group cards and the flight cards all go through boardRowHtml', () => {
        const src = read('leaderboard.html');
        assert.equal((src.match(/function boardRowHtml\(/g) || []).length, 1);
        ['renderFlatBoard', 'boardSectionHtml'].forEach(fn => {
            const body = src.slice(src.indexOf('function ' + fn + '('), src.indexOf('\n    function ', src.indexOf('function ' + fn + '(') + 30));
            assert.match(body, /boardRowHtml\(/, fn + ' must use the one row builder');
            assert.ok(!/<td class="player-name">/.test(body), fn + ' must not write a row itself');
        });
        ['renderGroupedBoard', 'renderFlightedBoard'].forEach(fn => {
            const body = src.slice(src.indexOf('function ' + fn + '('), src.indexOf('\n    function ', src.indexOf('function ' + fn + '(') + 30));
            assert.match(body, /boardSectionHtml\(/, fn + ' must use the one section card');
        });
    });
});
