// ============================================================================
// THE GOLFER'S LEADERBOARD - FLIGHTS, THE EVENT TOTAL, AND (You) - AS PURE
// FUNCTIONS, WITH THE CARD STILL IN ITS PRE-APPROVAL STATE (Item 3, 2026-11-07)
//
// tournament-engine.js gains golferLeaderboardView(), defaultFlightFor() and
// isMeRow(). LOGIC ONLY: tournament-scorecard.html is NOT wired. It still calls
// resolveLeaderboardView(currentData, myRoundId) - a round, never a flight - and
// still marks (You) by myTeamNum, so a group-link golfer is never marked. The
// last describe block pins that CURRENT output so the wiring wave flips it on
// purpose.
//
// NO NEW STANDINGS. golferLeaderboardView is a selection in front of
// resolveLeaderboardView, the call the organizer board makes with lbRoundId and
// lbFlightId, and the tests below hold the two equal row for row. Ranking feeds
// payouts, so no existing engine function was edited; the engine diff is
// additions only, and the "unchanged" block proves the existing outputs did not
// move on the same fixtures.
//
// Team multi-round totals stay REFUSED, with the engine's own sentence.
//
// WHAT THE HARNESS CAN AND CANNOT PROVE. The page test arrives the way a golfer
// does: the page's own value listener gets the record, then the Leaderboard
// tab's own onclick attribute, read out of the markup, is run - the tap, not a
// call chosen by the test. mini-dom has no <template>; created templates get an
// empty `content`, which a first render never reads. innerHTML is a string, so
// the rendered board is read as markup.
//
// TESTS: 20 (final run of the finished file: 20 pass / 0 fail).
//
// WIRING WAVE (2026-11-08, mockup A3 approved by Manny). The last describe
// block's three page pins were FLIPPED ON PURPOSE to the wired board: a
// group-link golfer lands on their own flight with both golfers marked
// (You), a team-link golfer on their own flight, and the source calls
// golferLeaderboardView/defaultFlightFor/isMeRow. Still 20 tests, 20 pass.
// Against c3b7a139's card those three fail and the other 17 pass
// (17 / 3 / 0 / 20). The baseline and controls below are the logic wave's.
//
// BASELINE against 1fb1ef43 (tournament-engine.js sha256 3626301c...; the
// scorecard is unchanged by this wave, a18e5dbf...), the engine swapped back to
// that commit's copy and restored by sha from a saved copy:
//
//   all 20 tests: 2 PASS / 18 FAIL / 0 cancelled.   2 + 18 = 20.
//
// The file LOADS at baseline; the new names are missing, so every test that
// reaches them fails on "not a function". The 2 that pass are page-only pins:
// a team-link golfer's (You) as today, and the card's source not calling the
// new functions. The group-link page test also asks the engine who SHOULD be
// marked, so it is among the 18.
//
// NEGATIVE CONTROLS (mutation in the named file, test run, file restored by cp
// from a scratch copy, sha re-checked RESTORED-OK each time):
//   C1 ignore flightId (always Overall)                     engine 3 fail CAUGHT
//   C2 ignore scope (always the round)                      engine 3 fail CAUGHT
//   C3 isMeRow marks by team number only                    engine 3 fail CAUGHT
//   C4 defaultFlightFor: mixed group answers first golfer's engine 1 fail CAUGHT
//   C5 the card's (You) wired to isMeRow (the later diff)   card   2 fail CAUGHT
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript } = require('./helpers/load-script.js');

const engine = loadJsFile('tournament-engine.js');
const plain = (v) => JSON.parse(JSON.stringify(v));

const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const fill = (pid, v, n = 18) => { const s = {}; for (let h = 1; h <= n; h++) s[`${pid}_h${h}`] = v; return s; };
const FLIGHTS = { fA: { id: 'fA', name: 'Championship', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } };
const PLAYERS = () => ({
    pA: { id: 'pA', name: 'Ann Lee', handicap: '4', flightId: 'fA' },
    pB: { id: 'pB', name: 'Bo Park', handicap: '6', flightId: 'fA' },
    pC: { id: 'pC', name: 'Cal Ruiz', handicap: '12', flightId: 'fB' },
    pD: { id: 'pD', name: 'Dee Fox', handicap: '15', flightId: 'fB' },
});
const GROUPS = { g1: { name: 'Group 1', playerIds: ['pA', 'pB'] }, g2: { name: 'Group 2', playerIds: ['pC', 'pD'] },
    gMix: { name: 'Mixed', playerIds: ['pA', 'pC'] } };

