// ============================================================================
// THE GUIDE'S CONTROLS, AND THE GOLFER'S ROUTE TO IT (UI Wave 8b)
//
// instructions.html is the only page in the app that has never had a control pass.
// Waves 5 to 7 built a button system on the setup screen - one width, one height,
// one gap, every label centred, every target >= 44px - and this page was not in
// any of them. Measured cold at 390x844 before this wave, ALL TEN of its controls
// were under 44px:
//
//     ← Back to Home        16 x 109      an inline anchor with no box at all
//     🌙 Dark Mode          34 x 106
//     eight jump-nav pills  29 x 65..149
//
// A 16px tap target is not a small problem with a big one hiding behind it; it is
// the whole problem. So this file measures every control on the page, and it
// measures the NEW ROUTE at the bottom of the scorecard in the same run, because a
// route a thumb cannot hit is the same defect as no route.
//
// WHY CHROME. mini-dom's getBoundingClientRect() returns a hard-coded zero rect,
// so the harness cannot tell 16px from 44px - and CLAUDE.md forbids teaching it to
// fake one. Every number here is a rect Chrome laid out.
//
// WHY A RANGE FOR THE LABEL. Wave 6 found a control with a correct box height and
// its text jammed at the top: "the box is 48px" and "the label is centred in the
// box" are different claims. The text rect is measured with a Range over the
// element's own contents, and the guard compares the gap above to the gap below.
//
// TWO LINKS ARE DELIBERATELY EXEMPT, and the exemption is asserted rather than
// assumed. The sentence above the jump nav reads "If somebody sent you a link,
// start at You were sent a link" with the door names as anchors inside the
// sentence. Those are PROSE - raising them to 44px would mean styling two words in
// the middle of a paragraph as buttons, and it would break the line. The guard
// therefore checks that each exempt link really is inside a <p>, so the exemption
// cannot quietly widen to cover a real control that drifted into being small.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const MIN_TAP = 44;

// A round that renders the whole scorecard, so the bottom stack is real markup on
// a real page rather than a fragment. No ?group=, so the organizer arm renders -
// the arm that also carries the delete control the guide link must sit above.
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const ROUNDS = {
    W8BGDE: {
        eventName: 'Wave 8b guide route', gameFormat: 'stroke',
        players: [
            { id: 101, name: 'Ann Adams', hcp: '2', playingForMoney: true },
            { id: 102, name: 'Bob Brown', hcp: '6', playingForMoney: true },
        ],
        courseData: CD, scores: {}, settlementMode: 'whole-dollar',
    },
};

// Read back as a JSON STRING and parsed here. A structured value handed across the
// CDP boundary arrives with a foreign prototype, and assert.deepEqual then fails on
// prototype identity rather than on content.
const GUIDE_MEASURE = `(function () {
    var range = document.createRange();
    function box(el) {
        var b = el.getBoundingClientRect();
        var t = null;
        try {
            range.selectNodeContents(el);
            var tb = range.getBoundingClientRect();
            if (tb.height > 0) {
                t = { top: Math.round(tb.top - b.top), bottom: Math.round(b.bottom - tb.bottom) };
            }
        } catch (e) { t = null; }
        return {
            tag: el.tagName, cls: String(el.className || ''), id: el.id || '',
            text: String(el.innerText || '').trim().slice(0, 30),
            h: Math.round(b.height), w: Math.round(b.width),
            left: Math.round(b.left),
            inProse: !!el.closest('p, li'),
            display: getComputedStyle(el).display,
            textGap: t
        };
    }
    var all = [].slice.call(document.querySelectorAll('a, button, input, select')).map(box);
    var pills = [].slice.call(document.querySelectorAll('.jump-nav a')).map(box);
    var nav = document.querySelector('.jump-nav');
    return JSON.stringify({
        all: all, pills: pills,
        navPresent: !!nav,
        navH: nav ? Math.round(nav.getBoundingClientRect().height) : -1,
        docHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        sectionsOnPage: ['for-golfers', 'for-organizers', 'formats', 'side-games',
            'side-matches', 'money', 'offline', 'trips']
            .filter(function (id) { return !!document.getElementById(id); }).length
    });
})();`;

