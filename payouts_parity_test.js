// ============================================================================
// PAYOUTS — ONE PLACE/TIE RULE, TWO PRODUCTS
//
// allocatePlacePayouts() decides what a finisher is paid from a set of per-place
// prize amounts. Trip Mode's prize table and Tournament Mode's payout column both
// pay places, both split ties the same way, and both were written out separately -
// tournament-engine.js's own comment described its copy as mirroring Trip's math
// "exactly", which is an accurate description of a duplicate rather than a
// substitute for one.
//
// ---------------------------------------------------------------------------
// HOW THIS SUITE WAS BUILT
// ---------------------------------------------------------------------------
//
// Against the two REAL implementations, before anything was extracted. That
// included trip.html's, which lives inside renderPrizePayouts() and reads
// module-level state - reachable through the mini-DOM by setting
// cachedPointsStandings and the prize inputs, then parsing the ledger rows it
// renders. Nineteen adversarial cases, zero divergences.
//
// That matters because the previous version of this coverage could not do it.
// prize_payouts_test.js carried a hand-transcribed MIRROR of trip.html's
// algorithm and said so in its own header, because reaching the real one was
// judged impossible at the time. A copied expected algorithm is the exact thing
// this project has spent five batches removing, and it is gone now: the tests
// below drive production.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT SHARED
// ---------------------------------------------------------------------------
//
// pool-engine.js's splitCentsEvenly(), allocateWholeDollars() and
// moneyPoolNetPlaceCents(). They look adjacent and are a different primitive -
// integer cents, percentage or weight based, with a largest-remainder
// determinism rule - and they are not duplicated anywhere. A test below pins
// that separation, so a later batch cannot quietly fold Consumer settlement into
// a shared module on the grounds that both things divide money.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// vm objects carry a foreign prototype, so deepStrictEqual rejects them even when
// every value matches - and Array.prototype.map on a foreign array returns another
// foreign array, which is how this bites even after the values are rebuilt. JSON
// brings everything into this realm. Same guard money_parity_test.js documents.
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const payouts = loadJsFile('payouts.js');
const tourney = loadJsFile('tournament-engine.js');
let tripRealm;
function trip() {
    if (!tripRealm) tripRealm = loadHtmlInlineScript('trip.html');
    return tripRealm;
}

// ---------------------------------------------------------------------------
// DRIVING THE TWO PRODUCTS
// ---------------------------------------------------------------------------

// Tournament's public shape: team rows in, {teamName, rank, amount} out.
function viaTournament(standings, spotAmounts) {
    const rows = standings.map(s => ({ teamName: s.name, rank: s.rank, hasScores: true }));
    return plain(tourney.computeTournamentPayouts(rows, spotAmounts))
        .map(p => ({ name: p.teamName, amount: p.amount }));
}

// Trip's REAL render function, through the mini-DOM, parsed back out of the
// ledger rows it produced. Amounts come back through fmtAmt(), which is Trip's
// own display formatting and not part of the shared rule.
function viaTrip(standings, spotAmounts) {
    const t = trip();
    vm.runInContext('cachedPointsStandings = ' + JSON.stringify(standings) + ';', t);
    t.document.getElementById('prize-spots-input').value = String(spotAmounts.length);
    t.document.getElementById('prize-pool-input').value = '0';
    spotAmounts.forEach((a, i) => { t.document.getElementById('prize-spot-' + i).value = String(a); });
    t.renderPrizePayouts();
    const html = t.document.getElementById('prize-payout-results').innerHTML || '';
    return {
        html: html,
        rows: [...html.matchAll(/<span>(?:[^<]*?)—\s*([^<]*?)<\/span><span class="[^"]*">\$([^<]*)<\/span>/g)]
            .map(m => ({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) })),
    };
}

// ---------------------------------------------------------------------------
// THE MATRIX
//
// Adversarial rather than representative. A payout bug does not show up on a
// clean top three; it shows up on the tie that straddles the last paid place.
// ---------------------------------------------------------------------------

const rank = (name, r) => ({ name: name, rank: r });

