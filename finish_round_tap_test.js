// ============================================================================
// THE FINISH ROUND BUTTON'S SWALLOWED TAP (Wave A, fix 3). index.html.
//
// THE SAME SHAPE v128 FIXED FOR PREV/NEXT. On hole 18, with a score typed and
// not yet left (a lone "1", a corrected number), the golfer taps Finish Round.
// The browser's mousedown moved focus to the button: the box blurred, change
// fired, saveScore wrote, the stub (like the vendored SDK) raised 'value'
// synchronously, renderHoleView rebuilt the nav row - and the button under the
// finger was destroyed before mouseup, so NO CLICK fired and the modal did not
// open. The first tap did nothing; the second opened it.
//
// THE FIX, the same one: onmousedown="event.preventDefault()" on the button
// so the box keeps focus through the tap, and openFinishRoundModal() calls
// commitPendingScore() first, inside the click - the score is saved and the
// modal then reads a round that already holds it (the missing-score count it
// prints is one fewer than before the tap).
//
// WHY CHROME. mini-dom has no focus model, no mousedown-moves-focus and no
// layout; the defect is a browser behaviour. Every measurement is a cold
// arrival on index.html through tools/lib/cold-arrival.js at 390x844 - taps
// and keys by CDP, the round through the data stub, no page function invoked.
// The stub re-fires the round's value listener synchronously on set()
// (helpers/refire-stub.js), which is what destroys the button.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { REFIRE } = require('./helpers/refire-stub.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CD = makeCourseData(18);
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
function round(scoresFn) {
    const P = makePlayers(NAMES, [2, 9, 15, 4, 20, 7, 11, 0], 101);
    const scores = {};
    P.forEach(p => CD.forEach(h => { const v = scoresFn(p, h); if (v) scores['p' + p.id + '_h' + h.hole] = v; }));
    return { eventName: 'Finish', courseName: 'Test', players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores, settlementMode: 'whole-dollar',
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } } };
}
// Only hole 18 open: the arrival lands there, and its nav ends in Finish.
const DB = { events: { FIN17: round((p, h) => h.hole < 18 ? h.par : 0) }, global_courses: {}, trips: {}, tournaments: {} };

const PRE = 'window.__STUBDB = ' + JSON.stringify(DB) + ';' + REFIRE + `
(function(){ window.__ui = []; ['mousedown','click'].forEach(function(k){ document.addEventListener(k, function(e){ var b = e.target && e.target.closest && e.target.closest('button'); if (b) window.__ui.push(k + '[' + b.innerText.trim().replace(/^[^A-Za-z]+/, '').slice(0, 6) + ']'); }, true); }); })();`;

const STATE = `(function(){ var a = document.activeElement; var card = document.getElementById('hole-view-card'); var boxes = card ? card.querySelectorAll('.score-input') : [];
  var id = (a && a.classList && a.classList.contains('score-input')) ? 'p' + a.getAttribute('data-player-id') + '/h' + a.getAttribute('data-hole') : (a === document.body ? 'BODY' : a.tagName);
  var nav = document.querySelector('.hole-view-nav-row'); var btns = nav ? Array.from(nav.querySelectorAll('button')).map(function (b) { return b.innerText.trim(); }) : [];
  var ov = document.getElementById('finish-round-modal-overlay'); var warn = document.getElementById('fr-incomplete-warning');
  return JSON.stringify({ hole: (document.querySelector('.hv-hole-num') || {}).innerText, boxes: boxes.length, active: id, activeValue: a && a.value !== undefined ? a.value : null, nav: btns,
    finishOpen: getComputedStyle(ov).display, missing: (getComputedStyle(ov).display === 'flex' && warn) ? warn.innerText.replace(/\\s+/g, ' ').trim().slice(0, 40) : null,
    cardValue: (document.querySelector('#full-card-container .score-input[data-player-id="104"][data-hole="18"]') || {}).value,
    ui: window.__ui.splice(0), ev: (window.__ev || []).splice(0) }); })()`;
const rect = (sel, n) => `(function(){ var el = document.querySelectorAll(${JSON.stringify(sel)})[${n || 0}]; if (!el) return 'null'; var r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); })()`;
const tap = (p) => [{ cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 } } },
                    { cdp: { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 } } }];
const key = (k) => [{ cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: k, code: 'Digit' + k, text: k } } }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code: 'Digit' + k } } }];
// "Scrolled to the fourth golfer", the nav row brought to the bottom edge if
// it fell below the fold - what a thumb does before tapping Finish.
const SCROLL_TO_4TH = "document.querySelectorAll('#hole-view-card .score-input')[3].scrollIntoView({ block: 'center' }); var n = document.querySelector('.hole-view-nav-row'); if (n.getBoundingClientRect().bottom > window.innerHeight) n.scrollIntoView({ block: 'end' }); window.__ui = []; window.__ev = []; 'scrolled'";
async function arrive(q, steps) { return arriveCold({ url: fileUrl('index.html', q), db: DB, settleMs: 4000, preScript: PRE, steps }); }
const P = (r, i) => JSON.parse(r.value[i]);

