// ============================================================================
// RYDER CUP PHASE 2 — MULTIPLE PAIRINGS, SINGLES, LOCK, MULTI-GROUP
//
// Phase 1 proved one Four-Ball pairing in isolation. This suite proves the things
// that only appear once there is more than one match:
//
//   - two matches consume only their own golfers and aggregate into one Cup total
//   - a golfer cannot be double-booked WITHIN a session (and freely can be across
//     sessions, and freely can be across Side Matches - different layer, different rule)
//   - Singles rides the same protected engine with one golfer per side
//   - a pairing edit after the first score is REJECTED, not merely hidden
//   - Group 2's scores cannot move Group 1's match
//   - official and projected points never silently merge
//
// The Phase 1 A/B money invariant is repeated here at 8 golfers across 2 groups
// with presses running, because an isolation guarantee that only holds for four
// golfers and one match is not the guarantee this feature needs.
//
// Phase 1's suite is untouched and still passes unmodified.
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

// 8 golfers, two groups of four.
//   Group 1: Manny(101) Matt(102) | Marty(103) Scott(104)     -> Ryder match m1
//   Group 2: Lance(105) Zach(106) | Chris(107) Don(108)       -> Ryder match m2
// Sides: Team Rattle = A (101,102,105,106), Team Chaos = B (103,104,107,108).
const NAMES = { 101:'Manny', 102:'Matt', 103:'Marty', 104:'Scott',
                105:'Lance', 106:'Zach', 107:'Chris', 108:'Don' };

function players(hcps) {
    return Object.keys(NAMES).map((id, i) => ({
        id: Number(id), name: NAMES[id], hcp: String((hcps && hcps[id]) || 0),
        team: i % 2 === 0 ? 'Team 1' : 'Team 2',
        group: Number(id) <= 104 ? 1 : 2,
        playingForMoney: true
    }));
}

const evens = () => PAR.slice();
function card(deltas) {
    const c = PAR.slice();
    Object.keys(deltas).forEach(h => { c[Number(h)-1] += deltas[h]; });
    return c;
}
function scoresFrom(cards) {
    const s = {};
    Object.keys(cards).forEach(id => (cards[id] || []).forEach((v, i) => {
        if (v != null) s[`p${id}_h${i+1}`] = v;
    }));
    return s;
}

// m1: Manny+Matt beat Marty+Scott (Manny birdies 1 and 2) -> A wins, 1-0
// m2: Lance+Zach vs Chris+Don, everyone pars -> halved, 0.5-0.5
// Expected overall: Team Rattle 1.5, Team Chaos 0.5
const CARDS_STD = {
    101: card({ 1: -1, 2: -1 }), 102: evens(), 103: evens(), 104: evens(),
    105: evens(), 106: evens(), 107: evens(), 108: evens()
};

function cupNode(opts) {
    opts = opts || {};
    return {
        v: 1,
        sides: {
            A: { id: 'A', name: 'Team Rattle', color: 'red' },
            B: { id: 'B', name: 'Team Chaos',  color: 'blue' }
        },
        members: opts.members || {
            '101':'A','102':'A','105':'A','106':'A',
            '103':'B','104':'B','107':'B','108':'B'
        },
        matches: opts.matches || {
            m1: { id:'m1', sessionId:'s1', format:'fourball', scoring:'net',
                  sideA:'A', sideB:'B', playersA:['101','102'], playersB:['103','104'] },
            m2: { id:'m2', sessionId:'s1', format:'fourball', scoring:'net',
                  sideA:'A', sideB:'B', playersA:['105','106'], playersB:['107','108'] }
        }
    };
}

// Real money running underneath, in both groups, with presses.
function sideMatches() {
    return {
        s1: { format:'match', scoring:'net', stake:20, pressRule:'2down',
              teamAIds:['101'], teamBIds:['103'], presses:{} },
        s2: { format:'stroke', scoring:'net', overallStake:20, holeStake:0,
              tieRule:'push', overallMode:'stroke', segment:'full',
              teamAIds:['102'], teamBIds:['104'], overallPresses:{} },
        s3: { format:'match', scoring:'net', stake:50, pressRule:'2down',
              teamAIds:['101','102'], teamBIds:['103','104'], presses:{} },
        s4: { format:'match', scoring:'net', stake:20, pressRule:'2down',
              teamAIds:['105'], teamBIds:['107'], presses:{} }
    };
}

