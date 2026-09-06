// ============================================================================
// GAME DAY — FORMAT-FIRST WIZARD (Option A)
//
// Two problems, one project.
//
// 1. The wizard was seven fixed steps for every format. Stroke Play, Nassau and
//    Hi-Lo have no Format Settings at all, so all three walked the organizer onto
//    a completely blank Step 4.
//
// 2. The dropdown's "Ryder Cup" was the LEGACY gameFormat:'ryder' - a team-vs-team
//    money game that settles off matchStake exactly as match/bestball/scramble do.
//    Choosing it handed the organizer 1v1 Options, a Match Bet and an Auto-Press
//    rule, none of which belong to a Cup.
//
// The fix is Option A. The workflow is derived from the chosen format, and the
// real Ryder Cup gets its own token that creates the ROUND and then hands the
// organizer to the Phase 3B Cup setup that has always lived on the Matches page.
// That setup needs a frozen roster and real player ids; wizard ids are positional
// (idx + 101), so assigning sides before the round exists would silently repoint
// memberships the moment a player was removed or reordered. Nothing is duplicated.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const SIDEMATCHES = read('sidematches.html');
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const CARD_FORMATS = ['stroke', 'stableford', 'nassau-modern', 'bestball',
    'scramble', 'hilo', 'wolf', 'ryder', 'ryder-cup'];

