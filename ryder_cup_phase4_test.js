// ============================================================================
// RYDER CUP PHASE 4 — CLASSIC SESSIONS + THE POINTER ARCHITECTURE
//
// ONE AUTHORITATIVE CUP. The host round owns data.ryderCup; every participating
// round carries only { host, sessionId }. The Cup object is never copied, because
// five copies diverge the first time an organizer edits one and points would then
// be computed from five different truths.
//
// The tests that matter most here are the ones about failure. A pointer can dangle
// - host deleted, host unreachable, session removed - and in every one of those
// cases ordinary golf scoring must keep working and the app must NOT quietly
// invent a second local Cup to fill the gap.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js']);
const SETTLE = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const PAR = [4,4,3,5,4,4,4,5,3,4,4,4,5,4,3,4,3,5];
const HCP = [3,9,15,13,5,7,1,17,11,4,8,18,14,2,16,10,6,12];
const CD = PAR.map((par, i) => ({ hole: i+1, par, hcpIndex: HCP[i] }));

// 24 golfers, enough for a 12 v 12.
const NAMES = {};
for (let i = 0; i < 24; i++) NAMES[101 + i] = 'P' + (i + 1);
const allPlayers = () => Object.keys(NAMES).map(id => ({
    id: Number(id), name: NAMES[id], hcp: '0', playingForMoney: true }));

const evens = () => PAR.slice();
const card = d => { const c = PAR.slice(); Object.keys(d).forEach(h => { c[Number(h)-1] += d[h]; }); return c; };
function scoresFrom(cards) {
    const s = {};
    Object.keys(cards).forEach(id => (cards[id] || []).forEach((v, i) => {
        if (v != null) s[`p${id}_h${i+1}`] = v; }));
    return s;
}

// perSide golfers each side: A = 101.., B = 101+perSide..
function membersFor(perSide) {
    const m = {};
    for (let i = 0; i < perSide; i++) m[String(101 + i)] = 'A';
    for (let i = 0; i < perSide; i++) m[String(101 + perSide + i)] = 'B';
    return m;
}

function classicCup(perSide, matches) {
    return {
        v: 1, name: 'Myrtle Cup', preset: 'classic',
        sides: { A: { id:'A', name:'Team Rattle' }, B: { id:'B', name:'Team Chaos' } },
        members: membersFor(perSide),
        sessions: RC.buildClassicSessions(),
        matches: matches || {}
    };
}

// A Four-Ball lineup for a session, seating floor(perSide/2) matches.
function seatFourball(perSide, sessionId) {
    const m = {};
    const n = Math.floor(perSide / 2);
    for (let i = 0; i < n; i++) {
        m[sessionId + '-m' + (i+1)] = {
            id: sessionId + '-m' + (i+1), sessionId, format: 'fourball', scoring: 'net',
            sideA: 'A', sideB: 'B',
            playersA: [String(101 + i*2), String(101 + i*2 + 1)],
            playersB: [String(101 + perSide + i*2), String(101 + perSide + i*2 + 1)]
        };
    }
    return m;
}
function seatSingles(perSide, sessionId) {
    const m = {};
    for (let i = 0; i < perSide; i++) {
        m[sessionId + '-s' + (i+1)] = {
            id: sessionId + '-s' + (i+1), sessionId, format: 'singles', scoring: 'net',
            sideA: 'A', sideB: 'B',
            playersA: [String(101 + i)], playersB: [String(101 + perSide + i)]
        };
    }
    return m;
}

const hostRound = (cup, extra) => Object.assign({
    gameFormat: 'stroke', players: allPlayers(), courseData: CD, scores: {},
    sideMatches: {}, ryderCup: cup }, extra || {});

const participantRound = (host, sessionId, scores) => ({
    gameFormat: 'stroke', players: allPlayers(), courseData: CD,
    scores: scores || {}, sideMatches: {},
    ryderCupRef: { host: host, sessionId: sessionId } });

// Side A sweeps: every A golfer birdies holes 1 and 2.
function sweepA(perSide) {
    const c = {};
    for (let i = 0; i < perSide; i++) c[101 + i] = card({1:-1, 2:-1});
    for (let i = 0; i < perSide; i++) c[101 + perSide + i] = evens();
    return scoresFrom(c);
}
function allHalved(perSide) {
    const c = {};
    for (let i = 0; i < perSide * 2; i++) c[101 + i] = evens();
    return scoresFrom(c);
}

