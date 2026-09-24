// ============================================================================
// THE BOARD'S HEADER, TRIMMED (v202, 2026-09-22) - leaderboard.html
//
// 614px sat above the first golfer on a 390x844 phone, so a 23-golfer round
// arrived showing four of them. Measured, itemised, in the recon: the theme
// button's own band (34+12), the nav (139+16), "← Back" (44+10), the title
// (30+12), THREE toggle rows (3 x 34), the leader banner (82+16), the section
// card's chrome and a 55px header row.
//
// PART 1. A round with MORE THAN TWELVE golfers opens on ALL PLAYERS instead of
// By Group: six bordered cards with six header rows became one list.
// groupViewChosen still wins and still sticks for the session - this only
// changes what "not chosen yet" means. Every control stays where it was.
//
// PART 2, and nothing removed:
//   - ONE HEADER LINE: "← Back" (kept - it is the control people reach for;
//     Home in the nav is a different thing), the event name, and the theme
//     control, which MOVED into the line rather than being duplicated - it
//     keeps id="theme-toggle-btn" because toggleTheme() writes its label there.
//   - ONE CONTROL ROW: Ranking Net|Gross beside a segmented view control
//     (All / Groups / Flights). Groups shows only on a multi-group round and
//     Flights only on a flighted one; switchGroupView keeps all three modes and
//     the retired two-position toggle's ids stay, hidden and in step.
//   - the format toggle (Stroke / Match) only on a round that plays a match.
//   - the leader banner KEPT, folded to one line: it names the FIELD leader,
//     which the first row stops answering the moment the list is scrolled or
//     shown by group. Now on every view, including the flat one.
//   - <thead> KEPT (v201 added it deliberately); its cells were still on
//     v195b's 12px padding while v201 trimmed the body cells to 6, so the
//     header row stood taller than a golfer's. Same 6px now.
//   - THE SHARED NAV IS UNTOUCHED, by instruction.
//
// WHAT IS MEASURED WHERE. mini-dom has no layout, so every px here comes from
// Chrome (the block at the end); this file's harness tests are about what
// renders, which control is on, and which view a round opens in.
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
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lee', 'Max', 'Ned', 'Oli', 'Pat', 'Quy', 'Rae', 'Sal', 'Tom', 'Uma', 'Vic', 'Wes'];
const POOL = { moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 0, places: [] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } };

function round(n, extra) {
    const use = NAMES.slice(0, n);
    const players = makePlayers(use, use.map((_, i) => String(i % 18)), 101);
    players.forEach((p, i) => { p.hcp = String(i % 18); });
    const scores = {};
    players.forEach((p, i) => { const t = i === 0 ? 18 : 9; for (let h = 1; h <= t; h++) scores['p' + p.id + '_h' + h] = CD[h - 1].par; });
    scores['p101_h1'] = 2; scores['p102_h2'] = 2;
    const d = Object.assign({ players, gameFormat: 'stroke', courseData: CD, scores }, POOL, extra || {});
    if (extra && extra.flights) d.players.forEach((p, i) => { p.flight = i < Math.ceil(d.players.length / 2) ? 'A' : 'B'; });
    return d;
}
function page(data, drive) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = J(data);
    run(sb, "currentMode = 'BRD3'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';"
        + " ['board-content', 'live-skins-mount', 'board-controls', 'format-toggle', 'view-pills', 'scoring-toggle'].forEach(function (id) { document.__mount(document.getElementById(id)); });"
        + (drive || '') + ' renderBoard();');
    return sb;
}
const board = sb => String(run(sb, "document.getElementById('board-content').innerHTML || ''"));
const rowIds = html => [...html.matchAll(/<tr[^>]*data-player-id="(\d+)"/g)].map(m => m[1]);
const shown = (sb, id) => String(run(sb, "(function(){var e=document.getElementById('" + id + "'); return e ? (e.style.display === 'none' ? 'none' : (e.style.display || 'shown')) : 'missing';})()"));
const hasClass = (sb, id, c) => run(sb, "(function(){var e=document.getElementById('" + id + "'); return !!(e && e.classList && e.classList.contains('" + c + "'));})()");