// A realm with admin.html's wizard loaded and one format chosen. The heavy
// re-render helpers are stubbed because this file is testing NAVIGATION, not the
// player list - exactly as the other wizard suites do.
function wizard(format) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        alert = function(){};
        collectWizardPlayers = function(){ return []; };
        renderPlayerList = function(){};
        renderStackedGames = function(){};
        loadAdditionalGames = function(){};
        updateBetExplainers = function(){};
        document.getElementById('game-format-select').value = '${format}';
    `, sb);
    return sb;
}
const run = (sb, expr) => vm.runInContext(expr, sb);
const flow = (sb) => JSON.parse(run(sb, 'JSON.stringify(wizardWorkflow())'));

// ============================================================================
describe('GAME DAY OPENS ON FORMAT CARDS', () => {

    test('the chooser is cards, not a dropdown the golfer touches', () => {
        assert.match(ADMIN, /id="format-card-grid"/);
        assert.match(ADMIN, /<label id="format-question-label">What are you playing today\?<\/label>/);
    });

    test('the select survives as the single source of truth, hidden', () => {
        // Every reader in the file - and every other test - still goes through
        // game-format-select.value. Replacing it would have been a second model.
        assert.match(ADMIN, /<select id="game-format-select" onchange="handleFormatChange\(\)" style="display:none;"/);
        assert.match(ADMIN, /gameFormat: gameFormat/);
    });

    test('every audited format has exactly one card', () => {
        CARD_FORMATS.forEach((f) => {
            const cards = ADMIN.split('data-format="' + f + '"').length - 1;
            assert.equal(cards, 1, f + ' must have exactly one card, found ' + cards);
            assert.equal(ADMIN.split('id="fmt-card-' + f + '"').length - 1, 1, f + ' card id');
        });
    });

    test('and there are no cards for anything else', () => {
        const found = (ADMIN.match(/data-format="([^"]+)"/g) || [])
            .map((m) => m.replace(/data-format="/, '').replace(/"$/, ''));
        assert.deepEqual(found.slice().sort(), CARD_FORMATS.slice().sort());
    });

    test('every card carries its own one-line explanation', () => {
        // The whole reason a card beats an option: an option cannot say what the
        // format IS, which is how "Ryder Cup" came to mean the money game.
        const descs = (ADMIN.match(/<span class="fmt-desc">/g) || []).length;
        assert.equal(descs, CARD_FORMATS.length);
        // And an icon, which is what makes a tile readable at a glance.
        assert.equal((ADMIN.match(/<span class="fmt-icon">/g) || []).length, CARD_FORMATS.length);
    });

    test('the legacy wager formats are still unreachable from a new round', () => {
        ['nassau', 'match', 'skins', 'dots'].forEach((f) => {
            assert.ok(!ADMIN.includes('data-format="' + f + '"'), f + ' must not be a card');
        });
    });
});

// ============================================================================
describe('THE NEW RYDER CUP IS NOT THE LEGACY MONEY GAME', () => {

    test('it has its own card, distinct from Team Match', () => {
        assert.match(ADMIN, /id="fmt-card-ryder-cup" data-format="ryder-cup"/);
        assert.match(ADMIN, /id="fmt-card-ryder" data-format="ryder"/);
        assert.ok(ADMIN.includes('Team Match'), 'the legacy card is renamed on the chooser');
    });

    test('the Cup token is never the legacy value', () => {
        const sb = wizard('stroke');
        assert.equal(run(sb, 'RYDER_CUP_FORMAT'), 'ryder-cup');
        assert.notEqual(run(sb, 'RYDER_CUP_FORMAT'), 'ryder');
    });

    test('a Cup round is stored as stroke, never as ryder', () => {
        const sb = wizard('stroke');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder-cup')"), 'stroke');
    });

    test('and the legacy value is left exactly as it is', () => {
        const sb = wizard('stroke');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder')"), 'ryder');
        // Renaming the chooser card must not have touched settlement's vocabulary.
        assert.match(read('action-model.js'), /ryder: 'Ryder Cup'/);
    });

    test('a legacy ryder round reopens as a legacy ryder round', () => {
        const sb = wizard('ryder');
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'ryder');
        assert.ok(flow(sb).includes('settings'), 'Team Match keeps its own settings step');
    });
});

// ============================================================================
describe('THE WORKFLOW IS DERIVED FROM THE FORMAT', () => {

    test('the Cup workflow is Format, Players, Review — nothing else', () => {
        assert.deepEqual(JSON.parse(run(wizard('stroke'), "JSON.stringify(wizardWorkflow('ryder-cup'))")),
            ['format', 'course', 'length', 'players', 'review']);
    });

    test('the Cup never reaches Format Settings', () => {
        const f = flow(wizard('ryder-cup'));
        assert.ok(!f.includes('settings'));
    });

    test('the Cup never reaches Games & Money', () => {
        const f = flow(wizard('ryder-cup'));
        assert.ok(!f.includes('action'));
    });

    test('the Cup does reach Players and Review', () => {
        const f = flow(wizard('ryder-cup'));
        assert.ok(f.includes('players'));
        assert.ok(f.includes('review'));
    });

    ['stroke', 'nassau-modern', 'hilo'].forEach((f) => {
        test(`${f} skips the blank Format Settings step`, () => {
            assert.ok(!flow(wizard(f)).includes('settings'),
                f + ' has no Step 4 panel and must not show an empty one');
        });
    });

    ['stableford', 'wolf', 'bestball', 'scramble', 'ryder'].forEach((f) => {
        test(`${f} keeps its Format Settings step`, () => {
            assert.ok(flow(wizard(f)).includes('settings'));
        });
    });

    test('every non-Cup workflow still ends Players, Games & Money, Review', () => {
        ['stroke', 'stableford', 'nassau-modern', 'bestball', 'scramble', 'hilo', 'wolf', 'ryder']
            .forEach((f) => {
                assert.deepEqual(flow(wizard(f)).slice(-3), ['players', 'action', 'review'], f);
            });
    });

    test('the progress dots show the workflow, not seven circles', () => {
        [['ryder-cup', 5], ['stroke', 6], ['bestball', 7]].forEach(([f, n]) => {
            const sb = wizard(f);
            run(sb, 'renderWizardProgress();');
            const html = run(sb, "document.getElementById('wizard-progress').innerHTML");
            assert.equal((html.match(/wizard-dot/g) || []).length, n, f + ' dots');
            assert.ok(!html.includes('>' + (n + 1) + '<'), f + ' must not number past its own length');
        });
    });
});

// ============================================================================
describe('NO FORMAT SEES CONTROLS THAT ARE NOT ITS OWN', () => {

    const panel = (format, id) => {
        const sb = wizard(format);
        run(sb, 'handleFormatChange();');
        return run(sb, `(document.getElementById('${id}')||{style:{}}).style.display`);
    };

    test('a Cup never renders 1v1 Options, Match Bet or Auto-Press', () => {
        assert.equal(panel('ryder-cup', 'match-settings'), 'none');
    });

    test('a Cup never renders Wolf, Stableford or hole-bet controls', () => {
        ['wolf-settings', 'stableford-settings', 'hole-bet-settings'].forEach((id) => {
            assert.equal(panel('ryder-cup', id), 'none', id);
        });
    });

    test('Team Match still gets its match settings', () => {
        assert.equal(panel('ryder', 'match-settings'), 'block');
    });

    test('Wolf and Stableford still get theirs', () => {
        assert.equal(panel('wolf', 'wolf-settings'), 'block');
        assert.equal(panel('stableford', 'stableford-settings'), 'block');
    });

    test('Stroke Play gets no press or match controls', () => {
        assert.equal(panel('stroke', 'match-settings'), 'none');
        assert.equal(panel('stroke', 'hole-bet-settings'), 'none');
    });
});

// ============================================================================
describe('BACK AND NEXT WALK THE WORKFLOW', () => {

    test('Next from Format always lands on Course, whatever the format', () => {
        ['bestball', 'stroke', 'ryder-cup'].forEach((f) => {
            assert.equal(run(wizard(f), 'wizardNeighbourStep(3, 1)'), 1, f);
        });
    });

    test('Back from Players returns to the step that actually exists', () => {
        // Best Ball has Format Settings between Round Length and Players; the other
        // two do not, so Back from Players is Round Length for them.
        assert.equal(run(wizard('bestball'), 'wizardNeighbourStep(5, -1)'), 4);
        assert.equal(run(wizard('stroke'), 'wizardNeighbourStep(5, -1)'), 2);
        assert.equal(run(wizard('ryder-cup'), 'wizardNeighbourStep(5, -1)'), 2);
    });

    test('Next from Players skips Games & Money for a Cup only', () => {
        assert.equal(run(wizard('ryder-cup'), 'wizardNeighbourStep(5, 1)'), 7);
        assert.equal(run(wizard('stroke'), 'wizardNeighbourStep(5, 1)'), 6);
    });

    test('a step the new format does not have can never be landed on', () => {
        const sb = wizard('ryder-cup');
        run(sb, 'goToWizardStep(4);');
        assert.notEqual(run(sb, 'currentWizardStep'), 4);
        assert.ok(JSON.parse(run(sb, 'JSON.stringify(wizardStepNumbers())'))
            .includes(run(sb, 'currentWizardStep')));
    });

    test('switching format while standing on a vanished step moves the organizer', () => {
        const sb = wizard('bestball');
        run(sb, 'goToWizardStep(4);');
        assert.equal(run(sb, 'currentWizardStep'), 4);
        run(sb, "selectFormatCard('stroke');");
        assert.notEqual(run(sb, 'currentWizardStep'), 4);
    });

    test('the Review jump is semantic, not the number seven', () => {
        assert.equal(run(wizard('stroke'), "wizardStepNumber('review')"), 7);
        assert.equal((ADMIN.match(/goToWizardStep\(wizardStepNumber\('review'\)\)/g) || []).length, 2);
        assert.ok(!ADMIN.includes('goToWizardStep(7)'), 'no hardcoded Review jump remains');
    });
});

// ============================================================================
describe('NOTHING LEAKS ACROSS A FORMAT SWITCH', () => {

    test('money set under another format is cleared on the way into a Cup', () => {
        const sb = wizard('bestball');
        run(sb, `
            document.getElementById('enable-hole-bet').checked = true;
            document.getElementById('match-stake').value = 50;
            document.getElementById('enable-birdiegame').checked = true;
            document.getElementById('mp-enabled').checked = true;
            selectFormatCard('ryder-cup');
        `);
        assert.equal(run(sb, "document.getElementById('enable-hole-bet').checked"), false);
        assert.equal(String(run(sb, "document.getElementById('match-stake').value")), '0');
        assert.equal(run(sb, "document.getElementById('enable-birdiegame').checked"), false);
        assert.equal(run(sb, "document.getElementById('mp-enabled').checked"), false);
    });

    test('the payload neutralizes it again at the one place money is built', () => {
        assert.match(ADMIN, /if \(creatingRyderCup\) \{ holeBetStake = 0; matchStake = 0; \}/);
    });

    test('switching out of a Cup leaves no Cup draft behind, because there is none', () => {
        // The wizard never holds Cup state at all. That is the point of Option A.
        assert.ok(!ADMIN.includes('rcDraft'));
        assert.ok(!ADMIN.includes('/ryderCup'), 'no Cup is ever written from the wizard');
        const sb = wizard('ryder-cup');
        run(sb, "selectFormatCard('stroke');");
        assert.deepEqual(flow(sb).slice(-3), ['players', 'action', 'review']);
    });

    test('the selected card follows the format', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('wolf');");
        assert.equal(run(sb, "document.getElementById('fmt-card-wolf').getAttribute('aria-checked')"), 'true');
        assert.equal(run(sb, "document.getElementById('fmt-card-stroke').getAttribute('aria-checked')"), 'false');
    });
});

// ============================================================================
describe('THE CUP HANDOFF — CREATE THE ROUND, THEN HAND OVER', () => {

    test('a saved Cup round routes to the existing setup surface', () => {
        assert.match(ADMIN, /sidematches\.html\?game=\$\{currentMode\}&setup=ryder/);
    });

    test('and only AFTER the round has actually been written', () => {
        // Player ids do not exist until save. The redirect must sit inside the
        // success handler, not before it.
        const save = ADMIN.slice(ADMIN.indexOf('function saveSettings()'));
        const write = save.indexOf('.update(payload)');
        const redirect = save.indexOf('setup=ryder');
        assert.ok(write !== -1 && redirect > write, 'handoff must follow the write');
    });

    test('and nothing may be ANDed onto the guard to switch it off', () => {
        // A negative control caught this: `if (creatingRyderCup && false)` disabled the
        // whole handoff and every other assertion here still passed, because the
        // redirect was still IN the source. Presence is not reachability.
        const save = ADMIN.slice(ADMIN.indexOf('function saveSettings()'));
        assert.equal((save.match(/if \(creatingRyderCup\)/g) || []).length, 2,
            'exactly two uses: neutralize the money, then hand off');
        assert.ok(!/if \(creatingRyderCup\s*&&/.test(save), 'no extra condition may gate the handoff');
        assert.ok(!/if \(creatingRyderCup\s*\|\|/.test(save));
    });

    test('sidematches.html receives it', () => {
        assert.match(SIDEMATCHES, /urlParams\.get\('setup'\) === 'ryder'/);
        assert.match(SIDEMATCHES, /id="ryder-handoff-banner"/);
    });

    test('the handoff is organizer-only', () => {
        const hook = SIDEMATCHES.slice(SIDEMATCHES.indexOf("urlParams.get('setup') === 'ryder'"));
        assert.match(hook.slice(0, 400), /isOrganizerView\(\)/);
    });

    test('the handoff creates nothing — both entry buttons survive untouched', () => {
        assert.match(SIDEMATCHES, /onclick="rcOpen\(\)"/);
        assert.match(SIDEMATCHES, /onclick="rcOpenClassic\(\)"/);
        const hook = SIDEMATCHES.slice(SIDEMATCHES.indexOf("urlParams.get('setup') === 'ryder'"));
        const block = hook.slice(0, 900);
        assert.ok(!/rcOpen\(\)/.test(block), 'must not auto-open and hide the Classic preset');
        assert.ok(!/\.set\(/.test(block), 'a handoff must never write');
    });

    test('the Phase 3B setup itself is untouched', () => {
        ['function rcLoadDraft()', 'function renderRyderCupSetup()', 'function rcOpen()',
            'function rcOpenClassic()', "db.ref('events/' + currentMode + '/ryderCup').set(next)"]
            .forEach((s) => assert.ok(SIDEMATCHES.includes(s), 'missing: ' + s));
    });
});

// ============================================================================
describe('NO SECOND RYDER SETUP EXISTS IN THE WIZARD', () => {

    test('admin.html knows nothing about Cup config', () => {
        // Code, not commentary: the file is allowed to EXPLAIN where the Cup lives.
        ['rcDraft', 'buildRyderCupConfig', 'validateRyderCupSave', 'rcToggle',
            'renderRyderCupSetup', 'rcLoadDraft', 'rcOpenClassic',
            '/ryderCup', '<script src="ryder-cup.js"']
            .forEach((s) => assert.ok(!ADMIN.includes(s), 'admin.html must not contain ' + s));
    });

    test('and builds no membership model of its own', () => {
        assert.ok(!ADMIN.includes('sides.A'));
        assert.ok(!/members\s*:/.test(ADMIN));
    });

    test('wizard player ids are stable, and still never meet a Cup', () => {
        // THIS PIN INVERTED. It used to assert ids WERE positional, guarding a
        // deferred fix - a row could be deleted and every golfer below it silently
        // renumbered. That fix has landed: an id is stamped on the row once and
        // never recomputed, so the guarantee is now that positional ids cannot
        // come back.
        assert.ok(!/id:\s*idx\s*\+\s*101/.test(ADMIN),
            'positional player ids have returned');
        assert.match(ADMIN, /function playerIdOfRow\(row\)/,
            'the single id issuer is gone');
        assert.match(ADMIN, /setAttribute\("data-player-id"/,
            'rows no longer carry their own id');

        // Unchanged, and still true until the Teams step actually lands.
        assert.ok(!ADMIN.includes('/ryderCup'), 'the wizard never writes a Cup');
        assert.ok(!ADMIN.includes('rcDraft'), 'the wizard holds no Cup draft');
    });
});

// ============================================================================
describe('EVERYTHING ELSE STILL WORKS', () => {

    test('Road Trip still enters and links the round', () => {
        assert.match(ADMIN, /urlParams\.get\('trip'\)/);
        assert.match(ADMIN, /trips\/\$\{tripLinkCode\}\/rounds\/\$\{currentMode\}/);
        assert.ok(!ADMIN.includes('admin.html?trip=&step'), 'trip entry carries no step number');
    });

    test('the wizard still persists no step number', () => {
        assert.ok(!/currentWizardStep\s*:/.test(ADMIN), 'a step number must never be stored');
        assert.ok(!ADMIN.includes('wizardStep:'));
    });

    test('nassau-modern is still an intent token, not an engine', () => {
        const sb = wizard('stroke');
        assert.equal(run(sb, "normalizeGameFormatForSave('nassau-modern')"), 'stroke');
        assert.match(ADMIN, /function wantsModernNassau\(\)/);
    });

    test('group scorekeeper links are unchanged', () => {
        assert.match(ADMIN, /function scorecardUrlFor/);
        assert.match(ADMIN, /redirectGroupScorekeeper/);
    });
});

// ============================================================================
describe('FROZEN — THIS WAS SETUP ORCHESTRATION, NOT ARITHMETIC', () => {

    // Byte-for-byte. Money, settlement, Ryder points and handicap allocation are
    // out of scope for a navigation project, and this is the cheapest possible
    // proof that none of them moved.
    const FROZEN = {
        'money-engine.js': '3c960947ed62ebf5c179050e3ac65f9e1ed88c106ab0a759763fdd7da8931a68',
        'settlement-engine.js': '4aa88420ecfc952673cb5509619af9fab3e535e5d9a039ad74023056bce63dc5',
        'pool-engine.js': '944957133f3bce762c704606f2aa43b26c9edfec16970c111445dd8d86cfc96b',
        // RE-PINNED, DELIBERATELY. This freeze proved a NAVIGATION wave touched no
        // arithmetic; it was never meant to make these files permanently unwritable.
        // action-model.js has since gained nassauAutoPressLabel() - a pure presentation
        // helper that prices the auto-press dropdown - by explicit per-file approval.
        // Additions only: buildNassauWagerPayload, the function that shapes the money,
        // is byte-for-byte unchanged, and nassau_autopress_label_test.js asserts its
        // behaviour rather than trusting this hash to notice.
        'action-model.js': '034b008b00fbcc16614b91d0982a6d1bd3a3b329cb3f46ce3d9590faadfa15b0',
        'ryder-cup.js': '81cf2ea01752ec787792844ace37a802b562e9cdcb7174f4af3d4478c8f5328b',
        'bet-strip.js': '934c6a99291fc9848d107d2c877855aafd0758acfdcbb76842e44403006e290d',
        'hole-events.js': '4f16bd6b58db89cad5354ed63d2eea4a1ab67e6b789603005b4a1dc0ef8f74cf',
        'score-marks.js': '02f972d6d2fc7cad5c586eb74bcbcafaa1face8a8ba6bba46f4abf0154b5c3f3',
        'database.rules.json': '3d7e4dce0f6e7c8bd566e33ba24148ba37bd39033eb61122d40aa2ed671fd979',
        'handicap.js': '558a3e4c54189209553a734fa461fc9766b62fffa5cee990a493f82b0a46c3e9',
        'payouts.js': 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8',
    };

    Object.keys(FROZEN).forEach((f) => {
        test(`${f} is byte-identical`, () => {
            const got = crypto.createHash('sha256')
                .update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex');
            assert.equal(got, FROZEN[f], f + ' changed — this project may not touch it');
        });
    });
});

// ============================================================================
describe('THE CARDS FIT A PHONE', () => {

    // SUPERSEDED. The one-column list was the cautious first cut; a real iPhone
    // said it read as a settings form. Two columns of near-square tiles is now the
    // requirement, and the geometry is proved in format_gallery_test.js rather than
    // asserted as a slogan here.
    test('two columns of tiles, sized from the grid rather than fixed', () => {
        assert.match(ADMIN, /\.fmt-grid \{ display: grid; grid-template-columns: 1fr 1fr;/);
    });

    test('nothing in a card can push past the viewport', () => {
        const css = ADMIN.slice(ADMIN.indexOf('.fmt-card {'), ADMIN.indexOf('.fmt-card:focus-visible'));
        assert.match(css, /max-width: 100%/);
        assert.match(css, /box-sizing: border-box/);
        assert.ok(!/width: \d+px/.test(css), 'no fixed pixel width');
        assert.ok(!/min-width/.test(css), 'no min-width to overflow a 360px screen');
    });

    test('long format names wrap instead of overflowing', () => {
        assert.match(ADMIN, /\.fmt-name \{[^}]*overflow-wrap: anywhere/);
        assert.match(ADMIN, /\.fmt-desc \{[^}]*overflow-wrap: anywhere/);
        assert.ok(!/\.fmt-name \{[^}]*white-space: nowrap/.test(ADMIN));
    });

    test('the tap target is thumb-sized', () => {
        // A tile, not a row: 132px tall against a ~143px column at 360px.
        assert.match(ADMIN, /\.fmt-card \{[^}]*min-height: 132px/);
    });
});
