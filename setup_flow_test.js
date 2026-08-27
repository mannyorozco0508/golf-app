// ============================================================================
// SETUP FLOW — LANGUAGE AND OWNERSHIP (Batch A)
//
// The wizard asked the same question twice. Step 3 was titled "Round Type",
// which reads as "what are we playing?", and on a legacy round it offered
// Nassau. Step 6 then offered Nassau again with the modern three-stake card.
// A golfer configured a Nassau in two places and could not tell which counted.
//
// The split is now explicit:
//
//   Steps 1-5   how the round is SCORED
//   Step 6      what is being PLAYED FOR
//   Step 7      review, with those kept apart
//
// LANGUAGE AND LAYOUT ONLY. No money field moved, no navigation changed, no
// schema touched. Moving holeBetStake out of Step 4 is Batch B, deliberately
// separate: it is a live money path and does not belong in a rename batch.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const adm = () => read('admin.html');
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const PLAYERS = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];

// Loads a round through admin.html's own format-selection block.
function loadRound(gameFormat, { asCopy = false } = {}) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        alert = function(){};
        copyFromCode = ${asCopy ? "'SRC1'" : 'null'};
        collectWizardPlayers = function(){ return ${JSON.stringify(PLAYERS)}; };
        var data = { gameFormat: '${gameFormat}' };
        if (data.gameFormat && document.getElementById("game-format-select")) {
            const isCopy = !!copyFromCode;
            const legacyWagerFormat = ['nassau','match','skins','dots'].includes(data.gameFormat);
            if (isCopy && legacyWagerFormat) {
                document.getElementById("game-format-select").value = 'stroke';
                showCopiedLegacyNotice(data.gameFormat);
                syncSetupNassauAvailability(); syncLegacyFormatBadge();
            } else {
                revealLegacyFormatOption(data.gameFormat);
                document.getElementById("game-format-select").value = data.gameFormat;
                if (!isCopy) showLegacyRoundNotice(data.gameFormat);
                syncSetupNassauAvailability(); syncLegacyFormatBadge();
            }
        }
    `, sb);
    const el = (id, prop) => vm.runInContext(`(document.getElementById('${id}')||{}).${prop}`, sb);
    return {
        format: vm.runInContext("document.getElementById('game-format-select').value", sb),
        badgeShown: vm.runInContext(
            "(document.getElementById('legacy-format-badge')||{style:{}}).style.display === 'block'", sb),
        badgeHtml: el('legacy-format-badge', 'innerHTML') || '',
        nassauBlocked: vm.runInContext(
            "(document.getElementById('setup-nassau-enabled')||{}).disabled === true", sb),
    };
}

function review(gameFormat) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    // The legacy branch reads .options[...].text off selects the mini-DOM does not
    // populate. That is a harness limit, not a product fault, so the stubs below
    // stand in for the browser rather than the assertion being weakened.
    vm.runInContext(`
        alert = function(){};
        collectWizardPlayers = function(){ return ${JSON.stringify(PLAYERS)}; };
        revealLegacyFormatOption('${gameFormat}');
        document.getElementById('game-format-select').value = '${gameFormat}';
        // The mini-DOM parses <option> children but never sets selectedIndex, so
        // options[selectedIndex].text throws where a browser would not. Patch the
        // accessor rather than weaken the assertion: getElementById hands back a
        // fresh stub each call, so a one-off property assignment would not survive.
        (function(){
            var real = document.getElementById;
            document.getElementById = function(id){
                var el = real.call(document, id);
                if (el && el.options && el.selectedIndex === undefined) el.selectedIndex = 0;
                return el;
            };
        })();
        captureAdditionalGames = function(){ return {}; };
        captureMoneyPool = function(){ return null; };
        renderWizardReview();
    `, sb);
    return vm.runInContext("document.getElementById('wizard-review-summary').innerHTML", sb);
}
const sections = (html) =>
    (html.match(/review-section-head">[^<]*/g) || []).map(s => s.replace(/.*>/, ''));

// ============================================================================

describe('STEP 3 ASKS HOW THE ROUND IS SCORED', () => {

    test('the heading no longer promises to answer "what are we playing?"', () => {
        assert.match(adm(), /Step 3: How We're Scoring/);
        assert.ok(!adm().includes('Step 3: Round Type'), 'the ambiguous heading is gone');
    });

    test('and the helper line says where games actually live', () => {
        assert.match(adm(), /Choose how scores are kept\. Games and bets are added later\./);
    });

    test('the field label matches the question', () => {
        assert.match(adm(), /<label>Scoring<\/label>/);
        assert.ok(!adm().includes('<label>Round Type</label>'));
    });

    test('the stored key is untouched — this was wording, not schema', () => {
        assert.match(adm(), /id="game-format-select"/);
        assert.match(adm(), /gameFormat: gameFormat/);
    });

    test('a new round still cannot pick Nassau or Match', () => {
        assert.match(adm(),
            /<optgroup label="Legacy round types[^"]*" id="legacy-format-group" style="display:none;">/);
        ['stroke','stableford','hilo','wolf'].forEach(f => {
            assert.equal(loadRound(f).badgeShown, false, f + ' is not a legacy round');
        });
    });
});

describe('A LEGACY ROUND SAYS SO', () => {

    ['nassau','match','skins','dots'].forEach(f => {
        test(`legacy ${f} shows the badge`, () => {
            assert.equal(loadRound(f).badgeShown, true);
        });
    });

    test('the badge explains what the round is and where new games go', () => {
        const r = loadRound('nassau');
        assert.match(r.badgeHtml, /Legacy round format/);
        assert.match(r.badgeHtml, /stores Nassau as the round format/);
        assert.match(r.badgeHtml, /works exactly as it did/, 'reassures rather than alarms');
        assert.match(r.badgeHtml, /Step 6/, 'points at the modern home');
    });

    test('it names the right game for each legacy format', () => {
        assert.match(loadRound('match').badgeHtml, /Match Play/);
        assert.match(loadRound('skins').badgeHtml, /Skins/);
    });

    test('PRODUCTION calls the badge sync — not just the test helper', () => {
        // loadRound() calls syncLegacyFormatBadge() itself, so it proves the badge
        // WORKS but not that production ever RUNS it. Deleting the real call left
        // every test green. Same masking that hid a missing guard call earlier.
        const src = adm();
        const at = src.indexOf('if (!isCopy) showLegacyRoundNotice(data.gameFormat);');
        assert.ok(at > -1, 'the legacy-load branch must still exist');
        assert.match(src.slice(at, at + 220), /syncLegacyFormatBadge\(\);/,
            'loading a legacy round must badge it');
    });

    test('and calls it whenever the format changes', () => {
        const src = adm();
        const at = src.indexOf('function handleFormatChange');
        assert.match(src.slice(at, at + 500), /syncLegacyFormatBadge\(\)/,
            'switching format must re-evaluate the badge');
    });

    test('the legacy round keeps its own format — nothing is converted', () => {
        assert.equal(loadRound('nassau').format, 'nassau');
        assert.equal(loadRound('match').format, 'match');
    });

    test('a copied legacy round is NOT badged — it is a new round', () => {
        const r = loadRound('nassau', { asCopy: true });
        assert.equal(r.format, 'stroke');
        assert.equal(r.badgeShown, false);
    });

    test('the duplicate-wager guard still holds', () => {
        assert.equal(loadRound('nassau').nassauBlocked, true, 'legacy Nassau blocks the modern card');
        assert.equal(loadRound('match').nassauBlocked, true);
        assert.equal(loadRound('stroke').nassauBlocked, false, 'and a new round is unaffected');
    });
});

describe('STEP 6 IS WHERE GAMES AND MONEY LIVE', () => {

    test('renamed from clubhouse language to what it does', () => {
        assert.match(adm(), /Step 6: Games &amp; Money/);
        assert.ok(!adm().includes("Step 6: What's The Action?"));
    });

    test('the helper says everything here is optional', () => {
        assert.match(adm(), /Choose the games and bets you're playing\. Everything here is optional\./);
    });

    test('three sections, in the order a group decides', () => {
        ['PRIMARY GAME / MATCHES', 'ALSO PLAYING', 'POOLS &amp; EXTRAS']
            .forEach(h => assert.ok(adm().includes(h), 'missing: ' + h));
    });

    test('the modern Nassau card is still the one in Step 6', () => {
        const src = adm();
        assert.match(src, /id="setup-nassau-box"/);
        ['setup-nassau-front','setup-nassau-back','setup-nassau-overall',
         'setup-nassau-scoring','setup-nassau-press','setup-nassau-autopress-mode']
            .forEach(id => assert.ok(src.includes('id="' + id + '"'), id));
    });

    test('the builder and write path did not move', () => {
        const src = adm();
        assert.match(src, /buildNassauWagerPayload\(\{/);
        assert.match(src, /sideMatches\/\$\{nKey\}/);
        assert.equal((src.match(/function buildNassauWagerPayload\(/g) || []).length, 0,
            'still defined once, in action-model.js');
    });
});

describe('STEP 7 SEPARATES SCORING FROM MONEY', () => {

    test('a normal round reviews in three sections', () => {
        assert.deepEqual(sections(review('stroke')), ['SCORING', 'PLAYERS', 'GAMES & MONEY']);
    });

    test('the scoring row is labelled Scoring, not Format', () => {
        const html = review('stroke');
        assert.match(html, />Scoring</);
        assert.ok(!/>Format</.test(html), 'internal vocabulary is gone from the review');
    });

    test('a legacy Nassau is reviewed AS legacy, not as the modern wager', () => {
        const html = review('nassau');
        assert.match(html, /Legacy game/);
        assert.match(html, /Legacy Nassau/);
        assert.ok(!/Front \$/.test(html),
            'a single-stake legacy round must not be dressed up with Front/Back/Overall');
    });

    test('legacy Match and Skins are named honestly too', () => {
        assert.match(review('match'), /Legacy Match Play/);
        assert.match(review('skins'), /Legacy Skins/);
    });

    test('a modern round carries no legacy row', () => {
        assert.ok(!/Legacy game/.test(review('stroke')));
    });
});

describe('BATCH A MOVED NO MONEY', () => {

    test('Step 4 money panels are still exactly where they were', () => {
        // Deliberate: moving holeBetStake is Batch B. It is Hi-Lo's only money
        // field and appears on six formats - not a rename-batch change.
        const src = adm();
        ['hole-bet-settings','nassau-settings','match-settings','wolf-settings','stableford-settings']
            .forEach(id => assert.ok(src.includes('id="' + id + '"'), id + ' must remain'));
        assert.match(src, /id="hole-bet-stake"/);
    });

    test('navigation is unchanged — no auto-skip yet', () => {
        const src = adm();
        assert.match(src, /goToWizardStep\(fromStep \+ 1\)/);
        assert.match(src, /goToWizardStep\(fromStep - 1\)/);
    });

    test('no settlement or engine file was touched', () => {
        ['settlement-engine.js','money-engine.js','action-model.js','pool-engine.js']
            .forEach(f => assert.ok(!read(f).includes('syncLegacyFormatBadge'),
                f + ' must know nothing about wizard wording'));
    });
});
