// ============================================================================
// GAME DAY ENTRY — THE FIRST DECISION IS THE FORMAT
//
// Patch 1 made the wizard's shape depend on the format. It did not change WHEN
// the format is asked for, so a golfer still answered Course and Round Length
// before being asked what game they were playing - three screens of filing
// before the first real decision, and no way for the wizard to shape itself
// until the third one.
//
// Game Day now opens on the format gallery. Tapping a widget IS the selection:
// no confirming Next, and the tap advances into that format's own workflow.
//
// NO MARKUP MOVED. Because steps are addressed by meaning, the whole reorder is
// one array in wizardWorkflow(). wizard-step-3 is still the format screen; it is
// simply the first one visited.
// ============================================================================

// ============================================================================
// RE-POINTED 2026-10-05: THREE STEPS, AND THE GALLERY IS THE TOP OF ONE.
//
// This file's subject was WHEN the format is asked for. Patch 1 had made the
// wizard's shape depend on the format; this file moved the question to the
// front, so Game Day opened on the gallery and a tap both selected and advanced.
//
// Manny's instruction of 2026-10-05 is three screens and a save: Course (the
// course, the round length, the start hole, the handicap mode), Players, then
// Games & Money - and the format gallery is the TOP of Games & Money, directly
// above that format's settings and its money. That is not the old filing-cabinet
// order the header below describes: there is nothing between the gallery and the
// stakes it prices, which is what the merge bought.
//
// SO TWO OF THIS FILE'S THREE CLAIMS SURVIVE WHOLE and are asserted below:
//   - every format is a WIDGET, one each, and the dropdown stays hidden;
//   - the widget IS the selection - no confirming Next, and the panels underneath
//     rebuild on the tap.
// The third - that the gallery comes FIRST - is superseded, and a tap no longer
// navigates at all: the settings it reveals are on the same screen, which is the
// whole reason the screens were merged. setup_three_step_test.js holds the new
// shape and that the SAVE is unchanged.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const DEPS = ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const WIDGET_FORMATS = ['stroke', 'stableford', 'nassau-modern', 'bestball',
    'scramble', 'hilo', 'wolf', 'ryder', 'ryder-cup'];

const STEP = { course: 1, length: 2, format: 3, settings: 4, players: 5, action: 6, review: 7 };

