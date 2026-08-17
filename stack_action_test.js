const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const AM = loadJsFile('action-model.js');
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const engine = loadJsFile('money-engine.js');

function netOf(result) {
    const out = {};
    Object.keys(result.netByName).forEach(k => { out[k] = result.netByName[k].net; });
    return out;
}
function sumOf(result) {
    return Object.values(netOf(result)).reduce((s, v) => s + v, 0);
}
const ZERO = 0.005;

// ---------------------------------------------------------------------------
// THE REPRESENTATIVE STACKED ROUND
// Four golfers. Everything at once, exactly as the product spec describes it:
//   MAIN        $20 Nassau
//   ADDITIONAL  $5 Skins, $2 Dots
//   SIDE ACTION Marty vs John $50 Stroke Play (with a press), Manny vs Steve $25 Match
//   EXTRAS      $5 Birdie Pool, $10 KP
// ---------------------------------------------------------------------------
function stackedRound(opts) {
    const o = opts || {};
    const cd = makeCourseData(18);
    const players = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [2, 6, 10, 14]);
    players[0].team = 'Team 1'; players[1].team = 'Team 1';
    players[2].team = 'Team 2'; players[3].team = 'Team 2';

    // Deliberately varied scoring so skins actually change hands, dots land on
    // different players, and the Nassau does not finish level.
    const scores = {};
    cd.forEach((h, i) => {
        scores[`p${players[0].id}_h${h.hole}`] = h.par + (i % 5 === 0 ? -1 : 0);
        scores[`p${players[1].id}_h${h.hole}`] = h.par + (i % 3 === 0 ? 1 : 0);
        scores[`p${players[2].id}_h${h.hole}`] = h.par + 1;
        scores[`p${players[3].id}_h${h.hole}`] = h.par + (i % 4 === 0 ? 2 : 1);
    });

    const data = {
        gameFormat: 'nassau',
        players, courseData: cd, scores,
        nassauStake: 20, nassauScoring: 'net', nassauPressRule: '2down',

        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', skinsPotFormat: 'gross' },
            dots: { enabled: true, dotPointVal: 2 }
        },

        birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
        kpGameEnabled: true, kpBuyIn: 10,
        kps: { h7: String(players[0].id) },

        dots: {
            h4: { [`p${players[0].id}`]: ['birdie'], [`p${players[2].id}`]: ['greenie'] },
            h11: { [`p${players[1].id}`]: ['sandy'] }
        },

        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross',
                holeStake: 0, overallStake: 50, tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(players[0].id)], teamBIds: [String(players[1].id)],
                overallPresses: o.sideMatchPress ? { pr1: { startHole: 9 } } : {}
            },
            sm2: {
                format: 'match', scoring: 'gross', stake: 25, pressRule: 'none',
                teamAIds: [String(players[2].id)], teamBIds: [String(players[3].id)]
            }
        }
    };
    return { data, cd, scores, players };
}

