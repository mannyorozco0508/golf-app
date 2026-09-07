// ============================================================================
// A BET YOU SET UP IS STILL THERE WHEN YOU SAVE, AND THE REVIEW SAYS SO
//
// TWO DEFECTS THAT HIDE EACH OTHER.
//
// B. TAPPING BACK SILENTLY DELETES THE NASSAU. Set it up in the Games step - tick
//    it, $10/$10/$20, pick the two golfers - then tap "◀ Back" once and come
//    forward again:
//        pickers on first visit:   { p1: "101", p2: "102" }
//        after one tap of Back:    { p1: "",    p2: "" }
//    The checkbox stays ticked. The stakes stay typed. Only the two golfer
//    dropdowns reset, because arriving at that step re-renders them from scratch
//    and only restores a selection in the two-player case. collectSetupNassauWager
//    returns null without them, so the round saves with NO BET and says nothing.
//    Tapping Back to check the course is a completely ordinary thing to do.
//
// C. AND THE REVIEW STEP CANNOT TELL YOU, because it never mentioned side matches
//    at all. A fully configured Nassau and a broken one reviewed identically -
//    "GAMES & MONEY  Extras: Birdie Game" in both cases. The screen whose whole
//    job is the last look before you play was silent about the wager, which is
//    exactly why B was invisible.
//
// THE REVIEW IS BOUND TO WHAT WILL SAVE, not to what is on screen. It asks
// collectSetupNassauWager() - the same function saveSettings uses - so it cannot
// report a bet that will not be written, or stay silent about one that will. Same
// discipline as the trip footer: the copy is held against the record, not against
// a proxy for it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const NAMES = ['Marty Sharp', 'Manny Orozco', 'Lance Webb', 'Zach Hill'];

// The wizard with a roster, standing on the Games step with a Nassau set up.
function wizard(playerCount) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
        { search: '?game=WZRD' });
    const players = NAMES.slice(0, playerCount).map((name, i) =>
        ({ id: 101 + i, name, hcp: '0' }));
    vm.runInContext(`
        alert = function () {}; currentMode = 'WZRD';
        collectWizardPlayers = function () { return ${JSON.stringify(players)}; };
    `, sb);
    return sb;
}
const run = (sb, e) => vm.runInContext(e, sb);
const setUpNassau = (sb, p1, p2) => run(sb, `
    (function () {
      var on = document.getElementById('setup-nassau-enabled');
      if (on && !on.checked) { on.checked = true; }
      toggleSetupNassau();
      document.getElementById('setup-nassau-front').value = '10';
      document.getElementById('setup-nassau-back').value = '10';
      document.getElementById('setup-nassau-overall').value = '20';
      var a = document.getElementById('setup-nassau-p1');
      var b = document.getElementById('setup-nassau-p2');
      if (a) a.value = ${JSON.stringify(p1)};
      if (b) b.value = ${JSON.stringify(p2)};
    })();`);
const pickers = sb => JSON.parse(run(sb, `JSON.stringify({
    p1: (document.getElementById('setup-nassau-p1')||{}).value,
    p2: (document.getElementById('setup-nassau-p2')||{}).value })`));
const wagerNow = sb => run(sb, 'JSON.stringify(collectSetupNassauWager())');
// MINI-DOM CANNOT SEE THIS BUG ON ITS OWN. CLAUDE.md records the limit exactly:
// "A <select> keeps its `value` when innerHTML is rewritten. A real browser
// resets it." renderSetupNassauPlayers() rebuilds its container with innerHTML,
// so in Chrome the two selects are destroyed and rebuilt with nothing chosen -
// while here the same stub objects survive holding their old values. Run against
// an unmodified harness, every test below passes while the bug is live.
//
// So the browser is modelled AT THE MOMENT IT HAPPENS: the two selects are blanked
// when - and only when - the container's innerHTML is written. Timing is the whole
// point. Blanking them before arriving instead would model a wipe that precedes the
// render, which no browser does, and would then only be survivable by a mechanism
// that reads the values back after they are already gone.
//
// This models a documented browser behaviour in the test, at one element; it does
// not teach mini-dom a fake answer, and nothing here asserts the mock.
// tools/wizard-wager-check.js proves the same thing in real Chrome, where nothing
// is modelled at all.
const modelSelectReset = sb => run(sb, `(function () {
    var box = document.getElementById('setup-nassau-players');
    if (box.__modelled) return; box.__modelled = true;
    var proto = Object.getPrototypeOf(box);
    var desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    Object.defineProperty(box, 'innerHTML', {
        configurable: true,
        get: function () { return desc.get.call(this); },
        set: function (v) {
            desc.set.call(this, v);
            var a = document.getElementById('setup-nassau-p1');
            var b = document.getElementById('setup-nassau-p2');
            if (a) a.value = ''; if (b) b.value = '';
        }
    });
})();`);

// Arriving at the Games step is what re-renders the pickers - the same call the
// page makes when you walk forward onto it.
const arriveOnGamesStep = sb => {
    modelSelectReset(sb);
    run(sb, 'goToWizardStep(WIZARD_STEP_OF.action);');
};

