// ============================================================================
// SCOPED DOTS / STABLEFORD  (Phase 1 — orchestration-layer participant scoping)
//
// THE BUG THIS CLOSES
// computeRoundMoneyByPlayer derives its money players from cfg.players and has
// never read participantIds. Skins does honour it (settlement-engine.js calls
// fieldParticipants before computing), and so do the LIVE layers - bet-strip.js
// and hole-events.js both call fieldParticipants(game.config).
//
// Dots and Stableford went straight to computeRoundMoneyByPlayer with the whole
// round's player list. So a Dots instance scoped to four golfers:
//
//     showed  "Marty 2 dots"  on the scorecard   (4-player game)
//     settled  Stan +$160     on the Receipt     (8-player game)
//
// A golfer in another group could WIN a game he was never in, and every golfer
// in the round paid for it. The money still summed to zero, which is exactly why
// this survived - it balanced, just across the wrong people.
//
// THE FIX
// One scoping expression in computeGameNetByPlayerId. No golf mathematics moved.
// money-engine.js is untouched and its formulas are unchanged; the engines are
// simply handed the right people. This mirrors what Skins and side matches have
// always done.
//
// LEGACY
// fieldParticipants returns players.filter(playingForMoney !== false) whenever
// participantIds is absent - precisely what computeRoundMoneyByPlayer computes as
// moneyPlayers. Absence of participantIds still means "everyone". No migration,
// no version flag. The parity block at the bottom proves it against the engine as
// it was actually shipped.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f => {
        vm.runInContext(read(f), sb, { filename: f });
    });
    return sb;
}
const SB = engines();
const J = v => JSON.stringify(v);

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, handicap: i + 1, yards: 400 }));

//   GROUP 1  Marty Manny John Steve
//   GROUP 2  Stan  Greg  Tony James
//   GROUP 3  Ryan  Dalen Nick Paul
const G1 = [{ id: 101, name: 'Marty', handicap: 8 }, { id: 102, name: 'Manny', handicap: 12 },
            { id: 103, name: 'John', handicap: 4 }, { id: 104, name: 'Steve', handicap: 16 }];
const G2 = [{ id: 201, name: 'Stan', handicap: 6 }, { id: 202, name: 'Greg', handicap: 10 },
            { id: 203, name: 'Tony', handicap: 14 }, { id: 204, name: 'James', handicap: 2 }];
const G3 = [{ id: 301, name: 'Ryan', handicap: 5 }, { id: 302, name: 'Dalen', handicap: 9 },
            { id: 303, name: 'Nick', handicap: 13 }, { id: 304, name: 'Paul', handicap: 7 }];
const ALL8 = G1.concat(G2);
const ALL12 = ALL8.concat(G3);
const ids = a => a.map(p => String(p.id));

const SCORES = {};
ALL12.forEach((p, i) => { for (let h = 1; h <= 18; h++) SCORES[`p${p.id}_h${h}`] = 4 + ((i + h) % 3); });

// Stan (Group 2) is deliberately loaded up with dots. If scoping is wrong, he is
// the golfer who steals Group 1's money.
const DOTS = {
    h5: { p101: ['birdie', 'sandy'], p103: ['greenie'], p201: ['birdie', 'birdie', 'birdie', 'birdie', 'birdie'] },
    h9: { p202: ['greenie'], p301: ['birdie'] },
    h14: { p104: ['birdie'], p204: ['sandy'], p302: ['greenie'] }
};

// Settles one round through the REAL orchestration path and returns
// { gameKey: { playerId: net } }.
function settle(data, courseData, scores) {
    vm.runInContext(`window.__o = (function () {
        const d = ${J(data)};
        const out = {};
        getRoundGames(d).forEach(g => {
            out[g.key] = computeGameNetByPlayerId(g, ${J(courseData || CD)}, ${J(scores || SCORES)});
        });
        return out;
    })();`, SB);
    return SB.window.__o;
}

