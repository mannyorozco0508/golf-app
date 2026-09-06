// ============================================================================
// DOT CONTEXT SELECTOR + HOLE VIEW HANDICAP
//
// A Stroke Play round can carry several Match Play side matches at once, and a
// golfer's relative handicap DIFFERS between them - a 10 receives 5 in one match
// and plays off zero in another. There is no universal set of match dots, so the
// card does not invent one: it defaults to ordinary course dots and lets the
// golfer say which match the dots represent.
//
// Second change here: Hole View now shows each golfer's own Playing Handicap.
// Hole View is the DEFAULT view, so the Full Card-only label added last batch was
// invisible to anyone who never tapped across - which is exactly what happened on
// the course.
//
// HARNESS NOTE, because it bounds what these tests can claim. mini-dom stores
// innerHTML as a string and does not build child nodes, so renderHoleView() -
// which walks the rendered Full Card row - cannot execute here. Rendering
// STRUCTURE is therefore pinned at source level, and every VALUE the templates
// emit is proven by executing the real production functions. Full end-to-end
// rendering of both views was verified separately in a real DOM; jsdom is not a
// repo dependency and is deliberately not introduced by this batch.
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

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));
const call = e => vm.runInContext(e, page());
const E = loadJsFile('money-engine.js');

const SI = { 7:1,3:2,12:3,16:4,1:5,9:6,5:7,14:8,18:9,2:10,11:11,8:12,15:13,4:14,17:15,6:16,13:17,10:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i+1, par: 4, hcpIndex: SI[i+1] }));

const P = [
    { id:101, name:'Lee Adams',    hcp:'5'  },
    { id:102, name:'Jeremy Brown', hcp:'7'  },
    { id:103, name:'Dave Clark',   hcp:'10' },
    { id:104, name:'Jeff Dunn',    hcp:'15' },
];
const SM1 = { format:'match', scoring:'net', teamAIds:['101','104'], teamBIds:['102','103'], stake:20, startHole:1, pressRule:'none' };
const SM2 = { format:'match', scoring:'net', teamAIds:['103'],       teamBIds:['104'],       stake:10, startHole:1, pressRule:'none' };
const scores = () => { const s = {}; P.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; })); return s; };
const round = extra => Object.assign({ gameFormat:'stroke', players:JSON.parse(JSON.stringify(P)),
    courseData:cd18, scores:scores(), sideMatches:{ w1:SM1, w2:SM2 } }, extra || {});

// Real production helpers, executed.
// Values come back from the page's vm realm, so they carry that realm's prototypes.
// JSON round-tripping makes deepEqual meaningful instead of failing on identity.
const plain = v => (v === undefined || v === null) ? v : JSON.parse(JSON.stringify(v));
const eligible = d => plain(call('eligibleDotMatches(' + JSON.stringify(d) + ')'));
const dotCalc = (d, sm) => plain(call('dotCalcForSideMatch(' + JSON.stringify(d) + ',' + JSON.stringify(sm) + ',' + JSON.stringify(cd18) + ')'));
const relOf = calc => (calc && calc.usesRelativeHandicap && calc.relHcpById) ? calc.relHcpById : null;
// The dot count the card prints, assembled from exactly the pieces renderScorecard uses.
function dotsSIs(calc, player) {
    const tbl = relOf(calc);
    return cd18.filter(h => {
        const course = E.getStrokes(h.hcpIndex, E.parseHcp(player.hcp));
        if (!tbl) return course > 0;
        const rel = tbl[String(player.id)];
        return (rel === undefined ? course : E.allocateMatchStrokes(rel, h.hcpIndex)) > 0;
    }).map(h => h.hcpIndex).sort((a,b) => a-b);
}
const courseSIs = h => cd18.filter(x => E.getStrokes(x.hcpIndex, h) > 0).map(x => x.hcpIndex).sort((a,b)=>a-b);

