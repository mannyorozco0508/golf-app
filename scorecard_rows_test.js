// ============================================================================
// THE SCORECARD ROWS LIVE ONCE - scorecard-rows.js
//
// settlement.html's Full Scorecard and, next, the leaderboard's tap-a-name card
// draw the same rows: HOLE / PAR / HCP across the top, then per golfer a gross
// row (birdie and eagle rings from score-marks.js) and, when net matters on
// the round, a net row from getStrokes/parseHcp. A second copy of that inside
// leaderboard.html is exactly what "two entry points means one builder" refuses,
// so the rows moved to a shared file with one caller today and two tomorrow.
//
// THE PROOF THE RECEIPT DID NOT MOVE. scorecard_rows_prev.fixture.json holds
// #receipt-scorecard's innerHTML, BYTE FOR BYTE, for eleven rounds captured at
// 8d2eabf (v162) before the file existed: two real Weekly Game rounds, a
// 2v2 with and without a blank hole, the 12-golfer pool round finished and at
// nine, a round where net matters, a front-nine-only and a back-nine-only
// course, a course missing a stroke index, and a round nobody has started.
// Today's settlement.html must render every one identically. That is stronger
// than the four stripped-text baselines (receipt_final_prev, results_scope_prev,
// weekly_game_prev, tie_shares_prev) and the v151 PDF-lines fixture, which
// still run and still pass.
//
// THE BUILDER EMITS CELLS; THE CALLER CHOOSES THE LAYOUT. scorecardCells()
// returns the numbers and classes per hole, split front / back with OUT / IN /
// TOT; scorecardRowsHtml() lays them out as the Receipt's single line of 18.
// The board will lay the same cells out as two stacked nines.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { rounds, CD } = require('./helpers/scorecard-rounds.js');

const FIXTURE = 'scorecard_rows_prev.fixture.json';
const FIXTURE_SHA = '12ea4c88';
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);

const PREV = JSON.parse(read(FIXTURE));
const R = rounds();