// The participant set the LIVE layers believe they are showing.
function liveField(data, format) {
    vm.runInContext(`window.__o = (function () {
        const g = getRoundGames(${J(data)}).find(x => x.format === '${format}');
        return fieldParticipants(g.config).map(p => String(p.id));
    })();`, SB);
    return Array.from(SB.window.__o).map(String);
}

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const touched = o => Object.keys(o).map(String).sort();

// ---------------------------------------------------------------------------
describe('SCOPED DOTS — a wager only pays the golfers in it', () => {
    const data = {
        players: ALL8, gameFormat: 'stroke', dots: DOTS,
        additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) } }
    };

    test('only Group 1 appears in the settlement at all', () => {
        const net = settle(data).d1;
        assert.deepEqual(touched(net), ids(G1).sort());
    });

    test('REGRESSION: an excluded golfer with five dots receives nothing', () => {
        // The headline bug. Stan had 5 dots and was paid $160 out of a game he was
        // not in, while all four Group 1 golfers helped fund it.
        const net = settle(data).d1;
        assert.equal(net['201'], undefined, 'Stan must not be in this pot at all');
    });

    test('no Group 2 golfer contributes a cent', () => {
        const net = settle(data).d1;
        ids(G2).forEach(id => assert.equal(net[id] === undefined || net[id] === 0, true,
            `player ${id} must have $0 contribution`));
    });

    test('an outsider\'s dots do not change what the insiders pay each other', () => {
        // Same round, but Stan's five dots removed entirely. Group 1's money must be
        // identical - proof he has no tie-breaking or unit influence either.
        const withoutStan = JSON.parse(JSON.stringify(data));
        delete withoutStan.dots.h5.p201;
        assert.deepEqual(settle(data).d1, settle(withoutStan).d1);
    });

    test('the arithmetic is the documented per-dot formula, hand-checked', () => {
        // units: Marty 2, John 1, Steve 1, Manny 0 -> total 4 over n=4
        //   Marty 5*(4*2-4)=+20   John 5*(4*1-4)=0   Steve 0   Manny 5*(0-4)=-20
        const net = settle(data).d1;
        assert.equal(net['101'], 20);
        assert.equal(net['102'], -20);
        assert.equal(net['103'], 0);
        assert.equal(net['104'], 0);
    });

    test('zero-sum within the wager', () => {
        assert.equal(sum(settle(data).d1), 0);
    });
});

// ---------------------------------------------------------------------------
describe('TWO SIMULTANEOUS DOTS GAMES — genuinely independent', () => {
    const data = {
        players: ALL8, gameFormat: 'stroke', dots: DOTS,
        additionalGameInstances: {
            d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) },
            d2: { format: 'dots', dotPointVal: 10, participantIds: ids(G2) }
        }
    };

    test('each game touches only its own four golfers', () => {
        const s = settle(data);
        assert.deepEqual(touched(s.d1), ids(G1).sort());
        assert.deepEqual(touched(s.d2), ids(G2).sort());
    });

    test('REGRESSION: the two games are not the same game at two stakes', () => {
        // Before the fix both instances settled across all eight players, so d2 was
        // d1 scaled by stake - Marty won Group 2's dots game.
        const s = settle(data);
        assert.equal(s.d1['201'], undefined, 'Stan must not appear in Group 1\'s game');
        assert.equal(s.d2['101'], undefined, 'Marty must not appear in Group 2\'s game');
    });

    test('a Group 1 dot cannot move Group 2 money', () => {
        const more = JSON.parse(JSON.stringify(data));
        more.dots.h9.p101 = ['birdie', 'birdie'];   // Marty, Group 1
        assert.deepEqual(settle(more).d2, settle(data).d2, 'Group 2 money must not move');
    });

    test('a Group 2 dot cannot move Group 1 money', () => {
        const more = JSON.parse(JSON.stringify(data));
        more.dots.h9.p203 = ['sandy', 'sandy'];     // Tony, Group 2
        assert.deepEqual(settle(more).d1, settle(data).d1, 'Group 1 money must not move');
    });

    test('different stakes stay independent, and each is zero-sum', () => {
        const s = settle(data);
        assert.equal(sum(s.d1), 0);
        assert.equal(sum(s.d2), 0);
    });

    test('zero-sum across BOTH games combined', () => {
        const s = settle(data);
        assert.equal(sum(s.d1) + sum(s.d2), 0);
    });
});

