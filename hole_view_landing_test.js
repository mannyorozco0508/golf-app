// ============================================================================
// HOLE VIEW: A CONSISTENT LANDING ON HOLE CHANGE, and the tap that went nowhere.
//
// THE RULE (index.html, landOnHole / commitPendingScore / goToAdjacentHole /
// jumpToHole). After Next, Prev and the 1-18 jump the page scrolls so the first
// score box sits HOLE_LANDING_OFFSET px from the top of the viewport - an
// explicit scrollTo, the same whatever the golfer count, the banners, or where
// the page was - and then the first EMPTY writable box is focused and selected,
// synchronously inside the click. A completed hole focuses nothing. Disabled
// boxes are scrolled to and never focused. And a score still focused when Next
// is tapped (a lone "1", a corrected number) no longer swallows the tap: the
// box keeps focus through the mousedown and the handler commits it inside the
// click, so the hole always changes and the score is saved.
//
// WHY CHROME. helpers/mini-dom.js has no layout and does not parse innerHTML:
// no rects, no boxes to find, no focus. Every measurement here is a cold
// arrival on index.html through tools/lib/cold-arrival.js at 390x844 - taps
// and keys by CDP, the round handed in through the data stub, nothing the page
// defines invoked. Scrolls made "by the golfer" are scrollIntoView / scrollTo
// on DOM nodes, which is what a thumb does; they call no page function.
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

// Where the page is, by identity - never by index.
const STATE = `(function(){ var a = document.activeElement; var card = document.getElementById('hole-view-card'); var boxes = card ? card.querySelectorAll('.score-input') : []; var first = boxes[0]; var fr = first && first.getBoundingClientRect();
  var id = (a && a.classList && a.classList.contains('score-input')) ? 'p' + a.getAttribute('data-player-id') + '/h' + a.getAttribute('data-hole') : (a === document.body ? 'BODY' : a.tagName);
  var selected = (a && a.classList && a.classList.contains('score-input')) ? (a.selectionStart === 0 && a.selectionEnd === a.value.length) : null;
  var nav = document.querySelector('.hole-view-nav-row'); var btns = nav ? Array.from(nav.querySelectorAll('button')).map(function (b) { return b.innerText.trim(); }) : [];
  return JSON.stringify({ hole: (document.querySelector('.hv-hole-num') || {}).innerText, scrollY: Math.round(window.scrollY), firstBoxTop: fr ? Math.round(fr.top * 10) / 10 : null, boxes: boxes.length, enabled: Array.from(boxes).filter(function (b) { return !b.disabled; }).length,
    active: id, selected: selected, activeValue: a && a.value !== undefined ? a.value : null, nav: btns, finishOpen: getComputedStyle(document.getElementById('finish-round-modal-overlay')).display, ui: window.__ui.splice(0), ev: (window.__ev || []).splice(0) }); })()`;
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
    const g8 = await arrive('game=LND', [{ expression: SCROLL_TO_4TH }, { expression: NAV_BTN(2) }]);
    S.next8 = P(g8, 1);

    // 1. NEXT from the 4th golfer, NEXT again from the page top, PREV from the
    //    landed position: three different starting offsets, one landing. Then a
    //    remote snapshot while the landed box is focused.
    S.nav = await arrive('game=LND&group=1', [
        { expression: SCROLL_TO_4TH }, { expression: STATE }, ...tap(S.next1), { expression: STATE },
        { expression: NAV_TO_BOTTOM }, { expression: STATE }, ...tap(S.nextB), { expression: STATE },
        ...tap(S.prevL), { expression: STATE },
        { expression: "window.__remote({ p103_h2: 5 }); 'remote'" }, { expression: STATE },
        // the golfer closed the keyboard (nothing focused); a snapshot must not reopen it
        { expression: "document.activeElement.blur(); 'keyboard closed'" }, { expression: "window.__remote({ p104_h2: 4 }); 'remote'" }, { expression: STATE }]);
    // 2. Eight golfers on the organizer link: every box disabled.
    S.org = await arrive('game=LND', [{ expression: SCROLL_TO_4TH }, { expression: STATE }, ...tap(S.next8), { expression: STATE }]);
    // 3. The 1-18 jump to hole 5.
    S.jump = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), ...tap(S.posL),
        { expression: "document.querySelector('.hole-picker').scrollIntoView({ block: 'center' }); 'picker shown'" }, { expression: STATE }, ...tap(S.pick5), { expression: STATE }]);
    // 4. FIX 1: a lone "1" typed in the 4th box, still focused, then Next.
    S.pending = await arrive('game=LND&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.box4), ...key('1'), { sleep: 50 }, { expression: STATE }, ...tap(S.next1), { expression: STATE },
        { expression: "(document.querySelector('#full-card-container .score-input[data-player-id=\"104\"][data-hole=\"1\"]') || {}).value" }]);
    // 5. Golfer 1 already has hole 2: the first EMPTY box is golfer 2's.
    S.part = await arrive('game=LNDPART&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), { expression: STATE }]);
    // 6. Every hole scored: the landing scrolls, focuses nothing; a snapshot changes nothing.
    S.full = await arrive('game=LNDFULL&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.next1), { expression: STATE }, { expression: "window.__remote({}); 'remote'" }, { expression: STATE }]);
    // 7. Only 18 open: arrival lands on 18, whose nav ends in Finish Round.
    S.last = await arrive('game=LND17&group=1', [{ expression: STATE }, { expression: NAV_BTN(2) }]);
    if (S.last.ok) { const fin = P(S.last, 1); S.lastTap = await arrive('game=LND17&group=1', [{ expression: "document.querySelector('.hole-view-nav-row').scrollIntoView({ block: 'center' }); 'shown'" }, { expression: NAV_BTN(2) }]); }
});