// ============================================================================
describe('WHEN THE SELECTOR APPEARS', () => {

    test('a pure Stroke Play round with NO side matches offers nothing', () => {
        assert.deepEqual(eligible(round({ sideMatches: {} })), []);
        assert.deepEqual(eligible({ gameFormat:'stroke', players:P }), []);
    });

    test('one Match Play side match is ONE option', () => {
        const opts = eligible(round({ sideMatches: { w1: SM1 } }));
        assert.equal(opts.length, 1);
        assert.equal(opts[0].id, 'w1');
        assert.equal(opts[0].label, 'Lee + Jeff vs Jeremy + Dave', 'real names, both sides');
    });

    test('multiple side matches each appear ONCE', () => {
        const opts = eligible(round());
        assert.equal(opts.length, 2);
        assert.deepEqual(opts.map(o => o.id), ['w1','w2']);
        assert.deepEqual(opts.map(o => o.label),
            ['Lee + Jeff vs Jeremy + Dave', 'Dave vs Jeff']);
    });

    test('PRESSES DO NOT APPEAR AS SEPARATE OPTIONS', () => {
        const pressed = Object.assign({}, SM1,
            { presses: { p1:{fromHole:4}, p2:{fromHole:9}, p3:{fromHole:14} } });
        const opts = eligible(round({ sideMatches: { w1: pressed, w2: SM2 } }));
        assert.equal(opts.length, 2, 'three presses on w1 still yield one entry for w1');
        assert.deepEqual(opts.map(o => o.id), ['w1','w2']);
    });

    test('a Nassau side match qualifies; stroke and skins do not', () => {
        assert.equal(eligible(round({ sideMatches: { n:Object.assign({}, SM1, {format:'nassau'}) } })).length, 1);
        assert.equal(eligible(round({ sideMatches: { s:Object.assign({}, SM1, {format:'stroke'}) } })).length, 0);
        assert.equal(eligible(round({ sideMatches: { k:Object.assign({}, SM1, {format:'skins'}) } })).length, 0);
    });

    test('a GROSS side match is not offered - it would allocate nothing', () => {
        assert.equal(eligible(round({ sideMatches: { g:Object.assign({}, SM1, {scoring:'gross'}) } })).length, 0);
    });

    test('a side match missing a side is skipped', () => {
        assert.equal(eligible(round({ sideMatches: { b:Object.assign({}, SM1, {teamBIds:[]}) } })).length, 0);
    });

    test('NO SELECTOR when the round itself is a Match Play format', () => {
        ['match','nassau','bestball','ryder'].forEach(f => {
            assert.equal(call('isRoundLevelMatchFormat(' + JSON.stringify(f) + ')'), true, f);
        });
        assert.match(RS, /const roundOwnsDots = isRoundLevelMatchFormat\(gameFormat\);/);
        assert.match(RS, /const selectorApplies = !roundOwnsDots && hasOptions;/,
            'the selector is suppressed when the round already owns one match context');
    });

    test('scramble and stroke are NOT round-level match formats', () => {
        assert.equal(call('isRoundLevelMatchFormat("scramble")'), false, 'scramble stays excluded');
        assert.equal(call('isRoundLevelMatchFormat("stroke")'), false);
    });

    test('the selector row is hidden outright when it cannot help', () => {
        assert.match(RS, /dotRow\.style\.display = "none"/);
        assert.match(SRC, /<div id="dot-context-row" class="dot-context-row" style="display:none;">/,
            'it also starts hidden, so it never flashes on a plain round');
    });
});

