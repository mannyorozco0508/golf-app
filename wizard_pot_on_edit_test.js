// ============================================================================
// REOPENING A ROUND SHOWS ITS REAL POT, NOT $0 (guard for the v194 fix)
//
// THE DEFECT THIS HOLDS, and it shipped: on an EXISTING round the wizard's Weekly
// Game step opened on "$0 total pool" even though the round had eight players.
// Toggling Weekly Game off and on fixed it. Reported again in the 2026-09-27 handoff
// as item 4, by which time it had already been FIXED in v194 - and fixed with nothing
// but a comment to hold it:
//
//     admin.html, the existing-round loader:
//       document.getElementById("player-list").innerHTML = "";
//       if (storedPlayersTemp.length > 0) {
//           handleFormatChange(true);
//           // v194: the Weekly Game step's pot counts the rows on screen
//           // (mpRecalc -> collectWizardPlayers). On an edit it had been
//           // computed before this rebuild and not again, so the step opened
//           // on "$0" until a pool input was touched. Now it follows the roster.
//           if (typeof mpRecalc === 'function') mpRecalc();
//       } else { addPlayerRow(); }
//
// SO THIS FILE EXISTS BECAUSE NOTHING FAILED WHEN IT WAS BROKEN. Delete that one
// mpRecalc() call today and the suite stays green; the step goes back to $0 and only
// a human on the first tee finds out. That is the shape of CLAUDE.md's opening
// section - every test drove the pool CONTROLS, and the defect lived in the state a
// user gets by touching nothing.
//
// WHY THE COUNT COMES FROM THE DOM AT ALL. mpRecalc -> mpDraftData ->
// collectWizardPlayers -> captureCurrentPlayerInputs, which reads
// querySelectorAll('.player-row'). There is no cache and no counter kept beside the
// rows, deliberately (admin.html says so where the rows are built). The rows ARE the
// roster, so anything that reads the pot before they exist reads zero golfers - and
// validateMoneyPool then multiplies a correct buy-in by nothing.
//
// TOUCHES NO POOL INPUT, WHICH IS THE WHOLE POINT. Every pool control carries
// oninput="mpRecalc()", so touching any one of them recomputes and hides the bug.
// This check reaches the step by a REAL TAP on the step dot and reads what is on
// screen. If it ever asks the page to recalculate, it stops testing the defect.
//
// DISPLAY, NOT MONEY - stated so nobody reads this as a settlement guard. The saved
// round carries only buyIn and the bucket amounts; captureMoneyPool() writes no total
// and no participant count, and the save gate re-validates on the payload's own
// player list. A $0 here was always a lie on the screen, never a wrong number in the
// round. What it cost was the organizer's confidence at the moment they set the
// buy-in, which is reason enough.
//
// THE BASELINE, measured per CLAUDE.md's count rule - and for a guard written AFTER
// its fix, the honest baseline is two numbers, not one:
//
//   all 7 tests, against main 2ecca35, the code as it stands (fixed):  7 PASS / 0 FAIL
//   all 7 tests, with the v194 mpRecalc() call deleted (the defect):    3 PASS / 4 FAIL
//
// All-green against a fixed tree is not evidence of anything on its own, which is why
// the second figure is the one that matters here. With the defect restored the screen
// reads "Add players in Step 5 to see the pot." on a round with eight golfers - the
// exact words behind the report - and the three that stay green are the two source
// pins about where the count comes from, plus the Review step's own line, which
// renders from a path the deleted call never touched.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const PL = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i), playingForMoney: true }));
// EIGHT GOLFERS AT $40 = $320, and the pot allocates exactly: KP $100 + net $100 +
// skins on remainder $120. An exactly-balanced pot matters - it means a wrong count
// shows up as a wrong TOTAL rather than being masked by a validation error.
const BUY_IN = 40;
const POT = BUY_IN * PL.length;                       // 320
// OWNED BY THE ARRIVING DEVICE. cold-arrival signs in as 'anon-cold', so this is the
// organizer's own phone reopening their own round - the path Manny is on. A legacy
// round reaches the same screen, but through a different arm of organizerDoor, and
// the owner path is the one worth pinning.
const ROUND = {
    eventName: 'Pot', courseName: 'Test', players: PL, courseData: CD,
    gameFormat: 'stroke', scores: {}, settlementMode: 'whole-dollar',
    ownerUid: 'anon-cold', organizerToken: 'tok-pot',
    moneyPool: { enabled: true, buyIn: BUY_IN,
        kp: { amount: 100, holes: [3, 7, 12, 16] },
        net: { amount: 100, places: [50, 30, 20] },
        skins: { mode: 'remainder' } },
    // A skins instance so the Review step's own roster-derived figure ("N players")
    // is on screen too - the closest sibling to this defect, same DOM-count source.
    additionalGameInstances: { skins1: { format: 'skins', skinsBuyIn: 20, skinsPotFormat: 'gross', startHole: 1 } },
};

const LOOK = `(function () {
  function txt(id) { var e = document.getElementById(id);
    return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : 'NO ELEMENT: ' + id; }
  return JSON.stringify({
    step: (typeof currentWizardStep !== 'undefined') ? currentWizardStep : 'n/a',
    rowsOnScreen: document.querySelectorAll('.player-row').length,
    poolTicked: !!(document.getElementById('mp-enabled') || {}).checked,
    buyInField: (document.getElementById('mp-buyin') || {}).value,
    potLine: txt('mp-pot-line'),
    math: txt('mp-math'),
    review: txt('wizard-review-summary')
  });
})()`;