// ===========================================================================
describe('CLASSIC PRESET STRUCTURE', () => {

    test('five sessions in the authentic order', () => {
        const d = hostRound(classicCup(8));
        const s = RC.ryderSessionsOf(d);
        assert.equal(s.length, 5);
        assert.deepEqual(s.map(x => x.id).join(','), 'd1s1,d1s2,d2s1,d2s2,d3s1');
        assert.deepEqual(s.map(x => x.format).join(','),
            'foursomes,fourball,foursomes,fourball,singles');
    });

    test('Day 1 and Day 2 are Foursomes THEN Four-Ball', () => {
        const s = RC.ryderSessionsOf(hostRound(classicCup(8)));
        assert.equal(s[0].day, 1); assert.equal(s[0].format, 'foursomes');
        assert.equal(s[1].day, 1); assert.equal(s[1].format, 'fourball');
        assert.equal(s[2].day, 2); assert.equal(s[2].format, 'foursomes');
        assert.equal(s[3].day, 2); assert.equal(s[3].format, 'fourball');
    });

    test('Day 3 is Singles', () => {
        const s = RC.ryderSessionsOf(hostRound(classicCup(8)));
        assert.equal(s[4].day, 3);
        assert.equal(s[4].format, 'singles');
    });

    [4, 6, 8, 10, 12].forEach(n => {
        test(`${n}v${n}: capacities scale, structure does not`, () => {
            const d = hostRound(classicCup(n));
            assert.equal(RC.ryderSessionsOf(d).length, 5, 'structure must not scale');
            assert.equal(RC.ryderSessionMatchCapacity('fourball', n), Math.floor(n / 2));
            assert.equal(RC.ryderSessionMatchCapacity('singles', n), n);
        });
    });

    test('an odd roster sits one golfer out rather than inventing a partner', () => {
        assert.equal(RC.ryderSessionMatchCapacity('fourball', 5), 2);
    });
});

// ===========================================================================
describe('FOURSOMES IS STRUCTURAL ONLY', () => {

    test('foursomes became playable in Phase 5, through its OWN namespace', () => {
        // UPDATED IN PHASE 5. Phase 4 asserted foursomes was unplayable, which was
        // correct while no team-score namespace existed. Phase 5 built one, so the
        // contract genuinely changed. The invariant that must NOT change is the
        // next test: individual scores still cannot produce a Foursomes result.
        assert.equal(RC.ryderFormatPlayable('foursomes'), true);
        assert.equal(RC.ryderFormatPlayable('fourball'), true);
        assert.equal(RC.ryderFormatPlayable('singles'), true);
    });

    test('an unseated foursomes session is NOT_SET, not UNAVAILABLE', () => {
        const d = hostRound(classicCup(8));
        assert.equal(RC.ryderSessionState(d, CD, {}, 'd1s1'), 'NOT_SET');
    });

    test('INDIVIDUAL scores alone still produce no Foursomes result', () => {
        // THE INVARIANT THAT SURVIVED PHASE 5, and the whole reason the namespace
        // exists. A full set of individual scores for all eight golfers must still
        // leave a Foursomes match at zero: alternate shot reads ONLY team scores.
        const cup = classicCup(8, seatFourball(8, 'd1s1'));
        Object.values(cup.matches).forEach(m => { m.format = 'foursomes'; });
        const d = hostRound(cup);
        const totals = RC.computeRyderCupTotals(d, { d1s1: { courseData: CD, scores: sweepA(8) } });
        const sess = totals.sessions.find(s => s.id === 'd1s1');
        assert.equal(sess.official.A, 0,
            'individual scores must never decide an alternate-shot match');
        assert.equal(sess.official.B, 0);
        sess.matches.forEach(m => assert.equal(m.thru, 0,
            'a Foursomes match must read zero holes from individual scores'));
    });
});

