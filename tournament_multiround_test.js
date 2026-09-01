// ============================================================================
// MULTI-ROUND EVENTS — an event is not a round
//
// A tournament used to BE a round: one course, one format, one set of scores, all
// at the record root. A club championship is two rounds of one event, so the two
// ideas had to come apart.
//
//   EVENT  what persists: name, code, the player field and their stable ids,
//          flights, trip link, entry fee, model markers.
//   ROUND  what changes: course, format, scoring mode, scoring groups, starting
//          holes, scores, handicap snapshots, status.
//
// ---------------------------------------------------------------------------
// WHAT THESE TESTS ARE REALLY PROTECTING
// ---------------------------------------------------------------------------
//
// 1. HISTORY DOES NOT MOVE. Every tournament ever created is single-round with its
//    scores at the root. None of them has an eventModel marker, none of them is
//    migrated, and none of them may read one stroke differently than it did
//    yesterday.
//
// 2. A CLOSED ROUND IS CLOSED. Player handicaps live on the event, so a live read
//    would mean correcting somebody's index on Sunday silently rewrites Saturday's
//    net standings. Rounds snapshot their handicaps when they open.
//
// 3. FEWER HOLES IS NOT A LEAD. A golfer who skipped a round has a smaller stroke
//    total, and a naive sum would put them top of the combined board.
//
// 4. NOT EVERYTHING CAN BE ADDED UP. A scramble round produces team rows and an
//    individual round produces player rows; there is no shared competitive entity
//    to sum. Combined standings are withheld with a reason rather than invented.
//
// ---------------------------------------------------------------------------
// ONE RANKING PATH, STILL
// ---------------------------------------------------------------------------
//
// Round boards, flight boards and combined standings are three questions about one
// competition. They share rankRows() - one sort, one rank pass - with callers
// supplying only the comparator. A second sort in this engine would be a second
// definition of "tied".
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const codeOf = (f) => read(f).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const engine = loadJsFile('tournament-engine.js');

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

// A real card: eighteen distinct stroke indexes, scrambled, so allocation can be
// checked rather than assumed.
const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));

function scoresFor(pid, perHole, holes) {
    const out = {};
    CD18.slice(0, holes === undefined ? 18 : holes)
        .forEach(h => { out[`${pid}_h${h.hole}`] = perHole; });
    return out;
}

function round(id, extra) {
    return Object.assign({
        id: id, name: 'Round', status: 'open', createdAt: 1,
        format: 'individual', scoringMode: 'gross',
        courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false,
        scoringGroups: {}, scores: {},
    }, extra || {});
}

// Two rounds. Round 1 is closed and snapshotted with Bob off 18; Round 2 is open
// and uses the live field, where Bob is scratch. Cal misses Round 2 entirely.
function twoRoundEvent() {
    return {
        eventModel: 'round-v1',
        scoringModel: 'player-v1',
        name: 'Club Championship',
        entryFee: 20,
        players: {
            pA: { id: 'pA', name: 'Ann', handicap: '0' },
            pB: { id: 'pB', name: 'Bob', handicap: '0' },
            pC: { id: 'pC', name: 'Cal', handicap: '9' },
        },
        rounds: {
            r1: round('r1', {
                name: 'Saturday', status: 'closed', createdAt: 1, scoringMode: 'net',
                handicaps: { pA: '0', pB: '18' },
                scores: Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 5), scoresFor('pC', 5)),
            }),
            r2: round('r2', {
                name: 'Sunday', status: 'open', createdAt: 2, scoringMode: 'net',
                scores: Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 5)),
            }),
        },
    };
}

// The shape every tournament in production has today: no eventModel, no rounds,
// scores at the root.
function legacySingleRound() {
    return {
        name: 'Old Scramble', format: 'scramble', courseName: 'Test GC', courseData: CD18,
        teams: {
            team1: { num: 1, name: 'Alpha', players: ['A', 'B'], handicap: 0 },
            team2: { num: 2, name: 'Bravo', players: ['C', 'D'], handicap: 9 },
        },
        scores: (() => {
            const s = {};
            [4, 5].forEach((v, i) => CD18.forEach(h => { s[`team${i + 1}_h${h.hole}`] = v; }));
            return s;
        })(),
    };
}

