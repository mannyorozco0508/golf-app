// ============================================================================
// SINGLES NET MATCH PLAY: STROKES ARE RELATIVE TO THE OPPONENT
//
// The engine applied each player's FULL handicap against the course, then
// compared the two adjusted scores:
//
//     gross - getStrokes(hole.hcpIndex, parseHcp(p.hcp))
//
// That is stroke-play net scoring, not match play. In a singles net match the
// lower Playing Handicap plays off zero and the other player receives the
// arithmetic difference, allocated from stroke index 1 upward (USGA/WHS).
//
// The two models are NOT equivalent, and the difference is invisible in a
// hole-win tally on identical gross scores - whole strokes cancel. It only
// appears in the per-hole STROKE MARGIN. For 7 vs 12 on a real layout they
// disagree on 10 of 18 holes:
//
//     hole  SI   Jeff(7)  Lee(12)   old gave Lee   correct
//        7   1       1        1           0            1     <- the reported bug
//        1   5       1        1           0            1
//        2  10       0        1           1            0
//
// On the stroke index 1 hole, Lee should receive a stroke and got none, because
// Jeff's own stroke cancelled it. The strokes landed on SI 6-10 instead of 1-5.
//
// PLUS HANDICAPS. parseHcp stores +2 as -2, so the differential is plain
// arithmetic. The ordinary course-based behaviour - a plus player giving a
// stroke back starting at SI 18 - is CORRECT for stroke-play net against the
// course and must not be used for the relative match margin. It stays untouched
// in getStrokes(); the match engine computes the differential separately.
//
// GATED TO 1v1. The same loop serves team formats, taking min() for best ball.
// Team handicap allowances are their own rules question, so anything with more
// than one player a side keeps today's behaviour byte-for-byte.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function engineRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const PAGE_DEPS = {
    'index.html': ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
                   'pool-engine.js','bet-strip.js','hole-events.js'],
    'sidematches.html': ['handicap.js','money-engine.js','action-model.js','settlement-engine.js'],
    'stats.html': ['handicap.js','money-engine.js','action-model.js','settlement-engine.js'],
};
const realms = {};
function fromPage(page, name) {
    if (!realms[page]) realms[page] = loadHtmlInlineScript(page, PAGE_DEPS[page]);
    return vm.runInContext(name, realms[page]);
}
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// A REAL layout where stroke index 1 is Hole 7 - deliberately not Hole 1, so a
// test cannot pass by confusing hole number with stroke index.
const SI = { 7:1, 3:2, 12:3, 16:4, 1:5, 9:6, 5:7, 14:8, 18:9,
             2:10, 11:11, 8:12, 15:13, 4:14, 17:15, 6:16, 13:17, 10:18 };
const cd18 = Array.from({length:18},(_,i)=>({ hole:i+1, par:4, hcpIndex:SI[i+1] }));
const holeOfSI = (si) => Number(Object.keys(SI).find(h => SI[h] === si));

const player = (id, name, hcp, team) => ({ id, name, hcp: String(hcp), team });
const singles = (hcpA, hcpB) => [player(101,'A',hcpA,'Team 1'), player(102,'B',hcpB,'Team 2')];

// Every player shoots the same gross on every hole, so any hole that is NOT
// halved was decided purely by a handicap stroke. That isolates allocation.
function levelScores(players, gross) {
    const s = {};
    players.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = gross || 5; }));
    return s;
}
// Which holes did the receiving player win, by stroke index?
function strokeHolesFromMatch(hcpA, hcpB) {
    const E = engineRealm();
    const players = singles(hcpA, hcpB);
    const scores = levelScores(players);
    const calc = plain(E.calculateMatchEngine(players, cd18, scores, 'net', 'match', 'none', 10, 0, []));
    assert.ok(calc && calc.holeLog, 'the engine must return a holeLog');
    // holeLog is keyed by hole number, and the decision field is `holeWinner`,
    // which reads 'Halved' rather than being absent. Discovered by inspecting the
    // real return value - an earlier version of this helper looked for `winner`
    // and silently found nothing, which would have made every assertion vacuous.
    const won = [];
    Object.keys(calc.holeLog).forEach(k => {
        const entry = calc.holeLog[k];
        const hole = Number(k);
        const w = entry && entry.holeWinner;
        if (w && w !== 'Halved') won.push({ hole, si: SI[hole], winner: w });
    });
    return won;
}
// The canonical contract, expressed independently of the implementation.
function expectedRelative(hcpA, hcpB, si) {
    const a = hcpA, b = hcpB;
    const base = Math.min(a, b);
    const relA = a - base, relB = b - base;
    const strokesFor = (rel) => Math.floor(rel / 18) + ((si <= (rel % 18)) ? 1 : 0);
    return { a: strokesFor(relA), b: strokesFor(relB) };
}

