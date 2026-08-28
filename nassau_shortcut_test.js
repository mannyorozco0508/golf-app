// ============================================================================
// "NASSAU" IN STEP 3 — INTENT, NOT A STORED FORMAT
//
// A golfer who says "we're playing a Nassau" should be able to choose Nassau.
// Today choosing it lands on the legacy panel: one "Nassau Bet ($)" box, because
// the select's value IS the stored format:
//
//     admin.html  <select id="game-format-select" onchange="handleFormatChange()">
//                 nassau-settings.display = (format === "nassau") ? ...
//                 let gameFormat = ...value;   ->  gameFormat: gameFormat
//
// So one click showed the deprecated editor, persisted gameFormat:'nassau', AND
// created a settling main wager via legacyMainAsSideMatch. Three consequences,
// no interception.
//
// The fix separates the two meanings. A distinct token, 'nassau-modern', carries
// the golfer's INTENT through the wizard and is normalized to 'stroke' at the
// single save-time read. The Nassau itself is the modern sideMatches wager that
// Step 6 already builds - one source of truth for the stakes, with the card's
// existing 10/10/20 defaults and no second prefill.
//
// THE LOAD-BEARING PROOF: 'nassau-modern' must never reach persisted data, and
// this new-round path must never create gameFormat:'nassau'. Everything else
// here is downstream of those two.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

// Reads the card's default stakes straight out of admin.html.
function markupDefaults() {
    const src = read('admin.html');
    return ['setup-nassau-front','setup-nassau-back','setup-nassau-overall'].map(id => {
        const m = src.match(new RegExp('id="' + id + '"[^>]*value="([^"]*)"'));
        return { id, value: m ? m[1] : '' };
    });
}

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const adm = () => read('admin.html');
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const TWO = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];
const FOUR = TWO.concat([{ id:103, name:'Carp', hcp:'0' }, { id:104, name:'Scott', hcp:'0' }]);

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}

