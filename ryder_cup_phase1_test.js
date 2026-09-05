// ============================================================================
// RYDER CUP PHASE 1 — TEAM + POINTS FOUNDATION
//
// The invariant this suite exists to protect: adding a Ryder Cup competition to a
// round changes the POINTS and changes NOTHING about the money. Not "the money is
// filtered out of the display" - there is no Ryder money to filter, because
// ryder-cup.js contains no stake and no ledger write, and no money surface imports
// it.
//
// The centrepiece is the A/B test: two rounds identical in every respect except
// that one carries a Ryder Cup competition, asserted deep-equal across the entire
// settlement output. If a Ryder point ever leaks into a dollar, that test fails.
//
// Legacy `ryder` is a separate concern and separately protected below: the old
// field-wide money format must settle exactly as it always did.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js']);
const SETTLE = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const PAR = [4,4,3,5,4,4,4,5,3,4,4,4,5,4,3,4,3,5];
const HCP = [3,9,15,13,5,7,1,17,11,4,8,18,14,2,16,10,6,12];
const CD = PAR.map((par, i) => ({ hole: i+1, par, hcpIndex: HCP[i] }));

const ZERO = 0.005;

// Manny + Matt (side A) vs Marty + Scott (side B).
function players() {
    return [
        { id: 101, name: 'Manny', hcp: '0', team: 'Team 1', playingForMoney: true },
        { id: 102, name: 'Matt',  hcp: '0', team: 'Team 1', playingForMoney: true },
        { id: 103, name: 'Marty', hcp: '0', team: 'Team 2', playingForMoney: true },
        { id: 104, name: 'Scott', hcp: '0', team: 'Team 2', playingForMoney: true }
    ];
}

// cards: { Manny: [18 scores], ... }
function scoresFrom(cards) {
    const s = {};
    const ids = { Manny: 101, Matt: 102, Marty: 103, Scott: 104 };
    Object.keys(cards).forEach(n => cards[n].forEach((v, i) => { s[`p${ids[n]}_h${i+1}`] = v; }));
    return s;
}

const evens = () => PAR.slice();
// One shot better/worse on a named hole, applied to a par round.
function card(deltas) {
    const c = PAR.slice();
    Object.keys(deltas).forEach(h => { c[Number(h)-1] += deltas[h]; });
    return c;
}

