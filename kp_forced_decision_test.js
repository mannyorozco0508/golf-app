// ============================================================================
// A GROUP CANNOT LEAVE A KP HOLE WITHOUT ANSWERING (Wave 23)
//
// Marty's round: groups walked off KP holes without touching the selector, and the
// hole sat blank. The question was already there - v193 put it under Prev/Next and
// Wave 16 reworded it - so this is not a missing question. It was a SKIPPABLE one,
// three separate ways, all measured in the recon:
//   1. its answer lived in sessionStorage (kpAsked:CODE:hN), so it died with the
//      session and was never shared between two phones in one group;
//   2. on COLD ARRIVAL at a KP hole the block sits 1398px down an 844px viewport -
//      554px below the fold (tools/kp-entry-position-check.js, 390x844). After a
//      Prev/Next landing it is at 433px and plainly visible, which is why it works
//      for a group that walks the card and not for one that reopens the app;
//   3. the block is built inside renderHoleView, so the Full Card shows nothing.
// The gate below closes (1) and (2). (3) is a separate backlog item, deliberately
// not built - Full Card is gated as an EXIT here, which is not the same as giving
// it a KP entry of its own.
//
// THE MONEY TRAP THIS FILE EXISTS TO PREVENT.
// kpNoWinner already exists. pool-engine.js (PROTECTED, unchanged by this wave)
// reads it and moves that hole's KP share INTO THE SKINS BUCKET. It is the
// ORGANIZER's whole-field call - "nobody in the FIELD got it" - made on the Finish
// Round screen behind a confirm sheet. "Nobody in our group" is a DIFFERENT
// statement made by one foursome, and if it wrote kpNoWinner then Group 1 answering
// honestly would divert the hole's money while Group 3 was still walking up. That
// is not a hypothetical: measured on this file's own fixture, kpNoWinner on hole 7
// moves $20 out of the KP pot and into the skins pot. See the money describe below,
// which is the control that would catch it.
//
// SO "none" GOES TO ITS OWN NODE: kpGroupAnswers/h<N>/g<G> = { answer, at }, an
// ANSWER LOG and nothing more. Manny's rules for it:
//   - a later group's winner does NOT clear another group's "none";
//   - a group that answered "none" is never re-asked;
//   - the copy must not imply "none" settled the hole.
// A PICK still goes through saveKpLeader UNCHANGED - the same kpLeaders/hN and
// kpWinners/hN in one update, the same last-write-wins a later group relies on -
// and writes the answer log beside it. No engine reads kpGroupAnswers; verified in
// the recon that no engine walks the round object generically either, so a new
// sibling node cannot be picked up by accident.
//
// WHY THE WRITES ARE ASSERTED FROM THE WRITE LOG AND NOT FROM SOURCE.
// The hard rule is "never kpNoWinner, never kpWinners". A source scan for that name
// would be satisfied by an empty slice and would go red on a COMMENT explaining the
// rule - which has bitten this repo four times. window.__coldWrites in
// tools/lib/cold-arrival.js records every ref().set/update a REAL TAP made, so the
// assertions below read what the page actually wrote. That is behaviour, not prose.
//
// WAVE 27b ADDED THREE CASES, and they have their own baseline - the header figure
// above is Wave 23's and describes a file that had 25 tests. Measured against this
// branch before the Back fix (index.html at 7f87a76), all 28:
//
//     25 PASS / 3 FAIL
//
// The three reds are exactly the new "BACK TO HOLE N RE-LANDS THE HOLE" cases at 0,
// 47 and 59px of inset; every one of Wave 23's 25 stayed green, which is the evidence
// that re-landing on Back changed nothing else about the gate. Control: drop the
// re-land and the same three go red again.
//
// WHY CHROME. Every trigger is a tap: Next, the 1-18 picker, Full Card, Finish
// Round. Cold through tools/lib/cold-arrival.js - the page runs its own init,
// listener and render, and no test here calls a navigation function by name.
//
// HARNESS LIMIT, STATED. mini-dom has no layout and would report every button
// 0x0, so none of this could run there; the money describe is the only part that
// does not need a browser, and it loads the engines directly.
//
// THE RED BASELINE, RECORDED SO IT CANNOT BE MISREMEMBERED. Run against pre-build
// main (3e48f56, index.html sha 13616080...), all 25 tests: 6 PASS / 19 FAIL.
// BASELINE COUNT DELTA: +3  Wave 27b added the three Back-to-hole cases after this
//   figure was measured; the file registers 28 now. The Wave 27b baseline above is
//   the one taken at 28.
// The six that passed without the feature, and why each one did - because "6 green"
// is not coverage and should not be read as any:
//   1  "every arrival ran"                       a HARNESS PRECONDITION. It asserts the
//                                                cold arrivals completed without error,
//                                                which says nothing about the gate.
//   3  "ARRIVING ... does NOT open the modal"    VACUOUS without the feature: there is no
//                                                modal, so "no modal" is free. It only
//                                                becomes a real assertion once one exists.
//   14 "AN INCOMPLETE KP HOLE is never gated"    PARTLY VACUOUS: nothing is gated without
//                                                a gate. Its two fixture assertions
//                                                (landed on 7, hole incomplete) are real
//                                                and did pass - which is the point of
//                                                having them, since this case was INERT
//                                                before they were added.
//   16 "the baseline"                            ENGINE-ONLY, and genuinely green: it
//   17 "kpGroupAnswers is INVISIBLE to the money" describes pool-engine.js behaviour that
//   19 "CONTROL 2: ... moves $20 ... skins pot"   this wave does not change. 17 is green
//                                                for the right reason - a node the engine
//                                                has never heard of cannot move money.
// So: 1 precondition, 2 vacuous, 3 engine-only. An earlier report of this file said
// "18 fail / 6 pass" - that was the 24-test version, before test 18 (REPLAYED) was
// added to close control 2 - and misclassified the six as "4 vacuous + 3 engine-only",
// which is seven things among six tests. The numbers above are measured.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { loadJsFile } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
// EIGHT GOLFERS, TWO GROUPS OF FOUR. Multi-group is the case that matters: it is
// what makes a bare link a spectator and a ?group= link a scorekeeper, and it is
// the shape Marty's round had. Group 1 is 101-104.
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const P = makePlayers(NAMES, [0, 4, 8, 12, 2, 6, 10, 14], 101);
const IDS = P.map(p => p.id);
const G1 = IDS.slice(0, 4);
const KP_HOLES = [7, 18];