// Drives the wizard: pick a format in Step 3, then read Step 6 and the save-time
// normalization. Nothing here reimplements admin.html's logic.
function wizard(selectValue, { players = TWO, stakes = null, picks = null, tick = null } = {}) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        alert = function(m){ window.__alert = m; };
        copyFromCode = null;
        // The mini-DOM does not seed .value from a markup value="..." attribute the
        // way a browser does, so the card's own defaults read as empty. Seeded from
        // the real HTML (read in Node, injected below) rather than hard-coded here:
        // if the markup defaults change, the test follows them instead of lying.
        ${JSON.stringify(markupDefaults())}.forEach(function(d){
            var el = document.getElementById(d.id);
            if (el && !el.value) el.value = d.value;
        });
        collectWizardPlayers = function(){ return ${JSON.stringify(players)}; };
        document.getElementById('game-format-select').value = '${selectValue}';
        handleFormatChange();
        ${tick === true ? "document.getElementById('setup-nassau-enabled').checked = true; toggleSetupNassau();" : ''}
        ${tick === false ? "document.getElementById('setup-nassau-enabled').checked = false; toggleSetupNassau();" : ''}
        ${stakes ? `
        document.getElementById('setup-nassau-front').value = '${stakes[0]}';
        document.getElementById('setup-nassau-back').value = '${stakes[1]}';
        document.getElementById('setup-nassau-overall').value = '${stakes[2]}';` : ''}
        ${picks ? `
        document.getElementById('setup-nassau-p1').value = '${picks[0]}';
        document.getElementById('setup-nassau-p2').value = '${picks[1]}';` : ''}
        window.__wager = collectSetupNassauWager();
        // The single save-time read, reproduced from admin.html's own save path.
        window.__stored = (function(){
            let gameFormat = document.getElementById("game-format-select").value;
            if (typeof normalizeGameFormatForSave === 'function') gameFormat = normalizeGameFormatForSave(gameFormat);
            if (!gameFormat) gameFormat = 'stroke';
            return gameFormat;
        })();
    `, sb);
    const g = (expr) => vm.runInContext(expr, sb);
    const w = g('window.__wager');
    return {
        storedFormat: g('window.__stored'),
        nassauChecked: g("document.getElementById('setup-nassau-enabled').checked === true"),
        nassauDisabled: g("document.getElementById('setup-nassau-enabled').disabled === true"),
        panelOpen: g("(document.getElementById('setup-nassau-panel')||{style:{}}).style.display === 'block'"),
        legacyPanel: g("(document.getElementById('nassau-settings')||{style:{}}).style.display"),
        front: g("document.getElementById('setup-nassau-front').value"),
        back: g("document.getElementById('setup-nassau-back').value"),
        overall: g("document.getElementById('setup-nassau-overall').value"),
        wager: w ? JSON.parse(JSON.stringify(w)) : null,
    };
}

function settle(gameFormat, wager) {
    const E = engines();
    const scores = {};
    TWO.forEach(p => cd18.forEach(h => { scores['p'+p.id+'_h'+h.hole] = 4; }));
    scores.p101_h1 = 3; scores.p101_h2 = 3;
    const d = { players: TWO.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2':'Team 1' })),
                courseData: cd18, scores, settlementMode: 'whole-dollar', gameFormat };
    if (wager) d.sideMatches = { n1: wager };
    // A legacy round needs its own stake fields, and they must match the modern
    // wager's for the comparison to mean anything. Omitting them made the legacy
    // round settle on a default stake and looked like the shortcut underpaying.
    if (gameFormat === 'nassau') {
        d.nassauStake = 20;
        d.nassauScoring = 'net';
        d.nassauPressRule = 'none';
    }
    const receipts = E.buildSideMatchReceipts(d, cd18, scores);
    const vals = Object.values(E.computeCombinedNetTotals(d, cd18, scores).netByName);
    return {
        receipts: receipts.length,
        legacyMain: receipts.filter(r => r.__legacyMain).length,
        marty: (vals.find(v => v.name === 'Marty') || {}).net,
        sum: vals.reduce((a, v) => a + v.net, 0),
    };
}

// ============================================================================

describe('THE TOKEN NEVER REACHES STORAGE', () => {

    test("choosing Nassau stores 'stroke', never 'nassau'", () => {
        const r = wizard('nassau-modern');
        assert.equal(r.storedFormat, 'stroke',
            'the golfer picked Nassau; the round is scored on individual cards');
        assert.notEqual(r.storedFormat, 'nassau', 'the deprecated format must never be created');
    });

    test("'nassau-modern' itself is never persisted", () => {
        assert.notEqual(wizard('nassau-modern').storedFormat, 'nassau-modern',
            'the token expresses intent inside the wizard only');
    });

    test('the normalizer is a single named function, not a scattered condition', () => {
        const src = adm();
        assert.equal((src.match(/function normalizeGameFormatForSave\(/g) || []).length, 1);
    });

    test('and the save path actually calls it', () => {
        // There is exactly one place the stored format is read. If the call is not
        // there, the token leaks into Firebase.
        const src = adm();
        // Anchored on the read itself rather than a fixed one-line form, so wrapping
        // the call across lines does not silently stop this from checking anything.
        // Anchored on the assignment itself. An earlier attempt used indexOf on a
        // substring that also appears elsewhere in the file and matched unrelated
        // code, which would have let a missing call pass unnoticed.
        assert.match(src, /let gameFormat = normalizeGameFormatForSave\(\s*\n?\s*document\.getElementById\("game-format-select"\)\.value\);/,
            'the single save-time read must normalize');
        assert.equal((src.match(/let gameFormat = /g) || []).length, 1,
            'exactly one save-time read of the format');
        assert.equal((src.match(/gameFormat: gameFormat/g) || []).length, 1,
            'and there is still exactly one place the format is persisted');
    });

    test('every other format is stored exactly as chosen', () => {
        ['stroke','stableford','bestball','scramble','ryder','hilo','wolf']
            .forEach(f => assert.equal(wizard(f).storedFormat, f, f + ' must pass through'));
    });

    test('a genuinely legacy value still stores as itself', () => {
        // Loading an old round must not rewrite its format.
        ['nassau','match','skins','dots']
            .forEach(f => assert.equal(wizard(f).storedFormat, f, f + ' round stays ' + f));
    });
});

describe('THE LEGACY PANEL NEVER APPEARS FOR A NEW NASSAU', () => {

    test('choosing Nassau does not open the single-stake editor', () => {
        assert.notEqual(wizard('nassau-modern').legacyPanel, 'block',
            'the "Nassau Bet ($)" panel is for saved legacy rounds only');
    });

    test('but a genuine legacy round still gets it', () => {
        assert.equal(wizard('nassau').legacyPanel, 'block',
            'old rounds must stay editable exactly as before');
    });

    test('the legacy panel is gone — the editor was retired', () => {
        // OBSOLETE UI CONTRACT. The legacy Nassau editor and its hidden optgroup
        // were retired: a golfer configures Nassau once, in Step 6. Old rounds stay
        // readable, scoreable and settleable - proven in legacy_retirement_test.js -
        // they simply have no deprecated editor. What still matters is asserted here.
        const src = adm();
        assert.ok(!src.includes('id="nassau-settings"'));
        assert.ok(!src.includes('id="nassau-stake"'));
    });
});

describe('STEP 6 IS ALREADY OPEN AND READY', () => {

    test('the Nassau card arrives checked', () => {
        const r = wizard('nassau-modern');
        assert.equal(r.nassauChecked, true, 'the golfer already said they want a Nassau');
        assert.equal(r.panelOpen, true, 'and the stakes are visible without another tap');
    });

    test('it is NOT auto-checked for any other format', () => {
        ['stroke','stableford','hilo','wolf','bestball']
            .forEach(f => assert.equal(wizard(f).nassauChecked, false, f + ' must not assume a Nassau'));
    });

    test('the card keeps its own 10 / 10 / 20 defaults', () => {
        // Deliberately no second prefill: the card is the single source of truth
        // for the stakes, so Step 3 expresses intent and nothing more.
        const r = wizard('nassau-modern');
        assert.equal(r.front, '10');
        assert.equal(r.back, '10');
        assert.equal(r.overall, '20');
    });

    test('Step 3 adds no prefill mechanism of its own', () => {
        const src = adm();
        const at = src.indexOf('function normalizeGameFormatForSave');
        const near = src.slice(Math.max(0, at - 1500), at + 1500);
        ['setup-nassau-front', 'setup-nassau-overall'].forEach(id => {
            assert.ok(!near.includes(id + "').value = '"),
                'the shortcut must not write stakes; the card owns them');
        });
    });

    test('the golfer can still untick it', () => {
        assert.equal(wizard('nassau-modern', { tick: false }).wager, null,
            'intent is a default, not a lock');
    });

    test('the three stakes stay independent', () => {
        const r = wizard('nassau-modern', { stakes: [10, 10, 50] });
        assert.equal(r.wager.frontStake, 10);
        assert.equal(r.wager.backStake, 10);
        assert.equal(r.wager.overallStake, 50, 'changing Overall leaves Front and Back alone');
    });

    test('asymmetric stakes work', () => {
        const r = wizard('nassau-modern', { stakes: [5, 50, 10] });
        assert.equal(r.wager.frontStake, 5);
        assert.equal(r.wager.backStake, 50);
        assert.equal(r.wager.overallStake, 10);
    });
});

describe('THE WAGER IT PRODUCES', () => {

    test('exactly one modern Nassau, in the standard shape', () => {
        const w = wizard('nassau-modern').wager;
        assert.equal(w.format, 'nassau');
        assert.deepEqual(w.teamAIds, ['101']);
        assert.deepEqual(w.teamBIds, ['102']);
        assert.equal(w.frontStake, 10);
        assert.equal(w.backStake, 10);
        assert.equal(w.overallStake, 20);
        assert.equal(w.startHole, 1);
    });

    test('two players pair themselves; four require a choice', () => {
        assert.ok(wizard('nassau-modern', { players: TWO }).wager, 'heads-up is unambiguous');
        assert.equal(wizard('nassau-modern', { players: FOUR }).wager, null,
            'the app must not invent who is playing whom for money');
        const picked = wizard('nassau-modern', { players: FOUR, picks: ['101','103'] });
        assert.deepEqual(picked.wager.teamAIds, ['101']);
        assert.deepEqual(picked.wager.teamBIds, ['103']);
    });

    test('no players yet means no wager, not a crash', () => {
        assert.equal(wizard('nassau-modern', { players: [] }).wager, null);
    });

    test('the write path is the one that already existed', () => {
        const src = adm();
        assert.match(src, /buildNassauWagerPayload\(\{/);
        assert.match(src, /sideMatches\/\$\{nKey\}/);
        assert.equal((src.match(/function buildNassauWagerPayload\(/g) || []).length, 0,
            'still defined once, in action-model.js');
    });
});

describe('SETTLEMENT: ONE RECEIPT, NO SYNTHETIC DUPLICATE', () => {

    test('a shortcut-created Nassau settles exactly once', () => {
        const w = wizard('nassau-modern').wager;
        const r = settle('stroke', w);
        assert.equal(r.receipts, 1);
        assert.equal(r.legacyMain, 0, 'stroke carries no synthetic main wager');
        assert.equal(r.marty, 40);
        assert.equal(r.sum, 0);
    });

    test('and pays the same as the legacy round it replaces', () => {
        // Compared on equal terms: the card's default press rule, not the legacy
        // panel's. The first version of this test compared a no-press modern wager
        // against a 2-down legacy round and would have blamed the shortcut for a
        // difference that was really my fixture.
        const modern = wizard('nassau-modern').wager;
        const paid = settle('stroke', modern).marty;
        assert.equal(paid, 40, 'Marty won two holes on the front');
        assert.equal(settle('nassau', null).marty, paid,
            'the golfer gets the same money either way');
    });

    test('the double-billing shape is still unreachable from this path', () => {
        // gameFormat is 'stroke', so legacyMainAsSideMatch contributes nothing.
        const r = settle('stroke', wizard('nassau-modern').wager);
        assert.equal(r.receipts, 1, 'never two');
    });
});

describe('THE GUARD AND THE SHORTCUT AGREE', () => {

    test('the shortcut does not trip the duplicate-wager guard', () => {
        // One typo apart from contradicting each other, so pin it.
        const r = wizard('nassau-modern');
        assert.equal(r.nassauDisabled, false, 'a new Nassau round must be able to add its Nassau');
    });

    test('legacy main-game formats still block it', () => {
        ['nassau','match','bestball','scramble','ryder']
            .forEach(f => assert.equal(wizard(f).nassauDisabled, true, f + ' must still block'));
    });

    test('the guard list does not contain the modern token', () => {
        const src = adm();
        const at = src.indexOf('function legacyMainGameBlocksNassau');
        const fn = src.slice(at, at + 400);
        assert.ok(!fn.includes('nassau-modern'),
            'blocking the modern token would defeat the shortcut entirely');
    });
});

describe('STEP 3 OFFERS IT WITHOUT REVIVING THE OLD ONE', () => {

    test('Nassau is a visible choice again', () => {
        assert.match(adm(), /<option value="nassau-modern">Nassau<\/option>/);
    });

    test('and it sits in a visible group, with no legacy group to confuse it', () => {
        // OBSOLETE UI CONTRACT. The legacy Nassau editor and its hidden optgroup
        // were retired: a golfer configures Nassau once, in Step 6. Old rounds stay
        // readable, scoreable and settleable - proven in legacy_retirement_test.js -
        // they simply have no deprecated editor. What still matters is asserted here.
        const src = adm();
        assert.ok(src.indexOf('value="nassau-modern"') > -1);
        assert.ok(!src.includes('id="legacy-format-group"'));
    });

    test('no legacy format is selectable anywhere', () => {
        // OBSOLETE UI CONTRACT. The legacy Nassau editor and its hidden optgroup
        // were retired: a golfer configures Nassau once, in Step 6. Old rounds stay
        // readable, scoreable and settleable - proven in legacy_retirement_test.js -
        // they simply have no deprecated editor. What still matters is asserted here.
        const src = adm();
        ['nassau','match','skins','dots'].forEach(f =>
            assert.ok(!new RegExp('<option value="' + f + '"').test(src), f));
    });

    test('Match Play was deliberately left alone', () => {
        // There is no modern Step 6 Match card, so a shortcut would point nowhere.
        const src = adm();
        assert.ok(!src.includes('match-modern'), 'not in this batch');
        assert.ok(!src.includes('id="setup-match-enabled"'), 'no modern Match card exists yet');
    });
});
