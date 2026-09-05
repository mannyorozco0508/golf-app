// ============================================================================
// RETIRING THE LEGACY NASSAU EDITOR — UI ONLY
//
// There were two Nassau products: the modern three-stake wager, and the old
// single-stake round format with its own Step 4 editor. A golfer could reach
// either, and during device QA reached the wrong one - which made the modern
// implementation look broken when it was not.
//
// The old EDITOR goes. The old DATA stays readable.
//
// WHAT IS DELIBERATELY NOT DELETED, and why:
//
//   nassauStakeConfig()       already adapts a legacy round into three stakes.
//                             The "adapter" this retirement needs exists.
//   legacyMainAsSideMatch()   shared with match/bestball/scramble/ryder. Removing
//                             the Nassau branch means touching four other games.
//   legacyMainGameBlocksNassau()  stops a legacy round ALSO carrying a modern
//                             Nassau - the $80-on-a-$40-bet double bill. Old
//                             rounds still exist, so the hazard still exists.
//
// Legacy and adapted money were measured equal before any deletion:
//     legacy $10 Nassau           Marty $20 / Manny -$20, 1 receipt
//     adapted F10/B10/O10 modern  Marty $20 / Manny -$20, 1 receipt
// Deleting the legacy money branches would swap correct code for identical
// code, so this batch is admin.html only.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const adm = () => read('admin.html');
const DEPS = ['handicap.js','money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const TWO = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    // Top-level `function` declarations land on the context, but reading them
    // through the sandbox object misses any that were declared with const/let.
    // Pull the ones this suite needs out by name, from inside the context.
    ['nassauStakeConfig','legacyMainAsSideMatch','buildLiveMatchStates',
     'buildSideMatchReceipts','computeCombinedNetTotals'].forEach(fn => {
        try { sb[fn] = vm.runInContext(fn, sb); } catch (e) { /* absent is a real failure */ }
    });
    return sb;
}
// Marty wins holes 1 and 2; everything else halved.
function legacyRound(over) {
    const players = TWO.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2':'Team 1' }));
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores['p'+p.id+'_h'+h.hole] = 4; }));
    scores.p101_h1 = 3; scores.p101_h2 = 3;
    return Object.assign({
        players, courseData: cd18, scores, settlementMode: 'whole-dollar',
        gameFormat: 'nassau', nassauStake: 10, nassauScoring: 'net',
        nassauPressRule: '2down', nassauType: '1v1',
    }, over || {});
}
function money(d) {
    const E = engines();
    const vals = Object.values(E.computeCombinedNetTotals(d, cd18, d.scores).netByName);
    return {
        marty: (vals.find(v => v.name === 'Marty') || {}).net,
        sum: vals.reduce((a, v) => a + v.net, 0),
        receipts: E.buildSideMatchReceipts(d, cd18, d.scores).length,
    };
}
function live(d) {
    const E = engines();
    const cards = E.buildLiveMatchStates(d, cd18, d.scores, null);
    // Arrays built inside a vm context carry that context's Array prototype, so
    // deepStrictEqual rejects them against a plain array even when every element
    // matches - the failure output shows identical `actual` and `expected`. The
    // JSON round-trip rebuilds them with this realm's prototypes.
    const plain = (v) => JSON.parse(JSON.stringify(v));
    return plain({
        count: cards.length,
        segments: cards[0] ? cards[0].segments.map(s => s.id + ':$' + s.stake) : [],
        presses: cards[0] ? cards[0].segments.flatMap(s => s.presses.map(p => s.id + '@H' + p.startHole + ':$' + p.stake)) : [],
    });
}
// Drives admin.html's own format block for a saved round.
function openRound(gameFormat, { asCopy = false } = {}) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        window.__writes = [];
        alert = function(){};
        copyFromCode = ${asCopy ? "'SRC1'" : 'null'};
        collectWizardPlayers = function(){ return ${JSON.stringify(TWO)}; };
        db.ref = function(p){ return {
            push: function(){ return { key:'K1' }; },
            set: function(v){ window.__writes.push(['set', p, v]); return { then:function(f){ f&&f(); return {catch:function(){}}; } }; },
            update: function(v){ window.__writes.push(['update', p, v]); return { then:function(f){ f&&f(); return {catch:function(){}}; } }; },
            once: function(){ return { then:function(f){ f&&f({ val:function(){ return null; } }); return {catch:function(){}}; } }; },
            on: function(){}, remove: function(){} }; };
        var data = { gameFormat: '${gameFormat}' };
        if (data.gameFormat && document.getElementById("game-format-select")) {
            const isCopy = !!copyFromCode;
            const legacyWagerFormat = ['nassau','match','skins','dots'].includes(data.gameFormat);
            if (isCopy && legacyWagerFormat) {
                if (typeof clearLegacyCurrentOption === 'function') clearLegacyCurrentOption();
                document.getElementById("game-format-select").value = 'stroke';
                showCopiedLegacyNotice(data.gameFormat);
                syncSetupNassauAvailability();
            } else {
                if (typeof revealLegacyFormatOption === 'function') revealLegacyFormatOption(data.gameFormat);
                document.getElementById("game-format-select").value = data.gameFormat;
                if (!isCopy && typeof showLegacyRoundNotice === 'function') showLegacyRoundNotice(data.gameFormat);
                syncSetupNassauAvailability();
            }
        }
        handleFormatChange();
    `, sb);
    const g = (e) => vm.runInContext(e, sb);
    return {
        storedValue: g("document.getElementById('game-format-select').value"),
        legacyPanel: g("(document.getElementById('nassau-settings')||{style:{}}).style.display"),
        nassauBlocked: g("(document.getElementById('setup-nassau-enabled')||{}).disabled === true"),
        writes: JSON.parse(JSON.stringify(g('window.__writes'))),
    };
}
// The options a golfer can actually choose, read from the real markup.
function selectableOptions() {
    const src = adm();
    const i = src.indexOf('<select id="game-format-select"');
    const j = src.indexOf('</select>', i);
    return [...src.slice(i, j).matchAll(/<optgroup([^>]*)>([\s\S]*?)<\/optgroup>/g)]
        .filter(m => !/display:\s*none/.test(m[1]))
        .flatMap(m => [...m[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)]
            .map(o => ({ value: o[1], text: o[2].trim() })));
}

// ============================================================================

describe('THE OLD EDITOR IS GONE FROM SETUP', () => {

    test('no Step 4 Nassau panel remains', () => {
        assert.ok(!adm().includes('id="nassau-settings"'),
            'the old single-stake editor must not exist in the wizard');
    });

    test('no single Nassau Bet ($) input remains', () => {
        const src = adm();
        assert.ok(!src.includes('id="nassau-stake"'));
        assert.ok(!/Nassau Bet \(\$\)/.test(src));
    });

    test('no legacy Nassau stake presets remain', () => {
        assert.ok(!adm().includes('id="nassau-stake-presets"'));
    });

    test('no legacy Nassau press or type controls remain', () => {
        const src = adm();
        ['id="nassau-press-rule"','id="nassau-type"','id="nassau-scoring"']
            .forEach(id => assert.ok(!src.includes(id), id + ' must be gone'));
    });

    test('no "Legacy Nassau (existing round)" dropdown entry is created', () => {
        // Representing the old value as a CHOICE was itself the confusion.
        assert.ok(!adm().includes('legacy-current-group'));
        assert.ok(!/Legacy Nassau \(existing round\)/.test(adm()));
    });

    test('the hidden legacy optgroup is gone entirely', () => {
        assert.ok(!adm().includes('id="legacy-format-group"'),
            'nothing should be able to reveal it, because it no longer exists');
    });
});

describe('SETUP OFFERS EXACTLY ONE NASSAU', () => {

    test('one selectable option is labelled Nassau', () => {
        const nassaus = selectableOptions().filter(o => /^nassau$/i.test(o.text));
        assert.equal(nassaus.length, 1);
        assert.equal(nassaus[0].value, 'nassau-modern');
    });

    test('the full list is exactly the modern scoring choices', () => {
        assert.deepEqual(selectableOptions().map(o => o.value),
            ['stroke','stableford','nassau-modern','bestball','scramble','ryder','hilo','wolf','ryder-cup']);
    });

    test('no legacy format value is selectable at all', () => {
        const vals = selectableOptions().map(o => o.value);
        ['nassau','match','skins','dots'].forEach(f =>
            assert.ok(!vals.includes(f), f + ' must not be choosable'));
    });

    test('the modern Nassau still saves as stroke plus a wager', () => {
        const src = adm();
        assert.match(src, /function normalizeGameFormatForSave\(/);
        assert.match(src, /if \(fmt === 'nassau-modern'\) return 'stroke';/);
        assert.match(src, /sideMatches\/\$\{nKey\}/);
    });

    test('the modern card still offers three independent amounts', () => {
        const src = adm();
        ['setup-nassau-front','setup-nassau-back','setup-nassau-overall']
            .forEach(id => assert.ok(src.includes('id="' + id + '"'), id));
        assert.match(src, /id="setup-nassau-press"/);
        assert.match(src, /id="setup-nassau-scoring"/);
    });

    test('arbitrary stakes persist, with no mirroring', () => {
        const src = adm();
        const defaults = ['setup-nassau-front','setup-nassau-back','setup-nassau-overall'].map(id => {
            const m = src.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'));
            return { id, value: m ? m[1] : '' };
        });
        const sb = loadHtmlInlineScript('admin.html', DEPS);
        vm.runInContext(`
            alert = function(){};
            collectWizardPlayers = function(){ return ${JSON.stringify(TWO)}; };
            document.getElementById('game-format-select').value = 'nassau-modern';
            handleFormatChange();
            ${JSON.stringify(defaults)}.forEach(function(d){
                var e = document.getElementById(d.id); if (e && !e.value) e.value = d.value; });
            document.getElementById('setup-nassau-front').value = '10';
            document.getElementById('setup-nassau-back').value = '10';
            document.getElementById('setup-nassau-overall').value = '50';
            window.__w = collectSetupNassauWager();
        `, sb);
        const w = JSON.parse(JSON.stringify(vm.runInContext('window.__w', sb)));
        assert.equal(w.frontStake, 10);
        assert.equal(w.backStake, 10);
        assert.equal(w.overallStake, 50, 'Overall moves alone');
        // pressRule is not asserted here: the mini-DOM does not apply a <select>
        // default, so it reads empty where a browser selects the first option
        // (Auto @ 2 Down). Press behaviour is covered by the engine suites.
        assert.equal(typeof w.pressRule, 'string');
    });
});

describe('OLD SAVED ROUNDS STILL WORK — DATA, NOT UI', () => {

    test('a legacy Nassau round still opens without crashing', () => {
        const r = openRound('nassau');
        assert.equal(r.storedValue, 'nassau', 'its format is preserved, not rewritten');
    });

    test('opening one writes NOTHING to Firebase', () => {
        // Read-only compatibility: looking at an old round must not change it.
        assert.deepEqual(openRound('nassau').writes, []);
        assert.deepEqual(openRound('match').writes, []);
    });

    test('the duplicate-wager guard still protects it', () => {
        // Old rounds still exist in storage, so the double-billing hazard does too.
        assert.equal(openRound('nassau').nassauBlocked, true);
        assert.equal(openRound('match').nassauBlocked, true);
    });

    test('legacy money is untouched', () => {
        // Measured before any deletion; these are the numbers that must not move.
        assert.deepEqual(money(legacyRound()), { marty: 20, sum: 0, receipts: 1 });
        assert.deepEqual(money(legacyRound({ nassauPressRule: 'none' })), { marty: 20, sum: 0, receipts: 1 });
        assert.deepEqual(money(legacyRound({ nassauStake: 25 })), { marty: 50, sum: 0, receipts: 1 });
    });

    test('legacy live status still renders through the modern presenter', () => {
        const l = live(legacyRound());
        assert.equal(l.count, 1, 'one wager card');
        assert.deepEqual(l.segments, ['F9:$10','B9:$10','18:$10'],
            'nassauStakeConfig adapts the single stake to three segments');
    });

    test('legacy presses still render, at the right stakes', () => {
        const l = live(legacyRound());
        assert.deepEqual(l.presses, ['F9@H3:$10','18@H3:$10'],
            'auto press at 2 down, per segment');
    });

    test('a bigger legacy stake scales everything', () => {
        assert.deepEqual(live(legacyRound({ nassauStake: 25 })).segments,
            ['F9:$25','B9:$25','18:$25']);
    });

    test('no second wager is invented for an old round', () => {
        assert.equal(money(legacyRound()).receipts, 1);
        assert.equal(live(legacyRound()).count, 1);
    });

    test('a copied legacy Nassau still normalizes to a modern round', () => {
        const r = openRound('nassau', { asCopy: true });
        assert.equal(r.storedValue, 'stroke');
        assert.equal(r.nassauBlocked, false, 'the copy can have a modern Nassau');
    });
});

describe('COMPATIBILITY CODE WAS NOT TOUCHED', () => {

    test('nassauStakeConfig still adapts legacy data', () => {
        assert.match(read('money-engine.js'), /function nassauStakeConfig\(/);
        const E = engines();
        // Measured, not assumed. A legacy round with only a single stake returns
        // undefined, which the engine reads as "use nassauStake for all three" -
        // that IS the adaptation, and it is why an old round already renders as
        // F9/B9/18 without any new code.
        assert.equal(E.nassauStakeConfig({ nassauStake: 10 }), undefined);
        // The modern side-match shape is normalized by the same function, so one
        // contract serves both and no consumer needs to know which it holds.
        assert.deepEqual(
            JSON.parse(JSON.stringify(
                E.nassauStakeConfig({ format: 'nassau', frontStake: 5, backStake: 5, overallStake: 10 }))),
            { F9: 5, B9: 5, '18': 10 });   // autoPress is undefined and drops in the round-trip
    });

    test('legacyMainAsSideMatch still serves every format it always did', () => {
        const E = engines();
        ['nassau','match','bestball','scramble','ryder'].forEach(f => {
            const d = legacyRound({ gameFormat: f, matchStake: 10 });
            assert.ok(E.legacyMainAsSideMatch(d), f + ' must still be settled');
        });
    });

    test('legacyMainGameBlocksNassau survives the UI retirement', () => {
        assert.match(adm(), /function legacyMainGameBlocksNassau\(/,
            'the guard protects stored data, not the deleted editor');
    });

    test('the engines are untouched by this batch', () => {
        ['handicap.js','money-engine.js','settlement-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('nassau-settings'),
                f + ' never knew about the wizard panel'));
    });
});