// ===========================================================================
describe('SESSION STATES', () => {

    test('a session with no matches is NOT_SET', () => {
        assert.equal(RC.ryderSessionState(hostRound(classicCup(8)), CD, {}, 'd1s2'), 'NOT_SET');
    });

    test('a seated but unplayed session is READY', () => {
        const d = hostRound(classicCup(8, seatFourball(8, 'd1s2')));
        assert.equal(RC.ryderSessionState(d, CD, {}, 'd1s2'), 'READY');
    });

    test('a session with scores is IN_PROGRESS, then COMPLETE', () => {
        const d = hostRound(classicCup(8, seatFourball(8, 'd1s2')));
        const partial = { 'p101_h1': 4 };
        assert.equal(RC.ryderSessionState(d, CD, partial, 'd1s2'), 'IN_PROGRESS');
        assert.equal(RC.ryderSessionState(d, CD, sweepA(8), 'd1s2'), 'COMPLETE');
    });
});

// ===========================================================================
describe('SESSION-SCOPED EXCLUSIVITY ACROSS DAYS', () => {

    test('a golfer may play every session of the Cup', () => {
        // Day 1 PM, Day 2 PM and Singles all contain golfer 101. Legal - and the
        // single easiest thing to get wrong by scoping exclusivity to the Cup.
        const m = Object.assign({}, seatFourball(8, 'd1s2'), seatFourball(8, 'd2s2'),
            seatSingles(8, 'd3s1'));
        const d = hostRound(classicCup(8, m));
        assert.equal(RC.validateRyderCup(d).length, 0, JSON.stringify(RC.validateRyderCup(d)));
    });

    test('a golfer still cannot play twice in ONE session', () => {
        const m = seatFourball(8, 'd1s2');
        m['d1s2-m2'].playersA = ['101', '104'];   // 101 already in m1
        const d = hostRound(classicCup(8, m));
        assert.ok(RC.validateRyderCup(d).some(p => p.type === 'double-booked'));
    });

    test('sit-outs are legal in a partner session', () => {
        // 6 v 6 Four-Ball seats 3 matches; seat only 2 and four golfers sit.
        const m = seatFourball(6, 'd1s2');
        delete m['d1s2-m3'];
        const d = hostRound(classicCup(6, m));
        assert.equal(RC.validateRyderCup(d).length, 0);
    });
});

// ===========================================================================
describe('POINT AGGREGATION ACROSS SESSIONS', () => {

    function twoSessionCup() {
        return classicCup(8, Object.assign({},
            seatFourball(8, 'd1s2'), seatFourball(8, 'd2s2')));
    }

    test('session totals stay independent', () => {
        const d = hostRound(twoSessionCup());
        const t = RC.computeRyderCupTotals(d, {
            d1s2: { courseData: CD, scores: sweepA(8) },
            d2s2: { courseData: CD, scores: allHalved(8) }
        });
        const s1 = t.sessions.find(s => s.id === 'd1s2');
        const s2 = t.sessions.find(s => s.id === 'd2s2');
        assert.equal(s1.official.A, 4, 'A swept four Four-Ball matches');
        assert.equal(s1.official.B, 0);
        assert.equal(s2.official.A, 2, 'all four halved');
        assert.equal(s2.official.B, 2);
    });

    test('the Cup total is the SUM, never a reset', () => {
        const d = hostRound(twoSessionCup());
        const t = RC.computeRyderCupTotals(d, {
            d1s2: { courseData: CD, scores: sweepA(8) },
            d2s2: { courseData: CD, scores: allHalved(8) }
        });
        assert.equal(t.sides.A.official, 6, 'Day 2 must begin from Day 1, not from zero');
        assert.equal(t.sides.B.official, 2);
    });

    test('an UNPLAYED session projects nothing', () => {
        // Counting unplayed matches as all-square would open a five-session Cup
        // at 10-10 before anyone hit a shot.
        const d = hostRound(twoSessionCup());
        const t = RC.computeRyderCupTotals(d, { d1s2: { courseData: CD, scores: sweepA(8) } });
        assert.equal(t.sides.A.official, 4);
        assert.equal(t.sides.A.projected, 4, 'the unplayed session must add nothing');
        assert.equal(t.sides.B.projected, 0);
    });

    test('a live match projects but does not bank', () => {
        const d = hostRound(twoSessionCup());
        const nine = {};
        for (let i = 0; i < 8; i++) nine[101 + i] = card({1:-1}).slice(0, 9);
        for (let i = 0; i < 8; i++) nine[109 + i] = evens().slice(0, 9);
        const t = RC.computeRyderCupTotals(d, { d1s2: { courseData: CD, scores: scoresFrom(nine) } });
        assert.equal(t.sides.A.official, 0, 'nothing is decided yet');
        assert.ok(t.sides.A.projected > 0, 'but the lead projects');
    });

    test('one side sweeping a session is reported as a sweep', () => {
        const d = hostRound(twoSessionCup());
        const t = RC.computeRyderCupTotals(d, { d1s2: { courseData: CD, scores: sweepA(8) } });
        const s = t.sessions.find(x => x.id === 'd1s2');
        assert.equal(s.official.A, s.pointsAvailable);
        assert.equal(s.official.B, 0);
    });
});

