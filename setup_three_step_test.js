// ============================================================================
// THREE STEPS AND A SAVE, AND A ROUND THAT COPIES ITSELF (2026-10-05, STRICT)
//
// TWO CLAIMS, and both are about data rather than screens:
//
//   1. THE SHAPE CHANGED AND THE SAVE DID NOT. The wizard was seven screens -
//      Format, Course, Round Length, Format Settings, Players, Games & Money,
//      Review - and is now Course / Players / Games & Money / Review. Not one
//      field moved file: buildThreeStepWizard() moves the existing BLOCKS as
//      nodes, so every input keeps its id, its handler and the function that
//      reads it, and saveSettings() reads exactly what it always read.
//
//   2. "SAME AS LAST WEEK" COPIES SETUP, NOT A ROUND. It reuses ?copyFrom= -
//      the path the lobby's code field has always used - with the code this
//      device last saved, and lands on Players. A copied round must carry the
//      course, the length, the start hole, the handicap mode, the format, the
//      games, the money, the roster, the flights and the groups, and must NOT
//      carry scores, bets, challenges or KP answers.
//
// WHY THE PAYLOAD IS THE SUBJECT. A screen test would pass on a wizard that
// looked right and saved the wrong thing, which is the only failure here that
// costs money. helpers/wizard-saved-round.js already pins the payload's keys IN
// ORDER against saveSettings; this file holds the VALUES across both changes.
//
// BASELINE, measured over the FINISHED file against main (2410272, admin.html
// swapped out and restored by sha), all 10 tests: 4 PASS / 6 FAIL. 4 + 6 = 10.
//   The four that pass describe what was already true and is deliberately kept
//   that way: the payload's keys are unchanged (it is the same save), a copied
//   round has always been a new code with the source left untouched, the copy has
//   always been pre-filled rather than written on arrival, and the round-scoped
//   records were never in the payload for a copy to carry. Those four are in this
//   file precisely because they are the claims a restructure would break quietly.
//   The six reds are the three-step workflow, the mover, the validation that
//   followed the fields, and all three halves of Same as last week.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { PAYLOAD_KEYS } = require('./helpers/wizard-saved-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const run = (sb, e) => vm.runInContext(e, sb);

describe('1. THE WIZARD IS THREE STEPS AND A SAVE', () => {

    test('the workflow is Course, Players, Games & Money, Review', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?fresh=1' });
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('stroke'))")),
            ['course', 'players', 'action', 'review']);
        // A format WITH settings does not get a fourth screen for them any more -
        // the panel is on Games & Money, above the money.
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('bestball'))")),
            ['course', 'players', 'action', 'review']);
        // And the Cup still never meets the money.
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('ryder-cup'))")),
            ['course', 'players', 'review']);
    });

    test('the blocks are MOVED, so every field keeps its id', () => {
        // One element per id, in the page, after the move: a copy would be two
        // elements with one id and saveSettings would read whichever came first.
        ['course-search-input', 'round-length-select', 'tee-start-select',
         'handicap-basis-select', 'game-format-select', 'enable-custom-course',
         'paste-players-textarea'].forEach(id => {
            assert.equal((ADMIN.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
                id + ' appears more than once');
        });
        const fn = ADMIN.slice(ADMIN.indexOf('function buildThreeStepWizard()'),
                               ADMIN.indexOf('\n    function ', ADMIN.indexOf('function buildThreeStepWizard()') + 10));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /insertBefore\(el, before\)/, 'it rebuilds markup instead of moving nodes');
        assert.ok(!/innerHTML/.test(fn), 'it rebuilds markup instead of moving nodes');
        assert.match(ADMIN, /buildThreeStepWizard\(\);\s*\n\s*syncFormatCards\(\);/,
            'the move does not run before the first render');
    });

    test('and the validation followed the fields onto their new screens', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function wizardNext(fromStep)'),
                               ADMIN.indexOf('\n    function ', ADMIN.indexOf('function wizardNext(fromStep)') + 10));
        assert.ok(fn.length > 300, 'the slice is empty - the endpoint drifted');
        // Course AND the Par/HCP grid are both step 1 now.
        assert.match(fn, /if \(fromStep === 1\)/);
        assert.match(fn, /course-search-input/);
        assert.match(fn, /validateCourseGrid\(\)/);
        // The format gallery is on Games & Money, which is step 6.
        assert.match(fn, /if \(fromStep === 6\)[\s\S]{0,200}game-format-select/);
        assert.ok(!/fromStep === 2|fromStep === 3/.test(fn),
            'a refusal is still asked for on a screen that no longer exists');
    });

    test('THE SAVE IS THE SAME SAVE: the payload keys, in order, are untouched', () => {
        // helpers/wizard-saved-round.js is the fixture every arrival test uses and
        // it pins saveSettings' payload key-for-key, in order. If the three-step
        // wizard had dropped, renamed or reordered a field, this is where it shows -
        // and persistence_contract_test.js fails for the same reason.
        const payload = ADMIN.slice(ADMIN.indexOf('const payload = {'),
                                    ADMIN.indexOf('};', ADMIN.indexOf('const payload = {')));
        const keys = [...payload.matchAll(/^\s{16}([a-zA-Z]+):/gm)].map(m => m[1]);
        PAYLOAD_KEYS.forEach(k => assert.ok(keys.includes(k) || payload.includes(k + ':'),
            k + ' left the payload with the three-step wizard'));
        assert.ok(keys.length >= 30, 'the payload shrank to ' + keys.length + ' keys');
    });
});

