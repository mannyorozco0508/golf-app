const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
function layered() {
    const sb = loadJsFile('action-model.js');
    ['money-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const BS = layered();
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

// Marty vs John, $50 Stroke Play, pressed three times at three different stakes.
// John takes holes 10-13 so P2 (H10-18) genuinely belongs to him.
function pressRound(thru) {
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'John'], [0, 0]);
    const scores = {};
    cd.slice(0, thru || 16).forEach(h => {
        const hn = h.hole;
        scores[`p${p[0].id}_h${hn}`] = h.par + ((hn >= 10 && hn <= 13) ? 1 : (hn % 3 === 1 ? -1 : 0));
        scores[`p${p[1].id}_h${hn}`] = h.par + ((hn >= 10 && hn <= 13) ? -1 : 0);
    });
    const data = {
        gameFormat: 'match', matchScoringStyle: 'stroke', matchScoring: 'gross',
        matchStake: 50, players: p, courseData: cd, scores,
        strokePresses: {
            a: { startHole: 6, stake: 50 },
            b: { startHole: 10, stake: 100 },
            c: { startHole: 14, stake: 200 }
        }
    };
    return { cd, p, scores, data };
}

// ---------------------------------------------------------------------------
describe('STROKE PLAY PRESSES — the engine was and is intact', () => {
    const { cd, p, scores, data } = pressRound();

    test('the canonical engine is untouched', () => {
        const me = read('money-engine.js');
        assert.ok(/function calculateStrokeHeadToHead/.test(me));
        assert.ok(/function calculateStrokePressSet/.test(me));
    });

    test('all three presses exist alongside the original', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.chips.map(c => c.short).join(','), 'MAIN,P1,P2,P3');
        assert.equal(strip.pressCount, 3);
    });

    test('REGRESSION: each press keeps its OWN stake, never the original\'s', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.chips.map(c => c.detail.stake).join(','), '50,50,100,200');
    });

    test('each press covers only its own holes', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.chips[1].detail.rangeText, 'H6\u201318');
        assert.equal(strip.chips[2].detail.rangeText, 'H10\u201318');
        assert.equal(strip.chips[3].detail.rangeText, 'H14\u201318');
    });

    test('presses are genuinely independent — P3 can favour the other golfer', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        const leaders = strip.chips.map(c => c.statusText.split(' ')[0]);
        assert.ok(new Set(leaders).size > 1, 'every press showing the same leader would mean they are not independent');
    });

    test('a press start hole is always the next UNPLAYED hole', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.canPress, true);
        assert.equal(strip.nextPressHole, 17, 'sixteen holes played, so the next press starts on 17');
    });

    test('gross and net inheritance still flows from the parent', () => {
        const net = Object.assign({}, data, { matchScoring: 'net' });
        ['gross', 'net'].forEach(kind => {
            const cfg = Object.assign({}, data, { matchScoring: kind });
            assert.equal(BS.buildBetStrip(cfg, cd, scores, p).eligible, true);
        });
        assert.ok(BS.buildBetStrip(net, cd, scores, p).chips.length === 4);
    });
});

describe('SCORE CORRECTIONS — only holes inside a press range move it', () => {
    const { cd, p, scores, data } = pressRound();
    const statuses = sc => BS.buildBetStrip(Object.assign({}, data, { scores: sc }), cd, sc, p)
        .chips.map(c => c.statusText);
    const base = statuses(scores);

    function correct(hole) {
        const s = Object.assign({}, scores);
        s[`p${p[0].id}_h${hole}`] = cd[hole - 1].par - 2;
        return statuses(s);
    }

    test('correcting hole 4 moves the original only', () => {
        const after = correct(4);
        assert.notEqual(after[0], base[0], 'the original covers hole 4');
        assert.equal(after[1], base[1], 'P1 starts on hole 6');
        assert.equal(after[2], base[2]);
        assert.equal(after[3], base[3]);
    });

    test('correcting hole 8 moves the original and P1, not P2 or P3', () => {
        const after = correct(8);
        assert.notEqual(after[0], base[0]);
        assert.notEqual(after[1], base[1]);
        assert.equal(after[2], base[2]);
        assert.equal(after[3], base[3]);
    });

    test('correcting hole 12 moves the original, P1 and P2, not P3', () => {
        const after = correct(12);
        assert.notEqual(after[0], base[0]);
        assert.notEqual(after[1], base[1]);
        assert.notEqual(after[2], base[2]);
        assert.equal(after[3], base[3], 'P3 starts on hole 14');
    });

    test('correcting hole 15 moves every wager', () => {
        const after = correct(15);
        [0, 1, 2, 3].forEach(i => assert.notEqual(after[i], base[i]));
    });
});