const S = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=POT'),
        db: { events: { POT: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 },
        steps: [
            { expression: LOOK },                                   // as the wizard opens
            { tap: '[onclick="goToWizardStep(6)"]' }, { sleep: 700 },  // a REAL tap onto Games & Money
            { expression: LOOK },                                   // the step itself
        ] });
    S.ok = r.ok; S.why = r.reason;
    const objs = (r.value || []).filter(v => typeof v === 'string' && v.startsWith('{')).map(JSON.parse);
    S.onArrival = objs[0]; S.onStep = objs[1];
});

describe('AN EXISTING ROUND REOPENED IN THE WIZARD', () => {
    test('it arrived, with the round loaded and the pool still ticked', () => {
        assert.ok(S.ok, 'cold arrival failed: ' + S.why);
        assert.ok(S.onArrival && S.onStep, 'the two readings were not captured');
        // If these are wrong the fixture never reached the wizard and everything
        // below would pass or fail for the wrong reason.
        assert.equal(S.onArrival.rowsOnScreen, 8, 'the saved roster did not rebuild');
        assert.equal(S.onArrival.poolTicked, true, 'the saved pool did not restore its tick');
        assert.equal(S.onArrival.buyInField, String(BUY_IN), 'the saved buy-in did not restore');
    });

    test('ON ARRIVAL the pot is the real one - eight golfers at $40, not $0', () => {
        const v = S.onArrival;
        assert.match(v.potLine, new RegExp('8 players . \\$' + BUY_IN + ' = \\$' + POT),
            'the pot line is wrong on arrival: ' + JSON.stringify(v.potLine));
        assert.ok(!/\$0\b/.test(v.potLine), 'the pot line says $0: ' + v.potLine);
        assert.match(v.math, new RegExp('Total pool\\s*\\$' + POT),
            'the allocation box total is wrong: ' + JSON.stringify(v.math));
    });

    test('AND ON THE STEP ITSELF, reached by a real tap, having touched no pool input', () => {
        const v = S.onStep;
        assert.equal(v.step, 6, 'the tap did not land on Games & Money: step ' + v.step);
        assert.equal(v.buyInField, String(BUY_IN), 'the buy-in changed, so something was typed');
        assert.match(v.potLine, new RegExp('8 players . \\$' + BUY_IN + ' = \\$' + POT),
            'the step opened on the wrong pot: ' + JSON.stringify(v.potLine));
        assert.match(v.math, new RegExp('Total pool\\s*\\$' + POT));
        assert.ok(!/\$0\b/.test(v.math), 'a $0 is on the allocation box: ' + v.math);
    });

    test('the pot ALLOCATES exactly, so a wrong count could not hide behind an error', () => {
        // $320 in, $100 KP + $100 net + $120 skins out. If the count were zero the
        // total would be $0 and this line would read "Allocated $320 of $0", which is
        // a different failure from the one above and worth telling apart.
        assert.match(S.onStep.math, /Allocated\s*\$320 of \$320/,
            'the allocation summary does not balance: ' + S.onStep.math);
    });

    test("the REVIEW step's own roster figure reads the roster too (the sibling surface)", () => {
        // admin.html's renderWizardReview counts the same DOM rows for each skins
        // instance. Same source, same risk, and it is on screen from arrival.
        assert.match(S.onArrival.review, /Skins \$20 Gross . 8 players/,
            "the review's player count is wrong: " + JSON.stringify(S.onArrival.review));
    });
});

describe('THE SOURCE: THE ONE CALL THIS GUARD EXISTS FOR', () => {
    const fs = require('fs');
    const path = require('path');
    const ADM = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');

    test('the loader still recalculates the pot AFTER rebuilding the roster', () => {
        // ANCHORED ON storedPlayersTemp, WHICH IS UNIQUE. The rebuild line
        // `player-list").innerHTML = ""` appears FOUR times in admin.html - a paste,
        // a format switch and a delete all rebuild the list too - and my first
        // version sliced from the FIRST of them, which is not the existing-round
        // loader at all. It failed against perfectly good code, which is the tell.
        // `storedPlayersTemp.length > 0` occurs once and is the loader's own
        // condition, so the slice cannot land on a sibling.
        const at = ADM.indexOf('if (storedPlayersTemp.length > 0) {');
        assert.ok(at > -1, "the existing-round loader's roster branch could not be found");
        const slice = ADM.slice(at, at + 900);
        assert.match(slice, /handleFormatChange\(true\);/, 'the roster rebuild is gone');
        assert.match(slice, /mpRecalc\(\)/,
            'THE v194 CALL IS GONE - reopening a round will show $0 again');
        assert.ok(slice.indexOf('handleFormatChange(true)') < slice.indexOf('mpRecalc()'),
            'mpRecalc runs BEFORE the rows are rebuilt, which is the original defect');
    });

    test('and the pot is still counted from the rows on screen, not from a cache', () => {
        // If this ever changes the guard above stops being the right guard, so it is
        // pinned: the whole reason ordering matters is that the DOM is the source.
        const at = ADM.indexOf('function mpDraftData');
        assert.ok(at > -1, 'mpDraftData is gone');
        assert.match(ADM.slice(at, at + 200), /collectWizardPlayers\(\)/);
        const cw = ADM.indexOf('function collectWizardPlayers');
        assert.match(ADM.slice(cw, cw + 300), /captureCurrentPlayerInputs\(\)/);
        const cc = ADM.indexOf('function captureCurrentPlayerInputs');
        assert.match(ADM.slice(cc, cc + 200), /querySelectorAll\('\.player-row'\)/);
    });
});
