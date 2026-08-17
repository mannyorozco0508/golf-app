const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
const ZERO = 0.005;

const asNet = obj => {
    const out = {};
    Object.keys(obj).forEach(k => { out[k.toLowerCase()] = { name: k, net: obj[k] }; });
    return out;
};
const totalOf = r => Object.values(r).reduce((s, v) => s + v.net, 0);

describe('WHOLE-DOLLAR SETTLEMENT — golfers never owe pennies', () => {
    test('the spec example: +50.74 / -50.74 becomes +51 / -51', () => {
        const r = settle.roundNetTotalsToWholeDollars(asNet({ Marty: 50.74, John: -50.74 }));
        assert.equal(r.marty.net, 51);
        assert.equal(r.john.net, -51);
        assert.equal(totalOf(r), 0);
    });

    test('the four-player spec example lands exactly as specified', () => {
        const r = settle.roundNetTotalsToWholeDollars(
            asNet({ Marty: 100.60, Manny: 25.20, John: -75.45, Steve: -50.35 }));
        assert.equal(r.marty.net, 101);
        assert.equal(r.manny.net, 25);
        assert.equal(r.john.net, -76);
        assert.equal(r.steve.net, -50);
        assert.equal(totalOf(r), 0);
    });

    test('REGRESSION: naive rounding would break zero-sum here — this does not', () => {
        // Math.round on each independently gives 0 + 0 + 0 - 1 = -1: a dollar destroyed.
        const input = asNet({ A: 0.34, B: 0.33, C: 0.33, D: -1.00 });
        const naive = Object.values(input).reduce((s, v) => s + Math.round(v.net), 0);
        assert.notEqual(naive, 0, 'precondition: naive rounding really does drift here');

        const r = settle.roundNetTotalsToWholeDollars(input);
        assert.equal(totalOf(r), 0);
    });

    test('a half-dollar tie resolves deterministically, the same way every time', () => {
        const runs = [1, 2, 3, 4, 5].map(() =>
            JSON.stringify(settle.roundNetTotalsToWholeDollars(asNet({ A: 2.50, B: -2.50 }))));
        assert.equal(new Set(runs).size, 1, 'the allocation must not vary between renders');
    });

    test('a winner never becomes a loser, and vice versa', () => {
        [{ A: 10.4, B: 5.4, C: -8.4, D: -7.4 },
         { A: 100.6, B: 25.2, C: -75.45, D: -50.35 },
         { A: 3.33, B: 3.33, C: 3.34, D: -10 }].forEach(c => {
            const r = settle.roundNetTotalsToWholeDollars(asNet(c));
            Object.keys(c).forEach(k => {
                if (Math.abs(c[k]) > 1) {
                    assert.equal(Math.sign(r[k.toLowerCase()].net), Math.sign(c[k]),
                        `${k} flipped direction`);
                }
            });
        });
    });

    test('nobody moves by more than a dollar from their exact position', () => {
        const c = { A: 12.49, B: -4.51, C: -7.98 };
        const r = settle.roundNetTotalsToWholeDollars(asNet(c));
        Object.keys(c).forEach(k =>
            assert.ok(Math.abs(r[k.toLowerCase()].net - c[k]) <= 1, `${k} moved too far`));
    });

    test('an all-square round stays all square', () => {
        const r = settle.roundNetTotalsToWholeDollars(asNet({ A: 0, B: 0, C: 0, D: 0 }));
        Object.values(r).forEach(v => assert.equal(v.net, 0));
    });

    test('every output is an integer, always', () => {
        [{ A: 1.1, B: -1.1 }, { A: 33.333, B: 33.333, C: 33.334, D: -100 },
         { A: 0.5, B: 0.5, C: -1 }, { A: 7.77, B: -2.59, C: -2.59, D: -2.59 }].forEach(c => {
            const r = settle.roundNetTotalsToWholeDollars(asNet(c));
            Object.values(r).forEach(v =>
                assert.ok(Number.isInteger(v.net), `${v.name} got ${v.net}`));
            assert.equal(totalOf(r), 0);
        });
    });
});

