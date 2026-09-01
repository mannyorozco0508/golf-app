// ============================================================================
// MULTI-GROUP ACTION MODEL
//
// In a one-group round, a main-format wager is unambiguous: the four golfers
// standing together are the wager. In a multi-group round it is not.
//
// Best Ball or Ryder Cup with 8 golfers across 2 groups pays EVERY golfer in the
// field out of one stake, splitting them by p.team - so Marty in Group 1 is
// partnered with Stan in Group 2 against golfers neither of them is playing with.
// Nobody sets that up deliberately.
//
// The rule: one group keeps the fast setup shortcut. Two or more groups set up the
// ROUND in setup and create every wager explicitly from Action, where the golfer
// names the participants.
//
// Round TYPE is untouched - Best Ball still builds teams and the scorecard. Only
// the implicit money attached to it goes away, and only for NEW rounds.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADM = read('admin.html');

const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

function field(n, groups) {
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James', 'Jose', 'Ryan', 'Dave', 'Rocco'];
    // Real, uneven handicaps. An evenly-spaced ladder makes the teams tie, which would
    // make these tests pass for the wrong reason.
    const hcps = ['8', '4', '15', '0', '6', '12', '20', '1', '9', '3', '17', '11'];
    const P = makePlayers(names.slice(0, n), hcps.slice(0, n));
    P.forEach((p, i) => {
        p.playingForMoney = true;
        p.group = groups > 1 ? Math.floor(i / (n / groups)) + 1 : 1;
        p.team = i % 2 === 0 ? 'Team 1' : 'Team 2';
    });
    const S = {};
    CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 4 === 0 ? -1 : pi % 3); }));
    return { P, S, id: k => String(P[k].id) };
}

// ---------------------------------------------------------------------------
describe('GROUP COUNT comes from the real group model', () => {
    test('it uses computeGroupSizes, not a player-count guess', () => {
        const fn = ADM.slice(ADM.indexOf('function currentGroupCount'), ADM.indexOf('function multiGroupMoneySuppressed'));
        assert.ok(/computeGroupSizes\(n, groupSizeOverrides\)/.test(fn),
            'group count must come from the same model the rest of the app uses');
        assert.ok(!/players\.length > 4/.test(fn), 'a player-count proxy is not a group count');
    });

    test('the organizer\u2019s own group sizes decide it', () => {
        // Six golfers deliberately kept together is ONE group and keeps the shortcut;
        // six split 4+2 is two groups and does not.
        const sizes = (n, ov) => {
            const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
            vm.runInContext(`window.__s = computeGroupSizes(${n}, ${J(ov)}).length;`, sb);
            return sb.window.__s;
        };
        assert.equal(sizes(4, {}), 1);
        assert.equal(sizes(8, {}), 2);
        assert.equal(sizes(12, {}), 3);
        assert.equal(sizes(6, { 0: 6 }), 1, 'one group of six is still one group');
        assert.equal(sizes(6, {}), 2, 'six defaults to 4 + 2');
    });
});

