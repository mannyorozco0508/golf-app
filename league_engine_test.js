// ============================================================================
// POINTS LEAGUE (league-engine.js): the week's points from each group's 2 v 2
// Nassau, READ through the one match engine; overrides; standings and ties; the
// pot and who gets paid. Manny's worked example: 24 golfers, $480, 2 rounds.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'league-engine.js'));
const skip = ON ? false : 'Consumer tree: no Points League';
const { loadJsFile } = require('./helpers/load-script.js');
const L = ON ? require('./league-engine.js') : null;
const ME = ON ? loadJsFile('match-engine.js', ['handicap.js', 'text-safe.js']) : null;
const AM = ON ? loadJsFile('action-model.js') : null;

const HOLES = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
// The same call Side Bets makes (sidematches.html): teams as Team 1 / Team 2, the match's
// own holes, the Nassau's scoring, its stakes.
const calc = (sm, data) => {
    const byId = {}; (data.players || []).forEach((p) => { byId[String(p.id)] = p; });
    const t1 = sm.teamAIds.map((id) => Object.assign({}, byId[String(id)], { team: 'Team 1' }));
    const t2 = sm.teamBIds.map((id) => Object.assign({}, byId[String(id)], { team: 'Team 2' }));
    return ME.calculateMatchEngine(t1.concat(t2), AM.sideMatchHoles(sm, data.courseData || []), data.scores || {}, sm.scoring || 'net', 'nassau', sm.pressRule || 'none', 0, 0, [], { front: sm.frontStake, back: sm.backStake, overall: sm.overallStake });
};
const holesFor = (sm, data) => AM.sideMatchHoles(sm, data.courseData || []);

// A round: groups of four golfers (ids 101..), one 2 v 2 Nassau per group (1+2 v 3+4),
// and per group a hole-by-hole winner list ('A' | 'B' | 'H'), played thru `thru`.
function round(code, names, plan, thru) {
    const players = names.map((name, i) => ({ id: 101 + i, name, hcp: '0' }));
    const scores = {}, sideMatches = {};
    for (let g = 0; g < names.length / 4; g++) {
        const ids = [0, 1, 2, 3].map((k) => 101 + g * 4 + k);
        sideMatches['sm' + g] = { format: 'nassau', teamAIds: ids.slice(0, 2).map(String), teamBIds: ids.slice(2).map(String), scoring: 'net', frontStake: 5, backStake: 5, overallStake: 5, ownerGroup: g + 1, createdAt: g + 1 };
        const who = plan[g];
        for (let h = 1; h <= (thru || 18); h++) {
            const w = typeof who === 'function' ? who(h) : who;
            ids.forEach((id, k) => { scores['p' + id + '_h' + h] = (w === 'A' && k < 2) || (w === 'B' && k >= 2) ? 3 : 4; });
        }
    }
    return { code, label: code, data: { players, scores, sideMatches, courseData: HOLES } };
}
const names24 = Array.from({ length: 24 }, (_, i) => 'G' + String(i + 1).padStart(2, '0'));

test('a 2 v 2 Nassau read through the engine: sweep = 3 pts each, all halved = 1.5 each, front A / back B = 1.5 each (match halved)', { skip }, () => {
    const r = round('R1', names24.slice(0, 12), ['A', 'H', (h) => (h <= 9 ? 'A' : 'B')]);
    const st = L.leagueState({ league: { on: true } }, [r], calc, holesFor);
    const pts = Object.fromEntries(st.rows.map((x) => [x.name, x.pts]));
    assert.deepEqual([pts.G01, pts.G02, pts.G03, pts.G04], [3, 3, 0, 0]);
    assert.deepEqual([pts.G05, pts.G06, pts.G07, pts.G08], [1.5, 1.5, 1.5, 1.5]);
    assert.deepEqual([pts.G09, pts.G10, pts.G11, pts.G12], [1.5, 1.5, 1.5, 1.5]);
    const g1 = st.rows.find((x) => x.name === 'G01'), g3 = st.rows.find((x) => x.name === 'G03'), g9 = st.rows.find((x) => x.name === 'G09');
    assert.deepEqual([g1.w, g1.l, g1.h, g3.w, g3.l, g9.h], [1, 0, 0, 0, 1, 1]);
    assert.deepEqual(g1.matches[0].seg, { front: 'A', back: 'A', total: 'A' });
    assert.deepEqual(g1.matches[0].partner, ['G02']); assert.deepEqual(g1.matches[0].opponents, ['G03', 'G04']);
});