// ---------------------------------------------------------------------------
describe('THREE SIMULTANEOUS DOTS GAMES — 12 golfers, 4/4/4', () => {
    const data = {
        players: ALL12, gameFormat: 'stroke', dots: DOTS,
        additionalGameInstances: {
            d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) },
            d2: { format: 'dots', dotPointVal: 10, participantIds: ids(G2) },
            d3: { format: 'dots', dotPointVal: 2, participantIds: ids(G3) }
        }
    };

    test('each game has exactly its own four participants', () => {
        const s = settle(data);
        assert.deepEqual(touched(s.d1), ids(G1).sort());
        assert.deepEqual(touched(s.d2), ids(G2).sort());
        assert.deepEqual(touched(s.d3), ids(G3).sort());
    });

    test('zero cross-contamination in any direction', () => {
        const s = settle(data);
        const groups = [[s.d1, ids(G1)], [s.d2, ids(G2)], [s.d3, ids(G3)]];
        groups.forEach(([net, own]) => {
            Object.keys(net).forEach(id => assert.ok(own.includes(String(id)),
                `${id} settled in a game it does not belong to`));
        });
    });

    test('all three independently zero-sum, and zero-sum combined', () => {
        const s = settle(data);
        [s.d1, s.d2, s.d3].forEach(net => assert.equal(sum(net), 0));
        assert.equal(sum(s.d1) + sum(s.d2) + sum(s.d3), 0);
    });
});

// ---------------------------------------------------------------------------
describe('SNAKE — a negative unit stays negative inside a scoped game', () => {
    const snakeDots = { h5: { p101: ['birdie', 'sandy'], p102: ['snake'], p201: ['birdie', 'birdie'] } };
    const data = {
        players: ALL8, gameFormat: 'stroke', dots: snakeDots,
        additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) } }
    };

    test('the snake holder still carries -1 unit after scoping', () => {
        vm.runInContext(`window.__o = (function () {
            const g = getRoundGames(${J(data)}).find(x => x.format === 'dots');
            const scoped = Object.assign({}, g.config, { players: fieldParticipants(g.config) });
            return calcDotsEngine(scoped, ${J(CD)}, ${J(SCORES)}).totals;
        })();`, SB);
        assert.equal(SB.window.__o['102'], -1, 'Manny\'s snake must remain a negative unit');
    });

    test('no sign inversion — the snake holder loses money', () => {
        const net = settle(data).d1;
        assert.ok(net['102'] < 0, 'the snake must cost Manny, not pay him');
        assert.ok(net['101'] > 0, 'Marty\'s two dots must still pay him');
    });

    test('hand-checked: units Marty 2, Manny -1, John 0, Steve 0 over n=4', () => {
        const net = settle(data).d1;
        assert.equal(net['101'], 35);    // 5*(4*2 - 1)
        assert.equal(net['102'], -25);   // 5*(4*-1 - 1)
        assert.equal(net['103'], -5);    // 5*(0 - 1)
        assert.equal(net['104'], -5);
    });

    test('excluded players stay out even with a snake in play, and zero-sum holds', () => {
        const net = settle(data).d1;
        ids(G2).forEach(id => assert.equal(net[id], undefined));
        assert.equal(sum(net), 0);
    });
});

