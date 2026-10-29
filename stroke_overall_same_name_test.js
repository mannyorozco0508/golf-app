// ============================================================================
// 100a - STROKE OVERALL BET: PAY BY SIDE, NEVER BY NAME
//
// 099 found it: settlement-engine.js calculateOverallBetEngine -> segmentTotals
// stored the winner as a first-word name string and paid side A whenever
// `winner === nameA`. When both sides' first words match ("Test Ann" v
// "Test Cal", two "Mike"s, "Mike / Joe" v "Mike / Joe") a side-B win paid
// side A. 100a pays by side (seg.winSide 'A'/'B'); `winner` stays the display
// string.
//
// Every row below is checked three ways, and all three must agree:
//   * Settle up      computeCombinedNetTotals().exact (per golfer)
//   * Receipt        buildSideMatchReceipts() net / segment toSideA
//   * Bets page      bet-strip.js buildSideActionRows() netMoney
// and the same-name money must equal the distinct-name control's money, side
// for side, on the same scores. No Firebase, no GolfAPI.
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function realm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['text-safe.js', 'handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
     'pool-engine.js', 'settlement-engine.js', 'hilo-engine.js', 'side-match-lines.js', 'bet-strip.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const R = realm();
const plain = (v) => JSON.parse(JSON.stringify(v));

const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// players: [{id,name,hcp}], A/B: id lists, per-hole gross by id.
function run({ players, A, B, gross, scoring = 'gross', holeStake = 0, overallStake = 10,
               holePresses, overallPresses }) {
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores[`p${p.id}_h${h.hole}`] = gross[p.id]; }));
    const sm = { format: 'stroke', scoring, teamAIds: A.map(String), teamBIds: B.map(String),
                 startHole: 1, createdAt: 1, holeStake, overallStake, overallMode: 'stroke', segment: 'full' };
    if (holePresses) sm.holePresses = holePresses;
    if (overallPresses) sm.overallPresses = overallPresses;
    const data = { gameFormat: 'stroke', players, courseData: cd18, scores, sideMatches: { m1: sm } };
    const exact = plain(R.computeCombinedNetTotals(data, cd18, scores).exact);
    const byId = {};
    players.forEach(p => { byId[p.id] = (exact[p.name.trim().toLowerCase()] || {}).net || 0; });
    const rc = plain(R.buildSideMatchReceipts(data, cd18, scores).find(r => r.matchId === 'm1'));
    const row = plain(R.buildSideActionRows(data, cd18, scores, players, null).find(r => r.key === 'm1'));
    const shown = R.roundDataForDisplay(data);
    const rcShown = plain(R.buildSideMatchReceipts(shown, cd18, scores).find(r => r.matchId === 'm1'));
    const rowShown = plain(R.buildSideActionRows(shown, cd18, scores, shown.players, null).find(r => r.key === 'm1'));
    return { byId, rc, row, rcShown, rowShown };
}

const sideSum = (r, ids) => Math.round(ids.reduce((s, id) => s + r.byId[id], 0) * 100) / 100;

// The three surfaces agree, and the display copy moves no money.
function agree(r, A) {
    assert.equal(r.rc.net, sideSum(r, A), 'receipt net = Settle up side A');
    // The Bets row carries the OVERALL segments' decided money (bet-strip.js tally);
    // $/hole money is not part of that row today - unchanged by 100a.
    const overall = r.rc.segments.filter(sg => /^Overall/.test(sg.label))
        .reduce((n, sg) => n + (sg.toSideA ? sg.money : -sg.money), 0);
    assert.equal(r.row.netMoney, overall, 'Bets page money = receipt overall segments');
    assert.equal(r.rcShown.net, r.rc.net, 'display labels move no money (receipt)');
    assert.equal(r.rowShown.netMoney, r.row.netMoney, 'display labels move no money (Bets)');
}

const SAME_1V1 = [{ id: 101, name: 'Test Ann', hcp: '0' }, { id: 103, name: 'Test Cal', hcp: '0' }];
const MIKES = [{ id: 1, name: 'Mike S', hcp: '0' }, { id: 2, name: 'Mike T', hcp: '0' }];
const CTRL_1V1 = [{ id: 101, name: 'Ann Alpha', hcp: '0' }, { id: 103, name: 'Cal Bravo', hcp: '0' }];

// ---- 1v1, gross: A wins, B wins, tie ---------------------------------------
[['Test Ann/Test Cal', SAME_1V1], ['Mike S/Mike T', MIKES], ['control Ann Alpha/Cal Bravo', CTRL_1V1]].forEach(([tag, ps]) => {
    const [a, b] = ps.map(p => p.id);
    test(`1v1 gross ${tag}: B lower -> B paid $10`, () => {
        const r = run({ players: ps, A: [a], B: [b], gross: { [a]: 5, [b]: 4 } });
        assert.equal(r.byId[a], -10); assert.equal(r.byId[b], 10);
        assert.equal(r.rc.segments[0].toSideA, false);
        agree(r, [a]);
    });
    test(`1v1 gross ${tag}: A lower -> A paid $10`, () => {
        const r = run({ players: ps, A: [a], B: [b], gross: { [a]: 4, [b]: 5 } });
        assert.equal(r.byId[a], 10); assert.equal(r.byId[b], -10);
        assert.equal(r.rc.segments[0].toSideA, true);
        agree(r, [a]);
    });
    test(`1v1 gross ${tag}: tie -> push`, () => {
        const r = run({ players: ps, A: [a], B: [b], gross: { [a]: 4, [b]: 4 } });
        assert.equal(r.byId[a], 0); assert.equal(r.byId[b], 0);
        assert.equal(r.rc.net, 0);
        agree(r, [a]);
    });
});

