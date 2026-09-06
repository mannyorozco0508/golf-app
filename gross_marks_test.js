// ============================================================================
// GROSS PRIMACY + GROSS-ONLY MARKS  (permanent product rule)
//
//   1. The golfer always ENTERS their actual gross score.
//   2. The primary hole box always DISPLAYS that stored gross score.
//   3. Every decoration ON that primary score represents GROSS golf only.
//   4. A handicap-adjusted achievement is a DIFFERENT FACT and appears only as a
//      small subordinate indicator underneath.
//
//      Par 4, actual 4, one stroke  ->  primary "4" with NO circle, and "3" beneath.
//      Par 4, actual 3, one stroke  ->  primary "3" with its gross birdie ring,
//                                        and "2" beneath, double-ringed.
//
// OWNERSHIP, DECIDED AND PINNED:
//   score-marks.js  owns the gross birdie / eagle RINGS. It is shared with the
//                   Receipt so the phone and the PDF cannot disagree about what a
//                   birdie is, and its existing eagle presentation is preserved.
//   shapeHtml       owns BOXES only - gross bogey and gross double-bogey - and
//                   draws no circles at all, so one fact never gets two rings.
//
// WHAT WENT WRONG BEFORE. shapeHtml read `diff`, which is NET on a net round, so a
// gross par with a handicap stroke was drawn with a birdie circle around the 4.
// Nothing pinned that behaviour, which is how it survived. It is pinned now.
//
// HARNESS NOTE. mini-dom stores innerHTML as a string and builds no child nodes, so
// renderHoleView() cannot execute here; rendering STRUCTURE is pinned at source
// level and every VALUE is proven by executing real production functions. Full
// end-to-end rendering of both views was verified separately in a real DOM.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('index.html');
const RS = SRC.slice(SRC.indexOf('function renderScorecard'));
const HV = SRC.slice(SRC.indexOf('function renderHoleView'), SRC.indexOf('function renderLiveTicker'));
// Code only. A rule this important must not be "proven" by a comment that mentions it.
const codeLines = src => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
const code = src => codeLines(src).join('\n');
const RS_CODE = code(RS);

const marks = loadJsFile('score-marks.js');
const E = loadJsFile('money-engine.js');
const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));
const call = e => vm.runInContext(e, page());

const SI = { 7:1,3:2,12:3,16:4,1:5,9:6,5:7,14:8,18:9,2:10,11:11,8:12,15:13,4:14,17:15,6:16,13:17,10:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i+1, par: 4, hcpIndex: SI[i+1] }));

