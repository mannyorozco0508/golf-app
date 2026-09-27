// ============================================================================
// 9 POINTS (Nines / 5-3-1) — UI Wave 11
//
// Nine points on every hole, all nine always allocated, THREE players:
//     no ties            low 5 · middle 3 · high 1
//     one low, two tie   5-2-2
//     two tie for low    4-4-1
//     all three tie      3-3-3
// Even play is 54 points each over 18.
//
// WHERE IT LIVES, and why it is not a side match. Every side match is
// teamAIds/teamBIds and every settlement path for one is zero-sum between TWO
// sides; settlement-engine.js sends anything that is not format 'stroke' to
// calculateMatchEngine, so a three-player entry in that node would be handed to a
// two-sided engine and settle to nonsense SILENTLY. So 9 Points is an
// additionalGameInstances entry - "independent wagers with their own id,
// participants, stake and range" (action-model.js) - which reaches settlement, the
// Receipt, the Bets rows and Round Ready through one existing path, and which every
// consumer SKIPS until the catalog knows the format.
//
// THE MONEY IS AGAINST THE FIELD, not pairwise: net = rate x (points - mean).
// For three players pairwise is EXACTLY three times that - same winner, same
// ordering, three times the money - so it is a rate choice, and $1 pairwise on an
// 8-point spread would be $24.
//
// AND IT NEVER ROUNDS. Measured before the branch was written: the ledger rounds
// ONCE, at roundNetTotalsToWholeDollars (settlement-engine.js), which keeps `exact`
// in cents beside a whole-dollar `netByName` and reconciles against a target. The
// engine's own words: "Rounding each bet on the way in would change the math;
// rounding the final position does not." Points always sum to 9H, so the mean is an
// integer, so (points - mean) is an integer - and at the offered rates (0.25, 0.50,
// 1) rate x integer is exactly representable. Zero-sum is exact, measured over
// 20,000 random rounds per rate.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = f => require('crypto').createHash('sha256').update(read(f)).digest('hex').slice(0, 16);

const DEPS = ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
    'pool-engine.js', 'aloha-bet.js'];
const E = loadJsFile('settlement-engine.js', DEPS);
const A = loadJsFile('action-model.js', ['handicap.js', 'match-engine.js', 'money-engine.js']);

const CD = makeCourseData(18);
const THREE = [
    { id: 101, name: 'Marty', hcp: '0', playingForMoney: true },
    { id: 102, name: 'Manny', hcp: '0', playingForMoney: true },
    { id: 103, name: 'Lance', hcp: '0', playingForMoney: true },
];
// A round with a 9 Points instance and nothing else, so a net that appears is its.
function ninesRound(opts) {
    const o = opts || {};
    const ids = o.ids || ['101', '102', '103'];
    const scores = {};
    (o.players || THREE).forEach(p => CD.forEach(h => {
        scores['p' + p.id + '_h' + h.hole] = (o.score && o.score(p, h)) || 4;
    }));
    return {
        code: 'NINE1', gameFormat: 'stroke', players: o.players || THREE,
        courseData: CD, scores: scores,
        additionalGameInstances: {
            g1: Object.assign({
                format: 'nines', enabled: true, participantIds: ids,
                ninePointsRate: o.rate === undefined ? 0.5 : o.rate, startHole: 1
            }, o.cfg || {})
        }
    };
}
const gameOf = data => (A.getRoundGames(data) || []).find(g => g.format === 'nines');