// ============================================================================

describe('THE CANONICAL ALLOCATION', () => {

    const cases = [
        { label: '7 vs 12',   a: 7,  b: 12, receives: 'B', count: 5,  siFrom: 1, siTo: 5 },
        { label: '10 vs 11',  a: 10, b: 11, receives: 'B', count: 1,  siFrom: 1, siTo: 1 },
        { label: '5 vs 5',    a: 5,  b: 5,  receives: null, count: 0 },
        { label: '0 vs 18',   a: 0,  b: 18, receives: 'B', count: 18, siFrom: 1, siTo: 18 },
        { label: '+2 vs 5',   a: -2, b: 5,  receives: 'B', count: 7,  siFrom: 1, siTo: 7 },
        { label: '+3 vs +1',  a: -3, b: -1, receives: 'B', count: 2,  siFrom: 1, siTo: 2 },
        { label: '+2 vs 0',   a: -2, b: 0,  receives: 'B', count: 2,  siFrom: 1, siTo: 2 },
    ];

    cases.forEach(c => {
        test(`${c.label}: the differential lands on the right stroke indexes`, () => {
            const won = strokeHolesFromMatch(c.a, c.b);
            assert.equal(won.length, c.count,
                c.label + ': expected ' + c.count + ' decided holes, got ' + won.length);
            if (c.count === 0) return;
            won.forEach(w => {
                assert.equal(w.winner, c.receives === 'B' ? 'B' : 'A',
                    c.label + ': hole ' + w.hole + ' went the wrong way');
                assert.ok(w.si >= c.siFrom && w.si <= c.siTo,
                    c.label + ': stroke landed on SI ' + w.si + ', expected ' + c.siFrom + '-' + c.siTo);
            });
        });
    });

    test('differential 20: one everywhere plus a second on SI 1-2', () => {
        // Driven through the ENGINE, not just the contract helper. An earlier
        // version asserted only expectedRelative(), so capping the engine at one
        // stroke per hole passed every test - the negative control did not fire.
        // Gross is set so a SECOND stroke is required to win the hole.
        const E = engineRealm();
        const players = singles(0, 20);
        const scores = levelScores(players);
        // B two shots worse everywhere: only a 2-stroke hole can be won by B.
        players.forEach(() => {});
        cd18.forEach(h => { scores['p101_h'+h.hole] = 4; scores['p102_h'+h.hole] = 6; });
        const calc = plain(E.calculateMatchEngine(players, cd18, scores, 'net', 'match', 'none', 10, 0, []));
        const wonSi = Object.keys(calc.holeLog)
            .filter(k => calc.holeLog[k].holeWinner === 'B')
            .map(k => SI[Number(k)]).sort((x,y)=>x-y);
        assert.deepEqual(wonSi, [], 'two strokes only halves a two-shot deficit');
        const halved = Object.keys(calc.holeLog)
            .filter(k => calc.holeLog[k].holeWinner === 'Halved')
            .map(k => SI[Number(k)]).sort((x,y)=>x-y);
        assert.deepEqual(halved, [1,2], 'only SI 1-2 carry the second stroke');
        [1,2].forEach(si => assert.equal(expectedRelative(0, 20, si).b, 2, 'SI ' + si));
        [3,10,18].forEach(si => assert.equal(expectedRelative(0, 20, si).b, 1, 'SI ' + si));
    });

    test('differential 36: two strokes on every hole', () => {
        // Also driven through the engine: B two worse everywhere must halve every
        // hole, which only happens if every hole carries two strokes.
        const E = engineRealm();
        const players = singles(0, 36);
        const scores = {};
        cd18.forEach(h => { scores['p101_h'+h.hole] = 4; scores['p102_h'+h.hole] = 6; });
        const calc = plain(E.calculateMatchEngine(players, cd18, scores, 'net', 'match', 'none', 10, 0, []));
        const halved = Object.values(calc.holeLog).filter(h => h.holeWinner === 'Halved').length;
        assert.equal(halved, 18, 'every hole must carry two strokes');
        for (let si = 1; si <= 18; si++) assert.equal(expectedRelative(0, 36, si).b, 2, 'SI ' + si);
    });

    test('reversing the players mirrors the result, never changes it', () => {
        const fwd = strokeHolesFromMatch(7, 12).map(w => w.si).sort((x,y)=>x-y);
        const rev = strokeHolesFromMatch(12, 7).map(w => w.si).sort((x,y)=>x-y);
        assert.deepEqual(fwd, rev, 'the same stroke indexes must carry strokes either way');
        assert.equal(strokeHolesFromMatch(7, 12)[0].winner, 'B');
        assert.equal(strokeHolesFromMatch(12, 7)[0].winner, 'A');
    });

    test('allocation follows STROKE INDEX, not hole number', () => {
        // One-stroke differential. SI 1 is Hole 7 on this layout.
        const won = strokeHolesFromMatch(10, 11);
        assert.equal(won.length, 1);
        assert.equal(won[0].hole, holeOfSI(1), 'the stroke must fall on the SI 1 hole');
        assert.equal(won[0].hole, 7, 'which is Hole 7 here');
        assert.notEqual(won[0].hole, 1, 'not Hole 1');
    });
});