test('a round in progress: only decided segments count; a segment closed early counts at once', { skip }, () => {
    // A wins 1-5, then halves, thru 12: front A (5 up, 4 left: closed), back undecided, 18 not decided (5 up, 6 to play).
    const r = round('R1', names24.slice(0, 4), [(h) => (h <= 5 ? 'A' : 'H')], 12);
    const st = L.leagueState({ league: { on: true } }, [r], calc, holesFor);
    assert.deepEqual(st.matches[0].seg, { front: 'A', back: null, total: null });
    assert.equal(st.rows[0].pts, 1); assert.equal(st.rows[0].w + st.rows[0].l + st.rows[0].h, 0, 'no W/L/H until all three are decided');
});

test('only 2 v 2 Nassaus count; presses and other side bets are ignored; the round is never written to', { skip }, () => {
    const r = round('R1', names24.slice(0, 4), ['A']);
    r.data.sideMatches.x1 = { format: 'nassau', teamAIds: ['101'], teamBIds: ['103'], scoring: 'net' };
    r.data.sideMatches.x2 = { format: 'match', teamAIds: ['101', '102'], teamBIds: ['103', '104'], scoring: 'net' };
    r.data.sideMatches.sm0.pressRule = '2down';
    const before = JSON.stringify(r.data);
    const st = L.leagueState({ league: { on: true } }, [r], calc, holesFor);
    assert.equal(st.matches.length, 1);
    assert.equal(st.rows.find((x) => x.name === 'G01').pts, 3, 'presses add no points');
    assert.equal(JSON.stringify(r.data), before, 'read-only');
});

test('the organizer sets results by hand: an override per segment, and a match for a group with no Nassau', { skip }, () => {
    const r = round('R1', names24.slice(0, 8), ['A', 'A']);
    delete r.data.sideMatches.sm1;                       // group 2 set up no Nassau
    const league = { on: true, overrides: { 'R1~sm0': { back: 'B', total: 'H' }, 'manual~m1': { front: 'B', back: 'B', total: 'B' } },
        manual: { m1: { round: 'R1', group: 2, a: ['G05', 'G06'], b: ['G07', 'G08'] } } };
    const st = L.leagueState({ league }, [r], calc, holesFor);
    const pts = Object.fromEntries(st.rows.map((x) => [x.name, x.pts]));
    assert.deepEqual([pts.G01, pts.G03], [1.5, 1.5], 'front A (engine), back B + total halved (set by hand)');
    assert.deepEqual([pts.G05, pts.G07], [0, 3]);
    const m = st.matches.find((x) => x.id === 'R1~sm0');
    assert.deepEqual([m.seg, m.set], [{ front: 'A', back: 'B', total: 'H' }, { back: true, total: true }]);
});