describe('WHOLE DOLLARS — through the real settlement path', () => {
    // Skins over 8 players and 2v2 halves both produce fractions naturally.
    function heavyRound() {
        const cd = makeCourseData(18);
        const names = ['Marty', 'John', 'Manny', 'Jose', 'Steve', 'Al', 'Bo', 'Cy'];
        const p = makePlayers(names, names.map(() => 0));
        const scores = {};
        cd.forEach((h, i) => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + ((pi === 0 && i % 3 === 0) ? -1 : (pi % 3 === 2 ? 1 : 0));
        }));
        const mk = (a, b, stake, presses) => ({
            format: 'stroke', scoring: 'net', overallStake: stake, holeStake: 0,
            tieRule: 'push', overallMode: 'stroke', segment: 'full',
            teamAIds: a.map(x => String(x.id)), teamBIds: b.map(x => String(x.id)),
            overallPresses: presses || {}
        });
        return {
            cd, p, scores,
            data: {
                gameFormat: 'stroke', players: p, courseData: cd, scores,
                additionalGames: {
                    skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' },
                    dots: { enabled: true, dotPointVal: 2 }
                },
                dots: { h4: { [`p${p[0].id}`]: ['birdie'] } },
                birdieGameEnabled: true, birdieUnitVal: 5, birdieScoringType: 'gross',
                sideMatches: {
                    m1: mk([p[0]], [p[1]], 50, { a: { startHole: 6, stake: 50 }, b: { startHole: 10, stake: 100 } }),
                    m2: mk([p[0]], [p[4]], 100, { c: { startHole: 9, stake: 200 } }),
                    m3: mk([p[2], p[3]], [p[1], p[4]], 100, { d: { startHole: 11, stake: 200 } })
                }
            }
        };
    }

    const { cd, scores, data } = heavyRound();
    const result = settle.computeCombinedNetTotals(data, cd, scores);

    test('every final balance is a whole dollar', () => {
        Object.values(result.netByName).forEach(v =>
            assert.ok(Number.isInteger(v.net), `${v.name} owes ${v.net}`));
    });

    test('they sum to exactly zero', () => {
        assert.equal(Object.values(result.netByName).reduce((s, v) => s + v.net, 0), 0);
    });

    test('every Who Pays Who payment is a whole dollar', () => {
        result.transactions.forEach(t =>
            assert.ok(Number.isInteger(t.amount), `${t.from} → ${t.to} is $${t.amount}`));
    });

    test('Who Pays Who reconciles EXACTLY — no rounding drift left', () => {
        // Before whole-dollar allocation this needed a tolerance, because simplifyDebts
        // rounded to cents on top of fractional balances. Running it from integers means
        // the reconciliation is now exact.
        const paid = {};
        result.transactions.forEach(t => {
            paid[t.from] = (paid[t.from] || 0) - t.amount;
            paid[t.to] = (paid[t.to] || 0) + t.amount;
        });
        Object.values(result.netByName).forEach(v =>
            assert.equal(paid[v.name] || 0, v.net, `${v.name} does not reconcile exactly`));
    });

    test('the exact canonical totals are still available, unrounded', () => {
        assert.ok(result.exact, 'the precise figures must survive for the engines');
        const exactSum = Object.values(result.exact).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(exactSum) < ZERO, 'canonical math is still zero-sum');
        const anyFraction = Object.values(result.exact).some(v => !Number.isInteger(v.net));
        assert.ok(anyFraction, 'this fixture should genuinely produce cents before rounding');
    });

    test('nobody is more than a dollar from their canonical position', () => {
        Object.keys(result.netByName).forEach(k => {
            const drift = Math.abs(result.netByName[k].net - result.exact[k].net);
            assert.ok(drift <= 1, `${k} moved ${drift} from canonical`);
        });
    });

    test('rounding happens ONCE, after combination — not per wager', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function calculateOverallBetEngine'), se.indexOf('function buildSideMatchReceipts'));
        assert.ok(!/roundNetTotalsToWholeDollars/.test(fn),
            'the wager engines must keep full precision');
        const combiner = se.slice(se.indexOf('function computeCombinedNetTotals'), se.length);
        assert.ok(/roundNetTotalsToWholeDollars\(netByName\)/.test(combiner));
        assert.ok(combiner.indexOf('roundNetTotalsToWholeDollars(netByName)') < combiner.indexOf('simplifyDebts(netTotals)'),
            'Who Pays Who must run from the rounded balances');
    });

    test('score corrections recompute before rounding', () => {
        const fixed = Object.assign({}, scores);
        fixed[`p${data.players[0].id}_h7`] = 2;
        const after = settle.computeCombinedNetTotals(Object.assign({}, data, { scores: fixed }), cd, fixed);
        assert.equal(Object.values(after.netByName).reduce((s, v) => s + v.net, 0), 0);
        Object.values(after.netByName).forEach(v => assert.ok(Number.isInteger(v.net)));
    });

    test('no cents string appears in the money display code', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function renderFinishRoundMoney'), idx.indexOf('function findMissingScores'));
        assert.ok(!/toFixed\(2\)/.test(fn), 'Round Complete must not force two decimals');
        assert.ok(/fmtWhole/.test(fn));
    });
});

