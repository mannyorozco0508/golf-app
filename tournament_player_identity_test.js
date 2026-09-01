// ============================================================================
// PLAYER IDENTITY + INDIVIDUAL STROKE PLAY
//
// Tournament now stores two shapes. Records created before this wave hold a field
// of TEAMS, where a player is a string at a position in an array and scores are
// keyed team{n}_h{h} or team{n}_p{i}_h{h}. Individual events hold a field of
// PLAYERS with opaque ids, and scores keyed {playerId}_h{h}.
//
// Nothing was migrated. Nothing is rewritten on load. The legacy shape is read
// exactly as it always was, forever.
//
// ---------------------------------------------------------------------------
// WHAT THESE TESTS ARE REALLY PROTECTING
// ---------------------------------------------------------------------------
//
// One thing above all: A SCORE STAYS WITH THE GOLFER IT BELONGS TO.
//
// Positional identity fails quietly. Reorder a group, fix a spelling, move
// somebody to another foursome, and the strokes follow the slot rather than the
// person - and nobody finds out until the prize is handed to the wrong player.
// Several tests below do exactly those things and then assert the scores did not
// move, because that is the failure this whole wave exists to prevent.
//
// Second: ONE DEFINITION OF WHO WON. Two storage models must not become two
// leaderboards. The fork is confined to normalizeLeaderboardEntries(); the sort
// and the rank pass never learn which shape produced a row.
//
// Third: NET IS EARNED, NOT ASSUMED. An unmapped course gets a fabricated 1..18
// stroke index so a round can still be played gross. Ranking net money on an
// invented card would be worse than refusing, so it is refused.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function codeOf(file) {
    let src = read(file);
    if (file.endsWith('.html')) src = src.replace(/<!--[\s\S]*?-->/g, '');
    return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const engine = loadJsFile('tournament-engine.js');

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

// A REAL card: eighteen distinct stroke indexes in a scrambled order, so an
// allocation can be checked hole by hole rather than assumed.
const REAL_SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = REAL_SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));

// What resolveTournamentCourseData() invents for a course nobody has mapped:
// hcpIndex equal to hole number. Structurally plausible, competitively meaningless.
const CD18_FAKE = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function individualEvent(opts) {
    const o = opts || {};
    return Object.assign({
        name: 'Club Championship',
        scoringModel: 'player-v1',
        scoringMode: o.mode || 'gross',
        format: 'individual',
        courseName: 'Test GC',
        courseData: o.courseData || CD18,
        courseIndexSynthetic: o.synthetic === true,
        players: {},
        scoringGroups: {},
        scores: {},
        teams: {},
    }, o.extra || {});
}

// Two golfers called Dave Smith, deliberately. Same name, different people.
function fieldWithDuplicateNames() {
    const d = individualEvent();
    d.players = {
        pAAA: { id: 'pAAA', name: 'Dave Smith', handicap: '0' },
        pBBB: { id: 'pBBB', name: 'Dave Smith', handicap: '18' },
        pCCC: { id: 'pCCC', name: 'Ann Alpha', handicap: '9' },
    };
    CD18.forEach(h => {
        d.scores[`pAAA_h${h.hole}`] = 4;   // level par
        d.scores[`pBBB_h${h.hole}`] = 5;   // +18 gross
        d.scores[`pCCC_h${h.hole}`] = 5;   // +18 gross
    });
    return d;
}

// The legacy shape: no marker, no players node, positional team scores.
function legacyTeamEvent() {
    const scores = {};
    [4, 5].forEach((v, i) => CD18.forEach(h => { scores[`team${i + 1}_h${h.hole}`] = v; }));
    return {
        name: 'Old Scramble', format: 'scramble', courseName: 'Test GC', courseData: CD18,
        teams: {
            team1: { num: 1, name: 'Alpha', players: ['A', 'B'], handicap: 0 },
            team2: { num: 2, name: 'Bravo', players: ['C', 'D'], handicap: 9 },
        },
        scores: scores,
    };
}

const lb = (data, fid) => plain(engine.computeTournamentLeaderboard(data, fid));
const byName = (rows, n) => rows.find(r => r.teamName === n);

