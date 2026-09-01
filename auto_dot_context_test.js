// ============================================================================
// AUTO MULTI-MATCH DOT CONTEXT + START-HOLE GATING
//
// Ryder singles is the case this exists for. Four golfers, two independent 1v1s:
//
//     Lee 5 v Dave 10      ->  Lee 0,    Dave 5
//     Jeremy 7 v Jeff 15   ->  Jeremy 0, Jeff 8
//
// Nobody is in both matches, so every golfer has exactly one correct allocation
// and all four can be shown at once. There is NO four-player baseline: match one
// is measured off 5, match two off 7. The two canonical engine results are merged
// by a key union - disjoint by construction - and no new arithmetic is invented.
//
// The moment any golfer appears in two eligible matches, Auto is withdrawn and the
// context drops to Course. A stale merged allocation is worse than plain course
// dots because it looks authoritative while being wrong.
//
// START-HOLE IS DISPLAY ONLY. A wager struck on the 6th tee did not exist on holes
// 1-5, so those holes draw ordinary course dots. Stroke index is NOT renumbered -
// if hole 7 is SI 1 it stays SI 1, and the allocation handed to the renderer is the
// engine's, untouched. Nothing about match results, settlement or presses moves.
//
// HARNESS NOTE. mini-dom stores innerHTML as a string and builds no child nodes, so
// renderHoleView() cannot execute here. Structure is pinned at source level and
// every VALUE is proven by executing real production functions. Full end-to-end
// rendering of both views was verified separately in a real DOM; jsdom is not a
// repo dependency and is not introduced by this batch.
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

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];
let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));
const plain = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const call = e => plain(vm.runInContext(e, page()));
const E = loadJsFile('money-engine.js');

// SI 1 is HOLE 7 - nothing here can pass by confusing the two.
const SI = { 7:1,3:2,12:3,16:4,1:5,9:6,5:7,14:8,18:9,2:10,11:11,8:12,15:13,4:14,17:15,6:16,13:17,10:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i+1, par: 4, hcpIndex: SI[i+1] }));
const holeOfSI = si => Number(Object.keys(SI).find(h => SI[h] === si));

const LEE    = { id:101, name:'Lee Adams',    hcp:'5'  };
const JEREMY = { id:102, name:'Jeremy Brown', hcp:'7'  };
const DAVE   = { id:103, name:'Dave Clark',   hcp:'10' };
const JEFF   = { id:104, name:'Jeff Dunn',    hcp:'15' };
const P4 = [LEE, JEREMY, DAVE, JEFF];

const M = (a, b, x) => Object.assign({ format:'match', scoring:'net',
    teamAIds:a, teamBIds:b, stake:10, startHole:1, pressRule:'none' }, x || {});
const scores = () => { const s = {}; P4.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; })); return s; };
const round = sm => ({ gameFormat:'stroke', players:JSON.parse(JSON.stringify(P4)),
    courseData:cd18, scores:scores(), sideMatches:sm });

const RYDER   = { m1: M(['101'],['103']), m2: M(['102'],['104']) };
const OVERLAP = { m1: M(['101'],['103']), m3: M(['101'],['104']) };

// Real production helpers, executed.
const eligible = d => call('eligibleDotMatches(' + JSON.stringify(d) + ')');
const overlaps = d => call('dotMatchesOverlap(' + JSON.stringify(eligible(d)) + ')');
const buildPlan = (d, opts) => call('buildDotPlan(' + JSON.stringify(d) + ','
    + JSON.stringify(opts) + ',' + JSON.stringify(cd18) + ')');
const autoPlan = d => buildPlan(d, eligible(d));

// The dot count the card prints for a player on a hole, assembled from exactly the
// pieces renderScorecard uses - including the start-hole gate.
function dots(plan, player, hole) {
    const hcpIndex = SI[hole];
    const course = E.getStrokes(hcpIndex, E.parseHcp(player.hcp));
    if (!plan) return course;
    const entry = plan[String(player.id)];
    if (!entry) return course;
    if (hole < entry.startHole) return course;
    return E.allocateMatchStrokes(entry.rel, hcpIndex);
}
const dottedSIs = (plan, p) => cd18.filter(h => dots(plan, p, h.hole) > 0)
    .map(h => h.hcpIndex).sort((a,b) => a-b);
