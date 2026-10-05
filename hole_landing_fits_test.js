// ============================================================================
// IF THE HOLE FITS, THE PAGE DOES NOT MOVE (2026-10-04)
//
// WHAT MANNY SAW, on his phone, after the Status sheet took the header, the nav
// and every reading card off the scorecard: he tapped Next and the "Final
// results are in" banner ended up UNDER the status bar with the clock drawn over
// its text, and the Dots row scrolled off the top.
//
// NOTHING WAS BROKEN. landOnHole was doing exactly what it was built to do -
// put the hole heading at inset + 12 - on a page where there was nothing to gain
// by moving at all, because the whole hole was already on screen. The scroll
// cost him the two lines above the heading and bought nothing.
//
// THE RULE, his: if the hole card from its heading through Prev/Next FITS with
// the page at the top, land at scrollY 0. Scroll only when it would NOT fit -
// five to eight golfers in one group - and then the heading goes to inset + 12,
// exactly as before. Nothing is ever placed under the safe-area top.
//
// AND THE RUNWAY FOLLOWS THE SAME TEST, because it is the only thing that makes
// a fitting page scrollable at all, and a page that can scroll is a page that
// drifts.
//
// WHY CHROME. mini-dom has no layout: no rects, no viewport, nothing to fit
// inside. Every number here is a cold arrival at 390x844 with the notch emulated
// the way hole_landing_inset_test.js emulates it - the root padding IS the
// inset - and every tap is a real one.
//
// BASELINE, measured over the FINISHED file against this branch's previous
// commit (69b2842) with index.html swapped out and restored by sha, all 8 tests:
// 3 PASS / 5 FAIL. 3 + 5 = 8.
//   The three that pass are the eight-golfer control at each inset: that card does
//   NOT fit, so it scrolled before this change and scrolls after it - which is the
//   whole point of keeping it in the file. The five reds are the four-golfer card
//   at each inset, the runway it should not have, and the rule itself.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const OFFSET = Number((IDX.match(/const HOLE_LANDING_OFFSET = (\d+);/) || [])[1]);
const INSETS = [0, 47, 59];
const CD = makeCourseData(18);

// FOUR GOLFERS, EVERY HOLE SCORED. A complete round is what puts the "Your card
// is in" banner above the hole - the banner in Manny's report - and the par 3
// puts the Dots row under Prev/Next. This is his arrangement, not a reduction of
// it: the bug needs the banner to be visible to be a bug.
function round(n, scoredThru) {
    const names = ['Manny Orozco', 'Kopp Kelly', 'Dalen Drake', 'Vic Vance',
                   'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'].slice(0, n);
    const P = makePlayers(names, [0, 9, 18, 4, 2, 11, 7, 20].slice(0, n), 101);
    const scores = {};
    P.forEach((p, i) => { for (let h = 1; h <= (scoredThru || 18); h++) scores['p' + p.id + '_h' + h] = 3 + ((h + i) % 4); });
    return { eventName: 'Fits', courseName: 'Test', players: P, gameFormat: 'stroke',
        groupSizeOverrides: { 0: n },
        courseData: CD, scores, settlementMode: 'whole-dollar',
        dotPointVal: 2, greenieCarryover: true };
}

const LOOK = `(function () {
  var card = document.getElementById('hole-view-card');
  var hdr = card ? card.querySelector('.hole-view-header') : null;
  var nav = card ? card.querySelector('.hole-view-nav-row') : null;
  var boxes = card ? [].slice.call(card.querySelectorAll('.score-input')) : [];
  var inset = parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;
  var r = hdr ? hdr.getBoundingClientRect() : null;
  var nr = nav ? nav.getBoundingClientRect() : null;
  // EVERY BLOCK THAT PAINTS, and the highest top among them: "nothing under the
  // safe-area top" is a claim about the whole page, not about the heading.
  var highest = null, name = null;
  [].slice.call(document.querySelectorAll('#main-content > *, #hole-view-card > *'))
    .forEach(function (el) {
      if (!el.getClientRects().length) return;
      var q = el.getBoundingClientRect();
      if (q.height <= 1) return;
      if (highest === null || q.top < highest) { highest = Math.round(q.top); name = el.id || el.className || el.tagName; }
    });
  return JSON.stringify({
    inset: inset,
    scrollY: Math.round(window.pageYOffset || 0),
    maxScroll: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
    headingTop: r ? Math.round(r.top) : null,
    navBottom: nr ? Math.round(nr.bottom) : null,
    boxes: boxes.length,
    boxesInView: boxes.length > 0 && boxes.every(function (b) {
      var q = b.getBoundingClientRect(); return q.top >= inset && q.bottom <= window.innerHeight; }),
    // The completed-round banner Manny named, read by its rendered text.
    bannerTop: (function () {
      var hit = [].slice.call(document.querySelectorAll('#main-content *')).filter(function (el) {
        return el.getClientRects().length && /card is in|Final results are in/i.test(el.innerText || ''); });
      return hit.length ? Math.round(hit[0].getBoundingClientRect().top) : null; })(),
    highestTop: highest, highestName: String(name || '').slice(0, 40),
    runway: (function () { var p = document.getElementById('hole-landing-runway');
      return p ? Math.round(p.getBoundingClientRect().height) : null; })()
  });
})()`;