// ---------------------------------------------------------------------------
describe('1. NO ENGINE MATH MOVED', () => {
    // The files this wave does NOT change, pinned the way aloha_bet_test.js pins
    // money-engine.js. If one of these moves, the pin is the conversation.
    const PINNED = {
        'money-engine.js': '12bfa41c2c8e6b8a',
        'handicap.js': '2d3b2f7fd916a4b8',
        'pool-engine.js': '372e76d7d5c41c38',
        // hole-events.js is DELIBERATELY not in this wave: the per-hole recap line
        // for 9 Points is logged for later, once the wager is proven.
        'hole-events.js': '6fd7f7edf41e848b',
    };
    Object.keys(PINNED).forEach(f => {
        test(f + ' is byte-for-byte unchanged', () => {
            assert.equal(sha(f), PINNED[f], f + ' changed: ' + sha(f));
        });
    });

    test('9 Points writes no handicap math of its own', () => {
        // The round's existing allocation is used, unchanged. If this file starts
        // computing strokes, two places decide what a net score is.
        const src = read('settlement-engine.js');
        const at = src.indexOf('function computeNinePointsNet');
        assert.ok(at > -1, 'computeNinePointsNet is missing');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 400, 'computeNinePointsNet could not be sliced: ' + fn.length);
        // CALLING handicap.js IS THE POINT; REIMPLEMENTING IT IS NOT. My first version
        // of this test forbade parseHcp and allocateMatchStrokes outright, which would
        // have banned the very thing the brief asked for - "getStrokes,
        // matchRelativeHandicaps and allocateMatchStrokes already exist and are called
        // unchanged". So: it MUST call getStrokes, and must carry no formula of its own.
        assert.match(fn, /getStrokes\(/, 'it does not use the round\'s own allocation');
        [/courseHandicapFromIndex\s*\(/, /slope/i, /courseRating/i, /113/, /\/\s*18\b/]
            .forEach(re => assert.ok(!re.test(fn),
                'computeNinePointsNet looks like it is deriving handicaps itself: ' + re));
        // It must ALSO not round - the ledger rounds once, further down.
        assert.ok(!/Math\.round|toFixed/.test(fn),
            'computeNinePointsNet rounds; the ledger rounds once at '
            + 'roundNetTotalsToWholeDollars and rounding a bet on the way in changes the math');
    });
});

// ---------------------------------------------------------------------------
describe('2. THE TIE TABLE, ALL FOUR CASES, AND THE INVARIANT', () => {
    const pts = nets => E.ninePointsForHole(nets);

    test('no ties: 5 · 3 · 1', () => {
        assert.deepEqual(pts([4, 5, 6]), [5, 3, 1]);
        assert.deepEqual(pts([6, 5, 4]), [1, 3, 5], 'order follows the players, not the sort');
    });
    test('one low, two tie: 5 · 2 · 2', () => {
        assert.deepEqual(pts([4, 5, 5]), [5, 2, 2]);
        assert.deepEqual(pts([5, 4, 5]), [2, 5, 2]);
    });
    test('two tie for low: 4 · 4 · 1', () => {
        assert.deepEqual(pts([4, 4, 5]), [4, 4, 1]);
        assert.deepEqual(pts([5, 4, 4]), [1, 4, 4]);
    });
    test('all three tie: 3 · 3 · 3', () => {
        assert.deepEqual(pts([5, 5, 5]), [3, 3, 3]);
    });

    test('EVERY hole allocates exactly nine, on 10,000 random holes', () => {
        // The invariant the whole wager rests on. If a hole ever allocates 8 or 10,
        // the totals stop summing to 162 and zero-sum goes with them.
        let checked = 0;
        for (let i = 0; i < 10000; i++) {
            const n = [3 + (i % 4), 3 + ((i * 7) % 4), 3 + ((i * 13) % 4)];
            const p = pts(n);
            assert.equal(p.length, 3);
            assert.equal(p.reduce((a, b) => a + b, 0), 9, 'nets ' + n.join('/') + ' gave ' + p.join('/'));
            checked++;
        }
        assert.equal(checked, 10000, 'the loop did not run');
    });

    test('even play is 54 each over 18 holes', () => {
        const totals = [0, 0, 0];
        CD.forEach(() => pts([4, 4, 4]).forEach((v, i) => { totals[i] += v; }));
        assert.deepEqual(totals, [54, 54, 54]);
    });

    test('it refuses anything but three scores', () => {
        [[4, 5], [4, 5, 6, 7], [], [4]].forEach(n =>
            assert.equal(E.ninePointsForHole(n), null, n.length + ' scores must return null'));
    });
});

// ---------------------------------------------------------------------------
describe('3. IT IS NET, FROM THE ROUND\'S OWN ALLOCATION', () => {
    test('a handicap changes the points, so the strokes are really being read', () => {
        // THE TEST THAT WOULD CATCH A GROSS-ONLY IMPLEMENTATION. Marty is worst on
        // gross and best on net; if the points do not move, nothing is allocating
        // strokes.
        const players = [
            { id: 101, name: 'Marty', hcp: '18', playingForMoney: true },
            { id: 102, name: 'Manny', hcp: '0', playingForMoney: true },
            { id: 103, name: 'Lance', hcp: '0', playingForMoney: true },
        ];
        const gross = ninesRound({ players, score: (p) => (p.id === 101 ? 5 : 4) });
        const net = E.computeGameNetByPlayerId(gameOf(gross), CD, gross.scores);
        // On gross Marty loses every hole; on net an 18 handicap gets a stroke a hole,
        // so all three tie at 4 and nobody moves.
        assert.equal(Object.keys(net).length, 3, 'expected three golfers: ' + JSON.stringify(net));
        assert.equal(net['101'], 0, 'an 18 handicap shooting one over scratch should be level: ' + net['101']);
        assert.equal(net['102'], 0);
        assert.equal(net['103'], 0);
        // And the same fixture with handicaps removed is NOT level - which is what
        // proves the assertion above is about the strokes and not about a flat zero.
        const scratch = ninesRound({
            players: players.map(p => Object.assign({}, p, { hcp: '0' })),
            score: (p) => (p.id === 101 ? 5 : 4)
        });
        const flat = E.computeGameNetByPlayerId(gameOf(scratch), CD, scratch.scores);
        assert.ok(flat['101'] < 0, 'on gross Marty must lose: ' + JSON.stringify(flat));
    });
});

// ---------------------------------------------------------------------------
describe('4. THE MONEY: AGAINST THE FIELD, AND ZERO-SUM', () => {
    test('a worked example: 62 / 54 / 46 at $0.50 pays +4 / 0 / -4', () => {
        // Marty wins every hole outright, Lance loses every hole outright: 5/3/1 x 18
        // is 90 / 54 / 18. Kept as arithmetic rather than a fixture guess.
        const d = ninesRound({ rate: 0.5, score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        assert.equal(net['101'], 0.5 * (90 - 54));
        assert.equal(net['102'], 0.5 * (54 - 54));
        assert.equal(net['103'], 0.5 * (18 - 54));
        assert.equal(net['101'] + net['102'] + net['103'], 0, 'not zero-sum');
    });

    test('the rate scales it linearly, and 0.25 is exact', () => {
        [0.25, 0.5, 1].forEach(rate => {
            const d = ninesRound({ rate, score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
            const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
            assert.equal(net['101'], rate * 36, 'rate ' + rate);
            assert.equal(net['101'] + net['102'] + net['103'], 0, 'rate ' + rate + ' broke zero-sum');
        });
    });

    test('zero-sum holds on 400 varied rounds, at every offered rate', () => {
        let ran = 0;
        [0.25, 0.5, 1].forEach(rate => {
            for (let t = 0; t < 400; t++) {
                const d = ninesRound({
                    rate,
                    score: (p, h) => 3 + ((p.id + h.hole * (t + 1)) % 4)
                });
                const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
                const sum = Object.keys(net).reduce((s, k) => s + net[k], 0);
                assert.equal(sum, 0, 'rate ' + rate + ' round ' + t + ' summed ' + sum);
                ran++;
            }
        });
        assert.equal(ran, 1200, 'the loop did not run');
    });

    test('no rate, no money', () => {
        const d = ninesRound({ rate: 0 });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        Object.keys(net).forEach(k => assert.equal(net[k], 0));
    });
});

// ---------------------------------------------------------------------------
describe('5. THREE PLAYERS, ENFORCED IN THE ENGINE TOO', () => {
    // DEFENCE IN DEPTH, PROVED IN ISOLATION as CLAUDE.md requires: the picker is not
    // in the loop here at all. This is the engine refusing on its own.
    [2, 4, 5].forEach(n => {
        test('a ' + n + '-participant game settles nothing', () => {
            const players = Array.from({ length: Math.max(n, 3) }, (_, i) => ({
                id: 101 + i, name: 'P' + i, hcp: '0', playingForMoney: true
            }));
            const ids = players.slice(0, n).map(p => String(p.id));
            const d = ninesRound({ players, ids, score: (p) => 3 + (p.id % 3) });
            const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
            // NOT deepEqual({}): the object comes back from the vm realm with a foreign
            // Object prototype, and assert.deepEqual fails on prototype identity even
            // when the contents match - it reported "2 participants settled money: {}".
            // Read the contents instead, which is what the claim is about.
            assert.equal(Object.keys(net).length, 0,
                n + ' participants settled money: ' + JSON.stringify(net));
        });
    });

    test('and the clean three-player case DOES settle, so the refusal is not blanket', () => {
        const d = ninesRound({ score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        assert.equal(Object.keys(net).length, 3);
        assert.ok(net['101'] > 0, 'the winner won nothing: ' + JSON.stringify(net));
    });

    test('the picker refuses it too, in its own words', () => {
        const src = read('sidematches.html');
        const at = src.indexOf('function npCommit');
        assert.ok(at > -1, 'the 9 Points commit path is missing');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200, 'npCommit could not be sliced: ' + fn.length);
        assert.match(fn, /length !== 3|length < 3|length > 3/, 'npCommit does not check the count');
        assert.match(fn, /uiRefuse\(/, 'npCommit fails silently instead of saying so');
    });
});

// ---------------------------------------------------------------------------
describe('6. THE THREE PLACES AGREE', () => {
    const d = ninesRound({ rate: 0.5, score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });

    test('the same numbers in the game net, the ledger line and the net totals', () => {
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        const combined = E.computeCombinedNetTotals(d, CD, d.scores);
        // THE REAL SHAPE, read out of the engine rather than assumed: the per-line
        // detail is `contributions`, keyed by lowercased name, each { name, lines, net }.
        // My first version looked for a `linesByName` this function has never returned.
        const contrib = combined.contributions || {};
        const exact = combined.exact || {};

        // POSITIVE FIRST: the wager really is in the ledger. Everything below compares
        // numbers, and a ledger with no 9 Points line would compare nothing.
        const marty = ((contrib['marty'] || {}).lines || []).filter(l => /9 Points/.test(l.label));
        assert.equal(marty.length, 1, 'expected one 9 Points line for Marty: '
            + JSON.stringify(contrib['marty']));

        // PLACE 1 - the game's own settlement.
        assert.equal(net['101'], 18);
        // PLACE 2 - the ledger LINE carries the same figure.
        assert.equal(marty[0].amount, net['101'], 'the ledger line disagrees with the game');
        // PLACE 3 - the golfer's exact net total, this being the only wager on the round.
        assert.equal(exact['marty'].net, net['101'], 'the net total disagrees with the line');

        // Lance, the other end of it.
        const lance = ((contrib['lance'] || {}).lines || []).find(l => /9 Points/.test(l.label));
        assert.ok(lance, 'no 9 Points line for Lance');
        assert.equal(lance.amount, net['103'], 'Lance: line vs game');
        assert.equal(exact['lance'].net, net['103'], 'Lance: total vs game');

        // AND MANNY, WHO IS LEVEL, GETS NO LINE AT ALL - asserted rather than skipped,
        // because it is the engine's documented behaviour and not a gap: addAmount
        // returns early on a zero amount ("A ledger line that moves no money"), so a
        // golfer who finished square has nothing to show. The three places still agree:
        // his game net is 0 and his ledger total is 0.
        assert.equal(net['102'], 0, 'the level golfer is not level: ' + net['102']);
        assert.equal((contrib['manny'] || { lines: [] }).lines.length, 0,
            'a zero line was written for the level golfer');
        assert.equal((exact['manny'] || { net: 0 }).net, 0, 'the level golfer has a net total');
    });

    test('and the Receipt builds its card from the SAME function', () => {
        // Not a second calculation: settlement.html:1108 walks
        // getRoundGames(...).filter(role === 'additional') and calls
        // computeGameNetByPlayerId. This asserts the wager is in that list with that
        // role, which is what makes the Receipt card and the ledger inseparable.
        const g = gameOf(d);
        assert.equal(g.role, 'additional', '9 Points is not an additional game, so the '
            + 'Receipt would never build a card for it');
        const src = read('settlement.html');
        assert.match(src, /getRoundGames\(data\)\.filter\(g => g\.role === 'additional'\)/,
            'the Receipt no longer builds its per-game cards that way');
        assert.match(src, /computeGameNetByPlayerId/, 'the Receipt calculates its own numbers');
    });
});

// ---------------------------------------------------------------------------
describe('7. IT NEVER TOUCHES THE OTHER POTS', () => {
    // A round already carrying skins, dots, the Birdie game and a 2v2 side match.
    // Adding 9 Points to it must leave every other line identical to the cent.
    function busyRound(withNines) {
        const players = THREE.concat([
            { id: 104, name: 'Dee', hcp: '0', playingForMoney: true },
            { id: 105, name: 'Eli', hcp: '0', playingForMoney: true },
        ]);
        const scores = {};
        players.forEach(p => CD.forEach(h => {
            scores['p' + p.id + '_h' + h.hole] = 3 + ((p.id + h.hole) % 4);
        }));
        const d = {
            code: 'BUSY1', gameFormat: 'stroke', players, courseData: CD, scores,
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: false } },
            birdieGameEnabled: true, birdieUnitVal: 1,
            sideMatches: {
                sm1: { enabled: true, format: 'match', scoring: 'gross', stake: 10,
                       teamAIds: ['104'], teamBIds: ['105'] }
            }
        };
        if (withNines) {
            d.additionalGameInstances = { g1: { format: 'nines', enabled: true,
                participantIds: ['101', '102', '103'], ninePointsRate: 0.5, startHole: 1 } };
        }
        return d;
    }

    test('every other wager pays exactly what it paid before', () => {
        const before = E.computeCombinedNetTotals(busyRound(false), CD, busyRound(false).scores);
        const after = E.computeCombinedNetTotals(busyRound(true), CD, busyRound(true).scores);
        const others = obj => Object.keys(obj.contributions || {}).reduce((acc, name) => {
            acc[name] = ((obj.contributions[name] || {}).lines || [])
                .filter(l => !/9 Points/.test(l.label))
                .map(l => l.label + '=' + l.amount).sort();
            return acc;
        }, {});
        // POSITIVE: the busy round really does have other wagers on it.
        const beforeLines = Object.values(others(before)).reduce((a, b) => a.concat(b), []);
        assert.ok(beforeLines.length >= 4,
            'the busy fixture paid almost nothing, so this proves little: ' + JSON.stringify(beforeLines));
        assert.deepEqual(others(after), others(before), '9 Points moved another wager');
    });

    test('and it only pays the three golfers in it', () => {
        const d = busyRound(true);
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        assert.deepEqual(Object.keys(net).sort(), ['101', '102', '103']);
    });
});

// ---------------------------------------------------------------------------
describe('8. IT IS AN INSTANCE, NOT A MAIN FORMAT', () => {
    test("'nines' is in the additional-game catalog", () => {
        assert.ok(A.isAdditionalGameFormat('nines'), 'the catalog does not know nines');
        const g = gameOf(ninesRound({}));
        assert.ok(g, 'getRoundGames does not return the wager');
        assert.equal(g.label, '9 Points');
        assert.equal(g.stake, 0.5, 'the rate is not the stake: ' + g.stake);
    });

    test('it can never be the round\'s main format', () => {
        const src = read('action-model.js');
        const labels = src.slice(src.indexOf('const MAIN_GAME_LABELS'), src.indexOf('};', src.indexOf('const MAIN_GAME_LABELS')));
        assert.ok(labels.length > 40, 'MAIN_GAME_LABELS could not be sliced');
        assert.ok(!/nines/.test(labels), '9 Points is offered as a main format');
        // And the wizard does not offer it as a format card.
        assert.ok(!/data-format="nines"/.test(read('admin.html')),
            'the wizard offers nines as a main format card');
    });

    test('the label names the three golfers, through the existing describeGame', () => {
        const d = ninesRound({});
        const text = A.describeGame(gameOf(d));
        assert.match(text, /9 Points/);
        ['Marty', 'Manny', 'Lance'].forEach(n =>
            assert.match(text, new RegExp(n), 'the label does not say who is in it: ' + text));
    });
});

// ---------------------------------------------------------------------------
describe('9. A GOLFER CAN SEE IT WHILE PLAYING', () => {
    const BS = loadJsFile('bet-strip.js', DEPS.concat(['settlement-engine.js']));

    test('the Bets row carries a live status, so the row is not dropped', () => {
        // buildActionRows drops any row whose status is empty (bet-strip.js), which is
        // exactly how this wager would have shipped invisible.
        const d = ninesRound({ score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
        const rows = BS.buildActionRows(d, CD, d.scores, d.players);
        const row = rows.find(r => r.key === 'g1' || /9 Points/.test(r.label || ''));
        assert.ok(row, 'no 9 Points row on the Bets tab: ' + JSON.stringify(rows.map(r => r.label)));
        assert.ok(row.status && row.status.length > 0, 'the row has no status, so it is dropped');
        assert.match(row.status, /Marty/, 'the status does not name the leader: ' + row.status);
        assert.match(row.status, /90|pts/, 'the status does not say the points: ' + row.status);
    });

    test('before anybody scores it says so rather than naming a leader', () => {
        const d = ninesRound({});
        d.scores = {};
        const rows = BS.buildActionRows(d, CD, {}, d.players);
        const row = rows.find(r => r.key === 'g1' || /9 Points/.test(r.label || ''));
        if (row) {
            assert.match(row.status, /No points yet/i, 'an unplayed round claims a leader: ' + row.status);
        }
    });
});

// ---------------------------------------------------------------------------
// WAVE 13 — THE OPTIONS. Four multipliers and a pot, all on the same instance.
//
//   blitz            win the hole by 2+ NET strokes            -> 9-0-0
//   blitzBirdie      ...AND a GROSS birdie or better           -> 18-0-0
//   birdiesDouble    any GROSS birdie on the hole doubles it   -> 5-3-1 becomes 10-6-2
//   parThreesDouble  every par 3 is worth double
//   settlement       'per-point' (Wave 11) or 'pot' (buy-in, most points takes it)
//
// BLITZ ON NET, BIRDIE ON GROSS, and the reasoning is the argument you would have on
// the tee. The POINTS are net, so "I beat you by two" has to be net or a golfer
// getting a stroke could win by two while losing the hole. A BIRDIE is a fact about
// the golf - one under par with the ball - and a net birdie is a stroke, not a
// birdie. It also matches calculateBirdieGameTotalsForSettle's `birdieScoringType ||
// 'gross'`, so two wagers on one card cannot disagree about what a birdie is.
//
// BLITZ+BIRDIE SUPPRESSES BIRDIES DOUBLE. One birdie must not double a hole twice.
// THE CEILING IS 72: base 9, x2 blitz+birdie, x2 par 3, x2 (reserved for the press,
// which is NOT in this wave). Pinned as a number below so a future toggle cannot
// quietly raise it.
//
// PRESS / REPRESS ARE NOT HERE. A press is a live in-round write and the right home
// is a root node like dots and kpWinners, because an instance-nested press is
// CLOBBERED by an organizer re-save (captureSkinsInstances writes back the clone
// loadSkinsInstances held). That needs a database.rules.json row and is its own wave.
describe('10. THE OPTIONS: EVERY COMBINATION KEEPS THE INVARIANT', () => {
    const TOGGLES = ['blitz', 'blitzBirdie', 'birdiesDouble', 'parThreesDouble'];
    const subsets = () => {
        const out = [];
        for (let m = 0; m < 16; m++) {
            const cfg = {};
            TOGGLES.forEach((t, i) => { if (m & (1 << i)) cfg[t] = true; });
            out.push(cfg);
        }
        return out;
    };

    test('every hole, every toggle combination, sums to a multiple of nine', () => {
        // THE INVARIANT THE WHOLE WAGER RESTS ON. Every rule is either a replacement
        // allocation that still sums to 9 (blitz: 9-0-0) or a WHOLE-HOLE multiplier.
        // Nothing adds a fixed number of points - that is the constraint, and this is
        // what holds it.
        let checked = 0;
        const holes = [{ par: 3, hcpIndex: 1 }, { par: 4, hcpIndex: 2 }, { par: 5, hcpIndex: 3 }];
        const netSets = [[4, 5, 6], [4, 4, 5], [4, 5, 5], [5, 5, 5], [3, 5, 6], [2, 5, 6], [3, 3, 6]];
        subsets().forEach(cfg => holes.forEach(h => netSets.forEach(nets => {
            // gross == net here except where a birdie is wanted; both are passed so the
            // helper never has to guess which it is looking at.
            const pts = E.ninePointsForHoleWithOptions(nets, nets, h, cfg);
            assert.ok(pts, 'no points for ' + JSON.stringify([nets, h.par, cfg]));
            assert.equal(pts.length, 3);
            const sum = pts.reduce((a, b) => a + b, 0);
            assert.equal(sum % 9, 0, 'sum ' + sum + ' is not a multiple of 9 for '
                + JSON.stringify({ nets, par: h.par, cfg }));
            pts.forEach(v => assert.ok(Number.isInteger(v),
                'a share is not an integer: ' + pts.join('/') + ' for ' + JSON.stringify(cfg)));
            checked++;
        })));
        assert.equal(checked, 16 * 3 * 7, 'the matrix did not run: ' + checked);
    });

    test('THE CEILING: 36 reachable in this wave, 72 by design with the press', () => {
        // BOTH NUMBERS PINNED, and the distinction is not pedantry. Manny set the
        // design ceiling at 72: base 9, x2 blitz+birdie, x2 par 3, x2 PRESS. The press
        // is not in this wave, so the most a hole can actually be worth today is 36.
        // Asserting 72 would have pinned a number no code path can produce - a guard
        // that passes only because it is never reached. My first version did exactly
        // that.
        const DESIGN_CEILING = 72;      // with the press, when it ships
        const PRESS_MULTIPLIER = 2;     // the slot reserved for it
        let worst = 0;
        subsets().forEach(cfg => [3, 4, 5].forEach(par => {
            // a two-stroke win WITH a gross birdie - the most any hole can be worth
            const pts = E.ninePointsForHoleWithOptions([2, 5, 6], [2, 5, 6], { par, hcpIndex: 1 }, cfg);
            worst = Math.max(worst, pts.reduce((a, b) => a + b, 0));
        }));
        assert.equal(worst, 36, 'the reachable per-hole ceiling moved to ' + worst);
        assert.equal(worst * PRESS_MULTIPLIER, DESIGN_CEILING,
            'the reachable ceiling no longer doubles to the design ceiling, so either a '
            + 'toggle was added or the press slot changed - say which');
    });

    test('BLITZ+BIRDIE SUPPRESSES BIRDIES DOUBLE - one birdie, one doubling', () => {
        const h = { par: 4, hcpIndex: 1 };
        const blitzBirdie = [2, 5, 6];   // wins by 3 and is 2 under par
        const both = E.ninePointsForHoleWithOptions(blitzBirdie, blitzBirdie, h,
            { blitz: true, blitzBirdie: true, birdiesDouble: true });
        const justBlitzBirdie = E.ninePointsForHoleWithOptions(blitzBirdie, blitzBirdie, h,
            { blitz: true, blitzBirdie: true });
        assert.deepEqual(both, justBlitzBirdie,
            'birdies-double stacked on top of blitz+birdie: ' + both.join('/'));
        assert.equal(both.reduce((a, b) => a + b, 0), 18, 'blitz+birdie is 18-0-0');
        assert.deepEqual(both, [18, 0, 0]);
    });

    test('BLITZ is NET and BIRDIE is GROSS, proved where the two answers DIFFER', () => {
        // The fixture that makes this real: gross 5/4/6 - the first golfer does NOT
        // win on gross - and net 3/4/6, where he wins by one... so no blitz. Then net
        // 2/4/6, a two-stroke net win, on a par 4 where his GROSS 5 is not a birdie.
        const h = { par: 4, hcpIndex: 1 };
        const blitzOnNetOnly = E.ninePointsForHoleWithOptions([2, 4, 6], [5, 4, 6], h, { blitz: true });
        assert.deepEqual(blitzOnNetOnly, [9, 0, 0], 'a NET two-stroke win must blitz');
        // ...and it is NOT a birdie, because gross 5 on a par 4 is a bogey.
        const notABirdie = E.ninePointsForHoleWithOptions([2, 4, 6], [5, 4, 6], h,
            { blitz: true, blitzBirdie: true });
        assert.deepEqual(notABirdie, [9, 0, 0],
            'a NET birdie was counted as a birdie: ' + notABirdie.join('/'));
        // The mirror: a gross birdie that does NOT win by two nets no blitz, but does
        // double the hole under birdiesDouble.
        const grossBirdieNoBlitz = E.ninePointsForHoleWithOptions([3, 4, 5], [3, 4, 5], h,
            { birdiesDouble: true });
        assert.deepEqual(grossBirdieNoBlitz, [10, 6, 2], 'a gross birdie must double the hole');
    });

    test('BIRDIES DOUBLE reads GROSS - a NET birdie does not double the hole', () => {
        // WRITTEN BECAUSE A CONTROL WAS INERT. J6 switched birdiesDouble from gross to
        // net and every test stayed green, because every fixture above had nets equal to
        // gross - so the two answers could not differ and the assertion proved nothing
        // about which list was read. This is the fixture where they DO differ.
        const h = { par: 4, hcpIndex: 1 };
        const nets = [3, 4, 5];     // the first golfer's NET is one under par
        const gross = [4, 4, 5];    // ...but he actually made par with the ball
        assert.deepEqual(
            E.ninePointsForHoleWithOptions(nets, gross, h, { birdiesDouble: true }),
            [5, 3, 1],
            'a NET birdie doubled the hole - a stroke is not a birdie');
        // And the same hole WITH a real gross birdie does double, so the assertion above
        // is about the scoring basis and not about doubling being broken.
        assert.deepEqual(
            E.ninePointsForHoleWithOptions(nets, [3, 4, 5], h, { birdiesDouble: true }),
            [10, 6, 2],
            'a gross birdie must still double the hole');
    });

    test('PAR 3s DOUBLE, and only par 3s', () => {
        const nets = [4, 5, 6];
        assert.deepEqual(E.ninePointsForHoleWithOptions(nets, nets, { par: 3, hcpIndex: 1 },
            { parThreesDouble: true }), [10, 6, 2]);
        assert.deepEqual(E.ninePointsForHoleWithOptions(nets, nets, { par: 4, hcpIndex: 1 },
            { parThreesDouble: true }), [5, 3, 1]);
        assert.deepEqual(E.ninePointsForHoleWithOptions(nets, nets, { par: 5, hcpIndex: 1 },
            { parThreesDouble: true }), [5, 3, 1]);
    });
});

// ---------------------------------------------------------------------------
describe('11. ALL TOGGLES OFF IS BYTE-IDENTICAL TO WAVE 11', () => {
    // THE GUARD THAT MUST NOT BE SKIPPED. Everything above adds paths through the
    // same function; this is the one that proves a round with no options set settles
    // to exactly the numbers it did before the options existed.
    test('the plain tie table is unchanged by the new code path', () => {
        [[4, 5, 6], [4, 4, 5], [4, 5, 5], [5, 5, 5], [3, 4, 4], [2, 2, 2]].forEach(nets => {
            assert.deepEqual(E.ninePointsForHoleWithOptions(nets, nets, { par: 4, hcpIndex: 1 }, {}),
                E.ninePointsForHole(nets),
                'the no-options path diverged from the Wave 11 table on ' + nets.join('/'));
        });
    });

    test('a round with no options settles to the Wave 11 numbers, to the cent', () => {
        const d = ninesRound({ rate: 0.5, score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        // The exact figures test 4 pins, restated here so a regression shows up in the
        // guard that is ABOUT regression rather than only in the original.
        assert.equal(net['101'], 18);
        assert.equal(net['102'], 0);
        assert.equal(net['103'], -18);
    });

    test('and an instance carrying options:{} is the same as one carrying none', () => {
        const plain = ninesRound({ rate: 0.5, score: (p) => 3 + (p.id % 3) });
        const empty = ninesRound({ rate: 0.5, score: (p) => 3 + (p.id % 3), cfg: { options: {} } });
        assert.deepEqual(
            JSON.parse(JSON.stringify(E.computeGameNetByPlayerId(gameOf(plain), CD, plain.scores))),
            JSON.parse(JSON.stringify(E.computeGameNetByPlayerId(gameOf(empty), CD, empty.scores))));
    });
});

// ---------------------------------------------------------------------------
describe('12. THE POT: WINNER TAKES IT, AND IT STILL SUMS TO ZERO', () => {
    const potRound = (opts) => ninesRound(Object.assign({
        cfg: { settlement: 'pot', ninePointsBuyIn: 5 }
    }, opts || {}));

    test('an outright winner takes the pot: +2B / -B / -B', () => {
        const d = potRound({ score: (p) => (p.id === 101 ? 3 : (p.id === 102 ? 4 : 5)) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        assert.equal(net['101'], 10);
        assert.equal(net['102'], -5);
        assert.equal(net['103'], -5);
        assert.equal(net['101'] + net['102'] + net['103'], 0);
    });

    test('two tie for most: they split the pot', () => {
        // 101 and 102 both beat 103 on every hole and tie each other: 4-4-1 x 18.
        const d = potRound({ score: (p) => (p.id === 103 ? 6 : 4) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        assert.equal(net['101'], 2.5);
        assert.equal(net['102'], 2.5);
        assert.equal(net['103'], -5);
        assert.equal(net['101'] + net['102'] + net['103'], 0);
    });

    test('all three tie: everybody gets their buy-in back', () => {
        const d = potRound({ score: () => 4 });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        [101, 102, 103].forEach(id => assert.equal(net[String(id)], 0));
    });

    test('the POINTS still rank, so the toggles CHANGE who takes the pot', () => {
        // THE FIXTURE THAT ACTUALLY SHOWS IT, and my first one did not - it had the
        // same golfer winning either way, which proves nothing about the toggles.
        // Here: Marty is one shot better than the other two on all fourteen
        // non-par-3 holes, and Lance takes every par 3 by two with a gross birdie.
        //   toggles OFF  Marty 78, Manny 36, Lance 48   -> Marty takes the pot
        //   toggles ON   Marty 70, Manny 28, Lance 172  -> Lance takes it
        // Same scores, same buy-in, different winner. That is the claim.
        const players = THREE;
        const scoreFor = (p, h) => (h.par === 3)
            ? (p.id === 103 ? h.par - 2 : h.par + 1)
            : (p.id === 101 ? 4 : 5);
        const build = (options) => {
            const scores = {};
            players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = scoreFor(p, h); }));
            return { code: 'POT2', gameFormat: 'stroke', players, courseData: CD, scores,
                additionalGameInstances: { g1: Object.assign({
                    format: 'nines', enabled: true, participantIds: ['101', '102', '103'],
                    settlement: 'pot', ninePointsBuyIn: 5, startHole: 1 }, options) } };
        };
        const off = build({});
        const on = build({ options: { blitz: true, blitzBirdie: true, parThreesDouble: true } });
        const netOff = E.computeGameNetByPlayerId(gameOf(off), CD, off.scores);
        const netOn = E.computeGameNetByPlayerId(gameOf(on), CD, on.scores);
        // POSITIVE: both are real pots that sum to zero.
        [netOff, netOn].forEach(n => assert.equal(
            n['101'] + n['102'] + n['103'], 0, 'the pot did not sum to zero'));
        assert.equal(netOff['101'], 10, 'with the toggles off Marty must take it: ' + JSON.stringify(netOff));
        assert.equal(netOn['103'], 10, 'with the toggles on Lance must take it: ' + JSON.stringify(netOn));
        assert.equal(netOn['101'], -5, 'Marty must now be paying in: ' + JSON.stringify(netOn));
    });

    test('no buy-in, no money', () => {
        const d = potRound({ cfg: { settlement: 'pot', ninePointsBuyIn: 0 },
                             score: (p) => 3 + (p.id % 3) });
        const net = E.computeGameNetByPlayerId(gameOf(d), CD, d.scores);
        Object.keys(net).forEach(k => assert.equal(net[k], 0));
    });
});