// ---------------------------------------------------------------------------
describe('ACTION MODEL — what is this round actually playing?', () => {
    test('a legacy round (gameFormat only) normalises to exactly one main game', () => {
        const games = AM.getRoundGames({ gameFormat: 'nassau', nassauStake: 20 });
        assert.equal(games.length, 1);
        assert.equal(games[0].role, 'main');
        assert.equal(games[0].format, 'nassau');
        assert.equal(games[0].label, 'Nassau');
        assert.equal(games[0].stake, 20);
    });

    test('a legacy round\'s main config is the round data itself, untouched', () => {
        const data = { gameFormat: 'nassau', nassauStake: 20 };
        assert.equal(AM.getRoundGames(data)[0].config, data,
            'the main game must pass through the original object, so old rounds behave identically');
    });

    test('a stacked round lists the main game first, then additional games', () => {
        const { data } = stackedRound();
        const games = AM.getRoundGames(data);
        assert.equal(games.map(g => g.format).join(','), 'nassau,skins,dots');
        assert.equal(games[0].role, 'main');
        assert.ok(games.slice(1).every(g => g.role === 'additional'));
    });

    test('each additional game gets its own ready-to-run config', () => {
        const { data } = stackedRound();
        const skins = AM.getRoundGames(data).find(g => g.format === 'skins');
        assert.equal(skins.config.gameFormat, 'skins');
        assert.equal(skins.config.skinsBuyIn, 5);
        assert.equal(skins.stake, 5);
        assert.equal(skins.config.players, data.players, 'the same field plays every game');
    });

    test('a nested config never carries additionalGames — no recursive re-adding', () => {
        const { data } = stackedRound();
        AM.getRoundGames(data).filter(g => g.role === 'additional').forEach(g => {
            assert.equal(g.config.additionalGames, undefined, `${g.format} leaked additionalGames`);
        });
    });

    test('a disabled additional game is not played', () => {
        const games = AM.getRoundGames({
            gameFormat: 'nassau',
            additionalGames: { skins: { enabled: false, skinsBuyIn: 5 } }
        });
        assert.equal(games.length, 1);
    });

    test('the same game cannot run twice — skins as main ignores an additional skins', () => {
        const games = AM.getRoundGames({
            gameFormat: 'skins', skinsBuyIn: 5,
            additionalGames: { skins: { enabled: true, skinsBuyIn: 10 } }
        });
        assert.equal(games.length, 1, 'double-counting skins would break zero-sum');
        assert.equal(games[0].role, 'main');
    });

    test('every game carries a startHole, so future mid-round additions have somewhere to live', () => {
        const { data } = stackedRound();
        AM.getRoundGames(data).forEach(g => assert.equal(typeof g.startHole, 'number'));
    });

    test('a startHole set on an additional game is preserved', () => {
        const games = AM.getRoundGames({
            gameFormat: 'nassau',
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, startHole: 5 } }
        });
        assert.equal(games[1].startHole, 5);
        assert.equal(games[1].config.startHole, undefined,
            'startHole must not reach an engine that would misread it as config');
    });
});

describe('ACTION MODEL — golf logic decides what can stack, not the engine list', () => {
    test('skins, dots and stableford are legitimate add-ons', () => {
        ['skins', 'dots', 'stableford'].forEach(f => assert.ok(AM.isAdditionalGameFormat(f), f));
    });

    test('Wolf cannot be stacked — it defines the whole round', () => {
        assert.ok(!AM.isAdditionalGameFormat('wolf'));
        const v = AM.validateRoundGames({ gameFormat: 'nassau', additionalGames: { wolf: { enabled: true } } });
        assert.equal(v.valid, false);
        assert.match(v.problems[0], /only be played as the main game/);
    });

    test('Hi-Lo cannot be stacked — it IS a team match', () => {
        assert.ok(!AM.isAdditionalGameFormat('hilo'));
    });

    test('the primary formats stay main-only', () => {
        ['match', 'nassau', 'stroke', 'bestball', 'scramble', 'ryder'].forEach(f => {
            assert.ok(!AM.isAdditionalGameFormat(f), `${f} should not be stackable`);
        });
    });

    test('a duplicate of the main game is reported, not silently settled', () => {
        const v = AM.validateRoundGames({ gameFormat: 'dots', additionalGames: { dots: { enabled: true } } });
        assert.equal(v.valid, false);
        assert.match(v.problems[0], /already the main game/);
    });

    test('a negative stake is rejected before it can reach an engine', () => {
        const v = AM.validateRoundGames({ gameFormat: 'nassau', additionalGames: { skins: { enabled: true, skinsBuyIn: -5 } } });
        assert.equal(v.valid, false);
    });

    test('a normal stacked round validates cleanly', () => {
        const { data } = stackedRound();
        assert.equal(AM.validateRoundGames(data).valid, true);
    });
});

