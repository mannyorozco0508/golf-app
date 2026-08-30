// ============================================================================
// FULL CARD — MATCH HANDICAP UI CONSISTENCY
//
// Three things the Full Card now communicates, and one thing it must not break.
//
//   1. Each golfer's OWN Playing Handicap, under their name in the header.
//   2. Teal stroke dots that are the SELECTED MATCH'S relative strokes.
//   3. One compact line naming the baseline golfer and what everyone plays off.
//
// The thing it must not break: ROUND PERFORMANCE. Gross stays gross, and net,
// net-to-par and OUT/IN/TOTAL stay on the golfer's ordinary course allocation.
// Two concepts live on one card on purpose - the dot is the match, the number is
// the round - and these tests hold that line.
//
// A NOTE ON ARCHITECTURE, because it determines what "agree" can even mean here.
// Hole View is NOT a second renderer. renderHoleView() reads the already-rendered
// Full Card row out of the DOM and re-lays it out, copying each player cell's
// innerHTML verbatim - stroke dots included. Hole View and Full Card therefore
// cannot disagree about dots; they are the same HTML. What CAN break is the
// header: Hole View re-reads those cells for its row labels, so adding a second
// line to the header is exactly the change that would corrupt it. That failure
// mode is pinned below.
//
// mini-dom stores innerHTML as a string and does not build child nodes, so the
// header/row DOM cannot be walked in this harness. Rendering behaviour is
// therefore pinned at the source level, and every VALUE those templates emit is
// proven by executing the real production functions.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('index.html');
const renderScorecardSrc = SRC.slice(SRC.indexOf('function renderScorecard'));
const renderHoleViewSrc = SRC.slice(SRC.indexOf('function renderHoleView'),
                                   SRC.indexOf('function renderLiveTicker'));

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
let _page = null;
function page() {
    if (!_page) _page = loadHtmlInlineScript('index.html', PAGE_DEPS);
    return _page;
}
const call = (expr) => vm.runInContext(expr, page());

const E = loadJsFile('money-engine.js');

// SI 1 is HOLE 7 - so nothing here can pass by confusing the two.
const SI = { 7:1, 3:2, 12:3, 16:4, 1:5, 9:6, 5:7, 14:8, 18:9,
             2:10, 11:11, 8:12, 15:13, 4:14, 17:15, 6:16, 13:17, 10:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: SI[i + 1] }));
const holeOfSI = (si) => Number(Object.keys(SI).find(h => SI[h] === si));

const P = (id, name, hcp, team) => ({ id, name, hcp: String(hcp), team });
function twoVtwo(h, ids) {
    const i = ids || [101, 102, 103, 104];
    return [P(i[0], 'Lee', h[0], 'Team 1'), P(i[1], 'Jeremy', h[1], 'Team 1'),
            P(i[2], 'Dave', h[2], 'Team 2'), P(i[3], 'Jeff', h[3], 'Team 2')];
}
function level(ps, g) {
    const s = {};
    ps.forEach(p => cd18.forEach(h => { s['p' + p.id + '_h' + h.hole] = g || 5; }));
    return s;
}
const match = (ps, fmt, holes) => JSON.parse(JSON.stringify(
    E.calculateMatchEngine(ps, holes || cd18, level(ps), 'net', fmt || 'match', 'none', 20, 0, [])));

// The dot count the CARD will print for a player on a hole, built from exactly the
// pieces renderScorecard uses: matchCalc.relHcpById, then allocateMatchStrokes.
function cardDots(calc, player, hcpIndex, courseStrokes) {
    const tbl = (calc && calc.usesRelativeHandicap && calc.relHcpById) ? calc.relHcpById : null;
    if (!tbl) return courseStrokes;
    const rel = tbl[String(player.id)];
    if (rel === undefined) return courseStrokes;
    return E.allocateMatchStrokes(rel, hcpIndex);
}
const dottedSIs = (calc, p) => cd18
    .filter(h => cardDots(calc, p, h.hcpIndex, E.getStrokes(h.hcpIndex, E.parseHcp(p.hcp))) > 0)
    .map(h => h.hcpIndex).sort((a, b) => a - b);