const CARD_MEASURE = `(function () {
    var range = document.createRange();
    function box(el) {
        if (!el) return null;
        var b = el.getBoundingClientRect();
        var t = null;
        try {
            range.selectNodeContents(el);
            var tb = range.getBoundingClientRect();
            if (tb.height > 0) {
                t = { top: Math.round(tb.top - b.top), bottom: Math.round(b.bottom - tb.bottom) };
            }
        } catch (e) { t = null; }
        return {
            tag: el.tagName, h: Math.round(b.height), w: Math.round(b.width),
            left: Math.round(b.left), top: Math.round(b.top + window.scrollY),
            href: el.getAttribute ? (el.getAttribute('href') || '') : '',
            text: String(el.innerText || '').trim().slice(0, 30),
            onScreen: el.getClientRects().length > 0,
            textGap: t
        };
    }
    var guide = document.querySelector('a[href="instructions.html"]');
    var boxes = [].slice.call(document.querySelectorAll('.save-exit-box'));
    // The control in each bottom card, in document order, so "one height" is a
    // comparison against the cards that were already there.
    var stack = boxes.map(function (bx) {
        var c = bx.querySelector('.btn-primary');
        var r = box(c);
        if (r) { r.card = String((bx.querySelector('h3') || {}).innerText || '').trim().slice(0, 30); }
        return r;
    }).filter(Boolean);
    var holeView = document.getElementById('hole-view-container');
    return JSON.stringify({
        guide: box(guide),
        guideInSaveExitBox: !!(guide && guide.closest('.save-exit-box')),
        guideInNav: !!(guide && guide.closest('.top-nav-bar')),
        stack: stack,
        navPillCount: document.querySelectorAll('.top-nav-bar .top-nav-item').length,
        scoreEntryBottom: holeView
            ? Math.round(holeView.getBoundingClientRect().bottom + window.scrollY) : -1,
        docHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
    });
})();`;

let G = null;   // the guide, measured
let C = null;   // the scorecard, measured