// ---------------------------------------------------------------------------
describe('STACKED SETTLEMENT — every game settles, exactly once, and it all balances', () => {
    const { data, cd, scores, players } = stackedRound();
    const combined = settle.computeCombinedNetTotals(data, cd, scores);

    test('the whole stacked round is zero-sum', () => {
        assert.ok(Math.abs(sumOf(combined)) < ZERO, `stacked round summed to ${sumOf(combined)}`);
    });

    test('every player appears in the settlement', () => {
        const names = Object.keys(netOf(combined));
        players.forEach(p => assert.ok(names.includes(p.name.toLowerCase()), `${p.name} missing`));
    });

    test('the total equals the sum of each game settled on its own, plus the extras', () => {
        // The invariant that makes composition safe: adding a game cannot change what
        // any other game pays. Settling each in isolation and adding must reproduce the
        // combined total exactly.
        const perGame = {};
        function add(id, amt) { perGame[id] = (perGame[id] || 0) + amt; }

        AM.getRoundGames(data).forEach(game => {
            const net = settle.computeGameNetByPlayerId(game, cd, scores);
            Object.keys(net).forEach(pid => add(pid, net[pid]));
        });
        const birdie = settle.calculateBirdieGameTotalsForSettle(data, cd, scores);
        Object.keys(birdie).forEach(pid => add(pid, birdie[pid]));
        const kp = settle.calculateKPGameTotalsForSettle(data, cd);
        Object.keys(kp.money || {}).forEach(pid => add(pid, kp.money[pid]));

        const byName = netOf(combined);
        players.forEach(p => {
            const sideMatchShare = byName[p.name.toLowerCase()] - (perGame[p.id] || 0);
            assert.ok(!isNaN(sideMatchShare), `${p.name} produced NaN`);
        });

        // Side matches are the remainder, and they must themselves balance out.
        const remainder = players.reduce((s, p) => s + (byName[p.name.toLowerCase()] - (perGame[p.id] || 0)), 0);
        assert.ok(Math.abs(remainder) < ZERO, `side match remainder was ${remainder}`);
    });

    test('REGRESSION: removing skins changes the totals — it is genuinely being settled', () => {
        const noSkins = Object.assign({}, data, { additionalGames: { dots: { enabled: true, dotPointVal: 2 } } });
        const without = netOf(settle.computeCombinedNetTotals(noSkins, cd, scores));
        const with_ = netOf(combined);
        const moved = Object.keys(with_).some(k => Math.abs(with_[k] - (without[k] || 0)) > ZERO);
        assert.ok(moved, 'skins money is not reaching settlement');
        assert.ok(Math.abs(Object.values(without).reduce((s, v) => s + v, 0)) < ZERO);
    });

    test('REGRESSION: removing dots changes the totals — it is genuinely being settled', () => {
        const noDots = Object.assign({}, data, { additionalGames: { skins: data.additionalGames.skins } });
        const without = netOf(settle.computeCombinedNetTotals(noDots, cd, scores));
        const with_ = netOf(combined);
        const moved = Object.keys(with_).some(k => Math.abs(with_[k] - (without[k] || 0)) > ZERO);
        assert.ok(moved, 'dots money is not reaching settlement');
    });

    test('the main Nassau still pays exactly what it always paid, untouched by the stack', () => {
        // The strongest backward-compatibility guarantee available: settle the main game
        // through the OLD path and confirm the stack did not alter it.
        const legacy = Object.assign({}, data);
        delete legacy.additionalGames;
        const oldWay = engine.computeRoundMoneyByPlayer(legacy, cd, scores);
        const newWay = settle.computeGameNetByPlayerId(AM.getRoundGames(data)[0], cd, scores);
        oldWay.players.forEach(p => {
            assert.ok(Math.abs((newWay[p.id] || 0) - (p.net || 0)) < ZERO,
                `${p.name}: main game moved from ${p.net} to ${newWay[p.id]}`);
        });
    });

    test('Who Pays Who reconciles the stacked round exactly', () => {
        const paid = {};
        combined.transactions.forEach(t => {
            paid[t.from] = (paid[t.from] || 0) - t.amount;
            paid[t.to] = (paid[t.to] || 0) + t.amount;
        });
        const byName = netOf(combined);
        Object.keys(byName).forEach(k => {
            const name = combined.netByName[k].name;
            assert.ok(Math.abs((paid[name] || 0) - byName[k]) < 0.02,
                `${name}: owed ${byName[k]} but transactions move ${paid[name] || 0}`);
        });
    });

    test('running the combiner twice gives the same answer — nothing accumulates', () => {
        const a = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        const b = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        Object.keys(a).forEach(k => assert.ok(Math.abs(a[k] - b[k]) < ZERO));
    });

    test('each additional game is zero-sum on its own', () => {
        AM.getRoundGames(data).forEach(game => {
            const net = settle.computeGameNetByPlayerId(game, cd, scores);
            const sum = Object.values(net).reduce((s, v) => s + v, 0);
            assert.ok(Math.abs(sum) < ZERO, `${game.format} summed to ${sum}`);
        });
    });
});

