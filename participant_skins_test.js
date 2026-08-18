// ============================================================================
// PARTICIPANT-SCOPED SKINS
//
// "Me, Marty and James are playing $10 skins" - inside a round that may have eight
// other golfers playing something else entirely.
//
// Built on the EXISTING additional-game architecture rather than as a second Skins
// implementation inside the two-sided Side Match model. One canonical skins engine,
// one carry rule, one pot arithmetic. The only new idea is an optional
// `participantIds` on the game config, read through fieldParticipants().
//
// The hard requirement these tests exist to hold: a golfer who is not in the wager
// must be INVISIBLE to it. Not merely unpaid - unable to win a skin, unable to break
// a tie, unable to change a carry chain, in live display and in settlement alike.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

// Layered exactly as the browser loads them.
function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f => {
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f });
    });
    return sb;
}
const SB = engines();

const run = (code, ctx) => {
    vm.runInContext(`window.__out = (function(){ ${code} })();`, ctx || SB);
    return (ctx || SB).window.__out;
};
const J = v => JSON.stringify(v);

const CD = makeCourseData(18);

// A round with `names` playing, and a scoped skins game over `inIt`.
function round(opts) {
    const o = opts || {};
    const players = makePlayers(o.names || ['Manny', 'Marty', 'James', 'Stan'], o.hcps || [0, 0, 0, 0]);
    players.forEach(p => { p.playingForMoney = true; });
    const scores = {};
    (o.parAll === false ? [] : CD).forEach(h => players.forEach(p => {
        scores[`p${p.id}_h${h.hole}`] = h.par;
    }));
    if (o.scores) o.scores(scores, players, CD);

    const skins = Object.assign({
        enabled: true, skinsBuyIn: 10, skinsCarryOver: true,
        skinsScoring: 'gross', skinsPotFormat: 'gross', startHole: 1
    }, o.skins || {});
    if (o.inIt) skins.participantIds = o.inIt.map(i => String(players[i].id));

    return {
        players,
        data: {
            gameFormat: 'stroke', players, courseData: CD, scores,
            additionalGames: { skins }
        },
        scores
    };
}

function skinsNet(r) {
    return run(`
        var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
        var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
        return computeSkinsSettlementNet(g.config, gameHoles(g, C), S);
    `);
}
const nameOf = (r, id) => (r.players.find(p => String(p.id) === String(id)) || {}).name;
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
describe('THE PARTICIPANT FILTER', () => {
    test('omitted participantIds means the whole money field — legacy behaviour', () => {
        const ids = run(`return fieldParticipants({ players: [
            { id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }
        ]}).map(function(p){ return p.name; }).join(',');`);
        assert.equal(ids, 'A,B,C');
    });

    test('playingForMoney:false is still excluded, scoped or not', () => {
        const out = run(`return fieldParticipants({ players: [
            { id: 1, name: 'A' }, { id: 2, name: 'B', playingForMoney: false }
        ]}).map(function(p){ return p.name; }).join(',');`);
        assert.equal(out, 'A');
    });

    test('participantIds narrows the field to exactly those golfers', () => {
        const out = run(`return fieldParticipants({
            players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
            participantIds: ['1', '3']
        }).map(function(p){ return p.name; }).join(',');`);
        assert.equal(out, 'A,C');
    });

    test('ids match as STRINGS, so numeric and string ids both resolve', () => {
        const out = run(`return fieldParticipants({
            players: [{ id: 7, name: 'A' }, { id: 8, name: 'B' }],
            participantIds: [7]
        }).map(function(p){ return p.name; }).join(',');`);
        assert.equal(out, 'A');
    });

    test('duplicate NAMES stay distinguishable — filtering is by id, never by name', () => {
        const out = run(`return fieldParticipants({
            players: [{ id: 1, name: 'Mike' }, { id: 2, name: 'Mike' }, { id: 3, name: 'Al' }],
            participantIds: ['2']
        }).map(function(p){ return p.id; }).join(',');`);
        assert.equal(out, '2');
    });

    test('an id for a removed golfer drops out instead of throwing', () => {
        const out = run(`return fieldParticipants({
            players: [{ id: 1, name: 'A' }],
            participantIds: ['1', '99']
        }).map(function(p){ return p.name; }).join(',');`);
        assert.equal(out, 'A');
    });

    test('an EMPTY array is read as "everybody", not as "nobody"', () => {
        // A game that silently paid nobody would be a worse failure than one that paid
        // everybody, and the setup UI never writes an empty array.
        const out = run(`return fieldParticipants({
            players: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
            participantIds: []
        }).length;`);
        assert.equal(out, 2);
    });
});

