const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

// Three groups, three matches spanning them:
//   Group 1: Marty, Jose   Group 2: Steve, John   Group 3: Ryan, Bo
//   A: Marty vs John            (G1 + G2)
//   B: Steve vs Ryan            (G2 + G3)
//   C: Marty/Jose vs Steve/John (G1 + G2)
function fixture() {
    const cd = makeCourseData(18);
    const names = ['Marty', 'Jose', 'Steve', 'John', 'Ryan', 'Bo'];
    const p = makePlayers(names, names.map(() => 0));
    const groupMap = {};
    p.forEach((pl, i) => { groupMap[pl.id] = i < 2 ? 1 : (i < 4 ? 2 : 3); });
    const scores = {};
    cd.slice(0, 6).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
    const mk = (a, b, stake) => ({
        format: 'stroke', scoring: 'gross', overallStake: stake, holeStake: 0,
        tieRule: 'push', overallMode: 'stroke', segment: 'full',
        teamAIds: a.map(x => String(x.id)), teamBIds: b.map(x => String(x.id)), overallPresses: {}
    });
    const data = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        sideMatches: {
            A: mk([p[0]], [p[3]], 50),
            B: mk([p[2]], [p[4]], 50),
            C: mk([p[0], p[1]], [p[2], p[3]], 100)
        }
    };
    return { cd, p, groupMap, scores, data };
}

// Boots the page in a given context with a stubbed Firebase that records every write
// that would actually reach the database.
function boot(group, meId) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const { p, groupMap, data } = fixture();
    const scoped = group === null ? 'currentData.players'
        : `currentData.players.filter(function (pl) { return window.__scPlayerGroupMap[pl.id] === ${group}; })`;
    vm.runInContext(`
        window.__writes = [];
        db.ref = function (p) { return {
            set: function (v) { window.__writes.push({ path: p, v: v }); return Promise.resolve(); },
            remove: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); },
            push: function () { return { key: 'k1', set: function (v) {
                window.__writes.push({ path: p + '/k1', v: v }); return Promise.resolve(); } }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        window.__scFilteredPlayers = ${scoped};
        hasGroupLock = ${group !== null};
        lockedGroup = ${group === null ? 'null' : group};
        ${meId ? `meId = '${meId}';` : ''}
    `, sb);
    return { sb, p };
}

// THE test that matters: call the write function directly, the way devtools would,
// and count writes that actually reached Firebase. Hiding a button is not a defence.
function directPress(sb, key) {
    vm.runInContext(`window.__writes = []; confirmSidePress('${key}', 100);`, sb);
    return sb.window.__writes.filter(w => /sideMatches/.test(w.path)).length > 0;
}

describe('PRESS PERMISSION — the matrix, proven by direct writes', () => {
    const MATRIX = [
        ['Group 1 scorekeeper', 1, null, { A: true, B: false, C: true }],
        ['Group 2 scorekeeper', 2, null, { A: true, B: true, C: true }],
        ['Group 3 scorekeeper', 3, null, { A: false, B: true, C: false }],
        ['Bare / spectator link', null, null, { A: false, B: false, C: false }],
        ['Spectator with ?me=Marty', null, 'ME', { A: false, B: false, C: false }]
    ];

    MATRIX.forEach(([label, group, me, expected]) => {
        ['A', 'B', 'C'].forEach(key => {
            test(`${label} \u2192 match ${key}: ${expected[key] ? 'allowed' : 'BLOCKED'}`, () => {
                const { sb, p } = boot(group, me === 'ME' ? p0Id() : null);
                assert.equal(directPress(sb, key), expected[key],
                    `${label} should ${expected[key] ? 'be able to' : 'NOT be able to'} press ${key}`);
            });
        });
    });

    function p0Id() { return fixture().p[0].id; }

    test('REGRESSION: a spectator can no longer press ANY match', () => {
        // canPressSideMatch() used to be a literal `return true`. The only thing producing
        // correct-looking behaviour was an accident of scoping, and a bare link - which is
        // exactly what a spectator holds - could press every match in the round.
        const { sb } = boot(null, null);
        ['A', 'B', 'C'].forEach(k =>
            assert.equal(directPress(sb, k), false, `spectator pressed ${k}`));
    });

    test('REGRESSION: a group cannot press a match between two OTHER groups', () => {
        const { sb } = boot(1, null);
        assert.equal(directPress(sb, 'B'), false, 'Group 1 pressed Steve vs Ryan');
    });

    test('a group CAN press a match containing one of its own players', () => {
        assert.equal(directPress(boot(1, null).sb, 'A'), true);
        assert.equal(directPress(boot(3, null).sb, 'B'), true);
    });

    test('a 2v2 match is pressable by every group with a player in it', () => {
        assert.equal(directPress(boot(1, null).sb, 'C'), true);
        assert.equal(directPress(boot(2, null).sb, 'C'), true);
        assert.equal(directPress(boot(3, null).sb, 'C'), false, 'Group 3 has nobody in C');
    });
});

