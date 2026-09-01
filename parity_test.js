const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers, buildScores } = require('./helpers/fixtures.js');

// ============================================================================
// STEP 4 — PARITY TESTS
// These do NOT consolidate the duplicated logic identified in the audit. They
// prove the duplicates currently agree with the canonical money-engine.js
// implementation, so that whenever consolidation does happen, these tests are
// the tripwire that catches it if the "canonical" version turns out to behave
// differently from what every other copy has been doing in production.
// ============================================================================

const canonical = loadJsFile('money-engine.js');

describe('PARITY — parseHcp / getStrokes local copies vs canonical (money-engine.js)', () => {
    // ADMIN'S ALIASES ARE GONE. admin.html carried parseHcpAdmin/getStrokesAdmin -
    // byte-identical to canonical under different names, which is why a grep for the
    // real names never found them. The shared-handicap extraction moved admin.html
    // onto handicap.js and deleted both aliases; a test at the foot of this file
    // proves they cannot come back.
    const filesWithLocalCopies = [
        { label: 'index.html', loader: () => loadHtmlInlineScript('index.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        // leaderboard.html is deliberately ABSENT from this list now: it no longer has
        // local copies to drift. It loads money-engine.js and uses the canonical pair
        // directly, which is the outcome this whole parity suite exists to push toward.
        // A dedicated test below asserts that, so removing it here loses no coverage.
        { label: 'sidematches.html', loader: () => loadHtmlInlineScript('sidematches.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'skins.html', loader: () => loadHtmlInlineScript('skins.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'stats.html', loader: () => loadHtmlInlineScript('stats.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
    ];

    test('leaderboard.html has NO local copy left to drift', () => {
        // The strongest form of parity: not "the duplicate matches" but "there is no
        // duplicate". leaderboard.html carried byte-identical copies of both helpers;
        // they were removed once the page began loading money-engine.js.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'leaderboard.html'), 'utf8');
        const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
        assert.ok(!/function parseHcp\s*\(/.test(inline),
            'leaderboard.html must not redeclare parseHcp');
        assert.ok(!/function getStrokes\s*\(/.test(inline),
            'leaderboard.html must not redeclare getStrokes');
        assert.match(src, /<script src="money-engine\.js">/,
            'and it must load the canonical pair instead');
    });

    test('NO page has a local copy left to drift, and admin has no aliases either', () => {
        // The strongest form of parity generalised: not "the duplicates match" but
        // "there are no duplicates". Every page that owned parseHcp/getStrokes now
        // loads handicap.js instead, and admin.html's two aliases - byte-identical to
        // canonical under different names, which is why a grep for the real names
        // never found them - are gone with the rest.
        ['admin.html', 'index.html', 'leaderboard.html', 'sidematches.html',
         'settlement.html', 'skins.html', 'stats.html', 'trip.html'].forEach(page => {
            const src = fs.readFileSync(path.join(REPO_ROOT, page), 'utf8');
            const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
            ['parseHcp', 'getStrokes', 'parseHcpAdmin', 'getStrokesAdmin'].forEach(fn =>
                assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(inline),
                    page + ' must not redeclare ' + fn));
            assert.match(src, /<script src="handicap\.js">/,
                page + ' must load the canonical module instead');
        });
    });

    test('admin.html calls the canonical names, not the retired aliases', () => {
        // The aliases had call sites. Deleting the declarations without rewriting
        // those would leave a page that throws the moment somebody opens Step 5.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.ok(!/parseHcpAdmin/.test(src), 'no reference to parseHcpAdmin may remain');
        assert.ok(!/getStrokesAdmin/.test(src), 'no reference to getStrokesAdmin may remain');
        const sandbox = loadHtmlInlineScript('admin.html');
        assert.equal(typeof sandbox.parseHcp, 'function', 'admin.html must reach canonical parseHcp');
        assert.equal(typeof sandbox.getStrokes, 'function', 'admin.html must reach canonical getStrokes');
        assert.equal(sandbox.parseHcp('+2'), -2);
    });

    const parseHcpCases = ['0', '12', '8.4', '+2', '+5.5', '', undefined, '18', '-3'];
    const getStrokesCases = [
        [1, 0], [18, 0], [1, 18], [18, 18], [1, 20], [3, 20], [9, 9], [10, 9], [17, -2], [16, -2],
    ];

    filesWithLocalCopies.forEach(({ label, loader, parseFn, strokesFn }) => {
        test(`${label}'s ${parseFn} matches canonical parseHcp for every tested input`, () => {
            const sandbox = loader();
            assert.equal(typeof sandbox[parseFn], 'function', `${label} should define ${parseFn}`);
            parseHcpCases.forEach(input => {
                const canonicalResult = canonical.parseHcp(input);
                const localResult = sandbox[parseFn](input);
                assert.equal(localResult, canonicalResult, `${label}'s ${parseFn}(${JSON.stringify(input)}) = ${localResult}, canonical = ${canonicalResult}`);
            });
        });

        test(`${label}'s ${strokesFn} matches canonical getStrokes for every tested input`, () => {
            const sandbox = loader();
            assert.equal(typeof sandbox[strokesFn], 'function', `${label} should define ${strokesFn}`);
            getStrokesCases.forEach(([hcpIndex, hcp]) => {
                const canonicalResult = canonical.getStrokes(hcpIndex, hcp);
                const localResult = sandbox[strokesFn](hcpIndex, hcp);
                assert.equal(localResult, canonicalResult, `${label}'s ${strokesFn}(${hcpIndex}, ${hcp}) = ${localResult}, canonical = ${canonicalResult}`);
            });
        });
    });
});

describe('PARITY — stats.html\'s independent settlement engine vs canonical (the audit\'s #1 finding)', () => {
    const stats = loadHtmlInlineScript('stats.html');

    test('calcWolfEngine agrees with canonical on a realistic 4-player Wolf round', () => {
        const players = makePlayers(['A', 'B', 'C', 'D'], [8, 12, 4, 18]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 76, B: 88, C: 80, D: 95 });
        const data = { players, wolfCalls: {} };
        const canonicalResult = canonical.calcWolfEngine(data, cd, scores);
        const statsResult = stats.calcWolfEngine(data, cd, scores);
        assert.equal(JSON.stringify(canonicalResult.totals), JSON.stringify(statsResult.totals), 'Wolf point totals must match exactly between stats.html and money-engine.js');
    });

    test('calcStablefordEngine agrees with canonical', () => {
        const players = makePlayers(['A', 'B'], [10, 15]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 82, B: 90 });
        const data = { players, stablefordScoring: 'net' };
        const canonicalResult = canonical.calcStablefordEngine(data, cd, scores);
        const statsResult = stats.calcStablefordEngine(data, cd, scores);
        assert.equal(JSON.stringify(canonicalResult.totals), JSON.stringify(statsResult.totals), 'Stableford point totals must match exactly');
    });

    test('calculateMatchEngine agrees with canonical on a Nassau round with a press', () => {
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1';
        players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 70, B: 75, C: 85, D: 90 });
        const canonicalResult = canonical.calculateMatchEngine(players, cd, scores, 'net', 'nassau', '2down', 10, 0, []);
        const statsResult = stats.calculateMatchEngine(players, cd, scores, 'net', 'nassau', '2down', 10, 0, []);
        assert.equal(canonicalResult.t1TotalMoney, statsResult.t1TotalMoney, 'Nassau payout must match exactly between stats.html and money-engine.js');
        assert.equal(canonicalResult.pressCount, statsResult.pressCount, 'Press count must also match — presses are exactly the kind of subtle logic that could silently drift');
    });
});

describe('PARITY — index.html\'s independent Match/Stroke engines vs canonical', () => {
    const ix = loadHtmlInlineScript('index.html');

    test('calculateMatchEngine agrees with canonical on a standalone Match Play round', () => {
        const players = makePlayers(['A', 'B'], [5, 15]);
        players[0].team = 'Team 1'; players[1].team = 'Team 2';
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 74, B: 92 });
        const canonicalResult = canonical.calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 20, 0, []);
        const indexResult = ix.calculateMatchEngine(players, cd, scores, 'net', 'match', 'none', 20, 0, []);
        assert.equal(canonicalResult.t1TotalMoney, indexResult.t1TotalMoney, 'Match Play payout must agree between index.html and money-engine.js');
    });

    test('calculateStrokeHeadToHead agrees with canonical — the newest, least field-tested engine in the app', () => {
        const players = makePlayers(['A', 'B'], [8, 22]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 77, B: 91 });
        const canonicalResult = canonical.calculateStrokeHeadToHead(players, cd, scores, 'net', 33);
        const indexResult = ix.calculateStrokeHeadToHead(players, cd, scores, 'net', 33);
        assert.equal(canonicalResult.t1TotalMoney, indexResult.t1TotalMoney, 'Stroke Play 1v1 payout must agree between index.html and money-engine.js');
        assert.equal(canonicalResult.roundComplete, indexResult.roundComplete);
    });

    test('calculateStrokeHeadToHead agrees with canonical on an incomplete round too (not just the happy path)', () => {
        const players = makePlayers(['A', 'B'], [0, 0]);
        const cd = makeCourseData(18);
        const scores = buildScores(players, cd, { A: 40, B: 45 }, 9);
        const canonicalResult = canonical.calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        const indexResult = ix.calculateStrokeHeadToHead(players, cd, scores, 'net', 20);
        assert.equal(canonicalResult.roundComplete, false);
        assert.equal(indexResult.roundComplete, false);
        assert.equal(canonicalResult.t1TotalMoney, indexResult.t1TotalMoney);
    });
});