function scoreThrough(lastHole, ids) {
    const s = {};
    for (let h = 1; h <= lastHole; h++) ids.forEach(id => { s['p' + id + '_h' + h] = CD[h - 1].par; });
    return s;
}
function round(extra) {
    return Object.assign({
        eventName: 'KPF', courseName: 'Test', players: P, gameFormat: 'stroke',
        courseData: CD, settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 20, participantIds: IDS.map(String),
            kp: { amount: 40, holes: KP_HOLES }, net: { amount: 60, places: [60, 40] },
            skins: { mode: 'remainder' } },
        scores: scoreThrough(7, G1),
    }, extra || {});
}

// Group 1 has holes 1-7 in, so the page lands ITSELF on hole 8 and nothing here
// navigates to reach the KP hole: Prev is a real tap back onto a COMPLETE hole 7.
// That also proves answer B - arriving on a complete KP hole must NOT open the
// modal, only leaving one may.
const LANDS_ON_8 = round();
// Every card in, so the picker can reach hole 18 (a KP hole) from hole 1.
const ALL_IN = round({ scores: scoreThrough(18, IDS) });
// GROUP 2, standing on hole 7 with it NOT finished: three of four scores in. This is
// the fixture that makes the completeness check reachable - see the note at S.unscored.
const G2 = IDS.slice(4);
const PARTIAL_SEVEN = round({ scores: Object.assign(scoreThrough(6, G2),
    { ['p' + G2[0] + '_h7']: 3, ['p' + G2[1] + '_h7']: 4, ['p' + G2[2] + '_h7']: 3 }) });

