// ============================================================================
// GROUP-OWNED ACTION — 20 END-TO-END SIMULATIONS
//
// Not UI tests. These take rounds shaped exactly as the new creation flow saves
// them - scope, ownerGroup, participantIds and all - and run them through the
// real engines to the real settlement, checking the money.
//
// The invariant that matters most, stated once:
//
//   A GOLFER OUTSIDE A WAGER CONTRIBUTES $0 AND INFLUENCES NOTHING.
//
// Zero-sum alone does not prove this. The original Dots bug balanced perfectly -
// it just balanced across the wrong people. So every simulation checks WHO is in
// the pot, not only that the pot sums to zero.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const SB = engines();
const J = v => JSON.stringify(v);
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, handicap: i + 1, yards: 400 }));

const G1 = [{ id: 101, name: 'Marty' }, { id: 102, name: 'Manny' }, { id: 103, name: 'John' }, { id: 104, name: 'Steve' }];
const G2 = [{ id: 201, name: 'Stan' }, { id: 202, name: 'Greg' }, { id: 203, name: 'Tony' }, { id: 204, name: 'James' }];
const G3 = [{ id: 301, name: 'Ryan' }, { id: 302, name: 'Dalen' }, { id: 303, name: 'Nick' }, { id: 304, name: 'Paul' }];
const ALL8 = G1.concat(G2);
const ALL12 = ALL8.concat(G3);
const ids = a => a.map(p => String(p.id));
const NAME = {}; ALL12.forEach(p => { NAME[p.id] = p.name; });

// Distinct scoring profiles so matches actually resolve rather than halving out.
const PROF = { 101: 4, 102: 5, 103: 4, 104: 6, 201: 4, 202: 5, 203: 6, 204: 4, 301: 5, 302: 4, 303: 6, 304: 5 };
const SCORES = {};
ALL12.forEach(p => { for (let h = 1; h <= 18; h++) SCORES[`p${p.id}_h${h}`] = PROF[p.id] + (h % 5 === 0 ? 1 : 0); });

const DOTS = {
    h5: { p101: ['birdie', 'sandy'], p103: ['greenie'], p201: ['birdie', 'birdie', 'birdie'] },
    h9: { p102: ['snake'], p202: ['greenie'], p301: ['birdie'] },
    h14: { p104: ['birdie'], p204: ['sandy'], p302: ['greenie'] }
};

// Teams, the way the creation flow saves them.
const team = (players, aIds) => players.map(p =>
    Object.assign({}, p, { team: aIds.includes(p.id) ? 'Team 1' : 'Team 2' }));

// Settles a whole round through the real orchestration and returns
// { gameKey: {playerId: net} } for round games plus each side match's net.
function settle(data, scores) {
    vm.runInContext(`window.__o = (function () {
        const d = ${J(data)};
        const out = { games: {}, side: {} };
        getRoundGames(d).forEach(g => {
            out.games[g.key] = computeGameNetByPlayerId(g, ${J(CD)}, ${J(scores || SCORES)});
        });
        Object.keys(d.sideMatches || {}).forEach(k => {
            const sm = d.sideMatches[k];
            const a = (sm.teamAIds || []).map(String), b = (sm.teamBIds || []).map(String);
            const parts = (d.players || [])
                .filter(p => a.concat(b).includes(String(p.id)))
                .map(p => Object.assign({}, p, { team: a.includes(String(p.id)) ? 'Team 1' : 'Team 2' }));
            const holes = (typeof sideMatchHoles === 'function')
                ? sideMatchHoles(sm, ${J(CD)}) : ${J(CD)};
            const cfg = Object.assign({}, d, {
                players: parts, gameFormat: sm.format,
                matchStake: sm.stake, nassauStake: sm.stake,
                matchScoring: sm.scoring, nassauScoring: sm.scoring,
                matchScoringStyle: sm.format === 'stroke' ? 'stroke' : undefined,
                matchPressRule: sm.pressRule, nassauPressRule: sm.pressRule
            });
            delete cfg.additionalGames; delete cfg.additionalGameInstances; delete cfg.sideMatches;
            const r = computeRoundMoneyByPlayer(cfg, holes, ${J(scores || SCORES)});
            const net = {};
            if (r.valid) r.players.forEach(p => { net[p.id] = p.net || 0; });
            out.side[k] = net;
        });
        return out;
    })();`, SB);
    return SB.window.__o;
}

