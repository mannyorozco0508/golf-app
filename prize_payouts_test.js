const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile } = require('./helpers/load-script.js');

const tourneyEngine = loadJsFile('tournament-engine.js');
const { computeTournamentPayouts, ordinal } = tourneyEngine;

// ============================================================================
// IMPORTANT NOTE ON THIS FILE
// trip.html's prize-payout tie-splitting algorithm (in renderPrizePayouts) is
// embedded directly inside a DOM-dependent render function, reading module-level
// `let` state (cachedPointsStandings, etc.) that isn't reachable from outside that
// script's own lexical scope without either modifying production code to expose it
// separately, or rewriting the extracted source text before executing it — both of
// which cross the "don't touch production logic" line for this task. So:
//
//   1. `payoutAllocation()` below is a verbatim-transcribed mirror of that exact
//      algorithm (see trip.html's renderPrizePayouts, the rank-group/lastPos/
//      sumForGroup loop) — used for comprehensive, fast edge-case coverage.
//   2. The parity block at the bottom cross-checks that mirror against
//      tournament-engine.js's `computeTournamentPayouts` — a genuinely separate,
//      independently-callable implementation of the SAME tie-splitting algorithm
//      (built this session specifically to match Trip's). If these two ever
//      disagree, that's a real signal something drifted, even without a literal
//      call into trip.html's embedded copy.
// ============================================================================

function payoutAllocation(standings, spotAmounts) {
    const n = spotAmounts.length;
    const rankGroups = {};
    standings.forEach(s => {
        if (!rankGroups[s.rank]) rankGroups[s.rank] = [];
        rankGroups[s.rank].push(s);
    });
    let payouts = [];
    Object.keys(rankGroups).map(Number).sort((a, b) => a - b).forEach(rank => {
        const group = rankGroups[rank];
        const lastPos = rank + group.length - 1;
        let sumForGroup = 0;
        for (let pos = rank; pos <= lastPos; pos++) {
            if (pos >= 1 && pos <= n) sumForGroup += spotAmounts[pos - 1];
        }
        const perPlayer = sumForGroup / group.length;
        group.forEach(s => payouts.push({ name: s.name, rank, amount: perPlayer }));
    });
    return payouts;
}

describe('trip.html payout mirror — normal cases', () => {
    test('a clean top-3 payout with no ties', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }, { name: 'D', rank: 4 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]);
        assert.equal(payouts.find(p => p.name === 'A').amount, 200);
        assert.equal(payouts.find(p => p.name === 'B').amount, 120);
        assert.equal(payouts.find(p => p.name === 'C').amount, 80);
        assert.equal(payouts.find(p => p.name === 'D').amount, 0, 'A player outside the paid spots still gets an entry, correctly valued at $0 (not omitted)');
    });

    test('INVARIANT: total distributed equals the pool for a clean, fully-paid field', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]);
        const total = payouts.reduce((s, p) => s + p.amount, 0);
        assert.equal(total, 400);
    });
});