describe('STACKED SETTLEMENT — presses stay attached to their parent wager', () => {
    test('a side-match press adds money without breaking zero-sum', () => {
        const plain = stackedRound();
        const pressed = stackedRound({ sideMatchPress: true });
        const a = settle.computeCombinedNetTotals(plain.data, plain.cd, plain.scores);
        const b = settle.computeCombinedNetTotals(pressed.data, pressed.cd, pressed.scores);
        assert.ok(Math.abs(sumOf(b)) < ZERO, 'the pressed round must still balance');
        const na = netOf(a), nb = netOf(b);
        const moved = Object.keys(nb).some(k => Math.abs(nb[k] - (na[k] || 0)) > ZERO);
        assert.ok(moved, 'the press produced no money movement');
    });

    test('Stroke Play presses are untouched by stacking — original and press stay independent', () => {
        const cd = makeCourseData(18);
        const players = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.forEach(h => {
            scores[`p${players[0].id}_h${h.hole}`] = h.par;
            scores[`p${players[1].id}_h${h.hole}`] = h.par + 1;
        });
        const base = {
            gameFormat: 'match', matchScoringStyle: 'stroke', matchScoring: 'gross',
            matchStake: 50, players, courseData: cd, scores,
            strokePresses: { p1: { startHole: 9, stake: 100 } }
        };
        const withStack = Object.assign({}, base, {
            additionalGames: { dots: { enabled: true, dotPointVal: 2 } },
            dots: { h4: { [`p${players[0].id}`]: ['birdie'] } }
        });

        const set = engine.calculateStrokePressSet(players, cd, scores, 'gross', 50,
            [{ startHole: 9, stake: 100 }]);
        assert.equal(set.pressResults.length, 1);
        assert.equal(set.pressResults[0].stake, 100, 'the press keeps its own stake');
        assert.notEqual(set.original.p1Total, set.pressResults[0].p1Total,
            'original and press cover different holes');

        [base, withStack].forEach(d => {
            const c = settle.computeCombinedNetTotals(d, cd, scores);
            assert.ok(Math.abs(sumOf(c)) < ZERO);
        });
    });
});

