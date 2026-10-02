// ============================================================================
// THE SETUP COACH CANNOT HAND OVER A HOLLOW ROUND
//
// WHAT MANNY MET. Home -> "Help me set this up". Step 1 asks how many golfers, and
// it is a good question. Then the coach could land on Review & Save with
//
//     Course    Not selected
//     Players   0 added
//
// and "Save & Start Round" under it. The coach's last step is a HANDOFF - "Ready for
// the course? / Take me there" - and coachFinish() went to the wizard's Review page
// whatever had been answered. Skipping that step did the same, because Skip only
// advanced to the end.
//
// WHAT THE OLD CODE ALREADY CAUGHT, measured before changing anything, because half
// of this was a presentation failure rather than a data one:
//   - saveSettings() ALREADY refuses with no course: "Please select or type a Golf
//     Course name before saving". So a course-less round could not be WRITTEN. The
//     refusal just arrived as a telling-off at the end of the walk, after a Review
//     that looked finished.
//   - Players are deliberately NOT required to save, with its own comment in
//     saveSettings: a host sets up a whole trip's rounds in advance and fills the
//     rosters in later. So "0 added" is only wrong on a COACH round, where the host
//     was just asked how many golfers are playing and answered.
//
// SO EVERY GATE HERE IS SCOPED TO ?coach=1, and the control that matters most in
// this file is the one proving a NORMAL arrival with no players is still allowed to
// save. A fix that broke that would have traded one real workflow for another.
//
// WHAT IS GUARDED
//   1. The pure decision table in setup-coach-gate.js: what each answer expects,
//      which steps may be skipped, which requirements are unmet, and in what order.
//   2. The handoff: a coach walk with nothing set lands on the COURSE step, with a
//      note saying why - never on Review.
//   3. Skip: gone from the two required steps, and refused by the handler too, so a
//      stale onclick or a cached shell cannot reach the end either.
//   4. Review: the gate block names what is missing, each button goes to that
//      field's own editor, and Save is disabled.
//   5. saveSettings: refuses with the same sentence even if the button is reached
//      another way, and does NOT refuse once everything is set.
//
// WHAT THIS FILE CANNOT PROVE, and the limit is in one place rather than spread out.
// mini-dom cannot build player rows: addPlayerRow() renders through innerHTML, which
// is a string here, so `.player-row` finds nothing and updateCount() writes 0. That
// is measured, not assumed - calling addPlayerRow twice leaves #player-count at 0.
// The gate reads #player-count, which production writes from the row count, so the
// tests below SET that span where a browser would have rows and say so at each site.
// The arithmetic over it is covered by the pure tests, which need no DOM at all.
// Nothing here proves a round was written: the gate's job is to refuse or get out of
// the way, and "a round appeared in Firebase" is Cmd+R on a phone.
//
// THE BASELINE, all 22 tests, measured against main 416e7ae in a clean worktree -
// the coach as Manny met it, with no setup-coach-gate.js at all:
//
//     1 PASS / 21 FAIL
//
// The one green is "trip.html has no coach of its own", which was true before and
// after and is here to keep the Road Trip answer honest rather than to earn a point.
//
// AND THE CONTROL IS RED AT THAT SHA FOR A HARNESS REASON, NOT A BEHAVIOURAL ONE.
// "A NORMAL round with no players is still allowed to save" describes behaviour that
// 416e7ae already had, so it ought to be green there - it is red because every
// page-level test in this file loads admin.html WITH setup-coach-gate.js as a
// dependency, and that file does not exist at that sha, so the realm throws before
// any assertion runs. I had predicted it green and it is not. Its job is forward:
// on this tree it passes, and it is the first thing that goes red if the gate ever
// starts firing on a round the coach did not start.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('admin.html');
let G = null;
try { G = require('./setup-coach-gate.js'); } catch (e) { G = null; }
const need = () => { assert.ok(G, 'setup-coach-gate.js must exist and load'); return G; };
const STEPS = { course: 1, format: 3, players: 5 };