const S = {};
before(async () => {
    // GEOMETRY: the 4th box and the Finish button after the scroll.
    const g = await arrive('game=FIN17&group=1', [{ expression: SCROLL_TO_4TH }, { expression: rect('#hole-view-card .score-input', 3) }, { expression: rect('.hole-view-nav-row button', 2) }, { expression: STATE }]);
    assert.ok(g.ok, 'Chrome did not run: ' + g.reason);
    S.geometry = g; S.box4 = P(g, 1); S.finish = P(g, 2);
    // 1. THE DEFECT'S SHAPE: a lone "1" in the 4th box, still focused, then ONE tap on Finish.
    S.pending = await arrive('game=FIN17&group=1', [{ expression: SCROLL_TO_4TH }, ...tap(S.box4), ...key('1'), { sleep: 50 }, { expression: STATE }, ...tap(S.finish), { sleep: 100 }, { expression: STATE }]);
    // 2. NOTHING PENDING: a plain tap on Finish still opens the modal, and saves nothing.
    S.plain = await arrive('game=FIN17&group=1', [{ expression: SCROLL_TO_4TH }, { expression: STATE }, ...tap(S.finish), { sleep: 100 }, { expression: STATE }]);
});

describe('THE SHAPE', () => {
    test('ran', () => assert.ok(S.geometry && S.geometry.ok, S.geometry && S.geometry.reason));
    test('arrival lands on 18, four boxes on the group link, the nav ends in Finish; the Finish button sits on screen', () => {
        const s = P(S.geometry, 3);
        assert.equal(s.hole, 'Hole 18'); assert.equal(s.boxes, 4); assert.equal(s.nav.length, 3); assert.match(s.nav[2], /Finish/);
        assert.ok(S.finish.y > 0 && S.finish.y < 844 && S.box4.y > 0 && S.box4.y < 844, JSON.stringify([S.box4, S.finish]));
    });
});

describe('FIX 3: a score still focused when Finish Round is tapped', () => {
    test('ran', () => assert.ok(S.pending && S.pending.ok, S.pending && S.pending.reason));
    test('before the tap: "1" sits in the 4th box, focused, unsaved; the modal is closed', () => {
        const b = P(S.pending, 6);
        assert.equal(b.active, 'p104/h18'); assert.equal(b.activeValue, '1'); assert.equal(b.finishOpen, 'none');
        assert.ok(!/change\(Dee/.test(b.ev.join(' > ')), 'nothing saved yet: ' + b.ev.join(' > '));
    });
    test('ONE tap opens the modal: mousedown AND click reached the button', () => {
        const s = P(S.pending, 10);
        assert.equal(s.finishOpen, 'flex', 'the Finish Round modal is open after one tap');
        assert.deepEqual(s.ui, ['mousedown[Finish]', 'click[Finish]']);
    });
    test('and the score was committed inside the click, BEFORE the modal read the round: change -> value -> render, the card holds the 1, and the modal counts 7 missing, not 8', () => {
        const s = P(S.pending, 10);
        const ev = s.ev.join(' > ');
        assert.ok(/change\(Dee/.test(ev) && /value->render/.test(ev), ev);
        assert.equal(s.cardValue, '1', 'Dee\'s hole 18 on the full card');
        assert.match(s.missing, /^⚠️ 7 scores still missing/, 'eight golfers had hole 18 open; Dee\'s 1 landed before the modal counted: ' + s.missing);
        assert.equal(s.active, 'BODY', 'the box blurred (its commit), nothing refocused');
    });
});

describe('NOTHING PENDING', () => {
    test('ran', () => assert.ok(S.plain && S.plain.ok, S.plain && S.plain.reason));
    test('a plain tap on Finish opens the modal with 8 missing, saves nothing, and both events reach the button', () => {
        const b = P(S.plain, 1); assert.equal(b.active, 'BODY'); assert.equal(b.finishOpen, 'none');
        const s = P(S.plain, 5);
        assert.equal(s.finishOpen, 'flex');
        assert.deepEqual(s.ui, ['mousedown[Finish]', 'click[Finish]']);
        assert.ok(!/change\(|value->render/.test(s.ev.join(' > ')), 'no save, no re-render: ' + s.ev.join(' > '));
        assert.match(s.missing, /^⚠️ 8 scores still missing/);
    });
});

describe('THE SEAM (source)', () => {
    const fn = (name) => { const at = IDX.indexOf('function ' + name + '('); assert.ok(at > 0, name); return IDX.slice(at, IDX.indexOf('\n    function ', at + 30)); };
    test('the Finish button carries the nav buttons\' mousedown guard, and its handler is still openFinishRoundModal', () => {
        assert.match(IDX, /<button class="finish-round-nav-btn" onmousedown="event\.preventDefault\(\)" onclick="openFinishRoundModal\(\)">/);
        assert.equal((IDX.match(/onmousedown="event\.preventDefault\(\)"/g) || []).length, 5, 'Prev, Next, the position button, the picker\'s buttons, and now Finish');
    });
    test('openFinishRoundModal commits the pending score FIRST - before frStaged is cleared and before anything reads the round', () => {
        const f = fn('openFinishRoundModal').replace(/^\s*\/\/.*$/gm, '');
        const commit = f.indexOf('commitPendingScore();');
        assert.ok(commit > 0, 'commitPendingScore is called');
        assert.ok(commit < f.indexOf('frStaged = {};'), 'before the staged corrections are cleared');
        assert.ok(commit < f.indexOf('currentData.scores'), 'before the scores are read');
        assert.equal((f.match(/commitPendingScore\(\);/g) || []).length, 1, 'once');
        // The commit is a blur, nothing more: saveScore and the listener are untouched.
        assert.ok(!/saveScore\(/.test(f + fn('commitPendingScore')));
        assert.match(fn('commitPendingScore'), /a\.blur\(\);/);
    });
});
