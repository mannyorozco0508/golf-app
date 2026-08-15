const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');
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
    // NOTE: admin.html's local copies are actually named parseHcpAdmin/getStrokesAdmin, not
    // parseHcp/getStrokes — a correction to the original audit, which matched on a grep prefix
    // that didn't distinguish the two. Every other file below genuinely uses the exact names.
    const filesWithLocalCopies = [
        { label: 'admin.html', loader: () => loadHtmlInlineScript('admin.html', ['course-data.js']), parseFn: 'parseHcpAdmin', strokesFn: 'getStrokesAdmin' },
        { label: 'index.html', loader: () => loadHtmlInlineScript('index.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'leaderboard.html', loader: () => loadHtmlInlineScript('leaderboard.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'sidematches.html', loader: () => loadHtmlInlineScript('sidematches.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'skins.html', loader: () => loadHtmlInlineScript('skins.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
        { label: 'stats.html', loader: () => loadHtmlInlineScript('stats.html'), parseFn: 'parseHcp', strokesFn: 'getStrokes' },
    ];

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
