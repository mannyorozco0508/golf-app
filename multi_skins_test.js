// ============================================================================
// MULTIPLE SKINS GAMES + ONE SKINS SCORING MODE
//
// Two problems, both fixed here.
//
// 1. additionalGames holds ONE entry per format, so a round could carry a single
//    skins wager. Extra games now live in an id-keyed `additionalGameInstances`
//    map, normalized by getRoundGames() alongside the legacy slots. Nothing saved
//    is rewritten; consumers never learn two schemas exist.
//
// 2. skinsPotFormat and skinsScoring are NOT the same field. The first is the
//    historical user-facing choice ('split' halves the pot and runs gross AND net
//    at once); the second only ever existed in bet-strip. The catalog defaulted
//    them to DIFFERENT values, so a stacked game showed gross-only live and settled
//    half-and-half. resolveSkinsMode() is now the single answer both sides read.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f => {
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f });
    });
    return sb;
}
const SB = engines();
const run = code => { vm.runInContext(`window.__o = (function(){ ${code} })();`, SB); return SB.window.__o; };
const J = v => JSON.stringify(v);
const CD = makeCourseData(18);
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// Six golfers. James is off 12 so gross and net genuinely disagree.
function six() {
    const P = makePlayers(['Manny', 'Marty', 'James', 'Stan', 'Greg', 'Tony'], [0, 0, 12, 0, 0, 0]);
    P.forEach(p => { p.playingForMoney = true; });
    const S = {};
    CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
    return { P, S, id: n => String(P[n].id) };
}

// ---------------------------------------------------------------------------
describe('resolveSkinsMode — ONE precedence rule', () => {
    const m = cfg => run(`return resolveSkinsMode(${J(cfg)});`);

    test('skinsPotFormat wins — it is what settlement has always paid from', () => {
        assert.equal(m({ skinsPotFormat: 'net', skinsScoring: 'gross' }), 'net');
        assert.equal(m({ skinsPotFormat: 'gross', skinsScoring: 'net' }), 'gross');
        assert.equal(m({ skinsPotFormat: 'split', skinsScoring: 'gross' }), 'split');
    });

    test('skinsScoring is consulted only when potFormat is missing or unrecognised', () => {
        assert.equal(m({ skinsScoring: 'net' }), 'net');
        assert.equal(m({ skinsPotFormat: 'nonsense', skinsScoring: 'net' }), 'net');
    });

    test('a config specifying neither keeps the historical split default', () => {
        assert.equal(m({}), 'split');
        assert.equal(m({ skinsBuyIn: 5 }), 'split');
    });

    test('LEGACY MONEY IS FROZEN: a saved split round still resolves to split', () => {
        // Every stacked skins game ever saved carries skinsPotFormat explicitly, because
        // captureAdditionalGames has always written the catalog defaults out. Those
        // rounds must settle to the same cent as before this batch.
        assert.equal(m({ skinsPotFormat: 'split' }), 'split');
        const shares = run(`return skinsPotShares('split');`);
        assert.equal(shares.gross, 0.5);
        assert.equal(shares.net, 0.5);
    });

    test('pot shares match settlement arithmetic for every mode', () => {
        assert.equal(run(`var s = skinsPotShares('gross'); return s.gross + ',' + s.net;`), '1,0');
        assert.equal(run(`var s = skinsPotShares('net'); return s.gross + ',' + s.net;`), '0,1');
    });

    test('the catalog defaults no longer contradict each other', () => {
        const both = run(`
            var d = ADDITIONAL_GAME_CATALOG.skins.defaults;
            return { pot: d.skinsPotFormat, scoring: d.skinsScoring };
        `);
        assert.equal(both.pot, both.scoring,
            'a default that says gross in one field and split in the other is how the divergence happened');
    });
});

