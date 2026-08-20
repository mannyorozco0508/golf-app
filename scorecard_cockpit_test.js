// ============================================================================
// SCORECARD COCKPIT — SCORE, THEN NEXT
//
// Prev/Next used to render below the Action Center and the press strip. On a round
// with several wagers that meant scrolling past Live Action, My Matches and every
// press just to reach Next - on the one screen a golfer uses between shots.
//
// Entering a score and moving on is the primary job of this page. Everything else
// is what you READ afterwards. These tests hold that order, and hold the betting
// information ON the scorecard so it never retreats behind More.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = read('index.html');

const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

function page(data, hole) {
    const sb = loadHtmlInlineScript('index.html', DEPS);
    vm.runInContext(`
        currentData = ${J(data)};
        currentViewedHole = ${hole};
        hasGroupLock = true;
        // Record scroll calls instead of performing them - there is no viewport here.
        window.__scrolls = [];
        window.scrollTo = function (o) { window.__scrolls.push(o); };
        window.pageYOffset = 0;
        document.__mount(document.getElementById('hole-view-card'));
        document.__mount(document.getElementById('scorecard-body'));
        renderScorecard();

        // renderHoleView reads CELLS out of the scorecard table. renderScorecard builds
        // that table with innerHTML, and the mini-DOM stores innerHTML as a string
        // without parsing it (documented in helpers/mini-dom.js), so the row would have
        // no children and no player rows would render. Build the cells directly - the
        // same shape the browser produces - so the real render path is exercised.
        (function buildCells() {
            var mk = function (txt) { var c = document.createElement('td'); c.textContent = txt; c.innerHTML = txt; return c; };
            var head = document.getElementById('table-head-row');
            document.__mount(head);
            [ 'Hole', 'Par', 'HCP' ].forEach(function (t) { head.appendChild(mk(t)); });
            currentData.players.forEach(function (p) { head.appendChild(mk(p.name)); });

            var hole = currentData.courseData[${hole} - 1];
            var row = document.getElementById('hole-row-' + ${hole});
            document.__mount(row);
            [ String(${hole}), String(hole.par), String(hole.hcpIndex) ].forEach(function (t) { row.appendChild(mk(t)); });
            currentData.players.forEach(function (p) {
                row.appendChild(mk('<input class="score-input" value="' +
                    (currentData.scores['p' + p.id + '_h' + ${hole}] || '') + '">'));
            });
        })();

        renderHoleView();
        window.__hv = document.getElementById('hole-view-card').innerHTML;
    `, sb);
    return sb;
}
const html = sb => sb.window.__hv;
const run = (sb, code) => vm.runInContext(code, sb);

function field(n) {
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'];
    const hcps = ['8', '4', '15', '0', '6', '12', '20', '1'];
    const P = makePlayers(names.slice(0, n), hcps.slice(0, n));
    P.forEach((p, i) => { p.playingForMoney = true; p.group = i < 4 ? 1 : 2; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { P, S, id: k => String(P[k].id) };
}

const plain = () => { const f = field(4); return { gameFormat: 'stroke', players: f.P, courseData: CD, scores: f.S, __f: f }; };

function heavy() {
    const f = field(8);
    const { id } = f;
    return {
        gameFormat: 'stroke', players: f.P, courseData: CD, scores: f.S, __f: f,
        dots: { h3: { [`p${id(0)}`]: ['birdie'] } },
        additionalGameInstances: {
            sk: { format: 'skins', enabled: true, startHole: 1, createdAt: 1, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: true, participantIds: [id(0), id(1), id(2)] },
            dt: { format: 'dots', enabled: true, startHole: 1, createdAt: 2, dotPointVal: 5 }
        },
        sideMatches: {
            a: { format: 'stroke', scoring: 'net', teamAIds: [id(0)], teamBIds: [id(1)], overallStake: 50, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 1, overallPresses: { p1: { startHole: 5, stake: 50 }, p2: { startHole: 9, stake: 100 }, p3: { startHole: 13, stake: 200 } } },
            b: { format: 'match', scoring: 'net', stake: 20, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(2)], startHole: 1, createdAt: 2 },
            c: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0), id(3)], teamBIds: [id(1), id(2)], startHole: 1, createdAt: 3 },
            d: { format: 'stroke', scoring: 'gross', teamAIds: [id(0)], teamBIds: [id(4)], overallStake: 100, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 4 }
        }
    };
}

