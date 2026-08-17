const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
function layered() {
    const sb = loadJsFile('action-model.js');
    ['money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const BS = layered();

// THE MARTY TEST. 8 golfers, 3 groups at different paces, 4 matches, 6 presses.
// Group 1 (Marty, Jose, John, Ann) thru 12 · Group 2 (Steve, Bo) thru 9 · Group 3 thru 10.
function martyRound() {
    const cd = makeCourseData(18);
    const names = ['Marty', 'Jose', 'John', 'Ann', 'Steve', 'Bo', 'Manny', 'Ryan'];
    const p = makePlayers(names, names.map(() => 0));
    const thru = [12, 12, 12, 12, 9, 9, 10, 10];
    const scores = {};
    p.forEach((pl, pi) => cd.slice(0, thru[pi]).forEach((h, i) => {
        scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 3 === 0 ? -1 : (pi % 2));
    }));
    const mk = (a, b, stake, presses) => ({
        format: 'stroke', scoring: 'gross', overallStake: stake, holeStake: 0,
        tieRule: 'push', overallMode: 'stroke', segment: 'full',
        teamAIds: a.map(x => String(x.id)), teamBIds: b.map(x => String(x.id)),
        overallPresses: presses || {}
    });
    const data = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        sideMatches: {
            a: mk([p[0]], [p[2]], 50, { x: { startHole: 6, stake: 50 }, y: { startHole: 10, stake: 100 } }),
            b: mk([p[0]], [p[4]], 100, { z: { startHole: 8, stake: 200 } }),
            c: mk([p[0]], [p[7]], 50, {}),
            d: mk([p[0], p[1]], [p[6], p[7]], 100, { w: { startHole: 11, stake: 200 } })
        }
    };
    return { cd, p, scores, data };
}
const rowsFor = (o, meId) => BS.buildSideActionRows(o.data, o.cd, o.scores, o.p, meId);

describe('MARTY MODE — full sentences, not shorthand', () => {
    const o = martyRound();
    const rows = rowsFor(o, o.p[0].id);

    test('REGRESSION: "Marty +4" became "You lead by 4 strokes"', () => {
        const john = rows.find(r => /John/.test(r.label));
        assert.match(john.sentence, /^You lead by \d+ strokes?$/);
        assert.ok(!/^\S+ \+\d+$/.test(john.sentence), 'shorthand survived');
    });

    test('singular reads "1 stroke", not "1 strokes"', () => {
        assert.equal(BS.strokeSentence('Marty +1', 'Marty'), 'You lead by 1 stroke');
        assert.equal(BS.strokeSentence('Marty +4', 'Marty'), 'You lead by 4 strokes');
    });

    test('an opponent leading reads naturally too', () => {
        assert.equal(BS.strokeSentence('John +3', 'Marty'), 'John leads by 3 strokes');
    });

    test('a team leading uses the plural verb', () => {
        assert.equal(BS.strokeSentence('You / Jose +2', 'Marty'), 'You / Jose lead by 2 strokes');
    });

    test('TIED becomes Tied, not a shout', () => {
        assert.equal(BS.strokeSentence('TIED', 'Marty'), 'Tied');
    });

    test('Match Play keeps its own dialect — "up", never "strokes"', () => {
        assert.equal(BS.matchSentence('Marty 2 UP', 'Marty'), 'You are 2 up');
        assert.equal(BS.matchSentence('John 3 UP', 'Marty'), 'John is 3 up');
        assert.equal(BS.matchSentence('ALL SQUARE', 'Marty'), 'All square');
        assert.ok(!/stroke/.test(BS.matchSentence('Marty 2 UP', 'Marty')));
    });

    test('REGRESSION: "P1 · H6–18" became "Press #1 · Started Hole 6"', () => {
        const john = rows.find(r => /John/.test(r.label));
        assert.equal(john.presses[0].label, 'Press #1');
        assert.equal(john.presses[0].startedText, 'Started Hole 6');
        assert.equal(john.presses[1].label, 'Press #2');
        assert.equal(john.presses[1].startedText, 'Started Hole 10');
    });

    test('each press keeps its own stake and its own sentence', () => {
        const john = rows.find(r => /John/.test(r.label));
        assert.equal(john.presses[0].stakeText, '$50');
        assert.equal(john.presses[1].stakeText, '$100');
        john.presses.forEach(pr =>
            assert.ok(/lead by|Tied|Not started/.test(pr.sentence), `press reads "${pr.sentence}"`));
    });
});