const CASES = [
    ['single winner', [rank('A', 1)], [100]],
    ['clean top three, and a fourth who is paid nothing',
        [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 4)], [200, 120, 80]],
    ['two-way tie for first',
        [rank('A', 1), rank('B', 1), rank('C', 3)], [200, 120, 80]],
    ['three-way tie for first',
        [rank('A', 1), rank('B', 1), rank('C', 1), rank('D', 4)], [200, 120, 80]],
    ['tie in the middle of the paid range',
        [rank('A', 1), rank('B', 2), rank('C', 2), rank('D', 4)], [200, 120, 80]],
    ['tie on exactly the last paid place',
        [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 3)], [200, 120, 80]],
    ['tie straddling the paid and unpaid places',
        [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 3), rank('E', 3)], [200, 120, 80]],
    ['the whole field tied for first',
        [rank('A', 1), rank('B', 1), rank('C', 1), rank('D', 1)], [200, 120, 80]],
    ['odd-dollar division', [rank('A', 1), rank('B', 1), rank('C', 1)], [100, 0, 0]],
    ['cent-level division', [rank('A', 1), rank('B', 1), rank('C', 1)], [10, 0, 0]],
    ['zero prize pool', [rank('A', 1), rank('B', 2)], [0, 0]],
    ['no paid places at all', [rank('A', 1), rank('B', 2)], []],
    ['more finishers than paid places',
        [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 4), rank('E', 5)], [100]],
    ['fewer finishers than paid places', [rank('A', 1)], [100, 50, 25]],
    ['fractional place amounts', [rank('A', 1), rank('B', 1)], [33.33, 33.33]],
    ['a negative place amount', [rank('A', 1), rank('B', 2)], [-50, 50]],
    ['ranks that do not start at 1', [rank('A', 2), rank('B', 3)], [200, 120, 80]],
    ['duplicate names', [rank('A', 1), rank('A', 1)], [100, 50]],
    ['twelve finishers with two large ties',
        Array.from({ length: 12 }, (_, i) => rank('P' + i, i < 5 ? 1 : (i < 9 ? 6 : 10))),
        [500, 300, 200, 100, 50]],
];

// ===========================================================================
// 1. BOTH PRODUCTS, ONE RULE
// ===========================================================================

describe('PARITY — Trip and Tournament allocate identically', () => {

    test('the matrix is adversarial enough to be worth running', () => {
        assert.ok(CASES.length >= 19, 'got ' + CASES.length + ' cases');
        const labels = CASES.map(c => c[0]);
        ['tie straddling the paid and unpaid places', 'odd-dollar division',
         'no paid places at all', 'a negative place amount'].forEach(needed =>
            assert.ok(labels.includes(needed), 'the matrix must keep the ' + needed + ' case'));
    });

    CASES.forEach(([label, standings, spots]) => {
        test(`${label} — same answer in both products`, () => {
            const t = trip();
            const fromTrip = viaTrip(standings, spots).rows;
            // Trip renders through fmtAmt(); Tournament returns the raw number. The
            // comparison passes Tournament's answer through the SAME formatter, so a
            // display convention cannot be mistaken for an allocation difference -
            // and an allocation difference cannot hide behind rounding either.
            const fromTournament = viaTournament(standings, spots)
                .map(p => ({ name: p.name, amount: Number(t.fmtAmt(p.amount)) }));
            assert.deepEqual(fromTrip, fromTournament, label);
        });
    });
});

// ===========================================================================
// 2. THE RULE ITSELF
//
// Stated once, in plain terms, so a regression reports what broke rather than
// only that something did. Every expectation here is arithmetic a reader can
// check by hand against the stated rule - none of it is a second implementation.
// ===========================================================================