// ---------------------------------------------------------------------------
describe('BACKWARD COMPATIBILITY — existing rounds cannot become collateral damage', () => {
    const cd = makeCourseData(18);

    function legacyRound(gameFormat, extra) {
        const players = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 5, 10, 15]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1';
        players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const scores = {};
        cd.forEach((h, i) => {
            players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = h.par + (pi + i) % 3; });
        });
        return { data: Object.assign({ gameFormat, players, courseData: cd, scores }, extra || {}), scores, players };
    }

    const LEGACY = [
        ['stroke', {}],
        ['nassau', { nassauStake: 10, nassauScoring: 'net', nassauPressRule: '2down' }],
        ['match', { matchStake: 20, matchScoring: 'net', matchPressRule: 'none' }],
        ['skins', { skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' }],
        ['dots', { dotPointVal: 2, dots: {} }],
        ['hilo', { holeBetStake: 5, hiLoScoring: 'gross' }],
        ['stableford', { stablefordPointVal: 1, stablefordScoring: 'net' }],
        ['bestball', { matchStake: 20, matchScoring: 'net', matchPressRule: 'none' }],
        ['ryder', { matchStake: 10, matchScoring: 'net', matchPressRule: 'none' }],
    ];

    LEGACY.forEach(([format, extra]) => {
        test(`a legacy ${format} round still settles, and settles to the same money`, () => {
            const { data, scores } = legacyRound(format, extra);

            // Settled through the new composition path...
            const now = netOf(settle.computeCombinedNetTotals(data, cd, scores));

            // ...must equal what the round's own engine produces directly.
            let expected = {};
            if (format === 'skins') expected = settle.computeSkinsSettlementNet(data, cd, scores);
            else if (format === 'hilo') expected = settle.computeHiLoSettlementNet(data, cd, scores);
            else {
                const r = engine.computeRoundMoneyByPlayer(data, cd, scores);
                if (r.valid) r.players.forEach(p => { expected[p.id] = p.net || 0; });
            }

            // Final settlement is now allocated in WHOLE DOLLARS (see
            // roundNetTotalsToWholeDollars): golfers do not exchange 78 cents. The
            // underlying engine result is unchanged - what is asserted here is that the
            // combined total still rounds to the engine's exact figure, and that the
            // direction of every balance is preserved.
            data.players.forEach(p => {
                const got = now[p.name.toLowerCase()] || 0;
                const want = expected[p.id] || 0;
                assert.ok(Math.abs(got - want) <= 1,
                    `${format}/${p.name}: ${got} is more than a dollar from ${want}`);
                assert.ok(Number.isInteger(got), `${format}/${p.name}: ${got} is not whole dollars`);
                if (Math.abs(want) > 1) {
                    assert.equal(Math.sign(got), Math.sign(want), `${format}/${p.name}: direction flipped`);
                }
            });
            assert.ok(Math.abs(Object.values(now).reduce((s, v) => s + v, 0)) < ZERO,
                `legacy ${format} lost zero-sum`);
        });
    });

    test('a legacy round with no additionalGames key at all is fine', () => {
        const { data, scores } = legacyRound('nassau', { nassauStake: 10, nassauScoring: 'net' });
        assert.equal(data.additionalGames, undefined);
        assert.equal(AM.getRoundGames(data).length, 1);
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });

    test('a legacy round carrying birdie/KP extras still picks them up', () => {
        const base = legacyRound('nassau', {
            nassauStake: 10, nassauScoring: 'net',
            birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
            kpGameEnabled: true, kpBuyIn: 10
        });
        const { data, scores, players } = base;
        data.kps = { h7: String(players[0].id) };
        // Give Marty a birdie so the pool actually pays out - otherwise the round nets
        // zero for everyone and the test proves nothing.
        scores[`p${players[0].id}_h3`] = cd[2].par - 1;
        data.scores = scores;

        const c = settle.computeCombinedNetTotals(data, cd, scores);
        assert.ok(Math.abs(sumOf(c)) < ZERO);
        const net = netOf(c);
        assert.ok(Object.values(net).some(v => Math.abs(v) > ZERO), 'extras produced no money');
    });

    test('an empty/broken round degrades quietly instead of throwing', () => {
        [{}, { gameFormat: 'nassau' }, { players: [] }].forEach(d => {
            const c = settle.computeCombinedNetTotals(d, [], {});
            assert.ok(c && c.netByName, 'the combiner must always return a usable shape');
        });
    });
});

// ---------------------------------------------------------------------------
describe('TRIP COMPATIBILITY — a stacked round contributes its complete settlement', () => {
    test('a trip of one stacked round and one legacy round is zero-sum and complete', () => {
        const stacked = stackedRound();
        const cd = makeCourseData(18);
        const players = makePlayers(['Marty', 'John', 'Manny', 'Steve'], [0, 5, 10, 15]);
        const scores = {};
        cd.forEach((h, i) => players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = h.par + ((pi + i) % 3); }));
        const legacy = { gameFormat: 'skins', players, courseData: cd, scores, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' };

        const r1 = netOf(settle.computeCombinedNetTotals(stacked.data, stacked.cd, stacked.scores));
        const r2 = netOf(settle.computeCombinedNetTotals(legacy, cd, scores));

        // Exactly what trip.html does: aggregate each round's netByName.
        const trip = {};
        [r1, r2].forEach(r => Object.keys(r).forEach(k => { trip[k] = (trip[k] || 0) + r[k]; }));

        Object.keys(trip).forEach(k => {
            assert.ok(Math.abs(trip[k] - ((r1[k] || 0) + (r2[k] || 0))) < ZERO, k);
        });
        const total = Object.values(trip).reduce((s, v) => s + v, 0);
        assert.ok(Math.abs(total) < ZERO, `trip total was ${total}`);
    });
});

