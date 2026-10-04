// ============================================================================
// THE PLAYERS STEP, ON A PHONE (2026-10-04)
//
// Manny opened Step 5 on his iPhone and the player boxes were most of a screen
// down, under a list that said the same thing once per golfer:
//
//     Randy T: Index 0 · no tee rating, used as Playing Handicap
//     Marty: Index 9 · no tee rating, used as Playing Handicap
//     ... twenty-two more
//
// Every line restated a number already visible in the box beside the name, and
// on a full field they pushed the thing the step is FOR off the bottom.
//
// AND THE WORDS CONTRADICTED EACH OTHER on a Strokes round - which is the DEFAULT
// for a new round. The subtitle said "Handicap Index", the column head said
// "Strokes" (handicap-labels.js, correctly), and the note said "used as entered".
// Three names for one box on one screen; a golfer typing 11 into a box labelled
// Index has been told the app will convert it, and on a Strokes round it will not.
//
// WHAT THIS FILE HOLDS:
//   1. no per-golfer list, ever - one line at most, and none of it per player;
//   2. the mode's name comes from handicap-labels.js, so the subtitle, the column
//      head, the placeholder and the note cannot disagree;
//   3. a Strokes round never says Index, and a GHIN round still explains itself;
//   4. after a paste, the page lands on the golfers that just arrived.
//
// BASELINE. Against a098fa1, over the FINISHED file, all 8 tests: 3 PASS / 5
// FAIL. admin.html was restored by sha from a saved copy (23d1a7f0f38d9b46),
// never with git restore.
//
//   THE THREE PASSES, and one of them is a warning about itself:
//     - the column head, which already came from handicap-labels.js: it was the
//       only one of the four surfaces that was right, which is why the
//       contradiction was visible at all;
//     - the GHIN round's unrated-tee sentence, which the old builder also
//       produced;
//     - and "ONE LINE, MEASURED", WHICH IS VACUOUS UNDER mini-dom. The old
//       builder skipped any row whose handicap box was empty, and a value set
//       through a static attribute is invisible to this harness (CLAUDE.md
//       records that limit), so the wall never rendered here to begin with. The
//       assertion that actually holds the rule is the SOURCE one above it: the
//       builder cannot walk the rows. Said plainly rather than left looking like
//       evidence.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ADMIN = read('admin.html');

// The Players step's own markup, bounded by the next step so the slice cannot
// quietly swallow the rest of the wizard.
function playersStep() {
    const at = ADMIN.indexOf('id="wizard-step-5"');
    assert.ok(at > 0, 'the Players step is gone');
    const end = ADMIN.indexOf('id="wizard-step-6"', at);
    const slice = ADMIN.slice(at, end > at ? end : at + 12000);
    assert.ok(/id="player-list"/.test(slice), 'the slice does not contain the player list');
    return slice;
}

function arrive() {
    const sb = loadHtmlInlineScript('admin.html',
        ['handicap.js', 'handicap-labels.js', 'match-engine.js', 'money-engine.js',
         'action-model.js', 'course-data.js', 'grouping.js', 'my-groups.js', 'roster-paste.js']);
    vm.runInContext('alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; uiToast = function () {};', sb);
    return sb;
}
const noteText = (sb) => vm.runInContext("document.getElementById('handicap-index-note').textContent", sb);