// ===========================================================================
describe('1. THE DECISION TABLE, PURE', () => {

    test('each size answer expects the FEWEST golfers it can honestly mean', () => {
        const g = need();
        assert.equal(g.coachExpectedGolfers('four'), 4);
        assert.equal(g.coachExpectedGolfers('eight'), 5, '"Five to eight" cannot mean four');
        assert.equal(g.coachExpectedGolfers('big'), 9, '"More than eight" cannot mean eight');
        // Unanswered is 0, not a guess. The players rule falls back to "at least one".
        [undefined, null, '', 'nonsense'].forEach(v => assert.equal(g.coachExpectedGolfers(v), 0));
    });

    test('SKIP IS FOR THE OPTIONAL EXTRAS ONLY', () => {
        const g = need();
        assert.equal(g.coachStepIsRequired('size'), true, 'how many golfers is not optional');
        assert.equal(g.coachStepIsRequired('format'), true, 'what you are playing is not optional');
        ['flights', 'money', 'handicaps', 'course', '', undefined].forEach(k =>
            assert.equal(g.coachStepIsRequired(k), false, k + ' must stay skippable'));
    });

    test('an empty round is unmet on course, scoring and players - in that order', () => {
        const g = need();
        const unmet = g.coachUnmet({ courseName: '', formatValue: '', playerCount: 0, expected: 4 }, STEPS);
        assert.deepEqual(unmet.map(r => r.key), ['course', 'format', 'players'],
            'the order is the order they are fixed in, and the course comes first because the card is what every other screen reads');
        assert.equal(g.coachFirstUnmet({ courseName: '', formatValue: '', playerCount: 0, expected: 4 }, STEPS).step,
            STEPS.course, 'and the handoff goes to the course step');
    });

    test('a finished round is unmet on NOTHING', () => {
        const g = need();
        const state = { courseName: 'Pebble Beach', formatValue: 'stroke', playerCount: 4, expected: 4 };
        assert.deepEqual(g.coachUnmet(state, STEPS), []);
        assert.equal(g.coachGateClear(state, STEPS), true);
        assert.equal(g.coachFirstUnmet(state, STEPS), null);
        assert.equal(g.coachBlockLine(state, STEPS), '', 'nothing to say when nothing is missing');
    });

    test('PLAYERS SHORT OF THE ANSWER is unmet, and the button says by how many', () => {
        const g = need();
        const at = n => g.coachGateRows(
            { courseName: 'Pebble', formatValue: 'stroke', playerCount: n, expected: 9 }, STEPS
        ).filter(r => r.key === 'players')[0];
        assert.equal(at(0).met, false);
        assert.equal(at(0).cta, 'Add players');
        assert.equal(at(7).met, false);
        assert.equal(at(7).cta, 'Add 2 more', 'it must name the shortfall, not just complain');
        assert.equal(at(9).met, true);
        assert.equal(at(12).met, true, 'more than the answer is fine - the answers are ranges');
        assert.equal(at(7).step, STEPS.players, 'and it goes to the players step, not the top');
    });

    test('with NO size answer, one golfer is the floor', () => {
        const g = need();
        const row = n => g.coachGateRows(
            { courseName: 'Pebble', formatValue: 'stroke', playerCount: n, expected: 0 }, STEPS
        ).filter(r => r.key === 'players')[0];
        assert.equal(row(0).met, false, 'a round with nobody on it cannot be scored by anyone');
        assert.equal(row(1).met, true, 'and one is enough when nobody said otherwise');
    });

    test('THE TEE IS ONLY REQUIRED WHEN THE COURSE HAS ONE AND THE HANDICAPS NEED IT', () => {
        const g = need();
        const tee = (required, complete) => g.coachGateRows(
            { courseName: 'Pebble', formatValue: 'stroke', playerCount: 4, expected: 4,
              teeRequired: required, teeComplete: complete }, STEPS
        ).filter(r => r.key === 'tee')[0];
        assert.equal(tee(false, false).met, true, 'a course with no rated tees asks for nothing');
        assert.equal(tee(true, false).met, false, 'indexes with no slope or rating are guesses');
        assert.equal(tee(true, true).met, true);
        assert.equal(tee(true, false).step, STEPS.course, 'the tee is edited on the course step');
    });

    test('the blocked sentence NAMES what is missing', () => {
        const g = need();
        const line = g.coachBlockLine({ courseName: '', formatValue: '', playerCount: 0, expected: 9 }, STEPS);
        assert.match(line, /course/);
        assert.match(line, /scoring/);
        assert.match(line, /players/);
        assert.match(line, /Nothing has been saved yet/, 'and reassures: no round was created');
        const one = g.coachBlockLine({ courseName: 'Pebble', formatValue: 'stroke', playerCount: 0, expected: 4 }, STEPS);
        assert.match(one, /still needs players\./, 'one missing thing reads as one: ' + one);
    });
});