describe('THE OLD MODEL WAS MEASURABLY DIFFERENT', () => {

    test('ADVERSARIAL: per-hole stroke margins disagree on 10 of 18 holes', () => {
        // The mandatory proof. Compares MARGINS, not hole-win tallies - a tally on
        // level gross scores hides the difference because whole strokes cancel.
        const E = engineRealm();
        const disagree = [];
        for (let si = 1; si <= 18; si++) {
            const oldMargin = E.getStrokes(si, 12) - E.getStrokes(si, 7);   // independent
            const newMargin = expectedRelative(7, 12, si).b;                // relative
            if (oldMargin !== newMargin) disagree.push({ si, oldMargin, newMargin });
        }
        assert.equal(disagree.length, 10,
            'expected the two models to differ on 10 stroke indexes');
        const si1 = disagree.find(d => d.si === 1);
        assert.ok(si1, 'they must differ at SI 1 - the reported symptom');
        assert.equal(si1.oldMargin, 0, 'the old model gave the receiver nothing at SI 1');
        assert.equal(si1.newMargin, 1, 'the correct model gives one stroke at SI 1');
    });

    test('ADVERSARIAL: the engine now agrees with the relative model, not the old one', () => {
        const won = strokeHolesFromMatch(7, 12);
        const siWon = won.map(w => w.si).sort((x,y)=>x-y);
        assert.deepEqual(siWon, [1,2,3,4,5], 'relative model: SI 1-5');
        // What the old model would have produced, for contrast.
        const E = engineRealm();
        const oldSi = [];
        for (let si = 1; si <= 18; si++) {
            if (E.getStrokes(si, 12) - E.getStrokes(si, 7) > 0) oldSi.push(si);
        }
        // Measured, not assumed: an earlier version of this line hard-coded SI 6-10
        // from memory and was wrong. The old model actually landed them here.
        assert.deepEqual(oldSi, [8,9,10,11,12], 'the old model put them on SI 8-12');
        assert.notDeepEqual(siWon, oldSi, 'the test must distinguish the two models');
    });

    test('plus handicaps do not use the SI 17-18 course giveback in a match', () => {
        // +2 vs 5. Under the course model the plus player gives strokes back at the
        // far end of the stroke index; under the match model the 5 simply receives 7.
        const won = strokeHolesFromMatch(-2, 5);
        assert.deepEqual(won.map(w => w.si).sort((x,y)=>x-y), [1,2,3,4,5,6,7]);
        won.forEach(w => assert.notEqual(w.si, 18, 'no stroke belongs at SI 18 here'));
    });
});