describe('1. ONE LINE AT MOST, NEVER ONE PER GOLFER', () => {

    test('the note builder cannot loop over the roster', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function refreshHandicapNote()'),
                               ADMIN.indexOf('function handleCourseChange()'));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        assert.ok(!/player-list .player-row|querySelectorAll\('#player-list/.test(fn),
            'it walks the rows again - that is the wall this removed');
        assert.ok(!/lines\.push|\.join\('\\n'\)/.test(fn), 'it still builds a list');
        assert.ok(!/no tee rating, used as Playing Handicap/.test(fn),
            'the per-golfer sentence is back');
    });

    test('and the note element is not a multi-line block any more', () => {
        const step = playersStep();
        const tag = step.slice(step.indexOf('<p id="handicap-index-note"'),
                               step.indexOf('>', step.indexOf('<p id="handicap-index-note"')) + 1);
        assert.ok(tag.length > 20, 'the note element is gone entirely');
        assert.ok(!/white-space:\s*pre-line/.test(tag),
            'it is still laid out for a list of lines');
    });

    // READ THE BASELINE NOTE: under mini-dom the OLD builder produced no lines
    // either, because a handicap set through a static attribute is invisible to
    // this harness. This test is the rendered half of a rule whose teeth are in
    // the source test above; it would catch a NEW builder that names golfers from
    // the model rather than the DOM, and it did not catch the one that existed.
    test('ONE LINE, MEASURED: a full field adds nothing to it', () => {
        const sb = arrive();
        vm.runInContext("document.getElementById('player-list').innerHTML = '';", sb);
        for (let i = 0; i < 24; i++) {
            vm.runInContext("appendPlayerFrom({ name: 'Golfer " + (i + 1) + "', hcp: '" + (i % 20) + "' }, false, 24);", sb);
        }
        vm.runInContext('refreshHandicapNote();', sb);
        const text = noteText(sb);
        assert.ok(text.indexOf('\n') === -1, 'the note is still more than one line: ' + JSON.stringify(text));
        assert.ok(!/Golfer 1\b/.test(text), 'a golfer is named in the note');
        assert.ok(text.length < 200, 'the one line is a paragraph: ' + text.length + ' characters');
    });
});

describe('2. ONE NAME FOR THE BOX, FROM handicap-labels.js', () => {

    test('a Strokes round says Strokes, and never Index', () => {
        const sb = arrive();
        vm.runInContext("document.getElementById('handicap-basis-select').value = 'as-entered'; refreshHandicapNote();", sb);
        const text = noteText(sb);
        assert.match(text, /Strokes/, 'the note does not name the mode');
        assert.ok(!/Index/.test(text), 'a Strokes round still says Index: ' + text);
        assert.equal(vm.runInContext('handicapSetupBoxLabel()', sb), 'Strokes');
    });

    test('a GHIN round says Index, and still explains an unrated tee', () => {
        const sb = arrive();
        vm.runInContext("document.getElementById('handicap-basis-select').value = 'ghin-index'; refreshHandicapNote();", sb);
        const text = noteText(sb);
        assert.match(text, /used as the Playing Handicap/, 'the unrated-tee sentence is gone');
        assert.equal(vm.runInContext('handicapSetupBoxLabel()', sb), 'Index');
    });

    test('and the subtitle names NO mode, because it cannot know one', () => {
        const step = playersStep();
        const sub = step.slice(step.indexOf('wizard-step-sub'), step.indexOf('</div>', step.indexOf('wizard-step-sub')));
        assert.ok(!/Handicap Index|Index\b/.test(sub),
            'the subtitle names a mode the round may not be in: ' + sub);
        assert.match(sub, /number beside each name/, 'it no longer says what the number is for');
    });

    test('the column head is the module\'s answer, as it always was', () => {
        assert.match(ADMIN, /handicapBoxPlaceholder\(\{ handicapBasis: basis \}\)/);
        assert.match(ADMIN, /<script src="handicap-labels\.js"><\/script>/);
    });
});

describe('3. AFTER A PASTE, THE GOLFERS ARE ON SCREEN', () => {

    test('the commit scrolls to the first row it just made', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function commitPastedPlayers()'),
                               ADMIN.indexOf('async function removePlayerRowAndRefresh'));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        const closed = fn.indexOf('closePastePlayersModal()');
        const scrolled = fn.indexOf('scrollIntoView');
        assert.ok(closed > -1 && scrolled > closed,
            'the modal closes onto wherever the step was last scrolled to');
        assert.match(fn, /#player-list \.player-row/, 'it scrolls to something other than the rows');
    });
});