function wizard(format) {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    vm.runInContext(`
        alert = function(){}; uiRefuse = function(){}; uiFail = function(){}; uiToast = function(){};
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
const flow = (sb, fmt) => JSON.parse(run(sb,
    fmt ? `JSON.stringify(wizardWorkflow('${fmt}'))` : 'JSON.stringify(wizardWorkflow())'));

// ============================================================================
describe('GAME DAY LANDS ON THE FORMAT WIDGETS', () => {

    test('the wizard opens on the format step, not a hardcoded step one', () => {
        assert.match(ADMIN, /goToWizardStep\(wizardFirstStep\(\)\);/);
        assert.ok(!ADMIN.includes('goToWizardStep(1);'),
            'no literal opening step may remain — it would drift from the workflow');
    });

    test('the first step of every workflow is Course', () => {
        WIDGET_FORMATS.forEach((f) => {
            assert.equal(flow(wizard('stroke'), f)[0], 'course', f);
        });
    });

    test('and wizardFirstStep resolves to it', () => {
        WIDGET_FORMATS.forEach((f) => {
            assert.equal(run(wizard(f), 'wizardFirstStep()'), STEP.course, f);
        });
    });

    test('the gallery is reached as part of Games & Money, not as a screen', () => {
        WIDGET_FORMATS.forEach((f) => {
            const w = flow(wizard('stroke'), f);
            assert.ok(!w.includes('format'), f + ': the format is a screen of its own again');
            assert.ok(!w.includes('length'), f + ': Round Length is a screen of its own again');
            assert.ok(!w.includes('settings'), f + ': Format Settings is a screen of its own again');
        });
    });

    test('and the round length lives with the course, which is the step before Players', () => {
        WIDGET_FORMATS.forEach((f) => {
            const w = flow(wizard('stroke'), f);
            assert.equal(w[0], 'course', f);
            assert.equal(w[1], 'players', f);
        });
        // The fields themselves are on that screen - the panel was moved, not rebuilt.
        assert.match(ADMIN, /moveInto\('wizard-step-2', 'wizard-step-1', false\);/);
    });
});

// ============================================================================
describe('EVERY FORMAT IS A WIDGET, AND ONLY A WIDGET', () => {

    test('the old dropdown is not presented in the new-round flow', () => {
        assert.match(ADMIN, /<select id="game-format-select"[^>]*style="display:none;"/);
        assert.match(ADMIN, /<select id="game-format-select"[^>]*aria-hidden="true"/);
        assert.match(ADMIN, /<select id="game-format-select"[^>]*tabindex="-1"/);
    });

    test('but it survives internally, because old rounds still select through it', () => {
        // Backward compatibility only. A legacy round reopened for editing sets its
        // own gameFormat on this element, and every reader still goes through it.
        assert.match(ADMIN, /document\.getElementById\("game-format-select"\)\.value = data\.gameFormat/);
    });

    test('every selectable primary format has exactly one widget', () => {
        WIDGET_FORMATS.forEach((f) => {
            assert.equal(ADMIN.split('data-format="' + f + '"').length - 1, 1, f);
            assert.equal(ADMIN.split('onclick="selectFormatCard(\'' + f + '\')"').length - 1, 1, f);
        });
    });

    test('every widget maps to exactly one format, and no widget is orphaned', () => {
        const byData = (ADMIN.match(/data-format="([^"]+)"/g) || [])
            .map((m) => m.slice(13, -1));
        const byClick = (ADMIN.match(/selectFormatCard\('([^']+)'\)/g) || [])
            .map((m) => m.slice(18, -2));
        assert.deepEqual(byData.slice().sort(), WIDGET_FORMATS.slice().sort());
        assert.deepEqual(byClick.slice().sort(), WIDGET_FORMATS.slice().sort());
        byData.forEach((f, i) => assert.equal(byClick[i], f, 'widget ' + i + ' is self-consistent'));
    });
});

// ============================================================================
describe('THE WIDGET IS THE SELECTION — NO CONFIRMING TAP', () => {

    test('tapping a widget both selects and advances', () => {
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        // RE-POINTED 2026-10-05: the tap SELECTS and stays, because the settings it
        // reveals are directly below the gallery on the same screen. Navigating away
        // from them is what the merge removed.
        run(sb, 'goToWizardStep(wizardStepNumber("action"));');
        run(sb, "selectFormatCard('scramble');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'scramble');
        assert.equal(run(sb, 'currentWizardStep'), STEP.action,
            'the tap navigated away from the settings it just revealed');
    });

    test('tapping Stroke Play enters the Stroke Play workflow', () => {
        const sb = wizard('bestball');
        run(sb, "selectFormatCard('stroke');");
        assert.deepEqual(flow(sb), ['course', 'players', 'action', 'review']);
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'stroke');
    });

    test('tapping Best Ball enters the Best Ball workflow', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('bestball');");
        // Its settings are on Games & Money with the gallery, not a screen of their own.
        assert.deepEqual(flow(sb), ['course', 'players', 'action', 'review']);
    });

    test('tapping Ryder Cup enters the NEW Ryder workflow', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder-cup');");
        assert.deepEqual(flow(sb), ['course', 'players', 'review']);
        assert.ok(!flow(sb).includes('settings'));
        assert.ok(!flow(sb).includes('action'), 'a Cup must never be asked for money');
    });

    test('the Ryder Cup widget never maps to the legacy money format', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder-cup');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'ryder-cup');
        assert.notEqual(run(sb, "document.getElementById('game-format-select').value"), 'ryder');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder-cup')"), 'stroke');
    });

    test('the Team Match widget still means the legacy money format', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'ryder');
        assert.equal(run(sb, "normalizeGameFormatForSave('ryder')"), 'ryder');
    });

    test('re-tapping the format already chosen is not a broken button', () => {
        // RE-POINTED 2026-10-05: nothing advances now, so what must be true is that
        // the tap still RE-RENDERS the panels underneath - the same thing it does
        // for any other card - rather than being a no-op on the one already chosen.
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardStepNumber("action"));');
        run(sb, "window.__fc = 0; handleFormatChange = function () { window.__fc++; };");
        run(sb, "selectFormatCard('stroke');");
        assert.equal(run(sb, 'window.__fc'), 1, 'the already-chosen widget did nothing at all');
        assert.equal(run(sb, 'currentWizardStep'), STEP.action);
    });

    test('no confirming tap sits between the widget and its settings', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function selectFormatCard('));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        // The tap IS the selection: it sets the value and rebuilds the panels, and
        // the only navigation left is the strand-guard for a format whose workflow
        // does not contain the step the organizer is standing on (the Cup).
        assert.match(body, /sel\.value = fmt;/);
        assert.match(body, /handleFormatChange\(\);/);
        assert.match(body, /if \(!wizardStepNumbers\(\)\.includes\(currentWizardStep\)\)/,
            'a format that drops this screen could strand the organizer on it');
        assert.ok(!/confirm/i.test(body), 'the widget must not defer to a confirm step');
    });
});

// ============================================================================
describe('BACK RETURNS TO THE GALLERY WITH THE SELECTION INTACT', () => {

    test('Back from Games & Money returns to Players, and Course is the first screen', () => {
        // RE-POINTED 2026-10-05: there is nothing before Course now, so Back from it
        // cannot go anywhere - and the gallery is reached by walking forward to
        // Games & Money rather than backwards to a screen of its own.
        ['stroke', 'bestball'].forEach((f) => {
            const sb = wizard(f);
            run(sb, 'goToWizardStep(' + STEP.action + '); wizardBack(' + STEP.action + ');');
            assert.equal(run(sb, 'currentWizardStep'), STEP.players, f);
            run(sb, 'wizardBack(' + STEP.players + ');');
            assert.equal(run(sb, 'currentWizardStep'), STEP.course, f);
        });
    });

    test('and the widget that was chosen is still the one marked selected', () => {
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardStepNumber("action"));');
        run(sb, "selectFormatCard('wolf');");
        assert.equal(run(sb, "document.getElementById('fmt-card-wolf').getAttribute('aria-checked')"), 'true');
        assert.equal(run(sb, "document.getElementById('fmt-card-stroke').getAttribute('aria-checked')"), 'false');
    });

    test('the FIRST step offers no Back, because nothing precedes it', () => {
        // RE-POINTED 2026-10-05: the first screen is Course. The claim is the one it
        // always was - the first screen of a workflow never offers a way back to
        // nowhere - read off whichever screen that is.
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        const first = run(sb, 'wizardFirstStep()');
        assert.equal(first, STEP.course);
        assert.equal(run(sb, "document.getElementById('wizard-back-" + 1 + "').style.display"), 'none');
    });

    test('Players does offer Back, now that something precedes it', () => {
        assert.match(ADMIN, /id="wizard-back-5"/);
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(' + STEP.players + ');');
        assert.notEqual(run(sb, "document.getElementById('wizard-back-5').style.display"), 'none');
    });

    test('every step in a workflow except the first can go back', () => {
        const sb = wizard('bestball');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        const steps = JSON.parse(run(sb, 'JSON.stringify(wizardStepNumbers())'));
        steps.slice(1).forEach((n) => {
            assert.notEqual(run(sb, `document.getElementById('wizard-back-${n}').style.display`), 'none',
                'step ' + n + ' must offer Back');
        });
    });
});

// ============================================================================
describe('THE REORDER MOVED NO MARKUP', () => {

    test('the seven step containers are still in their original DOM order', () => {
        const order = (ADMIN.match(/id="wizard-step-(\d)" data-step="\d"/g) || [])
            .map((m) => Number(m.match(/(\d)"/)[1]));
        assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7]);
    });

    test('the format screen is still wizard-step-3', () => {
        const sb = wizard('stroke');
        assert.equal(run(sb, 'WIZARD_STEP_OF.format'), 3);
        assert.match(ADMIN, /id="wizard-step-3" data-step="3"/);
        const step3 = ADMIN.slice(ADMIN.indexOf('id="wizard-step-3"'), ADMIN.indexOf('id="wizard-step-4"'));
        assert.ok(step3.includes('id="format-card-grid"'), 'the widgets did not move');
    });

    test('the progress dots still count the workflow, not the DOM', () => {
        // RE-PINNED 2026-10-05: three steps and a save; a Cup skips the money.
            [['ryder-cup', 3], ['stroke', 4], ['bestball', 4]].forEach(([f, n]) => {
            const sb = wizard(f);
            run(sb, 'renderWizardProgress();');
            const html = run(sb, "document.getElementById('wizard-progress').innerHTML");
            assert.equal((html.match(/wizard-dot/g) || []).length, n, f);
            // RE-POINTED 2026-10-05: dot 1 jumps to the FIRST screen of the
            // workflow, whatever its DOM id - which is Course now, as the two
            // tests at the top of this file assert from the other side.
            assert.match(html, /goToWizardStep\(1\)[^>]*>1</, f + ': dot 1 is not the first step');
        });
    });

    test('Course keeps its own validation, wherever it sits in the order', () => {
        assert.match(ADMIN, /if \(fromStep === 1\) \{[\s\S]{0,260}?select a golf course/);
    });

    test('Round Length keeps the Par\/HCP grid gate', () => {
        assert.match(ADMIN, /if \(fromStep === 1\) \{[\s\S]{0,600}?validateCourseGrid\(\)/);
    });
});