const sum = o => Object.values(o).reduce((a, b) => a + (b || 0), 0);
const who = o => Object.keys(o).map(String).sort();

// The three assertions every simulation makes.
function verify(label, net, expectedIds) {
    assert.equal(who(net).join(), expectedIds.slice().sort().join(),
        `${label}: wrong participants in the pot`);
    assert.ok(Math.abs(sum(net)) < 0.01, `${label}: not zero-sum (${sum(net)})`);
    Object.keys(net).forEach(id => assert.ok(expectedIds.includes(String(id)),
        `${label}: ${NAME[id]} settled in a wager they are not in`));
}

// A group wager, shaped exactly as the creation flow writes it.
const gDots = (g, stake, startHole) => Object.assign(
    { format: 'dots', enabled: true, dotPointVal: stake, scope: 'group', ownerGroup: g,
      participantIds: ids(g === 1 ? G1 : g === 2 ? G2 : G3) },
    startHole ? { startHole } : {});
const gSkins = (g, stake, only) => ({ format: 'skins', enabled: true, skinsBuyIn: stake,
    skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: true,
    scope: 'group', ownerGroup: g, participantIds: only || ids(g === 1 ? G1 : g === 2 ? G2 : G3) });
const match = (aIds, bIds, stake, opts) => Object.assign(
    { format: 'match', scoring: 'net', stake, pressRule: 'none', startHole: 1, createdAt: 1,
      teamAIds: aIds.map(String), teamBIds: bIds.map(String) }, opts || {});

// ---------------------------------------------------------------------------
describe('ONE-GROUP ROUNDS — the everyday case, unchanged', () => {
    test('SIM 1 — one-group Match', () => {
        const d = { players: team(G1, [101, 103]), gameFormat: 'match', matchStake: 50, matchScoring: 'net' };
        verify('sim1', settle(d).games.main, ids(G1));
    });

    test('SIM 2 — one-group Dots, no participantIds recorded', () => {
        const d = { players: G1, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5 } } };
        // One foursome IS the field; the flow deliberately records nothing.
        verify('sim2', settle(d).games.d1, ids(G1));
    });

    test('SIM 3 — one-group Skins', () => {
        const d = { players: G1, gameFormat: 'stroke',
            additionalGameInstances: { s1: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross' } } };
        verify('sim3', settle(d).games.s1, ids(G1));
    });
});

// ---------------------------------------------------------------------------
describe('GROUP-LOCAL ACTION — two groups, separate money', () => {
    test('SIM 4 — G1 Match, Group 2 untouched', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { m1: match([101], [102], 50, { scope: 'group', ownerGroup: 1 }) } };
        verify('sim4', settle(d).side.m1, ['101', '102']);
    });

    test('SIM 5 — G2 Match, Group 1 untouched', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { m2: match([201], [202], 50, { scope: 'group', ownerGroup: 2 }) } };
        verify('sim5', settle(d).side.m2, ['201', '202']);
    });

    test('SIM 6 — G1 Dots: Stan\'s three dots are worth nothing here', () => {
        const d = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5) } };
        const net = settle(d).games.d1;
        verify('sim6', net, ids(G1));
        ids(G2).forEach(id => assert.equal(net[id], undefined, `${NAME[id]} must not be in Group 1's pot`));
    });

    test('SIM 7 — G2 Dots: Marty\'s dots are worth nothing there', () => {
        const d = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d2: gDots(2, 10) } };
        const net = settle(d).games.d2;
        verify('sim7', net, ids(G2));
        ids(G1).forEach(id => assert.equal(net[id], undefined));
    });

    test('SIM 8 — two simultaneous Dots games are genuinely independent', () => {
        const d = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5), d2: gDots(2, 10) } };
        const s = settle(d);
        verify('sim8/G1', s.games.d1, ids(G1));
        verify('sim8/G2', s.games.d2, ids(G2));

        // The original bug made these the same game at two stakes. Prove they move
        // independently: an extra Group 1 dot must not touch Group 2's money.
        const more = JSON.parse(JSON.stringify(d));
        more.dots.h9.p101 = ['birdie', 'birdie'];
        assert.deepEqual(settle(more).games.d2, s.games.d2, 'Group 2 money moved on a Group 1 dot');
        assert.notDeepEqual(settle(more).games.d1, s.games.d1, 'Group 1 money should have moved');
    });

    test('SIM 9 — three group Dots games, 4/4/4, no overlap', () => {
        const d = { players: ALL12, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5), d2: gDots(2, 10), d3: gDots(3, 2) } };
        const s = settle(d);
        verify('sim9/G1', s.games.d1, ids(G1));
        verify('sim9/G2', s.games.d2, ids(G2));
        verify('sim9/G3', s.games.d3, ids(G3));
        const all = who(s.games.d1).concat(who(s.games.d2), who(s.games.d3));
        assert.equal(new Set(all).size, all.length, 'no golfer may appear in two group dots games');
    });

    test('SIM 10 — G1 Nassau', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { n1: match([101], [104], 20, { format: 'nassau', scope: 'group', ownerGroup: 1 }) } };
        verify('sim10', settle(d).side.n1, ['101', '104']);
    });

    test('SIM 11 — G2 Skins', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            additionalGameInstances: { s2: gSkins(2, 10) } };
        verify('sim11', settle(d).games.s2, ids(G2));
    });

    test('SIM 12 — G1 2v2', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { t1: match([101, 103], [102, 104], 40, { scope: 'group', ownerGroup: 1 }) } };
        verify('sim12', settle(d).side.t1, ids(G1));
    });
});