describe('MARTY MODE — "vs John", not "Marty vs John"', () => {
    const o = martyRound();

    test('the golfer\'s own 1v1 match names only the opponent', () => {
        const rows = rowsFor(o, o.p[0].id);
        assert.ok(rows.some(r => r.label === 'vs John'));
        assert.ok(!rows.some(r => /^Marty vs/.test(r.label)), 'his own name is redundant');
    });

    test('his team match reads "You / Jose vs ..."', () => {
        const rows = rowsFor(o, o.p[0].id);
        const team = rows.find(r => r.isTeam);
        assert.match(team.label, /^You \/ Jose vs /);
    });

    test('without identity, both sides are named — no false "you"', () => {
        const rows = rowsFor(o, null);
        assert.ok(rows.some(r => r.label === 'Marty vs John'));
        assert.ok(!rows.some(r => /You/.test(r.label)));
    });

    test('a match the golfer is NOT in still names both sides', () => {
        const rows = rowsFor(o, o.p[2].id); // John's phone
        const notMine = rows.find(r => !r.mine);
        if (notMine) assert.ok(!/^vs /.test(notMine.label));
    });
});

describe('MARTY MODE — through-hole and cross-group waiting', () => {
    const o = martyRound();
    const rows = rowsFor(o, o.p[0].id);

    test('REGRESSION: every match reports how far it has been played', () => {
        // Nothing on the scorecard used to say this, even though the number was already
        // being computed for press eligibility and then thrown away.
        rows.forEach(r => assert.match(r.thruText, /Through Hole \d+|Not started/));
    });

    test('a same-group match shows the group\'s own progress, with nobody waited on', () => {
        const john = rows.find(r => /John/.test(r.label));
        assert.equal(john.thruText, 'Through Hole 12');
        assert.equal(john.waitingOn, null);
    });

    test('REGRESSION: a cross-group match names who is still out', () => {
        // Steve's group is three holes back. Without this the status simply looked stale.
        const steve = rows.find(r => /Steve/.test(r.label));
        assert.equal(steve.thruText, 'Through Hole 9');
        assert.equal(steve.waitingOn, 'Steve');
    });

    test('progress is the SLOWEST participant, never the viewer\'s own group', () => {
        const steve = rows.find(r => /Steve/.test(r.label));
        assert.ok(steve.thru < 12, 'Marty is thru 12 but the match is only thru 9');
    });

    test('a 2v2 match names every player still out', () => {
        const team = rows.find(r => r.isTeam);
        assert.match(team.waitingOn, /Manny|Ryan/);
    });

    test('the press start hole matches the match\'s own progress', () => {
        rows.forEach(r => {
            if (r.canPress) assert.equal(r.nextPressHole, r.thru + 1,
                `${r.label} would press onto a hole somebody has not played`);
        });
    });
});