// ---------------------------------------------------------------------------
describe('THE PROBLEM THIS FIXES — an implicit field-wide wager', () => {
    const { P, S } = field(8, 2);

    test('a team format across two groups really does pay the whole field', () => {
        // This is the behaviour being removed from NEW rounds. Documented as a fact,
        // not a bug in the engine: the maths is right, the setup was ambiguous.
        ['bestball', 'ryder'].forEach(fmt => {
            const d = { gameFormat: fmt, matchStake: 50, matchScoring: 'net', matchPressRule: 'none', players: P, courseData: CD, scores: S };
            const net = call(`
                var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(S)});
                var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
                return n;`);
            const paid = Object.keys(net).filter(k => net[k] !== 0);
            assert.equal(paid.length, 8, `${fmt} pays every golfer in the field from one stake`);
        });
    });

    test('with no stake, the same round type creates NO money', () => {
        ['bestball', 'ryder', 'scramble'].forEach(fmt => {
            const d = { gameFormat: fmt, matchStake: 0, matchScoring: 'net', matchPressRule: 'none', players: P, courseData: CD, scores: S };
            const rows = call(`
                var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(S)});
                return Object.keys(o.netByName).length;`);
            assert.equal(rows, 0, `${fmt} with no stake must be pure scoring`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE RULE', () => {
    test('one group keeps the setup shortcut', () => {
        const fn = ADM.slice(ADM.indexOf('function multiGroupMoneySuppressed'), ADM.indexOf('function computeGroupBoundaries'));
        assert.ok(/currentGroupCount\(\) >= 2/.test(fn), 'only two or more groups are affected');
    });

    test('two or more groups save no main-game stake', () => {
        assert.ok(/if \(multiGroupMoneySuppressed\(\)\) matchStake = 0;/.test(ADM),
            'a new multi-group round must not store an implicit field-wide wager');
    });

    test('the stake control is hidden and explained rather than silently ignored', () => {
        assert.ok(/id="multigroup-action-note"/.test(ADM));
        assert.ok(/You'll add each bet from <strong>Action<\/strong>/.test(ADM),
            'the organizer must be told where the betting went');
        assert.ok(/\(wantsMatchMoney && !suppress\)/.test(ADM), 'the stake box follows the rule');
    });

    test('it re-evaluates as golfers are added', () => {
        // A 5th golfer turns one group into two.
        assert.ok(/function refreshMultiGroupMoneyRule/.test(ADM));
        assert.ok(/refreshMultiGroupMoneyRule\(\);/.test(ADM));
    });
});

// ---------------------------------------------------------------------------
describe('STRUCTURAL ROUND TYPES ARE PRESERVED', () => {
    test('every team format is still offered in a multi-group round', () => {
        const visible = ADM.slice(ADM.indexOf('id="game-format-select"'), ADM.indexOf('legacy-format-group'));
        ['stroke', 'stableford', 'bestball', 'scramble', 'ryder', 'hilo', 'wolf'].forEach(f =>
            assert.ok(visible.includes(`value="${f}"`),
                `${f} decides teams or the scorecard and must stay available`));
    });

    test('team assignment still happens at player entry', () => {
        assert.ok(/const teamSize = \(format === 'scramble'\)/.test(ADM),
            'round type must still drive team size');
    });

    test('a multi-group Best Ball round still scores as Best Ball', () => {
        const { P, S } = field(8, 2);
        const board = call(`
            var g = getRoundGames({ gameFormat: 'bestball', matchStake: 0, players: ${J(P)}, courseData: ${J(CD)}, scores: ${J(S)} });
            return { games: g.length, format: g[0].format };`);
        assert.equal(board.format, 'bestball', 'the round type survives');
        assert.equal(board.games, 1);
    });
});

// ---------------------------------------------------------------------------
describe('LEGACY MULTI-GROUP ROUNDS ARE UNTOUCHED', () => {
    test('a saved round carrying a stake sets the legacy flag before anything re-renders', () => {
        assert.ok(/loadedLegacyMainStake = \(parseFloat\(data\.matchStake\) \|\| 0\) > 0/.test(ADM));
        ['nassauStake', 'skinsBuyIn', 'dotPointVal'].forEach(f =>
            assert.ok(new RegExp(`data\\.${f}`).test(ADM), `${f} must also count as legacy money`));
    });

    test('the suppression rule stands down for a legacy round', () => {
        const fn = ADM.slice(ADM.indexOf('function multiGroupMoneySuppressed'), ADM.indexOf('function computeGroupBoundaries'));
        assert.ok(/!loadedLegacyMainStake/.test(fn),
            'editing an old round must never quietly zero its wager');
    });

    test('legacy money still settles exactly as before', () => {
        const { P, S } = field(8, 2);
        [
            { gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'none' },
            { gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none' },
            { gameFormat: 'bestball', matchStake: 50, matchScoring: 'net', matchPressRule: 'none' }
        ].forEach(cfg => {
            const d = Object.assign({ players: P, courseData: CD, scores: S }, cfg);
            const out = call(`
                var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(S)});
                var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
                return { total: t, rows: Object.keys(o.netByName).length };`);
            assert.equal(out.total, 0, `${cfg.gameFormat} must stay zero-sum`);
            assert.ok(out.rows > 0, `${cfg.gameFormat} must still pay somebody`);
        });
    });

    test('the legacy format options are still reachable when editing', () => {
        assert.ok(/function revealLegacyFormatOption/.test(ADM));
        assert.ok(/revealLegacyFormatOption\(data\.gameFormat\)/.test(ADM));
    });
});

// ---------------------------------------------------------------------------
describe('MULTI-GROUP ACTION — every wager is explicit', () => {
    const { P, S, id } = field(8, 2);
    // Exactly the round the acceptance scenario describes: no main money at all.
    const data = {
        gameFormat: 'stroke', players: P, courseData: CD, scores: S,
        additionalGameInstances: {
            k1: { format: 'skins', enabled: true, startHole: 1, createdAt: 5, skinsBuyIn: 10, skinsPotFormat: 'net', skinsScoring: 'net', skinsCarryOver: true, participantIds: [id(0), id(1), id(2)] }
        },
        sideMatches: {
            s1: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(1)], startHole: 1, createdAt: 1 },
            s2: { format: 'stroke', scoring: 'net', teamAIds: [id(0)], teamBIds: [id(2)], overallStake: 20, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 2 },
            s3: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [id(0), id(3)], teamBIds: [id(1), id(2)], startHole: 1, createdAt: 3 },
            s4: { format: 'stroke', scoring: 'gross', teamAIds: [id(0)], teamBIds: [id(4)], overallStake: 100, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 6, createdAt: 4 }
        }
    };

    test('there is NO main wager hiding in the round', () => {
        const main = call(`return getRoundGames(${J(data)}).filter(function(g){ return g.role === 'main' && g.stake > 0; }).length;`);
        assert.equal(main, 0, 'a new multi-group round carries no implicit main money');
    });

    test('all five wagers appear on the Action page', () => {
        const sb = loadHtmlInlineScript('sidematches.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
        vm.runInContext(`currentData = ${J(data)}; renderSideMatches();
            window.__h = document.getElementById('sidematches-list').innerHTML;`, sb);
        const h = sb.window.__h;
        assert.equal((h.match(/Remove Match/g) || []).length, 4, 'four side matches');
        assert.ok(/data-action-key="k1"/.test(h), 'and the scoped skins game');
        assert.ok(!/data-action-key="main"/.test(h), 'with no phantom main wager');
    });

    test('a cross-group wager keeps its start hole', () => {
        const holes = call(`
            return sideMatchHoles(${J(data.sideMatches.s4)}, ${J(CD)}).map(function(h){ return h.hole; })[0];`);
        assert.equal(holes, 6, 'holes 1-5 stay outside the bet');
    });

    test('everything settles, zero-sum, and reconciles', () => {
        const out = call(`
            var o = computeCombinedNetTotals(${J(data)}, ${J(CD)}, ${J(S)});
            var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
            var owed = 0; o.transactions.forEach(function(t){ owed += t.amount; });
            var won = 0; Object.keys(n).forEach(function(k){ if (n[k] > 0) won += n[k]; });
            return { net: n, owed: owed, won: won, recs: buildSideMatchReceipts(${J(data)}, ${J(CD)}, ${J(S)}).length };`);
        assert.equal(Object.values(out.net).reduce((a, b) => a + b, 0), 0);
        assert.equal(out.owed, out.won, 'Who Pays Who must reconcile');
        assert.equal(out.recs, 4, 'every side match on the Receipt');
    });

    test('THREE groups behave the same way', () => {
        const f3 = field(12, 3);
        const d3 = {
            gameFormat: 'stroke', players: f3.P, courseData: CD, scores: f3.S,
            additionalGameInstances: {
                a: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: true, startHole: 1, createdAt: 1, participantIds: [f3.id(0), f3.id(5), f3.id(9)] }
            },
            sideMatches: {
                x: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [f3.id(0)], teamBIds: [f3.id(1)], startHole: 1, createdAt: 1 },
                y: { format: 'stroke', scoring: 'gross', teamAIds: [f3.id(4)], teamBIds: [f3.id(8)], overallStake: 100, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 2 }
            }
        };
        const out = call(`
            var o = computeCombinedNetTotals(${J(d3)}, ${J(CD)}, ${J(f3.S)});
            var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
            return { total: t, main: getRoundGames(${J(d3)}).filter(function(g){ return g.role === 'main' && g.stake > 0; }).length };`);
        assert.equal(out.total, 0);
        assert.equal(out.main, 0, 'no wager may be inferred just because groups exist');
    });

    test('a NO-BET multi-group round is clean', () => {
        const out = call(`
            var D = { gameFormat: 'stroke', players: ${J(P)}, courseData: ${J(CD)}, scores: ${J(S)} };
            var o = computeCombinedNetTotals(D, ${J(CD)}, ${J(S)});
            return { rows: Object.keys(o.netByName).length, tx: o.transactions.length, games: getRoundGames(D).length };`);
        assert.equal(out.rows, 0, 'no $0 settlement noise');
        assert.equal(out.tx, 0);
        assert.equal(out.games, 1, 'just the round itself');
    });
});

// ---------------------------------------------------------------------------
describe('ONE-GROUP NON-REGRESSION', () => {
    const { P, S, id } = field(4, 1);

    test('a foursome can still set a main wager in setup', () => {
        const d = {
            gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none',
            players: P, courseData: CD, scores: S,
            additionalGameInstances: { k: { format: 'skins', enabled: true, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: true, startHole: 1, createdAt: 1 } },
            sideMatches: { s: { format: 'stroke', scoring: 'net', teamAIds: [id(0)], teamBIds: [id(2)], overallStake: 50, overallMode: 'stroke', segment: 'full', tieRule: 'carry', startHole: 1, createdAt: 1 } }
        };
        const out = call(`
            var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(S)});
            var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
            return { total: t, main: getRoundGames(${J(d)}).filter(function(g){ return g.role === 'main' && g.stake > 0; }).length,
                     rows: Object.keys(o.netByName).length };`);
        assert.equal(out.main, 1, 'the one-group shortcut must survive');
        assert.equal(out.total, 0);
        assert.ok(out.rows > 0, 'and still pay out');
    });

    test('the one-group main wager is visible on Action, read-only', () => {
        const sb = loadHtmlInlineScript('sidematches.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
        vm.runInContext(`currentData = ${J({ gameFormat: 'nassau', nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none', players: P, courseData: CD, scores: S })};
            renderSideMatches(); window.__h = document.getElementById('sidematches-list').innerHTML;`, sb);
        assert.ok(/data-action-key="main"/.test(sb.window.__h));
        assert.ok(/Created with the round/.test(sb.window.__h));
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED MATH', () => {
    test('no engine was touched', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/multiGroupMoneySuppressed|currentGroupCount|loadedLegacyMainStake/.test(src),
                `${f} gained setup logic`);
        });
    });

    test('the group model itself was not redefined', () => {
        // The rule moved to grouping.js in the shared-core wave, so this reads the
        // canonical module rather than admin.html's former copy. The point of the
        // assertion is unchanged and still worth making: foursomes are the default,
        // and a round that quietly started grouping in threes would move golfers
        // between scorekeeper links.
        const fn = read('grouping.js');
        assert.ok(/Math\.min\(4, remaining\)/.test(fn), 'default group size must remain 4');
        assert.ok(!/function computeGroupSizes\s*\(/.test(
            ADM.replace(/<script src=[^>]*><\/script>/g, '')),
            'admin.html must consume the shared module, not its own copy');
    });
});
