// ============================================================================
// A CUP MUST NAME THE SAME GOLFERS ON EVERY ROUND IT TOUCHES
//
// Player ids are per-round and positional: 101 is "the first golfer on THIS
// round's roster". The Cup stores only ids in `members` and `playersA/playersB`,
// and it lives on one host round. Read that Cup against a second round and the
// ids mean different people:
//
//   Cup built on round 1, match says playersA=[101,102] playersB=[103,104]
//     against round 1 : sideA [Marty, Manny]   sideB [Lance, Zach]
//     against round 2 : sideA [Zach, Lance]    sideB [Manny, Marty]
//
// Both sides swap. Nothing looks broken. Wrong teams, wrong points.
//
// THE MECHANISM IS TRIP MODE'S. computeTripPointsRace keys cross-round identity
// on name.trim().toLowerCase(). The Cup needs the same idea at a different point:
// translate the Cup's ids into THIS round's ids at the moment it is resolved.
//
// AND IT NEEDS NO SCHEMA CHANGE. loadRyderHostCup fetches events/<host> - the
// entire host round, not just its ryderCup - so the host's player names are
// already in memory and already handed to resolveRyderCupForRound. The chain is:
//
//   cup member id -> host round's player name -> normalised match -> local id
//
// TRANSLATION WITHOUT REFUSAL WOULD BE WORSE THAN NOTHING. A Cup that silently
// resolves onto the wrong golfers is the failure this exists to prevent, so
// anything ambiguous refuses and says why:
//
//   placeholder names  admin.html's save path writes `Player ${idx+1}` for a blank
//                      field, so two rounds of unnamed golfers carry the IDENTICAL
//                      set of names. That is the positional-id bug wearing a name.
//                      A placeholder is not an identity and must never match.
//   duplicate names    two golfers called Mike cannot be told apart. Trip Mode
//                      silently merges them, which is tolerable when aggregating
//                      points and is not when assigning sides.
//   absent golfer      legitimate - somebody sits a session out - and resolves to
//                      "not in this round", not an error.
//
// The host round is unaffected: its ids are already local, so nothing is
// translated and nothing can refuse.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const AM = loadJsFile('action-model.js');
const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
const RC_SRC = fs.readFileSync(path.join(REPO_ROOT, 'ryder-cup.js'), 'utf8');

const plain = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// Round 1 hosts the Cup. Round 2 has the SAME golfers in a different order -
// which is all it takes, because ids follow row position within a round.
const HOST_PLAYERS = [
    { id: 101, name: 'Marty Sharp', hcp: '8' }, { id: 102, name: 'Manny Orozco', hcp: '4' },
    { id: 103, name: 'Lance Webb', hcp: '15' }, { id: 104, name: 'Zach Hill', hcp: '0' }];
const AWAY_PLAYERS = [
    { id: 101, name: 'Zach Hill', hcp: '0' }, { id: 102, name: 'Lance Webb', hcp: '15' },
    { id: 103, name: 'Manny Orozco', hcp: '4' }, { id: 104, name: 'Marty Sharp', hcp: '8' }];

function cup() {
    return {
        v: 1, name: 'Myrtle Cup',
        sides: { A: { id: 'A', name: 'Rattle' }, B: { id: 'B', name: 'Chaos' } },
        members: { '101': 'A', '102': 'A', '103': 'B', '104': 'B' },
        sessions: { d1s2: { id: 'd1s2', day: 1, order: 2, format: 'fourball', label: 'Day 1 Four-Ball' } },
        matches: {
            m1: { id: 'm1', sessionId: 'd1s2', format: 'fourball', scoring: 'net',
                  sideA: 'A', sideB: 'B', playersA: ['101', '102'], playersB: ['103', '104'] }
        }
    };
}
const hostRound = players => ({ players: players || HOST_PLAYERS, courseData: CD, scores: {}, ryderCup: cup() });
const awayRound = players => ({ players: players || AWAY_PLAYERS, courseData: CD, scores: {},
                                ryderCupRef: { host: 'HOST', sessionId: 'd1s2' } });

// The names a resolved Cup puts on each side, read against the round it resolved for.
function sidesFor(res, roundPlayers) {
    const cfg = RC.ryderCupConfig(res.cup);
    const byId = {};
    (roundPlayers || []).forEach(p => { byId[String(p.id)] = p.name; });
    const r = RC.ryderMatchRoster(cfg.matches.m1);
    return plain({ a: r.a.map(i => byId[i] || ('#' + i)), b: r.b.map(i => byId[i] || ('#' + i)) });
}

