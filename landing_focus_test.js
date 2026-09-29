// ============================================================================
// THE LANDING FOCUSES THE FIRST EMPTY BOX - WHEN IT CAN (Wave 27)
//
// WHAT THIS REVERSES, AND WHY THAT IS SAFE NOW. index.html has carried this note
// since 2026-09-14, after a real round on v128:
//
//     "v128 put the FIRST SCORE BOX at the top and focused the first empty one. On
//      the course that meant the heading was above the fold - a golfer scrolled up to
//      confirm which hole they were on - and the keyboard opened over the page on
//      every Next. So the anchor is the heading element itself ... and the focus is
//      gone."
//
// Note what v128 proves: THE KEYBOARD DID OPEN. The failure was not a dead focus, it
// was the keyboard covering the page and the heading leaving the screen. Two things
// are different now:
//   1. THE LANDING ANCHORS THE HEADING, not the first box. v128 scrolled the box to
//      the top, so the heading was already off-screen before focus did anything.
//   2. THE FOCUS IS CONDITIONAL. It only happens when the box will still be CLEAR OF
//      THE KEYBOARD, so iOS has no reason to scroll it into view - and the heading
//      stays where landOnHole put it.
// Measured at 390x844, heading at inset+12, rows 73px apart, an iPhone portrait
// keyboard about 336px (so it starts at y=508):
//     boxes 0-5   top 69..434, bottom <=482   CLEAR
//     box 6       top 507, bottom 555         UNDER the keyboard
//     box 7       top 580, bottom 628         UNDER the keyboard
// So a group-locked four-golfer card focuses every time, and a card deep enough to
// put the target under the keyboard focuses nothing rather than scrolling the heading
// away. That is the whole of the new rule.
//
// FOUR REFUSALS, all of them the point:
//   a FULL hole            nothing empty to focus
//   a SPECTATOR            the box is disabled - the page's OWN rule
//                          (isLocked = roundSuperseded() || multi-group without a
//                          matching ?group=), not a second copy of it here
//   PAST THE KEYBOARD LINE the target would be under the keypad
//   no card / no boxes     fail open, navigation still happens
//
// SYNCHRONOUS, INSIDE THE TAP. focus() runs at the end of landOnHole, which runs
// inside the click handler - the same window advanceToNextScoreInput already uses
// successfully on iOS. For the KP modal the focus happens on the resumed navigation,
// and recordKpGroupAnswer's write is fire-and-forget with its session copy written
// first, so nothing awaits before the focus.
//
// WHAT I CANNOT PROVE HERE, stated rather than implied: headless Chrome has NO SOFT
// KEYBOARD. Every assertion below is about which element holds focus and where the
// heading and the box sit. Whether the keypad actually appears is an iPhone question,
// and Manny tests it on a preview before this goes near main. That limit is why the
// rule is conditional rather than unconditional - a focus that cannot open a keyboard
// should at least never move the heading.
//
// AND THE SCROLL SHIFT I REPORTED LAST TIME WAS MINE, NOT THE PRODUCT'S. I measured
// the KP modal "shifting the page 39px on open" and offered it as the nearest thing to
// Manny's landing report. It was my instrument: tools/lib/cold-arrival.js calls
// el.scrollIntoView({ block: 'center' }) before every tap, so the harness scrolls the
// Next button to the middle of the screen and the modal path has no landing afterwards
// to correct it. The tell was that the "shift" tracked the inset exactly - 39, 86, 98
// at 0, 47, 59 - while document height did not change. Pressed at the button's own
// coordinates with a raw Input.dispatchMouseEvent and NO scrollIntoView, the page does
// not move at all. The last describe pins that, using raw dispatch for exactly that
// reason.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const PL = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '0', playingForMoney: true }));
const IDS = PL.map(p => p.id);
const G1 = IDS.slice(0, 4);
const OFFSET = 12;                 // HOLE_LANDING_OFFSET

function scoresThrough(last, ids) {
    const s = {};
    (ids || IDS).forEach(id => { for (let h = 1; h <= last; h++) s['p' + id + '_h' + h] = 4; });
    return s;
}
function round(extra) {
    return Object.assign({ eventName: 'LF', courseName: 'Test', players: PL, courseData: CD,
        gameFormat: 'stroke', settlementMode: 'whole-dollar', scores: scoresThrough(7, G1) }, extra || {});
}
const KP = { enabled: true, buyIn: 25, participantIds: IDS.map(String),
    kp: { amount: 40, holes: [7, 18] }, net: { amount: 100, places: [50, 30, 20] },
    skins: { mode: 'remainder' } };

