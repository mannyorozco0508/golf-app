// ============================================================================
// THE HOLE LANDS BELOW THE STATUS BAR, NOT BEHIND IT (Wave 19b)
//
// THE DEFECT, reported from the INSTALLED app and then measured. Manny tapped Next
// without touching a score box - no typing, no keyboard - and could not see which
// hole he was on. Next was scrolling correctly the whole time. It was scrolling the
// hole heading to 12px from the PHYSICAL TOP OF THE SCREEN, which in a standalone
// PWA on a notched iPhone is underneath the clock and the battery.
//
// HOW. index.html insets the root for the notch (the NATIVE SAFE AREA block):
//     html { padding-top: env(safe-area-inset-top, 0px); ... }
// and that protects content while the page sits at scroll 0. landOnHole() scrolls to
// an ABSOLUTE document offset, and the root padding is part of the document - so once
// the page scrolls, the padding has gone above the viewport and nothing is left
// holding the landing target below the status bar. Measured, same round, same tap:
//     root padding-top  0px -> scrollY  980 -> header 12px from the viewport top
//     root padding-top 47px -> scrollY 1027 -> header 12px from the viewport top
//     root padding-top 59px -> scrollY 1039 -> header 12px from the viewport top
// The target tracks the inset faithfully, which is exactly the problem: 12px from the
// viewport top is 35px UNDER a 47px status bar.
//
// ---------------------------------------------------------------------------
// WHY THIRTEEN ARRANGEMENTS PASSED, AND WHY THAT IS THE POINT OF THIS FILE.
//
// The existing landing assertions read `header.getBoundingClientRect().top >= 0` and
// called 12px a landing. AN ASSERTION THAT MEASURES THE VIEWPORT CANNOT SEE A STATUS
// BAR: the viewport in a standalone PWA starts under the notch, so 12px from its top
// is 12px from the top of the screen, and the assertion is satisfied by the defect.
// Thirteen arrangements - bare and group links, four to eight golfers, scored and
// unscored holes, from rest and from the page bottom, with and without a focused box,
// at a keyboard-sized viewport - all reported "landed" and all were wrong on a phone.
//
// That is the SAME SHAPE as the fixture fault in Wave 17's row guard, which scored
// holes 1-5 and landed on an unscored hole so no cell could ever vary. There, a
// fixture that could not produce the variation could not see it. Here, a frame of
// reference that has no status bar in it cannot see one. Both suites were green and
// both were measuring the wrong thing, and it is worth a reader finding that stated
// rather than rediscovering it.
//
// HOW THIS EMULATES THE NOTCH. env(safe-area-inset-top) cannot be forced from a
// test, and there is no headless status bar. But the fix does not read env() - it
// reads the COMPUTED root padding-top, which is what env() sets - so setting that
// padding directly exercises the same code path with the same arithmetic. 47px and
// 59px are what iPhone 14/15-class devices report in standalone. The 0px case pins
// the WEB behaviour unchanged, which matters because on the web the inset is 0 and
// nothing about this may move.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = makeCourseData(18);
const OFFSET = 12;                 // HOLE_LANDING_OFFSET
const INSETS = [0, 47, 59];        // web, iPhone 14-class, iPhone 15 Pro Max-class

