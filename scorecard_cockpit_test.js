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

// RE-POINTED 2026-10-05: the reading mounts moved OUT of the Status sheet and
// back onto the page, into #round-reading below Prev/Next - a fresh round behind
// a handle said nothing about what the group was playing for. The sheet keeps
// settings and admin. Same claim, read where they now live.
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

const DEPS = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
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

    test('the betting panels are not on the hole card at all', () => {
        // RE-POINTED 2026-10-04 (the Status sheet). This asserted the panels were
        // rendered BELOW Prev/Next so score entry came first. They are not rendered
        // in the hole card any more: everything a golfer reads rather than acts on
        // is a static child of #round-sheet-body, written to by the same renderers
        // through the same ids. Same intent, taken further - and a mount creeping
        // back into this html is exactly what would put it above Prev/Next again.
        const h = html(page(heavy(), 5));
        assert.ok(h.indexOf('hole-view-nav-row') > -1, 'the hole card lost Prev/Next');
        ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount'].forEach(m => {
            assert.equal(h.indexOf(m), -1, m + ' is rendered inside the hole card again');
        });
        const sheet = IDX.slice(IDX.indexOf('<div id="round-reading">'),
                                IDX.indexOf('</div>', IDX.indexOf('id="bet-strip-mount"')));
        ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount'].forEach(m => {
            assert.match(sheet, new RegExp('id="' + m + '"'), m + ' is not in the reading area on the page');
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
        // RE-POINTED 2026-10-04: the bet strip is no longer emitted here, so the
        // picker's place is measured against the thing that still is - the nav row
        // it belongs under.
        const nav = IDX.indexOf('html += navRowHtml;');
        const picker = IDX.indexOf('html += buildHolePickerHtml(');
        assert.ok(nav > -1 && picker > nav, 'utilities stay last');
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

    test('every hole change renders, then LANDS on the first score box (2026-09-14)', () => {
        // RE-PINNED. Navigation went scrollToHoleCard() (card top) -> withNavAnchor()
        // (keep the nav row still) -> landOnHole(): an explicit scroll that puts the
        // first score box HOLE_LANDING_OFFSET px from the top and focuses the first
        // empty one. hole_view_landing_test.js measures it in Chrome; this only pins
        // the call shape.
        // RE-POINTED AGAIN (Wave 23): the render-then-land pair moved into goToHole,
        // the one function Prev/Next and the 1-18 jump now share, because the forced KP
        // gate has to sit on every hole change and could not be in three places.
        const fn = IDX.slice(IDX.indexOf('function goToHole'),
            IDX.indexOf('function goToHole') + 900);
        assert.match(fn, /renderHoleView\(\);\s*landOnHole\(\);/, 'render, then land');
        assert.ok(!/scrollToHoleCard\(\)|withNavAnchor\(/.test(fn), 'neither earlier scroll rule');
        // WINDOW WIDENED 2026-10-04 (was 900): goToAdjacentHole gained the comment
        // explaining why it walks the card in PLAY order - a round off the 10th tee
        // goes 18 -> 1 - and the window no longer reached the call. The assertion is
        // unchanged and still the point: one navigator, through goToHole.
        const adj = IDX.slice(IDX.indexOf('function goToAdjacentHole'),
            IDX.indexOf('function goToAdjacentHole') + 1600);
        assert.match(adj, /goToHole\(/, 'Prev/Next must navigate through the one place');
    });

    test('the landing targets the hole heading (v129; v128 anchored the first box), not the card and not the page top', () => {
        const at = IDX.indexOf('function landOnHole');
        const fn = IDX.slice(at, IDX.indexOf('\n    function ', at + 30));
        assert.match(fn, /querySelector\('\.hole-view-header'\)/, 'must target the heading');
        assert.match(fn, /- HOLE_LANDING_OFFSET/, 'a small offset keeps the box off the edge');
        // RE-POINTED 2026-10-04 (Manny's fit rule). This forbade scrollTo(0, 0)
        // because on the old scorecard - header, nav, Playing With, group scores,
        // the live dashboard, all above the hole - the top of the page was nowhere
        // near the hole and landing there would have lost it. With everything else
        // in the Status sheet the hole card starts at the top, and on a four-golfer
        // round the whole of it fits: scrolling then PUSHED the banner above it
        // under the status bar, which is the bug this rule fixes. So page-top is
        // allowed exactly when the card fits, and the heading is still the target in
        // the other arm - which is what the two assertions above hold.
        assert.match(fn, /const fitsAtTop = cardBottom <= \(window\.innerHeight \|\| 0\);/,
            'the page-top landing is no longer conditional on the card fitting');
        assert.ok(!/top: 0/.test(fn), 'a bare top: 0 would lose the hole on a card that does not fit');
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
        // The landing (landOnHole) scrolls to the first score box - but mini-dom does
        // not parse innerHTML, so the card has no boxes here and the landing fails
        // open: no scroll, navigation still happens, which is the required
        // behaviour. The landing itself is measured in hole_view_landing_test.js
        // (Chrome) and its arithmetic in viewport_anchor_test.js.
        assert.equal(sb.window.__scrolls.length, 0,
            'no card-top jump; the landing fails open without boxes to land on');
        const h = sb.window.__hv;
        assert.ok(h.indexOf('hole-view-nav-row') > h.lastIndexOf('hv-player-row'),
            'and Prev/Next is still directly under the scores of the new hole');
    });
});

