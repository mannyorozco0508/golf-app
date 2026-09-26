// ============================================================================
// THE SCORECARD DOES NOT ASK WHO IS PLAYING (UI Wave 9) — MEASURED
//
// WHY IT WENT, in numbers rather than adjectives. Measured cold at 390x844 before
// this wave, on a round of eight with one golfer confirmed and one declined:
//
//   bare link    the panel 504 x 342 at y=824, SIXTEEN buttons on it
//                hole view started at y=1334; first score input at y=1414
//   group link   the panel 319 x 342 at y=672, eight buttons
//                hole view started at y=997; first score input at y=1077
//
// So a golfer opening their own card scrolled past a 342px-wide unfilled form with
// eight or sixteen buttons to reach the boxes they came for - and the question it
// asked was already answered, because they were standing on the tee.
//
// WHAT THIS FILE PROVES THAT attendance_test.js CANNOT. That suite runs on
// mini-dom, where #hole-view-container renders 0 characters on arrival - measured,
// before and after this wave - and getBoundingClientRect returns a hard-coded zero
// rect that CLAUDE.md forbids teaching to lie. "The panel is gone AND score entry
// still works AND it moved up by this much" is a layout claim, so it is made here,
// in Chrome, against rects the browser produced. Nothing calls a page function: the
// round is delivered through the listener the page registers for itself.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

// The state a real round sits in: one answered, one declined, six silent. If the
// panel were still rendering, this is the data that would fill it.
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Ann Adams', 'Bob Brown', 'Cal Clark', 'Dee Dunn',
    'Eli Ford', 'Fay Gray', 'Gus Hall', 'Hal Ives'];
const ROUNDS = {
    W9ATT: {
        eventName: 'Wave 9', gameFormat: 'stroke',
        players: NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i), playingForMoney: true })),
        courseData: CD, scores: {}, settlementMode: 'whole-dollar',
        attendance: { 101: { status: 'in', at: 1 }, 102: { status: 'out', at: 2 } },
    },
};

const MEASURE = `(function () {
    var hv = document.getElementById('hole-view-container');
    var b = hv ? hv.getBoundingClientRect() : null;
    var firstInput = document.querySelector('#hole-view-container input');
    var text = String(document.body.innerText || '');
    return JSON.stringify({
        // innerText, never textContent: this page keeps its whole application in an
        // inline <script>, and textContent would match the source of the very
        // function this wave deleted.
        saysWhosPlaying: /who's playing/i.test(text),
        // NOT a bare /your group/: the KP question asks "Did anyone in your group
        // get inside it?" and the spectator banner says "your group's link", both
        // unrelated to this panel and both correct. The panel's own note is unique.
        saysGroupNote: /confirm for this group/i.test(text),
        // The panel's own words. "Confirm" alone is too common to assert on.
        saysHaventAnswered: /haven't answered/i.test(text),
        saysCantMakeIt: /can't make it/i.test(text),
        saysTapYourName: /tap your name before tee time/i.test(text),
        mountInDom: !!document.getElementById('attendance-mount'),
        noteInDom: !!document.getElementById('attendance-note'),
        attButtons: document.querySelectorAll('[data-att-id]').length,
        holeViewTop: b ? Math.round(b.top + window.scrollY) : -1,
        holeViewHeight: b ? Math.round(b.height) : -1,
        holeViewRenders: !!(hv && hv.getClientRects().length > 0 && b.height > 0),
        scoreInputs: document.querySelectorAll('#hole-view-container input').length,
        firstScoreInputTop: firstInput
            ? Math.round(firstInput.getBoundingClientRect().top + window.scrollY) : -1,
        docHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        playersPill: /Players/.test(text)
    });
})();`;

// Measured on 8a72aa3, the commit this wave is cut from, with the same fixture.
// Held as named constants so the report's numbers and the test's are one thing.
const BEFORE = {
    bare: { holeViewTop: 1334, firstScoreInputTop: 1414, docHeight: 3548 },
    group: { holeViewTop: 997, firstScoreInputTop: 1077, docHeight: 2420 },
};

let BARE = null;
let GROUP = null;

async function arrive(search) {
    const r = await arriveCold({
        url: fileUrl('index.html', search), rounds: ROUNDS, settleMs: 3200,
        viewport: { width: 390, height: 844 }, steps: [{ expression: MEASURE }],
    });
    assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
    const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
    assert.equal(raw.length, 1, 'expected one measurement: ' + JSON.stringify(r.value));
    return JSON.parse(raw[0]);
}

