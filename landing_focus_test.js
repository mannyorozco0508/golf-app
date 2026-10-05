// ============================================================================
// NOTHING IS FOCUSED ON LANDING (2026-10-05, Manny)
//
// RE-POINTED FROM "THE LANDING FOCUSES THE FIRST EMPTY BOX - WHEN IT CAN"
// (Wave 27), which is now reversed. The Wave 27 reasoning was sound and is kept
// below because it is the record of what was measured; what changed is the page
// it was measured on.
//
// WHAT WAVE 27 ESTABLISHED. v128 anchored the first BOX at the top and focused
// unconditionally, so the heading went off-screen and the keyboard opened over
// the page on every Next. Wave 27 brought the focus back CONDITIONALLY: the
// landing anchors the HEADING, and the box is focused only when it will still be
// clear of the keypad. Measured at 390x844, rows 73px apart, a 336px keyboard
// starting at y=508: boxes 0-5 end at or above 482 and are clear, boxes 6 and 7
// are under it. So a four-golfer card took the keypad on every hole change.
//
// WHY THAT IS NOW WRONG. The scorecard is not four boxes any more. The compact
// live panel - the leaderboard top five and this golfer's live matches - sits
// directly under Prev/Next, and the keypad opened over it on every Next, Prev,
// 1-18 jump and KP answer. A golfer who wanted to know where they stood had to
// dismiss a keyboard nobody asked for. Manny, 2026-10-05: remove it.
//
// THE RULE NOW. No score box is focused by a landing and no keypad opens; the
// keypad opens when a golfer TAPS a box, and at no other time. What is untouched:
//   - the box-to-box advance WITHIN a hole (advanceToNextScoreBox), which moves
//     focus the golfer already has and never opens a keyboard that was shut;
//   - restoreScoreFocus, which puts focus back where it was when a remote
//     snapshot rebuilds the card mid-entry;
//   - the landing itself, which still scrolls by Manny's fit rule.
// The first two are this file's negative controls as much as its exclusions: if
// removing the landing focus had broken typing, they are where it would show.
//
// WHAT THIS FILE CANNOT PROVE, stated rather than implied: headless Chrome has NO
// SOFT KEYBOARD. Every assertion here is about which element holds focus. That a
// keypad does not appear is an iPhone question and Manny tests it there - but
// "nothing is focused" is the precondition for it, and that IS measurable.
//
// BASELINE, measured over the FINISHED file against main (a488b2c, index.html
// swapped out and restored by sha), all 16 tests: 10 PASS / 6 FAIL. 10 + 6 = 16.
//   The ten that pass are the ones this reversal must not break, and three of
//   them are weak evidence for it, said plainly rather than counted as coverage:
//   "a full hole focuses nothing", "a spectator is never focused" and "a short
//   viewport is no longer a special case" were all TRUE BEFORE - under Wave 27
//   those were its refusals, and under this wave they are the general rule. The
//   other seven are the arrival itself, the three KP-modal scroll cases (which
//   were never a defect - see the note below), the platform fact that a disabled
//   box refuses focus, "typing still moves itself" (the thing that must not have
//   gone out with the landing focus, green because it did not), and the v128 note
//   still being in the file.
//   The six reds are every landing that used to take the keypad - Next, Prev, the
//   picker, the partly-scored hole, both insets and the KP answer - plus the
//   source pin that the focuser and its allowance are gone.
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
    // THE LANDING IS A NO-OP ON A PAGE WITH NO ROOM (2026-10-04, the Status sheet):
    // this is what every heading assertion below branches on.
    canScroll: (document.documentElement.scrollHeight - window.innerHeight) > 1,
    navBottom: (function () { var n = document.querySelector('.hole-view-nav-row');
      return n ? Math.round(n.getBoundingClientRect().bottom + (window.pageYOffset || 0)) : null; })(),
    scrollRoom: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
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
    // THE SPECTATOR SAYS SO FIRST (2026-10-05). A bare link to a multi-group round
    // opens the "Keeping score, playing, or just watching?" sheet over the page, and
    // this arrival used to tap Next straight through it - which worked only as long
    // as the tap landed on nothing. With the reading area back on the page the
    // layout moved, the tap reached a picker row, and the fixture quietly became a
    // scorekeeper with writable boxes. Answering the question is what a spectator
    // does, and it is what makes this fixture one.
    S.spectator = await land(round(), 'game=LF',
        [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 500 }].concat(NEXT));
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


// THE HEADING, UNDER THE RULE THAT NOW APPLIES (2026-10-04). landOnHole stays and
// is a NO-OP on a page that cannot scroll - a four-golfer card is one screen since
// the Status sheet took the header, the nav and every reading card off the page.
// Where there IS room the landing lands, to the pixel, and that is asserted.
// Either way the focus must not have moved the heading off screen, which is what
// these lines were protecting: preventScroll on the focus is what keeps that true.
function headingLanded(v, inset) {
    const want = (inset || 0) + OFFSET;
    // RE-POINTED AGAIN 2026-10-04 to Manny's rule as he stated it: the landing
    // scrolls only when the hole card would NOT FIT with the page at the top.
    // Having scroll room is a different question and was the wrong test - the
    // runway could create room on a card that fitted perfectly well, and scrolling
    // it pushed the banner above the hole under the status bar.
    if (v.navBottom !== null && v.navBottom > 844) {
        assert.equal(v.headingTop, want,
            'heading at ' + v.headingTop + ', expected ' + want + ' with ' + v.scrollRoom + 'px of room');
    } else {
        assert.ok(v.headingTop >= (inset || 0),
            'the heading is behind the status bar at ' + v.headingTop);
        assert.ok(v.scrollY <= v.scrollRoom + 1,
            'the page scrolled past its own end: ' + v.scrollY + ' of ' + v.scrollRoom);
    }
}

