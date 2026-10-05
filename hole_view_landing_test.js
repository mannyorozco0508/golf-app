// ============================================================================
// HOLE VIEW: A CONSISTENT LANDING ON HOLE CHANGE, and the tap that went nowhere.
//
// THE RULE (index.html, landOnHole / commitPendingScore / goToAdjacentHole /
// jumpToHole). After Next, Prev and the 1-18 jump the page scrolls so the HOLE
// HEADING ("Hole 5 · Par 4") sits HOLE_LANDING_OFFSET px from the top of the
// viewport with the score boxes under it - an explicit scrollTo, the same
// whatever the golfer count, the banners, or where the page was. NOTHING IS
// FOCUSED on a hole change (v129: on the course the v128 keyboard covered the
// page on every Next; auto-advance while entering scores is untouched). And a
// score still focused when Next is tapped (a lone "1", a corrected number) no
// longer swallows the tap: the box keeps focus through the mousedown and the
// handler commits it inside the click, so the hole always changes and the
// score is saved.
//
// WHY CHROME. helpers/mini-dom.js has no layout and does not parse innerHTML:
// no rects, no heading to find. Every measurement here is a cold arrival on
// index.html through tools/lib/cold-arrival.js at 390x844 - taps and keys by
// CDP, the round handed in through the data stub, nothing the page defines
// invoked. Scrolls made "by the golfer" are scrollIntoView / scrollTo on DOM
// nodes, which is what a thumb does; they call no page function.
//
// THE STUB re-fires the round's value listener synchronously on set(), as the
// vendored SDK does (helpers/refire-stub.js); window.__remote() is its door for
// another device's snapshot.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { REFIRE } = require('./helpers/refire-stub.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const OFFSET = Number((IDX.match(/const HOLE_LANDING_OFFSET = (\d+);/) || [])[1]);

const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
function round(scoresFn) {
    const P = makePlayers(NAMES, [2, 9, 15, 4, 20, 7, 11, 0], 101);
    const scores = {};
    if (scoresFn) P.forEach(p => CD.forEach(h => { const v = scoresFn(p, h); if (v) scores['p' + p.id + '_h' + h.hole] = v; }));
    return { eventName: 'Landing', courseName: 'Test', players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores, settlementMode: 'whole-dollar',
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } } };
}
const DB = { events: {
    LND: round(),                                                            // nothing scored
    LNDPART: round((p, h) => (h.hole === 2 && p.id === 101) ? 4 : 0),        // golfer 1 has hole 2 already
    LNDFULL: round((p, h) => h.par),                                         // every hole scored
    LND17: round((p, h) => h.hole < 18 ? h.par : 0)                          // only 18 open: arrival lands there
}, global_courses: {}, trips: {}, tournaments: {} };

const PRE = 'window.__STUBDB = ' + JSON.stringify(DB) + ';' + REFIRE + `
(function(){ window.__ui = []; ['mousedown','click'].forEach(function(k){ document.addEventListener(k, function(e){ var b = e.target && e.target.closest && e.target.closest('button'); if (b) window.__ui.push(k + '[' + b.innerText.trim().slice(0, 8) + ']'); }, true); }); })();`;

// A SNAPSHOT MAY PRESERVE A FOCUS; IT MAY NEVER CREATE ONE (re-pointed Wave 27).
// These cases used to assert active === 'BODY' after a remote snapshot, which was the
// v128 world where nothing was ever focused on a landing. The landing now focuses the
// first empty writable box, and restoreScoreFocus() deliberately puts that focus BACK
// by identity after a rebuild - its whole job is that a snapshot must not wipe what
// the golfer typed or where they were. So 'BODY' is no longer the rule.
// The rule that MATTERS is intact and is what is asserted instead: a snapshot cannot
// invent a focus, because restoreScoreFocus starts `if (!memo) return;` and the memo
// only exists when a box was focused before the rebuild. If the golfer closed the
// keyboard, a snapshot still does not reopen it - which is the sentence the original
// comment gave for this rule, and it is unchanged.
const focusOk = (s, why) => {
    if (s.active === 'BODY') return;
    assert.ok(/^p\d+\/h\d+$/.test(String(s.active)),
        why + ': focus is neither a score box nor nothing - ' + s.active);
    assert.equal(s.activeValue, '', why + ': a box with a score in it holds focus');
    assert.ok(s.activeBottom !== null && s.activeBottom <= (844 - 336),
        why + ': the focused box is under the keyboard allowance - ' + s.activeBottom);
};

