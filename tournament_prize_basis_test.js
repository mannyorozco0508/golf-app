// ============================================================================
// PRIZE RESULTS ARE THE SAME ON EVERY PHONE (audit #1, 2026-11-07) - STRICT lane
//
// THE DEFECT. tournament.html fills the prize calculator from
//     cachedLeaderboardRows = resolveLeaderboardView(currentData, lbRoundId).rows
// where lbRoundId is the board tab the VIEWER tapped. On a multi-round event a
// phone on "Round 1" and a phone on "Event" show two different prize lists for
// one event; on a multi-round TEAM event the Event tab shows "No scores yet"
// with every team posted. Section 1 reproduces that from the engine itself.
//
// THE LOGIC. resolvePrizeView(data) - tournament-engine.js - takes the data
// only (arity 1: it CANNOT take a tab or a flight). Basis = data.payoutBasis
// ('event' | round id), else the event total when the engine can compute one,
// else nothing (never a list invented from a round nobody chose).
//
// NOT WIRED YET. Manny approves the mockups (A1 "Results are paid on") before
// any visible change, so tournament.html still reads the tab. Section 5 pins
// that pre-approval state on purpose: the wiring wave flips it deliberately.
//
// WHAT THIS CANNOT PROVE: anything on screen. It is engine-level plus a source
// pin; the wiring wave needs a cold-arrival check on two "phones".
//
// COUNTS (final run of this file): 12 tests / 12 pass / 0 fail.
// BASELINE against pre-build tournaments-nov7-build a838f5a0 (tournament-engine.js
// sha 3626301cf0c2a614, no resolvePrizeView): 12 tests / 4 pass / 8 fail. The 4
// that pass there are the defect reproduction (2), the payouts.js pin (1) and
// the pre-approval source pin (1) - they describe today, by design. 4 + 8 = 12.
// NEGATIVE CONTROLS (tournament-engine.js mutated, restored by sha each time):
//   C1 resolvePrizeView takes a 2nd argument as the basis (tab leaks back) -> 1 fail
//   C2 nothing saved on a team multi-round falls back to the LAST round   -> 1 fail
//   C3 a saved basis is ignored (always event)                            -> 3 fail
//   C4 a deleted saved round is not refused                               -> 1 fail
//   (engine restored by sha 2dc65c94 after each)
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const engine = loadJsFile('tournament-engine.js');
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const fill = (key, v) => { const o = {}; CD18.forEach(h => { o[`${key}_h${h.hole}`] = v; }); return o; };
const round = (id, extra) => Object.assign({
    id, name: 'Round', status: 'open', createdAt: 1, format: 'individual', scoringMode: 'gross',
    courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false, scoringGroups: {}, scores: {},
}, extra || {});

// Ann wins Round 1, Bob wins Round 2, Ann wins the event: every basis has a different 1st.
function individualTwoRounds(extra) {
    return Object.assign({
        eventModel: 'round-v1', scoringModel: 'player-v1', name: 'Club Champ', entryFee: 20,
        players: { pA: { id: 'pA', name: 'Ann', handicap: '0' }, pB: { id: 'pB', name: 'Bob', handicap: '0' } },
        rounds: {
            r1: round('r1', { name: 'Saturday', status: 'closed', createdAt: 1,
                scores: Object.assign({}, fill('pA', 3), fill('pB', 5)) }),
            r2: round('r2', { name: 'Sunday', createdAt: 2,
                scores: Object.assign({}, fill('pA', 5), fill('pB', 4)) }),
        },
    }, extra || {});
}
// Team 1 wins Round 1, Team 2 wins Round 2. The engine refuses a combined team total.
function teamTwoRounds(extra) {
    return Object.assign({
        eventModel: 'round-v1', name: 'Scramble', entryFee: 100,
        teams: { team1: { num: 1, name: 'Alpha', players: ['A', 'B'], handicap: 0 },
                 team2: { num: 2, name: 'Bravo', players: ['C', 'D'], handicap: 0 } },
        rounds: {
            r1: round('r1', { name: 'Day 1', format: 'scramble', createdAt: 1,
                scores: Object.assign({}, fill('team1', 3), fill('team2', 4)) }),
            r2: round('r2', { name: 'Day 2', format: 'scramble', createdAt: 2,
                scores: Object.assign({}, fill('team1', 5), fill('team2', 4)) }),
        },
    }, extra || {});
}
const firstName = (rows) => (rows.find(r => r.rank === 1) || {}).teamName;
const money = (rows) => plain(engine.computeTournamentPayouts(rows, [300, 100]).map(p => [p.teamName, p.amount]));

