// ============================================================================
// THE BOARD, POLISHED (v201, 2026-09-22) - leaderboard.html
//
// Six changes, each one a thing a golfer reads:
//   1. A BLANK HANDICAP SAYS NOTHING. "HCP: " with nothing after it read as a
//      bug, and "Net 41" beside a gross 41 read as a second bug - with no
//      handicap the net IS the gross. Both lines are omitted; with a handicap
//      the row says "HCP 6" and the score cell keeps its net line.
//   2. A FINISHED GOLFER READS "F" in the Thru column - the round's own hole
//      count, so a nine is finished at 9 - and every table carries a compact
//      header: Pos · Golfer · Score · To par · Thru.
//   3. THE SKINS BADGE: "🥩 2" beside a winner's name, from
//      L.countsByPlayerId - the same ledger the LIVE SKINS card and the
//      Receipt read (live-skins.js). NO NEW MATH; per flight when the round's
//      skins are flighted.
//   4. COMPACT ROWS: name and handicap on one line, left-aligned. MEASURED
//      59px -> 47px per row in Chrome at 390x844 (-20%), not half: the SCORE
//      cell still stacks gross over net for a golfer with a handicap, and that
//      is the floor. Still a >= 44px tap target.
//   5. THE WHOLE ROW toggles the card (it used to need the name cell, so a tap
//      on the score or on the little marker did nothing).
//   6. The expanded card's "HCP" header row is "SI" - it is the hole's stroke
//      index, not the golfer's handicap, and it sat directly under a row that
//      may show no handicap at all. scorecardStackedHtml only: the Receipt's
//      own layout (scorecardRowsHtml) keeps its wording.
//
// WHAT THE HARNESS CAN PROVE. mini-dom has no layout, so the ROW HEIGHT and
// the tap target are measured in Chrome (below), never here; the CSS is pinned
// as source. The whole-row toggle is driven by the page's own delegated
// listener, dispatching a click on a cell that is NOT the name cell.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);

// Eight golfers; Ann and Ben carry handicaps, Cal's is BLANK (the case), the
// rest are scratch. Ann finished; everyone else is thru 9 or fewer.
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const HCPS = ['6', '12', '', '0', '0', '0', '0', '0'];
function round(o) {
    const opt = o || {};
    const players = makePlayers(NAMES, HCPS, 101);
    players.forEach((p, i) => { p.hcp = HCPS[i]; });
    const scores = {};
    // Ann: all 18. Ben, Cal: 9. Dee: 4. The rest: nothing.
    const thru = opt.thru || { 0: 18, 1: 9, 2: 9, 3: 4 };
    Object.keys(thru).forEach(i => {
        for (let h = 1; h <= thru[i]; h++) scores['p' + players[i].id + '_h' + h] = CD[h - 1].par + (h % 3 === 0 ? -1 : 0);
    });
    return Object.assign({ players, gameFormat: 'stroke', courseData: CD, scores }, opt.extra || {});
}
// A skins round: the Main Pool's bucket, gross, the whole field.
const POOL = { moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 0, places: [] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } };

// The page's own render, driven as leaderboard_positions_test.js drives it:
// activeView 'individual', and groupViewMode/groupViewChosen for a sectioned board.
function page(data, mode) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = J(data);
    run(sb, "currentMode = 'BRD1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';"
        + (mode && mode !== 'all' ? " groupViewMode = '" + mode + "'; groupViewChosen = true;" : '')
        + " document.__mount(document.getElementById('live-skins-mount')); renderBoard();");
    return sb;
}
const board = sb => String(run(sb, "document.getElementById('board-content').innerHTML || ''"));
// one row per golfer: [pos, nameCellHtml, scoreCellHtml, toPar, thru]
function rows(html) {
    return [...html.matchAll(/<tr[^>]*data-player-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => {
        const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]);
        return { id: m[1], pos: cells[0], name: cells[1], score: cells[2], toPar: cells[3], thru: cells[4] };
    });
}
const byName = (html, n) => rows(html).find(r => new RegExp('>' + n + '<|^' + n).test(r.name) || r.name.indexOf(n) === 0);

