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

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const WIDGET_FORMATS = ['stroke', 'stableford', 'nassau-modern', 'bestball',
    'scramble', 'hilo', 'wolf', 'ryder', 'ryder-cup'];

const STEP = { course: 1, length: 2, format: 3, settings: 4, players: 5, action: 6, review: 7 };

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
const flow = (sb, fmt) => JSON.parse(run(sb,
    fmt ? `JSON.stringify(wizardWorkflow('${fmt}'))` : 'JSON.stringify(wizardWorkflow())'));

// ============================================================================
describe('GAME DAY LANDS ON THE FORMAT WIDGETS', () => {

    test('the wizard opens on the format step, not a hardcoded step one', () => {
        assert.match(ADMIN, /goToWizardStep\(wizardFirstStep\(\)\);/);
        assert.ok(!ADMIN.includes('goToWizardStep(1);'),
            'no literal opening step may remain — it would drift from the workflow');
    });

    test('the first step of every workflow is Format', () => {
        WIDGET_FORMATS.forEach((f) => {
            assert.equal(flow(wizard('stroke'), f)[0], 'format', f);
        });
    });

    test('and wizardFirstStep resolves to the format screen', () => {
        WIDGET_FORMATS.forEach((f) => {
            assert.equal(run(wizard(f), 'wizardFirstStep()'), STEP.format, f);
        });
    });

    test('Course is NOT the first screen', () => {
        WIDGET_FORMATS.forEach((f) => {
            const w = flow(wizard('stroke'), f);
            assert.notEqual(w[0], 'course', f);
            assert.ok(w.indexOf('course') > w.indexOf('format'), f + ': course follows format');
        });
    });

    test('Round Length is NOT the first screen', () => {
        WIDGET_FORMATS.forEach((f) => {
            const w = flow(wizard('stroke'), f);
            assert.notEqual(w[0], 'length', f);
            assert.ok(w.indexOf('length') > w.indexOf('format'), f + ': length follows format');
        });
    });

    test('Course and Round Length keep their order relative to each other', () => {
        WIDGET_FORMATS.forEach((f) => {
            const w = flow(wizard('stroke'), f);
            assert.ok(w.indexOf('length') === w.indexOf('course') + 1, f);
        });
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
        assert.equal(run(sb, 'currentWizardStep'), STEP.format);
        run(sb, "selectFormatCard('scramble');");
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'scramble');
        assert.notEqual(run(sb, 'currentWizardStep'), STEP.format,
            'the golfer must not still be sitting on the gallery');
        assert.equal(run(sb, 'currentWizardStep'), STEP.course);
    });

    test('tapping Stroke Play enters the Stroke Play workflow', () => {
        const sb = wizard('bestball');
        run(sb, "selectFormatCard('stroke');");
        assert.deepEqual(flow(sb), ['format', 'course', 'length', 'players', 'action', 'review']);
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'stroke');
    });

    test('tapping Best Ball enters the Best Ball workflow', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('bestball');");
        assert.deepEqual(flow(sb),
            ['format', 'course', 'length', 'settings', 'players', 'action', 'review']);
    });

    test('tapping Ryder Cup enters the NEW Ryder workflow', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('ryder-cup');");
        assert.deepEqual(flow(sb), ['format', 'course', 'length', 'players', 'review']);
        assert.ok(!flow(sb).includes('settings'));
        assert.ok(!flow(sb).includes('action'));
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

    test('re-tapping the format already chosen still advances', () => {
        // Otherwise the one widget already showing as selected is the only one that
        // does nothing, which reads as a broken button.
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        run(sb, "selectFormatCard('stroke');");
        assert.equal(run(sb, 'currentWizardStep'), STEP.course);
    });

    test('no extra Next tap sits between the widget and the next step', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function selectFormatCard('));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        assert.match(body, /goToWizardStep\(wizardNeighbourStep\(WIZARD_STEP_OF\.format, 1\)\)/);
        assert.ok(!/confirm|Next/i.test(body), 'the widget must not defer to a confirm step');
    });
});

// ============================================================================
describe('BACK RETURNS TO THE GALLERY WITH THE SELECTION INTACT', () => {

    test('Back from Course returns to the format widgets', () => {
        ['stroke', 'bestball', 'ryder-cup'].forEach((f) => {
            const sb = wizard(f);
            run(sb, 'goToWizardStep(' + STEP.course + '); wizardBack(' + STEP.course + ');');
            assert.equal(run(sb, 'currentWizardStep'), STEP.format, f);
        });
    });

    test('and the widget that was chosen is still the one marked selected', () => {
        const sb = wizard('stroke');
        run(sb, "selectFormatCard('wolf'); wizardBack(" + STEP.course + ");");
        assert.equal(run(sb, 'currentWizardStep'), STEP.format);
        assert.equal(run(sb, "document.getElementById('fmt-card-wolf').getAttribute('aria-checked')"), 'true');
        assert.equal(run(sb, "document.getElementById('fmt-card-stroke').getAttribute('aria-checked')"), 'false');
    });

    test('the format step offers no Back, because nothing precedes it', () => {
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(wizardFirstStep());');
        assert.equal(run(sb, "document.getElementById('wizard-back-3').style.display"), 'none');
    });

    test('Course does offer Back, now that something precedes it', () => {
        assert.match(ADMIN, /id="wizard-back-1"/);
        const sb = wizard('stroke');
        run(sb, 'goToWizardStep(' + STEP.course + ');');
        assert.notEqual(run(sb, "document.getElementById('wizard-back-1').style.display"), 'none');
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
        [['ryder-cup', 5], ['stroke', 6], ['bestball', 7]].forEach(([f, n]) => {
            const sb = wizard(f);
            run(sb, 'renderWizardProgress();');
            const html = run(sb, "document.getElementById('wizard-progress').innerHTML");
            assert.equal((html.match(/wizard-dot/g) || []).length, n, f);
            // Dot 1 must jump to the format screen, whatever its DOM id.
            assert.match(html, /goToWizardStep\(3\)[^>]*>1</, f + ': dot 1 is the format step');
        });
    });

    test('Course keeps its own validation, wherever it sits in the order', () => {
        assert.match(ADMIN, /if \(fromStep === 1\) \{[\s\S]{0,260}?select a golf course/);
    });

    test('Round Length keeps the Par\/HCP grid gate', () => {
        assert.match(ADMIN, /if \(fromStep === 2\) \{[\s\S]{0,300}?validateCourseGrid\(\)/);
    });
});