describe('THE NORMALISER', () => {

    test('it is one shared function, not a fourth copy', () => {
        assert.equal(typeof AM.normalisePlayerName, 'function');
        const src = fs.readFileSync(path.join(REPO_ROOT, 'action-model.js'), 'utf8');
        assert.equal((src.match(/function normalisePlayerName/g) || []).length, 1);
    });

    test('it trims and lowercases, matching Trip Mode', () => {
        assert.equal(AM.normalisePlayerName('  Marty Sharp '), 'marty sharp');
        assert.equal(AM.normalisePlayerName('MARTY SHARP'), 'marty sharp');
    });

    test('it survives nothing at all', () => {
        ['', null, undefined].forEach(v => assert.equal(AM.normalisePlayerName(v), ''));
    });

    // admin.html:4915 writes `Player ${idx+1}` for a blank field, so two rounds of
    // unnamed golfers carry identical names. A placeholder is not an identity.
    test('it recognises the placeholder names the app itself invents', () => {
        assert.equal(typeof AM.isPlaceholderPlayerName, 'function');
        ['Player 1', 'player 12', '  Player 3  '].forEach(v =>
            assert.equal(AM.isPlaceholderPlayerName(v), true, v + ' should be a placeholder'));
    });

    test('a real name is not a placeholder', () => {
        ['Marty Sharp', 'Player Smith', 'Jim Player', ''].forEach(v =>
            assert.equal(AM.isPlaceholderPlayerName(v), false, v + ' is a real name'));
    });
});

describe('A CUP RESOLVED ONTO ANOTHER ROUND NAMES THE SAME GOLFERS', () => {

    test('without translation the sides would swap — the bug this fixes', () => {
        // Proof the fixture is genuinely adversarial: the raw ids mean different
        // people on the two rounds.
        const raw = RC.ryderMatchRoster(cup().matches.m1);
        const awayById = {};
        AWAY_PLAYERS.forEach(p => { awayById[String(p.id)] = p.name; });
        assert.deepEqual(plain(raw.a.map(i => awayById[i])), ['Zach Hill', 'Lance Webb']);
    });

    test('the same golfers land on the same sides', () => {
        const res = RC.resolveRyderCupForRound(awayRound(), hostRound(), 'AWAY');
        assert.equal(res.status, 'referenced');
        assert.deepEqual(sidesFor(res, AWAY_PLAYERS),
            { a: ['Marty Sharp', 'Manny Orozco'], b: ['Lance Webb', 'Zach Hill'] });
    });

    test('membership follows the golfer, not the slot', () => {
        const res = RC.resolveRyderCupForRound(awayRound(), hostRound(), 'AWAY');
        const cfg = RC.ryderCupConfig(res.cup);
        const byName = {};
        AWAY_PLAYERS.forEach(p => { byName[p.name] = String(p.id); });
        assert.equal(cfg.members[byName['Marty Sharp']], 'A');
        assert.equal(cfg.members[byName['Zach Hill']], 'B');
    });

    test('case and stray spacing do not break the match', () => {
        const messy = AWAY_PLAYERS.map(p => ({ ...p, name: '  ' + p.name.toUpperCase() + ' ' }));
        const res = RC.resolveRyderCupForRound(awayRound(messy), hostRound(), 'AWAY');
        assert.ok(!res.identityProblems || res.identityProblems.length === 0,
            'a name differing only by case or spacing was treated as a different golfer');
    });

    // TWO SHAPES REACH THE HOST, and neither may translate. A Cup created before
    // the session pointer existed carries no ref at all ('local'); one created
    // since points at its own round ('host'). Both already hold local ids.
    test('the HOST round is not translated — with a self-pointing ref', () => {
        const host = hostRound();
        host.ryderCupRef = { host: 'HOST', sessionId: 'd1s2' };
        const res = RC.resolveRyderCupForRound(host, null, 'HOST');
        assert.equal(res.status, 'host');
        assert.deepEqual(sidesFor(res, HOST_PLAYERS),
            { a: ['Marty Sharp', 'Manny Orozco'], b: ['Lance Webb', 'Zach Hill'] });
    });

    test('the HOST round is not translated — with no ref at all', () => {
        const res = RC.resolveRyderCupForRound(hostRound(), null, 'HOST');
        assert.equal(res.status, 'local');
        assert.deepEqual(sidesFor(res, HOST_PLAYERS),
            { a: ['Marty Sharp', 'Manny Orozco'], b: ['Lance Webb', 'Zach Hill'] });
    });

    // A legacy Cup on its own round has placeholder names all over it and must
    // keep working - it never crosses a round boundary, so it never needs a name.
    test('a host round with placeholder names still works', () => {
        const blank = [{ id: 101, name: 'Player 1' }, { id: 102, name: 'Player 2' },
                       { id: 103, name: 'Player 3' }, { id: 104, name: 'Player 4' }];
        const res = RC.resolveRyderCupForRound(hostRound(blank), null, 'HOST');
        assert.equal(res.status, 'local', 'a single-round Cup was broken by the identity rule');
        assert.equal(RC.ryderResolutionUsable(res), true);
    });

    test('the stored Cup is never mutated', () => {
        const host = hostRound();
        const before = JSON.stringify(host.ryderCup);
        RC.resolveRyderCupForRound(awayRound(), host, 'AWAY');
        assert.equal(JSON.stringify(host.ryderCup), before,
            'resolving for one round rewrote the authoritative Cup');
    });
});

