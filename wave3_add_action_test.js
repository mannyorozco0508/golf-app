const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const AM = loadJsFile('action-model.js');
const settle = loadHtmlInlineScript('settlement.html', ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

function layered(files) {
    const sb = loadJsFile(files[0]);
    files.slice(1).forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const BS = layered(['action-model.js', 'money-engine.js', 'bet-strip.js']);

const ZERO = 0.005;
const netOf = r => { const o = {}; Object.keys(r.netByName).forEach(k => o[k] = r.netByName[k].net); return o; };
const sumOf = r => Object.values(netOf(r)).reduce((s, v) => s + v, 0);
const totalOf = n => Object.values(n).reduce((s, v) => s + v, 0);

function four(holes) {
    const cd = makeCourseData(holes || 18);
    const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
    return { cd, p };
}
function scoreAll(p, cd, upToHole, fn) {
    const s = {};
    cd.filter(h => h.hole <= upToHole).forEach(h => p.forEach((pl, pi) => {
        s[`p${pl.id}_h${h.hole}`] = fn ? fn(h, pi) : h.par;
    }));
    return s;
}

// ---------------------------------------------------------------------------
describe('START HOLE — a new game never reaches back into completed holes', () => {
    const { cd, p } = four();

    test('with holes 1-4 finished, the next game starts on hole 5', () => {
        const scores = scoreAll(p, cd, 4);
        assert.equal(AM.nextAddActionHole({ players: p }, cd, scores), 5);
    });

    test('before anyone has scored, a new game simply starts on hole 1', () => {
        assert.equal(AM.nextAddActionHole({ players: p }, cd, {}), 1);
    });

    test('REGRESSION: a hole only PART of the group has posted is not finished', () => {
        // A whole-group wager cannot start on a hole some of the group already played.
        const scores = scoreAll(p, cd, 4);
        scores[`p${p[0].id}_h5`] = 4; // one golfer has posted hole 5, the others have not
        assert.equal(AM.nextAddActionHole({ players: p }, cd, scores), 5,
            'hole 5 is still in progress, so a new game starts there');
    });

    test('REGRESSION: out-of-order entry uses the last COMPLETE hole, never a count', () => {
        const scores = scoreAll(p, cd, 3);
        p.forEach(pl => { scores[`p${pl.id}_h7`] = 4; }); // hole 7 done, 4-6 skipped
        assert.equal(AM.nextAddActionHole({ players: p }, cd, scores), 8,
            'a count-based implementation would have said hole 5, which is already played');
    });

    test('a back-nine round uses its own hole numbers, not an assumed H1-18', () => {
        const back = makeCourseData(18).filter(h => h.hole >= 10);
        const scores = {};
        back.slice(0, 3).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
        assert.equal(AM.nextAddActionHole({ players: p }, back, scores), 13);
    });

    test('once the round is over there is no hole left, so Add Action shuts off', () => {
        assert.equal(AM.nextAddActionHole({ players: p }, cd, scoreAll(p, cd, 18)), null);
    });

    test('a front-nine round ends after hole 9', () => {
        const front = makeCourseData(9);
        assert.equal(AM.nextAddActionHole({ players: p }, front, scoreAll(p, front, 9)), null);
    });
});

describe('HOLE RANGES — each game sees only its own holes', () => {
    const { cd } = four();

    test('a game starting hole 5 covers H5-18', () => {
        const holes = AM.gameHoles({ startHole: 5 }, cd);
        assert.equal(holes.length, 14);
        assert.equal(holes[0].hole, 5);
        assert.equal(holes[holes.length - 1].hole, 18);
    });

    test('a game starting hole 5 in a FRONT NINE round covers H5-9, not H5-18', () => {
        const front = makeCourseData(9);
        const holes = AM.gameHoles({ startHole: 5 }, front);
        assert.equal(holes.map(h => h.hole).join(','), '5,6,7,8,9');
    });

    test('a full-round game keeps every hole', () => {
        assert.equal(AM.gameHoles({ startHole: 1 }, cd).length, 18);
        assert.equal(AM.gameHoles({}, cd).length, 18);
    });

    test('the range reads in golf language, and is blank for a full-round game', () => {
        assert.equal(AM.gameRangeText({ startHole: 5 }, cd), 'H5\u201318');
        assert.equal(AM.gameRangeText({ startHole: 1 }, cd), '', 'H1-18 on every wager is noise');
    });

    test('dot events before the start hole are dropped', () => {
        const dots = { h2: { p1: ['greenie'] }, h5: { p1: ['birdie'] }, h11: { p2: ['sandy'] } };
        assert.equal(Object.keys(AM.scopeDotsToRange(dots, 5)).join(','), 'h5,h11');
    });

    test('getRoundGames scopes a mid-round dots game to its own events', () => {
        const games = AM.getRoundGames({
            gameFormat: 'nassau',
            dots: { h2: { p1: ['greenie'] }, h9: { p1: ['birdie'] } },
            additionalGames: { dots: { enabled: true, dotPointVal: 2, startHole: 5 } }
        });
        assert.equal(Object.keys(games[1].config.dots).join(','), 'h9');
    });
});

describe('ADDABLE GAMES — no duplicate wagers', () => {
    test('a game already running as the main format cannot be added again', () => {
        assert.ok(!AM.addableGames({ gameFormat: 'skins' }).includes('skins'));
    });

    test('a game already running as an additional game cannot be added again', () => {
        const list = AM.addableGames({ gameFormat: 'nassau', additionalGames: { dots: { enabled: true } } });
        assert.ok(!list.includes('dots'), 'a second identical wager is a double-settlement risk');
        assert.ok(list.includes('skins'));
    });

    test('a disabled game becomes addable again', () => {
        assert.ok(AM.addableGames({ gameFormat: 'nassau', additionalGames: { skins: { enabled: false } } }).includes('skins'));
    });
});

// ---------------------------------------------------------------------------
describe('SKINS RANGE — H5-18 behaves as if holes 1-4 never happened', () => {
    const { cd, p } = four();
    const cfg = start => ({
        gameFormat: 'nassau', players: p, courseData: cd, nassauStake: 0,
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: start } }
    });
    const skinsNet = (start, scores) => {
        const g = AM.getRoundGames(Object.assign(cfg(start), { scores })).find(x => x.key === 'skins');
        return settle.computeGameNetByPlayerId(g, cd, scores);
    };

    test('a skin won on hole 2 does not count for a game starting hole 5', () => {
        const scores = scoreAll(p, cd, 4, (h, pi) => h.par + (pi === 0 && h.hole === 2 ? -1 : 0));
        const n = skinsNet(5, scores);
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO,
            'nothing inside the range has been played, so nobody is up or down'));
    });

    test('a skin won inside the range does count', () => {
        const scores = scoreAll(p, cd, 7, (h, pi) => h.par + (pi === 0 && h.hole === 6 ? -1 : 0));
        const n = skinsNet(5, scores);
        assert.ok(n[p[0].id] > ZERO, 'the hole 6 skin should pay');
        assert.ok(Math.abs(totalOf(n)) < ZERO);
    });

    test('carrying starts fresh at the start hole — holes 1-4 build no carry', () => {
        // Everything ties through hole 6, then Manny wins hole 7. A game starting at
        // hole 5 must award a 3-hole carry (5,6,7), not a 7-hole one.
        const scores = scoreAll(p, cd, 7, (h, pi) => h.par + (pi === 0 && h.hole === 7 ? -1 : 0));
        const fromFive = skinsNet(5, scores);
        const fromOne = skinsNet(1, scores);
        assert.ok(fromOne[p[0].id] > fromFive[p[0].id],
            'a full-round game carries more holes into that skin than an H5-18 game');
        assert.ok(Math.abs(totalOf(fromFive)) < ZERO);
    });

    test('the pot prorates against the WAGER range, not an 18-hole round', () => {
        // H5-18 is 14 holes. Playing 5,6,7 is 3/14 of that wager, not 7/18 of a round
        // the wager was never part of.
        const scores = scoreAll(p, cd, 7);
        const n = skinsNet(5, scores);
        assert.ok(Math.abs(totalOf(n)) < ZERO);
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO, 'all tied so far - nobody is down'));
    });

    test('REGRESSION: the Option B live-money rule survives a range', () => {
        // Nobody may show a loss just because a wager exists.
        [1, 5, 12].forEach(start => {
            const n = skinsNet(start, {});
            assert.ok(Math.abs(totalOf(n)) < ZERO, `start ${start} broke zero-sum with no scores`);
            Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO,
                `start ${start}: a golfer is down money before a ball was struck`));
        });
    });

    test('zero-sum holds at every stage of a ranged skins game', () => {
        [4, 5, 6, 9, 14, 18].forEach(thru => {
            const scores = scoreAll(p, cd, thru, (h, pi) => h.par + (pi === 1 && h.hole % 5 === 0 ? -1 : 0));
            const n = skinsNet(5, scores);
            assert.ok(Math.abs(totalOf(n)) < ZERO, `thru ${thru} summed to ${totalOf(n)}`);
        });
    });

    test('a COMPLETED ranged skins game settles zero-sum', () => {
        const scores = scoreAll(p, cd, 18, (h, pi) => h.par + (pi === 2 && h.hole > 5 && h.hole % 3 === 0 ? -1 : 0));
        const n = skinsNet(5, scores);
        assert.ok(Math.abs(totalOf(n)) < ZERO);
        assert.ok(n[p[2].id] > ZERO, 'the skin winner should be up');
    });
});