// ============================================================================
describe('CHANGE 1 — THE GOLFER\u2019S HANDICAP IN THE HEADER', () => {

    test('the header cell carries name AND handicap', () => {
        assert.match(renderScorecardSrc, /<span class="fc-name">\$\{first\}<\/span>/,
            'the name must stay its own element');
        assert.match(renderScorecardSrc, /<span class="fc-hcp">HCP \$\{formatHcpDisplay\(p\.hcp\)\}<\/span>/,
            'the handicap must render through the golfer-facing formatter');
        assert.ok(!/headRow\.innerHTML \+= `<th>\$\{p\.name\.split\(" "\)\[0\]\}<\/th>`/.test(renderScorecardSrc),
            'the old name-only header must be gone');
    });

    test('HCP 5 and HCP 12 display correctly', () => {
        assert.equal(call('formatHcpDisplay("5")'), '5');
        assert.equal(call('formatHcpDisplay("12")'), '12');
        assert.equal(call('formatHcpDisplay(12)'), '12');
    });

    test('scratch displays sensibly', () => {
        assert.equal(call('formatHcpDisplay("0")'), '0');
        assert.equal(call('formatHcpDisplay("")'), '0', 'a blank handicap is scratch, not empty');
        assert.equal(call('formatHcpDisplay(null)'), '0');
        assert.equal(call('formatHcpDisplay(undefined)'), '0');
    });

    test('a plus handicap displays as HCP +2', () => {
        assert.equal(call('formatHcpDisplay("+2")'), '+2', 'stored as +2, shown as +2');
    });

    test('THE INTERNAL -2 IS NEVER SHOWN AS HCP -2', () => {
        assert.equal(call('formatHcpDisplay(-2)'), '+2',
            'parseHcp stores a plus handicap as a negative; the card must never leak it');
        assert.equal(call('formatHcpDisplay("-2")'), '+2');
        assert.equal(call('formatHcpDisplay(-4)'), '+4');
        // The formatter output can never begin with a minus sign.
        ['+2', '-2', -2, 0, '', 5, '12', -1].forEach(v => {
            const out = call('formatHcpDisplay(' + JSON.stringify(v) + ')');
            assert.ok(out.charAt(0) !== '-', 'formatHcpDisplay(' + JSON.stringify(v) + ') leaked a minus: ' + out);
        });
    });

    test('the handicap is a SECOND LINE, so columns do not widen', () => {
        const css = SRC.slice(SRC.indexOf('.fc-hcp {'), SRC.indexOf('.fc-hcp {') + 260);
        assert.match(css, /display: block/, 'block, so it stacks under the name rather than beside it');
        assert.match(css, /white-space: nowrap/, 'it must never wrap mid-token and stretch the column');
        assert.ok(!/th\s*\{[^}]*min-width/.test(SRC.slice(SRC.indexOf('.card-table'), SRC.indexOf('.card-table') + 400)),
            'no new minimum column width was introduced');
    });

    test('the golfer NAME is not shrunk to make room', () => {
        assert.ok(!/\.fc-name\s*\{[^}]*font-size/.test(SRC),
            'the name keeps the header font size it always had');
        const hcpCss = SRC.slice(SRC.indexOf('.fc-hcp {'), SRC.indexOf('.fc-hcp {') + 260);
        assert.match(hcpCss, /font-size: 0\.6rem/, 'only the added line is small');
    });

    test('no horizontal scrolling is introduced', () => {
        const added = ['.fc-name', '.fc-hcp', '.match-hcp-note'];
        added.forEach(sel => {
            const block = SRC.slice(SRC.indexOf(sel + ' {'), SRC.indexOf(sel + ' {') + 300);
            assert.ok(!/overflow-x/.test(block), sel + ' must not add horizontal overflow');
            assert.ok(!/width:\s*\d{3,}px/.test(block), sel + ' must not pin a wide fixed width');
        });
    });

    test('a four-player phone layout still emits exactly four header cells', () => {
        const ps = twoVtwo([5, 12, 8, 17]);
        // One <th> per player, each self-contained - the loop body is a single cell.
        const loop = renderScorecardSrc.slice(renderScorecardSrc.indexOf('filteredPlayers.forEach(p => {'),
            renderScorecardSrc.indexOf('const matchNoteEl'));
        assert.equal((loop.match(/<th /g) || []).length, 1, 'one cell per golfer, no extra columns');
        assert.equal((loop.match(/<\/th>/g) || []).length, 1);
        assert.equal(ps.length, 4);
    });

    test('a long name is escaped and cannot break the attribute', () => {
        assert.equal(call('escapeAttr(\'Bob "The Hammer" O\\\'Sullivan\')'),
            'Bob &quot;The Hammer&quot; O\'Sullivan');
        assert.equal(call('escapeAttr("<script>")'), '&lt;script&gt;');
    });
});