describe('THE TIE RULE — competition ranks, occupied positions, even split', () => {

    const amounts = (list) => plain(list).map(p => p.amount);

    test('a clean board pays each place its own amount', () => {
        const out = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 2), rank('C', 3)], [200, 120, 80]));
        assert.deepEqual(amounts(out), [200, 120, 80]);
    });

    test('a tie collects every position it occupies and splits it evenly', () => {
        // Two tied for first occupy positions 1 and 2, so they share 200 + 120.
        const out = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 1), rank('C', 3)], [200, 120, 80]));
        assert.deepEqual(amounts(out), [160, 160, 80]);
    });

    test('a tie straddling the last paid place splits only what is inside it', () => {
        // Three tied for third occupy 3, 4 and 5. Only position 3 pays, so 80/3
        // each - nothing is invented for the unpaid positions.
        const out = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 3), rank('E', 3)],
            [200, 120, 80]));
        assert.equal(out[0].amount, 200);
        assert.equal(out[1].amount, 120);
        [2, 3, 4].forEach(i => assert.equal(out[i].amount, 80 / 3));
    });

    test('a finisher outside the paid places is returned at zero, not omitted', () => {
        // Both products show the whole field; a missing row reads as a bug.
        const out = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 2), rank('C', 3)], [100]));
        assert.equal(out.length, 3);
        assert.deepEqual(amounts(out), [100, 0, 0]);
    });

    test('CONSERVATION — a fully paid board distributes exactly the pool', () => {
        const spots = [200, 120, 80];
        const pool = spots.reduce((s, v) => s + v, 0);
        [
            [rank('A', 1), rank('B', 2), rank('C', 3)],
            [rank('A', 1), rank('B', 1), rank('C', 3)],
            [rank('A', 1), rank('B', 1), rank('C', 1)],
            [rank('A', 1), rank('B', 2), rank('C', 2)],
        ].forEach(standings => {
            const total = plain(payouts.allocatePlacePayouts(standings, spots))
                .reduce((s, p) => s + p.amount, 0);
            assert.ok(Math.abs(total - pool) < 1e-9,
                'the board paid ' + total + ' out of a ' + pool + ' pool');
        });
    });

    test('CONSERVATION holds when a tie runs past the paid places', () => {
        // The money inside the paid range is still fully distributed - it is only
        // shared more thinly.
        const spots = [200, 120, 80];
        const total = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 2), rank('C', 3), rank('D', 3), rank('E', 3)], spots))
            .reduce((s, p) => s + p.amount, 0);
        assert.ok(Math.abs(total - 400) < 1e-9, 'got ' + total);
    });

    test('the output order is finishing order within each rank, ranks ascending', () => {
        // Deterministic, and numeric rather than string-sorted: rank 10 must not
        // come before rank 2.
        const out = plain(payouts.allocatePlacePayouts(
            [rank('Z', 10), rank('A', 1), rank('B', 2), rank('Y', 10)], [50, 40, 30]));
        assert.deepEqual(out.map(p => p.entry.name), ['A', 'B', 'Z', 'Y']);
        assert.deepEqual(out.map(p => p.rank), [1, 2, 10, 10]);
    });

    test('NO ROUNDING happens in the shared rule', () => {
        // Each product formats its own way. Rounding here would silently change what
        // one of them displays, and neither asked for that.
        const out = plain(payouts.allocatePlacePayouts(
            [rank('A', 1), rank('B', 1), rank('C', 1)], [100, 0, 0]));
        assert.equal(out[0].amount, 100 / 3);
        assert.notEqual(out[0].amount, 33.33);
    });

    test('empty and malformed inputs do not throw', () => {
        assert.deepEqual(plain(payouts.allocatePlacePayouts([], [100])), []);
        assert.deepEqual(plain(payouts.allocatePlacePayouts(undefined, undefined)), []);
        assert.deepEqual(plain(payouts.allocatePlacePayouts([rank('A', 1)], [])).map(p => p.amount), [0]);
    });
});

// ===========================================================================
// 3. NO-COPY GUARD AND SCOPE
// ===========================================================================

