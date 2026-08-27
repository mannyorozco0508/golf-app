// ============================================================================
// LEGACY + MODERN NASSAU — THE DOUBLE-BILLING GUARD
//
// A round saved the old way (gameFormat:'nassau') already carries a Nassau.
// settlement-engine's legacyMainAsSideMatch() synthesises it into a receipt so
// old rounds still pay. If the golfer then ticks the modern Step 6 Nassau card,
// the round holds TWO Nassaus between the same teams and settles both:
//
//     legacy only   $40 / -$40      1 receipt
//     modern only   $40 / -$40      1 receipt
//     BOTH          $80 / -$80      2 receipts     <- every golfer pays double
//
// It stays zero-sum, so no conservation check fires. Only the receipt count and
// the actual dollars reveal it.
//
// WHY THE GUARD IS AT SETUP, NOT IN SETTLEMENT.
// Settlement cannot safely tell a duplicate from a legitimate second wager:
//
//   legacy 2v2 + modern 2v2, same teams   -> duplicate, should be one
//   legacy 2v2 + modern 1v1 Marty v Manny -> a real private bet alongside it
//
// Both are "a legacy main game plus a sideMatches Nassau". Deduping generically
// would silently delete a wager two golfers actually struck. So the round is
// prevented from reaching that state, and settlement is left alone.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const ADMIN = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const TEAMS = [
    { id:101, name:'Marty', hcp:'0', team:'Team 1' },
    { id:102, name:'Manny', hcp:'0', team:'Team 2' },
];
// Marty wins holes 1 and 2; everything else halved.
function scores(players) {
    const s = {};
    players.forEach(p => cd18.forEach(h => { s['p'+p.id+'_h'+h.hole] = 4; }));
    s.p101_h1 = 3; s.p101_h2 = 3;
    return s;
}
const LEGACY = { gameFormat:'nassau', nassauStake:20, nassauScoring:'net', nassauPressRule:'2down' };
const MODERN = {
    format:'nassau', scoring:'net', teamAIds:['101'], teamBIds:['102'], startHole:1,
    stake:20, frontStake:10, backStake:10, overallStake:20, autoPressStake:null, pressRule:'2down',
};
function round(over) {
    const players = TEAMS;
    return Object.assign({ players, courseData: cd18, scores: scores(players),
                           settlementMode: 'whole-dollar' }, over);
}
function settle(d) {
    const E = engines();
    const receipts = E.buildSideMatchReceipts(d, cd18, d.scores);
    const totals = E.computeCombinedNetTotals(d, cd18, d.scores);
    const vals = Object.values(totals.netByName);
    return {
        receipts: receipts.length,
        marty: (vals.find(v => v.name === 'Marty') || {}).net,
        sum: vals.reduce((a, v) => a + v.net, 0),
    };
}

// Drives admin.html's real Step 6 collector against a loaded round.
function step6(loadedFormat, { tick = true } = {}) {
    const sb = loadHtmlInlineScript('admin.html', ADMIN);
    vm.runInContext(`
        alert = function(m){ window.__alert = m; };
        copyFromCode = null;
        collectWizardPlayers = function(){ return ${JSON.stringify(TEAMS)}; };
        var data = { gameFormat: '${loadedFormat}' };
        if (data.gameFormat && document.getElementById("game-format-select")) {
            const isCopy = !!copyFromCode;
            const legacyWagerFormat = ['nassau','match','skins','dots'].includes(data.gameFormat);
            if (isCopy && legacyWagerFormat) {
                document.getElementById("game-format-select").value = 'stroke';
                showCopiedLegacyNotice(data.gameFormat);
            } else {
                revealLegacyFormatOption(data.gameFormat);
                document.getElementById("game-format-select").value = data.gameFormat;
                if (!isCopy) showLegacyRoundNotice(data.gameFormat);
            }
        }
        if (typeof syncSetupNassauAvailability === 'function') syncSetupNassauAvailability();
        ${tick ? `
        var box = document.getElementById('setup-nassau-enabled');
        if (box) { box.checked = true; toggleSetupNassau(); }
        document.getElementById('setup-nassau-front').value = '10';
        document.getElementById('setup-nassau-back').value = '10';
        document.getElementById('setup-nassau-overall').value = '20';
        ` : ''}
        window.__wager = collectSetupNassauWager();
    `, sb);
    const w = vm.runInContext('window.__wager', sb);
    return {
        wager: w ? JSON.parse(JSON.stringify(w)) : null,
        disabled: vm.runInContext(
            "(document.getElementById('setup-nassau-enabled')||{}).disabled === true", sb),
        noticeShown: vm.runInContext(
            "(document.getElementById('setup-nassau-legacy-note')||{style:{}}).style.display === 'block'", sb),
        noticeText: vm.runInContext(
            "(document.getElementById('setup-nassau-legacy-note')||{}).textContent || ''", sb),
    };
}