// ===========================================================================
// 2. THE COACH WALK. Tapped through its own buttons - every option is a real
//    element with the page's own onclick on it, so this is the tap and not a
//    call to the chooser by name.
// ===========================================================================
describe('2. THE HANDOFF GOES TO WHAT IS MISSING, NEVER TO A BLANK REVIEW', () => {

    function coach(opts) {
        const o = opts || {};
        const sb = loadHtmlInlineScript('admin.html', ['setup-coach-gate.js'],
            { search: '?game=GATE' + (o.code || '1') + '&eventType=quick&coach=1' });
        sb.uiRefuse = (m) => { (sb.__refusals = sb.__refusals || []).push(m); };
        sb.uiFail = (m) => { (sb.__fails = sb.__fails || []).push(m); };
        sb.uiToast = () => {};
        return sb;
    }
    // One real tap on the option whose value this is, on the step showing now.
    const tapOption = (sb, value) => {
        const mount = sb.document.getElementById('coach-options');
        const kids = (mount && mount.children) || [];
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].getAttribute('data-coach-value') === value) {
                assert.equal(typeof kids[i].onclick, 'function', 'the option has no handler');
                kids[i].onclick();
                return true;
            }
        }
        assert.fail('no option "' + value + '" on this step; have '
            + JSON.stringify(Array.from(kids).map(k => k.getAttribute('data-coach-value'))));
    };
    const step = sb => Number(vm.runInContext('currentWizardStep', sb));
    const shown = (sb, id) => {
        const e = sb.document.getElementById(id);
        return e ? e.style.display !== 'none' : null;
    };
    // mini-dom CANNOT BUILD PLAYER ROWS - addPlayerRow renders through innerHTML,
    // which is a string here, so updateCount() writes 0 however many times it is
    // called (measured). The gate reads #player-count, and production writes that
    // span from the row count, so this sets the span where a browser would have rows.
    const seedPlayers = (sb, n) => { sb.document.getElementById('player-count').textContent = String(n); };
    const typeCourse = (sb, name) => { sb.document.getElementById('course-search-input').value = name; };

    test('ARRIVE AND TAP THROUGH WITH NOTHING SET: it lands on the COURSE step', () => {
        const sb = coach({ code: 'A' });
        assert.equal(shown(sb, 'coach-screen'), true, 'the coach must open on a ?coach=1 arrival');
        tapOption(sb, 'four');          // size
        tapOption(sb, 'no');            // flights
        tapOption(sb, 'stroke');        // format
        tapOption(sb, 'none');          // money
        tapOption(sb, 'as-entered');    // handicaps
        tapOption(sb, 'go');            // the handoff
        assert.equal(shown(sb, 'coach-screen'), false, 'the coach is done');
        assert.equal(step(sb), 1, 'the handoff must land on the COURSE step, not Review');
        assert.notEqual(step(sb), 7, 'Review is unreachable while the round is empty');
        assert.equal(shown(sb, 'coach-gate-note'), true, 'and it says why it is here');
        assert.match(sb.document.getElementById('coach-gate-note').textContent, /Pick a course/);
    });

    test('WITH A COURSE TYPED it lands on PLAYERS instead - the next missing thing', () => {
        const sb = coach({ code: 'B' });
        typeCourse(sb, 'Pebble Beach');
        tapOption(sb, 'four'); tapOption(sb, 'no'); tapOption(sb, 'stroke');
        tapOption(sb, 'none'); tapOption(sb, 'as-entered'); tapOption(sb, 'go');
        assert.equal(step(sb), 5, 'players is what is missing now');
        assert.match(sb.document.getElementById('coach-gate-note').textContent, /Add players/);
    });

    // SEEDED AFTER THE WALK, AND MEASURED RATHER THAN ASSUMED. coachApply() ends by
    // refreshing the group and money panels, and one of those refreshers calls
    // updateCount(), which writes #player-count from the row count - 0 here, because
    // mini-dom cannot build rows. So a count seeded BEFORE the walk is wiped by it
    // (measured: 4 in, 0 out). In a browser the rows exist and updateCount writes the
    // real number, so this is a harness limit and not a production one - it just
    // means the player arm has to be set after the apply, the way a browser would
    // already have it.
    function walkedWithPlayers(sb, n) {
        typeCourse(sb, 'Pebble Beach');
        tapOption(sb, 'four'); tapOption(sb, 'no'); tapOption(sb, 'stroke');
        tapOption(sb, 'none'); tapOption(sb, 'as-entered'); tapOption(sb, 'go');
        seedPlayers(sb, n);
        return sb;
    }

    test('COURSE AND PLAYERS BOTH SET: Review is open, and the gate is silent', () => {
        const sb = walkedWithPlayers(coach({ code: 'C' }), 4);
        // The host taps Review in the progress bar - the same path the blocked test
        // below uses, so the two are comparable.
        sb.goToWizardStep(7);
        assert.equal(step(sb), 7, 'Review is reachable once nothing is missing');
        assert.equal(shown(sb, 'coach-review-gate'), false, 'no block on a finished round');
        assert.equal(shown(sb, 'coach-gate-note'), false, 'and no note nagging about it');
        const save = sb.document.getElementById('main-save-btn');
        assert.notEqual(save.disabled, true, 'Save must be live');
    });

    test('and the handoff TARGET is the gate, not a fixed step', () => {
        // THE ONE CLAIM THIS HARNESS CANNOT MEASURE, said plainly instead of dressed
        // up. Reaching "handoff with a full roster" needs coachFinish to run with
        // #player-count already right, and coachFinish calls coachApply, whose
        // refreshers rewrite that span from the rows mini-dom cannot build. So the
        // behaviour is proved in two halves: coachFirstUnmet returns null on a
        // complete round (the pure block above), and the handoff asks it rather than
        // going to a fixed step (here). A browser closes the gap, which is the Cmd+R
        // step in the report.
        const fn = SRC.slice(SRC.indexOf('function coachFinish'), SRC.indexOf('function startSetupCoach'));
        assert.ok(fn.length > 200, 'the slice collapsed');
        assert.match(fn, /coachGateUnmet\(\)/, 'the handoff must ask the gate');
        assert.match(fn, /goToWizardStep\(first \? Number\(first\.step\) : wizardStepNumber\('review'\)\)/,
            'and go to the missing step, or Review when there is none');
    });

    test('AND REVIEW SHOWS THE REAL VALUES, not placeholders', () => {
        const sb = walkedWithPlayers(coach({ code: 'D' }), 4);
        sb.goToWizardStep(7);
        const html = sb.document.getElementById('wizard-review-summary').innerHTML;
        // THE TWO ROWS MANNY SAW GO WRONG. The Course row is the one that read "Not
        // selected", and the Players row is the one that read "0 added".
        const row = label => {
            const at = html.indexOf('>' + label + '<');
            assert.ok(at > -1, 'no ' + label + ' row on Review');
            return html.slice(at, at + 300);
        };
        assert.match(row('Course'), /Pebble Beach/, 'the course the host typed');
        assert.ok(row('Course').indexOf('Not selected') === -1, 'the Course row still reads Not selected');
        assert.match(row('Players'), /4 added/, 'and the players it has');
        // THE SCORING ROW CANNOT BE READ HERE, and it is not a defect: that row is
        // built from options[selectedIndex].text, and mini-dom does not parse static
        // <option> markup - so the select has no options and the row says "Not
        // selected" while the VALUE is genuinely 'stroke'. Asserted on the value
        // instead; a browser shows "Stroke Play".
        assert.equal(sb.document.getElementById('game-format-select').value, 'stroke');
    });

    test('REVIEW BLOCKS SAVE when the round is short, with a button per missing thing', () => {
        const sb = coach({ code: 'E' });
        tapOption(sb, 'big'); tapOption(sb, 'no'); tapOption(sb, 'stroke');
        tapOption(sb, 'none'); tapOption(sb, 'as-entered'); tapOption(sb, 'go');
        // The host taps Review in the progress bar anyway - the gate has to hold
        // there, not only on the handoff.
        sb.goToWizardStep(7);
        assert.equal(shown(sb, 'coach-review-gate'), true);
        const box = sb.document.getElementById('coach-review-gate').innerHTML;
        assert.match(box, /still needs course and players/, box.slice(0, 300));
        assert.match(box, /goToWizardStep\(1\)/, 'Pick a course goes to the course step');
        assert.match(box, /goToWizardStep\(5\)/, 'Add players goes to the players step');
        assert.match(box, /Pick a course/);
        assert.match(box, /Add players/);
        assert.equal(sb.document.getElementById('main-save-btn').disabled, true, 'and Save is off');
    });
});

