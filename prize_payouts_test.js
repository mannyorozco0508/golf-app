const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile } = require('./helpers/load-script.js');

const tourneyEngine = loadJsFile('tournament-engine.js');
const { computeTournamentPayouts, ordinal } = tourneyEngine;

// ============================================================================
// THE TRANSCRIBED MIRROR IS GONE.
//
// This file used to carry payoutAllocation() - a hand-transcribed copy of
// trip.html's tie-splitting algorithm - because reaching the real one was judged
// impossible: it lives inside renderPrizePayouts(), a DOM-dependent function
// reading module-level state. The header said so honestly and treated the
// transcription as the best available option.
//
// It was not. trip.html's real implementation is reachable through the mini-DOM
// by setting cachedPointsStandings and the prize inputs, then reading the rows it
// renders - which is what payouts_parity_test.js now does, against both real
// products, across nineteen adversarial cases.
//
// A copied expected algorithm proves that the copy matches itself. The mirror has
// been replaced by the canonical module: allocatePlacePayouts() in payouts.js,
// which both products now call. The cases below are unchanged in substance and
// now exercise production.
// ============================================================================

const { loadJsFile: _loadPayouts } = require('./helpers/load-script.js');
const { allocatePlacePayouts } = _loadPayouts('payouts.js');

// Same signature the transcribed mirror had, so every case below reads as it did -
// but the body is now one call into the shared module.
function payoutAllocation(standings, spotAmounts) {
    return allocatePlacePayouts(standings, spotAmounts)
        .map(p => ({ name: p.entry.name, rank: p.rank, amount: p.amount }));
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
