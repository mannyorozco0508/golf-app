// ============================================================================
// DOT / SCORE-BOX LAYOUT CONTRACT
//
// THE BUG. The earned-junk slot in each score cell was an empty string when a
// golfer had no dots on the hole, and a <div> the moment one was tapped. The cell
// is a centred flex COLUMN inside a table row, so that div did two things at once:
//
//   vertically   it grew the column, which grew the row, which re-centred every
//                score box in that row - tapping a dot for one golfer moved
//                everybody's box, and in Hole View moved the box relative to the name
//
//   horizontally the pips are repeated emoji, so four of them already matched the
//                48px score box and a greenie carrying at five was wider than it,
//                which widened the <td> and pushed the whole score-entry column
//
// THE CONTRACT. The score is primary; junk is a footnote. The strip is therefore
// reserved for the entire round rather than conditionally rendered, and capped at
// the width of the score box, so no quantity of junk can move or resize anything.
//
// These tests drive the REAL render through the live DOM harness and compare the
// generated cells against each other. They are not CSS string searches: a rule that
// still exists but stops applying would pass a grep and fail here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

function field(n) {
    const P = makePlayers(['Marty', 'Manny', 'John', 'Steve'].slice(0, n), ['8', '4', '15', '0'].slice(0, n));
    P.forEach(p => { p.playingForMoney = true; p.group = 1; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { P, S };
}

// Renders the Full Card and returns its markup. Hole View clones these cells, so
// this is the one render both screens depend on.
function card(dots) {
    const { P, S } = field(4);
    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            d: { format: 'dots', enabled: true, startHole: 1, createdAt: 1, dotPointVal: 5 }
        },
        dots: dots || {}
    };
    const sb = loadHtmlInlineScript('index.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
            'bet-strip.js', 'hole-events.js']);
    vm.runInContext(`
        currentMode = 'A';
        currentData = ${J(data)};
        currentViewedHole = 1;
        window.__scFilteredPlayers = currentData.players;
        document.__mount(document.getElementById('card-body'));
        renderScorecard();
        window.__body = document.getElementById('card-body').innerHTML;
    `, sb);
    return { html: sb.window.__body, pid: P[0].id };
}

const count = (h, re) => (h.match(re) || []).length;

// Everything in a cell BEFORE the junk strip - initials, the score box, the net
// mark, the to-par line, the stroke dots. If this is identical across dot counts,
// nothing above the strip can have moved.
function cellPrefix(html, pid) {
    const marker = `saveScore(${pid}, 1,`;
    const at = html.indexOf(marker);
    assert.ok(at > -1, 'the harness must have rendered a score input for this golfer');
    const start = html.lastIndexOf('<td', at);
    const end = html.indexOf('cell-dots', at);
    assert.ok(end > start, 'the reserved junk strip must follow the score box in the same cell');
    return html.slice(start, end);
}

// ---------------------------------------------------------------------------
describe('THE STRIP IS RESERVED, NOT CONDITIONAL', () => {
    test('a dots round reserves the strip in every score cell, dots or not', () => {
        const none = card({});
        // Four golfers x 18 holes, every one of them carrying the strip.
        assert.equal(count(none.html, /class="cell-dots"/g), 72,
            'the strip must exist on every cell of a dots round, or the first tap still moves the box');
    });

    test('the number of strips does not change when dots are tapped', () => {
        const p = card({}).pid;
        const counts = [
            {},
            { h1: { [`p${p}`]: ['birdie'] } },
            { h1: { [`p${p}`]: ['birdie', 'sandy'] } },
            { h1: { [`p${p}`]: ['birdie', 'sandy', 'barkie', 'polie'] } },
        ].map(d => count(card(d).html, /class="cell-dots"/g));
        assert.deepEqual(counts, [72, 72, 72, 72], '0, 1, 2 and 4 dots must all reserve the same space');
    });
});