// ============================================================================
// PARITY — Birdie Pool's THREE independent copies
//
// calculateBirdieGameTotals exists in three places and none of them was
// guarded:
//
//     settlement-engine.js   calculateBirdieGameTotalsForSettle   (settles)
//     index.html             calculateBirdieGameTotals            (scorecard)
//     stats.html             calculateBirdieGameTotalsForSettle   (stats page)
//
// BATCH 3 UPDATE: stats.html's copy is GONE. That page now loads
// settlement-engine.js and uses the canonical function - it was byte-identical
// when it was deleted, so nothing about the Birdie Pool's behaviour changed, and
// the golden Final Scorecard for a birdie round in
// stats_canonical_render_test.js is unchanged too. Two independent copies remain
// (settlement-engine.js and index.html) and are still compared below. stats.html
// stays in the comparison as a CONSUMER: running it proves the page ends up with
// canonical behaviour at runtime, which source text alone cannot show.
//
// The name differs between files, so a grep for one name found only one copy -
// which is part of why this went unguarded while Dots and Hi-Lo were caught.
//
// This is the same latent-drift class that cost a $15 discrepancy once before:
// per-press stakes landed in money-engine.js and not in the page copies, and a
// $10 Nassau with a $25 press showed $30 live while the Receipt paid $45. Three
// copies is worse odds than two.
//
// The copies AGREE today - verified before writing this. These tests are the
// tripwire, not a repair.
// ============================================================================

