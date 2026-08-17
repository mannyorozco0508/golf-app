const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SM = loadJsFile('score-marks.js');
const PAGE = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

describe('SCORE MARKS — gross score against par, nothing else', () => {
    test('the spec examples, exactly', () => {
        assert.equal(SM.scoreMark(3, 4), 'birdie', 'par 4, score 3');
        assert.equal(SM.scoreMark(4, 5), 'birdie', 'par 5, score 4');
        assert.equal(SM.scoreMark(3, 5), 'eagle', 'par 5, score 3');
        assert.equal(SM.scoreMark(1, 3), 'eagle', 'par 3, hole in one');
    });

    test('par, bogey and worse get nothing', () => {
        assert.equal(SM.scoreMark(4, 4), '');
        assert.equal(SM.scoreMark(5, 4), '');
        assert.equal(SM.scoreMark(9, 4), '');
    });

    test('albatross and better still count as eagle-or-better', () => {
        assert.equal(SM.scoreMark(2, 5), 'eagle');
        assert.equal(SM.scoreMark(1, 5), 'eagle');
        assert.equal(SM.scoreMark(1, 4), 'eagle');
    });

    test('REGRESSION: blanks, zeros and placeholders are never marked', () => {
        // Circling an empty cell on a card someone is still filling in would be worse
        // than useless.
        ['', null, undefined, 0, '0', '\u2013'].forEach(v =>
            assert.equal(SM.scoreMark(v, 4), '', `"${v}" should not be marked`));
    });

    test('a missing or zero par is never marked', () => {
        [0, '', null, undefined].forEach(p =>
            assert.equal(SM.scoreMark(3, p), '', 'no par means no judgement'));
    });

    test('string scores work, since inputs hand back strings', () => {
        assert.equal(SM.scoreMark('3', '4'), 'birdie');
        assert.equal(SM.scoreMark('3', '5'), 'eagle');
    });

    test('it is GROSS only — handicap never enters into it', () => {
        // A stroke makes a hole worth more in a net game; it does not turn a 4 on a par 4
        // into a birdie. The Birdie Game settles on gross and these circles read it.
        const s = read('score-marks.js');
        assert.ok(!/handicap|getStrokes|parseHcp|net/i.test(s.replace(/^\s*\/\/.*$/gm, '')),
            'the classifier must not know about handicaps');
    });

    test('it changes no money — it reads two numbers', () => {
        const s = read('score-marks.js');
        ['db.ref', 'computeCombined', 'calculateBirdie', 'simplifyDebts'].forEach(t =>
            assert.ok(!s.includes(t), `${t} must not appear in a display helper`));
    });

    test('the class name is shared, so one CSS change lands in both cards', () => {
        assert.equal(SM.scoreMarkClass(3, 4), ' mark-birdie');
        assert.equal(SM.scoreMarkClass(3, 5), ' mark-eagle');
        assert.equal(SM.scoreMarkClass(4, 4), '');
    });
});

// ---------------------------------------------------------------------------
// The point of the whole batch: both scorecards must mark the SAME holes.
// ---------------------------------------------------------------------------
function fixture() {
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'Jose', 'Manny', 'Ryan'], [0, 4, 12, 20]);
    // Jose sits out the group games entirely - his birdies must still be circled.
    p[1].playingForMoney = false;
    const scores = {};
    cd.forEach((h, i) => p.forEach((pl, pi) => {
        let v = h.par;
        if (pi === 0 && i % 4 === 0) v = h.par - 1;        // Marty: birdies
        if (pi === 0 && i === 8) v = h.par - 2;            // Marty: an eagle
        if (pi === 1 && i % 5 === 0) v = h.par - 1;        // Jose: birdies, not in the pool
        if (pi === 2 && i % 3 === 0) v = h.par + 2;        // Manny: blow-ups
        if (pi === 3 && i === 2) v = 1;                    // Ryan: hole in one
        if (pi === 3 && i === 5) v = null;                 // Ryan: a blank hole
        if (v !== null) scores[`p${pl.id}_h${h.hole}`] = v;
    }));
    return { cd, p, scores };
}

// Every (player, hole) the shared classifier says should be marked.
function expectedMarks(cd, p, scores) {
    const out = [];
    cd.forEach(h => p.forEach(pl => {
        const m = SM.scoreMark(scores[`p${pl.id}_h${h.hole}`], h.par);
        if (m) out.push(`${pl.name}:${h.hole}:${m}`);
    }));
    return out.sort();
}