// ---------------------------------------------------------------------------
describe('NON-PARTICIPANTS ARE INVISIBLE TO THE WAGER', () => {
    // THE headline requirement. Stan shoots the low score on the hole and it must not
    // matter in any way.
    const r = round({
        inIt: [0, 1, 2],
        scores: (s, p) => {
            s[`p${p[0].id}_h7`] = 4;   // Manny  — best among participants
            s[`p${p[1].id}_h7`] = 5;
            s[`p${p[2].id}_h7`] = 5;
            s[`p${p[3].id}_h7`] = 3;   // Stan   — best on the hole, but NOT in the game
        }
    });

    test('a non-participant with the outright low score wins nothing', () => {
        const net = skinsNet(r);
        assert.ok(net[r.players[3].id] === undefined, 'Stan appeared in the skins ledger');
    });

    test('the skin goes to the best PARTICIPANT, as if the outsider were not there', () => {
        const awards = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            return st.awards.filter(function(a){ return a.hole === 7; })
                     .map(function(a){ return String(a.playerId); }).join(',');
        `);
        assert.equal(awards, String(r.players[0].id), 'Manny should hold the hole 7 skin');
    });

    test('a non-participant cannot BREAK a tie between participants', () => {
        // Participants all tie; the outsider is low. Under carry-over the hole must
        // still carry, exactly as if he had not played.
        const t = round({
            inIt: [0, 1, 2],
            scores: (s, p) => {
                s[`p${p[0].id}_h7`] = 5; s[`p${p[1].id}_h7`] = 5; s[`p${p[2].id}_h7`] = 5;
                s[`p${p[3].id}_h7`] = 2;
            }
        });
        const carried = run(`
            var D = ${J(t.data)}, C = ${J(CD)}, S = ${J(t.scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            return st.awards.some(function(a){ return a.hole === 7; });
        `);
        assert.equal(carried, false, 'an outsider decided a hole he was not playing for');
    });

    test('correcting a NON-PARTICIPANT score cannot change the result', () => {
        const before = skinsNet(r);
        const after = skinsNet(round({
            inIt: [0, 1, 2],
            scores: (s, p) => {
                s[`p${p[0].id}_h7`] = 4; s[`p${p[1].id}_h7`] = 5; s[`p${p[2].id}_h7`] = 5;
                s[`p${p[3].id}_h7`] = 8;   // Stan's score corrected 3 -> 8
            }
        }));
        assert.deepEqual(Object.keys(before).map(k => before[k]).sort(),
            Object.keys(after).map(k => after[k]).sort());
    });
});

// ---------------------------------------------------------------------------
describe('FIELD SIZES', () => {
    [2, 3, 4, 6].forEach(n => {
        test(`${n} participants: zero-sum, and only they are paid`, () => {
            const names = ['Manny', 'Marty', 'James', 'Stan', 'Greg', 'Tony'];
            const r = round({
                names, hcps: [0, 0, 0, 0, 0, 0],
                inIt: Array.from({ length: n }, (_, i) => i),
                scores: (s, p) => { s[`p${p[0].id}_h3`] = 3; }
            });
            const net = skinsNet(r);
            assert.equal(Object.keys(net).length, n, 'wrong number of golfers in the pot');
            assert.ok(Math.abs(sum(net)) < 1e-9, `not zero-sum: ${sum(net)}`);
            for (let i = n; i < names.length; i++) {
                assert.ok(net[r.players[i].id] === undefined, `${names[i]} should not be in it`);
            }
        });
    });
});

// ---------------------------------------------------------------------------
describe('CARRY OVER AND NO CARRY, SCOPED', () => {
    // Holes 6 and 7 tie among participants, hole 8 Marty wins outright.
    const mk = carry => round({
        inIt: [0, 1, 2],
        skins: { skinsCarryOver: carry, startHole: 6 },
        scores: (s, p) => {
            s[`p${p[1].id}_h8`] = 3;              // Marty outright
            s[`p${p[3].id}_h6`] = 2;              // outsider noise throughout
            s[`p${p[3].id}_h7`] = 2;
            s[`p${p[3].id}_h8`] = 2;
        }
    });

    test('CARRY OVER: the accumulated units land on the golfer who breaks the tie', () => {
        const r = mk(true);
        const award = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            var a = st.awards.filter(function(x){ return x.hole === 8; })[0];
            return a ? { id: String(a.playerId), units: a.units } : null;
        `);
        assert.ok(award, 'hole 8 produced no award');
        assert.equal(award.id, String(r.players[1].id), 'Marty should win it');
        assert.equal(award.units, 3, 'holes 6 and 7 carried into hole 8');
    });

    test('NO CARRY: a tied hole is simply void, and the winner takes one unit', () => {
        const r = mk(false);
        const units = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            var a = st.awards.filter(function(x){ return x.hole === 8; })[0];
            return a ? a.units : null;
        `);
        assert.equal(units, 1);
    });

    test('both modes stay zero-sum', () => {
        [true, false].forEach(c => {
            const net = skinsNet(mk(c));
            assert.ok(Math.abs(sum(net)) < 1e-9, `carryOver=${c} not zero-sum`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('MID-ROUND START', () => {
    const r = round({
        inIt: [0, 1, 2],
        skins: { startHole: 6 },
        scores: (s, p) => {
            s[`p${p[0].id}_h2`] = 2;   // a huge score BEFORE the game existed
            s[`p${p[1].id}_h9`] = 3;   // and one inside its range
        }
    });

    test('the wager covers only its own holes', () => {
        const holes = run(`
            var D = ${J(r.data)}, C = ${J(CD)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            return gameHoles(g, C).map(function(h){ return h.hole; }).join(',');
        `);
        assert.equal(holes.split(',')[0], '6');
        assert.ok(!holes.split(',').includes('5'));
    });

    test('a score before the start hole contributes nothing', () => {
        const awards = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            return st.awards.map(function(a){ return a.hole; }).join(',');
        `);
        assert.ok(!awards.split(',').includes('2'), 'hole 2 paid out despite predating the game');
    });

    test('correcting a hole BEFORE the start hole changes nothing', () => {
        const before = skinsNet(r);
        const after = skinsNet(round({
            inIt: [0, 1, 2], skins: { startHole: 6 },
            scores: (s, p) => { s[`p${p[0].id}_h2`] = 9; s[`p${p[1].id}_h9`] = 3; }
        }));
        assert.deepEqual(before, after);
    });

    test('correcting a hole INSIDE the range does change the result', () => {
        const before = skinsNet(r);
        const after = skinsNet(round({
            inIt: [0, 1, 2], skins: { startHole: 6 },
            scores: (s, p) => { s[`p${p[0].id}_h2`] = 2; s[`p${p[1].id}_h9`] = 9; }
        }));
        assert.notDeepEqual(before, after, 'a score correction inside the wager was ignored');
    });
});

// ---------------------------------------------------------------------------
describe('NET SKINS AND THE bet-strip HANDICAP BUG', () => {
    // bet-strip.js called getStrokes(parseHcp(p.handicap), h.hcp, N):
    //   - arguments reversed against the canonical getStrokes(hcpIndex, playerHcp)
    //   - `p.handicap` and `h.hcp` are not fields this app uses (`p.hcp`, `h.hcpIndex`)
    //   - a third argument getStrokes does not accept
    // Every golfer therefore got ZERO strokes and "Net" skins paid on gross scores.
    const hole1 = CD.find(h => h.hole === 1);

    test('the canonical allocation gives a stroke where one is due', () => {
        const strokes = run(`return getStrokes(${hole1.hcpIndex}, parseHcp('18'));`);
        assert.equal(strokes, 1);
    });

    test('LIVE net skins now applies handicap strokes', () => {
        // Manny off 18 shoots one worse than scratch Marty: net TIE, so no skin.
        const players = [{ id: '1', name: 'Manny', hcp: '18' }, { id: '2', name: 'Marty', hcp: '0' }];
        const scores = { p1_h1: hole1.par + 1, p2_h1: hole1.par };
        const won = run(`
            return skinsState({ skinsScoring: 'net', skinsBuyIn: 10, skinsCarryOver: true },
                ${J([hole1])}, ${J(scores)}, ${J(players)}).won;
        `);
        assert.deepEqual(Object.keys(won), [], 'the stroke was not applied — this is the bug');
    });

    test('and still names a winner when the stroke is not enough', () => {
        const players = [{ id: '1', name: 'Manny', hcp: '18' }, { id: '2', name: 'Marty', hcp: '0' }];
        const scores = { p1_h1: hole1.par + 3, p2_h1: hole1.par };
        const won = run(`
            return skinsState({ skinsScoring: 'net', skinsBuyIn: 10, skinsCarryOver: true },
                ${J([hole1])}, ${J(scores)}, ${J(players)}).won;
        `);
        assert.deepEqual(Object.keys(won), ['2']);
    });

    test('PARITY: live and settlement agree on the same net hole', () => {
        const players = [{ id: '1', name: 'Manny', hcp: '18' }, { id: '2', name: 'Marty', hcp: '0' }];
        const scores = { p1_h1: hole1.par + 1, p2_h1: hole1.par };
        const both = run(`
            var live = skinsState({ skinsScoring: 'net', skinsBuyIn: 10, skinsCarryOver: true },
                ${J([hole1])}, ${J(scores)}, ${J(players)});
            var settle = computeSkinsCarryOverForSettle(${J(players)}, ${J([hole1])}, ${J(scores)}, 'net');
            return { liveAwards: live.awards.length, settleSkins: settle.skins.length };
        `);
        assert.equal(both.liveAwards, 0);
        assert.equal(both.settleSkins, 0, 'settlement and live must agree that this hole tied on net');
    });

    test('the buggy call signature is gone from the source', () => {
        // Comments stripped first: the fix is documented in a comment that necessarily
        // quotes the broken call, and asserting on prose would fail forever.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'bet-strip.js'), 'utf8')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/parseHcp\(p\.handicap\)/.test(src), 'the wrong field name is back');
        assert.ok(!/getStrokes\([^)]*,[^)]*,[^)]*\)/.test(src), 'getStrokes is being called with three arguments');
        assert.ok(/getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\)/.test(src));
    });

    test('handicap allocation itself was NOT changed', () => {
        const me = fs.readFileSync(path.join(REPO_ROOT, 'money-engine.js'), 'utf8');
        assert.ok(/function getStrokes\(hcpIndex, numericHcp\)/.test(me));
        assert.ok(/Math\.floor\(numericHcp \/ 18\)/.test(me));
    });
});

