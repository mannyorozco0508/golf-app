// ============================================================================
// THE ROUND MENU FOLLOWS THE FINGER (2026-10-05, Manny)
//
// Swipe up on the pill to open the sheet, swipe down on its top to close it, and
// in between it is under the thumb: it moves with the finger and snaps on
// release - past halfway, or on a quick flick. Tap still toggles.
//
// THE DESIGN IS THE GUARD. Only the HANDLE listens. Not the document, not the
// sheet, not the page - the handle is a 62px bar at the bottom of the screen, so
// page scrolling, a swipe inside the sheet's own scrolling body and a tap on a
// score box are untouched BY CONSTRUCTION rather than by a guard that has to
// tell them apart afterwards. Section 2 measures that rather than trusting it.
//
// REAL TOUCHES, NOT SYNTHETIC EVENTS. Every drag below is
// Input.dispatchTouchEvent over CDP - the same raw dispatch the landing suite
// uses - so what is measured is what a thumb does, including the click iOS
// fires after a drag ends.
//
// WHAT THIS CANNOT PROVE: that it FEELS right on glass. Headless Chrome has no
// momentum, no rubber-banding and no 120Hz display. The numbers below are
// positions and classes; the feel is Manny's call on the phone.
//
// AND ONE CHECK THAT IS NOT ABOUT SWIPING. Manny saw "Delete round for everyone"
// in the All Players view. That is correct when the device IS the round's
// organizer - which his is - and must not be true for anybody else. Section 3
// is a true spectator, cold, with no owner match and no token.
//
// BASELINE, measured over the FINISHED file against main (4f8873f, index.html
// swapped out and restored by sha), all 9 tests: 7 PASS / 2 FAIL. 7 + 2 = 9.
//
// AND SEVEN PASSING IS NOT SEVEN PROVEN. Four of them are VACUOUS against a page
// with no drag in it, and saying so is the point:
//   "swipe down closes it"        the sheet was never open, so it was already closed
//   "a short drag snaps back"     nothing moved, so nothing had to snap
//   "nothing is left frozen"      no code sets an inline transform there
//   "a tap still toggles"         the tap path is untouched by this wave
// Each becomes a real assertion the moment a drag exists, which is exactly when
// it matters. The other three are genuine constraints that must not break: the
// arrival, the page scrolling without opening the sheet, and the spectator
// having no delete button.
//   The two reds are the wave: the swipe up, and where the listeners live.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [2, 9, 15, 4], 101);
const round = extra => Object.assign({
    eventName: 'Swipe', courseName: 'Dobson Ranch', players: P, courseData: CD,
    scores: {}, gameFormat: 'stroke', settlementMode: 'whole-dollar',
    groupSizeOverrides: { 0: 4 }, ownerUid: 'anon-cold' }, extra || {});

const STATE = `(function () {
  var s = document.getElementById('round-sheet');
  var h = document.getElementById('round-sheet-handle');
  if (!s || !h) return JSON.stringify({ missing: true });
  return JSON.stringify({
    open: /\\bopen\\b/.test(s.className),
    dragging: /\\bdragging\\b/.test(s.className),
    sheetTop: Math.round(s.getBoundingClientRect().top),
    handleTop: Math.round(h.getBoundingClientRect().top),
    scrollY: Math.round(window.pageYOffset || 0),
    // An inline transform left behind after a release would freeze the sheet
    // where the finger let go, whatever the class says.
    inlineTransform: String(s.style.transform || '')
  });
})()`;

const touch = (type, x, y) => ({ cdp: { method: 'Input.dispatchTouchEvent',
    params: { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y }] } } });
function swipe(x, y0, y1, steps) {
    const out = [touch('touchStart', x, y0)];
    for (let i = 1; i <= steps; i++) out.push(touch('touchMove', x, Math.round(y0 + (y1 - y0) * i / steps)));
    out.push(touch('touchEnd', 0, 0), { sleep: 450 });
    return out;
}

const S = {};
before(async () => {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=SWIPE'),
        db: { events: { SWIPE: round() }, global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: [{ expression: STATE }]
            .concat(swipe(195, 815, 500, 10), [{ expression: STATE }])     // up on the pill
            .concat(swipe(195, 120, 420, 10), [{ expression: STATE }])     // down on the open top
            .concat(swipe(195, 815, 790, 6), [{ expression: STATE }])      // a short, slow drag
            .concat([{ tap: '#round-sheet-handle' }, { sleep: 450 }, { expression: STATE }])
    });
    S.ok = r.ok; S.reason = r.reason;
    if (r.ok) {
        const j = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
        [S.rest, S.afterUp, S.afterDown, S.afterShort, S.afterTap] = j;
    }

    // THE PAGE ITSELF, scrolled hard, on a round long enough to scroll. The
    // handle must not have taken the gesture.
    const long = await arriveCold({
        url: fileUrl('index.html', 'game=SCROLLY'),
        db: { events: { SCROLLY: round({ players: makePlayers(
            ['A A', 'B B', 'C C', 'D D', 'E E', 'F F', 'G G', 'H H'], [1, 2, 3, 4, 5, 6, 7, 8], 201) }) },
            global_courses: {}, trips: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: swipe(195, 600, 200, 8).concat([{ expression: STATE }])
    });
    S.okScroll = long.ok;
    if (long.ok) S.scrolled = JSON.parse((long.value || [])
        .filter(v => typeof v === 'string' && v.charAt(0) === '{').pop());

    // A TRUE SPECTATOR: a bare link to a round this device does not own, with no
    // organizer token anywhere.
    const spec = await arriveCold({
        url: fileUrl('index.html', 'game=SPECT'),
        db: { events: { SPECT: round({ ownerUid: 'somebody-else', organizerToken: 'tok-theirs' }) },
              global_courses: {}, trips: {}, tournaments: {} },
        auth: { uid: 'not-the-owner', email: 'x@y.com', isAnonymous: false },
        viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: [{ tap: '#round-sheet-handle' }, { sleep: 500 }, { expression: `(function () {
            var mount = document.getElementById('end-round-mount');
            return JSON.stringify({
                mountHtml: mount ? String(mount.innerHTML || '').length : -1,
                buttons: document.querySelectorAll('#end-round-mount button').length,
                // innerText, scoped: the page keeps its whole application in an
                // inline script, so textContent matches this sentence in SOURCE.
                saysDelete: /Delete round for everyone/.test(String(document.body.innerText || ''))
            });
        })()` }]
    });
    S.okSpec = spec.ok;
    if (spec.ok) S.spectator = JSON.parse((spec.value || [])
        .filter(v => typeof v === 'string' && v.charAt(0) === '{').pop());
});