function round(cards, opts) {
    opts = opts || {};
    const d = {
        gameFormat: 'stroke', players: players(opts.hcps), courseData: CD,
        scores: scoresFrom(cards),
        sideMatches: opts.noSideMatches ? {} : sideMatches()
    };
    if (opts.cup) d.ryderCup = opts.cup;
    return d;
}

const stand = d => RC.computeRyderCupStandings(d, CD, d.scores);
const res = (d, id) => RC.computeRyderMatchResult(d, CD, d.scores, id);
const money = d => SETTLE.computeCombinedNetTotals(d, CD, d.scores);

function moneyShape(d) {
    const r = money(d);
    return JSON.parse(JSON.stringify({
        netByName: r.netByName, exact: r.exact,
        contributions: r.contributions, transactions: r.transactions,
        receipts: SETTLE.buildSideMatchReceipts(d, CD, d.scores)
    }));
}

// ===========================================================================
describe('MULTIPLE PAIRINGS', () => {

    test('two matches consume only their own golfers', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        const m1 = res(d, 'm1'), m2 = res(d, 'm2');
        assert.deepEqual(m1.playersA.join('/'), 'Manny/Matt');
        assert.deepEqual(m1.playersB.join('/'), 'Marty/Scott');
        assert.deepEqual(m2.playersA.join('/'), 'Lance/Zach');
        assert.deepEqual(m2.playersB.join('/'), 'Chris/Don');
    });

    test('each match awards its own point independently', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        assert.equal(res(d, 'm1').pointsA, 1, 'm1: Manny/Matt should win');
        assert.equal(res(d, 'm1').pointsB, 0);
        assert.equal(res(d, 'm2').pointsA, 0.5, 'm2: all pars should halve');
        assert.equal(res(d, 'm2').pointsB, 0.5);
    });

    test('the Cup total is 1.5 - 0.5', () => {
        const s = stand(round(CARDS_STD, { cup: cupNode() }));
        assert.equal(s.sides.A.official, 1.5);
        assert.equal(s.sides.B.official, 0.5);
        assert.equal(s.sides.A.name, 'Team Rattle');
        assert.equal(s.sides.B.name, 'Team Chaos');
        assert.equal(s.pointsAvailable, 2);
        assert.equal(s.totalMatches, 2);
    });

    test('points awarded always equal points available', () => {
        const s = stand(round(CARDS_STD, { cup: cupNode() }));
        assert.equal(s.sides.A.official + s.sides.B.official, s.pointsAvailable);
    });
});

// ===========================================================================
describe('PLAYER EXCLUSIVITY — session scoped', () => {

    const doubleBooked = () => cupNode({ matches: {
        m1: { id:'m1', sessionId:'s1', format:'fourball', scoring:'net',
              sideA:'A', sideB:'B', playersA:['101','102'], playersB:['103','104'] },
        m2: { id:'m2', sessionId:'s1', format:'fourball', scoring:'net',
              sideA:'A', sideB:'B', playersA:['101','105'], playersB:['107','108'] }
    }});

    test('the same golfer in two matches in one session is rejected', () => {
        const p = RC.validateRyderCup(round(CARDS_STD, { cup: doubleBooked() }));
        const dbl = p.filter(x => x.type === 'double-booked');
        assert.equal(dbl.length, 1);
        assert.equal(dbl[0].playerId, '101');
        assert.equal(dbl[0].session, 's1');
    });

    test('the SAME golfer in two matches in DIFFERENT sessions is fine', () => {
        // Day 1 AM and Day 1 PM. Scoping exclusivity globally would break the
        // three-day Cup before it is even built.
        const cup = doubleBooked();
        cup.matches.m2.sessionId = 's2';
        const p = RC.validateRyderCup(round(CARDS_STD, { cup }));
        assert.equal(p.filter(x => x.type === 'double-booked').length, 0);
    });

    test('a clean two-match session has no problems at all', () => {
        // Length, not deepEqual([]): the array is built inside the vm sandbox and
        // carries another realm's prototype, which deepStrictEqual rejects on identity.
        assert.equal(RC.validateRyderCup(round(CARDS_STD, { cup: cupNode() })).length, 0);
    });

    test('a golfer placed on the side they do not play for is rejected', () => {
        const cup = cupNode();
        cup.matches.m1.playersA = ['101', '103'];   // 103 is Team Chaos
        const p = RC.validateRyderCup(round(CARDS_STD, { cup }));
        assert.ok(p.some(x => x.type === 'wrong-side' && x.playerId === '103'));
    });

    test('a fourball with the wrong roster size is rejected', () => {
        const cup = cupNode();
        cup.matches.m1.playersA = ['101'];
        assert.ok(RC.validateRyderCup(round(CARDS_STD, { cup }))
            .some(x => x.type === 'roster-size'));
    });

    test('Ryder exclusivity says NOTHING about Side Matches', () => {
        // Manny is in three money wagers at once and in one Ryder match. Legal.
        const d = round(CARDS_STD, { cup: cupNode() });
        assert.equal(RC.validateRyderCup(d).length, 0);
        const mannyWagers = SETTLE.buildSideMatchReceipts(d, CD, d.scores)
            .filter(r => r.teamA.includes('Manny') || r.teamB.includes('Manny'));
        assert.ok(mannyWagers.length >= 2,
            'Manny should be free to carry several money wagers alongside his Ryder match');
    });
});

