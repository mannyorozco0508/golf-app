// ============================================================================
// FLIGHTS / DIVISIONS — a filter on the field, not a second competition
//
// A men's club splits its field into divisions and pays each one, but every
// division is scored by the same rule. So a flight in this app narrows WHICH teams
// are ranked and changes nothing about HOW they are ranked - there is exactly one
// implementation of "who won", and the flight view reaches it by passing a smaller
// set of teams into the same function.
//
// ---------------------------------------------------------------------------
// WHAT THIS WAVE DELIBERATELY IS NOT
// ---------------------------------------------------------------------------
//
// The Phase 0 audit found that Tournament stores players as bare strings inside
// teams, and that score keys use ARRAY POSITION as player identity
// (team{n}_p{i}_h{h}). Fixing that means a new score-key shape for new records and
// an adapter for old ones - a change to what gets written, which deserves a wave
// where it is the only thing happening.
//
// Flights need none of it. They are a new optional node and one optional field, so
// this wave adds capability without touching a single storage contract. Tests below
// pin that boundary in both directions: flights work, and none of the deferred
// model has leaked in.
//
// ---------------------------------------------------------------------------
// HOW THESE TESTS WORK
// ---------------------------------------------------------------------------
//
// The engine is executed. The organizer UI is source-scanned, because create,
// rename, delete and assign are Firebase writes behind DOM handlers - what matters
// there is which path is written and what guards it, which is a property of the
// source. Nothing reimplements the ranking rule: every expectation about standings
// comes from running computeTournamentLeaderboard itself.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const engine = loadJsFile('tournament-engine.js');

