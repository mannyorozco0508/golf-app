// ============================================================================
// SCORING vs ACTION — phase 1 (product-model clarification)
//
// The app had one undifferentiated "Game Format" list mixing three unlike things:
// ways of SCORING (Stroke Play, Stableford), formats that need TEAMS (Best Ball,
// Scramble, Ryder, Hi-Lo, Wolf), and pure WAGERS carried as main formats for
// historical reasons (Nassau, Match Play, Skins, Dots).
//
// This phase changes wording and summary structure ONLY. The stored key is still
// `gameFormat`, every format is still offered, no round needs migrating, and no
// engine was touched. These tests hold that line.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// ---------------------------------------------------------------------------
describe('THE STORED SCHEMA DID NOT MOVE', () => {
    const adm = read('admin.html');

    test('gameFormat is still the stored key, everywhere it was', () => {
        assert.ok(adm.includes('id="game-format-select"'));
        assert.ok(/gameFormat/.test(adm), 'the round still saves gameFormat');
        assert.ok(!/scoringFormat/.test(adm), 'no parallel key was introduced');
    });

    test('no format was removed from setup — this phase clarifies, it does not migrate', () => {
        ['stroke', 'stableford', 'bestball', 'scramble', 'ryder', 'hilo',
            'wolf', 'nassau', 'match', 'skins', 'dots']
            .forEach(f => assert.ok(adm.includes(`value="${f}"`), `${f} disappeared from setup`));
    });

    test('Nassau and Match Play were NOT moved into the additional-game catalog', () => {
        const am = read('action-model.js');
        const catalog = am.slice(am.indexOf('ADDITIONAL_GAME_CATALOG = {'), am.indexOf('MAIN_GAME_LABELS'));
        assert.ok(!/\bnassau:/.test(catalog), 'Nassau migration is a later, dedicated phase');
        assert.ok(!/\bmatch:/.test(catalog), 'Match Play migration is a later, dedicated phase');
        // The catalog itself is unchanged.
        assert.ok(/skins:/.test(catalog) && /dots:/.test(catalog) && /stableford:/.test(catalog));
    });
});

// ---------------------------------------------------------------------------
describe('ROUND READY — scoring first, then the money', () => {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    const render = data => {
        sb.renderRoundReady(data);
        return {
            scoring: sb.document.getElementById('rr-scoring-text').textContent,
            action: sb.document.getElementById('rr-action-text').innerHTML,
            actionShown: sb.document.getElementById('rr-action-box').style.display,
            noAction: sb.document.getElementById('rr-noaction-box').style.display
        };
    };

    test('a plain Stroke Play round names its scoring and states there is no money', () => {
        const r = render({ gameFormat: 'stroke', players: [{ name: 'Marty' }] });
        assert.equal(r.scoring, 'Stroke Play');
        assert.equal(r.actionShown, 'none');
        assert.equal(r.noAction, 'block');
    });

    test('scoring is ALWAYS stated — a team format used to render nothing at all here', () => {
        ['bestball', 'scramble', 'ryder', 'hilo'].forEach(f => {
            const r = render({ gameFormat: f, players: [] });
            assert.ok(r.scoring.length > 0, `${f} produced no scoring line`);
            assert.notEqual(r.scoring, 'undefined');
        });
    });

    test('stacked games appear in Action, sourced from getRoundGames', () => {
        const r = render({
            gameFormat: 'stroke', players: [],
            additionalGames: { skins: { enabled: true, skinsBuyIn: 10 }, dots: { enabled: true, dotPointVal: 2 } }
        });
        assert.equal(r.scoring, 'Stroke Play');
        assert.ok(/Skins/.test(r.action), r.action);
        assert.ok(/Dots/.test(r.action), r.action);
        assert.equal(r.actionShown, 'block');
    });

    test('a disabled stacked game produces no Action line', () => {
        const r = render({
            gameFormat: 'stroke', players: [],
            additionalGames: { skins: { enabled: false, skinsBuyIn: 10 } }
        });
        assert.ok(!/Skins/.test(r.action), r.action);
        assert.equal(r.noAction, 'block');
    });

    test('legacy money formats appear in BOTH lists, because they genuinely are both', () => {
        const nassau = render({ gameFormat: 'nassau', nassauStake: 20, nassauPressRule: 'none', players: [] });
        assert.equal(nassau.scoring, 'Nassau');
        assert.ok(/\$20 Nassau/.test(nassau.action), nassau.action);

        const match = render({ gameFormat: 'match', matchStake: 50, players: [] });
        assert.equal(match.scoring, 'Match Play');
        assert.ok(/\$50 Match Play/.test(match.action), match.action);
    });

    test('the Birdie Game counts as Action', () => {
        const r = render({ gameFormat: 'stroke', birdieGameEnabled: true, players: [] });
        assert.ok(/Birdie Game/.test(r.action), r.action);
    });

    test('BACKWARD COMPATIBILITY: a pre-stacking round renders with no new fields required', () => {
        // Exactly the shape a round saved before additionalGames existed.
        const r = render({ gameFormat: 'nassau', nassauStake: 10, nassauPressRule: '2down', players: [{ name: 'Manny' }] });
        assert.equal(r.scoring, 'Nassau');
        assert.ok(r.action.includes('$10 Nassau'));
    });

    test('BACKWARD COMPATIBILITY: an empty round object does not throw', () => {
        assert.doesNotThrow(() => render({}));
        assert.equal(render({}).scoring, 'Stroke Play', 'the same default getRoundGames uses');
    });
});