describe('PRESS PERMISSION — identity grants nothing', () => {
    test('REGRESSION: ?me= does not turn a spectator into a presser', () => {
        const { p } = fixture();
        const withMe = boot(null, p[0].id);
        const without = boot(null, null);
        ['A', 'B', 'C'].forEach(k => {
            assert.equal(directPress(withMe.sb, k), false, `?me= granted a press on ${k}`);
            assert.equal(directPress(without.sb, k), directPress(withMe.sb, k),
                'identity changed a permission');
        });
    });

    test('?me= does not widen a group scorekeeper either', () => {
        const { p } = fixture();
        // Marty is Group 1. Claiming to be Ryan (Group 3) must not unlock match B.
        const sb = boot(1, p[4].id).sb;
        assert.equal(directPress(sb, 'B'), false);
    });

    test('the permission function never reads identity', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function canPressSideMatch'), idx.indexOf('function sideMatchById'));
        assert.ok(!/meId|resolvedMeId/.test(fn), 'identity must never appear in a permission check');
    });
});

describe('PRESS PERMISSION — enforced at every layer', () => {
    const idx = read('index.html');

    test('the visible button is gated on the stored match', () => {
        const fn = idx.slice(idx.indexOf('const sideRow = sm =>'), idx.indexOf('const row = r =>'));
        assert.ok(/canPressSideMatch\(sideMatchById\(sm\.key\)\)/.test(fn));
    });

    test('opening the press panel is gated too', () => {
        const fn = idx.slice(idx.indexOf('function openSidePress'), idx.indexOf('function closeSidePress'));
        assert.ok(/if \(!canPressSideMatch\(sideMatchById\(key\)\)\) return;/.test(fn));
    });

    test('the WRITE is gated independently of the button', () => {
        const fn = idx.slice(idx.indexOf('function confirmSidePress'), idx.indexOf('function toggleActionCenter'));
        assert.ok(/if \(!canPressSideMatch\(sideMatchById\(key\)\)\)/.test(fn));
        const gate = fn.indexOf('canPressSideMatch');
        const write = fn.indexOf('db.ref');
        assert.ok(gate < write, 'the check must run before the write');
    });

    test('permission is checked against the STORED match, not the rendered row', () => {
        // Reading the on-screen row would make the rule depend on what happened to be
        // displayed, which is how the old accidental behaviour arose.
        const fn = idx.slice(idx.indexOf('function sideMatchById'), idx.indexOf('function sideMatchById') + 220);
        assert.ok(/currentData\.sideMatches/.test(fn));
    });

    test('no bare canPressSideMatch() call survives anywhere', () => {
        assert.equal(idx.split('canPressSideMatch()').length - 1, 0);
    });
});