const LOOK = `(function () {
  function vis(sel) { var e = document.querySelector(sel); return !!(e && e.getClientRects().length); }
  var ov = document.getElementById('kp-force-overlay');
  var shown = !!(ov && getComputedStyle(ov).display !== 'none' && ov.getClientRects().length);
  var names = Array.prototype.slice.call(document.querySelectorAll('#kp-force-overlay .kpf-name'))
    .map(function (b) { return (b.innerText || '').trim(); });
  return JSON.stringify({
    hole: (typeof currentViewedHole !== 'undefined') ? currentViewedHole : 'n/a',
    viewMode: (typeof currentViewMode !== 'undefined') ? currentViewMode : 'n/a',
    modalShown: shown,
    modalText: shown ? (ov.innerText || '').replace(/\\s+/g, ' ').trim() : '',
    names: names,
    hasNoneBtn: vis('#kp-force-overlay .kpf-none'),
    hasBackBtn: vis('#kp-force-overlay .kpf-back'),
    answered: (typeof kpAnsweredFor === 'function') ? kpAnsweredFor(7) : 'no kpAnsweredFor',
    answered18: (typeof kpAnsweredFor === 'function') ? kpAnsweredFor(18) : 'no kpAnsweredFor',
    blockBody: (function () { var m = document.getElementById('kp-entry-mount');
      return m ? (m.innerText || '').replace(/\\s+/g, ' ').trim() : 'no mount'; })(),
    writes: (window.__coldWrites || []).map(function (w) {
      return { op: w.op, path: w.path, value: w.value, keys: (w.value && typeof w.value === 'object')
        ? Object.keys(w.value) : String(w.value) };
    }),
    probeOrder: (window.GolfBack && GolfBack.probes) ? GolfBack.probes() : ['no GolfBack'],
    startedOn: (window.__kpfStartedOn === undefined) ? 'not marked' : window.__kpfStartedOn,
    completeHere: (window.__kpfCompleteHere === undefined) ? 'not marked' : window.__kpfCompleteHere
  });
})()`;

async function arrive(data, query, steps) {
    const r = await arriveCold({ url: fileUrl('index.html', query),
        db: { events: { KPF: J(data) }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3200, viewport: { width: 390, height: 844 },
        steps: [{ expression: MARK }].concat(steps || [], [{ expression: LOOK }]) });
    return r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
}
// READ BEFORE ANY TAP. The two facts that decide whether a case is live - which hole
// the page landed itself on, and whether this group had finished it - are both gone
// once Next has moved. Captured here and carried through on the window.
const MARK = `(function () {
  window.__kpfStartedOn = (typeof currentViewedHole !== 'undefined') ? currentViewedHole : null;
  window.__kpfCompleteHere = (typeof kpGroupHoleComplete === 'function' && window.__kpfStartedOn !== null)
    ? kpGroupHoleComplete(window.__kpfStartedOn) : 'n/a';
  return 'marked ' + window.__kpfStartedOn;
})()`;
const PREV = [{ tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 700 }];
const NEXT = [{ tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 700 }];
const S = {};

before(async () => {
    // ON HOLE 7, COMPLETE, UNANSWERED - reached by a real Prev tap from the page's
    // own landing on hole 8.
    S.onSeven      = await arrive(LANDS_ON_8, 'game=KPF&group=1', PREV);
    // LEAVING IT with Next: the gate.
    S.leaveSeven   = await arrive(LANDS_ON_8, 'game=KPF&group=1', PREV.concat(NEXT));
    // ...then each of the three exits the modal allows.
    S.answeredNone = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat(NEXT, [{ tap: '#kp-force-overlay .kpf-none' }, { sleep: 900 }]));
    S.pickedAnn    = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat(NEXT, [{ tap: '#kp-force-overlay .kpf-name', nth: 0 }, { sleep: 900 }]));
    S.wentBack     = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat(NEXT, [{ tap: '#kp-force-overlay .kpf-back' }, { sleep: 700 }]));
    // ANDROID BACK, the same call the Capacitor listener makes.
    S.backPressed  = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat(NEXT, [{ expression: 'String(GolfBack.press({}))' }, { sleep: 500 }]));
    // THE OTHER EXITS. Full Card, and the 1-18 picker.
    S.toFullCard   = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat([{ tap: '#view-mode-full-btn' }, { sleep: 700 }]));
    S.jumpedAway   = await arrive(LANDS_ON_8, 'game=KPF&group=1',
        PREV.concat([{ tap: '.hole-jump-open' }, { sleep: 400 },
                     { tap: '.hole-pick-btn', nth: 2 }, { sleep: 700 }]));
    // NEVER FIRES. A spectator (bare link on a multi-group round); a hole this group
    // has not finished (group 2's link, whose golfers have no scores at all); and a
    // hole this group already answered.
    // A REAL SPECTATOR. A bare link on a multi-group round opens the group picker over
    // the card (z-index above the nav row), so taps aimed at Prev/Next land on the
    // overlay - my first version of this fixture did exactly that and reported a hole
    // number from a tap that never reached a button. "Just watching" is the spectator
    // the page itself offers, and dismissing it is what makes this case real.
    S.spectator    = await arrive(LANDS_ON_8, 'game=KPF',
        [{ tap: '#group-pick-overlay .btn-outline' }, { sleep: 700 }].concat(NEXT));
    // A PARTIALLY SCORED KP HOLE, which is what "unscored" has to mean for this gate
    // to be tested at all. My first fixture used group 2 with no scores anywhere: the
    // page landed them on hole 1, Next went to hole 2, and the completeness check was
    // never reached on a KP hole - so the control that stubs it caught nothing and the
    // case was INERT. Group 2 now has holes 1-6 in and THREE of its four golfers on
    // hole 7 (Hal picked up), so the page lands them ON the KP hole with it incomplete.
    S.unscored     = await arrive(PARTIAL_SEVEN, 'game=KPF&group=2', NEXT);
    S.already      = await arrive(round({ kpGroupAnswers: { h7: { g1: { answer: 'none', at: 1 } } } }),
        'game=KPF&group=1', PREV.concat(NEXT));
    // HOLE 18 IS A KP HOLE: the last hole has no Next, only Finish Round.
    S.onEighteen   = await arrive(ALL_IN, 'game=KPF&group=1',
        [{ tap: '.hole-jump-open' }, { sleep: 400 }, { tap: '.hole-pick-btn', nth: 17 }, { sleep: 800 }]);
    S.finishGated  = await arrive(ALL_IN, 'game=KPF&group=1',
        [{ tap: '.hole-jump-open' }, { sleep: 400 }, { tap: '.hole-pick-btn', nth: 17 }, { sleep: 800 },
         { tap: '.finish-round-nav-btn' }, { sleep: 800 }]);
});