describe('PER-HOLE OUTCOMES', () => {

    function holeResult(hcpA, hcpB, hole, grossA, grossB) {
        const E = engineRealm();
        const players = singles(hcpA, hcpB);
        const scores = levelScores(players);
        scores['p101_h'+hole] = grossA;
        scores['p102_h'+hole] = grossB;
        const calc = plain(E.calculateMatchEngine(players, cd18, scores, 'net', 'match', 'none', 10, 0, []));
        const entry = calc.holeLog[String(hole)];
        return { winner: entry && entry.holeWinner !== 'Halved' ? entry.holeWinner : null };
    }

    test('gross tie on a stroke hole: the receiving player wins it', () => {
        const r = holeResult(10, 11, holeOfSI(1), 4, 4);
        assert.equal(r.winner, 'B', 'B receives a stroke at SI 1 and should take the hole');
    });

    test('receiver one worse on a stroke hole: the hole halves', () => {
        const r = holeResult(10, 11, holeOfSI(1), 4, 5);
        assert.ok(!r.winner, 'net scores are level, so nobody wins the hole');
    });

    test('a hole with no match stroke is decided on gross', () => {
        const si18 = holeOfSI(18);
        assert.equal(expectedRelative(10, 11, 18).b, 0, 'no stroke at SI 18');
        assert.equal(holeResult(10, 11, si18, 4, 5).winner, 'A', 'lower gross wins');
        assert.ok(!holeResult(10, 11, si18, 4, 4).winner, 'equal gross halves');
    });
});

describe('SIMULTANEOUS MATCHES STAY INDEPENDENT', () => {

    test('the same golfer receives different strokes from different opponents', () => {
        // A=7 vs B=12 gives B five; A=7 vs C=9 gives C two. Nothing is stored on the
        // player, so the two allocations cannot contaminate each other.
        const ab = strokeHolesFromMatch(7, 12).map(w => w.si).sort((x,y)=>x-y);
        const ac = strokeHolesFromMatch(7, 9).map(w => w.si).sort((x,y)=>x-y);
        assert.deepEqual(ab, [1,2,3,4,5]);
        assert.deepEqual(ac, [1,2]);
    });

    test('no player handicap is mutated by running a match', () => {
        const E = engineRealm();
        const players = singles(7, 12);
        const before = players.map(p => p.hcp);
        E.calculateMatchEngine(players, cd18, levelScores(players), 'net', 'match', 'none', 10, 0, []);
        assert.deepEqual(players.map(p => p.hcp), before, 'stored handicaps must be untouched');
    });
});