const courseSIs = h => cd18.filter(x => E.getStrokes(x.hcpIndex, h) > 0)
    .map(x => x.hcpIndex).sort((a,b) => a-b);

// ============================================================================
describe('NON-OVERLAP DETECTION', () => {

    test('Ryder singles is non-overlapping', () => {
        assert.equal(eligible(round(RYDER)).length, 2);
        assert.equal(overlaps(round(RYDER)), false);
    });

    test('a golfer in two matches IS overlapping', () => {
        assert.equal(overlaps(round(OVERLAP)), true, 'Lee appears in both');
    });

    test('a 2v2 covering everyone plus a 1v1 IS overlapping', () => {
        assert.equal(overlaps(round({ a: M(['101','102'],['103','104']), b: M(['101'],['104']) })), true);
    });

    test('FAILS SAFE: a golfer on BOTH sides of one wager counts as overlap', () => {
        assert.equal(overlaps(round({ bad: M(['101'],['101','103']) })), true,
            'an incoherent wager must not be guessed at');
    });

    test('PRESSES DO NOT CREATE OVERLAP', () => {
        const pressed = { m1: M(['101'],['103'], { presses:{ p1:{fromHole:4}, p2:{fromHole:9}, p3:{fromHole:14} } }),
                          m2: M(['102'],['104']) };
        assert.equal(eligible(round(pressed)).length, 2, 'three presses, still two parent matches');
        assert.equal(overlaps(round(pressed)), false);
    });

    test('an orphan wager referencing an unknown golfer creates no context', () => {
        assert.deepEqual(eligible(round({ x: M(['101'],['999']) })), [],
            'a wager whose opponent is not in the round is dropped entirely');
    });

    test('ineligible formats never reach the overlap test', () => {
        assert.equal(eligible(round({ g: M(['101'],['103'], { scoring:'gross' }) })).length, 0);
        assert.equal(eligible(round({ s: M(['101'],['103'], { format:'stroke' }) })).length, 0);
        assert.equal(eligible(round({ k: M(['101'],['103'], { format:'skins' }) })).length, 0);
        assert.equal(eligible(round({ n: M(['101'],['103'], { format:'nassau' }) })).length, 1, 'net Nassau qualifies');
    });

    test('one match alone cannot overlap', () => {
        assert.equal(overlaps(round({ m1: M(['101'],['103']) })), false);
    });
});