// ============================================================================

describe('THE BUG THIS GUARD EXISTS FOR', () => {

    test('a legacy Nassau round settles once', () => {
        const r = settle(round(LEGACY));
        assert.equal(r.receipts, 1);
        assert.equal(r.marty, 40);
        assert.equal(r.sum, 0);
    });

    test('a modern Nassau round settles once', () => {
        const r = settle(round({ gameFormat: 'stroke', sideMatches: { n1: MODERN } }));
        assert.equal(r.receipts, 1);
        assert.equal(r.marty, 40);
        assert.equal(r.sum, 0);
    });

    test('BOTH together bills the same bet twice — and stays zero-sum while doing it', () => {
        // Pinned deliberately. This is settlement behaving correctly on a round
        // that should never have been allowed to exist; the fix is upstream, so
        // this assertion must keep describing reality.
        const r = settle(round(Object.assign({}, LEGACY, { sideMatches: { n1: MODERN } })));
        assert.equal(r.receipts, 2, 'two Nassaus between the same two golfers');
        assert.equal(r.marty, 80, 'double-billed');
        assert.equal(r.sum, 0, 'zero-sum, which is why no conservation check catches it');
    });

    test('settlement cannot safely dedupe — proven, not assumed', () => {
        // A legacy main game plus a sideMatches Nassau is BOTH the duplicate case
        // and the legitimate "we also have a private bet" case. Nothing in the
        // data distinguishes them, so a generic dedupe would delete real wagers.
        const E = engines();
        const dupe = round(Object.assign({}, LEGACY, { sideMatches: { n1: MODERN } }));
        const legit = round(Object.assign({}, LEGACY, { sideMatches: {
            n1: Object.assign({}, MODERN, { startHole: 10, overallStake: 5 }) } }));
        assert.equal(E.buildSideMatchReceipts(dupe, cd18, dupe.scores).length, 2);
        assert.equal(E.buildSideMatchReceipts(legit, cd18, legit.scores).length, 2,
            'indistinguishable by receipt count — hence a setup-level guard');
    });
});

describe('THE UI GUARD — a legacy round cannot add a modern duplicate', () => {

    test('legacy Nassau disables the Step 6 Nassau control', () => {
        const r = step6('nassau');
        assert.equal(r.disabled, true, 'the modern card must be unavailable');
    });

    test('and explains why, rather than just going dead', () => {
        const r = step6('nassau');
        assert.equal(r.noticeShown, true);
        assert.match(r.noticeText, /legacy Nassau/i);
        assert.match(r.noticeText, /new round/i, 'tells the golfer the way forward');
    });

    test('ticking it anyway produces no wager', () => {
        assert.equal(step6('nassau', { tick: true }).wager, null,
            'even a forced check must not build a payload');
    });

    test('a modern stroke round is unaffected', () => {
        const r = step6('stroke');
        assert.equal(r.disabled, false);
        assert.equal(r.noticeShown, false);
        assert.ok(r.wager, 'the modern Nassau still works normally');
        assert.equal(r.wager.frontStake, 10);
        assert.equal(r.wager.overallStake, 20);
    });

    test('other legacy formats keep Nassau available — they are different games', () => {
        // A legacy Skins or Dots round has no main Nassau to duplicate, so adding
        // a Nassau there is a legitimate new wager, not a double bill.
        ['skins','dots'].forEach(f => {
            assert.equal(step6(f).disabled, false, f + ' must not block Nassau');
        });
    });

    test('legacy MATCH also blocks it — a match main game is the same hazard', () => {
        // gameFormat 'match' is settled through legacyMainAsSideMatch too, so a
        // modern Nassau over the same players double-bills in the same way.
        assert.equal(step6('match').disabled, true);
    });

    test('PRODUCTION calls the sync when a legacy round loads', () => {
        // The step6() helper above calls syncSetupNassauAvailability() itself, so
        // it proves the guard WORKS but not that production ever RUNS it. Deleting
        // the real call left every test green while the checkbox stayed live on a
        // legacy round. Assert the wiring directly.
        const src = read('admin.html');
        const at = src.indexOf('if (!isCopy) showLegacyRoundNotice(data.gameFormat);');
        assert.ok(at > -1, 'the legacy-load branch must still exist');
        assert.match(src.slice(at, at + 200), /syncSetupNassauAvailability\(\);/,
            'loading a legacy round must re-evaluate the Nassau card');
    });

    test('and calls it whenever the format changes', () => {
        const src = read('admin.html');
        const at = src.indexOf('function handleFormatChange');
        assert.match(src.slice(at, at + 400), /syncSetupNassauAvailability\(\)/,
            'switching format in Step 3 must re-evaluate the Step 6 card');
    });
});

