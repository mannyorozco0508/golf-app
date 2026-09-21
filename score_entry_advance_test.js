// ============================================================================
// SCORE ENTRY AUTO-ADVANCE SURVIVES THE SAVE
//
// THE DEFECT (measured 2026-09-13, never worked since bbdb736 on 2026-08-08):
// typing a digit in Hole View moved focus to the next golfer's box, which
// blurred the first, which fired `change` -> saveScore -> set() -> the vendored
// Firebase SDK raised the round's 'value' event SYNCHRONOUSLY inside set() ->
// renderScorecard rebuilt the Hole View -> the box about to receive focus was
// a detached element -> activeElement <body>, keyboard closed. Event order,
// from Chrome: focus(Ann) > input(Ann) > change(Ann) > hole-view REBUILT.
//
// THE FIX (index.html): the advance announces its target by IDENTITY (player
// id + hole) before calling focus(); renderScorecard captures what should have
// focus before it rewrites anything and, after the rebuild, focuses the NEW
// element with that identity - synchronously, inside the same keystroke's
// event, so iOS keeps the keyboard up. A rebuild while a golfer is mid-entry
// (another group's score arriving) restores their box, their typed value and
// their caret. A rebuild caused by this device saving because the golfer LEFT
// the box (a tap elsewhere; the last golfer's blur) restores nothing.
//
// WHY THIS IS A CHROME TEST AND NOT A MINI-DOM ONE. The defect lives in the
// browser's focus/change/blur sequencing and in the SDK raising events inside
// set(). mini-dom has neither. Every scenario here arrives cold, taps a real
// box (Input.dispatchMouseEvent) and types real digits (Input.dispatchKeyEvent)
// through the page's own handlers, and runs against a data stub whose set()
// re-fires the page's value listener synchronously with the new score - the
// stub that reproduces the bug. The harness's default stub, whose set() is a
// no-op, is run ONCE as a control to show the advance rule alone was never the
// problem; it is not the coverage.
//
// The vendored SDK's synchrony was proved separately in a vm: with a complete
// local view of events/X, `set()` on a child logs 'value fired' BEFORE the
// line after set() runs.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
function round(flights) {
    const P = makePlayers(NAMES, [2, 9, 15, 4, 20, 7, 11, 0], 101, flights ? ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'] : undefined);
    const d = { eventName: 'Advance', courseName: 'Test', players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false,
        courseData: CD, scores: {}, settlementMode: 'whole-dollar',
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } } };
    if (flights) d.flights = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } };
    return d;
}
const DB = { events: { ADVFLT: round(true), ADVFLAT: round(false) }, global_courses: {}, trips: {}, tournaments: {} };

// THE RE-FIRING STUB lives in helpers/refire-stub.js now (shared with
// hole_view_landing_test.js); its contract is documented there.
const { REFIRE, TRACE_ONLY } = require('./helpers/refire-stub.js');

// Where focus is, by identity - never by index.
const tagged = (t, expr) => ({ expression: JSON.stringify(t + ':') + ' + (' + expr + ')' });
const WHERE = `(function(){ var a = document.activeElement; if (!a || a === document.body) return 'BODY';
  if (!a.classList || !a.classList.contains('score-input')) return a.tagName + (a.id ? '#' + a.id : '');
  var row = a.closest('.hv-player-row'); var vis = !!a.closest('#hole-view-card');
  return (vis ? 'HV:' : 'HIDDEN:') + (row ? row.querySelector('.hv-player-name').innerText.split('\\n')[0].split(' ')[0] : a.getAttribute('data-player-id')) + '/h' + a.getAttribute('data-hole') + ' value=' + JSON.stringify(a.value) + ' sel=' + a.selectionStart + '-' + a.selectionEnd; })()`;
