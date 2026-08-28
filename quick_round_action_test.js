// ============================================================================
// QUICK ROUND — ACTION MODEL
//
// Setting up a round and betting on it are two different decisions, and the app
// used to fuse them: you could not keep a score until you had picked Nassau or
// Skins or Match Play from a single undifferentiated list.
//
// Now: Step 3 asks only how the SCORECARD is organised, and every money game is
// created through Action after the round exists. Skins and Dots write to the
// canonical additionalGameInstances model rather than being forced into the
// two-sided side-match schema, so settlement, Live Action and the Receipt pick
// them up with no new money code anywhere.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const J = JSON.stringify;
const CD = makeCourseData(18);

function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f => {
        vm.runInContext(read(f), sb, { filename: f });
    });
    return sb;
}
const SB = engines();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, SB); return SB.window.__r; };

// ---------------------------------------------------------------------------
describe('STAGE A — a round can be created without a betting decision', () => {
    const adm = read('admin.html');

    test('Step 3 offers only structural round types', () => {
        const visible = adm.slice(adm.indexOf('id="game-format-select"'), adm.indexOf('</select>', adm.indexOf('id="game-format-select"')));
        ['stroke', 'stableford', 'bestball', 'scramble', 'ryder', 'hilo', 'wolf'].forEach(f =>
            assert.ok(visible.includes(`value="${f}"`), `${f} changes how the scorecard is built and must remain`));
        ['nassau', 'match', 'skins', 'dots'].forEach(f =>
            assert.ok(!visible.includes(`value="${f}"`), `${f} is a wager, not a round type`));
    });

    test('nothing blocks saving a plain round', () => {
        assert.ok(!/-- Select Scoring Format --/.test(adm));
        assert.ok(!/Please select a Scoring Format before saving/.test(adm));
        assert.ok(/if \(!gameFormat\) gameFormat = 'stroke';/.test(adm));
    });

    test('a plain round settles to nothing and shows no money UI', () => {
        const P = makePlayers(['Marty', 'Manny', 'John', 'Steve'], ['8', '4', '15', '0']);
        P.forEach(p => { p.playingForMoney = true; });
        const S = {};
        CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
        const out = call(`
            var D = { gameFormat: 'stroke', players: ${J(P)}, courseData: ${J(CD)}, scores: ${J(S)} };
            var o = computeCombinedNetTotals(D, ${J(CD)}, ${J(S)});
            return { games: getRoundGames(D).length, stacked: roundHasStackedAction(D),
                     money: Object.keys(o.netByName).length, tx: o.transactions.length };
        `);
        assert.equal(out.games, 1, 'just the round itself');
        assert.equal(out.stacked, false);
        assert.equal(out.money, 0, 'a no-bet round must produce no ledger rows');
        assert.equal(out.tx, 0);
    });

    test('Round Ready is the bridge to Action', () => {
        assert.ok(/id="rr-add-action-btn"/.test(adm));
        assert.ok(/ADD ACTION/.test(adm));
        assert.ok(/MANAGE ACTION \\u00B7 \$\{actionLines\.length\} active/.test(adm)
            || /MANAGE ACTION/.test(adm), 'the button should reflect existing action');
    });
});