// ---------------------------------------------------------------------------
describe('START HOLE + participant scoping compose', () => {
    const data = {
        players: ALL8, gameFormat: 'stroke', dots: DOTS,
        additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, startHole: 10, participantIds: ids(G1) } }
    };

    test('holes before the start hole do not settle', () => {
        // H5 gave Marty 2 and John 1. From H10 only Steve's H14 birdie counts.
        const net = settle(data).d1;
        assert.equal(net['104'], 15);    // 5*(4*1 - 1)
        assert.equal(net['101'], -5);    // Marty's H5 dots are outside the range
        assert.equal(net['103'], -5);
    });

    test('Group 2 still contributes $0 under a start hole', () => {
        const net = settle(data).d1;
        ids(G2).forEach(id => assert.equal(net[id], undefined));
    });

    test('still zero-sum', () => {
        assert.equal(sum(settle(data).d1), 0);
    });
});

// ---------------------------------------------------------------------------
describe('SCOPED STABLEFORD — the same leak, the same fix', () => {
    // Gross scoring with genuinely different profiles, so points actually diverge.
    const prof = { 101: 4, 102: 4, 103: 4, 104: 4, 201: 3, 202: 4, 203: 4, 204: 6 };
    const sfScores = {};
    ALL8.forEach(p => { for (let i = 1; i <= 18; i++) sfScores[`p${p.id}_h${i}`] = prof[p.id]; });

    const data = {
        players: ALL8, gameFormat: 'stroke',
        additionalGameInstances: {
            f2: { format: 'stableford', stablefordPointVal: 1, stablefordScoring: 'gross', participantIds: ids(G2) }
        }
    };

    test('REGRESSION: a Group 2 Stableford no longer pays Group 1', () => {
        // Before the fix every Group 1 golfer collected $18 from a game they were
        // not playing, funded by James.
        const net = settle(data, CD, sfScores).f2;
        ids(G1).forEach(id => assert.equal(net[id], undefined,
            `${id} must not be in a Group 2 Stableford`));
    });

    test('only Group 2 settles', () => {
        const net = settle(data, CD, sfScores).f2;
        assert.deepEqual(touched(net), ids(G2).sort());
    });

    test('the points leader is still paid, and the tail still pays', () => {
        const net = settle(data, CD, sfScores).f2;
        assert.ok(net['201'] > 0, 'Stan scored best and must be paid');
        assert.ok(net['204'] < 0, 'James scored worst and must pay');
    });

    test('zero-sum', () => {
        assert.equal(sum(settle(data, CD, sfScores).f2), 0);
    });
});

// ---------------------------------------------------------------------------
describe('LIVE / SETTLEMENT PARITY — the divergence that hid this bug', () => {
    // The regression test that would have caught the original bug on day one.
    const cases = [
        { label: 'scoped dots', format: 'dots', key: 'd1', data: {
            players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) } } } },
        { label: 'scoped dots, mid-round start', format: 'dots', key: 'd1', data: {
            players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, startHole: 10, participantIds: ids(G1) } } } },
        { label: 'scoped stableford', format: 'stableford', key: 'f2', data: {
            players: ALL8, gameFormat: 'stroke',
            additionalGameInstances: { f2: { format: 'stableford', stablefordPointVal: 1, participantIds: ids(G2) } } } },
        { label: 'unscoped dots (legacy)', format: 'dots', key: 'd1', data: {
            players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5 } } } }
    ];

    cases.forEach(c => {
        test(`${c.label}: the live field and the settled field are the same people`, () => {
            const live = liveField(c.data, c.format).sort();
            const settled = touched(settle(c.data)[c.key]);
            assert.deepEqual(settled, live,
                'what the scorecard shows live must be exactly who the Receipt pays');
        });
    });

    test('the live layers and settlement read the SAME participant resolver', () => {
        // Both sides must go through fieldParticipants. If either ever stops, the two
        // can silently drift apart again.
        assert.ok(/fieldParticipants\(game\.config\)/.test(read('bet-strip.js')),
            'bet-strip must resolve participants through fieldParticipants');
        assert.ok(/fieldParticipants\(game\.config\)/.test(read('hole-events.js')),
            'hole-events must resolve participants through fieldParticipants');
        assert.ok(/fieldParticipants\(cfg\)/.test(read('settlement-engine.js')),
            'settlement must resolve participants through fieldParticipants');
    });
});

