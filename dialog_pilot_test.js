// ============================================================================
// UI WAVE 1 — THE PILOT (sidematches.html) AND THE SHARED COMPONENT
//
// The money and message-KIND assertions for the press flow live in
// press_ux_flow_test.js, beside the coverage that already owned that flow. The
// missing-await scan lives in dialog_await_guard_test.js. This file holds the
// two things neither of those covers:
//
//   1. ui-dialogs.js itself — the contracts the pages depend on. uiAmount must
//      never resolve to NaN, a refusal and a failure must be persistent, and a
//      toast must actually remove itself and dwell longer for more lines.
//   2. The pilot page's shape — that it uses the component, that the ONE native
//      dialog left in it is the deliberate one, and that the shared file is
//      loaded rather than a fourth copy of the CSS being pasted in.
//
// AND the cold-arrival dialog handler, because a harness change that nobody
// exercises is a harness change nobody can trust.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function ui() {
    // The component in a realm of its own, with the DOM the harness provides.
    return loadJsFile('ui-dialogs.js', ['text-safe.js']);
}

describe('ui-dialogs.js — the contracts the pages depend on', () => {

    test('it exports the five, and attaches them as plain globals like the other shared files', () => {
        const sb = ui();
        ['uiRefuse', 'uiFail', 'uiToast', 'uiConfirm', 'uiAmount'].forEach(k =>
            assert.equal(typeof sb[k], 'function', k + ' is missing'));
        // Same shape as aloha-bet.js and handicap.js: globals, no module system.
        assert.match(read('ui-dialogs.js'), /Object\.keys\(api\)\.forEach\(function \(k\) \{ root\[k\] = api\[k\]; \}\)/);
    });

    test('uiAmount NEVER resolves to NaN — that is its whole reason for existing', async () => {
        // Number(Promise) is NaN, and a press created with a NaN stake is a bet
        // nobody can settle. prompt() could hand back "abc"; this cannot.
        const sb = ui();
        const answer = (typed) => {
            const p = sb.uiAmount({ title: 'Press amount', value: '' });
            vm.runInContext(
                "document.getElementById('ui-amount-input').value = " + JSON.stringify(typed) + ";"
                + "document.getElementById('ui-amount-ok').onclick();", sb);
            return p;
        };
        assert.equal(await answer('78'), 78, 'a plain number');
        assert.equal(await answer('12.50'), 12.5, 'a decimal survives');
        assert.equal(await answer('abc'), null, 'garbage must be null, never NaN');
        assert.equal(await answer(''), null, 'empty is a cancel, not a zero');
        assert.equal(await answer('0'), 0, 'zero is a real answer - the CALLER refuses it');
        // The distinction that matters: null is "changed my mind", 0 is "typed 0".
        assert.notEqual(await answer('0'), null);
    });

    test('uiAmount Cancel is null, and null is not zero', async () => {
        const sb = ui();
        const p = sb.uiAmount({ title: 'Press amount', value: '50' });
        vm.runInContext("document.getElementById('ui-amount-cancel').onclick();", sb);
        assert.equal(await p, null);
    });

    test('uiConfirm resolves true only on the confirm button', async () => {
        const sb = ui();
        let p = sb.uiConfirm({ title: 'Remove?' });
        vm.runInContext("document.getElementById('ui-sheet-yes').onclick();", sb);
        assert.equal(await p, true);
        p = sb.uiConfirm({ title: 'Remove?' });
        vm.runInContext("document.getElementById('ui-sheet-no').onclick();", sb);
        assert.equal(await p, false);
    });

    test('the destructive button is NOT the one under the thumb', () => {
        // Cancel is rendered first and is the one focused. Nobody deletes a round
        // by double-tapping where the previous button was.
        const src = read('ui-dialogs.js');
        const body = src.slice(src.indexOf('function uiConfirm'), src.indexOf('function uiAmount'));
        assert.ok(body.indexOf('ui-sheet-no') < body.indexOf('ui-sheet-yes'),
            'the confirm button must not come first in the markup');
        assert.match(body, /if \(no && no\.focus\)/, 'Cancel takes the focus');
        assert.ok(!/yes\.focus\(\)/.test(body), 'the destructive button must never be focused');
    });

    test('A TOAST SELF-DISMISSES; A NOTE DOES NOT. That split is the wave.', () => {
        const sb = ui();
        // A refusal and a failure stay in the document.
        sb.uiRefuse('nope');
        assert.equal(vm.runInContext("document.querySelectorAll('.ui-note').length", sb), 1);
        sb.uiFail('write failed');
        assert.equal(vm.runInContext("document.querySelectorAll('.ui-note').length", sb), 1,
            'one note at a time - two stale warnings is worse than one');
        assert.equal(vm.runInContext("document.querySelectorAll('.ui-note-fail').length", sb), 1);
        // A failure is role=alert, not role=status: it must interrupt.
        const src = read('ui-dialogs.js');
        assert.match(src, /kind === 'fail' \? 'alert' : 'status'/);
        // And no setTimeout anywhere near the note path.
        const notePath = src.slice(src.indexOf('function placeNote'), src.indexOf('// ---- IT WORKED'));
        assert.ok(!/setTimeout/.test(notePath),
            'a note must never be on a timer - a missed failure is a press that does not exist');
    });

    test('the toast dwell scales with the lines, because a press receipt is four', () => {
        const sb = ui();
        const one = sb.uiDwellFor('Link copied');
        const four = sb.uiDwellFor('PRESS CONFIRMED\nAnn vs Ben\n$20\nStarts Hole 7');
        assert.ok(four > one, 'four lines must dwell longer than one');
        assert.ok(one >= 2500, 'even one line needs a readable dwell, got ' + one);
        assert.ok(four >= 5000, 'a four-line money receipt needs time, got ' + four);
        assert.ok(four <= 9000, 'but it is a toast, not a modal');
    });

    test('the toast DOES remove itself — measured, not assumed', async () => {
        const sb = ui();
        // The dwell is passed explicitly rather than stubbed: overriding the
        // exported uiDwellFor did NOTHING, because uiToast calls the module's own
        // internal dwellFor - so the first version of this test waited 40ms for a
        // 2600ms toast and failed while the component was correct.
        // ASSERTED ON THE ELEMENT, NOT A SELECTOR. A toast lives inside the toast
        // wrapper, so it is a grandchild of <body>, and mini-dom's querySelectorAll
        // does not descend that far - it reported 0 for a toast that was really
        // there, which is the harness lying rather than the component failing. The
        // component hands back the node; that is what to hold.
        const el = sb.uiToast('done', 20);
        assert.ok(el, 'uiToast returned nothing');
        assert.ok(el.parentNode, 'the toast was never attached');
        await new Promise(r => setTimeout(r, 60));
        assert.equal(el.parentNode, null, 'the toast never went away');
    });
});