// ===========================================================================
describe('THE RESOLVER', () => {

    const HOST = 'HOSTCODE';

    test('a host round resolves its own Cup', () => {
        const d = hostRound(classicCup(8), { ryderCupRef: { host: HOST, sessionId: 'd1s2' } });
        const r = RC.resolveRyderCupForRound(d, null, HOST);
        assert.equal(r.status, 'host');
        assert.equal(r.sessionId, 'd1s2');
        assert.ok(RC.ryderResolutionUsable(r));
    });

    test('a participating round resolves the HOST Cup', () => {
        const host = hostRound(classicCup(8, seatFourball(8, 'd2s2')));
        const p = participantRound(HOST, 'd2s2', sweepA(8));
        const r = RC.resolveRyderCupForRound(p, host, 'DAY2CODE');
        assert.equal(r.status, 'referenced');
        assert.equal(r.host, HOST);
        assert.equal(RC.ryderCupName(r.cup), 'Myrtle Cup');
    });

    test('resolution needs no trip membership and no ?trip= parameter', () => {
        // The whole reason for the pointer: a group-locked scorekeeper link carries
        // no trip code, and the round record must be enough on its own.
        const host = hostRound(classicCup(8, seatFourball(8, 'd2s2')));
        const p = participantRound(HOST, 'd2s2', sweepA(8));
        assert.equal(JSON.stringify(p).indexOf('trip'), -1, 'no trip data involved');
        assert.equal(RC.resolveRyderCupForRound(p, host, 'DAY2CODE').status, 'referenced');
    });

    test('a Phase 3B local Cup with no ref still resolves', () => {
        const d = hostRound(classicCup(8, seatFourball(8, 'd1s2')));
        delete d.ryderCupRef;
        const r = RC.resolveRyderCupForRound(d, null, 'ANY');
        assert.equal(r.status, 'local');
        assert.ok(RC.ryderResolutionUsable(r));
    });

    test('a round with neither Cup nor ref resolves to none', () => {
        const r = RC.resolveRyderCupForRound({ players: [] }, null, 'X');
        assert.equal(r.status, 'none');
        assert.equal(RC.ryderResolutionUsable(r), false);
    });
});

// ===========================================================================
describe('GRACEFUL FAILURE — the pointer can dangle', () => {

    const HOST = 'HOSTCODE';

    test('an unreachable host degrades, it does not throw', () => {
        const p = participantRound(HOST, 'd1s2', sweepA(8));
        const r = RC.resolveRyderCupForRound(p, null, 'DAY1CODE');
        assert.equal(r.status, 'host-unavailable');
        assert.equal(RC.ryderResolutionUsable(r), false);
        assert.equal(r.cup, null);
    });

    test('a DELETED host degrades and fabricates nothing', () => {
        // The failure mode identified when this architecture was chosen.
        const p = participantRound(HOST, 'd1s2', sweepA(8));
        const r = RC.resolveRyderCupForRound(p, { players: [] }, 'DAY1CODE');
        assert.equal(r.status, 'host-cup-missing');
        assert.equal(r.cup, null);
        assert.equal(RC.hasRyderCup(p), false,
            'the participating round must NEVER gain a local Cup copy');
    });

    test('a malformed ref degrades', () => {
        const p = { players: allPlayers(), courseData: CD, scores: {}, ryderCupRef: { nonsense: 1 } };
        assert.equal(RC.resolveRyderCupForRound(p, null, 'X').status, 'none');
    });

    test('a missing session is reported but the Cup still resolves', () => {
        const host = hostRound(classicCup(8));
        const p = participantRound(HOST, 'nosuchsession', {});
        const r = RC.resolveRyderCupForRound(p, host, 'DAY1CODE');
        assert.equal(r.status, 'session-missing');
        assert.ok(r.cup, 'the Cup itself is still readable');
    });

    test('ordinary scoring is untouched by a dangling pointer', () => {
        const p = participantRound(HOST, 'd1s2', sweepA(8));
        p.sideMatches = { w: { format:'match', scoring:'net', stake:20, pressRule:'2down',
            teamAIds:['101'], teamBIds:['109'], presses:{} } };
        const recs = SETTLE.buildSideMatchReceipts(p, CD, p.scores);
        assert.equal(recs.length, 1, 'a broken Cup pointer must not affect money');
    });
});