// ---------------------------------------------------------------------------
describe('LEGACY PARITY — absence of participantIds still means everyone', () => {
    // Every shape a saved round can already be in. None of these carries
    // participantIds, so none of them may move by a cent.
    const legacy = {
        'main-format dots': { players: ALL8, gameFormat: 'dots', dotPointVal: 5, dots: DOTS },
        'additionalGames.dots slot': { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGames: { dots: { enabled: true, dotPointVal: 5 } } },
        'instance dots, no participantIds': { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5 } } },
        'main-format stableford': { players: ALL8, gameFormat: 'stableford', stablefordPointVal: 1 },
        'additionalGames.stableford slot': { players: ALL8, gameFormat: 'stroke',
            additionalGames: { stableford: { enabled: true, stablefordPointVal: 1 } } },
        'instance stableford, no participantIds': { players: ALL8, gameFormat: 'stroke',
            additionalGameInstances: { f1: { format: 'stableford', stablefordPointVal: 1 } } }
    };

    Object.entries(legacy).forEach(([label, data]) => {
        test(`${label}: every money player in the round still settles`, () => {
            const s = settle(data);
            Object.values(s).forEach(net => {
                if (Object.keys(net).length === 0) return;   // stroke play carries no wager
                assert.deepEqual(touched(net), ids(ALL8).sort(),
                    'an unscoped game must still include the whole field');
            });
        });

        test(`${label}: zero-sum`, () => {
            Object.values(settle(data)).forEach(net => assert.equal(sum(net), 0));
        });
    });

    test('a player opted out of money is still excluded, exactly as before', () => {
        const optOut = ALL8.map(p => String(p.id) === '104' ? Object.assign({}, p, { playingForMoney: false }) : p);
        const net = settle({ players: optOut, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5 } } }).d1;
        assert.equal(net['104'], undefined, 'playingForMoney:false must still remove a golfer');
        assert.equal(sum(net), 0);
    });

    test('an empty participantIds array means everyone, not nobody', () => {
        // fieldParticipants treats [] as "not narrowed". Pinned so a future refactor
        // cannot turn a saved round into a zero-player wager.
        const net = settle({ players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: [] } } }).d1;
        assert.deepEqual(touched(net), ids(ALL8).sort());
    });
});