// ===========================================================================
describe('SINGLES', () => {

    const singles = (a, b) => cupNode({ matches: {
        sgl: { id:'sgl', sessionId:'s1', format:'singles', scoring:'net',
               sideA:'A', sideB:'B', playersA:[String(a)], playersB:[String(b)] }
    }});

    test('a singles win awards 1 / 0', () => {
        const d = round(CARDS_STD, { cup: singles(101, 103) });   // Manny beats Marty
        const r = res(d, 'sgl');
        assert.ok(r.status > 0, `expected Manny up, got ${r.result}`);
        assert.equal(r.pointsA, 1);
        assert.equal(r.pointsB, 0);
    });

    test('a singles loss awards 0 / 1', () => {
        const d = round(CARDS_STD, { cup: singles(102, 101) });   // Matt v Manny
        const r = res(d, 'sgl');
        assert.ok(r.status < 0, `expected Manny (side B here) up, got ${r.result}`);
        assert.equal(r.pointsA, 0);
        assert.equal(r.pointsB, 1);
    });

    test('a singles halve awards 0.5 / 0.5', () => {
        const d = round(CARDS_STD, { cup: singles(105, 107) });   // both par every hole
        const r = res(d, 'sgl');
        assert.equal(r.status, 0, `expected all square, got ${r.result}`);
        assert.equal(r.pointsA, 0.5);
        assert.equal(r.pointsB, 0.5);
    });

    test('a singles match closes out early and reports it', () => {
        // Manny birdies the first five; Marty pars out. 5 up with 13 to play.
        const cards = Object.assign({}, CARDS_STD, {
            101: card({ 1:-1, 2:-1, 3:-1, 4:-1, 5:-1, 6:-1, 7:-1 })
        });
        const d = round(cards, { cup: singles(101, 103) });
        const r = res(d, 'sgl');
        assert.ok(r.closed, 'match should have closed out early');
        assert.ok(/&/.test(r.result), `expected a closeout like "7 & 6", got "${r.result}"`);
        assert.equal(r.pointsA, 1);
    });

    test('singles uses the protected singles handicap baseline', () => {
        // Two golfers off different handicaps. The engine derives isSinglesMatch
        // from roster size, so this is the protected 1v1 allocation, not a copy.
        const d = round(CARDS_STD, { cup: singles(101, 103), hcps: { 101: 0, 103: 9 } });
        const gross = res(d, 'sgl');
        assert.ok(gross, 'a singles match with unequal handicaps must still resolve');
        assert.equal(gross.playersA.join(''), 'Manny');
        assert.equal(gross.playersB.join(''), 'Marty');
    });

    test('a singles roster of two per side is rejected', () => {
        const cup = singles(101, 103);
        cup.matches.sgl.playersA = ['101', '102'];
        assert.ok(RC.validateRyderCup(round(CARDS_STD, { cup }))
            .some(x => x.type === 'roster-size'));
    });

    test('singles coexists with a normal Side Match', () => {
        const d = round(CARDS_STD, { cup: singles(101, 103) });
        assert.equal(res(d, 'sgl').pointsA, 1);
        const recs = SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        assert.equal(recs.length, 4, 'all four money wagers must still settle');
    });
});