// ---------------------------------------------------------------------------
describe('SCORE -> NEXT: the reading order', () => {
    test('Prev/Next renders immediately after the score rows', () => {
        const h = html(page(plain(), 5));
        const lastRow = h.lastIndexOf('hv-player-row');
        const nav = h.indexOf('hole-view-nav-row');
        assert.ok(lastRow > -1, 'no score rows rendered');
        assert.ok(nav > lastRow, 'navigation must follow the scores');
    });

    test('Prev/Next comes BEFORE every betting panel', () => {
        const h = html(page(heavy(), 5));
        const nav = h.indexOf('hole-view-nav-row');
        ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount'].forEach(m => {
            const at = h.indexOf(m);
            assert.ok(at > -1, `${m} missing`);
            assert.ok(nav < at, `${m} must sit below Prev/Next, not above it`);
        });
    });

    test('exactly ONE navigation row is rendered', () => {
        const h = html(page(heavy(), 5));
        assert.equal((h.match(/hole-view-nav-row/g) || []).length, 1, 'a duplicate nav row would be worse than none');
        assert.equal((IDX.match(/html \+= navRowHtml;/g) || []).length, 1);
    });

    test('both buttons are present and full-size', () => {
        const h = html(page(plain(), 5));
        assert.match(h, /goToAdjacentHole\(-1\)/, 'Prev');
        assert.match(h, /goToAdjacentHole\(1\)/, 'Next');
        const css = IDX.slice(IDX.indexOf('.hole-view-nav-btn {'), IDX.indexOf('.hole-view-nav-btn {') + 260);
        assert.match(css, /min-height: 48px/, 'thumb-sized targets must survive the move');
    });

    test('the hole picker still comes after the panels', () => {
        // buildHolePickerHtml returns '' unless the picker is open, so the ORDER is
        // asserted at the source: the call sits after both mounts.
        const bs = IDX.indexOf(`html += '<div id="bet-strip-mount"></div>'`);
        const picker = IDX.indexOf('html += buildHolePickerHtml(');
        assert.ok(bs > -1 && picker > bs, 'utilities stay last');
        // And when it IS open it renders below them.
        const sb = page(heavy(), 5);
        run(sb, `holePickerOpen = true; renderHoleView();
            window.__hv = document.getElementById('hole-view-card').innerHTML;`);
        const h = sb.window.__hv;
        // Match the picker PANEL ('hole-picker'), not the nav button that opens it
        // ('hole-jump-open'), which necessarily sits up with Prev/Next.
        assert.ok(h.indexOf('class="hole-picker"') > h.indexOf('bet-strip-mount'),
            'utilities stay last');
    });
});

