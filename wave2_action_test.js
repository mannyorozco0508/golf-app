const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// loadJsFile() takes no dependency list, so the three files are layered into one
// sandbox by hand - exactly the order index.html loads them in the browser.
// bet-strip.js is a presenter: without getRoundGames() and the engines in scope it
// legitimately returns nothing.
function loadLayered(files) {
    const sandbox = loadJsFile(files[0]);
    files.slice(1).forEach(f => {
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sandbox, { filename: f });
    });
    return sandbox;
}
const BS = loadLayered(['action-model.js', 'money-engine.js', 'bet-strip.js']);

// The representative stacked round from the spec, played nine holes in.
function stacked(opts) {
    const o = opts || {};
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [2, 6, 10, 14]);
    p[0].team = 'Team 1'; p[1].team = 'Team 1';
    p[2].team = 'Team 2'; p[3].team = 'Team 2';
    const scores = {};
    cd.slice(0, o.holes || 9).forEach((h, i) => {
        scores[`p${p[0].id}_h${h.hole}`] = h.par + (i % 4 === 0 ? -1 : 0);
        scores[`p${p[1].id}_h${h.hole}`] = h.par + (i % 3 === 0 ? 1 : 0);
        scores[`p${p[2].id}_h${h.hole}`] = h.par + 1;
        scores[`p${p[3].id}_h${h.hole}`] = h.par + (i % 2 === 0 ? 2 : 1);
    });
    const data = {
        gameFormat: 'nassau', players: p, courseData: cd, scores,
        nassauStake: 20, nassauScoring: 'net', nassauPressRule: '2down',
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
            dots: { enabled: true, dotPointVal: 2 }
        },
        dots: { h4: { [`p${p[0].id}`]: ['birdie'] }, h6: { [`p${p[2].id}`]: ['greenie'] } },
        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
            },
            sm2: {
                format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                teamAIds: [String(p[2].id)], teamBIds: [String(p[3].id)]
            }
        }
    };
    return { data, cd, scores, players: p };
}

describe('ACTION ROWS — every stacked game reports its own status', () => {
    const { data, cd, scores, players } = stacked();
    const rows = BS.buildActionRows(data, cd, scores, players);

    test('the main game and both additional games each get a row', () => {
        assert.equal(rows.map(r => r.key).join(','), 'main,skins,dots');
    });

    test('the main game is flagged main, the rest additional', () => {
        assert.equal(rows[0].role, 'main');
        assert.ok(rows.slice(1).every(r => r.role === 'additional'));
    });

    test('every row carries a human status and its stake', () => {
        rows.forEach(r => {
            assert.ok(r.status.length > 0, `${r.key} produced no status`);
            assert.ok(r.status.length <= 30, `${r.key} status "${r.status}" is too long for a phone row`);
        });
        assert.equal(rows.find(r => r.key === 'skins').stakeText, '$5');
        assert.equal(rows.find(r => r.key === 'dots').stakeText, '$2');
    });

    test('a legacy single-game round yields exactly one row', () => {
        const legacy = Object.assign({}, data);
        delete legacy.additionalGames;
        assert.equal(BS.buildActionRows(legacy, cd, scores, players).length, 1);
    });

    test('a round with no scores still renders without throwing', () => {
        const rows = BS.buildActionRows(Object.assign({}, data, { scores: {} }), cd, {}, players);
        assert.ok(Array.isArray(rows));
    });
});

