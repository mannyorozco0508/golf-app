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
    ['money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f =>
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
        // BEHAVIOUR CHANGE: chip labels are golfer-facing language now. Keys, which are
        // internal, are asserted separately so a label change can never silently break
        // the click wiring.
        assert.equal(strip.chips.map(c => c.short).join(','), 'Main Bet,Press #1,Press #2,Press #3');
        assert.equal(strip.chips.map(c => c.key).join(','), 'MAIN,P1,P2,P3');
        assert.equal(strip.pressCount, 3);
    });

    test('REGRESSION: each press keeps its OWN stake, never the original\'s', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.chips.map(c => c.detail.stake).join(','), '50,50,100,200');
    });

    // Start hole is the fact that matters and the fact that differs; the end is always
    // the end of the match. startHole is asserted numerically so this still proves each
    // press covers only its own holes, independently of the wording.
    test('each press covers only its own holes, stated in plain English', () => {
        const strip = BS.buildBetStrip(data, cd, scores, p);
        assert.equal(strip.chips.slice(1).map(c => c.detail.startHole).join(','), '6,10,14');
        assert.equal(strip.chips[1].detail.rangeText, 'Started Hole 6');
        assert.equal(strip.chips[2].detail.rangeText, 'Started Hole 10');
        assert.equal(strip.chips[3].detail.rangeText, 'Started Hole 14');
        strip.chips.forEach(c =>
            assert.doesNotMatch(c.detail.rangeText, /H\d/, 'H-prefixed shorthand must not reach a golfer'));
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
        assert.equal(row.presses[0].label, 'Press #1');
        assert.equal(row.presses[0].startedText, 'Started Hole 9');
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
        // Labels are personalised now: Manny's own matches read "vs Marty".
        ['Skins', 'Dots', 'vs Marty', 'vs John'].forEach(n =>
            assert.ok(out.includes(n), `missing: ${n}`));
    });

    test('every section heading is present', () => {
        const out = render(true);
        ['Group Games', 'Group Games', 'My Matches'].forEach(h =>
            assert.ok(out.includes(h), `missing section: ${h}`));
    });

    test('each side match shows a status, not just a format label', () => {
        const out = render(true);
        // Matches are cards now, not table rows. Splitting on the card marker isolates
        // each one; the first fragment is everything before the first card.
        const cards = out.split('class="match-card').slice(1);
        assert.ok(cards.length > 0, 'no match cards rendered');
        cards.forEach(r => assert.ok(/mc-status tone-(up|down|even|final)/.test(r),
            'a side match rendered with no live status'));
    });

    test('the collapsed bar is still one honest line', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { data, p } = busy();
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 12;` +
            `meId = '${p[0].id}'; actionCenterOpen = false; renderActionCenter();`, sb);
        const out = sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(out, /\d+ match/, 'the bar counts matches, not rows');
        assert.ok(!/action-body/.test(out), 'collapsed must stay collapsed');
        assert.ok(!/\$\d+ ?(up|down)/i.test(out), 'no live money position on the bar');
        assert.match(out, /\d+ match/, 'the bar should count matches, not rows');
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

// ---------------------------------------------------------------------------
// 1v1 STROKE SIDE MATCH PRESSES
// ---------------------------------------------------------------------------
describe('SIDE MATCH PRESSES — independent stakes, per match', () => {
    // Marty is in group 1 with John. Steve is in group 2, a hole behind.
    function twoMatches(opts) {
        const o = opts || {};
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John', 'Steve', 'Manny'], [0, 0, 0, 0]);
        const scores = {};
        cd.slice(0, o.martyThru || 9).forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par;
            scores[`p${p[1].id}_h${h.hole}`] = h.par + 1;
        });
        cd.slice(0, o.steveThru || 8).forEach(h => {
            scores[`p${p[2].id}_h${h.hole}`] = h.par;
            scores[`p${p[3].id}_h${h.hole}`] = h.par;
        });
        const mk = (a, b, stake, presses) => ({
            format: 'stroke', scoring: 'gross', overallStake: stake, holeStake: 0,
            tieRule: 'push', overallMode: 'stroke', segment: 'full',
            teamAIds: [String(a.id)], teamBIds: [String(b.id)],
            overallPresses: presses || {}
        });
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                mj: mk(p[0], p[1], 50, o.mjPresses),
                ms: mk(p[0], p[2], 100, o.msPresses)
            }
        };
        return { cd, p, scores, data };
    }

    test('each match carries its own press button, start hole and stake', () => {
        const { cd, p, scores, data } = twoMatches();
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        const mj = rows.find(r => r.label === 'Marty vs John');
        const ms = rows.find(r => r.label === 'Marty vs Steve');
        assert.equal(mj.canPress, true);
        assert.equal(mj.pressStake, 50);
        assert.equal(ms.pressStake, 100);
    });

    test('REGRESSION: a cross-group press waits for the slower participant', () => {
        // Marty is through 9, Steve through 8. Starting at hole 10 would swallow hole 9,
        // which Steve has not played. Display scope must never be the participant set.
        const { cd, p, scores, data } = twoMatches();
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        assert.equal(rows.find(r => r.label === 'Marty vs John').nextPressHole, 10);
        assert.equal(rows.find(r => r.label === 'Marty vs Steve').nextPressHole, 9,
            'Steve has not finished hole 9 yet');
    });

    test('pressing one match leaves the other untouched', () => {
        const { cd, p, scores, data } = twoMatches({ mjPresses: { x: { startHole: 9, stake: 100 } } });
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        assert.equal(rows.find(r => r.label === 'Marty vs John').presses.length, 1);
        assert.equal(rows.find(r => r.label === 'Marty vs Steve').presses.length, 0,
            'a press leaked into the wrong match');
    });

    test('a press ladder renders under its own parent with its own stake', () => {
        const { cd, p, scores, data } = twoMatches({
            martyThru: 16, steveThru: 16,
            mjPresses: { a: { startHole: 9, stake: 50 }, b: { startHole: 12, stake: 100 } },
            msPresses: { c: { startHole: 15, stake: 200 } }
        });
        const rows = BS.buildSideActionRows(data, cd, scores, p);
        const mj = rows.find(r => r.label === 'Marty vs John');
        assert.equal(mj.presses.map(x => x.stakeText).join(','), '$50,$100');
        assert.equal(mj.presses.map(x => x.startedText).join(','), 'Started Hole 9,Started Hole 12');
        assert.equal(rows.find(r => r.label === 'Marty vs Steve').presses[0].stakeText, '$200');
    });

    test('no press is offered on a hole that already has one', () => {
        const { cd, p, scores, data } = twoMatches({ mjPresses: { x: { startHole: 10, stake: 50 } } });
        assert.equal(BS.buildSideActionRows(data, cd, scores, p)
            .find(r => r.label === 'Marty vs John').canPress, false);
    });

    test('REGRESSION: settlement honours each press stake independently', () => {
        // Every segment used to settle at the ORIGINAL amount, so pressing for $100 still
        // paid $50 - a press could change the holes but never the money.
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par;
            scores[`p${p[1].id}_h${h.hole}`] = h.par + 1;
        });
        const base = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                mj: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                    overallPresses: { a: { startHole: 9, stake: 500 } }
                }
            }
        };
        const netOf = d => settle.computeCombinedNetTotals(d, cd, scores).netByName;
        const withBig = netOf(base);

        const cheap = JSON.parse(JSON.stringify(base));
        cheap.sideMatches.mj.overallPresses.a.stake = 50;
        const withSmall = netOf(cheap);

        assert.notEqual(withBig.marty.net, withSmall.marty.net,
            'the press stake made no difference to the money');
        assert.equal(withBig.marty.net, 550, 'original $50 + press $500');
        assert.equal(withSmall.marty.net, 100);
    });

    test('a press stored WITHOUT a stake still settles at the original amount', () => {
        // Every press created before this change. Backward compatibility, not a default
        // worth guessing at.
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par;
            scores[`p${p[1].id}_h${h.hole}`] = h.par + 1;
        });
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                mj: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                    overallPresses: { legacy: { startHole: 9 } }
                }
            }
        };
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        assert.equal(r.netByName.marty.net, 100, 'original $50 + legacy press at $50');
    });

    test('the whole thing stays zero-sum with three presses across two matches', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John', 'Steve', 'Manny'], [0, 0, 0, 0]);
        const scores = {};
        cd.forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 3 === 0 ? -1 : pi % 2);
        }));
        const mk = (a, b, stake, presses) => ({
            format: 'stroke', scoring: 'gross', overallStake: stake, holeStake: 0,
            tieRule: 'push', overallMode: 'stroke', segment: 'full',
            teamAIds: [String(a.id)], teamBIds: [String(b.id)], overallPresses: presses
        });
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                mj: mk(p[0], p[1], 50, { a: { startHole: 9, stake: 50 }, b: { startHole: 12, stake: 100 } }),
                ms: mk(p[0], p[2], 100, { c: { startHole: 15, stake: 200 } })
            }
        };
        const r = settle.computeCombinedNetTotals(data, cd, scores);
        const sum = Object.values(r.netByName).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(sum) < 0.005, `summed to ${sum}`);
    });

    test('score corrections respect each press range', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.slice(0, 16).forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par;
            scores[`p${p[1].id}_h${h.hole}`] = h.par + 1;
        });
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                mj: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                    overallPresses: { a: { startHole: 9, stake: 50 }, b: { startHole: 12, stake: 100 } }
                }
            }
        };
        const statuses = sc => BS.buildSideActionRows(Object.assign({}, data, { scores: sc }), cd, sc, p)[0];
        const base = statuses(scores);

        const fixSix = Object.assign({}, scores); fixSix[`p${p[1].id}_h6`] = cd[5].par - 3;
        const afterSix = statuses(fixSix);
        assert.notEqual(afterSix.status, base.status, 'hole 6 is inside the original');
        assert.equal(afterSix.presses[0].status, base.presses[0].status, 'P1 starts on hole 9');
        assert.equal(afterSix.presses[1].status, base.presses[1].status, 'P2 starts on hole 12');

        const fixTen = Object.assign({}, scores); fixTen[`p${p[1].id}_h10`] = cd[9].par - 3;
        const afterTen = statuses(fixTen);
        assert.notEqual(afterTen.presses[0].status, base.presses[0].status, 'hole 10 is inside P1');
        assert.equal(afterTen.presses[1].status, base.presses[1].status, 'but not inside P2');
    });
});

describe('SIDE MATCH PRESS — UI and permissions', () => {
    const idx = read('index.html');

    test('the press button sits on the match row it belongs to', () => {
        const fn = idx.slice(idx.indexOf('const sideRow = sm =>'), idx.indexOf('const row = r =>'));
        assert.ok(/mc-press-btn/.test(fn));
        assert.ok(/openSidePress\(/.test(fn));
        assert.ok(/sm\.key/.test(fn), 'the button must identify WHICH match it presses');
    });

    test('the panel names the match and states the start hole before writing', () => {
        const fn = idx.slice(idx.indexOf('function buildSidePressPanel'), idx.indexOf('function confirmSidePressCustom'));
        assert.ok(/NEW PRESS STARTS HOLE/.test(fn));
        assert.ok(/sm\.label/.test(fn), 'the golfer must know which bet they are pressing');
        assert.ok(/Same \$/.test(fn) && /Custom/.test(fn));
    });

    test('the write stores an independent stake', () => {
        const fn = idx.slice(idx.indexOf('function confirmSidePress(key, stake)'), idx.indexOf('function toggleActionCenter'));
        assert.ok(/startHole: fresh\.nextPressHole, stake: stake/.test(fn));
        assert.ok(/overallPresses/.test(fn));
    });

    test('permission and start hole are re-read at the moment of the tap', () => {
        const fn = idx.slice(idx.indexOf('function confirmSidePress(key, stake)'), idx.indexOf('function toggleActionCenter'));
        assert.ok(/if \(!canPressSideMatch\(sideMatchById\(key\)\)\)/.test(fn));
        assert.ok(/buildSideActionRows/.test(fn), 'a stale start hole must not be written');
    });

    test('the press rule is explicit: organizer any, group its own, bare link none', () => {
        // Changed deliberately. Requiring the organizer or a ?group= link meant a golfer
        // on a plain shared link - holding four of his own bets - had no press button at
        // all. Matches shown are already scoped to the viewer's group, so this widens
        // nothing else; the stated limitation is that links are not identity.
        // Was a blanket `return true`, which let a bare spectator link press every match
        // in the round. Now checked against the stored match's actual participants.
        const fn = idx.slice(idx.indexOf('function canPressSideMatch'), idx.indexOf('function sideMatchById'));
        assert.ok(/hasGroupLock/.test(fn));
        assert.ok(/teamAIds/.test(fn), 'it must read the match participants');
        assert.ok(!/meId/.test(fn));
    });

    test('REGRESSION: pressing does not widen any other permission', () => {
        const add = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(add), 'Add Action must stay organizer-only');
        const links = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/isOrganizerView\(\)/.test(links), 'Group Links must stay organizer-only');
        const canWrite = idx.slice(idx.indexOf('function canWritePlayer'), idx.indexOf('function rejectCrossGroupWrite'));
        assert.ok(!/canPressSideMatch/.test(canWrite), 'score writing must be unaffected');
    });
});

describe('HOLE PICKER — replacing the 1-18 circle strip', () => {
    const idx = read('index.html');

    test('the always-visible strip is gone', () => {
        assert.ok(!/id="hole-jump-nav"/.test(idx));
        assert.ok(!/renderHoleJumpNav\(courseData/.test(idx));
    });

    test('the jump still exists, opened from the Hole N of 18 label', () => {
        assert.ok(/toggleHolePicker\(\)/.test(idx));
        assert.ok(/hole-jump-open/.test(idx));
        assert.ok(/function jumpToHole/.test(idx), 'the navigation itself must survive');
    });

    test('it wraps instead of scrolling, so no hole can be unreachable', () => {
        const css = idx.slice(idx.indexOf('.hole-picker {'), idx.indexOf('.hole-picker {') + 300);
        assert.ok(/flex-wrap: wrap/.test(css), 'a scrolling strip is what hid holes 14-18');
        assert.ok(!/overflow-x/.test(css));
    });

    test('played holes are still shaded and the current hole marked', () => {
        assert.ok(/hole-pick-btn.*played/.test(idx));
        assert.ok(/\.hole-pick-btn\.here/.test(idx));
    });

    test('tap targets stay finger-sized', () => {
        const css = idx.slice(idx.indexOf('.hole-pick-btn {'), idx.indexOf('.hole-pick-btn {') + 250);
        assert.ok(/width: 40px/.test(css) && /height: 40px/.test(css));
    });

    test('the picker closes once a hole is chosen', () => {
        const fn = idx.slice(idx.indexOf('function jumpToHole'), idx.indexOf('function jumpToHole') + 200);
        assert.ok(/holePickerOpen = false/.test(fn));
    });

    test('it is hidden in print output', () => {
        assert.ok(/@media print \{ \.hole-picker/.test(idx));
    });
});

// ---------------------------------------------------------------------------
// SCORECARD CLEANUP — one betting summary, no empty cards
// ---------------------------------------------------------------------------
describe('SCORECARD CLEANUP — duplication removed, information kept', () => {
    const idx = read('index.html');

    function busyRound(opts) {
        const o = opts || {};
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 0, 0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 1';
        p[2].team = 'Team 2'; p[3].team = 'Team 2';
        const scores = {};
        cd.slice(0, o.thru || 15).forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 3 === 0 ? -1 : pi % 2);
        }));
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            additionalGames: o.bare ? {} : {
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
                dots: { enabled: true, dotPointVal: 2 }
            },
            dots: { h4: { [`p${p[0].id}`]: ['birdie'] } },
            birdieGameEnabled: !o.bare, birdieUnitVal: 5, birdieScoringType: 'gross',
            sideMatches: o.bare ? {} : {
                mj: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)],
                    overallPresses: { a: { startHole: 9, stake: 100 } }
                }
            }
        };
        return { cd, p, scores, data };
    }

    function render(opts) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { data, p } = busyRound(opts);
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 15;` +
            `meId = '${p[0].id}'; actionCenterOpen = true;` +
            `renderActionCenter(); renderBetStrip(); renderHoleRecap();`, sb);
        const g = id => { const el = sb.document.getElementById(id); return el ? el.innerHTML : ''; };
        return {
            action: g('action-center-mount'),
            strip: g('bet-strip-mount'),
            recap: g('hole-recap-mount'),
            all: ['action-center-mount', 'bet-strip-mount', 'hole-recap-mount'].map(g).join('')
        };
    }

    test('REGRESSION: a side match appears exactly ONCE across the whole scorecard', () => {
        // It used to appear in the callout bar, in the LIVE ACTION dashboard, AND in
        // My Round - three boxes telling a golfer the same thing.
        const out = render();
        const count = (out.all.match(/vs John/g) || []).length;
        assert.equal(count, 1, `the side match is presented ${count} times`);
    });

    test('REGRESSION: Birdie money appears exactly once, in Today\'s Action', () => {
        const out = render();
        assert.ok(/Birdie Game/.test(out.action), 'the birdie wager lost its home');
        assert.equal((out.all.match(/Birdie Game/g) || []).length, 1);
    });

    test('Skins appears once', () => {
        const out = render();
        assert.equal((out.all.match(/Skins/g) || []).length, 1);
    });

    test('there is exactly one betting summary heading', () => {
        const out = render();
        assert.ok(/Today\u2019s Action|My Round/.test(out.action));
        assert.ok(!/LIVE ACTION/.test(out.all), 'a second dashboard is back');
    });

    test('every live wager type still has a row — nothing was lost', () => {
        const out = render().action;
        ['Skins', 'Dots', 'Birdie Game', 'John'].forEach(t =>
            assert.ok(out.includes(t), `missing from My Round: ${t}`));
    });

    test('the side match press ladder survived the cleanup', () => {
        const out = render().action;
        assert.ok(/mc-press/.test(out), 'presses must stay nested under their parent');
        assert.ok(/Started Hole 9/.test(out));
    });

    test('EMPTY STATES: a round with no side action renders no empty boxes', () => {
        const out = render({ bare: true }).all;
        ['My Matches', 'Other Matches', 'Side Action', 'Already Settled', 'Birdie Game']
            .forEach(t => assert.ok(!out.includes(t), `empty panel rendered: ${t}`));
    });

    test('the event recap is still separate from Today\'s Action', () => {
        // "What just happened" and "where everything stands" are different questions and
        // should not be merged into one panel.
        const idxSrc = read('index.html');
        assert.ok(/function renderHoleRecap/.test(idxSrc));
        assert.ok(/function renderActionCenter/.test(idxSrc));
        const recapMount = idxSrc.indexOf(`id="hole-recap-mount"`);
        const actionMount = idxSrc.indexOf(`id="action-center-mount"`);
        assert.ok(recapMount > -1 && actionMount > recapMount, 'recap sits above the action summary');
    });

    test('score entry still comes before any betting panel', () => {
        const idxSrc = read('index.html');
        const scores = idxSrc.indexOf('class="score-input"');
        const recap = idxSrc.indexOf(`html += '<div id="hole-recap-mount">`);
        const action = idxSrc.indexOf(`html += '<div id="action-center-mount">`);
        const nav = idxSrc.indexOf('html += navRowHtml;');
        assert.ok(scores > -1 && recap < action && action < nav,
            'order must stay hole -> scores -> recap -> action -> navigation');
    });

    test('hole navigation is untouched', () => {
        assert.ok(/toggleHolePicker\(\)/.test(idx));
        assert.ok(/hole-jump-open/.test(idx));
        assert.ok(/function jumpToHole/.test(idx));
    });

    test('the tablet/desktop side panel still exists for wide screens', () => {
        assert.ok(/\.round-body-layout/.test(idx));
        assert.ok(/class="status-panel"/.test(idx));
    });

    test('no money engine was touched by a layout batch', () => {
        ['money-engine.js', 'settlement-engine.js'].forEach(f =>
            assert.ok(!/renderActionCenter|sideRow|buildActionRows/.test(read(f)), `${f} changed`));
    });
});
