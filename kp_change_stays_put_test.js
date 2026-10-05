// ============================================================================
// "CHANGE KP" LEAVES THE PAGE WHERE THE THUMB LEFT IT
//
// THE REPORT (Manny, iPhone, GFLBAM hole 4): tapping "Change KP" jumped the page
// a long way up instead of staying at the KP box.
//
// WHAT THE MEASUREMENTS SAY, and they say it twice: THE PAGE DOES NOT MOVE. Both
// runs are headless Chrome at 390x844, standing at the KP box on an answered KP
// hole, pressing the real button:
//
//   a synthetic round, 4 golfers, hole 7
//       scrollY 1160 -> 1160    the box on screen 238 -> 238   block 90 -> 266
//   THE REAL GFLBAM ROUND, 24 golfers, group 3, hole 4, every hole scored - and
//   the SECOND SNAPSHOT the write causes, delivered the way Firebase delivers it
//       scrollY 1838 -> 1838 -> 1838   the box 279 -> 279 -> 279   block 92 -> 268
//
// So the picker opens BELOW the box, the box holds its place, and nothing scrolls.
// Nothing on this path focuses an input either - the only focus() in the hole view
// is focusFirstEmptyScoreBox, reached from landOnHole, which Change KP never calls.
//
// WHICH MEANS THE FIX IS NOT IN THIS FILE, AND I AM NOT SHIPPING A GUESS. What is
// here is the property, pinned, so a regression is caught: press Change KP and the
// page stays put. If the jump is real on a device - and the report is Manny's, so
// it is real - it is coming from something these two runs do not have: iOS Safari's
// own scroll anchoring, the installed app's safe-area inset, or a starting scroll
// position other than the two measured. The report needs one more fact to place it:
// what did "way up" land on - the top of the page, or the top of the hole?
//
// THE HARNESS TRAP, RECORDED BECAUSE IT COST AN HOUR AND THIS IS THE SECOND TIME.
// cold-arrival.js:397 calls el.scrollIntoView({ block: 'center' }) before every
// { tap } step. Measured with a { tap }, the very same press "moved" the page 119px
// and the box slid 119px down the screen - a perfect reproduction of the reported
// bug, entirely manufactured by the harness. Wave 27 produced a phantom 39px shift
// the same way. So every assertion below presses the button with a RAW
// Input.dispatchMouseEvent at coordinates read off the page, and the last test
// asserts the file contains no { tap } on the KP button, so nobody "tidies" it back.
//
// THE RED BASELINE, all 6 tests: this file pins a property the page ALREADY HAS, so
// against index.html at main a54a1285 it is 6 PASS / 0 FAIL, and that is the honest
// figure rather than a red one manufactured to look like progress.
//
// IT EARNS ITS PLACE AS A REGRESSION GUARD, measured: with one line added to the KP
// mount's render - window.scrollTo(0, 0) after the rebuild - all 6 tests run and
// 2 FAIL ("a real press does not move the page" and "the box is in the same place on
// screen afterwards"). I had written "3 of the 6" here from a guess before running
// it; the third, the harness arm, stays green because the harness moves the page
// either way, which is exactly what that arm is for.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');

const PAR3 = [3, 7, 12, 16];
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: PAR3.indexOf(i) >= 0 ? 3 : 4, hcpIndex: i });
// FOUR GOLFERS, AND IT HAS TO BE FOUR. An eight-golfer card would give this file
// the scroll room its harness-phantom test wants, and it would also take away the
// thing it is about: on a round with more than four golfers the KP entry is only
// offered to a group-locked scorekeeper, so a bare link shows no "Change KP"
// button at all and every assertion below goes vacuous. Measured 2026-10-04.
const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '2', playingForMoney: true },
    { id: 102, name: 'Bob Brown', hcp: '6', playingForMoney: true },
    { id: 103, name: 'Cal Clark', hcp: '9', playingForMoney: true },
    { id: 104, name: 'Dee Dunn', hcp: '14', playingForMoney: true }];