describe('PARITY — Birdie Pool\'s three independent copies', () => {
    // settlement-engine.js calls getStrokes/parseHcp from money-engine.js, exactly as
    // every page loads them: money-engine first, then settlement-engine. Loading it
    // alone throws on any net-scoring round, so the sandbox mirrors production order
    // rather than the file in isolation.
    const settle = (() => {
        const vm = require('node:vm');
        const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                     parseInt, parseFloat, Date, Set, Map };
        vm.createContext(sb);
        ['handicap.js', 'money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js']
            .forEach(f => vm.runInContext(
                fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f }));
        return sb;
    })();
    const ix = loadHtmlInlineScript('index.html');
    // stats.html loads action-model.js and settlement-engine.js in production, and
    // owns no Birdie copy of its own since Batch 3 - so it must be given those, or
    // this entry resolves to undefined and the suite guards nothing.
    const st = loadHtmlInlineScript('stats.html', ['action-model.js', 'settlement-engine.js']);

    const cd = makeCourseData(18);
    // One low handicap and one 18 so a net round genuinely differs from gross.
    const players = makePlayers(['Marty', 'Manny', 'Carp', 'Scott'], [0, 18, 0, 0]);

    // mut shapes individual holes; everything else is a par-4 par.
    function scores(mut) {
        const s = {};
        players.forEach(p => cd.forEach(h => { s['p' + p.id + '_h' + h.hole] = h.par; }));
        if (mut) mut(s, players, cd);
        return s;
    }
    function allThree(data, sc) {
        return {
            settle: settle.calculateBirdieGameTotalsForSettle(data, cd, sc),
            index: ix.calculateBirdieGameTotals(data, cd, sc),
            stats: st.calculateBirdieGameTotalsForSettle(data, cd, sc),
        };
    }
    // JSON round-trip: values crossing a vm boundary are not the test's own objects.
    const norm = (o) => JSON.stringify(JSON.parse(JSON.stringify(o)));

    function assertAgree(label, data, sc) {
        const r = allThree(data, sc);
        assert.equal(norm(r.index), norm(r.settle),
            label + ': index.html has drifted from settlement-engine.js');
        assert.equal(norm(r.stats), norm(r.settle),
            label + ': stats.html has drifted from settlement-engine.js');
        return JSON.parse(JSON.stringify(r.settle));
    }

    const ON = (over) => Object.assign({
        players, birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross',
    }, over || {});

    test('a single birdie: the whole field pays the one golfer', () => {
        const totals = assertAgree('birdie', ON(), scores(s => { s.p101_h1 = 3; }));
        // Zero-sum by construction, and the birdie maker is up.
        assert.ok(totals[101] > 0, 'Marty made the birdie');
        assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 0, 'zero-sum');
    });

    test('an eagle is worth double a birdie', () => {
        const b = assertAgree('birdie', ON(), scores(s => { s.p101_h1 = 3; }));
        const e = assertAgree('eagle', ON(), scores(s => { s.p101_h1 = 2; }));
        assert.equal(e[101], b[101] * 2, 'Eagle = 2x, as the setup label promises');
    });

    test('an albatross is worth triple', () => {
        const b = assertAgree('birdie', ON(), scores(s => { s.p101_h1 = 3; }));
        const a = assertAgree('albatross', ON(), scores(s => { s.p101_h1 = 1; }));
        assert.equal(a[101], b[101] * 3);
    });

    test('several birdies across several golfers', () => {
        const totals = assertAgree('several', ON(),
            scores(s => { s.p101_h1 = 3; s.p102_h4 = 3; s.p103_h5 = 2; }));
        assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 0, 'still zero-sum');
    });

    test('a round with no birdies pays nobody', () => {
        const totals = assertAgree('none', ON(), scores(null));
        Object.values(totals).forEach(v => assert.equal(v, 0));
    });

    test('NET scoring differs from GROSS, and all three agree on both', () => {
        // Manny plays off 18 - a shot every hole - so his net par is a net birdie.
        const sc = scores(s => { s.p102_h1 = 4; });
        const gross = assertAgree('gross', ON({ birdieScoringType: 'gross' }), sc);
        const net = assertAgree('net', ON({ birdieScoringType: 'net' }), sc);
        assert.notEqual(JSON.stringify(gross), JSON.stringify(net),
            'a shot a hole must change who has a birdie');
    });

    test('a plus handicap is handled identically everywhere', () => {
        const plus = makePlayers(['Marty', 'Manny'], ['+2', 10]);
        const sc = {};
        plus.forEach(p => cd.forEach(h => { sc['p' + p.id + '_h' + h.hole] = h.par; }));
        sc['p' + plus[0].id + '_h1'] = 3;
        assertAgree('plus hcp',
            { players: plus, birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'net' }, sc);
    });

    test('the unit value scales every copy the same way', () => {
        const sc = scores(s => { s.p101_h1 = 3; });
        const two = assertAgree('unit 2', ON({ birdieUnitVal: 2 }), sc);
        const five = assertAgree('unit 5', ON({ birdieUnitVal: 5 }), sc);
        assert.equal(five[101], two[101] / 2 * 5, 'linear in the unit value');
    });

    test('a partial round scores only the holes played', () => {
        const sc = {};
        players.forEach(p => cd.forEach(h => {
            if (h.hole <= 6) sc['p' + p.id + '_h' + h.hole] = h.par;
        }));
        sc.p101_h1 = 3;
        const totals = assertAgree('partial', ON(), sc);
        assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), 0);
    });

    test('the game switched off pays nobody, in every copy', () => {
        const sc = scores(s => { s.p101_h1 = 3; });
        const r = allThree(ON({ birdieGameEnabled: false }), sc);
        [r.settle, r.index, r.stats].forEach(t =>
            assert.equal(Object.keys(JSON.parse(JSON.stringify(t))).length, 0,
                'disabled means no totals at all'));
    });

    test('a missing unit value is treated the same everywhere', () => {
        // Absent unitVal defaults to 0 - nobody pays. Worth pinning: a copy that
        // defaulted to 1 instead would invent money out of nothing.
        const sc = scores(s => { s.p101_h1 = 3; });
        const totals = assertAgree('no unit value',
            { players, birdieGameEnabled: true, birdieScoringType: 'gross' }, sc);
        Object.values(totals).forEach(v => assert.equal(v, 0));
    });

    test('two independent copies remain, and stats.html is now a consumer — this guard is not vacuous', () => {
        // A copy WAS deleted, which is good news, and this suite was told rather
        // than left silently passing against survivors. The two genuine copies are
        // still pinned; stats.html is pinned the other way round.
        const files = {
            'settlement-engine.js': /function calculateBirdieGameTotalsForSettle\(/,
            'index.html': /function calculateBirdieGameTotals\(/,
        };
        Object.keys(files).forEach(f => {
            const src = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
            assert.match(src, files[f], f + ' no longer has the copy this suite compares');
        });

        // BATCH 3. Coverage is not weakened, it is inverted: stats.html must NOT
        // declare its own, and must load the canonical engine instead.
        const statsSrc = fs.readFileSync(path.join(REPO_ROOT, 'stats.html'), 'utf8');
        const statsInline = statsSrc.replace(/<script src=[^>]*><\/script>/g, '');
        assert.ok(!/function calculateBirdieGameTotalsForSettle\s*\(/.test(statsInline),
            'stats.html must not redeclare calculateBirdieGameTotalsForSettle');
        assert.match(statsSrc, /<script src="settlement-engine\.js">/,
            'stats.html must load the canonical Birdie totals instead');
        [settle.calculateBirdieGameTotalsForSettle,
         ix.calculateBirdieGameTotals,
         st.calculateBirdieGameTotalsForSettle].forEach((fn, i) =>
            assert.equal(typeof fn, 'function', 'copy ' + i + ' must be callable'));
    });
});