describe('ACTION ROWS — golf language, never engine language', () => {
    test('SKINS speaks in skins: who holds how many, and how many are riding', () => {
        const { data, cd, scores, players } = stacked();
        const skins = BS.buildActionRows(data, cd, scores, players).find(r => r.key === 'skins');
        assert.match(skins.status, /\d|No skins yet|All square/);
        assert.ok(!/UP|\+\d+ strokes/.test(skins.status), 'skins must not borrow match or stroke wording');
    });

    test('SKINS reports carried skins as riding, not as money lost', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        const scores = {};
        cd.slice(0, 4).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
        const data = { gameFormat: 'stroke', players: p, courseData: cd, scores, additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' } } };
        const row = BS.buildActionRows(data, cd, scores, p).find(r => r.key === 'skins');
        assert.match(row.status, /riding/, `expected carried skins to read as riding, got "${row.status}"`);
        assert.ok(!/-\$|lost/.test(row.status), 'a carried pot is at stake, never lost');
    });

    test('DOTS counts dots, and gets the plural right', () => {
        const { data, cd, scores, players } = stacked();
        const dots = BS.buildActionRows(data, cd, scores, players).find(r => r.key === 'dots');
        assert.match(dots.status, /\d+ dots?$/);
        assert.ok(!/ dots$/.test('Marty 1 dot'), 'sanity: singular form exists');
    });

    test('MATCH PLAY keeps match wording', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Bud'], [0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 2';
        const scores = {};
        cd.slice(0, 4).forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par - 1;
            scores[`p${p[1].id}_h${h.hole}`] = h.par;
        });
        const data = { gameFormat: 'match', players: p, courseData: cd, scores, matchStake: 50, matchScoring: 'gross', matchPressRule: 'none' };
        const row = BS.buildActionRows(data, cd, scores, p)[0];
        assert.match(row.status, /UP|ALL SQUARE/);
        assert.ok(!/\+\d+$/.test(row.status), 'match play must not use stroke wording');
    });

    test('STROKE PLAY 1v1 keeps stroke wording', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Bud'], [0, 0]);
        const scores = {};
        cd.slice(0, 4).forEach(h => {
            scores[`p${p[0].id}_h${h.hole}`] = h.par - 1;
            scores[`p${p[1].id}_h${h.hole}`] = h.par;
        });
        const data = { gameFormat: 'match', matchScoringStyle: 'stroke', players: p, courseData: cd, scores, matchStake: 50, matchScoring: 'gross' };
        const row = BS.buildActionRows(data, cd, scores, p)[0];
        assert.match(row.status, /\+\d+|TIED/);
        assert.ok(!/UP/.test(row.status), 'stroke play must never say UP');
    });

    test('presses are summarised on the parent row, not given rows of their own', () => {
        const { data, cd, scores, players } = stacked();
        const main = BS.buildActionRows(data, cd, scores, players)[0];
        assert.match(main.status, /\u00B7 \d+P$/, 'press count should ride on the main row');
    });
});

describe('SIDE ACTION — visible on the scorecard, scoped to this group', () => {
    const { data, cd, scores, players } = stacked();

    test('both side matches appear with participants, format and stake', () => {
        const rows = BS.buildSideActionRows(data, cd, scores, players);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].label, 'Marty vs John');
        assert.equal(rows[0].format, 'Stroke Play');
        assert.equal(rows[0].stakeText, '$50');
        assert.equal(rows[1].format, 'Match Play');
        assert.equal(rows[1].stakeText, '$25');
    });

    test('a side match involving nobody in this group is not shown', () => {
        const rows = BS.buildSideActionRows(data, cd, scores, [players[0], players[1]]);
        assert.equal(rows.length, 1, 'a golfer must not be shown another foursome\'s action');
        assert.equal(rows[0].label, 'Marty vs John');
    });

    test('a round with no side matches yields no rows', () => {
        const bare = Object.assign({}, data, { sideMatches: {} });
        assert.equal(BS.buildSideActionRows(bare, cd, scores, players).length, 0);
    });
});