// ---------------------------------------------------------------------------
describe('HOLE NAVIGATION', () => {
    test('Next advances the hole', () => {
        const sb = page(plain(), 5);
        run(sb, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6);
    });

    test('Prev goes back', () => {
        const sb = page(plain(), 5);
        run(sb, `goToAdjacentHole(-1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 4);
    });

    test('it stops at both ends rather than running off the card', () => {
        const a = page(plain(), 18);
        run(a, `goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(a.window.__h, 18);
        const b = page(plain(), 1);
        run(b, `goToAdjacentHole(-1); window.__h = currentViewedHole;`);
        assert.equal(b.window.__h, 1);
    });

    test('every hole change asks the viewport to return to the hole card', () => {
        // The scroll itself cannot be observed without a real viewport; what IS provable
        // is that navigation calls it every time, which is what regressed before.
        const sb = page(heavy(), 5);
        run(sb, `window.__scrolls = []; goToAdjacentHole(1); goToAdjacentHole(1); goToAdjacentHole(-1);`);
        assert.equal(sb.window.__scrolls.length, 3, 'one scroll per hole change');
    });

    test('the scroll targets the hole card, not the top of the page', () => {
        const fn = IDX.slice(IDX.indexOf('function scrollToHoleCard'), IDX.indexOf('function scrollToHoleCard') + 400);
        assert.ok(/getElementById\('hole-view-card'\)/.test(fn), 'must target the card');
        assert.ok(/targetTop - 8/.test(fn), 'a small offset keeps the hole heading visible');
        assert.ok(!/top: 0/.test(fn), 'scrolling to page top would lose the hole heading');
    });

    test('goToAdjacentHole still re-renders AND scrolls', () => {
        const fn = IDX.slice(IDX.indexOf('function goToAdjacentHole'), IDX.indexOf('function goToAdjacentHole') + 600);
        assert.ok(/renderHoleView\(\);/.test(fn));
        assert.ok(/scrollToHoleCard\(\);/.test(fn));
    });

    test('navigating from deep in the page still lands on the new hole', () => {
        const sb = page(heavy(), 9);
        run(sb, `
            window.__scrolls = [];
            goToAdjacentHole(1);
            window.__h = currentViewedHole;
            window.__hv = document.getElementById('hole-view-card').innerHTML;
        `);
        assert.equal(sb.window.__h, 10);
        assert.equal(sb.window.__scrolls.length, 1, 'a stale scroll position must be corrected');
        const h = sb.window.__hv;
        assert.ok(h.indexOf('hole-view-nav-row') > h.lastIndexOf('hv-player-row'),
            'and Prev/Next is still directly under the scores of the new hole');
    });
});

// ---------------------------------------------------------------------------
describe('THE BETTING INFORMATION STAYS ON THE SCORECARD', () => {
    test('a heavy round mounts every status surface', () => {
        const h = html(page(heavy(), 5));
        ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount'].forEach(m =>
            assert.ok(h.includes(m), `${m} must stay on the scorecard, not behind More`));
    });

    test('Side Match status is built for the scorecard, not just the Action page', () => {
        const d = heavy();
        const sb = page(d, 5);
        run(sb, `
            meId = '${d.__f.id(0)}';
            renderActionCenter();
            window.__ac = document.getElementById('action-center-mount').innerHTML;
        `);
        const ac = sb.window.__ac;
        assert.ok(ac.length > 0, 'the action centre rendered nothing');
        // It opens as a compact collapsed summary - "My Round · N matches" - and expands
        // on tap. Either state proves side match status is present on the scorecard.
        assert.match(ac, /match/i, 'side match status must appear on the scorecard');
        const expanded = (() => {
            run(sb, `actionCenterOpen = true; renderActionCenter();
                window.__ac2 = document.getElementById('action-center-mount').innerHTML;`);
            return sb.window.__ac2;
        })();
        assert.ok(expanded.length > ac.length, 'and it expands to the detail on tap');
    });

    test('the PRESS surface is reachable without opening Action', () => {
        assert.ok(/id="bet-strip-mount"/.test(IDX));
        assert.ok(/buildBetStrip/.test(IDX), 'the press strip is fed by the shared builder');
        assert.ok(/renderBetStrip|bet-strip-mount/.test(IDX));
    });

    test('the + DOT control still renders and sits below navigation', () => {
        const d = heavy();
        const h = html(page(d, 3));
        assert.match(h, /hv-dots-btn/, 'Dots must not regress');
        assert.match(h, /openDotsModal\(3\)/);
        assert.ok(h.indexOf('hole-view-nav-row') < h.indexOf('hv-dots-btn'),
            'scoring and Next come first');
    });

    test('a heavy round stays bounded — the panels are mounts, not inline walls', () => {
        const h = html(page(heavy(), 5));
        // Each panel is a single mount div; their content renders separately and is
        // capped by its own builder, so four side matches cannot blow up this markup.
        ['action-center-mount', 'bet-strip-mount'].forEach(m =>
            assert.equal((h.match(new RegExp(m, 'g')) || []).length, 1, `${m} duplicated`));
    });
});