describe('ORGANIZER — and the multi-group ambiguity, stated', () => {
    test('on a single-group round the bare link can press', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Jose', 'Steve', 'John'], [0, 0, 0, 0]);
        vm.runInContext(`currentData = ${JSON.stringify({
            gameFormat: 'stroke', players: p, courseData: cd, scores: {},
            sideMatches: { A: { teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)] } }
        })}; hasGroupLock = false; lockedGroup = null;`, sb);
        assert.equal(vm.runInContext(`canPressSideMatch(sideMatchById('A'))`, sb), true);
    });

    test('DOCUMENTED: on a multi-group round the bare link cannot press', () => {
        // The organizer and a spectator hold the SAME URL on a multi-group round - there
        // is no way to tell them apart without accounts. Granting presses there would
        // hand the same power to everyone with the share link, so the app keeps the rule
        // it already applies to score entry: a bare link on a multi-group round is
        // read-only, and the organizer opens a group link like anyone else.
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const names = ['Marty', 'Jose', 'Steve', 'John', 'Ryan', 'Bo'];
        const p = makePlayers(names, names.map(() => 0));
        vm.runInContext(`currentData = ${JSON.stringify({
            gameFormat: 'stroke', players: p, courseData: cd, scores: {},
            sideMatches: { A: { teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)] } }
        })}; hasGroupLock = false; lockedGroup = null;`, sb);
        assert.equal(vm.runInContext(`canPressSideMatch(sideMatchById('A'))`, sb), false);
    });
});

describe('GROUP SCORE ISOLATION — unchanged by this work', () => {
    function scoreBoot(group) {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const { p, groupMap, data } = fixture();
        vm.runInContext(`
            window.__writes = [];
            db.ref = function (p) { return {
                set: function (v) { window.__writes.push({ path: p }); return Promise.resolve(); },
                remove: function () { return Promise.resolve(); },
                update: function () { return Promise.resolve(); },
                push: function () { return { key: 'k', set: function () { return Promise.resolve(); } }; },
                on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
            }; };
            currentMode = 'ABCD';
            currentData = ${JSON.stringify(data)};
            window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
            hasGroupLock = true; lockedGroup = ${group};
        `, sb);
        return { sb, p };
    }
    const scoreWrites = (sb, playerId) => {
        vm.runInContext(`window.__writes = []; saveScore('${playerId}', 5, 4);`, sb);
        return sb.window.__writes.filter(w => /\/scores\//.test(w.path)).length;
    };

    test('a scorekeeper can still score their own group', () => {
        const { sb, p } = scoreBoot(1);
        assert.equal(scoreWrites(sb, p[0].id), 1);
    });

    test('REGRESSION: a scorekeeper still cannot score another group', () => {
        const { sb, p } = scoreBoot(1);
        assert.equal(scoreWrites(sb, p[3].id), 0);
    });

    test('the score guard is independent of the press rule', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function canWritePlayer'), idx.indexOf('function rejectCrossGroupWrite'));
        assert.ok(!/canPressSideMatch/.test(fn), 'scoring must not depend on press permission');
        assert.ok(!/meId/.test(fn));
    });
});

