'use strict';
// 100c MONEY ENGINE (2026-10-29 Manny typed OK: "OK all money-engine items (100c) incl. 2b").
// One test per item:
//   1. Wolf as a side game: from hole 7, the FIRST golfer picked is Wolf on hole 7, then
//      the rotation in pick order (k-th hole of gameHoles -> participantIds[k % 4]);
//      the instance's own wolfCalls; nothing before the start hole; main-game Wolf unchanged.
//   2. BBB from hole 7: a tap before the start hole never counts.
//   3. Vegas + BBB in Settle up for a NEW game (inSettle: true) - and NOT for an old-shaped
//      game (no inSettle), whose Settle up stays byte-identical.
//   4. Receipt, side match overallMode 'match': builds (no throw), net = Settle up.
//   5. 2b press line: a match from 7 with 7-9 in presses from 10 (was "hole 4").
const test = require('node:test');
const assert = require('node:assert');
const { loadJsFile } = require('./helpers/load-script.js');

const ENGINE = () => loadJsFile('settlement-engine.js', ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'play-order.js', 'bbb-engine.js', 'vegas-engine.js']);
const card = () => Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const players = () => [
    { id: '1', name: 'Test Ann', hcp: 0 }, { id: '2', name: 'Test Ben', hcp: 0 },
    { id: '3', name: 'Test Cal', hcp: 0 }, { id: '4', name: 'Test Dee', hcp: 0 }];
// scores[h] = [Ann, Ben, Cal, Dee]
function scoresFor(map, holes) {
    const s = {};
    holes.forEach(h => { const row = map[h] || [4, 4, 4, 4]; ['1', '2', '3', '4'].forEach((id, i) => { s[`p${id}_h${h}`] = row[i]; }); });
    return s;
}
const all18 = Array.from({ length: 18 }, (_, i) => i + 1);
const sumNet = r => Object.values(r.exact).reduce((a, p) => a + p.net, 0);
const lineLabels = (r, nameKey) => ((r.contributions[nameKey] || {}).lines || []).map(l => l.label);

// ---------------------------------------------------------------- 1. WOLF
const wolfRound = (extra) => Object.assign({
    gameFormat: 'stroke', players: players(), courseData: card(),
    // a round-level call that must NEVER leak into the instance
    wolfCalls: { h8: { call: 'blind' } },
    additionalGameInstances: {
        w1: { format: 'wolf', enabled: true, startHole: 7, createdAt: 1, wolfPointVal: 1,
              participantIds: ['3', '1', '4', '2'], wolfLoneMult: 2, wolfBlindMult: 3,
              wolfTieRule: 'carry', wolfLastPlaceRule: 'off', inSettle: true,
              wolfCalls: { h3: { call: 'lone' }, h7: { call: 'lone' }, h8: { call: 'partner', partnerId: '2' } } }
    }
}, extra || {});

test('1a Wolf from 7: first picked is Wolf on 7, then pick order (7,8,9,10 -> 0,1,2,3; 11 -> 0)', () => {
    const E = ENGINE();
    const round = wolfRound();
    const g = E.getRoundGames(round).find(x => x.format === 'wolf');
    assert.ok(g, 'getRoundGames builds the Wolf instance');
    assert.equal(g.startHole, 7);
    const holes = E.gameHoles(g, round.courseData);
    assert.deepEqual(holes.map(h => h.hole), all18.slice(6));
    const cfg = Object.assign({}, g.config, { players: E.fieldParticipants(g.config) });
    const calc = E.calcWolfEngine(cfg, holes, scoresFor({}, all18));
    const pick = ['3', '1', '4', '2'];
    [7, 8, 9, 10, 11, 12, 18].forEach((h, i) => {
        const k = h - 7;
        assert.equal(String(calc.holeLog[h].wolfId), pick[k % 4], `hole ${h} (k=${k}) Wolf = participantIds[${k % 4}]`);
    });
    assert.equal(calc.holeLog[3], undefined, 'nothing before the start hole');
    assert.equal(calc.holeLog[8].call, 'partner', 'instance calls, not the round-level blind call');
});

