// ============================================================================
// THE MATCHES BOX CANNOT BE WIDER THAN THE PHONE (2026-10-07)
//
// FOUND BY MANNY on an iPhone 17 Pro Max simulator, finished round: the live
// matches box ran off the right of the screen and the amounts were cut off -
// "Manny/Tim 6&5 - FINAL ... +$20" with the money past the edge.
//
// MEASURED IN CHROME at 390x844 (tools/match-card-overflow-check.js), against
// main 04f5fd1:
//
//   the 1fr column          342px
//   the .lm-card in it      462px      <- it never shrank to its column
//   document.scrollWidth    486px      <- so the PAGE scrolled sideways
//   amounts off screen      26 of 26   right edge 475 at a 390px viewport
//
// After the fix: column 342, card 342, scrollWidth 390, 0 amounts off screen,
// 0 results clipped.
//
// WHY. A grid item is min-width:auto, which means min-content, and this card
// has long nowrap rows - so instead of shrinking to the 1fr column it widened
// it. Forced to 342px by hand the card laid out perfectly, which is what says
// the defect was the missing min-width and not the contents.
//
// THIS FILE IS THE SOURCE HALF OF THE PAIR, and it is the weaker half: it can
// see the rule but not the layout. mini-dom has no layout at all -
// getBoundingClientRect() returns zeros - so "is this box wider than the
// screen" is a question the suite genuinely cannot ask, and CLAUDE.md says not
// to teach it to lie about one. tools/match-card-overflow-check.js is the
// rendered half and the one that measured the numbers above; this one exists so
// the property cannot be deleted without the suite going red.
//
// BASELINE, against main 04f5fd1 (index.html sha 92a6316444896908 is the FIXED
// file; main's is the one in that commit): 4 tests, 1 pass / 3 fail. The one
// that passes there is the amount's nowrap, which main already had - a
// don't-regress pin, correctly inert, not a caught defect.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// BOTH COPIES. index.html draws this card on Hole View and leaderboard.html
// draws the same card from the same builder; a fix to one is a fix to half the
// app, which is the defect this repo has paid for before (two entry points, one
// builder - and here, two stylesheets).
const PAGES = ['index.html', 'leaderboard.html'];
const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// The rule's own text, from "{" to "}" - not a hand-written next-selector,
// which is a guess about file order.
function ruleFor(css, selector) {
    const at = css.indexOf(selector + ' {');
    if (at === -1) return null;
    const close = css.indexOf('}', at);
    return close === -1 ? null : css.slice(at, close + 1);
}

describe('THE LIVE MATCH CARD FITS A 390px PHONE', () => {

    PAGES.forEach((page) => {
        test(page + ': .lm-card is allowed to shrink to its column', () => {
            const rule = ruleFor(src(page), '.lm-card');
            // POSITIVE ASSERTION FIRST: a slice that found nothing satisfies
            // every "must contain" below by being compared against null, and a
            // renamed card would otherwise pass silently forever.
            assert.ok(rule, '.lm-card has no rule in ' + page + ' any more - this test is guarding nothing');
            assert.match(rule, /background:/, '.lm-card rule in ' + page + ' parsed as something that is not the card rule: ' + rule.slice(0, 80));
            assert.match(rule, /min-width:\s*0/,
                page + ': .lm-card has no min-width:0, so as a grid item it sizes to min-content '
                + 'and widens the page past 390px (measured 462px in a 342px column).');
            assert.match(rule, /max-width:\s*100%/,
                page + ': .lm-card has no max-width:100%, so nothing stops it exceeding its column.');
        });
    });

    test('the RESULT text wraps instead of being ellipsised away', () => {
        // Once the card shrinks, nowrap+ellipsis is the next way to lose the
        // answer: "Manny/Tim 6&5 - FINAL" clipped to "Manny/Tim 6...". Manny's
        // instruction was to wrap or shrink the text, not to truncate it.
        const rule = ruleFor(src('index.html'), '.lm-seg-status');
        assert.ok(rule, '.lm-seg-status has no rule in index.html any more');
        assert.match(rule, /font-weight/, 'parsed something that is not the status rule: ' + rule.slice(0, 80));
        assert.doesNotMatch(rule, /white-space:\s*nowrap/,
            '.lm-seg-status is nowrap again, so a long result is cut off rather than wrapped');
        assert.doesNotMatch(rule, /text-overflow:\s*ellipsis/,
            '.lm-seg-status ellipsises the result again');
        assert.match(rule, /min-width:\s*0/, '.lm-seg-status must still be allowed to shrink inside its row');
    });

    test('but the AMOUNT keeps its nowrap, so money never breaks mid-figure', () => {
        // The one thing that must not wrap is the figure: "+$1,2" on one line
        // and "0" on the next is worse than either defect above.
        const rule = ruleFor(src('index.html'), '.lm-row-money');
        assert.ok(rule, '.lm-row-money has no rule in index.html any more');
        assert.match(rule, /white-space:\s*nowrap/,
            '.lm-row-money lost its nowrap - an amount can now break across two lines');
    });
});