// ---------------------------------------------------------------------------
describe('CROSS-GROUP ACTION — explicit, and correctly scoped', () => {
    test('SIM 13 — cross-group Match, Marty vs Stan', () => {
        const d = { players: ALL12, gameFormat: 'stroke',
            sideMatches: { x1: match([101], [201], 50, { scope: 'cross' }) } };
        const net = settle(d).side.x1;
        verify('sim13', net, ['101', '201']);
        // Group 3 is nowhere near it.
        ids(G3).forEach(id => assert.equal(net[id], undefined));
    });

    test('SIM 14 — cross-group Stroke', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { x2: match([103], [203], 0, { format: 'stroke', scope: 'cross',
                holeStake: 0, overallStake: 20 }) } };
        const net = settle(d).side.x2;
        verify('sim14', net, ['103', '203']);
    });

    test('SIM 15 — local and cross-group wagers side by side', () => {
        const d = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5) },
            sideMatches: {
                m1: match([102], [104], 20, { scope: 'group', ownerGroup: 1 }),
                x1: match([101], [201], 50, { scope: 'cross' })
            } };
        const s = settle(d);
        verify('sim15/dots', s.games.d1, ids(G1));
        verify('sim15/local', s.side.m1, ['102', '104']);
        verify('sim15/cross', s.side.x1, ['101', '201']);
        // Everything together still balances.
        const total = sum(s.games.d1) + sum(s.side.m1) + sum(s.side.x1);
        assert.ok(Math.abs(total) < 0.01, 'the round as a whole must be zero-sum');
    });
});