const wrote = (v, re) => (v.writes || []).some(w => re.test(w.path) || (Array.isArray(w.keys) && w.keys.some(k => re.test(k))));

describe('THE GATE: A COMPLETE KP HOLE CANNOT BE LEFT UNANSWERED', () => {
    test('every arrival ran', () => {
        Object.keys(S).forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test('the fixture really puts a complete, unanswered KP hole on screen (else nothing below proves anything)', () => {
        const v = S.onSeven;
        assert.equal(v.hole, 7, 'Prev did not land on hole 7: ' + v.hole);
        assert.match(v.blockBody, /Closest to the Pin/, 'the v193 block is not rendering - no KP pool?');
        assert.equal(v.answered, null, 'the hole is already answered, so the gate could not fire');
    });

    test('ARRIVING on a complete KP hole does NOT open the modal (answer B: leaving only)', () => {
        assert.equal(S.onSeven.modalShown, false, 'the modal fired on arrival');
    });

    test('LEAVING it with Next: the modal is up and the hole DID NOT CHANGE', () => {
        const v = S.leaveSeven;
        assert.equal(v.modalShown, true, 'Next walked off an unanswered KP hole');
        assert.equal(v.hole, 7, 'the navigation went through anyway - the hole is now ' + v.hole);
        assert.match(v.modalText, /Hole 7/);
        assert.deepEqual(v.names, ['Ann', 'Ben', 'Cal', 'Dee'],
            'the modal must offer THIS GROUP and only this group');
        assert.equal(v.hasNoneBtn, true);
        assert.equal(v.hasBackBtn, true);
    });

    test("the copy does not claim \"none\" settled the hole (Manny's rule A)", () => {
        const t = S.leaveSeven.modalText;
        assert.match(t, /Nobody in our group/, 'the "none" button must say whose answer it is');
        assert.doesNotMatch(t, /[Nn]obody won|no ?one won|nobody got it\b/,
            'this copy reads as the organizer\'s whole-field call, which it is not');
    });

    test('"Nobody in our group" writes the answer log, lets the navigation finish, and MOVES NO MONEY KEY', () => {
        const v = S.answeredNone;
        assert.equal(v.modalShown, false, 'the modal stayed up');
        assert.equal(v.hole, 8, 'the blocked navigation did not resume - hole is ' + v.hole);
        assert.equal(v.answered, 'none', 'the answer was not recorded');
        assert.ok(wrote(v, /kpGroupAnswers/), 'no kpGroupAnswers write: ' + JSON.stringify(v.writes));
        // THE HARD RULE, read off what the page actually wrote.
        assert.ok(!wrote(v, /kpNoWinner/),
            'ANSWERING "none" WROTE kpNoWinner - that is the organizer\'s whole-field call and it '
            + 'moves KP money into the skins pot: ' + JSON.stringify(v.writes));
        assert.ok(!wrote(v, /kpWinners/),
            '"none" wrote a winner: ' + JSON.stringify(v.writes));
    });

    test('a PICK goes through saveKpLeader unchanged - both keys, one update - plus the answer log', () => {
        const v = S.pickedAnn;
        assert.equal(v.modalShown, false);
        assert.equal(v.hole, 8, 'the blocked navigation did not resume');
        assert.equal(v.answered, '101', 'the answer log did not record who: ' + v.answered);
        const upd = (v.writes || []).filter(w => w.op === 'update' && Array.isArray(w.keys)
            && w.keys.some(k => /kpWinners/.test(k)));
        assert.equal(upd.length, 1, 'expected exactly ONE update carrying kpWinners: '
            + JSON.stringify(v.writes));
        assert.ok(upd[0].keys.some(k => /kpLeaders\/h7/.test(k)) && upd[0].keys.some(k => /kpWinners\/h7/.test(k)),
            'kpLeaders and kpWinners are no longer in the SAME update: ' + JSON.stringify(upd[0].keys));
        assert.ok(!wrote(v, /kpNoWinner/), 'a pick wrote kpNoWinner');
    });

    test('"Back to hole 7" closes the modal, stays on 7, and writes nothing', () => {
        const v = S.wentBack;
        assert.equal(v.modalShown, false, 'Back did not close it');
        assert.equal(v.hole, 7, 'Back navigated anyway');
        assert.equal(v.answered, null, 'Back recorded an answer');
        assert.ok(!wrote(v, /kpGroupAnswers|kpWinners|kpNoWinner/),
            'Back wrote something: ' + JSON.stringify(v.writes));
    });

    test('ANDROID BACK CANNOT DISMISS IT: the press is swallowed and the modal stays', () => {
        const v = S.backPressed;
        assert.equal(v.modalShown, true, 'hardware back dismissed a blocking modal');
        assert.equal(v.hole, 7);
        // WHAT ACTUALLY MATTERS is that this probe is reached BEFORE the generic
        // .modal-overlay probe, not that it is first overall: finish-round-review sits
        // at priority 1 too and reports itself closed while this modal is up. My first
        // version asserted probes()[0] and, with the probe registered at priority 0,
        // caught a real defect - pwa-boot.js files `Number(0) || 9` as NINE.
        const order = v.probeOrder || [];
        assert.ok(order.indexOf('kp-forced') > -1, 'the KP probe is not registered: ' + order);
        assert.ok(order.indexOf('kp-forced') < order.indexOf('modal'),
            'the generic modal probe is reached first, so hardware back closes this: ' + order);
    });
});

// ---------------------------------------------------------------------------
// "BACK TO HOLE N" LANDS THE HOLE, IT DOES NOT JUST CLOSE (Wave 27b)
//
// Manny, on his iPhone: Back closed the popup and left him at the TOP of the hole
// rather than on it. The cause is not the popup - it is that closing it re-rendered
// the card and stopped there, so the page stayed wherever the golfer had scrolled to
// before they tapped Next. That is typically DOWN among the score boxes, because that
// is where you are when you finish a hole, which is why this does not reproduce unless
// the fixture scrolls away first. These arrivals do exactly that.
//
// THE FIX IS THE SAME LANDING Next and Prev use - close, then landOnHole() - so the
// heading sits at inset+12 and the boxes below it, and the Wave 27 focus rule rides
// along because landOnHole ends with focusFirstEmptyScoreBox().
// ---------------------------------------------------------------------------
describe('BACK TO HOLE N RE-LANDS THE HOLE', () => {
    const OFFSET = 12;
    const B = {};
    before(async () => {
        const SEE = `(function () {
          var card = document.getElementById('hole-view-card');
          var head = card ? card.querySelector('.hole-view-header') : null;
          var ov = document.getElementById('kp-force-overlay');
          return JSON.stringify({
            hole: (typeof currentViewedHole !== 'undefined') ? currentViewedHole : 'n/a',
            inset: parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0,
            headingTop: head ? Math.round(head.getBoundingClientRect().top) : null,
            scrollY: Math.round(window.pageYOffset || 0),
            modal: !!(ov && getComputedStyle(ov).display !== 'none'),
            writes: (window.__coldWrites || []).length
          });
        })()`;
        for (const inset of [0, 47, 59]) {
            const r = await arriveCold({ url: fileUrl('index.html', 'game=KPF&group=1'),
                db: { events: { KPF: J(LANDS_ON_8) }, global_courses: {}, trips: {}, tournaments: {} },
                settleMs: 3200, viewport: { width: 390, height: 844 },
                steps: [
                    { expression: "document.documentElement.style.paddingTop = '" + inset + "px'; 'set'" }, { sleep: 250 },
                    { tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 700 },      // Prev onto the complete KP hole 7
                    // SCROLL AWAY, the way a golfer does while entering the last score.
                    // Without this the page is already landed and Back looks correct
                    // whether or not it re-lands - the case would be inert.
                    { expression: "window.scrollTo(0, (window.pageYOffset||0) + 260); 'scrolled'" }, { sleep: 250 },
                    { expression: "'AWAY:' + " + SEE },
                    { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 700 },      // Next -> the gate opens
                    { tap: '#kp-force-overlay .kpf-back' }, { sleep: 700 },
                    { expression: "'BACK:' + " + SEE },
                ] });
            B[inset] = r.ok ? (() => { const o = {};
                (r.value || []).forEach(v => { if (typeof v === 'string' && v.indexOf(':{') > -1)
                    o[v.slice(0, v.indexOf(':{'))] = JSON.parse(v.slice(v.indexOf(':{') + 1)); });
                return o; })() : { error: r.reason };
        }
    });

    [0, 47, 59].forEach(inset => {
        test('inset ' + inset + 'px: Back lands the hole at inset+' + OFFSET + ', same hole, nothing written', () => {
            const v = B[inset];
            assert.ok(v && !v.error, 'inset ' + inset + ': ' + (v && v.error));
            // The fixture must really be scrolled off the landing, or this proves nothing.
            assert.equal(v.AWAY.inset, inset, 'the emulated inset did not take');
            assert.notEqual(v.AWAY.headingTop, inset + OFFSET,
                'the fixture never left the landing, so Back cannot be shown to restore it');
            assert.equal(v.BACK.modal, false, 'Back did not close the popup');
            assert.equal(v.BACK.hole, 7, 'Back changed the hole: ' + v.BACK.hole);
            assert.equal(v.BACK.headingTop, inset + OFFSET,
                'Back left the page at ' + v.BACK.headingTop + ', not the landing');
            assert.equal(v.BACK.writes, 0, 'Back wrote something');
        });
    });
});

describe('THE OTHER WAYS OUT OF A HOLE ARE GATED TOO', () => {
    test('FULL CARD is an exit and is gated (answer C) - the view did not switch', () => {
        const v = S.toFullCard;
        assert.equal(v.modalShown, true, 'Full Card walked off an unanswered KP hole');
        assert.equal(v.viewMode, 'hole', 'the view switched anyway: ' + v.viewMode);
    });

    test('THE 1-18 PICKER is gated - the jump did not happen', () => {
        const v = S.jumpedAway;
        assert.equal(v.modalShown, true, 'the picker walked off an unanswered KP hole');
        assert.equal(v.hole, 7, 'the jump went through - hole is ' + v.hole);
    });

    test('HOLE 18: there is no Next, so FINISH ROUND is the exit, and it is gated', () => {
        assert.equal(S.onEighteen.hole, 18, 'the picker did not reach hole 18');
        assert.equal(S.onEighteen.modalShown, false, 'arriving on 18 opened it (arrival must not)');
        const v = S.finishGated;
        assert.equal(v.modalShown, true, 'Finish Round left an unanswered 18th-hole KP');
        assert.match(v.modalText, /Hole 18/);
    });
});

describe('WHO IS NEVER ASKED', () => {
    test('A SPECTATOR (bare link, multi-group round) is never asked', () => {
        const v = S.spectator;
        assert.equal(v.modalShown, false, 'a spectator was made to answer for a group');
        // The landing on a bare link is the whole field's first unscored hole, not
        // group 1's, so the number is not 8 here. What matters is that Next MOVED.
        assert.ok(v.hole > 1, 'a spectator\'s navigation was blocked: hole ' + v.hole);
        assert.equal(v.answered, null, 'a spectator recorded an answer for a group');
    });

    test('AN INCOMPLETE KP HOLE is never gated - one of the four picked up', () => {
        const v = S.unscored;
        // The fixture has to put them ON hole 7 with it incomplete, or this proves
        // nothing: that is exactly how my first version of this case went inert.
        assert.equal(v.startedOn, 7, 'group 2 did not land on the KP hole: ' + v.startedOn);
        assert.equal(v.completeHere, false, 'the hole is complete, so nothing is being tested');
        assert.equal(v.modalShown, false, 'a group was asked about a hole it has not finished');
        assert.equal(v.hole, 8, 'the navigation was blocked anyway: hole ' + v.hole);
    });

    test('A GROUP THAT ALREADY ANSWERED "none" is never re-asked (rule A)', () => {
        const v = S.already;
        assert.equal(v.answered, 'none', 'the stored answer was not read back');
        assert.equal(v.modalShown, false, 'a group that answered was asked again');
        assert.equal(v.hole, 8, 'and it blocked them: hole ' + v.hole);
    });
});

// ---------------------------------------------------------------------------
// THE MONEY CONTROL'S HOME. No browser: the engines, directly.
// ---------------------------------------------------------------------------
describe('ANSWERING "none" MOVES NO MONEY - and the figures that prove kpNoWinner would', () => {
    const ENG = loadJsFile('pool-engine.js',
        ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    const pool = d => { ENG.__d = J(d); return J(vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG)); };
    const shot = r => ({ unresolved: r.kpUnresolvedCents, toSkins: r.kp.toSkinsCents,
        states: r.kp.lines.map(l => l.hole + ':' + l.state),
        skinsPaid: (r.skins ? r.skins.lines : []).reduce((a, l) => a + l.cents, 0) });
    // Every card in and one birdie, so the skins pot actually pays and a share moved
    // into it is visible as a number rather than as a flag.
    const base = round({ scores: Object.assign(scoreThrough(18, IDS), { p101_h5: CD[4].par - 1 }) });

    test('the baseline: two blank KP holes hold $40 and the skins pot pays $60', () => {
        assert.deepEqual(shot(pool(base)),
            { unresolved: 4000, toSkins: 0, states: ['7:unresolved', '18:unresolved'], skinsPaid: 6000 });
    });

    test('kpGroupAnswers is INVISIBLE to the money: identical to the baseline, to the cent', () => {
        const withLog = J(base);
        withLog.kpGroupAnswers = { h7: { g1: { answer: 'none', at: 1 } }, h18: { g2: { answer: 'none', at: 2 } } };
        assert.deepEqual(shot(pool(withLog)), shot(pool(base)),
            'a per-group answer changed the money - it must be an answer log and nothing else');
    });

    // THE CONTROL, CLOSED. The two tests above price the defect and prove the log is
    // inert, but neither of them reads what the MODAL actually wrote - so on their own
    // they would both stay green if the button were re-pointed. This one replays the
    // real write log from the real tap onto the money fixture and settles the round
    // that produced. Point "Nobody in our group" at the organizer's node and this goes
    // red with the dollars in the message.
    test('REPLAYED: the round the modal actually left behind settles to the same money', () => {
        const writes = (S.answeredNone && S.answeredNone.writes) || [];
        assert.ok(writes.length > 0, 'no writes captured - the tap did not land');
        const after = J(base);
        let applied = 0;
        writes.forEach(w => {
            if (!w.value || typeof w.value !== 'object') return;
            Object.keys(w.value).forEach(rel => {
                const segs = String(rel).split('/');
                let node = after;
                segs.slice(0, -1).forEach(k => { if (!node[k] || typeof node[k] !== 'object') node[k] = {}; node = node[k]; });
                node[segs[segs.length - 1]] = w.value[rel];
                applied++;
            });
        });
        assert.ok(applied > 0, 'the write log carried no values to replay');
        const a2 = shot(pool(base)), b2 = shot(pool(after));
        assert.deepEqual(b2, a2, 'ANSWERING "none" MOVED MONEY. baseline ' + JSON.stringify(a2)
            + ' became ' + JSON.stringify(b2) + ' - the KP pot and the skins pot must both '
            + 'be untouched by one group\'s answer');
    });

    test('CONTROL 2: kpNoWinner on the same hole moves $20 out of the KP pot and into the skins pot', () => {
        // This is the defect the rule prevents, priced. If "Nobody in our group" ever
        // wrote kpNoWinner, one foursome's honest answer would do THIS to the round -
        // and it is why the assertion in the gate describe reads the write log.
        const withNoWinner = J(base); withNoWinner.kpNoWinner = { h7: true };
        const a = shot(pool(base)), b = shot(pool(withNoWinner));
        assert.equal(a.unresolved - b.unresolved, 2000, 'the KP pot did not drop by $20');
        assert.equal(b.toSkins, 2000);
        assert.equal(b.skinsPaid - a.skinsPaid, 2000, 'the skins pot did not grow by $20');
        assert.deepEqual(b.states, ['7:skins', '18:unresolved']);
    });
});

describe('THE SOURCE: ONE GATE, SIX CALLERS, AND NO PROTECTED FILE TOUCHED', () => {
    const IDX = read('index.html');

    test('one gate function exists and every hole exit asks it', () => {
        assert.match(IDX, /function kpGateBefore\(/, 'the single gate is gone');
        // The five exits named in the recon. A sixth appearing later should have to
        // decide deliberately whether it is a hole exit, so the count is pinned.
        const calls = (IDX.match(/kpGateBefore\(/g) || []).length;
        // RE-PINNED (Wave 36 revision, was 6): openCardInPopup is a SIXTH caller, and
        // it has to be - the Finish button opens the popup now, so on hole 18 that
        // popup is the only way off a KP hole and must be gated exactly as the recap
        // was. openFinishRoundModal keeps its own call: the organizer still reaches it
        // from the popup, and a gate that trusted its caller would be no gate.
        assert.equal(calls, 7, 'expected the definition plus six callers, found ' + calls);
        ['function goToHole(', 'function jumpToGap(', 'function jumpToMissingHole(',
         'function openFinishRoundModal(', 'function openCardInPopup(', 'function setViewMode('].forEach(sig => {
            const at = IDX.indexOf(sig);
            assert.ok(at > -1, sig + ' is gone');
            const body = IDX.slice(at, IDX.indexOf('\n    }', at));
            assert.match(body, /kpGateBefore\(/, sig + ' no longer asks the gate');
        });
    });

    test('Prev/Next and the picker both go through goToHole, so they cannot drift', () => {
        ['function goToAdjacentHole(', 'function jumpToHole('].forEach(sig => {
            const at = IDX.indexOf(sig);
            const body = IDX.slice(at, IDX.indexOf('\n    }', at));
            assert.match(body, /goToHole\(/, sig + ' still assigns the hole itself');
            assert.ok(!/currentViewedHole = /.test(body),
                sig + ' assigns currentViewedHole directly, bypassing the gate');
        });
    });

    test('the answer log is per hole AND per group, and absence is distinct from "none"', () => {
        assert.match(IDX, /function kpAnsweredFor\(/);
        assert.match(IDX, /function kpGroupAnswerKey\(/);
        const fn = IDX.slice(IDX.indexOf('function kpAnsweredFor('),
                             IDX.indexOf('\n    }', IDX.indexOf('function kpAnsweredFor(')));
        assert.match(fn, /kpGroupAnswers/);
        assert.match(fn, /return null/, 'absence must be a distinct state from "none"');
    });

    test('the v193 block and the modal read the SAME resolver (one builder)', () => {
        const blk = IDX.slice(IDX.indexOf('function buildPoolKpEntry('),
                              IDX.indexOf('\n    }', IDX.indexOf('function buildPoolKpEntry(')));
        assert.match(blk, /kpAnsweredFor\(/,
            'the block still reads its own sessionStorage answer, so the two can disagree');
    });

    test('the two protected engines are untouched by this wave', () => {
        // Behaviour, not a hash: the wave adds a node NEITHER engine may read.
        assert.ok(!/kpGroupAnswers/.test(read('pool-engine.js')),
            'pool-engine.js reads the answer log - it must never be money input');
        assert.ok(!/kpGroupAnswers/.test(read('settlement-engine.js')),
            'settlement-engine.js reads the answer log');
        assert.match(read('database.rules.json'), /"kpGroupAnswers"/,
            'the new node has no rule of its own, so a published ruleset would make it '
            + 'organizer-only and the modal would fail for the scorekeepers it is for');
    });

    test('the modal is NOT a .modal-overlay, so the generic back probe cannot reach it', () => {
        const at = IDX.indexOf('id="kp-force-overlay"');
        assert.ok(at > -1, 'the overlay is gone');
        const tag = IDX.slice(IDX.lastIndexOf('<', at), IDX.indexOf('>', at) + 1);
        assert.ok(!/\bmodal-overlay\b/.test(tag),
            'pwa-boot.js closes any shown .modal-overlay on hardware back: ' + tag);
        assert.ok(!/\brecap-overlay\b/.test(tag), 'same for .recap-overlay: ' + tag);
    });
});