function singleIndividual() {
    return { name: 'Club Champs', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
        courseName: 'Tidewater', courseData: CD, flights: FLIGHTS, players: PLAYERS(), scoringGroups: GROUPS,
        scores: Object.assign({}, fill('pA', 4), fill('pB', 5), fill('pC', 3, 9), fill('pD', 6)) };
}
const round = (name, at, scores) => ({ name, status: 'open', format: 'individual', scoringMode: 'gross',
    courseName: 'Tidewater', courseData: CD, createdAt: at, scoringGroups: GROUPS, scores });
function twoRoundIndividual() {
    return { name: 'Two Day', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual',
        flights: FLIGHTS, players: PLAYERS(),
        rounds: {
            r1: round('Saturday', 10, Object.assign({}, fill('pA', 4), fill('pB', 5), fill('pC', 4), fill('pD', 6))),
            r2: round('Sunday', 20, Object.assign({}, fill('pA', 5), fill('pB', 4), fill('pC', 3), fill('pD', 5))),
        } };
}
const TEAMS = () => ({ team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0, flightId: 'fA' },
    team2: { num: 2, name: 'Hawks', players: ['Cal', 'Dee'], handicap: 0, flightId: 'fB' },
    team3: { num: 3, name: 'Owls', players: ['Eve', 'Flo'], handicap: 0, flightId: 'fA' } });
function singleTeam() {
    const s = {}; for (let h = 1; h <= 18; h++) { s[`team1_h${h}`] = 4; s[`team2_h${h}`] = 3; s[`team3_h${h}`] = 5; }
    return { name: 'Scramble', format: 'scramble', courseName: 'Tidewater', courseData: CD, flights: FLIGHTS,
        teams: TEAMS(), scores: s };
}
function twoRoundTeam() {
    const r = (n, at) => ({ name: n, status: 'open', format: 'scramble', courseName: 'T', courseData: CD, createdAt: at,
        scores: { team1_h1: 4, team2_h1: 3 } });
    return { name: 'Team Two Day', eventModel: 'round-v1', format: 'scramble', flights: FLIGHTS, teams: TEAMS(),
        rounds: { r1: r('Sat', 10), r2: r('Sun', 20) } };
}

const gv = (d, o) => plain(engine.golferLeaderboardView(d, o));
const organizer = (d, sel, fid) => plain(engine.resolveLeaderboardView(d, sel, fid));
const names = (rows) => rows.map((r) => r.teamName);

describe('Item 3. golferLeaderboardView is the organizer\'s resolution, selected', () => {
    test('DEFAULT (no flight, no scope) equals resolveLeaderboardView(data, roundId) row for row', () => {
        assert.deepEqual(gv(singleIndividual(), {}).rows, organizer(singleIndividual(), null).rows);
        assert.deepEqual(gv(singleTeam(), {}).rows, organizer(singleTeam(), null).rows);
        assert.deepEqual(gv(twoRoundIndividual(), { roundId: 'r1' }).rows, organizer(twoRoundIndividual(), 'r1').rows);
        assert.deepEqual(gv(twoRoundTeam(), { roundId: 'r2' }).rows, organizer(twoRoundTeam(), 'r2').rows);
        assert.equal(gv(singleIndividual(), {}).rows.length, 4, 'positive: the field is there');
        assert.equal(gv(singleIndividual(), {}).available, true);
    });

    test('a flight narrows the field exactly as the organizer\'s flight button does', () => {
        const v = gv(singleIndividual(), { flightId: 'fB' });
        assert.deepEqual(v.rows, organizer(singleIndividual(), null, 'fB').rows);
        assert.deepEqual(names(v.rows).sort(), ['Cal Ruiz', 'Dee Fox']);
        assert.equal(v.flightId, 'fB');
        assert.deepEqual(names(gv(singleTeam(), { flightId: 'fA' }).rows), ['Eagles', 'Owls']);
    });

    test('flight ranks close up inside the flight (1, 2 - not the overall places)', () => {
        const ranks = gv(singleIndividual(), { flightId: 'fB' }).rows.map((r) => r.rank);
        assert.deepEqual(ranks, [1, 2]);
    });

    test('a flight this event does not have falls back to Overall', () => {
        const v = gv(singleIndividual(), { flightId: 'gone' });
        assert.equal(v.flightId, null);
        assert.deepEqual(v.rows, organizer(singleIndividual(), null).rows);
    });

    test('scope "event" on individual stroke play is the Event tab, with or without a flight', () => {
        const d = twoRoundIndividual();
        const v = gv(d, { roundId: 'r1', scope: 'event' });
        assert.equal(v.available, true);
        assert.equal(v.kind, 'event');
        assert.deepEqual(v.rows, organizer(d, 'event').rows);
        assert.equal(v.rows.length, 4);
        assert.equal(v.rows[0].hasScores, true);
        const f = gv(d, { roundId: 'r1', scope: 'event', flightId: 'fA' });
        assert.deepEqual(f.rows, organizer(d, 'event', 'fA').rows);
        assert.deepEqual(names(f.rows).sort(), ['Ann Lee', 'Bo Park']);
    });

    test('scope "event" differs from the round board on the same link (it is not ignored)', () => {
        const d = twoRoundIndividual();
        const ev = gv(d, { roundId: 'r1', scope: 'event' }).rows.find((r) => r.playerId === 'pA');
        const rd = gv(d, { roundId: 'r1', scope: 'round' }).rows.find((r) => r.playerId === 'pA');
        assert.equal(rd.strokes, 72);
        assert.equal(ev.strokes, 72 + 90);
    });

    test('team multi-round totals stay REFUSED, with the engine\'s own sentence', () => {
        const d = twoRoundTeam();
        const v = gv(d, { roundId: 'r1', scope: 'event' });
        assert.equal(v.available, false);
        assert.deepEqual(v.rows, []);
        assert.equal(v.reason, plain(engine.aggregateAvailability(d)).reason);
        assert.match(v.reason, /only worked out for Individual Stroke Play/);
    });

    test('a single-round record ignores scope "event", as resolveLeaderboardView does', () => {
        assert.deepEqual(gv(singleIndividual(), { scope: 'event' }).rows, organizer(singleIndividual(), 'event').rows);
        assert.equal(gv(singleIndividual(), { scope: 'event' }).available, true);
    });
});