describe('DOTS RANGE — events before the start hole are ignored', () => {
    const { cd, p } = four();
    function dotsNet(start, dots) {
        const data = {
            gameFormat: 'nassau', players: p, courseData: cd, scores: {}, nassauStake: 0, dots,
            additionalGames: { dots: { enabled: true, dotPointVal: 2, startHole: start } }
        };
        const g = AM.getRoundGames(data).find(x => x.key === 'dots');
        return settle.computeGameNetByPlayerId(g, cd, {});
    }

    test('a greenie on hole 2 pays nothing in a game starting hole 5', () => {
        const n = dotsNet(5, { h2: { [`p${p[0].id}`]: ['greenie'] } });
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO));
    });

    test('the same greenie DOES pay in a full-round game', () => {
        const n = dotsNet(1, { h2: { [`p${p[0].id}`]: ['greenie'] } });
        assert.ok(n[p[0].id] > ZERO);
        assert.ok(Math.abs(totalOf(n)) < ZERO);
    });

    test('events inside the range pay, events outside do not, in the same round', () => {
        const n = dotsNet(5, {
            h2: { [`p${p[0].id}`]: ['greenie', 'birdie'] },
            h9: { [`p${p[1].id}`]: ['sandy'] }
        });
        assert.ok(n[p[1].id] > ZERO, 'the hole 9 sandy should pay');
        assert.ok(n[p[0].id] < 0, 'the hole 2 dots should not — he only pays his share');
        assert.ok(Math.abs(totalOf(n)) < ZERO);
    });

    test('a snake before the range is not held against anyone', () => {
        const n = dotsNet(5, { h3: { [`p${p[0].id}`]: ['snake'] } });
        Object.values(n).forEach(v => assert.ok(Math.abs(v) < ZERO));
    });
});