describe('1. A BLANK HANDICAP SAYS NOTHING: no "HCP" line, no "Net" line', () => {
    const html = board(page(round()));
    test('Cal (no handicap): neither the HCP span nor the Net span; his gross still shows', () => {
        const cal = byName(html, 'Cal');
        assert.ok(cal, 'Cal is on the board');
        assert.ok(!/player-hcp/.test(cal.name), 'no HCP line: ' + cal.name);
        assert.ok(!/score-net/.test(cal.score), 'no Net line: ' + cal.score);
        assert.match(cal.score, /score-gross">\d+</, 'the gross is still there');
    });
    test('Ann (HCP 6) and Ben (HCP 12): "HCP 6" with no colon, and the Net line (CONTROL: the same board, the same builder)', () => {
        const ann = byName(html, 'Ann'), ben = byName(html, 'Ben');
        assert.match(ann.name, /<span class="player-hcp">HCP 6<\/span>/);
        assert.match(ben.name, /<span class="player-hcp">HCP 12<\/span>/);
        assert.match(ann.score, /<span class="score-net">Net \d+<\/span>/);
        assert.ok(!/HCP:/.test(html), 'the old "HCP:" wording is gone from the whole board');
    });
    test('a whitespace handicap counts as blank; "0" does not', () => {
        const d = round(); d.players[2].hcp = '   '; d.players[3].hcp = '0';
        const h = board(page(d));
        assert.ok(!/player-hcp/.test(byName(h, 'Cal').name));
        assert.match(byName(h, 'Dee').name, /player-hcp">HCP 0</, 'a scratch golfer has a handicap and it is 0');
    });
    test('a golfer who has not teed off still renders (his row carries neither line either)', () => {
        const fay = byName(html, 'Fay');
        assert.ok(fay, 'Fay is listed');
        assert.equal(fay.thru, '0'); assert.equal(fay.pos, '-');
    });
});

describe('2. "F" WHEN FINISHED, and a header row on every table', () => {
    test('Ann, 18 of 18, reads F; Ben at 9 reads 9', () => {
        const html = board(page(round()));
        assert.equal(byName(html, 'Ann').thru, 'F');
        assert.equal(byName(html, 'Ben').thru, '9');
    });
    test('a NINE-hole round: finished at 9 reads F (the round\'s own hole count, never a hard 18)', () => {
        const nine = makeCourseData(9);
        const d = round({ thru: { 0: 9, 1: 5 } });
        d.courseData = nine;
        Object.keys(d.scores).forEach(k => { if (Number(k.split('_h')[1]) > 9) delete d.scores[k]; });
        const html = board(page(d));
        assert.equal(byName(html, 'Ann').thru, 'F');
        assert.equal(byName(html, 'Ben').thru, '5');
    });
    test('the compact header: Pos · Golfer · Score · To par · Thru, on the flat board AND on every section', () => {
        const HEAD = '<thead><tr><th>Pos</th><th style="text-align:left;">Golfer</th><th>Score</th><th>To par</th><th>Thru</th></tr></thead>';
        assert.ok(board(page(round())).includes(HEAD), 'the flat board');
        const g = board(page(round({ extra: { groupSizeOverrides: { 0: 4, 1: 4 } } }), 'group'));
        assert.equal((g.match(/<thead>/g) || []).length, 2, 'one per group section');
        assert.ok(g.includes(HEAD));
        const f = board(page(round({ extra: { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } } }), 'flight'));
        assert.ok(f.includes(HEAD));
        assert.ok(!/<th>Player<\/th>|To Par/.test(board(page(round()))), 'the old wording is gone');
    });
});

describe('3. THE SKINS BADGE, from the engine\'s own count', () => {
    test('a skins round: "🥩 N" beside each winner, and the number IS L.countsByPlayerId', () => {
        const d = round({ thru: { 0: 18, 1: 18, 2: 18, 3: 18, 4: 18, 5: 18, 6: 18, 7: 18 }, extra: POOL });
        // make three holes outright wins for three different golfers
        d.scores['p101_h1'] = 2; d.scores['p102_h2'] = 2; d.scores['p103_h5'] = 2;
        const sb = page(d);
        const html = board(sb);
        const counts = J(run(sb, 'skinsCountById'));
        assert.ok(Object.keys(counts).length >= 3, 'the ledger found winners: ' + JSON.stringify(counts));
        Object.keys(counts).forEach(id => {
            const row = rows(html).find(r => r.id === String(id));
            assert.match(row.name, new RegExp('<span class="skins-badge">🥩 ' + counts[id] + '</span>'), 'id ' + id);
        });
        // and nobody else carries one
        rows(html).filter(r => !counts[r.id]).forEach(r => assert.ok(!/skins-badge/.test(r.name), r.name));
        // the count is the ledger's, not this page's: the same numbers the LIVE SKINS card prints
        const ls = String(run(sb, "document.getElementById('live-skins-mount').innerHTML || ''"));
        Object.keys(counts).forEach(id => {
            const p = d.players.find(x => String(x.id) === String(id));
            assert.match(ls, new RegExp(p.name + ' ' + counts[id]), 'the card says the same for ' + p.name);
        });
    });
    test('a round with NO skins game: no badge anywhere (CONTROL)', () => {
        const sb = page(round({ thru: { 0: 18, 1: 18 } }));
        assert.ok(!/skins-badge/.test(board(sb)));
        assert.deepEqual(J(run(sb, 'skinsCountById')), {});
    });
    test('FLIGHTED skins: a golfer\'s badge is the skins won inside their own pot', () => {
        const d = round({ thru: { 0: 18, 1: 18, 2: 18, 3: 18, 4: 18, 5: 18, 6: 18, 7: 18 },
            extra: Object.assign({ flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }, POOL) });
        d.players.forEach((p, i) => { p.flight = i < 4 ? 'A' : 'B'; });
        d.scores['p101_h1'] = 2;   // Ann, flight A
        d.scores['p105_h2'] = 2;   // Eli, flight B
        const sb = page(d, 'flight');
        const counts = J(run(sb, 'skinsCountById'));
        assert.ok(counts['101'] >= 1 && counts['105'] >= 1, JSON.stringify(counts));
        const html = board(sb);
        assert.match(rows(html).find(r => r.id === '101').name, /skins-badge">🥩 \d+</);
        assert.match(rows(html).find(r => r.id === '105').name, /skins-badge">🥩 \d+</);
    });
    test('the badge reads the ledger and computes nothing (source)', () => {
        const src = read('leaderboard.html');
        const fn = src.slice(src.indexOf('function refreshSkinsCounts()'), src.indexOf('const skinsBadgeHtml'));
        assert.match(fn, /liveSkinsLedgerEntries\(/);
        assert.match(fn, /e\.L && e\.L\.countsByPlayerId/);
        assert.ok(!/computeSkinsHoleLedger\(|for \(|\.filter\(.*par|scores\[/.test(fn), 'no ledger of its own: ' + fn.slice(0, 160));
        assert.match(fn, /catch \(e\) \{ return; \}/, 'a badge never takes the board down');
    });
});

describe('4. + 5. COMPACT ROWS, and the WHOLE ROW opens the card', () => {
    test('the name and the handicap are on ONE line: .player-hcp is inline, not a block (source)', () => {
        const css = read('leaderboard.html');
        assert.match(css, /\.player-hcp \{[^}]*display: inline;/);
        assert.ok(!/\.player-hcp \{[^}]*display: block;/.test(css), 'the old stacked line is gone');
        assert.match(css, /\.board-table td \{ padding: 6px 8px; \}/, 'half the old 12px padding');
        assert.match(css, /\.board-table tr\[data-player-id\] td \{ height: 32px; \}/);
    });
    test('a tap on the SCORE cell opens that golfer\'s card (it used to need the name cell)', () => {
        const sb = page(round());
        const before = board(sb);
        assert.ok(!/board-card-row/.test(before), 'nothing open to start');
        // the page's own delegated listener, from a cell that is NOT .player-name
        const opened = run(sb, `(function () {
            const mount = document.getElementById('board-content');
            const tr = { tagName: 'TR', className: 'row-leader', getAttribute: n => (n === 'data-player-id' ? '101' : null), parentNode: mount };
            const td = { tagName: 'TD', className: 'score-cell', parentNode: tr };
            mount._listeners.click.forEach(fn => fn({ target: td }));
            return openCards.has('101');
        })()`);
        assert.equal(opened, true, 'the row toggled from the score cell');
        assert.match(board(sb), /board-card-row/);
    });
    test('a tap INSIDE an open card does not close it (reading is not toggling)', () => {
        const sb = page(round());
        run(sb, "openCards.add('101'); renderBoard();");
        const still = run(sb, `(function () {
            const mount = document.getElementById('board-content');
            const cardRow = { tagName: 'TR', className: 'board-card-row', getAttribute: () => null, parentNode: mount };
            const td = { tagName: 'TD', className: 'rt-name', parentNode: cardRow };
            mount._listeners.click.forEach(fn => fn({ target: td }));
            return openCards.has('101');
        })()`);
        assert.equal(still, true);
    });
    test('a row with no data-player-id (the match-play table) is not a golfer and nothing happens (CONTROL)', () => {
        const sb = page(round());
        const opened = run(sb, `(function () {
            const mount = document.getElementById('board-content');
            const tr = { tagName: 'TR', className: '', getAttribute: () => null, parentNode: mount };
            const td = { tagName: 'TD', className: 'player-name', parentNode: tr };
            mount._listeners.click.forEach(fn => fn({ target: td }));
            return openCards.size;
        })()`);
        assert.equal(opened, 0);
    });
    test('the listener finds the row by data-player-id, not by the name cell (source)', () => {
        const src = read('leaderboard.html');
        const fn = src.slice(src.indexOf('(function wireBoardCards()'), src.indexOf('// A SECTION CARD'));
        assert.ok(!/player-name/.test(fn), 'the name-cell requirement is gone');
        assert.match(fn, /board-card-row/, 'and an open card is excluded');
        assert.match(fn, /data-player-id/);
    });
});

describe('6. THE EXPANDED CARD SAYS "SI", not "HCP"', () => {
    test('the board\'s card header row reads SI and carries the hole stroke indexes', () => {
        const sb = page(round());
        run(sb, "openCards.add('101'); renderBoard();");
        const card = board(sb).slice(board(sb).indexOf('board-card-row'));
        assert.match(card, /<th class="rt-name">SI<\/th>/);
        assert.ok(!/<th class="rt-name">HCP<\/th>/.test(card), 'the misleading label is gone');
        assert.match(card, /<th class="rt-name">HOLE<\/th>/);
        assert.match(card, /<th class="rt-name">PAR<\/th>/);
    });
    test('the RECEIPT\'s own layout is untouched: scorecardRowsHtml still says HCP', () => {
        const src = read('scorecard-rows.js');
        const rowsFn = src.slice(src.indexOf('function scorecardRowsHtml('), src.indexOf('function scorecardStackedHtml('));
        assert.match(rowsFn, /headRow\('HCP'/, 'the Receipt keeps its wording');
        const stacked = src.slice(src.indexOf('function scorecardStackedHtml('));
        assert.match(stacked, /head\('SI'/);
        assert.ok(!/head\('HCP'/.test(stacked));
    });
});

describe('THE NUMBERS DID NOT MOVE', () => {
    test('positions, gross, net and to-par are the engine\'s, unchanged by any of this', () => {
        const d = round({ thru: { 0: 18, 1: 18, 2: 18, 3: 18 } });
        const sb = page(d);
        const eng = J(run(sb, "computeNetToParStandings(currentBoardData.players, currentBoardData.courseData, currentBoardData.scores, { basis: 'net' })"));
        const html = board(sb);
        eng.filter(r => r.started).forEach(r => {
            const row = rows(html).find(x => x.id === String(r.id));
            assert.match(row.score, new RegExp('score-gross">' + r.gross + '<'), r.name + ' gross');
            if (String(r.hcp || '').trim() !== '') assert.match(row.score, new RegExp('score-net">Net ' + r.net + '<'), r.name + ' net');
            const toPar = r.toPar === 0 ? 'E' : (r.toPar > 0 ? '\\+' + r.toPar : String(r.toPar));
            assert.match(row.toPar, new RegExp(toPar), r.name + ' to par');
        });
        const labels = J(run(sb, 'boardPositionLabels(computeNetToParStandings(currentBoardData.players, currentBoardData.courseData, currentBoardData.scores, { basis: "net" }))'));
        Object.keys(labels).forEach(id => {
            const row = rows(html).find(x => x.id === String(id));
            if (row && row.pos !== '-') assert.equal(row.pos, labels[id], 'position for ' + id);
        });
    });
});

// ---- COLD CHROME: a real tap on the row body, and how much fits on a phone ----
// No page function is called: the round arrives through the stand-in database and
// the page renders itself. Measured: a tap on the SCORE cell of row 3 opens that
// golfer's card; the row height and its tap target; how many rows of a 23-golfer
// round are inside a 390x844 viewport.
const BIG = (() => {
    const names = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lee', 'Max', 'Ned', 'Oli', 'Pat', 'Quy', 'Rae', 'Sal', 'Tom', 'Uma', 'Vic', 'Wes'];
    const players = makePlayers(names, names.map((_, i) => (i === 2 ? '' : String(i % 18))), 101);
    players.forEach((p, i) => { p.hcp = i === 2 ? '' : String(i % 18); });
    const scores = {};
    players.forEach((p, i) => { const thru = i === 0 ? 18 : 9; for (let h = 1; h <= thru; h++) scores['p' + p.id + '_h' + h] = CD[h - 1].par; });
    // three OUTRIGHT wins, so the ledger has skins to count - everyone on par
    // ties every hole and the badge would be vacuously absent.
    scores['p101_h1'] = 2; scores['p102_h2'] = 2; scores['p103_h5'] = 2;
    return Object.assign({ players, gameFormat: 'stroke', courseData: CD, scores, ownerUid: 'anon-cold' }, POOL);
})();
const DB = { events: { BRD1: BIG }, global_courses: {}, trips: {}, tournaments: {} };
// SCROLLED TO THE LIST, the way a golfer reads it: the page's own furniture
// above the table (nav, title, the Net/Gross toggles, the leader banner) is
// ~600px on a 390-wide phone, so "how many rows fit" is a question about the
// LIST, not about the top of the document. The rows are scrolled into view
// first and then counted; the height of one row is what this wave changed.
const PROBE = `(() => {
    const rows = Array.from(document.querySelectorAll('#board-content tr[data-player-id]'));
    rows[0].scrollIntoView(true);
    const r = rows[2];
    const box = r.getBoundingClientRect();
    const inView = rows.filter(x => { const b = x.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length;
    const nameCell = r.querySelector('td.player-name');
    return JSON.stringify({ n: rows.length, h: Math.round(box.height), inView, vh: window.innerHeight, vw: window.innerWidth,
        oneLine: Math.round(nameCell.getBoundingClientRect().height) <= Math.round(box.height),
        hcpInline: (function () { const s = nameCell.querySelector('.player-hcp'); return s ? getComputedStyle(s).display : 'none'; })(),
        badges: document.querySelectorAll('#board-content .skins-badge').length,
        thirdId: r.getAttribute('data-player-id'), cards: document.querySelectorAll('.board-card-row').length,
        scroll: document.documentElement.scrollWidth <= window.innerWidth });
})()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('leaderboard.html', 'game=BRD1'), db: DB, settleMs: 4000, steps: [
        { expression: PROBE },
        { tap: '#board-content tr[data-player-id]:nth-of-type(3) td.score-cell', nth: 0 }, { sleep: 350 },
        { expression: "JSON.stringify({ cards: document.querySelectorAll('.board-card-row').length, si: (document.querySelector('.board-card-row') || { innerText: '' }).innerText.indexOf('SI') >= 0, openFor: (document.querySelector('.board-card-row') || { getAttribute: () => null }).getAttribute('data-card-for') })" },
    ] });
    C.ok = r.ok; C.reason = r.reason;
    const objs = (r.value || []).filter(x => typeof x === 'string' && x.charAt(0) === '{').map(x => JSON.parse(x));
    C.v = objs[0] || null; C.after = objs[objs.length - 1] || null;
});
describe('COLD CHROME at 390x844: compact rows, a tap on the row body, the card', () => {
    test('ran', () => assert.ok(C.ok, C.reason));
    test('23 rows at 47px (HEAD measured 59px on this same round), the handicap inline on the name line, no sideways scroll', () => {
        assert.equal(C.v.n, 23);
        // THE PIN THAT PROVES THIS WAVE: 59 -> 47. HEAD renders 59px here, so a
        // revert of the compact CSS fails this line; the "12 rows fit" test below
        // passes on HEAD too (12 x 59 = 708 < 844) and is NOT this wave's proof.
        assert.ok(C.v.h <= 50, 'row height ' + C.v.h + 'px; HEAD was 59');
        assert.ok(C.v.h >= 44, 'and still a 44px tap target: ' + C.v.h);
        assert.equal(C.v.hcpInline, 'inline');
        assert.equal(C.v.oneLine, true);
        assert.equal(C.v.scroll, true);
    });
    test('at least 12 of a 23-golfer round are on screen at once, once the list is scrolled to (true on HEAD as well - stated, not claimed as this wave\'s doing)', () => {
        assert.ok(C.v.inView >= 12, C.v.inView + ' rows inside ' + C.v.vh + 'px (row height ' + C.v.h + 'px)');
        // and the arithmetic behind it, stated: 12 rows must fit in the viewport
        assert.ok(C.v.h * 12 <= C.v.vh, 12 * C.v.h + 'px of rows in ' + C.v.vh + 'px');
    });
    test('the skins badges rendered on the real page', () => {
        assert.ok(C.v.badges >= 1, 'badges: ' + C.v.badges);
    });
    test('a real tap on the SCORE cell of the third row opened THAT golfer\'s card, and it says SI', () => {
        assert.equal(C.v.cards, 0, 'nothing open on arrival');
        assert.equal(C.after.cards, 1);
        assert.equal(C.after.openFor, C.v.thirdId);
        assert.equal(C.after.si, true);
    });
});