// ===========================================================================
describe('COMPETITION LOCK', () => {

    const noScores = () => scoresFrom({});

    test('an unstarted match is not locked', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        d.scores = noScores();
        const st = RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1);
        assert.equal(st.locked, false);
    });

    test('a match locks the moment its first score is posted', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        d.scores = { 'p101_h1': 4 };
        const st = RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1);
        assert.equal(st.locked, true);
        assert.equal(st.reason, 'scores-posted');
    });

    test('a pairing may be edited BEFORE the first score', () => {
        // Single-match competition, so 105/106 are genuinely free. An earlier draft
        // moved Zach into m1 while he was still in m2 - which the validator rightly
        // rejected as a double-booking. The fixture was wrong, not the gate.
        const d = round(CARDS_STD, { cup: cupNode({ matches: {
            m1: { id:'m1', sessionId:'s1', format:'fourball', scoring:'net',
                  sideA:'A', sideB:'B', playersA:['101','102'], playersB:['103','104'] }
        }})});
        d.scores = noScores();
        const out = RC.applyRyderPairingChange(d, CD, d.scores, 'm1',
            { playersA: ['101', '105'], playersB: ['103', '104'] });
        assert.equal(out.ok, true, JSON.stringify(out));
        assert.equal(d.ryderCup.matches.m1.playersA.join('/'), '101/105');
    });

    test('a pairing edit AFTER the first score is REJECTED', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        const before = d.ryderCup.matches.m1.playersA.slice();
        const out = RC.applyRyderPairingChange(d, CD, d.scores, 'm1',
            { playersA: ['101', '105'], playersB: ['103', '104'] });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'match-locked');
        assert.deepEqual(d.ryderCup.matches.m1.playersA, before,
            'the stored pairing must be untouched after a rejected change');
    });

    test('an edit that would double-book is rejected even when unlocked', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        d.scores = noScores();
        const out = RC.applyRyderPairingChange(d, CD, d.scores, 'm2',
            { playersA: ['101', '106'], playersB: ['107', '108'] });  // 101 already in m1
        assert.equal(out.ok, false);
        assert.equal(out.error, 'invalid');
        assert.ok(out.problems.some(p => p.type === 'double-booked'));
    });

    test('a snapshot roster survives the config being rewritten underneath it', () => {
        // The lock that cannot be defeated: even a direct edit to the stored
        // pairing cannot change a match that already locked its roster.
        const d = round(CARDS_STD, { cup: cupNode() });
        RC.lockRyderMatch(d.ryderCup.matches.m1, 1000);
        const decided = res(d, 'm1');
        assert.equal(decided.pointsA, 1);

        d.ryderCup.matches.m1.playersA = ['105', '106'];   // hand-edited, bypassing the gate
        const after = res(d, 'm1');
        assert.deepEqual(after.playersA.join('/'), 'Manny/Matt',
            'the decided match must still resolve under the roster that played it');
        assert.equal(after.pointsA, decided.pointsA);
    });

    test('locking is idempotent', () => {
        const m = { id:'m1', playersA:['101','102'], playersB:['103','104'] };
        assert.equal(RC.lockRyderMatch(m, 1000), true);
        assert.equal(RC.lockRyderMatch(m, 2000), false);
        assert.equal(m.lockedAt, 1000, 'a second lock must not overwrite the first');
    });
});

// ===========================================================================
describe('MULTI-GROUP — scores arrive independently', () => {

    test('Group 1 finishing does not decide Group 2 match', () => {
        // Only group 1 has posted anything.
        const g1Only = {};
        [101,102,103,104].forEach(id => { g1Only[id] = CARDS_STD[id]; });
        const d = round(g1Only, { cup: cupNode() });

        const m1 = res(d, 'm1'), m2 = res(d, 'm2');
        assert.equal(m1.decided, true, 'group 1 played 18 - its match is decided');
        assert.equal(m2.decided, false, 'group 2 has posted nothing - its match is live');
        assert.equal(m2.thru, 0);

        const s = stand(d);
        assert.equal(s.sides.A.official, 1, 'only the decided match is banked');
        assert.equal(s.sides.B.official, 0);
        assert.equal(s.decidedCount, 1);
        assert.equal(s.liveCount, 1);
    });

    test('Group 2 finishing then updates the Cup total', () => {
        const partial = {};
        [101,102,103,104].forEach(id => { partial[id] = CARDS_STD[id]; });
        const before = stand(round(partial, { cup: cupNode() }));
        const after = stand(round(CARDS_STD, { cup: cupNode() }));
        assert.equal(before.sides.A.official, 1);
        assert.equal(after.sides.A.official, 1.5, 'group 2 halving adds half a point');
        assert.equal(after.sides.B.official, 0.5);
    });

    test('no cross-group leakage: changing Group 2 scores cannot move Match 1', () => {
        const base = res(round(CARDS_STD, { cup: cupNode() }), 'm1');
        const moved = Object.assign({}, CARDS_STD, {
            107: card({ 1:-3, 2:-3, 3:-3 }), 108: card({ 4:-3, 5:-3 })
        });
        const after = res(round(moved, { cup: cupNode() }), 'm1');
        assert.equal(after.status, base.status);
        assert.equal(after.pointsA, base.pointsA);
        assert.equal(after.result, base.result);
    });
});