describe('THE SAVE GUARD — belt as well as braces', () => {

    test('collectSetupNassauWager refuses on a legacy main-game round', () => {
        // UI state can be manipulated; the collector is the last gate before the
        // write, so it re-checks rather than trusting the checkbox.
        const src = read('admin.html');
        const at = src.indexOf('function collectSetupNassauWager');
        const fn = src.slice(at, at + 1400);
        assert.match(fn, /legacyMainGameBlocksNassau\(\)/,
            'the collector must consult the guard, not just the checkbox');
    });

    test('the guard is a single named predicate, not a copied condition', () => {
        const src = read('admin.html');
        assert.equal((src.match(/function legacyMainGameBlocksNassau\(/g) || []).length, 1);
    });

    test('the guard names exactly the formats that carry a main wager', () => {
        const E = engines();
        // legacyMainAsSideMatch settles these; those are the ones that can double.
        ['nassau','match','bestball','scramble','ryder'].forEach(f => {
            const d = round({ gameFormat: f, nassauStake: 20, matchStake: 20,
                              nassauScoring: 'net', matchScoring: 'net' });
            assert.ok(E.legacyMainAsSideMatch(d), f + ' carries a main wager');
        });
        ['stroke','stableford','wolf','dots','skins'].forEach(f => {
            const d = round({ gameFormat: f });
            assert.equal(E.legacyMainAsSideMatch(d), null, f + ' carries none');
        });
    });
});

describe('NOTHING LEGITIMATE WAS BLOCKED', () => {

    test('a legacy Nassau round still settles and stays editable', () => {
        const r = settle(round(LEGACY));
        assert.equal(r.receipts, 1);
        assert.equal(r.marty, 40);
        const src = read('admin.html');
        ['data.nassauStake','data.nassauPressRule','data.nassauScoring','data.nassauType']
            .forEach(k => assert.ok(src.includes(k), k + ' must still load'));
    });

    test('a modern Nassau plus Skins is fine', () => {
        const d = round({ gameFormat: 'stroke', sideMatches: { n1: MODERN },
                          additionalGames: { skins: true }, skinsBuyIn: 5 });
        assert.equal(settle(d).sum, 0);
    });

    test('a modern Nassau plus a separate Match side bet is fine', () => {
        const d = round({ gameFormat: 'stroke', sideMatches: {
            n1: MODERN,
            m1: { format:'match', scoring:'net', teamAIds:['101'], teamBIds:['102'],
                  startHole:1, stake:10, pressRule:'none' } } });
        assert.equal(settle(d).receipts, 2, 'two genuinely different wagers');
        assert.equal(settle(d).sum, 0);
    });

    test('two modern Nassaus between different pairs are fine', () => {
        const four = TEAMS.concat([
            { id:103, name:'Carp', hcp:'0', team:'Team 1' },
            { id:104, name:'Scott', hcp:'0', team:'Team 2' }]);
        const d = { players: four, courseData: cd18, scores: scores(four),
                    settlementMode: 'whole-dollar', gameFormat: 'stroke',
                    sideMatches: { a: MODERN,
                        b: Object.assign({}, MODERN, { teamAIds:['103'], teamBIds:['104'] }) } };
        assert.equal(settle(d).receipts, 2);
        assert.equal(settle(d).sum, 0);
    });

    test('copyFrom normalization is untouched', () => {
        const src = read('admin.html');
        assert.match(src, /\['nassau', 'match', 'skins', 'dots'\]\.includes\(data\.gameFormat\)/);
        assert.match(src, /function showCopiedLegacyNotice\(/);
    });

    test('a copied legacy Nassau becomes stroke, so Nassau stays available', () => {
        const sb = loadHtmlInlineScript('admin.html', ADMIN);
        vm.runInContext(`
            alert=function(){}; copyFromCode='SRC1';
            collectWizardPlayers = function(){ return ${JSON.stringify(TEAMS)}; };
            var data = { gameFormat: 'nassau' };
            const isCopy = !!copyFromCode;
            const legacyWagerFormat = ['nassau','match','skins','dots'].includes(data.gameFormat);
            if (isCopy && legacyWagerFormat) {
                document.getElementById("game-format-select").value = 'stroke';
                showCopiedLegacyNotice(data.gameFormat);
            }
            if (typeof syncSetupNassauAvailability === 'function') syncSetupNassauAvailability();
        `, sb);
        assert.equal(vm.runInContext("document.getElementById('game-format-select').value", sb), 'stroke');
        assert.equal(vm.runInContext(
            "(document.getElementById('setup-nassau-enabled')||{}).disabled === true", sb), false,
            'a copied round is a NEW round — the modern Nassau must be available');
    });

    test('settlement-engine was not modified for this guard', () => {
        // The fix is upstream by design; a generic dedupe would delete real wagers.
        const src = read('settlement-engine.js');
        assert.ok(!src.includes('legacyMainGameBlocksNassau'));
        assert.match(src, /function legacyMainAsSideMatch\(/, 'still present and unchanged in role');
    });
});