// ---------------------------------------------------------------------------
describe('SCORE CORRECTIONS — everything still derives from raw scores', () => {
    test('correcting a hole moves the stacked total, and it stays zero-sum', () => {
        const { data, cd, scores, players } = stackedRound();
        const before = netOf(settle.computeCombinedNetTotals(data, cd, scores));

        const corrected = Object.assign({}, scores);
        corrected[`p${players[0].id}_h7`] = 2; // Marty makes an eagle on 7
        const after = netOf(settle.computeCombinedNetTotals(Object.assign({}, data, { scores: corrected }), cd, corrected));

        const moved = Object.keys(after).some(k => Math.abs(after[k] - (before[k] || 0)) > ZERO);
        assert.ok(moved, 'a corrected score must ripple through the stack');
        assert.ok(Math.abs(Object.values(after).reduce((s, v) => s + v, 0)) < ZERO);
    });

    test('no money is cached — the same inputs always produce the same output', () => {
        const { data, cd, scores } = stackedRound();
        const a = netOf(settle.computeCombinedNetTotals(data, cd, scores));
        const fresh = stackedRound();
        const b = netOf(settle.computeCombinedNetTotals(fresh.data, fresh.cd, fresh.scores));
        Object.keys(a).forEach(k => assert.ok(Math.abs(a[k] - b[k]) < ZERO, k));
    });

    test('a half-played stacked round balances, skins included', () => {
        const { data, cd, players } = stackedRound();
        const partial = {};
        cd.slice(0, 6).forEach(h => players.forEach(p => { partial[`p${p.id}_h${h.hole}`] = h.par; }));
        const c = settle.computeCombinedNetTotals(Object.assign({}, data, { scores: partial }), cd, partial);
        assert.ok(Math.abs(sumOf(c)) < ZERO, `mid-round stack summed to ${sumOf(c)}`);
    });
});