// ============================================================================
describe('COURSE IS THE DEFAULT, ALWAYS', () => {

    test('the initial state is AUTO, never a specific side match', () => {
        // SUPERSEDED VALUE, SAME GUARANTEE. The default was 'course'; it is now 'auto',
        // which RESOLVES to course whenever Auto is unavailable. What is protected is
        // unchanged: the initial state is never one particular wager.
        assert.match(SRC, /let selectedDotMatchId = 'auto';/);
        assert.ok(!/let selectedDotMatchId = '(?!auto)[^']*';/.test(SRC));
    });

    test('THE FIRST SIDE MATCH IS NEVER AUTO-PICKED', () => {
        // Nothing may assign selectedDotMatchId from the options list.
        assert.ok(!/selectedDotMatchId = dotMatchOptions/.test(RS));
        assert.ok(!/selectedDotMatchId = .*\[0\]/.test(RS));
        // Exactly three assignments exist, and every one of them is either the
        // 'course' default or the golfer's own explicit choice. Order in the file is
        // not pinned - only that no fourth, inferred assignment can appear.
        const assigns = SRC.split('\n').map(l => l.trim()).filter(l => /selectedDotMatchId\s*=[^=]/.test(l));
        assert.equal(assigns.length, 4, 'expected exactly four assignments, got:\n' + assigns.join('\n'));
        assert.ok(assigns.includes("let selectedDotMatchId = 'auto';"), 'the default declaration');
        assert.ok(assigns.includes("selectedDotMatchId = value || 'course';"), 'the explicit choice');
        // Two fail-safe resets: Auto retired, and a chosen wager that no longer exists.
        assert.equal(assigns.filter(l => /selectedDotMatchId = 'course';$/.test(l)).length, 2,
            'both stale paths must drop to course');
        // Every assignment is a literal or the golfer's own value - never derived from
        // the options list, so no wager can be inferred into the slot.
        assigns.forEach(l => assert.ok(/'auto'|'course'|value \|\| 'course'/.test(l),
            'assignment must be a literal or the explicit choice: ' + l));
    });

    test('Course is the first option offered', () => {
        assert.match(RS, /<option value="course">Course<\/option>/);
    });

    test('a selection pointing at a deleted wager falls back to course', () => {
        assert.match(RS, /!dotMatchOptions\.some\(o => o\.id === selectedDotMatchId\)/,
            'a chosen wager that no longer exists must be detected');
        assert.match(RS, /selectedDotMatchId = 'course';/);
    });

    test('a page reload resets to course', () => {
        // Module-scope `let` with a literal initialiser, and nothing reads it back
        // from storage or Firebase.
        assert.ok(!/localStorage[^\n]*selectedDotMatchId/.test(SRC));
        assert.ok(!/sessionStorage[^\n]*selectedDotMatchId/.test(SRC));
        assert.ok(!/selectedDotMatchId[^\n]*(localStorage|sessionStorage)/.test(SRC));
    });

    test('with Course selected the dots are ordinary course dots', () => {
        // matchRelHcpById is null, so dotStrokesFor returns the course strokes it was handed.
        assert.deepEqual(dotsSIs(null, P[0]), courseSIs(5));
        assert.deepEqual(dotsSIs(null, P[1]), courseSIs(7));
        assert.deepEqual(dotsSIs(null, P[2]), courseSIs(10));
        assert.deepEqual(dotsSIs(null, P[3]), courseSIs(15));
    });
});

// ============================================================================
describe('SIDE MATCH 1 — Lee 5 + Jeff 15  vs  Jeremy 7 + Dave 10', () => {

    const calc = () => dotCalc(round(), SM1);

    test('the canonical allocation is 0 / 2 / 5 / 10', () => {
        const c = calc();
        assert.equal(c.matchBaseline, 5);
        assert.deepEqual(c.relHcpById, { '101':0, '102':2, '103':5, '104':10 });
        assert.equal(c.usesRelativeHandicap, true);
    });

    test('dots land on the specified stroke indexes', () => {
        const c = calc();
        assert.deepEqual(dotsSIs(c, P[0]), [], 'Lee is the baseline - no dots');
        assert.deepEqual(dotsSIs(c, P[1]), [1,2], 'Jeremy SI 1-2');
        assert.deepEqual(dotsSIs(c, P[2]), [1,2,3,4,5], 'Dave SI 1-5');
        assert.deepEqual(dotsSIs(c, P[3]), [1,2,3,4,5,6,7,8,9,10], 'Jeff SI 1-10');
    });

    test('the LOW GOLFER\u2019S PARTNER still receives strokes', () => {
        // Lee (5) and Jeff (15) are partners; Jeff still gets 10.
        assert.equal(SM1.teamAIds.join(','), '101,104');
        assert.equal(calc().relHcpById['104'], 10);
    });

    test('these dots differ from every golfer\u2019s course dots', () => {
        const c = calc();
        [[P[0],5],[P[1],7],[P[2],10],[P[3],15]].forEach(([p,h]) => {
            assert.notDeepEqual(dotsSIs(c, p), courseSIs(h),
                p.name + ' must not still be showing course dots');
        });
    });
});

