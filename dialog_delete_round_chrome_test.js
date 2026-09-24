// ============================================================================
// DELETE ROUND, DRIVEN IN REAL CHROME, BOTH ANSWERS
//
// This is the most destructive control in the app: it erases every score for
// everyone, and every bet, press and side match with them. Until UI Wave 1 it
// could not be driven in a browser check AT ALL - confirm() blocks the renderer,
// so a check that reached it sat there until the 30-second CDP timeout and
// reported "CDP timeout on Runtime.evaluate", which says nothing about a dialog.
// That is why cold-arrival now handles Page.javascriptDialogOpening, and it is
// why this file can exist.
//
// WHAT A REAL BROWSER PROVES THAT THE REALM CANNOT:
//   · the sheet actually appears on screen, at a phone size, and is tappable
//   · CANCEL is the focused control - document.activeElement, not a source scan
//   · a real tap on Cancel leaves the round alone, and a real tap on Delete
//     removes it
//   · no native dialog opens anywhere on the path (cold-arrival fails the run
//     if one does, so this is asserted by the run succeeding at all)
//
// BOTH ANSWERS, because "Cancel deletes nothing" is satisfied by a button that
// does nothing at all, and "Delete removes it" is satisfied by one that never
// asked.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
// AN UNSCORED ROUND. A round with scores is refused by the rules, so it would
// never reach the sheet - and this check is about the question, not the refusal.
function round() {
    const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [2, 9, 15, 4], 101);
    return { eventName: 'Delete Me', courseName: 'Test', players: P, gameFormat: 'stroke',
             courseData: CD, scores: {}, settlementMode: 'whole-dollar' };
}
const DB = { events: { DELE1: round() }, global_courses: {}, trips: {}, tournaments: {} };

// The delete button lives behind the organizer view (no ?group= in the URL) and
// inside the Finish Round area, so the round is opened and the control rendered
// the way the page itself renders it.
const PRE = 'window.__STUBDB = ' + JSON.stringify(DB) + ';' + `
(function () {
    window.__removed = [];
    window.__nativeDialog = 0;
    // Record a native dialog from the page's side too. cold-arrival fails the run
    // on one, but this makes the cause legible in the captured value as well.
    ['alert', 'confirm', 'prompt'].forEach(function (k) {
        var orig = window[k];
        window[k] = function () { window.__nativeDialog++; return orig ? undefined : undefined; };
    });
})();`;

// What the screen says, read after each step.
const STATE = `(function () {
    var sheet = document.getElementById('ui-sheet');
    var open = !!(sheet && sheet.classList && sheet.classList.contains('open'));
    var a = document.activeElement;
    var yes = document.getElementById('ui-sheet-yes');
    var no = document.getElementById('ui-sheet-no');
    return JSON.stringify({
        sheetOpen: open,
        title: open ? (sheet.querySelector('.ui-sheet-title') || {}).innerText : '',
        focused: a ? (a.id || a.tagName) : null,
        yesText: yes ? yes.innerText.trim() : null,
        noText: no ? no.innerText.trim() : null,
        // Which button sits first in the DOM - the one a thumb lands on.
        firstButton: (function () {
            var b = sheet ? sheet.querySelectorAll('button') : [];
            return b.length ? b[0].id : null;
        })(),
        removed: (window.__coldWrites || []).filter(function (w) { return w.op === 'remove'; })
                    .map(function (w) { return w.path; }),
        nativeDialogs: window.__nativeDialog,
        url: document.URL.replace(/^.*\\//, '')
    });
})()`;