describe('2. SAME AS LAST WEEK', () => {

    test('the button exists, and is hidden until there IS a last week', () => {
        assert.match(ADMIN, /id="same-as-last-week"/, 'there is no button');
        assert.match(ADMIN, /id="same-as-last-week"[^>]*style="display:none/,
            'it ships visible, so a first-time organizer is offered a copy of nothing');
        assert.match(ADMIN, /onclick="sameAsLastWeek\(this\)"/);
        const sync = ADMIN.slice(ADMIN.indexOf('function syncSameAsLastWeek()'),
                                 ADMIN.indexOf('\n    async function sameAsLastWeek'));
        assert.ok(sync.length > 150, 'the slice is empty - the endpoint drifted');
        assert.match(sync, /btn\.style\.display = code \? 'block' : 'none';/,
            'the button does not follow whether a round exists');
    });

    test('it reuses the ONE copier rather than writing a second', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('async function sameAsLastWeek(pressedEl)'),
                               ADMIN.indexOf('async function startFromPreviousRound'));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /startFromPreviousRound\(pressedEl, \{ step: 'players' \}\)/,
            'it does not go through the existing copier');
        // NO SECOND COPY PATH: it must not mint a code or write a round itself.
        assert.ok(!/issueUniqueCode|db\.ref\(|\.set\(|\.update\(/.test(fn),
            'it creates a round of its own instead of reusing the copier');
        assert.match(fn, /localStorage|lastWeekCode\(\)/, 'it does not read the last round');
    });

    test('and it lands on Players, because that is the only question left', () => {
        assert.match(ADMIN, /if \(opts && opts\.step\) dest \+= `&step=\$\{encodeURIComponent\(opts\.step\)\}`;/,
            'the copier cannot be asked for a landing step');
        assert.match(ADMIN, /if \(urlParams\.get\('step'\) === 'players'\) \{\s*goToWizardStep\(wizardStepNumber\('players'\)\);/,
            'the arrival ignores the step it was sent to');
    });
});

describe('3. WHAT A COPY CARRIES, AND WHAT IT MUST NOT', () => {

    // THE COPY IS ?copyFrom=, and what it does is load the SOURCE's setup into a
    // brand-new round that has not been saved yet. So the question "what comes
    // across" is answered by what loadModeData restores - which is the same list
    // persistence_contract_test.js holds against the payload.
    test('a copied round is pre-filled from the source and saved only on Save', () => {
        const arrival = ADMIN.slice(ADMIN.indexOf('if (copyFromCode) {', ADMIN.indexOf('readWithTimeout(db.ref(`events/${currentMode}`)')),
                                    ADMIN.indexOf('} else {', ADMIN.indexOf('readWithTimeout(db.ref(`events/${currentMode}`)')));
        assert.ok(arrival.length > 100, 'the slice is empty - the endpoint drifted');
        assert.match(arrival, /loadModeData\(copyFromCode\)/,
            'the copy no longer reads the source round');
        // NOTHING IS WRITTEN ON ARRIVAL. The new round exists only once the
        // organizer taps Save, which is what keeps a copy from carrying a round.
        assert.ok(!/\.set\(|\.update\(/.test(arrival),
            'the copy writes the new round before the organizer has seen it');
    });

    test('SCORES, BETS, CHALLENGES AND KP ANSWERS CANNOT COME ACROSS', () => {
        // loadModeData restores SETUP. The round-scoped records - what was played
        // and what was wagered - are not in the payload at all, so there is nothing
        // for a copy to carry: the fixture's own key list is the proof.
        ['scores', 'sideMatches', 'challenges', 'kpGroupAnswers', 'dots', 'matchPresses']
            .forEach(k => assert.ok(!PAYLOAD_KEYS.includes(k),
                k + ' is in the saved payload, so a copied round would carry it'));
        // And the setup the copy IS for is in there.
        ['activeCourseKey', 'courseName', 'courseData', 'startingHole', 'handicapBasis',
         'gameFormat', 'moneyPool', 'additionalGames', 'groupSizeOverrides', 'flights', 'players']
            .forEach(k => assert.ok(PAYLOAD_KEYS.includes(k), k + ' is not carried by a copy'));
    });

    test('the new round is a NEW code, and the old one is untouched', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('async function startFromPreviousRound'),
                               ADMIN.indexOf('function reportCodeIssueFailure'));
        assert.match(fn, /const newCode = await issueUniqueCode\(\{ db, root: 'events' \}\)/,
            'the copy does not mint its own code');
        assert.match(fn, /copyFrom=\$\{code\}/, 'the destination does not name the source');
        // The source is READ and never written.
        assert.ok(!/db\.ref\('events\/' \+ code\)\.(set|update|remove)/.test(fn),
            'the copier writes to the round it is copying FROM');
    });
});