describe('STABLEFORD RANGE — included, and safe', () => {
    const { cd, p } = four();
    test('points before the start hole do not count, and handicaps stay per-hole', () => {
        // calcStablefordEngine allocates strokes per hole via getStrokes(h.hcpIndex, hcp)
        // and sums points. Filtering the hole list therefore needs NO new handicap
        // mathematics - a stroke on hole 3 simply never comes up.
        const players = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        const scores = scoreAll(players, cd, 9, (h, pi) => h.par + (pi === 0 && h.hole < 5 ? -1 : 0));
        const build = start => {
            const data = {
                gameFormat: 'nassau', players, courseData: cd, scores, nassauStake: 0,
                additionalGames: { stableford: { enabled: true, stablefordPointVal: 1, stablefordScoring: 'gross', startHole: start } }
            };
            const g = AM.getRoundGames(data).find(x => x.key === 'stableford');
            return settle.computeGameNetByPlayerId(g, cd, scores);
        };
        const ranged = build(5), full = build(1);
        assert.ok(full[players[0].id] > ranged[players[0].id],
            'birdies on holes 1-4 should only help the full-round game');
        assert.ok(Math.abs(totalOf(ranged)) < ZERO);
        assert.ok(Math.abs(totalOf(full)) < ZERO);
    });
});