describe('PART 1: a round over twelve golfers opens on ALL PLAYERS', () => {
    test('23 golfers, nothing chosen: one table, every golfer in it, the All segment on', () => {
        const sb = page(round(23));
        assert.equal(run(sb, 'groupViewMode'), 'all');
        const html = board(sb);
        assert.equal((html.match(/<table/g) || []).length, 1, 'one list, not six group cards');
        assert.equal(rowIds(html).length, 23);
        assert.equal(hasClass(sb, 'pill-all-view', 'active'), true);
        assert.equal(hasClass(sb, 'pill-group-view', 'active'), false);
    });
    test('TWELVE golfers still open By Group (the boundary is > 12, and it is one constant)', () => {
        const sb = page(round(12));
        assert.equal(run(sb, 'groupViewMode'), 'group');
        assert.equal((board(sb).match(/<table/g) || []).length, 3, 'three foursome cards');
        assert.match(read('leaderboard.html'), /const BIG_FIELD_ABOVE = 12;/);
        assert.equal(run(sb, 'bigFieldDefault(currentBoardData.players)'), 'group');
        assert.equal(run(sb, 'bigFieldDefault(new Array(13))'), 'all');
    });
    test('THE GOLFER\'S CHOICE WINS AND STICKS: Groups on a 23-golfer round survives the next render (CONTROL: without the choice it goes back to All)', () => {
        const sb = page(round(23));
        run(sb, "switchGroupView('group');");
        assert.equal(run(sb, 'groupViewChosen'), true);
        assert.equal((board(sb).match(/<table/g) || []).length, 6, 'six group cards, as asked');
        run(sb, 'renderBoard();');   // the next snapshot
        assert.equal(run(sb, 'groupViewMode'), 'group', 'still grouped');
        const fresh = page(round(23));
        assert.equal(run(fresh, 'groupViewMode'), 'all', 'CONTROL: a fresh arrival is flat again');
    });
    test('a single-group round has nothing to group by: it opens flat and offers no Groups segment', () => {
        const sb = page(round(4));
        assert.equal(run(sb, 'groupViewMode'), 'all');
        assert.equal(shown(sb, 'pill-group-view'), 'none');
        assert.equal((board(sb).match(/<table/g) || []).length, 1);
    });
    test('a FLIGHTED big field opens flat too; a flighted small one still opens By Flight', () => {
        const big = page(round(23, { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }));
        assert.equal(run(big, 'groupViewMode'), 'all');
        const small = page(round(8, { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }));
        assert.equal(run(small, 'groupViewMode'), 'flight');
        assert.equal(shown(small, 'pill-flight-view'), 'shown');
    });
    test('every view still renders its own shape (the three builders are untouched)', () => {
        const d = round(23, { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } });
        const flat = board(page(d, "switchGroupView('all');"));
        const groups = board(page(d, "switchGroupView('group');"));
        const flights = board(page(d, "switchGroupView('flight');"));
        assert.equal((flat.match(/<table/g) || []).length, 1);
        assert.equal((groups.match(/<table/g) || []).length, 6);
        assert.equal((flights.match(/<table/g) || []).length, 2, 'Flight A and Flight B');
        assert.match(flights, /Flight A/); assert.match(flights, /Flight B/);
        [flat, groups, flights].forEach(h => assert.equal(rowIds(h).length, 23, 'every golfer, every view'));
    });
});