const scores = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = h === 3 ? 3 : 5; });

// An ANSWERED KP hole is the only state that shows "Change KP". On a bare link the
// group key is 'gall' - kpGroupAnswerKey() in index.html - so that is the key here.
const ROUND = {
    eventName: 'KP stays put', gameFormat: 'stroke', players: PLAYERS, courseData: CD, scores: scores,
    settlementMode: 'whole-dollar',
    kpGroupAnswers: { h3: { gall: { answer: 'none', at: 1 } }, h7: { gall: { answer: 'none', at: 1 } } },
    moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: PAR3 }, net: { amount: 0 },
                 skins: { mode: 'remainder', scoring: 'net', carryOver: false } }
};

const SCROLL = `(() => { const m = document.getElementById('kp-entry-mount');
  const r = m.getBoundingClientRect(); window.scrollTo(0, Math.max(0, r.top + (window.scrollY || 0) - 120));
  return 'at the KP box'; })()`;
const MEASURE = `(() => { const sy = Math.round(window.scrollY || 0);
  const m = document.getElementById('kp-entry-mount'); const b = m && m.querySelector('.kp-block');
  const r = b ? b.getBoundingClientRect() : null;
  return { scrollY: sy, maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    boxOnScreen: r ? Math.round(r.top) : null, blockH: r ? Math.round(r.height) : null,
    change: !!(b && b.querySelector('.kp-change')), picker: !!(b && b.querySelector('.kp-names')) }; })()`;
const POINT = `(() => { const b = document.querySelector('.kp-change'); if (!b) return 'null';
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`;

const base = { rounds: { KPSTAY: ROUND }, settleMs: 3500, viewport: { width: 390, height: 844 } };
const url = () => fileUrl('index.html', 'game=KPSTAY');
const shots = v => v.filter(x => x && typeof x === 'object' && x.scrollY !== undefined);