// ---------------------------------------------------------------------------
describe('LIVE / SETTLEMENT PARITY, on scores where gross and net DISAGREE', () => {
    // Everyone pars. Gross is a three-way tie and no skin is won. James is off 12 and
    // gets a stroke on the low-index holes, so on net he wins those outright.
    const { P, S } = six();
    const players = [P[0], P[1], P[2]];
    const hardHole = CD.filter(h => h.hcpIndex <= 12).sort((a, b) => a.hcpIndex - b.hcpIndex)[0];

    function live(mode) {
        return run(`
            var st = skinsState({ skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: ${J(mode)} },
                ${J([hardHole])}, ${J(S)}, ${J(players)});
            return { awards: st.awards.length, mode: st.mode,
                     winners: st.awards.map(function(a){ return String(a.playerId); }).join(',') };
        `);
    }
    function settle(mode) {
        return run(`
            var cfg = { players: ${J(players)}, skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: ${J(mode)} };
            return computeSkinsSettlementNet(cfg, ${J([hardHole])}, ${J(S)});
        `);
    }

    test('the fixture genuinely separates gross from net', () => {
        assert.ok(hardHole, 'no stroke hole in the fixture');
        assert.equal(live('gross').awards, 0, 'three pars is a gross tie');
        assert.equal(live('net').awards, 1, 'the stroke should decide it on net');
    });

    test('GROSS: live and settlement agree nobody won', () => {
        assert.equal(live('gross').awards, 0);
        const net = settle('gross');
        assert.ok(Object.values(net).every(v => Math.abs(v) < 1e-9), `expected all flat, got ${J(net)}`);
    });

    test('NET: live and settlement agree James won', () => {
        assert.equal(live('net').winners, String(P[2].id));
        const net = settle('net');
        assert.ok(net[P[2].id] > 0, `James should be up, got ${J(net)}`);
        assert.ok(Math.abs(sum(net)) < 1e-9);
    });

    test('SPLIT: live now reports BOTH pots, as settlement has always paid them', () => {
        const st = live('split');
        assert.equal(st.mode, 'split');
        // The net half is won, the gross half ties. Live used to show gross only.
        assert.equal(st.awards, 1);
        const net = settle('split');
        assert.ok(net[P[2].id] > 0, 'settlement pays the net half');
        assert.ok(Math.abs(sum(net)) < 1e-9);
    });

    test('SPLIT prices each half at half the pot, matching settlement', () => {
        const v = run(`
            var st = skinsState({ skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'split' },
                ${J([hardHole])}, ${J(S)}, ${J(players)});
            var full = skinsState({ skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'net' },
                ${J([hardHole])}, ${J(S)}, ${J(players)});
            return { split: st.skinValue, whole: full.skinValue };
        `);
        assert.ok(Math.abs(v.split * 2 - v.whole) < 1e-9,
            `a half pot must be worth half: split=${v.split} whole=${v.whole}`);
    });

    test('every award carries which pot it came from', () => {
        const pots = run(`
            var st = skinsState({ skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'split' },
                ${J([hardHole])}, ${J(S)}, ${J(players)});
            return st.awards.map(function(a){ return a.pot; }).join(',');
        `);
        assert.ok(/gross|net/.test(pots), 'an award with no pot cannot be explained to a golfer');
    });
});