describe('MARTY MODE — the 2v2 status defect is fixed', () => {
    const o = martyRound();

    test('REGRESSION: a 2v2 stroke match now reports a status', () => {
        // sideMatchRoundConfig returns null for a team match, so buildBetStrip could not
        // produce chips and the row fell back to printing the format name - while
        // settlement paid it out correctly the whole time.
        const team = rowsFor(o, o.p[0].id).find(r => r.isTeam);
        assert.ok(team.status && team.status.length > 0, 'the 2v2 row is still blank');
        assert.match(team.sentence, /lead by \d+ strokes?|Tied|Not started/);
    });

    test('its presses render too', () => {
        const team = rowsFor(o, o.p[0].id).find(r => r.isTeam);
        assert.equal(team.presses.length, 1);
        assert.equal(team.presses[0].startedText, 'Started Hole 11');
        assert.equal(team.presses[0].stakeText, '$200');
    });

    test('it uses the same engine settlement uses — best ball, no new math', () => {
        const bs = read('bet-strip.js');
        const fn = bs.slice(bs.indexOf('function teamStrokeStatus'), bs.indexOf('function segToStatus'));
        assert.ok(/calculateOverallBetEngine/.test(fn));
        assert.ok(/sideA: teamA, sideB: teamB/.test(fn), 'the whole side must reach the engine');
        assert.ok(!/getStrokes\(|parseHcp\(/.test(fn), 'it must not recompute handicaps');
    });

    test('1v1 matches are unaffected', () => {
        const rows = rowsFor(o, o.p[0].id).filter(r => !r.isTeam);
        assert.equal(rows.length, 3);
        rows.forEach(r => assert.ok(r.sentence.length > 0));
    });
});

describe('MARTY MODE — the scorecard', () => {
    // expandAll mirrors a golfer tapping a card open - which is where press detail and
    // the PRESS button now live, since cards collapse by default.
    function render(meId, expandAll) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const o = martyRound();
        vm.runInContext(`currentData = ${JSON.stringify(o.data)};` +
            `window.__scFilteredPlayers = currentData.players.slice(0, 4); currentViewedHole = 12;` +
            (meId ? `meId = '${meId}';` : '') +
            (expandAll ? `Object.keys(currentData.sideMatches).forEach(k => expandedMatches[k] = true);` : '') +
            `actionCenterOpen = true; renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }

    test('the five-second read: sentence, progress, press amount, all present', () => {
        const out = render(martyRound().p[0].id, true);
        assert.match(out, /vs John/);
        assert.match(out, /You lead by \d+ strokes?/);
        assert.match(out, /Through Hole 12/);
        assert.match(out, /Press #1 \u00B7 \$50 \u00B7 Started Hole 6/);
    });

    test('the waiting state is visible WITHOUT opening the card', () => {
        // A cross-group match looking stale is exactly what needs explaining at a glance,
        // so this stays on the collapsed headline.
        assert.match(render(martyRound().p[0].id), /waiting on Steve/);
    });

    test('a collapsed card still answers the question, and counts its presses', () => {
        const out = render(martyRound().p[0].id);
        assert.match(out, /vs John/);
        assert.match(out, /You lead by \d+ strokes?/);
        assert.match(out, /Through Hole 12/);
        assert.match(out, /2 presses/);
        assert.ok(!/Started Hole 6/.test(out), 'press detail should be behind a tap');
    });

    test('headings speak the golfer\'s language, not the data model', () => {
        // This fixture is side matches only, so no Group Games heading renders - that
        // section correctly appears only when the field has a shared game running.
        const out = render(martyRound().p[0].id);
        assert.match(out, /My Matches/);
        assert.ok(!/Also Playing|Main Game|Your Action|Side Action/.test(out),
            'an old data-model heading survived');
        assert.ok(/Group Games/.test(read('index.html')), 'the heading must exist for group rounds');
    });

    test('the summary counts matches and says how they are going', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const o = martyRound();
        vm.runInContext(`currentData = ${JSON.stringify(o.data)};` +
            `window.__scFilteredPlayers = currentData.players.slice(0, 4); currentViewedHole = 12;` +
            `meId = '${o.p[0].id}'; actionCenterOpen = false; renderActionCenter();`, sb);
        const out = sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(out, /4 matches/);
        assert.match(out, /winning \d/);
        assert.match(out, /\d presses/);
        assert.ok(!/\$/.test(out), 'the bar must not claim a live money position');
    });

    test('REGRESSION: Marty gets a press button on his own matches', () => {
        // Previously canPressSideMatch() required the organizer or a ?group= link, so a
        // golfer on a plain shared link - holding four of his own bets - saw no button.
        const out = render(martyRound().p[0].id, true);
        assert.ok((out.match(/mc-press-btn/g) || []).length >= 3, 'no press buttons rendered');
    });

    test('a match with nothing to report still renders without breaking', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        vm.runInContext(`currentData = { players: [], courseData: [], scores: {} };` +
            `window.__scFilteredPlayers = []; currentViewedHole = 1; renderActionCenter();`, sb);
        assert.equal(sb.document.getElementById('action-center-mount').innerHTML, '');
    });
});

describe('MARTY MODE — nothing was broken to get here', () => {
    test('the engines were not touched', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f =>
            assert.ok(!/strokeSentence|matchProgress|mc-press-btn/.test(read(f)), `${f} changed`));
    });

    test('bet-strip.js still computes no money of its own', () => {
        const s = read('bet-strip.js');
        ['function calculateMatchEngine', 'function getStrokes', 'function computeSkinsSettlementNet']
            .forEach(fn => assert.ok(!s.includes(fn), `${fn} must not be reimplemented`));
    });

    test('the dialects still never mix', () => {
        assert.ok(!/stroke/.test(BS.matchSentence('Marty 2 UP', 'Marty')));
        assert.ok(!/ up\b/.test(BS.strokeSentence('Marty +2', 'Marty')));
    });

    test('group scoping and identity separation are untouched', () => {
        const idx = read('index.html');
        const canWrite = idx.slice(idx.indexOf('function canWritePlayer'), idx.indexOf('function rejectCrossGroupWrite'));
        assert.ok(!/meId/.test(canWrite), 'identity must never gate score writing');
        const links = idx.slice(idx.indexOf('function renderGroupLinksPanel'), idx.indexOf('function copyGroupLinkFromScorecard'));
        assert.ok(/isOrganizerView\(\)/.test(links), 'Group Links must stay organizer-only');
    });

    test('Add Action stays organizer-only', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(fn));
    });

    test('the Option B trade-off is documented at the decision point', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function canPressSideMatch'), idx.indexOf('function openSidePress'));
        assert.ok(/links are shared credentials, not identity/.test(fn));
        assert.ok(/does NOT widen anything else/.test(fn));
    });
});

// ---------------------------------------------------------------------------
// COLLAPSIBLE CARDS
// ---------------------------------------------------------------------------
describe('COLLAPSED CARDS — four matches fit one screen', () => {
    function render(state) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const o = martyRound();
        vm.runInContext(`currentData = ${JSON.stringify(o.data)};` +
            `window.__scFilteredPlayers = currentData.players.slice(0, 4); currentViewedHole = 12;` +
            `meId = '${o.p[0].id}'; actionCenterOpen = true; ${state || ''} renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }

    test('REGRESSION: a collapsed round is far shorter than an expanded one', () => {
        // Marty's round produced 15 rows before Prev/Next. The headline has to answer the
        // question on its own, or collapsing just hides the information.
        const collapsed = render();
        const expanded = render(`Object.keys(currentData.sideMatches).forEach(k => expandedMatches[k] = true);`);
        assert.ok(collapsed.length < expanded.length * 0.8,
            'collapsing saved almost nothing');
    });

    test('the collapsed headline still answers "how am I doing"', () => {
        const out = render();
        assert.match(out, /vs John/);
        assert.match(out, /You lead by \d+ strokes?/);
        assert.match(out, /Through Hole 12/);
        assert.match(out, /\$\d+ at stake/);
    });

    test('press COUNT survives collapsing, press detail does not', () => {
        const out = render();
        assert.match(out, /2 presses/);
        assert.ok(!/Started Hole 6/.test(out), 'detail should be one tap away');
    });

    test('tapping a card reveals its presses and its PRESS button', () => {
        const out = render(`expandedMatches['a'] = true;`);
        assert.match(out, /Press #1 \u00B7 \$50 \u00B7 Started Hole 6/);
        assert.match(out, /mc-press-btn/);
    });

    test('the whole headline is the tap target, at full touch size', () => {
        const idx = read('index.html');
        const css = idx.slice(idx.indexOf('.mc-headline {'), idx.indexOf('.mc-headline {') + 260);
        assert.ok(/width: 100%/.test(css));
        assert.ok(/min-height: 44px/.test(css));
    });

    test('AUTO-EXPAND: a match that just changed opens on its own', () => {
        const out = render(`side => 0; expandedMatches['a'] = undefined;`);
        // justChanged is set from the shared event derivation; assert the wiring exists.
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function isMatchExpanded'), idx.indexOf('let sidePressOpen'));
        assert.ok(/sm\.justChanged/.test(fn));
        assert.ok(/sm\.finished/.test(fn));
        assert.ok(out.length > 0);
    });

    test('REGRESSION: "can be pressed" is NOT an auto-expand trigger', () => {
        // Almost every live match can be pressed, so using it opened all four of Marty's
        // cards and collapsed nothing at all.
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function isMatchExpanded'), idx.indexOf('let sidePressOpen'));
        assert.ok(!/if \(sm\.canPress\) return true;/.test(fn));
        const out = render();
        assert.ok((out.match(/mc-press-btn/g) || []).length === 0,
            'every card auto-expanded, which defeats collapsing');
    });

    test('a single match opens on its own — nothing to scroll past', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const o = martyRound();
        const one = { a: o.data.sideMatches.a };
        vm.runInContext(`currentData = ${JSON.stringify(Object.assign({}, o.data, { sideMatches: one }))};` +
            `window.__scFilteredPlayers = currentData.players.slice(0, 4); currentViewedHole = 12;` +
            `meId = '${o.p[0].id}'; actionCenterOpen = true; renderActionCenter();`, sb);
        assert.match(sb.document.getElementById('action-center-mount').innerHTML, /Started Hole 6/);
    });

    test('expansion state holds no money and is never persisted', () => {
        const idx = read('index.html');
        const decl = idx.slice(idx.indexOf('const expandedMatches'), idx.indexOf('const expandedMatches') + 400);
        assert.ok(/in-memory only/i.test(idx.slice(Math.max(0, idx.indexOf('const expandedMatches') - 300),
            idx.indexOf('const expandedMatches'))));
        assert.ok(!/db\.ref[\s\S]{0,80}expandedMatches/.test(idx));
    });
});

describe('MONEY POSITION — decided vs at stake', () => {
    const o = martyRound();
    const rows = rowsFor(o, o.p[0].id);

    test('REGRESSION: an unfinished stroke wager is AT STAKE, never won', () => {
        // A stroke match decides nothing until its last hole, so a mid-round net of $0
        // with $200 riding is the honest reading.
        rows.forEach(r => {
            assert.equal(r.netMoney, 0, `${r.label} claims decided money mid-round`);
            assert.ok(r.atStake > 0, `${r.label} should show money riding`);
            assert.match(r.netText, /at stake/);
        });
    });

    test('at-stake totals include every press, at its own amount', () => {
        const john = rows.find(r => /John/.test(r.label));
        assert.equal(john.atStake, 200, '$50 original + $50 press + $100 press');
    });

    test('a finished wager reports real money, from the golfer\'s side', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.forEach(h => p.forEach((pl, pi) => { scores[`p${pl.id}_h${h.hole}`] = h.par + pi; }));
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            sideMatches: {
                m: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)], overallPresses: {}
                }
            }
        };
        const mine = BS.buildSideActionRows(data, cd, scores, p, p[0].id)[0];
        const theirs = BS.buildSideActionRows(data, cd, scores, p, p[1].id)[0];
        assert.equal(mine.netMoney, 50);
        assert.equal(theirs.netMoney, -50, 'the same match reads inverted from the other side');
        assert.match(mine.netText, /up \$50/);
        assert.match(theirs.netText, /down \$50/);
    });

    test('the tone flips with the viewer, so colour never lies', () => {
        assert.equal(BS.flipTone('up'), 'down');
        assert.equal(BS.flipTone('down'), 'up');
        assert.equal(BS.flipTone('even'), 'even');
    });
});

