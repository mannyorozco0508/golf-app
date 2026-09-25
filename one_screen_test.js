// ============================================================================
// THE SETUP SCREEN IS ONE SCREEN (UI Wave 7)
//
// THE POINT OF THE WAVE, ASSERTED. Measured before it: the screen was 1172px in
// an 844px viewport, and the organizer's own path - the top row, the lockup, the
// two tiles, Resume - already ended at 551.4px. Nothing was overflowing; 620px of
// material for a golfer JOINING a round was stacked under the person who is here
// to SET ONE UP. So the guard is not "make it shorter", it is:
//
//   1  the organizer's path ends inside the first viewport
//   2  the WHOLE collapsed screen ends inside the first viewport
//   3  the disclosure is CLOSED on arrival, and its three cards render nothing
//   4  a real tap opens it, and then they do render
//
// (3) IS THE ONE THAT COULD HAVE BEEN FAKED. A collapsed row that ships `open` is
// the same 1172px screen with an extra control on it - and the pattern this reuses,
// .nav-more in the wizard's nav bar, ships with `open` on it. So the absence of
// that attribute is asserted in the markup AND the closed state is measured.
//
// NO aria-expanded ON THE SUMMARY, and that is asserted rather than left to
// drift. <details>/<summary> conveys expanded state natively; ARIA-in-HTML treats
// a hand-written aria-expanded there as redundant at best and conflicting at
// worst. Getting the literal attribute would mean a button+region pattern, which
// would be a SECOND disclosure pattern on a page that already has one.
//
// mini-dom can prove none of this - getBoundingClientRect returns a hard-coded
// zero rect there - so this drives Chrome at a phone size. Nothing calls a page
// function: it arrives at admin.html with no query string and taps what a thumb
// would tap.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const DB = { events: {}, global_courses: {}, trips: {}, tournaments: {}, seasons: {} };

// A used phone: a round to resume and a season to reopen, so every optional block
// that COULD lengthen the screen is on it. Measuring the empty case would be
// measuring the easy one.
const SEED = `(function () { try {
    localStorage.setItem('lastRoomCode', 'SEED1');
    localStorage.setItem('hardpanSeasons', JSON.stringify([{ code: 'WNTR1', name: 'Winter League' }]));
} catch (e) {} })();`;

const CARDS = ['#open-round-card', '#copy-round-card', '#season-lobby'];

const MEASURE = `(function () {
    var lobby = document.getElementById('lobby-screen');
    var vh = window.innerHeight;
    var sy = window.scrollY || document.documentElement.scrollTop || 0;
    function onScreen(sel) {
        var el = document.querySelector(sel);
        return !!(el && el.getClientRects().length > 0);
    }
    function box(sel) {
        var el = document.querySelector(sel);
        if (!el || el.getClientRects().length === 0) return null;
        var r = el.getBoundingClientRect();
        return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
                 left: Math.round(r.left * 10) / 10,
                 bottomAbs: Math.round((r.bottom + sy) * 10) / 10 };
    }
    var det = document.getElementById('open-else');
    var sum = det ? det.querySelector('summary') : null;
    var chev = sum ? getComputedStyle(sum, '::after') : null;
    var desc = {};
    ['#hw-trip .hw-desc', '#hw-quick .hw-desc'].forEach(function (s) {
        var el = document.querySelector(s);
        if (!el) { desc[s] = null; return; }
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        var p = document.createElement('span');
        p.style.cssText = 'position:absolute;left:-9999px;white-space:pre;font-family:' + cs.fontFamily
            + ';font-weight:' + cs.fontWeight + ';font-size:' + cs.fontSize
            + ';letter-spacing:' + cs.letterSpacing;
        p.textContent = el.innerText;
        document.body.appendChild(p);
        var needs = p.getBoundingClientRect().width;
        p.parentNode.removeChild(p);
        desc[s] = {
            text: (el.innerText || '').trim(),
            w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
            lines: Math.max(1, Math.round(r.height / lh)),
            needs: Math.round(needs * 10) / 10,
            whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow
        };
    });
    return JSON.stringify({
        viewportH: vh,
        screenH: Math.round(lobby.getBoundingClientRect().height * 10) / 10,
        organizerEnd: (function () { var b = box('#resume-container'); return b ? b.bottomAbs : null; })(),
        detailsPresent: !!det,
        detailsOpen: !!(det && det.open),
        detailsHasOpenAttr: !!(det && det.hasAttribute('open')),
        summaryOnScreen: onScreen('#open-else summary'),
        summaryBox: box('#open-else summary'),
        summaryAria: sum ? sum.getAttribute('aria-expanded') : '(no summary)',
        chevronContent: chev ? chev.content : null,
        chevronTransform: chev ? chev.transform : null,
        cardsOnScreen: ${JSON.stringify(CARDS)}.map(onScreen),
        framingOnScreen: onScreen('#event-type-framing'),
        standingOnLobby: onScreen('#lobby-standing'),
        lobbyLeadOnScreen: onScreen('.lobby-lead'),
        darkModeBox: box('.theme-toggle-btn'),
        darkModeLabel: (function () { var b = document.querySelector('.theme-toggle-btn');
            return b ? { aria: b.getAttribute('aria-label'), text: (b.innerText || '').trim() } : null; })(),
        topRowBox: box('.lobby-account-row'),
        darkModeInTopRow: (function () {
            var row = document.querySelector('.lobby-account-row');
            var b = document.querySelector('.theme-toggle-btn');
            return !!(row && b && row.contains(b));
        })(),
        seasonStart: box('#season-start-link'),
        desc: desc
    });
})()`;