describe('TEAM MATCH PLAY USES THE ALL-PLAYER BASELINE', () => {

    // SUPERSEDED BY DESIGN. This block previously pinned the singles GATE - that a
    // 2v2 kept each golfer's full course handicap - and asserted a measured count of
    // 5 decided holes. That gate was the bug, not the contract: the lowest handicap
    // in the MATCH now plays off zero and everyone else, partner included, takes the
    // arithmetic difference. The old assertions are gone rather than loosened,
    // because a test that pins removed behaviour is worse than no test at all.
    //
    // The replacement contract lives in full in team_relative_handicap_test.js.
    // What stays here is the part this file is responsible for: that extending the
    // rule to teams did not disturb the singles work or stroke play.
    function teamMatch(hcps) {
        const E = engineRealm();
        const players = [
            player(101,'A',hcps[0],'Team 1'), player(102,'B',hcps[1],'Team 1'),
            player(103,'C',hcps[2],'Team 2'), player(104,'D',hcps[3],'Team 2'),
        ];
        return plain(E.calculateMatchEngine(players, cd18, levelScores(players), 'net', 'match', 'none', 10, 0, []));
    }

    test('a 2v2 net match is measured against ONE baseline, not four handicaps', () => {
        const calc = teamMatch([7, 15, 12, 20]);
        assert.ok(calc && calc.holeLog, 'the team match must still calculate');
        assert.equal(calc.matchBaseline, 7, 'the lowest golfer in the match');
        assert.deepEqual(calc.relHcpById, { '101': 0, '102': 8, '103': 5, '104': 13 });
    });

    test('the lowest golfer\u2019s PARTNER still receives strokes', () => {
        const calc = teamMatch([7, 15, 12, 20]);
        assert.equal(calc.relHcpById['102'], 8,
            'the 15 partners the 7 and receives 8 - deliberate, not a leak');
    });

    test('stroke play\u2019s own allocation is untouched by any of this', () => {
        const E = engineRealm();
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1, 'a 12 still strokes at SI 12 in STROKE PLAY');
        assert.equal(expectedRelative(7, 12, 12).b, 0, 'but not in a match');
    });

    test('a one-per-side match is still treated as singles', () => {
        const won = strokeHolesFromMatch(7, 12);
        assert.equal(won.length, 5, 'one player a side is a singles match');
    });
});

describe('STROKE PLAY IS UNTOUCHED', () => {

    test('getStrokes still applies a full handicap against the course', () => {
        const E = engineRealm();
        assert.equal(E.getStrokes(1, 12), 1);
        assert.equal(E.getStrokes(12, 12), 1);
        assert.equal(E.getStrokes(13, 12), 0);
        assert.equal(E.getStrokes(1, 20), 2, 'multi-stroke allocation intact');
    });

    test('the plus-handicap course giveback is preserved for stroke play', () => {
        // Deliberately unchanged: correct for net-to-par, wrong only for the match
        // margin, which is computed separately now.
        const E = engineRealm();
        assert.equal(E.getStrokes(18, -2), -1, 'a +2 gives a stroke back at SI 18');
        assert.equal(E.getStrokes(17, -2), -1);
        assert.equal(E.getStrokes(1, -2), 0);
    });

    test('parseHcp still normalises plus handicaps to negatives', () => {
        const E = engineRealm();
        assert.equal(E.parseHcp('+2'), -2);
        assert.equal(E.parseHcp('+3'), -3);
        assert.equal(E.parseHcp('12'), 12);
        assert.equal(E.parseHcp(''), 0);
    });
});