// ---------------------------------------------------------------------------
describe('GROSS VS NET, SCOPED', () => {
    test('gross and net can disagree, and both respect the participant list', () => {
        const players = makePlayers(['Manny', 'Marty', 'James', 'Stan'], [0, 18, 0, 0]);
        players.forEach(p => { p.playingForMoney = true; });
        const scores = {};
        CD.forEach(h => players.forEach(p => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        // Everyone makes par. On GROSS that is a three-way tie and no skin is won.
        // Marty is off 18 and receives a stroke on every hole, so on NET he is alone at
        // one under and wins outright. Same scores, opposite outcome - which is the
        // whole point of the gross/net choice.

        const mk = mode => ({
            gameFormat: 'stroke', players, courseData: CD, scores,
            additionalGames: {
                skins: {
                    enabled: true, skinsBuyIn: 10, skinsCarryOver: true, startHole: 1,
                    skinsScoring: mode, skinsPotFormat: mode,
                    participantIds: [players[0], players[1], players[2]].map(p => String(p.id))
                }
            }
        });
        const awardsFor = mode => run(`
            var D = ${J(mk(mode))}, C = ${J(CD)}, S = ${J(scores)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            var st = skinsState(g.config, gameHoles(g, C), S, fieldParticipants(g.config));
            return st.awards.filter(function(a){ return a.hole === 1; }).length;
        `);
        assert.equal(awardsFor('gross'), 0, 'three golfers on par is a tie, not a skin');
        assert.equal(awardsFor('net'), 1, 'the stroke should make Marty the outright winner');
    });
});

// ---------------------------------------------------------------------------
describe('MULTIPLE SIMULTANEOUS SKINS GAMES', () => {
    // The additional-game catalog is keyed by format, so a round holds one skins entry.
    // Two independent scoped games therefore need TWO round-level games, which the
    // current model cannot express. This is recorded honestly rather than pretended.
    test('the catalog is keyed by format — one skins entry per round today', () => {
        const keys = run(`return Object.keys(ADDITIONAL_GAME_CATALOG).join(',');`);
        assert.ok(keys.includes('skins'));
        const twice = run(`
            var D = { gameFormat: 'stroke', players: [{ id: 1, name: 'A' }],
                additionalGames: { skins: { enabled: true, skinsBuyIn: 5 } } };
            return getRoundGames(D).filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(twice, 1);
    });

    test('a skins game already chosen as the MAIN format is not double-counted', () => {
        const n = run(`
            var D = { gameFormat: 'skins', skinsBuyIn: 5, players: [{ id: 1, name: 'A' }],
                additionalGames: { skins: { enabled: true, skinsBuyIn: 10 } } };
            return getRoundGames(D).filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(n, 1, 'the same game must never settle twice');
    });
});

// ---------------------------------------------------------------------------
describe('SETTLEMENT INTEGRATION', () => {
    const r = round({
        names: ['Manny', 'Marty', 'James', 'Stan'],
        inIt: [0, 1, 2],
        scores: (s, p) => { s[`p${p[0].id}_h3`] = 3; s[`p${p[3].id}_h4`] = 2; }
    });

    test('combined settlement stays exactly zero-sum in whole dollars', () => {
        const totals = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var out = computeCombinedNetTotals(D, C, S);
            var res = {};
            Object.keys(out.netByName).forEach(function(k){ res[out.netByName[k].name] = out.netByName[k].net; });
            return res;
        `);
        assert.equal(sum(totals), 0, `combined settlement is not zero-sum: ${J(totals)}`);
    });

    test('a non-participant nets exactly $0 from a round whose only wager is scoped skins', () => {
        const totals = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var out = computeCombinedNetTotals(D, C, S);
            var res = {};
            Object.keys(out.netByName).forEach(function(k){ res[out.netByName[k].name] = out.netByName[k].net; });
            return res;
        `);
        assert.ok(!totals.Stan || totals.Stan === 0, `Stan should be flat, got ${totals.Stan}`);
    });

    test('Who Pays Who reconciles against the ledger', () => {
        const out = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            var o = computeCombinedNetTotals(D, C, S);
            var owed = 0;
            o.transactions.forEach(function(t){ owed += t.amount; });
            var winners = 0;
            Object.keys(o.netByName).forEach(function(k){
                if (o.netByName[k].net > 0) winners += o.netByName[k].net;
            });
            return { owed: owed, winners: winners, names: o.transactions.map(function(t){ return t.from + '>' + t.to; }) };
        `);
        assert.equal(out.owed, out.winners, 'transactions do not add up to what the winners are owed');
        assert.ok(!out.names.some(n => /Stan/.test(n)), 'Stan appears in a transaction he has no part in');
    });
});

// ---------------------------------------------------------------------------
describe('BACKWARD COMPATIBILITY', () => {
    test('an additional skins game with NO participantIds pays the whole field', () => {
        const r = round({ scores: (s, p) => { s[`p${p[0].id}_h3`] = 3; } });
        delete r.data.additionalGames.skins.participantIds;
        const net = skinsNet(r);
        assert.equal(Object.keys(net).length, 4, 'a legacy game stopped covering everyone');
        assert.ok(Math.abs(sum(net)) < 1e-9);
    });

    test('legacy gameFormat=skins is untouched by any of this', () => {
        const net = run(`
            var P = ${J(makePlayers(['A', 'B', 'C'], [0, 0, 0]).map(p => Object.assign(p, { playingForMoney: true })))};
            var C = ${J(CD)}; var S = {};
            C.forEach(function(h){ P.forEach(function(p){ S['p' + p.id + '_h' + h.hole] = h.par; }); });
            S['p' + P[0].id + '_h5'] = 3;
            var D = { gameFormat: 'skins', skinsBuyIn: 10, skinsCarryOver: true, players: P, courseData: C, scores: S };
            var g = getRoundGames(D)[0];
            return computeSkinsSettlementNet(g.config, gameHoles(g, C), S);
        `);
        assert.equal(Object.keys(net).length, 3);
        assert.ok(Math.abs(sum(net)) < 1e-9);
    });

    test('the settlement fallback survives if action-model never loaded', () => {
        // settlement-engine.js must degrade to whole-field behaviour, not throw.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'settlement-engine.js'), 'utf8');
        assert.ok(/typeof fieldParticipants === 'function'/.test(src));
    });

    test('no migration is required — participantIds is purely additive', () => {
        const adm = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        // Written only when the organizer actually narrowed the field.
        assert.ok(/chosen\.length > 0 && chosen\.length < everyone\.length/.test(adm),
            'a whole-group game must save no participantIds at all');
    });
});

// ---------------------------------------------------------------------------
describe('ROUND READY AND LIVE ACTION', () => {
    test('Round Ready names the golfers in a scoped game', () => {
        const r = round({ inIt: [0, 1, 2] });
        const desc = run(`
            var D = ${J(r.data)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            return describeGame(g);
        `);
        assert.ok(/Manny/.test(desc) && /Marty/.test(desc) && /James/.test(desc), desc);
        assert.ok(!/Stan/.test(desc), 'a golfer who is not in it was listed');
    });

    test('Round Ready falls back to a count once the list stops being scannable', () => {
        const r = round({
            names: ['A', 'B', 'C', 'D', 'E', 'F'], hcps: [0, 0, 0, 0, 0, 0],
            inIt: [0, 1, 2, 3, 4]
        });
        const desc = run(`
            var D = ${J(r.data)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            return describeGame(g);
        `);
        assert.match(desc, /5 players/);
    });

    test('a whole-group game says nothing extra — no noise where there is no scoping', () => {
        const r = round({});
        delete r.data.additionalGames.skins.participantIds;
        const desc = run(`
            var D = ${J(r.data)};
            var g = getRoundGames(D).find(function(x){ return x.format === 'skins'; });
            return describeGame(g);
        `);
        assert.equal(desc, 'Skins \u00B7 $10');
    });

    test('Live Action prices and decides the row over the participants only', () => {
        const r = round({
            inIt: [0, 1],
            scores: (s, p) => { s[`p${p[3].id}_h3`] = 2; }   // outsider goes low
        });
        const rows = run(`
            var D = ${J(r.data)}, C = ${J(CD)}, S = ${J(r.scores)};
            return buildActionRows(D, C, S, D.players, null)
                .filter(function(x){ return x.key === 'skins'; })
                .map(function(x){ return x.status; }).join('|');
        `);
        assert.ok(!/Stan/.test(rows), `an outsider reached the skins row: ${rows}`);
    });
});