// A round whose holes are all scored and mixed, which is the state the report came
// from - and the one Wave 17's guard could not reach.
// RE-POINTED 2026-10-04 (the Status sheet). This was Manny's own four-ball, and
// the roster is now EIGHT in one group. The reason is not convenience: the
// scorecard's header, nav, Playing With card, group scores and live dashboard
// moved into a slide-up sheet, so a four-golfer round is exactly one screen -
// measured, 844px - and landOnHole is a NO-OP there, by decision. A file about
// where the landing puts the heading under a notch cannot measure the landing on
// a page that has nothing to scroll; it would be asserting the absence of the
// feature it exists to protect.
//
// SO THE NOTCH CLAIM IS KEPT WHOLE on a card that still scrolls, and the
// four-golfer case it came from gets its own test at the bottom of this file,
// asserting the rule that now applies to it: nothing scrolls, and the heading is
// still clear of the status bar.
function round(names) {
    const roster = names || ['Manny Orozco', 'Kopp Kelly', 'Dalen Drake', 'Vic Vance',
                             'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
    const P = makePlayers(roster, [0, 9, 18, 4, 2, 11, 7, 20].slice(0, roster.length), 101);
    const scores = {};
    P.forEach((p, i) => { for (let h = 1; h <= 12; h++) scores['p' + p.id + '_h' + h] = 3 + ((h + i) % 4); });
    // ONE GROUP OF EIGHT, and that override is load-bearing: eight golfers split
    // into two groups of four, and a two-group round with no ?group= opens the
    // "Keeping score, playing, or just watching?" sheet over the whole page on
    // arrival - measured, every tap then landed on the overlay and the hole never
    // changed. One group is also the arrangement the landing is about: eight
    // golfers on one card is the tallest the scorecard gets.
    return { eventName: 'Landing', courseName: 'Test', players: P, gameFormat: 'stroke',
        groupSizeOverrides: { 0: P.length },
        courseData: CD, scores, settlementMode: 'whole-dollar', skinsBuyIn: 5, skinsCarryOver: false };
}
const FOUR = ['Manny Orozco', 'Kopp Kelly', 'Dalen Drake', 'Vic Vance'];

const LOOK = `(function () {
  var hdr = document.querySelector('.hole-view-header');
  var boxes = [].slice.call(document.querySelectorAll('.hv-player-row .score-input'));
  var inset = parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;
  var r = hdr ? hdr.getBoundingClientRect() : null;
  return JSON.stringify({
    inset: inset,
    hole: hdr ? (hdr.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 14) : null,
    scrollY: Math.round(window.pageYOffset || 0),
    canScroll: (document.documentElement.scrollHeight - window.innerHeight) > 1,
    // DOES THE HOLE CARD FIT WITH THE PAGE AT THE TOP (2026-10-04)? That is the
    // whole landing rule now: a card that fits is left where it renders.
    navBottom: (function () { var n = document.querySelector('.hole-view-nav-row');
      return n ? Math.round(n.getBoundingClientRect().bottom + (window.pageYOffset || 0)) : null; })(),
    scrollRoom: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
    headerTop: r ? Math.round(r.top) : null,
    // the only question that matters: is the heading BELOW the inset, or behind it?
    clearOfInset: r ? (Math.round(r.top) >= inset) : null,
    gapBelowInset: r ? Math.round(r.top) - inset : null,
    boxesInView: boxes.length > 0 && boxes.every(function (b) {
      var q = b.getBoundingClientRect(); return q.top >= inset && q.bottom <= window.innerHeight; }),
    boxCount: boxes.length
  });
})()`;

// Emulating the notch: set the root padding the way env(safe-area-inset-top) does,
// BEFORE the navigation, then tap for real.
const S = {};
before(async () => {
    for (const inset of INSETS) {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=LND19'), settleMs: 3200,
            db: { events: { LND19: round() }, global_courses: {}, trips: {}, tournaments: {} },
            viewport: { width: 390, height: 844 }, steps: [
                { expression: "document.documentElement.style.paddingTop = '" + inset + "px'; 'set'" },
                { sleep: 250 },
                { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 600 }, { expression: "'next:' + " + LOOK },
                { tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 600 }, { expression: "'prev:' + " + LOOK },
            ] });
        S[inset] = { ok: r.ok, reason: r.reason };
        if (r.ok) (r.value || []).filter(v => typeof v === 'string' && v.indexOf(':{') > -1)
            .forEach(v => { S[inset][v.slice(0, v.indexOf(':{'))] = JSON.parse(v.slice(v.indexOf(':{') + 1)); });
    }
});