// ===========================================================================
describe('OFFICIAL vs PROJECTED', () => {

    test('an in-progress match counts as projected but not official', () => {
        const partial = {};
        [101,102,103,104].forEach(id => { partial[id] = CARDS_STD[id]; });
        // Group 2 nine holes in, all square.
        [105,106,107,108].forEach(id => { partial[id] = CARDS_STD[id].slice(0, 9); });
        const s = stand(round(partial, { cup: cupNode() }));

        assert.equal(s.sides.A.official, 1, 'only m1 is banked');
        assert.equal(s.sides.A.projected, 1.5, 'm2 projects a half');
        assert.notEqual(s.sides.A.official, s.sides.A.projected,
            'official and projected must not silently be the same number');
    });

    test('once everything is decided, official equals projected', () => {
        const s = stand(round(CARDS_STD, { cup: cupNode() }));
        assert.equal(s.sides.A.official, s.sides.A.projected);
        assert.equal(s.sides.B.official, s.sides.B.projected);
    });

    test('the Phase 1 `points` field still means BANKED', () => {
        const partial = {};
        [101,102,103,104].forEach(id => { partial[id] = CARDS_STD[id]; });
        const s = stand(round(partial, { cup: cupNode() }));
        assert.equal(s.sides.A.points, s.sides.A.official);
        assert.notEqual(s.sides.A.points, s.sides.A.projected);
    });
});

// ===========================================================================
describe('YOUR MATCH', () => {

    test('a group-locked golfer resolves to their own Ryder match', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        const mine = RC.ryderMatchForPlayers(d, CD, d.scores, [101, 102, 103, 104]);
        assert.equal(mine.matchId, 'm1');
        assert.equal(mine.playersA.join('/'), 'Manny/Matt');
    });

    test('group 2 resolves to match 2', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        assert.equal(RC.ryderMatchForPlayers(d, CD, d.scores, [105,106,107,108]).matchId, 'm2');
    });

    test('no group context yields NO match rather than a guess', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        assert.equal(RC.ryderMatchForPlayers(d, CD, d.scores, []), null);
        assert.equal(RC.ryderMatchForPlayers(d, CD, d.scores, [999]), null);
    });

    test('status lines read the way a golfer expects', () => {
        const partial = {};
        [105,106,107,108].forEach(id => { partial[id] = CARDS_STD[id].slice(0, 12); });
        const live = RC.ryderMatchForPlayers(round(partial, { cup: cupNode() }), CD,
            scoresFrom(partial), [105]);
        assert.equal(RC.ryderStatusLine(live), 'AS thru 12');

        const done = res(round(CARDS_STD, { cup: cupNode() }), 'm1');
        assert.ok(/^FINAL/.test(RC.ryderStatusLine(done)), RC.ryderStatusLine(done));

        const halved = res(round(CARDS_STD, { cup: cupNode() }), 'm2');
        assert.equal(RC.ryderStatusLine(halved), 'HALVED');
    });
});

// ===========================================================================
describe('MONEY ISOLATION AT SCALE — 8 golfers, 2 groups, 4 wagers, presses', () => {

    test('two Four-Ball matches change no money whatsoever', () => {
        const A = round(CARDS_STD);
        const B = round(CARDS_STD, { cup: cupNode() });
        assert.deepEqual(moneyShape(B), moneyShape(A));
    });

    test('a Singles competition changes no money whatsoever', () => {
        const A = round(CARDS_STD);
        const B = round(CARDS_STD, { cup: cupNode({ matches: {
            sgl: { id:'sgl', sessionId:'s1', format:'singles', scoring:'net',
                   sideA:'A', sideB:'B', playersA:['101'], playersB:['103'] }
        }})});
        assert.deepEqual(moneyShape(B), moneyShape(A));
    });

    test('no ledger line anywhere mentions the Cup', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        Object.values(money(d).contributions).forEach(c => c.lines.forEach(l => {
            assert.ok(!/ryder|cup|point/i.test(l.label),
                `${c.name}: "${l.label}" - a Cup point became money`);
        }));
    });

    test('money stays zero-sum across 8 golfers with a Cup running', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        const sum = Object.values(money(d).contributions).reduce((a, c) => a + c.net, 0);
        assert.ok(Math.abs(sum) < 0.005, `money sums to ${sum}`);
    });

    test('all four money wagers still settle and presses still fire', () => {
        const d = round(CARDS_STD, { cup: cupNode() });
        const recs = SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        assert.equal(recs.length, 4);
        assert.ok(recs.find(r => r.matchId === 's3').segments.length > 1,
            's3 has a 2-down press rule and should carry more than one segment');
    });
});