// ===========================================================================
describe('3. SKIP, AND THE REFUSAL UNDER IT', () => {

    function coach(code) {
        const sb = loadHtmlInlineScript('admin.html', ['setup-coach-gate.js'],
            { search: '?game=SKIP' + code + '&eventType=quick&coach=1' });
        sb.uiRefuse = () => {}; sb.uiFail = () => {}; sb.uiToast = () => {};
        return sb;
    }
    const skipShown = sb => {
        const b = sb.document.getElementById('coach-skip');
        return b ? b.style.display !== 'none' : null;
    };
    const stepKey = sb => String(vm.runInContext('(coachStepDef(coachStep) || {}).key || ""', sb));

    test('Skip is NOT on the required steps and IS on the optional ones', () => {
        const sb = coach('A');
        assert.equal(stepKey(sb), 'size');
        assert.equal(skipShown(sb), false, 'how many golfers cannot be skipped');
        sb.coachChoose('four');
        assert.equal(stepKey(sb), 'flights');
        assert.equal(skipShown(sb), true, 'flights is an extra');
        sb.coachChoose('no');
        assert.equal(stepKey(sb), 'format');
        assert.equal(skipShown(sb), false, 'what you are playing cannot be skipped');
        sb.coachChoose('stroke');
        assert.equal(stepKey(sb), 'money');
        assert.equal(skipShown(sb), true, 'money is an extra');
    });

    test('and calling coachSkip on a required step does NOTHING', () => {
        // Hiding a button is not the rule: a stale onclick, a cached shell or the
        // console must not reach the end of the walk either. This is the exact move
        // that used to land on a blank Review.
        const sb = coach('B');
        assert.equal(stepKey(sb), 'size');
        sb.coachSkip();
        assert.equal(stepKey(sb), 'size', 'it must not advance');
        assert.equal(shown(sb), true, 'and the coach is still open');
        sb.coachChoose('four');
        sb.coachSkip();                      // flights, optional
        assert.equal(stepKey(sb), 'format', 'an optional step still skips');
        sb.coachSkip();
        assert.equal(stepKey(sb), 'format', 'format does not');
    });
    const shown = sb => sb.document.getElementById('coach-screen').style.display !== 'none';
});