describe('the pilot page: sidematches.html', () => {

    test('it loads the shared file and did NOT paste a fourth copy of the CSS', () => {
        const s = read('sidematches.html');
        assert.match(s, /<script src="ui-dialogs\.js"><\/script>/);
        assert.ok(!/\.ui-note\s*\{/.test(s), 'the component CSS was copied into the page');
        assert.ok(!/\.ui-sheet\s*\{/.test(s), 'the component CSS was copied into the page');
        // And the component brings its own, so the six pages with no modal CSS
        // get it by loading one script.
        assert.match(read('ui-dialogs.js'), /function ensureStyle\(\)/);
    });

    test('no bare alert() is left on the page', () => {
        const code = read('sidematches.html')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const hits = (code.match(/(?<![\w.$])alert\s*\(/g) || []);
        assert.deepEqual(hits, [], 'sidematches.html still calls alert()');
    });

    test('THE ONE NATIVE DIALOG LEFT IS THE DELIBERATE ONE, and still explained', () => {
        // The clipboard FALLBACK. It runs only when the clipboard API has already
        // failed, its job is to put selectable text in front of someone, and its
        // return value is discarded so it decides nothing. Held positively so it
        // reads as kept rather than missed - and so that deleting it has to be a
        // decision.
        const s = read('sidematches.html');
        const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const natives = (code.match(/(?<![\w.$])(confirm|prompt)\s*\(/g) || []);
        assert.deepEqual(natives, ['prompt('], 'expected exactly one native dialog left: ' + natives);
        assert.match(code, /\.catch\(\(\) => prompt\('Copy this link:', url\)\)/);
        assert.match(s, /THE ONE NATIVE DIALOG LEFT IN THIS PAGE, AND IT IS DELIBERATE/,
            'the reason it stays must stay written down');
    });

    test('the three converted decision sites are async AND awaited', () => {
        // The await is scanned repo-wide by dialog_await_guard_test.js; this pins
        // that the enclosing functions actually became async, which is the other
        // half - `await` in a non-async function is a syntax error, so a missing
        // `async` would break the page at parse rather than at the tap.
        const s = read('sidematches.html');
        ['pressSideMatch', 'pressSideMatchOverall', 'rcRemove'].forEach(fn => {
            assert.match(s, new RegExp('async function ' + fn + '\\s*\\('),
                fn + ' must be async');
        });
        // and the page still parses, which a stray await would prevent
        const sb = loadHtmlInlineScript('sidematches.html');
        ['pressSideMatch', 'pressSideMatchOverall', 'rcRemove'].forEach(fn =>
            assert.equal(vm.runInContext('typeof ' + fn, sb), 'function', fn + ' did not survive parse'));
    });
});

describe('THE DESTRUCTIVE PATH: Remove Ryder Cup asks, and takes no for an answer', () => {
    // WRITTEN BECAUSE A CONTROL WAS INERT. Dropping the await at rcRemove went red
    // in dialog_await_guard_test.js's source scan and NOWHERE ELSE - nothing
    // exercised the destructive path, so the only thing standing between a missed
    // await and a Cup removed without being asked was a regex. That is exactly the
    // "defence in depth that never fires" shape, one level up. Now it fires here
    // too, behaviourally.
    function boot(answer) {
        const sb = loadHtmlInlineScript('sidematches.html',
            ['action-model.js', 'match-engine.js', 'money-engine.js', 'settlement-engine.js']);
        vm.runInContext(`
            window.__removed = [];
            uiConfirm = () => Promise.resolve(${JSON.stringify(answer)});
            uiRefuse = () => {}; uiFail = () => {}; uiToast = () => {};
            db.ref = function (p) { return {
                remove: function () { window.__removed.push(p); return Promise.resolve(); },
                set: function () { return Promise.resolve(); },
                update: function () { return Promise.resolve(); },
                once: function () { return Promise.resolve({ val: function () { return null; } }); },
                on: function () {}, push: function () { return { key: 'k' }; }
            }; };
            currentMode = 'ABCD';
            currentData = { players: [], courseData: [], scores: {}, ryderCup: { matches: {} } };
            isOrganizerView = () => true;
            canRemoveRyderCup = () => ({ ok: true });
            rcShowProblems = () => {};
        `, sb);
        return sb;
    }
    // A real delay, not setImmediate: rcRemove chains .then(...).then(...), and
    // two microtask turns are not enough to reach the pointer cleanup.
    const settle = () => new Promise(r => setTimeout(r, 40));

    test('answering NO removes nothing', async () => {
        const sb = boot(false);
        vm.runInContext('rcRemove();', sb);
        await settle();
        // READ AS JSON, not as the sandbox's array. deepStrictEqual compares
        // prototypes, and a vm-realm Array is not this realm's Array - it fails
        // with "[] !== []", which the repo has been caught by before.
        assert.equal(vm.runInContext('JSON.stringify(window.__removed)', sb), '[]',
            'the Cup was removed after the golfer said no');
    });

    test('answering YES removes the Cup', async () => {
        // The other half. Without it, "removes nothing" would be satisfied by a
        // function that never removes anything at all.
        const sb = boot(true);
        vm.runInContext('rcRemove();', sb);
        await settle();
        // BOTH, and the second one matters: rcRemove also clears the round's
        // pointer, because "a pointer to a Cup that no longer exists is worse than
        // none" - the round would report a Cup it can never read, on every load.
        // My first version expected only the Cup and was simply wrong about the
        // code.
        assert.equal(vm.runInContext('JSON.stringify(window.__removed)', sb),
            JSON.stringify(['events/ABCD/ryderCup', 'events/ABCD/ryderCupRef']));
    });
});

describe('cold-arrival treats a native dialog as a failure, not a pause', () => {
    test('the handler is installed, dismisses with cancel, and fails the run by name', () => {
        // Behaviour in Chrome is proved by the pilot page no longer opening one at
        // all; this pins the harness change itself, because a harness change nobody
        // exercises is one nobody can trust.
        const src = read('tools/lib/cold-arrival.js');
        assert.match(src, /Page\.javascriptDialogOpening/);
        assert.match(src, /Page\.handleJavaScriptDialog/);
        assert.match(src, /params: \{ accept: false \}/,
            'it must CANCEL - accepting a confirm() would let a destructive path run');
        assert.match(src, /if \(dialogs\.length\) \{\s*\n\s*return \{ ok: false/,
            'a dialog must fail the run, not be collected and ignored');
        assert.match(src, /native dialog\(s\), which/, 'and the reason must name them');
    });
});