const landed = (st, hole) => {
    assert.equal(st.hole, 'Hole ' + hole);
    // Within a device pixel of the offset (fractional layout rounds the scroll);
    // "identical every time" is asserted as equality between navigations below.
    assert.ok(Math.abs(st.firstBoxTop - OFFSET) <= 1, 'first box ' + st.firstBoxTop + 'px from the top, expected ' + OFFSET);
};

describe('THE LANDING: Next, Next again, Prev - one place, whatever the starting offset', () => {
    test('ran', () => assert.ok(S.nav && S.nav.ok, S.nav && S.nav.reason));
    test('the offset is a named constant the page reads', () => assert.ok(OFFSET > 0 && OFFSET < 60, 'HOLE_LANDING_OFFSET = ' + OFFSET));
    test('before: scrolled to the 4th golfer, the first box is NOT at the landing and nothing is focused', () => {
        const b = P(S.nav, 1);
        assert.equal(b.hole, 'Hole 1'); assert.ok(Math.abs(b.firstBoxTop - OFFSET) > 20, 'started at ' + b.firstBoxTop); assert.equal(b.active, 'BODY');
    });
    test('Next from the 4th golfer: hole 2, the first box at the offset, focused and selected', () => {
        const s = P(S.nav, 4); landed(s, 2);
        assert.equal(s.active, 'p101/h2'); assert.equal(s.selected, true);
        assert.deepEqual(s.ui, ['mousedown[Next ▶]', 'click[Next ▶]']);
    });
    test('Next from a different offset (the nav row dragged to the bottom edge): hole 3, the SAME landing', () => {
        const before = P(S.nav, 6), s = P(S.nav, 9);
        assert.ok(Math.abs(before.firstBoxTop - OFFSET) > 20, 'a genuinely different start: ' + before.firstBoxTop);
        landed(s, 3); assert.equal(s.active, 'p101/h3');
        assert.equal(s.firstBoxTop, P(S.nav, 4).firstBoxTop, 'identical, not merely close');
    });
    test('Prev: hole 2, the same landing, the first empty box focused', () => {
        const s = P(S.nav, 12); landed(s, 2); assert.equal(s.active, 'p101/h2'); assert.equal(s.selected, true);
        assert.equal(s.firstBoxTop, P(S.nav, 4).firstBoxTop);
    });
    test('a remote snapshot while the landed box is focused: focus stays on that box, nothing typed is lost', () => {
        const s = P(S.nav, 14);
        assert.ok(s.ev.includes('value->render'), 'the snapshot rebuilt the card: ' + s.ev.join(' > '));
        assert.equal(s.active, 'p101/h2'); assert.equal(s.activeValue, '');
    });
    test('a remote snapshot while NOTHING is focused (keyboard closed) focuses nothing - hole 2 still has empty boxes', () => {
        const s = P(S.nav, 17);
        assert.ok(s.ev.includes('value->render'), s.ev.join(' > '));
        assert.equal(s.active, 'BODY'); assert.ok(s.enabled >= 2);
    });
});