// ---------------------------------------------------------------------------
describe('NO-ACTION ROUND STAYS CLEAN', () => {
    test('no Dots control when there is no Dots game', () => {
        assert.ok(!/hv-dots-btn/.test(html(page(plain(), 5))));
    });

    test('scores and navigation still render', () => {
        const h = html(page(plain(), 5));
        assert.match(h, /hv-player-row/);
        assert.match(h, /hole-view-nav-row/);
    });

    test('the action centre renders nothing for a round with no wagers', () => {
        const sb = page(plain(), 5);
        run(sb, `renderActionCenter(); window.__ac = document.getElementById('action-center-mount').innerHTML;`);
        assert.equal(String(sb.window.__ac || '').trim(), '', 'an empty betting panel is clutter');
    });
});

// ---------------------------------------------------------------------------
describe('SCORE CORRECTIONS', () => {
    test('correcting a score changes the live status', () => {
        const d = heavy();
        const before = (() => {
            const sb = page(d, 5);
            run(sb, `meId='${d.__f.id(0)}'; renderActionCenter();
                window.__ac = document.getElementById('action-center-mount').innerHTML;`);
            return sb.window.__ac;
        })();
        const fixed = JSON.parse(J(d));
        for (let h = 1; h <= 9; h++) fixed.scores[`p${d.__f.id(0)}_h${h}`] = CD[h - 1].par - 1;
        const after = (() => {
            const sb = page(fixed, 5);
            run(sb, `meId='${d.__f.id(0)}'; renderActionCenter();
                window.__ac = document.getElementById('action-center-mount').innerHTML;`);
            return sb.window.__ac;
        })();
        assert.notEqual(before, after, 'nine birdies must move the live status');
    });

    test('navigating after a correction still lands on the next hole', () => {
        const d = heavy();
        d.scores[`p${d.__f.id(0)}_h5`] = CD[4].par + 4;
        const sb = page(d, 5);
        run(sb, `window.__scrolls = []; goToAdjacentHole(1); window.__h = currentViewedHole;`);
        assert.equal(sb.window.__h, 6);
        assert.equal(sb.window.__scrolls.length, 1);
    });
});

// ---------------------------------------------------------------------------
// PART 6 AUDIT, recorded as a test so the finding cannot quietly change.
describe('RELEVANCE: the split orders, it does not hide', () => {
    test('mySide / otherSide is ordering only — nothing is filtered out', () => {
        const fn = IDX.slice(IDX.indexOf('const mySide = [], otherSide = [];') - 400,
            IDX.indexOf('const mySide = [], otherSide = [];') + 400);
        assert.ok(/Nothing is\s*\n?\s*\/\/ hidden/.test(fn) || /Nothing is hidden/.test(fn),
            'the intent must stay documented');
        assert.ok(/otherSide\)\.push\(sm\)/.test(fn), 'unmatched wagers still get pushed, not dropped');
    });

    test('without ?me= every wager still renders', () => {
        const d = heavy();
        const sb = page(d, 5);
        run(sb, `
            meId = null;
            renderActionCenter();
            window.__ac = document.getElementById('action-center-mount').innerHTML;
        `);
        assert.ok(String(sb.window.__ac).length > 0,
            'a scorekeeper on a plain group link must still see the action');
    });

    test('with ?me= the identified golfer still sees their action', () => {
        const d = heavy();
        const sb = page(d, 5);
        run(sb, `
            meId = '${d.__f.id(0)}';
            renderActionCenter();
            window.__ac = document.getElementById('action-center-mount').innerHTML;
        `);
        assert.ok(String(sb.window.__ac).length > 0);
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED — this was layout only', () => {
    test('no engine gained layout logic', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js'].forEach(f => {
            assert.ok(!/navRowHtml|hole-view-nav-row|scrollToHoleCard/.test(read(f)),
                `${f} gained scorecard layout code`);
        });
    });

    test('the navigation logic itself was not rewritten', () => {
        const fn = IDX.slice(IDX.indexOf('function goToAdjacentHole'), IDX.indexOf('function goToAdjacentHole') + 600);
        assert.ok(/Math\.max\(0, Math\.min\(holeNumbers\.length - 1, idx \+ delta\)\)/.test(fn),
            'the clamp must be unchanged');
    });
});