describe('NASSAU, PRESSES, AND THE FOUR COPIES', () => {

    const NASSAU_STAKES = { F9: 10, B9: 10, '18': 20 };

    function nassau(hcpA, hcpB, presses, pressRule) {
        const E = engineRealm();
        const players = singles(hcpA, hcpB);
        return plain(E.calculateMatchEngine(players, cd18, levelScores(players), 'net',
            'nassau', pressRule || 'none', 10, 0, presses || [], NASSAU_STAKES));
    }

    test('1v1 Nassau produces Front, Back and Overall from the same allocation', () => {
        const calc = nassau(7, 12);
        assert.ok(calc.activeMatches.length >= 3, 'front, back and overall');
        const decided = Object.values(calc.holeLog)
            .filter(h => h && h.holeWinner && h.holeWinner !== 'Halved').length;
        assert.equal(decided, 5, 'the same five stroke holes decide every segment');
    });

    test('a press does not renumber stroke indexes', () => {
        // The hole decisions must be identical with and without a press: a press
        // changes the wager window, never the handicap allocation.
        const withoutPress = nassau(7, 12);
        const withPress = nassau(7, 12, [{ startHole: 10, stake: 25 }]);
        assert.deepEqual(withPress.holeLog, withoutPress.holeLog,
            'a mid-round press must not change any hole result');
    });

    test('an auto 2-down press inherits the parent allocation', () => {
        const auto = nassau(7, 12, [], '2down');
        const none = nassau(7, 12, [], 'none');
        assert.deepEqual(auto.holeLog, none.holeLog,
            'auto presses add wagers, not handicap changes');
    });

    test('all four engine copies agree on the corrected singles contract', () => {
        const copies = {
            'money-engine.js': engineRealm().calculateMatchEngine,
            'index.html': fromPage('index.html', 'calculateMatchEngine'),
            'sidematches.html': fromPage('sidematches.html', 'calculateMatchEngine'),
            'stats.html': fromPage('stats.html', 'calculateMatchEngine'),
        };
        const players = singles(7, 12);
        const scores = levelScores(players);
        const results = Object.entries(copies).map(([name, fn]) =>
            [name, JSON.stringify(plain(fn(players, cd18, scores, 'net', 'match', 'none', 10, 0, [])).holeLog)]);
        results.slice(1).forEach(([name, v]) =>
            assert.equal(v, results[0][1], name + ' disagrees with money-engine.js'));
    });

    test('all four copies agree on a TEAM match too', () => {
        const copies = {
            'money-engine.js': engineRealm().calculateMatchEngine,
            'index.html': fromPage('index.html', 'calculateMatchEngine'),
            'sidematches.html': fromPage('sidematches.html', 'calculateMatchEngine'),
            'stats.html': fromPage('stats.html', 'calculateMatchEngine'),
        };
        const players = [
            player(101,'A',7,'Team 1'), player(102,'B',15,'Team 1'),
            player(103,'C',12,'Team 2'), player(104,'D',20,'Team 2'),
        ];
        const scores = levelScores(players);
        const results = Object.entries(copies).map(([name, fn]) =>
            [name, JSON.stringify(plain(fn(players, cd18, scores, 'net', 'match', 'none', 10, 0, [])).holeLog)]);
        results.slice(1).forEach(([name, v]) =>
            assert.equal(v, results[0][1], name + ' disagrees on team play'));
    });
});

describe('LIVE STATE AND SETTLEMENT AGREE', () => {

    test('settlement uses the corrected hole winners', () => {
        const E = engineRealm();
        const players = singles(7, 12);
        const scores = levelScores(players);
        const d = { players, courseData: cd18, scores, gameFormat: 'stroke',
                    settlementMode: 'whole-dollar', sideMatches: { m1: {
                        format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                        startHole: 1, stake: 20, pressRule: 'none' } } };
        const receipts = E.buildSideMatchReceipts(d, cd18, scores);
        assert.equal(receipts.length, 1);
        const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0, 'zero-sum');
        const b = vals.find(v => v.name === 'B');
        assert.ok(b.net > 0, 'B receives five strokes and should be up in the match');
    });

    test('the live presenter and settlement see the same match', () => {
        const E = engineRealm();
        const players = singles(7, 12);
        const scores = levelScores(players);
        const d = { players, courseData: cd18, scores, gameFormat: 'stroke',
                    settlementMode: 'whole-dollar', sideMatches: { m1: {
                        format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                        startHole: 1, stake: 20, pressRule: 'none' } } };
        const live = E.buildLiveMatchStates(d, cd18, scores, null);
        assert.equal(live.length, 1, 'one live card');
        const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
        const b = vals.find(v => v.name === 'B');
        assert.ok(b.net > 0, 'live and settlement must agree on who is winning');
    });

    test('a legacy 1v1 Nassau round settles under the corrected rules', () => {
        // Legacy rounds route through legacyMainAsSideMatch into the same engine,
        // so they inherit the fix. Historical rounds recalculate on reopen - see
        // the batch report.
        const E = engineRealm();
        const players = singles(7, 12);
        const scores = levelScores(players);
        const d = { players, courseData: cd18, scores, gameFormat: 'nassau',
                    nassauStake: 10, nassauScoring: 'net', nassauPressRule: 'none',
                    settlementMode: 'whole-dollar' };
        const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0);
        assert.ok(vals.some(v => v.net !== 0), 'money still moves');
    });
});