// Where the page is, by identity - never by index.
const STATE = `(function(){ var a = document.activeElement; var card = document.getElementById('hole-view-card'); var boxes = card ? card.querySelectorAll('.score-input') : []; var first = boxes[0]; var fr = first && first.getBoundingClientRect(); var hd = card && card.querySelector('.hole-view-header'); var hr = hd && hd.getBoundingClientRect();
  var id = (a && a.classList && a.classList.contains('score-input')) ? 'p' + a.getAttribute('data-player-id') + '/h' + a.getAttribute('data-hole') : (a === document.body ? 'BODY' : a.tagName);
  var selected = (a && a.classList && a.classList.contains('score-input')) ? (a.selectionStart === 0 && a.selectionEnd === a.value.length) : null;
  var nav = document.querySelector('.hole-view-nav-row'); var btns = nav ? Array.from(nav.querySelectorAll('button')).map(function (b) { return b.innerText.trim(); }) : [];
  return JSON.stringify({ hole: (document.querySelector('.hv-hole-num') || {}).innerText, scrollY: Math.round(window.scrollY),
  canScroll: (document.documentElement.scrollHeight - window.innerHeight) > 1,
  scrollRoom: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)), firstBoxTop: fr ? Math.round(fr.top * 10) / 10 : null, headingTop: hr ? Math.round(hr.top * 10) / 10 : null, headingBottom: hr ? Math.round(hr.bottom * 10) / 10 : null, headingText: hd ? hd.innerText.replace(/\\s+/g, ' ') : null, boxes: boxes.length, enabled: Array.from(boxes).filter(function (b) { return !b.disabled; }).length,
    active: id, selected: selected, activeValue: a && a.value !== undefined ? a.value : null,
    activeBottom: (a && a.classList && a.classList.contains('score-input')) ? Math.round(a.getBoundingClientRect().bottom) : null, nav: btns, finishOpen: getComputedStyle(document.getElementById('finish-round-modal-overlay')).display, ui: window.__ui.splice(0), ev: (window.__ev || []).splice(0) }); })()`;
const rect = (sel, n) => `(function(){ var el = document.querySelectorAll(${JSON.stringify(sel)})[${n || 0}]; if (!el) return 'null'; var r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`;
const tap = (p) => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 } } },
                    { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 } } }];
const key = (k) => [{ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: k, code: 'Digit' + k, text: k } } }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code: 'Digit' + k } } }];
// "Scrolled down to the fourth golfer": what a thumb does before tapping Next.
// If that leaves the nav row below the fold (eight golfers), bring it to the
// bottom edge as the thumb would.
const SCROLL_TO_4TH = "document.querySelectorAll('#hole-view-card .score-input')[3].scrollIntoView({ block: 'center' }); var n = document.querySelector('.hole-view-nav-row'); if (n.getBoundingClientRect().bottom > window.innerHeight) n.scrollIntoView({ block: 'end' }); window.__ui = []; window.__ev = []; 'scrolled'";
const NAV_BTN = (i) => rect('.hole-view-nav-row button', i);
async function arrive(q, steps) { return arriveCold({ url: fileUrl('index.html', q), db: DB, settleMs: 4000, preScript: PRE, steps }); }
const P = (r, i) => JSON.parse(r.value[i]);