test('1b Wolf money: lone wolf Cal wins 7, team Ben+Ann wins 8 - zero-sum, labelled Wolf, hole 3 call ignored', () => {
    const E = ENGINE();
    const round = wolfRound();
    // h3: Ann would win a lone call there (must not count). h7: Cal (wolf) 3 vs 4s. h8: Ann wolf + Ben partner, Ben 3.
    const sc = scoresFor({ 3: [3, 4, 4, 4], 7: [4, 4, 3, 4], 8: [4, 3, 4, 4] }, all18);
    const r = E.computeCombinedNetTotals(round, round.courseData, sc);
    assert.ok(Math.abs(sumNet(r)) < 1e-9, 'zero-sum');
    assert.ok(lineLabels(r, 'test cal').includes('Wolf'));
    // points: Cal 2 (lone x2), Ann 1 + Ben 1 (pot 2 / 2), Dee 0. calcPointSettlement
    // (pairwise, $1/pt): Cal +4, Ann 0, Ben 0, Dee -4. The hole-3 lone call would have
    // given Ann 2 more points if it had counted.
    const net = n => (r.exact[n] || { net: 0 }).net;
    assert.equal(net('test cal'), 4);
    assert.equal(net('test dee'), -4);
    assert.equal(net('test ann'), 0);
    assert.equal(net('test ben'), 0);
});

test('1c Wolf guards: 3 golfers settle nothing; not offered in Round Setup / Add Action; legacy slot never builds it; main-game Wolf rotation unchanged', () => {
    const E = ENGINE();
    const three = wolfRound();
    three.additionalGameInstances.w1.participantIds = ['3', '1', '4'];
    const r = E.computeCombinedNetTotals(three, three.courseData, scoresFor({ 7: [4, 4, 3, 4] }, all18));
    assert.ok(!lineLabels(r, 'test cal').includes('Wolf'), 'Wolf with 3 is refused by the engine');
    assert.ok(!E.addableGames({ gameFormat: 'stroke' }).includes('wolf'));
    assert.equal(E.isSideGameOnlyFormat('wolf'), true);
    assert.equal(require('./action-model.js').ADDITIONAL_GAME_CATALOG.wolf.label, 'Wolf');
    const legacy = { gameFormat: 'stroke', players: players(), additionalGames: { wolf: { enabled: true, wolfPointVal: 1 } } };
    assert.equal(E.getRoundGames(legacy).filter(g => g.format === 'wolf').length, 0);
    // main-game Wolf (no wolfOrder): players[(hole-1) % 4] exactly as before
    const main = { gameFormat: 'wolf', players: players(), wolfCalls: {} };
    const calc = E.calcWolfEngine(main, card(), scoresFor({}, all18));
    assert.equal(String(calc.holeLog[7].wolfId), '3');
    assert.equal(String(calc.holeLog[1].wolfId), '1');
});

