// ============================================================================
// POLISH 029 #2 / #16 - TWO GOLFERS, ONE FIRST NAME; NO STRAY PERIOD.
//
// #2: "Test A" and "Test B" read "Test v Test" / "Test +$5" on every short line,
//     because each line is cut from the name's first word (most of them inside
//     the engines, which this fix does not touch). text-safe.js now owns the
//     short name (golferShortName) and a display copy of the round
//     (roundDataForDisplay) that display callers hand the presenters.
// #16: a one-letter last name is already an initial: "Test A", never "Test A.".
//
// The money guard: the engines given the display copy price every segment,
// press and receipt exactly as they do from the stored round. Only labels move.
// And a round with no shared first name gets the SAME object back.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const T = require('./text-safe.js');

function engines() {
    const ctx = { console, Math, Date, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    ['handicap.js', 'player-tees.js', 'match-engine.js', 'text-safe.js', 'money-engine.js', 'action-model.js',
        'aloha-bet.js', 'hilo-engine.js', 'settlement-engine.js', 'side-match-lines.js', 'play-order.js'].forEach(f => {
        const p = path.join(ROOT, f);
        if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
    });
    return ctx;
}

function round(names) {
    const courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9], hcpIndex: ((i * 7) % 18) + 1 }));
    const players = names.map((n, i) => ({ id: String(101 + i), name: n, hcp: String([12, 5, 9, 3][i]), team: 'Team ' + (i + 1), playingForMoney: true }));
    const scores = {};
    players.forEach((p, i) => courseData.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par + ((h.hole + i) % 3 === 0 ? 1 : 0); }));
    return {
        gameFormat: 'stroke', courseData, players, scores,
        sideMatches: { N1: { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, stake: 5,
            frontStake: 5, backStake: 5, overallStake: 10, pressRule: '2down' } }
    };
}

test('#16: a one-letter last name keeps no period; a cut one keeps it', () => {
    const ab = [{ name: 'Test A' }, { name: 'Test B' }];
    assert.equal(T.getSmartDisplayName(ab[0], ab), 'Test A');
    assert.equal(T.getSmartDisplayName(ab[1], ab), 'Test B');
    const rr = [{ name: 'Randy Thompson' }, { name: 'Randy Cole' }];
    assert.equal(T.getSmartDisplayName(rr[0], rr), 'Randy T.');
    const mm = [{ name: 'Matt Mo' }, { name: 'Matt Ma' }];
    assert.equal(T.getSmartDisplayName(mm[0], mm), 'Matt Mo', 'initials collide too: the full name');
});

test('#16: the GPS-side and setup short names agree - no "Test A."', () => {
    ['gps-view.js', 'gps-bet.js', 'simple-flow.js'].forEach(f => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        assert.match(src, /golferShortName\(/, f + ' defers to text-safe.js');
        assert.doesNotMatch(src, /charAt\(0\)(\.toUpperCase\(\))? \+ '\.'/, f + ' never appends a bare dot');
    });
});

test('#2: golferShortName - first name alone unless it is shared in the round', () => {
    const ps = [{ id: 1, name: 'Test A' }, { id: 2, name: 'Test B' }, { id: 3, name: 'Mike Ross' }, { id: 4, name: 'Solo' }];
    assert.deepEqual(ps.map(p => T.golferShortName(p, ps)), ['Test A', 'Test B', 'Mike', 'Solo']);
    assert.deepEqual(T.golferShortNameMap(ps), { 1: 'Test A', 2: 'Test B' });
});

test('#2: roundDataForDisplay - the same object back when nobody shares a first name', () => {
    const d = round(['Ann Alpha', 'Ben Bravo']);
    assert.equal(T.roundDataForDisplay(d), d);
    assert.equal(T.playersForDisplay(d.players), d.players);
    const c = round(['Test A', 'Test B']);
    const shown = T.roundDataForDisplay(c);
    assert.notEqual(shown, c);
    assert.deepEqual(shown.players.map(p => p.name), ['Test A', 'Test B']);
    assert.deepEqual(c.players.map(p => p.name), ['Test A', 'Test B'], 'the stored round is never touched');
    assert.deepEqual(shown.players.map(p => p.id), c.players.map(p => p.id));
});

test('#2: the engines label "Test A" v "Test B" from the display copy - and price it to the cent the same', () => {
    const E = engines();
    const c = round(['Test A', 'Test B']);
    const shown = T.roundDataForDisplay(c);
    const cfg = E.nassauStakeConfig(c.sideMatches.N1);
    const run = (players) => E.calculateMatchEngine(players.map((p, i) => Object.assign({}, p, { team: 'Team ' + (i + 1) })),
        c.courseData, c.scores, 'net', 'nassau', '2down', 5, 0, [], cfg);
    const a = run(c.players), b = run(shown.players);
    assert.equal(a.t1Name, 'Test'); assert.equal(a.t2Name, 'Test');
    assert.equal(b.t1Name.replace(/ /g, ' '), 'Test A'); assert.equal(b.t2Name.replace(/ /g, ' '), 'Test B');
    assert.equal(b.t1TotalMoney, a.t1TotalMoney);
    assert.equal(b.pressCount, a.pressCount);
    assert.deepEqual(b.activeMatches.map(m => [m.id, m.status, m.closed, m.stake]), a.activeMatches.map(m => [m.id, m.status, m.closed, m.stake]));

    const ra = E.buildSideMatchReceipts(c, c.courseData, c.scores);
    const rb = E.buildSideMatchReceipts(shown, c.courseData, c.scores);
    assert.equal(ra.length, rb.length);
    const money = rs => JSON.stringify(rs, (k, v) => (k === 'nameA' || k === 'nameB' || k === 'netTo' || k === 'teamA' || k === 'teamB' || k === 'result' || k === 'finalResult' || k === 'label' || k === 'winner' || k === 'statusText') ? undefined : v);
    assert.equal(money(rb), money(ra), 'every figure in the receipt is the same');
    assert.equal(rb[0].nameA.replace(/ /g, ' '), 'Test A');
    assert.equal(rb[0].nameB.replace(/ /g, ' '), 'Test B');
    const sa = E.buildLiveMatchStates(c, c.courseData, c.scores), sb = E.buildLiveMatchStates(shown, c.courseData, c.scores);
    assert.deepEqual(sb.map(s => s.segments.map(g => [g.status, g.closed, g.stake])), sa.map(s => s.segments.map(g => [g.status, g.closed, g.stake])));
    assert.match(sb[0].t1Name + ' v ' + sb[0].t2Name, /^Test A v Test B$/);
});

test('#33: Settle up says "One payment settles everything" / "N payments settle everything"', () => {
    const src = fs.readFileSync(path.join(ROOT, 'gps-round.js'), 'utf8');
    assert.match(src, /'One payment settles' : tx\.length \+ ' payments settle'\) \+ ' everything'/);
    assert.doesNotMatch(src, /'One payment' : tx\.length \+ ' payments'\) \+ ' settle everything'/);
});