// ============================================================================
describe('SIDE MATCH 2 — Dave 10 vs Jeff 15', () => {

    const calc = () => dotCalc(round(), SM2);

    test('the canonical allocation is 0 / 5', () => {
        const c = calc();
        assert.equal(c.matchBaseline, 10);
        assert.deepEqual(c.relHcpById, { '103':0, '104':5 });
    });

    test('dots: Dave none, Jeff SI 1-5', () => {
        const c = calc();
        assert.deepEqual(dotsSIs(c, P[2]), []);
        assert.deepEqual(dotsSIs(c, P[3]), [1,2,3,4,5]);
    });

    test('GOLFERS OUTSIDE THE MATCH KEEP COURSE DOTS', () => {
        const c = calc();
        assert.equal(c.relHcpById['101'], undefined, 'Lee is not in this wager');
        assert.equal(c.relHcpById['102'], undefined, 'nor is Jeremy');
        assert.deepEqual(dotsSIs(c, P[0]), courseSIs(5),  'Lee keeps his 5-handicap dots');
        assert.deepEqual(dotsSIs(c, P[1]), courseSIs(7),  'Jeremy keeps his 7-handicap dots');
        assert.match(RS, /if \(!entry\) return courseStrokes;/,
            'a golfer absent from the plan falls through to course dots, not a new branch');
    });

    test('THE SAME GOLFER IS ALLOCATED DIFFERENTLY IN THE TWO MATCHES', () => {
        const c1 = dotCalc(round(), SM1), c2 = dotCalc(round(), SM2);
        assert.equal(c1.relHcpById['103'], 5, 'Dave receives 5 in the 2v2');
        assert.equal(c2.relHcpById['103'], 0, 'Dave plays off zero against Jeff');
        assert.equal(c1.relHcpById['104'], 10, 'Jeff receives 10 in the 2v2');
        assert.equal(c2.relHcpById['104'], 5,  'and 5 against Dave');
        assert.notDeepEqual(dotsSIs(c1, P[2]), dotsSIs(c2, P[2]),
            'which is precisely why one match may not silently own the other\u2019s dots');
    });

    test('switching back to Course restores every golfer', () => {
        assert.deepEqual(dotsSIs(null, P[2]), courseSIs(10));
        assert.deepEqual(dotsSIs(null, P[3]), courseSIs(15));
    });
});