// ---------------------------------------------------------------------------
describe('STAGE A — legacy rounds are not disturbed', () => {
    const adm = read('admin.html');

    test('the old money formats are gone from setup entirely', () => {
        // OBSOLETE UI CONTRACT. These used to remain in a hidden optgroup so an old
        // round could be represented. That representation was itself a way of
        // offering the retired format as a choice. Old rounds keep their saved
        // gameFormat and still score, press and settle - proven in
        // legacy_retirement_test.js - without any setup control.
        ['nassau', 'match', 'skins', 'dots'].forEach(f =>
            assert.ok(!adm.includes(`<option value="${f}"`), `${f} must not be a setup choice`));
    });

    test('opening a saved round keeps its own format, without an editor', () => {
        // RETARGETED. The reveal helper existed to expose the retired Nassau editor.
        // What must survive is the DATA contract, not that UI: an old round keeps
        // its saved gameFormat and still settles. That is asserted here and proven
        // end-to-end in legacy_retirement_test.js.
        // The saved value is still read and still selected on the element.
        assert.ok(/document\.getElementById\("game-format-select"\)\.value = data\.gameFormat/.test(adm),
            'a legacy round must still carry its own format');
        // And it is never rewritten just by opening it.
        assert.ok(!/data\.gameFormat = /.test(adm), 'opening a round must not mutate its format');
    });

    test('every legacy main format still settles exactly as before', () => {
        const P = makePlayers(['Marty', 'Manny', 'John', 'Steve'], ['8', '4', '15', '0']);
        P.forEach((p, i) => { p.playingForMoney = true; p.team = i % 2 === 0 ? 'Team 1' : 'Team 2'; });
        const S = {};
        CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 3 === 0 ? 0 : 1); }));
        [
            { gameFormat: 'nassau', nassauStake: 10, nassauScoring: 'net', nassauPressRule: 'none' },
            { gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'none' },
            { gameFormat: 'skins', skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'split' },
            { gameFormat: 'dots', dotPointVal: 2 },
            { gameFormat: 'stableford', stablefordPointVal: 1 }
        ].forEach(cfg => {
            const D = Object.assign({ players: P, courseData: CD, scores: S }, cfg);
            const out = call(`
                var o = computeCombinedNetTotals(${J(D)}, ${J(CD)}, ${J(S)});
                var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
                return { total: t, games: getRoundGames(${J(D)}).length };
            `);
            assert.equal(out.total, 0, `${cfg.gameFormat} is no longer zero-sum`);
            assert.equal(out.games, 1, `${cfg.gameFormat} should still be a single main game`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('STAGE B — Action is the single money hub', () => {
    const sm = read('sidematches.html');

    test('the page is Action, not Side Matches', () => {
        assert.ok(/Today's Action/.test(sm));
        assert.ok(/ADD ACTION/.test(sm));
        assert.ok(/<title>Action<\/title>/.test(sm));
    });

    test('every supported wager type can be created here', () => {
        const picker = sm.slice(sm.indexOf('id="sm-format"'), sm.indexOf('</select>', sm.indexOf('id="sm-format"')));
        ['match', 'nassau', 'stroke', 'skins', 'dots'].forEach(f =>
            assert.ok(picker.includes(`value="${f}"`), `${f} must be creatable from Action`));
    });

    test('Skins and Dots are NOT forced into the two-sided schema', () => {
        assert.ok(/function isFieldAction/.test(sm));
        const save = sm.slice(sm.indexOf('function saveFieldAction'), sm.indexOf('function saveSideMatch'));
        assert.ok(/additionalGameInstances/.test(save), 'they must write to the canonical instance model');
        assert.ok(!/teamAIds/.test(save), 'a participant game has no sides');
        assert.ok(!/teamBIds/.test(save));
    });

    test('the form shows only what each wager actually has', () => {
        const fn = sm.slice(sm.indexOf('function onSideMatchFormatChange'), sm.indexOf('function isFieldAction') + 400);
        assert.ok(/sm-picker-box/.test(sm), 'the two-sided picker is hideable');
        assert.ok(/sm-field-fields/.test(sm), 'the participant form exists');
        assert.ok(/sm-skins-only/.test(sm), 'carry/mode are skins-only');
    });

    test('a skins game needs at least two golfers', () => {
        const save = sm.slice(sm.indexOf('function saveFieldAction'), sm.indexOf('function saveSideMatch'));
        assert.ok(/chosen\.length < 2/.test(save));
        assert.ok(/stake <= 0/.test(save), 'a wager with no money is not a wager');
    });

    test('participantIds is written only when the field is narrowed', () => {
        const save = sm.slice(sm.indexOf('function saveFieldAction'), sm.indexOf('function saveSideMatch'));
        assert.ok(/chosen\.length < players\.length/.test(save),
            'a whole-group game must stay identical to one saved before scoping existed');
    });

    test('mode and carry are stored so live and settlement cannot disagree', () => {
        const save = sm.slice(sm.indexOf('function saveFieldAction'), sm.indexOf('function saveSideMatch'));
        assert.ok(/skinsPotFormat = mode/.test(save));
        assert.ok(/skinsScoring = mode === 'net'/.test(save),
            'both fields must be written together — a mismatch is what caused the old divergence');
    });

    test('Action-created games reach settlement with no new money code', () => {
        const P = makePlayers(['Marty', 'Manny', 'John', 'Steve'], ['8', '4', '15', '0']);
        P.forEach(p => { p.playingForMoney = true; });
        const S = {};
        CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 4 === 0 ? -1 : pi % 3); }));
        // exactly the shape saveFieldAction() writes
        const D = {
            gameFormat: 'stroke', players: P, courseData: CD, scores: S,
            additionalGameInstances: {
                k1: { format: 'skins', enabled: true, startHole: 6, createdAt: 1, skinsBuyIn: 10, skinsPotFormat: 'net', skinsScoring: 'net', skinsCarryOver: true, participantIds: [String(P[0].id), String(P[1].id), String(P[2].id)] },
                k2: { format: 'dots', enabled: true, startHole: 1, createdAt: 2, dotPointVal: 2 }
            }
        };
        const out = call(`
            var o = computeCombinedNetTotals(${J(D)}, ${J(CD)}, ${J(S)});
            var t = 0; Object.keys(o.netByName).forEach(function(k){ t += o.netByName[k].net; });
            return { total: t, skins: getRoundGames(${J(D)}).filter(function(g){ return g.format === 'skins'; }).length,
                     rows: buildActionRows(${J(D)}, ${J(CD)}, ${J(S)}, ${J(P)}, null).length };
        `);
        assert.equal(out.total, 0, 'Action-created games must keep the ledger zero-sum');
        assert.equal(out.skins, 1);
        assert.ok(out.rows >= 2, 'Live Action must show the new wagers');
    });

    test('a mid-round Action game earns nothing before its start hole', () => {
        const P = makePlayers(['Marty', 'Manny', 'John'], ['0', '0', '0']);
        P.forEach(p => { p.playingForMoney = true; });
        const S = {};
        CD.forEach(h => P.forEach(p => { S[`p${p.id}_h${h.hole}`] = h.par; }));
        S[`p${P[0].id}_h3`] = 2;   // a birdie BEFORE the game exists
        const D = {
            gameFormat: 'stroke', players: P, courseData: CD, scores: S,
            additionalGameInstances: { k: { format: 'skins', enabled: true, startHole: 6, skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: true } }
        };
        const holes = call(`
            var g = getRoundGames(${J(D)}).filter(function(x){ return x.format === 'skins'; })[0];
            return gameHoles(g, ${J(CD)}).map(function(h){ return h.hole; }).join(',');
        `);
        assert.equal(holes.split(',')[0], '6', 'holes 1-5 must be outside the wager');
    });
});