// One arrival per scenario, sequential. Tap coordinates come from a measuring
// arrival of the same page at the same size, since a step cannot feed the next.
const S = {};
before(async () => {
    // GEOMETRY. Next/Prev/position after "scrolled to the 4th golfer" on hole 1,
    // and after a landing (the nav row is then always at the same place).
    const g = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, { expression: NAV_BTN(2) }, { expression: NAV_BTN(0) }, { expression: NAV_BTN(1) }, { expression: rect('#hole-view-card .score-input', 3) }]);
    assert.ok(g.ok, 'Chrome did not run: ' + g.reason);
    S.next1 = P(g, 1); S.prev1 = P(g, 2); S.pos1 = P(g, 3); S.box4 = P(g, 4);
    const l = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), { expression: NAV_BTN(2) }, { expression: NAV_BTN(0) }, { expression: NAV_BTN(1) }]);
    assert.ok(l.ok, 'Chrome did not run: ' + l.reason);
    S.nextL = P(l, 3); S.prevL = P(l, 4); S.posL = P(l, 5);
    // A second, different starting offset for the second Next: the golfer has
    // scrolled the nav row to the bottom edge of the screen.
    const NAV_TO_BOTTOM = "document.querySelector('.hole-view-nav-row').scrollIntoView({ block: 'end' }); 'nav at the bottom'";
    const l2 = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), { expression: NAV_TO_BOTTOM }, { expression: NAV_BTN(2) }]);
    assert.ok(l2.ok, 'Chrome did not run: ' + l2.reason);
    S.nextB = P(l2, 4);
    // the picker, opened from the landed position: bring it on screen and read hole 5's button
    const pk = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), ...tap(S.posL),
        { expression: "document.querySelector('.hole-picker').scrollIntoView({ block: 'center' }); 'picker shown'" }, { expression: rect('.hole-pick-btn', 4) }]);
    assert.ok(pk.ok, 'Chrome did not run: ' + pk.reason);
    S.pick5 = P(pk, 6);
    // data-role="watching" NAMES THE ROW (Wave 39). The sheet had one
    // btn-outline - "Just watching" - and this selected it by class. It now
    // has three rows, two of them outline, so a class selector picks
    // whichever comes first: measured, it tapped "I'm playing" and landed on
    // the name picker instead of the card.
    const g8 = await arrive('game=LND', [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 300 }, { expression: SCROLL_TO_4TH }, { expression: NAV_BTN(2) }]);
    S.next8 = P(g8, 3);   // the picker dismissed first (2026-09-20), so the geometry is the card's

    // 1. NEXT from the 4th golfer, NEXT again from the page top, PREV from the
    //    landed position: three different starting offsets, one landing. Then a
    //    remote snapshot while the landed box is focused.
    S.nav = await arrive('game=LND&group=1', [
        { expression: SCROLL_TO_4TH }, { expression: STATE }, ...tap(S.next1), { expression: STATE },
        { expression: NAV_TO_BOTTOM }, { expression: STATE }, ...tap(S.nextB), { expression: STATE },
        ...tap(S.prevL), { expression: STATE },
        { expression: "window.__remote({ p103_h2: 5 }); 'remote'" }, { expression: STATE },
        // the golfer closed the keyboard (nothing focused); a snapshot must not reopen it
        { expression: "if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); 'nothing to close'" }, { expression: "window.__remote({ p104_h2: 4 }); 'remote'" }, { expression: STATE }]);
    // 2. Eight golfers on the organizer link: every box disabled.
    // 2026-09-20: a bare link on eight golfers now ASKS which group first (the
    // group picker, group_picker_test.js) - a modal over the card, so a thumb
    // heading for Next meets "Just watching" first. Tapped, the way a spectator
    // would, by its own selector (a real tap - no page function); the landing
    // below is then measured on the same spectator view it always was.
    S.org = await arrive('game=LND', [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 300 }, { expression: SCROLL_TO_4TH }, { expression: STATE }, ...tap(S.next8), { expression: STATE }]);
    // 3. The 1-18 jump to hole 5.
    S.jump = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), ...tap(S.posL),
        { expression: "document.querySelector('.hole-picker').scrollIntoView({ block: 'center' }); 'picker shown'" }, { expression: STATE }, ...tap(S.pick5), { expression: STATE }]);
    // 4. FIX 1: a lone "1" typed in the 4th box, still focused, then Next.
    S.pending = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.box4), ...key('1'), { sleep: 50 }, { expression: STATE }, ...tap(S.next1), { expression: STATE },
        { expression: "(document.querySelector('#full-card-container .score-input[data-player-id=\"104\"][data-hole=\"1\"]') || {}).value" }]);
    // 5. Golfer 1 already has hole 2: the first EMPTY box is golfer 2's.
    // A SETTLE BETWEEN THE TAP AND THE READ (2026-10-04). These two sequences read
    // the state in the step straight after the mouse release, and that was reliable
    // only because the landing used to perform a real window.scrollTo - a frame the
    // probe happened to land behind. On a one-screen card the landing is a no-op, so
    // there is no scroll to wait on and the read raced the click: measured, the hole
    // had not changed yet. The sleep is the harness waiting for the browser, not a
    // softened assertion, and it shifts the indices below by one.
    S.part = await arrive('game=LNDPART&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), { sleep: 150 }, { expression: STATE }]);
    // 6. Every hole scored: the landing scrolls, focuses nothing; a snapshot changes nothing.
    // LNDFULL IS MEASURED ON ITS OWN PAGE (2026-10-04). Every hole is scored here,
    // so the round is complete and the "Your card is in" card renders above the hole
    // view - a taller document than LND's. While the page scrolled, the landing put
    // the nav row in the same place on both and one coordinate served both; on a
    // page with no scroll room the extra card pushes Next down and LND's coordinate
    // missed it entirely. So this fixture measures its own button, which is what the
    // geometry arrival at the top of this block does for the others.
    const fg = await arrive('game=LNDFULL&group=1', [{ expression: SCROLL_TO_4TH }, { expression: NAV_BTN(2) }]);
    assert.ok(fg.ok, 'Chrome did not run: ' + fg.reason);
    S.full = await arrive('game=LNDFULL&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(P(fg, 1)), { sleep: 150 }, { expression: STATE }, { expression: "window.__remote({}); 'remote'" }, { expression: STATE }]);
    // 7. Only 18 open: arrival lands on 18, whose nav ends in Finish Round.
    S.last = await arrive('game=LND17&group=1', [{ expression: STATE }, { expression: NAV_BTN(2) }]);
    if (S.last.ok) { const fin = P(S.last, 1); S.lastTap = await arrive('game=LND17&group=1', [{ expression: "document.querySelector('.hole-view-nav-row').scrollIntoView({ block: 'center' }); 'shown'" }, { expression: NAV_BTN(2) }]); }
});