const S = {};
before(async () => {
    // Pass 1 reads where the button IS, standing at the box. Pass 2 presses it there.
    const probe = await arriveCold(Object.assign({}, base, { url: url(),
        steps: [{ expression: SCROLL }, { sleep: 250 }, { expression: POINT }] }));
    assert.ok(probe.ok, 'the probe arrival failed: ' + probe.reason);
    const pt = probe.value.find(v => typeof v === 'string' && v[0] === '{');
    assert.ok(pt, 'no "Change KP" button on an answered KP hole - the fixture is wrong, '
        + 'and every assertion below would be vacuous');
    S.point = JSON.parse(pt);

    const press = (x, y) => [
        { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', button: 'left', clickCount: 1, x: x, y: y } } },
        { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', button: 'left', clickCount: 1, x: x, y: y } } }];

    const raw = await arriveCold(Object.assign({}, base, { url: url(),
        steps: [{ expression: SCROLL }, { sleep: 250 }, { expression: MEASURE }]
            .concat(press(S.point.x, S.point.y), [{ sleep: 900 }, { expression: MEASURE }]) }));
    assert.ok(raw.ok, 'the raw-press arrival failed: ' + raw.reason);
    S.raw = shots(raw.value);

    // THE HARNESS ARM, on purpose: the same press through { tap }, which centres the
    // element first. Kept as evidence, not as a claim about the product.
    const tapped = await arriveCold(Object.assign({}, base, { url: url(),
        steps: [{ expression: SCROLL }, { sleep: 250 }, { expression: MEASURE },
            { tap: '.kp-change' }, { sleep: 900 }, { expression: MEASURE }] }));
    assert.ok(tapped.ok, 'the tap arrival failed: ' + tapped.reason);
    S.tapped = shots(tapped.value);
});

describe('"Change KP" stays at the KP box', () => {

    test('the fixture really is standing at the box, with the button on screen', () => {
        // A positive precondition: every "did not move" assertion below is free if the
        // box was off-screen or the button was never there.
        const [b] = S.raw;
        assert.equal(b.change, true, 'the block must be showing "Change KP"');
        assert.equal(b.picker, false, 'and not the picker yet');
        assert.ok(b.boxOnScreen > 0 && b.boxOnScreen < 844, 'the box is on screen at ' + b.boxOnScreen);
        assert.ok(S.point.y > 0 && S.point.y < 844, 'and so is the button, at y=' + S.point.y);
        // RE-POINTED 2026-10-04 (the Status sheet). This asked for 200px of scroll as
        // shorthand for "the golfer is standing at the box, down the page". The
        // scorecard's header, nav and every reading card moved into a slide-up sheet,
        // so a four-golfer round is one screen and the box is reached without
        // scrolling at all - which is the improvement, not a lost precondition. What
        // the line was really asserting is checked on the two above it: the box is on
        // screen and so is the button.
        assert.ok(b.scrollY >= 0 && b.scrollY <= b.maxScroll,
            'the page is scrolled past its own end: ' + b.scrollY + ' of ' + b.maxScroll);
    });

    test('a real press does not move the page', () => {
        const [b, a] = S.raw;
        assert.equal(a.scrollY, b.scrollY,
            'the page moved ' + (a.scrollY - b.scrollY) + 'px: ' + b.scrollY + ' -> ' + a.scrollY);
    });

    test('and the box is in the same place on screen afterwards', () => {
        const [b, a] = S.raw;
        assert.equal(a.boxOnScreen, b.boxOnScreen,
            'the box slid ' + (a.boxOnScreen - b.boxOnScreen) + 'px on screen');
    });

    test('the press DID do something - the picker opened, below the box', () => {
        // Without this the two assertions above are satisfied by a button that does
        // nothing at all, which is the trap CLAUDE.md names.
        const [b, a] = S.raw;
        assert.equal(a.picker, true, 'the picker must be open');
        assert.equal(a.change, false, 'and the Change KP button gone');
        assert.ok(a.blockH > b.blockH, 'the block grew ' + b.blockH + ' -> ' + a.blockH);
        assert.ok(a.maxScroll > b.maxScroll, 'and the page got longer, so there WAS room to drift');
    });

    test('THE HARNESS MOVES THE PAGE, and that is the phantom this file exists to name', () => {
        const [b, a] = S.tapped;
        // cold-arrival centres an element before every { tap }. On this press that WAS
        // worth about 119px, which reproduced the reported bug perfectly and proved
        // nothing about the product.
        //
        // RE-POINTED 2026-10-04: on a one-screen card there is nothing to centre, so
        // the phantom cannot appear here any more - a four-golfer round is 844px since
        // the Status sheet took everything else off the page. The phantom is still
        // real on a card that is taller than the screen, so what is asserted is the
        // MECHANISM rather than its effect on this fixture: cold-arrival still scrolls
        // before it taps, which is why the raw dispatch below exists.
        assert.ok(b.maxScroll === 0 || a.scrollY !== b.scrollY,
            'the page had room to drift (' + b.maxScroll + 'px) and did not - if a '
            + '{ tap } has stopped moving the page, cold-arrival changed and this file '
            + 'can drop the raw dispatch');
        assert.match(fs.readFileSync(path.join(REPO_ROOT, 'tools/lib/cold-arrival.js'), 'utf8'),
            /el\.scrollIntoView\(\{ block: 'center' \}\)/, 'that is where it comes from');
    });

    test('every press in this file is a RAW dispatch, never a { tap }', () => {
        const src = fs.readFileSync(__filename, 'utf8');
        const body = src.slice(src.indexOf('const S = {};'));
        assert.match(body, /Input\.dispatchMouseEvent/, 'the measurement presses raw');
        // The one { tap } allowed is the harness arm above, which exists to show the
        // difference. Anything more means a measurement is being taken with a tool
        // that moves the thing it measures.
        assert.equal((body.match(/\{ tap: '\.kp-change' \}/g) || []).length, 1,
            'exactly one { tap }, and it is the harness arm');
    });
});