describe('B — A CONFIGURED NASSAU SURVIVES GOING BACK', () => {

    test('the pickers hold what was chosen', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        assert.deepEqual(pickers(sb), { p1: '101', p2: '102' });
    });

    test('THE REPORTED BUG: they survive leaving the step and coming back', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        run(sb, 'goToWizardStep(WIZARD_STEP_OF.players);');   // ◀ Back
        arriveOnGamesStep(sb);                                 // and forward again
        assert.deepEqual(pickers(sb), { p1: '101', p2: '102' },
            'one tap of Back emptied the two dropdowns that decide who is in the bet');
    });

    test('and the wager still builds afterwards', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        run(sb, 'goToWizardStep(WIZARD_STEP_OF.players);');
        arriveOnGamesStep(sb);
        const w = JSON.parse(wagerNow(sb) || 'null');
        assert.ok(w, 'the round would save with no bet at all, silently');
        assert.deepEqual(Array.from(w.teamAIds), ['101']);
        assert.deepEqual(Array.from(w.teamBIds), ['102']);
        assert.equal(w.frontStake, 10);
        assert.equal(w.overallStake, 20);
    });

    test('a THIRD trip through the step still holds', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '103', '104');
        for (let i = 0; i < 3; i++) {
            run(sb, 'goToWizardStep(WIZARD_STEP_OF.players);');
            arriveOnGamesStep(sb);
        }
        assert.deepEqual(pickers(sb), { p1: '103', p2: '104' });
    });

    // Restoring must not invent a pairing nobody chose.
    test('an untouched picker stays empty — no bet is invented', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        run(sb, `(function(){var on=document.getElementById('setup-nassau-enabled');
            if(on&&!on.checked){on.checked=true;} toggleSetupNassau();})();`);
        run(sb, 'goToWizardStep(WIZARD_STEP_OF.players);');
        arriveOnGamesStep(sb);
        assert.deepEqual(pickers(sb), { p1: '', p2: '' },
            'the wizard chose a pairing the organizer never picked');
        assert.equal(JSON.parse(wagerNow(sb) || 'null'), null);
    });

    test('two players still default to the only pairing there is', () => {
        const sb = wizard(2);
        arriveOnGamesStep(sb);
        run(sb, `(function(){var on=document.getElementById('setup-nassau-enabled');
            if(on&&!on.checked){on.checked=true;} toggleSetupNassau();})();`);
        const p = pickers(sb);
        assert.equal(p.p1, '101');
        assert.equal(p.p2, '102');
    });

    test('a golfer removed from the roster does not linger in the bet', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '104');
        run(sb, `collectWizardPlayers = function () { return ${JSON.stringify(
            NAMES.slice(0, 3).map((name, i) => ({ id: 101 + i, name, hcp: '0' })))}; };`);
        arriveOnGamesStep(sb);
        const p = pickers(sb);
        assert.notEqual(p.p2, '104', 'the bet still names a golfer who is not playing');
    });
});

describe('C — THE REVIEW SHOWS THE SIDE MATCH, FROM WHAT WILL SAVE', () => {

    const review = sb => {
        run(sb, 'goToWizardStep(WIZARD_STEP_OF.review);');
        return run(sb, '(function(){var e=document.getElementById("wizard-review-summary");'
            + 'return e ? (e.innerText || e.innerHTML || "") : "";})()');
    };

    test('a configured Nassau appears on the review', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        const r = review(sb);
        assert.match(r, /Nassau/i, 'the last screen before playing does not mention the bet: ' + r);
    });

    test('it names the stakes that will actually be written', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        const r = review(sb);
        assert.match(r, /10/, 'the review does not show the front-nine stake');
        assert.match(r, /20/, 'the review does not show the overall stake');
    });

    test('and who it is between', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        setUpNassau(sb, '101', '102');
        assert.match(review(sb), /Marty/, 'the review does not say who is in the bet');
    });

    // THE BINDING. Not "the checkbox is ticked" - what collectSetupNassauWager
    // returns, which is what saveSettings writes.
    test('an INCOMPLETE Nassau is reported as not saving, not shown as a bet', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        run(sb, `(function(){var on=document.getElementById('setup-nassau-enabled');
            if(on&&!on.checked){on.checked=true;} toggleSetupNassau();
            document.getElementById('setup-nassau-front').value = '10';})();`);
        const r = review(sb);
        assert.match(r, /not|won't|incomplete|pick/i,
            'a ticked-but-unfinished Nassau reviews as if it were fine: ' + r);
    });

    test('no Nassau at all says nothing about one', () => {
        const sb = wizard(4);
        arriveOnGamesStep(sb);
        const r = review(sb);
        assert.ok(!/Nassau \$/.test(r), 'the review invents a bet that was never set up');
    });

    // Comments are stripped: this file's prose names both functions repeatedly and
    // counting that would pass for the wrong reason.
    const bodyOf = name => {
        const code = ADMIN.replace(/\/\/.*$/gm, '');
        const at = code.indexOf('function ' + name);
        assert.ok(at > -1, name + ' is gone');
        return code.slice(at, code.indexOf('\n    function ', at + 30));
    };

    test('the review asks the same function the save does', () => {
        assert.match(bodyOf('renderWizardReview'), /wizardSideMatchLine\(\)/,
            'the review builds its side-match row some other way');
        assert.match(bodyOf('wizardSideMatchLine'), /collectSetupNassauWager\(\)/,
            'the review reads the form instead of what will be written, so it can drift');
        assert.match(bodyOf('saveSettings'), /collectSetupNassauWager\(\)/,
            'the save no longer uses the function the review is bound to');
    });
});