// ===========================================================================
describe('4. saveSettings REFUSES, AND ONLY ON A COACH ROUND', () => {

    function page(search) {
        const sb = loadHtmlInlineScript('admin.html', ['setup-coach-gate.js'], { search: search });
        sb.__refusals = [];
        sb.uiRefuse = (m) => { sb.__refusals.push(String(m)); };
        sb.uiFail = (m) => { sb.__refusals.push('FAIL ' + String(m)); };
        sb.uiToast = () => {};
        return sb;
    }
    const tick = () => new Promise(r => setTimeout(r, 20));

    test('a COACH round with no course and no players is refused by name', async () => {
        const sb = page('?game=SAVE1&eventType=quick&coach=1');
        sb.coachChoose('four'); sb.coachChoose('no'); sb.coachChoose('stroke');
        sb.coachChoose('none'); sb.coachChoose('as-entered'); sb.coachChoose('go');
        await sb.saveSettings();
        await tick();
        assert.equal(sb.__refusals.length, 1, 'one refusal: ' + JSON.stringify(sb.__refusals));
        assert.match(sb.__refusals[0], /still needs course and players/);
        assert.deepEqual(sb.__dbWrites, [], 'and nothing was written');
        assert.equal(Number(vm.runInContext('currentWizardStep', sb)), 1,
            'it also puts the host on the course step rather than leaving them on Review');
    });

    test('CONTROL: a NORMAL round with no players is still allowed to save', async () => {
        // THE WORKFLOW THIS FIX MUST NOT BREAK, and saveSettings says so in its own
        // comment: a host sets up a whole trip's rounds in advance - course, format,
        // side games - and fills the rosters in later. No ?coach=1, no gate.
        const sb = page('?game=SAVE2&eventType=quick');
        sb.document.getElementById('course-search-input').value = 'Pebble Beach';
        await sb.saveSettings();
        await tick();
        const gated = sb.__refusals.filter(m => /still needs/.test(m));
        assert.deepEqual(gated, [], 'the coach gate must not fire on a normal round: '
            + JSON.stringify(sb.__refusals));
    });

    test('a COACH round with everything set is not stopped by the gate either', async () => {
        const sb = page('?game=SAVE3&eventType=quick&coach=1');
        sb.document.getElementById('course-search-input').value = 'Pebble Beach';
        sb.coachChoose('four'); sb.coachChoose('no'); sb.coachChoose('stroke');
        sb.coachChoose('none'); sb.coachChoose('as-entered'); sb.coachChoose('go');
        // After the apply, for the reason given in the walk block above.
        sb.document.getElementById('player-count').textContent = '4';
        await sb.saveSettings();
        await tick();
        const gated = sb.__refusals.filter(m => /still needs/.test(m));
        assert.deepEqual(gated, [], 'nothing is missing, so the gate must get out of the way: '
            + JSON.stringify(sb.__refusals));
        // NOT CLAIMED: that a round was written. The course card, the pool and the
        // write itself all come after this point and are other files' business.
    });
});