const VALUES = "JSON.stringify(Array.from(document.querySelectorAll('#hole-view-card .score-input')).map(function (i) { return i.value; }))";
const EVENTS = "window.__ev.join(' > ')";
const RESET_EV = "window.__ev = []; 'reset'";
const boxRect = (n) => `(function(){ var el = document.querySelectorAll('#hole-view-card .score-input:not([disabled])')[${n}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;
// A tap needs coordinates measured in the same page; the harness cannot feed a
// step's value into the next step, so the tap targets the box's centre as laid
// out at 390x844 after scrollIntoView - measured once and asserted below.
const tap = (x, y) => [
    { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } } },
    { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } } }];
const key = (k) => [
    { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: k, code: 'Digit' + k, text: k } } },
    { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code: 'Digit' + k } } }];

async function drive(code, steps, opts) {
    const refire = !(opts && opts.noopStub);
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + code + '&group=1'), db: DB, settleMs: 5000,
        preScript: 'window.__STUBDB = ' + JSON.stringify(DB) + ';' + (refire ? REFIRE : TRACE_ONLY), steps });
    return r;
}

// One arrival per scenario, sequential (concurrent Chromes on one profile dir
// have corrupted runs before). The rect of the first box is read in the first
// arrival and reused: every arrival is the same page at the same size.
const S = {};
before(async () => {
    const probe = await drive('ADVFLAT', [{ expression: boxRect(0) }, { expression: boxRect(1) }, { expression: boxRect(2) }, { expression: boxRect(3) }]);
    assert.ok(probe.ok, 'Chrome did not run: ' + probe.reason);
    S.rects = probe.value;
    assert.ok(S.rects.every(Boolean), 'four score boxes in Hole View: ' + JSON.stringify(S.rects));
    const [b0, b1, b2, b3] = S.rects;

    for (const code of ['ADVFLAT', 'ADVFLT']) {
        // 1. golfer 1 -> 2, then 2 -> 3, then a lone '1' on golfer 3, then the
        //    second digit, then the last golfer.
        S[code] = await drive(code, [
            { expression: boxRect(0) }, ...tap(b0.x, b0.y), { expression: RESET_EV },
            ...key('4'), { sleep: 150 }, tagged('W4', WHERE), tagged('E4', EVENTS),
            { expression: RESET_EV }, ...key('5'), { sleep: 150 }, tagged('W5', WHERE),
            { expression: RESET_EV }, ...key('1'), { sleep: 150 }, tagged('W1', WHERE), tagged('E1', EVENTS),
            ...key('2'), { sleep: 150 }, tagged('W12', WHERE),
            { expression: RESET_EV }, ...key('6'), { sleep: 150 }, tagged('W6', WHERE), tagged('E6', EVENTS),
            tagged('VALUES', VALUES), tagged('REFIRED', 'window.__refired')
        ]);
        // 2. another device's snapshot while golfer 1 is mid-entry with a lone '1'.
        S[code + '_remote'] = await drive(code, [
            { expression: boxRect(0) }, ...tap(b0.x, b0.y), ...key('1'), { sleep: 100 }, tagged('BEFORE', WHERE),
            { expression: RESET_EV }, { expression: "window.__remote({ p102_h1: 5, p103_h1: 4 }); 'remote'" }, { sleep: 100 },
            tagged('AFTER', WHERE), tagged('VALUES', VALUES), tagged('EVENTS', EVENTS), tagged('SAVED', 'JSON.stringify(currentData.scores)')
        ]);
    }
    // 2b. the ROSTER changes under the golfer: mid-entry on Ben (second box), the
    //     organizer's re-save arrives with Ben moved to the FRONT of the group.
    //     Identity keeps the golfer on Ben's box (now the first); a restore by
    //     position would land on whoever now occupies the second box (Ann).
    S.roster = await drive('ADVFLAT', [
        { expression: boxRect(1) }, ...tap(b1.x, b1.y), ...key('1'), { sleep: 100 }, tagged('BEFORE', WHERE),
        { expression: RESET_EV }, { expression: "window.__remoteRoster([102, 101, 103, 104]); 'remote'" }, { sleep: 100 },
        tagged('AFTER', WHERE), tagged('NAMES', "JSON.stringify(Array.from(document.querySelectorAll('#hole-view-card .hv-player-name')).map(function (n) { return n.innerText.split('\\n')[0].split(' ')[0]; }))")
    ]);
    // 3. the control: the harness stub, set() a no-op - the advance alone.
    S.noop = await drive('ADVFLAT', [{ expression: boxRect(0) }, ...tap(b0.x, b0.y), { expression: RESET_EV }, ...key('4'), { sleep: 150 }, tagged('W4', WHERE), tagged('E4', EVENTS)], { noopStub: true });
    // 4. no box focused: a snapshot changes nothing about focus.
    S.idle = await drive('ADVFLAT', [tagged('BEFORE', WHERE), { expression: "window.__remote({ p102_h1: 5 }); 'remote'" }, { sleep: 100 }, tagged('AFTER', WHERE), tagged('REFIRED', 'window.__refired')]);
});

// A probe's value, found by its tag - never by position in the step list.
const val = (r, tag) => { const hit = (r.value || []).find(v => typeof v === 'string' && v.startsWith(tag + ':')); assert.ok(hit !== undefined, 'no probe tagged ' + tag + ' in ' + JSON.stringify(r.value).slice(0, 300)); return hit.slice(tag.length + 1); };

const ran = (r, name) => { assert.ok(r && r.ok, name + ' did not run: ' + (r && r.reason)); return r; };

['ADVFLAT', 'ADVFLT'].forEach(code => {
    const label = code === 'ADVFLT' ? 'FLIGHTED' : 'FLIGHTLESS';
    describe(label + ' - typing through the hole with the re-firing stub', () => {
        test('golfer 1 -> golfer 2: after "4" focus is on Ben\'s box, not body, and the rebuild happened', () => {
            const r = ran(S[code], code);
            assert.match(val(r, 'W4'), /^HV:Ben\/h1 /, 'focus after the first digit: ' + val(r, 'W4'));
            // The order that used to end at the rebuild now continues: the rebuild
            // (value->render) focuses the NEW Ben box from inside the change handler.
            // (The tap's own focus(Ann) precedes the reset and is not in this trace.)
            assert.match(val(r, 'E4'), /^input\(Ann\) > change\(Ann\) > value->render > focus\(Ben\)/, 'order: ' + val(r, 'E4'));
        });
        test('golfer 2 -> golfer 3 the same way', () => {
            assert.match(val(ran(S[code], code), 'W5'), /^HV:Cal\/h1 /);
        });
        test('a lone "1" stays put and saves nothing; the second digit advances', () => {
            const r = ran(S[code], code);
            assert.match(val(r, 'W1'), /^HV:Cal\/h1 value="1"/, 'after "1": ' + val(r, 'W1'));
            assert.ok(!/change|value->render/.test(val(r, 'E1')), 'no save on a lone 1: ' + val(r, 'E1'));
            assert.match(val(r, 'W12'), /^HV:Dee\/h1 /, 'after "12": ' + val(r, 'W12'));
        });
        test('the last golfer: focus ends nowhere (BODY) after the save, as before', () => {
            const r = ran(S[code], code);
            assert.equal(val(r, 'W6'), 'BODY');
            assert.match(val(r, 'E6'), /change\(Dee\) > value->render/, 'the save still ran: ' + val(r, 'E6'));
        });
        test('every typed score is on the card after the rebuilds; the listener re-fired at least once per save', () => {
            const r = ran(S[code], code);
            assert.deepEqual(JSON.parse(val(r, 'VALUES')), ['4', '5', '12', '6']);
            assert.ok(Number(val(r, 'REFIRED')) >= 4, 'refired ' + val(r, 'REFIRED'));
        });
        test('another device\'s snapshot mid-entry: the golfer keeps the box, the typed "1" and the caret; the other scores land', () => {
            const r = ran(S[code + '_remote'], code + '_remote');
            assert.match(val(r, 'BEFORE'), /^HV:Ann\/h1 value="1" sel=1-1/, 'before: ' + val(r, 'BEFORE'));
            assert.match(val(r, 'AFTER'), /^HV:Ann\/h1 value="1" sel=1-1/, 'after the remote snapshot: ' + val(r, 'AFTER'));
            assert.deepEqual(JSON.parse(val(r, 'VALUES')), ['1', '5', '4', '']);
            assert.match(val(r, 'EVENTS'), /^REMOTE > value->render/);
            // FOUND, NOT FIXED (pre-existing, Chrome-measured): when the rebuild removes
            // a focused box whose value is dirty, Chrome fires `change` on it, so the
            // lone "1" is SAVED as a score of 1 by the remote snapshot's rebuild -
            // exactly as it was before this fix (the rebuild removed the box then too).
            // The golfer's next digit re-saves the real score. Pinned so the report
            // says it plainly and a later paste can decide; not this fix's business.
            assert.match(val(r, 'EVENTS'), /change\(Ann\)/, 'today: the removal fires change');
            assert.equal(JSON.parse(val(r, 'SAVED')).p101_h1, 1, 'today: the partial value is saved by the rebuild');
        });
    });
});

describe('THE ROSTER CHANGES UNDER THE GOLFER (identity, not position)', () => {
    test('mid-entry on Ben, Ben moves to the front: focus stays on BEN\'s box, with the typed "1"', () => {
        const r = ran(S.roster, 'roster');
        assert.match(val(r, 'BEFORE'), /^HV:Ben\/h1 value="1"/, val(r, 'BEFORE'));
        assert.deepEqual(JSON.parse(val(r, 'NAMES')), ['Ben', 'Ann', 'Cal', 'Dee'], 'the rebuild drew the new order');
        assert.match(val(r, 'AFTER'), /^HV:Ben\/h1 value="1"/, 'after the roster snapshot: ' + val(r, 'AFTER'));
    });
});

describe('CONTROLS AND THE IDLE CASE', () => {
    test('the no-op stub (no rebuild): the advance rule alone always worked - Ben, with blur/focus in the browser\'s own order', () => {
        const r = ran(S.noop, 'noop');
        assert.match(val(r, 'W4'), /^HV:Ben\/h1 /);
        assert.equal(val(r, 'E4'), 'input(Ann) > change(Ann) > blur(Ann) > focus(Ben)');
    });
    test('no box focused: a snapshot rebuild leaves focus where it was (nowhere)', () => {
        const r = ran(S.idle, 'idle');
        assert.equal(val(r, 'BEFORE'), 'BODY'); assert.equal(val(r, 'AFTER'), 'BODY'); assert.equal(Number(val(r, 'REFIRED')), 1);
    });
    test('the four boxes were laid out where the taps went (390x844)', () => {
        assert.ok(S.rects.every(r => r.x > 200 && r.x < 390 && r.y > 0 && r.y < 844), JSON.stringify(S.rects));
    });
});

describe('THE SEAM (source)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    test('boxes carry their identity; the advance announces its target by identity and walks its own view only', () => {
        assert.match(src, /class="score-input" data-player-id="\$\{p\.id\}" data-hole="\$\{h\.hole\}"/);
        const adv = src.slice(src.indexOf('function advanceToNextScoreInput('), src.indexOf('function scoreBoxIdentity('));
        assert.match(adv, /pendingScoreFocus = scoreBoxIdentity\(next\);/);
        assert.match(adv, /closest\('#hole-view-card'\)/);
        assert.match(adv, /finally \{ pendingScoreFocus = null; \}/);
    });
    test('renderScorecard captures first and restores last, synchronously - no timer anywhere in the focus path', () => {
        const rs = src.slice(src.indexOf('function renderScorecard()'), src.indexOf('function renderScorecard()') + 400);
        assert.match(rs, /const focusMemo = .*captureScoreFocus\(\)/);
        // The restore is the last statement of renderScorecard, called DIRECTLY -
        // a setTimeout/rAF around it puts the focus() in a later task, after the
        // keystroke's event has finished, which is exactly what iOS refuses to open
        // the keyboard for (Chrome still lands the focus, so only this pin and the
        // event-order assertion above can catch it).
        const at = src.indexOf("if (currentViewMode === 'hole') renderHoleView();\n        restoreScoreFocus(focusMemo);\n    }");
        assert.ok(at > 0, 'restoreScoreFocus(focusMemo) directly after renderHoleView(), closing renderScorecard');
        assert.ok(!/setTimeout\([^)]*restoreScoreFocus/.test(src), 'no deferred restore');
        const focusPath = src.slice(src.indexOf('function scoreBoxIdentity('), src.indexOf('function restoreScoreFocus(')) + src.slice(src.indexOf('function restoreScoreFocus('), src.indexOf('\n    }', src.indexOf('function restoreScoreFocus(')));
        assert.ok(!/setTimeout|requestAnimationFrame|Promise|then\(/.test(focusPath), 'a delayed focus() cannot keep the iOS keyboard');
        assert.match(focusPath, /if \(scoreChangeInFlight\) return null;/, 'a golfer who left the box is not dragged back');
    });
});

// ---------------------------------------------------------------------------
// THE MISSING-HOLE TAP (v192, score-gaps.js / index.html jumpToGap). Ann has
// scored 2-5 and not 1: the banner above the card names her, and one real tap
// on it must leave focus ON ANN'S HOLE-1 BOX, in the Hole View, synchronously
// (the same identity-focus path the advance uses). mini-dom cannot prove a
// focus; this arrival can.
describe('THE MISSING-HOLE BANNER: one tap lands focus on the gap box (Chrome, 390x844)', () => {
    const gappy = round(false);
    [2, 3, 4, 5].forEach(h => { gappy.scores['p101_h' + h] = 4; gappy.scores['p102_h' + h] = 4; gappy.scores['p103_h' + h] = 4; gappy.scores['p104_h' + h] = 4; });
    gappy.scores['p102_h1'] = 4; gappy.scores['p103_h1'] = 4; gappy.scores['p104_h1'] = 4;   // everyone but Ann scored 1
    const GDB = { events: { ADVGAP: gappy }, global_courses: {}, trips: {}, tournaments: {} };
    let r;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=ADVGAP&group=1'), db: GDB, settleMs: 5000, steps: [
            tagged('B0', "document.getElementById('gap-banner').innerText.replace(/\\s+/g, ' ').trim()"),
            tagged('H0', 'String(currentViewedHole)'),
            { tap: '#gap-banner .gap-banner-line', nth: 0 },
            tagged('W1', WHERE),
            tagged('H1', 'String(currentViewedHole)'),
            tagged('OUT', "(function () { var el = document.querySelector('#hole-view-card .score-input[data-player-id=\"101\"][data-hole=\"1\"]'); return el ? getComputedStyle(el).outlineColor + ' ' + getComputedStyle(el).outlineWidth : 'no box'; })()")
        ] });
    });
    test('ran', () => assert.ok(r && r.ok, r && r.reason));
    test('the banner names Ann and hole 1 (the page lands on hole 1 itself - the group\'s first incomplete hole - so the tap\'s proof is the FOCUS, which nothing else puts there)', () => {
        assert.match(val(r, 'B0'), /Ann: hole 1 has no score/);
        assert.equal(val(r, 'H0'), '1');
    });
    test('after the tap: Hole View is on hole 1 and focus is on Ann\'s box, by identity', () => {
        assert.equal(val(r, 'H1'), '1');
        assert.match(val(r, 'W1'), /^HV:Ann\/h1/);
    });
    test('the gap box is outlined red (a computed outline, not a class that resolves to nothing)', () => {
        assert.match(val(r, 'OUT'), /rgb\(230, 57, 70\) 2px/);
    });
});