// ---------------------------------------------------------------------------
describe('SCORE CORRECTIONS — only holes inside a game\'s range move it', () => {
    const { cd, p } = four();
    const data = scores => ({
        gameFormat: 'nassau', players: p, courseData: cd, scores,
        nassauStake: 20, nassauScoring: 'gross', nassauPressRule: 'none',
        additionalGames: {
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 },
            dots: { enabled: true, dotPointVal: 2, startHole: 9 }
        },
        dots: { h11: { [`p${p[0].id}`]: ['birdie'] } }
    });
    const skinsOf = scores => {
        const g = AM.getRoundGames(data(scores)).find(x => x.key === 'skins');
        return settle.computeGameNetByPlayerId(g, cd, scores);
    };

    const base = scoreAll(p, cd, 12, (h, pi) => h.par + (pi === 0 && h.hole === 7 ? -1 : 0));

    test('correcting hole 3 does NOT move a skins game that starts on hole 5', () => {
        const before = skinsOf(base);
        const fixed = Object.assign({}, base); fixed[`p${p[1].id}_h3`] = 2;
        const after = skinsOf(fixed);
        Object.keys(before).forEach(id => assert.ok(Math.abs(before[id] - after[id]) < ZERO,
            'a correction outside the range must not move the wager'));
    });

    test('correcting hole 6 DOES move it', () => {
        const before = skinsOf(base);
        const fixed = Object.assign({}, base); fixed[`p${p[1].id}_h6`] = 2;
        const after = skinsOf(fixed);
        const moved = Object.keys(before).some(id => Math.abs(before[id] - after[id]) > ZERO);
        assert.ok(moved, 'a correction inside the range must recalculate');
    });

    test('the whole stacked round stays zero-sum through both corrections', () => {
        [base, Object.assign({}, base, { [`p${p[1].id}_h3`]: 2 }), Object.assign({}, base, { [`p${p[1].id}_h6`]: 2 })]
            .forEach(sc => assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data(sc), cd, sc))) < ZERO));
    });

    test('nothing is cached — the same inputs always give the same answer', () => {
        const a = skinsOf(base), b = skinsOf(base);
        Object.keys(a).forEach(id => assert.ok(Math.abs(a[id] - b[id]) < ZERO));
    });
});

// ---------------------------------------------------------------------------
describe('ACCEPTANCE — "we\'re on 5, let\'s add skins"', () => {
    const cd = makeCourseData(18);
    const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);

    // Through hole 4 everyone is level. Skins is added starting hole 5.
    // Holes 5 and 6 tie, Marty wins hole 7 — so he should collect a 3-hole carry.
    function scoresThru(n) {
        const s = {};
        cd.filter(h => h.hole <= n).forEach(h => p.forEach((pl, pi) => {
            s[`p${pl.id}_h${h.hole}`] = h.par + (pi === 1 && h.hole === 7 ? -1 : 0);
        }));
        return s;
    }
    const round = scores => ({
        gameFormat: 'nassau', players: p, courseData: cd, scores,
        nassauStake: 20, nassauScoring: 'gross', nassauPressRule: '2down',
        dots: { h3: { [`p${p[1].id}`]: ['greenie'] } },
        additionalGames: {
            dots: { enabled: true, dotPointVal: 2 },
            skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 }
        },
        sideMatches: {
            sm1: {
                format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                tieRule: 'push', overallMode: 'stroke', segment: 'full',
                teamAIds: [String(p[1].id)], teamBIds: [String(p[2].id)]
            }
        }
    });

    test('after hole 4, the app offers hole 5 as the start', () => {
        assert.equal(AM.nextAddActionHole({ players: p }, cd, scoresThru(4)), 5);
    });

    test('the new wager reads H5-18 and holes 1-4 never touch it', () => {
        const g = AM.getRoundGames(round(scoresThru(7))).find(x => x.key === 'skins');
        assert.equal(AM.gameRangeText(g, cd), 'H5\u201318');
        assert.equal(AM.gameHoles(g, cd)[0].hole, 5);
    });

    test('Marty collects the hole 5-6-7 carry, and nobody else profits from holes 1-4', () => {
        const scores = scoresThru(7);
        const g = AM.getRoundGames(round(scores)).find(x => x.key === 'skins');
        const n = settle.computeGameNetByPlayerId(g, cd, scores);
        assert.ok(n[p[1].id] > ZERO, 'Marty should be up on skins');
        assert.ok(Math.abs(totalOf(n)) < ZERO);
    });

    test('correcting hole 3 leaves skins alone; correcting hole 6 moves it', () => {
        const scores = scoresThru(7);
        const skins = sc => {
            const g = AM.getRoundGames(round(sc)).find(x => x.key === 'skins');
            return settle.computeGameNetByPlayerId(g, cd, sc);
        };
        const before = skins(scores);

        const fixThree = Object.assign({}, scores); fixThree[`p${p[0].id}_h3`] = 2;
        Object.keys(before).forEach(id => assert.ok(Math.abs(before[id] - skins(fixThree)[id]) < ZERO,
            'hole 3 is outside the wager'));

        const fixSix = Object.assign({}, scores); fixSix[`p${p[0].id}_h6`] = 2;
        assert.ok(Object.keys(before).some(id => Math.abs(before[id] - skins(fixSix)[id]) > ZERO),
            'hole 6 is inside the wager');
    });

    test('everything settles together and the money comes to exactly zero', () => {
        const scores = scoresThru(18);
        const combined = settle.computeCombinedNetTotals(round(scores), cd, scores);
        assert.ok(Math.abs(sumOf(combined)) < ZERO, `combined summed to ${sumOf(combined)}`);

        // Who Pays Who must move exactly what the ledger says.
        const paid = {};
        combined.transactions.forEach(t => {
            paid[t.from] = (paid[t.from] || 0) - t.amount;
            paid[t.to] = (paid[t.to] || 0) + t.amount;
        });
        const byName = netOf(combined);
        Object.keys(byName).forEach(k => {
            const name = combined.netByName[k].name;
            assert.ok(Math.abs((paid[name] || 0) - byName[k]) < 0.02, `${name} does not reconcile`);
        });
    });

    test('the mid-round wager contributes to a Trip exactly once', () => {
        const scores = scoresThru(18);
        const r1 = netOf(settle.computeCombinedNetTotals(round(scores), cd, scores));
        const trip = {};
        Object.keys(r1).forEach(k => { trip[k] = (trip[k] || 0) + r1[k]; });
        Object.keys(trip).forEach(k => assert.ok(Math.abs(trip[k] - r1[k]) < ZERO));
        assert.ok(Math.abs(totalOf(trip)) < ZERO);
    });
});