describe('ONE OWNER — and a boundary that must not creep', () => {

    test('payouts.js owns the primitive', () => {
        assert.match(read('payouts.js'), /function allocatePlacePayouts\s*\(/);
        assert.equal(typeof payouts.allocatePlacePayouts, 'function');
    });

    test('neither consumer redeclares it or reimplements the rank-group loop', () => {
        ['trip.html', 'tournament-engine.js'].forEach(f => {
            const src = read(f);
            const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
            assert.ok(!/function allocatePlacePayouts\s*\(/.test(inline),
                f + ' must not redeclare allocatePlacePayouts');
            // The loop itself, not just the name. Both copies computed a lastPos and
            // summed spotAmounts across it; either reappearing means the rule was
            // written out a third time under another name.
            assert.ok(!/lastPos\s*=\s*rank\s*\+/.test(inline),
                f + ' must not rebuild the tie-position loop');
            assert.ok(!/sumForGroup/.test(inline),
                f + ' must not rebuild the per-group sum');
        });
    });

    test('nothing else in the repo declares it either', () => {
        fs.readdirSync(REPO_ROOT)
            .filter(f => (f.endsWith('.html') || f.endsWith('.js')) && f !== 'payouts.js')
            .filter(f => !/_test\.js$|\.test\.js$/.test(f))
            .forEach(f => assert.ok(!/function allocatePlacePayouts\s*\(/.test(read(f)),
                'allocatePlacePayouts has reappeared in ' + f));
    });

    test('every consumer loads payouts.js', () => {
        ['trip.html', 'tournament.html', 'tournament-scorecard.html'].forEach(page =>
            assert.match(read(page), /<script src="payouts\.js">/,
                page + ' must load payouts.js'));
    });

    test('both realms resolve to the canonical function at run time', () => {
        // Source text says the copies are gone; this says each product actually ends
        // up calling the shared one.
        assert.equal(typeof trip().allocatePlacePayouts, 'function');
        const spots = [200, 120, 80];
        const st = [rank('A', 1), rank('B', 1), rank('C', 3)];
        assert.deepEqual(
            JSON.parse(JSON.stringify(trip().allocatePlacePayouts(st, spots))),
            JSON.parse(JSON.stringify(payouts.allocatePlacePayouts(st, spots))));
    });

    test('the money-pool allocators stay in pool-engine.js, deliberately', () => {
        // A DIFFERENT PRIMITIVE. Integer cents, percentage or weight based, with a
        // documented largest-remainder determinism rule this one does not need - and
        // not duplicated anywhere. Pinned so a later batch cannot fold Consumer
        // settlement into a shared module on the grounds that both divide money.
        const pool = read('pool-engine.js');
        ['splitCentsEvenly', 'allocateWholeDollars', 'moneyPoolNetPlaceCents'].forEach(fn =>
            assert.match(pool, new RegExp('function ' + fn + '\\s*\\('),
                'pool-engine.js should still own ' + fn));
        const shared = read('payouts.js');
        ['splitCentsEvenly', 'allocateWholeDollars', 'moneyPoolNetPlaceCents'].forEach(fn =>
            assert.ok(!new RegExp('function ' + fn + '\\s*\\(').test(shared),
                fn + ' does not belong in payouts.js - it is a different primitive'));
    });

    test('settlement workflow was not dragged into the shared module', () => {
        const shared = read('payouts.js');
        ['computeCombinedNetTotals', 'simplifyDebts', 'calculateMatchEngine',
         'calculateOverallBetEngine', 'buildSideMatchReceipts'].forEach(fn =>
            assert.ok(!new RegExp(fn).test(shared),
                fn + ' is Consumer settlement and must not appear in payouts.js'));
    });

    test('payouts.js has no dependencies and runs no top-level code', () => {
        const bare = {};
        vm.createContext(bare);
        vm.runInContext(read('payouts.js'), bare, { filename: 'payouts.js' });
        assert.equal(typeof bare.allocatePlacePayouts, 'function');
        const src = read('payouts.js')
            .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const topLevel = src.split('\n').filter(l => /^\S/.test(l))
            .filter(l => !/^function\s/.test(l) && !/^\}/.test(l) && l.trim() !== '');
        assert.deepEqual(topLevel, []);
    });
});