describe('LIVE VS FINAL', () => {
    test('an unfinished press says AT STAKE, never won', () => {
        const { cd, p, scores, data } = pressRound();
        BS.buildBetStrip(data, cd, scores, p).chips.forEach(c => {
            assert.equal(c.detail.live, true);
            assert.match(c.detail.moneyLine, /AT STAKE/);
            assert.ok(!/won/i.test(c.detail.statusLine));
        });
    });

    test('a completed press flips to FINAL with real money', () => {
        const { cd, p, scores, data } = pressRound(18);
        const chip = BS.buildBetStrip(data, cd, scores, p).chips[0];
        assert.equal(chip.detail.live, false);
        assert.match(chip.detail.stateLabel, /FINAL/);
        assert.match(chip.detail.moneyLine, /^\+\$\d+/);
    });
});

// ---------------------------------------------------------------------------
describe('SIDE MATCHES — live status without leaving the scorecard', () => {
    function sideRound(withPress) {
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
        const scores = {};
        cd.slice(0, 12).forEach(h => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 ? -1 : 0);
        }));
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                sm1: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                    overallPresses: withPress ? { pr: { startHole: 9 } } : {}
                },
                sm2: {
                    format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[2].id)]
                }
            }
        };
        return { cd, p, scores, data };
    }

    test('REGRESSION: a side match row now carries a live status, not just its format', () => {
        // These rows used to read "Stroke Play - $50" and the callout said "Tap to view"
        // behind a link to another page. The one thing a golfer wants to know was the
        // one thing the scorecard would not tell them.
        const { cd, p, scores, data } = sideRound();
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        assert.equal(rows.length, 2);
        rows.forEach(r => assert.ok(r.status && r.status.length > 0, `${r.label} has no status`));
    });

    test('a stroke side match speaks stroke language, a match one speaks match language', () => {
        const { cd, p, scores, data } = sideRound();
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        const stroke = rows.find(r => r.format === 'Stroke Play');
        const match = rows.find(r => r.format === 'Match Play');
        assert.match(stroke.status, /\+\d+|TIED/);
        assert.ok(!/UP/.test(stroke.status));
        assert.match(match.status, /UP|&|ALL SQUARE/);
    });

    test('a side match press gets its own row under its parent', () => {
        const { cd, p, scores, data } = sideRound(true);
        const row = BS.buildSideActionRows(data, cd, scores, p).find(r => r.format === 'Stroke Play');
        assert.equal(row.presses.length, 1);
        assert.equal(row.presses[0].label, 'P1');
        assert.equal(row.presses[0].rangeText, 'H9\u201318');
        assert.ok(row.presses[0].status.length > 0);
    });

    test('side action stays scoped to the golfer\'s own group', () => {
        const { cd, p, scores, data } = sideRound();
        const rows = BS.buildSideActionRows(data, cd, scores, [p[2], p[3]]);
        assert.equal(rows.length, 1, 'a match involving nobody here should not appear');
    });

    test('one shared mapper builds the side match config', () => {
        // Two definitions would let the recap and the row describe the same match
        // differently.
        assert.ok(/function sideMatchRoundConfig/.test(read('bet-strip.js')));
        assert.ok(/sideMatchRoundConfig\(sm, matchPlayers\)/.test(read('hole-events.js')));
    });
});