describe('NO LANDING FOCUSES ANYTHING, AND THE HEADING STILL LANDS', () => {
    test('every arrival ran', () => {
        Object.keys(S).forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test('NEXT onto an empty hole: NOTHING is focused, and the heading still lands', () => {
        const v = S.allEmpty;
        assert.equal(v.hole, 9, 'Next reaches the hole AFTER the landing, not the landing');
        assert.ok(v.boxes.some(b => b.v === '' && !b.disabled),
            'the fixture has no empty writable box, so it proves nothing');
        assert.equal(v.focusIsScoreBox, false, 'a score box took focus: index ' + v.focusedIndex);
        assert.equal(v.focusedIndex, -1);
        headingLanded(v);
    });

    test('and a PARTLY scored hole is no different - there is no "first empty" to find', () => {
        const v = S.partly;
        assert.deepEqual(v.boxes.map(b => b.v), ['4', '5', '', ''], 'the fixture is not partly scored');
        assert.equal(v.focusIsScoreBox, false, 'it focused index ' + v.focusedIndex);
        headingLanded(v);
    });

    test('A FULL HOLE focuses nothing (true before this wave too, and said so)', () => {
        const v = S.full;
        assert.ok(v.boxes.every(b => b.v !== ''), 'the fixture left an empty box');
        assert.equal(v.focusIsScoreBox, false, 'a filled hole took focus anyway');
        headingLanded(v);
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

    test('A SHORT VIEWPORT is no longer a special case, because no case focuses', () => {
        // KEPT, AND DEMOTED HONESTLY. This fixture was the proof that the keypad
        // allowance refused a box that would sit under the keyboard. There is no
        // allowance any more, so what it proves now is narrower and still worth
        // having: the rule does not have an exception hiding at a small height.
        const v = S.pastLine;
        assert.equal(v.innerHeight, 500, 'the short viewport did not take');
        assert.ok(v.boxes.some(b => b.v === ''), 'the fixture has no empty box');
        assert.equal(v.focusIsScoreBox, false, 'it focused a box on a short screen');
        // RE-POINTED 2026-10-04 (Manny's fit rule): what this line is for is that the
        // REFUSAL costs nothing - the page is wherever the landing left it, and the
        // focus did not drag it. headingLanded() is that claim under the rule that
        // now applies, which on a card that fits is "the page is at the top".
        headingLanded(v);
    });

    test('PREV and the 1-18 PICKER follow the same rule', () => {
        [['prev', S.prev], ['picker', S.picker]].forEach(([tag, v]) => {
            assert.equal(v.focusIsScoreBox, false, tag + ' took the keypad');
            headingLanded(v);   // the same rule, whichever control moved the hole
        });
    });

    test('WITH THE NOTCH the heading still lands, and still nothing is focused', () => {
        [[47, S.inset47], [59, S.inset59]].forEach(([inset, v]) => {
            assert.equal(v.inset, inset, 'the emulated inset did not take');
            assert.equal(v.focusIsScoreBox, false, 'a box took focus at inset ' + inset);
            headingLanded(v, inset);
        });
    });

    test('A KP ANSWER resumes the navigation and focuses NOTHING, like Next', () => {
        // Here the sequence is Prev onto the KP hole 7 and then Next, so the resumed
        // navigation lands on 8 - one hole earlier than the plain-Next cases above.
        const v = S.kpAnswer;
        assert.equal(v.hole, 8, 'the resumed navigation did not land: hole ' + v.hole);
        headingLanded(v);   // the resumed landing, under the same rule
        assert.equal(v.focusIsScoreBox, false, 'the resumed landing took the keypad');
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

describe('THE SOURCE: NO FOCUSER AT ALL, AND v128 KEPT', () => {
    const IDX = read('index.html');
    const fn = name => { const at = IDX.indexOf('function ' + name + '('); return at < 0 ? '' : IDX.slice(at, IDX.indexOf('\n    }', at)); };

    test('the landing focuser and its allowance are GONE, not merely unused', () => {
        // A function nothing calls is a function the next wave calls again by
        // accident. Both went out with the rule.
        assert.ok(!/focusFirstEmptyScoreBox/.test(IDX), 'the focuser is still in the page');
        assert.ok(!/KEYBOARD_ALLOWANCE/.test(IDX), 'the keypad allowance outlived its only reader');
        const land = fn('landOnHole');
        assert.ok(land.length > 400, 'landOnHole could not be sliced');
        assert.ok(!/\.focus\(/.test(land), 'the landing still focuses something');
    });

    test('and TYPING still moves itself, which is the thing that must not have gone with it', () => {
        // The box-to-box advance within a hole, and the mid-entry restore. Both move
        // focus the golfer already has; neither opens a keypad that was shut. If
        // removing the landing focus had taken typing with it, this is where it shows.
        const adv = IDX.slice(IDX.indexOf('pendingScoreFocus = scoreBoxIdentity(next);'));
        assert.match(adv.slice(0, 200), /next\.focus\(\); next\.select\(\)/,
            'the within-hole advance no longer moves focus');
        assert.match(fn('restoreScoreFocus'), /el\.focus\(\)/,
            'a rebuild mid-entry no longer puts focus back');
    });

    test('the v128 reason is still written where the decision lives', () => {
        // The note that explains why this was ever removed must survive the wave that
        // brings it back, or the next reader re-learns it on a golf course.
        assert.match(IDX, /WHY THE HEADING, AND WHY NO FOCUS \(2026-09-14, after a real round on v128\)/);
        assert.match(IDX, /v128 put the FIRST SCORE BOX at the top and focused the first empty one/);
    });
});