describe('1. THE DEFECT, from the engine: the tab decides the prize rows today', () => {
    test('individual: Round 1 tab and Event tab rank a different 1st', () => {
        const d = individualTwoRounds();
        assert.equal(firstName(engine.resolveLeaderboardView(d, 'r1').rows), 'Ann');
        assert.equal(firstName(engine.resolveLeaderboardView(d, 'r2').rows), 'Bob');
        assert.notDeepEqual(money(engine.resolveLeaderboardView(d, 'r2').rows),
            money(engine.resolveLeaderboardView(d, 'event').rows), 'two tabs, two prize lists');
    });
    test('team: the Event tab has no rows at all while both rounds are scored', () => {
        const d = teamTwoRounds();
        assert.equal(engine.resolveLeaderboardView(d, 'event').rows.length, 0);
        assert.ok(engine.resolveLeaderboardView(d, 'r1').rows.filter(r => r.hasScores).length === 2,
            'positive: the round rows exist, so the empty Event list is the refusal, not missing data');
    });
});

describe('2. ONE BASIS: the data decides, never the viewer', () => {
    test('resolvePrizeView takes the data only (arity 1) - it cannot be handed a tab', () => {
        assert.equal(typeof engine.resolvePrizeView, 'function');
        assert.equal(engine.resolvePrizeView.length, 1);
    });
    test('single-round: exactly the overall board (no flight), as every phone computes it', () => {
        const d = { name: 'One day', format: 'scramble', courseData: CD18,
            teams: { team1: { num: 1, name: 'Alpha', players: ['A'], handicap: 0 }, team2: { num: 2, name: 'Bravo', players: ['B'], handicap: 0 } },
            scores: Object.assign({}, fill('team1', 4), fill('team2', 5)) };
        const v = engine.resolvePrizeView(d);
        assert.equal(v.available, true);
        assert.equal(v.basis, 'single');
        assert.deepEqual(plain(v.rows), plain(engine.computeTournamentLeaderboard(d)));
        assert.equal(firstName(v.rows), 'Alpha');
    });
    test('multi-round individual, nothing saved: the event total, for both "phones"', () => {
        const d = individualTwoRounds();
        const v = engine.resolvePrizeView(d);
        assert.equal(v.basis, 'event');
        assert.deepEqual(plain(v.rows), plain(engine.computeEventStandings(d).rows));
        assert.equal(firstName(v.rows), 'Ann');
        // The phone that had "Round 2" open and the phone on "Event" now agree to the cent.
        assert.deepEqual(money(engine.resolvePrizeView(d).rows), money(engine.resolveLeaderboardView(d, "event").rows));
        assert.ok(money(v.rows).some(([, amt]) => amt === 300), 'positive: real money is on the list');
    });
    test('a saved round basis pays that round, whichever tab is open', () => {
        const d = individualTwoRounds({ payoutBasis: 'r2' });
        const v = engine.resolvePrizeView(d);
        assert.equal(v.basis, 'r2');
        assert.equal(v.title, 'Sunday');
        assert.equal(firstName(v.rows), 'Bob');
    });
    test('a saved "event" basis pays the event total', () => {
        const v = engine.resolvePrizeView(individualTwoRounds({ payoutBasis: 'event' }));
        assert.equal(v.basis, 'event');
        assert.equal(firstName(v.rows), 'Ann');
    });
});

describe('3. NEVER AN INVENTED LIST', () => {
    test('team multi-round with nothing saved: no rows and a reason, not the last round', () => {
        const v = engine.resolvePrizeView(teamTwoRounds());
        assert.equal(v.available, false);
        assert.deepEqual(plain(v.rows), []);
        assert.match(v.reason, /Choose which result the prizes are paid on/);
    });
    test('team multi-round with a saved round: that round pays (Bravo wins Day 2)', () => {
        const v = engine.resolvePrizeView(teamTwoRounds({ payoutBasis: 'r2' }));
        assert.equal(v.available, true);
        assert.equal(firstName(v.rows), 'Bravo');
    });
    test('a saved round that was deleted refuses instead of quietly paying something else', () => {
        const v = engine.resolvePrizeView(individualTwoRounds({ payoutBasis: 'gone' }));
        assert.equal(v.available, false);
        assert.deepEqual(plain(v.rows), []);
        assert.match(v.reason, /no longer part of this event/);
    });
});

describe('4. PROTECTED', () => {
    test('payouts.js is byte-identical (the allocator is not this wave)', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'payouts.js'))).digest('hex');
        assert.equal(sha, 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    });
});

describe('5. PRE-APPROVAL STATE (pinned on purpose; the wiring wave flips this)', () => {
    test('tournament.html still fills the prize cache from the viewer\'s tab - NOT wired until A1 is approved', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'tournament.html'), 'utf8');
        const at = src.indexOf('function renderLeaderboard()');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200 && /resolveLeaderboardView\(currentData, lbRoundId, lbFlightId\)/.test(fn),
            'positive: the slice is the board renderer');
        assert.match(fn, /cachedLeaderboardRows = resolveLeaderboardView\(currentData, lbRoundId\)\.rows;/);
        assert.doesNotMatch(src, /resolvePrizeView/, 'wired before Manny approved the mockup');
    });
});