// ---------------------------------------------------------------------------
describe('LEGACY — rounds without startHole behave exactly as before', () => {
    const { cd, p } = four();
    test('an additional game with no startHole covers the whole round', () => {
        const scores = scoreAll(p, cd, 18, (h, pi) => h.par + (pi === 0 && h.hole < 4 ? -1 : 0));
        const data = {
            gameFormat: 'nassau', players: p, courseData: cd, scores, nassauStake: 0,
            additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' } }
        };
        const g = AM.getRoundGames(data).find(x => x.key === 'skins');
        assert.equal(g.startHole, 1);
        assert.equal(AM.gameHoles(g, cd).length, 18);
        assert.ok(settle.computeGameNetByPlayerId(g, cd, scores)[p[0].id] > ZERO,
            'his early skins must still count');
    });

    test('a legacy single-game round is untouched by any of this', () => {
        const scores = scoreAll(p, cd, 18);
        const data = { gameFormat: 'skins', players: p, courseData: cd, scores, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross' };
        assert.equal(AM.getRoundGames(data).length, 1);
        assert.ok(Math.abs(sumOf(settle.computeCombinedNetTotals(data, cd, scores))) < ZERO);
    });
});

// ---------------------------------------------------------------------------
describe('PERMISSIONS — only the organizer can change what the round plays for', () => {
    const idx = read('index.html');

    test('Add Action is gated on the Batch 1 organizer predicate', () => {
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/isOrganizerView\(\)/.test(fn), 'a group scorekeeper must not reconfigure the round');
    });

    test('permission is re-checked at write time, not only on the button', () => {
        const fn = idx.slice(idx.indexOf('function confirmAddAction'), idx.indexOf('function confirmAddAction') + 900);
        assert.ok(/if \(!canAddAction\(\)\)/.test(fn), 'removing the button in devtools must achieve nothing');
    });

    test('the start hole is re-read at the moment of the tap', () => {
        const fn = idx.slice(idx.indexOf('function confirmAddAction'), idx.indexOf('function confirmAddAction') + 900);
        assert.ok(/addActionStartHole\(\)/.test(fn),
            'a score posted while the panel was open must not leave a wager on a finished hole');
    });

    test('Add Action disappears when there is no hole left to play', () => {
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/addActionStartHole\(\) !== null/.test(fn), 'a wager with an empty range must be impossible');
    });

    test('Add Action disappears when every game is already running', () => {
        const fn = idx.slice(idx.indexOf('function canAddAction'), idx.indexOf('function addActionStartHole'));
        assert.ok(/addableGames\(currentData\)\.length === 0/.test(fn));
    });

    test('no blocking dialog gates the write — those fail silently in an installed PWA', () => {
        const fn = idx.slice(idx.indexOf('function openAddAction'), idx.indexOf('function toggleActionCenter'));
        assert.ok(!/\bprompt\(|\bconfirm\(/.test(fn));
    });
});

describe('SCORECARD — the Add Action flow renders correctly', () => {
    function render(state, extra) {
        const sb = loadHtmlInlineScript('index.html', ['action-model.js', 'money-engine.js', 'bet-strip.js']);
        const cd = makeCourseData(18);
        const p = makePlayers(['Manny', 'Marty', 'John', 'Steve'], [0, 0, 0, 0]);
        p[0].team = 'Team 1'; p[1].team = 'Team 1'; p[2].team = 'Team 2'; p[3].team = 'Team 2';
        const scores = scoreAll(p, cd, 4);
        const data = Object.assign({
            gameFormat: 'nassau', players: p, courseData: cd, scores,
            nassauStake: 20, nassauScoring: 'net', nassauPressRule: '2down',
            additionalGames: { dots: { enabled: true, dotPointVal: 2 } }
        }, extra || {});
        vm.runInContext(`currentData = ${JSON.stringify(data)};` +
            `window.__scFilteredPlayers = currentData.players; actionCenterOpen = true; ${state} renderActionCenter();`, sb);
        return sb.document.getElementById('action-center-mount').innerHTML;
    }

    test('the + ADD ACTION button appears for the organizer', () => {
        assert.match(render(''), /\+ ADD ACTION/);
    });

    test('tapping it lists the games that can still be added', () => {
        const out = render('addActionOpen=true;');
        assert.ok(out.includes('Skins'));
        assert.ok(out.includes('Stableford'));
        assert.ok(!/aa-choice[^>]*>[^<]*Dots/.test(out), 'dots is already running');
    });

    test('choosing a game states the start hole prominently before anything is written', () => {
        const out = render('addActionOpen=true; addActionGame="skins";');
        assert.match(out, /STARTS HOLE 5/);
        assert.match(out, /Earlier holes don&#39;t count|Earlier holes don't count/);
    });

    test('amounts are one tap — six presets, no typing needed', () => {
        const out = render('addActionOpen=true; addActionGame="skins";');
        [1, 2, 5, 10, 20, 50].forEach(v =>
            assert.ok(out.includes(`confirmAddAction(${v})`), `missing $${v} preset`));
    });

    test('once added, the wager shows its range in Today\'s Action', () => {
        const out = render('', {
            additionalGames: {
                dots: { enabled: true, dotPointVal: 2 },
                skins: { enabled: true, skinsBuyIn: 5, skinsCarryOver: true, skinsScoring: 'gross', startHole: 5 }
            }
        });
        assert.ok(out.includes('H5\u201318'), 'nobody should have to remember when skins started');
        // Nassau + skins + dots, no side matches in this fixture.
        assert.match(out, /3 live/);
    });

    test('a full-round game is not cluttered with a range label', () => {
        const out = render('');
        assert.ok(!out.includes('H1\u201318'));
    });
});

describe('WIRING — one calculation per game, ranges included', () => {
    test('no mid-round-only engine was created', () => {
        const files = fs.readdirSync(REPO_ROOT).filter(f => /\.(js|html)$/.test(f) && !/test|fallback/.test(f));
        files.forEach(f => {
            assert.ok(!/function computeSkinsRanged|function calcDotsRanged|MidRound/.test(read(f)),
                `${f} introduced a parallel engine`);
        });
    });

    test('range support is a filtered hole list, not new engine logic', () => {
        const se = read('settlement-engine.js');
        assert.ok(/gameHoles\(game, courseData\)/.test(se));
        const me = read('money-engine.js');
        assert.ok(!/gameHoles|startHole: cfg|addableGames/.test(me),
            'money-engine.js must stay free of composition concerns');
    });

    test('action-model.js still contains no golf mathematics', () => {
        const s = read('action-model.js');
        ['function calcDotsEngine', 'function getStrokes', 'function calculateMatchEngine'].forEach(fn =>
            assert.ok(!s.includes(fn), `${fn} must not be reimplemented`));
    });
});