const LOOK = `(function () {
  var card = document.getElementById('hole-view-card');
  var head = card ? card.querySelector('.hole-view-header') : null;
  var boxes = [].slice.call(card ? card.querySelectorAll('.score-input') : []);
  var a = document.activeElement;
  var inset = parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;
  var r = function (e) { if (!e) return null; var b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.top + b.height) }; };
  return JSON.stringify({
    hole: (typeof currentViewedHole !== 'undefined') ? currentViewedHole : 'n/a',
    inset: inset,
    scrollY: Math.round(window.pageYOffset || 0),
    headingTop: head ? Math.round(head.getBoundingClientRect().top) : null,
    innerHeight: window.innerHeight,
    boxes: boxes.map(function (b) { return { v: b.value || '', disabled: !!b.disabled, rect: r(b) }; }),
    focusIsScoreBox: !!(a && a.classList && a.classList.contains('score-input')),
    focusedIndex: boxes.indexOf(a),
    focusedValue: (a && a.classList && a.classList.contains('score-input')) ? (a.value || '') : null,
    activeTag: a ? a.tagName : 'none'
  });
})()`;

const NEXT = [{ tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 700 }];
const PREV = [{ tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 700 }];

async function land(data, query, steps, opts) {
    const o = opts || {};
    const pre = o.inset ? [{ expression: "document.documentElement.style.paddingTop = '" + o.inset + "px'; 'set'" }, { sleep: 250 }] : [];
    const r = await arriveCold({ url: fileUrl('index.html', query),
        db: { events: { LF: data }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3200, viewport: { width: 390, height: o.height || 844 },
        steps: pre.concat(steps, [{ expression: LOOK }]) });
    return r.ok ? JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.startsWith('{')).pop())
                : { error: r.reason };
}

const S = {};
before(async () => {
    // HOLES 1-7 IN, so the page lands ITSELF on hole 8 and NEXT reaches HOLE 9. My
    // first version seeded and asserted hole 8 - one hole out - and three cases failed
    // against perfectly good code. The landed hole is never the hole Next reaches.
    S.allEmpty = await land(round(), 'game=LF&group=1', NEXT);
    // Hole 9 with Ann and Ben already in: the first EMPTY box is the third row.
    S.partly = await land(round({ scores: Object.assign(scoresThrough(7, G1),
        { p101_h9: 4, p102_h9: 5 }) }), 'game=LF&group=1', NEXT);
    // LANDING ON A COMPLETE HOLE, which takes a little arranging: the page lands on
    // the first hole MISSING a score, so scoring 1-8 lands on 9 and Next reaches an
    // EMPTY 10. My first fixture did exactly that and the case proved nothing. Score
    // 1-8 AND 10, leaving 9 open: the page lands on 9 and Next reaches a FULL 10.
    S.full = await land(round({ scores: (function () {
        const sc = scoresThrough(8, G1);
        G1.forEach(id => { sc['p' + id + '_h10'] = 4; });
        return sc;
    })() }), 'game=LF&group=1', NEXT);
    // A SPECTATOR: bare link on an eight-golfer round - every box disabled.
    S.spectator = await land(round(), 'game=LF', NEXT);
    // PAST THE KEYBOARD LINE: a short viewport puts the second row under the keypad
    // allowance, so a filled first box must leave nothing focusable.
    S.pastLine = await land(round({ scores: Object.assign(scoresThrough(7, G1), { p101_h9: 4 }) }),
        'game=LF&group=1', NEXT, { height: 500 });
    // PREV and the 1-18 PICKER follow the same rule.
    S.prev = await land(round(), 'game=LF&group=1', NEXT.concat(PREV));
    S.picker = await land(round(), 'game=LF&group=1',
        [{ tap: '.hole-jump-open' }, { sleep: 400 }, { tap: '.hole-pick-btn', nth: 8 }, { sleep: 700 }]);
    // WITH THE NOTCH, so the heading is still at inset+12 with a box focused.
    S.inset47 = await land(round(), 'game=LF&group=1', NEXT, { inset: 47 });
    S.inset59 = await land(round(), 'game=LF&group=1', NEXT, { inset: 59 });
    // THE KP MODAL: answering resumes the navigation, and that landing focuses too.
    S.kpAnswer = await land(round({ moneyPool: KP }), 'game=LF&group=1',
        PREV.concat(NEXT, [{ tap: '#kp-force-overlay .kpf-none' }, { sleep: 900 }]));
});