// Slices a function body by brace matching. A fixed-length window silently stops
// reaching the end of a function the moment somebody adds to it, which reports a
// missing guard that is actually there.
function fnBody(src, name) {
    const start = src.indexOf('function ' + name);
    if (start === -1) return '';
    let depth = 0, end = src.indexOf('{', start);
    for (let i = end; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return src.slice(start, end + 1);
}

const lbRound = (d, rid, fid) => plain(engine.computeRoundLeaderboard(d, rid, fid));
const standings = (d, fid) => plain(engine.computeEventStandings(d, fid));
const byName = (rows, n) => rows.find(r => r.playerName === n);

// ===========================================================================
// 1. THE MODEL BOUNDARY
// ===========================================================================

describe('EVENT MODEL — declared, never inferred', () => {

    test('a legacy record is single-round, and stays so', () => {
        assert.equal(engine.isMultiRound(legacySingleRound()), false);
        assert.equal(engine.isMultiRound({}), false);
        assert.equal(engine.isMultiRound(null), false);
    });

    test('a rounds node alone does not make a record multi-round', () => {
        // The dangerous shortcut. A legacy record that somehow grew a rounds node
        // must not have the meaning of its root scores change underneath it.
        const disguised = legacySingleRound();
        disguised.rounds = { r1: round('r1') };
        assert.equal(engine.isMultiRound(disguised), false);
        assert.equal(lbRound(disguised, null).length, 2, 'it still ranks its two teams from root scores');
    });

    test('a multi-round event declares itself explicitly', () => {
        assert.equal(engine.isMultiRound(twoRoundEvent()), true);
        assert.match(codeOf('tournament-engine.js'), /data\.eventModel === ROUND_MODEL/);
    });

    test('rounds are ordered by creation, not by id or name', () => {
        // Ids are opaque, so creation order is the only ordering that means anything -
        // and it is what "Round 1" refers to even after somebody renames it.
        const d = twoRoundEvent();
        assert.deepEqual(plain(engine.orderedRoundIds(d)), ['r1', 'r2']);
        d.rounds.r1.name = 'Zulu';
        d.rounds.r2.name = 'Alpha';
        assert.deepEqual(plain(engine.orderedRoundIds(d)), ['r1', 'r2'],
            'renaming a round must not reorder the event');
    });
});

// ===========================================================================
// 2. THE COMPATIBILITY BOUNDARY
// ===========================================================================

describe('ROUND VIEW — one place knows about rounds', () => {

    test('a legacy record is returned unchanged, by identity', () => {
        // Not "an equal object" - the same object. Nothing is rebuilt, so nothing can
        // be rebuilt slightly differently.
        const legacy = legacySingleRound();
        assert.equal(engine.roundView(legacy, null), legacy);
        assert.equal(engine.roundView(legacy, 'r1'), legacy);
    });

    test('a round view looks exactly like a single-round record', () => {
        const d = twoRoundEvent();
        const view = plain(engine.roundView(d, 'r1'));
        // Round-level fields come from the round...
        assert.equal(view.format, 'individual');
        assert.equal(view.scoringMode, 'net');
        assert.equal(view.courseName, 'Test GC');
        assert.deepEqual(Object.keys(view.scores).length, 54);
        // ...event-level fields come from the event.
        assert.equal(view.name, 'Club Championship');
        assert.equal(view.scoringModel, 'player-v1');
        assert.deepEqual(Object.keys(view.players).sort(), ['pA', 'pB', 'pC']);
    });

    test('an unknown round id yields nothing rather than a half-built view', () => {
        assert.equal(engine.roundView(twoRoundEvent(), 'nosuchround'), null);
        assert.deepEqual(lbRound(twoRoundEvent(), 'nosuchround'), []);
    });

    test('the scoring functions never learn about rounds', () => {
        // The whole point of the boundary. If `rounds` appears inside the scoring
        // code, interpretation has leaked out of the one place that owns it.
        const eng = codeOf('tournament-engine.js');
        const slice = (name) => {
            const start = eng.indexOf('function ' + name);
            let depth = 0, end = eng.indexOf('{', start);
            for (let i = end; i < eng.length; i++) {
                if (eng[i] === '{') depth++;
                else if (eng[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            return eng.slice(start, end + 1);
        };
        ['computeTeamTotals', 'normalizeTeamEntries', 'normalizePlayerEntries',
         'computeTournamentLeaderboard'].forEach(fn =>
            assert.ok(!/\.rounds|eventRounds\(/.test(slice(fn)),
                fn + ' must not read the rounds node - roundView() owns that'));
    });
});

// ===========================================================================
// 3. HANDICAP SNAPSHOTS
// ===========================================================================

describe('SNAPSHOTS — a closed round does not move', () => {

    test('a round with a snapshot uses it, not the live handicap', () => {
        const d = twoRoundEvent();
        const bob = byName(lbRound(d, 'r1'), 'Bob');
        assert.equal(bob.strokesReceived, 18, 'Round 1 snapshotted Bob off 18');
        // Live, he is scratch - so Round 2 gives him nothing.
        assert.equal(byName(lbRound(d, 'r2'), 'Bob').strokesReceived, 0);
    });

    test('THE PROTECTION — changing a live handicap does not rewrite a closed round', () => {
        const d = twoRoundEvent();
        const before = lbRound(d, 'r1');
        d.players.pB.handicap = '36';
        d.players.pA.handicap = '12';
        assert.deepEqual(lbRound(d, 'r1'), before,
            'Saturday\u2019s result must not change because somebody was re-rated on Monday');
    });

    test('a round without a snapshot falls back to the live handicap', () => {
        // Which is exactly what a single-round record has always done, so nothing
        // about an existing event changes.
        const d = twoRoundEvent();
        assert.equal(byName(lbRound(d, 'r2'), 'Cal').hasScores, false);
        d.rounds.r2.scores = Object.assign({}, d.rounds.r2.scores, scoresFor('pC', 5));
        assert.equal(byName(lbRound(d, 'r2'), 'Cal').strokesReceived, 9, 'live 9 handicap applies');
        d.players.pC.handicap = '18';
        assert.equal(byName(lbRound(d, 'r2'), 'Cal').strokesReceived, 18, 'and follows the live value');
    });

    test('a snapshot is a per-round map keyed by player id, never by name', () => {
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /const snapshots = round\.handicaps \|\| \{\};/);
        assert.match(eng, /snapshots\[pid\] !== undefined/);
        assert.ok(!/snapshots\[p\.name\]|handicaps\[.*name/.test(eng),
            'two golfers called Dave Smith must not share a snapshot');
    });

    test('the snapshot does not mutate the event\u2019s player records', () => {
        const d = twoRoundEvent();
        engine.computeRoundLeaderboard(d, 'r1');
        assert.equal(d.players.pB.handicap, '0',
            'building a view must not write back onto the event');
    });
});

// ===========================================================================
// 4. WHICH ROUNDS COUNT
// ===========================================================================

describe('ROUND STATUS — setup rounds are not part of the competition', () => {

    test('open and closed rounds count; setup rounds do not', () => {
        const d = twoRoundEvent();
        assert.deepEqual(plain(engine.countableRoundIds(d)), ['r1', 'r2']);
        d.rounds.r3 = round('r3', { name: 'Monday', status: 'setup', createdAt: 3 });
        assert.deepEqual(plain(engine.countableRoundIds(d)), ['r1', 'r2'],
            'an empty round still being configured must not make everybody incomplete');
    });

    test('a missing status is treated as setup', () => {
        const d = twoRoundEvent();
        delete d.rounds.r2.status;
        assert.deepEqual(plain(engine.countableRoundIds(d)), ['r1']);
    });

    test('adding a setup round does not disturb the combined standings', () => {
        const d = twoRoundEvent();
        const before = standings(d);
        d.rounds.r3 = round('r3', { name: 'Monday', status: 'setup', createdAt: 3 });
        assert.deepEqual(standings(d), before);
    });
});

// ===========================================================================
// 5. WHAT CAN AND CANNOT BE COMBINED
// ===========================================================================

describe('COMPATIBILITY — combined standings are withheld, never invented', () => {

    test('a single-round event has no combined standings', () => {
        const r = standings(legacySingleRound());
        assert.equal(r.available, false);
        assert.match(r.reason, /single round/);
        assert.deepEqual(r.rows, []);
    });

    test('team and individual rounds cannot be added up', () => {
        // A scramble round produces team rows and an individual round produces player
        // rows. There is no shared competitive entity, and a conversion would be an
        // invention.
        const d = twoRoundEvent();
        d.rounds.r3 = round('r3', { name: 'Scramble Day', status: 'open', createdAt: 3, format: 'scramble' });
        const r = standings(d);
        assert.equal(r.available, false);
        // MATCHED ON THE MIXED WORDING SPECIFICALLY. A looser match on "Individual
        // Stroke Play" also matched the team-only refusal below it, so disabling this
        // branch entirely left the test green - the refusal was still happening, but
        // for the wrong reason and with the wrong explanation.
        assert.match(r.reason, /mixes team rounds with Individual Stroke Play/);
        assert.match(r.reason, /cannot be added together/);
    });

    test('gross and net rounds cannot be added up', () => {
        const d = twoRoundEvent();
        d.rounds.r2.scoringMode = 'gross';
        const r = standings(d);
        assert.equal(r.available, false);
        assert.match(r.reason, /Gross and Net/);
    });

    test('round leaderboards keep working when combined standings are refused', () => {
        // The refusal withholds one column, not the event.
        const d = twoRoundEvent();
        d.rounds.r2.scoringMode = 'gross';
        assert.equal(standings(d).available, false);
        assert.equal(lbRound(d, 'r1').length, 3);
        assert.equal(lbRound(d, 'r2').length, 3);
    });

    test('an event with no open rounds says so', () => {
        const d = twoRoundEvent();
        d.rounds.r1.status = 'setup';
        d.rounds.r2.status = 'setup';
        const r = standings(d);
        assert.equal(r.available, false);
        assert.match(r.reason, /No rounds are open/);
    });

    test('every refusal carries a reason an organizer can read', () => {
        const cases = [legacySingleRound()];
        const mixed = twoRoundEvent();
        mixed.rounds.r3 = round('r3', { status: 'open', createdAt: 3, format: 'scramble' });
        cases.push(mixed);
        cases.forEach(d => {
            const r = standings(d);
            assert.equal(r.available, false);
            assert.ok(typeof r.reason === 'string' && r.reason.length > 20,
                'a refusal without an explanation is indistinguishable from a bug');
        });
    });
});

// ===========================================================================
// 6. COMBINED STANDINGS
// ===========================================================================

describe('COMBINED STANDINGS — summed by id, ranked by completeness first', () => {

    test('totals are summed across countable rounds, by player id', () => {
        const d = twoRoundEvent();
        const r = standings(d);
        assert.equal(r.available, true);
        const ann = byName(r.rows, 'Ann');
        assert.equal(ann.roundsPlayed, 2);
        assert.equal(ann.strokes, 144, 'two rounds of 72');
        assert.equal(ann.toPar, 0);
    });

    test('THE COMPLETENESS RULE — a missed round cannot buy the lead', () => {
        // Cal played one round at +9. Bob played two at +18 total. A naive sum would
        // put Cal ahead; he ranks behind because he has not completed the event.
        const d = twoRoundEvent();
        const rows = standings(d).rows;
        const cal = byName(rows, 'Cal');
        const bob = byName(rows, 'Bob');
        assert.equal(cal.toPar, 9);
        assert.equal(bob.toPar, 18, 'Bob\u2019s raw score is worse');
        assert.ok(bob.rank < cal.rank, 'and he still ranks ahead, because he played both rounds');
        assert.equal(cal.roundsComplete, 1);
        assert.equal(cal.completedAll, false);
        assert.equal(bob.completedAll, true);
    });

    test('among equally complete golfers, the competition result decides', () => {
        const d = twoRoundEvent();
        const rows = standings(d).rows;
        const ann = byName(rows, 'Ann');
        const bob = byName(rows, 'Bob');
        assert.equal(ann.completedAll, true);
        assert.equal(bob.completedAll, true);
        assert.ok(ann.toPar < bob.toPar);
        assert.equal(ann.rank, 1);
        assert.equal(bob.rank, 2);
    });

    test('more completed rounds ranks ahead of fewer, among the incomplete', () => {
        const d = twoRoundEvent();
        d.rounds.r3 = round('r3', {
            name: 'Monday', status: 'open', createdAt: 3, scoringMode: 'net',
            scores: Object.assign({}, scoresFor('pA', 4), scoresFor('pC', 4)),
        });
        const rows = standings(d).rows;
        // Cal now has two of three; Bob has two of three as well but a worse score.
        const cal = byName(rows, 'Cal');
        const bob = byName(rows, 'Bob');
        assert.equal(cal.roundsComplete, 2);
        assert.equal(bob.roundsComplete, 2);
        assert.ok(cal.toPar < bob.toPar);
        assert.ok(cal.rank < bob.rank, 'equal completeness, better score wins');
    });

    test('a partly played round counts what was played, and is not complete', () => {
        const d = twoRoundEvent();
        d.rounds.r2.scores = Object.assign({}, d.rounds.r2.scores, scoresFor('pC', 5, 9));
        const cal = byName(standings(d).rows, 'Cal');
        assert.equal(cal.roundsPlayed, 2, 'nine holes is still having played');
        assert.equal(cal.roundsComplete, 1, 'but it is not a completed round');
        assert.equal(cal.completedAll, false);
    });

    test('among the incomplete, MORE completed rounds still ranks ahead', () => {
        // The gap a negative control found: every existing fixture compared golfers
        // with the SAME number of completed rounds, so deleting the roundsComplete
        // comparison changed nothing any test could see. Here Cal has completed one
        // of three with a better score, Bob two of three with a worse one - and Bob
        // must still be ahead, because he has played more of the event.
        const d = twoRoundEvent();
        d.rounds.r3 = round('r3', {
            name: 'Monday', status: 'open', createdAt: 3, scoringMode: 'net',
            scores: Object.assign({}, scoresFor('pA', 4)),
        });
        d.rounds.r2.scores = Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 5));
        d.rounds.r1.scores = Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 5), scoresFor('pC', 4));
        const rows = standings(d).rows;
        const bob = byName(rows, 'Bob');
        const cal = byName(rows, 'Cal');
        assert.equal(bob.roundsComplete, 2);
        assert.equal(cal.roundsComplete, 1);
        assert.ok(cal.toPar < bob.toPar, 'the fixture must give the LESS complete golfer the better score');
        assert.ok(bob.rank < cal.rank,
            'more of the event played ranks ahead of a better score over less of it');
    });

    test('ties are shared ranks, as everywhere else in this engine', () => {
        const d = twoRoundEvent();
        d.rounds.r1.handicaps.pB = '0';
        d.rounds.r1.scores = Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 4), scoresFor('pC', 5));
        d.rounds.r2.scores = Object.assign({}, scoresFor('pA', 4), scoresFor('pB', 4));
        const rows = standings(d).rows;
        const ann = byName(rows, 'Ann');
        const bob = byName(rows, 'Bob');
        assert.equal(ann.toPar, bob.toPar);
        assert.equal(ann.rank, bob.rank, 'identical results share a rank');
    });

    test('a golfer with no scores anywhere gets no rank', () => {
        const d = twoRoundEvent();
        d.players.pD = { id: 'pD', name: 'Dee', handicap: '5' };
        const dee = byName(standings(d).rows, 'Dee');
        assert.equal(dee.hasScores, false);
        assert.equal(dee.rank, null, 'not having teed off is not a position');
    });

    test('two golfers with the same name stay two competitors', () => {
        const d = twoRoundEvent();
        d.players.pB.name = 'Ann';
        const rows = standings(d).rows;
        const anns = rows.filter(r => r.playerName === 'Ann');
        assert.equal(anns.length, 2);
        assert.notEqual(anns[0].playerId, anns[1].playerId);
        assert.notEqual(anns[0].strokes, anns[1].strokes);
    });

    test('flights filter the combined board without re-ranking it', () => {
        const d = twoRoundEvent();
        d.flights = { f1: { id: 'f1', name: 'A', createdAt: 1 } };
        d.players.pA.flightId = 'f1';
        d.players.pC.flightId = 'f1';
        const flight = standings(d, 'f1').rows;
        assert.deepEqual(flight.map(r => r.playerName).sort(), ['Ann', 'Cal']);
        assert.equal(flight[0].playerName, 'Ann');
        assert.equal(flight[0].rank, 1, 'a flight is its own competition');
        assert.equal(standings(d).rows.length, 3, 'and Overall still holds everyone');
    });
});