// ============================================================================
describe('HOLE VIEW STILL READS CLEAN NAMES', () => {

    // THE regression this change could realistically have caused on-course.
    test('Hole View reads the NAME element, not the whole header cell', () => {
        assert.match(renderHoleViewSrc, /querySelector\('\.fc-name'\)/,
            'Hole View must target the name element');
        assert.ok(!/const name = headCells\[i\] \? headCells\[i\]\.textContent\.trim\(\) : '';/
            .test(renderHoleViewSrc),
            'reading raw textContent would render every row as "LeeHCP 5"');
    });

    test('there is a data-attribute fallback if querySelector is unavailable', () => {
        assert.match(renderScorecardSrc, /data-player-name="\$\{escapeAttr\(first\)\}"/);
        assert.match(renderHoleViewSrc, /dataset\.playerName/);
    });

    test('Hole View copies the player cell VERBATIM, dots included', () => {
        assert.match(renderHoleViewSrc, /cells\[i\] \? cells\[i\]\.innerHTML : ''/,
            'the same HTML - which is why the two views cannot disagree about dots');
    });
});

// ============================================================================
describe('CHANGE 2 — FULL CARD DOTS ARE THE MATCH\u2019S DOTS', () => {

    const ps = twoVtwo([5, 12, 8, 17]);

    test('5 / 12 vs 8 / 17 prints 0 / SI 1-7 / SI 1-3 / SI 1-12', () => {
        const calc = match(ps);
        assert.deepEqual(dottedSIs(calc, ps[0]), [], 'Lee (5) is the baseline - no match dots');
        assert.deepEqual(dottedSIs(calc, ps[1]), [1, 2, 3, 4, 5, 6, 7], 'Jeremy (12) - SI 1-7');
        assert.deepEqual(dottedSIs(calc, ps[2]), [1, 2, 3], 'Dave (8) - SI 1-3');
        assert.deepEqual(dottedSIs(calc, ps[3]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'Jeff (17) - SI 1-12');
    });

    test('THE LOW GOLFER\u2019S PARTNER gets dots', () => {
        const calc = match(ps);
        assert.equal(ps[0].team, ps[1].team, 'Lee and Jeremy really are partners');
        assert.equal(calc.relHcpById['102'], 7);
        assert.equal(dottedSIs(calc, ps[1]).length, 7, 'the partner strokes on seven holes');
    });

    test('dots follow STROKE INDEX, not hole number', () => {
        const calc = match(ps);
        const holes = cd18.filter(h => cardDots(calc, ps[1], h.hcpIndex, 0) > 0).map(h => h.hole).sort((a, b) => a - b);
        assert.deepEqual(holes, cd18.filter(h => h.hcpIndex <= 7).map(h => h.hole).sort((a, b) => a - b));
        // The pair that only an SI-driven allocation can get right: a HIGH hole
        // number with a LOW index is in, a LOW hole number with a HIGH index is out.
        assert.ok(holes.includes(7), 'hole 7 is SI 1 - in');
        assert.ok(holes.includes(12), 'hole 12 is SI 3 - in, despite the high hole number');
        assert.ok(!holes.includes(2), 'hole 2 is SI 10 - out, despite the low hole number');
        assert.ok(!holes.includes(10), 'hole 10 is SI 18 - out');
    });

    test('when SI 1 is hole 7, the FIRST stroke is on hole 7', () => {
        assert.equal(holeOfSI(1), 7);
        const one = match([P(1, 'A', 5, 'Team 1'), P(2, 'B', 6, 'Team 2')]);
        const holes = cd18.filter(h => cardDots(one, { id: 2, hcp: '6' }, h.hcpIndex, 0) > 0).map(h => h.hole);
        assert.deepEqual(holes, [7]);
    });

    test('a >18 differential prints MULTIPLE dots', () => {
        const big = twoVtwo([4, 24, 10, 44]);
        const calc = match(big);
        assert.equal(calc.relHcpById['104'], 40);
        assert.equal(cardDots(calc, big[3], 1, 0), 3, 'three dots on SI 1-4');
        assert.equal(cardDots(calc, big[3], 5, 0), 2, 'two everywhere else');
        // The renderer repeats the bullet per stroke, so 3 strokes is a 3-char string.
        assert.match(renderScorecardSrc, /"\u2022"\.repeat\(dotStrokes\)/);
    });

    test('plus handicaps allocate correctly on the card', () => {
        const plus = twoVtwo(['+2', 3, 7, 10]);
        const calc = match(plus);
        assert.deepEqual(dottedSIs(calc, plus[0]), [], 'the +2 is the baseline');
        assert.deepEqual(dottedSIs(calc, plus[1]), [1, 2, 3, 4, 5]);
        assert.deepEqual(dottedSIs(calc, plus[3]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    test('player order does not change the dots', () => {
        const a = match(twoVtwo([5, 12, 8, 17]));
        const b = match(twoVtwo([12, 5, 17, 8], [102, 101, 104, 103]));
        assert.deepEqual(a.relHcpById, b.relHcpById);
    });

    test('team order does not change the dots', () => {
        const a = match(twoVtwo([5, 12, 8, 17]));
        const swapped = [P(103, 'Dave', 8, 'Team 1'), P(104, 'Jeff', 17, 'Team 1'),
                         P(101, 'Lee', 5, 'Team 2'), P(102, 'Jeremy', 12, 'Team 2')];
        assert.deepEqual(match(swapped).relHcpById, a.relHcpById);
    });

    test('every hole-by-hole match format drives the dots', () => {
        ['match', 'nassau', 'bestball', 'ryder'].forEach(f => {
            const calc = match(twoVtwo([5, 12, 8, 17]), f);
            assert.equal(calc.usesRelativeHandicap, true, f);
            assert.deepEqual(dottedSIs(calc, ps[1]), [1, 2, 3, 4, 5, 6, 7], f + ' partner dots');
        });
    });

    test('SCRAMBLE keeps ordinary course dots', () => {
        const calc = match(twoVtwo([5, 12, 8, 17]), 'scramble');
        assert.equal(calc.usesRelativeHandicap, false);
        const p = ps[1];
        assert.deepEqual(dottedSIs(calc, p),
            cd18.filter(h => E.getStrokes(h.hcpIndex, 12) > 0).map(h => h.hcpIndex).sort((a, b) => a - b),
            'a 12 shows its full course dots, SI 1-12');
    });

    test('the card reads the canonical table rather than recomputing it', () => {
        // SUPERSEDED NAME, SAME CONTRACT. This pinned `matchCalc` when the round
        // format was the only possible source of match strokes. The dot source is now
        // `dotContextCalc` - the round's own match, or a side match the golfer
        // explicitly selected. What the assertion is actually protecting is unchanged:
        // the table is READ off an engine result, never recomputed in the view layer.
        // SUPERSEDED SHAPE, SAME CONTRACT. The source is now a per-golfer plan built
        // from one or more engine results (Auto merges independent matches), but the
        // protected property is unchanged: allocations are READ off calculateMatchEngine
        // and never recomputed in the view layer.
        // buildDotPlan is a top-level helper, so this one is asserted against the file.
        assert.match(SRC, /const calc = dotCalcForSideMatch\(data, o\.sm, courseData\);/,
            'plans are built from engine results');
        assert.match(renderScorecardSrc, /return allocateMatchStrokes\(entry\.rel, hcpIndex\);/);
        assert.match(renderScorecardSrc, /if \(roundOwnsDots\) \{/,
            'a round-level match still takes priority over any selection');
    });
});

// ============================================================================
describe('CHANGE 3 — THE MATCH HANDICAP CONTEXT LINE', () => {

    test('the line renders only when a match drives the dots', () => {
        assert.match(renderScorecardSrc, /if \(inMatch\.length >= 2\)/,
            'a match needs at least two participants before the line means anything');
        assert.match(renderScorecardSrc, /matchNoteEl\.style\.display = "none"/,
            'otherwise it is hidden outright, costing no vertical space');
    });

    test('it names the baseline golfer and what everyone plays off', () => {
        assert.match(renderScorecardSrc, /<strong>MATCH HCP<\/strong>/);
        assert.match(renderScorecardSrc, /Low: \$\{lowLabel\}/);
        assert.match(renderScorecardSrc, /Playing: \$\{playing\}/);
        assert.match(renderScorecardSrc, /dotPlanById\[String\(p\.id\)\]\.rel === 0/,
            'the baseline is whoever plays off zero, read from the canonical plan');
    });

    test('the baseline label uses the GOLFER-FACING handicap', () => {
        assert.match(renderScorecardSrc, /formatHcpDisplay\(low\[0\]\.hcp\)/,
            'a plus-handicap baseline must read (+2), never (-2)');
    });

    test('TIED lowest golfers are both named, not arbitrarily picked', () => {
        const tied = twoVtwo([6, 14, 6, 19]);
        const calc = match(tied);
        const zeros = tied.filter(p => calc.relHcpById[String(p.id)] === 0).map(p => p.name);
        assert.deepEqual(zeros, ['Lee', 'Dave'], 'both play off zero');
        // The whole `low` list is mapped - not a slice of it, and not [0].
        assert.match(renderScorecardSrc, /low\.map\(firstName\)\.join\(" \/ "\)/,
            'every golfer playing off zero must be named');
        assert.ok(!/low\.slice\(/.test(renderScorecardSrc), 'the tied list must not be truncated');
        assert.ok(!/low\[0\]\.name/.test(renderScorecardSrc), 'and must not collapse to the first golfer');
    });

    test('it is a line, not a panel', () => {
        const css = SRC.slice(SRC.indexOf('.match-hcp-note {'), SRC.indexOf('.match-hcp-note {') + 320);
        assert.match(css, /font-size: 0\.68rem/);
        assert.ok(!/min-height/.test(css), 'no reserved block of vertical space');
        assert.ok(!/padding: \d\dpx/.test(css), 'no panel-sized padding');
    });

    test('it sits above the card, inside the Full Card container only', () => {
        const i = SRC.indexOf('id="full-card-container"');
        const j = SRC.indexOf('</table>', i);
        const block = SRC.slice(i, j);
        assert.match(block, /<div id="match-hcp-note"/, 'inside the Full Card wrapper');
        assert.ok(block.indexOf('match-hcp-note') < block.indexOf('<table'), 'above the table');
        const holeView = SRC.slice(SRC.indexOf('id="hole-view-container"'), i);
        assert.ok(!/match-hcp-note/.test(holeView), 'Hole View is untouched');
    });

    test('the expected line for 5 / 12 vs 8 / 17 reads as specified', () => {
        const calc = match(twoVtwo([5, 12, 8, 17]));
        const ps2 = twoVtwo([5, 12, 8, 17]);
        const low = ps2.filter(p => calc.relHcpById[String(p.id)] === 0);
        assert.deepEqual(low.map(p => p.name), ['Lee']);
        assert.equal(call('formatHcpDisplay("5")'), '5');
        const playing = ps2.map(p => p.name + ' ' + calc.relHcpById[String(p.id)]).join(' \u00B7 ');
        assert.equal(playing, 'Lee 0 \u00B7 Jeremy 7 \u00B7 Dave 3 \u00B7 Jeff 12');
    });
});

// ============================================================================
describe('CONTEXT SELECTION — WHICH MATCH OWNS THE DOTS', () => {

    test('a single main Match Play game is selected', () => {
        assert.match(renderScorecardSrc,
            /\['match', 'bestball', 'scramble', 'ryder', 'nassau'\]\.includes\(gameFormat\)/,
            'matchCalc is built from the ROUND format - one main game, deterministically');
    });

    test('AMBIGUOUS CONTEXT FALLS BACK TO COURSE DOTS, never a guess', () => {
        // A Stroke Play round carrying two match-play side matches. The Full Card
        // builds no matchCalc, so matchRelHcpById is null and the dots stay ordinary.
        const ps = twoVtwo([5, 12, 8, 17]);
        const d = {
            gameFormat: 'stroke', players: ps,
            sideMatches: {
                w1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['104'], stake: 10, startHole: 1, pressRule: 'none' },
                w2: { format: 'match', scoring: 'net', teamAIds: ['102'], teamBIds: ['103'], stake: 10, startHole: 1, pressRule: 'none' },
            },
        };
        const states = E.buildLiveMatchStates(d, cd18, level(ps), null);
        assert.equal(states.length, 2, 'two genuinely independent matches exist');
        // Neither is allowed to own the card.
        assert.equal(E.buildLiveMatchState({ gameFormat: 'stroke', players: ps }, cd18, level(ps)), null);
        assert.ok(!/sideMatches/.test(renderScorecardSrc.slice(0, renderScorecardSrc.indexOf('const headRow'))),
            'the dot context is never derived from the side-match list');
    });

    test('TWO SIMULTANEOUS MATCHES DO NOT SHARE AN ALLOCATION', () => {
        const A = P(1, 'A', 10, 'Team 1');
        const vsB = match([A, P(2, 'B', 20, 'Team 2')]);
        const vsC = match([Object.assign({}, A), P(3, 'C', 5, 'Team 2')]);
        assert.equal(vsB.relHcpById['1'], 0, 'against the 20, A is the baseline');
        assert.equal(vsC.relHcpById['1'], 5, 'against the 5, A receives 5');
        assert.notEqual(vsB.relHcpById['1'], vsC.relHcpById['1'],
            'there is no single universal dot set for A - which is why the card refuses to guess');
    });

    test('a golfer OUTSIDE the match keeps ordinary course dots', () => {
        const ps = twoVtwo([5, 12, 8, 17]);
        const outsider = P(999, 'Sam', 20, 'Team 2');
        const calc = match(ps);
        assert.equal(calc.relHcpById['999'], undefined);
        // dotStrokesFor falls through to the course strokes it was handed.
        assert.equal(cardDots(calc, outsider, 1, E.getStrokes(1, 20)), 2,
            'Sam still shows his own two dots at SI 1');
        assert.match(renderScorecardSrc, /if \(!entry\) return courseStrokes;/);
    });

    test('PRESSES DO NOT CREATE A SECOND DOT CONTEXT', () => {
        const ps = twoVtwo([5, 12, 8, 17]);
        const noPress = match(ps);
        const presses = [{ segment: '18', baseId: '18', fromHole: 10 },
                         { segment: '18', baseId: '18', fromHole: 13 },
                         { segment: '18', baseId: '18', fromHole: 16 }];
        const withPresses = JSON.parse(JSON.stringify(E.calculateMatchEngine(
            ps, cd18, level(ps), 'net', 'match', 'manual', 20, 0, presses)));
        assert.deepEqual(withPresses.relHcpById, noPress.relHcpById,
            'three presses, still one parent allocation and one set of dots');
        assert.equal(withPresses.matchBaseline, noPress.matchBaseline);
    });

    test('the Full Card NEVER mutates a stored handicap', () => {
        const ps = twoVtwo([5, 12, 8, 17]);
        const before = ps.map(p => p.hcp);
        match(ps); match(ps, 'nassau');
        assert.deepEqual(ps.map(p => p.hcp), before);
        assert.deepEqual(before, ['5', '12', '8', '17']);
        assert.ok(!/\.hcp\s*=/.test(renderScorecardSrc), 'renderScorecard assigns no handicap');
    });
});

// ============================================================================
describe('ROUND PERFORMANCE IS UNCHANGED', () => {

    test('the score shown is still GROSS', () => {
        assert.match(renderScorecardSrc, /let gross = parseInt\(scoreVal, 10\);/);
        assert.match(renderScorecardSrc, /value="\$\{scoreVal\}"/, 'the input holds the raw gross score');
    });

    test('NET uses the course allocation, not the match dots', () => {
        assert.match(renderScorecardSrc, /const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(renderScorecardSrc, /let net = gross - strokes;/);
        assert.ok(!/let net = gross - dotStrokes;/.test(renderScorecardSrc),
            'net must never switch to match strokes');
    });

    test('NET-TO-PAR uses the course allocation', () => {
        assert.match(renderScorecardSrc, /let scoreToUse = scoringType === 'net' \? net : gross;/);
        assert.match(renderScorecardSrc, /runningStats\[p\.id\] \+= diff;/);
        const between = renderScorecardSrc.slice(
            renderScorecardSrc.indexOf('let net = gross - strokes;'),
            renderScorecardSrc.indexOf('runningStats[p.id] += diff;'));
        assert.ok(!/dotStrokes/.test(between), 'the to-par chain never touches match strokes');
    });

    test('OUT / IN / TOTAL net use the course allocation', () => {
        const totals = renderScorecardSrc.slice(renderScorecardSrc.indexOf('let hasFront = courseData.some'));
        const netLines = totals.split('\n').filter(l => /getStrokes\(/.test(l));
        assert.ok(netLines.length > 0, 'the totals really do compute net');
        netLines.forEach(l => assert.ok(!/dotStrokes/.test(l),
            'a section total was computed from match strokes: ' + l.trim()));
    });

    test('dotStrokes is used for the DOTS AND NOTHING ELSE', () => {
        const uses = renderScorecardSrc.split('\n').filter(l => /\bdotStrokes\b/.test(l));
        assert.equal(uses.length, 2, 'exactly two references: the assignment and the dot string');
        assert.match(uses[0], /const dotStrokes = dotStrokesFor\(p, h\.hcpIndex, strokes, h\.hole\);/);
        assert.match(uses[1], /handicapDots = dotStrokes > 0/);
    });

    test('ordinary Stroke Play handicap allocation is untouched', () => {
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1);
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(1, 20), 2);
        assert.equal(E.getStrokes(18, -2), -1, 'the plus-handicap giveback survives');
    });

    test('a Stroke Play round shows ordinary dots and no context line', () => {
        const ps = twoVtwo([5, 12, 8, 17]);
        assert.equal(E.buildLiveMatchState({ gameFormat: 'stroke', players: ps }, cd18, level(ps)), null,
            'no match, so matchCalc is null');
        // matchRelHcpById null -> dotStrokesFor returns the course strokes unchanged.
        assert.equal(cardDots(null, ps[1], 12, E.getStrokes(12, 12)), 1,
            'a 12 still shows a dot at SI 12');
        assert.match(renderScorecardSrc, /if \(!dotPlanById\) return courseStrokes;/);
    });

    test('the leaderboard\u2019s own net calculation was not touched', () => {
        const lb = read('leaderboard.html');
        assert.ok(!/dotStrokes|dotPlanById|allocateMatchStrokes/.test(lb),
            'leaderboard.html must not have acquired match-dot logic');
        assert.match(lb, /getStrokes\(hole\.hcpIndex, parseHcp\(p\.hcp\)\)/,
            'it still nets off the ordinary course allocation');
    });
});