describe('DISABLED BOXES (organizer link on eight golfers): the scroll lands, the focus does nothing', () => {
    test('ran', () => assert.ok(S.org && S.org.ok, S.org && S.org.reason));
    test('eight boxes, none writable; Next lands the first box at the offset and focuses NOTHING', () => {
        const b = P(S.org, 1), s = P(S.org, 4);
        assert.equal(b.boxes, 8); assert.equal(b.enabled, 0);
        landed(s, 2); assert.equal(s.active, 'BODY');
    });
});

describe('THE 1-18 JUMP shares the landing', () => {
    test('ran', () => assert.ok(S.jump && S.jump.ok, S.jump && S.jump.reason));
    test('the picker opened from hole 2; tapping 5 lands hole 5 exactly as Next does, first box focused', () => {
        const before = P(S.jump, 6), s = P(S.jump, 9);
        assert.equal(before.hole, 'Hole 2');
        landed(s, 5); assert.equal(s.active, 'p101/h5'); assert.equal(s.selected, true);
        assert.equal(s.firstBoxTop, P(S.nav, 4).firstBoxTop, 'the same offset as Next');
    });
});

describe('FIX 1: a score still focused when Next is tapped', () => {
    test('ran', () => assert.ok(S.pending && S.pending.ok, S.pending && S.pending.reason));
    test('before the tap: "1" sits in the 4th box, focused, unsaved (no advance on a lone 1)', () => {
        const b = P(S.pending, 6);
        assert.equal(b.active, 'p104/h1'); assert.equal(b.activeValue, '1');
        assert.ok(!b.ev.includes('change(Dee\nHCP)'), 'nothing saved yet: ' + b.ev.join(' > '));
    });
    test('the tap NAVIGATES: hole 2 landed, first box focused - the click was delivered', () => {
        const s = P(S.pending, 9);
        landed(s, 2); assert.equal(s.active, 'p101/h2');
        assert.deepEqual(s.ui, ['mousedown[Next ▶]', 'click[Next ▶]'], 'mousedown AND click');
    });
    test('and the score was committed inside the click: change -> value -> render happened, and the card holds the 1', () => {
        const s = P(S.pending, 9);
        const ev = s.ev.join(' > ');
        assert.ok(/change\(Dee/.test(ev) && /value->render/.test(ev), ev);
        assert.equal(S.pending.value[10], '1', 'Dee\'s hole 1 on the card');
    });
});

describe('THE FIRST EMPTY BOX, NOT THE FIRST BOX', () => {
    test('ran', () => assert.ok(S.part && S.part.ok, S.part && S.part.reason));
    test('golfer 1 already has hole 2: Next lands the same and focuses golfer 2', () => {
        const s = P(S.part, 3); landed(s, 2); assert.equal(s.active, 'p102/h2'); assert.equal(s.selected, true);
    });
});

describe('A COMPLETED HOLE focuses nothing', () => {
    test('ran', () => assert.ok(S.full && S.full.ok, S.full && S.full.reason));
    test('every box on hole 2 holds a score: the landing scrolls, activeElement stays BODY', () => {
        const s = P(S.full, 3); landed(s, 2); assert.equal(s.active, 'BODY'); assert.equal(s.enabled, 4);
    });
    test('a remote snapshot afterwards does not focus anything either (the focus is not in renderHoleView)', () => {
        const s = P(S.full, 5);
        assert.ok(s.ev.includes('value->render')); assert.equal(s.active, 'BODY');
    });
});

describe('THE LAST HOLE is unaffected', () => {
    test('ran', () => assert.ok(S.last && S.last.ok, S.last && S.last.reason));
    test('arrival lands on 18 (the only open hole); the nav ends in Finish, there is no Next', () => {
        const s = P(S.last, 0);
        assert.equal(s.hole, 'Hole 18'); assert.equal(s.nav.length, 3); assert.match(s.nav[2], /Finish/); assert.ok(!s.nav.some(t => /Next/.test(t)));
        assert.equal(s.active, 'BODY', 'arrival focuses nothing - out of this wave');
    });
    test('the Finish button keeps its handler and its markup is not given the nav buttons\' mousedown guard', () => {
        assert.match(IDX, /<button class="finish-round-nav-btn" onclick="openFinishRoundModal\(\)">/);
    });
});

describe('THE SEAM (source)', () => {
    const fn = (name) => { const at = IDX.indexOf('function ' + name + '('); return IDX.slice(at, IDX.indexOf('\n    function ', at + 30)); };
    test('the focus lives in landOnHole, called from the three navigation handlers and never from renderHoleView', () => {
        const rhv = fn('renderHoleView');
        assert.ok(!/\.focus\(|landOnHole|pendingScoreFocus/.test(rhv), 'renderHoleView must not focus');
        assert.match(fn('goToAdjacentHole'), /renderHoleView\(\);\s*landOnHole\(\);/);
        assert.match(fn('jumpToHole'), /renderHoleView\(\);\s*landOnHole\(\);/);
        assert.match(fn('landOnHole'), /empty\.focus\(\)/);
        assert.equal((IDX.match(/\n\s+landOnHole\(\);/g) || []).length, 2, 'exactly two call sites');
    });
    test('the scroll is an explicit scrollTo to the first box, never smooth, never a nudge; the nav-row anchor is gone', () => {
        const l = fn('landOnHole');
        assert.match(l, /window\.scrollTo\(0, Math\.max\(0, y\)\)/);
        assert.match(l, /first\.getBoundingClientRect\(\)\.top \+ \(window\.pageYOffset \|\| 0\) - HOLE_LANDING_OFFSET/);
        assert.ok(!/smooth|scrollBy|requestAnimationFrame/.test(l));
        const code = IDX.replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/function withNavAnchor|function scrollToHoleCard|withNavAnchor\(|scrollToHoleCard\(/.test(code), 'the anchor and the card-top scroll are gone (comments stripped)');
    });
    test('the first EMPTY writable box is the focus target; a completed hole returns before any focus', () => {
        const l = fn('landOnHole');
        assert.match(l, /boxes\.find\(b => !b\.disabled && !String\(/);
        assert.match(l, /if \(!empty\) return;/);
    });
    test('fix 1: the nav buttons keep the box focused through the tap, and every handler commits first', () => {
        assert.equal((IDX.match(/onmousedown="event\.preventDefault\(\)" onclick="goToAdjacentHole\(/g) || []).length, 2, 'Prev and Next');
        assert.match(IDX, /onmousedown="event\.preventDefault\(\)" onclick="toggleHolePicker\(\)"/);
        assert.match(IDX, /onmousedown="event\.preventDefault\(\)" onclick="jumpToHole\(/);
        ['goToAdjacentHole', 'jumpToHole', 'toggleHolePicker'].forEach(n => assert.match(fn(n), /commitPendingScore\(\);/, n));
        assert.match(fn('commitPendingScore'), /a\.blur\(\);/);
        // saveScore and the listener untouched by this wave: the commit is a blur, nothing more.
        assert.ok(!/saveScore\(/.test(fn('commitPendingScore') + fn('landOnHole') + fn('goToAdjacentHole')));
    });
});