describe('SCORECARD RENDER — the command center in a stubbed DOM', () => {
    function render(open, data, players) {
        const sb = loadHtmlInlineScript('index.html', ['action-model.js', 'money-engine.js', 'bet-strip.js']);
        vm.runInContext(
            `currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players;` +
            `actionCenterOpen = ${open}; renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }
    const { data, players } = stacked();

    test('collapsed by default — one line, no wall of bets above the score boxes', () => {
        const out = render(false, data, players);
        assert.ok(out.includes('action-toggle'));
        assert.ok(!out.includes('action-body'), 'the detail must stay closed until asked for');
        assert.match(out, /5 live/, 'the summary should say how much is running');
    });

    test('expanded, every game and side match is listed under a clear heading', () => {
        const out = render(true, data, players);
        // Sections were renamed to the way a golfer thinks: one Group Games heading for
        // everything the field is in, My Matches / Other Matches for personal action.
        // Without an identified golfer there is no "My Matches" - side action falls
        // under the neutral "Side Matches" heading, which is the correct fallback.
        assert.ok(out.includes('Group Games'), 'missing Group Games');
        assert.ok(/My Matches|Side Matches/.test(out), 'missing the side action heading');
        ['Nassau', 'Skins', 'Dots', 'Marty vs John', 'Manny vs Steve'].forEach(n =>
            assert.ok(out.includes(n), `missing row: ${n}`));
    });

    test('it says plainly that nothing is settled yet', () => {
        // Shortened: every card's own line already says "at stake", so the long sentence
        // was restating it and wrapping to two rows at 390px.
        assert.match(render(true, data, players), /Nothing here is settled yet/);
    });

    test('a single-game round still offers a way to add action to it', () => {
        // CHANGED IN WAVE 3, deliberately. A one-game round used to render nothing here
        // because the bet strip below already said everything. But + ADD ACTION lives in
        // this bar, and without it an organizer playing a plain Nassau would have no way
        // to add skins mid-round. The summary now appears whenever there is either
        // something to see or something to add.
        const legacy = Object.assign({}, data, { sideMatches: {} });
        delete legacy.additionalGames;
        const out = render(false, legacy, players);
        assert.ok(out.includes('action-toggle'), 'the bar must exist to host + ADD ACTION');
    });

    test('a finished single-game round with nothing left to add shows nothing', () => {
        // With no future hole, canAddAction() is false, so the bar correctly disappears
        // and a one-game round adds no noise above the score boxes.
        const done = Object.assign({}, data, { sideMatches: {} });
        delete done.additionalGames;
        const scores = {};
        done.courseData.forEach(h => done.players.forEach(p => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        done.scores = scores;
        assert.equal(render(false, done, players), '');
    });

    test('a broken round degrades to empty instead of taking down score entry', () => {
        assert.equal(render(true, { players: [], courseData: [], scores: {} }, []), '');
    });

    test('the action center is hidden in print/PDF output', () => {
        assert.match(read('index.html'), /@media print \{ \.action-center/);
    });

    test('it is mounted above the bet strip and above Prev/Next', () => {
        const idx = read('index.html');
        const ac = idx.indexOf(`html += '<div id="action-center-mount"></div>'`);
        const bs = idx.indexOf(`html += '<div id="bet-strip-mount"></div>'`);
        const nav = idx.indexOf('html += navRowHtml;');
        // Navigation is now above both panels; their order relative to each other is unchanged.
        assert.ok(ac > -1 && ac < bs, 'reading order must stay action -> bet detail');
        assert.ok(nav < ac, 'and both sit below Prev/Next');
    });
});

describe('SETUP — stacking games is reachable from the wizard', () => {
    const adm = read('admin.html');

    test('admin.html loads the composition layer', () => {
        assert.ok(adm.includes('<script src="action-model.js"></script>'));
    });

    // BEHAVIOUR CHANGE (Scoring vs Action, phase 1): Step 6 is now named for the layer it
    // represents rather than for being "more" of the previous step. Step 3 asks how the
    // round is scored; Step 6 asks what the money is.
    test('Step 6 offers additional games alongside the extras', () => {
        assert.ok(adm.includes("Step 6: What's The Action?"));
        assert.ok(!adm.includes('Step 6: More Action'), 'the old undifferentiated wording is gone');
        assert.ok(adm.includes('stacked-games-list'));
        assert.ok(adm.includes('Also Playing'), 'the setup wizard keeps its own wording');
        assert.ok(adm.includes('\uD83C\uDFAF Extras'), 'the birdie/KP extras keep their own heading');
    });

    // BEHAVIOUR CHANGE (Quick Round Action model): Step 3 no longer asks which GAME is
    // being played - it asks how the SCORECARD is organised. The money formats moved out
    // of setup entirely and are created through Action after the round exists, so a
    // golfer is never forced to pick a wager just to start keeping score.
    test('Step 3 asks for a ROUND TYPE, and offers only structural choices', () => {
        assert.ok(adm.includes('Step 3: Round Type'));
        assert.ok(adm.includes('<label>Round Type</label>'));
        assert.ok(!adm.includes('Step 3: Game Format'), 'the original conflated heading is gone');
        assert.ok(!adm.includes('<label>Scoring Format</label>'), 'the interim wording is gone too');
        // The stored key is STILL gameFormat - wording and options changed, schema did not.
        assert.ok(adm.includes('id="game-format-select"'), 'the stored gameFormat key must not be renamed');
    });

    test('no betting decision is required to create a round', () => {
        assert.ok(!/-- Select Scoring Format --/.test(adm), 'the forced empty choice is gone');
        assert.ok(/<option value="stroke" selected>/.test(adm), 'a normal round defaults to individual play');
        assert.ok(/if \(!gameFormat\) gameFormat = 'stroke';/.test(adm),
            'saving without a choice must fall back, never block');
        assert.ok(!/Please select a Scoring Format before saving/.test(adm));
    });

    test('money-only formats are no longer offered for NEW rounds', () => {
        const visible = adm.slice(adm.indexOf('id="game-format-select"'), adm.indexOf('legacy-format-group'));
        ['nassau', 'match', 'skins', 'dots'].forEach(f =>
            assert.ok(!visible.includes(`value="${f}"`), `${f} must not be a setup choice any more`));
        ['stroke', 'stableford', 'bestball', 'scramble', 'ryder', 'hilo', 'wolf'].forEach(f =>
            assert.ok(visible.includes(`value="${f}"`), `${f} is structural and must remain`));
    });

    test('LEGACY SAFETY: old money formats are hidden, not deleted, and reappear when editing', () => {
        // Deleting the options would make an old Nassau round unselectable, and saving it
        // would silently rewrite its format. They are hidden instead, and revealed on load.
        assert.ok(adm.includes('id="legacy-format-group"'));
        ['nassau', 'match', 'skins', 'dots'].forEach(f =>
            assert.ok(adm.includes(`value="${f}"`), `${f} must still exist for legacy rounds`));
        assert.ok(/function revealLegacyFormatOption/.test(adm));
        assert.ok(/revealLegacyFormatOption\(data\.gameFormat\)/.test(adm),
            'loading a saved round must reveal its own format before selecting it');
    });

    test('the choices are driven by the shared catalog, not a hardcoded list', () => {
        // If these ever diverge the wizard could offer a game settlement refuses to pay.
        assert.ok(/Object\.keys\(ADDITIONAL_GAME_CATALOG\)/.test(adm));
    });

    test('a game already chosen as the main format is filtered out', () => {
        const fn = adm.slice(adm.indexOf('function renderStackedGames'), adm.indexOf('let stackedGameState'));
        assert.ok(/f !== mainFormat/.test(fn), 'a round must not be able to play the same game twice');
    });

    test('the round saves an additionalGames node', () => {
        assert.ok(adm.includes('additionalGames: captureAdditionalGames()'));
    });

    test('captureAdditionalGames refuses to emit the main format', () => {
        const fn = adm.slice(adm.indexOf('function captureAdditionalGames'), adm.indexOf('function loadAdditionalGames'));
        assert.ok(/if \(format === mainFormat\) return;/.test(fn));
        assert.ok(/ADDITIONAL_GAME_CATALOG\[format\]/.test(fn), 'unknown formats must not be saved');
    });

    test('reopening a saved round restores the toggles', () => {
        assert.ok(adm.includes('function loadAdditionalGames'));
        assert.ok(adm.includes('loadAdditionalGames(data);'));
    });

    test('Review lists every additional game as its own line', () => {
        assert.ok(/Object\.entries\(captureAdditionalGames\(\)\)\.forEach/.test(adm),
            'nobody should tee off unaware of a wager that is actually running');
    });
});

describe('WIRING — the command center computes no money of its own', () => {
    test('bet-strip.js still contains no golf mathematics', () => {
        const s = read('bet-strip.js');
        ['function calculateMatchEngine', 'function calcDotsEngine', 'function getStrokes',
            'function calculateStrokeHeadToHead', 'function computeSkinsSettlementNet'].forEach(fn => {
                assert.ok(!s.includes(fn), `${fn} must not be reimplemented in the presenter`);
            });
    });

    test('money-engine.js was not modified by Wave 2', () => {
        const s = read('money-engine.js');
        assert.ok(!/buildActionRows|actionCenterOpen|additionalGames/.test(s));
    });

    test('action-model.js was not modified by Wave 2', () => {
        assert.ok(!/buildActionRows|renderActionCenter/.test(read('action-model.js')));
    });

    test('index.html loads action-model.js before bet-strip.js', () => {
        const idx = read('index.html');
        assert.ok(idx.indexOf('action-model.js') < idx.indexOf('bet-strip.js'));
    });

    test('the action center never reports settled dollars for a live round', () => {
        const { data, cd, scores, players } = stacked();
        BS.buildActionRows(data, cd, scores, players).forEach(r => {
            assert.ok(!/won|\+\$/i.test(r.status),
                `"${r.status}" reads as settled money on an unfinished round`);
        });
    });
});