function ryderCupNode(opts) {
    opts = opts || {};
    return {
        v: 1,
        sides: {
            A: { id: 'A', name: opts.nameA || 'Team USA',   color: 'red'  },
            B: { id: 'B', name: opts.nameB || 'Team Europe', color: 'blue' }
        },
        members: opts.members || { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
        matches: {
            m1: {
                id: 'm1', sessionId: 's1', format: 'fourball', scoring: 'net',
                sideA: 'A', sideB: 'B',
                playersA: opts.playersA || ['101', '102'],
                playersB: opts.playersB || ['103', '104']
            }
        }
    };
}

// Three normal money games over the same four golfers, so every test below runs
// with real money present rather than proving isolation against an empty ledger.
function sideMatches() {
    return {
        sm1: { format: 'match', scoring: 'net', stake: 20, pressRule: '2down',
               teamAIds: ['101'], teamBIds: ['103'], presses: {} },
        sm2: { format: 'stroke', scoring: 'net', overallStake: 20, holeStake: 0,
               tieRule: 'push', overallMode: 'stroke', segment: 'full',
               teamAIds: ['102'], teamBIds: ['104'], overallPresses: {} },
        sm3: { format: 'match', scoring: 'net', stake: 50, pressRule: '2down',
               teamAIds: ['101', '102'], teamBIds: ['103', '104'], presses: {} }
    };
}

function round(cards, opts) {
    opts = opts || {};
    const d = {
        gameFormat: 'stroke',
        players: players(),
        courseData: CD,
        scores: scoresFrom(cards),
        sideMatches: opts.noSideMatches ? {} : sideMatches()
    };
    if (opts.ryder) d.ryderCup = opts.ryder;
    return d;
}

// ---- SCORE SETS -----------------------------------------------------------
// A wins: Manny birdies holes 1 and 2, nobody else deviates. Two holes up with
// sixteen halved - a clean 2 UP through 18.
const CARDS_A_WINS = {
    Manny: card({ 1: -1, 2: -1 }), Matt: evens(), Marty: evens(), Scott: evens()
};
// Dead halve: every golfer makes every par. Better-ball is level all eighteen.
const CARDS_HALVED = {
    Manny: evens(), Matt: evens(), Marty: evens(), Scott: evens()
};
// B wins: Scott birdies 1 and 2.
const CARDS_B_WINS = {
    Manny: evens(), Matt: evens(), Marty: evens(), Scott: card({ 1: -1, 2: -1 })
};

const standings = d => RC.computeRyderCupStandings(d, CD, d.scores);
const result = d => RC.computeRyderMatchResult(d, CD, d.scores, 'm1');
const money = d => SETTLE.computeCombinedNetTotals(d, CD, d.scores);

// Money reduced to a comparable plain object. Crosses the vm realm boundary via
// JSON so deepEqual compares VALUES, not prototypes from another context.
function moneyShape(d) {
    const r = money(d);
    return JSON.parse(JSON.stringify({
        netByName: r.netByName,
        exact: r.exact,
        contributions: r.contributions,
        transactions: r.transactions
    }));
}

// ===========================================================================
describe('POINT AWARD — win / halve / loss', () => {

    test('a win awards 1 / 0', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        const r = result(d);
        assert.ok(r.status > 0, `expected side A up, got status ${r.status} (${r.result})`);
        assert.equal(r.pointsA, 1);
        assert.equal(r.pointsB, 0);
    });

    test('a halve awards 0.5 / 0.5', () => {
        const d = round(CARDS_HALVED, { ryder: ryderCupNode() });
        const r = result(d);
        assert.equal(r.status, 0, `expected all square, got ${r.result}`);
        assert.equal(r.pointsA, 0.5);
        assert.equal(r.pointsB, 0.5);
    });

    test('a loss awards 0 / 1', () => {
        const d = round(CARDS_B_WINS, { ryder: ryderCupNode() });
        const r = result(d);
        assert.ok(r.status < 0, `expected side B up, got status ${r.status} (${r.result})`);
        assert.equal(r.pointsA, 0);
        assert.equal(r.pointsB, 1);
    });

    test('every outcome awards exactly one point in total', () => {
        [CARDS_A_WINS, CARDS_HALVED, CARDS_B_WINS].forEach(c => {
            const r = result(round(c, { ryder: ryderCupNode() }));
            assert.equal(r.pointsA + r.pointsB, 1,
                `${r.result}: awarded ${r.pointsA + r.pointsB} points, not 1`);
        });
    });

    test('standings carry the side NAMES, not Team 1 / Team 2', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode({ nameA: 'Team Rattle', nameB: 'Team Chaos' }) });
        const s = standings(d);
        assert.equal(s.sides.A.name, 'Team Rattle');
        assert.equal(s.sides.B.name, 'Team Chaos');
        assert.equal(s.sides.A.points, 1);
        assert.equal(s.sides.B.points, 0);
        assert.equal(s.pointsAvailable, 1);
    });
});

