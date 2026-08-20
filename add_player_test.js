// ============================================================================
// ADD NEW PLAYER — RECURSION REGRESSION
//
// "+ Add New Player" looked like a dead button on a real device. It was not dead:
// it was overflowing the JavaScript stack before a row could render.
//
//   addNewPlayerAndRefresh()
//     -> updateCount()
//        -> refreshMultiGroupMoneyRule()
//           -> handleFormatChange()
//              -> renderPlayerList()
//                 -> updateCount()          ... and round again, unbounded.
//
// refreshMultiGroupMoneyRule() was added so the stake box and the multi-group note
// would follow the group layout as golfers are added. Calling handleFormatChange()
// to do it was the mistake - that function re-renders the entire player list, and
// the list render ends by calling updateCount().
//
// The fix updates ONLY the two controls that depend on group count, and re-enters
// nothing. These tests hold that boundary.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const ADM = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
const fnBody = (name, next) => ADM.slice(ADM.indexOf(`function ${name}`), ADM.indexOf(`function ${next}`));

// A sandbox with the two things a real browser has that the harness stub lacks:
// Element.remove(), and a querySelectorAll that reports player rows.
function setup(rowCount) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    vm.runInContext(`
        var __rows = ${rowCount};
        const _g = document.getElementById;
        document.getElementById = function (id) {
            const el = _g.call(document, id);
            if (el && typeof el.remove !== 'function') el.remove = function () { };
            return el;
        };
        document.querySelectorAll = function (sel) {
            if (sel === '.player-row' || sel === '#player-list .player-row') return new Array(__rows);
            return { forEach() { }, length: 0 };
        };
        document.createElement = function () {
            return { className: '', dataset: {}, style: {}, innerHTML: '',
                querySelector() { return null; },
                querySelectorAll() { return { forEach() { }, length: 0 }; },
                appendChild() { }, remove() { }, addEventListener() { } };
        };
        // Count re-entry into handleFormatChange, and stop runaway recursion before the
        // stack actually overflows so the failure is reportable rather than fatal.
        window.__depth = 0; window.__max = 0;
        const _hfc = handleFormatChange;
        handleFormatChange = function () {
            window.__depth++;
            if (window.__depth > window.__max) window.__max = window.__depth;
            if (window.__depth > 50) { window.__depth--; throw new Error('RECURSION'); }
            try { return _hfc.apply(null, arguments); } finally { window.__depth--; }
        };
    `, sb);
    return sb;
}
const run = (sb, code) => { vm.runInContext(code, sb); };

// ---------------------------------------------------------------------------
describe('THE BUG — updateCount must not re-enter the render cycle', () => {
    [1, 4, 5, 8, 12].forEach(n => {
        test(`updateCount() with ${n} player row(s) does not recurse`, () => {
            const sb = setup(n);
            let threw = null;
            try { run(sb, `updateCount();`); } catch (e) { threw = e.message; }
            assert.equal(threw, null, `updateCount threw: ${threw}`);
            assert.ok(sb.window.__max <= 1,
                `handleFormatChange re-entered ${sb.window.__max} deep — the click would overflow the stack`);
        });
    });

    test('the 4 -> 5 transition, where one group becomes two, is safe', () => {
        // This is the exact moment the bug was most likely to bite: the group count
        // changes, so the money rule genuinely has work to do.
        [4, 5].forEach(n => {
            const sb = setup(n);
            run(sb, `groupSizeOverrides = {}; updateCount();`);
            assert.ok(sb.window.__max <= 1, `${n} players re-entered ${sb.window.__max} deep`);
        });
    });

    test('the group-size stepper does not recurse either', () => {
        // The same helper is called from adjustGroupSize(), which was the second
        // insertion point.
        const sb = setup(8);
        let threw = null;
        try { run(sb, `refreshMultiGroupMoneyRule();`); } catch (e) { threw = e.message; }
        assert.equal(threw, null);
        assert.equal(sb.window.__max, 0, 'it must not call handleFormatChange at all');
    });
});

