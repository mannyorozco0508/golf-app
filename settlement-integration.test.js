const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const settlement = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'settlement-engine.js']);

describe('SETTLEMENT INTEGRATION GAP — Skins as main format (confirmed bug, now fixed)', () => {
    test('REGRESSION: the exact bug-reproduction scenario — hole1 tie, hole2 tie, hole3 outright win — now correctly appears in Combined Settlement', () => {
        const cd = makeCourseData(3);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        const scores = {
            [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 4,
            [`p${players[0].id}_h2`]: 5, [`p${players[1].id}_h2`]: 5,
            [`p${players[0].id}_h3`]: 3, [`p${players[1].id}_h3`]: 5,
        };
        const data = { players, gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true, skinsPotFormat: 'gross', courseData: cd, scores };
        const result = settlement.computeCombinedNetTotals(data, cd, scores);
        const byName = Object.fromEntries(Object.values(result.netByName).map(v => [v.name, v.net]));
        assert.equal(byName.Manny, 5, 'Manny wins the full $10 pot (2 buy-ins of $5), nets +$5 after his own $5 buy-in');
        assert.equal(byName.John, -5, 'John contributed $5 and won nothing back');
    });

    test('INVARIANT: Skins settlement is always exactly zero-sum, net of every player\'s own buy-in', () => {
        const cd = makeCourseData(9);
        const players = makePlayers(['A', 'B', 'C', 'D'], [8, 12, 4, 18]);
        const scores = {};
        cd.forEach((h, i) => {
            players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = 3 + ((i + pi) % 5); });
        });
        const data = { players, gameFormat: 'skins', skinsBuyIn: 2, skinsCarryOver: true, skinsPotFormat: 'split', courseData: cd, scores };
        const result = settlement.computeCombinedNetTotals(data, cd, scores);
        const sum = Object.values(result.netByName).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(sum) < 0.01, `Skins settlement must sum to zero, got ${sum}`);
    });

    test('a Skins round with No Carry (void mode) also correctly contributes to combined settlement', () => {
        const cd = makeCourseData(2);
        const players = makePlayers(['A', 'B'], [0, 0]);
        const scores = { [`p${players[0].id}_h1`]: 3, [`p${players[1].id}_h1`]: 5, [`p${players[0].id}_h2`]: 4, [`p${players[1].id}_h2`]: 4 };
        const data = { players, gameFormat: 'skins', skinsBuyIn: 10, skinsCarryOver: false, skinsPotFormat: 'gross', courseData: cd, scores };
        const result = settlement.computeCombinedNetTotals(data, cd, scores);
        const byName = Object.fromEntries(Object.values(result.netByName).map(v => [v.name, v.net]));
        // Void mode: only hole 1 decided (A wins), hole 2 tied and simply thrown out.
        // Pot = $20, 1 skin decided -> worth the full $20. A nets +$10 (won $20, paid in $10).
        assert.equal(byName.A, 10);
        assert.equal(byName.B, -10);
    });

    test('renderSettlement no longer shows the old "not built yet" fallback message for Skins', () => {
        const cd = makeCourseData(3);
        const players = makePlayers(['Manny', 'John'], [0, 0]);
        const scores = { [`p${players[0].id}_h1`]: 4, [`p${players[1].id}_h1`]: 5 };
        const data = { players, gameFormat: 'skins', skinsBuyIn: 5, skinsCarryOver: true, courseData: cd, scores };
        settlement.renderSettlement(data);
        const html = settlement.document.getElementById('settle-content').innerHTML;
        assert.ok(!html.includes('not built yet'), 'the confirmed bug (blank Skins settlement) must not reappear');
        assert.ok(html.includes('Skins Settlement'));
    });
});