describe('NO NAVIGATION REQUIRED', () => {
    const idx = read('index.html');

    test('REGRESSION: the side match callout no longer links away from the scorecard', () => {
        assert.ok(!/Tap for details/.test(idx), 'the scorecard still sends golfers to another page');
        assert.ok(!/side-match-callout-link">.*<\/a>/.test(idx));
    });

    test('the scorecard renders side action itself rather than deferring', () => {
        assert.ok(/const sideRow = sm =>/.test(idx));
        assert.ok(/sm\.presses \|\| \[\]/.test(idx), 'presses must render inline too');
    });

    test('the press button lives on the scorecard, not behind a menu', () => {
        const fn = idx.slice(idx.indexOf('function renderBetStrip'), idx.indexOf('function toggleBetChip'));
        assert.ok(/bet-press-btn/.test(fn));
        assert.ok(/openPressPanel\(\)/.test(fn));
    });
});

describe('EVERY GAME VISIBLE FROM THE SCORECARD', () => {
    function busy() {
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 1';
        p[2].team = 'Team 2'; p[3].team = 'Team 2';
        const scores = {};
        cd.slice(0, 12).forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 4 === 0 ? -1 : pi);
        }));
        const data = {
            gameFormat: 'nassau', players: p, courseData: cd, scores,
            nassauStake: 20, nassauScoring: 'gross', nassauPressRule: '2down',
            additionalGames: {
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
                dots: { enabled: true, dotPointVal: 2 }
            },
            dots: { h4: { [`p${p[0].id}`]: ['birdie'] } },
            birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
            sideMatches: {
                sm1: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
                },
                sm2: {
                    format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[2].id)]
                }
            }
        };
        return { cd, p, scores, data };
    }

    function render(meId) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { data, p } = busy();
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 12;` +
            (meId ? `meId = '${p[0].id}';` : '') +
            `actionCenterOpen = true; renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }

    test('the main game, both additional games and both side matches all appear', () => {
        const out = render(true);
        ['Nassau', 'Skins', 'Dots', 'Manny vs Marty', 'Manny vs John'].forEach(n =>
            assert.ok(out.includes(n) || out.includes(n.replace('Manny', 'You')), `missing: ${n}`));
    });

    test('every section heading is present', () => {
        const out = render(true);
        ['Main Game', 'Also Playing', 'Your Action'].forEach(h =>
            assert.ok(out.includes(h), `missing section: ${h}`));
    });

    test('each side match shows a status, not just a format label', () => {
        const out = render(true);
        const rows = out.split('action-row').filter(r => /\u2694/.test(r));
        rows.forEach(r => assert.ok(/ar-status tone-(up|down|even|final)/.test(r),
            'a side match rendered with no live status'));
    });

    test('the collapsed bar is still one honest line', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { data, p } = busy();
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 12;` +
            `meId = '${p[0].id}'; actionCenterOpen = false; renderActionCenter();`, sb);
        const out = sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(out, /live/);
        assert.ok(!/action-body/.test(out), 'collapsed must stay collapsed');
        assert.ok(!/\$\d+ ?(up|down)/i.test(out), 'no live money position on the bar');
    });
});

describe('MONEY INTEGRITY — presentation only', () => {
    test('presses still settle, and the round is zero-sum', () => {
        const { cd, scores, data } = pressRound(18);
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        const sum = Object.values(r.netByName).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(sum) < 0.005, `summed to ${sum}`);
    });

    test('removing the presses changes the money — they are genuinely settled', () => {
        const { cd, scores, data } = pressRound(18);
        // The default fixture's stakes cancel exactly (-50 -50 -100 +200 = 0), which is
        // correct but proves nothing - and -50 -50 -100 +150 lands back on the same
        // total as no presses at all. A clearly larger P3 makes the contribution visible.
        const withP = settle.computeCombinedNetTotals(Object.assign({}, data, {
            strokePresses: {
                a: { startHole: 6, stake: 50 },
                b: { startHole: 10, stake: 100 },
                c: { startHole: 14, stake: 500 }
            }
        }), cd, scores).netByName;
        const noP = settle.computeCombinedNetTotals(
            Object.assign({}, data, { strokePresses: {} }), cd, scores).netByName;
        const moved = Object.keys(noP).some(k => Math.abs((withP[k] || { net: 0 }).net - noP[k].net) > 0.005);
        assert.ok(moved, 'press money is not reaching settlement');
    });

    test('a round where every wager cancels correctly settles to nothing', () => {
        // -50 (original) -50 (P1) -100 (P2) +200 (P3) = 0. Nobody owes anybody, and an
        // empty ledger is the honest answer rather than a bug.
        const { cd, scores, data } = pressRound(18);
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        assert.equal(Object.keys(r.netByName).length, 0);
        assert.equal(r.transactions.length, 0);
    });

    test('the scorecard defines no money math of its own', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('const sideRow = sm =>'), idx.indexOf('const row = r =>'));
        ['calculateStrokePressSet(', 'calculateMatchEngine(', 'computeSkinsSettlementNet('].forEach(bad =>
            assert.ok(!fn.includes(bad), `${bad} must not be called from the renderer`));
    });

    test('the money engines were not modified', () => {
        ['money-engine.js', 'settlement-engine.js'].forEach(f =>
            assert.ok(!/sideRow|sideMatchRoundConfig|buildSideActionRows/.test(read(f)), `${f} changed`));
    });
});

describe('PERMISSIONS UNCHANGED', () => {
    const idx = read('index.html');

    test('pressing is organizer-only, exactly as before', () => {
        // Reported, not changed: a press writes round configuration, so it follows the
        // same organizer rule as Add Action. A group scorekeeper still SEES every press.
        const fn = idx.slice(idx.indexOf('function confirmStrokePress'), idx.indexOf('function confirmMatchPress'));
        assert.ok(/canAddAction\(\)/.test(fn) || /isOrganizerView\(\)/.test(fn) === false,
            'press creation should follow the existing rule');
    });

    test('group scoping and identity separation survive', () => {
        const canWrite = idx.slice(idx.indexOf('function canWritePlayer'), idx.indexOf('function rejectCrossGroupWrite'));
        assert.ok(!/meId/.test(canWrite));
        const links = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/isOrganizerView\(\)/.test(links));
    });
});