describe('THE SCORECARD, ARRIVED AT COLD, ASKS NOBODY TO CONFIRM', () => {

    before(async () => {
        BARE = await arrive('game=W9ATT');
        GROUP = await arrive('game=W9ATT&group=1');
        // THE POSITIVE HALF FIRST. Every assertion below is about something being
        // absent, and an absent panel is trivially true of a page that rendered
        // nothing at all - which is the exact failure this wave could cause.
        [['bare', BARE], ['group', GROUP]].forEach(([name, v]) => {
            assert.ok(v.holeViewRenders, name + ': the hole view rendered nothing');
            assert.ok(v.scoreInputs > 0, name + ': no score inputs on the card');
            assert.ok(v.docHeight > 800, name + ': the page barely rendered: ' + v.docHeight);
        });
    }, { timeout: 120000 });

    test('score entry is there, on both links', () => {
        assert.ok(BARE.scoreInputs >= 8,
            'the bare link shows ' + BARE.scoreInputs + ' score inputs for eight golfers');
        assert.ok(GROUP.scoreInputs >= 4,
            'the group link shows ' + GROUP.scoreInputs + ' score inputs for four golfers');
    });

    test('the panel is not in the DOM, and not merely hidden', () => {
        // display:none would not do. A hidden panel is still 342px of markup a
        // future style change can reveal, and it would still carry sixteen buttons
        // that write to the round. It is gone.
        [['bare', BARE], ['group', GROUP]].forEach(([name, v]) => {
            assert.equal(v.mountInDom, false, name + ': #attendance-mount is still in the DOM');
            assert.equal(v.noteInDom, false, name + ': #attendance-note is still in the DOM');
            assert.equal(v.attButtons, 0, name + ': ' + v.attButtons + ' Confirm/Can\'t buttons remain');
        });
    });

    test('none of the panel\'s sentences are on the rendered page', () => {
        // Read off innerText, so a sentence still in the file but not shown cannot
        // fail this, and a sentence shown cannot pass it.
        [['bare', BARE], ['group', GROUP]].forEach(([name, v]) => {
            assert.equal(v.saysWhosPlaying, false, name + ': still says Who\'s playing');
            assert.equal(v.saysHaventAnswered, false, name + ': still says haven\'t answered');
            assert.equal(v.saysCantMakeIt, false, name + ': still says can\'t make it');
            assert.equal(v.saysTapYourName, false, name + ': still says tap your name before tee time');
        });
        assert.equal(GROUP.saysGroupNote, false,
            'the group link still says "Confirm for this group"');
    });

    test('score entry moved UP by the panel\'s measured height, on both links', () => {
        // The point of the wave, as a number. Before: 1414 and 1077. The panel was
        // 504px tall on the bare link and 319px on the group link, and those are the
        // reductions this asserts - loosely, because a font metric may move a pixel,
        // but tightly enough that "removed" cannot pass as "shrunk a bit".
        const bareGain = BEFORE.bare.firstScoreInputTop - BARE.firstScoreInputTop;
        const groupGain = BEFORE.group.firstScoreInputTop - GROUP.firstScoreInputTop;
        assert.ok(bareGain >= 450,
            'the bare link only reclaimed ' + bareGain + 'px; the panel measured 504px '
            + '(first input was at y=' + BEFORE.bare.firstScoreInputTop + ', now y='
            + BARE.firstScoreInputTop + ')');
        assert.ok(groupGain >= 280,
            'the group link only reclaimed ' + groupGain + 'px; the panel measured 319px '
            + '(first input was at y=' + BEFORE.group.firstScoreInputTop + ', now y='
            + GROUP.firstScoreInputTop + ')');
        assert.ok(BARE.docHeight < BEFORE.bare.docHeight,
            'the bare page did not get shorter: ' + BARE.docHeight);
        assert.ok(GROUP.docHeight < BEFORE.group.docHeight,
            'the group page did not get shorter: ' + GROUP.docHeight);
    });

    test('nothing else on the card moved sideways or broke', () => {
        [['bare', BARE], ['group', GROUP]].forEach(([name, v]) => {
            assert.equal(v.scrollWidth, v.innerWidth,
                name + ': the card scrolls sideways: ' + v.scrollWidth + ' > ' + v.innerWidth);
        });
        // The organizer strip still offers the sheet this wave deliberately KEPT.
        assert.ok(BARE.playersPill, 'the 👥 Players pill is gone from the organizer strip');
    });
});