describe('1. THE SHEET FOLLOWS THE FINGER, AND SNAPS', () => {

    test('ran', () => assert.ok(S.ok && S.okScroll && S.okSpec, S.reason));

    test('SWIPE UP on the pill opens it', () => {
        assert.equal(S.rest.open, false, 'it did not start closed');
        assert.equal(S.afterUp.open, true, 'the swipe up did not open it');
        assert.ok(S.afterUp.sheetTop < S.rest.sheetTop - 300,
            'the sheet is open by class and did not move: ' + S.afterUp.sheetTop);
    });

    test('SWIPE DOWN on the open sheet’s top closes it', () => {
        assert.equal(S.afterDown.open, false, 'the swipe down did not close it');
        assert.equal(S.afterDown.sheetTop, S.rest.sheetTop, 'it closed to a different place');
    });

    test('a SHORT, SLOW drag snaps back where it came from', () => {
        // 25px on a 700-odd px travel, slowly: neither past halfway nor a flick.
        // This is what makes a mis-touch on the way to Prev/Next harmless.
        assert.equal(S.afterShort.open, false, 'a 25px drag opened the sheet');
        assert.equal(S.afterShort.sheetTop, S.rest.sheetTop);
    });

    test('and nothing is left frozen under the finger', () => {
        // An inline transform surviving the release would pin the sheet wherever
        // the finger let go, whatever the class said.
        [S.afterUp, S.afterDown, S.afterShort].forEach((v, i) =>
            assert.equal(v.inlineTransform, '', 'reading ' + i + ' kept an inline transform'));
        [S.afterUp, S.afterDown, S.afterShort].forEach((v, i) =>
            assert.equal(v.dragging, false, 'reading ' + i + ' is still marked dragging'));
    });

    test('and a TAP still toggles, because a tap is not a drag', () => {
        assert.equal(S.afterTap.open, true, 'the tap after the drags did not open it');
    });
});

describe('2. AND IT TAKES NOTHING THAT IS NOT ITS OWN', () => {

    test('a swipe on the PAGE scrolls the page and does not open the sheet', () => {
        assert.equal(S.scrolled.open, false, 'scrolling the page opened the Round Menu');
        assert.ok(S.scrolled.scrollY > 50,
            'the page did not actually scroll, so this proves nothing: ' + S.scrolled.scrollY);
    });

    test('only the handle listens, which is why', () => {
        // The claim above is a property of WHERE the listeners are. A later wave
        // moving them to the document would pass the measurement on a short page
        // and steal every scroll on a long one.
        const at = IDX.indexOf('(function bindSheetDrag() {');
        const fn = IDX.slice(at, IDX.indexOf('\n    })();', at));
        assert.ok(fn.length > 200, 'the slice is empty - the endpoint drifted');
        ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(e =>
            assert.ok(fn.indexOf("handle.addEventListener('" + e + "'") > -1, e + ' is not on the handle'));
        assert.ok(!/document\.addEventListener|window\.addEventListener/.test(fn),
            'a listener went on the document or the window');
        // PASSIVE WHERE IT CAN BE, non-passive only where preventDefault is
        // needed - which is touchmove, and only touchmove.
        assert.match(fn, /'touchmove', moveSheetDrag, \{ passive: false \}/);
        assert.match(fn, /'touchstart', beginSheetDrag, \{ passive: true \}/);
        assert.match(fn, /'touchend', endSheetDrag, \{ passive: true \}/);
        // AND THE TRANSITION IS OFF WHILE A FINGER IS ON IT, or every frame
        // animates toward the last one and the sheet lags the thumb.
        assert.match(IDX, /#round-sheet\.dragging \{ transition: none; will-change: transform; \}/);
    });
});

describe('3. AND THE DELETE STAYS THE ORGANIZER’S', () => {

    test('a true spectator opening the Round Menu has no delete button at all', () => {
        // Manny saw it in All Players view. That is correct on HIS device - he
        // owns the round - and the question was whether anyone else sees it.
        // Not hidden: ABSENT. An empty mount is what renderEndRoundControl writes
        // when canDeleteRound() is false, so there is nothing to reach from a
        // console either.
        assert.equal(S.spectator.buttons, 0, 'a spectator was offered the delete');
        assert.equal(S.spectator.mountHtml, 0, 'the delete markup is in a spectator page');
        assert.equal(S.spectator.saysDelete, false,
            'the sentence is on screen for somebody who may not do it');
    });
});
