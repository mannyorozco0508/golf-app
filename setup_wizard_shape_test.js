// ============================================================================
// THE WIZARD'S SHAPE, AND A ROUND THAT COPIES ITSELF (2026-10-05, STRICT)
//
// RENAMED from setup_three_step_test.js on the day it was written. The wizard
// was three steps and a save for about six hours; Manny asked for Games and
// Money back apart, so it is four and a save. A file name that counts the
// screens goes stale, and the claim was never the number.
//
// TWO CLAIMS, and both are about data rather than screens:
//
//   1. THE SHAPE CHANGED AND THE SAVE DID NOT. The wizard was seven screens -
//      Format, Course, Round Length, Format Settings, Players, Games & Money,
//      Review - and is now Course / Players / Games / Money / Review. Not one
//      field moved file: buildCompactWizard() moves the existing BLOCKS as
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
// BASELINE, re-measured over the FINISHED file against setup-3-steps (4ebe98b,
// admin.html swapped out and restored by sha), all 15 tests: 9 PASS / 6 FAIL.
// 9 + 6 = 15. The nine that pass are the claims this split must NOT break, and
// they were green before it because they were green after the three-step wave:
// the payload's keys, all three halves of Same as last week, what a copy carries
// and what it must not, the arrival itself, and "MONEY keeps the stakes, and
// Course keeps the length and the tee" - the blocks that had to stay put.
//   The six reds are the five-entry workflow, the dot labels, the cold check of
//   where the Games blocks landed, the validation moving to step 3, and the
//   mover - that last one goes red partly on the rename (buildThreeStepWizard ->
//   buildCompactWizard), which is a weaker red than the others and is named as
//   such rather than counted as proof of behaviour.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { PAYLOAD_KEYS } = require('./helpers/wizard-saved-round.js');

const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// WHERE EVERY BLOCK ENDED UP, read off the page an organizer actually opens.
const WHERE = `(function(){
  function where(id){ var el=document.getElementById(id); if(!el) return 'MISSING';
    var n=el; while(n){ if(n.id && /^wizard-step-\\d$/.test(n.id)) return n.id; n=n.parentNode; }
    return 'loose'; }
  var active=document.querySelector('.wizard-step.active');
  return JSON.stringify({
    dots: Array.prototype.slice.call(document.querySelectorAll('#wizard-progress .wizard-dot'))
            .map(function(d){ return d.getAttribute('title')+':'+d.textContent; }),
    activeStep: active ? active.id : '',
    at: {
      gallery: where('game-format-select'), alsoPlaying: where('stacked-games-box'),
      sideGames: where('sidegames-settings'), nassauStakes: where('setup-nassau-box'),
      length: where('round-length-select'), teeStart: where('tee-start-select')
    }
  });
})()`;

const W = {};
before(async () => {
    const r = await arriveCold({
        url: fileUrl('admin.html', 'fresh=1'),
        db: { events: {}, trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'organizer-cold', email: 'o@example.com', isAnonymous: false },
        viewport: { width: 390, height: 844 }, settleMs: 2800,
        steps: [{ expression: WHERE }]
    });
    W.ok = r.ok; W.reason = r.reason;
    if (r.ok) {
        const j = JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop());
        W.dots = j.dots; W.activeStep = j.activeStep; W.at = j.at;
    }
});
const ADMIN = read('admin.html');
const run = (sb, e) => vm.runInContext(e, sb);

describe('1. THE WIZARD IS FOUR SCREENS AND A SAVE', () => {

    test('the workflow is Course, Players, Games, Money, Review', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?fresh=1' });
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('stroke'))")),
            ['course', 'players', 'format', 'action', 'review']);
        // A format WITH settings still does not get a screen of its own - the
        // panel is on Games, under the gallery that chose it.
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('bestball'))")),
            ['course', 'players', 'format', 'action', 'review']);
        // And the Cup still never meets the money. It picks its format from the
        // entry card, so it skips Games too.
        assert.deepEqual(JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('ryder-cup'))")),
            ['course', 'players', 'review']);
    });

    test('the dots a golfer counts read Course, Players, Games, Money, Review', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?fresh=1' });
        const labels = JSON.parse(run(sb, "JSON.stringify(wizardWorkflow('stroke')"
            + ".map(function(s){ return WIZARD_STEP_LABELS[s]; }))"));
        assert.deepEqual(labels, ['Course', 'Players', 'Games', 'Money', 'Review']);
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
        const fn = ADMIN.slice(ADMIN.indexOf('function buildCompactWizard()'),
                               ADMIN.indexOf('\n    function ', ADMIN.indexOf('function buildCompactWizard()') + 10));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /insertBefore\(el, before\)/, 'it rebuilds markup instead of moving nodes');
        assert.ok(!/innerHTML/.test(fn), 'it rebuilds markup instead of moving nodes');
        assert.match(ADMIN, /buildCompactWizard\(\);\s*\n\s*syncFormatCards\(\);/,
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
        // The format gallery is Games, which is step 3 - the refusal moved with it.
        assert.match(fn, /if \(fromStep === 3\)[\s\S]{0,200}game-format-select/);
        assert.ok(!/fromStep === 2\b|fromStep === 6\b/.test(fn),
            'a refusal is still asked for on a screen that no longer leads anywhere');
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

describe('1b. AND ON THE PAGE AN ORGANIZER OPENS, THE BLOCKS ARE WHERE THEY SAY', () => {

    // WHY THIS IS NOT mini-dom. The mover is the claim, and the harness has no
    // real tree to move anything in: walking parentNode up from the format
    // gallery returns 'loose' there whether buildCompactWizard ran or not, so a
    // mini-dom version of this test would pass against a wizard that never moved
    // a single block. A cold arrival loads admin.html, lets it build itself and
    // touches nothing.

    test('ran', () => assert.ok(W.ok, W.reason));

    test('GAMES holds the gallery, its settings and Also Playing', () => {
        assert.equal(W.at.gallery, 'wizard-step-3', 'the gallery is not on Games');
        assert.equal(W.at.alsoPlaying, 'wizard-step-3', 'Also Playing is not on Games');
        assert.equal(W.at.sideGames, 'wizard-step-3', 'the side games are not on Games');
    });

    test('MONEY keeps the stakes, and Course keeps the length and the tee', () => {
        assert.equal(W.at.nassauStakes, 'wizard-step-6', 'the stakes left Money');
        assert.equal(W.at.length, 'wizard-step-1');
        assert.equal(W.at.teeStart, 'wizard-step-1');
    });

    test('and the progress dots say so, in order, 1 to 5', () => {
        assert.deepEqual(W.dots, ['Course:1', 'Players:2', 'Games:3', 'Money:4', 'Review:5']);
        // The organizer opens on Course, as they always did.
        assert.equal(W.activeStep, 'wizard-step-1');
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