// ===========================================================================
describe('WRITE OWNERSHIP AND CROSS-ROUND LOCKING', () => {

    const HOST = 'HOSTCODE';

    test('scores stay on the participating round; config stays on the host', () => {
        const host = hostRound(classicCup(8, seatFourball(8, 'd2s2')));
        const p = participantRound(HOST, 'd2s2', sweepA(8));
        assert.equal(Object.keys(host.scores).length, 0, 'the host must not gain scores');
        assert.equal(RC.hasRyderCup(p), false, 'the participant must not gain config');
        assert.ok(Object.keys(p.scores).length > 0);
    });

    test('a participating-round score locks the HOST match', () => {
        const host = hostRound(classicCup(8, seatFourball(8, 'd2s2')));
        const p = participantRound(HOST, 'd2s2', { 'p101_h1': 4 });
        const m = RC.ryderCupConfig(host).matches['d2s2-m1'];
        // The lock is evaluated against the round that holds the scores...
        assert.equal(RC.ryderMatchLockState(p, CD, p.scores, m).locked, true);
        // ...and the snapshot is written to the HOST config, not a shadow copy.
        RC.lockRyderMatch(host.ryderCup.matches['d2s2-m1'], 900);
        assert.equal(host.ryderCup.matches['d2s2-m1'].lockedAt, 900);
        assert.equal(p.ryderCup, undefined, 'no shadow lock on the participant');
    });

    test('a started match locks while an unstarted one stays editable', () => {
        const host = hostRound(classicCup(8, seatFourball(8, 'd2s2')));
        const p = participantRound(HOST, 'd2s2', { 'p101_h1': 4 });
        const cfg = RC.ryderCupConfig(host);
        assert.equal(RC.ryderMatchLockState(p, CD, p.scores, cfg.matches['d2s2-m1']).locked, true);
        assert.equal(RC.ryderMatchLockState(p, CD, p.scores, cfg.matches['d2s2-m2']).locked, false);
    });

    test('a future session stays fully editable while another is playing', () => {
        const host = hostRound(classicCup(8, Object.assign({},
            seatFourball(8, 'd1s2'), seatFourball(8, 'd2s2'))));
        const p = participantRound(HOST, 'd1s2', sweepA(8));
        const cfg = RC.ryderCupConfig(host);
        assert.equal(RC.ryderMatchLockState(p, CD, p.scores, cfg.matches['d2s2-m1']).locked,
            false, 'Day 1 playing must not lock Day 2');
    });
});

// ===========================================================================
describe('HOST REMOVAL GUARD', () => {

    test('a Cup with known participants cannot be removed', () => {
        const host = hostRound(classicCup(8));
        const gate = RC.canRemoveRyderCupHost(host, CD, {}, ['DAY2CODE']);
        assert.equal(gate.ok, false);
        assert.equal(gate.error, 'has-participants');
    });

    test('with no known participants the normal rule applies', () => {
        const host = hostRound(classicCup(8));
        assert.equal(RC.canRemoveRyderCupHost(host, CD, {}, []).ok, true);
    });

    test('a started Cup still cannot be removed', () => {
        const host = hostRound(classicCup(8, seatFourball(8, 'd1s2')), { scores: sweepA(8) });
        assert.equal(RC.canRemoveRyderCupHost(host, CD, host.scores, []).ok, false);
    });
});