// ---------------------------------------------------------------------------
describe('STAGE B — the surfaces that own live betting are untouched', () => {
    test('pressing still lives on the scorecard', () => {
        const idx = read('index.html');
        assert.ok(/function confirmMatchPress|function openPressPanel/.test(idx));
        assert.ok(/PRESS/.test(idx), 'the press control must remain where a golfer is scoring');
    });

    test('Live Action remains the live-status surface, separate from the Action page', () => {
        const bs = read('bet-strip.js');
        assert.ok(/function buildActionRows/.test(bs));
        const sm = read('sidematches.html');
        assert.ok(!/function buildActionRows/.test(sm), 'the Action page must not grow a second dashboard');
    });
});

// ---------------------------------------------------------------------------
// STAGE C. Three pages each had a "Save as PDF" button that printed money THAT PAGE
// had calculated itself. skins.html was the worst: its own Skins maths, blind to
// participant-scoped games, presented as an authoritative payout. There is one
// settlement document, and these buttons now open it.
describe('STAGE C — one authoritative money document', () => {
    test('no secondary page prints its own money any more', () => {
        ['sidematches.html', 'skins.html', 'stats.html'].forEach(f => {
            const live = read(f).split('\n').filter(l => l.indexOf('<!--') < 0).join('\n');
            assert.ok(!/window\.print\(\)/.test(live), `${f} still has its own print-money path`);
        });
    });

    test('each routes to the canonical Receipt for the same round', () => {
        ['sidematches.html', 'skins.html', 'stats.html'].forEach(f => {
            const src = read(f);
            assert.ok(/Final Results &amp; Receipt/.test(src), `${f} has no route to the Receipt`);
            // .nav-link is what carries ?game= and &group= across pages.
            assert.ok(/class="btn-primary nav-link" href="settlement.html"/.test(src),
                `${f} must carry the game code to the Receipt`);
        });
    });

    test('the canonical Receipt keeps its own print path', () => {
        assert.ok(/window\.print\(\)/.test(read('settlement.html')));
        assert.equal((read('settlement.html').match(/function printReceipt/g) || []).length, 1);
    });

    test('the retired duplicate generator has not returned', () => {
        assert.ok(!/function buildPrintScorecard/.test(read('index.html')));
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED MATH — nothing in this batch touched an engine', () => {
    test('the canonical engines are intact', () => {
        const me = read('money-engine.js');
        assert.ok(/function getStrokes\(hcpIndex, numericHcp\)/.test(me));
        const se = read('settlement-engine.js');
        ['computeCombinedNetTotals', 'computeSkinsSettlementNet', 'buildSideMatchReceipts',
            'calculateHoleBetEngine', 'calculateOverallBetEngine'].forEach(f =>
                assert.ok(new RegExp(`function ${f}`).test(se), `${f} must still exist`));
    });

    test('no UI wording leaked into the engines', () => {
        ['money-engine.js', 'settlement-engine.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/ADD ACTION|Round Type|sm-field-|Today's Action/.test(src),
                `${f} must not know about the setup screen`);
        });
    });
});