// ---------------------------------------------------------------------------
describe('THE FIX — narrow, and not a masked exception', () => {
    const fn = fnBody('refreshMultiGroupMoneyRule', 'renderGroupDividers');

    test('it does not call handleFormatChange', () => {
        assert.ok(!/handleFormatChange/.test(fn),
            're-rendering the player list from inside updateCount is what caused the loop');
    });

    test('it does not re-enter any render path', () => {
        ['renderPlayerList', 'updateCount', 'renderGroupDividers', 'addPlayerRow']
            .forEach(f => assert.ok(!new RegExp(f).test(fn), `${f} would close the cycle again`));
    });

    test('the exception was fixed, not swallowed', () => {
        assert.ok(!/try\s*\{/.test(fn), 'a try/catch here would hide a real defect');
        assert.ok(!/catch/.test(fn));
    });

    test('it still does its job — both controls follow the group count', () => {
        assert.ok(/match-settings/.test(fn), 'the stake box');
        assert.ok(/multigroup-action-note/.test(fn), 'the explanation');
        assert.ok(/multiGroupMoneySuppressed\(\)/.test(fn), 'driven by the real rule');
        assert.ok(/\['match', 'bestball', 'scramble', 'ryder'\]/.test(fn),
            'and by the same format list handleFormatChange uses');
    });

    test('the button still points at the function that exists', () => {
        assert.ok(/onclick="addNewPlayerAndRefresh\(\)"/.test(ADM));
        assert.ok(/function addNewPlayerAndRefresh\(\)/.test(ADM));
    });
});

// ---------------------------------------------------------------------------
describe('THE SURROUNDING BEHAVIOUR IS UNCHANGED', () => {
    test('a manual add still uses the ordinary immediate-refresh path', () => {
        const fn = fnBody('addNewPlayerAndRefresh', 'bulkAddPlayers');
        // The bulk-paste work added a deferRefresh flag. A single click rebuilds the
        // list and then calls updateCount() once, which is the immediate path.
        assert.ok(/updateCount\(\);/.test(fn), 'the count must refresh on a manual add');
        assert.ok(/captureCurrentPlayerInputs\(\)/.test(fn), 'existing rows must be preserved');
        assert.ok(/existingData\.push/.test(fn), 'and exactly one row added');
    });

    test('addPlayerRow keeps its defaults so a bare call still works', () => {
        assert.ok(/function addPlayerRow\(name = "", hcp = "", team = "", squad = "red", isNewBtnClick = true, playingForMoney = true, knownTotalCount = null, deferRefresh = false\)/.test(ADM),
            'a plain addPlayerRow() must still add one row with an immediate refresh');
    });

    test('the group model is untouched', () => {
        const sizes = (n, ov) => {
            const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
            vm.runInContext(`window.__s = computeGroupSizes(${n}, ${JSON.stringify(ov)}).length;`, sb);
            return sb.window.__s;
        };
        assert.equal(sizes(4, {}), 1);
        assert.equal(sizes(5, {}), 2);
        assert.equal(sizes(8, {}), 2);
        assert.equal(sizes(12, {}), 3);
        assert.equal(sizes(6, { 0: 6 }), 1);
    });

    test('the multi-group money rule still resolves correctly at each size', () => {
        [[4, false], [5, true], [8, true], [12, true]].forEach(([n, expect]) => {
            const sb = setup(n);
            vm.runInContext(`groupSizeOverrides = {}; loadedLegacyMainStake = false;
                window.__sup = multiGroupMoneySuppressed();`, sb);
            assert.equal(sb.window.__sup, expect, `${n} players`);
        });
    });

    test('bulk paste still has its deferred path', () => {
        assert.ok(/deferRefresh/.test(ADM), 'the bulk optimisation must survive');
        assert.ok(/addPlayerRow\(p\.name, p\.hcp, p\.team, p\.squad, false, p\.playingForMoney !== false, existingData\.length, true\)/.test(ADM),
            'batch rebuilds still pass deferRefresh = true');
    });
});