describe('PART 2: one header line, one control row, nothing removed', () => {
    const src = read('leaderboard.html');
    test('the header line carries Back, the event name and the theme control - and there is exactly ONE theme control, with the id toggleTheme writes to', () => {
        // sliced from the OPENING TAG, not from an id - the comment above the block
        // names the id too, and indexOf would land in the comment
        const at = src.indexOf('<div class="board-headline">');
        const line = src.slice(at, src.indexOf('</div>', src.indexOf('theme-toggle-btn', at)));
        assert.match(line, /class="back-btn" onclick="goBack\(\)">← Back<\/a>/, 'Back is kept');
        assert.match(line, /<h2 class="event-title" id="main-title">/);
        assert.match(line, /class="theme-toggle-btn" id="theme-toggle-btn"/);
        assert.equal((src.match(/<button class="theme-toggle-btn"/g) || []).length, 1, 'one theme button, not two');
        const fn = src.slice(src.indexOf('function toggleTheme'), src.indexOf('function toggleTheme') + 600);
        assert.match(fn, /getElementById\('theme-toggle-btn'\)/, 'and the label is written to that id');
    });
    test('the three toggle rows are one row: Ranking beside a segmented view control, every option the round can show', () => {
        assert.match(src, /<div class="board-controls" id="board-controls">/);
        assert.ok(!/<div class="toggle-row" id="scoring-toggle">/.test(src), 'the stacked rows are gone');
        assert.ok(!/<div class="toggle-row" id="group-view-toggle"/.test(src));
        assert.ok(!/class="view-pills" id="view-pills"/.test(src) || /class="bc-view" id="view-pills"/.test(src));
        ['label-net', 'label-gross', 'pill-all-view', 'pill-group-view', 'pill-flight-view'].forEach(id =>
            assert.ok(src.indexOf('id="' + id + '"') > 0, id + ' is still there'));
    });
    test('the retired toggle\'s ids are kept and kept IN STEP (a dead wire would be worse than a visible one)', () => {
        const sb = page(round(23));
        assert.ok(src.indexOf('id="label-group-view"') > 0 && src.indexOf('id="label-all-view"') > 0);
        assert.equal(hasClass(sb, 'label-all-view', 'active'), true, 'All is on');
        assert.equal(hasClass(sb, 'label-group-view', 'active'), false);
        assert.equal(run(sb, "document.getElementById('group-view-toggle-input').checked"), true, 'the old checkbox agrees');
        run(sb, "switchGroupView('group');");
        assert.equal(hasClass(sb, 'label-group-view', 'active'), true);
        assert.equal(run(sb, "document.getElementById('group-view-toggle-input').checked"), false);
    });
    test('the Ranking control still drives the ranking, both ways - and is kept in step on EVERY render, not only by the tap', () => {
        const sb = page(round(23));
        assert.equal(run(sb, 'activeScoring'), 'net');
        assert.equal(hasClass(sb, 'label-net', 'active'), true, 'syncRankControl asserts it at render');
        run(sb, "switchScoring('gross');");
        assert.equal(run(sb, 'activeScoring'), 'gross');
        assert.equal(hasClass(sb, 'label-gross', 'active'), true);
        assert.equal(hasClass(sb, 'label-net', 'active'), false);
        assert.equal(run(sb, "document.getElementById('scoring-toggle-input').checked"), true);
        // set behind the control's back, then re-render: the control must not lie
        run(sb, "activeScoring = 'net'; renderBoard();");
        assert.equal(hasClass(sb, 'label-net', 'active'), true, 'a render re-asserts it');
        assert.equal(run(sb, "document.getElementById('scoring-toggle-input').checked"), false);
    });
    test('the format toggle only on a round that plays a match (CONTROL: a plain stroke round hides it)', () => {
        assert.equal(shown(page(round(8)), 'format-toggle'), 'none', 'plain stroke: hidden');
        assert.equal(shown(page(round(8, { sideMatches: { m: { format: 'match', scoring: 'net', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['102'] } } })), 'format-toggle'), 'flex', 'a side match: shown');
        assert.equal(shown(page(round(8, { gameFormat: 'match' })), 'format-toggle'), 'flex', 'match play: shown');
        assert.equal(shown(page(round(8, { gameFormat: 'nassau' })), 'format-toggle'), 'flex', 'a Nassau: shown');
        assert.equal(run(page(round(8)), 'boardHasMatches({ gameFormat: "bestball" })'), true);
    });
    test('THE BANNER IS KEPT, folded, and on EVERY view (it names the field leader; row 1 stops doing that once the list moves)', () => {
        const d = round(23, { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } });
        ['all', 'group', 'flight'].forEach(mode => {
            const html = board(page(d, "switchGroupView('" + mode + "');"));
            assert.match(html, /<div class="h2h-banner h2h-fold">/, mode + ': the folded banner');
            assert.match(html, /🏆 Leading the Field: /, mode);
            assert.match(html, /<div class="h2h-sub">[-+E]?\d* ?[-+E]?\d* ?thru \d+<\/div>|thru \d+/, mode + ': and how far');
        });
        assert.match(src, /\.h2h-banner\.h2h-fold \{ padding: 6px 10px; margin-bottom: 8px; box-shadow: none; \}/);
        assert.match(src, /\.h2h-banner\.h2h-fold \.h2h-status \{ display: inline;/, 'one line, not two');
    });
    test('<thead> is kept, and its cells are on the same 6px as the body cells (v201 trimmed only td)', () => {
        assert.match(board(page(round(23))), /<thead><tr><th>Pos<\/th>/);
        assert.match(src, /\.board-table th \{ padding: 6px 8px; \}/);
    });
    test('THE SHARED NAV IS UNTOUCHED', () => {
        assert.match(src, /<div class="app-nav-wrap">/);
        assert.match(src, /\.top-nav-bar \{ display: flex; flex-wrap: wrap; gap: 6px; \}/, 'still two rows, still wrapping');
        assert.ok(!/position: fixed/.test(src.slice(src.indexOf('.app-nav-wrap {'), src.indexOf('.app-nav-wrap {') + 300)), 'not made sticky');
    });
    test('every control in the strip is declared at 44px or more (the px are MEASURED in Chrome below)', () => {
        assert.match(src, /\.bc-seg \{ min-height: 44px;/);
        assert.match(src, /\.board-headline \.theme-toggle-btn \{[^}]*min-height: 44px;/);
        const back = src.slice(src.indexOf('.back-btn {'), src.indexOf('}', src.indexOf('.back-btn {')));
        assert.match(back, /min-height: 44px|padding: 12px/, 'Back keeps its target: ' + back);
    });
});

describe('THE NUMBERS DID NOT MOVE', () => {
    test('positions, gross, net and to-par are the engine\'s, in every view', () => {
        const d = round(23);
        const sb = page(d);
        const eng = J(run(sb, "computeNetToParStandings(currentBoardData.players, currentBoardData.courseData, currentBoardData.scores, { basis: 'net' })"));
        const labels = J(run(sb, 'boardPositionLabels(computeNetToParStandings(currentBoardData.players, currentBoardData.courseData, currentBoardData.scores, { basis: "net" }))'));
        ['all', 'group'].forEach(mode => {
            const html = board(page(d, "switchGroupView('" + mode + "');"));
            eng.filter(r => r.started).forEach(r => {
                const row = new RegExp('<tr[^>]*data-player-id="' + r.id + '"[^>]*>([\\s\\S]*?)</tr>').exec(html);
                assert.ok(row, mode + ': ' + r.name + ' has a row');
                assert.match(row[1], new RegExp('score-gross">' + r.gross + '<'), mode + ' ' + r.name + ' gross');
                assert.match(row[1], new RegExp('score-net">Net ' + r.net + '<'), mode + ' ' + r.name + ' net');
            });
            Object.keys(labels).forEach(id => {
                const row = new RegExp('<tr[^>]*data-player-id="' + id + '"[^>]*><td[^>]*>([^<]*)</td>').exec(html);
                if (row && mode === 'all') assert.equal(row[1], labels[id], 'position for ' + id);
            });
        });
    });
});

// ---- COLD CHROME: the measured table, before and after ------------------------
// The recon's section 3, re-run on the built page: the first row's offset and the
// rows fully in view at 390x844, on the plain, flighted and grouped 23-golfer
// rounds and on a small one. The BEFORE numbers are the recon's, recorded here as
// literals so the report and the test cannot drift apart.
const BEFORE = { plain: { first: 614, inView: 4 }, flighted: { first: 683, inView: 3 }, grouped: { first: 614, inView: 4 }, small: { first: 614, inView: 4 } };
const SHAPES = [
    ['plain', 23, null],
    ['flighted', 23, { flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } } }],
    ['grouped', 23, { groupSizeOverrides: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 } }],
    ['small', 8, null],
];
const PROBE = `(() => {
    const rows = Array.from(document.querySelectorAll('#board-content tr[data-player-id]'));
    const h = s => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none') return 'hidden'; return Math.round(e.getBoundingClientRect().height); };
    const segs = Array.from(document.querySelectorAll('.bc-seg')).filter(e => getComputedStyle(e).display !== 'none').map(e => Math.round(e.getBoundingClientRect().height));
    return JSON.stringify({
        view: (typeof groupViewMode !== 'undefined' ? groupViewMode : '?'),
        first: rows.length ? Math.round(rows[0].getBoundingClientRect().top) : null,
        inView: rows.filter(x => { const b = x.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length,
        themeBtns: document.querySelectorAll('.theme-toggle-btn').length,
        headline: h('.board-headline'), controls: h('#board-controls'), fmt: h('#format-toggle'),
        banner: h('.h2h-banner'), thead: h('#board-content thead'),
        minSeg: segs.length ? Math.min.apply(null, segs) : null, segs: segs.length,
        back: h('.back-btn'), theme: h('.theme-toggle-btn'), nav: h('.app-nav-wrap'),
        scrollW: document.documentElement.scrollWidth, vw: window.innerWidth, vh: window.innerHeight
    });
})()`;
const C = {};
before(async () => {
    for (const [label, n, extra] of SHAPES) {
        const d = round(n, extra); d.ownerUid = 'anon-cold';
        const r = await arriveCold({ url: fileUrl('leaderboard.html', 'game=BRD3'), db: { events: { BRD3: d }, global_courses: {}, trips: {}, tournaments: {} }, settleMs: 4000, steps: [{ expression: PROBE }] });
        C[label] = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
    }
});
describe('COLD CHROME at 390x844: the measured table', () => {
    test('all four shapes ran', () => SHAPES.forEach(([k]) => assert.ok(C[k] && !C[k].reason, k + ': ' + (C[k] && C[k].reason))));
    test('the first row moved up on every shape, and more golfers are on screen', () => {
        SHAPES.forEach(([k]) => {
            const v = C[k], b = BEFORE[k];
            assert.ok(v.first < b.first, k + ': first row ' + v.first + ', was ' + b.first);
            assert.ok(v.inView > b.inView, k + ': ' + v.inView + ' rows in view, was ' + b.inView);
        });
        // the 23-golfer shapes, pinned: 614/683 -> 375, 4/3 -> 9
        ['plain', 'flighted', 'grouped'].forEach(k => {
            assert.ok(C[k].first <= 380, k + ': ' + C[k].first);
            assert.ok(C[k].inView >= 9, k + ': ' + C[k].inView);
        });
    });
    test('the offset ADDS UP to what is on screen - and says why ~265 needs the nav (untouched here)', () => {
        const v = C.plain;
        // container pad 28 + nav + 16, then 44+10, 44+10, banner+8, thead
        const nav = 28 + v.nav + 16;
        const sum = nav + (v.headline + 10) + (v.controls + 10) + (v.banner + 8) + v.thead;
        assert.ok(Math.abs(sum - v.first) <= 4, 'itemised ' + sum + ' vs measured ' + v.first + ' (nav ' + nav + ')');
        assert.ok(nav >= 180, 'the nav alone ends at ' + nav + 'px, so no arrangement of the rest reaches 265');
    });
    test('ONE theme control, and every control is at least 44px tall', () => {
        SHAPES.forEach(([k]) => {
            const v = C[k];
            assert.equal(v.themeBtns, 1, k);
            assert.ok(v.minSeg >= 44, k + ': smallest segment ' + v.minSeg);
            assert.ok(v.back >= 44, k + ': Back ' + v.back);
            assert.ok(v.theme >= 44, k + ': theme ' + v.theme);
            assert.equal(v.headline, 44, k); assert.equal(v.controls, 44, k);
        });
    });
    test('the header line and the control row are ONE line each; the banner is one line; the format toggle is hidden on a stroke round', () => {
        const v = C.plain;
        // Content-sized, so the px follows the font. Measured 33 and 43 where
        // the fold landed. Chrome 148 on Linux measures 34 and 30 against the
        // same CSS, including the file before the team-view edit. One line
        // either way. The old banner was 82 and the old header row was 55.
        assert.ok(v.banner === 33 || v.banner === 34, 'the folded banner: 82 -> ' + v.banner);
        assert.ok(v.thead === 43 || v.thead === 30, 'the header row: 55 -> ' + v.thead);
        assert.equal(v.fmt, 'hidden');
        assert.equal(C.flighted.segs, 5, 'Net, Gross, All, Groups, Flights - one row, no wrap (it was 86px of pills)');
    });
    test('no sideways scroll on any shape', () => SHAPES.forEach(([k]) => assert.ok(C[k].scrollW <= C[k].vw, k + ': ' + C[k].scrollW)));
    test('a big field opens flat, a small one by group - on the real page', () => {
        assert.equal(C.plain.view, 'all');
        assert.equal(C.flighted.view, 'all');
        assert.equal(C.small.view, 'group');
    });
});