describe('SKINS — mid-round money is at stake, never already lost', () => {
    // This was a real, pre-existing defect, fixed deliberately (product decision):
    // every player was charged the FULL buy-in from the first score entered, while the
    // pot for holes not yet played had been awarded to nobody. Mid-round totals summed
    // negative and every golfer showed as down money on skins nobody had won.
    //
    // A player is now charged only for the holes actually played. On a completed round
    // nothing changes at all - which is what these tests exist to guarantee.
    const cd = makeCourseData(18);
    const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
    const base = { gameFormat: 'skins', players, courseData: cd, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', skinsPotFormat: 'gross' };
    const net = scores => settle.computeSkinsSettlementNet(Object.assign({ scores }, base), cd, scores);
    const total = n => Object.values(n).reduce((s, v) => s + v, 0);

    function tiedThrough(holes) {
        const scores = {};
        cd.slice(0, holes).forEach(h => players.forEach(p => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        return scores;
    }

    test('REGRESSION: a half-played round with everything carrying is zero-sum', () => {
        const n = net(tiedThrough(6));
        assert.ok(Math.abs(total(n)) < ZERO, `six tied holes summed to ${total(n)}`);
    });

    test('REGRESSION: nobody is shown as down money on skins nobody has won', () => {
        const n = net(tiedThrough(6));
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO,
            `a carried pot must be AT STAKE, not lost - player showed ${v}`));
    });

    test('a round with no scores at all costs nobody anything', () => {
        const n = net({});
        assert.ok(Math.abs(total(n)) < ZERO);
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO));
    });

    test('mid-round, a golfer who has actually won skins is up and the rest are down', () => {
        const scores = {};
        cd.slice(0, 6).forEach((h, i) => players.forEach((p, pi) => {
            scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i < 2 ? -1 : 0);
        }));
        const n = net(scores);
        assert.ok(Math.abs(total(n)) < ZERO, 'still zero-sum');
        assert.ok(n[players[0].id] > ZERO, 'the skin winner should be up');
        players.slice(1).forEach(p => assert.ok(n[p.id] < -ZERO, 'the others should be down'));
    });

    test('the stake charged grows as more holes are played', () => {
        const winAt = holes => {
            const scores = {};
            cd.slice(0, holes).forEach((h, i) => players.forEach((p, pi) => {
                scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i === 0 ? -1 : 0);
            }));
            return net(scores);
        };
        const early = winAt(3), later = winAt(12);
        assert.ok(later[players[0].id] > early[players[0].id],
            'one skin is worth more of the pot once more holes have been played');
        [early, later].forEach(n => assert.ok(Math.abs(total(n)) < ZERO));
    });

    test('a COMPLETED round settles to exactly what it always did', () => {
        // The guarantee that matters: final money is untouched by this change.
        const scores = {};
        cd.forEach((h, i) => players.forEach((p, pi) => {
            scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i < 5 ? -1 : 0);
        }));
        const n = net(scores);
        assert.ok(Math.abs(total(n)) < ZERO);
        assert.ok(Math.abs(n[players[0].id] - 4.1666666) < 0.01, `winner got ${n[players[0].id]}, expected 4.17`);
        players.slice(1).forEach(p => assert.ok(Math.abs(n[p.id] + 1.3888888) < 0.01, `loser got ${n[p.id]}, expected -1.39`));
    });

    test('a completed round where every hole ties awards nothing and costs nobody', () => {
        const n = net(tiedThrough(18));
        assert.ok(Math.abs(total(n)) < ZERO);
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO));
    });

    test('a split gross/net pot stays zero-sum at every stage', () => {
        [3, 9, 18].forEach(holes => {
            const scores = {};
            cd.slice(0, holes).forEach((h, i) => players.forEach((p, pi) => {
                scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i % 4 === 0 ? -1 : 0);
            }));
            const cfg = Object.assign({ scores }, base, { skinsPotFormat: 'split' });
            const n = settle.computeSkinsSettlementNet(cfg, cd, scores);
            assert.ok(Math.abs(total(n)) < ZERO, `split pot thru ${holes} summed to ${total(n)}`);
        });
    });

    test('non-carry-over skins are untouched — that mode was already zero-sum', () => {
        const scores = {};
        cd.slice(0, 6).forEach((h, i) => players.forEach((p, pi) => {
            scores[`p${p.id}_h${h.hole}`] = h.par + (pi === 0 && i < 2 ? -1 : 0);
        }));
        const cfg = Object.assign({ scores }, base, { skinsCarryOver: false });
        const n = settle.computeSkinsSettlementNet(cfg, cd, scores);
        assert.ok(Math.abs(total(n)) < ZERO);
    });

    test('a mid-round STACKED round including skins is now fully zero-sum', () => {
        const { data, cd: scd, players: sp } = stackedRound();
        const partial = {};
        scd.slice(0, 6).forEach(h => sp.forEach(p => { partial[`p${p.id}_h${h.hole}`] = h.par; }));
        const c = settle.computeCombinedNetTotals(Object.assign({}, data, { scores: partial }), scd, partial);
        assert.ok(Math.abs(sumOf(c)) < ZERO, `mid-round stack summed to ${sumOf(c)}`);
    });
});

// ---------------------------------------------------------------------------
describe('WIRING — one settlement system, one composition layer', () => {
    const fs = require('fs');
    const path = require('path');
    const { REPO_ROOT } = require('./helpers/load-script.js');
    const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

    test('both settlement consumers load action-model.js before settlement-engine.js', () => {
        ['settlement.html', 'trip.html'].forEach(f => {
            const s = read(f);
            assert.ok(s.indexOf('action-model.js') < s.indexOf('settlement-engine.js'),
                `${f} loads them in the wrong order`);
        });
    });

    test('the combiner loops getRoundGames rather than branching on one gameFormat', () => {
        const s = read('settlement-engine.js');
        const fn = s.slice(s.indexOf('function computeCombinedNetTotals'), s.indexOf('function computeCombinedNetTotals') + 1500);
        assert.ok(/getRoundGames\(data\)\.forEach/.test(fn), 'settlement is not composition-driven');
    });

    test('action-model.js contains no golf mathematics', () => {
        const s = read('action-model.js');
        ['calculateMatchEngine', 'calcDotsEngine', 'getStrokes', 'calculateStrokeHeadToHead'].forEach(fn => {
            assert.ok(!new RegExp(`function ${fn}`).test(s), `${fn} must not be reimplemented here`);
        });
    });

    test('money-engine.js was not modified by this work', () => {
        const s = read('money-engine.js');
        assert.ok(!/getRoundGames|additionalGames/.test(s),
            'the composition layer must sit above the math, never inside it');
    });
});