// ===========================================================================
describe('BACKWARD COMPATIBILITY', () => {

    test('a Phase 3B Cup with no sessions still scores', () => {
        const cup = { v:1, name:'Old Cup',
            sides:{ A:{id:'A',name:'R'}, B:{id:'B',name:'C'} },
            members: membersFor(2),
            matches: { m1: { id:'m1', sessionId:'s1', format:'fourball', scoring:'net',
                sideA:'A', sideB:'B', playersA:['101','102'], playersB:['103','104'] } } };
        const d = hostRound(cup, { scores: sweepA(2) });
        assert.equal(RC.ryderSessionsOf(d).length, 0, 'no sessions is legal');
        const st = RC.computeRyderCupStandings(d, CD, d.scores);
        assert.equal(st.sides.A.official, 1, 'the old three-arg path must still work');
    });

    test('a Phase 3B Cup needs no migration to reopen', () => {
        const cup = { v:1, name:'Old Cup',
            sides:{ A:{id:'A',name:'R'}, B:{id:'B',name:'C'} },
            members: membersFor(2), matches: {} };
        const re = JSON.parse(JSON.stringify(hostRound(cup)));
        assert.equal(RC.hasRyderCup(re), true);
        assert.equal(RC.ryderCupName(re), 'Old Cup');
        assert.equal(RC.resolveRyderCupForRound(re, null, 'X').status, 'local');
    });

    test('legacy gameFormat ryder is still not a Cup', () => {
        const d = { gameFormat:'ryder', matchStake:50, matchScoring:'net',
            players: allPlayers().slice(0,4), courseData: CD,
            scores: sweepA(2), sideMatches: {} };
        // First half vs second half. An earlier draft interleaved teams, which put a
        // birdier on each side, halved the match and settled $0 - so the assertion
        // failed for a reason that had nothing to do with legacy ryder.
        d.players.forEach((p,i) => { p.team = i < 2 ? 'Team 1' : 'Team 2'; });
        assert.equal(RC.hasRyderCup(d), false);
        assert.equal(RC.resolveRyderCupForRound(d, null, 'X').status, 'none');
        const c = SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions;
        assert.ok(Object.values(c).some(x => x.lines.some(l => /ryder/i.test(l.label))),
            'legacy ryder must still settle its money');
    });
});

// ===========================================================================
describe('MONEY ISOLATION WITH SESSIONS', () => {

    function money(d) {
        const r = SETTLE.computeCombinedNetTotals(d, CD, d.scores);
        return JSON.parse(JSON.stringify({
            netByName: r.netByName, exact: r.exact, contributions: r.contributions,
            transactions: r.transactions,
            receipts: SETTLE.buildSideMatchReceipts(d, CD, d.scores) }));
    }
    const wagers = () => ({
        w1: { format:'match', scoring:'net', stake:20, pressRule:'2down',
              teamAIds:['101'], teamBIds:['109'], presses:{} },
        w2: { format:'match', scoring:'net', stake:50, pressRule:'2down',
              teamAIds:['101','102'], teamBIds:['109','110'], presses:{} }
    });

    test('attaching a five-session Cup moves no money', () => {
        const A = { gameFormat:'stroke', players: allPlayers(), courseData: CD,
            scores: sweepA(8), sideMatches: wagers() };
        const B = JSON.parse(JSON.stringify(A));
        B.ryderCup = classicCup(8, Object.assign({},
            seatFourball(8, 'd1s2'), seatSingles(8, 'd3s1')));
        B.ryderCupRef = { host: 'HOSTCODE', sessionId: 'd1s2' };
        assert.deepEqual(money(B), money(A));
    });

    test('a participating round with only a pointer moves no money', () => {
        const A = { gameFormat:'stroke', players: allPlayers(), courseData: CD,
            scores: sweepA(8), sideMatches: wagers() };
        const B = JSON.parse(JSON.stringify(A));
        B.ryderCupRef = { host: 'HOSTCODE', sessionId: 'd2s2' };
        assert.deepEqual(money(B), money(A));
    });

    test('no session or pointer field appears in any ledger line', () => {
        const d = { gameFormat:'stroke', players: allPlayers(), courseData: CD,
            scores: sweepA(8), sideMatches: wagers(),
            ryderCup: classicCup(8, seatFourball(8, 'd1s2')),
            ryderCupRef: { host:'H', sessionId:'d1s2' } };
        Object.values(SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions)
            .forEach(c => c.lines.forEach(l => assert.ok(
                !/ryder|cup|session|point/i.test(l.label), l.label)));
    });

    test('the stored Cup still holds no money field', () => {
        const raw = JSON.stringify(classicCup(8, seatFourball(8, 'd1s2')));
        ['stake','holeBet','pressRule','payout','wager']
            .forEach(f => assert.ok(!new RegExp('"' + f + '"').test(raw), f));
    });
});