// Comments describe intent and name things on purpose; only executable source can
// break a contract.
function codeOf(file) {
    let src = read(file);
    if (file.endsWith('.html')) src = src.replace(/<!--[\s\S]*?-->/g, '');
    return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------
// FIXTURES
//
// Nine holes of par 4. Scramble, because it is the format with the simplest score
// key - the flight logic under test is about which teams are ranked, not how a
// team's strokes are totalled.
// ---------------------------------------------------------------------------

const CD9 = Array.from({ length: 9 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function team(num, name, opts) {
    return Object.assign({ num: num, name: name, players: ['P' + num], handicap: 0 }, opts || {});
}

// Six teams across two flights plus one unassigned, with deliberately engineered
// ties: teams 1 and 2 tie inside the Championship flight, and teams 4 and 5 tie
// inside flight A - so tie behaviour can be compared between a flight and the field.
function sixTeamField() {
    const teams = {
        team1: team(1, 'Alpha', { flightId: 'champ' }),
        team2: team(2, 'Bravo', { flightId: 'champ' }),
        team3: team(3, 'Charlie', { flightId: 'champ' }),
        team4: team(4, 'Delta', { flightId: 'aflight' }),
        team5: team(5, 'Echo', { flightId: 'aflight' }),
        team6: team(6, 'Foxtrot'),
    };
    const strokesPerHole = { 1: 4, 2: 4, 3: 5, 4: 3, 5: 3, 6: 6 };
    const scores = {};
    Object.values(teams).forEach(t => {
        CD9.forEach(h => { scores[`team${t.num}_h${h.hole}`] = strokesPerHole[t.num]; });
    });
    return {
        name: 'Club Day', format: 'scramble', courseName: 'Test GC',
        courseData: CD9, teams: teams, scores: scores,
        flights: {
            champ: { id: 'champ', name: 'Championship', createdAt: 1 },
            aflight: { id: 'aflight', name: 'A Flight', createdAt: 2 },
        },
    };
}

// A tournament stored before flights existed: no flights node, no flightId anywhere.
function legacyField() {
    const teams = {
        team1: team(1, 'Alpha'),
        team2: team(2, 'Bravo'),
        team3: team(3, 'Charlie'),
    };
    const scores = {};
    [4, 5, 4].forEach((v, i) => CD9.forEach(h => { scores[`team${i + 1}_h${h.hole}`] = v; }));
    return { name: 'Old Event', format: 'scramble', courseName: 'Test GC',
             courseData: CD9, teams: teams, scores: scores };
}

const lb = (data, fid) => plain(engine.computeTournamentLeaderboard(data, fid));
const names = (rows) => rows.map(r => r.teamName);
const ranks = (rows) => rows.map(r => r.rank);

// ===========================================================================
// 1. THE MODEL
// ===========================================================================

describe('FLIGHT MODEL — stable ids, organizer names', () => {

    test('1. a flight id is minted, never derived from the name', () => {
        // Organizers rename divisions mid-setup. If the name were the key, every team
        // assigned to it would silently fall out of the flight.
        const src = codeOf('tournament.html');
        assert.match(src, /function newFlightId\(\)/);
        assert.match(src, /return prefix \+ Date\.now\(\)\.toString\(36\)/,
            'the id must be generated, not built from the display name');
        assert.ok(!/flights\/\$\{name\}|flights\/\$\{.*Name\}/.test(src),
            'a flight must never be keyed by its display name');
        assert.match(src, /flights\/\$\{fid\}/, 'writes are keyed by the minted id');

        // THE ID MUST COME FROM THE GENERATOR. Checking only that newFlightId()
        // exists and that the write uses ${fid} is not enough - a mutation that set
        // `const fid = name` satisfied both and still keyed the flight by its label.
        // Found by a negative control that stayed green; the assertion is now on
        // where fid gets its value.
        const create = src.slice(src.indexOf('function createFlight'),
                                 src.indexOf('function createFlight') + 1400);
        assert.match(create, /const fid = newFlightId\(\);/,
            'the id must be minted, not taken from the form');
        // newFlightId now delegates to the shared minter that players and groups use,
        // so the guarantee it must carry is delegation - not a particular expression.
        assert.match(src, /function newFlightId\(\) \{ return mintId\('f'\); \}/,
            'flight ids come from the one generator, not a second scheme');
        assert.ok(!/(const|let|var)\s+fid\s*=\s*(name|trimmed|input)/.test(create),
            'fid must never be assigned from the display name or the input');
    });

    test('1a. a generated id does not look like anything an organizer typed', () => {
        // Executed, not scanned. Two flights created in the same millisecond must
        // still get different ids, or a fast paste could collapse them.
        // Sliced by brace matching rather than a fixed character count - a fixed slice
        // cut the function mid-expression and threw a syntax error that looked like a
        // production fault.
        // Pulls in the shared minter and its counter, since newFlightId delegates.
        const src = codeOf('tournament.html');
        const start = src.indexOf('let idSeq = 0;');
        const fn = new Function(src.slice(start, src.indexOf('function newGroupId'))
            + " function newFlightId() { return mintId('f'); } return newFlightId;")();
        const ids = new Set(Array.from({ length: 200 }, () => fn()));
        assert.equal(ids.size, 200, 'ids must not collide');
        ids.forEach(id => assert.match(id, /^f[a-z0-9]+$/,
            'an id must be an opaque token, not a label'));
    });

    test('1b. renaming a flight does not move any team out of it', () => {
        // The behavioural consequence of the above, proved on the engine rather than
        // the source: change the label, standings are untouched.
        const data = sixTeamField();
        const before = lb(data, 'champ');
        data.flights.champ.name = 'First Flight';
        assert.deepEqual(lb(data, 'champ'), before);
    });

    test('2. duplicate flight names are refused, on create and on rename', () => {
        // Two flights called "A" are indistinguishable in the filter and the dropdown,
        // so a duplicate is a mis-tap rather than an intention. Guarded, not allowed.
        const src = codeOf('tournament.html');
        const create = src.slice(src.indexOf('function createFlight'), src.indexOf('function createFlight') + 1400);
        assert.match(create, /toLowerCase\(\) === name\.toLowerCase\(\)/,
            'createFlight must reject a name that already exists');
        assert.match(create, /already a flight called/);
        const rename = src.slice(src.indexOf('function renameFlight'), src.indexOf('function renameFlight') + 1200);
        assert.match(rename, /other !== fid/, 'renaming must ignore the flight being renamed');
        assert.match(rename, /already a flight called/);
    });

    test('3. the organizer can create a flight', () => {
        const src = codeOf('tournament.html');
        assert.match(src, /db\.ref\(`tournaments\/\$\{currentCode\}\/flights\/\$\{fid\}`\)\s*\n?\s*\.set\(\{ id: fid, name: name, createdAt: Date\.now\(\) \}\)/,
            'a flight is stored as id, name and createdAt - nothing more');
    });

    test('4. the organizer can rename a flight, and only the name changes', () => {
        const src = codeOf('tournament.html');
        assert.match(src, /flights\/\$\{fid\}\/name`\)\.set\(trimmed\)/,
            'a rename must write only the name field');
        assert.match(src, /if \(!trimmed\) return;/,
            'an empty rename is a mis-tap and must leave the old name alone');
    });

    test('5 & 6. an unused flight deletes; a used one is refused with a reason', () => {
        const src = codeOf('tournament.html');
        const del = src.slice(src.indexOf('function deleteFlight'), src.indexOf('function deleteFlight') + 1200);
        assert.match(del, /const counts = flightTeamCounts\(currentData\)/,
            'the guard must count real assignments, not trust the UI');
        assert.match(del, /if \(inUse > 0\)/);
        assert.match(del, /still has \$\{inUse\} team/,
            'the organizer must be told how many teams are in the way');
        assert.match(del, /flights\/\$\{fid\}`\)\.remove\(\)/);
        // The refusal must come BEFORE the remove, or it is not a guard.
        assert.ok(del.indexOf('if (inUse > 0)') < del.indexOf('.remove()'),
            'the in-use check must precede the delete');
    });

    test('6b. deleting a used flight would orphan its teams — which is why it is blocked', () => {
        // The reason the guard exists, stated as behaviour: a team pointing at a
        // missing flight is counted as unassigned, and nobody would be told.
        const data = sixTeamField();
        assert.equal(plain(engine.flightTeamCounts(data)).champ, 3);
        delete data.flights.champ;
        const counts = plain(engine.flightTeamCounts(data));
        assert.equal(counts.champ, undefined, 'a deleted flight has no count');
        assert.equal(counts.__unassigned, 4,
            'its three teams fall back to unassigned rather than vanishing from every count');
    });

    test('7, 8 & 9. a team can be assigned, moved, and unassigned', () => {
        const src = codeOf('tournament.html');
        const assign = src.slice(src.indexOf('function assignTeamToFlight'),
                                 src.indexOf('function assignTeamToFlight') + 700);
        assert.match(assign, /teams\/\$\{teamId\}\/flightId`\)/,
            'assignment writes one optional field on the team');
        // Unassigning REMOVES the field rather than storing '', so an unassigned team
        // is byte-identical to a team from before flights existed.
        assert.match(assign, /\(fid \? ref\.set\(fid\) : ref\.remove\(\)\)/);
    });

    test('7b. assignment and movement behave correctly on the engine', () => {
        const data = sixTeamField();
        assert.deepEqual(names(lb(data, 'aflight')).sort(), ['Delta', 'Echo']);
        data.teams.team6.flightId = 'aflight';                       // assign
        assert.deepEqual(names(lb(data, 'aflight')).sort(), ['Delta', 'Echo', 'Foxtrot']);
        data.teams.team6.flightId = 'champ';                          // move
        assert.ok(names(lb(data, 'champ')).includes('Foxtrot'));
        assert.ok(!names(lb(data, 'aflight')).includes('Foxtrot'));
        delete data.teams.team6.flightId;                             // unassign
        assert.ok(!names(lb(data, 'champ')).includes('Foxtrot'));
        assert.ok(names(lb(data)).includes('Foxtrot'), 'unassigned teams still compete overall');
    });

    test('a team pointing at a deleted flight counts as unassigned, not as a ghost flight', () => {
        const data = sixTeamField();
        data.teams.team6.flightId = 'nosuchflight';
        const counts = plain(engine.flightTeamCounts(data));
        assert.equal(counts.nosuchflight, undefined);
        assert.deepEqual(Object.keys(counts).sort(), ['__unassigned', 'aflight', 'champ']);
    });
});

// ===========================================================================
// 2. HISTORICAL COMPATIBILITY
// ===========================================================================

describe('HISTORICAL — a tournament from before flights is unchanged', () => {

    test('10 & 11. a record with no flights node and no flightId loads and ranks', () => {
        const legacy = legacyField();
        const rows = lb(legacy);
        assert.equal(rows.length, 3);
        assert.deepEqual(names(rows), ['Alpha', 'Charlie', 'Bravo']);
        assert.deepEqual(ranks(rows), [1, 1, 3], 'competition ranking is untouched');
    });

    test('12. Overall is byte-for-behaviour identical with and without the flights node', () => {
        // The load-bearing compatibility assertion. Adding flights to a record must
        // not move a single row of its overall standings.
        const withFlights = sixTeamField();
        const withoutFlights = sixTeamField();
        delete withoutFlights.flights;
        Object.values(withoutFlights.teams).forEach(t => { delete t.flightId; });
        // Compared on the fields that decide the competition, not on the whole row:
        // a row now carries its own flightId, so the two sets differ by exactly the
        // tag under test. Everything that decides who won must match.
        const ranked = (rows) => rows.map(r => ({
            num: r.num, teamName: r.teamName, strokes: r.strokes,
            thru: r.thru, toPar: r.toPar, hasScores: r.hasScores, rank: r.rank,
        }));
        assert.deepEqual(ranked(lb(withFlights)), ranked(lb(withoutFlights)),
            'flight metadata must be invisible to the overall standings');
    });

    test('nothing is migrated or rewritten on load', () => {
        const src = codeOf('tournament.html');
        assert.ok(!/migrateFlight|backfillFlight|repairFlight|ensureFlights/i.test(src),
            'historical records are read as they are, never rewritten');
        // loadTournament must not write anything at all.
        const load = src.slice(src.indexOf('function loadTournament'), src.indexOf('function loadTournament') + 2600);
        assert.ok(!/\.set\(|\.update\(|\.remove\(/.test(load),
            'opening a tournament must not write to it');
    });

    test('17. team handicap behaviour is untouched', () => {
        const legacy = legacyField();
        legacy.teams.team2.handicap = 9;
        const rows = lb(legacy);
        const bravo = rows.find(r => r.teamName === 'Bravo');
        // Nine holes of 5 against par 4 is +9 gross; a flat 9 handicap makes it level.
        assert.equal(bravo.toPar, 0, 'flat team handicap subtraction must not change');
        // The rule, not the line. The flat team-handicap subtraction moved into
        // normalizeTeamEntries() when the engine learned to read a second storage
        // model; pinning the old literal was pinning where the code lived rather than
        // what it does. The behavioural assertion above is the real guard, and this
        // keeps the arithmetic visible.
        assert.match(codeOf('tournament-engine.js'),
            /totals\.strokes - handicap/,
            'a team is still handicapped by one flat number for the whole round');
        // Scoped to the function body by brace matching. A proximity regex matched
        // playerStrokesOnHole() sitting just above and reported a fault that was not
        // there - a false positive is as much of a broken test as a false negative.
        const eng = codeOf('tournament-engine.js');
        const start = eng.indexOf('function normalizeTeamEntries');
        let depth = 0, end = eng.indexOf('{', start);
        for (let i = end; i < eng.length; i++) {
            if (eng[i] === '{') depth++;
            else if (eng[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const teamBody = eng.slice(start, end + 1);
        assert.ok(!/getStrokes\(|parseHcp\(/.test(teamBody),
            'legacy team scoring must not acquire per-hole stroke allocation');
    });

    test('15. the stored score keys are unchanged', () => {
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /scores\[`team\$\{team\.num\}_h\$\{h\.hole\}`\]/);
        assert.match(eng, /scores\[`team\$\{team\.num\}_p\$\{pIdx\}_h\$\{h\.hole\}`\]/);
        const card = codeOf('tournament-scorecard.html');
        assert.match(card, /scores\/team\$\{myTeamNum\}_h\$\{holeNum\}/);
        assert.match(card, /scores\/team\$\{myTeamNum\}_p\$\{playerIdx\}_h\$\{holeNum\}/);
    });

    test('16. scoring links are still team-based, never flight-based', () => {
        const src = codeOf('tournament.html');
        assert.match(src, /\$\{scorecardBaseUrl\(\)\}\?tourney=\$\{currentCode\}&team=\$\{t\.num\}/);
        assert.ok(!/[?&]flight=/.test(src),
            'a flight is a division, not a scorecard - links stay team-scoped');
        assert.match(codeOf('tournament-scorecard.html'), /urlParams\.get\('team'\)/);
        assert.ok(!/flight/i.test(codeOf('tournament-scorecard.html')),
            'the golfer scoring surface has no business knowing about flights');
    });
});

// ===========================================================================
// 3. ONE RANKING PATH
// ===========================================================================

describe('LEADERBOARD — the flight view filters, it does not re-rank', () => {

    test('13. a flight contains exactly its own teams, ranked from 1', () => {
        const data = sixTeamField();
        const champ = lb(data, 'champ');
        assert.deepEqual(names(champ).sort(), ['Alpha', 'Bravo', 'Charlie']);
        assert.equal(Math.min(...champ.map(r => r.rank)), 1,
            'a flight is its own competition - its winner is 1st, not 4th');
    });

    test('13b. Overall includes every team, flighted or not', () => {
        const data = sixTeamField();
        assert.equal(lb(data).length, 6);
        assert.equal(lb(data, null).length, 6, 'null means overall');
        assert.equal(lb(data, '').length, 6, 'empty string means overall');
    });

    test('14. tie handling inside a flight is identical to tie handling overall', () => {
        // Alpha and Bravo are level. They tie 1-1-3 in the Championship flight, and the
        // same pair ties inside the full field - because it is the same rank pass.
        const data = sixTeamField();
        const champ = lb(data, 'champ');
        assert.deepEqual(ranks(champ), [1, 1, 3], 'competition ranking, not 1-2-3');

        const overall = lb(data);
        const alpha = overall.find(r => r.teamName === 'Alpha');
        const bravo = overall.find(r => r.teamName === 'Bravo');
        assert.equal(alpha.rank, bravo.rank, 'the same two teams tie overall too');
    });

    test('14b. a flight row is the same row object the overall board produced', () => {
        // The strongest form: for every team in a flight, every computed field except
        // the rank matches its overall row exactly. Different ranks are the point -
        // different strokes, thru or toPar would mean a second scoring path.
        const data = sixTeamField();
        const overall = lb(data);
        ['champ', 'aflight'].forEach(fid => {
            lb(data, fid).forEach(row => {
                const same = overall.find(r => r.num === row.num);
                ['teamName', 'strokes', 'thru', 'toPar', 'hasScores']
                    .forEach(k => assert.deepEqual(row[k], same[k],
                        'flight row differs from overall row on ' + k));
            });
        });
    });

    test('4-control. there is exactly ONE ranking implementation', () => {
        // A copied sort for flights would be a second definition of "tied".
        const eng = codeOf('tournament-engine.js');
        assert.equal((eng.match(/function computeTournamentLeaderboard/g) || []).length, 1);
        // A second SORT appeared when events learned to aggregate rounds, and it is
        // legitimate - an event orders by completeness before score. The tie-and-rank
        // loop is what must stay single, and it does.
        assert.equal((eng.match(/r\.rank = idx \+ 1;/g) || []).length, 1,
            'ranks are assigned in exactly one place');
        assert.equal((eng.match(/function rankRows/g) || []).length, 1,
            'one definition of what counts as tied');
        assert.equal((eng.match(/rows\.sort\(/g) || []).length, 1,
            'and one sort, inside it - a round, a flight and an event share both');
        // And the pages must not rank anything themselves.
        ['tournament.html', 'tournament-scorecard.html'].forEach(p =>
            assert.ok(!/function computeTournamentLeaderboard/.test(codeOf(p)),
                p + ' must not own a leaderboard implementation'));
    });

    test('the flight filter runs before ranking, not after', () => {
        const eng = codeOf('tournament-engine.js');
        // The sort now lives in the shared rankRows() helper, so the ordering is
        // asserted at the call site instead: the filter is applied to the rows handed
        // IN, which means it can only run first. Filtering after ranking would leave
        // gaps in the flight positions.
        const fn = eng.slice(eng.indexOf('function computeTournamentLeaderboard'),
                             eng.indexOf('function computeTournamentPayouts'));
        assert.match(fn, /rankRows\(\s*\n?\s*normalizeLeaderboardEntries\(data\)\.filter\(r => !flightId \|\| r\.flightId === flightId\)/,
            'the flight filter must be applied to the rows before they reach the ranker');
        assert.ok(!/rows\.sort\(/.test(fn),
            'the leaderboard must not sort for itself - one ranking path only');
    });

    test('an empty flight ranks nothing rather than throwing', () => {
        const data = sixTeamField();
        data.flights.empty = { id: 'empty', name: 'Senior', createdAt: 3 };
        assert.deepEqual(lb(data, 'empty'), []);
    });
});

// ===========================================================================
// 4. PAYOUTS AND SCOPE
// ===========================================================================

describe('PAYOUTS — canonical, and deliberately still overall-only', () => {

    test('22. payout allocation goes through payouts.js', () => {
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /allocatePlacePayouts\(scoredRows, spotAmounts\)/);
        assert.ok(!/lastPos\s*=\s*rank\s*\+|sumForGroup/.test(eng),
            'the place and tie rule must not be rebuilt here');
    });

    test('9-control. the prize calculator reads the OVERALL board, not the filtered one', () => {
        // A deliberate product boundary, not an oversight. Paying places from a
        // filtered board would silently mean "3rd in the B flight takes third prize",
        // which is a prize policy nobody has specified - per-flight money needs its
        // own pot per flight.
        const src = codeOf('tournament.html');
        // Brace-matched: renderLeaderboard grew a multi-round branch and a fixed
        // window stopped reaching the single-round assignment.
        const start = src.indexOf('function renderLeaderboard()');
        let depth = 0, end = src.indexOf('{', start);
        for (let i = end; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const fn = src.slice(start, end + 1);

        // EVERY board caches the UNFILTERED field for the prize calculator - the
        // single-round board, the round board and the combined board alike. Paying
        // places from a filtered view would silently mean "3rd in the B flight takes
        // third prize", which is a prize policy nobody has specified.
        assert.match(fn, /cachedLeaderboardRows = computeTournamentLeaderboard\(currentData\);/,
            'the single-round payout cache must be the unfiltered field');
        assert.match(fn, /cachedLeaderboardRows = computeRoundLeaderboard\(currentData, viewing\);/,
            'a round board caches its round unfiltered');
        assert.match(fn, /cachedLeaderboardRows = computeEventStandings\(currentData\)\.rows/,
            'the combined board caches the whole field');
        assert.ok(!/cachedLeaderboardRows = rows;/.test(fn),
            'no board may cache the flight-filtered rows');
    });

    test('and the payout answer does not move when a flight is being viewed', () => {
        const data = sixTeamField();
        const overallRows = engine.computeTournamentLeaderboard(data);
        const flightRows = engine.computeTournamentLeaderboard(data, 'champ');
        const spots = [300, 200, 100];
        assert.notDeepEqual(plain(engine.computeTournamentPayouts(overallRows, spots)),
                            plain(engine.computeTournamentPayouts(flightRows, spots)),
                            'the two boards genuinely differ - which is why the cache must be pinned');
    });
});

describe('SCOPE — the deferred player model has not leaked in', () => {

    test('19 & 20. the player model arrived, and legacy storage did not change', () => {
        // REVERSED DELIBERATELY. During the flights wave these asserted the player
        // model had NOT arrived, because that wave had no business changing what gets
        // written. The Player Identity wave landed it, so the useful statement flipped:
        // the new shape exists AND the legacy shape is untouched beside it.
        const t = codeOf('tournament.html');
        assert.match(t, /players\/\$\{pid\}/, 'individual events store player records');
        assert.match(codeOf('tournament-engine.js'), /scores\[`\$\{pid\}_h\$\{h\.hole\}`\]/,
            'individual scores are keyed by player id');

        // The legacy keys are still exactly what they were.
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /scores\[`team\$\{team\.num\}_h\$\{h\.hole\}`\]/);
        assert.match(eng, /scores\[`team\$\{team\.num\}_p\$\{pIdx\}_h\$\{h\.hole\}`\]/);
    });

    test('21. Individual Stroke Play exists, and only alongside the team formats', () => {
        const src = codeOf('tournament.html');
        const formats = [...src.matchAll(/selectFormat\('([a-z]+)'\)/g)].map(m => m[1]);
        assert.deepEqual([...new Set(formats)].sort(),
            ['bestball', 'individual', 'scramble', 'shamble'],
            'the three team formats must survive the arrival of the fourth');
    });

    test('team and scoring group are separate ONLY for individual events', () => {
        // The audit found all three team formats genuinely use team == scoring group,
        // and they still do. Individual play is the format that needed the
        // distinction, so it is the only one that has it.
        const card = codeOf('tournament-scorecard.html');
        assert.match(card, /urlParams\.get\('team'\)/, 'legacy team scoring is unchanged');
        assert.match(card, /urlParams\.get\('group'\)/, 'individual scoring is group-scoped');
        const t = codeOf('tournament.html');
        assert.match(t, /\$\{groupsPath\(\)\}\/\$\{gid\}/,
            'individual events own scoring groups, wherever the model puts them');
        assert.ok(!/scoringGroups/.test(codeOf('tournament-engine.js').slice(
            codeOf('tournament-engine.js').indexOf('function normalizeTeamEntries'),
            codeOf('tournament-engine.js').indexOf('function normalizePlayerEntries'))),
            'legacy team scoring must not learn about scoring groups');
    });

    test('18 & 24. Firebase project and roots are unchanged, and Consumer is untouched', () => {
        ['tournament.html', 'tournament-scorecard.html'].forEach(p =>
            assert.equal(/projectId:\s*"([^"]+)"/.exec(read(p))[1], 'golfapp-9fb21'));
        const rules = JSON.parse(read('database.rules.json')).rules;
        ['events', 'trips', 'tournaments', 'global_courses', 'app_settings']
            .forEach(root => assert.ok(root in rules, root + ' must survive'));
        // The flights node lives under the existing tournaments root; no new root.
        assert.match(codeOf('tournament.html'), /tournaments\/\$\{currentCode\}\/flights\//);
    });

    test('23. flights added no Consumer dependency to the Tournament product', () => {
        const scripts = [...read('tournament.html').matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
            .map(m => m[1].replace(/^\.\//, ''));
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'action-model.js',
         'bet-strip.js', 'hole-events.js', 'grouping.js'].forEach(f =>
            assert.ok(!scripts.includes(f), 'tournament.html must not load ' + f));
    });
});