test('standings: points over every round; tiebreak most matches won, then shared', { skip }, () => {
    // G01: W (3) + L (0) = 3 pts, 1 win. G05: H (1.5) + H (1.5) = 3 pts, 0 wins -> G01 above G05.
    const r1 = round('R1', ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08'], ['A', 'H']);
    const r2 = round('R2', ['G01', 'G03', 'G02', 'G04', 'G05', 'G07', 'G06', 'G08'], ['B', 'H']);
    const st = L.leagueState({ league: { on: true } }, [r1, r2], calc, holesFor);
    const row = (n) => st.rows.find((x) => x.name === n);
    assert.deepEqual([row('G01').pts, row('G01').w, row('G05').pts, row('G05').w], [3, 1, 3, 0]);
    assert.ok(row('G01').rank < row('G05').rank, 'most matches won breaks the tie');
    assert.equal(row('G05').rank, row('G06').rank, 'same points, same wins: shared');
});

test('the pot: $20 x golfers; 50/30/20; golfers tied on paid places split the places they cover; to the cent', { skip }, () => {
    const cfg = L.leagueConfig({ league: { on: true } });
    const rows = (pts) => L.leagueStandings([], cfg, pts.map((_, i) => 'P' + i)).map((r, i) => Object.assign(r, { pts: pts[i] }));
    const rank = (rs) => { rs.sort((a, b) => b.pts - a.pts); rs.forEach((r, i) => { r.rank = rs[i - 1] && rs[i - 1].pts === r.pts ? rs[i - 1].rank : i + 1; }); return rs; };
    let p = L.leaguePayouts(rank(rows([9, 8, 7, 1, 1, 1])), cfg);
    assert.deepEqual([p.potCents, p.placeCents], [12000, [6000, 3600, 2400]]);
    p = L.leaguePayouts(rank(rows([9, 9, 7, 1, 1, 1])), cfg);
    assert.deepEqual([p.payCents.P0, p.payCents.P1, p.payCents.P2], [4800, 4800, 2400], 'two tied for 1st split 1st + 2nd');
    p = L.leaguePayouts(rank(rows([9, 8, 7, 7, 7, 1])), cfg);
    assert.deepEqual([p.payCents.P2, p.payCents.P3, p.payCents.P4, p.payCents.P5], [800, 800, 800, 0], 'three tied for 3rd split 3rd (the 4th/5th places pay nothing)');
    assert.equal(Object.values(p.payCents).reduce((a, b) => a + b, 0), p.potCents, 'every cent of the pot');
    p = L.leaguePayouts(rank(rows([3, 2])), cfg);
    assert.deepEqual([p.potCents, p.payCents.P0, p.payCents.P1], [4000, 2500, 1500], 'two golfers: 50 / 30 re-scaled to the whole pot');
    const bad = L.leagueConfig({ league: { on: true, places: [50, 30] } });
    assert.equal(L.leaguePayouts(rank(rows([3, 2, 1])), bad).valid, false, 'places that do not add to 100% pay nothing');
    const odd = L.leagueConfig({ league: { on: true, buyIn: 10, places: [100 / 3, 100 / 3, 100 / 3] } });
    const po = L.leaguePayouts(rank(rows([3, 2, 1, 0, 0, 0, 0])), odd);
    assert.equal(po.placeCents.reduce((a, b) => a + b, 0), 7000);
});

test('MANNY\'S WORKED EXAMPLE: 24 golfers, $20 = $480; 2 rounds of six 2 v 2 Nassaus; partners change', { skip }, () => {
    // Round 1: groups of 4 in order (G01-G04, ...). Round 2: partners shuffled.
    const r1 = round('DAY1', names24, ['A', 'B', 'H', (h) => (h <= 9 ? 'A' : 'B'), 'A', (h) => (h <= 9 ? 'H' : 'A')]);
    const order2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 16, 20, 17, 21, 18, 22, 19, 23].map((i) => names24[i]);
    const r2 = round('DAY2', order2, ['A', 'A', 'B', 'H', (h) => (h <= 9 ? 'B' : 'A'), 'B']);
    const st = L.leagueState({ league: { on: true } }, [r1, r2], calc, holesFor);
    assert.equal(st.pay.potCents, 48000);
    assert.deepEqual(st.pay.placeCents, [24000, 14400, 9600]);
    const total = st.rows.reduce((a, r) => a + r.pts, 0);
    assert.equal(total, 2 * 6 * 3 * 2, 'every match hands out 3 points to each of 2 golfers: 6 a match x 6 matches x 2 rounds');
    assert.equal(Object.values(st.pay.payCents).reduce((a, b) => a + b, 0), 48000);
    if (process.env.LEAGUE_EXAMPLE) fs.writeFileSync(process.env.LEAGUE_EXAMPLE, JSON.stringify({ rows: st.rows.map((r) => ({ rank: r.rank, name: r.name, pts: r.pts, w: r.w, l: r.l, h: r.h, pay: (st.pay.payCents[r.name] || 0) / 100, m: r.matches.map((m) => m.label + ' ' + (m.side) + ' ' + m.partner.join('') + ' v ' + m.opponents.join('&') + ' ' + JSON.stringify(m.seg) + ' ' + m.pts) })), pot: st.pay.potCents / 100, places: st.pay.placeCents.map((c) => c / 100) }, null, 1));
});

test('rounds played BEFORE the league was set up count: nothing is stored per round, results are read whenever drawn', { skip }, () => {
    const r = round('R1', names24.slice(0, 4), ['A']);
    assert.equal(L.leagueState({}, [r], calc, holesFor), null, 'no league yet');
    const st = L.leagueState({ league: { on: true, at: Date.now() } }, [r], calc, holesFor);
    assert.equal(st.rows.find((x) => x.name === 'G01').pts, 3);
});

test('league players: as set, or everyone in any round by name; points only for league golfers', { skip }, () => {
    const r = round('R1', names24.slice(0, 4), ['A']);
    assert.deepEqual(L.leaguePlayers(L.leagueConfig({ league: { on: true } }), [r]), ['G01', 'G02', 'G03', 'G04']);
    const st = L.leagueState({ league: { on: true, players: ['G01', 'G03'] } }, [r], calc, holesFor);
    assert.deepEqual(st.rows.map((x) => x.name), ['G01', 'G03']);
    assert.equal(st.pay.potCents, 4000);
});

test('PURE and separate: no DOM, no database, no money engine but the match engine (read-only); not in the Consumer app', { skip }, () => {
    const s = fs.readFileSync(path.join(__dirname, 'league-engine.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/document\.|\.ref\(|firebase|settle|calculateMoney|calculateSettlement|trip-pots|tripPot/.test(s), 'no DOM / db / other engine');
});