// What the RECEIPT scorecard actually renders.
//
// Parses each player row's <td> list: the first cell is the name, rt-sec cells are
// OUT/IN/TOTAL, and everything else is a hole score in course order.
function receiptMarks(cd, p, scores) {
    const sb = loadHtmlInlineScript('settlement.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    vm.runInContext(`currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores })};` +
        `window.__out = buildReceiptScorecard();`, sb);
    const html = sb.window.__out;
    const found = [];

    html.split('<tr>').slice(1).forEach(row => {
        const nameM = /class="rt-name">([^<]+)</.exec(row);
        if (!nameM || /HOLE|PAR/.test(nameM[1])) return;
        const name = nameM[1];

        const cells = row.match(/<td[^>]*>[^<]*<\/td>/g) || [];
        let holeIdx = 0;
        cells.forEach(cell => {
            if (/rt-name/.test(cell)) return;      // the player's name
            if (/rt-sec/.test(cell)) return;       // OUT / IN / TOTAL
            const hole = cd[holeIdx];
            holeIdx++;
            const mk = /mark-(birdie|eagle)/.exec(cell);
            if (mk && hole) found.push(`${name}:${hole.hole}:${mk[1]}`);
        });
    });
    return { html, found: found.sort() };
}

describe('BOTH SCORECARDS MARK THE SAME HOLES', () => {
    const { cd, p, scores } = fixture();
    const expected = expectedMarks(cd, p, scores);

    test('the fixture genuinely produces birdies AND eagles', () => {
        assert.ok(expected.some(x => /birdie/.test(x)), 'no birdies to test');
        assert.ok(expected.some(x => /eagle/.test(x)), 'no eagles to test');
    });

    test('REGRESSION: the Receipt marks exactly the expected holes', () => {
        assert.deepEqual(receiptMarks(cd, p, scores).found, expected);
    });

    test('the live Full Scorecard asks the SAME classifier the same question', () => {
        // renderScorecard() needs more real DOM than this harness provides, so the live
        // card cannot be rendered here. The parity guarantee is structural instead, and
        // it is a strong one: both pages call scoreMarkClass(grossScore, par) and neither
        // has a rule of its own, so they cannot mark different holes.
        const idx = read('index.html');
        assert.ok(/scoreMarkClass\(scoreVal, h\.par\)/.test(idx),
            'the live card must classify gross score against hole par');
        const st = read('settlement.html');
        assert.ok(/scoreMarkClass\(score, par\)/.test(st),
            'the Receipt must ask the same question');
    });

    test('both pass GROSS score and hole par — neither passes a net figure', () => {
        const idx = read('index.html');
        const call = /scoreMarkClass\(([^)]*)\)/.exec(idx)[1];
        assert.ok(!/net|Net/.test(call), `live card passes "${call}"`);
        const st = read('settlement.html');
        const stCall = /scoreMarkClass\(([^)]*)\)/.exec(st)[1];
        assert.ok(!/net|Net/.test(stCall), `Receipt passes "${stCall}"`);
    });

    test('both pages load the one shared classifier', () => {
        ['index.html', 'settlement.html'].forEach(f => {
            assert.ok(read(f).includes('<script src="score-marks.js"></script>'), `${f} does not load it`);
        });
    });

    test('neither page reimplements the rule', () => {
        ['index.html', 'settlement.html'].forEach(f => {
            const code = read(f).replace(/<!--[\s\S]*?-->/g, '').split('\n')
                .filter(l => !l.trim().startsWith('//')).join('\n');
            assert.ok(!/function scoreMark/.test(code), `${f} has its own copy`);
            assert.ok(/scoreMarkClass\(/.test(code), `${f} must call the shared one`);
        });
    });
});