// ============================================================================
describe('THE SELECTION IS DISPLAY STATE ONLY', () => {

    test('setDotContext re-renders and nothing more', () => {
        const fn = SRC.slice(SRC.indexOf('function setDotContext'), SRC.indexOf('function setDotContext') + 320);
        assert.match(fn, /selectedDotMatchId = value \|\| 'course';/);
        assert.match(fn, /renderScorecard\(\);/);
        assert.match(fn, /if \(currentViewMode === 'hole'\) renderHoleView\(\);/,
            'Hole View must be rebuilt from the fresh Full Card cells');
        assert.ok(!/\.set\(|\.update\(|db\.ref|firebase/.test(fn), 'no write of any kind');
    });

    test('NOTHING writes the selection to Firebase or currentData', () => {
        assert.ok(!/currentData\.selectedDotMatchId/.test(SRC));
        assert.ok(!/selectedDotMatchId["']?\s*:/.test(SRC), 'never serialised into a payload');
        const near = SRC.split('\n').filter(l => /selectedDotMatchId/.test(l));
        near.forEach(l => assert.ok(!/db\.ref|\.set\(|\.update\(/.test(l),
            'selection leaked into a write: ' + l.trim()));
    });

    test('the dot calc NEVER becomes matchCalc', () => {
        // matchCalc drives the Match & Bets column, the bet registry and the press
        // strip - all of which belong to the ROUND's game, not to a dot preference.
        assert.match(RS, /matchCalc itself is deliberately NOT reassigned/);
        assert.ok(!/matchCalc = dotCalcForSideMatch/.test(RS));
        assert.ok(!/matchCalc = buildDotPlan/.test(RS));
        assert.ok(!/\bmatchCalc =(?!=)/.test(RS.slice(RS.indexOf('const dotMatchOptions'))),
            'nothing after the dot-context block may reassign matchCalc');
    });

    test('no player handicap is mutated', () => {
        const c1 = dotCalc(round(), SM1);
        const c2 = dotCalc(round(), SM2);
        assert.ok(c1 && c2);
        assert.deepEqual(P.map(p => p.hcp), ['5','7','10','15']);
        assert.ok(!/\.hcp\s*=[^=]/.test(RS), 'renderScorecard assigns no handicap');
    });

    test('the side match itself is untouched', () => {
        const before = JSON.stringify(SM1);
        dotCalc(round(), SM1);
        assert.equal(JSON.stringify(SM1), before);
        // The engine is handed COPIES with a team tag, never the stored objects.
        assert.match(SRC, /Object\.assign\(\{\}, p, \{ team: 'Team 1' \}\)/);
        assert.match(SRC, /Object\.assign\(\{\}, p, \{ team: 'Team 2' \}\)/);
    });

    test('there is ONE handicap algorithm, not a UI copy', () => {
        assert.match(SRC, /return calculateMatchEngine\(teamA\.concat\(teamB\)/,
            'the selected match runs the same canonical engine');
        const fn = SRC.slice(SRC.indexOf('function dotCalcForSideMatch'),
                             SRC.indexOf('function setDotContext'));
        assert.ok(!/Math\.min|matchBaseline\s*=|allocateMatchStrokes/.test(fn),
            'no allocation arithmetic is reimplemented for the UI');
    });
});

// ============================================================================
describe('HOLE VIEW SHOWS THE GOLFER\u2019S OWN HANDICAP', () => {

    test('the HCP label is emitted with the player name', () => {
        assert.match(HV, /const hvPlayer = filteredPlayers\[i - 3\];/,
            'matched positionally, so it can never mismatch the column');
        assert.match(HV, /<div class="hv-hcp">HCP \$\{formatHcpDisplay\(hvPlayer\.hcp\)\}<\/div>/);
        // The name is escaped at the output boundary now - a golfer called
        // "Bob <the Hammer>" used to vanish here, swallowed as an unknown tag.
        assert.match(HV, /<div class="hv-player-name">\$\{escapeHtml\(name\)\}\$\{hvHcpHtml\}/);
    });

    test('HCP 5 / 7 / 10 / 15 all format correctly', () => {
        assert.equal(call('formatHcpDisplay("5")'), '5');
        assert.equal(call('formatHcpDisplay("7")'), '7');
        assert.equal(call('formatHcpDisplay("10")'), '10');
        assert.equal(call('formatHcpDisplay("15")'), '15');
    });

    test('an internal -2 displays as HCP +2, never HCP -2', () => {
        assert.equal(call('formatHcpDisplay(-2)'), '+2');
        assert.equal(call('formatHcpDisplay("+2")'), '+2');
        ['5','7','10','15','+2','-2',-2,0,''].forEach(v => {
            assert.ok(call('formatHcpDisplay(' + JSON.stringify(v) + ')').charAt(0) !== '-',
                'leaked a minus for ' + JSON.stringify(v));
        });
    });

    test('the name is NOT concatenated with the handicap', () => {
        assert.match(HV, /<div class="hv-hcp">/, 'the handicap is its own block element');
        const css = SRC.slice(SRC.indexOf('.hv-hcp {'), SRC.indexOf('.hv-hcp {') + 220);
        assert.match(css, /display: block/, 'so it sits on its own line under the name');
    });

    test('the name stays visually primary', () => {
        const nameCss = SRC.slice(SRC.indexOf('.hv-player-name {'), SRC.indexOf('.hv-player-name {') + 140);
        const hcpCss  = SRC.slice(SRC.indexOf('.hv-hcp {'), SRC.indexOf('.hv-hcp {') + 220);
        assert.match(nameCss, /font-weight: bold/);
        assert.match(nameCss, /font-size: 0\.95rem/);
        assert.match(hcpCss, /font-size: 0\.68rem/, 'the handicap is smaller');
        assert.match(hcpCss, /font-weight: normal/, 'and lighter');
    });

    test('Hole View uses the ACTUAL handicap, never the relative match number', () => {
        assert.ok(!/hv-hcp[\s\S]{0,200}relHcpById/.test(HV));
        assert.ok(!/allocateMatchStrokes/.test(HV), 'Hole View computes no allocation at all');
        assert.match(HV, /formatHcpDisplay\(hvPlayer\.hcp\)/, 'the stored Playing Handicap');
    });

    test('no second dot renderer was built inside Hole View', () => {
        assert.match(HV, /cells\[i\] \? cells\[i\]\.innerHTML : ''/,
            'score cells are still copied verbatim from the Full Card');
        assert.ok(!/stroke-dots/.test(HV), 'Hole View never constructs a dot element itself');
        assert.equal((SRC.match(/class="stroke-dots"/g) || []).length, 1,
            'dots are built in exactly one place in the whole file');
    });
});

// ============================================================================
describe('THE CONTEXT NOTE FOLLOWS THE SELECTION', () => {

    test('the note reads the dot context, not the round format', () => {
        assert.match(RS, /let dotPlanById = null;/,
            'the dots and the note both read one per-golfer plan');
        assert.match(RS, /let dotNoteMode = 'none';/);
    });

    test('Course selected leaves the note hidden', () => {
        // Course mode builds no note html, so the element is hidden outright.
        assert.match(RS, /if \(noteHtml\) \{/);
        assert.match(RS, /matchNoteEl\.style\.display = "none"/);
    });

    test('a selected match shows the compact relative line', () => {
        assert.match(RS, /<strong>MATCH HCP<\/strong>/);
        assert.match(RS, /Low: \$\{lowLabel\}/);
        assert.match(RS, /Playing: \$\{playing\}/);
    });

    test('the note stays a line, not a dashboard', () => {
        const css = SRC.slice(SRC.indexOf('.match-hcp-note {'), SRC.indexOf('.match-hcp-note {') + 320);
        assert.match(css, /font-size: 0\.68rem/);
        assert.ok(!/min-height/.test(css));
    });
});

// ============================================================================
describe('MOBILE LAYOUT', () => {

    test('the selector is one compact row', () => {
        const css = SRC.slice(SRC.indexOf('.dot-context-row {'), SRC.indexOf('.dot-context-row {') + 320);
        assert.match(css, /display: flex/);
        assert.match(css, /font-size: 0\.72rem/);
        assert.ok(!/min-height/.test(css), 'no reserved block of vertical space');
        assert.ok(!/position: fixed/.test(css), 'it scrolls with the page');
    });

    test('it cannot cause horizontal scroll', () => {
        const sel = SRC.slice(SRC.indexOf('.dot-context-row select {'), SRC.indexOf('.dot-context-row select {') + 320);
        assert.match(sel, /min-width: 0/, 'a flex child must be allowed to shrink');
        assert.match(sel, /max-width: 100%/);
        assert.ok(!/width:\s*\d{3,}px/.test(sel));
    });

    test('it is a native select, so the phone renders its own picker', () => {
        assert.match(SRC, /<select id="dot-context-select" onchange="setDotContext\(this\.value\)">/);
    });

    test('option labels are first names only, to stay short', () => {
        const opts = eligible(round());
        opts.forEach(o => {
            assert.ok(!/ Adams| Brown| Clark| Dunn/.test(o.label), 'surnames would overflow: ' + o.label);
        });
        assert.equal(opts[1].label, 'Dave vs Jeff');
    });
});

// ============================================================================
describe('NOTHING ABOUT SCORING MOVED', () => {

    test('gross stays gross', () => {
        assert.match(RS, /let gross = parseInt\(scoreVal, 10\);/);
    });

    test('net, net-to-par and the shapes use the COURSE allocation', () => {
        assert.match(RS, /const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(RS, /let net = gross - strokes;/);
        assert.ok(!/let net = gross - dotStrokes;/.test(RS));
        const chain = RS.slice(RS.indexOf('let net = gross - strokes;'), RS.indexOf('runningStats[p.id] += diff;'));
        assert.ok(!/dotStrokes/.test(chain));
    });

    test('OUT / IN / TOTAL net never see the dot context', () => {
        const totals = RS.slice(RS.indexOf('let hasFront = courseData.some'));
        totals.split('\n').filter(l => /getStrokes\(/.test(l))
            .forEach(l => assert.ok(!/dotStrokes|dotContextCalc/.test(l), 'section total tainted: ' + l.trim()));
    });

    test('dotStrokes is still used for the dots and nothing else', () => {
        // SUPERSEDED COUNT, STRICTER CONTRACT. dotStrokes now legitimately drives TWO
        // display surfaces: the teal dots, and the subordinate net indicator beneath
        // the gross score. What is protected is unchanged and is now asserted directly
        // rather than by counting lines: dotStrokes must never reach the gross score,
        // the ordinary net, to-par, or any section total.
        // COMMENTS ARE STRIPPED FIRST. This block is commented, and a comment naming
        // dotStrokes would otherwise be counted as a use - the exact way a source
        // assertion passes against prose instead of code.
        const uses = RS.split('\n')
            .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
            .filter(l => /\bdotStrokes\b/.test(l));
        assert.equal(uses.length, 4, 'expected four code references, got:\n' + uses.join('\n'));
        assert.match(uses[0], /const dotStrokes = dotStrokesFor\(p, h\.hcpIndex, strokes, h\.hole\);/);
        assert.match(uses[1], /handicapDots = dotStrokes > 0/, 'the teal dots');
        assert.match(uses[2], /if \(dotStrokes > 0\) \{/, 'the net-indicator gate');
        assert.match(uses[3], /const displayNet = gross - dotStrokes;/, 'the net indicator itself');
        // The forbidden neighbours, named explicitly.
        assert.ok(!/let net = gross - dotStrokes;/.test(RS));
        assert.ok(!/runningStats\[p\.id\] \+= .*dotStrokes/.test(RS));
        assert.ok(!/value="\$\{.*dotStrokes.*\}"/.test(RS), 'the primary box is never dotStrokes');
    });

    test('Stroke Play handicap allocation is untouched', () => {
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1);
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(1, 20), 2);
        assert.equal(E.getStrokes(18, -2), -1);
    });

    test('the engine files were not touched by this batch', () => {
        ['money-engine.js','settlement-engine.js','action-model.js','bet-strip.js','hole-events.js']
            .forEach(f => {
                assert.ok(!/selectedDotMatchId|dotContextCalc|eligibleDotMatches|dotCalcForSideMatch/.test(read(f)),
                    f + ' acquired dot-selector logic');
            });
    });

    test('the leaderboard still nets off the course allocation', () => {
        const lb = read('leaderboard.html');
        assert.ok(!/dotStrokes|dotContextCalc|selectedDotMatchId/.test(lb));
        assert.match(lb, /getStrokes\(hole\.hcpIndex, parseHcp\(p\.hcp\)\)/);
    });

    test('settlement and press behaviour are unaffected by the selection', () => {
        // The selection exists only in index.html's render layer.
        assert.ok(!/selectedDotMatchId/.test(read('settlement.html')));
        assert.ok(!/selectedDotMatchId/.test(read('sidematches.html')));
        assert.ok(!/selectedDotMatchId/.test(read('stats.html')));
    });

    test('presses inherit the parent allocation, as before', () => {
        const teamed = [
            Object.assign({}, P[0], {team:'Team 1'}), Object.assign({}, P[3], {team:'Team 1'}),
            Object.assign({}, P[1], {team:'Team 2'}), Object.assign({}, P[2], {team:'Team 2'}),
        ];
        const plain = JSON.parse(JSON.stringify(E.calculateMatchEngine(teamed, cd18, scores(), 'net','match','none',20,0,[])));
        const pressed = JSON.parse(JSON.stringify(E.calculateMatchEngine(teamed, cd18, scores(), 'net','match','manual',20,0,
            [{segment:'18',baseId:'18',fromHole:10},{segment:'18',baseId:'18',fromHole:14}])));
        assert.deepEqual(pressed.relHcpById, plain.relHcpById);
        assert.equal(pressed.matchBaseline, plain.matchBaseline);
    });
});

// ============================================================================
describe('SERVICE WORKER', () => {

    const sw = read('sw.js');

    test('CACHE_VERSION moved', () => {
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v57-stable-player-ids';/);
        assert.ok(!/const CACHE_VERSION = 'golfapp-v12-course-grid';/.test(sw),
            'the old key must not still be the active one');
    });

    test('the shell file list did NOT change', () => {
        const raw = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf(']', sw.indexOf('const SHELL_FILES')));
        // COMMENTS MUST BE STRIPPED FIRST. The block is heavily commented and several
        // comments name the very files being checked, so a plain substring test passes
        // even after an entry is deleted. Only real quoted entries count.
        const entries = raw.split('\n')
            .map(l => l.trim())
            .filter(l => /^'\.\/[^']+',?$/.test(l))
            .map(l => l.replace(/^'|',?$/g, ''));
        ['./index.html', './admin.html', './leaderboard.html', './stats.html',
         './settlement.html', './sidematches.html', './trip.html', './shared.html',
         './money-engine.js', './settlement-engine.js', './action-model.js',
         './bet-strip.js', './hole-events.js', './pool-engine.js', './score-marks.js',
         './course-data.js', './tournament-engine.js', './pwa-boot.js',
         './firebase-app-compat.js', './firebase-database-compat.js']
            .forEach(f => assert.ok(entries.indexOf(f) !== -1,
                'shell entry missing: ' + f + '\nactual entries:\n' + entries.join('\n')));
        // 33 since logo-mark.png joined the shell: the homepage brand mark is an
        // <img>, so an offline first launch without it would paint the lobby with a
        // broken image where the logo belongs.
        // 34 since native-export.js joined the shell: settlement.html and trip.html
        // call it unguarded from their Print / Save buttons, so a cached shell without
        // it would restore exactly the dead button that file was added to fix.
        // 35 since ryder-cup.js joined the shell: index.html loads it unguarded at
        // parse time, so a cached shell without it does not lose the Ryder Cup card -
        // it breaks the scorecard.
        assert.equal(entries.length, 35, 'the shell list gained or lost an entry');
    });

    test('fetch strategy is unchanged - still network-first', () => {
        assert.match(sw, /Network-first: always prefer the latest deployed version/);
        assert.match(sw, /event\.respondWith\(\s*fetch\(request\)/);
    });

    test('local Firebase references remain intact', () => {
        const pages = fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html'));
        const refs = pages.reduce((n, f) =>
            n + (read(f).match(/firebase-app-compat\.js|firebase-database-compat\.js/g) || []).length, 0);
        assert.equal(refs, 22, 'local Firebase SDK reference count must hold');
        pages.forEach(f => assert.ok(!read(f).includes('gstatic.com/firebasejs'), f + ' points at gstatic'));
    });
});