describe('ANYTHING AMBIGUOUS REFUSES, AND SAYS WHY', () => {

    test('placeholder names refuse rather than match', () => {
        const blank = [{ id: 101, name: 'Player 1' }, { id: 102, name: 'Player 2' },
                       { id: 103, name: 'Player 3' }, { id: 104, name: 'Player 4' }];
        const res = RC.resolveRyderCupForRound(awayRound(blank), hostRound(blank), 'AWAY');
        assert.equal(res.status, 'identity-unresolved',
            'a Cup resolved onto placeholder names, which cannot identify anyone');
        assert.ok((res.identityProblems || []).some(p => /name/i.test(p.message || '')));
    });

    // EACH ROSTER IS CHECKED SEPARATELY, and the reason is not symmetry for its
    // own sake. Two Mikes on the HOST round against one Mike here is the quiet
    // one: nothing on this round looks wrong, and both host Mikes would resolve
    // onto the single local Mike - one golfer playing two spots, on two sides.
    const twoMikes = [{ id: 101, name: 'Mike' }, { id: 102, name: 'Mike' },
                      { id: 103, name: 'Lance Webb' }, { id: 104, name: 'Zach Hill' }];
    const oneMike = [{ id: 101, name: 'Mike' }, { id: 102, name: 'Manny Orozco' },
                     { id: 103, name: 'Lance Webb' }, { id: 104, name: 'Zach Hill' }];

    test('duplicate names refuse rather than guess', () => {
        const res = RC.resolveRyderCupForRound(awayRound(twoMikes), hostRound(twoMikes), 'AWAY');
        assert.equal(res.status, 'identity-unresolved',
            'two golfers with one name were told apart by guessing');
    });

    test('a duplicate on the host round alone still refuses', () => {
        const res = RC.resolveRyderCupForRound(awayRound(oneMike), hostRound(twoMikes), 'AWAY');
        assert.equal(res.status, 'identity-unresolved',
            'two host golfers called Mike both resolved onto the one Mike playing here');
        assert.ok((res.identityProblems || []).some(p => p.type === 'duplicate-name'),
            'it refused without saying the names were the problem');
    });

    test('a duplicate on this round alone still refuses', () => {
        const res = RC.resolveRyderCupForRound(awayRound(twoMikes), hostRound(oneMike), 'AWAY');
        assert.equal(res.status, 'identity-unresolved',
            'the Cup picked one of two golfers called Mike on this round');
        assert.ok((res.identityProblems || []).some(p => p.type === 'duplicate-name'));
    });

    test('a refusal is never usable', () => {
        const blank = [{ id: 101, name: 'Player 1' }, { id: 102, name: 'Player 2' },
                       { id: 103, name: 'Player 3' }, { id: 104, name: 'Player 4' }];
        const res = RC.resolveRyderCupForRound(awayRound(blank), hostRound(blank), 'AWAY');
        assert.equal(RC.ryderResolutionUsable(res), false,
            'an unresolved identity was treated as a working Cup');
    });

    // Sitting a session out is normal on a trip and is not an error.
    test('a golfer absent from this round is simply not in it', () => {
        const three = AWAY_PLAYERS.filter(p => p.name !== 'Zach Hill');
        const res = RC.resolveRyderCupForRound(awayRound(three), hostRound(), 'AWAY');
        assert.equal(res.status, 'referenced', 'a sit-out was treated as a failure');
        const sides = sidesFor(res, three);
        assert.deepEqual(sides.a, ['Marty Sharp', 'Manny Orozco']);
        assert.ok(sides.b.some(n => String(n).startsWith('#')),
            'the absent golfer should resolve to nobody on this round');
    });
});

describe('FOUR-BALL READS THIS ROUND’S PLAYERS, NOT THE HOST’S', () => {

    // ryderFourBallState built its player lookup from the object CARRYING the Cup.
    // On the host that is the local round, so it worked; on any other round it is
    // the host's roster, and every translated id would miss. Found by auditing the
    // consumers of res.cup before writing this wave.
    test('the four-ball lookup is not built from the cup carrier', () => {
        const fn = RC_SRC.slice(RC_SRC.indexOf('function ryderFourBallState'),
                                RC_SRC.indexOf('function ryderFourBallState') + 1200);
        assert.ok(!/\(data\.players \|\| \[\]\)\.forEach/.test(fn),
            'Four-Ball still indexes the Cup-carrying round rather than the one being played');
        assert.match(fn, /roundPlayers|players \|\| /,
            'the four-ball lookup takes no explicit player list');
    });

    test('a four-ball match on a non-host round finds its golfers', () => {
        const away = awayRound();
        away.scores = {};
        AWAY_PLAYERS.forEach(p => CD.forEach(h => { away.scores['p' + p.id + '_h' + h.hole] = 4; }));
        const res = RC.resolveRyderCupForRound(away, hostRound(), 'AWAY');
        const out = RC.computeRyderMatchResult(res.cup, CD, away.scores, 'm1', away);
        assert.ok(out, 'a four-ball match on a visiting round scored nothing at all');
        assert.equal(out.thru, 18, 'the match found no scores for its golfers');
    });
});