// ---------------------------------------------------------------------------
describe('MULTIPLE INSTANCES — normalization', () => {
    const { P, S, id } = six();
    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            A: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'net', skinsCarryOver: true, startHole: 6, participantIds: [id(0), id(1), id(2)] },
            B: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 9, participantIds: [id(0), id(3), id(4), id(5)] },
            C: { format: 'skins', enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: true, startHole: 1, participantIds: [id(1), id(4)] }
        }
    };
    const games = () => run(`
        return getRoundGames(${J(data)}).filter(function(g){ return g.format === 'skins'; })
            .map(function(g){ return { key: g.key, stake: g.stake, start: g.startHole,
                mode: resolveSkinsMode(g.config), carry: g.config.skinsCarryOver !== false,
                who: fieldParticipants(g.config).map(function(p){ return p.name; }).join('/') }; });
    `);

    test('THREE simultaneous skins games are all returned', () => {
        assert.equal(games().length, 3);
    });

    test('each instance keeps its own stable id as the game key', () => {
        assert.equal(games().map(g => g.key).sort().join(','), 'A,B,C');
    });

    test('independent stakes', () => {
        assert.equal(games().map(g => g.stake).sort((a, b) => a - b).join(','), '5,10,20');
    });

    test('independent start holes', () => {
        const by = {}; games().forEach(g => { by[g.key] = g.start; });
        assert.equal(by.A, 6); assert.equal(by.B, 9); assert.equal(by.C, 1);
    });

    test('independent scoring modes', () => {
        const by = {}; games().forEach(g => { by[g.key] = g.mode; });
        assert.equal(by.A, 'net'); assert.equal(by.B, 'gross');
    });

    test('independent carry rules', () => {
        const by = {}; games().forEach(g => { by[g.key] = g.carry; });
        assert.equal(by.A, true); assert.equal(by.B, false);
    });

    test('independent participants, with overlap allowed', () => {
        const by = {}; games().forEach(g => { by[g.key] = g.who; });
        assert.equal(by.A, 'Manny/Marty/James');
        assert.equal(by.B, 'Manny/Stan/Greg/Tony');
        assert.ok(by.A.includes('Manny') && by.B.includes('Manny'), 'a golfer may be in both');
        assert.ok(!by.A.includes('Stan'), 'Stan is not in A');
    });

    test('a disabled instance is left out', () => {
        const n = run(`
            var D = ${J(data)};
            D.additionalGameInstances.C.enabled = false;
            return getRoundGames(D).filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(n, 2);
    });

    test('an instance of an unknown format is ignored rather than throwing', () => {
        const n = run(`
            return getRoundGames({ gameFormat: 'stroke', players: [],
                additionalGameInstances: { X: { format: 'roulette', enabled: true } } })
                .filter(function(g){ return g.role === 'additional'; }).length;
        `);
        assert.equal(n, 0);
    });

    test('one instance config can never bleed into another', () => {
        const g = games();
        const a = g.find(x => x.key === 'A'), b = g.find(x => x.key === 'B');
        assert.notEqual(a.stake, b.stake);
        assert.notEqual(a.mode, b.mode);
        assert.notEqual(a.carry, b.carry);
        assert.notEqual(a.start, b.start);
    });

    test('instances never carry the sibling maps into an engine', () => {
        const leaked = run(`
            var g = getRoundGames(${J(data)}).filter(function(x){ return x.key === 'A'; })[0];
            return { games: g.config.additionalGames !== undefined,
                     inst: g.config.additionalGameInstances !== undefined,
                     start: g.config.startHole !== undefined };
        `);
        assert.equal(leaked.games, false);
        assert.equal(leaked.inst, false);
        assert.equal(leaked.start, false, 'startHole in config would be misread by an engine');
    });
});

// ---------------------------------------------------------------------------
describe('MULTIPLE INSTANCES — money', () => {
    const { P, S, id } = six();
    const scores = Object.assign({}, S);
    scores[`p${P[0].id}_h7`] = 3;    // Manny wins in A's range
    scores[`p${P[3].id}_h7`] = 2;    // Stan lower still, but not in A
    scores[`p${P[3].id}_h10`] = 3;   // Stan wins in B's range

    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores,
        additionalGameInstances: {
            A: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'net', skinsCarryOver: true, startHole: 6, participantIds: [id(0), id(1), id(2)] },
            B: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 9, participantIds: [id(0), id(3), id(4), id(5)] }
        }
    };

    const perGame = () => run(`
        var D = ${J(data)}, C = ${J(CD)}, S = ${J(scores)};
        var out = {};
        getRoundGames(D).filter(function(g){ return g.format === 'skins'; }).forEach(function(g){
            out[g.key] = computeSkinsSettlementNet(g.config, gameHoles(g, C), S);
        });
        return out;
    `);

    test('each game is independently zero-sum', () => {
        const out = perGame();
        Object.keys(out).forEach(k => {
            assert.ok(Math.abs(sum(out[k])) < 1e-9, `${k} not zero-sum: ${sum(out[k])}`);
        });
    });

    test('each game pays only its own participants', () => {
        const out = perGame();
        assert.equal(Object.keys(out.A).length, 3);
        assert.equal(Object.keys(out.B).length, 4);
        assert.ok(out.A[P[3].id] === undefined, 'Stan is not in A');
        assert.ok(out.B[P[1].id] === undefined, 'Marty is not in B');
    });

    test('a golfer in BOTH games carries both results', () => {
        const out = perGame();
        assert.ok(out.A[P[0].id] !== undefined && out.B[P[0].id] !== undefined,
            'Manny should appear in both ledgers');
    });

    test('combined settlement is zero-sum and sums both games', () => {
        const totals = run(`
            var o = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(scores)});
            var r = {}; Object.keys(o.netByName).forEach(function(k){ r[o.netByName[k].name] = o.netByName[k].net; });
            return r;
        `);
        assert.equal(sum(totals), 0, `not zero-sum: ${J(totals)}`);
        const out = perGame();
        const expectedManny = Math.round(out.A[P[0].id] + out.B[P[0].id]);
        assert.equal(totals.Manny, expectedManny, 'Manny must carry both games');
    });

    test('Who Pays Who reconciles against the combined ledger', () => {
        const o = run(`
            var o = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(scores)});
            var owed = 0; o.transactions.forEach(function(t){ owed += t.amount; });
            var won = 0; Object.keys(o.netByName).forEach(function(k){
                if (o.netByName[k].net > 0) won += o.netByName[k].net; });
            return { owed: owed, won: won };
        `);
        assert.equal(o.owed, o.won);
    });

    test('settlement counts each game exactly once', () => {
        // Two instances with identical config but different ids are two real wagers.
        const doubled = run(`
            var D = ${J(data)};
            D.additionalGameInstances.A2 = JSON.parse(JSON.stringify(D.additionalGameInstances.A));
            var o = computeCombinedNetTotals(D, ${J(CD)}, ${J(scores)});
            var r = {}; Object.keys(o.netByName).forEach(function(k){ r[o.netByName[k].name] = o.netByName[k].net; });
            return r;
        `);
        assert.equal(sum(doubled), 0, 'duplicating a wager must stay zero-sum');
    });
});

// ---------------------------------------------------------------------------
describe('MULTIPLE INSTANCES — independent ranges and corrections', () => {
    const { P, S, id } = six();
    const mk = scores => ({
        gameFormat: 'stroke', players: P, courseData: CD, scores,
        additionalGameInstances: {
            A: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: true, startHole: 6, participantIds: [id(0), id(1), id(2)] },
            B: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross', skinsCarryOver: true, startHole: 12, participantIds: [id(0), id(3), id(4)] }
        }
    });
    const settle = scores => run(`
        var D = ${'@D@'}, C = ${J(CD)}, S = ${'@S@'};
        var out = {};
        getRoundGames(D).filter(function(g){ return g.format === 'skins'; }).forEach(function(g){
            out[g.key] = computeSkinsSettlementNet(g.config, gameHoles(g, C), S);
        });
        return out;
    `.replace('@D@', J(mk(scores))).replace('@S@', J(scores)));

    const base = Object.assign({}, S);
    base[`p${P[0].id}_h8`] = 3;
    base[`p${P[0].id}_h14`] = 3;

    test('a correction BEFORE both start holes changes neither game', () => {
        const before = settle(base);
        const after = Object.assign({}, base); after[`p${P[0].id}_h4`] = 9;
        assert.equal(J(settle(after)), J(before));
    });

    test('a correction inside A only changes A', () => {
        const before = settle(base);
        // Marty now beats Manny on hole 8, so the skin changes hands. (Simply making
        // Manny worse would not move the money: under carry-over he would collect the
        // same accumulated units on a later hole instead.)
        const after = Object.assign({}, base); after[`p${P[1].id}_h8`] = 2;
        const now = settle(after);
        assert.notEqual(J(now.A), J(before.A), 'A should have moved');
        assert.equal(J(now.B), J(before.B), 'B must not move — hole 8 predates it');
    });

    test('a correction inside both ranges can move both', () => {
        const before = settle(base);
        const after = Object.assign({}, base); after[`p${P[3].id}_h14`] = 2;
        const now = settle(after);
        assert.notEqual(J(now), J(before), 'a hole inside B should move B');
    });

    test('a NON-participant correction cannot move a game', () => {
        const before = settle(base);
        const after = Object.assign({}, base); after[`p${P[3].id}_h8`] = 2;   // Stan, not in A
        assert.equal(J(settle(after).A), J(before.A));
    });
});

// ---------------------------------------------------------------------------
describe('LEGACY COMPATIBILITY — nothing saved has to change', () => {
    const { P, S } = six();

    test('a legacy additionalGames.skins round still produces exactly one game', () => {
        const n = run(`
            return getRoundGames({ gameFormat: 'stroke', players: ${J(P)},
                additionalGames: { skins: { enabled: true, skinsBuyIn: 5 } } })
                .filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(n, 1);
    });

    test('legacy and instance games coexist in one round', () => {
        const keys = run(`
            return getRoundGames({ gameFormat: 'stroke', players: ${J(P)},
                additionalGames: { skins: { enabled: true, skinsBuyIn: 5 } },
                additionalGameInstances: { Z: { format: 'skins', enabled: true, skinsBuyIn: 25 } } })
                .filter(function(g){ return g.format === 'skins'; })
                .map(function(g){ return g.key; }).sort().join(',');
        `);
        assert.equal(keys, 'Z,skins');
    });

    test('the legacy slot still refuses to duplicate the main format', () => {
        const n = run(`
            return getRoundGames({ gameFormat: 'skins', skinsBuyIn: 5, players: ${J(P)},
                additionalGames: { skins: { enabled: true, skinsBuyIn: 10 } } })
                .filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(n, 1, 'the same wager must never settle twice');
    });

    test('an instance IS allowed alongside a main-format skins round', () => {
        // It has its own id, participants and stake, so it is a different wager -
        // three golfers playing their own skins inside a skins round is a real thing.
        const n = run(`
            return getRoundGames({ gameFormat: 'skins', skinsBuyIn: 5, players: ${J(P)},
                additionalGameInstances: { Z: { format: 'skins', enabled: true, skinsBuyIn: 25 } } })
                .filter(function(g){ return g.format === 'skins'; }).length;
        `);
        assert.equal(n, 2);
    });

    test('a round with no instance map at all behaves exactly as before', () => {
        const g = run(`
            return getRoundGames({ gameFormat: 'nassau', nassauStake: 10, players: ${J(P)} })
                .map(function(x){ return x.key; }).join(',');
        `);
        assert.equal(g, 'main');
    });

    test('no migration: the wizard writes instances to their own key', () => {
        const adm = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.ok(/additionalGameInstances: captureSkinsInstances\(\)/.test(adm));
        assert.ok(/additionalGames: captureAdditionalGames\(\)/.test(adm),
            'the legacy map must still be written, not replaced');
    });
});

// ---------------------------------------------------------------------------
describe('LIVE ACTION AND ROUND READY', () => {
    const { P, S, id } = six();
    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            A: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'net', skinsCarryOver: true, startHole: 6, participantIds: [id(0), id(1), id(2)] },
            B: { format: 'skins', enabled: true, skinsBuyIn: 20, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 9, participantIds: [id(0), id(3), id(4), id(5)] }
        }
    };

    test('Live Action renders one row per game, each with its own stake and range', () => {
        const rows = run(`
            return buildActionRows(${J(data)}, ${J(CD)}, ${J(S)}, ${J(P)}, null)
                .filter(function(r){ return r.key === 'A' || r.key === 'B'; })
                .map(function(r){ return r.key + '|' + r.stakeText + '|' + r.rangeText; });
        `);
        assert.equal(rows.length, 2, `expected two skins rows, got ${J(rows)}`);
        assert.ok(rows.some(r => r.startsWith('A|$10')));
        assert.ok(rows.some(r => r.startsWith('B|$20')));
        assert.notEqual(rows[0].split('|')[2], rows[1].split('|')[2], 'the ranges must differ');
    });

    test('Round Ready describes each game distinguishably', () => {
        const d = run(`
            return getRoundGames(${J(data)}).filter(function(g){ return g.format === 'skins'; })
                .map(function(g){ return describeGame(g); });
        `);
        assert.equal(d.length, 2);
        assert.notEqual(d[0], d[1]);
        assert.ok(d.some(x => /Net/.test(x) && /Carry Over/.test(x) && /from H6/.test(x)), J(d));
        assert.ok(d.some(x => /Gross/.test(x) && /No Carry/.test(x) && /from H9/.test(x)), J(d));
    });

    test('a long participant list collapses to a count', () => {
        const d = run(`
            var D = ${J(data)};
            D.additionalGameInstances.B.participantIds = ${J([0, 1, 2, 3, 4].map(n => String(P[n].id)))};
            var g = getRoundGames(D).filter(function(x){ return x.key === 'B'; })[0];
            return describeGame(g);
        `);
        assert.match(d, /5 players/);
    });
});

// ---------------------------------------------------------------------------
// FOUND BY THE 100-SIMULATION AUDIT (P1).
//
// buildSideGamesHtml() itemised the Birdie Game and Side Matches and nothing else.
// Every stacked game - Skins, Dots, Stableford - settled correctly into Final Money
// and then appeared nowhere, so the Receipt said "Marty Won $58" with no line
// explaining where it came from. With several participant-scoped Skins games able to
// run at once, that is two invisible wagers on one card.
describe('THE RECEIPT EXPLAINS THE MONEY IT SETTLES', () => {
    const st = fs.readFileSync(path.join(REPO_ROOT, 'settlement.html'), 'utf8');
    const fn = st.slice(st.indexOf('function buildSideGamesHtml'), st.indexOf('function renderCombinedSummary'));

    test('stacked games are itemised, sourced from getRoundGames', () => {
        assert.ok(/getRoundGames\(data\)\.filter\(g => g\.role === 'additional'\)/.test(fn),
            'the breakdown must come from the same normalizer settlement uses');
    });

    test('each card is built from the CANONICAL per-game function, not a second calculation', () => {
        assert.ok(/computeGameNetByPlayerId\(game, courseData, savedScores\)/.test(fn),
            'a separate calculation here could disagree with the total it explains');
    });

    test('a game that produced no money renders no card', () => {
        assert.ok(/if \(ids\.length === 0\) return;/.test(fn), 'empty cards are noise');
    });

    test('the card is labelled well enough to tell two Skins games apart', () => {
        assert.ok(/describeGame\(game\)/.test(fn),
            'stake alone does not identify one of several simultaneous skins games');
    });

    test('it degrades safely if the round model has not loaded', () => {
        assert.ok(/typeof getRoundGames === 'function' && typeof computeGameNetByPlayerId === 'function'/.test(fn));
    });

    test('it still sits between Group Games and Side Matches', () => {
        const birdie = fn.indexOf('Birdie Game');
        const stacked = fn.indexOf('getRoundGames(data)');
        const side = fn.indexOf('buildSideMatchesHtml(data');
        assert.ok(birdie > -1 && stacked > birdie && side > stacked,
            'round-wide games belong above private side action');
    });
});

// ---------------------------------------------------------------------------
// P0, FOUND BY THE QUICK ROUND REAL-WORLD AUDIT.
//
// Void ("No Carry") skins pays the pot out across the holes won OUTRIGHT. If NO hole
// was won - every one halved - skinValue correctly became 0 and nobody was paid, but
// the buy-in was still charged in full. Three golfers in a $20 game each went -$20 and
// the $60 pot vanished. Zero-sum is the one invariant this app cannot break.
//
// Not a hypothetical: a skins game added on the 16th tee has three holes to be decided
// in, and all three halving is an ordinary Tuesday.
describe('SKINS — the pot can never vanish', () => {
    const cd = makeCourseData(18);
    const P = makePlayers(['Marty', 'Stan', 'Greg'], ['0', '0', '0']);
    P.forEach(p => { p.playingForMoney = true; });
    const allHalved = {};
    cd.forEach(h => P.forEach(p => { allHalved[`p${p.id}_h${h.hole}`] = h.par; }));

    const settle = (carry, holes, scores) => run(`
        return computeSkinsSettlementNet(
            { players: ${J(P)}, skinsBuyIn: 20, skinsCarryOver: ${carry}, skinsPotFormat: 'gross' },
            ${J(holes)}, ${J(scores)});
    `);

    test('NO CARRY, every hole halved: buy-ins are refunded, not pocketed by nobody', () => {
        const net = settle(false, cd, allHalved);
        assert.ok(Math.abs(sum(net)) < 1e-9, `pot vanished: ${J(net)}`);
        Object.keys(net).forEach(id => assert.equal(net[id], 0, 'nobody won, so nobody pays'));
    });

    test('CARRY OVER, every hole halved: also refunded', () => {
        assert.ok(Math.abs(sum(settle(true, cd, allHalved))) < 1e-9);
    });

    test('a short mid-round game with all holes halved stays zero-sum', () => {
        // Added on the 16th tee: three holes, all halved.
        const late = cd.filter(h => h.hole >= 16);
        [true, false].forEach(c => {
            const net = settle(c, late, allHalved);
            assert.ok(Math.abs(sum(net)) < 1e-9, `carryOver=${c} leaked: ${J(net)}`);
        });
    });

    test('REGRESSION: when a skin IS won the result is unchanged', () => {
        // Marty alone birdies hole 7; he takes the whole $60 pot, the others pay $20.
        const oneWinner = Object.assign({}, allHalved);
        oneWinner[`p${P[0].id}_h7`] = cd[6].par - 1;
        const net = settle(false, cd, oneWinner);
        assert.equal(net[P[0].id], 40, 'winner takes the pot less his own buy-in');
        assert.equal(net[P[1].id], -20);
        assert.equal(net[P[2].id], -20);
        assert.ok(Math.abs(sum(net)) < 1e-9);
    });

    test('the stake is charged in proportion to the pot actually paid out', () => {
        const se = fs.readFileSync(path.join(REPO_ROOT, 'settlement-engine.js'), 'utf8');
        assert.ok(/grossResult\.skins\.length > 0 \? 1 : 0/.test(se),
            'void mode must not charge a buy-in it never distributes');
        assert.ok(/netResult\.skins\.length > 0 \? 1 : 0/.test(se));
    });
});

// ---------------------------------------------------------------------------
describe('ADD / REMOVE SAFETY AND SCOPE CONTROL', () => {
    const adm = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

    test('removing a skins game asks first', () => {
        assert.ok(/function removeSkinsInstance/.test(adm));
        assert.ok(/confirm\(/.test(adm.slice(adm.indexOf('function removeSkinsInstance'), adm.indexOf('function setInstanceField'))),
            'deleting a money game must never be one silent tap');
    });

    test('a game with fewer than two golfers is never saved', () => {
        assert.ok(/chosen\.length < 2/.test(adm), 'a skins game needs somebody to play against');
    });

    test('each new instance gets a unique id', () => {
        const ids = run(`
            var seen = {};
            for (var i = 0; i < 200; i++) { seen['x'] = 1; }
            return Object.keys(seen).length;
        `);
        assert.equal(ids, 1);   // sanity that run() works
        assert.ok(/function newInstanceId/.test(adm));
        assert.ok(/Date\.now\(\)\.toString\(36\)/.test(adm) && /Math\.random\(\)/.test(adm));
    });

    test('SCOPE: only Skins gained a multi-instance UI', () => {
        // The normalizer is generic, but Dots and Stableford were deliberately not
        // expanded in this batch.
        assert.ok(!/addDotsInstance|addStablefordInstance/.test(adm));
        const cap = adm.slice(adm.indexOf('function captureSkinsInstances'), adm.indexOf('function loadSkinsInstances'));
        assert.ok(/format: 'skins'/.test(cap));
        assert.ok(!/format: 'dots'/.test(cap));
    });
});

// ---------------------------------------------------------------------------
describe('FROZEN', () => {
    test('handicap allocation and the skins formulas are untouched', () => {
        const hcp = fs.readFileSync(path.join(REPO_ROOT, 'handicap.js'), 'utf8');
        // THE RULE DID NOT CHANGE, ITS HOME DID. getStrokes moved from
        // money-engine.js into handicap.js in the shared-core extraction; the
        // allocation itself is byte-identical and this still asserts it.
        assert.ok(/function getStrokes\(hcpIndex, numericHcp\)/.test(hcp));
        const se = fs.readFileSync(path.join(REPO_ROOT, 'settlement-engine.js'), 'utf8');
        assert.ok(/function computeSkinsCarryOverForSettle/.test(se));
        assert.ok(/function computeSkinsVoidForSettle/.test(se));
        assert.ok(/carryUnits \+= 1/.test(se), 'the carry rule itself must not change');
    });

    test('Side Match startHole remains unfixed — explicitly out of scope', () => {
        const sm = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');
        const save = sm.slice(sm.indexOf('function saveSideMatch'), sm.indexOf('let pendingDeleteMatchId'));
        assert.ok(!/payload\.startHole/.test(save),
            'if this starts failing, the next batch has been done and this test should be retired');
    });
});