// ============================================================================
describe('RYDER SINGLES — 0 / 0 / 5 / 8', () => {

    const plan = () => autoPlan(round(RYDER));

    test('TWO INDEPENDENT BASELINES, not one four-player baseline', () => {
        const m1 = call('dotCalcForSideMatch(' + JSON.stringify(round(RYDER)) + ','
            + JSON.stringify(M(['101'],['103'])) + ',' + JSON.stringify(cd18) + ')');
        const m2 = call('dotCalcForSideMatch(' + JSON.stringify(round(RYDER)) + ','
            + JSON.stringify(M(['102'],['104'])) + ',' + JSON.stringify(cd18) + ')');
        assert.equal(m1.matchBaseline, 5, 'match one is measured off Lee');
        assert.equal(m2.matchBaseline, 7, 'match two off Jeremy - NOT off Lee');
        assert.notEqual(m2.matchBaseline, 5,
            'a whole-group baseline would give Jeff 10 instead of 8');
    });

    test('the merged plan is 0 / 0 / 5 / 8', () => {
        const p = plan();
        assert.equal(p['101'].rel, 0, 'Lee');
        assert.equal(p['102'].rel, 0, 'Jeremy');
        assert.equal(p['103'].rel, 5, 'Dave');
        assert.equal(p['104'].rel, 8, 'Jeff');
    });

    test('the union is DISJOINT - no key is written twice', () => {
        const opts = eligible(round(RYDER));
        const seen = {};
        let collision = false;
        opts.forEach(o => {
            const c = call('dotCalcForSideMatch(' + JSON.stringify(round(RYDER)) + ','
                + JSON.stringify(o.sm) + ',' + JSON.stringify(cd18) + ')');
            Object.keys(c.relHcpById).forEach(id => { if (seen[id]) collision = true; seen[id] = true; });
        });
        assert.equal(collision, false);
        assert.deepEqual(Object.keys(seen).sort(), ['101','102','103','104']);
    });

    test('dots land on the right stroke indexes', () => {
        const p = plan();
        assert.deepEqual(dottedSIs(p, LEE), [], 'Lee is his match baseline');
        assert.deepEqual(dottedSIs(p, JEREMY), [], 'Jeremy is his own match baseline');
        assert.deepEqual(dottedSIs(p, DAVE), [1,2,3,4,5]);
        assert.deepEqual(dottedSIs(p, JEFF), [1,2,3,4,5,6,7,8]);
    });

    test('these differ from every golfer\u2019s course dots', () => {
        const p = plan();
        [[LEE,5],[JEREMY,7],[DAVE,10],[JEFF,15]].forEach(([g,h]) => {
            assert.notDeepEqual(dottedSIs(p, g), courseSIs(h), g.name + ' still shows course dots');
        });
    });

    test('SI is used, not hole number', () => {
        const p = plan();
        const holes = cd18.filter(h => dots(p, JEFF, h.hole) > 0).map(h => h.hole).sort((a,b)=>a-b);
        assert.ok(holes.includes(7), 'hole 7 is SI 1');
        assert.ok(holes.includes(14), 'hole 14 is SI 8 - in, despite the high hole number');
        assert.ok(!holes.includes(2), 'hole 2 is SI 10 - out, despite the low hole number');
    });
});