describe('WHAT MUST NOT BE MARKED', () => {
    const { cd, p, scores } = fixture();

    test('the PAR row is never marked', () => {
        const html = receiptMarks(cd, p, scores).html;
        const parRow = html.split('<tr>').find(r => /rt-name">PAR/.test(r));
        assert.ok(parRow && !/mark-/.test(parRow), 'the par row got a circle');
    });

    test('the HOLE row is never marked', () => {
        const html = receiptMarks(cd, p, scores).html;
        const holeRow = html.split('<tr>').find(r => /rt-name">HOLE/.test(r));
        assert.ok(holeRow && !/mark-/.test(holeRow));
    });

    test('OUT, IN and TOTAL are never marked', () => {
        const html = receiptMarks(cd, p, scores).html;
        const secCells = html.match(/<td class="rt-sec">[^<]*<\/td>/g) || [];
        assert.ok(secCells.length > 0, 'the fixture should have section totals');
        secCells.forEach(c => assert.ok(!/mark-/.test(c), 'a total was circled'));
    });

    test('a blank hole is never marked', () => {
        // Ryan has no score on hole 6.
        const html = receiptMarks(cd, p, scores).html;
        assert.ok(!/<td class="mark-[a-z]+">\u2013<\/td>/.test(html), 'a placeholder was circled');
    });
});

describe('EVERY GOLFER IS MARKED', () => {
    const { cd, p, scores } = fixture();

    test('REGRESSION: a golfer sitting out the group games still gets circles', () => {
        // Jose has playingForMoney false. The circles are a reading aid for the card,
        // not a statement about who is in the Birdie Game.
        assert.equal(p[1].playingForMoney, false, 'precondition');
        const found = receiptMarks(cd, p, scores).found;
        assert.ok(found.some(f => f.startsWith('Jose:')), 'Jose was skipped');
    });

    test('a high-handicap golfer is judged on GROSS, not net', () => {
        // Ryan plays off 20 and holes out on a par 3 - an eagle by any reading. If net
        // score were used his other holes would light up too, which is not what a birdie
        // circle means.
        const found = receiptMarks(cd, p, scores).found;
        assert.ok(found.some(f => /^Ryan:\d+:eagle$/.test(f)), 'the hole in one was missed');
        assert.ok(!found.some(f => /^Ryan:\d+:birdie$/.test(f)), 'net scoring leaked in');
    });
});

describe('PRESENTATION', () => {
    const idx = read('index.html');
    const st = read('settlement.html');

    test('a thin ring, not a filled badge — the score stays readable', () => {
        [idx, st].forEach(src => {
            assert.ok(/mark-birdie \{ box-shadow: inset 0 0 0 2px|mark-birdie,[\s\S]{0,200}box-shadow: inset/.test(src),
                'the ring should be an inset shadow');
            assert.ok(!/mark-birdie[\s\S]{0,120}background: var\(--accent-red\)/.test(src),
                'a filled badge would bury the number');
        });
    });

    test('box-shadow keeps the cell the same size, so rows stay compact', () => {
        // A border would change layout on every marked cell and shift the whole row.
        assert.ok(!/mark-birdie \{[^}]*border: /.test(idx));
        assert.ok(!/mark-birdie \{[^}]*border: /.test(st));
    });

    test('red is birdie and green is eagle, on both pages', () => {
        [idx, st].forEach(src => {
            const birdie = /mark-birdie[^}]*\{[^}]*(--accent-red|#c1121f)/.test(src);
            const eagle = /mark-eagle[^}]*\{[^}]*(--brand-green|#0f4c3a)/.test(src);
            assert.ok(birdie, 'birdie must be red');
            assert.ok(eagle, 'eagle must be green');
        });
    });

    test('REGRESSION: the rings survive Save as PDF', () => {
        // Browsers strip box-shadows when printing unless explicitly told not to, and the
        // PDF is exactly where a golfer wants to scan for birdies.
        [idx, st].forEach(src => {
            assert.ok(/print-color-adjust: exact/.test(src), 'colour adjustment not forced');
            const printBlocks = src.match(/@media print \{[\s\S]*?\n\s*\}/g) || [];
            assert.ok(printBlocks.some(b => /mark-birdie/.test(b)), 'no print rule for the rings');
        });
    });

    test('the Receipt carries a legend', () => {
        assert.ok(/receipt-legend/.test(st));
        assert.ok(/> Birdie/.test(st));
        assert.ok(/Eagle or better/.test(st));
    });

    test('the existing print hiding rules still work', () => {
        assert.ok(/@media print \{ \.action-center \{ display: none !important; \} \}/.test(idx));
    });
});

describe('NOTHING ELSE CHANGED', () => {
    test('Birdie Game math, settlement and handicaps are untouched', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js', 'hole-events.js']
            .forEach(f => assert.ok(!/scoreMark/.test(read(f)), `${f} was modified`));
    });

    test('score entry still saves normally', () => {
        const idx = read('index.html');
        assert.ok(/onchange="saveScore\(/.test(idx), 'the input lost its save handler');
        assert.ok(/oninput="handleScoreInput\(/.test(idx));
    });

    test('the mark is applied to the wrapper, never to the input itself', () => {
        // Touching the input's own classes would risk the iOS double-tap fix and the
        // disabled-state styling.
        const idx = read('index.html');
        assert.ok(/score-input-wrapper\$\{markClass\}/.test(idx));
        assert.ok(!/class="score-input \$\{markClass\}/.test(idx));
    });

    test('group locking on the input is unaffected', () => {
        const idx = read('index.html');
        assert.ok(idx.includes('const isLocked = isMultiGroupRound && (!hasGroupLock || playerGroupMap[p.id] !== lockedGroup);'));
    });
});

describe('OFFLINE', () => {
    test('REGRESSION: the shared classifier is precached', () => {
        // Both scorecards load it. Without it in the shell, a first offline launch at a
        // remote course renders no circles - or worse, throws.
        const sw = read('sw.js');
        assert.ok(sw.includes("'./score-marks.js'"), 'score-marks.js is not in the shell');
    });

    test('the cache key moved, so devices pick up the new shell', () => {
        assert.ok(!/golfapp-v2-scorecard-cleanup/.test(read('sw.js')));
    });
});