// ===========================================================================
describe('5. ROAD TRIP SHARES THE WIZARD, AND THEREFORE THE GATE', () => {

    test('trip.html has no coach of its own', () => {
        // Measured rather than assumed: zero occurrences. A trip round is set up on
        // admin.html with ?trip=CODE, so there is one coach and one gate.
        assert.equal((read('trip.html').match(/coach/gi) || []).length, 0);
    });

    test('a trip-linked COACH round is gated the same way', () => {
        // startSetupCoach -> createRoom carries &trip= through, so this arrival is
        // real. The gate keys off ?coach=1 and not the event type, which is why it
        // holds here without a second rule.
        const sb = loadHtmlInlineScript('admin.html', ['setup-coach-gate.js'],
            { search: '?game=TRIP1&eventType=quick&coach=1&trip=TRIPAA' });
        sb.uiRefuse = () => {}; sb.uiFail = () => {}; sb.uiToast = () => {};
        sb.coachChoose('four'); sb.coachChoose('no'); sb.coachChoose('stroke');
        sb.coachChoose('none'); sb.coachChoose('as-entered'); sb.coachChoose('go');
        assert.equal(Number(vm.runInContext('currentWizardStep', sb)), 1,
            'a trip round must not reach Review empty either');
    });

    test('the gate is loaded by the page and shipped in the bundle', () => {
        assert.match(SRC, /<script src="setup-coach-gate\.js"><\/script>/);
        assert.match(read('sync-mobile-web.js'), /'setup-coach-gate\.js'/, 'the consumer bundle must ship it');
        assert.match(read('sw.js'), /'\.\/setup-coach-gate\.js'/, 'and the shell must precache it');
    });
});