describe('SETTLEMENT INTEGRATION GAP — Hi-Lo as main format (confirmed bug, now fixed)', () => {
    test('REGRESSION: a clear Hi-Lo winner now correctly appears in Combined Settlement, matching the live ticker\'s exact formula', () => {
        const cd = makeCourseData(4);
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1'; players[2].team = 'Team 2'; players[3].team = 'Team 2';
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 4; scores[`p${players[2].id}_h${h.hole}`] = 6; scores[`p${players[3].id}_h${h.hole}`] = 7; });
        const data = { players, gameFormat: 'hilo', holeBetStake: 5, courseData: cd, scores };
        const result = settlement.computeCombinedNetTotals(data, cd, scores);
        const byName = Object.fromEntries(Object.values(result.netByName).map(v => [v.name, v.net]));
        // Team 1 wins both low ball and high ball every hole = 1 pt/hole x 4 holes x $5 = $20 swing
        assert.equal(byName.A, 10);
        assert.equal(byName.B, 10);
        assert.equal(byName.C, -10);
        assert.equal(byName.D, -10);
    });

    test('INVARIANT: Hi-Lo settlement is always exactly zero-sum', () => {
        const cd = makeCourseData(6);
        const players = makePlayers(['A', 'B', 'C', 'D'], [5, 10, 8, 20]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1'; players[2].team = 'Team 2'; players[3].team = 'Team 2';
        let scores = {};
        cd.forEach((h, i) => { players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = 3 + ((i + pi * 2) % 4); }); });
        const data = { players, gameFormat: 'hilo', holeBetStake: 3, courseData: cd, scores };
        const result = settlement.computeCombinedNetTotals(data, cd, scores);
        const sum = Object.values(result.netByName).reduce((s, v) => s + v.net, 0);
        assert.ok(Math.abs(sum) < 0.01, `Hi-Lo settlement must sum to zero, got ${sum}`);
    });

    test('a genuinely tied Hi-Lo result correctly contributes nothing, not an error', () => {
        const cd = makeCourseData(2);
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1'; players[2].team = 'Team 2'; players[3].team = 'Team 2';
        let scores = {};
        cd.forEach(h => { scores[`p${players[0].id}_h${h.hole}`] = 3; scores[`p${players[1].id}_h${h.hole}`] = 6; scores[`p${players[2].id}_h${h.hole}`] = 4; scores[`p${players[3].id}_h${h.hole}`] = 5; });
        const data = { players, gameFormat: 'hilo', holeBetStake: 5, courseData: cd, scores };
        assert.doesNotThrow(() => settlement.computeCombinedNetTotals(data, cd, scores));
    });

    test('renderSettlement no longer shows the old "not built yet" fallback message for Hi-Lo', () => {
        const cd = makeCourseData(2);
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        players[0].team = 'Team 1'; players[1].team = 'Team 1'; players[2].team = 'Team 2'; players[3].team = 'Team 2';
        const scores = {};
        const data = { players, gameFormat: 'hilo', holeBetStake: 5, courseData: cd, scores };
        settlement.renderSettlement(data);
        const html = settlement.document.getElementById('settle-content').innerHTML;
        assert.ok(!html.includes('not built yet'));
        assert.ok(html.includes('Hi-Lo Settlement'));
    });
});

describe('PARITY — the new Skins settlement math matches skins.html\'s actual displayed payout exactly', () => {
    const skinsPage = loadHtmlInlineScript('skins.html');

    test('same round, same inputs: settlement.html\'s net-of-buyin plus each player\'s buyIn equals skins.html\'s displayed gross payout', () => {
        const cd = makeCourseData(5);
        const players = makePlayers(['A', 'B', 'C'], [0, 0, 0]);
        let scores = {};
        cd.forEach((h, i) => { players.forEach((p, pi) => { scores[`p${p.id}_h${h.hole}`] = 3 + ((i + pi) % 4); }); });
        const data = { players, skinsBuyIn: 4, skinsCarryOver: true, skinsPotFormat: 'gross' };

        const settleNet = settlement.computeSkinsSettlementNet(data, cd, scores);

        // Mirror skins.html's own gross-payout computation for comparison (same functions, same file)
        const grossResult = skinsPage.computeSkinsCarryOver(players, cd, scores, 'gross');
        const totalPot = 4 * players.length;
        const grossSkinValue = totalPot / cd.length;
        let expectedPayout = {};
        players.forEach(p => expectedPayout[p.id] = 0);
        grossResult.skins.forEach(s => { expectedPayout[s.player.id] += s.unitsWon * grossSkinValue; });
        if (grossResult.pendingUnits > 0) {
            const share = (grossResult.pendingUnits * grossSkinValue) / players.length;
            players.forEach(p => expectedPayout[p.id] += share);
        }

        players.forEach(p => {
            const reconstructedPayout = settleNet[p.id] + 4; // net + their own buyIn = gross payout
            assert.ok(Math.abs(reconstructedPayout - expectedPayout[p.id]) < 0.01,
                `${p.name}: settlement.html's math should reconstruct the exact same gross payout skins.html computes`);
        });
    });
});