// ===========================================================================
describe('MONEY ISOLATION — the A/B test', () => {

    // ROUND A: four golfers, scores, three side matches, NO Ryder Cup.
    // ROUND B: same golfers, same scores, same side matches, PLUS a Ryder Cup.
    // The entire settlement output must be identical.
    [['a win', CARDS_A_WINS], ['a halve', CARDS_HALVED], ['a loss', CARDS_B_WINS]]
        .forEach(([label, cards]) => {
            test(`adding a Ryder Cup that produces ${label} changes no money at all`, () => {
                const A = round(cards);
                const B = round(cards, { ryder: ryderCupNode() });
                assert.deepEqual(moneyShape(B), moneyShape(A),
                    `settlement differed once a Ryder Cup competition was added (${label})`);
            });
        });

    test('the Ryder Cup is the ONLY additional outcome in Round B', () => {
        const A = round(CARDS_A_WINS);
        const B = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        assert.equal(standings(A), null, 'Round A must have no Ryder Cup standings');
        assert.ok(standings(B), 'Round B must have Ryder Cup standings');
        assert.deepEqual(moneyShape(B), moneyShape(A));
    });

    test('no ledger line anywhere mentions Ryder', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        Object.values(money(d).contributions).forEach(c => {
            c.lines.forEach(l => {
                assert.ok(!/ryder|cup|point/i.test(l.label),
                    `${c.name} carries a ledger line "${l.label}" - a Cup point became money`);
            });
        });
    });

    test('money stays zero-sum with a Ryder Cup present', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        const sum = Object.values(money(d).contributions).reduce((a, c) => a + c.net, 0);
        assert.ok(Math.abs(sum) < ZERO, `money sums to ${sum}, not zero`);
    });

    test('a halved Ryder match creates no transaction of any kind', () => {
        // Not "zero because we filtered it" - there is no Ryder transaction to filter.
        const withRyder = round(CARDS_HALVED, { ryder: ryderCupNode() });
        const without = round(CARDS_HALVED);
        assert.deepEqual(moneyShape(withRyder), moneyShape(without));
        const r = result(withRyder);
        assert.equal(r.pointsA, 0.5);
        assert.equal(r.pointsB, 0.5);
    });

    test('the Four-Ball adapter requests a stake of zero', () => {
        // SOURCE CONTRACT, following the precedent in trust_clarity_test.js, which
        // asserts on literal format arrays for the same reason: some invariants
        // cannot be observed from outputs.
        //
        // A negative control proved this necessary. Changing the adapter to request
        // a $75 stake was caught by NOTHING, because ryder-cup.js is never called by
        // settlement, so its stake can never reach the ledger no matter what it is.
        // The architecture is sound - but "the money can't leak because nobody reads
        // it" stops being true the moment a later phase wires this into a page. This
        // pins the intent while that is still cheap.
        const src = require('fs').readFileSync(
            require('path').join(__dirname, 'ryder-cup.js'), 'utf8');
        // Anchored on the assignment, not the bare name - the header comment above
        // also mentions calculateMatchEngine(), and slicing from that match scanned
        // prose instead of code.
        const call = src.slice(src.indexOf('var calc = calculateMatchEngine('));
        const args = call.slice(0, call.indexOf(');'));
        assert.ok(/\n\s*0,\s*\/\/ stake/.test(args),
            'the adapter must pass a literal 0 stake to calculateMatchEngine');
        assert.ok(/\n\s*0,\s*\/\/ holeBet/.test(args),
            'the adapter must pass a literal 0 holeBet to calculateMatchEngine');
        assert.ok(/'none'/.test(args),
            'a Ryder Cup match is worth one point and must not carry a press rule');
    });

    test('ryder-cup.js contains no money vocabulary at all', () => {
        // Structural, not behavioural: the file must not even be able to move money.
        const src = require('fs').readFileSync(
            require('path').join(__dirname, 'ryder-cup.js'), 'utf8');
        const code = src.split('\n')
            .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))   // strip comment lines
            .join('\n');
        ['computeCombinedNetTotals', 'p1Money', 't1TotalMoney', 'payout', 'settle',
         'transactions', 'netByName'].forEach(term => {
            assert.ok(!code.includes(term),
                `ryder-cup.js references "${term}" outside comments - points and money must not meet`);
        });
    });
});

// ===========================================================================
describe('SIDE MATCH COEXISTENCE', () => {

    test('Ryder resolves AND all three side matches resolve, together', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });

        const r = result(d);
        assert.equal(r.pointsA, 1);

        const recs = SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        const ids = recs.map(x => x.matchId).sort();
        assert.deepEqual(ids.join(','), 'sm1,sm2,sm3',
            `expected all three side matches to settle, got ${ids.join(',')}`);
    });

    test('side-match presses still fire with a Ryder Cup running', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        const sm1 = SETTLE.buildSideMatchReceipts(d, CD, d.scores)
            .find(x => x.matchId === 'sm1');
        assert.ok(sm1.segments.length > 1,
            'sm1 has a 2-down auto press rule and should carry more than one segment');
    });

    test('the same four golfers can play a Ryder match AND a $50 team match', () => {
        // Explicitly the case from the brief: identical pairing, both layers.
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        const r = result(d);
        const sm3 = SETTLE.buildSideMatchReceipts(d, CD, d.scores)
            .find(x => x.matchId === 'sm3');
        assert.equal(r.playersA.join('/'), 'Manny/Matt');
        assert.equal(sm3.teamA.join('/'), 'Manny/Matt');
        assert.equal(r.pointsA, 1, 'the Cup pairing pays a point');
        assert.ok(Math.abs(sm3.net) > 0, 'the money pairing pays dollars');
    });
});