let A = null;   // on arrival
let B = null;   // after a real tap on the summary

describe('ONE SCREEN (setup screen, real Chrome at 390x844)', () => {

    before(async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', ''), db: DB, settleMs: 2600,
            viewport: { width: 390, height: 844 }, preScript: SEED,
            steps: [
                { expression: MEASURE },
                { tap: '#open-else summary' },
                { sleep: 350 },
                { expression: MEASURE }
            ]
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
        assert.equal(objs.length, 2, 'expected two measurements: ' + JSON.stringify(r.value));
        [A, B] = objs;
        // THE POSITIVE HALF: the screen rendered and the organizer's own controls
        // are on it. Every assertion below is about a height or an absence, and a
        // blank page satisfies most of them.
        assert.ok(A.organizerEnd > 200, 'the organizer path did not render: ' + A.organizerEnd);
        assert.ok(A.lobbyLeadOnScreen, 'the question above the tiles is gone');
        assert.ok(A.summaryOnScreen, 'the disclosure row is not on screen');
    }, { timeout: 90000 });

    test('1. THE ORGANIZER PATH ENDS INSIDE THE FIRST VIEWPORT', () => {
        assert.ok(A.organizerEnd <= A.viewportH,
            "the organizer's path ends at " + A.organizerEnd + 'px in a '
            + A.viewportH + 'px viewport');
    });

    test('2. THE WHOLE COLLAPSED SCREEN ENDS INSIDE THE FIRST VIEWPORT', () => {
        // The wave in one number. It was 1172.
        assert.ok(A.screenH <= A.viewportH,
            'the collapsed screen is ' + A.screenH + 'px in a ' + A.viewportH + 'px viewport');
    });

    test('3. THE DISCLOSURE IS CLOSED ON ARRIVAL, in the markup and on screen', () => {
        assert.equal(A.detailsPresent, true, 'there is no disclosure');
        // THE MARKUP, because .nav-more - the pattern this reuses - ships `open`,
        // and copying that would give the same long screen with an extra control.
        const tag = /<details[^>]*id="open-else"[^>]*>/.exec(ADMIN);
        assert.ok(tag, 'the disclosure is not a <details> with that id');
        // THE ATTRIBUTE, not the substring. My first version tested /\bopen\b/ and
        // failed on this element's own id - "open-else" contains the word. Read the
        // attribute off the DOM, and keep a source check that requires `open` to be
        // standing on its own rather than living inside a value.
        assert.equal(A.detailsHasOpenAttr, false,
            'the disclosure ships with the open attribute - that is the whole wave undone');
        assert.ok(!/\sopen(?=[\s=>])/.test(tag[0]),
            'the disclosure ships OPEN - that is the whole wave undone: ' + tag[0]);
        // And on screen.
        assert.equal(A.detailsOpen, false, 'the disclosure is open on arrival');
        assert.deepEqual(A.cardsOnScreen, [false, false, false],
            'a card renders before the row is tapped: ' + JSON.stringify(A.cardsOnScreen));
    });

    test('4. A REAL TAP OPENS IT, and all three cards then render', () => {
        // Without this, test 3 is satisfied by a row that does nothing at all.
        assert.equal(B.detailsOpen, true, 'tapping the row did not open it');
        assert.deepEqual(B.cardsOnScreen, [true, true, true],
            'a card did not render after the tap: ' + JSON.stringify(B.cardsOnScreen));
        assert.ok(B.screenH > A.screenH,
            'the screen did not grow when the row opened: ' + A.screenH + ' -> ' + B.screenH);
    });

    test('the row is a real touch target with a chevron that turns', () => {
        assert.ok(A.summaryBox, 'the summary has no box');
        assert.equal(A.summaryBox.h, 48, 'the row is ' + A.summaryBox.h + 'px tall, not --ctl-h');
        assert.ok(A.chevronContent && A.chevronContent !== 'none',
            'there is no chevron: ' + A.chevronContent);
        // Closed: no rotation. Open: rotated. Read off the pseudo-element rather
        // than pinned in source, so a rule that stops applying is caught.
        const flat = (t) => !t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
        assert.ok(flat(A.chevronTransform),
            'the chevron is already turned while closed: ' + A.chevronTransform);
        assert.ok(!flat(B.chevronTransform),
            'the chevron does not turn when open: ' + B.chevronTransform);
    });

    test('NO aria-expanded on the summary — the element already conveys it', () => {
        assert.equal(A.summaryAria, null,
            'aria-expanded was added to a <summary>, which already conveys expanded '
            + 'state natively; a hand-written one is redundant at best and '
            + 'conflicting at worst');
        assert.ok(!/<summary[^>]*aria-expanded/.test(ADMIN),
            'a summary in the markup carries aria-expanded');
    });

    test('the joiner material is GONE from the first screen, and the question stays', () => {
        assert.equal(A.framingOnScreen, false,
            'the Game Day framing sentence is still on the lobby');
        assert.equal(A.standingOnLobby, false,
            'the trial standing line is still on the lobby - it belongs in the '
            + 'Account panel, because it is standing rather than a control');
        // KEPT, deliberately: the question is what makes the two tiles a question.
        assert.equal(A.lobbyLeadOnScreen, true, '"What are you setting up?" was cut too');
    });

    test('dark mode is a 44px icon on the top row, and the row is still --ctl-h', () => {
        assert.equal(A.darkModeInTopRow, true, 'the dark-mode control still owns its own row');
        assert.ok(A.darkModeBox, 'the dark-mode control is gone');
        assert.ok(A.darkModeBox.w >= 44, 'it is ' + A.darkModeBox.w + 'px wide');
        assert.ok(A.darkModeBox.h >= 44, 'it is ' + A.darkModeBox.h + 'px tall');
        assert.ok(A.darkModeLabel && A.darkModeLabel.aria,
            'an icon button with no aria-label says nothing to a screen reader');
        // THE ROW IS THE THING THAT BROKE IN THE RECON: with the old padding still
        // on the icon the row grew to 60px, which fails the one-height rule. The
        // fix was the icon's padding, NOT an exemption for the row.
        assert.ok(A.topRowBox, 'the top row is gone');
        assert.equal(A.topRowBox.h, 48,
            'the top row is ' + A.topRowBox.h + 'px - the one-height rule is 48');
    });

    test('the tile descriptions are ONE LINE each, and they FIT (no ellipsis)', () => {
        ['#hw-trip .hw-desc', '#hw-quick .hw-desc'].forEach(sel => {
            const d = A.desc[sel];
            assert.ok(d, sel + ' is gone');
            assert.equal(d.lines, 1, sel + ' renders on ' + d.lines + ' lines: "' + d.text + '"');
            // AND IT FITS HONESTLY. Clipping with nowrap + ellipsis would satisfy
            // "one line" while hiding the words, which is what guard 6 in
            // widget_system_test.js exists to forbid.
            assert.ok(d.needs <= d.w + 0.5,
                sel + ' needs ' + d.needs + 'px in ' + d.w + ': "' + d.text + '"');
            assert.notEqual(d.whiteSpace, 'nowrap',
                sel + ' is held on one line by nowrap rather than by being short');
            assert.notEqual(d.textOverflow, 'ellipsis', sel + ' is clipped with an ellipsis');
        });
    });

    test('"Start a season" is a link inside the card, not a full-width button', () => {
        const s = B.seasonStart;   // it lives inside the disclosure, so measure it open
        assert.ok(s, 'Start a season is gone');
        assert.ok(s.w < 200,
            'it is ' + s.w + 'px wide - still a full-width button inside the card');
        assert.ok(/#season-start-link[^}]*text-decoration:\s*underline/.test(ADMIN)
            || /w-card-link[^}]*text-decoration:\s*underline/.test(ADMIN),
            'it does not read as a link');
    });
});