describe('Item 3. defaultFlightFor - the golfer\'s own flight, or null', () => {
    test('team link reads the team; player id reads the player', () => {
        assert.equal(engine.defaultFlightFor(singleTeam(), { teamNum: 2 }), 'fB');
        assert.equal(engine.defaultFlightFor(singleIndividual(), { playerId: 'pC' }), 'fB');
    });

    test('group link: every golfer in one flight answers it; a mixed group answers null', () => {
        assert.equal(engine.defaultFlightFor(singleIndividual(), { groupId: 'g1' }), 'fA');
        assert.equal(engine.defaultFlightFor(singleIndividual(), { groupId: 'gMix' }), null);
    });

    test('multi-round: the group is read from the round the link is for', () => {
        const d = twoRoundIndividual();
        d.rounds.r2.scoringGroups = { g1: { name: 'G', playerIds: ['pC', 'pD'] } };
        assert.equal(engine.defaultFlightFor(d, { groupId: 'g1', roundId: 'r1' }), 'fA');
        assert.equal(engine.defaultFlightFor(d, { groupId: 'g1', roundId: 'r2' }), 'fB');
    });

    test('a deleted flight, no flights, an unknown group, a withdrawn golfer, nobody: null or ignored', () => {
        const d = singleIndividual();
        d.players.pA.flightId = 'gone'; d.players.pB.flightId = 'gone';
        assert.equal(engine.defaultFlightFor(d, { groupId: 'g1' }), null);
        assert.equal(engine.defaultFlightFor(singleTeam(), { teamNum: 9 }), null);
        assert.equal(engine.defaultFlightFor(singleIndividual(), { groupId: 'nope' }), null);
        assert.equal(engine.defaultFlightFor(singleIndividual(), {}), null);
        const w = singleIndividual();
        w.players.pC.status = 'withdrawn';
        assert.equal(engine.defaultFlightFor(w, { groupId: 'gMix' }), 'fA', 'a withdrawn golfer does not make a group mixed');
    });
});

describe('Item 3. isMeRow - the golfer holding the phone', () => {
    test('team row by team number', () => {
        const rows = gv(singleTeam(), {}).rows;
        assert.deepEqual(rows.filter((r) => engine.isMeRow(r, { teamNum: 2 })).map((r) => r.teamName), ['Hawks']);
        assert.equal(rows.filter((r) => engine.isMeRow(r, {})).length, 0);
    });

    test('player row by group player ids - never by a num that happens to equal a team number', () => {
        const rows = gv(singleIndividual(), {}).rows;
        const me = { teamNum: null, groupPlayerIds: ['pA', 'pB'] };
        assert.deepEqual(rows.filter((r) => engine.isMeRow(r, me)).map((r) => r.playerId).sort(), ['pA', 'pB']);
        // Player rows carry num = position in the field. A team number must not match it.
        assert.equal(rows.filter((r) => engine.isMeRow(r, { teamNum: 1 })).length, 0);
    });

    test('event rows (multi-round total) are matched by player id too', () => {
        const rows = gv(twoRoundIndividual(), { roundId: 'r1', scope: 'event' }).rows;
        assert.deepEqual(rows.filter((r) => engine.isMeRow(r, { groupPlayerIds: ['pD'] })).map((r) => r.playerId), ['pD']);
    });
});