describe('THE LANDING FOCUSES THE FIRST EMPTY WRITABLE BOX', () => {
    test('every arrival ran', () => {
        Object.keys(S).forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test('NEXT onto an empty hole: the first box has focus, and the heading is still at the top', () => {
        const v = S.allEmpty;
        assert.equal(v.hole, 9, 'Next reaches the hole AFTER the landing, not the landing');
        assert.equal(v.focusIsScoreBox, true, 'nothing was focused: ' + v.activeTag);
        assert.equal(v.focusedIndex, 0, 'the wrong box has focus: index ' + v.focusedIndex);
        assert.equal(v.focusedValue, '', 'a FILLED box has focus');
        assert.equal(v.headingTop, OFFSET, 'the focus moved the heading: top ' + v.headingTop);
    });

    test('the FIRST EMPTY one, not the first: two scores in means the third box', () => {
        const v = S.partly;
        assert.deepEqual(v.boxes.map(b => b.v), ['4', '5', '', ''], 'the fixture is not partly scored');
        assert.equal(v.focusedIndex, 2, 'it focused index ' + v.focusedIndex + ' instead of the first empty');
        assert.equal(v.focusedValue, '');
        assert.equal(v.headingTop, OFFSET);
    });

    test('A FULL HOLE focuses nothing', () => {
        const v = S.full;
        assert.ok(v.boxes.every(b => b.v !== ''), 'the fixture left an empty box');
        assert.equal(v.focusIsScoreBox, false, 'a filled hole took focus anyway');
        assert.equal(v.headingTop, OFFSET);
    });

    test('A SPECTATOR is never focused - the boxes are disabled by the page own rule', () => {
        const v = S.spectator;
        assert.ok(v.boxes.length > 0, 'the spectator card rendered no boxes at all');
        assert.ok(v.boxes.every(b => b.disabled), 'the fixture is not actually a spectator');
        assert.equal(v.focusIsScoreBox, false, 'a spectator got the keypad');
    });

    test('and the browser itself refuses a disabled box, which is why that control is INERT', () => {
        // CLAUDE.md: "A control that mutates something genuinely harmless SHOULD be
        // inert. Say so, rather than inventing an assertion to make it look caught."
        // Removing the :not([disabled]) filter from focusFirstEmptyScoreBox does NOT
        // let a spectator be focused - measured, 14/15 still green, only the source
        // assertion moved. The reason is the platform: focus() on a disabled input
        // does nothing. This test pins that fact, because the design leans on it, and
        // it is the honest version of "the filter is belt and braces".
        const v = S.spectator;
        assert.equal(v.focusedIndex, -1, 'something in the disabled card holds focus');
        assert.ok(v.activeTag === 'BODY' || v.activeTag === 'HTML',
            'focus landed somewhere unexpected on a spectator card: ' + v.activeTag);
    });

    test('PAST THE KEYBOARD LINE: a target under the keypad allowance is left alone', () => {
        const v = S.pastLine;
        assert.equal(v.innerHeight, 500, 'the short viewport did not take');
        const firstEmpty = v.boxes.find(b => b.v === '');
        assert.ok(firstEmpty, 'the fixture has no empty box');
        assert.ok(firstEmpty.rect.bottom > (v.innerHeight - 336),
            'the first empty box is NOT past the line, so this proves nothing: '
            + JSON.stringify(firstEmpty.rect) + ' vs ' + (v.innerHeight - 336));
        assert.equal(v.focusIsScoreBox, false, 'it focused a box under the keyboard');
        assert.equal(v.headingTop, OFFSET, 'and it moved the heading doing so');
    });

    test('PREV and the 1-18 PICKER follow the same rule', () => {
        [['prev', S.prev], ['picker', S.picker]].forEach(([tag, v]) => {
            assert.equal(v.focusIsScoreBox, true, tag + ' focused nothing');
            assert.equal(v.focusedValue, '', tag + ' focused a filled box');
            assert.equal(v.headingTop, OFFSET, tag + ' moved the heading');
        });
    });

    test('WITH THE NOTCH the heading still sits at inset + 12, focused', () => {
        [[47, S.inset47], [59, S.inset59]].forEach(([inset, v]) => {
            assert.equal(v.inset, inset, 'the emulated inset did not take');
            assert.equal(v.focusIsScoreBox, true, 'nothing focused at inset ' + inset);
            assert.equal(v.headingTop, inset + OFFSET,
                'heading at ' + v.headingTop + ', expected ' + (inset + OFFSET));
        });
    });

    test('A KP ANSWER resumes the navigation AND focuses, like Next', () => {
        // Here the sequence is Prev onto the KP hole 7 and then Next, so the resumed
        // navigation lands on 8 - one hole earlier than the plain-Next cases above.
        const v = S.kpAnswer;
        assert.equal(v.hole, 8, 'the resumed navigation did not land: hole ' + v.hole);
        assert.equal(v.headingTop, OFFSET, 'the resumed landing is wrong: ' + v.headingTop);
        assert.equal(v.focusIsScoreBox, true, 'the resumed landing focused nothing');
        assert.equal(v.focusedValue, '');
    });
});

// ---------------------------------------------------------------------------
// RAW DISPATCH ONLY. The harness's own tap step calls scrollIntoView before clicking,
// which is what produced the "39px shift" I wrongly reported as a product defect. This
// describe presses at the button's own coordinates instead, so the only thing that can
// move the page is the page.
// ---------------------------------------------------------------------------
describe('OPENING AND CLOSING THE KP MODAL DOES NOT MOVE THE PAGE', () => {
    const R = {};
    before(async () => {
        const Y = `'Y:' + JSON.stringify({ y: Math.round(window.pageYOffset||0),
            modal: (function(){var o=document.getElementById('kp-force-overlay');
              return !!(o && getComputedStyle(o).display!=='none');})() })`;
        const WHERE = `(function(){var b=document.querySelectorAll('.hole-view-nav-btn')[1];
            var r=b.getBoundingClientRect();
            return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`;
        const press = (x, y) => ([
            { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } } },
            { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } } },
        ]);
        for (const inset of [0, 47, 59]) {
            const pre = [{ expression: "document.documentElement.style.paddingTop = '" + inset + "px'; 'set'" }, { sleep: 250 }];
            const a = await arriveCold({ url: fileUrl('index.html', 'game=LF&group=1'),
                db: { events: { LF: round({ moneyPool: KP }) }, global_courses: {}, trips: {}, tournaments: {} },
                settleMs: 3200, viewport: { width: 390, height: 844 },
                steps: pre.concat(PREV, [{ expression: WHERE }]) });
            if (!a.ok) { R[inset] = { error: a.reason }; continue; }
            const at = JSON.parse((a.value || []).filter(v => typeof v === 'string').pop());
            const b = await arriveCold({ url: fileUrl('index.html', 'game=LF&group=1'),
                db: { events: { LF: round({ moneyPool: KP }) }, global_courses: {}, trips: {}, tournaments: {} },
                settleMs: 3200, viewport: { width: 390, height: 844 },
                steps: pre.concat(PREV, [{ expression: Y }], press(at.x, at.y), [{ sleep: 700 },
                    { expression: Y }, { tap: '#kp-force-overlay .kpf-back' }, { sleep: 700 }, { expression: Y }]) });
            R[inset] = b.ok
                ? { ys: (b.value || []).filter(v => typeof v === 'string' && v.indexOf('Y:{') === 0).map(v => JSON.parse(v.slice(2))) }
                : { error: b.reason };
        }
    });

    [0, 47, 59].forEach(inset => {
        test('inset ' + inset + 'px: the page is where it was, before and after', () => {
            const v = R[inset];
            assert.ok(v && !v.error, 'inset ' + inset + ': ' + (v && v.error));
            assert.equal(v.ys.length, 3, 'expected three readings, got ' + v.ys.length);
            const [before, open, closed] = v.ys;
            assert.equal(open.modal, true, 'the raw press did not open the modal');
            assert.equal(open.y, before.y, 'OPENING the modal moved the page: ' + before.y + ' -> ' + open.y);
            assert.equal(closed.modal, false, 'Back did not close it');
            assert.equal(closed.y, before.y, 'CLOSING it moved the page: ' + before.y + ' -> ' + closed.y);
        });
    });
});