// ---------------------------------------------------------------------------
describe('2v2 MONEY WORDING — a team total is not a personal one', () => {
    const BS = (() => {
        const sb = loadJsFile('action-model.js');
        ['money-engine.js', 'settlement-engine.js', 'bet-strip.js']
            .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
        return sb;
    })();

    function matches() {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Jose', 'Manny', 'Ryan'], [0, 0, 0, 0]);
        const scores = {};
        cd.slice(0, 12).forEach(h => p.forEach((pl, pi) => {
            scores[`p${pl.id}_h${h.hole}`] = h.par + (pi < 2 ? 0 : 1);
        }));
        const base = {
            format: 'stroke', scoring: 'gross', holeStake: 0, tieRule: 'push',
            overallMode: 'stroke', segment: 'full'
        };
        const data = {
            players: p,
            sideMatches: {
                one: Object.assign({}, base, {
                    overallStake: 50, teamAIds: [String(p[0].id)], teamBIds: [String(p[2].id)],
                    overallPresses: { a: { startHole: 6, stake: 50 }, b: { startHole: 10, stake: 100 } }
                }),
                two: Object.assign({}, base, {
                    overallStake: 100,
                    teamAIds: [String(p[0].id), String(p[1].id)],
                    teamBIds: [String(p[2].id), String(p[3].id)],
                    overallPresses: { c: { startHole: 11, stake: 200 } }
                })
            }
        };
        return { cd, p, scores, data };
    }

    test('1v1 wording is unchanged — "$200 at stake"', () => {
        const { cd, p, scores, data } = matches();
        const row = BS.buildSideActionRows(data, cd, scores, p, p[0].id).find(r => !r.isTeam);
        assert.equal(row.netText, '$200 at stake');
    });

    test('REGRESSION: a 2v2 participant sees his OWN share first', () => {
        // "$300 at stake" was double what Marty personally risked. Settlement splits a
        // side's money evenly, so his exposure is $150.
        const { cd, p, scores, data } = matches();
        const row = BS.buildSideActionRows(data, cd, scores, p, p[0].id).find(r => r.isTeam);
        assert.equal(row.netText, '$150 your share \u00B7 $300 team');
    });

    test('a neutral viewer is never told "your share"', () => {
        const { cd, p, scores, data } = matches();
        const row = BS.buildSideActionRows(data, cd, scores, p, null).find(r => r.isTeam);
        assert.equal(row.netText, '$300 team action');
        assert.ok(!/your/.test(row.netText));
    });

    test('the share matches what settlement actually pays', () => {
        const settle = loadHtmlInlineScript('settlement.html',
            ['money-engine.js', 'action-model.js', 'settlement-engine.js']);
        const { cd, p, scores, data } = matches();
        const full = Object.assign({ gameFormat: 'stroke', courseData: cd, scores },
            { players: p, sideMatches: { two: data.sideMatches.two } });
        const done = {};
        cd.forEach(h => p.forEach((pl, pi) => { done[`p${pl.id}_h${h.hole}`] = h.par + (pi < 2 ? 0 : 1); }));
        const net = settle.computeCombinedNetTotals(Object.assign({}, full, { scores: done }), cd, done).netByName;
        assert.equal(net.marty.net, 150, 'the per-player figure the card promises');
        assert.equal(net.jose.net, 150);
    });

    test('a decided 2v2 also shows share and team', () => {
        const { cd, p } = matches();
        const done = {};
        cd.forEach(h => p.forEach((pl, pi) => { done[`p${pl.id}_h${h.hole}`] = h.par + (pi < 2 ? 0 : 1); }));
        const data = {
            players: p,
            sideMatches: {
                two: {
                    format: 'stroke', scoring: 'gross', overallStake: 100, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id), String(p[1].id)],
                    teamBIds: [String(p[2].id), String(p[3].id)], overallPresses: {}
                }
            }
        };
        const mine = BS.buildSideActionRows(data, cd, done, p, p[0].id)[0];
        const theirs = BS.buildSideActionRows(data, cd, done, p, p[2].id)[0];
        assert.match(mine.netText, /up \$50 \u00B7 \$100 team/);
        assert.match(theirs.netText, /down \$50 \u00B7 \$100 team/);
    });

    test('the wording is DISPLAY only — settlement math is untouched', () => {
        const bs = read('bet-strip.js');
        const fn = bs.slice(bs.indexOf('function sideMoneyText'), bs.indexOf('function fmtMoney'));
        assert.ok(!/db\.ref|computeCombined/.test(fn));
        ['money-engine.js', 'settlement-engine.js'].forEach(f =>
            assert.ok(!/sideMoneyText/.test(read(f)), `${f} was touched`));
    });
});

describe('PHONE COPY', () => {
    test('the collapsed line says "Thru", not "Through Hole"', () => {
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'John'], [0, 0]);
        const scores = {};
        cd.slice(0, 10).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
        const BSsb = loadJsFile('action-model.js');
        ['money-engine.js', 'settlement-engine.js', 'bet-strip.js']
            .forEach(f => vm.runInContext(read(f), BSsb, { filename: f }));
        const data = {
            players: p, sideMatches: {
                m: {
                    format: 'stroke', scoring: 'gross', overallStake: 50, holeStake: 0,
                    tieRule: 'push', overallMode: 'stroke', segment: 'full',
                    teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)], overallPresses: {}
                }
            }
        };
        const row = BSsb.buildSideActionRows(data, cd, scores, p, p[0].id)[0];
        assert.equal(row.thruShort, 'Thru 10');
        assert.equal(row.thruText, 'Through Hole 10', 'the long form stays available');
    });

    test('the collapsed card renders the short form', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('const sideRow = sm =>'), idx.indexOf('const row = r =>'));
        assert.ok(/sm\.thruShort/.test(fn));
    });

    test('the long redundant footer is gone', () => {
        const idx = read('index.html');
        assert.ok(!/Nothing is settled until the round is done/.test(idx));
        assert.ok(/Nothing here is settled yet/.test(idx));
    });
});