// ---------------------------------------------------------------------------
describe('THE BETTING INFORMATION STAYS ON THE SCORECARD', () => {
    test('a heavy round mounts every status surface, one tap away', () => {
        // RE-POINTED 2026-10-04 (the Status sheet). "Not behind More" was written
        // against a wave that had hidden these surfaces behind a More menu, and the
        // claim it protects is that they stay on the SCORECARD - reachable without
        // leaving the round - rather than on another page. They are: one handle at
        // the bottom of the card opens all of them at once. What this refuses is
        // their disappearance, so it is asserted where they now live.
        const sheet = IDX.slice(IDX.indexOf('<div id="round-reading">'),
                                IDX.indexOf('</div>', IDX.indexOf('id="bet-strip-mount"')));
        ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount',
         'live-skins-mount', 'live-ticker-mount'].forEach(m =>
            assert.match(sheet, new RegExp('id="' + m + '"'),
                m + ' must stay on the scorecard, in the Status sheet'));
        // AND THE SHEET IS ON THE SCORECARD, not a link to somewhere else.
        assert.match(IDX, /id="round-sheet-handle"/, 'there is no handle to open it with');
        assert.match(IDX, /onclick="toggleRoundSheet\(\)"/, 'the handle opens nothing');
    });

    test('Side Match status is built for the scorecard, not just the Action page', () => {
        const d = heavy();
        const sb = page(d, 5);
        run(sb, `
            meId = '${d.__f.id(0)}';
            renderActionCenter();
            document.__mount(document.getElementById('action-center-mount'));
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
        // RE-POINTED 2026-10-04: the panels are mounts in the PAGE now rather than in
        // the hole card's html, so "exactly one" is counted where they live. The claim
        // is the one that matters either way - one element per id, because two would
        // mean the renderers write to whichever came first.
        const h = html(page(heavy(), 5));
        ['action-center-mount', 'bet-strip-mount'].forEach(m => {
            assert.equal((h.match(new RegExp(m, 'g')) || []).length, 0,
                m + ' is rendered inside the hole card again');
            assert.equal((IDX.match(new RegExp('id="' + m + '"', 'g')) || []).length, 1,
                m + ' duplicated');
        });
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
        // Same reason as above: no scrollTo-to-card any more, and the anchor fails open
        // without a scroll API. Navigation still lands correctly, which is the point.
        assert.equal(sb.window.__scrolls.length, 0);
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
        ['match-engine.js', 'money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js'].forEach(f => {
            assert.ok(!/navRowHtml|hole-view-nav-row|scrollToHoleCard/.test(read(f)),
                `${f} gained scorecard layout code`);
        });
    });

    test('the navigation logic itself was not rewritten', () => {
        // WINDOW WIDENED 2026-10-04 (was 600), same reason as above. The clamp
        // itself is byte-identical: what changed is the ARRAY it clamps over, which
        // is now the holes in play order rather than ascending. The ends of the
        // sequence are still the ends, and they are still clamped, never wrapped.
        const fn = IDX.slice(IDX.indexOf('function goToAdjacentHole'), IDX.indexOf('function goToAdjacentHole') + 1600);
        assert.ok(/Math\.max\(0, Math\.min\(holeNumbers\.length - 1, idx \+ delta\)\)/.test(fn),
            'the clamp must be unchanged');
        assert.match(fn, /playOrderCourse\(\)/,
            'it walks the card in number order again, so a 10th-tee round cannot reach hole 1 from the 18th');
    });
});