describe('GROUP GAMES collapses too', () => {
    function render(state) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 0, 0, 0]);
        const scores = {};
        cd.slice(0, 10).forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi === 0 && i % 3 === 0 ? -1 : pi % 2);
        }));
        const data = {
            gameFormat: 'stroke', players: p, courseData: cd, scores,
            additionalGames: {
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
                dots: { enabled: true, dotPointVal: 2 }
            },
            dots: { h4: { [`p${p[0].id}`]: ['birdie'] } },
            birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross'
        };
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; currentViewedHole = 10;` +
            `meId = '${p[0].id}'; actionCenterOpen = true; ${state || ''} renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }

    test('closed, it is one line naming the games', () => {
        const out = render();
        assert.match(out, /Group Games/);
        assert.match(out, /section-summary/);
        assert.match(out, /Skins/);
        assert.ok(!/riding/.test(out), 'detail should be behind the tap');
    });

    test('open, every game gets its row back', () => {
        const out = render('groupGamesOpen = true;');
        assert.match(out, /Skins/);
        assert.match(out, /Dots/);
        assert.match(out, /Birdie Game/);
        assert.ok(!/section-summary/.test(out));
    });

    test('the section header is a real button at touch size', () => {
        const idx = read('index.html');
        const css = idx.slice(idx.indexOf('.section-toggle {'), idx.indexOf('.section-toggle {') + 260);
        assert.ok(/min-height: 40px/.test(css));
        assert.ok(/width: 100%/.test(css));
    });
});
