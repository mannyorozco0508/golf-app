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

test('2 v 2 Nassaus and 2 v 2 match-play bets give the sides (Manny: "from its Nassau/match"); 1 v 1 and presses ignored in a four-ball round; the round is never written to', { skip }, () => {
    const r = round('R1', names24.slice(0, 4), ['A']);
    r.data.sideMatches.x1 = { format: 'nassau', teamAIds: ['101'], teamBIds: ['103'], scoring: 'net' };
    r.data.sideMatches.x2 = { format: 'match', teamAIds: ['101', '102'], teamBIds: ['103', '104'], scoring: 'net' };
    r.data.sideMatches.sm0.pressRule = '2down';
    const before = JSON.stringify(r.data);
    const st = L.leagueState({ league: { on: true } }, [r], calc, holesFor);
    assert.equal(st.matches.length, 2, 'the Nassau and the 2 v 2 match bet; not the 1 v 1');
    assert.equal(st.rows.find((x) => x.name === 'G01').pts, 6, 'two matches won, presses add no points');
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

test('ONLY THE LEAGUE\'S GOLFERS (Manny: 10 of us): mixed matches score for the league golfer; nobody else is in the standings or the pot', { skip }, () => {
    // Group 1: G01 & G02 v G03 & G04, A sweeps. Group 2: G05 & G06 v G07 & G08, all halved.
    const r = round('R1', names24.slice(0, 8), ['A', 'H']);
    const ten = ['G01', 'G04', 'G05', 'G09', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
    const st = L.leagueState({ league: { on: true, players: ten } }, [r], calc, holesFor);
    assert.deepEqual(st.rows.map((x) => x.name).sort(), ten.slice().sort(), 'only the ten');
    const row = (n) => st.rows.find((x) => x.name === n);
    assert.equal(row('G01').pts, 3, 'his side won - his partner G02 is not in the league');
    assert.deepEqual(row('G01').matches[0].partner, ['G02']);
    assert.equal(row('G04').pts, 0); assert.equal(row('G05').pts, 1.5, 'halved with three non-league golfers');
    assert.equal(st.pay.potCents, 20000, '10 x $20');
    assert.deepEqual(st.pay.placeCents, [10000, 6000, 4000], '1st $100 / 2nd $60 / 3rd $40');
    assert.equal(st.pay.payCents.G01, 10000);
    assert.ok(!('G02' in st.pay.payCents) && !('G03' in st.pay.payCents), 'non-league golfers are never paid');
});

test('POINTS GAME - same teams every round: each pairing scored from every round\'s scores by the engine (no Side Bets needed); individual standings', { skip }, () => {
    // Round 1 groups in order; round 2 shuffled, and with no Side Bets at all.
    const r1 = round('R1', names24.slice(0, 8), ['A', 'B']);
    const r2 = round('R2', ['G01', 'G03', 'G02', 'G04', 'G05', 'G07', 'G06', 'G08'], ['H', 'H']);
    r2.data.sideMatches = {};
    // Same teams: G01 & G02 v G03 & G04. In round 2 G01/G02 are on 3/4 putts... scores make A = G01,G03 side.
    const game = { pointsGame: { on: true, teamsMode: 'same', teams: [{ a: ['G01', 'G02'], b: ['G03', 'G04'] }], players: ['G01', 'G02', 'G03', 'G04'] } };
    const st = L.leagueState(game, [r1, r2], calc, holesFor);
    assert.equal(st.matches.length, 2, 'one match per round for the one pairing');
    assert.deepEqual(st.matches.map((m) => m.source), ['team', 'team']);
    assert.deepEqual(st.matches[0].seg, { front: 'A', back: 'A', total: 'A' }, 'round 1: G01 & G02 won every hole');
    // Round 2: G01 (3s) & G02 (4s) v G03 (3s) & G04 (4s): the round's group "A" was G01 + G03 -> both best balls 3 = halved.
    assert.deepEqual(st.matches[1].seg, { front: 'H', back: 'H', total: 'H' });
    const pts = Object.fromEntries(st.rows.map((x) => [x.name, x.pts]));
    assert.deepEqual([pts.G01, pts.G02, pts.G03, pts.G04], [4.5, 4.5, 1.5, 1.5], 'individual standings');
    const missing = L.leagueState({ pointsGame: Object.assign({}, game.pointsGame, { teams: [{ a: ['G01', 'G09'], b: ['G03', 'G04'] }] }) }, [r1, r2], calc, holesFor);
    assert.equal(missing.matches.length, 0, 'a pairing whose four did not all play that round is not a match');
});

test('POINTS GAME - only the chosen rounds count; null = every round (later ones too)', { skip }, () => {
    const r1 = round('R1', names24.slice(0, 4), ['A']), r2 = round('R2', names24.slice(0, 4), ['A']);
    assert.equal(L.leagueState({ league: { on: true, rounds: ['R2'] } }, [r1, r2], calc, holesFor).rows.find((x) => x.name === 'G01').pts, 3);
    assert.equal(L.leagueState({ league: { on: true } }, [r1, r2], calc, holesFor).rows.find((x) => x.name === 'G01').pts, 6);
    assert.equal(L.leagueState({ pointsGame: { on: true, rounds: ['R1'] } }, [r1], calc, holesFor).rows.find((x) => x.name === 'G01').pts, 3, 'one round');
});

test('POINTS GAME - $ per place (the Weekly game\'s "exact dollar amounts"): must add up to the pot; ties split', { skip }, () => {
    const cfg = L.leagueConfig({ league: { on: true, payMode: 'usd', placesUsd: [100, 60, 40] } });
    const rows = (pts) => { const rs = pts.map((p, i) => ({ name: 'P' + i, pts: p })); rs.forEach((r, i) => { r.rank = rs[i - 1] && rs[i - 1].pts === r.pts ? rs[i - 1].rank : i + 1; }); return rs; };
    let p = L.leaguePayouts(rows([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]), cfg);
    assert.deepEqual([p.valid, p.potCents, p.placeCents], [true, 20000, [10000, 6000, 4000]]);
    p = L.leaguePayouts(rows([9, 8, 8, 6, 5, 4, 3, 2, 1, 0]), cfg);
    assert.deepEqual([p.payCents.P1, p.payCents.P2], [5000, 5000], 'tied 2nd split 2nd + 3rd');
    p = L.leaguePayouts(rows([9, 8, 7, 6, 5, 4, 3, 2, 1]), cfg);
    assert.equal(p.valid, false, '$200 of places on a $180 pot is refused'); assert.match(p.why, /\$200, not the \$180 pot/);
});

test('EACH ROUND ITS OWN FORMAT AND POINTS: singles 1 v 1 as an 18-hole match (win 2 / halve 1); scramble and foursomes tapped by hand; four-ball Nassau by default', { skip }, () => {
    // R1: default four-ball Nassau 1/1/1. R2: singles, 18-hole match, win 2 / halve 1. R3: scramble (no engine).
    const r1 = round('R1', names24.slice(0, 4), ['A']);
    const r2 = round('R2', names24.slice(0, 4), ['A']);
    r2.data.sideMatches = { s1: { format: 'match', teamAIds: ['101'], teamBIds: ['103'], scoring: 'net', createdAt: 1 }, s2: { format: 'match', teamAIds: ['102'], teamBIds: ['104'], scoring: 'net', createdAt: 2 } };
    const r3 = round('R3', names24.slice(0, 4), ['B']);
    const game = { league: { on: true, players: ['G01', 'G02', 'G03', 'G04'], perRound: { R2: { format: 'singles', mode: 'match', win: 2, halve: 1 }, R3: { format: 'scramble' } },
        overrides: { 'R3~sm0': { front: 'A', back: 'H', total: 'A' } } } };
    const st = L.leagueState(game, [r1, r2, r3], calc, holesFor);
    const m = (id) => st.matches.find((x) => x.id === id);
    assert.deepEqual([m('R1~sm0').mode, m('R1~sm0').format], ['nassau', 'fourball']);
    assert.deepEqual([m('R2~s1').mode, m('R2~s1').seg], ['match', { front: 'NA', back: 'NA', total: 'A' }], 'singles: G01 (3s) beat G03 (4s)');
    assert.deepEqual(m('R3~sm0').seg, { front: 'A', back: 'H', total: 'A' }, 'scramble: only what the organizer tapped (the scores say B, but scramble has no engine)');
    const pts = Object.fromEntries(st.rows.map((x) => [x.name, x.pts]));
    // G01: R1 3 + R2 win 2 + R3 (front 1 + back 0.5 + 18 1 = 2.5) = 7.5. G03: 0 + 0 + 0.5 = 0.5.
    assert.deepEqual([pts.G01, pts.G03], [7.5, 0.5]);
    const g1 = st.rows.find((x) => x.name === 'G01');
    assert.deepEqual([g1.w, g1.l, g1.h], [3, 0, 0]);
    // A round with no taps yet in a no-engine format: nothing counts.
    const st2 = L.leagueState({ league: { on: true, perRound: { R3: { format: 'foursomes' } } } }, [r3], calc, holesFor);
    assert.deepEqual(st2.matches[0].seg, { front: null, back: null, total: null });
});

test('A CUP ROUND: matches from the Ryder engine (the adapter); 18 from the Cup, front / back from the match engine for four-ball', { skip }, () => {
    const r = round('R1', names24.slice(0, 4), [(h) => (h <= 9 ? 'A' : 'B')]);
    r.data.sideMatches = {};
    const ryder = (round) => round.code === 'R1' ? [{ id: 'm1', format: 'fourball', a: ['G01', 'G02'], b: ['G03', 'G04'], aIds: ['101', '102'], bIds: ['103', '104'], total: 'H' }] : [];
    const st = L.leagueState({ league: { on: true } }, [r], calc, holesFor, ryder);
    assert.equal(st.matches.length, 1);
    assert.deepEqual([st.matches[0].source, st.matches[0].seg], ['cup', { front: 'A', back: 'B', total: 'H' }]);
    assert.equal(st.rows.find((x) => x.name === 'G01').pts, 1.5);
    const asMatch = L.leagueState({ league: { on: true, def: { mode: 'match', win: 2, halve: 1 } } }, [r], calc, holesFor, ryder);
    assert.equal(asMatch.rows.find((x) => x.name === 'G01').pts, 1, 'an 18-hole match halved = 1 each');
});