test('1d Wolf from 13 on a 10th-tee round: k-th hole in PLAY order (13..18, 1..9)', () => {
    const E = ENGINE();
    const round = wolfRound({ startingHole: 10 });
    round.additionalGameInstances.w1.startHole = 13;
    const g = E.getRoundGames(round).find(x => x.format === 'wolf');
    const holes = E.gameHoles(g, round.courseData);
    assert.deepEqual(holes.map(h => h.hole), [13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const cfg = Object.assign({}, g.config, { players: E.fieldParticipants(g.config) });
    const calc = E.calcWolfEngine(cfg, holes, scoresFor({}, all18));
    const pick = ['3', '1', '4', '2'];
    holes.forEach((h, k) => assert.equal(String(calc.holeLog[h.hole].wolfId), pick[k % 4], `hole ${h.hole}`));
});

// ---------------------------------------------------------------- 2. BBB
test('2 BBB from 7: a tap on hole 3 never counts; no startHole = every tap (unchanged)', () => {
    const B = require('./bbb-engine.js');
    const pts = { h3: { bingo: '1', bango: '1', bongo: '1' }, h8: { bingo: '2', bango: '2', bongo: '1' } };
    const from7 = B.calculateBBB({ bbbPointVal: 1, startHole: 7, participantIds: ['1', '2'], points: pts }, players());
    assert.deepEqual(from7.points, { 1: 1, 2: 2 });
    assert.equal(from7.holesPlayed, 1);
    assert.deepEqual(from7.net, { 1: -1, 2: 1 });
    const legacy = B.calculateBBB({ bbbPointVal: 1, participantIds: ['1', '2'], points: pts }, players());
    assert.deepEqual(legacy.points, { 1: 4, 2: 2 });
});

// ---------------------------------------------------------------- 3. VEGAS + BBB IN SETTLE UP
const vbRound = (inSettle) => {
    const flag = inSettle ? { inSettle: true } : {};
    return {
        gameFormat: 'stroke', players: players(), courseData: card(),
        additionalGameInstances: {
            v1: Object.assign({ format: 'vegas', enabled: true, startHole: 7, createdAt: 1, vegasPointVal: 1, vegasBirdieFlip: false,
                vegasTeamA: ['1', '2'], vegasTeamB: ['3', '4'], participantIds: ['1', '2', '3', '4'] }, flag),
            b1: Object.assign({ format: 'bbb', enabled: true, startHole: 7, createdAt: 2, bbbPointVal: 2, participantIds: ['1', '2', '3'],
                points: { h3: { bingo: '3', bango: '3', bongo: '3' }, h7: { bingo: '1', bango: '1', bongo: '2' } } }, flag)
        }
    };
};
// hole 2 (before start): B team would win big; hole 7: A 4+4=44 vs B 4+5=45 -> A +1 pt
const vbScores = () => scoresFor({ 2: [6, 6, 3, 3], 7: [4, 4, 4, 5] }, all18);

test('3a NEW Vegas + BBB (inSettle: true) are in Settle up, from the start hole, zero-sum, itemised', () => {
    const E = ENGINE();
    const round = vbRound(true);
    const r = E.computeCombinedNetTotals(round, round.courseData, vbScores());
    assert.ok(Math.abs(sumNet(r)) < 1e-9, 'zero-sum');
    const vegasLabel = 'Vegas · Test Ann/Test Ben vs Test Cal/Test Dee';
    const line = (n, label) => r.contributions[n].lines.filter(l => l.label === label).reduce((a, l) => a + l.amount, 0);
    assert.equal(line('test ann', vegasLabel), 1);
    assert.equal(line('test dee', vegasLabel), -1);
    // BBB from 7: Ann 2, Ben 1, Cal 0 (the h3 taps do not count); $2 x (3 x pts - 3)
    assert.equal(line('test ann', 'Bingo Bango Bongo'), 6);
    assert.equal(line('test ben', 'Bingo Bango Bongo'), 0);
    assert.equal(line('test cal', 'Bingo Bango Bongo'), -6);
    assert.deepEqual(r.netByName['test ann'] && r.netByName['test ann'].net, 7);
});

test('3b OLD-shaped Vegas + BBB (no inSettle) do NOT move Settle up: identical to the round without them', () => {
    const E = ENGINE();
    const old = vbRound(false);
    const none = Object.assign({}, old, { additionalGameInstances: {} });
    const a = E.computeCombinedNetTotals(old, old.courseData, vbScores());
    const b = E.computeCombinedNetTotals(none, none.courseData, vbScores());
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

// ---------------------------------------------------------------- 4. RECEIPT, overallMode 'match'
test('4 Receipt: stroke side match with overallMode match builds (no throw) and net = Settle up', () => {
    const E = ENGINE();
    const round = { gameFormat: 'stroke', players: players(), courseData: card(),
        sideMatches: { s1: { format: 'stroke', scoring: 'gross', teamAIds: ['1'], teamBIds: ['2'], overallStake: 10,
            overallMode: 'match', startHole: 1, createdAt: 1 } } };
    const sc = scoresFor({ 1: [3, 4, 4, 4], 2: [3, 4, 4, 4], 3: [5, 4, 4, 4] }, all18);
    let receipts;
    assert.doesNotThrow(() => { receipts = E.buildSideMatchReceipts(round, round.courseData, sc); });
    const rc = receipts[0];
    assert.equal(rc.segments[0].label, 'Overall match');
    assert.equal(rc.segments[0].result, 'Test 1 up');
    assert.equal(rc.net, 10);
    const r = E.computeCombinedNetTotals(round, round.courseData, sc);
    assert.equal(r.exact['test ann'].net, rc.net);
    assert.equal(r.exact['test ben'].net, -rc.net);
});

// ---------------------------------------------------------------- 5. 2b PRESS LINE
test('5 Press line (2b): match from 7 with 7-9 in presses from 10 (was 4); whole-round match unchanged', () => {
    const E = ENGINE();
    const sm = (startHole) => ({ format: 'match', scoring: 'gross', stake: 10, pressRule: 'anytime', teamAIds: ['1'], teamBIds: ['2'], startHole, createdAt: 1 });
    const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const round = { gameFormat: 'stroke', players: players(), sideMatches: { m7: sm(7), m1: sm(1) } };
    const sts = E.buildLiveMatchStates(round, card(), scoresFor({}, holes));
    const m7 = sts.find(s => s.wagerId === 'm7'), m1 = sts.find(s => s.wagerId === 'm1');
    assert.equal(m7.thru, 3);
    assert.equal(m7.canPress, true);
    assert.equal(m7.nextPressHole, 10);
    assert.equal(m1.thru, 9);
    assert.equal(m1.nextPressHole, 10);
    // all 18 in: nothing left to press
    const done = E.buildLiveMatchStates(round, card(), scoresFor({}, all18)).find(s => s.wagerId === 'm7');
    assert.equal(done.canPress, false);
    assert.equal(done.nextPressHole, null);
});

// ---------------------------------------------------------------- 6. DOTS dotTypes (KP / Birdies pots)
// Manny's OK relayed by the coordinator, 2026-10-29: "OK, add it in 100c".
const dotsRound = (dotTypes, dots) => ({
    gameFormat: 'stroke', players: players(), courseData: card(),
    dots: dots || {
        h3: { p1: ['greenie'], p2: ['birdie'] },                       // before the start hole
        h8: { p1: ['greenie'], p2: ['sandy'], p3: ['snake'] },
        h9: { p3: ['birdie'], p4: ['barkie'] },
        h10: { p4: ['eagle', 'birdie'] }
    },
    additionalGameInstances: {
        d1: Object.assign({ format: 'dots', enabled: true, startHole: 7, createdAt: 1, dotPointVal: 1 }, dotTypes ? { dotTypes } : {})
    }
});
const nets = r => { const o = {}; ['test ann', 'test ben', 'test cal', 'test dee'].forEach(k => { o[k] = (r.exact[k] || { net: 0 }).net; }); return o; };

test('6a Dots dotTypes KP-only pays only greenies, from the start hole', () => {
    const E = ENGINE();
    const kp = dotsRound(['greenie']);
    const only = dotsRound(null, { h8: { p1: ['greenie'] } });
    const a = E.computeCombinedNetTotals(kp, kp.courseData, scoresFor({}, all18));
    const b = E.computeCombinedNetTotals(only, only.courseData, scoresFor({}, all18));
    assert.deepEqual(nets(a), nets(b));
    assert.ok(nets(a)['test ann'] > 0, 'Ann\'s hole-8 greenie pays');
    assert.ok(Math.abs(sumNet(a)) < 1e-9);
    assert.equal(require('./action-model.js').ADDITIONAL_GAME_CATALOG.dots.typeFilter, true);
});

test('6b Dots dotTypes Birdies-only pays only birdie/eagle', () => {
    const E = ENGINE();
    const bd = dotsRound(['birdie', 'eagle']);
    const only = dotsRound(null, { h9: { p3: ['birdie'] }, h10: { p4: ['eagle', 'birdie'] } });
    const a = E.computeCombinedNetTotals(bd, bd.courseData, scoresFor({}, all18));
    const b = E.computeCombinedNetTotals(only, only.courseData, scoresFor({}, all18));
    assert.deepEqual(nets(a), nets(b));
    assert.equal(nets(a)['test ben'], nets(a)['test ann'], 'no greenie / sandy counted');
});

test('6c Dots with no dotTypes = every dot (unchanged), start hole still respected', () => {
    const E = ENGINE();
    const all = dotsRound(null);
    const g = E.getRoundGames(all).find(x => x.format === 'dots');
    assert.deepEqual(Object.keys(g.config.dots).sort(), ['h10', 'h8', 'h9'], 'h3 dropped by the start hole');
    assert.deepEqual(g.config.dots.h8, { p1: ['greenie'], p2: ['sandy'], p3: ['snake'] }, 'every type kept');
    assert.deepEqual(E.scopeDotsToTypes({ h8: { p1: ['greenie', 'sandy'] } }, ['greenie']), { h8: { p1: ['greenie'] } });
});