describe('UNCHANGED: the existing engine outputs did not move', () => {
    test('calling the new functions does not mutate the record, and the organizer rows are as before', () => {
        const d = twoRoundIndividual();
        const before = JSON.stringify(d);
        const lbBefore = JSON.stringify(organizer(d, 'r1'));
        const evBefore = JSON.stringify(organizer(d, 'event', 'fB'));
        gv(d, { roundId: 'r1', scope: 'event', flightId: 'fA' });
        engine.defaultFlightFor(d, { groupId: 'g1', roundId: 'r1' });
        assert.equal(JSON.stringify(d), before);
        assert.equal(JSON.stringify(organizer(d, 'r1')), lbBefore);
        assert.equal(JSON.stringify(organizer(d, 'event', 'fB')), evBefore);
    });

    test('payouts off the golfer default board equal payouts off the organizer board', () => {
        const d = singleIndividual();
        const spots = [100, 50];
        assert.deepEqual(plain(engine.computeTournamentPayouts(engine.golferLeaderboardView(d, {}).rows, spots)),
            plain(engine.computeTournamentPayouts(engine.resolveLeaderboardView(d, null).rows, spots)));
        const paid = plain(engine.computeTournamentPayouts(engine.resolveLeaderboardView(d, null).rows, spots))
            .filter((p) => p.amount > 0);
        assert.equal(paid.reduce((s, p) => s + p.amount, 0), 150, 'positive: the places are actually paid');
    });
});

// ----------------------------------------------------------------------------
// THE CARD, WIRED (2026-11-08). These three pinned the PRE-APPROVAL board (whole
// field, nobody marked on a group link, no new calls). Manny approved mockup A3
// on 2026-11-08 and the wiring wave flipped them ON PURPOSE, still through the
// page listener and the tab's own onclick. Both fixtures carry flights, so a
// golfer who touches nothing now lands on their OWN flight.
// ----------------------------------------------------------------------------
const CODE = 'GLB1';
function openBoard(query, record) {
    const sb = loadHtmlInlineScript('tournament-scorecard.html', [], { search: '?' + query });
    const make = sb.document.createElement.bind(sb.document);
    sb.document.createElement = (tag) => {
        const n = make(tag);
        if (String(tag).toLowerCase() === 'template') n.content = { querySelectorAll: () => [] };
        return n;
    };
    sb.__dbHandlers.filter((x) => x.event === 'value' && x.path === 'tournaments/' + CODE)
        .forEach((x) => x.cb({ val: () => plain(record), exists: () => true }));
    // THE TAP: the Leaderboard tab's own onclick, read from the page's markup.
    const src = fs.readFileSync(path.join(__dirname, 'tournament-scorecard.html'), 'utf8');
    const tap = /id="tab-btn-leaderboard"[^>]*onclick="([^"]+)"/.exec(src);
    assert.ok(tap, 'the Leaderboard tab has an onclick');
    vm.runInContext(tap[1], sb);
    return String(sb.document.getElementById('leaderboard-list').innerHTML || '');
}

describe('WIRED (A3 approved 2026-11-08): the golfer board opens on their flight, (You) marked', () => {
    test('group-link golfer in the Championship flight: their flight shown, both golfers marked (You)', () => {
        const html = openBoard('tourney=' + CODE + '&group=g1', singleIndividual());
        ['Ann Lee', 'Bo Park'].forEach((n) => assert.ok(html.includes(n), 'positive: ' + n + ' on the board'));
        ['Cal Ruiz', 'Dee Fox'].forEach((n) => assert.ok(!html.includes(n), n + ' is B Flight, not on the default board'));
        assert.equal((html.match(/\(You\)/g) || []).length, 2, 'flipped: Ann and Bo are marked');
        const me = { groupPlayerIds: GROUPS.g1.playerIds };
        assert.equal(gv(singleIndividual(), { flightId: 'fA' }).rows.filter((r) => engine.isMeRow(r, me)).length, 2);
    });

    test('team-link golfer: (You) on their own team, on their own flight (B: Hawks only)', () => {
        const html = openBoard('tourney=' + CODE + '&team=2', singleTeam());
        assert.equal((html.match(/\(You\)/g) || []).length, 1);
        assert.match(html, /Hawks[^]*?\(You\)/);
        ['Eagles', 'Owls'].forEach((n) => assert.ok(!html.includes(n), n + ' is Championship, not on the default B board'));
    });

    test('the scorecard calls the new functions', () => {
        const src = fs.readFileSync(path.join(__dirname, 'tournament-scorecard.html'), 'utf8');
        assert.match(src, /golferLeaderboardView\(data, \{/, 'positive: the board resolves through the golfer view');
        assert.ok(/defaultFlightFor\(/.test(src) && /isMeRow\(/.test(src), 'wired');
        assert.ok(!/resolveLeaderboardView\(currentData, myRoundId\)/.test(src), 'the pre-approval call is gone');
    });
});
