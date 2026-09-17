// ============================================================================
// TAP A NAME ON THE LEADERBOARD, SEE THEIR CARD - the builder half
//
// Tapping a golfer's name on the live board opens their scorecard beneath
// their row; tapping again closes it. The card is a second <tr class=
// "board-card-row"> emitted BESIDE boardRowHtml by the two table loops, never
// inside the row builder, with no player-name cell in it. Its rows come from
// scorecard-rows.js as two stacked nines. Open ids live in a Set and are
// re-emitted at every render, because the board re-renders on every snapshot.
//
// WHAT MINI-DOM CAN AND CANNOT DO HERE. innerHTML is a string, so no cell can
// be tapped and no row can be found in a tree; the delegated listener on
// #board-content is exercised in Chrome by tools/board-card-check.js. What
// this file drives is everything behind the tap: the page's own snapshot
// handler renders the board, toggleBoardCard(id) - the function the listener
// calls with the id it read off the row - flips the set, and the rendered
// string is read back. The card's numbers are compared with the Receipt's for
// the same golfer on the same round, and with scorecard-rows.js's own cells.
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
const NAMES = ['Ann A', 'Ben B', 'Cal C', 'Dee D', 'Eli E', 'Fay F', 'Gus G', 'Hal H'];

// Eight golfers, two foursomes, handicaps and a NET pool - so net matters on
// the Receipt's terms - Hal has not started, Gus has played nine.
function round(overrides) {
    const players = makePlayers(NAMES, [0, 4, 9, 12, 2, 6, 18, 0], 101);
    const scores = {};
    players.forEach((p, i) => CD.forEach(h => {
        if (i === 7) return;                       // Hal: no scores
        if (i === 6 && h.hole > 9) return;         // Gus: thru 9
        scores['p' + p.id + '_h' + h.hole] = h.par + ((i + h.hole) % 4 === 0 ? -1 : (h.hole % 7 === 0 ? 1 : 0)) + ((i === 2 && h.hole === 5) ? -2 : 0);
    }));
    return Object.assign({
        eventName: 'Card Round', players, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        groupSizeOverrides: { 0: 4, 1: 4 },
        moneyPool: { enabled: true, buyIn: 20, net: { amount: 60, places: [100] }, kp: { amount: 0, holes: [] }, skins: { mode: 'none' } }
    }, overrides || {});
}
// The page's own arrival: ?game=CARD1, the value handler fed a snapshot.
function arrive(data, opts) {
    const sb = loadHtmlInlineScript('leaderboard.html', [], { search: '?game=CARD1' + ((opts && opts.group) ? '&group=' + opts.group : '') });
    snapshot(sb, data);
    if (opts && opts.view) vm.runInContext(`groupViewMode = '${opts.view}'; renderBoard();`, sb);
    if (opts && opts.scoring) vm.runInContext(`activeScoring = '${opts.scoring}'; renderBoard();`, sb);
    return sb;
}
function snapshot(sb, data) {
    const hs = sb.__dbHandlers.filter(h => h.event === 'value' && /events\/CARD1$/.test(h.path));
    assert.ok(hs.length >= 1, 'the page registered no value handler for events/CARD1');
    hs.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true }));
}
const board = sb => String(sb.document.getElementById('board-content').innerHTML || '');
const tap = (sb, id) => vm.runInContext(`toggleBoardCard('${id}')`, sb);
const cardsIn = html => [...html.matchAll(/<tr class="board-card-row" data-card-for="([^"]+)">/g)].map(m => m[1]);
// The card row must directly follow its golfer's row.
function cardFollowsRow(html, id) {
    const row = html.indexOf(`data-player-id="${id}"`);
    const card = html.indexOf(`<tr class="board-card-row" data-card-for="${id}">`);
    if (row < 0 || card < 0) return false;
    const between = html.slice(row, card);
    return (between.match(/<tr/g) || []).length === 0;   // no other row starts in between
}
// The card row for one golfer, from its <tr> to the end of its cell.
function cardOf(html, id) {
    const start = html.indexOf(`<tr class="board-card-row" data-card-for="${id}">`);
    assert.ok(start >= 0, 'no card row for ' + id);
    const end = html.indexOf('</div></td></tr>', start);
    assert.ok(end > start, 'the card row does not close');
    return html.slice(start, end + '</div></td></tr>'.length);
}
// Numbers out of a stacked card: [[front 9 gross], [back 9 gross]] for the golfer row(s).
function grossOf(cardHtml) {
    const tables = cardHtml.split('<table').slice(1);
    return tables.map(t => {
        const rows = t.split('<tr').slice(1);
        const golferRow = rows.find(r => /^><td class="rt-name">/.test(r));
        return [...golferRow.matchAll(/<td(?: class="[^"]*")?>([^<]*)<\/td>/g)].map(m => m[1]).slice(1);   // drop the name cell
    });
}

describe('THE CARD OPENS, CLOSES, AND FOLLOWS ITS GOLFER', () => {
    test('nothing is open on arrival, and the rows carry data-player-id', () => {
        const sb = arrive(round());
        const html = board(sb);
        assert.deepEqual(cardsIn(html), []);
        assert.equal((html.match(/data-player-id="/g) || []).length, 8, 'eight golfer rows, eight ids');
        assert.ok(html.includes('data-player-id="103"'));
    });
    test('toggling Cal opens exactly Cal\'s card, directly beneath Cal\'s row; toggling again closes it', () => {
        const sb = arrive(round());
        tap(sb, 103);
        let html = board(sb);
        assert.deepEqual(cardsIn(html), ['103']);
        assert.ok(cardFollowsRow(html, '103'), 'the card must be the next row after Cal');
        tap(sb, 103);
        assert.deepEqual(cardsIn(board(sb)), []);
    });
    test('several can be open at once, and closing one leaves the other', () => {
        const sb = arrive(round());
        tap(sb, 101); tap(sb, 104);
        assert.deepEqual(cardsIn(board(sb)).sort(), ['101', '104']);
        tap(sb, 101);
        assert.deepEqual(cardsIn(board(sb)), ['104']);
    });
    test('the card SURVIVES the next snapshot: open it, deliver a new score, still open, with the new score in it', () => {
        const sb = arrive(round());
        tap(sb, 102);
        assert.deepEqual(cardsIn(board(sb)), ['102']);
        const next = round(); next.scores.p102_h18 = 2;   // Ben eagles the last
        snapshot(sb, next);
        const html = board(sb);
        assert.deepEqual(cardsIn(html), ['102'], 'a re-render must re-emit the open card from the set');
        assert.ok(cardFollowsRow(html, '102'));
        const card = cardOf(html, '102');
        assert.match(card, /<td class="mark-eagle">2<\/td>/, 'the card shows the score that just landed');
    });
});

describe('THE CARD IS THE GOLFER\'S OWN SCORES, THE SAME NUMBERS THE RECEIPT PRINTS', () => {
    test('Cal\'s card: two stacked nines, 1-9 + OUT then 10-18 + IN + TOT, his scores, no player-name cell', () => {
        const d = round();
        const sb = arrive(d);
        tap(sb, 103);
        const html = board(sb);
        const card = cardOf(html, '103');
        assert.ok(!/player-name/.test(card), 'no player-name cell inside the card row');
        assert.match(card, /<td colspan="5">/);
        assert.equal((card.match(/<table class="receipt-table sc-nine/g) || []).length, 2, 'two nines');
        assert.match(card, /<table class="receipt-table sc-nine sc-front">[\s\S]*?<th class="rt-sec">OUT<\/th>/);
        assert.match(card, /<table class="receipt-table sc-nine sc-back">[\s\S]*?<th class="rt-sec">IN<\/th><th class="rt-sec">TOT<\/th>/);
        const [front, back] = grossOf(card);
        const expectFront = CD.slice(0, 9).map(h => String(d.scores['p103_h' + h.hole]));
        const expectBack = CD.slice(9).map(h => String(d.scores['p103_h' + h.hole]));
        assert.deepEqual(front.slice(0, 9), expectFront);
        assert.deepEqual(back.slice(0, 9), expectBack);
        const out = CD.slice(0, 9).reduce((s, h) => s + d.scores['p103_h' + h.hole], 0);
        const inn = CD.slice(9).reduce((s, h) => s + d.scores['p103_h' + h.hole], 0);
        assert.deepEqual([front[9], back[9], back[10]], [String(out), String(inn), String(out + inn)]);
        assert.match(card, /<td class="mark-eagle">2<\/td>/, 'Cal\'s 2 on the par-4 5th wears the eagle ring');
    });
    test('net rows on the Receipt\'s terms: a net pool with handicaps -> a net row per nine; the same round without the pool -> none', () => {
        const withPool = arrive(round()); tap(withPool, 103);
        assert.equal((board(withPool).match(/<tr class="rt-net">/g) || []).length, 2, 'one net row in each nine');
        const noPool = arrive(round({ moneyPool: { enabled: false } })); tap(noPool, 103);
        assert.equal((board(noPool).match(/<tr class="rt-net">/g) || []).length, 0);
    });
    test('the board\'s Net/Gross toggle does not change the card - the card is the round\'s record', () => {
        const gross = arrive(round(), { scoring: 'gross' }); tap(gross, 103);
        const net = arrive(round(), { scoring: 'net' }); tap(net, 103);
        assert.equal(cardOf(board(gross), '103'), cardOf(board(net), '103'));
    });
    test('the card equals scorecard-rows.js\'s stacked layout for that golfer, and its numbers equal the Receipt\'s one-line row', () => {
        const d = round();
        const sb = arrive(d); tap(sb, 102);
        const html = board(sb);
        const row = cardOf(html, '102');
        const card = row.slice(row.indexOf('<td colspan="5">') + '<td colspan="5">'.length, row.length - '</td></tr>'.length);
        const expected = vm.runInContext(`ScorecardRows.scorecardStackedHtml({ courseData: currentBoardData.courseData, scores: currentBoardData.scores, players: [currentBoardData.players[1]], showNet: true, ringOf: (s, p) => scoreMarkClass(s, p).trim() })`, sb);
        assert.equal(card, expected, 'the page draws no cell of its own - the card IS the shared layout');
        // The Receipt, same round, Ben's row: the same 18 numbers in one line.
        const st = loadHtmlInlineScript('settlement.html', []);
        vm.runInContext(`currentMode='CARD1'; currentData=${JSON.stringify(d)}; renderReceiptScorecard();`, st);
        const receipt = st.document.getElementById('receipt-scorecard').innerHTML;
        const benRow = receipt.slice(receipt.indexOf('<td class="rt-name">Ben B</td>'), receipt.indexOf('</tr>', receipt.indexOf('<td class="rt-name">Ben B</td>')));
        const receiptNums = [...benRow.matchAll(/<td(?: class="[^"]*")?>([^<]*)<\/td>/g)].map(m => m[1]).slice(1);
        const [front, back] = grossOf(card);
        assert.deepEqual(front.concat(back), receiptNums, 'front 9 + OUT + back 9 + IN + TOT, cell for cell');
    });
});

describe('ALL THREE VIEWS, AND THE EDGES', () => {
    ['all', 'group', 'flight'].forEach(view => {
        test(`${view}: Dee's card opens beneath Dee's row`, () => {
            const d = view === 'flight' ? round({ flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }) : round();
            if (view === 'flight') d.players.forEach((p, i) => { p.flight = i < 4 ? 'A' : 'B'; });
            const sb = arrive(d, { view });
            tap(sb, 104);
            const html = board(sb);
            assert.deepEqual(cardsIn(html), ['104'], view);
            assert.ok(cardFollowsRow(html, '104'), view + ': the card must directly follow the row');
        });
    });
    test('a golfer with no scores: the card opens, every hole a dash, sums a dash, no ring', () => {
        const sb = arrive(round()); tap(sb, 108);
        const html = board(sb);
        assert.deepEqual(cardsIn(html), ['108']);
        const card = cardOf(html, '108');
        const [front, back] = grossOf(card);
        assert.ok(front.slice(0, 9).every(v => v === '–') && back.slice(0, 9).every(v => v === '–'));
        assert.deepEqual([front[9], back[9], back[10]], ['–', '–', '–']);
        assert.ok(!/mark-(birdie|eagle)/.test(card));
    });
    test('a round nobody has started: rows carry ids, a card still opens', () => {
        const sb = arrive(round({ scores: {} })); tap(sb, 101);
        assert.deepEqual(cardsIn(board(sb)), ['101']);
    });
    test('a golfer thru nine: the back nine is dashes and IN is a dash, TOT is the front total', () => {
        const d = round(); const sb = arrive(d); tap(sb, 107);
        const html = board(sb); const card = cardOf(html, '107');
        const [front, back] = grossOf(card);
        assert.ok(back.slice(0, 9).every(v => v === '–'));
        assert.equal(back[9], '–');
        assert.equal(back[10], front[9], 'TOT equals OUT when only the front is played');
    });
    test('a group link (?group=2) still opens a card for a golfer in group 1 - a score is not a wager', () => {
        const sb = arrive(round(), { group: '2' }); tap(sb, 101);
        assert.deepEqual(cardsIn(board(sb)), ['101']);
    });
});

describe('THE SHAPE, held in source', () => {
    const src = read('leaderboard.html');
    test('the card is emitted beside boardRowHtml in both loops, never inside it', () => {
        const rowFn = src.slice(src.indexOf('function boardRowHtml('), src.indexOf('\n    function ', src.indexOf('function boardRowHtml(') + 30));
        assert.ok(!/boardCardRowHtml|board-card-row|scorecardStackedHtml/.test(rowFn), 'the row builder must not know about the card');
        assert.match(rowFn, /data-player-id=/, 'the row carries the id');
        ['renderFlatBoard', 'boardSectionHtml'].forEach(fn => {
            const body = src.slice(src.indexOf('function ' + fn + '('), src.indexOf('\n    function ', src.indexOf('function ' + fn + '(') + 30));
            assert.match(body, /boardRowHtml\(/, fn + ' uses the row builder');
            assert.match(body, /html \+= boardCardRowHtml\(r\.id\);/, fn + ' emits the card beside the row');
        });
    });
    test('the page draws no cell: the card comes from ScorecardRows.scorecardStackedHtml and net from netMattersOn', () => {
        const script = src.slice(src.indexOf('<script>'), src.lastIndexOf('</script>')).replace(/\/\/[^\n]*/g, '');
        assert.match(script, /ScorecardRows\.scorecardStackedHtml\(\{/);
        assert.match(script, /showNet: ScorecardRows\.netMattersOn\(data\)/);
        assert.ok(!/<th class="rt-name">/.test(script), 'no header cell drawn on the page');
        assert.ok(!/rt-sec/.test(script.replace(/\.sc-stack[^\n]*/g, '')), 'no section cell drawn on the page');
    });
    test('score-marks.js and scorecard-rows.js are loaded, after money-engine.js and action-model.js', () => {
        const tags = [...src.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
        ['score-marks.js', 'scorecard-rows.js'].forEach(f => assert.ok(tags.indexOf(f) > tags.indexOf('action-model.js') && tags.indexOf(f) > tags.indexOf('money-engine.js'), f));
    });
    test('one delegated listener on #board-content, toggling by the row\'s data-player-id', () => {
        const script = src.slice(src.indexOf('<script>'), src.lastIndexOf('</script>'));
        assert.equal((script.match(/getElementById\('board-content'\)[\s\S]{0,120}addEventListener\('click'/g) || []).length, 1);
        assert.match(script, /getAttribute\('data-player-id'\)/);
        assert.ok(!/onclick="toggleBoardCard/.test(src), 'no per-row inline handler');
    });
    test('the open set is never cleared by a render, so a snapshot cannot close a card', () => {
        const script = src.slice(src.indexOf('<script>'), src.lastIndexOf('</script>')).replace(/\/\/[^\n]*/g, '');
        assert.match(script, /const openCards = new Set\(\);/);
        assert.ok(!/openCards\.clear\(\)/.test(script), 'nothing empties the set');
        assert.ok(!/openCards = new Set/.test(script.replace('const openCards = new Set();', '')), 'nothing replaces the set');
    });
});