describe('trip.html payout mirror — ties', () => {
    test('a tie for 1st splits the combined money for the positions they occupy', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 1 }, { name: 'C', rank: 3 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]);
        assert.equal(payouts.find(p => p.name === 'A').amount, 160, '(200+120)/2');
        assert.equal(payouts.find(p => p.name === 'B').amount, 160);
        assert.equal(payouts.find(p => p.name === 'C').amount, 80);
    });

    test('a tie in the middle of the paid range', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 2 }, { name: 'D', rank: 4 }];
        const payouts = payoutAllocation(standings, [200, 120, 80, 40]);
        assert.equal(payouts.find(p => p.name === 'A').amount, 200);
        assert.equal(payouts.find(p => p.name === 'B').amount, 100, '(120+80)/2');
        assert.equal(payouts.find(p => p.name === 'C').amount, 100);
        assert.equal(payouts.find(p => p.name === 'D').amount, 40);
    });

    test('a tie for exactly the last paid position', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }, { name: 'D', rank: 3 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]); // only top 3 paid
        assert.equal(payouts.find(p => p.name === 'C').amount, 40, 'tied for the last paid spot, split just that spot\'s $80');
        assert.equal(payouts.find(p => p.name === 'D').amount, 40);
    });

    test('CRITICAL: a tie spanning the paid/unpaid boundary only splits the money actually within the paid range', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }, { name: 'D', rank: 3 }, { name: 'E', rank: 5 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]); // only top 3 paid; C&D tie for 3rd (positions 3 AND 4)
        assert.equal(payouts.find(p => p.name === 'C').amount, 40, 'C/D should split only the $80 for position 3 — position 4 is unpaid');
        assert.equal(payouts.find(p => p.name === 'D').amount, 40);
        const total = payouts.reduce((s, p) => s + p.amount, 0);
        assert.equal(total, 400, 'Total distributed should still equal the full pool — nothing should leak out for the unpaid position 4');
    });

    test('an all-tied field (everyone ties for 1st) splits the entire pool evenly, using only the paid spots', () => {
        const standings = [{ name: 'A', rank: 1 }, { name: 'B', rank: 1 }, { name: 'C', rank: 1 }, { name: 'D', rank: 1 }];
        const payouts = payoutAllocation(standings, [200, 120, 80]); // 3 paid spots, 4-way tie
        // The tie group occupies positions 1-4, but only 1-3 are paid -> sum=400, split 4 ways
        payouts.forEach(p => assert.equal(p.amount, 100));
        const total = payouts.reduce((s, p) => s + p.amount, 0);
        assert.equal(total, 400);
    });
});

describe('PARITY: Trip mirror vs tournament-engine.js computeTournamentPayouts (independently-callable, same algorithm)', () => {
    const scenarios = [
        { name: 'clean top-3', standings: [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }], spots: [200, 120, 80] },
        { name: 'tie for 1st', standings: [{ name: 'A', rank: 1 }, { name: 'B', rank: 1 }, { name: 'C', rank: 3 }], spots: [200, 120, 80] },
        { name: 'tie straddling paid/unpaid line', standings: [{ name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'C', rank: 3 }, { name: 'D', rank: 3 }], spots: [200, 120, 80] },
        { name: 'all-tied field', standings: [{ name: 'A', rank: 1 }, { name: 'B', rank: 1 }, { name: 'C', rank: 1 }], spots: [150, 90, 60] },
    ];

    scenarios.forEach(sc => {
        test(`${sc.name}: mirror and tournament-engine.js agree exactly`, () => {
            // tournament-engine.js's computeTournamentPayouts expects rows with a `hasScores`
            // flag and `teamName`; adapt the shared standings shape without changing either engine.
            const rows = sc.standings.map(s => ({ ...s, teamName: s.name, hasScores: true }));
            const fromMirror = payoutAllocation(sc.standings, sc.spots)
                .map(p => ({ name: p.name, amount: p.amount })).sort((a, b) => a.name.localeCompare(b.name));
            const fromTournamentEngine = computeTournamentPayouts(rows, sc.spots)
                .map(p => ({ name: p.teamName, amount: p.amount })).sort((a, b) => a.name.localeCompare(b.name));
            // JSON comparison rather than assert.deepEqual — computeTournamentPayouts runs
            // inside a vm sandbox with its own separate realm/Object.prototype, which can make
            // otherwise-identical plain objects fail a strict structural equality check for
            // reasons unrelated to their actual data. JSON.stringify only compares real values.
            assert.equal(
                JSON.stringify(fromMirror), JSON.stringify(fromTournamentEngine),
                `Trip's payout logic and Tournament's independently-built payout engine must agree on "${sc.name}"`
            );
        });
    });
});

describe('tournament-engine.js — ordinal formatting (shared by both payout displays)', () => {
    test('standard ordinal suffixes', () => {
        assert.equal(ordinal(1), '1st');
        assert.equal(ordinal(2), '2nd');
        assert.equal(ordinal(3), '3rd');
        assert.equal(ordinal(4), '4th');
        assert.equal(ordinal(11), '11th', 'the 11-13 teens exception should not become "11st"');
        assert.equal(ordinal(12), '12th');
        assert.equal(ordinal(13), '13th');
        assert.equal(ordinal(21), '21st');
    });
});