describe('ONE CLEAN FINISH — the modal', () => {
    const idx = read('index.html');
    const code = idx.replace(/<!--[\s\S]*?-->/g, '')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

    test('REGRESSION: money-engine.js is loaded, so Final Money cannot fail', () => {
        // settlement-engine.js calls computeRoundMoneyByPlayer and simplifyDebts; this
        // page carries inline copies of NEITHER. Without the tag, Final Money threw on
        // every single round and the golfer was told to check another tab.
        const tagAt = f => idx.indexOf(`<script src="${f}"></script>`);
        assert.ok(tagAt('money-engine.js') > -1);
        assert.ok(tagAt('money-engine.js') < tagAt('settlement-engine.js'));
    });

    test('the modal really can total the money now', () => {
        const sb = loadHtmlInlineScript('index.html',
            ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']);
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
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)]
                }
            }
        };
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; renderFinishRoundMoney();`, sb);
        const money = sb.document.getElementById('fr-final-money').innerHTML;
        assert.ok(!/Couldn't total the money/.test(money), 'the failure message is back');
        assert.match(money, /Marty/);
        assert.match(money, /\$50\b/, 'whole dollars, no cents');
    });

    test('the dead View Settle link is gone', () => {
        // It resolved to '#': getNavLinkHref searched the nav for "Settle" and the nav
        // reads "Results". There is no separate Settle page - settlement.html IS Results.
        assert.ok(!/View Settle/.test(code));
        assert.ok(!/getNavLinkHref\('Settle'\)/.test(code));
    });

    test('Stats and Leaderboard survive as secondary links', () => {
        assert.ok(/getNavLinkHref\('Stats'\)/.test(code));
        assert.ok(/getNavLinkHref\('Leaderboard'\)/.test(code));
        assert.ok(/fr-jump-small/.test(code), 'they should not compete with the Receipt');
    });

    test('the Receipt is the primary detail action', () => {
        assert.ok(/Round Receipt/.test(code));
        assert.ok(/openReceipt\(\)/.test(code));
    });

    test('the round is over, so the close button says Done', () => {
        assert.ok(!/Keep Playing/.test(code));
        assert.ok(/>Done<\/button>/.test(code));
    });

    test('presses are counted, not called "Active" at hole 18', () => {
        assert.ok(!/Active Presses/.test(code));
        assert.ok(/press\$\{pressCount === 1 \? '' : 'es'\}/.test(code));
    });

    test('the incomplete-score distinction from Wave 4 survives', () => {
        assert.ok(/Money So Far \\u2014 Not Final|Money So Far — Not Final/.test(idx));
        assert.ok(/function findMissingScores/.test(code));
    });
});