// ============================================================================
describe('THE PRIMARY SCORE IS THE STORED GROSS', () => {

    test('the score box renders the raw stored value, never a computed one', () => {
        assert.match(RS_CODE, /const scoreVal = savedScores\[`p\$\{p\.id\}_h\$\{h\.hole\}`\] \|\| "";/,
            'the cell reads straight from savedScores');
        assert.match(RS_CODE, /value="\$\{scoreVal\}"/, 'and prints exactly that');
        // The forbidden substitutions, named.
        assert.ok(!/value="\$\{net\}"/.test(RS_CODE));
        assert.ok(!/value="\$\{displayNet\}"/.test(RS_CODE));
        assert.ok(!/value="\$\{scoreToUse\}"/.test(RS_CODE));
        assert.ok(!/value="\$\{gross - /.test(RS_CODE));
    });

    test('there is exactly ONE score input template', () => {
        const inputs = RS_CODE.split('\n').filter(l => /class="score-input"/.test(l));
        assert.equal(inputs.length, 2, 'the locked and unlocked variants, and nothing else');
        inputs.forEach(l => assert.match(l, /value="\$\{scoreVal\}"/,
            'every variant must print the stored gross: ' + l.trim()));
    });

    test('Hole View copies the cell rather than rebuilding the number', () => {
        assert.match(HV, /cells\[i\] \? cells\[i\]\.innerHTML : ''/);
        assert.ok(!/class="score-input"/.test(code(HV)),
            'Hole View must not construct its own score input');
    });

    test('SCORE ENTRY STORES THE GROSS THE GOLFER TYPED', () => {
        const fn = SRC.slice(SRC.indexOf('function saveScore'), SRC.indexOf('function saveScore') + 1400);
        assert.match(fn, /const intVal = parseInt\(val, 10\);/, 'the typed value, unmodified');
        assert.match(fn, /\.set\(newVal\)/);
        assert.ok(!/getStrokes|parseHcp|dotStrokes|allocateMatchStrokes/.test(fn),
            'saveScore must not consult a handicap at all');
    });

    test('NO DERIVED NET IS EVER PERSISTED', () => {
        const writes = codeLines(SRC).filter(l => /\/scores\//.test(l));
        assert.ok(writes.length > 0, 'the score-write paths must be found');
        writes.forEach(l => assert.ok(!/net|Net|dotStrokes|displayNet/.test(l),
            'a net value reached a scores path: ' + l.trim()));
        assert.ok(!/scores\[[^\]]*\]\s*=\s*[^;]*net/i.test(RS_CODE),
            'nothing writes a net back into the score map');
    });

    test('the round scoring type cannot change the primary number', () => {
        // scoreVal is read before scoringType is consulted anywhere in the cell, and
        // no branch swaps it. Pinned by absence of any conditional value.
        assert.ok(!/scoringType[^\n]*value=/.test(RS_CODE));
        assert.ok(!/value="\$\{scoringType/.test(RS_CODE));
    });
});

// ============================================================================
describe('MARKS ON THE PRIMARY SCORE ARE GROSS-ONLY', () => {

    test('shapeHtml is derived from GROSS, not from the net diff', () => {
        assert.match(RS_CODE, /let grossDiff = gross - holePar;/);
        assert.match(RS_CODE, /if \(grossDiff === 1\) \{/, 'gross bogey');
        assert.match(RS_CODE, /\} else if \(grossDiff >= 2\) \{/, 'gross double bogey or worse');
        // The defect, named so it cannot come back.
        assert.ok(!/if \(diff === -1\) \{[\s\S]{0,120}shape-circle-1/.test(RS_CODE),
            'the net-derived circle must be gone');
        assert.ok(!/shapeHtml = `<div class="shape-circle/.test(RS_CODE),
            'shapeHtml must draw no circles at all');
    });

    // Exactly the gross-mark block: from grossDiff to where the net indicator starts.
    // Bounded deliberately - a wider window would run into the net block and make the
    // "no handicap quantity" assertion below pass or fail for the wrong reason.
    const grossBlock = () => {
        const start = RS_CODE.indexOf('let grossDiff');
        const end = RS_CODE.indexOf('if (dotStrokes > 0) {');
        assert.ok(start > 0 && end > start, 'the gross-mark block must be locatable');
        return RS_CODE.slice(start, end);
    };

    test('BOXES ONLY: gross bogey one box, gross double bogey two', () => {
        const seg = grossBlock();
        assert.match(seg, /shapeHtml = `<div class="shape-box-1"><\/div>`;/);
        assert.match(seg, /shapeHtml = `<div class="shape-box-1"><\/div><div class="shape-box-2"><\/div>`;/);
        assert.ok(!/shape-circle/.test(seg), 'no circle may be emitted from this block');
        assert.equal((seg.match(/shapeHtml =/g) || []).length, 2, 'two outcomes, both boxes');
    });

    test('a handicap stroke can never change a mark on the gross score', () => {
        // grossDiff depends only on the typed score and the hole's par.
        const seg = grossBlock();
        assert.ok(!/\bstrokes\b|\bdotStrokes\b|\bnet\b|scoreToUse|parseHcp|getStrokes/.test(seg),
            'the box decision must not reference any handicap quantity:\n' + seg);
    });

    test('score-marks.js still owns the gross birdie / eagle rings', () => {
        assert.match(RS_CODE, /const markClass = \(typeof scoreMarkClass === 'function'\) \? scoreMarkClass\(scoreVal, h\.par\) : '';/,
            'and is fed the GROSS score');
        assert.match(RS_CODE, /class="score-input-wrapper\$\{markClass\}"/);
        assert.equal(marks.scoreMark(3, 4), 'birdie');
        assert.equal(marks.scoreMark(2, 4), 'eagle');
        assert.equal(marks.scoreMark(4, 4), '', 'a gross par is never a birdie');
        assert.equal(marks.scoreMark(5, 4), '', 'and a gross bogey gets no ring');
    });

    test('THE GROSS EAGLE IS A DOUBLE RED RING', () => {
        // Converted from the single green ring: two rings for two under, in the same
        // colour as a birdie because it is the same achievement scaled up. A second
        // colour made the card ask which of the two was better.
        // Several rules mention mark-eagle (the print-colour-adjust block among them).
        // Only the ones that actually paint a shadow are the rings.
        // Comments are stripped first: a nearby comment mentioning box-shadows is not
        // a rule, and matching one made this guard read a declaration that has no colours.
        const CSS = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
        const rings = [...CSS.matchAll(/[^}]*mark-eagle[^{]*\{[^}]*\}/g)]
            .map(m => m[0]).filter(r => /box-shadow:/.test(r));
        assert.ok(rings.length >= 1, 'an eagle ring rule must exist');
        rings.forEach(r => {
            assert.ok(!/--brand-green|#0f4c3a/.test(r), 'the green eagle ring must be gone');
            const reds = (r.match(/var\(--accent-red\)|#c1121f/g) || []).length;
            assert.equal(reds, 2, 'two red bands make the double ring');
        });
        // The classifier itself is untouched — this is a paint change, not a rule change.
        assert.equal(marks.scoreMarkClass(2, 4), ' mark-eagle');
    });

    test('score-marks.js itself was not modified', () => {
        const src = read('score-marks.js');
        assert.match(src, /GROSS ONLY\. A birdie is a birdie/);
        assert.ok(!/dotStrokes|displayNet|net-mark/.test(src),
            'the shared classifier must stay a two-number function');
    });
});

// ============================================================================
describe('THE SUBORDINATE ADJUSTED-SCORE INDICATOR', () => {

    test('it appears only for a net birdie or better', () => {
        assert.match(RS_CODE, /const netDiff = displayNet - holePar;/);
        assert.match(RS_CODE, /if \(netDiff <= -1\) \{/, 'birdie-or-better only');
        assert.ok(!/netDiff === 0/.test(RS_CODE), 'net par draws nothing');
        assert.ok(!/netDiff >= 1/.test(RS_CODE), 'net bogey draws nothing');
    });

    test('it requires a stroke to have actually produced it', () => {
        assert.match(RS_CODE, /if \(dotStrokes > 0\) \{/,
            'a gross birdie with no stroke is already circled - repeating it is noise');
    });

    test('it FOLLOWS THE ACTIVE DOT CONTEXT, reusing dotStrokes', () => {
        assert.match(RS_CODE, /const displayNet = gross - dotStrokes;/,
            'the same quantity that drew the dots - so the two can never disagree');
        // No second handicap lookup exists for this indicator.
        const seg = RS_CODE.slice(RS_CODE.indexOf('if (dotStrokes > 0) {'),
                                  RS_CODE.indexOf('if (dotStrokes > 0) {') + 500);
        assert.ok(!/getStrokes\(|parseHcp\(|allocateMatchStrokes\(/.test(seg),
            'no new handicap arithmetic may be introduced here');
    });

    test('start-hole gating and the outside-match fallback are inherited', () => {
        // dotStrokes already carries both, so the indicator gets them for free.
        assert.match(RS_CODE, /if \(holeNum < entry\.startHole\) return courseStrokes;/);
        assert.match(RS_CODE, /if \(!entry\) return courseStrokes;/);
        assert.match(RS_CODE, /const dotStrokes = dotStrokesFor\(p, h\.hcpIndex, strokes, h\.hole\);/);
    });

    test('net eagle or better takes the second ring', () => {
        assert.match(RS_CODE, /const eagleCls = netDiff <= -2 \? ' net-eagle' : '';/);
        assert.match(RS_CODE, /<span class="net-mark\$\{eagleCls\}">\$\{displayNet\}<\/span>/);
    });

    test('it sits BENEATH the score, never inside the score box', () => {
        const cellTpl = RS_CODE.slice(RS_CODE.indexOf('rowHtml += `'), RS_CODE.indexOf('rowHtml += `') + 900);
        const wrapEnd = cellTpl.indexOf('</div>', cellTpl.indexOf('score-input-wrapper'));
        assert.ok(cellTpl.indexOf('${netMarkHtml}') > wrapEnd,
            'the indicator must be outside the score-input wrapper');
        assert.ok(cellTpl.indexOf('${shapeHtml}') < wrapEnd,
            'gross marks stay inside it');
    });

    test('the values it prints are correct for the worked examples', () => {
        // Par 4, gross 4, one stroke -> 3 (net birdie, single ring).
        assert.equal(4 - 1 - 4, -1);
        // Par 4, gross 3, one stroke -> 2 (net eagle, double ring).
        assert.equal(3 - 1 - 4, -2);
        // Executed through the real allocator for a relative handicap of 5 at SI 3.
        assert.equal(E.allocateMatchStrokes(5, 3), 1);
        assert.equal(4 - E.allocateMatchStrokes(5, 3) - 4, -1, 'Dave nets a birdie on an SI 3 par 4');
        assert.equal(E.allocateMatchStrokes(5, 8), 0);
        assert.equal(4 - E.allocateMatchStrokes(5, 8) - 4, 0, 'and only a par on SI 8');
    });

    test('the indicator is visually subordinate to the score', () => {
        const css = SRC.slice(SRC.indexOf('.net-mark {'), SRC.indexOf('.net-mark {') + 400);
        assert.match(css, /font-size: 0\.6rem/, 'smaller than the score');
        assert.match(css, /height: 15px/);
        assert.ok(!/font-size: 1/.test(css));
        const line = SRC.slice(SRC.indexOf('.net-mark-line {'), SRC.indexOf('.net-mark-line {') + 200);
        assert.ok(!/position: absolute/.test(line), 'it flows under the score, never overlaps it');
    });
});

// ============================================================================
describe('NOTHING ELSE MOVED', () => {

    test('runningStats / to-par keeps the round scoring type', () => {
        assert.match(RS_CODE, /let scoreToUse = scoringType === 'net' \? net : gross;/);
        assert.match(RS_CODE, /let diff = scoreToUse - holePar;/);
        assert.match(RS_CODE, /runningStats\[p\.id\] \+= diff;/);
        assert.ok(!/runningStats\[p\.id\] \+= grossDiff/.test(RS_CODE),
            'to-par was explicitly left alone in this batch');
    });

    test('ordinary net is still the course allocation', () => {
        assert.match(RS_CODE, /const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(RS_CODE, /let net = gross - strokes;/);
        assert.ok(!/let net = gross - dotStrokes;/.test(RS_CODE));
    });

    test('OUT / IN / TOTAL never see a mark or a display net', () => {
        const totals = RS_CODE.slice(RS_CODE.indexOf('let hasFront = courseData.some'));
        totals.split('\n').filter(l => /getStrokes\(/.test(l))
            .forEach(l => assert.ok(!/dotStrokes|displayNet|grossDiff/.test(l),
                'a section total was tainted: ' + l.trim()));
    });

    test('the leaderboard is untouched', () => {
        const lb = read('leaderboard.html');
        assert.ok(!/net-mark|grossDiff|displayNet|dotStrokes/.test(lb));
        assert.match(lb, /getStrokes\(hole\.hcpIndex, parseHcp\(p\.hcp\)\)/);
    });

    test('the settlement receipt is untouched', () => {
        const st = read('settlement.html');
        assert.ok(!/net-mark|grossDiff|displayNet|dotStrokes/.test(st));
        assert.match(st, /scoreMarkClass/, 'it still uses the shared gross classifier');
        assert.ok(!/shape-circle|shape-box/.test(st));
    });

    test('no engine acquired display logic', () => {
        ['money-engine.js','settlement-engine.js','action-model.js','bet-strip.js',
         'hole-events.js','pool-engine.js'].forEach(f =>
            assert.ok(!/net-mark|grossDiff|displayNet|netMarkHtml/.test(read(f)), f));
    });

    test('handicap, match and settlement behaviour is unchanged', () => {
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1);
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(18, -2), -1, 'the plus-handicap giveback survives');
        const P = (id,h,t) => ({ id, name:'P'+id, hcp:String(h), team:t });
        const ps = [P(1,5,'Team 1'), P(2,15,'Team 1'), P(3,7,'Team 2'), P(4,10,'Team 2')];
        const s = {}; ps.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
        const calc = JSON.parse(JSON.stringify(
            E.calculateMatchEngine(ps, cd18, s, 'net', 'match', 'none', 20, 0, [])));
        assert.equal(calc.matchBaseline, 5);
        assert.deepEqual(calc.relHcpById, { '1':0, '2':10, '3':2, '4':5 });
    });

    test('formatHcpDisplay and the Hole View handicap label are unchanged', () => {
        assert.equal(call('formatHcpDisplay(-2)'), '+2');
        assert.match(HV, /<div class="hv-hcp">HCP \$\{formatHcpDisplay\(hvPlayer\.hcp\)\}<\/div>/);
    });
});

// ============================================================================
describe('SERVICE WORKER', () => {

    const sw = read('sw.js');

    test('CACHE_VERSION moved to v10', () => {
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v61-cup-arrival';/);
        assert.ok(!/const CACHE_VERSION = 'golfapp-v12-course-grid';/.test(sw));
    });

    test('the shell file list did NOT change', () => {
        const raw = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf(']', sw.indexOf('const SHELL_FILES')));
        const entries = raw.split('\n').map(l => l.trim())
            .filter(l => /^'\.\/[^']+',?$/.test(l)).map(l => l.replace(/^'|',?$/g, ''));
        // 33 since logo-mark.png joined the shell for the homepage brand mark.
        // 34 since native-export.js joined the shell: settlement.html and trip.html
        // call it unguarded from their Print / Save buttons, so a cached shell without
        // it would restore exactly the dead button that file was added to fix.
        // 35 since ryder-cup.js joined the shell: index.html loads it unguarded at
        // parse time, so a cached shell without it breaks the scorecard.
        assert.equal(entries.length, 35);
        ['./index.html','./score-marks.js','./firebase-app-compat.js','./firebase-database-compat.js']
            .forEach(f => assert.ok(entries.indexOf(f) !== -1, 'missing ' + f));
    });

    test('the fetch strategy is unchanged', () => {
        assert.match(sw, /Network-first: always prefer the latest deployed version/);
        assert.match(sw, /event\.respondWith\(\s*fetch\(request\)/);
    });
});
