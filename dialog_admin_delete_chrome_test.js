// ============================================================================
// admin.html's DELETE ROUND, DRIVEN IN REAL CHROME, BOTH ANSWERS
//
// The wizard's copy of the most destructive control in the app. index.html got
// this treatment in Wave 2; this is the same proof on the other surface, and the
// two are not interchangeable - a page's own inline <script> parses AFTER its
// external ones, so each page's function is its own and only the page under test
// proves the page under test.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Arriving at admin.html?game=CODE lands on
// wizard step 7 with "🗑️ Delete this round" already on screen (measured: step 7
// shown, the other six hidden), so the control is reached the way an organizer
// reaches it and every tap below is a real tap at an element's centre.
//
// WHAT A REAL BROWSER PROVES THAT A REALM CANNOT:
//   · the sheet actually appears, at a phone size, and is tappable
//   · CANCEL holds the focus - document.activeElement, not a source scan
//   · Cancel is FIRST in the DOM, so the destructive button is not the one under
//     the thumb where the previous button was
//   · a real tap on Cancel leaves the round alone; a real tap on Delete it
//     completes and leaves the round behind
//   · no native dialog opens anywhere on the path. cold-arrival fails the run by
//     name if one does (UI Wave 1), so this is proved by the run succeeding.
//
// WHY THE YES ARM ASSERTS THE NAVIGATION AND NOT THE WRITE. On success the page
// sets window.location.href = 'admin.html' INSIDE the .then of a resolved
// remove(). Measured in Wave 2 on index.html: 30ms after the tap the document is
// already the new page and window.__coldWrites is a fresh empty array, so an
// earlier version of that test reported "the round was not deleted" about a round
// that had been deleted. Landing back on the bare lobby URL is only reachable
// through that .then. WHICH path is removed - events/<code> exactly - and both
// failure arms are proved in wizard_delete_round_test.js, in a realm that does
// not navigate. Chrome proves the tap gets there; the realm proves what it does.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const CODE = 'ADEL1';

// AN UNSCORED ROUND. admin.html checks the scores it already holds BEFORE asking
// anything (that check is what wizard_delete_round_test.js was written for), so a
// scored round never reaches the sheet and could not be used here.
function round() {
    return {
        eventName: 'Delete Me', courseName: 'Test Links', activeCourseKey: 'comm_links',
        gameFormat: 'stroke', courseData: CD, scores: {}, settlementMode: 'whole-dollar',
        players: makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie'], [2, 9, 15], 101)
    };
}
const DB = {
    events: { [CODE]: round() },
    global_courses: { comm_links: { name: 'Test Links', data: CD } },
    trips: {}, tournaments: {}
};

// Records a native dialog from the page's side as well. cold-arrival fails the
// run on one, but a count in the captured value makes the cause legible instead
// of leaving a bare reason string to interpret.
const PRE = `(function () {
    window.__nativeDialog = 0;
    ['alert', 'confirm', 'prompt'].forEach(function (k) {
        window[k] = function () { window.__nativeDialog++; };
    });
})();`;

const STATE = `(function () {
    var sheet = document.getElementById('ui-sheet');
    var open = !!(sheet && sheet.classList && sheet.classList.contains('open'));
    var a = document.activeElement;
    var yes = document.getElementById('ui-sheet-yes');
    var no = document.getElementById('ui-sheet-no');
    var card = sheet ? sheet.querySelector('.ui-sheet-card') : null;
    return JSON.stringify({
        sheetOpen: open,
        // innerText, never textContent: this page keeps its whole application in
        // one inline <script>, and textContent would happily match the source.
        title: open ? ((sheet.querySelector('.ui-sheet-title') || {}).innerText || '') : '',
        body: open ? ((sheet.querySelector('.ui-sheet-body') || {}).innerText || '') : '',
        focused: a ? (a.id || a.tagName) : null,
        yesText: yes ? yes.innerText.trim() : null,
        noText: no ? no.innerText.trim() : null,
        // Which button sits FIRST in the DOM - the one a thumb lands on.
        firstButton: (function () {
            var b = sheet ? sheet.querySelectorAll('button') : [];
            return b.length ? b[0].id : null;
        })(),
        // And that it is really on screen, not merely in the document.
        cardOnScreen: !!(card && card.getBoundingClientRect
                         && card.getBoundingClientRect().width > 200
                         && card.getBoundingClientRect().height > 60),
        removed: (window.__coldWrites || []).filter(function (w) { return w.op === 'remove'; })
                    .map(function (w) { return w.path; }),
        nativeDialogs: window.__nativeDialog,
        url: document.URL.replace(/^.*\\//, '')
    });
})()`;