// ---------------------------------------------------------------------------
// PART 8: a side match is a WAGER layered over the round. Its format names must never
// read like an instruction to change how the round is scored.
describe('SIDE MATCH TERMINOLOGY — a bet, not a scoring change', () => {
    const sm = read('sidematches.html');

    test('every side match format is named as a Bet', () => {
        assert.ok(sm.includes('>Match Play Bet (Overall)<'));
        assert.ok(sm.includes('>Nassau Bet (F9 / B9 / 18)<'));
        assert.ok(sm.includes('>Stroke Play Bet ($/Hole + $/Overall)<'));
    });

    test('the stored format values are unchanged — wording only', () => {
        ['value="match"', 'value="nassau"', 'value="stroke"'].forEach(v =>
            assert.ok(sm.includes(v), `${v} must not change`));
    });
});

// ---------------------------------------------------------------------------
// PART 7/13. The audit claim that the segment control was "hardcoded to full" was
// WRONG - it is a visible toggle and always has been. What was wrong is the LABEL:
// "Segment: Full 18 / Split Front/Back" reads as though it chooses which holes are
// wagered. It does not. It decides whether a tied-hole carry resets at the turn.
// These tests pin the real engine behaviour so the wording can never drift from it.
describe('STROKE PLAY BET — what the carry control actually does', () => {
    const sb = loadHtmlInlineScript('sidematches.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    const cd = makeCourseData(18);
    const P = makePlayers(['Marty', 'Manny'], [0, 0]);

    // Nine straight ties, then Marty wins hole 10. Under a full-round carry the whole
    // nine holes of carry land on hole 10; reset at the turn and it pays base stake.
    const scores = {};
    cd.forEach(h => {
        scores[`p${P[0].id}_h${h.hole}`] = h.par;
        scores[`p${P[1].id}_h${h.hole}`] = h.par;
    });
    scores[`p${P[0].id}_h10`] = 3;
    scores[`p${P[1].id}_h10`] = 5;

    function holeBet(segment, presses) {
        vm.runInContext(`window.__r = calculateHoleBetEngine(${JSON.stringify(P)}, ${JSON.stringify(cd)}, ${JSON.stringify(scores)},
            { holeEnabled: true, holeStake: 10, segment: ${JSON.stringify(segment)}, tieRule: 'carry', scoringType: 'gross' },
            ${JSON.stringify(presses || [])});`, sb);
        return sb.window.__r;
    }

    test('CARRY ALL 18: nine holes of carry roll into hole 10', () => {
        const h10 = holeBet('full').holeLog.find(x => x.hole === 10);
        assert.equal(h10.amount, 100, '$10 base + 9 carried holes');
    });

    test('RESET AT 10: the carry starts fresh on the back nine', () => {
        const h10 = holeBet('frontback').holeLog.find(x => x.hole === 10);
        assert.equal(h10.amount, 10, 'base stake only — the front nine carry does not cross the turn');
    });

    test('the two settings genuinely differ, so the label must too', () => {
        assert.notEqual(holeBet('full').p1Money, holeBet('frontback').p1Money);
    });

    test('an OLD side match with no segment field behaves as full — no migration needed', () => {
        vm.runInContext(`window.__legacy = calculateHoleBetEngine(${JSON.stringify(P)}, ${JSON.stringify(cd)}, ${JSON.stringify(scores)},
            { holeEnabled: true, holeStake: 10, tieRule: 'carry', scoringType: 'gross' }, []);`, sb);
        assert.equal(sb.window.__legacy.p1Money, holeBet('full').p1Money,
            'a stored round predating the field must settle exactly as it always did');
    });

    test('the UI states what the control does, in plain language', () => {
        const smSrc = read('sidematches.html');
        assert.ok(smSrc.includes('Carry Across The Turn'));
        assert.ok(smSrc.includes('>Carry All 18<'));
        assert.ok(smSrc.includes('>Reset At 10<'));
        assert.ok(/Only affects tied holes when Tied Hole is set to Carry/.test(smSrc),
            'the control is meaningless under the Void tie rule and must say so');
        // The stored values are untouched.
        assert.ok(smSrc.includes("setSmSegment('full')") && smSrc.includes("setSmSegment('frontback')"));
    });

    test('presses still apply on top of the carry setting, unchanged', () => {
        // Tied holes are logged with winner:null and a running `carrying` figure, so the
        // proof a press landed is the size of the carry STEP, not a payout.
        const log = holeBet('frontback', [{ fromHole: 12, newStake: 50 }]).holeLog;
        const at = n => log.find(x => x.hole === n);
        assert.equal(at(11).carrying, 10, 'hole 11 still adds the base stake');
        assert.equal(at(12).carrying - at(11).carrying, 50, 'the pressed stake takes effect from hole 12');
        assert.equal(at(13).carrying - at(12).carrying, 50, 'and stays in effect after it');
    });

    test('a press behaves identically under both carry settings after the turn', () => {
        // Hole 12 is on the back nine, so the reset at 10 has already happened and the
        // two modes must agree from there - proving the control affects only the turn.
        const step = seg => {
            const log = holeBet(seg, [{ fromHole: 12, newStake: 50 }]).holeLog;
            const at = n => log.find(x => x.hole === n);
            return at(13).carrying - at(12).carrying;
        };
        assert.equal(step('full'), step('frontback'));
    });
});

// ---------------------------------------------------------------------------
describe('FROZEN — no engine or settlement moved in this phase', () => {
    test('the money and settlement engines carry no product-model wording', () => {
        ['money-engine.js', 'settlement-engine.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/Scoring Format|What's The Action|rr-scoring|rr-action/.test(src),
                `${f} must not know about presentation`);
        });
    });

    test('getRoundGames still wraps a legacy gameFormat as the main game', () => {
        const AM = require(path.join(REPO_ROOT, 'action-model.js'));
        const games = AM.getRoundGames({ gameFormat: 'nassau', nassauStake: 10 });
        assert.equal(games.length, 1);
        assert.equal(games[0].role, 'main');
        assert.equal(games[0].format, 'nassau');
        assert.equal(games[0].startHole, 1);
    });

    test('a stacked game still carries its own start hole', () => {
        const AM = require(path.join(REPO_ROOT, 'action-model.js'));
        const games = AM.getRoundGames({
            gameFormat: 'stroke',
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, startHole: 6 } }
        });
        assert.equal(games.length, 2);
        assert.equal(games[1].startHole, 6);
    });
});