function receiptHtml(d) {
    const sb = loadHtmlInlineScript('settlement.html', []);
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)}; renderReceiptScorecard();`, sb);
    return sb.document.getElementById('receipt-scorecard').innerHTML;
}

describe('THE RECEIPT RENDERS BYTE FOR BYTE WHAT IT RENDERED AT 8d2eabf', () => {
    test('the fixture is the one captured at 8d2eabf, with content', () => {
        assert.equal(sha8(FIXTURE), FIXTURE_SHA);
        assert.equal(Object.keys(PREV.html).length, 11);
        assert.ok(PREV.html.caledonia.length > 10000 && (PREV.html.caledonia.match(/rt-net/g) || []).length === 12, 'captured with net rows');
        assert.ok((PREV.html.net.match(/mark-(birdie|eagle)/g) || []).length === 18, 'captured with rings');
        assert.ok(PREV.html.frontOnly.includes('OUT') === false || !PREV.html.frontOnly.includes('>IN<'), 'the nine-only capture has no IN column');
    });
    Object.keys(R).forEach(k => {
        test(`${k}: identical`, () => {
            assert.equal(receiptHtml(R[k]), PREV.html[k]);
        });
    });
});

describe('THE SHARED FILE, and settlement.html as its caller', () => {
    const src = read('settlement.html');
    test('scorecard-rows.js exists at the repo root, exports both a browser global and a module, and is in every shell list', () => {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scorecard-rows.js')));
        const mod = require('./scorecard-rows.js');
        assert.equal(typeof mod.scorecardCells, 'function');
        assert.equal(typeof mod.scorecardRowsHtml, 'function');
        assert.match(read('scorecard-rows.js'), /window\.ScorecardRows = /, 'the browser global');
        assert.match(read('sw.js'), /'\.\/scorecard-rows\.js'/, 'sw.js SHELL_FILES');
        assert.match(read('sync-mobile-web.js'), /'scorecard-rows\.js'/, 'sync-mobile-web.js SHARED_SHELL');
    });
    test('settlement.html loads it after score-marks.js and text-safe.js, and buildReceiptScorecard calls it', () => {
        const tags = [...src.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
        const i = tags.indexOf('scorecard-rows.js');
        assert.ok(i > tags.indexOf('score-marks.js') && i > tags.indexOf('text-safe.js') && i > tags.indexOf('money-engine.js'),
            'scorecard-rows.js must load after the files whose globals it reads: ' + JSON.stringify(tags));
        const fn = src.slice(src.indexOf('function buildReceiptScorecard'), src.indexOf('function buildReceiptBlock'));
        assert.ok(fn.length > 1000 && fn.includes('Full Scorecard'), 'the function slice is the real one');
        assert.match(fn, /ScorecardRows\.scorecardRowsHtml\(\{/, 'the Receipt asks the shared builder for its rows');
        // The row loop is gone from the page. Positive assertions beside the negatives.
        assert.ok(!/players\.forEach\(p => \{/.test(fn), 'the per-golfer row loop must not live in settlement.html any more');
        assert.ok(!/rt-net/.test(fn.replace(/\/\/[^\n]*/g, '')), 'the net row markup must not live in settlement.html any more');
        assert.match(fn, /netMatters/, 'the caller still decides whether net matters');
        assert.match(fn, /receipt-card-scroll/, 'the caller keeps its scroll wrapper and chrome');
    });
});

describe('THE BUILDER - cells for any layout', () => {
    // The canonical strokes, installed as globals the way a page has them
    // (money-engine.js exports nothing under Node).
    const { loadJsFile } = require('./helpers/load-script.js');
    const me = loadJsFile('money-engine.js', ['handicap.js']);
    global.getStrokes = me.getStrokes; global.parseHcp = me.parseHcp;
    const { scorecardCells, scorecardRowsHtml } = require('./scorecard-rows.js');
    const ringOf = (s, p) => (s !== null && s - p <= -2) ? 'mark-eagle' : (s !== null && s - p === -1 ? 'mark-birdie' : '');
    const d = R.net;
    const cells = scorecardCells({ courseData: d.courseData, scores: d.scores, players: d.players, showNet: true, ringOf });

    test('front and back are nine holes each, sorted, with OUT / IN / TOT on every row', () => {
        assert.deepEqual(cells.front.map(h => h.hole), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.deepEqual(cells.back.map(h => h.hole), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
        assert.equal(cells.header.par.out, CD.filter(h => h.hole <= 9).reduce((s, h) => s + h.par, 0));
        assert.equal(cells.header.par.tot, cells.header.par.out + cells.header.par.in);
        assert.deepEqual(cells.header.hole.front, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.deepEqual(cells.header.hcp.front, CD.slice(0, 9).map(h => h.hcpIndex));
        assert.equal(cells.golfers.length, 4);
    });
    test('a golfer\'s gross cells carry the score and the ring class; sums are numbers, unscored is null', () => {
        const ann = cells.golfers[0];
        assert.equal(ann.id, 101); assert.equal(ann.name, 'Ann A');
        assert.equal(ann.gross.front.length, 9);
        const h4 = ann.gross.front[3];   // hole 4: (0 + 4) % 4 === 0 -> birdie
        assert.equal(h4.value, CD[3].par - 1); assert.equal(h4.cls, 'mark-birdie');
        assert.equal(typeof ann.gross.out, 'number');
        assert.equal(ann.gross.tot, ann.gross.out + ann.gross.in);
    });
    test('net cells subtract the canonical strokes; showNet false yields no net', () => {
        const ben = cells.golfers[1];   // hcp 9 -> one stroke on indexes 1-9
        assert.ok(ben.net, 'net present when asked');
        const strokedHole = ben.net.front.find((c, i) => CD[i].hcpIndex <= 9);
        const idx = ben.net.front.indexOf(strokedHole);
        assert.equal(strokedHole.value, ben.gross.front[idx].value - 1);
        const noNet = scorecardCells({ courseData: d.courseData, scores: d.scores, players: d.players, showNet: false, ringOf });
        assert.equal(noNet.golfers[1].net, null);
    });
    test('one golfer: the same cells for a players list of one - what the board will ask for', () => {
        const one = scorecardCells({ courseData: d.courseData, scores: d.scores, players: [d.players[2]], showNet: true, ringOf });
        assert.equal(one.golfers.length, 1);
        assert.deepEqual(one.golfers[0].gross, cells.golfers[2].gross);
        assert.deepEqual(one.header, cells.header);
    });
    test('an unscored hole is null, its ring empty; an unstarted golfer sums to 0', () => {
        const nb = scorecardCells({ courseData: R.nobodyStarted.courseData, scores: {}, players: R.nobodyStarted.players, showNet: false, ringOf });
        assert.equal(nb.golfers[0].gross.front[0].value, null);
        assert.equal(nb.golfers[0].gross.front[0].cls, '');
        assert.equal(nb.golfers[0].gross.tot, 0);
    });
    test('a nine-hole course has an empty back and no OUT/IN; the one-line layout then prints a single TOT', () => {
        const f = scorecardCells({ courseData: R.frontOnly.courseData, scores: R.frontOnly.scores, players: R.frontOnly.players, showNet: false, ringOf });
        assert.equal(f.back.length, 0); assert.equal(f.hasBack, false); assert.equal(f.hasFront, true);
        const html = scorecardRowsHtml({ courseData: R.frontOnly.courseData, scores: R.frontOnly.scores, players: R.frontOnly.players, showNet: false, ringOf });
        assert.ok(!/>OUT</.test(html) && !/>IN</.test(html) && /TOT/.test(html));
    });
    test('the name is escaped in the one-line layout, never interpolated raw', () => {
        const html = scorecardRowsHtml({ courseData: d.courseData, scores: d.scores, players: [{ id: 101, name: 'Ben <B>', hcp: '0' }], showNet: false, ringOf });
        assert.ok(html.includes('Ben &lt;B&gt;') && !html.includes('Ben <B>'));
    });
    test('the stacked layout (wave 2): two tables, front with OUT, back with IN and TOT, 11 and 12 cells per row; a nine-hole course is one table with TOT', () => {
        const { scorecardStackedHtml } = require('./scorecard-rows.js');
        const html = scorecardStackedHtml({ courseData: d.courseData, scores: d.scores, players: [d.players[1]], showNet: true, ringOf });
        assert.match(html, /^<div class="sc-stack"><table class="receipt-table sc-nine sc-front">/);
        assert.equal((html.match(/<table/g) || []).length, 2);
        const [front, back] = html.split('<table').slice(1);
        assert.equal((front.split('<tr')[1].match(/<th/g) || []).length, 11, 'front: label + 9 + OUT');
        assert.equal((back.split('<tr')[1].match(/<th/g) || []).length, 12, 'back: label + 9 + IN + TOT');
        assert.match(front, /<th class="rt-sec">OUT<\/th><\/tr>/); assert.ok(!/>IN</.test(front) && !/>TOT</.test(front));
        assert.match(back, /<th class="rt-sec">IN<\/th><th class="rt-sec">TOT<\/th><\/tr>/);
        assert.equal((html.match(/<tr class="rt-net">/g) || []).length, 2, 'one net row per nine');
        assert.ok(!/player-name/.test(html));
        // The label is the FIRST name (the full name is on the board row above);
        // a one-word name is the name; escaping still applies.
        assert.equal((html.match(/<td class="rt-name">Ben<\/td>/g) || []).length, 2, 'the golfer\'s row is labelled "Ben" in each nine');
        assert.ok(!/rt-name">Ben B</.test(html), 'not the full name');
        const oneWord = scorecardStackedHtml({ courseData: d.courseData, scores: d.scores, players: [{ id: 101, name: 'Marty', hcp: '0' }], showNet: false, ringOf });
        assert.equal((oneWord.match(/<td class="rt-name">Marty<\/td>/g) || []).length, 2);
        const tagged = scorecardStackedHtml({ courseData: d.courseData, scores: d.scores, players: [{ id: 101, name: '<b>Bo</b> Bravo', hcp: '0' }], showNet: false, ringOf });
        assert.ok(tagged.includes('<td class="rt-name">&lt;b&gt;Bo&lt;/b&gt;</td>') && !tagged.includes('<td class="rt-name"><b>'));
        // The same numbers as the one-line layout (18 gross + OUT/IN/TOT, 18 net +
        // OUT/IN/TOT), only the line breaks differ - so the same multiset;
        // board_card_test.js compares the front-9 + OUT + back-9 + IN + TOT
        // sequence cell for cell against the Receipt's row.
        const one = scorecardRowsHtml({ courseData: d.courseData, scores: d.scores, players: [d.players[1]], showNet: true, ringOf });
        const nums = h => [...h.matchAll(/<td(?: class="[^"]*")?>([^<]*)<\/td>/g)].map(m => m[1]);
        const stackedNums = nums(html), lineNums = nums(one);
        assert.equal(stackedNums.length, lineNums.length + 2, 'the stacked layout repeats the two label cells (name, net) once for the second nine: 2 extra cells, no extra number');
        const first = d.players[1].name.split(' ')[0];
        assert.deepEqual(stackedNums.filter(x => x !== 'net' && x !== first).sort(), lineNums.filter(x => x !== 'net' && x !== d.players[1].name).sort());
        const nine = scorecardStackedHtml({ courseData: R.frontOnly.courseData, scores: R.frontOnly.scores, players: R.frontOnly.players, showNet: false, ringOf });
        assert.equal((nine.match(/<table/g) || []).length, 1);
        assert.ok(/<th class="rt-sec">TOT<\/th>/.test(nine) && !/>OUT</.test(nine) && !/>IN</.test(nine));
    });

    test('netMattersOn: the Receipt\'s rule - handicaps AND a net pool, net skins or stableford; not a gross pool, not no handicaps', () => {
        const { netMattersOn } = require('./scorecard-rows.js');
        assert.equal(netMattersOn(R.net), true, 'handicaps + net pool');
        assert.equal(netMattersOn(R.twoVtwo), false, 'no handicaps, no pool');
        assert.equal(netMattersOn(R.pool), true, 'the 12-golfer pool round: hcp 9 and a net pool');
        assert.equal(netMattersOn(Object.assign({}, R.net, { moneyPool: { enabled: true, buyIn: 20, net: { amount: 0 }, skins: { mode: 'remainder', scoring: 'gross' } } })), false, 'gross skins only');
        assert.equal(netMattersOn(Object.assign({}, R.net, { moneyPool: undefined, gameFormat: 'stableford' })), true, 'stableford with handicaps');
        assert.equal(netMattersOn(Object.assign({}, R.net, { players: R.net.players.map(p => Object.assign({}, p, { hcp: '0' })) })), false, 'a net pool with nobody carrying a handicap');
    });

    test('the one-line layout is the Receipt\'s: HOLE, PAR, HCP head rows then gross (and net) rows in receipt-table classes', () => {
        const html = scorecardRowsHtml({ courseData: d.courseData, scores: d.scores, players: d.players, showNet: true, ringOf });
        assert.match(html, /^<tr><th class="rt-name">HOLE<\/th>/);
        assert.equal((html.match(/<tr class="rt-net">/g) || []).length, 4);
        assert.equal((html.match(/<td class="rt-name">/g) || []).length, 8, 'four gross rows and four net rows carry a name cell');
    });
});