// ===========================================================================
// 1. WHICH MODEL — decided, never inferred
// ===========================================================================

describe('MODEL MARKER — absent means legacy, forever', () => {

    test('1. a record with no marker is legacy', () => {
        assert.equal(engine.isPlayerModel(legacyTeamEvent()), false);
        assert.equal(engine.isPlayerModel({}), false);
        assert.equal(engine.isPlayerModel(null), false);
    });

    test('4. an individual event carries an explicit marker', () => {
        assert.equal(engine.isPlayerModel(individualEvent()), true);
        assert.match(codeOf('tournament.html'), /payload\.scoringModel = PLAYER_MODEL;/);
    });

    test('the marker is never inferred from the presence of a players node', () => {
        // The tempting shortcut, and the dangerous one: a legacy record could grow a
        // players node later and the meaning of every stored score would flip.
        const disguised = legacyTeamEvent();
        disguised.players = { pX: { id: 'pX', name: 'Ghost', handicap: '0' } };
        assert.equal(engine.isPlayerModel(disguised), false,
            'a players node must not turn a legacy record into an individual one');
        assert.equal(lb(disguised).length, 2, 'it still ranks its two teams');
    });

    test('40. nothing migrates, backfills or rewrites on load', () => {
        const t = codeOf('tournament.html');
        assert.ok(!/migratePlayer|backfillPlayer|repairPlayer|upgradeTournament/i.test(t));
        const load = t.slice(t.indexOf('function loadTournament'), t.indexOf('function loadTournament') + 3000);
        assert.ok(!/\.set\(|\.update\(|\.remove\(/.test(load),
            'opening a tournament must not write to it');
    });
});

// ===========================================================================
// 2. IDENTITY — the point of the whole wave
// ===========================================================================

describe('PLAYER IDENTITY — a score stays with the golfer', () => {

    function idGen() {
        const src = codeOf('tournament.html');
        const start = src.indexOf('function newPlayerId');
        let depth = 0, end = src.indexOf('{', start);
        for (let i = end; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        // mintId and its counter live outside newPlayerId, so both are pulled in.
        const mintStart = src.indexOf('let idSeq = 0;');
        return new Function(src.slice(mintStart, end + 1) + '; return newPlayerId;')();
    }

    test('5. ids are opaque and do not collide', () => {
        const gen = idGen();
        const ids = new Set(Array.from({ length: 500 }, () => gen()));
        assert.equal(ids.size, 500, 'ids must not collide');
        ids.forEach(id => assert.match(id, /^p[a-z0-9]+$/));
    });

    test('6. an id is not derived from the name', () => {
        const src = codeOf('tournament.html');
        const add = src.slice(src.indexOf('function addPlayerToField'),
                              src.indexOf('function addPlayerToField') + 900);
        assert.match(add, /const pid = newPlayerId\(\);/);
        assert.ok(!/(const|let|var)\s+pid\s*=\s*(name|nameEl)/.test(add),
            'pid must never come from the name field');
        assert.ok(!/players\/\$\{name\}/.test(src));
    });

    test('7. an id is not derived from array position', () => {
        const t = codeOf('tournament.html');
        assert.ok(!/players\/\$\{i\}|players\/\$\{idx\}|players\/\$\{index\}/.test(t));
        const eng = codeOf('tournament-engine.js');
        // The individual score key uses the id itself, never a loop counter.
        assert.match(eng, /scores\[`\$\{pid\}_h\$\{h\.hole\}`\]/);
        assert.ok(!/scores\[`\$\{pIdx\}_h/.test(eng));
    });

    test('8. two golfers with the same name are two golfers', () => {
        const d = fieldWithDuplicateNames();
        const rows = lb(d);
        const daves = rows.filter(r => r.playerName === 'Dave Smith');
        assert.equal(daves.length, 2, 'both Daves must appear');
        assert.notEqual(daves[0].playerId, daves[1].playerId);
        // And they are not sharing a score: one is level par, one is +18.
        assert.notEqual(daves[0].strokes, daves[1].strokes);
    });

    test('9. editing a name does not move a stroke', () => {
        const d = fieldWithDuplicateNames();
        const before = lb(d).find(r => r.playerId === 'pAAA');
        d.players.pAAA.name = 'David Smyth';
        const after = lb(d).find(r => r.playerId === 'pAAA');
        assert.equal(after.strokes, before.strokes);
        assert.equal(after.toPar, before.toPar);
        assert.equal(after.playerName, 'David Smyth', 'the label changed, nothing else did');
    });

    test('10. moving a golfer between scoring groups does not move a stroke', () => {
        // The failure positional identity produces, tested directly. Scores are keyed
        // by id and groups are just membership lists, so regrouping is invisible here.
        const d = fieldWithDuplicateNames();
        d.scoringGroups = {
            g1: { id: 'g1', name: 'Group 1', playerIds: ['pAAA', 'pBBB'] },
            g2: { id: 'g2', name: 'Group 2', playerIds: ['pCCC'] },
        };
        const before = lb(d);
        d.scoringGroups.g1.playerIds = ['pBBB'];
        d.scoringGroups.g2.playerIds = ['pCCC', 'pAAA'];
        assert.deepEqual(lb(d), before, 'regrouping must not change a single standing');
    });

    test('11. moving a golfer between flights does not move a stroke', () => {
        const d = fieldWithDuplicateNames();
        d.flights = { f1: { id: 'f1', name: 'A', createdAt: 1 }, f2: { id: 'f2', name: 'B', createdAt: 2 } };
        d.players.pAAA.flightId = 'f1';
        const strokesBefore = lb(d).find(r => r.playerId === 'pAAA').strokes;
        d.players.pAAA.flightId = 'f2';
        assert.equal(lb(d).find(r => r.playerId === 'pAAA').strokes, strokesBefore);
    });

    test('26 & 27. the new score key carries the id and no position', () => {
        assert.match(codeOf('tournament-scorecard.html'),
            /scores\/\$\{playerId\}_h\$\{holeNum\}/);
        assert.ok(!/scores\/\$\{playerIdx\}_|scores\/p\$\{i\}_/.test(codeOf('tournament-scorecard.html')
            .replace(/team\$\{myTeamNum\}_p\$\{playerIdx\}/g, '')),
            'no individual key may be built from an index');
    });
});

// ===========================================================================
// 3. IMPORT
// ===========================================================================

describe('IMPORT — the handicap is finally kept', () => {

    const page = () => loadHtmlInlineScript('tournament.html');

    test('12 & 13. Name, Handicap parses and both halves survive', () => {
        // The defect this fixes: the team import parsed handicaps, averaged them into
        // one team number and discarded the individual values. An organizer was typing
        // data the app did not store.
        const sb = page();
        const { validPlayers } = sb.parseTeamsPasteText(
            'Ann Alpha, 12\nBo Bravo, +2\nCal Charlie\nDee Delta, 8.4\nEd Echo, -3\nFay Foxtrot, abc');
        const got = plain(validPlayers);
        assert.deepEqual(got.map(p => p.name),
            ['Ann Alpha', 'Bo Bravo', 'Cal Charlie', 'Dee Delta', 'Ed Echo', 'Fay Foxtrot']);
        assert.deepEqual(got.map(p => p.hcp), ['12', '+2', '', '8.4', '-3', 'abc'],
            'every handicap string reaches the import untouched, plus and decimal included');

        const src = codeOf('tournament.html');
        const commit = src.slice(src.indexOf('function commitPastePlayers'),
                                 src.indexOf('function commitPastePlayers') + 1200);
        assert.match(commit, /handicap: \(p\.hcp \|\| ''\)\.trim\(\) \|\| '0'/,
            'the parsed handicap must be persisted on the player record');
        assert.ok(!/suggestTeamHandicap/.test(commit),
            'individual import must not average handicaps away');
    });

    test('a malformed handicap becomes scratch rather than breaking a round', () => {
        // parseHcp is the shared primitive and already decided this: unreadable means
        // zero, because an empty box on a setup screen must not stop a tournament.
        const h = loadJsFile('handicap.js');
        assert.equal(h.parseHcp('abc'), 0);
        assert.equal(h.parseHcp(''), 0);
        assert.equal(h.parseHcp('+2'), -2, 'a plus handicap is negative');
        assert.equal(h.parseHcp('8.4'), 8.4);
    });

    test('same-name golfers imported together are not merged', () => {
        const src = codeOf('tournament.html');
        const commit = src.slice(src.indexOf('function commitPastePlayers'),
                                 src.indexOf('function commitPastePlayers') + 1200);
        assert.match(commit, /newPlayerId\(\)/, 'every imported line gets its own id');
        assert.ok(!/existing|dedupe|byName|find\(p => p\.name/.test(commit),
            'import must not look up players by name');
    });
});

// ===========================================================================
// 4. SCORING — gross, net, allocation
// ===========================================================================

describe('INDIVIDUAL SCORING — gross ranks strokes, net ranks strokes earned', () => {

    test('14. gross ranks on strokes and ignores handicap entirely', () => {
        const d = fieldWithDuplicateNames();          // gross by default
        const rows = lb(d);
        const scratch = rows.find(r => r.playerId === 'pAAA');
        const eighteen = rows.find(r => r.playerId === 'pBBB');
        assert.equal(scratch.toPar, 0);
        assert.equal(eighteen.toPar, 18, 'an 18 handicap gets nothing back in gross');
        assert.equal(scratch.rank, 1);
        assert.equal(eighteen.strokesReceived, 0);
    });

    test('15 & 16. net subtracts strokes allocated by the hole\u2019s stroke index', () => {
        const d = fieldWithDuplicateNames();
        d.scoringMode = 'net';
        const rows = lb(d);
        const eighteen = rows.find(r => r.playerId === 'pBBB');
        // An 18 receives exactly one stroke on every hole: 90 gross becomes 72 net,
        // which is level on a par-72 card.
        assert.equal(eighteen.strokesReceived, 18);
        assert.equal(eighteen.toPar, 0);
        const nine = rows.find(r => r.playerId === 'pCCC');
        // A 9 receives on the nine hardest holes only.
        assert.equal(nine.strokesReceived, 9);
        assert.equal(nine.toPar, 9);
    });

    test('17. a plus handicap gives strokes back', () => {
        const d = individualEvent({ mode: 'net' });
        d.players = { pP: { id: 'pP', name: 'Plus Two', handicap: '+2' } };
        CD18.forEach(h => { d.scores[`pP_h${h.hole}`] = 4; });
        const row = lb(d)[0];
        assert.equal(row.strokesReceived, -2, 'a plus 2 gives back two strokes');
        assert.equal(row.toPar, 2, '72 gross becomes 74 net');
    });

    test('18. a handicap over 18 gets a second stroke on the hardest holes', () => {
        const d = individualEvent({ mode: 'net' });
        d.players = { pH: { id: 'pH', name: 'High', handicap: '22' } };
        CD18.forEach(h => { d.scores[`pH_h${h.hole}`] = 5; });
        const row = lb(d)[0];
        // 22 = one stroke on all eighteen, plus a second on stroke index 1-4.
        assert.equal(row.strokesReceived, 22);
        assert.equal(row.toPar, 90 - 22 - 72);
    });

    test('19 & 20. switching mode changes the ranking, and only the ranking', () => {
        const d = fieldWithDuplicateNames();
        const gross = lb(d);
        d.scoringMode = 'net';
        const net = lb(d);
        // Gross: scratch shoots 72 and wins; the 18 and the 9 both shoot 90 and tie
        // behind. Net: the 18 receives a stroke a hole and comes back to level, tying
        // scratch for the lead, while the 9 receives on nine holes and drops to third.
        //
        // The assertion is that the 18 MOVES UP, not that it wins outright - it nets
        // exactly level with scratch, and calling that a win would be asserting a
        // tie-break policy this product does not have.
        assert.equal(gross.find(r => r.playerId === 'pAAA').rank, 1, 'scratch wins gross');
        assert.equal(gross.find(r => r.playerId === 'pBBB').rank, 2, 'the 18 is behind on gross');
        assert.equal(net.find(r => r.playerId === 'pBBB').rank, 1, 'and level with scratch on net');
        assert.equal(net.find(r => r.playerId === 'pAAA').rank, 1, 'a genuine tie, shared rank');
        assert.equal(net.find(r => r.playerId === 'pCCC').rank, 3, 'ranks 1, 1, 3 - unchanged policy');
        // Gross strokes are the same number in both; only what it is compared against moved.
        ['pAAA', 'pBBB', 'pCCC'].forEach(pid =>
            assert.equal(net.find(r => r.playerId === pid).strokes,
                         gross.find(r => r.playerId === pid).strokes));
    });

    test('net counts strokes only on holes actually played', () => {
        // A partial round must not be handed eighteen strokes for nine holes.
        const d = individualEvent({ mode: 'net' });
        d.players = { pQ: { id: 'pQ', name: 'Half', handicap: '18' } };
        CD18.slice(0, 9).forEach(h => { d.scores[`pQ_h${h.hole}`] = 5; });
        const row = lb(d)[0];
        assert.equal(row.thru, 9);
        assert.equal(row.strokesReceived, 9, 'nine holes played, nine strokes received');
    });

    test('NET IS REFUSED on a course with no genuine stroke index', () => {
        // The locked decision. A fabricated 1..18 allocation looks valid and decides
        // who wins, so the event scores gross until somebody supplies the real card.
        const d = individualEvent({ mode: 'net', courseData: CD18_FAKE, synthetic: true });
        d.players = { pR: { id: 'pR', name: 'Rick', handicap: '18' } };
        CD18_FAKE.forEach(h => { d.scores[`pR_h${h.hole}`] = 5; });
        assert.equal(engine.hasUsableStrokeIndex(d), false);
        assert.equal(lb(d)[0].strokesReceived, 0, 'no strokes may be allocated on an invented index');
    });

    test('a duplicated or out-of-range stroke index is also refused', () => {
        const dup = CD18.map((h, i) => ({ hole: i + 1, par: 4, hcpIndex: 1 }));
        assert.equal(engine.hasUsableStrokeIndex({ courseData: dup }), false);
        assert.equal(engine.hasUsableStrokeIndex({ courseData: [{ hole: 1, par: 4, hcpIndex: 99 }] }), false);
        assert.equal(engine.hasUsableStrokeIndex({ courseData: [] }), false);
        // A real nine-hole card carries indexes drawn from the full eighteen.
        assert.equal(engine.hasUsableStrokeIndex({ courseData: CD18.slice(0, 9) }), true);
    });

    test('13-shared. the shared handicap module does the allocating', () => {
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /getStrokes\(hole\.hcpIndex, parseHcp\(player\.handicap\)\)/);
        // No fork, and none of Consumer's wagering handicap logic.
        assert.ok(!/function getStrokes|function parseHcp/.test(eng),
            'the handicap primitives must not be copied into the tournament engine');
        assert.ok(!/allocateMatchStrokes|relativeMatchStrokes|matchHandicapBaseline/.test(eng),
            'relative match handicapping is Consumer wagering, not competition scoring');
    });
});

// ===========================================================================
// 5. ONE RANKING PATH
// ===========================================================================

describe('NORMALIZATION — two storage models, one competition', () => {

    test('30. ranking is not duplicated per storage model', () => {
        const eng = codeOf('tournament-engine.js');
        assert.equal((eng.match(/rows\.sort\(/g) || []).length, 1, 'one sort');
        assert.equal((eng.match(/r\.rank = idx \+ 1;/g) || []).length, 1, 'one rank pass');
        assert.equal((eng.match(/function computeTournamentLeaderboard/g) || []).length, 1);
        // And the fork is where it should be.
        assert.match(eng, /function normalizeLeaderboardEntries\(data\)[\s\S]{0,200}isPlayerModel\(data\)/);
    });

    test('28 & 29. each adapter reads its own shape', () => {
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
        const team = slice('normalizeTeamEntries');
        const player = slice('normalizePlayerEntries');
        assert.match(team, /computeTeamTotals\(data, t\)/);
        assert.ok(!/players/.test(team), 'the legacy adapter must not read the players node');
        assert.match(player, /scores\[`\$\{pid\}_h\$\{h\.hole\}`\]/);
        assert.ok(!/team\$\{/.test(player), 'the player adapter must not read team keys');
    });

    test('the two produce the same row shape, so downstream cannot tell them apart', () => {
        const teamRow = lb(legacyTeamEvent())[0];
        const playerRow = lb(fieldWithDuplicateNames())[0];
        ['entryType', 'entryKey', 'num', 'teamName', 'strokes', 'thru', 'toPar', 'hasScores', 'rank']
            .forEach(k => {
                assert.ok(k in teamRow, 'team row missing ' + k);
                assert.ok(k in playerRow, 'player row missing ' + k);
            });
        assert.equal(teamRow.entryType, 'team');
        assert.equal(playerRow.entryType, 'player');
    });

    test('12-tie. ties are shared ranks in both models, unchanged policy', () => {
        const d = fieldWithDuplicateNames();   // pBBB and pCCC are both +18 gross
        const rows = lb(d);
        const tied = rows.filter(r => r.toPar === 18);
        assert.equal(tied.length, 2);
        assert.equal(tied[0].rank, tied[1].rank, 'competition ranking, as team events have always done');
    });
});

// ===========================================================================
// 6. FLIGHTS, GROUPS, LINKS
// ===========================================================================

describe('FLIGHTS AND GROUPS — attached to the right thing', () => {

    test('34. an individual flight lives on the player, not the team', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /players\/\$\{pid\}\/flightId/);
        // team.flightId keeps meaning exactly what it meant for team events.
        assert.match(t, /teams\/\$\{teamId\}\/flightId/);
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /flightId: p\.flightId \|\| null/);
        assert.match(eng, /flightId: t\.flightId \|\| null/);
    });

    test('22 & 23. flight standings filter players; unassigned stay in Overall', () => {
        const d = fieldWithDuplicateNames();
        d.flights = { f1: { id: 'f1', name: 'A', createdAt: 1 } };
        d.players.pAAA.flightId = 'f1';
        d.players.pBBB.flightId = 'f1';
        assert.deepEqual(lb(d, 'f1').map(r => r.playerId).sort(), ['pAAA', 'pBBB']);
        assert.equal(lb(d).length, 3, 'the unassigned golfer still competes overall');
        assert.equal(lb(d, 'f1')[0].rank, 1, 'a flight is its own competition');
    });

    test('24. a golfer belongs to one scoring group — moving removes them from the old one', () => {
        const t = codeOf('tournament.html');
        const fn = t.slice(t.indexOf('function assignPlayerToGroup'),
                           t.indexOf('function assignPlayerToGroup') + 900);
        assert.match(fn, /\.filter\(x => x !== pid\)/,
            'the golfer must be removed from every other group in the same write');
        assert.match(fn, /scoringGroups`\)\.update\(updates\)/,
            'one atomic update, so a golfer is never briefly in two groups');
    });

    test('25. the starting hole belongs to the scoring group', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /scoringGroups\/\$\{gid\}\/startingHole/);
        assert.ok(!/players\/\$\{pid\}\/startingHole/.test(t),
            'a shotgun sends a group to a tee, not each golfer separately');
    });

    test('a group with golfers in it cannot be deleted', () => {
        const t = codeOf('tournament.html');
        const fn = t.slice(t.indexOf('function deleteScoringGroup'),
                           t.indexOf('function deleteScoringGroup') + 700);
        assert.match(fn, /playerIds \|\| \[\]\)\.length > 0/);
        assert.ok(fn.indexOf('length > 0') < fn.indexOf('.remove()'));
    });

    test('3 & 37 & 38. both link shapes are live and same-origin', () => {
        const t = codeOf('tournament.html');
        assert.match(t, /\$\{scorecardBaseUrl\(\)\}\?tourney=\$\{currentCode\}&team=\$\{t\.num\}/,
            'historical team links are unchanged');
        assert.match(t, /\$\{scorecardBaseUrl\(\)\}\?tourney=\$\{currentCode\}&group=\$\{gid\}/,
            'group links are built the same way');
        assert.ok(!/consumerUrl\(`?tournament-scorecard|tournamentUrl\(`?tournament-scorecard/.test(t),
            'a scoring link is internal to the Tournament product');
        const card = codeOf('tournament-scorecard.html');
        // Read from the URL on every load, so reload and hard refresh behave the same.
        assert.match(card, /urlParams\.get\('team'\)/);
        assert.match(card, /urlParams\.get\('group'\)/);
    });
});

// ===========================================================================
// 7. SCORECARD SCOPE AND LEGACY REGRESSION
// ===========================================================================

describe('SCORECARD — scoped to its own link', () => {

    test('35 & 36. a group link may only write its own golfers\u2019 scores', () => {
        const card = codeOf('tournament-scorecard.html');
        const fn = card.slice(card.indexOf('function saveIndividualScore'),
                              card.indexOf('function saveIndividualScore') + 700);
        assert.match(fn, /indexOf\(playerId\) === -1\) return;/,
            'a golfer outside this group must be refused');
        assert.ok(fn.indexOf('indexOf(playerId) === -1') < fn.indexOf('db.ref('),
            'the check must run before the write');
    });

    test('the scorecard stays lightweight and organizer-free', () => {
        const card = codeOf('tournament-scorecard.html');
        ['addPlayerToField', 'createScoringGroup', 'assignPlayerToGroup', 'saveTournament',
         'renderTeamLinks', 'createFlight'].forEach(fn =>
            assert.ok(!new RegExp(fn).test(card), 'no organizer control: ' + fn));
        const scripts = [...read('tournament-scorecard.html').matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
            .map(m => m[1].replace(/^\.\//, ''));
        ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'action-model.js']
            .forEach(f => assert.ok(!scripts.includes(f), 'no Consumer dependency: ' + f));
    });

    test('net is derived on the scorecard, never entered', () => {
        const card = codeOf('tournament-scorecard.html');
        assert.match(card, /Enter gross scores/);
        assert.ok(!/saveNetScore|_net_h|netInput/.test(card),
            'a net score must never be stored - it is worked out from the gross');
    });
});

describe('LEGACY TEAM EVENTS — unchanged in every respect', () => {

    test('2 & 31. team formats and their score keys still work', () => {
        const rows = lb(legacyTeamEvent());
        assert.equal(rows.length, 2);
        assert.equal(rows[0].entryType, 'team');
        assert.deepEqual(rows.map(r => r.teamName), ['Alpha', 'Bravo']);
        const eng = codeOf('tournament-engine.js');
        assert.match(eng, /scores\[`team\$\{team\.num\}_h\$\{h\.hole\}`\]/);
        assert.match(eng, /scores\[`team\$\{team\.num\}_p\$\{pIdx\}_h\$\{h\.hole\}`\]/);
    });

    test('32. flat team handicap is untouched — no per-hole allocation crept in', () => {
        const d = legacyTeamEvent();
        // Bravo shot 90 off a flat 9: level on a par-72 card, +9 without the handicap.
        assert.equal(byName(lb(d), 'Bravo').toPar, 9);
        d.teams.team2.handicap = 18;
        assert.equal(byName(lb(d), 'Bravo').toPar, 0, 'one flat number for the whole round');
    });

    test('33. team flights still work on team events', () => {
        const d = legacyTeamEvent();
        d.flights = { f1: { id: 'f1', name: 'Champ', createdAt: 1 } };
        d.teams.team1.flightId = 'f1';
        assert.deepEqual(lb(d, 'f1').map(r => r.teamName), ['Alpha']);
        assert.equal(lb(d).length, 2);
    });

    test('39. same Firebase project and roots', () => {
        ['tournament.html', 'tournament-scorecard.html'].forEach(p =>
            assert.equal(/projectId:\s*"([^"]+)"/.exec(read(p))[1], 'golfapp-9fb21'));
        const rules = JSON.parse(read('database.rules.json')).rules;
        ['events', 'trips', 'tournaments', 'global_courses', 'app_settings']
            .forEach(root => assert.ok(root in rules));
        // players, scoringGroups and flights all live under the existing tournaments
        // root - no new root was created.
        assert.match(codeOf('tournament.html'), /tournaments\/\$\{currentCode\}\/players\//);
        assert.match(codeOf('tournament.html'), /tournaments\/\$\{currentCode\}\/scoringGroups\//);
    });
});
