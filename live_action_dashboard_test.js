// ============================================================================
// RETIRED — the LIVE ACTION dashboard no longer exists.
//
// This file tested buildLiveActionSummary() and the panel it rendered: a full
// second betting summary that sat beside My Round and answered the same
// questions. Two dashboards meant a golfer had to work out which one was
// authoritative, so the panel was consolidated into My Round rather than
// kept in parallel.
//
// The INFORMATION was not removed - only the duplicate presentation of it. What
// this file used to cover is now covered by the tests listed against each item
// below, and the checks in this file assert that each one still has a home. If a
// game ever stops appearing in My Round, these fail.
//
//   locked vs live language        -> scorecard_action_test.js (LIVE VS FINAL)
//   main match + press ladder      -> scorecard_action_test.js (STROKE PLAY PRESSES)
//   Skins section                  -> wave5_events_test.js, stack_action_test.js
//   Dots money conversion          -> money_engine_test.js, stack_action_test.js
//   Birdie Pool                    -> this file, below, plus money-integrity-final
//   Wolf                           -> money_engine_test.js
//   side matches                   -> scorecard_action_test.js (SIDE MATCHES)
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
function layered() {
    const sb = loadJsFile('action-model.js');
    ['handicap.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const BS = layered();

describe('LIVE ACTION — retired, and genuinely gone', () => {
    const idx = read('index.html');

    test('the duplicate dashboard and its renderers are removed', () => {
        ['buildLiveActionSummary', 'renderLiveActionSummary', 'live-action-box',
            'renderSkinsLiveBox', 'skins-live-container', 'renderCombinedTally',
            'combined-tally-row', 'renderActiveSideMatchCallout', 'side-match-callout']
            .forEach(t => assert.ok(!idx.includes(t), `${t} still present`));
    });

    test('no dead CSS was left behind for panels that no longer render', () => {
        ['.live-action-box {', '.side-match-callout-link {'].forEach(t =>
            assert.ok(!idx.includes(t), `${t} is orphaned CSS`));
    });

    test('Today\'s Action is the single betting summary that survived', () => {
        assert.ok(idx.includes('My Round'));
        assert.ok(/function renderActionCenter/.test(idx));
    });
});

describe('THE INFORMATION SURVIVED — every wager type still has a row', () => {
    const cd = makeCourseData(18);

    function round(extra) {
        const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 0, 0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 1';
        p[2].team = 'Team 2'; p[3].team = 'Team 2';
        const scores = {};
        cd.slice(0, 8).forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i < 3 ? -1 : pi % 2);
        }));
        return { p, scores, data: Object.assign({ players: p, courseData: cd, scores }, extra) };
    }

    test('Skins still has a row, with its carry', () => {
        const { p, scores, data } = round({
            gameFormat: 'stroke',
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' } }
        });
        const row = BS.buildActionRows(data, cd, scores, p).find(r => r.key === 'skins');
        assert.ok(row && row.status.length > 0);
    });

    test('Dots still has a row', () => {
        const { p, scores, data } = round({
            gameFormat: 'stroke',
            additionalGames: { dots: { enabled: true, dotPointVal: 2 } },
            dots: { h3: { p101: ['birdie'] } }
        });
        assert.ok(BS.buildActionRows(data, cd, scores, p).some(r => r.key === 'dots'));
    });

    test('REGRESSION: the Birdie Game moved into Today\'s Action, it was not dropped', () => {
        // It used to live only in the standings panel, bolted onto Current Group Scores.
        // Removing that panel without moving Birdie would have lost a live wager.
        const { p, scores, data } = round({
            gameFormat: 'stroke', birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross'
        });
        const row = BS.buildActionRows(data, cd, scores, p).find(r => r.key === 'birdie');
        assert.ok(row, 'the Birdie Game has no row');
        assert.equal(row.role, 'extra');
        assert.match(row.status, /up \$|No birdies yet/);
    });

    test('Birdie shows a POSITION mid-round, never a settled total', () => {
        const { p, scores, data } = round({
            gameFormat: 'stroke', birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross'
        });
        const row = BS.buildActionRows(data, cd, scores, p).find(r => r.key === 'birdie');
        assert.ok(!/won|final/i.test(row.status), 'mid-round birdie money is not winnings');
    });

    test('no Birdie Game means no Birdie row — no empty card', () => {
        const { p, scores, data } = round({ gameFormat: 'stroke' });
        assert.ok(!BS.buildActionRows(data, cd, scores, p).some(r => r.key === 'birdie'));
    });

    test('the main match and its presses still have rows', () => {
        const { p, scores, data } = round({
            gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'gross', nassauPressRule: '2down'
        });
        const row = BS.buildActionRows(data, cd, scores, p).find(r => r.role === 'main');
        assert.ok(row && row.status.length > 0);
    });
});