// ============================================================================
describe('AUTO AVAILABILITY AND DEFAULT', () => {

    test('the default state is auto', () => {
        assert.match(SRC, /let selectedDotMatchId = 'auto';/);
    });

    test('Auto is offered only when matches do not overlap', () => {
        assert.match(RS, /const autoAvailable = selectorApplies && !dotMatchesOverlap\(dotMatchOptions\);/);
        assert.match(RS, /autoAvailable \? `<option value="auto">/,
            'the Auto entry is omitted outright when unavailable');
    });

    test('AUTO NEVER SILENTLY CHOOSES when unavailable', () => {
        assert.match(RS, /if \(selectedDotMatchId === 'auto'\) \{\s*\n\s*if \(!autoAvailable\) selectedDotMatchId = 'course';/,
            'auto degrades to course, never to a wager');
        assert.ok(!/selectedDotMatchId = dotMatchOptions/.test(RS));
        assert.ok(!/selectedDotMatchId = .*\[0\]/.test(RS));
        // TWO LAYERS, BOTH PINNED. The resolver above already rewrites 'auto' to
        // 'course' when Auto is unavailable, so the guard on the merge branch is
        // redundant today. It is asserted anyway: it is the thing that keeps a future
        // change to the resolver from silently producing a merged allocation that the
        // overlap test said was unsafe.
        assert.match(RS, /} else if \(selectedDotMatchId === 'auto' && autoAvailable\) \{/,
            'the merge branch must guard on autoAvailable in its own right');
    });

    test('a chosen wager that no longer exists drops to course', () => {
        assert.match(RS, /!dotMatchOptions\.some\(o => o\.id === selectedDotMatchId\)/);
    });

    test('MID-ROUND OVERLAP retires Auto rather than keeping a stale merge', () => {
        // Before: two independent matches, Auto valid.
        assert.equal(overlaps(round(RYDER)), false);
        // After a third wager is created, Lee is in two matches.
        const after = round(Object.assign({}, RYDER, { m3: M(['101'],['104']) }));
        assert.equal(overlaps(after), true);
        assert.equal(eligible(after).length, 3, 'all three remain explicitly selectable');
        // The resolver has exactly one path for this, and it lands on course.
        assert.match(RS, /if \(!autoAvailable\) selectedDotMatchId = 'course';/);
    });

    test('Course is always available; Auto is conditional', () => {
        assert.match(RS, /`<option value="course">Course<\/option>`/);
    });

    test('no eligible matches means no selector at all', () => {
        assert.deepEqual(eligible(round({})), []);
        assert.match(RS, /const hasOptions = dotMatchOptions\.length > 0;/);
        assert.match(RS, /dotRow\.style\.display = "none"/);
    });

    test('a round-level match format suppresses the side-match selector', () => {
        assert.match(RS, /const roundOwnsDots = isRoundLevelMatchFormat\(gameFormat\);/);
        assert.match(RS, /const selectorApplies = !roundOwnsDots && hasOptions;/);
        ['match','nassau','bestball','ryder'].forEach(f =>
            assert.equal(call('isRoundLevelMatchFormat(' + JSON.stringify(f) + ')'), true, f));
        assert.equal(call('isRoundLevelMatchFormat("scramble")'), false, 'scramble stays excluded');
    });
});

// ============================================================================
describe('UNMATCHED GOLFERS KEEP COURSE DOTS', () => {

    test('with only Lee v Dave, Jeremy and Jeff are untouched', () => {
        const p = autoPlan(round({ m1: M(['101'],['103']) }));
        assert.equal(p['102'], undefined, 'Jeremy is in no match');
        assert.equal(p['104'], undefined, 'nor is Jeff');
        assert.deepEqual(dottedSIs(p, LEE), [], 'Lee is the baseline of his match');
        assert.deepEqual(dottedSIs(p, DAVE), [1,2,3,4,5]);
        assert.deepEqual(dottedSIs(p, JEREMY), courseSIs(7), 'ordinary 7-handicap dots');
        assert.deepEqual(dottedSIs(p, JEFF), courseSIs(15), 'ordinary 15-handicap dots');
    });

    test('the fallback is the absence of a plan entry, not a special branch', () => {
        assert.match(RS, /if \(!entry\) return courseStrokes;/);
    });
});

// ============================================================================
describe('EXPLICIT OVERRIDE', () => {

    test('selecting one wager scopes the dots to its participants', () => {
        const d = round(OVERLAP);
        const one = eligible(d).find(o => o.id === 'm1');
        const p = buildPlan(d, [one]);
        assert.deepEqual(Object.keys(p).sort(), ['101','103'], 'only Lee and Dave');
        assert.deepEqual(dottedSIs(p, LEE), []);
        assert.deepEqual(dottedSIs(p, DAVE), [1,2,3,4,5]);
        assert.deepEqual(dottedSIs(p, JEREMY), courseSIs(7));
        assert.deepEqual(dottedSIs(p, JEFF), courseSIs(15));
    });

    test('NO LEAKAGE between two matches sharing a golfer', () => {
        const d = round(OVERLAP);
        const m1 = buildPlan(d, [eligible(d).find(o => o.id === 'm1')]);
        const m3 = buildPlan(d, [eligible(d).find(o => o.id === 'm3')]);
        assert.equal(m1['103'].rel, 5, 'Dave receives 5 from Lee');
        assert.equal(m3['104'].rel, 10, 'Jeff receives 10 from Lee');
        assert.equal(m1['104'], undefined, 'Jeff is absent from the Lee/Dave plan');
        assert.equal(m3['103'], undefined, 'Dave is absent from the Lee/Jeff plan');
    });

    test('the same golfer is allocated differently in different matches', () => {
        const d = round({ a: M(['103'],['104']), b: M(['101'],['104']) });
        const opts = eligible(d);
        const pa = buildPlan(d, [opts.find(o => o.id === 'a')]);
        const pb = buildPlan(d, [opts.find(o => o.id === 'b')]);
        assert.equal(pa['104'].rel, 5,  'Jeff receives 5 from Dave');
        assert.equal(pb['104'].rel, 10, 'and 10 from Lee');
    });

    test('Course selected clears the plan entirely', () => {
        assert.match(RS, /} else if \(selectedDotMatchId !== 'course'\) \{/,
            'course takes no branch, so no plan is built');
        assert.equal(dots(null, DAVE, holeOfSI(1)), 1, 'a 10 still shows his course dot at SI 1');
        assert.deepEqual(dottedSIs(null, JEFF), courseSIs(15));
    });
});

// ============================================================================
describe('START-HOLE GATING — DISPLAY ONLY', () => {

    const LATE = { m1: M(['101'],['103'], { startHole: 6 }) };

    test('the allocation itself is unchanged by the start hole', () => {
        const early = call('dotCalcForSideMatch(' + JSON.stringify(round({ m1: M(['101'],['103']) }))
            + ',' + JSON.stringify(M(['101'],['103'])) + ',' + JSON.stringify(cd18) + ')');
        const late = call('dotCalcForSideMatch(' + JSON.stringify(round(LATE))
            + ',' + JSON.stringify(M(['101'],['103'], { startHole: 6 })) + ',' + JSON.stringify(cd18) + ')');
        assert.deepEqual(late.relHcpById, early.relHcpById, 'same engine answer');
        assert.equal(late.matchBaseline, early.matchBaseline);
    });

    test('the plan carries the start hole', () => {
        const p = autoPlan(round(LATE));
        assert.equal(p['101'].startHole, 6);
        assert.equal(p['103'].startHole, 6);
    });

    test('HOLES 1-5 show ordinary COURSE dots', () => {
        const p = autoPlan(round(LATE));
        [1,2,3,4,5].forEach(h => {
            assert.equal(dots(p, LEE, h), E.getStrokes(SI[h], 5),
                'hole ' + h + ' (SI ' + SI[h] + ') must be Lee\u2019s course dot');
            assert.equal(dots(p, DAVE, h), E.getStrokes(SI[h], 10),
                'hole ' + h + ' (SI ' + SI[h] + ') must be Dave\u2019s course dot');
        });
        // Concretely: hole 1 is SI 5, so a 5-handicap DOES stroke there off the course.
        assert.equal(dots(p, LEE, 1), 1, 'Lee strokes on hole 1 under course allocation');
    });

    test('HOLES 6-18 show MATCH dots', () => {
        const p = autoPlan(round(LATE));
        for (let h = 6; h <= 18; h++) {
            assert.equal(dots(p, LEE, h), 0, 'Lee plays off zero from hole ' + h);
            assert.equal(dots(p, DAVE, h), E.allocateMatchStrokes(5, SI[h]),
                'Dave takes his relative 5 from hole ' + h);
        }
        assert.equal(dots(p, LEE, 7), 0, 'hole 7 is SI 1 and Lee still gets nothing');
        assert.equal(dots(p, DAVE, 7), 1, 'Dave strokes on SI 1');
    });

    test('STROKE INDEX IS NOT RENUMBERED from the start hole', () => {
        const p = autoPlan(round(LATE));
        // If SI restarted at hole 6, hole 6 (SI 16) would become the new SI 1 and Dave
        // would stroke there. He must not.
        assert.equal(SI[6], 16);
        assert.equal(dots(p, DAVE, 6), 0, 'hole 6 is SI 16 - no stroke, start hole or not');
        assert.equal(SI[7], 1);
        assert.equal(dots(p, DAVE, 7), 1, 'hole 7 is still SI 1');
        assert.equal(dots(p, DAVE, 12), 1, 'hole 12 is SI 3');
        assert.equal(dots(p, DAVE, 2), E.getStrokes(10, 10), 'hole 2 is SI 10, before the start');
    });

    test('the gate applies to an EXPLICIT selection too', () => {
        const d = round(LATE);
        const p = buildPlan(d, [eligible(d).find(o => o.id === 'm1')]);
        assert.equal(p['101'].startHole, 6);
        assert.equal(dots(p, LEE, 1), 1, 'course dot before the wager existed');
        assert.equal(dots(p, LEE, 6), 0, 'match dots from the start hole');
    });

    test('the renderer gates on hole number, and is handed the hole', () => {
        assert.match(RS, /if \(holeNum < entry\.startHole\) return courseStrokes;/);
        assert.match(RS, /const dotStrokes = dotStrokesFor\(p, h\.hcpIndex, strokes, h\.hole\);/);
    });

    test('a wager starting on hole 1 gates nothing', () => {
        const p = autoPlan(round(RYDER));
        assert.equal(p['103'].startHole, 1);
        assert.equal(dots(p, DAVE, holeOfSI(1)), 1, 'match dots from the very first hole');
    });
});

// ============================================================================
describe('THE CONTEXT NOTE', () => {

    test('merged mode names the PAIRINGS, not a false single baseline', () => {
        assert.match(RS, /<strong>DOTS BY MATCH<\/strong>/);
        assert.match(RS, /dotNoteMatches\.map\(o => o\.label\.replace\(\/ vs \/g, ' v '\)\)/,
            'each pairing is listed');
        // The single-baseline wording must NOT be reachable from merged mode.
        const autoBranch = RS.slice(RS.indexOf("if (dotNoteMode === 'auto')"),
                                   RS.indexOf("} else if (dotPlanById) {"));
        assert.ok(!/Low:/.test(autoBranch), 'two matches mean two baselines - "Low" would be false');
    });

    test('a single selected match keeps the existing baseline line', () => {
        assert.match(RS, /<strong>MATCH HCP<\/strong>/);
        assert.match(RS, /Low: \$\{lowLabel\}/);
        assert.match(RS, /Playing: \$\{playing\}/);
        assert.match(RS, /formatHcpDisplay\(low\[0\]\.hcp\)/, 'a plus baseline reads (+2), never (-2)');
    });

    test('Course mode shows nothing at all', () => {
        assert.match(RS, /if \(noteHtml\) \{/);
        assert.match(RS, /matchNoteEl\.style\.display = "none"/);
        assert.match(RS, /let noteHtml = "";/, 'no branch fires for course, so it stays empty');
    });

    test('the note is still one line, not a panel', () => {
        const css = SRC.slice(SRC.indexOf('.match-hcp-note {'), SRC.indexOf('.match-hcp-note {') + 340);
        assert.match(css, /font-size: 0\.68rem/);
        assert.ok(!/min-height/.test(css));
    });
});

// ============================================================================
describe('DISPLAY ONLY — NOTHING ELSE MOVES', () => {

    test('the plan is built from engine results, never recomputed', () => {
        assert.match(SRC, /const calc = dotCalcForSideMatch\(data, o\.sm, courseData\);/);
        const fn = SRC.slice(SRC.indexOf('function buildDotPlan'), SRC.indexOf('function dotCalcForSideMatch'));
        assert.ok(!/Math\.min|parseHcp\(|matchBaseline\s*=/.test(fn),
            'buildDotPlan performs no handicap arithmetic of its own');
    });

    test('the engines are untouched by this feature', () => {
        ['money-engine.js','settlement-engine.js','action-model.js','bet-strip.js','hole-events.js']
            .forEach(f => assert.ok(
                !/dotPlanById|buildDotPlan|dotMatchesOverlap|selectedDotMatchId|dotNoteMode/.test(read(f)),
                f + ' acquired dot-context logic'));
    });

    test('gross, net and net-to-par still use the COURSE allocation', () => {
        assert.match(RS, /let gross = parseInt\(scoreVal, 10\);/);
        assert.match(RS, /const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(RS, /let net = gross - strokes;/);
        assert.ok(!/let net = gross - dotStrokes;/.test(RS));
        const chain = RS.slice(RS.indexOf('let net = gross - strokes;'), RS.indexOf('runningStats[p.id] += diff;'));
        assert.ok(!/dotStrokes|dotPlanById/.test(chain));
    });

    test('OUT / IN / TOTAL net never see the dot context', () => {
        const totals = RS.slice(RS.indexOf('let hasFront = courseData.some'));
        totals.split('\n').filter(l => /getStrokes\(/.test(l))
            .forEach(l => assert.ok(!/dotStrokes|dotPlanById/.test(l), 'section total tainted: ' + l.trim()));
    });

    test('dotStrokes drives the dots and nothing else', () => {
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

    test('match results, presses and settlement are unaffected', () => {
        const teamed = [Object.assign({}, LEE, {team:'Team 1'}), Object.assign({}, JEFF, {team:'Team 1'}),
                        Object.assign({}, JEREMY, {team:'Team 2'}), Object.assign({}, DAVE, {team:'Team 2'})];
        const noPress = plain(E.calculateMatchEngine(teamed, cd18, scores(), 'net','match','none',20,0,[]));
        const pressed = plain(E.calculateMatchEngine(teamed, cd18, scores(), 'net','match','manual',20,0,
            [{segment:'18',baseId:'18',fromHole:10},{segment:'18',baseId:'18',fromHole:14}]));
        assert.deepEqual(pressed.relHcpById, noPress.relHcpById);
        assert.equal(pressed.matchBaseline, noPress.matchBaseline);
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(18, -2), -1, 'the plus-handicap giveback survives');
    });

    test('no stored handicap, wager or Firebase write occurs', () => {
        const d = round(RYDER);
        autoPlan(d); buildPlan(d, eligible(d));
        assert.deepEqual(P4.map(p => p.hcp), ['5','7','10','15']);
        assert.ok(!/currentData\.selectedDotMatchId/.test(SRC));
        SRC.split('\n').filter(l => /selectedDotMatchId|dotPlanById/.test(l))
            .forEach(l => assert.ok(!/db\.ref|\.set\(|\.update\(/.test(l), 'leaked into a write: ' + l.trim()));
        assert.match(SRC, /Object\.assign\(\{\}, p, \{ team: 'Team 1' \}\)/, 'players are copied, never tagged in place');
    });

    test('Hole View builds no dots of its own', () => {
        const HV = SRC.slice(SRC.indexOf('function renderHoleView'), SRC.indexOf('function renderLiveTicker'));
        assert.match(HV, /cells\[i\] \? cells\[i\]\.innerHTML : ''/, 'score cells are copied verbatim');
        assert.ok(!/stroke-dots/.test(HV));
        assert.ok(!/dotPlanById|allocateMatchStrokes/.test(HV));
        assert.equal((SRC.match(/class="stroke-dots"/g) || []).length, 1,
            'dots are constructed in exactly one place in the file');
        assert.match(HV, /<div class="hv-hcp">HCP \$\{formatHcpDisplay\(hvPlayer\.hcp\)\}<\/div>/,
            'Hole View still shows the ACTUAL Playing Handicap');
    });
});

// ============================================================================
describe('SERVICE WORKER', () => {

    const sw = read('sw.js');

    test('CACHE_VERSION moved to v9', () => {
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v16-stats-canonical';/);
        assert.ok(!/const CACHE_VERSION = 'golfapp-v12-course-grid';/.test(sw));
    });

    test('the shell file list did NOT change', () => {
        const raw = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf(']', sw.indexOf('const SHELL_FILES')));
        // Comments in this block name the very files being checked, so strip them first.
        const entries = raw.split('\n').map(l => l.trim())
            .filter(l => /^'\.\/[^']+',?$/.test(l)).map(l => l.replace(/^'|',?$/g, ''));
        assert.equal(entries.length, 27, 'the shell list gained or lost an entry');
        ['./index.html','./firebase-app-compat.js','./firebase-database-compat.js','./pwa-boot.js']
            .forEach(f => assert.ok(entries.indexOf(f) !== -1, 'missing ' + f));
    });

    test('the fetch strategy is unchanged', () => {
        assert.match(sw, /Network-first: always prefer the latest deployed version/);
        assert.match(sw, /event\.respondWith\(\s*fetch\(request\)/);
    });
});