// ---- net: the handicap flips the gross winner -------------------------------
test('1v1 net, same first word: money follows the NET totals, both directions', () => {
    [[SAME_1V1, CTRL_1V1], [MIKES, MIKES.map((p, i) => Object.assign({}, p, { name: ['Al One', 'Bo Two'][i] }))]].forEach(([same, ctrl]) => {
        [['36', '0', 5, 4], ['0', '36', 4, 5]].forEach(([ha, hb, ga, gb]) => {
            const mk = (ps) => ps.map((p, i) => Object.assign({}, p, { hcp: i === 0 ? ha : hb }));
            const s = mk(same), c = mk(ctrl);
            const [a, b] = s.map(p => p.id);
            const rs = run({ players: s, A: [a], B: [b], gross: { [a]: ga, [b]: gb }, scoring: 'net' });
            const rcn = run({ players: c, A: [c[0].id], B: [c[1].id], gross: { [c[0].id]: ga, [c[1].id]: gb }, scoring: 'net' });
            assert.deepEqual([rs.byId[a], rs.byId[b]], [rcn.byId[c[0].id], rcn.byId[c[1].id]], 'same name pays like distinct names');
            assert.notEqual(rs.rc.net, 0, 'the net row is decided');
            agree(rs, [a]);
        });
    });
});

// ---- 2v2 "Mike / Joe" v "Mike / Joe" ---------------------------------------
const MJ = [{ id: 1, name: 'Mike Smith', hcp: '0' }, { id: 2, name: 'Joe Adams', hcp: '0' },
            { id: 3, name: 'Mike Taylor', hcp: '0' }, { id: 4, name: 'Joe Brown', hcp: '0' }];
const MJ_CTRL = MJ.map((p, i) => Object.assign({}, p, { name: ['Al A', 'Bo B', 'Cy C', 'Di D'][i] }));
[['Mike / Joe v Mike / Joe', MJ], ['control', MJ_CTRL]].forEach(([tag, ps]) => {
    test(`2v2 gross ${tag}: B lower -> each B +$5, each A -$5`, () => {
        const r = run({ players: ps, A: [1, 2], B: [3, 4], gross: { 1: 5, 2: 5, 3: 4, 4: 6 } });
        assert.deepEqual([r.byId[1], r.byId[2], r.byId[3], r.byId[4]], [-5, -5, 5, 5]);
        agree(r, [1, 2]);
    });
    test(`2v2 gross ${tag}: A lower -> each A +$5`, () => {
        const r = run({ players: ps, A: [1, 2], B: [3, 4], gross: { 1: 4, 2: 6, 3: 5, 4: 5 } });
        assert.deepEqual([r.byId[1], r.byId[2], r.byId[3], r.byId[4]], [5, 5, -5, -5]);
        agree(r, [1, 2]);
    });
});

// ---- 2-in-4 side match in a foursome ---------------------------------------
test('2-in-4: Test Ben v Test Dee inside a Test foursome, Dee lower -> Dee paid, others $0', () => {
    const ps = [{ id: 1, name: 'Test Ann', hcp: '0' }, { id: 2, name: 'Test Ben', hcp: '0' },
                { id: 3, name: 'Test Cal', hcp: '0' }, { id: 4, name: 'Test Dee', hcp: '0' }];
    const r = run({ players: ps, A: [2], B: [4], gross: { 1: 4, 2: 5, 3: 4, 4: 4 } });
    assert.deepEqual([r.byId[1], r.byId[2], r.byId[3], r.byId[4]], [0, -10, 0, 10]);
    agree(r, [2]);
});

// ---- base + hole press + overall press -------------------------------------
test('presses: base + hole press + overall press pay side B like the distinct-name control', () => {
    const opts = { holeStake: 2, overallStake: 10,
                   holePresses: { h1: { fromHole: 10, newStake: 4 } },
                   overallPresses: { o1: { startHole: 10, stake: 20 } } };
    const s = run(Object.assign({ players: SAME_1V1, A: [101], B: [103], gross: { 101: 5, 103: 4 } }, opts));
    const c = run(Object.assign({ players: CTRL_1V1, A: [101], B: [103], gross: { 101: 5, 103: 4 } }, opts));
    assert.deepEqual([s.byId[101], s.byId[103]], [c.byId[101], c.byId[103]]);
    assert.ok(s.byId[103] > 30, 'B collects the overall, the overall press and the hole money');
    const overall = s.rc.segments.filter(sg => /^Overall/.test(sg.label));
    assert.equal(overall.length, 2);
    overall.forEach(sg => assert.equal(sg.toSideA, false, sg.label + ' goes to side B'));
    agree(s, [101]);
});

// ---- the 099 $/hole + overall combo row -------------------------------------
test('099 combo: $2/hole + $10 overall, Test Cal wins all 18 -> Ann -46, Cal +46', () => {
    const r = run({ players: SAME_1V1, A: [101], B: [103], gross: { 101: 5, 103: 4 }, holeStake: 2, overallStake: 10 });
    assert.equal(r.byId[101], -46);
    assert.equal(r.byId[103], 46);
    agree(r, [101]);
});

// ---- the engine field itself -------------------------------------------------
test('segmentTotals reports winSide; winner stays the display string', () => {
    const scores = {};
    cd18.forEach(h => { scores[`p101_h${h.hole}`] = 5; scores[`p103_h${h.hole}`] = 4; });
    const calc = R.calculateOverallBetEngine(SAME_1V1, cd18, scores,
        { overallEnabled: true, overallStake: 10, overallMode: 'stroke', scoringType: 'gross' }, []);
    assert.equal(calc.base.winSide, 'B');
    assert.equal(calc.base.winner, 'Test');
    assert.equal(calc.p1Money, -10);
});