// ===========================================================================
describe('PAGE WIRING AND MOBILE', () => {

    const IDX = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const SM = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');

    test('the scorecard resolves through the one canonical resolver', () => {
        assert.ok(/resolveRyderCupForRound\(currentData, __ryderHostCup, currentMode\)/.test(IDX));
    });

    test('the host cup is fetched cross-event and cached', () => {
        assert.ok(/db\.ref\('events\/' \+ __ryderHostCode\)\.once\('value'\)/.test(IDX));
        assert.ok(/if \(String\(ref\.host\) === String\(__ryderHostCode\)\) return;/.test(IDX),
            'the host must be fetched once per host code, not per render');
    });

    test('an unusable resolution renders a soft unavailable state', () => {
        const fn = IDX.slice(IDX.indexOf('function renderRyderCupHtml'));
        assert.ok(/Cup unavailable/.test(fn.slice(0, 2500)));
        assert.ok(!/throw /.test(fn.slice(0, 2500)));
    });

    test('the scorecard shows the current session, not the whole schedule', () => {
        const fn = IDX.slice(IDX.indexOf('function renderRyderCupHtml'));
        assert.ok(/sessionMatches/.test(fn.slice(0, 3000)));
        assert.ok(/rc-sess/.test(fn.slice(0, fn.indexOf('function renderSkinsWidgetHtml'))),
            'the session label must be shown');
    });

    test('the organizer schedule is collapsed per session', () => {
        assert.ok(/<details class="rcs-sess/.test(SM));
        assert.ok(!/<details class="rcs-sess[^"]*" open/.test(SM),
            'five sessions cannot all be open on a 360px phone');
    });

    test('re-seeding a session preserves matches that have STARTED', () => {
        // A REAL GAP, found by negative control. Setting a lineup again must drop
        // only the unstarted pairings; a match already under way keeps its roster
        // or the session UI becomes a way around the lock.
        const fn = SM.slice(SM.indexOf('function rcSeedSession'), SM.indexOf('function rcDropMatch'));
        assert.ok(/return !!m\.lockedAt;/.test(fn),
            'rcSeedSession must retain locked matches when re-seeding');
        assert.ok(/ryderFormatPlayable\(s\.format\)/.test(fn),
            'an unplayable session must not be seedable');
    });

    test('foursomes setup explains alternate shot and offers a scoring mode', () => {
        // UPDATED IN PHASE 5. Phase 4 asserted "not playable yet"; Phase 5 made it
        // playable, so the correct assertion is now that the session explains its
        // one-ball nature, warns that individual side games are unavailable, and
        // offers scratch-or-handicap with scratch first.
        assert.ok(/one ball per side/i.test(SM));
        assert.ok(/Individual side games are unavailable/i.test(SM));
        assert.ok(/WHS Foursomes allowance/.test(SM));
        const sel = SM.slice(SM.indexOf('rcSetSessionScoring'));
        assert.ok(sel.indexOf('value="scratch"') < sel.indexOf('value="handicap"'),
            'scratch must be the first and default option');
    });

    test('the schedule cannot overflow horizontally', () => {
        assert.ok(/\.rcs-card, \.rcs-card \* \{[^}]*overflow-wrap: anywhere/.test(SM));
        const block = SM.slice(SM.indexOf('.rcs-sess {'), SM.indexOf('.rcs-cap'));
        assert.ok(!/width:\s*\d{3,}px/.test(block));
    });
});