// ===========================================================================
// 7. ONE RANKING PATH, AND HISTORY UNTOUCHED
// ===========================================================================

describe('ONE RANKING PATH — round, flight and combined share it', () => {

    test('there is exactly one sort and one rank pass in the engine', () => {
        const eng = codeOf('tournament-engine.js');
        assert.equal((eng.match(/rows\.sort\(/g) || []).length, 1, 'one sort');
        assert.equal((eng.match(/r\.rank = idx \+ 1;/g) || []).length, 1, 'one rank pass');
        assert.equal((eng.match(/function rankRows/g) || []).length, 1);
    });

    test('both boards go through rankRows', () => {
        const eng = codeOf('tournament-engine.js');
        const lb = eng.slice(eng.indexOf('function computeTournamentLeaderboard'),
                             eng.indexOf('function computeTournamentPayouts'));
        assert.match(lb, /return rankRows\(/);
        // Sliced by brace matching. A fixed 4000-character window ran past the end of
        // computeEventStandings and into rankRows itself, then reported rankRows'
        // own sort as a second sort inside the combined board.
        const start = eng.indexOf('function computeEventStandings');
        let depth = 0, end = eng.indexOf('{', start);
        for (let i = end; i < eng.length; i++) {
            if (eng[i] === '{') depth++;
            else if (eng[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const st = eng.slice(start, end + 1);
        assert.match(st, /rankRows\(rows,/);
        assert.ok(!/rows\.sort\(/.test(st),
            'the combined board must not sort for itself');
    });

    test('an entry without scores never gets a numeric rank, on any board', () => {
        const d = twoRoundEvent();
        d.players.pD = { id: 'pD', name: 'Dee', handicap: '5' };
        assert.equal(byName(lbRound(d, 'r1'), 'Dee').rank, null);
        assert.equal(byName(standings(d).rows, 'Dee').rank, null);
    });
});

describe('HISTORY — every existing tournament is untouched', () => {

    test('a legacy single-round event ranks exactly as before', () => {
        const rows = plain(engine.computeTournamentLeaderboard(legacySingleRound()));
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map(r => r.teamName), ['Alpha', 'Bravo']);
        assert.equal(rows[0].entryType, 'team');
    });

    test('legacy score keys and the flat team handicap are unchanged', () => {
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /scores\[`team\$\{team\.num\}_h\$\{h\.hole\}`\]/);
        assert.match(eng, /scores\[`team\$\{team\.num\}_p\$\{pIdx\}_h\$\{h\.hole\}`\]/);
        assert.match(eng, /totals\.strokes - handicap/);
        const d = legacySingleRound();
        d.teams.team2.handicap = 18;
        assert.equal(plain(engine.computeTournamentLeaderboard(d))
            .find(r => r.teamName === 'Bravo').toPar, 0);
    });

    test('the player-v1 single-round shape still works with no rounds node', () => {
        const single = {
            scoringModel: 'player-v1', scoringMode: 'net', format: 'individual',
            courseData: CD18, courseIndexSynthetic: false,
            players: { pX: { id: 'pX', name: 'Solo', handicap: '18' } },
            scores: scoresFor('pX', 5),
        };
        const row = plain(engine.computeTournamentLeaderboard(single))[0];
        assert.equal(row.strokesReceived, 18);
        assert.equal(row.toPar, 0);
        assert.equal(engine.isMultiRound(single), false);
    });

    test('nothing migrates, backfills or rewrites', () => {
        const eng = codeOf('tournament-engine.js');
        assert.ok(!/migrateRound|backfillRound|upgradeEvent|ensureRounds/i.test(eng));
        // roundView builds a view; it must not write to what it was given.
        const d = twoRoundEvent();
        const snapshot = JSON.stringify(d);
        engine.computeEventStandings(d);
        engine.computeRoundLeaderboard(d, 'r1');
        assert.equal(JSON.stringify(d), snapshot, 'reading an event must not modify it');
    });

    test('the shared modules are still the only owners', () => {
        const eng = codeOf('tournament-engine.js');
        assert.ok(!/function getStrokes|function parseHcp/.test(eng),
            'handicap primitives must not be copied into the tournament engine');
        assert.ok(!/lastPos\s*=\s*rank\s*\+|sumForGroup/.test(eng),
            'the place and tie payout rule must not be rebuilt here');
        assert.match(eng, /allocatePlacePayouts\(scoredRows, spotAmounts\)/);
    });
});

// ===========================================================================
// 8. ORGANIZER ROUND MANAGEMENT  (Checkpoint C)
// ===========================================================================

describe('ROUND MANAGEMENT — created, ordered, locked when it matters', () => {

    const src = () => codeOf('tournament.html');

    test('a multi-round event declares itself at creation', () => {
        assert.match(src(), /payload\.eventModel = ROUND_MODEL;/);
        assert.match(src(), /payload\.rounds = \{\};/);
        // And the setup card becomes Round 1 rather than being entered twice.
        assert.match(src(), /pendingFirstRound = \{[\s\S]{0,400}name: 'Round 1'/);
    });

    test('a round id is minted, never derived from its name or position', () => {
        assert.match(src(), /function newRoundId\(\) \{ return mintId\('r'\); \}/);
        assert.ok(!/rounds\/\$\{name\}|rounds\/\$\{n\}|rounds\/\$\{i\}/.test(src()),
            'a round must never be keyed by its label or its index');
    });

    test('a new round is created in SETUP, never open', () => {
        const create = fnBody(src(), 'createRound');
        assert.match(create, /status: 'setup'/);
        assert.ok(!/status: 'open'/.test(create),
            'a round nobody has configured must not accept scores');
    });

    test('reordering writes sortOrder and never rewrites createdAt', () => {
        // When a round was made is a fact; where it sits in the schedule is a
        // decision. Rewriting the timestamp to express the second destroys the first.
        const move = fnBody(src(), 'moveRound');
        assert.match(move, /sortOrder/);
        assert.ok(!/createdAt/.test(move), 'a reorder must not touch createdAt');
    });

    test('sortOrder is honoured ahead of creation time, and falls back to it', () => {
        const d = twoRoundEvent();
        assert.deepEqual(plain(engine.orderedRoundIds(d)), ['r1', 'r2']);
        d.rounds.r1.sortOrder = 1;
        d.rounds.r2.sortOrder = 0;
        assert.deepEqual(plain(engine.orderedRoundIds(d)), ['r2', 'r1']);
        // A round never placed deliberately sits after those that were.
        delete d.rounds.r2.sortOrder;
        assert.deepEqual(plain(engine.orderedRoundIds(d)), ['r1', 'r2']);
    });

    test('countable rounds use the SAME ordering, not a second sort', () => {
        const d = twoRoundEvent();
        d.rounds.r1.sortOrder = 1;
        d.rounds.r2.sortOrder = 0;
        assert.deepEqual(plain(engine.countableRoundIds(d)), ['r2', 'r1'],
            'the two orderings must never disagree about which round is first');
    });

    test('a round with scores cannot be deleted', () => {
        const del = fnBody(src(), 'deleteRound');
        assert.match(del, /Object\.keys\(r\.scores \|\| \{\}\)\.length > 0/);
        assert.ok(del.indexOf('length > 0') < del.indexOf('.remove()'),
            'the guard must run before the delete');
    });

    test('opening a round takes the handicap snapshot, once', () => {
        const fn = fnBody(src(), 'setRoundStatus');
        assert.match(fn, /status === 'open' && !round\.handicaps/,
            'a round already holding a snapshot must not have it retaken');
        assert.match(fn, /updates\[`\$\{rid\}\/handicaps`\] = snap;/);
        // Reopening a closed round must NOT re-handicap it - it was played off those
        // numbers, and fixing a scorecard is not a reason to change them.
        assert.ok(!/status === 'closed'[\s\S]{0,120}handicaps/.test(fn));
    });

    test('a round\u2019s course and format lock once it opens', () => {
        // Changing a par or a scoring mode underneath entered scores reinterprets
        // them: a par-4 becoming a par-5, or a gross round becoming net.
        const fn = fnBody(src(), 'renderRoundEditor');
        assert.match(fn, /const locked = roundStatus\(r\) !== 'setup';/);
        assert.match(fn, /if \(locked\)/);
        assert.match(fn, /can no longer be changed/, 'and the organizer is told why');
    });
});

// ===========================================================================
// 9. ROUND-SCOPED LINKS AND SCORING  (Checkpoint D)
// ===========================================================================

describe('ROUND-SCOPED SCORING — the right round, or none', () => {

    const card = () => codeOf('tournament-scorecard.html');

    test('a group link carries its round when the event has rounds', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /const roundPart = rid \? `&round=\$\{rid\}` : '';/);
        assert.match(t, /\?tourney=\$\{currentCode\}&group=\$\{gid\}\$\{roundPart\}/);
        // Single-round events keep exactly the link already in circulation.
        assert.ok(!/&round=undefined|&round=null/.test(t));
    });

    test('the scorecard reads the round from the URL', () => {
        assert.match(card(), /urlParams\.get\('round'\)/);
        assert.match(card(), /urlParams\.get\('group'\)/);
        assert.match(card(), /urlParams\.get\('team'\)/, 'and the legacy contract survives');
    });

    test('a multi-round link without a round is refused, not guessed', () => {
        // Guessing "probably the open one" would post Saturday's scores into Sunday
        // the moment two rounds are open at once.
        assert.match(card(), /if \(multi && !myRoundId\)/);
        assert.match(card(), /doesn't say which one/);
    });

    test('round identity lives in the PATH, so a cross-round write is impossible', () => {
        assert.match(card(), /scorePath\(`\$\{playerId\}_h\$\{holeNum\}`\)/,
            'the key shape is unchanged - only where it is written moved');

        // EXECUTED, not scanned. Both branches appear in the source whichever one is
        // taken, so a mutation that always chose the event root left every source
        // assertion green - found by a negative control that stayed silent.
        const body = fnBody(card(), 'scorePath');
        const build = (roundId) => new Function('myRoundId', 'currentCode',
            body + '; return scorePath("pX_h1");')(roundId, 'ABCD');
        assert.equal(build('r1', 'ABCD'), 'tournaments/ABCD/rounds/r1/scores/pX_h1',
            'a multi-round score is written under its round');
        assert.equal(build(null, 'ABCD'), 'tournaments/ABCD/scores/pX_h1',
            'a single-round event writes exactly where it always did');
    });

    test('a round that is not open does not take scores', () => {
        assert.match(card(), /const status = multi \? view\.roundStatus : 'open';/);
        assert.match(card(), /roundLocked = \(status !== 'open'\);/);
        const fn = fnBody(card(), 'saveIndividualScore');
        assert.match(fn, /if \(roundLocked\) return;/);
        assert.ok(fn.indexOf('roundLocked') < fn.indexOf('db.ref('),
            'the lock must be checked before the write');
    });

    test('a locked round says which kind of locked it is', () => {
        assert.match(card(), /This round is closed — scores are final/);
        assert.match(card(), /This round is not open for scoring yet/);
    });

    test('the scorecard renders through the same roundView seam the engine uses', () => {
        assert.match(card(), /const view = multi \? roundView\(currentData, myRoundId\) : currentData;/);
        assert.ok(!/rounds\[myRoundId\]\.courseData|rounds\[myRoundId\]\.format/.test(card()),
            'the card must not reach into the rounds node itself');
    });

    test('groups belong to the round, through one path helper', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /function groupsPath\(\)/);
        assert.match(t, /rounds\/\$\{editingRoundId\}\/scoringGroups/);
        assert.match(t, /tournaments\/\$\{currentCode\}\/scoringGroups/,
            'a single-round event keeps groups where they were');
    });
});

// ===========================================================================
// 10. EVENT DASHBOARD  (Checkpoint E)
// ===========================================================================

describe('EVENT VIEW — one renderer, three sources', () => {

    const src = () => codeOf('tournament.html');

    test('the round selector only exists for a multi-round event', () => {
        const fn = fnBody(src(), 'renderLeaderboardRoundFilter');
        assert.match(fn, /if \(!recordIsMultiRound\(\)\) \{ el\.style\.display = 'none'/);
    });

    test('a deleted round drops the view back to the combined board', () => {
        const fn = fnBody(src(), 'renderLeaderboardRoundFilter');
        assert.match(fn, /!rounds\[lbRoundId\]\) lbRoundId = null;/);
    });

    test('one row renderer serves round, flight and combined boards', () => {
        const s = src();
        assert.equal((s.match(/function renderLeaderboardRows/g) || []).length, 1);
        assert.equal((s.match(/<span class="lb-pos">/g) || []).length, 2,
            'one header cell and one body cell - not a second table');
    });

    test('a refusal shows its reason and leaves the round boards working', () => {
        const fn = fnBody(src(), 'renderLeaderboard');
        assert.match(fn, /if \(!result\.available\)/);
        assert.match(fn, /note\.textContent = result\.reason;/);
        assert.match(fn, /Pick a round above to see its leaderboard/);
    });

    test('an incomplete event entry is marked, not hidden', () => {
        const fn = fnBody(src(), 'renderLeaderboardRows');
        assert.match(fn, /!r\.completedAll/);
        assert.match(fn, /\(incomplete\)/);
        assert.match(fn, /r\.roundsComplete\}\/\$\{r\.countableRounds/,
            'the event board counts rounds where a round board counts holes');
    });

    test('every board caches the UNFILTERED field for the prize calculator', () => {
        const fn = fnBody(src(), 'renderLeaderboard');
        assert.match(fn, /cachedLeaderboardRows = computeEventStandings\(currentData\)\.rows/);
        assert.match(fn, /cachedLeaderboardRows = computeRoundLeaderboard\(currentData, viewing\);/);
        assert.ok(!/cachedLeaderboardRows = rows;/.test(fn));
    });
});