// ===========================================================================
describe('LEGACY `ryder` — must settle exactly as before', () => {

    function legacyRyderRound(cards) {
        return {
            gameFormat: 'ryder', matchStake: 50, matchScoring: 'net',
            players: players(), courseData: CD, scores: scoresFrom(cards), sideMatches: {}
        };
    }

    test('a legacy ryder round still produces its money ledger line', () => {
        const d = legacyRyderRound(CARDS_A_WINS);
        const c = money(d).contributions;
        const manny = Object.values(c).find(x => x.name === 'Manny');
        assert.ok(manny.lines.some(l => !l.note && /ryder/i.test(l.label)),
            'legacy ryder lost its money line - historical settlement changed');
    });

    test('legacy ryder settles the exact amounts it always did', () => {
        // PINNED VALUES, not a shape check. The first version of this suite only
        // asserted that a line mentioning "Ryder" existed, and a negative control
        // proved that too weak: removing 'ryder' from the receipt format array in
        // settlement-engine.js broke the historical Receipt and nothing noticed,
        // because the ledger line comes from a different path than the receipt.
        // Both paths are pinned now.
        const d = legacyRyderRound(CARDS_A_WINS);
        const c = money(d).contributions;
        const net = n => Object.values(c).find(x => x.name === n).net;
        // MEASURED, not assumed. A $50 team stake settles $50 from the losing side
        // to the winning side, split per golfer: $25 each. An earlier draft of this
        // test asserted $50 each from memory and was simply wrong.
        assert.equal(net('Manny'), 25);
        assert.equal(net('Matt'), 25);
        assert.equal(net('Marty'), -25);
        assert.equal(net('Scott'), -25);
    });

    test('legacy ryder still produces its __main receipt block', () => {
        const d = legacyRyderRound(CARDS_A_WINS);
        const main = SETTLE.buildSideMatchReceipts(d, CD, d.scores)
            .find(x => x.matchId === '__main');
        assert.ok(main, 'legacy ryder lost its Receipt block - the round would settle '
            + 'money with nothing on screen explaining where it came from');
        assert.equal(main.format, 'Match Play');
        assert.equal(main.netAmount, 50);
    });

    test('a legacy ryder round is untouched by the new competition type', () => {
        const legacy = legacyRyderRound(CARDS_A_WINS);
        const before = moneyShape(legacy);
        // Attaching a Ryder Cup node to a LEGACY round must not alter its money either.
        const withNew = Object.assign({}, legacy, { ryderCup: ryderCupNode() });
        assert.deepEqual(moneyShape(withNew), before);
    });

    test('legacy ryder is not confused for the new competition', () => {
        assert.equal(RC.hasRyderCup(legacyRyderRound(CARDS_A_WINS)), false);
        assert.equal(RC.ryderCupConfig(legacyRyderRound(CARDS_A_WINS)), null);
    });
});

// ===========================================================================
describe('PERSISTENCE / REOPEN', () => {

    test('the competition survives a full serialize/reload cycle', () => {
        const live = round(CARDS_A_WINS, { ryder: ryderCupNode({ nameA: 'Team Rattle', nameB: 'Team Chaos' }) });
        const before = standings(live);
        const beforeMoney = moneyShape(live);

        // Exactly what a Firebase round-trip does to the round node.
        const reopened = JSON.parse(JSON.stringify(live));
        const after = standings(reopened);

        assert.equal(after.sides.A.name, 'Team Rattle');
        assert.equal(after.sides.B.name, 'Team Chaos');
        assert.equal(after.sides.A.points, before.sides.A.points);
        assert.equal(after.sides.B.points, before.sides.B.points);
        assert.equal(after.matches.length, 1);
        assert.equal(after.matches[0].result, before.matches[0].result);
        assert.equal(RC.ryderSideOfPlayer(reopened, 101), 'A');
        assert.equal(RC.ryderSideOfPlayer(reopened, 104), 'B');
        assert.deepEqual(moneyShape(reopened), beforeMoney);
        assert.equal(Object.keys(reopened.sideMatches).length, 3);
    });

    test('points are DERIVED, never stored', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        const raw = JSON.stringify(d.ryderCup);
        assert.ok(!/points|score|result|status/i.test(raw),
            'the stored competition contains a derived value: ' + raw);
    });

    test('the schema leaves room for sessions and other formats', () => {
        // Not speculative abstraction - just proof Phase 1 has not painted us in.
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        assert.equal(d.ryderCup.matches.m1.sessionId, 's1',
            'a match must already name its session, or adding Day 2 becomes a migration');
        assert.equal(d.ryderCup.matches.m1.format, 'fourball',
            'a match must already name its format, or foursomes/singles cannot slot in');
        assert.equal(d.ryderCup.v, 1, 'a stored competition must declare its schema version');
    });
});

// ===========================================================================
describe('SIDE MEMBERSHIP', () => {

    test('each golfer resolves to the correct side', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        assert.equal(RC.ryderSideOfPlayer(d, 101), 'A');
        assert.equal(RC.ryderSideOfPlayer(d, 102), 'A');
        assert.equal(RC.ryderSideOfPlayer(d, 103), 'B');
        assert.equal(RC.ryderSideOfPlayer(d, 104), 'B');
    });

    test('a golfer outside the competition resolves to no side', () => {
        const d = round(CARDS_A_WINS, { ryder: ryderCupNode() });
        assert.equal(RC.ryderSideOfPlayer(d, 999), null);
    });

    test('the match reports the golfers actually on each side', () => {
        const r = result(round(CARDS_A_WINS, { ryder: ryderCupNode() }));
        assert.equal(r.playersA.join('/'), 'Manny/Matt');
        assert.equal(r.playersB.join('/'), 'Marty/Scott');
    });
});