const landed = (st, hole) => {
    assert.equal(st.hole, 'Hole ' + hole);
    // RE-POINTED 2026-10-04 (the Status sheet), and the rule is Manny's: landOnHole
    // STAYS, and it is a NO-OP on a page that cannot scroll.
    //
    // WHY IT HAD TO MOVE. The scorecard's header, nav, Playing With card, group
    // scores and live dashboard went into one slide-up sheet, so a four-golfer
    // round is now exactly one screen - 844px, measured - and there is no scroll
    // room left. A scrollTo on such a page does nothing, which is correct: the
    // heading is already in view with the boxes under it, and the landing's whole
    // purpose was to put it there.
    //
    // THE LANDING STILL LANDS WHERE THERE IS ROOM. Five to eight golfers in one
    // group is a taller card than the screen, and the eight-golfer case below is
    // the control: same fixture family, scroll room, heading at the offset. So
    // this is a branch on the PAGE's height, not a softened assertion.
    if (st.canScroll) {
        // Within a device pixel of the offset (fractional layout rounds the scroll);
        // "identical every time" is asserted as equality between navigations below.
        assert.ok(Math.abs(st.headingTop - OFFSET) <= 1, 'heading ' + st.headingTop + 'px from the top, expected ' + OFFSET
            + ' (' + st.scrollRoom + 'px of scroll room)');
    } else {
        assert.equal(st.scrollY, 0, 'a page with no scroll room scrolled anyway');
        assert.ok(st.headingTop >= 0, 'the heading is above the top of the screen with nowhere to scroll');
    }
    assert.ok(st.headingTop >= 0 && st.headingBottom <= 844, 'the heading is fully on screen');
    assert.match(st.headingText, new RegExp('^Hole ' + hole + ' Par \\d'), 'and it names the hole: ' + st.headingText);
    assert.ok(st.firstBoxTop > st.headingBottom, 'the score boxes sit under the heading');
    // RE-POINTED IN WAVE 27, and the v128 reason above is kept because it is still
    // true of what it describes. This asserted `active === 'BODY'` - nothing focused
    // on a hole change - which was v128's remedy: it anchored the first BOX at the
    // top and focused unconditionally, so the heading was already off screen and on a
    // deep card iOS scrolled the target out from under the keyboard and took the
    // heading with it.
    //
    // The landing now focuses the first EMPTY WRITABLE box, but only when it will sit
    // CLEAR OF THE KEYBOARD - so the CONDITION is what gets asserted, not the absence.
    // This fixture's holes have empty boxes near the top of a four-golfer card, so the
    // focus is expected here; what must still hold is the thing v128 was protecting,
    // and it is checked right above: the heading is at the offset and fully on screen.
    // landing_focus_test.js holds the four refusals and the keyboard-line arithmetic.
    if (/^p\d+\/h\d+$/.test(String(st.active))) {
        assert.equal(st.activeValue, '', 'the landing focused a box that already had a score: '
            + st.active + ' = ' + JSON.stringify(st.activeValue));
        assert.ok(st.activeBottom !== null && st.activeBottom <= (844 - 336),
            'the landing focused a box under the keyboard allowance: bottom ' + st.activeBottom);
    } else {
        assert.equal(st.active, 'BODY', 'focus went somewhere that is neither a score box nor nothing');
    }
};