const S = { four: {}, eight: {} };
before(async () => {
    for (const [key, n] of [['four', 4], ['eight', 8]]) {
        for (const inset of INSETS) {
            const r = await arriveCold({
                url: fileUrl('index.html', 'game=FITS'),
                db: { events: { FITS: round(n) }, global_courses: {}, trips: {}, tournaments: {} },
                viewport: { width: 390, height: 844 }, settleMs: 3200,
                steps: [
                    { expression: "document.documentElement.style.paddingTop = '" + inset + "px'; 'set'" },
                    { sleep: 250 },
                    { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 700 },
                    { expression: LOOK }
                ] });
            S[key][inset] = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
        }
    }
});

describe('1. A FOUR-GOLFER CARD LANDS AT THE TOP', () => {
    INSETS.forEach(inset => {
        test('inset ' + inset + 'px: Next lands at scrollY 0, with nothing under the bar', () => {
            const v = S.four[inset];
            assert.ok(v && !v.error, v && v.error);
            assert.equal(v.inset, inset, 'the emulated inset did not take');
            assert.equal(v.scrollY, 0, 'the page scrolled to ' + v.scrollY + ' on a card that fits');
            // THE BUG ITSELF: the banner Manny watched disappear under the clock.
            assert.notEqual(v.bannerTop, null, 'the fixture has no banner, so it cannot show one is safe');
            assert.ok(v.bannerTop >= inset,
                'the banner is ' + v.bannerTop + 'px from the viewport top, under a ' + inset + 'px status bar');
            // AND NOTHING ELSE IS UP THERE EITHER.
            assert.ok(v.highestTop >= inset,
                v.highestName + ' sits at ' + v.highestTop + ', under the ' + inset + 'px inset');
            // The whole hole is on screen, which is why not scrolling was right.
            assert.equal(v.boxes, 4);
            assert.equal(v.boxesInView, true, 'a score box is off screen on a card that fits');
            assert.ok(v.navBottom <= 844, 'Prev/Next is off the bottom at ' + v.navBottom);
        });
    });
});

describe('2. THE RUNWAY IS NOT ADDED TO A PAGE THAT DOES NOT NEED IT', () => {
    test('a fitting card adds no runway of its own', () => {
        // RE-POINTED 2026-10-05: the page IS scrollable now, and deliberately - the
        // leaderboard, the live matches, Today's games and the rest are back on it
        // below the hole. What must not happen is the LANDING adding scroll length
        // to a card that already fits, which is what the runway would do and what
        // made the page drift under the status bar in the first place.
        const v = S.four[0];
        assert.equal(v.runway, 0, 'the runway is ' + v.runway + 'px on a card that fits');
        assert.equal(v.scrollY, 0, 'and the page is still at the top');
    });
});

describe('3. AND A CARD THAT DOES NOT FIT STILL LANDS', () => {
    INSETS.forEach(inset => {
        test('eight golfers, inset ' + inset + 'px: the heading goes to inset + ' + OFFSET, () => {
            const v = S.eight[inset];
            assert.ok(v && !v.error, v && v.error);
            assert.equal(v.inset, inset, 'the emulated inset did not take');
            assert.ok(v.navBottom > 844 || v.scrollY > 0,
                'the eight-golfer card fits on screen now, so it proves nothing');
            assert.equal(v.headingTop, inset + OFFSET,
                'the heading is at ' + v.headingTop + ', not the landing');
            assert.ok(v.runway >= 0, 'the runway element is gone');
        });
    });
});

describe('4. THE RULE IS IN ONE PLACE', () => {
    test('landOnHole decides it, and the runway follows the same test', () => {
        const fn = IDX.slice(IDX.indexOf('function landOnHole()'),
                             IDX.indexOf('\n    function ', IDX.indexOf('function landOnHole()') + 10));
        assert.ok(fn.length > 600, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /const fitsAtTop = cardBottom <= \(window\.innerHeight \|\| 0\);/,
            'the fit test is gone');
        assert.match(fn, /if \(fitsAtTop\) \{[\s\S]*window\.scrollTo\(0, 0\);/,
            'a card that fits no longer lands at the top');
        assert.match(fn, /\} else \{\s*sizeHoleLandingRunway\(\);/,
            'the runway is sized on both branches again, which is what makes a fitting page scrollable');
        // AND NOTHING FOCUSES AFTER THE SCROLL (2026-10-05). This asserted that the
        // landing focus used preventScroll, which was how a focus stopped dragging
        // the heading under the status bar. There is no landing focus now - the
        // keypad was covering the live panel under Prev/Next - so the stronger
        // version of the same claim is that the landing ends with the scroll.
        assert.ok(!/\.focus\(/.test(fn), 'the landing focuses something again');
        assert.ok(!/focusFirstEmptyScoreBox/.test(IDX), 'the landing focuser is back');
    });
});