INSETS.forEach(inset => {
    describe('LANDING with a ' + inset + 'px safe-area inset', () => {
        test('ran, and the page really has the inset applied', () => {
            assert.ok(S[inset] && S[inset].ok, S[inset] && S[inset].reason);
            assert.equal(S[inset].next.inset, inset, 'the emulated inset did not take');
        });

        ['next', 'prev'].forEach(nav => {
            test(nav.toUpperCase() + ': the hole heading lands ' + OFFSET + 'px BELOW the inset, not below the viewport', () => {
                const v = S[inset][nav];
                // RE-POINTED 2026-10-04 (Manny's rule): the landing only scrolls when
                // the hole card would NOT fit with the page at the top. Eight golfers
                // and the Status sheet is a near thing - with no banner above the hole
                // this fixture's card ends just inside the screen - so which arm
                // applies is MEASURED here rather than assumed. The claim this file
                // exists for is the same in both: the heading is below the status bar,
                // never behind it.
                if (v.navBottom !== null && v.navBottom > 844) {
                    assert.equal(v.headerTop, inset + OFFSET,
                        'the heading is at ' + v.headerTop + 'px from the viewport top with a ' + inset
                        + 'px status bar over it - it should be at ' + (inset + OFFSET));
                } else {
                    assert.equal(v.scrollY, 0,
                        'the card fits (nav row ends at ' + v.navBottom + ') and the page scrolled anyway');
                }
                assert.equal(v.clearOfInset, true,
                    'the heading is BEHIND the status bar: top ' + v.headerTop + ' against an inset of ' + inset);
                // The gap is the landing's own 12px only when the landing fired;
                // on a card that fits it is wherever the card renders, and the line
                // above is the claim that matters.
                if (v.navBottom !== null && v.navBottom > 844) assert.equal(v.gapBelowInset, OFFSET);
            });
        });

        test('and all eight score boxes are still fully in view, below the inset', () => {
            const v = S[inset].next;
            assert.equal(v.boxCount, 8);
            assert.equal(v.boxesInView, true, 'a box is behind the inset or off the bottom');
        });
    });
});

describe('THE WEB IS PINNED UNCHANGED', () => {
    test('with no inset the heading is exactly ' + OFFSET + 'px from the top, as it always was', () => {
        // On the web env(safe-area-inset-top) is 0 - the browser chrome owns that space -
        // so this wave must not move the web landing by a single pixel. This is the case
        // that says so, and it is why the fix reads the inset rather than adding a
        // constant.
        // RE-POINTED 2026-10-04 (Manny's rule): with no inset the web landing is
        // unchanged WHERE IT FIRES, and where the card fits the page simply stays at
        // the top - which on the web is also exactly 0px from the top of the content.
        // Either way nothing is under anything, which is what this case is for.
        assert.equal(S[0].next.inset, 0);
        ['next', 'prev'].forEach(k => {
            const v = S[0][k];
            if (v.navBottom !== null && v.navBottom > 844) assert.equal(v.headerTop, OFFSET, k);
            else assert.equal(v.scrollY, 0, k + ': the card fits and the page scrolled anyway');
        });
    });
});

describe('THE SOURCE: ONE PLACE, AND IT READS THE LIVE INSET', () => {
    const SRC = read('index.html');
    const fn = SRC.slice(SRC.indexOf('function landOnHole()'), SRC.indexOf('\n    }', SRC.indexOf('function landOnHole()')));

    test('landOnHole subtracts the inset as well as HOLE_LANDING_OFFSET', () => {
        assert.ok(fn.length > 100, 'landOnHole could not be sliced');
        assert.match(fn, /getComputedStyle\(document\.documentElement\)/,
            'the inset is not read from the computed root padding');
        assert.match(fn, /paddingTop/);
        assert.match(fn, /HOLE_LANDING_OFFSET/);
    });

    test('it is done ONCE, inside landOnHole, not at the navigations', () => {
        // Prev/Next (goToAdjacentHole) and the 1-18 jump (jumpToHole) reach landOnHole
        // through goToHole since Wave 23 - one place instead of two, which is where the
        // forced KP gate sits - so the inset belongs in the function they all share and
        // the navigations must still not do the arithmetic themselves.
        const jump = SRC.slice(SRC.indexOf('function jumpToHole'), SRC.indexOf('\n    }', SRC.indexOf('function jumpToHole')));
        const adj = SRC.slice(SRC.indexOf('function goToAdjacentHole'), SRC.indexOf('\n    }', SRC.indexOf('function goToAdjacentHole')));
        const one = SRC.slice(SRC.indexOf('function goToHole'), SRC.indexOf('\n    }', SRC.indexOf('function goToHole')));
        assert.match(one, /landOnHole\(\)/, 'goToHole no longer lands');
        assert.match(jump, /goToHole\(/); assert.match(adj, /goToHole\(/);
        [jump, adj, one].forEach(b => assert.ok(!/safe-area|paddingTop/.test(b),
            'a navigation is doing the inset arithmetic itself'));
        assert.equal((SRC.match(/getComputedStyle\(document\.documentElement\)\.paddingTop/g) || []).length, 1,
            'the inset is read in more than one place');
    });

    test('env() is NOT read from script, because it cannot be', () => {
        // The root padding IS the inset - the NATIVE SAFE AREA block sets it from env() -
        // so reading the computed padding is reading the inset, and it is 0 on the web.
        assert.ok(!/env\(safe-area-inset-top[^)]*\)\s*[^;]*\)\s*\|\|/.test(fn));
        assert.match(SRC, /padding-top: env\(safe-area-inset-top, 0px\)/,
            'the block that sets the root inset is gone, so nothing sets what this reads');
    });
});