describe('THE LANDING: Next, Next again, Prev - one place, whatever the starting offset', () => {
    test('ran', () => assert.ok(S.nav && S.nav.ok, S.nav && S.nav.reason));
    test('the offset is a named constant the page reads', () => assert.ok(OFFSET > 0 && OFFSET < 60, 'HOLE_LANDING_OFFSET = ' + OFFSET));
    test('before: scrolled to the 4th golfer, the heading is NOT at the landing (it is above the fold) and nothing is focused', () => {
        const b = P(S.nav, 1);
        assert.equal(b.hole, 'Hole 1'); assert.notEqual(Math.round(b.headingTop), OFFSET, 'started away from the landing: ' + b.headingTop); assert.equal(b.active, 'BODY');
    });
    test('Next from the 4th golfer: hole 2, the heading at the offset, the boxes under it, nothing focused', () => {
        const s = P(S.nav, 4); landed(s, 2);
        assert.deepEqual(s.ui, ['mousedown[Next ▶]', 'click[Next ▶]']);
    });
    test('Next from a different offset (the nav row dragged to the bottom edge): hole 3, the SAME landing', () => {
        const before = P(S.nav, 6), s = P(S.nav, 9);
        assert.ok(Math.abs(before.headingTop - OFFSET) > 20, 'a genuinely different start: ' + before.headingTop);
        landed(s, 3);
        assert.equal(s.headingTop, P(S.nav, 4).headingTop, 'identical, not merely close');
    });
    test('Prev: hole 2, the same landing, nothing focused', () => {
        const s = P(S.nav, 12); landed(s, 2);
        assert.equal(s.headingTop, P(S.nav, 4).headingTop);
    });
    test('a remote snapshot after the landing does not CREATE a focus (re-pointed, Wave 27)', () => {
        const s = P(S.nav, 14);
        assert.ok(s.ev.includes('value->render'), 'the snapshot rebuilt the card: ' + s.ev.join(' > '));
        focusOk(s, 'after a remote snapshot'); assert.ok(s.enabled >= 2);
    });
    test('and again after the golfer touched nothing else: still nothing new', () => {
        const s = P(S.nav, 17);
        assert.ok(s.ev.includes('value->render'), s.ev.join(' > '));
        focusOk(s, 'after a second snapshot');
    });
});

describe('EIGHT GOLFERS (organizer link, boxes disabled): the same landing', () => {
    test('ran', () => assert.ok(S.org && S.org.ok, S.org && S.org.reason));
    test('eight boxes, none writable; Next lands the heading at the offset and focuses NOTHING', () => {
        const b = P(S.org, 3), s = P(S.org, 6);   // two picker steps precede (tap, sleep)
        assert.equal(b.boxes, 8); assert.equal(b.enabled, 0);
        landed(s, 2);
        // RE-POINTED 2026-10-04: THIS IS THE CONTROL FOR THE NEW RULE, and it is
        // the reason the rule can be a branch rather than a softened assertion.
        // Eight golfers in one group is a card TALLER than the screen, so the page
        // has scroll room and the landing really lands - the heading sits at the
        // offset, to the pixel. The four-golfer card is now exactly one screen and
        // its heading rests where it renders. The two numbers USED to be equal and
        // must not be now: if they ever agree again, either the landing stopped
        // working here or the four-golfer page grew a scrollbar back.
        assert.ok(Math.abs(s.headingTop - OFFSET) <= 1,
            'eight golfers has scroll room, so the heading must be at the landing: ' + s.headingTop);
        assert.equal(s.canScroll, true, 'the eight-golfer card no longer scrolls, so it proves nothing');
        const four = P(S.nav, 4);
        assert.equal(four.canScroll, false, 'the four-golfer card scrolls again - re-read the rule above');
        assert.notEqual(s.headingTop, four.headingTop,
            'the tall card and the one-screen card landed identically, which the rule says they cannot');
    });
});