// ---------------------------------------------------------------------------
describe('THE MAIN GAME IS UNAFFECTED', () => {
    // participantIds is only ever written inside a game entry, never at the round
    // root, so the main game's config cannot carry one. Pinned here because the
    // scoping line runs for the main game too.
    const t = (a, b) => ALL8.slice(0, 4).map((p, i) => Object.assign({}, p,
        { team: a.includes(i) ? 'Team 1' : 'Team 2' }));

    const mains = {
        'nassau': { players: t([0], [1]).slice(0, 2), gameFormat: 'nassau', nassauStake: 20 },
        'match with auto press': { players: t([0], [1]).slice(0, 2), gameFormat: 'match', matchStake: 50, matchPressRule: 'auto2' },
        'bestball 2v2': { players: t([0, 1], [2, 3]), gameFormat: 'bestball', matchStake: 40 },
        'wolf': { players: ALL8.slice(0, 4), gameFormat: 'wolf', wolfPointVal: 5 }
    };

    Object.entries(mains).forEach(([label, data]) => {
        test(`${label} still settles and stays zero-sum`, () => {
            const net = settle(data).main;
            assert.equal(sum(net), 0);
        });
    });

    test('no production path writes participantIds at the round root', () => {
        // If this ever changes, the main game becomes scopable and this whole block
        // needs revisiting.
        const admin = read('admin.html');
        assert.ok(!/^\s*participantIds:/m.test(admin.replace(/entry\.participantIds/g, '')) ||
            /entry\.participantIds = chosen/.test(admin),
            'participantIds should only be attached to game entries');
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED MATH — no golf formula was touched', () => {
    test('money-engine.js still owns the dots formula, unchanged', () => {
        const me = read('money-engine.js');
        assert.ok(/function calcDotsEngine\(data, courseData, savedScores\)/.test(me));
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me),
            'the per-dot zero-sum formula must be exactly as shipped');
    });

    test('the stableford payout still goes through calcPointSettlement', () => {
        const me = read('money-engine.js');
        assert.ok(/dollarPerPoint \* \(n \* myPts - sumPts\)/.test(me));
    });

    test('settlement-engine introduces NO dots or stableford arithmetic of its own', () => {
        const se = read('settlement-engine.js');
        assert.ok(!/dotPointVal \*/.test(se), 'settlement must not compute dot money itself');
        assert.ok(!/stablefordPointVal \*/.test(se), 'settlement must not compute stableford money itself');
        assert.ok(!/function calcDotsEngine/.test(se), 'no second dots engine may exist');
    });

    test('the scoping happens before the engine call, not inside it', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function computeGameNetByPlayerId'),
            se.indexOf('// THE RECEIPT'));
        const scopeAt = fn.indexOf('fieldParticipants(cfg)');
        const callAt = fn.indexOf('computeRoundMoneyByPlayer(');
        assert.ok(scopeAt > -1, 'the scoping must exist');
        assert.ok(scopeAt < callAt, 'participants must be scoped before the engine is called');
    });

    test('the engine still receives a plain players array', () => {
        vm.runInContext(`window.__o = (function () {
            const g = getRoundGames(${J({ players: ALL8, gameFormat: 'stroke', dots: DOTS,
                additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) } } })})
                .find(x => x.format === 'dots');
            const scoped = Object.assign({}, g.config, { players: fieldParticipants(g.config) });
            return { n: scoped.players.length, hasName: !!scoped.players[0].name, stake: scoped.dotPointVal };
        })();`, SB);
        const o = SB.window.__o;
        assert.equal(o.n, 4);
        assert.equal(o.hasName, true);
        assert.equal(o.stake, 5);
    });
});

// ---------------------------------------------------------------------------
describe('SHARED DOT EVENT STORAGE — stored once, scoped at calculation', () => {
    test('an excluded golfer\'s stored dot event is simply ignored', () => {
        // calcDotsEngine seeds totals from data.players and guards every credit with
        // `if (totals[pid] !== undefined)`. Once players is scoped, Stan's p201 entry
        // has no slot and is dropped - no event filtering is needed at all.
        const data = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: { d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) } } };
        const net = settle(data).d1;
        assert.equal(net['201'], undefined);
        // and the event is still there in the round data, untouched
        assert.deepEqual(data.dots.h5.p201, ['birdie', 'birdie', 'birdie', 'birdie', 'birdie']);
    });

    test('one stored event can feed two different wagers independently', () => {
        // The same h5 map is read by both games. Neither duplicates event storage.
        const data = { players: ALL8, gameFormat: 'stroke', dots: DOTS,
            additionalGameInstances: {
                d1: { format: 'dots', dotPointVal: 5, participantIds: ids(G1) },
                d2: { format: 'dots', dotPointVal: 10, participantIds: ids(G2) } } };
        const s = settle(data);
        assert.ok(Object.keys(s.d1).length === 4 && Object.keys(s.d2).length === 4);
        assert.equal(sum(s.d1), 0);
        assert.equal(sum(s.d2), 0);
    });
});