describe('THE GUIDE PAGE: EVERY CONTROL IS A REAL TAP TARGET', () => {

    before(async () => {
        const r = await arriveCold({
            url: fileUrl('instructions.html'), viewport: { width: 390, height: 844 },
            settleMs: 700, steps: [{ expression: GUIDE_MEASURE }],
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
        assert.equal(raw.length, 1, 'expected one measurement: ' + JSON.stringify(r.value));
        G = JSON.parse(raw[0]);
        // THE POSITIVE HALF. Every assertion below is about a height, and a page
        // that rendered nothing has no heights to be wrong about.
        assert.ok(G.docHeight > 3000, 'the guide did not render: doc ' + G.docHeight);
        assert.equal(G.sectionsOnPage, 8, 'the guide lost a section: ' + G.sectionsOnPage);
        assert.ok(G.navPresent, 'the jump nav is gone');
        assert.equal(G.pills.length, 8, 'expected eight jump-nav pills, found ' + G.pills.length);
    }, { timeout: 90000 });

    test('every control is at least 44px tall', () => {
        const controls = G.all.filter(c => !c.inProse);
        assert.ok(controls.length >= 10,
            'only ' + controls.length + ' controls found - the sweep is not reaching the page');
        const small = controls.filter(c => c.h < MIN_TAP);
        assert.deepEqual(small.map(c => c.text + ' ' + c.h + 'x' + c.w), [],
            'these controls are under ' + MIN_TAP + 'px. Measured before Wave 8b: '
            + 'Back to Home 16x109, Dark Mode 34x106, eight pills at 29.');
    });

    test('the two links inside a sentence are prose, and that is why they are exempt', () => {
        // The exemption is held to its reason. If a REAL control ever drifts inside a
        // <p>, this count changes and the guard says so rather than excusing it.
        const prose = G.all.filter(c => c.inProse);
        assert.equal(prose.length, 2,
            'the prose-link exemption covers ' + prose.length + ' links, not the two door '
            + 'references in the sentence above the jump nav: '
            + JSON.stringify(prose.map(p => p.text)));
        prose.forEach(p => assert.match(p.text, /sent a link|setting up the round/i,
            'an unexpected link is inside prose and is being exempted: ' + p.text));
    });

    test('the jump nav is ONE height, and every label is centred in its pill', () => {
        const heights = [...new Set(G.pills.map(p => p.h))];
        assert.deepEqual(heights, [MIN_TAP],
            'the pills are not one height: ' + heights.join(', '));
        G.pills.forEach(p => {
            assert.ok(p.textGap, 'no text measured in pill "' + p.text + '"');
            assert.ok(Math.abs(p.textGap.top - p.textGap.bottom) <= 1,
                'the label sits off centre in "' + p.text + '": ' + p.textGap.top
                + 'px above, ' + p.textGap.bottom + 'px below. A correct box height with '
                + 'the text jammed at the top is the defect Wave 6 measured.');
        });
    });

    test('nothing on the guide overflows the phone', () => {
        assert.equal(G.scrollWidth, G.innerWidth,
            'the guide scrolls sideways: ' + G.scrollWidth + ' > ' + G.innerWidth);
    });
});

describe('THE SCORECARD CARRIES THE GOLFER\'S ROUTE TO THE GUIDE', () => {

    before(async () => {
        const r = await arriveCold({
            url: fileUrl('index.html', 'game=W8BGDE'), rounds: ROUNDS,
            viewport: { width: 390, height: 844 }, settleMs: 3000,
            steps: [{ expression: CARD_MEASURE }],
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
        assert.equal(raw.length, 1, 'expected one measurement: ' + JSON.stringify(r.value));
        C = JSON.parse(raw[0]);
        // POSITIVE: the scorecard actually rendered a round. Without this, "the link
        // is below score entry" is true of a page with no score entry on it.
        assert.ok(C.scoreEntryBottom > 200,
            'the scorecard did not render a hole view: ' + C.scoreEntryBottom);
        // The stack's own existence, not its size. The card COUNT belongs to the
        // tests below: asserting >= 3 here made a missing guide link fail the hook
        // and take all four tests down with one message, so none of them could be
        // shown failing on its own claim.
        assert.ok(C.stack.length >= 2,
            'the bottom stack has ' + C.stack.length + ' cards, so there is nothing to compare');
    }, { timeout: 90000 });

    test('the guide link is ON the rendered scorecard', () => {
        assert.ok(C.guide, 'no a[href="instructions.html"] on index.html - the golfer '
            + 'door still has no door');
        assert.ok(C.guide.onScreen, 'the guide link is in the DOM and renders nothing');
        assert.ok(C.guideInSaveExitBox,
            'the link is not in the .save-exit-box stack at the bottom of the card');
        assert.ok(!C.guideInNav, 'the link went into the nav bar. Measured at 390px, a '
            + 'ninth pill takes that wrapping bar to another row on every screen of '
            + 'the round; the bottom of the card costs no fold space.');
        assert.equal(C.navPillCount, 8, 'the nav bar gained or lost a pill: ' + C.navPillCount);
    });

    test('it sits BELOW score entry, so it costs no fold space', () => {
        assert.ok(C.guide.top > C.scoreEntryBottom,
            'the guide link is at y=' + C.guide.top + ' and score entry ends at y='
            + C.scoreEntryBottom + '. It is above the score inputs, which is the one '
            + 'place this wave said it must not be.');
    });

    test('it is one shape with the cards already in that stack', () => {
        const others = C.stack.filter(s => s.href !== 'instructions.html');
        assert.ok(others.length >= 2, 'nothing to compare against: ' + JSON.stringify(C.stack));
        const w = [...new Set(others.map(s => s.w))];
        const h = [...new Set(others.map(s => s.h))];
        const l = [...new Set(others.map(s => s.left))];
        assert.equal(w.length, 1, 'the stack was already inconsistent in width: ' + w.join(', '));
        assert.equal(h.length, 1, 'the stack was already inconsistent in height: ' + h.join(', '));
        const g = C.stack.find(s => s.href === 'instructions.html');
        assert.ok(g, 'the guide control is not one of the stack\'s .btn-primary controls');
        assert.equal(g.w, w[0], 'the guide control is ' + g.w + 'px wide, the others ' + w[0]);
        assert.equal(g.h, h[0], 'the guide control is ' + g.h + 'px tall, the others ' + h[0]
            + '. An <a> gets no border-box from the UA stylesheet and no block display, '
            + 'which is how it laid out 148x42 before the rule was written.');
        assert.equal(g.left, l[0], 'the guide control starts at ' + g.left + ', the others ' + l[0]);
        assert.ok(g.h >= MIN_TAP, 'the guide control is under ' + MIN_TAP + 'px: ' + g.h);
        assert.ok(g.textGap && Math.abs(g.textGap.top - g.textGap.bottom) <= 1,
            'the label is not centred in the guide control: ' + JSON.stringify(g.textGap));
    });

    test('adding it did not make the scorecard scroll sideways', () => {
        assert.equal(C.scrollWidth, C.innerWidth,
            'index.html scrolls sideways: ' + C.scrollWidth + ' > ' + C.innerWidth);
    });
});