describe('THE 1-18 JUMP shares the landing', () => {
    test('ran', () => assert.ok(S.jump && S.jump.ok, S.jump && S.jump.reason));
    test('the picker opened from hole 2; tapping 5 lands hole 5 exactly as Next does, nothing focused', () => {
        const before = P(S.jump, 6), s = P(S.jump, 9);
        assert.equal(before.hole, 'Hole 2');
        landed(s, 5);
        assert.equal(s.headingTop, P(S.nav, 4).headingTop, 'the same offset as Next');
    });
});

describe('FIX 1: a score still focused when Next is tapped', () => {
    test('ran', () => assert.ok(S.pending && S.pending.ok, S.pending && S.pending.reason));
    test('before the tap: "1" sits in the 4th box, focused, unsaved (no advance on a lone 1)', () => {
        const b = P(S.pending, 6);
        assert.equal(b.active, 'p104/h1'); assert.equal(b.activeValue, '1');
        assert.ok(!b.ev.includes('change(Dee\nHCP)'), 'nothing saved yet: ' + b.ev.join(' > '));
    });
    test('the tap NAVIGATES: hole 2 landed, nothing focused - the click was delivered', () => {
        const s = P(S.pending, 9);
        landed(s, 2);
        assert.deepEqual(s.ui, ['mousedown[Next ▶]', 'click[Next ▶]'], 'mousedown AND click');
    });
    test('and the score was committed inside the click: change -> value -> render happened, and the card holds the 1', () => {
        const s = P(S.pending, 9);
        const ev = s.ev.join(' > ');
        assert.ok(/change\(Dee/.test(ev) && /value->render/.test(ev), ev);
        assert.equal(S.pending.value[10], '1', 'Dee\'s hole 1 on the card');
    });
});

describe('THE FOCUS FOLLOWS THE BOXES: the first empty one, or nothing at all', () => {
    test('ran', () => assert.ok(S.part && S.part.ok && S.full && S.full.ok, (S.part && S.part.reason) || (S.full && S.full.reason)));
    test('golfer 1 has hole 2 and three boxes are empty: Next lands, and the FIRST EMPTY box takes focus', () => {
        // Re-pointed with the describe above: golfer 1's box already holds a score, so
        // the landing must skip it and take golfer 2's. That is the condition this
        // suite now holds; landing_focus_test.js holds the refusals.
        const s = P(S.part, 4); landed(s, 2); assert.equal(s.enabled, 4);
        focusOk(s, 'partly scored hole');
        assert.match(String(s.active), /^p\d+\/h2$/, 'nothing on the landed hole took focus');
        assert.equal(s.activeValue, '', 'it focused a box that already had a score');
    });
    test('every box on hole 2 holds a score: the landing is the same, and NOTHING is focused', () => {
        const s = P(S.full, 4); landed(s, 2); assert.equal(s.enabled, 4);
        assert.equal(s.active, 'BODY', 'a full hole took focus anyway');
        // RE-POINTED 2026-10-04 (the Status sheet), and the UI Wave 36 note below is
        // kept because it is still what makes these two fixtures differ.
        //
        // LNDFULL has every hole scored, so the round is complete and the "Your card
        // is in" card renders above the hole view; LNDPART's does not. While the page
        // scrolled, the landing cancelled that difference out - both headings ended at
        // the offset, give or take 0.3px of sub-pixel scroll. Neither page scrolls any
        // more, so the extra card is simply there: 126px against 58px, and the 68px
        // between them is the card. Comparing the two is now comparing two different
        // pages, so what is asserted instead is the thing that still has to be true -
        // on a page with nothing to scroll the landing moves nothing, and the heading
        // is on screen above its boxes, which landed() has just checked.
        assert.equal(s.canScroll, false, 'LNDFULL has scroll room again, so the landing should have fired');
        assert.equal(s.scrollY, 0, 'a page with no scroll room scrolled anyway');
        assert.ok(s.headingTop > P(S.part, 4).headingTop,
            'the completed-round card is no longer above the hole view: ' + s.headingTop
            + ' vs ' + P(S.part, 4).headingTop);
    });
    test('a remote snapshot afterwards does not focus anything either - there was nothing to restore', () => {
        // The clean half of the pair: on a FULL hole the landing focused nothing, so
        // there is no memo, so restoreScoreFocus returns early and the snapshot cannot
        // invent one. This is the case that proves a snapshot never reopens a keyboard
        // the golfer closed.
        const s = P(S.full, 6);
        assert.ok(s.ev.includes('value->render')); assert.equal(s.active, 'BODY');
    });
});

describe('THE LAST HOLE: the arrival unchanged; the Finish button now guarded (Wave A)', () => {
    test('ran', () => assert.ok(S.last && S.last.ok, S.last && S.last.reason));
    test('arrival lands on 18 (the only open hole); the nav ends in Finish, there is no Next', () => {
        const s = P(S.last, 0);
        assert.equal(s.hole, 'Hole 18'); assert.equal(s.nav.length, 3); assert.match(s.nav[2], /Finish/); assert.ok(!s.nav.some(t => /Next/.test(t)));
        assert.equal(s.active, 'BODY', 'arrival focuses nothing - out of this wave');
    });
    // Wave A fix 3: the Finish button HAS the guard now - it had the same
    // swallowed first tap (finish_round_tap_test.js). Its handler is unchanged.
    test('the Finish button keeps its handler, and (Wave A) carries the nav buttons\' mousedown guard', () => {
        // RE-POINTED (Wave 36 revision): the 18th-hole button opens the group's
        // finish popup now, not the recap. The MOUSEDOWN GUARD is what this line is
        // about and it is unchanged - a focused score box must keep focus through
        // the tap so the browser cannot blur, save and rebuild under the finger.
        assert.match(IDX, /<button class="finish-round-nav-btn" onmousedown="event\.preventDefault\(\)" onclick="openCardInPopup\(\)">/);
    });
});

describe('THE SEAM (source)', () => {
    const fn = (name) => { const at = IDX.indexOf('function ' + name + '('); return IDX.slice(at, IDX.indexOf('\n    function ', at + 30)); };
    test('landOnHole is called from the ONE navigation function every handler shares, never from renderHoleView, and NOTHING on the nav path focuses', () => {
        // RE-POINTED IN WAVE 23, and the count went DOWN from two to one. Prev/Next and
        // the 1-18 jump each carried their own "render, then land"; both now go through
        // goToHole. That consolidation is what makes the forced KP gate a single check
        // on every hole change instead of a copy per navigation - and a copy per
        // navigation is how a gate ends up missing from one of them.
        const rhv = fn('renderHoleView');
        assert.ok(!/\.focus\(|landOnHole|pendingScoreFocus/.test(rhv), 'renderHoleView must not focus');
        assert.match(fn('goToHole'), /renderHoleView\(\);\s*landOnHole\(\);/);
        assert.match(fn('goToAdjacentHole'), /goToHole\(/);
        assert.match(fn('jumpToHole'), /goToHole\(/);
        assert.equal((IDX.match(/\n\s+landOnHole\(\);/g) || []).length, 1, 'exactly one call site');
        // RE-POINTED IN WAVE 27. This banned every focus() on the navigation path, to
        // hold v128's decision. The focus is back, so the ban becomes a CONDITION: the
        // ONLY focus allowed on that path is focusFirstEmptyScoreBox(), called from
        // landOnHole, and it must test all three of empty, writable and clear of the
        // keyboard. A bare focus() anywhere else on the path still fails.
        const navPath = [fn('landOnHole'), fn('goToHole'), fn('goToAdjacentHole'), fn('jumpToHole'), fn('toggleHolePicker')].join('\n').replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/pendingScoreFocus/.test(navPath),
            'the navigation path is using the auto-advance focus memo, which is for typing');
        const focusCalls = (navPath.match(/\.focus\(|\.select\(/g) || []);
        assert.equal(focusCalls.length, 0,
            'something on the navigation path focuses directly instead of going through '
            + 'focusFirstEmptyScoreBox: ' + focusCalls.join(', '));
        assert.match(fn('landOnHole'), /focusFirstEmptyScoreBox\(\)/,
            'landOnHole no longer focuses the first empty box');
        const f = fn('focusFirstEmptyScoreBox');
        assert.ok(f.length > 150, 'focusFirstEmptyScoreBox could not be sliced');
        assert.match(f, /:not\(\[disabled\]\)/, 'it does not skip a locked box');
        assert.match(f, /value/, 'it does not require an EMPTY box');
        assert.match(f, /innerHeight/, 'it does not test the keyboard allowance');
        assert.match(f, /KEYBOARD_ALLOWANCE/, 'the allowance is not the named constant');
        // The claim the snapshot re-points rest on: with no memo there is no focus to
        // restore, so a rebuild cannot invent one.
        assert.match(fn('restoreScoreFocus'), /if \(!memo\) return;/,
            'restoreScoreFocus would now focus something after a rebuild with nothing focused before');
    });
    test('the scroll is an explicit scrollTo to the HOLE HEADING (the first box only if there is no heading), never smooth, never a nudge; the nav-row anchor is gone', () => {
        const l = fn('landOnHole');
        assert.match(l, /const anchor = card\.querySelector\('\.hole-view-header'\) \|\| card\.querySelector\('\.score-input'\);/);
        assert.match(l, /window\.scrollTo\(0, Math\.max\(0, y\)\)/);
        // WAVE 19b: the target is now the absolute offset MINUS the offset MINUS the live
        // safe-area inset, and it spans two lines. The inset is why: in the installed app
        // the root is inset for the notch, that inset scrolls away with the document, and
        // without subtracting it the heading landed 12px from the PHYSICAL top of the
        // screen - 35px behind a 47px status bar. What this assertion is about is unchanged
        // and still asserted: one explicit absolute scrollTo, anchored on the heading,
        // never smooth and never a nudge. hole_landing_inset_test.js measures the landing
        // at 0, 47 and 59px of inset, because THIS assertion cannot see a status bar.
        assert.match(l, /anchor\.getBoundingClientRect\(\)\.top \+ \(window\.pageYOffset \|\| 0\)\s*\n?\s*- HOLE_LANDING_OFFSET - inset;/);
        assert.match(l, /parseFloat\(getComputedStyle\(document\.documentElement\)\.paddingTop\) \|\| 0/,
            'the inset must be read from the computed root padding - env() is not readable from script');
        assert.ok(!/smooth|scrollBy|requestAnimationFrame/.test(l));
        const code = IDX.replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/function withNavAnchor|function scrollToHoleCard|withNavAnchor\(|scrollToHoleCard\(/.test(code), 'the anchor and the card-top scroll are gone (comments stripped)');
    });
    test('auto-advance during entry is untouched (v121)', () => {
        assert.match(fn('advanceToNextScoreInput'), /pendingScoreFocus = scoreBoxIdentity\(next\);\s*try \{ next\.focus\(\); next\.select\(\); \}/);
        assert.match(IDX, /oninput="handleScoreInput\(this\)"/);
    });
    test('fix 1: the nav buttons keep the box focused through the tap, and every handler commits first', () => {
        assert.equal((IDX.match(/onmousedown="event\.preventDefault\(\)" onclick="goToAdjacentHole\(/g) || []).length, 2, 'Prev and Next');
        assert.match(IDX, /onmousedown="event\.preventDefault\(\)" onclick="toggleHolePicker\(\)"/);
        assert.match(IDX, /onmousedown="event\.preventDefault\(\)" onclick="jumpToHole\(/);
        // RE-POINTED IN WAVE 23. jumpToHole commits through goToHole now, not itself.
        // That order is load-bearing for more than the keyboard: the fourth golfer's
        // score, typed and not yet left, is what makes the hole COMPLETE, and the forced
        // KP gate is evaluated after the commit - so a gate that ran first would let
        // that tap walk off an unanswered hole.
        ['goToAdjacentHole', 'toggleHolePicker', 'goToHole'].forEach(n => assert.match(fn(n), /commitPendingScore\(\);/, n));
        assert.match(fn('jumpToHole'), /goToHole\(/, 'jumpToHole must reach the shared commit');
        const g = fn('goToHole');
        assert.ok(g.indexOf('commitPendingScore();') < g.indexOf('kpGateBefore('),
            'the gate is evaluated BEFORE the last score is committed');
        assert.match(fn('commitPendingScore'), /a\.blur\(\);/);
        // saveScore and the listener untouched by this wave: the commit is a blur, nothing more.
        assert.ok(!/saveScore\(/.test(fn('commitPendingScore') + fn('landOnHole') + fn('goToAdjacentHole') + fn('goToHole')));
    });
});