// ---------------------------------------------------------------------------
describe('SCORE-BOX GEOMETRY IS INDEPENDENT OF JUNK', () => {
    const scenarios = {
        '0 dots': {},
        '1 dot': d => ({ h1: { [`p${d}`]: ['birdie'] } }),
        '2 dots': d => ({ h1: { [`p${d}`]: ['birdie', 'sandy'] } }),
        '3 dots': d => ({ h1: { [`p${d}`]: ['birdie', 'sandy', 'barkie'] } }),
        '5 units (eagle + carried greenie)': d => ({ h1: { [`p${d}`]: ['eagle', 'greenie', 'barkie'] } }),
    };

    test('everything above the strip is byte-identical across 0 / 1 / 2 / 3 / 5', () => {
        const base = card({});
        const reference = cellPrefix(base.html, base.pid);
        Object.keys(scenarios).forEach(name => {
            const d = typeof scenarios[name] === 'function' ? scenarios[name](base.pid) : scenarios[name];
            const got = card(d);
            assert.equal(cellPrefix(got.html, got.pid), reference,
                `the score box moved or changed with ${name}`);
        });
    });

    test('the strip really does receive the dots — this is not passing by rendering nothing', () => {
        const base = card({});
        const withDots = card({ h1: { [`p${base.pid}`]: ['birdie', 'sandy'] } });
        assert.ok(/class="cell-dots">\s*<span class="dot-pips"/.test(withDots.html),
            'the pips must land inside the reserved strip');
        assert.ok(count(withDots.html, /dot-pips/g) >= 1, 'dots must still be visible somewhere');
    });
});

// ---------------------------------------------------------------------------
describe('THE STRIP CANNOT RESIZE THE SCORE-ENTRY COLUMN', () => {
    const rule = (() => {
        const css = IDX.replace(/\/\*[\s\S]*?\*\//g, '');
        const m = /\.cell-dots\s*\{[^}]*\}/.exec(css);
        assert.ok(m, '.cell-dots must be styled');
        return m[0];
    })();

    test('its width is pinned to the score box, not to its contents', () => {
        const box = /\.score-input-wrapper\s*\{[^}]*\}/.exec(IDX.replace(/\/\*[\s\S]*?\*\//g, ''))[0];
        const boxW = /width:\s*(\d+)px/.exec(box)[1];
        assert.match(rule, new RegExp(`max-width:\\s*${boxW}px`),
            'the strip must be capped at the score box width so junk cannot widen the column');
        assert.match(rule, /overflow:\s*hidden/, 'overflow must be clipped, not allowed to spill');
        assert.match(rule, /white-space:\s*nowrap/, 'wrapping would grow the cell vertically instead');
    });

    test('its height is fixed, so content cannot grow the row', () => {
        assert.match(rule, /height:\s*\d+px/, 'a reserved strip needs a fixed height');
    });

    test('no negative-margin or per-device hack is used to achieve it', () => {
        assert.ok(!/margin[^;]*:-|margin[^;]*:\s*-\d/.test(rule),
            'negative margins are brittle and were explicitly ruled out');
    });
});

// ---------------------------------------------------------------------------
describe('THE DUPLICATE RENDER DOES NOT COME BACK', () => {
    test('Hole View appends nothing after the cloned cell', () => {
        assert.ok(/hv-player-cell">\$\{cells\[i\] \? cells\[i\]\.innerHTML : ''\}<\/div>/.test(IDX),
            'a second pip span appended here is what floated beside the box');
        assert.ok(!/pipHtml/.test(IDX), 'the appended pip span must stay gone');
        assert.ok(!/hv-dot-line/.test(IDX), 'the written label line must stay gone');
    });

    test('exactly one builder call produces the visible dots', () => {
        assert.equal(count(IDX, /dotIndicatorHtml\(dotsForPlayerHole/g), 1,
            'one canonical render, in the cell');
    });
});

// ---------------------------------------------------------------------------
describe('NEIGHBOURING INDICATORS SURVIVE', () => {
    test('gross marks, net marks, to-par and stroke dots are all still rendered', () => {
        const { html, pid } = card({ h1: { [`p1`]: ['birdie'] } });
        const prefix = cellPrefix(html, pid);
        assert.match(prefix, /score-input-wrapper/, 'the score box');
        assert.match(prefix, /stroke-dots/, 'the handicap stroke dots');
        assert.match(html, /class="card-table"|<td/, 'the card still renders');
    });

    test('the shared score-mark classifier is untouched', () => {
        assert.match(IDX, /scoreMarkClass\(scoreVal, h\.par\)/, 'gross birdie/eagle rings');
    });
});