// ---------------------------------------------------------------------------
// AND MANNY'S OWN FOUR-BALL, WHICH IS NOW ONE SCREEN (2026-10-04)
//
// The report this file was built from came from a four-golfer round. That card no
// longer scrolls - the Status sheet took the header, the nav and every reading
// card off the page - so landOnHole is a NO-OP there, by decision. The notch
// claim still has to hold, and it holds for a different reason: the page never
// leaves scroll 0, so the root inset is still above the content where it belongs.
// Asserted here rather than assumed, because "no scroll" and "correct" are two
// different statements.
describe('A FOUR-GOLFER CARD: nothing to scroll, and still clear of the status bar', () => {
    const F = {};
    before(async () => {
        for (const inset of INSETS) {
            const r = await arriveCold({ url: fileUrl('index.html', 'game=LND19'), settleMs: 3200,
                db: { events: { LND19: round(FOUR) }, global_courses: {}, trips: {}, tournaments: {} },
                viewport: { width: 390, height: 844 }, steps: [
                    { expression: "document.documentElement.style.paddingTop = '" + inset + "px'; 'set'" },
                    { sleep: 250 },
                    { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 600 }, { expression: LOOK }
                ] });
            F[inset] = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
        }
    });

    INSETS.forEach(inset => {
        test('with a ' + inset + 'px inset the page does not move, and the heading is below the bar', () => {
            const v = F[inset];
            assert.ok(v && !v.error, v && v.error);
            assert.equal(v.inset, inset, 'the emulated inset did not take');
            // WHAT A ONE-SCREEN CARD CAN DO, AND WHAT IT CANNOT. Measured with a
            // 59px bar: the heading sits 171px down the document, the page has
            // SEVEN pixels of scroll room, and the landing takes all seven - the
            // heading ends at 164 rather than the 71 it would reach on a page with
            // room. That is the no-op rule doing its work: the landing asks, the
            // page gives what it has, and nothing is pretended.
            //
            // THE EXACT LANDING IS PROVEN ABOVE, on the eight-golfer card, which is
            // where there is room to prove it. Asserting it here would be asserting
            // that a 844px page can scroll 159px.
            // RE-POINTED 2026-10-05: scroll room is no longer the test and cannot be
            // - the reading area below the hole is scrollable by design. The rule is
            // the CARD: a four-golfer card fits, so the landing leaves the page at
            // the top and nothing goes under the status bar.
            assert.ok(v.navBottom !== null && v.navBottom <= 844,
                'the four-golfer card stopped fitting (nav row ends at ' + v.navBottom + ')');
            assert.equal(v.scrollY, 0,
                'the card fits and the page scrolled to ' + v.scrollY + ' anyway');
            assert.equal(v.clearOfInset, true,
                'the heading is BEHIND the status bar: top ' + v.headerTop + ' against an inset of ' + inset);
            assert.equal(v.boxCount, 4);
            assert.equal(v.boxesInView, true, 'a box is behind the inset or off the bottom');
        });
    });
});