describe('THE SOURCE: THE CONDITION, AND v128 KEPT', () => {
    const IDX = read('index.html');
    const fn = name => { const at = IDX.indexOf('function ' + name + '('); return at < 0 ? '' : IDX.slice(at, IDX.indexOf('\n    }', at)); };

    test('one focuser, called from landOnHole, and it tests all four refusals', () => {
        const f = fn('focusFirstEmptyScoreBox');
        assert.ok(f.length > 150, 'focusFirstEmptyScoreBox could not be sliced');
        assert.match(f, /:not\(\[disabled\]\)|\.disabled/, 'it does not exclude a locked box');
        assert.match(f, /value/, 'it does not test for an empty box');
        assert.match(f, /innerHeight/, 'it does not test the keyboard allowance');
        assert.match(fn('landOnHole'), /focusFirstEmptyScoreBox\(\)/, 'landOnHole does not focus');
    });

    test('the keyboard allowance is a named constant, not a number buried in a test', () => {
        assert.match(IDX, /KEYBOARD_ALLOWANCE = \d+/);
    });

    test('the v128 reason is still written where the decision lives', () => {
        // The note that explains why this was ever removed must survive the wave that
        // brings it back, or the next reader re-learns it on a golf course.
        assert.match(IDX, /WHY THE HEADING, AND WHY NO FOCUS \(2026-09-14, after a real round on v128\)/);
        assert.match(IDX, /v128 put the FIRST SCORE BOX at the top and focused the first empty one/);
    });
});