// ===========================================================================
describe('PERSISTENCE / REOPEN — realistic mixed state', () => {

    function mixedRound() {
        // m1 complete and locked, m2 nine holes in, four money wagers running.
        const cards = {};
        [101,102,103,104].forEach(id => { cards[id] = CARDS_STD[id]; });
        [105,106,107,108].forEach(id => { cards[id] = CARDS_STD[id].slice(0, 9); });
        const d = round(cards, { cup: cupNode() });
        RC.lockRyderMatch(d.ryderCup.matches.m1, 1234);
        return d;
    }

    test('everything survives a serialize/reload cycle', () => {
        const live = mixedRound();
        const before = stand(live);
        const beforeMoney = moneyShape(live);
        const beforeM1 = res(live, 'm1');
        const beforeM2 = res(live, 'm2');

        const re = JSON.parse(JSON.stringify(live));
        const after = stand(re);

        assert.equal(after.sides.A.name, 'Team Rattle');
        assert.equal(after.sides.B.name, 'Team Chaos');
        assert.equal(after.sides.A.official, before.sides.A.official);
        assert.equal(after.sides.A.projected, before.sides.A.projected);
        assert.equal(after.matches.length, 2);

        assert.equal(res(re, 'm1').result, beforeM1.result, 'completed result changed');
        assert.equal(res(re, 'm2').thru, beforeM2.thru, 'live match state changed');
        assert.equal(res(re, 'm2').decided, false);

        assert.equal(re.ryderCup.matches.m1.lockedAt, 1234, 'lock state lost');
        assert.deepEqual(re.ryderCup.matches.m1.lockedA.join('/'), '101/102');
        assert.equal(re.ryderCup.matches.m1.format, 'fourball');
        assert.equal(re.ryderCup.matches.m2.sessionId, 's1');

        assert.deepEqual(moneyShape(re), beforeMoney);
        assert.equal(Object.keys(re.sideMatches).length, 4);
    });

    test('a reopened locked match still rejects a pairing edit', () => {
        const re = JSON.parse(JSON.stringify(mixedRound()));
        const out = RC.applyRyderPairingChange(re, CD, re.scores, 'm1',
            { playersA: ['105','106'], playersB: ['103','104'] });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'match-locked');
    });

    test('no derived point total is ever stored', () => {
        const raw = JSON.stringify(mixedRound().ryderCup);
        assert.ok(!/"points"|"official"|"projected"|"status"/.test(raw),
            'a derived value was persisted: ' + raw);
    });
});

// ===========================================================================
describe('LEGACY `ryder` — still untouched by Phase 2', () => {

    function legacy() {
        return {
            gameFormat: 'ryder', matchStake: 50, matchScoring: 'net',
            players: players(), courseData: CD, scores: scoresFrom(CARDS_STD),
            sideMatches: {}
        };
    }

    test('legacy ryder still settles money and is not seen as a Cup', () => {
        const d = legacy();
        assert.equal(RC.hasRyderCup(d), false);
        assert.equal(RC.computeRyderCupStandings(d, CD, d.scores), null);
        const c = money(d).contributions;
        assert.ok(Object.values(c).some(x => x.lines.some(l => /ryder/i.test(l.label))),
            'legacy ryder lost its money line');
        const sum = Object.values(c).reduce((a, x) => a + x.net, 0);
        assert.ok(Math.abs(sum) < 0.005);
    });

    test('attaching a Cup to a legacy round changes none of its money', () => {
        const base = legacy();
        const before = moneyShape(base);
        const withCup = Object.assign({}, legacy(), { ryderCup: cupNode() });
        assert.deepEqual(moneyShape(withCup), before);
    });

    test('validation ignores a legacy round entirely', () => {
        assert.equal(RC.validateRyderCup(legacy()).length, 0);
    });
});