describe('admin.html DELETE ROUND in real Chrome — the sheet, the focus, both answers', () => {

    test('the control is reached by ARRIVING, not by calling anything', { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', 'game=' + CODE),
            db: DB, settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE,
            steps: [{ expression: `(function () {
                var b = document.querySelector('.end-round-btn');
                var step7 = document.getElementById('wizard-step-7');
                return JSON.stringify({
                    onStep7: !!(step7 && step7.offsetParent !== null),
                    deleteVisible: !!(b && b.offsetParent !== null),
                    label: b ? b.innerText.trim() : null,
                    code: typeof currentMode !== 'undefined' ? currentMode : null,
                    scoresHeld: Object.keys((typeof loadedScores !== 'undefined' && loadedScores) || {}).length
                });
            })()` }]
        });
        assert.equal(r.ok, true, r.reason);
        const s = JSON.parse(r.value.find(v => typeof v === 'string' && v.charAt(0) === '{'));
        assert.equal(s.onStep7, true, 'arriving with ?game= did not land on step 7');
        assert.equal(s.deleteVisible, true, 'the delete control is not on screen');
        assert.equal(s.code, CODE, 'the page is not holding the round it was sent to');
        assert.equal(s.scoresHeld, 0, 'the fixture must be unscored or the sheet never opens');
    });

    test('CANCEL: the sheet opens, Cancel is focused and first, and the round survives',
        { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', 'game=' + CODE),
            db: DB, settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE,
            steps: [
                { tap: '.end-round-btn' },
                { sleep: 400 },
                { expression: STATE },
                { tap: '#ui-sheet-no' },
                { sleep: 400 },
                { expression: STATE }
            ]
        });
        assert.equal(r.ok, true, r.reason);
        const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
        assert.equal(objs.length, 2, JSON.stringify(r.value));
        const [open, after] = objs;

        assert.equal(open.sheetOpen, true, 'tapping delete did not open the sheet');
        assert.equal(open.cardOnScreen, true, 'the sheet is in the document but not on screen');
        assert.match(open.title, /Delete round ADEL1 for everyone\?/);
        assert.match(open.body, /all 3 golfers/, 'the question must name the cost: ' + open.body);
        assert.match(open.body, /cannot be undone/);
        assert.equal(open.nativeDialogs, 0, 'a native dialog was opened');

        // THE DESTRUCTIVE BUTTON IS NOT THE ONE UNDER THE THUMB.
        assert.equal(open.firstButton, 'ui-sheet-no',
            'the destructive button is first in the sheet');
        assert.equal(open.focused, 'ui-sheet-no',
            'Cancel must hold the focus, not Delete - got ' + open.focused);
        assert.equal(open.yesText, 'Delete it');
        assert.equal(open.noText, 'Keep the round');

        // CANCEL LEAVES THE ROUND ALONE.
        assert.equal(after.sheetOpen, false, 'the sheet stayed open after Cancel');
        assert.deepEqual(after.removed, [], 'the round was deleted after Cancel');
        assert.match(after.url, /^admin\.html\?game=ADEL1/, 'Cancel navigated away: ' + after.url);
    });

    test('DELETE IT: a real tap on the destructive button completes and leaves the round',
        { timeout: 90000 }, async () => {
        // The other half. Without it the test above is satisfied by a sheet whose
        // buttons do nothing at all.
        const r = await arriveCold({
            url: fileUrl('admin.html', 'game=' + CODE),
            db: DB, settleMs: 2500, viewport: { width: 390, height: 844 }, preScript: PRE,
            steps: [
                { tap: '.end-round-btn' },
                { sleep: 400 },
                { expression: STATE },
                { tap: '#ui-sheet-yes' },
                { sleep: 1200 },
                { expression: `(function () { return JSON.stringify({
                    url: document.URL.replace(/^.*\\//, ''),
                    stillOnTheRound: /game=/.test(document.URL),
                    sheetOpen: !!(document.getElementById('ui-sheet')
                                  && document.getElementById('ui-sheet').classList.contains('open')),
                    nativeDialogs: window.__nativeDialog
                }); })()` }
            ]
        });
        assert.equal(r.ok, true, r.reason);
        const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
        assert.equal(objs.length, 2, JSON.stringify(r.value));
        const [open, landed] = objs;
        assert.equal(open.sheetOpen, true, 'the sheet did not open');
        assert.equal(open.nativeDialogs, 0, 'a native dialog was opened');
        // The success arm navigates to the bare lobby URL, dropping ?game=. That
        // line lives inside the resolved remove()'s .then and is unreachable
        // otherwise.
        assert.equal(landed.stillOnTheRound, false,
            'tapping Delete it did not complete the deletion - still on ' + landed.url);
        assert.match(landed.url, /^admin\.html/, 'it left the app entirely: ' + landed.url);
        assert.equal(landed.sheetOpen, false, 'the sheet survived the navigation');
    });
});