// ---------------------------------------------------------------------------
describe('MID-ROUND, PRESSES AND SCALE', () => {
    test('SIM 16 — G1 Dots added on H7 counts only H7-18', () => {
        const d = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5, 7) } };
        const net = settle(d).games.d1;
        verify('sim16', net, ids(G1));

        // H5 dots (Marty +2, John +1) are outside the range; H9 and H14 are inside.
        const full = settle({ players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5) } }).games.d1;
        assert.notDeepEqual(net, full, 'a start hole must actually exclude earlier holes');
    });

    test('SIM 17 — group-local press', () => {
        const d = { players: ALL8, gameFormat: 'stroke',
            sideMatches: { m1: match([101], [102], 50, { scope: 'group', ownerGroup: 1,
                pressRule: 'anytime', presses: { p1: { baseId: 'b0', startHole: 10 } } }) } };
        verify('sim17', settle(d).side.m1, ['101', '102']);
    });

    test('SIM 18 — cross-group press stays between the two golfers', () => {
        const d = { players: ALL12, gameFormat: 'stroke',
            sideMatches: { x1: match([101], [201], 50, { scope: 'cross',
                pressRule: 'anytime', presses: { p1: { baseId: 'b0', startHole: 10 } } }) } };
        const net = settle(d).side.x1;
        verify('sim18', net, ['101', '201']);
        ids(G3).forEach(id => assert.equal(net[id], undefined, 'a press must not widen the field'));
    });

    test('SIM 19 — three groups, each with its own independent action', () => {
        const d = { players: ALL12, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5), d2: gDots(2, 10), s3: gSkins(3, 10) },
            sideMatches: {
                m1: match([101], [102], 50, { scope: 'group', ownerGroup: 1 }),
                n2: match([201], [202], 20, { format: 'nassau', scope: 'group', ownerGroup: 2 })
            } };
        const s = settle(d);
        verify('sim19/G1 dots', s.games.d1, ids(G1));
        verify('sim19/G2 dots', s.games.d2, ids(G2));
        verify('sim19/G3 skins', s.games.s3, ids(G3));
        verify('sim19/G1 match', s.side.m1, ['101', '102']);
        verify('sim19/G2 nassau', s.side.n2, ['201', '202']);

        // No group's money leaks into another's.
        assert.equal(who(s.games.d1).some(id => ids(G2).includes(id)), false);
        assert.equal(who(s.games.s3).some(id => ids(G1).includes(id)), false);
    });

    test('SIM 20 — heavy round: 12 golfers, 7 wagers, everything balances', () => {
        const d = { players: ALL12, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: {
                d1: gDots(1, 5), d2: gDots(2, 10), d3: gDots(3, 2),
                s1: gSkins(1, 10, ['101', '102', '103']),   // Steve sits out
                x1: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross',
                      scope: 'cross', participantIds: ['101', '201', '301'] }
            },
            sideMatches: {
                m1: match([102], [104], 30, { scope: 'group', ownerGroup: 1 }),
                x2: match([103], [203], 50, { scope: 'cross' })
            } };
        const s = settle(d);
        verify('sim20/G1 dots', s.games.d1, ids(G1));
        verify('sim20/G2 dots', s.games.d2, ids(G2));
        verify('sim20/G3 dots', s.games.d3, ids(G3));
        verify('sim20/G1 skins', s.games.s1, ['101', '102', '103']);
        verify('sim20/cross skins', s.games.x1, ['101', '201', '301']);
        verify('sim20/G1 match', s.side.m1, ['102', '104']);
        verify('sim20/cross match', s.side.x2, ['103', '203']);

        const grand = Object.values(s.games).concat(Object.values(s.side)).reduce((a, n) => a + sum(n), 0);
        assert.ok(Math.abs(grand) < 0.01, `the whole round must net to zero, got ${grand}`);
    });
});

// ---------------------------------------------------------------------------
describe('WHO PAYS WHO — the combined receipt', () => {
    test('every wager contributes exactly once, and the totals net to zero', () => {
        const d = { players: ALL12, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: gDots(1, 5), d2: gDots(2, 10), s3: gSkins(3, 10) },
            sideMatches: { x1: match([101], [201], 50, { scope: 'cross' }) } };
        const s = settle(d);

        // Combine the way the receipt does: sum every wager per player.
        const combined = {};
        Object.values(s.games).concat(Object.values(s.side)).forEach(net => {
            Object.keys(net).forEach(id => { combined[id] = (combined[id] || 0) + net[id]; });
        });
        assert.ok(Math.abs(sum(combined)) < 0.01, 'combined settlement must be zero-sum');

        // Global debt simplification is safe precisely because of that: the winners
        // owe exactly what the losers are owed.
        const owed = Object.values(combined).filter(v => v > 0).reduce((a, b) => a + b, 0);
        const owing = Object.values(combined).filter(v => v < 0).reduce((a, b) => a - b, 0);
        assert.ok(Math.abs(owed - owing) < 0.01, 'what is owed must equal what is owing');
    });

    test('scope and ownerGroup never reach the money', () => {
        // They are ownership metadata for permission and visibility. If an engine
        // ever read them, the same wager could settle differently depending on a
        // label - which is exactly what must not happen.
        const base = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', enabled: true, dotPointVal: 5,
                participantIds: ids(G1) } } };
        const labelled = JSON.parse(JSON.stringify(base));
        labelled.additionalGameInstances.d1.scope = 'group';
        labelled.additionalGameInstances.d1.ownerGroup = 1;
        assert.deepEqual(settle(labelled).games.d1, settle(base).games.d1,
            'adding ownership labels must not move a cent');
    });
});