describe('DELETE ROUND in real Chrome — the sheet, the focus, and both answers', () => {

    test('CANCEL: the sheet opens, Cancel is focused, and the round survives',
        { timeout: 90000 }, async () => {
        const r = await arriveCold({
            url: fileUrl('index.html', 'game=DELE1'),
            db: DB,
            settleMs: 2500,
            viewport: { width: 390, height: 844 },
            preScript: PRE,
            steps: [
                { expression: `(function(){ var m = document.getElementById('end-round-mount');
                    if (m) m.scrollIntoView(); return JSON.stringify({ stage: 'before',
                    mount: !!m, button: !!(m && m.querySelector('button')) }); })()` },
                { tap: '#end-round-mount button' },
                { sleep: 400 },
                { expression: STATE },
                { tap: '#ui-sheet-no' },
                { sleep: 400 },
                { expression: STATE }
            ]
        });
        // A native dialog anywhere on this path fails the run by name - that is
        // the cold-arrival change from Wave 1 doing its job.
        assert.equal(r.ok, true, r.reason);
        const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
        assert.equal(objs.length, 3, JSON.stringify(r.value));
        const [before, open, after] = objs;

        assert.equal(before.mount, true, 'the delete control did not render');
        assert.equal(before.button, true, 'the delete button did not render');

        // THE SHEET IS REALLY ON SCREEN.
        assert.equal(open.sheetOpen, true, 'tapping delete did not open the sheet');
        assert.match(open.title, /Delete round DELE1 for everyone\?/);
        assert.equal(open.yesText, 'Delete it');
        assert.equal(open.noText, 'Keep the round');
        assert.equal(open.nativeDialogs, 0, 'a native dialog was opened');

        // AND THE DESTRUCTIVE BUTTON IS NOT THE ONE UNDER THE THUMB.
        assert.equal(open.firstButton, 'ui-sheet-no',
            'the destructive button is first in the sheet');
        assert.equal(open.focused, 'ui-sheet-no',
            'Cancel must hold the focus, not Delete - got ' + open.focused);

        // CANCEL LEAVES THE ROUND ALONE.
        assert.equal(after.sheetOpen, false, 'the sheet stayed open after Cancel');
        assert.deepEqual(after.removed, [], 'the round was deleted after Cancel');
        assert.match(after.url, /^index\.html/, 'Cancel navigated away');
    });

    test('DELETE IT: a real tap on the destructive button deletes and leaves',
        { timeout: 90000 }, async () => {
        // The other half. Without it, the test above is satisfied by a sheet whose
        // buttons do nothing at all.
        //
        // WHAT IS ASSERTED HERE, AND WHY IT IS THE NAVIGATION RATHER THAN THE WRITE.
        // On success the page sets window.location.href = 'admin.html' INSIDE the
        // .then of a resolved remove(). Measured: 30ms after the tap the document
        // is already admin.html and window.__coldWrites is a fresh, empty array on
        // the new page - so the write genuinely cannot be read from here, and an
        // earlier version of this test reported "the round was not deleted" about a
        // round that had been deleted. Landing on admin.html is only reachable
        // through that .then, so it is proof the removal resolved.
        //
        // WHICH PATH is removed - events/<code> exactly - is proven in
        // dialog_index_test.js, in a realm that does not navigate. Chrome proves
        // the tap reaches it; the realm proves what it does.
        const r = await arriveCold({
            url: fileUrl('index.html', 'game=DELE1'),
            db: DB,
            settleMs: 2500,
            viewport: { width: 390, height: 844 },
            preScript: PRE,
            steps: [
                { tap: '#end-round-mount button' },
                { sleep: 400 },
                { expression: STATE },
                { tap: '#ui-sheet-yes' },
                { sleep: 900 },
                { expression: `(function () { return JSON.stringify({
                    url: document.URL.replace(/^.*\\//, ''),
                    sheetOpen: !!(document.getElementById('ui-sheet')
                                  && document.getElementById('ui-sheet').classList.contains('open'))
                }); })()` }
            ]
        });
        assert.equal(r.ok, true, r.reason);
        const objs = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(JSON.parse);
        assert.equal(objs.length, 2, JSON.stringify(r.value));
        const [open, landed] = objs;
        assert.equal(open.sheetOpen, true, 'the sheet did not open');
        assert.equal(open.nativeDialogs, 0, 'a native dialog was opened');
        assert.match(landed.url, /^admin\.html/,
            'tapping Delete it did not complete the deletion - still on ' + landed.url);
        assert.equal(landed.sheetOpen, false, 'the sheet survived the navigation');
    });
});
